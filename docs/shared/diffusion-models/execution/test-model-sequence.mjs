import test from 'node:test';
import assert from 'node:assert/strict';
import {BERNINI_WORKFLOW_RULE_ID,deriveWorkflowShapes} from '../../ai-connection/workflow-shapes.mjs';

const api=await import('./model-sequence.mjs').catch(()=>({}));
const absent=()=>({state:'absent'});
function request(overrides={}){
 const semantics={};for(const role of ['target-latent','source-latent','reference-latent','context-latent'])semantics[role]={meaning:role==='target-latent'?'bernini-generated-model-latent:v1':'wan21-normalized-posterior-mean:v1',normalization:'wan21-comfy-f32-v1'};
 return {ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:81,height:480,width:832},refMaxSize:832,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],temporalRule:'first-then-groups-floor',patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',concatOrder:'target-first',paddingMode:'none'},semantics,media:{sourceVideo:absent(),referenceVideo:absent(),slots:[]},...overrides};
}
function tensorsFor(shapeRequest){
 const shape=deriveWorkflowShapes(shapeRequest),ids=['target.latent',...shape.orderedContexts.entries.map(entry=>entry.contextKey+'.latent')];
 return ids.map((id,n)=>{
  const r=shape.requirements.find(value=>value.requirementId===id),elements=r.shape.reduce((a,b)=>a*b,1),values=Float32Array.from({length:elements},(_,i)=>(i%8191-4095)/8+n*2048);
  return {requirementId:id,shape:r.shape.slice(),dtype:r.dtype,meaning:structuredClone(r.meaning),normalization:structuredClone(r.normalization),data:values};
 });
}
function pixelsLast(patches,rows){
 const head=new Float32Array(rows*64);
 for(let row=0;row<rows;row++)for(let channel=0;channel<16;channel++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)head[row*64+(y*2+x)*16+channel]=patches[row*64+channel*4+y*2+x];
 return head;
}
function make(shapeRequest=request(),tensors=tensorsFor(shapeRequest)){
 assert.equal(typeof api.createModelSequence,'function','Missing canonical model sequence layout owner');
 return api.createModelSequence({shapeRequest,tensors});
}

test('actual 1x16x21x60x104 layout roundtrips every target value through distinct input and head orders',()=>{
 const shapeRequest=request(),tensors=tensorsFor(shapeRequest),sequence=make(shapeRequest,tensors),description=sequence.describe(),output=new Float32Array(2096640);
 assert.deepEqual(description.targetShape,[1,16,21,60,104]);assert.equal(description.targetTokens,32760);assert.equal(description.totalTokens,32760);
 let rowsRead=0,elementsWritten=0;
 for(let start=0;start<description.totalTokens;start+=128){
  const rows=Math.min(128,description.totalTokens-start),patches=sequence.readPatchRows(start,rows);
  for(let row=0;row<rows;row++){const local=start+row,t=Math.floor(local/1560),h=Math.floor(local/52)%30,w=local%52;for(let c=0;c<16;c++)for(let py=0;py<2;py++)for(let px=0;px<2;px++)assert.equal(patches[row*64+c*4+py*2+px],tensors[0].data[((c*21+t)*60+h*2+py)*104+w*2+px]);}
  const write=sequence.writeTargetHeadRows(pixelsLast(patches,rows),start,output);rowsRead+=rows;elementsWritten+=write.writtenElements;
 }
 assert.equal(rowsRead,32760);assert.equal(elementsWritten,2096640);assert.deepEqual(output,tensors[0].data);
 assert.deepEqual([...sequence.readPositions(0,1).positions],[0,0,0]);assert.deepEqual([...sequence.readPositions(32759,1).positions],[20,29,51]);
 assert.deepEqual([...sequence.readPositions(32759,1).sourceIds],[0]);
 assert.equal(description.headProjectionRows,description.totalTokens);assert.equal(description.generationReady,false);assert.equal(description.semanticAdmission,'exact caller-declared metadata matching; producer identity and numerical normalization not authenticated');
});

test('canonical source, reference and each ordered image frame remain separate streams with exact tails and IDs',()=>{
 const shapeRequest=request({target:{batch:1,frames:9,height:32,width:48},refMaxSize:64,media:{sourceVideo:{state:'present',rgb:{frames:10,height:50,width:70}},referenceVideo:{state:'present',rgb:{frames:5,height:32,width:64}},slots:[{slotIndex:5,wired:{state:'present',rgb:{frames:2,height:16,width:32}},editor:absent()},{slotIndex:1,wired:absent(),editor:{state:'present',rgb:{frames:1,height:32,width:16}}}]}});
 const canonical=deriveWorkflowShapes(shapeRequest),tensors=tensorsFor(shapeRequest),sequence=make(shapeRequest,tensors),d=sequence.describe();
 assert.deepEqual(d.streams.map(s=>s.requirementId),['target.latent','source.latent','reference.latent','context:1:0.latent','context:5:0.latent','context:5:1.latent']);
 assert.deepEqual(d.streams.slice(1).map(s=>s.sourceId),canonical.orderedContexts.entries.map(s=>s.sourceId));
 assert.equal(d.totalTokens,canonical.concatenation.totalTokens);
 for(let i=0;i<d.streams.length;i++){
  const stream=d.streams[i],last=stream.tokenRange[1]-1,positions=sequence.readPositions(last,1),grid=stream.tokenGrid;
  assert.deepEqual([...positions.positions],grid.map(v=>v-1));assert.deepEqual([...positions.sourceIds],[i]);
  const first=sequence.readPatchRows(stream.tokenRange[0],1);assert.equal(first[0],tensors[i].data[0]);
 }
 const boundary=d.targetTokens-1,p=sequence.readPositions(boundary,2);assert.deepEqual([...p.sourceIds],[0,1]);assert.deepEqual([...p.positions.slice(3)],[0,0,0]);
 const output=new Float32Array(tensors[0].data.length).fill(-17),start=d.targetTokens-1,head=new Float32Array(Math.min(128,d.totalTokens-start)*64).fill(23);
 const written=sequence.writeTargetHeadRows(head,start,output);assert.equal(written.writtenTargetRows,1);assert.equal(written.writtenElements,64);assert.equal(output.filter(v=>v===23).length,64);
 const before=output.slice();assert.equal(sequence.writeTargetHeadRows(new Float32Array(64),d.totalTokens-1,output).writtenElements,0);assert.deepEqual(output,before);
 const tail=d.totalTokens%128;assert.ok(tail>0);assert.equal(sequence.readPatchRows(d.totalTokens-tail,tail).length,tail*64);assert.equal(sequence.readPositions(d.totalTokens-tail,tail).sourceIds.at(-1),5);
});

test('metadata, exact ordered population and unsupported padding reject before consuming values',()=>{
 const shapeRequest=request({target:{batch:1,frames:1,height:32,width:32}}),base=tensorsFor(shapeRequest);
 for(const change of [t=>t.shape[4]++,t=>t.dtype='F16',t=>t.meaning='raw-posterior-mean',t=>t.normalization='none',t=>t.requirementId='source.latent']){
  const tensors=structuredClone(base);change(tensors[0]);assert.throws(()=>make(shapeRequest,tensors),/shape|dtype|meaning|normalization|order/i);
 }
 const missingSemantics=structuredClone(shapeRequest);delete missingSemantics.semantics['target-latent'];assert.throws(()=>make(missingSemantics,tensorsFor(missingSemantics)),/meaning|normalization|semantic/i);
 for(const legacyOnly of [false,true]){const dual=tensorsFor(shapeRequest);dual[0].values=dual[0].data;if(legacyOnly)delete dual[0].data;assert.throws(()=>make(shapeRequest,dual),/data|values|ambiguous/i);}
 const undefinedValues=tensorsFor(shapeRequest);undefinedValues[0].values=undefined;assert.throws(()=>make(shapeRequest,undefinedValues),/data|values|ambiguous/i);
 const unknown=request({media:{sourceVideo:{state:'unknown'},referenceVideo:absent(),slots:[]}});assert.throws(()=>make(unknown,[]),/complete|population/i);
 const odd=request({target:{batch:1,frames:1,height:24,width:32}});assert.throws(()=>make(odd,tensorsFor(odd)),/padding|odd/i);
 const populated=request({target:{batch:1,frames:1,height:32,width:32},media:{sourceVideo:{state:'present',rgb:{frames:1,height:32,width:32}},referenceVideo:absent(),slots:[]}}),items=tensorsFor(populated);
 assert.throws(()=>make(populated,[items[1],items[0]]),/order/i);assert.throws(()=>make(populated,[items[0],items[1],items[1]]),/population|count|order/i);assert.throws(()=>make(populated,[items[0]]),/population|count|order/i);
 for(const g of [{patchSize:[1,1,4]},{hiddenSize:128},{latentChannels:32},{dtype:'F16'}]){const r=request({geometry:{...shapeRequest.geometry,...g},target:shapeRequest.target});assert.throws(()=>make(r,tensorsFor(r)),/geometry|dtype/i);}
});

test('owned snapshots, finite compact F32 and all row/output boundaries are enforced',()=>{
 const shapeRequest=request({target:{batch:1,frames:1,height:32,width:32}}),tensors=tensorsFor(shapeRequest),sequence=make(shapeRequest,tensors),first=sequence.readPatchRows(0,1);tensors[0].data.fill(900);assert.deepEqual(sequence.readPatchRows(0,1),first);first.fill(901);assert.notEqual(sequence.readPatchRows(0,1)[0],901);
 const d=sequence.describe();d.streams[0].tokenGrid[0]=900;assert.equal(sequence.describe().streams[0].tokenGrid[0],1);
 for(const pair of [[-1,1],[0,0],[0,129],[3,2],[0,1.5],[NaN,1]]){assert.throws(()=>sequence.readPatchRows(...pair),/range|rows/i);assert.throws(()=>sequence.readPositions(...pair),/range|rows/i);}
 for(const values of [new Float32Array(255),new Float64Array(256),new Float32Array(257).subarray(1),new Float32Array(256).fill(NaN)]){const t=tensorsFor(shapeRequest);t[0].data=values;assert.throws(()=>make(shapeRequest,t),/F32|finite|compact/i);}
 if(typeof SharedArrayBuffer==='function'){const t=tensorsFor(shapeRequest);t[0].data=new Float32Array(new SharedArrayBuffer(1024));assert.throws(()=>make(shapeRequest,t),/F32|nonshared/i);}
 const output=new Float32Array(256).fill(7),before=output.slice();
 for(const [head,start,out]of [[new Float32Array(63),0,output],[new Float32Array(64),4,output],[new Float32Array(64).fill(Infinity),0,output],[new Float32Array(64),0,new Float32Array(255)]])assert.throws(()=>sequence.writeTargetHeadRows(head,start,out),/F32|finite|compact|range|rows|shape/i);
 assert.deepEqual(output,before);
 sequence.dispose();assert.throws(()=>sequence.readPatchRows(0,1),/disposed/);assert.throws(()=>sequence.describe(),/disposed/);
});

test('sparse and forged shape or axes arrays cannot bypass exact canonical dimensions',()=>{
 const shapeRequest=request({target:{batch:1,frames:1,height:32,width:32}});
 for(const key of ['shape','axes']){
  const sparse=tensorsFor(shapeRequest);sparse[0][key]=Array(5);assert.throws(()=>make(shapeRequest,sparse),/shape|axes/i);
  const forged=tensorsFor(shapeRequest);forged[0][key]=key==='shape'?[1,16,1,4,5]:['N','C','T','W','H'];forged[0][key].every=()=>true;assert.throws(()=>make(shapeRequest,forged),/shape|axes/i);
  const getter=tensorsFor(shapeRequest),value=key==='shape'?[1,16,1,4,4]:['N','C','T','H','W'];let reads=0;Object.defineProperty(value,0,{get(){reads++;return key==='shape'?1:'N';}});getter[0][key]=value;assert.throws(()=>make(shapeRequest,getter),/shape|axes/i);assert.equal(reads,0);
 }
});

test('canonical and actual semantics require acyclic plain data and never invoke metadata accessors',()=>{
 const baseRequest=request({target:{batch:1,frames:1,height:32,width:32}});
 for(const value of [new Map([['id','a']]),new Date(1),new Set(['a']),new ArrayBuffer(4),{nested:Infinity},{nested:undefined},Array(1)]){
  const shapeRequest=structuredClone(baseRequest);shapeRequest.semantics['target-latent'].normalization=value;
  assert.throws(()=>make(shapeRequest,tensorsFor(shapeRequest)),/metadata|plain|acyclic|finite/i);
  const tensors=tensorsFor(baseRequest);tensors[0].normalization=value;assert.throws(()=>make(baseRequest,tensors),/metadata|plain|acyclic|finite|normalization/i);
 }
 const circular={};circular.self=circular;const cycleRequest=structuredClone(baseRequest);cycleRequest.semantics['target-latent'].normalization=circular;assert.throws(()=>make(cycleRequest,tensorsFor(cycleRequest)),/metadata|plain|acyclic/i);
 const objectRequest=structuredClone(baseRequest);objectRequest.semantics['target-latent'].normalization={id:'normalization',version:1,flags:[true,false,null]};
 const reordered=tensorsFor(objectRequest);reordered[0].normalization={flags:[true,false,null],version:1,id:'normalization'};make(objectRequest,reordered).dispose();
 const actualSymbol=tensorsFor(objectRequest);actualSymbol[0].normalization[Symbol('hidden')]='different';assert.throws(()=>make(objectRequest,actualSymbol),/metadata|plain|symbol/i);
 const canonicalSymbol=structuredClone(objectRequest);canonicalSymbol.semantics['target-latent'].normalization[Symbol('hidden')]='different';assert.throws(()=>make(canonicalSymbol,tensorsFor(canonicalSymbol)),/metadata|plain|symbol/i);
 let canonicalReads=0;const canonicalGetter=structuredClone(baseRequest);Object.defineProperty(canonicalGetter.semantics['target-latent'],'meaning',{get(){canonicalReads++;return baseRequest.semantics['target-latent'].meaning;},enumerable:true});assert.throws(()=>make(canonicalGetter,tensorsFor(baseRequest)),/metadata|plain|accessor/i);assert.equal(canonicalReads,0);
 let actualReads=0;const actualGetter=tensorsFor(baseRequest);Object.defineProperty(actualGetter[0],'meaning',{get(){actualReads++;return baseRequest.semantics['target-latent'].meaning;},enumerable:true});assert.throws(()=>make(baseRequest,actualGetter),/metadata|plain|accessor/i);assert.equal(actualReads,0);
});

test('semantic array lengths and enumerable indices must match exact plain metadata',()=>{
 const shapeRequest=request({target:{batch:1,frames:1,height:32,width:32}});shapeRequest.semantics['target-latent'].normalization=[];
 const hidden=tensorsFor(shapeRequest);hidden[0].normalization=[99];Object.defineProperty(hidden[0].normalization,0,{enumerable:false});assert.throws(()=>make(shapeRequest,hidden),/metadata|plain|enumerable/i);
 for(const actual of [[99],[99,100]]){const tensors=tensorsFor(shapeRequest);tensors[0].normalization=actual;assert.throws(()=>make(shapeRequest,tensors),/normalization|metadata/i);}
 const differentLength=structuredClone(shapeRequest);differentLength.semantics['target-latent'].normalization=[99];const tensors=tensorsFor(differentLength);tensors[0].normalization=[];assert.throws(()=>make(differentLength,tensors),/normalization|metadata/i);
});

test('shape request semantics must be own validated metadata rather than inherited declarations',()=>{
 const base=request({target:{batch:1,frames:1,height:32,width:32}}),semantics=structuredClone(base.semantics);semantics['target-latent'].normalization=new Map([['id','unvalidated']]);
 const shapeRequest=Object.assign(Object.create({semantics}),base);delete shapeRequest.semantics;const tensors=tensorsFor(base);tensors[0].normalization={};assert.throws(()=>make(shapeRequest,tensors),/metadata|own|semantics/i);
});

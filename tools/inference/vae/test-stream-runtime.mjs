// These helper/double tests verify orchestration and data movement, not VAE NN accuracy.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
let api;
try{api=await import('../../../docs/shared/inference/vae-stream.mjs');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
assert.equal(typeof api?.runStreamVae,'function','Native causal streaming runtime is missing');
const MODEL='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b';
const digest=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const same=(a,b)=>assert.deepEqual(a,b);
const files=new Map(),assets={};
async function asset(id,meta,bytes=new TextEncoder().encode(id)){
 files.set(id+'.onnx',bytes);assets[id]={...meta,file:id+'.onnx',bytes:bytes.length,sha256:await digest(bytes)};
}
function unit(id,kind,ci,co){return {op:'unit',asset:id,kind,channelsIn:ci,channelsOut:co,...(kind==='causal'?{cache:id}:{})};}
function resample(mode,id){return{op:'resample',mode,spatial:id+'s',...(mode.endsWith('3d')?{temporal:id+'t',cache:id+'t'}:{})};}
for(const [id,kind,ci,co] of [['enc','causal',3,16],['dec','causal',16,3],['body','pointwise',16,16],['d0s','spatial',16,16],['d1s','spatial',16,16],['d2s','spatial',16,16],['d1t','temporalDown',16,16],['d2t','temporalDown',16,16],['u0s','spatial',16,16],['u1s','spatial',16,16],['u2s','spatial',16,16],['u0t','temporalUp',16,16],['u1t','temporalUp',16,16]]){
 const history=kind==='causal'||kind==='temporalUp'?2:kind==='temporalDown'?1:0;
 await asset(id,{kind,channelsIn:ci,channelsOut:co,inputFrames:kind==='temporalDown'?2:1,inputNames:history?['input','history']:['input'],outputNames:history?['output','historyOutput']:['output'],...(history?{historyFrames:history}:{})});
}
await asset('residualAdd',{kind:'add',inputNames:['input','shortcut'],outputNames:['output'],inputFrames:1});
const w=new Float32Array(256);for(let c=0;c<16;c++)w[c*16+c]=1;
await asset('conv2Weight',{shape:[16,16]},new Uint8Array(w.buffer));
await asset('conv2Bias',{shape:[16]},new Uint8Array(new Float32Array(16).buffer));
const manifest={schemaVersion:1,kind:'wan21-vae-stream-v1',model:{sha256:MODEL,storedDtype:'bfloat16',executionDtype:'float32'},profile:{id:'helper-only',layout:'NCTHW',latentSpace:'raw',posterior:'mean',opset:17},domain:{maxSourceFrames:81,minSpatial:16,maxSpatial:848,spatialStride:16},inference:{executionProvider:'wasm',threads:1,graphOptimizationLevel:'disabled'},assets,programs:{encode:[unit('enc','causal',3,16),{op:'residual',shortcut:[],body:[unit('body','pointwise',16,16)]},resample('downsample2d','d0'),resample('downsample3d','d1'),resample('downsample3d','d2'),{op:'mean',channels:16}],decode:[resample('upsample3d','u0'),resample('upsample3d','u1'),resample('upsample2d','u2'),unit('dec','causal',16,3)]}};
same(api.requiredStreamAssets(manifest,'encode'),['enc','residualAdd','body','d0s','d1s','d1t','d2s','d2t']);
same(api.requiredStreamAssets(manifest,'decode'),['conv2Weight','conv2Bias','u0s','u0t','u1s','u1t','u2s','dec']);
function tensor(frames,{decode=false,meaning=decode?api.RAW_LATENT:'raw-decoder-rgb',height=16,width=16}={}){
 const shape=[1,decode?16:3,frames,decode?height/8:height,decode?width/8:width],data=new Float32Array(shape.reduce((a,b)=>a*b,1));
 for(let c=0;c<shape[1];c++)for(let t=0;t<frames;t++)data.fill((c+1)*.01+t*.001,(c*frames+t)*shape[3]*shape[4],(c*frames+t+1)*shape[3]*shape[4]);
 return {dtype:'float32',layout:'NCTHW',meaning,shape,data};
}
for(const [source,latent,consumed] of [[1,1,1],[4,1,1],[5,2,5],[80,20,77],[81,21,81]]){
 const r=api.validateStreamDescriptor({operation:'encode',tensor:tensor(source),manifest});
 same(r.outputShape,[1,16,latent,2,2]);assert.equal(r.processing.consumedFrames,consumed);assert.equal(r.processing.ignoredTailFrames,source-consumed);
}
for(const [height,width] of [[16,848],[480,832],[848,16]])same(api.validateStreamDescriptor({operation:'encode',tensor:{dtype:'float32',layout:'NCTHW',meaning:'rgb-unit',shape:[1,3,81,height,width]},manifest}).outputShape,[1,16,21,height/8,width/8]);
for(const height of [8,17,856])assert.throws(()=>api.validateStreamDescriptor({operation:'encode',tensor:tensor(1,{height}),manifest}));
assert.throws(()=>api.validateStreamDescriptor({operation:'decode',tensor:{...tensor(2,{decode:true}),normalization:'wan21-comfy-f32-v1'},manifest}));
assert.throws(()=>api.validateStreamDescriptor({operation:'decode',tensor:{...tensor(2,{decode:true}),modelSha256:'f'.repeat(64)},manifest}));
const context={schemaVersion:1,contextId:'context',inputId:'video',inputSha256:'a'.repeat(64),slotId:'input',sourceFrameIndices:[10,11,12,13],sourceFrameTimesSeconds:[0,.1,.2,.3]};
const request=api.validateStreamDescriptor({operation:'encode',tensor:{...tensor(4),context},manifest});
assert.equal(request.metadata.context.sourceFrameIndices.length,4);
console.log('PASS: streaming descriptor native floor, dynamic domain, and raw meaning validation');

// Deliberately tiny arithmetic doubles exercise the host's channel/time copies.
// They have no learned weights and are never numerical evidence for the NN.
function makeOrt({badMetadata=false,badHistory=false,throwRun=false,throwSecondTensor=false,abortCreate,realAdd,pinnedCpu=false,sharedOutput=false,subviewOutput=false,nonfinite=false}={}){
 const stats={created:0,released:0,live:0,maxLive:0,runs:0,inputs:0,disposedInputs:0,outputs:0,disposedOutputs:0,borrowedOutputInputs:0};
 const outputArrays=new WeakSet();
 let constructors=0;
 class Tensor{constructor(type,data,dims){if(throwSecondTensor&&++constructors===2)throw Error('helper tensor failed');Object.assign(this,{type,data,dims});stats.inputs++;if(outputArrays.has(data))stats.borrowedOutputInputs++;}dispose(){stats.disposedInputs++;}}
 function output(data,dims){stats.outputs++;if(sharedOutput){const shared=new Float32Array(new SharedArrayBuffer(data.byteLength));shared.set(data);data=shared;}else if(subviewOutput){const view=new Float32Array(new ArrayBuffer(data.byteLength+8),4,data.length);view.set(data);data=view;}outputArrays.add(data);return{type:'float32',data,dims,...(pinnedCpu?{location:'cpu'}:{}),dispose(){stats.disposedOutputs++;if(sharedOutput||subviewOutput)data.fill(NaN);this.data=undefined;}};}
 const ort={env:{wasm:{numThreads:1},...(pinnedCpu?{versions:{web:'1.24.3'}}:{})},Tensor,InferenceSession:{create:async bytes=>{
  const id=new TextDecoder().decode(bytes),a=assets[id];assert.ok(a,'Unknown helper asset');
  stats.created++;stats.live++;stats.maxLive=Math.max(stats.maxLive,stats.live);assert.equal(stats.live,1);
  if(abortCreate)abortCreate.abort();
  if(id==='residualAdd'&&realAdd){
   const session=await realAdd();return{inputMetadata:session.inputMetadata,outputMetadata:session.outputMetadata,run:async feeds=>{
    stats.runs++;const input=new actualOrt.Tensor('float32',feeds.input.data,feeds.input.dims),shortcut=new actualOrt.Tensor('float32',feeds.shortcut.data,feeds.shortcut.dims);
    try{const values=await session.run({input,shortcut});const value=values.output,result=output(new Float32Array(value.data),[...value.dims]);value.dispose();return {output:result};}finally{input.dispose();shortcut.dispose();}
   },release:async()=>{await session.release();stats.released++;stats.live--;}};
  }
  const spatial=a.kind==='spatial',dims=spatial?[1,a.channelsIn,'h','w']:[1,a.channelsIn??'channels',a.inputFrames,'h','w'];
  const out=spatial?[1,a.channelsOut,'oh','ow']:[1,a.channelsOut??'channels',a.kind==='temporalUp'?2:1,'h','w'];
  const history=[1,a.channelsIn,a.historyFrames,'h','w'];
  const inputMetadata=a.inputNames.map((name,i)=>({name,type:'float32',shape:i===0?dims:name==='history'?history:dims}));
  const outputMetadata=a.outputNames.map((name,i)=>({name,type:'float32',shape:i===0?out:history}));
  if(badMetadata)inputMetadata[0].shape=[1,999,...dims.slice(2)];
  return{inputMetadata,outputMetadata,run:async feeds=>{
   stats.runs++;if(throwRun)throw Error('helper run failed');
   const x=feeds.input,[,ci,...rest]=x.dims,t=spatial?1:rest[0],h=x.dims.at(-2),w=x.dims.at(-1),scale=spatial?(id.startsWith('u')?2:.5):1,co=a.channelsOut??ci,ot=a.kind==='temporalUp'?2:a.kind==='temporalDown'?1:t,oh=h*scale,ow=w*scale;
   const y=new Float32Array(co*ot*oh*ow),historyInput=feeds.history;
   const at=(v,c,frame,row,col)=>v.data[(c*v.dims[2]+frame)*h*w+row*w+col];
   for(let c=0;c<co;c++)for(let frame=0;frame<ot;frame++)for(let row=0;row<oh;row++)for(let col=0;col<ow;col++){
    const ic=c%ci,r=Math.floor(row/scale),q=Math.floor(col/scale);let value;
    if(spatial)value=x.data[ic*h*w+r*w+q];
    else if(a.kind==='causal')value=at(x,ic,0,r,q)*2+at(historyInput,ic,1,r,q);
    else if(a.kind==='temporalDown')value=at(x,ic,0,r,q)+at(x,ic,1,r,q)+at(historyInput,ic,0,r,q);
    else if(a.kind==='temporalUp')value=at(x,ic,0,r,q)+at(historyInput,ic,frame,r,q);
    else if(a.kind==='add')value=at(x,ic,frame,r,q)+at(feeds.shortcut,ic,frame,r,q);
    else value=at(x,ic,frame,r,q);
    y[(c*ot+frame)*oh*ow+row*ow+col]=value;
   }
   if(nonfinite)y.fill(NaN);
   const result={output:output(y,spatial?[1,co,oh,ow]:[1,co,ot,oh,ow])};
   if(a.historyFrames){
    const hd=new Float32Array(ci*a.historyFrames*h*w);
    for(let c=0;c<ci;c++)for(let f=0;f<a.historyFrames;f++)for(let p=0;p<h*w;p++){
     const from=a.kind==='temporalDown'?x.data[(c*t+t-1)*h*w+p]:f===0?historyInput.data[(c*a.historyFrames+a.historyFrames-1)*h*w+p]:x.data[c*t*h*w+p]*(a.kind==='causal'?2:1);
     hd[(c*a.historyFrames+f)*h*w+p]=from;
    }
    result.historyOutput=output(hd,[1,ci,badHistory?a.historyFrames+1:a.historyFrames,h,w]);
   }
   return result;
  },release:async()=>{stats.released++;stats.live--;}};
 }}};
 return {ort,stats};
}
const {createHike}=await import('../../../docs/shared/inference/hike.mjs');
const hike=await createHike(await fs.readFile(new URL('../../../docs/shared/inference/kernel/tensor.wasm',import.meta.url)));
async function run(input,options={}){
 const {ort,stats}=makeOrt(options),result=await api.runStreamVae({operation:input.shape[1]===3?'encode':'decode',tensor:input,manifest,files,ort,hike,diagnostics:true,...options});
 assert.equal(stats.live,0);assert.equal(stats.maxLive,1);assert.equal(stats.created,stats.released);assert.equal(stats.inputs,stats.disposedInputs);assert.equal(stats.outputs,stats.disposedOutputs);return {result,stats};
}
const one=await run({...tensor(1),context:{...context,sourceFrameIndices:[10],sourceFrameTimesSeconds:[0]}});
assert.equal(one.result.evidence.maxHostHistoryBytes,0);assert.equal(one.result.evidence.historyCopies,0);
for(let c=0;c<16;c++)assert.ok(Math.abs(one.result.tensor.data[c*4]-.04*(1+c%3))<1e-6);
const fourInput={...tensor(4),context},four=await run(fourInput);
same(four.result.tensor.data,one.result.tensor.data);same(four.result.tensor.context.sourceFrameIndices,[10]);same(four.result.inputDescriptor.context.sourceFrameIndices,[10,11,12,13]);
const five=await run(tensor(5));
for(let c=0;c<16;c++){
 assert.ok(Math.abs(five.result.tensor.data[c*8]-.04*(1+c%3))<1e-6);
 assert.ok(Math.abs(five.result.tensor.data[c*8+4]-(.48*(1+c%3)+.076))<1e-6,'Continuation must preserve native down history and per-channel time order');
}
const adopted=await run(tensor(5),{pinnedCpu:true});same(adopted.result.tensor.data,five.result.tensor.data);
assert.ok(adopted.stats.borrowedOutputInputs>0,'Owned pinned CPU outputs should feed subsequent units directly, including retained histories');
assert.equal(adopted.result.evidence.hostOutputCopiedBytes,0,'Per-frame pinned CPU outputs should not be cloned or scattered between units');
assert.equal(adopted.result.evidence.hostHistoryCopiedBytes,0,'Pinned CPU history arrays should remain owned after wrapper disposal');
assert.ok(adopted.result.evidence.temporalPackBytes>0,'Temporal downsampling alone packs frame pairs');
const shared=await run(tensor(5),{pinnedCpu:true,sharedOutput:true});same(shared.result.tensor.data,five.result.tensor.data);
assert.equal(shared.stats.borrowedOutputInputs,0,'Shared WASM-like views must not be retained after Tensor.dispose');
assert.ok(shared.result.evidence.hostOutputCopiedBytes>0);
const subview=await run(tensor(5),{pinnedCpu:true,subviewOutput:true});same(subview.result.tensor.data,five.result.tensor.data);
assert.equal(subview.stats.borrowedOutputInputs,0,'Subview outputs retain no borrowed backing storage');
assert.ok(subview.result.evidence.hostHistoryCopiedBytes>0);
assert.equal(adopted.result.evidence.finalFiniteScannedValues,adopted.result.tensor.data.length);
await assert.rejects(run(tensor(1),{pinnedCpu:true,nonfinite:true}),/Nonfinite/);
same((await run(tensor(5))).result.tensor.data,five.result.tensor.data);
const eighty=await run(tensor(80)),eightyOne=await run(tensor(81));
for(let c=0;c<16;c++)same(eighty.result.tensor.data.subarray(c*20*4,(c+1)*20*4),eightyOne.result.tensor.data.subarray(c*21*4,c*21*4+20*4));
const raw={...tensor(2,{decode:true}),context:{...context,sourceFrameIndices:[10,14,18],sourceFrameTimesSeconds:[0,.4,.8]}};
const decoded=await run(raw);same(decoded.result.tensor.shape,[1,3,5,16,16]);same(decoded.result.tensor.context,raw.context);
for(let c=0;c<3;c++){
 const a=.01*(c+1),b=a+.001,expected=[2*a,2*b+2*a,4*b,4*b,6*b];
 for(let t=0;t<5;t++)assert.ok(Math.abs(decoded.result.tensor.data[(c*5+t)*256]-expected[t])<1e-6,'Decode frame interleave and Hike channel projection');
}
const unitInput=tensor(5,{meaning:'rgb-unit'});for(let i=0;i<unitInput.data.length;i++)unitInput.data[i]=(unitInput.data[i]+1)/2;
const unitEncoded=await run(unitInput);for(let i=0;i<five.result.tensor.data.length;i++)assert.ok(Math.abs(unitEncoded.result.tensor.data[i]-five.result.tensor.data[i])<1e-5);
assert.ok(unitEncoded.result.evidence.hikeCalls>0);
for(const options of [{badMetadata:true},{badHistory:true},{throwRun:true}]){
 const {ort,stats}=makeOrt(options);await assert.rejects(api.runStreamVae({operation:'encode',tensor:tensor(1),manifest,files,ort,hike}));
 assert.equal(stats.live,0);assert.equal(stats.created,stats.released);assert.equal(stats.inputs,stats.disposedInputs);assert.equal(stats.outputs,stats.disposedOutputs);
}
const constructorFailure=makeOrt({throwSecondTensor:true});
await assert.rejects(api.runStreamVae({operation:'encode',tensor:tensor(1),manifest,files,ort:constructorFailure.ort,hike}),/helper tensor failed/);
assert.equal(constructorFailure.stats.disposedInputs,1,'Already constructed inputs must be disposed if a later constructor fails');assert.equal(constructorFailure.stats.live,0);
const mutableFiles=new Map(files),mutableBytes=new Uint8Array(files.get(assets.enc.file));mutableFiles.set(assets.enc.file,mutableBytes);
await api.runStreamVae({operation:'encode',tensor:tensor(1),manifest,files:mutableFiles,ort:makeOrt().ort,hike,onProgress:p=>{if(p.phase==='creating-session'&&p.asset==='enc')mutableBytes.fill(0);}});
const controller=new AbortController(),cancelled=makeOrt({abortCreate:controller});
await assert.rejects(api.runStreamVae({operation:'encode',tensor:tensor(1),manifest,files,ort:cancelled.ort,hike,signal:controller.signal}),{name:'AbortError'});
assert.equal(cancelled.stats.runs,0);assert.equal(cancelled.stats.live,0);
const corruptFiles=new Map(files);corruptFiles.set(assets.enc.file,new Uint8Array(assets.enc.bytes));const corrupt=makeOrt();
await assert.rejects(api.runStreamVae({operation:'encode',tensor:tensor(1),manifest,files:corruptFiles,ort:corrupt.ort,hike}),/hash mismatch/);assert.equal(corrupt.stats.created,0);
const normal=await api.runStreamVae({operation:'encode',tensor:tensor(1),manifest,files,ort:makeOrt().ort,hike});assert.equal(normal.evidence,undefined);
console.log('PASS: helper doubles NCTHW gathers/scatters, native first/continuation states, raw decode, cancellation, hash/static/output checks, one-session cleanup, no still-image history retention (not NN evidence)');

// One genuine, tiny ORT WASM Add graph verifies residual arithmetic ownership.
// Encode the small ONNX protobuf directly so this test needs no Python packages.
function variable(n){const out=[];do{let b=n%128;n=Math.floor(n/128);out.push(b|(n?128:0));}while(n);return out;}
function int(field,n){return [...variable(field*8),...variable(n)];}
function bytes(field,b){return [...variable(field*8+2),...variable(b.length),...b];}
function str(field,s){return bytes(field,new TextEncoder().encode(s));}
function info(name){const dims=[1,'channels',1,'height','width'].flatMap(d=>bytes(1,typeof d==='number'?int(1,d):str(2,d)));return [...str(1,name),...bytes(2,bytes(1,[...int(1,1),...bytes(2,dims)]))];}
const node=[...str(1,'input'),...str(1,'shortcut'),...str(2,'output'),...str(4,'Add')];
const graph=[...bytes(1,node),...str(2,'helper-residual-add'),...bytes(11,info('input')),...bytes(11,info('shortcut')),...bytes(12,info('output'))];
const addBytes=Uint8Array.from([...int(1,8),...str(2,'stream-runtime-helper-test'),...bytes(7,graph),...bytes(8,int(2,17))]);
const actualOrt=await import('../../../docs/shared/inference/vendor/ort.wasm.min.mjs');actualOrt.env.wasm.numThreads=1;actualOrt.env.wasm.proxy=false;
let realRuns=0;
const realAdd=async()=>{const session=await actualOrt.InferenceSession.create(addBytes,{executionProviders:['wasm'],graphOptimizationLevel:'disabled'});return{inputMetadata:session.inputMetadata,outputMetadata:session.outputMetadata,run:async feeds=>{realRuns++;return session.run(feeds);},release:()=>session.release()};};
const actualAddition=await run(tensor(5),{realAdd});same(actualAddition.result.tensor.data,five.result.tensor.data);assert.equal(realRuns,5);
const adoptedAddition=await run(tensor(5),{realAdd,pinnedCpu:true});same(adoptedAddition.result.tensor.data,five.result.tensor.data);assert.equal(realRuns,10);
assert.ok(adoptedAddition.stats.borrowedOutputInputs>0);
hike.dispose();
console.log('PASS: real ORT WASM helper graph performs residual additions inside the streaming interpreter (not NN evidence)');

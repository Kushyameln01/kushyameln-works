import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBerniniModelCandidate,MODEL_CANDIDATE_LIMITS} from './model-candidate.mjs';
import {MODEL_WEIGHT_SCHEMA,MODEL_WEIGHT_PROFILE} from './model-weights.mjs';
import {BERNINI_TARGETS,TARGET_PROVENANCE} from '../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';
import {P4_INPUT_SEMANTICS} from './capabilities.mjs';
import {deriveWorkflowShapes,BERNINI_WORKFLOW_RULE_ID} from '../../ai-connection/workflow-shapes.mjs';

// These doubles admit metadata and exercise rejection/cancellation only. No
// synthetic prediction or numerical full-model execution is produced here.
function fixture(){
 const pinned=TARGET_PROVENANCE.models.find(model=>model.name.includes('LOW'));
 const entries=Object.fromEntries(BERNINI_TARGETS.map(target=>{
  const matrix=target.key.endsWith('.weight')&&target.shape.length>=2,columns=matrix?target.shape.slice(1).reduce((a,b)=>a*b,1):null;
  return [target.key,{fullShape:[...target.shape],computeDtype:'F32',storageDtype:'F16',columns,...(matrix?{maxRows:Math.min(16,Math.floor(81920/columns))}:{})}];
 }));
 const description={schemaVersion:MODEL_WEIGHT_SCHEMA,executionProfileId:MODEL_WEIGHT_PROFILE,side:'LOW',modelHash:BASE_MODEL_HASHES.LOW,headerSHA256:pinned.headerSHA256,fileBytes:pinned.fileBytes,pinnedCoreCommit:TARGET_PROVENANCE.pinnedComfyCommit,blockCount:40,targetCount:1095,entries};
 const reads=[],disposed=[];let pending;
 const source={describe:()=>structuredClone(description),async readRows(key,start,count,options){reads.push({key,start,count});if(pending){const wait=pending;pending=null;await wait.promise;options.signal?.throwIfAborted();}throw Error('Admission test must not execute a numeric model');},async readVector(){throw Error('Admission test must not execute a numeric model');},dispose(){disposed.push('source');}};
 const math=Object.fromEntries(['layerNorm','affineNorm','rmsNorm','modulate','gateResidual','add','gelu','silu','bias','sinusoidal','rope','divideAttention'].map(key=>[key,()=>{throw Error('Admission test must not execute model math');}]));
 math.dispose=()=>disposed.push('math');
 const ops={async linear(){throw Error('Admission test must not execute a linear');},async attentionTile(){throw Error('Admission test must not execute attention');},dispose(){disposed.push('ops');}};
 return {source,math,ops,description,entries,reads,disposed,hold(){let release;const promise=new Promise(resolve=>{release=resolve;});pending={promise};return release;}};
}
function input(){
 const absent=()=>({state:'absent'}),semantics={};
 for(const role of ['target-latent','source-latent','reference-latent','context-latent'])semantics[role]={meaning:role==='target-latent'?'bernini-generated-model-latent:v1':'wan21-normalized-posterior-mean:v1',normalization:'wan21-comfy-f32-v1'};
 const shapeRequest={ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:1,height:16,width:32},refMaxSize:32,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],temporalRule:'first-then-groups-floor',patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',concatOrder:'target-first',paddingMode:'none'},semantics,media:{sourceVideo:absent(),referenceVideo:absent(),slots:[]}};
 const canonical=deriveWorkflowShapes(shapeRequest),requirement=canonical.requirements.find(item=>item.requirementId==='target.latent'),tensors=[{requirementId:requirement.requirementId,shape:[...requirement.shape],dtype:requirement.dtype,meaning:requirement.meaning,normalization:requirement.normalization,data:new Float32Array(requirement.shape.reduce((a,b)=>a*b,1))}];
 return {shapeRequest,tensors,timestep:500,conditioning:{...structuredClone(P4_INPUT_SEMANTICS.conditioning),shape:[1,1,4096],data:new Float32Array(4096),attentionMask:new Uint8Array([1])}};
}
test('candidate describes full40 experimental graph and keeps caller dependencies owned by caller',async()=>{
 const f=fixture(),candidate=await createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops});
 const description=candidate.describe();assert.equal(description.experimental,true);assert.equal(description.acceptedProduction,false);assert.equal(description.publicRuntimeEnabled,false);assert.equal(description.generationReady,false);assert.equal(description.limits.blocks,40);assert.equal(description.output.meaning,'bernini-flow-velocity:v1');assert.equal(description.output.space,'model');assert.match(description.requiredShapeAcceptance,/BLOCKED/);assert.equal(MODEL_CANDIDATE_LIMITS.maxStageWeightCacheBytes,2*5120*13824*4);
 await candidate.dispose();await candidate.dispose();assert.deepEqual(f.disposed,[]);assert.equal(candidate.stats().disposed,true);assert.throws(()=>candidate.describe(),/disposed/);await assert.rejects(candidate.predict(input()),/disposed/);assert.deepEqual(f.reads,[]);
});
test('source admission rejects incomplete targets, altered identity and shape forgeries before reading values',async()=>{
 for(const mutate of [d=>d.modelHash='0'.repeat(64),d=>d.side='HIGH',d=>d.headerSHA256='0'.repeat(64),d=>d.fileBytes--,d=>d.pinnedCoreCommit='other',d=>d.blockCount=39,d=>delete d.entries['blocks.39.ffn.2.weight'],d=>d.entries['blocks.39.ffn.2.weight'].fullShape=[5120,5120],d=>d.entries['blocks.39.ffn.2.weight'].fullShape=Array(2),d=>d.entries['blocks.39.ffn.2.weight'].maxRows=17]){
  const f=fixture();mutate(f.description);await assert.rejects(createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops}),/identity|targets|shape|range/);assert.deepEqual(f.reads,[]);assert.deepEqual(f.disposed,[]);
 }
});
test('candidate rejects predictor substitutions and native math without denominator division',async()=>{
 const f=fixture();await assert.rejects(createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops,predictor:()=>new Float32Array(128)}),/Unknown/);
 const math={...f.math};delete math.divideAttention;await assert.rejects(createBerniniModelCandidate({source:f.source,math,ops:f.ops}),/divideAttention/);
 await assert.rejects(createBerniniModelCandidate({source:f.source,file:new Blob(),math:f.math,ops:f.ops}),/not both/);assert.deepEqual(f.reads,[]);
 for(const decoder of ['other',null,1])await assert.rejects(createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops,decoder}),/decoder|not both/);
 await assert.rejects(createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops,decoder:'lookup'}),/not both/);
 await assert.rejects(createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops,decoder:'legacy',lookupBytes:new Uint8Array([0])}),/decoder/);
});
test('preparation snapshots operator bytes before its first asynchronous hash/compile',async()=>{
 const f=fixture(),wasm=new Uint8Array(await readFile(new URL('./model-math/kernel.wasm',import.meta.url))),options={source:f.source,ops:f.ops,mathWasmBytes:wasm};
 const pending=createBerniniModelCandidate(options);wasm.fill(0);options.mathWasmBytes=new Uint8Array([0]);
 const candidate=await pending;assert.equal(candidate.stats().math.calls,0);assert.equal(candidate.describe().acceptedProduction,false);await candidate.dispose();assert.deepEqual(f.reads,[]);assert.deepEqual(f.disposed,[]);
});
test('native Text, timestep and canonical latent semantics reject before weight or numeric operator access',async()=>{
 const f=fixture(),candidate=await createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops});
 try{
  for(const change of [x=>x.timestep=1001,x=>x.timestep=NaN,x=>x.onProgress=1,x=>x.conditioning.normalization='none',x=>delete x.conditioning.modelSha256,x=>delete x.conditioning.tokenizerSha256,x=>x.conditioning.attentionMask[0]=0,x=>x.conditioning.data[0]=NaN,x=>x.tensors[0].normalization='none',x=>x.shapeRequest.semantics['target-latent'].meaning=x.tensors[0].meaning='raw-posterior-mean',x=>x.tensors[0].data=new Float64Array(128),x=>x.predictor=()=>{},x=>x.onTrace=()=>{}]){
   const x=input();change(x);await assert.rejects(candidate.predict(x),/Timestep|onProgress|normalization|identity|tokenizer|mask|finite|normalization|semantics|F32|Unknown/);
  }
  assert.deepEqual(f.reads,[]);assert.equal(candidate.stats().predictions,0);assert.equal(candidate.stats().busy,false);assert.equal(candidate.stats().activeHiddenStores,0);
 }finally{await candidate.dispose();}
});
test('cancelled weight loading releases ownership and never returns a partial velocity',async()=>{
 const f=fixture();f.math.sinusoidal=()=>new Float32Array(256);const candidate=await createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops}),controller=new AbortController(),release=f.hold();
 const pending=candidate.predict({...input(),signal:controller.signal});await Promise.resolve();
 await assert.rejects(candidate.predict(input()),/busy/);const disposing=candidate.dispose();assert.equal(candidate.stats().closing,true);controller.abort();release();await assert.rejects(pending,{name:'AbortError'});await disposing;
 assert.equal(f.reads[0].key,'time_embedding.0.weight');assert.equal(candidate.stats().stageWeightCacheBytes,0);assert.equal(candidate.stats().activeHiddenStores,0);assert.equal(candidate.stats().predictions,0);assert.equal(candidate.stats().busy,false);assert.equal(candidate.stats().disposed,true);await candidate.dispose();
});
test('full intermediate tracing is separately bounded before any numeric operator or source read',async()=>{
 const f=fixture(),candidate=await createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops}),x=input();
 try{
  x.shapeRequest.target.frames=257;const canonical=deriveWorkflowShapes(x.shapeRequest),r=canonical.requirements.find(item=>item.requirementId==='target.latent');x.tensors[0]={requirementId:r.requirementId,shape:[...r.shape],dtype:r.dtype,meaning:r.meaning,normalization:r.normalization,data:new Float32Array(r.shape.reduce((a,b)=>a*b,1))};
  await assert.rejects(candidate.diagnose(x,{onTrace(){}}),/Diagnostic trace.*128/);assert.deepEqual(f.reads,[]);assert.equal(candidate.stats().predictions,0);
 }finally{await candidate.dispose();}
});
test('canonical 90001-token input rejects before payload reads with a named four-store planning estimate',async()=>{
 const f=fixture(),candidate=await createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops}),x=input();
 try{
  x.shapeRequest.target.width=16*90001;const canonical=deriveWorkflowShapes(x.shapeRequest),r=canonical.requirements.find(item=>item.requirementId==='target.latent');assert.equal(canonical.concatenation.totalTokens,90001);
  x.tensors[0]={requirementId:r.requirementId,shape:[...r.shape],dtype:r.dtype,meaning:r.meaning,normalization:r.normalization,data:new Float32Array(r.shape.reduce((a,b)=>a*b,1))};assert.equal(x.tensors[0].data.byteLength,23040256);
  await assert.rejects(candidate.predict(x),error=>{assert.equal(error.code,'RESOURCE_BUDGET');assert.equal(error.details.totalTokens,90001);assert.equal(error.details.maxSequenceTokens,90000);assert.equal(error.details.hostHiddenStoreCount,4);assert.equal(error.details.plannedHiddenStoreBytes,90001*5120*4);assert.equal(error.details.plannedFourHiddenStoreBytes,4*90001*5120*4);assert.equal(error.details.acceptedProduction,false);return true;});
  assert.deepEqual(f.reads,[]);assert.equal(candidate.stats().predictions,0);assert.equal(candidate.stats().peakHiddenStoreBytes,0);assert.equal(candidate.stats().stageWeightCacheBytes,0);
  const description=candidate.describe();assert.equal(description.allocationAdmission.plannedFourHiddenStoreBytesAtCap,4*90000*5120*4);assert.ok(description.allocationAdmission.plannedHiddenStoreBytesAtCap<2**31);assert.equal(description.allocationAdmission.aggregatePeakMeasured,false);
  const required=input().shapeRequest;required.target={batch:1,frames:81,height:480,width:832};required.refMaxSize=848;required.media={sourceVideo:{state:'present',rgb:{frames:81,height:480,width:832}},referenceVideo:{state:'absent'},slots:Array.from({length:8},(_,slotIndex)=>({slotIndex,wired:{state:'present',rgb:{frames:1,height:848,width:848}},editor:{state:'absent'}}))};
  const requiredTokens=deriveWorkflowShapes(required).concatenation.totalTokens;assert.equal(requiredTokens,87992);assert.ok(requiredTokens<=MODEL_CANDIDATE_LIMITS.maxSequenceTokens);
 }finally{await candidate.dispose();}
});

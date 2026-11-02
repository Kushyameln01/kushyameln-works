import test from 'node:test';
import assert from 'node:assert/strict';
import {createBerniniModelCandidate} from './model-candidate.mjs';
import {MODEL_WEIGHT_SCHEMA,MODEL_WEIGHT_PROFILE} from './model-weights.mjs';
import {BERNINI_TARGETS,TARGET_PROVENANCE} from '../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';
import {P4_INPUT_SEMANTICS} from './capabilities.mjs';
import {deriveWorkflowShapes,BERNINI_WORKFLOW_RULE_ID} from '../../ai-connection/workflow-shapes.mjs';

// Admission doubles only. The first requested weight read deliberately fails;
// these cases do not execute a synthetic or native neural prediction.
function fixture(){
 const pinned=TARGET_PROVENANCE.models.find(model=>model.name.includes('LOW'));
 const entries=Object.fromEntries(BERNINI_TARGETS.map(target=>{
  const matrix=target.key.endsWith('.weight')&&target.shape.length>=2,columns=matrix?target.shape.slice(1).reduce((a,b)=>a*b,1):null;
  return [target.key,{fullShape:[...target.shape],computeDtype:'F32',storageDtype:'F16',columns,...(matrix?{maxRows:Math.min(16,Math.floor(81920/columns))}:{})}];
 }));
 const marker=new Error('first numeric read intentionally blocked'),reads=[];
 const source={describe:()=>({schemaVersion:MODEL_WEIGHT_SCHEMA,executionProfileId:MODEL_WEIGHT_PROFILE,side:'LOW',modelHash:BASE_MODEL_HASHES.LOW,headerSHA256:pinned.headerSHA256,fileBytes:pinned.fileBytes,pinnedCoreCommit:TARGET_PROVENANCE.pinnedComfyCommit,blockCount:40,targetCount:1095,entries}),readRows:async key=>{reads.push(key);throw marker;},readVector:async()=>{throw marker;}};
 const math=Object.fromEntries(['layerNorm','affineNorm','rmsNorm','modulate','gateResidual','add','gelu','silu','bias','rope','divideAttention'].map(key=>[key,()=>{throw marker;}]));math.sinusoidal=()=>new Float32Array(256);
 const ops={linear:async()=>{throw marker;},attentionTile:async()=>{throw marker;}};
 const absent=()=>({state:'absent'}),semantics=Object.fromEntries(['target-latent','source-latent','reference-latent','context-latent'].map(role=>[role,{meaning:role==='target-latent'?'bernini-generated-model-latent:v1':'wan21-normalized-posterior-mean:v1',normalization:'wan21-comfy-f32-v1'}]));
 const shapeRequest={ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:257,height:16,width:32},refMaxSize:32,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],temporalRule:'first-then-groups-floor',patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',concatOrder:'target-first',paddingMode:'none'},semantics,media:{sourceVideo:absent(),referenceVideo:absent(),slots:[]}},canonical=deriveWorkflowShapes(shapeRequest),r=canonical.requirements.find(item=>item.requirementId==='target.latent');
 const input={shapeRequest,tensors:[{requirementId:r.requirementId,shape:r.shape,dtype:r.dtype,meaning:r.meaning,normalization:r.normalization,data:new Float32Array(r.shape.reduce((a,b)=>a*b,1))}],conditioning:{...structuredClone(P4_INPUT_SEMANTICS.conditioning),shape:[1,1,4096],data:new Float32Array(4096),attentionMask:new Uint8Array([1])},timestep:750};
 return {source,math,ops,input,marker,reads,canonical};
}

test('chunk diagnosis admits a whole sequence above the old128 trace cap without granting readiness',async()=>{
 const f=fixture(),candidate=await createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops});
 try{
  assert.equal(f.canonical.concatenation.totalTokens,130);
  await assert.rejects(candidate.diagnose(f.input,{onTrace(){}}),/128/);assert.deepEqual(f.reads,[]);
  await assert.rejects(candidate.diagnoseChunks(f.input,{stages:['q','blockOutput'],stopAfterBlock:0,onChunk(){assert.fail('No numeric result was produced');}}),error=>error===f.marker);
  assert.deepEqual(f.reads,['time_embedding.0.weight']);
  const stats=candidate.stats();assert.equal(stats.busy,false);assert.equal(stats.stageWeightCacheBytes,0);assert.equal(stats.activeHiddenStores,0);assert.equal(stats.predictions,0);assert.equal(stats.diagnosticRuns,0);
  assert.equal(stats.lastTiming.firstFailure.kind,'weightReadDecode');assert.equal(stats.lastTiming.firstFailure.operator,'time_embedding.0.weight');assert.equal(stats.lastFailure.context.phase,'prefix');
  assert.equal(candidate.describe().generationReady,false);assert.equal(candidate.describe().acceptedProduction,false);assert.equal(candidate.describe().chunkDiagnostics.maxRows,128);
 }finally{await candidate.dispose();}
});

test('chunk-only fields stay out of the ordinary prediction contract',async()=>{
 const f=fixture(),candidate=await createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops});
 try{
  for(const extras of [{onChunk(){}},{stopAfterBlock:0},{gate:{abs:1}},{stages:['q']}])await assert.rejects(candidate.predict({...f.input,...extras}),/Unknown/);
  for(const options of [{onChunk(){},stopAfterBlock:40},{onChunk(){},maxRows:129},{onChunk(){},receipt:'old'}])await assert.rejects(candidate.diagnoseChunks(f.input,options));
  assert.deepEqual(f.reads,[]);assert.equal(candidate.stats().busy,false);
 }finally{await candidate.dispose();}
});

test('failed prepared-weight release fences another prediction until cleanup is recovered',async()=>{
 const f=fixture();let releaseFails=true,releases=0;
 f.source.readRows=async(key,start,count)=>{f.reads.push(key);return {values:new Float32Array(count*f.source.describe().entries[key].columns)};};
 f.source.readVector=async(key,start,count)=>({values:new Float32Array(count)});
 Object.assign(f.ops,{
  prepareLinearWeight:({weight,columns,inner})=>Object.freeze({columns,inner,byteLength:weight.byteLength}),
  linearPrepared:async()=>{throw f.marker;},
  releaseLinearWeight(){releases++;if(releaseFails)throw Error('injected tensor release failure');}
 });
 const candidate=await createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops});
 try{
  await assert.rejects(candidate.predict(f.input),error=>error instanceof AggregateError&&/cleanup incomplete/.test(error.message));
  const failed=candidate.stats();assert.equal(failed.busy,false);assert.equal(failed.closing,true);assert.equal(failed.stageWeightCacheBytes,5120*256*4);
  const reads=f.reads.length;
  await assert.rejects(candidate.predict(f.input),/closing/);assert.equal(f.reads.length,reads);
  releaseFails=false;await candidate.recover();
  assert.equal(candidate.stats().stageWeightCacheBytes,0);assert.equal(candidate.stats().disposed,true);assert.ok(releases>=3);
 }finally{releaseFails=false;await candidate.dispose();}
});

test('a native operator cleanup-pending state fences prefix reloads until recovery',async()=>{
 const f=fixture();f.ops.stats=()=>({cleanupPending:true});
 const candidate=await createBerniniModelCandidate({source:f.source,math:f.math,ops:f.ops});
 try{
  await assert.rejects(candidate.predict(f.input),error=>error===f.marker);
  assert.equal(candidate.stats().closing,true);const count=f.reads.length;
  await assert.rejects(candidate.predict(f.input),/closing/);assert.equal(f.reads.length,count);
 }finally{await candidate.dispose();}
});

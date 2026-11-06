import test from 'node:test';
import assert from 'node:assert/strict';
import {createBerniniModelCandidate} from './model-candidate.mjs';
import {MODEL_WEIGHT_SCHEMA,MODEL_WEIGHT_PROFILE} from './model-weights.mjs';
import {BERNINI_TARGETS,TARGET_PROVENANCE} from '../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';

// Admission-only operator doubles. Invalid timestep rejection precedes all
// tensor/source/math operations; these tests cannot produce NN predictions.
async function candidate(){
 const pinned=TARGET_PROVENANCE.models.find(model=>model.name.includes('LOW'));
 const entries=Object.fromEntries(BERNINI_TARGETS.map(target=>{
  const matrix=target.key.endsWith('.weight')&&target.shape.length>=2;
  const columns=matrix?target.shape.slice(1).reduce((a,b)=>a*b,1):null;
  return [target.key,{fullShape:[...target.shape],computeDtype:'F32',storageDtype:'F16',columns,...(matrix?{maxRows:Math.min(16,Math.floor(81920/columns))}:{})}];
 }));
 const source={
  describe:()=>({schemaVersion:MODEL_WEIGHT_SCHEMA,executionProfileId:MODEL_WEIGHT_PROFILE,side:'LOW',modelHash:BASE_MODEL_HASHES.LOW,headerSHA256:pinned.headerSHA256,fileBytes:pinned.fileBytes,pinnedCoreCommit:TARGET_PROVENANCE.pinnedComfyCommit,blockCount:40,targetCount:1095,entries}),
  readRows(){throw Error('No numeric source access allowed');},
  readVector(){throw Error('No numeric source access allowed');}
 };
 const math=Object.fromEntries(['layerNorm','affineNorm','rmsNorm','modulate','gateResidual','add','gelu','silu','bias','sinusoidal','rope','divideAttention'].map(name=>[name,()=>{throw Error('No numeric math access allowed');}]));
 const ops={linear(){throw Error('No linear access allowed');},attentionTile(){throw Error('No attention access allowed');}};
 return createBerniniModelCandidate({source,math,ops});
}

for(const method of ['addEventListener','removeEventListener']){
 test('candidate releases busy/terminal ownership with a throwing own signal '+method,async()=>{
  const owner=await candidate(),controller=new AbortController();
  Object.defineProperty(controller.signal,method,{value(){throw Error('Injected signal '+method+' failure');}});
  await assert.rejects(owner.predict({timestep:1001,signal:controller.signal}));
  const busyAfterFailure=owner.stats().busy;
  let retryError;
  try{await owner.predict({timestep:1001});}catch(error){retryError=error.message;}
  const disposal=owner.dispose();let timer;
  const disposed=await Promise.race([disposal.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),200);})]);
  clearTimeout(timer);
  assert.deepEqual({busyAfterFailure,retryRejectedForTimestep:/Timestep/.test(retryError),disposalSettled:disposed},{busyAfterFailure:false,retryRejectedForTimestep:true,disposalSettled:true});
 });
}

test('candidate validates native AbortSignal slots and remains reusable after a duck signal',async()=>{
 const owner=await candidate();
 try{
  const fake={throwIfAborted(){},addEventListener(){},removeEventListener(){}};
  await assert.rejects(owner.predict({timestep:1001,signal:fake}),TypeError);
  assert.equal(owner.stats().busy,false);
  await assert.rejects(owner.predict({timestep:1001}),/Timestep/);
 }finally{await owner.dispose();}
});

test('candidate preserves native abort reason despite throwing own reason and no-op abort methods',async()=>{
 const owner=await candidate(),controller=new AbortController();
 const reason=new DOMException('Original native cancellation','AbortError');
 controller.abort(reason);
 Object.defineProperty(controller.signal,'throwIfAborted',{value(){}});
 Object.defineProperty(controller.signal,'reason',{get(){throw Error('Own reason must not be read');}});
 try{
  await assert.rejects(owner.predict({timestep:1001,signal:controller.signal}),error=>error===reason);
  assert.equal(owner.stats().busy,false);
 }finally{await owner.dispose();}
});

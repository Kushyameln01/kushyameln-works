// Real adopted capabilities and pre-dispatch lifecycle only; no Node NN evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiffusionMeanManagement} from '../../docs/shared/ai-connection/adapters/diffusion-public/normalization.mjs';
const tensor=()=>({dtype:'float32',layout:'NCTHW',shape:[1,16,1,2,4],meaning:'raw-posterior-mean',modelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',data:new Float32Array(128)});
test('adopted mean service creates an independent model-free API and uses owner support reasons',async()=>{
 const a=await createDiffusionMeanManagement(),b=await createDiffusionMeanManagement();
 try{
  assert.notEqual(a.inspect().ownerObservation.nativeSessionId,b.inspect().ownerObservation.nativeSessionId);
  assert.equal(a.inspect().sourceRef.commit,'296e4fe14dff26689f5075e3103cf3c4a54e3485');
  assert.equal(a.inspect().modelWeightsLoaded,false);
  assert.equal((await a.query({operation:'normalizeRawMean',input:{tensor:tensor()}})).dispatchSupported,true);
  const large=tensor();large.shape=[1,16,21,60,104];
  const reply=await a.execute({operation:'normalizeRawMean',input:{tensor:large}});
  assert.equal(reply.status,'UNSUPPORTED');assert.equal(reply.normalExecution,false);
  assert.ok(reply.reasons.some(r=>r.code==='OWNER_SHAPE_UNSUPPORTED'));
 }finally{await a.dispose();await b.dispose();}
});
test('management fields and accessors cannot become native mean input; early abort has a terminal',async()=>{
 const manager=await createDiffusionMeanManagement();
 try{
  await assert.rejects(()=>manager.execute({operation:'sample',input:{tensor:tensor()}}),{code:'DIFFUSION_MEAN_OPERATION_UNSUPPORTED'});
  await assert.rejects(()=>manager.execute({operation:'normalizeRawMean',input:{tensor:tensor(),requestId:'not-native'}}),{code:'INVALID_MODEL_INPUT'});
  let accessed=false;await assert.rejects(()=>manager.execute({operation:'normalizeRawMean',input:{get tensor(){accessed=true;return tensor();}}}),{code:'INVALID_MODEL_INPUT'});assert.equal(accessed,false);
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>manager.execute({operation:'normalizeRawMean',input:{tensor:tensor()},signal:controller.signal}),{code:'INVOCATION_CANCELLED'});
  assert.equal(manager.inspect().activeTarget,null);
 }finally{await manager.dispose();}
});

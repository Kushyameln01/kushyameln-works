import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePublicModelInputs} from './public-model-browser.mjs';

// Structural transport tests only. No model or numerical owner is constructed.
const sha=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
test('public harness retains every L512 row and mask bit in separate owned positive/negative snapshots',async()=>{
 const text=Float32Array.from({length:512*4096},(_,i)=>Math.fround((i%4096-2048)/2048)),mask=Uint8Array.from({length:512},(_,i)=>i<3?1:0);
 const target=Float32Array.of(0,-0,1,-1),empty=new Float32Array(4);
 const storage=new Map([['/target',new Uint8Array(target.buffer)],['/empty',new Uint8Array(empty.buffer)],['/text',new Uint8Array(text.buffer)],['/mask',mask]]);
 const item={requirementId:'target.latent',shape:[1,1,1,2,2],dtype:'float32',layout:'NCTHW',meaning:'bernini-generated-model-latent:v1',normalization:'wan21-comfy-f32-v1',url:'/target',bytes:16,sha256:await sha(target)};
 const manifest={shapeRequest:{fixture:'structure-only'},tensors:[item],explicitNoise:item,initialEmptyTarget:{url:'/empty',bytes:16,sha256:await sha(empty)},conditioning:{metadata:{shape:[1,512,4096],dtype:'float32',layout:'BLC',meaning:'text_hidden_states',normalization:'umt5-final-rmsnorm-f32-v1'},payloadURL:'/text',maskURL:'/mask',payloadSHA256:await sha(text),maskSHA256:await sha(mask)}};
 const captured=await capturePublicModelInputs(manifest,async url=>storage.get(url));
 assert.equal(captured.positive.data.length,512*4096);assert.equal(captured.positive.attentionMask.length,512);
 assert.deepEqual(captured.positive.data,text);assert.deepEqual(captured.positive.attentionMask,mask);
 assert.notEqual(captured.positive.data.buffer,captured.negative.data.buffer);assert.notEqual(captured.positive.attentionMask.buffer,captured.negative.attentionMask.buffer);
 assert.notEqual(captured.tensors[0].data.buffer,target.buffer);assert.equal(Object.is(captured.tensors[0].data[1],-0),true);
 const before=await captured.snapshots();captured.positive.data[0]=123;
 assert.equal(captured.negative.data[0],text[0]);assert.notDeepEqual(await captured.snapshots(),before);
});

test('public harness rejects corrupted saved-input transport before constructing any API owner',async()=>{
 const data=new Uint8Array(4);
 await assert.rejects(capturePublicModelInputs({tensors:[{shape:[1],dtype:'float32',url:'/bad',bytes:4,sha256:'0'.repeat(64)}]},async()=>data),/transport identity/);
});

test('diagnostic recovery helper cancels then reloads the same public API instance without a numerical callback port',async()=>{
 const {cancelPublicPatchThenReload}=await import('./public-model-browser.mjs');
 assert.equal(typeof cancelPublicPatchThenReload,'function');
 const calls=[],operations=[];let cancellation=null;
 const api={sessionId:'same-api-session',cancel(value){cancellation=value;return {status:'ok',result:{workerTerminated:true}};}};
 const old={modelSessionId:'old-model'},next={modelSessionId:'new-model'},files={HIGH:new Blob(),LOW:new Blob()};
 const predictInput=(side,loaded)=>({side,modelSessionId:loaded.modelSessionId,timestep:1000});
 const request=async(op,input,options)=>{
  calls.push({op,input});
  if(calls.length===1){options.onProgress({jobId:'cancel-this',inputRevision:2,result:{model:{stage:'patch'}}});return {status:'error',error:{code:'CANCELLED'}};}
  if(calls.length===2)return {status:'error',error:{code:'MODEL_NOT_LOADED'}};
  if(calls.length===3)return {status:'ok',result:next};
  if(calls.length===4)return {status:'error',error:{code:'STALE_MODEL'}};
  assert.fail('Unexpected extra numerical operation in recovery helper');
 };
 const result=await cancelPublicPatchThenReload({api,request,predictInput,files,wasmThreads:4,onProgress(){},operations,loaded:old});
 assert.equal(result.loaded,next);assert.equal(result.recovery.apiSessionId,api.sessionId);
 assert.equal(result.recovery.cancelledModelSessionId,'old-model');assert.equal(result.recovery.reloadedModelSessionId,'new-model');
 assert.equal(result.recovery.completedOperation,null);
 assert.deepEqual(cancellation,{sessionId:api.sessionId,jobId:'cancel-this',inputRevision:2});
 assert.deepEqual(calls.map(value=>value.op),['predict','predict','load','predict']);
 assert.equal(calls[2].input.resource.wasmThreads,4);
 assert.equal(calls[3].input.modelSessionId,'old-model');
 assert.deepEqual(operations.map(value=>value.test),['actual-patch-cancel','cancel-retry-needs-load','reload-stale-session']);
});

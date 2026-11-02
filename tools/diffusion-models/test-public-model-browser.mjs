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

test('failed-pair smoke probe observes termination and a fresh empty realm before ordinary P4 prepare/release',async()=>{
 const {failPublicPairThenPrepareP4}=await import('./public-model-browser.mjs');assert.equal(typeof failPublicPairThenPrepareP4,'function');
 const HIGH=new Blob(['retained HIGH']),calls=[],operations=[],workerLifetimes=[],api={sessionId:'same-api-session'};
 const request=async(op,input)=>{
  calls.push({op,input});
  const identity={sessionId:api.sessionId,jobId:'probe-'+calls.length,inputRevision:calls.length,op};
  if(calls.length===1){
   workerLifetimes.push({workerEpoch:1,stage:'constructed'},{workerEpoch:1,stage:'terminated'});
   return {...identity,status:'error',error:{code:'COMPUTE_ERROR',details:{workerTerminated:true,preparationDiscarded:true,reloadRequired:true}}};
  }
  if(calls.length===2){workerLifetimes.push({workerEpoch:2,stage:'constructed'});return {...identity,status:'ok',result:{loaded:false,cleanupRequired:false,modelSessionId:null,resources:null}};}
  if(calls.length===3)return {...identity,status:'ok',result:{model:{side:'HIGH'},modelInference:false}};
  if(calls.length===4)return {...identity,status:'ok',result:{released:true,activeORTSessions:0,readLeases:0}};
  assert.fail('Unexpected numerical operation in failed-pair smoke probe');
 };
 const result=await failPublicPairThenPrepareP4({api,request,HIGH,wasmThreads:4,operations,workerLifetimes});
 assert.deepEqual(calls.map(value=>value.op),['load','modelStatus','prepareP4','releaseP4']);
 assert.equal(calls[0].input.files.HIGH,HIGH);assert.equal(calls[0].input.files.LOW,HIGH);assert.deepEqual(calls[0].input.resource,{wasmThreads:4});
 assert.deepEqual(calls[2].input,{file:HIGH,side:'HIGH'});assert.deepEqual(calls[3].input,{});
 assert.equal(result.apiSessionId,api.sessionId);assert.equal(result.failedWorkerEpoch,1);assert.equal(result.freshWorkerEpoch,2);assert.equal(result.failedWorkerTerminated,true);
 assert.equal(result.failedLoad.requestIdentity.jobId,'probe-1');assert.equal(result.freshStatus.resources,null);assert.equal(result.p4.release.activeORTSessions,0);
 assert.deepEqual(operations.map(value=>value.test),['failed-pair-discarded','failed-pair-fresh-status','failed-pair-fresh-p4']);
});

test('failed-pair smoke probe rejects a successful wrong-pair load before any later operation',async()=>{
 const {failPublicPairThenPrepareP4}=await import('./public-model-browser.mjs');assert.equal(typeof failPublicPairThenPrepareP4,'function');
 let calls=0;
 await assert.rejects(failPublicPairThenPrepareP4({api:{sessionId:'same-api'},request:async()=>{calls++;return {status:'ok',result:{loaded:true}};},HIGH:new Blob(),wasmThreads:1,operations:[],workerLifetimes:[]}),/failed paired load/i);
 assert.equal(calls,1);
});

for(const [label,details] of [
 ['missing Worker termination',{preparationDiscarded:true,reloadRequired:true}],
 ['missing preparation discard',{workerTerminated:true,reloadRequired:true}],
 ['missing reload requirement',{workerTerminated:true,preparationDiscarded:true}]
])test('failed-pair smoke probe rejects '+label,async()=>{
 const {failPublicPairThenPrepareP4}=await import('./public-model-browser.mjs');assert.equal(typeof failPublicPairThenPrepareP4,'function');let calls=0;
 await assert.rejects(failPublicPairThenPrepareP4({api:{sessionId:'same-api'},request:async()=>{calls++;return {status:'error',error:{code:'COMPUTE_ERROR',details}};},HIGH:new Blob(),wasmThreads:1,operations:[],workerLifetimes:[]}),/discard|terminat|reload/i);
 assert.equal(calls,1);
});

for(const [label,state] of [
 ['loaded owner',{loaded:true,cleanupRequired:false,modelSessionId:'old',resources:null}],
 ['cleanup owner',{loaded:false,cleanupRequired:true,modelSessionId:null,resources:null}],
 ['native resources',{loaded:false,cleanupRequired:false,modelSessionId:null,resources:{ops:{}}}]
])test('failed-pair smoke probe rejects fresh status with '+label,async()=>{
 const {failPublicPairThenPrepareP4}=await import('./public-model-browser.mjs');assert.equal(typeof failPublicPairThenPrepareP4,'function');let calls=0;const workerLifetimes=[];
 await assert.rejects(failPublicPairThenPrepareP4({api:{sessionId:'same-api'},request:async()=>{
  calls++;if(calls===1){workerLifetimes.push({workerEpoch:1,stage:'constructed'},{workerEpoch:1,stage:'terminated'});return {status:'error',error:{code:'COMPUTE_ERROR',details:{workerTerminated:true,preparationDiscarded:true,reloadRequired:true}}};}
  workerLifetimes.push({workerEpoch:2,stage:'constructed'});return {status:'ok',result:state};
 },HIGH:new Blob(),wasmThreads:1,operations:[],workerLifetimes}),/fresh|unloaded|cleanup|resources/i);
 assert.equal(calls,2);
});

for(const mode of ['predict','sample'])test('browser config rejects failed-pair probe outside smoke before selecting model Files: '+mode,async()=>{
 const {startPublicModelBrowser}=await import('./public-model-browser.mjs');
 await assert.rejects(startPublicModelBrowser({mode,wasmThreads:1,timeoutMs:1000,failedPairBeforeRun:true}),/smoke/i);
});

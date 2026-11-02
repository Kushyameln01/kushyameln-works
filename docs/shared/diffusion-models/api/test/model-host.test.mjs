// Host protocol tests only; MockWorker never performs model arithmetic.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {BASE_MODEL_HASHES} from '../../lora/weights.mjs';
class MockWorker{
 static all=[];
 static postFailure=false;
 constructor(){this.messages=[];this.terminated=false;MockWorker.all.push(this);}
 postMessage(value){if(MockWorker.postFailure)throw Error('injected dispatch failure');this.messages.push(structuredClone(value));}
 terminate(){this.terminated=true;}
 emit(q,status,result){this.onmessage({data:{...q,input:undefined,status,result}});}
 fail(q,code,details){this.onmessage({data:{...q,input:undefined,status:'error',error:{code,message:'injected Worker failure',...(details?{details}:{})}}});}
}
globalThis.Worker=MockWorker;
const {createDiffusionModels,attachDiffusionPort,PROTOCOL_VERSION}=await import('../index.mjs');
const q=(api,id,op='load',input={files:{HIGH:new Blob(['h']),LOW:new Blob(['l'])}},rev=0)=>({protocolVersion:PROTOCOL_VERSION,sessionId:api.sessionId,jobId:id,inputRevision:rev,op,input});

test('progress never settles the model request and observers cannot replace its result',async()=>{
 const api=createDiffusionModels({sessionId:'host-progress'}),events=[];
 const request=q(api,'one'),promise=api.request(request,{onProgress:event=>{events.push(event);throw Error('observer failure');}});
 const worker=MockWorker.all.at(-1),sent=worker.messages.at(-1);let settled=false;promise.then(()=>{settled=true;});
 worker.emit(sent,'progress',{stage:'block-complete',block:0});await Promise.resolve();
 assert.equal(settled,false,'progress was treated as terminal');assert.equal(events.length,1);
 worker.emit(sent,'ok',{loaded:true,modelSessionId:'test-owner'});assert.equal((await promise).status,'ok');api.dispose();
});

test('cancel inside progress and late responses cannot settle a newer generation',async()=>{
 const api=createDiffusionModels({sessionId:'host-generation'}),first=q(api,'same');let oldProgress=0;
 const pending=api.request(first,{onProgress:()=>{oldProgress++;api.cancel({sessionId:api.sessionId,jobId:first.jobId,inputRevision:0});}});
 const old=MockWorker.all.at(-1),oldSent=old.messages.at(-1);old.emit(oldSent,'progress',{stage:'prepare'});
 assert.equal((await pending).error.code,'CANCELLED');assert.equal(old.terminated,true);
 let newProgress=0;const retry=api.request(q(api,'same'),{onProgress:()=>newProgress++}),current=MockWorker.all.at(-1),sent=current.messages.at(-1);
 old.emit(oldSent,'progress',{stage:'late'});old.emit(oldSent,'ok',{late:true});await Promise.resolve();assert.equal(newProgress,0);assert.equal(oldProgress,1);
 current.emit(sent,'progress',{stage:'current'});assert.equal(newProgress,1);current.emit(sent,'ok',{loaded:true});assert.equal((await retry).status,'ok');api.dispose();
});

test('newer revision submitted by a progress listener preserves its own pending job',async()=>{
 const api=createDiffusionModels({sessionId:'host-revision'});let newer;
 const first=api.request(q(api,'old'),{onProgress:()=>{newer=api.request(q(api,'new','load',{},1));}});
 const old=MockWorker.all.at(-1),sent=old.messages.at(-1);old.emit(sent,'progress',{stage:'prepare'});
 assert.equal((await first).error.code,'STALE_INPUT');const current=MockWorker.all.at(-1),fresh=current.messages.at(-1);current.emit(fresh,'ok',{loaded:true});assert.equal((await newer).jobId,'new');api.dispose();
});

test('model operation additions are routed and caller arrays remain retained',async()=>{
 const api=createDiffusionModels({sessionId:'host-operations'}),data=new Float32Array([1,2]),input={tensor:{dtype:'float32',shape:[2],layout:'C',meaning:'host-input',data}};
 const pending=api.request(q(api,'save','saveTensor',input)),worker=MockWorker.all.at(-1),sent=worker.messages.at(-1);
 assert.equal(sent.op,'saveTensor');data[0]=9;assert.equal(sent.input.tensor.data[0],1);assert.equal(data.length,2);
 worker.emit(sent,'ok',{bytes:new Uint8Array([1])});await pending;
 for(const op of ['unload','modelStatus','readTensor']){const promise=api.request(q(api,op,op,{})),current=MockWorker.all.at(-1);const command=current.messages.at(-1);assert.equal(command.op,op);current.emit(command,'ok',{});await promise;}
 api.dispose();
});

test('explicit ports forward only their own job progress and stop after detach',async()=>{
 const api=createDiffusionModels({sessionId:'host-ports'}),a=new MessageChannel(),b=new MessageChannel(),seenA=[],seenB=[];
 a.port2.on('message',event=>seenA.push(event));b.port2.on('message',event=>seenB.push(event));
 const detachA=attachDiffusionPort(a.port1,api,{progress:true}),detachB=attachDiffusionPort(b.port1,api,{progress:true}),request=q(api,'port-a');
 const until=async predicate=>{for(let i=0;i<50&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,2));assert.ok(predicate());};
 try{
  const before=MockWorker.all.length;a.port2.postMessage(request);await until(()=>MockWorker.all.length>before);
  const worker=MockWorker.all.at(-1),sent=worker.messages.at(-1);worker.emit(sent,'progress',{stage:'prepare'});
  await until(()=>seenA.length===1);assert.equal(seenA[0].status,'progress');assert.equal(seenB.length,0);
  detachA();worker.emit(sent,'progress',{stage:'after-detach'});worker.emit(sent,'ok',{loaded:true});await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(seenA.length,1);assert.equal(seenB.length,0);
 }finally{detachA();detachB();api.dispose();a.port2.close();b.port2.close();}
});

test('paired load gets a fresh Worker and successful unload terminates its resource realm',async()=>{
 const api=createDiffusionModels({sessionId:'host-resource'});
 try{
 const primitive=api.request(q(api,'primitive','schedule',{})),old=MockWorker.all.at(-1);old.emit(old.messages.at(-1),'ok',{});await primitive;
 const loaded=api.request(q(api,'load')),current=MockWorker.all.at(-1);assert.notEqual(current,old);assert.equal(old.terminated,true);
 current.emit(current.messages.at(-1),'ok',{loaded:true,modelSessionId:'current-model',modelEpoch:1});await loaded;
 const count=MockWorker.all.length,messages=current.messages.length,redundant=await api.request(q(api,'again'));assert.equal(redundant.error.code,'MODEL_ALREADY_LOADED');assert.equal(MockWorker.all.length,count);assert.equal(current.messages.length,messages);assert.equal(current.terminated,false);
 const unload=api.request(q(api,'unload','unload',{}));current.emit(current.messages.at(-1),'ok',{unloaded:true});await unload;assert.equal(current.terminated,true);
 }finally{api.dispose();}
});

test('paired load preserves a prepared P4 owner until explicit release',async()=>{
 const api=createDiffusionModels({sessionId:'host-p4-conflict'}),prepared=api.request(q(api,'p4','prepareP4',{})),worker=MockWorker.all.at(-1);
 try{
 worker.emit(worker.messages.at(-1),'ok',{});await prepared;
 const count=worker.messages.length,attempted=api.request(q(api,'load'));assert.equal(worker.messages.length,count);const conflict=await attempted;assert.equal(conflict.error.code,'RESOURCE_OWNER_CONFLICT');assert.equal(worker.terminated,false);
 const release=api.request(q(api,'release','releaseP4',{}));worker.emit(worker.messages.at(-1),'ok',{});await release;
 const loading=api.request(q(api,'load-again')),fresh=MockWorker.all.at(-1);assert.notEqual(fresh,worker);fresh.emit(fresh.messages.at(-1),'ok',{loaded:true});await loading;
 }finally{api.dispose();}
});

for(const code of ['COMPUTE_ERROR','MODEL_PREPARATION_CLEANUP_FAILED','UNSUPPORTED_RESOURCE_CONFIG'])test('failed paired load '+code+' discards its Worker before prepareP4',async()=>{
 const api=createDiffusionModels({sessionId:'host-failed-'+code});
 try{
  const pending=api.request(q(api,'failed')),failed=MockWorker.all.at(-1),sent=failed.messages.at(-1);failed.fail(sent,code,{originalDetail:true});
  const reply=await pending;assert.equal(reply.error.code,code);assert.equal(failed.terminated,true);
  assert.deepEqual(reply.error.details,{originalDetail:true,workerTerminated:true,preparationDiscarded:true,reloadRequired:true});
  const caps=await api.request(q(api,'capabilities','capabilities',{}));assert.equal(caps.result.modelRuntime.loaded,null);assert.equal(caps.result.modelRuntime.cleanupRequired,false);
  const preparation=api.request(q(api,'p4','prepareP4',{})),fresh=MockWorker.all.at(-1);assert.notEqual(fresh,failed);assert.equal(fresh.messages.at(-1).op,'prepareP4');
  failed.emit(sent,'ok',{loaded:true,modelSessionId:'discarded'});fresh.emit(fresh.messages.at(-1),'ok',{prepared:true});assert.equal((await preparation).result.prepared,true);
 }finally{api.dispose();}
});

test('legacy single-file rejection preserves its Worker for later non-model operations',async()=>{
 const api=createDiffusionModels({sessionId:'host-legacy'});
 try{
  const pending=api.request(q(api,'legacy','load',{file:new Blob(['header'])})),worker=MockWorker.all.at(-1);worker.fail(worker.messages.at(-1),'NOT_READY',{reasons:['MODEL_PAIR_REQUIRED']});
  const reply=await pending;assert.equal(reply.error.details.workerTerminated,undefined);assert.equal(worker.terminated,false);
  const next=api.request(q(api,'schedule','schedule',{}));assert.equal(MockWorker.all.at(-1),worker);worker.emit(worker.messages.at(-1),'ok',{});await next;
 }finally{api.dispose();}
});

test('execution cleanup failure blocks P4 and paired reload until successful unload resets the Worker',async()=>{
 const api=createDiffusionModels({sessionId:'host-execution-cleanup'});
 try{
  const loading=api.request(q(api,'load')),worker=MockWorker.all.at(-1);worker.emit(worker.messages.at(-1),'ok',{loaded:true,modelSessionId:'owner',modelEpoch:1});await loading;
  const prediction=api.request(q(api,'predict','predict',{side:'HIGH'}));worker.fail(worker.messages.at(-1),'MODEL_CLEANUP_REQUIRED',{cleanupRequired:true});await prediction;
  const caps=await api.request(q(api,'caps','capabilities',{}));assert.equal(caps.result.modelRuntime.cleanupRequired,true);assert.equal(caps.result.modelRuntime.loaded,null);
  const count=worker.messages.length;assert.equal((await api.request(q(api,'p4','prepareP4',{}))).error.code,'RESOURCE_OWNER_CONFLICT');
  assert.equal((await api.request(q(api,'reload'))).error.code,'MODEL_CLEANUP_REQUIRED');assert.equal(worker.messages.length,count);assert.equal(worker.terminated,false);
  const failedUnload=api.request(q(api,'unload-fails','unload',{}));worker.fail(worker.messages.at(-1),'MODEL_UNLOAD_FAILED');await failedUnload;assert.equal(worker.terminated,false);
  const retry=api.request(q(api,'unload-retry','unload',{}));worker.emit(worker.messages.at(-1),'ok',{unloaded:true});await retry;assert.equal(worker.terminated,true);
  const p4=api.request(q(api,'fresh-p4','prepareP4',{})),fresh=MockWorker.all.at(-1);assert.notEqual(fresh,worker);fresh.emit(fresh.messages.at(-1),'ok',{});await p4;
 }finally{api.dispose();}
});

test('successful modelStatus cleanup observation latches host capabilities until unload',async()=>{
 const api=createDiffusionModels({sessionId:'host-status-cleanup'});
 try{
  const loading=api.request(q(api,'load')),worker=MockWorker.all.at(-1);worker.emit(worker.messages.at(-1),'ok',{loaded:true,modelSessionId:'owner',modelEpoch:1});await loading;
  const status=api.request(q(api,'status','modelStatus',{}));worker.emit(worker.messages.at(-1),'ok',{loaded:false,cleanupRequired:true,resources:null});await status;
  for(const observed of [null,false]){
   if(observed===false){const later=api.request(q(api,'later-status','modelStatus',{}));worker.emit(worker.messages.at(-1),'ok',{loaded:true,cleanupRequired:false});await later;}
   const caps=(await api.request(q(api,'caps','capabilities',{}))).result.modelRuntime;assert.equal(caps.cleanupRequired,true);assert.equal(caps.loaded,null);
  }
  assert.equal((await api.request(q(api,'reload'))).error.code,'MODEL_CLEANUP_REQUIRED');
  assert.equal((await api.request(q(api,'p4','prepareP4',{}))).error.code,'RESOURCE_OWNER_CONFLICT');assert.equal(worker.terminated,false);
  const unload=api.request(q(api,'unload','unload',{}));worker.emit(worker.messages.at(-1),'ok',{unloaded:true});await unload;assert.equal(worker.terminated,true);
  const caps=(await api.request(q(api,'unloaded-caps','capabilities',{}))).result.modelRuntime;assert.equal(caps.cleanupRequired,false);assert.equal(caps.loaded,null);
 }finally{api.dispose();}
});

for(const failure of ['error','messageerror','dispatch'])test('paired load '+failure+' failure reports a discarded preparation realm',async()=>{
 const api=createDiffusionModels({sessionId:'host-transport-'+failure});
 try{
  MockWorker.postFailure=failure==='dispatch';const pending=api.request(q(api,'load')),failed=MockWorker.all.at(-1);MockWorker.postFailure=false;
  if(failure==='error')failed.onerror({message:'injected worker crash'});
  if(failure==='messageerror')failed.onmessageerror();
  const reply=await pending;assert.equal(reply.status,'error');assert.equal(failed.terminated,true);
  assert.equal(reply.error.details.workerTerminated,true);assert.equal(reply.error.details.preparationDiscarded,true);assert.equal(reply.error.details.reloadRequired,true);
  const retry=api.request(q(api,'retry')),fresh=MockWorker.all.at(-1);assert.notEqual(fresh,failed);fresh.emit(fresh.messages.at(-1),'ok',{loaded:true});await retry;
 }finally{MockWorker.postFailure=false;api.dispose();}
});

test('failed paired preparation preserves retained LoRA bindings and file-backed reads',async()=>{
 const api=createDiffusionModels({sessionId:'host-lora-retained'}),file=new Blob(['retained LoRA bytes']),stage='LOW',strength=0,baseModelSha256=BASE_MODEL_HASHES.LOW;
 try{
  const loading=api.request(q(api,'lora','loadLora',{file,stage,strength,baseModelSha256})),loraWorker=MockWorker.all.at(-1);
  loraWorker.emit(loraWorker.messages.at(-1),'ok',{stage,strength,baseModelSha256,fileBytes:file.size,fullFileSHA256:'a'.repeat(64),applied:false});const binding=(await loading).result;
  const pair=api.request(q(api,'pair')),failed=MockWorker.all.at(-1);failed.fail(failed.messages.at(-1),'COMPUTE_ERROR');await pair;assert.equal(failed.terminated,true);
  const listed=(await api.request(q(api,'list','listLoras',{}))).result.bindings;assert.equal(listed.length,1);assert.equal(listed[0].bindingId,binding.bindingId);
  const read=api.request(q(api,'read','readLoraSource',{stage,bindingId:binding.bindingId,byteOffset:0,byteLength:file.size})),fresh=MockWorker.all.at(-1),sent=fresh.messages.at(-1);
  assert.notEqual(fresh,failed);assert.equal(await sent.input.file.text(),'retained LoRA bytes');assert.equal(sent.input.bindingId,binding.bindingId);
  fresh.emit(sent,'ok',{data:new TextEncoder().encode('retained LoRA bytes'),bindingId:binding.bindingId});assert.equal((await read).result.bindingId,binding.bindingId);
 }finally{api.dispose();}
});

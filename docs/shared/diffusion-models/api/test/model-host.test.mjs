// Host protocol tests only; MockWorker never performs model arithmetic.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
class MockWorker{
 static all=[];
 constructor(){this.messages=[];this.terminated=false;MockWorker.all.push(this);}
 postMessage(value){this.messages.push(structuredClone(value));}
 terminate(){this.terminated=true;}
 emit(q,status,result){this.onmessage({data:{...q,input:undefined,status,result}});}
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
 const count=MockWorker.all.length,redundant=await api.request(q(api,'again'));assert.equal(redundant.error.code,'MODEL_ALREADY_LOADED');assert.equal(MockWorker.all.length,count);assert.equal(current.terminated,false);
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

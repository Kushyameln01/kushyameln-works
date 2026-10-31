import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInvocationQueue} from '../../docs/shared/ai-connection/queue.mjs';

const nativeRoot=process.env.WORKS_NATIVE_ROOT;
const nativePath=nativeRoot&&resolve(nativeRoot,'docs/shared/inference/client.mjs');
const unavailable=!nativePath||!existsSync(nativePath);
const skip=unavailable?'Set WORKS_NATIVE_ROOT to the verified Text/VAE54b native source closure; native-owner scope NOT VERIFIED':false;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const invocation=id=>({id,requestId:`native-request:${id}`,ownerId:'text-vae-owner',resourceBinding:'native-client',resourceGeneration:'native-client:g1',revision:1,activeToken:`token:${id}`});
const target=i=>({bindingId:i.resourceBinding,ownerId:i.ownerId,resourceGeneration:i.resourceGeneration,requestId:i.requestId,revision:i.revision,activeToken:i.activeToken});

// The owner wraps Node's real Worker event interface for the unchanged native
// browser-style client. Stop confirmation joins the actual Worker exit event.
class BrowserWorkerAdapter {
  constructor(events){
    this.events=events;this.exited=false;this.terminateCalls=0;this.ready=deferred();
    this.worker=new Worker(new URL('./native-owner-worker-fixture.mjs',import.meta.url));
    this.exitPromise=new Promise(resolve=>this.worker.once('exit',code=>{this.exited=true;events.push('worker-exit');resolve(code);}));
    this.worker.on('message',message=>{if(message?.progress?.phase==='transport-fixture-ready')this.ready.resolve();});
  }
  addEventListener(type,listener){
    if(type==='message')this.worker.on('message',data=>listener({data}));
    else if(type==='error')this.worker.on('error',error=>listener({message:error.message}));
    else throw Error(`Unsupported fixture event ${type}`);
  }
  postMessage(request){this.request=request;this.worker.postMessage(request);}
  terminate(){this.terminateCalls++;this.events.push('native-terminate');this.terminationPromise=this.worker.terminate();return this.terminationPromise;}
  finish(values){this.worker.postMessage({fixtureCommand:'finish',values});}
}

async function createOwnerHarness({releaseGate}={}){
  const bytes=readFileSync(nativePath);
  const gitBlob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(gitBlob,'2ac5b8fcf98074bfbf1fa3373d8bb2002b169e35','Test must use the pinned54b client source, not a copied replacement');
  const {createInferenceClient}=await import(pathToFileURL(nativePath).href);
  const workers=[],events=[],terminals=[];let current=null;
  const client=createInferenceClient({workerFactory:()=>{const adapter=new BrowserWorkerAdapter(events);workers.push(adapter);return adapter;}});
  const resource={bindingId:'native-client',ownerId:'text-vae-owner',resourceGeneration:'native-client:g1',
    cancel:async requested=>{
      assert.equal(current?.target.activeToken,requested.activeToken);
      const active=current;client.cancel();
      await Promise.all([active.worker.exitPromise,active.terminal.catch(()=>{})]);
      return {stopped:active.worker.exited};
    },
    afterTerminal:async(requested,outcome)=>{
      assert.equal(current?.target.activeToken,requested.activeToken);assert.equal(outcome.originalTerminal,true);
      await current.worker.exitPromise;assert.equal(current.worker.exited,true);events.push(`owner-terminal:${requested.invocationId}`);return {reusable:true};
    },
    release:async requested=>{
      assert.equal(current?.target.activeToken,requested.activeToken);
      assert.equal(current.worker.exited,true);events.push(`owner-release:${requested.invocationId}`);
      if(requested.invocationId==='a'&&releaseGate)await releaseGate.promise;
      current=null;
    }};
  const queue=createInvocationQueue({resourceBindings:[resource]});
  const execute=ctx=>{
    assert.equal(current,null,'Successor cannot dispatch before prior owner release');
    const input=Float32Array.of(1,2,3);
    const terminal=client.run({module:'vae',operation:'encode',manifest:{fixtureOnly:true},files:new Map(),input});
    const worker=workers.at(-1);current={target:ctx.target,worker,terminal};events.push(`dispatch:${ctx.target.invocationId}`);
    assert.equal(input.buffer.byteLength,12,'Native client preserves caller input ownership');
    return terminal.then(value=>{terminals.push({id:ctx.target.invocationId,state:'fulfilled'});return value;},error=>{terminals.push({id:ctx.target.invocationId,state:'rejected',message:error.message});throw error;});
  };
  return {queue,client,workers,events,terminals,execute,async cleanup(){await queue.dispose();client.dispose();await Promise.all(workers.map(worker=>worker.exited?null:worker.terminate()));}};
}

test('pinned native client cancellation joins original Promise and real Worker exit before successor dispatch',{skip,timeout:10000},async()=>{
  const releaseGate=deferred(),h=await createOwnerHarness({releaseGate});
  const a=invocation('a'),b=invocation('b');let successorStarted=false;
  const aResult=h.queue.enqueue(a,h.execute).then(value=>({value}),error=>({error}));
  let bResult;
  try{
    while(h.workers.length<1)await tick();await h.workers[0].ready.promise;
    bResult=h.queue.enqueue(b,ctx=>{successorStarted=true;return h.execute(ctx);}).then(value=>({value}),error=>({error}));
    const cancellation=h.queue.cancelInvocation(a.id,target(a));
    await h.workers[0].exitPromise;while(!h.events.includes('owner-release:a'))await tick();
    assert.equal(successorStarted,false,'Queue must join the owner release barrier');
    assert.deepEqual(h.terminals,[{id:'a',state:'rejected',message:'Inference cancelled'}]);
    releaseGate.resolve();const report=await cancellation;
    assert.equal(report.stopConfirmed,true);assert.equal(report.originalTerminal,true);assert.equal(report.resourceReleased,true);assert.equal(report.reusable,true);
    assert.equal((await aResult).error.code,'INVOCATION_CANCELLED');
    while(h.workers.length<2)await tick();await h.workers[1].ready.promise;
    assert.notEqual(h.workers[0],h.workers[1]);assert.equal(h.workers[0].exited,true);
    assert.equal(h.workers[0].request.buildId,'works-inference-v1');
    assert.equal(h.workers[1].request.sessionId,h.workers[0].request.sessionId);
    assert.notEqual(h.workers[1].request.jobId,h.workers[0].request.jobId);
    assert.ok(h.workers[1].request.inputRevision>h.workers[0].request.inputRevision);
    await assert.rejects(h.queue.cancelInvocation(a.id,target(a)),{code:'STALE_INVOCATION'});
    assert.equal(h.workers[1].terminateCalls,0,'Retired cancel cannot reach the new native Worker');
    h.workers[1].finish([7,11]);const completed=await bResult;assert.equal(completed.error,undefined);const reply=completed.value;
    assert.equal(reply.scope,'transport-fixture-not-model');assert.deepEqual([...reply.values],[7,11]);assert.equal(h.workers[1].exited,true);
    const records=h.queue.inspect().invocations;assert.equal(records.find(x=>x.id==='a').resultAccepted,false);assert.equal(records.find(x=>x.id==='b').resultAccepted,true);
  }finally{releaseGate.resolve();if(bResult)bResult.catch(()=>{});await h.cleanup();await aResult;}
});

test('native successful original Promise is joined with actual owner Worker termination for reuse',{skip,timeout:10000},async()=>{
  const h=await createOwnerHarness();
  try{
    const result=h.queue.enqueue(invocation('success'),h.execute);
    while(h.workers.length<1)await tick();await h.workers[0].ready.promise;h.workers[0].finish([2,4,8]);
    assert.deepEqual([...(await result).values],[2,4,8]);assert.equal(h.workers[0].terminateCalls,1);assert.equal(h.workers[0].exited,true);
    assert.deepEqual(h.terminals,[{id:'success',state:'fulfilled'}]);
    const record=h.queue.inspect().invocations[0];assert.equal(record.originalTerminal,true);assert.equal(record.resourceReleased,true);assert.equal(record.reusable,true);
  }finally{await h.cleanup();}
});

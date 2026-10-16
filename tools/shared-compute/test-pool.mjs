import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker as NodeWorker} from 'node:worker_threads';
import {createComputePool} from '../../docs/shared/compute/pool.mjs';
import {instantiateKernel, prepareKernelModule} from '../../docs/shared/compute/kernel.mjs';
import {BUILD_ID, WASM_SHA256} from '../../docs/shared/compute/protocol.mjs';
import {MAX_MEDIA_INPUT_BYTES} from '../../docs/shared/compute/tasks.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const request = (jobId, masks=[0,3,5], timeoutMs=30000) => ({protocolVersion:1,jobId,inputRevision:1,taskType:'ft-magnitude-batch',taskVersion:1,payload:{masks,weights:[1,2,4]},limits:{timeoutMs}});
const expected = r => r.payload.masks.map(mask => r.payload.weights.reduce((sum,w,i) => sum + (mask & (1<<i) ? w : 0),0));
class FakeWorker {
  constructor() { this.terminated=0;this.sent=null;this.messages=[]; }
  postMessage(data) { this.messages.push(data);if(data.type!=='start')this.sent=data; }
  terminate() { this.terminated++; }
  response(extra={}) {
    const r=this.sent;
    return {protocolVersion:r.protocolVersion,buildId:r.buildId,taskType:r.taskType,taskVersion:r.taskVersion,jobId:r.jobId,inputRevision:r.inputRevision,generation:r.generation,workerId:`worker-${r.generation}`,instanceId:`instance-${r.generation}`,type:'result',result:expected(r),metrics:{buildId:BUILD_ID,wasmSha256:WASM_SHA256,computeStartEpochMs:100,computeEndEpochMs:101,loadMs:2,computeMs:1,memoryBytes:1048576,inputCount:r.payload.masks.length},...extra};
  }
  emit(extra={}) { this.onmessage?.({data:this.response(extra)}); }
}
const harnessPools=new Set();
afterEach(()=>{for(const pool of harnessPools)pool.dispose();harnessPools.clear();});
function harness(options={}) {const workers=[];const pool=createComputePool({workerFactory:()=>{const worker=new FakeWorker();workers.push(worker);return worker;},...options});harnessPools.add(pool);return {pool,workers};}

test('two independent slots, queued third, exact ordered batch results and bounded disposal',async()=>{
  const {pool,workers}=harness();
  const batch=pool.submitBatch([request('a'),request('b',[]),request('c',[7])]);
  assert.deepEqual(batch.jobIds,['a','b','c']);assert.equal(workers.length,2);
  assert.notEqual(workers[0],workers[1]);assert.equal(pool.getStatus().queued,1);assert.equal(pool.getStatus().running,2);
  workers[1].emit();assert.equal(workers.length,3);workers[2].emit();workers[0].emit();
  const results=await batch.promise;assert.deepEqual(results.map(x=>x.result),[[0,3,5],[],[7]]);
  assert.equal(new Set(results.map(x=>x.generation)).size,3);assert.equal(pool.getStatus().inputBytes,0);assert.equal(pool.getStatus().outstanding,0);
  assert.ok(workers.every(w=>w.terminated===1 && w.onmessage===null));pool.dispose();assert.equal(pool.getStatus().retainedBytes,0);
});

test('prepared batch does not start before every cohort member is ready; later jobs never join',async()=>{
  const {pool,workers}=harness({concurrency:2});const batch=pool.submitBatch([request('a'),request('b')],{startTogether:true});
  const later=pool.submit(request('later'));assert.equal(workers.length,2);assert.ok(workers.every(w=>w.sent.startTogether===true));
  workers[0].emit({type:'phase',phase:'ready'});assert.equal(workers[0].messages.length,1);assert.equal(workers[1].messages.length,1);
  workers[1].emit({type:'phase',phase:'ready'});assert.equal(workers[0].messages[1].type,'start');assert.equal(workers[1].messages[1].type,'start');
  for(const worker of workers.slice(0,2)){const start=worker.messages[1];assert.equal(start.generation,worker.sent.generation);assert.equal(start.buildId,BUILD_ID);worker.emit();}
  assert.equal(workers.length,3);assert.equal(workers[2].sent.startTogether,false);workers[2].emit();
  assert.ok((await batch.promise).every(r=>r.status==='succeeded'));assert.equal((await later.promise).status,'succeeded');pool.dispose();
});
test('prepared batch rejection is atomic; retained results alone do not block admission',async()=>{
  const {pool,workers}=harness({concurrency:2});assert.throws(()=>pool.submitBatch([request('a'),request('b'),request('c')],{startTogether:true}));
  assert.throws(()=>pool.submitBatch([request('a')],{startTogether:'yes'}));assert.equal(workers.length,0);
  const first=pool.submit(request('retained'));assert.throws(()=>pool.submitBatch([request('busy')],{startTogether:true}));workers[0].emit();await first.promise;
  const batch=pool.submitBatch([request('a')],{startTogether:true});workers[1].emit({type:'phase',phase:'ready'});assert.equal(workers[1].messages[1].type,'start');workers[1].emit();await batch.promise;
  assert.throws(()=>pool.submitBatch([request('retained')],{startTogether:true}));pool.dispose();
});
test('cancel, task failure and timeout remove cohort members and release ready survivors',async()=>{
  for(const mode of ['cancel','failure','timeout']){
    const {pool,workers}=harness({concurrency:2});const batch=pool.submitBatch([request('a'),request('b',[0],mode==='timeout'?10:30000)],{startTogether:true});
    workers[0].emit({type:'phase',phase:'ready'});
    if(mode==='cancel')pool.cancel('b');else if(mode==='failure')workers[1].emit({type:'error',message:'prepare failed'});else await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(workers[0].messages[1]?.type,'start');assert.equal(workers[1].messages.length,1);workers[0].emit();const results=await batch.promise;
    assert.equal(results[0].status,'succeeded');assert.notEqual(results[1].status,'succeeded');pool.dispose();
  }
});
test('dispose within ready callback never sends start, including cancel-then-dispose reentrancy',async()=>{
  let pool;const workers=[];pool=createComputePool({concurrency:2,workerFactory:()=>{const w=new FakeWorker();workers.push(w);return w;},onUpdate:update=>{if(update.jobId==='b'&&update.phase==='ready'){pool.cancel('a');pool.dispose();}}});
  const batch=pool.submitBatch([request('a'),request('b')],{startTogether:true});workers[0].emit({type:'phase',phase:'ready'});workers[1].emit({type:'phase',phase:'ready'});
  assert.ok((await batch.promise).every(r=>r.status==='cancelled'));assert.ok(workers.every(w=>w.messages.length===1));assert.equal(pool.getStatus().outstanding,0);
});
test('late and identity-mismatched ready cannot release another cohort',async()=>{
  const {pool,workers}=harness({concurrency:2});const batch=pool.submitBatch([request('a'),request('b')],{startTogether:true});const old=workers[0].onmessage;
  workers[0].emit({type:'phase',phase:'ready'});workers[1].emit({type:'phase',phase:'ready',generation:999});assert.equal(workers[0].messages.length,1);
  pool.cancel('a');old({data:workers[0].response({type:'phase',phase:'ready'})});assert.equal(workers[1].messages.length,1);
  workers[1].emit({type:'phase',phase:'ready'});assert.equal(workers[1].messages[1].type,'start');workers[1].emit();await batch.promise;pool.dispose();
});
test('synchronous completion callbacks can submit a new cohort without stranding its ready members',async t=>{
  let pool,second;const workers=[];
  pool=createComputePool({concurrency:2,workerFactory:()=>{const worker=new FakeWorker();const send=worker.postMessage.bind(worker);worker.postMessage=data=>{send(data);if(data.type==='start')worker.emit();else if(data.jobId.startsWith('next'))worker.emit({type:'phase',phase:'ready'});};workers.push(worker);return worker;},onUpdate:update=>{if(update.jobId==='b'&&update.status==='succeeded')second=pool.submitBatch([request('next-a'),request('next-b')],{startTogether:true});}});
  t.after(()=>pool.dispose());
  const first=pool.submitBatch([request('a'),request('b')],{startTogether:true});workers[0].emit({type:'phase',phase:'ready'});workers[1].emit({type:'phase',phase:'ready'});
  assert.equal(workers.length,4);assert.ok(workers.slice(2).every(w=>w.messages.some(m=>m.type==='start')));assert.ok((await first.promise).every(r=>r.status==='succeeded'));assert.ok((await second.promise).every(r=>r.status==='succeeded'));
});
test('batch acceptance is atomic for validation, duplicate IDs, count and input bytes',()=>{
  const {pool,workers}=harness({concurrency:1});
  assert.throws(()=>pool.submitBatch([request('a'),request('bad',[8])]));
  assert.throws(()=>pool.submitBatch([request('a'),request('a')]));
  assert.throws(()=>pool.submitBatch([]));assert.throws(()=>pool.submitBatch(Array.from({length:13},(_,i)=>request(`n${i}`))));
  const large=Array(262144).fill(1);assert.throws(()=>pool.submitBatch(Array.from({length:8},(_,i)=>request(`size${i}`,large))));
  assert.equal(workers.length,0);assert.equal(pool.getStatus().outstanding,0);
  pool.submitBatch(Array.from({length:12},(_,i)=>request(`ok${i}`)));assert.throws(()=>pool.submit(request('over')));assert.equal(pool.getStatus().outstanding,12);pool.dispose();
});
test('requests are snapshotted and IDs remain reserved until bounded retention evicts them',async()=>{
  const {pool,workers}=harness();const input=request('same');const first=pool.submit(input);input.payload.masks[0]=7;
  assert.equal(workers[0].sent.payload.masks[0],0);workers[0].emit();await first.promise;
  assert.throws(()=>pool.submit(request('same')));
  for(let i=0;i<16;i++){const h=pool.submit(request(`next${i}`));workers.at(-1).emit();await h.promise;}
  assert.equal(pool.getStatus().retainedCount,16);assert.equal(pool.getResult('same'),null);
  const again=pool.submit(request('same'));workers.at(-1).emit();assert.equal((await again.promise).status,'succeeded');pool.dispose();
});
test('retained result byte limit evicts oldest and keeps caller-owned resolved results',async()=>{
  const {pool,workers}=harness();let first;
  for(let i=0;i<5;i++){const handle=pool.submit(request(`big${i}`,Array(262144).fill(0)));workers.at(-1).emit();const result=await handle.promise;if(!i)first=result;}
  assert.equal(pool.getStatus().retainedBytes,8*1024*1024);assert.equal(pool.getStatus().retainedCount,4);assert.equal(pool.getResult('big0'),null);assert.equal(first.result.length,262144);pool.dispose();
});
test('active and queued cancellation settle once, reject late responses, and recover',async()=>{
  const {pool,workers}=harness({concurrency:1});const a=pool.submit(request('a')), b=pool.submit(request('b'));
  const delayed=workers[0].onmessage;const response=workers[0].response();assert.equal(pool.cancel('b'),true);assert.equal((await b.promise).errorCode,'CANCELLED');
  assert.equal(pool.cancel('a'),true);assert.equal(pool.cancel('a'),false);assert.equal((await a.promise).status,'cancelled');delayed({data:response});assert.equal(pool.getResult('a').status,'cancelled');
  const c=pool.submit(request('c'));workers.at(-1).emit();assert.equal((await c.promise).status,'succeeded');pool.dispose();
});
test('queued timeout includes waiting, releases admission bytes, then recovers',async()=>{
  const {pool,workers}=harness({concurrency:1});const a=pool.submit(request('a')), b=pool.submit(request('b',[0],5));
  assert.equal((await b.promise).errorCode,'TIMEOUT');assert.equal(workers.length,1);pool.cancel('a');await a.promise;
  const c=pool.submit(request('c'));workers.at(-1).emit();assert.equal((await c.promise).status,'succeeded');pool.dispose();
});
test('generation, revision, build, protocol and task identities reject stale replies',async()=>{
  const {pool,workers}=harness();const h=pool.submit(request('a'));
  for(const wrong of [{generation:999},{inputRevision:2},{buildId:'old'},{protocolVersion:2},{taskType:'other'},{taskVersion:2},{jobId:'other'}])workers[0].emit(wrong);
  assert.equal(pool.getStatus('a').status,'running');workers[0].emit();assert.equal((await h.promise).status,'succeeded');pool.dispose();
});
test('malformed current response, task error, worker error and messageerror release and recover',async()=>{
  const {pool,workers}=harness();
  const cases=[w=>w.emit({result:[1]}),w=>w.emit({result:[0,NaN,5]}),w=>w.emit({result:Array(3)}),w=>w.emit({type:'error',message:'task failed'}),w=>w.onerror({preventDefault(){}}),w=>w.onmessageerror({}),w=>w.emit({type:'unknown'})];
  for(let i=0;i<cases.length;i++){const h=pool.submit(request(`bad${i}`));cases[i](workers.at(-1));assert.equal((await h.promise).status,'failed');assert.equal(pool.getStatus().outstanding,0);}
  const ok=pool.submit(request('ok'));workers.at(-1).emit();assert.equal((await ok.promise).status,'succeeded');pool.dispose();
});
test('constructor and postMessage failures settle accepted jobs and allow subsequent success',async()=>{
  let count=0;const workers=[];const pool=createComputePool({workerFactory:()=>{count++;if(count===1)throw Error('constructor');const worker=new FakeWorker();workers.push(worker);if(count===2)worker.postMessage=()=>{throw Error('clone');};return worker;}});
  assert.equal((await pool.submit(request('ctor')).promise).status,'failed');assert.equal((await pool.submit(request('send')).promise).status,'failed');
  const h=pool.submit(request('ok'));workers.at(-1).emit();assert.equal((await h.promise).status,'succeeded');assert.equal(workers[0].terminated,1);pool.dispose();
});
test('reentrant callbacks cannot leak records, oversubscribe or strand accepted jobs',async()=>{
  let pool;const workers=[];pool=createComputePool({workerFactory:()=>{const w=new FakeWorker();workers.push(w);return w;},onUpdate:update=>{if(update.status==='running')pool.dispose();throw Error('subscriber');}});
  const b=pool.submitBatch([request('a'),request('b'),request('c')]);const values=await b.promise;
  assert.ok(values.every(x=>x.status==='cancelled'));assert.equal(pool.getStatus().outstanding,0);assert.equal(pool.getStatus().inputBytes,0);assert.ok(workers.every(w=>w.terminated===1));
});
test('module preparation is once per pool, failure resets and explicit next submission retries',async()=>{
  const bytes=await readFile(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url));const module=await WebAssembly.compile(bytes);let calls=0;
  const {pool,workers}=harness({moduleReuse:true,prepareModule:async()=>{calls++;if(calls===1)throw Error('fetch');return module;}});
  assert.equal((await pool.submit(request('fail')).promise).errorCode,'PREPARATION_FAILED');
  const a=pool.submit(request('a')),b=pool.submit(request('b'));await tick();assert.equal(calls,2);assert.equal(workers.length,2);assert.equal(workers[0].sent.module,module);workers.forEach(w=>w.emit());await Promise.all([a.promise,b.promise]);
  const c=pool.submit(request('c'));await tick();workers.at(-1).emit();await c.promise;assert.equal(calls,2);pool.dispose();
});
test('dispose while preparing aborts fetch and prevents late worker launch',async()=>{
  let complete,signal;const {pool,workers}=harness({moduleReuse:true,prepareModule:options=>{signal=options.signal;return new Promise(resolve=>{complete=resolve;});}});
  const h=pool.submit(request('a'));await tick();pool.dispose();assert.equal(signal.aborted,true);assert.equal((await h.promise).errorCode,'DISPOSED');complete(new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0])));await tick();assert.equal(workers.length,0);assert.equal(pool.getStatus().retainedCount,0);assert.throws(()=>pool.submit(request('b')));
});
test('a failed module attempt fails already accepted queued jobs without an implicit retry',async()=>{
  const bytes=await readFile(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url));const module=await WebAssembly.compile(bytes);let count=0;
  const {pool,workers}=harness({concurrency:2,moduleReuse:true,prepareModule:async()=>{count++;if(count===1)throw Error('load failed');return module;}});
  const batch=pool.submitBatch([request('a'),request('b'),request('c',[0,3,5],20)]);
  const results=await batch.promise;assert.ok(results.every(r=>r.errorCode==='PREPARATION_FAILED'));assert.equal(count,1);assert.equal(workers.length,0);
  const retry=pool.submit(request('explicit-retry'));await tick();workers[0].emit();assert.equal((await retry.promise).status,'succeeded');assert.equal(count,2);pool.dispose();
});

// Adjustment requirements: a pending shared preparation must not poison later submissions.
const emptyModule=()=>new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]));
function pendingPreparationHarness(options={}) {
  const attempts=[];
  const state=harness({...options,moduleReuse:true,prepareModule:input=>new Promise((resolve,reject)=>{attempts.push({input,resolve,reject});})});
  return {...state,attempts};
}
function preparationClock(t) {
  let now=0;t.mock.timers.enable({apis:['setTimeout']});t.mock.method(performance,'now',()=>now);
  return {advance(ms){now+=ms;t.mock.timers.tick(ms);},withoutTimers(ms){now+=ms;}};
}
test('pending preparation: individual timeout retires an orphan and explicit submission starts fresh',async t=>{
  const clock=preparationClock(t),{pool,workers,attempts}=pendingPreparationHarness();
  const first=pool.submit(request('timed',[0],5));await tick();clock.advance(5);
  assert.equal((await first.promise).errorCode,'TIMEOUT');assert.equal(attempts[0].input.signal.aborted,true);
  const next=pool.submit(request('retry'));await tick();assert.equal(attempts.length,2);
  attempts[1].resolve(emptyModule());await tick();workers[0].emit();assert.equal((await next.promise).status,'succeeded');
  attempts[0].resolve(emptyModule());await tick();assert.equal(workers.length,1);assert.equal(pool.getStatus().outstanding,0);
});
test('pending preparation: cancellation protects live and queued waiters and releases the last dependant',async t=>{
  const clock=preparationClock(t),{pool,attempts}=pendingPreparationHarness({concurrency:1});
  const a=pool.submit(request('a',[0],5)),b=pool.submit(request('b'));await tick();clock.advance(5);
  assert.equal((await a.promise).errorCode,'TIMEOUT');assert.equal(attempts[0].input.signal.aborted,false);
  await tick();assert.equal(attempts.length,1);assert.equal(pool.getStatus('b').phase,'preparing');
  const c=pool.submit(request('c'));pool.cancel('b');await b.promise;
  assert.equal(attempts[0].input.signal.aborted,false);assert.equal(attempts.length,1);
  pool.cancel('c');assert.equal((await c.promise).errorCode,'CANCELLED');assert.equal(attempts[0].input.signal.aborted,true);
  assert.equal(pool.getStatus().outstanding,0);assert.equal(pool.getStatus().inputBytes,0);
});
test('pending preparation: absolute deadline fails accepted cohort without retry and ignores old completion',async t=>{
  const clock=preparationClock(t),{pool,workers,attempts}=pendingPreparationHarness({concurrency:2});
  const first=pool.submit(request('first'));await tick();clock.advance(1000);
  const batch=pool.submitBatch([request('later'),request('queued')]);await tick();clock.advance(29000);
  assert.equal((await first.promise).errorCode,'TIMEOUT');
  assert.equal(pool.getResult('later')?.errorCode,'PREPARATION_TIMEOUT');
  assert.deepEqual((await batch.promise).map(r=>r.errorCode),['PREPARATION_TIMEOUT','PREPARATION_TIMEOUT']);
  assert.equal(attempts.length,1);assert.equal(attempts[0].input.signal.aborted,true);assert.equal(workers.length,0);
  const next=pool.submit(request('new'));await tick();assert.equal(attempts.length,2);
  attempts[0].reject(Error('late old failure'));await tick();assert.equal(pool.getStatus('new').phase,'preparing');
  attempts[1].resolve(emptyModule());await tick();workers[0].emit();assert.equal((await next.promise).status,'succeeded');
});
test('pending preparation: a resolve after the absolute deadline cannot beat a delayed timer',async t=>{
  const clock=preparationClock(t),{pool,workers,attempts}=pendingPreparationHarness();
  const h=pool.submit(request('delayed-timer'));await tick();clock.withoutTimers(30001);attempts[0].resolve(emptyModule());await tick();
  assert.equal(pool.getResult('delayed-timer')?.errorCode,'PREPARATION_TIMEOUT');assert.equal((await h.promise).status,'failed');
  assert.equal(workers.length,0);assert.equal(attempts[0].input.signal.aborted,true);
});
test('pending preparation: orphan is detached before cancellation callback resubmits',async()=>{
  let replacement;const {pool,workers,attempts}=pendingPreparationHarness({onUpdate:s=>{if(s.jobId==='old'&&s.status==='cancelled')replacement=pool.submit(request('replacement'));}});
  const old=pool.submit(request('old'));await tick();pool.cancel('old');await old.promise;await tick();
  assert.equal(attempts[0].input.signal.aborted,true);assert.equal(attempts.length,2);
  attempts[0].reject(Error('old late reject'));attempts[1].resolve(emptyModule());await tick();
  assert.equal(workers.length,1);assert.equal(workers[0].sent.jobId,'replacement');workers[0].emit();assert.equal((await replacement.promise).status,'succeeded');
});
test('pending preparation: abort callback can release and reuse an ID without eviction deleting its live replacement',async()=>{
  let pool,replacement,released,settlements=0;const attempts=[],workers=[];
  pool=createComputePool({concurrency:2,moduleReuse:true,workerFactory:()=>{const worker=new FakeWorker();workers.push(worker);return worker;},prepareModule:input=>new Promise((resolve,reject)=>{
    attempts.push({input,resolve,reject});
    if(attempts.length===1)input.signal.addEventListener('abort',()=>{released=pool.releaseResult('same');replacement=pool.submit(request('same'));},{once:true});
  })});harnessPools.add(pool);
  const first=pool.submit(request('same'));first.promise.then(()=>settlements++);await tick();
  const firstGeneration=pool.getStatus('same').generation;pool.cancel('same');const original=await first.promise;await tick();
  assert.equal(released,true);assert.equal(original?.status,'cancelled');assert.equal(original.generation,firstGeneration);assert.equal(settlements,1);
  assert.equal(attempts.length,2);const replacementGeneration=pool.getStatus('same').generation;assert.notEqual(replacementGeneration,firstGeneration);
  for(let i=0;i<16;i++){const h=pool.submit(request('retention-'+i));pool.cancel(h.jobId);assert.equal((await h.promise).status,'cancelled');}
  assert.equal(pool.getStatus('same')?.generation,replacementGeneration);assert.equal(pool.getStatus().outstanding,1);assert.equal(pool.getResult('same'),null);
  attempts[0].resolve(emptyModule());await tick();assert.equal(workers.length,0);assert.equal(pool.getStatus('same').generation,replacementGeneration);
  attempts[1].resolve(emptyModule());await tick();assert.equal(workers.length,1);workers[0].emit();
  const result=await replacement.promise;assert.equal(result.status,'succeeded');assert.equal(result.generation,replacementGeneration);assert.equal(settlements,1);assert.equal(pool.getStatus().outstanding,0);
});
test('pending preparation: repeated cancellation retires each attempt; success stays reusable',async()=>{
  const {pool,workers,attempts}=pendingPreparationHarness();
  for(let i=0;i<8;i++){const h=pool.submit(request('cancel-'+i));await tick();assert.equal(attempts.length,i+1);pool.cancel(h.jobId);await h.promise;assert.equal(attempts[i].input.signal.aborted,true);assert.equal(pool.getStatus().inputBytes,0);}
  const ok=pool.submit(request('ok'));await tick();attempts.at(-1).resolve(emptyModule());await tick();workers[0].emit();await ok.promise;
  for(const attempt of attempts.slice(0,-1))attempt.resolve(emptyModule());await tick();assert.equal(workers.length,1);
  const reused=pool.submit(request('reused'));await tick();assert.equal(attempts.length,9);workers[1].emit();assert.equal((await reused.promise).status,'succeeded');
});
const unityRequest=jobId=>({...request(jobId),taskType:'unity-analyze',payload:{schemaVersion:'unity-analysis-snapshot/1',files:[]}});
const taskMessage=(worker,extra)=>worker.onmessage?.({data:{...worker.sent,workerId:'worker-'+worker.sent.generation,instanceId:'instance-'+worker.sent.generation,...extra}});
const emptyUnityResult=()=>({kind:'unity-analysis',snapshotId:'snapshot',completeness:{truncated:false,totalCount:0,returnedCount:0},findings:[],references:[],shared:[]});
test('pending preparation: cancel one active waiter then share one success with the survivor',async()=>{
  const {pool,workers,attempts}=pendingPreparationHarness({concurrency:2});
  const a=pool.submit(request('a')),b=pool.submit(request('b'));await tick();pool.cancel('a');await a.promise;
  assert.equal(attempts[0].input.signal.aborted,false);attempts[0].resolve(emptyModule());await tick();
  assert.equal(workers.length,1);assert.equal(workers[0].sent.jobId,'b');workers[0].emit();assert.equal((await b.promise).status,'succeeded');assert.equal(attempts.length,1);
});
test('pending preparation: another kernel and a delivery-only JS task survive FT failure',async()=>{
  const {pool,workers,attempts}=pendingPreparationHarness({concurrency:3});
  const parsed={...request('parse'),taskType:'unity-parse',payload:{path:'Assets/Empty.asset',bytes:new Uint8Array(0)}};
  const batch=pool.submitBatch([request('ft'),unityRequest('unity'),parsed]);await tick();
  assert.equal(attempts.length,2);assert.equal(workers.length,1);assert.equal(workers[0].sent.jobId,'parse');
  taskMessage(workers[0],{type:'result',instanceId:null,result:{kind:'unity-parsed',path:parsed.payload.path,parserVersion:'unity-text-1',file:{path:parsed.payload.path,byteLength:0,contentHash:'0'.repeat(64),objects:[],issues:[],coverage:'opaque'}}});
  assert.equal(pool.getResult('parse'),null);
  attempts[0].reject(Error('FT prepare failed'));await tick();assert.equal(attempts[1].input.signal.aborted,false);
  attempts[1].resolve(emptyModule());await tick();taskMessage(workers[1],{type:'result',result:emptyUnityResult()});
  const results=await batch.promise;assert.deepEqual(results.map(r=>r.status),['failed','succeeded','succeeded']);assert.equal(results[0].errorCode,'PREPARATION_FAILED');assert.equal(pool.getStatus().inputBytes,0);
});
test('pending preparation: a failed kernel releases a ready survivor in a prepared cohort',async()=>{
  const {pool,workers,attempts}=pendingPreparationHarness({concurrency:2});
  const batch=pool.submitBatch([request('ft'),unityRequest('unity')],{startTogether:true});await tick();
  attempts[1].resolve(emptyModule());await tick();taskMessage(workers[0],{type:'phase',phase:'ready'});
  assert.equal(workers[0].messages.length,1);attempts[0].reject(Error('FT prepare failed'));await tick();
  assert.equal(workers[0].messages[1]?.type,'start');taskMessage(workers[0],{type:'result',result:emptyUnityResult()});
  assert.deepEqual((await batch.promise).map(r=>r.status),['failed','succeeded']);assert.equal(pool.getStatus().outstanding,0);
});
const mediaRequest=(jobId,wasmVariant)=>({...request(jobId),taskType:'media-lbp-tile',wasmVariant,payload:{pixelFormat:'gray8',width:1,height:1,stride:1,imageWidth:1,imageHeight:1,originX:0,originY:0,region:{x:0,y:0,width:1,height:1},data:new Uint8Array(1)}});
test('pending preparation: Sites fourth kernel never evicts a pending dependency of queued work',async t=>{
  if(MAX_MEDIA_INPUT_BYTES===undefined){t.skip('Sites-only media keys are intentionally absent from Pages');return;}
  const {pool,workers,attempts}=pendingPreparationHarness({concurrency:4});
  const batch=pool.submitBatch([request('ft'),unityRequest('unity'),mediaRequest('scalar','scalar'),mediaRequest('simd','simd'),request('queued-ft')]);await tick();
  assert.equal(attempts.length,4);assert.equal(new Set(attempts.map(a=>a.input.kernelHash)).size,4);
  pool.cancel('ft');await tick();assert.equal(attempts.length,4);assert.equal(attempts[0].input.signal.aborted,false);
  attempts[0].resolve(emptyModule());await tick();assert.equal(workers.length,1);assert.equal(workers[0].sent.jobId,'queued-ft');workers[0].emit();
  for(const id of ['unity','scalar','simd'])pool.cancel(id);assert.ok(attempts.slice(1).every(a=>a.input.signal.aborted));
  const results=await batch.promise;assert.equal(results.at(-1).status,'succeeded');assert.equal(pool.getStatus().outstanding,0);
});
test('pending preparation: completed Module cache retains only three keys without cancelling work',async t=>{
  if(MAX_MEDIA_INPUT_BYTES===undefined){t.skip('Sites-only media keys are intentionally absent from Pages');return;}
  const {pool,attempts}=pendingPreparationHarness();
  const inputs=[request('ft'),unityRequest('unity'),mediaRequest('scalar','scalar'),mediaRequest('simd','simd')];
  for(const input of inputs){const h=pool.submit(input);await tick();attempts.at(-1).resolve(emptyModule());await tick();pool.cancel(h.jobId);await h.promise;}
  assert.equal(attempts.length,4);
  const retained=pool.submit(unityRequest('retained-unity'));await tick();assert.equal(attempts.length,4);pool.cancel(retained.jobId);await retained.promise;
  const evicted=pool.submit(request('evicted-ft'));await tick();assert.equal(attempts.length,5);pool.cancel(evicted.jobId);await evicted.promise;
});
test('disposal during injected Worker construction terminates the returned worker without sending',async()=>{
  let pool,worker;pool=createComputePool({workerFactory:()=>{pool.dispose();worker=new FakeWorker();return worker;}});
  assert.equal((await pool.submit(request('a')).promise).errorCode,'DISPOSED');assert.equal(worker.terminated,1);assert.equal(worker.sent,null);
});
test('real Hike WASM has independent memories, correct numeric results and failure rejection',async()=>{
  const bytes=await readFile(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url));const module=await WebAssembly.compile(bytes);
  const a=instantiateKernel(module),b=instantiateKernel(module);assert.notEqual(a.instanceId,b.instanceId);assert.notEqual(a.memory,b.memory);assert.notEqual(a.memory.buffer,b.memory.buffer);
  new Uint8Array(a.memory.buffer)[0]=123;assert.equal(new Uint8Array(b.memory.buffer)[0],0);
  assert.deepEqual([0,3,5].map(x=>a.magnitude(x,[1,2,4])),[0,3,5]);assert.equal(a.memory.buffer.byteLength,1048576);
  assert.throws(()=>a.magnitude(8,[1,2,4]));assert.throws(()=>a.magnitude(0,[NaN]));assert.throws(()=>instantiateKernel(new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]))));
});
test('fixed kernel fetch verifies actual digest and propagates failure',async()=>{
  const bytes=await readFile(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url));let count=0,contentType=null;
  const module=await prepareKernelModule({fetchImpl:async()=>new Response(bytes,{headers:{'content-type':'application/wasm'}}),onCompile:()=>count++,onResponse:value=>{contentType=value;}});assert.ok(module instanceof WebAssembly.Module);assert.equal(count,1);assert.equal(contentType,'application/wasm');
  await assert.rejects(()=>prepareKernelModule({fetchImpl:async()=>({ok:false,status:404})}));
  await assert.rejects(()=>prepareKernelModule({fetchImpl:async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer})}));
});

test('real browser Worker code through Node adapter returns independent IDs, zero/empty and metrics',async()=>{
  class RealWorker {
    constructor(){this.worker=new NodeWorker(new URL('./node-pool-worker.mjs',import.meta.url));this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));this.worker.on('messageerror',error=>this.onmessageerror?.(error));}
    postMessage(data){this.worker.postMessage(data);}
    terminate(){return this.worker.terminate();}
  }
  const pool=createComputePool({workerFactory:()=>new RealWorker()});
  try{
    const results=await pool.submitBatch([request('real-a'),request('real-b',[])]).promise;
    assert.deepEqual(results.map(r=>r.result),[[0,3,5],[]]);assert.ok(results.every(r=>r.status==='succeeded'));
    assert.equal(new Set(results.map(r=>r.workerId)).size,2);assert.equal(new Set(results.map(r=>r.instanceId)).size,2);
    for(const r of results){assert.equal(r.metrics.memoryBytes,1048576);assert.equal(r.metrics.wasmSha256,WASM_SHA256);assert.equal(r.metrics.compileCalls,1);assert.ok(r.metrics.computeEndEpochMs>=r.metrics.computeStartEpochMs);}
    assert.equal(pool.getStatus().compileCalls,2);
  }finally{pool.dispose();}
});

test('real WASM trap reaches TASK_FAILED, releases its slot and next submission recovers',async()=>{
  // Deliberately replace the FtMagnitude body in a copy of the real binary.
  // This is a test-only trap fixture; the production digest verifier rejects it.
  const bytes=await readFile(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url));
  let p=8,target=-1;const sections=[];
  const read=()=>{let n=0,s=0,b;do{b=bytes[p++];n|=(b&127)<<s;s+=7;}while(b&128);return n>>>0;};
  const leb=n=>{const a=[];do{let b=n&127;n>>>=7;if(n)b|=128;a.push(b);}while(n);return Buffer.from(a);};
  while(p<bytes.length){const sectionStart=p,id=bytes[p++],size=read(),end=p+size;
    if(id===7){for(let n=read();n--;){const length=read(),name=bytes.subarray(p,p+length).toString();p+=length;const kind=bytes[p++],index=read();if(kind===0&&name==='FtMagnitude')target=index;}}
    if(id===10){const count=read(),bodies=[];for(let i=0;i<count;i++){const length=read(),bodyStart=p;p+=length;const body=i===target?Buffer.from([0,0,11]):bytes.subarray(bodyStart,p);bodies.push(leb(body.length),body);}const payload=Buffer.concat([leb(count),...bodies]);sections.push(Buffer.concat([Buffer.from([10]),leb(payload.length),payload]));}
    else sections.push(bytes.subarray(sectionStart,end));p=end;
  }
  assert.ok(target>=0);const trap=await WebAssembly.compile(Buffer.concat([bytes.subarray(0,8),...sections]));
  const good=await WebAssembly.compile(bytes);
  assert.throws(()=>instantiateKernel(trap).magnitude(0,[1,2,4]),WebAssembly.RuntimeError);
  let prepares=0;
  class RealWorker {
    constructor(){this.worker=new NodeWorker(new URL('./node-pool-worker.mjs',import.meta.url));this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}
    postMessage(data){this.worker.postMessage(data);}
    terminate(){return this.worker.terminate();}
  }
  // A separate pool is needed to change its intentionally fixed Module cache.
  const badPool=createComputePool({moduleReuse:true,prepareModule:async()=>{prepares++;return trap;},workerFactory:()=>new RealWorker()});
  const bad=await badPool.submit(request('trap')).promise;assert.equal(bad.errorCode,'TASK_FAILED');assert.equal(badPool.getStatus().outstanding,0);
  const recovered=await badPool.submit(request('after-trap',[])).promise;assert.equal(recovered.status,'succeeded');assert.deepEqual(recovered.result,[]);badPool.dispose();
  const pool=createComputePool({moduleReuse:true,prepareModule:async()=>good,workerFactory:()=>new RealWorker()});
  try{const result=await pool.submit(request('recovery')).promise;assert.deepEqual(result.result,[0,3,5]);assert.equal(result.metrics.compileCalls,0);assert.equal(result.metrics.moduleReuse,true);}finally{pool.dispose();}
  assert.equal(prepares,1);
});

test('real prepared Worker ignores wrong/early/duplicate start and separates ready waiting',async()=>{
  const worker=new NodeWorker(new URL('./node-pool-worker.mjs',import.meta.url));const messages=[];worker.on('message',message=>messages.push(message));
  const next=type=>new Promise((resolve,reject)=>{const listener=data=>{if(data.type===type){worker.off('message',listener);worker.off('error',reject);resolve(data);}};worker.on('message',listener);worker.once('error',reject);});
  try {
    const base={...request('identity'),generation:1,buildId:BUILD_ID,startTogether:true};
    worker.postMessage({...base,type:'start'});
    const ready=next('phase');worker.postMessage(base);await ready;
    if(!messages.some(m=>m.phase==='ready'))await new Promise((resolve,reject)=>{const listener=data=>{if(data.phase==='ready'){worker.off('message',listener);resolve();}else if(data.type==='error')reject(Error(data.message));};worker.on('message',listener);});
    for(const change of [{generation:2},{jobId:'other'},{inputRevision:2},{protocolVersion:2},{taskVersion:2},{taskType:'other'},{buildId:'old'}])worker.postMessage({...base,type:'start',...change});
    const pong=next('test-pong');worker.postMessage({type:'test-ping'});await pong;assert.ok(!messages.some(m=>m.type==='result'||m.phase==='computing'));
    const resultPromise=next('result');worker.postMessage({...base,type:'start'});const result=await resultPromise;assert.deepEqual(result.result,[0,3,5]);assert.ok(result.metrics.readyWaitMs>=0);assert.equal(result.metrics.startTogether,true);
    const after=next('test-pong');worker.postMessage({...base,type:'start'});worker.postMessage({type:'test-ping'});await after;assert.equal(messages.filter(m=>m.type==='result').length,1);
  }finally{await worker.terminate();}
});

test('real two-Worker prepared batch records comparable compute intervals without a hardware guarantee',async t=>{
  class RealWorker {
    constructor(){this.worker=new NodeWorker(new URL('./node-pool-worker.mjs',import.meta.url));this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}
    postMessage(data){this.worker.postMessage(data);}
    terminate(){return this.worker.terminate();}
  }
  const pool=createComputePool({concurrency:2,workerFactory:()=>new RealWorker()});
  try {
    const masks=Array.from({length:262144},(_,i)=>i%8);
    const results=await pool.submitBatch([request('prepared-a',masks),request('prepared-b',masks)],{startTogether:true}).promise;
    assert.ok(results.every(r=>r.status==='succeeded'));assert.deepEqual(results[0].result,masks);assert.deepEqual(results[1].result,masks);
    assert.equal(new Set(results.map(r=>r.workerId)).size,2);assert.equal(new Set(results.map(r=>r.instanceId)).size,2);
    for(const result of results){assert.equal(result.metrics.startTogether,true);assert.ok(result.metrics.readyWaitMs>=0);assert.ok(result.metrics.computeEndEpochMs>=result.metrics.computeStartEpochMs);}
    const intervals=results.map(r=>({workerId:r.workerId,start:r.metrics.computeStartEpochMs,end:r.metrics.computeEndEpochMs,readyWaitMs:r.metrics.readyWaitMs}));
    const overlapMs=Math.max(0,Math.min(...intervals.map(r=>r.end))-Math.max(...intervals.map(r=>r.start)));
    t.diagnostic(JSON.stringify({kind:'Node interval observation only',overlapMs,intervals}));
  }finally{pool.dispose();}
});

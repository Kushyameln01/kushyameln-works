import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker,MessageChannel} from 'node:worker_threads';
import {once} from 'node:events';
import {createInvocationQueue} from '../../docs/shared/ai-connection/queue.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const invocation=(id,extra={})=>({id,requestId:`request:${id}`,ownerId:'owner',resourceBinding:'resource',resourceGeneration:'generation:initial',revision:1,activeToken:`token:${id}`,...extra});
const target=i=>({bindingId:i.resourceBinding,ownerId:i.ownerId,resourceGeneration:i.resourceGeneration,requestId:i.requestId,revision:i.revision,activeToken:i.activeToken});
const binding=extra=>({bindingId:'resource',ownerId:'owner',resourceGeneration:'generation:initial',cancel:async()=>({stopped:true}),afterTerminal:async()=>({reusable:true}),release:async()=>{},...extra});
const catchError=p=>p.then(()=>null,error=>error);

test('same resource waits for original terminal and owner release before next dispatch',async()=>{
 const terminal=deferred(),released=deferred(),started=[];
 const q=createInvocationQueue({resourceBindings:[binding({release:async t=>{if(t.invocationId==='a')await released.promise;}})]});
 const a=q.enqueue(invocation('a'),async()=>{started.push('a');return terminal.promise;});
 const b=q.enqueue(invocation('b'),async()=>{started.push('b');return 2;});
 await tick();assert.deepEqual(started,['a']);terminal.resolve(1);await tick();assert.deepEqual(started,['a']);
 released.resolve();assert.equal(await a,1);assert.equal(await b,2);await q.drain();assert.deepEqual(started,['a','b']);
});
test('queued cancellation removes only its own invocation without native stop',async()=>{
 const gate=deferred();let nativeCancels=0;
 const q=createInvocationQueue({resourceBindings:[binding({cancel:async()=>{nativeCancels++;return {stopped:true};}})]});
 const a=q.enqueue(invocation('a'),()=>gate.promise),b=catchError(q.enqueue(invocation('b'),()=>assert.fail('cancelled queued invocation ran')));
 const c=q.enqueue(invocation('c'),()=>3);await tick();
 const report=await q.cancelInvocation('b',target(invocation('b')));assert.equal(report.notStarted,true);assert.equal((await b).code,'INVOCATION_CANCELLED');assert.equal(nativeCancels,0);
 gate.resolve(1);assert.equal(await a,1);assert.equal(await c,3);
});
test('active cancellation joins cancel reply, original terminal and release barriers; stale cancel cannot stop successor',async()=>{
 const raw=deferred(),ack=deferred(),released=deferred();let cancels=0,startedB=false;
 const q=createInvocationQueue({resourceBindings:[binding({cancel:async()=>{cancels++;return ack.promise;},release:async t=>{if(t.invocationId==='a')await released.promise;}})]});
 const a=catchError(q.enqueue(invocation('a'),()=>raw.promise));await tick();
 const cancel=q.cancelInvocation('a',target(invocation('a'))),b=q.enqueue(invocation('b'),()=>{startedB=true;return 'B';});
 raw.resolve('LATE_A');await tick();assert.equal(startedB,false);
 const beforeStopAck=q.inspect().invocations.find(x=>x.id==='a');
 try {assert.equal(beforeStopAck.originalTerminal,true);assert.equal(beforeStopAck.resourceReleased,false);assert.equal(beforeStopAck.reusable,false);}
 catch(error){ack.resolve({stopped:true});released.resolve();await cancel;await a;await b;throw error;}
 ack.resolve({stopped:true});await tick();assert.equal(startedB,false);
 released.resolve();const report=await cancel;assert.equal(report.stopConfirmed,true);assert.equal(report.originalTerminal,true);assert.equal(report.resourceReleased,true);
 assert.equal((await a).code,'INVOCATION_CANCELLED');assert.equal(await b,'B');
 await assert.rejects(q.cancelInvocation('a',target(invocation('a'))),{code:'STALE_INVOCATION'});assert.equal(cancels,1);
 assert.equal(q.inspect().invocations.find(x=>x.id==='a').resultAccepted,false);
});
test('cancel between pump and execute dispatch needs no native stop and preserves reusable successor',async()=>{
 const releaseGate=deferred(),cancelResult=deferred();let stops=0,ranA=false,ranB=false;
 const q=createInvocationQueue({resourceBindings:[binding({cancel:async()=>{stops++;return {stopped:false,reason:'no native job exists'};},release:async t=>{if(t.invocationId==='a')await releaseGate.promise;}})]});
 const a=catchError(q.enqueue(invocation('a'),()=>{ranA=true;return 'A';}));
 queueMicrotask(()=>q.cancelInvocation('a',target(invocation('a'))).then(cancelResult.resolve,cancelResult.reject));
 const b=q.enqueue(invocation('b'),()=>{ranB=true;return 'B';}).then(value=>({value}),error=>({error}));
 await tick();
 try {assert.equal(ranA,false);assert.equal(stops,0);assert.equal(ranB,false);assert.equal(q.inspect().groups[0].quarantined,false);}
 finally {releaseGate.resolve();await a;await b;await cancelResult.promise;}
 const report=await cancelResult.promise;assert.equal(report.notStarted,true);assert.equal(report.stopConfirmed,false);
 assert.equal(report.originalTerminal,true);assert.equal(report.resourceReleased,true);assert.equal(report.reusable,true);assert.equal(report.quarantined,false);
 assert.equal((await a).code,'INVOCATION_CANCELLED');assert.equal((await b).value,'B');assert.equal(stops,0);
});
test('wrong owner binding revision request or token rejects before any native cancel',async()=>{
 const raw=deferred();let stops=0;const q=createInvocationQueue({resourceBindings:[binding({cancel:async()=>{stops++;return {stopped:true};}})]});
 const i=invocation('a'),a=q.enqueue(i,()=>raw.promise);await tick();
 for(const extra of [{ownerId:'foreign'},{bindingId:'other'},{resourceGeneration:'old-resource'},{revision:0},{requestId:'old'},{activeToken:'old'}])await assert.rejects(q.cancelInvocation('a',{...target(i),...extra}),{code:'TARGET_MISMATCH'});
 assert.equal(stops,0);raw.resolve(1);await a;
});
test('invocation IDs and root active tokens are never reused',async()=>{
 const q=createInvocationQueue({resourceBindings:[binding()]});await q.enqueue(invocation('a'),()=>1);
 await assert.rejects(q.enqueue(invocation('a'),()=>2),{code:'DUPLICATE_INVOCATION'});
 await assert.rejects(q.enqueue(invocation('b',{activeToken:'token:a'}),()=>2),{code:'DUPLICATE_ACTIVE_TOKEN'});
});
test('parent prepare can run a source read inside its owned group without queue deadlock',async()=>{
 const events=[];const q=createInvocationQueue({resourceBindings:[binding({groupId:'shared'}),binding({bindingId:'source',ownerId:'source-owner',groupId:'shared'})]});
 const result=await q.enqueue(invocation('prepare'),async ctx=>{
  events.push('parent');const child=invocation('read',{resourceBinding:'source',ownerId:'source-owner',activeToken:'token:prepare'});
  const data=await ctx.runChild(child,async c=>{assert.equal(c.target.activeToken,ctx.target.activeToken);events.push('child');return new Uint8Array([1,2,3]);});
  return data[2];
 });assert.equal(result,3);assert.deepEqual(events,['parent','child']);assert.equal(q.inspect().invocations.find(x=>x.id==='read').parentId,'prepare');
});
test('unawaited source child holds parent slot until child is terminal',async()=>{
 const childDone=deferred();let saved,successor=false;
 const q=createInvocationQueue({resourceBindings:[binding()]});
 const a=q.enqueue(invocation('parent'),ctx=>{saved=ctx.runChild(invocation('child',{activeToken:'token:parent'}),()=>childDone.promise);return 'parent';});
 const b=q.enqueue(invocation('next'),()=>{successor=true;return 'next';});await tick();assert.equal(successor,false);
 childDone.resolve('child');assert.equal(await saved,'child');assert.equal(await a,'parent');assert.equal(await b,'next');
});
test('sibling source reads are serial within parent slot and pending child cancel never stops active sibling',async()=>{
 const first=deferred(),events=[];let childCancelCalls=0;
 const q=createInvocationQueue({resourceBindings:[binding({cancel:async()=>{childCancelCalls++;return {stopped:true};}})]});
 const parent=q.enqueue(invocation('p'),async ctx=>{
  const a=ctx.runChild(invocation('a',{activeToken:'token:p'}),()=>{events.push('a');return first.promise;});
  const b=catchError(ctx.runChild(invocation('b',{activeToken:'token:p'}),()=>{events.push('b');return 'b';}));
  await tick();try {assert.deepEqual(events,['a']);}catch(error){first.resolve('a');await a;await b;throw error;}
  await q.cancelInvocation('b',target(invocation('b',{activeToken:'token:p'})));
  assert.equal((await b).code,'INVOCATION_CANCELLED');assert.equal(childCancelCalls,0);first.resolve('a');await a;
 });await parent;assert.deepEqual(events,['a']);
});
test('parent cancellation targets each active child resource owner explicitly',async()=>{
 const childRaw=deferred(),started=deferred(),stops=[];
 const q=createInvocationQueue({resourceBindings:[binding({groupId:'shared',cancel:async t=>{stops.push(t.ownerId);return {stopped:true};}}),binding({bindingId:'source',ownerId:'source-owner',groupId:'shared',cancel:async t=>{stops.push(t.ownerId);childRaw.resolve('late');return {stopped:true};}})]});
 const p=catchError(q.enqueue(invocation('p'),async ctx=>ctx.runChild(invocation('child',{ownerId:'source-owner',resourceBinding:'source',activeToken:'token:p'}),()=>{started.resolve();return childRaw.promise;})));
 await started.promise;await q.cancelInvocation('p',target(invocation('p')));assert.equal((await p).code,'INVOCATION_CANCELLED');assert.deepEqual(stops.sort(),['owner','source-owner']);
});
test('disconnect of active child quarantines queued sibling without dispatching it',async()=>{
 const running=deferred(),started=deferred();let siblingRan=false;
 const q=createInvocationQueue({resourceBindings:[binding({cancel:async t=>{if(t.invocationId==='a')running.resolve('late A');return {stopped:true};}})]});
 const p=q.enqueue(invocation('parent'),async ctx=>{
  const a=ctx.runChild(invocation('a',{activeToken:'token:parent'}),()=>{started.resolve();return running.promise;});
  const b=ctx.runChild(invocation('b',{activeToken:'token:parent'}),()=>{siblingRan=true;return 'B';});
  return Promise.allSettled([a,b]);
 });
 await started.promise;await q.disconnectResource(target(invocation('a',{activeToken:'token:parent'})),'source executor disconnected');
 const outcomes=await p;assert.equal(siblingRan,false);assert.equal(outcomes[0].status,'rejected');
 assert.equal(outcomes[1].status,'rejected');assert.equal(outcomes[1].reason.code,'RESOURCE_QUARANTINED');
 assert.equal(q.inspect().invocations.find(x=>x.id==='b').originalTerminal,false);
});
test('direct disconnect of queued child settles it before active sibling terminal instead of hanging',async()=>{
 const running=deferred(),started=deferred();let siblingRan=false;
 const q=createInvocationQueue({resourceBindings:[binding()]});
 const p=q.enqueue(invocation('parent'),async ctx=>{
  const a=ctx.runChild(invocation('a',{activeToken:'token:parent'}),()=>{started.resolve();return running.promise;});
  const b=ctx.runChild(invocation('b',{activeToken:'token:parent'}),()=>{siblingRan=true;return 'B';});
  return Promise.allSettled([a,b]);
 });
 await started.promise;let settled=false;
 const disconnected=q.disconnectResource(target(invocation('b',{activeToken:'token:parent'})),'queued source resource lost').then(report=>{settled=true;return report;});
 await tick();
 try {assert.equal(settled,true);assert.equal(siblingRan,false);const report=await disconnected;assert.equal(report.notStarted,true);assert.equal(report.quarantined,true);assert.equal(report.reusable,false);}
 finally {running.resolve('A terminal');await p;await disconnected;}
});
test('failed stop guarantee quarantines group until verified rebind, never treats timeout as stop',async()=>{
 const raw=deferred();const q=createInvocationQueue({resourceBindings:[binding({cancel:async()=>({stopped:false,reason:'timeout is not stop'})})]});
 const a=catchError(q.enqueue(invocation('a'),()=>raw.promise));await tick();
 const b=catchError(q.enqueue(invocation('b'),()=>assert.fail('quarantined job ran'))),cancel=q.cancelInvocation('a',target(invocation('a')));
 raw.resolve('late');const report=await cancel;assert.equal(report.stopConfirmed,false);assert.equal(report.quarantined,true);assert.equal((await b).code,'RESOURCE_QUARANTINED');await a;
 await assert.rejects(q.enqueue(invocation('c'),()=>1),{code:'RESOURCE_QUARANTINED'});
 assert.throws(()=>q.rebindResource(binding(),{verified:false}),{code:'REBIND_NOT_VERIFIED'});
 q.rebindResource(binding({resourceGeneration:'generation:rebound'}),{verified:true,evidenceRef:'fixture:owner-proved-stop-and-reuse'});assert.equal(await q.enqueue(invocation('d',{resourceGeneration:'generation:rebound'}),()=>4),4);
});
test('port disconnect blocks reuse and does not falsely report computation stopped',async()=>{
 const raw=deferred();const q=createInvocationQueue({resourceBindings:[binding({cancel:async()=>{throw new Error('port closed');}})]});
 const a=catchError(q.enqueue(invocation('a'),()=>raw.promise));await tick();
 const disconnected=q.disconnectResource(target(invocation('a')),'port closed');raw.reject(new Error('transport lost'));
 const report=await disconnected;await a;assert.equal(report.stopConfirmed,false);assert.equal(report.quarantined,true);assert.equal(q.inspect().groups[0].quarantined,true);
});
test('stale disconnect during successor cleanup cannot quarantine or stop its binding',async()=>{
 const cleanup=deferred();let cleanupStarted=false;
 const q=createInvocationQueue({resourceBindings:[binding({release:async t=>{if(t.invocationId==='b'){cleanupStarted=true;await cleanup.promise;}}})]});
 await q.enqueue(invocation('a'),()=>1);const b=q.enqueue(invocation('b'),()=>2);while(!cleanupStarted)await tick();
 try {await assert.rejects(q.disconnectResource(target(invocation('a')),'late old port close'),{code:'TARGET_MISMATCH'});
 assert.equal(q.inspect().groups[0].quarantined,false);}finally {cleanup.resolve();}assert.equal(await b,2);
});
test('old resource generation cannot disconnect a rebound resource before successor dispatch',async()=>{
 const q=createInvocationQueue({resourceBindings:[binding({resourceGeneration:'g1'})]});
 const a=invocation('a',{resourceGeneration:'g1'});await q.enqueue(a,()=>1);
 q.rebindResource(binding({resourceGeneration:'g2'}),{verified:true,evidenceRef:'fixture:new-resource'});
 let ran=false;const b=q.enqueue(invocation('b',{resourceGeneration:'g2'}),()=>{ran=true;return 2;}).then(value=>({value}),error=>({error}));
 await assert.rejects(q.disconnectResource({...target(a),resourceGeneration:'g1'},'late retired resource close'),{code:'TARGET_MISMATCH'});
 const result=await b;assert.equal(result.value,2);assert.equal(ran,true);assert.equal(q.inspect().groups[0].quarantined,false);
});
test('retired invocation cannot disconnect queued successor even within the same resource generation',async()=>{
 const q=createInvocationQueue({resourceBindings:[binding()]});const a=invocation('a');await q.enqueue(a,()=>1);
 const b=q.enqueue(invocation('b'),()=>2);
 await assert.rejects(q.disconnectResource(target(a),'late A callback before B dispatch'),{code:'TARGET_MISMATCH'});
 assert.equal(await b,2);assert.equal(q.inspect().groups[0].quarantined,false);
 await assert.rejects(q.disconnectResource(target(a),'late A idle callback'),{code:'TARGET_MISMATCH'});
});
test('idle rebound binding rejects stale invocation and generation but accepts explicit current resource disconnect',async()=>{
 const q=createInvocationQueue({resourceBindings:[binding({resourceGeneration:'g1'})]});
 const a=invocation('a',{resourceGeneration:'g1'});await q.enqueue(a,()=>1);
 q.rebindResource(binding({resourceGeneration:'g2'}),{verified:true,evidenceRef:'fixture:new-idle-resource'});
 await assert.rejects(q.disconnectResource({...target(a),resourceGeneration:'g1'},'stale idle callback'),{code:'TARGET_MISMATCH'});
 await assert.rejects(q.disconnectResource({...target(a),resourceGeneration:'g2'},'retired invocation even with current generation'),{code:'TARGET_MISMATCH'});
 const report=await q.disconnectResource({bindingId:'resource',ownerId:'owner',resourceGeneration:'g2'},'owner observed idle resource disconnect');
 assert.equal(report.quarantined,true);assert.equal(report.stopConfirmed,false);
 assert.throws(()=>q.rebindResource(binding({resourceGeneration:'g1'}),{verified:true,evidenceRef:'fixture:bad-generation-reuse'}),{code:'RESOURCE_GENERATION_REUSED'});
});
test('queued invocation generation cannot be replaced by rebind before dispatch',async()=>{
 const q=createInvocationQueue({resourceBindings:[binding()]});
 const b=q.enqueue(invocation('b'),()=>2);
 assert.throws(()=>q.rebindResource(binding({resourceGeneration:'new'}),{verified:true,evidenceRef:'fixture:new-resource'}),{code:'RESOURCE_ACTIVE'});
 assert.equal(await b,2);
 q.rebindResource(binding({resourceGeneration:'new'}),{verified:true,evidenceRef:'fixture:new-resource'});
 await assert.rejects(q.enqueue(invocation('old-generation'),()=>3),{code:'RESOURCE_GENERATION_MISMATCH'});
});
test('real MessagePort closure leaves native computation unconfirmed and blocks successor',async()=>{
 const {port1,port2}=new MessageChannel(),raw=deferred();let disconnected=false,ranSuccessor=false;
 const q=createInvocationQueue({resourceBindings:[binding({cancel:async()=>{if(disconnected)throw new Error('native stop unavailable on closed port');return {stopped:true};}})]});
 try {
  const a=catchError(q.enqueue(invocation('a'),()=>raw.promise));await tick();
  const b=catchError(q.enqueue(invocation('b'),()=>{ranSuccessor=true;}));
  const closed=once(port1,'close');port1.close();await closed;disconnected=true;
  const cleanup=q.disconnectResource(target(invocation('a')),'actual MessagePort closed');await tick();
  assert.equal(q.inspect().invocations.find(x=>x.id==='a').originalTerminal,false);assert.equal(ranSuccessor,false);
  raw.resolve('late native terminal');const report=await cleanup;await a;
  assert.equal(report.stopConfirmed,false);assert.equal(report.quarantined,true);assert.equal((await b).code,'RESOURCE_QUARANTINED');
 }finally {raw.resolve();port1.close();port2.close();}
});
test('independent resource groups may run concurrently and dispose stops only configured own resources',async()=>{
 const gates=[deferred(),deferred()],started=[],stops=[];
 const q=createInvocationQueue({resourceBindings:[binding({cancel:async()=>{stops.push('one');gates[0].resolve();return {stopped:true};}}),binding({bindingId:'two',ownerId:'two-owner',cancel:async()=>{stops.push('two');gates[1].resolve();return {stopped:true};}})]});
 const a=catchError(q.enqueue(invocation('a'),()=>{started.push('a');return gates[0].promise;}));
 const b=catchError(q.enqueue(invocation('b',{resourceBinding:'two',ownerId:'two-owner'}),()=>{started.push('b');return gates[1].promise;}));
 await tick();assert.equal(started.length,2);await q.dispose();await a;await b;assert.deepEqual(stops.sort(),['one','two']);
 await assert.rejects(q.enqueue(invocation('c'),()=>1),{code:'QUEUE_DISPOSED'});
});
test('leaked child context and cross-group child cannot dispatch after parent is done',async()=>{
 let context;const q=createInvocationQueue({resourceBindings:[binding(),binding({bindingId:'other',ownerId:'other'})]});
 await q.enqueue(invocation('a'),ctx=>{context=ctx;return 1;});
 await assert.rejects(context.runChild(invocation('child',{activeToken:'token:a'}),()=>1),{code:'STALE_PARENT'});
 await q.enqueue(invocation('b'),async ctx=>{await assert.rejects(ctx.runChild(invocation('cross',{resourceBinding:'other',ownerId:'other',activeToken:'token:b'}),()=>1),{code:'CHILD_GROUP_MISMATCH'});});
});
test('failed owner release quarantines the resource and does not claim reusable',async()=>{
 const q=createInvocationQueue({resourceBindings:[binding({release:async()=>{throw new Error('release failed');}})]});
 await assert.rejects(q.enqueue(invocation('a'),()=>1),{code:'RESOURCE_CLEANUP_FAILED'});assert.equal(q.inspect().groups[0].quarantined,true);
});
test('real Worker termination precedes next Worker execution; transfer detaches sender ownership',async()=>{
 let worker=null,pending=null;const events=[];
 const foreignWorker=new Worker(new URL('./queue-worker-fixture.mjs',import.meta.url));await once(foreignWorker,'online');
 const q=createInvocationQueue({resourceBindings:[binding({cancel:async t=>{events.push(`stop:${t.invocationId}`);await worker.terminate();return {stopped:true};},afterTerminal:async()=>({reusable:true}),release:async()=>{events.push('release');worker=null;pending=null;}})]});
 const execute=async ctx=>{
  worker=new Worker(new URL('./queue-worker-fixture.mjs',import.meta.url));
  worker.on('exit',code=>{pending?.reject(Object.assign(new Error(`worker exit ${code}`),{code:'WORKER_EXIT'}));});
  await once(worker,'online');const ready=once(worker,'message');worker.postMessage({op:'ready'});await ready;
  if(ctx.target.invocationId==='a') {pending=deferred();return pending.promise;}
  const values=Float32Array.of(1,2,3);const bytes=values.buffer;const result=once(worker,'message');worker.postMessage({op:'sum',data:values},[bytes]);assert.equal(bytes.byteLength,0);
  const [reply]=await result;await worker.terminate();return reply.sum;
 };
 const a=catchError(q.enqueue(invocation('a'),execute));while(!worker||!pending)await tick();
 const cancel=q.cancelInvocation('a',target(invocation('a'))),b=q.enqueue(invocation('b'),execute);
 try {
  assert.equal((await cancel).stopConfirmed,true);assert.equal((await a).code,'INVOCATION_CANCELLED');assert.equal(await b,6);assert.deepEqual(events,['stop:a','release','release']);
  const foreignReply=once(foreignWorker,'message');foreignWorker.postMessage({op:'sum',data:Float32Array.of(4,5)});
  assert.equal((await foreignReply)[0].sum,9);
 }finally {await foreignWorker.terminate();if(worker)await worker.terminate();}
});

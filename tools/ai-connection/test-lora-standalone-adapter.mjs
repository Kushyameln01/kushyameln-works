// Management/native connection tests, separate from owner all-patch arithmetic evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createReferenceSide} from '../../docs/shared/ai-connection/adapters/lora-standalone/reference.mjs';
import {createLoraFixtureFile} from './lora-standalone-fixtures.mjs';
import {mkdtemp,open,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const module=await import('../../docs/shared/ai-connection/adapters/lora-standalone/adapter.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
test('management exposes a distinct standalone side adapter without replacing v2',async()=>{
 assert.equal(typeof module.createLoraManagementSide,'function','New standalone control adapter required');
});
async function setup(side='HIGH',behavior={}){const backing=await createReferenceSide({side,behavior}),manager=await module.createLoraManagementSide(backing);return {...backing,manager,async close(){backing.controls.continue();try{await manager.recover();}catch{}await manager.dispose();await backing.disposeBacking();}};}
async function register(f,pairId){return f.manager.register({pairId,file:createLoraFixtureFile({side:f.side,pairId})});}
async function read(f){const view=f.consumer.capture();try{return [...(await view.readBlock(f.registry.targets[0].weightId,5120,5120)).slice(0,4)];}finally{await view.release();}}
test('actual SDK File registration, two pairs, removal, repeat and base restoration run through common control snapshot',async()=>{
 const f=await setup();try{
  const progress=[];await f.manager.register({pairId:'light',file:createLoraFixtureFile({side:f.side,pairId:'light'}),onProgress:p=>progress.push(p)});assert.equal(f.manager.inspect().registered.length,1);assert.ok(progress.length>0);
  await register(f,'detail');
  for(const [selections,want] of [
   [[{pairId:'detail',strength:1},{pairId:'light',strength:1}],[-.0390625,-.03125,-.0234375,-.015625]],
   [[{pairId:'light',strength:1}],[-.0078125,0,.0078125,.015625]],
   [[{pairId:'light',strength:1}],[-.0078125,0,.0078125,.015625]],
   [[{pairId:'detail',strength:-1}],[-.0078125,0,.0078125,.015625]]
  ]){const result=await f.manager.apply({selections,targets:f.targets});assert.equal(result.status,'EXECUTION_COMPLETED');assert.equal(result.nativeReceipt.state,'CONSUMER_APPLIED');assert.equal(result.nativeReceipt.coverage,'PARTIAL');assert.equal(result.snapshot.executionScope.kind,'normal');assert.equal(result.edgeDecision.compatibility,'COMPATIBLE');assert.equal(result.terminal.originalTerminal,true);assert.equal(result.terminal.resourceReleased,true);assert.equal(result.nativeReceipt.consumerEpoch,f.consumer.currentEpoch());assert.deepEqual(await read(f),want);assert.equal(result.graphBinding,'UNBOUND');assert.equal(result.generationReady,false);}
  const base=await f.manager.restoreBase();assert.equal(base.nativeReceipt.state,'CONSUMER_APPLIED');assert.deepEqual(await read(f),[-.0390625,-.03125,-.0234375,-.015625]);assert.ok(f.kernel.stats().productCalls>0);
 }finally{await f.close();}
});
test('opaque manager plans and prepared handles cannot be copied into native authority and explicit release preserves consumer lease',async()=>{
 const f=await setup();try{await register(f,'light');const plan=await f.manager.compose({selections:[{pairId:'light',strength:1}],targets:f.targets}),p=await f.manager.prepare({planHandle:plan.planHandle});assert.equal(p.manifest.coverage,'PARTIAL');assert.equal(p.handle,undefined);const applied=await f.manager.stage({preparedHandle:p.preparedHandle});assert.equal(applied.nativeReceipt.localRevision,plan.plan.localRevision);assert.notEqual(applied.managerRevision,applied.nativeReceipt.localRevision);await f.manager.release({preparedHandle:p.preparedHandle});await assert.rejects(()=>f.manager.stage({preparedHandle:p.preparedHandle}),{code:'PREPARED_HANDLE_REQUIRED'});assert.deepEqual(await read(f),[-.0078125,0,.0078125,.015625]);await assert.rejects(()=>f.manager.prepare({planHandle:structuredClone(plan.plan)}),{code:'PLAN_HANDLE_REQUIRED'});}finally{await f.close();}
});
test('targeted cancellation waits original Hike consumer barrier and old target cannot cancel successor',async()=>{
 const f=await setup('HIGH',{mode:'delay'});try{await register(f,'light');const promise=f.manager.apply({selections:[{pairId:'light',strength:1}],targets:f.targets,requestId:'cancel-A'}),rejected=assert.rejects(promise,/cancel|abort|stale/i);await f.controls.waitForBlock();const target=f.manager.inspect().activeTarget;let terminal=false;const cancelled=f.manager.cancel(target).then(v=>{terminal=true;return v;});await new Promise(r=>setImmediate(r));assert.equal(terminal,false);assert.equal(f.consumer.currentEpoch(),0);f.controls.continue();assert.equal((await cancelled).originalTerminal,true);await rejected;f.controls.setBehavior({mode:'success'});await f.manager.recover();const result=await f.manager.apply({selections:[{pairId:'light',strength:1}],targets:f.targets,requestId:'after-cancel'});assert.equal(result.nativeReceipt.state,'CONSUMER_APPLIED');await assert.rejects(()=>f.manager.cancel(target),{code:'TARGET_MISMATCH'});assert.deepEqual(await read(f),[-.0078125,0,.0078125,.015625]);}finally{await f.close();}
});
test('SDK candidate cleanup failure quarantines common queue until explicit native recovery',async()=>{
 const f=await setup('HIGH',{mode:'fail',rollbackFailures:1});try{await register(f,'light');await assert.rejects(()=>f.manager.apply({selections:[{pairId:'light',strength:1}],targets:f.targets}));assert.equal(f.manager.inspect().recoveryRequired,true);await assert.rejects(()=>f.manager.apply({selections:[],targets:f.targets}),{code:'RESOURCE_QUARANTINED'});f.controls.setBehavior({mode:'success'});const recovered=await f.manager.recover();assert.equal(recovered.recovered,true);assert.equal(f.manager.inspect().recoveryRequired,false);assert.equal((await f.manager.apply({selections:[{pairId:'light',strength:1}],targets:f.targets})).nativeReceipt.state,'CONSUMER_APPLIED');}finally{await f.close();}
});
test('SDK disposal never invalidates consumer-owned active/read leases or disposes caller kernel/base',async()=>{
 const f=await setup('LOW');try{await register(f,'light');await f.manager.apply({selections:[{pairId:'light',strength:1}],targets:f.targets});const view=f.consumer.capture();try{await f.manager.dispose();f.kernel.dispose();assert.equal(f.kernel.stats().disposed,false);assert.equal(f.inspect().baseAlive,true);assert.deepEqual([...(await view.readBlock(f.registry.targets[0].weightId,5120,5120)).slice(0,4)],[.0234375,.03125,.0390625,.046875]);}finally{await view.release();}await f.consumer.dispose();await f.disposeBacking();assert.equal(f.kernel.stats().memoryBytes,0);}finally{await f.close();}
});
test('streamed native payload and manifest reopen into a different SDK authority and apply without original registrations',async()=>{
 const f=await setup(),next=await setup(),directory=await mkdtemp(join(tmpdir(),'managed-lora-stream-'));let maxChunk=0,sources=0;
 try{await register(f,'light');await register(f,'detail');const applied=await f.manager.apply({selections:[{pairId:'light',strength:1},{pairId:'detail',strength:-1}],targets:f.targets});
  const saved=await f.manager.save({preparedHandle:applied.preparedHandle,writer:{async writeSource(name,chunks){const file=await open(join(directory,name),'wx');try{for await(const bytes of chunks){assert.ok(bytes instanceof Uint8Array);maxChunk=Math.max(maxChunk,bytes.byteLength);await file.write(bytes);}sources++;}finally{await file.close();}},async writeManifest(manifest){await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest),{flag:'wx'});}}});
  assert.equal(saved.managementAcknowledgement.state,'SAVED');assert.equal(sources,2);assert.ok(maxChunk<=1048576);const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8')),payloads=new Map();for(let i=0;i<2;i++){const name='source-'+i+'.safetensors';payloads.set(name,new File([await readFile(join(directory,name))],name));}
  const reopened=await next.manager.openPackage({manifest,sources:payloads});assert.notEqual(reopened.managementAcknowledgement.sdkInstanceId,applied.nativeReceipt.sdkInstanceId);assert.notEqual(reopened.managementAcknowledgement.transactionId,applied.nativeReceipt.transactionId);assert.equal(reopened.managementAcknowledgement.originPlanId,manifest.planId);assert.equal(next.manager.inspect().registered.length,0);const result=await next.manager.stage({preparedHandle:reopened.preparedHandle});assert.equal(result.nativeReceipt.state,'CONSUMER_APPLIED');assert.deepEqual(await read(next),[.0234375,.03125,.0390625,.046875]);await next.manager.release({preparedHandle:reopened.preparedHandle});assert.deepEqual(await read(next),[.0234375,.03125,.0390625,.046875]);
 }finally{await f.close();await next.close();await rm(directory,{recursive:true,force:true});}
});
test('duplicate in-flight manager request cannot replace cancellation authority or quarantine its original target',async()=>{
 const f=await setup('HIGH',{mode:'delay'});try{await register(f,'light');const promise=f.manager.apply({selections:[{pairId:'light',strength:1}],targets:f.targets,requestId:'duplicate'}),rejected=assert.rejects(promise,/cancel|abort|stale/i);await f.controls.waitForBlock();const target=f.manager.inspect().activeTarget;await assert.rejects(()=>f.manager.compose({selections:[],requestId:'duplicate'}),{code:'DUPLICATE_REQUEST'});const cancellation=f.manager.cancel(target);f.controls.continue();const terminal=await cancellation;await rejected;assert.equal(terminal.reusable,true);assert.equal(f.manager.inspect().queue.groups.some(g=>g.quarantined),false);}finally{await f.close();}
});
test('cancel after native commit keeps publication divergence across recover until a fresh base compensation succeeds',async()=>{
 const backing=await createReferenceSide({side:'HIGH'});let entered,finish,once=true;const started=new Promise(r=>entered=r),gate=new Promise(r=>finish=r);
 const consumer={...backing.consumer,async releaseCandidate(...args){await backing.consumer.releaseCandidate(...args);if(once){once=false;entered();await gate;}}};
 const manager=await module.createLoraManagementSide({...backing,consumer});
 try{await manager.register({pairId:'light',file:createLoraFixtureFile({side:'HIGH',pairId:'light'})});const pending=manager.apply({selections:[{pairId:'light',strength:1}],targets:backing.targets}),rejected=assert.rejects(pending,/cancel|abort|stale/i);await started;assert.equal(consumer.currentEpoch(),1);const target=manager.inspect().activeTarget,cancelled=manager.cancel(target);finish();await cancelled;await rejected;assert.equal(manager.inspect().publicationDiverged,true);const recovery=await manager.recover();assert.equal(recovery.compensationRequired,true);assert.equal(manager.inspect().publicationDiverged,true,'resource recovery is not a fresh state compensation');assert.equal((await manager.query()).dispatchSupported,false);await assert.rejects(()=>manager.register({pairId:'detail',file:createLoraFixtureFile({side:'HIGH',pairId:'detail'})}),{code:'COMPENSATION_REQUIRED'});assert.equal((await manager.restoreBase()).nativeReceipt.state,'CONSUMER_APPLIED');assert.equal(manager.inspect().publicationDiverged,false);const view=consumer.capture();try{assert.deepEqual([...(await view.readBlock(backing.registry.targets[0].weightId,5120,5120)).slice(0,4)],[-.0390625,-.03125,-.0234375,-.015625]);}finally{await view.release();}
 }finally{finish();await manager.dispose();await backing.disposeBacking();}
});
test('queued handle and writer arguments are captured on acceptance instead of changing with caller mutation',async()=>{
 const f=await setup();let entered,finish;const started=new Promise(r=>entered=r),gate=new Promise(r=>finish=r);let expectedWrites=0;
 const drain={async writeSource(name,chunks){for await(const _ of chunks){}expectedWrites++;},async writeManifest(){}};
 try{await register(f,'light');const applied=await f.manager.apply({selections:[{pairId:'light',strength:1}],targets:f.targets});const first=f.manager.save({preparedHandle:applied.preparedHandle,writer:{async writeSource(name,chunks){entered();await gate;for await(const _ of chunks){}},async writeManifest(){}}});await started;
  const input={preparedHandle:applied.preparedHandle,writer:drain},second=f.manager.save(input);input.writer={async writeSource(){throw Error('mutated writer must not be used');},async writeManifest(){}};
  const releaseInput={preparedHandle:applied.preparedHandle},released=f.manager.release(releaseInput);releaseInput.preparedHandle='foreign-handle';finish();await first;await second;await released;assert.equal(expectedWrites,1);assert.equal(f.manager.inspect().prepared.length,0);assert.deepEqual(await read(f),[-.0078125,0,.0078125,.015625]);
 }finally{finish();await f.close();}
});
test('failed SDK final kernel-lease cleanup can recover after queue closure and then retry disposal',async()=>{
 const f=await createReferenceSide({side:'HIGH'});let failOnce=true;
 const kernel={...f.kernel,retain(ownerId){const cap=f.kernel.retain(ownerId);return {...cap,release(){if(failOnce){failOnce=false;throw Error('owned kernel lease cleanup failed once');}return cap.release();}};}};
 const manager=await module.createLoraManagementSide({...f,kernel});
 try{await manager.register({pairId:'light',file:createLoraFixtureFile({side:'HIGH',pairId:'light'})});const plan=await manager.compose({selections:[{pairId:'light',strength:1}],targets:f.targets});await manager.prepare({planHandle:plan.planHandle});await assert.rejects(()=>manager.dispose());assert.equal((await manager.query()).dispatchSupported,false);const recovered=await manager.recover();assert.equal(recovered.recovered,true);assert.equal(recovered.disposalPending,true);await assert.rejects(()=>manager.apply({selections:[]}),{code:'LORA_DISPOSAL_PENDING'});assert.equal((await manager.dispose()).disposed,true);assert.equal(f.kernel.stats().leaseCount,0);}finally{try{await manager.dispose();}catch{}await f.disposeBacking();}
});
test('abort between queue running and native dispatch reaches an unstarted terminal without waiting on an uncreated native promise',async()=>{
 const f=await setup(),controller=new AbortController();let timer,outcome;
 try{const pending=f.manager.restoreBase({signal:controller.signal,requestId:'abort-before-dispatch'}).then(value=>({status:'fulfilled',value}),error=>({status:'rejected',error}));queueMicrotask(()=>controller.abort());outcome=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'deadline'}),100);})]);assert.equal(outcome.status,'rejected','Undispatched cancellation must not wait forever in owner afterTerminal');assert.equal(outcome.error.code,'INVOCATION_CANCELLED');assert.equal(f.manager.inspect().sdk.localRevision,0);assert.equal(f.manager.inspect().consumerEpoch,0);const terminal=f.manager.inspect().queue.invocations.find(x=>x.requestId==='abort-before-dispatch');assert.equal(terminal.originalTerminal,true);assert.equal(terminal.nativeStopRequired,false);assert.equal(terminal.reusable,true);assert.equal((await f.manager.restoreBase()).nativeReceipt.state,'CONSUMER_APPLIED');}finally{clearTimeout(timer);if(outcome?.status!=='deadline')await f.close();else await f.disposeBacking();}
});
test('lost cleanup acknowledgement after consumer commit cannot publish readiness even when SDK rollback no longer owns the released candidate',async()=>{
 const f=await createReferenceSide({side:'HIGH'});let once=true;
 const consumer={...f.consumer,async releaseCandidate(...args){await f.consumer.releaseCandidate(...args);if(once){once=false;throw Error('response lost after release completed');}}},manager=await module.createLoraManagementSide({...f,consumer});
 try{await manager.register({pairId:'light',file:createLoraFixtureFile({side:'HIGH',pairId:'light'})});await assert.rejects(()=>manager.apply({selections:[{pairId:'light',strength:1}],targets:f.targets}),/response lost/);assert.equal(consumer.currentEpoch(),1);assert.equal(manager.inspect().sdk.recoveryRequired,false);assert.equal(manager.inspect().publicationDiverged,true);assert.equal((await manager.query()).dispatchSupported,false);assert.equal((await manager.recover()).compensationRequired,true);assert.equal(manager.inspect().publicationDiverged,true);assert.equal((await manager.restoreBase()).nativeReceipt.state,'CONSUMER_APPLIED');assert.equal(manager.inspect().publicationDiverged,false);}
 finally{await manager.dispose();await f.disposeBacking();}
});
test('late cancel after action terminal but before queue acceptance never adopts a native commit as current management success',async()=>{
 const f=await createReferenceSide({side:'HIGH'}),controller=new AbortController();let manager,scheduled=false,cancelObserved=false;
 const consumer={...f.consumer,async releaseCandidate(...args){await f.consumer.releaseCandidate(...args);if(!scheduled){scheduled=true;let attempts=0;const spin=()=>{const invocation=manager.inspect().queue.invocations.at(-1);if(invocation.originalTerminal&&invocation.state==='running'){cancelObserved=true;controller.abort();}else if(attempts++<300)queueMicrotask(spin);};queueMicrotask(spin);}}};
 manager=await module.createLoraManagementSide({...f,consumer});
 try{await manager.register({pairId:'light',file:createLoraFixtureFile({side:'HIGH',pairId:'light'})});await assert.rejects(()=>manager.apply({selections:[{pairId:'light',strength:1}],targets:f.targets,signal:controller.signal}),{code:'INVOCATION_CANCELLED'});assert.equal(cancelObserved,true);assert.equal(consumer.currentEpoch(),1);assert.equal(manager.inspect().snapshot,null);assert.equal(manager.inspect().publicationDiverged,true);assert.equal((await manager.query()).dispatchSupported,false);await manager.recover();assert.equal(manager.inspect().publicationDiverged,true);await manager.restoreBase();assert.equal(manager.inspect().publicationDiverged,false);}
 finally{await manager.dispose();await f.disposeBacking();}
});

test('revoked native consumer epoch stays observable and cannot prevent SDK disposal',async()=>{
 const backing=await createReferenceSide({side:'HIGH'});let revoked=false;const consumer={...backing.consumer,currentEpoch(){if(revoked)throw Object.assign(Error('Managed weight feed revoked'),{code:'DIFFUSION_WEIGHT_FEED_STALE'});return backing.consumer.currentEpoch();}};
 const manager=await module.createLoraManagementSide({...backing,consumer});assert.equal(manager.inspect().consumerEpoch,0);revoked=true;
 const observation=manager.inspect();assert.equal(observation.consumerEpoch,null);assert.equal(observation.consumerEpochUnavailable.code,'DIFFUSION_WEIGHT_FEED_STALE');assert.equal(observation.recoveryRequired,true);
 await manager.dispose();assert.equal(manager.inspect().disposed,true);assert.equal(manager.inspect().consumerEpoch,null);await manager.dispose();await backing.disposeBacking();
});

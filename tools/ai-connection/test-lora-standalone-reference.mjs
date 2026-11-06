// Management integration fixture tests: real native standalone SDK and Hike.
// The owner reference consumer performs range/F32 validation. No NN/base claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const reference=await import('../../docs/shared/ai-connection/adapters/lora-standalone/reference.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
const fixtures=await import('./lora-standalone-fixtures.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
async function setup(side='HIGH',behavior={}){
 assert.equal(typeof reference.createReferenceSide,'function','Development wrapper around owner reference host required');
 const native=await import('../../docs/shared/ai-connection/adapters/lora-standalone/native.mjs');
 const f=await reference.createReferenceSide({side,behavior,wasmBytes:new Uint8Array(await readFile(native.LORA_STANDALONE_WASM_URL))});
 const sdk=native.createLoraStandalone(f);return {...f,sdk,async close(){f.controls.continue();try{await sdk.recover();}catch{}await sdk.dispose();await f.disposeBacking();}};
}
async function register(sdk,side,pairId){const file=fixtures.createLoraFixtureFile({side,pairId});assert.ok(file instanceof File);assert.match(file.name,/\.safetensors$/);return sdk.register({pairId,file});}
test('canonical full-shape File fixture uses actual Hike and selected completed F32 without a four-file prerequisite',async()=>{
 const f=await setup();try{
  assert.equal(f.registry.mappingVersion,'bernini-comfy-canonical/1.0');assert.deepEqual(f.registry.targets[0].fullShape,[5120,5120]);
  await register(f.sdk,'HIGH','light');const applied=await f.sdk.apply({selections:[{pairId:'light',strength:1}],targets:f.targets,target:f.consumer});assert.equal(applied.state,'CONSUMER_APPLIED');assert.equal(applied.coverage,'PARTIAL');
  const view=f.consumer.capture();try{const data=await view.readBlock(f.registry.targets[0].weightId,5120,5120);assert.deepEqual([...data.slice(0,4)],[-.0078125,0,.0078125,.015625]);}finally{await view.release();}
  assert.ok(f.kernel.stats().productCalls>0);assert.ok(f.kernel.stats().applyCalls>0);assert.equal(f.kernel.stats().memoryBytes,33554432);assert.equal(f.sdk.stats().registeredSources,1);
 }finally{await f.close();}
});
test('SDK and kernel creator disposal preserve an independently retained consumer lease until final release',async()=>{
 const f=await setup('LOW');try{
  await register(f.sdk,'LOW','light');await f.sdk.apply({selections:[{pairId:'light',strength:1}],targets:f.targets,target:f.consumer});const view=f.consumer.capture();
  try{await f.sdk.dispose();f.kernel.dispose();assert.equal(f.kernel.stats().closing,true);assert.equal(f.kernel.stats().disposed,false);assert.ok(f.kernel.stats().leaseCount>0);const data=await view.readBlock(f.registry.targets[0].weightId,5120,5120);assert.deepEqual([...data.slice(0,4)],[.0234375,.03125,.0390625,.046875]);}finally{await view.release();}
  await f.consumer.dispose();await f.disposeBacking();assert.equal(f.kernel.stats().leaseCount,0);assert.equal(f.kernel.stats().memoryBytes,0);assert.equal(f.kernel.stats().disposed,true);assert.equal(f.inspect().baseAlive,false);
 }finally{await f.close();}
});
test('delay and failure controls remain outside native validation and cancellation waits the actual block barrier',async()=>{
 const f=await setup('HIGH',{mode:'delay'});try{
  await register(f.sdk,'HIGH','light');const pending=f.sdk.apply({selections:[{pairId:'light',strength:1}],targets:f.targets,target:f.consumer});const rejected=assert.rejects(pending,/cancel|abort|stale/i);await f.controls.waitForBlock();f.sdk.cancel();assert.equal(f.sdk.stats().busy,true);assert.equal(f.consumer.currentEpoch(),0);f.controls.continue();await rejected;assert.equal(f.consumer.stats().candidates,0);
  f.controls.setBehavior({mode:'fail'});await assert.rejects(f.sdk.apply({selections:[{pairId:'light',strength:1}],targets:f.targets,target:f.consumer}),{code:'REFERENCE_CONSUMER_FAILED'});assert.equal(f.consumer.currentEpoch(),0);
  f.controls.setBehavior({mode:'success'});assert.equal((await f.sdk.apply({selections:[{pairId:'light',strength:1}],targets:f.targets,target:f.consumer})).state,'CONSUMER_APPLIED');
 }finally{await f.close();}
});
test('backing provider release refuses a live SDK prepared capability and succeeds after its terminal release',async()=>{
 const f=await setup();try{
  await register(f.sdk,'HIGH','light');const prepared=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}],targets:f.targets}));await assert.rejects(f.disposeBacking(),{code:'REFERENCE_BACKING_IN_USE'});assert.equal(f.inspect().baseAlive,true);await f.sdk.release(prepared);await f.sdk.dispose();await f.disposeBacking();assert.equal(f.inspect().baseAlive,false);
 }finally{await f.close();}
});

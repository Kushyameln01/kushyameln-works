import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

let createResourceObserver;
try { ({createResourceObserver}=await import('../../docs/shared/diffusion-models/diagnostics/resource-observer/observer.mjs')); }
catch(error) { if(error.code!=='ERR_MODULE_NOT_FOUND')throw error; }
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Hand-authored modules: one exported 64KiB Memory, and env.memory re-exported.
const owned=Uint8Array.from(Buffer.from('0061736d010000000503010001070a01066d656d6f72790200','hex'));
const imported=Uint8Array.from(Buffer.from('0061736d01000000020f0103656e76066d656d6f7279020001070a01066d656d6f72790200','hex'));
const importOnly=Uint8Array.from(Buffer.from('0061736d01000000020f0103656e76066d656d6f7279020001','hex'));
const facade=()=>Object.defineProperties({},Object.getOwnPropertyDescriptors(WebAssembly));
const available={skip:!createResourceObserver};
const make=(wasm=facade(),options={})=>({wasm,observer:createResourceObserver({wasm,modules:[{sha256:sha(owned),role:'hike'},{sha256:sha(imported),role:'ort'}],...options})});

test('resource observer API exists',()=>assert.equal(typeof createResourceObserver,'function'));

test('bytes and Module inputs identify imported/exported Memory once and update capacity',available,async()=>{
 const {wasm,observer}=make();observer.install();
 try {
  const memory=new wasm.Memory({initial:1,maximum:3});
  const first=await wasm.instantiate(imported,{env:{memory}});
  assert.equal(first.instance.exports.memory,memory);
  const module=await wasm.compile(imported),second=await wasm.instantiate(module,{env:{memory}});
  assert.ok(second instanceof wasm.Instance);assert.equal(second.exports.memory,memory);
  await observer.settle();
  let report=observer.snapshot('created');assert.equal(report.phase,'created');assert.equal(report.memories.length,1);
  assert.deepEqual(report.memories.map(m=>({hash:m.moduleSHA256,roles:m.roles,capacity:m.capacityBytes,high:m.highWaterBytes,alive:m.alive})),[{hash:sha(imported),roles:['ort'],capacity:65536,high:65536,alive:true}]);
  // Plain ORT-style import and its exact re-export are the same native Memory.
  assert.equal(report.skippedMemoryImports,0);assert.deepEqual(report.unattributedMemoryImports,[]);assert.equal(report.memoryImportObservationComplete,true);
  assert.equal(observer.diagnostics().memoryImportObservationComplete,true);
  memory.grow(1);report=observer.snapshot('grown');assert.equal(report.memories[0].capacityBytes,131072);assert.equal(report.memories[0].highWaterBytes,131072);
  assert.equal(observer.diagnostics().weakMemoryReferences,true);assert.equal('sessionCount' in report,false);
 } finally {observer.restore();}
});

test('compile then synchronous Instance construction observes exports and preserves newTarget',available,async()=>{
 const {wasm,observer}=make(),original=wasm.Instance;observer.install();
 try {
  const module=await wasm.compile(owned),instance=new wasm.Instance(module,{});
  assert.ok(instance instanceof original);assert.ok(instance instanceof wasm.Instance);
  class Derived extends wasm.Instance {}
  const derived=new Derived(module,{});assert.equal(Object.getPrototypeOf(derived),Derived.prototype);
  assert.throws(()=>new wasm.Instance({}),TypeError);
  await observer.settle();assert.equal(observer.snapshot('constructed').memories.length,2);
  assert.ok(observer.snapshot('constructed').memories.every(m=>m.moduleSHA256===sha(owned)&&m.capacityBytes===65536));
 } finally {observer.restore();}
 assert.equal(wasm.Instance,original);
});

test('actual imported Memory is observed even when the module does not export it',available,async()=>{
 const {wasm,observer}=make(undefined,{modules:[{sha256:sha(importOnly),role:'ort'}]});observer.install();
 try{
  const memory=new wasm.Memory({initial:1}),result=await wasm.instantiate(importOnly,{env:{memory}});
  assert.deepEqual(Object.keys(result.instance.exports),[]);await observer.settle();
  assert.equal(observer.snapshot('import-only').memories.length,1);assert.equal(observer.snapshot('import-only').memories[0].moduleSHA256,sha(importOnly));
 }finally{observer.restore();}
});

test('known module hash cannot hide an unobserved getter Memory import',available,async()=>{
 const {wasm,observer}=make(undefined,{modules:[{sha256:sha(importOnly),role:'ort'}]});observer.install();let reads=0;
 try{
  const memory=new wasm.Memory({initial:1}),result=await wasm.instantiate(importOnly,{env:{get memory(){reads++;return memory;}}});
  assert.deepEqual(Object.keys(result.instance.exports),[]);await observer.settle();assert.equal(reads,1,'Observer must not invoke the native import getter again');
  const report=observer.snapshot('getter-import'),diagnostics=observer.diagnostics();
  assert.equal(report.memories.length,0);assert.equal(report.unknownModuleCount,0,'The module hash is known, but its imported Memory was not recovered');
  assert.equal(report.skippedMemoryImports,1);assert.equal(report.memoryImportObservationComplete,false);
  assert.deepEqual(report.unattributedMemoryImports,[{moduleSHA256:sha(importOnly),importModule:'env',importName:'memory',reason:'memory-accessor'}]);
  assert.equal(diagnostics.skippedMemoryImports,1);assert.equal(diagnostics.memoryImportObservationComplete,false);assert.deepEqual(diagnostics.unattributedMemoryImports,report.unattributedMemoryImports);
  assert.equal(reads,1,'Reports must remain passive');
 }finally{observer.restore();}
});

test('compileStreaming and instantiateStreaming retain shape and MIME rejection',available,async()=>{
 const {wasm,observer}=make();observer.install();
 try {
  const response=()=>new Response(owned,{headers:{'Content-Type':'application/wasm'}});
  const module=await wasm.compileStreaming(response());const direct=new wasm.Instance(module,{});
  const result=await wasm.instantiateStreaming(Promise.resolve(response()),{});
  assert.ok(result.module instanceof wasm.Module);assert.ok(result.instance instanceof wasm.Instance);assert.ok(direct.exports.memory instanceof wasm.Memory);
  await assert.rejects(wasm.instantiateStreaming(new Response(owned,{headers:{'Content-Type':'text/plain'}}),{}),TypeError);
  await observer.settle();assert.equal(observer.snapshot('streamed').memories.length,2);
  assert.ok(observer.snapshot('streamed').memories.every(m=>m.moduleSHA256===sha(owned)));
 } finally {observer.restore();}
});

test('unknown modules remain explicit and shared Memory can carry multiple known roles',available,async()=>{
 const {wasm,observer}=make(undefined,{modules:[{sha256:sha(owned),role:'hike'}]});observer.install();
 try {
  const memory=new wasm.Memory({initial:1});await wasm.instantiate(imported,{env:{memory}});
  await observer.settle();const unknown=observer.snapshot('unknown').memories[0];assert.equal(unknown.moduleSHA256,null);assert.deepEqual(unknown.roles,[]);assert.equal(observer.diagnostics().unknownModuleCount,1);
 } finally {observer.restore();}
 const both=make();both.observer.install();
 try {
  const first=await both.wasm.instantiate(owned,{});await both.wasm.instantiate(imported,{env:{memory:first.instance.exports.memory}});await both.observer.settle();
  const report=both.observer.snapshot('shared');assert.equal(report.memories.length,1);assert.deepEqual(report.memories[0].roles,['hike','ort']);assert.deepEqual(report.memories[0].moduleSHA256s,[sha(owned),sha(imported)].sort());
 } finally {both.observer.restore();}
});

test('wrappers return the exact native Promise and preserve synchronous thrown error and receiver',available,async()=>{
 const wasm=facade(),originalCompile=wasm.compile,originalInstantiate=wasm.instantiate,sentinel=Error('native boundary'),receiver={};let returned,receivedThis;
 wasm.compile=function(...args){receivedThis=this;returned=Reflect.apply(originalCompile,WebAssembly,args);return returned;};
 wasm.instantiate=function(){throw sentinel;};
 const {observer}=make(wasm);const before=Object.getOwnPropertyDescriptors(wasm);observer.install();
 try {
  const p=Reflect.apply(wasm.compile,receiver,[owned]);assert.equal(p,returned);assert.equal(receivedThis,receiver);await p;
  assert.throws(()=>wasm.instantiate(owned),error=>error===sentinel);
  const bad=wasm.compile(new Uint8Array([0]));assert.equal(bad,returned);await assert.rejects(bad,WebAssembly.CompileError);
  await observer.settle();
 } finally {observer.restore();}
 for(const key of ['compile','compileStreaming','instantiate','instantiateStreaming','Instance'])assert.deepEqual(Object.getOwnPropertyDescriptor(wasm,key),before[key]);
 assert.equal(wasm.instantiate===originalInstantiate,false);
});

test('native WebAssembly functions remain non-constructible and retain function metadata',available,()=>{
 const {wasm,observer}=make(),before=Object.fromEntries(['compile','compileStreaming','instantiate','instantiateStreaming'].map(name=>[name,{name:wasm[name].name,length:wasm[name].length}]));observer.install();
 try {
  for(const name of Object.keys(before)){
   assert.throws(()=>Reflect.construct(wasm[name],[]),TypeError,name+' must retain native non-constructor semantics');
   assert.equal(wasm[name].name,before[name].name);assert.equal(wasm[name].length,before[name].length);
  }
 }finally{observer.restore();}
});

test('stream read rejection remains the native error without an observer unhandled rejection',available,async()=>{
 const {wasm,observer}=make(),sentinel=Error('stream failed');observer.install();
 try {
  const body=new ReadableStream({start(controller){controller.error(sentinel);}}),response=new Response(body,{headers:{'Content-Type':'application/wasm'}});
  await assert.rejects(wasm.compileStreaming(response),error=>error===sentinel);await observer.settle();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(observer.snapshot('failed-stream').memories.length,0);
 }finally{observer.restore();}
});

test('digest completion is separate from native Promise resolution and failure stays diagnostic',available,async()=>{
 let release;const delayed=new Promise(resolve=>{release=resolve;});const {wasm,observer}=make(undefined,{digest:async bytes=>{await delayed;return sha(bytes);}});observer.install();
 try {
  const result=await wasm.instantiate(owned,{});assert.ok(result.instance.exports.memory);
  assert.equal(observer.snapshot('pending').memories[0].moduleSHA256,null);assert.ok(observer.diagnostics().pendingHashTasks>0);
  release();await observer.settle();assert.equal(observer.snapshot('hashed').memories[0].moduleSHA256,sha(owned));
 } finally {observer.restore();}
 const broken=make(undefined,{digest:async()=>{throw Error('hash unavailable');}});broken.observer.install();
 try {await broken.wasm.instantiate(owned,{});await broken.observer.settle();assert.equal(broken.observer.snapshot('failed').memories[0].moduleSHA256,null);assert.equal(broken.observer.diagnostics().hashFailures,1);}finally{broken.observer.restore();}
});

test('observer retains only weak references to Memory', {...available,skip:available.skip||typeof globalThis.gc!=='function'},async()=>{
 const {wasm,observer}=make();observer.install();
 try {
  async function transient(){const result=await wasm.instantiate(owned,{});return new WeakRef(result.instance.exports.memory);}
  const ref=await transient();await observer.settle();
  // WeakRef targets survive their current job; collect only after later tasks.
  for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));globalThis.gc();}
  assert.equal(ref.deref(),undefined,'Observer must not keep a Memory alive');
  const report=observer.snapshot('collected');assert.equal(report.memories.length,1);assert.equal(report.memories[0].alive,false);assert.equal(report.memories[0].capacityBytes,null);assert.equal(report.memories[0].highWaterBytes,65536);
 }finally{observer.restore();}
});

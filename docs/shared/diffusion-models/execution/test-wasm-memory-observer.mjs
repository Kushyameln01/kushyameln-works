import test from 'node:test';
import assert from 'node:assert/strict';
import {installWasmMemoryObserver} from './wasm-memory-observer.mjs';

const header=[0,97,115,109,1,0,0,0];
const exportMemory=[7,10,1,6,109,101,109,111,114,121,2,0];
const defined=Uint8Array.from([...header,5,3,1,0,1,...exportMemory]);
const imported=Uint8Array.from([...header,2,15,1,3,101,110,118,6,109,101,109,111,114,121,2,0,1,...exportMemory]);

test('observes actual native Memory growth by identity and restores hooks idempotently',()=>{
 const Native=WebAssembly.Memory,instantiate=WebAssembly.instantiate,observer=installWasmMemoryObserver();
 try{
  assert.throws(()=>WebAssembly.Memory({initial:1}),TypeError);
  const memory=new WebAssembly.Memory({initial:1,maximum:4});
  assert(memory instanceof Native);assert.equal(memory.constructor,Native);
  let sample=observer.sample('created');assert.equal(sample.identities,1);assert.equal(sample.memories[0].currentBytes,65536);
  const id=sample.memories[0].id;assert.equal(memory.grow(2),1);
  sample=observer.sample('grown');assert.equal(sample.memories[0].id,id);assert.equal(sample.memories[0].currentBytes,196608);assert.equal(sample.memories[0].peakObservedBytes,196608);
  assert.equal(observer.registerMemory(memory,'second-path'),id);assert.equal(observer.sample().identities,1);
 }finally{const first=observer.unhook();assert.equal(observer.unhook(),first);assert.equal(WebAssembly.Memory,Native);assert.equal(WebAssembly.instantiate,instantiate);}
});

test('observes exported memories from both native instantiate result forms',async()=>{
 const observer=installWasmMemoryObserver();
 try{
  const bytesResult=await WebAssembly.instantiate(defined);assert(bytesResult.instance instanceof WebAssembly.Instance);
  const module=await WebAssembly.compile(defined),moduleResult=await WebAssembly.instantiate(module);assert(moduleResult instanceof WebAssembly.Instance);
  const sample=observer.sample();assert.equal(sample.identities,2);assert.equal(sample.currentReachableBytes,131072);assert(sample.memories.every(m=>m.sources.some(s=>s.startsWith('instantiate:export:memory'))));
 }finally{observer.unhook();}
});

test('observes defined exported memory from direct native Instance construction',()=>{
 const NativeInstance=WebAssembly.Instance,NativeMemory=WebAssembly.Memory,module=new WebAssembly.Module(defined),observer=installWasmMemoryObserver();
 try{
  assert.throws(()=>WebAssembly.Instance(module),TypeError);
  const instance=new WebAssembly.Instance(module);
  assert(instance instanceof NativeInstance);assert.equal(instance.constructor,NativeInstance);assert(instance.exports.memory instanceof NativeMemory);
  const sample=observer.sample('direct-instance');assert.equal(sample.identities,1);assert.equal(sample.currentReachableBytes,65536);assert.deepEqual(sample.memories[0].sources,['Instance.constructor:export:memory']);
 }finally{observer.unhook();assert.equal(WebAssembly.Instance,NativeInstance);}
});

test('observes imported native memory without adding native import getter calls',async()=>{
 const Native=WebAssembly.Memory,memory=new Native({initial:1}),observer=installWasmMemoryObserver();let gets=0;
 try{
  const imports={get env(){gets++;return {memory};}};
  const result=await WebAssembly.instantiate(imported,imports);assert.equal(gets,1);assert.equal(result.instance.exports.memory,memory);
  assert.equal(observer.sample().identities,1);
  const unexported=Uint8Array.from([...header,2,15,1,3,101,110,118,6,109,101,109,111,114,121,2,0,1]);
  const another=new Native({initial:2});observer.registerImports({env:{memory:another}});
  await WebAssembly.instantiate(unexported,{env:{memory:another}});assert.equal(observer.sample().identities,2);
  const skipped=observer.registerImports(imports);assert.equal(skipped.skippedAccessors,1);assert.equal(gets,1);
 }finally{observer.unhook();}
});

test('observes native instantiateStreaming and preserves native rejections',async()=>{
 const observer=installWasmMemoryObserver();
 try{
  const response=new Response(defined,{headers:{'Content-Type':'application/wasm'}});
  const result=await WebAssembly.instantiateStreaming(response);assert(result.instance.exports.memory instanceof WebAssembly.Memory);
  assert.equal(observer.sample().identities,1);
  await assert.rejects(WebAssembly.instantiate(Uint8Array.of(1,2,3)),WebAssembly.CompileError);
  assert.equal(observer.sample().observationErrors,0);
 }finally{observer.unhook();}
});

test('measures native shared memory while the global SAB constructor is hidden',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'SharedArrayBuffer');let observer;
 try{
  Object.defineProperty(globalThis,'SharedArrayBuffer',{...descriptor,value:undefined});observer=installWasmMemoryObserver();
  const memory=new WebAssembly.Memory({initial:1,maximum:3,shared:true});assert.equal(observer.sample().memories[0].currentBytes,65536);
  memory.grow(1);const sample=observer.sample();assert.equal(sample.identities,1);assert.equal(sample.currentReachableBytes,131072);assert.equal(sample.observationErrors,0);
 }finally{observer?.unhook();Object.defineProperty(globalThis,'SharedArrayBuffer',descriptor);}
});

test('keeps unreadable native memory identity and reports unknown bytes explicitly',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'SharedArrayBuffer'),Native=WebAssembly.Memory,memory=new Native({initial:1,maximum:2,shared:true}),prototype=Object.getPrototypeOf(memory.buffer),lengthDescriptor=Object.getOwnPropertyDescriptor(prototype,'byteLength');let observer;
 try{
  Object.defineProperty(prototype,'byteLength',{...lengthDescriptor,get(){throw Error('Injected unavailable native buffer size');}});Object.defineProperty(globalThis,'SharedArrayBuffer',{...descriptor,value:undefined});observer=installWasmMemoryObserver();
  assert.equal(observer.registerMemory(memory),'wasm-memory-1');const sample=observer.sample();assert.equal(sample.identities,1);assert.equal(sample.reachableObjects,1);assert.equal(sample.byteLengthUnavailableObjects,1);assert.equal(sample.currentReachableBytes,null);assert.equal(sample.memories[0].currentBytes,null);assert(sample.observationErrors>=1);
 }finally{observer?.unhook();Object.defineProperty(prototype,'byteLength',lengthDescriptor);Object.defineProperty(globalThis,'SharedArrayBuffer',descriptor);}
});

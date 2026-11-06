import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGeneratedLatentSpace,createGeneratedTargetPointwise,GENERATED_MODEL_LATENT,HIGH_HANDOFF_RAW,HIGH_HANDOFF_PROFILE,NORMALIZATION} from './generated-space.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';
import {WAN21_VAE_SHA256} from '../tensor-interop.mjs';
import {createSchedulerKernel} from '../scheduler/scheduler-kernel.mjs';
import {createEulerKernel} from '../euler-kernel.mjs';

// Small admission regressions only: no neural graph, weights, sampler or large run.
const shape=[1,16,1,2,4],elements=128;
const wasmBytes=new Uint8Array(await readFile(new URL('./generated-space/build/generated-space.wasm',import.meta.url)));
const typed=Object.getPrototypeOf(Float32Array.prototype);
const nativeLength=Object.getOwnPropertyDescriptor(typed,'length').get;
const tensor=data=>({dtype:'float32',layout:'NCTHW',shape:[...shape],meaning:GENERATED_MODEL_LATENT,normalization:NORMALIZATION,producerModelSha256s:[BASE_MODEL_HASHES.HIGH],data});
const wrongLength=()=>Object.defineProperty(new Float32Array(64).fill(.5),'length',{value:elements});
async function withOwner(fn){const owner=await createGeneratedLatentSpace({wasmBytes,targetShape:shape});try{return await fn(owner);}finally{owner.dispose();}}
const admissionError=/native|compact|nonshared|finite|F32|shape/i;
const rejectsInput=(fn,message)=>assert.rejects(async()=>await fn(),admissionError,message);

test('generated cancellation uses the native aborted state and exact reason',async()=>withOwner(async owner=>{
 const control=new AbortController(),reason=new Error('native generated cancellation');control.abort(reason);
 Object.defineProperty(control.signal,'aborted',{value:false});
 await assert.rejects(async()=>owner.restore(tensor(new Float32Array(elements)),{signal:control.signal}),error=>error===reason);
 assert.equal(owner.stats().busy,false);
}));

test('generated cancellation does not invoke an own aborted getter',async()=>withOwner(async owner=>{
 const control=new AbortController();Object.defineProperty(control.signal,'aborted',{get(){throw Error('shadow getter');}});
 assert.equal((await owner.restore(tensor(new Float32Array(elements)),{signal:control.signal})).data.length,elements);
}));

test('generated cancellation rejects duck signals without stranding the owner',async()=>withOwner(async owner=>{
 await assert.rejects(async()=>owner.restore(tensor(new Float32Array(elements)),{signal:{aborted:false}}),TypeError);
 assert.equal(owner.stats().busy,false);
}));

test('generated space accepts compact native finite exact-size F32',async()=>withOwner(async owner=>{
 const result=await owner.restore(tensor(new Float32Array(elements).fill(.5)));
 assert.equal(result.data.length,elements);
}));

test('generated restoration rejects a 64-element native view with own length spoofed as 128',async t=>withOwner(async owner=>{
 const data=wrongLength();let result;
 try{result=await owner.restore(tensor(data));}catch(error){assert.match(error.message,admissionError);return;}
 t.diagnostic(JSON.stringify({visibleLength:data.length,nativeLength:nativeLength.call(data),acceptedOutputLength:result.data.length,phantomOutputElements:result.data.length-nativeLength.call(data)}));
 assert.fail('Generated restoration admitted fewer native elements than the target and produced phantom output');
}));

const context=()=>({...tensor(wrongLength()),meaning:'raw-posterior-mean',normalization:undefined,producerModelSha256s:undefined,modelSha256:WAN21_VAE_SHA256});
for(const [name,invoke] of [
 ['normalizeContextRaw',owner=>owner.normalizeContextRaw(context())],
 ['normalizeContexts',owner=>owner.normalizeContexts([context()])],
 ['restoreHighHandoff',owner=>owner.restoreHighHandoff(tensor(wrongLength()))],
 ['normalizeHighHandoff',owner=>owner.normalizeHighHandoff({...tensor(wrongLength()),meaning:HIGH_HANDOFF_RAW,normalization:undefined,handoffProfile:HIGH_HANDOFF_PROFILE})]
])test(name+' rejects a spoofed native F32 length',async()=>withOwner(async owner=>rejectsInput(()=>invoke(owner),name+' accepted a spoofed length')));

test('generated space rejects a shared native buffer hidden by an own buffer property',async t=>{
 if(typeof SharedArrayBuffer!=='function'){t.skip('SharedArrayBuffer unavailable');return;}
 await withOwner(async owner=>{
  const data=new Float32Array(new SharedArrayBuffer(elements*4)).fill(.5);Object.defineProperty(data,'buffer',{value:new ArrayBuffer(elements*4)});
  await rejectsInput(()=>owner.restore(tensor(data)),'Shared native storage was accepted through a spoofed buffer');
 });
});

test('generated space rejects noncompact storage hidden by own offset byteLength and buffer properties',async()=>withOwner(async owner=>{
 const data=new Float32Array(new ArrayBuffer(elements*4+4),4,elements).fill(.5);
 Object.defineProperties(data,{buffer:{value:new ArrayBuffer(elements*4)},byteOffset:{value:0},byteLength:{value:elements*4}});
 await rejectsInput(()=>owner.restore(tensor(data)),'Noncompact storage was accepted through spoofed view fields');
}));

test('generated space rejects extra backing bytes hidden by an ArrayBuffer byteLength property',async()=>withOwner(async owner=>{
 const buffer=new ArrayBuffer(elements*4+4),data=new Float32Array(buffer,0,elements).fill(.5);Object.defineProperty(buffer,'byteLength',{value:elements*4});
 await rejectsInput(()=>owner.restore(tensor(data)),'Extra native backing bytes were accepted');
}));

test('generated space rejects typed-array subclasses with forged extent getters',async()=>withOwner(async owner=>{
 class Forged extends Float32Array{get length(){return elements;}get buffer(){return new ArrayBuffer(elements*4);}get byteOffset(){return 0;}get byteLength(){return elements*4;}}
 await rejectsInput(()=>owner.restore(tensor(new Forged(64).fill(.5))),'Typed-array subclass extent getters were trusted');
}));

test('generated space rejects another typed-array brand with a forged Float32Array prototype',async()=>withOwner(async owner=>{
 const data=new Int32Array(elements).fill(1);Object.setPrototypeOf(data,Float32Array.prototype);
 await rejectsInput(()=>owner.restore(tensor(data)),'An Int32Array native brand was accepted as F32');
}));

test('generated space ignores throwing own extent accessors when native F32 slots are valid',async()=>withOwner(async owner=>{
 const data=new Float32Array(elements).fill(.5);
 for(const key of ['buffer','length','byteOffset','byteLength'])Object.defineProperty(data,key,{get(){throw Error('Caller '+key+' accessor was invoked');}});
 const result=await owner.restore(tensor(data));assert.equal(result.data.length,elements);
}));

test('generated space keeps native nonfinite and detached input rejection',async()=>withOwner(async owner=>{
 await rejectsInput(()=>owner.restore(tensor(new Float32Array(elements).fill(NaN))));
 const data=new Float32Array(elements);structuredClone(data.buffer,{transfer:[data.buffer]});
 await rejectsInput(()=>owner.restore(tensor(data)));
}));

test('target pointwise rejects spoofed native length before real scheduler arithmetic',async()=>{
 const schedulerBytes=await readFile(new URL('../scheduler/build/scheduler.wasm',import.meta.url)),scheduler=createSchedulerKernel(await WebAssembly.compile(schedulerBytes));
 const euler=await createEulerKernel(await readFile(new URL('../kernel/euler.wasm',import.meta.url))),owner=createGeneratedTargetPointwise({scheduler,euler,targetShape:shape});
 try{await rejectsInput(()=>owner.noiseMix({shape,noise:wrongLength(),latent:new Float32Array(elements),sigma:.5,noiseScale:1}));}
 finally{owner.dispose();scheduler.dispose();euler.dispose();}
});

test('target pointwise rejects shared native storage hidden behind a buffer property',async t=>{
 if(typeof SharedArrayBuffer!=='function'){t.skip('SharedArrayBuffer unavailable');return;}
 const schedulerBytes=await readFile(new URL('../scheduler/build/scheduler.wasm',import.meta.url)),scheduler=createSchedulerKernel(await WebAssembly.compile(schedulerBytes));
 const euler=await createEulerKernel(await readFile(new URL('../kernel/euler.wasm',import.meta.url))),owner=createGeneratedTargetPointwise({scheduler,euler,targetShape:shape});
 try{const noise=new Float32Array(new SharedArrayBuffer(elements*4)).fill(.5);Object.defineProperty(noise,'buffer',{value:new ArrayBuffer(elements*4)});await rejectsInput(()=>owner.noiseMix({shape,noise,latent:new Float32Array(elements),sigma:.5,noiseScale:1}));}
 finally{owner.dispose();scheduler.dispose();euler.dispose();}
});

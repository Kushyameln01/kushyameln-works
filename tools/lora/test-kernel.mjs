import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=new URL('../../docs/shared/inference/lora/kernel/host.mjs',import.meta.url);
const create=async()=>{const {createKernel}=await import(url);return createKernel({wasmBytes:await readFile(new URL('../../docs/shared/inference/lora/kernel/lora.wasm',import.meta.url))});};
test('Hike low rank block product contributes to weights and leaves inputs immutable',async()=>{
 const k=await create(),base=new Float32Array([1,2,3,4]);
 assert.deepEqual([...k.merge({base,down:new Float32Array([2,3]),up:new Float32Array([4,5]),rows:2,cols:2,rank:1,scale:.5})],[5,8,8,11.5]);
 assert.deepEqual([...base],[1,2,3,4]);k.dispose();assert.throws(()=>k.add({base,delta:base,scale:1}),/disposed/);
});
test('Hike additive weight and bias deltas support zero and negative strength',async()=>{const k=await create();assert.deepEqual([...k.add({base:new Float32Array([1,2]),delta:new Float32Array([2,-4]),scale:-.5})],[0,4]);assert.deepEqual([...k.add({base:new Float32Array([1,2]),delta:new Float32Array([2,-4]),scale:0})],[1,2]);});
test('actual Hike decoder converts BF16, F16 and F32 including subnormal',async()=>{const k=await create();assert.deepEqual([...k.decode(new Uint8Array([128,63,0,192]),'BF16')],[1,-2]);assert.deepEqual([...k.decode(new Uint8Array([0,60,0,192,1,0]),'F16')],[1,-2,2**-24]);assert.deepEqual([...k.decode(new Uint8Array(new Float32Array([1.25,-3.5]).buffer),'F32')],[1.25,-3.5]);assert.throws(()=>k.decode(new Uint8Array([128,127]),'BF16'),/finite/);});
test('shape, finite inputs, dtype, byte alignment and memory budget are enforced',async()=>{const k=await create();assert.throws(()=>k.merge({base:new Float32Array(2),down:new Float32Array(1),up:new Float32Array(1),rows:1,cols:1,rank:1,scale:1}),/shape/);assert.throws(()=>k.add({base:new Float32Array([NaN]),delta:new Float32Array([1]),scale:1}),/finite/);assert.throws(()=>k.decode(new Uint8Array([1]),'BF16'),/byte/);assert.throws(()=>k.decode(new Uint8Array(2),'I16'),/dtype/);assert.throws(()=>k.add({base:new Float32Array(3000000),delta:new Float32Array(3000000),scale:1}),/budget/);});
test('fixed workspace is reused for repeated calls',async()=>{const k=await create(),before=k.info.memoryBytes;for(let i=0;i<100;i++)assert.deepEqual([...k.add({base:new Float32Array([1]),delta:new Float32Array([2]),scale:1})],[3]);assert.equal(k.info.memoryBytes,before);assert.match(k.info.wasmSha256,/^[a-f0-9]{64}$/);});
test('missing or invalid WASM never silently falls back to JS',async()=>{const {createKernel}=await import(url);await assert.rejects(()=>createKernel({wasmBytes:new Uint8Array([0])}));});

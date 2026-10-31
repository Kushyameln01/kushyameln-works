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
test('full rank128 by5120 BF16/F16 decode keeps compiler stack separate from host buffers',async()=>{
 const k=await create();
 try{const n=128*5120;for(const [dtype,bits,values] of [['BF16',[0x3f80,0xbf00,0x3a80],[1,-.5,2**-10]],['F16',[0x3c00,0xb800,0x0001],[1,-.5,2**-24]]]){const raw=new Uint8Array(n*2),v=new DataView(raw.buffer);for(let i=0;i<n;i++)v.setUint16(i*2,bits[i%3],true);const actual=k.decode(raw,dtype);for(let i=0;i<n;i++)assert.equal(actual[i],values[i%3],dtype+' at '+i);assert.equal(k.info.memoryBytes,32*1024*1024);}}
 finally{k.dispose();}
});
test('large supported merge reuses loop state without overwriting its input arena',async()=>{
 const k=await create();
 try{const rows=1024,cols=1024,base=new Float32Array(rows*cols).fill(1),down=new Float32Array(cols).fill(.25),up=new Float32Array(rows).fill(2);const actual=k.merge({base,down,up,rows,cols,rank:1,scale:1});for(const v of actual)assert.equal(v,1.5);assert.ok(base.every(v=>v===1));}
 finally{k.dispose();}
});

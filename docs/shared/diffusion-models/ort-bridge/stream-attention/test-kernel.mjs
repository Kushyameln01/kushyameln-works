import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let api;try{api=await import('./hike.mjs');}catch{}
test('actual bounded Hike recurrent rescale/update/normalize',async()=>{
 assert.equal(typeof api?.createStreamAccumulator,'function','Missing streamed attention Hike accumulator');
 const k=await api.createStreamAccumulator(await readFile(new URL('./kernel.wasm',import.meta.url)));
 try{
  k.reset(1);const value=new Float32Array(256);value.fill(1,0,128);value.fill(2,128);
  const p=new Float32Array([1,1]),alpha=new Float32Array([0]);k.update({weights:p,values:value,alpha,keys:2});
  const a=k.finish();assert.ok(a.every(x=>x===1.5));a.fill(999);
  const m=k.stats().memoryBytes;k.update({weights:new Float32Array([1]),values:new Float32Array(128).fill(4),alpha:new Float32Array([.5]),keys:1});assert.ok(k.finish().every(x=>x===2.75));assert.equal(k.stats().memoryBytes,m);
  assert.deepEqual([...p],[1,1]);assert.ok(value.subarray(0,128).every(x=>x===1));
  assert.throws(()=>k.update({weights:new Float32Array([NaN]),values:new Float32Array(128),alpha:new Float32Array([1]),keys:1}));
  k.reset(1);assert.throws(()=>k.finish());k.update({weights:new Float32Array([1]),values:new Float32Array(128).fill(.25),alpha:new Float32Array([0]),keys:1});assert.ok(k.finish().every(x=>x===.25));
 }finally{k.dispose();}assert.throws(()=>k.finish());
});

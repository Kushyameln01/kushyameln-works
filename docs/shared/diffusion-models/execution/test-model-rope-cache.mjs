import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModelMath} from './model-math.mjs';

const W=5120;
const create=async ropeCache=>createModelMath({wasmBytes:new Uint8Array(await readFile(new URL('./model-math/kernel.wasm',import.meta.url))),...(ropeCache===undefined?{}:{ropeCache})});
const values=(rows,offset=0)=>Float32Array.from({length:rows*W},(_,i)=>Math.sin((i+offset)*.013)+Math.cos((i+offset)*.027)*.4);
const bits=value=>new Uint32Array(value.buffer,value.byteOffset,value.length);
function geometry(rows,offset=0){
 const positions=Float32Array.from({length:rows*3},(_,i)=>((i+offset)%53)-17.25);
 const sourceIds=Int32Array.from({length:rows},(_,i)=>[0,1,9,16777215,16777216][(i+offset)%5]);
 return {rows,positions,sourceIds};
}

// These tests use only the pinned small math WASM; no model/ORT/weight loading.
test('cached real Hike matrices preserve every output bit for changed Q/K-like inputs and exact tails',async t=>{
 const cached=await create(),uncached=await create(false);
 try{
  for(const rows of [128,127,1]){
   const g=geometry(rows),x=values(rows),other=values(rows,731);
   const first=cached.rope({input:x,...g});
   assert.deepEqual(bits(first),bits(uncached.rope({input:x,...g})));
   first.fill(999);x.fill(-3); // Neither exported output nor earlier x is cached.
   assert.deepEqual(bits(cached.rope({input:other,...g})),bits(uncached.rope({input:other,...g})));
  }
  const a=cached.stats(),b=uncached.stats();
  assert.equal(a.ropeCache.builds,3);assert.equal(a.ropeCache.hits,3);assert.equal(a.ropeCache.entries,3);
  assert.equal(b.ropeCache.builds,6);assert.equal(b.ropeCache.entries,0);assert.equal(b.ropeCache.enabled,false);
  assert.equal(a.ropeCache.stagingCopies,3);assert.equal(a.ropeCache.stagingBytes,(128+127+1)*256*4);
  assert.equal(a.ropeCache.retainedBytes,a.ropeCache.matrixBytes+a.ropeCache.keyBytes);
  assert.equal(a.ropeCache.physicalMemoryBytes,null);assert.equal(a.memoryBytes,b.memoryBytes);
  assert.equal(a.primitiveCalls.sin*2,b.primitiveCalls.sin);assert.equal(a.primitiveCalls.cos*2,b.primitiveCalls.cos);assert.equal(a.primitiveCalls.pow*2,b.primitiveCalls.pow);
  t.diagnostic(JSON.stringify({cached:a.ropeCache,uncached:b.ropeCache,wasmBytes:a.memoryBytes,primitiveCalls:{cached:a.primitiveCalls,uncached:b.primitiveCalls}}));
 }finally{cached.dispose();uncached.dispose();}
});

test('geometry keys distinguish exact F32 signed zeros, coordinate bits, source boundary bits and owner identity',async()=>{
 const owner=await create(),other=await create(),uncached=await create(false);
 try{
  const input=values(1),base=geometry(1);base.positions.fill(0);base.sourceIds[0]=0;
  const geometries=[base,{...base,positions:new Float32Array([-0,0,0])},{...base,positions:new Float32Array([0,-0,0])},{...base,positions:new Float32Array([0,0,-0])},{...base,positions:new Float32Array([Math.fround(1e-40),0,0])},{...base,sourceIds:new Int32Array([16777215])},{...base,sourceIds:new Int32Array([16777216])}];
  for(const g of geometries){assert.deepEqual(bits(owner.rope({input,...g})),bits(uncached.rope({input,...g})));}
  assert.equal(owner.stats().ropeCache.builds,7);assert.equal(owner.stats().ropeCache.hits,0);
  for(const g of geometries)assert.deepEqual(bits(owner.rope({input,...g})),bits(uncached.rope({input,...g})));
  assert.equal(owner.stats().ropeCache.hits,7);
  other.rope({input,...base});assert.equal(other.stats().ropeCache.builds,1);assert.equal(other.stats().ropeCache.hits,0);
  base.positions[0]=4;base.sourceIds[0]=9;owner.rope({input,...base});assert.equal(owner.stats().ropeCache.builds,8);
 }finally{owner.dispose();other.dispose();uncached.dispose();}
});

test('different exact geometry keys sharing a hash never alias cached matrices',async()=>{
 const owner=await create(),uncached=await create(false);
 try{
  // Fixed collision for the candidate-bucket hash, including schema1/rows1.
  // Admission and lookup must compare all raw words, not trust that hash.
  const input=values(1),geometries=[[1059172304,1063262792],[1070785360,1063565256]].map(words=>({rows:1,positions:new Float32Array(new Uint32Array([...words,0]).buffer),sourceIds:new Int32Array(1)}));
  for(const g of [...geometries,...geometries])assert.deepEqual(bits(owner.rope({input,...g})),bits(uncached.rope({input,...g})));
  assert.equal(owner.stats().ropeCache.builds,2);assert.equal(owner.stats().ropeCache.hits,2);assert.equal(owner.stats().ropeCache.entries,2);
 }finally{owner.dispose();uncached.dispose();}
});

test('hits retain every ordinary shape, finite, ID, ownership and overflow admission',async()=>{
 const owner=await create(),uncached=await create(false);
 try{
  const input=values(1),g=geometry(1);owner.rope({input,...g});
  for(const value of [NaN,Infinity,-Infinity]){
   const x=input.slice();x[0]=value;assert.throws(()=>owner.rope({...g,input:x}),/Finite/);
   const positions=g.positions.slice();positions[0]=value;assert.throws(()=>owner.rope({...g,input,positions}),/Finite/);
  }
  for(const id of [-1,16777217])assert.throws(()=>owner.rope({...g,input,sourceIds:new Int32Array([id])}),/Source IDs/);
  assert.throws(()=>owner.rope({...g,input,rows:0}),/shape/);
  assert.throws(()=>owner.rope({...g,input,rows:129}),/shape/);
  assert.throws(()=>owner.rope({...g,input,axis:0}),/Unknown/);
  assert.throws(()=>owner.rope({...g,input:new Float32Array(W+1).subarray(1)}),/compact/);
  assert.throws(()=>owner.rope({...g,input,positions:new Float32Array(4).subarray(1)}),/compact/);
  assert.throws(()=>owner.rope({...g,input,sourceIds:new Uint32Array(1)}),/Int32Array/);
  if(typeof SharedArrayBuffer==='function')assert.throws(()=>owner.rope({...g,input:new Float32Array(new SharedArrayBuffer(W*4))}),/nonshared/);
  // A hit still executes native RopeApply and rejects nonfinite arithmetic.
  const overflow=new Float32Array(W).fill(3.4028234663852886e38);
  assert.throws(()=>owner.rope({...g,input:overflow}),/numeric admission/);
  assert.deepEqual(bits(owner.rope({...g,input})),bits(uncached.rope({...g,input})));
  assert.equal(owner.stats().busy,false);
 }finally{owner.dispose();uncached.dispose();}
});

test('LRU enforces both explicit key+matrix byte and entry bounds, with clear/disposal dropping retained references',async()=>{
 const oneBytes=256*4+(2+4)*4;
 for(const ropeCache of [{maxBytes:oneBytes*2,maxEntries:10},{maxBytes:100000,maxEntries:2}]){
  const owner=await create(ropeCache),input=values(1),a=geometry(1,0),b=geometry(1,1),c=geometry(1,2);
  try{
   owner.rope({input,...a});owner.rope({input,...b});owner.rope({input,...a});owner.rope({input,...c});
   assert.equal(owner.stats().ropeCache.entries,2);assert.equal(owner.stats().ropeCache.evictions,1);
   owner.rope({input,...a});assert.equal(owner.stats().ropeCache.hits,2);
   owner.rope({input,...b});assert.equal(owner.stats().ropeCache.builds,4);assert.equal(owner.stats().ropeCache.evictions,2);
   assert.equal(owner.stats().ropeCache.retainedBytes,oneBytes*2);assert.ok(owner.stats().ropeCache.peakRetainedBytes<=ropeCache.maxBytes);
   owner.clearRopeCache();assert.equal(owner.stats().ropeCache.entries,0);assert.equal(owner.stats().ropeCache.retainedBytes,0);
   owner.rope({input,...a});assert.equal(owner.stats().ropeCache.builds,5);
  }finally{owner.dispose();owner.dispose();}
  assert.equal(owner.stats().ropeCache.entries,0);assert.equal(owner.stats().ropeCache.matrixBytes,0);assert.equal(owner.stats().ropeCache.keyBytes,0);
  assert.throws(()=>owner.clearRopeCache(),/disposed/);assert.throws(()=>owner.rope({input,...a}),/disposed/);
 }
 const tooSmall=await create({maxBytes:oneBytes-1,maxEntries:2});
 try{const g=geometry(1),input=values(1);tooSmall.rope({input,...g});tooSmall.rope({input,...g});assert.equal(tooSmall.stats().ropeCache.entries,0);assert.equal(tooSmall.stats().ropeCache.builds,2);assert.equal(tooSmall.stats().ropeCache.uncacheableBuilds,2);}finally{tooSmall.dispose();}
});

test('resource configuration cannot exceed explicit cache bounds or bypass busy ownership',async()=>{
 for(const ropeCache of [true,null,1,[],{maxBytes:-1},{maxBytes:96*1024*1024+1},{maxBytes:1.5},{maxEntries:1025},{maxEntries:-1},{unexpected:1}])await assert.rejects(create(ropeCache),/cache|RoPE/);
 const owner=await create({maxBytes:0,maxEntries:0});
 try{
  const g=geometry(1),input=values(1);
  owner.rope({...g,get input(){assert.throws(()=>owner.clearRopeCache(),/busy/);assert.throws(()=>owner.dispose(),/busy/);return input;}});
  assert.equal(owner.stats().ropeCache.enabled,false);assert.equal(owner.stats().ropeCache.entries,0);
 }finally{owner.dispose();}
});

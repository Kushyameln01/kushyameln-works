import assert from 'node:assert/strict';import fs from 'node:fs';
let m;try{m=await import('../../docs/shared/inference/hike.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
assert.equal(typeof m?.createHike,'function','Product Hike tensor API missing');
const bytes=fs.readFileSync(new URL('../../docs/shared/inference/kernel/tensor.wasm',import.meta.url));
const h=await m.createHike(bytes,{capacity:4096});
assert.deepEqual(Array.from(h.divide(Float32Array.of(4,-2,1),2)),[2,-1,.5]);assert.throws(()=>h.divide(Float32Array.of(1),0));
const y=h.rmsNorm(Float32Array.of(3,4),Float32Array.of(1,2),1,2,1e-6);
assert.ok(Math.abs(y[0]-.8485281)<1e-6&&Math.abs(y[1]-2.2627416)<1e-6);
const count=8192;const large=new Float32Array(count).fill(.25);assert.ok(h.affine(large,2,1).every(x=>x===1.5));
const a=Float32Array.of(1,2,3,4),b=new Float32Array(2*8192).fill(1),product=h.matmul(a,b,2,2,8192);assert.equal(product.length,16384);assert.ok(product.subarray(0,8192).every(x=>x===3));assert.ok(product.subarray(8192).every(x=>x===7));
const before=h.stats().memoryBytes;for(let i=0;i<100;i++)h.rmsNorm(Float32Array.of(3,4),Float32Array.of(1,1),1,2,1e-6);assert.equal(h.stats().memoryBytes,before);
const dead=Float32Array.of(1);structuredClone(dead,{transfer:[dead.buffer]});assert.throws(()=>h.affine(dead,1,0));
h.dispose();assert.throws(()=>h.divide(Float32Array.of(1),2));
console.log('PASS: actual Hike divide/RMSNorm, oversized affine and column-chunk MatMul, bounded workspace');

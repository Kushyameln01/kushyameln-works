import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,open} from 'node:fs/promises';
const source=await import('./source.mjs').catch(()=>({}));
const graph=await import('./graph.mjs').catch(()=>({}));
const math=await import('./math.mjs').catch(()=>({}));
const root=new URL('../../../../../',import.meta.url);
const bytes=async p=>new Uint8Array(await readFile(new URL(p,import.meta.url)));
test('bounded actual source exposes immutable F16 rows and rejects cross-key/range reads',async()=>{
 assert.equal(typeof source.createWeightSource,'function','new bounded actual source required');
 const path=process.env.BERNINI_LOW_FILE??'/workspace/work/retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors',handle=await open(path,'r'),stat=await handle.stat();
 class Original extends Blob {get size(){return stat.size;}slice(a,b){return {async arrayBuffer(){const v=new Uint8Array(b-a);await handle.read(v,0,v.length,a);return v.buffer;}};}}
 const provider=await source.createWeightSource({file:new Original(),side:'LOW',bridgeBytes:await bytes('../kernel/bridge.wasm')});
 try {
  const got=await provider.readRows('patch_embedding.weight',0,16);
  assert.deepEqual(got.shape,[16,64]);assert.deepEqual(got.source.fullShape,[5120,16,1,2,2]);assert.equal(got.raw.length,2048);assert.equal(got.values.length,1024);assert.ok(got.values.every(Number.isFinite));
  assert.equal(provider.describe().entries['patch_embedding.weight'].binding,'runtime-input');assert.equal(provider.describe().entries['patch_embedding.bias'].binding,'hike-parameter');
  const before=got.values[0];got.values[0]=999;const again=await provider.readRows('patch_embedding.weight',0,16);assert.equal(again.values[0],before);
  await assert.rejects(provider.readRows('time_projection.1.weight',30719,16),/range/);
  await assert.rejects(provider.readRows('blocks.1.self_attn.q.weight',0,16),/key/);
  await assert.rejects(provider.readVector('patch_embedding.bias',5120,1),/range/);
  assert.throws(()=>provider.addBias(new Float32Array(3).subarray(1),new Float32Array(2),1,2),/compact/);
  const c=new AbortController();c.abort();await assert.rejects(provider.readRows('patch_embedding.weight',0,16,{signal:c.signal}),{name:'AbortError'});
  assert.equal(provider.describe().fullFileSHA256Verified,false);assert.equal(provider.stats().maxReadBytes<=181280,true);
 } finally {provider.dispose();await handle.close();}
 assert.throws(()=>provider.describe(),/disposed/);
});
test('dynamic graph keeps dimensions symbolic and runtime weight binding',()=>{
 assert.equal(typeof graph.createDynamicLinearGraph,'function','symbolic graph required');
 const binary=graph.createDynamicLinearGraph(),s=new TextDecoder().decode(binary);
 for(const name of ['Gemm','weight','M','K','N'])assert.ok(s.includes(name));
});
test('new Hike math uses exact N2 LayerNorm, admission and owned workspace',async()=>{
 assert.equal(typeof math.createBlockHiddenMath,'function','new prefix Hike math required');
 const op=await math.createBlockHiddenMath({wasmBytes:await bytes('./kernel.wasm')});
 try {
  const before=op.stats(),x=Float32Array.from({length:10240},(_,i)=>(i%17-8)/10),out=op.layerNorm(x,2);
  assert.equal(out.length,10240);assert.ok(out.every(Number.isFinite));assert.equal(op.stats().memoryBytes,before.memoryBytes);
  assert.throws(()=>op.layerNorm(new Float32Array(10240).fill(1e17),2),/admission/);
  const bad=x.slice();bad[9000]=NaN;assert.throws(()=>op.layerNorm(bad,2),/finite/);
  assert.throws(()=>op.layerNorm(x,16),/shape/);
  const s=op.sinusoidal(Math.fround(961.715877));assert.equal(s.length,256);assert.ok(s.every(Number.isFinite));
  const y=op.modulate(out,new Float32Array(5120),new Float32Array(5120),2);assert.deepEqual(y,out);
 } finally {op.dispose();}
});

test('actual source abort during asynchronous identity hashing never commits a block',async()=>{
 const path=process.env.BERNINI_LOW_FILE??'/workspace/work/retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors',handle=await open(path,'r'),stat=await handle.stat();
 class Original extends Blob {get size(){return stat.size;}slice(a,b){return {async arrayBuffer(){const v=new Uint8Array(b-a);await handle.read(v,0,v.length,a);return v.buffer;}};}}
 const provider=await source.createWeightSource({file:new Original(),side:'LOW',bridgeBytes:await bytes('../kernel/bridge.wasm')}),original=crypto.subtle.digest;
 const c=new AbortController();let release,entered;const wait=new Promise(r=>release=r),gate=new Promise(r=>entered=r);let once=true;
 crypto.subtle.digest=async function(...args){if(once){once=false;entered();await wait;}return original.call(this,...args);};
 try{const run=provider.readRows('patch_embedding.weight',0,16,{signal:c.signal});await gate;c.abort();release();await assert.rejects(run,{name:'AbortError'});assert.equal(provider.stats().busy,false);crypto.subtle.digest=original;assert.equal((await provider.readRows('patch_embedding.weight',0,16)).values.length,1024);}
 finally{crypto.subtle.digest=original;provider.dispose();await handle.close();}
});

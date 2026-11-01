import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const api=await import('./math.mjs').catch(()=>({}));
const bytes=async()=>new Uint8Array(await readFile(new URL('./kernel.wasm',import.meta.url)));
const F=Math.fround;
const values=n=>Float32Array.from({length:n},(_,i)=>(i%31-15)/16);
const norm=x=>{let s=F(0);for(const v of x)s=F(s+v);const mean=F(s/5120);let variance=F(0);for(const v of x){const d=F(v-mean);variance=F(variance+F(d*d));}variance=F(variance/5120);const inverse=F(1/F(Math.sqrt(F(variance+F(1e-6)))));return Float32Array.from(x,v=>F(F(v-mean)*inverse));};
test('Hike full5120 normalization and affine boundaries preserve all channels and rows',async()=>{
 assert.equal(typeof api.createPostSelfAttentionMath,'function');
 const m=await api.createPostSelfAttentionMath({wasmBytes:await bytes()});
 try{
  const x=values(10240),w=values(5120),b=new Float32Array(5120).fill(.25),before=m.stats();
  const got=m.layerNorm(x,2),affine=m.affineNorm(x,w,b,2),rms=m.rmsNorm(x,w,2);
  for(let row=0;row<2;row++){
   const expected=norm(x.slice(row*5120,(row+1)*5120));let square=F(0);for(const v of x.slice(row*5120,(row+1)*5120))square=F(square+F(v*v));const inv=F(1/F(Math.sqrt(F(F(square/5120)+F(1e-6)))));
   for(let c=0;c<5120;c++){const i=row*5120+c;assert.equal(got[i],expected[c]);assert.equal(affine[i],F(F(expected[c]*w[c])+b[c]));assert.equal(rms[i],F(F(x[i]*inv)*w[c]));}
  }
  const constant=new Float32Array(5120).fill(7);assert.ok(m.layerNorm(constant,1).every(v=>v===0));
  const last=new Float32Array(5120);last[5119]=4;const full=m.rmsNorm(last,new Float32Array(5120).fill(1),1);assert.ok(full[5119]>60,'RMS denominator uses all5120 channels, not each128 head');
  assert.equal(m.stats().memoryBytes,before.memoryBytes);assert.equal(m.stats().memoryIdentity,before.memoryIdentity);
  got.fill(999);assert.notEqual(m.layerNorm(x,2)[0],999);
  assert.equal(m.stats().workspaceReused,true);assert.ok(m.stats().snapshotCopyBytes>0);assert.ok(m.stats().inputCopyBytes>0);assert.ok(m.stats().outputCopyBytes>0);
  const large=m.rmsNorm(new Float32Array(512*5120),new Float32Array(5120).fill(1),512);assert.equal(large.length,512*5120);assert.ok(large.every(v=>v===0));assert.equal(m.stats().memoryBytes,before.memoryBytes,'all512 rows reuse bounded workspace');
 }finally{m.dispose();}assert.throws(()=>m.layerNorm(values(5120),1),/disposed/);
});
test('Hike tanh GELU, modulation and gate preserve separate F32 operations',async()=>{
 const m=await api.createPostSelfAttentionMath({wasmBytes:await bytes()});
 try{
  const x=Float32Array.from([-5,-1,-0,0,.25,1,5]),got=m.gelu(x);
  for(let i=0;i<x.length;i++){const cube=F(F(x[i]*x[i])*x[i]),inner=F(x[i]+F(F(.044715)*cube)),phase=F(F(.7978845608028654)*inner),t=F(Math.tanh(phase));assert.equal(got[i],F(F(F(.5)*x[i])*F(F(1)+t)));}
  const a=new Float32Array(10240).fill(F(1.0000001192092896)),shift=new Float32Array(5120).fill(-1),scale=new Float32Array(5120).fill(0),gate=new Float32Array(5120).fill(F(1.0000001192092896));
  assert.equal(m.modulate(a,shift,scale,2)[0],F(a[0]-1));
  const base=new Float32Array(10240).fill(-F(1.000000238418579)),r=m.gateResidual(base,a,gate,2);assert.equal(r.gated[0],F(a[0]*gate[0]));assert.equal(r.residual[0],0,'round product before adding cross residual');
  gate.fill(0);assert.deepEqual(m.gateResidual(base,a,gate,2).residual,base,'gate does not add one');
  assert.equal(m.add(new Float32Array(5120).fill(2),new Float32Array(5120).fill(3))[0],5);
  assert.equal(m.gelu(new Float32Array(27648)).length,27648);
 }finally{m.dispose();}
});
test('math rejects malformed shape, subclass, shared, detached, nonfinite and overflow inputs',async()=>{
 const m=await api.createPostSelfAttentionMath({wasmBytes:await bytes()});
 try{
  assert.throws(()=>m.layerNorm(values(5120),0),/shape/);assert.throws(()=>m.layerNorm(values(5120),513),/shape/);assert.throws(()=>m.layerNorm(values(5121),1),/shape|compact/);
  class Alias extends Float32Array {slice(){return this;} every(){return true;}}
  assert.throws(()=>m.layerNorm(new Alias(5120),1),/compact|subclass/);
  assert.throws(()=>m.layerNorm(new Float32Array(5121).subarray(1),1),/compact/i);
  if(typeof SharedArrayBuffer==='function')assert.throws(()=>m.layerNorm(new Float32Array(new SharedArrayBuffer(20480)),1),/nonshared|compact/);
  const detached=values(5120);structuredClone(detached.buffer,{transfer:[detached.buffer]});assert.throws(()=>m.layerNorm(detached,1),/shape|compact|detached/);
  for(const v of [NaN,Infinity,-Infinity]){const x=values(5120);x[0]=v;assert.throws(()=>m.layerNorm(x,1),/finite/);}
  const overflow=values(5120);overflow[0]=1e17;assert.throws(()=>m.layerNorm(overflow,1),/admission/);
  assert.throws(()=>m.gelu(new Float32Array(27649)),/shape/);assert.throws(()=>m.modulate(values(10240),values(5120),values(5120),1),/shape/);
  assert.equal(m.stats().busy,false);assert.equal(m.layerNorm(values(5120),1).length,5120);
 }finally{m.dispose();m.dispose();}
});
test('math snapshots wasm bytes before await, pins hash/imports and rejects shared/subclass bytes',async()=>{
 const b=await bytes(),creating=api.createPostSelfAttentionMath({wasmBytes:b});b.fill(0);const m=await creating;m.dispose();
 const broken=await bytes();broken[broken.length-1]^=1;await assert.rejects(api.createPostSelfAttentionMath({wasmBytes:broken}),/hash mismatch/);
 class Bytes extends Uint8Array {}await assert.rejects(api.createPostSelfAttentionMath({wasmBytes:new Bytes(await bytes())}),/Nonshared|compact/);
 if(typeof SharedArrayBuffer==='function')await assert.rejects(api.createPostSelfAttentionMath({wasmBytes:new Uint8Array(new SharedArrayBuffer(16))}),/Nonshared|compact/);
 const module=await WebAssembly.compile(await bytes());assert.deepEqual(WebAssembly.Module.imports(module).map(x=>x.name).sort(),['sqrt','tanh']);
 const i=await WebAssembly.instantiate(module,{env:{sqrt:Math.sqrt,tanh:Math.tanh}});i.exports.memory.grow(8);const p=65536;
 assert.equal(i.exports.Norm(p,p+20480,p+40960,p+61440,0,5120),-1);assert.equal(i.exports.Gelu(p,27649,p+200000,27649),-1);
});

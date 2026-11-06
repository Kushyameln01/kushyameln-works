import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createKernel} from '../../../../docs/shared/inference/lora/kernel/host.mjs';

const moduleURL=new URL('../../../../docs/shared/inference/lora/kernel/streaming/host.mjs',import.meta.url);
const wasmURL=new URL('../../../../docs/shared/inference/lora/kernel/streaming/lora.wasm',import.meta.url);
const oldWasmURL=new URL('../../../../docs/shared/inference/lora/kernel/lora.wasm',import.meta.url);
const bits=a=>new Uint32Array(a.buffer,a.byteOffset,a.length);
async function create(){const {createStreamingKernel}=await import(moduleURL);return createStreamingKernel({wasmBytes:await fs.readFile(wasmURL)});}

test('streaming Hike product and application retain ascending-rank F32 arithmetic including column tails',async()=>{
 const k=await create(),old=await createKernel({wasmBytes:await fs.readFile(oldWasmURL)});
 try{
  for(const cols of [1,3,4,7,8,9,256,4096,5120,13824])for(const rank of [1,3,64,128]){
   const rows=2,down=Float32Array.from({length:rank*cols},(_,i)=>Math.sin(i*.37)*.02),up=Float32Array.from({length:rows*rank},(_,i)=>Math.cos(i*.17)*.03),base=Float32Array.from({length:rows*cols},(_,i)=>(i%17-8)*.01);
   const delta=k.product({down,up,rows,cols,rank});
   assert.deepEqual(bits(delta),bits(old.merge({base:new Float32Array(base.length),down,up,rows,cols,rank,scale:1})));
   for(const scale of [0,-.73,1,1.0000001192092896])assert.deepEqual(bits(k.apply({base,delta,scale})),bits(old.merge({base,down,up,rows,cols,rank,scale})));
  }
  assert.equal(k.product({down:new Float32Array([1e20,1,-1e20]),up:new Float32Array([1,1,1]),rows:1,cols:1,rank:3})[0],0);
  const next=1.0000001192092896,nextTwice=1.000000238418579;
  assert.equal(k.product({down:new Float32Array([next,1,1e-30]),up:new Float32Array([next,-nextTwice,1]),rows:1,cols:1,rank:3})[0],Math.fround(1e-30));
  assert.equal(k.apply({base:new Float32Array([-nextTwice]),delta:new Float32Array([next]),scale:next})[0],0);
 }finally{k.dispose();old.dispose();}
});

test('streaming BF16 and F16 decode retains every finite encoding and rejects nonfinite values',async()=>{
 const k=await create(),old=await createKernel({wasmBytes:await fs.readFile(oldWasmURL)});try{
  for(const [dtype,mask]of [['BF16',0x7f80],['F16',0x7c00]]){
   const values=[];for(let bits=0;bits<65536;bits++)if((bits&mask)!==mask)values.push(bits);
   const raw=new Uint8Array(values.length*2),v=new DataView(raw.buffer);values.forEach((x,i)=>v.setUint16(i*2,x,true));
   assert.deepEqual(bits(k.decode(raw,dtype)),bits(old.decode(raw,dtype)));
   const invalid=new Uint8Array(2);new DataView(invalid.buffer).setUint16(0,mask,true);assert.throws(()=>k.decode(invalid,dtype),/non-finite|finite|Hike/);
  }
 }finally{k.dispose();old.dispose();}
});

test('resident down factors are copied, remain valid across decode/apply, and release rejects stale handles',async()=>{
 const k=await create();try{
  const down=new Float32Array([2,3]),handle=k.retainDown({down,cols:2,rank:1});down.fill(0);
  k.decode(new Uint8Array(new Float32Array([12]).buffer),'F32');k.apply({base:new Float32Array([1]),delta:new Float32Array([3]),scale:2});
  const first=k.product({downHandle:handle,up:new Float32Array([4,5]),rows:2,cols:2,rank:1});assert.deepEqual([...first],[8,12,10,15]);
  first.fill(0);assert.deepEqual([...k.product({downHandle:handle,up:new Float32Array([4,5]),rows:2,cols:2,rank:1})],[8,12,10,15]);
  assert.equal(k.stats().residentDownBytes,8);assert.ok(k.stats().productCalls>=2);
  k.releaseDown(handle);assert.equal(k.stats().residentDownBytes,0);assert.throws(()=>k.product({downHandle:handle,up:new Float32Array([4]),rows:1,cols:2,rank:1}),/handle|factor/i);
 }finally{k.dispose();}
});

test('streaming Hike host enforces finite shapes, fixed memory, instance ownership and disposal',async()=>{
 const k=await create(),other=await create();try{
  assert.throws(()=>k.product({down:new Float32Array([NaN]),up:new Float32Array([1]),rows:1,cols:1,rank:1}),/finite/);
  assert.throws(()=>k.product({down:new Float32Array(1),up:new Float32Array(1),rows:1,cols:2,rank:1}),/shape/);
  assert.throws(()=>k.apply({base:new Float32Array([1]),delta:new Float32Array([1]),scale:Infinity}),/scale|finite/);
  assert.throws(()=>k.product({down:new Float32Array(1),up:new Float32Array(9_000_000),rows:9_000_000,cols:1,rank:1}),/budget/);
  const h=k.retainDown({down:new Float32Array([2]),cols:1,rank:1});assert.throws(()=>other.product({downHandle:h,up:new Float32Array([3]),rows:1,cols:1,rank:1}),/handle|factor/i);
  assert.equal(k.info.memoryBytes,32*1024*1024);k.dispose();assert.throws(()=>k.apply({base:new Float32Array(0),delta:new Float32Array(0),scale:1}),/disposed/);
 }finally{k.dispose();other.dispose();}
});

test('owned kernel leases survive owner disposal and the final release frees the WASM capability',async()=>{
 const k=await create(),first=k.retain('package-one'),second=k.retain('package-two');
 k.dispose();assert.equal(k.stats().closing,true);assert.equal(k.stats().leaseCount,2);assert.equal(k.stats().disposed,false);
 assert.throws(()=>k.product({down:new Float32Array([2]),up:new Float32Array([3]),rows:1,cols:1,rank:1}),/closing|disposed/);
 assert.throws(()=>k.retain('too-late'),/closing|disposed/);
 assert.equal(first.isValid(),true);assert.deepEqual([...first.kernel.product({down:new Float32Array([2]),up:new Float32Array([3]),rows:1,cols:1,rank:1})],[6]);
 first.release();assert.equal(first.isValid(),false);assert.throws(()=>first.kernel.decode(new Uint8Array(0),'F32'),/released|lease/);assert.equal(k.stats().disposed,false);
 assert.deepEqual([...second.kernel.apply({base:new Float32Array([1]),delta:new Float32Array([2]),scale:3})],[7]);
 second.release();second.release();assert.equal(k.stats().leaseCount,0);assert.equal(k.stats().disposed,true);assert.equal(k.stats().memoryBytes,0);
});

test('kernel integrity uses an owned byte snapshot across asynchronous hashing and instantiation',async()=>{
 const {createStreamingKernel}=await import(moduleURL),original=await fs.readFile(wasmURL),mutable=Uint8Array.from(original);
 const pending=createStreamingKernel({wasmBytes:mutable});mutable.fill(0);const k=await pending;
 try{assert.deepEqual([...k.product({down:new Float32Array([2]),up:new Float32Array([3]),rows:1,cols:1,rank:1})],[6]);}finally{k.dispose();}
 const bad=Uint8Array.from(original);bad[bad.length-1]^=1;await assert.rejects(createStreamingKernel({wasmBytes:bad}),/hash mismatch/);
});

test('streaming build rejects a self-consistent external manifest for an unpinned compiler',async()=>{
 const record=JSON.parse(await fs.readFile(new URL('./build-record.json',import.meta.url),'utf8')),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'lora-llvm-pin-'));
 try{
  const manifest=structuredClone(record.bootstrap);manifest.clang={...manifest.clang,path:record.emitCommand[0],sha256:record.hikeCompilerSha256};await fs.writeFile(path.join(tmp,'bootstrap-record.json'),JSON.stringify(manifest));
  let error;try{await promisify(execFile)('python',[new URL('./build.py',import.meta.url).pathname,'--out',path.join(tmp,'build')],{env:{...process.env,LORA_HIKE_LLVM:tmp,LORA_HIKE_TOOLCHAIN:path.join(tmp,'unused-toolchain')}});}catch(e){error=e;}
  assert.ok(error,'An unpinned compiler was accepted');assert.match(error.stderr,/pinned.*clang|clang.*pinned/i);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});

test('Hike finite reduction checks every input lane, including NaNs, infinities and scalar tails',async()=>{
 const {instance}=await WebAssembly.instantiate(await fs.readFile(wasmURL),{}),e=instance.exports;
 assert.equal(typeof e.LoraFinite,'function','Hike all-values finite reduction missing');
 const at=1024*1024,finiteBits=new Uint32Array([0,0x80000000,1,0x80000001,0x007fffff,0x807fffff,0x00800000,0x80800000,0x7f7fffff,0xff7fffff]);
 new Uint32Array(e.memory.buffer,at,finiteBits.length).set(finiteBits);assert.equal(e.LoraFinite(at,finiteBits.length),0);assert.equal(e.LoraFinite(at,0),0);
 const bad=[0x7f800000,0xff800000,0x7fc00000,0xffc00000,0x7f800001,0xff800001];
 for(const n of [1,3,4,7,8,15,16,17,31,32,33,65])for(let i=0;i<n;i++){
  const v=new Uint32Array(e.memory.buffer,at,n);v.fill(0);v[i]=bad[i%bad.length];assert.equal(e.LoraFinite(at,n),1,'nonfinite lane '+i+'/'+n);
 }
 const k=await create();try{
  for(const n of [1,17,65])for(const index of [0,n-1]){const base=new Float32Array(n),delta=new Float32Array(n);base[index]=NaN;assert.throws(()=>k.apply({base,delta,scale:0}),/finite/);base[index]=0;delta[index]=Infinity;assert.throws(()=>k.apply({base,delta,scale:0}),/finite/);}
  assert.throws(()=>k.apply({base:new Float32Array([3.4028234663852886e38]),delta:new Float32Array([3.4028234663852886e38]),scale:1}),/finite/);
 }finally{k.dispose();}
});

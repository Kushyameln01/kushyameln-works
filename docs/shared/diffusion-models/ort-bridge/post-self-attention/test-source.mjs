import test from 'node:test';
import assert from 'node:assert/strict';
import {open,readFile} from 'node:fs/promises';
const module=await import('./source.mjs').catch(()=>({}));
const kernel=()=>readFile(new URL('../kernel/bridge.wasm',import.meta.url));
async function original(){
 const handle=await open('/workspace/work/retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors','r'),stat=await handle.stat();
 class Original extends Blob{get size(){return stat.size;}slice(a,b){return {async arrayBuffer(){const v=new Uint8Array(b-a);const r=await handle.read(v,0,v.length,a);assert.equal(r.bytesRead,v.length);return v.buffer;}};}}
 return {file:new Original(),close:()=>handle.close()};
}
function half(bits){const sign=bits&32768?-1:1,e=(bits>>>10)&31,m=bits&1023;return Math.fround(sign*(e===0?m*2**-24:(1+m/1024)*2**(e-15)));}
test('P4 source reads actual F16 O and full-column FFN down row4 without scale disclosure',async()=>{
 assert.equal(typeof module.createP4WeightSource,'function','new independent P4 source required');
 const f=await original();let source;
 try{
  source=await module.createP4WeightSource({file:f.file,side:'LOW',bridgeBytes:await kernel()});
  const d=source.describe();assert.equal(d.entries['blocks.0.cross_attn.o.weight'].storageDtype,'F16');assert.equal(d.entries['blocks.0.cross_attn.o.weight'].fp8ProfileId,null);
  assert.equal(d.entries['blocks.0.cross_attn.q.bias'].operatorBinding.hikeParameter,'bias');
  assert.deepEqual(d.entries['blocks.0.ffn.2.weight'].fullShape,[5120,13824]);assert.deepEqual(d.entries['time_projection.1.weight'].allowedRows,[15360,30720]);
  assert.equal(Object.values(d.entries).some(e=>Object.hasOwn(e,'scale')),false);
  const o=await source.readRows('blocks.0.cross_attn.o.weight',0,1);assert.deepEqual(o.shape,[1,5120]);assert.equal(o.raw.byteLength,10240);
  const raw=new DataView(o.raw.buffer);for(let i=0;i<o.values.length;i++)assert.equal(o.values[i],half(raw.getUint16(i*2,true)));
  const ff=await source.readRows('blocks.0.ffn.2.weight',0,4);assert.deepEqual(ff.shape,[4,13824]);assert.equal(ff.values.length,55296);
  for(const [method,key,start,count] of [['readRows','blocks.0.ffn.2.weight',0,5],['readRows','blocks.0.cross_attn.q.weight',5119,2],['readRows','time_projection.1.weight',15344,16],['readRows','blocks.0.self_attn.q.weight',0,1],['readVector','blocks.0.ffn.0.bias',13824,1],['readVector','blocks.0.modulation',10240,1],['readVector','blocks.0.cross_attn.q.weight',0,1]])await assert.rejects(source[method](key,start,count),/range|key|binding/i);
  const biased=source.addBias(new Float32Array([1,2,3,4]),new Float32Array([.5,-.5]),2,2);assert.deepEqual([...biased],[1.5,1.5,3.5,3.5]);
  assert.equal(source.stats().configReadBytes,155);assert.equal(source.stats().fullFileHashRecomputed,false);assert.ok(source.stats().maxPayloadReadBytes<=163840);
 }finally{source?.dispose();await f.close();}
});
test('P4 source rejects side swap, binary mutation and stale reads',async()=>{
 assert.equal(typeof module.createP4WeightSource,'function');const f=await original();let source;
 try{
  await assert.rejects(module.createP4WeightSource({file:f.file,side:'HIGH',bridgeBytes:await kernel()}),/side|header|size/);
  const bytes=await kernel();bytes[0]^=1;await assert.rejects(module.createP4WeightSource({file:f.file,side:'LOW',bridgeBytes:bytes}),/hash/);
  source=await module.createP4WeightSource({file:f.file,side:'LOW',bridgeBytes:await kernel()});const c=new AbortController();c.abort();await assert.rejects(source.readRows('blocks.0.cross_attn.q.weight',0,1,{signal:c.signal}),{name:'AbortError'});
  source.dispose();await assert.rejects(source.readVector('blocks.0.cross_attn.q.bias',0,1),/disposed/i);
 }finally{source?.dispose();await f.close();}
});
test('P4 source normal reads skip per-range hashes and snapshot the diagnostic policy before awaiting storage',async()=>{
 const f=await original();let source;const digestOriginal=crypto.subtle.digest;let hashes=0;
 try{
  source=await module.createP4WeightSource({file:f.file,side:'LOW',bridgeBytes:await kernel()});
  crypto.subtle.digest=function(...args){hashes++;return digestOriginal.call(this,...args);};
  const options={diagnostics:false},pending=source.readRows('blocks.0.cross_attn.q.weight',0,1,options);options.diagnostics=true;const normal=await pending,bias=await source.readVector('blocks.0.cross_attn.q.bias',0,2,{diagnostics:false});
  assert.equal(hashes,0);for(const value of [normal,bias]){assert.equal(Object.hasOwn(value.source,'rawSHA256'),false);assert.equal(Object.hasOwn(value.source,'decodedF32SHA256'),false);assert.ok(value.values.every(Number.isFinite));assert.ok(value.source.binding.name);assert.ok(value.source.fullShape.length);}
  const detailed=await source.readRows('blocks.0.cross_attn.q.weight',0,1);assert.equal(hashes,2);assert.deepEqual(normal.values,detailed.values);assert.match(detailed.source.rawSHA256,/^[a-f0-9]{64}$/);assert.match(detailed.source.decodedF32SHA256,/^[a-f0-9]{64}$/);
  await assert.rejects(source.readRows('blocks.0.cross_attn.q.weight',0,1,{diagnostics:'false'}),/diagnostic|boolean/i);
 }finally{crypto.subtle.digest=digestOriginal;source?.dispose();await f.close();}
});
test('P4 bias and bridge admission use actual typed-array slots despite subclass getters',async()=>{
 assert.equal(typeof module.createP4WeightSource,'function');const f=await original();let source;
 try{
  source=await module.createP4WeightSource({file:f.file,side:'LOW',bridgeBytes:await kernel()});
  const fakeBuffer=new ArrayBuffer(8);class Spoof extends Float32Array{get length(){return 2;}get byteLength(){return 8;}get byteOffset(){return 0;}get buffer(){return fakeBuffer;}}
  assert.throws(()=>source.addBias(new Spoof([1]),new Spoof([2]),1,2),/F32|shape|compact/i);
  const shared=new Float32Array(new SharedArrayBuffer(8));Object.defineProperty(shared,'buffer',{value:fakeBuffer});assert.throws(()=>source.addBias(shared,new Float32Array([1,2]),1,2),/F32|shared|compact/i);
  const valid=new Float32Array([1,2]);Object.defineProperty(valid,'subarray',{value(){throw Error('Caller virtual subarray invoked');}});assert.deepEqual([...source.addBias(valid,new Float32Array([2,3]),1,2)],[3,5]);
  const badBytes=new Uint8Array(new SharedArrayBuffer(8));Object.defineProperty(badBytes,'buffer',{value:new ArrayBuffer(8)});await assert.rejects(module.createP4WeightSource({file:f.file,side:'LOW',bridgeBytes:badBytes}),/Nonshared/);
 }finally{source?.dispose();await f.close();}
});

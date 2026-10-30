import {test} from 'node:test';
import assert from 'node:assert/strict';
import {open} from 'node:fs/promises';
import {readFile} from 'node:fs/promises';
let api;try{api=await import('./diagnostic-base.mjs');}catch{}
const reference=JSON.parse(await readFile(new URL('../../../../development/ai-connection/l1-reference.json',import.meta.url)));
const hikeBytes=await readFile(new URL('../ort-bridge/kernel/bridge.wasm',import.meta.url));
const sha=async a=>Buffer.from(await crypto.subtle.digest('SHA-256',a)).toString('hex');
const dirname=process.env.BERNINI_MODELS_DIR??'/workspace/work/retained/bernini';
// Node24 openAsBlob truncates this 15.57GB file size modulo 2^32. This test-only
// bounded fs adapter checks immutable stat identity; real browser File is tested separately.
async function diskBlob(path){
 const fd=await open(path,'r'),initial=await fd.stat({bigint:true});
 const verify=async()=>{const s=await fd.stat({bigint:true});assert.equal(s.size,initial.size);assert.equal(s.mtimeNs,initial.mtimeNs);};
 const blob=new class extends Blob{
  get size(){return Number(initial.size);}
  slice(start=0,end=this.size){return {async arrayBuffer(){await verify();const b=Buffer.alloc(end-start);let at=0;while(at<b.length){const r=await fd.read(b,at,b.length-at,start+at);if(!r.bytesRead)throw Error('Short actual-file read');at+=r.bytesRead;}await verify();return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}};}
 };
 return {blob,close:()=>fd.close()};
}
for(const ref of reference.models)test('owned Hike F32 block from immutable actual '+ref.side+' base',async()=>{
 assert.equal(typeof api?.createBerniniDiagnosticBase,'function','Missing immutable real-base provider');
 const disk=await diskBlob(dirname+'/'+ref.name),base=await api.createBerniniDiagnosticBase({file:disk.blob,side:ref.side,hikeBytes});
 try{
  const r=base.describe(),ctx={modelHash:r.modelHash,graphHash:r.graphHash,registryHash:r.registryHash};
  assert.equal(r.scope,'PARTIAL');assert.equal(r.baseVerification.fullFileSHA256Verified,false);
  assert.deepEqual(r.targets[0].fullShape,[5120,5120]);assert.deepEqual(r.targets[0].shape,[16,5120]);assert.equal(r.targets[0].binding.kind,'runtime-input');assert.equal(r.targets[1].binding.kind,'hike-parameter');
  const w=await base.baseProvider.readBlock('q.weight',0,81920,ctx),b=await base.baseProvider.readBlock('q.bias',0,16,ctx);
  assert.equal(await sha(w),ref.weightSHA256);assert.equal(await sha(b),ref.biasSHA256);
  const m=base.stats().hike.memoryBytes;w.fill(999);b.fill(999);
  const w2=await base.baseProvider.readBlock('q.weight',0,13,ctx);assert.equal(w2.length,13);assert.equal(base.stats().hike.memoryBytes,m);
  await assert.rejects(()=>base.baseProvider.readBlock('q.weight',81919,2,ctx),/range|bounds/i);
  await assert.rejects(()=>base.baseProvider.readBlock('q.weight',0,1,{...ctx,graphHash:'0'.repeat(64)}),/identity|binding/i);
  await assert.rejects(()=>base.baseProvider.readBlock('unknown',0,1,ctx),/weight|target/i);
  const c=new AbortController();c.abort();await assert.rejects(()=>base.baseProvider.readBlock('q.weight',0,1,{...ctx,signal:c.signal}));
  assert.equal(base.describe().fp8ProfileId,'scaled-e4m3fn-scalar-f32-v1');
 }finally{base.dispose();await disk.close();}
 await assert.rejects(()=>base.baseProvider.readBlock('q.weight',0,1,{}),/disposed/i);
});
test('header/side, range and registry snapshot checks precede acceptance',async()=>{
 assert.equal(typeof api?.createBerniniDiagnosticBase,'function','Missing immutable real-base provider');
 const disk=await diskBlob(dirname+'/'+reference.models[0].name),file=disk.blob;
 try{
 await assert.rejects(()=>api.createBerniniDiagnosticBase({file,side:'HIGH',hikeBytes}),/header|identity/i);
 await assert.rejects(()=>api.createBerniniDiagnosticBase({file,side:'LOW',rowStart:5105,hikeBytes}),/row|slice|range/i);
 await assert.rejects(()=>api.createBerniniDiagnosticBase({file:new Blob(['bad']),side:'LOW',hikeBytes}),/file|header|length/i);
 }finally{await disk.close();}
});
test('quantization payload must match the explicit scalar E4M3FN profile',async()=>{
 const disk=await diskBlob(dirname+'/'+reference.models[0].name),file=disk.blob;
 try{
  const old=file.slice.bind(file),headerBytes=181280,offset=181288+15574642397;
  file.slice=(start,end)=>start===offset?new Blob([new Uint8Array(27)]):old(start,end);
  await assert.rejects(()=>api.createBerniniDiagnosticBase({file,side:'LOW',hikeBytes}),/config|quant|profile/i);
 }finally{await disk.close();}
});
test('canonical registry bytes use UTF16 keys, ECMAScript finite numbers and reject malformed Unicode',()=>{
 assert.equal(api.canonicalRegistryJSON({z:1,a:[1e30,4.5,2e-3,1e-27,-0]}),'{"a":[1e+30,4.5,0.002,1e-27,0],"z":1}');
 const keys=['\ufb33','😀','€','ö','\u0080','1','\r'];
 const value=Object.fromEntries(keys.map(k=>[k,k]));
 const expected=['\r','1','\u0080','ö','€','😀','\ufb33'];
 assert.equal(api.canonicalRegistryJSON(value),'{'+expected.map(k=>JSON.stringify(k)+':'+JSON.stringify(k)).join(',')+'}');
 assert.throws(()=>api.canonicalRegistryJSON({n:NaN}));assert.throws(()=>api.canonicalRegistryJSON('\ud800'));
});
test('canonical registry rejects sparse arrays instead of hashing non-JSON holes',()=>{
 assert.throws(()=>api.canonicalRegistryJSON({shape:Array(2)}),/JSON|array|undefined/i);
});

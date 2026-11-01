import test from 'node:test';
import assert from 'node:assert/strict';
import {open,readFile} from 'node:fs/promises';
const source=await import('./source.mjs').catch(()=>({}));
const bytes=async p=>new Uint8Array(await readFile(new URL(p,import.meta.url)));
async function original(side='LOW'){
 const h=await open(`/workspace/work/retained/bernini/Bernini_${side}_fp8_e4m3fn_scaled.safetensors`,'r'),stat=await h.stat();
 class Original extends Blob {get size(){return stat.size;}slice(a,b){return {async arrayBuffer(){const v=new Uint8Array(b-a);await h.read(v,0,v.length,a);return v.buffer;}};}}
 return {file:new Original(),close:()=>h.close()};
}
test('tail source exposes only actual O and original chunk2 ranges',async()=>{
 assert.equal(typeof source.createTailWeightSource,'function','new independent bounded tail source required');
 const f=await original();let p;
 try{p=await source.createTailWeightSource({file:f.file,side:'LOW',bridgeBytes:await bytes('../kernel/bridge.wasm')});
 const d=p.describe();assert.deepEqual(Object.keys(d.entries).sort(),['blocks.0.modulation','blocks.0.self_attn.o.bias','blocks.0.self_attn.o.weight','time_projection.1.bias','time_projection.1.weight']);
 assert.deepEqual(d.entries['time_projection.1.weight'].fullShape,[30720,5120]);assert.deepEqual(d.entries['time_projection.1.weight'].allowedRows,[10240,15360]);
 assert.deepEqual(d.entries['blocks.0.self_attn.o.weight'].fullShape,[5120,5120]);assert.equal(d.entries['blocks.0.self_attn.o.weight'].fp8ProfileId,'scaled-e4m3fn-scalar-f32-v1');
 const a=await p.readRows('time_projection.1.weight',10240,16);assert.deepEqual(a.shape,[16,5120]);assert.equal(a.source.rowStart,10240);assert.equal(a.raw.byteLength,163840);assert.ok(a.values.every(Number.isFinite));
 const b=await p.readVector('blocks.0.modulation',10240,5120);assert.equal(b.source.elementOffset,10240);assert.deepEqual(b.source.fullShape,[1,6,5120]);
 const o=await p.readRows('blocks.0.self_attn.o.weight',0,16);assert.equal(o.raw.byteLength,81920);assert.equal(o.values.length,81920);
 for(const [key,start,count,method] of [['time_projection.1.weight',0,16,'readRows'],['time_projection.1.weight',15360,16,'readRows'],['blocks.0.self_attn.o.weight',5119,16,'readRows'],['blocks.0.self_attn.q.weight',0,16,'readRows'],['time_projection.1.bias',0,5120,'readVector'],['blocks.0.modulation',0,5120,'readVector']])await assert.rejects(p[method](key,start,count),/range|key/i);
 assert.equal(p.stats().headerReadBytes,181288);assert.equal(p.stats().configReadBytes,31);assert.equal(p.stats().maxPayloadReadBytes,163840);assert.equal(p.stats().fullFileHashRecomputed,false);
 }finally{p?.dispose();await f.close();}
});
test('tail source rejects side swap and tampered bridge before payload',async()=>{
 assert.equal(typeof source.createTailWeightSource,'function');const f=await original();
 try{await assert.rejects(source.createTailWeightSource({file:f.file,side:'HIGH',bridgeBytes:await bytes('../kernel/bridge.wasm')}),/side|header|size/);const b=await bytes('../kernel/bridge.wasm');b[0]^=1;await assert.rejects(source.createTailWeightSource({file:f.file,side:'LOW',bridgeBytes:b}),/hash/);}finally{await f.close();}
});
test('source busy precedes reentrant getters and post-await cancellation clears lock',async()=>{
 assert.equal(typeof source.createTailWeightSource,'function');const f=await original();let p;const digest=crypto.subtle.digest;let release,entered;
 try{p=await source.createTailWeightSource({file:f.file,side:'LOW',bridgeBytes:await bytes('../kernel/bridge.wasm')});const barrier=new Promise(r=>release=r),gate=new Promise(r=>entered=r);let once=true;crypto.subtle.digest=async function(...args){if(once){once=false;entered();await barrier;}return digest.call(this,...args);};
 const c=new AbortController(),pending=p.readRows('blocks.0.self_attn.o.weight',0,16,{signal:c.signal});await gate;let touched=false;
 await assert.rejects(p.readRows('blocks.0.self_attn.o.weight',0,16,{get signal(){touched=true;return null;}}),/busy/);assert.equal(touched,false);assert.throws(()=>p.dispose(),/Await|busy/);c.abort();release();await assert.rejects(pending,{name:'AbortError'});assert.equal(p.stats().busy,false);crypto.subtle.digest=digest;assert.equal((await p.readRows('blocks.0.self_attn.o.weight',0,16)).values.length,81920);
 }finally{crypto.subtle.digest=digest;release?.();p?.dispose();await f.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const sdkURL=new URL('../../docs/shared/inference/lora/sdk.mjs',import.meta.url);
let createLora;
test('independent LoRA API exists',async()=>{assert.ok(await fs.stat(sdkURL).catch(()=>null),'LoRA SDK not implemented');({createLora}=await import(sdkURL));});
const hash='a'.repeat(64);
function fixture(extra={}){
 const values={'layer.lora_down.weight':[[2,2],[1,2,3,4]],'layer.lora_up.weight':[[2,2],[2,1,1,-1]],'layer.alpha':[[],[2]],'layer.diff_b':[[2],[1,2]],...extra};
 let at=0;const h={};const chunks=[];
 for(const [k,[shape,v]] of Object.entries(values)){const b=new Uint8Array(new Float32Array(v).buffer);h[k]={dtype:'F32',shape,data_offsets:[at,at+b.length]};at+=b.length;chunks.push(b);}
 let text=JSON.stringify(h);text+=' '.repeat((8-text.length%8)%8);const header=new TextEncoder().encode(text), b=new Uint8Array(8+header.length+at);new DataView(b.buffer).setBigUint64(0,BigInt(header.length),true);b.set(header,8);at=8+header.length;for(const c of chunks){b.set(c,at);at+=c.length;}
 return {size:b.length,read:async(o,n,{signal}={})=>{signal?.throwIfAborted();return b.slice(o,o+n);}};
}
async function engine(source=fixture()){
 const {createKernel}=await import('../../docs/shared/inference/lora/kernel/host.mjs');
 const kernel=await createKernel({wasmBytes:await fs.readFile(new URL('../../docs/shared/inference/lora/kernel/lora.wasm',import.meta.url))});
 const descriptor={url:'https://example.test/model.safetensors',size:source.size,sha256:hash,fileName:'model.safetensors'};
 return createLora({kernel,catalog:{light:{id:'light',high:descriptor,low:descriptor}},sourceFactory:()=>source});
}
const selection={category:'light',noise:'high'};
function registry(){return {apiVersion:1,modelHash:hash,graphHash:hash,registryVersion:'test-v1',targets:[{key:'layer.weight',weightId:'w',module:'diffusion_models',graphInitializer:'W',shape:[2,2],dtype:'F32',layout:'row-major'},{key:'layer.bias',weightId:'b',module:'diffusion_models',graphInitializer:'B',shape:[2],dtype:'F32',layout:'row-major'}]};}
const baseProvider={readBlock:async(id,offset,count)=>new Float32Array(count).fill(id==='w'?10:0)};
function storage(){const blocks=[];let aborted=false,released=false;return {blocks,get aborted(){return aborted;},get released(){return released;},begin:async()=>{},writeBlock:async b=>blocks.push({...b,data:b.data.slice()}),finish:async()=>({blocks}),abort:async()=>{aborted=true;},release:async()=>{released=true;}};}
test('all patches affect actual Hike result; base immutable, strength zero and repeat',async()=>{
 if(!createLora)return;const api=await engine();
 const report=await api.inspect(selection);assert.equal(report.tensorCount,4);
 const plan=await api.plan({selection,strength:1,target:registry()});const sink=storage();
 const p=await api.prepare(plan,{baseProvider,sink,blockRows:1});
 assert.deepEqual(sink.blocks.filter(b=>b.weightId==='w').flatMap(b=>[...b.data]),[15,18,8,8]);assert.deepEqual(sink.blocks.filter(b=>b.weightId==='b').flatMap(b=>[...b.data]),[1,2]);assert.equal(p.manifest.kernel.wasmSha256.length,64);
 await api.release(p);
 const zero=await api.plan({selection,strength:0,target:registry()});const z=storage();await api.prepare(zero,{baseProvider,sink:z});assert.deepEqual(z.blocks.flatMap(b=>[...b.data]),[10,10,10,10,0,0]);api.dispose();
});
test('unknown tensors, target omissions and missing source are rejected before writes',async()=>{
 if(!createLora)return;let api=await engine(fixture({'layer.dora_scale':[[2],[1,1]]}));await assert.rejects(api.plan({selection,strength:1,target:registry()}),/unsupported|unknown/i);api.dispose();
 api=await engine();const r=registry();r.targets.pop();await assert.rejects(api.plan({selection,strength:1,target:r}),/missing|target/i);await assert.rejects(api.inspect({category:'detail',noise:'high'}),/source|category/i);api.dispose();
});
test('cancel invalidates pending base read and stale plan cannot prepare',async()=>{
 if(!createLora)return;const api=await engine();const plan=await api.plan({selection,strength:1,target:registry()});const sink=storage();let resume,started;
 const ready=new Promise(r=>started=r),waiting=new Promise(r=>resume=r);
 const pending=api.prepare(plan,{sink,baseProvider:{readBlock:async(...args)=>{started();await waiting;return baseProvider.readBlock(...args);}}});await ready;api.cancel();resume();await assert.rejects(pending,/cancel|stale|abort/i);assert.equal(sink.aborted,true);assert.equal(sink.blocks.length,0);await assert.rejects(api.prepare(plan,{sink:storage(),baseProvider}),/stale/i);api.dispose();
});
test('consumer load failure rolls back and cannot commit; success and detach snapshot',async()=>{
 if(!createLora)return;const api=await engine();const plan=await api.plan({selection,strength:1,target:registry()});const sink=storage();const p=await api.prepare(plan,{baseProvider,sink});let commits=0,rollbacks=0;
 const target={describe:async()=>registry(),prepareLoad:async()=>{throw Error('load failed');},validate:async()=>true,commit:async()=>commits++,rollback:async()=>rollbacks++};
 await assert.rejects(api.apply(p,target),/load failed/);assert.equal(commits,0);assert.equal(rollbacks,1);
 target.prepareLoad=async()=>({session:'real-consumer-fixture'});const applied=await api.apply(p,target);assert.equal(applied.applicationRevision,plan.applicationRevision);assert.equal(commits,1);
 target.prepareBase=async()=>({session:'base-fixture'});await api.detach(target);assert.equal(commits,2);await api.release(p);assert.equal(sink.released,true);api.dispose();
});
test('local folder entry applies chosen High/Low without HTTP or catalog registration',async()=>{
 if(!createLora)return;const {openLoraFolder}=await import('../../docs/shared/inference/lora/folder.mjs');
 const original=fixture();const bytes=await original.read(0,original.size);
 const folder=openLoraFolder([new File([bytes],'HighNoise.safetensors'),new File([bytes],'LowNoise.safetensors')]);
 const {createKernel}=await import('../../docs/shared/inference/lora/kernel/host.mjs');const kernel=await createKernel({wasmBytes:await fs.readFile(new URL('../../docs/shared/inference/lora/kernel/lora.wasm',import.meta.url))});
 const api=await createLora({folder,kernel,sourceFactory:()=>{throw Error('must not fetch');}});const report=await api.inspect({pairId:'folder',noise:'low'});assert.equal(report.fileName,'LowNoise.safetensors');
 const p=await api.plan({selection:{pairId:'folder',noise:'low'},strength:1,target:registry()});assert.match(p.source.integrity,/whole-file-sha256-verified/);const out=storage();await api.prepare(p,{baseProvider,sink:out});assert.deepEqual(out.blocks[0].data,new Float32Array([15,18,8,8]));await api.dispose();kernel.dispose();
});
test('local inputs with same header but different content have distinct application identities',async()=>{
 if(!createLora)return;const {openLoraFolder}=await import('../../docs/shared/inference/lora/folder.mjs');const source=fixture(),a=await source.read(0,source.size),b=a.slice();b[b.length-1]^=1;
 const {createKernel}=await import('../../docs/shared/inference/lora/kernel/host.mjs');const kernel=await createKernel({wasmBytes:await fs.readFile(new URL('../../docs/shared/inference/lora/kernel/lora.wasm',import.meta.url))});
 const hashes=[];for(const bytes of [a,b]){const folder=openLoraFolder([new File([bytes],'HighNoise.safetensors'),new File([bytes],'LowNoise.safetensors')]);const api=await createLora({folder,kernel});hashes.push((await api.plan({selection:{pairId:'folder',noise:'high'},strength:1,target:registry()})).adapterSetHash);await api.dispose();}assert.notEqual(hashes[0],hashes[1]);kernel.dispose();
});
test('caller cannot relabel HighNoise as LowNoise during asynchronous inspection',async()=>{
 if(!createLora)return;const api=await engine();const input={category:'light',noise:'high'};const pending=api.plan({selection:input,strength:1,target:registry()});input.noise='low';const p=await pending;assert.equal(p.selection.noise,'high');assert.equal(p.source.selection.noise,'high');await api.dispose();
});
test('consumer transactions serialize; package cannot release until load settles; disposal waits',async()=>{
 if(!createLora)return;const api=await engine();const plan=await api.plan({selection,strength:1,target:registry()});const sink=storage(),p=await api.prepare(plan,{baseProvider,sink});let resume,started;const ready=new Promise(r=>started=r),wait=new Promise(r=>resume=r);let rollbacks=0;
 const target={describe:async()=>registry(),prepareLoad:async()=>{started();await wait;return {};},validate:async()=>true,commit:async()=>{},rollback:async()=>rollbacks++};
 const applying=api.apply(p,target);await ready;const second=api.apply(p,target);const outcome=await Promise.race([second.then(()=>null,e=>e),new Promise(r=>setTimeout(()=>r('not serialized'),20))]);if(outcome==='not serialized'){resume();await Promise.allSettled([applying,second]);assert.fail('Consumer transactions not serialized');}assert.match(String(outcome),/running|busy|transaction/i);await assert.rejects(api.release(p),/use|busy|transaction/i);
 const disposing=api.dispose();await new Promise(r=>setTimeout(r,0));assert.equal(sink.released,false);resume();await assert.rejects(applying,/disposed|cancel|stale|abort/i);await disposing;assert.equal(sink.released,true);assert.equal(rollbacks,1);
});
test('partially initialized sink is aborted when begin rejects',async()=>{
 if(!createLora)return;const api=await engine();const p=await api.plan({selection,strength:1,target:registry()});const sink=storage();sink.begin=async()=>{throw Error('begin failed after allocation');};await assert.rejects(api.prepare(p,{baseProvider,sink}),/begin failed/);assert.equal(sink.aborted,true);await api.dispose();
});
test('failed sink release retains ownership so cleanup can retry',async()=>{
 if(!createLora)return;const api=await engine();const p=await api.plan({selection,strength:1,target:registry()});const sink=storage();let attempts=0;sink.release=async()=>{if(++attempts===1)throw Error('transient close failure');};const prepared=await api.prepare(p,{baseProvider,sink});await assert.rejects(api.release(prepared),/transient/);await api.release(prepared);assert.equal(attempts,2);await api.dispose();
});
test('consumer cannot load a package while asynchronous release is in progress',async()=>{
 if(!createLora)return;const api=await engine();const p=await api.plan({selection,strength:1,target:registry()});const sink=storage();let resume;const wait=new Promise(r=>resume=r);sink.release=async()=>wait;const prepared=await api.prepare(p,{baseProvider,sink});const release=api.release(prepared);let loads=0;const target={describe:async()=>registry(),prepareLoad:async()=>{loads++;return {};},validate:async()=>true,commit:async()=>{},rollback:async()=>{}};let error;try{await api.apply(prepared,target);}catch(e){error=e;}resume();await release;assert.match(String(error),/releas|stale|use/i);assert.equal(loads,0);await api.dispose();
});

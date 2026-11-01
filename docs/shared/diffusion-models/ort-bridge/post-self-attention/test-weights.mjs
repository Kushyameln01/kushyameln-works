import test from 'node:test';
import assert from 'node:assert/strict';
import {open,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createP4WeightSource} from './source.mjs';
import {captureP4FixtureConditioning,snapshotP4CapturedConditioning,p4ConditioningMetadataBytes} from './conditioning.mjs';
const module=await import('./weights.mjs').catch(()=>({}));
const digest=x=>createHash('sha256').update(new Uint8Array(x.buffer,x.byteOffset,x.byteLength)).digest('hex');
const W='blocks.0.cross_attn.q.weight',B='blocks.0.cross_attn.q.bias';
async function fixture(fn){
 assert.equal(typeof module.createP4WeightFeed,'function','new owned sparse final-F32 feed required');
 const h=await open('/workspace/work/retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors','r'),stat=await h.stat();
 class Original extends Blob{get size(){return stat.size;}slice(a,b){return {async arrayBuffer(){const v=new Uint8Array(b-a);await h.read(v,0,v.length,a);return v.buffer;}};}}
 const source=await createP4WeightSource({file:new Original(),side:'LOW',bridgeBytes:await readFile(new URL('../kernel/bridge.wasm',import.meta.url))}),feed=module.createP4WeightFeed({source});
 const r=feed.registry(),id=Object.fromEntries(['modelHash','graphHash','registryHash','side','executionProfileId','scope'].map(k=>[k,r[k]])),context={...id,isCurrent:()=>true};
 try{await fn({source,feed,r,id,context});}finally{await feed.dispose();source.dispose();await h.close();}
}
const block=(r,key,offset,data)=>{const t=r.targets.find(t=>t.weightId===key);return {weightId:key,offset,count:data.length,fullShape:t.fullShape,binding:t.binding,dtype:'F32',sha256:digest(data),data};};
async function packageFor(f,value){const sink=f.feed.createSink();await sink.begin({...f.id,patches:[{weightId:W,offset:0,count:5120}]});await sink.writeBlock(block(f.r,W,0,new Float32Array(5120).fill(value)));return {sink,handle:await sink.finish(f.id)};}
function reference(value){const expected=new Float32Array(10240).fill(value);return {input:{residual:new Float32Array(10240),timeAct1:new Float32Array(5120),conditioning:captureP4FixtureConditioning({shape:[1,1,4096],data:new Float32Array(4096),attentionMask:new Uint8Array([1]),fixtureId:'weights-boundary-test',sourceRef:'independent-owned-F32-test'})},expected,expectedSHA256:digest(expected),referenceId:'independent-test-boundary-reference',gateId:'p4-cross-ffn-composed-f32-v1',tolerance:{absolute:0.01,relative:0.001},run:async(view,input)=>{const tile=await view.readRows(W,0,1),d=view.describe(),c=input.conditioning;return {output:new Float32Array(10240).fill(tile.values[0]),evidence:{executionProfileId:d.executionProfileId,graphSHA256:d.graphHash,weightFeedPackageHash:d.packageHash,weightFeedEpoch:d.epoch,inputHashes:{residualSHA256:digest(input.residual),timeAct1SHA256:digest(input.timeAct1),conditioningSHA256:digest(c.data),conditioningMaskSHA256:digest(c.attentionMask),conditioningMetadataSHA256:digest(p4ConditioningMetadataBytes(c.metadata))},conditioning:{schemaVersion:c.schemaVersion,rows:c.rows,shape:c.shape,meaning:c.meaning,metadata:c.metadata}}};}};}
test('P4 sparse sink enforces binding, complete declared coverage and owned write bytes',()=>fixture(async f=>{
 const slots=f.r.targets.map(t=>t.binding.kind+':'+t.binding.name);assert.equal(new Set(slots).size,12);assert.deepEqual(f.r.targets.find(t=>t.weightId==='blocks.0.ffn.2.weight').fullShape,[5120,13824]);
 const sink=f.feed.createSink();await assert.rejects(sink.begin({...f.id,registryHash:'0'.repeat(64),patches:[{weightId:W,offset:0,count:5120}]}),/identity|binding/i);
 await sink.begin({...f.id,patches:[{weightId:W,offset:0,count:5120},{weightId:B,offset:0,count:1}]});
 const data=new Float32Array(5120).fill(2),good=block(f.r,W,0,data);
 await assert.rejects(sink.writeBlock({...good,binding:{kind:'initializer',name:W}}),/binding/i);
 await assert.rejects(sink.writeBlock({...good,offset:1}),/range|column/i);
 const pending=sink.writeBlock(good);data.fill(99);await pending;
 await assert.rejects(sink.writeBlock(good),/overlap/i);await assert.rejects(sink.finish(f.id),/coverage|complete/i);
 await sink.writeBlock(block(f.r,B,0,new Float32Array([3])));const handle=await sink.finish(f.id),candidate=await f.feed.prepareLoad(handle,f.context);assert.equal(f.feed.stats().retainedPatchBytes,20484);await sink.release(handle);
 const receipt=await f.feed.validate(candidate,{...f.context,...reference(2)});assert.equal(receipt.valid,true);await f.feed.commit(candidate,f.context);await f.feed.releaseCandidate(candidate);
 assert.equal((await f.feed.readRows(W,0,1)).values[0],2);assert.equal((await f.feed.readVector(B,0,1)).values[0],3);
 const original=await f.feed.baseProvider.readBlock(W,0,5120,{...f.id,fullShape:[5120,5120]});assert.notEqual(original[0],2);
 await assert.rejects(f.feed.baseProvider.readBlock(W,0,5120,{...f.id,registryHash:'f'.repeat(64),fullShape:[5120,5120]}),/identity|binding/i);
}));
test('P4 candidate refuses invented validation and stale commits',()=>fixture(async f=>{
 const a=await packageFor(f,2),b=await packageFor(f,3),ca=await f.feed.prepareLoad(a.handle,f.context),cb=await f.feed.prepareLoad(b.handle,f.context);
 await assert.rejects(f.feed.validate(ca,{...f.context,...reference(2),run:async()=>({valid:true})}),/runtime|output|evidence/i);
 await assert.rejects(f.feed.validate(ca,{...f.context,...reference(2),expectedSHA256:'0'.repeat(64)}),/reference|hash/i);
 await f.feed.validate(ca,{...f.context,...reference(2)});await f.feed.validate(cb,{...f.context,...reference(3)});await f.feed.commit(ca,f.context);
 await assert.rejects(f.feed.commit(cb,f.context),/stale|epoch/i);await f.feed.rollback(cb,f.context);assert.equal((await f.feed.readRows(W,0,1)).values[0],2);
 await a.sink.release(a.handle);await b.sink.release(b.handle);
}));
test('P4 captured run source retains one immutable epoch across switches and history release',()=>fixture(async f=>{
 const base=f.feed.captureSource(),initial=(await base.readRows(W,0,1)).values[0],a=await packageFor(f,2),ca=await f.feed.prepareLoad(a.handle,f.context);
 await f.feed.validate(ca,{...f.context,...reference(2)});await f.feed.commit(ca,f.context);const patched=f.feed.captureSource(),epoch=patched.describe().epoch;
 await f.feed.releaseCandidate(ca);await a.sink.release(a.handle);const restore=await f.feed.prepareBase(f.context);
 const ref=reference(initial);await f.feed.validate(restore,{...f.context,...ref});await f.feed.commit(restore,f.context);await f.feed.releaseCandidate(restore);
 assert.equal((await base.readRows(W,0,1)).values[0],initial);assert.equal((await patched.readRows(W,0,1)).values[0],2);assert.equal(patched.describe().epoch,epoch);assert.ok(f.feed.describe().epoch>epoch);
 patched.release();patched.release();base.release();await assert.rejects(patched.readRows(W,0,1),/released/i);assert.equal(f.feed.stats().readLeases,0);
}));
test('P4 abort invalidates a package and cancellation never commits or disposes its caller source',()=>fixture(async f=>{
 const sink=f.feed.createSink();await sink.begin({...f.id,patches:[{weightId:W,offset:0,count:5120}]});await sink.abort();await assert.rejects(sink.finish(f.id),/transaction/i);
 const a=await packageFor(f,2),c=await f.feed.prepareLoad(a.handle,f.context),abort=new AbortController();abort.abort();await assert.rejects(f.feed.validate(c,{...f.context,...reference(2),signal:abort.signal}),{name:'AbortError'});
 await assert.rejects(f.feed.commit(c,f.context),/valid/i);await f.feed.rollback(c,{...f.context,signal:abort.signal});await a.sink.release(a.handle);await f.feed.dispose();assert.equal(f.source.stats().disposed,false);await assert.rejects(f.feed.readRows(W,0,1),/disposed/i);
}));
test('P4 sink rejects spoofed slots, shared backing and detached payloads',()=>fixture(async f=>{
 const sink=f.feed.createSink();await sink.begin({...f.id,patches:[{weightId:W,offset:0,count:5120}]});const template=block(f.r,W,0,new Float32Array(5120)),fakeBuffer=new ArrayBuffer(20480);
 class Spoof extends Float32Array{get length(){return 5120;}get byteLength(){return 20480;}get byteOffset(){return 0;}get buffer(){return fakeBuffer;}}
 await assert.rejects(sink.writeBlock({...template,data:new Spoof([7]),sha256:digest(new Float32Array([7]))}),/compact|F32/i);
 const shared=new Float32Array(new SharedArrayBuffer(20480));Object.defineProperty(shared,'buffer',{value:fakeBuffer});await assert.rejects(sink.writeBlock({...template,data:shared}),/compact|F32/i);
 const detached=new Float32Array(5120);structuredClone(detached,{transfer:[detached.buffer]});await assert.rejects(sink.writeBlock({...template,data:detached}),/compact|F32/i);
 await sink.abort();
}));
test('P4 abort during asynchronous hashing cannot finish a stale transaction',()=>fixture(async f=>{
 const sink=f.feed.createSink();await sink.begin({...f.id,patches:[{weightId:W,offset:0,count:5120}]});const digestOriginal=crypto.subtle.digest;let enter,release;
 const entered=new Promise(r=>enter=r),barrier=new Promise(r=>release=r);let once=true;
 crypto.subtle.digest=async function(...args){if(once){once=false;enter();await barrier;}return digestOriginal.call(this,...args);};
 try{const pending=sink.writeBlock(block(f.r,W,0,new Float32Array(5120)));await entered;await sink.abort();release();await assert.rejects(pending,/aborted/i);assert.equal(f.feed.stats().packages,0);await assert.rejects(sink.finish(f.id),/transaction/i);}
 finally{crypto.subtle.digest=digestOriginal;release();}
}));
test('P4 validation preserves capture recognition and binds mask, shape and producer metadata',()=>fixture(async f=>{
 const p=await packageFor(f,2),c=await f.feed.prepareLoad(p.handle,f.context),ref=reference(2),run=ref.run;
 const receipt=await f.feed.validate(c,{...f.context,...ref,run:async(view,input)=>{snapshotP4CapturedConditioning(input.conditioning);return run(view,input);}});assert.equal(receipt.valid,true);
 for(const change of [r=>r.evidence.weightFeedEpoch=-1,r=>r.evidence.inputHashes.conditioningMaskSHA256='f'.repeat(64),r=>r.evidence.conditioning.shape=[1,2,4096],r=>r.evidence.conditioning.metadata.producer.owner='other-producer'])await assert.rejects(f.feed.validate(c,{...f.context,...ref,run:async(...args)=>{const result=await run(...args);change(result);return result;}}),/conditioning|input|metadata|evidence/i);
 await assert.rejects(f.feed.validate(c,{...f.context,...ref,run:async(view,input)=>{const result=await run(view,input);input.conditioning.shape[1]=2;return result;}}),/conditioning|shape|evidence/i);
 await f.feed.rollback(c,f.context);await p.sink.release(p.handle);
}));
test('P4 immutable-base candidates obey the same retained-candidate budget',()=>fixture(async f=>{
 const owned=[];for(let i=0;i<4;i++)owned.push(await f.feed.prepareBase(f.context));await assert.rejects(f.feed.prepareBase(f.context),/resource|budget/i);for(const c of owned)await f.feed.releaseCandidate(c);
}));
test('P4 composed numeric gate is fixed before candidate validation',()=>fixture(async f=>{
 const p=await packageFor(f,2),candidate=await f.feed.prepareLoad(p.handle,f.context),ref=reference(2);let called=false;
 for(const wrong of [{gateId:'different-profile'},{tolerance:{absolute:1,relative:1}}])await assert.rejects(f.feed.validate(candidate,{...f.context,...ref,...wrong,run:async()=>{called=true;return {valid:true};}}),/gate|tolerance/i);
 assert.equal(called,false);await f.feed.rollback(candidate,f.context);await p.sink.release(p.handle);
}));
test('P4 caps simultaneous read leases and staged transactions',()=>fixture(async f=>{
 const leases=[];for(let i=0;i<16;i++)leases.push(f.feed.captureSource());assert.throws(()=>f.feed.captureSource(),/lease|budget/i);for(const v of leases)v.release();
 const sinks=[];for(let i=0;i<4;i++){const s=f.feed.createSink();await s.begin({...f.id,patches:[{weightId:W,offset:0,count:5120}]});sinks.push(s);}const extra=f.feed.createSink();await assert.rejects(extra.begin({...f.id,patches:[{weightId:W,offset:0,count:5120}]}),/transaction|budget/i);for(const s of sinks)await s.abort();
}));
test('P4 aggregate patch budget counts active immutable blocks after package release',()=>fixture(async f=>{
 const owned=[],count=819*5120;
 for(let i=0;i<4;i++){const sink=f.feed.createSink();await sink.begin({...f.id,patches:[{weightId:W,offset:0,count}]});for(let offset=0;offset<count;offset+=81920){const n=Math.min(81920,count-offset);await sink.writeBlock(block(f.r,W,offset,new Float32Array(n).fill(2)));}owned.push({sink,handle:await sink.finish(f.id)});}
 const c=await f.feed.prepareLoad(owned[0].handle,f.context);await f.feed.validate(c,{...f.context,...reference(2)});await f.feed.commit(c,f.context);await f.feed.releaseCandidate(c);await owned[0].sink.release(owned[0].handle);
 assert.equal(f.feed.stats().retainedPatchBytes,4*count*4);const sink=f.feed.createSink();await sink.begin({...f.id,patches:[{weightId:W,offset:0,count:5120}]});await assert.rejects(sink.writeBlock(block(f.r,W,0,new Float32Array(5120))),/aggregate|budget/i);
 await owned[1].sink.release(owned[1].handle);await sink.writeBlock(block(f.r,W,0,new Float32Array(5120)));await sink.abort();for(const p of owned)await p.sink.release(p.handle);
}));
test('P4 simultaneous package finishes cannot exceed the retained-package budget',()=>fixture(async f=>{
 const owned=[];for(let i=0;i<3;i++)owned.push(await packageFor(f,2));const ready=[];
 for(let i=0;i<2;i++){const sink=f.feed.createSink();await sink.begin({...f.id,patches:[{weightId:W,offset:0,count:5120}]});await sink.writeBlock(block(f.r,W,0,new Float32Array(5120)));ready.push(sink);}
 const results=await Promise.allSettled(ready.map(s=>s.finish(f.id)));assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.feed.stats().packages,4);
 for(let i=0;i<results.length;i++)if(results[i].status==='fulfilled')await ready[i].release(results[i].value);else await ready[i].abort();for(const p of owned)await p.sink.release(p.handle);
}));

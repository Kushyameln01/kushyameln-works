import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {diagnosticRegistryHash} from './diagnostic-identity.mjs';

assert.ok(fs.existsSync(new URL('./diagnostic-consumer.mjs',import.meta.url)), 'Diagnostic runtime-feed consumer implementation missing');
const {createDiagnosticConsumer}=await import('./diagnostic-consumer.mjs');
const sha=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
const h=x=>x.repeat(64);
function registry(){const r={schemaVersion:'bernini-diagnostic-registry/0.1',scope:'PARTIAL',modelHash:h('a'),graphHash:h('b'),registryHash:h('c'),side:'HIGH',executionProfileId:'bernini-q16x5120-f32-wasm-v1',targets:[
 {key:'diffusion_model.blocks.0.self_attn.q.weight',weightId:'q.weight',originalKey:'blocks.0.self_attn.q.weight',fullShape:[5120,5120],shape:[16,5120],dtype:'F32',storageDtype:'F8_E4M3',computeDtype:'F32',layout:'row-major',binding:{kind:'runtime-input',name:'weight'},transform:{kind:'row-slice',rowStart:0,rowCount:16}},
 {key:'diffusion_model.blocks.0.self_attn.q.bias',weightId:'q.bias',originalKey:'blocks.0.self_attn.q.bias',fullShape:[5120],shape:[16],dtype:'F32',storageDtype:'F16',computeDtype:'F32',layout:'row-major',binding:{kind:'hike-parameter',name:'bias'},transform:{kind:'row-slice',rowStart:0,rowCount:16}}
],coverage:{kind:'PARTIAL',fullModel:false}};r.registryHash=diagnosticRegistryHash(r);return r;}
function fixture(){
 const r=registry(),calls=[],weight=new Float32Array(81920),bias=Float32Array.from({length:16},(_,i)=>i/2),x=new Float32Array(5120);x[0]=2;
 for(let i=0;i<16;i++)weight[i*5120]=i+1;
 // This stage is a contract-test double only. Real ORT/Hike is tested separately.
 const stage={async runF32(input){calls.push(input);const output=new Float32Array(16);for(let i=0;i<16;i++)output[i]=input.weight[i*5120]*input.x[0]+input.bias[i];return {output,evidence:{scope:'CONTRACT_TEST_ONLY',graphSHA256:r.graphHash}};},dispose(){throw Error('Caller-owned stage must not be disposed');}};
 const reads=[],baseProvider={async readBlock(id,offset,count,context){reads.push({id,offset,count,context});return (id==='q.weight'?weight:bias).slice(offset,offset+count);}};
 const consumer=createDiagnosticConsumer({registry:r,stage,baseProvider});
 const manifest={modelHash:r.modelHash,graphHash:r.graphHash,registryHash:r.registryHash,side:r.side,scope:'PARTIAL'};
 const context=()=>({...manifest,isCurrent:()=>true});
 const expected=Float32Array.from({length:16},(_,i)=>(i+1)*2+i/2);
 return {r,calls,weight,bias,x,stage,reads,baseProvider,consumer,manifest,context,expected};
}
async function block(weightId,data,offset=0,shape=weightId==='q.weight'?[16,5120]:[16]){return {weightId,offset,count:data.length,shape,dtype:'F32',sha256:await sha(data),data};}
async function packageOf(f,{weight=f.weight,bias=f.bias}={}){const sink=f.consumer.createSink();await sink.begin(f.manifest);await sink.writeBlock(await block('q.weight',weight));await sink.writeBlock(await block('q.bias',bias));return {sink,handle:await sink.finish(f.manifest)};}
async function adopt(f,handle,{expected=f.expected}={}){const c=await f.consumer.prepareLoad(handle,f.context());const receipt=await f.consumer.validate(c,{...f.context(),x:f.x,expected,tolerance:{absolute:0,relative:0}});assert.equal(receipt.valid,true);await f.consumer.commit(c,f.context());return c;}

test('consumer declares PARTIAL runtime binding and owns registry snapshots',()=>{
 const f=fixture(),d=f.consumer.describe();assert.equal(d.scope,'PARTIAL');assert.equal(d.targets[0].fullShape[0],5120);assert.equal(d.targets[0].binding.kind,'runtime-input');assert.equal(d.targets[1].binding.kind,'hike-parameter');
 d.targets[0].shape[0]=1;f.r.targets[0].shape[0]=2;assert.deepEqual(f.consumer.describe().targets[0].shape,[16,5120]);
});
test('invalid original shape, binding kind, identity and full scope reject at construction',()=>{
 for(const mutate of [r=>r.targets[0].binding.kind='initializer',r=>r.targets[0].fullShape=[16,5120],r=>r.targets[0].weightId='other',r=>r.coverage.fullModel=true,r=>r.registryHash='bad']){
  const f=fixture(),r=registry();mutate(r);assert.throws(()=>createDiagnosticConsumer({registry:r,stage:f.stage,baseProvider:f.baseProvider}));
 }
});
test('sink rejects unknown binding, ranges, checksum, duplicate blocks and missing coverage',async()=>{
 const f=fixture(),sink=f.consumer.createSink();await assert.rejects(sink.begin({...f.manifest,graphHash:h('d')}));await sink.begin(f.manifest);
 await assert.rejects(sink.writeBlock(await block('other',new Float32Array(1))));
 await assert.rejects(sink.writeBlock(await block('q.bias',new Float32Array(2),15)));
 await assert.rejects(sink.writeBlock({...await block('q.bias',f.bias),sha256:h('0')}));
 await sink.writeBlock(await block('q.bias',f.bias.subarray(0,8).slice(),0));
 await assert.rejects(sink.writeBlock(await block('q.bias',new Float32Array(1),7)));
 await assert.rejects(sink.finish(f.manifest));
 await sink.abort();await sink.abort();await assert.rejects(sink.finish(f.manifest));
});
test('sink snapshots input before hash await, rejects shared backing, and abort invalidates pending writes',async()=>{
 const f=fixture(),sink=f.consumer.createSink();await sink.begin(f.manifest);
 const data=f.bias.slice(),b=await block('q.bias',data);const writing=sink.writeBlock(b);data.fill(-99);await writing;
 await sink.writeBlock(await block('q.weight',f.weight));const handle=await sink.finish(f.manifest);await adopt(f,handle);
 assert.deepEqual((await f.consumer.run({x:f.x})).output,f.expected);
 const second=f.consumer.createSink();await second.begin(f.manifest);const pending=second.writeBlock(await block('q.bias',f.bias));await second.abort();await assert.rejects(pending,/abort|stale|transaction/i);
 const third=f.consumer.createSink();await third.begin(f.manifest);const shared=new Float32Array(new SharedArrayBuffer(64));await assert.rejects(third.writeBlock({...await block('q.bias',f.bias),data:shared}));await third.abort();
});
test('candidate copies package before release and validates actual supplied stage output',async()=>{
 const f=fixture(),{sink,handle}=await packageOf(f),candidate=await f.consumer.prepareLoad(handle,f.context());await sink.release(handle);await sink.release(handle);
 await assert.rejects(f.consumer.prepareLoad(handle,f.context()));
 const receipt=await f.consumer.validate(candidate,{...f.context(),x:f.x,expected:f.expected,tolerance:{absolute:0,relative:0}});
 assert.equal(receipt.valid,true);assert.equal(receipt.scope,'PARTIAL');assert.equal(receipt.modelInference,false);assert.equal(f.calls.length,1);
 await f.consumer.commit(candidate,f.context());assert.deepEqual((await f.consumer.run({x:f.x})).output,f.expected);
});
test('validation cannot use wrong expected output, missing independent reference or noncurrent binding',async()=>{
 const f=fixture(),{handle}=await packageOf(f),candidate=await f.consumer.prepareLoad(handle,f.context());
 await assert.rejects(f.consumer.commit(candidate,f.context()),/validat/i);
 await assert.rejects(f.consumer.validate(candidate,{...f.context(),x:f.x,tolerance:{absolute:0,relative:0}}));
 const receipt=await f.consumer.validate(candidate,{...f.context(),x:f.x,expected:new Float32Array(16),tolerance:{absolute:0,relative:0}});assert.equal(receipt.valid,false);
 await assert.rejects(f.consumer.commit(candidate,f.context()),/validat/i);
 await assert.rejects(f.consumer.validate(candidate,{...f.context(),modelHash:h('d'),x:f.x,expected:f.expected,tolerance:{absolute:0,relative:0}}));
 await assert.rejects(f.consumer.validate(candidate,{...f.context(),isCurrent:()=>false,x:f.x,expected:f.expected,tolerance:{absolute:0,relative:0}}));
});
test('current check immediately before commit and stale rollback cannot overwrite a newer active feed',async()=>{
 const f=fixture(),first=await packageOf(f),a=await adopt(f,first.handle);
 const changed=f.weight.slice();changed[0]+=3;const expected=f.expected.slice();expected[0]+=6;
 const second=await packageOf(f,{weight:changed}),b=await f.consumer.prepareLoad(second.handle,f.context());await f.consumer.validate(b,{...f.context(),x:f.x,expected,tolerance:{absolute:0,relative:0}});
 await assert.rejects(f.consumer.commit(b,{...f.context(),isCurrent:()=>false}));assert.deepEqual((await f.consumer.run({x:f.x})).output,f.expected);
 await f.consumer.commit(b,f.context());await f.consumer.rollback(a,{...f.context(),isCurrent:()=>false});assert.deepEqual((await f.consumer.run({x:f.x})).output,expected);
 await f.consumer.rollback(b,f.context());assert.deepEqual((await f.consumer.run({x:f.x})).output,f.expected);
});
test('aborted stage validation settles without a usable receipt or active candidate',async()=>{
 const f=fixture(),{handle}=await packageOf(f),candidate=await f.consumer.prepareLoad(handle,f.context()),controller=new AbortController();
 const waiting=f.consumer.validate(candidate,{...f.context(),signal:controller.signal,x:f.x,expected:f.expected,tolerance:{absolute:0,relative:0}});controller.abort();await assert.rejects(waiting,{name:'AbortError'});await assert.rejects(f.consumer.commit(candidate,f.context()));await f.consumer.rollback(candidate,f.context());
});
test('base restore rereads immutable provider with binding and releases only consumer resources',async()=>{
 const f=fixture();await assert.rejects(f.consumer.run({x:f.x}));const candidate=await f.consumer.prepareBase(f.context());assert.deepEqual(f.reads.map(r=>[r.id,r.offset,r.count]),[['q.weight',0,81920],['q.bias',0,16]]);
 for(const read of f.reads){assert.equal(read.context.modelHash,f.r.modelHash);assert.equal(read.context.registryHash,f.r.registryHash);}
 await f.consumer.validate(candidate,{...f.context(),x:f.x,expected:f.expected,tolerance:{absolute:0,relative:0}});await f.consumer.commit(candidate,f.context());f.weight.fill(0);f.bias.fill(0);assert.deepEqual((await f.consumer.run({x:f.x})).output,f.expected);
 await f.consumer.dispose();await f.consumer.dispose();await assert.rejects(f.consumer.run({x:f.x}));assert.throws(()=>f.consumer.describe());
});
test('wrong executed graph and foreign package cannot establish a validation receipt',async()=>{
 const f=fixture(),{sink,handle}=await packageOf(f),other=fixture();await assert.rejects(other.consumer.prepareLoad(handle,other.context()));await assert.rejects(other.consumer.createSink().release(handle));
 const candidate=await f.consumer.prepareLoad(handle,f.context()),original=f.stage.runF32;f.stage.runF32=async input=>{const r=await original(input);r.evidence.graphSHA256=h('d');return r;};
 await assert.rejects(f.consumer.validate(candidate,{...f.context(),x:f.x,expected:f.expected,tolerance:{absolute:0,relative:0}}),/graph/i);await assert.rejects(f.consumer.commit(candidate,f.context()));await sink.release(handle);
});
test('dispose waits for bounded stage completion, rejects its result and never disposes caller stage',async()=>{
 const f=fixture(),{handle}=await packageOf(f),candidate=await f.consumer.prepareLoad(handle,f.context());let release;const original=f.stage.runF32;f.stage.runF32=async input=>{await new Promise(resolve=>{release=resolve;});return original(input);};
 const validation=f.consumer.validate(candidate,{...f.context(),x:f.x,expected:f.expected,tolerance:{absolute:0,relative:0}});let disposed=false;const disposal=f.consumer.dispose().then(()=>{disposed=true;});await Promise.resolve();assert.equal(disposed,false);release();await assert.rejects(validation,/disposed/i);await disposal;assert.equal(disposed,true);
});
test('dispose terminates pending sink hashes before its completion barrier',async()=>{
 const f=fixture(),sink=f.consumer.createSink();await sink.begin(f.manifest);const writing=sink.writeBlock(await block('q.weight',f.weight));let ended=false;const writeDone=writing.catch(()=>{}).finally(()=>{ended=true;});await f.consumer.dispose();assert.equal(ended,true);await writeDone;await assert.rejects(sink.finish(f.manifest));
});
test('caller-owned stage cannot mutate validated feed bytes retained after its run',async()=>{
 const f=fixture(),{handle}=await packageOf(f),candidate=await f.consumer.prepareLoad(handle,f.context());await f.consumer.validate(candidate,{...f.context(),x:f.x,expected:f.expected,tolerance:{absolute:0,relative:0}});
 f.calls[0].weight.fill(0);f.calls[0].bias.fill(0);await f.consumer.commit(candidate,f.context());assert.deepEqual((await f.consumer.run({x:f.x})).output,f.expected);
});
test('releaseCandidate drops rollback history without releasing active independent feed',async()=>{
 const f=fixture(),{handle}=await packageOf(f),candidate=await adopt(f,handle);await f.consumer.releaseCandidate(candidate);await f.consumer.releaseCandidate(candidate);assert.deepEqual((await f.consumer.run({x:f.x})).output,f.expected);
 await assert.rejects(f.consumer.commit(candidate,f.context()));await f.consumer.rollback(candidate,f.context());assert.deepEqual((await f.consumer.run({x:f.x})).output,f.expected);
 const b=await f.consumer.prepareBase(f.context());let release;const original=f.stage.runF32;f.stage.runF32=async input=>{await new Promise(resolve=>{release=resolve;});return original(input);};const validating=f.consumer.validate(b,{...f.context(),x:f.x,expected:f.expected,tolerance:{absolute:0,relative:0}});await assert.rejects(f.consumer.releaseCandidate(b),/busy|running/i);release();await validating;await f.consumer.releaseCandidate(b);
});
test('stage output and evidence are snapshotted before the validation continuation',async()=>{
 const f=fixture(),{handle}=await packageOf(f),candidate=await f.consumer.prepareLoad(handle,f.context()),original=f.stage.runF32;
 f.stage.runF32=async input=>{const result=await original(input);queueMicrotask(()=>queueMicrotask(()=>{result.output.fill(NaN);result.evidence.graphSHA256=h('d');}));return result;};
 const receipt=await f.consumer.validate(candidate,{...f.context(),x:f.x,expected:f.expected,tolerance:{absolute:0,relative:0}});assert.equal(receipt.valid,true);assert.equal(receipt.maxAbsoluteError,0);assert.equal(receipt.evidence.graphSHA256,f.r.graphHash);
 await f.consumer.commit(candidate,f.context());assert.deepEqual((await f.consumer.run({x:f.x})).output,f.expected);
});
test('cancelled committed candidate can roll back its own active feed without reviving a stale application',async()=>{
 const f=fixture(),first=await packageOf(f);await adopt(f,first.handle);const weight=f.weight.slice();weight[0]+=3;const expected=f.expected.slice();expected[0]+=6;const second=await packageOf(f,{weight}),candidate=await adopt(f,second.handle,{expected});
 const controller=new AbortController(),context={...f.context(),signal:controller.signal};controller.abort();const rolled=await f.consumer.rollback(candidate,context);assert.equal(rolled.restored,true);assert.deepEqual((await f.consumer.run({x:f.x})).output,f.expected);
});
test('rollback does not release candidate buffers while validation is still using them',async()=>{
 const f=fixture(),{handle}=await packageOf(f),candidate=await f.consumer.prepareLoad(handle,f.context());let release;const original=f.stage.runF32;f.stage.runF32=async input=>{await new Promise(resolve=>{release=resolve;});return original(input);};
 const validation=f.consumer.validate(candidate,{...f.context(),x:f.x,expected:f.expected,tolerance:{absolute:0,relative:0}});let error;try{await f.consumer.rollback(candidate,f.context());}catch(e){error=e;}release();const result=await validation.catch(e=>e);assert.match(error?.message??'',/busy|running/i);assert.equal(result.valid,true);await f.consumer.rollback(candidate,f.context());
});
test('registry digest binds original slice, FP8 profile and complete metadata before consumer acceptance',()=>{
 for(const mutate of [r=>{for(const target of r.targets)target.transform.rowStart=16;},r=>{r.fp8ProfileId='unapproved-profile';},r=>{r.targets[0].source={scale:{value:0.5}};},r=>r.targets.reverse()]){
  const f=fixture(),r=registry();mutate(r);assert.throws(()=>createDiagnosticConsumer({registry:r,stage:f.stage,baseProvider:f.baseProvider}),error=>error.code==='REGISTRY_INTEGRITY_ERROR');
 }
});
test('sink rejects sparse shape dimensions while preserving valid dense shapes',async()=>{
 const f=fixture(),sink=f.consumer.createSink();await sink.begin(f.manifest);
 await assert.rejects(sink.writeBlock(await block('q.weight',f.weight,0,new Array(2))),/shape|binding/i);
 const partial=[16,5120];delete partial[0];await assert.rejects(sink.writeBlock(await block('q.weight',f.weight,0,partial)),/shape|binding/i);
 await sink.writeBlock(await block('q.weight',f.weight));await sink.writeBlock(await block('q.bias',f.bias));const handle=await sink.finish(f.manifest);await adopt(f,handle);assert.deepEqual((await f.consumer.run({x:f.x})).output,f.expected);
});

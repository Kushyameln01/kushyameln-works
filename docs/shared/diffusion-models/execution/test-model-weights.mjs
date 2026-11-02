import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BERNINI_TARGETS,TARGET_PROVENANCE} from '../lora/targets.mjs';
import {createModelWeightSource,createCompletedModelWeightSource,MODEL_WEIGHT_SCHEMA,MODEL_WEIGHT_LIMITS} from './model-weights.mjs';

const encoder=new TextEncoder(),quant=encoder.encode('{"format": "float8_e4m3fn"}');
const kernel=()=>readFile(new URL('../ort-bridge/kernel/bridge.wasm',import.meta.url));
const lookupKernel=()=>readFile(new URL('./model-decode/model-decode.wasm',import.meta.url));
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
// Reconstruct the exact retained headers from their independently retained
// target inventory and observed serialization. No model file is needed, and
// every claimed header is checked against the pinned retained header digest.
function fixture(side='LOW'){
 const fp8=key=>/^blocks\.\d+\.(self_attn\.[qkvo]|cross_attn\.[qkv]|ffn\.[02])\.weight$/.test(key);
 const targets=BERNINI_TARGETS.map(target=>({name:target.key,shape:[...target.shape],dtype:fp8(target.key)?'F8_E4M3':'F16'})),compressed=targets.filter(target=>target.dtype==='F8_E4M3');
 const tensors=[...compressed.map(target=>({name:target.name.slice(0,-7)+'.weight_scale',shape:[],dtype:'F32'})),...targets.filter(target=>target.dtype==='F16'),...compressed,...compressed.map(target=>({name:target.name.slice(0,-7)+'.comfy_quant',shape:[27],dtype:'U8'}))];
 const dtypeOrder=['F32','F16','F8_E4M3','U8'];tensors.sort((a,b)=>dtypeOrder.indexOf(a.dtype)-dtypeOrder.indexOf(b.dtype)||(a.name<b.name?-1:a.name>b.name?1:0));
 const header={__metadata__:side==='LOW'?{format:'pt',model_type:'bernini_low'}:{model_type:'bernini_high',format:'pt'}};let cursor=0;
 for(const tensor of tensors){const bytes=tensor.shape.reduce((a,b)=>a*b,1)*({F32:4,F16:2,F8_E4M3:1,U8:1}[tensor.dtype]);header[tensor.name]={dtype:tensor.dtype,shape:tensor.shape,data_offsets:[cursor,cursor+bytes]};tensor.offset=cursor;tensor.bytes=bytes;cursor+=bytes;}
 const json=encoder.encode(JSON.stringify(header)),headerBytes=new Uint8Array(Math.ceil(json.length/8)*8);headerBytes.fill(32);headerBytes.set(json);
 const prefix=new Uint8Array(8);new DataView(prefix.buffer).setBigUint64(0,BigInt(headerBytes.length),true);const payload=8+headerBytes.length,size=payload+cursor,reads=[],patches=[];
 let fullCalls=0,hold=null;
 const fill=(out,start,segment,bytes)=>{const from=Math.max(start,segment),to=Math.min(start+out.length,segment+bytes.length);if(to>from)out.set(bytes.subarray(from-segment,to-segment),from-start);};
 class SparseOriginal extends Blob{
  get size(){return size;}
  async arrayBuffer(){fullCalls++;throw Error('Whole model allocation forbidden');}
  slice(start,end){
   return {async arrayBuffer(){
    reads.push([start,end]);if(hold&&start>=payload&&hold.predicate(start,end)){const wait=hold;hold=null;await new Promise(resolve=>{wait.release=resolve;});}
    const out=new Uint8Array(end-start);fill(out,start,0,prefix);fill(out,start,8,headerBytes);
    if(start>=payload){
     const descriptor=tensors.find(tensor=>start>=payload+tensor.offset&&start<payload+tensor.offset+tensor.bytes);assert.ok(descriptor,'Every fixture read belongs to an actual descriptor');
     if(descriptor.dtype==='F32'){const scalar=new Uint8Array(4);new DataView(scalar.buffer).setFloat32(0,.5,true);fill(out,start,payload+descriptor.offset,scalar);}
     else if(descriptor.dtype==='U8')fill(out,start,payload+descriptor.offset,quant);
     else if(descriptor.dtype==='F8_E4M3')out.fill(0x38);
     else for(let i=0;i<out.length;i++)out[i]=(start-payload-descriptor.offset+i)%2?0x3c:0;
    }
    for(const [offset,bytes]of patches)fill(out,start,offset,bytes);return out.buffer;
   }};
  }
 }
 return {file:new SparseOriginal(),headerBytes,header,payload,tensors,reads,patches,get fullCalls(){return fullCalls;},hold(predicate){hold={predicate,release:null};return hold;}};
}
async function sourceOf(side='LOW',options={}){const fixtureValue=fixture(side),source=await createModelWeightSource({file:fixtureValue.file,side,bridgeBytes:await kernel(),...options});return {fixture:fixtureValue,source};}

test('lookup source preserves the numeric profile, target bindings and exact legacy F32 bits',async()=>{
 const {source:legacy}=await sourceOf(),{source:lookup}=await sourceOf('LOW',{decoder:'lookup',lookupBytes:await lookupKernel()});
 try{
  assert.equal(legacy.describe().decoder.selection,'legacy');assert.equal(lookup.describe().decoder.selection,'lookup');assert.equal(lookup.describe().executionProfileId,legacy.describe().executionProfileId);assert.equal(lookup.describe().decoder.numericProfileId,legacy.describe().decoder.numericProfileId);
  assert.equal(lookup.stats().decoder.fp8Tables,360);assert.equal(lookup.stats().decoder.hostTableBytes,360*1024);assert.equal(lookup.stats().hike.calls,361);
  for(const [method,key,start,count]of [['readRows','blocks.39.self_attn.q.weight',0,16],['readRows','blocks.39.ffn.2.weight',0,5],['readRows','head.head.weight',0,16],['readRows','patch_embedding.weight',0,16],['readVector','head.modulation',0,10240]]){
   const expected=await legacy[method](key,start,count),actual=await lookup[method](key,start,count);assert.deepEqual(new Uint32Array(actual.values.buffer),new Uint32Array(expected.values.buffer));assert.deepEqual(actual.source,expected.source);assert.equal(Object.hasOwn(actual.source,'decodedF32SHA256'),false);
  }
  assert.equal(lookup.stats().hike.calls,361);assert.equal(lookup.stats().decoder.calls,5);assert.ok(lookup.stats().maxPayloadReadBytes<=163840);
 }finally{lookup.dispose();legacy.dispose();}
 assert.equal(lookup.stats().decoder,null);assert.equal(lookup.stats().hike,null);
});

test('portable sparse fixtures match both independently pinned actual header identities',async()=>{
 for(const side of ['LOW','HIGH']){const f=fixture(side),pinned=TARGET_PROVENANCE.models.find(model=>model.name.includes(side));assert.equal(f.file.size,pinned.fileBytes);assert.equal(await sha(f.headerBytes),pinned.headerSHA256);assert.equal(f.headerBytes.length,181280);assert.equal(f.fullCalls,0);}
});

test('registry contains all 40 blocks, prefix, head and only actual model parameters',async()=>{
 for(const side of ['LOW','HIGH']){
  const {source,fixture:f}=await sourceOf(side);
  try{
   const description=source.describe();assert.equal(description.schemaVersion,MODEL_WEIGHT_SCHEMA);assert.equal(description.side,side);assert.equal(description.targetCount,1095);assert.equal(description.coverage.fullModelTargets,true);
   assert.deepEqual(Object.keys(description.entries).sort(),BERNINI_TARGETS.map(target=>target.key).sort());
   for(const target of BERNINI_TARGETS){const entry=description.entries[target.key];assert.deepEqual(entry.fullShape,target.shape);assert.equal(entry.originalKey,target.key);assert.equal(entry.computeDtype,'F32');assert.equal(entry.binding.name,target.key);assert.equal(entry.operatorBinding.programSlot,target.key);assert.ok(entry.byteLength>0);}
   for(let block=0;block<40;block++){
    assert.ok(description.entries[`blocks.${block}.self_attn.o.weight`]);assert.ok(description.entries[`blocks.${block}.cross_attn.norm_q.weight`]);assert.ok(description.entries[`blocks.${block}.ffn.2.weight`]);assert.ok(description.entries[`blocks.${block}.modulation`]);
    assert.equal(Object.hasOwn(description.entries,`blocks.${block}.norm1.weight`),false);assert.equal(Object.hasOwn(description.entries,`blocks.${block}.norm2.weight`),false);
   }
   assert.equal(description.parameterFreeNormalization.length,81);assert.deepEqual(description.entries['head.head.weight'].fullShape,[64,5120]);assert.deepEqual(description.entries['head.modulation'].fullShape,[1,2,5120]);
   const patch=description.entries['patch_embedding.weight'];assert.deepEqual(patch.fullShape,[5120,16,1,2,2]);assert.equal(patch.columns,64);assert.deepEqual(patch.transform.linearShape,[5120,64]);
   assert.equal(Object.hasOwn(description.entries,'blocks.39.self_attn.q.weight_scale'),false);assert.equal(Object.hasOwn(description.entries,'blocks.39.self_attn.q.comfy_quant'),false);
   const fp8=description.entries['blocks.39.self_attn.q.weight'];assert.equal(fp8.fp8ProfileId,'scaled-e4m3fn-scalar-f32-v1');assert.equal(fp8.scale,.5);assert.equal(fp8.scaleSource.originalKey,'blocks.39.self_attn.q.weight_scale');assert.equal(fp8.quantConfigSource.originalKey,'blocks.39.self_attn.q.comfy_quant');
   assert.equal(description.entries['blocks.39.cross_attn.o.weight'].storageDtype,'F16');assert.equal(description.entries['blocks.39.cross_attn.o.weight'].fp8ProfileId,null);
   assert.equal(source.stats().configReads,720);assert.equal(source.stats().configReadBytes,11160);assert.equal(source.stats().payloadReads,0);assert.equal(f.fullCalls,0);
   description.entries['head.head.weight'].fullShape[0]=999;assert.equal(source.describe().entries['head.head.weight'].fullShape[0],64);
  }finally{source.dispose();}
 }
});

test('bounded all-block and prefix/head reads decode using Hike to independent owned F32',async()=>{
 const {source,fixture:f}=await sourceOf();
 try{
  for(const [key,row,count,expected]of [['blocks.0.self_attn.q.weight',0,16,.5],['blocks.17.cross_attn.o.weight',5119,1,1],['blocks.39.ffn.2.weight',5119,1,.5],['patch_embedding.weight',5000,16,1],['time_embedding.0.weight',0,16,1],['time_projection.1.weight',30719,1,1],['head.head.weight',63,1,1]]){
   const result=await source.readRows(key,row,count);assert.equal(result.values.every(value=>value===expected),true);assert.equal(result.values.byteOffset,0);assert.equal(result.values.byteLength,result.values.buffer.byteLength);assert.equal(Object.hasOwn(result.source,'rawSHA256'),false);assert.equal(Object.hasOwn(result.source,'decodedF32SHA256'),false);
   assert.ok(result.raw.byteLength<=MODEL_WEIGHT_LIMITS.maxPayloadReadBytes);assert.equal(result.source.elementOffset,row*result.shape[1]);assert.equal(result.source.selectedElementCount,result.values.length);
   result.values[0]=77;assert.equal((await source.readRows(key,row,1)).values[0],expected);
  }
  for(const [key,start,count]of [['blocks.39.modulation',0,30720],['blocks.39.norm3.weight',5119,1],['head.modulation',0,10240],['head.head.bias',63,1],['time_projection.1.bias',0,30720]]){const result=await source.readVector(key,start,count);assert.equal(result.values.every(value=>value===1),true);}
  assert.deepEqual([...source.addBias(new Float32Array([1,2,3,4]),new Float32Array([.5,-.5]),2,2)],[1.5,1.5,3.5,3.5]);
  assert.ok(source.stats().maxPayloadReadBytes<=163840);assert.ok(source.stats().hike.calls>0);assert.equal(f.fullCalls,0);
 }finally{source.dispose();}
 assert.equal(source.stats().disposed,true);assert.equal(source.stats().hike,null);await assert.rejects(source.readVector('head.head.bias',0,1),/disposed/);
});

test('ranges, binding kind and selected decode limits reject before storage reads',async()=>{
 const {source}=await sourceOf();
 try{
  const before=source.stats().payloadReads;
  for(const [method,key,start,count]of [['readRows','blocks.40.self_attn.q.weight',0,1],['readRows','blocks.39.self_attn.q.weight',5119,2],['readRows','blocks.39.self_attn.q.weight',0,17],['readRows','blocks.39.ffn.2.weight',0,6],['readVector','head.modulation',10240,1],['readVector','head.head.weight',0,1],['readRows','head.head.bias',0,1],['readVector','blocks.39.self_attn.q.weight_scale',0,1],['readRows','head.head.weight',NaN,1]])await assert.rejects(source[method](key,start,count),/range|key|binding/i);
  await assert.rejects(source.readRows('head.head.weight',0,1,{diagnostics:'false'}),/boolean/);assert.equal(source.stats().payloadReads,before);
  const controller=new AbortController();controller.abort();await assert.rejects(source.readRows('head.head.weight',0,1,{signal:controller.signal}),{name:'AbortError'});assert.equal(source.stats().payloadReads,before);
 }finally{source.dispose();}
});

test('header/size and own FP8 profile gate identity, without sampling or hashing model payload',async()=>{
 const low=fixture();await assert.rejects(createModelWeightSource({file:low.file,side:'HIGH',bridgeBytes:await kernel()}),/side|header|size/);
 assert.equal(low.reads.length,2);assert.equal(low.fullCalls,0);
 for(const [key,bytes]of [['blocks.39.self_attn.q.weight_scale',new Uint8Array([0,0,0,0])],['blocks.39.self_attn.q.comfy_quant',encoder.encode('{"format": "float8_e5m2__"}')]]){
  const f=fixture(),descriptor=f.header[key];f.patches.push([f.payload+descriptor.data_offsets[0],bytes]);await assert.rejects(createModelWeightSource({file:f.file,side:'LOW',bridgeBytes:await kernel()}),/FP8.*profile/);assert.equal(f.fullCalls,0);
 }
 const f=fixture(),bytes=await kernel();bytes[0]^=1;await assert.rejects(createModelWeightSource({file:f.file,side:'LOW',bridgeBytes:bytes}),/hash/);
 await assert.rejects(createModelWeightSource({file:fixture().file,side:'UNKNOWN',bridgeBytes:await kernel()}),/HIGH\/LOW/);
});

test('normal reads hash no payload; explicit diagnostics snapshot the policy and hash only selected ranges',async()=>{
 const {source,fixture:f}=await sourceOf(),digestOriginal=crypto.subtle.digest;let hashes=0;
 try{
  crypto.subtle.digest=function(...args){hashes++;return digestOriginal.call(this,...args);};
  const options={diagnostics:false},pending=source.readRows('blocks.39.self_attn.q.weight',0,1,options);options.diagnostics=true;await pending;assert.equal(hashes,0);
  const detailed=await source.readVector('head.head.bias',0,2,{diagnostics:true});assert.equal(hashes,2);assert.match(detailed.source.rawSHA256,/^[a-f0-9]{64}$/);assert.match(detailed.source.decodedF32SHA256,/^[a-f0-9]{64}$/);assert.equal(f.fullCalls,0);
 }finally{crypto.subtle.digest=digestOriginal;source.dispose();}
});

test('abort after a pending storage read returns no result and releases busy ownership',async()=>{
 const {source,fixture:f}=await sourceOf(),controller=new AbortController(),hold=f.hold(()=>true);
 try{
  const pending=source.readRows('head.head.weight',0,1,{signal:controller.signal});await Promise.resolve();assert.equal(source.stats().busy,true);await assert.rejects(source.readVector('head.head.bias',0,1),/busy/);assert.throws(()=>source.dispose(),/Await/);
  controller.abort();hold.release();await assert.rejects(pending,{name:'AbortError'});assert.equal(source.stats().busy,false);assert.equal((await source.readVector('head.head.bias',0,1)).values[0],1);
 }finally{source.dispose();}
});

test('completed-F32 port uses full original coordinates and copies every returned buffer',async()=>{
 const {source}=await sourceOf(),calls=[];let completionValues;
 const completed=createCompletedModelWeightSource({source,completedProvider:{async readBlock(input){calls.push(input);input.baseValues.fill(91);if(input.originalKey==='head.head.weight'){completionValues=new Float32Array(input.count).fill(7);return completionValues;}return null;}}});
 try{
  const result=await completed.readRows('head.head.weight',63,1),call=calls[0];assert.equal(call.offset,63*5120);assert.equal(call.count,5120);assert.deepEqual(call.fullShape,[64,5120]);assert.equal(call.binding.name,'head.head.weight');assert.equal(call.dtype,'F32');assert.equal(result.values[0],7);assert.equal(result.source.completedWeight.kind,'completed-final-f32');assert.equal(Object.hasOwn(result.source,'decodedF32SHA256'),false);
  completionValues.fill(99);assert.equal(result.values[0],7);assert.equal((await source.readRows('head.head.weight',63,1)).values[0],1);
  const base=await completed.readVector('blocks.39.modulation',5120,5120);assert.equal(base.values[0],1);assert.equal(base.source.completedWeight.kind,'immutable-base-pass-through');assert.equal(calls[1].offset,5120);assert.equal(completed.stats().completedF32Bytes,20480);assert.equal(completed.stats().basePassThroughReads,1);
 }finally{completed.dispose();source.dispose();}
});

test('completed-F32 port rejects shared, noncompact, forged and nonfinite buffers',async()=>{
 const {source}=await sourceOf();let supplied;
 const completed=createCompletedModelWeightSource({source,completedProvider:{readBlock(){return supplied;}}});
 try{
  const fakeBuffer=new ArrayBuffer(256);class Forged extends Float32Array{get length(){return 64;}get byteLength(){return 256;}get byteOffset(){return 0;}get buffer(){return fakeBuffer;}}
  for(const value of [new Float32Array(63),new Float32Array(65).subarray(1),new Float32Array(64).fill(NaN),new Float32Array(new SharedArrayBuffer(256)),new Forged(1)]){supplied=value;await assert.rejects(completed.readVector('head.head.bias',0,64),/F32/);assert.equal(completed.stats().busy,false);}
  supplied=new Float32Array(64).fill(2);assert.equal((await completed.readVector('head.head.bias',0,64)).values[0],2);
 }finally{completed.dispose();source.dispose();}
});

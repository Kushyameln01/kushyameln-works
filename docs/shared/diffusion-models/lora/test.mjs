import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {linearFixture,packSafetensors,tensor,scalarBytes} from './fixtures.mjs';
assert.ok(fs.existsSync(new URL('./weights.mjs',import.meta.url)),'LoRA weight IO core is not implemented');
const {inspectLoraFile,loadLoraFile,readLoraTensor,readLoraBytes,validateLoraBinding,LORA_LIMITS,BASE_MODEL_HASHES}=await import('./weights.mjs');
const {inspectSafetensors}=await import('../api/safetensors.mjs');
const options={stage:'HIGH',strength:3,baseModelSha256:BASE_MODEL_HASHES.HIGH};
const codes=[];
const run=async(name,fn)=>{await fn();codes.push({name,status:'PASS'});};
const code=expected=>e=>e?.code===expected;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
await run('three storage dtypes, two dialects and missing alpha retain exact descriptors',async()=>{
 for(const dtype of ['F16','BF16','F32'])for(const dialect of ['downUp','AB']){
  const m=await inspectLoraFile(linearFixture({dtype,dialect}));
  assert.equal(m.pairs.length,1);assert.equal(m.pairs[0].rank,1);
  assert.equal(m.pairs[0].alphaPresent,false);assert.equal(m.pairs[0].alpha,null);assert.equal(m.pairs[0].alphaRankMultiplier,1);
  assert.equal(m.linearTargetCount,406);assert.equal(m.fullFileSHA256,null);assert.equal(m.applied,false);assert.equal(m.payloadValidation,'ON_READ');
 }
});
await run('zero and negative scalar alpha are distinct from absence',async()=>{
 for(const dtype of ['F16','BF16','F32'])for(const alpha of [0,-2,1.5]){
  const m=await inspectLoraFile(linearFixture({rank:2,dtype,alpha}));
  assert.equal(m.pairs[0].alphaPresent,true);assert.equal(m.pairs[0].alpha,alpha);assert.equal(m.pairs[0].alphaRankMultiplier,alpha/2);
 }
});
await run('exact underscore aliases work while duplicate aliases and mixed dialects fail',async()=>{
 const alias='lora_unet_blocks_0_self_attn_q';assert.equal((await inspectLoraFile(linearFixture({alias}))).pairs[0].target,'diffusion_model.blocks.0.self_attn.q.weight');
 const a='diffusion_model.blocks.0.self_attn.q';
 const extras=[tensor(alias+'.lora_down.weight','F32',[1,5120]),tensor(alias+'.lora_up.weight','F32',[5120,1])];
 await assert.rejects(inspectLoraFile(linearFixture({extra:extras})),code('INVALID_LORA'));
 await assert.rejects(inspectLoraFile(packSafetensors([tensor(a+'.lora_A.weight','F32',[1,5120]),tensor(a+'.lora_up.weight','F32',[5120,1])])),code('INVALID_LORA'));
});
await run('unknown targets, unsupported tensor types and incomplete/rank-invalid pairs are rejected',async()=>{
 await assert.rejects(inspectLoraFile(linearFixture({alias:'diffusion_model.guessed.target'})),code('UNSUPPORTED_LORA'));
 await assert.rejects(inspectLoraFile(linearFixture({extra:[tensor('diffusion_model.blocks.0.self_attn.q.dora_scale','F32',[5120])]})),code('UNSUPPORTED_LORA'));
 await assert.rejects(inspectLoraFile(linearFixture({out:16})),code('INVALID_LORA'));
 await assert.rejects(inspectLoraFile(packSafetensors([tensor('diffusion_model.blocks.0.self_attn.q.lora_down.weight','F32',[1,5120])])),code('INVALID_LORA'));
 await assert.rejects(inspectLoraFile(linearFixture({extra:[tensor('orphan.alpha','F32',[])]})),code('UNSUPPORTED_LORA'));
});
await run('strict LoRA JSON rejects duplicate escaped keys and depth while generic inspect default is unchanged',async()=>{
 const raw='{"x":{"dtype":"F32","shape":[1],"data_offsets":[0,4]},"x":{"dtype":"F32","shape":[1],"data_offsets":[0,4]}}';
 const duplicate=packSafetensors([tensor('x','F32',[1])],{rawHeader:raw});
 assert.equal((await inspectSafetensors(duplicate)).tensorCount,1);
 await assert.rejects(inspectLoraFile(duplicate),code('INVALID_LORA'));
 const escaped=packSafetensors([tensor('x','F32',[1])],{rawHeader:raw.replace('"x":','"\\u0078":')});
 await assert.rejects(inspectLoraFile(escaped),code('INVALID_LORA'));
 const deep=packSafetensors([],{rawHeader:'{"__metadata__":{"x":'+ '['.repeat(33)+'0'+']'.repeat(33)+'}}'});
 await assert.rejects(inspectLoraFile(deep),code('INVALID_LORA'));
 const nested=packSafetensors([],{rawHeader:'{"__metadata__":{"x":"a","x":"b"}}'});
 await assert.rejects(inspectLoraFile(nested),code('INVALID_LORA'));
});
await run('additive diff and diff_b retain exact native shapes and conflict with factor patches',async()=>{
 const a='diffusion_model.head.head';
 const f=packSafetensors([tensor(a+'.diff','F16',[64,5120]),tensor(a+'.diff_b','BF16',[64]),tensor('diffusion_model.blocks.0.modulation.diff','F32',[1,6,5120])]);
 const m=await inspectLoraFile(f);assert.equal(m.pairs.length,0);assert.equal(m.deltas.length,3);
 assert.ok(m.deltas.some(d=>d.target==='diffusion_model.blocks.0.modulation'));
 await assert.rejects(inspectLoraFile(linearFixture({alias:a,out:64,extra:[tensor(a+'.diff','F16',[64,5120])]})),code('INVALID_LORA'));
});
await run('binding validates explicit stage/base/strength and snapshots options before awaits',async()=>{
 for(const bad of [{...options,stage:'high'},{...options,stage:{toString:()=> 'HIGH'}},{...options,baseModelSha256:BASE_MODEL_HASHES.LOW},{...options,strength:'3'},{...options,strength:NaN}])assert.throws(()=>validateLoraBinding(bad),code('INVALID_LORA_BINDING'));
 for(const strength of [0,-1.25])assert.equal(validateLoraBinding({...options,strength}).strength,strength);
 const opts={...options},pending=loadLoraFile(linearFixture(),opts);opts.stage='LOW';opts.strength=9;opts.baseModelSha256=BASE_MODEL_HASHES.LOW;
 const m=await pending;assert.equal(m.stage,'HIGH');assert.equal(m.strength,3);assert.equal(m.baseModelSha256,BASE_MODEL_HASHES.HIGH);
});
await run('whole-source hash is streaming, exact and expected-hash mismatch rejects',async()=>{
 const file=linearFixture({alias:'diffusion_model.time_projection.1',out:30720,rank:8});
 const reads=[];let wholeCalls=0;
 class Tracked extends Blob{async arrayBuffer(){wholeCalls++;throw Error('whole arrayBuffer forbidden');}slice(a,b,t){reads.push([a,b]);return super.slice(a,b,t);}}
 const tracked=new Tracked([file]);const expected=hash(new Uint8Array(await file.arrayBuffer()));
 const m=await loadLoraFile(tracked,{...options,expectedFileSHA256:expected.toUpperCase()});
 assert.equal(m.fullFileSHA256,expected);assert.equal(wholeCalls,0);assert.ok(reads.filter(([a,b])=>b-a===1048576).length>=1);assert.ok(reads.every(([a,b])=>b-a<=1048576));
 await assert.rejects(loadLoraFile(file,{...options,expectedFileSHA256:'0'.repeat(64)}),code('LORA_HASH_MISMATCH'));
});
await run('tensor reads preserve stored bytes, provenance and ownership with safe range arithmetic',async()=>{
 for(const dtype of ['F16','BF16','F32']){
  const file=linearFixture({dtype}),m=await loadLoraFile(file,options),name=m.pairs[0].downTensor;
  const read=await readLoraTensor(file,m,{tensorName:name,elementOffset:2,elementCount:3});
  assert.equal(read.dtype,dtype);assert.equal(read.byteOrder,'little-endian');assert.equal(read.elementCount,3);
  assert.equal(read.rangeSHA256,hash(read.data));assert.equal(read.fullFileSHA256,m.fullFileSHA256);assert.deepEqual(read.shape,[1,5120]);
  const expected=new Uint8Array(read.byteLength);for(let n=0;n<3;n++)expected.set(scalarBytes(dtype,1),n*scalarBytes(dtype,1).length);
  assert.deepEqual(read.data,expected);read.data.fill(99);
  const again=await readLoraTensor(file,m,{tensorName:name,elementOffset:2,elementCount:3});assert.deepEqual(again.data,expected);
  await assert.rejects(readLoraTensor(file,m,{tensorName:name,elementOffset:5120,elementCount:1}),code('INVALID_LORA'));
 }
});
await run('finite bit validation rejects F16/BF16/F32 NaN and infinity only when tensor ranges are read',async()=>{
 for(const [dtype,bits]of [['F16',0x7c00],['BF16',0x7f80],['F32',0x7f800000]]){
  for(const nan of [0,1]){
   const a=tensor('diffusion_model.head.head.lora_down.weight',dtype,[1,5120]);const view=new DataView(a.data.buffer);dtype==='F32'?view.setUint32(0,bits+nan,true):view.setUint16(0,bits+nan,true);
   const file=packSafetensors([a,tensor('diffusion_model.head.head.lora_up.weight',dtype,[64,1])]);const m=await loadLoraFile(file,options);
   await assert.rejects(readLoraTensor(file,m,{tensorName:a.name,elementOffset:0,elementCount:1}),code('INVALID_LORA'));
   const source=await readLoraBytes(file,m,{byteOffset:0,byteLength:8});assert.equal(source.payloadValidation,'NOT_PERFORMED_RAW_SOURCE_READ');
  }
 }
});
await run('read requests and binding descriptors cannot be changed during asynchronous inspection',async()=>{
 const file=linearFixture(),m=await loadLoraFile(file,options),binding=structuredClone(m),request={tensorName:m.pairs[0].downTensor,elementOffset:0,elementCount:1};
 const pending=readLoraTensor(file,binding,request);request.tensorName='fake';request.elementOffset=100000;binding.stage='LOW';binding.strength=99;
 const value=await pending;assert.equal(value.stage,'HIGH');assert.equal(value.strength,3);assert.equal(value.elementOffset,0);
 const forged=structuredClone(m);forged.tensors[0].dataOffsets=[999999,999999];
 assert.equal((await readLoraTensor(file,forged,{tensorName:m.pairs[0].downTensor,elementOffset:0,elementCount:1})).data.byteLength,4);
 await assert.rejects(readLoraTensor(file,{...m,headerSHA256:'0'.repeat(64)},{tensorName:m.pairs[0].downTensor,elementOffset:0,elementCount:1}),code('INVALID_LORA_BINDING'));
});
await run('raw source range and read budgets include zero and endpoint boundaries',async()=>{
 const file=linearFixture(),m=await loadLoraFile(file,options);
 const raw=await readLoraBytes(file,m,{byteOffset:0,byteLength:8});assert.equal(raw.rangeSHA256,hash(raw.data));assert.equal(raw.byteOffset,0);
 assert.equal((await readLoraBytes(file,m,{byteOffset:file.size,byteLength:0})).data.length,0);
 for(const range of [{byteOffset:-1,byteLength:1},{byteOffset:0,byteLength:LORA_LIMITS.maxReadBytes+1}])await assert.rejects(readLoraBytes(file,m,range),code(range.byteLength>LORA_LIMITS.maxReadBytes?'LORA_READ_BUDGET_EXCEEDED':'INVALID_LORA'));
 const big=linearFixture({alias:'diffusion_model.time_projection.1',out:30720,rank:64});const bigBinding=await loadLoraFile(big,options);
 await assert.rejects(readLoraTensor(big,bigBinding,{tensorName:bigBinding.pairs[0].upTensor,elementOffset:0,elementCount:1048577}),code('LORA_READ_BUDGET_EXCEEDED'));
});
console.log(JSON.stringify({scope:'LoRA stored-byte IO only; no application or complete inference',caseCount:codes.length,cases:codes}));

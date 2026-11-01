import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as codec from '../../docs/shared/inference/tensor.mjs';

const MARKER='umt5-final-rmsnorm-f32-v1';
const legacySource=await readFile(new URL('./fixtures/tensor-2c171.mjs',import.meta.url));
const legacy=await import('data:text/javascript;base64,'+legacySource.toString('base64'));
const text=()=>({dtype:'float32',shape:[1,2,4096],layout:'BLC',meaning:'text_hidden_states',
 data:new Float32Array(8192).fill(.125),attentionMask:Uint8Array.of(1,0),
 modelSha256:'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68',
 tokenizerSha256:'e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458',
 context:{schemaVersion:1,contextId:'text-context',inputId:'prompt',inputSha256:'a'.repeat(64),slotId:'positive',sourceFrameIndices:[4,2],sourceFrameTimesSeconds:[.4,.2]}});

test('Text final-normalization marker survives codec and conditioning storage with owned values',async()=>{
 const input={...text(),normalization:MARKER};
 const {encodeWanConditioning,decodeWanConditioning}=await import('../../docs/shared/diffusion-models/tensor-interop.mjs');
 for(const restored of [await codec.decodeTensor(await codec.encodeTensor(input)),await decodeWanConditioning(await encodeWanConditioning(input))]){
  assert.equal(restored.normalization,MARKER);assert.deepEqual(restored.data,input.data);
  assert.deepEqual(restored.attentionMask,input.attentionMask);assert.deepEqual(restored.context,input.context);
  assert.equal(restored.modelSha256,input.modelSha256);assert.equal(restored.tokenizerSha256,input.tokenizerSha256);
  assert.notEqual(restored.data.buffer,input.data.buffer);
 }
});

test('Text marker is captured before asynchronous serialization and is never inferred for legacy files',async()=>{
 const input={...text(),normalization:MARKER},pending=codec.encodeTensor(input);input.normalization='changed';
 assert.equal((await codec.decodeTensor(await pending)).normalization,MARKER);
 const markerless=text(),old=await legacy.encodeTensor(markerless),restored=await codec.decodeTensor(old);
 assert.equal(Object.hasOwn(restored,'normalization'),false);
 assert.deepEqual(await codec.encodeTensor(markerless),old);assert.deepEqual(await codec.encodeTensor(restored),old);
});

test('Text normalization declarations reject conflicting meanings, layouts, dtypes and rules',async()=>{
 const input={...text(),normalization:MARKER};
 for(const changed of [{normalization:'wrong-rule'},{layout:'NLC'},{meaning:'contract-fixture'},
  {dtype:'int32',data:new Int32Array(8192)}]){
  const candidate={...input,...changed};delete candidate.attentionMask;delete candidate.tokenizerSha256;
  await assert.rejects(codec.encodeTensor(candidate),/normalization marker/i);
 }
});

test('describeTensor owns every connection descriptor field without retaining the numeric payload',()=>{
 assert.equal(typeof codec.describeTensor,'function');
 const input={...text(),normalization:MARKER},expected=structuredClone(input),descriptor=codec.describeTensor(input);
 assert.equal(Object.hasOwn(descriptor,'data'),false);
 assert.deepEqual(descriptor,{dtype:'float32',shape:expected.shape,layout:'BLC',meaning:'text_hidden_states',
  modelSha256:expected.modelSha256,attentionMask:expected.attentionMask,normalization:MARKER,
  tokenizerSha256:expected.tokenizerSha256,context:expected.context});
 input.shape[1]=3;input.attentionMask[0]=0;input.context.slotId='changed';input.context.sourceFrameIndices[0]=99;input.context.sourceFrameTimesSeconds[0]=9;
 assert.deepEqual(descriptor.shape,[1,2,4096]);assert.deepEqual([...descriptor.attentionMask],[1,0]);
 assert.deepEqual(descriptor.context,expected.context);
 assert.throws(()=>codec.describeTensor({...text(),data:Float32Array.of(1)}),/shape\/data/);
 const minimal={dtype:'float32',shape:[1],layout:'N',meaning:'descriptor-fixture',data:Float32Array.of(1)};
 assert.deepEqual(codec.describeTensor(minimal),{dtype:'float32',shape:[1],layout:'N',meaning:'descriptor-fixture'});
});

test('describeTensor clones generated-sample producer and normalization metadata',()=>{
 assert.equal(typeof codec.describeTensor,'function');
 const input={dtype:'float32',shape:[1,16,1,1,1],layout:'NCTHW',meaning:'wan21-raw-generated-sample:v1',data:new Float32Array(16),
  modelSha256:'a'.repeat(64),latentContract:{schemaVersion:1,representation:'generated-sample',space:'raw',
   vaeModelSha256:'b'.repeat(64),producerModelSha256s:['a'.repeat(64)],normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}}};
 const descriptor=codec.describeTensor(input);input.latentContract.producerModelSha256s[0]='c'.repeat(64);input.latentContract.normalization.state='changed';
 assert.deepEqual(descriptor.latentContract.producerModelSha256s,['a'.repeat(64)]);
 assert.deepEqual(descriptor.latentContract.normalization,{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'});
});

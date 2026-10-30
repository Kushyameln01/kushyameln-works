import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {encodeTensor,decodeTensor} from '../../docs/shared/inference/tensor.mjs';
import * as textAPI from '../../docs/shared/inference/text-encoder-api.mjs';
import {bindInferencePort} from '../../docs/shared/inference/api.mjs';

const tokenizer='e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458';
const encoder='c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68';
const profile=JSON.parse(fs.readFileSync(new URL('./vae/profile.json',import.meta.url)));
const context=()=>({schemaVersion:1,contextId:'context-ref-2',inputId:'source-video',inputSha256:'c'.repeat(64),slotId:'ref-2',sourceFrameIndices:[10,9,10,11,12],sourceFrameTimesSeconds:[1,.9,1,1.1,1.2]});
// Synthetic producer hashes exercise metadata only; no real generation is claimed.
const sample=()=>({dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'wan21-raw-generated-sample:v1',modelSha256:'a'.repeat(64),data:Float32Array.from({length:128},(_,i)=>(i-64)/8),context:context(),latentContract:{schemaVersion:1,representation:'generated-sample',space:'raw',vaeModelSha256:profile.model.sha256,producerModelSha256s:['a'.repeat(64),'b'.repeat(64)],normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}}});

test('legacy fixture from the published baseline retains byte-identical serialization',async()=>{
 const baseline=fs.readFileSync(new URL('./fixtures/works-tensor-v1-legacy.wktensor',import.meta.url));
 const expected={dtype:'float32',shape:[1,2],layout:'NC',meaning:'contract-fixture',data:Float32Array.of(1,-2)};
 assert.deepEqual(await encodeTensor(expected),new Uint8Array(baseline));
 assert.deepEqual((await decodeTensor(baseline)).data,expected.data);
});

test('conditioning retains encoder, tokenizer, mask and owned payload through the existing codec',async()=>{
 const input={dtype:'float32',shape:[1,2,4096],layout:'BLC',meaning:'text_hidden_states',data:new Float32Array(8192).fill(.125),modelSha256:encoder,tokenizerSha256:tokenizer,attentionMask:Uint8Array.of(1,0)};
 const restored=await decodeTensor(await encodeTensor(input));
 assert.equal(restored.tokenizerSha256,tokenizer);assert.equal(restored.modelSha256,encoder);
 assert.deepEqual([...restored.attentionMask],[1,0]);assert.deepEqual(restored.shape,[1,2,4096]);assert.equal(restored.data[0],.125);assert.notEqual(restored.data.buffer,input.data.buffer);
});

test('Diffusion conditioning storage wrapper retains the supplied tokenizer identity and rejects a conflicting one',async()=>{
 const {encodeWanConditioning,decodeWanConditioning,requireWanConditioning}=await import('../../docs/shared/diffusion-models/tensor-interop.mjs');
 const input={dtype:'float32',shape:[1,2,4096],layout:'BLC',meaning:'text_hidden_states',data:new Float32Array(8192),modelSha256:encoder,tokenizerSha256:tokenizer,attentionMask:Uint8Array.of(1,0)};
 const restored=await decodeWanConditioning(await encodeWanConditioning(input));assert.equal(restored.tokenizerSha256,tokenizer);
 assert.throws(()=>requireWanConditioning({...input,tokenizerSha256:'d'.repeat(64)}));
 // Old saved conditioning remains accepted, with tokenizer provenance absent.
 const {tokenizerSha256,...legacy}=input;assert.doesNotThrow(()=>requireWanConditioning(legacy));
});

test('generated sample keeps its separate VAE binding, producer hashes and original frame mapping on disk',async()=>{
 const input=sample(),restored=await decodeTensor(await encodeTensor(input));
 assert.equal(restored.meaning,'wan21-raw-generated-sample:v1');assert.equal(restored.modelSha256,'a'.repeat(64));
 assert.deepEqual(restored.latentContract,input.latentContract);assert.deepEqual(restored.context,input.context);
 assert.equal(restored.data[127],7.875);assert.equal(input.context.sourceFrameIndices[1],9,'no automatic sorting or deduplication');
});

test('serialization snapshots identity, shape, mask and new metadata before asynchronous hashing',async()=>{
 const input=sample(),before=structuredClone(input),pending=encodeTensor(input);
 input.shape[2]=3;input.modelSha256='d'.repeat(64);input.context.slotId='changed';input.context.sourceFrameIndices[0]=999;input.latentContract.producerModelSha256s[0]='e'.repeat(64);input.data.fill(0);
 const restored=await decodeTensor(await pending);
 assert.deepEqual(restored.shape,before.shape);assert.equal(restored.modelSha256,before.modelSha256);assert.deepEqual(restored.context,before.context);assert.deepEqual(restored.latentContract,before.latentContract);assert.deepEqual(restored.data,before.data);
 const text={dtype:'float32',shape:[1,2,1],layout:'BLC',meaning:'text_hidden_states',data:Float32Array.of(1,0),attentionMask:Uint8Array.of(1,0)};
 const saved=encodeTensor(text);text.attentionMask.fill(0);assert.deepEqual([...(await decodeTensor(await saved)).attentionMask],[1,0]);
});

test('malformed new identity/context metadata is rejected rather than silently discarded',async()=>{
 for(const change of [t=>{t.latentContract.producerModelSha256s.push('a'.repeat(64));},t=>{t.context.inputSha256='unknown';},t=>{t.context.sourceFrameIndices=[-1];},t=>{t.context.sourceFrameTimesSeconds=[0];}]){
  const input=sample();change(input);await assert.rejects(encodeTensor(input));
 }
 const input={dtype:'float32',shape:[1,1,1],layout:'BLC',meaning:'text_hidden_states',data:Float32Array.of(1),tokenizerSha256:'unknown'};
 await assert.rejects(encodeTensor(input));
});

test('saving cannot erase a contradictory raw or normalized latent marker',async()=>{
 const raw={dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',data:new Float32Array(128),modelSha256:profile.model.sha256,normalization:'wan21-comfy-f32-v1'};
 await assert.rejects(encodeTensor(raw));
 await assert.rejects(encodeTensor({...sample(),normalization:'wan21-comfy-f32-v1'}));
 await assert.rejects(encodeTensor({...raw,meaning:'wan21-normalized-posterior-mean:v1',normalization:'unknown'}));
});

test('sparse frame indices or timestamps are rejected before creating an unreadable file',async()=>{
 const holes=new Array(5);holes[0]=0;holes[4]=4;
 const indices=sample();indices.context.sourceFrameIndices=holes;await assert.rejects(encodeTensor(indices));
 const times=sample();times.context.sourceFrameTimesSeconds=holes;await assert.rejects(encodeTensor(times));
});

test('existing 128-element Diffusion mean Hike round-trip preserves context as an owned copy',async()=>{
 const {createLatentSpace}=await import('../../docs/shared/diffusion-models/latent-space/latent-space.mjs');
 const kernel=fs.readFileSync(new URL('../../docs/shared/diffusion-models/latent-space/build/latent-space.wasm',import.meta.url));
 const api=await createLatentSpace(kernel),input={dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:profile.model.sha256,data:Float32Array.from({length:128},(_,i)=>(i-64)/32),context:context()};
 try{
  const normalized=api.normalizeRawMean(input);assert.deepEqual(normalized.context,input.context);assert.notEqual(normalized.context,input.context);
  const restored=api.restoreRawMean(await decodeTensor(await encodeTensor(normalized)));assert.deepEqual(restored.context,input.context);assert.equal(restored.meaning,'raw-posterior-mean');
  assert.ok(restored.data.every((v,i)=>Math.abs(v-input.data[i])<=.000002));assert.equal(api.stats().calls,2);
  assert.throws(()=>api.normalizeRawMean(sample()));assert.throws(()=>api.restoreRawMean(sample()));
 }finally{api.dispose();}
});

test('Text input modes are explicit and token IDs retain caller-specified internal mask positions',()=>{
 assert.equal(typeof textAPI.validateTextEncoderInput,'function');
 assert.deepEqual(textAPI.validateTextEncoderInput({text:''}),{text:''});
 const ids=Int32Array.of(42,1234,1),mask=Uint8Array.of(1,0,1),actual=textAPI.validateTextEncoderInput({tokenIds:ids,attentionMask:mask});
 assert.deepEqual([...actual.tokenIds],[42,1234,1]);assert.deepEqual([...actual.attentionMask],[1,0,1]);assert.notEqual(actual.tokenIds.buffer,ids.buffer);
 for(const input of [{text:'Hello',tokenIds:[1],attentionMask:[1]},{tokenIds:[1],attentionMask:[0]},{tokenIds:[256384],attentionMask:[1]},{tokenIds:['1'],attentionMask:[1]},{tokenIds:[1],attentionMask:[257]},{tokenIds:[1]},{text:1}])assert.throws(()=>textAPI.validateTextEncoderInput(input));
});

test('VAE factory dispatches generated sample without relabeling provenance or applying normalization',async()=>{
 const {createVaeModule}=await import('../../docs/shared/inference/vae-api.mjs');
 let sent;const client={state:{status:'idle'},run:async request=>{sent=request;return{dispatched:true};},cancel(){},dispose(){}};
 const api=createVaeModule({client,ownsClient:false});api.configure({manifest:profile,files:new Map()});
 const input=sample(),before=structuredClone(input);assert.deepEqual(await api.decode(input),{dispatched:true});
 assert.equal(sent.input.meaning,'wan21-raw-generated-sample:v1');assert.equal(sent.input.modelSha256,'a'.repeat(64));assert.deepEqual(input,before);
 const changed=sample();changed.latentContract.vaeModelSha256='d'.repeat(64);await assert.rejects(api.decode(changed));api.dispose();
});

test('explicit MessagePort reply transfers ownership while retaining the context mapping',async()=>{
 // Transport fixture only: this module double does not represent model inference.
 const tensor={dtype:'float32',shape:[1,3,5,16,16],layout:'NCTHW',meaning:'raw-decoder-rgb',data:new Float32Array(3840).fill(.25),modelSha256:profile.model.sha256,context:context()};
 const {port1,port2}=new MessageChannel(),unbind=bindInferencePort(port1,{vae:{decode:()=>({tensor})}});port2.start();
 try{
  const received=new Promise(resolve=>port2.addEventListener('message',e=>resolve(e.data),{once:true}));
  port2.postMessage({apiVersion:'works-ai-1',id:'fixture',module:'vae',method:'decode'});
  const result=await received;assert.equal(result.ok,true);assert.equal(tensor.data.byteLength,0);assert.equal(result.result.tensor.data[0],.25);assert.deepEqual(result.result.tensor.context,context());
  assert.deepEqual((await decodeTensor(await encodeTensor(result.result.tensor))).context,context());
 }finally{unbind();port2.close();}
});

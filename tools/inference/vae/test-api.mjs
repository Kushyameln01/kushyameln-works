import assert from 'node:assert/strict';
import fs from 'node:fs';
let api;try{api=await import('../../../docs/shared/inference/vae.mjs');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
assert.equal(typeof api?.validateVaeRequest,'function','VAE SDK must validate profile and tensor before model loading');
const manifest=JSON.parse(fs.readFileSync(new URL('./profile.json',import.meta.url)));
const tensor={dtype:'float32',layout:'NCTHW',shape:[1,16,2,2,2],data:new Float32Array(128),meaning:'raw-posterior-mean'};
assert.equal(api.validateVaeRequest({operation:'decode',tensor,manifest}).count,128);
// Public tensor semantics and explicit model provenance must survive SDK-only connections.
assert.throws(()=>api.validateVaeRequest({operation:'decode',tensor:{...tensor,meaning:'normalized-latent'},manifest}),/meaning|semantic/i);
assert.throws(()=>api.validateVaeRequest({operation:'decode',tensor:{...tensor,modelSha256:'0'.repeat(64)},manifest}),/model/i);
assert.throws(()=>api.validateVaeRequest({operation:'decode',tensor:{...tensor,meaning:undefined},manifest}),/meaning|semantic/i);
const detached=new Float32Array(128);structuredClone(detached.buffer,{transfer:[detached.buffer]});assert.throws(()=>api.validateVaeRequest({operation:'decode',tensor:{...tensor,data:detached},manifest}));
const nonfinite=new Float32Array(128);nonfinite[12]=NaN;assert.throws(()=>api.validateVaeRequest({operation:'decode',tensor:{...tensor,data:nonfinite},manifest}),/Nonfinite/);
const rgb={dtype:'float32',layout:'NCTHW',shape:manifest.profile.videoShape,data:new Float32Array(3840),meaning:'raw-decoder-rgb'};
assert.equal(api.validateVaeRequest({operation:'encode',tensor:rgb,manifest}).count,3840);
const unit={...rgb,meaning:'rgb-unit',data:new Float32Array(3840).fill(.25)};
assert.equal(api.validateVaeRequest({operation:'encode',tensor:unit,manifest}).count,3840,'unit RGB is an explicit Hike preprocessing input');
for(const value of [-.01,1.01]){const data=new Float32Array(3840);data[0]=value;assert.throws(()=>api.validateVaeRequest({operation:'encode',tensor:{...unit,data},manifest}),/range|unit|\[0,1\]/i);}
await assert.rejects(api.runVae({operation:'encode',tensor:unit,manifest,files:new Map([[manifest.assets.encoder.file,new Uint8Array()]]),ort:{},hike:null}),/Hike/);
assert.equal(api.validateVaeRequest({operation:'encode',tensor:{...rgb,modelSha256:'0'.repeat(64)},manifest}).count,3840,'RGB from another model may be encoded without reinterpreting latent channels');
assert.throws(()=>api.validateVaeRequest({operation:'encode',tensor:{...rgb,meaning:'normalized-rgb'},manifest}),/meaning|semantic/i);
assert.equal(api.validateVaeRequest({operation:'decode',tensor:{...tensor,modelSha256:manifest.model.sha256},manifest}).count,128);
for(const bad of [null,{...tensor,data:new Float64Array(128)},{...tensor,shape:[1,16,3,2,2]},{...tensor,dtype:'float16'},{...tensor,layout:'NHWTC'},{...tensor,data:Float32Array.of(NaN)}])assert.throws(()=>api.validateVaeRequest({operation:'decode',tensor:bad,manifest}));
assert.throws(()=>api.validateVaeRequest({operation:'sample',tensor,manifest}));
assert.throws(()=>api.validateVaeRequest({operation:'decode',tensor,manifest:{...manifest,profile:{...manifest.profile,latentSpace:'normalized'}}}));
const bad=structuredClone(manifest);bad.assets.decoderBody.file='../model.onnx';assert.throws(()=>api.validateVaeRequest({operation:'decode',tensor,manifest:bad}));
const missing=new Map();await assert.rejects(api.runVae({operation:'decode',tensor,manifest,files:missing,ort:{},hike:{}}),/missing|requires/i);
// connection-1 generated samples are raw decoder inputs with an explicit producer/space contract.
const producer='1'.repeat(64),otherProducer='2'.repeat(64);
const context={schemaVersion:1,contextId:'context-A',inputId:'input-source',inputSha256:'3'.repeat(64),slotId:'source_video',sourceFrameIndices:[0,4,8],sourceFrameTimesSeconds:[0,.25,.5]};
const latentContract={schemaVersion:1,representation:'generated-sample',space:'raw',vaeModelSha256:manifest.model.sha256,producerModelSha256s:[producer,otherProducer],normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}};
const generated={...tensor,meaning:'wan21-raw-generated-sample:v1',modelSha256:producer,context,latentContract};
assert.equal(api.validateVaeRequest({operation:'decode',tensor:generated,manifest}).count,128,'Declared restored generated sample should pass the VAE decoder boundary');
assert.equal(api.validateVaeRequest({operation:'decode',tensor:{...generated,modelSha256:undefined},manifest}).count,128);
for(const bad of [
 {...generated,latentContract:undefined},
 {...generated,latentContract:{...latentContract,space:'normalized'}},
 {...generated,latentContract:{...latentContract,vaeModelSha256:producer}},
 {...generated,latentContract:{...latentContract,producerModelSha256s:[manifest.model.sha256]}},
 {...generated,latentContract:{...latentContract,producerModelSha256s:[]}},
 {...generated,latentContract:{...latentContract,producerModelSha256s:[producer,producer]}},
 {...generated,latentContract:{...latentContract,normalization:{...latentContract.normalization,state:'normalized'}}},
 {...generated,modelSha256:'4'.repeat(64)},
 {...generated,modelSha256:manifest.model.sha256},
 {...tensor,latentContract},
 {...tensor,normalization:'wan21-comfy-f32-v1'},
 {...generated,context:{...context,sourceFrameTimesSeconds:[0]}},
])assert.throws(()=>api.validateVaeRequest({operation:'decode',tensor:bad,manifest}));
const captured=api.validateVaeRequest({operation:'decode',tensor:generated,manifest});
assert.notEqual(captured.metadata.context,context);assert.notEqual(captured.metadata.latentContract,latentContract);
context.sourceFrameIndices[0]=99;latentContract.producerModelSha256s[0]='5'.repeat(64);
assert.equal(captured.metadata.context.sourceFrameIndices[0],0);assert.equal(captured.metadata.latentContract.producerModelSha256s[0],producer);
// Encode context maps every input video frame, never one entry per latent slot.
assert.throws(()=>api.validateVaeRequest({operation:'encode',tensor:{...rgb,context},manifest}),/frame/i);
const completeContext={...context,sourceFrameIndices:[0,4,8,12,16],sourceFrameTimesSeconds:[0,.25,.5,.75,1]};
assert.equal(api.validateVaeRequest({operation:'encode',tensor:{...rgb,context:completeContext},manifest}).count,3840);
const {createVaeModule}=await import('../../../docs/shared/inference/vae-api.mjs');
let dispatchCount=0,dispatched;
const client={state:{status:'idle'},run:async request=>{dispatchCount++;dispatched=request;return {accepted:true};},cancel(){},dispose(){}};
const module=createVaeModule({client,ownsClient:false});module.configure({manifest,files:new Map()});
const validGenerated={...generated,context:captured.metadata.context,latentContract:captured.metadata.latentContract};
await module.decode(validGenerated);assert.equal(dispatchCount,1);assert.equal(dispatched.input.modelSha256,producer);
await assert.rejects(module.decode({...validGenerated,latentContract:{...validGenerated.latentContract,space:'normalized'}}));assert.equal(dispatchCount,1,'Invalid generated contract must be rejected before client dispatch');
assert.equal(module.capabilities().apiVersion,'works-ai-1');
assert.ok(module.capabilities().decode.input.meanings.includes('raw-posterior-mean'));
assert.ok(module.capabilities().decode.input.meanings.includes('wan21-raw-generated-sample:v1'));
assert.equal(module.capabilities().decode.generatedSampleContract.declaredOnly,true);
assert.equal(module.capabilities().decode.generatedSampleContract.realGenerationVerified,false);
module.dispose();
console.log(JSON.stringify({passed:true,scope:'profile/tensor/producer-space-context validation and pre-dispatch module boundary; no inference performed'}));

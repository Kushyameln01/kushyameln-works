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
console.log(JSON.stringify({passed:true,scope:'profile/tensor rejection and required local-file contract'}));

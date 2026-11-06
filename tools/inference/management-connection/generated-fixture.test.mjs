import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import * as codec from '../../../docs/shared/inference/tensor.mjs';
import {validateVaeRequest} from '../../../docs/shared/inference/vae.mjs';

let fixture;
try { fixture=await import('./generated-fixture.mjs'); } catch(error) {
 if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
}
const source=process.env.GENERATED_DIFFUSION_SOURCE;
async function owners(){
 assert.ok(source,'Set GENERATED_DIFFUSION_SOURCE to the extracted fixed Diffusion source');
 const generatedSpace=await import(pathToFileURL(path.join(source,'docs/shared/diffusion-models/execution/generated-space.mjs')));
 const {BASE_MODEL_HASHES}=await import(pathToFileURL(path.join(source,'docs/shared/diffusion-models/lora/weights.mjs')));
 const wasmBytes=new Uint8Array(await fs.readFile(path.join(source,'docs/shared/diffusion-models/execution/generated-space/build/generated-space.wasm')));
 return {generatedSpace,wasmBytes,producerModelSha256s:[BASE_MODEL_HASHES.HIGH,BASE_MODEL_HASHES.LOW],codec};
}

test('synthetic generated input goes through the real Diffusion restore and raw codec without posterior relabeling',async()=>{
 assert.equal(typeof fixture?.prepareGeneratedFixture,'function','The generated fixture preparation entry is missing');
 const prepared=await fixture.prepareGeneratedFixture(await owners());
 assert.equal(prepared.fixtureScope.synthetic,true);
 assert.equal(prepared.fixtureScope.modelInference,false);
 assert.equal(prepared.normalized.meaning,'bernini-generated-model-latent:v1');
 assert.equal(prepared.normalized.normalization,'wan21-comfy-f32-v1');
 assert.equal(prepared.normalized.latentContract,undefined);
 assert.equal(prepared.raw.meaning,'wan21-raw-generated-sample:v1');
 assert.equal(prepared.raw.normalization,undefined);
 assert.deepEqual(prepared.raw.shape,[1,16,1,2,4]);
 assert.deepEqual(prepared.raw.latentContract.producerModelSha256s,prepared.normalized.producerModelSha256s);
 assert.equal(prepared.raw.latentContract.normalization.owner,'diffusion_models');
 assert.equal(prepared.raw.latentContract.normalization.state,'restored');
 assert.deepEqual(prepared.readback.latentContract,prepared.raw.latentContract);
 assert.deepEqual(prepared.readback.data,prepared.raw.data);
 assert.deepEqual(prepared.readback.context,prepared.normalized.context);
 assert.equal(prepared.stats.operations,1);
 assert.equal(prepared.stats.workspaceZeroed,true);
 assert.equal(prepared.disposedStats.disposed,true);
 assert.equal(prepared.disposedStats.memoryBytes,0);
 assert.deepEqual([...prepared.normalized.data],Array.from({length:128},(_,i)=>(i-64)/32),'The owner must not mutate caller input');
 const manifest=JSON.parse(await fs.readFile(process.env.GENERATED_RECT_MANIFEST,'utf8'));
 const request=validateVaeRequest({operation:'decode',tensor:prepared.readback,manifest});
 assert.deepEqual(request.outputShape,[1,3,1,16,32]);
});

test('unsupported producer identity is rejected by Diffusion rather than changed to the VAE identity',async()=>{
 assert.equal(typeof fixture?.prepareGeneratedFixture,'function','The generated fixture preparation entry is missing');
 const config=await owners();config.producerModelSha256s=['a'.repeat(64)];
 await assert.rejects(fixture.prepareGeneratedFixture(config),/supported producer/);
});

test('pre-cancelled fixture preparation executes no restoration and releases the owner',async()=>{
 assert.equal(typeof fixture?.prepareGeneratedFixture,'function','The generated fixture preparation entry is missing');
 const signal=AbortSignal.abort(),config=await owners();let realOwner;
 const generatedSpace={...config.generatedSpace,createGeneratedLatentSpace:async options=>{
  realOwner=await config.generatedSpace.createGeneratedLatentSpace(options);return realOwner;
 }};
 await assert.rejects(fixture.prepareGeneratedFixture({...config,generatedSpace,signal}),{name:'AbortError'});
 assert.equal(realOwner.stats().calls,0);
 assert.equal(realOwner.stats().disposed,true);
 assert.equal(realOwner.stats().memoryBytes,0);
});

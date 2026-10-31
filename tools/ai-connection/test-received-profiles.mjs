// Acquired E6 artifacts and native profile boundary only: no model/bundle run.
// F1 artifacts originate at Text2c and are byte-identical in the VAE7e root.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const sources={text:'2c171a09ccda65c54899f322ae490f1bfcaac6fb',vae:'7e091192232fae36367b550ca5fada88915a0703',diffusion:'438972f30242e0a3bc66edb8591f38eaa0fcd384'};
const roots={vae:process.env.WORKS_VAE_PROFILE_ROOT,diffusion:process.env.WORKS_DIFFUSION_NATIVE_ROOT};
const skip=!roots.vae||!roots.diffusion?'Set WORKS_VAE_PROFILE_ROOT=VAE7e root and WORKS_DIFFUSION_NATIVE_ROOT=Diffusion438 root; acquired-artifact boundary NOT VERIFIED':false;
const paths={
 codec:['vae','docs/shared/inference/tensor.mjs','4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b'],
 squareManifest:['vae','development/inference/vae-v1/fixtures/bundle-manifest.json','fa219b8e7e0b6b0be37c598d3dfedadb29505ad1407fe3f8270d8655dd46828c'],
 fiveManifest:['vae','development/inference/vae-v1/fixtures/baseline5-manifest.json','c9c0fd3ceb53b029f627dba9c214b5d5fb8d2c39f572fbdff5907a7da02f1acb'],
 square:['vae','development/inference/vae-v1/fixtures/png-mean.wktensor','3641234c5f5a722d1d7eb2b4558412ba2c425d089324986bcdf209e66f9f8e98'],
 rectangleManifest:['vae','development/inference/e6/fixtures/bundle-manifest.json','450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a'],
 rectangle:['vae','development/inference/e6/fixtures/png-mean.wktensor','6539204ef61dc0f706238b74e2bcabf8bbcce971f5056d0b0d7e288811516b71'],
 nativeCodec:['diffusion','docs/shared/inference/tensor.mjs','a3fdfc1654361713a5e8278e6af5d76a65aafed7f654c06813eebb933f7a0f4c'],
 boundary:['diffusion','docs/shared/diffusion-models/tensor-interop.mjs','ae197407f47b036feb83c7b827faa9b7c7ee8ba7f5c54c7139221c186201553d'],
 kernelHost:['diffusion','docs/shared/diffusion-models/latent-space/latent-space.mjs','a4aef2943d51a88f032a1b85ada9ace1b8ffc9a2653de890821a36b9102ed3b1'],
 kernelRegistry:['diffusion','docs/shared/diffusion-models/latent-space/kernel-registry.mjs','16f7dcb426c6972082f9f554fc21267028ab8447c9a6b4a7a1edd2b7cdcc8927'],
 kernel:['diffusion','docs/shared/diffusion-models/latent-space/build/latent-space.wasm','6b9cb9f0617da373e63275354ac42f7843fb455019ed3988df7364173bc775b4'],
};
let received;
async function acquire(){
 if(!received)received=(async()=>{
  const bytes={};
  for(const [name,[owner,path,hash]]of Object.entries(paths)){
   bytes[name]=await readFile(resolve(roots[owner],path));
   assert.equal(createHash('sha256').update(bytes[name]).digest('hex'),hash,`Pinned ${sources[owner]} source/artifact: ${path}`);
  }
  const module=name=>import(pathToFileURL(resolve(roots[paths[name][0]],paths[name][1])).href);
  const codec=await module('codec');
  return{bytes,codec,boundary:await module('boundary'),kernelHost:await module('kernelHost'),
   square:await codec.decodeTensor(bytes.square),rectangle:await codec.decodeTensor(bytes.rectangle),
   profiles:['squareManifest','rectangleManifest','fiveManifest'].map(name=>JSON.parse(bytes[name]).profile)};
 })();
 return received;
}

test('received F1 square and rectangle means preserve distinct native profiles despite rectangle/F5 equal element count',{skip},async t=>{
 const r=await acquire(),[square,rectangle,five]=r.profiles;
 assert.deepEqual(r.square.shape,[1,16,1,2,2]);assert.deepEqual(r.rectangle.shape,[1,16,1,2,4]);
 assert.deepEqual([square.id,rectangle.id,five.id],['wan21-raw-f32-1x16x16','wan21-raw-f32-1x16x32','wan21-raw-f32-5x16x16']);
 assert.deepEqual(square.latentShape,r.square.shape);assert.deepEqual(rectangle.latentShape,r.rectangle.shape);
 assert.deepEqual(five.latentShape,r.boundary.WAN21_RAW_PROFILE.shape);
 assert.equal(r.square.data.length,64);assert.equal(r.rectangle.data.length,128);assert.equal(five.latentShape.reduce((a,b)=>a*b,1),128);
 for(const tensor of [r.square,r.rectangle]){assert.equal(tensor.meaning,'raw-posterior-mean');assert.equal(tensor.modelSha256,r.boundary.WAN21_VAE_SHA256);}
 assert.equal(r.boundary.requireWanRawLatentF1(r.square),r.square);
 assert.throws(()=>r.boundary.requireWanRawLatent(r.square),/shape/i);
 assert.throws(()=>r.boundary.requireWanRawLatent(r.rectangle),/shape/i);
 assert.throws(()=>r.boundary.requireWanRawLatentF1(r.rectangle),/shape/i);
 t.diagnostic(`Pinned public artifacts: Text ${sources.text}, VAE ${sources.vae}; native contract ${sources.diffusion}. F5 is manifest/contract comparison, not a new F5 model run.`);
});

test('acquired Diffusion64 Hike accepts the received square mean and rejects rectangle before numerical dispatch',{skip},async t=>{
 const r=await acquire(),kernel=await r.kernelHost.createLatentSpace(r.bytes.kernel);
 const original=new Float32Array(r.square.data);
 try{
  assert.throws(()=>kernel.normalizeRawMean(r.rectangle),/shape profile/i);assert.equal(kernel.stats().calls,0);
  const normalized=kernel.normalizeRawMean(r.square),restored=kernel.restoreRawMean(normalized);
  assert.deepEqual(normalized.shape,r.square.shape);assert.equal(normalized.meaning,'wan21-normalized-posterior-mean:v1');
  assert.deepEqual(restored.shape,r.square.shape);assert.equal(restored.meaning,r.square.meaning);assert.equal(restored.modelSha256,r.square.modelSha256);
  let maxError=0;for(let i=0;i<64;i++)maxError=Math.max(maxError,Math.abs(restored.data[i]-original[i]));
  assert.ok(maxError<=2e-6,`Existing fixed mean round-trip gate: ${maxError}`);assert.deepEqual(r.square.data,original);assert.equal(kernel.stats().calls,2);
  t.diagnostic(`Actual acquired Hike kernel, 64 values, 2 calls, maxError=${maxError}; no VAE/NN inference or bundle access.`);
 }finally{kernel.dispose();}
});

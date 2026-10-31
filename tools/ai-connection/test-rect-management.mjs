import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createOwnedArtifactStore,captureNativeTensor,restoreNativeTensor} from '../../docs/shared/ai-connection/adapters/artifacts.mjs';
const runner=await import('./rect-management-runner.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
test('P2 runner exposes an exact Rect boundary, not an element-count boundary',()=>{
 assert.equal(typeof runner.assertRectMean,'function');
 const t={dtype:'float32',layout:'NCTHW',shape:[1,16,1,2,4],meaning:'raw-posterior-mean',modelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',data:new Float32Array(128)};
 assert.equal(runner.assertRectMean(t),t);
 for(const replacement of [{shape:[1,16,2,2,2]},{shape:[1,16,1,2,2],data:new Float32Array(64)},{profileId:'wan21-raw-f32-5x16x16'},{meaning:'wan21-normalized-posterior-mean:v1'},{normalization:'wan21-comfy-f32-v1'},{modelSha256:'a'.repeat(64)}])assert.throws(()=>runner.assertRectMean({...t,...replacement}));
});
const haveRoots=!!process.env.WORKS_RECT_DIFFUSION_ROOT&&!!process.env.WORKS_RECT_VAE_ROOT;
let candidate;
async function load(){return candidate??=await runner.loadRectCandidate({diffusionRoot:process.env.WORKS_RECT_DIFFUSION_ROOT,vaeRoot:process.env.WORKS_RECT_VAE_ROOT});}
test('P2 actual candidate keeps full pins, accepted gates and same native-context mean bytes',{skip:!haveRoots},async()=>{
 const c=await load();assert.equal(c.pins.diffusion.commit,'5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3');assert.equal(c.pins.vae.commit,'855f435120f08eb9e818e51281fc26f0e2633829');assert.equal(c.gates.meanRoundtrip,2e-6);assert.equal(c.gates.vae.maxAbs,2e-5);assert.equal(c.gates.exporterDefault.maxAbs,.002);
 assert.equal(c.inputIdentity.sha256,'8134bc943a60b3f0e0d388048ef0943a5274ef37511ce5630cc40d7596bb26a8');assert.deepEqual(c.native.context.sourceFrameIndices,[0]);assert.equal(c.reference.raw.length,128);
});
test('P2 actual owner WASM, E4 disk readback and owned cache form one scoped mean trace',{skip:!haveRoots},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'works-rect-route-'));
 try{const c=await load(),result=await runner.runRectManagement({candidate:c,outputDirectory:directory,managerCommit:'28596717182e48aeb23c719c51b6e593edf4e496'});
  assert.equal(result.status,'PARTIAL');assert.equal(result.generationReady,false);assert.equal(result.freshVaeEncode,false);assert.equal(result.freshVaeDecode,false);
  assert.equal(result.transform.calls,2);assert.equal(result.transform.normalized.sha256,'4c6802f01df4ecd426cfc5910ee33d450858214c3d4bd4823499c2ddd313bfe5');assert.equal(result.transform.restored.sha256,'71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063');assert.equal(result.transform.comparison.comparedValues,128);assert.equal(result.transform.comparison.passed,true);
  assert.ok(result.trace.manager.sourceReceipts.some(s=>s.path==='docs/shared/ai-connection/queue.mjs'&&s.sha256.length===64));assert.ok(result.sourceReceipts.some(s=>s.sourceRef.path==='docs/shared/diffusion-models/api/build-info.mjs'));
  assert.equal(result.trace.referenceCatalog.sourceRef.commit,'6dae9a6fac3e9ad29ea941f22211edbe4aa894ad');assert.equal(result.trace.manager.commit,null);
  assert.deepEqual(result.packages.map(p=>[p.stage,p.status]),[['received-raw-mean','complete'],['owner-restored-mean','complete'],['received-owner-rgb','complete']]);
  assert.equal(result.normalizedCapture.mode,'copy');assert.equal(result.normalizedCapture.normalization,'wan21-comfy-f32-v1');assert.equal(result.normalizedPackageGate.code,'NATIVE_METADATA_MISMATCH');assert.equal(result.normalizedPackageGate.fieldPath,'descriptor.json/native/metadata/normalization');assert.equal(result.normalizedPackageGate.filesWritten,0);
  assert.equal(result.packages[2].scope,'received-owner-rgb-save-read-only');assert.equal(result.cache.hit,true);assert.equal(result.resources.kernelDisposed,true);assert.equal(result.resources.storeEntries,0);assert.equal(result.resources.cacheRetainedBytes,0);assert.equal(result.resources.cacheReleaseCount,1);
  assert.ok(result.queue.invocations.every(i=>i.originalTerminal&&i.resourceReleased&&i.reusable));assert.ok(result.blockedEdges.some(e=>e.edge==='same-profile-fresh-vae-decode'));
  assert.equal(result.edgeDecision.compatibility,'COMPATIBLE');assert.equal(result.edgeDecision.readiness.state,'blocked');assert.equal(result.edgeDecision.validation.find(v=>v.scope==='rect:owner-mean-roundtrip').result,'pass');assert.equal(result.edgeDecision.validation.find(v=>v.scope==='norm:N-ARTIFACT').result,'pass');assert.equal(result.gateOmissionDecision.compatibility,'COMPATIBLE');assert.equal(result.gateOmissionDecision.validation.find(v=>v.scope==='rect:gate-omitted-input-probe').result,'not-verified');
  assert.equal(result.gateOmissionDecision.validation.find(v=>v.scope==='norm:N-ARTIFACT').result,'pass');assert.deepEqual(result.gateOmissionDecision.readiness.reasons,['SCOPE_not-verified:rect:gate-omitted-input-probe']);
  const saved=JSON.parse(await readFile(join(directory,'result.json'),'utf8'));assert.deepEqual(saved,result);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('P2 explicit pre-abort rejects before the management route begins',{skip:!haveRoots},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'works-rect-cancel-'));try{const signal=AbortSignal.abort(),c=await load();await assert.rejects(()=>runner.runRectManagement({candidate:c,outputDirectory:directory,managerCommit:'28596717182e48aeb23c719c51b6e593edf4e496',signal}),e=>e.name==='AbortError');}finally{await rm(directory,{recursive:true,force:true});}
});
test('P2 candidate receipt identities and fixed gates cannot be mutated by a caller',{skip:!haveRoots},async()=>{
 const c=await load();assert.throws(()=>{c.gates.meanRoundtrip=1;},TypeError);assert.throws(()=>{c.reference.normalized[0]=123;},TypeError);assert.throws(()=>{c.pins.diffusion.commit='a'.repeat(40);},TypeError);
});
test('P2 rejects candidate source-byte modification before native import',{skip:!haveRoots},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'works-rect-bad-source-'));try{const file=join(directory,'docs/shared/diffusion-models/api/build-info.mjs');await mkdir(dirname(file),{recursive:true});await writeFile(file,'throw Error("must not execute");');await assert.rejects(()=>runner.loadRectCandidate({diffusionRoot:directory,vaeRoot:process.env.WORKS_RECT_VAE_ROOT}),e=>e.code==='CANDIDATE_BYTES_MISMATCH');}finally{await rm(directory,{recursive:true,force:true});}
});
test('P2 metadata-only duplicate frame/time probe survives owner Rect and owned capture without changing received input',{skip:!haveRoots},async()=>{
 const c=await load(),before=structuredClone(c.native.context),owner=await import(pathToFileURL(join(process.env.WORKS_RECT_DIFFUSION_ROOT,'docs/shared/diffusion-models/latent-space/latent-space.mjs')).href),kernel=await owner.createLatentSpace(new Uint8Array(await readFile(join(process.env.WORKS_RECT_DIFFUSION_ROOT,'docs/shared/diffusion-models/latent-space/build/latent-space.wasm'))));
 const store=createOwnedArtifactStore();try{
  const context={...before,sourceFrameIndices:[4,2,2,0],sourceFrameTimesSeconds:[.4,.2,.2,0]},expectedContext=structuredClone(context),input={...c.native,data:new Float32Array(c.native.data),context},output=kernel.restoreRawMean(kernel.normalizeRawMean(input));
  const descriptor={contractVersion:'works-module-contract/1.0-draft.1',artifactId:'probe:rect-context',kind:'tensor',native:{schemaId:'probe:native',schemaVersion:'1',payloadRef:'pending',metadata:{}},semantics:{schemaId:'probe:raw',schemaVersion:'1',spaceId:'raw'},profileRef:'wan21-raw-f32-1x16x32',tensor:{dtype:'float32',shape:[1,16,1,2,4],axes:['N','C','T','H','W'],nativeMeaning:'raw-posterior-mean',dataRef:'pending'},provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[]},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:'probe:owner',mode:'copy'},extensions:{'future:optional':{schemaId:'future:optional',schemaVersion:'999',requiredForUse:false,data:{order:[2,1,2]}}}};
  const handle=captureNativeTensor({tensor:output,descriptor,store,registry:{schemas:[{schemaId:'probe:native',schemaVersion:'1',g1cMetadata:true},{schemaId:'probe:raw',schemaVersion:'1',nativeMeanings:['raw-posterior-mean']}],roles:[]}});
  input.context.sourceFrameIndices[0]=999;assert.deepEqual(restoreNativeTensor(handle,store).context,expectedContext);assert.deepEqual(handle.descriptor.lineage.sourceFrames[0].indices,[4,2,2,0]);assert.deepEqual(handle.descriptor.lineage.sourceFrames[0].timesSeconds,[.4,.2,.2,0]);assert.deepEqual(handle.descriptor.extensions['future:optional'].data.order,[2,1,2]);assert.deepEqual(c.native.context,before);
 }finally{kernel.dispose();store.clear();}
});

// Adopted management codec/E4 -> owner Hike restore -> exact required Rect input.
// No model math is implemented here. All transformations belong to Diffusion.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const {values:q}=parseArgs({options:{'manager-root':{type:'string'},'diffusion-root':{type:'string'},output:{type:'string'}}});
for(const k of ['manager-root','diffusion-root','output'])assert.ok(q[k],`Explicit --${k} required`);
const out=resolve(q.output),pins=JSON.parse(await readFile(join(ROOT,'development/inference/p2-p3-acceptance/P2-SOURCES.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const rawBytes=t=>new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength);
const imp=(root,p)=>import(pathToFileURL(join(root,p)).href);
const result={scope:'New adopted-codec Rect mean persistence and owner restore; no VAE inference here',passed:false,sources:pins,steps:[],generationReady:false,generatedSampleAccepted:false};
await mkdir(out); // Fresh evidence only.
for(const [owner,root] of [['manager',q['manager-root']],['diffusion',q['diffusion-root']]]){
 for(const f of pins[owner].files){const b=await readFile(join(root,f.path));assert.equal(b.length,f.bytes);assert.equal(sha(b),f.sha256,`Fixed ${owner} source ${f.path}`);}
}
const {canonicalBytes}=await imp(q['manager-root'],'docs/shared/ai-connection/canonical.mjs');
const artifacts=await imp(q['manager-root'],'docs/shared/ai-connection/adapters/artifacts.mjs');
const pkg=await imp(q['manager-root'],'docs/shared/ai-connection/package.mjs');
const adopted=await imp(q['manager-root'],'docs/shared/ai-connection/codecs/wktensor.mjs');
const codecProof=await adopted.verifyAdoptedWktensorSource(new Uint8Array(await readFile(join(q['manager-root'],adopted.ADOPTED_WKTENSOR_DEPLOYMENT_PATH))));
const codec=adopted.createAdoptedWktensorCodec();
assert.equal(codec.sourceRef.commit,pins.codec.commit);assert.equal(codecProof.sha256,pins.codec.sha256);
const inputBytes=new Uint8Array(await readFile(join(ROOT,pins.rawInput.path)));
assert.equal(sha(inputBytes),pins.rawInput.sha256);
const original=await codec.decode(inputBytes);assert.equal(sha(rawBytes(original)),pins.rawInput.payloadSha256);
assert.deepEqual(original.shape,[1,16,1,2,4]);assert.equal(original.meaning,'raw-posterior-mean');
let store=artifacts.createOwnedArtifactStore(),space;
const traceId='P2:joint:restored-rect:20261101';
async function persist(name,tensor){
 const id=`P2:joint:${name}`,stepId=`${traceId}:${name}`,meaning=tensor.meaning;
 const semantics={schemaId:`P2:joint:${meaning}`,schemaVersion:'1',spaceId:meaning};
 const registry={schemas:[{schemaId:'P2:joint:g1c',schemaVersion:'1',g1cMetadata:true},{...semantics,nativeMeanings:[meaning]}],roles:[],codecs:[codec]};
 const descriptor={contractVersion:'works-module-contract/1.0-draft.1',artifactId:id,kind:'tensor',native:{schemaId:'P2:joint:g1c',schemaVersion:'1',payloadRef:'pending',metadata:{}},semantics,
  profileRef:'wan21-raw-f32-1x16x32',tensor:{dtype:tensor.dtype,shape:[...tensor.shape],axes:['N','C','T','H','W'],nativeMeaning:meaning,dataRef:'pending'},
  provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[stepId]},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:'P2:joint:manager',mode:'copy'},extensions:{}};
 const evidence={schemaVersion:1,artifactId:id,records:[{evidenceId:`${stepId}:evidence`,data:{diffusionSource:pins.diffusion.commit,codecSource:codec.sourceRef,input:pins.rawInput,payloadSha256:sha(rawBytes(tensor)),newOwnerNumericalExecution:true,neuralInference:false}}]};
 const trace={schemaVersion:1,artifactId:id,records:[{traceId:stepId,data:{managerSource:pins.manager.commit,meaning,normalization:tensor.normalization??null,profile:'wan21-raw-f32-1x16x32',rootTraceId:traceId}}]};
 const handle=artifacts.captureNativeTensor({tensor,response:{tensor,evidence},descriptor,store,registry});
 try{
  assert.deepEqual(artifacts.restoreNativeTensor(handle,store),tensor);
  const d=handle.descriptor,binary=await codec.encode(tensor),kinds={'native.wktensor':'native','descriptor.json':'descriptor','evidence.json':'evidence','trace.json':'trace','snapshot.json':'snapshot','extensions.json':'extensions'};
  const assets=new Map([['native.wktensor',binary],['descriptor.json',canonicalBytes(d)],['evidence.json',canonicalBytes(evidence)],['trace.json',canonicalBytes(trace)],['snapshot.json',canonicalBytes(null)],['extensions.json',canonicalBytes(d.extensions)]]);
  assert.equal(artifacts.exportBinaryAssets(d,store).size,0);
  const manifest={packageVersion:pkg.PACKAGE_VERSION,packageId:id,artifacts:[{artifactId:id,nativePath:'native.wktensor',descriptorPath:'descriptor.json',evidencePath:'evidence.json',tracePath:'trace.json',snapshotPath:'snapshot.json',extensionsPath:'extensions.json',codec:{codecId:codec.codecId,codecVersion:codec.codecVersion,sourceRef:codec.sourceRef}}],payloadBindings:[{ref:d.native.payloadRef,artifactId:id,nativePath:'native.wktensor',kind:'decoded-tensor-data'}],files:Object.entries(kinds).map(([path,kind])=>({path,kind,required:true})),extensions:{}};
  const dir=join(out,name);await mkdir(dir);
  const receipt=await pkg.writeArtifactPackage(manifest,assets,{registry,write:(path,b)=>writeFile(join(dir,path),b,{flag:'wx'})});
  const recovered=await pkg.readArtifactPackage({async read(path){try{return new Uint8Array(await readFile(join(dir,path)));}catch(e){if(e.code==='ENOENT')return null;throw e;}}},registry);
  assert.equal(recovered.status,'complete');const t=recovered.artifacts[0].restoredNative;
  assert.deepEqual(t.data,tensor.data);assert.deepEqual(t.context,tensor.context);assert.equal(t.modelSha256,tensor.modelSha256);assert.equal(t.normalization,tensor.normalization);
  result.steps.push({name,shape:t.shape,meaning:t.meaning,normalization:t.normalization??null,modelSha256:t.modelSha256,context:t.context,all128Exact:true,receipt,fileSha256:sha(binary),payloadSha256:sha(rawBytes(t))});
  return {tensor:t,bytes:binary};
 }finally{artifacts.releaseArtifactHandle(handle,store);}
}
try{
 const {createLatentSpace}=await imp(q['diffusion-root'],'docs/shared/diffusion-models/latent-space/latent-space.mjs');
 space=await createLatentSpace(new Uint8Array(await readFile(join(q['diffusion-root'],'docs/shared/diffusion-models/latent-space/build/latent-space.wasm'))));
 const normalized=space.normalizeRawMean(original);
 assert.equal(normalized.normalization,'wan21-comfy-f32-v1');
 assert.equal(sha(rawBytes(normalized)),pins.expectedNormalizedPayloadSha256);
 const recovered=await persist('normalized',normalized);
 const restored=space.restoreRawMean(recovered.tensor);
 assert.equal(restored.meaning,'raw-posterior-mean');assert.equal(restored.normalization,undefined);
 let maxAbs=0;for(let i=0;i<128;i++)maxAbs=Math.max(maxAbs,Math.abs(restored.data[i]-original.data[i]));
 assert.ok(maxAbs<=2e-6,'Predeclared Rect mean roundtrip gate');
 const raw=await persist('restored',restored);
 assert.equal(sha(rawBytes(raw.tensor)),pins.restoredInput.payloadSha256);
 assert.equal(sha(raw.bytes),pins.restoredInput.sha256,'Same original required restored-mean file, not just same shape');
 await writeFile(join(out,'restored.wktensor'),raw.bytes,{flag:'wx'});
 result.ownerTransform={normalizationOwner:'diffusion_models',operations:['normalizeRawMean','restoreRawMean'],maxAbs,gate:2e-6,stats:space.stats()};
 result.codecProof=codecProof;result.passed=true;
}catch(e){result.failure={name:e.name,message:e.message};process.exitCode=1;}
finally{space?.dispose();result.storeEntriesAfter=store.size;assert.equal(store.size,0);store.clear();result.hikeDisposed=true;await writeFile(join(out,'prepare-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({passed:result.passed,steps:result.steps.map(s=>({name:s.name,meaning:s.meaning,marker:s.normalization,payload:s.payloadSha256})),failure:result.failure??null}));

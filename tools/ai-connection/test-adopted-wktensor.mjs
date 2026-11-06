// Storage contract fixtures only; no VAE/LoRA execution or numerical acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';
const helperURL=new URL('../../docs/shared/ai-connection/codecs/wktensor.mjs',import.meta.url),vendorURL=new URL('../../docs/shared/ai-connection/codecs/tensor-2bdca59.mjs',import.meta.url),ROOT=new URL('../../',import.meta.url);
const SOURCE={repository:'Kushyameln01/kushyameln-works',commit:'2bdca59ea78580d4fe7a9d31a8de33209b64d029',path:'docs/shared/inference/tensor.mjs',sha256:'d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5'};
const DEPLOYMENT='docs/shared/ai-connection/codecs/tensor-2bdca59.mjs';
// Produced by the original 4c6992a7 codec (2c171a09 source). These synthetic
// unmarked bytes are fixed so ordinary tests require no external native checkout.
const LEGACY='V0tUU1IwMDEyAgAAeyJzY2hlbWFWZXJzaW9uIjoxLCJkdHlwZSI6ImZsb2F0MzIiLCJzaGFwZSI6WzEsMSwxLDEsNF0sImxheW91dCI6Ik5DVEhXIiwibWVhbmluZyI6InJhdy1wb3N0ZXJpb3ItbWVhbiIsImJ5dGVPcmRlciI6ImxpdHRsZSIsImJ5dGVMZW5ndGgiOjE2LCJkYXRhU2hhMjU2IjoiZDBjYmViNTk1NTNmNTcxZGY0YThiMGNmY2QzZDY3MWEzMjBkYjU4OGRiMWVlZDI0MDM0NzE3NzA1ODk0NGIxNCIsIm1vZGVsU2hhMjU2IjoiYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYSIsImNvbnRleHQiOnsic2NoZW1hVmVyc2lvbiI6MSwiY29udGV4dElkIjoiZml4dHVyZTpsZWdhY3kiLCJpbnB1dElkIjoiZml4dHVyZTppbnB1dCIsImlucHV0U2hhMjU2IjoiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYiIsInNsb3RJZCI6ImZpeHR1cmU6c2xvdCIsInNvdXJjZUZyYW1lSW5kaWNlcyI6WzMsMSwxXSwic291cmNlRnJhbWVUaW1lc1NlY29uZHMiOlswLjMsMC4xLDAuMV19fQAAgL8AAAAAAACAPgAAgD8=';
const tensor=()=>({dtype:'float32',shape:[1,1,1,1,4],layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:'a'.repeat(64),context:{schemaVersion:1,contextId:'fixture:legacy',inputId:'fixture:input',inputSha256:'b'.repeat(64),slotId:'fixture:slot',sourceFrameIndices:[3,1,1],sourceFrameTimesSeconds:[.3,.1,.1]},data:new Float32Array([-1,0,.25,1])});

test('adopted codec exposes the frozen exact owner source through the central and public adapter APIs',async()=>{
 const h=await import(helperURL),publicAPI=await import('../../docs/shared/ai-connection/adapters/index.mjs'),native=await import(vendorURL),codec=h.createAdoptedWktensorCodec();
 assert.deepEqual(h.ADOPTED_WKTENSOR_SOURCE,SOURCE);assert.equal(h.ADOPTED_WKTENSOR_DEPLOYMENT_PATH,DEPLOYMENT);assert.equal(h.ADOPTED_WKTENSOR_BYTE_LENGTH,8256);
 assert.equal(Object.isFrozen(h.ADOPTED_WKTENSOR_SOURCE),true);assert.equal(Object.isFrozen(codec),true);assert.equal(codec.sourceRef,h.ADOPTED_WKTENSOR_SOURCE);assert.equal(codec.codecId,'works:wktensor');assert.equal(codec.codecVersion,'WKTSR001/schemaVersion1');assert.equal(codec.encode,native.encodeTensor);assert.equal(codec.decode,native.decodeTensor);
 for(const key of ['ADOPTED_WKTENSOR_SOURCE','ADOPTED_WKTENSOR_DEPLOYMENT_PATH','ADOPTED_WKTENSOR_BYTE_LENGTH','createAdoptedWktensorCodec','verifyAdoptedWktensorSource'])assert.equal(publicAPI[key],h[key]);
});
test('bundled source and its proof match all bytes of the original full Git object',async()=>{
 const h=await import(helperURL),bytes=new Uint8Array(await readFile(vendorURL)),original=spawnSync('git',['show',`${SOURCE.commit}:${SOURCE.path}`],{cwd:ROOT,maxBuffer:1024*1024});
 assert.equal(original.status,0);assert.deepEqual(bytes,new Uint8Array(original.stdout));assert.equal(await sha256Bytes(bytes),SOURCE.sha256);assert.equal(bytes.byteLength,8256);
 const proof=await h.verifyAdoptedWktensorSource(bytes);assert.equal(proof.verified,true);assert.deepEqual(proof.sourceRef,SOURCE);assert.equal(proof.deploymentPath,DEPLOYMENT);assert.equal(proof.byteLength,8256);assert.equal(proof.sha256,SOURCE.sha256);assert.equal(Object.isFrozen(proof),true);
});
test('normalized mean storage retains the marker and owns payload/context before asynchronous hashing',async()=>{
 const {createAdoptedWktensorCodec}=await import(helperURL),codec=createAdoptedWktensorCodec(),t={...tensor(),meaning:'wan21-normalized-posterior-mean:v1',normalization:'wan21-comfy-f32-v1'},expected=structuredClone(t),writing=codec.encode(t);
 t.normalization='caller-changed';t.data.fill(99);t.context.sourceFrameIndices.reverse();
 const restored=await codec.decode(await writing);assert.equal(restored.normalization,expected.normalization);assert.equal(restored.meaning,expected.meaning);assert.deepEqual(restored.data,expected.data);assert.deepEqual(restored.context,expected.context);
});
test('legacy unmarked storage reads unchanged and new encoding retains byte-for-byte compatibility',async()=>{
 const {createAdoptedWktensorCodec}=await import(helperURL),codec=createAdoptedWktensorCodec(),bytes=new Uint8Array(Buffer.from(LEGACY,'base64'));
 assert.equal(bytes.byteLength,590);assert.equal(await sha256Bytes(bytes),'49f0c06e4a28a36b9fd25e692280dd79bb40e9bbe06813c02c25536a8e2ef0f2');assert.deepEqual(await codec.encode(tensor()),bytes);
 const decoded=await codec.decode(bytes);assert.equal(decoded.normalization,undefined);assert.equal(decoded.meaning,'raw-posterior-mean');assert.deepEqual(decoded.data,tensor().data);assert.deepEqual(decoded.context,tensor().context);
});
test('source verification rejects replacement bytes, truncation and invalid inputs',async()=>{
 const h=await import(helperURL),bytes=new Uint8Array(await readFile(vendorURL)),changed=new Uint8Array(bytes);changed[100]^=1;
 for(const value of [changed,bytes.subarray(1),new Uint8Array(bytes.length+1),null,'not source bytes'])await assert.rejects(h.verifyAdoptedWktensorSource(value),{code:'CODEC_SOURCE_MISMATCH'});
 const input=new Uint8Array(bytes),pending=h.verifyAdoptedWktensorSource(input);input.fill(0);assert.equal((await pending).verified,true,'Verification owns bytes before its digest await');
 assert.equal((await h.verifyAdoptedWktensorSource(bytes.buffer)).verified,true);
});
test('native metadata guards still reject contradictory normalization markers',async()=>{
 const codec=(await import(helperURL)).createAdoptedWktensorCodec();
 for(const value of [{...tensor(),normalization:'wan21-comfy-f32-v1'},{...tensor(),meaning:'wan21-normalized-posterior-mean:v1',normalization:'other-rule'}])await assert.rejects(codec.encode(value),/normalization marker/);
});
test('adopted marked bytes complete E4 readback while marker loss still fails the native metadata guard',async()=>{
 const {canonicalBytes}=await import('../../docs/shared/ai-connection/canonical.mjs'),{PACKAGE_VERSION,writeArtifactPackage,readArtifactPackage}=await import('../../docs/shared/ai-connection/package.mjs'),{createOwnedArtifactStore,captureNativeTensor}=await import('../../docs/shared/ai-connection/adapters/artifacts.mjs');
 const codec=(await import(helperURL)).createAdoptedWktensorCodec(),t={...tensor(),meaning:'wan21-normalized-posterior-mean:v1',normalization:'wan21-comfy-f32-v1'},store=createOwnedArtifactStore();
 const registry={schemas:[{schemaId:'fixture:codec-native',schemaVersion:'1',g1cMetadata:true},{schemaId:'fixture:codec-normalized',schemaVersion:'1',nativeMeanings:[t.meaning]}],roles:[],codecs:[codec]};
 const skeleton={contractVersion:'works-module-contract/1.0-draft.1',artifactId:'fixture:marked-mean',kind:'tensor',native:{schemaId:'fixture:codec-native',schemaVersion:'1',payloadRef:'pending',metadata:{}},semantics:{schemaId:'fixture:codec-normalized',schemaVersion:'1',spaceId:t.meaning,unit:'native-f32-value',normalization:t.normalization},profileRef:'fixture:storage-only',tensor:{dtype:t.dtype,shape:t.shape,axes:['N','C','T','H','W'],nativeMeaning:t.meaning,dataRef:'pending'},provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[]},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:'fixture:storage-owner',mode:'copy'},extensions:{}};
 try{
  const handle=captureNativeTensor({tensor:t,descriptor:skeleton,store,registry}),d=handle.descriptor,native=await codec.encode(t),artifactId=d.artifactId;
  const fileKinds={'native.wktensor':'native','descriptor.json':'descriptor','evidence.json':'evidence','trace.json':'trace','snapshot.json':'snapshot','extensions.json':'extensions'};
  const manifest={packageVersion:PACKAGE_VERSION,packageId:'fixture:adopted-marker-package',artifacts:[{artifactId,nativePath:'native.wktensor',descriptorPath:'descriptor.json',evidencePath:'evidence.json',tracePath:'trace.json',snapshotPath:'snapshot.json',extensionsPath:'extensions.json',codec:{codecId:codec.codecId,codecVersion:codec.codecVersion,sourceRef:codec.sourceRef}}],payloadBindings:[{ref:d.native.payloadRef,artifactId,nativePath:'native.wktensor',kind:'decoded-tensor-data'}],files:Object.entries(fileKinds).map(([path,kind])=>({path,kind,required:true})),extensions:{}};
  const assets=new Map([['native.wktensor',native],['descriptor.json',canonicalBytes(d)],['evidence.json',canonicalBytes({schemaVersion:1,artifactId,records:[{evidenceId:'fixture:codec-storage',data:{scope:'synthetic-codec-storage-only',modelInference:false,generationReady:false}}]})],['trace.json',canonicalBytes({schemaVersion:1,artifactId,records:[]})],['snapshot.json',canonicalBytes(null)],['extensions.json',canonicalBytes(d.extensions)]]),saved=new Map();
  await writeArtifactPackage(manifest,assets,{registry,write:async(path,bytes)=>saved.set(path,new Uint8Array(bytes))});const readback=await readArtifactPackage({read:async path=>saved.get(path)??null},registry);
  assert.equal(readback.status,'complete');assert.equal(saved.size,8);assert.equal(readback.artifacts[0].native.normalization,t.normalization);assert.deepEqual(readback.artifacts[0].native.context,t.context);assert.deepEqual(readback.artifacts[0].native.data,t.data);assert.deepEqual(readback.manifest.artifacts[0].codec.sourceRef,SOURCE);
  const length=new DataView(native.buffer,native.byteOffset,native.byteLength).getUint32(8,true),metadata=JSON.parse(new TextDecoder().decode(native.subarray(12,12+length)));delete metadata.normalization;
  const header=new TextEncoder().encode(JSON.stringify(metadata)),payload=native.subarray(12+length),missing=new Uint8Array(12+header.length+payload.length);missing.set(native.subarray(0,8));new DataView(missing.buffer).setUint32(8,header.length,true);missing.set(header,12);missing.set(payload,12+header.length);assets.set('native.wktensor',missing);
  let writes=0;await assert.rejects(writeArtifactPackage(manifest,assets,{registry,write:async()=>{writes++;}}),e=>e.code==='NATIVE_METADATA_MISMATCH'&&e.fieldPath==='descriptor.json/native/metadata/normalization');assert.equal(writes,0);
 }finally{store.clear();}
});

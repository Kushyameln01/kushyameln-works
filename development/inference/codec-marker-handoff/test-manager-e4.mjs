#!/usr/bin/env node
// Bounded actual-management persistence check. Recorded values only: no model,
// normalizer, numerical oracle or native executor is imported or invoked.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../../..');
const SOURCE_MANIFEST_SHA='357526ee26a65555e04aadf42ef873ff045e1aae87fbb5cf1fc8c0280eeb7efa';
const MANAGER_COMMIT='edda43f9ea69c5b3ab1af3c6eb82295f2912887c';
const CODEC_SHA='d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5';
const MARKER='wan21-comfy-f32-v1',MEANING='wan21-normalized-posterior-mean:v1';
const SHAPE=[1,16,1,2,4],ARTIFACT='works:marker:recorded-rect-normalized';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const dataBytes=data=>new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
const json=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const copy=structuredClone;
async function checked(path,record,label){
 const bytes=new Uint8Array(await readFile(path));
 assert.equal(bytes.length,record.bytes,`${label}: byte length`);
 assert.equal(sha(bytes),record.sha256??record.sourceRef?.sha256,`${label}: fixed SHA-256`);
 return bytes;
}
function diskSource(root){return {async read(path){try{return new Uint8Array(await readFile(join(root,path)));}catch(e){if(e.code==='ENOENT')return null;throw e;}}};}

export async function runManagerE4({managerRoot,output}){
 const started=performance.now();
 assert.ok(managerRoot&&output,'Explicit --manager-root and --output are required');
 managerRoot=resolve(managerRoot);output=resolve(output);
 await mkdir(output); // A fresh directory is required; never overwrite prior evidence.
 const result={schemaVersion:1,scope:'recorded Rect128 normalized-marker E2/E4 disk persistence only',
  passed:false,newNumericalExecution:false,normalizationComputed:false,neuralInference:false,
  generatedSampleAccepted:false,generationReady:false,snapshotAccepted:false,
  managerCommit:MANAGER_COMMIT,sourceChecks:[],checks:{},cleanup:{storeEntries:null}};
 let store,handle,releaseArtifactHandle;
 try{
  const sourceManifestBytes=new Uint8Array(await readFile(join(HERE,'E4-SOURCES.json')));
  assert.equal(sha(sourceManifestBytes),SOURCE_MANIFEST_SHA,'Source-manifest identity');
  const pins=json(sourceManifestBytes);assert.equal(pins.manager.commit,MANAGER_COMMIT);
  assert.equal(pins.codec.sourceRef.sha256,CODEC_SHA);
  for(const record of pins.manager.files){
   await checked(join(managerRoot,record.path),record,record.path);
   result.sourceChecks.push({...record,matched:true});
  }
  const codecBytes=await checked(join(REPO,pins.codec.sourceRef.path),pins.codec,'Candidate codec');
  const legacyBytes=await checked(join(REPO,pins.legacyCodec.path),pins.legacyCodec,'Historical codec');
  const referenceBytes=await checked(join(HERE,pins.recordedReference.path),pins.recordedReference,'Recorded owner reference');
  const rawBytes=await checked(join(REPO,pins.rawInput.path),pins.rawInput,'Historical raw input');
  result.sources={manager:pins.manager,codec:pins.codec,legacyCodec:pins.legacyCodec,
   recordedReference:pins.recordedReference,rawInput:pins.rawInput,sourceManifestSha256:sha(sourceManifestBytes)};
  // All five manager modules in the import closure have been checked before import.
  const load=path=>import(pathToFileURL(join(managerRoot,path)).href);
  const artifacts=await load('docs/shared/ai-connection/adapters/artifacts.mjs');
  const {canonicalBytes}=await load('docs/shared/ai-connection/canonical.mjs');
  const {CONTRACT_VERSION}=await load('docs/shared/ai-connection/descriptor.mjs');
  const {PACKAGE_VERSION,writeArtifactPackage,readArtifactPackage}=await load('docs/shared/ai-connection/package.mjs');
  const codec=await import(pathToFileURL(join(REPO,pins.codec.sourceRef.path)).href);
  const legacy=await import('data:text/javascript;base64,'+Buffer.from(legacyBytes).toString('base64'));
  assert.equal(sha(codecBytes),CODEC_SHA);
  const raw=await codec.decodeTensor(rawBytes),reference=json(referenceBytes);
  const rect=reference.outputs.find(x=>x.profile===pins.profileId);
  assert.ok(rect,'Exact Rect owner reference must exist');
  assert.deepEqual(raw.shape,SHAPE);assert.deepEqual(rect.shape,SHAPE);
  assert.equal(raw.meaning,'raw-posterior-mean');assert.equal(raw.modelSha256,pins.modelSha256);
  assert.equal(raw.data.length,128);assert.equal(rect.normalized.length,128);
  assert.deepEqual(Array.from(raw.data),rect.raw,'All128 actual input values equal recorded raw reference');
  assert.equal(sha(dataBytes(raw.data)),pins.rawInput.payloadSha256);
  assert.ok(raw.context,'Original raw context is required');
  const normalized={dtype:'float32',layout:'NCTHW',shape:[...SHAPE],meaning:MEANING,
   normalization:MARKER,modelSha256:raw.modelSha256,context:copy(raw.context),
   data:Float32Array.from(rect.normalized)};
  assert.deepEqual(Array.from(normalized.data),rect.normalized,'Recorded values are copied without numerical recomputation');
  assert.equal(sha(dataBytes(normalized.data)),pins.normalizedPayloadSha256);
  assert.equal(rect.normalizedSHA256,pins.normalizedPayloadSha256);
  result.input={rawFileSha256:sha(rawBytes),rawPayloadSha256:sha(dataBytes(raw.data)),
   normalizedPayloadSha256:sha(dataBytes(normalized.data)),count:128,shape:SHAPE,
   modelSha256:raw.modelSha256,context:copy(raw.context),
   metadataScope:'Original diagnostic context copied; no original-asset authentication inferred'};
  const semantics={schemaId:'works:marker:normalized-mean',schemaVersion:'1',spaceId:MEANING,
   unit:'native-f32-value',normalization:MARKER};
  const registry={schemas:[{schemaId:'works:marker:g1c-metadata',schemaVersion:'1',g1cMetadata:true},
   {...semantics,nativeMeanings:[MEANING]}],roles:[],codecs:[{codecId:'works:wktensor',
    codecVersion:'WKTSR001/schemaVersion1',sourceRef:copy(pins.codec.sourceRef),decode:codec.decodeTensor}]};
  const descriptor={contractVersion:CONTRACT_VERSION,artifactId:ARTIFACT,kind:'tensor',
   native:{schemaId:'works:marker:g1c-metadata',schemaVersion:'1',payloadRef:'pending',metadata:{}},
   semantics,profileRef:pins.profileId,tensor:{dtype:'float32',shape:SHAPE,axes:['N','C','T','H','W'],nativeMeaning:MEANING,dataRef:'pending'},
   provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:['works:marker:recorded-copy']},
   lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:'works:marker:e4-harness',mode:'copy'},extensions:{}};
  const evidence={schemaVersion:1,artifactId:ARTIFACT,records:[{evidenceId:'works:marker:recorded-owner-values',data:{
   reference:pins.recordedReference,rawInput:pins.rawInput,normalizedPayloadSha256:pins.normalizedPayloadSha256,
   count:128,newNumericalExecution:false,meaning:MEANING,normalization:MARKER}}]};
  const trace={schemaVersion:1,artifactId:ARTIFACT,records:[{traceId:'works:marker:recorded-copy',data:{
   managerCommit:MANAGER_COMMIT,codec:pins.codec.sourceRef,operation:'copy recorded normalized values -> E2 capture -> E4 save/read',
   sourceRawContext:copy(raw.context),normalizationComputed:false,neuralInference:false,generationReady:false}}]};
  store=artifacts.createOwnedArtifactStore();releaseArtifactHandle=artifacts.releaseArtifactHandle;
  handle=artifacts.captureNativeTensor({tensor:normalized,response:{tensor:normalized,evidence},descriptor,store,registry});
  assert.deepEqual(artifacts.restoreNativeTensor(handle,store),normalized,'Actual E2 owned capture/restore');
  assert.deepEqual(store.get(handle.responseRef).evidence,evidence);
  assert.equal(artifacts.exportBinaryAssets(handle.descriptor,store).size,0);
  const d=handle.descriptor;
  assert.equal(d.native.metadata.normalization,MARKER);assert.deepEqual(d.native.metadata.context,raw.context);
  const fileKinds={'native.wktensor':'native','descriptor.json':'descriptor','evidence.json':'evidence',
   'trace.json':'trace','snapshot.json':'snapshot','extensions.json':'extensions'};
  const assets=new Map([['native.wktensor',await codec.encodeTensor(normalized)],
   ['descriptor.json',canonicalBytes(d)],['evidence.json',canonicalBytes(evidence)],
   ['trace.json',canonicalBytes(trace)],['snapshot.json',canonicalBytes(null)],['extensions.json',canonicalBytes(d.extensions)]]);
  const manifest={packageVersion:PACKAGE_VERSION,packageId:'works:marker:e4-recorded-rect128',artifacts:[{
   artifactId:ARTIFACT,nativePath:'native.wktensor',descriptorPath:'descriptor.json',evidencePath:'evidence.json',
   tracePath:'trace.json',snapshotPath:'snapshot.json',extensionsPath:'extensions.json',
   codec:{codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef:copy(pins.codec.sourceRef)}}],
   payloadBindings:[{ref:d.native.payloadRef,artifactId:ARTIFACT,nativePath:'native.wktensor',kind:'decoded-tensor-data'}],
   files:Object.entries(fileKinds).map(([path,kind])=>({path,kind,required:true})),extensions:{}};
  const packageRoot=join(output,'normalized-package');await mkdir(packageRoot);
  let written=0;
  const receipt=await writeArtifactPackage(manifest,assets,{registry,async write(path,bytes){
   await writeFile(join(packageRoot,path),bytes,{flag:'wx'});written++;
  }});
  const readback=await readArtifactPackage(diskSource(packageRoot),registry);
  assert.equal(readback.status,'complete');assert.deepEqual(readback.receipt,receipt);
  const restored=readback.artifacts[0];
  for(const tensor of [restored.native,restored.restoredNative]){
   assert.equal(tensor.normalization,MARKER);assert.equal(tensor.meaning,MEANING);
   assert.deepEqual(tensor.shape,SHAPE);assert.equal(tensor.modelSha256,raw.modelSha256);
   assert.deepEqual(tensor.context,raw.context);assert.deepEqual(tensor.data,normalized.data);
   assert.equal(sha(dataBytes(tensor.data)),pins.normalizedPayloadSha256);
  }
  assert.deepEqual(restored.descriptor,d);assert.deepEqual(restored.evidence,evidence);assert.deepEqual(restored.trace,trace);
  assert.equal(restored.snapshot,null);assert.deepEqual(restored.extensions,d.extensions);
  for(const [path,bytes] of assets)assert.deepEqual(readback.assets.get(path),bytes,`${path}: byte-exact disk readback`);
  result.checks.positive={status:readback.status,all128Exact:true,markerPreserved:true,modelContextDescriptorEvidenceTracePreserved:true,
   filesWritten:written,receipt,nativeFileSha256:sha(assets.get('native.wktensor')),payloadSha256:pins.normalizedPayloadSha256};

  const oldRegistry={...registry,codecs:[{codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',
   sourceRef:copy(pins.legacyCodec.originalSourceRef),decode:legacy.decodeTensor}]};
  const mismatch=await readArtifactPackage(diskSource(packageRoot),oldRegistry);
  assert.equal(mismatch.status,'unverified');
  assert.ok(mismatch.issues.some(i=>i.code==='NATIVE_CODEC_UNVERIFIED'));
  result.checks.oldRegistry={status:mismatch.status,issues:mismatch.issues};

  const oldAssets=new Map(assets);oldAssets.set('native.wktensor',await legacy.encodeTensor(normalized));
  const oldManifest=copy(manifest);oldManifest.artifacts[0].codec.sourceRef=copy(pins.legacyCodec.originalSourceRef);
  const rejectedRoot=join(output,'old-writer-rejected');await mkdir(rejectedRoot);let rejectedWrites=0,error;
  try{await writeArtifactPackage(oldManifest,oldAssets,{registry:oldRegistry,async write(path,bytes){
   rejectedWrites++;await writeFile(join(rejectedRoot,path),bytes,{flag:'wx'});
  }});}catch(e){error=e;}
  assert.equal(error?.code,'NATIVE_METADATA_MISMATCH');
  assert.equal(error.fieldPath,'descriptor.json/native/metadata/normalization');
  assert.equal(rejectedWrites,0);assert.deepEqual(await readdir(rejectedRoot),[]);
  result.checks.oldWriter={rejected:true,code:error.code,fieldPath:error.fieldPath,filesWritten:0};
  result.passed=true;
 }catch(error){result.failure={name:error.name,message:error.message,stack:error.stack};}
 finally{
  try{
   if(handle){releaseArtifactHandle(handle,store);handle=null;}
   if(store){result.cleanup.storeEntries=store.size;assert.equal(store.size,0,'All E2 owned references released');}
  }catch(error){result.passed=false;result.cleanup.failure={name:error.name,message:error.message};}
  result.cleanup.explicitWorkersCreated=0;result.cleanup.neuralSessionsCreated=0;
  result.resources={scope:'This parent-launched Node helper only; process-wide maxRSS includes runtime/imports. No model execution or child-process lifecycle trial.',
   helperPid:process.pid,elapsedSeconds:(performance.now()-started)/1000,
   maxRSSBytes:process.resourceUsage().maxRSS*1024,maxRSSUnitConversion:'Node resourceUsage.maxRSS KiB multiplied by1024',
   childProcessesStarted:0,childProcessCountBasis:'No subprocess spawn/fork API is called by this harness; not host-wide process sampling',
   explicitWorkersCreated:0,neuralSessionsCreated:0,cancellationExercised:false,
   workerSessionCancellationScope:'Not started; outside this codec/persistence check'};
  await writeFile(join(output,'results.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 }
 return result;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);assert.equal(args.length,4,'Usage: node test-manager-e4.mjs --manager-root <fixed-edda-root> --output <fresh-directory>');
 const options={};for(let i=0;i<args.length;i+=2){assert.ok(['--manager-root','--output'].includes(args[i]));assert.equal(options[args[i]],undefined);options[args[i]]=args[i+1];}
 const result=await runManagerE4({managerRoot:options['--manager-root'],output:options['--output']});
 process.stdout.write(JSON.stringify({passed:result.passed,checks:result.checks,cleanup:result.cleanup,resources:result.resources,failure:result.failure??null},null,2)+'\n');
 if(!result.passed)process.exitCode=1;
}

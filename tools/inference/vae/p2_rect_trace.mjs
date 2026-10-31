// Candidate diagnostic only: actual manager modules, owner Hike, explicit G1C.
// No management norm engine or model-specific arithmetic is implemented here.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {encodeTensor,decodeTensor} from '../../../docs/shared/inference/tensor.mjs';
import {validateVaeRequest} from '../../../docs/shared/inference/vae.mjs';

const {values:q}=parseArgs({options:{phase:{type:'string'},'manager-root':{type:'string'},'diffusion-root':{type:'string'},output:{type:'string'}}});
assert.ok(['prepare','finish'].includes(q.phase)&&q['manager-root']&&q['diffusion-root']&&q.output,'Explicit phase, owner roots and output required');
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),out=resolve(q.output);
const declaration=join(repo,'development/inference/reference-adoption/p2');
const bytes=async p=>new Uint8Array(await readFile(p));
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const payload=t=>sha(new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength));
const plan=await json(join(declaration,'acceptance-plan.json'));
const pins=await json(join(declaration,'source-pins.json'));
for(const [owner,root] of [['manager',q['manager-root']],['diffusion',q['diffusion-root']]])
 for(const f of pins[owner])assert.equal(sha(await bytes(join(root,f.path))),f.sha256,f.path);
assert.equal(sha(await bytes(join(repo,'docs/shared/inference/tensor.mjs'))),plan.codecSha256);
const ownerImport=p=>import(pathToFileURL(join(q['manager-root'],'docs/shared/ai-connection',p)).href);
const {canonicalBytes}=await ownerImport('canonical.mjs');
const {captureNativeTensor,restoreNativeTensor,releaseArtifactHandle,createOwnedArtifactStore}=await ownerImport('adapters/artifacts.mjs');
const {writeArtifactPackage,readArtifactPackage,PACKAGE_VERSION}=await ownerImport('package.mjs');
const {createInvocationQueue}=await ownerImport('queue.mjs');
const codec={codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef:{repository:'https://github.com/Kushyameln01/kushyameln-works',commit:plan.codecSourceCommit,path:'docs/shared/inference/tensor.mjs'}};
const registry={schemas:[{schemaId:'diagnostic:p2-g1c',schemaVersion:'1',g1cMetadata:true},
 ...['raw-posterior-mean','wan21-normalized-posterior-mean:v1','raw-decoder-rgb'].map(meaning=>({schemaId:`diagnostic:${meaning}`,schemaVersion:'1',nativeMeanings:[meaning]}))],roles:[],codecs:[{...codec,decode:decodeTensor}]};
const tracePath=join(out,'trace.json');
if(q.phase==='prepare')await mkdir(out,{recursive:false});
const trace=q.phase==='prepare'?{traceId:'P2-RECT-6dae-285967-5f880-855f435',plan,
 scope:'Candidate mean diagnostic chain; not management P1 adoption or generated sample',
 candidate:{managerCommit:pins.managerCommit,diffusionCommit:pins.diffusionCommit,vaeCommit:plan.vaeSourceCommit,codecCommit:plan.codecSourceCommit},
 p1Integrated:false,fullP2AdoptionAccepted:false,generationReady:false,steps:[],ownership:[],negativeChecks:[]}:await json(tracePath);
const writeTrace=()=>writeFile(tracePath,JSON.stringify(trace,null,2)+'\n');
const owned=createOwnedArtifactStore();
const queue=createInvocationQueue({resourceBindings:[{bindingId:'candidate-node',ownerId:'candidate-orchestrator',resourceGeneration:q.phase,
 cancel:async()=>({stopped:false}),afterTerminal:async()=>({reusable:true}),release:async()=>{}}]});
let sequence=0;
async function run(name,fn){const i=++sequence;return queue.enqueue({id:`${q.phase}-${name}`,requestId:`${q.phase}-${name}`,ownerId:'candidate-orchestrator',resourceBinding:'candidate-node',resourceGeneration:q.phase,revision:1,activeToken:`${q.phase}-${i}`},fn);}
async function packageTensor(stage,tensor,evidence,raw=null){
 const d={contractVersion:'works-module-contract/1.0-draft.1',artifactId:stage,kind:'tensor',
  native:{schemaId:'diagnostic:p2-g1c',schemaVersion:'1',payloadRef:'pending',metadata:{}},
  semantics:{schemaId:`diagnostic:${tensor.meaning}`,schemaVersion:'1',spaceId:tensor.meaning==='wan21-normalized-posterior-mean:v1'?'normalized':'raw'},
  tensor:{dtype:tensor.dtype,shape:tensor.shape,axes:['N','C','T','H','W'],nativeMeaning:tensor.meaning,dataRef:'pending'},
  provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[trace.traceId]},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,
  ownership:{ownerId:'candidate-orchestrator',mode:'copy'},extensions:{}};
 const h=captureNativeTensor({tensor,response:{tensor,evidence},descriptor:d,store:owned,registry});
 try{
  assert.deepEqual(restoreNativeTensor(h,owned),tensor);assert.deepEqual(owned.get(h.responseRef).evidence,evidence);
  const native=raw??await encodeTensor(tensor),encoded=await decodeTensor(native);assert.deepEqual(encoded.data,tensor.data);
  const sidecar={schemaVersion:1,artifactId:stage,records:[{evidenceId:`${stage}:evidence`,data:evidence}]};
  const traceSidecar={schemaVersion:1,artifactId:stage,records:[{traceId:trace.traceId,data:{candidate:trace.candidate,steps:trace.steps,scope:trace.scope}}]};
  const assets=new Map([['native.wktensor',native],['descriptor.json',canonicalBytes(h.descriptor)],['evidence.json',canonicalBytes(sidecar)],['trace.json',canonicalBytes(traceSidecar)],['snapshot.json',canonicalBytes(null)],['extensions.json',canonicalBytes({})]]);
  const manifest={packageVersion:PACKAGE_VERSION,packageId:`${trace.traceId}:${stage}`,files:[...assets.keys()].map(path=>({path,kind:path==='native.wktensor'?'native':path.split('.')[0],required:true})),
   payloadBindings:[{ref:h.descriptor.native.payloadRef,artifactId:stage,nativePath:'native.wktensor',kind:'decoded-tensor-data'}],
   artifacts:[{artifactId:stage,nativePath:'native.wktensor',descriptorPath:'descriptor.json',evidencePath:'evidence.json',tracePath:'trace.json',snapshotPath:'snapshot.json',extensionsPath:'extensions.json',codec}],extensions:{}};
  const dir=join(out,stage);await mkdir(dir);
  const sink={registry,write:async(path,b)=>writeFile(join(dir,path),b)};
  const source={read:async path=>{try{return await bytes(join(dir,path));}catch(e){if(e.code==='ENOENT')return null;throw e;}}};
  const receipt=await writeArtifactPackage(manifest,assets,sink),read=await readArtifactPackage(source,registry);
  assert.equal(read.status,'complete');
  // A newly encoded tensor also receives schema/byteOrder/dataSha256 headers.
  // Preserve every supplied field; do not require these codec headers absent.
  for(const [field,value] of Object.entries(tensor))assert.deepEqual(read.artifacts[0].restoredNative[field],value,`Readback field ${field}`);
  assert.deepEqual(read.artifacts[0].restoredEvidence,sidecar);assert.deepEqual(read.assets.get('native.wktensor'),native);
  trace.steps.push({operation:'management-capture-package-read',stage,managerCommit:pins.managerCommit,packageVersion:PACKAGE_VERSION,
   wholeFileSha256:sha(native),payloadSha256:payload(tensor),meaning:tensor.meaning,shape:tensor.shape,modelSha256:tensor.modelSha256,context:tensor.context,
   manifestSha256:receipt.manifestSha256,receiptPath:`${stage}/receipt.json`,packageStatus:read.status});
  await assert.rejects(()=>readArtifactPackage({read:async path=>path==='evidence.json'?null:source.read(path)},registry),e=>e.code==='REQUIRED_ASSET_MISSING');
  trace.negativeChecks.push({stage,missingEvidenceRejected:true});
  return read.artifacts[0].restoredNative;
 }finally{releaseArtifactHandle(h,owned);}
}
try{
 if(q.phase==='prepare'){
  let release;
  const barrier=run('cancel-barrier',()=>new Promise(r=>{release=r;}));
  await new Promise(r=>setImmediate(r));
  const cancelled={id:'cancel-before-owner',requestId:'cancel-before-owner',ownerId:'candidate-orchestrator',
   resourceBinding:'candidate-node',resourceGeneration:q.phase,revision:1,activeToken:'cancel-never-runs'};
  const pending=queue.enqueue(cancelled,()=>assert.fail('Queued cancelled owner operation ran')).then(()=>null,e=>e);
  try{
   const cancel=await queue.cancelInvocation(cancelled.id,{bindingId:cancelled.resourceBinding,ownerId:cancelled.ownerId,
    resourceGeneration:cancelled.resourceGeneration,requestId:cancelled.requestId,revision:cancelled.revision,activeToken:cancelled.activeToken});
   assert.equal(cancel.notStarted,true);assert.equal((await pending).code,'INVOCATION_CANCELLED');
   trace.negativeChecks.push({queuedCancelBeforeOwnerDispatch:true,receipt:cancel,scope:'No native operation or Hike call dispatched'});
  }finally{release();await barrier;}
  const originalBytes=await bytes(join(repo,'development/inference/e6/fixtures/api-recovery.wktensor'));
  assert.equal(sha(originalBytes),plan.sourceMeanFileSha256);
  const original=await decodeTensor(originalBytes);assert.equal(payload(original),plan.sourceMeanPayloadSha256);
  assert.deepEqual(original.shape,plan.latentShape);assert.equal(original.meaning,'raw-posterior-mean');
  trace.steps.push({operation:'encode',execution:'reused historical real VAE WASM evidence; not rerun',sourceCommit:plan.vaeSourceCommit,
   report:'development/inference/e6/browser-results.json',reportSha256:sha(await bytes(join(repo,'development/inference/e6/browser-results.json'))),
   outputFileSha256:sha(originalBytes),outputPayloadSha256:payload(original),profileId:plan.profileId});
  const input=await run('capture-raw',()=>packageTensor('input-raw',original,{historicalEncode:true,profileId:plan.profileId,sourceFileSha256:sha(originalBytes)},originalBytes));
  const {createLatentSpace}=await import(pathToFileURL(join(q['diffusion-root'],'docs/shared/diffusion-models/latent-space/latent-space.mjs')).href);
  const {requireWanRawLatent}=await import(pathToFileURL(join(q['diffusion-root'],'docs/shared/diffusion-models/tensor-interop.mjs')).href);
  const kernel=await createLatentSpace(await bytes(join(q['diffusion-root'],'docs/shared/diffusion-models/latent-space/build/latent-space.wasm')));
  try{
   assert.throws(()=>requireWanRawLatent(input),RangeError);trace.negativeChecks.push({same128LegacyF5GuardRejected:true});
   const before=structuredClone(input),normalized=await run('normalize',()=>kernel.normalizeRawMean(input));
   assert.deepEqual(input,before);assert.equal(normalized.meaning,'wan21-normalized-posterior-mean:v1');
   assert.equal(normalized.normalization,'wan21-comfy-f32-v1');assert.deepEqual(normalized.context,input.context);
   const manifest=await json(join(repo,'development/inference/e6/fixtures/bundle-manifest.json'));
   assert.throws(()=>validateVaeRequest({operation:'decode',tensor:normalized,manifest}),/meaning/);
   assert.throws(()=>validateVaeRequest({operation:'decode',tensor:{...input,shape:[1,16,2,2,2]},manifest}),/shape/);
   trace.negativeChecks.push({normalizedMeaningRejectedByRawDecoder:true,same128F5ShapeRejectedByRectDecoder:true});
   const owner=await json(join(declaration,'owner-rect-node-results.json')),reference=owner.outputs.find(x=>x.profile===plan.profileId);
   assert.equal(reference.fixtureFileSHA256,plan.sourceMeanFileSha256);assert.equal(payload(normalized),reference.normalizedSHA256);
   trace.steps.push({operation:'normalizeRawMean',owner:'diffusion_models',sourceCommit:pins.diffusionCommit,export:'NormalizeRawMeanRect',
    inputPayloadSha256:payload(input),outputPayloadSha256:payload(normalized),profileId:plan.profileId,normalization:'wan21-comfy-f32-v1',
    ownerOraclePayloadMatch:true,ownerReceipt:'owner-rect-node-results.json',stats:kernel.stats()});
   // P2 requires raw/RGB package boundaries. This pinned codec does not retain
   // the optional normalized marker, so do not claim an intermediate package.
   // Keep the owner's exact meaning/marker and owned array in memory instead.
   const normalizedRead=normalized;
   trace.normalizedIntermediate={storage:'owner-owned memory; payload hash and rule recorded in this trace',
    meaning:normalized.meaning,normalization:normalized.normalization,payloadSha256:payload(normalized),
    wktensorNormalizationMarkerPreserved:false,codecSha256:plan.codecSha256};
   const restored=await run('restore',()=>kernel.restoreRawMean(normalizedRead));assert.equal(restored.meaning,'raw-posterior-mean');
   assert.equal(restored.normalization,undefined);assert.deepEqual(restored.context,input.context);assert.equal(payload(restored),reference.restoredSHA256);
   let maxAbs=0;for(let i=0;i<input.data.length;i++)maxAbs=Math.max(maxAbs,Math.abs(input.data[i]-restored.data[i]));
   assert.ok(maxAbs<=plan.meanRoundtripGate.maxAbs);assert.deepEqual(input,before);
   trace.steps.push({operation:'restoreRawMean',owner:'diffusion_models',sourceCommit:pins.diffusionCommit,export:'RestoreRawMeanRect',
    inputPayloadSha256:payload(normalizedRead),outputPayloadSha256:payload(restored),count:128,maxAbs,gate:plan.meanRoundtripGate,
    ownerOraclePayloadMatch:true,stats:kernel.stats()});
   const raw=await run('capture-restored',()=>packageTensor('restored',restored,{ownerOperation:'restoreRawMean',sourceCommit:pins.diffusionCommit,normalizationAppliedByVae:false,profileId:plan.profileId}));
   await writeFile(join(out,'restored.wktensor'),await encodeTensor(raw));trace.hikeStats=kernel.stats();assert.equal(trace.hikeStats.calls,2);
  }finally{trace.hikeStats=kernel.stats();kernel.dispose();assert.throws(()=>kernel.stats(),/disposed/);trace.diffusionKernelDisposed=true;}
 }else{
  const acceptance=await json(join(out,'browser/acceptance-results.json'));
  assert.equal(acceptance.passed,true);assert.equal(acceptance.profileId,plan.profileId);
  assert.equal(acceptance.manifestSha256,plan.manifestSha256);assert.equal(acceptance.evidence.normalizationApplied,false);
  assert.equal(acceptance.input.payloadSha256,trace.steps.find(x=>x.operation==='restoreRawMean').outputPayloadSha256);
  const original=await decodeTensor(await bytes(join(out,'restored.wktensor')));
  const rgbBytes=await bytes(join(out,'browser/restore128-rect-rgb.wktensor')),rgb=await decodeTensor(rgbBytes);
  assert.deepEqual(rgb.shape,plan.rgbShape);assert.equal(rgb.meaning,'raw-decoder-rgb');assert.deepEqual(rgb.context,original.context);
  trace.steps.push({operation:'vae.decode',owner:'vae',profileId:plan.profileId,sourceCommit:plan.vaeSourceCommit,
   inputFileSha256:acceptance.input.fileSha256,inputPayloadSha256:acceptance.input.payloadSha256,outputFileSha256:sha(rgbBytes),outputPayloadSha256:payload(rgb),
   numeric:acceptance.numeric,evidence:acceptance.evidence,workerTracking:acceptance.workerTracking,normalizationApplied:false});
  await run('capture-rgb',()=>packageTensor('rgb',rgb,{nativeEvidence:acceptance.evidence,profileId:plan.profileId,
   inputFileSha256:acceptance.input.fileSha256,inputPayloadSha256:acceptance.input.payloadSha256,outputFileSha256:sha(rgbBytes),outputPayloadSha256:payload(rgb)},rgbBytes));
  trace.candidateDiagnosticPassed=true;trace.p1Blocker='Manager285 has no acquired reference-loader/norm-bindings runtime; full P2 adoption remains BLOCKED';
 }
 await queue.drain();assert.equal(owned.size,0);
 const beforeDispose=queue.inspect();const disposed=await queue.dispose();assert.deepEqual(disposed.quarantined,[]);
 trace.ownership.push({phase:q.phase,storeReferences:owned.size,queueState:beforeDispose,queueDisposed:disposed.disposed});
 await writeTrace();console.log(JSON.stringify({phase:q.phase,passed:true,steps:trace.steps.length,hikeCalls:trace.hikeStats?.calls,
  candidateDiagnosticPassed:trace.candidateDiagnosticPassed??false,fullP2AdoptionAccepted:false}));
}catch(error){
 trace.candidateDiagnosticPassed=false;trace.failure={message:error.message,code:error.code??null};await writeTrace();throw error;
}finally{owned.clear();await queue.dispose();}

// Actual manager P1 comparison of immutable owner receipts; no new NN result.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {decodeTensor,encodeTensor} from '../../../docs/shared/inference/tensor.mjs';
import {validateVaeRequest} from '../../../docs/shared/inference/vae.mjs';

const {values:args}=parseArgs({options:{'manager-root':{type:'string'},'diffusion-root':{type:'string'},bundle:{type:'string'},output:{type:'string'}}});
assert.ok(args['manager-root']&&args['diffusion-root']&&args.bundle&&args.output,'Explicit owner sources, existing bundle and fresh output required');
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),manager=resolve(args['manager-root']),out=resolve(args.output);
const data=join(repo,'development/inference/reference-adoption'),base=join(data,'p1-adoption');
const bytes=async path=>new Uint8Array(await readFile(path));
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const pins=await json(join(base,'source-pins.json'));
for(const file of pins.files)assert.equal(sha(await bytes(join(manager,file.path))),file.sha256,file.path);
for(const file of pins.nativeSources)assert.equal(sha(await bytes(join(repo,file.path))),file.sha256,file.path);
const diffusionPins=await json(join(data,'p2/source-pins.json'));
for(const file of diffusionPins.diffusion)assert.equal(sha(await bytes(join(args['diffusion-root'],file.path))),file.sha256,file.path);
const diffusionModule=await import(pathToFileURL(join(args['diffusion-root'],'docs/shared/diffusion-models/latent-space/latent-space.mjs')).href);
assert.equal(typeof diffusionModule.createLatentSpace,'function'); // No kernel instantiated.
const codecSha='4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b';
assert.equal(sha(await bytes(join(repo,'docs/shared/inference/tensor.mjs'))),codecSha);
const imp=path=>import(pathToFileURL(join(manager,'docs/shared/ai-connection',path)).href);
const {loadReferenceSet}=await imp('reference-loader.mjs'),{evaluateEdge}=await imp('compatibility.mjs');
const {createOwnedArtifactStore,captureNativeTensor,releaseArtifactHandle}=await imp('adapters/artifacts.mjs');
const {createInvocationQueue}=await imp('queue.mjs');
const {writeArtifactPackage,readArtifactPackage,PACKAGE_VERSION}=await imp('package.mjs');
const {canonicalBytes}=await imp('canonical.mjs');
const catalogPath='docs/shared/ai-connection/reference/catalog.v1.json';
const catalogBytes=await bytes(join(manager,catalogPath)),catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
const referenceSet=await loadReferenceSet({catalogBytes,files:new Map(await Promise.all(catalog.files.map(async f=>[f.path,await bytes(join(manager,f.path))]))),expectedCatalogSha256:pins.catalogSha256});
const previousTraceBytes=await bytes(join(data,'p2/run/trace.json'));
assert.equal(sha(previousTraceBytes),pins.priorTraceSha256);
const trace=JSON.parse(new TextDecoder().decode(previousTraceBytes));
const original=await json(join(data,'p2/run/browser/acceptance-results.json'));
assert.equal(original.passed,true);assert.equal(original.evidence.normalizationApplied,false);
const PROFILE='wan21-raw-f32-1x16x32',MODEL='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b';
const DIFF='5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3',VAE='855f435120f08eb9e818e51281fc26f0e2633829',CODEC='2c171a09ccda65c54899f322ae490f1bfcaac6fb';
const KERNEL='bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d';
const BUILD='diffusion-models/0.1+35b5ecdf924b13ccfcd08ec1eeaf840700dfc7c69acd168bbb39e72376542a20';
const src=(commit,path)=>({repository:'Kushyameln01/kushyameln-works',commit,path});
const manifestPath=join(resolve(args.bundle),'manifest.json'),manifestBytes=await bytes(manifestPath),manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
assert.equal(sha(manifestBytes),original.manifestSha256);assert.equal(manifest.profile.id,PROFILE);
const assetReceipts=[];
for(const [name,asset] of Object.entries(manifest.assets)){
 const path=resolve(args.bundle,asset.file);assert.equal(dirname(path),resolve(args.bundle));
 const digest=createHash('sha256');for await(const chunk of createReadStream(path))digest.update(chunk);
 assert.equal((await stat(path)).size,asset.bytes);assert.equal(digest.digest('hex'),asset.sha256,name);
 assetReceipts.push({name,file:asset.file,bytes:asset.bytes,sha256:asset.sha256,scope:'Current streamed asset integrity, no model load or execution'});
}
const rawBytes=await bytes(join(data,'p2/run/restored.wktensor')),rgbBytes=await bytes(join(data,'p2/run/browser/restore128-rect-rgb.wktensor'));
assert.equal(sha(rawBytes),original.input.fileSha256);assert.equal(sha(rgbBytes),original.numeric.fileSha256);
const raw=await decodeTensor(rawBytes),rgb=await decodeTensor(rgbBytes);
assert.equal(raw.dataSha256,original.input.payloadSha256);assert.equal(rgb.dataSha256,original.numeric.payloadSha256);
assert.equal(trace.steps.find(s=>s.operation==='restoreRawMean').outputPayloadSha256,raw.dataSha256);
assert.deepEqual(raw.context,rgb.context);assert.equal(raw.modelSha256,MODEL);assert.equal(rgb.modelSha256,MODEL);
const nativeGuard=validateVaeRequest({operation:'decode',tensor:raw,manifest});assert.equal(nativeGuard.profileId,PROFILE);
await mkdir(out,{recursive:false});
const store=createOwnedArtifactStore(),session=crypto.randomUUID(),handles=[],captures=[];
const queue=createInvocationQueue({resourceBindings:[{bindingId:'file-assessment',ownerId:'p1-assessment',resourceGeneration:session,cancel:async()=>({stopped:false}),afterTerminal:async()=>({reusable:true}),release:async()=>{}}]});
const codec={codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef:{repository:'https://github.com/Kushyameln01/kushyameln-works',commit:CODEC,path:'docs/shared/inference/tensor.mjs'}};
const registry={schemas:[{schemaId:'diagnostic:p1-g1c',schemaVersion:'1',g1cMetadata:true},
 ...['raw-posterior-mean','raw-decoder-rgb'].map(meaning=>({schemaId:`diagnostic:${meaning}`,schemaVersion:'1',nativeMeanings:[meaning],nativeAssertions:[{metadataPath:'/modelSha256',expected:MODEL}]}))],roles:['owner-evidence','native-input-contract','native-codec'],codecs:[{...codec,decode:decodeTensor}]};
async function capture(name,tensor,originalBytes){
 const id=`p1-assessment:${name}`,descriptor={contractVersion:'works-module-contract/1.0-draft.1',artifactId:id,kind:'tensor',profileRef:PROFILE,
  native:{schemaId:'diagnostic:p1-g1c',schemaVersion:'1',payloadRef:'pending',metadata:{}},
  semantics:{schemaId:`diagnostic:${tensor.meaning}`,schemaVersion:'1',spaceId:'raw',unit:'f32-native-value',normalization:'none'},
  tensor:{dtype:'float32',shape:tensor.shape,axes:['N','C','T','H','W'],nativeMeaning:tensor.meaning,dataRef:'pending'},
  provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:['source:35151-trace']},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:'p1-assessment',mode:'copy'},extensions:{}};
 const h=captureNativeTensor({tensor,response:{tensor,evidence:original.evidence},descriptor,store,registry});handles.push(h);
 const dir=join(out,name);await mkdir(dir);
 const assets=new Map([['native.wktensor',originalBytes],['descriptor.json',canonicalBytes(h.descriptor)],
  ['evidence.json',canonicalBytes({schemaVersion:1,artifactId:id,records:[{evidenceId:'reused:35151',data:{reuse:true,ownerReceiptCommit:pins.priorOwnerReceiptCommit,traceSha256:pins.priorTraceSha256,sourceInputHash:original.input.fileSha256,sourceOutputHash:original.numeric.fileSha256,nativeEvidence:original.evidence}}]})],
  ['trace.json',canonicalBytes({schemaVersion:1,artifactId:id,records:[{traceId:'source:35151-trace',data:{sourceCommit:pins.priorOwnerReceiptCommit,sha256:pins.priorTraceSha256}}]})],['snapshot.json',canonicalBytes(null)],['extensions.json',canonicalBytes({})]]);
 const m={packageVersion:PACKAGE_VERSION,packageId:id,artifacts:[{artifactId:id,nativePath:'native.wktensor',descriptorPath:'descriptor.json',evidencePath:'evidence.json',tracePath:'trace.json',snapshotPath:'snapshot.json',extensionsPath:'extensions.json',codec}],payloadBindings:[{ref:h.descriptor.native.payloadRef,artifactId:id,nativePath:'native.wktensor',kind:'decoded-tensor-data'}],files:[...assets.keys()].map(path=>({path,kind:path==='native.wktensor'?'native':path.split('.')[0],required:true})),extensions:{}};
 const receipt=await writeArtifactPackage(m,assets,{registry,write:async(path,b)=>writeFile(join(dir,path),b)});
 const read=await readArtifactPackage({read:async path=>{try{return await bytes(join(dir,path));}catch(e){if(e.code==='ENOENT')return null;throw e;}}},registry);
 assert.equal(read.status,'complete');assert.deepEqual(read.assets.get('native.wktensor'),originalBytes);assert.deepEqual(read.artifacts[0].restoredNative,tensor);
 captures.push({name,descriptor:h.descriptor,receipt});
}
const inv={id:'assess-existing-chain',requestId:'assess-existing-chain',ownerId:'p1-assessment',resourceBinding:'file-assessment',resourceGeneration:session,revision:1,activeToken:session};
try{
 await queue.enqueue(inv,async()=>{await capture('restored',raw,rawBytes);await capture('rgb',rgb,rgbBytes);});await queue.drain();
 const currentQueue=queue.inspect();assert.ok(currentQueue.invocations.every(r=>r.originalTerminal&&r.resourceReleased&&r.reusable));
 const decisions=[],cases=[];
 function query(capture,mean){
  const psource=mean?src(DIFF,'docs/shared/diffusion-models/latent-space/latent-space.mjs'):src(VAE,'docs/shared/inference/vae.mjs');
  const csource=mean?src(VAE,'docs/shared/inference/vae.mjs'):src(CODEC,'docs/shared/inference/api.mjs');
  const modules=[{module:'diffusion',sourceRef:src(DIFF,'docs/shared/diffusion-models/latent-space/latent-space.mjs'),kernel:{sha256:KERNEL,byteLength:8210}},
   {module:'vae',sourceRef:src(VAE,'docs/shared/inference/vae.mjs')},{module:'codec',sourceRef:src(CODEC,'docs/shared/inference/api.mjs')}];
  const port=(owner,sourceRef,version,build,entrypoint)=>({portId:owner,bindingRef:owner,owner,sourceRef,nativeAPI:{version,build,transport:'direct',entrypoint},artifactKind:'tensor',semantics:capture.descriptor.semantics,profileRef:PROFILE,tensor:{dtypes:['float32'],shape:capture.descriptor.tensor.shape,axes:['N','C','T','H','W']},requiredMetadata:['/modelSha256','/context'],requiredIdentities:[],ownershipModes:['copy'],transports:['direct'],allowedAdapterRefs:[],requiredExtensionSchemas:[]});
  const p=port(mean?'diffusion':'vae',psource,mean?'diffusion-models/0.1':'works-ai-1',mean?BUILD:'works-inference-v1',psource.path);
  const c=port(mean?'vae':'codec',csource,'works-ai-1','works-inference-v1',csource.path);
  const target={requestId:inv.requestId,managerSessionId:session,managerRevision:1,resourceBinding:inv.resourceBinding,resourceGeneration:session,activeToken:inv.activeToken,localRevisionBindings:{assessment:1}};
  const evidenceTarget={artifactRef:capture.descriptor.artifactId,profileRef:PROFILE,coverage:'all-fixed-profile-values',scope:'rect:same-profile-vae-decode',baseKind:'real-vae-bf16-expanded-fp32',referenceId:original.numeric.referenceSha256};
  const delegates={
   'N-ARTIFACT':{checker:'package.mjs',receiptRef:`readback:${capture.receipt.manifestSha256}`,receipt:capture.receipt,target:{artifactRef:capture.descriptor.artifactId,profileRef:PROFILE}},
   'N-TRANSACTION':{checker:'queue.mjs',receiptRef:`queue:${session}`,target},
   'N-EVIDENCE':{checker:'owner-validation',receiptRef:`owner:35151:${capture.name}`,target:evidenceTarget}};
  const numeric={scope:'rect:owner-mean-roundtrip',recordId:'NORM-WAN21-MEAN-RECT',ownerSourceRef:psource,kernelDigest:KERNEL,
   gateRef:{sourceRef:src(DIFF,'development/ai-connection/e6/rect-receipt.json'),sha256:'fae031603cce81eee70bad3c8446ced2192c95557ce26438c2a733562181f43b',gateId:'owner:roundTripTolerance:2e-6'},
   referenceRef:{sourceRef:src(DIFF,'development/ai-connection/e6/reference-received.json'),sha256:'0e4d44e0c8199fcebfb9fa111865fc26cd2906f321d64282920c4f82dd3151dc'}};
  const q={producerPort:p,consumerPort:c,artifact:capture.descriptor,registry,adapters:[],
   implementationState:{producer:{bindingRef:p.bindingRef,state:'implemented',roles:['owner-evidence'],operationId:mean?'restoreRawMean':'runVae',executionMode:'Owner operation already recorded; not dispatched now'},consumer:{bindingRef:c.bindingRef,state:'implemented',roles:[mean?'native-input-contract':'native-codec'],operationId:mean?'validateVaeRequest':'decodeTensor',...(mean?{operationParameter:'decode'}:{})}},
   requiredScopes:[evidenceTarget.scope],evidence:[],
   resourceState:{status:'available',ownerId:'p1-assessment',requiredBytes:rawBytes.length+rgbBytes.length,budgetBytes:65536,occupiedBytes:0,scope:'Current input-contract/file assessment only; excludes model execution memory'},
   activeBindings:{producer:{bindingRef:p.bindingRef,ownerId:p.owner,valid:true,currentRevision:1,expectedRevision:1},consumer:{bindingRef:c.bindingRef,ownerId:c.owner,valid:true,currentRevision:1,expectedRevision:1}},
   referenceContext:{referenceSet,normIds:['N-IDENTITY','N-SHAPE','N-ARTIFACT','N-EVIDENCE','N-TRANSACTION',...(mean?['N-NORMALIZATION','N-NUMERIC']:[])],
    candidateSet:{schemaVersion:'works-candidate-set/0.1-draft.1',status:'candidate',candidateSetId:'P2-P1-EXISTING-CHAIN',sourceRef:src(pins.priorOwnerReceiptCommit,'development/inference/reference-adoption/p2/CANDIDATE-ENTRY.json'),modules},
    identityBindings:[{side:'producer',module:p.owner,loadedSourceRef:psource,...(mean?{kernelDigest:KERNEL,byteLength:8210}:{})},{side:'consumer',module:c.owner,loadedSourceRef:csource}],
    profileBindings:[{recordId:'SHAPE-VAE-WAN21-F1-16X32',side:'producer',representation:mean?'raw-latent':'rgb-decoder-raw'},...(mean?[{recordId:'NORM-WAN21-MEAN-RECT',side:'producer',representation:'raw-latent'}]:[])],
    nativeDeclarations:{producer:{nativeProfileId:PROFILE,modelSha256:MODEL,...(mean?{normalizationRuleId:'wan21-comfy-f32-v1',kernelABI:'wan21-raw-mean-f32-v3',kernelDigest:KERNEL,normalizationState:'restored'}:{})}},
    numericRequirements:mean?[numeric]:[],managerState:{target},evidenceTarget,delegations:delegates}};
  const make=(scope,id)=>({evidenceId:id,scope,result:'pass',subjectRefs:[p.bindingRef,c.bindingRef],contractRefs:[p.nativeAPI.version,p.nativeAPI.build,c.nativeAPI.version,c.nativeAPI.build,psource.commit,csource.commit],artifactRef:capture.descriptor.artifactId,profileRef:PROFILE,inputConditions:{shape:capture.descriptor.tensor.shape,dtype:'float32',environment:'reused owner WASM receipt + current Node contract/file assessment',...evidenceTarget},reuse:{ownerReceiptCommit:pins.priorOwnerReceiptCommit,traceSha256:pins.priorTraceSha256,newNeuralExecution:false}});
  q.evidence.push(make(evidenceTarget.scope,'reuse:actual-1536-rgb'));
  if(mean){const n=make(numeric.scope,'reuse:actual-128-mean');n.inputConditions={...n.inputConditions,scope:numeric.scope,coverage:'all-128-owner-mean-values'};q.evidence.push({...n,normBinding:{catalogSha256:referenceSet.catalogSha256,...numeric}});}
  for(const [norm,delegation] of Object.entries(delegates))q.evidence.push({...make(`norm:${norm}`,delegation.receiptRef),normBinding:{catalogSha256:referenceSet.catalogSha256},delegation,...(norm==='N-ARTIFACT'?{packageReceipt:capture.receipt}:{})});
  return q;
 }
 for(const capture of captures){
  const q=query(capture,capture.name==='restored'),decision=evaluateEdge(q);
  assert.equal(decision.compatibility,'COMPATIBLE',JSON.stringify(decision.reasons));assert.equal(decision.readiness.state,'ready',JSON.stringify(decision.readiness));
  assert.ok(decision.validation.every(v=>v.result==='pass'));decisions.push({name:capture.name,decision});
  const copy=()=>({...q,artifact:structuredClone(q.artifact),evidence:structuredClone(q.evidence),referenceContext:{...structuredClone({...q.referenceContext,referenceSet:null}),referenceSet}});
  if(capture.name==='restored'){
   const missing=copy();missing.referenceContext.numericRequirements[0].gateRef=null;
   const d=evaluateEdge(missing);assert.equal(d.compatibility,'COMPATIBLE');assert.equal(d.readiness.state,'blocked');assert.ok(d.validation.some(v=>v.scope==='rect:owner-mean-roundtrip'&&v.result==='not-verified'));cases.push({name:'missing gate',decision:d});
   const shape=copy();shape.artifact.tensor.shape=[1,16,2,2,2];const s=evaluateEdge(shape);assert.equal(s.compatibility,'INCOMPATIBLE');cases.push({name:'same128 F5 shape',decision:s});
   const old=copy();old.referenceContext.identityBindings[0].kernelDigest='6b9cb9f0617da373e63275354ac42f7843fb455019ed3988df7364173bc775b4';const k=evaluateEdge(old);assert.equal(k.compatibility,'INCOMPATIBLE');cases.push({name:'old kernel',decision:k});
  }
  const unknown=copy();unknown.referenceContext.normIds.push('N-UNKNOWN-REQUIRED');const u=evaluateEdge(unknown);assert.equal(u.compatibility,'UNVERIFIED');cases.push({name:`${capture.name}: unknown required norm`,decision:u});
  const missing=copy();missing.evidence=missing.evidence.filter(e=>e.scope!=='rect:same-profile-vae-decode');const m=evaluateEdge(missing);assert.equal(m.compatibility,'COMPATIBLE');assert.equal(m.readiness.state,'blocked');cases.push({name:`${capture.name}: missing decode evidence`,decision:m});
  const generated=copy();generated.referenceContext.normIds.push('N-GENERATION');const g=evaluateEdge(generated);assert.equal(g.readiness.state,'blocked');cases.push({name:`${capture.name}: no generation promotion`,decision:g});
 }
 for(const h of handles)releaseArtifactHandle(h,store);assert.equal(store.size,0);const disposed=await queue.dispose();assert.deepEqual(disposed.quarantined,[]);
 const result={passed:true,scope:'Fresh P1 admission of completed Rect owner evidence and current input-contract/file assessment',managerCommit:pins.managerCommit,referenceSet:{catalogSha256:referenceSet.catalogSha256,integrityReceipts:referenceSet.integrityReceipts},sourceTrace:{commit:pins.priorOwnerReceiptCommit,sha256:pins.priorTraceSha256,originalStatusUnchanged:true},assetReceipts,nativeGuard,decisions,negativeCases:cases,currentQueue,storeEntries:store.size,queueDisposed:disposed.disposed,newNeuralExecutions:0,newHikeTransforms:0,newExports:0,generationReady:false,
  newNativeExecutionReadiness:'Not assessed; ready decisions concern contract/file assessment only',normalizedWireMarkerAccepted:false};
 await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({passed:true,positiveEdges:decisions.length,negativeCases:cases.length,newNeuralExecutions:0}));
}finally{store.clear();await queue.dispose();}

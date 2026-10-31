/** P2 candidate-only reproduction. Receives recorded real VAE outputs; runs the
 * owner Rect WASM. No model export, VAE numerical operation, or generation API. */
import {readFile,writeFile,mkdir,stat,readdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonicalize,canonicalBytes,sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';
import {CONTRACT_VERSION} from '../../docs/shared/ai-connection/descriptor.mjs';
import {createOwnedArtifactStore,captureNativeTensor,restoreNativeTensor,exportBinaryAssets} from '../../docs/shared/ai-connection/adapters/artifacts.mjs';
import {PACKAGE_VERSION,writeArtifactPackage,readArtifactPackage} from '../../docs/shared/ai-connection/package.mjs';
import {createInvocationQueue} from '../../docs/shared/ai-connection/queue.mjs';
import {buildArtifactCacheKey,createArtifactCache} from '../../docs/shared/ai-connection/cache.mjs';
import {loadReferenceSet} from '../../docs/shared/ai-connection/reference-loader.mjs';
import {evaluateEdge} from '../../docs/shared/ai-connection/compatibility.mjs';

// Exact repository namespace used by the fixed catalog; no URL normalization.
const REPOSITORY='Kushyameln01/kushyameln-works';
const DIFFUSION='5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3',VAE='855f435120f08eb9e818e51281fc26f0e2633829';
const PROFILE='wan21-raw-f32-1x16x32',MODEL='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b';
const KERNEL='bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d';
const BUILD='diffusion-models/0.1+35b5ecdf924b13ccfcd08ec1eeaf840700dfc7c69acd168bbb39e72376542a20';
const OWNER='works:p2-rect-manager',SHAPE=[1,16,1,2,4],AXES=['N','C','T','H','W'];
const src=(commit,path)=>({repository:REPOSITORY,commit,path});
const identity={identityKind:'model',role:'producer',algorithm:'sha256',value:MODEL,scope:'full-file'};
const bytes=v=>new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
const failure=(code,message)=>Object.assign(Error(message),{code});
const equal=(a,b)=>a===undefined||b===undefined?a===b:canonicalize(a)===canonicalize(b);
const loaded=new WeakMap();
const freezeJSON=v=>{if(v&&typeof v==='object'&&!ArrayBuffer.isView(v)){for(const x of Object.values(v))freezeJSON(x);Object.freeze(v);}return v;};
const pins={
 diffusion:{commit:DIFFUSION,apiVersion:'diffusion-models/0.1',build:BUILD,entrypoint:'docs/shared/diffusion-models/latent-space/latent-space.mjs',kernelABI:'wan21-raw-mean-f32-v3',kernelSha256:KERNEL},
 vae:{commit:VAE,apiVersion:'works-ai-1',build:'works-inference-v1',entrypoint:'docs/shared/inference/vae-api.mjs',codec:'docs/shared/inference/tensor.mjs'}
};
const SOURCE_HASHES={
 diffusion:{
  'docs/shared/diffusion-models/api/build-info.mjs':'e988e290d61e7c88cd8e78082caf15035ef54ada3d95b0ef19fbb7aef0951970',
  'docs/shared/diffusion-models/latent-space/latent-space.mjs':'3d28445a5c36eeb4f31b7bfe89163e43091438f571488a665888833e1d860104',
  'docs/shared/diffusion-models/latent-space/kernel-registry.mjs':'191f85b0bedc8ad439a486b077f0891c7846a7535b0d71d26350b8581f8d11b8',
  'docs/shared/diffusion-models/tensor-interop.mjs':'13c3595f0786a45a62d0a8739b6acd58d3025c80f7eaff4baf7314559665c1c1',
  'docs/shared/inference/tensor.mjs':'a3fdfc1654361713a5e8278e6af5d76a65aafed7f654c06813eebb933f7a0f4c',
  'docs/shared/diffusion-models/latent-space/build/latent-space.wasm':KERNEL,
  'development/ai-connection/e6/rect-receipt.json':'fae031603cce81eee70bad3c8446ced2192c95557ce26438c2a733562181f43b',
  'development/ai-connection/e6/reference-received.json':'0e4d44e0c8199fcebfb9fa111865fc26cd2906f321d64282920c4f82dd3151dc'
 },
 vae:{
  'docs/shared/inference/client.mjs':'53751cde923b7128da29266a29810942afd6e6ae32fad1fc87605e952cecd55e',
  'docs/shared/inference/vae-api.mjs':'75f791130cbb27961ea530376d4715ddd9555e80ee3e2b8453824af42be0511e',
  'docs/shared/inference/tensor.mjs':'4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b',
  'development/inference/e6/receipt.json':'6fb061673a5af6cf4e3a8deaee5c9919bc71b7eafd8205b3f6f4a0d203965a3b',
  'development/inference/e6/acceptance-plan.json':'8b2eefef3fa532e9fd57115d73a037176ab43760a1bacb95e8d776e21251b347',
  'development/inference/e6/fixtures/bundle-manifest.json':'450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a',
  'development/inference/e6/fixtures/api-recovery.wktensor':'8134bc943a60b3f0e0d388048ef0943a5274ef37511ce5630cc40d7596bb26a8',
  'development/inference/e6/fixtures/png-roundtrip.wktensor':'0d0a28c963445ab88cb4553296489d965a73d3a56b0f1bbff7daa54f6d60834a'
 }
};
/** Select only the agreed native Rect raw-mean boundary. The owner validates
 * its numbers. In particular F5's equal element count is not this profile. */
export function assertRectMean(t){
 if(t?.dtype!=='float32'||t.layout!=='NCTHW'||!equal(t.shape,SHAPE)||t.meaning!=='raw-posterior-mean'||t.modelSha256!==MODEL||t.profileId!==undefined&&t.profileId!==PROFILE||t.normalization!==undefined||t.latentContract!==undefined||t.attentionMask!==undefined||!(t.data instanceof Float32Array)||t.data.length!==128)throw failure('RECT_PROFILE_MISMATCH','An exact raw Rect posterior mean is required; no F5/F1/normalized/sample substitution.');
 return t;
}
async function verified(root,path,sha256){const data=new Uint8Array(await readFile(join(root,path)));if(await sha256Bytes(data)!==sha256)throw failure('CANDIDATE_BYTES_MISMATCH',`Pinned candidate bytes differ: ${path}`);return data;}
/** Explicit source roots are caller-supplied, never searched or downloaded. */
export async function loadRectCandidate({diffusionRoot,vaeRoot}={}){
 if(!diffusionRoot||!vaeRoot)throw failure('CANDIDATE_ROOTS_REQUIRED','Explicit candidate source roots are required.');
 const roots={diffusion:resolve(diffusionRoot),vae:resolve(vaeRoot)},files={diffusion:new Map(),vae:new Map()},sourceReceipts=[];
 for(const owner of ['diffusion','vae'])for(const [path,sha256] of Object.entries(SOURCE_HASHES[owner])){const b=await verified(roots[owner],path,sha256);files[owner].set(path,b);sourceReceipts.push({owner,sourceRef:src(pins[owner].commit,path),sha256,byteLength:b.length});}
 const parse=(o,p)=>JSON.parse(new TextDecoder().decode(files[o].get(p)));
 const vaeReceipt=parse('vae','development/inference/e6/receipt.json'),diffReceipt=parse('diffusion','development/ai-connection/e6/rect-receipt.json');
 const reference=parse('diffusion','development/ai-connection/e6/reference-received.json').outputs.find(x=>x.profile===PROFILE);
 if(diffReceipt.roundTripTolerance!==2e-6||vaeReceipt.acceptanceGate.maxAbs!==2e-5||!equal(reference?.shape,SHAPE))throw failure('OWNER_GATE_MISMATCH','Pinned owner profile/gate declarations are required.');
 const codec=await import(pathToFileURL(join(roots.vae,pins.vae.codec)).href),owner=await import(pathToFileURL(join(roots.diffusion,pins.diffusion.entrypoint)).href);
 const inputBytes=files.vae.get('development/inference/e6/fixtures/api-recovery.wktensor'),native=assertRectMean(await codec.decodeTensor(inputBytes));
 const rgb=await codec.decodeTensor(files.vae.get('development/inference/e6/fixtures/png-roundtrip.wktensor'));
 if(!equal(rgb.shape,[1,3,1,16,32])||rgb.meaning!=='raw-decoder-rgb'||rgb.modelSha256!==MODEL)throw failure('OWNER_RGB_MISMATCH','Received RGB must bind the same Rect VAE model/profile.');
 const value={pins:structuredClone(pins),gates:{meanRoundtrip:diffReceipt.roundTripTolerance,vae:vaeReceipt.acceptanceGate,exporterDefault:vaeReceipt.exporterDefaultGate},inputIdentity:{sourceRef:src(VAE,'development/inference/e6/fixtures/api-recovery.wktensor'),sha256:await sha256Bytes(inputBytes),byteLength:inputBytes.length},native:structuredClone(native),reference:structuredClone(reference),sourceReceipts};
 loaded.set(value,{roots,files,codec,owner,vaeReceipt,diffReceipt,native,rgb});return freezeJSON(value);
}
function comparison(actual,expected,gate){let maxAbs=0;for(let i=0;i<actual.length;i++)maxAbs=Math.max(maxAbs,Math.abs(actual[i]-expected[i]));return {comparedValues:actual.length,maxAbs,gate,passed:actual.length===expected.length&&maxAbs<=gate};}
async function referenceSet(){
 const root=new URL('../../',import.meta.url),path='docs/shared/ai-connection/reference/catalog.v1.json',catalogBytes=new Uint8Array(await readFile(new URL(path,root))),catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
 const files=new Map(await Promise.all(catalog.files.map(async f=>[f.path,new Uint8Array(await readFile(new URL(f.path,root)))])));
 return loadReferenceSet({catalogBytes,files,expectedCatalogSha256:'14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c'});
}
async function managerReceipts(){
 const paths=['tools/ai-connection/rect-management-runner.mjs',...['canonical.mjs','descriptor.mjs','contracts/schemas.mjs','compatibility.mjs','norm-bindings.mjs','reference-loader.mjs','adapters/artifacts.mjs','package.mjs','queue.mjs','cache.mjs'].map(p=>`docs/shared/ai-connection/${p}`)];
 return Promise.all(paths.map(async path=>{const b=new Uint8Array(await readFile(new URL(`../../${path}`,import.meta.url)));return {path,sha256:await sha256Bytes(b),byteLength:b.length};}));
}
function abort(signal){if(signal?.aborted)throw new DOMException('Rect management invocation aborted','AbortError');}
async function inventory(receipt,explicitRoot){
 const root=explicitRoot??receipt.privateModelOutput,assets=[];
 for(const [role,item] of Object.entries(receipt.assets)){const path=join(root,item.file);let s=null;try{s=await stat(path);}catch(e){if(e.code!=='ENOENT')throw e;}assets.push({role,path,expectedBytes:item.bytes,expectedSha256:item.sha256,state:s?'present-unverified':'missing',observedBytes:s?.size??null});}
 return {root,assets,allPresent:assets.every(a=>a.state!=='missing'),automaticExport:false,automaticDownload:false};
}
async function packageTensor({native,stage,scope,directory,codec,store,trace,evidence,extensions}){
 const artifactId=`works:p2:${stage}`,meaning=native.meaning,semantic={schemaId:`works:p2:${meaning}`,schemaVersion:'1',spaceId:meaning,unit:'native-f32-value',normalization:native.normalization??'none'};
 const registry={schemas:[{schemaId:'works:p2:g1c-metadata',schemaVersion:'1',g1cMetadata:true},{...semantic,nativeMeanings:[meaning]}],roles:['tensor-transform','latent-decoding'],codecs:[{codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef:src(VAE,pins.vae.codec),decode:codec.decodeTensor}]};
 const descriptor={contractVersion:CONTRACT_VERSION,artifactId,kind:'tensor',native:{schemaId:'works:p2:g1c-metadata',schemaVersion:'1',payloadRef:'pending',metadata:{}},semantics:semantic,profileRef:PROFILE,tensor:{dtype:native.dtype,shape:native.shape,axes:AXES,nativeMeaning:meaning,dataRef:'pending'},provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:['works:p2:mean-route']},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:OWNER,mode:'copy'},extensions};
 const handle=captureNativeTensor({tensor:native,response:{tensor:native,evidence},descriptor,store,registry});
 const d=handle.descriptor,fileKinds={'native.wktensor':'native','descriptor.json':'descriptor','evidence.json':'evidence','trace.json':'trace','snapshot.json':'snapshot','extensions.json':'extensions'};
 const assets=new Map([['native.wktensor',await codec.encodeTensor(native)],['descriptor.json',canonicalBytes(d)],['evidence.json',canonicalBytes({schemaVersion:1,artifactId,records:[{evidenceId:`works:p2:${stage}:evidence`,data:evidence}]})],['trace.json',canonicalBytes({schemaVersion:1,artifactId,records:[{traceId:'works:p2:mean-route',data:trace}]})],['snapshot.json',canonicalBytes(null)],['extensions.json',canonicalBytes(d.extensions)]]);
 const manifest={packageVersion:PACKAGE_VERSION,packageId:`works:p2:package:${stage}`,artifacts:[{artifactId,nativePath:'native.wktensor',descriptorPath:'descriptor.json',evidencePath:'evidence.json',tracePath:'trace.json',snapshotPath:'snapshot.json',extensionsPath:'extensions.json',codec:{codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef:src(VAE,pins.vae.codec)}}],payloadBindings:[{ref:d.native.payloadRef,artifactId,nativePath:'native.wktensor',kind:'decoded-tensor-data'}],files:Object.entries(fileKinds).map(([path,kind])=>({path,kind,required:true})),extensions:{}};
 const binaries=exportBinaryAssets(d,store);if(binaries.size)manifest.binaryBindings=[];
 for(const [ref,data] of binaries){const path=`binary/${manifest.binaryBindings.length}.bin`;let node;const find=x=>{if(!x||typeof x!=='object')return;if(x.binaryRef===ref&&x.type&&x.byteLength!==undefined)node=x;else for(const v of Object.values(x))find(v);};find(d);manifest.binaryBindings.push({...node,path});manifest.files.push({path,kind:'attachment',required:true});assets.set(path,data);}
 await mkdir(directory,{recursive:true});
 await writeArtifactPackage(manifest,assets,{registry,write:async(path,b)=>{const file=join(directory,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,b,{flag:'wx'});}});
 const readback=await readArtifactPackage({read:async path=>{try{return new Uint8Array(await readFile(join(directory,path)));}catch(e){if(e.code==='ENOENT')return null;throw e;}}},registry);
 if(readback.status!=='complete')throw failure('P2_PACKAGE_INCOMPLETE',`Existing E4 readback did not complete: ${stage}`);
 const restored=readback.artifacts[0].restoredNative;
 if(!equal(restored.context,native.context)||restored.meaning!==meaning||await sha256Bytes(bytes(restored.data))!==await sha256Bytes(bytes(native.data)))throw failure('P2_READBACK_MISMATCH','Package changed native metadata or payload.');
 return {summary:{stage,scope,status:readback.status,directory,artifactId,payloadSha256:await sha256Bytes(bytes(native.data)),nativeFileSha256:await sha256Bytes(assets.get('native.wktensor'))},readback,registry};
}
function edge({artifact,registry,set,payloadSha256,referenceSha256,packageReceipt}){
 const psource=src(DIFFUSION,pins.diffusion.entrypoint),csource=src(VAE,pins.vae.entrypoint),semantics=artifact.semantics;
 const port=(side,sourceRef,nativeAPI)=>({portId:`works:p2:${side}`,bindingRef:`works:p2:${side}`,owner:side,sourceRef,nativeAPI,artifactKind:'tensor',semantics,profileRef:PROFILE,tensor:{dtypes:['float32'],shape:SHAPE,axes:AXES},requiredMetadata:['/meaning','/modelSha256','/context'],requiredIdentities:[],ownershipModes:['copy'],transports:['direct'],allowedAdapterRefs:[],requiredExtensionSchemas:[]});
 const producerPort=port('diffusion',psource,{version:pins.diffusion.apiVersion,build:BUILD,transport:'direct',entrypoint:pins.diffusion.entrypoint}),consumerPort=port('vae',csource,{version:pins.vae.apiVersion,build:pins.vae.build,transport:'direct',entrypoint:pins.vae.entrypoint});
 const numeric={scope:'rect:owner-mean-roundtrip',recordId:'NORM-WAN21-MEAN-RECT',ownerSourceRef:psource,kernelDigest:KERNEL,gateRef:{sourceRef:src(DIFFUSION,'development/ai-connection/e6/rect-receipt.json'),sha256:SOURCE_HASHES.diffusion['development/ai-connection/e6/rect-receipt.json'],gateId:'owner:roundTripTolerance:2e-6'},referenceRef:{sourceRef:src(DIFFUSION,'development/ai-connection/e6/reference-received.json'),sha256:referenceSha256}};
 const artifactDelegation={checker:'package.mjs',receipt:packageReceipt,receiptRef:`works:p2:readback:${packageReceipt.manifestSha256}`,target:{artifactRef:artifact.artifactId,profileRef:artifact.profileRef}};
 const q={producerPort,consumerPort,artifact,adapters:[],registry,implementationState:{producer:{bindingRef:producerPort.bindingRef,state:'implemented',roles:['tensor-transform'],operationId:'restoreRawMean/RestoreRawMeanRect'},consumer:{bindingRef:consumerPort.bindingRef,state:'implemented',roles:['latent-decoding'],operationId:'decode'}},requiredScopes:['rect:owner-mean-roundtrip','rect:same-profile-fresh-vae-decode'],evidence:[{evidenceId:'works:p2:actual-roundtrip',scope:numeric.scope,result:'pass',subjectRefs:[producerPort.bindingRef,consumerPort.bindingRef],contractRefs:[pins.diffusion.apiVersion,BUILD,pins.vae.apiVersion,pins.vae.build,DIFFUSION,VAE],artifactRef:artifact.artifactId,profileRef:PROFILE,inputConditions:{shape:SHAPE,dtype:'float32',coverage:'actual-mean128-owner-wasm',environment:'node'},normBinding:{catalogSha256:set.catalogSha256,...numeric},payloadSha256}],resourceState:{status:'unavailable',ownerId:OWNER,requiredBytes:0,budgetBytes:0,occupiedBytes:0},activeBindings:{producer:{bindingRef:producerPort.bindingRef,ownerId:'diffusion',valid:true,currentRevision:1,expectedRevision:1},consumer:{bindingRef:consumerPort.bindingRef,ownerId:'vae',valid:false,currentRevision:1,expectedRevision:1}},referenceContext:{referenceSet:set,normIds:['N-SHAPE','N-NORMALIZATION','N-NUMERIC','N-ARTIFACT'],delegations:{'N-ARTIFACT':artifactDelegation},profileBindings:[{recordId:'SHAPE-VAE-WAN21-F1-16X32',side:'producer',representation:'raw-latent'},{recordId:'NORM-WAN21-MEAN-RECT',side:'producer',representation:'raw-latent'}],nativeDeclarations:{producer:{nativeProfileId:PROFILE,modelSha256:MODEL,normalizationRuleId:'wan21-comfy-f32-v1',kernelABI:pins.diffusion.kernelABI,kernelDigest:KERNEL,normalizationState:'restored'}},numericRequirements:[numeric]}};
 q.evidence.push({...q.evidence[0],evidenceId:artifactDelegation.receiptRef,scope:'norm:N-ARTIFACT',normBinding:{catalogSha256:set.catalogSha256},delegation:artifactDelegation,packageReceipt});
 const decision=evaluateEdge(q);
 // A deliberate omitted-input probe on this real artifact; it does not assert
 // that the known owner gate is unknown. Contract remains separately known.
 const omission={...q,requiredScopes:[],evidence:q.evidence.filter(e=>e.scope==='norm:N-ARTIFACT'),resourceState:{status:'available',ownerId:OWNER,requiredBytes:512,budgetBytes:65536,occupiedBytes:0},activeBindings:{...q.activeBindings,consumer:{...q.activeBindings.consumer,valid:true}},referenceContext:{...q.referenceContext,numericRequirements:[{...numeric,scope:'rect:gate-omitted-input-probe',gateRef:null}]}};
 return {decision,gateOmissionDecision:evaluateEdge(omission)};
}
/** Writes only a fresh caller-chosen output directory. The model asset inventory
 * is read-only. Even present assets do not fabricate a new VAE session/result. */
export async function runRectManagement({candidate,outputDirectory,managerCommit,privateBundleRoot,signal}={}){
 const state=loaded.get(candidate);if(!state)throw failure('UNVERIFIED_CANDIDATE','Use the byte-verified candidate loader.');
 if(!outputDirectory||!/^[a-f0-9]{40}$/.test(managerCommit??''))throw failure('MANAGER_SOURCE_REQUIRED','Explicit output directory and full manager base commit are required.');
 abort(signal);const {files,codec,owner,vaeReceipt,diffReceipt,native,rgb}=state,store=createOwnedArtifactStore(),resources={kernelDisposed:false,cacheReleaseCount:0};
 const cache=createArtifactCache({maxBytes:65536,ownerId:OWNER,release:async()=>{resources.cacheReleaseCount++;}});
 const kernel=await owner.createLatentSpace(files.diffusion.get('docs/shared/diffusion-models/latent-space/build/latent-space.wasm'));
 let dispatching=false;const lifecycle=[],bindingGeneration=crypto.randomUUID();
 const queue=createInvocationQueue({resourceBindings:[{bindingId:'works:p2:rect-kernel',ownerId:OWNER,resourceGeneration:bindingGeneration,cancel:async target=>{if(target.ownerId!==OWNER)throw failure('FOREIGN_OWNER','Foreign stop forbidden');return {stopped:!dispatching,evidenceRef:'bounded-native-call-terminal'};},afterTerminal:async target=>({reusable:!dispatching,evidenceRef:`terminal:${target.requestId}`}),release:async target=>{lifecycle.push({target,released:true});}}]});
 const trace={schemaVersion:1,scope:'received-real-mean-owner-rect-wasm-management-route',candidateStatus:'candidate',profileId:PROFILE,sourcePins:candidate.pins,manager:{commit:null,baseCommit:managerCommit,reason:'Uncommitted management changes: sourceReceipts bind the exact executed working-tree checkpoint.',runnerSha256:await sha256Bytes(new Uint8Array(await readFile(fileURLToPath(import.meta.url)))),sourceReceipts:await managerReceipts(),sourceState:'working-tree-source-digest-separate-from-base-commit'},referenceCatalog:{sourceRef:src('6dae9a6fac3e9ad29ea941f22211edbe4aa894ad','docs/shared/ai-connection/reference/catalog.v1.json'),sha256:'14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c',documentVersion:'1.0-draft.1'},inputIdentity:candidate.inputIdentity,operations:[],freshVaeEncode:false,freshVaeDecode:false,generationReady:false};
 const extensions={'works:p2-scope':{schemaId:'works:p2-scope',schemaVersion:'1',requiredForUse:false,data:{candidate:true,freshVaeEncode:false,freshVaeDecode:false,generationReady:false}}};
 const packages=[];let normalized,restored,kernelStats,transform,normalizedCapture,normalizedPackageGate;
 try{
  abort(signal);
  const raw=await packageTensor({native,stage:'received-raw-mean',scope:'received-real-vae-mean-save-read',directory:join(outputDirectory,'raw-mean'),codec,store,trace,evidence:{ownerReceipt:vaeReceipt,received:true,newNeuralExecution:false},extensions});packages.push(raw.summary);
  const rawTensor=assertRectMean(raw.readback.artifacts[0].restoredNative);
  const key=await buildArtifactCacheKey({modules:[{moduleId:'diffusion_models',moduleVersion:'candidate',nativeVersion:pins.diffusion.apiVersion,buildId:BUILD,sourceRef:src(DIFFUSION,pins.diffusion.entrypoint)}],modelBindings:[identity],tokenizerBindings:[],profileRef:PROFILE,config:{operation:'normalizeRawMean',kernelSha256:KERNEL},inputHashes:[{inputId:native.context.inputId,sha256:await sha256Bytes(bytes(rawTensor.data))}],maskHash:null,context:rawTensor.context,adapterBindings:[],dependencies:[{dependencyId:'rect:input',revision:1}]});
  const reader={readerOwnerId:OWNER,revisionBindings:{'rect:input':1},leases:[]};
  await cache.put({key,metadata:{scope:'received-real-mean',meaning:rawTensor.meaning},payload:await codec.encodeTensor(rawTensor),ownership:{ownerId:OWNER,mode:'copy'}},reader);
  const cached=await cache.get(key,reader);if(cached.status!=='hit')throw failure('CACHE_MISS','Expected explicitly current owned copy.');
  const input=assertRectMean(await codec.decodeTensor(cached.payload));
  const run=async(operation,tensor)=>{
   abort(signal);const id=`works:p2:${operation}`,requestId=crypto.randomUUID(),activeToken=crypto.randomUUID(),target={bindingId:'works:p2:rect-kernel',ownerId:OWNER,resourceGeneration:bindingGeneration,requestId,revision:1,activeToken};
   const cancel=()=>{queue.cancelInvocation(id,target).catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
   try{return await queue.enqueue({id,requestId,ownerId:OWNER,resourceBinding:target.bindingId,resourceGeneration:bindingGeneration,revision:1,activeToken},async context=>{abort(context.signal);dispatching=true;try{return kernel[operation](tensor);}finally{dispatching=false;}});}finally{signal?.removeEventListener('abort',cancel);}
  };
  normalized=await run('normalizeRawMean',input);
  trace.operations.push({operation:'normalizeRawMean',nativeExport:'NormalizeRawMeanRect',sourceRef:src(DIFFUSION,pins.diffusion.entrypoint),build:BUILD,inputPayloadSha256:await sha256Bytes(bytes(input.data)),outputPayloadSha256:await sha256Bytes(bytes(normalized.data))});
  // Candidate codec omits this optional owner normalization marker. Existing
  // E4 coherence correctly refuses its loss; keep this as an observed boundary.
  const rejectedDirectory=join(outputDirectory,'normalized-package-rejected');
  try{await packageTensor({native:normalized,stage:'owner-normalized-mean',scope:'codec-marker-loss-negative-probe',directory:rejectedDirectory,codec,store,trace,evidence:{ownerReceipt:diffReceipt,operation:'NormalizeRawMeanRect',newNeuralExecution:false},extensions});throw failure('EXPECTED_CODEC_MARKER_GUARD','Pinned codec unexpectedly accepted marker loss.');}
  catch(e){if(e.code!=='NATIVE_METADATA_MISMATCH'||e.fieldPath!=='descriptor.json/native/metadata/normalization')throw e;normalizedPackageGate={status:'blocked',code:e.code,fieldPath:e.fieldPath,filesWritten:(await readdir(rejectedDirectory)).length,scope:'exact-candidate-codec-normalization-marker-loss'};}
  const normalSemantic={schemaId:'works:p2:wan21-normalized-posterior-mean:v1',schemaVersion:'1',spaceId:normalized.meaning,unit:'native-f32-value',normalization:normalized.normalization};
  const normalRegistry={...raw.registry,schemas:[...raw.registry.schemas,{...normalSemantic,nativeMeanings:[normalized.meaning]}]};
  const normalDescriptor={...raw.readback.artifacts[0].descriptor,artifactId:'works:p2:owned-normalized-mean',semantics:normalSemantic};
  const normalHandle=captureNativeTensor({tensor:normalized,response:{tensor:normalized,operation:'NormalizeRawMeanRect'},descriptor:normalDescriptor,store,registry:normalRegistry});
  const normalOwned=restoreNativeTensor(normalHandle,store);
  normalizedCapture={mode:'copy',normalization:normalOwned.normalization,meaning:normalOwned.meaning,context:normalOwned.context,payloadSha256:await sha256Bytes(bytes(normalOwned.data)),diskPackageAccepted:false};
  restored=assertRectMean(await run('restoreRawMean',normalOwned));
  trace.operations.push({operation:'restoreRawMean',nativeExport:'RestoreRawMeanRect',sourceRef:src(DIFFUSION,pins.diffusion.entrypoint),build:BUILD,inputPayloadSha256:await sha256Bytes(bytes(normalized.data)),outputPayloadSha256:await sha256Bytes(bytes(restored.data))});
  const independent=candidate.reference;
  if(await sha256Bytes(bytes(normalized.data))!==independent.normalizedSHA256||await sha256Bytes(bytes(restored.data))!==independent.restoredSHA256)throw failure('OWNER_REFERENCE_MISMATCH','Full owner independent reference output hashes differ.');
  const measured=comparison(restored.data,input.data,candidate.gates.meanRoundtrip);if(!measured.passed)throw failure('OWNER_GATE_FAILED','Existing owner roundtrip gate failed.');
  transform={calls:kernel.stats().calls,normalized:{sha256:independent.normalizedSHA256,comparedValues:128,referenceEqual:normalized.data.every((x,i)=>x===independent.normalized[i])},restored:{sha256:independent.restoredSHA256,comparedValues:128,referenceEqual:restored.data.every((x,i)=>x===independent.restored[i])},comparison:measured};
  const restore=await packageTensor({native:restored,stage:'owner-restored-mean',scope:'actual-owner-rect-restore-save-read',directory:join(outputDirectory,'restored-mean'),codec,store,trace,evidence:{ownerReceipt:diffReceipt,actualRun:transform},extensions});packages.push(restore.summary);
  // This is a second received-output boundary, never a fabricated decode from
  // restored.data. It retains its original context absence and native meaning.
  const receivedRGB=await packageTensor({native:rgb,stage:'received-owner-rgb',scope:'received-owner-rgb-save-read-only',directory:join(outputDirectory,'received-rgb'),codec,store,trace:{...trace,scope:'received-owner-rgb-save-read-only',connectedFreshDecode:false},evidence:{ownerReceipt:vaeReceipt,received:true,newNeuralExecution:false,connectedToCurrentRestoredMean:false},extensions});packages.push(receivedRGB.summary);
  kernelStats=kernel.stats();await queue.drain();
  const assets=await inventory(vaeReceipt,privateBundleRoot),set=await referenceSet();
  const decisions=edge({artifact:restore.readback.artifacts[0].descriptor,registry:restore.registry,set,payloadSha256:independent.restoredSHA256,referenceSha256:SOURCE_HASHES.diffusion['development/ai-connection/e6/reference-received.json'],packageReceipt:restore.readback.receipt});
  await cache.clear();store.clear();kernel.dispose();resources.kernelDisposed=true;
  const queueState=queue.inspect();await queue.dispose();
  const result={schemaVersion:'works-p2-rect-route/0.1-draft.1',status:'PARTIAL',generationReady:false,freshVaeEncode:false,freshVaeDecode:false,pins:candidate.pins,gates:candidate.gates,sourceReceipts:candidate.sourceReceipts,trace,packages,normalizedCapture,normalizedPackageGate,transform,kernel:kernelStats,cache:{hit:true},queue:queueState,resources:{...resources,cacheRetainedBytes:cache.inspect().retainedBytes,storeEntries:store.size,ownerLifecycle:lifecycle},assetInventory:assets,blockedEdges:[{edge:'normalized-mean-disk-package',...normalizedPackageGate},{edge:'fresh-vae-encode',reason:'No new real VAE neural session was executed; input is the exact received owner mean.'},{edge:'same-profile-fresh-vae-decode',reason:assets.allPresent?'Explicit assets are present but unverified; fresh browser VAE decode is not executed by this runner.':'Exact owner exported graph/conv assets are absent; no export or shape substitution is performed.',missingAssets:assets.assets.filter(a=>a.state==='missing').map(a=>a.path)}],edgeDecision:decisions.decision,gateOmissionDecision:decisions.gateOmissionDecision};
  await writeFile(join(outputDirectory,'result.json'),new Uint8Array([...canonicalBytes(result),10]),{flag:'wx'});return result;
 }finally{await queue.dispose();await cache.clear();store.clear();if(!resources.kernelDisposed){kernel.dispose();resources.kernelDisposed=true;}}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=Object.fromEntries(process.argv.slice(2).reduce((out,v,i,all)=>v.startsWith('--')?[...out,[v.slice(2),all[i+1]]]:out,[]));
 const candidate=await loadRectCandidate({diffusionRoot:args['diffusion-root'],vaeRoot:args['vae-root']});
 const result=await runRectManagement({candidate,outputDirectory:args.output,managerCommit:args['manager-commit'],privateBundleRoot:args['private-bundle-root']});
 console.log(JSON.stringify({status:result.status,packages:result.packages.map(p=>({stage:p.stage,status:p.status})),transform:result.transform,blockedEdges:result.blockedEdges,edgeCompatibility:result.edgeDecision.compatibility,readiness:result.edgeDecision.readiness.state,output:args.output},null,2));
}

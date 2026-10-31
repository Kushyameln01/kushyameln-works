/** Browser reproduction harness for the required Rect route. Native arithmetic
 * is provided only by the injected, byte-authenticated VAE855 module. */
import {createNormRequiredRectAdapter} from '../../docs/shared/ai-connection/adapters/norm-required-rect.mjs';
import {createOwnedArtifactStore,captureNativeTensor,exportBinaryAssets} from '../../docs/shared/ai-connection/adapters/artifacts.mjs';
import {loadReferenceSet} from '../../docs/shared/ai-connection/reference-loader.mjs';
import {canonicalBytes,sha256Bytes,hashCanonical} from '../../docs/shared/ai-connection/canonical.mjs';
import {PACKAGE_VERSION,writeArtifactPackage,readArtifactPackage} from '../../docs/shared/ai-connection/package.mjs';

export const RECT_NATIVE_COMMIT='855f435120f08eb9e818e51281fc26f0e2633829';
export const RECT_CATALOG_SHA256='14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c';
export const RECT_REFERENCE_SHA256='44cf55e9ea5896f985a0ccf26f61cbb52650fd1a53d3fe80fc3e03aaae545c29';
export const RECT_INPUT_FILE_SHA256='dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612';
export const RECT_VALIDATION_SPEC=Object.freeze({coverage:'all-1536-fixed-profile-values',scope:'actual-vae-profile-decode',baseKind:'existing-Rect-export',referenceId:'wan21-e6:png-roundtrip.f32',referenceSha256:RECT_REFERENCE_SHA256,gate:Object.freeze({atol:2e-5,rtol:2e-5,maxAbs:2e-5})});
export const RECT_PRIOR_EVIDENCE=Object.freeze({publicationCommit:'e86d17f8fe3310875d3578ce838e1fc2c32271dc',actualExecutionCommit:'35151d1f447d6bba30931a8c28636b2d5d9c3820',moduleCommit:RECT_NATIVE_COMMIT,oldManagerCommit:'28596717182e48aeb23c719c51b6e593edf4e496',diffusionCommit:'5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3',scope:'reused actual encode/mean trace; new decode must produce its own validation and publication receipts',sourceRef:{repository:'Kushyameln01/kushyameln-works',commit:'35151d1f447d6bba30931a8c28636b2d5d9c3820',path:'development/inference/reference-adoption/p2/run/trace.json'},receiverReceiptRef:{repository:'Kushyameln01/kushyameln-works',commit:'e86d17f8fe3310875d3578ce838e1fc2c32271dc',path:'development/inference/reference-adoption/p1-adoption/RECEIPT.json'},freshEncode:false});
const PROFILE='wan21-raw-f32-1x16x32',MODEL='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b';
const RGB=[1,3,1,16,32],AXES=['N','C','T','H','W'],clone=structuredClone;
const source=(commit,path)=>({repository:'Kushyameln01/kushyameln-works',commit,path});
const bytes=t=>new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength);
const fail=(code,message)=>Object.assign(Error(message),{code});

/** Recheck the selected File bytes after preflight, before decoding or deriving
 * prior evidence. A codec-valid replacement mean is still a different input. */
export async function decodeRectOriginalInput(value,codec){
 if(!(value instanceof Uint8Array))throw fail('RECT_INPUT_ORIGINAL_MISMATCH','Exact351 original input bytes are required');
 const bytes=new Uint8Array(value);
 if(bytes.byteLength!==1084||await sha256Bytes(bytes)!==RECT_INPUT_FILE_SHA256)throw fail('RECT_INPUT_ORIGINAL_MISMATCH','The selected input differs from the fixed351 original file');
 return codec.decodeTensor(bytes);
}

/** Common declaration preparation is also used by the Node missing-asset
 * preflight. It creates no native client and supplies no future evidence. */
export function prepareRectNormInputs({tensor,referenceSet,managerCommit,resourceState,binding,managerRevision=1,nativeLocalRevision=101,artifactStore}={}){
 const store=artifactStore??createOwnedArtifactStore(),id=crypto.randomUUID();
 binding??={bindingId:`norm:rect-resource:${id}`,bindingRef:'norm:rect-vae-rgb',ownerId:resourceState?.ownerId??'norm:rect-vae-owner',sessionId:`norm:rect-manager:${id}`,resourceGeneration:`norm:rect-generation:${id}`};
 const target={requestId:`norm:rect-decode:${managerRevision}:${id}`,managerSessionId:binding.sessionId,managerRevision,resourceBinding:{bindingId:binding.bindingId,ownerId:binding.ownerId,resourceGeneration:binding.resourceGeneration},localRevisionBindings:{localRevision:nativeLocalRevision},activeToken:crypto.randomUUID()};
 const artifactId=`norm:rect-rgb:${target.requestId}`,traceId=`norm:rect-trace:${target.requestId}`;
 const semantics={schemaId:'norm:rect-rgb',schemaVersion:'1',spaceId:'raw-decoder-rgb',unit:'native-f32-value',normalization:'none'};
 const vs=source(RECT_NATIVE_COMMIT,'docs/shared/inference/vae-api.mjs'),ms=source(managerCommit,'docs/shared/ai-connection/package.mjs');
 const metadata={dtype:'float32',layout:'NCTHW',shape:RGB,meaning:'raw-decoder-rgb',modelSha256:MODEL,...(tensor.context?{context:clone(tensor.context)}:{})};
 const lineage=tensor.context?{inputs:[tensor.context.inputId],sourceFrames:[{inputId:tensor.context.inputId,slotId:tensor.context.slotId,indices:clone(tensor.context.sourceFrameIndices),...(tensor.context.sourceFrameTimesSeconds?{timesSeconds:clone(tensor.context.sourceFrameTimesSeconds)}:{})}]}:{inputs:[],sourceFrames:[]};
 const planned={contractVersion:'works-module-contract/1.0-draft.1',artifactId,kind:'tensor',native:{schemaId:'norm:rect-native',schemaVersion:'1',payloadRef:'pending:rgb',metadata},semantics,profileRef:PROFILE,tensor:{dtype:'float32',shape:RGB,axes:AXES,nativeMeaning:'raw-decoder-rgb',dataRef:'pending:rgb'},provenance:{producerRefs:[{identityKind:'model',role:'producer',algorithm:'sha256',value:MODEL,scope:'full-file'}],consumerBindings:[],transformTraceRefs:[traceId]},lineage,snapshotId:null,ownership:{ownerId:binding.ownerId,mode:'copy'},extensions:{'norm:rect-scope':{schemaId:'norm:rect-scope',schemaVersion:'1',requiredForUse:false,data:{freshEncode:false,generationReady:false,diagnosticProfileOnly:true}}}};
 const registry={schemas:[{schemaId:'norm:rect-native',schemaVersion:'1',g1cMetadata:true},{...semantics,nativeMeanings:['raw-decoder-rgb']},{schemaId:'norm:rect-raw',schemaVersion:'1',nativeMeanings:['raw-posterior-mean']}],roles:['latent-decoding','artifact-storage']};
 const inputHandle=captureNativeTensor({tensor,descriptor:{...clone(planned),artifactId:`norm:rect-input:${target.requestId}`,semantics:{schemaId:'norm:rect-raw',schemaVersion:'1',spaceId:'raw',unit:'native-f32-value',normalization:'none'},tensor:{...planned.tensor,shape:clone(tensor.shape),nativeMeaning:tensor.meaning},provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[]}},store,registry});
 const port=(bindingRef,owner,sourceRef,nativeAPI)=>({portId:bindingRef,bindingRef,owner,sourceRef,nativeAPI,artifactKind:'tensor',semantics,profileRef:PROFILE,tensor:{dtypes:['float32'],axes:AXES,shape:RGB},requiredMetadata:['/meaning','/modelSha256',...(tensor.context?['/context']:[])],requiredIdentities:[],ownershipModes:['copy'],transports:['direct'],allowedAdapterRefs:[],requiredExtensionSchemas:[]});
 const producerPort=port(binding.bindingRef,binding.ownerId,vs,{version:'works-ai-1',build:'works-inference-v1',transport:'direct',entrypoint:vs.path}),consumerPort=port('norm:rect-persistence','norm:rect-storage-owner',ms,{version:PACKAGE_VERSION,build:`manager-package:${managerCommit}`,transport:'direct',entrypoint:ms.path});
 const activeBindings={producer:{bindingRef:producerPort.bindingRef,ownerId:producerPort.owner,valid:true,currentRevision:nativeLocalRevision,expectedRevision:nativeLocalRevision},consumer:{bindingRef:consumerPort.bindingRef,ownerId:consumerPort.owner,valid:true,currentRevision:managerRevision,expectedRevision:managerRevision}};
 const actualResource=resourceState??{status:'available',ownerId:binding.ownerId,requiredBytes:0,budgetBytes:0,occupiedBytes:0,scope:'metadata-only-preflight; no model allocation or device budget certified'};
 const evidenceTarget={artifactRef:artifactId,profileRef:PROFILE,...Object.fromEntries(['coverage','scope','baseKind','referenceId'].map(k=>[k,RECT_VALIDATION_SPEC[k]]))};
 const edgeInput={producerPort,consumerPort,artifact:planned,registry,adapters:[],implementationState:{producer:{bindingRef:producerPort.bindingRef,state:'implemented',roles:['latent-decoding'],operationId:'decode'},consumer:{bindingRef:consumerPort.bindingRef,state:'implemented',roles:['artifact-storage'],operationId:'save-read'}},requiredScopes:[],evidence:[],activeBindings,resourceState:actualResource,referenceContext:{normIds:['N-IDENTITY','N-SHAPE','N-EVIDENCE','N-TRANSACTION','N-ARTIFACT'],candidateSet:{schemaVersion:'works-candidate-set/0.1-draft.1',status:'candidate',candidateSetId:'norm:rect-native855-required-route',sourceRef:vs,modules:[{module:'vae',sourceRef:vs},{module:'management',sourceRef:ms}]},identityBindings:[{side:'producer',module:'vae',loadedSourceRef:vs},{side:'consumer',module:'management',loadedSourceRef:ms}],profileBindings:[{recordId:'SHAPE-VAE-WAN21-F1-16X32',side:'producer',representation:'rgb-decoder-raw'}],nativeDeclarations:{producer:{nativeProfileId:PROFILE,modelSha256:MODEL}},evidenceTarget,managerState:{target},delegations:{'N-EVIDENCE':{checker:'owner-validation',target:evidenceTarget},'N-TRANSACTION':{checker:'queue.mjs',target},'N-ARTIFACT':{checker:'package.mjs',target:{artifactRef:artifactId,profileRef:PROFILE}}}}};
 const priorInputEvidence={...clone(RECT_PRIOR_EVIDENCE),profileId:PROFILE,modelSha256:MODEL,inputPayloadSha256:tensor.dataSha256,encodePayloadSha256:'289977e71b65ca42ac9f3fa2b614882bc0eba7420e70620927a25740db6f53a3',restoredPayloadSha256:tensor.dataSha256,context:tensor.context?clone(tensor.context):null};
 return {store,binding,target,edgeInput,inputHandle,registry,traceId,referenceSet,descriptor:{nativeAPI:producerPort.nativeAPI,operations:[{operationId:'decode',implementationState:'implemented',inputPorts:[]}]},validationSpec:clone(RECT_VALIDATION_SPEC),priorInputEvidence,readCurrent:()=>({target:clone(target),activeBindings:clone(activeBindings),resourceState:clone(actualResource)})};
}

async function loadBrowserReferences(){
 const catalogBytes=new Uint8Array(await(await fetch('/docs/shared/ai-connection/reference/catalog.v1.json')).arrayBuffer()),catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
 const files=new Map(await Promise.all(catalog.files.map(async f=>[f.path,new Uint8Array(await(await fetch('/'+f.path)).arrayBuffer())])));
 return loadReferenceSet({catalogBytes,files,expectedCatalogSha256:RECT_CATALOG_SHA256});
}
const base64=b=>{let s='';for(let o=0;o<b.length;o+=32768)s+=String.fromCharCode(...b.subarray(o,o+32768));return btoa(s);};
const unbase64=s=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
function compareAll(actual,reference,spec){let maxAbs=0,passed=actual.length===reference.length;const failedIndices=[];for(let i=0;i<reference.length;i++){const e=Math.abs(actual[i]-reference[i]);maxAbs=Math.max(maxAbs,e);if(!Number.isFinite(actual[i])||e>spec.gate.atol+spec.gate.rtol*Math.abs(reference[i])){passed=false;failedIndices.push(i);}}return {...clone(spec),passed:passed&&maxAbs<=spec.gate.maxAbs,count:reference.length,maxAbs,failedIndices};}
async function saveReadOutput({q,context,codec,caseName,plan}){
 const guard=async()=>{q.signal?.throwIfAborted();await q.ensureCurrent?.();q.signal?.throwIfAborted();};
 const progress=async record=>{await q.onProgress?.(record);};
 await guard();const handle=q.outputHandle,d=handle.descriptor,artifactId=d.artifactId,codecSource=source(RECT_NATIVE_COMMIT,'docs/shared/inference/tensor.mjs');
 const nativeBytes=await codec.encodeTensor(q.output.tensor);await guard();
 const nativeCodec={codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef:codecSource};
 const registry={...context.registry,codecs:[{...nativeCodec,decode:codec.decodeTensor}]};
 const trace={schemaVersion:1,artifactId,records:[{traceId:context.traceId,data:{target:q.target,priorInputEvidence:context.priorInputEvidence,nativeSourceCommit:RECT_NATIVE_COMMIT,managerSource:plan.managerSource,validationReceipt:q.validationReceipt,freshEncode:false,generationReady:false}}]};
 const assets=new Map([['rgb.wktensor',nativeBytes],['descriptor.json',canonicalBytes(d)],['evidence.json',canonicalBytes({schemaVersion:1,artifactId,records:[{evidenceId:`norm:rect-validation:${q.target.requestId}`,data:q.validationReceipt}]})],['trace.json',canonicalBytes(trace)],['snapshot.json',canonicalBytes(null)],['extensions.json',canonicalBytes(d.extensions)]]);
 const files=[['rgb.wktensor','native'],['descriptor.json','descriptor'],['evidence.json','evidence'],['trace.json','trace'],['snapshot.json','snapshot'],['extensions.json','extensions']].map(([path,kind])=>({path,kind,required:true}));
 const manifest={packageVersion:PACKAGE_VERSION,packageId:`norm:rect-package:${q.target.requestId}`,artifacts:[{artifactId,nativePath:'rgb.wktensor',descriptorPath:'descriptor.json',evidencePath:'evidence.json',tracePath:'trace.json',snapshotPath:'snapshot.json',extensionsPath:'extensions.json',codec:nativeCodec}],payloadBindings:[{ref:d.native.payloadRef,artifactId,nativePath:'rgb.wktensor',kind:'decoded-tensor-data'}],files,extensions:{}};
 const binaryAssets=exportBinaryAssets(d,context.store);if(binaryAssets.size)throw fail('UNEXPECTED_BINARY_METADATA','This exact Rect scope requires explicit additional attachment binding before publication');
 const receipt=await writeArtifactPackage(manifest,assets,{registry,write:async(path,data)=>{await guard();await globalThis.__rectWritePackageFile(caseName,path,base64(data));await progress({kind:'write',path,byteLength:data.length});await guard();}});
 await guard();const recovered=await readArtifactPackage({read:async path=>{await guard();const data=await globalThis.__rectReadPackageFile(caseName,path);await progress({kind:'read',path,found:data!==null});await guard();return data===null?null:unbase64(data);}},registry);await guard();
 if(recovered.status!=='complete')throw fail('RECT_READBACK_INCOMPLETE','Actual E4 required assets/native coherence failed');
 const t=recovered.artifacts[0].restoredNative,payloadSha256=await sha256Bytes(bytes(t));await guard();
 if(payloadSha256!==q.outputBinding.sha256)throw fail('RECT_READBACK_PAYLOAD_MISMATCH','Recovered native data differs from the new actual output');
 return {status:'complete',artifactRef:artifactId,profileRef:PROFILE,receiptRef:`norm:rect-readback:${receipt.manifestSha256}`,payloadSha256,packageReceipt:receipt,readback:{status:recovered.status,shape:t.shape,meaning:t.meaning,modelSha256:t.modelSha256,context:t.context??null,nativeFileSha256:await sha256Bytes(nativeBytes)},directoryName:caseName};
}

/** Called only after Node has authenticated sources, three original assets,
 * exact received input and the pre-existing independent RGB reference. */
export async function runNormRequiredRectBrowser(plan){
 const codec=await import('/native/shared/inference/tensor.mjs'),{createInferenceClient}=await import('/native/shared/inference/client.mjs'),{createVaeModule}=await import('/native/shared/inference/vae-api.mjs');
 const inputFile=document.querySelector('#rect-input').files[0],referenceFile=document.querySelector('#rect-reference').files[0];
 const input=await decodeRectOriginalInput(new Uint8Array(await inputFile.arrayBuffer()),codec),refBytes=new Uint8Array(await referenceFile.arrayBuffer());
 if(await sha256Bytes(refBytes)!==RECT_REFERENCE_SHA256)throw fail('RECT_REFERENCE_MISMATCH','The selected original reference bytes differ');
 const reference=new Float32Array(refBytes.buffer),files=new Map([...document.querySelector('#rect-assets').files].map(file=>[file.name,file]));
 const referenceSet=await loadBrowserReferences(),records=new WeakMap(),events=[],cases=[],store=createOwnedArtifactStore();let activeCase=null,adapter;
 const initial=prepareRectNormInputs({tensor:input,referenceSet,managerCommit:plan.managerCommit,resourceState:plan.resourceState,artifactStore:store});
 function owned(nativeClient,target){const r=records.get(nativeClient);if(!r||r.target.requestId!==target.requestId||r.target.activeToken!==target.activeToken)throw fail('RECT_WORKER_OWNER_MISMATCH','Worker lifecycle target is not this exact native owner');return r;}
 async function observedClose(nativeClient,target){const r=owned(nativeClient,target);if(!r.workerCreated)return {noWorkerStarted:true,requestId:target.requestId};const proof=await globalThis.__rectAwaitWorkerClosed(target.activeToken);if(proof?.closed!==true||proof.token!==target.activeToken)throw fail('RECT_WORKER_STOP_UNVERIFIED','Only the observed actual Worker close proves this stop');r.closeProof=proof;return proof;}
 adapter=createNormRequiredRectAdapter({descriptor:initial.descriptor,binding:initial.binding,sourceVerified:true,artifactStore:store,executionScope:'actual-vae-profile-decode',
  nativeFactory:async({target})=>{
   const record={target:clone(target),workerCreated:false,workerUrl:null,closeProof:null,client:null};
   const client=createInferenceClient({workerFactory:()=>{if(record.workerCreated)throw fail('RECT_WORKER_REUSE','One invocation creates exactly one owned native Worker');record.workerCreated=true;const url=new URL('/native/shared/inference/inference-worker.mjs',location.href);url.searchParams.set('rectJobToken',target.activeToken);record.workerUrl=url.href;events.push({kind:'native-worker-created',target:clone(target),url:url.href});return new Worker(url,{type:'module'});},onState:state=>{
    events.push({kind:'native-state',requestId:target.requestId,status:state.status,phase:state.progress?.phase??null,inputRevision:state.inputRevision});
    if(activeCase?.cancelAtRunning&&!activeCase.cancelRequested&&state.status==='running'&&state.progress?.phase==='running'){activeCase.cancelRequested=true;activeCase.cancellation=adapter.cancel(activeCase.context.target);activeCase.cancellation.catch(()=>{});}
   }});
   record.client=client;const native=createVaeModule({client,ownsClient:true});records.set(native,record);return native;
  },ownerLifecycle:{
   cancelled:async({target,nativeClient,nativeCancel})=>{const proof=await observedClose(nativeClient,target);events.push({kind:'owner-cancel-close',target:clone(target),proof});return {stopped:true,target:clone(target),evidenceRef:`playwright-worker-close:${target.activeToken}`,nativeCancel,workerClose:proof};},
   afterTerminal:async({target,nativeClient})=>{const proof=await observedClose(nativeClient,target);events.push({kind:'owner-terminal-close',target:clone(target),proof});return {reusable:true,target:clone(target),evidenceRef:`native-terminal-worker-close:${target.activeToken}`,workerClose:proof};},
   release:async({target,nativeClient})=>{const r=owned(nativeClient,target);if(r.client.state.status!=='disposed'||r.workerCreated&&!r.closeProof)throw fail('RECT_OWNER_RELEASE_UNVERIFIED','Native dispose and observed Worker close are required');events.push({kind:'owner-released',target:clone(target),nativeStatus:r.client.state.status});}
  }});
 try{
  const scenarios=plan.scenario==='cancel-recover'?[{name:'cancelled-decode',cancelAtRunning:true},{name:'recovered-decode',cancelAtRunning:false}]:[{name:'decoded-rgb',cancelAtRunning:false}];
  for(let i=0;i<scenarios.length;i++){
   const scenario=scenarios[i],context=i===0?initial:prepareRectNormInputs({tensor:input,referenceSet,managerCommit:plan.managerCommit,resourceState:plan.resourceState,binding:initial.binding,managerRevision:i+1,nativeLocalRevision:101+i,artifactStore:store});
   activeCase={...scenario,context,cancelRequested:false,cancellation:null};
   const q={...context,manifest:plan.manifest,files,readCurrent:context.readCurrent,validationSpec:context.validationSpec,validateOutput:async({output})=>compareAll(output.tensor.data,reference,context.validationSpec),publishOutput:async output=>saveReadOutput({q:output,context,codec,caseName:`${i+1}-${scenario.name}`,plan})};
   try{
    const result=await adapter.run(q);if(scenario.cancelAtRunning)throw fail('RECT_CANCEL_NOT_OBSERVED','Cancellation case completed without the required observed cancel boundary');
    const {outputHandle,...report}=result;cases.push({name:scenario.name,status:'PASS',...report});
   }catch(error){
    if(!scenario.cancelAtRunning||error.code!=='INVOCATION_CANCELLED')throw error;
    const cancellation=await activeCase.cancellation;if(!activeCase.cancelRequested||!cancellation?.stopConfirmed||!cancellation.resourceReleased||!cancellation.reusable)throw fail('RECT_CANCEL_NOT_OBSERVED','Actual cancel did not join owner stop, original terminal and release');
    cases.push({name:scenario.name,status:'PASS',cancelled:true,cancellation,queue:adapter.inspect(),modelInference:false,generationReady:false});
   }
  }
  return {status:'PASS',scenario:plan.scenario,cases,events,nativeCalls:events.filter(e=>e.kind==='native-worker-created').length,modelInference:true,freshEncode:false,generationReady:false,snapshotPublished:false};
 }catch(error){return {status:'FAIL',error:{code:error.code??null,message:String(error.message??error),publication:error.publication??null},cases,events,nativeCalls:events.filter(e=>e.kind==='native-worker-created').length,modelInference:cases.some(c=>c.modelInference===true),freshEncode:false,generationReady:false,snapshotPublished:false};}
 finally{await adapter.dispose();store.clear();}
}

/** Operational orchestration only. Numerical validation, shapes, transforms,
 * model loading and resource ownership remain with the fixed native owners. */
import {createInvocationQueue} from './queue.mjs';
import {compilePipeline} from './pipeline.mjs';
import {deriveWorkflowShapes} from './workflow-shapes.mjs';
import {buildManagementBundle,readManagementBundle} from './management-workspace.mjs';
export const deriveWorkflow=request=>deriveWorkflowShapes(request);
// structuredClone alone retains SharedArrayBuffer sharing. Snapshot every
// backing store while preserving view offsets/types and graph aliasing.
function clone(value,seen=new Map()){
 if(value===null||typeof value!=='object')return structuredClone(value);
 if(seen.has(value))return seen.get(value);
 if(value instanceof ArrayBuffer||typeof SharedArrayBuffer!=='undefined'&&value instanceof SharedArrayBuffer){const result=new Uint8Array(value).slice().buffer;seen.set(value,result);return result;}
 if(ArrayBuffer.isView(value)){const buffer=clone(value.buffer,seen),result=value instanceof DataView?new DataView(buffer,value.byteOffset,value.byteLength):new value.constructor(buffer,value.byteOffset,value.length);seen.set(value,result);return result;}
 if(value instanceof Blob)return structuredClone(value);
 if(value instanceof Map){const result=new Map();seen.set(value,result);for(const [k,v]of value)result.set(clone(k,seen),clone(v,seen));return result;}
 if(value instanceof Set){const result=new Set();seen.set(value,result);for(const v of value)result.add(clone(v,seen));return result;}
 if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))return structuredClone(value);
 const result=Array.isArray(value)?[]:{};seen.set(value,result);
 for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field.enumerable||!Object.hasOwn(field,'value'))throw error('INVALID_INPUT','Only enumerable data fields may cross native input boundaries');Object.defineProperty(result,key,{value:clone(field.value,seen),enumerable:true,writable:true,configurable:true});}
 return result;
}
const ids=['text','vae','diffusion','mean','p4','lora'];
const version='works-module-contract/1.0-draft.1';
const schema='works:operational-native-tensor',semantic='works:operational-native-value';
const registry={schemas:[{schemaId:schema,schemaVersion:'1'},{schemaId:semantic,schemaVersion:'1'}]};
const error=(code,message)=>Object.assign(Error(message),{code});
const validText=x=>typeof x==='string'&&x.length>0;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const plain=x=>x!==null&&typeof x==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(x));

async function defaultFactory({moduleId,configuration}){
 if(moduleId==='text'||moduleId==='vae'){const {createTextVaeStandaloneManagement}=await import('./adapters/text-vae-standalone/management.mjs');return createTextVaeStandaloneManagement({kind:moduleId,configuration});}
 if(moduleId==='p4'){const {createP4Management}=await import('./adapters/normal-p4-current.mjs');return createP4Management(configuration);}
 if(moduleId==='diffusion'){if(Object.hasOwn(configuration,'api'))throw error('CONTROL_TEST_SEAM_REQUIRED','Diffusion API injection is control-only; use the explicit services seam');const {createDiffusionPublicManagement}=await import('./adapters/diffusion-public/adapter.mjs');return createDiffusionPublicManagement(configuration);}
 const {createDiffusionMeanManagement}=await import('./adapters/diffusion-public/normalization.mjs');return createDiffusionMeanManagement(configuration);
}
async function codec(){const {createCurrentTextVaeCodec}=await import('./adapters/text-vae-standalone/native.mjs');return createCurrentTextVaeCodec();}
// R17 used this exact metadata identity for the same WKTSR001 implementation.
// This is a read-only alias over verified local code, never a package-directed
// import or a fallback accepting arbitrary codec/source identities.
const r17ReadCodec={codecId:'works:operational-wktensor',codecVersion:'badff7a/WKTSR001',sourceRef:{repository:'Kushyameln01/kushyameln-works',commit:'badff7a436b56207a084c4c770e01490899a576c',path:'docs/shared/inference/tensor.mjs'}};
const r17TensorSha256='7a15d721b1bab60cdade8723fd1c4d543a142d236cf2e59b63f1ba33ba14ed78';
let r17CodecVerification;
async function readCodecRegistry(current){
 r17CodecVerification??=(async()=>{
  const [{sha256Bytes},native]=await Promise.all([import('./canonical.mjs'),import('./adapters/text-vae-standalone/native.mjs')]);
  // The current adapter already verifies its exact pinned source tree before
  // exposing its codec. Also bind the legacy local source bytes to that digest.
  const actualCurrent=native.inspectTextVaeStandaloneAdoption().files.find(file=>file.path==='docs/shared/inference/tensor.mjs');
  const legacyUrl=new URL('./native/text-vae-badff7a/docs/shared/inference/tensor.mjs',import.meta.url);let legacyBytes;
  if(legacyUrl.protocol==='file:'){const {readFile}=await import('node:fs/promises');legacyBytes=new Uint8Array(await readFile(legacyUrl));}
  else{const response=await fetch(legacyUrl,{cache:'no-store'});if(!response.ok)throw error('LEGACY_CODEC_SOURCE_UNAVAILABLE','The pinned R17 tensor source is unavailable');legacyBytes=new Uint8Array(await response.arrayBuffer());}
  if(actualCurrent?.sha256!==r17TensorSha256||await sha256Bytes(legacyBytes)!==r17TensorSha256)throw error('LEGACY_CODEC_SOURCE_MISMATCH','R17 compatibility requires identical verified legacy/current tensor source bytes');
 })();
 await r17CodecVerification;return {...registry,codecs:[{...clone(r17ReadCodec),decode:current.decode}]};
}
function sameSavedField(a,b){
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(a instanceof ArrayBuffer||b instanceof ArrayBuffer||ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){
  if(a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;
  const left=new Uint8Array(a instanceof ArrayBuffer?a:a.buffer,a.byteOffset??0,a.byteLength);
  const right=new Uint8Array(b instanceof ArrayBuffer?b:b.buffer,b.byteOffset??0,b.byteLength);
  return left.every((value,i)=>value===right[i]);
 }
 if(Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&sameSavedField(a[k],b[k]));
}
function validateInput(value,seen=new Set()){
 if(typeof value==='function'||typeof value==='symbol')throw error('INVALID_INPUT','Native inputs must contain data, not callbacks or symbols');
 if(!value||typeof value!=='object'||value instanceof Blob||value instanceof ArrayBuffer||typeof SharedArrayBuffer!=='undefined'&&value instanceof SharedArrayBuffer||ArrayBuffer.isView(value))return;
 if(seen.has(value))throw error('INVALID_INPUT','Cyclic native input is unsupported');seen.add(value);
 if(!Array.isArray(value)&&!plain(value))throw error('INVALID_INPUT','Native input containers must be plain objects or arrays');
 for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field.enumerable||!Object.hasOwn(field,'value'))throw error('INVALID_INPUT','Native inputs require enumerable data fields');validateInput(field.value,seen);}
 seen.delete(value);
}
function preflightExternalPaths(value,records,produced){
 if(plain(value)&&Object.hasOwn(value,'$ref')){if(!produced.has(value.$ref))resolve(value,records);return;}
 if(Array.isArray(value)||plain(value))for(const child of Object.values(value))preflightExternalPaths(child,records,produced);
}
function refs(value,out=[],seen=new Set()){
 if(!value||typeof value!=='object'||value instanceof Blob||ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return out;
 if(seen.has(value))throw error('INVALID_INPUT','Cyclic input template');seen.add(value);
 if(plain(value)&&Object.hasOwn(value,'$ref')){
  if(!validText(value.$ref)||Object.keys(value).some(k=>!['$ref','path','requirementId'].includes(k)))throw error('INVALID_REFERENCE','Reference requires artifact $ref, optional path and optional native requirementId slot');
  if(value.requirementId!==undefined&&!validText(value.requirementId))throw error('INVALID_REFERENCE','Native slot requirementId must be a nonempty string');
  if(value.path!==undefined){if(typeof value.path!=='string'||value.path.split('.').some(p=>!p||['__proto__','prototype','constructor'].includes(p)))throw error('INVALID_REFERENCE_PATH','Reference path must select owned data fields');}
  out.push(value.$ref);
 }else for(const child of Object.values(value))refs(child,out,seen);
 seen.delete(value);return out;
}
function referenceEntries(value,out=[]){
 if(plain(value)&&Object.hasOwn(value,'$ref'))out.push(value);
 else if(plain(value)||Array.isArray(value))for(const child of Object.values(value))referenceEntries(child,out);
 return out;
}
function resolve(value,records){
 if(plain(value)&&Object.hasOwn(value,'$ref')){
  const r=records.get(value.$ref);if(!r)throw error('UNRESOLVED_ARTIFACT','Missing artifact '+value.$ref);
  let selected=r.response??{tensor:r.tensor,result:{tensor:r.tensor}};
  for(const key of value.path?.split('.')??[]){if(selected===null||typeof selected!=='object'||!Object.hasOwn(selected,key))throw error('UNRESOLVED_REFERENCE_PATH','No owned field '+value.path+' on '+value.$ref);selected=selected[key];}
  const owned=clone(selected);
  if(value.requirementId!==undefined){
   if(!plain(owned)||!Array.isArray(owned.shape)||!ArrayBuffer.isView(owned.data)||typeof owned.dtype!=='string')throw error('REQUIREMENT_TENSOR_REQUIRED','Native requirementId slots may bind only complete tensor values');
   if(owned.requirementId!==undefined&&owned.requirementId!==value.requirementId)throw error('REQUIREMENT_BINDING_CONFLICT','Tensor already declares a different native requirementId');
   // An explicit native port label, not a shape/meaning/normalization transform.
   owned.requirementId=value.requirementId;
  }
  return owned;
 }
 if(Array.isArray(value))return value.map(v=>resolve(v,records));
 if(plain(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v,records)]));
 return clone(value);
}
function descriptor(tensor,ref){
 const {data,...metadata}=tensor;
 if(!Array.isArray(tensor.shape)||typeof tensor.layout!=='string')throw error('NATIVE_TENSOR_DECLARATION','Native output must declare shape and layout');
 return {contractVersion:version,artifactId:'operational:'+crypto.randomUUID(),kind:'tensor',native:{schemaId:schema,schemaVersion:'1',payloadRef:ref,metadata:clone(metadata)},semantics:{schemaId:semantic,schemaVersion:'1',spaceId:tensor.meaning,unit:'native-value',normalization:tensor.normalization??'none'},tensor:{dtype:tensor.dtype,shape:clone(tensor.shape),axes:tensor.layout.split(''),nativeMeaning:tensor.meaning,dataRef:ref},provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[]},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:'operational:durable-copy',mode:'copy'},extensions:{}};
}
// Native codecs own their declared fields. Workspace sidecars retain every
// extra tensor/reply field, including masks, execution and transform inputMetadata.
function packetSidecar(value,tensor,tensorPaths,path=[]){
 if(value===tensor){tensorPaths.push(path);return {$operationalTensor:true};}
 if(Array.isArray(value))return value.map((v,i)=>packetSidecar(v,tensor,tensorPaths,[...path,String(i)]));
 if(plain(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,packetSidecar(v,tensor,tensorPaths,[...path,k])]));
 return clone(value);
}
function restorePacket(value,tensor,tensorPaths,path=[]){
 // Substitute only the recorded object-identity paths. Native extension data
 // that resembles our placeholder remains ordinary data.
 if(tensorPaths.some(p=>p.length===path.length&&p.every((v,i)=>v===path[i])))return clone(tensor);
 if(Array.isArray(value))return value.map((v,i)=>restorePacket(v,tensor,tensorPaths,[...path,String(i)]));
 if(plain(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,restorePacket(v,tensor,tensorPaths,[...path,k])]));
 return clone(value);
}
function fileMetadata(config,id){const out=[];function visit(v,path){if(v instanceof Blob){out.push({id:path,ref:id,role:'model-input',name:v.name??path,size:v.size,type:v.type,lastModified:v.lastModified});}else if(v instanceof ArrayBuffer||ArrayBuffer.isView(v)||typeof SharedArrayBuffer!=='undefined'&&v instanceof SharedArrayBuffer){out.push({id:path,ref:id,role:'model-input',name:path,size:v.byteLength,type:'application/octet-stream'});}else if(v instanceof Map)for(const [k,x]of v)visit(x,path+'/'+k);else if(Array.isArray(v)||plain(v))for(const [k,x]of Object.entries(v))visit(x,path+'/'+k);}visit(config,id);return out;}
function persistentConfig(value){if(value instanceof ArrayBuffer||ArrayBuffer.isView(value)||typeof SharedArrayBuffer!=='undefined'&&value instanceof SharedArrayBuffer)return {type:value.constructor.name,byteLength:value.byteLength,reselectRequired:true,originalFileEmbedded:false};if(value instanceof Blob)return {name:value.name??'',size:value.size,reselectRequired:true};if(value instanceof Map)return {entries:[...value].map(([k,v])=>[k,persistentConfig(v)]),reselectRequired:true};if(Array.isArray(value))return value.map(persistentConfig);if(plain(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,persistentConfig(v)]));return clone(value);}

/** services is a CONTROL-ONLY factory seam. Production never discovers injected
 * globals or falls back to test services. Defaults load only on configuration. */
export function createOperationalManagement({services}={}){
 if(services&&!(services.controlTestOnly===true&&typeof services.createModule==='function'))throw error('CONTROL_TEST_SEAM_REQUIRED','Injected services require controlTestOnly:true and createModule');
 const modules=new Map(ids.map(id=>[id,{id,revision:0,adapter:null,configuration:null,configured:false,state:'unconfigured'}]));
 const artifacts=new Map(),listeners=new Set(),recoveryOwners=new Set(),weightFeeds=new Map(),weightFeedToken=Symbol(),storageWriters=new Map();
 let lifecycleTail=Promise.resolve(),pendingLifecycleOperations=0,disposePromise=null;
 let revision=0,sequence=0,disposed=false,disposing=false,restoring=false,active=null,lastError=null,lastRoute=null,lastProfile=null,resourceGeneration=crypto.randomUUID();
 const managerId='operational:'+crypto.randomUUID();
 const live=(allowRestore=false)=>{if(disposed||disposing)throw error('MANAGEMENT_DISPOSED','Operational controller is disposed');if(restoring&&!allowRestore)throw error('WORKSPACE_BUSY','Workspace restoration is pending');};
 const moduleFor=id=>{const m=modules.get(id);if(!m)throw error('UNKNOWN_MODULE','Unknown operational module '+id);return m;};
 const binding=()=>({bindingId:managerId,ownerId:managerId,resourceGeneration,
  async cancel(target){
   const r=active;if(!r||r.target.requestId!==target.requestId)return {stopped:false};
   r.cancelled=true;const child=r.child;if(!child||!child.dispatched)return {stopped:true};
   // Capture the owner's exact current target once. A preflight may have no
   // native target yet; its forwarded AbortSignal still prevents dispatch.
   const nativeTarget=clone(child.adapter.inspect?.().activeTarget??null);let ack=null;
   if(child.moduleId==='diffusion')try{await invalidateFeedBindings();}catch(e){child.cancelError=e;r.cleanupUnconfirmed=true;}
   if(nativeTarget)try{ack=await child.adapter.cancel(nativeTarget);}catch(e){child.cancelError=e;}
   await child.done.promise;
   const terminal=child.reply?.terminal??child.adapter.inspect?.().queue?.invocations?.find(v=>v.requestId===child.requestId);
   const explicitStop=ack?.stopped===true||ack?.stopConfirmed===true||ack?.calculationStopped===true||ack?.cancelled===true&&ack?.originalTerminal===true&&ack?.resourceReleased===true;
   const terminalStop=terminal?.originalTerminal===true&&terminal?.resourceReleased===true&&(terminal?.calculationStopped===true||terminal?.resultAccepted===true);
   const stopped=explicitStop||terminalStop;if(!stopped)recoveryOwners.add(child.moduleId);return {stopped};
  },
  async afterTerminal(){return {reusable:active?.cleanupUnconfirmed!==true};},
  async release(){/* Child execute/cancel resolves only after its own release barrier. */}});
 const queue=createInvocationQueue({resourceBindings:[binding()]});
 function loraAvailability(){if(modules.get('lora').configured){const observation=modules.get('lora').adapter.inspect(),unavailable=Object.values(observation.sides??{}).find(side=>side.consumerEpochUnavailable)?.consumerEpochUnavailable,blocked=!!unavailable||observation.recoveryRequired||Object.values(observation.sides??{}).some(side=>side.recoveryRequired);return {status:blocked?'BLOCKED':'BOUND',dispatchSupported:!blocked,bindingKind:'FULL_MODEL_WEIGHT_FEED',reasons:unavailable?[{code:unavailable.code,reason:unavailable.message}]:blocked?[{code:'LORA_RECOVERY_REQUIRED',reason:'The bound SDK or consumer requires verified recovery'}]:[]};}const diffusion=modules.get('diffusion'),observation=diffusion.adapter?.inspect?.();const code=!diffusion.configured?'LORA_DIFFUSION_NOT_CONFIGURED':observation?.loaded!==true?'LORA_MODEL_LOAD_REQUIRED':![...weightFeeds.values()].some(feed=>feed.live)?'LORA_WEIGHT_FEED_REQUIRED':'LORA_CONFIGURATION_REQUIRED';return {status:'UNSUPPORTED',dispatchSupported:false,reasons:[{code,fieldPath:'/moduleId',reason:code==='LORA_DIFFUSION_NOT_CONFIGURED'?'Configure Diffusion before opening a model weight feed binding':code==='LORA_MODEL_LOAD_REQUIRED'?'Load the HIGH/LOW model pair before opening a weight feed binding':code==='LORA_WEIGHT_FEED_REQUIRED'?'Open a current model weight feed before creating the LoRA binding':'Apply the LoRA configuration using current dedicated feed bindings'}]};}
 function synchronizeFeeds(adapter,{removeClosed=false}={}){const observations=adapter?.inspect?.().weightFeeds;if(!Array.isArray(observations))return;for(const [feedId,feed]of weightFeeds){if(feed.adapter!==adapter)continue;const observed=observations.find(value=>value.feedId===feedId);if(!observed)continue;feed.metadata={...feed.metadata,...clone(observed)};if(observed.invalidated||observed.closed||observed.cleanupRequired)feed.live=false;if(removeClosed&&observed.closed===true&&observed.cleanupRequired!==true)weightFeeds.delete(feedId);}}
 function inspect(){synchronizeFeeds(modules.get('diffusion').adapter);return {disposed,disposing,pendingLifecycleOperations,recoveryOwners:[...recoveryOwners],restoringWorkspace:restoring,revision,activeTarget:clone(active?.target??null),modules:Object.fromEntries([...modules].map(([id,m])=>[id,{configured:m.configured,configurationRetained:m.configuration!==null,revision:m.revision,state:m.state,observation:clone(m.adapter?.inspect?.()??null)}])),artifacts:[...artifacts].map(([ref,r])=>({ref,moduleId:r.moduleId,operation:r.operation,descriptor:clone(r.descriptor),snapshot:clone(r.snapshot??null)})),weightFeeds:[...weightFeeds].map(([feedId,feed])=>({feedId,binding:clone(feed.metadata.binding),protocol:feed.metadata.protocol,live:feed.live,closed:feed.metadata.closed??false,cleanupRequired:feed.metadata.cleanupRequired??false})),lastError:clone(lastError),lastRoute:clone(lastRoute),queue:queue.inspect(),controlTestDouble:!!services,executionEvidence:services?'control-only injected factory; no numerical evidence':'fixed native owner factories',fullImplementationComplete:true,lora:loraAvailability(),implementationReview:{status:'PASSED',missingCodePaths:[]},managedNumericalAcceptance:'AWAITING_HOLDER_RECEIPT',wholeOperationalExperiment:'NOT_RUN',generationReady:false};}
 function emit(kind,value,isCurrent=()=>true){
  for(const fn of [...listeners]){
   if(!isCurrent())break;
   try{const event={kind,value:clone(value),state:inspect()};if(!isCurrent())break;fn(event);}catch{/* Subscribers cannot control resource ownership. */}
  }
 }
 function serializeLifecycle(action){
  pendingLifecycleOperations++;
  const work=lifecycleTail.then(action);
  lifecycleTail=work.then(()=>{},()=>{});
  return work.finally(()=>{pendingLifecycleOperations--;});
 }
 function ownerRequiresRecovery(adapter){
  const observation=adapter?.inspect?.();
  return observation?.recoveryRequired===true||observation?.cleanupRequired===true||observation?.queue?.groups?.some(g=>g.quarantined)===true;
 }
 async function retireOwner(m){
  if(m.id==='diffusion')for(const feed of weightFeeds.values())feed.live=false;
  if(m.id==='diffusion'&&modules.get('lora').adapter){const lora=modules.get('lora');lora.revision++;lora.configured=false;lora.state='unconfigured';await retireOwner(lora);}
  const retiring=m.adapter;
  if(!retiring)return;
  try{
   // Keep the original owner reachable until its release actually succeeds.
   await retiring.dispose();
   if(m.adapter===retiring)m.adapter=null;
   if(m.id==='diffusion')for(const [id,feed]of weightFeeds)if(feed.adapter===retiring)weightFeeds.delete(id);
   recoveryOwners.delete(m.id);
  }catch(e){
   m.configured=false;m.state='recovery-required';recoveryOwners.add(m.id);throw e;
  }
 }
 async function replaceOwner(m,captured,selected){
  try{
   if(active?.child?.moduleId===m.id){const target=active.target;await queue.cancelInvocation(target.invocationId??target.requestId,target);}
   await retireOwner(m);
   if(m.revision!==selected||disposed||disposing)return {configured:false,state:'superseded',revision:selected};
   const adapter=m.id==='lora'?await createBoundLora(captured):await (services?.createModule??defaultFactory)({moduleId:m.id,configuration:captured});
   // A completed factory owns a resource even if its configuration was retired
   // while awaiting it. Track it before attempting disposal, including failures.
   m.adapter=adapter;
   if(m.revision!==selected||disposed||disposing){await retireOwner(m);return {configured:false,state:'superseded',revision:selected};}
   m.configured=true;m.state='configured';
   emit('configured',{moduleId:m.id,revision:selected},()=>m.revision===selected&&m.configured&&!disposing&&!disposed);
   return inspect().modules[m.id];
  }catch(e){
   m.configured=false;
   if(recoveryOwners.has(m.id)||m.adapter&&ownerRequiresRecovery(m.adapter))m.state='recovery-required';else if(m.revision===selected)m.state='failed';
   lastError={code:e.code??'CONFIGURATION_FAILED',message:e.message};emit('error',lastError);throw e;
  }
 }
 async function configureModule(id,configuration={}){
  live();const m=moduleFor(id),captured=clone(configuration),selected=++m.revision;
  revision++;m.configured=false;m.state='configuring';m.configuration=captured;
  return serializeLifecycle(()=>replaceOwner(m,captured,selected));
 }
 function compileRoute(route,token){
  if(!Array.isArray(route?.steps)||!route.steps.length)throw error('PIPELINE_INVALID','Nonempty route steps required');
  for(const s of route.steps){if(s.operation==='openWeightFeed'&&token!==weightFeedToken)throw error('DEDICATED_WEIGHT_FEED_ROUTE_REQUIRED','Use openWeightFeed() for native MessagePort ownership');validateInput(s.input??{});}
  const steps=route.steps.map(s=>{moduleFor(s.moduleId);if(!validText(s.operation))throw error('PIPELINE_INVALID','Step operation required');return {...clone(s),input:clone(s.input??{}),outputRef:s.outputRef??s.stepId+':output'};});
  const produced=new Set(steps.map(s=>s.outputRef)),used=steps.flatMap(s=>refs(s.input));
  const externals=route.externalRefs??[...new Set(used.filter(ref=>!produced.has(ref)&&artifacts.has(ref)))];
  const profile={contractVersion:version,profileId:'operational-route:'+crypto.randomUUID(),profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:clone(externals),steps:steps.map(s=>({stepId:s.stepId,moduleId:s.moduleId,operationId:s.operation,inputBindings:referenceEntries(s.input).map((reference,i)=>({portId:'input:'+i,artifactRef:reference.$ref,...(route.workflowShapeRequest&&reference.requirementId!==undefined?{workflowRequirementId:reference.requirementId}:{})})),outputBindings:[{portId:'result',artifactRef:s.outputRef}],adapterRefs:[],resourceGroupRefs:[]})),requiredEvidenceScopes:[],...(route.finalRefs?{finalArtifactRefs:clone(route.finalRefs)}:{}),...(route.workflowShapeRequest?{workflowShapeRequest:clone(route.workflowShapeRequest)}:{})};
  const externalInputs=Object.fromEntries(externals.filter(ref=>artifacts.has(ref)).map(ref=>[ref,artifacts.get(ref)]));
  const plan=compilePipeline(profile,{externalInputs});
  for(const ref of externals)if(!artifacts.has(ref))throw error('PIPELINE_INVALID','External artifact payload unavailable: '+ref);
  // Resolve all external paths now; invalid paths cannot trigger a first owner call.
  for(const s of steps)for(const ref of refs(s.input))if(!produced.has(ref)&&!artifacts.has(ref))throw error('PIPELINE_INVALID','Missing external '+ref);
  const records=new Map(artifacts);for(const s of steps)preflightExternalPaths(s.input,records,produced);
  return {steps,plan,profile,records};
 }
 function retained(ref,moduleId,operation,response){const tensor=response.tensor??response.result?.tensor;if(!tensor)return null;const d=descriptor(tensor,ref),snapshot=clone(response.snapshot??null);d.snapshotId=snapshot?.snapshotId??null;const primaryTensorPaths=[],packet=packetSidecar(response,tensor,primaryTensorPaths);const record={moduleId,operation,descriptor:d,tensor:clone(tensor),response:clone(response),snapshot,sourceRecords:[{kind:'operational-native-response',moduleId,operation,packet,primaryTensorPaths}],trace:{schemaVersion:1,artifactId:d.artifactId,records:[]}};artifacts.set(ref,record);return record;}
 async function dispatchStep(s,r){
  const m=moduleFor(s.moduleId);if(!m.configured||m.revision!==r.revisions[s.moduleId])throw error('STALE_CONFIGURATION','Module configuration changed or is unconfigured: '+s.moduleId);
  const input=resolve(s.input,r.records),adapter=m.adapter,selected=m.revision;
  const child={moduleId:s.moduleId,adapter,requestId:r.requestId+':'+s.stepId,dispatched:false,done:deferred()};r.child=child;m.state='running';emit('step-start',{stepId:s.stepId,moduleId:s.moduleId,outputRef:s.outputRef},()=>!r.signal.aborted&&m.revision===selected&&active===r);
  try{if(r.signal.aborted||r.cancelled)throw error('INVOCATION_CANCELLED','Cancelled before child dispatch');child.dispatched=true;
   if(s.moduleId==='diffusion'&&['load','unload'].includes(s.operation))await invalidateFeedBindings();
   if(s.operation==='openWeightFeed'&&[...weightFeeds.values()].some(feed=>feed.metadata.binding?.side===input.side)){for(const feed of weightFeeds.values())if(feed.metadata.binding?.side===input.side)feed.live=false;const lora=modules.get('lora');if(lora.adapter){lora.revision++;lora.configured=false;lora.state='unconfigured';await retireOwner(lora);}}
   const options={operation:s.operation,input,requestId:child.requestId,signal:r.signal,onProgress:progress=>{if(!r.cancelled&&!r.signal.aborted&&m.revision===selected&&active===r)emit('progress',{moduleId:s.moduleId,requestId:r.requestId,progress},()=>!r.cancelled&&!r.signal.aborted&&m.revision===selected&&active===r);}};
   const response=s.operation==='openWeightFeed'?{status:'EXECUTION_COMPLETED',...await adapter.openWeightFeed({...input,requestId:child.requestId,signal:r.signal})}:await adapter.execute(options);
   child.reply=response;
   if(r.cancelled)throw error('INVOCATION_CANCELLED','Cancelled native result discarded');
   if(s.moduleId==='diffusion'&&['load','unload'].includes(s.operation)&&response.status==='EXECUTION_COMPLETED')synchronizeFeeds(adapter,{removeClosed:true});
   if(response.status!=='EXECUTION_COMPLETED')throw Object.assign(error('OWNER_UNSUPPORTED','Native owner did not complete this operation'),{response:clone(response),reasons:clone(response.reasons??[])});
   if(m.revision!==selected||disposed||disposing)throw error('STALE_CONFIGURATION','Delayed native result discarded');
   if(response.terminal&&(response.terminal.originalTerminal!==true||response.terminal.resourceReleased!==true)){r.cleanupUnconfirmed=true;throw error('OWNER_TERMINAL_UNCONFIRMED','Owner did not confirm original terminal and resource release');}
   emit('step-completed',{stepId:s.stepId,moduleId:s.moduleId,outputRef:s.outputRef},()=>!r.signal.aborted&&m.revision===selected&&active===r);if(r.signal.aborted||r.cancelled)throw error('INVOCATION_CANCELLED','Cancellation before result adoption');if(m.revision!==selected)throw error('STALE_CONFIGURATION','Configuration changed before result adoption');if(s.operation==='openWeightFeed'){synchronizeFeeds(adapter,{removeClosed:true});if(!validText(response.feedId))throw error('WEIGHT_FEED_DESCRIPTOR_REQUIRED','Dedicated owner must return a feed identifier');weightFeeds.set(response.feedId,{metadata:clone(response),adapter,revision:selected,live:true});}
   const artifact=retained(s.outputRef,s.moduleId,s.operation,response);r.records.set(s.outputRef,artifact??{moduleId:s.moduleId,operation:s.operation,response:clone(response)});m.state='configured';return {...clone(response),moduleId:s.moduleId,outputRef:s.outputRef,...(artifact?{artifact:clone(artifact)}:{})};
  }catch(e){m.state='failed';child.error=e;const observation=adapter.inspect?.();if(['RESOURCE_CLEANUP_FAILED','OWNER_TERMINAL_UNCONFIRMED'].includes(e.code)||observation?.recoveryRequired===true||observation?.cleanupRequired===true||observation?.queue?.groups?.some(g=>g.quarantined)){r.cleanupUnconfirmed=true;recoveryOwners.add(s.moduleId);}throw e;}finally{child.done.resolve();r.child=null;}
 }
 async function executeRoute(route,token){
  live();const compiled=compileRoute(route,token),requestId=managerId+':'+ ++sequence;
  const r={requestId,records:compiled.records,revisions:Object.fromEntries([...modules].map(([id,m])=>[id,m.revision])),cancelled:false,child:null};
  const invocation={id:requestId,requestId,ownerId:managerId,resourceBinding:managerId,resourceGeneration,revision:++revision,activeToken:crypto.randomUUID()};
  try{return await queue.enqueue(invocation,async({target,signal})=>{active=r;r.target=target;r.signal=signal;lastProfile=compiled.profile;emit('started',{requestId},()=>!signal.aborted&&active===r);const results=[];
    try{for(const id of compiled.plan.topologicalOrder){if(signal.aborted||r.cancelled)throw error('INVOCATION_CANCELLED','Route cancelled');const s=compiled.steps.find(s=>s.stepId===id);results.push({stepId:id,moduleId:s.moduleId,outputRef:s.outputRef,response:await dispatchStep(s,r)});}const result={status:'EXECUTION_COMPLETED',steps:results,finalRefs:compiled.plan.finalArtifactRefs,artifacts:Object.fromEntries([...r.records].map(([ref,v])=>[ref,clone(v)])),plan:compiled.plan};lastRoute={status:result.status,finalRefs:result.finalRefs,steps:results.map(({stepId,moduleId,outputRef})=>({stepId,moduleId,outputRef}))};return result;}
    finally{/* Keep active through queue owner terminal and release callbacks. */}
   });}catch(e){lastError={code:e.code??'EXECUTION_FAILED',message:e.message,issues:clone(e.issues??[]),reasons:clone(e.reasons??e.response?.reasons??[]),...(e.response?{response:clone(e.response)}:{})};emit('error',lastError);throw e;}finally{if(active===r)active=null;emit('terminal',{requestId});}
 }
 async function execute({moduleId,operation,input={},outputRef}={}){const ref=outputRef??moduleId+':output:'+crypto.randomUUID();const result=await executeRoute({steps:[{stepId:'operation',moduleId,operation,input,outputRef:ref}],finalRefs:[ref]});return result.steps[0].response;}
 async function query({moduleId,operation,input={}}={}){live();if(moduleId==='lora'&&!modules.get('lora').configured)return loraAvailability();validateInput(input);refs(input);const m=moduleFor(moduleId);if(!m.configured)return {status:'UNSUPPORTED',reasons:[{code:'MODULE_NOT_CONFIGURED',reason:'Configure '+moduleId+' with current local inputs first.'}]};const selected=m.revision,response=await m.adapter.query({operation,input:resolve(input,artifacts)});live();if(m.revision!==selected)throw error('STALE_CONFIGURATION','Support query superseded by module configuration');return clone(response);}
 async function cancel(target){live();if(!target)throw error('TARGET_MISMATCH','Exact inspect().activeTarget required');return queue.cancelInvocation(target.invocationId??target.requestId,target);}
 async function recover(moduleId){
  live();
  const selected=moduleId?[moduleFor(moduleId)]:[...modules.values()].filter(m=>m.configuration||recoveryOwners.has(m.id));
  const missing=[...recoveryOwners].filter(id=>!selected.some(m=>m.id===id));
  if(missing.length)throw Object.assign(error('RECOVERY_OWNER_REQUIRED','Recovery must release every implicated native owner: '+missing.join(', ')),{moduleIds:missing});
  const requests=selected.filter(m=>m.id!=='lora'||!selected.some(other=>other.id==='diffusion')).map(m=>{const configuration=m.configuration,selectedRevision=++m.revision;m.configured=false;m.state='recovering';return {m,configuration,selectedRevision};});
  revision++;
  return serializeLifecycle(async()=>{
   live();
   if(active){const target=active.target;await queue.cancelInvocation(target.invocationId??target.requestId,target);}
   await queue.drain();
   for(const request of requests)await replaceOwner(request.m,request.configuration,request.selectedRevision);
   if(queue.inspect().groups.some(g=>g.quarantined)){
    for(const m of modules.values())if(m.adapter&&ownerRequiresRecovery(m.adapter))recoveryOwners.add(m.id);
    if(recoveryOwners.size)throw Object.assign(error('RECOVERY_OWNER_REQUIRED','Native owner release remains unconfirmed: '+[...recoveryOwners].join(', ')),{moduleIds:[...recoveryOwners]});
    resourceGeneration=crypto.randomUUID();queue.rebindResource(binding(),{verified:true,evidenceRef:'operational:previous-original-terminal-and-disposal:'+revision});
   }
   emit('recovered',{moduleId:moduleId??null});return inspect();
  });
 }

 async function saveLoraPackage({side,preparedHandle,directoryHandle}={}){live();const {createLoraDirectoryStorage}=await import('./adapters/lora-standalone/storage.mjs'),storage=createLoraDirectoryStorage(directoryHandle),storageId='lora-storage:'+crypto.randomUUID();storageWriters.set(storageId,storage.writer);try{return await execute({moduleId:'lora',operation:'save',input:{side,preparedHandle,storageId}});}finally{storageWriters.delete(storageId);}}
 function feedFor(feedId){const feed=weightFeeds.get(feedId);if(!feed)throw error('WEIGHT_FEED_NOT_FOUND','No current native feed '+feedId);return feed;}
 function getWeightFeedClient(feedId){live();synchronizeFeeds(modules.get('diffusion').adapter);const feed=feedFor(feedId);if(!feed.live)throw error('WEIGHT_FEED_RETIRED','This feed is retained for cleanup only');return feed.adapter.getWeightFeedClient(feedId);}
 async function openWeightFeed(input={}){const result=await executeRoute({steps:[{stepId:'weight-feed',moduleId:'diffusion',operation:'openWeightFeed',input,outputRef:'weight-feed'}]},weightFeedToken);const {moduleId,outputRef,status,...metadata}=result.steps[0].response;return metadata;}
 async function invalidateFeedBindings(){for(const feed of weightFeeds.values())feed.live=false;const lora=modules.get('lora');if(lora.adapter){lora.revision++;lora.configured=false;lora.state='unconfigured';await retireOwner(lora);}}
 async function closeFeed(feedId,retry){live();const feed=feedFor(feedId);feed.live=false;return serializeLifecycle(async()=>{live();const lora=modules.get('lora');if(Object.values(lora.configuration?.feedIds??{}).includes(feedId)){lora.revision++;lora.configured=false;lora.state='unconfigured';await retireOwner(lora);}const receipt=await feed.adapter[retry?'retryCloseWeightFeed':'closeWeightFeed'](feedId);if(receipt?.closed!==true)throw error('WEIGHT_FEED_CLOSE_UNCONFIRMED','Native owner did not confirm feed closure; retain this ID for retry');weightFeeds.delete(feedId);emit('weight-feed-closed',{feedId});return clone(receipt);});}
 const closeWeightFeed=feedId=>closeFeed(feedId,false),retryCloseWeightFeed=feedId=>closeFeed(feedId,true);
 async function createBoundLora(configuration){
  const selected=Object.entries(configuration.feedIds??{});if(!selected.length)throw error('WEIGHT_FEED_REQUIRED','Bind one or both current dedicated weight feeds');
  const [{createLoraManagementSide},{createLoraManagement},{createAdoptedLoraKernel,createLoraProductCache}]=await Promise.all([import('./adapters/lora-standalone/adapter.mjs'),import('./adapters/lora-standalone/management.mjs'),import('./adapters/lora-standalone/native.mjs')]);
  const sides={},resources=[];let coordinator;
  try{for(const [side,id]of selected){const feed=feedFor(id);if(!['HIGH','LOW'].includes(side)||feed.metadata.binding?.side!==side)throw error('WEIGHT_FEED_SIDE_MISMATCH','Feed side must match the explicit LoRA side');const client=getWeightFeedClient(id),bindingCurrent=()=>feed.live&&weightFeeds.get(id)===feed&&modules.get('diffusion').adapter===feed.adapter&&modules.get('diffusion').revision===feed.revision;const guardedConsumer={contractVersion:client.consumer.contractVersion};for(const name of ['describe','currentEpoch','rollback','releaseCandidate'])if(typeof client.consumer[name]==='function')guardedConsumer[name]=(...args)=>Reflect.apply(client.consumer[name],client.consumer,args);for(const name of ['prepareLoad','validate','commit'])guardedConsumer[name]=(value,context={})=>{const original=context.isCurrent;return client.consumer[name](value,{...context,isCurrent:()=>bindingCurrent()&&(!original||original())});};const guardedBase={describe:()=>{if(!bindingCurrent())throw error('WEIGHT_FEED_RETIRED','LoRA base binding retired');return client.baseProvider.describe();},async readBlock(weightId,offset,count,context={}){const original=context.isCurrent;if(!bindingCurrent())throw error('WEIGHT_FEED_RETIRED','LoRA base binding retired');const result=await client.baseProvider.readBlock(weightId,offset,count,{...context,isCurrent:()=>bindingCurrent()&&(!original||original())});if(!bindingCurrent())throw error('WEIGHT_FEED_RETIRED','LoRA base binding retired');return result;}};const kernel=await createAdoptedLoraKernel(),cache=createLoraProductCache({maxBytes:configuration.cacheMaxBytes??67108864});resources.push({kernel,cache});sides[side]=await createLoraManagementSide({side,registry:feed.metadata.nativeDescriptor.logicalRegistry,baseProvider:guardedBase,consumer:guardedConsumer,kernel,cache});}
   coordinator=createLoraManagement({sides});
  }catch(e){for(const adapter of Object.values(sides))await adapter.dispose();for(const {kernel,cache}of resources){cache.clear();kernel.dispose();}throw e;}
  return Object.freeze({
   async execute({operation,input,requestId,signal,onProgress}){const {side,...args}=input;if(operation==='save'){const writer=storageWriters.get(args.storageId);if(!writer)throw error('LORA_STORAGE_REQUIRED','Use saveLoraPackage with a dedicated directory handle');delete args.storageId;args.writer=writer;}const result=await coordinator.run({side,operation,args,requestId,signal,onProgress});return {status:'EXECUTION_COMPLETED',result,terminal:{originalTerminal:true,resourceReleased:true,resultAccepted:true,reusable:true}};},
   query({input}){const side=input?.side??Object.keys(sides)[0];if(!sides[side])return {status:'UNSUPPORTED',reasons:[{code:'LORA_SIDE_UNBOUND',reason:'Open and bind the requested model side first'}]};return sides[side].query();},
   inspect(){const observation=coordinator.inspect(),running=Object.entries(sides).find(([,adapter])=>adapter.inspect().activeTarget);return {...observation,modelBinding:{kind:'FULL_MODEL_WEIGHT_FEED',feeds:selected.map(([side,feedId])=>({side,feedId,binding:clone(feedFor(feedId).metadata.binding),nativeDescriptor:clone(feedFor(feedId).metadata.nativeDescriptor)}))},feedIds:clone(configuration.feedIds),activeTarget:running?{side:running[0],target:running[1].inspect().activeTarget}:null};},
   cancel(target){const side=sides[target?.side];if(!side)throw error('TARGET_MISMATCH','Current LoRA side target required');return side.cancel(target.target);},
   async dispose(){await coordinator.dispose();for(const {kernel,cache}of resources){cache.clear();kernel.dispose();}}
  });
 }
 async function importTensor(ref,file){live();if(!validText(ref)||!(file instanceof Blob))throw error('TENSOR_FILE_REQUIRED','Artifact reference and File/Blob required');const c=await codec(),tensor=await c.decode(new Uint8Array(await file.arrayBuffer()));live();const response={status:'IMPORTED',tensor,result:{tensor}};const record=retained(ref,null,'import',response);emit('imported',{ref});return clone(record);}
 async function saveTensor(ref){
  live();const r=artifacts.get(ref);if(!r)throw error('ARTIFACT_NOT_FOUND','Missing tensor '+ref);
  const tensor=clone(r.tensor),c=await codec(),bytes=await c.encode(tensor),decoded=await c.decode(bytes);
  for(const [key,value]of Object.entries(tensor))if(!Object.hasOwn(decoded,key)||!sameSavedField(value,decoded[key]))throw Object.assign(error('NATIVE_SAVE_METADATA_LOSS','Native tensor codec omits or changes '+key+'; save the workspace to retain the complete native payload and metadata.'),{fieldPath:'/tensor/'+key.replaceAll('~','~0').replaceAll('/','~1')});
  return new Blob([bytes],{type:'application/octet-stream'});
 }
 async function saveWorkspace({workspaceSettings={}}={}){live();validateInput(workspaceSettings);if(active)throw error('WORKSPACE_BUSY','Wait for the current original operation terminal before saving');const records=Object.fromEntries([...artifacts].map(([ref,r])=>[ref,clone(r)]));const profile=lastProfile??{contractVersion:version,profileId:'operational:imports',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:[...artifacts.keys()],steps:[{stepId:'saved',moduleId:'mean',operationId:'restore',inputBindings:[],outputBindings:[],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:[]};return buildManagementBundle({state:{profile,workspaceSettings:clone(workspaceSettings),snapshots:[...artifacts.values()].map(r=>r.snapshot).filter(Boolean),moduleConfigurations:Object.fromEntries([...modules].filter(([,m])=>m.configuration).map(([id,m])=>[id,persistentConfig(m.configuration)]))},artifacts:records,fileRequirements:[...modules.values()].flatMap(m=>fileMetadata(m.configuration,m.id)),registry,codec:await codec()});}
 async function restoreWorkspace(file){
  live();
  if(active||queue.inspect().invocations.some(v=>['queued','running','cancelling','cleanup'].includes(v.state)))throw error('WORKSPACE_BUSY','Wait for queued and current original operation terminals before restoring');
  restoring=true;
  try{
   const bytes=file instanceof Uint8Array?clone(file):new Uint8Array(await file.arrayBuffer());
   const currentCodec=await codec(),restored=await readManagementBundle(bytes,{registry:await readCodecRegistry(currentCodec),codec:currentCodec});
   live(true);
   const nextRecords=new Map();
   for(const [ref,r]of Object.entries(restored.artifacts)){
    // The verified descriptor retains the original metadata. Codec framing
    // fields are serialization details, never new native tensor declarations.
    r.tensor={...clone(r.descriptor.native.metadata),data:r.tensor.data};
    const source=r.sourceRecords?.find(s=>s.kind==='operational-native-response');
    r.moduleId=source?.moduleId??null;r.operation=source?.operation??'import';
    r.response=source?restorePacket(source.packet,r.tensor,source.primaryTensorPaths??[]):{tensor:clone(r.tensor),result:{tensor:clone(r.tensor)}};
    nextRecords.set(ref,r);
   }
   for(const m of modules.values()){m.revision++;m.configured=false;m.state='unconfigured';}
   return await serializeLifecycle(async()=>{
    live(true);
    for(const m of modules.values()){await retireOwner(m);m.configuration=null;}
    live(true);
    artifacts.clear();for(const [ref,r]of nextRecords)artifacts.set(ref,r);
    revision++;lastProfile=restored.state.profile;lastRoute=null;
    emit('restored',{artifactRefs:[...artifacts.keys()]});
    return {status:'RESTORED',artifactRefs:[...artifacts.keys()],fileRequirements:restored.fileRequirements,workspaceSettings:clone(restored.settings),modelReselectionRequired:true};
   });
  }finally{restoring=false;}
 }
 async function dispose(){
  if(disposed)return {disposed:true};
  if(disposePromise)return disposePromise;
  disposing=true;
  for(const m of modules.values()){m.revision++;m.configured=false;}
  revision++;
  const queueTerminal=queue.dispose();
  disposePromise=serializeLifecycle(async()=>{
   // Earlier configuration factories and retirements must reach their original
   // terminal before the manager can claim all native resources are disposed.
   await queueTerminal;
   for(const m of modules.values()){await retireOwner(m);m.configuration=null;m.state='disposed';}
   disposed=true;disposing=false;listeners.clear();return {disposed:true};
  });
  try{return await disposePromise;}finally{disposePromise=null;}
 }
 return Object.freeze({configureModule,execute,executeRoute,query,cancel,recover,dispose,inspect,deriveWorkflow,saveLoraPackage,openWeightFeed,getWeightFeedClient,closeWeightFeed,retryCloseWeightFeed,importTensor,saveTensor,saveWorkspace,restoreWorkspace,subscribe(fn){if(typeof fn!=='function')throw TypeError('Listener required');listeners.add(fn);return ()=>listeners.delete(fn);}});
}

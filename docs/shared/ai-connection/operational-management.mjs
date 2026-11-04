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
const ids=['text','vae','diffusion','mean'];
const version='works-module-contract/1.0-draft.1';
const schema='works:operational-native-tensor',semantic='works:operational-native-value';
const registry={schemas:[{schemaId:schema,schemaVersion:'1'},{schemaId:semantic,schemaVersion:'1'}]};
const error=(code,message)=>Object.assign(Error(message),{code});
const validText=x=>typeof x==='string'&&x.length>0;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const plain=x=>x!==null&&typeof x==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const loraUnsupported=()=>({status:'UNSUPPORTED',dispatchSupported:false,reasons:[{code:'LORA_MODEL_BINDING_UNAVAILABLE',fieldPath:'/moduleId',reason:'Fixed Diffusion public Worker/sampler has no completed LoRA model weight source binding API.'}],fullImplementationComplete:false});
async function defaultFactory({moduleId,configuration}){
 if(moduleId==='text'||moduleId==='vae'){const {createTextVaeStandaloneManagement}=await import('./adapters/text-vae-standalone/management.mjs');return createTextVaeStandaloneManagement({kind:moduleId,configuration});}
 if(moduleId==='diffusion'){if(Object.hasOwn(configuration,'api'))throw error('CONTROL_TEST_SEAM_REQUIRED','Diffusion API injection is control-only; use the explicit services seam');const {createDiffusionPublicManagement}=await import('./adapters/diffusion-public/adapter.mjs');return createDiffusionPublicManagement(configuration);}
 const {createDiffusionMeanManagement}=await import('./adapters/diffusion-public/normalization.mjs');return createDiffusionMeanManagement(configuration);
}
async function codec(){const native=await import('./adapters/text-vae-standalone/native.mjs');return {codecId:'works:operational-wktensor',codecVersion:'badff7a/WKTSR001',sourceRef:{repository:'Kushyameln01/kushyameln-works',commit:'badff7a436b56207a084c4c770e01490899a576c',path:'docs/shared/inference/tensor.mjs'},encode:native.encodeTensor,decode:native.decodeTensor};}
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
 const artifacts=new Map(),listeners=new Set(),recoveryOwners=new Set();
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
 function inspect(){return {disposed,disposing,pendingLifecycleOperations,recoveryOwners:[...recoveryOwners],restoringWorkspace:restoring,revision,activeTarget:clone(active?.target??null),modules:Object.fromEntries([...modules].map(([id,m])=>[id,{configured:m.configured,configurationRetained:m.configuration!==null,revision:m.revision,state:m.state,observation:clone(m.adapter?.inspect?.()??null)}])),artifacts:[...artifacts].map(([ref,r])=>({ref,moduleId:r.moduleId,operation:r.operation,descriptor:clone(r.descriptor),snapshot:clone(r.snapshot??null)})),lastError:clone(lastError),lastRoute:clone(lastRoute),queue:queue.inspect(),controlTestDouble:!!services,executionEvidence:services?'control-only injected factory; no numerical evidence':'fixed native owner factories',fullImplementationComplete:false,lora:loraUnsupported(),generationReady:false};}
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
  const retiring=m.adapter;
  if(!retiring)return;
  try{
   // Keep the original owner reachable until its release actually succeeds.
   await retiring.dispose();
   if(m.adapter===retiring)m.adapter=null;
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
   const adapter=await (services?.createModule??defaultFactory)({moduleId:m.id,configuration:captured});
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
 function compileRoute(route){
  if(!Array.isArray(route?.steps)||!route.steps.length)throw error('PIPELINE_INVALID','Nonempty route steps required');
  for(const s of route.steps)validateInput(s.input??{});
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
  try{if(r.signal.aborted||r.cancelled)throw error('INVOCATION_CANCELLED','Cancelled before child dispatch');child.dispatched=true;const response=await adapter.execute({operation:s.operation,input,requestId:child.requestId,signal:r.signal,onProgress:progress=>{if(!r.cancelled&&!r.signal.aborted&&m.revision===selected&&active===r)emit('progress',{moduleId:s.moduleId,requestId:r.requestId,progress},()=>!r.cancelled&&!r.signal.aborted&&m.revision===selected&&active===r);}});
   child.reply=response;
   if(r.cancelled)throw error('INVOCATION_CANCELLED','Cancelled native result discarded');
   if(response.status!=='EXECUTION_COMPLETED')throw Object.assign(error('OWNER_UNSUPPORTED','Native owner did not complete this operation'),{response:clone(response),reasons:clone(response.reasons??[])});
   if(m.revision!==selected||disposed||disposing)throw error('STALE_CONFIGURATION','Delayed native result discarded');
   if(response.terminal&&(response.terminal.originalTerminal!==true||response.terminal.resourceReleased!==true)){r.cleanupUnconfirmed=true;throw error('OWNER_TERMINAL_UNCONFIRMED','Owner did not confirm original terminal and resource release');}
   emit('step-completed',{stepId:s.stepId,moduleId:s.moduleId,outputRef:s.outputRef},()=>!r.signal.aborted&&m.revision===selected&&active===r);if(r.signal.aborted||r.cancelled)throw error('INVOCATION_CANCELLED','Cancellation before result adoption');if(m.revision!==selected)throw error('STALE_CONFIGURATION','Configuration changed before result adoption');const artifact=retained(s.outputRef,s.moduleId,s.operation,response);r.records.set(s.outputRef,artifact??{moduleId:s.moduleId,operation:s.operation,response:clone(response)});m.state='configured';return {...clone(response),moduleId:s.moduleId,outputRef:s.outputRef,...(artifact?{artifact:clone(artifact)}:{})};
  }catch(e){m.state='failed';child.error=e;const observation=adapter.inspect?.();if(['RESOURCE_CLEANUP_FAILED','OWNER_TERMINAL_UNCONFIRMED'].includes(e.code)||observation?.recoveryRequired===true||observation?.cleanupRequired===true||observation?.queue?.groups?.some(g=>g.quarantined)){r.cleanupUnconfirmed=true;recoveryOwners.add(s.moduleId);}throw e;}finally{child.done.resolve();r.child=null;}
 }
 async function executeRoute(route){
  live();const compiled=compileRoute(route),requestId=managerId+':'+ ++sequence;
  const r={requestId,records:compiled.records,revisions:Object.fromEntries([...modules].map(([id,m])=>[id,m.revision])),cancelled:false,child:null};
  const invocation={id:requestId,requestId,ownerId:managerId,resourceBinding:managerId,resourceGeneration,revision:++revision,activeToken:crypto.randomUUID()};
  try{return await queue.enqueue(invocation,async({target,signal})=>{active=r;r.target=target;r.signal=signal;lastProfile=compiled.profile;emit('started',{requestId},()=>!signal.aborted&&active===r);const results=[];
    try{for(const id of compiled.plan.topologicalOrder){if(signal.aborted||r.cancelled)throw error('INVOCATION_CANCELLED','Route cancelled');const s=compiled.steps.find(s=>s.stepId===id);results.push({stepId:id,moduleId:s.moduleId,outputRef:s.outputRef,response:await dispatchStep(s,r)});}const result={status:'EXECUTION_COMPLETED',steps:results,finalRefs:compiled.plan.finalArtifactRefs,artifacts:Object.fromEntries([...r.records].map(([ref,v])=>[ref,clone(v)])),plan:compiled.plan};lastRoute={status:result.status,finalRefs:result.finalRefs,steps:results.map(({stepId,moduleId,outputRef})=>({stepId,moduleId,outputRef}))};return result;}
    finally{/* Keep active through queue owner terminal and release callbacks. */}
   });}catch(e){lastError={code:e.code??'EXECUTION_FAILED',message:e.message,issues:clone(e.issues??[]),reasons:clone(e.reasons??e.response?.reasons??[]),...(e.response?{response:clone(e.response)}:{})};emit('error',lastError);throw e;}finally{if(active===r)active=null;emit('terminal',{requestId});}
 }
 async function execute({moduleId,operation,input={},outputRef}={}){const ref=outputRef??moduleId+':output:'+crypto.randomUUID();const result=await executeRoute({steps:[{stepId:'operation',moduleId,operation,input,outputRef:ref}],finalRefs:[ref]});return result.steps[0].response;}
 async function query({moduleId,operation,input={}}={}){live();if(moduleId==='lora')return loraUnsupported();validateInput(input);refs(input);const m=moduleFor(moduleId);if(!m.configured)return {status:'UNSUPPORTED',reasons:[{code:'MODULE_NOT_CONFIGURED',reason:'Configure '+moduleId+' with current local inputs first.'}]};const selected=m.revision,response=await m.adapter.query({operation,input:resolve(input,artifacts)});live();if(m.revision!==selected)throw error('STALE_CONFIGURATION','Support query superseded by module configuration');return clone(response);}
 async function cancel(target){live();if(!target)throw error('TARGET_MISMATCH','Exact inspect().activeTarget required');return queue.cancelInvocation(target.invocationId??target.requestId,target);}
 async function recover(moduleId){
  live();
  const selected=moduleId?[moduleFor(moduleId)]:[...modules.values()].filter(m=>m.configuration||recoveryOwners.has(m.id));
  const missing=[...recoveryOwners].filter(id=>!selected.some(m=>m.id===id));
  if(missing.length)throw Object.assign(error('RECOVERY_OWNER_REQUIRED','Recovery must release every implicated native owner: '+missing.join(', ')),{moduleIds:missing});
  const requests=selected.map(m=>{const configuration=m.configuration,selectedRevision=++m.revision;m.configured=false;m.state='recovering';return {m,configuration,selectedRevision};});
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
   const restored=await readManagementBundle(bytes,{registry,codec:await codec()});
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
 return Object.freeze({configureModule,execute,executeRoute,query,cancel,recover,dispose,inspect,deriveWorkflow,importTensor,saveTensor,saveWorkspace,restoreWorkspace,subscribe(fn){if(typeof fn!=='function')throw TypeError('Listener required');listeners.add(fn);return ()=>listeners.delete(fn);}});
}

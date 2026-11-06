/** Development CONTROL reference owner, independently usable in Node/browser.
 * Copies caller-supplied or saved tensors. It performs no neural inference,
 * normalization, layer mapping, LoRA application or numerical acceptance gate.
 * Fixture controls are deliberately separate from the normal owner protocol. */
const clone=structuredClone,kind='CONTROL_REFERENCE_ONLY';
const nativeSchema='works:reference-control-tensor',semanticSchema='works:reference-control-value';
/** Persistence schema declarations only. Registration does not assert current
 * owner availability, model loading, capability or permission to dispatch. */
export const REFERENCE_REGISTRY=Object.freeze({schemas:Object.freeze([Object.freeze({schemaId:nativeSchema,schemaVersion:'1'}),Object.freeze({schemaId:semanticSchema,schemaVersion:'1'})]),roles:Object.freeze(['tensor-transform'])});
const text=v=>typeof v==='string'&&v.length>0;
const fail=(code,message)=>Object.assign(Error(message),{code});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const same=(a,b)=>{if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){if(a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);return x.every((v,i)=>v===y[i]);}const keys=Object.keys(a).sort(),other=Object.keys(b).sort();return keys.length===other.length&&keys.every((k,i)=>k===other[i]&&same(a[k],b[k]));};
const types={float32:[Float32Array,4],float64:[Float64Array,8],int32:[Int32Array,4],uint32:[Uint32Array,4],int16:[Int16Array,2],uint16:[Uint16Array,2],int8:[Int8Array,1],uint8:[Uint8Array,1]};
let sourceIdentity;
async function loadIdentity(){
 if(!sourceIdentity)sourceIdentity=(async()=>{let bytes;if(new URL(import.meta.url).protocol==='file:'){const {readFile}=await import('node:fs/promises');bytes=await readFile(new URL(import.meta.url));}else{const response=await fetch(import.meta.url,{cache:'no-store'});if(!response.ok)throw fail('REFERENCE_SOURCE_UNAVAILABLE','Actual reference owner module bytes could not be read');bytes=new Uint8Array(await response.arrayBuffer());}const hash=await crypto.subtle.digest('SHA-256',bytes);return {sourceRef:{archiveRef:'works-management-control-reference-owner/v1',sha256:[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('')},bytes:bytes.byteLength};})();
 return sourceIdentity;
}

/** Build ordinary common descriptors from explicit tensor declarations. The
 * data array is optional for shape-only support queries; execution checks it. */
export function createReferenceDescriptor(operationId,tensorOrNamed,{named=false,artifactId='reference-input:'+crypto.randomUUID(),extensions={},provenance,lineage,parameters}={}){
 if(!text(operationId))throw TypeError('Explicit reference operation required');
 const artifact=(tensor,id)=>{
  if(!tensor||!text(tensor.dtype)||!Array.isArray(tensor.shape)||!text(tensor.layout)||!text(tensor.meaning))throw TypeError('Explicit dtype, shape, layout and meaning required');
  const {data,...metadata}=clone(tensor);return {contractVersion:'works-module-contract/1.0-draft.1',artifactId:id,kind:'tensor',native:{schemaId:nativeSchema,schemaVersion:'1',payloadRef:'local:'+id,metadata},semantics:{schemaId:semanticSchema,schemaVersion:'1',spaceId:tensor.meaning,unit:'caller-native-value',normalization:tensor.normalization??'none'},...(tensor.profileId!==undefined?{profileRef:tensor.profileId}:{}),tensor:{dtype:tensor.dtype,shape:[...tensor.shape],axes:tensor.axes?[...tensor.axes]:tensor.layout.split(''),nativeMeaning:tensor.meaning,dataRef:'local:'+id},provenance:clone(provenance??{producerRefs:[],consumerBindings:[],transformTraceRefs:[]}),lineage:clone(lineage??{inputs:[],sourceFrames:[]}),snapshotId:null,ownership:{ownerId:'reference:caller',mode:'copy'},extensions:clone(extensions)};
 };
 if(named){if(!tensorOrNamed||!Object.keys(tensorOrNamed).length)throw TypeError('Nonempty named tensor map required');return {operationId,artifacts:Object.fromEntries(Object.entries(tensorOrNamed).map(([name,t])=>[name,artifact(t,artifactId+':'+name)])),...(parameters!==undefined?{parameters:clone(parameters)}:{})};}
 return {operationId,artifact:artifact(tensorOrNamed,artifactId),...(parameters!==undefined?{parameters:clone(parameters)}:{})};
}

export async function createReferenceOwner({ownerId='reference:control',configuration={},behavior={}}={}){
 if(!text(ownerId))throw TypeError('Reference owner ID required');
 const source=await loadIdentity(),sourceRef=source.sourceRef;
 let instance=crypto.randomUUID(),revision=0,generation=0,disposed=false,cleanupPending=false,active=null;
 let config=normalizeConfig(configuration),mode='success',releaseFailures=0;
 const supports=[],history=new Map(),waiters=[];
 function normalizeConfig(value){const c={operations:['copy'],budgetBytes:536870912,requiredFiles:[],files:[],supportedTensor:{},...clone(value)};if(!Array.isArray(c.operations)||!c.operations.every(text)||!Number.isSafeInteger(c.budgetBytes)||c.budgetBytes<0||!Array.isArray(c.requiredFiles)||!c.requiredFiles.every(text)||!c.supportedTensor||typeof c.supportedTensor!=='object')throw TypeError('Valid operations, logical budget, file requirements and tensor declaration required');return c;}
 const live=()=>{if(disposed)throw fail('REFERENCE_OWNER_DISPOSED','Reference owner disposed');if(cleanupPending)throw fail('REFERENCE_RECOVERY_REQUIRED','Owned reference resources require release recovery');};
 const identity=()=>({ownerInstanceId:instance,configurationRevision:revision,resourceGeneration:'reference:'+instance+':'+generation});
 function observe(){return {ownerId,...identity(),sourceRef:clone(sourceRef),nativeAPI:{version:'works-reference-control/1',build:'reference-control-copy-v1',transport:'direct',entrypoint:'docs/shared/ai-connection/reference-owner.mjs'},resourceState:{status:cleanupPending?'failed':'available',ownerId,requiredBytes:0,budgetBytes:config.budgetBytes,occupiedBytes:[...history.values()].reduce((n,r)=>n+r.payloadBytes,0),scope:'logical input payload allowance only; not process RAM or total peak'},loadedState:{moduleLoaded:true,moduleBytes:source.bytes,modelWeightsLoaded:false,evidenceKind:kind,operationMeaning:'owned tensor copy; no neural inference',hostPeakBytes:null,totalPeakBytes:null},disposed,cleanupPending};}
 const reason=(code,fieldPath,description)=>({code,fieldPath,reason:description,owner:ownerId,authority:'reference-control-owner declaration; not native numerical capability'});
 function fileAvailable(id){const files=config.files;if(Array.isArray(files))return files.some(x=>(x?.id===id&&x.file instanceof Blob)||(x instanceof Blob&&x.name===id));return !!files&&typeof files==='object'&&files[id] instanceof Blob;}
 function slots(descriptor){if(!descriptor||Boolean(descriptor.artifact)===Boolean(descriptor.artifacts))return null;return descriptor.artifact?[['input',descriptor.artifact]]:descriptor.artifacts&&typeof descriptor.artifacts==='object'&&!Array.isArray(descriptor.artifacts)&&Object.keys(descriptor.artifacts).length?Object.entries(descriptor.artifacts):null;}
 async function querySupport(descriptor){
  live();const requestDescriptor=clone(descriptor),observation=observe(),entries=slots(requestDescriptor),reasons=[];let unverified=false,requiredBytes=0;
  if(!entries||!text(requestDescriptor?.operationId)){reasons.push(reason('OWNER_INPUT_UNKNOWN','/descriptor','An operation and finite scalar/named artifact declarations are required'));unverified=true;}
  if(text(requestDescriptor?.operationId)&&!config.operations.includes(requestDescriptor.operationId))reasons.push(reason('OWNER_OPERATION_UNSUPPORTED','/operationId','Reference copy operation is not enabled by this owner'));
  for(const [name,a] of entries??[]){
   const path=requestDescriptor.artifact?'/artifact':'/artifacts/'+name,t=a?.tensor,meta=a?.native?.metadata??{},s=a?.semantics,decl=config.supportedTensor;
   if(a?.native?.schemaId!==nativeSchema||a.native.schemaVersion!=='1'||s?.schemaId!==semanticSchema||s.schemaVersion!=='1'){reasons.push(reason('OWNER_SCHEMA_UNVERIFIED',path+'/native','This reference owner only declares its explicit reference-control schemas'));unverified=true;continue;}
   if(!t||!types[t.dtype]||!Array.isArray(t.shape)||!t.shape.length||!t.shape.every(v=>Number.isSafeInteger(v)&&v>0)||!Array.isArray(t.axes)||t.axes.length!==t.shape.length||!t.axes.every(text)||!text(t.nativeMeaning)||!text(s.normalization)||s.spaceId!==t.nativeMeaning){reasons.push(reason('OWNER_INPUT_UNKNOWN',path+'/tensor','Positive explicit shape, supported dtype, axes, meaning and normalization are required'));unverified=true;continue;}
   const elements=t.shape.reduce((a,b)=>a*b,1),bytes=elements*types[t.dtype][1];if(!Number.isSafeInteger(bytes)){reasons.push(reason('OWNER_INPUT_UNKNOWN',path+'/tensor/shape','Tensor size exceeds exact integer representation'));unverified=true;continue;}requiredBytes+=bytes;
   for(const [field,value] of Object.entries({shape:t.shape,dtype:t.dtype,axes:t.axes,meaning:t.nativeMeaning,normalization:s.normalization}))if(decl[field]!==undefined&&!same(decl[field],value))reasons.push(reason(field==='shape'?'OWNER_SHAPE_UNSUPPORTED':'OWNER_TENSOR_CONTRACT',path+'/tensor/'+field,'Requested '+field+' differs from this current reference-owner declaration'));
   for(const [field,value] of Object.entries({shape:t.shape,dtype:t.dtype,layout:t.axes.join(''),meaning:t.nativeMeaning,normalization:s.normalization}))if(meta[field]!==undefined&&!same(meta[field],value))reasons.push(reason('OWNER_TENSOR_CONTRACT',path+'/native/metadata/'+field,'Explicit native metadata contradicts its common tensor declaration'));
  }
  for(const id of config.requiredFiles)if(!fileAvailable(id))reasons.push(reason('OWNER_MISSING_ASSET','/configuration/files/'+id,'Required local File is not selected: '+id));
  if(!Number.isSafeInteger(requiredBytes)||requiredBytes>config.budgetBytes)reasons.push(reason('OWNER_RESOURCE_BUDGET','/resourceState/budgetBytes','Logical input payload '+requiredBytes+'B exceeds owner allowance '+config.budgetBytes+'B; this is not a total RAM estimate'));
  observation.resourceState.requiredBytes=requiredBytes;
  if(reasons.length)return {status:unverified?'UNVERIFIED':'UNSUPPORTED',capabilityRef:null,reasons,observation,requestDescriptor};
  const consumerPorts=Object.fromEntries(entries.map(([name,a])=>[name,{portId:name,bindingRef:ownerId+':input:'+name,owner:ownerId,sourceRef:clone(sourceRef),nativeAPI:clone(observation.nativeAPI),artifactKind:'tensor',semantics:clone(a.semantics),profileRef:a.profileRef??'reference:owned-copy-v1',tensor:{dtypes:[a.tensor.dtype],shape:clone(a.tensor.shape),axes:clone(a.tensor.axes)},requiredMetadata:[],requiredIdentities:[],ownershipModes:['copy'],transports:['direct'],allowedAdapterRefs:[],requiredExtensionSchemas:[]}]));
  const response={status:'SUPPORTED',capabilityRef:'reference-support:'+crypto.randomUUID(),reasons:[],observation,requestDescriptor,registry:{schemas:[{schemaId:nativeSchema,schemaVersion:'1'},{schemaId:semanticSchema,schemaVersion:'1',nativeMeanings:[...new Set(entries.map(([,a])=>a.tensor.nativeMeaning))]}],roles:['tensor-transform']},...(requestDescriptor.artifact?{consumerPort:consumerPorts.input}:{consumerPorts})};
  supports.push({descriptor:requestDescriptor,identity:identity()});if(supports.length>64)supports.shift();return clone(response);
 }
 function retained(target){const r=history.get(target?.requestId);if(!r||!same(r.target,target))throw fail('TARGET_MISMATCH','Exact retained reference target required');return r;}
 const progress=(fn,record,phase)=>{if(fn)try{fn({phase,requestId:record.target.requestId,evidenceKind:kind});}catch{/* Observers do not own or interrupt native work. */}};
 async function invoke({descriptor,input,target,signal,onProgress}={}){
  live();if(active||history.size)throw fail('REFERENCE_OWNER_BUSY','Previous owned reference operation must reach terminal and release first');if(!target||!text(target.requestId)||!same(target.resourceBinding?.ownerId,ownerId)||target.resourceBinding?.resourceGeneration!==observe().resourceGeneration)throw fail('TARGET_MISMATCH','Current reference resource generation and request target required');
  const r={target:clone(target),descriptor:clone(descriptor),input:clone(input),terminal:deferred(),gate:deferred(),settled:false,cancelRequested:false,released:false,mode,payloadBytes:0,selectedIdentity:identity()};active=r;history.set(target.requestId,r);
  const entry={target:clone(r.target),descriptor:clone(r.descriptor),mode:r.mode};for(const waiter of waiters.splice(0))waiter.resolve(clone(entry));
  const abort=()=>{r.cancelRequested=true;if(r.mode!=='cancel-late')r.gate.resolve();};signal?.addEventListener('abort',abort,{once:true});
  try{
   if(signal?.aborted)abort();
   if(!supports.some(s=>same(s.identity,r.selectedIdentity)&&same(s.descriptor,r.descriptor)))throw fail('REFERENCE_SUPPORT_STALE','Query this exact declaration against the current owner before invoking');
   const entries=slots(r.descriptor),inputs=r.descriptor.artifact?{input:r.input}:r.input;if(!inputs||!same(Object.keys(inputs).sort(),entries.map(([name])=>name).sort()))throw fail('REFERENCE_INPUT_MISMATCH','Actual named inputs must match the declaration exactly');
   for(const [name,a] of entries){const t=inputs[name],dt=types[a.tensor.dtype];if(!dt||!(t?.data instanceof dt[0])||!same(t.shape,a.tensor.shape)||t.layout!==a.tensor.axes.join('')||t.dtype!==a.tensor.dtype||t.meaning!==a.tensor.nativeMeaning||(t.normalization??'none')!==a.semantics.normalization||t.data.byteLength!==a.tensor.shape.reduce((x,y)=>x*y,1)*dt[1])throw fail('REFERENCE_INPUT_MISMATCH','Actual tensor bytes/declaration differ for named input '+name);r.payloadBytes+=t.data.byteLength;}
   progress(onProgress,r,'started');if(['delay','cancel-late'].includes(r.mode))await r.gate.promise;
   if(r.mode==='fail')throw fail('REFERENCE_EXECUTION_FAILED','Explicit CONTROL reference-owner failure mode');
   if(r.cancelRequested&&r.mode!=='cancel-late')throw fail('INVOCATION_CANCELLED','Reference input copy cancelled');
   // cancel-late deliberately completes its original promise with an old value;
   // the real management queue must suppress it rather than trusting this owner.
   const tensors={},descriptors={};for(const [name,a] of entries){const port=r.descriptor.artifact?'output':name;tensors[port]=clone(inputs[name]);descriptors[port]=clone(a);descriptors[port].ownership={ownerId,mode:'copy'};}
   const first=Object.keys(tensors)[0];progress(onProgress,r,'completed');return {tensor:clone(tensors[first]),descriptor:clone(descriptors[first]),tensors,descriptors,outputs:clone(tensors),evidenceKind:kind,operationMeaning:'owned tensor copy only; no neural inference'};
  }finally{r.settled=true;if(active===r)active=null;signal?.removeEventListener('abort',abort);r.terminal.resolve();}
 }
 async function cancel(target){const r=retained(target);if(r!==active||r.settled)throw fail('TARGET_MISMATCH','Reference target is no longer active');r.cancelRequested=true;if(r.mode!=='cancel-late')r.gate.resolve();return {accepted:true,originalTerminal:r.settled};}
 async function afterTerminal(target){const r=retained(target);await r.terminal.promise;return {originalTerminal:true,reusable:!cleanupPending};}
 async function release(target){const r=retained(target);await r.terminal.promise;if(releaseFailures>0){releaseFailures--;cleanupPending=true;throw fail('REFERENCE_RELEASE_FAILED','Explicit CONTROL owner release failure; recover required');}r.released=true;r.input=null;r.descriptor=null;history.delete(target.requestId);return {released:true,resourceReleased:true};}
 async function configure(value={}){live();if(active||history.size)throw fail('REFERENCE_OWNER_BUSY','Configure requires terminal and released original operation');config=normalizeConfig(value);revision++;generation++;supports.length=0;return observe();}
 async function recover(){if(disposed)throw fail('REFERENCE_OWNER_DISPOSED','Disposed reference owner cannot recover');if(active){active.cancelRequested=true;active.gate.resolve();await active.terminal.promise;}for(const r of [...history.values()])await release(r.target);cleanupPending=false;supports.length=0;instance=crypto.randomUUID();generation++;return {recovered:true,resourceReleased:true,endedPreviousOwner:true,observation:observe()};}
 async function dispose(){if(active){active.cancelRequested=true;active.gate.resolve();await active.terminal.promise;}for(const r of [...history.values()])await release(r.target);supports.length=0;disposed=true;return {disposed:true};}
 function setBehavior(value={}){if(value.mode!==undefined){if(!['success','delay','fail','cancel-late'].includes(value.mode))throw TypeError('Unknown CONTROL reference behavior');mode=value.mode;}if(value.releaseFailures!==undefined){if(!Number.isSafeInteger(value.releaseFailures)||value.releaseFailures<0)throw TypeError('Nonnegative release failure count required');releaseFailures=value.releaseFailures;}return {mode,releaseFailures};}
 setBehavior(behavior);
 const controls=Object.freeze({waitForInvocation(){if(active)return Promise.resolve({target:clone(active.target),descriptor:clone(active.descriptor),mode:active.mode});const d=deferred();waiters.push(d);return d.promise;},continueInvocation(requestId){if(!active||requestId!==undefined&&active.target.requestId!==requestId)throw fail('TARGET_MISMATCH','Current CONTROL invocation required');active.gate.resolve();},setBehavior,failNextRelease(){releaseFailures++;},changeCapabilities(patch={}){live();config=normalizeConfig({...config,...clone(patch)});revision++;generation++;supports.length=0;return observe();}});
 return Object.freeze({observe,querySupport,invoke,cancel,afterTerminal,release,recover,configure,dispose,getRegistry:()=>clone(REFERENCE_REGISTRY),controls,inspect(){return {...observe(),activeTarget:clone(active?.target??null),retainedTargets:[...history.values()].map(r=>({target:clone(r.target),settled:r.settled,cancelRequested:r.cancelRequested,released:r.released})),ownership:{logicalOwnedRecords:history.size,logicalPayloadBytes:[...history.values()].reduce((n,r)=>n+r.payloadBytes,0),scope:'actual retained reference-owner copies/leases only; not Worker, model or process RAM'},configuration:clone(config),behavior:{mode,releaseFailures},evidenceKind:kind};}});
}

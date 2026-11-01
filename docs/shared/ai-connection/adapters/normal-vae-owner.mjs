/** Management facade over the fixed normal VAE owner. Native descriptor checks,
 * exact graph shapes, asset verification and all tensor arithmetic stay native. */
const clone=structuredClone,text=x=>typeof x==='string'&&x.length>0;
const fail=(code,message)=>Object.assign(Error(message),{code});
const source={repository:'Kushyameln01/kushyameln-works',commit:'498eb25f027666e3cc661a5851288e4aabf39f0a',path:'docs/shared/inference/api.mjs'};
const version='works-ai-1',build='works-inference-v1'; // Fixed client/worker source envelope; no native BUILD_ID export.
const tensorSchema='works:normal-input-tensor',semanticSchema='works:normal-vae';
const same=(a,b)=>{
 if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){if(a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);return x.every((v,i)=>v===y[i]);}
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
};

export function createNormalVaeRequestDescriptor(operationId,tensor,{artifactId='normal-vae-input:'+crypto.randomUUID(),extensions={},provenance,lineage}={}){
 if(!text(operationId)||!tensor||!Array.isArray(tensor.shape)||!text(tensor.dtype)||!text(tensor.layout)||!text(tensor.meaning))throw TypeError('Explicit VAE operation and actual tensor metadata required');
 const metadata=clone(Object.fromEntries(Object.keys(tensor).filter(k=>k!=='data').map(k=>[k,tensor[k]])));
 const lc=tensor.latentContract,producers=lc?.producerModelSha256s??(tensor.modelSha256?[tensor.modelSha256]:[]),identity=(role,value)=>({identityKind:'model',role,algorithm:'sha256',value,scope:'full-file'});
 return {operationId,artifact:{contractVersion:'works-module-contract/1.0-draft.1',artifactId,kind:'tensor',native:{schemaId:tensorSchema,schemaVersion:'1',payloadRef:'local:'+artifactId,metadata},semantics:{schemaId:semanticSchema,schemaVersion:'1',spaceId:tensor.meaning,unit:'model-native-value',normalization:tensor.normalization??'none'},...(tensor.profileId!==undefined?{profileRef:tensor.profileId}:{}),tensor:{dtype:tensor.dtype,shape:[...tensor.shape],axes:tensor.layout.split(''),nativeMeaning:tensor.meaning,dataRef:'local:'+artifactId},provenance:clone(provenance??{producerRefs:producers.map(h=>identity('producer',h)),consumerBindings:lc?[identity('decoder',lc.vaeModelSha256)]:[],transformTraceRefs:[]}),lineage:clone(lineage??{inputs:[],sourceFrames:[]}),snapshotId:null,ownership:{ownerId:'normal:caller-data',mode:'copy'},extensions:clone(extensions)}};
}

/** clientFactory is an internal bootstrap dependency for a private native client,
 * e.g. native createInferenceClient({onState}); it is never a data-request proof. */
export async function createNormalVaeOwner({nativeModule,configuration,clientFactory,onNativeRequest,inputPayloadBudgetBytes}={}){
 if(nativeModule?.API_VERSION!==version||typeof nativeModule.createVaeModule!=='function'||typeof nativeModule.describeTensor!=='function'||clientFactory!==undefined&&typeof clientFactory!=='function'||onNativeRequest!==undefined&&typeof onNativeRequest!=='function')throw fail('NORMAL_NATIVE_BOOTSTRAP_REQUIRED','Actual fixed VAE namespace and optional private client factory required');
 if(inputPayloadBudgetBytes!==undefined&&(!Number.isSafeInteger(inputPayloadBudgetBytes)||inputPayloadBudgetBytes<0))throw TypeError('inputPayloadBudgetBytes must be a safe nonnegative logical-payload byte budget');
 const ownerInstanceId=crypto.randomUUID(),ownerId='normal:vae:'+ownerInstanceId,supports=new Map(),history=new Map(),observerErrors=[];
 let revision=0,generation=0,native=null,capabilities=null,config=null,active=null,disposed=false,cleanupPending=false,requiredInputBytes=null;
 const live=()=>{if(disposed)throw fail('NORMAL_OWNER_DISPOSED','Normal VAE owner disposed');if(cleanupPending)throw fail('NORMAL_OWNER_RECOVERY_REQUIRED','VAE resources await cleanup recovery');};
 const identity=()=>({ownerInstanceId,configurationRevision:revision,resourceGeneration:'normal-vae:'+ownerInstanceId+':'+generation});
 // This measures the extent of an owner-declared tensor contract, not memory
 // consumption or a second implementation of the owner's shape equations.
 function payloadExtent(contract){if(contract?.dtype!=='float32'||!Array.isArray(contract.shape)||!contract.shape.length)return null;let bytes=4;for(const n of contract.shape){if(!Number.isSafeInteger(n)||n<1||!Number.isSafeInteger(bytes*n))return null;bytes*=n;}return bytes;}
 function resourceState(){const extents=['encode','decode'].map(op=>payloadExtent(capabilities?.[op]?.input)),maximum=extents.every(n=>n!==null)?Math.max(...extents):null,budget=inputPayloadBudgetBytes??maximum;return {status:cleanupPending?'failed':budget===null?'unknown':'available',ownerId,requiredBytes:requiredInputBytes??0,budgetBytes:budget,occupiedBytes:0,scope:'one logical imported payload; excludes management/native copies, ORT allocations, host and total RAM',budgetSource:inputPayloadBudgetBytes===undefined?'maximum configured native input contract extent':'internal service inputPayloadBudgetBytes',configuredInputExtentBytes:maximum};}
 function observe(){return {ownerId,...identity(),sourceRef:clone(source),nativeAPI:{version,build,transport:'direct',entrypoint:source.path},resourceState:resourceState(),loadedState:{moduleLoaded:true,nativeApiCreated:!!native,configured:capabilities?.configured===true,localFileBindings:config?.files.size??0,workerActive:!!active,modelWeightsResident:active?'worker-owned-unobserved':false,runtime:clone(capabilities?.runtime??null),hostPeakBytes:null,totalPeakBytes:null,buildIdentityScope:'Fixed registered client/worker source envelope; native capabilities has no BUILD_ID export'},disposed,cleanupPending};}
 function keepConfiguration(value){
  if(value===undefined||value===null)return null;
  if(!(value.files instanceof Map)||!value.manifest||value.diagnostics!==undefined&&value.diagnostics!==false)throw TypeError('Parsed VAE manifest, local files Map and diagnostics:false required for normal execution');
  // Keep immutable File/Blob identity. Native verifies all asset bytes on each run.
  return {manifest:clone(value.manifest),files:new Map(value.files)};
 }
 function ensureNative(){
  live();if(native)return;
  native=nativeModule.createVaeModule(clientFactory?{client:clientFactory(),ownsClient:true}:undefined);
  if(!['capabilities','configure','encode','decode','cancel','dispose'].every(k=>typeof native?.[k]==='function'))throw fail('NORMAL_NATIVE_IDENTITY_MISMATCH','Private native VAE factory returned an unexpected API');
  const caps=config?native.configure({...config,diagnostics:false}):native.capabilities();
  if(caps?.apiVersion!==version||caps.module!=='vae'||!Array.isArray(caps.operations))throw fail('NORMAL_NATIVE_IDENTITY_MISMATCH','Actual native capabilities do not identify the loaded VAE namespace');
  capabilities=clone(caps);
 }
 const reason=(code,fieldPath,message,extra={})=>({code,fieldPath,reason:message,owner:ownerId,authority:'actual-native-capabilities-and-boundary-contract',...extra});
 function nativeDescriptor(descriptor){
  const t=descriptor?.artifact?.tensor,metadata=clone(descriptor?.artifact?.native?.metadata??{});
  if(!t||!Array.isArray(t.axes))throw fail('NORMAL_VAE_DESCRIPTOR_CONFLICT','Explicit common tensor metadata required');
  const common={dtype:t.dtype,shape:clone(t.shape),layout:t.axes.join(''),meaning:t.nativeMeaning};
  for(const [key,value] of Object.entries(common))if(metadata[key]!==undefined&&!same(metadata[key],value))throw fail('NORMAL_VAE_DESCRIPTOR_CONFLICT','Native '+key+' contradicts explicit common tensor metadata');
  delete metadata.data;return {...metadata,...common};
 }
 async function querySupport(descriptor){
  live();ensureNative();const requestDescriptor=clone(descriptor),reasons=[];let input,unsupported=false;
  try{input=nativeDescriptor(requestDescriptor);}catch(e){unsupported=true;reasons.push(reason(e.code??'NORMAL_VAE_DESCRIPTOR_CONFLICT','/artifact',e.message));}
  if(requestDescriptor?.targetRefs?.length){unsupported=true;reasons.push(reason('NORMAL_VAE_TARGET_SELECTION_UNSUPPORTED','/targetRefs','VAE has no selected weight-target operation'));}
  let caps;
  if(input){caps=native.capabilities({operation:requestDescriptor.operationId,input});capabilities=clone(caps);if(caps?.apiVersion!==version||caps.module!=='vae'||typeof caps.support?.supported!=='boolean')throw fail('NORMAL_NATIVE_IDENTITY_MISMATCH','Native VAE capability response is incomplete');
   requiredInputBytes=payloadExtent(caps[requestDescriptor.operationId]?.input);
   if(!caps.support.supported){unsupported=true;reasons.push(reason(caps.support.code,'/artifact',caps.support.reason,{requiredChanges:clone(caps.support.requiredChanges??[]),scope:caps.support.scope}));}
  }
  if(requestDescriptor?.modelRefs!==undefined){
   const refs=requestDescriptor.modelRefs;
   if(!Array.isArray(refs))reasons.push(reason('NORMAL_VAE_MODEL_REFERENCE_UNVERIFIED','/modelRefs','Model references must use explicit SHA-256 identity records'));
   else for(let i=0;i<refs.length;i++){
    const ref=refs[i],values=typeof ref==='string'?[ref]:ref&&typeof ref==='object'?[ref.sha256,ref.value,ref.modelSha256].filter(x=>x!==undefined):[],hash=values[0],format=values.length>0&&values.every(x=>x===hash)&&typeof hash==='string'&&/^[0-9a-f]{64}$/.test(hash)&&(typeof ref==='string'||(ref.algorithm===undefined||ref.algorithm==='sha256')&&(ref.identityKind===undefined||ref.identityKind==='model')&&(ref.scope===undefined||ref.scope==='full-file'));
    if(!format)reasons.push(reason('NORMAL_VAE_MODEL_REFERENCE_UNVERIFIED','/modelRefs/'+i,'Model reference format does not identify a full-file SHA-256 model'));
    else if(!text((caps??capabilities)?.model?.sha256))reasons.push(reason('NORMAL_VAE_MODEL_REFERENCE_UNVERIFIED','/modelRefs/'+i,'Configured native model identity is unavailable'));
    else if(hash!==(caps??capabilities).model.sha256){unsupported=true;reasons.push(reason('NORMAL_VAE_MODEL_MISMATCH','/modelRefs/'+i,'Requested model identity differs from the actual configured VAE manifest'));}
   }
  }
  const observation=observe(),base={capabilityRef:null,reasons,consumerPort:null,registry:null,observation,requestDescriptor,nativeSupport:clone(caps?.support??null),nativeCapabilities:clone(caps??capabilities)};
  if(reasons.length)return {status:unsupported?'UNSUPPORTED':'UNVERIFIED',...base};
  const operation=caps[requestDescriptor.operationId],profileId=caps.profile?.id;
  if(!text(profileId)||!operation?.input?.shape)return {status:'UNVERIFIED',...base,reasons:[reason('NORMAL_VAE_PROFILE_UNBOUND','/nativeCapabilities/profile','Actual configured profile identity and complete input contract required')]};
  const semantics={schemaId:semanticSchema,schemaVersion:'1',spaceId:input.meaning,unit:'model-native-value',normalization:input.normalization??'none'};
  const consumerPort={portId:'vae-input',bindingRef:ownerId+':input',owner:ownerId,sourceRef:clone(source),nativeAPI:clone(observation.nativeAPI),artifactKind:'tensor',semantics,profileRef:profileId,tensor:{dtypes:[operation.input.dtype],shape:clone(operation.input.shape),axes:operation.input.layout.split('')},requiredMetadata:['/meaning'],requiredIdentities:[],ownershipModes:['copy'],transports:['direct'],allowedAdapterRefs:[],requiredExtensionSchemas:[]};
  const response={...base,status:'SUPPORTED',capabilityRef:'normal-vae-capability:'+crypto.randomUUID(),consumerPort,registry:{schemas:[{schemaId:tensorSchema,schemaVersion:'1'},{schemaId:semanticSchema,schemaVersion:'1',nativeMeanings:[input.meaning]}],roles:['tensor-transform']}};
  supports.set(response.capabilityRef,{descriptor:requestDescriptor,identity:identity(),caps:clone(caps),input});return clone(response);
 }
 async function invoke({descriptor,input,target,signal}={}){
  live();if(active)throw fail('NORMAL_OWNER_BUSY','One private VAE operation at a time');signal?.throwIfAborted();
  const support=[...supports.values()].find(s=>same(s.identity,identity())&&same(s.descriptor,descriptor));
  if(!support)throw fail('NORMAL_SUPPORT_STALE','Current owner support for the exact VAE descriptor required');
  const ownedInput=clone(input),selected=identity(),client=native;let settle;
  const record={target:clone(target),client,terminal:new Promise(r=>settle=r),settled:false,original:null};active=record;history.set(target.requestId,record);
  const abort=()=>{try{client.cancel();}catch(e){record.cancelError=e;cleanupPending=true;}};signal?.addEventListener('abort',abort,{once:true});
  try{
   const inputDescriptor=nativeModule.describeTensor(ownedInput);
   const supportedInputDescriptor=nativeModule.describeTensor({...support.input,data:ownedInput.data});
   if(!same(inputDescriptor,supportedInputDescriptor))throw fail('NORMAL_INPUT_DESCRIPTOR_MISMATCH','Actual VAE input metadata differs from the supported native descriptor');
   const original=client[descriptor.operationId](ownedInput);record.original=original;
   try{onNativeRequest?.(Object.freeze({operationId:descriptor.operationId,descriptor:clone(descriptor),target:clone(target),...identity()}));}catch(e){observerErrors.push(String(e.message??e));}
   const result=await original;signal?.throwIfAborted();if(disposed||!same(selected,identity()))throw fail('NORMAL_OWNER_STALE','VAE response belongs to the previous configuration');
   capabilities=clone(client.capabilities());const b=result?.binding,op=descriptor.operationId,expected=support.caps[op],roles=op==='encode'?['encoder']:['decoderBody','conv2Weight','conv2Bias'];
   const expectedHashes=Object.fromEntries(roles.map(role=>[role,config.manifest.assets[role].sha256]));
   if(!result?.tensor||!same(result.inputDescriptor,inputDescriptor)||b?.operation!==op||b.assetsVerified!==true||b.graphMetadataChecked!==true||!same(b.inputShape,inputDescriptor.shape)||!same(b.outputShape,expected.output.shape)||!same(b.assetHashes,expectedHashes)||!same(result.tensor.shape,expected.output.shape)||result.tensor.dtype!==expected.output.dtype||result.tensor.layout!==expected.output.layout||result.tensor.meaning!==expected.output.meaning||capabilities.runtime?.[op]?.verified!==true||!same(capabilities.runtime[op],{verified:true,...b}))throw fail('NORMAL_VAE_RESULT_BINDING_MISMATCH','Native VAE output does not bind the selected input, graph assets and successful runtime observation');
   return clone({tensor:result.tensor,inputDescriptor:result.inputDescriptor,binding:b});
  }finally{record.settled=true;record.original=null;if(active===record)active=null;signal?.removeEventListener('abort',abort);settle();}
 }
 function retained(target){const r=history.get(target?.requestId);if(!r||!same(r.target,target))throw fail('TARGET_MISMATCH','Exact original VAE owner target required');return r;}
 async function cancel(target){const r=retained(target);if(r!==active||r.settled)throw fail('TARGET_MISMATCH','VAE target is no longer active');return {accepted:r.client.cancel()===true};}
 async function afterTerminal(target){const r=retained(target);await r.terminal;return {originalTerminal:true,reusable:!cleanupPending};}
 async function release(target){const r=retained(target);await r.terminal;if(cleanupPending)throw fail('NORMAL_OWNER_RECOVERY_REQUIRED','VAE native cleanup not confirmed');history.delete(target.requestId);return {released:true,resourceReleased:true,scope:'Native original Promise is terminal; fixed native client terminates its dedicated Worker before settlement'};}
 async function endNative(){try{const r=active;if(r){r.client.cancel();await r.terminal;}if(native){native.dispose();native=null;}capabilities=null;requiredInputBytes=null;supports.clear();history.clear();}catch(e){cleanupPending=true;throw e;}}
 async function configure(value){live();revision++;generation++;supports.clear();await endNative();config=keepConfiguration(value);ensureNative();return observe();}
 async function recover(){await endNative();cleanupPending=false;generation++;ensureNative();return {recovered:true,resourceReleased:true,observation:observe()};}
 async function dispose(){if(disposed&&!cleanupPending)return {disposed:true};await endNative();config=null;disposed=true;return {disposed:true};}
 try{config=keepConfiguration(configuration);ensureNative();}catch(e){try{await dispose();}catch{}throw e;}
 return Object.freeze({observe,querySupport,invoke,cancel,afterTerminal,release,recover,configure,dispose,inspect:()=>({...observe(),activeTarget:clone(active?.target??null),observerErrors:[...observerErrors]})});
}

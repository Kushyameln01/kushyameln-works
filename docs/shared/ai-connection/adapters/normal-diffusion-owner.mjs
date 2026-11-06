/** Management-side normal-operation facade. Native API/validation/arithmetic
 * remain in the injected actual Diffusion namespaces and their private Worker. */
const clone=structuredClone,text=v=>typeof v==='string'&&!!v;
const fail=(code,message)=>Object.assign(Error(message),{code});
const source={repository:'Kushyameln01/kushyameln-works',commit:'5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3',path:'docs/shared/diffusion-models/api/index.mjs'};
const semanticSchema='works:normal-diffusion-mean',tensorSchema='works:normal-input-tensor';
const same=(a,b)=>{if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){if(a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);return x.every((v,i)=>v===y[i]);}const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&same(a[k],b[k]));};

export function createNormalRequestDescriptor(operationId,tensor,{artifactId='normal-input:'+crypto.randomUUID(),extensions={},provenance,lineage}={}){
 if(!text(operationId)||!tensor||!Array.isArray(tensor.shape)||!text(tensor.dtype)||!text(tensor.layout)||!text(tensor.meaning))throw TypeError('Operation and actual tensor metadata required');
 const {data,...metadata}=clone(tensor),meaning=tensor.meaning;
 const producerRefs=tensor.modelSha256?[{identityKind:'model',role:'producer',algorithm:'sha256',value:tensor.modelSha256,scope:'full-file'}]:[];
 return {operationId,artifact:{contractVersion:'works-module-contract/1.0-draft.1',artifactId,kind:'tensor',native:{schemaId:tensorSchema,schemaVersion:'1',payloadRef:'local:'+artifactId,metadata},semantics:{schemaId:semanticSchema,schemaVersion:'1',spaceId:meaning,unit:'model-native-value',normalization:tensor.normalization??'none'},...(tensor.profileId!==undefined?{profileRef:tensor.profileId}:{}),tensor:{dtype:tensor.dtype,shape:[...tensor.shape],axes:tensor.layout.split(''),nativeMeaning:meaning,dataRef:'local:'+artifactId},provenance:clone(provenance??{producerRefs,consumerBindings:[],transformTraceRefs:[]}),lineage:clone(lineage??{inputs:[],sourceFrames:[]}),snapshotId:null,ownership:{ownerId:'normal:caller-data',mode:'copy'},extensions:clone(extensions)}};
}

export async function createNormalDiffusionOwner({nativeModule,interop,latentModule,sourceRef=source,configuration={},onNativeRequest}={}){
 if(typeof nativeModule?.createDiffusionModels!=='function'||!text(nativeModule.BUILD_ID)||!text(nativeModule.PROTOCOL_VERSION)||!text(interop?.WAN21_VAE_SHA256)||!text(latentModule?.NORMALIZED_MEAN)||!text(latentModule?.NORMALIZATION)||onNativeRequest!==undefined&&typeof onNativeRequest!=='function')throw fail('NORMAL_NATIVE_BOOTSTRAP_REQUIRED','Actual native API, interop and latent metadata namespaces required');
 const ownerInstanceId=crypto.randomUUID(),ownerId='normal:diffusion:'+ownerInstanceId;
 let revision=0,generation=0,native=null,lastSessionId=null,wireRevision=0,serial=0,capabilities=null,loading=null,active=null,disposed=false,cleanupPending=false,lastDiagnostics=null,config=clone(configuration);
 const supports=new Map(),history=new Map(),observerErrors=[];
 const live=()=>{if(disposed)throw fail('NORMAL_OWNER_DISPOSED','Normal owner disposed');if(cleanupPending)throw fail('NORMAL_OWNER_RECOVERY_REQUIRED','Native resources await cleanup recovery');};
 function observe(){return {ownerId,ownerInstanceId,configurationRevision:revision,resourceGeneration:'normal-diffusion:'+ownerInstanceId+':'+generation,nativeSessionId:lastSessionId,sourceRef:clone(sourceRef),nativeAPI:{version:nativeModule.PROTOCOL_VERSION,build:nativeModule.BUILD_ID,transport:'direct',entrypoint:sourceRef.path},resourceState:{status:cleanupPending?'failed':'available',ownerId,requiredBytes:0,budgetBytes:(capabilities?.maxTensorElements??0)*4,occupiedBytes:0,scope:'native-operation input allowance only; not total RAM'},loadedState:{nativeApiCreated:!!native,moduleLoaded:true,modelWeightsLoaded:false,modelIdentityRole:'VAE tensor semantic provenance; no VAE weights loaded',kernelState:native?'lazy-or-worker-owned-unobserved':'dedicated-worker-disposed',hostPeakBytes:null,totalPeakBytes:null},disposed,cleanupPending};}
 const identity=()=>({ownerInstanceId,configurationRevision:revision,resourceGeneration:observe().resourceGeneration,nativeSessionId:lastSessionId});
 function wire(op,input){return {protocolVersion:nativeModule.PROTOCOL_VERSION,buildId:nativeModule.BUILD_ID,sessionId:lastSessionId,jobId:'normal:'+String(++serial),inputRevision:++wireRevision,op,...(input!==undefined?{input}:{} )};}
 function checkReply(q,reply){if(!reply||['protocolVersion','buildId','sessionId','jobId','inputRevision','op'].some(k=>reply[k]!==q[k]))throw fail('NORMAL_NATIVE_IDENTITY_MISMATCH','Native response protocol/build/session/job/revision/operation differs');if(reply.status!=='ok')throw Object.assign(fail(reply.error?.code??'NORMAL_NATIVE_ERROR',String(reply.error?.message??'Native operation failed')),{nativeCode:reply.error?.code??null});return reply.result;}
 async function ensureNative(){
  live();if(native&&capabilities)return capabilities;if(loading)return loading;
  if(active)throw fail('NORMAL_OWNER_BUSY','Cannot probe capabilities while a native operation is active');
  const selectedRevision=revision;
  loading=(async()=>{if(!native){lastSessionId=crypto.randomUUID();native=nativeModule.createDiffusionModels({sessionId:lastSessionId});if(native?.sessionId!==lastSessionId||!['request','cancel','dispose'].every(k=>typeof native[k]==='function'))throw fail('NORMAL_NATIVE_IDENTITY_MISMATCH','Private native factory returned an unexpected session/API');}
   const q=wire('capabilities'),result=checkReply(q,await native.request(q));if(disposed||revision!==selectedRevision)throw fail('NORMAL_OWNER_STALE','Configuration changed during capability discovery');
   if(result?.buildId!==nativeModule.BUILD_ID||result.protocolVersion!==nativeModule.PROTOCOL_VERSION||!Number.isSafeInteger(result.maxTensorElements)||result.maxTensorElements<1||!Array.isArray(result.rawMeanProfiles))throw fail('NORMAL_NATIVE_IDENTITY_MISMATCH','Actual native capabilities do not identify the loaded namespace');capabilities=clone(result);return capabilities;
  })();try{return await loading;}finally{loading=null;}
 }
 function reason(code,fieldPath,message){return {code,fieldPath,reason:message,owner:ownerId,authority:'actual-native-capabilities-and-boundary-contract'};}
 async function querySupport(descriptor){
  live();const requestDescriptor=clone(descriptor),caps=active?capabilities:await ensureNative(),observation=observe(),a=requestDescriptor?.artifact,t=a?.tensor,metadata=a?.native?.metadata??{},op=requestDescriptor?.operationId,reasons=[];
  if(!['normalizeRawMean','restoreRawMean'].includes(op)||caps?.[op]!==true)reasons.push(reason('OWNER_OPERATION_UNSUPPORTED','/operationId','No current normal mean facade for this advertised operation'));
  const profile=caps?.rawMeanProfiles.find(p=>same(p.shape,t?.shape));
  if(!profile)reasons.push(reason('OWNER_SHAPE_UNSUPPORTED','/artifact/tensor/shape','Shape not advertised by the actual current native owner'));
  const expectedMeaning=op==='restoreRawMean'?latentModule.NORMALIZED_MEAN:'raw-posterior-mean',expectedNormalization=op==='restoreRawMean'?latentModule.NORMALIZATION:'none';
  if(t?.dtype!=='float32'||!same(t?.axes,'NCTHW'.split(''))||t?.nativeMeaning!==expectedMeaning)reasons.push(reason('OWNER_TENSOR_CONTRACT','/artifact/tensor','Mean dtype/axes/meaning differs from native boundary'));
  if([['meaning',expectedMeaning],['dtype',t?.dtype],['shape',t?.shape],['layout',t?.axes?.join('')],['profileId',profile?.id]].some(([key,value])=>metadata[key]!==undefined&&!same(metadata[key],value)))reasons.push(reason('OWNER_TENSOR_CONTRACT','/artifact/native/metadata','Explicit native tensor metadata contradicts its common tensor or the advertised owner profile'));
  if(metadata.modelSha256!==interop.WAN21_VAE_SHA256)reasons.push(reason('OWNER_MODEL_MISMATCH','/artifact/native/metadata/modelSha256','Mean provenance differs from the VAE identity exported by native interop'));
  if(metadata.attentionMask!==undefined||metadata.latentContract!==undefined||op==='normalizeRawMean'&&metadata.normalization!==undefined||op==='restoreRawMean'&&metadata.normalization!==undefined&&metadata.normalization!==latentModule.NORMALIZATION)reasons.push(reason('OWNER_NORMALIZATION_MISMATCH','/artifact/native/metadata','Raw/normalized posterior mean cannot carry incompatible generated/text metadata'));
  if(requestDescriptor.targetRefs?.length)reasons.push(reason('OWNER_TARGETS_UNSUPPORTED','/targetRefs','Mean operations expose no selected weight targets'));
  if(requestDescriptor.modelRefs?.some(ref=>(typeof ref==='string'?ref:ref?.sha256??ref?.value??ref?.modelSha256)!==interop.WAN21_VAE_SHA256))reasons.push(reason('OWNER_MODEL_MISMATCH','/modelRefs','Requested model references differ from the owner mean-provenance binding'));
  if(reasons.length)return {status:'UNSUPPORTED',capabilityRef:null,reasons,consumerPort:null,registry:null,observation,requestDescriptor};
  const semantics={schemaId:semanticSchema,schemaVersion:'1',spaceId:expectedMeaning,unit:'model-native-value',normalization:expectedNormalization};
  const consumerPort={portId:'mean-input',bindingRef:ownerId+':input',owner:ownerId,sourceRef:clone(sourceRef),nativeAPI:clone(observation.nativeAPI),artifactKind:'tensor',semantics,profileRef:profile.id,tensor:{dtypes:['float32'],shape:[...profile.shape],axes:'NCTHW'.split(''),maxElements:caps.maxTensorElements},requiredMetadata:['/meaning','/modelSha256'],requiredIdentities:[{identityKind:'model',role:'producer',algorithm:'sha256',value:interop.WAN21_VAE_SHA256,scope:'full-file',location:'producerRefs'}],ownershipModes:['copy'],transports:['direct'],allowedAdapterRefs:[],requiredExtensionSchemas:[]};
  observation.resourceState.requiredBytes=profile.shape.reduce((a,b)=>a*b,1)*4;
  const response={status:'SUPPORTED',capabilityRef:'normal-capability:'+crypto.randomUUID(),reasons:[],consumerPort,registry:{schemas:[{schemaId:tensorSchema,schemaVersion:'1'},{schemaId:semanticSchema,schemaVersion:'1',nativeMeanings:[expectedMeaning]}],roles:['tensor-transform']},observation,requestDescriptor};
  supports.set(response.capabilityRef,{descriptor:requestDescriptor,identity:identity()});return clone(response);
 }
 async function invoke({descriptor,input,target,signal}={}){
  live();if(active)throw fail('NORMAL_OWNER_BUSY','One private native job at a time');signal?.throwIfAborted();
  const supported=[...supports.values()].some(s=>same(s.identity,identity())&&same(s.descriptor,descriptor));if(!supported)throw fail('NORMAL_SUPPORT_STALE','A current owner support response for this exact descriptor is required');
  const ownedInput=clone(input),selected=identity(),client=native;
  const q=wire(descriptor.operationId,{tensor:ownedInput});let settle;const terminal=new Promise(r=>settle=r),record={target:clone(target),wire:q,client,terminal,settled:false};active=record;history.set(target.requestId,record);
  const abort=()=>{try{client.cancel({sessionId:q.sessionId,jobId:q.jobId,inputRevision:q.inputRevision});}catch(error){cleanupPending=true;record.cancelError=error;}};signal?.addEventListener('abort',abort,{once:true});
  try{
   // Retain this target before the public owner validator can reject. Both
   // rejection and Worker execution have an original terminal/release barrier.
   if(descriptor.operationId==='normalizeRawMean'){
    const pairs=[[interop.WAN21_RAW_PROFILE,interop.requireWanRawLatent],[interop.WAN21_RAW_F1_PROFILE,interop.requireWanRawLatentF1],[interop.WAN21_RAW_RECT_PROFILE,interop.requireWanRawLatentRect]],validator=pairs.find(([p])=>p?.shape&&same(p.shape,ownedInput.shape))?.[1];if(typeof validator==='function')validator(ownedInput);
   }
   const original=client.request(q);record.original=original;
   try{onNativeRequest?.(Object.freeze({...Object.fromEntries(Object.entries(q).filter(([k])=>k!=='input')),ownerInstanceId,configurationRevision:revision,resourceGeneration:observe().resourceGeneration}));}catch(error){observerErrors.push(String(error.message??error));}
   const reply=await original;signal?.throwIfAborted();if(!same(selected,identity())||disposed)throw fail('NORMAL_OWNER_STALE','Native response belongs to the previous owner configuration');const result=checkReply(q,reply),{evidence,...output}=result;
   lastDiagnostics={nativeEvidence:clone(evidence??null),wire:Object.fromEntries(Object.entries(q).filter(([k])=>k!=='input')),scope:'native operation observation only; no independent numerical comparison',observerErrors:[...observerErrors]};return clone(output);
  }finally{record.settled=true;record.original=null;delete record.wire.input;if(active===record)active=null;signal?.removeEventListener('abort',abort);settle();}
 }
 function retained(target){const r=history.get(target?.requestId);if(!r||!same(r.target,target))throw fail('TARGET_MISMATCH','Exact original native owner target required');return r;}
 async function cancel(target){const r=retained(target);if(r!==active||r.settled)throw fail('TARGET_MISMATCH','Native target is no longer active');const reply=r.client.cancel({sessionId:r.wire.sessionId,jobId:r.wire.jobId,inputRevision:r.wire.inputRevision});return {accepted:reply?.status==='ok',nativeReply:clone(reply)};}
 async function afterTerminal(target){const r=retained(target);await r.terminal;return {originalTerminal:true,reusable:!cleanupPending};}
 async function release(target){const r=retained(target);await r.terminal;try{r.client.dispose();if(native===r.client)native=null;capabilities=null;supports.clear();r.client=null;history.delete(target.requestId);return {released:true,resourceReleased:true};}catch(error){cleanupPending=true;throw error;}}
 async function endNative(){try{if(active){try{await cancel(active.target);}catch{}await active?.terminal;}if(loading)await loading.catch(()=>{});if(native){native.dispose();native=null;}capabilities=null;supports.clear();history.clear();}catch(error){cleanupPending=true;throw error;}}
 async function configure(configuration={}){live();revision++;generation++;supports.clear();await endNative();config=clone(configuration);await ensureNative();return observe();}
 async function recover(){try{if(active)await active.terminal;if(native){native.dispose();native=null;}cleanupPending=false;generation++;capabilities=null;supports.clear();history.clear();return {recovered:true,resourceReleased:true,observation:observe()};}catch(error){cleanupPending=true;throw error;}}
 async function dispose(){if(disposed&&!cleanupPending)return {disposed:true};try{await endNative();disposed=true;return {disposed:true};}catch(error){cleanupPending=true;throw error;}}
 try{await ensureNative();}catch(error){try{await dispose();}catch{}throw error;}
 return Object.freeze({observe,querySupport,invoke,cancel,afterTerminal,release,recover,configure,dispose,readDiagnostics:()=>clone(lastDiagnostics),inspect:()=>({...observe(),activeTarget:clone(active?.target??null),configuration:clone(config)})});
}

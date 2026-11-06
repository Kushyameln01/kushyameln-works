/** Normal P4 binding. Shape/semantic support, tensor checks and arithmetic stay
 * with the injected fixed native API. The private owner is prepared lazily. */
const clone=structuredClone,text=v=>typeof v==='string'&&!!v;
const error=(code,message)=>Object.assign(Error(message),{code});
const source={repository:'Kushyameln01/kushyameln-works',commit:'30e283bb115741af6b475e9bdc41700a4e564053',path:'docs/shared/diffusion-models/api/index.mjs'};
const nativeSchema='works:normal-p4-input',semanticSchema='works:normal-p4-tensor';
const same=(a,b)=>{if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){if(a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;return new Uint8Array(a.buffer,a.byteOffset,a.byteLength).every((v,i)=>v===new Uint8Array(b.buffer,b.byteOffset,b.byteLength)[i]);}const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&same(a[k],b[k]));};
const binary=v=>ArrayBuffer.isView(v)||v instanceof ArrayBuffer;
const hasBinary=v=>binary(v)||v&&typeof v==='object'&&Object.values(v).some(hasBinary);
function binaryMetadata(v,path){if(binary(v))return {binaryPayloadRef:path,type:v.constructor.name,byteLength:v.byteLength};if(Array.isArray(v))return v.map((x,i)=>binaryMetadata(x,path+'/'+i));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,binaryMetadata(x,path+'/'+k)]));return v;}

/** Metadata declaration only. Typed payloads stay in the separate native input
 * bundle; this helper never adds an absent meaning/normalization/model binding. */
export function createNormalP4RequestDescriptor({inputs,model,blockIndex,contextLatents,artifactIds={},extensions={},provenance={},lineage={}}={}){
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||!Object.keys(inputs).length)throw TypeError('Named actual native tensors required');
 const artifacts=Object.fromEntries(Object.entries(inputs).map(([name,t])=>{
  if(!t||!Array.isArray(t.shape)||!text(t.dtype)||!text(t.layout)||!text(t.meaning))throw TypeError('Actual native tensor metadata required: '+name);
  const id=artifactIds[name]??'normal-p4:'+name+':'+crypto.randomUUID(),metadata={},attachments={};
  for(const [key,value] of Object.entries(t))if(key!=='data'){if(hasBinary(value))attachments[key]=binaryMetadata(value,'local:'+id+':metadata/'+key);else metadata[key]=clone(value);}
  const refs=[];if(t.modelSha256)refs.push({identityKind:'model',role:'producer',algorithm:'sha256',value:t.modelSha256,scope:'full-file'});if(t.tokenizerSha256)refs.push({identityKind:'tokenizer',role:'tokenizer',algorithm:'sha256',value:t.tokenizerSha256,scope:'full-file'});
  return [name,{contractVersion:'works-module-contract/1.0-draft.1',artifactId:id,kind:'tensor',native:{schemaId:nativeSchema,schemaVersion:'1',payloadRef:'local:'+id,metadata,...(Object.keys(attachments).length?{binaryMetadata:attachments}:{})},semantics:{schemaId:semanticSchema,schemaVersion:'1',spaceId:t.meaning,unit:'model-native-value',...(t.normalization!==undefined?{normalization:t.normalization}:{})},...(t.profileId!==undefined?{profileRef:t.profileId}:{}),tensor:{dtype:t.dtype,shape:[...t.shape],axes:t.layout.split(''),nativeMeaning:t.meaning,dataRef:'local:'+id},provenance:clone(provenance[name]??{producerRefs:refs,consumerBindings:[],transformTraceRefs:[]}),lineage:clone(lineage[name]??{inputs:[],sourceFrames:[]}),snapshotId:null,ownership:{ownerId:'normal:caller-data',mode:'copy'},extensions:clone(extensions[name]??{})}];
 }));
 return {operationId:'postSelfAttention',artifacts,parameters:{...(model!==undefined?{model:clone(model)}:{}),...(blockIndex!==undefined?{blockIndex}:{}),...(contextLatents!==undefined?{contextLatents:clone(contextLatents)}:{})}};
}

export async function createNormalP4Owner({nativeModule,file,side,sourceRef=source,inputPayloadBudgetBytes,bridgeBytes,mathBytes,attentionBytes,onNativeRequest,onProgress}={}){
 if(!['describeExecutionCapabilities','checkExecutionSupport','createBerniniP4Execution'].every(k=>typeof nativeModule?.[k]==='function')||!text(nativeModule.BUILD_ID)||!text(nativeModule.PROTOCOL_VERSION))throw error('NORMAL_NATIVE_BOOTSTRAP_REQUIRED','Actual normal P4 native namespace required');
 if([onNativeRequest,onProgress].some(f=>f!==undefined&&typeof f!=='function'))throw TypeError('Read-only observer callbacks required');
 const capabilities=clone(nativeModule.describeExecutionCapabilities()),contract=capabilities.operations?.postSelfAttention;
 if(!contract?.available||!contract.inputs||!contract.output)throw error('NORMAL_NATIVE_BOOTSTRAP_REQUIRED','Actual postSelfAttention capability descriptor required');
 const names=Object.keys(contract.inputs),ownerInstanceId=crypto.randomUUID(),ownerId='normal:p4:'+ownerInstanceId,profileRef='works:normal-owner-execution:'+nativeModule.BUILD_ID+':postSelfAttention';
 let revision=0,generation=0,disposed=false,cleanupPending=false,native=null,preparing=null,constructionRecovery=null,active=null,lastPrepared=null;
 const supports=new Map(),history=new Map(),observerErrors=[];
 function configured(value){if(Object.keys(value).some(k=>!['file','side','inputPayloadBudgetBytes','bridgeBytes','mathBytes','attentionBytes'].includes(k)))throw TypeError('Unknown normal P4 configuration field');if(value.inputPayloadBudgetBytes!==undefined&&(!Number.isSafeInteger(value.inputPayloadBudgetBytes)||value.inputPayloadBudgetBytes<0))throw TypeError('Explicit nonnegative logical input payload allowance required');return {...value,...Object.fromEntries(['bridgeBytes','mathBytes','attentionBytes'].filter(k=>value[k]!==undefined).map(k=>[k,clone(value[k])]))};}
 let config=configured({file,side,inputPayloadBudgetBytes,bridgeBytes,mathBytes,attentionBytes});
 const live=()=>{if(disposed)throw error('NORMAL_OWNER_DISPOSED','Normal P4 owner disposed');if(cleanupPending)throw error('NORMAL_OWNER_RECOVERY_REQUIRED','Native P4 cleanup recovery required');};
 const identity=()=>({revision,generation});
 const model=()=>({side:config.side,...(capabilities.models?.[config.side]?{modelSha256:capabilities.models[config.side]}:{})});
 function observe(){return {ownerId,ownerInstanceId,configurationRevision:revision,resourceGeneration:'normal-p4:'+ownerInstanceId+':'+generation,sourceRef:clone(sourceRef),nativeAPI:{version:nativeModule.PROTOCOL_VERSION,build:nativeModule.BUILD_ID,transport:'direct',entrypoint:sourceRef.path},resourceState:{status:cleanupPending?'failed':config.file instanceof Blob?'available':'unavailable',ownerId,requiredBytes:0,budgetBytes:config.inputPayloadBudgetBytes??null,occupiedBytes:0,scope:'configured allowance for one logical native input payload (three tensor extents plus mask); excludes copies, opaque metadata, workspaces, ORT, host and full pipeline'},loadedState:{moduleLoaded:true,fileConfigured:config.file instanceof Blob,configuredFile:config.file instanceof Blob?{name:config.file.name??null,byteLength:config.file.size}:null,nativeOwnerPrepared:!!native,modelWeightsLoaded:false,modelIdentityRole:'selected Bernini Blob streamed by the partial native owner; no whole model loaded claim',lastPreparedObservation:clone(lastPrepared),aggregatePeakBytes:null},nativeProfileId:lastPrepared?.executionProfileId??null,nativeProfileIdAuthority:lastPrepared?'last-prepared-native-weight-feed-registry':null,profileBindingAuthority:'management-sidecar-for-native-execution-descriptor',disposed,cleanupPending};}
 const reason=(code,fieldPath,message,extra={})=>({code,fieldPath,reason:message,owner:ownerId,...extra});
 function declared(descriptor){
  const reasons=[],artifacts=descriptor?.artifacts;
  if(descriptor?.artifact||!artifacts||!same(Object.keys(artifacts).sort(),[...names].sort()))reasons.push(reason('NORMAL_P4_NAMED_INPUTS_REQUIRED','/artifacts','Exact native named inputs required'));
  const parameters=descriptor?.parameters??{};if(Object.keys(parameters).some(k=>!['model','blockIndex','contextLatents'].includes(k)))reasons.push(reason('NORMAL_P4_PARAMETERS_UNSUPPORTED','/parameters','Only native P4 model, blockIndex and contextLatents parameters are bound'));
  const inputs={};for(const name of names){const a=artifacts?.[name];if(!a?.tensor){continue;}const meta=a.native?.metadata??{},base={dtype:a.tensor.dtype,shape:clone(a.tensor.shape),layout:a.tensor.axes?.join(''),meaning:a.tensor.nativeMeaning,...(a.semantics?.normalization!==undefined?{normalization:a.semantics.normalization}:{})};
   for(const [key,value] of Object.entries(base))if(meta[key]!==undefined&&!same(meta[key],value))reasons.push(reason('OWNER_TENSOR_CONTRACT','/artifacts/'+name+'/native/metadata/'+key,'Explicit native metadata contradicts its common tensor'));
   inputs[name]={...clone(meta),...base};
  }
  return {request:{operation:descriptor?.operationId,model:parameters.model??model(),blockIndex:parameters.blockIndex??0,contextLatents:parameters.contextLatents??[],inputs},reasons};
 }
 async function querySupport(descriptor){
  live();const requestDescriptor=clone(descriptor),d=declared(requestDescriptor),nativeSupport=clone(nativeModule.checkExecutionSupport(d.request)),observation=observe();
  const reasons=[...d.reasons,...(nativeSupport.reasons??[]).map(r=>reason(r.code,'/nativeDescriptor',r.message,{requiredExtension:r.requiredExtension,authority:'native-checkExecutionSupport'}))];
  if(requestDescriptor.operationId!=='postSelfAttention')reasons.push(reason('OWNER_OPERATION_UNSUPPORTED','/operationId','This normal binding implements native postSelfAttention only'));
  if(requestDescriptor.targetRefs?.length)reasons.push(reason('NORMAL_P4_LORA_ROUTE_NOT_AVAILABLE','/targetRefs','New canonical LoRA normal adapter is not jointly available; base P4 remains supported'));
  if(config.side!==undefined&&d.request.model?.side!==config.side)reasons.push(reason('OWNER_MODEL_MISMATCH','/parameters/model','Requested model side differs from the explicitly configured private owner'));
  if(requestDescriptor.modelRefs?.some(r=>(typeof r==='string'?r:r?.sha256??r?.value??r?.modelSha256)!==model().modelSha256))reasons.push(reason('OWNER_MODEL_MISMATCH','/modelRefs','Requested base model differs from the configured native model side'));
  if(nativeSupport.supported!==true&&!reasons.length)reasons.push(reason('NORMAL_NATIVE_SUPPORT_UNVERIFIED','/nativeDescriptor','Native metadata support was not confirmed'));
  if(reasons.length)return {status:nativeSupport.supported===undefined?'UNVERIFIED':'UNSUPPORTED',capabilityRef:null,reasons,consumerPorts:null,registry:null,nativeSupport,requestDescriptor,observation};
  const requiredBytes=Object.values(d.request.inputs).reduce((sum,t)=>sum+t.shape.reduce((a,b)=>a*b,1)*4,0)+d.request.inputs.conditioning.shape[1];observation.resourceState.requiredBytes=requiredBytes;
  const consumerPorts=Object.fromEntries(names.map(name=>{const c=contract.inputs[name],identities=[];if(c.modelSha256)identities.push({identityKind:'model',role:'producer',algorithm:'sha256',value:c.modelSha256,scope:'full-file',location:'producerRefs'});if(c.tokenizerSha256)identities.push({identityKind:'tokenizer',role:'tokenizer',algorithm:'sha256',value:c.tokenizerSha256,scope:'full-file',location:'producerRefs'});
   return [name,{portId:name,bindingRef:ownerId+':input:'+name,owner:ownerId,sourceRef:clone(sourceRef),nativeAPI:clone(observation.nativeAPI),artifactKind:'tensor',semantics:{schemaId:semanticSchema,schemaVersion:'1',spaceId:c.meaning,unit:'model-native-value',normalization:c.normalization},profileRef,profileBindingAuthority:'management-sidecar-for-native-execution-descriptor',ownerNativeProfileId:lastPrepared?.executionProfileId??null,tensor:{dtypes:[c.dtype],shape:clone(d.request.inputs[name].shape),axes:c.layout.split('')},requiredMetadata:['/meaning','/normalization',...(c.modelSha256?['/modelSha256']:[]),...(c.tokenizerSha256?['/tokenizerSha256']:[])],requiredIdentities:identities,ownershipModes:['copy'],transports:['direct'],allowedAdapterRefs:[],requiredExtensionSchemas:[]}];
  }));
  const response={status:'SUPPORTED',capabilityRef:'normal-p4-capability:'+crypto.randomUUID(),reasons:[],consumerPorts,registry:{schemas:[{schemaId:nativeSchema,schemaVersion:'1'},{schemaId:semanticSchema,schemaVersion:'1',nativeMeanings:Object.values(contract.inputs).map(c=>c.meaning)}],roles:['tensor-transform']},nativeSupport,requestDescriptor,observation};supports.set(response.capabilityRef,{descriptor:requestDescriptor,identity:identity()});return clone(response);
 }
 async function prepare(){
  live();if(native)return native;if(preparing)return preparing;if(!(config.file instanceof Blob))throw error('NORMAL_P4_FILE_REQUIRED','Explicit configured immutable local Blob required for native prepare');
  const selected=identity(),options=Object.fromEntries(['file','side','bridgeBytes','mathBytes','attentionBytes'].filter(k=>config[k]!==undefined).map(k=>[k,config[k]]));
  preparing=(async()=>{try{const created=await nativeModule.createBerniniP4Execution(options);native=created;if(!['describe','checkSupport','run','stats','dispose'].every(k=>typeof created?.[k]==='function')||typeof created?.weightFeed?.registry!=='function')throw error('NORMAL_NATIVE_IDENTITY_MISMATCH','Actual native normal P4 owner API required');
    const description=created.describe(),registry=created.weightFeed.registry();if(!same(created.model,model())||description.source?.modelHash!==model().modelSha256||registry.modelHash!==model().modelSha256)throw error('NORMAL_NATIVE_IDENTITY_MISMATCH','Prepared native model differs from configured owner selection');
    lastPrepared={model:clone(created.model),source:clone(description.source),executionProfileId:registry.executionProfileId,registryHash:registry.registryHash,graphHash:registry.graphHash,weightFeed:clone(created.weightFeed.describe?.()??null)};
    if(!same(selected,identity())||disposed)throw error('NORMAL_OWNER_STALE','P4 configuration changed during preparation');return created;
   }catch(e){if(typeof e.recover==='function'){constructionRecovery=e.recover;cleanupPending=true;}throw e;}})();try{return await preparing;}finally{preparing=null;}
 }
 async function invoke({descriptor,input,target,signal}={}){
  live();if(active)throw error('NORMAL_OWNER_BUSY','One private normal P4 transaction at a time');signal?.throwIfAborted();
  if(![...supports.values()].some(s=>same(s.identity,identity())&&same(s.descriptor,descriptor)))throw error('NORMAL_SUPPORT_STALE','Current exact normal P4 support required');
  const owned=clone(input),selected=identity(),controller=new AbortController();let settle;const terminal=new Promise(r=>settle=r),record={target:clone(target),controller,terminal,settled:false,client:null};history.set(target.requestId,record);active=record;
  const abort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',abort,{once:true});
  try{const client=await prepare();record.client=client;controller.signal.throwIfAborted();const d=declared(descriptor),request={...d.request,inputs:owned},support=client.checkSupport(request);if(support.supported!==true)throw Object.assign(error('NORMAL_NATIVE_SUPPORT_REJECTED','Prepared native owner rejected the actual normal request'),{details:clone(support)});
   const options={signal:controller.signal};if(onProgress)options.onProgress=progress=>{try{onProgress(clone(progress),{target:clone(target),ownerInstanceId,configurationRevision:revision,resourceGeneration:observe().resourceGeneration});}catch(e){observerErrors.push(String(e.message??e));}};
   const original=client.run(request,options);try{onNativeRequest?.({operationId:descriptor.operationId,target:clone(target),ownerInstanceId,configurationRevision:revision,resourceGeneration:observe().resourceGeneration});}catch(e){observerErrors.push(String(e.message??e));}
   const output=await original;controller.signal.throwIfAborted();if(!same(selected,identity())||disposed)throw error('NORMAL_OWNER_STALE','Native output belongs to previous P4 configuration');return clone(output);
  }finally{record.settled=true;if(active===record)active=null;signal?.removeEventListener('abort',abort);settle();}
 }
 function retained(target){const r=history.get(target?.requestId);if(!r||!same(r.target,target))throw error('TARGET_MISMATCH','Exact original normal P4 target required');return r;}
 async function cancel(target){const r=retained(target);if(r!==active||r.settled)throw error('TARGET_MISMATCH','Normal P4 target is no longer active');r.controller.abort();return {accepted:true,originalTerminalPending:true};}
 async function afterTerminal(target){await retained(target).terminal;return {originalTerminal:true,reusable:!cleanupPending};}
 async function closeNative(){try{if(preparing)await preparing.catch(()=>{});if(constructionRecovery){await constructionRecovery();constructionRecovery=null;}if(native){await native.dispose();const s=native.stats();if(s.disposed!==true||s.stage?.activeORTSessions!==0||s.feed?.readLeases!==0)throw error('NORMAL_RELEASE_UNCONFIRMED','Native P4 disposal/session/lease release not confirmed');native=null;}cleanupPending=false;supports.clear();}catch(e){cleanupPending=true;throw e;}}
 async function release(target){const r=retained(target);await r.terminal;await closeNative();r.client=null;history.delete(target.requestId);return {released:true,resourceReleased:true};}
 async function stop(){if(active){const r=active;r.controller.abort();await r.terminal;}await closeNative();history.clear();}
 async function configure(next={}){live();const nextConfig=configured(next);revision++;generation++;supports.clear();await stop();config=nextConfig;lastPrepared=null;return observe();}
 async function recover(){await stop();generation++;return {recovered:true,resourceReleased:true,observation:observe()};}
 async function dispose(){if(disposed&&!cleanupPending)return {disposed:true};await stop();disposed=true;return {disposed:true};}
 return Object.freeze({observe,querySupport,invoke,cancel,afterTerminal,release,recover,configure,dispose,inspect:()=>({...observe(),activeTarget:clone(active?.target??null),observerErrors:[...observerErrors],loraNormalRoute:'NOT_AVAILABLE'})});
}

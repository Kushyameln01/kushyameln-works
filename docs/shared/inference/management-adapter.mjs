/** Owner-side ES-module integration, using the acquired management implementation.
 * No tensor arithmetic, shape formula, tokenizer, VAE normalization or gate.
 * Service bootstrap owns native/source registration; ordinary calls own inputs.
 */
const clone=structuredClone;
const error=(code,message)=>Object.assign(Error(message),{code});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const schema='works:owner-inference-tensor',semantic='works:owner-inference-values';
const identity=(role,value,identityKind='model')=>({identityKind,role,algorithm:'sha256',value,scope:'full-file'});

export function createCurrentNativeCodec(nativeModule,sourceRef){
 if(typeof nativeModule?.encodeTensor!=='function'||typeof nativeModule?.decodeTensor!=='function'||!sourceRef)throw TypeError('Current native codec and registered source required');
 return Object.freeze({codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef:{...clone(sourceRef),path:'docs/shared/inference/tensor.mjs'},encode:nativeModule.encodeTensor,decode:nativeModule.decodeTensor});
}

/** Explicitly recapture in the Diffusion realm after native/management readback.
 * Projection/cross-attention/FFN remain Diffusion-owned and are not run here. */
export function captureRestoredConditioning({record,diffusion,options}={}){
 if(typeof diffusion?.captureP4Conditioning!=='function'||!record?.tensor)throw TypeError('Actual Diffusion capture and restored native tensor required');
 return diffusion.captureP4Conditioning(record.tensor,options);
}

export function createManagedInferenceBridge({manager,nativeAPI,nativeModule,sourceRef,codec=createCurrentNativeCodec(nativeModule,sourceRef),ownsNativeAPI=true,onNativeRequest}={}){
 for(const name of ['createTextVaeAdapter','createInvocationQueue','createOwnedArtifactStore','captureNativeTensor','restoreNativeTensor','releaseArtifactHandle','buildManagementBundle','readManagementBundle'])if(typeof manager?.[name]!=='function')throw TypeError('Actual acquired management export required: '+name);
 if(nativeModule?.API_VERSION!=='works-ai-1'||nativeAPI?.apiVersion!=='works-ai-1'||typeof nativeModule.describeTensor!=='function'||!sourceRef)throw TypeError('Actual native API/module and registered source required');
 const sessionId='managed-inference:'+crypto.randomUUID(),groupId=sessionId+':shared-text-vae',store=manager.createOwnedArtifactStore(),jobs=new Map(),adapters=new Map();
 let serial=0,closed=false,disposePromise;
 const registry={schemas:[{schemaId:schema,schemaVersion:'1',g1cMetadata:true},{schemaId:semantic,schemaVersion:'1',nativeMeanings:['text_hidden_states','rgb-unit','raw-decoder-rgb','raw-posterior-mean','wan21-raw-latent:v1','wan21-normalized-posterior-mean:v1','wan21-raw-generated-sample:v1']}],roles:[]};
 const client=module=>module==='text_encoder'?nativeAPI.textEncoder:module==='vae'?nativeAPI.vae:null;
 function live(){if(closed)throw error('BRIDGE_DISPOSED','Managed inference bridge disposed');}
 const bindings=['text_encoder','vae'].map(module=>{
  if(!client(module))throw TypeError('Both native modules must be explicitly supplied');
  const binding={bindingId:sessionId+':'+module,ownerId:module,resourceGeneration:sessionId+':generation:1',groupId};
  const find=target=>{const record=jobs.get(target.requestId);if(!record||record.module!==module||record.target?.activeToken!==target.activeToken)throw error('TARGET_MISMATCH','Exact managed native invocation required');return record;};
  return {...binding,
   async cancel(target){
    const record=find(target);let failure;
    try{if(!record.settled)await adapters.get(module).cancel({requestId:record.requestId,localRevision:record.revision});}catch(e){failure=e;}
    // Native cancel acceptance alone is insufficient. Both browser termination
    // and cooperative Node ORT finish through this original invocation barrier.
    await record.nativeTerminal.promise;
    if(failure)throw failure;
    return {stopped:adapters.get(module).active===null,originalTerminal:true};
   },
   async afterTerminal(target,outcome){const record=find(target);if(outcome.notStarted){record.settled=true;record.nativeTerminal.resolve();}await record.nativeTerminal.promise;return {reusable:record.settled&&adapters.get(module).active===null};},
   async release(target,outcome){const record=find(target);if(outcome.notStarted){record.settled=true;record.nativeTerminal.resolve();}await record.nativeTerminal.promise;if(adapters.get(module).active)throw error('OWNER_STILL_ACTIVE','Original native operation has not released');record.released=true;}
  };
 });
 const queue=manager.createInvocationQueue({resourceBindings:bindings});
 for(const module of ['text_encoder','vae']){
  const methods=module==='vae'?['capabilities','configure','encode','decode']:['capabilities','configure','encode'];
  // These names select the registered native exports; support and all numeric
  // validation still come from the actual configured module capabilities.
  const descriptor={nativeAPI:{version:'works-ai-1',build:'works-inference-v1'},operations:methods.map(operationId=>({operationId,implementationState:'implemented'}))};
  adapters.set(module,manager.createTextVaeAdapter({module,descriptor,nativeClient:client(module),binding:{ownerId:module,sessionId,bindingRef:sessionId+':'+module},artifactStore:store,sourceVerified:true}));
 }
 function descriptor(tensor,artifactId){
  const metadata=nativeModule.describeTensor(tensor),lc=tensor.latentContract,ctx=tensor.context;
  const producers=(lc?.producerModelSha256s??(tensor.modelSha256?[tensor.modelSha256]:[])).map(hash=>identity('producer',hash));
  if(tensor.tokenizerSha256)producers.push(identity('tokenizer',tensor.tokenizerSha256,'tokenizer'));
  return {contractVersion:'works-module-contract/1.0-draft.1',artifactId,kind:'tensor',native:{schemaId:schema,schemaVersion:'1',payloadRef:'owner:'+artifactId,metadata},semantics:{schemaId:semantic,schemaVersion:'1',spaceId:tensor.meaning,unit:'model-native-value',normalization:tensor.normalization??'none'},tensor:{dtype:tensor.dtype,shape:[...tensor.shape],axes:tensor.layout.split(''),nativeMeaning:tensor.meaning,dataRef:'owner:'+artifactId},provenance:{producerRefs:producers,consumerBindings:lc?[identity('decoder',lc.vaeModelSha256)]:[],transformTraceRefs:[]},lineage:ctx?{inputs:[ctx.inputId],sourceFrames:[{inputId:ctx.inputId,slotId:ctx.slotId,indices:[...ctx.sourceFrameIndices],...(ctx.sourceFrameTimesSeconds?{timesSeconds:[...ctx.sourceFrameTimesSeconds]}:{})}]}:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:sessionId,mode:'copy'},extensions:{}};
 }
 function captureSavedTensor(tensor,{artifactId='saved:'+crypto.randomUUID(),sourceRecords=[],trace}={}){
  live();const declared=descriptor(tensor,artifactId),handle=manager.captureNativeTensor({tensor,descriptor:declared,store,registry});
  try{
   const owned=manager.restoreNativeTensor(handle,store);
   // Durable records contain actual metadata, not live owned:... binary refs
   // from this temporary capture. Management workspace performs its own capture.
   return {descriptor:descriptor(owned,artifactId),tensor:owned,snapshot:null,sourceRecords:clone(sourceRecords),trace:trace??{schemaVersion:1,artifactId,records:[]}};
  }finally{manager.releaseArtifactHandle(handle,store);}
 }
 async function invoke({module,operation,input,requestId='inference:'+crypto.randomUUID(),signal}={}){
  live();if(!adapters.has(module))throw TypeError('Explicit text_encoder or vae module required');
  if(signal!==undefined&&!(signal instanceof AbortSignal))throw TypeError('AbortSignal required');signal?.throwIfAborted();
  if(jobs.has(requestId))throw error('DUPLICATE_REQUEST','Unique request ID required');
  // Keep immutable File/Blob/approved positional-reader identities at bootstrap;
  // ordinary data requests are independently owned before queue dispatch.
  const owned=operation==='configure'?{manifest:clone(input.manifest),files:new Map(input.files),diagnostics:input.diagnostics??false}:clone(input);
  const binding=bindings.find(b=>b.ownerId===module),revision=++serial,record={module,operation,requestId,revision,nativeTerminal:deferred(),settled:false,released:false,target:null};jobs.set(requestId,record);
  const invocation={id:requestId,requestId,ownerId:module,resourceBinding:binding.bindingId,resourceGeneration:binding.resourceGeneration,revision,activeToken:crypto.randomUUID()};
  const requestedTarget={bindingId:binding.bindingId,ownerId:module,resourceGeneration:binding.resourceGeneration,requestId,revision,activeToken:invocation.activeToken};record.target=requestedTarget;
  const abort=()=>{void queue.cancelInvocation(requestId,requestedTarget).catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{
   const value=await queue.enqueue(invocation,async context=>{
    record.target=context.target;
    try{
     const pending=adapters.get(module).invoke({requestId,localRevision:revision,operationId:operation,input:owned});
     try{onNativeRequest?.({module,operation,requestId,target:clone(context.target)});}catch{/* Observer cannot own the transaction. */}
     const reply=await pending;
     if(reply.status==='cancelled')throw error('INVOCATION_CANCELLED','Native invocation cancelled');
     if(reply.status!=='ok')throw error(reply.error?.code??'NATIVE_ERROR',reply.error?.rawMessage??'Native invocation did not complete');
     return reply.result;
    }finally{record.settled=true;record.nativeTerminal.resolve();}
   });
   const terminal=queue.inspect().invocations.find(x=>x.requestId===requestId);
   if(!terminal?.originalTerminal||!terminal.resourceReleased||!terminal.reusable||!terminal.resultAccepted)throw error('TERMINAL_UNCONFIRMED','Management original terminal and resource release required');
   return {value,terminal,target:clone(record.target)};
  }finally{signal?.removeEventListener('abort',abort);jobs.delete(requestId);}
 }
 async function execute(request){
  if(!['encode','decode'].includes(request?.operation))throw TypeError('Execute supports native encode/decode only');
  const selected=clone(request.input);
  const inputRecord=selected?.data?captureSavedTensor(selected,{artifactId:'input:'+crypto.randomUUID()}):null;
  const {value:native,terminal,target}=await invoke({...request,input:selected});
  if(!native?.tensor)throw error('NATIVE_TENSOR_REQUIRED','Native inference must return an owned tensor');
  const artifactId='output:'+crypto.randomUUID();
  const nativeDetails={...(native.inputDescriptor?{inputDescriptor:clone(native.inputDescriptor)}:{}),...(native.binding?{binding:clone(native.binding)}:{}),...(native.processing?{processing:clone(native.processing)}:{})};
  const inputMetadata=inputRecord?{artifactRef:inputRecord.descriptor.artifactId,nativeInputDescriptor:nativeModule.describeTensor(inputRecord.tensor)}:{nativeInput:clone(selected),inputMode:selected.text!==undefined?'plain-text':'token-ids'};
  const record=captureSavedTensor(native.tensor,{artifactId,sourceRecords:[inputMetadata],trace:{schemaVersion:1,artifactId,records:[{traceId:target.requestId,data:{scope:'normal management control; no numerical acceptance implied',sourceRef:clone(sourceRef),module:request.module,operation:request.operation,target,terminal,native:nativeDetails}}]}});
  return {native,record,inputRecord,terminal,target};
 }
 async function save({records,inputs={},state,fileRequirements=[]}={}){
  live();const artifacts={...inputs,...records};if(!Object.keys(artifacts).length)throw TypeError('Explicit records required');
  for(const record of Object.values(artifacts))for(const input of record.sourceRecords??[])if(input.artifactRef&&!artifacts[input.artifactRef])throw error('DEPENDENCY_REQUIRED','Save original input artifact together with decoded RGB: '+input.artifactRef);
  // This persistence-only profile declares an imported artifact route. It is
  // never used to claim execution or restore owner sessions/capability tokens.
  const refs=Object.keys(artifacts),profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'owner-inference-saved-records',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:refs,steps:[{stepId:'saved-import',moduleId:'owner-inference',operationId:'saved-import',inputBindings:refs.map((ref,i)=>({portId:'input'+i,artifactRef:ref})),outputBindings:[],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:[]};
  return manager.buildManagementBundle({state:state??{schemaVersion:'works-management-state/1',profile,selections:{},snapshots:[]},artifacts,fileRequirements,codec,registry,kind:'partial'});
 }
 async function read(bytes,options={}){live();return manager.readManagementBundle(bytes,{...options,codec,registry});}
 async function dispose(){
  if(disposePromise)return disposePromise;closed=true;
  disposePromise=(async()=>{const result=await queue.dispose();await Promise.all([...adapters.values()].map(a=>a.dispose()));store.clear();if(ownsNativeAPI)await nativeAPI.dispose();return {disposed:true,queue:result,artifactStoreEntries:store.size};})();return disposePromise;
 }
 return Object.freeze({execute,captureSavedTensor,save,read,configure:(module,configuration)=>invoke({module,operation:'configure',input:configuration}),querySupport(module,operation,input){live();if(!client(module))throw TypeError('Unknown module');return client(module).capabilities({operation,input});},cancel:target=>queue.cancelInvocation(target.requestId,target),inspect:()=>({disposed:closed,sessionId,artifactStoreEntries:store.size,targets:[...jobs.values()].map(r=>({module:r.module,operation:r.operation,target:clone(r.target)})),queue:queue.inspect()}),dispose});
}

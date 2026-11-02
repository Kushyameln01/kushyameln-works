/** Persistent BASE/FULL MODEL management over the fixed public Worker API.
 * This facade owns request scheduling, structural edges and snapshots. Weight
 * decoding, tensor validation, model execution and the scheduler remain native.
 */
import {createInvocationQueue} from '../../queue.mjs';
import {createSnapshotManager} from '../../snapshot.mjs';
import {evaluateEdge} from '../../compatibility.mjs';
import {createOwnedArtifactStore,captureNativeTensor,restoreNativeTensor,releaseArtifactHandle} from '../artifacts.mjs';
const clone=structuredClone;
const text=value=>typeof value==='string'&&value.length>0;
const fail=(code,message,details)=>Object.assign(Error(message),{code,...(details?{details}:{})});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const source={repository:'Kushyameln01/kushyameln-works',commit:'ffeeeedb6b57d182a977c3ac02c042ce235fc87a',path:'docs/shared/diffusion-models/api/index.mjs'};
const holderSource={repository:'Kushyameln01/kushyameln-works',commit:'59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f',path:'docs/shared/ai-connection/adapters/artifacts.mjs'};
const tensorSchema='works:diffusion-public-native-tensor',semanticSchema='works:diffusion-public-native-value';
const operations=['load','modelStatus','unload','predict','sample','saveTensor','readTensor'];
const numerical=operation=>operation==='predict'||operation==='sample';
// A structured clone evaluates accessors. Reject them before taking ownership
// so snapshotting cannot turn a packet rejected by the public API into data.
function snapshotInput(input){
 const seen=new Set();
 function fields(value){
  if(typeof value==='function'||typeof value==='symbol')throw fail('INVALID_MODEL_INPUT','Native wire input contains a callback or symbol');
  if(!value||typeof value!=='object'||value instanceof Blob||value instanceof ArrayBuffer||ArrayBuffer.isView(value)||seen.has(value))return;
  seen.add(value);
  if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw fail('INVALID_MODEL_INPUT','Native wire packets must be plain data objects');
  for(const key of Reflect.ownKeys(value)){
   const property=Object.getOwnPropertyDescriptor(value,key);
   if(Array.isArray(value)&&key==='length')continue;
   if(typeof key!=='string'||!property.enumerable||!Object.hasOwn(property,'value'))throw fail('INVALID_MODEL_INPUT','Native wire packets require enumerable data fields');
   fields(property.value);
  }
 }
 fields(input);return clone(input);
}
const acceptance={generationReady:false,originalWorkflowAccepted:false,acceptedProduction:false};

/** api is an explicit control-test seam. Omitting it always creates the adopted
 * public createDiffusionModels factory, including its own dedicated Worker. */
export async function createDiffusionPublicManagement({api,apiSessionId,managerSessionId='diffusion-manager:'+crypto.randomUUID(),environment}={}){
 const native=await import('./native.mjs');
 if(!text(managerSessionId))throw TypeError('Explicit management session required');
 const injected=api!==undefined;
 const client=api??native.createDiffusionModels({sessionId:apiSessionId??crypto.randomUUID()});
 if(!text(client?.sessionId)||apiSessionId!==undefined&&apiSessionId!==client.sessionId||!['request','cancel','dispose'].every(k=>typeof client[k]==='function'))throw fail('DIFFUSION_API_REQUIRED','Public Diffusion API with an exact session is required');
 const ownerInstanceId=crypto.randomUUID(),ownerId='diffusion-public:'+ownerInstanceId,bindingId=managerSessionId+':public-api';
 const artifactStore=createOwnedArtifactStore(),listeners=new Set(),records=new Map(),usedIds=new Set(),artifacts=new Map();
 let managerRevision=0,wireRevision=0,wireSerial=0,resourceGeneration=0,modelGeneration=0,configurationRevision=0;
 let disposed=false,disposing=false,active=null,loaded=false,cleanupRequired=false,reloadRequired=false,modelSessionId=null,modelEpoch=null;
 let capabilities=null,lastStatus=null,lastError=null,snapshot=null,currentArtifact=null;
 const snapshots=new Set();
 const flags=()=>({...acceptance,...Object.fromEntries(['load','predict','sample'].map(operation=>[operation,capabilities?.modelRuntime?.operationsImplemented?.includes(operation)?'IMPLEMENTED':'NOT_IMPLEMENTED']))});
 const resource=()=>({bindingId,ownerId,resourceGeneration:'diffusion-api:'+ownerInstanceId+':'+resourceGeneration});
 const live=()=>{if(disposed||disposing)throw fail('DIFFUSION_MANAGEMENT_DISPOSED','Diffusion management is disposed or closing');};
 const emit=(kind,value,isCurrent=()=>true)=>{for(const listener of [...listeners]){if(!isCurrent())break;try{listener({kind,value:clone(value),state:inspect()});}catch{/* Observers cannot change owner state. */}}};
 const observe=()=>({ownerId,ownerInstanceId,configurationRevision,resourceGeneration:resource().resourceGeneration,nativeSessionId:client.sessionId,sourceRef:clone(source),nativeAPI:{version:native.PROTOCOL_VERSION,build:native.BUILD_ID,transport:'direct',entrypoint:source.path},modelSessionId,modelEpoch,modelGeneration,loaded,cleanupRequired,reloadRequired,disposed});
 function wire(operation,input){return {protocolVersion:native.PROTOCOL_VERSION,buildId:native.BUILD_ID,sessionId:client.sessionId,jobId:'managed-model:'+String(++wireSerial),inputRevision:++wireRevision,op:operation,input};}
 function checkIdentity(q,reply){if(!reply||['protocolVersion','buildId','sessionId','jobId','inputRevision','op'].some(k=>reply[k]!==q[k]))throw fail('DIFFUSION_REPLY_IDENTITY_MISMATCH','Native response differs from the original build/session/job/inputRevision/operation');}
 function invalidate({reload=true}={}){loaded=false;cleanupRequired=false;reloadRequired=reload;modelSessionId=null;modelEpoch=null;modelGeneration++;snapshot=null;currentArtifact=null;}
 function applyError(error){
  lastError={code:error.code??'DIFFUSION_NATIVE_ERROR',message:String(error.message??error),details:clone(error.details??null)};
  if(error.details?.workerTerminated||error.details?.preparationDiscarded||error.details?.reloadRequired||['CANCELLED','STALE_INPUT','WORKER_ERROR','DISPOSED'].includes(error.code))invalidate();
  else if(['MODEL_CLEANUP_REQUIRED','MODEL_UNLOAD_FAILED','MODEL_PREPARATION_CLEANUP_FAILED'].includes(error.code)){cleanupRequired=true;loaded=false;snapshot=null;currentArtifact=null;}
 }
 function nativeResult(q,reply){checkIdentity(q,reply);if(reply.status!=='ok'){const error=fail(reply.error?.code??'DIFFUSION_NATIVE_ERROR',String(reply.error?.message??'Native operation failed'),clone(reply.error?.details));error.nativeReply=clone(reply);applyError(error);throw error;}return reply.result;}
 function modelCurrent(selected){return !disposed&&selected.modelGeneration===modelGeneration&&selected.modelSessionId===modelSessionId&&selected.modelEpoch===modelEpoch;}
 function matchingModel(result,selected){return result?.modelSessionId===selected.modelSessionId&&result?.modelEpoch===selected.modelEpoch;}
 function inspect(){return {...observe(),managerSessionId,managerRevision,apiSessionId:client.sessionId,nativeBuild:native.BUILD_ID,sourceRef:clone(source),capabilities:clone(capabilities),modelRuntime:clone(capabilities?.modelRuntime??null),activeTarget:clone(active?.target??null),lastStatus:clone(lastStatus),lastError:clone(lastError),snapshot:clone(snapshot),artifactRecord:currentArtifact?clone(currentArtifact):null,artifactCount:artifacts.size,queue:queue.inspect(),controlTestDouble:injected,executionEvidence:injected?'control-only injected API; no numerical evidence':'adopted real public Worker API',...flags()};}
 const recordFor=target=>{const r=records.get(target.requestId);if(!r||!['bindingId','ownerId','resourceGeneration','requestId','revision','activeToken'].every(k=>r.queueTarget[k]===target[k]))throw fail('TARGET_MISMATCH','Exact original queue target required');return r;};
 const queue=createInvocationQueue({resourceBindings:[{
  ...resource(),
  async cancel(target){const r=recordFor(target);r.cancelled=true;if(!r.nativeDispatched)return {stopped:false,notStarted:true};stopNative(r);await r.nativeTerminal.promise;return {stopped:r.stopConfirmed===true,originalTerminal:true};},
  async afterTerminal(target,outcome){const r=recordFor(target);if(!outcome.notStarted)await r.transactionTerminal.promise;if(r.nativeDispatched)await r.nativeTerminal.promise;return {reusable:true,originalTerminal:true,scope:'API control channel remains usable; model execution requires loaded healthy owner'};},
  async release(target){const r=recordFor(target);if(r.nativeDispatched)await r.nativeTerminal.promise;r.original=null;r.input=null;if(r.snapshotManager){await r.snapshotManager.dispose();snapshots.delete(r.snapshotManager);r.snapshotManager=null;}for(const h of r.inputHandles)releaseArtifactHandle(h,artifactStore);r.inputHandles=[];return {released:true,scope:'Request records released; persistent API/model pair retained'};}
 }]});
 function stopNative(r){
  if(r.stopConfirmed)return;
  const targetNative={sessionId:r.wire.sessionId,jobId:r.wire.jobId,inputRevision:r.wire.inputRevision};
  const reply=client.cancel(targetNative);checkIdentity({...r.wire,op:'cancel'},reply);
  if(reply.status==='ok'&&reply.result?.workerTerminated===true){invalidate();r.stopConfirmed=true;}
  else if(r.nativeSettled&&reply.error?.code==='NOT_RUNNING')r.stopConfirmed=true;
  else throw fail(reply.error?.code??'DIFFUSION_CANCEL_UNCONFIRMED',reply.error?.message??'Native Worker cancellation was not confirmed');
 }
 function checkAdmission(operation,input){
  if(!operations.includes(operation)||!capabilities?.modelRuntime?.operationsImplemented?.includes(operation))throw fail('DIFFUSION_OPERATION_UNIMPLEMENTED','Operation is not implemented by the adopted public model runtime');
  if((numerical(operation)||operation==='load')&&cleanupRequired)throw fail('MODEL_CLEANUP_REQUIRED','Explicit successful unload is required before model execution or load');
  if(numerical(operation)&&!loaded)throw fail('MODEL_NOT_LOADED','Load the HIGH/LOW pair before model execution, including after cancellation');
  if(numerical(operation)&&input?.modelSessionId!==undefined&&input.modelSessionId!==modelSessionId)throw fail('STALE_MODEL','Requested model session is no longer loaded');
  if(operation==='load'&&input?.resource?.wasmThreads===4){const coi=environment?.crossOriginIsolated??globalThis.crossOriginIsolated===true,sab=environment?.sharedArrayBuffer??typeof SharedArrayBuffer==='function';if(!coi||!sab)throw fail('UNSUPPORTED_RESOURCE_CONFIG','Explicit four-thread model load requires cross-origin isolation and SharedArrayBuffer; no fallback is applied');}
 }
 async function query({operation,input}={}){live();const reasons=[];try{checkAdmission(operation,input);}catch(error){reasons.push({code:error.code,reason:error.message,fieldPath:'/operation'});}if(numerical(operation)){const required=operation==='sample'?['shapeRequest','noise','positive','negative']:['side','shapeRequest','tensors','conditioning','timestep'];if(!input||typeof input!=='object'||required.some(key=>!Object.hasOwn(input,key)))reasons.push({code:'DIFFUSION_INPUT_CONTRACT_REQUIRED',fieldPath:'/input',reason:'Explicit native input fields required: '+required.join(', ')+'; exact numeric validation remains native'});}return {status:reasons.length?'UNSUPPORTED':'SUPPORTED',dispatchSupported:reasons.length===0,implemented:capabilities?.modelRuntime?.operationsImplemented?.includes(operation)===true,operation,reasons,observation:observe(),nativeInputContract:operation==='sample'?['shapeRequest','noise','positive','negative','tensors?','modelSessionId?']:operation==='predict'?['side','shapeRequest','tensors','conditioning','timestep','modelSessionId?']:null,...flags()};}
 async function dispatch(r,operation,input,onProgress){
  const q=wire(operation,input);r.wire=q;r.selected={modelGeneration,modelSessionId,modelEpoch};
  r.target={managerSessionId,managerRevision:r.revision,requestId:r.requestId,activeToken:r.queueTarget.activeToken,resourceBinding:resource(),sessionId:q.sessionId,jobId:q.jobId,inputRevision:q.inputRevision,modelSessionId:r.selected.modelSessionId,modelEpoch:r.selected.modelEpoch,modelGeneration:r.selected.modelGeneration};active=r;
  r.nativeDispatched=true;
  try{const original=client.request(q,{onProgress:reply=>{
   const isCurrent=()=>{try{checkIdentity(q,reply);return reply.status==='progress'&&!disposed&&!disposing&&!r.cancelled&&!r.nativeSettled&&active===r&&r.wire===q&&(!numerical(operation)||modelCurrent(r.selected)&&matchingModel(reply.result,r.selected));}catch{return false;}};
   if(!isCurrent())return;
   const value={...clone(reply),managerSessionId,managerRevision:r.revision,requestId:r.requestId,modelGeneration:r.selected.modelGeneration};
   try{onProgress?.(clone(value));}catch{/* View callbacks cannot change native results. */}
   // Every observer may synchronously cancel or dispose this model session.
   // Recheck before the next observer so stale progress cannot cross that edge.
   emit('progress',value,isCurrent);
  }});r.original=original;
  const reply=await original;r.nativeReply=clone(reply);const result=nativeResult(q,reply);if(r.cancelled)throw fail('INVOCATION_CANCELLED','Cancelled native result is not accepted');if(numerical(operation)&&(!modelCurrent(r.selected)||!matchingModel(result?.execution,r.selected)||result.execution.operation!==operation))throw fail('STALE_MODEL','Native tensor result belongs to another model session/epoch');return result;}
  finally{r.nativeSettled=true;r.nativeTerminal.resolve();delete q.input;}
 }
 function tensorDescriptor(tensor,artifactId,owner=ownerId){
  const {data,...metadata}=clone(tensor);
  return {contractVersion:'works-module-contract/1.0-draft.1',artifactId,kind:'tensor',native:{schemaId:tensorSchema,schemaVersion:'1',payloadRef:'local:'+artifactId,metadata},semantics:{schemaId:semanticSchema,schemaVersion:'1',spaceId:tensor.meaning,unit:'model-native-value',normalization:tensor.normalization??'none'},profileRef:tensor.profileId??'diffusion:explicit-native-input',tensor:{dtype:tensor.dtype,shape:clone(tensor.shape),axes:tensor.layout.split(''),nativeMeaning:tensor.meaning,dataRef:'local:'+artifactId},provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[]},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:owner,mode:'copy'},extensions:{}};
 }
 function tensorInputs(value,path='input',found=[]){
  if(!value||typeof value!=='object'||value instanceof Blob||ArrayBuffer.isView(value))return found;
  if(ArrayBuffer.isView(value.data)&&Array.isArray(value.shape)&&text(value.dtype)&&text(value.layout)&&text(value.meaning)){found.push({name:path,tensor:value});return found;}
  for(const [key,child]of Object.entries(value))tensorInputs(child,path+'.'+key,found);return found;
 }
 function edgeFor(r,slot){
  const descriptor=tensorDescriptor(slot.tensor,r.requestId+':'+slot.name,managerSessionId+':input-holder');
  const h=captureNativeTensor({tensor:slot.tensor,descriptor,store:artifactStore});r.inputHandles.push(h);const artifact=clone(h.descriptor),common={artifactKind:'tensor',semantics:clone(artifact.semantics),profileRef:artifact.profileRef,tensor:{dtypes:[artifact.tensor.dtype],shape:clone(artifact.tensor.shape),axes:clone(artifact.tensor.axes)},requiredMetadata:[],requiredIdentities:[],ownershipModes:['copy'],transports:['direct'],allowedAdapterRefs:[],requiredExtensionSchemas:[]};
  const producerPort={...common,portId:'owned:'+slot.name,bindingRef:managerSessionId+':input:'+slot.name,owner:artifact.ownership.ownerId,sourceRef:holderSource,nativeAPI:{version:'works-owned-artifact-holder/0.1',build:'owned-artifact-holder:59ae817',transport:'direct',entrypoint:holderSource.path}},consumerPort={...common,portId:'native:'+slot.name,bindingRef:ownerId+':input:'+slot.name,owner:ownerId,sourceRef:source,nativeAPI:observe().nativeAPI};
  return {producerPort,consumerPort,artifact,registry:{schemas:[{schemaId:tensorSchema,schemaVersion:'1'},{schemaId:semanticSchema,schemaVersion:'1',nativeMeanings:[artifact.tensor.nativeMeaning]}],roles:['tensor-transform']},adapters:[],requiredScopes:[],evidence:[],implementationState:{producer:{bindingRef:producerPort.bindingRef,state:'implemented',roles:['tensor-transform'],operationId:'owned-input'},consumer:{bindingRef:consumerPort.bindingRef,state:'implemented',roles:['tensor-transform'],operationId:r.operation}},activeBindings:{producer:{bindingRef:producerPort.bindingRef,ownerId:producerPort.owner,valid:true,currentRevision:r.revision,expectedRevision:r.revision},consumer:{bindingRef:consumerPort.bindingRef,ownerId,valid:true,currentRevision:r.revision,expectedRevision:r.revision}},resourceState:{status:'available',ownerId,requiredBytes:0,budgetBytes:0,occupiedBytes:0}};
 }
 async function normalResult(r,context,onProgress){
  // These structural edges bind the caller's explicit input contract. They add
  // no supported shape/profile/numeric claims; the native runtime validates it.
  const slots=tensorInputs(r.input),edges=slots.map(s=>edgeFor(r,s));
  if(!edges.length){const result=await dispatch(r,r.operation,r.input,onProgress);return {result,normalExecution:false};}
  const edgeDecisions=Object.fromEntries(slots.map((s,i)=>[s.name,evaluateEdge(edges[i])]));
  if(Object.values(edgeDecisions).some(d=>d.readiness.state!=='ready'))throw fail('DIFFUSION_EDGE_NOT_READY','Explicit native tensor edge is structurally incompatible');
  const registry={schemas:[{schemaId:tensorSchema,schemaVersion:'1'},{schemaId:semanticSchema,schemaVersion:'1',nativeMeanings:[...new Set(slots.map(s=>s.tensor.meaning))]}],roles:['tensor-transform']};
  const manager=createSnapshotManager({managerSessionId,registry});snapshots.add(manager);r.snapshotManager=manager;
  const capabilityRef='diffusion-model-capability:'+crypto.randomUUID(),bindingResource=resource(),selected={modelGeneration,modelSessionId,modelEpoch};
  const current=()=>!context.signal.aborted&&!r.cancelled&&modelCurrent(selected);
  const check=()=>{if(!current())throw fail('INVOCATION_CANCELLED','Normal model operation became stale or cancelled');};
  let output;
  const snapshotOwner={ownerId,
   async prepare(){check();output=await dispatch(r,r.operation,r.input,onProgress);check();return {candidate:{output}};},
   async validate(candidate,c){check();return {valid:true,target:c.target,operationId:c.operationId,snapshotId:c.snapshotId,stepId:c.stepId,scope:c.scopeId,sourceRef:c.sourceRef,nativeBuild:c.nativeBuild,capabilityRef};},
   async commit(candidate,c){check();return {state:'EXECUTION_COMPLETED',target:c.target,ownership:{kind:'independent-copy',ownerId}};},
   async rollback(){return {restored:true};},async release(){return {released:true};}
  };
  const artifactRefs=edges.map(e=>e.artifact.artifactId),profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'works:diffusion-public-operation',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:artifactRefs,steps:[{stepId:'diffusion-public',moduleId:ownerId,operationId:r.operation,inputBindings:slots.map((s,i)=>({portId:s.name,artifactRef:artifactRefs[i]})),outputBindings:[{portId:'output',artifactRef:r.requestId+':output'}],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:[]};
  const binding={stepId:'diffusion-public',moduleId:ownerId,operationId:r.operation,moduleVersion:native.PROTOCOL_VERSION,nativeBindingRefs:edges.map(e=>e.consumerPort.bindingRef),artifactRefs,modelProfileRefs:[...new Set(edges.map(e=>e.consumerPort.profileRef))],adapterSelectionRefs:[],localRevisionBindings:{configuration:configurationRevision,invocation:r.revision,modelGeneration},sourceRef:source,nativeBuild:native.BUILD_ID,implementationState:'implemented',resourceBinding:bindingResource,capabilityRef,owner:snapshotOwner,isCurrent:current,edges};
  try{const token=await manager.stageSnapshot(profile,{snapshotId:r.requestId+':snapshot',managerRevision:r.revision,artifactManifestRef:r.requestId+':owned-native-artifacts',evidenceManifestRef:r.requestId+':normal-structural-acknowledgement',requestedScope:{kind:'normal',scopeId:r.operation},steps:[binding]});check();const published=await manager.publishSnapshot(token,{currentBindings:{'diffusion-public':{localRevisionBindings:binding.localRevisionBindings,resourceBinding:bindingResource}}});check();return {result:output,snapshot:published.snapshot,edgeDecisions,normalExecution:true};}catch(error){await manager.dispose();snapshots.delete(manager);r.snapshotManager=null;throw error;}
 }
 function adoptControl(operation,result){
  if(operation==='load'){if(result?.loaded!==true||!text(result.modelSessionId)||!Number.isSafeInteger(result.modelEpoch))throw fail('DIFFUSION_MODEL_HANDLE_INVALID','Successful paired load must identify its native model session/epoch');modelGeneration++;loaded=true;cleanupRequired=false;reloadRequired=false;modelSessionId=result.modelSessionId;modelEpoch=result.modelEpoch;snapshot=null;currentArtifact=null;}
  else if(operation==='unload'){if(result?.unloaded!==true)throw fail('DIFFUSION_UNLOAD_UNCONFIRMED','Native unload did not confirm owner cleanup');invalidate({reload:false});lastStatus=clone(result);}
  else if(operation==='modelStatus'){lastStatus=clone(result);if(result?.cleanupRequired===true){cleanupRequired=true;loaded=false;snapshot=null;currentArtifact=null;}else if(result?.loaded===true){if(modelSessionId!==null&&(modelSessionId!==result.modelSessionId||modelEpoch!==result.modelEpoch))throw fail('STALE_MODEL','Status disagrees with the loaded model authority');loaded=true;modelSessionId=result.modelSessionId;modelEpoch=result.modelEpoch;}else if(result?.loaded===false){loaded=false;modelSessionId=null;modelEpoch=null;}}
 }
 async function execute({operation,input={},requestId='diffusion-request:'+crypto.randomUUID(),signal,onProgress}={}){
  live();if(!text(requestId)||usedIds.has(requestId))throw fail('DUPLICATE_REQUEST','Unique management requestId required');if(signal!==undefined&&!(signal instanceof AbortSignal))throw TypeError('AbortSignal required');if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('Progress observer must be a function');
  const r={operation,requestId,input:snapshotInput(input),revision:++managerRevision,inputHandles:[],transactionTerminal:deferred(),nativeTerminal:deferred(),done:deferred(),original:null,nativeSettled:false,cancelled:false};usedIds.add(requestId);records.set(requestId,r);
  r.queueTarget={...resource(),requestId,revision:r.revision,activeToken:crypto.randomUUID()};
  const abort=()=>{r.cancelled=true;if(r.nativeDispatched&&!r.nativeSettled)try{stopNative(r);}catch{}const entry=queue.inspect().invocations.find(e=>e.requestId===requestId);if(entry&&['queued','running','cancelling'].includes(entry.state))void queue.cancelInvocation(requestId,r.queueTarget).catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{
   const completed=await queue.enqueue({id:requestId,requestId,ownerId,resourceBinding:bindingId,resourceGeneration:resource().resourceGeneration,revision:r.revision,activeToken:r.queueTarget.activeToken},async context=>{
    r.queueTarget=context.target;
    try{if(context.signal.aborted||signal?.aborted||r.cancelled)throw fail('INVOCATION_CANCELLED','Cancelled before native model dispatch');checkAdmission(operation,r.input);if(numerical(operation)){snapshot=null;currentArtifact=null;return await normalResult(r,context,onProgress);}const result=await dispatch(r,operation,r.input,onProgress);adoptControl(operation,result);return {result,normalExecution:false};}
    finally{r.transactionTerminal.resolve();}
   });
   const terminal=queue.inspect().invocations.find(e=>e.requestId===requestId);
   if(!terminal?.originalTerminal||!terminal.resourceReleased||!terminal.reusable||!terminal.resultAccepted)throw fail('DIFFUSION_TERMINAL_UNCONFIRMED','Original operation and request release must finish before accepting its result');
   let artifactRecord=null;
   if(completed.result?.tensor){
    const tensor=completed.result.tensor,descriptor=tensorDescriptor(tensor,requestId+':output');
    descriptor.snapshotId=completed.snapshot?.snapshotId??null;
    const handle=captureNativeTensor({tensor,response:completed.result,descriptor,store:artifactStore});
    artifacts.set(descriptor.artifactId,handle);
    // Runtime authority belongs to the result record, never the saved tensor.
    artifactRecord={artifactId:descriptor.artifactId,descriptor:clone(handle.descriptor),nativeRef:handle.nativeRef,responseRef:handle.responseRef,descriptorRef:handle.descriptorRef,ownership:clone(handle.ownership),...(completed.snapshot?{snapshot:clone(completed.snapshot)}:{}),...(completed.result.execution?{execution:clone(completed.result.execution)}:{})};
    currentArtifact=artifactRecord;
   }
   if(completed.snapshot)snapshot=clone(completed.snapshot);
   const result={status:'EXECUTION_COMPLETED',operation,result:clone(completed.result),...clone(completed.result),normalExecution:completed.normalExecution,...(completed.snapshot?{snapshot:clone(completed.snapshot),edgeDecisions:clone(completed.edgeDecisions)}:{}),...(artifactRecord?{artifactRecord}:{}),nativeReply:clone(r.nativeReply),target:clone(r.target),terminal:clone(terminal),...flags()};emit('terminal',{operation,requestId,status:result.status});return result;
  }catch(error){snapshot=null;currentArtifact=null;lastError={code:error.code??'DIFFUSION_MANAGEMENT_ERROR',message:String(error.message??error),details:clone(error.details??null)};emit('error',lastError);throw error;}
  finally{signal?.removeEventListener('abort',abort);if(active===r)active=null;records.delete(requestId);r.done.resolve();}
 }
 async function cancel(target){live();const r=active;if(!r||!same(r.target,target)||r.nativeSettled)throw fail('TARGET_MISMATCH','Exact active native management target required');r.cancelled=true;stopNative(r);const terminal=await queue.cancelInvocation(r.requestId,r.queueTarget);return {cancelled:true,originalTerminal:terminal.originalTerminal===true,target:clone(target),...terminal,...flags()};}
 async function dispose(){if(disposed)return {disposed:true,...flags()};if(disposing)throw fail('DIFFUSION_MANAGEMENT_DISPOSING','Disposal is already pending');disposing=true;try{await queue.dispose();await Promise.all([...records.values()].map(r=>r.done.promise));client.dispose();invalidate({reload:false});for(const m of snapshots)await m.dispose();snapshots.clear();for(const h of artifacts.values())releaseArtifactHandle(h,artifactStore);artifacts.clear();disposed=true;listeners.clear();return {disposed:true,...flags()};}finally{disposing=false;}}
 const capQuery=wire('capabilities',{});
 try{capabilities=clone(nativeResult(capQuery,await client.request(capQuery)));if(capabilities?.buildId!==native.BUILD_ID||capabilities.protocolVersion!==native.PROTOCOL_VERSION||!Array.isArray(capabilities?.modelRuntime?.operationsImplemented))throw fail('DIFFUSION_CAPABILITIES_INVALID','Adopted public model capability identity is incomplete');}catch(error){client.dispose();throw error;}
 return Object.freeze({execute,query,cancel,dispose,inspect,observe,
  load:({files,resource,...options}={})=>execute({...options,operation:'load',input:{files,...(resource!==undefined?{resource}:{})}}),
  modelStatus:(options={})=>execute({...options,operation:'modelStatus',input:{}}),unload:(options={})=>execute({...options,operation:'unload',input:{}}),
  predict:({input,...options}={})=>execute({...options,operation:'predict',input}),sample:({input,...options}={})=>execute({...options,operation:'sample',input}),
  saveTensor:({tensor,...options}={})=>execute({...options,operation:'saveTensor',input:{tensor}}),readTensor:({file,...options}={})=>execute({...options,operation:'readTensor',input:{file}}),
  restoreArtifact:artifactId=>{const h=artifacts.get(artifactId);if(!h)throw fail('DIFFUSION_ARTIFACT_NOT_FOUND','Owned tensor artifact is missing or released');return restoreNativeTensor(h,artifactStore);},
  releaseArtifact:artifactId=>{const h=artifacts.get(artifactId);if(!h)return false;releaseArtifactHandle(h,artifactStore);artifacts.delete(artifactId);if(currentArtifact?.artifactId===artifactId)currentArtifact=null;return true;},
  subscribe(listener){if(typeof listener!=='function')throw TypeError('Management listener required');listeners.add(listener);return ()=>listeners.delete(listener);}
 });
}

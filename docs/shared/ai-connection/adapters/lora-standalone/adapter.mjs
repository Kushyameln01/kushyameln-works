/** Management control for the standalone LoRA contract. Native plans/packages
 * stay branded and private. Mapping, arithmetic and complete F32 admission are
 * exclusively SDK/provider/consumer responsibilities. */
import {createLoraStandalone,validateStandaloneRegistry,ADOPTED_LORA_STANDALONE_SOURCE} from './native.mjs';
import {createInvocationQueue} from '../../queue.mjs';
import {createSnapshotManager} from '../../snapshot.mjs';
import {evaluateEdge} from '../../compatibility.mjs';
import {canonicalize} from '../../canonical.mjs';

const clone=structuredClone,contract='lora-standalone/1.0-draft.1',common='works-module-contract/1.0-draft.1';
const text=v=>typeof v==='string'&&v.length>0;
const fail=(code,message)=>Object.assign(Error(message),{code});
const same=(a,b)=>{try{return canonicalize(a)===canonicalize(b);}catch{return false;}};
const flags={generationReady:false,graphBinding:'UNBOUND',load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const supported=['register','compose','prepare','stage','apply','restoreBase','save','openPackage','release'];
const schemas={schemas:[{schemaId:'works:lora-control-native',schemaVersion:'1'},{schemaId:'works:lora-control-semantics',schemaVersion:'1'}],roles:['adapter-control']};
let adapterSource;
async function ownSource(){return adapterSource??=(async()=>{let bytes;if(new URL(import.meta.url).protocol==='file:'){const {readFile}=await import('node:fs/promises');bytes=await readFile(new URL(import.meta.url));}else{const response=await fetch(import.meta.url,{cache:'no-store'});if(!response.ok)throw fail('MANAGER_SOURCE_UNAVAILABLE','Management adapter source unavailable');bytes=new Uint8Array(await response.arrayBuffer());}const sha=await crypto.subtle.digest('SHA-256',bytes);return {archiveRef:'works-lora-standalone-management-adapter/1',sha256:[...new Uint8Array(sha)].map(v=>v.toString(16).padStart(2,'0')).join('')};})();}

export async function createLoraManagementSide({side,registry:inputRegistry,baseProvider,consumer,kernel,cache,managerSessionId='lora-manager:'+crypto.randomUUID(),resourceGeneration}={}){
 const registry=validateStandaloneRegistry(inputRegistry);
 if(!['HIGH','LOW'].includes(side)||registry.side!==side)throw fail('SIDE_MISMATCH','Explicit fixed side must equal its owner registry');
 if(!text(managerSessionId)||consumer?.contractVersion!==contract||!['describe','prepareLoad','validate','commit','rollback'].every(k=>typeof consumer[k]==='function'))throw fail('CONSUMER_REQUIRED','Explicit conformant standalone consumer required');
 const sourceRef=clone(ADOPTED_LORA_STANDALONE_SOURCE),managerSourceRef=await ownSource();
 const sdk=createLoraStandalone({registry,baseProvider,kernel,cache}),ownerId='lora-standalone:'+side+':'+sdk.sdkInstanceId;
 const build='kernel-sha256:'+kernel.info?.wasmSha256;
 const nativeAPI={version:contract,build,transport:'direct',entrypoint:sourceRef.path};
 const plans=new Map(),prepared=new Map(),records=new Map(),usedRequests=new Set(),listeners=new Set(),snapshots=new Set();
 let serial=0,generation=resourceGeneration??'lora-resource:'+crypto.randomUUID(),active=null,closed=false,closing=false,recovering=false,lastResult=null,currentSnapshot=null,publicationDiverged=false,disposalPending=false;
 const binding=()=>({bindingId:managerSessionId+':'+side+':resource',ownerId,resourceGeneration:generation});
 const sdkHealthy=()=>!sdk.stats().busy&&!sdk.stats().recoveryRequired;
 const live=()=>{if(closed||closing)throw fail('LORA_MANAGEMENT_DISPOSED','Management side is closed');if(recovering)throw fail('LORA_MANAGEMENT_RECOVERING','Recovery is in progress');};
 function consumerObservation(){try{return {consumerEpoch:typeof consumer.currentEpoch==='function'?consumer.currentEpoch():null,consumerEpochUnavailable:null};}catch(e){return {consumerEpoch:null,consumerEpochUnavailable:{code:e.code??e.name??'CONSUMER_EPOCH_UNAVAILABLE',message:String(e.message??e)}};}}
 function inspect(){const epoch=consumerObservation();return {contractVersion:'works-lora-standalone-management/1',side,managerSessionId,managerRevision:serial,resourceBinding:binding(),activeTarget:clone(active?.target??null),registered:clone(sdk.inspect().sources),sdk:clone(sdk.stats()),...epoch,plans:[...plans].map(([planHandle,p])=>({planHandle,localRevision:p.localRevision,planId:p.planId})),prepared:[...prepared].map(([preparedHandle,p])=>({preparedHandle,localRevision:p.value.localRevision,planId:p.value.planId,packageHash:p.value.manifest.packageHash,automatic:p.automatic})),lastResult:clone(lastResult),snapshot:clone(currentSnapshot),recoveryRequired:!closed&&epoch.consumerEpochUnavailable!==null||!sdkHealthy()&&sdk.stats().recoveryRequired||publicationDiverged||disposalPending||queue.inspect().groups.some(g=>g.quarantined),publicationDiverged,disposalPending,queue:queue.inspect(),disposed:closed,sourceRef:clone(sourceRef),managerSourceRef:clone(managerSourceRef),nativeAPI:clone(nativeAPI),...flags};}
 function emit(type,detail={}){const event={type,...clone(detail),state:inspect()};for(const listener of listeners)try{listener(clone(event));}catch{/* Observers cannot change native ownership. */}}
 function recordFor(target){const r=records.get(target.requestId);if(!r||!same(r.queueTarget,target))throw fail('TARGET_MISMATCH','Queue callback does not identify retained exact invocation');return r;}
 function queueConfiguration(){return {...binding(),
  async cancel(target){const r=recordFor(target);r.cancelled=true;sdk.cancel();await r.nativeTerminal.promise;return {stopped:true,originalTerminal:true};},
  async afterTerminal(target,outcome){const r=recordFor(target);if(outcome?.notStarted===true)r.nativeTerminal.resolve();await r.nativeTerminal.promise;return {reusable:sdkHealthy()&&!r.cleanupFailed};},
  async release(target,outcome){const r=recordFor(target);if(r.createdPrepared&&(!r.actionFinished||outcome?.cancelled===true)&&prepared.has(r.createdPrepared)&&!sdk.stats().recoveryRequired){await releaseHandle(r.createdPrepared);}if(r.snapshotManager){await r.snapshotManager.dispose();snapshots.delete(r.snapshotManager);}if(sdk.stats().recoveryRequired)throw fail('LORA_RECOVERY_REQUIRED','SDK retained rollback/release/source cleanup');}
 };}
 const queue=createInvocationQueue({resourceBindings:[queueConfiguration()]});
 function current(r){return active===r&&!closed&&!closing&&!r.cancelled&&!r.signal.aborted;}
 const check=r=>{if(!current(r))throw fail('INVOCATION_CANCELLED','Current management target was cancelled or retired');};
 function keepPrepared(value,automatic=false){const handle='lora-prepared:'+crypto.randomUUID();prepared.set(handle,{value,automatic});return handle;}
 function getPrepared(handle){const p=prepared.get(handle);if(!p)throw fail('PREPARED_HANDLE_REQUIRED','A live prepared capability from this management instance is required');return p.value;}
 async function releaseHandle(handle){const p=prepared.get(handle);if(!p)return;await sdk.release(p.value);prepared.delete(handle);}
 function controlEdge(operation,r){
  const semantics={schemaId:'works:lora-control-semantics',schemaVersion:'1',spaceId:'lora-standalone-control',unit:'native-operation',normalization:'none'},artifactId=r.target.requestId+':request',profileRef=contract+':'+side;
  const artifact={contractVersion:common,artifactId,kind:'adapter-control',native:{schemaId:'works:lora-control-native',schemaVersion:'1',payloadRef:'runtime:'+r.target.requestId,metadata:{contractVersion:contract,side,operation}},semantics,profileRef,provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[]},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:managerSessionId,mode:'copy'},extensions:{}};
  const port=(producer)=>({portId:producer?'control-request':'sdk-operation',bindingRef:(producer?managerSessionId:ownerId)+':'+operation,owner:producer?managerSessionId:ownerId,sourceRef:producer?managerSourceRef:sourceRef,nativeAPI:producer?{version:'works-lora-standalone-management/1',build:managerSourceRef.sha256,transport:'direct',entrypoint:'adapter.mjs'}:nativeAPI,artifactKind:'adapter-control',semantics,profileRef,requiredMetadata:['/contractVersion','/side','/operation'],requiredIdentities:[],ownershipModes:['copy'],transports:['direct'],allowedAdapterRefs:[],requiredExtensionSchemas:[]});
  const producerPort=port(true),consumerPort=port(false),state=(p,id)=>({bindingRef:p.bindingRef,state:'implemented',roles:['adapter-control'],operationId:id}),bound=p=>({bindingRef:p.bindingRef,ownerId:p.owner,valid:true,currentRevision:r.revision,expectedRevision:r.revision});
  return {producerPort,consumerPort,artifact,registry:schemas,adapters:[],requiredScopes:[],evidence:[],implementationState:{producer:state(producerPort,'management-request'),consumer:state(consumerPort,operation)},activeBindings:{producer:bound(producerPort),consumer:bound(consumerPort)},resourceState:{status:'available',ownerId,requiredBytes:0,budgetBytes:0,occupiedBytes:0,scope:'control receipt only; not native payload or RAM capacity'}};
 }
 async function snapshotStage(r,handle){
  const value=getPrepared(handle),operation=r.operation,edge=controlEdge(operation,r),decision=evaluateEdge(edge);r.edgeDecision=decision;
  if(decision.readiness.state!=='ready')throw fail('LORA_EDGE_NOT_READY','Standalone management control edge is not ready: '+JSON.stringify(decision.reasons));
  const capabilityRef=sdk.sdkInstanceId+':'+value.localRevision+':'+r.target.requestId,stepId='lora-operation';
  const manager=createSnapshotManager({managerSessionId,registry:schemas});r.snapshotManager=manager;snapshots.add(manager);
  const localRevisionBindings={sdk:value.localRevision,invocation:r.revision},resourceBinding=clone(r.target.resourceBinding);
  // Observe only whether publication was attempted/acknowledged. The SDK still
  // owns receipt validation; each call keeps its exact native arguments/result
  // and original consumer receiver, including prototype-defined methods.
  const observedConsumer={contractVersion:consumer.contractVersion};
  for(const name of ['describe','prepareLoad','validate','rollback','releaseCandidate','currentEpoch'])if(typeof consumer[name]==='function'){const method=consumer[name];observedConsumer[name]=(...args)=>Reflect.apply(method,consumer,args);}
  const commit=consumer.commit;
  observedConsumer.commit=async(...args)=>{r.consumerCommitAttempted=true;const receipt=await Reflect.apply(commit,consumer,args);r.consumerCommitReturned=true;return receipt;};
  const owner={ownerId,
   async prepare(){check(r);return {candidate:{preparedHandle:handle}};},
   async validate(candidate,c){check(r);return {valid:true,target:c.target,operationId:operation,snapshotId:c.snapshotId,stepId,scope:c.scopeId,sourceRef:c.sourceRef,nativeBuild:c.nativeBuild,capabilityRef};},
   async commit(candidate,c){check(r);const result=await sdk.stage(getPrepared(candidate.preparedHandle),observedConsumer,{signal:r.signal,isCurrent:()=>current(r),validationMode:'normal'});r.nativeCommitted=true;r.nativeReceipt=clone(result);check(r);return {state:'EXECUTION_COMPLETED',target:c.target,ownership:{kind:'independent-copy',ownerId}};},
   async rollback(){if(r.nativeCommitted||r.consumerCommitAttempted)publicationDiverged=true;return {restored:true};},
   async release(){return {released:true};}
  };
  const artifactRef=edge.artifact.artifactId,profile={contractVersion:common,profileId:'works:lora-standalone-control',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:[artifactRef],steps:[{stepId,moduleId:ownerId,operationId:operation,inputBindings:[{portId:'request',artifactRef}],outputBindings:[{portId:'receipt',artifactRef:r.target.requestId+':receipt'}],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:[]};
  const step={stepId,moduleId:ownerId,operationId:operation,moduleVersion:contract,nativeBindingRefs:[edge.consumerPort.bindingRef],artifactRefs:[artifactRef],modelProfileRefs:[registry.modelHash],adapterSelectionRefs:[],localRevisionBindings,sourceRef,nativeBuild:build,implementationState:'implemented',resourceBinding,capabilityRef,owner,isCurrent:()=>current(r),edges:[edge]};
  const token=await manager.stageSnapshot(profile,{snapshotId:r.target.requestId+':snapshot',managerRevision:r.revision,artifactManifestRef:r.target.requestId+':control-artifact',evidenceManifestRef:r.target.requestId+':normal-native-receipt',requestedScope:{kind:'normal',scopeId:operation},steps:[step]});check(r);
  const result=await manager.publishSnapshot(token,{currentBindings:{[stepId]:{localRevisionBindings,resourceBinding}}});check(r);r.snapshot=clone(result.snapshot);return clone(r.nativeReceipt);
 }
 function options(input,allowed){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw fail('LORA_ARGUMENT_INVALID','Unsupported management operation arguments');return input;}
 const commonOptions=['requestId','signal','onProgress'];
 async function invoke(operation,input,action){
  const {signal,onProgress}=input;
  live();if(disposalPending)throw fail('LORA_DISPOSAL_PENDING','Resource disposal started; recover and retry disposal before replacing this side');if(!supported.includes(operation))throw fail('LORA_OPERATION_UNSUPPORTED','Unsupported management operation');
  if(publicationDiverged&&!['compose','prepare','stage','apply','restoreBase','release'].includes(operation))throw fail('COMPENSATION_REQUIRED','A fresh application/base compensation is required before other operations');
  const requestId=input.requestId??'lora:'+side+':'+crypto.randomUUID();if(!text(requestId))throw TypeError('Unique request ID required');if(signal!==undefined&&!(signal instanceof AbortSignal))throw TypeError('AbortSignal required');if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('Progress callback required');
  if(usedRequests.has(requestId))throw fail('DUPLICATE_REQUEST','Management request ID has already been used');usedRequests.add(requestId);
  const revision=++serial,r={operation,revision,nativeTerminal:deferred(),done:deferred(),cancelled:false,accepted:false,actionFinished:false,nativeCommitted:false,consumerCommitAttempted:false,consumerCommitReturned:false,createdPrepared:null,snapshotManager:null};
  r.queueTarget={...binding(),invocationId:requestId,requestId,revision,activeToken:crypto.randomUUID()};r.target={requestId,managerSessionId,managerRevision:revision,resourceBinding:binding(),activeToken:r.queueTarget.activeToken};records.set(requestId,r);
  const abort=()=>{r.cancelled=true;const record=queue.inspect().invocations.find(x=>x.requestId===requestId);if(record&&['running','queued','cancelling'].includes(record.state))void queue.cancelInvocation(requestId,r.queueTarget).catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{
   if(signal?.aborted)r.cancelled=true;
   const value=await queue.enqueue({id:requestId,requestId,ownerId,resourceBinding:binding().bindingId,resourceGeneration:generation,revision,activeToken:r.queueTarget.activeToken},async context=>{
    try{
     active=r;r.queueTarget=context.target;r.signal=context.signal;emit('started',{operation,target:r.target});
     const progress=detail=>{if(current(r)){const event={operation,target:r.target,progress:clone(detail)};emit('progress',event);try{onProgress?.(clone(detail));}catch{/* UI callbacks cannot interrupt native cleanup. */}}};
     check(r);const result=await action(r,progress);check(r);r.actionFinished=true;return result;
    }finally{r.nativeTerminal.resolve();}
   });
   const terminal=queue.inspect().invocations.find(x=>x.requestId===requestId);
   if(!terminal?.originalTerminal||!terminal.resourceReleased||!terminal.reusable||!terminal.resultAccepted)throw fail('LORA_TERMINAL_UNCONFIRMED','Native terminal and operation resource release must complete before result acceptance');
   r.accepted=true;
   const result={status:'EXECUTION_COMPLETED',operation,side,target:clone(r.target),managerRevision:r.revision,...value,terminal:clone(terminal),...flags};
   if(r.snapshot){if(!currentSnapshot||currentSnapshot.managerRevision<=r.revision){currentSnapshot=clone(r.snapshot);publicationDiverged=false;}result.snapshot=clone(r.snapshot);result.edgeDecision=clone(r.edgeDecision);}
   if(!lastResult||lastResult.managerRevision<=r.revision)lastResult=clone(result);emit('completed',{operation,target:r.target});return result;
  }catch(error){if((r.nativeCommitted||r.consumerCommitAttempted)&&!r.accepted)publicationDiverged=true;emit('failed',{operation,target:r.target,error:{code:error.code??error.name,message:error.message}});throw error;
  }finally{signal?.removeEventListener('abort',abort);if(active===r)active=null;records.delete(requestId);for(const [handle,plan] of plans)if(plan.localRevision!==sdk.stats().localRevision)plans.delete(handle);r.done.resolve();emit('settled',{operation,target:r.target});}
 }
 function register(input={}){options(input,['pairId','file','source',...commonOptions]);const native={pairId:input.pairId,...(input.file!==undefined?{file:input.file}:{}),...(input.source!==undefined?{source:input.source}:{})};return invoke('register',input,async(r,progress)=>({nativeReceipt:clone(await sdk.register({...native,signal:r.signal,onProgress:progress}))}));}
 function compose(input={}){options(input,['selections','targets',...commonOptions]);const captured=clone({selections:input.selections,...(input.targets!==undefined?{targets:input.targets}:{})});return invoke('compose',input,async r=>{const plan=await sdk.compose({...captured,signal:r.signal}),planHandle='lora-plan:'+crypto.randomUUID();plans.set(planHandle,plan);return {planHandle,plan:clone(plan),managementAcknowledgement:{state:'COMPOSED',sdkInstanceId:sdk.sdkInstanceId,localRevision:plan.localRevision,planId:plan.planId}};});}
 function prepare(input={}){options(input,['planHandle',...commonOptions]);const planHandle=input.planHandle;return invoke('prepare',input,async r=>{const plan=plans.get(planHandle);if(!plan)throw fail('PLAN_HANDLE_REQUIRED','A live local composition handle required');const value=await sdk.prepare(plan,{signal:r.signal}),preparedHandle=keepPrepared(value);r.createdPrepared=preparedHandle;return {preparedHandle,manifest:clone(value.manifest),managementAcknowledgement:{state:'PREPARED',sdkInstanceId:value.sdkInstanceId,localRevision:value.localRevision,transactionId:value.transactionId,planId:value.planId}};});}
 function stage(input={}){options(input,['preparedHandle',...commonOptions]);const preparedHandle=input.preparedHandle;return invoke('stage',input,async r=>({preparedHandle,manifest:clone(getPrepared(preparedHandle).manifest),nativeReceipt:await snapshotStage(r,preparedHandle)}));}
 async function applyCore(r,selections,targets){const plan=await sdk.compose({selections,...(targets!==undefined?{targets}:{}),signal:r.signal}),value=await sdk.prepare(plan,{signal:r.signal}),handle=keepPrepared(value,true);r.createdPrepared=handle;const nativeReceipt=await snapshotStage(r,handle);for(const [id,p] of [...prepared])if(id!==handle&&p.automatic)await releaseHandle(id);return {preparedHandle:handle,manifest:clone(value.manifest),nativeReceipt};}
 function apply(input={}){options(input,['selections','targets',...commonOptions]);const selections=clone(input.selections),targets=input.targets===undefined?undefined:clone(input.targets);return invoke('apply',input,r=>applyCore(r,selections,targets));}
 function restoreBase(input={}){options(input,commonOptions);return invoke('restoreBase',input,r=>applyCore(r,[],undefined));}
 function save(input={}){options(input,['preparedHandle','writer',...commonOptions]);const preparedHandle=input.preparedHandle,writer=input.writer;return invoke('save',input,async(r,progress)=>{const manifest=await sdk.save(getPrepared(preparedHandle),{writer,signal:r.signal});progress({phase:'manifest-published'});return {preparedHandle,manifest:clone(manifest),managementAcknowledgement:{state:'SAVED',packageHash:manifest.packageHash,planId:manifest.planId,sdkInstanceId:sdk.sdkInstanceId,localRevision:sdk.stats().localRevision}};});}
 function openPackage(input={}){options(input,['manifest','sources',...commonOptions]);const manifest=clone(input.manifest),sources=input.sources===undefined?new Map():input.sources instanceof Map?new Map(input.sources):input.sources&&[Object.prototype,null].includes(Object.getPrototypeOf(input.sources))?new Map(Object.entries(input.sources)):input.sources;return invoke('openPackage',input,async r=>{const value=await sdk.openPackage({manifest,sources,signal:r.signal}),preparedHandle=keepPrepared(value);r.createdPrepared=preparedHandle;return {preparedHandle,manifest:clone(value.manifest),managementAcknowledgement:{state:'PREPARED',originPlanId:value.originPlanId,sdkInstanceId:value.sdkInstanceId,localRevision:value.localRevision,transactionId:value.transactionId,planId:value.planId}};});}
 function release(input={}){options(input,['preparedHandle',...commonOptions]);const preparedHandle=input.preparedHandle;return invoke('release',input,async()=>{await releaseHandle(preparedHandle);return {managementAcknowledgement:{state:'RELEASED',preparedHandle}};});}
 async function cancel(target){live();if(!active||!same(active.target,target))throw fail('TARGET_MISMATCH','Exact current management target required');const r=active;r.cancelled=true;const result=await queue.cancelInvocation(r.queueTarget.invocationId,r.queueTarget);await r.done.promise;return {cancelled:true,originalTerminal:result.originalTerminal,resourceReleased:result.resourceReleased,reusable:result.reusable,target:clone(target),...flags};}
 async function recover(){live();if(active)throw fail('LORA_BUSY','Wait for original operation terminal before recovery');recovering=true;try{await sdk.recover();for(const manager of [...snapshots]){await manager.recover();await manager.dispose();snapshots.delete(manager);}for(const [handle,p] of [...prepared])if(p.value.handle.isValid()!==true)prepared.delete(handle);if(!sdkHealthy())throw fail('LORA_RECOVERY_REQUIRED','SDK did not confirm terminal recovery');if(!queue.inspect().disposed){generation='lora-resource:'+crypto.randomUUID();queue.rebindResource(queueConfiguration(),{verified:true,evidenceRef:'sdk-terminal-recovery:'+sdk.sdkInstanceId+':'+sdk.stats().localRevision});}const divergence=publicationDiverged;emit('recovered');return {recovered:true,disposalPending,publicationDiverged:divergence,compensationRequired:divergence,sdk:clone(sdk.stats()),...consumerObservation(),resourceBinding:binding(),...flags};}finally{recovering=false;}}
 async function query(){live();const reasons=[];let observedBase=null,observedConsumer=null;try{observedBase=clone(await baseProvider.describe());if(observedBase.modelHash!==registry.modelHash||observedBase.side!==side)reasons.push({code:'BASE_IDENTITY_MISMATCH',reason:'Provider model/side differs from fixed SDK registry'});}catch(e){reasons.push({code:'BASE_UNAVAILABLE',reason:e.message});}try{observedConsumer=validateStandaloneRegistry(await consumer.describe());if(!same(observedConsumer,registry))reasons.push({code:'CONSUMER_REGISTRY_MISMATCH',reason:'Consumer logical registry differs from fixed SDK registry'});}catch(e){reasons.push({code:'CONSUMER_UNAVAILABLE',reason:e.message});}if(disposalPending||sdk.stats().disposed)reasons.push({code:'LORA_DISPOSAL_PENDING',reason:'SDK disposal started; only resource recovery and disposal retry are available'});if(publicationDiverged)reasons.push({code:'COMPENSATION_REQUIRED',reason:'Native application was not published by management; a fresh explicit compensation is required'});if(sdk.stats().recoveryRequired||queue.inspect().groups.some(g=>g.quarantined))reasons.push({code:'RECOVERY_REQUIRED',reason:'Native or management cleanup is pending'});return {status:reasons.length?'BLOCKED':'SUPPORTED',dispatchSupported:!reasons.length,reasons,registry:clone(registry),base:observedBase,consumer:observedConsumer,capabilities:sdk.capabilities(),sourceRef:clone(sourceRef),nativeAPI:clone(nativeAPI),...flags};}
 function capabilities(){return {...clone(sdk.capabilities()),managementOperations:[...supported,'cancel','recover','dispose'],managerSourceRef:clone(managerSourceRef),sourceRef:clone(sourceRef),...flags};}
 async function dispose(){if(closed)return {disposed:true,...flags};closing=true;disposalPending=true;try{await queue.dispose();for(const manager of [...snapshots]){await manager.recover();await manager.dispose();snapshots.delete(manager);}await sdk.dispose();prepared.clear();plans.clear();closed=true;disposalPending=false;emit('disposed');return {disposed:true,sdkOnly:true,consumerBackingStillCallerOwned:true,...flags};}finally{closing=false;}}
 return Object.freeze({register,compose,prepare,stage,apply,restoreBase,save,openPackage,release,cancel,recover,query,capabilities,dispose,inspect,subscribe(fn){if(typeof fn!=='function')throw TypeError('Subscriber required');listeners.add(fn);return ()=>listeners.delete(fn);}});
}

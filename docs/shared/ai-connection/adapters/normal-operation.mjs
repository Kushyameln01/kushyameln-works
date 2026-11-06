/** Generic management normal path. Owner capabilities select contracts; the
 * existing evaluator, queue and snapshot remain the common coordinators. */
import {evaluateEdge} from '../compatibility.mjs';
import {createInvocationQueue} from '../queue.mjs';
import {createSnapshotManager} from '../snapshot.mjs';
import {createOwnedArtifactStore,captureNativeTensor,restoreNativeTensor,releaseArtifactHandle} from './artifacts.mjs';
const clone=structuredClone,text=v=>typeof v==='string'&&!!v,fail=(code,message)=>Object.assign(Error(message),{code});
const holderSource={repository:'Kushyameln01/kushyameln-works',commit:'59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f',path:'docs/shared/ai-connection/adapters/artifacts.mjs'};
const same=(a,b)=>{if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){if(a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);return x.every((v,i)=>v===y[i]);}const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&same(a[k],b[k]));};
const identity=o=>o&&Object.fromEntries(['ownerId','ownerInstanceId','configurationRevision','resourceGeneration','nativeSessionId','sourceRef','nativeAPI'].filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flags={generationReady:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};
function inputSlots(descriptor){
 if(!text(descriptor?.operationId)||Boolean(descriptor.artifact)===Boolean(descriptor.artifacts))throw fail('NORMAL_DESCRIPTOR_REQUIRED','Operation and exactly one common artifact or named artifacts required');
 if(descriptor.artifact)return [{name:'input',artifact:descriptor.artifact}];
 if(!descriptor.artifacts||typeof descriptor.artifacts!=='object'||Array.isArray(descriptor.artifacts)||!Object.keys(descriptor.artifacts).length)throw fail('NORMAL_DESCRIPTOR_REQUIRED','Nonempty named common artifacts required');
 const slots=Object.entries(descriptor.artifacts).map(([name,artifact])=>({name,artifact}));
 if(slots.some(s=>!text(s.name)||!s.artifact?.tensor)||new Set(slots.map(s=>s.artifact.artifactId)).size!==slots.length)throw fail('NORMAL_DESCRIPTOR_REQUIRED','Distinct named common tensor artifacts required');return slots;
}

export function createNormalOperationAdapter({owner,artifactStore=createOwnedArtifactStore(),managerSessionId='normal-manager:'+crypto.randomUUID()}={}){
 if(!['observe','querySupport','invoke','cancel','afterTerminal','release','recover','configure','dispose'].every(k=>typeof owner?.[k]==='function')||!text(managerSessionId))throw TypeError('Explicit normal owner facade and manager session required');
 let queue=null,queueObservation=null,closed=false,reconfiguring=false,epoch=0,serial=0,active=null,selection=null,currentResult=null,currentSnapshot=null;
 const records=new Map(),usedIds=new Set();
 const resource=o=>({bindingId:managerSessionId+':resource',ownerId:o.ownerId,resourceGeneration:o.resourceGeneration});
 const live=()=>{if(closed)throw fail('NORMAL_ADAPTER_DISPOSED','Normal adapter disposed');if(reconfiguring)throw fail('NORMAL_RECONFIGURING','Normal owner configuration is changing');};
 const observed=()=>{const o=owner.observe();if(!o||!text(o.ownerId)||!text(o.ownerInstanceId)||!Number.isSafeInteger(o.configurationRevision)||!text(o.resourceGeneration)||!o.sourceRef||!text(o.nativeAPI?.build)||!text(o.nativeAPI?.version)||o.disposed===true)throw fail('NORMAL_OWNER_OBSERVATION_INVALID','Current actual owner instance/configuration/source/API observation required');return clone(o);};
 const queueRecord=target=>{const r=records.get(target.requestId);if(!r||!same(r.queueTarget,target))throw fail('TARGET_MISMATCH','Queue callback differs from original normal request');return r;};
 function configuration(o){return {...resource(o),
  async cancel(target){const r=queueRecord(target);r.cancelRequested=true;if(r.nativeStarted)try{await owner.cancel(clone(r.target));}catch(error){if(error.code!=='TARGET_MISMATCH')r.cancelError=error;}await r.transactionTerminal.promise;return {stopped:true,originalTransactionTerminal:true,nativeDispatched:r.nativeStarted};},
  async afterTerminal(target){const r=queueRecord(target);await r.transactionTerminal.promise;if(!r.nativeStarted)return {reusable:true};const reply=await owner.afterTerminal(clone(r.target));if(reply?.originalTerminal!==true)throw fail('NORMAL_TERMINAL_UNCONFIRMED','Owner original operation terminal is unconfirmed');return {reusable:reply.reusable===true};},
  async release(target){const r=queueRecord(target);if(!r.nativeStarted)return;try{const reply=await owner.release(clone(r.target));if(reply?.released!==true)throw fail('NORMAL_RELEASE_UNCONFIRMED','Owner resource release not confirmed');r.resourceReleased=true;}catch(error){r.cleanupFailed=true;throw error;}}
 };}
 function ensureQueue(){const o=observed();if(!queue){queueObservation=o;queue=createInvocationQueue({resourceBindings:[configuration(o)]});}return o;}
 async function querySupport(descriptor){
  live();const requested=clone(descriptor),slots=inputSlots(requested),named=Boolean(requested.artifacts);
  const selectedEpoch=epoch,reply=await owner.querySupport(clone(requested));
  if(selectedEpoch!==epoch||closed||reconfiguring)throw fail('NORMAL_STALE','Configuration changed during support query');
  const now=observed();
  const boundPorts=slots.map(s=>named?reply?.consumerPorts?.[s.name]:reply?.consumerPort),portsValid=(!named||same(Object.keys(reply?.consumerPorts??{}).sort(),slots.map(s=>s.name).sort()))&&boundPorts.every(p=>p?.owner===now.ownerId&&same(p.sourceRef,now.sourceRef)&&p.nativeAPI?.build===now.nativeAPI.build);
  if(!reply||!['SUPPORTED','UNSUPPORTED','UNVERIFIED'].includes(reply.status)||!Array.isArray(reply.reasons)||!same(reply.requestDescriptor,requested)||!same(identity(reply.observation),identity(now))||reply.status==='SUPPORTED'&&(!text(reply.capabilityRef)||!portsValid||!reply.registry))return {status:'UNVERIFIED',capabilityRef:null,reasons:[{code:'NORMAL_SUPPORT_RESPONSE_MISMATCH',fieldPath:'/ownerResponse',reason:'Support response does not bind the actual current owner and requested descriptor'}],requestDescriptor:requested,observation:now,...(named?{edgeDecisions:null}:{edgeDecision:null}),dispatchSupported:false};
  if(reply.status!=='SUPPORTED')return {...clone(reply),...(named?{edgeDecisions:null}:{edgeDecision:null}),dispatchSupported:false};
  const decisions=Object.fromEntries(slots.map((s,i)=>[s.name,evaluateEdge(metadataEdge(s.artifact,boundPorts[i],requested.operationId,reply,serial,named?s.name:null))]));
  return {...clone(reply),...(named?{edgeDecisions:decisions}:{edgeDecision:decisions.input}),dispatchSupported:Object.values(decisions).every(d=>d.readiness.state==='ready')};
 }
 function metadataEdge(inputArtifact,inputPort,operationId,support,revision,name){
  const artifact=clone(inputArtifact);if(artifact.profileRef===undefined)artifact.profileRef=inputPort.profileRef;
  const sourceAPI={version:'works-owned-artifact-holder/0.1',build:'owned-artifact-holder:59ae817',transport:'direct',entrypoint:holderSource.path};
  const producerPort={portId:'owned-input'+(name?':'+name:''),bindingRef:managerSessionId+':input'+(name?':'+name:''),owner:managerSessionId+':input-holder',sourceRef:holderSource,nativeAPI:sourceAPI,artifactKind:artifact.kind,semantics:clone(artifact.semantics),profileRef:artifact.profileRef,tensor:{dtypes:[artifact.tensor.dtype],shape:clone(artifact.tensor.shape),axes:clone(artifact.tensor.axes)},requiredMetadata:[],requiredIdentities:[],ownershipModes:['copy'],transports:['direct'],allowedAdapterRefs:[],requiredExtensionSchemas:[]};
  artifact.ownership={ownerId:producerPort.owner,mode:'copy'};const consumerPort=clone(inputPort);
  return {producerPort,consumerPort,artifact,registry:clone(support.registry),adapters:[],requiredScopes:[],evidence:[],implementationState:{producer:{bindingRef:producerPort.bindingRef,state:'implemented',roles:['tensor-transform'],operationId:'owned-input'},consumer:{bindingRef:consumerPort.bindingRef,state:'implemented',roles:['tensor-transform'],operationId}},activeBindings:{producer:{bindingRef:producerPort.bindingRef,ownerId:producerPort.owner,valid:true,currentRevision:revision,expectedRevision:revision},consumer:{bindingRef:consumerPort.bindingRef,ownerId:consumerPort.owner,valid:true,currentRevision:revision,expectedRevision:revision}},resourceState:clone(support.observation.resourceState)};
 }
 function captureInput(r,support,slot){
  const named=Boolean(r.descriptor.artifacts),a=clone(slot.artifact),tensor=named?r.input?.[slot.name]:r.input,port=named?support.consumerPorts[slot.name]:support.consumerPort;
  if(!tensor||!ArrayBuffer.isView(tensor.data)||!same(tensor.shape,a.tensor?.shape)||tensor.dtype!==a.tensor.dtype||tensor.layout!==a.tensor.axes.join('')||tensor.meaning!==a.tensor.nativeMeaning)throw fail('NORMAL_INPUT_DESCRIPTOR_MISMATCH','Actual input shape/dtype/axes/meaning differs from the ordinary descriptor');
  for(const [key,value] of Object.entries(a.native.metadata))if(Object.hasOwn(tensor,key)&&!same(value,tensor[key]))throw fail('NORMAL_INPUT_DESCRIPTOR_MISMATCH','Explicit native metadata differs from actual input: '+key);
  if(a.profileRef===undefined)a.profileRef=port.profileRef;
  const handle=captureNativeTensor({tensor,response:{inputHolder:'management-owned-copy',originalDescriptor:a},descriptor:a,extensions:a.extensions,store:artifactStore});r.inputHandles.set(slot.name,handle);
  const artifact=clone(handle.descriptor);
  // The imported holder owns bytes, not the original producer. Preserve caller
  // lineage/provenance and explicit metadata outside its native derivation.
  artifact.provenance=clone(a.provenance);artifact.lineage=clone(a.lineage);artifact.native.metadata={...clone(a.native.metadata),...artifact.native.metadata};
  const edge=metadataEdge(artifact,port,r.descriptor.operationId,support,r.revision,named?slot.name:null);
  return {name:slot.name,edge};
 }
 const releaseInput=r=>{for(const handle of r.inputHandles?.values()??[])releaseArtifactHandle(handle,artifactStore);r.inputHandles?.clear();};
 const disposeSnapshot=async r=>{if(r?.snapshotManager&&!r.snapshotDisposed){await r.snapshotManager.dispose();r.snapshotDisposed=true;}};
 const bindingCurrent=r=>{try{return !closed&&!reconfiguring&&!r.invalidated&&r.epoch===epoch&&same(identity(r.observation),identity(observed()));}catch{return false;}};
 const current=r=>selection===r&&bindingCurrent(r);
 async function execute({descriptor,input,signal,onProgress,requestId='normal-request:'+crypto.randomUUID()}={}){
  live();if(!text(requestId)||usedIds.has(requestId))throw fail('NORMAL_REQUEST_ID_REUSED','Unique normal request ID required');if(signal!==undefined&&!(signal instanceof AbortSignal))throw TypeError('AbortSignal required');
  if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('Progress listener must be a function');
  // Own descriptor and payload before the first asynchronous owner query.
  const r={descriptor:clone(descriptor),input:clone(input),inputHandles:new Map(),requestId,epoch,revision:++serial,transactionTerminal:deferred(),done:deferred(),nativeStarted:false,cancelRequested:false,invalidated:false,finished:false};usedIds.add(requestId);
  const o=ensureQueue();r.queueTarget={...resource(o),requestId,revision:r.revision,activeToken:crypto.randomUUID()};r.target={requestId,managerSessionId,managerRevision:r.revision,resourceBinding:resource(o),activeToken:r.queueTarget.activeToken};records.set(requestId,r);
  const abort=()=>{r.cancelRequested=true;const entry=queue.inspect().invocations.find(e=>e.requestId===requestId);if(entry&&['queued','running','cancelling'].includes(entry.state))void queue.cancelInvocation(requestId,r.queueTarget).catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{
   const result=await queue.enqueue({id:requestId,requestId,ownerId:o.ownerId,resourceBinding:r.queueTarget.bindingId,resourceGeneration:r.queueTarget.resourceGeneration,revision:r.revision,activeToken:r.queueTarget.activeToken},async c=>{
    active=r;selection=r;r.queueTarget=c.target;
    const check=()=>{if(c.signal.aborted||signal?.aborted||r.cancelRequested)throw fail('INVOCATION_CANCELLED','Normal operation cancelled');if(closed||reconfiguring||r.epoch!==epoch)throw fail('INVOCATION_CANCELLED','Normal operation configuration invalidated');if(r.observation&&!current(r))throw fail('NORMAL_STALE','Owner instance/configuration changed');};
    try{
     check();const support=await querySupport(r.descriptor);check();if(support.status!=='SUPPORTED')return {...support,normalExecution:false,...flags};
     r.observation=clone(support.observation);r.support=support;const named=Boolean(r.descriptor.artifacts),slots=inputSlots(r.descriptor);
     if(named&&(!r.input||!same(Object.keys(r.input).sort(),slots.map(s=>s.name).sort())))throw fail('NORMAL_INPUT_DESCRIPTOR_MISMATCH','Native input keys must equal named artifact keys');
     const selected=slots.map(slot=>captureInput(r,support,slot));r.selected=selected;const decisions=Object.fromEntries(selected.map(s=>[s.name,evaluateEdge(s.edge)])),decisionFields=named?{edgeDecisions:decisions}:{edgeDecision:decisions.input};r.edgeDecisions=decisions;
     if(Object.values(decisions).some(d=>d.readiness.state!=='ready'))return {status:'BLOCKED',...decisionFields,reasons:Object.values(decisions).flatMap(d=>d.reasons),normalExecution:false,...flags};
     r.snapshotManager=createSnapshotManager({managerSessionId,registry:support.registry});
     const snapshotOwner={ownerId:o.ownerId,
      async prepare(){check();r.nativeStarted=true;const nativeInputs=Object.fromEntries([...r.inputHandles].map(([name,handle])=>[name,restoreNativeTensor(handle,artifactStore)])),nativeInput=named?nativeInputs:nativeInputs.input;const value=await owner.invoke({descriptor:clone(r.descriptor),input:nativeInput,target:clone(r.target),signal:c.signal,onProgress:progress=>{if(current(r)&&!c.signal.aborted&&!signal?.aborted&&!r.cancelRequested)try{onProgress?.(clone(progress));}catch{/* View callbacks cannot change the native transaction. */}}});check();return {candidate:{output:clone(value)}};},
      async validate(candidate,context){check();return {valid:true,target:context.target,operationId:context.operationId,snapshotId:context.snapshotId,stepId:context.stepId,scope:context.scopeId,sourceRef:context.sourceRef,nativeBuild:context.nativeBuild,capabilityRef:support.capabilityRef};},
      async commit(candidate,context){check();r.output=clone(candidate.output);return {state:'EXECUTION_COMPLETED',target:context.target,ownership:{kind:'independent-copy',ownerId:o.ownerId}};},
      async rollback(){r.invalidated=true;return {restored:true};},
      async release(){releaseInput(r);return {released:true};}
     };
     const artifactRefs=selected.map(s=>s.edge.artifact.artifactId),ports=selected.map(s=>s.edge.consumerPort);
     const profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'works:normal-operation',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:artifactRefs,steps:[{stepId:'normal-operation',moduleId:o.ownerId,operationId:r.descriptor.operationId,inputBindings:selected.map(s=>({portId:s.name,artifactRef:s.edge.artifact.artifactId})),outputBindings:[{portId:'output',artifactRef:requestId+':output'}],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:[]};
     const binding={stepId:'normal-operation',moduleId:o.ownerId,operationId:r.descriptor.operationId,moduleVersion:o.nativeAPI.version,nativeBindingRefs:ports.map(p=>p.bindingRef),artifactRefs,modelProfileRefs:[...new Set(ports.map(p=>p.profileRef))],adapterSelectionRefs:[],localRevisionBindings:{configuration:o.configurationRevision,invocation:r.revision},sourceRef:clone(o.sourceRef),nativeBuild:o.nativeAPI.build,implementationState:'implemented',resourceBinding:clone(r.target.resourceBinding),capabilityRef:support.capabilityRef,owner:snapshotOwner,isCurrent:()=>current(r),edges:selected.map(s=>s.edge)};
     const token=await r.snapshotManager.stageSnapshot(profile,{snapshotId:requestId+':snapshot',managerRevision:r.revision,artifactManifestRef:requestId+':in-memory-artifacts',evidenceManifestRef:requestId+':normal-structural-acknowledgement',requestedScope:{kind:'normal',scopeId:r.descriptor.operationId},steps:[binding]});check();
     const published=await r.snapshotManager.publishSnapshot(token,{currentBindings:{'normal-operation':{localRevisionBindings:binding.localRevisionBindings,resourceBinding:binding.resourceBinding}}});check();
     return {status:'EXECUTION_COMPLETED',output:clone(r.output),snapshot:published.snapshot,...decisionFields,...(named?{inputDescriptors:Object.fromEntries(selected.map(s=>[s.name,clone(s.edge.artifact)])),inputProducers:Object.fromEntries(selected.map(s=>[s.name,{kind:'management-owned-data-holder',sourceRef:holderSource}]))}:{inputDescriptor:clone(selected[0].edge.artifact),inputProducer:{kind:'management-owned-data-holder',sourceRef:holderSource}}),operation:r.descriptor.operationId,normalExecution:true,...flags};
    }finally{r.transactionTerminal.resolve();}
   });
   r.finished=true;const terminal=queue.inspect().invocations.find(e=>e.requestId===requestId);
   if(result.status==='EXECUTION_COMPLETED'){
    if(!terminal?.originalTerminal||!terminal.resourceReleased||!terminal.reusable||!terminal.resultAccepted)throw fail('NORMAL_TERMINAL_UNCONFIRMED','Original transaction and owner release must finish before returning success');
    if(!bindingCurrent(r))throw fail('NORMAL_STALE','Owner changed before result adoption');
    // A following queued operation can start before this continuation resumes.
    // Its selection does not invalidate an independently copied, released result.
    if(selection===r){if(currentSnapshot&&currentSnapshot!==r)await disposeSnapshot(currentSnapshot);currentSnapshot=r;currentResult=r;}
    else await disposeSnapshot(r);
    return {...result,target:clone(r.target),terminal:clone(terminal)};
   }
   releaseInput(r);return {...result,terminal:clone(terminal)};
  }catch(error){r.invalidated=true;r.finished=true;if(currentResult===r)currentResult=null;try{await disposeSnapshot(r);}catch(cleanup){r.snapshotCleanupError=cleanup;}releaseInput(r);throw error;}
  finally{signal?.removeEventListener('abort',abort);if(active===r)active=null;r.input=null;r.output=null;r.descriptor=null;r.selected=null;r.support=null;records.delete(requestId);r.done.resolve();}
 }
 async function cancel(target){const r=records.get(target?.requestId);if(!r||!same(r.target,target)||r.finished)throw fail('TARGET_MISMATCH','Exact current normal target required');r.cancelRequested=true;return queue.cancelInvocation(r.requestId,r.queueTarget);}
 async function retire(){for(const r of new Set([...records.values(),currentSnapshot].filter(Boolean))){r.invalidated=true;await disposeSnapshot(r);releaseInput(r);}currentSnapshot=null;currentResult=null;}
 async function configure(configuration){live();reconfiguring=true;epoch++;currentResult=null;try{await queue?.dispose();await Promise.all([...records.values()].map(r=>r.done.promise));await retire();const reply=await owner.configure(clone(configuration));queue=null;queueObservation=null;selection=null;return clone(reply);}finally{reconfiguring=false;}}
 async function recover(){if(reconfiguring)throw fail('NORMAL_RECONFIGURING','Configuration is changing');await queue?.drain();const reply=await owner.recover();if(reply?.recovered!==true||reply.resourceReleased!==true)throw fail('NORMAL_RECOVERY_UNCONFIRMED','Owner stop/release recovery required');await retire();const o=observed();if(queue&&!queue.inspect().disposed){queue.rebindResource(configuration(o),{verified:true,evidenceRef:'normal-owner-recovery:'+crypto.randomUUID()});queueObservation=o;}else{queue=null;queueObservation=null;}selection=null;return {...clone(reply),...flags};}
 async function dispose(){if(closed&&!queue)return {disposed:true};closed=true;epoch++;currentResult=null;await queue?.dispose();await Promise.all([...records.values()].map(r=>r.done.promise));await retire();await owner.dispose();queue=null;return {disposed:true,...flags};}
 return Object.freeze({querySupport,execute,configure,cancel,recover,dispose,inspect(){return {disposed:closed,reconfiguring,activeTarget:clone(active?.target??null),targets:[...records.values()].filter(r=>!r.finished).map(r=>clone(r.target)),ownerObservation:clone(owner.observe()),queue:queue?.inspect()??null,currentResult:currentResult&&current(currentResult)?{requestId:currentResult.requestId,status:'EXECUTION_COMPLETED',snapshotId:currentResult.requestId+':snapshot'}:null,snapshot:currentSnapshot?.snapshotManager.inspect()??null,...flags};}});
}

import {canonicalize} from '../canonical.mjs';
import {CANDIDATE_ADOPTED_LORA_VERSION,CANDIDATE_ADOPTED_LORA_SOURCE} from './adopted-lora.mjs';

export const SNAPSHOT_NATIVE_LORA_VERSION='works-snapshot-native-lora/0.1-draft.1';
const clone=structuredClone;
const fail=(code,message)=>Object.assign(Error(message),{code});
const text=v=>typeof v==='string'&&v.length>0;
const same=(a,b)=>{try{return canonicalize(a)===canonicalize(b);}catch{return false;}};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});void promise.catch(()=>{});return {promise,resolve,reject};};
const exactQueueTarget=(a,b)=>!!a&&!!b&&['invocationId','bindingId','ownerId','resourceGeneration','requestId','revision','activeToken'].every(k=>a[k]===b[k]);

/** Snapshot lifecycle sidecar over the separately pinned public owner adapter.
 * The queue holds the original SDK stage through its deferred public commit.
 * Native candidates remain opaque; publication alone retires rollback history. */
export function createSnapshotNativeLoraOwner({adapter,plan,planTarget,validation,resourceBinding,queue,requestPrefix}={}){
 if(adapter?.contractVersion!==CANDIDATE_ADOPTED_LORA_VERSION||!['prepare','openStage','finalize','release','recover','cancelCurrent','describeBinding'].every(k=>typeof adapter[k]==='function'))throw fail('CANDIDATE_ADAPTER_REQUIRED','Explicit separately pinned candidate adapter required');
 if(!text(requestPrefix)||!resourceBinding||!['ownerId','bindingId','resourceGeneration'].every(k=>text(resourceBinding[k]))||typeof queue?.enqueue!=='function')throw fail('OWNER_BINDING_REQUIRED','Explicit queue, request prefix and owned resource generation required');
 if(!planTarget||!same(planTarget.resourceBinding,resourceBinding)||!text(planTarget.managerSessionId)||!Number.isSafeInteger(planTarget.managerRevision)||!text(planTarget.requestId))throw fail('PLAN_TARGET_REQUIRED','Pass the original explicit plan target cohort');
 if(plan?.contractVersion!=='lora-connection/2.0-draft.1'||plan.coverage!=='PARTIAL'||plan.scope!=='diagnostic-projection'||plan.buildId!==CANDIDATE_ADOPTED_LORA_SOURCE.kernel.sha256)throw fail('PLAN_BINDING_MISMATCH','Actual candidate diagnostic native plan required');
 const resource=clone(resourceBinding),cohort=clone(planTarget),reference=clone(validation),records=new WeakMap(),byInvocation=new Map();let sequence=0,claimed=false;
 const nativeRevisions={sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision};
 function phase(r,name){return {...clone(cohort),requestId:`${requestPrefix}:${r.index}:${name}:${++sequence}`};}
 function record(candidate){const r=records.get(candidate);if(!r)throw fail('FOREIGN_CANDIDATE','Use the exact owner candidate');return r;}
 function checkContext(r,c){if(!c||!same(c.target,r.target)||!same(c.resourceBinding,resource)||!same(c.localRevisionBindings,nativeRevisions))throw fail('SNAPSHOT_TARGET_MISMATCH','Snapshot target or native local revisions changed');}
 function checkInitial(c){if(!c||c.managerSessionId!==cohort.managerSessionId||c.managerRevision!==cohort.managerRevision||!same(c.resourceBinding,resource)||!same(c.localRevisionBindings,nativeRevisions)||c.scopeId!=='diagnostic-projection'||c.nativeBuild!==plan.buildId||c.sourceRef?.commit!==CANDIDATE_ADOPTED_LORA_SOURCE.sdk.commit||c.sourceRef?.path!==CANDIDATE_ADOPTED_LORA_SOURCE.sdk.path||c.isCurrent()!==true)throw fail('SNAPSHOT_BINDING_MISMATCH','Current source/build/revision-bound native diagnostic context required');}
 function invocationRecord(target){const r=byInvocation.get(target?.invocationId);if(!r||!exactQueueTarget(r.queueTarget,target))throw fail('TARGET_MISMATCH','Queue callback does not identify this owned invocation');return r;}
 async function releasePrepared(r){if(r.prepared&&!r.preparedReleased){await adapter.release(r.prepared,{target:phase(r,'release')});r.preparedReleased=true;r.prepared=null;r.control=null;}}
 async function rollback(r){
  if(r.publicationCommitted||r.rolledBack)return {restored:true,native:r.rollbackReply??null};
  r.control?.abort();await r.queuePromise.catch(()=>{});
  if(r.control){const result=await r.control.rollback();if(result?.completed!==true||r.envelope&&result.native?.restored!==true)throw fail('ROLLBACK_UNCONFIRMED','Public owner rollback not confirmed');r.rollbackReply=result.native;}
  else if(r.rawTask)await adapter.recover(r.prepared??undefined,{target:phase(r,'recover')});
  r.rolledBack=true;return {restored:true,native:r.rollbackReply??null};
 }
 const owner={ownerId:resource.ownerId,contractVersion:SNAPSHOT_NATIVE_LORA_VERSION,
  async prepare(c){
   checkInitial(c);if(claimed)throw fail('OWNER_ALREADY_PREPARED','Use one snapshot candidate per selected native plan');claimed=true;const index=++sequence,candidate=Object.freeze({ownerId:resource.ownerId,candidateId:`${requestPrefix}:candidate:${index}`}),ready=deferred();
   const r={index,target:clone(c.target),context:c,candidate,prepared:null,control:null,envelope:null,receipt:null,checkpoint:null,published:false,rolledBack:false,preparedReleased:false,terminal:false,queueReleased:false,rawError:null};records.set(candidate,r);r.ready=ready;
   const id=`${requestPrefix}:invocation:${index}`,requestId=`${requestPrefix}:native:${index}`,activeToken=`${requestPrefix}:token:${index}`;
   r.queueTarget=Object.freeze({invocationId:id,bindingId:resource.bindingId,ownerId:resource.ownerId,resourceGeneration:resource.resourceGeneration,requestId,revision:c.managerRevision,activeToken});byInvocation.set(id,r);
   r.queuePromise=queue.enqueue({id,requestId,ownerId:resource.ownerId,resourceBinding:resource.bindingId,resourceGeneration:resource.resourceGeneration,revision:c.managerRevision,activeToken},({signal,target})=>{
    if(!exactQueueTarget(target,r.queueTarget))throw fail('TARGET_MISMATCH','Queue dispatched a different native target');
    r.rawTask=(async()=>{
     try{
      r.binding=await adapter.describeBinding();
      if(!same(r.binding.management.resourceBinding,resource)||r.binding.management.sdkInstanceId!==plan.sdkInstanceId||r.binding.owner.connectionRegistryHash!==plan.registryHash)throw fail('NATIVE_BINDING_CHANGED','Public adapter binding differs from selected plan');
      r.phaseTarget=phase(r,'prepare');r.prepared=await adapter.prepare(plan,{target:r.phaseTarget,signal});
      r.phaseTarget=phase(r,'stage');r.control=adapter.openStage(r.prepared,reference,{target:r.phaseTarget,isCurrent:()=>c.isCurrent()===true,signal});ready.resolve();
      r.envelope=await r.control.completion;return r.envelope;
     }catch(error){r.rawError=error;ready.reject(error);throw error;}finally{r.terminal=true;}
    })();void r.rawTask.catch(()=>{});return r.rawTask;
   });
   void r.queuePromise.catch(error=>{ready.reject(r.rawError??error);});
   return {candidate,previousSessionReleased:false};
  },
  async validate(candidate,c){const r=record(candidate);checkContext(r,c);await r.ready.promise;r.checkpoint=await r.control.checkpoint;if(c.isCurrent()!==true)throw fail('STALE_BINDING','Snapshot changed at native validation checkpoint');
   const v=r.checkpoint.validation,m=r.checkpoint.management,native=v?.evidence?.nativeReceipt;
   if(v?.valid!==true||v.planId!==plan.planId||v.registryHash!==plan.registryHash||v.sourceSha256!==plan.sourceSha256||v.coverage!=='PARTIAL'||v.scope!=='diagnostic-projection'||v.evidence?.nativeRegistryHash!==r.binding.owner.nativeRegistryHash||native?.registryHash!==r.binding.owner.nativeRegistryHash||native?.modelHash!==r.binding.owner.nativeRegistry.modelHash||native?.graphHash!==r.binding.owner.nativeRegistry.graphHash||!same(m.localRevisionBindings,nativeRevisions)||!same(m.target,r.phaseTarget)||!same(m.sourcePins,r.binding.management.sourcePins))throw fail('NATIVE_VALIDATION_MISMATCH','Both public registries and exact native validation checkpoint required');
   return {valid:true,target:clone(c.target),snapshotId:c.snapshotId,stepId:c.stepId,operationId:c.operationId,scope:c.scopeId,coverage:'PARTIAL',sourceRef:clone(c.sourceRef),nativeBuild:c.nativeBuild,evidenceRefs:[`native-validation:${native.candidateId}`,`native-plan:${plan.planId}`],nativeValidation:v,management:m};
  },
  async commit(candidate,c){const r=record(candidate);checkContext(r,c);if(!r.checkpoint||r.rolledBack||r.published||c.isCurrent()!==true)throw fail('STALE_BINDING','Validated live snapshot candidate required');
   void r.control.commit().catch(()=>{});try{r.envelope=await r.queuePromise;}catch(error){throw r.rawError??error;}
   if(c.isCurrent()!==true)throw fail('STALE_BINDING','Snapshot changed before manager publication');
   r.receipt=Object.freeze({target:clone(c.target),state:r.envelope.receipt.state,ownership:r.envelope.receipt.ownership,nativeEnvelope:r.envelope});return r.receipt;
  },
  async acceptOwnership(candidate,receipt,c){const r=record(candidate);checkContext(r,c);return receipt===r.receipt&&receipt.nativeEnvelope===r.envelope&&same(receipt.target,c.target)&&same(receipt.ownership,r.envelope?.receipt.ownership)&&receipt.ownership.kind==='independent-copy'&&text(receipt.ownership.ownerId)&&same(r.envelope.receipt.validation,r.checkpoint.validation)&&same(r.envelope.management.target,r.phaseTarget)&&same(r.envelope.management.sourcePins,r.binding.management.sourcePins)&&same(r.envelope.management.localRevisionBindings,nativeRevisions);},
  async rollback(candidate,c){const r=record(candidate);checkContext(r,c);return rollback(r);},
  async published(candidate,c){const r=record(candidate);checkContext(r,c);if(r.rolledBack||!r.envelope)throw fail('PUBLICATION_INVALID','Committed native candidate required');r.publicationCommitted=true;
   if(!r.finalized){await adapter.finalize(r.prepared,r.envelope,{target:phase(r,'finalize')});r.finalized=true;}
   await releasePrepared(r);r.published=true;return {published:true,generationReady:false};
  },
  async release(candidate,c){const r=record(candidate);checkContext(r,c);if(r.publicationCommitted&&!r.published)await owner.published(candidate,c);if(!r.published&&!r.rolledBack)await rollback(r);await releasePrepared(r);r.preparedReleased=true;byInvocation.delete(r.queueTarget.invocationId);return {released:true};},
  async cancelInvocation(target){const r=invocationRecord(target);r.control?.abort();if(!r.terminal&&r.phaseTarget)await adapter.cancelCurrent(r.phaseTarget);await r.rawTask?.catch(()=>{});return {stopped:r.terminal};},
  async afterInvocation(target,outcome){const r=invocationRecord(target);return {reusable:outcome.notStarted===true||r.terminal&&!(r.rawError instanceof AggregateError)};},
  async releaseInvocation(target,outcome){const r=invocationRecord(target);if(!r.terminal&&outcome.notStarted!==true)throw fail('NATIVE_NOT_TERMINAL','Original native task still owns the queue slot');r.queueReleased=true;byInvocation.delete(target.invocationId);},
  invocationTarget(candidate){const r=record(candidate);return {id:r.queueTarget.invocationId,target:clone(r.queueTarget)};},
  inspect(candidate){const r=record(candidate);return {target:clone(r.target),queueTarget:clone(r.queueTarget),nativePhaseTarget:r.phaseTarget?clone(r.phaseTarget):null,nativeValidation:r.checkpoint?.validation??null,stageEnvelope:r.envelope,originalTerminal:r.terminal,queueReleased:r.queueReleased,publicationCommitted:r.publicationCommitted===true,published:r.published,rolledBack:r.rolledBack,preparedReleased:r.preparedReleased,generationReady:false};}
 };
 return Object.freeze(owner);
}

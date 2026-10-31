import {validatePipelineProfile,validateExecutionSnapshot} from './descriptor.mjs';
import {canonicalize,hashCanonical} from './canonical.mjs';
import {evaluateEdge} from './compatibility.mjs';
const clone=x=>structuredClone(x);
const same=(a,b)=>canonicalize(a)===canonicalize(b);
const matches=(a,b)=>{try{return same(a,b);}catch{return false;}};
const fail=(code,message)=>Object.assign(Error(message),{code});
const text=x=>typeof x==='string'&&x.length>0;
const source=s=>s&&((text(s.repository)&&/^[a-f0-9]{40}$/.test(s.commit)&&text(s.path))||(text(s.archiveRef)&&/^[a-f0-9]{64}$/.test(s.sha256)));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};

/** Diagnostic-scope finite transaction coordinator. Public owner facades are
 * injected; no native runtime/global state is read. No generation admission is
 * implemented: diagnostics never become full-model proof through publication. */
export function createSnapshotManager({managerSessionId,registry}={}){
 if(!text(managerSessionId))throw TypeError('Explicit managerSessionId required');
 const stages=new WeakMap(),history=new Set(),snapshotIds=new Set();let revision=0,busy=false,disposed=false,active=null,activeRecord=null,currentStage=null,recovery=null,state='UNCONFIGURED';
 const trace=[];
 const event=(phase,stepId=null)=>trace.push({managerRevision:revision,phase,stepId});
 function enter(allowRecovery=false){if(disposed)throw fail('DISPOSED','Snapshot manager disposed');if(busy)throw fail('BUSY','Snapshot transaction/cleanup busy');if(recovery&&!allowRecovery)throw fail('RECOVERY_REQUIRED','Owner recovery is required');busy=true;}
 function validStage(token){const r=stages.get(token);if(!r||r!==currentStage||r.closed||r.revision!==revision)throw fail('STALE_STAGE','Stale or closed snapshot stage');return r;}
 function selected(s){try{return s.original.isCurrent()===true;}catch{return false;}}
 function leaseValid(s){try{return s.receipt?.ownership.kind!=='lease'||s.receipt.ownership.isValid()===true;}catch{return false;}}
 function current(r,s){return !disposed&&!r.closed&&r.revision===revision&&selected(s);}
 function activeCurrent(){return !disposed&&!busy&&!recovery&&!!activeRecord&&activeRecord.steps.length>0&&activeRecord.revision===revision&&activeRecord.steps.every(s=>!s.released&&selected(s)&&leaseValid(s));}
 function receiptTarget(r,s){return freeze({snapshotId:r.snapshot.snapshotId,snapshotHash:r.snapshot.snapshotHash,managerSessionId,managerRevision:r.revision,stepId:s.binding.stepId,operationId:s.binding.operationId,resourceBinding:clone(s.binding.resourceBinding),localRevisionBindings:clone(s.binding.localRevisionBindings)});}
 function context(r,s){return Object.freeze({target:receiptTarget(r,s),snapshotId:r.snapshot.snapshotId,snapshotHash:r.snapshot.snapshotHash,profileRef:r.snapshot.pipelineProfileRef,managerSessionId,managerRevision:r.revision,stepId:s.binding.stepId,scopeId:r.scope.scopeId,
  sourceRef:freeze(clone(s.binding.sourceRef)),nativeBuild:s.binding.nativeBuild,resourceBinding:freeze(clone(s.binding.resourceBinding)),
  operationId:s.binding.operationId,localRevisionBindings:freeze(clone(s.binding.localRevisionBindings)),isCurrent:()=>current(r,s)});}
 function forget(r){history.delete(r);for(const s of r.prepared){s.candidate=undefined;s.receipt=undefined;}r.prepared=[];r.steps=[];}
 async function releaseRecord(r){
  const errors=[];for(const s of r.prepared)if(!s.released){try{const reply=await s.owner.release(s.candidate,context(r,s));if(reply?.released!==true)throw Error('Owner release not confirmed');s.released=true;event('OWNER_RELEASED',s.binding.stepId);}catch(e){errors.push(e);}}
  if(errors.length)throw new AggregateError(errors,'Snapshot owner resources retained');forget(r);
 }
 async function cleanup(r){
  const errors=[];state='ROLLING_BACK';event(state);
  for(const s of [...r.prepared].reverse()){
   const c=context(r,s);
   if(!s.rolledBack){try{const reply=await s.owner.rollback(s.candidate,c);if(reply?.restored!==true)throw Error('Owner did not confirm restoration');s.rolledBack=true;event('OWNER_ROLLED_BACK',s.binding.stepId);}catch(e){errors.push(e);continue;}}
   if(s.previousReleased&&!s.reloaded){try{if(!r.previous||typeof s.owner.reload!=='function')throw Error('Released previous session requires explicit reload');const reply=await s.owner.reload(clone(r.previous),c);if(reply?.restored!==true)throw Error('Previous session reload not confirmed');s.reloaded=true;event('PREVIOUS_RELOADED',s.binding.stepId);}catch(e){errors.push(e);continue;}}
   if(!s.released){try{const reply=await s.owner.release(s.candidate,c);if(reply?.released!==true)throw Error('Owner release not confirmed');s.released=true;event('OWNER_RELEASED',s.binding.stepId);}catch(e){errors.push(e);}}
  }
  if(errors.length){recovery={record:r,mode:'rollback'};state='RECOVERY_REQUIRED';event(state);throw new AggregateError(errors,'Snapshot owner recovery required');}
  r.closed=true;currentStage=null;recovery=null;forget(r);state='FAILED';event(state);
 }
 async function stageSnapshot(profile,bindings){
  enter();let r,selecting=false;
  try{
   if(currentStage)throw fail('STAGE_PENDING','Publish or abort the current stage before selecting another');
   if(!bindings||!Number.isSafeInteger(bindings.managerRevision)||bindings.managerRevision<=revision||!text(bindings.snapshotId))throw fail('INVALID_REVISION','A unique snapshot ID and newer manager revision are required');
   revision=bindings.managerRevision;selecting=true;state='SELECTING';event(state);
   if(snapshotIds.has(bindings.snapshotId))throw fail('SNAPSHOT_ID_REUSED','Snapshot IDs cannot be reused for a later selection');snapshotIds.add(bindings.snapshotId);
   const checked=validatePipelineProfile(profile,registry);if(!checked.valid)throw fail('INVALID_PROFILE','Invalid finite pipeline profile');
   const scope=bindings.requestedScope;
   if(scope?.kind!=='diagnostic'||!text(scope.scopeId)||!profile.requiredEvidenceScopes.includes(scope.scopeId))throw fail('SCOPE_NOT_SUPPORTED','Only explicitly selected diagnostic scopes are implemented; generation remains blocked');
   if(!Array.isArray(bindings.steps)||bindings.steps.length!==profile.steps.length||new Set(bindings.steps.map(s=>s.stepId)).size!==bindings.steps.length)throw fail('STEP_BINDINGS_INVALID','Bind every finite profile step exactly once');
   const mapped=profile.steps.map(step=>{
    const b=bindings.steps.find(x=>x.stepId===step.stepId);
    if(!b||b.moduleId!==step.moduleId||b.operationId!==step.operationId||b.implementationState!=='implemented'||!source(b.sourceRef)||!text(b.nativeBuild)||!text(b.moduleVersion))throw fail('STEP_NOT_READY','Implemented operation/source/build-bound step required');
    if(!b.resourceBinding||b.owner?.ownerId!==b.resourceBinding.ownerId||!text(b.resourceBinding.bindingId)||!text(b.resourceBinding.resourceGeneration)||typeof b.isCurrent!=='function'||b.isCurrent()!==true)throw fail('BINDING_NOT_CURRENT','Explicit current resource owner/generation is required');
    if(['prepare','validate','commit','rollback','release'].some(k=>typeof b.owner[k]!=='function'))throw fail('OWNER_CONTRACT_INVALID','Owner prepare/validate/commit/rollback/release facade required');
    if(!Array.isArray(b.adapterSelectionRefs)||step.adapterRefs.some(ref=>!b.adapterSelectionRefs.includes(ref)))throw fail('ADAPTER_BINDING_MISSING','Only declared required adapter selections are enforced');
    for(const edge of b.edges??[]){const decision=evaluateEdge({...edge,requiredScopes:[...new Set([...(edge.requiredScopes??[]),...profile.requiredEvidenceScopes])]});if(decision.readiness.state!=='ready')throw fail('EDGE_NOT_READY','Selected edge contract/scope/resource readiness is not satisfied');}
    if(b.allowedConsumerOwners!==undefined&&(!Array.isArray(b.allowedConsumerOwners)||!b.allowedConsumerOwners.every(text)))throw fail('OWNER_CONTRACT_INVALID','Allowed consumer owners must be explicit owner IDs');
    const binding=clone(Object.fromEntries(Object.entries(b).filter(([key])=>!['owner','isCurrent','edges'].includes(key))));
    return {binding,original:b,owner:Object.freeze({...b.owner}),candidate:undefined,rolledBack:false,released:false,reloaded:false,committed:false};
   });
   const snapshot={contractVersion:profile.contractVersion,snapshotId:bindings.snapshotId,snapshotHash:'pending',managerSessionId,managerRevision:bindings.managerRevision,pipelineProfileRef:`${profile.profileId}@${profile.profileVersion}`,
    stepBindings:mapped.map(({binding:b})=>({stepId:b.stepId,moduleId:b.moduleId,operationId:b.operationId,moduleVersion:b.moduleVersion,nativeBindingRefs:b.nativeBindingRefs,artifactRefs:b.artifactRefs,modelProfileRefs:b.modelProfileRefs,adapterSelectionRefs:b.adapterSelectionRefs,localRevisionBindings:b.localRevisionBindings,sourceRef:b.sourceRef,nativeBuild:b.nativeBuild,resourceBinding:b.resourceBinding})),
    artifactManifestRef:bindings.artifactManifestRef,evidenceManifestRef:bindings.evidenceManifestRef,executionScope:clone(scope)};
   const v=validateExecutionSnapshot(snapshot,registry);if(!v.valid)throw fail('INVALID_SNAPSHOT','Snapshot references/revisions fail the common descriptor contract');
   const hashInput={...snapshot};delete hashInput.snapshotHash;snapshot.snapshotHash=await hashCanonical(hashInput);
   revision=bindings.managerRevision;r={revision,snapshot:freeze(snapshot),scope:clone(scope),steps:mapped,prepared:[],previous:active?clone(active):null,closed:false,nativeStates:[]};history.add(r);currentStage=r;state='STAGING';event(state);
   for(const s of mapped){
    if(!current(r,s))throw fail('STALE_BINDING','Owner binding is no longer current');
    const c=context(r,s),prepared=await s.owner.prepare(c);
    if(!prepared||!Object.hasOwn(prepared,'candidate')||prepared.candidate===undefined)throw fail('OWNER_PREPARE_INVALID','Owner must return an explicit candidate');
    s.candidate=prepared.candidate;s.previousReleased=prepared.previousSessionReleased===true;r.prepared.push(s);event('OWNER_PREPARED',s.binding.stepId);
    const validation=await s.owner.validate(s.candidate,c);
    if(!validation||validation.valid!==true||!matches(validation.target,c.target)||validation.operationId!==s.binding.operationId||validation.snapshotId!==snapshot.snapshotId||validation.stepId!==s.binding.stepId||validation.scope!==scope.scopeId||!['PARTIAL','FULL'].includes(validation.coverage)||!matches(validation.sourceRef,s.binding.sourceRef)||validation.nativeBuild!==s.binding.nativeBuild||!Array.isArray(validation.evidenceRefs)||!validation.evidenceRefs.length||!validation.evidenceRefs.every(text))throw fail('OWNER_VALIDATION_INVALID','Target/version/source/operation/step-bound diagnostic validation evidence required');
    s.validation=freeze(clone(validation));event('OWNER_VALIDATED',s.binding.stepId);
   }
   state='STAGED';event(state);const token=Object.freeze({snapshotId:snapshot.snapshotId,managerRevision:revision});stages.set(token,r);return token;
  }catch(e){if(r)try{await cleanup(r);}catch(recoveryError){throw new AggregateError([e,recoveryError],'Snapshot stage failed; owner recovery required');}else if(selecting){state='FAILED';event(state);}throw e;}
  finally{busy=false;}
 }
 async function publishSnapshot(token,{currentBindings}={}){
  enter();let r;
  try{
   r=validStage(token);
   for(const s of r.steps){const observed=currentBindings?.[s.binding.stepId];if(!observed||!same(observed.localRevisionBindings,s.binding.localRevisionBindings)||!same(observed.resourceBinding,s.binding.resourceBinding)||!current(r,s))throw fail('BINDING_MISMATCH','Current local revision/resource binding changed before publication');}
   state='COMMITTING';event(state);
   for(const s of r.steps){if(!current(r,s))throw fail('STALE_BINDING','Stale owner before native commit');const receipt=await s.owner.commit(s.candidate,context(r,s));
    if(!matches(receipt?.target,receiptTarget(r,s)))throw fail('RECEIPT_TARGET_MISMATCH','Owner commit receipt target differs from this snapshot/revision/resource binding');
    if(!receipt||!['STAGED','CONSUMER_APPLIED'].includes(receipt.state)||!['independent-copy','lease'].includes(receipt.ownership?.kind)||![s.binding.resourceBinding.ownerId,...s.binding.allowedConsumerOwners??[]].includes(receipt.ownership.ownerId)||receipt.ownership.kind==='lease'&&(typeof receipt.ownership.isValid!=='function'||receipt.ownership.isValid()!==true))throw fail('OWNERSHIP_UNVERIFIED','Native state and explicit owner copy or valid lease required');
    s.committed=true;s.receipt=receipt;r.nativeStates.push({stepId:s.binding.stepId,state:receipt.state,ownership:{kind:receipt.ownership.kind,ownerId:receipt.ownership.ownerId}});event('NATIVE_COMMITTED',s.binding.stepId);
   }
   if(r.steps.some(s=>!current(r,s)||!leaseValid(s)))throw fail('STALE_BINDING','Owner binding or lease expired during commit');
   const previousRecord=activeRecord;active=r.snapshot;activeRecord=r;r.closed=true;currentStage=null;state='SNAPSHOT_PUBLISHED';event(state);
   if(previousRecord)try{await releaseRecord(previousRecord);}catch{recovery={record:previousRecord,mode:'retire'};state='RECOVERY_REQUIRED';event(state);}
   return {state:'SNAPSHOT_PUBLISHED',snapshot:clone(active),nativeStates:clone(r.nativeStates),cleanupRequired:!!recovery,generationReady:false};
  }catch(e){if(r&&!r.closed)try{await cleanup(r);}catch(recoveryError){throw new AggregateError([e,recoveryError],'Snapshot publication failed; owner recovery required');}throw e;}
  finally{busy=false;}
 }
 async function abortSnapshot(token){enter();try{await cleanup(validStage(token));}finally{busy=false;}}
 async function disposeResources(){const errors=[];for(const r of [...history])try{await releaseRecord(r);}catch(e){errors.push(e);}if(errors.length){recovery={mode:'dispose'};state='RECOVERY_REQUIRED';event(state);throw new AggregateError(errors,'Snapshot resources retained; retry owner release/disposal');}disposed=true;active=null;activeRecord=null;recovery=null;state='DISPOSED';event(state);}
 async function recover(){if(busy)throw fail('BUSY','Snapshot cleanup busy');if(!recovery)return;busy=true;try{const pending=recovery;if(pending.mode==='rollback')await cleanup(pending.record);else if(pending.mode==='retire'){await releaseRecord(pending.record);recovery=null;state='SNAPSHOT_PUBLISHED';event(state);}else await disposeResources();}finally{busy=false;}}
 async function dispose(){enter(true);state='DISPOSING';event(state);try{if(currentStage)await cleanup(currentStage);await disposeResources();}finally{busy=false;}}
 return Object.freeze({stageSnapshot,publishSnapshot,abortSnapshot,recover,dispose,get active(){return active?clone(active):null;},inspect(){return {state,managerRevision:revision,activeSnapshotId:active?.snapshotId??null,selectionCurrent:activeCurrent(),generationReady:false,trace:clone(trace)};}});
}

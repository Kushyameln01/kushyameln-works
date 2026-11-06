import {canonicalize} from '../canonical.mjs';
import {createNormExecution,NORM_EXECUTION_POLICIES} from '../norm-execution.mjs';
import {isSnapshotPublicationContext} from '../snapshot.mjs';
import {createNormRequiredLoraExecution} from './norm-required-lora.mjs';
import {createLoraManagementAdmissionInputs,catalogSourceAlias} from './lora-data/management-admission-inputs.mjs';
import {isVerifiedLoraAdmissionDataSources,LORA_ADMISSION_DATA_SOURCE} from './lora-data/source.mjs';

export const LORA_DATA_PHASE_BRIDGE_VERSION='works-lora-data-phase-bridge/0.1-draft.1';
const clone=structuredClone;
const fail=(code,message)=>Object.assign(Error(message),{code});
const same=(a,b)=>{try{return canonicalize(a)===canonicalize(b);}catch{return false;}};
const revisions=p=>({sdkInstanceId:p.sdkInstanceId,localInputRevision:p.localInputRevision,localApplicationRevision:p.localApplicationRevision});
const copyInput=q=>{const {referenceSet,...context}=q.referenceContext;return {...clone({...q,referenceContext:context}),referenceContext:{...clone(context),referenceSet}};};
const visible=q=>{if(!q)return null;const out=copyInput(q);delete out.referenceContext.referenceSet;return out;};

/** Formal 82b DATA bridge. The private mandatory entry owns native execution;
 * original owner DATA is retained beside management's phase composition.
 * No caller-supplied phase receipt or publication boolean authorizes a gate. */
export function createLoraDataPhaseBridge({adapter,referenceSet,edgeInput,readCurrent,readWeightBiasEvidence,inspection,consumerBinding,readConsumerBinding,readNativeRevisions,dataSourceVerification}={}){
 if(!isVerifiedLoraAdmissionDataSources(dataSourceVerification))throw fail('LORA_DATA_SOURCE_REQUIRED','Verify both delivered 82b DATA modules before formal admission');
 if(!inspection?.tensors||!consumerBinding||typeof readConsumerBinding!=='function'||typeof readNativeRevisions!=='function'||typeof readWeightBiasEvidence!=='function')throw fail('LORA_DATA_INPUT_REQUIRED','Actual header, outside consumer binding and public native-revision/comparison readers are mandatory');
 const selected=clone(consumerBinding),header=clone(inspection),declaration=copyInput(edgeInput),ctx=declaration.referenceContext,requirement=clone(ctx.numericRequirements?.[0]);
 const live=()=>{const q=readCurrent();if(!q?.activeBindings||!q.resourceState)throw fail('LORA_DATA_INPUT_REQUIRED','Explicit selected binding/resource observations are required');return clone({activeBindings:q.activeBindings,resourceState:q.resourceState});};
 let phase='declaration',actualPlan=null,data=null,rows=[],guards=[],checkpoint=null,postpublication=null,record=null,failed=null;
 const poison=error=>{failed??={code:error?.code??'LORA_DATA_ADMISSION_FAILED',message:String(error?.message??error)};for(const g of guards)g.failValidation(error);};
 const healthy=()=>{if(failed)throw fail('LORA_DATA_EXECUTION_FAILED','This selected DATA admission cohort has failed');};
 const assertNative=()=>{if(!actualPlan||!same(readNativeRevisions(),revisions(actualPlan)))throw fail('LORA_DATA_NATIVE_REVISION_CHANGED','Public SDK input/application revisions differ from the actual selected plan');};
 const assertConsumer=()=>{if(!same(readConsumerBinding(),selected))throw fail('LORA_DATA_CONSUMER_CHANGED','Outside consumer namespace/token or owned resource changed');};
 const current=()=>{const state=live();return Object.values(state.activeBindings).every(b=>b?.valid===true&&b.currentRevision===b.expectedRevision)&&state.resourceState.status==='available'&&(!record?.context||record.context.isCurrent()===true);};
 const runtime=q=>({activeBindings:clone(q.activeBindings),resourceState:clone(live().resourceState)});
 const inner=createNormRequiredLoraExecution({adapter,referenceSet,edgeInput,readCurrent,readOwnerEvidence:async args=>{
  healthy();assertNative();assertConsumer();const w=clone(await readWeightBiasEvidence(args));assertNative();assertConsumer();
  if(!record)throw fail('LORA_DATA_PHASE_ORDER','An actual snapshot owner must precede comparison');record.weightBias=w;
  return {...clone(w),result:w?.weightComparison?.passed===true&&w?.biasComparison?.passed===true?'pass':'fail',...clone(ctx.evidenceTarget)};
 }});
 function compose(row){
  const q=copyInput(row.input),r=q.referenceContext,description=data.describe();
  r.normIds=clone(NORM_EXECUTION_POLICIES['lora-q16'].requiredNormIds);
  r.profileBindings=[...clone(r.profileBindings),{recordId:'EXEC-BERNINI-Q16-F32',side:'consumer'}];
  r.nativeDeclarations.producer.numericDeclarations=clone(row.numericDeclarations);r.requireLoaderObservations=true;
  r.numericRequirements=[clone(description.numericRequirement)];r.environment=ctx.environment;
  r.evidenceTarget={artifactRef:q.artifact.artifactId,profileRef:q.artifact.profileRef,...clone(ctx.evidenceTarget)};
  // The owner descriptor is the prepared Q weight. Its port IDs and native
  // meaning remain original; the predeclared management edge fixes the same
  // source, registries, graph, full shape, selection, gate and reference scope.
  if(!same(r.mapping,ctx.mapping)||!same(q.artifact.tensor.shape,declaration.artifact.tensor.shape)||q.artifact.profileRef!==declaration.artifact.profileRef||r.nativeDeclarations.consumer.graphSHA256!==ctx.nativeDeclarations.consumer.graphSHA256||!same(description.numericRequirement.gateRef.tolerance,requirement.gateRef.tolerance)||description.numericRequirement.gateRef.sha256!==requirement.gateRef.sha256||description.numericRequirement.referenceRef.sha256!==requirement.referenceRef.sha256)throw fail('LORA_DATA_DECLARATION_MISMATCH','Owner DATA differs from the immutable selected source/graph/region/reference declaration');
  return q;
 }
 function checkpointData(actual,c){
  assertNative();assertConsumer();
  const q=data.checkpointInputs({nativeValidation:actual.nativeValidation,weightBiasEvidence:record.weightBias,snapshotTarget:c.target,ownerValidation:actual});
  const binding=q.referenceContext.ownerAdmission.phaseBinding;
  if(binding.bound!==true||binding.missing.length||!same(binding.snapshotTarget,c.target)||!same(binding.outerOwnerValidationTarget,c.target))throw fail('LORA_DATA_CHECKPOINT_UNBOUND','Actual checkpoint requires the exact outer validation and snapshot target');
  return q;
 }
 const api={contractVersion:LORA_DATA_PHASE_BRIDGE_VERSION,
  async plan(input,options){
   healthy();if(actualPlan)throw fail('LORA_DATA_PLAN_REUSED','Use one selected native plan per formal DATA bridge');try{
    const plan=await inner.plan(input,options);actualPlan=plan;assertNative();assertConsumer();
    const binding=await adapter.describeBinding();assertNative();assertConsumer();
    const candidateSet=clone(ctx.candidateSet);candidateSet.modules=candidateSet.modules.map(m=>({...m,sourceRef:catalogSourceAlias(m.sourceRef)}));
    data=createLoraManagementAdmissionInputs({referenceSet,candidateSet,sourcePins:binding.management.sourcePins,plan,inspection:header,ownerBinding:binding.owner,executionKernelDigest:requirement.kernelDigest,gateIdentity:requirement.gateRef,referenceIdentity:requirement.referenceRef,baseKind:ctx.evidenceTarget.baseKind,environment:ctx.environment,resourceState:live().resourceState,isCurrent:current,isPublishedCurrent:()=>record?.global?.isCurrent()===true,consumerBinding:selected,readConsumerBinding,factorySourceRef:LORA_ADMISSION_DATA_SOURCE,artifactId:declaration.artifact.artifactId,inputKind:ctx.nativeDeclarations.producer.inputKind});
    rows=data.preflightInputs();if(!rows.length)throw fail('LORA_DATA_INPUT_REQUIRED','Actual plan must expose selected patch DATA');
    guards=rows.map(row=>createNormExecution({policyId:'lora-q16',referenceSet,edgeInput:compose(row)}));
    phase='preflight';return plan;
   }catch(error){poison(error);throw error;}
  },
  createSnapshotOwner(options){
   healthy();if(!data||options?.plan!==actualPlan||record)throw fail('LORA_DATA_PHASE_ORDER','Use the one actual plan admitted through this bridge');assertNative();assertConsumer();
   const base=inner.createSnapshotOwner(options);record={base,context:null,candidate:null,validation:null,weightBias:null,receipt:null,global:null};
   return Object.freeze({...base,
    async prepare(c){healthy();try{assertNative();assertConsumer();if(!current())throw fail('LORA_DATA_STALE','Selected inputs are no longer current');record.context=c;const fresh=data.preflightInputs();for(const [i,guard]of guards.entries())guard.declaration(runtime(fresh[i].input));const prepared=await base.prepare(c);record.candidate=prepared.candidate;return prepared;}catch(error){poison(error);throw error;}},
    async validate(candidate,c){healthy();try{assertNative();assertConsumer();const actual=await base.validate(candidate,c);checkpoint=checkpointData(actual,c);for(const guard of guards)guard.validated({evidence:clone(checkpoint.evidence),delegations:clone(checkpoint.referenceContext.delegations),...runtime(checkpoint)});record.validation=actual;phase='checkpoint';return actual;}catch(error){poison(error);throw error;}},
    async commit(candidate,c){healthy();try{
     if(!record.validation||candidate!==record.candidate||!same(c.target,record.context.target))throw fail('LORA_DATA_PHASE_ORDER','Bound actual checkpoint must precede commit');
     const refreshed=checkpointData(record.validation,c);for(const guard of guards)guard.assertValidated(runtime(refreshed));
     record.receipt=await base.commit(candidate,c);assertNative();assertConsumer();return record.receipt;
    }catch(error){poison(error);throw error;}},
    async afterPublication(candidate,c,global){
     if(!isSnapshotPublicationContext(global)||candidate!==record.candidate||!record.validation||!record.receipt||record.global&&record.global!==global||global.isCurrent()!==true)throw fail('FOREIGN_PUBLICATION','Actual current coordinator publication capability is required');
     assertNative();assertConsumer();record.global??=global;await base.afterPublication(candidate,c,global);assertNative();assertConsumer();
     const {normExecution,...nativeOwnerState}=base.inspect(candidate);
     const q=data.postpublicationInputs({snapshotTarget:c.target,publication:global.publicationReceipt,queueReports:options.queue.inspect().invocations,ownerState:nativeOwnerState,ownerValidationRef:record.weightBias.evidenceId});
     for(const guard of guards)guard.published({evidence:clone(q.evidence.filter(e=>e.scope==='norm:N-TRANSACTION')),delegations:{'N-TRANSACTION':clone(q.referenceContext.delegations['N-TRANSACTION'])},managerState:clone(q.referenceContext.managerState),...runtime(q)});
     postpublication=q;phase='postpublication';return {verified:true,generationReady:false};
    }
   });
  },
  inspect(){return {contractVersion:LORA_DATA_PHASE_BRIDGE_VERSION,phase,preflight:rows.map(row=>({...clone({...row,input:undefined}),input:visible(row.input)})),checkpoint:visible(checkpoint),postpublication:visible(postpublication),decisions:guards.map(g=>g.inspect()),inner:inner.inspect(),failure:failed?clone(failed):null,generationReady:false};}
 };
 return Object.freeze(api);
}

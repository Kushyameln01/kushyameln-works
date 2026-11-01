import test from 'node:test';
import assert from 'node:assert/strict';

const loraRoot=process.env.WORKS_SNAPSHOT_LORA_ROOT;
const diffusionRoot=process.env.WORKS_SNAPSHOT_DIFFUSION_ROOT;
const admissionRoot=process.env.WORKS_LORA_ADMISSION_ROOT;
const options={loraRoot,diffusionRoot,admissionRoot,skip:!loraRoot||!diffusionRoot||!admissionRoot,timeout:60000};

test('82b formal DATA bridge restores the old joint feed after actual HIGH commit and controlled LOW failure',options,async()=>{
 const module=await import('./run-lora-data-joint.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
 assert.equal(typeof module.runLoraDataJointNativeCase,'function','The new joint runner must exercise the formal DATA bridge');
 const r=await module.runLoraDataJointNativeCase(options);
 assert.equal(r.state,'PASS');assert.equal(r.coverage,'PARTIAL');assert.equal(r.modelInference,false);
 assert.equal(r.realBaseVerified,false);assert.equal(r.generationReady,false);
 assert.equal(r.nativeSourceProof.length,23);assert.equal(r.nativeSourceProof.every(p=>p.gitObjectMatched&&p.sha256Matched),true);
 assert.equal(r.ownerDataSourceProof.length,2);assert.equal(r.ownerDataSourceProof.every(p=>p.gitObjectMatched&&p.sha256Matched&&p.deploymentBytesMatched),true);
 assert.deepEqual(r.oldFeed,{HIGH:3.625,LOW:3.625});
 assert.deepEqual(r.feedAtNewStage,r.oldFeed);
 assert.deepEqual(r.feedAfterHighCommit,{HIGH:2.375,LOW:3.625});
 assert.deepEqual(r.feedAfterFailure,r.oldFeed);
 assert.equal(r.oldPublication.state,'SNAPSHOT_PUBLISHED');assert.equal(r.oldPublication.cleanupRequired,false);
 assert.equal(r.managerAfterFailure.activeSnapshotId,r.oldPublication.snapshot.snapshotId);
 assert.equal(r.managerAfterFailure.selectionCurrent,false);assert.equal(r.managerAfterFailure.state,'FAILED');
 assert.equal(r.newSnapshotPublished,false);assert.equal(r.failedNativeSide,'LOW');
 assert.notEqual(r.sides.HIGH.sdkInstanceId,r.sides.LOW.sdkInstanceId);
 assert.notEqual(r.sides.HIGH.consumerBinding.namespace,r.sides.LOW.consumerBinding.namespace);
 assert.notEqual(r.sides.HIGH.resourceBinding.ownerId,r.sides.LOW.resourceBinding.ownerId);
 for(const side of ['HIGH','LOW']){
  const s=r.sides[side];assert.equal(s.newCheckpointBound,true);assert.equal(s.oldAdmission.phase,'postpublication');
  assert.equal(s.oldAdmission.accepted,true);assert.equal(s.newAdmission.accepted,false);
  assert.equal(s.selectedValuesCompared,2*(81920+16));
  assert.equal(s.newOwnerState.originalTerminal,true);assert.equal(s.newOwnerState.queueReleased,true);
  assert.equal(s.newOwnerState.preparedReleased,true);assert.equal(s.newOwnerState.rolledBack,true);
  assert.equal(s.oldPlan.localInputRevision,1);assert.equal(s.newPlan.localInputRevision,2);
  assert.equal(s.newOwnerState.target.managerRevision,73);assert.equal(s.newOwnerState.target.localRevisionBindings.localInputRevision,2);
  assert.equal(s.queue.invocations.length,2);
  assert.equal(s.queue.invocations.every(i=>i.originalTerminal&&i.resourceReleased&&i.reusable),true);
  assert.equal(s.queue.invocations.at(-1).resultAccepted,side==='HIGH');
 }
 const phases=r.events.map(e=>e.phase),commit=phases.indexOf('NEW_HIGH_NATIVE_COMMITTED'),failure=phases.indexOf('NEW_LOW_CONTROLLED_COMMIT_FAILURE'),rollback=phases.indexOf('NEW_HIGH_NATIVE_ROLLED_BACK');
 assert.ok(commit>=0&&failure>commit&&rollback>failure,'The failed joint update must roll back the HIGH which actually committed');
 assert.equal(r.events[rollback].receipt.restored,true);
 assert.equal(r.cleanup.state,'complete');assert.equal(r.cleanup.queuesActive,0);
});

test('82b joint publication remains a fact during postpublication audit failure and recovers without a second native commit',options,async()=>{
 const {runLoraDataJointNativeCase}=await import('./run-lora-data-joint.mjs');
 const r=await runLoraDataJointNativeCase({...options,scenario:'postpublication-audit-failure'});
 assert.equal(r.auditFaultObserved,true,'The runner must fail the real postpublication audit once');
 assert.equal(r.auditFailureError?.code,'LORA_DATA_CONSUMER_CHANGED','Retain the actual formal-bridge rejection caused by the changed outside token');
 assert.equal(r.publicationWhileBlocked.state,'SNAPSHOT_PUBLISHED');assert.equal(r.publicationWhileBlocked.cleanupRequired,true);
 assert.equal(r.managerWhileBlocked.state,'RECOVERY_REQUIRED');assert.equal(r.managerWhileBlocked.activeSnapshotId,r.publicationWhileBlocked.snapshot.snapshotId);
 assert.equal(r.managerWhileBlocked.selectionCurrent,false);assert.equal(r.newWorkBlocked,true);
 assert.deepEqual(r.feedWhileBlocked,{HIGH:3.625,LOW:3.625});assert.deepEqual(r.feedAfterRecovery,r.feedWhileBlocked);
 assert.equal(r.managerAfterRecovery.state,'SNAPSHOT_PUBLISHED');assert.equal(r.managerAfterRecovery.selectionCurrent,true);
 assert.equal(r.recoveredSameSnapshot,true);assert.equal(r.nativeCommitCountBeforeRecovery,2);assert.equal(r.nativeCommitCountAfterRecovery,2);
 assert.equal(r.events.some(e=>e.phase.includes('ROLLED_BACK')),false,'A completed finalized publication must not be represented as rolled back');
 for(const side of ['HIGH','LOW']){assert.equal(r.sides[side].admission.phase,'postpublication');assert.equal(r.sides[side].ownerState.preparedReleased,true);assert.equal(r.sides[side].queue.invocations.every(i=>i.originalTerminal&&i.resourceReleased&&i.reusable&&i.resultAccepted),true);}
 assert.equal(r.cleanup.state,'complete');assert.equal(r.currentLiveAdmission,false);assert.equal(r.generationReady,false);
});

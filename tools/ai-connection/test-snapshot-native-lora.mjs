import test from 'node:test';
import assert from 'node:assert/strict';
import {runSnapshotNativeLoraCase} from './run-snapshot-native-lora.mjs';

const loraRoot=process.env.WORKS_SNAPSHOT_LORA_ROOT;
const diffusionRoot=process.env.WORKS_SNAPSHOT_DIFFUSION_ROOT;
const options={loraRoot,diffusionRoot,skip:!loraRoot||!diffusionRoot,timeout:30000};

test('P3 actual SDK/Hike and ORT/Hike consumer pair waits at validation before publication',options,async()=>{
 const r=await runSnapshotNativeLoraCase({...options,scenario:'pair-publication'});
 assert.equal(r.state,'PASS');assert.equal(r.generationReady,false);assert.equal(r.realBaseVerified,false);
 assert.deepEqual(r.beforePublish,{HIGH:3,LOW:3});assert.deepEqual(r.afterPublish,{HIGH:3.625,LOW:3.625});
 assert.equal(r.snapshotState,'SNAPSHOT_PUBLISHED');assert.equal(r.selectionCurrent,true);
 assert.equal(r.dynamicNativeOwnershipPreserved,true);assert.equal(r.finalizedAfterPublication,true);
 assert.equal(r.pendingQueueSlotsAtCheckpoint,2);assert.equal(r.pendingQueueSlotsAfterPublish,0);
 assert.equal(r.sourceProof.every(x=>x.gitObjectMatched&&x.sha256Matched),true);
});

test('P3 LOW native commit failure rolls back already committed HIGH without publication',options,async()=>{
 const r=await runSnapshotNativeLoraCase({...options,scenario:'low-failure'});
 assert.equal(r.state,'PASS');assert.equal(r.snapshotState,'FAILED');assert.equal(r.activeSnapshotId,null);
 assert.deepEqual(r.afterFailure,{HIGH:3,LOW:3});assert.equal(r.highActuallyCommitted,true);
 assert.equal(r.failedNativeSide,'LOW');assert.equal(r.queueReusable,true);
});

test('P3 rollback from a retired native snapshot cannot undo a newer feed',options,async()=>{
 const r=await runSnapshotNativeLoraCase({...options,scenario:'stale-rollback'});
 assert.equal(r.state,'PASS');assert.deepEqual(r.newerFeed,{HIGH:2.375,LOW:2.375});
 assert.deepEqual(r.afterOldRollback,r.newerFeed);assert.equal(r.activeSnapshotId,'snapshot:p3:2');
 assert.equal(r.selectionCurrent,true);
});

test('P3 failed native cleanup retains recovery and blocks new snapshot work',options,async()=>{
 const r=await runSnapshotNativeLoraCase({...options,scenario:'cleanup-recovery'});
 assert.equal(r.state,'PASS');assert.equal(r.blockedState,'RECOVERY_REQUIRED');
 assert.equal(r.selectionCurrentWhileBlocked,false);assert.equal(r.newWorkBlocked,true);
 assert.deepEqual(r.beforeRecovery,{HIGH:3.625,LOW:3});assert.deepEqual(r.afterRecovery,{HIGH:3,LOW:3});
 assert.equal(r.rollbackRetried,true);assert.equal(r.recoveredState,'FAILED');
});

test('P3 targeted queue cancellation opens the gate cleanup barrier before a successor runs',options,async()=>{
 const r=await runSnapshotNativeLoraCase({...options,scenario:'cancel-at-checkpoint'});
 assert.equal(r.state,'PASS');assert.equal(r.wrongTargetRejected,true);assert.equal(r.oldCancelRejected,true);
 assert.equal(r.cancelReport.originalTerminal,true);assert.equal(r.cancelReport.resourceReleased,true);
 assert.equal(r.cancelReport.reusable,true);assert.equal(r.cancelReport.quarantined,false);
 assert.deepEqual(r.afterCancellation,{HIGH:3,LOW:3});assert.deepEqual(r.successorFeed,{HIGH:3.625,LOW:3.625});
});

test('P3 preparation cleanup failure remains manager recoverable before any native package exists',options,async()=>{
 const r=await runSnapshotNativeLoraCase({...options,scenario:'prepare-cleanup-recovery'});
 assert.equal(r.state,'PASS');assert.equal(r.blockedState,'RECOVERY_REQUIRED');assert.equal(r.newWorkBlocked,true);
 assert.equal(r.retainedSinkCleanupRetried,true);assert.equal(r.recoveredState,'FAILED');
 assert.equal(r.queueStillQuarantined,true);assert.equal(r.queueReuseBlocked,true);
 assert.deepEqual(r.afterRecovery,{HIGH:3,LOW:3});
});

test('P3 native restored:false after an actual HIGH commit cannot confirm manager restoration',options,async()=>{
 const r=await runSnapshotNativeLoraCase({...options,scenario:'rollback-unconfirmed'});
 assert.equal(r.state,'PASS');assert.equal(r.blockedState,'RECOVERY_REQUIRED');assert.equal(r.newWorkBlocked,true);
 assert.equal(r.selectionCurrentWhileBlocked,false);assert.equal(r.highCandidateRetained,true);assert.equal(r.nativeCandidateReleaseCount,0);
 assert.deepEqual(r.unrestoredFeed,{HIGH:3.625,LOW:3});
});

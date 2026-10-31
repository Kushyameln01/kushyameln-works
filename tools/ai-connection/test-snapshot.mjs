import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotManager} from '../../docs/shared/ai-connection/snapshot.mjs';
import {hashCanonical} from '../../docs/shared/ai-connection/canonical.mjs';
const sourceRef={repository:'fixture:snapshot',commit:'a'.repeat(40),path:'owner.mjs'};
function fixture(count=1){
 const log=[],native=new Map();
 const profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'test:diagnostic',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:['input'],steps:Array.from({length:count},(_,i)=>({stepId:`s${i}`,moduleId:`m${i}`,operationId:'diagnose',inputBindings:[{portId:'in',artifactRef:'input'}],outputBindings:[{portId:'out',artifactRef:`out${i}`}],adapterRefs:[],resourceGroupRefs:[]})),requiredEvidenceScopes:['diagnostic-projection']};
 const bindings={snapshotId:'snapshot:1',managerRevision:1,artifactManifestRef:'artifacts:1',evidenceManifestRef:'evidence:1',requestedScope:{kind:'diagnostic',scopeId:'diagnostic-projection'},steps:profile.steps.map(s=>({stepId:s.stepId,moduleId:s.moduleId,operationId:s.operationId,moduleVersion:'fixture/1',nativeBindingRefs:[`native:${s.stepId}`],artifactRefs:['input'],modelProfileRefs:['tiny'],adapterSelectionRefs:[],localRevisionBindings:{native:7},sourceRef,nativeBuild:'fixture-build',implementationState:'implemented',resourceBinding:{ownerId:`owner:${s.stepId}`,bindingId:`r:${s.stepId}`,resourceGeneration:'g1'},isCurrent:()=>true,owner:{ownerId:`owner:${s.stepId}`,
 async prepare(c){log.push(`prepare:${s.stepId}`);return {candidate:{step:s.stepId,old:native.get(s.stepId)},previousSessionReleased:false};},
 async validate(candidate,c){log.push(`validate:${s.stepId}`);return {valid:true,target:c.target,scope:c.scopeId,coverage:'PARTIAL',operationId:c.operationId,stepId:s.stepId,snapshotId:c.snapshotId,sourceRef,nativeBuild:'fixture-build',evidenceRefs:['fixture:validated']};},
 async commit(candidate,c){if(!c.isCurrent())throw Error('stale commit');log.push(`commit:${s.stepId}`);native.set(s.stepId,c.snapshotId);return {target:c.target,state:'STAGED',ownership:{kind:'independent-copy',ownerId:`owner:${s.stepId}`}};},
 async rollback(candidate,c){log.push(`rollback:${s.stepId}`);if(c.isCurrent())native.set(s.stepId,candidate.old);return {restored:true};},
 async release(candidate,c){log.push(`release:${s.stepId}`);return {released:true};},
 async reload(previous,c){log.push(`reload:${s.stepId}`);native.set(s.stepId,previous.snapshotId);return {restored:true};},
 }}))};return {profile,bindings,log,native};
}
const current=b=>Object.fromEntries(b.steps.map(s=>[s.stepId,{localRevisionBindings:s.localRevisionBindings,resourceBinding:s.resourceBinding}]));
test('diagnostic stage and manager publication remain distinct from native STAGED and generation',async()=>{
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager',registry:{schemas:[],roles:[]}});
 const staged=await m.stageSnapshot(f.profile,f.bindings);assert.equal(m.inspect().state,'STAGED');assert.equal(m.active,null);assert.equal(f.native.size,0);
 const r=await m.publishSnapshot(staged,{currentBindings:current(f.bindings)});assert.equal(r.state,'SNAPSHOT_PUBLISHED');assert.equal(r.generationReady,false);assert.equal(r.nativeStates[0].state,'STAGED');assert.equal(m.active.snapshotId,'snapshot:1');
 const {snapshotHash,...rest}=r.snapshot;assert.equal(snapshotHash,await hashCanonical(rest));assert.equal(m.active.stepBindings[0].localRevisionBindings.native,7);await m.dispose();
});
test('failure preparing second step never publishes first and cleans only its owners',async()=>{
 const f=fixture(2),m=createSnapshotManager({managerSessionId:'manager'});f.bindings.steps[1].owner.prepare=async()=>{throw Error('second failed');};
 await assert.rejects(m.stageSnapshot(f.profile,f.bindings),/second failed/);assert.equal(m.active,null);assert.ok(f.log.includes('rollback:s0'));assert.ok(f.log.includes('release:s0'));assert.ok(!f.log.includes('commit:s0'));
});
test('commit failure rolls back both sides before returning, leaving no new publication',async()=>{
 const f=fixture(2),m=createSnapshotManager({managerSessionId:'manager'});f.bindings.steps[1].owner.commit=async()=>{throw Error('commit failed');};
 const s=await m.stageSnapshot(f.profile,f.bindings);await assert.rejects(m.publishSnapshot(s,{currentBindings:current(f.bindings)}),/commit failed/);assert.equal(m.active,null);assert.equal(f.native.get('s0'),undefined);assert.ok(f.log.indexOf('rollback:s1')<f.log.indexOf('rollback:s0'));
});
test('stale local revision, resource generation or external selection cannot commit',async()=>{
 for(const change of [s=>s.localRevisionBindings.native++,s=>s.resourceBinding.resourceGeneration='g2']){const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'}),s=await m.stageSnapshot(f.profile,f.bindings),c=structuredClone(current(f.bindings));change(c.s0);await assert.rejects(m.publishSnapshot(s,{currentBindings:c}),/binding|revision/i);assert.ok(!f.log.includes('commit:s0'));}
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'}),s=await m.stageSnapshot(f.profile,f.bindings);f.bindings.steps[0].isCurrent=()=>false;await assert.rejects(m.publishSnapshot(s,{currentBindings:current(f.bindings)}),/current|stale/i);
});
test('old stage tokens cannot roll back or publish over a newer snapshot',async()=>{
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'}),a=await m.stageSnapshot(f.profile,f.bindings);await m.abortSnapshot(a);
 const next={...f.bindings,snapshotId:'snapshot:2',managerRevision:2};const b=await m.stageSnapshot(f.profile,next);await m.publishSnapshot(b,{currentBindings:current(next)});
 await assert.rejects(m.publishSnapshot(a,{currentBindings:current(next)}),/stale|closed/i);await assert.rejects(m.abortSnapshot(a),/stale|closed/i);assert.equal(m.active.snapshotId,'snapshot:2');
});
test('failed new selection restores released old session without silently running old settings',async()=>{
 const f=fixture(2),m=createSnapshotManager({managerSessionId:'manager'}),a=await m.stageSnapshot(f.profile,f.bindings);await m.publishSnapshot(a,{currentBindings:current(f.bindings)});
 f.bindings.steps[0].owner.prepare=async()=>({candidate:{old:'snapshot:1'},previousSessionReleased:true});f.bindings.steps[1].owner.prepare=async()=>{throw Error('replacement failed');};
 await assert.rejects(m.stageSnapshot(f.profile,{...f.bindings,snapshotId:'snapshot:2',managerRevision:2}),/replacement failed/);assert.ok(f.log.includes('reload:s0'));assert.equal(m.active.snapshotId,'snapshot:1');assert.equal(m.inspect().generationReady,false);assert.equal(m.inspect().selectionCurrent,false);
});
test('rollback failure holds recovery and rejects next transaction until owner repair',async()=>{
 const f=fixture(2),m=createSnapshotManager({managerSessionId:'manager'});let repaired=false;f.bindings.steps[1].owner.commit=async()=>{throw Error('failed');};f.bindings.steps[0].owner.rollback=async()=>{if(!repaired)throw Error('rollback failed');return {restored:true};};
 const s=await m.stageSnapshot(f.profile,f.bindings);await assert.rejects(m.publishSnapshot(s,{currentBindings:current(f.bindings)}));assert.equal(m.inspect().state,'RECOVERY_REQUIRED');
 await assert.rejects(m.stageSnapshot(f.profile,{...f.bindings,snapshotId:'snapshot:2',managerRevision:2}),/recovery/i);repaired=true;await m.recover();assert.equal(m.inspect().state,'FAILED');
});
test('incomplete evidence, unimplemented operation and generation request never stage',async()=>{
 for(const change of [b=>b.steps[0].implementationState='not-implemented',b=>b.requestedScope.kind='generation',b=>b.steps[0].owner.validate=async()=>true]){const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'});change(f.bindings);await assert.rejects(m.stageSnapshot(f.profile,f.bindings));assert.equal(m.active,null);assert.equal(m.inspect().generationReady,false);}
});
test('no-LoRA base pipeline publishes diagnostically without LoRA fields',async()=>{
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'}),s=await m.stageSnapshot(f.profile,f.bindings);const r=await m.publishSnapshot(s,{currentBindings:current(f.bindings)});assert.deepEqual(r.snapshot.stepBindings[0].adapterSelectionRefs,[]);assert.equal(r.generationReady,false);
});
test('serialized cleanup prevents old rollback while a new transaction begins',async()=>{
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'});let resume,start;const entered=new Promise(r=>start=r),wait=new Promise(r=>resume=r);f.bindings.steps[0].owner.rollback=async()=>{start();await wait;return {restored:true};};
 const s=await m.stageSnapshot(f.profile,f.bindings),abort=m.abortSnapshot(s);await entered;await assert.rejects(m.stageSnapshot(f.profile,{...f.bindings,snapshotId:'snapshot:2',managerRevision:2}),/busy/i);resume();await abort;
});
test('publication retires old owned candidates without rolling back the new snapshot',async()=>{
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'});await m.publishSnapshot(await m.stageSnapshot(f.profile,f.bindings),{currentBindings:current(f.bindings)});
 await m.publishSnapshot(await m.stageSnapshot(f.profile,{...f.bindings,snapshotId:'snapshot:2',managerRevision:2}),{currentBindings:current(f.bindings)});
 assert.equal(f.log.filter(x=>x==='release:s0').length,1);assert.ok(!f.log.includes('rollback:s0'));assert.equal(f.native.get('s0'),'snapshot:2');await m.dispose();assert.equal(f.log.filter(x=>x==='release:s0').length,2);
});
test('failed retirement retains recovery after publication and never rolls back published state',async()=>{
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'});let repaired=false;const release=f.bindings.steps[0].owner.release;
 f.bindings.steps[0].owner.release=async(c,x)=>{if(x.snapshotId==='snapshot:1'&&!repaired)throw Error('release pending');return release(c,x);};
 await m.publishSnapshot(await m.stageSnapshot(f.profile,f.bindings),{currentBindings:current(f.bindings)});
 const r=await m.publishSnapshot(await m.stageSnapshot(f.profile,{...f.bindings,snapshotId:'snapshot:2',managerRevision:2}),{currentBindings:current(f.bindings)});
 assert.equal(r.state,'SNAPSHOT_PUBLISHED');assert.equal(r.cleanupRequired,true);assert.equal(m.inspect().state,'RECOVERY_REQUIRED');assert.equal(m.active.snapshotId,'snapshot:2');assert.ok(!f.log.includes('rollback:s0'));
 await assert.rejects(m.stageSnapshot(f.profile,{...f.bindings,snapshotId:'snapshot:3',managerRevision:3}),/recovery/i);repaired=true;await m.recover();assert.equal(m.inspect().state,'SNAPSHOT_PUBLISHED');await m.dispose();
});
test('expired active lease or changed owner selection is never current',async()=>{
 for(const useLease of [false,true]){const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'});let live=true;f.bindings.steps[0].isCurrent=()=>useLease||live;
 if(useLease)f.bindings.steps[0].owner.commit=async(candidate,c)=>({target:c.target,state:'CONSUMER_APPLIED',ownership:{kind:'lease',ownerId:'owner:s0',isValid:()=>live}});
 await m.publishSnapshot(await m.stageSnapshot(f.profile,f.bindings),{currentBindings:current(f.bindings)});assert.equal(m.inspect().selectionCurrent,true);live=false;assert.equal(m.inspect().selectionCurrent,false);await m.dispose();}
});
test('ownership must match resource owner or explicitly allowed consumer, and leases are rechecked',async()=>{
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'});f.bindings.steps[0].owner.commit=async(candidate,c)=>({target:c.target,state:'STAGED',ownership:{kind:'independent-copy',ownerId:'other'}});
 await assert.rejects(m.publishSnapshot(await m.stageSnapshot(f.profile,f.bindings),{currentBindings:current(f.bindings)}),/ownership|owner/i);
 const g=fixture(2),n=createSnapshotManager({managerSessionId:'manager'});let live=true;g.bindings.steps[0].allowedConsumerOwners=['consumer'];g.bindings.steps[0].owner.commit=async(candidate,c)=>({target:c.target,state:'CONSUMER_APPLIED',ownership:{kind:'lease',ownerId:'consumer',isValid:()=>live}});g.bindings.steps[1].owner.commit=async(candidate,c)=>{live=false;return {target:c.target,state:'STAGED',ownership:{kind:'independent-copy',ownerId:'owner:s1'}};};
 await assert.rejects(n.publishSnapshot(await n.stageSnapshot(g.profile,g.bindings),{currentBindings:current(g.bindings)}),/lease|binding/i);assert.equal(n.active,null);
});
test('failed disposal can be recovered without releasing already released owners twice',async()=>{
 const f=fixture(2),m=createSnapshotManager({managerSessionId:'manager'});let live=false;f.bindings.steps[1].owner.release=async()=>{if(!live)throw Error('pending');f.log.push('release:s1');return {released:true};};
 await m.publishSnapshot(await m.stageSnapshot(f.profile,f.bindings),{currentBindings:current(f.bindings)});await assert.rejects(m.dispose());assert.equal(m.inspect().selectionCurrent,false);live=true;await m.recover();assert.equal(m.inspect().state,'DISPOSED');assert.equal(f.log.filter(x=>x==='release:s0').length,1);
});
test('empty evidence entries are rejected rather than promoted to scoped validation',async()=>{
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'}),validate=f.bindings.steps[0].owner.validate;f.bindings.steps[0].owner.validate=async(...args)=>({...await validate(...args),evidenceRefs:['']});await assert.rejects(m.stageSnapshot(f.profile,f.bindings),/evidence/i);
});
test('a profile operation cannot be substituted by another operation in the same module',async()=>{
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'});f.profile.steps[0].operationId='another-operation';await assert.rejects(m.stageSnapshot(f.profile,f.bindings),/operation/i);assert.ok(!f.log.length);
});
test('rejected new operation selection invalidates old publication currentness before native preparation',async()=>{
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'});await m.publishSnapshot(await m.stageSnapshot(f.profile,f.bindings),{currentBindings:current(f.bindings)});
 const next={...f.bindings,snapshotId:'snapshot:2',managerRevision:2,steps:f.bindings.steps.map(s=>({...s,implementationState:'not-implemented'}))};await assert.rejects(m.stageSnapshot(f.profile,next));assert.equal(m.active.snapshotId,'snapshot:1');assert.equal(m.inspect().managerRevision,2);assert.equal(m.inspect().selectionCurrent,false);assert.equal(m.inspect().state,'FAILED');
});
test('disposal blocks currentness before the owner starts releasing live resources',async()=>{
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'});f.bindings.steps[0].owner.release=async()=>{assert.equal(m.inspect().selectionCurrent,false);return {released:true};};
 await m.publishSnapshot(await m.stageSnapshot(f.profile,f.bindings),{currentBindings:current(f.bindings)});await m.dispose();assert.equal(m.inspect().state,'DISPOSED');
});
test('old validation or commit receipts cannot attest a different revision or resource generation',async()=>{
 for(const method of ['validate','commit']){const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'}),original=f.bindings.steps[0].owner[method];f.bindings.steps[0].owner[method]=async(...args)=>{const r=await original(...args);return {...r,target:{...r.target,managerRevision:0,resourceBinding:{...r.target.resourceBinding,resourceGeneration:'stale'}}};};
 if(method==='validate')await assert.rejects(m.stageSnapshot(f.profile,f.bindings),/target/i);else await assert.rejects(m.publishSnapshot(await m.stageSnapshot(f.profile,f.bindings),{currentBindings:current(f.bindings)}),/target/i);assert.equal(m.active,null);}
});
test('snapshot IDs cannot be reused in a newer manager selection',async()=>{
 const f=fixture(),m=createSnapshotManager({managerSessionId:'manager'});await m.publishSnapshot(await m.stageSnapshot(f.profile,f.bindings),{currentBindings:current(f.bindings)});await assert.rejects(m.stageSnapshot(f.profile,{...f.bindings,managerRevision:2}),/reused/i);assert.equal(m.inspect().selectionCurrent,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotManager} from '../../docs/shared/ai-connection/snapshot.mjs';
import {edgeFixture} from './fixtures.mjs';

function fixture(){
 const edge=structuredClone(edgeFixture());edge.requiredScopes=[];edge.evidence=[];
 const counts={prepared:0,validated:0,committed:0,rolledBack:0,released:0},resourceBinding={ownerId:'consumer',bindingId:'normal-resource',resourceGeneration:'normal-generation-1'};
 let current=true;
 const profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'fixture:normal-execution',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:['a'],steps:[{stepId:'normal-step',moduleId:'fixture-owner',operationId:'consume',inputBindings:[{portId:'input',artifactRef:'a'}],outputBindings:[{portId:'output',artifactRef:'normal-result'}],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:[]};
 const step={stepId:'normal-step',moduleId:'fixture-owner',operationId:'consume',moduleVersion:'fixture/1',nativeBindingRefs:['consumer'],artifactRefs:['a'],modelProfileRefs:['fixture:tiny/1'],adapterSelectionRefs:[],localRevisionBindings:{native:1},sourceRef:structuredClone(edge.consumerPort.sourceRef),nativeBuild:edge.consumerPort.nativeAPI.build,implementationState:'implemented',resourceBinding,capabilityRef:'fixture:owner-capability-response-1',isCurrent:()=>current,edges:[edge]};
 step.owner={ownerId:'consumer',
  async prepare(){counts.prepared++;return {candidate:{output:new Float32Array([1,2,3,4])}};},
  async validate(candidate,context){counts.validated++;return {valid:true,target:context.target,operationId:context.operationId,snapshotId:context.snapshotId,stepId:context.stepId,scope:context.scopeId,sourceRef:step.sourceRef,nativeBuild:step.nativeBuild,capabilityRef:'fixture:owner-capability-response-1'};},
  async commit(candidate,context){counts.committed++;return {target:context.target,state:'EXECUTION_COMPLETED',ownership:{kind:'independent-copy',ownerId:'consumer'},output:new Float32Array(candidate.output)};},
  async rollback(){counts.rolledBack++;return {restored:true};},
  async release(){counts.released++;return {released:true};}
 };
 const bindings={snapshotId:'fixture:normal-snapshot-1',managerRevision:1,artifactManifestRef:'fixture:normal-artifacts',evidenceManifestRef:'fixture:no-numerical-verification-requested',requestedScope:{kind:'normal',scopeId:'fixture:normal-operation'},steps:[step]};
 return {edge,profile,bindings,step,counts,setCurrent(value){current=value;},currentBindings:{'normal-step':{localRevisionBindings:step.localRevisionBindings,resourceBinding}},manager:createSnapshotManager({managerSessionId:'fixture:normal-session',registry:edge.registry})};
}

// Catches routing normal execution through diagnostic evidence/PASS requirements.
test('normal snapshot publishes an actual operation acknowledgement without numerical evidence',async()=>{
 const f=fixture(),token=await f.manager.stageSnapshot(f.profile,f.bindings);
 assert.deepEqual(f.counts,{prepared:1,validated:1,committed:0,rolledBack:0,released:0});
 const result=await f.manager.publishSnapshot(token,{currentBindings:f.currentBindings});
 assert.equal(result.state,'SNAPSHOT_PUBLISHED');assert.equal(result.generationReady,false);
 assert.deepEqual(result.snapshot.executionScope,{kind:'normal',scopeId:'fixture:normal-operation'});
 assert.equal(result.snapshot.stepBindings[0].capabilityRef,'fixture:owner-capability-response-1');
 assert.equal(result.nativeStates[0].state,'EXECUTION_COMPLETED');
 assert.equal(f.manager.inspect().selectionCurrent,true);
 await f.manager.dispose();assert.equal(f.counts.released,1);
});

// Catches accepting an arbitrary structural true instead of the selected owner response identity.
test('normal structural validation binds the exact capability response and cleans up foreign acknowledgements',async()=>{
 for(const capabilityRef of [undefined,'fixture:other-owner-response']){
  const f=fixture(),validate=f.step.owner.validate;f.step.owner.validate=async(...args)=>({...await validate(...args),capabilityRef});
  await assert.rejects(f.manager.stageSnapshot(f.profile,f.bindings),{code:'OWNER_VALIDATION_INVALID'});
  assert.equal(f.counts.committed,0);assert.equal(f.counts.rolledBack,1);assert.equal(f.counts.released,1);assert.equal(f.manager.active,null);await f.manager.dispose();
 }
});

// Catches hidden diagnostic requirements, omitted edges, or unrelated ready edges authorizing dispatch.
test('normal steps require their own generic edge and cannot import diagnostic policies',async()=>{
 const mutations=[
  [f=>delete f.step.edges,'NORMAL_EDGE_REQUIRED'],
  [f=>f.step.edges=[],'NORMAL_EDGE_REQUIRED'],
  [f=>f.profile.requiredEvidenceScopes=['diagnostic'],'SCOPE_NOT_SUPPORTED'],
  [f=>f.edge.requiredScopes=['numeric-pass'],'NORMAL_EDGE_DECLARATION_INVALID'],
  [f=>f.edge.referenceContext={},'NORMAL_EDGE_DECLARATION_INVALID'],
  [f=>f.edge.requiredNormPolicy={policyId:'diagnostic'},'NORMAL_EDGE_DECLARATION_INVALID'],
  [f=>delete f.step.capabilityRef,'NORMAL_CAPABILITY_REQUIRED'],
  [f=>f.edge.implementationState.consumer.operationId='other-operation','NORMAL_EDGE_BINDING_MISMATCH'],
  [f=>f.edge.consumerPort.owner='other-owner','NORMAL_EDGE_BINDING_MISMATCH'],
  [f=>f.edge.consumerPort.sourceRef.commit='b'.repeat(40),'NORMAL_EDGE_BINDING_MISMATCH'],
  [f=>f.edge.consumerPort.nativeAPI.build='other-build','NORMAL_EDGE_BINDING_MISMATCH'],
  [f=>f.edge.artifact.tensor.shape=[4,1],'EDGE_NOT_READY']
 ];
 for(const [mutate,code]of mutations){const f=fixture();mutate(f);await assert.rejects(f.manager.stageSnapshot(f.profile,f.bindings),{code});assert.equal(f.counts.prepared,0);assert.equal(f.manager.active,null);await f.manager.dispose();}
});

// Catches relabeling a normal result as a staged/applied model-session transaction.
test('normal publication accepts only completed-operation ownership receipts',async()=>{
 for(const state of ['STAGED','CONSUMER_APPLIED']){
  const f=fixture(),commit=f.step.owner.commit;f.step.owner.commit=async(...args)=>({...await commit(...args),state});
  const token=await f.manager.stageSnapshot(f.profile,f.bindings);
  await assert.rejects(f.manager.publishSnapshot(token,{currentBindings:f.currentBindings}),{code:'OWNERSHIP_UNVERIFIED'});
  assert.equal(f.manager.active,null);assert.equal(f.counts.rolledBack,1);assert.equal(f.counts.released,1);await f.manager.dispose();
 }
});

// Catches adopting a late normal capability acknowledgement after the selected request changed.
test('normal staging rechecks currentness after asynchronous owner preparation and validation',async()=>{
 for(const phase of ['prepare','validate']){
  const f=fixture(),original=f.step.owner[phase];f.step.owner[phase]=async(...args)=>{const result=await original(...args);f.setCurrent(false);return result;};
  await assert.rejects(f.manager.stageSnapshot(f.profile,f.bindings),{code:'STALE_BINDING'});
  assert.equal(f.counts.committed,0);assert.equal(f.counts.rolledBack,1);assert.equal(f.counts.released,1);assert.equal(f.manager.active,null);await f.manager.dispose();
 }
});

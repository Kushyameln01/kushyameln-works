// Metadata-only public DATA contract fixtures. No manager judgment, native
// execution, original/model bytes, weights or model hashing occur here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoraManagementAdmissionInputs, LORA_MANAGEMENT_ADMISSION_INPUTS_VERSION,
  LORA_MANAGEMENT_ADMISSION_SOURCE_SET} from '../../docs/shared/inference/lora/management-admission-inputs.mjs';

const clone=structuredClone, repository='https://github.com/Kushyameln01/kushyameln-works';
function fixture(mutate=()=>{}) {
  const sourcePins=Object.fromEntries(Object.entries(LORA_MANAGEMENT_ADMISSION_SOURCE_SET).map(([key,pin])=>[key,{repository,...pin}]));
  const key='diffusion_model.blocks.0.self_attn.q', loaderPolicyId='comfy-lora-b5a4321-linear-diff-v1';
  const native={schemaVersion:'bernini-diagnostic-registry/0.1',executionProfileId:'bernini-q16x5120-f32-wasm-v1',
    registryHash:'1'.repeat(64),modelHash:'2'.repeat(64),graphHash:'3'.repeat(64),side:'HIGH',targets:[
      {key:key+'.weight',weightId:'q.weight',originalKey:'blocks.0.self_attn.q.weight',fullShape:[5120,5120],shape:[16,5120],
        dtype:'F32',computeDtype:'F32',storageDtype:'F8_E4M3',layout:'row-major',binding:{kind:'runtime-input',name:'weight'}},
      {key:key+'.bias',weightId:'q.bias',fullShape:[5120],shape:[16],dtype:'F32',computeDtype:'F32',storageDtype:'F16',layout:'row-major',binding:{kind:'hike-parameter',name:'bias'}}]};
  const registry={contractVersion:'lora-connection/2.0-draft.1',modelHash:native.modelHash,graphHash:native.graphHash,
    registryVersion:'lora-diffusion-diagnostic-adapter/0.1',side:'HIGH',executionProfileId:native.executionProfileId,loaderPolicyId,
    targets:native.targets.map(t=>({key:t.key,weightId:t.weightId,shape:clone(t.fullShape),dtype:'F32',layout:'row-major',binding:clone(t.binding)}))};
  const down=key+'.lora_down.weight',up=key+'.lora_up.weight',delta=key+'.diff_b';
  const plan={contractVersion:registry.contractVersion,coverage:'PARTIAL',scope:'diagnostic-projection',completeAdapter:false,generationReady:false,
    planId:'4'.repeat(64),sourceSha256:'5'.repeat(64),registryHash:'6'.repeat(64),buildId:sourcePins.kernel.sha256,
    sdkInstanceId:'fixture-sdk',localInputRevision:7,localApplicationRevision:7,selection:{pairId:'light',noise:'high'},strength:-1,loaderPolicyId,registry,
    operations:[{key:key+'.weight',target:registry.targets[0],variant:'linear-down-up',names:[down,up],rank:1,alpha:null,alphaName:null,scale:-1,fullShape:[5120,5120],slice:{startRow:0,rowCount:16}},
      {key:key+'.bias',target:registry.targets[1],variant:'additive-diff-b',names:[delta],scale:-1,fullShape:[5120],slice:{startRow:0,rowCount:16}}]};
  const ownerBinding={adapterVersion:'lora-diffusion-diagnostic-adapter/0.1',nativeRegistryHash:native.registryHash,
    connectionRegistryHash:plan.registryHash,nativeRegistry:native,connectionRegistry:registry};
  const resourceBinding={ownerId:'fixture-resource-owner',bindingId:'fixture-resource',resourceGeneration:'fixture-generation'};
  const consumerBinding={namespace:'manager-selected-native-resource',revision:'fixture-manager-selection:1008',managerSessionId:'fixture-manager',resourceBinding};
  let current=true,publishedCurrent=true,observedConsumer=clone(consumerBinding);
  const referenceSet=Object.freeze({catalogSha256:'7'.repeat(64),profileRecords:Object.freeze({get(){}})});
  const brand=new WeakSet([referenceSet]);
  const alias=pin=>({repository:'Kushyameln01/kushyameln-works',commit:pin.commit,path:pin.path});
  const candidateSet={schemaVersion:'works-candidate-set/0.1-draft.1',status:'candidate',candidateSetId:'fixture-fc5f',
    modules:[{module:'lora',sourceRef:alias(sourcePins.sdk),kernel:{sha256:sourcePins.kernel.sha256,byteLength:5051}},
      {module:'diffusion',sourceRef:alias(sourcePins.diffusion)}]};
  const options={referenceSet,candidateSet,sourcePins,plan,ownerBinding,
    inspection:{tensors:{[down]:{dtype:'BF16',shape:[1,5120]},[up]:{dtype:'BF16',shape:[5120,1]},[delta]:{dtype:'F16',shape:[5120]}}},
    executionKernelDigest:'8'.repeat(64),gateIdentity:{sourceRef:sourcePins.diffusion,sha256:'9'.repeat(64),gateId:'fixture-gate',tolerance:{absolute:1e-6,relative:1e-5}},
    referenceIdentity:{sourceRef:sourcePins.adapter,sha256:'a'.repeat(64),referenceId:'fixture-reference',expectedOutputSha256:'b'.repeat(64)},
    baseKind:'metadata-fixture-only',environment:'node-metadata-fixture',inputKind:'injected-local-source',
    resourceState:{status:'available',ownerId:resourceBinding.ownerId,requiredBytes:0,budgetBytes:0,occupiedBytes:0},
    isCurrent:()=>current,isPublishedCurrent:()=>publishedCurrent,consumerBinding,readConsumerBinding:()=>observedConsumer};
  mutate(options); const factory=createLoraManagementAdmissionInputs(options);
  const v={contractVersion:plan.contractVersion,valid:true,planId:plan.planId,registryHash:plan.registryHash,sourceSha256:plan.sourceSha256,coverage:'PARTIAL',scope:plan.scope,
    evidence:{nativeReceipt:{schemaVersion:'bernini-diagnostic-validation/0.1',valid:true,candidateId:'fixture-native',scope:'PARTIAL',modelInference:false,
      registryHash:native.registryHash,graphHash:native.graphHash,modelHash:native.modelHash,expectedSHA256:options.referenceIdentity.expectedOutputSha256,
      tolerance:clone(options.gateIdentity.tolerance),failedIndices:[],maxAbsoluteError:0,evidence:{hikeWasmSHA256:options.executionKernelDigest,graphSHA256:native.graphHash}}}};
  const w={evidenceId:'fixture:whole-selected-check',referenceId:options.referenceIdentity.referenceId,referenceSha256:options.referenceIdentity.sha256,
    planId:plan.planId,sourceSha256:plan.sourceSha256,strength:plan.strength,nativeRegistryHash:native.registryHash,connectionRegistryHash:plan.registryHash,
    weightComparison:{passed:true,compared:81920},biasComparison:{passed:true,compared:16},weightArtifact:{sha256:'c'.repeat(64)},biasArtifact:{sha256:'d'.repeat(64)}};
  const localRevisionBindings={sdkInstanceId:plan.sdkInstanceId,localInputRevision:7,localApplicationRevision:7};
  const target={snapshotId:'fixture-snapshot',snapshotHash:'e'.repeat(64),managerSessionId:consumerBinding.managerSessionId,managerRevision:1008,
    stepId:'HIGH',operationId:'diagnose',resourceBinding,localRevisionBindings};
  const nativePhaseTarget={managerSessionId:target.managerSessionId,managerRevision:target.managerRevision,resourceBinding,requestId:'fixture-native-phase'};
  const ownership={kind:'independent-copy',ownerId:'fixture-native-copy'};
  const receipt={contractVersion:plan.contractVersion,sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision,
    planId:plan.planId,sourceSha256:plan.sourceSha256,registryHash:plan.registryHash,state:'CONSUMER_APPLIED',coverage:'PARTIAL',scope:plan.scope,
    generationReady:false,snapshotPublished:false,ownership,validation:v};
  const publication={state:'SNAPSHOT_PUBLISHED',generationReady:false,cleanupRequired:false,
    snapshot:{...target,stepBindings:[{stepId:'HIGH',operationId:'diagnose',resourceBinding,localRevisionBindings}]},
    nativeStates:[{stepId:'HIGH',state:receipt.state,ownership}]};
  const queueTarget={invocationId:'fixture-invocation',bindingId:resourceBinding.bindingId,ownerId:resourceBinding.ownerId,resourceGeneration:resourceBinding.resourceGeneration,
    revision:target.managerRevision,requestId:'fixture-queue',activeToken:'fixture-queue-token'};
  const ownerState={target,published:true,originalTerminal:true,queueReleased:true,preparedReleased:true,nativePhaseTarget,queueTarget,
    stageEnvelope:{receipt,management:{target:nativePhaseTarget,localRevisionBindings,sourcePins:clone(sourcePins),kernelSha256:sourcePins.kernel.sha256,
      adoptionVersion:'works-candidate-adopted-lora/0.1-draft.1',ownerAdapterVersion:ownerBinding.adapterVersion}}};
  const outerOwnerValidation={valid:true,target,snapshotId:target.snapshotId,stepId:target.stepId,operationId:target.operationId,
    scope:plan.scope,coverage:'PARTIAL',sourceRef:clone(sourcePins.sdk),nativeBuild:plan.buildId,nativeValidation:v,
    management:{target:nativePhaseTarget,localRevisionBindings,sourcePins:clone(sourcePins)}};
  const queueReport={id:queueTarget.invocationId,resourceBinding:queueTarget.bindingId,ownerId:queueTarget.ownerId,resourceGeneration:queueTarget.resourceGeneration,
    revision:queueTarget.revision,requestId:queueTarget.requestId,activeToken:queueTarget.activeToken,originalTerminal:true,resourceReleased:true,reusable:true,resultAccepted:true};
  return {factory,options,brand,v,w,target,publication,ownerState,queueReport,outerOwnerValidation,
    setCurrent:value=>{current=value;},setPublishedCurrent:value=>{publishedCurrent=value;},
    setConsumerToken:value=>{observedConsumer={...consumerBinding,revision:value};}};
}
const postArgs=f=>({snapshotTarget:f.target,publication:f.publication,ownerState:f.ownerState,queueReports:[f.queueReport],ownerValidationRef:f.w.evidenceId});
function noDecision(value) {
  if(!value||typeof value!=='object')return;
  for(const [key,item]of Object.entries(value)){assert.ok(!['decision','decisions','compatibility','readiness'].includes(key),`Unexpected judge output ${key}`);noDecision(item);}
}
test('public factory returns frozen raw DATA and retains the supplied ReferenceSet brand',()=>{
  const f=fixture();assert.equal(f.factory.contractVersion,LORA_MANAGEMENT_ADMISSION_INPUTS_VERSION);
  assert.deepEqual(Object.keys(f.factory).sort(),['checkpointInputs','contractVersion','describe','postpublicationInputs','preflightInputs']);
  const patches=f.factory.preflightInputs();assert.equal(patches.length,2);assert.ok(Object.isFrozen(patches));
  assert.equal(patches[0].sourceDtype,'BF16');assert.equal(patches[1].sourceDtype,'F16');
  for(const patch of patches){assert.ok(f.brand.has(patch.input.referenceContext.referenceSet));assert.ok(Object.isFrozen(patch.input));
    assert.deepEqual(patch.input.evidence,[]);assert.ok(!patch.input.referenceContext.numericRequirements);assert.ok(!patch.input.referenceContext.delegations);
    assert.equal(patch.declaration.baseDtype,'F32');assert.equal(patch.declaration.outputDtype,'F32');assert.equal(patch.declaration.layout,'row-major');
    assert.ok(patch.numericDeclarations.presence.baseDtype);assert.ok(patch.numericDeclarations.origins.baseDtype.path);noDecision(patch);}
  assert.equal(f.factory.describe().originIdentity.factorySourceRef,null);noDecision(f.factory.describe());
  assert.throws(()=>{patches[0].declaration.baseDtype='F16';},TypeError);
});
test('owner observations preserve dtype/layout conflicts and missing fields for the manager judge',()=>{
  const conflict=fixture(o=>{o.ownerBinding.nativeRegistry.targets[0].computeDtype='F16';o.ownerBinding.connectionRegistry.targets[0].dtype='BF16';o.ownerBinding.connectionRegistry.targets[0].layout='column-major';});
  const a=conflict.factory.preflightInputs()[0];assert.equal(a.declaration.baseDtype,'F16');assert.equal(a.declaration.outputDtype,'BF16');assert.equal(a.declaration.layout,'column-major');
  const missing=fixture(o=>{delete o.ownerBinding.nativeRegistry.targets[0].computeDtype;delete o.ownerBinding.connectionRegistry.targets[0].dtype;delete o.ownerBinding.connectionRegistry.targets[0].layout;});
  const b=missing.factory.preflightInputs()[0];assert.equal(b.declaration.baseDtype,null);assert.equal(b.declaration.outputDtype,null);assert.equal(b.declaration.layout,null);
  assert.equal(b.numericDeclarations.presence.baseDtype,false);assert.equal(b.numericDeclarations.presence.outputDtype,false);assert.equal(b.numericDeclarations.presence.layout,false);
});
test('source/candidate handshake rejects mismatched pins without guessing a replacement',()=>{
  assert.throws(()=>fixture(o=>{o.sourcePins.kernel.byteLength=4919;}),/native source set/);
  assert.throws(()=>fixture(o=>{o.candidateSet.modules[0].sourceRef.commit='0'.repeat(40);}),/Candidate module/);
  assert.throws(()=>fixture(o=>{o.candidateSet.modules[0].kernel.byteLength=4919;}),/Candidate kernel/);
  assert.throws(()=>fixture(o=>{o.nativeRegistry={...clone(o.ownerBinding.nativeRegistry),extraDescriptor:'same-hash-foreign-data'};}),/dual-registry/);
  assert.throws(()=>fixture(o=>{o.factorySourceRef={repository,commit:'0'.repeat(40),path:'docs/shared/inference/lora/sdk-v2.mjs'};}),/Factory source identity/);
  assert.throws(()=>fixture(o=>{o.factorySourceRef={repository,commit:o.sourcePins.sdk.commit,path:'docs/shared/inference/lora/management-admission-inputs.mjs'};}),/Factory source identity/);
});
test('actual-shaped checkpoint creates numeric/evidence DATA only after both owner receipts',()=>{
  const f=fixture();assert.throws(()=>f.factory.checkpointInputs({nativeValidation:f.v}));
  const input=f.factory.checkpointInputs({nativeValidation:f.v,weightBiasEvidence:f.w});assert.ok(f.brand.has(input.referenceContext.referenceSet));
  assert.equal(input.referenceContext.ownerAdmission.phase,'checkpoint');assert.ok(input.referenceContext.normIds.includes('N-NUMERIC'));
  assert.deepEqual(input.referenceContext.ownerAdmission.phaseBinding,{snapshotTarget:null,outerOwnerValidationTarget:null,bound:false,missing:['snapshotTarget','outerOwnerValidation']});
  assert.ok(!input.referenceContext.normIds.includes('N-TRANSACTION'));assert.ok(!input.referenceContext.delegations['N-TRANSACTION']);
  assert.equal(input.evidence.length,2);noDecision(input);
  assert.throws(()=>f.factory.checkpointInputs({nativeValidation:f.v,weightBiasEvidence:{...f.w,strength:1}}));
});
test('postpublication binds actual terminal publication and owner without claiming admission',()=>{
  const f=fixture();f.factory.checkpointInputs({nativeValidation:f.v,weightBiasEvidence:f.w});const args=postArgs(f);
  const input=f.factory.postpublicationInputs(args);assert.equal(input.referenceContext.ownerAdmission.phase,'postpublication');
  assert.deepEqual(input.referenceContext.managerState.target,f.target);assert.ok(input.referenceContext.normIds.includes('N-TRANSACTION'));noDecision(input);
  assert.throws(()=>f.factory.postpublicationInputs({...args,publication:{...f.publication,cleanupRequired:true}}));
  assert.throws(()=>f.factory.postpublicationInputs({...args,queueReports:[{...f.queueReport,requestId:'foreign'}]}));
  const altered=clone(f.ownerState);altered.stageEnvelope.receipt.ownership={kind:'lease',ownerId:'fixture-native-copy'};
  assert.throws(()=>f.factory.postpublicationInputs({...args,ownerState:altered}));
  for(const change of [
    s=>{delete s.stageEnvelope.management.sourcePins;},
    s=>{s.stageEnvelope.management.sourcePins.sdk.commit='0'.repeat(40);},
    s=>{delete s.stageEnvelope.receipt.sdkInstanceId;},
    s=>{s.stageEnvelope.receipt.localApplicationRevision++;},
    s=>{s.stageEnvelope.management.kernelSha256='0'.repeat(64);}
  ]){const state=clone(f.ownerState);change(state);assert.throws(()=>f.factory.postpublicationInputs({...args,ownerState:state}));}
  assert.equal(f.publication.state,'SNAPSHOT_PUBLISHED');assert.equal(f.ownerState.preparedReleased,true);
});
test('raw postpublication DATA observes the active lifetime, not the closed staging callback',()=>{
  const f=fixture();f.factory.checkpointInputs({nativeValidation:f.v,weightBiasEvidence:f.w});f.setCurrent(false);
  let input=f.factory.postpublicationInputs(postArgs(f));assert.equal(input.activeBindings.consumer.valid,true);
  assert.equal(input.activeBindings.producer.currentRevision,7);assert.equal(input.activeBindings.consumer.revisionNamespace,'manager-selected-native-resource');
  assert.equal(input.activeBindings.consumer.expectedRevision,'fixture-manager-selection:1008');
  f.setPublishedCurrent(false);input=f.factory.postpublicationInputs(postArgs(f));assert.equal(input.activeBindings.consumer.valid,false);
  f.setPublishedCurrent(true);f.setConsumerToken('new-outside-selection');input=f.factory.postpublicationInputs(postArgs(f));assert.equal(input.activeBindings.consumer.valid,false);
});
test('explicit checkpoint target binds the outer actual validation and cannot be filled from publication',()=>{
  const f=fixture();const args={nativeValidation:f.v,weightBiasEvidence:f.w,snapshotTarget:f.target,ownerValidation:f.outerOwnerValidation};
  const input=f.factory.checkpointInputs(args);assert.equal(input.referenceContext.ownerAdmission.phaseBinding.bound,true);
  assert.deepEqual(input.referenceContext.ownerAdmission.phaseBinding.snapshotTarget,f.target);
  assert.equal(f.factory.postpublicationInputs(postArgs(f)).referenceContext.ownerAdmission.phaseBinding.bound,true);
  assert.throws(()=>f.factory.checkpointInputs({...args,snapshotTarget:{...f.target,managerRevision:1009}}));
  assert.throws(()=>f.factory.checkpointInputs({...args,snapshotTarget:{...f.target,resourceBinding:{...f.target.resourceBinding,resourceGeneration:'foreign'}}}));
  const legacy=fixture();legacy.factory.checkpointInputs({nativeValidation:legacy.v,weightBiasEvidence:legacy.w});
  const published=legacy.factory.postpublicationInputs(postArgs(legacy));assert.equal(published.referenceContext.ownerAdmission.phaseBinding.bound,false);
  assert.equal(published.referenceContext.ownerAdmission.phaseBinding.snapshotTarget,null);
});
test('captured origin declarations do not change when caller mutates input metadata later',()=>{
  const f=fixture();f.options.inspection.tensors[Object.keys(f.options.inspection.tensors)[0]].dtype='F16';f.options.sourcePins.sdk.repository='https://example.com';
  const input=f.factory.preflightInputs()[0];assert.equal(input.sourceDtype,'BF16');assert.equal(f.factory.describe().nativeSourcePins.sdk.repository,repository);
});
test('public DATA excludes mutable non-JSON collections and runtime tensor payloads',()=>{
  const f=fixture(o=>{o.sourcePins.sdk.extraMetadata=new Map([['mutable','value']]);});
  assert.throws(()=>f.factory.preflightInputs(),/ordinary JSON metadata/);
  const g=fixture();assert.throws(()=>g.factory.checkpointInputs({nativeValidation:g.v,
    weightBiasEvidence:{...g.w,actualOutput:new Float32Array(16)}}),/ordinary JSON metadata/);
  assert.throws(()=>g.factory.postpublicationInputs(postArgs(g)),/Actual published target/);
});

// Receiver assembly fixtures only. These tests execute the fixed management
// evaluator; they are not native/model/real-base numerical evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createP3NormEdge, catalogSourceAlias} from './p3-norm-edge.mjs';

const managerRoot = process.env.WORKS_P3_NORM_MANAGER_ROOT;
const opts = {skip: !managerRoot};
const repository = 'https://github.com/Kushyameln01/kushyameln-works';
const readJSON = async path => JSON.parse(await readFile(resolve(managerRoot, path), 'utf8'));
async function fixture() {
  const module = path => import(pathToFileURL(resolve(managerRoot, path)).href);
  const [{loadReferenceSet}, {evaluateEdge}, {CANDIDATE_ADOPTED_LORA_SOURCE: pins}] = await Promise.all([
    module('docs/shared/ai-connection/reference-loader.mjs'), module('docs/shared/ai-connection/compatibility.mjs'),
    module('docs/shared/ai-connection/adapters/adopted-lora.mjs')]);
  const catalogPath = 'docs/shared/ai-connection/reference/catalog.v1.json';
  const catalogBytes = new Uint8Array(await readFile(resolve(managerRoot, catalogPath)));
  const catalog = JSON.parse(new TextDecoder().decode(catalogBytes));
  const files = new Map(await Promise.all(catalog.files.map(async f => [f.path, new Uint8Array(await readFile(resolve(managerRoot, f.path)))])));
  const referenceSet = await loadReferenceSet({catalogBytes, files, expectedCatalogSha256: '14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c'});
  const candidateSet = (await readJSON('development/ai-connection/reference-adoption/CANDIDATES.json')).candidateSet;
  const record = referenceSet.profileRecords.get('EXEC-BERNINI-Q16-F32').requiredDeclarations;
  const key = 'diffusion_model.blocks.0.self_attn.q';
  const native = {schemaVersion: 'bernini-diagnostic-registry/0.1', executionProfileId: 'bernini-q16x5120-f32-wasm-v1',
    registryHash: '1'.repeat(64), modelHash: '2'.repeat(64), graphHash: record.graphSHA256, side: 'HIGH', targets: [
      {key: key+'.weight', originalKey: record.originalTarget, weightId: 'q.weight', dtype:'F32', computeDtype:'F32', storageDtype:'F8_E4M3', layout:'row-major', shape: [16,5120], fullShape: [5120,5120], binding: {kind: 'runtime-input', name: 'weight'}},
      {key: key+'.bias', weightId: 'q.bias', dtype:'F32', computeDtype:'F32', storageDtype:'F16', layout:'row-major', shape: [16], fullShape: [5120], binding: {kind: 'hike-parameter', name: 'bias'}}]};
  const registry = {modelHash: native.modelHash, graphHash: native.graphHash, side:'HIGH', targets: native.targets.map(t => ({key:t.key, weightId:t.weightId, dtype:'F32', layout:'row-major', shape:t.fullShape}))};
  const down = key+'.lora_down.weight', up = key+'.lora_up.weight', biasName = key+'.diff_b';
  const plan = {contractVersion: 'lora-connection/2.0-draft.1', sdkInstanceId: 'fixture-sdk', localInputRevision: 1, localApplicationRevision: 1,
    planId: '3'.repeat(64), sourceSha256: '4'.repeat(64), registryHash: '5'.repeat(64), registry,
    loaderPolicyId: 'comfy-lora-b5a4321-linear-diff-v1', buildId: pins.kernel.sha256, coverage: 'PARTIAL', scope: 'diagnostic-projection',
    completeAdapter: false, generationReady: false, strength: 1, selection:{pairId:'light',noise:'high'}, operations: [
      {key:key+'.weight', variant:'linear-down-up', names:[down,up], rank:1, alpha:null, alphaName:null, scale:1, fullShape:[5120,5120], slice:{startRow:0,rowCount:16}},
      {key:key+'.bias', variant:'additive-diff-b', names:[biasName], scale:1, fullShape:[5120], slice:{startRow:0,rowCount:16}}]};
  for(const op of plan.operations)op.target=registry.targets.find(t=>t.key===op.key);
  const ownerBinding = {adapterVersion:'lora-diffusion-diagnostic-adapter/0.1', nativeRegistryHash:native.registryHash, connectionRegistryHash:plan.registryHash,
    nativeRegistry:native, connectionRegistry:registry};
  const sourcePins = Object.fromEntries(Object.entries(pins).map(([k,v])=>[k,{repository,...v}]));
  const resourceBinding = {ownerId:'fixture-owner',bindingId:'fixture-binding',resourceGeneration:'fixture-generation'};
  const consumerBinding = {namespace:'manager-selected-native-resource',revision:'fixture-selection-token:1001',managerSessionId:'fixture-manager',resourceBinding};
  let current=true,observedConsumerBinding=structuredClone(consumerBinding);
  const helper = createP3NormEdge({evaluateEdge,referenceSet,candidateSet,sourcePins,plan,ownerBinding,
    inspection:{tensors:{[down]:{dtype:'F32',shape:[1,5120]},[up]:{dtype:'F32',shape:[5120,1]},[biasName]:{dtype:'F32',shape:[5120]}}},
    executionKernelDigest:'6'.repeat(64), gateIdentity:{sourceRef:sourcePins.diffusion,sha256:'7'.repeat(64),gateId:'fixture-only-gate',tolerance:{absolute:0,relative:0}},
    referenceIdentity:{sourceRef:sourcePins.adapter,sha256:'8'.repeat(64),expectedOutputSha256:'c'.repeat(64),referenceId:'fixture-only-reference'},
    baseKind:'synthetic-receiver-assembly-fixture',environment:'node-receiver-unit',inputKind:'injected-local-source',
    resourceState:{status:'available',ownerId:'fixture-owner',requiredBytes:64,budgetBytes:64,occupiedBytes:0},isCurrent:()=>current,
    consumerBinding,readConsumerBinding:()=>observedConsumerBinding});
  const validation = {contractVersion:plan.contractVersion,valid:true,planId:plan.planId,registryHash:plan.registryHash,sourceSha256:plan.sourceSha256,coverage:'PARTIAL',scope:plan.scope,
    evidence:{nativeReceipt:{schemaVersion:'bernini-diagnostic-validation/0.1',valid:true,candidateId:'fixture-native-candidate',registryHash:native.registryHash,modelHash:native.modelHash,graphHash:native.graphHash,
      scope:'PARTIAL',modelInference:false,expectedSHA256:'c'.repeat(64),tolerance:{absolute:0,relative:0},failedIndices:[],maxAbsoluteError:0,
      evidence:{hikeWasmSHA256:'6'.repeat(64),graphSHA256:native.graphHash}}}};
  const weightBiasEvidence = {evidenceId:'fixture:owner-check',referenceId:'fixture-only-reference',referenceSha256:'8'.repeat(64),planId:plan.planId,
    sourceSha256:plan.sourceSha256,strength:plan.strength,nativeRegistryHash:native.registryHash,connectionRegistryHash:plan.registryHash,weightComparison:{passed:true,compared:81920},
    biasComparison:{passed:true,compared:16},weightArtifact:{sha256:'9'.repeat(64)},biasArtifact:{sha256:'a'.repeat(64)}};
  const localRevisionBindings = {sdkInstanceId:plan.sdkInstanceId,localInputRevision:1,localApplicationRevision:1};
  const target = {snapshotId:'fixture-snapshot',snapshotHash:'b'.repeat(64),managerSessionId:'fixture-manager',managerRevision:1,stepId:'HIGH',operationId:'diagnose',resourceBinding,localRevisionBindings};
  const ownership={kind:'independent-copy',ownerId:'fixture-native-copy-owner'};
  const publication = {state:'SNAPSHOT_PUBLISHED',generationReady:false,cleanupRequired:false,nativeStates:[{stepId:'HIGH',state:'CONSUMER_APPLIED',ownership}],
    snapshot:{...target,stepBindings:[{stepId:'HIGH',operationId:'diagnose',resourceBinding,localRevisionBindings}]}};
  const nativePhaseTarget={managerSessionId:target.managerSessionId,managerRevision:1,resourceBinding,requestId:'fixture-stage'};
  const queueTarget={invocationId:'fixture-invocation',bindingId:resourceBinding.bindingId,ownerId:resourceBinding.ownerId,resourceGeneration:resourceBinding.resourceGeneration,requestId:'fixture-queue',revision:1,activeToken:'fixture-token'};
  const ownerState={target,published:true,originalTerminal:true,queueReleased:true,preparedReleased:true,nativePhaseTarget,queueTarget,
    stageEnvelope:{management:{target:nativePhaseTarget,localRevisionBindings,sourcePins:structuredClone(sourcePins),kernelSha256:sourcePins.kernel.sha256,
      adoptionVersion:'works-candidate-adopted-lora/0.1-draft.1',ownerAdapterVersion:ownerBinding.adapterVersion},
      receipt:{contractVersion:plan.contractVersion,sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision,
      planId:plan.planId,sourceSha256:plan.sourceSha256,registryHash:plan.registryHash,validation,
      state:'CONSUMER_APPLIED',coverage:'PARTIAL',scope:plan.scope,snapshotPublished:false,generationReady:false,ownership}}};
  const queueReport={id:queueTarget.invocationId,resourceBinding:queueTarget.bindingId,ownerId:queueTarget.ownerId,resourceGeneration:queueTarget.resourceGeneration,
    requestId:queueTarget.requestId,revision:1,activeToken:queueTarget.activeToken,originalTerminal:true,resourceReleased:true,reusable:true,resultAccepted:true};
  return {helper,sourcePins,validation,weightBiasEvidence,target,publication,ownerState,queueReport,
    setCurrent:value=>{current=value;},setConsumerRevision:value=>{observedConsumerBinding={...consumerBinding,revision:value};}};
}
test('catalog source alias is explicit and does not mutate native pins',()=>{
  const input={repository,commit:'a'.repeat(40),path:'x.mjs',sha256:'b'.repeat(64)};
  assert.deepEqual(catalogSourceAlias(input),{repository:'Kushyameln01/kushyameln-works',commit:input.commit,path:input.path});
  assert.equal(input.repository,repository);assert.equal(input.sha256,'b'.repeat(64));
  assert.throws(()=>catalogSourceAlias({...input,repository:'https://example.com/foreign'}));
});
test('preflight checks both LoRA and explicit bias loader declarations without future evidence',opts,async()=>{
  const f=await fixture(),r=f.helper.preflight();assert.equal(r.decisions.length,2);
  for(const x of r.decisions){assert.equal(x.decision.compatibility,'COMPATIBLE');assert.equal(x.decision.readiness.state,'ready');assert.deepEqual(x.decision.validation,[]);}
  assert.equal(r.nativeSourcePins.sdk.repository,repository);assert.equal(r.generationReady,false);
});
test('checkpoint preserves actual-shaped receipts and negative mutations stay scoped',opts,async()=>{
  const f=await fixture();const r=f.helper.checkpoint({nativeValidation:f.validation,weightBiasEvidence:f.weightBiasEvidence});
  assert.equal(r.decisions[0].decision.compatibility,'COMPATIBLE');assert.equal(r.decisions[0].decision.readiness.state,'ready');
  for(const probe of f.helper.negativeProbes().probes){assert.equal(probe.decision.compatibility,probe.expected.compatibility,probe.id);
    if(probe.expected.readiness){assert.equal(probe.decision.readiness.state,probe.expected.readiness);assert.equal(probe.decision.validation.find(x=>x.scope==='p3:actual-q16-projection').result,probe.expected.validation);}}
  assert.throws(()=>f.helper.checkpoint({nativeValidation:f.validation,weightBiasEvidence:{...f.weightBiasEvidence,weightComparison:{passed:true,compared:1}}}),/every selected/);
  assert.throws(()=>f.helper.checkpoint({nativeValidation:f.validation,weightBiasEvidence:{...f.weightBiasEvidence,strength:0}}),/every selected/);
});
test('publication requires exact native revisions and actual queue terminal/release barriers',opts,async()=>{
  const f=await fixture();f.helper.checkpoint({nativeValidation:f.validation,weightBiasEvidence:f.weightBiasEvidence});
  const args={snapshotTarget:f.target,publication:f.publication,ownerState:f.ownerState,queueReports:[f.queueReport],ownerValidationRef:f.weightBiasEvidence.evidenceId};
  const r=f.helper.postpublication(args);assert.equal(r.decisions[0].decision.compatibility,'COMPATIBLE');assert.equal(r.decisions[0].decision.readiness.state,'ready');
  assert.throws(()=>f.helper.postpublication({...args,queueReports:[{...f.queueReport,originalTerminal:false}]}));
  assert.throws(()=>f.helper.postpublication({...args,queueReports:[{...f.queueReport,requestId:'foreign'}]}));
  assert.throws(()=>f.helper.postpublication({...args,publication:{...f.publication,cleanupRequired:true}}));
  assert.throws(()=>f.helper.postpublication({...args,snapshotTarget:{...f.target,localRevisionBindings:{...f.target.localRevisionBindings,localInputRevision:2}}}));
  for(const ownership of [undefined,{kind:'independent-copy',ownerId:'foreign-native-owner'},{kind:'lease',ownerId:'fixture-native-copy-owner'}]){
    const altered=structuredClone(f.ownerState);altered.stageEnvelope.receipt.ownership=ownership;
    assert.throws(()=>f.helper.postpublication({...args,ownerState:altered}),'Missing, mismatched or lease ownership must not pass');
  }
});
test('publication refreshes selected currentness and external consumer revision after checkpoint',opts,async()=>{
  const f=await fixture();f.helper.checkpoint({nativeValidation:f.validation,weightBiasEvidence:f.weightBiasEvidence});
  const args={snapshotTarget:f.target,publication:f.publication,ownerState:f.ownerState,queueReports:[f.queueReport],ownerValidationRef:f.weightBiasEvidence.evidenceId};
  f.setCurrent(false);let result=f.helper.postpublication(args).decisions[0].decision;
  assert.equal(result.compatibility,'COMPATIBLE');assert.equal(result.readiness.state,'blocked');
  assert.ok(result.readiness.reasons.includes('BINDING_NOT_CURRENT:consumer'));
  f.setCurrent(true);f.setConsumerRevision('new-outside-manager-selection');result=f.helper.postpublication(args).decisions[0].decision;
  assert.equal(result.readiness.state,'blocked');assert.ok(result.readiness.reasons.includes('BINDING_NOT_CURRENT:consumer'));
});

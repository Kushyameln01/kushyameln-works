// Metadata-only assembly checks against the real management declaration guard.
// No original File/base payload, SDK, Hike, ORT, or numerical execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createLoraDataRealEdgeInput} from './lora-data-real-inputs.mjs';
const managerRoot=process.env.WORKS_LORA_DATA_MANAGER_ROOT,options={skip:!managerRoot};
const clone=structuredClone;
async function fixture(change=()=>{}){
 const module=path=>import(pathToFileURL(resolve(managerRoot,path)).href);
 const [{loadReferenceSet},{createNormExecution},{evaluateEdge},{CANDIDATE_ADOPTED_LORA_SOURCE}]=await Promise.all([
  module('docs/shared/ai-connection/reference-loader.mjs'),module('docs/shared/ai-connection/norm-execution.mjs'),
  module('docs/shared/ai-connection/compatibility.mjs'),module('docs/shared/ai-connection/adapters/adopted-lora.mjs')]);
 const catalogBytes=new Uint8Array(await readFile(resolve(managerRoot,'docs/shared/ai-connection/reference/catalog.v1.json'))),catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
 const files=new Map(await Promise.all(catalog.files.map(async f=>[f.path,new Uint8Array(await readFile(resolve(managerRoot,f.path)))])));
 const referenceSet=await loadReferenceSet({catalogBytes,files,expectedCatalogSha256:'14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c'});
 const candidateSet=JSON.parse(await readFile(resolve(managerRoot,'development/ai-connection/reference-adoption/CANDIDATES.json'),'utf8')).candidateSet;
 const record=referenceSet.profileRecords.get('EXEC-BERNINI-Q16-F32'),key='diffusion_model.blocks.0.self_attn.q';
 const native={schemaVersion:'bernini-diagnostic-registry/0.1',executionProfileId:record.nativeProfileId,side:'HIGH',registryHash:'b'.repeat(64),
  graphHash:record.requiredDeclarations.graphSHA256,modelHash:'a'.repeat(64),targets:[
   {key:key+'.weight',weightId:'q.weight',originalKey:'blocks.0.self_attn.q.weight',shape:[16,5120],fullShape:[5120,5120],computeDtype:'F32',
    binding:{kind:'runtime-input',name:'weight'},transform:{rowStart:0,rowCount:16,columnStart:0,columnCount:5120}},
   {key:key+'.bias',weightId:'q.bias',shape:[16],fullShape:[5120],computeDtype:'F32',binding:{kind:'hike-parameter',name:'bias'},transform:{rowStart:0,rowCount:16}}]};
 const connection={loaderPolicyId:'comfy-lora-b5a4321-linear-diff-v1',targets:native.targets.map(t=>({key:t.key,weightId:t.weightId,dtype:'F32',layout:'row-major'}))};
 const sourcePins=Object.fromEntries(Object.entries(CANDIDATE_ADOPTED_LORA_SOURCE).map(([k,p])=>[k,{repository:'https://github.com/Kushyameln01/kushyameln-works',...p}]));
 const args={referenceSet,candidateSet,sourcePins,binding:{owner:{adapterVersion:'lora-diffusion-diagnostic-adapter/0.1',nativeRegistryHash:native.registryHash,
  connectionRegistryHash:'c'.repeat(64),nativeRegistry:native,connectionRegistry:connection}},inspection:{tensors:{[key+'.lora_down.weight']:{dtype:'BF16'}}},
  sourceSha256:'d'.repeat(64),sdkInstanceId:'fixture-sdk',selection:{pairId:'light',noise:'high'},strength:1,
  referenceInputs:{gateIdentity:{sourceRef:sourcePins.diffusion,sha256:'1'.repeat(64),gateId:'fixture-independent-gate'},
   referenceIdentity:{sourceRef:sourcePins.adapter,sha256:'2'.repeat(64),referenceId:'fixture-independent-reference'}},
  expectedOutputSha256:'3'.repeat(64),projectionTolerance:{absolute:1e-6,relative:1e-5},executionKernelDigest:'ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd',
  consumerBinding:{namespace:'fixture-selected-native-resource',revision:'fixture-outside-token:2001',managerSessionId:'fixture-manager',resourceBinding:{ownerId:'fixture-resource',bindingId:'fixture-binding',resourceGeneration:'fixture-generation'}},
  resourceState:{status:'available',ownerId:'fixture-resource',requiredBytes:0,budgetBytes:0,occupiedBytes:0},environment:'METADATA_FIXTURE_ONLY',artifactId:'fixture-selected-weight'};
 change(args);const edgeInput=createLoraDataRealEdgeInput(args);return {args,edgeInput,createNormExecution,evaluateEdge,referenceSet};
}
test('real-trial predeclaration is receipt-free and admits only the declaration phase',options,async()=>{
 const f=await fixture(),before=clone(f.args.sourcePins),edge=f.edgeInput;
 const guard=f.createNormExecution({policyId:'lora-q16',referenceSet:f.referenceSet,edgeInput:edge});
 assert.equal(guard.inspect().phase,'declaration');assert.equal(guard.inspect().initialDecision.compatibility,'COMPATIBLE');assert.equal(guard.inspect().initialDecision.readiness.state,'ready');
 assert.deepEqual(edge.evidence,[]);assert.equal(edge.referenceContext.delegations,undefined);assert.equal(edge.referenceContext.phase,undefined);
 assert.equal(edge.referenceContext.referenceSet,f.referenceSet);assert.deepEqual(f.args.sourcePins,before);
 assert.equal(edge.artifact.tensor.shape[0],16);assert.equal(edge.artifact.tensor.shape[1],5120);
 assert.equal(edge.referenceContext.numericRequirements[0].referenceRef.referenceId,'fixture-independent-reference');
 assert.equal(edge.referenceContext.numericRequirements[0].referenceRef.expectedOutputSha256,'3'.repeat(64));
 const ordinary=f.evaluateEdge(edge);assert.equal(ordinary.compatibility,'COMPATIBLE');assert.equal(ordinary.readiness.state,'blocked');
 assert.ok(ordinary.validation.some(v=>v.result==='not-verified'));
 assert.throws(()=>guard.assertValidated(),{code:'NORM_PHASE_ORDER'});
});
test('missing owner dtype remains unverified; observed layout conflict is incompatible',options,async()=>{
 for(const [mutate,expected]of [
  [a=>{delete a.binding.owner.nativeRegistry.targets[0].computeDtype;},'UNVERIFIED'],
  [a=>{a.binding.owner.connectionRegistry.targets[0].layout='column-major';},'INCOMPATIBLE']]){
  const f=await fixture(mutate);let refusal;try{f.createNormExecution({policyId:'lora-q16',referenceSet:f.referenceSet,edgeInput:f.edgeInput});}catch(error){refusal=error;}
  assert.equal(refusal.code,'NORM_DECLARATION_BLOCKED');assert.equal(refusal.decision.compatibility,expected);
 }
});
test('native kernel/source mismatches fail management declarations instead of falling back',options,async()=>{
 for(const mutate of [a=>{a.sourcePins.kernel.byteLength=4919;},a=>{a.sourcePins.sdk.commit='0'.repeat(40); }]){
  const f=await fixture(mutate);assert.throws(()=>f.createNormExecution({policyId:'lora-q16',referenceSet:f.referenceSet,edgeInput:f.edgeInput}),{code:'NORM_DECLARATION_BLOCKED'});
 }
});
test('counter namespaces and reference identities remain distinct before native plan',options,async()=>{
 const f=await fixture(),q=f.edgeInput;
 assert.equal(q.activeBindings.consumer.expectedRevision,f.args.consumerBinding.revision);
 assert.notEqual(q.activeBindings.producer.expectedRevision,q.activeBindings.consumer.expectedRevision);
 assert.equal(q.referenceContext.mapping.sourceHash,f.args.sourceSha256);
 assert.equal(q.referenceContext.mapping.nativeRegistryHash,'b'.repeat(64));assert.equal(q.referenceContext.mapping.connectionRegistryHash,'c'.repeat(64));
 assert.equal(q.referenceContext.numericRequirements[0].kernelDigest,f.args.executionKernelDigest);
 assert.throws(()=>createLoraDataRealEdgeInput({...f.args,selection:{pairId:'detail',noise:'high'}}),/deliberately limited/);
});

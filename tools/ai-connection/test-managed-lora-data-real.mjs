import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {normEdgeFixture} from './norm-execution-fixtures.mjs';
import {createLoraManagementAdmissionInputs} from '../../docs/shared/ai-connection/adapters/lora-data/management-admission-inputs.mjs';
import {createNormExecution} from '../../docs/shared/ai-connection/norm-execution.mjs';

const helper=await import('./managed-lora-data-real-declaration.mjs').catch(()=>null);
const runner=new URL('./run-managed-lora-data-real.mjs',import.meta.url);
test('real DATA runner exposes one selected File, bounded artifact and retained references',()=>{
 const r=spawnSync(process.execPath,[runner.pathname,'--help'],{encoding:'utf8'});
 assert.equal(r.status,0,'The concrete single-selected-File runner must exist');
 assert.match(r.stdout,/--file/);assert.match(r.stdout,/--artifact/);assert.match(r.stdout,/--reference-root/);
 assert.doesNotMatch(r.stdout,/--originals-root|--base-receipt/);
});
test('missing owner-held private inputs produce zero-run BLOCKED evidence without claiming fixed execution',async()=>{
 const temporary=await mkdtemp(path.join(tmpdir(),'p3-real-missing-'));
 try{
  const root=new URL('../../',import.meta.url).pathname,out=path.join(temporary,'out');
  const r=spawnSync(process.execPath,[runner.pathname,'--lora-root',root,'--diffusion-root',root,'--file',path.join(temporary,'selected.safetensors'),'--artifact',path.join(temporary,'base-blocks.json'),'--reference-root',path.join(temporary,'reference'),'--pair','light','--side','HIGH','--expected-sha256','1'.repeat(64),'--out',out],{encoding:'utf8'});
  assert.equal(r.status,2,r.stderr);const report=JSON.parse(await readFile(path.join(out,'result.json'),'utf8'));
  assert.equal(report.status,'BLOCKED_PRIVATE_INPUTS');assert.equal(report.nativeTransactionCount,0);assert.equal(report.oracleRecalculationCount,0);assert.equal(report.formalBridgeAccepted,false);assert.equal(report.executedSourceCommit,null);assert.equal(report.generationReady,false);assert.equal(report.missing.length,3);
 }finally{await rm(temporary,{recursive:true,force:true});}
});
test('pre-plan real declaration keeps owner registry selection and emits no future evidence',async()=>{
 assert.equal(typeof helper?.createRealLoraDeclaration,'function','The actual-owner declaration assembler must exist');
 const f=await normEdgeFixture(),native=structuredClone(f.binding.owner.nativeRegistry);
 native.schemaVersion='bernini-diagnostic-registry/0.1';native.targets=[
  {key:f.plan.operations[0].key,weightId:'q.weight',fullShape:[5120,5120],shape:[16,5120],dtype:'F32',layout:'row-major',originalKey:'blocks.0.self_attn.q.weight',binding:{kind:'runtime-input',name:'weight'},transform:{rowStart:0,rowCount:16}},
  {key:f.plan.operations[1].key,weightId:'q.bias',fullShape:[5120],shape:[16],dtype:'F32',layout:'row-major',originalKey:'blocks.0.self_attn.q.bias',binding:{kind:'hike-parameter',name:'bias'},transform:{rowStart:0,rowCount:16}}
 ];
 const owner={...f.binding.owner,nativeRegistry:native,connectionRegistry:{...f.plan.registry,loaderPolicyId:f.plan.loaderPolicyId,registryVersion:'fixture-owner-registry',targets:native.targets.map(t=>({key:t.key,weightId:t.weightId,shape:t.fullShape,dtype:'F32',layout:t.layout,binding:t.binding}))}};
 const consumerBinding={namespace:'outside:fixture',revision:'selected:7',managerSessionId:'manager:fixture',resourceBinding:f.resourceBinding};
 const options={referenceSet:f.referenceSet,candidateSet:f.edgeInput.referenceContext.candidateSet,sourcePins:f.pins,ownerBinding:owner,sdk:{contractVersion:f.plan.contractVersion,sdkInstanceId:f.plan.sdkInstanceId,kernelInfo:{wasmSha256:f.pins.kernel.sha256}},sourceSha256:f.plan.sourceSha256,sourceDtype:'BF16',strength:1,consumerBinding,resourceState:f.edgeInput.resourceState,gateIdentity:f.numeric.gateRef,referenceIdentity:f.numeric.referenceRef,executionKernelDigest:f.numeric.kernelDigest};
 const q=helper.createRealLoraDeclaration(options);
 assert.deepEqual(q.referenceContext.mapping.selectionRegion,f.plan.operations.map(op=>({key:op.key,slice:op.slice})));
 assert.deepEqual(q.referenceContext.mapping.fullShape,[5120,5120]);assert.equal(q.referenceContext.mapping.nativeRegistryHash,owner.nativeRegistryHash);assert.equal(q.referenceContext.mapping.connectionRegistryHash,owner.connectionRegistryHash);
 assert.equal(q.referenceContext.mapping.sourceHash,f.plan.sourceSha256);assert.equal(q.referenceContext.nativeDeclarations.producer.inputKind,'local-file');assert.equal(q.referenceContext.evidenceTarget.baseKind,'actual-original-bounded-fragments');
 assert.deepEqual(q.evidence,[]);assert.equal(q.referenceContext.ownerAdmission,undefined);
 let guard;try{guard=createNormExecution({policyId:'lora-q16',referenceSet:f.referenceSet,edgeInput:q});}catch(e){assert.fail(JSON.stringify(e.decision?.reasons));}assert.doesNotThrow(()=>guard.declaration({activeBindings:q.activeBindings,resourceState:q.resourceState}));
 const plan={...f.plan,registry:owner.connectionRegistry,operations:f.plan.operations.map((op,i)=>({...op,target:owner.connectionRegistry.targets[i],names:['fixture:'+i],scale:1,...(!i?{rank:1,alpha:null,alphaName:null}:{})}))},inspection={tensors:{'fixture:0':{dtype:'BF16'},'fixture:1':{dtype:'BF16'}}};
 const data=createLoraManagementAdmissionInputs({referenceSet:f.referenceSet,candidateSet:q.referenceContext.candidateSet,sourcePins:f.pins,plan,inspection,ownerBinding:owner,executionKernelDigest:f.numeric.kernelDigest,gateIdentity:f.numeric.gateRef,referenceIdentity:f.numeric.referenceRef,baseKind:q.referenceContext.evidenceTarget.baseKind,environment:q.referenceContext.environment,resourceState:q.resourceState,isCurrent:()=>true,isPublishedCurrent:()=>false,inputKind:'local-file',consumerBinding,readConsumerBinding:()=>consumerBinding,artifactId:q.artifact.artifactId});
 assert.deepEqual(data.preflightInputs()[0].input.referenceContext.mapping,q.referenceContext.mapping);
 consumerBinding.revision='changed';assert.equal(q.activeBindings.consumer.expectedRevision,'selected:7');
 assert.throws(()=>helper.createRealLoraDeclaration({...options,sourceSha256:null}),/actual.*source|source.*hash/i);
});

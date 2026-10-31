import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';
import {createNormRequiredLoraExecution} from '../../docs/shared/ai-connection/adapters/norm-required-lora.mjs';
import {createSnapshotManager} from '../../docs/shared/ai-connection/snapshot.mjs';
import {createInvocationQueue} from '../../docs/shared/ai-connection/queue.mjs';
import {normEdgeFixture} from './norm-execution-fixtures.mjs';
import {nativeFixture,controlSource} from './run-snapshot-native-lora.mjs';

const KEY='diffusion_model.blocks.0.self_attn.q';
const loraRoot=process.env.WORKS_SNAPSHOT_LORA_ROOT,diffusionRoot=process.env.WORKS_SNAPSHOT_DIFFUSION_ROOT;

/** One genuine public native transaction over the existing synthetic BF16
 * source/base control. No real base, original-file trial or generation claim. */
export async function runNormRequiredNativeLoraCase({loraRoot,diffusionRoot}){
 const f=await nativeFixture({loraRoot,diffusionRoot}),declarations=await normEdgeFixture(),q=declarations.edgeInput;
 assert.equal(f.sourceProof.length,23);assert.equal(f.sourceProof.every(p=>p.gitObjectMatched&&p.sha256Matched),true);
 const native=structuredClone(f.registries.find(r=>r.side==='HIGH'));for(const t of native.targets){t.transform.rowStart=0;t.source.elementOffset=0;}native.registryHash=f.diagnosticRegistryHash(native);
 const source=controlSource(),sourceSha256=await source.hash(),baseProvider={async readBlock(id,offset,count){assert.ok(['q.weight','q.bias'].includes(id));return Float32Array.from({length:count},(_,i)=>id==='q.bias'?2:(offset+i)%5120===0?1:0);}};
 const stage=await f.createOrtProjectionStage({hikeBytes:f.projectionHikeBytes}),consumer=f.createDiagnosticConsumer({registry:native,stage,baseProvider}),kernel=await f.createKernel({wasmBytes:f.wasmBytes}),sdk=await f.createLoraV2({sourceFactory:()=>source,kernel});
 let manager,queue,owner,candidate;const calls={plan:0,prepare:0,nativeValidate:0,nativeCommit:0,comparison:0},blocks={weight:0,bias:0};
 try{
  const inspected=await sdk.inspect({pairId:'light',noise:'high'}),observed=consumer.describe();
  assert.equal(inspected.integrity,'header-only');assert.equal(inspected.sourceSha256,null);assert.equal(inspected.tensorCount,3);
  assert.deepEqual(inspected.tensors[KEY+'.lora_down.weight'].shape,[128,5120]);assert.deepEqual(inspected.tensors[KEY+'.lora_up.weight'].shape,[5120,128]);assert.deepEqual(inspected.tensors[KEY+'.diff_b'].shape,[5120]);
  assert.equal(inspected.tensors[KEY+'.lora_down.weight'].dtype,'BF16');assert.equal(inspected.tensors[KEY+'.lora_up.weight'].dtype,'BF16');assert.equal(inspected.tensors[KEY+'.diff_b'].dtype,'BF16');
  const executionKernel=f.sourceProof.find(p=>p.commit===f.pins.diffusion.commit&&p.path==='docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm');assert.ok(executionKernel);
  const resourceBinding=structuredClone(declarations.resourceBinding),sourcePins=structuredClone(declarations.pins);
  const publicConsumer={...consumer,async validate(...args){calls.nativeValidate++;return consumer.validate(...args);},async commit(...args){calls.nativeCommit++;return consumer.commit(...args);}};
  const publicSdk={...sdk,async plan(...args){calls.plan++;return sdk.plan(...args);}};
  const adopted=f.createCandidateAdoptedLoraAdapter({ownerExports:f.ownerExports,sdk:publicSdk,consumer:publicConsumer,baseProvider,sourcePins,resourceBinding,isOwnerCurrent:()=>true});
  const binding=await adopted.describeBinding(),weight=observed.targets.find(t=>t.weightId==='q.weight'),bias=observed.targets.find(t=>t.weightId==='q.bias');
  assert.deepEqual(weight.fullShape,[5120,5120]);assert.deepEqual(weight.shape,[16,5120]);assert.deepEqual(weight.binding,{kind:'runtime-input',name:'weight'});assert.deepEqual(bias.binding,{kind:'hike-parameter',name:'bias'});
  assert.equal(binding.owner.nativeRegistryHash,native.registryHash);assert.equal(binding.management.sdkInstanceId,sdk.sdkInstanceId);
  const selectionRegion=observed.targets.map(t=>({key:t.key,slice:{startRow:t.transform.rowStart,rowCount:t.transform.rowCount}}));
  const expected=new Float32Array(16).fill(3.625),expectedOutputSha256=await sha256Bytes(new Uint8Array(expected.buffer)),tolerance={absolute:0,relative:0};
  const gateBytes=new TextEncoder().encode(JSON.stringify({scope:'synthetic-native-control',tolerance,expectedOutputSha256})),numeric=q.referenceContext.numericRequirements[0];
  Object.assign(numeric,{kernelDigest:executionKernel.sha256,gateRef:{...numeric.gateRef,sha256:await sha256Bytes(gateBytes),gateId:'owner:existing-exact-native-control',tolerance},referenceRef:{...numeric.referenceRef,sha256:expectedOutputSha256,expectedOutputSha256}});
  q.producerPort.nativeAPI.build=sdk.kernelInfo.wasmSha256;q.consumerPort.nativeAPI.build=executionKernel.sha256;
  q.producerPort.profileRef=observed.executionProfileId;q.consumerPort.profileRef=observed.executionProfileId;q.artifact.profileRef=observed.executionProfileId;
  q.referenceContext.environment='node actual pinned SDK/Hike/ORT; synthetic source/base control';
  Object.assign(q.referenceContext.nativeDeclarations.producer,{loaderPolicyId:adopted.registry.loaderPolicyId,sourceDtype:inspected.tensors[KEY+'.lora_down.weight'].dtype,baseDtype:'F32',outputDtype:weight.dtype,layout:weight.layout,targetRank:weight.fullShape.length,sourceHash:sourceSha256});
  Object.assign(q.referenceContext.nativeDeclarations.consumer,{nativeProfileId:observed.executionProfileId,graphSHA256:observed.graphHash,kernelDigest:executionKernel.sha256});
  const mapping=q.referenceContext.mapping;Object.assign(mapping,{nativeRegistryHash:binding.owner.nativeRegistryHash,connectionRegistryHash:binding.owner.connectionRegistryHash,selectionRegion,fullShape:structuredClone(weight.fullShape),sourceHash:sourceSha256,ownerBinding:{nativeRegistryHash:binding.owner.nativeRegistryHash,connectionRegistryHash:binding.owner.connectionRegistryHash},planBinding:{selectionRegion:structuredClone(selectionRegion),fullShape:structuredClone(weight.fullShape),sourceHash:sourceSha256}});
  q.referenceContext.evidenceTarget.profileRef=observed.executionProfileId;
  // The port selection tokens remain in their original outer namespace. The
  // native SDK revision is not known until the mandatory entry calls plan.
  const current={activeBindings:structuredClone(q.activeBindings),resourceState:structuredClone(q.resourceState)};
  const adapter={...adopted,async prepare(plan,options){calls.prepare++;return adopted.prepare(plan,{...options,onBlock:block=>{
   assert.ok(['q.weight','q.bias'].includes(block.weightId));for(let i=0;i<block.count;i++)assert.equal(block.data[i],block.weightId==='q.bias'?2.125:(block.offset+i)%5120===0?1.5:0);
   if(block.weightId==='q.weight')blocks.weight+=block.count;else blocks.bias+=block.count;
  }});}};
  const execution=createNormRequiredLoraExecution({adapter,referenceSet:declarations.referenceSet,edgeInput:q,readCurrent:()=>structuredClone(current),readOwnerEvidence:({plan,ownerValidation,ownerState})=>{
   calls.comparison++;assert.equal(calls.nativeValidate,1);assert.equal(calls.nativeCommit,0);assert.equal(ownerValidation.nativeValidation.valid,true);assert.equal(ownerState.originalTerminal,false);assert.deepEqual(blocks,{weight:81920,bias:16});
   return {evidenceId:'actual-native-control:whole-selected-merge',result:'pass',coverage:'PARTIAL',scope:'diagnostic-projection',baseKind:'synthetic-fixture',referenceId:q.referenceContext.evidenceTarget.referenceId,planId:plan.planId,sourceSha256:plan.sourceSha256,strength:plan.strength,nativeRegistryHash:binding.owner.nativeRegistryHash,connectionRegistryHash:binding.owner.connectionRegistryHash,referenceSha256:numeric.referenceRef.sha256};
  }});
  assert.deepEqual(calls,{plan:0,prepare:0,nativeValidate:0,nativeCommit:0,comparison:0});assert.equal(execution.inspect().phase,'declaration');
  const planTarget=structuredClone(declarations.planTarget),plan=await execution.plan({selection:{pairId:'light',noise:'high'},strength:1,diagnostic:{targets:selectionRegion}},{target:planTarget});
  assert.equal(calls.plan,1);assert.equal(plan.sourceSha256,sourceSha256);assert.equal(plan.localInputRevision,1);assert.equal(plan.sdkInstanceId,sdk.sdkInstanceId);
  queue=createInvocationQueue({resourceBindings:[{...resourceBinding,cancel:t=>owner.cancelInvocation(t),afterTerminal:(t,o)=>owner.afterInvocation(t,o),release:(t,o)=>owner.releaseInvocation(t,o)}]});
  const x=new Float32Array(5120);x[0]=1;owner=execution.createSnapshotOwner({plan,validation:{x,expected,tolerance},resourceBinding,queue,requestPrefix:'actual-norm-control'});
  const boundOwner={...owner,async prepare(context){const prepared=await owner.prepare(context);candidate=prepared.candidate;return prepared;}};
  const profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'actual-norm-control:diagnostic',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:['source:control'],steps:[{stepId:'HIGH',moduleId:'lora:actual-norm-control',operationId:'diagnose',inputBindings:[{portId:'source',artifactRef:'source:control'}],outputBindings:[{portId:'feed',artifactRef:'feed:control'}],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:['diagnostic-projection']};
  const localRevisionBindings={sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision},bindings={snapshotId:'snapshot:actual-norm-control',managerRevision:planTarget.managerRevision,artifactManifestRef:'artifacts:actual-norm-control',evidenceManifestRef:'evidence:actual-norm-control',requestedScope:{kind:'diagnostic',scopeId:'diagnostic-projection'},steps:[{stepId:'HIGH',moduleId:'lora:actual-norm-control',operationId:'diagnose',moduleVersion:sdk.contractVersion,nativeBindingRefs:[binding.owner.nativeRegistryHash,binding.owner.connectionRegistryHash],artifactRefs:['source:control'],modelProfileRefs:[observed.executionProfileId],adapterSelectionRefs:[],localRevisionBindings,sourceRef:structuredClone(sourcePins.sdk),nativeBuild:sdk.kernelInfo.wasmSha256,implementationState:'implemented',resourceBinding,isCurrent:()=>true,owner:boundOwner}]};
  manager=createSnapshotManager({managerSessionId:planTarget.managerSessionId});const token=await manager.stageSnapshot(profile,bindings);
  assert.equal(execution.inspect().phase,'validated');assert.equal(execution.inspect().publicationObserved,false);assert.equal(calls.nativeCommit,0);assert.equal(manager.active,null);await assert.rejects(consumer.run({x}),{code:'NOT_CONFIGURED'});
  const published=await manager.publishSnapshot(token,{currentBindings:{HIGH:{localRevisionBindings,resourceBinding}}}),output=await consumer.run({x}),audit=execution.inspect(),state=owner.inspect(candidate);
  assert.equal(published.state,'SNAPSHOT_PUBLISHED');assert.equal(published.cleanupRequired,false);assert.equal(manager.inspect().selectionCurrent,true);assert.equal(audit.phase,'published');assert.equal(audit.publicationObserved,true);
  assert.deepEqual([...output.output],new Array(16).fill(3.625));assert.equal(output.scope,'PARTIAL');assert.equal(output.modelInference,false);assert.equal(output.evidence.hikeWasmSHA256,executionKernel.sha256);assert.deepEqual(output.evidence.executionProviders,['wasm']);
  assert.equal(calls.plan,1);assert.equal(calls.prepare,1);assert.equal(calls.nativeValidate,1);assert.equal(calls.nativeCommit,1);assert.equal(calls.comparison,1);assert.equal(published.generationReady,false);
  assert.equal(queue.inspect().invocations.every(r=>r.originalTerminal&&r.resourceReleased&&r.reusable&&r.resultAccepted),true);assert.equal(state.published,true);assert.equal(state.preparedReleased,true);
  assert.equal(audit.decisions.every(d=>d.decision.readiness.state==='ready'),true);assert.equal(audit.decisions.at(-1).decision.validation.find(v=>v.scope==='norm:N-TRANSACTION').result,'pass');
  return {schemaVersion:'works-norm-required-lora-native-test/0.1',state:'PASS',scope:'synthetic BF16 source/base; actual pinned SDK/LoRAHike/ORT/Hike/native consumer; diagnostic-only',generationReady:false,realBaseVerified:false,sourceProof:f.sourceProof,sourceSha256,sourceInspection:inspected,publicBinding:binding,predeclaredExecutionKernel:executionKernel,reference:{expectedOutputSha256,tolerance,sha256:numeric.referenceRef.sha256},comparedValues:blocks.weight+blocks.bias,calls,actualOutput:[...output.output],runtimeEvidence:output.evidence,normExecution:audit,snapshot:published,queue:queue.inspect()};
 }finally{await manager?.recover().catch(()=>{});await manager?.dispose();await queue?.drain();await sdk.dispose();kernel.dispose();await consumer.dispose();await stage.dispose();}
}

test('mandatory norm entry executes the actual pinned SDK/Hike/ORT transaction and audits its real publication',{skip:!loraRoot||!diffusionRoot,timeout:30000},async t=>{
 const result=await runNormRequiredNativeLoraCase({loraRoot,diffusionRoot});assert.equal(result.state,'PASS');assert.equal(result.comparedValues,81936);
 if(process.env.WORKS_NORM_NATIVE_RESULT_PATH)await writeFile(process.env.WORKS_NORM_NATIVE_RESULT_PATH,JSON.stringify(result,null,2)+'\n');
 t.diagnostic(`Actual native mandatory entry PASS; ${result.sourceProof.length} full-Git-verified runtime objects; ${result.comparedValues} selected values; generationReady=false`);
});

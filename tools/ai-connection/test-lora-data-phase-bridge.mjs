import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normEdgeFixture} from './norm-execution-fixtures.mjs';
import {verifyLoraAdmissionDataSources} from '../../docs/shared/ai-connection/adapters/lora-data/source.mjs';
import {createSnapshotManager} from '../../docs/shared/ai-connection/snapshot.mjs';
import {createInvocationQueue} from '../../docs/shared/ai-connection/queue.mjs';

const clone=structuredClone,CANDIDATE='works-candidate-adopted-lora/0.1-draft.1';
const revisions=p=>({sdkInstanceId:p.sdkInstanceId,localInputRevision:p.localInputRevision,localApplicationRevision:p.localApplicationRevision});
let proof;
async function sourceProof(){return proof??=await verifyLoraAdmissionDataSources({admissionBytes:new Uint8Array(await readFile(new URL('../../docs/shared/ai-connection/adapters/lora-data/management-admission-inputs.mjs',import.meta.url))),numericBytes:new Uint8Array(await readFile(new URL('../../docs/shared/ai-connection/adapters/lora-data/numeric-declarations.mjs',import.meta.url)))});}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});void promise.catch(()=>{});return {promise,resolve,reject};};
async function fixture({mutateBinding,mutateEvidence,afterPublication}={}){
 const {createLoraDataPhaseBridge}=await import('../../docs/shared/ai-connection/adapters/lora-data-phase-bridge.mjs'),f=await normEdgeFixture(),key='diffusion_model.blocks.0.self_attn.q';
 f.plan.selection={pairId:'light',noise:'high'};
 const native=f.binding.owner.nativeRegistry;native.schemaVersion='bernini-diagnostic-registry/0.1';native.targets=f.plan.operations.map((op,i)=>({key:op.key,weightId:i?'q.bias':'q.weight',originalKey:i?'blocks.0.self_attn.q.bias':'blocks.0.self_attn.q.weight',fullShape:clone(op.fullShape),shape:i?[16]:[16,5120],dtype:'F32',computeDtype:'F32',storageDtype:i?'F16':'F8_E4M3',layout:'row-major',binding:{kind:i?'hike-parameter':'runtime-input',name:i?'bias':'weight'}}));
 Object.assign(f.plan.registry,{contractVersion:f.plan.contractVersion,registryVersion:'lora-diffusion-diagnostic-adapter/0.1',loaderPolicyId:f.plan.loaderPolicyId,targets:native.targets.map(t=>({key:t.key,weightId:t.weightId,shape:clone(t.fullShape),dtype:'F32',layout:'row-major',binding:clone(t.binding)}))});
 f.binding.owner.connectionRegistry=f.plan.registry;
 const inspection={tensors:{[key+'.lora_down.weight']:{dtype:'BF16',shape:[1,5120]},[key+'.lora_up.weight']:{dtype:'BF16',shape:[5120,1]},[key+'.diff_b']:{dtype:'F16',shape:[5120]}}};
 for(const [i,op]of f.plan.operations.entries())Object.assign(op,{target:clone(f.plan.registry.targets[i]),names:i?[key+'.diff_b']:[key+'.lora_down.weight',key+'.lora_up.weight'],scale:1,...(!i?{rank:1,alpha:null,alphaName:null}:{})});
 mutateBinding?.(f);
 let nativeRevisions=revisions(f.plan);const consumerBinding={namespace:'outside-consumer',revision:'outside-token:alpha',managerSessionId:f.planTarget.managerSessionId,resourceBinding:clone(f.resourceBinding)};
 let consumer=clone(consumerBinding);const current={activeBindings:clone(f.edgeInput.activeBindings),resourceState:clone(f.edgeInput.resourceState)},calls=[];
 const prepared={state:'PREPARED',manifest:{...clone(f.plan),bundleHash:'9'.repeat(64)},handle:Object.freeze({opaque:true})};
 const adapter={contractVersion:CANDIDATE,
  async describeBinding(){calls.push('describeBinding');return clone(f.binding);},async plan(){calls.push('plan');return f.plan;},
  async prepare(){calls.push('prepare');return prepared;},
  openStage(value,validation,options){calls.push('openStage');const done=deferred();let committed=false,terminal=false;
   const management={adoptionVersion:CANDIDATE,ownerAdapterVersion:'lora-diffusion-diagnostic-adapter/0.1',target:clone(options.target),resourceBinding:clone(f.resourceBinding),sourcePins:clone(f.pins),kernelSha256:f.pins.kernel.sha256,localRevisionBindings:revisions(f.plan),coverage:'PARTIAL',scope:'diagnostic-projection',generationReady:false};
   const envelope={receipt:{contractVersion:f.plan.contractVersion,state:'CONSUMER_APPLIED',...revisions(f.plan),planId:f.plan.planId,registryHash:f.plan.registryHash,sourceSha256:f.plan.sourceSha256,bundleHash:prepared.manifest.bundleHash,coverage:'PARTIAL',scope:'diagnostic-projection',validation:f.nativeValidation,ownership:{kind:'independent-copy',ownerId:'native:exact-copy'},snapshotPublished:false,generationReady:false},management};
   const abort=()=>{if(!terminal){terminal=true;done.reject(Object.assign(Error('Aborted synthetic owner gate'),{code:'SNAPSHOT_ABORTED'}));}};options.signal?.addEventListener('abort',abort,{once:true});
   return {checkpoint:Promise.resolve({validation:f.nativeValidation,management}),completion:done.promise,async commit(){calls.push('nativeCommit');committed=true;terminal=true;done.resolve(envelope);return done.promise;},abort,async rollback(){calls.push('rollback');abort();return {completed:true,native:{restored:committed,scope:'PARTIAL',modelInference:false}};}};
  },async finalize(){calls.push('finalize');return {finalized:true};},async release(){calls.push('release');return {released:true};},async recover(){return {recoveryCompleted:true};},async cancelCurrent(){return {accepted:true};}
 };
 const bridge=createLoraDataPhaseBridge({adapter,referenceSet:f.referenceSet,edgeInput:f.edgeInput,inspection,consumerBinding,readConsumerBinding:()=>clone(consumer),readNativeRevisions:()=>clone(nativeRevisions),readCurrent:()=>clone(current),dataSourceVerification:await sourceProof(),readWeightBiasEvidence:({plan})=>{calls.push('weightBias');const w={evidenceId:'actual:whole-selected-check',referenceId:f.numeric.referenceRef.referenceId,referenceSha256:f.numeric.referenceRef.sha256,planId:plan.planId,sourceSha256:plan.sourceSha256,strength:plan.strength,nativeRegistryHash:native.registryHash,connectionRegistryHash:plan.registryHash,weightComparison:{passed:true,compared:81920},biasComparison:{passed:true,compared:16},weightArtifact:{sha256:'a'.repeat(64)},biasArtifact:{sha256:'b'.repeat(64)}};mutateEvidence?.(w);return w;}});
 const input={selection:f.plan.selection,strength:1,diagnostic:{targets:f.edgeInput.referenceContext.mapping.selectionRegion}};
 let owner;const queue=createInvocationQueue({resourceBindings:[{...f.resourceBinding,cancel:t=>owner.cancelInvocation(t),afterTerminal:(t,o)=>owner.afterInvocation(t,o),release:(t,o)=>owner.releaseInvocation(t,o)}]});
 const manager=createSnapshotManager({managerSessionId:f.planTarget.managerSessionId,afterPublication});
 async function plan(){return bridge.plan(input,{target:f.planTarget});}
 function snapshot(){owner=bridge.createSnapshotOwner({plan:f.plan,validation:{x:new Float32Array(5120),expected:new Float32Array(16),tolerance:{absolute:0,relative:0}},resourceBinding:f.resourceBinding,queue,requestPrefix:'formal-data'});
  const profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'formal-data:control',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:['source:HIGH'],steps:[{stepId:'HIGH',moduleId:'lora:HIGH',operationId:'diagnose',inputBindings:[{portId:'source',artifactRef:'source:HIGH'}],outputBindings:[{portId:'feed',artifactRef:'feed:HIGH'}],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:['diagnostic-projection']};
  const binding={stepId:'HIGH',moduleId:'lora:HIGH',operationId:'diagnose',moduleVersion:'public-fixture/1',nativeBindingRefs:[f.plan.registryHash],artifactRefs:['source:HIGH'],modelProfileRefs:[f.plan.registry.executionProfileId],adapterSelectionRefs:[],localRevisionBindings:revisions(f.plan),sourceRef:clone(f.pins.sdk),nativeBuild:f.plan.buildId,implementationState:'implemented',resourceBinding:clone(f.resourceBinding),isCurrent:()=>true,owner};
  return {profile,bindings:{snapshotId:'formal-data:snapshot',managerRevision:1,artifactManifestRef:'artifacts:formal',evidenceManifestRef:'evidence:formal',requestedScope:{kind:'diagnostic',scopeId:'diagnostic-projection'},steps:[binding]},currentBindings:{HIGH:{localRevisionBindings:revisions(f.plan),resourceBinding:clone(f.resourceBinding)}}};
 }
 return {f,bridge,calls,current,queue,manager,plan,snapshot,setNative:v=>{nativeRevisions=v;},setConsumer:v=>{consumer=v;},consumerBinding,async dispose(){await manager.dispose();await queue.drain();}};
}

test('formal DATA bridge requires the verified delivered source capability before native calls',async()=>{
 const {createLoraDataPhaseBridge}=await import('../../docs/shared/ai-connection/adapters/lora-data-phase-bridge.mjs');
 let calls=0;
 for(const dataSourceVerification of [undefined,{verified:true}])assert.throws(()=>createLoraDataPhaseBridge({dataSourceVerification,adapter:{plan(){calls++;}}}),{code:'LORA_DATA_SOURCE_REQUIRED'});
 assert.equal(calls,0);
});

test('formal DATA preflight evaluates every actual patch and retains original observations',async()=>{
 const f=await fixture();try{await f.plan();const audit=f.bridge.inspect();assert.equal(audit.phase,'preflight');assert.equal(audit.preflight.length,2);assert.equal(audit.decisions.length,2);assert.equal(audit.preflight[1].sourceDtype,'F16');assert.equal(audit.preflight[0].numericDeclarations.observed.native.storageDtype,'F8_E4M3');assert.equal(f.calls.includes('prepare'),false);}finally{await f.dispose();}
});

test('a contradictory original patch observation blocks before preparation',async()=>{
 const f=await fixture({mutateBinding:f=>{f.plan.operations[1].target.dtype='F16';}});try{await assert.rejects(f.plan(),error=>error.code==='NORM_DECLARATION_BLOCKED');assert.equal(f.calls.includes('prepare'),false);}finally{await f.dispose();}
});

test('public SDK revisions and outside consumer namespace are independently required after actual plan',async()=>{
 for(const side of ['native','consumer']){const f=await fixture();try{if(side==='native')f.setNative({...revisions(f.f.plan),localApplicationRevision:99});else f.setConsumer({...f.consumerBinding,revision:'superseded'});await assert.rejects(f.plan(),error=>error.code===`LORA_DATA_${side==='native'?'NATIVE_REVISION_CHANGED':'CONSUMER_CHANGED'}`);assert.equal(f.calls.includes('prepare'),false);}finally{await f.dispose();}}
});

test('actual checkpoint is bound before commit and automatic publication audit consumes real coordinator capability',async()=>{
 const f=await fixture();try{await f.plan();const s=f.snapshot(),token=await f.manager.stageSnapshot(s.profile,s.bindings),checkpoint=f.bridge.inspect();assert.equal(checkpoint.phase,'checkpoint');assert.equal(checkpoint.checkpoint.referenceContext.ownerAdmission.phaseBinding.bound,true);assert.equal(f.calls.includes('nativeCommit'),false);
  const publication=await f.manager.publishSnapshot(token,{currentBindings:s.currentBindings});assert.equal(publication.cleanupRequired,false);const audit=f.bridge.inspect();assert.equal(audit.phase,'postpublication');assert.equal(audit.decisions.every(g=>g.phase==='published'),true);assert.equal(audit.postpublication.referenceContext.ownerAdmission.phase,'postpublication');assert.equal(audit.generationReady,false);
 }finally{await f.dispose();}
});

test('actual validation cannot be rescued after a whole-selected comparison failure',async()=>{
 const f=await fixture({mutateEvidence:w=>{w.biasComparison.compared=15;}});try{await f.plan();const s=f.snapshot();await assert.rejects(f.manager.stageSnapshot(s.profile,s.bindings));assert.equal(f.manager.active,null);assert.equal(f.calls.includes('nativeCommit'),false);assert.equal(f.bridge.inspect().failure!==null,true);}finally{await f.dispose();}
});

test('superseded SDK or outside consumer after checkpoint cannot open the native commit gate',async()=>{
 for(const side of ['native','consumer']){const f=await fixture();try{await f.plan();const s=f.snapshot(),token=await f.manager.stageSnapshot(s.profile,s.bindings);if(side==='native')f.setNative({...revisions(f.f.plan),localInputRevision:2});else f.setConsumer({...f.consumerBinding,namespace:'foreign-namespace'});await assert.rejects(f.manager.publishSnapshot(token,{currentBindings:s.currentBindings}));assert.equal(f.calls.includes('nativeCommit'),false);assert.equal(f.manager.active,null);}finally{await f.dispose();}}
});

test('postpublication audit retry uses the same native receipt without mutable debug history',async()=>{
 let attempts=0;const f=await fixture({afterPublication:()=>{if(++attempts===1)throw Object.assign(Error('controlled global audit fault'),{code:'CONTROLLED_AUDIT_FAULT'});return {verified:true};}});
 try{await f.plan();const s=f.snapshot(),token=await f.manager.stageSnapshot(s.profile,s.bindings),pub=await f.manager.publishSnapshot(token,{currentBindings:s.currentBindings});assert.equal(pub.cleanupRequired,true);assert.equal(f.manager.inspect().state,'RECOVERY_REQUIRED');assert.equal(f.calls.filter(c=>c==='nativeCommit').length,1);
  await f.manager.recover();assert.equal(f.manager.inspect().state,'SNAPSHOT_PUBLISHED');assert.equal(f.bridge.inspect().phase,'postpublication');assert.equal(f.calls.filter(c=>c==='nativeCommit').length,1);assert.equal(f.calls.filter(c=>c==='finalize').length,1);
 }finally{await f.dispose();}
});

// Real File / genuine bounded base receiver for the formal management bridge.
// This harness owns observations and comparisons; management owns admission.
import {createCandidateAdoptedLoraAdapter} from '/management/shared/ai-connection/adapters/adopted-lora.mjs';
import {createLoraDataPhaseBridge} from '/management/shared/ai-connection/adapters/lora-data-phase-bridge.mjs';
import {verifyLoraAdmissionDataSources} from '/management/shared/ai-connection/adapters/lora-data/source.mjs';
import {createSnapshotManager} from '/management/shared/ai-connection/snapshot.mjs';
import {createInvocationQueue} from '/management/shared/ai-connection/queue.mjs';
import {loadReferenceSet} from '/management/shared/ai-connection/reference-loader.mjs';
import {hashCanonical,canonicalize} from '/management/shared/ai-connection/canonical.mjs';
import {createBerniniBlockProvider} from '/diffusion/shared/diffusion-models/lora/base-block.mjs';
import {createDiagnosticConsumer} from '/diffusion/shared/diffusion-models/lora/diagnostic-consumer.mjs';
import {createOrtProjectionStage} from '/diffusion/shared/diffusion-models/ort-bridge/stage.mjs';
import {createLoraV2} from '/lora/shared/inference/lora/sdk-v2.mjs';
import * as ownerExports from '/lora/shared/inference/lora/diffusion-diagnostic-adapter.mjs';
import {sha256Blob} from '/lora/shared/vr180/sha256.mjs';
import {compareAll} from '/lora-tools/ai-connection/joint-browser-cases.mjs';
import {createLoraDataRealEdgeInput} from './lora-data-real-inputs.mjs';

const assert=(condition,message)=>{if(!condition)throw Error(message);};
const clone=structuredClone;
const same=(a,b)=>canonicalize(a)===canonicalize(b);
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),x=>x.toString(16).padStart(2,'0')).join('');
const asBytes=value=>value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
const nativeRevisions=plan=>({sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision});
const currentBindings=value=>Object.fromEntries(value.steps.map(s=>[s.stepId,{localRevisionBindings:s.localRevisionBindings,resourceBinding:s.resourceBinding}]));
async function read(url){const r=await fetch(url);assert(r.ok,'Missing fixed source/reference '+url);return new Uint8Array(await r.arrayBuffer());}
async function load(record,Type){const bytes=await read('/reference/'+record.file);assert(bytes.byteLength===record.bytes&&await sha(bytes)===record.sha256,'Independent reference identity changed');return new Type(bytes.buffer,bytes.byteOffset,bytes.byteLength/Type.BYTES_PER_ELEMENT);}
async function save(name,value){const bytes=asBytes(value),r=await fetch('/artifact/'+name,{method:'POST',body:bytes});assert(r.ok,'Private diagnostic evidence write failed');return {file:name,bytes:bytes.byteLength,sha256:await sha(bytes)};}
async function rejected(action,label){let caught;try{await action();}catch(error){caught=error;}assert(caught,'Expected rejection: '+label);return {rejected:true,code:caught.code??null,error:String(caught),aggregate:caught instanceof AggregateError};}

export async function runLoraDataRealCases({file,artifact,reference,input,sourcePins,referenceInputs}){
 const report={status:'RUNNING',scope:'one real local light/HIGH File and genuine bounded base through formal82b DATA/management bridge',
  realBase:true,realOriginalLoRa:true,completeAdapter:false,generationReady:false,modelInference:false,snapshotPublished:false,
  formalEntry:'createLoraDataPhaseBridge',receiverNormHookLayered:false,legacyBridgeLayered:false,cases:[],lifecycle:[],sourcePins};
 assert(file instanceof File&&input?.pairId==='light'&&input.side==='HIGH','One selected real local light/HIGH File required');
 assert(reference.side==='HIGH'&&artifact?.scope==='PARTIAL','Independent HIGH reference and genuine bounded artifact required');
 const selection={pairId:'light',noise:'high'},refs=reference.cases.filter(c=>c.pairId==='light');
 assert(JSON.stringify(refs.map(r=>r.strength))==='[0,1,-1]'&&refs.every(r=>r.retainedOriginalIdentity.sha256===input.expectedSha256&&r.retainedOriginalIdentity.fileName===file.name),'Selected local original/reference/strength identity mismatch');
 const dataSourceVerification=await verifyLoraAdmissionDataSources({
  admissionBytes:await read('/management/shared/ai-connection/adapters/lora-data/management-admission-inputs.mjs'),
  numericBytes:await read('/management/shared/ai-connection/adapters/lora-data/numeric-declarations.mjs')});
 report.dataSourceVerification=clone(dataSourceVerification);
 const x=await load(reference.activation,Float32Array),expectedBaseWeight=await load(reference.baseWeight,Float32Array),expectedBaseBias=await load(reference.baseBias,Float32Array),expected=new Map();
 for(const ref of refs)expected.set(ref.strength,{ref,weight:await load(ref.weight,Float64Array),bias:await load(ref.bias,Float32Array)});
 const catalogBytes=await read('/management/shared/ai-connection/reference/catalog.v1.json'),catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
 const files=new Map(await Promise.all(catalog.files.map(async f=>[f.path,await read('/management/'+f.path.slice('docs/'.length))])));
 const referenceSet=await loadReferenceSet({catalogBytes,files,expectedCatalogSha256:'14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c'});
 const candidateSet=JSON.parse(new TextDecoder().decode(await read('/management/development/ai-connection/reference-adoption/CANDIDATES.json'))).candidateSet;
 report.checkerSource={catalogSha256:referenceSet.catalogSha256,candidateSetId:candidateSet.candidateSetId,
  phaseIntegration:'formal management plan/preflight; actual bound validate checkpoint; automatic branded afterPublication audit'};
 const managerSessionId='lora-data-real:'+crypto.randomUUID(),resourceBinding={ownerId:'lora-data-real-owner:'+crypto.randomUUID(),bindingId:'lora-data-real-high-q16',resourceGeneration:crypto.randomUUID()};
 let ownerLive=true,sourceLive=true,verifiedSource=null,pendingHash=null,managerRevision=2000,seq=0,base,stage,consumer,sdk,manager,queue,facade,currentOwner,currentApp,observedNativeRevisions=null,restoreInvocation=null;
 const events=[],target=phase=>({managerSessionId,managerRevision,requestId:'lora-data-real:'+phase+':'+(++seq),resourceBinding:clone(resourceBinding)});
 const resourceCurrent=t=>ownerLive&&t.managerSessionId===managerSessionId&&['ownerId','bindingId','resourceGeneration'].every(k=>t.resourceBinding?.[k]===resourceBinding[k]);
 const selectedCurrent=t=>resourceCurrent(t)&&t.managerRevision===managerRevision;
 const source={size:file.size,async read(offset,length,{signal}={}){if(!sourceLive)throw Object.assign(Error('Selected File capability released'),{code:'SOURCE_BINDING_UNAVAILABLE'});signal?.throwIfAborted();assert(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset+length<=file.size&&length<=16*1024*1024,'Invalid original range');const bytes=new Uint8Array(await file.slice(offset,offset+length).arrayBuffer());signal?.throwIfAborted();assert(bytes.length===length,'Truncated original range');return bytes;},
  async hash({signal}={}){if(!sourceLive)throw Object.assign(Error('Selected File capability released'),{code:'SOURCE_BINDING_UNAVAILABLE'});signal?.throwIfAborted();if(!verifiedSource){pendingHash??=sha256Blob(file,{signal});const value=await pendingHash;assert(value===input.expectedSha256,'Actual newly loaded File whole hash differs');verifiedSource=value;}signal?.throwIfAborted();return verifiedSource;}};
 try{
  base=await createBerniniBlockProvider({artifact,side:'HIGH'});const native=base.describe(),identity={modelHash:native.modelHash,graphHash:native.graphHash,registryHash:native.registryHash,side:'HIGH',scope:'PARTIAL'};
  const decodedWeight=await base.baseProvider.readBlock('q.weight',0,81920,identity),decodedBias=await base.baseProvider.readBlock('q.bias',0,16,identity);
  report.baseDecode={weight:compareAll(decodedWeight,expectedBaseWeight,reference.gates.baseDecode),bias:compareAll(decodedBias,expectedBaseBias,reference.gates.baseDecode),weightBytesEqual:await sha(decodedWeight)===reference.baseWeight.sha256,biasBytesEqual:await sha(decodedBias)===reference.baseBias.sha256};
  assert(report.baseDecode.weight.passed&&report.baseDecode.bias.passed&&report.baseDecode.weightBytesEqual&&report.baseDecode.biasBytesEqual,'Genuine bounded base decode differs from independent original reference');
  stage=await createOrtProjectionStage();const nativeConsumer=createDiagnosticConsumer({registry:native,stage,baseProvider:base.baseProvider});
  consumer=Object.freeze({...nativeConsumer,async commit(...args){const r=await nativeConsumer.commit(...args);events.push({phase:'NATIVE_COMMITTED',managerState:manager?.inspect().state??'BASELINE',managerRevision,receipt:clone(r)});return r;},
   async releaseCandidate(candidate){events.push({phase:'NATIVE_CANDIDATE_RELEASED',managerState:manager?.inspect().state??'BASELINE',managerRevision,candidateId:candidate.candidateId});return nativeConsumer.releaseCandidate(candidate);}});
  const baselineContext={...identity,isCurrent:()=>ownerLive},baseline=await consumer.prepareBase(baselineContext);
  assert((await consumer.validate(baseline,{...baselineContext,x,expected:new Float32Array(reference.baseExpectedOutput),tolerance:reference.gates.projection})).valid,'Genuine immutable base baseline validation failed');await consumer.commit(baseline,baselineContext);await consumer.releaseCandidate(baseline);events.length=0;
  const originalSdk=await createLoraV2({sourceFactory:()=>source});
  sdk=Object.freeze({...originalSdk,async plan(...args){const plan=await originalSdk.plan(...args);observedNativeRevisions=nativeRevisions(plan);events.push({phase:'PUBLIC_SDK_REVISIONS_OBSERVED',managerRevision,binding:clone(observedNativeRevisions)});return plan;},
   cancel(){observedNativeRevisions=null;events.push({phase:'PUBLIC_SDK_REVISION_OBSERVATION_INVALIDATED',reason:'cancel',managerRevision});return originalSdk.cancel();},
   async dispose(){observedNativeRevisions=null;return originalSdk.dispose();}});
  const inspection=await sdk.inspect(selection);assert(inspection.state==='SOURCE_INSPECTED'&&inspection.sourceSha256===null,'Header inspection became a whole-file proof');
  await source.hash();report.localInput={fileName:file.name,byteLength:file.size,lastModified:file.lastModified,sourceSha256:verifiedSource,
   fullFileHashVerifiedForThisLoad:true,hashCacheScope:'same captured immutable browser File only',historicalFourOriginalsRequired:false,
   inspection:{state:inspection.state,tensorCount:inspection.tensorCount,integrity:inspection.integrity,sourceSha256:inspection.sourceSha256}};
  facade=createCandidateAdoptedLoraAdapter({ownerExports,sdk,consumer,baseProvider:base.baseProvider,sourcePins,resourceBinding,isOwnerCurrent:resourceCurrent});
  manager=createSnapshotManager({managerSessionId});
  const restoreRecord=t=>{const r=restoreInvocation;if(!r||t.invocationId!==r.queueTarget.invocationId)return null;assert(same(t,r.queueTarget),'Restore callback target changed');return r;};
  queue=createInvocationQueue({resourceBindings:[{...resourceBinding,
   async cancel(t){const r=restoreRecord(t);if(!r)return currentOwner.cancelInvocation(t);if(!r.terminal)await facade.cancelCurrent(r.phaseTarget);await r.rawTask?.catch(()=>{});return {stopped:r.terminal};},
   async afterTerminal(t,o){const r=restoreRecord(t);if(!r)return currentOwner.afterInvocation(t,o);r.afterTerminal=true;events.push({phase:'RESTORE_AFTER_TERMINAL',managerRevision});return {reusable:o.notStarted===true||r.terminal&&!(r.error instanceof AggregateError)};},
   async release(t,o){const r=restoreRecord(t);if(!r)return currentOwner.releaseInvocation(t,o);assert(o.notStarted===true||r.terminal,'Restore released before original terminal');r.released=true;events.push({phase:'RESTORE_RESOURCE_RELEASED',managerRevision});}
  }]});
  const diagnostic={targets:[{key:'diffusion_model.blocks.0.self_attn.q.weight',slice:{startRow:0,rowCount:16}},{key:'diffusion_model.blocks.0.self_attn.q.bias',slice:{startRow:0,rowCount:16}}]};
  let firstPositiveWeightHash,firstPositivePackageHash,firstPlanTarget;
  async function application(strength,label,{cancel=false,failValidation=false}={}){
   managerRevision++;console.log('LORA-DATA-REAL light HIGH strength '+strength+' '+label);
   const e=expected.get(strength),planTarget=target('plan:'+label),binding=await facade.describeBinding();
   const app={label,strength,planTarget,selected:true,weight:new Float32Array(81920),bias:new Float32Array(16),writes:[],plan:null,ownerCandidate:null,
    ownerValidation:null,weightBiasEvidence:null,applicationEnvelope:null,bridge:null};currentApp=app;
   app.consumerBinding={namespace:'manager-selected-native-resource',revision:managerSessionId+':'+managerRevision+':'+resourceBinding.resourceGeneration+':'+label,
    managerSessionId,resourceBinding:clone(resourceBinding)};
   const expectedOutput=new Float32Array(e.ref.expectedOutput),validationX=new Float32Array(x);if(failValidation)validationX[0]+=1024;
   const comparisonBuffers=[x,expectedBaseWeight,expectedBaseBias,decodedWeight,decodedBias,app.weight,app.bias,expectedOutput,validationX,...[...expected.values()].flatMap(v=>[v.weight,v.bias])];
   const capacity=comparisonBuffers.reduce((n,value)=>n+value.byteLength,0);
   const edgeInput=createLoraDataRealEdgeInput({referenceSet,candidateSet,sourcePins,binding,inspection,sourceSha256:verifiedSource,sdkInstanceId:sdk.sdkInstanceId,
    selection,strength,referenceInputs,expectedOutputSha256:await sha(expectedOutput),projectionTolerance:reference.gates.projection,
    executionKernelDigest:'ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd',consumerBinding:app.consumerBinding,
    resourceState:{status:'available',ownerId:resourceBinding.ownerId,requiredBytes:0,budgetBytes:capacity,occupiedBytes:capacity,
      scope:'already owned comparison buffers only; no native/ORT/RSS/device/full-model resource admission'},
    environment:'Chromium real selected File and genuine original bounded base; actual SDK/Hike/ORT Q16 diagnostic',artifactId:'lora-data-real:'+label+':selected-weight:'+crypto.randomUUID()});
   const readCurrent=()=>({activeBindings:Object.fromEntries(Object.entries(edgeInput.activeBindings).map(([side,b])=>[side,{...clone(b),valid:selectedCurrent(planTarget)&&app.selected}])),resourceState:clone(edgeInput.resourceState)});
   const capturedAdapter=Object.freeze({...facade,async prepare(plan,options){return facade.prepare(plan,{...options,onBlock:block=>{
    assert(['q.weight','q.bias'].includes(block.weightId),'Unexpected prepared binding');(block.weightId==='q.weight'?app.weight:app.bias).set(block.data,block.offset);
    app.writes.push({weightId:block.weightId,offset:block.offset,count:block.count,sha256:block.sha256,fullShape:block.fullShape,slice:block.slice,binding:block.binding});
   }});},openStage(...args){const opened=facade.openStage(...args);void opened.completion.then(value=>{app.applicationEnvelope=value;},()=>{});return opened;},
    async finalize(...args){events.push({phase:'OWNER_FINALIZE',label,managerState:manager.inspect().state,managerRevision});return facade.finalize(...args);}});
   const bridge=createLoraDataPhaseBridge({adapter:capturedAdapter,referenceSet,edgeInput,inspection,dataSourceVerification,
    consumerBinding:app.consumerBinding,readConsumerBinding:()=>clone(currentApp.consumerBinding),
    readNativeRevisions:()=>observedNativeRevisions===null?null:clone(observedNativeRevisions),readCurrent,
    readWeightBiasEvidence:async({plan,ownerValidation,ownerState})=>{
     assert(ownerValidation.valid&&ownerState.originalTerminal===false,'Comparison must occur at the actual native checkpoint');app.ownerValidation=ownerValidation;
     assert(app.writes.filter(b=>b.weightId==='q.weight').reduce((n,b)=>n+b.count,0)===81920&&app.writes.filter(b=>b.weightId==='q.bias').reduce((n,b)=>n+b.count,0)===16,'Full selected weight/bias was not prepared');
     const weightComparison=compareAll(app.weight,e.weight,reference.gates.weight),biasComparison=compareAll(app.bias,e.bias,reference.gates.bias);
     assert(weightComparison.passed&&biasComparison.passed,'Every real prepared weight/bias must pass the independent fixed gate');
     const weightArtifact=await save(label+'-weight.f32',app.weight),biasArtifact=await save(label+'-bias.f32',app.bias);
     return app.weightBiasEvidence={evidenceId:'lora-data-real:all-selected:'+plan.planId,referenceId:referenceInputs.referenceIdentity.referenceId,
      referenceSha256:referenceInputs.referenceIdentity.sha256,planId:plan.planId,sourceSha256:plan.sourceSha256,strength:plan.strength,
      nativeRegistryHash:binding.owner.nativeRegistryHash,connectionRegistryHash:plan.registryHash,weightComparison,biasComparison,weightArtifact,biasArtifact};
    }});app.bridge=bridge;
   const plan=app.plan=await bridge.plan({selection,strength,diagnostic},{target:planTarget});
   assert(plan.sourceSha256===verifiedSource&&plan.coverage==='PARTIAL'&&!plan.completeAdapter&&!plan.generationReady&&plan.excludedTargets.length===1050,'Actual formal plan/source/scope changed');
   const nativeOwner=bridge.createSnapshotOwner({plan,validation:{x:validationX,expected:expectedOutput,tolerance:reference.gates.projection},resourceBinding,queue,requestPrefix:'lora-data-real:'+label});
   const owner=Object.freeze({...nativeOwner,async prepare(c){const prepared=await nativeOwner.prepare(c);app.ownerCandidate=prepared.candidate;return prepared;}});currentOwner=owner;
   const profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'lora-data-real-light-high',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:['source:actual-light-HIGH'],
    steps:[{stepId:'HIGH',moduleId:'native-lora:HIGH',operationId:'diagnose',inputBindings:[{portId:'source',artifactRef:'source:actual-light-HIGH'}],outputBindings:[{portId:'projection',artifactRef:'lora-data-real:output'}],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:['diagnostic-projection']};
   const selected={snapshotId:'lora-data-real:'+label+':'+crypto.randomUUID(),managerRevision,artifactManifestRef:'artifacts:lora-data-real:'+label,evidenceManifestRef:'evidence:lora-data-real:'+label,
    requestedScope:{kind:'diagnostic',scopeId:'diagnostic-projection'},steps:[{stepId:'HIGH',moduleId:'native-lora:HIGH',operationId:'diagnose',moduleVersion:sdk.contractVersion,
      nativeBindingRefs:[binding.owner.nativeRegistryHash,plan.registryHash],artifactRefs:['source:actual-light-HIGH'],modelProfileRefs:[native.executionProfileId],adapterSelectionRefs:[],
      localRevisionBindings:nativeRevisions(plan),sourceRef:clone(sourcePins.sdk),nativeBuild:sourcePins.kernel.sha256,implementationState:'implemented',resourceBinding,
      isCurrent:()=>ownerLive&&app.selected,owner}]};
   const prior=await consumer.run({x}),priorHash=await sha(prior.output),previousSnapshot=manager.active;
   if(failValidation){const failure=await rejected(()=>manager.stageSnapshot(profile,selected),'controlled diagnostic activation mismatch');
    assert(failure.code==='NATIVE_VALIDATION_MISMATCH','Native validation failed at an unintended boundary');await queue.drain();await manager.recover();await sdk.recover();
    const after=await consumer.run({x});assert(await sha(after.output)===priorHash&&manager.active?.snapshotId===previousSnapshot?.snapshotId&&!manager.inspect().selectionCurrent,'Native validation failure did not preserve prior feed and invalidate selection');
    app.selected=false;report.lifecycle.push({kind:'native-validation-failure',control:'validation activation copy[0] +1024; independent expected/gate unchanged',...failure,
      priorFeedUnchanged:true,snapshotUncurrent:true,actualOutput:[...after.output],preparedBlocks:clone(app.writes),admission:bridge.inspect(),manager:manager.inspect(),queue:queue.inspect()});return null;}
   const token=await manager.stageSnapshot(profile,selected);assert(manager.inspect().state==='STAGED'&&app.weightBiasEvidence&&app.ownerCandidate,'Formal actual validation checkpoint did not stage');
   const before=await consumer.run({x});assert(await sha(before.output)===priorHash,'Actual feed changed before explicit publication');
   if(cancel){const invocation=owner.invocationTarget(app.ownerCandidate),cancelReply=await queue.cancelInvocation(invocation.id,invocation.target);
    assert(cancelReply.stopConfirmed&&cancelReply.originalTerminal&&cancelReply.resourceReleased&&cancelReply.reusable&&!cancelReply.quarantined,'Cancel barrier did not confirm original terminal/release');
    await manager.abortSnapshot(token);await manager.recover();await sdk.recover();await queue.drain();app.selected=false;
    const after=await consumer.run({x});assert(await sha(after.output)===priorHash&&manager.active?.snapshotId===previousSnapshot?.snapshotId&&!manager.inspect().selectionCurrent,'Cancel changed prior active feed or retained current snapshot');
    report.lifecycle.push({kind:'formal-native-checkpoint-cancel',target:invocation.target,cancelReply,actualOutput:[...after.output],priorFeedUnchanged:true,snapshotUncurrent:true,
      weightBiasEvidence:clone(app.weightBiasEvidence),admission:bridge.inspect(),manager:manager.inspect(),queue:queue.inspect()});return null;}
   const publication=await manager.publishSnapshot(token,{currentBindings:currentBindings(selected)});await queue.drain();
   const ownerState=owner.inspect(app.ownerCandidate),admission=bridge.inspect();
   assert(publication.state==='SNAPSHOT_PUBLISHED'&&!publication.cleanupRequired&&!publication.generationReady&&manager.inspect().selectionCurrent,'Formal publication failed or requires recovery');
   assert(admission.phase==='postpublication'&&admission.failure===null&&admission.decisions.every(g=>g.phase==='published'&&!g.failure),'Automatic formal postpublication audit did not complete');
   assert(ownerState.published&&ownerState.originalTerminal&&ownerState.queueReleased&&ownerState.preparedReleased&&ownerState.stageEnvelope===app.applicationEnvelope,'Native stage/finalization identity changed');
   assert(app.applicationEnvelope.receipt.snapshotPublished===false&&app.applicationEnvelope.receipt.generationReady===false&&publication.nativeStates[0].ownership.kind==='independent-copy'
      &&publication.nativeStates[0].ownership.ownerId===app.applicationEnvelope.receipt.ownership.ownerId,'Publication renamed native copy ownership');
   const {snapshotHash,...body}=publication.snapshot;assert(snapshotHash===await hashCanonical(body)&&ownerState.target.snapshotHash===snapshotHash,'Snapshot hash/body mismatch');
   const output=await facade.run({x},{target:target('run:'+label)}),outputComparison=compareAll(output.output,expectedOutput,reference.gates.projection);assert(outputComparison.passed,'Formal postpublication output differs from independent fixed reference');
   const w=app.weightBiasEvidence,packageHash=app.applicationEnvelope.receipt.validation.evidence.nativeReceipt.packageHash;
   if(strength===1){if(firstPositiveWeightHash)assert(firstPositiveWeightHash===w.weightArtifact.sha256&&firstPositivePackageHash===packageHash,'Reapply accumulated over applied weights');else{firstPositiveWeightHash=w.weightArtifact.sha256;firstPositivePackageHash=packageHash;}}
   const finalizers=events.filter(e=>e.managerRevision===managerRevision&&['OWNER_FINALIZE','NATIVE_CANDIDATE_RELEASED'].includes(e.phase));assert(finalizers.length>=2&&finalizers.every(e=>e.managerState==='SNAPSHOT_PUBLISHED'),'History/prepared finalized before publication');
   const scope={coverage:'PARTIAL',completeAdapter:false,sourceSha256:plan.sourceSha256,selection,fullShape:[5120,5120],diagnostic,includedPatches:plan.includedPatches,excludedTargets:plan.excludedTargets,excludedRegions:plan.excludedRegions};
   const record={id:label,strength,sourceSha256:plan.sourceSha256,planId:plan.planId,...nativeRevisions(plan),managerRevision,consumerEpoch:output.epoch,
    weightComparison:w.weightComparison,biasComparison:w.biasComparison,weightArtifact:w.weightArtifact,biasArtifact:w.biasArtifact,
    outputComparison,actualOutput:[...output.output],expectedOutput:[...expectedOutput],outputArtifact:await save(label+'-output.f32',output.output),scopeArtifact:await save(label+'-scope.json',new TextEncoder().encode(JSON.stringify(scope))),
    ownerValidation:app.ownerValidation,application:app.applicationEnvelope,publication,ownerState,admission,queueReports:queue.inspect().invocations,
    preparedReleasedBeforeRun:true,candidateHistoryReleasedBeforeRun:true,formalBridgeAdmitted:true};
   report.cases.push(record);report.snapshotPublished=true;report.registryBindings={nativeRegistryHash:native.registryHash,connectionRegistryHash:plan.registryHash,nativeRegistry:native,connectionRegistry:facade.registry};
   firstPlanTarget??=clone(planTarget);return record;
  }
  await application(0,'initial-zero');await application(1,'initial-one');await application(-1,'initial-negative');await application(1,'reapply-one');
  const stale=await rejected(()=>facade.run({x},{target:{...firstPlanTarget,requestId:'lora-data-real:old:'+crypto.randomUUID()}}),'old manager request');assert(['TARGET_MISMATCH','STALE_OWNER'].includes(stale.code),'Old request refused for wrong reason');report.lifecycle.push({kind:'old-manager-request',...stale});
  await application(-1,'validation-failure',{failValidation:true});await application(1,'validation-recovery');await application(-1,'cancel-at-checkpoint',{cancel:true});await application(1,'cancel-recovery');
  const beforeRelease=await facade.run({x},{target:target('before-source-release')});sourceLive=false;const sourceReleased=await rejected(()=>source.hash(),'released File capability');assert(sourceReleased.code==='SOURCE_BINDING_UNAVAILABLE','Source release refused for unintended reason');
  const afterRelease=await facade.run({x},{target:target('after-source-release')});assert(await sha(afterRelease.output)===await sha(beforeRelease.output),'Independent active copy borrowed source/prepared bytes');report.lifecycle.push({kind:'source-release-independent-copy',...sourceReleased,copySurvives:true,actualOutput:[...afterRelease.output]});
  const publishedSnapshot=manager.active,app=currentApp,plan=app.plan,step=publishedSnapshot.stepBindings.find(s=>s.stepId==='HIGH'),local=nativeRevisions(plan),phaseTarget=target('restore-base');
  assert(same(local,step.localRevisionBindings),'Restore must name the actual published native tuple');app.selected=false;
  const id='lora-data-real:restore:'+crypto.randomUUID(),queueTarget={invocationId:id,bindingId:resourceBinding.bindingId,ownerId:resourceBinding.ownerId,resourceGeneration:resourceBinding.resourceGeneration,
    requestId:'lora-data-real:restore-queue:'+crypto.randomUUID(),revision:managerRevision,activeToken:'lora-data-real:restore-token:'+crypto.randomUUID()};
  const r=restoreInvocation={queueTarget,phaseTarget,terminal:false,afterTerminal:false,released:false,error:null,rawTask:null};
  const restoreCurrent=t=>selectedCurrent(t)&&currentApp===app&&manager.active?.snapshotId===publishedSnapshot.snapshotId&&same(observedNativeRevisions,local);
  const restore=await queue.enqueue({id,requestId:queueTarget.requestId,ownerId:queueTarget.ownerId,resourceBinding:queueTarget.bindingId,resourceGeneration:queueTarget.resourceGeneration,revision:queueTarget.revision,activeToken:queueTarget.activeToken},({signal,target:actual})=>{
    assert(same(actual,queueTarget),'Restore dispatch target changed');r.rawTask=facade.restoreBase({x,expected:new Float32Array(reference.baseExpectedOutput),tolerance:reference.gates.projection,signal},{target:phaseTarget,isCurrent:restoreCurrent})
      .then(value=>{r.receipt=value;return value;},error=>{r.error=error;throw error;}).finally(()=>{r.terminal=true;events.push({phase:'RESTORE_NATIVE_TERMINAL',managerRevision});});return r.rawTask;});
  const restored=await consumer.run({x}),comparison=compareAll(restored.output,new Float32Array(reference.baseExpectedOutput),reference.gates.projection),restoreQueue=queue.inspect().invocations.find(i=>i.id===id);
  assert(comparison.passed&&!manager.inspect().selectionCurrent&&r.terminal&&r.afterTerminal&&r.released&&restoreQueue.originalTerminal&&restoreQueue.resourceReleased&&restoreQueue.reusable,'Queued immutable-base restore did not finish exact lifecycle');
  report.lifecycle.push({kind:'immutable-base-restore',receipt:restore,management:{target:phaseTarget,queueTarget,localRevisionBindings:local,snapshotRef:{snapshotId:publishedSnapshot.snapshotId,snapshotHash:publishedSnapshot.snapshotHash},snapshotPublished:false,generationReady:false},
    queue:restoreQueue,comparison,actualOutput:[...restored.output],snapshotUncurrent:true,originalTerminal:r.terminal,afterTerminal:r.afterTerminal,resourceReleased:r.released});
  report.ownership={mode:'independent-copy',sourceReleased:true,preparedReleased:true,nativeLease:'N/A',nativeOwnerIds:report.cases.map(c=>c.application.receipt.ownership.ownerId)};
  report.executionResources={sdkKernelInfo:sdk.kernelInfo,baseHike:base.stats().hike,actualNativeStageEvidence:report.cases.at(-1).application.receipt.validation.evidence.nativeReceipt.evidence,
    totalOSPeakBytes:null,totalOSPeakReason:'not measured; declared comparison-buffer capacity is a bounded subset'};
  report.snapshotTrace=manager.inspect();report.queueTrace=queue.inspect();report.baseProviderStats=base.stats();report.events=events;
  report.formalManagementAdmissionScope='selected light/HIGH genuine-base Q16 PARTIAL diagnostic only';report.currentLiveAdmission=false;
  report.status='PASS_LORA_DATA_REAL_BASE_PARTIAL_SNAPSHOT';return report;
 }catch(error){report.status='FAIL';report.error=String(error.stack??error);report.events=events;report.snapshotTrace=manager?.inspect();report.queueTrace=queue?.inspect();return report;}
 finally{try{await manager?.recover();await manager?.dispose();}catch(error){report.cleanupError=String(error);report.status='FAIL';}
  ownerLive=false;await queue?.drain();await queue?.dispose();await sdk?.dispose();await consumer?.dispose();await stage?.dispose();base?.dispose();
  report.cleanup={managerDisposed:!report.cleanupError,queueTerminal:true,sdkDisposed:true,consumerDisposed:true,stageDisposed:true,baseDisposed:true};report.currentLiveAdmission=false;}
}

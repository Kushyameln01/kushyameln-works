import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';
import {createSnapshotManager} from '../../docs/shared/ai-connection/snapshot.mjs';
import {createInvocationQueue} from '../../docs/shared/ai-connection/queue.mjs';
import {verifyLoraAdmissionDataSources} from '../../docs/shared/ai-connection/adapters/lora-data/source.mjs';
import {nativeFixture,controlSource} from './run-snapshot-native-lora.mjs';
import {normEdgeFixture} from './norm-execution-fixtures.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const REPOSITORY='Kushyameln01/kushyameln-works';
const DATA_COMMIT='82b21f09cb63926543181b16f0e97ebc6b9fa6be';
const DATA_FILES=['docs/shared/inference/lora/management-admission-inputs.mjs','docs/shared/inference/lora/numeric-declarations.mjs'];
const KEY='diffusion_model.blocks.0.self_attn.q';
const MANAGER='manager:82b-joint';
const SIDES=['HIGH','LOW'];
const EXPECTED=new Map([[1,{weight:1.5,bias:2.125,output:3.625}],[-1,{weight:.5,bias:1.875,output:2.375}]]);
const clone=structuredClone;
const includesError=(error,text)=>String(error?.message).includes(text)||(error instanceof AggregateError&&[...error.errors].some(e=>includesError(e,text)));
const currentBindings=b=>Object.fromEntries(b.steps.map(s=>[s.stepId,{localRevisionBindings:s.localRevisionBindings,resourceBinding:s.resourceBinding}]));
const activeCount=q=>q.inspect().groups.reduce((n,g)=>n+(g.activeInvocationId===null?0:1)+g.queued.length,0);

async function dataSourceProof(admissionRoot){
 assert.ok(admissionRoot,'Explicit owner DATA source root is required');
 const deployed={};
 const proof=await Promise.all(DATA_FILES.map(async(path,index)=>{
  const bytes=new Uint8Array(await readFile(resolve(admissionRoot,path))),git=spawnSync('git',['-C',ROOT,'show',`${DATA_COMMIT}:${path}`],{maxBuffer:1024*1024});
  assert.equal(git.status,0,'The fixed owner DATA Git object must be available');
  assert.deepEqual(Buffer.from(bytes),git.stdout,'The original DATA bytes must equal the fixed full Git object');
  const deploymentPath='docs/shared/ai-connection/adapters/lora-data/'+path.split('/').at(-1),deploymentBytes=new Uint8Array(await readFile(resolve(ROOT,deploymentPath)));
  assert.deepEqual(deploymentBytes,bytes,'The management deployment must preserve the exact fixed owner module bytes');
  deployed[index===0?'admissionBytes':'numericBytes']=deploymentBytes;
  return {repository:REPOSITORY,commit:DATA_COMMIT,path,byteLength:bytes.length,sha256:await sha256Bytes(bytes),gitObjectMatched:true,sha256Matched:true,deploymentPath,deploymentBytesMatched:true};
 }));
 return {proof,verification:await verifyLoraAdmissionDataSources(deployed)};
}

function jointProfile(){return {contractVersion:'works-module-contract/1.0-draft.1',profileId:'82b:joint-q16-control',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:SIDES.map(s=>'source:'+s),steps:SIDES.map(side=>({stepId:side,moduleId:'native-lora:'+side,operationId:'diagnose',inputBindings:[{portId:'source',artifactRef:'source:'+side}],outputBindings:[{portId:'feed',artifactRef:'feed:'+side}],adapterRefs:[],resourceGroupRefs:[]})),requiredEvidenceScopes:['diagnostic-projection']};}

async function edgeDeclarations(f,s,revision,strength){
 const declaration=await normEdgeFixture(),q=declaration.edgeInput,observed=s.consumer.describe(),binding=await s.adapter.describeBinding(),expected=EXPECTED.get(strength);
 const executionKernel=f.sourceProof.find(p=>p.commit===f.pins.diffusion.commit&&p.path==='docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm');
 assert.ok(executionKernel);const output=new Float32Array(16).fill(expected.output),outputSha256=await sha256Bytes(new Uint8Array(output.buffer));
 const gate={scope:'synthetic-native-control',tolerance:{absolute:0,relative:0},expectedOutputSha256:outputSha256},gateSha256=await sha256Bytes(new TextEncoder().encode(JSON.stringify(gate)));
 const numeric=q.referenceContext.numericRequirements[0];
 Object.assign(numeric,{kernelDigest:executionKernel.sha256,gateRef:{...numeric.gateRef,sha256:gateSha256,gateId:'owner:exact-82b-joint-control',tolerance:gate.tolerance},referenceRef:{...numeric.referenceRef,sha256:outputSha256,referenceId:`82b:joint:${revision}:${s.side}:reference`,expectedOutputSha256:outputSha256}});
 q.producerPort.nativeAPI.build=s.sdk.kernelInfo.wasmSha256;q.consumerPort.nativeAPI.build=executionKernel.sha256;
 q.producerPort.profileRef=observed.executionProfileId;q.consumerPort.profileRef=observed.executionProfileId;q.artifact.profileRef=observed.executionProfileId;
 q.artifact.artifactId=`82b:joint:${revision}:${s.side}:selected-weight`;
 q.referenceContext.environment='node actual pinned SDK/LoRAHike/ORT/Hike; synthetic BF16 source and immutable F32 base';
 Object.assign(q.referenceContext.nativeDeclarations.producer,{loaderPolicyId:s.adapter.registry.loaderPolicyId,sourceDtype:s.inspection.tensors[KEY+'.lora_down.weight'].dtype,baseDtype:'F32',outputDtype:'F32',layout:'row-major',targetRank:2,strength,sourceHash:s.sourceSha256});
 Object.assign(q.referenceContext.nativeDeclarations.consumer,{nativeProfileId:observed.executionProfileId,graphSHA256:observed.graphHash,kernelDigest:executionKernel.sha256});
 const selectionRegion=observed.targets.map(t=>({key:t.key,slice:{startRow:t.transform.rowStart,rowCount:t.transform.rowCount}})),weight=observed.targets.find(t=>t.weightId==='q.weight');
 Object.assign(q.referenceContext.mapping,{nativeRegistryHash:binding.owner.nativeRegistryHash,connectionRegistryHash:binding.owner.connectionRegistryHash,selectionRegion,fullShape:clone(weight.fullShape),sourceHash:s.sourceSha256,ownerBinding:{nativeRegistryHash:binding.owner.nativeRegistryHash,connectionRegistryHash:binding.owner.connectionRegistryHash},planBinding:{selectionRegion:clone(selectionRegion),fullShape:clone(weight.fullShape),sourceHash:s.sourceSha256}});
 Object.assign(q.referenceContext.evidenceTarget,{artifactRef:q.artifact.artifactId,profileRef:observed.executionProfileId,referenceId:numeric.referenceRef.referenceId});
 q.resourceState={status:'available',ownerId:s.resourceBinding.ownerId,requiredBytes:327744,budgetBytes:1048576,occupiedBytes:0};
 const current={activeBindings:clone(q.activeBindings),resourceState:clone(q.resourceState)};
 return {referenceSet:declaration.referenceSet,edgeInput:q,current,selectionRegion,expected:output,tolerance:gate.tolerance,binding};
}

/** A new formal-bridge run over synthetic source/base controls. Native SDK,
 * LoRA/Hike, ORT/Hike and consumer are the pinned originals. No real-model or
 * original-file numerical acceptance is added by this runner. */
export async function runLoraDataJointNativeCase({loraRoot,diffusionRoot,admissionRoot,scenario='low-failure'}={}){
 assert.ok(['low-failure','postpublication-audit-failure'].includes(scenario),'Explicit supported joint scenario required');
 const [{createLoraDataPhaseBridge},f,dataSources]=await Promise.all([import('../../docs/shared/ai-connection/adapters/lora-data-phase-bridge.mjs'),nativeFixture({loraRoot,diffusionRoot}),dataSourceProof(admissionRoot)]),ownerDataSourceProof=dataSources.proof;
 assert.equal(typeof createLoraDataPhaseBridge,'function');assert.equal(f.sourceProof.length,23);
 const sides={},events=[],result={schemaVersion:'works-lora-data-joint-native/0.1',scenario,state:'PASS',coverage:'PARTIAL',modelInference:false,realBaseVerified:false,generationReady:false,scope:'synthetic BF16 source and immutable F32 base; actual pinned SDK/LoRAHike/ORT/Hike; formal 82b DATA bridge; joint diagnostic-only',nativeSourceProof:f.sourceProof,ownerDataSourceProof};
 let manager;
 async function feeds(){const out={};for(const side of SIDES){const s=sides[side],r=await s.consumer.run({x:s.x});assert.equal(r.scope,'PARTIAL');assert.equal(r.modelInference,false);assert.deepEqual(r.evidence.executionProviders,['wasm']);assert.equal(r.output.every(v=>v===r.output[0]),true);out[side]=r.output[0];s.runtimeEvidence=clone(r.evidence);}return out;}
 try{
  for(const side of SIDES){
   const native=clone(f.registries.find(r=>r.side===side));for(const t of native.targets){t.transform.rowStart=0;t.source.elementOffset=0;}native.registryHash=f.diagnosticRegistryHash(native);
   const baseProvider={readBlock:async(id,o,n)=>Float32Array.from({length:n},(_,i)=>id==='q.bias'?2:(o+i)%5120===0?1:0)},stage=await f.createOrtProjectionStage({hikeBytes:f.projectionHikeBytes}),consumer=f.createDiagnosticConsumer({registry:native,stage,baseProvider});
   const source=controlSource(),kernel=await f.createKernel({wasmBytes:f.wasmBytes}),nativeSdk=await f.createLoraV2({sourceFactory:()=>source,kernel});
   const resourceBinding={ownerId:'owner:82b-joint:'+side,bindingId:'resource:82b-joint:'+side,resourceGeneration:'generation:82b-joint:'+side};
   const s={side,native,baseProvider,stage,consumer,kernel,resourceBinding,sourceSha256:await source.hash(),revision:0,owner:null,history:[],selectedValuesCompared:0,failCommit:false,nativeRevisions:null};sides[side]=s;
   const sdk=Object.freeze({...nativeSdk,async plan(...args){const plan=await nativeSdk.plan(...args);s.nativeRevisions={sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision};return plan;},cancel(){s.nativeRevisions=null;return nativeSdk.cancel();},async dispose(){s.nativeRevisions=null;return nativeSdk.dispose();}});s.sdk=sdk;
   s.inspection=await sdk.inspect({pairId:'light',noise:side.toLowerCase()});assert.equal(s.inspection.integrity,'header-only');assert.equal(s.inspection.tensorCount,3);
   const x=new Float32Array(5120);x[0]=1;s.x=x;
   const context={modelHash:native.modelHash,graphHash:native.graphHash,registryHash:native.registryHash,side,scope:'PARTIAL',isCurrent:()=>true},base=await consumer.prepareBase(context);
   assert.equal((await consumer.validate(base,{...context,x,expected:new Float32Array(16).fill(3),tolerance:{absolute:0,relative:0}})).valid,true);await consumer.commit(base,context);await consumer.releaseCandidate(base);
   const observedConsumer={...consumer,async commit(...args){
    if(s.failCommit){events.push({side,phase:'NEW_LOW_CONTROLLED_COMMIT_FAILURE'});throw Object.assign(Error('controlled LOW native commit failure'),{code:'CONTROLLED_LOW_COMMIT'});}
    const receipt=await consumer.commit(...args);events.push({side,phase:s.revision===2?'NEW_HIGH_NATIVE_COMMITTED':'OLD_NATIVE_COMMITTED',receipt:clone(receipt)});
    if(s.revision===2&&side==='HIGH')result.feedAfterHighCommit=await feeds();return receipt;
   },async rollback(...args){const receipt=await consumer.rollback(...args);events.push({side,phase:s.revision===2&&side==='HIGH'?'NEW_HIGH_NATIVE_ROLLED_BACK':'NATIVE_ROLLED_BACK',receipt:clone(receipt)});return receipt;}};
   const sourcePins=Object.fromEntries(Object.entries(f.pins).map(([k,p])=>[k,{repository:REPOSITORY,...clone(p)}]));
   s.adapter=f.createCandidateAdoptedLoraAdapter({ownerExports:f.ownerExports,sdk,consumer:observedConsumer,baseProvider,sourcePins,resourceBinding,isOwnerCurrent:()=>true});
   s.observedAdapter={...s.adapter,async prepare(plan,options){const r=s.history.find(h=>h.plan===plan);assert.ok(r);const expected=EXPECTED.get(plan.strength);return s.adapter.prepare(plan,{...options,onBlock:async block=>{
    const destination=block.weightId==='q.weight'?r.weight:block.weightId==='q.bias'?r.bias:null;assert.ok(destination,'Only explicitly selected q weight and bias are compared');
    for(let i=0;i<block.count;i++){const value=block.weightId==='q.bias'?expected.bias:(block.offset+i)%5120===0?expected.weight:0;assert.equal(block.data[i],value,'Every prepared native value matches independent exact BF16 control constants');}
    destination.set(block.data,block.offset);r.compared[block.weightId]+=block.count;s.selectedValuesCompared+=block.count;if(options.onBlock)await options.onBlock(block);
   }});}};
   s.queue=createInvocationQueue({resourceBindings:[{...resourceBinding,cancel:t=>s.owner.cancelInvocation(t),afterTerminal:(t,o)=>s.owner.afterInvocation(t,o),release:(t,o)=>s.owner.releaseInvocation(t,o)}]});
  }
  manager=createSnapshotManager({managerSessionId:MANAGER});
  async function selection(revision,strength){
   const steps=[],managerRevision=revision===1?41:73;
   for(const side of SIDES){
    const s=sides[side];s.revision=revision;
    const d=await edgeDeclarations(f,s,revision,strength),consumerBinding={namespace:'outside-consumer:'+side,revision:String(revision),managerSessionId:MANAGER,resourceBinding:clone(s.resourceBinding)};
    const r={revision,strength,d,consumerBinding,selectedConsumerBinding:clone(consumerBinding),weight:new Float32Array(81920),bias:new Float32Array(16),compared:{'q.weight':0,'q.bias':0},candidate:null,context:null};s.history.push(r);
    const bridge=createLoraDataPhaseBridge({adapter:s.observedAdapter,referenceSet:d.referenceSet,edgeInput:d.edgeInput,dataSourceVerification:dataSources.verification,readCurrent:()=>clone(d.current),inspection:s.inspection,consumerBinding,readConsumerBinding:()=>clone(consumerBinding),readNativeRevisions:()=>clone(s.nativeRevisions),readWeightBiasEvidence:async({plan,ownerValidation,ownerState})=>{
     assert.equal(ownerValidation.valid,true);assert.equal(ownerValidation.nativeValidation.valid,true);assert.equal(ownerState.originalTerminal,false);
     assert.deepEqual(r.compared,{'q.weight':81920,'q.bias':16});
     const evidence={evidenceId:`82b:joint:${revision}:${side}:all-selected-merge`,referenceId:d.edgeInput.referenceContext.evidenceTarget.referenceId,referenceSha256:d.edgeInput.referenceContext.numericRequirements[0].referenceRef.sha256,planId:plan.planId,sourceSha256:plan.sourceSha256,strength:plan.strength,nativeRegistryHash:d.binding.owner.nativeRegistryHash,connectionRegistryHash:d.binding.owner.connectionRegistryHash,weightComparison:{passed:true,compared:r.compared['q.weight']},biasComparison:{passed:true,compared:r.compared['q.bias']},weightArtifact:{sha256:await sha256Bytes(new Uint8Array(r.weight.buffer))},biasArtifact:{sha256:await sha256Bytes(new Uint8Array(r.bias.buffer))}};r.weightBiasEvidence=clone(evidence);return evidence;
    }});r.bridge=bridge;
    const planTarget={managerSessionId:MANAGER,managerRevision,requestId:`request:82b-joint:${revision}:${side}:plan`,resourceBinding:s.resourceBinding};
    r.plan=await bridge.plan({selection:{pairId:'light',noise:side.toLowerCase()},strength,diagnostic:{targets:d.selectionRegion}},{target:planTarget});
    assert.equal(r.plan.sdkInstanceId,s.sdk.sdkInstanceId);assert.equal(r.plan.localInputRevision,revision);assert.equal(r.plan.localApplicationRevision,revision);
    r.owner=bridge.createSnapshotOwner({plan:r.plan,validation:{x:s.x,expected:d.expected,tolerance:d.tolerance},resourceBinding:s.resourceBinding,queue:s.queue,requestPrefix:`82b-joint:${revision}:${side}`});s.owner=r.owner;
    const owner={...r.owner,async prepare(context){const p=await r.owner.prepare(context);r.candidate=p.candidate;r.context=context;return p;},async published(candidate,context){
     const reply=await r.owner.published(candidate,context);
     if(scenario==='postpublication-audit-failure'&&side==='HIGH'&&revision===1){
      const actual=r.owner.inspect(candidate);assert.equal(actual.published,true);assert.equal(actual.preparedReleased,true);assert.equal(actual.publicationCommitted,true);
      result.finalizeBeforeAuditFault=clone(actual);consumerBinding.revision='stale-after-finalize';events.push({side,phase:'OUTSIDE_CONSUMER_CHANGED_AFTER_PUBLICATION'});
     }
     return reply;
    },async afterPublication(...args){try{return await r.owner.afterPublication(...args);}catch(error){r.auditError??={name:error.name,code:error.code??null,message:error.message};events.push({side,phase:'POSTPUBLICATION_AUDIT_REJECTED',error:clone(r.auditError)});throw error;}}};
    steps.push({stepId:side,moduleId:'native-lora:'+side,operationId:'diagnose',moduleVersion:s.sdk.contractVersion,nativeBindingRefs:[d.binding.owner.nativeRegistryHash,d.binding.owner.connectionRegistryHash],artifactRefs:['source:'+side],modelProfileRefs:[s.native.executionProfileId],adapterSelectionRefs:[],localRevisionBindings:{sdkInstanceId:r.plan.sdkInstanceId,localInputRevision:r.plan.localInputRevision,localApplicationRevision:r.plan.localApplicationRevision},sourceRef:clone(d.edgeInput.producerPort.sourceRef),nativeBuild:s.sdk.kernelInfo.wasmSha256,implementationState:'implemented',resourceBinding:s.resourceBinding,isCurrent:()=>s.history.at(-1)===r,owner});
   }
   return {snapshotId:'snapshot:82b-joint:'+revision,managerRevision,artifactManifestRef:'artifacts:82b-joint:'+revision,evidenceManifestRef:'evidence:82b-joint:'+revision,requestedScope:{kind:'diagnostic',scopeId:'diagnostic-projection'},steps};
  }
  const old=await selection(1,1),oldToken=await manager.stageSnapshot(jointProfile(),old);result.oldPublication=await manager.publishSnapshot(oldToken,{currentBindings:currentBindings(old)});
  if(scenario==='postpublication-audit-failure'){
   result.auditFaultObserved=events.some(e=>e.phase==='OUTSIDE_CONSUMER_CHANGED_AFTER_PUBLICATION');result.auditFaultKind='outside-consumer-token-change-after-finalize';result.auditFailureError=clone(sides.HIGH.history[0].auditError);result.publicationWhileBlocked=clone(result.oldPublication);result.managerWhileBlocked=manager.inspect();result.feedWhileBlocked=await feeds();
   assert.equal(result.auditFaultObserved,true);assert.equal(result.oldPublication.cleanupRequired,true);assert.equal(result.managerWhileBlocked.state,'RECOVERY_REQUIRED');assert.equal(result.managerWhileBlocked.selectionCurrent,false);assert.equal(manager.active.snapshotId,old.snapshotId);assert.deepEqual(result.feedWhileBlocked,{HIGH:3.625,LOW:3.625});
   let blocked;try{await manager.stageSnapshot(jointProfile(),{...old,snapshotId:'snapshot:82b-joint:blocked',managerRevision:73});}catch(error){blocked=error;}result.newWorkBlocked=blocked?.code==='RECOVERY_REQUIRED';assert.equal(result.newWorkBlocked,true);
   result.nativeCommitCountBeforeRecovery=events.filter(e=>e.phase==='OLD_NATIVE_COMMITTED').length;
   sides.HIGH.history[0].consumerBinding.revision=sides.HIGH.history[0].selectedConsumerBinding.revision;
   await manager.recover();result.managerAfterRecovery=manager.inspect();result.feedAfterRecovery=await feeds();result.recoveredSameSnapshot=manager.active.snapshotId===result.oldPublication.snapshot.snapshotId&&manager.active.snapshotHash===result.oldPublication.snapshot.snapshotHash;result.nativeCommitCountAfterRecovery=events.filter(e=>e.phase==='OLD_NATIVE_COMMITTED').length;
   assert.equal(result.managerAfterRecovery.state,'SNAPSHOT_PUBLISHED');assert.equal(result.managerAfterRecovery.selectionCurrent,true);assert.equal(result.recoveredSameSnapshot,true);assert.equal(result.nativeCommitCountBeforeRecovery,2);assert.equal(result.nativeCommitCountAfterRecovery,2);assert.deepEqual(result.feedAfterRecovery,result.feedWhileBlocked);assert.equal(events.some(e=>e.phase.includes('ROLLED_BACK')),false);
   result.sides={};for(const side of SIDES){const s=sides[side],r=s.history[0],audit=r.bridge.inspect(),ownerState=r.owner.inspect(r.candidate),queue=s.queue.inspect();assert.equal(audit.phase,'postpublication');assert.equal(queue.invocations.every(i=>i.originalTerminal&&i.resourceReleased&&i.reusable&&i.resultAccepted),true);result.sides[side]={sdkInstanceId:s.sdk.sdkInstanceId,consumerBinding:clone(r.consumerBinding),resourceBinding:clone(s.resourceBinding),selectedValuesCompared:s.selectedValuesCompared,admission:audit,ownerState,queue};}
   result.events=events;return result;
  }
  assert.equal(result.oldPublication.cleanupRequired,false);result.oldFeed=await feeds();assert.deepEqual(result.oldFeed,{HIGH:3.625,LOW:3.625});
  const next=await selection(2,-1),nextToken=await manager.stageSnapshot(jointProfile(),next);result.feedAtNewStage=await feeds();assert.deepEqual(result.feedAtNewStage,result.oldFeed);
  sides.LOW.failCommit=true;let failure;try{await manager.publishSnapshot(nextToken,{currentBindings:currentBindings(next)});}catch(error){failure=error;}
  assert.ok(failure,'The controlled LOW native failure must reject this new joint publication');assert.equal(includesError(failure,'controlled LOW native commit failure'),true);
  result.failure={name:failure.name,code:failure.code??null,message:failure.message};result.failedNativeSide='LOW';result.feedAfterFailure=await feeds();assert.deepEqual(result.feedAfterFailure,result.oldFeed);
  result.managerAfterFailure=manager.inspect();result.newSnapshotPublished=manager.active?.snapshotId===next.snapshotId;assert.equal(result.newSnapshotPublished,false);assert.deepEqual(manager.active,result.oldPublication.snapshot);
  result.sides={};for(const side of SIDES){
   const s=sides[side],[oldRecord,newRecord]=s.history,newOwnerState=newRecord.owner.inspect(newRecord.candidate),oldAudit=oldRecord.bridge.inspect(),newAudit=newRecord.bridge.inspect(),queue=s.queue.inspect(),newCheckpointBound=newAudit.checkpoint?.referenceContext?.ownerAdmission?.phaseBinding?.bound===true;
   assert.equal(oldAudit.phase,'postpublication');assert.notEqual(newAudit.phase,'postpublication');assert.equal(newCheckpointBound,true);
   assert.equal(s.selectedValuesCompared,2*81936);assert.equal(newOwnerState.originalTerminal,true);assert.equal(newOwnerState.queueReleased,true);assert.equal(newOwnerState.preparedReleased,true);assert.equal(newOwnerState.rolledBack,true);
   assert.equal(queue.invocations.length,2);assert.equal(queue.invocations.every(i=>i.originalTerminal&&i.resourceReleased&&i.reusable),true);assert.equal(queue.invocations.at(-1).resultAccepted,side==='HIGH');
   result.sides[side]={sdkInstanceId:s.sdk.sdkInstanceId,consumerBinding:clone(newRecord.consumerBinding),resourceBinding:clone(s.resourceBinding),selectedValuesCompared:s.selectedValuesCompared,oldAdmission:{phase:oldAudit.phase,accepted:oldAudit.phase==='postpublication',audit:oldAudit},newAdmission:{accepted:newAudit.phase==='postpublication',audit:newAudit},newCheckpointBound,newOwnerState,oldPlan:oldRecord.plan,newPlan:newRecord.plan,weightBiasEvidence:clone(newRecord.weightBiasEvidence),runtimeEvidence:clone(s.runtimeEvidence),queue};
  }
  result.events=events;
 }finally{
  for(const s of Object.values(sides))s.failCommit=false;
  await manager?.recover();await manager?.dispose();
  for(const s of Object.values(sides)){await s.queue?.drain();await s.sdk.dispose();s.kernel.dispose();await s.consumer.dispose();await s.stage.dispose();}
  result.cleanup={state:'complete',queuesActive:Object.values(sides).reduce((n,s)=>n+activeCount(s.queue),0),nativeResourcesDisposed:true};result.currentLiveAdmission=false;
 }
 return result;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const argv=process.argv.slice(2),arg=k=>{const i=argv.indexOf(k);return i<0?null:argv[i+1];};
 const result=await runLoraDataJointNativeCase({loraRoot:arg('--lora-root')??process.env.WORKS_SNAPSHOT_LORA_ROOT,diffusionRoot:arg('--diffusion-root')??process.env.WORKS_SNAPSHOT_DIFFUSION_ROOT,admissionRoot:arg('--admission-root')??process.env.WORKS_LORA_ADMISSION_ROOT,scenario:arg('--scenario')??'low-failure'});
 const output=arg('--out');if(output){await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');}
 process.stdout.write(JSON.stringify({state:result.state,scenario:result.scenario,scope:result.scope,generationReady:result.generationReady,failedNativeSide:result.failedNativeSide,oldSnapshotId:result.oldPublication.snapshot.snapshotId,newSnapshotPublished:result.newSnapshotPublished,output:output??null})+'\n');
}

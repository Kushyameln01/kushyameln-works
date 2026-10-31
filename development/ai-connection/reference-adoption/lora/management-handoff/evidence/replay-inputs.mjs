// PRIVATE metadata projection only. Never imports SDK/consumer/evaluateEdge,
// reads originals/base/array files, or grants current runtime permission.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {resolve,dirname,relative} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const REPO='/workspace/work/lora-implementation',MANAGER='/workspace/work/lora/manager-edda43';
const OWNER='82b21f09cb63926543181b16f0e97ebc6b9fa6be',RETAINED='40f7f0cfc95bfb5f3e8ed5cc68c4bdb196cbbf68';
const MANAGER_COMMIT='edda43f9ea69c5b3ab1af3c6eb82295f2912887c',PRIOR='0c27874908638afc748ea2455a2779a16736730b';
const SOURCE='development/ai-connection/reference-adoption/lora/evidence/p3/';
const FACTORY_PATH='docs/shared/inference/lora/management-admission-inputs.mjs';
const OUTPUT='/workspace/work/lora/management-handoff/replay-inputs.json';
const sha=b=>createHash('sha256').update(b).digest('hex'),clone=structuredClone;
const gitBytes=(commit,path)=>execFileSync('git',['show',commit+':'+path],{cwd:REPO,maxBuffer:32*1024*1024});
const sourceProof=[],seen=new Set();
async function verifySource(root,commit,path){
  const key=commit+':'+path;if(seen.has(key))return;seen.add(key);
  const actual=await readFile(resolve(root,path)),fixed=gitBytes(commit,path);assert.deepEqual(actual,fixed,key);
  sourceProof.push({commit,path,byteLength:actual.length,sha256:sha(actual),gitBlobMatched:true});
  if(!path.endsWith('.mjs'))return;
  for(const m of actual.toString().matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g)){
    const dependency=relative(root,resolve(root,dirname(path),m[1]));assert.ok(!dependency.startsWith('..'));
    await verifySource(root,commit,dependency);
  }
}
await verifySource(REPO,OWNER,FACTORY_PATH);
await verifySource(MANAGER,MANAGER_COMMIT,'docs/shared/ai-connection/reference-loader.mjs');
const {createLoraManagementAdmissionInputs,LORA_MANAGEMENT_ADMISSION_INPUTS_VERSION}=await import(pathToFileURL(resolve(REPO,FACTORY_PATH)).href);
const {loadReferenceSet,isVerifiedReferenceSet}=await import(pathToFileURL(resolve(MANAGER,'docs/shared/ai-connection/reference-loader.mjs')).href);

const compressed=gitBytes(RETAINED,SOURCE+'run-result.json.gz');
assert.equal(compressed.length,197667);assert.equal(sha(compressed),'37a229469a21c8d78057d5a6202e59920a4c10e081019bcc401485481758f6bd');
const raw=gunzipSync(compressed);assert.equal(raw.length,4683224);assert.equal(sha(raw),'f67a2a7533e45647e69122d0443d0f7378f5198135f98fe46d1e1808d2967c7c');
const retained=JSON.parse(raw),scopeBytes=gitBytes(RETAINED,SOURCE+'selected-scope.json'),scope=JSON.parse(scopeBytes);
assert.equal(retained.receiverCommit,'25e5b56feeb070594110bb292d9de21e4e234f0a');assert.equal(retained.cases.length,6);
assert.equal(scope.coverage,'PARTIAL');assert.equal(scope.completeAdapter,false);

const catalogPath='docs/shared/ai-connection/reference/catalog.v1.json';
await verifySource(MANAGER,MANAGER_COMMIT,catalogPath);
const catalogBytes=new Uint8Array(gitBytes(MANAGER_COMMIT,catalogPath)),catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
const files=new Map();for(const item of catalog.files){await verifySource(MANAGER,MANAGER_COMMIT,item.path);files.set(item.path,new Uint8Array(gitBytes(MANAGER_COMMIT,item.path)));}
const referenceSet=await loadReferenceSet({catalogBytes,files,expectedCatalogSha256:'14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c'});
assert.equal(isVerifiedReferenceSet(referenceSet),true);
const candidatePath='development/ai-connection/reference-adoption/CANDIDATES.json';await verifySource(MANAGER,MANAGER_COMMIT,candidatePath);
const candidateSet=JSON.parse(gitBytes(MANAGER_COMMIT,candidatePath)).candidateSet;
const refBytes=gitBytes(PRIOR,retained.referenceInputs.referenceIdentity.sourceRef.path);
const gateBytes=gitBytes(PRIOR,retained.referenceInputs.gateIdentity.sourceRef.path);
assert.equal(sha(refBytes),retained.referenceInputs.referenceIdentity.sha256);assert.equal(sha(gateBytes),retained.referenceInputs.gateIdentity.sha256);
const priorReference=JSON.parse(refBytes),priorGates=JSON.parse(gateBytes);
const factorySourceProof=sourceProof.find(p=>p.commit===OWNER&&p.path===FACTORY_PATH);
const factorySourceRef={repository:'https://github.com/Kushyameln01/kushyameln-works',commit:OWNER,path:FACTORY_PATH,sha256:factorySourceProof.sha256};
const cases=[];
for(const [index,c] of retained.cases.entries()){
  assert.equal(c.scopeArtifact.sha256,sha(scopeBytes),'All six selected scope metadata views must match the retained Git scope');
  const before=c.normPreflight.decisions,connection=clone(retained.registryBindings.connectionRegistry),native=clone(retained.registryBindings.nativeRegistry);
  const nativeReceipt=c.ownerValidation.nativeValidation.evidence.nativeReceipt;
  const checkpointEvidenceIds=c.normCheckpoint.decisions[0].decision.validation.find(r=>r.scope==='norm:N-EVIDENCE').evidenceRefs;
  assert.equal(checkpointEvidenceIds.length,1);
  const operations=[],tensors={};
  for(const selected of scope.includedPatches){
    const records=before.filter(r=>r.patch===selected.key);assert.ok(records.length);
    const details=records[0].loaderDetails;assert.ok(records.every(r=>JSON.stringify(r.loaderDetails)===JSON.stringify(details)));
    assert.deepEqual(details.names,selected.names);assert.deepEqual(details.fullShape,selected.fullShape);assert.deepEqual(details.slice,selected.slice);
    const dtypes=[...new Set(records.map(r=>r.sourceDtype))];
    assert.equal(dtypes.length,1,'Mixed per-patch dtypes would need a retained name-to-dtype map; do not guess one');
    // The original preflight loop emitted one entry per distinct dtype of all
    // names in this patch. A single recorded dtype proves each name's dtype.
    // No raw header shape or payload is reconstructed or claimed.
    for(const name of details.names)tensors[name]={dtype:dtypes[0]};
    const target=connection.targets.find(t=>t.key===selected.key);assert.ok(target);
    operations.push({key:selected.key,variant:selected.variant,names:clone(details.names),fullShape:clone(details.fullShape),slice:clone(details.slice),
      rank:details.rank,alpha:details.alpha,alphaName:details.alphaName,scale:details.effectiveScale,target});
  }
  const plan={contractVersion:c.application.receipt.contractVersion,coverage:scope.coverage,completeAdapter:scope.completeAdapter,scope:c.application.receipt.scope,
    generationReady:c.application.receipt.generationReady,
    planId:c.planId,sourceSha256:c.sourceSha256,sdkInstanceId:c.sdkInstanceId,localInputRevision:c.localInputRevision,localApplicationRevision:c.localApplicationRevision,
    buildId:retained.sourcePins.kernel.sha256,selection:clone(scope.selection),strength:c.strength,loaderPolicyId:before[0].declaration.loaderPolicyId,
    registryHash:retained.registryBindings.connectionRegistryHash,registry:connection,operations,
    includedPatches:clone(scope.includedPatches),excludedTargets:clone(scope.excludedTargets),excludedRegions:clone(scope.excludedRegions)};
  assert.ok(before.every(r=>r.declaration.sourceHash===c.sourceSha256&&r.declaration.strength===c.strength));
  const ownerBinding={adapterVersion:c.ownerValidation.nativeValidation.evidence.adapterVersion,
    nativeRegistryHash:retained.registryBindings.nativeRegistryHash,connectionRegistryHash:retained.registryBindings.connectionRegistryHash,
    nativeRegistry:native,connectionRegistry:connection};
  const consumerBinding=clone(c.normPreflight.consumerBinding);assert.deepEqual(consumerBinding,c.normPostpublication.consumerBinding);
  const priorCase=priorReference.cases.find(r=>r.pairId==='light'&&r.strength===c.strength);assert.ok(priorCase);
  assert.deepEqual(priorCase.expectedOutput,c.expectedOutput);assert.deepEqual(nativeReceipt.tolerance,priorGates.gates.projection);
  const referenceIdentity={...clone(retained.referenceInputs.referenceIdentity),expectedOutputSha256:nativeReceipt.expectedSHA256};
  const gateIdentity={...clone(retained.referenceInputs.gateIdentity),tolerance:clone(priorGates.gates.projection)};
  const missingFields=['original resourceState.requiredBytes','original resourceState.budgetBytes','original resourceState.occupiedBytes','raw safetensors header tensor shapes'];
  let recordedPhase='preflight';
  const recordedSelectedObservation=()=>{
    const phase=recordedPhase==='preflight'?c.normPreflight:c.normCheckpoint;
    return phase.decisions.every(r=>r.decision.readiness.state==='ready');
  };
  const recordedPublishedObservation=()=>c.normPostpublication.decisions.every(r=>r.decision.readiness.state==='ready')
    &&c.ownerState.published&&c.ownerState.originalTerminal&&c.ownerState.queueReleased&&c.ownerState.preparedReleased;
  const factory=createLoraManagementAdmissionInputs({referenceSet,candidateSet,sourcePins:clone(retained.sourcePins),plan,inspection:{tensors},ownerBinding,
    executionKernelDigest:nativeReceipt.evidence.hikeWasmSHA256,gateIdentity,referenceIdentity,
    baseKind:c.normPreflight.baseKind,environment:'RETAINED_POINT_IN_TIME_METADATA_ONLY; not a live runtime environment',
    resourceState:{status:'unobserved-in-metadata-replay',ownerId:consumerBinding.resourceBinding.ownerId,
      requiredBytes:null,budgetBytes:null,occupiedBytes:null,scope:'NO_LIVE_RESOURCE_ADMISSION; old comparison capacities not persisted'},
    isCurrent:recordedSelectedObservation,isPublishedCurrent:recordedPublishedObservation,
    consumerBinding,readConsumerBinding:()=>clone(consumerBinding),inputKind:before[0].declaration.inputKind,factorySourceRef});
  const preflight=factory.preflightInputs();recordedPhase='checkpoint';
  const weightBiasEvidence={evidenceId:checkpointEvidenceIds[0],referenceId:referenceIdentity.referenceId,referenceSha256:referenceIdentity.sha256,
    planId:c.planId,sourceSha256:c.sourceSha256,strength:c.strength,nativeRegistryHash:ownerBinding.nativeRegistryHash,connectionRegistryHash:ownerBinding.connectionRegistryHash,
    weightComparison:clone(c.weightComparison),biasComparison:clone(c.biasComparison),weightArtifact:clone(c.weightArtifact),biasArtifact:clone(c.biasArtifact)};
  const checkpoint=factory.checkpointInputs({nativeValidation:clone(c.ownerValidation.nativeValidation),weightBiasEvidence,
    snapshotTarget:clone(c.ownerValidation.target),ownerValidation:clone(c.ownerValidation)});
  recordedPhase='postpublication';
  const post=factory.postpublicationInputs({snapshotTarget:clone(c.ownerState.target),publication:clone(c.publication),queueReports:clone(c.queueReports),
    ownerState:clone(c.ownerState),ownerValidationRef:weightBiasEvidence.evidenceId});
  for(const input of [...preflight.map(r=>r.input),checkpoint,post]){
    assert.equal(input.referenceContext.referenceSet,referenceSet);assert.equal(isVerifiedReferenceSet(input.referenceContext.referenceSet),true);
    assert.equal(Object.isFrozen(input),true);assert.equal(Object.isFrozen(input.referenceContext),true);
    assert.equal(input.resourceState.status,'unobserved-in-metadata-replay');
    assert.equal(input.referenceContext.ownerAdmission.originIdentity.factorySourceRef.commit,OWNER);
  }
  for(const patch of preflight){assert.equal(patch.declaration.baseDtype,'F32');assert.equal(patch.declaration.outputDtype,'F32');assert.equal(patch.declaration.layout,'row-major');
    assert.equal(patch.numericDeclarations.sourceSha256,c.sourceSha256);assert.equal(patch.numericDeclarations.planId,c.planId);}
  const binding=checkpoint.referenceContext.ownerAdmission.phaseBinding;
  assert.equal(binding.bound,true);assert.deepEqual(binding.snapshotTarget,c.ownerValidation.target);
  assert.deepEqual(post.referenceContext.ownerAdmission.phaseBinding.snapshotTarget,c.ownerState.target);
  assert.deepEqual(post.referenceContext.ownerAdmission.phaseBinding.publicationTarget,c.ownerState.target);
  assert.deepEqual(post.referenceContext.managerState.target,c.ownerState.target);
  assert.deepEqual(factory.describe().nativeSourcePins,retained.sourcePins);
  assert.equal(checkpoint.referenceContext.numericRequirements[0].kernelDigest,nativeReceipt.evidence.hikeWasmSHA256);
  assert.equal(checkpoint.referenceContext.numericRequirements[0].gateRef.sha256,retained.referenceInputs.gateIdentity.sha256);
  assert.equal(checkpoint.referenceContext.numericRequirements[0].referenceRef.sha256,retained.referenceInputs.referenceIdentity.sha256);
  assert.deepEqual(checkpoint.referenceContext.nativeDeclarations.consumer.weightShape,[16,5120]);
  assert.equal(post.activeBindings.producer.currentRevision,c.localInputRevision);
  assert.equal(post.activeBindings.consumer.currentRevision,consumerBinding.revision);
  assert.equal(typeof post.activeBindings.consumer.currentRevision,'string');
  const transaction=post.evidence.find(e=>e.scope==='norm:N-TRANSACTION');
  assert.deepEqual(transaction.ownerReceipt.publication,c.publication);assert.deepEqual(transaction.ownerReceipt.ownerState,c.ownerState);
  const commitEvents=retained.events.filter(event=>event.phase==='NATIVE_COMMITTED'&&event.managerRevision===c.managerRevision
    &&event.receipt.packageHash===nativeReceipt.packageHash);
  assert.equal(commitEvents.length,1,'Consumer epoch must come from the retained exact native commit event, not another counter');
  cases.push({id:c.id,strength:c.strength,sourcePointer:`${RETAINED}:${SOURCE}run-result.json.gz#/cases/${index}`,
    metadataViewKind:'RECONSTRUCTED_RETAINED_METADATA; not an opaque SDK plan/header or live native candidate',
    planId:c.planId,sourceSha256:c.sourceSha256,managerRevision:c.managerRevision,
    nativeLocalRevisionBindings:clone(c.ownerValidation.target.localRevisionBindings),recordedConsumerEpoch:commitEvents[0].receipt.epoch,
    outsideConsumerBinding:consumerBinding,preflight:preflight.map(r=>({patch:r.patch,variant:r.variant,sourceDtype:r.sourceDtype,declaration:r.declaration,numericDeclarations:r.numericDeclarations})),
    checkpointPhaseBinding:clone(binding),postpublicationPhaseBinding:clone(post.referenceContext.ownerAdmission.phaseBinding),
    numericRequirement:clone(checkpoint.referenceContext.numericRequirements[0]),
    sourcePinsUnchanged:true,targetPreserved:true,allPhaseInputsFrozen:true,referenceSetBrandPreserved:true,
    noCompatibilityDecisionComputed:true,missingRetainedFields:missingFields,
    callbacks:{meaning:'recorded original point-in-time observations only; never current live permissions',recordedPhasesChecked:['preflight','checkpoint','postpublication']}});
}
const scriptBytes=await readFile(fileURLToPath(import.meta.url));
const result={schemaVersion:'lora-management-admission-retained-data-projection/0.1',status:'PASS_METADATA_DATA_API_COMPATIBILITY_ONLY',
  ownerCodeCommit:OWNER,retainedDeliveryCommit:RETAINED,originalExecutionCommit:retained.receiverCommit,managementReferenceCommit:MANAGER_COMMIT,
  dataContractVersion:LORA_MANAGEMENT_ADMISSION_INPUTS_VERSION,metadataCasesProjected:cases.length,numericalExecutions:0,
  newManagerAdoptionAccepted:false,currentLiveAdmission:false,evaluateEdgeCalls:0,sdkCalls:0,consumerCalls:0,
  originalOrBaseReads:0,tensorArrayFileReads:0,newOriginalOrModelHashes:0,
  sourceReceipt:{path:SOURCE+'run-result.json.gz',gzipBytes:compressed.length,gzipSha256:sha(compressed),rawBytes:raw.length,rawSha256:sha(raw)},
  selectedScope:{commit:RETAINED,path:SOURCE+'selected-scope.json',bytes:scopeBytes.length,sha256:sha(scopeBytes),allSixScopeArtifactHashesMatched:true},
  factorySourceRef,sourceByteProof:sourceProof,cases,
  missingFieldPolicy:'Unretained capacities/header shapes remain missing; replay environment is explicitly non-live and unavailable for admission',
  prohibitedInterpretations:['not new numerical cases','not official management adoption','not receipt replay as future permission','not opaque SDK plan reconstruction','not live published snapshot authority'],
  script:{file:'replay-inputs.mjs',bytes:scriptBytes.length,sha256:sha(scriptBytes)}};
await writeFile(OUTPUT,JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:result.status,metadataCasesProjected:cases.length,numericalExecutions:0,
  newManagerAdoptionAccepted:false,currentLiveAdmission:false,sourceFilesVerified:sourceProof.length,scriptSha256:result.script.sha256,output:OUTPUT}));

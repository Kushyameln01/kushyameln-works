// One real local LoRA File, explicitly synthetic immutable control base, actual
// owner SDK/Hike and ORT stage. No real-base/full-model acceptance is asserted.
import {createDiffusionAdapter} from '/management/shared/ai-connection/adapters/diffusion.mjs';
import {createCandidateAdoptedLoraAdapter} from '/management/shared/ai-connection/adapters/adopted-lora.mjs';
import {createSnapshotNativeLoraOwner} from '/management/shared/ai-connection/adapters/snapshot-native-lora.mjs';
import {createSnapshotManager} from '/management/shared/ai-connection/snapshot.mjs';
import {createInvocationQueue} from '/management/shared/ai-connection/queue.mjs';
import {createManagedDiagnosticPackage} from '/management/shared/ai-connection/diagnostic-package.mjs';
import {writeArtifactPackage,readArtifactPackage} from '/management/shared/ai-connection/package.mjs';
import {hashCanonical} from '/management/shared/ai-connection/canonical.mjs';
import {createDiffusionModels,PROTOCOL_VERSION,BUILD_ID} from '/diffusion/shared/diffusion-models/api/index.mjs';
import {createLoraSource} from '/diffusion/shared/diffusion-models/lora/source.mjs';
import {createDiagnosticConsumer} from '/diffusion/shared/diffusion-models/lora/diagnostic-consumer.mjs';
import {diagnosticRegistryHash} from '/diffusion/shared/diffusion-models/lora/diagnostic-identity.mjs';
import {createOrtProjectionStage} from '/diffusion/shared/diffusion-models/ort-bridge/stage.mjs';
import {createLoraV2} from '/lora/shared/inference/lora/sdk-v2.mjs';
import * as ownerExports from '/lora/shared/inference/lora/diffusion-diagnostic-adapter.mjs';
import * as codec from '/codec/shared/inference/tensor.mjs';
import {compareAll} from '/lora-tools/ai-connection/joint-browser-cases.mjs';

const assert=(ok,message)=>{if(!ok)throw Error(message);};
const bytes=v=>v instanceof ArrayBuffer?new Uint8Array(v):new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
const sha=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',v)),n=>n.toString(16).padStart(2,'0')).join('');
async function load(record,Type){const r=await fetch('/reference/'+record.file);assert(r.ok,'Independent reference absent');const b=await r.arrayBuffer();assert(b.byteLength===record.bytes&&await sha(b)===record.sha256,'Independent reference hash mismatch');return new Type(b);}
async function save(name,value){const b=bytes(value),r=await fetch('/artifact/'+name,{method:'POST',body:b});assert(r.ok,'Private evidence write failed');return {file:name,bytes:b.byteLength,sha256:await sha(b)};}
async function rejected(action,label){let caught;try{await action();}catch(error){caught=error;}assert(caught,'Expected rejection: '+label);return {rejected:true,code:caught.code??null,error:String(caught)};}
const currentBindings=bindings=>Object.fromEntries(bindings.steps.map(step=>[step.stepId,{localRevisionBindings:step.localRevisionBindings,resourceBinding:step.resourceBinding}]));

export async function runManagedLoraSnapshotCases({positiveFile,negativeFiles,inputs,reference,sourcePins}){
 const report={status:'RUNNING',scenario:'snapshot-candidate',scope:'managed-local-File-diagnostic-snapshot',fixtureScope:'synthetic-manager-control-fixture',realBase:false,newRealE1Acceptance:false,modelInference:false,generationReady:false,snapshotPublished:false,cases:[],inputClassifications:[],lifecycle:[],sourcePins};
 assert(reference.realBase===false&&reference.scope==='synthetic-manager-control-fixture','Control base must retain its explicitly synthetic scope');
 assert(positiveFile instanceof File&&positiveFile.name.toLowerCase().endsWith('.safetensors'),'Explicit locally selected original LoRA File required');
 assert(negativeFiles.length===0&&inputs.negatives.length===0,'Use a separate one-positive selection JSON for this scenario');
 const ref=reference.cases.find(c=>c.strength===1);assert(ref,'Independent predeclared strength-one reference missing');
 report.referenceSelection={executedCaseId:ref.id,executedStrength:1,generatedCaseIds:reference.cases.map(c=>c.id),unexecutedCaseIds:reference.cases.filter(c=>c!==ref).map(c=>c.id),purpose:'one complete selected weight/bias/output comparison; other oracle cases are not executed'};
 const selection=structuredClone(inputs.positive.selection),side=selection.noise.toUpperCase();
 const baseWeight=await load(reference.baseWeight,Float32Array),baseBias=await load(reference.baseBias,Float32Array),x=await load(reference.activation,Float32Array);
 const fixtureEvidence={kind:'synthetic-manager-control-fixture',realBase:false,weightSha256:reference.baseWeight.sha256,biasSha256:reference.baseBias.sha256,learningBaseCompatibility:'not established',purpose:'actual local File/SDK/Hike/ORT diagnostic snapshot and save; real numerical owner evidence remains separate'};
 const managerSessionId=crypto.randomUUID(),resourceBinding={ownerId:'snapshot-file-owner:'+crypto.randomUUID(),bindingId:'snapshot-file-projection',resourceGeneration:crypto.randomUUID()};
 let ownerLive=true,sequence=0,localRevision=0,io,sdk,stage,consumer,manager,owner,queue,facade,source,loaded,native,ownerCandidate,applicationEnvelope=null;
 const revision=1,events=[];
 const target=phase=>({managerSessionId,managerRevision:revision,requestId:'snapshot-file:'+phase+':'+(++sequence),resourceBinding:{...resourceBinding}});
 const current=t=>ownerLive&&t.managerSessionId===managerSessionId&&t.managerRevision===revision&&['ownerId','bindingId','resourceGeneration'].every(k=>t.resourceBinding?.[k]===resourceBinding[k]);
 const dm=createDiffusionModels({sessionId:'snapshot-file-'+crypto.randomUUID()});
 const request=async(operationId,input)=>io.invoke({requestId:'snapshot-file-io:'+ (++sequence),operationId,localRevision:++localRevision,input});
 try{
  io=createDiffusionAdapter({descriptor:{nativeAPI:{version:PROTOCOL_VERSION,build:BUILD_ID},operations:['loadLora','listLoras','readLoraSource','unloadLora'].map(operationId=>({operationId,implementationState:'implemented'}))},nativeClient:dm,binding:{ownerId:resourceBinding.ownerId,sessionId:managerSessionId,nativeSessionId:dm.sessionId,inputRevision:5},sourceVerified:true});
  const rr=await fetch('/lora-tools/ai-connection/fixtures/diffusion-diagnostic-registry.json');assert(rr.ok,'Pinned owner diagnostic registry missing');
  native=structuredClone((await rr.json()).registries.find(r=>r.side===side));
  for(const item of native.targets){item.transform.rowStart=0;item.source.elementOffset=0;}native.registryHash=diagnosticRegistryHash(native);
  console.log('MANAGED-FILE snapshot candidate verifying actual selected original '+positiveFile.name);
  loaded=await request('loadLora',{file:positiveFile,stage:side,strength:1,baseModelSha256:native.modelHash,expectedFileSHA256:inputs.positive.expectedSha256});
  assert(loaded.status==='ok'&&loaded.result.applied===false&&loaded.result.fullFileSHA256===inputs.positive.expectedSha256,'Native File registration/full-file hash mismatch');
  source=createLoraSource({sessionId:dm.sessionId,binding:loaded.result,inputRevision:5,request:async q=>{const r=await io.invoke({requestId:q.jobId,operationId:q.op,localRevision:++localRevision,input:q.input});return r.native.rawReply;}});
  report.localInput={fileName:positiveFile.name,byteLength:positiveFile.size,lastModified:positiveFile.lastModified,kind:'local-File',registration:loaded.result,sourceSha256:await source.hash(),registeredIsApplied:loaded.result.applied};
  sdk=await createLoraV2({sourceFactory:()=>source});
  const inspected=await sdk.inspect(selection);assert(inspected.state==='SOURCE_INSPECTED'&&inspected.sourceSha256===null,'Header-only inspection must retain native unverified source state');report.localInput.inspection={state:inspected.state,tensorCount:inspected.tensorCount,integrity:inspected.integrity,sourceSha256:inspected.sourceSha256};
  const baseProvider={async readBlock(id,offset,count,context={}){context.signal?.throwIfAborted();assert(context.modelHash===native.modelHash&&context.graphHash===native.graphHash,'Synthetic fixture identity mismatch');const values=id==='q.weight'?baseWeight:id==='q.bias'?baseBias:null;assert(values&&Number.isSafeInteger(offset)&&Number.isSafeInteger(count)&&offset>=0&&count>0&&offset+count<=values.length,'Read outside synthetic immutable fixture');return values.slice(offset,offset+count);}};
  stage=await createOrtProjectionStage();
  const nativeConsumer=createDiagnosticConsumer({registry:native,stage,baseProvider});
  consumer=Object.freeze({...nativeConsumer,async commit(...args){const value=await nativeConsumer.commit(...args);events.push({phase:'NATIVE_COMMITTED',managerState:manager?.inspect().state??'BASELINE',receipt:structuredClone(value)});return value;},async releaseCandidate(candidate){events.push({phase:'NATIVE_CANDIDATE_RELEASED',candidateId:candidate.candidateId,managerState:manager?.inspect().state??'BASELINE'});return nativeConsumer.releaseCandidate(candidate);}});
  const baseContext={modelHash:native.modelHash,graphHash:native.graphHash,registryHash:native.registryHash,side,scope:'PARTIAL',isCurrent:()=>ownerLive};
  const baseline=await consumer.prepareBase(baseContext),baseValidation=await consumer.validate(baseline,{...baseContext,x,expected:new Float32Array(reference.baseExpectedOutput),tolerance:reference.gates.projection});
  assert(baseValidation.valid===true,'Actual ORT/Hike immutable fixture baseline differs from independent reference');await consumer.commit(baseline,baseContext);await consumer.releaseCandidate(baseline);events.length=0;
  const pins=Object.fromEntries(['sdk','adapter','kernel','diffusion'].map(key=>[key,sourcePins[key]]));
  facade=createCandidateAdoptedLoraAdapter({ownerExports,sdk,consumer,baseProvider,sourcePins:pins,resourceBinding,isOwnerCurrent:current});
  const diagnostic={targets:[{key:'diffusion_model.blocks.0.self_attn.q.weight',slice:{startRow:0,rowCount:16}},...(reference.hasBias?[{key:'diffusion_model.blocks.0.self_attn.q.bias',slice:{startRow:0,rowCount:16}}]:[])]};
  const planTarget=target('plan'),plan=await facade.plan({selection,strength:1,diagnostic},{target:planTarget});
  assert(plan.sourceSha256===report.localInput.sourceSha256&&plan.coverage==='PARTIAL'&&plan.completeAdapter===false&&plan.generationReady===false,'Candidate plan changed source or diagnostic scope');
  const binding=await facade.describeBinding();
  assert(binding.owner.nativeRegistryHash===native.registryHash&&binding.owner.connectionRegistryHash===plan.registryHash,'Native and connection registries were conflated');
  report.registryBindings={nativeRegistryHash:native.registryHash,connectionRegistryHash:plan.registryHash,nativeRegistry:binding.owner.nativeRegistry,connectionRegistry:facade.registry};
  const weight=new Float32Array(81920),bias=new Float32Array(baseBias),writes=[];
  const capturedAdapter=Object.freeze({...facade,
   async prepare(p,options){return facade.prepare(p,{...options,onBlock:block=>{assert(['q.weight','q.bias'].includes(block.weightId),'Unexpected selected block');(block.weightId==='q.weight'?weight:bias).set(block.data,block.offset);writes.push({weightId:block.weightId,offset:block.offset,count:block.count,sha256:block.sha256,fullShape:block.fullShape,slice:block.slice,binding:block.binding});}});},
   openStage(...args){const open=facade.openStage(...args);void open.completion.then(envelope=>{applicationEnvelope=envelope;},()=>{});return open;},
   async finalize(...args){events.push({phase:'OWNER_FINALIZE',managerState:manager.inspect().state});return facade.finalize(...args);}
  });
  queue=createInvocationQueue({resourceBindings:[{...resourceBinding,cancel:t=>owner.cancelInvocation(t),afterTerminal:(t,o)=>owner.afterInvocation(t,o),release:(t,o)=>owner.releaseInvocation(t,o)}]});
  const nativeOwner=createSnapshotNativeLoraOwner({adapter:capturedAdapter,plan,planTarget,validation:{x,expected:new Float32Array(ref.expectedOutput),tolerance:reference.gates.projection},resourceBinding,queue,requestPrefix:'browser-snapshot-candidate:1'});
  owner=Object.freeze({...nativeOwner,async prepare(context){const prepared=await nativeOwner.prepare(context);ownerCandidate=prepared.candidate;return prepared;}});
  manager=createSnapshotManager({managerSessionId});
  const profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'works:actual-file-diagnostic-snapshot',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:['local-file:selected'],steps:[{stepId:side,moduleId:'lora-candidate:'+side,operationId:'diagnose',inputBindings:[{portId:'source',artifactRef:'local-file:selected'}],outputBindings:[{portId:'projection',artifactRef:'diagnostic:output'}],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:['diagnostic-projection']};
  const bindings={snapshotId:'snapshot:actual-file:'+crypto.randomUUID(),managerRevision:revision,artifactManifestRef:'package:actual-file-diagnostic',evidenceManifestRef:'evidence:actual-file-diagnostic',requestedScope:{kind:'diagnostic',scopeId:'diagnostic-projection'},steps:[{stepId:side,moduleId:'lora-candidate:'+side,operationId:'diagnose',moduleVersion:'native-lora-candidate/fc2789a+5f880fd',nativeBindingRefs:[plan.registryHash,native.registryHash],artifactRefs:['local-file:selected'],modelProfileRefs:[native.executionProfileId],adapterSelectionRefs:[],localRevisionBindings:{sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision},sourceRef:structuredClone(sourcePins.sdk),nativeBuild:sourcePins.kernel.sha256,implementationState:'implemented',resourceBinding,isCurrent:()=>ownerLive,owner}]};
  const token=await manager.stageSnapshot(profile,bindings);
  assert(manager.inspect().state==='STAGED'&&manager.active===null,'Candidate was published before explicit manager publication');
  const before=await consumer.run({x}),baselineComparison=compareAll(before.output,new Float32Array(reference.baseExpectedOutput),reference.gates.projection);
  assert(baselineComparison.passed,'Native feed changed before manager publication');
  const weightComparison=compareAll(weight,await load(ref.weight,Float64Array),reference.gates.weight),biasComparison=compareAll(bias,await load(ref.bias,Float32Array),reference.gates.bias);
  assert(weightComparison.passed&&biasComparison.passed,'Selected all81920 weights/all16 bias differ from independent original-byte oracle');
  report.checkpoint={manager:manager.inspect(),owner:owner.inspect(ownerCandidate),queue:queue.inspect(),beforeOutput:[...before.output],baselineComparison,weightComparison,biasComparison,writes};
  assert(queue.inspect().invocations.some(i=>i.state==='running'&&!i.originalTerminal),'Validated native invocation must retain its real queue slot until publication');
  const publication=await manager.publishSnapshot(token,{currentBindings:currentBindings(bindings)});
  assert(publication.state==='SNAPSHOT_PUBLISHED'&&publication.generationReady===false&&manager.inspect().selectionCurrent===true,'Diagnostic publication/current binding failed');
  report.publication=publication;report.snapshotPublished=true;
  const {snapshotHash,...snapshotBody}=publication.snapshot;assert(snapshotHash===await hashCanonical(snapshotBody),'Actual published snapshot hash differs from its retained body');
  const ownerState=owner.inspect(ownerCandidate);
  assert(ownerState.published===true&&ownerState.originalTerminal===true&&ownerState.queueReleased===true&&ownerState.preparedReleased===true&&ownerState.target.snapshotHash===snapshotHash&&ownerState.stageEnvelope===applicationEnvelope,'Exact published snapshot/native terminal envelope binding was lost');
  assert(ownerState.nativePhaseTarget.managerSessionId===managerSessionId&&ownerState.nativePhaseTarget.managerRevision===revision&&ownerState.queueTarget.requestId!==ownerState.nativePhaseTarget.requestId&&ownerState.nativePhaseTarget.requestId!==planTarget.requestId,'Native request IDs or manager revision were conflated');
  report.snapshotOwner=ownerState;
  assert(applicationEnvelope&&applicationEnvelope.receipt.snapshotPublished===false&&applicationEnvelope.receipt.generationReady===false,'Native receipt must retain its own diagnostic scope after manager publication');
  assert(publication.nativeStates[0].ownership.kind==='independent-copy'&&publication.nativeStates[0].ownership.ownerId===applicationEnvelope.receipt.ownership.ownerId,'Actual dynamic native owner identity was replaced');
  assert(events.filter(e=>['OWNER_FINALIZE','NATIVE_CANDIDATE_RELEASED'].includes(e.phase)).length>=2&&events.filter(e=>['OWNER_FINALIZE','NATIVE_CANDIDATE_RELEASED'].includes(e.phase)).every(e=>e.managerState==='SNAPSHOT_PUBLISHED'),'Candidate history finalized before actual publication');
  await queue.drain();assert(queue.inspect().invocations.every(i=>i.originalTerminal&&i.resourceReleased),'Native queue terminal/release barrier incomplete after publication');
  const result=await facade.run({x},{target:target('run-published')}),outputComparison=compareAll(result.output,new Float32Array(ref.expectedOutput),reference.gates.projection);assert(outputComparison.passed&&result.modelInference===false,'Actual postpublication ORT/Hike output differs from independent reference');
  const outputHash=await sha(result.output),savedEnvelope=structuredClone(applicationEnvelope);savedEnvelope.management.outputBinding={sha256:outputHash,byteLength:64,meaning:'works:diagnostic-q-projection:v1',packageHash:result.packageHash,epoch:result.epoch};
  report.cases.push({id:ref.id,strength:1,weightComparison,biasComparison,outputComparison,actualOutput:[...result.output],expectedOutput:ref.expectedOutput,weightArtifact:await save('snapshot-selected-weight.f32',weight),biasArtifact:await save('snapshot-selected-bias.f32',bias),outputArtifact:await save('snapshot-output.f32',result.output),application:applicationEnvelope});
  const seed=await createManagedDiagnosticPackage({output:result.output,applicationEnvelope:savedEnvelope,inputIdentity:{inputId:'selected-local-safetensors',fileName:positiveFile.name,byteLength:positiveFile.size,sha256:report.localInput.sourceSha256},baseEvidence:fixtureEvidence,snapshot:publication.snapshot,snapshotTarget:ownerState.target,codec:{codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef:sourcePins.codec,encode:codec.encodeTensor,decode:codec.decodeTensor}});
  const prefix='/package/snapshot-candidate/';
  const writer={registry:seed.registry,async write(path,data){const r=await fetch(prefix+path,{method:'POST',body:data});assert(r.ok,'Fresh package disk write failed');}};
  const reader={async read(path){const r=await fetch(prefix+path);return r.status===404?null:r.ok?new Uint8Array(await r.arrayBuffer()):Promise.reject(Error('Fresh package disk readback failed'));}};
  const packageReceipt=await writeArtifactPackage(seed.manifest,seed.assets,writer),restored=await readArtifactPackage(reader,seed.registry),record=restored.artifacts[0];
  assert(restored.status==='complete'&&await sha(record.native.data)===outputHash&&record.descriptor.snapshotId===publication.snapshot.snapshotId&&record.snapshot.snapshotHash===snapshotHash,'Saved native output/snapshot readback mismatch');
  const tampered=await rejected(()=>readArtifactPackage({read:async path=>{const b=await reader.read(path);if(b&&path.endsWith('.wktensor'))b[b.length-1]^=1;return b;}},seed.registry),'tampered saved native output');
  const missing=await rejected(()=>readArtifactPackage({read:path=>path==='snapshot.json'?null:reader.read(path)},seed.registry),'missing actual snapshot sidecar');
  assert(tampered.code==='ASSET_HASH_MISMATCH'&&missing.code==='REQUIRED_ASSET_MISSING','Save negatives failed for unintended reasons');
  report.savedPackage={status:restored.status,receipt:packageReceipt,outputSha256:outputHash,snapshotId:record.snapshot.snapshotId,snapshotHash:record.snapshot.snapshotHash,applicationPreserved:record.evidence,trace:record.trace,originalFileEmbedded:false,reselectRequired:true,tampered,missing,generationReady:false};
  const unload=await request('unloadLora',{bindingId:loaded.result.bindingId,stage:side});assert(unload.status==='ok','Exact native File source release failed');
  const oldSource=await rejected(()=>source.hash(),'released source binding');assert(oldSource.code==='SOURCE_BINDING_UNAVAILABLE','Unloaded source failed for wrong reason');
  const retained=await facade.run({x},{target:target('copy-after-source-unload')});assert(await sha(retained.output)===outputHash,'Independent consumer copy borrowed released source/package bytes');
  report.lifecycle.push({kind:'source-after-unload',...oldSource});report.ownership={mode:'independent-copy',nativeOwnerId:applicationEnvelope.receipt.ownership.ownerId,resourceOwnerId:resourceBinding.ownerId,copySurvivesPreparedHistoryAndSourceUnload:true,nativeLease:'N/A'};
  report.publication=publication;report.snapshotTrace=manager.inspect();report.queueTrace=queue.inspect();report.nativeBinding=await facade.describeBinding();report.events=events;report.snapshotPublished=true;
  await manager.dispose();manager=null;await queue.drain();await io.dispose();io=null;await sdk.dispose();sdk=null;await consumer.dispose();consumer=null;await stage.dispose();stage=null;await dm.dispose();
  report.cleanup={awaitedNativeTerminal:true,managerDisposed:true,sdkDisposed:true,consumerDisposed:true,ortSessionDisposed:true,nativeFileModuleDisposed:true};report.status='PASS_MANAGED_SNAPSHOT_CANDIDATE_ROUTE';return report;
 }catch(error){report.status='FAIL';report.error=String(error.stack??error);report.events=events;report.snapshotTrace=manager?.inspect();report.queueTrace=queue?.inspect();return report;}
 finally{try{await manager?.recover();await manager?.dispose();}catch(error){report.cleanupError=String(error);}ownerLive=false;await queue?.drain();await sdk?.dispose();await consumer?.dispose();await stage?.dispose();await io?.dispose();await dm.dispose();}
}

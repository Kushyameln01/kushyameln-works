// Normal weight transactions use no forward input, independent expected or gate.
// This test harness compares their results to a frozen historical oracle only
// in the separate diagnostics section. It is not an 81frame generation test.
import {createLoraV2} from '/lora/shared/inference/lora/sdk-v2.mjs';
import {createDiffusionP4Adapter} from '/lora/shared/inference/lora/diffusion-p4-adapter.mjs';
import {sha256Blob} from '/lora/shared/vr180/sha256.mjs';
import {createP4WeightSource} from '/diffusion/shared/diffusion-models/ort-bridge/post-self-attention/source.mjs';
import {createP4WeightFeed} from '/diffusion/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs';
import {createPostSelfAttention} from '/diffusion/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs';
import {captureP4FixtureConditioning,cloneP4CapturedConditioning} from '/diffusion/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs';
import {createInvocationQueue} from '/management/shared/ai-connection/queue.mjs';

const assert=(ok,message)=>{if(!ok)throw Error(message);};
const clone=structuredClone;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const view=value=>value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',view(value))),n=>n.toString(16).padStart(2,'0')).join('');
const errorData=e=>({name:e?.name??null,code:e?.code??null,message:String(e?.message??e)});
const tuple=plan=>({sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision});
const forbiddenNormalKeys=['input','expected','expectedSHA256','referenceId','gateId','tolerance','run','conditioning','residual','timeAct1','validationMode'];
const normalNativeKeys=['modelHash','graphHash','registryHash','side','executionProfileId','scope','signal','isCurrent'];
const nativeOwnerCommit='48ff155988d995fc2569e495c8d8820273bd472c';
async function read(record,Type){
 const response=await fetch('/oracle/'+record.file);assert(response.ok,'Frozen diagnostic artifact unavailable');
 const b=await response.arrayBuffer();assert(b.byteLength===record.bytes&&await sha(b)===record.sha256,'Frozen diagnostic artifact identity mismatch');return new Type(b);
}
async function save(file,data){const b=view(data),response=await fetch('/artifact/'+file,{method:'POST',body:b});assert(response.ok,'Private diagnostic artifact write failed');return {file,bytes:b.byteLength,sha256:await sha(b)};}
function compare(actual,expected,gate){
 assert(actual.length===expected.length,'Diagnostic shape mismatch');let failedValues=0,maxAbsoluteError=0;
 for(let i=0;i<actual.length;i++){const e=Math.abs(actual[i]-expected[i]);maxAbsoluteError=Math.max(maxAbsoluteError,e);if(!Number.isFinite(e)||e>gate.absolute+gate.relative*Math.abs(expected[i]))failedValues++;}
 return {passed:failedValues===0,compared:actual.length,maxAbsoluteError,failedValues,gate:clone(gate)};
}
function consumed(evidence,writes){
 const proof=[];assert(evidence?.parameterSources,'Diagnostic actual-operator provenance missing');
 for(const b of writes){
  const matrix=b.weightId.endsWith('.weight'),source=evidence.parameterSources[b.weightId+(matrix?':0':'')];
  const patches=matrix?source?.tileBindings?.flatMap(t=>t.patches??[]):source?.weightFeed?.patches;
  assert(patches?.some(p=>p.weightId===b.weightId&&p.blockSHA256===b.sha256&&p.offset===b.offset&&p.count===b.count),'Prepared F32 block did not reach actual operator: '+b.weightId);
  proof.push({weightId:b.weightId,offset:b.offset,count:b.count,actualPreparedSHA256:b.sha256,packageHash:evidence.weightFeedPackageHash,nativeEpoch:evidence.weightFeedEpoch});
 }
 return proof;
}

export async function runLoraNormalRealCases({loraFile,baseFile,oracleManifest:m,sourcePins}){
 const report={status:'RUNNING',scope:'normal-weight-transactions-with-separate-controlled-k4-diagnostics',sourcePins,
  validationMode:'normal',coverage:'PARTIAL',completeAdapter:false,modelInference:false,generationReady:false,
  managerSnapshotPublished:false,managementP4NormAdoption:false,currentLiveAdmission:false,
  normalTransactions:[],normalValidatorArguments:[],controls:[],unsupportedRequests:[],
  diagnostics:{scope:'reused-controlled-caller-input-n2-k4; independent expectations stay outside normal API',runtimeCalls:[],weightComparisons:[],outputComparisons:[],newOracleGenerated:false}};
 let source,initialSourceDescriptor,feed,sdk,normalAdapter,diagnosticAdapter,queue,current,ownerLive=true,originalLive=true,originalHash=null,pendingHash;
 let managerRevision=4000,normalPrepareLoads=0,normalNativeDiagnoses=0;
 const resources={ownerId:'lora-normal-owner:'+crypto.randomUUID(),bindingId:'lora-normal-low-cross-q4',resourceGeneration:crypto.randomUUID()};
 const managerSessionId='lora-normal-queue:'+crypto.randomUUID(),records=new Map(),heldCandidates=new Set(),runtimeStates=[];
 const selected=t=>ownerLive&&current===t&&t.selected&&t.managerRevision===managerRevision;
 const resourceCurrent=()=>{try{return ownerLive===true&&source?.stats().disposed===false&&same(source.describe(),initialSourceDescriptor);}catch{return false;}};
 const weightId='blocks.0.cross_attn.q.weight',biasId='blocks.0.cross_attn.q.bias';
 const expectations=new Map();let diagnosticInput;
 try{
  assert(loraFile instanceof File&&baseFile instanceof File,'Local File picker inputs required');
  assert(sourcePins.diffusion.commit===nativeOwnerCommit,'Fixed Diffusion owner48ff normal-admission source required');
  assert(m.schemaVersion==='lora-p4-controlled-oracle/0.1-draft.1'&&m.scope==='controlled-caller-input-n2-k4'&&m.executionSource.commit==='a80db72feea60b9bd69e292e4716665c6f0ee77f','Frozen a80 controlled oracle required for diagnostics only');
  assert(m.selection.pairId==='light'&&m.selection.side==='LOW'&&same(m.selection.rows,[0,4])&&same(m.selection.columns,[0,5120])&&m.generationReady===false,'Known bounded light/LOW Q4 selection required');
  assert(loraFile.name===m.original.fileName&&loraFile.size===m.original.byteLength&&baseFile.size===m.base.identity.fileBytes,'Local File metadata differs from frozen identity');
  source=await createP4WeightSource({file:baseFile,side:'LOW'});initialSourceDescriptor=clone(source.describe());feed=createP4WeightFeed({source});
  assert(resourceCurrent(),'Actual immutable base owner is not live/current');
  report.sourceOwnerGuard={requiresOwnerLive:true,requiresActualSourceDisposedFalse:true,requiresInitialDescriptorEquality:true,initialDescriptorSHA256:await sha(new TextEncoder().encode(JSON.stringify(initialSourceDescriptor))),descriptorHashEncoding:'UTF-8 JSON.stringify of captured source.describe()',currentBeforeTransactions:true,nativeAdmissionIsIndependentLifetimeProof:false};
  const native=feed.registry(),nativeIdentity=Object.fromEntries(['modelHash','graphHash','registryHash','side','executionProfileId','scope'].map(k=>[k,native[k]]));
  report.baseIdentity={...clone(m.base.identity),freshNativeHeader:source.describe(),wholeBaseHashRecomputed:false};
  function triggerCancel(t){if(t.cancelPromise)return;t.cancelRequested=true;t.cancelPromise=queue.cancelInvocation(t.id,t.queueTarget);void t.cancelPromise.catch(()=>{});}
  const observedConsumer={...feed,
   async prepareLoad(...args){normalPrepareLoads++;return feed.prepareLoad(...args);},
   diagnose(...args){normalNativeDiagnoses++;return feed.diagnose(...args);},
   validate(candidate,context){
    assert(forbiddenNormalKeys.every(key=>!Object.hasOwn(context,key)),'Normal native validation received diagnostic arguments');
    assert(Object.keys(context).every(key=>normalNativeKeys.includes(key)),'Normal native admission received non-owner context fields');
    const t=current,entry={kind:t?.label??null,argumentKeys:Object.keys(context).sort(),hasNativeValidationMode:false,hasIndependentExpected:false,hasGate:false,hasForwardInput:false,runtimeCallsBefore:report.diagnostics.runtimeCalls.length,nativeDiagnosesBefore:normalNativeDiagnoses};
    report.normalValidatorArguments.push(entry);
    const pending=feed.validate(candidate,context);
    if(t?.cancelMode==='validation-call')triggerCancel(t);
    return Promise.resolve(pending).then(value=>{entry.completed=true;entry.runtimeCallsAfter=report.diagnostics.runtimeCalls.length;entry.nativeDiagnosesAfter=normalNativeDiagnoses;entry.nativeReceiptSchema=value?.schemaVersion;entry.numericalComparison=value?.numericalComparison;assert(entry.runtimeCallsAfter===entry.runtimeCallsBefore&&entry.nativeDiagnosesAfter===entry.nativeDiagnosesBefore,'Normal validate called a diagnostic or forward runtime');assert(value?.schemaVersion==='bernini-p4-f32-feed-admission/0.1'&&value.numericalComparison===false&&!Object.hasOwn(value,'validationMode'),'Normal admission schema or native mode translation mismatch');return value;},error=>{entry.error=errorData(error);throw error;});
   }
  };
  // Normal standalone use has neither an injected forward executor nor Text capture.
  normalAdapter=createDiffusionP4Adapter({consumer:observedConsumer,isOwnerCurrent:resourceCurrent});
  report.capabilities=clone(await normalAdapter.describeCapabilities());
  assert(report.capabilities.nativeValidationProtocol==='bernini-p4-structural-admission-diagnose/0.1'&&report.capabilities.normalValidationAvailable===true,'Owner48ff admission/diagnose protocol was not captured');
  const request={operation:'apply',sourceSha256:m.original.expectedSha256,modelHash:native.modelHash,graphHash:native.graphHash,side:'LOW',executionProfileId:native.executionProfileId,loaderPolicyId:normalAdapter.registry.loaderPolicyId,
   targets:[weightId,biasId].map(id=>{const t=native.targets.find(x=>x.weightId===id);return {weightId:id,fullShape:clone(t.fullShape),slice:{startRow:0,rowCount:4},binding:clone(t.binding),dtype:'F32',layout:'row-major',parameterRole:t.parameterRole};})};
  report.support=clone(await normalAdapter.assessSupport(request));assert(report.support.supported===true,'Known owner source/base/range binding is not supported');
  const supportBeforePrepare=normalPrepareLoads;
  for(const [kind,mutate]of [
   ['unknown-source',q=>q.sourceSha256='0'.repeat(64)],
   ['unknown-target',q=>q.targets[0].weightId='blocks.999.unknown.weight'],
   ['selected-shape-is-not-full-shape',q=>q.targets[0].fullShape=[4,5120]],
   ['outside-owner-verified-range',q=>q.targets[0].slice={startRow:4,rowCount:1}],
   ['different-model',q=>q.modelHash='0'.repeat(64)]
  ]){const q=clone(request);mutate(q);const result=await normalAdapter.assessSupport(q);assert(result.supported===false&&result.reasonCodes?.length,'Unsupported request was accepted: '+kind);report.unsupportedRequests.push({kind,result:clone(result)});}
  assert(normalPrepareLoads===supportBeforePrepare,'Unsupported capability probes prepared a native candidate');
  const originalSource={size:loraFile.size,
   async read(offset,count,{signal}={}){assert(originalLive,'Released local LoRA File capability');signal?.throwIfAborted();assert(Number.isSafeInteger(offset)&&Number.isSafeInteger(count)&&offset>=0&&count>=0&&offset+count<=loraFile.size&&count<=16*1024*1024,'Bounded LoRA tensor read required');const b=new Uint8Array(await loraFile.slice(offset,offset+count).arrayBuffer());signal?.throwIfAborted();return b;},
   async hash({signal}={}){assert(originalLive,'Released local LoRA File capability');signal?.throwIfAborted();if(!originalHash){pendingHash??=sha256Blob(loraFile,{signal});originalHash=await pendingHash;assert(originalHash===m.original.expectedSha256,'Freshly loaded selected LoRA whole hash mismatch');}signal?.throwIfAborted();return originalHash;}
  };
  sdk=await createLoraV2({sourceFactory:()=>originalSource});const inspection=await sdk.inspect({pairId:'light',noise:'low'});await originalSource.hash();
  report.original={fileName:loraFile.name,byteLength:loraFile.size,sourceSha256:originalHash,inspectionState:inspection.state,runtimeWholeHashVerified:true,historicalFourOriginalsRequired:false};
  queue=createInvocationQueue({resourceBindings:[{...resources,
   async cancel(target){const t=records.get(target.invocationId);assert(t&&same(t.queueTarget,target),'Foreign normal queue cancellation');sdk.cancel();await t.raw?.catch(()=>{});return {stopped:t.terminal===true};},
   async afterTerminal(target,outcome){const t=records.get(target.invocationId);assert(t,'Missing normal original invocation');t.afterTerminal=true;return {reusable:outcome.notStarted===true||t.terminal===true&&!(t.error instanceof AggregateError)};},
   async release(target,outcome){const t=records.get(target.invocationId);assert(t&&(outcome.notStarted===true||t.terminal),'Normal resource released before original terminal');t.resourceReleased=true;}
  }]});
  function task(label){managerRevision++;if(current)current.selected=false;const t={label,id:'normal:'+label+':'+crypto.randomUUID(),requestId:'normal:'+label+':request',activeToken:crypto.randomUUID(),managerRevision,selected:true,terminal:false,afterTerminal:false,resourceReleased:false,raw:null,cancelPromise:null};current=t;return t;}
  async function invoke(t,operation){const pending=queue.enqueue({id:t.id,requestId:t.requestId,ownerId:resources.ownerId,resourceBinding:resources.bindingId,resourceGeneration:resources.resourceGeneration,revision:t.managerRevision,activeToken:t.activeToken},({signal,target})=>{t.queueTarget=clone(target);records.set(target.invocationId,t);t.raw=(async()=>operation(signal))().catch(error=>{t.error=error;throw error;}).finally(()=>{t.terminal=true;});return t.raw;});try{return await pending;}finally{await queue.drain();}}
  async function expectation(strength){if(!expectations.has(strength)){const record=m.cases.find(c=>c.strength===strength);assert(record,'Frozen diagnostic strength unavailable');expectations.set(strength,{record,weight:await read(record.weight,Float64Array),bias:await read(record.bias,Float32Array),output:await read(record.expectedOutput,Float32Array)});}return expectations.get(strength);}
  const selectedRange={targets:[{key:'diffusion_model.'+weightId,slice:{startRow:0,rowCount:4}},{key:'diffusion_model.'+biasId,slice:{startRow:0,rowCount:4}}]};
  let firstPositiveWeightSHA;
  async function application(strength,label,{cancelMode=null,retainCandidate=false}={}){
   const t=task(label);t.cancelMode=cancelMode;t.retainCandidate=retainCandidate;t.weight=new Float32Array(20480);t.bias=new Float32Array(4);t.writes=[];
   console.log('LORA-NORMAL '+label+' strength '+strength);
   t.plan=await sdk.plan({selection:{pairId:'light',noise:'low'},strength,registry:normalAdapter.registry,loaderPolicyId:normalAdapter.registry.loaderPolicyId,diagnostic:selectedRange});
   assert(t.plan.coverage==='PARTIAL'&&t.plan.includedPatches.length===2&&t.plan.excludedTargets.length===1050&&!t.plan.generationReady,'Normal transaction lost actual PARTIAL scope');
   const before={epoch:feed.stats().epoch,packageHash:feed.stats().activePackageHash},forwardBefore=report.diagnostics.runtimeCalls.length;let result,error;
   try{result=await invoke(t,async signal=>{
    const inner=normalAdapter.createSink(t.plan),sink={...inner,async writeBlock(block){await inner.writeBlock(block);(block.weightId===weightId?t.weight:t.bias).set(block.data,block.offset);t.writes.push({weightId:block.weightId,offset:block.offset,count:block.count,sha256:block.sha256});if(cancelMode==='prepare'&&!t.cancelRequested)triggerCancel(t);}};
    t.prepared=await sdk.prepare(t.plan,{baseProvider:normalAdapter.baseProvider,sink,signal});
    try{
     const applicationBinding={schemaVersion:'lora-normal-queue-binding/0.1',managerSessionId,managerRevision:t.managerRevision,queueTarget:clone(t.queueTarget),sdk:tuple(t.plan),resourceBinding:clone(resources),managementProfileAccepted:false,snapshotPublished:false};
     const nativeTarget=normalAdapter.targetForPlan(t.plan,{validationMode:'normal',applicationBinding});
     t.target={...nativeTarget,async prepareLoad(...args){t.candidate=await nativeTarget.prepareLoad(...args);t.cleanupContext=args[1];return t.candidate;}};
     return await sdk.stage(t.prepared,t.target,{validationMode:'normal',signal,isCurrent:()=>selected(t)});
    }finally{try{if(!retainCandidate)await normalAdapter.finalize(t.plan);else heldCandidates.add(t);}finally{await sdk.release(t.prepared);}}
   });}catch(e){error=e;}
   assert(report.diagnostics.runtimeCalls.length===forwardBefore,'Normal apply invoked diagnostic NN');
   if(cancelMode){assert(t.cancelPromise,'Requested cancellation point was not reached');const reply=await t.cancelPromise;assert(error&&reply.stopConfirmed&&reply.originalTerminal&&reply.resourceReleased&&reply.reusable&&!reply.quarantined,'Normal cancel failed terminal/release barriers');assert(feed.stats().epoch===before.epoch&&feed.stats().activePackageHash===before.packageHash,'Cancelled normal candidate changed active feed');await sdk.recover(t.prepared);report.controls.push({kind:'cancel-'+cancelMode,error:errorData(error),cancelReply:reply,queueTarget:t.queueTarget,priorFeedUnchanged:true,nativeStats:feed.stats()});return t;}
   if(error)throw error;
   assert(result.state==='CONSUMER_APPLIED'&&result.validationMode==='normal'&&result.validation?.validationMode==='normal'&&result.validation?.numericalComparison===false,'Normal receipt falsely claims another mode or numerical comparison');
   assert(result.coverage==='PARTIAL'&&!result.snapshotPublished&&!result.generationReady&&result.ownership.kind==='independent-copy','Normal validation was confused with complete application coverage');
   assert(feed.stats().packages===0&&feed.stats().transactions===0&&feed.stats().candidates===heldCandidates.size,'Prepared package/candidate lifetime incomplete');
   assert(t.terminal&&t.afterTerminal&&t.resourceReleased,'Normal original invocation lifecycle incomplete');
   const normalEntry={id:label,strength,...tuple(t.plan),managerRevision:t.managerRevision,queueTarget:t.queueTarget,nativeEpoch:feed.stats().epoch,coverage:'PARTIAL',validationMode:'normal',numericalComparison:false,retainedCandidate:retainCandidate,result,nativeStats:feed.stats()};
   report.normalTransactions.push(normalEntry);
   // Test-only diagnostic checks happen after normal commit and never feed it.
   const e=await expectation(strength),w=compare(t.weight,e.weight,m.gates.weight),b=compare(t.bias,e.bias,m.gates.bias);assert(w.passed&&b.passed,'Normal final F32 differs from frozen independent diagnostic A');
   t.weightArtifact=await save(label+'-weight.f32',t.weight);t.biasArtifact=await save(label+'-bias.f32',t.bias);
   if(strength===1){if(firstPositiveWeightSHA)assert(firstPositiveWeightSHA===t.weightArtifact.sha256,'Normal reapplication accumulated an existing patch');else firstPositiveWeightSHA=t.weightArtifact.sha256;}
   report.diagnostics.weightComparisons.push({id:label,strength,weight:w,bias:b,actualWeight:t.weightArtifact,actualBias:t.biasArtifact,independentWeight:e.record.weight,independentBias:e.record.bias,writes:t.writes,performedAfterNormalCommit:true});
   return t;
  }
  const first=await application(1,'initial-one',{retainCandidate:true}),oldPatchedLease=feed.captureSource();
  await application(-1,'strength-negative');
  try{
   const heldWeight=await oldPatchedLease.readRows(weightId,0,4),heldBias=await oldPatchedLease.readVector(biasId,0,4);
   assert(compare(heldWeight.values,first.weight,{absolute:0,relative:0}).passed&&compare(heldBias.values,first.bias,{absolute:0,relative:0}).passed,'Old patched read lease changed across normal commit');
   report.controls.push({kind:'old-positive-patched-feed-read-lease',heldEpoch:oldPatchedLease.describe().epoch,currentEpoch:feed.stats().epoch,weightBytes:heldWeight.values.byteLength,biasBytes:heldBias.values.byteLength,exact:true});
  }finally{oldPatchedLease.release();}
  const currentBeforeOldRollback={epoch:feed.stats().epoch,packageHash:feed.stats().activePackageHash};
  const oldRollback=await first.target.rollback(first.candidate,first.cleanupContext);await normalAdapter.finalize(first.plan);heldCandidates.delete(first);
  assert(feed.stats().epoch===currentBeforeOldRollback.epoch&&feed.stats().activePackageHash===currentBeforeOldRollback.packageHash,'Old rollback overwrote a newer normal feed');
  report.controls.push({kind:'old-rollback-after-new-commit',oldRollback:oldRollback??null,currentFeedUnchanged:true,nativeStats:feed.stats()});
  await application(1,'reapply-one');
  await application(-1,'cancel-prepare',{cancelMode:'prepare'});await application(1,'prepare-cancel-recovery');
  await application(-1,'cancel-validation-call',{cancelMode:'validation-call'});const last=await application(1,'validation-cancel-recovery');
  assert(report.diagnostics.runtimeCalls.length===0,'Normal sequence executed a forward model');
  originalLive=false;let sourceError;try{await originalSource.hash();}catch(e){sourceError=e;}assert(sourceError,'Released LoRA source capability stayed live');
  report.controls.push({kind:'local-lora-capability-released',error:errorData(sourceError),sdkInstanceStillLive:true,immutableBaseSourceStillLive:source.stats().disposed===false,sourceOwnerGuardCurrent:resourceCurrent()});
  async function runNative(view,input){
   const runtime=await createPostSelfAttention({source:view,diagnostics:true}),call={id:current?.label??'diagnostic'};report.diagnostics.runtimeCalls.push(call);
   try{const output=await runtime.run(input,{diagnostics:true});call.completed=true;call.packageHash=output.evidence.weightFeedPackageHash;call.nativeEpoch=output.evidence.weightFeedEpoch;call.resources=clone(output.evidence.resources);return output;}
   catch(error){call.error=errorData(error);throw error;}
   finally{call.beforeDispose=clone(runtime.stats());await runtime.dispose();call.afterDispose=clone(runtime.stats());runtimeStates.push(call.afterDispose);}
  }
  diagnosticAdapter=createDiffusionP4Adapter({consumer:feed,isOwnerCurrent:resourceCurrent,run:runNative,cloneConditioning:cloneP4CapturedConditioning});
  async function activeDiagnostic(strength,label,writes){
   if(!diagnosticInput){const contract=m.inputs.conditioningContract;diagnosticInput={residual:await read(m.inputs.residual,Float32Array),timeAct1:await read(m.inputs.timeAct1,Float32Array),conditioning:captureP4FixtureConditioning({data:await read(m.inputs.conditioning,Float32Array),attentionMask:await read(m.inputs.conditioningMask,Uint8Array),shape:[1,4,4096],fixtureId:contract.fixtureId,sourceRef:{repository:'Kushyameln01/kushyameln-works',commit:m.executionSource.peerCommit,path:contract.sourceRef},controlledScope:m.scope})};}
   const t=current,e=await expectation(strength),out=await diagnosticAdapter.run(diagnosticInput,{isCurrent:()=>selected(t)}),comparison=compare(out.output,e.output,m.gates.projection);
   assert(comparison.passed,'Normal active operator output differs from historical diagnostic B');
   const proof=writes?consumed(out.evidence,writes):[];
   report.diagnostics.outputComparisons.push({id:label,strength,comparison,actualOutput:await save(label+'-output.f32',out.output),independentExpectedOutput:e.record.expectedOutput,operatorConsumption:proof,evidence:out.evidence,afterPreparedRelease:true,localLoraCapabilityLive:originalLive});
  }
  await activeDiagnostic(1,'normal-applied-after-release',last.writes);
  const restore=task('restore-base'),runtimeBeforeRestore=report.diagnostics.runtimeCalls.length;
  const restoredReceipt=await invoke(restore,signal=>normalAdapter.restoreBase({validationMode:'normal',signal,isCurrent:()=>selected(restore),applicationBinding:{managerSessionId,managerRevision:restore.managerRevision,queueTarget:restore.queueTarget,priorSdk:tuple(last.plan),managementProfileAccepted:false,snapshotPublished:false}}));
  assert(report.diagnostics.runtimeCalls.length===runtimeBeforeRestore,'Normal base restoration ran diagnostic inference');
  assert(restoredReceipt.validationMode==='normal'&&restoredReceipt.validation?.numericalComparison===false,'Base restoration used diagnostic validation');
  assert(feed.stats().activePatchBytes===0&&feed.stats().packages===0&&feed.stats().candidates===0&&feed.stats().readLeases===0,'Normal immutable base restoration left live patch resources');
  report.controls.push({kind:'normal-immutable-base-restore',receipt:restoredReceipt,managerRevision:restore.managerRevision,queueTarget:restore.queueTarget,nativeStats:feed.stats(),originalTerminal:restore.terminal,afterTerminal:restore.afterTerminal,resourceReleased:restore.resourceReleased});
  await activeDiagnostic(0,'normal-restored-base',null);
  assert(report.diagnostics.runtimeCalls.length===2&&report.diagnostics.runtimeCalls.every(c=>c.completed===true),'Exactly two separately diagnosed forward calls required');
  report.queue=queue.inspect();report.finalNativeStats=feed.stats();report.baseSourceStats=source.stats();report.runtimeStates=runtimeStates;report.sourceOwnerGuard.currentAfterUnpatchedBaseDiagnostic=resourceCurrent();assert(resourceCurrent(),'Immutable base owner lost before terminal cleanup');
  assert(normalNativeDiagnoses===0,'Normal transaction executed native diagnose');
  report.nativePrepareLoadCount=normalPrepareLoads;report.normalNativeDiagnoseCount=normalNativeDiagnoses;report.managementQueueSource=sourcePins.queue;report.resourceBinding=resources;
  report.diagnostics.oracleReuse={generationSource:m.executionSource,selection:m.selection,gates:m.gates,sourceWholeHashGeneratedByOracle:false,newOracleGenerated:false};
  report.producerAuthenticated=false;report.naturalP2OrN2AcceptanceClaimed=false;report.status='PASS_LORA_NORMAL_REAL_PARTIAL';
 }catch(error){report.status='FAIL';report.error=String(error.stack??error);report.queue=queue?.inspect();report.nativeStats=feed?.stats();}
 finally{
  const errors=[],cleanup={};async function cleanupStep(name,operation){try{await operation();cleanup[name]=true;}catch(error){cleanup[name]=false;errors.push({step:name,...errorData(error)});}}
  await cleanupStep('queueDrained',()=>queue?.drain());
  for(const t of heldCandidates)await cleanupStep('retainedCandidateFinalized:'+t.label,()=>normalAdapter?.finalize(t.plan));
  await cleanupStep('queueDisposed',()=>queue?.dispose());await cleanupStep('sdkDisposed',()=>sdk?.dispose());await cleanupStep('feedDisposed',()=>feed?.dispose());await cleanupStep('sourceDisposed',()=>source?.dispose());ownerLive=false;
  report.cleanup={...cleanup,afterFeed:feed?.stats(),afterSource:source?.stats(),sourceOwnerGuardCurrentAfterDispose:resourceCurrent()};
  if(errors.length){report.status='FAIL';report.cleanup.errors=errors;}
  report.currentLiveAdmission=false;
 }
 return report;
}

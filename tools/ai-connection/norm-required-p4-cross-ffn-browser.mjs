/** Same-realm holding protocol. The private model is a local File; the source
 * bytes and owner callbacks are fixed by Node preflight. No P4 math lives here. */
import {loadReferenceSet} from '../../docs/shared/ai-connection/reference-loader.mjs';
import {validateArtifactDescriptor} from '../../docs/shared/ai-connection/descriptor.mjs';
import {createAdoptedWktensorCodec} from '../../docs/shared/ai-connection/codecs/wktensor.mjs';
import {createOwnedArtifactStore} from '../../docs/shared/ai-connection/adapters/artifacts.mjs';
import {createNormRequiredP4CrossFfnAdapter} from '../../docs/shared/ai-connection/adapters/norm-required-p4-cross-ffn.mjs';
import {createP4OutputPublisher} from '../../docs/shared/ai-connection/adapters/p4-cross-ffn/package.mjs';
import {P4_FILES,verifyP4CrossFfnSource} from '../../docs/shared/ai-connection/adapters/p4-cross-ffn/source.mjs';
import {P4_PINS,prepareP4NormInputs,p4OutputSpecs} from '../../docs/shared/ai-connection/adapters/p4-cross-ffn/declarations.mjs';
const demand=(v,message)=>{if(!v)throw Error(message);};
const from64=value=>Uint8Array.from(atob(value),v=>v.charCodeAt(0));
function to64(bytes){let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
const f32=value=>{const bytes=from64(value);demand(bytes.byteLength%4===0&&new Uint8Array(Uint32Array.of(0x01020304).buffer)[0]===4,'Little-endian aligned compact F32 transport required');return new Float32Array(bytes.buffer);};
/** This lifecycle bundle owns exactly the original source, feed and stage.
 * Constructors receive only native keys; target/signal remain in the queue. */
export async function createP4OwnerBundle({createP4WeightSource,createP4WeightFeed,createPostSelfAttention,nativeFile,side,bridgeBytes,mathBytes,attentionBytes,onLifecycle=()=>{}}){
 let source,feed,owner,constructorRecovery=null,disposed=false,cleanupFailed=false;
 const stats=()=>{const stage=owner?.stats?.()??null,weightFeed=feed?.stats?.()??null,originalSource=source?.stats?.()??null;return {disposed:disposed&&stage?.disposed!==false&&weightFeed?.disposed!==false&&originalSource?.disposed!==false,activeORTSessions:stage?.activeORTSessions??null,cleanupPending:!disposed&&(cleanupFailed||stage?.cleanupPending===true),stage,feed:weightFeed,source:originalSource};};
 const release=async recover=>{
  if(disposed)return stats();
  try{
   if(constructorRecovery){await constructorRecovery();constructorRecovery=null;onLifecycle({phase:'constructor-recovered'});}
   if(owner){await (recover&&typeof owner.recover==='function'?owner.recover():owner.dispose());onLifecycle({phase:recover?'stage-recovered':'stage-disposed',stats:owner.stats()});}
   if(feed){await feed.dispose();onLifecycle({phase:'feed-disposed',stats:feed.stats()});}
   if(source){await source.dispose();onLifecycle({phase:'source-disposed',stats:source.stats()});}
   disposed=true;cleanupFailed=false;return stats();
  }catch(error){cleanupFailed=true;throw error;}
 };
 try{
  source=await createP4WeightSource({file:nativeFile,side,bridgeBytes});onLifecycle({phase:'source-created',stats:source.stats()});
  feed=createP4WeightFeed({source,includeTextEmbedding:false});onLifecycle({phase:'feed-created',stats:feed.stats()});
  owner=await createPostSelfAttention({source:feed,mathBytes,attentionBytes,disposeSource:false});onLifecycle({phase:'stage-created',stats:owner.stats()});
  return {owner,stats,dispose:()=>release(false),recover:()=>release(true)};
 }catch(error){
  if(typeof error.recover==='function')constructorRecovery=error.recover.bind(error);
  try{await release(false);}catch(cleanup){error.cleanupError=cleanup;error.recover=()=>release(true);}
  throw error;
 }
}
export function prepareP4HoldingManagement({referenceSet,ownerCase,sourceProof,deviceState,managerSourceRef,artifactRef,binding:providedBinding,target:providedTarget}){
 const resourceState=structuredClone(deviceState.resourceState);
 const binding=providedBinding??{ownerId:resourceState.ownerId,sessionId:'managed:p4:'+crypto.randomUUID(),bindingId:'managed:p4:'+crypto.randomUUID(),resourceGeneration:'managed:p4:'+crypto.randomUUID(),sourceRef:sourceProof.sourceRef,buildId:sourceProof.buildId,kernelDigest:P4_PINS.mathWasm.sha256,byteLength:P4_PINS.mathWasm.byteLength,bridgeWasmSHA256:P4_PINS.bridgeWasm.sha256,attentionWasmSHA256:P4_PINS.attentionWasm.sha256};
 const target=providedTarget??{requestId:'managed:p4:'+crypto.randomUUID(),managerSessionId:binding.sessionId,managerRevision:1,activeToken:'managed:p4:'+crypto.randomUUID(),resourceBinding:{ownerId:binding.ownerId,bindingId:binding.bindingId,resourceGeneration:binding.resourceGeneration},localRevisionBindings:{producer:1,consumer:1}};
 const conditioningMetadata=structuredClone(ownerCase.inputCohort.conditioningBinding);
 const edgeInput=prepareP4NormInputs({referenceSet,managerSourceRef,binding,target,conditioningMetadata,savedInputBindings:structuredClone(ownerCase.inputCohort.savedInputBindings),validationSpec:ownerCase.norm.validationSpec,numericRequirement:ownerCase.norm.numericRequirement,resourceState,extensions:ownerCase.extensions??{}});
 // Artifact identity is selected by the existing declaration helper. The
 // publisher uses its package prefix, preserving #blockOutput as principal.
 if(artifactRef)demand(edgeInput.artifact.artifactId===artifactRef+'#blockOutput','Explicit package reference differs from the prepared norm artifact');
 const current={target,activeBindings:edgeInput.activeBindings,resourceState};
 return {binding,target,edgeInput,resourceState,readCurrent:()=>current,artifactRef:edgeInput.artifact.artifactId.replace(/#blockOutput$/,'')};
}
/** Only fixed owner functions calculate numerical PASS. The management loop
 * supplies owner-provided F32 references and binds the returned receipt. */
export async function validateP4OwnerOutput(args,{references,gates,compare,verifyParameterIdentities,ownerJudgeSource,parameterJudgeSource}){
 demand(typeof compare==='function'&&typeof verifyParameterIdentities==='function','Pinned actual owner functions required');
 const names=Object.keys(p4OutputSpecs(args.validationSpec.textRows)),comparisons={};
 const modes=args.validationSpec.comparisonModes;demand(Array.isArray(modes)&&(modes.length===1&&modes[0]==='composed'||modes.length===2&&modes[0]==='local'&&modes[1]==='composed'),'Explicit composed25 or local+composed50 scope required');
 for(const mode of modes){
  demand(references[mode]?.arrays&&Object.keys(references[mode].arrays).length===25,'All25 independent owner reference arrays required: '+mode);
  for(const name of names){const actual=args.output.arrays[name],expected=Float32Array.from(references[mode].arrays[name]);demand(actual.length===expected.length,'Full output extent required: '+name);comparisons[mode+':'+name]=await compare(actual,expected,gates[mode]);}
 }
 const parameterProof=await verifyParameterIdentities(args.output.evidence.parameterSources,references[modes[0]].parameterIdentities);
 demand(parameterProof?.verifiedParameterCount===29&&parameterProof?.completeSelectionCoverage===true,'Owner must prove all29 independent parameter identities');
 const count=Object.values(comparisons).reduce((sum,c)=>sum+c.values,0);
 demand(Object.keys(comparisons).length===args.validationSpec.comparisonCount&&count===args.validationSpec.count&&args.validationSpec.strictParameterChecks===29,'Declared owner comparison count/extent/parameter scope differs');
 return {...args.validationSpec,passed:true,failedValues:0,target:args.target,inputHashes:args.inputHashes,outputBinding:args.outputBinding,referenceRef:args.referenceRef,comparisons,parameterProof,ownerJudgeSource,parameterJudgeSource,managementReimplementedNumericalMath:false};
}
/** Require owner-provided, common-schema-valid publication sidecars before
 * constructing a native owner. Git source refs remain metadata, not identities
 * invented by this runner. */
export function createP4HoldingPublisher({ownerCase,storage,artifactRef,ownerId,artifactDescriptor,registry,managerSource=[]}){
 if(!ownerCase?.provenance||!ownerCase?.lineage||!artifactDescriptor)throw Object.assign(Error('Explicit publication provenance, lineage and prepared artifact descriptor required'),{code:'P4_PUBLICATION_SIDECAR_REQUIRED'});
 const descriptor={...structuredClone(artifactDescriptor),provenance:structuredClone(ownerCase.provenance),lineage:structuredClone(ownerCase.lineage),extensions:structuredClone(ownerCase.extensions??{})},checked=validateArtifactDescriptor(descriptor,registry);
 if(!checked.valid)throw Object.assign(Error('Publication sidecars do not satisfy the existing artifact schema'),{code:'P4_PUBLICATION_SIDECAR_INVALID',errors:checked.errors});
 if(ownerCase.provenance.transformTraceRefs.length&&!ownerCase.trace)throw Object.assign(Error('Explicit trace records required for publication trace references'),{code:'P4_PUBLICATION_TRACE_REQUIRED'});
 const publisher=createP4OutputPublisher({storage,artifactRef,receiptRef:artifactRef+'/receipt.json',ownerId,textRows:ownerCase.textRows,sourceRef:P4_PINS.sourceRef,provenance:ownerCase.provenance,lineage:ownerCase.lineage,extensions:{...ownerCase.extensions,'p4:management-source':{schemaId:'works:source-receipts',schemaVersion:'1',requiredForUse:false,data:managerSource}}});
 return args=>publisher({...args,...(ownerCase.trace?{trace:structuredClone(ownerCase.trace)}:{})});
}
/** Async runner API for an already verified owner case and actual capabilities.
 * This API also supports holding-harness cancellation/recovery without making
 * a successful boundary fixture into actual Text numerical acceptance. */
export async function runP4HoldingCase({verifiedOwnerCase,referenceSet,verifiedSource,conditioningModule,nativeModules,nativeFile,inputs,deviceState,managerSourceRef,diagnosticBudget,storage,artifactStore=createOwnedArtifactStore(),compare,verifyParameterIdentities,managerSource=[],onProgress=()=>{}}){
 const ownerCase=structuredClone(verifiedOwnerCase);
 demand(ownerCase?.ownerProvided===true,'Explicit verified owner-provided case required');
 // Own all caller inputs before the first await. Capture/clone use the one
 // imported owner conditioning module and preserve its recognition brand.
 const residual=new Float32Array(inputs.residual),timeAct1=new Float32Array(inputs.timeAct1);
 const conditioning=ownerCase.inputClass==='native-text-encoder'?conditioningModule.captureP4Conditioning(inputs.conditioning):conditioningModule.captureP4FixtureConditioning(inputs.conditioning);
 const capture=conditioningModule.cloneP4CapturedConditioning(conditioning);
 if(ownerCase.inputClass==='native-text-encoder'){
  // Actual Text mode admits the functions from these exact verified ES module
  // instances. Callback injection is available only to boundary fixtures.
  const [actualConditioning,actualSource,actualFeed,actualStage,actualJudge]=await Promise.all([import('/native/docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs'),import('/native/docs/shared/diffusion-models/ort-bridge/post-self-attention/source.mjs'),import('/native/docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs'),import('/native/docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs'),import('/native/docs/shared/diffusion-models/diagnostics/self-attention-tail/common.mjs')]);
  demand(conditioningModule===actualConditioning&&nativeModules.createP4WeightSource===actualSource.createP4WeightSource&&nativeModules.createP4WeightFeed===actualFeed.createP4WeightFeed&&nativeModules.createPostSelfAttention===actualStage.createPostSelfAttention&&compare===actualJudge.compare&&verifyParameterIdentities===globalThis.__p4OwnerParameters,'Actual same-realm fixed owner functions required');
 }
 const q=prepareP4HoldingManagement({referenceSet,ownerCase,sourceProof:verifiedSource,deviceState,managerSourceRef});
 const lifecycle=[],bundles=[];let adapter;
 const cancelPhase=ownerCase.lifecycle?.cancelAtProgressPhase,cancelLifecyclePhase=ownerCase.lifecycle?.cancelAtLifecyclePhase;let cancelRequested=false,cancelPromise=null,cancelError=null;
 const requestCancel=()=>{if(cancelRequested)return;cancelRequested=true;cancelPromise=adapter.cancel(q.target).catch(error=>{cancelError={code:error.code??null,message:String(error.message)};});};
 let nativeCalls=0;
 const nativeFactory=async({target,signal})=>{const bundle=await createP4OwnerBundle({...nativeModules,nativeFile,side:ownerCase.side,onLifecycle:event=>{lifecycle.push(event);if(cancelLifecyclePhase===event.phase)requestCancel();}});bundles.push(bundle);const original=bundle.owner;return {...bundle,owner:{describe:()=>original.describe(),stats:()=>original.stats(),run:args=>{nativeCalls++;return original.run(args);}}};};
 const publishOutput=createP4HoldingPublisher({ownerCase,storage,artifactRef:q.artifactRef,ownerId:q.binding.ownerId,artifactDescriptor:q.edgeInput.artifact,registry:q.edgeInput.registry,managerSource});
 adapter=createNormRequiredP4CrossFfnAdapter({nativeFactory,conditioningClone:conditioningModule.cloneP4CapturedConditioning,conditioningSnapshot:conditioningModule.snapshotP4CapturedConditioning,conditioningMetadataBytes:conditioningModule.p4ConditioningMetadataBytes,verifiedSource,binding:q.binding,artifactStore,executionScope:ownerCase.inputClass==='native-text-encoder'?'actual-native-text-p4':'boundary-fixture'});
 const judgeSource=P4_FILES.find(f=>f.path.endsWith('/self-attention-tail/common.mjs')),parameterSource=P4_FILES.find(f=>f.path==='tools/diffusion-models/p4-cross-ffn-browser.py');
 const validation=args=>validateP4OwnerOutput(args,{references:ownerCase.runtimeReferences,gates:ownerCase.runtimeGates,compare,verifyParameterIdentities,ownerJudgeSource:judgeSource.sourceRef,parameterJudgeSource:parameterSource.sourceRef});
 let receipt,releaseError=null,recovery=null,disposition=null;
 try{
  const run=adapter.run({referenceSet,edgeInput:q.edgeInput,target:q.target,inputs:{residual,timeAct1,conditioning:capture},readCurrent:q.readCurrent,diagnosticBudget,validationSpec:ownerCase.norm.validationSpec,validateOutput:validation,publishOutput,onProgress:event=>{onProgress(event);if(cancelPhase&&event?.phase===cancelPhase)requestCancel();}});
  try{const result=await run;const {outputHandle,...publicResult}=result;receipt={...publicResult,outputRetainedInPrivatePackage:true};}catch(error){receipt={status:cancelRequested?'cancelled':'failed',actualNumericalAccepted:false,error:{code:error.code??null,name:error.name,message:String(error.message)},...(cancelRequested?{cancellation:{requested:true,atProgressPhase:cancelPhase??null,atLifecyclePhase:cancelLifecyclePhase??null,originalTerminalAwaited:true}}:{}),queue:adapter.inspect()};}await cancelPromise;
  if(ownerCase.lifecycle?.recoverOnReleaseFailure===true){
   try{
    const result=await adapter.recover(q.target);recovery={succeeded:true,result,requiresNewGeneration:true};
    if(ownerCase.lifecycle.newResourceGeneration){recovery.rebind=adapter.rebind({resourceGeneration:ownerCase.lifecycle.newResourceGeneration});recovery.newOwnerRunPerformed=false;}
   }catch(error){if(error.code==='P4_RECOVERY_REQUIRED')recovery={succeeded:null,state:'NOT_EXERCISED_NO_RETAINED_RELEASE_FAILURE',requiresNewGeneration:true};else recovery={succeeded:false,error:{code:error.code??null,message:String(error.message)},requiresNewGeneration:true};}
  }
 }finally{
  try{disposition=await adapter.dispose();if(disposition.recoveryRequired?.length)releaseError={code:'P4_RECOVERY_REQUIRED',message:'Original native owner remains quarantined; exact target recovery required'};}catch(error){releaseError={code:error.code??null,message:String(error.message)};}
  artifactStore.clear();
 }
 const nativeResources=bundles.map(b=>b.stats());
 return {...receipt,lifecycle,nativeResources,disposition,releaseError,recovery,cancellationRequested:cancelRequested,cancelError,nativeCalls,releaseVerified:!releaseError&&nativeResources.every(s=>s.disposed&&s.activeORTSessions===0),resourceAcceptance:{state:'DIAGNOSTIC_LIMITS_ONLY',staticReturnedOutputBytes:4*(30720*ownerCase.textRows+198656),nativeORTMemoryBytes:null,observedORTAllocatorPeakBytes:null,hostPeakBytes:null,totalPeakBytes:null,deviceObservation:deviceState,scope:'Static extent and owner capacities are distinct from full process/host/ORT allocator peak'},generationReady:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};
}
export async function runNormRequiredP4CrossFfnBrowser(plan){
 const files=new Map();for(const pin of P4_FILES){const response=await fetch('/native/'+pin.path);demand(response.ok,'Verified public native source unavailable: '+pin.path);files.set(pin.path,new Uint8Array(await response.arrayBuffer()));}
 const verifiedSource=await verifyP4CrossFfnSource({files});
 const conditioningModule=await import('/native/docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs');
 const [{createP4WeightSource},{createP4WeightFeed},{createPostSelfAttention},{compare}]=await Promise.all([import('/native/docs/shared/diffusion-models/ort-bridge/post-self-attention/source.mjs'),import('/native/docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs'),import('/native/docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs'),import('/native/docs/shared/diffusion-models/diagnostics/self-attention-tail/common.mjs')]);
 const referenceSet=await loadReferenceSet({catalogPath:plan.catalogPath,catalogBytes:Uint8Array.from(plan.catalogBytes),files:new Map(plan.referenceFiles.map(([path,bytes])=>[path,Uint8Array.from(bytes)])),expectedCatalogSha256:P4_PINS.catalogRef.sha256});
 const runtimeReferences=Object.fromEntries(Object.entries(plan.payloads.references).map(([mode,reference])=>[mode,reference.arrayBuffers?{...reference,arrays:Object.fromEntries(Object.entries(reference.arrayBuffers).map(([name,bytes])=>[name,f32(bytes)]))}:reference]));
 const ownerCase={...plan.ownerCase,norm:{numericRequirement:plan.payloads.numericRequirement,validationSpec:plan.payloads.validationSpec},runtimeReferences,runtimeGates:plan.payloads.gates};
 const tensor=await createAdoptedWktensorCodec().decode(from64(plan.payloads.textBytes));
 const storage={write:(path,bytes)=>globalThis.__p4Write(path,to64(bytes)),async read(path){const bytes=await globalThis.__p4Read(path);return bytes===null?null:from64(bytes);}};
 const get=path=>new Uint8Array(files.get(path));
 return runP4HoldingCase({verifiedOwnerCase:ownerCase,referenceSet,verifiedSource,conditioningModule,nativeModules:{createP4WeightSource,createP4WeightFeed,createPostSelfAttention,bridgeBytes:get('docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm'),mathBytes:get('docs/shared/diffusion-models/ort-bridge/post-self-attention/kernel.wasm'),attentionBytes:get('docs/shared/diffusion-models/ort-bridge/stream-attention/kernel.wasm')},nativeFile:document.querySelector('#original-model').files[0],inputs:{residual:f32(plan.payloads.saved.residual),timeAct1:f32(plan.payloads.saved.timeAct1),conditioning:tensor},deviceState:plan.deviceState,managerSourceRef:{repository:P4_PINS.repository,commit:plan.managerCommit,path:'tools/ai-connection/norm-required-p4-cross-ffn-browser.mjs'},diagnosticBudget:plan.diagnosticBudget,storage,compare,verifyParameterIdentities:globalThis.__p4OwnerParameters,managerSource:plan.managerSource});
}

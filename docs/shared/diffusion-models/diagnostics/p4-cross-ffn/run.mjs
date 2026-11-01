// Observer installation precedes every operator import/constructor. Private
// values leave only through privateArtifactText, consumed directly by Python.
import {createResourceObserver} from '../resource-observer/observer.mjs';

const demand=(value,message)=>{if(!value)throw Error(message);};
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),x=>x.toString(16).padStart(2,'0')).join('');
const FIXTURE_DATA_SHA256='0cd4fa87e24e6d875207aca52cc214a1b46157a886d4c090fb7c5cfc9a5925ae';
const FIXTURE_MASK_SHA256='252c0b6b080fa045acfcd1437f693f3be2be2ac8223ea525d492fa19ab028942';
const FIXTURE_CONTRACT_SHA256='17102144ab54236bc0dc28d3e2d083b5a5c850c48f0ada86aa4b06c89bab6338';

/** Private JSON transport: preserve -0 for JS and Python JSON readers. */
export function stringifyP4DiagnosticArtifact(value){
 const seen=new WeakSet();
 function encode(item,inArray=false){
  if(item===null)return 'null';
  if(item===undefined&&inArray)return 'null';
  if(typeof item==='number'){demand(Number.isFinite(item),'Diagnostic JSON numbers must be finite');return Object.is(item,-0)?'-0.0':JSON.stringify(item);}
  if(typeof item==='string'||typeof item==='boolean')return JSON.stringify(item);
  demand(item&&typeof item==='object','Diagnostic JSON contains an unsupported value');
  demand(!seen.has(item),'Diagnostic JSON cycle is unsupported');
  demand(Array.isArray(item)||Object.getPrototypeOf(item)===Object.prototype||Object.getPrototypeOf(item)===null,'Diagnostic JSON object type is unsupported');
  seen.add(item);let text;
  if(Array.isArray(item))text='['+Array.from(item,v=>encode(v,true)).join(',')+']';
  else{
   demand(Reflect.ownKeys(item).every(key=>typeof key==='string'),'Diagnostic JSON symbol fields are unsupported');
   const entries=[];for(const key of Object.keys(item)){const descriptor=Object.getOwnPropertyDescriptor(item,key);demand(Object.hasOwn(descriptor,'value'),'Diagnostic JSON accessors are unsupported');if(descriptor.value!==undefined)entries.push(JSON.stringify(key)+':'+encode(descriptor.value));}
   text='{'+entries.join(',')+'}';
  }
  seen.delete(item);return text;
 }
 return encode(value);
}

/** Byte admission precedes observer installation and every native constructor. */
export async function verifyP4FixtureBinding(payload){
 const conditioning=payload?.conditioning,bindings=payload?.inputBindings;
 demand(JSON.stringify(conditioning?.shape)==='[1,4,4096]'&&Array.isArray(conditioning.data)&&conditioning.data.length===16384,'Frozen conditioning shape/count required');
 demand(Array.isArray(conditioning.attentionMask)&&conditioning.attentionMask.length===4&&conditioning.attentionMask.every(v=>v===0||v===1),'Frozen conditioning mask shape/values required');
 const data=Float32Array.from(conditioning.data),mask=Uint8Array.from(conditioning.attentionMask);
 demand(data.every(Number.isFinite),'Finite conditioning data required');
 const dataHash=await sha(data),maskHash=await sha(mask);
 demand(dataHash===bindings?.conditioningDataSHA256,'Declared conditioning data hash mismatch before native construction');
 demand(maskHash===bindings?.conditioningMaskSHA256,'Declared conditioning mask hash mismatch before native construction');
 demand(dataHash===FIXTURE_DATA_SHA256&&maskHash===FIXTURE_MASK_SHA256&&bindings.fixtureContractSHA256===FIXTURE_CONTRACT_SHA256,'Frozen conditioning fixture/contract hash mismatch before native construction');
 return {conditioningDataSHA256:dataHash,conditioningMaskSHA256:maskHash,fixtureContractSHA256:FIXTURE_CONTRACT_SHA256};
}
const metricContainers=new Set(['source','base','hike','linear','math','attention','resources','elapsed','before','after','operatorSources','inputHashes','outputHashes','weightFeed']);
const metricFlags=new Set(['busy','disposed','cleanupPending','pendingTensors','workspaceReused','innerSplit','completedRuns','cancelledRuns','runs','scoreRuns','sessionCreations','activeORTSessions','projectionTiles','tiles','attentionTiles','epoch','packageHash','activePackageHash','memoryIdentity','graphSHA256','scoreGraphSHA256','mathWasmSHA256','bridgeWasmSHA256','attentionWasmSHA256','ortVersion','fullFileHashRecomputed']);
const metricName=key=>metricFlags.has(key)||/(?:Bytes|Count|Calls|Reads|Ms|SHA256|Hash|Epoch|TrafficBytes)$/.test(key);
/** Whitelist numeric counters, immutable hashes and their known containers. */
export function publicMetrics(value){
 if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||Array.isArray(value))return {};
 const out={};for(const [key,item]of Object.entries(value)){
  if(metricContainers.has(key)&&item&&typeof item==='object'&&!Array.isArray(item)&&!ArrayBuffer.isView(item)){const nested=publicMetrics(item);if(Object.keys(nested).length)out[key]=nested;}
  else if(metricName(key)&&(item===null||typeof item==='boolean'||typeof item==='string'||typeof item==='number'&&Number.isFinite(item)))out[key]=item;
 }return out;
}

const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value??{},key)).map(key=>[key,value[key]]));
const parameterFields=['originalKey','weightId','fullShape','storageDtype','computeDtype','layout','columns','absoluteByteOffset','originalAbsoluteByteOffset','byteLength','selectedByteLength','elementCount','selectedElementCount','rowStart','rowCount','elementOffset','selectedRows','selectedRawBytes','selectedEffectiveBytes','rawSHA256','decodedF32SHA256','effectiveF32SHA256','scaleSHA256','quantConfigSHA256','fp8ProfileId','rawHashMeaning','effectiveHashMeaning'];
const patchFields=['weightId','offset','count','blockSHA256'];
function publicFeed(binding){return {...pick(binding,['rowStart','rowCount','epoch','packageHash','kind','patchBytes']),...(Array.isArray(binding?.patches)?{patches:binding.patches.map(p=>pick(p,patchFields))}:{})};}
/** Actual consumed parameter selections, with no decoded values or scalar scales. */
export function publicParameterSources(sources){
 return Object.fromEntries(Object.entries(sources??{}).map(([key,value])=>[key,{
  ...pick(value,parameterFields),
  ...(value.binding?{binding:pick(value.binding,['kind','name'])}:{}),
  ...(value.scaleSource?{scaleSource:pick(value.scaleSource,['originalKey','fullShape','storageDtype','absoluteByteOffset','byteLength'])}:{}),
  ...(value.quantConfigSource?{quantConfigSource:pick(value.quantConfigSource,['originalKey','fullShape','storageDtype','absoluteByteOffset','byteLength'])}:{}),
  ...(value.weightFeed?{weightFeed:publicFeed(value.weightFeed)}:{}),
  ...(Array.isArray(value.tileBindings)?{tileBindings:value.tileBindings.map(publicFeed)}:{})
 }]));
}

/** Preserve execution semantics separately from counter-only projections. */
export function publicEvidence(evidence){
 const semantics=['schemaVersion','executionProfileId','scope','inputBinding','producerAuthenticated','side','modelHash','headerSHA256','fullFileSHA256Verified','fullFileHashRecomputed','weightFeedPackageHash','weightFeedEpoch','graphSHA256','scoreGraphSHA256','headCount','headDim','queryRows','scoreGraphWorkspaceRows','unusedQueryWorkspaceRows','keyCount','phantomKeys','rope','qkNormWidth','normEpsilon','norm3Affine','crossResidualGate','timeProjectionChunks','ffnShape','gelu','gateScalePlusOne','ffnModulationScalePlusOne','productionHiddenVerified','originalWorkflowInputsVerified','originalProductionPrecisionVerified','fullBlockVerified','modelInference','lowIsHighHandoff','generationReady','load','predict','sample'];
 const cond=evidence.conditioning;
 return {...publicMetrics(evidence),...pick(evidence,semantics),
  ...(cond?{conditioning:{...pick(cond,['schemaVersion','rows','shape','meaning','maskedRowsRetained','maskApplied']),inputClass:cond.metadata?.inputClass??null,producerOwner:cond.metadata?.producer?.owner??null}}:{}),
  parameterSources:publicParameterSources(evidence.parameterSources),
  ...(Array.isArray(evidence.headEvidence)?{headEvidence:evidence.headEvidence.map(row=>pick(row,['head','keyCount','tiles','logicalFinalKeys','denominatorsSHA256','rowMaxSHA256']))}:{})};
}

export async function outputIdentities(arrays,shapes){
 demand(Object.keys(arrays).length===Object.keys(shapes).length,'All named output arrays required');
 const out={};for(const [name,shape]of Object.entries(shapes)){
  const value=arrays[name];demand(value instanceof Float32Array&&value.length===shape.reduce((a,b)=>a*b,1),'Exact output shape: '+name);
  demand(value.every(Number.isFinite),'finite output required: '+name);out[name]={shape:[...shape],elements:value.length,bytes:value.byteLength,sha256:await sha(value)};
 }return out;
}

async function rejection(operation,pattern){let error;try{await operation();}catch(e){error=e;}demand(error&&pattern.test(String(error)),'Expected rejection '+pattern);return {rejected:true,errorType:error.name};}
function workspace(stats){
 const out={};function walk(value,path){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(key==='memoryBytes'||key==='arenaBytes'||key==='memoryIdentity')out[path+'.'+key]=item;else if(['source','base','hike','math','attention'].includes(key))walk(item,path+'.'+key);}}walk(stats,'owner');return out;
}

/** Exposed for a separately bound final-F32 patch diagnostic. No patch math. */
export async function createP4DiagnosticOwner(file,side){
 const [{createP4WeightSource},{createP4WeightFeed},{createPostSelfAttention}]=await Promise.all([
  import('../../ort-bridge/post-self-attention/source.mjs'),import('../../ort-bridge/post-self-attention/weights.mjs'),import('../../ort-bridge/post-self-attention/stage.mjs')]);
 let source=null,feed=null,owner=null;
 const dispose=async()=>{await owner?.dispose();await feed?.dispose();await source?.dispose();};
 try{source=await createP4WeightSource({file,side});feed=createP4WeightFeed({source});owner=await createPostSelfAttention({source:feed});return {source,feed,owner,dispose};}
 catch(error){try{await dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'P4 diagnostic construction cleanup');}throw error;}
}

export async function runP4CrossFfn(file,payload){
 const conditioningBitBinding=await verifyP4FixtureBinding(payload);
 const observer=createResourceObserver({modules:payload.modules});observer.install();
 let current=null,oldTail=null,probe=null;const phases=[],boundaries={conditioningBitBinding:{passed:true,...conditioningBitBinding}};let progressCount=0;
 const capture=(phase,stats={},namedSpans=[],details={})=>{const memory=observer.snapshot(phase),row={phase,memory,stats:publicMetrics(stats),namedSpans,observableDistinctCapacityBytes:memory.memories.every(v=>v.capacityBytes!==null)?memory.memories.reduce((n,v)=>n+v.capacityBytes,0):null,scope:'Observed distinct physical linear-memory capacity; disposed memories can remain alive until GC. Not allocator use or whole-pipeline peak.',...details};phases.push(row);return row;};
 const input=conditioning=>({residual:Float32Array.from(payload.residual),timeAct1:Float32Array.from(payload.timeAct1),conditioning});
 const oldOutputs={};
 try{
  const {captureP4FixtureConditioning}=await import('../../ort-bridge/post-self-attention/conditioning.mjs');
  const conditioning=()=>captureP4FixtureConditioning({...payload.conditioning,data:Float32Array.from(payload.conditioning.data),attentionMask:Uint8Array.from(payload.conditioning.attentionMask)});
  demand(payload.side===payload.trustedInputs.side&&payload.trustedInputs.tokens===2&&payload.trustedInputs.blockIndex===0,'Pinned saved side/block/N2 scope required');
  demand(await sha(Float32Array.from(payload.residual))===payload.savedArrayIdentities.residual.sha256,'Saved residual data binding mismatch');
  demand(await sha(Float32Array.from(payload.timeAct1))===payload.trustedInputs.fullPrefix.timeAct1SHA256,'Saved timeAct1 data binding mismatch');
  capture('before-p4-construction',{},[],{oldTailConstructed:false,privateParsedPayloadHeapBytes:null});
  current=await createP4DiagnosticOwner(file,payload.side);await observer.settle();
  const constructedStats=current.owner.stats(),constructedWorkspace=workspace(constructedStats);
  const alone=capture('p4-constructed-alone',constructedStats,[],{oldTailConstructed:false,activeP4ORTSessions:constructedStats.activeORTSessions});
  const aborter=new AbortController();let firstTile=false,reentry;
  boundaries.cancelAtFirstActualWeightTile=await rejection(()=>current.owner.run({...input(conditioning()),signal:aborter.signal,onProgress(event){if(firstTile)return;demand(event.stage==='projection'&&event.operator==='text_embedding.0.weight'&&event.sourceRowStart===0,'First actual weight tile required');firstTile=true;reentry=rejection(()=>current.owner.run(input(conditioning())),/busy/i);aborter.abort();}}),/abort/i);
  demand(firstTile,'Cancellation must reach a real weight tile');boundaries.busyReentry=await reentry;
  demand(JSON.stringify(workspace(current.owner.stats()))===JSON.stringify(constructedWorkspace),'P4 cancellation changed fixed Hike workspace');
  boundaries.workspaceAfterAbort={passed:true};capture('p4-aborted-first-weight-tile',current.owner.stats());
  // The old owner is constructed only now, after the new-owner-alone snapshot.
  // Its five historical outputs are retained caller data; oldTail.run is never called.
  const {createSelfAttentionTail}=await import('../../ort-bridge/self-attention-tail/stage.mjs');
  oldTail=await createSelfAttentionTail({file,side:payload.side,trustedInputs:payload.trustedInputs});
  for(const [name,values]of Object.entries(payload.oldOutputs))oldOutputs[name]=Float32Array.from(values);
  const oldIdentities=await outputIdentities(oldOutputs,Object.fromEntries(Object.entries(payload.savedArrayIdentities).map(([k,v])=>[k,v.shape])));
  for(const [name,identity]of Object.entries(oldIdentities))demand(identity.sha256===payload.savedArrayIdentities[name].sha256,'Old output binding mismatch: '+name);
  const oldBefore=oldTail.stats();demand(oldBefore.completedRuns===0&&oldBefore.cancelledRuns===0,'Old tail must remain idle');
  await observer.settle();const oldOutputBytes=Object.values(oldOutputs).reduce((n,v)=>n+v.byteLength,0);
  capture('combined-old-tail-idle-p4-ready',{...current.owner.stats(),oldTail:oldBefore},[{name:'retainedOldFiveOutputArrays',bytes:oldOutputBytes}],{activeOldTailORTSessions:oldBefore.activeORTSessions,activeP4ORTSessions:current.owner.stats().activeORTSessions,oldTailNumericalRerun:false});
  const caller=input(conditioning()),expectedInputHashes={residualSHA256:await sha(caller.residual),timeAct1SHA256:await sha(caller.timeAct1),conditioningSHA256:await sha(caller.conditioning.data),conditioningMaskSHA256:await sha(caller.conditioning.attentionMask)},seen=new Set();
  const began=performance.now(),promise=current.owner.run({...caller,onProgress(event){progressCount++;observer.snapshot('p4-native-progress');const key=event.operator??event.stage;if(!seen.has(key)){seen.add(key);capture('combined-first:'+key,current.owner.stats(),[{name:'retainedOldFiveOutputArrays',bytes:oldOutputBytes}],{progress:{stage:event.stage,operator:event.operator??null,tiles:event.tiles??null,head:event.head??null},oldTailNumericalRerun:false});}}});
  caller.residual.fill(0);caller.timeAct1.fill(0);caller.conditioning.data.fill(0);caller.conditioning.attentionMask.fill(0);
  const result=await promise,elapsedMs=performance.now()-began;
  for(const [key,value]of Object.entries(expectedInputHashes))demand(result.evidence.inputHashes[key]===value,'Input mutated before owned snapshot: '+key);
  boundaries.callerInputSnapshot={passed:true,callerValuesMutatedImmediatelyAfterRun:true,actualInputHashesVerified:true};
  demand(JSON.stringify(workspace(current.owner.stats()))===JSON.stringify(constructedWorkspace),'P4 completed run changed fixed Hike workspace');
  boundaries.workspaceAfterNumericRun={passed:true};
  const arrays=Object.fromEntries(Object.keys(payload.outputShapes).map(name=>[name,result[name]])),identities=await outputIdentities(arrays,payload.outputShapes);
  demand(oldTail.stats().completedRuns===0&&oldTail.stats().cancelledRuns===0,'Old tail was numerically rerun');
  await observer.settle();const finalStats=current.owner.stats(),combined=capture('combined-numeric-complete',finalStats,[{name:'retainedOldFiveOutputArrays',bytes:oldOutputBytes},{name:'returnedP4OutputArrays',bytes:Object.values(arrays).reduce((n,v)=>n+v.byteLength,0)}],{activeOldTailORTSessions:oldTail.stats().activeORTSessions,activeP4ORTSessions:finalStats.activeORTSessions,oldTailNumericalRerun:false});
  const ort=combined.memory.memories.filter(v=>v.roles.includes('ORT'));
  demand(ort.length===1&&ort[0].capacityBytes!==null,'One hash-attributed shared ORT memory required');
  demand(combined.memory.unknownModuleCount===0&&observer.diagnostics().hashFailures===0&&observer.diagnostics().observationFailures===0&&observer.diagnostics().memoryImportObservationComplete,'Complete WASM memory hash attribution required');
  await current.dispose();current=null;
  const retained=await outputIdentities(arrays,payload.outputShapes);demand(JSON.stringify(retained)===JSON.stringify(identities),'Caller outputs changed after dispose');
  boundaries.retainedOutputsAfterDispose={passed:true,verifiedOutputCount:Object.keys(retained).length};
  capture('p4-disposed-old-tail-idle-outputs-retained',oldTail.stats(),[{name:'retainedOldFiveOutputArrays',bytes:oldOutputBytes},{name:'retainedP4OutputArrays',bytes:Object.values(arrays).reduce((n,v)=>n+v.byteLength,0)}],{nativeP4Disposed:true,oldTailNumericalRerun:false,gcReclamationClaimed:false});
  // Separate cheap probe: disposal must wait for the active native run to end.
  probe=await createP4DiagnosticOwner(file,payload.side);const closeAborter=new AbortController();let disposePromise,closingObserved=false,closeTile=false;
  boundaries.disposeDuringRun=await rejection(()=>probe.owner.run({...input(conditioning()),signal:closeAborter.signal,onProgress(){if(closeTile)return;closeTile=true;disposePromise=probe.owner.dispose();closingObserved=probe.owner.stats().cleanupPending;closeAborter.abort();}}),/abort/i);
  demand(closeTile&&closingObserved,'Dispose must enter pending cleanup during real native run');await disposePromise;demand(probe.owner.stats().disposed&&probe.owner.stats().activeORTSessions===0,'Dispose must await run and native session release');
  boundaries.disposeDuringRun.passed=true;await probe.dispose();probe=null;
  await oldTail.dispose();oldTail=null;await observer.settle();
  const artifact={schemaVersion:'bernini-p4-runtime-arrays/0.1',side:payload.side,candidatePlanSHA256:payload.candidatePlanSHA256,inputBindings:payload.inputBindings,arrays:Object.fromEntries(Object.entries(arrays).map(([key,value])=>[key,Array.from(value)])),evidence:result.evidence};
  const privateArtifactText=stringifyP4DiagnosticArtifact(artifact)+'\n',privateArtifactSHA256=await sha(new TextEncoder().encode(privateArtifactText));
  return {schemaVersion:'bernini-p4-cross-ffn-browser/0.1',passed:true,status:'MEASURED_NUMERICAL_COMPARISON_PENDING',numericalAccepted:false,side:payload.side,candidatePlanSHA256:payload.candidatePlanSHA256,inputBindings:payload.inputBindings,outputIdentities:identities,boundaries,phases,
   topology:{oldTailNumericalRerun:false,retainedOldOutputCount:5,retainedOldOutputBytes:oldOutputBytes,p4AloneActiveORTSessions:constructedStats.activeORTSessions,combinedActiveORTSessions:finalStats.activeORTSessions+oldBefore.activeORTSessions,distinctORTMemoryCount:ort.length,sessionCountIsMemoryCount:false,aloneObservedCapacityBytes:alone.observableDistinctCapacityBytes,combinedObservedCapacityBytes:combined.observableDistinctCapacityBytes,totalPeakBytes:null,scope:'New P4 plus constructed idle fixed tail and five saved old outputs; no old-tail numerical rerun, previous prefix/self-attention owners, generation pipeline or production peak.'},
   stagingAndCopies:{...publicMetrics(result.evidence.resources),elapsedMs,copyCountersAreCumulativeTraffic:true,copyCategoriesComplete:false,unmeasuredHostCopyBytes:null,namedSpanSumsArePeak:false,hostPeakBytes:null,scope:'Named owner counters only; host addBias compact copies, F16 raw-to-bits assembly and attention-to-global-context assembly are not an exhaustive copy inventory.'},evidence:publicEvidence(result.evidence),observer:{...observer.diagnostics(),boundedProgressObservationCount:progressCount},
   unknowns:{ORTAllocatorLiveBytes:null,hostAllocatorGCBytes:null,FileBackingBytes:null,privateParsedPayloadHeapBytes:null,fullPipelinePeakBytes:null,totalPeakBytes:null},
   acceptance:{naturalN2Only:true,fixtureConditioning:true,textEncoderProducerVerified:false,originalWorkflowInputsVerified:false,originalProductionPrecisionVerified:false,fullBlockVerified:false,lowIsHighHandoff:false,generationReady:false,modelInference:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'},privateArtifactText,privateArtifactSHA256};
 }finally{
  const failures=[];for(const release of [()=>probe?.dispose(),()=>current?.dispose(),()=>oldTail?.dispose()])try{await release();}catch(error){failures.push(error);}observer.restore();if(failures.length)throw new AggregateError(failures,'P4 diagnostic cleanup failed');
 }
}

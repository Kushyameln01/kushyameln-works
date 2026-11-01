// Separate real-packet diagnostic. The L4 fixture admission remains unchanged.
import {createResourceObserver} from '../resource-observer/observer.mjs';
import {createP4DiagnosticOwner,publicEvidence,publicMetrics,outputIdentities,stringifyP4DiagnosticArtifact} from '../p4-cross-ffn/run.mjs';

const demand=(value,message)=>{if(!value)throw Error(message);};
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),x=>x.toString(16).padStart(2,'0')).join('');
const utf8=value=>new TextEncoder().encode(value);
export const REAL_TEXT_BINDING=Object.freeze({
 nativeTextArtifactSHA256:'9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8',nativeTextBytes:8604657,
 packetSHA256:'90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9',packetBytes:8390054,
 headerSHA256:'2e9ac007423d1f7bc894c4ac76e63e55ad3bd92704cecd12ee87cacee0654441',headerBytes:1434,
 conditioningDataSHA256:'107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7',
 conditioningMaskSHA256:'19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62',
 modelSha256:'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68',
 tokenizerSha256:'e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458',
 artifactCommit:'f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48',producerCommit:'5537b8932343aa2476b95191817e8913f99dab02',
 candidatePlanSHA256:'051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600'
});
const outputRows={textLinear0:[512,5120],textGelu:[512,5120],textEmbedded:[512,5120],crossNorm:[2,5120],qkvQ:[2,5120],qkvK:[512,5120],qkvV:[512,5120],normQ:[2,5120],normK:[512,5120],crossContext:[2,5120],crossO:[2,5120],crossResidual:[2,5120],ffnLayerNorm:[2,5120],shift:[5120],scale:[5120],gate:[5120],ffnModulated:[2,5120],ffnUp:[2,13824],ffnGelu:[2,13824],ffnDown:[2,5120],ffnGated:[2,5120],blockOutput:[2,5120],timeProjection3:[5120],timeProjection4:[5120],timeProjection5:[5120]};
export const OUTPUT_SHAPES=Object.freeze(Object.fromEntries(Object.entries(outputRows).map(([name,shape])=>[name,Object.freeze(shape)])));
const savedCases={HIGH:{scheduleIndex:1,savedArtifactSHA256:'5040656cf0bf6bd9f06bbf007b16d22ae026a25a5080d666758e0b52a10e86bd',residualSHA256:'72a7de56a7364122197f4126a996f7131ff4fbda94f7f8201bdacbaad04d85b9',timeAct1SHA256:'1b69ffc7e86fbc52ea9ae5bd32950d8e62439417089577f9c5f66243e0b734f7'},LOW:{scheduleIndex:3,savedArtifactSHA256:'714d96b41cb9e5ba8349b4a9202722f2f94e3fdeeaa984dbc1850b449190d37d',residualSHA256:'0024d0b19db9988d218e2a2ded4cc3713aca32d9517966455d17b34cfee801b6',timeAct1SHA256:'cf07ca0bf0160886acafb9bf42d22f57f56482cd82a8cad5aa3791901e9938c5'} };
function decode64(text){demand(typeof text==='string','Native header base64 required');return Uint8Array.from(atob(text),x=>x.charCodeAt(0));}

/** All byte/provenance admission happens before observer/native construction. */
export async function verifyP4RealTextBinding(text,bindings){
 const b=REAL_TEXT_BINDING;demand(typeof text==='string','Frozen native Text JSON text required');
 const raw=utf8(text);demand(raw.byteLength===b.nativeTextBytes&&await sha(raw)===b.nativeTextArtifactSHA256,'Frozen native Text file SHA256/length mismatch before native construction');
 demand(bindings?.nativeTextArtifactSHA256===b.nativeTextArtifactSHA256&&bindings.conditioningDataSHA256===b.conditioningDataSHA256&&bindings.conditioningMaskSHA256===b.conditioningMaskSHA256,'Frozen native Text declared input binding mismatch');
 const tensor=JSON.parse(text),packet=tensor.sourcePacket,metadata=tensor.nativeTensorMetadata;
 demand(tensor.schemaVersion==='bernini-p4-native-text-input/0.1'&&tensor.dtype==='float32'&&tensor.layout==='BLC'&&tensor.meaning==='text_hidden_states','Native Text schema/dtype/layout/meaning mismatch');
 demand(JSON.stringify(tensor.shape)==='[1,512,4096]'&&Array.isArray(tensor.data)&&tensor.data.length===512*4096,'Real native L512 shape/count required');
 demand(tensor.modelSha256===b.modelSha256&&tensor.tokenizerSha256===b.tokenizerSha256,'Frozen native Text model/tokenizer identity mismatch');
 demand(tensor.producer?.module==='text_encoder'&&tensor.producer.sourceCommit===b.producerCommit,'Frozen native Text producer identity mismatch');
 const mask=tensor.attentionMask;demand(Array.isArray(mask)&&mask.length===512&&mask.every((v,i)=>v===(i<3?1:0)),'Complete frozen native L512 mask required');
 demand(packet?.artifactCommit===b.artifactCommit&&packet.producerCommit===b.producerCommit&&packet.bytes===b.packetBytes&&packet.sha256===b.packetSHA256&&packet.headerBytes===b.headerBytes&&packet.headerSHA256===b.headerSHA256&&packet.payloadSHA256===b.conditioningDataSHA256,'Frozen original native packet identity mismatch');
 const header=decode64(tensor.nativeTensorHeaderBase64);demand(header.byteLength===b.headerBytes&&await sha(header)===b.headerSHA256,'Original native header bytes mismatch');
 demand(stringifyP4DiagnosticArtifact(JSON.parse(new TextDecoder().decode(header)))===stringifyP4DiagnosticArtifact(metadata),'Original native metadata/header mismatch');
 demand(metadata.modelSha256===b.modelSha256&&metadata.tokenizerSha256===b.tokenizerSha256&&JSON.stringify(metadata.shape)==='[1,512,4096]'&&JSON.stringify(metadata.attentionMask)===JSON.stringify(mask),'Original native metadata identity/mask mismatch');
 const data=Float32Array.from(tensor.data),attentionMask=Uint8Array.from(mask);
 demand(data.every(Number.isFinite)&&tensor.dataSHA256===b.conditioningDataSHA256&&await sha(data)===b.conditioningDataSHA256&&await sha(attentionMask)===b.conditioningMaskSHA256,'Original native F32/mask bits mismatch');
 demand(data.subarray(3*4096).every(value=>value===0),'Native masked hidden rows must remain zero');
 const original=new Uint8Array(b.packetBytes);original.set(utf8('WKTSR001'));new DataView(original.buffer).setUint32(8,header.byteLength,true);original.set(header,12);original.set(new Uint8Array(data.buffer),12+header.byteLength);
 demand(await sha(original)===b.packetSHA256,'Original WKT reconstruction identity mismatch');
 return {tensor:{...tensor,data,attentionMask},proof:{passed:true,...b,rows:512,allRowsPreserved:true,maskApplied:false,activeMaskEntries:3}};
}

/** Bounded private transport: no numeric Array.from or giant output JSON. */
export async function streamP4OutputBytes(arrays,identities,write,{chunkBytes=262144}={}){
 demand(typeof write==='function'&&Number.isSafeInteger(chunkBytes)&&chunkBytes>0&&chunkBytes<=262144&&chunkBytes%4===0,'Bounded private binary transport required');
 demand(Object.keys(arrays).length===Object.keys(identities).length,'All private output identities required');
 let chunkCount=0,rawBytes=0,base64Characters=0;const began=performance.now();
 for(const [name,identity]of Object.entries(identities)){
  const value=arrays[name];demand(value instanceof Float32Array&&value.byteLength===identity.bytes&&await sha(value)===identity.sha256,'Private output identity mismatch: '+name);
  const bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  for(let offset=0;offset<bytes.byteLength;offset+=chunkBytes){
   const chunk=bytes.subarray(offset,Math.min(offset+chunkBytes,bytes.byteLength));let binary='';
   for(let part=0;part<chunk.length;part+=8192)binary+=String.fromCharCode(...chunk.subarray(part,part+8192));
   const base64=btoa(binary);await write({name,offset,byteLength:chunk.byteLength,base64});chunkCount++;rawBytes+=chunk.byteLength;base64Characters+=base64.length;
  }
 }
 return {chunkCount,rawBytes,base64Characters,maxRawChunkBytes:chunkBytes,elapsedMs:performance.now()-began,rawCopyBytes:null,base64EncodingInputTrafficBytes:rawBytes,base64DecodedWriteTrafficBytes:rawBytes,scope:'Explicit output export only. Base64 strings and protocol copies are real host allocations; their allocator peak and total copy traffic are unknown.'};
}

async function rejection(operation,pattern){let error;try{await operation();}catch(e){error=e;}demand(error&&pattern.test(String(error)),'Expected rejection '+pattern);return {passed:true,rejected:true,errorType:error.name};}
function workspace(stats){const out={};function walk(v,path){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(['memoryBytes','arenaBytes','memoryIdentity'].includes(k))out[path+'.'+k]=x;else if(['source','base','hike','math','attention'].includes(k))walk(x,path+'.'+k);}}walk(stats,'owner');return out;}
function releaseStats(current){const s=current.owner.stats(),f=current.feed.stats(),r=current.source.stats();return {disposed:s.disposed,cleanupPending:s.cleanupPending,pendingTensors:s.linear?.pendingTensors??0,activeORTSessions:s.activeORTSessions,readLeases:f.readLeases,inFlight:f.inFlight,feedDisposed:f.disposed,sourceDisposed:r.disposed,sourceBusy:r.busy};}
function noLeases(current){const s=releaseStats(current);demand(s.readLeases===0&&s.inFlight===0&&!s.sourceBusy,'P4 feed read lease/in-flight cleanup incomplete');return s;}
function feedEvidence(current){if(!current)return null;const s=current.feed.stats();return {readLeases:s.readLeases,inFlight:s.inFlight,transactions:s.transactions,packages:s.packages,candidates:s.candidates,epoch:s.epoch,activePackageHash:s.activePackageHash,retainedPatchBytes:s.retainedPatchBytes,knownPatchBytes:s.knownPatchBytes};}

export async function runP4RealTextL512(file,payload,{writeOutput,phaseEvent=async()=>{}}={}){
 const admitted=await verifyP4RealTextBinding(payload?.nativeInputText,payload?.inputBindings),b=REAL_TEXT_BINDING;
 const expected=savedCases[payload.side];
 demand(payload.candidatePlanSHA256===b.candidatePlanSHA256&&expected&&payload.trustedInputs?.side===payload.side&&payload.trustedInputs.tokens===2&&payload.trustedInputs.blockIndex===0&&payload.trustedInputs.scheduleIndex===expected.scheduleIndex&&payload.inputBindings.savedArtifactSHA256===expected.savedArtifactSHA256,'Pinned real L512 saved side/block/schedule/N2 scope required');
 demand(await sha(Float32Array.from(payload.residual??[]))===expected.residualSHA256&&payload.savedArrayIdentities?.residual?.sha256===expected.residualSHA256&&await sha(Float32Array.from(payload.timeAct1??[]))===expected.timeAct1SHA256&&payload.trustedInputs.fullPrefix?.timeAct1SHA256===expected.timeAct1SHA256,'Saved residual/timeAct1 bit binding mismatch');
 demand(typeof writeOutput==='function','Private binary output sink required before native construction');
 const observer=createResourceObserver({modules:payload.modules});observer.install();
 let current=null,probe=null,progressCount=0;const phases=[],boundaries={nativeTextAdmission:admitted.proof},pendingEvents=[],eventFailures=[];
 const capture=(phase,stats={},details={})=>{const memory=observer.snapshot(phase),row={phase,atMs:performance.now(),memory,stats:publicMetrics(stats),weightFeed:feedEvidence(current),observableDistinctCapacityBytes:memory.memories.every(v=>v.capacityBytes!==null)?memory.memories.reduce((n,v)=>n+v.capacityBytes,0):null,...details};phases.push(row);return row;};
 const notify=async phase=>{capture(phase,current?.owner.stats()??{});await phaseEvent({phase,atMs:performance.now()});};
 try{
  const {captureP4Conditioning,p4ConditioningMetadataBytes}=await import('../../ort-bridge/post-self-attention/conditioning.mjs');
  const conditioning=()=>captureP4Conditioning(admitted.tensor),input=()=>({residual:Float32Array.from(payload.residual),timeAct1:Float32Array.from(payload.timeAct1),conditioning:conditioning()});
  await notify('before-p4-construction');current=await createP4DiagnosticOwner(file,payload.side);await observer.settle();await notify('p4-constructed-alone');
  const constructedStats=current.owner.stats(),constructedWorkspace=workspace(constructedStats),baselineRelease=noLeases(current);
  const aborter=new AbortController();let firstTile=false,reentry;
  boundaries.cancelAtFirstActualWeightTile=await rejection(()=>current.owner.run({...input(),signal:aborter.signal,onProgress(event){if(firstTile)return;demand(event.stage==='projection'&&event.operator==='text_embedding.0.weight'&&event.sourceRowStart===0&&event.textRows===512,'First actual real L512 weight tile required');firstTile=true;reentry=rejection(()=>current.owner.run(input()),/busy/i);aborter.abort();}}),/abort/i);
  demand(firstTile,'Cancellation did not reach native L512 weight tile');boundaries.busyReentry=await reentry;
  demand(JSON.stringify(workspace(current.owner.stats()))===JSON.stringify(constructedWorkspace),'P4 abort changed fixed workspace');boundaries.afterAbort={passed:true,...noLeases(current)};await notify('p4-aborted-first-weight-tile');
  const caller=input(),callerHashes=async()=>({residualSHA256:await sha(caller.residual),timeAct1SHA256:await sha(caller.timeAct1),conditioningSHA256:await sha(caller.conditioning.data),conditioningMaskSHA256:await sha(caller.conditioning.attentionMask),conditioningMetadataSHA256:await sha(p4ConditioningMetadataBytes(caller.conditioning.metadata))});
  const beforeHashes=await callerHashes(),beforeMetadata=stringifyP4DiagnosticArtifact(caller.conditioning.metadata),beforeRawMetadata=stringifyP4DiagnosticArtifact(admitted.tensor.nativeTensorMetadata),seen=new Set(),began=performance.now(),rawBefore=current.source.stats();
  await notify('p4-numeric-start');
  const result=await current.owner.run({...caller,onProgress(event){progressCount++;demand(current.feed.stats().readLeases===1,'Active run must retain exactly one pinned feed lease');const key=event.operator??event.stage;if(!seen.has(key)||event.stage==='cross-attention'){seen.add(key);const phase='p4-native-progress:'+key+(event.stage==='cross-attention'?':head'+event.head:'');capture(phase,current.owner.stats(),{progress:{stage:event.stage,operator:event.operator??null,textRows:event.textRows??null,tiles:event.tiles??null,head:event.head??null,keyCount:event.keyCount??null,attentionTiles:event.attentionTiles??null}});pendingEvents.push(Promise.resolve(phaseEvent({phase,atMs:performance.now()})).catch(error=>eventFailures.push(error)));}}});
  await Promise.all(pendingEvents);demand(eventFailures.length===0,'Resource phase event collection failed');
  const elapsedMs=performance.now()-began,rawAfter=current.source.stats();
  demand(JSON.stringify(await callerHashes())===JSON.stringify(beforeHashes)&&stringifyP4DiagnosticArtifact(caller.conditioning.metadata)===beforeMetadata&&stringifyP4DiagnosticArtifact(admitted.tensor.nativeTensorMetadata)===beforeRawMetadata,'Caller input bytes/metadata changed during native run');
  for(const [key,value]of Object.entries(beforeHashes))demand(result.evidence.inputHashes[key]===value,'Actual native input hash mismatch: '+key);
  boundaries.callerInputPreserved={passed:true,byteHashCount:4,metadataHashVerified:true,fullNativeMetadataRetained:true};
  demand(JSON.stringify(workspace(current.owner.stats()))===JSON.stringify(constructedWorkspace),'P4 numeric run changed fixed workspace');boundaries.afterNumericRun={passed:true,...noLeases(current)};
  const arrays=Object.fromEntries(Object.keys(OUTPUT_SHAPES).map(name=>[name,result[name]])),identities=await outputIdentities(arrays,OUTPUT_SHAPES);
  for(const [name,identity]of Object.entries(identities))demand(result.evidence.outputHashes[name+'SHA256']===identity.sha256,'Native evidence output hash mismatch: '+name);
  demand(result.evidence.keyCount===512&&result.evidence.headEvidence.length===40&&result.evidence.headEvidence.every(h=>h.keyCount===512&&h.tiles===8&&h.logicalFinalKeys===64)&&result.evidence.attentionTiles===320&&result.evidence.conditioning.maskApplied===false&&result.evidence.rope==='none','Real L512 attention topology mismatch');
  const namedLiveSpans=[{name:'admittedNativeConditioningData',bytes:admitted.tensor.data.byteLength},{name:'admittedNativeAttentionMask',bytes:admitted.tensor.attentionMask.byteLength},{name:'callerResidual',bytes:caller.residual.byteLength},{name:'callerTimeAct1',bytes:caller.timeAct1.byteLength},{name:'callerConditioningData',bytes:caller.conditioning.data.byteLength},{name:'callerAttentionMask',bytes:caller.conditioning.attentionMask.byteLength},{name:'callerProtectedCaptureSealBinaryBuffers',bytes:caller.conditioning.sealBytes},{name:'returned25P4OutputArrays',bytes:Object.values(arrays).reduce((sum,value)=>sum+value.byteLength,0)}];
  const namedSpanScope='Partial simultaneously retained distinct binary spans only. Protected capture seal is separate from caller capture arrays. Excludes metadata objects/strings, native input JSON text, released stage temporaries, File backing, ORT allocator, unreachable pre-GC arrays and total host/pipeline peak.';
  await observer.settle();await notify('p4-numeric-complete');Object.assign(phases.at(-1),{namedSpans:namedLiveSpans,namedSpanScope});
  const numericSnapshot=phases.at(-1),ort=numericSnapshot.memory.memories.filter(v=>v.roles.includes('ORT'));
  demand(ort.length===1&&ort[0].capacityBytes!==null&&numericSnapshot.memory.unknownModuleCount===0&&observer.diagnostics().hashFailures===0&&observer.diagnostics().observationFailures===0&&observer.diagnostics().memoryImportObservationComplete,'Complete distinct WASM memory attribution required');
  const finalStats=current.owner.stats();await current.dispose();const disposedStats=releaseStats(current);
  demand(disposedStats.disposed&&disposedStats.feedDisposed&&disposedStats.sourceDisposed&&!disposedStats.cleanupPending&&disposedStats.pendingTensors===0&&disposedStats.activeORTSessions===0&&disposedStats.readLeases===baselineRelease.readLeases&&disposedStats.inFlight===baselineRelease.inFlight,'P4 disposal failed to release sessions/tensors/leases');boundaries.afterDispose={passed:true,...disposedStats};
  const retained=await outputIdentities(arrays,OUTPUT_SHAPES);demand(JSON.stringify(retained)===JSON.stringify(identities),'Caller output bytes changed after dispose');boundaries.retainedOutputsAfterDispose={passed:true,verifiedOutputCount:25};await notify('p4-disposed-outputs-retained');Object.assign(phases.at(-1),{namedSpans:namedLiveSpans,namedSpanScope});current=null;
  probe=await createP4DiagnosticOwner(file,payload.side);const closeAborter=new AbortController();let disposePromise,closingObserved=false,closeTile=false;
  boundaries.disposeDuringRun=await rejection(()=>probe.owner.run({...input(),signal:closeAborter.signal,onProgress(){if(closeTile)return;closeTile=true;disposePromise=probe.owner.dispose();closingObserved=probe.owner.stats().cleanupPending;closeAborter.abort();}}),/abort/i);
  demand(closeTile&&closingObserved,'Dispose must become pending during actual native L512 run');await disposePromise;await probe.dispose();const probeReleased=releaseStats(probe);demand(probeReleased.disposed&&probeReleased.activeORTSessions===0&&probeReleased.pendingTensors===0&&probeReleased.readLeases===0&&probeReleased.inFlight===0,'Dispose-during-run sessions/tensors/leases leaked');boundaries.disposeDuringRun.release=probeReleased;probe=null;await observer.settle();await notify('p4-dispose-during-run-probe-complete');
  await notify('private-binary-export-start');const exportMetrics=await streamP4OutputBytes(arrays,identities,writeOutput);await notify('private-binary-export-complete');
  const manifest={schemaVersion:'bernini-p4-real-text-l512-runtime/0.1',side:payload.side,candidatePlanSHA256:payload.candidatePlanSHA256,inputBindings:payload.inputBindings,outputIdentities:identities,arrays:Object.fromEntries(Object.entries(identities).map(([name,v])=>[name,{path:name+'.f32',shape:v.shape,dtype:'float32',sha256:v.sha256,bytes:v.bytes}])),evidence:result.evidence};
  const bridgeCallCount=rawAfter.hike.calls-rawBefore.hike.calls,bridgeArenaZeroFillTrafficBytes=bridgeCallCount*rawAfter.hike.arenaBytes;
  return {schemaVersion:'bernini-p4-real-text-l512-browser/0.1',passed:true,status:'MEASURED_NUMERICAL_COMPARISON_PENDING',numericalAccepted:false,side:payload.side,candidatePlanSHA256:payload.candidatePlanSHA256,inputBindings:payload.inputBindings,outputIdentities:identities,boundaries,phases,evidence:publicEvidence(result.evidence),observer:{...observer.diagnostics(),boundedProgressObservationCount:progressCount},privateManifestText:stringifyP4DiagnosticArtifact(manifest)+'\n',
   topology:{textRows:512,queryRows:2,headCount:40,keysPerHead:512,attentionTiles:320,oldTailConstructed:false,oldTailNumericalRerun:false,priorSavedTailEvidenceReused:true,p4AloneActiveORTSessions:constructedStats.activeORTSessions,numericCompleteActiveORTSessions:finalStats.activeORTSessions,distinctORTMemoryCount:ort.length,sessionCountIsMemoryCount:false,scope:'P4 stage composed from accepted saved N2 tail residual/timeAct1. No old-tail owner, previous owners, full block or generation pipeline.'},
   stagingAndCopies:{...publicMetrics(result.evidence.resources),elapsedMs,bridgeCallCount,bridgeArenaZeroFillTrafficBytes,export:exportMetrics,copyCountersAreCumulativeTraffic:true,copyCategoriesComplete:false,unmeasuredHostCopyBytes:null,hostPeakBytes:null,scope:'Partial named copy/zero-fill traffic and separate observed memory capacities; cumulative traffic is not peak or allocation size.'},
   unknowns:{ORTAllocatorLiveBytes:null,hostAllocatorGCBytes:null,FileBackingBytes:null,privateParsedPayloadHeapBytes:null,fullPipelinePeakBytes:null,totalPeakBytes:null},
   acceptance:{naturalN2Only:true,realNativeTextPacket:true,fixtureConditioning:false,producerSourceAndPacketBound:true,textEncoderProducerVerified:false,realTextJointAcceptance:false,originalWorkflowInputsVerified:false,originalProductionPrecisionVerified:false,fullBlockVerified:false,lowIsHighHandoff:false,generationReady:false,modelInference:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'}};
 }finally{const failures=[];for(const release of [()=>probe?.dispose(),()=>current?.dispose()])try{await release();}catch(error){failures.push(error);}observer.restore();if(failures.length)throw new AggregateError(failures,'Real L512 diagnostic cleanup failed');}
}

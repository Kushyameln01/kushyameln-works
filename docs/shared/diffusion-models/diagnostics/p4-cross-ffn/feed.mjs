// Actual immutable-base provider -> caller final-F32 fixture -> sink -> runtime.
// This diagnostic has no adapter/product/strength arithmetic.
import {createResourceObserver} from '../resource-observer/observer.mjs';
import {publicEvidence,publicMetrics,outputIdentities} from './run.mjs';

const SCHEMA='bernini-p4-final-f32-patches/0.1',SHA=/^[a-f0-9]{64}$/;
const KEYS=['modelHash','graphHash','registryHash','side','executionProfileId','scope'];
const TARGETS=[{weightId:'blocks.0.cross_attn.q.weight',fullShape:[5120,5120],offset:0,count:20480,binding:{kind:'runtime-input',name:'blocks.0.cross_attn.q.weight'}},{weightId:'blocks.0.cross_attn.q.bias',fullShape:[5120],offset:0,count:4,binding:{kind:'hike-parameter',name:'blocks.0.cross_attn.q.bias'}}];
const demand=(x,message)=>{if(!x)throw Error(message);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(value??{},k)).map(k=>[k,value[k]]));
const identity=r=>pick(r,KEYS);

export function finalF32Fixture(values){
 demand(Object.getPrototypeOf(values??{})===Float32Array.prototype&&values.buffer instanceof ArrayBuffer&&values.byteOffset===0&&values.byteLength===values.buffer.byteLength&&values.every(Number.isFinite),'Owned compact finite F32 required');
 const data=new Float32Array(values),changedElementIndex=data.findIndex(x=>x!==0);
 demand(changedElementIndex>=0,'Existing nonzero F32 element required');
 const bits=new Uint32Array(data.buffer);bits[changedElementIndex]^=0x80000000;
 return {data,changedElementIndex,changedElements:1,transform:'one-existing-nonzero-F32-sign-bit-flip'};
}

export function publicPatchMetadata(block){return {...pick(block,['weightId','offset','count','dtype','sha256']),fullShape:[...block.fullShape],binding:pick(block.binding,['kind','name'])};}
export function publicValidation(value){return {...pick(value,['schemaVersion',...KEYS,'candidateId','packageHash','valid','referenceId','gateId','expectedSHA256','outputSHA256','inputHashes','inputBindingHash','tolerance','maxAbsoluteError','failedValues','modelInference','generationReady','canonicalLoraAdapterExtension']),...(value?.evidence?{evidence:publicEvidence(value.evidence)}:{})};}

/** Admit only this separately named Q-weight/Q-bias diagnostic fixture. */
export async function parseFinalF32Patches(text,{side,candidatePlanSHA256}){
 const parsed=JSON.parse(text);demand(parsed.schemaVersion===SCHEMA&&parsed.side===side&&parsed.candidatePlanSHA256===candidatePlanSHA256,'Final-F32 patch schema/side/plan mismatch');
 demand(Array.isArray(parsed.patches)&&parsed.patches.length>=1&&parsed.patches.length<=2,'Explicit bounded final-F32 patches required');
 const seen=new Set(),patches=[];
 for(const block of parsed.patches){const target=TARGETS.find(t=>t.weightId===block.weightId);
  demand(target&&!seen.has(block.weightId)&&same(block.fullShape,target.fullShape)&&same(block.binding,target.binding)&&block.dtype==='F32'&&block.offset===target.offset&&block.count===target.count&&SHA.test(block.sha256),'Final-F32 original full shape/range/binding/dtype/hash mismatch');seen.add(block.weightId);
  demand(Array.isArray(block.data)&&block.data.length===block.count&&block.data.every(x=>typeof x==='number'&&Number.isFinite(x)),'Exact finite private F32 patch data required');
  const data=Float32Array.from(block.data);demand(data.every(Number.isFinite)&&await sha(data)===block.sha256,'Final-F32 patch byte hash mismatch');patches.push({...publicPatchMetadata(block),data});
 }
 return {schemaVersion:SCHEMA,side,candidatePlanSHA256,patches};
}

async function createFeed(file,side){const [{createP4WeightSource},{createP4WeightFeed}]=await Promise.all([import('../../ort-bridge/post-self-attention/source.mjs'),import('../../ort-bridge/post-self-attention/weights.mjs')]);const source=await createP4WeightSource({file,side});try{return {source,feed:createP4WeightFeed({source})};}catch(error){await source.dispose();throw error;}}
const blockRead=(view,p)=>p.fullShape.length===2?view.readRows(p.weightId,p.offset/p.fullShape[1],p.count/p.fullShape[1]):view.readVector(p.weightId,p.offset,p.count);
export function publicFeedRegistry(r){return {...identity(r),schemaVersion:r.schemaVersion,coverage:r.coverage,validationGate:r.validationGate,resourceLimits:r.resourceLimits,targets:r.targets.filter(t=>TARGETS.some(p=>p.weightId===t.weightId)).map(t=>({...pick(t,['weightId','originalKey','fullShape','storageDtype','computeDtype','layout','fp8ProfileId','scaleSHA256','quantConfigSHA256','patchCoordinates','unchangedRanges']),binding:pick(t.binding,['kind','name']),...(t.scaleSource?{scaleSource:pick(t.scaleSource,['originalKey','fullShape','storageDtype','absoluteByteOffset','byteLength'])}:{}),...(t.quantConfigSource?{quantConfigSource:pick(t.quantConfigSource,['originalKey','fullShape','storageDtype','absoluteByteOffset','byteLength'])}:{})})),generationReady:false};}
function requireActualFP8Q(registry){const target=registry.targets.find(t=>t.weightId===TARGETS[0].weightId);demand(target?.storageDtype==='F8_E4M3'&&target.computeDtype==='F32'&&target.fp8ProfileId==='scaled-e4m3fn-scalar-f32-v1'&&SHA.test(target.scaleSHA256)&&SHA.test(target.quantConfigSHA256),'Actual Q FP8 scalar-scale profile/hash -> final F32 boundary required');}

/** Small bounded original reads only. Run after the source commit is frozen. */
export async function prepareP4FinalF32(file,payload){
 demand(['HIGH','LOW'].includes(payload.side)&&SHA.test(payload.candidatePlanSHA256),'Explicit side and frozen candidate plan required');
 let source,feed;
 try{({source,feed}=await createFeed(file,payload.side));const registry=feed.registry(),id=identity(registry),patches=[],ownership=[];requireActualFP8Q(registry);
  for(const target of TARGETS){const args={...id,fullShape:target.fullShape},base=await feed.baseProvider.readBlock(target.weightId,target.offset,target.count,args),original=new Float32Array(base),baseSHA256=await sha(base),fixture=finalF32Fixture(original);
   // Mutating the provider result must not mutate the immutable file or next lease.
   base.fill(0);const again=await feed.baseProvider.readBlock(target.weightId,target.offset,target.count,args);
   demand(base.buffer!==again.buffer&&original.buffer!==again.buffer&&fixture.data.buffer!==again.buffer&&await sha(again)===baseSHA256,'Immutable base/provider F32 ownership failed');
   const block={...target,dtype:'F32',sha256:await sha(fixture.data),data:Array.from(fixture.data)};patches.push(block);
   ownership.push({...publicPatchMetadata(block),baseF32SHA256:baseSHA256,independentOwnedF32Copies:true,providerMutationObserved:false,secondOriginalReadUnchanged:true,changedElements:fixture.changedElements,changedElementIndex:fixture.changedElementIndex,fixtureTransform:fixture.transform});
  }
  const artifact={schemaVersion:SCHEMA,side:payload.side,candidatePlanSHA256:payload.candidatePlanSHA256,patches},privatePatchText=JSON.stringify(artifact)+'\n';
  return {schemaVersion:'bernini-p4-final-f32-prepare/0.1',passed:true,side:payload.side,candidatePlanSHA256:payload.candidatePlanSHA256,inputClass:'caller-final-f32-feed-fixture',registry:publicFeedRegistry(registry),patches:ownership,privatePatchSHA256:await sha(new TextEncoder().encode(privatePatchText)),resources:publicMetrics(feed.stats()),lowRankMathImplemented:false,fullFileHashRecomputed:false,generationReady:false,privatePatchText};
 }finally{await feed?.dispose();await source?.dispose();}
}

/** The validation callback executes the actual stage against the candidate view. */
export async function validateP4FinalF32(file,payload){
 const patches=await parseFinalF32Patches(payload.patchArtifactText,payload);
 demand(patches.patches.length===2,'Both final-F32 Q-weight and bias patches required');
 demand(await sha(new TextEncoder().encode(payload.patchArtifactText))===payload.inputBindings.finalF32PatchArtifactSHA256,'Private patch artifact hash binding mismatch');
 demand(SHA.test(payload.referenceSHA256)&&SHA.test(payload.expectedSHA256),'Independent reference file/output identity required');
 const expected=Float32Array.from(payload.expectedBlockOutput);demand(expected.length===10240&&expected.every(Number.isFinite)&&await sha(expected)===payload.expectedSHA256,'Independent composed blockOutput exact bytes required');
 demand(payload.trustedInputs.side===payload.side&&payload.trustedInputs.tokens===2&&payload.trustedInputs.blockIndex===0,'Saved side/block/N2 input binding required');
 const observer=createResourceObserver({modules:payload.modules});observer.install();let source,feed,sink,handle,candidate,oldLease,result,stage;const phases=[];
 const capture=(phase,stats={})=>{const memory=observer.snapshot(phase);phases.push({phase,memory,stats:publicMetrics(stats),observableDistinctCapacityBytes:memory.memories.every(v=>v.capacityBytes!==null)?memory.memories.reduce((n,v)=>n+v.capacityBytes,0):null});};
 try{
  const [{captureP4FixtureConditioning},{createPostSelfAttention}]=await Promise.all([import('../../ort-bridge/post-self-attention/conditioning.mjs'),import('../../ort-bridge/post-self-attention/stage.mjs')]);
  const input={residual:Float32Array.from(payload.residual),timeAct1:Float32Array.from(payload.timeAct1),conditioning:captureP4FixtureConditioning({...payload.conditioning,data:Float32Array.from(payload.conditioning.data),attentionMask:Uint8Array.from(payload.conditioning.attentionMask)})};
  demand(await sha(input.residual)===payload.savedArrayIdentities.residual.sha256&&await sha(input.timeAct1)===payload.trustedInputs.fullPrefix.timeAct1SHA256,'Saved residual/time exact binding mismatch');
  demand(await sha(input.conditioning.data)===payload.inputBindings.conditioningDataSHA256&&await sha(input.conditioning.attentionMask)===payload.inputBindings.conditioningMaskSHA256,'Conditioning data/mask input binding mismatch');
  capture('before-feed-construction');({source,feed}=await createFeed(file,payload.side));const registry=feed.registry(),id=identity(registry),ctx={...id,isCurrent:()=>true};requireActualFP8Q(registry);
  oldLease=feed.captureSource();const baseHashes=[];for(const p of patches.patches)baseHashes.push(await sha((await blockRead(oldLease,p)).values));
  const basePackageHash=oldLease.describe().packageHash;sink=feed.createSink();await sink.begin({...id,patches:patches.patches.map(p=>pick(p,['weightId','offset','count']))});
  for(const p of patches.patches)await sink.writeBlock(p);handle=await sink.finish(id);candidate=await feed.prepareLoad(handle,ctx);capture('candidate-prepared',feed.stats());
  const began=performance.now(),seen=new Set();
  const validation=await feed.validate(candidate,{...ctx,input,expected,expectedSHA256:payload.expectedSHA256,referenceId:'sha256:'+payload.referenceSHA256,gateId:'p4-cross-ffn-composed-f32-v1',tolerance:{absolute:0.01,relative:0.001},run:async(view,ownedInput)=>{
   demand(view.describe().packageHash===handle.packageHash,'Actual runtime candidate source binding mismatch');stage=await createPostSelfAttention({source:view});await observer.settle();capture('actual-stage-constructed',stage.stats());
   try{result=await stage.run({...ownedInput,onProgress(event){const key=event.operator??event.stage;if(!seen.has(key)){seen.add(key);capture('actual-progress:'+key,stage.stats());}}});return result;}
   finally{await stage.dispose();capture('actual-stage-disposed',feed.stats());stage=null;}
  }});
  demand(validation.valid,'Independent composed final-F32 numerical gate failed');
  const arrays=Object.fromEntries(Object.keys(payload.outputShapes).map(k=>[k,result[k]])),identities=await outputIdentities(arrays,payload.outputShapes);
  demand(identities.blockOutput.sha256===validation.outputSHA256,'Actual validation/output artifact binding mismatch');
  if(payload.baseOutputSHA256)demand(SHA.test(payload.baseOutputSHA256)&&identities.blockOutput.sha256!==payload.baseOutputSHA256,'Final-F32 fixture must change actual output relative to baseline');
  const committed=await feed.commit(candidate,ctx);demand(committed.committed&&committed.epoch===1,'Validated candidate commit/epoch failed');
  const active=[];for(let i=0;i<patches.patches.length;i++){const p=patches.patches[i],current=await blockRead(feed,p),old=await blockRead(oldLease,p);demand(await sha(current.values)===p.sha256,'Active final-F32 patch bytes mismatch');demand(await sha(old.values)===baseHashes[i],'Old base lease changed across active switch');active.push({...publicPatchMetadata(p),activeBytesVerified:true,oldBaseLeaseUnchanged:true});}
  await sink.release(handle);handle=null;for(const p of patches.patches)demand(await sha((await blockRead(feed,p)).values)===p.sha256,'Active package lost bytes after handle release');
  const rollback=await feed.rollback(candidate,ctx);candidate=null;demand(rollback.restored&&rollback.epoch===2&&feed.describe().packageHash===basePackageHash,'Rollback must restore base with next epoch');
  for(let i=0;i<patches.patches.length;i++){const p=patches.patches[i],restored=await blockRead(feed,p),provider=await feed.baseProvider.readBlock(p.weightId,p.offset,p.count,{...id,fullShape:p.fullShape});demand(await sha(restored.values)===baseHashes[i]&&await sha(provider)===baseHashes[i],'Rollback/provider immutable-base bits mismatch');}
  const finalStats=feed.stats();oldLease.release();oldLease=null;await observer.settle();capture('feed-restored-base',finalStats);
  demand(observer.diagnostics().unknownModuleCount===0&&observer.diagnostics().hashFailures===0&&observer.diagnostics().observationFailures===0&&observer.diagnostics().memoryImportObservationComplete,'Complete actual-stage memory hash observation required');
  const artifact={schemaVersion:'bernini-p4-runtime-arrays/0.1',side:payload.side,candidatePlanSHA256:payload.candidatePlanSHA256,inputBindings:payload.inputBindings,arrays:Object.fromEntries(Object.entries(arrays).map(([k,v])=>[k,Array.from(v)])),evidence:result.evidence},privateArtifactText=JSON.stringify(artifact)+'\n';
  return {schemaVersion:'bernini-p4-final-f32-browser/0.1',passed:true,numericalAccepted:true,side:payload.side,candidatePlanSHA256:payload.candidatePlanSHA256,inputBindings:payload.inputBindings,registry:publicFeedRegistry(registry),validation:publicValidation(validation),referenceSHA256:payload.referenceSHA256,patchArtifactSHA256:payload.inputBindings.finalF32PatchArtifactSHA256,outputIdentities:identities,patches:active,
   boundaries:{actualCandidateStageRun:true,commitAfterValid:true,committedEpoch:committed.epoch,oldBaseLeaseUnchangedAcrossSwitch:true,activeBytesAfterPackageRelease:true,rollbackRestoredBase:true,rollbackEpoch:rollback.epoch,baseProviderUnchanged:true,baseOutputHashCompared:!!payload.baseOutputSHA256,baseOutputSHA256:payload.baseOutputSHA256??null,restoreVerification:'bounded target reread; stage not rerun'},
   resources:{...publicMetrics(finalStats),feedOwnership:pick(finalStats,['transactions','packages','candidates','readLeases','inFlight','retainedPatchBuffers','retainedPatchBytes','pendingPatchBytes','activePatchBytes','knownPatchBytes']),elapsedMs:performance.now()-began,phases,stageResources:publicMetrics(result.evidence.resources),copyCountersAreCumulativeTraffic:true,copyCategoriesComplete:false,unmeasuredHostCopyBytes:null,fullPipelinePeakBytes:null,hostPeakBytes:null,totalPeakBytes:null,scope:'Separate actual feed candidate stage plus retained private reference/input/output arrays; no old-tail owner and no combined-pipeline peak claim. Copy inventory omits host addBias compact copies, F16 raw-to-bits assembly and attention-to-global-context assembly'},observer:observer.diagnostics(),acceptance:{inputClass:'caller-final-f32-feed-fixture',lowRankMathImplemented:false,canonicalLoraAdapterExtension:'PENDING',fixtureConditioning:true,textEncoderProducerVerified:false,modelInference:false,generationReady:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'},privateArtifactText,privateArtifactSHA256:await sha(new TextEncoder().encode(privateArtifactText))};
 }finally{const failures=[];for(const close of [()=>stage?.dispose(),()=>oldLease?.release(),()=>candidate?feed.releaseCandidate(candidate):undefined,()=>handle?sink.release(handle):undefined,()=>sink?.abort(),()=>feed?.dispose(),()=>source?.dispose()])try{await close();}catch(error){failures.push(error);}observer.restore();if(failures.length)throw new AggregateError(failures,'Final-F32 diagnostic cleanup failed');}
}

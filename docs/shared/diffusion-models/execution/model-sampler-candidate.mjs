import {deriveWorkflowShapes} from '../../ai-connection/workflow-shapes.mjs';
import {createBerniniModelCandidate,MODEL_CANDIDATE_PROFILE} from './model-candidate.mjs';
import {createFullModelWeightSource} from './model-weights.mjs';
import {createFullModelWeightFeed} from './model-weight-feed.mjs';
import {createModelMath} from './model-math.mjs';
import {createBatchedModelOps} from './batched-ops.mjs';
import {snapshotP4NativeConditioning} from '../ort-bridge/post-self-attention/conditioning.mjs';
import {createSchedulerKernel,PROFILE as SCHEDULE_PROFILE} from '../scheduler/scheduler-kernel.mjs';
import {createEulerKernel} from '../euler-kernel.mjs';
import {createGeneratedLatentSpace,createGeneratedTargetPointwise,GENERATED_MODEL_LATENT,GENERATED_RAW_SAMPLE,GENERATED_MAX_ELEMENTS,NORMALIZATION,ORIGINAL81_TARGET_SHAPE} from './generated-space.mjs';
import {createModelSequence} from './model-sequence.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';
import {createSampleNoise,SAMPLE_INITIALIZATION_PROFILE,describeNormalGenerationInputs} from './sample-initialization.mjs';

export const MODEL_SAMPLER_CANDIDATE_PROFILE='bernini-full40-euler-simple6-shift5-split3-experimental-v1';
const SCHEDULER_SHA256='bcd35eb9e0bef45c2f21d99ca77a1edeae57c8ea7fa763086492dc1fa40dd220';
const CONTEXT_MEAN='wan21-normalized-posterior-mean:v1';
const SIDES=['HIGH','LOW'];
const typed=Object.getPrototypeOf(Float32Array.prototype);
const slots=Object.fromEntries(['buffer','length','byteOffset','byteLength'].map(key=>[key,Object.getOwnPropertyDescriptor(typed,key).get]));
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
const nativeSignalAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
const nativeSignalReason=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'reason').get;
const nativeSignalThrow=AbortSignal.prototype.throwIfAborted;
const nativeAddListener=EventTarget.prototype.addEventListener,nativeRemoveListener=EventTarget.prototype.removeEventListener;
const NativeAbortController=AbortController,nativeAbort=AbortController.prototype.abort;
const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
function known(value,names,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw TypeError(label+' must be a plain object');
 for(const key of Reflect.ownKeys(value)){
  const d=Object.getOwnPropertyDescriptor(value,key);
  if(typeof key!=='string'||!names.includes(key)||!Object.hasOwn(d,'value')||!d.enumerable)throw TypeError('Unknown or accessor '+label+' field');
 }
}
function plain(value,ancestors=new Set()){
 if(value===null||['string','boolean'].includes(typeof value))return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||ancestors.has(value))throw TypeError('Finite acyclic plain metadata required');
 const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
 if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw TypeError('Plain metadata required');
 ancestors.add(value);const copy=array?[]:{};
 try{
  for(const key of Reflect.ownKeys(value)){
   if(array&&key==='length')continue;
   const d=Object.getOwnPropertyDescriptor(value,key);
   if(typeof key!=='string'||!Object.hasOwn(d,'value')||!d.enumerable)throw TypeError('Plain enumerable metadata data fields required');
   Object.defineProperty(copy,key,{value:plain(d.value,ancestors),writable:true,enumerable:true,configurable:true});
  }
  if(array&&(copy.length!==value.length||Object.keys(copy).length!==value.length))throw TypeError('Dense metadata arrays required');
  return copy;
 }finally{ancestors.delete(value);}
}
function f32(value,count,label){
 const fail=()=>{throw TypeError(label+': native compact nonshared finite exact-shape F32 required');};
 if(Object.getPrototypeOf(value??{})!==Float32Array.prototype)fail();
 let buffer,length,offset,bytes;
 try{buffer=slots.buffer.call(value);length=slots.length.call(value);offset=slots.byteOffset.call(value);bytes=slots.byteLength.call(value);}catch{fail();}
 if(Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||length!==count||offset!==0||bytes!==bufferLength.call(buffer))fail();
 const copy=new Float32Array(value);for(let i=0;i<count;i++)if(!Number.isFinite(copy[i])){copy.fill(0);fail();}return copy;
}
function wasmBytes(value){
 if(value===undefined)return undefined;
 if(Object.getPrototypeOf(value??{})===ArrayBuffer.prototype)return new Uint8Array(value).slice();
 if(Object.getPrototypeOf(value??{})===Uint8Array.prototype&&Object.getPrototypeOf(slots.buffer.call(value))===ArrayBuffer.prototype)return new Uint8Array(value);
 throw TypeError('Native nonshared WASM bytes required');
}
function signalCheck(signal){
 if(signal===undefined)return;
 let aborted;try{aborted=nativeSignalAborted.call(signal);}catch{throw TypeError('Native AbortSignal required');}
 if(aborted)nativeSignalThrow.call(signal);
}
async function loadBytes(value,url,signal){
 signalCheck(signal);if(value!==undefined)return value;
 const response=await fetch(url,{signal});if(!response.ok)throw Error('Sampler candidate WASM unavailable: '+url);const result=new Uint8Array(await response.arrayBuffer());signalCheck(signal);return result;
}
function conditioning(value){
 const captured=snapshotP4NativeConditioning(value);
 if(captured.metadata.nativeTensorMetadata.normalization!=='umt5-final-rmsnorm-f32-v1')throw TypeError('Canonical umt5-final-rmsnorm-f32-v1 Text normalization required');
 return {...captured.metadata.nativeTensorMetadata,shape:captured.shape,data:captured.data,attentionMask:captured.attentionMask};
}
function targetTensor(shape,data,producers){return {dtype:'float32',shape:[...shape],layout:'NCTHW',meaning:GENERATED_MODEL_LATENT,normalization:NORMALIZATION,producerModelSha256s:[...producers],data};}
function wipeTensor(tensor){tensor?.data?.fill(0);}

/** Experimental model-bound sampler. There is deliberately no prediction,
 * operator, source or RNG injection port. The public adapter calls this owner.
 * Both models borrow one math owner and one pair of ORT sessions owned here.
 */
export async function createBerniniModelSamplerCandidate(options={}){
 known(options,['files','bridgeBytes','lookupBytes','mathWasmBytes','schedulerWasmBytes','eulerWasmBytes','generatedSpaceWasmBytes','signal','wasmThreads','readAheadBytes'],'sampler preparation');
 known(options.files,['HIGH','LOW'],'model files');
 const files={HIGH:options.files.HIGH,LOW:options.files.LOW},signal=options.signal;
 const wasmThreads=options.wasmThreads??1,readAheadBytes=options.readAheadBytes??1048576;
 if(![1,4].includes(wasmThreads)||!Number.isSafeInteger(readAheadBytes)||readAheadBytes<0||readAheadBytes>1048576)throw TypeError('wasmThreads1|4 and bounded readAheadBytes0..1048576 required');
 if(wasmThreads===4&&(globalThis.crossOriginIsolated!==true||typeof SharedArrayBuffer!=='function')){const error=new Error('Four WASM threads require cross-origin isolation and SharedArrayBuffer; default profile remains one thread');error.code='UNSUPPORTED_RESOURCE_CONFIG';throw error;}
 if(SIDES.some(side=>!(files[side] instanceof Blob)))throw TypeError('Original immutable HIGH and LOW Blob files required');
 signalCheck(signal);
 // Capture every byte input and model reference before the first await.
 const prepared=Object.fromEntries(['bridgeBytes','lookupBytes','mathWasmBytes','schedulerWasmBytes','eulerWasmBytes','generatedSpaceWasmBytes'].map(key=>[key,wasmBytes(options[key])]));
 const sources={},weightFeeds={},models={};let math=null,ops=null,scheduler=null,euler=null,generatedBytes=null;
 let disposed=false,closing=false,busy=false,pendingDispose=null,controller=null,terminal=null;
 const metrics={predictions:0,samples:0,failedOperations:0,stepsCompleted:0,highPredictions:0,lowPredictions:0,rawContextNormalizations:0,lastRun:null};
 const live=s=>{signalCheck(signal);signalCheck(s);if(disposed||closing)throw Error('Model sampler candidate disposed or closing');};
 const cleanup=async()=>{
  const errors=[];
  const operations=[...SIDES.map(side=>async()=>{await models[side]?.dispose();}),...SIDES.map(side=>async()=>{await weightFeeds[side]?.dispose();}),async()=>{await ops?.dispose();},async()=>{math?.dispose();},...SIDES.map(side=>async()=>{sources[side]?.dispose();}),async()=>{scheduler?.dispose();},async()=>{euler?.dispose();}];
  for(const operation of operations)try{await operation();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Model sampler cleanup incomplete; retry disposal');
  generatedBytes=null;
 };
 const dispose=()=>{
  if(disposed)return Promise.resolve();if(pendingDispose)return pendingDispose;
  closing=true;if(controller)nativeAbort.call(controller,new DOMException('Model sampler disposed during execution','AbortError'));
  const active=terminal;pendingDispose=Promise.resolve().then(async()=>{await active;await cleanup();disposed=true;closing=false;}).finally(()=>{pendingDispose=null;});return pendingDispose;
 };
 function start(input,names){
  live();if(busy)throw Error('Model sampler candidate busy');known(input,names,'sampler execution');signalCheck(input.signal);
  // Attach transactionally before publishing active state. Native slots/methods
  // ignore caller-owned shadows on a genuine signal and reject duck signals.
  const nextController=new NativeAbortController(),listeners=[];
  const detach=()=>{const errors=[];for(const [external,relay]of listeners)try{nativeRemoveListener.call(external,'abort',relay);}catch(error){errors.push(error);}return errors;};
  try{
   for(const external of [signal,input.signal])if(external!==undefined){
    signalCheck(external);const relay=()=>nativeAbort.call(nextController,nativeSignalReason.call(external));
    nativeAddListener.call(external,'abort',relay,{once:true});listeners.push([external,relay]);signalCheck(external);
   }
   signalCheck(nextController.signal);
  }catch(error){const errors=detach();if(errors.length)throw new AggregateError([error,...errors],'Sampler signal attachment and rollback failed',{cause:error});throw error;}
  let resolve,finished=false;const nextTerminal=new Promise(done=>{resolve=done;});busy=true;controller=nextController;terminal=nextTerminal;
  return {signal:nextController.signal,finish(){
   if(finished)return;finished=true;let errors;
   try{errors=detach();}finally{busy=false;controller=null;terminal=null;resolve();}
   if(errors.length)throw new AggregateError(errors,'Sampler signal cleanup failed after terminal state reset');
  }};
 }
 function progress(callback,event,s){live(s);callback?.({profile:MODEL_SAMPLER_CANDIDATE_PROFILE,experimental:true,acceptedProduction:false,...event});live(s);}
 async function predict(input={}){
  const run=start(input,['side','shapeRequest','tensors','conditioning','timestep','signal','onProgress']);
  let lease;
  try{
   const {side,onProgress}=input;if(!SIDES.includes(side))throw TypeError('Explicit HIGH or LOW side required');
   if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('onProgress must be a function');
   lease=weightFeeds[side].capture({operation:true});
   const result=await models[side].predict({shapeRequest:input.shapeRequest,tensors:input.tensors,conditioning:input.conditioning,timestep:input.timestep,signal:run.signal,onProgress:event=>progress(onProgress,{operation:'predict',side,model:event},run.signal)});
   live(run.signal);result.evidence={...result.evidence,effectiveWeights:{[side]:{epoch:lease.epoch,packageHash:lease.packageHash}}};metrics.predictions++;return result;
  }catch(error){metrics.failedOperations++;throw error;}finally{try{await lease?.release();}finally{run.finish();}}
 }
 async function sample(input={},onTrace=null){
  const run=start(input,['shapeRequest','tensors','noise','positive','negative','signal','onProgress']);
  let space=null,pointwise=null,ownedTensors=[],ownedNoise=null,positive=null,negative=null,x=null,output=null;
  const weightLeases={};
  const temporaries=new Set(),retain=value=>{temporaries.add(value);return value;},drop=value=>{if(value&&temporaries.delete(value))value.fill(0);};
  try{
   const {onProgress}=input;if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('onProgress must be a function');
   for(const side of SIDES)weightLeases[side]=weightFeeds[side].capture({operation:true});
   const shapeRequest=plain(input.shapeRequest),canonical=deriveWorkflowShapes(shapeRequest),contexts=canonical.orderedContexts.entries;
   const ids=['target.latent',...contexts.map(entry=>entry.contextKey+'.latent')],requirements=ids.map(id=>canonical.requirements.find(value=>value.requirementId===id));
   if(!canonical.orderedContexts.complete||requirements.some(value=>value?.state!=='known'||value.dtype!=='float32')||!canonical.concatenation.totalTokens)throw RangeError('Complete explicit canonical float32 workflow shapes required');
   for(let index=0;index<requirements.length;index++){
    const requirement=requirements[index];if(requirement.meaning!==(index===0?GENERATED_MODEL_LATENT:CONTEXT_MEAN)||requirement.normalization!==NORMALIZATION)throw TypeError('Canonical generated target and normalized context meanings required');
   }
   const target=requirements[0],shape=target.shape,elements=shape.reduce((a,b)=>a*b,1);
   if(!Number.isSafeInteger(elements)||elements<1||elements>GENERATED_MAX_ELEMENTS)throw RangeError('Sample target exceeds generated-space element capacity');
   // Capture caller inputs before the first await. Omitted noise is generated
   // later by the named host initializer, after canonical sequence admission.
   const suppliedNoise=input.noise,noiseProfile=suppliedNoise===undefined?SAMPLE_INITIALIZATION_PROFILE:'explicit-caller-f32';
   ownedNoise=suppliedNoise===undefined?null:f32(suppliedNoise,elements,'Noise');positive=conditioning(input.positive);negative=conditioning(input.negative);
   let tensors=input.tensors;
   if(tensors===undefined){if(contexts.length)throw TypeError('Explicit ordered context tensors required when contexts exist');tensors=[];}
   if(Array.isArray(tensors)&&Object.getPrototypeOf(tensors)===Array.prototype&&tensors.length===contexts.length){
    const ordered=[{requirementId:'target.latent',shape:[...shape],dtype:'float32',meaning:GENERATED_MODEL_LATENT,normalization:NORMALIZATION,data:new Float32Array(elements)}];
    for(let index=0;index<tensors.length;index++){const item=Object.getOwnPropertyDescriptor(tensors,String(index));if(!item||!Object.hasOwn(item,'value'))throw TypeError('Dense ordered context tensor data required');ordered.push(item.value);}
    tensors=ordered;
   }
   if(!Array.isArray(tensors)||Object.getPrototypeOf(tensors)!==Array.prototype||tensors.length!==ids.length)throw TypeError('Exact ordered target and canonical context tensors required');
   for(let index=0;index<tensors.length;index++){
    const item=Object.getOwnPropertyDescriptor(tensors,String(index));if(!item||!Object.hasOwn(item,'value'))throw TypeError('Dense tensor data array required');
    const tensor=item.value,requirement=requirements[index];
    if(!tensor||typeof tensor!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(tensor)))throw TypeError('Plain tensor object required');
    const metadata={};let payload;
    for(const key of Reflect.ownKeys(tensor)){const d=Object.getOwnPropertyDescriptor(tensor,key);if(typeof key!=='string'||!Object.hasOwn(d,'value')||!d.enumerable)throw TypeError('Plain tensor data fields required');if(key==='data')payload=d.value;else Object.defineProperty(metadata,key,{value:plain(d.value),writable:true,enumerable:true,configurable:true});}
    if(metadata.requirementId!==ids[index]||!same(metadata.shape,requirement.shape)||metadata.dtype!=='float32')throw TypeError('Ordered tensor binding differs from canonical requirement: '+ids[index]);
    if(Object.hasOwn(metadata,'values')||['attentionMask','mask','noiseMask','denoiseMask','latentContract'].some(key=>metadata[key]!==undefined))throw TypeError('Ambiguous, masked or restored latent input is unsupported');
    if(metadata.layout!==undefined&&metadata.layout!=='NCTHW'||metadata.axes!==undefined&&!same(metadata.axes,requirement.axes)||metadata.byteLength!==undefined&&metadata.byteLength!==requirement.shape.reduce((a,b)=>a*b,1)*4)throw TypeError('Tensor layout, axes or byteLength differs from canonical NCTHW requirement');
    const raw=index>0&&metadata.meaning==='raw-posterior-mean';
    if(raw?metadata.normalization!==undefined:metadata.meaning!==requirement.meaning||metadata.normalization!==requirement.normalization)throw TypeError('Tensor latent meaning/normalization mismatch: '+ids[index]);
    if(index===0&&metadata.profileId!==undefined)throw TypeError('Generated target cannot carry a posterior mean profile');
    ownedTensors.push({...metadata,layout:'NCTHW',data:f32(payload,requirement.shape.reduce((a,b)=>a*b,1),ids[index])});
   }
   // Owners bind the actual canonical shape, without target resizing or padding.
   space=await createGeneratedLatentSpace({wasmBytes:generatedBytes,targetShape:shape});live(run.signal);
   pointwise=createGeneratedTargetPointwise({scheduler,euler,targetShape:shape});
   for(let index=1;index<ownedTensors.length;index++)if(ownedTensors[index].meaning==='raw-posterior-mean'){
    const original=ownedTensors[index],normalized=await space.normalizeContextRaw(original,{signal:run.signal});live(run.signal);
    ownedTensors[index]={...original,...normalized,requirementId:ids[index]};wipeTensor(original);metrics.rawContextNormalizations++;
   }
   // The shared sequence owner validates source IDs, order, all semantic labels
   // and unsupported padding before any neural model or scheduler operation.
   const sequence=createModelSequence({shapeRequest,tensors:ownedTensors});let layout;
   try{layout=sequence.describe();}finally{sequence.dispose();}
   if(ownedNoise===null){ownedNoise=await createSampleNoise(elements,{signal:run.signal});live(run.signal);}
   const schedule=scheduler.schedule();
   if(schedule.profile!==SCHEDULE_PROFILE||schedule.steps!==6||schedule.splitStep!==3||schedule.sigmas.length!==7||schedule.sigmas[0]!==1||schedule.sigmas[6]!==0)throw Error('Pinned simple6/shift5/split3 scheduler mismatch');
   const timesteps=scheduler.timesteps(schedule.sigmas.slice(0,6)),stepEvidence=[];
   metrics.stepsCompleted=0;
   const invoke=async(name,request)=>{live(run.signal);const result=await pointwise[name]({shape,...request},{signal:run.signal});live(run.signal);return retain(result.data);};
   const trace=async(name,data,metadata={})=>{if(onTrace){live(run.signal);await onTrace({name,dtype:'float32',shape:[...shape],data:new Float32Array(data),profile:MODEL_SAMPLER_CANDIDATE_PROFILE,acceptedProduction:false,...metadata});live(run.signal);}};
   x=await invoke('noiseMix',{noise:ownedNoise,latent:ownedTensors[0].data,sigma:schedule.sigmas[0],noiseScale:1});
   await trace('initialX',x,{meaning:'bernini-sampler-state:v1',sigma:schedule.sigmas[0]});
   let handoffNormalization=null;
   for(let step=0;step<6;step++){
    const side=step<3?'HIGH':'LOW',sigma=schedule.sigmas[step],nextSigma=schedule.sigmas[step+1];
    progress(onProgress,{operation:'sample',stage:'prediction-start',step,steps:6,side,sigma,nextSigma,timestep:timesteps[step]},run.signal);
    const prediction=await models[side].predict({shapeRequest,tensors:[{...ownedTensors[0],data:x},...ownedTensors.slice(1)],conditioning:positive,timestep:timesteps[step],signal:run.signal,onProgress:event=>progress(onProgress,{operation:'sample',stage:'model',step,steps:6,side,model:event},run.signal)});
    live(run.signal);retain(prediction.data);metrics[side==='HIGH'?'highPredictions':'lowPredictions']++;
     if(onTrace)await trace('velocity'+String(step).padStart(2,'0'),prediction.data,{step,side,sigma,meaning:prediction.meaning});
    const denoised=await invoke('flowDenoised',{input:x,velocity:prediction.data,sigma});drop(prediction.data);
    const next=await invoke('eulerStep',{latent:x,denoised,sigma,nextSigma});drop(denoised);drop(x);x=next;
    metrics.stepsCompleted=step+1;stepEvidence.push({step,side,sigma,nextSigma,timestep:timesteps[step],prediction:prediction.evidence});
    await trace('stepX',x,{step,side,sigma:nextSigma,meaning:'bernini-sampler-state:v1'});
    progress(onProgress,{operation:'sample',stage:'step-complete',step,steps:6,side,sigma:nextSigma},run.signal);
    if(step===2){
     const inverse=await invoke('inverseNoiseScale',{latent:x,sigma:nextSigma});
     const raw=await space.restoreHighHandoff(targetTensor(shape,inverse,[BASE_MODEL_HASHES.HIGH]),{signal:run.signal});live(run.signal);retain(raw.data);drop(inverse);
     await trace('highPublic',raw.data,{meaning:raw.meaning,handoffProfile:raw.handoffProfile,sigma:nextSigma});
     const normalized=await space.normalizeHighHandoff(raw,{signal:run.signal});live(run.signal);retain(normalized.data);drop(raw.data);handoffNormalization=normalized.handoffNormalization;
     const zeroNoise=retain(new Float32Array(elements)),lowEntry=await invoke('noiseMix',{noise:zeroNoise,latent:normalized.data,sigma:nextSigma,noiseScale:1});drop(zeroNoise);drop(normalized.data);drop(x);x=lowEntry;
     await trace('lowEntry',x,{meaning:'bernini-sampler-state:v1',sigma:nextSigma,handoffNormalization});
    }
   }
   // Source final inverse_noise_scaling at sigma0 divides by one; execute it
   // explicitly before the one final generated-sample process_out operation.
   const finalModel=await invoke('inverseNoiseScale',{latent:x,sigma:schedule.sigmas[6]});drop(x);x=null;
   output=await space.restore(targetTensor(shape,finalModel,[BASE_MODEL_HASHES.HIGH,BASE_MODEL_HASHES.LOW]),{signal:run.signal});live(run.signal);drop(finalModel);
   await trace('finalRaw',output.data,{meaning:output.meaning,latentContract:structuredClone(output.latentContract)});
   const evidence={profile:MODEL_SAMPLER_CANDIDATE_PROFILE,modelProfile:MODEL_CANDIDATE_PROFILE,experimental:true,acceptedProduction:false,generationReady:false,publicRuntimeEnabled:false,steps:6,highUpdates:3,lowUpdates:3,cfg:1,negativeConditioning:'structurally validated; negative neural pass skipped at CFG1',contexts:'one canonical ordered population shared by both conditioning branches',targetShape:[...shape],originalProductionTarget:ORIGINAL81_TARGET_SHAPE.slice(),initialization:{noiseProfile,comfyRngBitIdentity:false},totalTokens:layout.totalTokens,schedule:{profile:schedule.profile,source:schedule.source,shift:schedule.shift,splitStep:3,sigmas:Array.from(schedule.sigmas),tableIndices:Array.from(schedule.tableIndices),timesteps:Array.from(timesteps)},handoff:{high:'inverseNoiseScale -> Wan21 process_out',low:'Wan21 process_in (all-zero raw skip) -> zero-noise CONST noiseMix',handoffNormalization},final:'inverseNoiseScale(sigma0) -> one generated-sample restore',producerModelSha256s:[BASE_MODEL_HASHES.HIGH,BASE_MODEL_HASHES.LOW],modelRuns:stepEvidence,weightCache:'owned prepared F32 stage weights; native ORT upload copies are not claimed eliminated',fullFileSHA256Verified:false,originalProductionPrecisionVerified:false,requiredShapeAcceptance:'BLOCKED until original [1,16,21,60,104] target with full canonical contexts is executed and independently compared'};
   evidence.effectiveWeights=Object.fromEntries(SIDES.map(side=>[side,{epoch:weightLeases[side].epoch,packageHash:weightLeases[side].packageHash}]));
   metrics.samples++;metrics.lastRun=structuredClone(evidence);output.evidence=evidence;return output;
  }catch(error){metrics.failedOperations++;wipeTensor(output);throw error;}finally{
   try{for(const value of temporaries)value.fill(0);temporaries.clear();for(const tensor of ownedTensors)wipeTensor(tensor);ownedNoise?.fill(0);wipeTensor(positive);wipeTensor(negative);positive?.attentionMask.fill(0);negative?.attentionMask.fill(0);pointwise?.dispose();space?.dispose();}finally{try{const released=await Promise.allSettled(Object.values(weightLeases).map(lease=>lease.release())),errors=released.filter(value=>value.status==='rejected').map(value=>value.reason);if(errors.length)throw new AggregateError(errors,'Sampler weight operation lease cleanup incomplete');}finally{run.finish();}}
  }
 }
 try{
  for(const side of SIDES){sources[side]=await createFullModelWeightSource({file:files[side],side,decoder:'lookup',bridgeBytes:prepared.bridgeBytes,lookupBytes:prepared.lookupBytes,readAheadBytes,signal});live();}
  for(const side of SIDES){weightFeeds[side]=await createFullModelWeightFeed({source:sources[side],side});live();}
  math=await createModelMath({wasmBytes:prepared.mathWasmBytes});live();ops=await createBatchedModelOps({numThreads:wasmThreads});live();
  for(const side of SIDES){models[side]=await createBerniniModelCandidate({source:weightFeeds[side].source,math,ops,signal});live();}
  const schedulerBytes=await loadBytes(prepared.schedulerWasmBytes,new URL('../scheduler/build/scheduler.wasm',import.meta.url),signal);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',schedulerBytes)),v=>v.toString(16).padStart(2,'0')).join('');if(digest!==SCHEDULER_SHA256)throw Error('Pinned scheduler WASM hash mismatch');
  scheduler=createSchedulerKernel(await WebAssembly.compile(schedulerBytes));live();
  euler=await createEulerKernel(await loadBytes(prepared.eulerWasmBytes,new URL('../kernel/euler.wasm',import.meta.url),signal));live();
  generatedBytes=await loadBytes(prepared.generatedSpaceWasmBytes,new URL('./generated-space/build/generated-space.wasm',import.meta.url),signal);live();
  // Authenticate generated bytes and ABI during preparation, before admission.
  const check=await createGeneratedLatentSpace({wasmBytes:generatedBytes,targetShape:[1,16,1,2,2]});check.dispose();live();
  return Object.freeze({
   predict,sample:input=>sample(input),
   getWeightFeed(side){live();if(!SIDES.includes(side))throw TypeError('Explicit HIGH or LOW weight side required');return weightFeeds[side];},
   diagnose(input={},options={}){known(options,['onTrace'],'sampler diagnostics');if(typeof options.onTrace!=='function')return Promise.reject(TypeError('diagnose requires an onTrace function'));return sample(input,options.onTrace);},
   describe(){live();return {schemaVersion:'works-bernini-model-sampler-candidate/0.1',profile:MODEL_SAMPLER_CANDIDATE_PROFILE,experimental:true,acceptedProduction:false,generationReady:false,publicRuntimeEnabled:false,scheduler:SCHEDULE_PROFILE,resource:{wasmThreads,readAheadBytes,thread4RequiresCrossOriginIsolation:true},sampler:'Euler',steps:6,splitStep:3,cfg:1,noise:'optional; owner WebCrypto/host Box-Muller F32 or explicit compact nonshared finite Float32Array; no seed or RNG input',normalInputs:describeNormalGenerationInputs(),models:Object.fromEntries(SIDES.map(side=>[side,models[side].describe()])),sharedOwners:'one model math owner; one linear and one attention ORT session; both model candidates internally constructed',input:'deriveWorkflowShapes canonical target plus ordered contexts; raw contexts normalized by generated-space owner; target defaults zero when omitted; supplied contexts retain exact canonical order',output:{dtype:'float32',layout:'NCTHW',meaning:GENERATED_RAW_SAMPLE,space:'raw',latentContract:'generated-sample / restored / diffusion_models'},weightCache:'owned prepared F32 stage weights; native ORT upload copies are not claimed eliminated',requiredShapeAcceptance:'BLOCKED until original target and canonical context population are independently accepted'};},
   stats(){return {...structuredClone(metrics),busy,disposed,closing,models:Object.fromEntries(SIDES.map(side=>[side,models[side]?.stats()??null])),sources:Object.fromEntries(SIDES.map(side=>[side,sources[side]?.stats()??null])),weightFeeds:Object.fromEntries(SIDES.map(side=>[side,weightFeeds[side]?.stats()??null])),math:math?.stats()??null,ops:ops?.stats()??null,sharedSessionCreations:ops?.stats().sessionCreations??0};},
   dispose,recover:dispose
  });
 }catch(error){closing=true;try{await cleanup();disposed=true;}catch(cleanupError){throw new AggregateError([error,cleanupError],'Model sampler preparation and cleanup failed',{cause:error});}throw error;}
}

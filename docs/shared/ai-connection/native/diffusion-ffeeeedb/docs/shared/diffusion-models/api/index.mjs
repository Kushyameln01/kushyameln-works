import {describeExecutionCapabilities,checkExecutionSupport,POINTWISE_MAX_ELEMENTS} from '../execution/capabilities.mjs';
export {describeExecutionCapabilities,checkExecutionSupport} from '../execution/capabilities.mjs';
export async function createBerniniP4Execution(options={}){const owned=structuredClone(options);const owner=await import('../execution/p4.mjs');return owner.createBerniniP4Execution(owned);}
import {validateLoraBinding,LORA_LIMITS} from '../lora/weights.mjs';
import {BUILD_ID} from './build-info.mjs';
import {MODEL_ADAPTER_CAPABILITIES} from './model-adapter.mjs';
export {BUILD_ID} from './build-info.mjs';
export const PROTOCOL_VERSION='diffusion-models/0.1';
export const MAX_TENSOR_ELEMENTS=POINTWISE_MAX_ELEMENTS;
const OPERATIONS=new Set(['capabilities','checkSupport','prepareP4','runP4','releaseP4','inspect','eulerStep','schedule','noiseMix','inverseNoiseScale','flowDenoised','validateConditioning','validateRawLatent','normalizeRawMean','restoreRawMean','linearProjection','linearProjectionF32','inspectLora','loadLora','listLoras','readLora','readLoraSource','unloadLora','load','predict','sample','unload','modelStatus','saveTensor','readTensor','cancel','dispose']);
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(x);
const identity=q=>({buildId:BUILD_ID,protocolVersion:q?.protocolVersion,sessionId:q?.sessionId,jobId:q?.jobId,inputRevision:q?.inputRevision,op:q?.op});
const matches=(a,b)=>['buildId','protocolVersion','sessionId','jobId','inputRevision','op'].every(k=>a[k]===b[k]);
const errorResponse=(q,code,message,details)=>({...identity(q),status:'error',error:{code,message,...(details?{details}:{})}});
const ok=(q,result)=>({...identity(q),status:'ok',result});

// Same-page factory. This owns one worker; it never reaches other modules or tabs.
export function createDiffusionModels({sessionId=crypto.randomUUID()}={}){
 if(!validId(sessionId))throw new TypeError('Invalid sessionId');
 let worker=null,active=null,disposed=false,revision=0,generation=0;
 const loras=new Map();
 const progressListeners=new Set();let loadedModel=null,p4Prepared=false,modelCleanupRequired=false;
 const snapshot=entry=>({...structuredClone(entry.metadata),bindingId:entry.bindingId});
 const stopWorker=()=>{generation++;worker?.terminate();worker=null;loadedModel=null;p4Prepared=false;modelCleanupRequired=false;};
 const settle=(reply)=>{
  const pending=active;active=null;
  // A factory can fail before returning a disposal owner. Discard the entire
  // preparation realm on every dispatched paired-load failure, regardless of
  // its error code; no later P4/model operation may reuse partial ORT state.
  if(pending?.pairedLoad&&reply.status==='error'){
   stopWorker();reply={...reply,error:{...reply.error,details:{...reply.error?.details,workerTerminated:true,preparationDiscarded:true,reloadRequired:true}}};
  }
  pending?.resolve(reply);
 };
 function cancel(target){
  target={...target,protocolVersion:PROTOCOL_VERSION,op:'cancel'};
  if(disposed)return errorResponse(target,'DISPOSED','The API has been disposed');
  if(!active||target?.sessionId!==sessionId||target?.jobId!==active.request.jobId||target?.inputRevision!==active.request.inputRevision)return errorResponse(target,'NOT_RUNNING','The target job is not active');
  const pending=active.request;stopWorker();settle(errorResponse(pending,'CANCELLED','The owned worker was terminated'));
  return ok(target,{cancelled:true,workerTerminated:true});
 }
 function dispose(){
  if(disposed)return;disposed=true;stopWorker();loras.clear();progressListeners.clear();
  if(active)settle(errorResponse(active.request,'DISPOSED','The owned worker was terminated and API disposed'));
 }
 function subscribeProgress(listener){
  if(disposed)throw Error('The API has been disposed');if(typeof listener!=='function')throw TypeError('A local progress listener function is required');
  progressListeners.add(listener);return ()=>progressListeners.delete(listener);
 }
 async function request(q,options={}){
  if(disposed)return errorResponse(q,'DISPOSED','The API has been disposed');
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='onProgress')||options.onProgress!==undefined&&typeof options.onProgress!=='function')return errorResponse(q,'INVALID_REQUEST','Only an optional local onProgress observer is accepted');
  if(!q||(q.buildId!==undefined&&q.buildId!==BUILD_ID)||q.protocolVersion!==PROTOCOL_VERSION||q.sessionId!==sessionId||!validId(q.jobId)||!Number.isSafeInteger(q.inputRevision)||q.inputRevision<0)return errorResponse(q,'INVALID_REQUEST','Invalid protocol or request identity');
  if(!OPERATIONS.has(q.op))return errorResponse(q,'UNSUPPORTED_OPERATION','Unsupported operation');
  if(q.op==='cancel'){
   const r=cancel({...q.input,sessionId});return r.status==='ok'?ok(q,r.result):errorResponse(q,r.error.code,r.error.message);
  }
  if(q.op==='dispose'){dispose();return ok(q,{disposed:true});}
  if(q.inputRevision<revision)return errorResponse(q,'STALE_INPUT','The input revision has already been superseded');
  if(q.op!=='capabilities'&&(!q.input||typeof q.input!=='object'))return errorResponse(q,'INVALID_REQUEST','Expected an input object');
  const pairedLoad=q.op==='load'&&q.input?.files!==undefined;
  if(pairedLoad&&modelCleanupRequired)return errorResponse(q,'MODEL_CLEANUP_REQUIRED','unload the failed model owner before loading another pair');
  if(pairedLoad&&loadedModel)return errorResponse(q,'MODEL_ALREADY_LOADED','unload the current pair before loading another');
  if(pairedLoad&&p4Prepared)return errorResponse(q,'RESOURCE_OWNER_CONFLICT','releaseP4 before full-model load; its Worker was preserved');
  if(q.op==='prepareP4'&&(loadedModel||modelCleanupRequired))return errorResponse(q,'RESOURCE_OWNER_CONFLICT','unload the full-model owner before preparing P4; its Worker was preserved');
  let loraCandidate=null,loraBinding=null,ownedInput=q.input;
  try{
   if(q.op==='linearProjectionF32'){
    const {weight,x,bias}=q.input;
    for(const [value,count] of [[weight,81920],[x,5120],[bias,16]]){
     if(!(value instanceof Float32Array)||value.length!==count||!(value.buffer instanceof ArrayBuffer)||value.byteOffset!==0||value.buffer.byteLength!==value.byteLength||!value.every(Number.isFinite))return errorResponse(q,'INVALID_TENSOR','Compact nonshared finite F32 projection arrays required');
    }
    ownedInput={weight,x,bias};
   }else if(q.op==='loadLora'){
    const options=validateLoraBinding(q.input),file=q.input.file;
    if(!(file instanceof Blob))throw TypeError('Expected a local File or Blob');
    // Capture primitives and immutable Blob ownership before any async work.
    loraCandidate=Object.freeze({file,options});ownedInput={file,...options};
   }else if(q.op==='inspectLora'){
    if(!(q.input.file instanceof Blob))throw TypeError('Expected a local File or Blob');ownedInput={file:q.input.file};
   }else if(['readLora','readLoraSource','unloadLora'].includes(q.op)){
    const entry=loras.get(q.input.stage);
    if(!entry||entry.bindingId!==q.input.bindingId)return errorResponse(q,'LORA_NOT_LOADED','No matching stage and LoRA binding is loaded');
    loraBinding=entry;
    const range=q.op==='readLora'?{tensorName:q.input.tensorName,elementOffset:q.input.elementOffset,elementCount:q.input.elementCount}:{byteOffset:q.input.byteOffset,byteLength:q.input.byteLength};
    // The caller cannot replace the retained file or internal descriptor.
    ownedInput={file:entry.file,binding:structuredClone(entry.metadata),bindingId:entry.bindingId,range};
   }
  }catch(error){return errorResponse(q,error.code??'INVALID_LORA_BINDING',String(error.message??error));}
  if(active){
   if(q.inputRevision===revision)return errorResponse(q,'BUSY','Only one worker operation may run at a time');
   const old=active.request;stopWorker();settle(errorResponse(old,'STALE_INPUT','A newer input revision terminated this job'));
  }
  revision=q.inputRevision;
  // A thread/profile choice is made only in a fresh ORT realm. This reset is
  // reached after owner-conflict checks and never discards a prepared P4/model.
  if(pairedLoad)stopWorker();
  if(q.op==='checkSupport')return ok(q,checkExecutionSupport(q.input));
  if(q.op==='capabilities')return ok(q,{executionDescriptor:describeExecutionCapabilities(),modelRuntime:{...structuredClone(MODEL_ADAPTER_CAPABILITIES),loaded:loadedModel&&!modelCleanupRequired?structuredClone(loadedModel):null,cleanupRequired:modelCleanupRequired,preparedP4:p4Prepared},prepareP4:true,runP4:true,releaseP4:true,checkSupport:true,buildId:BUILD_ID,modelInference:false,loraWeightIO:true,loraApplied:false,inspectLora:true,loadLora:true,listLoras:true,readLora:true,readLoraSource:true,unloadLora:true,loraLimits:{...LORA_LIMITS},partialOnly:true,eulerStep:true,schedule:true,noiseMix:true,inverseNoiseScale:true,flowDenoised:true,validateConditioning:true,validateRawLatent:true,normalizeRawMean:true,restoreRawMean:true,rawMeanProfiles:[{id:'wan21-raw-f32-5x16x16',shape:[1,16,2,2,2],elements:128},{id:'wan21-raw-f32-1x16x16',shape:[1,16,1,2,2],elements:64},{id:'wan21-raw-f32-1x16x32',shape:[1,16,1,2,4],elements:128}],linearProjection:true,linearProjectionF32:true,inspect:true,maxTensorElements:MAX_TENSOR_ELEMENTS,execution:'dedicated-worker',backend:'Hike WASM primitives and staged ORT WASM model execution; accepted domains remain separately scoped',protocolVersion:PROTOCOL_VERSION});
  if(q.op==='listLoras')return ok(q,{bindings:[...loras.values()].map(snapshot),applied:false});
  if(q.op==='unloadLora'){
   loras.delete(loraBinding.metadata.stage);return ok(q,{bindingId:loraBinding.bindingId,stage:loraBinding.metadata.stage,unloaded:true,applied:false});
  }
  return new Promise(resolve=>{
   const ownedRequest={...identity(q),input:ownedInput,observeProgress:!!options.onProgress||progressListeners.size>0};active={request:ownedRequest,resolve,loraCandidate,onProgress:options.onProgress,pairedLoad};
   try{
    if(!worker){
     worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
     const ownedWorker=worker,ownedGeneration=generation;
     worker.onmessage=event=>{
      let data=event.data;
      if(disposed||worker!==ownedWorker||generation!==ownedGeneration||!active||!matches(data,active.request))return;
      if(data.status==='progress'){
       const pending=active;
       for(const listener of [pending.onProgress,...progressListeners]){
        if(disposed||worker!==ownedWorker||generation!==ownedGeneration||active!==pending)break;
        if(listener)try{listener(structuredClone(data));}catch{/* Observers cannot replace results or strand a job. */}
       }
       return;
      }
      if(data.status!=='ok'&&data.status!=='error')return;
      if(data.status==='ok'&&active.request.op==='load')loadedModel={modelSessionId:data.result.modelSessionId,modelEpoch:data.result.modelEpoch};
      if(data.status==='ok'&&active.request.op==='prepareP4')p4Prepared=true;
      if(data.status==='ok'&&active.request.op==='releaseP4')p4Prepared=false;
      if(data.status==='ok'&&active.request.op==='modelStatus'&&data.result?.cleanupRequired===true)modelCleanupRequired=true;
      if(data.status==='error'&&['MODEL_PREPARATION_CLEANUP_FAILED','MODEL_UNLOAD_FAILED','MODEL_CLEANUP_REQUIRED'].includes(data.error?.code))modelCleanupRequired=true;
      if(data.status==='ok'&&active.request.op==='unload')stopWorker();
      if(active.loraCandidate&&data.status==='ok'){
       const candidate=active.loraCandidate;
       try{
        const metadata=structuredClone(data.result),options=candidate.options;
        if(metadata.stage!==options.stage||metadata.strength!==options.strength||metadata.baseModelSha256!==options.baseModelSha256||metadata.fileBytes!==candidate.file.size||!(/^[a-f0-9]{64}$/.test(metadata.fullFileSHA256))||metadata.applied!==false)throw Error('LoRA load result does not match its retained input');
        const entry={file:candidate.file,metadata,bindingId:crypto.randomUUID()};
        loras.set(options.stage,entry);data={...data,result:snapshot(entry)};
       }catch(error){const pending=active.request;stopWorker();settle(errorResponse(pending,'WORKER_ERROR',String(error.message??error)));return;}
      }
      settle(data);
     };
     worker.onerror=event=>{
      if(worker!==ownedWorker||generation!==ownedGeneration||!active)return;
      const request=active.request;stopWorker();settle(errorResponse(request,'WORKER_ERROR',event.message||'Worker failed'));
     };
     worker.onmessageerror=()=>{
      if(worker!==ownedWorker||generation!==ownedGeneration||!active)return;
      const request=active.request;stopWorker();settle(errorResponse(request,'WORKER_ERROR','Unreadable worker message'));
     };
    }
    // No transfer list: caller arrays and Blob ownership are preserved.
    worker.postMessage(ownedRequest);
   }catch(error){stopWorker();settle(errorResponse(ownedRequest,'INVALID_REQUEST',String(error.message??error)));}
  });
 }
 return Object.freeze({sessionId,request,cancel,dispose,subscribeProgress});
}

// The caller supplies a dedicated port. There are no global window listeners.
export function attachDiffusionPort(port,api,{progress=false}={}){
 if(!(port instanceof MessagePort)||!api||typeof api.request!=='function')throw new TypeError('Expected a MessagePort and diffusion API');
 if(typeof progress!=='boolean')throw new TypeError('Port progress must be an explicit boolean');
 let attached=true;const pending=new Map();
 const key=q=>validId(q?.sessionId)&&validId(q?.jobId)&&typeof q?.op==='string'&&Number.isSafeInteger(q?.inputRevision)?JSON.stringify([q.protocolVersion,q.sessionId,q.jobId,q.inputRevision,q.op]):null;
 const unsubscribe=progress&&typeof api.subscribeProgress==='function'?api.subscribeProgress(event=>{
  if(!attached||!pending.has(key(event)))return;
  try{port.postMessage(event);}catch{detach();}
 }):()=>{};
 const onMessage=async event=>{
  const ownedKey=key(event.data);if(ownedKey)pending.set(ownedKey,(pending.get(ownedKey)??0)+1);
  try{
   const reply=await api.request(event.data);if(attached)try{port.postMessage(reply);}catch{detach();}
  }finally{if(ownedKey){const count=(pending.get(ownedKey)??1)-1;if(count)pending.set(ownedKey,count);else pending.delete(ownedKey);}}
 };
 function detach(){if(!attached)return;attached=false;unsubscribe();pending.clear();port.removeEventListener('message',onMessage);port.close();}
 port.addEventListener('message',onMessage);port.start();
 return detach;
}

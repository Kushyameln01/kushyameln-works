import {encodeTensor,decodeTensor,describeTensor} from '../../inference/tensor.mjs';
import {attachDiffusionWeightServer} from './weight-port.mjs';
import {describeNormalGenerationInputs,NORMAL_GENERATION_INPUTS} from '../execution/sample-initialization.mjs';

export const MODEL_CODEC_MAX_BYTES=64*1024*1024;
export const MODEL_ADAPTER_CAPABILITIES=Object.freeze({
 schemaVersion:'diffusion-public-model-adapter/0.1',
 operationsImplemented:Object.freeze(['load','predict','sample','unload','modelStatus','saveTensor','readTensor','openWeightFeed']),
 confirmedPublicInputDomains:Object.freeze([]),
 requiredModelFiles:Object.freeze(['HIGH','LOW']),
 generationReady:false,originalWorkflowAccepted:false,
 numericalAcceptance:'See separately scoped execution capabilities; routing does not establish shape or precision acceptance',
 maxEncodedTensorBytes:MODEL_CODEC_MAX_BYTES,
 normalInputs:NORMAL_GENERATION_INPUTS,
 cancellation:'The owning public API terminates its dedicated Worker; load is required again',
 weightFeed:'explicit duplex MessagePort; immutable base provider and completed-F32 standalone consumer; independent of the inference request queue',
 codec:'canonical WKTSR001; generated samples retain their raw/restored latentContract'
});
const nativeBlobSize=Object.getOwnPropertyDescriptor(Blob.prototype,'size').get;
const nativeBlobArrayBuffer=Blob.prototype.arrayBuffer;
const typed=Object.getPrototypeOf(Float32Array.prototype);
const slots=Object.fromEntries(['buffer','byteOffset','byteLength','length'].map(key=>[key,Object.getOwnPropertyDescriptor(typed,key).get]));
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
const TYPES={float32:Float32Array,int32:Int32Array,uint8:Uint8Array,int64:BigInt64Array};
function fail(code,message,details){const error=new Error(message);Object.assign(error,{code,...(details?{details}:{})});throw error;}
function fields(input,names,label){
 if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))fail('INVALID_MODEL_INPUT',label+' must be a plain object');
 const output={};
 for(const key of Reflect.ownKeys(input)){
  const d=Object.getOwnPropertyDescriptor(input,key);
  if(typeof key!=='string'||!names.includes(key)||!d.enumerable||!Object.hasOwn(d,'value'))fail('INVALID_MODEL_INPUT','Unknown or accessor '+label+' field: '+String(key));
  Object.defineProperty(output,key,{value:d.value,writable:true,enumerable:true,configurable:true});
 }
 return output;
}
function fileSize(file){try{return nativeBlobSize.call(file);}catch{fail('INVALID_MODEL_INPUT','A native immutable File or Blob is required');}}
function snapshotTensor(tensor){
 if(!tensor||typeof tensor!=='object')fail('INVALID_TENSOR','A tensor is required');
 for(const key of Reflect.ownKeys(tensor)){const d=Object.getOwnPropertyDescriptor(tensor,key);if(typeof key!=='string'||!d.enumerable||!Object.hasOwn(d,'value'))fail('INVALID_TENSOR','Plain tensor data fields are required');}
 const Type=TYPES[tensor.dtype],data=tensor.data;
 if(!Type||Object.getPrototypeOf(data??{})!==Type.prototype)fail('INVALID_TENSOR','Canonical native tensor data type required');
 let buffer,offset,size;try{buffer=slots.buffer.call(data);offset=slots.byteOffset.call(data);size=slots.byteLength.call(data);}catch{fail('INVALID_TENSOR','Native typed tensor data required');}
 if(Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||offset!==0||size!==bufferLength.call(buffer))fail('INVALID_TENSOR','Compact nonshared tensor storage required');
 if(size+65548>MODEL_CODEC_MAX_BYTES)fail('TENSOR_FILE_BUDGET_EXCEEDED','Tensor exceeds the canonical file budget',{maxEncodedBytes:MODEL_CODEC_MAX_BYTES});
 // The canonical codec owns metadata validation. Its selector intentionally
 // excludes runtime handles and diagnostic evidence from saved tensor payloads.
 let mask=tensor.attentionMask;
 if(mask!==undefined&&!Array.isArray(mask)){
  let backing,maskOffset,maskBytes;try{backing=slots.buffer.call(mask);maskOffset=slots.byteOffset.call(mask);maskBytes=slots.byteLength.call(mask);}catch{fail('INVALID_TENSOR','Native attention mask storage required');}
  if(Object.getPrototypeOf(mask)!==Uint8Array.prototype||Object.getPrototypeOf(backing)!==ArrayBuffer.prototype||maskOffset!==0||maskBytes!==bufferLength.call(backing))fail('INVALID_TENSOR','Compact nonshared attention mask storage required');
  mask=new Uint8Array(mask);
 }
 const metadata=structuredClone(describeTensor({...tensor,...(mask!==undefined?{attentionMask:mask}:{})}));
 return {...metadata,data:new Type(data)};
}
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');

/** Public Worker owner. Runtime creation is fixed to the real Bernini factory;
 * no reference, expected prediction, numeric gate or runtime injection port.
 */
export function createModelAdapter(){
 let runtime=null,description=null,modelSessionId=null,epoch=0,busy=false,disposed=false,closing=false,needsCleanup=false;
 let activeController=null,activeTerminal=null,disposePending=null;
 const weightServers=new Set();
 const closeWeightServers=()=>{for(const server of weightServers)server.close(Object.assign(Error('Loaded model session was released'),{code:'STALE_MODEL'}));weightServers.clear();};
 const live=()=>{if(disposed||closing)fail('DISPOSED','The public model owner is disposed or closing');};
 const requireRuntime=input=>{
  if(!runtime)fail('MODEL_NOT_LOADED','load with the original HIGH/LOW pair is required, including after Worker cancellation');
  // Duplex package work runs outside the inference queue. Observe its cleanup
  // obligations here even when the caller did not first request modelStatus.
  if(observeResources(runtime).cleanupRequired)needsCleanup=true;
  if(needsCleanup||!description)fail('MODEL_CLEANUP_REQUIRED','A failed preparation or cleanup owner must be unloaded before execution');
  if(input.modelSessionId!==undefined&&input.modelSessionId!==modelSessionId)fail('STALE_MODEL','The model session belongs to an unloaded or replaced owner');
 };
 const observeResources=owner=>{
  try{
   const resources=owner.stats(),cleanupRequired=!!(resources?.closing||resources?.cleanupPending||resources?.ops?.closing||resources?.ops?.cleanupPending||Object.values(resources?.models??{}).some(model=>model?.closing||model?.cleanupPending)||Object.values(resources?.weightFeeds??{}).some(feed=>feed?.closing||feed?.cleanupPending));
   return {resources,cleanupRequired};
  }catch{return {resources:null,cleanupRequired:true};}
 };
 const status=()=>{
  const observed=runtime?observeResources(runtime):{resources:null,cleanupRequired:false};
  if(observed.cleanupRequired)needsCleanup=true;
  return {adapterImplemented:true,loaded:!!runtime&&!!description&&!needsCleanup,cleanupRequired:!!runtime&&needsCleanup,modelSessionId,modelEpoch:epoch,busy,closing,disposed,generationReady:false,nativeCandidateDescription:description?structuredClone(description):null,resources:observed.resources};
 };
 const unload=async()=>{
  if(!runtime)return {unloaded:true,modelSessionId:null,modelEpoch:epoch,resources:null};
  const owner=runtime,id=modelSessionId;
  // Abort duplex admission/read work before asking the owner to drain it. A
  // package may itself be waiting for an immutable base read on these ports.
  closeWeightServers();
  // Retain an owner whose cleanup fails so callers can retry; do not advertise
  // an unloaded model or lose the only remaining disposal capability.
  try{await owner.dispose();}catch(error){needsCleanup=true;const failure=new Error('Model unload cleanup failed: '+String(error.message??error),{cause:error});failure.code='MODEL_UNLOAD_FAILED';throw failure;}
  const resources=observeResources(owner).resources;runtime=null;description=null;modelSessionId=null;needsCleanup=false;epoch++;
  return {unloaded:true,modelSessionId:id,modelEpoch:epoch,resources};
 };
 async function execute(op,input={},options={}){
  live();const context=fields(options,['onProgress'],'adapter options');
  if(context.onProgress!==undefined&&typeof context.onProgress!=='function')fail('INVALID_MODEL_INPUT','onProgress must be a local observer function');
  if(op==='modelStatus'){fields(input,[],'model status');return status();}
  if(busy)fail('BUSY','Only one public model operation may execute at a time');
  busy=true;const controller=new AbortController();activeController=controller;let finish;activeTerminal=new Promise(resolve=>{finish=resolve;});
  try{
   if(op==='load'){
    const value=fields(input,['files','file','resource'],'model load');
    if(runtime)fail(needsCleanup?'MODEL_CLEANUP_REQUIRED':'MODEL_ALREADY_LOADED','unload the current model owner before loading another pair');
    if(value.file!==undefined){
     if(value.files!==undefined||value.resource!==undefined)fail('INVALID_MODEL_INPUT','Legacy single-file load does not accept pair or resource options');
     fileSize(value.file);const {inspectSafetensors}=await import('./safetensors.mjs');const inspected=await inspectSafetensors(value.file);
     fail('NOT_READY','The legacy single-file load only inspects headers; paired files.HIGH/files.LOW are required for the model runtime',{reasons:['MODEL_PAIR_REQUIRED',...inspected.readiness.reasons],inspectionScope:'legacy single-file header inspector',payloadBytes:inspected.payloadBytes});
    }
    const pair=fields(value.files,['HIGH','LOW'],'model files');fileSize(pair.HIGH);fileSize(pair.LOW);
    const resource=fields(value.resource??{},['wasmThreads'],'model resource'),wasmThreads=resource.wasmThreads??1;
    if(![1,4].includes(wasmThreads)||wasmThreads===4&&(globalThis.crossOriginIsolated!==true||typeof SharedArrayBuffer!=='function'))fail('UNSUPPORTED_RESOURCE_CONFIG','wasmThreads must be 1, or explicit 4 in a cross-origin-isolated SharedArrayBuffer environment',{requestedThreads:wasmThreads,crossOriginIsolated:globalThis.crossOriginIsolated===true,noFallback:true});
    const files={HIGH:pair.HIGH,LOW:pair.LOW};
    const {createBerniniModelSamplerCandidate}=await import('../execution/model-sampler-candidate.mjs');
    const owner=await createBerniniModelSamplerCandidate({files,signal:controller.signal,wasmThreads});let nextDescription,models;
    try{
     controller.signal.throwIfAborted();const observed=owner.describe();
     if(!observed?.models?.HIGH?.model||!observed?.models?.LOW?.model)throw Error('Prepared Bernini model descriptors are incomplete');
     nextDescription=structuredClone(observed);
     models=Object.fromEntries(['HIGH','LOW'].map(side=>[side,structuredClone(nextDescription.models[side].model)]));
    }catch(error){
     try{await owner.dispose();}catch(cleanupError){
      runtime=owner;description=null;needsCleanup=true;modelSessionId=crypto.randomUUID();epoch++;
      const failure=new AggregateError([error,cleanupError],'Model preparation failed and cleanup must be retried with unload',{cause:error});failure.code='MODEL_PREPARATION_CLEANUP_FAILED';throw failure;
     }
     throw error;
    }
    runtime=owner;description=nextDescription;modelSessionId=crypto.randomUUID();epoch++;
    return {loaded:true,modelSessionId,modelEpoch:epoch,profile:description.profile,models,scheduler:description.scheduler,resource:{wasmThreads,crossOriginIsolated:globalThis.crossOriginIsolated===true},publicWorkerConnected:true,generationReady:false,originalWorkflowAccepted:false,normalInputs:describeNormalGenerationInputs()};
   }
   if(op==='unload'){fields(input,[],'model unload');return await unload();}
   if(op==='openWeightFeed'){
    const value=fields(input,['side','modelSessionId'],'weight feed');requireRuntime(value);
    if(!['HIGH','LOW'].includes(value.side))fail('INVALID_MODEL_INPUT','Explicit HIGH or LOW weight side required');
    const owner=runtime,id=modelSessionId,modelEpoch=epoch,feed=owner.getWeightFeed(value.side),channel=new MessageChannel();
    const binding={modelSessionId:id,modelEpoch,side:value.side};
    const server=attachDiffusionWeightServer(channel.port1,feed,{binding,isCurrent:()=>!disposed&&!closing&&!needsCleanup&&runtime===owner&&modelSessionId===id&&epoch===modelEpoch,onInvalidated:()=>{if(runtime===owner&&modelSessionId===id)needsCleanup=true;}});weightServers.add(server);
    return {port:channel.port2,binding,descriptor:feed.describe(),protocol:'diffusion-weight-port/1',normalValidation:'structure, target, complete coverage, finite F32, package identity and transaction checks; independent numerical comparison remains diagnostic',realLoraFullModelAccepted:false};
   }
   if(op==='predict'||op==='sample'){
    const names=op==='predict'?['side','shapeRequest','tensors','conditioning','timestep','modelSessionId']:['shapeRequest','tensors','noise','positive','negative','modelSessionId'];
    const value=fields(input,names,'model '+op);requireRuntime(value);delete value.modelSessionId;
    const id=modelSessionId,modelEpoch=epoch;
    const onProgress=event=>{controller.signal.throwIfAborted();context.onProgress?.({...structuredClone(event),modelSessionId:id,modelEpoch});controller.signal.throwIfAborted();};
    let result;
    try{result=await runtime[op]({...value,signal:controller.signal,onProgress});controller.signal.throwIfAborted();}
    catch(error){
     if(observeResources(runtime).cleanupRequired){
      needsCleanup=true;
      const failure=new Error('Model execution cleanup incomplete; unload is required: '+String(error?.message??error),{cause:error});
      failure.code='MODEL_CLEANUP_REQUIRED';failure.details={cleanupRequired:true};throw failure;
     }
     throw error;
    }
    const {evidence,...tensor}=result;
    return {tensor,execution:{operation:op,modelSessionId:id,modelEpoch,profile:evidence?.profile??description.profile,...(evidence?.effectiveWeights?{effectiveWeights:structuredClone(evidence.effectiveWeights)}:{}),publicWorkerConnected:true,generationReady:false,originalWorkflowAccepted:false}};
   }
   if(op==='saveTensor'){
    const value=fields(input,['tensor'],'tensor save'),tensor=snapshotTensor(value.tensor),bytes=await encodeTensor(tensor);controller.signal.throwIfAborted();
    return {bytes,byteLength:bytes.byteLength,sha256:await sha(bytes),metadata:describeTensor(tensor)};
   }
   if(op==='readTensor'){
    const value=fields(input,['file'],'tensor read'),size=fileSize(value.file);
    if(size>MODEL_CODEC_MAX_BYTES)fail('TENSOR_FILE_BUDGET_EXCEEDED','Encoded tensor file exceeds the byte budget',{maxEncodedBytes:MODEL_CODEC_MAX_BYTES});
    const bytes=await nativeBlobArrayBuffer.call(value.file);controller.signal.throwIfAborted();const tensor=await decodeTensor(bytes);controller.signal.throwIfAborted();
    return {tensor,byteLength:size,sha256:await sha(bytes)};
   }
   fail('UNSUPPORTED_OPERATION','Unsupported model adapter operation');
  }finally{busy=false;activeController=null;activeTerminal=null;finish();}
 }
 function dispose(){
  if(disposed)return Promise.resolve();if(disposePending)return disposePending;
  closing=true;activeController?.abort(new DOMException('Public model owner disposed','AbortError'));
  const terminal=activeTerminal;disposePending=Promise.resolve().then(async()=>{await terminal;await unload();disposed=true;closing=false;}).finally(()=>{disposePending=null;});return disposePending;
 }
 return Object.freeze({execute,status,dispose});
}

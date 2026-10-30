import {BUILD_ID,BUILD_SOURCES} from './build-info.mjs';
const MAX_TENSOR_ELEMENTS=1048576;
import {inspectSafetensors} from './safetensors.mjs';
import {createEulerKernel} from '../euler-kernel.mjs';
import {EULER_WASM_SHA256} from '../kernel-registry.mjs';
let kernel,scheduler,projectionStage,latentSpace,latentKernelInfo;
function fail(code,message,details){const error=new Error(message);Object.assign(error,{code,details});throw error;}

async function getScheduler(){
 if(!scheduler){
  const response=await fetch(new URL('../scheduler/build/scheduler.wasm',import.meta.url));
  if(!response.ok)fail('HIKE_UNAVAILABLE','Could not read the Hike scheduler');
  const bytes=await response.arrayBuffer();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==BUILD_SOURCES['../scheduler/build/scheduler.wasm'])fail('INTEGRITY_ERROR','Hike scheduler WASM hash mismatch');
  const {createSchedulerKernel}=await import('../scheduler/scheduler-kernel.mjs');
  scheduler=createSchedulerKernel(await WebAssembly.compile(bytes));
 }
 return scheduler;
}
function checkedShape(input,names){
 const shape=input.shape;
 if(!Array.isArray(shape)||!shape.length||shape.length>8||shape.some(n=>!Number.isSafeInteger(n)||n<1))fail('INVALID_TENSOR','Expected 1..8 positive safe tensor dimensions');
 let count=1;for(const dim of shape){count*=dim;if(!Number.isSafeInteger(count)||count>MAX_TENSOR_ELEMENTS)fail('TENSOR_BUDGET_EXCEEDED','Tensor exceeds the API element budget',{maxTensorElements:MAX_TENSOR_ELEMENTS});}
 for(const name of names){const value=input[name];if(!(value instanceof Float32Array)||value.length!==count||!value.every(Number.isFinite))fail('INVALID_TENSOR','Expected finite Float32Array with matching shape: '+name);}
 return [...shape];
}
function metadata(tensor,profileId){
 return {dtype:tensor.dtype,shape:[...tensor.shape],layout:tensor.layout,meaning:tensor.meaning,byteLength:tensor.data.byteLength,modelSha256:tensor.modelSha256,...(tensor.attentionMask?{attentionMask:new Uint8Array(tensor.attentionMask)}:{}),...(profileId?{profileId}:{}),validated:true};
}

async function execute(op,input){
 if(['inspectLora','loadLora','readLora','readLoraSource'].includes(op)){
  const core=await import('../lora/weights.mjs');
  if(op==='inspectLora')return core.inspectLoraFile(input.file);
  if(op==='loadLora')return core.loadLoraFile(input.file,input);
  const result=op==='readLora'?await core.readLoraTensor(input.file,input.binding,input.range):await core.readLoraBytes(input.file,input.binding,input.range);
  return {...result,bindingId:input.bindingId};
 }
 if(op==='inspect'||op==='load'){
  const inspected=await inspectSafetensors(input.file);
  if(op==='load')fail('NOT_READY','Model inference has not been implemented or validated',{reasons:inspected.readiness.reasons,payloadBytes:inspected.payloadBytes});
  return inspected;
 }
 if(op==='predict'||op==='sample')fail('NOT_READY','No validated neural model session is available',{reasons:['MODEL_INFERENCE_NOT_IMPLEMENTED']});

 if(op==='validateConditioning'||op==='validateRawLatent'){
  const {requireWanConditioning,requireWanRawLatent,requireWanRawLatentF1,WAN21_RAW_PROFILE,WAN21_RAW_F1_PROFILE}=await import('../tensor-interop.mjs');
  try{
   if(op==='validateConditioning')return metadata(requireWanConditioning(input.tensor));
   const shape=input.tensor?.shape,f1=Array.isArray(shape)&&shape.length===5&&WAN21_RAW_F1_PROFILE.shape.every((v,i)=>v===shape[i]);
   return metadata((f1?requireWanRawLatentF1:requireWanRawLatent)(input.tensor),(f1?WAN21_RAW_F1_PROFILE:WAN21_RAW_PROFILE).id);
  }
  catch(error){fail('INVALID_TENSOR',String(error.message??error));}
 }
 if(op==='normalizeRawMean'||op==='restoreRawMean'){
  if(!latentSpace){
   const {createLatentSpace}=await import('../latent-space/latent-space.mjs');
   const {LATENT_SPACE_KERNEL}=await import('../latent-space/kernel-registry.mjs');
   const response=await fetch(LATENT_SPACE_KERNEL.url);
   if(!response.ok)fail('HIKE_UNAVAILABLE','Could not read the Hike latent-space kernel');
   latentSpace=await createLatentSpace(await response.arrayBuffer());latentKernelInfo=LATENT_SPACE_KERNEL;
  }
  let tensor;try{tensor=latentSpace[op](input.tensor);}catch(error){fail('INVALID_TENSOR',String(error.message??error));}
  return {tensor,normalizationApplied:true,evidence:{scope:'explicit Wan21 posterior-mean normalization only; no model inference',profileId:tensor.shape[2]===1?'wan21-raw-f32-1x16x16':'wan21-raw-f32-5x16x16',hikeWasmSHA256:latentKernelInfo.sha256,hike:latentSpace.stats()}};
 }
 if(op==='schedule'){
  const {PROFILE}=await import('../scheduler/scheduler-kernel.mjs');
  if(input.profile!==PROFILE)fail('UNSUPPORTED_PROFILE','Only the fixed source-verified schedule profile is available');
  const k=await getScheduler(),schedule=k.schedule();
  return {...schedule,modelTimesteps:k.timesteps(schedule.sigmas.subarray(0,6)),hikeWasmSHA256:BUILD_SOURCES['../scheduler/build/scheduler.wasm'],evidence:{scope:'fixed schedule only; no model inference',hike:k.stats()}};
 }
 if(['noiseMix','inverseNoiseScale','flowDenoised'].includes(op)){
  const names=op==='noiseMix'?['noise','latent']:op==='inverseNoiseScale'?['latent']:['input','velocity'];
  const shape=checkedShape(input,names);
  if(op==='noiseMix'&&(typeof input.noiseScale!=='number'||!Number.isFinite(input.noiseScale)||input.noiseScale<0))fail('INVALID_TENSOR','An explicit finite nonnegative noiseScale is required');
  const k=await getScheduler();
  const data=op==='noiseMix'?k.noiseMix(input.noise,input.latent,input.sigma,input.noiseScale):op==='inverseNoiseScale'?k.inverseNoiseScale(input.latent,input.sigma):k.flowDenoised(input.input,input.velocity,input.sigma);
  return {data,shape,operation:op,normalizationApplied:false,hikeWasmSHA256:BUILD_SOURCES['../scheduler/build/scheduler.wasm'],evidence:{scope:'numeric primitive on caller supplied arrays; no model inference',hike:k.stats()}};
 }
 if(op==='linearProjectionF32'){
  for(const [value,count] of [[input.weight,81920],[input.x,5120],[input.bias,16]])if(!(value instanceof Float32Array)||value.length!==count||!value.every(Number.isFinite))fail('INVALID_TENSOR','Expected finite exact-shape F32 weight, x, bias');
  if(!projectionStage){const {createOrtProjectionStage}=await import('../ort-bridge/stage.mjs');projectionStage=await createOrtProjectionStage();}
  return {...await projectionStage.runF32(input),modelInference:false,partialOnly:true};
 }
 if(op==='linearProjection'){
  if(!(input.q instanceof Uint8Array)||input.q.length!==81920||!(input.x instanceof Float32Array)||input.x.length!==5120||!input.x.every(Number.isFinite)||!(input.bias instanceof Float32Array)||input.bias.length!==16||!input.bias.every(Number.isFinite)||typeof input.scale!=='number'||!Number.isFinite(input.scale)||input.scale<=0)fail('INVALID_TENSOR','Expected Q Uint8Array81920, finite x Float32Array5120, bias Float32Array16 and positive scale');
  if(!projectionStage){const {createOrtProjectionStage}=await import('../ort-bridge/stage.mjs');projectionStage=await createOrtProjectionStage();}
  return {...await projectionStage.run(input),modelInference:false,partialOnly:true};
 }
 if(op!=='eulerStep')fail('UNSUPPORTED_OPERATION','Unsupported operation');
 const {latent,denoised,sigma,nextSigma}=input;
 if(!(latent instanceof Float32Array)||!(denoised instanceof Float32Array)||latent.length!==denoised.length)fail('INVALID_TENSOR','Expected equal-length Float32Array tensors');
 if(latent.length>MAX_TENSOR_ELEMENTS)fail('TENSOR_BUDGET_EXCEEDED','Euler tensor exceeds the API element budget',{maxTensorElements:MAX_TENSOR_ELEMENTS});
 if(!kernel){
  const response=await fetch(new URL('../kernel/euler.wasm',import.meta.url));
  if(!response.ok)fail('HIKE_UNAVAILABLE','Could not read the Hike kernel');
  kernel=await createEulerKernel(await response.arrayBuffer());
 }
 const result=new Float32Array(latent.length);
 // Fixed Hike workspace, reused across chunks and requests. No per-step grow.
 for(let offset=0;offset<latent.length;offset+=65536){
  const end=Math.min(offset+65536,latent.length);
  result.set(kernel.step(latent.subarray(offset,end),denoised.subarray(offset,end),sigma,nextSigma),offset);
 }
 // Empty tensors still validate sigma through the real Hike component.
 if(!latent.length)kernel.step(latent,denoised,sigma,nextSigma);
 return {latent:result,hikeWasmSHA256:EULER_WASM_SHA256,kernel:'EulerDenoised',memoryBytes:kernel.memoryBytes};
}
self.onmessage=async({data:q})=>{
 try{
  const result=await execute(q.op,q.input);
  const response={...q,buildId:BUILD_ID,input:undefined,status:'ok',result};
  const transfers=[...new Set([...Object.values(result),result.tensor?.data,result.tensor?.attentionMask].filter(v=>ArrayBuffer.isView(v)).map(v=>v.buffer))];
  self.postMessage(response,transfers);
 }catch(error){self.postMessage({...q,buildId:BUILD_ID,input:undefined,status:'error',error:{code:error.code??'COMPUTE_ERROR',message:String(error.message??error),...(error.details?{details:error.details}:{})}});}
};

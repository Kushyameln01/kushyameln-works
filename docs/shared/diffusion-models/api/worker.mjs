import {BUILD_ID} from './build-info.mjs';
const MAX_TENSOR_ELEMENTS=1048576;
import {inspectSafetensors} from './safetensors.mjs';
import {createEulerKernel} from '../euler-kernel.mjs';
import {EULER_WASM_SHA256} from '../kernel-registry.mjs';
let kernel;
function fail(code,message,details){const error=new Error(message);Object.assign(error,{code,details});throw error;}
async function execute(op,input){
 if(op==='inspect'||op==='load'){
  const inspected=await inspectSafetensors(input.file);
  if(op==='load')fail('NOT_READY','Model inference has not been implemented or validated',{reasons:inspected.readiness.reasons,payloadBytes:inspected.payloadBytes});
  return inspected;
 }
 if(op==='predict'||op==='sample')fail('NOT_READY','No validated neural model session is available',{reasons:['MODEL_INFERENCE_NOT_IMPLEMENTED']});
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
  if(result.latent instanceof Float32Array)self.postMessage(response,[result.latent.buffer]);else self.postMessage(response);
 }catch(error){self.postMessage({...q,buildId:BUILD_ID,input:undefined,status:'error',error:{code:error.code??'COMPUTE_ERROR',message:String(error.message??error),...(error.details?{details:error.details}:{})}});}
};

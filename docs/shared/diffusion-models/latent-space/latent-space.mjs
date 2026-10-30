import {requireTensor} from '../../inference/tensor.mjs';
import {requireWanRawLatent,requireWanRawLatentF1,WAN21_VAE_SHA256,WAN21_RAW_PROFILE,WAN21_RAW_F1_PROFILE} from '../tensor-interop.mjs';
import {LATENT_SPACE_KERNEL} from './kernel-registry.mjs';
export const NORMALIZED_MEAN='wan21-normalized-posterior-mean:v1';
export const NORMALIZATION='wan21-comfy-f32-v1';
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
function profileFor(tensor){
 const profile=[WAN21_RAW_PROFILE,WAN21_RAW_F1_PROFILE].find(p=>Array.isArray(tensor?.shape)&&p.shape.length===tensor.shape.length&&p.shape.every((v,i)=>v===tensor.shape[i]));
 if(!profile)throw RangeError('Unsupported Wan21 posterior-mean shape profile');
 if(tensor.profileId!==undefined&&tensor.profileId!==profile.id)throw TypeError('Posterior-mean profile identity mismatch');
 return profile;
}
function contextCopy(context){
 if(context===undefined)return {};
 const keys=['schemaVersion','contextId','inputId','inputSha256','slotId','sourceFrameIndices','sourceFrameTimesSeconds'];
 if(!context||typeof context!=='object'||Array.isArray(context)||Object.keys(context).some(k=>!keys.includes(k))||context.schemaVersion!==1)throw TypeError('Invalid mean context');
 for(const key of ['contextId','inputId','slotId'])if(typeof context[key]!=='string'||!context[key]||context[key].length>128||/[\u0000-\u001f\u007f]/.test(context[key]))throw TypeError('Invalid mean context identifier');
 if(!/^[0-9a-f]{64}$/.test(context.inputSha256)||!Array.isArray(context.sourceFrameIndices)||!context.sourceFrameIndices.length||Array.from(context.sourceFrameIndices).some(v=>!Number.isSafeInteger(v)||v<0))throw TypeError('Invalid mean source frame mapping');
 const result={schemaVersion:1,contextId:context.contextId,inputId:context.inputId,inputSha256:context.inputSha256,slotId:context.slotId,sourceFrameIndices:[...context.sourceFrameIndices]};
 if(context.sourceFrameTimesSeconds!==undefined){
  if(!Array.isArray(context.sourceFrameTimesSeconds)||context.sourceFrameTimesSeconds.length!==context.sourceFrameIndices.length||Array.from(context.sourceFrameTimesSeconds).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))throw TypeError('Invalid mean frame times');
  result.sourceFrameTimesSeconds=[...context.sourceFrameTimesSeconds];
 }
 return {context:result};
}
function requireNormalized(tensor){
 const profile=profileFor(tensor);
 requireTensor(tensor,{dtype:'float32',layout:'NCTHW',meaning:NORMALIZED_MEAN,shape:profile.shape});
 if(tensor.modelSha256!==WAN21_VAE_SHA256)throw TypeError('Normalized posterior mean must bind the Wan21 VAE model');
 if(tensor.normalization!==undefined&&tensor.normalization!==NORMALIZATION)throw TypeError('Unsupported posterior-mean normalization');
 if(tensor.attentionMask!==undefined)throw TypeError('Posterior mean cannot carry a text mask');
 if(tensor.latentContract!==undefined)throw TypeError('Generated-sample contract cannot label a posterior mean');
 if(tensor.byteLength!==undefined&&tensor.byteLength!==tensor.data.byteLength)throw RangeError('Tensor byteLength mismatch');
 return tensor;
}
export async function createLatentSpace(value){
 if(!(value instanceof Uint8Array)&&!(value instanceof ArrayBuffer))throw TypeError('Explicit Hike WASM bytes required');
 // Snapshot before digest awaits, including Node Buffer/subarray ownership.
 const bytes=new Uint8Array(value instanceof Uint8Array?value:new Uint8Array(value));
 if(await sha256(bytes)!==LATENT_SPACE_KERNEL.sha256)throw Error('Latent-space WASM hash mismatch');
 const module=await WebAssembly.compile(bytes);if(WebAssembly.Module.imports(module).length)throw Error('Unexpected latent-space WASM import');
 let instance=new WebAssembly.Instance(module,{}),memory=instance.exports.memory;
 if(!(memory instanceof WebAssembly.Memory)||['NormalizeRawMean','RestoreRawMean','NormalizeRawMeanF1','RestoreRawMeanF1'].some(name=>typeof instance.exports[name]!=='function'))throw Error('Invalid latent-space ABI');
 const inputPtr=memory.buffer.byteLength,outputPtr=inputPtr+512,arenaBytes=1024;memory.grow(Math.ceil(arenaBytes/65536));
 let disposed=false,calls=0,inputCopyBytes=0,outputCopyBytes=0;
 const active=()=>{if(disposed)throw Error('Latent-space kernel disposed');};
 function transform(tensor,operation,normalized){
  active();const profile=profileFor(tensor),f1=profile===WAN21_RAW_F1_PROFILE,count=f1?64:128,metadata=contextCopy(tensor.context);
  if(tensor.latentContract!==undefined)throw TypeError('Generated-sample contract cannot label a posterior mean');
  new Float32Array(memory.buffer,inputPtr,count).set(tensor.data);inputCopyBytes+=count*4;
  try{const rc=instance.exports[operation+(f1?'F1':'')](inputPtr,count,outputPtr,count);if(rc!==0)throw Error('Hike latent-space rejected input: '+rc);
   const data=new Float32Array(memory.buffer,outputPtr,count).slice();if(!data.every(Number.isFinite))throw Error('Nonfinite Hike latent-space result');calls++;outputCopyBytes+=count*4;
   return {dtype:'float32',shape:[...profile.shape],layout:'NCTHW',meaning:normalized?NORMALIZED_MEAN:'raw-posterior-mean',modelSha256:WAN21_VAE_SHA256,...metadata,...(normalized?{normalization:NORMALIZATION}:{}),data};
  }finally{new Uint8Array(memory.buffer).fill(0,inputPtr,inputPtr+arenaBytes);}
 }
 return {
  normalizeRawMean(tensor){active();const profile=profileFor(tensor);(profile===WAN21_RAW_F1_PROFILE?requireWanRawLatentF1:requireWanRawLatent)(tensor);if(tensor.normalization!==undefined)throw TypeError('Raw posterior mean cannot carry a normalization marker');return transform(tensor,'NormalizeRawMean',true);},
  restoreRawMean(tensor){active();return transform(requireNormalized(tensor),'RestoreRawMean',false);},
  stats(){active();return {calls,memoryBytes:memory.buffer.byteLength,arenaBytes,inputCopyBytes,outputCopyBytes,workspaceReused:true,wasmSha256:LATENT_SPACE_KERNEL.sha256,sourceSha256:LATENT_SPACE_KERNEL.sourceSha256,profiles:[WAN21_RAW_PROFILE.id,WAN21_RAW_F1_PROFILE.id],imports:0};},
  dispose(){disposed=true;instance=null;memory=null;}
 };
}

import {requireTensor} from '../../inference/tensor.mjs';
import {requireWanRawLatent,WAN21_VAE_SHA256,WAN21_RAW_PROFILE} from '../tensor-interop.mjs';
import {LATENT_SPACE_KERNEL} from './kernel-registry.mjs';
export const NORMALIZED_MEAN='wan21-normalized-posterior-mean:v1';
export const NORMALIZATION='wan21-comfy-f32-v1';
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
function requireNormalized(tensor){
 requireTensor(tensor,{dtype:'float32',layout:'NCTHW',meaning:NORMALIZED_MEAN,shape:WAN21_RAW_PROFILE.shape});
 if(tensor.modelSha256!==WAN21_VAE_SHA256)throw TypeError('Normalized posterior mean must bind the Wan21 VAE model');
 if(tensor.normalization!==undefined&&tensor.normalization!==NORMALIZATION)throw TypeError('Unsupported posterior-mean normalization');
 if(tensor.attentionMask!==undefined)throw TypeError('Posterior mean cannot carry a text mask');
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
 if(!(memory instanceof WebAssembly.Memory)||typeof instance.exports.NormalizeRawMean!=='function'||typeof instance.exports.RestoreRawMean!=='function')throw Error('Invalid latent-space ABI');
 const inputPtr=memory.buffer.byteLength,outputPtr=inputPtr+512,arenaBytes=1024;memory.grow(Math.ceil(arenaBytes/65536));
 let disposed=false,calls=0,inputCopyBytes=0,outputCopyBytes=0;
 const active=()=>{if(disposed)throw Error('Latent-space kernel disposed');};
 function transform(tensor,operation,normalized){
  active();new Float32Array(memory.buffer,inputPtr,128).set(tensor.data);inputCopyBytes+=512;
  try{const rc=instance.exports[operation](inputPtr,128,outputPtr,128);if(rc!==0)throw Error('Hike latent-space rejected input: '+rc);
   const data=new Float32Array(memory.buffer,outputPtr,128).slice();if(!data.every(Number.isFinite))throw Error('Nonfinite Hike latent-space result');calls++;outputCopyBytes+=512;
   return {dtype:'float32',shape:[...WAN21_RAW_PROFILE.shape],layout:'NCTHW',meaning:normalized?NORMALIZED_MEAN:'raw-posterior-mean',modelSha256:WAN21_VAE_SHA256,...(normalized?{normalization:NORMALIZATION}:{}),data};
  }finally{new Uint8Array(memory.buffer).fill(0,inputPtr,inputPtr+arenaBytes);}
 }
 return {
  normalizeRawMean(tensor){active();requireWanRawLatent(tensor);if(tensor.normalization!==undefined)throw TypeError('Raw posterior mean cannot carry a normalization marker');return transform(tensor,'NormalizeRawMean',true);},
  restoreRawMean(tensor){active();return transform(requireNormalized(tensor),'RestoreRawMean',false);},
  stats(){active();return {calls,memoryBytes:memory.buffer.byteLength,arenaBytes,inputCopyBytes,outputCopyBytes,workspaceReused:true,wasmSha256:LATENT_SPACE_KERNEL.sha256,sourceSha256:LATENT_SPACE_KERNEL.sourceSha256,imports:0};},
  dispose(){disposed=true;instance=null;memory=null;}
 };
}

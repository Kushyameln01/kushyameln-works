// Source-faithful fixed-profile Hike math. This module does not run a neural model.
export const PROFILE='bernini-comfy-simple6-shift5-v1';
export const CHUNK=4096,MAX_ELEMENTS=4194304;
export function createSchedulerKernel(module){
 if(!(module instanceof WebAssembly.Module)||WebAssembly.Module.imports(module).length)throw TypeError('Expected no-import scheduler WASM');
 let instance=new WebAssembly.Instance(module,{}),memory=instance.exports.memory;
 for(const name of ['FlowSchedule','ConstNoiseMix','ConstInverse','FlowDenoised','FlowTimesteps'])if(typeof instance.exports[name]!=='function')throw Error('Missing Hike '+name);
 if(!(memory instanceof WebAssembly.Memory))throw Error('Missing Hike memory');
 const start=memory.buffer.byteLength,a=start,b=a+CHUNK*4,out=b+CHUNK*4,arenaBytes=CHUNK*12;memory.grow(Math.ceil(arenaBytes/65536));
 let disposed=false,calls=0,inputCopyBytes=0,outputCopyBytes=0;
 const active=()=>{if(disposed)throw Error('Scheduler disposed');};
 const sigma=s=>{if(!Number.isFinite(s)||s<0||s>1)throw RangeError('Sigma must be finite in [0,1]');return Math.fround(s);};
 const tensor=x=>{active();if(!(x instanceof Float32Array)||x.buffer===memory.buffer||x.length<1||x.length>MAX_ELEMENTS||!x.every(Number.isFinite))throw TypeError('Caller-owned finite Float32Array required');};
 const clear=()=>new Uint8Array(memory.buffer).fill(0,start,start+arenaBytes);
 function pointwise(x,y,invoke){
  tensor(x);if(y){tensor(y);if(x.length!==y.length)throw RangeError('Matching tensor shapes required');}
  const result=new Float32Array(x.length);
  try{for(let i=0;i<x.length;i+=CHUNK){const n=Math.min(CHUNK,x.length-i);new Float32Array(memory.buffer,a,n).set(x.subarray(i,i+n));if(y)new Float32Array(memory.buffer,b,n).set(y.subarray(i,i+n));inputCopyBytes+=n*4*(y?2:1);
   const rc=invoke(n);if(rc!==0)throw Error('Hike scheduler rejected input: '+rc);calls++;
   const part=new Float32Array(memory.buffer,out,n);if(!part.every(Number.isFinite))throw Error('Nonfinite Hike result');result.set(part,i);outputCopyBytes+=n*4;
  }return result;}finally{clear();}
 }
 return {
  schedule(){active();try{const rc=instance.exports.FlowSchedule(a,CHUNK,b,CHUNK,out,CHUNK);if(rc!==0)throw Error('Hike schedule failed: '+rc);calls++;
   const sigmas=new Float32Array(memory.buffer,b,7).slice(),tableIndices=new Int32Array(memory.buffer,out,6).slice();outputCopyBytes+=52;
   return {profile:PROFILE,source:'ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4',shift:5,timesteps:1000,multiplier:1000,steps:6,splitStep:3,sigmas,tableIndices,highSigmas:sigmas.slice(0,4),lowSigmas:sigmas.slice(3)};
  }finally{clear();}},
  noiseMix(noise,latent,s,noiseScale=1){s=sigma(s);if(!Number.isFinite(noiseScale)||noiseScale<0||!Number.isFinite(Math.fround(noiseScale)))throw RangeError('Finite nonnegative noise scale required');return pointwise(noise,latent,n=>instance.exports.ConstNoiseMix(a,b,n,s,noiseScale,out,CHUNK));},
  inverseNoiseScale(latent,s){s=sigma(s);if(s===1)throw RangeError('Inverse noise scale is singular at sigma1');return pointwise(latent,null,n=>instance.exports.ConstInverse(a,n,s,out,CHUNK));},
  flowDenoised(input,velocity,s){s=sigma(s);return pointwise(input,velocity,n=>instance.exports.FlowDenoised(a,b,n,s,out,CHUNK));},
  timesteps(sigmas){return pointwise(sigmas,null,n=>instance.exports.FlowTimesteps(a,n,out,CHUNK));},
  stats(){active();return {memoryBytes:memory.buffer.byteLength,arenaBytes,chunkElements:CHUNK,calls,inputCopyBytes,outputCopyBytes,workspaceReused:true,imports:0};},
  dispose(){disposed=true;instance=null;memory=null;}
 };
}

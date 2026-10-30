import { EULER_WASM_SHA256 } from './kernel-registry.mjs';

// Internal standalone component API. This is NOT a guessed provider API.
export async function createEulerKernel(wasmBytes, {capacity=65536}={}) {
  if(!Number.isInteger(capacity) || capacity<1 || capacity>1048576) throw new RangeError('capacity');
  if(!(wasmBytes instanceof ArrayBuffer) && !(wasmBytes instanceof Uint8Array)) throw new TypeError('WASM bytes');
  const ownedBytes=wasmBytes instanceof ArrayBuffer ? new Uint8Array(wasmBytes).slice() : new Uint8Array(wasmBytes);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',ownedBytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==EULER_WASM_SHA256) throw new Error('WASM hash mismatch');
  const module=await WebAssembly.compile(ownedBytes);
  if(WebAssembly.Module.imports(module).length) throw new Error('unexpected WASM imports');
  let instance=await WebAssembly.instantiate(module,{});
  let memory=instance.exports.memory;
  let compute=instance.exports.EulerDenoised;
  // Reserve exclusively beyond the compiler's initial linear-memory arena.
  const base=memory.buffer.byteLength, bytes=capacity*4;
  memory.grow(Math.ceil(3*bytes/65536));
  const ptrs=[base,base+bytes,base+2*bytes];
  function live() { if(!instance) throw new Error('disposed'); }
  return {
    get memoryBytes(){return memory?.buffer.byteLength??0;},
    step(x,denoised,sigma,nextSigma) {
      live();
      if(!(x instanceof Float32Array) || !(denoised instanceof Float32Array)) throw new TypeError('expected Float32Array');
      if(x.length!==denoised.length || x.length>capacity) throw new RangeError('tensor length/capacity');
      if(typeof sigma!=='number'||typeof nextSigma!=='number') throw new TypeError('sigma must be a number');
      sigma=Math.fround(sigma); nextSigma=Math.fround(nextSigma);
      if(!Number.isFinite(sigma)||!Number.isFinite(nextSigma)||sigma<=0||nextSigma<0||nextSigma>sigma) throw new RangeError('sigma');
      for(const a of [x,denoised]) for(const v of a) if(!Number.isFinite(v)) throw new RangeError('nonfinite input');
      // Views are acquired after grow; no bump allocator/free bridge is used.
      new Float32Array(memory.buffer,ptrs[0],x.length).set(x);
      new Float32Array(memory.buffer,ptrs[1],x.length).set(denoised);
      const status=compute(...ptrs,x.length,capacity,sigma,nextSigma);
      if(status!==0) throw new Error('Hike Euler status '+status);
      const result=new Float32Array(memory.buffer,ptrs[2],x.length).slice();
      for(const value of result) if(!Number.isFinite(value)) throw new RangeError('nonfinite result');
      return result;
    },
    dispose(){compute=null;memory=null;instance=null;}
  };
}

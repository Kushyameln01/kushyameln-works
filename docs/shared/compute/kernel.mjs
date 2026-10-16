import {WASM_SHA256} from './protocol.mjs';

// The fixed digest identifies the reviewed Hike fdad7bb LLVM/Zig i32/f64 ABI.
// This adapter owns each instance; it does not change the shared FT loader.
export async function prepareKernelModule({signal,fetchImpl=fetch,onCompile=()=>{},onResponse=()=>{}}={}) {
  const response=await fetchImpl(new URL('../ft/kernel/ft-kernel.wasm',import.meta.url),{credentials:'omit',signal});
  onResponse(response.headers?.get('content-type')??null);
  if(!response.ok)throw Error(`WASM fetch failed: ${response.status}`);
  const bytes=await response.arrayBuffer();
  if(signal?.aborted)throw Error('WASM preparation aborted');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
  if(digest!==WASM_SHA256)throw Error('WASM digest does not match the reviewed kernel');
  if(signal?.aborted)throw Error('WASM preparation aborted');
  onCompile();
  const module=await WebAssembly.compile(bytes);
  if(signal?.aborted)throw Error('WASM preparation aborted');
  return module;
}

export function instantiateKernel(module) {
  if(!(module instanceof WebAssembly.Module))throw TypeError('Expected a compiled WASM module');
  if(WebAssembly.Module.imports(module).length)throw Error('Unexpected kernel imports');
  const expected=['FtAnchorComponent:function','FtCrc32Step:function','FtMagnitude:function','FtSignedMagnitude:function','FtValidate:function','memory:memory'];
  const actual=WebAssembly.Module.exports(module).map(value=>`${value.name}:${value.kind}`).sort();
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Unexpected kernel exports');
  const instance=new WebAssembly.Instance(module,{});
  const k=instance.exports;
  return Object.freeze({
    instanceId:crypto.randomUUID(),
    memory:k.memory,
    magnitude(mask,weights) {
      if(!Number.isInteger(mask)||mask<0||mask>2147483647)throw RangeError('Expected an i32 mask');
      if(!Array.isArray(weights)||weights.length<1||weights.length>5||Array.from(weights).some(value=>typeof value!=='number'||!Number.isFinite(value)))throw RangeError('Invalid weights');
      const padded=[...weights,...Array(5-weights.length).fill(0)];
      if(k.FtValidate(mask,weights.length,...padded)!==0)throw RangeError('Kernel rejected the input');
      const value=k.FtMagnitude(mask,weights.length,...padded);
      if(!Number.isFinite(value))throw RangeError('Kernel returned an invalid result');
      return value;
    }
  });
}

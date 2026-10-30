import {BRIDGE_WASM_SHA256} from './kernel/registry.mjs';

// Bounded numerical bridge. All dequant/scale/add arithmetic is Hike WASM.
export async function createProjectionBridge(wasmBytes,{expectedSha256=BRIDGE_WASM_SHA256}={}) {
  if(!(wasmBytes instanceof Uint8Array)&&!(wasmBytes instanceof ArrayBuffer))throw TypeError('Expected WASM bytes');
  if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256))throw TypeError('Expected SHA-256');
  const ownedBytes=wasmBytes instanceof ArrayBuffer?new Uint8Array(wasmBytes).slice():new Uint8Array(wasmBytes);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',ownedBytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==expectedSha256)throw Error('Projection bridge WASM hash mismatch');
  const module=await WebAssembly.compile(ownedBytes);
  if(WebAssembly.Module.imports(module).length)throw Error('Unexpected bridge WASM imports');
  let instance=await WebAssembly.instantiate(module,{}),memory=instance.exports.memory;
  if(!(memory instanceof WebAssembly.Memory)||typeof instance.exports.DequantScale!=='function'||typeof instance.exports.AddBias!=='function')throw Error('Projection bridge ABI missing');
  const MAX_CODES=81920,MAX_BIAS=16,start=memory.buffer.byteLength;
  const qPtr=start,aPtr=qPtr+MAX_CODES,bPtr=aPtr+MAX_CODES*4,outPtr=bPtr+MAX_BIAS*4;
  const arenaBytes=outPtr+MAX_BIAS*4-start;
  memory.grow(Math.ceil(arenaBytes/65536));
  let calls=0,inputCopyBytes=0,outputCopyBytes=0;
  const active=()=>{if(!instance)throw Error('Projection bridge disposed');};
  function floats(values,count) {
    if(!(values instanceof Float32Array)||values.length!==count||!values.every(Number.isFinite))throw TypeError('Expected finite Float32Array');
  }
  function invoke(resultPtr,count,call) {
    try {
      const status=call();
      if(status!==0)throw Error('Hike projection bridge rejected input: '+status);
      const result=new Float32Array(memory.buffer,resultPtr,count).slice();
      if(!result.every(Number.isFinite))throw Error('Nonfinite Hike projection bridge output');
      calls++;outputCopyBytes+=result.byteLength;
      return result;
    } finally {new Uint8Array(memory.buffer,start,arenaBytes).fill(0);}
  }
  return {
    dequant(q,scale) {
      active();
      if(!(q instanceof Uint8Array)||q.length<1||q.length>MAX_CODES)throw RangeError('Expected 1..81920 FP8 codes');
      if(typeof scale!=='number'||!Number.isFinite(scale)||scale<=0)throw TypeError('Expected positive finite scale');
      const scalar=Math.fround(scale);
      if(!Number.isFinite(scalar)||scalar<=0)throw RangeError('Scale is outside positive f32 range');
      new Uint8Array(memory.buffer,qPtr,q.length).set(q);inputCopyBytes+=q.byteLength;
      return invoke(aPtr,q.length,()=>instance.exports.DequantScale(qPtr,q.length,scalar,aPtr,MAX_CODES));
    },
    addBias(y,bias) {
      active();
      if(!(y instanceof Float32Array)||y.length<1||y.length>MAX_BIAS)throw RangeError('Expected 1..16 projection values');
      floats(y,y.length);floats(bias,y.length);
      new Float32Array(memory.buffer,aPtr,y.length).set(y);
      new Float32Array(memory.buffer,bPtr,bias.length).set(bias);inputCopyBytes+=y.byteLength+bias.byteLength;
      return invoke(outPtr,y.length,()=>instance.exports.AddBias(aPtr,bPtr,y.length,outPtr,MAX_BIAS));
    },
    stats(){return {wasmSha256:digest,memoryBytes:memory?.buffer.byteLength??0,arenaBytes,calls,inputCopyBytes,outputCopyBytes,workspaceReused:true,disposed:!instance};},
    dispose(){instance=null;memory=null;}
  };
}

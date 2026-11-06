import {SELF_ATTENTION_TAIL_MATH_SHA256} from './registry.mjs';
const sha=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',x)),v=>v.toString(16).padStart(2,'0')).join('');
let nextMemoryIdentity=0;
const typedArrayPrototype=Object.getPrototypeOf(Float32Array.prototype),typedSlots=Object.fromEntries(['length','byteOffset','byteLength','buffer'].map(name=>[name,Object.getOwnPropertyDescriptor(typedArrayPrototype,name).get])),typedTag=Object.getOwnPropertyDescriptor(typedArrayPrototype,Symbol.toStringTag).get,bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
function compactF32(value,length){
 if(!ArrayBuffer.isView(value)||typedTag.call(value)!=='Float32Array')return false;
 const buffer=typedSlots.buffer.call(value);
 return buffer instanceof ArrayBuffer&&typedSlots.length.call(value)===length&&typedSlots.byteOffset.call(value)===0&&typedSlots.byteLength.call(value)===bufferLength.call(buffer);
}
function finite(value,length,max=Infinity){
 if(!compactF32(value,length))throw TypeError('Exact shape compact nonshared F32 required');
 // TypedArray construction copies internal elements without virtual slice,
 // iterators, length/buffer getters, or a caller species constructor.
 const owned=new Float32Array(value);
 if(!owned.every(Number.isFinite))throw TypeError('Compact finite F32 required');
 if(!owned.every(v=>Math.abs(v)<=max))throw RangeError('Tail numeric admission exceeded');
 return owned;
}
export async function createSelfAttentionTailMath({wasmBytes}={}){
 if(wasmBytes===undefined){const response=await fetch(new URL('./kernel.wasm',import.meta.url));if(!response.ok)throw Error('Tail math unavailable');wasmBytes=await response.arrayBuffer();}
 const owned=wasmBytes instanceof ArrayBuffer?new Uint8Array(wasmBytes).slice():wasmBytes instanceof Uint8Array&&wasmBytes.buffer instanceof ArrayBuffer?new Uint8Array(wasmBytes):null;
 if(!owned)throw TypeError('Nonshared tail math bytes required');
 if(await sha(owned)!==SELF_ATTENTION_TAIL_MATH_SHA256)throw Error('Tail math hash mismatch');
 const module=await WebAssembly.compile(owned);
 if(WebAssembly.Module.imports(module).length)throw Error('Tail math imports mismatch');
 let instance=await WebAssembly.instantiate(module,{}),memory=instance.exports.memory;
 if(!(memory instanceof WebAssembly.Memory)||typeof instance.exports.GateResidual!=='function')throw Error('Tail math ABI mismatch');
 const start=memory.buffer.byteLength,o=start,projection=o+40960,modulation=projection+20480,patch=modulation+20480,gate=patch+40960,gated=gate+20480,residual=gated+40960,arenaBytes=225280;
 memory.grow(Math.ceil(arenaBytes/65536));
 const memoryIdentity='self-attention-tail-math-'+(++nextMemoryIdentity);
 let busy=false,calls=0,snapshotCopyBytes=0,inputCopyBytes=0,outputCopyBytes=0;
 const lock=()=>{if(!instance)throw Error('Tail math disposed');if(busy)throw Error('Tail math busy');busy=true;};
 const put=(pointer,value)=>{new Float32Array(memory.buffer,pointer,value.length).set(value);inputCopyBytes+=value.byteLength;};
 const take=(pointer,length)=>{const out=new Float32Array(memory.buffer,pointer,length).slice();if(!out.every(Number.isFinite))throw Error('Nonfinite tail math output');outputCopyBytes+=out.byteLength;return out;};
 return Object.freeze({
  run(input={}){
   lock();
   try{
    if(Object.keys(input).some(k=>!['o','gateProjection','modulation','patchHidden','rows'].includes(k)))throw TypeError('Unknown tail math input');
    const {o:ov,gateProjection:pv,modulation:mv,patchHidden:xv,rows}=input;
    if(rows!==2)throw RangeError('Exact N2 tail math shape required');
    const os=finite(ov,10240,1e16),ps=finite(pv,5120),ms=finite(mv,5120),xs=finite(xv,10240,1e16);
    snapshotCopyBytes+=os.byteLength+ps.byteLength+ms.byteLength+xs.byteLength;
    put(o,os);put(projection,ps);put(modulation,ms);put(patch,xs);
    const status=instance.exports.GateResidual(o,projection,modulation,patch,rows,gate,gated,residual,10240);
    if(status!==0)throw RangeError('Hike tail math rejected numeric admission: '+status);
    const result={gate:take(gate,5120),gated:take(gated,10240),residual:take(residual,10240)};
    calls++;return result;
   }finally{new Uint8Array(memory.buffer,start,arenaBytes).fill(0);busy=false;}
  },
  stats(){return {wasmSHA256:SELF_ATTENTION_TAIL_MATH_SHA256,busy,disposed:!instance,memoryBytes:memory?.buffer.byteLength??0,memoryIdentity,arenaBytes,calls,snapshotCopyBytes,inputCopyBytes,outputCopyBytes,workspaceReused:true,arithmetic:'F32 separate add, multiply, add; original patchHidden residual basis'};},
  dispose(){if(busy)throw Error('Tail math busy');instance=null;memory=null;}
 });
}

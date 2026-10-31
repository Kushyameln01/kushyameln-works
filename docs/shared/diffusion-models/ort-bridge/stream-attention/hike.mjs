import {STREAM_WASM_SHA256} from './registry.mjs';
const digest=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
function finite(a,n){if(!(a instanceof Float32Array)||a.length!==n||!(a.buffer instanceof ArrayBuffer)||a.byteOffset!==0||a.byteLength!==a.buffer.byteLength||!a.every(Number.isFinite))throw TypeError('Compact nonshared finite Float32Array required');}
export async function createStreamAccumulator(bytes){
 const owned=bytes instanceof Uint8Array?new Uint8Array(bytes):bytes instanceof ArrayBuffer?new Uint8Array(bytes).slice():null;if(!owned)throw TypeError('WASM bytes required');
 if(await digest(owned)!==STREAM_WASM_SHA256)throw Error('Stream Hike hash mismatch');
 const module=await WebAssembly.compile(owned);if(WebAssembly.Module.imports(module).length)throw Error('Unexpected stream Hike imports');
 let instance=await WebAssembly.instantiate(module,{}),memory=instance.exports.memory;if(!(memory instanceof WebAssembly.Memory)||typeof instance.exports.Accumulate!=='function'||typeof instance.exports.Normalize!=='function')throw Error('Stream accumulator ABI mismatch');
 const start=memory.buffer.byteLength,w=start,v=w+4096,a=v+32768,n=a+64,l=n+8192,o=l+64,end=o+8192,arenaBytes=end-start;
 memory.grow(Math.ceil(arenaBytes/65536));let rows=16,invalid=false,calls=0,inputCopyBytes=0,outputCopyBytes=0;
 const live=()=>{if(!instance)throw Error('Stream accumulator disposed');};
 function clearInputs(){new Uint8Array(memory.buffer,w,n-w).fill(0);}
 return Object.freeze({
  reset(count=16){live();if(!Number.isInteger(count)||count<1||count>16)throw RangeError('Q rows1..16');rows=count;invalid=false;new Uint8Array(memory.buffer,start,arenaBytes).fill(0);},
  update({weights,values,alpha,keys}){live();if(invalid)throw Error('Reset invalid stream accumulator first');if(!Number.isInteger(keys)||keys<1||keys>64)throw RangeError('Logical key count1..64');finite(weights,rows*keys);finite(values,keys*128);finite(alpha,rows);
   new Float32Array(memory.buffer,w,weights.length).set(weights);new Float32Array(memory.buffer,v,values.length).set(values);new Float32Array(memory.buffer,a,rows).set(alpha);inputCopyBytes+=weights.byteLength+values.byteLength+alpha.byteLength;
   try{const status=instance.exports.Accumulate(w,v,a,rows,keys,n,l);if(status!==0){invalid=true;throw Error('Hike recurrence rejected input: '+status);}calls++;}finally{clearInputs();}
  },
  finish(){live();if(invalid)throw Error('Reset invalid stream accumulator first');const status=instance.exports.Normalize(n,l,rows,o);if(status!==0)throw Error('Hike normalization rejected state: '+status);calls++;const result=new Float32Array(memory.buffer,o,rows*128).slice();outputCopyBytes+=result.byteLength;return result;},
  denominators(){live();return new Float32Array(memory.buffer,l,rows).slice();},
  stats(){return {wasmSha256:STREAM_WASM_SHA256,memoryBytes:memory?.buffer.byteLength??0,arenaBytes,calls,inputCopyBytes,outputCopyBytes,rows,workspaceReused:true,invalid,disposed:!instance};},
  dispose(){instance=null;memory=null;invalid=true;}
 });
}

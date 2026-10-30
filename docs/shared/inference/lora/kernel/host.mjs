import { KERNEL } from './registry.mjs';
const MAX_BYTES=32*1024*1024, START=1024*1024;
function finite(a){if(!(a instanceof Float32Array))throw new TypeError('Float32Array required');for(const v of a)if(!Number.isFinite(v))throw new RangeError('finite values required');}
function integer(n){if(!Number.isInteger(n)||n<1||n>0x7fffffff)throw new RangeError('invalid shape');}
function scaleValue(n){if(!Number.isFinite(n)||!Number.isFinite(Math.fround(n)))throw new RangeError('finite scale required');return Math.fround(n);}
export async function createKernel({wasmBytes}={}){
 if(wasmBytes===undefined){const response=await fetch(new URL('./lora.wasm',import.meta.url));if(!response.ok)throw new Error('Hike WASM unavailable: '+response.status);wasmBytes=await response.arrayBuffer();}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',wasmBytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==KERNEL.wasmSha256)throw new Error('Hike WASM hash mismatch');
 let instance=(await WebAssembly.instantiate(wasmBytes,{})).instance;
 let e=instance.exports;
 if(!(e.memory instanceof WebAssembly.Memory)||['LoraMerge','LoraAdd','LoraCopy','LoraDecode'].some(n=>typeof e[n]!=='function'))throw new Error('Hike ABI mismatch');
 const current=e.memory.buffer.byteLength;if(current>MAX_BYTES)throw new Error('memory budget exceeded');
 e.memory.grow((MAX_BYTES-current)/65536);
 let alive=true;
 const info=Object.freeze({...KERNEL,memoryBytes:e.memory.buffer.byteLength,maxWorkspaceBytes:MAX_BYTES-START});
 function check(){if(!alive)throw new Error('kernel disposed');}
 function arena(lengths){check();let at=START;const positions=[];for(const n of lengths){if(!Number.isSafeInteger(n)||n<0||n>(MAX_BYTES-at)/4)throw new RangeError('kernel memory budget exceeded');positions.push(at);at+=n*4;}return positions;}
 function write(ptr,a){new Float32Array(e.memory.buffer,ptr,a.length).set(a);}
 function result(ptr,n,status){if(status!==0)throw new RangeError('Hike rejected non-finite data or ABI');const a=new Float32Array(e.memory.buffer,ptr,n).slice();finite(a);return a;}
 return {
  info,
  merge({base,down,up,rows,cols,rank,scale}){check();[rows,cols,rank].forEach(integer);[base,down,up].forEach(finite);if(base.length!==rows*cols||down.length!==rank*cols||up.length!==rows*rank)throw new RangeError('tensor shape mismatch');scale=scaleValue(scale);const [b,d,u,o]=arena([base.length,down.length,up.length,base.length]);write(b,base);write(d,down);write(u,up);return result(o,base.length,e.LoraMerge(b,d,u,o,rows,cols,rank,scale));},
  add({base,delta,scale}){check();finite(base);finite(delta);if(base.length!==delta.length)throw new RangeError('tensor shape mismatch');scale=scaleValue(scale);const [b,d,o]=arena([base.length,delta.length,base.length]);write(b,base);write(d,delta);return result(o,base.length,e.LoraAdd(b,d,o,base.length,scale));},
  decode(bytes,dtype){check();if(!(bytes instanceof Uint8Array))throw new TypeError('Uint8Array required');if(!['BF16','F16','F32'].includes(dtype))throw new RangeError('unsupported dtype');const width=dtype==='F32'?4:2;if(bytes.length%width)throw new RangeError('invalid byte length');const n=bytes.length/width,[p,o]=arena([n,n]);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(dtype==='F32'){const a=new Float32Array(e.memory.buffer,p,n);for(let i=0;i<n;i++)a[i]=view.getFloat32(i*4,true);return result(o,n,e.LoraCopy(p,o,n));}const a=new Int32Array(e.memory.buffer,p,n);for(let i=0;i<n;i++)a[i]=view.getUint16(i*2,true);return result(o,n,e.LoraDecode(p,o,n,dtype==='BF16'?1:2));},
  dispose(){alive=false;instance=null;e=null;}
 };
}

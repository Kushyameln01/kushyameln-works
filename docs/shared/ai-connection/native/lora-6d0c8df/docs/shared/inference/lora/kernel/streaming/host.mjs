import {KERNEL} from './registry.mjs';

const MAX_BYTES=32*1024*1024,START=1024*1024;
function array(a){if(!(a instanceof Float32Array))throw TypeError('Float32Array required');}
function finite(a){array(a);for(let i=0;i<a.length;i++)if(!Number.isFinite(a[i]))throw RangeError('finite values required');}
function integer(n){if(!Number.isInteger(n)||n<1||n>0x7fffffff)throw RangeError('invalid shape');}
function scaleValue(n){if(!Number.isFinite(n)||!Number.isFinite(Math.fround(n)))throw RangeError('finite scale required');return Math.fround(n);}

/** Bounded Hike arithmetic for an owned, lazily evaluated LoRA package. */
export async function createStreamingKernel({wasmBytes}={}){
 if(wasmBytes===undefined){const r=await fetch(new URL('./lora.wasm',import.meta.url));if(!r.ok)throw Error('Hike streaming WASM unavailable: '+r.status);wasmBytes=await r.arrayBuffer();}
 // Hash and instantiate the same owned snapshot, even if the caller changes
 // its BufferSource while the asynchronous digest or instantiation is pending.
 if(wasmBytes instanceof ArrayBuffer)wasmBytes=new Uint8Array(wasmBytes).slice();
 else if(ArrayBuffer.isView(wasmBytes))wasmBytes=new Uint8Array(wasmBytes.buffer,wasmBytes.byteOffset,wasmBytes.byteLength).slice();
 else throw TypeError('WASM ArrayBuffer or byte view required');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',wasmBytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==KERNEL.wasmSha256)throw Error('Hike streaming WASM hash mismatch');
 let instance=(await WebAssembly.instantiate(wasmBytes,{})).instance,e=instance.exports;
 if(!(e.memory instanceof WebAssembly.Memory)||['LoraProduct4','LoraProduct8','LoraAdd','LoraCopy','LoraDecode','LoraFinite'].some(n=>typeof e[n]!=='function'))throw Error('Hike streaming ABI mismatch');
 const current=e.memory.buffer.byteLength;if(current>MAX_BYTES)throw Error('kernel memory budget exceeded');e.memory.grow((MAX_BYTES-current)/65536);
 let alive=true,closing=false,resident=null;const leases=new Set(),handles=new WeakMap(),counters={productCalls:0,applyCalls:0,decodeCalls:0,downUploads:0,workspaceHighWaterBytes:0};
 const info=Object.freeze({...KERNEL,memoryBytes:MAX_BYTES,maxWorkspaceBytes:MAX_BYTES-START});
 function check(){if(!alive)throw Error('kernel disposed');}
 function arena(lengths,{from=START+(resident?.bytes??0)}={}){check();let at=from;const positions=[];for(const n of lengths){if(!Number.isSafeInteger(n)||n<0||n>(MAX_BYTES-at)/4)throw RangeError('kernel memory budget exceeded');positions.push(at);at+=n*4;}counters.workspaceHighWaterBytes=Math.max(counters.workspaceHighWaterBytes,at-START);return positions;}
 function write(ptr,a){new Float32Array(e.memory.buffer,ptr,a.length).set(a);}
 function finiteArena(ptr,n){if(e.LoraFinite(ptr,n)!==0)throw RangeError('finite values required');}
 function result(ptr,n,status){if(status!==0)throw RangeError('Hike rejected non-finite data or ABI');finiteArena(ptr,n);return new Float32Array(e.memory.buffer,ptr,n).slice();}
 function retained(h,cols,rank){const s=handles.get(h);if(!s||s!==resident||s.cols!==cols||s.rank!==rank)throw RangeError('Invalid, stale or foreign down factor handle');return s;}
 function apply({base,delta,scale}){check();array(base);array(delta);if(base.length!==delta.length)throw RangeError('tensor shape mismatch');scale=scaleValue(scale);const [b,d,o]=arena([base.length,delta.length,base.length]);write(b,base);write(d,delta);finiteArena(b,base.length+delta.length);const a=result(o,base.length,e.LoraAdd(b,d,o,base.length,scale));counters.applyCalls++;return a;}
 const core={
  info,
  retainDown({down,cols,rank}){check();[cols,rank].forEach(integer);finite(down);if(down.length!==cols*rank)throw RangeError('tensor shape mismatch');if(resident)throw Error('Release resident down factor handle first');arena([down.length],{from:START});write(START,down);const handle=Object.freeze({}),s={ptr:START,bytes:down.byteLength,cols,rank};resident=s;handles.set(handle,s);counters.downUploads++;return handle;},
  releaseDown(handle){check();const s=handles.get(handle);if(!s||s!==resident)throw RangeError('Invalid, stale or foreign down factor handle');new Uint8Array(e.memory.buffer,s.ptr,s.bytes).fill(0);resident=null;handles.delete(handle);},
  product({down,downHandle,up,rows,cols,rank}){
   check();[rows,cols,rank].forEach(integer);finite(up);if(up.length!==rows*rank)throw RangeError('tensor shape mismatch');let d,u,o;
   if(downHandle!==undefined){if(down!==undefined)throw RangeError('Specify down or downHandle');d=retained(downHandle,cols,rank).ptr;[u,o]=arena([up.length,rows*cols]);}
   else{finite(down);if(down.length!==rank*cols)throw RangeError('tensor shape mismatch');[d,u,o]=arena([down.length,up.length,rows*cols]);write(d,down);counters.downUploads++;}
   write(u,up);const a=result(o,rows*cols,e[KERNEL.productExport](d,u,o,rows,cols,rank));counters.productCalls++;return a;
  },
  apply,add:apply,
  decode(bytes,dtype){check();if(!(bytes instanceof Uint8Array))throw TypeError('Uint8Array required');if(!['BF16','F16','F32'].includes(dtype))throw RangeError('unsupported dtype');const width=dtype==='F32'?4:2;if(bytes.length%width)throw RangeError('invalid byte length');const n=bytes.length/width,[p,o]=arena([n,n]),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let status;if(dtype==='F32'){const a=new Float32Array(e.memory.buffer,p,n);for(let i=0;i<n;i++)a[i]=view.getFloat32(i*4,true);status=e.LoraCopy(p,o,n);}else{const a=new Int32Array(e.memory.buffer,p,n);for(let i=0;i<n;i++)a[i]=view.getUint16(i*2,true);status=e.LoraDecode(p,o,n,dtype==='BF16'?1:2);}const a=result(o,n,status);counters.decodeCalls++;return a;},
  stats(){return Object.freeze({...counters,residentDownBytes:resident?.bytes??0,memoryBytes:alive?MAX_BYTES:0,closing,disposed:!alive,leaseCount:leases.size});}
 };
 function destroy(){if(!alive)return;alive=false;resident=null;instance=null;e=null;}
 function authorized(token){if(token?.released)throw Error('kernel lease released');check();if(!token&&closing)throw Error('kernel closing/disposed');}
 function capability(token){return Object.fromEntries(Object.entries(core).map(([name,value])=>[name,typeof value!=='function'||name==='stats'?value:(...args)=>{authorized(token);return value(...args);} ]));}
 function retain(ownerId){authorized(null);if(typeof ownerId!=='string'||!ownerId.trim())throw TypeError('Kernel lease ownerId required');const token={ownerId,released:false};leases.add(token);const release=()=>{if(token.released)return;token.released=true;leases.delete(token);if(closing&&leases.size===0)destroy();};const kernel=Object.freeze({...capability(token),dispose:release});return Object.freeze({kernel,isValid:()=>alive&&!token.released,release});}
 return Object.freeze({...capability(null),retain,dispose(){if(closing)return;closing=true;if(leases.size===0)destroy();}});
}

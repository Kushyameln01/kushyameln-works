import {QKV_ROPE_WASM_SHA256} from '../qkv/registry.mjs';
const digest=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
function finite(a,n){if(!(a instanceof Float32Array)||a.length!==n||!(a.buffer instanceof ArrayBuffer)||a.byteOffset!==0||a.byteLength!==a.buffer.byteLength||!a.every(Number.isFinite))throw TypeError('Compact nonshared finite exact-shape F32 tensor required');return new Float32Array(a);}
function ids(a){if(!(a instanceof Int32Array)||a.length!==2||!(a.buffer instanceof ArrayBuffer)||a.byteOffset!==0||a.byteLength!==a.buffer.byteLength||!a.every(v=>v>=0&&v<=16777216))throw TypeError('Compact Int32 sourceIds2 in0..16777216 required');return new Int32Array(a);}
export async function createTwoQueryRope({wasmBytes}={}){
 if(wasmBytes===undefined){const r=await fetch(new URL('../qkv/kernel.wasm',import.meta.url));if(!r.ok)throw Error('QKV RoPE Hike unavailable');wasmBytes=await r.arrayBuffer();}
 const owned=wasmBytes instanceof Uint8Array?new Uint8Array(wasmBytes):wasmBytes instanceof ArrayBuffer?new Uint8Array(wasmBytes).slice():null;if(!owned)throw TypeError('Owned nonshared Hike bytes required');
 if(await digest(owned)!==QKV_ROPE_WASM_SHA256)throw Error('QKV RoPE Hike hash mismatch');
 const module=await WebAssembly.compile(owned),imports=WebAssembly.Module.imports(module),names=imports.map(x=>x.module+':'+x.name+':'+x.kind).sort();
 if(JSON.stringify(names)!==JSON.stringify(['env:cos:function','env:pow:function','env:sin:function']))throw Error('Unexpected QKV RoPE Hike imports');
 const primitiveCalls={cos:0,sin:0,pow:0};let instance=await WebAssembly.instantiate(module,{env:{cos:x=>{primitiveCalls.cos++;return Math.cos(x);},sin:x=>{primitiveCalls.sin++;return Math.sin(x);},pow:(x,y)=>{primitiveCalls.pow++;return Math.pow(x,y);}}}),memory=instance.exports.memory;
 if(!(memory instanceof WebAssembly.Memory)||typeof instance.exports.Build!=='function'||typeof instance.exports.Apply!=='function')throw Error('QKV RoPE Hike ABI mismatch');
 const start=memory.buffer.byteLength,p=start,s=p+24,m=s+8,v=m+2048,o=v+1024,end=o+1024,arenaBytes=end-start;
 memory.grow(Math.ceil(arenaBytes/65536));let busy=false,calls=0,inputCopyBytes=0,outputCopyBytes=0,snapshotCopyBytes=0;
 const live=()=>{if(!instance)throw Error('QKV RoPE disposed');};
 const lock=()=>{live();if(busy)throw Error('QKV RoPE busy');busy=true;};
 const clear=()=>{new Uint8Array(memory.buffer,start,arenaBytes).fill(0);busy=false;};
 return Object.freeze({
  matrix(input={}){lock();try{const {positions,sourceIds}=input,ownedPositions=finite(positions,6),ownedIds=ids(sourceIds);snapshotCopyBytes+=32;new Float32Array(memory.buffer,p,6).set(ownedPositions);const idView=new DataView(memory.buffer,s,8);for(let i=0;i<2;i++)idView.setInt32(i*4,ownedIds[i],true);inputCopyBytes+=32;const status=instance.exports.Build(p,s,2,m,512);if(status!==0)throw Error('Hike RoPE matrix rejected input: '+status);const result=new Float32Array(memory.buffer,m,512).slice();if(!result.every(Number.isFinite))throw Error('Nonfinite Hike RoPE matrix');calls++;outputCopyBytes+=result.byteLength;return result;}finally{clear();}},
  apply(input={}){lock();try{const {values,matrices}=input,ownedValues=finite(values,256),ownedMatrices=finite(matrices,512);snapshotCopyBytes+=3072;new Float32Array(memory.buffer,v,256).set(ownedValues);new Float32Array(memory.buffer,m,512).set(ownedMatrices);inputCopyBytes+=3072;const status=instance.exports.Apply(v,m,2,o,256);if(status!==0)throw Error('Hike RoPE apply rejected input: '+status);const result=new Float32Array(memory.buffer,o,256).slice();if(!result.every(Number.isFinite))throw Error('Nonfinite Hike RoPE output');calls++;outputCopyBytes+=result.byteLength;return result;}finally{clear();}},
  stats(){return {wasmSha256:QKV_ROPE_WASM_SHA256,memoryBytes:memory?.buffer.byteLength??0,arenaBytes,calls,inputCopyBytes,outputCopyBytes,snapshotCopyBytes,primitiveCalls:{...primitiveCalls},workspaceReused:true,busy,disposed:!instance};},
  dispose(){if(!instance)return;if(busy)throw Error('QKV RoPE busy');instance=null;memory=null;}
 });
}

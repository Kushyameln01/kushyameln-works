import {BLOCK_HIDDEN_MATH_SHA256} from './registry.mjs';
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
function finite(x,n,max=Infinity){if(!(x instanceof Float32Array)||x.length!==n||!(x.buffer instanceof ArrayBuffer)||x.byteOffset!==0||x.byteLength!==x.buffer.byteLength||!x.every(Number.isFinite))throw TypeError('Compact finite F32 exact shape required');if(!x.every(v=>Math.abs(v)<=max))throw RangeError('LayerNorm numeric admission exceeded');return x.slice();}
export async function createBlockHiddenMath({wasmBytes}={}){
 if(wasmBytes===undefined){const r=await fetch(new URL('./kernel.wasm',import.meta.url));if(!r.ok)throw Error('Prefix math unavailable');wasmBytes=await r.arrayBuffer();}
 const owned=wasmBytes instanceof ArrayBuffer?new Uint8Array(wasmBytes).slice():wasmBytes instanceof Uint8Array&&wasmBytes.buffer instanceof ArrayBuffer?new Uint8Array(wasmBytes):null;if(!owned)throw TypeError('Nonshared math bytes required');
 if(await sha(owned)!==BLOCK_HIDDEN_MATH_SHA256)throw Error('Prefix math hash mismatch');const module=await WebAssembly.compile(owned);
 if(JSON.stringify(WebAssembly.Module.imports(module).map(i=>i.module+':'+i.name+':'+i.kind).sort())!==JSON.stringify(['env:cos:function','env:pow:function','env:sin:function','env:sqrt:function']))throw Error('Prefix math imports mismatch');
 const primitiveCalls={cos:0,sin:0,pow:0,sqrt:0},env={};for(const name of Object.keys(primitiveCalls))env[name]=(...args)=>{primitiveCalls[name]++;return Math[name](...args);};
 let instance=await WebAssembly.instantiate(module,{env}),memory=instance.exports.memory;
 if(!(memory instanceof WebAssembly.Memory)||['Sinusoidal','LayerNorm','Add','Modulate'].some(n=>typeof instance.exports[n]!=='function'))throw Error('Prefix math ABI mismatch');
 const start=memory.buffer.byteLength,a=start,b=a+40960,c=b+40960,o=c+20480,arenaBytes=143360;memory.grow(Math.ceil(arenaBytes/65536));let busy=false,calls=0,inputCopyBytes=0,outputCopyBytes=0,snapshotCopyBytes=0;
 const lock=()=>{if(!instance)throw Error('Prefix math disposed');if(busy)throw Error('Prefix math busy');busy=true;},clear=()=>{new Uint8Array(memory.buffer,start,arenaBytes).fill(0);busy=false;};
 const put=(p,x)=>{new Float32Array(memory.buffer,p,x.length).set(x);inputCopyBytes+=x.byteLength;},out=n=>{const r=new Float32Array(memory.buffer,o,n).slice();if(!r.every(Number.isFinite))throw Error('Nonfinite prefix math output');outputCopyBytes+=r.byteLength;calls++;return r;},status=s=>{if(s!==0)throw Error('Hike prefix math rejected: '+s);};
 return Object.freeze({
  sinusoidal(t){lock();try{if(!Number.isFinite(t)||Math.fround(t)!==t||t<0||t>1000)throw TypeError('Finite F32 timestep0..1000 required');status(instance.exports.Sinusoidal(t,o,256));return out(256);}finally{clear();}},
  layerNorm(x,rows){lock();try{if(rows!==2)throw RangeError('Exact N2 LayerNorm shape');const v=finite(x,10240,1e16);snapshotCopyBytes+=v.byteLength;put(a,v);status(instance.exports.LayerNorm(a,rows,o,10240));return out(10240);}finally{clear();}},
  add(x,y){lock();try{if(!(x instanceof Float32Array)||x.length<1||x.length>10240)throw RangeError('Bounded F32 add shape');const av=finite(x,x.length),bv=finite(y,x.length);snapshotCopyBytes+=av.byteLength+bv.byteLength;put(a,av);put(b,bv);status(instance.exports.Add(a,b,x.length,o,x.length));return out(x.length);}finally{clear();}},
  modulate(x,shift,scale,rows){lock();try{if(rows!==2)throw RangeError('Exact N2 modulation shape');const av=finite(x,10240),bv=finite(shift,5120),cv=finite(scale,5120);snapshotCopyBytes+=av.byteLength+bv.byteLength+cv.byteLength;put(a,av);put(b,bv);put(c,cv);status(instance.exports.Modulate(a,b,c,rows,o,10240));return out(10240);}finally{clear();}},
  stats(){return {wasmSHA256:BLOCK_HIDDEN_MATH_SHA256,busy,disposed:!instance,memoryBytes:memory?.buffer.byteLength??0,arenaBytes,calls,inputCopyBytes,outputCopyBytes,snapshotCopyBytes,primitiveCalls:{...primitiveCalls},workspaceReused:true};},dispose(){if(busy)throw Error('Prefix math busy');instance=null;memory=null;}
 });
}

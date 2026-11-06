import {POST_SELF_ATTENTION_MATH_SHA256} from './registry.mjs';
const sha=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',x)),v=>v.toString(16).padStart(2,'0')).join('');
const slots=Object.fromEntries(['length','byteOffset','byteLength','buffer'].map(k=>[k,Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Float32Array.prototype),k).get]));
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
let memorySerial=0;
function finite(x,n,max=Infinity){
 if(!ArrayBuffer.isView(x)||Object.getPrototypeOf(x)!==Float32Array.prototype)throw TypeError('Compact nonshared exact-shape Float32Array without subclass required');
 const b=slots.buffer.call(x);
 if(!(b instanceof ArrayBuffer)||slots.length.call(x)!==n||slots.byteOffset.call(x)!==0||slots.byteLength.call(x)!==bufferLength.call(b))throw TypeError('Compact nonshared exact-shape F32 required');
 const result=new Float32Array(x);
 if(!result.every(Number.isFinite))throw TypeError('Compact finite F32 required');
 if(!result.every(v=>Math.abs(v)<=max))throw RangeError('Post-self-attention numeric admission exceeded');
 return result;
}
function bytes(x){
 if(Object.getPrototypeOf(x??{})===ArrayBuffer.prototype)return new Uint8Array(x).slice();
 if(ArrayBuffer.isView(x)&&Object.getPrototypeOf(x)===Uint8Array.prototype){const b=slots.buffer.call(x);if(b instanceof ArrayBuffer&&slots.byteOffset.call(x)===0&&slots.byteLength.call(x)===bufferLength.call(b))return new Uint8Array(x);}
 throw TypeError('Nonshared compact operator bytes required');
}
export async function createPostSelfAttentionMath(options={}){
 if(Object.keys(options).some(k=>k!=='wasmBytes'))throw TypeError('Unknown post-self-attention math option');
 let {wasmBytes}=options,owned;
 if(wasmBytes!==undefined)owned=bytes(wasmBytes); // Snapshot before the first await.
 else {const response=await fetch(new URL('./kernel.wasm',import.meta.url));if(!response.ok)throw Error('Post-self-attention math unavailable');owned=bytes(await response.arrayBuffer());}
 if(await sha(owned)!==POST_SELF_ATTENTION_MATH_SHA256)throw Error('Post-self-attention math hash mismatch');
 const wasmSnapshotCopyBytes=owned.byteLength,module=await WebAssembly.compile(owned),imports=WebAssembly.Module.imports(module).map(x=>x.module+':'+x.name+':'+x.kind).sort();
 if(JSON.stringify(imports)!==JSON.stringify(['env:sqrt:function','env:tanh:function']))throw Error('Post-self-attention math imports mismatch');
 const sqrt=Math.sqrt,tanh=Math.tanh,primitiveCalls={sqrt:0,tanh:0};let instance=await WebAssembly.instantiate(module,{env:{sqrt:x=>{primitiveCalls.sqrt++;return sqrt(x);},tanh:x=>{primitiveCalls.tanh++;return tanh(x);}}}),memory=instance.exports.memory;
 if(!(memory instanceof WebAssembly.Memory)||['Norm','Gelu','Add','Modulate','GateResidual'].some(k=>typeof instance.exports[k]!=='function'))throw Error('Post-self-attention math ABI mismatch');
 const start=memory.buffer.byteLength,span=27648*4,a=start,b=a+span,c=b+span,o=c+span,e=o+span,arenaBytes=span*5;
 memory.grow(Math.ceil(arenaBytes/65536));const memoryIdentity='post-self-attention-math-'+(++memorySerial);
 let busy=false,calls=0,snapshotCopyBytes=0,inputCopyBytes=0,outputCopyBytes=0,clearBytes=0;
 const lock=()=>{if(!instance)throw Error('Post-self-attention math disposed');if(busy)throw Error('Post-self-attention math busy');busy=true;};
 const put=(p,x)=>{new Float32Array(memory.buffer,p,x.length).set(x);inputCopyBytes+=x.byteLength;};
 const take=(p,n)=>{const x=new Float32Array(memory.buffer,p,n).slice();if(!x.every(Number.isFinite))throw Error('Nonfinite post-self-attention math output');outputCopyBytes+=x.byteLength;return x;};
 const snapshot=(x,n,max)=>{const v=finite(x,n,max);snapshotCopyBytes+=v.byteLength;return v;};
 const status=s=>{if(s!==0)throw RangeError('Hike post-self-attention math rejected numeric admission: '+s);};
 const clear=()=>{new Uint8Array(memory.buffer,start,arenaBytes).fill(0);clearBytes+=arenaBytes;busy=false;};
 function normalize(x,rows,weight,bias,mode){
  lock();try{
   if(!Number.isInteger(rows)||rows<1||rows>512)throw RangeError('Full5120 normalization rows1..512 shape required');
   const v=snapshot(x,rows*5120,1e16),w=mode>1?snapshot(weight,5120):null,z=mode===2?snapshot(bias,5120):null,result=new Float32Array(rows*5120);
   if(w)put(b,w);if(z)put(c,z);
   for(let row=0;row<rows;row++){put(a,v.subarray(row*5120,(row+1)*5120));status(instance.exports.Norm(a,b,c,o,mode,5120));result.set(new Float32Array(memory.buffer,o,5120),row*5120);outputCopyBytes+=20480;}
   if(!result.every(Number.isFinite))throw Error('Nonfinite post-self-attention math output');
   calls++;return result;
  }finally{clear();}
 }
 return Object.freeze({
  layerNorm:(x,rows)=>normalize(x,rows,null,null,1),affineNorm:(x,weight,bias,rows)=>normalize(x,rows,weight,bias,2),rmsNorm:(x,weight,rows)=>normalize(x,rows,weight,null,3),
  gelu(x){lock();try{const n=slots.length.call(x);if(!Number.isInteger(n)||n<1||n>27648)throw RangeError('GELU bounded1..27648 shape required');const v=snapshot(x,n,1e6);put(a,v);status(instance.exports.Gelu(a,n,o,n));calls++;return take(o,n);}finally{clear();}},
  add(x,y){lock();try{const n=slots.length.call(x);if(!Number.isInteger(n)||n<1||n>10240)throw RangeError('Add bounded1..10240 shape required');const av=snapshot(x,n),bv=snapshot(y,n);put(a,av);put(b,bv);status(instance.exports.Add(a,b,n,o,n));calls++;return take(o,n);}finally{clear();}},
  modulate(x,shift,scale,rows=2){lock();try{if(rows!==2)throw RangeError('Exact N2 modulation shape required');const av=snapshot(x,10240),bv=snapshot(shift,5120),cv=snapshot(scale,5120);put(a,av);put(b,bv);put(c,cv);status(instance.exports.Modulate(a,b,c,o,10240));calls++;return take(o,10240);}finally{clear();}},
  gateResidual(x,y,gate,rows=2){lock();try{if(rows!==2)throw RangeError('Exact N2 gate shape required');const av=snapshot(x,10240),bv=snapshot(y,10240),cv=snapshot(gate,5120);put(a,av);put(b,bv);put(c,cv);status(instance.exports.GateResidual(a,b,c,e,o,10240));calls++;return {gated:take(e,10240),residual:take(o,10240)};}finally{clear();}},
  stats(){return {wasmSHA256:POST_SELF_ATTENTION_MATH_SHA256,busy,disposed:!instance,memoryBytes:memory?.buffer.byteLength??0,memoryIdentity,arenaBytes,maxWorkspaceElements:27648,maxNormalizationRows:512,wasmSnapshotCopyBytes,calls,snapshotCopyBytes,inputCopyBytes,outputCopyBytes,clearBytes,primitiveCalls:{...primitiveCalls},workspaceReused:true,arithmetic:'natural full5120 sequential F32 norm reductions; separate multiply/add; tanh GELU; no fused operation'};},
  dispose(){if(busy)throw Error('Post-self-attention math busy');instance=null;memory=null;}
 });
}

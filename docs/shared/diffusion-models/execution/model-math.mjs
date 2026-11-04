import {MODEL_MATH_WASM_SHA256} from './model-math/registry.mjs';

export const MODEL_MATH_LIMITS=Object.freeze({maxRows:128,width:5120,headWidth:128,heads:40,maxLinearWidth:13824,maxElements:128*13824,chunkElements:81920,epsilon:1e-6});
const {maxRows,width:featureWidth,maxLinearWidth,maxElements,chunkElements}=MODEL_MATH_LIMITS;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const typedArrayPrototype=Object.getPrototypeOf(Float32Array.prototype);
const slots=Object.fromEntries(['length','byteOffset','byteLength','buffer'].map(name=>[name,Object.getOwnPropertyDescriptor(typedArrayPrototype,name).get]));
const tag=Object.getOwnPropertyDescriptor(typedArrayPrototype,Symbol.toStringTag).get;
const arrayBufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
const ROPE_CACHE_MAX_BYTES=96*1024*1024,ROPE_CACHE_MAX_ENTRIES=1024;
// Each owner is bound to this exact compiled profile. Header words record its
// key schema and rows; remaining words are raw F32 coordinates and I32 IDs.
const ROPE_CACHE_PROFILE=MODEL_MATH_WASM_SHA256+':RopeBuild-axis44-42-42-source128/key1';
let nextMemoryIdentity=0;

function snapshot(value,length,type='Float32Array'){
 if(!ArrayBuffer.isView(value)||tag.call(value)!==type)throw TypeError('Exact shape compact nonshared '+type+' required');
 const buffer=slots.buffer.call(value);
 if(!(buffer instanceof ArrayBuffer)||slots.length.call(value)!==length||slots.byteOffset.call(value)!==0||slots.byteLength.call(value)!==arrayBufferLength.call(buffer))throw TypeError('Exact shape compact nonshared '+type+' required');
 // Copy internal typed-array elements; caller species, getters, slice and
 // iterators cannot replace this snapshot or mutate a previously copied input.
 const owned=type==='Int32Array'?new Int32Array(value):new Float32Array(value);
 if(type==='Float32Array'&&!owned.every(Number.isFinite))throw TypeError('Finite F32 input required');
 if(type==='Int32Array'&&!owned.every(v=>v>=0&&v<=16777216))throw RangeError('Source IDs in 0..16777216 required');
 return owned;
}
function shape(rows,width=featureWidth,epsilon=1e-6){
 if(!Number.isInteger(rows)||rows<1||rows>maxRows||width!==featureWidth||epsilon!==1e-6)throw RangeError('Model math shape requires rows1..128, width5120 and epsilon1e-6');
 return rows*featureWidth;
}
function countOf(value){
 if(!ArrayBuffer.isView(value)||tag.call(value)!=='Float32Array')throw TypeError('Compact nonshared F32 input required');
 const count=slots.length.call(value);
 if(count<1||count>maxElements)throw RangeError('Model math shape requires 1..1769472 elements');
 return count;
}
function known(input,names){if(Object.keys(input).some(k=>!names.includes(k)))throw TypeError('Unknown model math input');}

export async function createModelMath({wasmBytes,ropeCache}={}){
 if(ropeCache!==undefined&&ropeCache!==false&&(ropeCache===null||typeof ropeCache!=='object'||Array.isArray(ropeCache)))throw TypeError('RoPE cache configuration requires false or bounds');
 if(ropeCache&&Object.keys(ropeCache).some(k=>!['maxBytes','maxEntries'].includes(k)))throw TypeError('Unknown RoPE cache configuration');
 const cacheMaxBytes=ropeCache===false?0:ropeCache?.maxBytes??ROPE_CACHE_MAX_BYTES,cacheMaxEntries=ropeCache===false?0:ropeCache?.maxEntries??ROPE_CACHE_MAX_ENTRIES;
 if(!Number.isSafeInteger(cacheMaxBytes)||cacheMaxBytes<0||cacheMaxBytes>ROPE_CACHE_MAX_BYTES||!Number.isSafeInteger(cacheMaxEntries)||cacheMaxEntries<0||cacheMaxEntries>ROPE_CACHE_MAX_ENTRIES)throw RangeError('RoPE cache bounds require bytes0..100663296 and entries0..1024');
 if(wasmBytes===undefined){const response=await fetch(new URL('./model-math/kernel.wasm',import.meta.url));if(!response.ok)throw Error('Model math Hike unavailable');wasmBytes=await response.arrayBuffer();}
 const owned=wasmBytes instanceof ArrayBuffer?new Uint8Array(wasmBytes).slice():ArrayBuffer.isView(wasmBytes)&&tag.call(wasmBytes)==='Uint8Array'&&slots.buffer.call(wasmBytes) instanceof ArrayBuffer?new Uint8Array(wasmBytes):null;
 if(!owned)throw TypeError('Nonshared model math WASM bytes required');
 if(await digest(owned)!==MODEL_MATH_WASM_SHA256)throw Error('Model math Hike hash mismatch');
 const module=await WebAssembly.compile(owned),imports=WebAssembly.Module.imports(module).map(x=>x.module+':'+x.name+':'+x.kind).sort();
 const primitiveNames=['cos','exp','pow','sin','sqrt','tanh'];
 if(JSON.stringify(imports)!==JSON.stringify(primitiveNames.map(x=>'env:'+x+':function')))throw Error('Model math Hike imports mismatch');
 const primitiveCalls=Object.fromEntries(primitiveNames.map(name=>[name,0]));
 const env=Object.fromEntries(primitiveNames.map(name=>[name,(...args)=>{primitiveCalls[name]++;return Math[name](...args);} ]));
 let instance=await WebAssembly.instantiate(module,{env}),memory=instance.exports.memory;
 const exports=['Norm','Modulate','GateResidual','Add','Gelu','Silu','Bias','DivideAttention','Sinusoidal','RopeBuild','RopeApply'];
 if(!(memory instanceof WebAssembly.Memory)||exports.some(name=>typeof instance.exports[name]!=='function'))throw Error('Model math Hike ABI mismatch');
 // Three full query buffers plus reusable broadcast/position/matrix storage.
 // Elementwise large linear outputs are streamed through chunkElements.
 const start=memory.buffer.byteLength,fullBytes=maxRows*featureWidth*4;
 const a=start,b=a+fullBytes,out=b+fullBytes,vector=out+fullBytes,vector2=vector+maxLinearWidth*4,positions=vector2+maxLinearWidth*4,ids=positions+maxRows*3*4,matrices=ids+maxRows*4,end=matrices+maxRows*256*4,arenaBytes=end-start;
 memory.grow(Math.ceil(arenaBytes/65536));
 const memoryIdentity='model-math-'+(++nextMemoryIdentity);
 let busy=false,calls=0,kernelCalls=0,snapshotCopyBytes=0,inputCopyBytes=0,outputCopyBytes=0;
 // Hash buckets only select candidates: every key word is compared on hits.
 // LRU retains geometry/matrices only, never x, Q/K results or weight state.
 const ropeBuckets=new Map(),ropeLru=new Map();
 const ropeCounts={hits:0,misses:0,builds:0,buildMatrixBytes:0,stagingCopies:0,stagingBytes:0,retentionCopyBytes:0,keyCopyBytes:0,evictions:0,clears:0,uncacheableBuilds:0,matrixBytes:0,keyBytes:0,peakRetainedBytes:0};
 const cacheEnabled=cacheMaxBytes>0&&cacheMaxEntries>0;
 function dropRopeCache(){ropeBuckets.clear();ropeLru.clear();ropeCounts.matrixBytes=0;ropeCounts.keyBytes=0;ropeCounts.clears++;}
 function ropeKeyHash(rows,ps,ss){
  let hash=Math.imul(2166136261^1,16777619);hash=Math.imul(hash^rows,16777619);
  for(const word of new Uint32Array(ps.buffer))hash=Math.imul(hash^word,16777619);
  for(const word of new Uint32Array(ss.buffer))hash=Math.imul(hash^word,16777619);
  return hash>>>0;
 }
 function findRope(hash,rows,ps,ss){
  const p=new Uint32Array(ps.buffer),s=new Uint32Array(ss.buffer);
  for(const entry of ropeBuckets.get(hash)??[]){
   const key=entry.key;
   if(key[0]!==1||key[1]!==rows)continue;
   let same=true;
   for(let i=0;i<p.length&&same;i++)same=key[i+2]===p[i];
   for(let i=0;i<s.length&&same;i++)same=key[i+2+p.length]===s[i];
   if(same){ropeLru.delete(entry);ropeLru.set(entry,true);return entry;}
  }
  return null;
 }
 function retainRope(hash,rows,ps,ss){
  const matrixBytes=rows*256*4,keyBytes=(2+rows*4)*4,bytes=matrixBytes+keyBytes;
  if(!cacheEnabled||bytes>cacheMaxBytes){ropeCounts.uncacheableBuilds++;return;}
  while(ropeLru.size>=cacheMaxEntries||ropeCounts.matrixBytes+ropeCounts.keyBytes+bytes>cacheMaxBytes){
   const oldest=ropeLru.keys().next().value,bucket=ropeBuckets.get(oldest.hash);
   bucket.splice(bucket.indexOf(oldest),1);if(bucket.length===0)ropeBuckets.delete(oldest.hash);
   ropeLru.delete(oldest);ropeCounts.matrixBytes-=oldest.matrix.byteLength;ropeCounts.keyBytes-=oldest.key.byteLength;ropeCounts.evictions++;
  }
  const key=new Uint32Array(2+rows*4);key[0]=1;key[1]=rows;key.set(new Uint32Array(ps.buffer),2);key.set(new Uint32Array(ss.buffer),2+rows*3);
  const matrix=take(matrices,rows*256),entry={hash,key,matrix};
  const bucket=ropeBuckets.get(hash)??[];bucket.push(entry);ropeBuckets.set(hash,bucket);ropeLru.set(entry,true);
  ropeCounts.matrixBytes+=matrixBytes;ropeCounts.keyBytes+=keyBytes;ropeCounts.retentionCopyBytes+=matrixBytes;ropeCounts.keyCopyBytes+=keyBytes;
  ropeCounts.peakRetainedBytes=Math.max(ropeCounts.peakRetainedBytes,ropeCounts.matrixBytes+ropeCounts.keyBytes);
 }
 const lock=()=>{if(!instance)throw Error('Model math disposed');if(busy)throw Error('Model math busy');busy=true;};
 const copy=(value,length,type)=>{const owned=snapshot(value,length,type);snapshotCopyBytes+=owned.byteLength;return owned;};
 const put=(pointer,value)=>{const View=value instanceof Int32Array?Int32Array:Float32Array;new View(memory.buffer,pointer,value.length).set(value);inputCopyBytes+=value.byteLength;};
 const call=(name,...args)=>{kernelCalls++;const status=instance.exports[name](...args);if(status!==0)throw RangeError('Hike model math rejected numeric admission: '+name+' '+status);};
 const take=(pointer,length)=>{const result=new Float32Array(memory.buffer,pointer,length).slice();if(!result.every(Number.isFinite))throw RangeError('Nonfinite Hike model math output');outputCopyBytes+=result.byteLength;return result;};
 const run=fn=>{lock();try{const result=fn();calls++;return result;}finally{new Uint8Array(memory.buffer,start,arenaBytes).fill(0);busy=false;}};
 function norm(input,mode){return run(()=>{
  known(input,['input','rows','width','epsilon',...(mode>1?['weight']:[]),...(mode===2?['bias']:[])]);
  const {rows,width=featureWidth,epsilon=1e-6}=input,count=shape(rows,width,epsilon);
  const xs=copy(input.input,count),ws=mode>1?copy(input.weight,featureWidth):null,bs=mode===2?copy(input.bias,featureWidth):null;
  if(!xs.every(v=>Math.abs(v)<=1e16))throw RangeError('Model norm numeric admission exceeded');
  put(a,xs);if(ws)put(vector,ws);if(bs)put(vector2,bs);
  call('Norm',a,vector,vector2,rows,mode,out,count);return take(out,count);
 });}
 function unary(input,name){return run(()=>{
  known(input,['input']);const {input:x}=input,xs=copy(x,countOf(x)),result=new Float32Array(xs.length);
  for(let offset=0;offset<xs.length;offset+=chunkElements){const part=xs.subarray(offset,Math.min(offset+chunkElements,xs.length));put(a,part);call(name,a,part.length,out,part.length);result.set(take(out,part.length),offset);}
  return result;
 });}
 return Object.freeze({
  layerNorm(input={}){return norm(input,1);},
  affineNorm(input={}){return norm(input,2);},
  rmsNorm(input={}){return norm(input,3);},
  modulate(input={}){return run(()=>{
   known(input,['input','shift','scale','rows','width']);const {rows,width=featureWidth}=input,count=shape(rows,width);
   const xs=copy(input.input,count),ss=copy(input.shift,featureWidth),cs=copy(input.scale,featureWidth);
   put(a,xs);put(vector,ss);put(vector2,cs);call('Modulate',a,vector,vector2,rows,out,count);return take(out,count);
  });},
  gateResidual(input={}){return run(()=>{
   known(input,['base','value','gate','rows','width']);const {rows,width=featureWidth}=input,count=shape(rows,width);
   const bs=copy(input.base,count),vs=copy(input.value,count),gs=copy(input.gate,featureWidth);
   put(a,bs);put(b,vs);put(vector,gs);call('GateResidual',a,b,vector,rows,out,count);return take(out,count);
  });},
  add(input={}){return run(()=>{
   known(input,['a','b']);const av=input.a,count=countOf(av),as=copy(av,count),bs=copy(input.b,count),result=new Float32Array(count);
   for(let offset=0;offset<count;offset+=chunkElements){const end=Math.min(offset+chunkElements,count),av=as.subarray(offset,end),bv=bs.subarray(offset,end);put(a,av);put(b,bv);call('Add',a,b,av.length,out,av.length);result.set(take(out,av.length),offset);}
   return result;
  });},
  gelu(input={}){return unary(input,'Gelu');},
  silu(input={}){return unary(input,'Silu');},
  bias(input={}){return run(()=>{
   known(input,['input','bias','rows','width']);const {rows,width}=input;
   if(!Number.isInteger(rows)||rows<1||rows>maxRows||!Number.isInteger(width)||width<1||width>maxLinearWidth)throw RangeError('Model bias shape requires rows1..128, width1..13824');
   const count=rows*width,xs=copy(input.input,count),bs=copy(input.bias,width),result=new Float32Array(count);put(vector,bs);
   for(let offset=0;offset<count;offset+=chunkElements){const part=xs.subarray(offset,Math.min(offset+chunkElements,count));put(a,part);call('Bias',a,vector,part.length,width,offset%width,out,part.length);result.set(take(out,part.length),offset);}
   return result;
  });},
  divideAttention(input={}){return run(()=>{
   known(input,['context','denominator','heads','queries','headDim']);const {heads=40,queries,headDim=128}=input;
   if(heads!==40||!Number.isInteger(queries)||queries<1||queries>maxRows||headDim!==128)throw RangeError('Attention division shape requires heads40, queries1..128 and headDim128');
   const count=heads*queries*headDim,context=copy(input.context,count),denominator=copy(input.denominator,heads*queries),result=new Float32Array(count);
   if(!denominator.every(value=>value>0))throw RangeError('Attention denominator must be finite and positive');
   put(vector,denominator);
   for(let offset=0;offset<count;offset+=chunkElements){const part=context.subarray(offset,Math.min(offset+chunkElements,count));put(a,part);call('DivideAttention',a,vector,heads,queries,headDim,offset,part.length,out,part.length);result.set(take(out,part.length),offset);}
   return result;
  });},
  sinusoidal(input={}){return run(()=>{
   known(input,['timestep']);const {timestep}=input;
   if(typeof timestep!=='number'||!Number.isFinite(timestep)||timestep<0||timestep>1000)throw RangeError('Timestep in 0..1000 required');
   call('Sinusoidal',timestep,out,256);return take(out,256);
  });},
  rope(input={}){return run(()=>{
   known(input,['input','rows','positions','sourceIds']);const {rows}=input,count=shape(rows);
   const xs=copy(input.input,count),ps=copy(input.positions,rows*3),ss=copy(input.sourceIds,rows,'Int32Array');
   put(a,xs);put(positions,ps);put(ids,ss);
   const hash=cacheEnabled?ropeKeyHash(rows,ps,ss):0,entry=cacheEnabled?findRope(hash,rows,ps,ss):null;
   if(entry){ropeCounts.hits++;put(matrices,entry.matrix);ropeCounts.stagingCopies++;ropeCounts.stagingBytes+=entry.matrix.byteLength;}
   else{ropeCounts.misses++;call('RopeBuild',positions,ids,rows,matrices,rows*256);ropeCounts.builds++;ropeCounts.buildMatrixBytes+=rows*256*4;retainRope(hash,rows,ps,ss);}
   call('RopeApply',a,matrices,rows,out,count);return take(out,count);
  });},
  clearRopeCache(){lock();try{dropRopeCache();}finally{busy=false;}},
  stats(){return {wasmSha256:MODEL_MATH_WASM_SHA256,memoryBytes:memory?.buffer.byteLength??0,memoryIdentity,arenaBytes,calls,kernelCalls,snapshotCopyBytes,inputCopyBytes,outputCopyBytes,primitiveCalls:{...primitiveCalls},ropeCache:{profile:ROPE_CACHE_PROFILE,enabled:cacheEnabled,maxBytes:cacheMaxBytes,maxEntries:cacheMaxEntries,entries:ropeLru.size,...ropeCounts,retainedBytes:ropeCounts.matrixBytes+ropeCounts.keyBytes,physicalMemoryBytes:null,memoryAccounting:'explicit retained matrix/key backing-store bytes; JS Map/object overhead, GC timing and process physical memory unknown; WASM staging copies retained'},workspaceReused:true,busy,disposed:!instance,limits:MODEL_MATH_LIMITS,arithmetic:'F32 sequential full5120 reduction; separate multiply/add; F64 fixed scalar transcendental bridges',siluProfile:'F32(x * F32(1 / F32(1 + F32(exp(-F64(x))))))); not ORT Sigmoid bit parity',attentionDivisionLayout:'head-major[40,Q,128] / denominator[40,Q], F32 division, exactQ1..128'};},
  dispose(){if(busy)throw Error('Model math busy');dropRopeCache();instance=null;memory=null;}
 });
}

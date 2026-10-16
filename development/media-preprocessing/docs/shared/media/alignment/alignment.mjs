import {ALIGNMENT_KERNEL} from './registry.mjs';
export {ALIGNMENT_KERNEL};
const MAX_MEMORY=16777216,MAX_BYTES=4194304,MAX_PIXELS=1048576;
const align=n=>Math.ceil(n/8)*8;
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
function aborted(signal){if(signal?.aborted)throw new DOMException('Alignment preparation aborted','AbortError');}
export async function prepareAlignmentKernel({signal,onCompile,onResponse}={}){
 aborted(signal);const r=await fetch(ALIGNMENT_KERNEL.url,{signal,credentials:'omit'});aborted(signal);
 if(!r.ok)throw Error(`Alignment kernel fetch failed (${r.status})`);onResponse?.(r.headers.get('content-type')??'');
 const bytes=await r.arrayBuffer();aborted(signal);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==ALIGNMENT_KERNEL.sha256)throw Error('Alignment kernel SHA-256 mismatch');aborted(signal);onCompile?.();aborted(signal);
 const module=await WebAssembly.compile(bytes);aborted(signal);return module;
}
function checkedBuffer(data,{clamped=false}={}){
 if(!(data instanceof Uint8Array||(clamped&&data instanceof Uint8ClampedArray))||!(data.buffer instanceof ArrayBuffer)||data.buffer.resizable)throw TypeError('Expected fixed non-shared pixel bytes');
 new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
 if(data.byteLength>MAX_BYTES)throw RangeError('Pixel input exceeds 4 MiB');
 return data;
}
function dimensions(width,height){if(!integer(width,1,MAX_PIXELS)||!integer(height,1,MAX_PIXELS)||width*height>MAX_PIXELS)throw RangeError('Invalid alignment dimensions');}
function strideSize(data,stride,width,height,channels=1){if(!integer(stride,width*channels,MAX_BYTES)||stride*height>data.byteLength)throw RangeError('Invalid alignment stride/bytes');return stride*height;}
const POLICY_KEYS=['maxCost','minGap','minTexture','minMatches','minInlierRatio','maxFbError','consensusTolerance'];
function policyArray(p){
 if(p===undefined)return new Float64Array([1,0,0,1,0,32,16]);
 if(!p||Object.keys(p).some(k=>!POLICY_KEYS.includes(k)))throw TypeError('Invalid confidence policy');
 for(const k of ['maxCost','minGap','minTexture','minInlierRatio'])if(!Number.isFinite(p[k])||p[k]<0||p[k]>1)throw RangeError(`Invalid policy ${k}`);
 if(!integer(p.minMatches,1,4)||!integer(p.maxFbError,0,32)||!integer(p.consensusTolerance,0,16))throw RangeError('Invalid confidence count/distance');
 return Float64Array.from(POLICY_KEYS,k=>p[k]);
}
const PATCH_REASONS=['accepted','low-texture','cost-too-high','ambiguous','forward-backward-inconsistent','insufficient-search-support'];
export function instantiateAlignmentKernel(module){
 if(!(module instanceof WebAssembly.Module)||WebAssembly.Module.imports(module).length||WebAssembly.Module.exports(module).map(e=>`${e.name}:${e.kind}`).sort().join(',')!=='AlignEstimate:function,WarpRgba:function,memory:memory')throw TypeError('Unexpected alignment ABI');
 let instance=new WebAssembly.Instance(module),memory=instance.exports.memory;
 if(instance.exports.AlignEstimate.length!==13||instance.exports.WarpRgba.length!==8||!(memory.buffer instanceof ArrayBuffer)||memory.buffer.byteLength>MAX_MEMORY)throw TypeError('Unexpected alignment instance ABI');
 const arenaBase=Math.max(131072,memory.buffer.byteLength),instanceId=`alignment-${crypto.randomUUID()}`;let disposed=false,busy=false,liveBytes=0,runs=0;
 function alive(){if(disposed)throw Error('Alignment kernel is disposed');if(busy)throw Error('Alignment kernel is busy');}
 function noAlias(data){if(data.buffer===memory.buffer)throw TypeError('Input must not alias alignment Memory');}
 function arena(parts,body){
  alive();let end=arenaBase;const offsets=parts.map(p=>{const offset=end;end=align(end+p.bytes);return offset;});
  if(end>MAX_MEMORY)throw RangeError('Alignment arena exceeds 16 MiB');busy=true;let reserved=false;
  try{
   const pages=Math.ceil((end-memory.buffer.byteLength)/65536);if(pages>0)memory.grow(pages);
   liveBytes=end-arenaBase;reserved=true;const bytes=new Uint8Array(memory.buffer);bytes.fill(0,arenaBase,end);
   for(let i=0;i<parts.length;i++){const p=parts[i];if(p.data)bytes.set(new Uint8Array(p.data.buffer,p.data.byteOffset,p.bytes),offsets[i]);}
   const result=body(offsets,bytes);runs++;return result;
  }finally{if(reserved)new Uint8Array(memory.buffer).fill(0,arenaBase,end);liveBytes=0;busy=false;}
 }
 function estimate({referenceCodes,currentCodes,width,height,referenceStride=width,currentStride=width,roi,searchRadius,policy}={}){
  alive();dimensions(width,height);checkedBuffer(referenceCodes);checkedBuffer(currentCodes);noAlias(referenceCodes);noAlias(currentCodes);
  const refBytes=strideSize(referenceCodes,referenceStride,width,height),curBytes=strideSize(currentCodes,currentStride,width,height);
  if(!roi||!integer(roi.x,1,width-2)||!integer(roi.y,1,height-2)||!integer(roi.width,8,128)||!integer(roi.height,8,128)||roi.x+roi.width>width-1||roi.y+roi.height>height-1||!integer(searchRadius,0,16))throw RangeError('Invalid alignment ROI/search radius');
  const policyData=policyArray(policy);
  return arena([{data:referenceCodes,bytes:refBytes},{data:currentCodes,bytes:curBytes},{data:policyData,bytes:56},{bytes:64*8}],([ref,cur,policyPtr,out])=>{
   const status=instance.exports.AlignEstimate(ref,cur,width,height,referenceStride,currentStride,roi.x,roi.y,roi.width,roi.height,searchRadius,policyPtr,out);
   if(status!==0)throw Error('Alignment search failed');const values=new Float64Array(memory.buffer,out,64);
   const patches=Array.from({length:4},(_,i)=>{const b=8+i*12;return {patch:i,dx:values[b],dy:values[b+1],cost:values[b+2],gap:values[b+3],texture:values[b+4],forwardBackwardError:values[b+5],reason:PATCH_REASONS[values[b+6]]??'invalid-result',candidates:values[b+7],comparedPixels:values[b+10]};});
   const candidate=values[1]>0?{dx:values[3],dy:values[4]}:null;
   const applied=policy!==undefined&&values[0]===0;
   let reason=policy===undefined?'policy-required':values[0]===0?'accepted':values[0]===1?'insufficient-matches':'inconsistent-translation';
   if(policy!==undefined&&values[1]===0&&patches.every(p=>p.reason===patches[0].reason))reason=patches[0].reason;
   return {applied,reason,candidate,currentToReference:applied?[1,0,0,1,-candidate.dx,-candidate.dy]:null,referenceToCurrent:applied?[1,0,0,1,candidate.dx,candidate.dy]:null,coordinateSpace:'display-pixels',roi:{...roi},evidence:{acceptedMatches:values[1],inliers:values[2],inlierRatio:values[1]?values[2]/values[1]:0},patches};
  });
 }
 function warp({data,width,height,stride=width*4,dx,dy}={}){
  alive();dimensions(width,height);checkedBuffer(data,{clamped:true});noAlias(data);const inputBytes=strideSize(data,stride,width,height,4);
  if(!integer(dx,-16,16)||!integer(dy,-16,16))throw RangeError('Invalid integer translation');
  const pixels=width*height;
  return arena([{data,bytes:inputBytes},{bytes:pixels*4},{bytes:pixels}],([src,dst,mask],bytes)=>{
   const validPixels=instance.exports.WarpRgba(src,dst,mask,width,height,stride,dx,dy);
   if(validPixels<0||validPixels>pixels)throw Error('Invalid warp count');
   return {data:bytes.slice(dst,dst+pixels*4),validMask:bytes.slice(mask,mask+pixels),width,height,stride:width*4,validPixels};
  });
 }
 function dispose(){if(busy)throw Error('Alignment kernel is busy');disposed=true;instance=null;memory=null;module=null;liveBytes=0;}
 return Object.freeze({instanceId,get memory(){return memory;},estimate,warp,dispose,resourceStats:()=>({disposed,busy,liveBytes,arenaBase,memoryBytes:memory?.buffer.byteLength??0,maxMemoryBytes:MAX_MEMORY,runs})});
}

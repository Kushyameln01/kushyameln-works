import {WAN21_VAE_SHA256,WAN21_RAW_PROFILE,WAN21_RAW_F1_PROFILE,WAN21_RAW_RECT_PROFILE} from '../tensor-interop.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';
import {GENERATED_SPACE_KERNEL} from './generated-space/kernel-registry.mjs';

export const GENERATED_MODEL_LATENT='bernini-generated-model-latent:v1';
export const GENERATED_RAW_SAMPLE='wan21-raw-generated-sample:v1';
export const HIGH_HANDOFF_RAW='bernini-high-handoff-raw:v1';
export const HIGH_HANDOFF_PROFILE='bernini-high-low-wan21-handoff:v1';
export const NORMALIZATION='wan21-comfy-f32-v1';
export const ORIGINAL81_TARGET_SHAPE=Object.freeze([1,16,21,60,104]);
export const GENERATED_MAX_ELEMENTS=4194304;
export const CONTEXT_MAX_ELEMENTS=8388608;
const CHUNK=4096,EULER_CHUNK=65536,MEAN='wan21-normalized-posterior-mean:v1';
const typedArrayPrototype=Object.getPrototypeOf(Float32Array.prototype);
const typedArraySlots=Object.fromEntries(['buffer','length','byteOffset','byteLength'].map(name=>[name,Object.getOwnPropertyDescriptor(typedArrayPrototype,name).get]));
const typedArrayTag=Object.getOwnPropertyDescriptor(typedArrayPrototype,Symbol.toStringTag).get;
const arrayBufferByteLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
function shapeInfo(shape){
 if(!Array.isArray(shape)||shape.length!==5||shape[0]!==1||shape[1]!==16||shape.some(v=>!Number.isSafeInteger(v)||v<1))throw RangeError('Expected positive NCTHW [1,16,T,H,W] shape');
 let elements=1;for(const v of shape){elements*=v;if(!Number.isSafeInteger(elements)||elements>GENERATED_MAX_ELEMENTS)throw RangeError('Generated operation element capacity exceeded');}
 return {shape:[...shape],elements,positions:elements/16};
}
function arrayCopy(data,elements){
 const fail=()=>{throw TypeError('Native compact nonshared finite exact-shape F32 required');};
 if(Object.getPrototypeOf(data??{})!==Float32Array.prototype||!ArrayBuffer.isView(data))fail();
 let buffer,length,offset,bytes,bufferBytes,tag;
 try{buffer=typedArraySlots.buffer.call(data);length=typedArraySlots.length.call(data);offset=typedArraySlots.byteOffset.call(data);bytes=typedArraySlots.byteLength.call(data);bufferBytes=arrayBufferByteLength.call(buffer);tag=typedArrayTag.call(data);}catch{fail();}
 if(tag!=='Float32Array'||Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||length!==elements||offset!==0||bytes!==elements*4||bytes!==bufferBytes)fail();
 const owned=new Float32Array(data);
 for(let i=0;i<elements;i++)if(!Number.isFinite(owned[i])){owned.fill(0);fail();}
 return owned;
}
function noMask(value){for(const key of ['attentionMask','mask','noiseMask','denoiseMask'])if(value[key]!==undefined)throw TypeError('Latent arithmetic does not accept masks');}
const nativeSignalThrowIfAborted=AbortSignal.prototype.throwIfAborted;
function abort(signal){if(signal!==undefined)nativeSignalThrowIfAborted.call(signal);}
function requireHighProducer(tensor){if(!Array.isArray(tensor?.producerModelSha256s)||tensor.producerModelSha256s.length!==1||tensor.producerModelSha256s[0]!==BASE_MODEL_HASHES.HIGH)throw TypeError('HIGH handoff requires exactly the known HIGH producer identity');}
const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
function metadataCopy(tensor){
 const metadata={};
 if(tensor.context!==undefined)metadata.context=structuredClone(tensor.context);
 if(tensor.profileId!==undefined)metadata.profileId=tensor.profileId;
 return metadata;
}
function snapshot(tensor,{target,context=false,rawHandoff=false}={}){
 if(!tensor||typeof tensor!=='object')throw TypeError('Tensor required');noMask(tensor);
 const info=shapeInfo(tensor.shape);
 if(target&&!same(info.shape,target.shape))throw RangeError('Tensor shape differs from operation target');
 if(tensor.dtype!=='float32'||tensor.layout!=='NCTHW')throw TypeError('Expected float32 NCTHW tensor');
 if(tensor.axes!==undefined&&!same(tensor.axes,['N','C','T','H','W']))throw TypeError('Incorrect latent axes');
 if(context){
  if(tensor.meaning!=='raw-posterior-mean'||tensor.normalization!==undefined||tensor.latentContract!==undefined||tensor.modelSha256!==WAN21_VAE_SHA256)throw TypeError('Context requires unnormalized Wan21 raw posterior mean');
  if(tensor.profileId!==undefined&&![WAN21_RAW_PROFILE,WAN21_RAW_F1_PROFILE,WAN21_RAW_RECT_PROFILE].some(profile=>tensor.profileId===profile.id&&same(info.shape,profile.shape)))throw TypeError('Context profile ID does not match its shape');
 }else{
  if(tensor.profileId!==undefined)throw TypeError('Generated tensors cannot carry a posterior-mean profile ID');
  if(rawHandoff){
   if(tensor.meaning!==HIGH_HANDOFF_RAW||tensor.normalization!==undefined||tensor.latentContract!==undefined||tensor.handoffProfile!==HIGH_HANDOFF_PROFILE)throw TypeError('LOW normalization requires a raw HIGH handoff with the exact handoff profile');
  }else if(tensor.meaning!==GENERATED_MODEL_LATENT||tensor.normalization!==NORMALIZATION||tensor.latentContract!==undefined)throw TypeError('Generated restoration requires an unrestored generated model latent and exact normalization');
  if(tensor.handoffProfile!==undefined&&tensor.handoffProfile!==HIGH_HANDOFF_PROFILE)throw TypeError('Incorrect HIGH/LOW handoff profile');
  if(!Array.isArray(tensor.producerModelSha256s)||!tensor.producerModelSha256s.length||new Set(tensor.producerModelSha256s).size!==tensor.producerModelSha256s.length||tensor.producerModelSha256s.some(h=>!Object.values(BASE_MODEL_HASHES).includes(h)))throw TypeError('Explicit unique supported producer model identities required; VAE is a separate identity');
 }
 if(tensor.byteLength!==undefined&&tensor.byteLength!==info.elements*4)throw RangeError('Tensor byteLength mismatch');
 return {...info,...metadataCopy(tensor),...(context?{}:{producerModelSha256s:[...tensor.producerModelSha256s]}),data:arrayCopy(tensor.data,info.elements)};
}

/** Dedicated generated-sample restoration owner. No model, sampler or mean-restore API. */
export async function createGeneratedLatentSpace({wasmBytes,targetShape=ORIGINAL81_TARGET_SHAPE}={}){
 const target=shapeInfo(targetShape);
 if(!(wasmBytes instanceof Uint8Array)&&!(wasmBytes instanceof ArrayBuffer))throw TypeError('Explicit generated-space Hike WASM bytes required');
 const bytes=new Uint8Array(wasmBytes instanceof Uint8Array?wasmBytes:new Uint8Array(wasmBytes));
 if(await sha256(bytes)!==GENERATED_SPACE_KERNEL.sha256)throw Error('Generated-space WASM hash mismatch');
 const module=await WebAssembly.compile(bytes);if(WebAssembly.Module.imports(module).length)throw Error('Unexpected generated-space WASM import');
 let instance=new WebAssembly.Instance(module,{}),memory=instance.exports.memory;
 if(!(memory instanceof WebAssembly.Memory)||['RestoreGeneratedChunk','NormalizeContextRawChunk','RestoreHighHandoffChunk','NormalizeHighHandoffChunk'].some(name=>typeof instance.exports[name]!=='function'))throw Error('Invalid generated-space Hike ABI');
 const start=memory.buffer.byteLength,inputPtr=start,outputPtr=start+CHUNK*4,arenaBytes=CHUNK*8;memory.grow(Math.ceil(arenaBytes/65536));
 let disposed=false,busy=false,calls=0,operations=0,inputCopyBytes=0,outputCopyBytes=0,lastWorkspaceZeroed=true,allZeroHandoffSkips=0;
 const active=()=>{if(disposed)throw Error('Generated-space owner disposed');};
 const clear=()=>{if(memory)new Uint8Array(memory.buffer).fill(0,start,start+arenaBytes);lastWorkspaceZeroed=true;};
 function release(){clear();instance=null;memory=null;}
 function before(options){active();if(busy)throw Error('Generated-space operation already running');abort(options.signal);}
 async function transform(value,operation,options){
  const data=new Float32Array(value.elements);
  try{
   // Source KSAMPLER skips process_in only when the complete raw handoff is zero.
   // This host predicate chooses identity copying; it performs no tensor math.
   const zeroSkip=operation==='NormalizeHighHandoffChunk'&&value.data.every(v=>v===0);
   if(operation==='NormalizeHighHandoffChunk')value.handoffNormalization=zeroSkip?'skipped-all-zero-raw':'applied';
   if(zeroSkip)allZeroHandoffSkips++;
   for(let offset=0;offset<value.elements;offset+=CHUNK){
    active();abort(options.signal);const n=Math.min(CHUNK,value.elements-offset);
    if(zeroSkip)data.set(value.data.subarray(offset,offset+n),offset);
    else{
     new Float32Array(memory.buffer,inputPtr,n).set(value.data.subarray(offset,offset+n));inputCopyBytes+=n*4;lastWorkspaceZeroed=false;
     const rc=instance.exports[operation](inputPtr,n,outputPtr,CHUNK,offset,value.positions,value.elements);
     if(rc!==0)throw Error('Hike generated-space rejected input: '+rc);calls++;
     const result=new Float32Array(memory.buffer,outputPtr,n);if(!result.every(Number.isFinite))throw RangeError('Nonfinite generated-space output');data.set(result,offset);outputCopyBytes+=n*4;
    }
    options.onProgress?.({operation,completedElements:offset+n,totalElements:value.elements});abort(options.signal);active();
    if((offset/CHUNK+1)%16===0)await yieldTask();
   }
   return data;
  }catch(error){data.fill(0);throw error;}finally{value.data.fill(0);clear();}
 }
 function run(values,operation,options,finish){
  busy=true;
  return (async()=>{const output=[];try{for(const value of values)output.push(finish(value,await transform(value,operation,options)));operations++;return output;}catch(error){for(const value of output)value.data.fill(0);throw error;}finally{for(const value of values)value.data.fill(0);busy=false;if(disposed)release();}})();
 }
 const contextResult=(value,data)=>({dtype:'float32',shape:value.shape,layout:'NCTHW',meaning:MEAN,normalization:NORMALIZATION,modelSha256:WAN21_VAE_SHA256,...metadataCopy(value),data});
 return {
  restore(tensor,options={}){
   before(options);const value=snapshot(tensor,{target});
   return run([value],'RestoreGeneratedChunk',options,(v,data)=>({dtype:'float32',shape:v.shape,layout:'NCTHW',meaning:GENERATED_RAW_SAMPLE,...metadataCopy(v),latentContract:{schemaVersion:1,representation:'generated-sample',space:'raw',vaeModelSha256:WAN21_VAE_SHA256,producerModelSha256s:v.producerModelSha256s,normalization:{id:NORMALIZATION,state:'restored',owner:'diffusion_models'}},data})).then(values=>values[0]);
  },
  restoreHighHandoff(tensor,options={}){
   before(options);requireHighProducer(tensor);return run([snapshot(tensor,{target})],'RestoreHighHandoffChunk',options,(v,data)=>({dtype:'float32',shape:v.shape,layout:'NCTHW',meaning:HIGH_HANDOFF_RAW,handoffProfile:HIGH_HANDOFF_PROFILE,producerModelSha256s:v.producerModelSha256s,...metadataCopy(v),data})).then(values=>values[0]);
  },
  normalizeHighHandoff(tensor,options={}){
   before(options);requireHighProducer(tensor);return run([snapshot(tensor,{target,rawHandoff:true})],'NormalizeHighHandoffChunk',options,(v,data)=>({dtype:'float32',shape:v.shape,layout:'NCTHW',meaning:GENERATED_MODEL_LATENT,normalization:NORMALIZATION,handoffProfile:HIGH_HANDOFF_PROFILE,handoffNormalization:v.handoffNormalization,producerModelSha256s:v.producerModelSha256s,...metadataCopy(v),data})).then(values=>values[0]);
  },
  normalizeContextRaw(tensor,options={}){
   before(options);return run([snapshot(tensor,{context:true})],'NormalizeContextRawChunk',options,contextResult).then(values=>values[0]);
  },
  normalizeContexts(tensors,options={}){
   before(options);if(!Array.isArray(tensors))throw TypeError('Ordered context array required');
   let aggregate=0;for(const tensor of tensors){aggregate+=shapeInfo(tensor?.shape).elements;if(aggregate>CONTEXT_MAX_ELEMENTS)throw RangeError('Ordered context aggregate element capacity exceeded');}
   const owned=[];try{for(const tensor of tensors)owned.push(snapshot(tensor,{context:true}));}catch(error){for(const value of owned)value.data.fill(0);throw error;}
   return run(owned,'NormalizeContextRawChunk',options,contextResult);
  },
  stats(){return {disposed,busy,calls,operations,allZeroHandoffSkips,targetShape:[...target.shape],maxElements:GENERATED_MAX_ELEMENTS,maxContextElements:CONTEXT_MAX_ELEMENTS,memoryBytes:memory?.buffer.byteLength??0,arenaBytes,chunkElements:CHUNK,inputCopyBytes,outputCopyBytes,workspaceReused:true,workspaceZeroed:lastWorkspaceZeroed,wasmSha256:GENERATED_SPACE_KERNEL.sha256,sourceSha256:GENERATED_SPACE_KERNEL.sourceSha256,imports:0,modelInference:false,generationReady:false};},
  dispose(){disposed=true;if(!busy)release();}
 };
}

/** Target-aware adapter over real scheduler and Euler primitives; owns no predictors. */
export function createGeneratedTargetPointwise({scheduler,euler,targetShape=ORIGINAL81_TARGET_SHAPE}={}){
 const target=shapeInfo(targetShape);
 if(['noiseMix','inverseNoiseScale','flowDenoised'].some(name=>typeof scheduler?.[name]!=='function')||typeof euler?.step!=='function')throw TypeError('Explicit scheduler and Euler owners required');
 let disposed=false,busy=false,calls=0,operations=0,inputCopyBytes=0,outputCopyBytes=0;
 const active=()=>{if(disposed)throw Error('Generated target pointwise owner disposed');};
 function operation(name,request,options={}){
  active();if(busy)throw Error('Generated pointwise operation already running');abort(options.signal);
  if(!request||!same(request.shape,target.shape))throw RangeError('Pointwise request must match the operation target shape');noMask(request);
  if(request.dtype!==undefined&&request.dtype!=='float32'||request.layout!==undefined&&request.layout!=='NCTHW'||request.axes!==undefined&&!same(request.axes,['N','C','T','H','W'])||request.profileId!==undefined)throw TypeError('Pointwise metadata conflicts with float32 NCTHW operation target');
  const names={noiseMix:['noise','latent'],inverseNoiseScale:['latent'],flowDenoised:['input','velocity'],eulerStep:['latent','denoised']}[name],arrays=[];
  try{for(const key of names)arrays.push(arrayCopy(request[key],target.elements));}catch(error){for(const value of arrays)value.fill(0);throw error;}
  if(name==='noiseMix'&&(typeof request.noiseScale!=='number'||!Number.isFinite(request.noiseScale)||request.noiseScale<0)){for(const value of arrays)value.fill(0);throw RangeError('Explicit finite nonnegative noiseScale required');}
  const {sigma,nextSigma,noiseScale}=request,chunk=name==='eulerStep'?EULER_CHUNK:CHUNK,result=new Float32Array(target.elements);inputCopyBytes+=target.elements*4*arrays.length;busy=true;
  return (async()=>{
   try{for(let offset=0;offset<target.elements;offset+=chunk){active();abort(options.signal);const end=Math.min(offset+chunk,target.elements),a=arrays[0].subarray(offset,end),b=arrays[1]?.subarray(offset,end);
     const part=name==='noiseMix'?scheduler.noiseMix(a,b,sigma,noiseScale):name==='inverseNoiseScale'?scheduler.inverseNoiseScale(a,sigma):name==='flowDenoised'?scheduler.flowDenoised(a,b,sigma):euler.step(a,b,sigma,nextSigma);
     if(!(part instanceof Float32Array)||part.length!==end-offset||!part.every(Number.isFinite))throw TypeError('Pointwise dependency returned an invalid F32 chunk');
     result.set(part,offset);part.fill(0);calls++;outputCopyBytes+=(end-offset)*4;
     options.onProgress?.({operation:name,completedElements:end,totalElements:target.elements});abort(options.signal);active();if((offset/chunk+1)%16===0)await yieldTask();
    }operations++;return {data:result,shape:[...target.shape],operation:name,modelInference:false};
   }catch(error){result.fill(0);throw error;}finally{for(const value of arrays)value.fill(0);busy=false;}
  })();
 }
 return {
  noiseMix:(request,options)=>operation('noiseMix',request,options),inverseNoiseScale:(request,options)=>operation('inverseNoiseScale',request,options),flowDenoised:(request,options)=>operation('flowDenoised',request,options),eulerStep:(request,options)=>operation('eulerStep',request,options),
  stats(){return {disposed,busy,targetShape:[...target.shape],elements:target.elements,calls,operations,inputCopyBytes,outputCopyBytes,schedulerChunkElements:CHUNK,eulerChunkElements:EULER_CHUNK,scheduler:scheduler.stats?.(),eulerMemoryBytes:euler.memoryBytes,dependencyOwnership:'borrowed; caller disposes scheduler and Euler',modelInference:false,generationReady:false};},
  dispose(){disposed=true;}
 };
}

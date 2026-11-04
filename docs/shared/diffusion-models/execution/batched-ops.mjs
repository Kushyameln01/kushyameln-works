import * as ort from '../../inference/vendor/ort.wasm.min.mjs';
import {createDynamicLinearGraph} from '../ort-bridge/block-hidden/graph.mjs';
import {releaseOwnedResources,cleanupAfterFailure} from '../ort-bridge/qkv/ownership.mjs';
import {createBatchedAttentionGraph,BATCHED_ATTENTION_SCALE} from './batched-attention-graph.mjs';
import {createOwnedAttentionQueries} from './owned-attention-query.mjs';
import {createPreparedAttentionKV} from './prepared-attention-kv.mjs';

ort.env.wasm.wasmPaths={mjs:new URL('../../inference/vendor/ort-wasm-simd-threaded.mjs',import.meta.url).href,wasm:new URL('../../inference/vendor/ort-wasm-simd-threaded.wasm',import.meta.url).href};
ort.env.wasm.proxy=false;
// ORT's WASM runtime lives for the realm, not for an individual session. A
// different thread profile requires a fresh dedicated worker/realm.
let initializedThreads=null,initializingThreads=null,threadProfilePoisoned=false;
const resourceFailure=(message,details)=>Object.assign(Error(message),{code:'UNSUPPORTED_RESOURCE_CONFIG',details});
function threadAdmission(requested){
 if(![1,4].includes(requested))throw resourceFailure('Only explicit WASM thread profiles 1 or 4 are implemented',{requested});
 if(requested===4&&(globalThis.crossOriginIsolated!==true||typeof SharedArrayBuffer!=='function'||typeof globalThis.Worker!=='function'))throw resourceFailure('WASM threads4 require COOP/COEP, crossOriginIsolated and SharedArrayBuffer in a fresh realm',{requested,crossOriginIsolated:globalThis.crossOriginIsolated===true});
 if(threadProfilePoisoned)throw resourceFailure('ORT thread initialization could not be verified; recreate the worker/realm',{requested});
 if(initializingThreads!==null)throw resourceFailure('Another ORT thread profile is initializing; await it before preparing another owner',{requested,initializingThreads});
 if(initializedThreads!==null&&initializedThreads!==requested)throw resourceFailure('ORT thread profile cannot change after initialization; recreate the worker/realm',{requested,initializedThreads});
 return initializedThreads===null;
}

export const BATCHED_F32_PROFILE='f32-ort-gemm-batched-online-softmax-context-matmul-v1';
export const BATCHED_MODEL_LIMITS=Object.freeze({maxRows:128,maxColumns:5120,maxInner:13824,heads:40,maxQueries:128,maxKeys:256,headDim:128});
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
const sameShape=(actual,expected)=>Array.isArray(actual)&&actual.length===expected.length&&expected.every((n,i)=>actual[i]===n);
const typedArrayPrototype=Object.getPrototypeOf(Float32Array.prototype);
const typedArraySlot=Object.fromEntries(['buffer','byteLength','byteOffset','length'].map(name=>[name,Object.getOwnPropertyDescriptor(typedArrayPrototype,name).get]));
const arrayBufferByteLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
const nativeSignalThrowIfAborted=AbortSignal.prototype.throwIfAborted;
const abort=signal=>{if(signal!==undefined)nativeSignalThrowIfAborted.call(signal);};
function validatedView(value,length,label,{nonnegative=false}={}){
 const fail=()=>{throw TypeError(label+': native compact nonshared finite exact-shape F32 required');};
 if(Object.getPrototypeOf(value??{})!==Float32Array.prototype)fail();
 let buffer,byteLength,byteOffset,actualLength;
 try{buffer=typedArraySlot.buffer.call(value);byteLength=typedArraySlot.byteLength.call(value);byteOffset=typedArraySlot.byteOffset.call(value);actualLength=typedArraySlot.length.call(value);}catch{fail();}
 if(actualLength!==length||Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||byteOffset!==0||byteLength!==arrayBufferByteLength.call(buffer))fail();
 // A native slot-backed view ignores caller overrides of length, iterator,
 // every and slice. Nonshared bytes cannot change during this synchronous gate.
 const view=new Float32Array(buffer);
 for(let i=0;i<view.length;i++)if(!Number.isFinite(view[i])||(nonnegative&&view[i]<0))fail();
 return view;
}
function snapshot(value,length,label,options){return new Float32Array(validatedView(value,length,label,options));}
function validateOutput(tensor,shape,label){
 if(tensor?.type!=='float32'||!sameShape(tensor.dims,shape)||!(tensor.data instanceof Float32Array)||tensor.data.length!==shape.reduce((a,b)=>a*b,1)||!tensor.data.every(Number.isFinite))throw Error('ORT '+label+' finite F32/shape mismatch');
 return tensor.data;
}
function output(...args){return validateOutput(...args).slice();}
function bounded(value,max,label){if(!Number.isSafeInteger(value)||value<1||value>max)throw RangeError(label+' exceeds bounded shape 1..'+max);return value;}

// Limits bound named F32 spans: the largest weight tile is 270 MiB; its owned
// snapshot is another 270 MiB. Attention scores are at most 5 MiB, independent
// of the sequence length. ORT allocator memory is additional and not estimated.
export async function createBatchedModelOps(options={}){
 const {maxRows=128,maxColumns=5120,maxInner=13824,numThreads=1}=options;
 const limits=Object.freeze({maxRows:bounded(maxRows,128,'maxRows'),maxColumns:bounded(maxColumns,5120,'maxColumns'),maxInner:bounded(maxInner,13824,'maxInner'),heads:40,maxQueries:128,maxKeys:256,headDim:128});
 const firstInitialization=threadAdmission(numThreads),previousThreads=ort.env.wasm.numThreads;
 let restoreWorker=null,pthreadCreations=0;
 try{if(firstInitialization){
  initializingThreads=numThreads;ort.env.wasm.numThreads=numThreads;
  if(numThreads===4){
   const NativeWorker=globalThis.Worker,workerUrl=new URL('../../inference/vendor/ort-wasm-simd-threaded.mjs',import.meta.url).href;
   const wrapped=new Proxy(NativeWorker,{construct(target,args,newTarget){const worker=Reflect.construct(target,args,newTarget);if(args[1]?.name==='em-pthread'&&String(args[0])===workerUrl)pthreadCreations++;return worker;}});
   globalThis.Worker=wrapped;restoreWorker=()=>{if(globalThis.Worker===wrapped)globalThis.Worker=NativeWorker;};
  }
 }}catch(error){initializingThreads=null;ort.env.wasm.numThreads=previousThreads;throw resourceFailure('Could not install the verified ORT thread resource profile',{requested:numThreads,cause:String(error.message??error)});}
 let linearSession=null,attentionSession=null,attentionQueries=null,finalAttentionQueryStats=null,preparedAttentionKV=null,finalPreparedAttentionKVStats=null,busy=false,disposed=false,closing=false,pending=null,linearRuns=0,attentionRuns=0,inputCopyBytes=0,outputCopyBytes=0;
 let preparedWeightBytes=0,peakPreparedWeightBytes=0,preparedWeightCopies=0,preparedWeightTransfers=0,preparedWeightCopyBytes=0,preparedWeightTransferBytes=0,preparedWeightCreations=0,preparedWeightReleases=0,runtimeInputSpanBytes=0;
 const preparedWeights=new Map(),knownPreparedWeights=new WeakSet();
 const timings={snapshotMs:0,weightPrepareMs:0,kvPrepareMs:0,kvReleaseMs:0,sessionRunMs:0,linearSessionRunMs:0,attentionSessionRunMs:0,outputCopyMs:0,tensorCleanupMs:0,preparedReleaseMs:0,ownerDisposeMs:0};
 const tensors=new Set(),retain=value=>{tensors.add(value);return value;};
 const live=()=>{if(disposed)throw Error('Batched model ops disposed');if(closing)throw Object.assign(Error('Batched model ops cleanup required'),{code:'RECOVERY_REQUIRED'});};
 const cleanupTensors=()=>releaseOwnedResources([...tensors].map(value=>({value,release:t=>t.dispose(),clear:()=>tensors.delete(value)})));
 const clearPrepared=(handle,record)=>{record.data=null;record.tensor=null;preparedWeights.delete(handle);preparedWeightBytes-=handle.byteLength;preparedWeightReleases++;};
 const cleanupPrepared=()=>releaseOwnedResources([...preparedWeights].map(([handle,record])=>({value:record.tensor,release:t=>t.dispose(),clear:()=>clearPrepared(handle,record)})));
 const cleanup=()=>releaseOwnedResources([
  {value:tensors.size?tensors:null,release:()=>cleanupTensors(),clear:()=>{}},
  {value:preparedWeights.size?preparedWeights:null,release:()=>cleanupPrepared(),clear:()=>{}},
  {value:attentionQueries,release:owner=>owner.disposeAll(),clear:()=>{finalAttentionQueryStats=attentionQueries.stats();attentionQueries=null;}},
  {value:preparedAttentionKV,release:owner=>owner.disposeAll(),clear:()=>{finalPreparedAttentionKVStats=preparedAttentionKV.stats();preparedAttentionKV=null;}},
  {value:linearSession,release:s=>s.release(),clear:()=>{linearSession=null;}},
  {value:attentionSession,release:s=>s.release(),clear:()=>{attentionSession=null;}}
 ]);
 const dispose=()=>{
  if(disposed)return Promise.resolve();if(busy)return Promise.reject(Error('Cancel and await active batched operation before disposal'));if(pending)return pending;
  closing=true;pending=Promise.resolve().then(async()=>{const began=performance.now();try{await cleanup();disposed=true;closing=false;}finally{timings.ownerDisposeMs+=performance.now()-began;pending=null;}});return pending;
 };
 const finish=async primary=>{const began=performance.now();try{await cleanupTensors();}catch(error){closing=true;throw new AggregateError(primary?[primary,error]:[error],'Batched ORT tensor cleanup failed; call recover before reuse',{cause:primary??error});}finally{timings.tensorCleanupMs+=performance.now()-began;busy=false;}};
 const capture=(...args)=>{const began=performance.now();try{const value=snapshot(...args);inputCopyBytes+=value.byteLength;return value;}finally{timings.snapshotMs+=performance.now()-began;}};
 const tensor=(data,shape)=>retain(new ort.Tensor('float32',data,shape));
 const run=async(session,feeds)=>{const began=performance.now(),kind=session===linearSession?'linearSessionRunMs':'attentionSessionRunMs';try{return await session.run(feeds);}finally{const elapsed=performance.now()-began;timings.sessionRunMs+=elapsed;timings[kind]+=elapsed;}};
 const copiedOutput=(...args)=>{const began=performance.now();try{const data=output(...args);outputCopyBytes+=data.byteLength;return data;}finally{timings.outputCopyMs+=performance.now()-began;}};
 try{
  const linearGraph=createDynamicLinearGraph(),attentionGraph=createBatchedAttentionGraph();
  const linearGraphSHA256=await digest(linearGraph),attentionGraphSHA256=await digest(attentionGraph);
  linearSession=await ort.InferenceSession.create(linearGraph,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  if(firstInitialization){
   if(numThreads===4&&pthreadCreations!==3){threadProfilePoisoned=true;throw resourceFailure('Requested4-thread ORT initialization did not create exactly3 native pthread workers; recreate realm',{requested:4,pthreadCreations});}
   initializedThreads=numThreads;
  }
  attentionSession=await ort.InferenceSession.create(attentionGraph,{executionProviders:['wasm'],graphOptimizationLevel:'disabled'});
  preparedAttentionKV=createPreparedAttentionKV({ort,assertLive:live,validateView:validatedView,onCopy:bytes=>{inputCopyBytes+=bytes;},onCleanupFailure:()=>{closing=true;}});
  attentionQueries=createOwnedAttentionQueries({ort,session:attentionSession,assertLive:live,capture,validateOutput,copyOutput:copiedOutput,run,addRuntimeSpan:bytes=>{runtimeInputSpanBytes+=bytes;},addAttentionRun:()=>{attentionRuns++;},onCleanupFailure:()=>{closing=true;},borrowPreparedKV:(handle,options)=>preparedAttentionKV.borrow(handle,options)});
  return Object.freeze({
   prepareAttentionKV(input={}){
    live();if(busy)throw Error('Batched model ops busy');busy=true;const began=performance.now();
    try{return preparedAttentionKV.prepare(input);}finally{timings.kvPrepareMs+=performance.now()-began;busy=false;}
   },
   releaseAttentionKV(handle){
    if(busy)throw Error('Await active batched operation before releasing prepared K/V');
    if(!preparedAttentionKV)throw Error('Batched model ops disposed');const began=performance.now();
    try{return preparedAttentionKV.release(handle);}finally{timings.kvReleaseMs+=performance.now()-began;}
   },
   async attentionQueryPreparedTile(input={}){
    live();if(busy)throw Error('Batched model ops busy');busy=true;
    try{return await attentionQueries.stepPrepared(input);}finally{busy=false;}
   },
   beginAttentionQuery(input={}){
    live();if(busy)throw Error('Batched model ops busy');busy=true;
    try{return attentionQueries.begin(input);}finally{busy=false;}
   },
   async attentionQueryTile(input={}){
    live();if(busy)throw Error('Batched model ops busy');busy=true;
    try{return await attentionQueries.step(input);}finally{busy=false;}
   },
   finishAttentionQuery(handle,options={}){
    live();if(busy)throw Error('Batched model ops busy');busy=true;
    try{const result=attentionQueries.finish(handle,options);return {...result,evidence:{...result.evidence,precisionProfile:BATCHED_F32_PROFILE,computeF32:true,computeDtype:'F32',scale:BATCHED_ATTENTION_SCALE,graphSHA256:attentionGraphSHA256,ortVersion:ort.env.versions?.web??null}};}finally{busy=false;}
   },
   releaseAttentionQuery(handle){
    if(busy)throw Error('Await active batched operation before releasing an attention query');
    if(!attentionQueries)throw Error('Batched model ops disposed');
    return attentionQueries.release(handle);
   },
   prepareLinearWeight(input={}){
    live();if(busy)throw Error('Batched model ops busy');busy=true;const began=performance.now();
    try{
     const {weight,columns,inner,ownership='copy',signal}=input;abort(signal);bounded(columns,limits.maxColumns,'columns');bounded(inner,limits.maxInner,'inner');
     if(!['copy','take'].includes(ownership))throw TypeError('Explicit copy or take weight ownership required');
     const view=validatedView(weight,columns*inner,'prepared weight');abort(signal);
     // A public copy keeps caller bytes. A take is explicit and detaches only
     // the supplied compact private backing store after all admission checks.
     const data=ownership==='take'?structuredClone(view,{transfer:[typedArraySlot.buffer.call(view)]}):new Float32Array(view);
     if(ownership==='take'){preparedWeightTransfers++;preparedWeightTransferBytes+=data.byteLength;}else{preparedWeightCopies++;preparedWeightCopyBytes+=data.byteLength;inputCopyBytes+=data.byteLength;}
     const weightTensor=new ort.Tensor('float32',data,[columns,inner]);
     const handle=Object.freeze({columns,inner,byteLength:data.byteLength});knownPreparedWeights.add(handle);preparedWeights.set(handle,{data,tensor:weightTensor});
     preparedWeightBytes+=handle.byteLength;peakPreparedWeightBytes=Math.max(peakPreparedWeightBytes,preparedWeightBytes);preparedWeightCreations++;
     return handle;
    }finally{timings.weightPrepareMs+=performance.now()-began;busy=false;}
   },
   releaseLinearWeight(handle){
    if(busy)throw Error('Await active batched operation before releasing a prepared weight');
    const record=preparedWeights.get(handle);if(!record){if(knownPreparedWeights.has(handle))return false;throw TypeError('Prepared weight handle belongs to another owner');}
    const began=performance.now();try{record.tensor.dispose();clearPrepared(handle,record);return true;}catch(error){closing=true;throw error;}finally{timings.preparedReleaseMs+=performance.now()-began;}
   },
   async linearPrepared(input={}){
    live();if(busy)throw Error('Batched model ops busy');busy=true;let primary;
    try{
     const {x,weightHandle,rows,signal}=input;abort(signal);bounded(rows,limits.maxRows,'rows');
     const weight=preparedWeights.get(weightHandle);if(!weight)throw TypeError('Prepared weight handle is foreign or released');
     const {columns,inner}=weightHandle,a=capture(x,rows*inner,'x');runtimeInputSpanBytes+=a.byteLength+weightHandle.byteLength;
     const result=await run(linearSession,{x:tensor(a,[rows,inner]),weight:weight.tensor});for(const value of Object.values(result))retain(value);abort(signal);
     const projection=copiedOutput(result.projection,[rows,columns],'projection');linearRuns++;
     return {output:projection,evidence:{precisionProfile:BATCHED_F32_PROFILE,implementationProfile:'owned-prepared-cpu-weight-tensor-v1',computeF32:true,computeDtype:'F32',rows,columns,inner,fullInner:true,graphSHA256:linearGraphSHA256,weightBinding:'runtime-input',preparedWeight:true,weightValidation:'once before opaque owned handle creation',nativeWasmCopiesMeasured:false,ortVersion:ort.env.versions?.web??null}};
    }catch(error){primary=error;throw error;}finally{await finish(primary);}
   },
   async linear(input={}){
    live();if(busy)throw Error('Batched model ops busy');busy=true;let primary;
    try{
     const {x,weight,rows,columns,inner,signal}=input;abort(signal);bounded(rows,limits.maxRows,'rows');bounded(columns,limits.maxColumns,'columns');bounded(inner,limits.maxInner,'inner');
     // Snapshot every caller-owned span before session.run's first await.
     const a=capture(x,rows*inner,'x'),b=capture(weight,columns*inner,'weight');runtimeInputSpanBytes+=a.byteLength+b.byteLength;
     const result=await run(linearSession,{x:tensor(a,[rows,inner]),weight:tensor(b,[columns,inner])});for(const value of Object.values(result))retain(value);abort(signal);
     const projection=copiedOutput(result.projection,[rows,columns],'projection');linearRuns++;
     return {output:projection,evidence:{precisionProfile:BATCHED_F32_PROFILE,computeF32:true,computeDtype:'F32',rows,columns,inner,fullInner:true,graphSHA256:linearGraphSHA256,weightBinding:'runtime-input',ortVersion:ort.env.versions?.web??null}};
    }catch(error){primary=error;throw error;}finally{await finish(primary);}
   },
   async attentionTile(input={}){
    live();if(busy)throw Error('Batched model ops busy');busy=true;let primary;
    try{
     const {q,k,v,previousMax,previousDenominator,previousContext,heads,queries,keys,headDim,signal}=input;abort(signal);
     if(heads!==40||headDim!==128)throw RangeError('Bounded attention shape requires H40/D128');bounded(queries,128,'queries');bounded(keys,256,'keys');
     const rowCount=heads*queries,qSize=rowCount*headDim,kvSize=heads*keys*headDim;
     const ownedQ=capture(q,qSize,'q'),ownedK=capture(k,kvSize,'k'),ownedV=capture(v,kvSize,'v'),ownedMax=capture(previousMax,rowCount,'previousMax'),ownedDenominator=capture(previousDenominator,rowCount,'previousDenominator',{nonnegative:true}),ownedContext=capture(previousContext,qSize,'previousContext');runtimeInputSpanBytes+=ownedQ.byteLength+ownedK.byteLength+ownedV.byteLength+ownedMax.byteLength+ownedDenominator.byteLength+ownedContext.byteLength;
     const result=await run(attentionSession,{q:tensor(ownedQ,[heads,queries,headDim]),k:tensor(ownedK,[heads,keys,headDim]),v:tensor(ownedV,[heads,keys,headDim]),previousMax:tensor(ownedMax,[heads,queries]),previousDenominator:tensor(ownedDenominator,[heads,queries]),previousContext:tensor(ownedContext,[heads,queries,headDim])});
     for(const value of Object.values(result))retain(value);abort(signal);
     const max=copiedOutput(result.max,[heads,queries],'max'),denominator=copiedOutput(result.denominator,[heads,queries],'denominator'),context=copiedOutput(result.context,[heads,queries,headDim],'context');
     if(!denominator.every(n=>n>0))throw Error('ORT attention denominator must be positive');
     attentionRuns++;
     return {max,denominator,context,evidence:{precisionProfile:BATCHED_F32_PROFILE,computeF32:true,computeDtype:'F32',heads,queries,keys,headDim,logicalScoreElements:heads*queries*keys,phantomQueries:0,phantomKeys:0,scale:BATCHED_ATTENTION_SCALE,contextReduction:'ORT F32 batched MatMul; independent profile from Hike scalar recurrence',graphSHA256:attentionGraphSHA256,ortVersion:ort.env.versions?.web??null}};
    }catch(error){primary=error;throw error;}finally{await finish(primary);}
   },
   describe(){live();return {schemaVersion:'works-batched-model-ops/0.1',precisionProfile:BATCHED_F32_PROFILE,computeF32:true,limits:{...limits},linearGraphSHA256,attentionGraphSHA256,sessionCreations:2,resourceProfile:{id:numThreads===4?'ort-wasm-f32-threads4-coi-v1':'ort-wasm-f32-threads1-v1',numThreads,firstInitialization,pthreadCreationsObserved:pthreadCreations,coiRequired:numThreads===4,freshRealmRequiredForProfileChange:true,pthreadRealmMemoryIncluded:false},preparedLinearWeights:{available:true,ownership:['copy','take'],opaqueOwnerLocal:true,validation:'finite/native/shape once at preparation',persistentBinding:'CPU ort.Tensor; native WASM upload still unmeasured'},preparedAttentionKV:{available:true,implementationProfile:'owned-prepared-head-major-kv-v1',ownership:['copy','take'],opaqueOwnerLocal:true,validation:'finite/native/shape once at preparation; exact key range on each lease',layout:'compact [40,K<=256,128]',reuseAcrossQueries:true,nativeWasmCopiesMeasured:false},ownedAttentionQueries:{available:true,implementationProfile:'owned-online-attention-query-v1',opaqueOwnerLocal:true,qSnapshot:'once per query range',state:'owned CPU tensors retained between key tiles',finish:'requires all expected keys and releases query',nativeWasmCopiesMeasured:false},initialAttentionState:{max:-3.4028234663852886e38,denominator:0,context:0},layout:'head-major contiguous [H,Q,D]/[H,K,D]',context:'unnormalized online numerator; divide by denominator after all keys',scale:BATCHED_ATTENTION_SCALE,originalProductionPrecisionVerified:false,modelInference:false};},
   stats(){return {busy,disposed,cleanupPending:closing,pendingTensors:tensors.size,linearRuns,attentionRuns,inputCopyBytes,outputCopyBytes,runtimeInputSpanBytes,inputCopyBytesScope:'Owned JavaScript F32 snapshots only; native ORT/WASM copies are not measured',preparedWeights:preparedWeights.size,preparedWeightBytes,peakPreparedWeightBytes,preparedWeightCopies,preparedWeightTransfers,preparedWeightCopyBytes,preparedWeightTransferBytes,preparedWeightCreations,preparedWeightReleases,attentionQueries:attentionQueries?.stats()??finalAttentionQueryStats,preparedAttentionKV:preparedAttentionKV?.stats()??finalPreparedAttentionKVStats,timings:{...timings},resourceProfile:{numThreads,firstInitialization,pthreadCreationsObserved:pthreadCreations,coiRequired:numThreads===4,freshRealmRequiredForProfileChange:true},nativeWasmCopiesMeasured:false,sessionCreations:2};},dispose,recover:dispose
  });
 }catch(error){closing=true;throw await cleanupAfterFailure(error,dispose);}
 finally{restoreWorker?.();if(firstInitialization){initializingThreads=null;if(initializedThreads===null)ort.env.wasm.numThreads=previousThreads;}}
}

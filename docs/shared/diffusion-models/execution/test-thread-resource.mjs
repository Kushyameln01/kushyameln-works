const demand=(value,message)=>{if(!value)throw Error(message);};
const rejects=async(fn,code)=>{try{await fn();}catch(error){demand(error.code===code,'Expected resource error '+code+', got '+error);return error;}throw Error('Expected resource refusal');};
export async function runThreadResourceTests(threads){
 const {createBatchedModelOps}=await import('./batched-ops.mjs');
 const op=await createBatchedModelOps({numThreads:threads}),cases=[];
 try{
  const profile=op.describe().resourceProfile;demand(profile.numThreads===threads&&profile.firstInitialization,'Fresh profile must be prepared explicitly');
  demand(profile.pthreadCreationsObserved===(threads===4?3:0),'First4-thread initialization must observe three actual ORT pthread workers');
  const x=new Float32Array([1/7,2/11]),w=new Float32Array([3/13,4/17]),legacy=await op.linear({x,weight:w,rows:1,columns:1,inner:2}),handle=op.prepareLinearWeight({weight:w,columns:1,inner:2});
  const prepared=await op.linearPrepared({x,weightHandle:handle,rows:1});demand(Object.is(legacy.output[0],prepared.output[0]),'Prepared and old arithmetic bits');op.releaseLinearWeight(handle);
  const other=threads===4?1:4,error=await rejects(()=>createBatchedModelOps({numThreads:other}),'UNSUPPORTED_RESOURCE_CONFIG');cases.push({name:'different thread profile requires realm recreation',message:error.message});
  const reused=await createBatchedModelOps({numThreads:threads});try{demand(reused.stats().resourceProfile.firstInitialization===false&&reused.stats().resourceProfile.pthreadCreationsObserved===0,'Same verified runtime pool is reused');}finally{await reused.dispose();}
  return {passed:true,threads,cases,profile,stats:op.stats()};
 }finally{await op.dispose();}
}
export async function runNonisolatedResourceRefusal(){
 demand(globalThis.crossOriginIsolated!==true,'This refusal case needs a nonisolated page');
 const {createBatchedModelOps}=await import('./batched-ops.mjs');await rejects(()=>createBatchedModelOps({numThreads:4}),'UNSUPPORTED_RESOURCE_CONFIG');
 await rejects(()=>createBatchedModelOps({numThreads:2}),'UNSUPPORTED_RESOURCE_CONFIG');
 const fallback=await createBatchedModelOps();try{demand(fallback.describe().resourceProfile.numThreads===1,'Refused4 must not silently initialize a false4 profile');return {passed:true,case:'nonisolated4 refusal and explicitdefault1 initialization'};}finally{await fallback.dispose();}
}
export async function runPreinitializedResourceRefusal(){
 const ort=await import('../../inference/vendor/ort.wasm.min.mjs'),{createDynamicLinearGraph}=await import('../ort-bridge/block-hidden/graph.mjs');
 ort.env.wasm.wasmPaths={mjs:new URL('../../inference/vendor/ort-wasm-simd-threaded.mjs',import.meta.url).href,wasm:new URL('../../inference/vendor/ort-wasm-simd-threaded.wasm',import.meta.url).href};ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
 const previous=await ort.InferenceSession.create(createDynamicLinearGraph(),{executionProviders:['wasm']}),NativeWorker=globalThis.Worker;
 try{
  const {createBatchedModelOps}=await import('./batched-ops.mjs'),error=await rejects(()=>createBatchedModelOps({numThreads:4}),'UNSUPPORTED_RESOURCE_CONFIG');
  demand(error.details?.pthreadCreations===0,'Previously initialized1 must not be advertised as4');demand(globalThis.Worker===NativeWorker&&ort.env.wasm.numThreads===1,'Resource observer and configuration rollback required');
  const a=new ort.Tensor('float32',new Float32Array([2]),[1,1]),b=new ort.Tensor('float32',new Float32Array([3]),[1,1]);
  try{const result=await previous.run({x:a,weight:b});demand(result.projection.data[0]===6,'Existing external1-thread owner remains usable');for(const value of Object.values(result))value.dispose();}finally{a.dispose();b.dispose();}
  return {passed:true,case:'preinitialized vendor1 cannot silently become4; oldowner preserved',details:error.details};
 }finally{await previous.release();}
}

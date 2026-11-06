// This module has no top-level ORT import or native execution.
import {admitProfile,createFixture,createTimingRecorder} from './resident-ort-attention-timing-core.mjs';
import {createBatchedAttentionGraph} from '../../docs/shared/diffusion-models/execution/batched-attention-graph.mjs';
import {installWasmMemoryObserver} from '../../docs/shared/diffusion-models/execution/wasm-memory-observer.mjs';
let used=false;
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),x=>x.toString(16).padStart(2,'0')).join('');
const bytes=view=>new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
function base64(view){let text='';const raw=bytes(view);for(let i=0;i<raw.length;i+=32768)text+=String.fromCharCode(...raw.subarray(i,i+32768));return btoa(text);}
const fail=message=>{throw Error(message);};

export async function runTimingCase({threads,tiles,mode}={}){
 const profile=admitProfile({threads,tiles,crossOriginIsolated:globalThis.crossOriginIsolated===true,sharedArrayBufferAvailable:typeof SharedArrayBuffer==='function',workerAvailable:typeof Worker==='function'});
 if(!['baseline','wrapped'].includes(mode))fail('Explicit baseline or wrapped mode required');
 if(used)fail('A fresh realm is required for every case');used=true;
 const report={schemaVersion:'resident-ort-attention-timing-case/1',mode,profile,passed:false,fixtureClass:'Deterministic finite synthetic F32 operator inputs; not model QKV',shape:{heads:40,queries:128,keys:256,headDim:128},warmupTiles:1,measuredTiles:tiles,modelPayloadBytesRead:0,acceptedProduction:false,speedupClaim:false,outputs:[],timings:[],memory:{},cleanup:{errors:[]},sessionCalls:{createAttempts:0,createSuccesses:0,releaseSuccesses:0},pthreadCreations:0,unexpectedPthreadURLs:[]};
 const cleanupErrors=report.cleanup.errors,owned=new Set();let session=null,captured=null,observer=null,recorder=null,ort=null,oldTrace,oldWasmTrace;
 const workerDescriptor=Object.getOwnPropertyDescriptor(globalThis,'Worker'),NativeWorker=globalThis.Worker;
 const nativeFactoryURL=new URL('../../docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs',import.meta.url).href;
 const workerProxy=new Proxy(NativeWorker,{construct(target,args,newTarget){const worker=Reflect.construct(target,args,newTarget);if(args[1]?.name==='em-pthread'){report.pthreadCreations++;if(String(args[0])!==nativeFactoryURL)report.unexpectedPthreadURLs.push(String(args[0]));}return worker;}});
 const own=tensor=>{owned.add(tensor);return tensor;};
 const release=tensor=>{if(!owned.has(tensor))return;tensor.dispose();owned.delete(tensor);};
 try{
  globalThis.Worker=workerProxy;observer=installWasmMemoryObserver();recorder=createTimingRecorder();recorder.install();
  let factoryURL=nativeFactoryURL;
  if(mode==='wrapped'){const shim=await import('./resident-ort-attention-timing-factory.mjs');captured=shim.configureFactoryCapture(recorder);factoryURL=new URL('./resident-ort-attention-timing-factory.mjs',import.meta.url).href;}
  ort=await import('../../docs/shared/inference/vendor/ort.wasm.min.mjs');
  oldTrace=ort.env.trace;oldWasmTrace=ort.env.wasm.trace;ort.env.trace=true;ort.env.wasm.trace=true;
  ort.env.wasm.wasmPaths={mjs:factoryURL,wasm:new URL('../../docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm',import.meta.url).href};ort.env.wasm.numThreads=threads;ort.env.wasm.proxy=false;
  const graph=createBatchedAttentionGraph();report.graphSHA256=await sha(graph);report.sessionOptions={executionProviders:['wasm'],graphOptimizationLevel:'disabled'};
  report.sessionCalls.createAttempts++;session=await ort.InferenceSession.create(graph,report.sessionOptions);report.sessionCalls.createSuccesses++;
  report.ortVersion=ort.env.versions.web;report.threadsReported=ort.env.wasm.numThreads;
  if(report.ortVersion!=='1.24.3'||report.threadsReported!==threads)fail('Pinned version/profile mismatch; fallback is refused');
  if(report.pthreadCreations!==profile.expectedPthreads||report.unexpectedPthreadURLs.length)fail('Native pthread creation count/URL mismatch');
  report.memory.afterInitialization=observer.sample('after-initialization');
  const positiveMemories=report.memory.afterInitialization.memories.filter(x=>x.currentBytes>0);
  if(positiveMemories.length!==1)fail('Expected exactly one observed positive-size ORT memory in fresh case');
  report.singleObservedPositiveMemoryId=positiveMemories[0].id;
  if(captured){const s=captured.stats();if(s.factoryCalls!==1||s.initCalls!==1||s.initSuccesses!==1||s.initThreadArguments[0]!==threads||s.sessionCreations!==1||s.heapBytes!==positiveMemories[0].currentBytes)fail('Captured module initialization/single-memory size checks failed');}
  const first=createFixture(0),tensor=(data,shape)=>own(new ort.Tensor('float32',data,shape)),q=tensor(first.q,[40,128,128]);
  for(const [kind,count]of [['warmup',1],['measured',tiles]]){
   let state={max:tensor(new Float32Array(first.previousMax),[40,128]),denominator:tensor(new Float32Array(first.previousDenominator),[40,128]),context:tensor(new Float32Array(first.previousContext),[40,128,128])};
   for(let index=0;index<count;index++){
    const keyStart=index*256,fixture=createFixture(keyStart),k=tensor(fixture.k,[40,256,128]),v=tensor(fixture.v,[40,256,128]);
    const feeds={q,k,v,previousMax:state.max,previousDenominator:state.denominator,previousContext:state.context};
    const inputSHA256={};for(const [name,value]of Object.entries(feeds))inputSHA256[name]=await sha(bytes(value.data));
    recorder.beginFrame({kind,index,keyStart});
    const next=await session.run(feeds);let timing;
    try{timing=recorder.endFrame({requireNative:mode==='wrapped'});}finally{for(const value of Object.values(next))own(value);}
    report.timings.push(timing);
    const output={kind,index,keyStart,inputSHA256,values:{}};
    for(const [name,shape]of [['max',[40,128]],['denominator',[40,128]],['context',[40,128,128]]]){
     const value=next[name];if(value?.type!=='float32'||JSON.stringify(value.dims)!==JSON.stringify(shape)||!value.data.every(Number.isFinite))fail('Invalid finite F32 output '+name);
     if(name==='denominator'&&!value.data.every(x=>x>0))fail('Nonpositive denominator');
     output.values[name]={bytes:value.data.byteLength,sha256:await sha(bytes(value.data)),base64:base64(value.data)};
    }
    report.outputs.push(output);for(const value of Object.values(state))release(value);release(k);release(v);state=next;
   }
   for(const value of Object.values(state))release(value);
  }
  report.passed=true;
 }catch(error){report.error=String(error.stack??error);}
 finally{
  recorder?.abortFrame();if(observer)report.memory.beforeCleanup=observer.sample('before-cleanup');
  for(const value of [...owned])try{release(value);}catch(error){cleanupErrors.push('tensor: '+String(error));}
  if(session)try{await session.release();session=null;report.sessionCalls.releaseSuccesses++;}catch(error){cleanupErrors.push('session: '+String(error));}
  report.cleanup.remainingOwnedTensors=owned.size;report.cleanup.sessionReleased=session===null;
  if(captured){report.capture=captured.stats();const restored=captured.restore();report.cleanup.nativeHookRestore=restored;if(restored.conflicts.length)cleanupErrors.push('native hook restore conflicts');if(report.passed&&(report.capture.ortRunCalls!==tiles+1||report.capture.sessionReleases!==1))cleanupErrors.push('captured native lifecycle count mismatch');}
  if(observer){report.memory.afterCleanup=observer.sample('after-cleanup');report.cleanup.memoryObserverUnhook=observer.unhook();if(report.cleanup.memoryObserverUnhook.replacedByAnotherHook.length)cleanupErrors.push('memory observer restore conflict');}
  if(recorder){report.cleanup.traceRestore=recorder.restore();if(report.cleanup.traceRestore.conflicts.length)cleanupErrors.push('trace restore conflicts');}
  if(globalThis.Worker===workerProxy){if(workerDescriptor)Object.defineProperty(globalThis,'Worker',workerDescriptor);else delete globalThis.Worker;report.cleanup.workerRestored=true;}else{report.cleanup.workerRestored=false;cleanupErrors.push('Worker hook restore conflict');}
  if(ort){ort.env.trace=oldTrace;ort.env.wasm.trace=oldWasmTrace;}
  report.cleanup.realmTeardownRequired=true;report.cleanup.heapFreedBySessionReleaseClaim=false;
  if(cleanupErrors.length||owned.size||session)report.passed=false;
 }
 report.timingScope={publicSessionRunWallMs:'Diagnostic frame around awaited public session.run; includes public binding/upload/run/download/cleanup and timer overhead.',inputTensorPreparationWallMs:'Existing ORT trace: all input/output tensor preparation including allocation/upload/handle/shape preparation and awaits; not copy-only.',ortRunCallWallMs:mode==='wrapped'?'Synchronous plain CPU WASM _OrtRun entry-to-return wall time, including native allocator/operators/thread synchronization; not pure MatMul or CPU time.':'Unobserved without native wrapper; null is recorded, not zero native runtime.',outputTensorProcessingWallMs:'Existing ORT trace: output metadata/host allocation/download/handle release; not copy-only.',overhead:'Trace console calls, observers and wrappers add overhead. Baseline and wrapped cases both capture trace intervals. No speedup inference.'};
 return report;
}

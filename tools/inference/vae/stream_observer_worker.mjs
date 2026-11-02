// Observation only. Native jobs, result metadata, and transferred tensors stay unchanged.
import {observePlainMemory} from '../text-encoder/plain_memory.mjs';

const buffered=[];
self.onmessage=event=>buffered.push(event);
const send=self.postMessage.bind(self);
let identity={},firstCreate=true,firstRun=true;
const counts={created:0,released:0,active:0,maximumActive:0,runCalls:0,
 tensorDisposeCalls:0,loadMs:0,inferMs:0,createAttempts:0,createErrors:0,
 runErrors:0,releaseCalls:0,releaseErrors:0,repeatedReleaseCalls:0,tensorDisposeErrors:0};
const memoryTotals={events:0,maximumSingleWasmCapacityBytes:0,
 maximumObservedWasmCapacitySumBytes:0,maximumDeclaredWasmPages:0,
 maximumObservedMemoryCount:0,wasmGrowFailures:0};

function aggregateMemory(value){
 memoryTotals.events++;
 if(value.event==='wasm-grow-failure')memoryTotals.wasmGrowFailures++;
 let sum=0,count=0;
 for(const memory of value.wasmMemories??[]){
  const capacity=memory.capacityBytes;
  if(typeof capacity==='number'&&Number.isFinite(capacity)){
   sum+=capacity;count++;
   memoryTotals.maximumSingleWasmCapacityBytes=Math.max(memoryTotals.maximumSingleWasmCapacityBytes,capacity);
  }
  if(typeof memory.maximumPages==='number'&&Number.isFinite(memory.maximumPages))
   memoryTotals.maximumDeclaredWasmPages=Math.max(memoryTotals.maximumDeclaredWasmPages,memory.maximumPages);
 }
 memoryTotals.maximumObservedWasmCapacitySumBytes=Math.max(memoryTotals.maximumObservedWasmCapacitySumBytes,sum);
 memoryTotals.maximumObservedMemoryCount=Math.max(memoryTotals.maximumObservedMemoryCount,count);
}
const memory=observePlainMemory(aggregateMemory);

function memorySummary(){
 const current=memory.summary();
 // Fold any late capacity changes into scalars; never retain memory views or event lists.
 aggregateMemory({wasmMemories:current.wasmMemories});
 const {wasmMemories,...scalarTotals}=current;
 return {...scalarTotals,...memoryTotals,
  scope:'Scalar API-visible cumulative read/digest/submitted bytes and observed WASM capacities; not retained bytes, OS RSS/PSS, or proof of deallocation.'};
}
function observe(stage){
 send({...identity,type:'vae-observation',observation:{stage,...counts,memorySummary:memorySummary(),
  scope:'Delegated real native Worker/ORT calls; scalar lifecycle counters only. Result contract is unchanged.'}});
}
self.postMessage=function(message,transfer){
 if(message?.type==='success'||message?.type==='failure')observe('native-final');
 return transfer===undefined?send(message):send(message,transfer);
};

const ort=await import('/shared/inference/vendor/ort.wasm.min.mjs');
const realCreate=ort.InferenceSession.create;
ort.InferenceSession.create=async function(...args){
 counts.createAttempts++;
 const modelBytes=args[0]?.byteLength;
 if(typeof modelBytes==='number')memory.submittedModel(modelBytes);
 if(firstCreate){firstCreate=false;observe('first-ort-create-start');}
 const started=performance.now();
 let session;
 try{session=await Reflect.apply(realCreate,this,args);}
 catch(error){counts.createErrors++;throw error;}
 finally{counts.loadMs+=performance.now()-started;}
 counts.created++;counts.active++;
 counts.maximumActive=Math.max(counts.maximumActive,counts.active);
 let live=true;
 const methods=new Map();
 return new Proxy(session,{
  get(target,key){
   // ORT getters and methods can depend on private receiver state. Read/bind
   // against the original instance, preserving every uninstrumented property.
   const value=Reflect.get(target,key,target);
   if(typeof value!=='function')return value;
   if(methods.has(key))return methods.get(key);
   let wrapped;
   if(key==='run')wrapped=async(...feeds)=>{
    counts.runCalls++;
    if(firstRun){firstRun=false;observe('first-ort-run-start');}
    const begin=performance.now();
    try{return await Reflect.apply(value,target,feeds);}
    catch(error){counts.runErrors++;throw error;}
    finally{counts.inferMs+=performance.now()-begin;}
   };
   else if(key==='release')wrapped=async(...releaseArgs)=>{
    counts.releaseCalls++;
    try{
     const result=await Reflect.apply(value,target,releaseArgs);
     if(live){live=false;counts.released++;counts.active--;}
     else counts.repeatedReleaseCalls++;
     return result;
    }catch(error){counts.releaseErrors++;throw error;}
   };
   else wrapped=value.bind(target);
   methods.set(key,wrapped);
   return wrapped;
  }
 });
};

const realTensorDispose=ort.Tensor.prototype.dispose;
if(typeof realTensorDispose!=='function')throw Error('Pinned ORT Tensor.dispose observation unavailable');
ort.Tensor.prototype.dispose=function(...args){
 counts.tensorDisposeCalls++;
 try{return Reflect.apply(realTensorDispose,this,args);}
 catch(error){counts.tensorDisposeErrors++;throw error;}
};

await import('/shared/inference/inference-worker.mjs');
const nativeHandler=self.onmessage;
if(typeof nativeHandler!=='function')throw Error('Native inference worker handler missing');
self.onmessage=function(event){
 const job=event.data??{};
 identity={buildId:job.buildId,sessionId:job.sessionId,jobId:job.jobId,inputRevision:job.inputRevision};
 memory.setContext({jobId:job.jobId,inputRevision:job.inputRevision});
 return Reflect.apply(nativeHandler,this,[event]);
};
for(const event of buffered.splice(0))await self.onmessage(event);

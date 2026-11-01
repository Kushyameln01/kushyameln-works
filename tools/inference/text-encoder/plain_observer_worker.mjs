// Observation only: load the unchanged native worker and delegate real ORT calls.
import {observePlainMemory} from './plain_memory.mjs';
const buffered=[];
self.onmessage=event=>buffered.push(event);
const counts={created:0,released:0,active:0,maximumActive:0,runCalls:0,tensorDisposeCalls:0,loadMs:0,inferMs:0};
const send=self.postMessage.bind(self);
const memory=observePlainMemory(plainMemory=>send({plainMemory}));
self.postMessage=(message,transfer)=>{
 const observation=structuredClone(counts);
 if(message.result?.evidence){message.result.evidence.sessionObservation=observation;message.result.evidence.memoryObservation=memory.summary();}
 return send({...message,plainObservation:observation},transfer);
};
// The canonical URL is shared with the native runtime. Only scalar per-hash
// state is retained; update receives the native subarray view synchronously.
const {Sha256}=await import('/shared/vr180/sha256.mjs');
const hashObservations=new WeakMap();let hashSerial=0;
const realHashUpdate=Sha256.prototype.update,realHashDigest=Sha256.prototype.digestHex;
Sha256.prototype.update=function(bytes){
 let record=hashObservations.get(this);
 if(!record){record={hashId:++hashSerial,started:performance.now(),updateMs:0};hashObservations.set(this,record);memory.mark('incremental-digest-start',{hashId:record.hashId});}
 const details={hashId:record.hashId,inputBytes:bytes.byteLength,bytesHashedBefore:Number(this.bytesHashed)};
 memory.mark('incremental-digest-update-start',details);const start=performance.now();
 try{const value=realHashUpdate.call(this,bytes),durationMs=performance.now()-start;record.updateMs+=durationMs;memory.mark('incremental-digest-update-end',{...details,bytesHashedAfter:Number(this.bytesHashed),durationMs});return value;}
 catch(error){memory.mark('incremental-digest-failure',{...details,error:String(error)});throw error;}
};
Sha256.prototype.digestHex=function(...args){
 const value=realHashDigest.apply(this,args),record=hashObservations.get(this);
 if(record&&!record.finalized){record.finalized=true;memory.mark('incremental-digest-end',{hashId:record.hashId,inputBytes:Number(this.bytesHashed),durationMs:performance.now()-record.started,updateMs:record.updateMs,scope:'Hash finalization only; manifest equality is checked by the native runtime.'});}
 return value;
};
const ort=await import('/shared/inference/vendor/ort.wasm.min.mjs');
const realCreate=ort.InferenceSession.create;
ort.InferenceSession.create=function(...args){
 const modelBytes=args[0]?.byteLength??0,sessionIndex=counts.created+1,options=args[1];
 const sessionOptions={executionProviders:Array.isArray(options?.executionProviders)?options.executionProviders.map(value=>typeof value==='string'?value:typeof value?.name==='string'?value.name:null):null,graphOptimizationLevel:typeof options?.graphOptimizationLevel==='string'?options.graphOptimizationLevel:null,enableCpuMemArena:typeof options?.enableCpuMemArena==='boolean'?options.enableCpuMemArena:null,enableMemPattern:typeof options?.enableMemPattern==='boolean'?options.enableMemPattern:null,disablePrepacking:typeof options?.extra?.session?.disable_prepacking==='string'?options.extra.session.disable_prepacking:null};
 memory.submittedModel(modelBytes);memory.mark('ort-create-start',{sessionIndex,submittedModelBytes:modelBytes,sessionOptions,optionScope:'Supplied selected options; null means omitted. Pinned ORT1.24.3 defaults graph optimization to all, CPU arena/pattern to false.'});
 const start=performance.now();
 return realCreate.apply(this,args).then(session=>{
  counts.loadMs+=performance.now()-start;counts.created++;counts.active++;counts.maximumActive=Math.max(counts.maximumActive,counts.active);memory.mark('ort-create-end',{sessionIndex,durationMs:performance.now()-start});
  return {
   run(...feeds){
    memory.mark('ort-run-start',{sessionIndex});const begin=performance.now();counts.runCalls++;
    return session.run(...feeds).then(value=>{counts.inferMs+=performance.now()-begin;memory.mark('ort-run-end',{sessionIndex,durationMs:performance.now()-begin});return value;},error=>{counts.inferMs+=performance.now()-begin;memory.mark('ort-run-failure',{sessionIndex,error:String(error)});throw error;});
   },
   release(){
    memory.mark('ort-release-start',{sessionIndex});const begin=performance.now();
    return session.release().then(()=>{counts.released++;counts.active--;memory.mark('ort-release-end',{sessionIndex,durationMs:performance.now()-begin});});
   }
  };
 },error=>{memory.mark('ort-create-failure',{sessionIndex,error:String(error)});throw error;});
};
const realDispose=ort.Tensor.prototype.dispose;
if(typeof realDispose!=='function')throw Error('Pinned ORT Tensor.dispose observation unavailable');
ort.Tensor.prototype.dispose=function(...args){counts.tensorDisposeCalls++;memory.mark('tensor-dispose-start',{tensorDisposeCalls:counts.tensorDisposeCalls});const result=realDispose.apply(this,args);memory.mark('tensor-dispose-end',{tensorDisposeCalls:counts.tensorDisposeCalls});return result;};
await import('/shared/inference/inference-worker.mjs');
const nativeHandler=self.onmessage;
if(typeof nativeHandler!=='function')throw Error('Native worker handler missing');
self.onmessage=function(event){memory.setContext({jobId:event.data?.jobId,inputRevision:event.data?.inputRevision});memory.mark('worker-job-start');return nativeHandler.call(this,event);};
for(const event of buffered)await self.onmessage(event);

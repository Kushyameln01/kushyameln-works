// Private acceptance observer. Numerical work stays in the original native Worker.
const pending=[];
self.onmessage=event=>pending.push(event);
const send=self.postMessage.bind(self);
const counts={created:0,released:0,active:0,maximumActive:0,runCalls:0,tensorDisposeCalls:0};
const sessions=[];
let identity={},firstGraphHash=false;
function observe(event,details={}){
 send({...identity,type:'owner-observation',ownerObservation:{event,counts:{...counts},...details}});
}
self.postMessage=(message,transfer)=>send({...message,ownerObservation:{event:'native-'+message.type,counts:{...counts},sessions:structuredClone(sessions)}},transfer);

// A single scalar observation enables cancellation during the existing yielding
// incremental graph hash, before a second Text inference session is created.
const {Sha256}=await import('/shared/vr180/sha256.mjs');
const realUpdate=Sha256.prototype.update;
Sha256.prototype.update=function(bytes){
 const result=realUpdate.call(this,bytes);
 if(!firstGraphHash&&bytes.byteLength>=8*1024*1024){firstGraphHash=true;observe('graph-hash-update',{inputBytes:bytes.byteLength});}
 return result;
};
const ort=await import('/shared/inference/vendor/ort.wasm.min.mjs');
const realCreate=ort.InferenceSession.create;
ort.InferenceSession.create=async function(...args){
 const session=await realCreate.apply(this,args),index=++counts.created;
 counts.active++;counts.maximumActive=Math.max(counts.maximumActive,counts.active);
 sessions.push({index,inputNames:[...session.inputNames],outputNames:[...session.outputNames],inputMetadata:structuredClone(session.inputMetadata),outputMetadata:structuredClone(session.outputMetadata)});
 observe('session-created',{index});
 const run=async(...inputs)=>{counts.runCalls++;return session.run(...inputs);};
 const release=async(...options)=>{const value=await session.release(...options);counts.released++;counts.active--;observe('session-released',{index});return value;};
 // Preserve the actual names, IO metadata, getters and other session methods.
 return new Proxy(session,{get(target,key){if(key==='run')return run;if(key==='release')return release;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
};
const realDispose=ort.Tensor.prototype.dispose;
ort.Tensor.prototype.dispose=function(...args){counts.tensorDisposeCalls++;return realDispose.apply(this,args);};
await import('/shared/inference/inference-worker.mjs');
const nativeHandler=self.onmessage;
if(typeof nativeHandler!=='function')throw Error('Native inference Worker handler missing');
self.onmessage=function(event){
 const job=event.data;identity={buildId:job.buildId,sessionId:job.sessionId,jobId:job.jobId,inputRevision:job.inputRevision};
 observe('job-start');return nativeHandler.call(this,event);
};
for(const event of pending)await self.onmessage(event);

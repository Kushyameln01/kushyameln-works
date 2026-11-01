// Observation only: load the unchanged native worker and delegate real ORT calls.
const buffered=[];
self.onmessage=event=>buffered.push(event);
const counts={created:0,released:0,active:0,maximumActive:0,runCalls:0,tensorDisposeCalls:0,loadMs:0,inferMs:0};
const send=self.postMessage.bind(self);
self.postMessage=(message,transfer)=>{
 const observation=structuredClone(counts);
 if(message.result?.evidence)message.result.evidence.sessionObservation=observation;
 return send({...message,plainObservation:observation},transfer);
};
const ort=await import('/shared/inference/vendor/ort.wasm.min.mjs');
const realCreate=ort.InferenceSession.create;
ort.InferenceSession.create=async function(...args){
 const start=performance.now(),session=await realCreate.apply(this,args);counts.loadMs+=performance.now()-start;counts.created++;counts.active++;counts.maximumActive=Math.max(counts.maximumActive,counts.active);
 return {
  async run(...feeds){const begin=performance.now();counts.runCalls++;try{return await session.run(...feeds);}finally{counts.inferMs+=performance.now()-begin;}},
  async release(){await session.release();counts.released++;counts.active--;}
 };
};
const realDispose=ort.Tensor.prototype.dispose;
if(typeof realDispose!=='function')throw Error('Pinned ORT Tensor.dispose observation unavailable');
ort.Tensor.prototype.dispose=function(...args){counts.tensorDisposeCalls++;return realDispose.apply(this,args);};
await import('/shared/inference/inference-worker.mjs');
const nativeHandler=self.onmessage;
if(typeof nativeHandler!=='function')throw Error('Native worker handler missing');
for(const event of buffered)await nativeHandler(event);

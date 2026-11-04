// Resource glue only. Prediction, model math, graph and scheduler stay with the
// supplied Diffusion owner. Normal LoRA validation never calls this helper.
const fail=(code,message)=>Object.assign(Error(message),{code});
export async function createDiffusionLoraModelSession({adapter,createModel,options={}}={}){
 if(!adapter||typeof adapter.captureSource!=='function'||typeof adapter.currentEpoch!=='function'||typeof createModel!=='function')throw TypeError('Model connection and actual native constructor required');
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['math','ops','mathWasmBytes','numThreads','signal'].includes(k)))throw fail('MODEL_OPTION_UNSUPPORTED','Source-bound constructor options only; no file/side/decoder/source aliases');
 const captured=adapter.captureSource(),controller=new AbortController(),preparedOptions={...options},lifetimeSignal=preparedOptions.signal?AbortSignal.any([preparedOptions.signal,controller.signal]):controller.signal;
 let native=null,operation=null,closing=false,disposed=false,disposal,nativeDisposed=false,sourceReleased=false,uncertain=false,preparationCause;
 const check=()=>{lifetimeSignal.throwIfAborted();if(closing||disposed)throw fail('DISPOSED','Source-bound model session closing/disposed');if(!captured.isValid()||adapter.currentEpoch()!==captured.epoch)throw fail('STALE_WEIGHT_EPOCH','Cached native model belongs to a previous weight epoch; create a new session');};
 const stats=()=>({disposed,closing,busy:operation!==null,epoch:captured.epoch,packageHash:captured.packageHash,sourceLeaseRetained:!sourceReleased,nativeCleanupComplete:nativeDisposed,nativeCleanupUnconfirmed:uncertain,cleanupPending:closing&&!disposed||uncertain,connectionResourcesReleased:sourceReleased,native:native?.stats?.()??null});
 async function releaseSource(){if(!sourceReleased){await captured.release();sourceReleased=true;}}
 function dispose(){if(disposal)return disposal;if(disposed&&!uncertain)return Promise.resolve();closing=true;controller.abort(new DOMException('Source-bound model disposed','AbortError'));
  disposal=(async()=>{if(operation)await operation.promise.catch(()=>{});
   if(uncertain){if(typeof preparationCause?.recover!=='function')throw fail('NATIVE_RECOVERY_UNAVAILABLE','Native preparation cleanup returned no recovery owner; source lease retained');await preparationCause.recover();uncertain=false;nativeDisposed=true;}
   if(native&&!nativeDisposed){await native.dispose();nativeDisposed=true;}
   await releaseSource();disposed=true;closing=false;
  })().finally(()=>{disposal=null;});return disposal;
 }
 function predict(input={}){
  try{check();if(operation)throw fail('BUSY','Source-bound prediction is active');}catch(error){return Promise.reject(error);}
  let resolve,reject;const state={promise:new Promise((ok,no)=>{resolve=ok;reject=no;})};operation=state;
  const work=(async()=>{try{check();const signal=input.signal?AbortSignal.any([input.signal,lifetimeSignal]):lifetimeSignal;signal.throwIfAborted();const result=await native.predict({...input,signal});check();signal.throwIfAborted();return result;}finally{if(operation===state)operation=null;}})();work.then(resolve,reject);return state.promise;
 }
 const api=Object.freeze({describe(){check();return {contractVersion:'lora-diffusion-model-session/1.0-draft.1',binding:captured.description,native:native.describe(),modelInferenceAccepted:false,generationReady:false};},predict,stats,dispose,recover:dispose,
  async releaseAfterSourceDisposal(){if(!uncertain)throw Error('Only unconfirmed preparation cleanup uses this recovery boundary');if(adapter.stats().sourceDisposed!==true)throw Error('Backing source must actually be disposed before releasing this quarantined lease');if(operation)await operation.promise.catch(()=>{});await releaseSource();disposed=true;closing=false;return {connectorResourcesReleased:true,nativeCleanupUnconfirmed:true};}
 });
 try{check();native=await createModel({...preparedOptions,source:captured.source,signal:lifetimeSignal});if(!native||!['describe','predict','dispose'].every(k=>typeof native[k]==='function'))throw TypeError('Native model owner contract mismatch');check();return api;}
 catch(error){
  if(!native&&error instanceof AggregateError||native&&typeof native.dispose!=='function'){uncertain=true;closing=true;preparationCause=error;const failure=new AggregateError(error instanceof AggregateError?error.errors:[error],'Native preparation cleanup is unconfirmed; source lease retained',{cause:error});failure.code='NATIVE_PREPARATION_CLEANUP_PENDING';failure.connectionResource=api;throw failure;}
  try{if(native){closing=true;await dispose();}else{await releaseSource();disposed=true;}}catch(cleanup){const failure=new AggregateError([error,cleanup],'Model connection preparation and resource cleanup failed',{cause:error});failure.connectionResource=api;throw failure;}
  throw error;
 }
}

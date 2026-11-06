// Native fault injection is test-only; the production owner has no test hooks.
import * as ort from '../../../inference/vendor/ort.wasm.min.mjs';
import {createSelfAttentionTail} from './stage.mjs';
const demand=(value,message)=>{if(!value)throw Error(message);};
async function rejection(operation,pattern){let failure;try{await operation();}catch(error){failure=error;}demand(failure&&pattern.test(String(failure)),'Expected rejection '+pattern+'; actual='+String(failure));return failure;}
export async function runTailOwnershipCases(file,payload){
 const cases=[],side=payload.side,original={attention:Float32Array.from(payload.attention),patchHidden:Float32Array.from(payload.patchHidden),timeAct1:Float32Array.from(payload.timeAct1)},prototype=ort.InferenceSession.prototype,releaseSession=prototype.release,disposeTensor=ort.Tensor.prototype.dispose,runSession=prototype.run,digest=crypto.subtle.digest;
 let owner=null,releaseBarrier;
 try{
  const load=async path=>{const response=await fetch(new URL(path,import.meta.url));demand(response.ok,'test bytes');return new Uint8Array(await response.arrayBuffer());};
  const bridgeBytes=await load('../kernel/bridge.wasm'),mathBytes=await load('./kernel.wasm'),trustedInputs=structuredClone(payload.trustedInputs),construct=createSelfAttentionTail({file,side,trustedInputs,bridgeBytes,mathBytes});
  bridgeBytes.fill(0);mathBytes.fill(0);trustedInputs.fullPrefix.patchHiddenSHA256='0'.repeat(64);trustedInputs.attention.receiptSHA256='0'.repeat(64);
  owner=await construct;demand(owner.stats().activeORTSessions===1,'Exactly one real native session');cases.push({name:'operator bytes and trusted metadata snapshotted before first await',passed:true});
  let innerTouched=false,reentry;const outer={...original,get attention(){reentry=owner.run({get attention(){innerTouched=true;return original.attention;}}).catch(error=>error);return original.attention;},timeAct1:new Float32Array(1)};
  await rejection(()=>owner.run(outer),/shape|F32/);demand(/busy/i.test(String(await reentry))&&!innerTouched,'BUSY must precede caller getters');cases.push({name:'run BUSY before reentrant input getters',passed:true});
  const noncompact=new Float32Array(10241).subarray(1),invalidBuffers=[noncompact];if(typeof SharedArrayBuffer==='function')invalidBuffers.push(new Float32Array(new SharedArrayBuffer(40960)));
  for(const attention of invalidBuffers)await rejection(()=>owner.run({...original,attention}),/compact|nonshared|F32/);
  for(const key of ['attention','patchHidden','timeAct1']){const invalid=original[key].slice();invalid[0]=Infinity;await rejection(()=>owner.run({...original,[key]:invalid}),/finite/);}
  await rejection(()=>owner.run({...original,timestep:0}),/Unknown/);cases.push({name:'compact finite exact run shape and no time override',passed:true,sharedArrayBufferAvailable:typeof SharedArrayBuffer==='function'});
  let entered,once=true;const gate=new Promise(resolve=>entered=resolve),barrier=new Promise(resolve=>releaseBarrier=resolve),controller=new AbortController(),beforeHash=owner.stats();
  crypto.subtle.digest=async function(...args){if(once){once=false;entered();await barrier;}return digest.apply(this,args);};
  const hashing=owner.run({...original,signal:controller.signal});await gate;controller.abort();releaseBarrier();await rejection(()=>hashing,/abort/i);crypto.subtle.digest=digest;demand(!owner.stats().busy&&owner.stats().source.payloadReadBytes===beforeHash.source.payloadReadBytes,'Abort after SHA await must not read weights');cases.push({name:'cancel during hash await and owner reuse without payload read',passed:true});
  const caller=Object.fromEntries(Object.entries(original).map(([key,value])=>[key,value.slice()])),cancel=new AbortController();let progress=false;
  const pending=owner.run({...caller,signal:cancel.signal,onProgress(){progress=true;cancel.abort();}});for(const value of Object.values(caller))value.fill(0);
  await rejection(()=>pending,/abort/i);demand(progress&&!owner.stats().busy&&owner.stats().linear.pendingTensors===0,'Input snapshots must preserve accepted bits through first actual Gemm and cancellation cleanup');cases.push({name:'all run inputs snapshotted before await; actual tile cancellation cleans tensors and allows reuse',passed:true});
  class Alias extends Float32Array {slice(){return this;}}
  const aliasAttention=new Alias(original.attention),aliasCancel=new AbortController();let mutateOnce=true,firstXObserved=false;
  crypto.subtle.digest=function(...args){const result=digest.apply(this,args);if(mutateOnce){mutateOnce=false;aliasAttention.fill(0);}return result;};
  prototype.run=function(feeds,...args){if(!firstXObserved){firstXObserved=true;demand(feeds.x.data[0]===original.attention[0],'Subclass snapshot must preserve bound attention bits at actual first Tensor');}return runSession.call(this,feeds,...args);};
  await rejection(()=>owner.run({...original,attention:aliasAttention,signal:aliasCancel.signal,onProgress(){aliasCancel.abort();}}),/abort/i);
  demand(firstXObserved,'Subclass regression must reach actual ORT input');crypto.subtle.digest=digest;prototype.run=runSession;cases.push({name:'subclass virtual slice cannot retain caller alias after input hash snapshot',passed:true});
  let failedTensor=null,failedCalls=0,nativeTensorDisposals=0;
  ort.Tensor.prototype.dispose=function(){if(failedTensor===null)failedTensor=this;if(this===failedTensor&&++failedCalls===1)throw Error('INJECTED_TAIL_TENSOR_DISPOSE_FAILURE');nativeTensorDisposals++;return disposeTensor.call(this);};
  await rejection(()=>owner.run(original),/cleanup/);demand(!owner.stats().busy&&owner.stats().cleanupPending&&owner.stats().linear.pendingTensors===1,'Failed Tensor handle retained in quarantined owner');
  let touched=false;const blocked=await rejection(()=>owner.run({get attention(){touched=true;return original.attention;}}),/recovery/i);demand(blocked.code==='RECOVERY_REQUIRED'&&!touched,'No getter access while native handle awaits recovery');
  await owner.recover();demand(failedCalls===2&&owner.stats().disposed&&owner.stats().activeORTSessions===0,'Recover releases retained tensor and actual session');ort.Tensor.prototype.dispose=disposeTensor;owner=null;cases.push({name:'failed actual Tensor disposal retains handle and recover disposes native owner',passed:true,failedCalls,nativeTensorDisposals});
  for(const mode of ['synchronous-throw','rejected-promise']){
   owner=await createSelfAttentionTail({file,side,trustedInputs:payload.trustedInputs});let calls=0,nativeReleases=0;
   prototype.release=function(){calls++;if(calls===1){const error=Error('INJECTED_TAIL_SESSION_RELEASE_FAILURE');if(mode==='synchronous-throw')throw error;return Promise.reject(error);}nativeReleases++;return releaseSession.call(this);};
   await rejection(()=>owner.dispose(),/cleanup/);demand(owner.stats().cleanupPending&&!owner.stats().disposed&&owner.stats().activeORTSessions===1,'Failed actual session handle retained');
   await rejection(()=>owner.run({}),/recovery/);await owner.recover();demand(calls===2&&nativeReleases===1&&owner.stats().disposed&&owner.stats().activeORTSessions===0,'Failed native session retried once successfully');await owner.dispose();demand(calls===2,'Disposal is idempotent');cases.push({name:'actual session '+mode+' retains native handle until recover',passed:true,releaseCalls:calls,nativeReleases});prototype.release=releaseSession;owner=null;
  }
  return {passed:true,scope:'bounded native boundary tests with three actual projection tiles and explicit fail-once cleanup injection; no complete tail or fullmodel inference',cases};
 }finally{crypto.subtle.digest=digest;releaseBarrier?.();prototype.release=releaseSession;prototype.run=runSession;ort.Tensor.prototype.dispose=disposeTensor;await owner?.dispose();}
}

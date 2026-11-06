/** DEVELOPMENT reference provider/consumer for standalone management connection.
 * Native owner host performs completed-F32/range validation. These controls do
 * not map LoRA keys, compute weights or assert real trained-base/graph binding. */
import {createBerniniStandaloneRegistry,createStreamingKernel,createAdoptedLoraKernel,createLoraProductCache,createIndependentBaseProvider,createStandaloneReferenceHost} from './native.mjs';
const fail=(code,message)=>Object.assign(Error(message),{code});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
export const REFERENCE_TARGET_KEY='diffusion_model.blocks.0.self_attn.q.weight';
export const REFERENCE_MODEL_HASHES=Object.freeze({HIGH:'a'.repeat(64),LOW:'b'.repeat(64)});

export async function createReferenceSide({side,wasmBytes,behavior={}}={}){
 if(!['HIGH','LOW'].includes(side))throw TypeError('Explicit HIGH or LOW reference side required');
 const full=createBerniniStandaloneRegistry({modelHash:REFERENCE_MODEL_HASHES[side],side});
 const target=full.targets.find(t=>t.key===REFERENCE_TARGET_KEY);
 if(!target)throw Error('Pinned owner canonical reference target is unavailable');
 const registry=createBerniniStandaloneRegistry({modelHash:full.modelHash,side,targets:[target]});
 const targets=Object.freeze([Object.freeze({key:target.key,slice:Object.freeze({startRow:1,rowCount:1})})]);
 const kernel=await (wasmBytes===undefined?createAdoptedLoraKernel():createStreamingKernel({wasmBytes})),cache=createLoraProductCache({maxBytes:1024*1024});
 const base=createIndependentBaseProvider(registry);let baseAlive=true,backingDisposed=false,mode='success',releaseFailures=0,rollbackFailures=0,barrier=null,lastBlock=null;
 const counters={blockAttempts:0,completedBlocks:0,completedElements:0,releaseAttempts:0,rollbackAttempts:0};const waiters=[];
 const baseProvider=Object.freeze({describe(){if(!baseAlive)throw fail('REFERENCE_BASE_DISPOSED','Development reference base released');return base.describe();},readBlock(...args){if(!baseAlive)throw fail('REFERENCE_BASE_DISPOSED','Development reference base released');return base.readBlock(...args);}});
 function setBehavior(value={}){
  if(value.mode!==undefined){if(!['success','delay','fail'].includes(value.mode))throw TypeError('Unknown development reference consumer mode');mode=value.mode;}
  for(const key of ['releaseFailures','rollbackFailures'])if(value[key]!==undefined&&(!Number.isSafeInteger(value[key])||value[key]<0))throw TypeError('Nonnegative reference failure count required');
  if(value.releaseFailures!==undefined)releaseFailures=value.releaseFailures;if(value.rollbackFailures!==undefined)rollbackFailures=value.rollbackFailures;
  return {mode,releaseFailures,rollbackFailures};
 }
 setBehavior(behavior);
 const native=createStandaloneReferenceHost({registry,baseProvider,blockRows:1,
  async onBeforeBlock(coordinate){
   counters.blockAttempts++;lastBlock=structuredClone(coordinate);const captured=mode;
   if(captured==='delay')barrier=deferred();
   for(const waiter of waiters.splice(0))waiter.resolve(structuredClone(lastBlock));
   if(captured==='delay'){const own=barrier;try{await own.promise;}finally{if(barrier===own)barrier=null;}}
   if(captured==='fail')throw fail('REFERENCE_CONSUMER_FAILED','Explicit development reference consumer failure before completed block validation');
  },
  onBlock(coordinate){counters.completedBlocks++;counters.completedElements+=coordinate.count;}
 });
 const consumer=Object.freeze({...native,
  async releaseCandidate(...args){counters.releaseAttempts++;if(releaseFailures>0){releaseFailures--;throw fail('REFERENCE_RELEASE_FAILED','Explicit development reference candidate release failure');}return native.releaseCandidate(...args);},
  async rollback(...args){counters.rollbackAttempts++;if(rollbackFailures>0){rollbackFailures--;throw fail('REFERENCE_ROLLBACK_FAILED','Explicit development reference rollback failure');}return native.rollback(...args);}
 });
 const controls=Object.freeze({setBehavior,continue(){barrier?.resolve();},waitForBlock(){if(barrier)return Promise.resolve(structuredClone(lastBlock));const next=deferred();waiters.push(next);return next.promise;},stats(){return {...counters,mode,releaseFailures,rollbackFailures,waiting:!!barrier};}});
 async function disposeBacking(){
  if(backingDisposed)return {disposed:true};
  await consumer.dispose();
  // A caller may still own an SDK/prepared/read capability. Never close its
  // base or kernel underneath it merely because the consumer was disposed.
  if(kernel.stats().leaseCount>0)throw fail('REFERENCE_BACKING_IN_USE','Release SDK/prepared capabilities before ending the development base/kernel');
  cache.clear();kernel.dispose();baseAlive=false;backingDisposed=true;return {disposed:true};
 }
 return Object.freeze({side,registry,baseProvider,consumer,kernel,cache,targets,controls,disposeBacking,inspect(){return {kind:'DEVELOPMENT_REFERENCE_PROVIDER_CONSUMER',side,graphBinding:'UNBOUND',trainingBaseVerified:false,generationReady:false,baseAlive,backingDisposed,consumer:native.stats(),kernel:kernel.stats(),cache:cache.stats(),controls:controls.stats()};}});
}

import {freeze,sha256} from './planner.mjs';
import {readTensor} from './safetensors.mjs';
import {LOADER_POLICY_ID,LOADER_VARIANTS} from './loader-policy.mjs';
import {STANDALONE_CONTRACT_VERSION,validateStandaloneRegistry} from './standalone-registry.mjs';
import {buildStandalonePlan} from './standalone-planner.mjs';
import {captureOwnedLoraSource,createOwnedLoraPackage,reopenOwnedLoraPackage,MAX_OWNED_BLOCK_ELEMENTS} from './owned-package.mjs';

export {STANDALONE_CONTRACT_VERSION};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const hashJSON=v=>sha256(new TextEncoder().encode(JSON.stringify(ordered(v))));
const error=(code,message)=>Object.assign(new Error(message),{code});
function keys(v,allowed,label){if(!plain(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw TypeError('Unsupported or unknown '+label+' field');}
function pairId(id){if(!['light','detail'].includes(id))throw TypeError('Unsupported standalone pairId');return id;}
function ownership(value){return value&&typeof value.ownerId==='string'&&value.ownerId.length>0&&(value.kind==='independent-copy'||value.kind==='lease'&&typeof value.isValid==='function'&&value.isValid()===true);}

/** Fixed-side standalone control. Caller owns base, kernel and consumer lifetime. */
export function createLoraStandalone({registry:inputRegistry,baseProvider,kernel,cache}={}){
 const registry=validateStandaloneRegistry(inputRegistry),sdkInstanceId=crypto.randomUUID(),registryHashPromise=hashJSON(registry);
 if(typeof baseProvider?.describe!=='function'||typeof baseProvider?.readBlock!=='function')throw TypeError('Immutable standalone baseProvider required');
 if(!kernel||!['decode','product','apply'].every(k=>typeof kernel[k]==='function'))throw TypeError('Explicit streaming kernel required');
 let revision=0,disposed=false,operation=null,maintenance=null,disposal=null;
 const registrations=new Map(),plans=new WeakMap(),packages=new Map(),pendingCleanup=new Set(),errorRecoveries=new WeakSet();
 const live=()=>{if(disposed)throw error('DISPOSED','Standalone LoRA SDK disposed');};
 const recoveryRequired=()=>pendingCleanup.size>0||[...packages.values()].some(s=>s.recovery||s.releaseFailed);
 function cancel(){revision++;operation?.controller.abort(error('CANCELLED','Standalone LoRA operation cancelled'));}
 function guard(g,signal,isCurrent){live();signal?.throwIfAborted();if(g!==revision)throw error('STALE_PLAN','Stale standalone LoRA plan/revision');if(isCurrent&&isCurrent()!==true)throw error('STALE_CONTEXT','Standalone consumer context is not current');}
 async function tracked(label,signal,fn){
  live();if(operation||maintenance)throw error('BUSY','Standalone LoRA task busy until terminal');if(recoveryRequired())throw error('RECOVERY_REQUIRED','Standalone LoRA resource recovery required');
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason),state={label,controller,promise:null};
  let resolve,reject;state.promise=new Promise((done,failed)=>{resolve=done;reject=failed;});
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();operation=state;
  // Source/provider callbacks may reenter dispose synchronously. Publish the
  // stable terminal promise before invoking any caller-owned callback.
  const work=(async()=>{try{controller.signal.throwIfAborted();return await fn(controller.signal);}finally{signal?.removeEventListener('abort',abort);if(operation===state)operation=null;}})();work.then(resolve,reject);
  return state.promise;
 }
 async function cleanupSource(cap,onReleased=()=>{}){
  try{await cap.release();onReleased();}catch(cause){const retry=async()=>{await cap.release();onReleased();pendingCleanup.delete(retry);};pendingCleanup.add(retry);throw cause;}
 }
 function retainErrorRecovery(cause){
  if(cause&&typeof cause==='object'&&typeof cause.recover==='function'&&!errorRecoveries.has(cause)){const recover=cause.recover.bind(cause),retry=async()=>{await recover();pendingCleanup.delete(retry);};errorRecoveries.add(cause);pendingCleanup.add(retry);}
 }
 async function register(input={}){
  return tracked('register',input.signal,async signal=>{
   keys(input,['pairId','file','source','signal','onProgress'],'register');const id=pairId(input.pairId);
   if((input.file===undefined)===(input.source===undefined))throw TypeError('Register requires exactly one file or source');
   revision++;const g=revision,ownedSignal=signal;
   const sourceId=id+'@'+registry.side;let cap,installed=false;
   try{
    cap=await captureOwnedLoraSource(input.file??input.source,{sourceId,signal:ownedSignal,onProgress:input.onProgress});guard(g,ownedSignal);
    const alphaValues={};for(const [name,t]of Object.entries(cap.inspection.tensors))if(name.endsWith('.alpha')){const values=kernel.decode(await readTensor(cap,cap.inspection,name,{signal:ownedSignal}),t.dtype);guard(g,ownedSignal);if(values.length!==1)throw Error('Invalid scalar alpha');alphaValues[name]=values[0];}
    const shapePlan=buildStandalonePlan({inspection:cap.inspection,registry,sourceSha256:cap.sourceSha256,strength:0,loaderPolicyId:LOADER_POLICY_ID,alphaValues});
    const descriptor=freeze({contractVersion:STANDALONE_CONTRACT_VERSION,state:'REGISTERED',pairId:id,sourceId,side:registry.side,sourceSha256:cap.sourceSha256,bytes:cap.size,tensorCount:Object.keys(cap.inspection.tensors).length,patchCount:shapePlan.operations.length,localRevision:g});
    const previous=registrations.get(id);registrations.set(id,{cap,alphaValues,descriptor});installed=true;if(previous)await cleanupSource(previous.cap);guard(g,ownedSignal);return descriptor;
   }catch(cause){if(!cap)retainErrorRecovery(cause);if(cap&&!installed)try{await cleanupSource(cap);}catch(cleanup){throw new AggregateError([cause,cleanup],'Source registration and cleanup failed');}throw cause;}
  });
 }
 function composeInput(input){
  keys(input,['selections','targets','signal'],'compose');if(!Array.isArray(input.selections))throw TypeError('Explicit standalone selections required');
  const selections=structuredClone(input.selections),seen=new Set();for(const selection of selections){keys(selection,['pairId','strength'],'adapter selection');pairId(selection.pairId);if(seen.has(selection.pairId))throw Error('Duplicate standalone pair selection');seen.add(selection.pairId);if(!Number.isFinite(selection.strength)||!Number.isFinite(Math.fround(selection.strength)))throw Error('Finite F32 strength required');if(!registrations.has(selection.pairId))throw Error('Standalone pair is not registered: '+selection.pairId);}
  return {selections:selections.sort((a,b)=>['light','detail'].indexOf(a.pairId)-['light','detail'].indexOf(b.pairId)),targets:input.targets===undefined?undefined:structuredClone(input.targets)};
 }
 async function composeCore(input,signal){
  const captured=composeInput(input);revision++;const g=revision,adapters=captured.selections.map(selection=>{const r=registrations.get(selection.pairId);return {pairId:selection.pairId,sourceId:r.descriptor.sourceId,plan:buildStandalonePlan({inspection:r.cap.inspection,registry,sourceSha256:r.cap.sourceSha256,strength:selection.strength,loaderPolicyId:LOADER_POLICY_ID,alphaValues:r.alphaValues,...(captured.targets===undefined?{}:{selections:captured.targets})})};});
  const registryHash=await registryHashPromise;guard(g,signal);const coverage=adapters.some(a=>a.plan.coverage==='PARTIAL')?'PARTIAL':'FULL';
  const body={contractVersion:STANDALONE_CONTRACT_VERSION,registry,registryHash,adapters,sdkInstanceId,localRevision:g,side:registry.side,coverage,scope:coverage==='FULL'?'full-adapter':'explicit-projection'};
  const result=freeze({...body,planId:await hashJSON(body)});guard(g,signal);plans.set(result,{g});return result;
 }
 async function compose(input={}){return tracked('compose',input.signal,signal=>composeCore(input,signal));}
 function wrapPrepared(pkg,g,opened=false){
  const manifest=pkg.describe(),result=Object.freeze({contractVersion:STANDALONE_CONTRACT_VERSION,state:'PREPARED',sdkInstanceId,localRevision:g,transactionId:crypto.randomUUID(),planId:manifest.planId,...(opened?{originPlanId:manifest.planId??null}:{}),manifest,handle:pkg});
  packages.set(result,{pkg,g,inUse:false,recovery:null,releasing:null,releaseFailed:false});return result;
 }
 async function prepareCore(plan,signal){
  const state=plans.get(plan);if(!state)throw error('STALE_PLAN','Foreign or stale standalone plan');guard(state.g,signal);
  const sources=new Map([...registrations.values()].map(r=>[r.descriptor.sourceId,r.cap]));let pkg;
  try{pkg=await createOwnedLoraPackage({plan,baseProvider,kernel,sources,cache,signal});guard(state.g,signal);return wrapPrepared(pkg,state.g);}
  catch(cause){if(!pkg)retainErrorRecovery(cause);if(pkg)try{await cleanupSource(pkg);}catch(cleanup){throw new AggregateError([cause,cleanup],'Package prepare and cleanup failed');}throw cause;}
 }
 async function prepare(plan,{signal}={}){return tracked('prepare',signal,s=>prepareCore(plan,s));}
 /** Save only this SDK's current prepared revision. The writer consumes source
  * byte streams and then a durable manifest; no runtime capability is saved. */
 async function save(prepared,options={}){return tracked('save',options.signal,async signal=>{
  keys(options,['writer','signal'],'save options');const state=packages.get(prepared);
  if(!state||state.releasing||state.releaseFailed||state.recovery||state.pkg.isValid()!==true)throw error('STALE_PLAN','Stale or unavailable prepared package for save');guard(state.g,signal);state.inUse=true;
  try{const manifest=await state.pkg.save({writer:options.writer,signal});guard(state.g,signal);return manifest;}finally{state.inUse=false;}
 });}
 /** Reopen durable bytes into fresh local authority. Saved planId/packageHash
  * identify immutable payload only. sdkInstanceId/localRevision/transactionId
  * and the new owned handle govern this transaction; saved handles are rejected.
  * sources maps manifest file names to actual saved File/Blob or retained sources. */
 async function openPackage(input={}){return tracked('openPackage',input.signal,async signal=>{
  keys(input,['manifest','sources','signal'],'open package');
  if(!plain(input.manifest))throw TypeError('Saved package manifest required');
  for(const field of ['handle','handleId','sdkInstanceId','localRevision','transactionId','localInputRevision','localApplicationRevision'])if(Object.hasOwn(input.manifest,field))throw TypeError('Unsupported saved runtime authority field '+field);
  const manifest=structuredClone(input.manifest),sources=input.sources===undefined?new Map():input.sources instanceof Map?new Map(input.sources):plain(input.sources)?new Map(Object.entries(input.sources)):null;
  if(!sources)throw TypeError('Explicit saved payload source map required');
  revision++;const g=revision;const savedRegistry=validateStandaloneRegistry(manifest.registry),registryHash=await registryHashPromise;guard(g,signal);
  if(manifest.side!==registry.side||savedRegistry.side!==registry.side||manifest.registryHash!==registryHash||await hashJSON(savedRegistry)!==registryHash)throw Error('Saved package registry or side identity mismatch');guard(g,signal);
  if(manifest.planId!==undefined&&(typeof manifest.planId!=='string'||!manifest.planId))throw TypeError('Invalid saved payload planId');let pkg;
  try{pkg=await reopenOwnedLoraPackage(manifest,{sources,baseProvider,kernel,cache,signal});guard(g,signal);return wrapPrepared(pkg,g,true);}
  catch(cause){if(!pkg)retainErrorRecovery(cause);if(pkg)try{await cleanupSource(pkg);}catch(cleanup){throw new AggregateError([cause,cleanup],'Package open and cleanup failed');}throw cause;}
 });}
 function receiptMatches(value,ctx,commit=false){return value&&value.contractVersion===STANDALONE_CONTRACT_VERSION&&value.validationMode==='normal'&&['planId','packageHash','registryHash',...(commit?[]:['coverage','scope'])].every(k=>value[k]===ctx[k])&&(!commit||['coverage','scope'].every(k=>value[k]===undefined||value[k]===ctx[k]));}
 async function stageCore(prepared,target,options,signal){
  keys(options,['signal','isCurrent','validationMode'],'stage options');const {isCurrent=()=>true,validationMode='normal'}=options;
  if(validationMode!=='normal')throw error('UNSUPPORTED_VALIDATION_MODE','Standalone stage supports normal validation mode');if(typeof isCurrent!=='function')throw TypeError('isCurrent function required');
  const state=packages.get(prepared);if(!state||state.releasing||state.releaseFailed||state.recovery)throw error('STALE_PLAN','Stale or unavailable prepared package');guard(state.g,signal,isCurrent);
  if(target?.contractVersion!==STANDALONE_CONTRACT_VERSION||!['describe','prepareLoad','validate','commit','rollback'].every(k=>typeof target[k]==='function'))throw TypeError('Versioned standalone consumer required');
  const g=state.g,manifest=prepared.manifest,ctx=Object.freeze({contractVersion:STANDALONE_CONTRACT_VERSION,sdkInstanceId,localRevision:g,transactionId:prepared.transactionId,side:registry.side,planId:prepared.planId,packageHash:manifest.packageHash,registryHash:manifest.registryHash,coverage:manifest.coverage,scope:manifest.scope,validationMode,signal,isCurrent:()=>!disposed&&g===revision&&!signal.aborted&&isCurrent()===true});
  const check=()=>guard(g,signal,isCurrent);state.inUse=true;let candidate;
  try{
   check();const described=validateStandaloneRegistry(await target.describe());check();if(await hashJSON(described)!==manifest.registryHash)throw Error('Standalone consumer registry changed');check();
   candidate=await target.prepareLoad(state.pkg,ctx);check();const raw=await target.validate(candidate,ctx);check();
   if(!receiptMatches(raw,ctx)||raw.valid!==true)throw error('VALIDATION_RECEIPT_INVALID','Structured normal validation receipt mismatch');
   const validation=freeze(structuredClone(raw));if(!receiptMatches(validation,ctx)||validation.valid!==true)throw error('VALIDATION_RECEIPT_INVALID','Stored normal validation receipt mismatch');
   check();const rawReceipt=await target.commit(candidate,ctx);check();
   const rawOwner=rawReceipt?.ownership,owner=rawOwner?{kind:rawOwner.kind,ownerId:rawOwner.ownerId,isValid:typeof rawOwner.isValid==='function'?rawOwner.isValid.bind(rawOwner):undefined}:null;
   const receipt=rawReceipt?{contractVersion:rawReceipt.contractVersion,state:rawReceipt.state,validationMode:rawReceipt.validationMode,planId:rawReceipt.planId,packageHash:rawReceipt.packageHash,registryHash:rawReceipt.registryHash,coverage:rawReceipt.coverage,scope:rawReceipt.scope,epoch:rawReceipt.epoch,ownership:owner}:null;
   if(!receiptMatches(receipt,ctx,true)||receipt.state!=='CONSUMER_APPLIED'||!ownership(receipt.ownership))throw error('COMMIT_RECEIPT_INVALID','Structured consumer commit/ownership receipt mismatch');
   if(!Number.isSafeInteger(receipt.epoch)||receipt.epoch<0||typeof target.currentEpoch==='function'&&receipt.epoch!==target.currentEpoch())throw error('EPOCH_MISMATCH','Consumer commit epoch mismatch');
   const result=freeze({contractVersion:STANDALONE_CONTRACT_VERSION,state:'CONSUMER_APPLIED',sdkInstanceId,localRevision:g,transactionId:prepared.transactionId,side:registry.side,planId:ctx.planId,packageHash:ctx.packageHash,registryHash:ctx.registryHash,coverage:ctx.coverage,scope:ctx.scope,validationMode,consumerEpoch:receipt.epoch,validation,ownership:{kind:owner.kind,ownerId:owner.ownerId},generationReady:false});
   // Capture and recheck all consumer getters before dropping the predecessor.
   // Candidate release is terminal cleanup after the guarded atomic commit.
   check();await target.releaseCandidate?.(candidate,ctx);return result;
  }catch(cause){
   let rolledBack=false;const cleanup=async()=>{if(!rolledBack){await target.rollback(candidate,ctx);rolledBack=true;}await target.releaseCandidate?.(candidate,ctx);};
   try{await cleanup();}catch(cleanupError){state.recovery=cleanup;throw new AggregateError([cause,cleanupError],'Consumer rollback/release failed; recovery required');}throw cause;
  }finally{state.inUse=false;}
 }
 async function stage(prepared,target,options={}){return tracked('stage',options.signal,signal=>stageCore(prepared,target,options,signal));}
 async function release(prepared){const state=packages.get(prepared);if(!state)return;if(state.inUse)throw error('BUSY','Prepared package in use by stage');if(state.recovery)throw error('RECOVERY_REQUIRED','Prepared package recovery required');if(state.releasing)return state.releasing;
  state.releasing=(async()=>{try{await state.pkg.release();packages.delete(prepared);state.releaseFailed=false;}catch(cause){state.releaseFailed=true;throw cause;}finally{state.releasing=null;}})();return state.releasing;
 }
 async function recover(prepared){
  if(operation||maintenance)throw error('BUSY','Standalone task busy until terminal');
  const task={label:'recover',promise:null};let resolve,reject;task.promise=new Promise((done,failed)=>{resolve=done;reject=failed;});maintenance=task;
  const work=(async()=>{try{const entries=prepared===undefined?[...packages]:packages.has(prepared)?[[prepared,packages.get(prepared)]]:[];
   for(const [,state]of entries)if(state.recovery){state.inUse=true;try{await state.recovery();state.recovery=null;}finally{state.inUse=false;}}
   for(const retry of [...pendingCleanup])await retry();for(const [p,state]of entries)if(state.releaseFailed)await release(p);
  }finally{if(maintenance===task)maintenance=null;}})();work.then(resolve,reject);return task.promise;
 }
 async function apply(input={}){
  return tracked('apply',input.signal,async signal=>{keys(input,['selections','targets','target','signal','isCurrent','validationMode'],'apply');let prepared,result,cause;
   const captured={selections:structuredClone(input.selections),targets:input.targets===undefined?undefined:structuredClone(input.targets),target:input.target,isCurrent:input.isCurrent,validationMode:input.validationMode};
   try{const plan=await composeCore({selections:captured.selections,...(captured.targets===undefined?{}:{targets:captured.targets})},signal);prepared=await prepareCore(plan,signal);result=await stageCore(prepared,captured.target,{isCurrent:captured.isCurrent,validationMode:captured.validationMode},signal);}catch(e){cause=e;}
   if(prepared&&!packages.get(prepared)?.recovery)try{await release(prepared);}catch(cleanup){cause=cause?new AggregateError([cause,cleanup],'Apply and package release failed'):cleanup;}
   if(cause)throw cause;return result;
  });
 }
 async function restoreBase(input={}){keys(input,['target','signal','isCurrent','validationMode'],'restore base');return apply({...input,selections:[]});}
 function inspect(){return freeze({contractVersion:STANDALONE_CONTRACT_VERSION,side:registry.side,sources:[...registrations.values()].map(r=>r.descriptor)});}
 function stats(){return freeze({side:registry.side,localRevision:revision,busy:operation!==null||maintenance!==null,operation:operation?.label??maintenance?.label??null,disposed,registeredSources:registrations.size,preparedPackages:packages.size,recoveryRequired:recoveryRequired()});}
 function capabilities(){return freeze({contractVersion:STANDALONE_CONTRACT_VERSION,side:registry.side,operations:['register','compose','prepare','save','openPackage','stage','apply','restoreBase','cancel','release','recover','dispose'],pairIds:['light','detail'],loaderPolicyId:LOADER_POLICY_ID,variants:LOADER_VARIANTS,maxBlockElements:MAX_OWNED_BLOCK_ELEMENTS,independentExpectedRequired:false,graphBinding:'UNBOUND'});}
 function dispose(){if(disposal)return disposal;cancel();disposed=true;disposal=(async()=>{if(operation)await operation.promise.catch(()=>{});if(maintenance)await maintenance.promise.catch(()=>{});await recover();const errors=[];for(const p of [...packages.keys()])try{await release(p);}catch(e){errors.push(e);}for(const [id,r]of [...registrations])try{await cleanupSource(r.cap,()=>{if(registrations.get(id)===r)registrations.delete(id);});}catch(e){errors.push(e);}if(errors.length)throw new AggregateError(errors,'Standalone resources retained; retry recovery/disposal');})();disposal.catch(()=>{disposal=null;});return disposal;}
 return Object.freeze({contractVersion:STANDALONE_CONTRACT_VERSION,sdkInstanceId,register,compose,prepare,save,openPackage,stage,apply,restoreBase,cancel,release,recover,inspect,stats,capabilities,dispose});
}

import {createKernel} from './kernel/host.mjs';
import {inspectSafetensors,readTensor} from './safetensors.mjs';
import {freeze,sha256} from './planner.mjs';
import {CONTRACT_VERSION,validateRegistryV2,buildPlanV2} from './planner-v2.mjs';

export {CONTRACT_VERSION};
const HEX=/^[a-f0-9]{64}$/;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
// Native v2 JSON identity. This is not a management snapshot/hash implementation.
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
const hashJSON=value=>sha256(new TextEncoder().encode(JSON.stringify(ordered(value))));
const failure=(code,message)=>Object.assign(new Error(message),{code});
const validOwnership=o=>o&&typeof o.ownerId==='string'&&o.ownerId.length>0&&(o.kind==='independent-copy'||o.kind==='lease'&&typeof o.isValid==='function'&&o.isValid()===true);

/** Native v2 weight transform. No management snapshot or Diffusion executor import. */
export async function createLoraV2({folder,sourceFactory,kernel:providedKernel}={}) {
 if(!folder&&typeof sourceFactory!=='function')throw TypeError('Local folder or explicit sourceFactory required');
 const kernel=providedKernel??await createKernel(),sdkInstanceId=crypto.randomUUID();
 let generation=0,disposed=false,active=null,operation=null,disposal=null;
 const plans=new WeakMap(),packages=new Map(),pendingAborts=new Set();
 function live(){if(disposed)throw failure('DISPOSED','LoRA v2 module disposed');}
 function cancel(){generation++;active?.abort(failure('CANCELLED','LoRA operation cancelled'));active=null;}
 function guard(g,signal,current){live();signal?.throwIfAborted();if(g!==generation)throw failure('STALE_PLAN','Stale/cancelled LoRA plan');if(current&&current()!==true)throw failure('STALE_CONTEXT','External context is not current');}
 function selected(s){if(!s||typeof s.pairId!=='string'||!s.pairId||!['high','low'].includes(s.noise))throw TypeError('Explicit pairId and high/low side required');return freeze(structuredClone(s));}
 function inputSource(selection){if(folder){const p=folder.getPair(selection.pairId);if(!p)throw Error('Unknown folder pair');return p[selection.noise].source;}return sourceFactory(selection);}
 async function tracked(fn){live();if(operation)throw failure('BUSY','LoRA transaction already running');if(pendingAborts.size)throw failure('RECOVERY_REQUIRED','Sink cleanup recovery required');const p=fn();operation=p;try{return await p;}finally{if(operation===p)operation=null;}}
 async function inspect(selection,{signal}={}) {live();selection=selected(selection);const source=inputSource(selection);if(!source||typeof source.read!=='function')throw TypeError('Invalid source');const inspection=await inspectSafetensors(source,{signal});signal?.throwIfAborted();live();return freeze({contractVersion:CONTRACT_VERSION,state:'SOURCE_INSPECTED',selection,tensors:inspection.tensors,tensorCount:Object.keys(inspection.tensors).length,sourceSha256:null,integrity:'header-only',generationReady:false});}
 async function plan(input) {
  live();cancel();const g=generation;
  // Capture identities before any user-controlled asynchronous read/hash.
  const selection=selected(input.selection),registry=validateRegistryV2(input.registry),strength=input.strength,loaderPolicyId=input.loaderPolicyId,diagnostic=input.diagnostic===undefined?undefined:structuredClone(input.diagnostic);
  return tracked(async()=>{
   if(registry.side!==selection.noise.toUpperCase())throw Error('Registry side differs from source selection');
   const controller=new AbortController();active=controller;
   try{
    const source=inputSource(selection);if(typeof source?.hash!=='function')throw Error('Verified whole-source hash function required');
    const inspection=await inspectSafetensors(source,{signal:controller.signal});guard(g,controller.signal);
    const alphaValues={};for(const [name,tensor]of Object.entries(inspection.tensors))if(name.endsWith('.alpha')){const raw=await readTensor(source,inspection,name,{signal:controller.signal});guard(g,controller.signal);if(tensor.shape.length!==0)throw Error('Alpha must be a scalar');alphaValues[name]=kernel.decode(raw,tensor.dtype)[0];}
    const sourceSha256=await source.hash({signal:controller.signal});guard(g,controller.signal);if(!HEX.test(sourceSha256))throw Error('Verified source SHA-256 required');
    const core=buildPlanV2({inspection,registry,diagnostic,sourceSha256,strength,loaderPolicyId,alphaValues});
    const registryHash=await hashJSON(core.registry),identity={contractVersion:CONTRACT_VERSION,sdkInstanceId,localInputRevision:g,localApplicationRevision:g,selection,strength,sourceSha256,registryHash,loaderPolicyId,coverage:core.coverage,diagnostic:diagnostic??null,buildId:kernel.info.wasmSha256};
    const planId=await hashJSON(identity);guard(g,controller.signal);
    const result=freeze({...core,...identity,scope:core.coverage==='PARTIAL'?'diagnostic-projection':'full-adapter',planId,generationReady:false});
    plans.set(result,{source,inspection,g});return result;
   }finally{if(active===controller)active=null;}
  });
 }
 async function prepare(plan,{baseProvider,sink,blockRows=16,signal}={}) {return tracked(async()=>{
  const state=plans.get(plan);if(!state||state.g!==generation)throw Error('Stale or foreign plan');
  if(typeof baseProvider?.readBlock!=='function'||!['begin','writeBlock','finish','abort','release'].every(k=>typeof sink?.[k]==='function'))throw TypeError('Transactional base provider and sink required');
  if(!Number.isInteger(blockRows)||blockRows<1||blockRows>256)throw RangeError('Invalid blockRows');
  const controller=new AbortController(),g=state.g;active=controller;const abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const check=()=>guard(g,controller.signal);
  const manifest={contractVersion:CONTRACT_VERSION,state:'PREPARED',sdkInstanceId,planId:plan.planId,localInputRevision:g,localApplicationRevision:g,jobId:crypto.randomUUID(),sourceSha256:plan.sourceSha256,registryHash:plan.registryHash,modelHash:plan.registry.modelHash,graphHash:plan.registry.graphHash,registryVersion:plan.registry.registryVersion,side:plan.registry.side,executionProfileId:plan.registry.executionProfileId,selection:plan.selection,strength:plan.strength,loaderPolicyId:plan.loaderPolicyId,coverage:plan.coverage,scope:plan.scope,completeAdapter:plan.completeAdapter,includedPatches:plan.includedPatches,excludedTargets:plan.excludedTargets,excludedRegions:plan.excludedRegions,kernel:kernel.info,buildId:plan.buildId,blocks:[],complete:false,generationReady:false};
  let begun=false,result;
  try{
   check();begun=true;await sink.begin(freeze({...manifest,blocks:[]}));check();
   for(const op of plan.operations){
    const cols=op.fullShape.length===2?op.fullShape[1]:1,end=op.slice.startRow+op.slice.rowCount,step=Math.min(blockRows,Math.max(1,Math.floor(4_000_000/(cols*(op.rank??1)))));
    let down;if(op.kind==='lora'){const raw=await readTensor(state.source,state.inspection,op.downName,{signal:controller.signal});check();down=kernel.decode(raw,state.inspection.tensors[op.downName].dtype);}
    for(let row=op.slice.startRow;row<end;row+=step){
     check();const rows=Math.min(step,end-row),offset=row*cols,count=rows*cols;
     const base=await baseProvider.readBlock(op.target.weightId,offset,count,{signal:controller.signal,modelHash:manifest.modelHash,graphHash:manifest.graphHash,registryHash:manifest.registryHash,fullShape:op.fullShape,side:manifest.side,executionProfileId:manifest.executionProfileId});check();
     if(!(base instanceof Float32Array)||base.length!==count)throw Error('Base provider returned wrong block');
     let data;
     if(op.kind==='lora'){const raw=await readTensor(state.source,state.inspection,op.upName,{elementOffset:row*op.rank,elementCount:rows*op.rank,signal:controller.signal});check();const up=kernel.decode(raw,state.inspection.tensors[op.upName].dtype);data=kernel.merge({base,down,up,rows,cols,rank:op.rank,scale:op.scale});}
     else{const raw=await readTensor(state.source,state.inspection,op.deltaName,{elementOffset:offset,elementCount:count,signal:controller.signal});check();data=kernel.add({base,delta:kernel.decode(raw,state.inspection.tensors[op.deltaName].dtype),scale:op.scale});}
     check();const entry={key:op.key,weightId:op.target.weightId,binding:op.target.binding,parameterRole:op.target.parameterRole,offset,count,fullShape:op.fullShape,slice:{startRow:row,rowCount:rows},dtype:'F32',sha256:await sha256(new Uint8Array(data.buffer,data.byteOffset,data.byteLength))};check();await sink.writeBlock({...entry,data});check();manifest.blocks.push(entry);await tick();
    }
   }
   check();manifest.complete=true;manifest.bundleHash=await hashJSON(manifest);check();const finalManifest=freeze(manifest),handle=await sink.finish(finalManifest);
   if(handle==null)throw Error('Sink did not return prepared handle');
   result=Object.freeze({state:'PREPARED',manifest:finalManifest,handle});packages.set(result,{sink,g,plan,inUse:false,releasing:null,ownership:null,recovery:null});check();return result;
  }catch(error){const cleanup=[];if(result)try{await release(result);}catch(e){cleanup.push(e);}if(begun)try{await sink.abort(error);}catch(e){cleanup.push(e);const retry=async()=>{await sink.abort(error);pendingAborts.delete(retry);};pendingAborts.add(retry);}if(cleanup.length)throw new AggregateError([error,...cleanup],'Prepare and cleanup failed; retry recover/disposal');throw error;}
  finally{signal?.removeEventListener('abort',abort);if(active===controller)active=null;}
 });}
 async function stage(prepared,target,{signal,isCurrent=()=>true}={}) {return tracked(async()=>{
  const s=packages.get(prepared);if(!s||s.g!==generation||s.releasing||s.recovery)throw Error('Stale, releasing or recovery-required prepared handle');
  if(s.ownership?.kind==='lease'&&s.ownership.isValid()===true)throw Error('Prepared handle already leased');
  if(target?.contractVersion!==CONTRACT_VERSION||!['describe','prepareLoad','validate','commit','rollback'].every(k=>typeof target[k]==='function'))throw Error('Versioned consumer contract required');
  s.inUse=true;const g=s.g,controller=new AbortController();active=controller;const abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const context=Object.freeze({...prepared.manifest,signal:controller.signal,isCurrent:()=>!disposed&&generation===g&&!controller.signal.aborted&&isCurrent()===true});const check=()=>guard(g,controller.signal,isCurrent);let candidate;
  try{
   check();const described=validateRegistryV2(await target.describe());check();if(await hashJSON(described)!==prepared.manifest.registryHash)throw Error('Consumer registry identity changed');check();
   candidate=await target.prepareLoad(prepared.handle,context);check();const v=await target.validate(candidate,context);check();
   if(!v||v.contractVersion!==CONTRACT_VERSION||v.valid!==true||['coverage','scope','planId','registryHash','sourceSha256'].some(k=>v[k]!==context[k]))throw Error('Structured consumer validation scope/identity mismatch');
   const validation=freeze(structuredClone(v));
   // Consumer must repeat this check at its actual atomic publication boundary.
   check();const receipt=await target.commit(candidate,context);check();
   if(!receipt||receipt.contractVersion!==CONTRACT_VERSION||!['STAGED','CONSUMER_APPLIED'].includes(receipt.state)||receipt.planId!==context.planId||!validOwnership(receipt.ownership))throw Error('Consumer receipt/state/ownership invalid');
   const {kind,ownerId,isValid}=receipt.ownership;
   s.ownership=Object.freeze(kind==='lease'?{kind,ownerId,isValid:isValid.bind(receipt.ownership)}:{kind,ownerId});
   return freeze({contractVersion:CONTRACT_VERSION,state:receipt.state,sdkInstanceId,localInputRevision:g,localApplicationRevision:g,selection:context.selection,sourceSha256:context.sourceSha256,planId:context.planId,registryHash:context.registryHash,bundleHash:context.bundleHash,coverage:context.coverage,scope:context.scope,validation,ownership:{kind:receipt.ownership.kind,ownerId:receipt.ownership.ownerId},snapshotPublished:false,generationReady:false});
  }catch(error){try{await target.rollback(candidate,context);s.ownership=null;}catch(rollbackError){s.recovery=()=>target.rollback(candidate,context);throw new AggregateError([error,rollbackError],'Consumer rollback failed; recovery required');}throw error;}
  finally{s.inUse=false;signal?.removeEventListener('abort',abort);if(active===controller)active=null;}
 });}
 async function recover(prepared){if(operation)throw Error('LoRA transaction already running');for(const retry of [...pendingAborts])await retry();const s=packages.get(prepared);if(!s?.recovery)return;if(s.inUse||s.releasing)throw Error('Prepared package in use');s.inUse=true;try{await s.recovery();s.recovery=null;s.ownership=null;}finally{s.inUse=false;}}
 async function release(prepared){const s=packages.get(prepared);if(!s)return;if(s.inUse)throw Error('Prepared package in use by transaction');if(s.recovery)throw Error('Recovery required before release');if(s.ownership?.kind==='lease'&&s.ownership.isValid()!==false)throw Error('Prepared bytes retained by active lease');if(s.releasing)return s.releasing;s.releasing=(async()=>{await s.sink.release(prepared.handle);packages.delete(prepared);})();try{await s.releasing;}finally{s.releasing=null;}}
 function dispose(){if(disposal)return disposal;cancel();disposed=true;disposal=(async()=>{if(operation)await operation.catch(()=>{});const cleanups=await Promise.allSettled([...pendingAborts].map(retry=>retry()));const results=[...cleanups,...await Promise.allSettled([...packages.keys()].map(release))];if(results.some(r=>r.status==='rejected')){disposal=null;throw new AggregateError(results.filter(r=>r.status==='rejected').map(r=>r.reason),'Prepared resources retained; recover/end lease and retry dispose');}if(!providedKernel)kernel.dispose();})();return disposal;}
 return Object.freeze({contractVersion:CONTRACT_VERSION,sdkInstanceId,kernelInfo:kernel.info,inspect,plan,prepare,stage,cancel,release,recover,dispose});
}

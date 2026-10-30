import { LORA_CATALOG } from './catalog.mjs';
import { createHttpSource } from './sources.mjs';
import { inspectSafetensors, readTensor } from './safetensors.mjs';
import { createKernel } from './kernel/host.mjs';
import { freeze, objectHash, sha256, validateTarget, mapOperations, analyze } from './planner.mjs';
export const API_VERSION=1;
const yieldTask=()=>new Promise(r=>setTimeout(r,0));
export async function createLora({folder,catalog=LORA_CATALOG,sourceFactory=createHttpSource,kernel:providedKernel}={}){
 const kernel=providedKernel??await createKernel();let disposed=false,generation=0,active=null,busy=false,operation=null,disposal=null;const plans=new WeakMap(),prepared=new Map();
 function live(){if(disposed)throw Error('LoRA module disposed');}
 function check(g,signal){live();signal?.throwIfAborted();if(g!==generation)throw Error('Stale/cancelled LoRA application');}
 function cancel(){generation++;active?.abort(new Error('LoRA operation cancelled'));active=null;}
 function descriptor(selection){
  if(!selection||!['high','low'].includes(selection.noise))throw Error('Invalid High/Low selection');
  if(folder){const pair=folder.getPair(selection.pairId??selection.category);if(!pair)throw Error('Unknown folder pair');return pair[selection.noise];}
  const d=catalog[selection.category]?.[selection.noise];if(!d)throw Error('Unknown source category');return d;
 }
 async function inspectInternal(selection,signal){selection=freeze(structuredClone(selection));live();const d=descriptor(selection);if(!d.source&&!d.url)throw Error('Administrator source not configured');const source=d.source??sourceFactory(d);if(source.size!== (d.source?.size??d.size))throw Error('Source size mismatch');const inspection=await inspectSafetensors(source,{signal});signal?.throwIfAborted();const analysis=analyze(inspection);return {source,inspection,report:freeze({selection:structuredClone(selection),fileName:d.fileName,size:source.size,containerFormat:'safetensors',tensorCount:Object.keys(inspection.tensors).length,tensors:inspection.tensors,metadata:inspection.metadata,unknownTensors:analysis.unknown,sourceSha256:d.sha256??null,integrity:'header-and-range-validated; whole-file-hash-not-verified',baseCompatibility:'requires-explicit-target-registry'})};}
 async function inspect(selection,{signal}={}){return (await inspectInternal(selection,signal)).report;}
 async function plan({selection,strength,target,onHashProgress}){
  selection=freeze(structuredClone(selection));
  live();if(!Number.isFinite(strength)||!Number.isFinite(Math.fround(strength)))throw Error('Invalid strength');
  cancel();const g=generation,controller=new AbortController();active=controller;const registry=validateTarget(target);
  const input=await inspectInternal(selection,controller.signal);check(g,controller.signal);const operations=mapOperations(input.inspection,registry);
  if(input.source.hash){const digest=await input.source.hash({signal:controller.signal,onProgress:onHashProgress});check(g,controller.signal);input.report=freeze({...input.report,sourceSha256:digest,integrity:"whole-file-sha256-verified; header-and-ranges-validated"});}
  for(const o of operations)if(o.kind==='lora'){
   const alpha=o.alphaName?kernel.decode(await readTensor(input.source,input.inspection,o.alphaName,{signal:controller.signal}),input.inspection.tensors[o.alphaName].dtype)[0]:null;
   if(alpha!==null&&!Number.isFinite(alpha))throw Error('Invalid alpha');o.alpha=alpha;o.scale=strength*(alpha===null?1:alpha/o.rank);
  }else o.scale=strength;
  check(g,controller.signal);
  const registryHash=await objectHash(registry),adapterSetHash=await objectHash({selection,strength,header:input.inspection.tensors,source:input.report.sourceSha256});
  const identity={apiVersion:1,buildId:kernel.info.wasmSha256,applicationRevision:g,inputRevision:g,modelHash:registry.modelHash,graphHash:registry.graphHash,adapterSetHash,registryHash,registryVersion:registry.registryVersion};
  const publicPlan=freeze({...identity,planId:await objectHash(identity),selection:structuredClone(selection),strength,operations:structuredClone(operations),tensorCount:input.report.tensorCount,source:input.report});
  check(g,controller.signal);plans.set(publicPlan,{...input,registry,operations,g});return publicPlan;
 }
 async function prepare(p,{baseProvider,sink,blockRows=16,signal}={}){
  live();const state=plans.get(p);if(!state||state.g!==generation)throw Error('Stale or foreign plan');if(busy)throw Error('LoRA preparation already running');
  if(typeof baseProvider?.readBlock!=='function'||!['begin','writeBlock','finish','abort','release'].every(k=>typeof sink?.[k]==='function'))throw Error('Transactional base provider and sink required');
  if(!Number.isInteger(blockRows)||blockRows<1||blockRows>256)throw Error('Invalid blockRows');
  busy=true;const controller=new AbortController(),g=state.g;active=controller;const abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const guard=()=>check(g,controller.signal);
  const manifest={apiVersion:1,buildId:p.buildId,planId:p.planId,jobId:crypto.randomUUID(),inputRevision:p.inputRevision,applicationRevision:p.applicationRevision,modelHash:p.modelHash,graphHash:p.graphHash,adapterSetHash:p.adapterSetHash,registryVersion:p.registryVersion,registryHash:p.registryHash,kernel:kernel.info,selection:p.selection,strength:p.strength,sourceIntegrity:p.source.integrity,sourceSha256:p.source.sourceSha256,blocks:[],complete:false};
  let begun=false,handle,finished=false;
  try{
   guard();begun=true;await sink.begin(freeze({...manifest,blocks:[]}));guard();
   for(const op of state.operations){
    const shape=op.target.shape,cols=shape.length===2?shape[1]:1,rows=shape[0];
    // Bound each synchronous WASM call by both workspace and multiply-add count.
    const step=Math.min(blockRows,Math.max(1,Math.floor(4_000_000/(cols*(op.rank??1)))));
    let down=null;
    if(op.kind==='lora'){
     const raw=await readTensor(state.source,state.inspection,op.downName,{signal:controller.signal});guard();down=kernel.decode(raw,state.inspection.tensors[op.downName].dtype);
    }
    for(let row=0;row<rows;row+=step){
     guard();const count=Math.min(step,rows-row),offset=row*cols,n=count*cols;
     const base=await baseProvider.readBlock(op.target.weightId,offset,n,{signal:controller.signal,modelHash:p.modelHash,graphHash:p.graphHash});guard();
     if(!(base instanceof Float32Array)||base.length!==n)throw Error('Base provider returned wrong block');
     let data;
     if(op.kind==='lora'){
      const raw=await readTensor(state.source,state.inspection,op.upName,{elementOffset:row*op.rank,elementCount:count*op.rank,signal:controller.signal});guard();
      const up=kernel.decode(raw,state.inspection.tensors[op.upName].dtype);data=kernel.merge({base,down,up,rows:count,cols,rank:op.rank,scale:op.scale});
     }else{
      const raw=await readTensor(state.source,state.inspection,op.deltaName,{elementOffset:offset,elementCount:n,signal:controller.signal});guard();const delta=kernel.decode(raw,state.inspection.tensors[op.deltaName].dtype);data=kernel.add({base,delta,scale:op.scale});
     }
     guard();const entry={weightId:op.target.weightId,graphInitializer:op.target.graphInitializer,offset,count:n,shape:op.target.shape,dtype:'F32',sha256:await sha256(new Uint8Array(data.buffer,data.byteOffset,data.byteLength))};guard();
     await sink.writeBlock({...entry,data});guard();manifest.blocks.push(entry);await yieldTask();
    }
   }
   guard();manifest.complete=true;manifest.bundleHash=await objectHash(manifest);const frozen=freeze(manifest);handle=await sink.finish(frozen);finished=true;guard();if(handle==null)throw Error('Sink did not return a prepared package');
   const result=Object.freeze({manifest:frozen,handle});prepared.set(result,{sink,g,registry:state.registry});return result;
  }catch(e){if(finished&&handle!=null)await sink.release(handle);if(begun)await sink.abort(e);throw e;}
  finally{busy=false;signal?.removeEventListener('abort',abort);if(active===controller)active=null;}
 }
 function consumer(t,base=false){if(!['describe',base?'prepareBase':'prepareLoad','validate','commit','rollback'].every(k=>typeof t?.[k]==='function'))throw Error('Consumer transaction API incomplete');}
 async function apply(p,target){
  live();const s=prepared.get(p);if(!s||s.g!==generation||s.releasing)throw Error('Stale, releasing or foreign prepared package');consumer(target);s.inUse=true;const g=s.g,controller=new AbortController();active=controller;let candidate;
  const context={...p.manifest,signal:controller.signal,isCurrent:()=>!disposed&&generation===g&&!controller.signal.aborted};
  try{check(g,controller.signal);if(await objectHash(validateTarget(await target.describe()))!==p.manifest.registryHash)throw Error('Target registry identity changed');check(g,controller.signal);candidate=await target.prepareLoad(p.handle,context);check(g,controller.signal);if(await target.validate(candidate,context)!==true)throw Error('Consumer validation failed');check(g,controller.signal);await target.commit(candidate,context);check(g,controller.signal);return freeze({applicationRevision:g,selection:p.manifest.selection,bundleHash:p.manifest.bundleHash});}
  catch(e){await target.rollback(candidate,context);throw e;}finally{s.inUse=false;if(active===controller)active=null;}
 }
 async function detach(target){live();consumer(target,true);cancel();const g=generation,controller=new AbortController();active=controller;const context={apiVersion:1,applicationRevision:g,signal:controller.signal,isCurrent:()=>!disposed&&generation===g&&!controller.signal.aborted,selection:null};let candidate;try{candidate=await target.prepareBase(context);check(g,controller.signal);if(await target.validate(candidate,context)!==true)throw Error('Consumer base validation failed');check(g,controller.signal);await target.commit(candidate,context);check(g,controller.signal);return freeze({applicationRevision:g,selection:null});}catch(e){await target.rollback(candidate,context);throw e;}finally{if(active===controller)active=null;}}
 async function release(p){
  const s=prepared.get(p);if(!s)return;if(s.inUse)throw Error('Prepared package in use by consumer transaction');
  if(s.releasing)return s.releasing;
  s.releasing=(async()=>{await s.sink.release(p.handle);prepared.delete(p);})();
  try{await s.releasing;}finally{s.releasing=null;}
 }
 function tracked(fn){return async(...args)=>{live();if(operation)throw Error('LoRA transaction already running');const promise=fn(...args);operation=promise;try{return await promise;}finally{if(operation===promise)operation=null;}};}
 function dispose(){
  if(disposal)return disposal;
  cancel();disposed=true;
  disposal=(async()=>{if(operation)await operation.catch(()=>{});const results=await Promise.allSettled([...prepared.keys()].map(release));if(!providedKernel)kernel.dispose();if(results.some(r=>r.status==='rejected')){disposal=null;throw Error('Prepared package release failed; retry release/dispose');}})();
  return disposal;
 }
 return Object.freeze({apiVersion:1,inspect,plan,prepare:tracked(prepare),apply:tracked(apply),detach:tracked(detach),cancel,release,dispose,kernelInfo:kernel.info});
}

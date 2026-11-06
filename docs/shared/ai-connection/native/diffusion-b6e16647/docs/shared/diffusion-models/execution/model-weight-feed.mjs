import {MODEL_WEIGHT_LIMITS} from './model-weights.mjs';
import {createFullModelWeightBindings,STANDALONE_CONTRACT_VERSION,clone,equal,hashMetadata,ownedF32,weightError} from './model-weight-bindings.mjs';

const SHA=/^[a-f0-9]{64}$/;
const PKG_VERSION='lora-owned-package/0.1-draft.1';
const MAX_PACKAGE_READ_ELEMENTS=1048576,MAX_CANDIDATES=4,MAX_LEASES=16;
const CTX=['contractVersion','sdkInstanceId','localRevision','transactionId','side','planId','packageHash','registryHash','coverage','scope','validationMode'];
const abort=s=>s?.throwIfAborted();

/** Full-model final-F32 consumer. Low-rank products remain package-owner work.
 * Original storage and operator owners remain caller-owned. No dense package
 * residency, independent expected output or forward executor is required. */
export async function createFullModelWeightFeed({source:base,registry,side}={}){
 const binding=await createFullModelWeightBindings({source:base,registry,side}),{original,registry:logical,registryHash,bindingDescriptor}=binding;
 const targets=new Map(logical.targets.map(t=>[t.weightId,t]));
 let epoch=0,active=null,disposed=false,closing=false,operations=0,baseTail=Promise.resolve(),disposeTask=null;
 let validatedElements=0,effectiveReadBytes=0,baseReadBytes=0,packageReadBytes=0;
 const candidates=new WeakMap(),candidateRecords=new Set(),views=new Set(),inFlight=new Set(),cleanupPending=new Set(),clearPending=new Set();
 const live=()=>{if(disposed||closing)throw weightError('DISPOSED','Full-model weight feed disposed or closing');if(base.stats()?.disposed===true)throw weightError('BASE_DISPOSED','Immutable original base disposed');};
 const track=fn=>{const promise=(async()=>fn())();inFlight.add(promise);promise.finally(()=>inFlight.delete(promise)).catch(()=>{});return promise;};
 const stableBase={modelHash:original.modelHash,side:original.side,registryHash,headerSHA256:original.headerSHA256,fileBytes:original.fileBytes,fp8DecodeProfile:'original-F16-or-scaled-e4m3fn-scalar-f32-v1',fullFileSHA256Verified:original.fullFileSHA256Verified===true};
 const desc=(at=epoch,record=active)=>({...clone(original),weightEpoch:at,packageHash:record?.manifest.packageHash??null,weightFeed:{epoch:at,packageHash:record?.manifest.packageHash??null,kind:record?'owned-completed-final-f32':'immutable-original-base'},canonicalLoraAdapterExtension:'FULL_MODEL_NATIVE_BINDING'});
 function rowRange(id,offset,count,{logicalOnly=false,maxElements=MAX_PACKAGE_READ_ELEMENTS}={}){
  const entry=original.entries[id];if(!entry||(logicalOnly&&!targets.has(id)))throw RangeError('Unregistered full-model weight target');
  const total=entry.fullShape.reduce((a,b)=>a*b,1),cols=entry.columns??1;
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||offset<0||count<1||offset>total-count||count>maxElements||offset%cols||count%cols)throw RangeError('Full-model weight row/range/budget mismatch');
  return {entry,cols};
 }
 function boundedBase(id,offset,count,{signal}={}){return track(async()=>{
  const {entry,cols}=rowRange(id,offset,count);live();abort(signal);let unlock;
  const prior=baseTail;baseTail=new Promise(r=>{unlock=r;});await prior;
  try{live();abort(signal);const output=new Float32Array(count);let at=0;
   while(at<count){live();abort(signal);const take=entry.columns?Math.min(count-at,(entry.maxRows??MODEL_WEIGHT_LIMITS.maxRows)*cols,Math.floor(MODEL_WEIGHT_LIMITS.maxBlockElements/cols)*cols):Math.min(count-at,MODEL_WEIGHT_LIMITS.maxBlockElements);
    const result=entry.columns?await base.readRows(id,(offset+at)/cols,take/cols,{signal,diagnostics:false}):await base.readVector(id,offset+at,take,{signal,diagnostics:false});live();abort(signal);output.set(ownedF32(result.values,take),at);at+=take;baseReadBytes+=take*4;
   }return output;
  }finally{unlock();}
 });}
 const baseProvider=Object.freeze({describe(){live();return clone(stableBase);},async readBlock(id,offset,count,context={}){
  live();if(context.modelHash!==stableBase.modelHash||context.side!==stableBase.side||context.registryHash!==registryHash||!equal(context.fullShape,targets.get(id)?.fullShape))throw weightError('BASE_IDENTITY_MISMATCH','Immutable base identity/full shape mismatch');rowRange(id,offset,count,{logicalOnly:true});return boundedBase(id,offset,count,context);
 }});
 function context(value){
  if(!value||value.contractVersion!==STANDALONE_CONTRACT_VERSION||value.validationMode!=='normal'||typeof value.sdkInstanceId!=='string'||!value.sdkInstanceId||!Number.isSafeInteger(value.localRevision)||value.localRevision<0||typeof value.transactionId!=='string'||!value.transactionId||typeof value.isCurrent!=='function')throw TypeError('Explicit normal standalone transaction context required');
  return Object.fromEntries(CTX.map(k=>[k,value[k]]));
 }
 function guard(value,expected){live();if(clearPending.size)throw weightError('RECOVERY_REQUIRED','Retry clear or dispose before another weight transaction');context(value);abort(value.signal);if(value.isCurrent()!==true)throw weightError('STALE_CONTEXT','Full-model weight transaction no longer current');if(expected&&!equal(context(value),expected))throw weightError('TRANSACTION_MISMATCH','Full-model candidate transaction identity mismatch');}
 function idle(){if(operations)throw weightError('WEIGHT_OPERATION_ACTIVE','A model operation holds the current weight epoch');}
 function state(value){const c=candidates.get(value);if(!c||c.released)throw weightError('INVALID_CANDIDATE','Foreign or released full-model weight candidate');return c;}
 const validPackage=p=>p&&['describe','readBlock','retain','isValid','release'].every(k=>typeof p[k]==='function')&&p.isValid()===true;
 async function retain(pkg,ownerId){if(!validPackage(pkg))throw TypeError('Owned valid final-F32 package capability required');const cap=await pkg.retain(ownerId);if(!validPackage(cap))throw TypeError('Retained final-F32 package capability required');return cap;}
 function packageCurrent(c){if(!validPackage(c.lease)||!equal(c.lease.describe(),c.manifest))throw weightError('PACKAGE_CHANGED','Completed package identity/lifetime changed');}
 async function releaseCap(cap){if(!cap)return;try{await cap.release();cleanupPending.delete(cap);}catch(error){cleanupPending.add(cap);throw error;}}
 function selectedRanges(manifest){
  if(!Array.isArray(manifest.selectedTargets))throw TypeError('Explicit completed package selected ranges required');const seen=new Set(),ranges=[];
  for(const selected of manifest.selectedTargets){const target=targets.get(selected.weightId);if(!target||seen.has(selected.weightId)||selected.key!==target.key||!equal(selected.fullShape,target.fullShape)||!Array.isArray(selected.ranges)||selected.ranges.length<1)throw TypeError('Completed package target/full shape mismatch');seen.add(selected.weightId);const cols=target.fullShape.length===2?target.fullShape[1]:1;let previousEnd=-1;
   for(const r of selected.ranges){const offset=r.startRow*cols,count=r.rowCount*cols;rowRange(selected.weightId,offset,count,{logicalOnly:true,maxElements:Number.MAX_SAFE_INTEGER});if(!Number.isSafeInteger(r.startRow)||!Number.isSafeInteger(r.rowCount)||r.rowCount<1||r.startRow<previousEnd)throw RangeError('Completed package selected range overlap/order');previousEnd=r.startRow+r.rowCount;ranges.push({weightId:selected.weightId,offset,count,cols});}
  }return ranges;
 }
 async function inspect(pkg,ctx){
  if(!validPackage(pkg))throw TypeError('Owned final-F32 package required');const manifest=clone(pkg.describe()),{packageHash,...body}=manifest;
  if(manifest.packageVersion!==PKG_VERSION||manifest.contractVersion!==STANDALONE_CONTRACT_VERSION||manifest.side!==original.side||manifest.registryHash!==registryHash||!equal(manifest.registry,logical)||!equal(manifest.baseIdentity,stableBase)||!SHA.test(packageHash)||await hashMetadata(body)!==packageHash||manifest.generationReady!==false||!['FULL','PARTIAL'].includes(manifest.coverage)||typeof manifest.scope!=='string'||manifest.loaderPolicyId!==logical.loaderPolicyId)throw weightError('PACKAGE_IDENTITY_MISMATCH','Completed package base/registry/hash identity mismatch');
  if(['planId','packageHash','registryHash','side','coverage','scope'].some(k=>ctx[k]!==manifest[k]))throw weightError('TRANSACTION_MISMATCH','Completed package transaction identity mismatch');
  return {manifest,ranges:selectedRanges(manifest)};
 }
 function hasPatch(record,id,offset,count){return record?.ranges.some(r=>r.weightId===id&&r.offset<offset+count&&offset<r.offset+r.count);}
 function reader(record,at,valid){
  const read=(id,start,count,row,options={})=>track(async()=>{valid();abort(options.signal);const entry=original.entries[id];if(!entry||Boolean(entry.columns)!==row)throw RangeError('Full-model reader binding mismatch');const offset=start*(row?entry.columns:1),elements=count*(row?entry.columns:1);rowRange(id,offset,elements,{maxElements:MODEL_WEIGHT_LIMITS.maxBlockElements});if(row&&count>entry.maxRows)throw RangeError('Full-model reader bounded rows');
   const values=await boundedBase(id,offset,elements,options);
   if(hasPatch(record,id,offset,elements)){packageCurrent(record);for(const r of record.ranges){if(r.weightId!==id)continue;const from=Math.max(offset,r.offset),to=Math.min(offset+elements,r.offset+r.count);if(from>=to)continue;const patch=ownedF32(await record.lease.readBlock(id,from,to-from,{signal:options.signal}),to-from);valid();abort(options.signal);packageCurrent(record);values.set(patch,from-offset);packageReadBytes+=patch.byteLength;}}
   valid();abort(options.signal);effectiveReadBytes+=values.byteLength;return {values,shape:row?[count,entry.columns]:[count],source:{...clone(entry),rowStart:row?start:null,rowCount:row?count:null,elementOffset:offset,selectedElementCount:elements,weightFeed:{epoch:at,packageHash:record?.manifest.packageHash??null,kind:hasPatch(record,id,offset,elements)?'completed-final-f32':'immutable-base-pass-through'}}};
  });
  return Object.freeze({describe(){valid();return desc(at,record);},weightEpoch(){valid();return at;},readRows:(id,start,count=16,options)=>read(id,start,count,true,options),readVector:(id,start,count,options)=>read(id,start,count,false,options),addBias(...args){valid();return base.addBias(...args);},stats(){valid();return {...base.stats(),weightFeed:{epoch:at,packageHash:record?.manifest.packageHash??null}};}});
 }
 function capture({operation=false}={}){
  live();if(typeof operation!=='boolean')throw TypeError('Explicit operation capture boolean required');if(views.size>=MAX_LEASES)throw RangeError('Full-model weight read lease budget');
  const at=epoch,record=active?{...active,lease:active.lease.retain('diffusion-read:'+crypto.randomUUID())}:null;
  if(record&&!validPackage(record.lease))throw TypeError('Synchronous owned package retain required for atomic operation capture');
  let released=false,releaseTask=null,uses=0,waiting=[];if(operation)operations++;
  const valid=()=>{live();if(released)throw weightError('LEASE_RELEASED','Full-model weight read lease released');};
  const underlying=reader(record,at,valid),wrapped={};
  for(const [key,method]of Object.entries(underlying))wrapped[key]=['readRows','readVector'].includes(key)?async(...args)=>{valid();uses++;try{return await method(...args);}finally{uses--;if(!uses)for(const r of waiting.splice(0))r();}}:method;
  const view={source:Object.freeze(wrapped),epoch:at,packageHash:record?.manifest.packageHash??null,release(){if(!views.has(view))return Promise.resolve();if(releaseTask)return releaseTask;released=true;releaseTask=(async()=>{if(uses)await new Promise(r=>waiting.push(r));await releaseCap(record?.lease);views.delete(view);if(operation)operations--;})();releaseTask.catch(()=>{releaseTask=null;});return releaseTask;}};views.add(view);return Object.freeze(view);
 }
 const stableSource=Object.freeze({describe(){live();return desc();},weightEpoch(){live();return epoch;},async readRows(...args){const view=await capture();try{return await view.source.readRows(...args);}finally{await view.release();}},async readVector(...args){const view=await capture();try{return await view.source.readVector(...args);}finally{await view.release();}},addBias(...args){live();return base.addBias(...args);},stats(){return {...base.stats(),weightFeed:{epoch,packageHash:active?.manifest.packageHash??null}};}});
 const consumer=Object.freeze({contractVersion:STANDALONE_CONTRACT_VERSION,describe(){live();return clone(logical);},currentEpoch(){return epoch;},
  prepareLoad(pkg,ctx){return track(async()=>{guard(ctx);if(candidateRecords.size>=MAX_CANDIDATES)throw RangeError('Full-model candidate budget');const expected=context(ctx),at=epoch,description=await inspect(pkg,ctx);guard(ctx,expected);const lease=await retain(pkg,'diffusion-candidate:'+crypto.randomUUID());
   try{guard(ctx,expected);if(at!==epoch)throw weightError('STALE_WEIGHT_EPOCH','Weights changed while preparing candidate');if(candidateRecords.size>=MAX_CANDIDATES)throw RangeError('Full-model candidate budget');const value=Object.freeze({candidateId:crypto.randomUUID(),packageHash:description.manifest.packageHash}),c={...description,lease,expected,preparedAt:at,admittedAt:null,committedAt:null,previous:null,published:null,released:false,validating:false,committing:false,pendingCaps:new Set()};candidates.set(value,c);candidateRecords.add(c);return value;}catch(error){await releaseCap(lease);throw error;}
  });},
  validate(value,ctx){return track(async()=>{const c=state(value);guard(ctx,c.expected);if(c.validating||c.committing||c.terminal)throw weightError('BUSY','Full-model candidate validation/commit/terminal busy');if(c.committedAt!==null||c.preparedAt!==epoch)throw weightError('STALE_WEIGHT_EPOCH','Stale full-model candidate');c.validating=true;c.admittedAt=null;let elements=0,blocks=0;
   try{packageCurrent(c);for(const r of c.ranges){const entry=original.entries[r.weightId],step=entry.columns?Math.min(entry.maxRows,Math.floor(MODEL_WEIGHT_LIMITS.maxBlockElements/r.cols))*r.cols:MODEL_WEIGHT_LIMITS.maxBlockElements;
    for(let at=0;at<r.count;at+=step){guard(ctx,c.expected);if(c.preparedAt!==epoch)throw weightError('STALE_WEIGHT_EPOCH','Weights changed during validation');const n=Math.min(step,r.count-at),values=ownedF32(await c.lease.readBlock(r.weightId,r.offset+at,n,{signal:ctx.signal}),n);guard(ctx,c.expected);packageCurrent(c);elements+=values.length;blocks++;}
   }guard(ctx,c.expected);if(c.preparedAt!==epoch)throw weightError('STALE_WEIGHT_EPOCH','Weights changed during validation');c.admittedAt=epoch;validatedElements+=elements;return {contractVersion:STANDALONE_CONTRACT_VERSION,valid:true,validationMode:'normal',planId:ctx.planId,packageHash:ctx.packageHash,registryHash,coverage:ctx.coverage,scope:ctx.scope,validatedElements:elements,validatedBlocks:blocks,comparedElements:0,numericalComparison:false,allDeclaredElementsValidated:true,epoch,generationReady:false};
   }finally{c.validating=false;}
  });},
  commit(value,ctx){return track(async()=>{const c=state(value);guard(ctx,c.expected);idle();if(c.validating||c.committing||c.terminal||c.committedAt!==null||c.preparedAt!==epoch||c.admittedAt!==epoch)throw weightError('ADMISSION_REQUIRED','Current normal candidate admission required');packageCurrent(c);c.committing=true;let lease;
   try{lease=await retain(c.lease,'diffusion-active:'+crypto.randomUUID());guard(ctx,c.expected);idle();if(state(value)!==c||c.validating||c.preparedAt!==epoch||c.admittedAt!==epoch)throw weightError('STALE_WEIGHT_EPOCH','Candidate or weights changed before atomic commit');packageCurrent(c);const record={lease,manifest:c.manifest,ranges:c.ranges};c.previous=active;active=record;epoch++;c.committedAt=epoch;c.published=record;return {contractVersion:STANDALONE_CONTRACT_VERSION,state:'CONSUMER_APPLIED',validationMode:'normal',planId:ctx.planId,packageHash:ctx.packageHash,registryHash,coverage:ctx.coverage,scope:ctx.scope,epoch,ownership:{kind:'lease',ownerId:'diffusion-active:'+value.candidateId,isValid:()=>!disposed&&record.lease.isValid()===true},generationReady:false};}catch(error){await releaseCap(lease);throw error;}finally{c.committing=false;}
  });},
  rollback(value){return track(async()=>{if(value===null||value===undefined)return {restored:false,epoch};const c=candidates.get(value);if(!c||c.released)return {restored:false,epoch};if(closing)throw weightError('DISPOSED','Weight owner closing; disposal retains terminal ownership');if(c.validating||c.committing||c.terminal)throw weightError('BUSY','Await candidate validation/commit/terminal cleanup before rollback');c.terminal=true;
   try{let restored=false;if(!disposed&&c.committedAt===epoch&&active===c.published){idle();const dropped=active;active=c.previous;c.previous=null;epoch++;restored=true;if(dropped?.lease)c.pendingCaps.add(dropped.lease);}for(const cap of [...c.pendingCaps]){await releaseCap(cap);c.pendingCaps.delete(cap);}return {restored,epoch};}finally{c.terminal=false;}
  });},
  releaseCandidate(value){return track(async()=>{const c=candidates.get(value);if(!c)throw weightError('INVALID_CANDIDATE','Foreign full-model candidate');if(c.released)return;if(closing)throw weightError('DISPOSED','Weight owner closing; disposal retains terminal ownership');if(c.validating||c.committing||c.terminal)throw weightError('BUSY','Await candidate validation/commit/terminal cleanup before release');c.terminal=true;
   try{for(const cap of [...c.pendingCaps]){await releaseCap(cap);c.pendingCaps.delete(cap);}await releaseCap(c.previous?.lease);c.previous=null;await releaseCap(c.lease);c.released=true;candidateRecords.delete(c);}finally{c.terminal=false;}
  });}
 });
 function clear({signal,isCurrent=()=>true}={}){return track(async()=>{live();abort(signal);if(typeof isCurrent!=='function'||isCurrent()!==true)throw weightError('STALE_CONTEXT','Base restoration no longer current');idle();const previous=active;active=null;epoch++;if(previous?.lease)clearPending.add(previous.lease);for(const cap of [...clearPending]){await releaseCap(cap);clearPending.delete(cap);}return {restored:true,epoch,packageHash:null,application:'IMMUTABLE_BASE'};});}
 function stats(){return {disposed,closing,epoch,activePackageHash:active?.manifest.packageHash??null,candidates:candidateRecords.size,readLeases:views.size,operationLeases:operations,inFlight:inFlight.size,cleanupPending:cleanupPending.size,validatedElements,effectiveReadBytes,baseReadBytes,packageReadBytes,ownsOriginalBase:false,denseCompletedWeightResident:false};}
 function dispose(){if(disposeTask)return disposeTask;closing=true;disposeTask=(async()=>{while(inFlight.size)await Promise.allSettled([...inFlight]);const failures=[];for(const view of [...views])try{await view.release();}catch(e){failures.push(e);}for(const c of [...candidateRecords]){let failed=false;for(const cap of [...c.pendingCaps,c.previous?.lease,c.lease])try{await releaseCap(cap);c.pendingCaps.delete(cap);}catch(e){failed=true;failures.push(e);}if(!failed){c.released=true;candidateRecords.delete(c);}}try{await releaseCap(active?.lease);active=null;}catch(e){failures.push(e);}for(const cap of [...clearPending])try{await releaseCap(cap);clearPending.delete(cap);}catch(e){failures.push(e);}for(const cap of [...cleanupPending])try{await releaseCap(cap);}catch(e){failures.push(e);}if(failures.length||cleanupPending.size||views.size||candidateRecords.size||clearPending.size)throw new AggregateError(failures,'Full-model weight cleanup requires retry');disposed=true;closing=false;})();disposeTask.catch(()=>{disposeTask=null;});return disposeTask;}
 return Object.freeze({describe(){live();return {schemaVersion:'bernini-full-model-weight-feed/1',logicalRegistry:clone(logical),logicalRegistryHash:registryHash,bindingDescriptor:clone(bindingDescriptor),epoch,activePackageHash:active?.manifest.packageHash??null,normalValidation:'all declared final-F32 elements; no independent expected values',fullModelLoraNumericallyAccepted:false};},baseProvider,source:stableSource,consumer,capture,clear,stats,dispose});
}

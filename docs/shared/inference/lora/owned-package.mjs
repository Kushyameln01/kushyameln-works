import {Sha256} from '../../vr180/sha256.mjs';
import {inspectSafetensors,readTensor} from './safetensors.mjs';
import {freeze,sha256} from './planner.mjs';
import {effectiveScale,LOADER_POLICY_ID} from './loader-policy.mjs';
import {STANDALONE_CONTRACT_VERSION,validateStandaloneRegistry} from './standalone-registry.mjs';
import {buildStandalonePlan} from './standalone-planner.mjs';

export const OWNED_PACKAGE_VERSION='lora-owned-package/0.1-draft.1';
export const MAX_OWNED_READ_BYTES=16*1024*1024;
export const MAX_OWNED_BLOCK_ELEMENTS=1_048_576;
const CHUNK=1024*1024,HEX=/^[a-f0-9]{64}$/,sourceCaps=new WeakMap();
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const equal=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const hashJSON=value=>sha256(new TextEncoder().encode(JSON.stringify(ordered(value))));
const check=signal=>signal?.throwIfAborted();
function finite(a,n=a?.length){if(!(a instanceof Float32Array)||a.length!==n)throw Error('Owned finite F32 block required');for(let i=0;i<a.length;i++)if(!Number.isFinite(a[i]))throw Error('Owned finite F32 block required');return a;}
function sourceInput(sources,id){return sources instanceof Map?sources.get(id):sources?.[id];}
function bounds(source,offset,length){if(!integer(offset)||!integer(length)||length>MAX_OWNED_READ_BYTES||offset>source.size||length>source.size-offset)throw RangeError('Owned source read range/budget invalid');}
async function cleanupOrThrow(primary,actions,message){
 const results=await Promise.allSettled(actions.map(action=>Promise.resolve().then(action))),failed=actions.filter((_,i)=>results[i].status==='rejected'),errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);
 if(!errors.length){if(primary)throw primary;return;}
 let pending=[...failed,...(typeof primary?.recover==='function'?[()=>primary.recover()]:[])],running;
 async function recover(){if(running)return running;running=(async()=>{const work=pending,result=await Promise.allSettled(work.map(action=>Promise.resolve().then(action)));pending=work.filter((_,i)=>result[i].status==='rejected');if(pending.length)throw Object.assign(new AggregateError(result.filter(r=>r.status==='rejected').map(r=>r.reason),'Owned cleanup recovery failed'),{recover});})();try{await running;}finally{running=null;}}
 throw Object.assign(new AggregateError([...(primary?[primary]:[]),...errors],message),{recover});
}

// Refcounted verified immutable source capabilities. A generic source must
// supply an independent retained capability; a Blob snapshot owns its bytes.
function verifiedCapability(record,sourceId){
 let released=false;
 const cap={sourceId,size:record.source.size,sourceSha256:record.sourceSha256,inspection:record.inspection,
  async read(offset,length,{signal}={}){if(released||record.ended)throw Error('Owned source released');check(signal);if(record.valid()!==true)throw Error('Owned source lease invalid');bounds(record.source,offset,length);record.reads++;try{const b=await record.source.read(offset,length,{signal});check(signal);if(record.valid()!==true)throw Error('Owned source lease invalid');if(!(b instanceof Uint8Array)||b.length!==length)throw Error('Truncated owned source read');return b;}finally{record.reads--;if(!record.reads){for(const resolve of record.idle??[])resolve();record.idle=[];}}},
  async hash({signal}={}){check(signal);if(released||record.ended)throw Error('Owned source released');if(record.valid()!==true)throw Error('Owned source lease invalid');return record.sourceSha256;},
  isValid:()=>!released&&!record.ended&&record.valid()===true,
  retain(ownerId){if(released||record.ended)throw Error('Owned source released');if(record.valid()!==true)throw Error('Owned source lease invalid');if(typeof ownerId!=='string'||!ownerId)throw TypeError('Source lease ownerId required');record.refs++;const source=verifiedCapability(record,sourceId);return Object.freeze({ownerId,source,isValid:()=>!sourceCaps.get(source).released()&&!record.ended&&record.valid()===true,release:()=>source.release()});},
  async release(){if(!released){released=true;record.refs--;}if(record.refs)return;if(record.ended)return;if(record.reads)await new Promise(resolve=>(record.idle??=[]).push(resolve));if(!record.cleaning)record.cleaning=(async()=>{await record.cleanup();record.ended=true;})();try{await record.cleaning;}catch(e){record.cleaning=null;throw e;}}
 };sourceCaps.set(cap,{record,released:()=>released});return Object.freeze(cap);
}

/** Capture and verify once. Arbitrary hash/verification claims are never reused. */
export async function captureOwnedLoraSource(input,{sourceId='source',signal,onProgress}={}){
 if(typeof sourceId!=='string'||!sourceId)throw TypeError('Explicit sourceId required');
 check(signal);
 const known=sourceCaps.get(input);if(known){const lease=input.retain('source-capture:'+sourceId);return lease.source;}
 let source,cleanup=async()=>{},valid=()=>true;
 if(input&&typeof input.slice==='function'&&integer(input.size)){
  const blob=input.slice(0,input.size);
  source={size:blob.size,async read(offset,length,{signal}={}){check(signal);bounds(blob,offset,length);const bytes=new Uint8Array(await blob.slice(offset,offset+length).arrayBuffer());check(signal);return bytes;}};
 }else{
  if(typeof input?.retain!=='function')throw TypeError('Generic source requires an independent retain lease');
  const lease=await input.retain('lora-owned-source:'+sourceId);source=lease?.source??lease;
  if(typeof lease?.release!=='function'||typeof lease?.isValid!=='function'||lease.isValid()!==true||!integer(source?.size)||typeof source?.read!=='function'){
   return cleanupOrThrow(TypeError('Invalid retained source capability'),typeof lease?.release==='function'?[()=>lease.release()]:[],'Invalid source capability cleanup failed');
  }
  cleanup=()=>lease.release();valid=()=>lease.isValid()===true;
 }
 try{
  const hash=new Sha256();
  for(let offset=0;offset<source.size;){check(signal);if(!valid())throw Error('Owned source lease invalid');const n=Math.min(CHUNK,source.size-offset),bytes=await source.read(offset,n,{signal});check(signal);if(!(bytes instanceof Uint8Array)||bytes.length!==n)throw Error('Truncated owned source hash read');hash.update(bytes);offset+=n;onProgress?.({sourceId,bytesHashed:offset,totalBytes:source.size});}
  const sourceSha256=hash.digestHex(),inspection=await inspectSafetensors(source,{signal});check(signal);
  if(!valid())throw Error('Owned source lease invalid');
  return verifiedCapability({source,sourceSha256,inspection,cleanup,valid,refs:1,reads:0,ended:false,cleaning:null},sourceId);
 }catch(error){return cleanupOrThrow(error,[cleanup],'Source capture and cleanup failed');}
}

/** Bounded strength-independent raw-product cache. Values stay private. */
export function createLoraProductCache({maxBytes=16*1024*1024}={}){
 if(!integer(maxBytes))throw RangeError('Invalid product cache budget');
 const entries=new Map(),pending=new Map();let bytes=0,hits=0,misses=0,epoch=0;
 const cache={get(key){const a=entries.get(key);if(!a){misses++;return undefined;}hits++;entries.delete(key);entries.set(key,a);return a.slice();},set(key,a){finite(a,a.length);const old=entries.get(key);if(old){entries.delete(key);bytes-=old.byteLength;}if(a.byteLength>maxBytes)return;while(bytes+a.byteLength>maxBytes){const first=entries.keys().next().value;bytes-=entries.get(first).byteLength;entries.delete(first);}entries.set(key,a.slice());bytes+=a.byteLength;},async getOrCompute(key,compute){const existing=cache.get(key);if(existing)return existing;let work=pending.get(key);if(!work){const generation=epoch;work=(async()=>{const value=finite(await compute());if(epoch===generation)cache.set(key,value);return value;})();pending.set(key,work);void work.finally(()=>{if(pending.get(key)===work)pending.delete(key);}).catch(()=>{});}return (await work).slice();},clear(){epoch++;entries.clear();pending.clear();bytes=0;},stats(){return Object.freeze({maxBytes,bytes,entries:entries.size,pending:pending.size,hits,misses});}};
 return Object.freeze(cache);
}

function selectedRanges(adapters,registry){
 const byId=new Map();for(const a of adapters)for(const op of a.plan.operations){const id=op.target.weightId,ranges=byId.get(id)??[];ranges.push({startRow:op.slice.startRow,rowCount:op.slice.rowCount});byId.set(id,ranges);}
 const targets=[];for(const t of registry.targets){const ranges=byId.get(t.weightId);if(!ranges)continue;ranges.sort((a,b)=>a.startRow-b.startRow);const union=[];for(const r of ranges){const last=union.at(-1);if(last&&r.startRow<=last.startRow+last.rowCount)last.rowCount=Math.max(last.startRow+last.rowCount,r.startRow+r.rowCount)-last.startRow;else union.push({...r});}targets.push({weightId:t.weightId,key:t.key,fullShape:[...t.fullShape],ranges:union});}return targets;
}
async function verifyOperations(adapter,source,registry,kernel,signal){
 const p=adapter.plan;if(!p||p.contractVersion!==STANDALONE_CONTRACT_VERSION||p.sourceSha256!==source.sourceSha256||p.loaderPolicyId!==LOADER_POLICY_ID||!equal(p.registry,registry)||!Array.isArray(p.operations)||!p.operations.length)throw Error('Source/plan/registry identity mismatch');
 const targets=new Map(registry.targets.map(t=>[t.weightId,t])),seen=new Set();
 for(const op of p.operations){const target=targets.get(op.target?.weightId),cols=op.fullShape?.length===2?op.fullShape[1]:1,s=op.slice;
  if(!target||seen.has(target.weightId)||!equal(target,op.target)||!equal(target.fullShape,op.fullShape)||!integer(s?.startRow)||!Number.isSafeInteger(s.rowCount)||s.rowCount<1||s.startRow>op.fullShape[0]-s.rowCount)throw Error('Invalid selected target/range in owned plan');seen.add(target.weightId);
  if(op.key!==target.key||op.scale!==effectiveScale({loaderPolicyId:p.loaderPolicyId,strength:p.strength,variant:op.variant,rank:op.rank,alpha:op.alpha??null}))throw Error('Owned operation multiplier/loader mismatch');
  const tensors=source.inspection.tensors;
  if(op.kind==='lora'){
   if(!['linear-down-up','linear-a-b'].includes(op.variant)||!Number.isSafeInteger(op.rank)||op.rank<1||!equal(tensors[op.downName]?.shape,[op.rank,cols])||!equal(tensors[op.upName]?.shape,[op.fullShape[0],op.rank]))throw Error('Owned factor/header shape mismatch');
  }else if(op.kind==='diff'){
   if(!['additive-diff','additive-diff-b'].includes(op.variant)||!equal(tensors[op.deltaName]?.shape,op.fullShape))throw Error('Owned delta/header shape mismatch');
  }else throw Error('Unsupported owned operation');
 }
 const alphaValues={};for(const name of Object.keys(source.inspection.tensors))if(name.endsWith('.alpha')){const tensor=source.inspection.tensors[name],value=kernel.decode(await readTensor(source,source.inspection,name,{signal}),tensor.dtype);if(value.length!==1)throw Error('Invalid source alpha scalar');alphaValues[name]=value[0];}
 const expected=buildStandalonePlan({inspection:source.inspection,registry,sourceSha256:source.sourceSha256,strength:p.strength,loaderPolicyId:p.loaderPolicyId,alphaValues,...(p.coverage==='PARTIAL'?{selections:p.operations.map(op=>({key:op.key,slice:op.slice}))}:{})});
 if(!equal(expected.operations,p.operations)||expected.coverage!==p.coverage)throw Error('Owned plan operations differ from canonical source mapping');
}

/** Lazy owned factor package; output tiles are computed from immutable base. */
export async function createOwnedLoraPackage({plan,baseProvider,kernel,sources={},cache,signal}={}){
 if(!plan||plan.contractVersion!==STANDALONE_CONTRACT_VERSION||!Array.isArray(plan.adapters))throw TypeError('Versioned standalone composition plan required');
 if(typeof baseProvider?.describe!=='function'||typeof baseProvider?.readBlock!=='function')throw TypeError('Explicit immutable base provider required');
 if(!kernel||!['decode','product','apply'].every(k=>typeof kernel[k]==='function')||!HEX.test(kernel.info?.wasmSha256))throw TypeError('Streaming Hike kernel required');
 const registry=validateStandaloneRegistry(plan.registry),baseIdentity=freeze(structuredClone(await baseProvider.describe()));check(signal);
 if(baseIdentity?.modelHash!==registry.modelHash||baseIdentity.side!==registry.side)throw Error('Immutable base identity mismatch');
 const registryHash=await hashJSON(registry);if(baseIdentity.registryHash!==undefined&&baseIdentity.registryHash!==registryHash)throw Error('Immutable base registry identity mismatch');
 const adapters=structuredClone(plan.adapters).sort((a,b)=>['light','detail'].indexOf(a.pairId)-['light','detail'].indexOf(b.pairId)),seenPairs=new Set(),captured=new Map(),owned=[];let packageKernelLease;
 try{
  for(const a of adapters){check(signal);if(!['light','detail'].includes(a.pairId)||seenPairs.has(a.pairId)||typeof a.sourceId!=='string'||!a.sourceId)throw Error('Invalid duplicate standalone adapter selection');seenPairs.add(a.pairId);
   let source=captured.get(a.sourceId);if(!source){source=await captureOwnedLoraSource(sourceInput(sources,a.sourceId),{sourceId:a.sourceId,signal});captured.set(a.sourceId,source);owned.push(source);}await verifyOperations(a,source,registry,kernel,signal);
  }
  const sourceDescriptors=[...captured].map(([sourceId,s],i)=>({sourceId,fileName:`source-${i}.safetensors`,size:s.size,sourceSha256:s.sourceSha256})),ranges=selectedRanges(adapters,registry),coverage=adapters.some(a=>a.plan.coverage==='PARTIAL')?'PARTIAL':'FULL';
  const body={packageVersion:OWNED_PACKAGE_VERSION,contractVersion:STANDALONE_CONTRACT_VERSION,registry,registryHash,baseIdentity,side:registry.side,loaderPolicyId:LOADER_POLICY_ID,compositionOrder:['light','detail'],adapters,sources:sourceDescriptors,selectedTargets:ranges,coverage,scope:coverage==='FULL'?'full-adapter':'diagnostic-projection',completeAdapter:coverage==='FULL',generationReady:false,buildId:kernel.info.wasmSha256,...(plan.planId===undefined?{}:{planId:plan.planId})};
  const manifest=freeze({...body,packageHash:await hashJSON(body)}),handleId=crypto.randomUUID(),productCache=cache??createLoraProductCache(),targets=new Map(registry.targets.map(t=>[t.weightId,t]));
  const kernelLease=packageKernelLease=typeof kernel.retain==='function'?kernel.retain('owned-package:'+handleId):null;
  if(kernelLease&&kernelLease.isValid()!==true)throw Error('Streaming Hike kernel lease invalid');
  kernel=kernelLease?.kernel??kernel;
  let refs=1,ended=false,closing=false,uses=0,idle=[],cleanup;
  const live=()=>{if(ended||closing)throw Error('Owned package released');};
  async function use(fn){live();uses++;try{return await fn();}finally{uses--;if(!uses){for(const resolve of idle)resolve();idle=[];}}}
  async function drop(){refs--;if(refs>0)return;closing=true;if(uses)await new Promise(r=>idle.push(r));if(!cleanup)cleanup=(async()=>{const results=await Promise.allSettled(owned.map(s=>s.release()));const errors=results.filter(x=>x.status==='rejected').map(x=>x.reason);if(errors.length)throw new AggregateError(errors,'Owned source release failed');await kernelLease?.release();if(!cache)productCache.clear();ended=true;})();try{await cleanup;}catch(e){cleanup=null;throw e;}}
  async function current(signal){check(signal);live();for(const source of captured.values())if(source.isValid()!==true)throw Error('Owned source lease invalid');if(!equal(await baseProvider.describe(),baseIdentity))throw Error('Immutable base identity changed');check(signal);}
  async function readBlock(weightId,offset,count,{signal}={}){return use(async()=>{
   await current(signal);const target=targets.get(weightId);if(!target)throw Error('Unknown owned package target');const cols=target.fullShape.length===2?target.fullShape[1]:1,total=target.fullShape.reduce((a,b)=>a*b,1);
   if(!integer(offset)||!Number.isSafeInteger(count)||count<1||offset%cols||count%cols||offset>total-count||count>MAX_OWNED_BLOCK_ELEMENTS)throw RangeError('Owned block row/range/budget invalid');
   let out=finite(await baseProvider.readBlock(weightId,offset,count,{signal,...baseIdentity,registryHash,fullShape:target.fullShape,side:registry.side}),count).slice();await current(signal);
   const start=offset/cols,end=(offset+count)/cols;
   for(const a of adapters)for(const op of a.plan.operations){if(op.target.weightId!==weightId)continue;const first=Math.max(start,op.slice.startRow),last=Math.min(end,op.slice.startRow+op.slice.rowCount);if(first>=last)continue;
    const rows=last-first,n=rows*cols,at=(first-start)*cols,source=captured.get(a.sourceId);let delta;
    if(op.kind==='lora'){
     const getOrCompute=typeof productCache.getOrCompute==='function'?(key,compute)=>productCache.getOrCompute(key,compute):async(key,compute)=>{let a=productCache.get(key);if(!a){a=await compute();productCache.set(key,a);}return a;};
     const key=JSON.stringify(['product',source.sourceSha256,kernel.info.wasmSha256,op.downName,op.upName,op.fullShape,first,rows]);
     delta=await getOrCompute(key,async()=>{
      const tensor=source.inspection.tensors[op.downName],downKey=JSON.stringify(['factor',source.sourceSha256,kernel.info.wasmSha256,op.downName,tensor.dtype,tensor.shape]);
      const down=await getOrCompute(downKey,async()=>kernel.decode(await readTensor(source,source.inspection,op.downName),tensor.dtype));
      const up=kernel.decode(await readTensor(source,source.inspection,op.upName,{elementOffset:first*op.rank,elementCount:rows*op.rank}),source.inspection.tensors[op.upName].dtype);
      return finite(kernel.product({down,up,rows,cols,rank:op.rank}),n);
     });
     await current(signal);
    }else{delta=kernel.decode(await readTensor(source,source.inspection,op.deltaName,{elementOffset:first*cols,elementCount:n,signal}),source.inspection.tensors[op.deltaName].dtype);await current(signal);}
    const merged=finite(kernel.apply({base:out.subarray(at,at+n),delta,scale:op.scale}),n);out.set(merged,at);check(signal);
   }
   await current(signal);return finite(out,count);
  });}
  async function* blocks({blockRows=16,signal}={}){if(!Number.isSafeInteger(blockRows)||blockRows<1||blockRows>256)throw RangeError('Invalid owned blockRows');live();for(const target of ranges){const cols=target.fullShape.length===2?target.fullShape[1]:1,step=Math.min(blockRows,Math.floor(MAX_OWNED_BLOCK_ELEMENTS/cols));if(step<1)throw RangeError('One complete row exceeds owned block budget');for(const range of target.ranges)for(let row=range.startRow;row<range.startRow+range.rowCount;row+=step){check(signal);const rows=Math.min(step,range.startRow+range.rowCount-row),offset=row*cols,count=rows*cols,data=await readBlock(target.weightId,offset,count,{signal});yield {...target,offset,count,slice:{startRow:row,rowCount:rows},dtype:'F32',data};}}}
  async function save({writer,signal}={}){return use(async()=>{if(typeof writer?.writeSource!=='function'||typeof writer?.writeManifest!=='function')throw TypeError('Streaming package writer required');await current(signal);for(const descriptor of sourceDescriptors){const source=captured.get(descriptor.sourceId);let consumed=0;const hash=new Sha256();async function* chunks(){for(let at=0;at<source.size;){check(signal);const bytes=await source.read(at,Math.min(CHUNK,source.size-at),{signal});check(signal);hash.update(bytes);at+=bytes.length;consumed=at;yield bytes;}check(signal);}await writer.writeSource(descriptor.fileName,chunks());check(signal);if(consumed!==source.size||hash.digestHex()!==descriptor.sourceSha256)throw Error('Saved source payload incomplete or hash changed');}await current(signal);await writer.writeManifest(structuredClone(manifest));check(signal);return manifest;});}
  function capability(ownerId){
   let released=false;const guard=()=>{if(released)throw Error('Owned package capability released');live();};
   const cap={handleId,ownerId,describe(){guard();return manifest;},async readBlock(...args){guard();const result=await readBlock(...args);guard();return result;},async *blocks(...args){guard();for await(const block of blocks(...args)){guard();yield block;}guard();},async save(...args){guard();const result=await save(...args);guard();return result;},retain(nextOwnerId){guard();if(typeof nextOwnerId!=='string'||!nextOwnerId)throw TypeError('Package lease ownerId required');refs++;return capability(nextOwnerId);},isValid:()=>!released&&!ended&&!closing,async release(){if(!released){released=true;return drop();}if(closing&&!ended&&refs===0){refs++;return drop();}},stats(){return Object.freeze({references:refs,inFlight:uses,released:ended,cache:productCache.stats?.()??null});}};
   cap.source=cap;return Object.freeze(cap);
  }
  return capability('prepared');
 }catch(error){return cleanupOrThrow(error,[...owned.map(s=>()=>s.release()),...(packageKernelLease?[()=>packageKernelLease.release()]:[])],'Package creation and cleanup failed');}
}

/** Reopen persisted payload with explicit base/source capabilities and a new handle. */
export async function reopenOwnedLoraPackage(saved,{sources,baseProvider,kernel,cache,signal}={}){
 const manifest=structuredClone(saved),{packageHash,...body}=manifest??{};
 if(manifest?.packageVersion!==OWNED_PACKAGE_VERSION||!HEX.test(packageHash)||await hashJSON(body)!==packageHash)throw Error('Saved package manifest integrity/hash mismatch');
 if(!Array.isArray(manifest.sources)||!Array.isArray(manifest.adapters))throw Error('Saved package source manifest invalid');
 const sourceIds=new Set(),fileNames=new Set();for(const [i,d]of manifest.sources.entries()){if(!d||typeof d.sourceId!=='string'||!d.sourceId||sourceIds.has(d.sourceId)||d.fileName!==`source-${i}.safetensors`||fileNames.has(d.fileName)||!integer(d.size)||d.size<8||!HEX.test(d.sourceSha256))throw Error('Duplicate or invalid saved source descriptor');sourceIds.add(d.sourceId);fileNames.add(d.fileName);}
 const caps=new Map();let result,primary;try{for(const descriptor of manifest.sources){check(signal);const input=sourceInput(sources,descriptor.fileName),freshInput=sourceCaps.has(input)?{retain:ownerId=>input.retain(ownerId)}:input,cap=await captureOwnedLoraSource(freshInput,{sourceId:descriptor.sourceId,signal});caps.set(descriptor.sourceId,cap);if(cap.size!==descriptor.size||cap.sourceSha256!==descriptor.sourceSha256)throw Error('Saved source payload hash mismatch');}
  const p=await createOwnedLoraPackage({plan:{contractVersion:manifest.contractVersion,registry:manifest.registry,adapters:manifest.adapters,planId:manifest.planId},baseProvider,kernel,sources:caps,cache,signal});
  if(!equal(p.describe(),manifest)){await p.release();throw Error('Reopened package identity differs from saved manifest');}result=p;
 }catch(error){primary=error;}
 await cleanupOrThrow(primary,[...caps.values()].map(s=>()=>s.release()),'Reopened source cleanup failed');return result;
}

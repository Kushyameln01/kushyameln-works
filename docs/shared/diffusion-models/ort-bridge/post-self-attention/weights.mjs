import {diagnosticRegistryHash,canonicalRegistryJSON} from '../../lora/diagnostic-identity.mjs';
import {cloneP4CapturedConditioning,p4ConditioningMetadataBytes} from './conditioning.mjs';

const PROFILE='bernini-block0-n2-cross-ffn-f32-candidate-v1',SHA=/^[a-f0-9]{64}$/;
const FIELDS=['modelHash','graphHash','registryHash','side','executionProfileId','scope'];
const copy=x=>structuredClone(x),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),abort=s=>s?.throwIfAborted();
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const hashJSON=value=>sha(new TextEncoder().encode(canonicalRegistryJSON(value)));
function freeze(v,seen=new WeakSet()){if(v&&typeof v==='object'&&!seen.has(v)){seen.add(v);if(ArrayBuffer.isView(v)||v instanceof ArrayBuffer)return v;for(const x of Object.values(v))freeze(x,seen);Object.freeze(v);}return v;}
const typed=Object.getPrototypeOf(Float32Array.prototype),slot=Object.fromEntries(['length','byteOffset','byteLength','buffer'].map(k=>[k,Object.getOwnPropertyDescriptor(typed,k).get])),tag=Object.getOwnPropertyDescriptor(typed,Symbol.toStringTag).get,bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
function f32(v,n){if(!ArrayBuffer.isView(v)||tag.call(v)!=='Float32Array')throw TypeError('Compact owned finite F32 required');const buffer=slot.buffer.call(v);if(!(buffer instanceof ArrayBuffer)||slot.length.call(v)!==n||slot.byteOffset.call(v)!==0||slot.byteLength.call(v)!==bufferLength.call(buffer))throw TypeError('Compact owned finite F32 required');const out=new Float32Array(v);if(!out.every(Number.isFinite))throw TypeError('Compact owned finite F32 required');return out;}
function jsonMetadata(v){if(ArrayBuffer.isView(v))return Array.from(v);if(Array.isArray(v))return v.map(jsonMetadata);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,jsonMetadata(x)]));return v;}

/** Sparse final-F32 feed; low-rank arithmetic and canonical LoRA mapping stay external. */
export function createP4WeightFeed({source,includeTextEmbedding=false}={}){
 if(typeof includeTextEmbedding!=='boolean'||!['describe','readRows','readVector','addBias','stats'].every(k=>typeof source?.[k]==='function'))throw TypeError('Explicit P4 original source and text selection required');
 const original=copy(source.describe());
 if(original.schemaVersion!=='bernini-p4-original-weights/0.1'||original.executionProfileId!==PROFILE||!['HIGH','LOW'].includes(original.side)||!['modelHash','graphHash','headerSHA256'].every(k=>SHA.test(original[k])))throw TypeError('Identified actual P4 source required');
 const stems=[...['q','k','v','o'].map(k=>'blocks.0.cross_attn.'+k),'blocks.0.ffn.0','blocks.0.ffn.2',...(includeTextEmbedding?['text_embedding.0','text_embedding.2']:[])];
 const targets=stems.flatMap(stem=>['weight','bias'].map(role=>{
  const e=original.entries[stem+'.'+role];if(!e||!Array.isArray(e.fullShape)||e.computeDtype!=='F32'||e.binding?.name!==e.originalKey||e.binding.kind!==(role==='weight'?'runtime-input':'hike-parameter'))throw Error('P4 source binding mismatch');
  return {...copy(e),parameterRole:role,dtype:'F32',shape:[...e.fullShape],transform:{kind:'identity'},patchCoordinates:'full-original-elements',unchangedRanges:'immutable-base-pass-through'};
 }));
 const descriptor={schemaVersion:'bernini-p4-f32-feed-registry/0.1',scope:'PARTIAL',completeAdapter:false,executionProfileId:PROFILE,modelHash:original.modelHash,graphHash:original.graphHash,side:original.side,original:copy(original),targets,
  coverage:{fullModel:false,kind:'explicit-sparse-final-f32-ranges',unselectedTargets:'immutable-base-pass-through',unselectedRows:'immutable-base-pass-through',canonicalLoraAdapterExtension:'PENDING'},
  validationGate:{id:'p4-cross-ffn-composed-f32-v1',absolute:0.01,relative:0.001,scope:'composed-new-stage-only'},
  resourceLimits:{maxBlockElements:81920,maxPatchBytes:16777216,maxRetainedPatchBytes:67108864,maxPackages:4,maxCandidates:4,maxReadLeases:16,maxTransactions:4},generationReady:false};
 const registry=freeze({...descriptor,registryHash:diagnosticRegistryHash(descriptor)}),identity=Object.fromEntries(FIELDS.map(k=>[k,registry[k]])),byId=new Map(targets.map(t=>[t.weightId,t]));
 const baseFeed=freeze({packageHash:diagnosticRegistryHash({schemaVersion:'bernini-p4-immutable-base-feed/0.1',...identity}),blocks:[],patchBytes:0,kind:'immutable-base-pass-through'});
 let disposed=false,disposal=null,epoch=0,active=baseFeed,readLeases=0,effectiveReadBytes=0,patchedReadBytes=0,transactions=0,pendingPatchBytes=0;
 const packages=new WeakMap(),packageRecords=new Set(),candidates=new WeakMap(),candidateRecords=new Set(),sinks=new Set(),views=new Set(),inFlight=new Set(),pendingFeeds=new Map();
 const live=()=>{if(disposed)throw Error('P4 weight feed disposed');};
 function bound(v){if(!v||FIELDS.some(k=>v[k]!==identity[k]))throw Error('P4 feed binding identity mismatch');}
 function context(v){const c=Object.fromEntries(FIELDS.map(k=>[k,v?.[k]]));c.signal=v?.signal;c.isCurrent=v?.isCurrent;return c;}
 function guard(c){live();bound(c);abort(c.signal);if(typeof c.isCurrent!=='function'||c.isCurrent()!==true)throw Error('Stale P4 application');}
 function track(fn){const p=(async()=>fn())();inFlight.add(p);p.finally(()=>inFlight.delete(p)).catch(()=>{});return p;}
 function retained(){const buffers=new Set(),add=blocks=>{for(const b of blocks??[])buffers.add(b.data.buffer);};add(active?.blocks);for(const p of packageRecords)add(p.feed?.blocks);for(const c of candidateRecords){add(c.feed?.blocks);add(c.previous?.blocks);}for(const v of views)add(v.blocks());for(const s of sinks)add(s.blocks());for(const f of pendingFeeds.values())add(f.blocks);return {bytes:[...buffers].reduce((n,b)=>n+b.byteLength,0),buffers:buffers.size};}
 function range(id,offset,count,{block=false}={}){
  const t=byId.get(id);if(!t)throw RangeError('Unregistered P4 patch target');
  const size=t.fullShape.reduce((a,b)=>a*b,1);
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||offset<0||count<1||offset>size-count)throw RangeError('P4 full-coordinate range');
  if(t.columns&&(offset%t.columns||count%t.columns))throw RangeError('P4 patch must retain complete input columns');
  if(block&&(count>81920||(t.columns&&count/t.columns>t.maxRows)))throw RangeError('P4 bounded block range');return t;
 }
 function description(feed,at){live();return {...copy(original),registryHash:registry.registryHash,scope:'PARTIAL',epoch:at,packageHash:feed.packageHash,weightFeed:{epoch:at,packageHash:feed.packageHash,kind:feed.kind,patchBytes:feed.patchBytes},generationReady:false};}
 function readView(feed,at){
  if(readLeases>=registry.resourceLimits.maxReadLeases)throw Error('P4 read lease resource budget');
  let held=feed,released=false;feed=null;readLeases++;
  const state={blocks:()=>held?.blocks??[],release(){if(released)return;released=true;held=null;readLeases--;views.delete(state);}};views.add(state);
  const valid=()=>{live();if(released)throw Error('P4 read lease released');};
  function read(key,start,count,rowMode,options){return track(async()=>{
   valid();const pinned=held,signal=options?.signal;abort(signal);const pending={};pendingFeeds.set(pending,pinned);
   try{
   const raw=await source[rowMode?'readRows':'readVector'](key,start,count,{signal});valid();abort(signal);
   const entry=original.entries[key],offset=start*(rowMode?entry.columns:1),end=offset+raw.values.length,values=f32(raw.values,raw.values.length),patches=[];
   for(const b of pinned.blocks){if(b.weightId!==key)continue;const from=Math.max(offset,b.offset),to=Math.min(end,b.offset+b.count);if(from>=to)continue;values.set(b.data.subarray(from-b.offset,to-b.offset),from-offset);patchedReadBytes+=(to-from)*4;patches.push({weightId:key,offset:from,count:to-from,blockSHA256:b.sha256});}
   const decodedF32SHA256=await sha(values);valid();abort(signal);effectiveReadBytes+=values.byteLength;
   return {...raw,values,source:{...copy(raw.source),decodedF32SHA256,rawHashMeaning:'immutable-original-storage-only',weightFeed:{epoch:at,packageHash:pinned.packageHash,kind:patches.length?'patched-final-f32':'immutable-base-pass-through',patches}}};
   }finally{pendingFeeds.delete(pending);}
  });}
  return Object.freeze({describe(){valid();return description(held,at);},readRows(key,start,count=16,options){return read(key,start,count,true,options);},readVector(key,start,count,options){return read(key,start,count,false,options);},addBias(...args){valid();return source.addBias(...args);},stats(){valid();return {...source.stats(),weightFeed:{epoch:at,packageHash:held.packageHash,patchBytes:held.patchBytes,readLease:true}};},captureSource(){valid();return readView(held,at);},release:state.release});
 }
 const candidateState=value=>{live();const c=candidates.get(value);if(!c||c.released)throw Error('Foreign or released P4 candidate');return c;};
 function makeCandidate(feed){const value=Object.freeze({candidateId:crypto.randomUUID(),packageHash:feed.packageHash,scope:'PARTIAL'}),c={value,feed,preparedAtEpoch:epoch,committedEpoch:null,previous:null,receipt:null,released:false,validating:false};candidates.set(value,c);candidateRecords.add(c);return value;}
 function dropCandidate(c){c.released=true;c.feed=null;c.previous=null;c.receipt=null;candidateRecords.delete(c);}
 function createSink(){
  live();const owner={},owned=new Set();let transaction=null,serial=0,busy=false;
  const available=()=>{live();if(busy)throw Error('P4 sink busy');};
  const current=(t,s)=>{live();if(transaction!==t||serial!==s)throw Error('P4 transaction aborted');};
  const sink={
   async begin(input){available();bound(input);if(transaction)throw Error('P4 transaction already active');if(transactions>=registry.resourceLimits.maxTransactions)throw Error('P4 transaction resource budget');const m=copy(input);if(!Array.isArray(m.patches)||!m.patches.length)throw Error('Explicit P4 patch coverage required');
    let bytes=0;const ranges=m.patches.map(p=>{range(p.weightId,p.offset,p.count);bytes+=p.count*4;return {weightId:p.weightId,offset:p.offset,count:p.count};});
    for(let i=0;i<ranges.length;i++)for(let j=0;j<i;j++){const a=ranges[i],b=ranges[j];if(a.weightId===b.weightId&&a.offset<b.offset+b.count&&b.offset<a.offset+a.count)throw Error('Overlapping declared P4 ranges');}
    if(bytes>registry.resourceLimits.maxPatchBytes)throw RangeError('P4 sparse patch byte budget');serial++;transaction={ranges,blocks:[],manifest:m,patchBytes:bytes};transactions++;
   },
   writeBlock(input){return track(async()=>{
    available();const t=transaction,s=serial;if(!t)throw Error('No P4 transaction');const b={weightId:input?.weightId,offset:input?.offset,count:input?.count,fullShape:copy(input?.fullShape),binding:copy(input?.binding),dtype:input?.dtype,sha256:input?.sha256};
    const target=range(b.weightId,b.offset,b.count,{block:true});if(!same(b.fullShape,target.fullShape)||!same(b.binding,target.binding)||b.dtype!=='F32'||!SHA.test(b.sha256)||Object.hasOwn(input,'graphInitializer'))throw Error('P4 block binding/full shape/dtype/hash mismatch');
    if(!t.ranges.some(p=>p.weightId===b.weightId&&b.offset>=p.offset&&b.offset+b.count<=p.offset+p.count))throw RangeError('P4 block outside declared range');
    if(t.blocks.some(p=>p.weightId===b.weightId&&b.offset<p.offset+p.count&&p.offset<b.offset+b.count))throw Error('Overlapping P4 block');
    const reservation=b.count*4;if(retained().bytes+pendingPatchBytes+reservation>registry.resourceLimits.maxRetainedPatchBytes)throw Error('P4 aggregate patch buffer budget');pendingPatchBytes+=reservation;busy=true;const pending={};pendingFeeds.set(pending,t);
    try{const data=f32(input.data,b.count);if(await sha(data)!==b.sha256)throw Error('P4 block byte hash mismatch');current(t,s);t.blocks.push({...b,data});}finally{pendingFeeds.delete(pending);pendingPatchBytes-=reservation;busy=false;}
   });},
   finish(input){return track(async()=>{
    available();bound(input);const t=transaction,s=serial;if(!t)throw Error('No P4 transaction');
    for(const p of t.ranges){let at=p.offset;for(const b of t.blocks.filter(b=>b.weightId===p.weightId&&b.offset>=p.offset&&b.offset<p.offset+p.count).sort((a,b)=>a.offset-b.offset)){if(b.offset!==at)throw Error('Incomplete P4 range coverage');at+=b.count;}if(at!==p.offset+p.count)throw Error('Incomplete P4 range coverage');}
    if(packageRecords.size>=registry.resourceLimits.maxPackages)throw Error('P4 package resource budget; release packages');busy=true;const pending={};pendingFeeds.set(pending,t);
    try{const metadata={schemaVersion:'bernini-p4-sparse-final-f32-package/0.1',...identity,manifest:jsonMetadata(t.manifest),blocks:t.blocks.map(({data,...b})=>b)},packageHash=await hashJSON(metadata);current(t,s);if(packageRecords.size>=registry.resourceLimits.maxPackages)throw Error('P4 package resource budget; release packages');
     const handle=Object.freeze({packageId:crypto.randomUUID(),packageHash,kind:'sparse-final-f32-feed',scope:'PARTIAL'}),p={owner,handle,feed:{blocks:t.blocks,packageHash,patchBytes:t.patchBytes,kind:'sparse-final-f32-feed'},released:false};packages.set(handle,p);packageRecords.add(p);owned.add(p);transaction=null;transactions--;return handle;
    }finally{pendingFeeds.delete(pending);busy=false;}
   });},
   async abort(){serial++;if(transaction)transactions--;transaction=null;},
   async release(handle){const p=packages.get(handle);if(!p||p.owner!==owner)throw Error('Foreign P4 package');if(p.released)return;p.released=true;p.feed=null;owned.delete(p);packageRecords.delete(p);}
  };
  sinks.add({abort:sink.abort,blocks:()=>transaction?.blocks??[],releaseAll(){for(const p of owned){p.released=true;p.feed=null;packageRecords.delete(p);}owned.clear();}});return Object.freeze(sink);
 }
 const api={
  registry(){live();return copy(registry);},describe(){return description(active,epoch);},createSink,captureSource(){live();return readView(active,epoch);},
  async readRows(key,start,count=16,options){const view=api.captureSource();return view.readRows(key,start,count,options).finally(()=>view.release());},
  async readVector(key,start,count,options){const view=api.captureSource();return view.readVector(key,start,count,options).finally(()=>view.release());},addBias(...args){live();return source.addBias(...args);},
  baseProvider:Object.freeze({readBlock(id,offset,count,input={}){return track(async()=>{live();const c={...input};bound(c);abort(c.signal);const t=range(id,offset,count,{block:true});if(!same(c.fullShape,t.fullShape))throw Error('P4 base full shape binding mismatch');const result=await (t.columns?source.readRows(id,offset/t.columns,count/t.columns,{signal:c.signal}):source.readVector(id,offset,count,{signal:c.signal}));live();abort(c.signal);return f32(result.values,count);});}}),
  prepareLoad(handle,input){return track(async()=>{const c=context(input);guard(c);const p=packages.get(handle);if(!p||p.released)throw Error('Foreign or released P4 package');if(candidateRecords.size>=registry.resourceLimits.maxCandidates)throw Error('P4 candidate resource budget');const feed={...p.feed,blocks:p.feed.blocks.map(b=>({...b}))};guard(c);return makeCandidate(feed);});},
  async prepareBase(input){const c=context(input);guard(c);if(candidateRecords.size>=registry.resourceLimits.maxCandidates)throw Error('P4 candidate resource budget');return makeCandidate(baseFeed);},
  validate(value,input){return track(async()=>{
   const ctx=context(input);guard(ctx);const c=candidateState(value);if(c.validating)throw Error('P4 candidate validation busy');if(c.committedEpoch!==null||c.preparedAtEpoch!==epoch)throw Error('Stale P4 candidate epoch');c.receipt=null;
   const supplied=input.input,captured=supplied?{residual:f32(supplied.residual,10240),timeAct1:f32(supplied.timeAct1,5120),conditioning:cloneP4CapturedConditioning(supplied.conditioning)}:null,expected=f32(input.expected,10240),expectedSHA256=input.expectedSHA256,referenceId=input.referenceId,gateId=input.gateId,run=input.run,absolute=input.tolerance?.absolute,relative=input.tolerance?.relative;
   if(!captured||typeof run!=='function'||!SHA.test(expectedSHA256)||typeof referenceId!=='string'||!referenceId||typeof gateId!=='string'||!gateId||![absolute,relative].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0))throw TypeError('Independent P4 runtime reference/hash/gate required');
   if(gateId!==registry.validationGate.id||absolute!==registry.validationGate.absolute||relative!==registry.validationGate.relative)throw Error('P4 composed gate/tolerance differs from frozen registry');
   const cond=captured.conditioning,{data,attentionMask,...conditioningDescriptor}=cond,conditioningExpected={schemaVersion:cond.schemaVersion,rows:cond.rows,shape:[...cond.shape],meaning:cond.meaning},metadataBytes=p4ConditioningMetadataBytes(cond.metadata),descriptorBytes=p4ConditioningMetadataBytes(conditioningDescriptor);
   c.validating=true;let view;
   try{
    const [actualExpected,...inputDigests]=await Promise.all([sha(expected),sha(captured.residual),sha(captured.timeAct1),sha(cond.data),sha(cond.attentionMask),sha(metadataBytes),sha(descriptorBytes)]);guard(ctx);if(actualExpected!==expectedSHA256)throw Error('P4 expected reference byte hash mismatch');
    const inputHashes=Object.fromEntries(['residualSHA256','timeAct1SHA256','conditioningSHA256','conditioningMaskSHA256','conditioningMetadataSHA256'].map((k,i)=>[k,inputDigests[i]])),conditioningDescriptorSHA256=inputDigests[5];
    const inputBindingHash=await hashJSON({inputHashes,conditioningDescriptorSHA256});guard(ctx);view=readView(c.feed,c.preparedAtEpoch);
    const result=await run(view,captured);guard(ctx);if(c.released||c.preparedAtEpoch!==epoch)throw Error('Stale P4 candidate epoch during validation');
    if(!result?.output||!result.evidence)throw Error('Actual P4 runtime output and evidence required');const output=f32(result.output,10240),evidence=copy(result.evidence);
    if(evidence?.executionProfileId!==PROFILE||evidence?.graphSHA256!==registry.graphHash||evidence?.weightFeedPackageHash!==c.feed.packageHash||evidence?.weightFeedEpoch!==c.preparedAtEpoch||Object.keys(inputHashes).some(k=>evidence?.inputHashes?.[k]!==inputHashes[k]))throw Error('P4 runtime evidence profile/graph/package/epoch/input mismatch');
    if(evidence.conditioning?.schemaVersion!==conditioningExpected.schemaVersion||evidence.conditioning?.rows!==conditioningExpected.rows||!same(evidence.conditioning?.shape,conditioningExpected.shape)||evidence.conditioning?.meaning!==conditioningExpected.meaning||await sha(p4ConditioningMetadataBytes(evidence.conditioning?.metadata))!==inputHashes.conditioningMetadataSHA256)throw Error('P4 runtime conditioning shape/meaning/metadata mismatch');guard(ctx);
    let maxAbsoluteError=0,failedValues=0;for(let i=0;i<output.length;i++){const error=Math.abs(output[i]-expected[i]);maxAbsoluteError=Math.max(maxAbsoluteError,error);if(!Number.isFinite(error)||error>absolute+relative*Math.abs(expected[i]))failedValues++;}
    const outputSHA256=await sha(output);guard(ctx);if(c.released||c.preparedAtEpoch!==epoch)throw Error('Stale P4 validation epoch');
    const receipt=freeze({schemaVersion:'bernini-p4-f32-feed-validation/0.1',...identity,scope:'PARTIAL',candidateId:value.candidateId,packageHash:c.feed.packageHash,valid:failedValues===0,referenceId,gateId,expectedSHA256,outputSHA256,inputHashes,inputBindingHash,conditioningDescriptorSHA256,tolerance:{absolute,relative},maxAbsoluteError,failedValues,evidence,modelInference:false,generationReady:false,canonicalLoraAdapterExtension:'PENDING'});c.receipt=receipt;return copy(receipt);
   }finally{view?.release();c.validating=false;}
  });},
  async commit(value,input){const ctx=context(input);guard(ctx);const c=candidateState(value);if(!c.receipt?.valid)throw Error('Valid P4 runtime reference required before commit');if(c.committedEpoch!==null||c.preparedAtEpoch!==epoch)throw Error('Stale P4 candidate epoch');guard(ctx);c.previous=active;epoch++;active=c.feed;c.committedEpoch=epoch;return {committed:true,...identity,epoch,packageHash:active.packageHash,scope:'PARTIAL',modelInference:false,generationReady:false};},
  async rollback(value,input){if(value===null||value===undefined)return {restored:false};const ctx=context(input);bound(ctx);const c=candidates.get(value);if(!c||c.released)return {restored:false};if(c.validating)throw Error('P4 candidate validation busy');let restored=false;if(!disposed&&ctx.isCurrent?.()===true&&c.committedEpoch===epoch&&active===c.feed){active=c.previous;epoch++;restored=true;}dropCandidate(c);return {restored,epoch,scope:'PARTIAL'};},
  async releaseCandidate(value){const c=candidates.get(value);if(!c)throw Error('Foreign P4 candidate');if(c.released)return;if(c.validating)throw Error('P4 candidate validation busy');dropCandidate(c);},
  stats(){const r=retained();return {disposed,epoch,activePackageHash:active?.packageHash??null,activePatchBytes:active?.patchBytes??0,retainedPatchBytes:r.bytes,retainedPatchBuffers:r.buffers,pendingPatchBytes,knownPatchBytes:r.bytes+pendingPatchBytes,transactions,packages:packageRecords.size,candidates:candidateRecords.size,readLeases,inFlight:inFlight.size,effectiveReadBytes,patchedReadBytes,source:source.stats(),allocatorPeakBytes:null,copyScope:'deduplicated private patch buffers retained by packages/candidates/history/active/leases/transactions/pending reads and finishes; pending hash snapshots separately reserved inside aggregate cap; excludes metadata, effective-read scratch, host or ORT peak'};},
  dispose(){if(disposal)return disposal;disposed=true;epoch++;active=null;for(const s of sinks){s.abort();s.releaseAll();}sinks.clear();for(const v of [...views])v.release();for(const c of candidateRecords)dropCandidate(c);disposal=Promise.allSettled([...inFlight]).then(()=>undefined);return disposal;}
 };
 return Object.freeze(api);
}

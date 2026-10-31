// Boundary adapter only: all low-rank/delta arithmetic belongs to LoRA SDK/Hike.
// One bounded PARTIAL Q slice, not a full-model or management snapshot adapter.
import {createDiagnosticConsumer} from './diagnostic-consumer.mjs';
import {canonicalRegistryJSON,verifyDiagnosticRegistryHash} from './diagnostic-identity.mjs';
export const LORA_V2_CONTRACT='lora-connection/2.0-draft.1';
export const LORA_LOADER_POLICY='comfy-lora-b5a4321-linear-diff-v1';
const SHA=/^[a-f0-9]{64}$/;
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=v=>structuredClone(v);
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
function floats(v,n){if(!(v instanceof Float32Array)||v.length!==n||!(v.buffer instanceof ArrayBuffer)||v.byteOffset!==0||v.byteLength!==v.buffer.byteLength||!v.every(Number.isFinite))fail('INVALID_TENSOR','Compact owned finite F32 tensor required');return new Float32Array(v);}
function referenceSnapshot(r){
 const x=floats(r?.x,5120),expected=floats(r?.expected,16),absolute=r?.tolerance?.absolute,relative=r?.tolerance?.relative;
 if(![absolute,relative].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0))fail('INVALID_REFERENCE','Explicit finite nonnegative tolerances required');
 return {x,expected,tolerance:{absolute,relative}};
}
export async function createLoraV2DiagnosticAdapter({base,stage,includeBias,reference,isCurrent}={}){
 // Snapshot before the first hash await, including mutable reference metadata.
 const ref=referenceSnapshot(reference),r=copy(base?.describe());
 if(typeof includeBias!=='boolean'||typeof isCurrent!=='function'||typeof base?.baseProvider?.readBlock!=='function')fail('INVALID_ADAPTER','Explicit bias selection, current callback and immutable provider required');
 verifyDiagnosticRegistryHash(r);
 const native=createDiagnosticConsumer({registry:r,stage,baseProvider:base.baseProvider});
 const targets=r.targets.map(t=>({key:t.key,weightId:t.weightId,module:'diffusion_models',shape:[...t.fullShape],dtype:'F32',layout:'row-major',parameterRole:t.weightId==='q.weight'?'weight':'bias',binding:copy(t.binding),transform:{kind:'identity'}}));
 const registry={contractVersion:LORA_V2_CONTRACT,modelHash:r.modelHash,graphHash:r.graphHash,registryVersion:'bernini-partial-v2:'+r.registryHash,side:r.side,executionProfileId:r.executionProfileId,loaderPolicyId:LORA_LOADER_POLICY,targets};
 const registryHash=await sha(new TextEncoder().encode(canonicalRegistryJSON(registry)));
 const chosen=r.targets.filter(t=>includeBias||t.weightId==='q.weight');
 const diagnostic={targets:chosen.map(t=>({key:t.key,slice:{startRow:t.transform.rowStart,rowCount:16}}))};
 const ownerId='diffusion-partial-'+crypto.randomUUID(),records=new Map(),candidates=new Map(),pendingCleanup=new Set();let disposed=false;
 const nativeIdentity={modelHash:r.modelHash,graphHash:r.graphHash,registryHash:r.registryHash,side:r.side,scope:'PARTIAL'};
 function live(){if(disposed)fail('DISPOSED','LoRA v2 adapter disposed');if(pendingCleanup.size)fail('RECOVERY_REQUIRED','Adapter allocation cleanup must be retried before reuse');if(isCurrent()!==true)fail('STALE_APPLICATION','Application is not current');}
 // Hold the actual allocated object through cleanup failure. SDK rollback may
 // receive undefined because allocation failed before returning its wrapper.
 async function failedAllocation(error,cleanup){
  const task={error,cleanup};pendingCleanup.add(task);let cleanupError;
  try{await cleanup();pendingCleanup.delete(task);}catch(e){cleanupError=e;}
  if(cleanupError)throw new AggregateError([error,cleanupError],'Allocation cleanup failed; adapter.recover() required');
  throw error;
 }
 function selected(id){const t=r.targets.find(t=>t.weightId===id);if(!t)fail('BINDING_MISMATCH','Unknown selected weight');return t;}
 function bound(m){
  live();if(!m||m.contractVersion!==LORA_V2_CONTRACT||m.coverage!=='PARTIAL'||m.scope!=='diagnostic-projection'||m.completeAdapter!==false)fail('INVALID_SCOPE','Only explicit PARTIAL diagnostic scope is supported');
  if(m.registryHash!==registryHash||m.modelHash!==r.modelHash||m.graphHash!==r.graphHash||m.side!==r.side||m.executionProfileId!==r.executionProfileId||m.loaderPolicyId!==LORA_LOADER_POLICY||!SHA.test(m.planId)||!SHA.test(m.sourceSha256))fail('BINDING_MISMATCH','SDK manifest identity mismatch');
  return {planId:m.planId,sourceSha256:m.sourceSha256,localInputRevision:m.localInputRevision,localApplicationRevision:m.localApplicationRevision};
 }
 function context(m,{cleanup=false}={}){
  if(!cleanup)bound(m);
  return {...nativeIdentity,signal:m.signal,isCurrent:()=>!disposed&&isCurrent()===true&&(cleanup||typeof m.isCurrent==='function'&&m.isCurrent()===true)};
 }
 function record(handle,m){const p=records.get(handle);if(!p||p.released)fail('INVALID_PACKAGE','Foreign or released adapter package');const id=bound(m);if(!eq(id,p.identity))fail('BINDING_MISMATCH','Package source/plan identity mismatch');return p;}
 function candidate(value,m){const c=candidates.get(value);if(!c||c.released)fail('INVALID_CANDIDATE','Foreign or released adapter candidate');record(c.handle,m);return c;}
 const baseProvider=Object.freeze({async readBlock(id,offset,count,c={}){
  live();if(c.modelHash!==r.modelHash||c.graphHash!==r.graphHash||c.registryHash!==registryHash||c.side!==r.side||c.executionProfileId!==r.executionProfileId)fail('BINDING_MISMATCH','SDK base identity mismatch');
  const t=selected(id),columns=t.fullShape.length===2?t.fullShape[1]:1,start=t.transform.rowStart*columns,total=t.shape.reduce((a,b)=>a*b,1);
  if(!eq(c.fullShape,t.fullShape)||!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||count<1||offset<start||count>total-(offset-start))fail('INVALID_RANGE','Full base range is outside the selected slice');
  c.signal?.throwIfAborted();const data=await base.baseProvider.readBlock(id,offset-start,count,{...nativeIdentity,signal:c.signal});live();c.signal?.throwIfAborted();return floats(data,count);
 }});
 function createSink(){
  live();const sink=native.createSink();let manifest=null,identity=null;
  return Object.freeze({
   async begin(m){const id=bound(m),owned=copy(m);if(manifest)fail('TRANSACTION_ACTIVE','Adapter sink transaction active');if(records.size+candidates.size>=4)fail('RESOURCE_BUDGET','Release existing prepared packages before preparing more');
    if(!Array.isArray(owned.includedPatches)||!eq(owned.includedPatches.map(x=>x.key).sort(),chosen.map(t=>t.key).sort()))fail('BINDING_MISMATCH','Selected SDK patches do not match the adapter');
    await sink.begin(nativeIdentity);live();manifest=owned;identity=id;
   },
   async writeBlock(b){
    live();if(!manifest)fail('NO_TRANSACTION','No adapter sink transaction');const t=selected(b?.weightId),columns=t.fullShape.length===2?t.fullShape[1]:1,start=t.transform.rowStart*columns;
    if(!chosen.includes(t)||b.key!==t.key||b.parameterRole!==(t.weightId==='q.weight'?'weight':'bias')||!eq(b.binding,t.binding)||Object.hasOwn(b,'graphInitializer')||!eq(b.fullShape,t.fullShape)||b.dtype!=='F32')fail('BINDING_MISMATCH','SDK block binding/full shape mismatch');
    if(!Number.isSafeInteger(b.offset)||!Number.isSafeInteger(b.count)||b.count<1||b.offset<start||b.count>t.shape.reduce((a,v)=>a*v,1)-(b.offset-start)||b.offset%columns!==0||b.count%columns!==0||!eq(b.slice,{startRow:b.offset/columns,rowCount:b.count/columns}))fail('INVALID_RANGE','SDK block must retain full columns inside selected rows');
    const owned=floats(b.data,b.count),offset=b.offset-start,digest=b.sha256;await sink.writeBlock({weightId:t.weightId,offset,count:owned.length,shape:[...t.shape],dtype:'F32',sha256:digest,data:owned});live();
   },
   async finish(m){
    const id=bound(m);if(!manifest||!eq(id,identity)||m.complete!==true)fail('BINDING_MISMATCH','Finish requires the same complete SDK manifest');
    if(!includeBias){const b=await base.baseProvider.readBlock('q.bias',0,16,nativeIdentity);live();const owned=floats(b,16),digest=await sha(owned);live();await sink.writeBlock({weightId:'q.bias',offset:0,count:16,shape:[16],dtype:'F32',sha256:digest,data:owned});}
    const nativeHandle=await sink.finish(nativeIdentity);try{live();}catch(error){await failedAllocation(error,()=>sink.release(nativeHandle));}const handle=Object.freeze({kind:'lora-v2-diagnostic-package',packageHash:nativeHandle.packageHash});records.set(handle,{nativeHandle,sink,identity:id,released:false});manifest=null;identity=null;return handle;
   },
   async abort(error){await sink.abort(error);manifest=null;identity=null;},
   async release(handle){const p=records.get(handle);if(!p)fail('INVALID_PACKAGE','Unknown adapter package');if(p.sink!==sink)fail('INVALID_PACKAGE','Package belongs to a different sink');if(p.released)return;await sink.release(p.nativeHandle);p.released=true;records.delete(handle);}
  });
 }
 const target=Object.freeze({contractVersion:LORA_V2_CONTRACT,describe:()=>{live();return copy(registry);},
  async prepareLoad(handle,m){if(candidates.size>=4)fail('RESOURCE_BUDGET','Release candidate history before preparing more');const p=record(handle,m),value=await native.prepareLoad(p.nativeHandle,context(m));try{live();}catch(error){const cleanupContext=context(m,{cleanup:true});await failedAllocation(error,()=>native.rollback(value,cleanupContext));}const wrapper=Object.freeze({candidateId:crypto.randomUUID()});candidates.set(wrapper,{value,handle,identity:p.identity,released:false,committed:false});return wrapper;},
  async validate(value,m){const c=candidate(value,m);const receipt=await native.validate(c.value,{...context(m),...ref});live();return {contractVersion:LORA_V2_CONTRACT,valid:receipt.valid,coverage:'PARTIAL',scope:'diagnostic-projection',planId:m.planId,registryHash,sourceSha256:m.sourceSha256,evidence:{nativeRegistryHash:r.registryHash,validation:receipt}};},
  async commit(value,m){const c=candidate(value,m),receipt=await native.commit(c.value,context(m));live();if(receipt.committed!==true||receipt.scope!=='PARTIAL'||receipt.modelInference!==false)fail('INVALID_RECEIPT','Native diagnostic commit receipt mismatch');c.committed=true;return {contractVersion:LORA_V2_CONTRACT,state:'CONSUMER_APPLIED',planId:m.planId,ownership:{kind:'independent-copy',ownerId},evidence:{nativeRegistryHash:r.registryHash,commit:receipt}};},
  async rollback(value,m){if(value===undefined)return;const c=candidates.get(value);if(!c||c.released)return;if(!eq(c.identity,{planId:m.planId,sourceSha256:m.sourceSha256,localInputRevision:m.localInputRevision,localApplicationRevision:m.localApplicationRevision}))fail('BINDING_MISMATCH','Rollback candidate belongs to another plan');await native.rollback(c.value,context(m,{cleanup:true}));c.released=true;candidates.delete(value);}
 });
 return Object.freeze({registry:copy(registry),registryHash,diagnostic:copy(diagnostic),baseProvider,createSink,target,
  async run(input){live();const result=await native.run(input);live();return result;},
  async releaseHistory(){live();for(const [value,c]of candidates){if(!c.committed)fail('CANDIDATE_IN_USE','Candidate transaction has not completed');await native.releaseCandidate(c.value);c.released=true;candidates.delete(value);}},
  async restoreBase({reference:input,signal,isCurrent:current}={}){const owned=referenceSnapshot(input);live();if(typeof current!=='function')fail('INVALID_CONTEXT','Explicit restoration current callback required');const ctx={...nativeIdentity,signal,isCurrent:()=>!disposed&&isCurrent()===true&&current()===true};let c;try{c=await native.prepareBase(ctx);const receipt=await native.validate(c,{...ctx,...owned});if(!receipt.valid)fail('INVALID_REFERENCE','Immutable base reference comparison failed');const commit=await native.commit(c,ctx);await native.releaseCandidate(c);return {scope:'PARTIAL',modelInference:false,restoredBase:true,validation:receipt,commit};}catch(error){await failedAllocation(error,()=>native.rollback(c,ctx));}},
  async recover(){const errors=[];for(const task of [...pendingCleanup])try{await task.cleanup();pendingCleanup.delete(task);}catch(error){errors.push(task.error,error);}if(errors.length)throw new AggregateError(errors,'Adapter allocation cleanup remains pending');},
  async dispose(){if(disposed)return;disposed=true;await native.dispose();records.clear();candidates.clear();pendingCleanup.clear();}
 });
}

import {freeze,sha256} from './planner.mjs';
import {CONTRACT_VERSION,LOADER_POLICY_ID,validateRegistryV2} from './planner-v2.mjs';
import {Sha256} from '../../vr180/sha256.mjs';

export const DIAGNOSTIC_ADAPTER_VERSION='lora-diffusion-diagnostic-adapter/0.1';
const NATIVE_REGISTRY='bernini-diagnostic-registry/0.1';
const PROFILE='bernini-q16x5120-f32-wasm-v1';
const FP8='scaled-e4m3fn-scalar-f32-v1';
const SHA=/^[a-f0-9]{64}$/;
const KEY='diffusion_model.blocks.0.self_attn.q';
const specs={
 'q.weight':{key:KEY+'.weight',shape:[16,5120],fullShape:[5120,5120],count:81920,cols:5120,role:'weight',storageDtype:'F8_E4M3',binding:{kind:'runtime-input',name:'weight'}},
 'q.bias':{key:KEY+'.bias',shape:[16],fullShape:[5120],count:16,cols:1,role:'bias',storageDtype:'F16',binding:{kind:'hike-parameter',name:'bias'}}
};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const hashJSON=v=>sha256(new TextEncoder().encode(JSON.stringify(ordered(v))));
const copy=v=>structuredClone(v);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
// Native diagnostic registry/0.1 defines a JSON-only canonical digest. Keep it
// separate from the SDK registry identity and from management snapshot hashes.
function nativeCanonical(v){
 if(v===null||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'){if(!Number.isFinite(v))fail('INVALID_NATIVE_REGISTRY','Nonfinite native registry number');return JSON.stringify(v);}
 if(typeof v==='string'){if(!v.isWellFormed())fail('INVALID_NATIVE_REGISTRY','Malformed native registry Unicode');return JSON.stringify(v);}
 if(Array.isArray(v)){if(Array.from({length:v.length},(_,i)=>i).some(i=>!Object.hasOwn(v,i)))fail('INVALID_NATIVE_REGISTRY','Sparse native registry array');return '['+v.map(nativeCanonical).join(',')+']';}
 if(v&&Object.getPrototypeOf(v)===Object.prototype)return '{'+Object.keys(v).sort().map(k=>nativeCanonical(k)+':'+nativeCanonical(v[k])).join(',')+'}';
 fail('INVALID_NATIVE_REGISTRY','JSON-only native registry required');
}
function compact(v,count){if(!(v instanceof Float32Array)||v.length!==count||!(v.buffer instanceof ArrayBuffer)||v.byteOffset!==0||v.byteLength!==v.buffer.byteLength||!v.every(Number.isFinite))fail('INVALID_TENSOR','Compact owned finite Float32Array required');}
function reference(input){
 compact(input?.x,5120);compact(input?.expected,16);
 if(!input.tolerance||!['absolute','relative'].every(k=>Number.isFinite(input.tolerance[k])&&input.tolerance[k]>=0))fail('INVALID_REFERENCE','Explicit finite nonnegative diagnostic tolerances required');
 return {x:new Float32Array(input.x),expected:new Float32Array(input.expected),tolerance:Object.freeze({absolute:input.tolerance.absolute,relative:input.tolerance.relative})};
}
function registryInput(input){
 const r=copy(input);
 if(r?.schemaVersion!==NATIVE_REGISTRY||r.scope!=='PARTIAL'||r.coverage?.kind!=='PARTIAL'||r.coverage.fullModel!==false||r.executionProfileId!==PROFILE||r.fp8ProfileId!==FP8||!['HIGH','LOW'].includes(r.side)||!['modelHash','graphHash','registryHash'].every(k=>SHA.test(r[k]))||r.targets?.length!==2)fail('INVALID_NATIVE_REGISTRY','Identified PARTIAL native diagnostic registry required');
 let rowStart;const seen=new Set();
 for(const t of r.targets){
  const s=specs[t.weightId];
  if(!s||seen.has(t.weightId)||t.key!==s.key||t.originalKey!==s.key.slice('diffusion_model.'.length)||!equal(t.fullShape,s.fullShape)||!equal(t.shape,s.shape)||t.dtype!=='F32'||t.computeDtype!=='F32'||t.storageDtype!==s.storageDtype||t.layout!=='row-major'||!equal(t.binding,s.binding)||Object.hasOwn(t,'graphInitializer')||t.transform?.kind!=='row-slice'||t.transform.transpose===true||t.transform.rowCount!==16||!Number.isSafeInteger(t.transform.rowStart)||t.transform.rowStart<0||t.transform.rowStart>5104)fail('INVALID_NATIVE_BINDING','Native full shape, slice or runtime binding mismatch');
  if(t.weightId==='q.weight'&&(t.transform.columnStart!==0||t.transform.columnCount!==5120))fail('INVALID_NATIVE_BINDING','Complete projection columns required');
  if(rowStart!==undefined&&rowStart!==t.transform.rowStart)fail('INVALID_NATIVE_BINDING','Weight and bias must select the same rows');
  if(t.source?.elementOffset!==t.transform.rowStart*s.cols)fail('INVALID_NATIVE_BINDING','Native source element mapping mismatch');
  rowStart=t.transform.rowStart;seen.add(t.weightId);
 }
 const {registryHash,...descriptor}=r,hasher=new Sha256();hasher.update(new TextEncoder().encode(nativeCanonical(descriptor)));if(hasher.digestHex()!==registryHash)fail('REGISTRY_INTEGRITY_ERROR','Native registry metadata hash mismatch');
 return freeze(r);
}

/** Explicit public-contract bridge. Caller owns native consumer/stage/provider. */
export function createDiffusionDiagnosticAdapter({consumer,baseProvider:nativeProvider,isOwnerCurrent}={}){
 if(typeof isOwnerCurrent!=='function')fail('OWNER_CURRENT_REQUIRED','Explicit diagnostic application owner-current callback required');
 if(!['describe','createSink','prepareLoad','validate','commit','rollback','prepareBase','releaseCandidate','run'].every(k=>typeof consumer?.[k]==='function')||typeof nativeProvider?.readBlock!=='function')fail('INVALID_NATIVE_CONSUMER','Complete native diagnostic consumer and base provider required');
 const native=registryInput(consumer.describe()),adapterId=crypto.randomUUID();
 const registry=validateRegistryV2({contractVersion:CONTRACT_VERSION,modelHash:native.modelHash,graphHash:native.graphHash,registryVersion:DIAGNOSTIC_ADAPTER_VERSION,side:native.side,executionProfileId:native.executionProfileId,loaderPolicyId:LOADER_POLICY_ID,targets:native.targets.map(t=>({key:t.key,weightId:t.weightId,module:'diffusion_models',shape:[...t.fullShape],dtype:'F32',layout:'row-major',parameterRole:specs[t.weightId].role,binding:copy(t.binding),transform:{kind:'identity'}}))});
 const connectionHash=hashJSON(registry),plans=new WeakMap(),handles=new WeakMap(),candidates=new WeakMap(),passThrough=[];
 const nativeIdentity={modelHash:native.modelHash,graphHash:native.graphHash,registryHash:native.registryHash,side:native.side,scope:'PARTIAL'};
 const selectedStart=id=>native.targets.find(t=>t.weightId===id).transform.rowStart*specs[id].cols;
 function currentNative(){if(isOwnerCurrent()!==true)fail('STALE_OWNER','Diagnostic application owner is not current');const observed=consumer.describe();if(!equal(ordered(observed),ordered(native)))fail('NATIVE_REGISTRY_CHANGED','Native registry identity or descriptor changed');}
 function range(id,offset,count){const s=specs[id];if(!s||!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||count<1||offset<selectedStart(id)||offset-selectedStart(id)>s.count-count)fail('INVALID_RANGE','Full-coordinate range is outside selected native slice');return offset-selectedStart(id);}
 async function identityV2(value,p){
  const expectedHash=await connectionHash;
  if(!value||value.registryHash!==expectedHash||value.modelHash!==native.modelHash||value.graphHash!==native.graphHash||value.side!==undefined&&value.side!==native.side)fail('CONNECTION_IDENTITY_MISMATCH','Connection registry/model/graph identity mismatch');
  if(p){
   const expected={contractVersion:p.contractVersion,coverage:p.coverage,scope:p.scope,planId:p.planId,sourceSha256:p.sourceSha256,registryHash:p.registryHash,side:p.registry.side,loaderPolicyId:p.loaderPolicyId,strength:p.strength,executionProfileId:p.registry.executionProfileId,registryVersion:p.registry.registryVersion,sdkInstanceId:p.sdkInstanceId,localInputRevision:p.localInputRevision,localApplicationRevision:p.localApplicationRevision,buildId:p.buildId,completeAdapter:false,generationReady:false};
   if(Object.keys(expected).some(k=>value[k]!==expected[k])||!equal(ordered(value.selection),ordered(p.selection)))fail('PLAN_IDENTITY_MISMATCH','PARTIAL plan/manifest/context identity mismatch');
  }
 }
 function getPlan(plan){
  if(!plan||typeof plan!=='object')fail('INVALID_PLAN','Versioned PARTIAL plan required');
  let state=plans.get(plan);if(state)return state;
  // Capture all caller metadata synchronously; SDK plans themselves are frozen.
  const captured=freeze(copy(plan));
  state={plan:captured,candidates:new Set(),ready:null};plans.set(plan,state);
  state.ready=(async()=>{
   if(captured.contractVersion!==CONTRACT_VERSION||captured.coverage!=='PARTIAL'||captured.completeAdapter!==false||captured.scope!=='diagnostic-projection'||captured.loaderPolicyId!==LOADER_POLICY_ID||!SHA.test(captured.planId)||!SHA.test(captured.sourceSha256)||captured.registryHash!==await connectionHash||!equal(ordered(captured.registry),ordered(registry))||captured.selection?.noise!==native.side.toLowerCase()||!['light','detail'].includes(captured.selection?.pairId))fail('INVALID_PARTIAL_PLAN','Native diagnostic adapter requires identified Bernini PARTIAL plan');
   const light=captured.selection.pairId==='light',expected=light?['q.weight','q.bias']:['q.weight'];
   if(!Array.isArray(captured.operations)||captured.operations.length!==expected.length||!expected.every(id=>captured.operations.some(op=>op.target?.weightId===id)))fail('INVALID_PATCH_COVERAGE','Light requires explicit Q bias; detail contains only Q weight');
   for(const op of captured.operations){const s=specs[op.target?.weightId];if(!s||!equal(op.fullShape,s.fullShape)||op.key!==s.key||!equal(op.target.binding,s.binding)||op.slice?.startRow!==selectedStart(op.target.weightId)/s.cols||op.slice.rowCount!==16)fail('INVALID_PATCH_SLICE','Patch binding/full shape/selected slice mismatch');}
   currentNative();return state;
  })();
  // A caller may only create a target/sink then abandon it. Do not create an
  // unhandled rejection while preserving the actual rejection for dispatch.
  void state.ready.catch(()=>{});return state;
 }
 const baseProvider=Object.freeze({async readBlock(id,offset,count,context={}){
  const signal=context.signal,captured={...context};signal?.throwIfAborted();const relative=range(id,offset,count);
  await identityV2(captured);signal?.throwIfAborted();currentNative();
  const value=await nativeProvider.readBlock(id,relative,count,{...nativeIdentity,signal});signal?.throwIfAborted();compact(value,count);return value;
 }});
 function createSink(plan){
  const p=getPlan(plan),nativeSink=consumer.createSink();let begun=false,writeRecords=[];
  function allowed(id){return p.plan.operations.some(op=>op.target.weightId===id);}
  const api={
   async begin(input){const captured=freeze(copy(input));await p.ready;await identityV2(captured,p.plan);if(begun)fail('TRANSACTION_ACTIVE','Adapter sink already active');if(captured.complete!==false)fail('INVALID_MANIFEST','Begin manifest must be incomplete');currentNative();await nativeSink.begin(nativeIdentity);begun=true;writeRecords=[];},
   async writeBlock(input){
    // Own metadata and bytes before the first await or native hash boundary.
    const b=copy(input);compact(b.data,b.count);
    await p.ready;if(!begun)fail('NO_TRANSACTION','Adapter sink transaction is not active');
    const s=specs[b.weightId];if(!s||!allowed(b.weightId)||b.key!==s.key||b.parameterRole!==s.role||!equal(b.fullShape,s.fullShape)||!equal(b.binding,s.binding)||Object.hasOwn(b,'graphInitializer')||b.dtype!=='F32'||!SHA.test(b.sha256))fail('INVALID_BLOCK_BINDING','Block binding/full shape/dtype/checksum mismatch');
    const offset=range(b.weightId,b.offset,b.count);currentNative();
    await nativeSink.writeBlock({weightId:b.weightId,offset,count:b.count,shape:[...s.shape],dtype:'F32',sha256:b.sha256,data:b.data});
    const {data,...record}=b;writeRecords.push(record);
   },
   async finish(input){
    const captured=freeze(copy(input));await p.ready;if(!begun)fail('NO_TRANSACTION','Adapter sink transaction is not active');await identityV2(captured,p.plan);
    const {bundleHash,...body}=captured;if(captured.complete!==true||!SHA.test(bundleHash)||await hashJSON(body)!==bundleHash)fail('MANIFEST_INTEGRITY_ERROR','Completed manifest bundle checksum mismatch');
    if(!equal(ordered(captured.blocks),ordered(writeRecords)))fail('MANIFEST_COVERAGE_MISMATCH','Manifest blocks differ from actual writes');
    if(p.plan.selection.pairId==='detail'){
     currentNative();const data=await nativeProvider.readBlock('q.bias',0,16,nativeIdentity);compact(data,16);const digest=await sha256(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));currentNative();
     await nativeSink.writeBlock({weightId:'q.bias',offset:0,count:16,shape:[16],dtype:'F32',sha256:digest,data});
     passThrough.push({planId:p.plan.planId,weightId:'q.bias',offset:0,count:16,sha256:digest,kind:'immutable-base-pass-through'});if(passThrough.length>64)passThrough.shift();
    }
    currentNative();const nativeHandle=await nativeSink.finish(nativeIdentity),handle=Object.freeze({adapterVersion:DIAGNOSTIC_ADAPTER_VERSION,handleId:crypto.randomUUID(),planId:p.plan.planId,nativePackageHash:nativeHandle.packageHash});
    handles.set(handle,{plan:p.plan,nativeHandle,nativeSink,manifest:captured,released:false,loading:0});begun=false;return handle;
   },
   async abort(error){await nativeSink.abort(error);begun=false;writeRecords=[];},
   async release(handle){const h=handles.get(handle);if(!h||h.nativeSink!==nativeSink)fail('INVALID_PACKAGE','Foreign adapter package');if(h.loading)fail('PACKAGE_IN_USE','Package load still in progress');if(h.released)return;await nativeSink.release(h.nativeHandle);h.released=true;},
  };
  return Object.freeze(api);
 }
 function captureContext(context){
  if(!context||typeof context!=='object')fail('INVALID_CONTEXT','Explicit diagnostic transaction context required');
  // Identity fields, signal and callback references are captured before awaits.
  // Owner/current callbacks still observe their caller-owned revision state.
  return Object.freeze({...context,selection:freeze(copy(context.selection))});
 }
 function contextNative(context,{cleanup=false}={}){
  const invocationCurrent=context?.isCurrent;
  return Object.freeze({...nativeIdentity,signal:context?.signal,isCurrent:cleanup
   ?()=>isOwnerCurrent()===true
   :()=>isOwnerCurrent()===true&&typeof invocationCurrent==='function'&&invocationCurrent()===true});
 }
 function targetForPlan(plan,input){
  const p=getPlan(plan),ref=reference(input);
  async function checkedContext(context){await p.ready;await identityV2(context,p.plan);context.signal?.throwIfAborted();if(typeof context.isCurrent!=='function'||context.isCurrent()!==true)fail('STALE_CONTEXT','Diagnostic application is not current');currentNative();return contextNative(context);}
  function candidate(value){const c=candidates.get(value);if(!c||c.plan!==p.plan)fail('INVALID_CANDIDATE','Foreign or unowned adapter candidate');return c;}
  return Object.freeze({
   contractVersion:CONTRACT_VERSION,
   async describe(){await p.ready;currentNative();return copy(registry);},
   async prepareLoad(handle,context){
    const captured=captureContext(context),nativeContext=await checkedContext(captured),h=handles.get(handle);if(!h||h.plan!==p.plan||h.released||h.manifest.bundleHash!==captured.bundleHash)fail('INVALID_PACKAGE','Released, foreign or wrong-plan package');
    const cleanupContext=contextNative(captured,{cleanup:true});
    h.loading++;try{const nativeCandidate=await consumer.prepareLoad(h.nativeHandle,nativeContext),value=Object.freeze({adapterId,candidateId:crypto.randomUUID(),planId:p.plan.planId});const c={plan:p.plan,nativeCandidate,nativeContext,cleanupContext,packageHash:h.nativeHandle.packageHash,released:false};candidates.set(value,c);p.candidates.add(c);return value;}finally{h.loading--;}
   },
   async validate(value,context){
    const captured=captureContext(context),nativeContext=await checkedContext(captured),c=candidate(value);if(c.released)fail('INVALID_CANDIDATE','Released adapter candidate');
    const receipt=await consumer.validate(c.nativeCandidate,{...nativeContext,x:ref.x,expected:ref.expected,tolerance:ref.tolerance});
    if(receipt?.schemaVersion!=='bernini-diagnostic-validation/0.1'||receipt.scope!=='PARTIAL'||receipt.modelInference!==false||receipt.candidateId!==c.nativeCandidate.candidateId||['modelHash','graphHash','registryHash','side'].some(k=>receipt[k]!==nativeIdentity[k])||receipt.packageHash!==c.packageHash)fail('INVALID_NATIVE_RECEIPT','Native validation scope/identity/package mismatch');
    return freeze({contractVersion:CONTRACT_VERSION,valid:receipt.valid===true,coverage:'PARTIAL',scope:'diagnostic-projection',planId:p.plan.planId,registryHash:p.plan.registryHash,sourceSha256:p.plan.sourceSha256,evidence:{adapterVersion:DIAGNOSTIC_ADAPTER_VERSION,nativeRegistryHash:native.registryHash,nativeReceipt:copy(receipt),basePassThrough:copy(passThrough.filter(x=>x.planId===p.plan.planId))}});
   },
   async commit(value,context){
    const captured=captureContext(context),nativeContext=await checkedContext(captured),c=candidate(value);if(c.released)fail('INVALID_CANDIDATE','Released adapter candidate');const receipt=await consumer.commit(c.nativeCandidate,nativeContext);
    if(receipt?.committed!==true||receipt.scope!=='PARTIAL'||receipt.modelInference!==false||receipt.packageHash!==c.packageHash||!Number.isSafeInteger(receipt.epoch)||receipt.epoch<1)fail('INVALID_NATIVE_RECEIPT','Native commit did not switch the diagnostic runtime feed');
    return freeze({contractVersion:CONTRACT_VERSION,state:'CONSUMER_APPLIED',planId:p.plan.planId,ownership:{kind:'independent-copy',ownerId:adapterId+':'+c.nativeCandidate.candidateId},evidence:{nativeCommit:copy(receipt),copyBoundary:'native prepareLoad creates an independent feed copy; active feed owns its bytes',coverage:'PARTIAL',modelInference:false}});
   },
   async rollback(value,context){
    if(value===undefined||value===null)return consumer.rollback(undefined,contextNative(context,{cleanup:true}));const c=candidate(value);if(c.released)return;
    // Cancellation invalidates the invocation, not the application owner's
    // authority to undo this candidate. Native candidate/epoch checks remain
    // authoritative, and an explicitly superseded owner cannot restore it.
    const result=await consumer.rollback(c.nativeCandidate,c.cleanupContext);c.released=true;p.candidates.delete(c);return result;
   },
  });
 }
 async function finalize(plan){const p=getPlan(plan);await p.ready;for(const c of [...p.candidates]){if(!c.released){await consumer.releaseCandidate(c.nativeCandidate);c.released=true;}p.candidates.delete(c);}}
 async function restoreBase(input){
  const ref=reference(input),captured=captureContext(input),signal=captured.signal,isCurrent=captured.isCurrent;if(typeof isCurrent!=='function')fail('CURRENT_REQUIRED','Explicit owner current callback required for base restoration');
  const context=contextNative(captured),cleanupContext=contextNative(captured,{cleanup:true});let value;
  try{signal?.throwIfAborted();currentNative();value=await consumer.prepareBase(context);const validation=await consumer.validate(value,{...context,...ref});if(validation?.valid!==true||validation.scope!=='PARTIAL'||validation.registryHash!==native.registryHash)fail('BASE_VALIDATION_FAILED','Immutable base candidate did not pass independent diagnostic reference');const committed=await consumer.commit(value,context);signal?.throwIfAborted();if(isOwnerCurrent()!==true||isCurrent()!==true)fail('STALE_CONTEXT','Base restoration application is no longer current');if(committed?.committed!==true||committed.scope!=='PARTIAL'||committed.modelInference!==false)fail('BASE_COMMIT_FAILED','Base feed did not commit');await consumer.releaseCandidate(value);return freeze({adapterVersion:DIAGNOSTIC_ADAPTER_VERSION,state:'CONSUMER_APPLIED',application:'IMMUTABLE_BASE',coverage:'PARTIAL',scope:'diagnostic-projection',nativeRegistryHash:native.registryHash,validation:copy(validation),commit:copy(committed),generationReady:false,snapshotPublished:false});}
  catch(error){await consumer.rollback(value,cleanupContext);throw error;}
 }
 return Object.freeze({registry,baseProvider,createSink,targetForPlan,finalize,restoreBase,async run({x,signal}={}){signal?.throwIfAborted();currentNative();const result=await consumer.run({x,signal});signal?.throwIfAborted();currentNative();return result;},async describeBinding(){return freeze({adapterVersion:DIAGNOSTIC_ADAPTER_VERSION,nativeRegistryHash:native.registryHash,connectionRegistryHash:await connectionHash,nativeRegistry:copy(native),connectionRegistry:copy(registry),offsetUnit:'elements in original full tensor mapped to native selected-slice elements',passThrough:copy(passThrough),generationReady:false});}});
}

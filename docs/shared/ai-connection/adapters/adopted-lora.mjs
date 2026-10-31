import {canonicalize,sha256Bytes} from '../canonical.mjs';

export const ADOPTED_LORA_VERSION='works-adopted-lora/0.1-draft.1';
const COMMIT='0c27874908638afc748ea2455a2779a16736730b';
const SDK='lora-connection/2.0-draft.1',OWNER='lora-diffusion-diagnostic-adapter/0.1';
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const ADOPTED_LORA_SOURCE=freeze({
 sdk:{commit:COMMIT,path:'docs/shared/inference/lora/sdk-v2.mjs',sha256:'c425519eb282f798f4296bc97fd1506664afd850dee9addb17af77dd41e39fa0'},
 adapter:{commit:COMMIT,path:'docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs',sha256:'bcea7b495e819d1e1052543f36cbdad0ed8515e74bd8914cf66dc03b093c6e4f'},
 kernel:{commit:COMMIT,path:'docs/shared/inference/lora/kernel/lora.wasm',sha256:'3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24',byteLength:5051},
 diffusion:{commit:'438972f30242e0a3bc66edb8591f38eaa0fcd384',path:'docs/shared/diffusion-models/lora/diagnostic-consumer.mjs',sha256:'fdac31542f87d68b9e01a1ba674ee9b60433cae685d6670222f8d914dd27f943'}
});
const clone=structuredClone,text=v=>typeof v==='string'&&v.length>0,hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const same=(a,b)=>{try{return canonicalize(a)===canonicalize(b);}catch{return false;}};
const cohort=t=>{const value=clone(t);delete value.requestId;return value;};
function sourcePinsChecked(value){
 canonicalize(value);const result=clone(value);
 for(const key of ['sdk','adapter','kernel','diffusion']){
  const pin=result?.[key],expected=ADOPTED_LORA_SOURCE[key];
  if(!pin||!text(pin.repository)||!/^[a-f0-9]{40}$/.test(pin.commit)||pin.path!==expected.path||pin.sha256!==expected.sha256||pin.commit!==expected.commit||key==='kernel'&&pin.byteLength!==expected.byteLength)fail('SOURCE_PIN_MISMATCH','Explicit original SDK/adapter/kernel/consumer pins must match this adopted source set.');
 }
 return freeze(result);
}
function referenceCopy(input){
 const floats=(v,n)=>v instanceof Float32Array&&v.length===n&&v.buffer instanceof ArrayBuffer&&v.byteOffset===0&&v.byteLength===v.buffer.byteLength&&v.every(Number.isFinite);
 if(!floats(input?.x,5120)||!floats(input?.expected,16)||!input.tolerance||!['absolute','relative'].every(k=>typeof input.tolerance[k]==='number'&&Number.isFinite(input.tolerance[k])&&input.tolerance[k]>=0))fail('INDEPENDENT_REFERENCE_REQUIRED','Explicit owned F32 activation/independent expected output and finite tolerances are required.');
 return {x:new Float32Array(input.x),expected:new Float32Array(input.expected),tolerance:{absolute:input.tolerance.absolute,relative:input.tolerance.relative}};
}

/** Adoption envelope only. All registry/offset/base/LoRA/sink/consumer numerical
 * behavior comes from the injected public owner adapter and native SDK. Caller
 * owns source verification, private File inputs, SDK/kernel/consumer lifetimes. */
export function createAdoptedLoraAdapter({ownerExports,sdk,consumer,baseProvider,sourcePins,resourceBinding,isOwnerCurrent}={}){
 if(ownerExports?.DIAGNOSTIC_ADAPTER_VERSION!==OWNER||typeof ownerExports.createDiffusionDiagnosticAdapter!=='function')fail('OWNER_ADAPTER_REQUIRED','Inject the exact public owner diagnostic adapter export/version.');
 if(sdk?.contractVersion!==SDK||!text(sdk.sdkInstanceId)||!['plan','prepare','stage','release','recover'].every(k=>typeof sdk[k]==='function'))fail('NATIVE_SDK_REQUIRED','Inject the public LoRA v2 SDK instance.');
 if(sdk.kernelInfo?.wasmSha256!==ADOPTED_LORA_SOURCE.kernel.sha256)fail('KERNEL_NOT_ADOPTED','The corrected latest owner kernel is required; no old-kernel fallback is implemented.');
 const pins=sourcePinsChecked(sourcePins),resource=freeze(clone(resourceBinding));
 if(!resource||!['ownerId','bindingId','resourceGeneration'].every(k=>text(resource[k]))||typeof isOwnerCurrent!=='function')fail('OWNER_BINDING_REQUIRED','Explicit current owner/resource generation is required.');
 const instanceId=sdk.sdkInstanceId,plans=new WeakMap(),preparedRecords=new WeakMap(),requests=new Set(),pendingReleases=new Set(),pendingRollbacks=new Set();let active=null,lastTarget=null,lastApplied=null;
 const ownerCurrent=()=>isOwnerCurrent(active?.target??lastTarget??{resourceBinding:resource})===true;
 const adopted=ownerExports.createDiffusionDiagnosticAdapter({consumer,baseProvider,isOwnerCurrent:ownerCurrent});
 if(!adopted||!['createSink','targetForPlan','finalize','restoreBase','run','describeBinding'].every(k=>typeof adopted[k]==='function')||adopted.registry?.contractVersion!==SDK)fail('OWNER_ADAPTER_INVALID','Owner factory did not return its public adapter contract.');
 function current(op,external){if(isOwnerCurrent(op.target)!==true||external&&external(op.target)!==true)fail('STALE_OWNER','Manager revision/resource owner is no longer current.');}
 function bindingTarget(input,expected){canonicalize(input);const t=freeze(clone(input));if(!text(t.managerSessionId)||!Number.isSafeInteger(t.managerRevision)||t.managerRevision<0||!text(t.requestId)||!same(t.resourceBinding,resource)||expected&&!same(cohort(t),expected))fail('TARGET_MISMATCH','Explicit manager/revision/resource target differs from this owned selection.');return t;}
 async function operation(phase,input,expected,fn,{cleanup=false,reuseTarget=false}={}){
  if(active)fail('OWNER_BUSY','Another adopted owner invocation has not reached its terminal state.');if(!cleanup&&(pendingReleases.size||pendingRollbacks.size))fail('RECOVERY_REQUIRED','Finish retained owner cleanup before starting another adopted invocation.');
  const target=bindingTarget(input,expected);if(!reuseTarget&&requests.has(target.requestId))fail('REQUEST_ID_REUSED','Use a unique explicit request ID for every invocation.');
  if(sdk.sdkInstanceId!==instanceId||sdk.kernelInfo?.wasmSha256!==pins.kernel.sha256)fail('NATIVE_BINDING_CHANGED','Injected SDK instance or kernel identity changed.');
  const op={phase,target};if(!cleanup)current(op);if(!reuseTarget)requests.add(target.requestId);active=op;lastTarget=target;
  try{return await fn(op);}finally{active=null;}
 }
 function planRecord(plan){const r=plans.get(plan);if(!r)fail('FOREIGN_PLAN','Pass the original plan returned by this adopted facade.');return r;}
 function preparedRecord(prepared){const r=preparedRecords.get(prepared);if(!r)fail('FOREIGN_PREPARED','Pass the exact opaque prepared object returned by this facade.');return r;}
 function nativeBindings(plan){return {sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision};}
 function management(op,plan){return freeze({adoptionVersion:ADOPTED_LORA_VERSION,ownerAdapterVersion:OWNER,target:clone(op.target),resourceBinding:clone(resource),sourcePins:clone(pins),kernelSha256:pins.kernel.sha256,localRevisionBindings:nativeBindings(plan),coverage:'PARTIAL',scope:'diagnostic-projection',generationReady:false});}
 function validatePlan(plan,nativeBinding){
  if(plan?.contractVersion!==SDK||plan.sdkInstanceId!==instanceId||plan.buildId!==pins.kernel.sha256||plan.coverage!=='PARTIAL'||plan.scope!=='diagnostic-projection'||plan.completeAdapter!==false||plan.generationReady!==false||!hex(plan.planId)||!hex(plan.sourceSha256)||!Number.isSafeInteger(plan.localInputRevision)||!Number.isSafeInteger(plan.localApplicationRevision)||plan.registryHash!==nativeBinding.connectionRegistryHash||!same(plan.registry,adopted.registry))fail('PLAN_BINDING_MISMATCH','Actual native plan/source/build/revisions must match the adopted diagnostic registry.');
 }
 function validationReceipt(value,r,refHash,tolerance){
  const native=value?.evidence?.nativeReceipt,registry=r.binding.nativeRegistry;
  if(value?.contractVersion!==SDK||value.valid!==true||value.coverage!=='PARTIAL'||value.scope!=='diagnostic-projection'||['planId','registryHash','sourceSha256'].some(k=>value[k]!==r.plan[k])||value.evidence?.adapterVersion!==OWNER||value.evidence?.nativeRegistryHash!==r.binding.nativeRegistryHash||native?.schemaVersion!=='bernini-diagnostic-validation/0.1'||native.valid!==true||native.scope!=='PARTIAL'||native.modelInference!==false||native.registryHash!==r.binding.nativeRegistryHash||native.modelHash!==registry.modelHash||native.graphHash!==registry.graphHash||!text(native.candidateId)||native.expectedSHA256!==refHash||!same(native.tolerance,tolerance)||native.evidence?.graphSHA256!==registry.graphHash)fail('NATIVE_VALIDATION_MISMATCH','Preserve the exact native PARTIAL source/graph/reference validation receipt.');
 }
 const api={contractVersion:ADOPTED_LORA_VERSION,registry:adopted.registry,
  async plan(input,{target}={}){return operation('plan',target,null,async op=>{
   if(!input||!Array.isArray(input.diagnostic?.targets)||!input.diagnostic.targets.length||input.registry!==undefined&&!same(input.registry,adopted.registry)||input.loaderPolicyId!==undefined&&input.loaderPolicyId!==adopted.registry.loaderPolicyId)fail('DIAGNOSTIC_SELECTION_REQUIRED','Explicit owner diagnostic targets and matching registry/loader are required.');
   const captured=clone(input),binding=clone(await adopted.describeBinding());current(op);if(binding.adapterVersion!==OWNER||!hex(binding.nativeRegistryHash)||!hex(binding.connectionRegistryHash))fail('OWNER_BINDING_MISMATCH','Owner adapter did not expose its dual registry identities.');
   const plan=await sdk.plan({...captured,registry:adopted.registry,loaderPolicyId:adopted.registry.loaderPolicyId});validatePlan(plan,binding);current(op);plans.set(plan,{plan,cohort:cohort(op.target),binding,prepared:null});return plan;
  });},
  async prepare(plan,{target,signal,blockRows=16,onBlock}={}){const r=planRecord(plan);return operation('prepare',target,r.cohort,async op=>{
   if(r.prepared)fail('PLAN_ALREADY_PREPARED','Use one prepared package per original plan.');if(onBlock!==undefined&&typeof onBlock!=='function')fail('INVALID_OBSERVER','onBlock must be an explicit local callback.');
   const ownerSink=adopted.createSink(plan),sink=Object.freeze({...ownerSink,async writeBlock(block){if(onBlock)await onBlock(clone(block),management(op,plan));current(op);await ownerSink.writeBlock(block);}});
   const prepared=await sdk.prepare(plan,{baseProvider:adopted.baseProvider,sink,blockRows,signal}),record={...r,prepared,sink,stage:null,released:false,finalized:false};preparedRecords.set(prepared,record);r.prepared=prepared;
   try{current(op);return prepared;}catch(error){pendingReleases.add(record);try{await sdk.release(prepared);record.released=true;pendingReleases.delete(record);}catch(cleanup){throw new AggregateError([error,cleanup],'Prepared source retained; call facade recovery.');}throw error;}
  });},
  async stage(prepared,validation,{target,isCurrent}={}){const r=preparedRecord(prepared);return operation('stage',target,r.cohort,async op=>{
   if(r.released||r.stage)fail('STAGE_ALREADY_COMPLETED','An exact live prepared package may stage only once through this facade.');if(typeof isCurrent!=='function')fail('CURRENT_TARGET_REQUIRED','Explicit manager currentness is required for staging.');
   const ref=referenceCopy(validation),refHash=await sha256Bytes(new Uint8Array(ref.expected.buffer));current(op,isCurrent);const ownerTarget=adopted.targetForPlan(r.plan,ref);let lateCandidate,lateContext;
   const guarded=Object.freeze({...ownerTarget,async prepareLoad(handle,context){const candidate=await ownerTarget.prepareLoad(handle,context);lateCandidate=candidate;lateContext=context;return candidate;},async validate(candidate,context){current(op,isCurrent);const receipt=await ownerTarget.validate(candidate,context);validationReceipt(receipt,r,refHash,ref.tolerance);return receipt;},async commit(candidate,context){current(op,isCurrent);return ownerTarget.commit(candidate,context);}});
   const receipt=await sdk.stage(prepared,guarded,{isCurrent:()=>isOwnerCurrent(op.target)===true&&isCurrent(op.target)===true});
   try{
   if(receipt.contractVersion!==SDK||receipt.state!=='CONSUMER_APPLIED'||receipt.sdkInstanceId!==instanceId||['localInputRevision','localApplicationRevision','planId','registryHash','sourceSha256'].some(k=>receipt[k]!==r.plan[k])||receipt.bundleHash!==prepared.manifest.bundleHash||receipt.coverage!=='PARTIAL'||receipt.scope!=='diagnostic-projection'||receipt.generationReady!==false||receipt.snapshotPublished!==false||receipt.ownership?.kind!=='independent-copy'||!text(receipt.ownership.ownerId))fail('NATIVE_STAGE_MISMATCH','Native stage receipt/source/ownership must remain intact; diagnostics cannot become generation acceptance.');
   current(op,isCurrent);const envelope=Object.freeze({receipt,management:management(op,r.plan)});r.stage=envelope;lastApplied=r;return envelope;
   }catch(error){
    if(lateCandidate!==undefined){r.pendingRollback=()=>ownerTarget.rollback(lateCandidate,lateContext);pendingRollbacks.add(r);try{await r.pendingRollback();r.pendingRollback=null;pendingRollbacks.delete(r);}catch(cleanup){throw new AggregateError([error,cleanup],'Native stage finished after manager supersession; owner cleanup must be recovered.');}}
    throw error;
   }
  });},
  async finalize(prepared,envelope,options={}){const r=preparedRecord(prepared);if(envelope!==r.stage||!envelope)fail('STAGE_ENVELOPE_MISMATCH','Only the exact terminal native stage envelope can finalize this plan.');return operation('finalize',options.target??envelope.management.target,r.cohort,async()=>{if(!r.finalized){await adopted.finalize(r.plan);r.finalized=true;}return {finalized:true,generationReady:false};},{cleanup:true,reuseTarget:options.target===undefined});},
  async release(prepared,{target}={}){const r=preparedRecord(prepared);return operation('release',target,r.cohort,async()=>{if(!r.released){await sdk.release(prepared);r.released=true;}return {released:true,generationReady:false};},{cleanup:true});},
  async run(input,{target}={}){if(!lastApplied)fail('NO_ADOPTED_APPLICATION','No adopted diagnostic application has completed.');return operation('run',target,lastApplied.cohort,async op=>{current(op);return adopted.run(input);});},
  async restoreBase(input,options={}){if(!lastApplied)fail('NO_ADOPTED_APPLICATION','Restore explicitly from an existing diagnostic application.');return operation('restoreBase',options.target,lastApplied.cohort,async op=>{const ref=referenceCopy(input),check=options.isCurrent??input?.isCurrent;if(typeof check!=='function')fail('CURRENT_TARGET_REQUIRED','Explicit currentness is required for immutable-base restoration.');return adopted.restoreBase({...ref,signal:input.signal,isCurrent:()=>isOwnerCurrent(op.target)===true&&check(op.target)===true});});},
  async recover(prepared,{target}={}){const r=prepared?preparedRecord(prepared):null;return operation('recover',target,r?.cohort??null,async()=>{await sdk.recover(prepared);for(const pending of [...pendingRollbacks]){await pending.pendingRollback();pending.pendingRollback=null;pendingRollbacks.delete(pending);}for(const pending of [...pendingReleases]){await sdk.release(pending.prepared);pending.released=true;pendingReleases.delete(pending);}return {recoveryCompleted:true,generationReady:false};},{cleanup:true});},
  async describeBinding(){return {owner:clone(await adopted.describeBinding()),management:{adoptionVersion:ADOPTED_LORA_VERSION,sourcePins:clone(pins),resourceBinding:clone(resource),kernelSha256:pins.kernel.sha256,sdkInstanceId:instanceId,generationReady:false}};}
 };
 return Object.freeze(api);
}

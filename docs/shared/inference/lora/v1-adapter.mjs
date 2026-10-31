import {validateTarget,objectHash,sha256} from './planner.mjs';
import {CONTRACT_VERSION,validateRegistryV2} from './planner-v2.mjs';
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
const registryHashV2=value=>sha256(new TextEncoder().encode(JSON.stringify(ordered(value))));

// An opt-in bridge for the documented v1 initializer/copy contract only.
// This does not certify a package, a model, or a legacy consumer's assertion.
export function adaptV1Registry(registry,options={}){
 const original=validateTarget(registry);
 const targets=original.targets.map(t=>{
  if(t.binding&&(t.binding.kind!=='initializer'||t.binding.name!==t.graphInitializer))throw Error('Unsupported v1 initializer binding');
  if(t.transform&&t.transform.kind!=='identity'||t.storageDtype&&t.storageDtype!=='F32'||t.computeDtype&&t.computeDtype!=='F32')throw Error('Unsupported v1 transform or dtype');
  const parameterRole=t.key.endsWith('.weight')?'weight':t.key.endsWith('.bias')?'bias':null;
  if(!parameterRole||t.parameterRole&&t.parameterRole!==parameterRole)throw Error('Unsupported or ambiguous v1 parameter role');
  return {key:t.key,weightId:t.weightId,module:t.module,shape:[...t.shape],dtype:t.dtype,layout:t.layout,parameterRole,binding:{kind:'initializer',name:t.graphInitializer},transform:{kind:'identity'}};
 });
 return validateRegistryV2({contractVersion:CONTRACT_VERSION,modelHash:original.modelHash,graphHash:original.graphHash,registryVersion:original.registryVersion,side:options.side,executionProfileId:options.executionProfileId,loaderPolicyId:options.loaderPolicyId,targets});
}

function full(context){
 if(context?.contractVersion!==CONTRACT_VERSION||context.coverage!=='FULL'||context.scope!=='full-adapter')throw Error('v1 adapter requires explicit FULL/full-adapter scope; PARTIAL is unsupported');
}
function blockV1(block,registry){
 if(block?.binding?.kind!=='initializer'||typeof block.binding.name!=='string'||!block.binding.name)throw Error('v1 sink adapter supports initializer blocks only');
 if(block.graphInitializer!==undefined&&block.graphInitializer!==block.binding.name)throw Error('Conflicting initializer binding');
 const {binding,fullShape,slice,...rest}=block,shape=fullShape??block.shape;
 const target=registry.targets.find(t=>t.weightId===block.weightId);
 if(!target||target.graphInitializer!==binding.name||JSON.stringify(target.shape)!==JSON.stringify(shape))throw Error('v1 block registry binding or shape mismatch');
 const total=shape.reduce((a,b)=>a*b,1);
 if(!Number.isSafeInteger(block.offset)||block.offset<0||!Number.isSafeInteger(block.count)||block.count<1||block.offset>total-block.count)throw Error('v1 block range exceeds full shape');
 return {...rest,shape:[...shape],graphInitializer:binding.name};
}
async function manifestV1(manifest,registry){
 full(manifest);
 const connectionV2=Object.fromEntries(Object.entries(manifest).filter(([key,value])=>key!=='signal'&&typeof value!=='function'));
 const result={apiVersion:1,buildId:manifest.buildId,planId:manifest.planId,jobId:manifest.jobId,inputRevision:manifest.localInputRevision,applicationRevision:manifest.localApplicationRevision,modelHash:manifest.modelHash,graphHash:manifest.graphHash,adapterSetHash:await objectHash({bridgeVersion:CONTRACT_VERSION,selection:manifest.selection,strength:manifest.strength,sourceSha256:manifest.sourceSha256,loaderPolicyId:manifest.loaderPolicyId}),registryVersion:registry.registryVersion,registryHash:await objectHash(registry),kernel:manifest.kernel,selection:manifest.selection,strength:manifest.strength,sourceIntegrity:'whole-file-sha256-verified; header-and-ranges-validated',sourceSha256:manifest.sourceSha256,blocks:(manifest.blocks??[]).map(b=>blockV1(b,registry)),complete:manifest.complete,connectionRegistryHash:manifest.registryHash,connectionV2};
 if(manifest.complete===true)result.bundleHash=await objectHash(result);
 return result;
}
export function createV1SinkAdapter(sink,{registry}={}){
 if(!['begin','writeBlock','finish','abort','release'].every(k=>typeof sink?.[k]==='function'))throw Error('Complete v1 sink required');
 const nativeRegistry=validateTarget(registry);
 let active=false;
 return Object.freeze({
  async begin(manifest){const legacy=await manifestV1(manifest,nativeRegistry);if(active)throw Error('v1 sink transaction already active');active=true;return sink.begin(legacy);},
  async writeBlock(block){if(!active)throw Error('v1 sink transaction not active');return sink.writeBlock(blockV1(block,nativeRegistry));},
  async finish(manifest){if(!active)throw Error('v1 sink transaction not active');const result=await sink.finish(await manifestV1(manifest,nativeRegistry));active=false;return result;},
  async abort(error){try{return await sink.abort(error);}finally{active=false;}},
  async release(handle){return sink.release(handle);}
 });
}
function owner(value){
 if(!value||!['independent-copy','lease'].includes(value.kind)||typeof value.ownerId!=='string'||!value.ownerId||value.ownerId.length>128)throw Error('Explicit session bytes ownership and ownerId required');
 if(value.kind==='lease'&&typeof value.isValid!=='function')throw Error('Lease ownership requires isValid()');
 return Object.freeze({...value});
}
function current(context){context.signal?.throwIfAborted();if(typeof context.isCurrent!=='function'||context.isCurrent()!==true)throw Error('Stale v1 consumer transaction; current check failed');}
function validOwner(ownership){if(ownership.kind==='lease'&&ownership.isValid()!==true)throw Error('Session bytes lease is not valid');}
export function adaptV1Consumer(target,options={}){
 if(options.validationScope!=='full-adapter')throw Error('Explicit full-adapter validation scope required');
 const ownership=owner(options.ownership),settings=Object.freeze({...options});
 const candidates=new WeakMap(),failedContexts=new Map();
 if(!['describe','prepareLoad','validate','commit','rollback'].every(k=>typeof target?.[k]==='function'))throw Error('Complete v1 consumer transaction required');
 // Refuse unsafe declared connections before any legacy operation is dispatched.
 if(target.stagingOnly===true||target.stageOnly===true||target.applicationMode==='staging')throw Error('Staging-only consumer is incompatible with v1 apply');
 async function legacy(context){
  full(context);current(context);
  const registry=validateTarget(await target.describe());current(context);
  const adapted=adaptV1Registry(registry,settings);
  if(await registryHashV2(adapted)!==context.registryHash)throw Error('v1 consumer registry identity changed');
  if(context.modelHash!==undefined&&registry.modelHash!==context.modelHash||context.graphHash!==undefined&&registry.graphHash!==context.graphHash)throw Error('v1 consumer model or graph identity changed');
  const converted=await manifestV1(context,registry);current(context);
  return {...converted,signal:context.signal,isCurrent:context.isCurrent};
 }
 function owned(candidate,context){const value=candidate&&typeof candidate==='object'?candidates.get(candidate):null;if(!value||value.planId!==context.planId)throw Error('Foreign or released v1 candidate');return value;}
 return Object.freeze({
  contractVersion:CONTRACT_VERSION,
  async describe(){return adaptV1Registry(await target.describe(),settings);},
  async prepareLoad(handle,context){
   const nativeContext=await legacy(context);
   try{const value=await target.prepareLoad(handle,nativeContext),candidate=Object.freeze({});candidates.set(candidate,{value,planId:context.planId,context:nativeContext});return candidate;}
   catch(error){failedContexts.set(context.planId,nativeContext);throw error;}
  },
  async validate(candidate,context){
   const nativeContext=await legacy(context),value=owned(candidate,context);
   const result=await target.validate(value.value,nativeContext);current(context);
   return Object.freeze({contractVersion:CONTRACT_VERSION,valid:result===true,coverage:'FULL',scope:'full-adapter',planId:context.planId,registryHash:context.registryHash,sourceSha256:context.sourceSha256,evidence:Object.freeze({kind:'legacy-boolean',declaredScope:'full-adapter',modelValidation:'not-independently-verified'})});
  },
  async commit(candidate,context){
   const nativeContext=await legacy(context);validOwner(ownership);current(context);const value=owned(candidate,context);
   const result=await target.commit(value.value,nativeContext);
   if(result?.state!==undefined&&result.state!=='CONSUMER_APPLIED')throw Error('v1 consumer returned a staging or unknown application state');
   if(result?.ownership!==undefined&&(result.ownership.kind!==ownership.kind||result.ownership.ownerId!==ownership.ownerId))throw Error('v1 consumer bytes ownership differs from declared contract');
   validOwner(ownership);
   return Object.freeze({contractVersion:CONTRACT_VERSION,state:'CONSUMER_APPLIED',planId:context.planId,ownership,evidence:Object.freeze({kind:'legacy-v1-commit',modelApplication:'consumer-declared'})});
  },
  // Rollback deliberately reaches the legacy owner even after cancellation.
  // That owner still must compare candidate identity before changing active state.
  async rollback(candidate,context){
   const value=candidate&&typeof candidate==='object'?candidates.get(candidate):null;
   if(candidate!==undefined&&(!value||value.planId!==context.planId))throw Error('Foreign or released v1 candidate');
   const previous=value?.context??failedContexts.get(context.planId);
   // Keep the candidate's native package identity. Only cancellation/currentness
   // is refreshed; overwriting native blocks/hash with v2 fields breaks recovery.
   if(!previous)return;
   const result=await target.rollback(value?.value,{...previous,signal:context.signal,isCurrent:context.isCurrent});
   if(value)candidates.delete(candidate);failedContexts.delete(context.planId);return result;
  }
 });
}

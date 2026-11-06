import {freeze} from './planner.mjs';
import {LOADER_POLICY_ID} from './loader-policy.mjs';
import {BERNINI_TARGETS} from './bernini-targets.mjs';

export const STANDALONE_CONTRACT_VERSION='lora-standalone/1.0-draft.1';
export const BERNINI_MAPPING_VERSION='bernini-comfy-canonical/1.0';
const SHA=/^[a-f0-9]{64}$/i;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const text=v=>typeof v==='string'&&v.length>0&&v.trim()===v;
function keys(value,allowed,label){if(!plain(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('Unsupported or unknown '+label+' field');}
function shape(value){
 if(!Array.isArray(value)||value.length<1||value.length>2||value.some(n=>!Number.isSafeInteger(n)||n<1)||!Number.isSafeInteger(value.reduce((a,b)=>a*b,1)))throw Error('Unsupported or invalid logical target full shape');
}

// Logical binding names address the caller's standalone provider/consumer.
// They do not assert that an ORT initializer or runtime program slot exists.
export function validateStandaloneRegistry(registry){
 keys(registry,['contractVersion','modelHash','registryVersion','side','loaderPolicyId','mappingVersion','targets'],'standalone registry');
 if(registry.contractVersion!==STANDALONE_CONTRACT_VERSION||typeof registry.modelHash!=='string'||!SHA.test(registry.modelHash)||!text(registry.registryVersion)||!['HIGH','LOW'].includes(registry.side)||registry.loaderPolicyId!==LOADER_POLICY_ID||!text(registry.mappingVersion)||!Array.isArray(registry.targets)||registry.targets.length<1)throw Error('Invalid standalone registry identity, side or loader policy');
 const seenKeys=new Set(),seenIds=new Set(),seenBindings=new Set();
 for(const target of registry.targets){
  keys(target,['key','weightId','fullShape','dtype','layout','parameterRole','logicalBinding'],'standalone target');
  if(!text(target.key)||!text(target.weightId)||target.dtype!=='F32'||target.layout!=='row-major'||!['weight','bias'].includes(target.parameterRole)||!target.key.endsWith('.'+target.parameterRole))throw Error('Unsupported logical target identity, dtype or parameter role');
  shape(target.fullShape);
  keys(target.logicalBinding,['kind','name'],'logical binding');
  if(target.logicalBinding.kind!=='logical-'+target.parameterRole||!text(target.logicalBinding.name))throw Error('Unsupported logical target binding');
  const binding=target.logicalBinding.kind+':'+target.logicalBinding.name;
  if(seenKeys.has(target.key)||seenIds.has(target.weightId)||seenBindings.has(binding))throw Error('Duplicate logical target or binding');
  seenKeys.add(target.key);seenIds.add(target.weightId);seenBindings.add(binding);
 }
 return freeze(structuredClone(registry));
}

const logicalTargets=BERNINI_TARGETS.filter(t=>t.shape.length<=2&&/\.(weight|bias)$/.test(t.key));
const canonical=new Map(logicalTargets.map(t=>[t.canonical,t]));

export function createBerniniStandaloneRegistry({modelHash,side,targets}={}){
 const selected=targets===undefined?logicalTargets.map(t=>({
  key:t.canonical,weightId:t.key,fullShape:[...t.shape],dtype:'F32',layout:'row-major',parameterRole:t.key.endsWith('.bias')?'bias':'weight',
  logicalBinding:{kind:t.key.endsWith('.bias')?'logical-bias':'logical-weight',name:t.key}
 })):targets;
 const registry=validateStandaloneRegistry({contractVersion:STANDALONE_CONTRACT_VERSION,modelHash,registryVersion:'bernini-standalone-targets/1.0',side,loaderPolicyId:LOADER_POLICY_ID,mappingVersion:BERNINI_MAPPING_VERSION,targets:selected});
 for(const target of registry.targets){
  const original=canonical.get(target.key);
  if(!original)throw Error('Unknown Bernini logical target '+target.key);
  if(JSON.stringify(target.fullShape)!==JSON.stringify(original.shape))throw Error('Bernini logical target full shape mismatch '+target.key);
 }
 return registry;
}

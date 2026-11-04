import {createBerniniStandaloneRegistry,validateStandaloneRegistry,STANDALONE_CONTRACT_VERSION} from '../../inference/lora/standalone-registry.mjs';
import {BERNINI_TARGETS,TARGET_PROVENANCE} from '../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';
import {MODEL_WEIGHT_SCHEMA,MODEL_WEIGHT_PROFILE} from './model-weights.mjs';

export {STANDALONE_CONTRACT_VERSION};
export const LORA_MAPPING_SOURCE='6d0c8df4cd4992f26745d2d26394f5e194d2567f';
export const clone=value=>structuredClone(value);
export const equal=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
export function canonicalJSON(value){
 const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
 return JSON.stringify(ordered(value));
}
export async function hashMetadata(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJSON(value)))),v=>v.toString(16).padStart(2,'0')).join('');}
export function weightError(code,message){return Object.assign(new Error(message),{code});}
const typed=Object.getPrototypeOf(Float32Array.prototype),slot=Object.fromEntries(['buffer','byteOffset','byteLength','length'].map(k=>[k,Object.getOwnPropertyDescriptor(typed,k).get]));
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
export function ownedF32(value,count){
 const fail=()=>{throw TypeError('Compact owned nonshared finite F32 weight block required');};
 if(Object.getPrototypeOf(value??{})!==Float32Array.prototype)fail();
 let buffer;try{buffer=slot.buffer.call(value);if(Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||slot.byteOffset.call(value)!==0||slot.byteLength.call(value)!==bufferLength.call(buffer)||slot.length.call(value)!==count)fail();}catch{fail();}
 const result=new Float32Array(value);for(let i=0;i<count;i++)if(!Number.isFinite(result[i]))fail();return result;
}

/** Logical registry stays verbatim LoRA schema. Native operators are a separate
 * descriptor: a logical name is never relabelled as an ONNX initializer. */
export async function createFullModelWeightBindings({source,registry:inputRegistry,side}={}){
 if(!['describe','readRows','readVector','stats'].every(k=>typeof source?.[k]==='function'))throw TypeError('Immutable full-model source required');
 const original=clone(source.describe());side??=original.side;
 const pinned=TARGET_PROVENANCE.models.find(m=>m.name.includes(side));
 if(!pinned||original.schemaVersion!==MODEL_WEIGHT_SCHEMA||original.executionProfileId!==MODEL_WEIGHT_PROFILE||original.side!==side||original.modelHash!==BASE_MODEL_HASHES[side]||original.headerSHA256!==pinned.headerSHA256||original.fileBytes!==pinned.fileBytes||original.pinnedCoreCommit!==TARGET_PROVENANCE.pinnedComfyCommit||original.targetCount!==1095||original.blockCount!==40||Object.keys(original.entries??{}).length!==1095)throw TypeError('Original full-model identity/target coverage required');
 for(const target of BERNINI_TARGETS){
  const entry=original.entries[target.key],matrix=target.key.endsWith('.weight')&&target.shape.length>=2,columns=matrix?target.shape.slice(1).reduce((a,b)=>a*b,1):null;
  if(!entry||!equal(entry.fullShape,target.shape)||entry.originalKey!==target.key||entry.computeDtype!=='F32'||!['F16','F8_E4M3'].includes(entry.storageDtype)||entry.columns!==columns||entry.binding?.kind!==(matrix?'runtime-input':'hike-parameter')||entry.binding?.name!==target.key||entry.operatorBinding?.programSlot!==target.key||(matrix&&(!Number.isSafeInteger(entry.maxRows)||entry.maxRows<1||entry.maxRows>16)))throw TypeError('Original target shape/dtype/operator binding mismatch: '+target.key);
 }
 const registry=validateStandaloneRegistry(inputRegistry??createBerniniStandaloneRegistry({modelHash:original.modelHash,side}));
 const canonical=createBerniniStandaloneRegistry({modelHash:original.modelHash,side}),byKey=new Map(canonical.targets.map(t=>[t.key,t]));
 if(registry.side!==side||registry.modelHash!==original.modelHash)throw TypeError('Logical registry base/side identity mismatch');
 for(const target of registry.targets)if(!equal(target,byKey.get(target.key)))throw TypeError('Canonical logical target mapping mismatch: '+target.key);
 const registryHash=await hashMetadata(registry),logicalIds=new Set(registry.targets.map(t=>t.weightId));
 const targets=registry.targets.map(t=>{const entry=original.entries[t.weightId];return {...clone(t),originalKey:entry.originalKey,storageDtype:entry.storageDtype,computeDtype:entry.computeDtype,binding:clone(entry.binding),operatorBinding:clone(entry.operatorBinding),transform:clone(entry.transform??{kind:'identity'}),fp8ProfileId:entry.fp8ProfileId??null,scale:entry.scale??null,scaleSource:clone(entry.scaleSource??null),quantConfigSource:clone(entry.quantConfigSource??null)};});
 const body={schemaVersion:'bernini-full-model-logical-native-bindings/1',mappingSource:LORA_MAPPING_SOURCE,logicalRegistryHash:registryHash,modelHash:original.modelHash,side,headerSHA256:original.headerSHA256,fileBytes:original.fileBytes,pinnedCoreCommit:original.pinnedCoreCommit,executionProfileId:original.executionProfileId,nativeTargetCount:1095,logicalTargetCount:registry.targets.length,targets,baseOnlyTargets:BERNINI_TARGETS.filter(t=>!logicalIds.has(t.key)).map(t=>({originalKey:t.key,fullShape:t.shape.slice(),reason:t.shape.length>2?'LORA_LOGICAL_RANK_UNSUPPORTED':'OUTSIDE_LOGICAL_REGISTRY'})),graphBinding:'EXPLICIT_NATIVE_READER_OPERATOR',trainingBaseVerified:false,fullFileSHA256Verified:original.fullFileSHA256Verified===true};
 return {original,registry,registryHash,bindingDescriptor:{...body,bindingHash:await hashMetadata(body)}};
}

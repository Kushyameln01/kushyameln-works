// Canonical logical correspondence stays with LoRA. Storage decode/operator slots
// are described by the caller's immutable Diffusion owner, never reimplemented.
import {BERNINI_TARGETS} from './bernini-targets.mjs';
import {createBerniniStandaloneRegistry} from './standalone-registry.mjs';
import {freeze,sha256} from './planner.mjs';
export const MODEL_CONNECTION_VERSION='lora-diffusion-model/1.0-draft.1';
export const MODEL_SOURCE_SCHEMA='bernini-full-model-original-weights/0.1';
export const MODEL_SOURCE_PROFILE='bernini-40-block-prefix-head-f32-v1';
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
export const connectionJSON=v=>JSON.stringify(ordered(v));
export const connectionHash=v=>sha256(new TextEncoder().encode(connectionJSON(v)));
export const connectionSame=(a,b)=>connectionJSON(a)===connectionJSON(b);
export function buildDiffusionModelBindings(input){
 const d=structuredClone(input),limits=d?.resourceLimits;
 if(d?.schemaVersion!==MODEL_SOURCE_SCHEMA||d.executionProfileId!==MODEL_SOURCE_PROFILE||!['HIGH','LOW'].includes(d.side)||!/^[a-f0-9]{64}$/i.test(d.modelHash??'')||d.completedWeightPort||d.packageHash!==null)throw Error('Original immutable full-model source identity required');
 if(!d.entries||Object.keys(d.entries).length!==BERNINI_TARGETS.length||d.targetCount!==BERNINI_TARGETS.length)throw Error('All1095 original source targets required');
 if(!Number.isSafeInteger(limits?.maxBlockElements)||limits.maxBlockElements<1||limits.maxBlockElements>81920||!Number.isSafeInteger(limits.maxRows)||limits.maxRows<1||limits.maxRows>16)throw Error('Unsupported native block limits');
 const registry=createBerniniStandaloneRegistry({modelHash:d.modelHash,side:d.side}),byKey=new Map(registry.targets.map(t=>[t.weightId,t])),targets=[],excludedOriginalTargets=[];
 for(const original of BERNINI_TARGETS){
  const e=d.entries[original.key],logical=byKey.get(original.key);
  if(!e||e.originalKey!==original.key||e.weightId!==original.key||e.key!==original.canonical||!connectionSame(e.fullShape,original.shape)||e.layout!=='row-major'||e.computeDtype!=='F32'||!['F16','F8_E4M3'].includes(e.storageDtype))throw Error('Original full-shape/dtype/identity mismatch '+original.key);
  if(!logical){excludedOriginalTargets.push({originalKey:e.originalKey,fullShape:e.fullShape,storageDtype:e.storageDtype,computeDtype:e.computeDtype,binding:e.binding,operatorBinding:e.operatorBinding,reason:'No supported1D/2D LoRA weight/bias target; retain immutable base',basePreserved:true});continue;}
  if(e.transform?.kind!=='identity'||e.transform.transpose!==false||Object.hasOwn(e,'graphInitializer'))throw Error('Unsupported transform/transpose or initializer alias '+original.key);
  const matrix=logical.fullShape.length===2,role=matrix?'runtime-input':'hike-parameter',columns=matrix?logical.fullShape[1]:null;
  if(Object.keys(e.binding??{}).some(k=>!['kind','name'].includes(k))||Object.keys(e.operatorBinding??{}).some(k=>!(matrix?['programSlot','graphInput','operator','blockIndex','kind']:['programSlot','hikeExport','hikeParameter','operator','blockIndex','kind']).includes(k))||e.columns!==columns||e.binding?.kind!==role||e.binding.name!==e.weightId||e.operatorBinding?.programSlot!==e.weightId||typeof e.operatorBinding.operator!=='string'||!e.operatorBinding.operator)throw Error('Original binding/operator mismatch '+original.key);
  if(matrix&&(e.operatorBinding.graphInput!=='weight'||e.operatorBinding.kind!=='linear'||!connectionSame(e.allowedRows,[0,e.fullShape[0]])||!Number.isSafeInteger(e.maxRows)||e.maxRows<1||e.maxRows>Math.min(limits.maxRows,Math.floor(limits.maxBlockElements/columns))))throw Error('Unsupported runtime-input binding or row range '+original.key);
  if(!matrix&&(!['Norm','AddBias'].includes(e.operatorBinding.hikeExport)||e.operatorBinding.hikeParameter!==logical.parameterRole||!connectionSame(e.allowedElements,[0,e.fullShape[0]])||!Number.isSafeInteger(e.maxElements)||e.maxElements<1||e.maxElements>limits.maxBlockElements))throw Error('Unsupported hike-parameter binding or element range '+original.key);
  if(e.storageDtype==='F8_E4M3'&&(e.fp8ProfileId!=='scaled-e4m3fn-scalar-f32-v1'||!Number.isFinite(e.scale)||e.scale<=0||!Number.isFinite(Math.fround(e.scale))||Math.fround(e.scale)<=0||e.scaleSource?.storageDtype!=='F32'||e.quantConfigSource?.storageDtype!=='U8'))throw Error('Unknown FP8 scale/decode profile '+original.key);
  targets.push({key:logical.key,weightId:logical.weightId,fullShape:logical.fullShape,layout:logical.layout,parameterRole:logical.parameterRole,storageDtype:e.storageDtype,computeDtype:e.computeDtype,binding:e.binding,operatorBinding:e.operatorBinding,transform:e.transform,fullSelection:{startRow:0,rowCount:e.fullShape[0]},nativeMaxElements:limits.maxBlockElements,...(matrix?{nativeMaxRows:e.maxRows,columns}:{nativeMaxElements:e.maxElements}),fp8ProfileId:e.fp8ProfileId??null,decodeOwner:'Diffusion immutable source',scaleSource:e.scaleSource??null});
 }
 return freeze({registry,description:d,report:{contractVersion:MODEL_CONNECTION_VERSION,side:d.side,modelHash:d.modelHash,sourceSchema:d.schemaVersion,executionProfileId:d.executionProfileId,targets,excludedOriginalTargets,supportedBindings:['runtime-input','hike-parameter'],unsupportedBindings:['initializer'],coordinateSpace:'original-full-tensor-elements',loaderPolicyId:registry.loaderPolicyId,mappingVersion:registry.mappingVersion,bindingState:'IMPLEMENTED_SOURCE_PORT',trainingBaseVerified:false,generationReady:false}});
}

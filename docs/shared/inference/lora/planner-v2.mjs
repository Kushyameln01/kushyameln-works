import {freeze} from './planner.mjs';
import {LOADER_POLICY_ID,effectiveScale} from './loader-policy.mjs';
export {LOADER_POLICY_ID} from './loader-policy.mjs';
export const CONTRACT_VERSION='lora-connection/2.0-draft.1';
const SHA=/^[a-f0-9]{64}$/i;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const text=v=>typeof v==='string'&&v.length>0&&v.trim()===v;
function keys(v,allowed,label){if(!plain(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw Error('Unsupported or unknown '+label+' field');}
function shape(v,label,scalar=false){
 if(!Array.isArray(v)||v.length>(scalar?0:2)||(!scalar&&v.length<1)||v.some(n=>!Number.isSafeInteger(n)||n<1)||!Number.isSafeInteger(v.reduce((a,b)=>a*b,1)))throw Error('Unsupported or invalid '+label+' shape');
 return [...v];
}

export function validateRegistryV2(registry){
 keys(registry,['contractVersion','modelHash','graphHash','registryVersion','side','executionProfileId','loaderPolicyId','targets'],'registry');
 if(registry.contractVersion!==CONTRACT_VERSION||!SHA.test(registry.modelHash)||!SHA.test(registry.graphHash)||!text(registry.registryVersion)||!['HIGH','LOW'].includes(registry.side)||!text(registry.executionProfileId)||registry.loaderPolicyId!==LOADER_POLICY_ID||!Array.isArray(registry.targets)||registry.targets.length<1)throw Error('Invalid registry identity or loader policy');
 const seenKeys=new Set(),seenIds=new Set(),seenBindings=new Set();
 for(const target of registry.targets){
  keys(target,['key','weightId','module','shape','dtype','layout','parameterRole','binding','transform'],'target');
  if(!text(target.key)||!text(target.weightId)||!text(target.module)||target.dtype!=='F32'||target.layout!=='row-major'||!['weight','bias'].includes(target.parameterRole)||!target.key.endsWith('.'+target.parameterRole))throw Error('Unsupported target identity, dtype or parameter role');
  shape(target.shape,'target');keys(target.binding,['kind','name'],'binding');keys(target.transform,['kind'],'transform');
  if(!['runtime-input','initializer','hike-parameter'].includes(target.binding.kind)||!text(target.binding.name)||target.transform.kind!=='identity')throw Error('Unsupported binding or transform');
  const address=target.binding.kind+':'+target.binding.name;
  if(seenKeys.has(target.key)||seenIds.has(target.weightId)||seenBindings.has(address))throw Error('Duplicate target or binding');
  seenKeys.add(target.key);seenIds.add(target.weightId);seenBindings.add(address);
 }
 return freeze(structuredClone(registry));
}

// Classify and validate the entire original header before choosing diagnostics.
// In particular an unknown/unsupported tensor is not excused by an exclusion.
function classify(inspection,{loaderPolicyId,strength,alphaValues}){
 if(!plain(inspection)||!plain(inspection.tensors))throw Error('Invalid original tensor inspection');
 if(!plain(alphaValues))throw Error('Invalid alpha values');
 const groups=new Map();
 const suffixes=[['.lora_down.weight','down','linear-down-up'],['.lora_up.weight','up','linear-down-up'],['.lora_A.weight','down','linear-a-b'],['.lora_B.weight','up','linear-a-b'],['.alpha','alpha'],['.diff_b','bias'],['.diff','diff']];
 for(const [name,t] of Object.entries(inspection.tensors)){
  if(!plain(t)||!['BF16','F16','F32'].includes(t.dtype))throw Error('Unsupported original tensor dtype '+name);
  const match=suffixes.find(([suffix])=>name.endsWith(suffix));
  if(!match)throw Error('Unsupported or unknown original tensor '+name);
  const [suffix,part,variant]=match,stem=name.slice(0,-suffix.length);
  if(!text(stem))throw Error('Invalid original target stem');
  shape(t.shape,'original tensor '+name,part==='alpha');
  const group=groups.get(stem)??{stem};
  if(group[part]||(variant&&group.variant&&group.variant!==variant))throw Error('Unsupported mixed or duplicate factor dialect '+stem);
  if(variant)group.variant=variant;group[part]=name;groups.set(stem,group);
 }
 for(const name of Object.keys(alphaValues))if(!Object.hasOwn(inspection.tensors,name)||!name.endsWith('.alpha'))throw Error('Unknown alpha value '+name);
 const patches=[];
 function add(g,key,kind,names,fullShape,variant,extra={}){
  const alpha=extra.alpha??null,rank=extra.rank;
  patches.push({key,kind,names,fullShape,variant,...extra,scale:effectiveScale({loaderPolicyId,strength,variant,rank,alpha})});
 }
 for(const g of groups.values()){
  if(g.down||g.up){
   if(!g.down||!g.up||g.diff)throw Error('Unsupported incomplete or conflicting factor patch '+g.stem);
   const a=inspection.tensors[g.down].shape,b=inspection.tensors[g.up].shape;
   if(a.length!==2||b.length!==2||a[0]!==b[1])throw Error('Unsupported non-linear or mismatching rank shape '+g.stem);
   const alpha=g.alpha?alphaValues[g.alpha]:null;
   if(g.alpha&&!Number.isFinite(alpha))throw Error('Missing or invalid decoded alpha '+g.alpha);
   add(g,g.stem+'.weight','lora',[g.down,g.up,...g.alpha?[g.alpha]:[]],[b[0],a[1]],g.variant,{rank:a[0],alpha,alphaName:g.alpha??null,downName:g.down,upName:g.up});
  }else if(g.alpha)throw Error('Unsupported orphan alpha '+g.stem);
  if(g.diff)add(g,g.stem+'.weight','diff',[g.diff],[...inspection.tensors[g.diff].shape],'additive-diff',{deltaName:g.diff});
  if(g.bias)add(g,g.stem+'.bias','diff',[g.bias],[...inspection.tensors[g.bias].shape],'additive-diff-b',{deltaName:g.bias});
 }
 if(!patches.length)throw Error('No supported original patches');
 if(patches.reduce((n,p)=>n+p.names.length,0)!==Object.keys(inspection.tensors).length)throw Error('Incomplete original tensor coverage');
 return patches;
}

export function buildPlanV2({inspection,registry,diagnostic,sourceSha256,strength,loaderPolicyId,alphaValues={}}={}){
 if(loaderPolicyId!==LOADER_POLICY_ID)throw Error('Unsupported or missing loader policy');
 if(typeof sourceSha256!=='string'||!SHA.test(sourceSha256))throw Error('Verified whole source SHA-256 required');
 const boundRegistry=validateRegistryV2(registry);
 if(boundRegistry.loaderPolicyId!==loaderPolicyId)throw Error('Registry loader policy mismatch');
 const patches=classify(inspection,{loaderPolicyId,strength,alphaValues});
 const byKey=new Map(boundRegistry.targets.map(t=>[t.key,t])),byPatch=new Map(patches.map(p=>[p.key,p]));
 let selected;
 if(diagnostic!==undefined){
  keys(diagnostic,['targets'],'diagnostic');
  if(!Array.isArray(diagnostic.targets)||diagnostic.targets.length<1)throw Error('Empty or invalid diagnostic targets');
  selected=new Map();
  for(const entry of diagnostic.targets){
   keys(entry,['key','slice'],'diagnostic target');keys(entry.slice,['startRow','rowCount'],'diagnostic slice');
   const patch=byPatch.get(entry.key),{startRow,rowCount}=entry.slice;
   if(!patch||!byKey.has(entry.key))throw Error('Missing diagnostic patch or registry target '+entry.key);
   if(selected.has(entry.key))throw Error('Duplicate diagnostic target '+entry.key);
   if(!Number.isSafeInteger(startRow)||startRow<0||!Number.isSafeInteger(rowCount)||rowCount<1||startRow>patch.fullShape[0]-rowCount)throw Error('Invalid diagnostic slice bounds '+entry.key);
   selected.set(entry.key,{startRow,rowCount});
  }
 }
 const operations=[],includedPatches=[],excludedTargets=[],excludedRegions=[];
 for(const patch of patches){
  const description={key:patch.key,variant:patch.variant,names:[...patch.names],fullShape:[...patch.fullShape]};
  if(selected&&!selected.has(patch.key)){excludedTargets.push({...description,reason:'outside-diagnostic-selection'});continue;}
  const target=byKey.get(patch.key);
  if(!target)throw Error('Missing target '+patch.key);
  if(JSON.stringify(patch.fullShape)!==JSON.stringify(target.shape))throw Error('Original full target shape mismatch '+patch.key);
  const slice=selected?.get(patch.key)??{startRow:0,rowCount:patch.fullShape[0]};
  operations.push({...patch,target,slice:{...slice}});includedPatches.push({...description,slice:{...slice}});
  if(slice.startRow>0)excludedRegions.push({...description,slice:{startRow:0,rowCount:slice.startRow},reason:'outside-selected-slice'});
  const end=slice.startRow+slice.rowCount;
  if(end<patch.fullShape[0])excludedRegions.push({...description,slice:{startRow:end,rowCount:patch.fullShape[0]-end},reason:'outside-selected-slice'});
 }
 const partial=selected!==undefined;
 return freeze({contractVersion:CONTRACT_VERSION,coverage:partial?'PARTIAL':'FULL',completeAdapter:!partial,sourceSha256,strength,loaderPolicyId,registry:boundRegistry,operations,includedPatches,excludedTargets,excludedRegions});
}

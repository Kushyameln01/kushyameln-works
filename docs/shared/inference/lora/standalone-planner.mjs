import {freeze} from './planner.mjs';
import {classifyPatchesV2} from './planner-v2.mjs';
import {LOADER_POLICY_ID} from './loader-policy.mjs';
import {STANDALONE_CONTRACT_VERSION,validateStandaloneRegistry} from './standalone-registry.mjs';

const SHA=/^[a-f0-9]{64}$/i;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
function keys(value,allowed,label){if(!plain(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('Unsupported or unknown '+label+' field');}

export function buildStandalonePlan({inspection,registry,sourceSha256,strength,loaderPolicyId,alphaValues={},selections}={}){
 if(loaderPolicyId!==LOADER_POLICY_ID)throw Error('Unsupported or missing loader policy');
 if(typeof sourceSha256!=='string'||!SHA.test(sourceSha256))throw Error('Verified whole source SHA-256 identity required');
 const boundRegistry=validateStandaloneRegistry(registry);
 const patches=classifyPatchesV2(inspection,{loaderPolicyId,strength,alphaValues});
 const byTarget=new Map(boundRegistry.targets.map(t=>[t.key,t])),byPatch=new Map(patches.map(p=>[p.key,p]));
 let selected;
 if(selections!==undefined){
  if(!Array.isArray(selections)||selections.length<1)throw Error('Empty or invalid standalone selections');
  selected=new Map();
  for(const entry of selections){
   keys(entry,['key','slice'],'standalone selection');keys(entry.slice,['startRow','rowCount'],'standalone slice');
   const patch=byPatch.get(entry.key),{startRow,rowCount}=entry.slice;
   if(!patch||!byTarget.has(entry.key))throw Error('Missing selected patch or target '+entry.key);
   if(selected.has(entry.key))throw Error('Duplicate standalone selection '+entry.key);
   if(!Number.isSafeInteger(startRow)||startRow<0||!Number.isSafeInteger(rowCount)||rowCount<1||startRow>patch.fullShape[0]-rowCount)throw Error('Invalid standalone slice coordinates '+entry.key);
   selected.set(entry.key,{startRow,rowCount});
  }
 }
 const operations=[],includedPatches=[],excludedTargets=[],excludedRegions=[];
 for(const patch of patches){
  const description={key:patch.key,variant:patch.variant,names:[...patch.names],fullShape:[...patch.fullShape]};
  if(selected&&!selected.has(patch.key)){excludedTargets.push({...description,reason:'outside-explicit-selection'});continue;}
  const target=byTarget.get(patch.key);
  if(!target)throw Error('Missing target '+patch.key);
  if(JSON.stringify(patch.fullShape)!==JSON.stringify(target.fullShape))throw Error('Original full target shape mismatch '+patch.key);
  const slice=selected?.get(patch.key)??{startRow:0,rowCount:patch.fullShape[0]};
  operations.push({...patch,target,slice:{...slice}});includedPatches.push({...description,slice:{...slice}});
  if(slice.startRow>0)excludedRegions.push({...description,slice:{startRow:0,rowCount:slice.startRow},reason:'outside-selected-slice'});
  const end=slice.startRow+slice.rowCount;
  if(end<patch.fullShape[0])excludedRegions.push({...description,slice:{startRow:end,rowCount:patch.fullShape[0]-end},reason:'outside-selected-slice'});
 }
 const partial=selected!==undefined;
 return freeze({contractVersion:STANDALONE_CONTRACT_VERSION,coverage:partial?'PARTIAL':'FULL',completeAdapter:!partial,scope:partial?'explicit-projection':'full-adapter',sourceSha256,strength,loaderPolicyId,registry:boundRegistry,operations,includedPatches,excludedTargets,excludedRegions,
  mapping:{mappingVersion:boundRegistry.mappingVersion,logicalNameShapeMatched:true,standaloneTargetSupported:true,graphBinding:'UNBOUND',trainingBaseVerified:false}});
}

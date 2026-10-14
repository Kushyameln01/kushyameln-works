// Read-only material facts. This module does not select a composition or resolve prefab inheritance.
import {extractReferences,parseUnityScalar,splitUnityDocuments} from '../../shared/ft/unity-text.mjs';

// Corroborated by Maho's source prefab and MA 1.18.7 official MinimalAvatarVRC.prefab.
const DESCRIPTOR_SCRIPT={guid:'67cc4cb7839cd3741b63733d5adf0442',fileId:'542108242'};
const PLAYABLES={0:'Base',2:'Additive',3:'Gesture',4:'Action',5:'FX',6:'Sitting',7:'TPose',8:'IKPose'};
const compare=(a,b)=>a.localeCompare(b,'en');
const unique=values=>[...new Set(values)].sort(compare);
const sameBytes=(a,b)=>a===b||a instanceof Uint8Array&&b instanceof Uint8Array&&a.length===b.length&&a.every((v,i)=>v===b[i]);
const diagnostic=(code,message,extra={})=>({code,message,...extra});
const idFor=(guid,ref)=>!ref||ref.fileId==='0'?null:`${(ref.guid??guid).toLowerCase()}:${ref.fileId}`;
const basename=path=>path.split('/').at(-1).replace(/\.prefab$/i,'');
const decoder=new TextDecoder('utf-8',{fatal:true});

function section(text,name,indent=2,required=true){
 const fields=[...text.matchAll(new RegExp(`^${' '.repeat(indent)}([A-Za-z_][A-Za-z_0-9]*):([^\\r\\n]*)(?:\\r?\\n|$)`,'gm'))];
 const found=fields.flatMap((m,i)=>m[1]===name?[i]:[]);
 if(found.length>1||required&&!found.length)throw new Error(`Missing or ambiguous ${name}`);
 if(!found.length)return null;const i=found[0];return{text:text.slice(fields[i].index,fields[i+1]?.index??text.length),value:parseUnityScalar(fields[i][2])};
}
const scalar=(text,name,indent=2,required=true)=>section(text,name,indent,required)?.value??null;
function reference(text,name,indent=2,required=true){
 const s=section(text,name,indent,required);if(!s)return null;
 const refs=extractReferences(s.text);if(refs.length!==1)throw new Error(`Expected one ${name} reference`);return refs[0];
}
function bool(text,name,indent=2){const value=scalar(text,name,indent);if(value!=='0'&&value!=='1')throw new Error(`Invalid ${name} flag`);return value==='1';}
function sequence(text,name){
 const s=section(text,name);if(s.value==='[]'){if(/^  - /m.test(s.text))throw new Error(`Malformed empty ${name} sequence`);return[];}
 if(s.value!=='')throw new Error(`Unsupported ${name} sequence`);
 const rows=s.text.match(/^  - [\s\S]*?(?=^  - |$(?![\s\S]))/gm)??[];
 if(!rows.length)throw new Error(`Empty or malformed ${name} sequence`);
 return rows.map(row=>row.replace(/^  - /,'    '));
}

function transformFacts(documents,guid,rootId){
 const gos=new Map(documents.filter(d=>d.classId==='1').map(d=>[d.fileId,d]));
 const transforms=new Map(),paths=[],rootTransforms=[];let complete=true;
 for(const d of documents.filter(d=>d.classId==='4'||d.classId==='224')){
  try{
   const go=reference(d.text,'m_GameObject'),father=reference(d.text,'m_Father');
   if(go.guid&&go.guid.toLowerCase()!==guid||father.guid&&father.guid.toLowerCase()!==guid)throw new Error('External Transform');
   const name=scalar(gos.get(go.fileId)?.text??'','m_Name');
   transforms.set(d.fileId,{go:go.fileId,father:father.fileId,name});if(go.fileId===rootId)rootTransforms.push(d.fileId);
  }catch{complete=false;}
 }
 if(rootTransforms.length!==1)return{transformPaths:[],transformPathsComplete:false};
 const root=rootTransforms[0],cache=new Map([[root,'']]);
 function path(id,visiting=new Set()){
  if(cache.has(id))return cache.get(id);
  const t=transforms.get(id);if(!t||visiting.has(id)||visiting.size>1024){complete=false;return null;}
  if(t.father==='0')return null;
  const next=new Set(visiting);next.add(id);const parent=path(t.father,next);
  const value=parent===null?null:(parent?parent+'/':'')+t.name;cache.set(id,value);return value;
 }
 for(const id of transforms.keys()){const value=path(id);if(value!==null)paths.push(value);}
 // A duplicate relative path cannot identify a unique Transform.
 if(new Set(paths).size!==paths.length)complete=false;
 return{transformPaths:unique(paths),transformPathsComplete:complete};
}

function inspectPrefab(asset,index,packageHashes){
 const prefab={id:asset.guid,guid:asset.guid,path:asset.path,name:basename(asset.path),packageHashes,
  hasDescriptor:null,status:'unreadable',avatarIds:[],animators:[],diagnostics:[]};
 const avatars=[],docs=asset.documents??[],local=new Map(docs.map(d=>[d.fileId,d]));
 if(!docs.length){prefab.diagnostics.push(diagnostic('prefab_unreadable','PrefabのUnityテキストを確認できません。入力全体の失敗を意味しません。'));return{prefab,avatars};}
 let inherited=docs.some(d=>d.classId==='1001'||/^---[^\n]* stripped\r?$/m.test(d.text)),unknownComponents=false;
 const components=new Map(),descriptors=[];
 for(const d of docs){
  if(d.classId==='1'){
   try{
    const refs=extractReferences(section(d.text,'m_Component',2,false)?.text??'');components.set(d.fileId,refs);
    if(refs.some(r=>r.fileId!=='0'&&r.guid&&r.guid.toLowerCase()!==asset.guid)){
     unknownComponents=true;prefab.diagnostics.push(diagnostic('external_component','Prefab外のComponent参照は解決していません。',{gameObjectId:`${asset.guid}:${d.fileId}`}));
    }
    if(refs.some(r=>r.fileId!=='0'&&!r.guid&&!local.has(r.fileId))){unknownComponents=true;prefab.diagnostics.push(diagnostic('component_unavailable','Prefab内のComponent参照が不足しています。',{gameObjectId:`${asset.guid}:${d.fileId}`}));}
   }catch(error){unknownComponents=true;prefab.diagnostics.push(diagnostic('component_unreadable',error.message));}
  }
  // Nonzero correspondence without a PrefabInstance document is still inherited, not a local fact.
  try{const source=reference(d.text,'m_CorrespondingSourceObject',2,false);if(source&&source.fileId!=='0')inherited=true;}catch{inherited=true;}
  if(d.classId==='114'){
   try{const s=reference(d.text,'m_Script');if(s.guid?.toLowerCase()===DESCRIPTOR_SCRIPT.guid&&s.fileId===DESCRIPTOR_SCRIPT.fileId)descriptors.push(d);}
   catch(error){unknownComponents=true;prefab.diagnostics.push(diagnostic('script_unreadable',error.message,{nodeId:`${asset.guid}:${d.fileId}`}));}
  }
  if(d.classId==='95'){
   try{const r=reference(d.text,'m_Controller');const controllerId=idFor(asset.guid,r);prefab.animators.push({id:`${asset.guid}:${d.fileId}`,controllerId,available:!!controllerId&&index.catalog.controllers.some(c=>c.id===controllerId)});}
   catch(error){prefab.diagnostics.push(diagnostic('animator_unreadable',error.message));}
  }
 }
 prefab.hasDescriptor=descriptors.length?true:inherited||unknownComponents?null:false;
 prefab.status=inherited?'unsupported_variant':unknownComponents?'incomplete':'resolved';
 if(inherited)prefab.diagnostics.push(diagnostic('prefab_inheritance_unsupported','Prefab Variant・入れ子Prefabの継承とoverrideは解決していません。構成候補は採用できません。'));
 if(!descriptors.length&&prefab.hasDescriptor===false)prefab.diagnostics.push(diagnostic('descriptor_not_found','このPrefabには確認できるAvatar Descriptorがありません。'));
 const byObject=new Map();
 for(const d of descriptors){
  try{
   const r=reference(d.text,'m_GameObject');if(r.guid&&r.guid.toLowerCase()!==asset.guid||local.get(r.fileId)?.classId!=='1')throw new Error('DescriptorのGameObjectをPrefab内で確認できません。');
   const list=byObject.get(r.fileId)??[];list.push(d);byObject.set(r.fileId,list);
  }catch(error){prefab.status=inherited?'unsupported_variant':'incomplete';prefab.diagnostics.push(diagnostic('descriptor_owner_unavailable',error.message,{descriptorId:`${asset.guid}:${d.fileId}`}));}
 }
 for(const [goId,list]of byObject){
  if(list.length!==1){prefab.status=inherited?'unsupported_variant':'incomplete';prefab.diagnostics.push(diagnostic('ambiguous_descriptor','同じGameObjectに複数のAvatar Descriptorがあります。',{gameObjectId:`${asset.guid}:${goId}`}));continue;}
  const d=list[0],go=local.get(goId),a={id:`${asset.guid}:${goId}`,guid:asset.guid,fileId:goId,name:prefab.name,path:asset.path,packageHashes:[...packageHashes],descriptorId:`${asset.guid}:${d.fileId}`,
   controllers:[],expressionId:null,menuId:null,expressionAvailable:false,menuAvailable:false,customizeAnimationLayers:null,customExpressions:null,
   status:inherited?'unsupported_variant':'resolved',selectable:!inherited&&!unknownComponents,diagnostics:[],...transformFacts(docs,asset.guid,goId)};
  try{
   a.name=scalar(go.text,'m_Name');
   const attached=(components.get(goId)??[]).some(r=>r.fileId===d.fileId&&(!r.guid||r.guid.toLowerCase()===asset.guid));
   if(!attached)throw new Error('DescriptorがGameObjectのComponent一覧にありません。');
   a.customizeAnimationLayers=bool(d.text,'customizeAnimationLayers');a.customExpressions=bool(d.text,'customExpressions');
   const seen=new Set();
   for(const sectionName of ['baseAnimationLayers','specialAnimationLayers'])for(const row of sequence(d.text,sectionName)){
    const type=scalar(row,'type',4),playable=PLAYABLES[type];if(!playable||seen.has(playable))throw new Error('Playable Layerの種類が不明、または重複しています。');seen.add(playable);
    const r=reference(row,'animatorController',4),controllerId=idFor(asset.guid,r),isDefault=bool(row,'isDefault',4),available=!!controllerId&&index.catalog.controllers.some(c=>c.id===controllerId);
    a.controllers.push({playable,controllerId,available,isDefault,selectable:a.selectable&&available&&a.customizeAnimationLayers&&!isDefault});
    if(controllerId&&!available)a.diagnostics.push(diagnostic('reference_unavailable',`${playable}のController参照を読み込み素材で確認できません。`,{kind:'controller',targetId:controllerId}));
    if(!controllerId&&!isDefault&&a.customizeAnimationLayers)a.diagnostics.push(diagnostic('custom_controller_unassigned',`${playable}は独自設定ですがControllerが未指定です。`,{playable}));
   }
   for(const [field,key,availableKey,items]of [['expressionParameters','expressionId','expressionAvailable',index.catalog.expressions],['expressionsMenu','menuId','menuAvailable',index.catalog.menus]]){
    a[key]=idFor(asset.guid,reference(d.text,field));a[availableKey]=!!a[key]&&items.some(x=>x.id===a[key]);
    if(a[key]&&!a[availableKey])a.diagnostics.push(diagnostic('reference_unavailable',`${field}の参照を読み込み素材で確認できません。`,{kind:field,targetId:a[key]}));
   }
  }catch(error){a.selectable=false;a.diagnostics.push(diagnostic('descriptor_unreadable',error.message));}
  if(inherited)a.diagnostics.push(diagnostic('prefab_inheritance_unsupported','継承解決が必要なため、このDescriptorからの採用はできません。'));
  if(unknownComponents)a.diagnostics.push(diagnostic('component_resolution_incomplete','未解決Componentがあるため、このDescriptorからの採用はできません。'));
  if(!a.selectable)for(const c of a.controllers)c.selectable=false;
  if(!inherited&&(a.diagnostics.length||!a.selectable))a.status='incomplete';
  if(a.status==='incomplete'&&prefab.status==='resolved')prefab.status='incomplete';
  avatars.push(a);prefab.avatarIds.push(a.id);
 }
 return{prefab,avatars};
}

function sourceCounts(pkg,index){
 const result={sourceControllerCount:0,sourceMotionCount:0,sourceExpressionCount:0,sourceMenuCount:0,sourcePrefabCount:0};
 for(const source of pkg.assets){
  if(/\.prefab$/i.test(source.path))result.sourcePrefabCount++;
  if(!source.asset)continue;
  const selected=index.assets.get(source.guid.toLowerCase());let docs;
  if(selected&&sameBytes(selected.asset,source.asset))docs=selected.documents;
  else{
   // Opaque images/FBX are valid package material and need no full text decode.
   try{if(!/^(?:\uFEFF)?(?:%YAML|--- !u!)/.test(decoder.decode(source.asset.subarray(0,24))))continue;docs=splitUnityDocuments(decoder.decode(source.asset)).documents;}
   catch{continue;}
  }
  for(const d of docs??[]){
   if(d.classId==='91')result.sourceControllerCount++;
   if(d.classId==='74'||d.classId==='206')result.sourceMotionCount++;
   if(d.classId==='114')try{const r=reference(d.text,'m_Script');if(r.guid?.toLowerCase()!==DESCRIPTOR_SCRIPT.guid)continue;if(r.fileId==='-1506855854')result.sourceExpressionCount++;if(r.fileId==='-340790334')result.sourceMenuCount++;}catch{/* Unreadable component is not a package failure. */}
  }
 }
 return result;
}

/** JSON-serializable facts for already indexed inputs; neither argument is mutated. */
export function buildMaterialCatalog(index,packages){
 const result={packages:[],avatars:[],prefabs:[]},providers=new Map(),matching=new Map();
 for(const pkg of packages)for(const a of pkg.assets){const guid=a.guid.toLowerCase(),list=providers.get(guid)??[];list.push({pkg,asset:a});providers.set(guid,list);}
 // index.packageHashes includes conflicting providers as well; use exact selected content here.
 for(const [guid,a]of index.assets)matching.set(guid,unique((providers.get(guid)??[]).filter(x=>sameBytes(x.asset.asset,a.asset)&&x.asset.meta===a.meta).map(x=>x.pkg.hash)));
 for(const entry of index.catalog.assets.filter(a=>/\.prefab$/i.test(a.path))){
  const a=index.assets.get(entry.guid);
  if(!a){result.prefabs.push({id:entry.guid,guid:entry.guid,path:entry.path,name:basename(entry.path),packageHashes:unique((providers.get(entry.guid)??[]).map(x=>x.pkg.hash)),hasDescriptor:null,status:'conflict',avatarIds:[],animators:[],diagnostics:[diagnostic('asset_conflict','同じGUIDの異なる原本があります。採用する版を決めてください。')]});continue;}
  const {prefab,avatars}=inspectPrefab(a,index,matching.get(a.guid)??[]);result.prefabs.push(prefab);result.avatars.push(...avatars);
 }
 const uniquePackages=new Map([...packages].sort((a,b)=>compare(a.hash,b.hash)||compare(a.name,b.name)).map(p=>[p.hash,p]));
 for(const pkg of uniquePackages.values()){
  const guids=new Set(pkg.assets.map(a=>a.guid.toLowerCase())),selected=new Set([...guids].filter(g=>matching.get(g)?.includes(pkg.hash))),selectedAssets=[...selected].map(g=>index.assets.get(g));
  const ids=kind=>unique(index.catalog[kind].filter(x=>selected.has(x.guid)).map(x=>x.id));
  const p={hash:pkg.hash,name:pkg.name,assetCount:pkg.assets.length,selectedAssetCount:selected.size,...sourceCounts(pkg,index),controllerIds:ids('controllers'),motionIds:ids('motions'),expressionIds:ids('expressions'),menuIds:ids('menus'),
   clipIds:unique(index.catalog.motions.filter(x=>selected.has(x.guid)&&x.kind==='clip').map(x=>x.id)),blendTreeIds:unique(index.catalog.motions.filter(x=>selected.has(x.guid)&&x.kind==='blendTree').map(x=>x.id)),
   prefabIds:unique(result.prefabs.filter(x=>x.packageHashes.includes(pkg.hash)).map(x=>x.id)),avatarIds:unique(result.avatars.filter(x=>x.packageHashes.includes(pkg.hash)).map(x=>x.id)),
   folderCount:selectedAssets.filter(a=>a.kind==='folder').length,opaqueAssetCount:selectedAssets.filter(a=>a.status==='opaque').length,sceneCount:selectedAssets.filter(a=>/\.unity$/i.test(a.path)).length,
   unresolvedConflictGuids:unique([...guids].filter(g=>!index.assets.has(g))),unselectedGuids:unique([...guids].filter(g=>index.assets.has(g)&&!selected.has(g))),roles:[],diagnostics:[]};
  for(const [field,role]of [['avatarIds','avatar'],['controllerIds','controller'],['motionIds','motion'],['expressionIds','expression'],['menuIds','menu'],['prefabIds','prefab']])if(p[field].length)p.roles.push(role);
  if(!p.roles.length)p.roles.push('other');
  if(!p.controllerIds.length)p.diagnostics.push(diagnostic('no_controller','この素材には選択できるAnimator Controllerがありません。'));
  if(p.prefabIds.length&&!p.avatarIds.length)p.diagnostics.push(diagnostic('no_avatar_candidate','Prefabは含まれますが、Descriptorから採用できるAvatar構成候補は確認できません。'));
  result.packages.push(p);
 }
 for(const field of ['avatars','prefabs'])result[field].sort((a,b)=>compare(a.path,b.path)||compare(a.id,b.id));
 return result;
}

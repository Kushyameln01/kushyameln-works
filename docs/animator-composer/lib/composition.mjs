// Unity text composition. No input mutation, runtime simulation, or FT policy.
import {splitUnityDocuments, extractReferences, extractAnimatorParameters,
  parseUnityScalar, canonicalizeObjectReferences, replaceDocumentFileId} from '../../shared/ft/unity-text.mjs';
import {buildMaterialCatalog} from './materials.mjs';

const enc=new TextEncoder(), dec=new TextDecoder('utf-8',{fatal:true});
const PREAMBLE='%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n';
const SDK='67cc4cb7839cd3741b63733d5adf0442';
const SCRIPTS={expression:'-1506855854',menu:'-340790334',driver:'-706344726',tracking:'-646210727',
  playable:'1852460640',layer:'-1936262289'};
const TYPES={1:'Float',3:'Int',4:'Bool',9:'Trigger'};
const TYPE_IDS={Float:1,Int:3,Bool:4,Trigger:9};
const PLAYABLE_ENUM={0:'Action',1:'FX',2:'Gesture',3:'Additive'};
const STRUCTURE_CLASSES=new Set(['1107','1102','1101','1109','206','74','319','114']);
const MOTION_CLASSES=new Set(['74','206']);
const RESOURCE_CLASSES=new Set(['21','28','43','48','49','89','117','128','213']);
const BUILTIN_GUIDS=new Set(['0000000000000000e000000000000000','0000000000000000f000000000000000']);
const BUILTINS=new Map(Object.entries({IsLocal:['Bool',0],Viseme:['Int',0],Voice:['Float',0],GestureLeft:['Int',0],GestureRight:['Int',0],
  GestureLeftWeight:['Float',0],GestureRightWeight:['Float',0],AngularY:['Float',0],VelocityX:['Float',0],VelocityY:['Float',0],VelocityZ:['Float',0],
  VelocityMagnitude:['Float',0],Upright:['Float',0],Grounded:['Bool',0],Seated:['Bool',0],AFK:['Bool',0],TrackingType:['Int',0],
  VRMode:['Int',0],MuteSelf:['Bool',0],InStation:['Bool',0],Earmuffs:['Bool',0],IsOnFriendsList:['Bool',0],AvatarVersion:['Int',0],
  ScaleModified:['Bool',0],ScaleFactor:['Float',1],ScaleFactorInverse:['Float',1],EyeHeightAsMeters:['Float',0],EyeHeightAsPercent:['Float',0]}));
const key=(guid,id)=>`${guid.toLowerCase()}:${id}`;
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const safeName=value=>String(value??'').replace(/[^\p{L}\p{N}_.-]+/gu,'_').replace(/^\.+|\.+$/g,'').slice(0,100)||'Unnamed';
const nameOf=node=>field(node.text,'m_Name')||`${node.classId}_${node.fileId}`;
const issue=(issues,code,message,blockId,severity='error')=>issues.push({severity,code,message,...(blockId?{blockId}:{})});

function field(text,name,indent=2,required=false) {
  const matches=[...text.matchAll(new RegExp(`^${' '.repeat(indent)}${name}:([^\\r\\n]*)`,'gm'))];
  assert(matches.length<=1&&(!required||matches.length===1),`Missing or ambiguous ${name}`);
  return matches.length?parseUnityScalar(matches[0][1]):null;
}
function section(text,name,indent=2) {
  const fields=[...text.matchAll(new RegExp(`^${' '.repeat(indent)}([A-Za-z_][A-Za-z_0-9]*):[^\\r\\n]*(?:\\r?\\n|$)`,'gm'))];
  const matches=fields.flatMap((m,i)=>m[1]===name?[i]:[]);
  assert(matches.length<=1,`Ambiguous section ${name}`);
  if(!matches.length)return null;
  const i=matches[0],start=fields[i].index,end=fields[i+1]?.index??text.length;
  return {start,end,text:text.slice(start,end)};
}
function items(text,name) {
  const s=section(text,name);if(!s)return [];
  const value=field(s.text,name);
  assert(value===''||value==='[]',`Unsupported ${name} sequence`);
  const result=s.text.match(/^  - [\s\S]*?(?=^  - |$(?![\s\S]))/gm)??[];
  assert(value!=='[]'||!result.length,`Invalid empty ${name} sequence`);return result;
}
const itemField=(text,name)=>field(text.replace(/^  - /,'    '),name,4);
function replaceSection(text,name,value) {
  const s=section(text,name);assert(s,`Missing ${name}`);return text.slice(0,s.start)+value+text.slice(s.end);
}
function setField(text,name,value,indent=2) {
  field(text,name,indent,true);
  return text.replace(new RegExp(`^(${' '.repeat(indent)}${name}:)[^\\r\\n]*`,'m'),(_,prefix)=>`${prefix} ${value}`);
}
function refField(text,name,indent=2) {
  const s=section(text,name,indent);assert(s,`Missing reference ${name}`);
  const refs=extractReferences(s.text);assert(refs.length===1,`Expected one ${name} reference`);return refs[0];
}
function refFieldName(text,r) {
  const prefix=text.slice(0,r.start),direct=/([A-Za-z_][A-Za-z_0-9]*):[ \t]*(?:\r?\n[ \t]*)?$/.exec(prefix)?.[1];
  if(direct)return direct;
  const lines=prefix.split('\n'),last=lines.pop()??'',indent=/^ */.exec(last)[0].length;
  for(let i=lines.length-1;i>=0;i--){const m=/^( *)([A-Za-z_][A-Za-z_0-9]*):/.exec(lines[i]);if(m&&m[1].length<=indent)return m[2];}
  return '';
}
const targetId=(node,r)=>r.fileId==='0'?null:key(r.guid??node.guid,r.fileId);
const edgeKey=(ctx,node,scope,index)=>JSON.stringify([ctx?.config.id??null,node.id,scope,index]);
const preservedEdge=(analysis,ctx,node,scope,index)=>analysis._preservedEdges.get(edgeKey(ctx,node,scope,index));
const pptr=(guid,fileId,type='2')=>`{fileID: ${fileId}, guid: ${guid}, type: ${type}}`;
function script(node) {
  if(node.classId!=='114')return null;
  const r=refField(node.text,'m_Script');return r.guid?.toLowerCase()===SDK?r.fileId:`${r.guid}:${r.fileId}`;
}
function rewrites(text,edits) {
  for(const {start,end,value}of [...edits].sort((a,b)=>b.start-a.start))text=text.slice(0,start)+value+text.slice(end);
  return text;
}
function equalBytes(a,b) {return a===b||a instanceof Uint8Array&&b instanceof Uint8Array&&a.length===b.length&&a.every((v,i)=>v===b[i]);}
function layersFor(node) {
  return items(canonicalizeObjectReferences(node.text),'m_AnimatorLayers').map((text,index)=>{
    const fields={};for(const m of text.matchAll(/^(?:  - |    )([A-Za-z_][A-Za-z_0-9]*):([^\r\n]*)/gm))fields[m[1]]=parseUnityScalar(m[2]);
    assert(fields.m_Name!==undefined&&fields.m_StateMachine!==undefined,`Malformed Layer ${index}`);
    for(const f of ['m_StateMachine','m_Mask','m_Controller'])assert(extractReferences(fields[f]??'').length===1,`Layer ${index}: invalid ${f}`);
    const synced=Number(fields.m_SyncedLayerIndex??-1);assert(Number.isSafeInteger(synced)&&synced>=-1,`Layer ${index}: invalid synced index`);
    return {index,name:fields.m_Name,syncedLayerIndex:synced,text,fields};
  });
}
function parametersFor(node) {
  return extractAnimatorParameters(canonicalizeObjectReferences(node.text)).map(p=>({name:p.name,type:TYPES[p.fields.m_Type],
    defaultValue:Number(p.fields[p.fields.m_Type==='1'?'m_DefaultFloat':p.fields.m_Type==='3'?'m_DefaultInt':'m_DefaultBool']),text:p.text}));
}

/** Shallow cataloguing does not reject a package for unrelated unsupported data. */
export function indexPackages(packages,assetChoices={}) {
  assert(Array.isArray(packages),'Expected package array');
  const catalog={assets:[],controllers:[],motions:[],expressions:[],menus:[],conflicts:[],issues:[]};
  const groups=new Map(),assets=new Map(),nodes=new Map();
  for(const pkg of [...packages].sort((a,b)=>String(a.hash).localeCompare(String(b.hash),'en'))) {
    assert(typeof pkg.hash==='string'&&/^[a-f0-9]{64}$/.test(pkg.hash)&&Array.isArray(pkg.assets),'Package hash/assets are invalid');
    for(const a of pkg.assets) {
      assert(/^[a-fA-F0-9]{32}$/.test(a.guid)&&typeof a.path==='string','Invalid asset identity');
      const guid=a.guid.toLowerCase(),list=groups.get(guid)??[];
      list.push({...a,guid,packageHash:pkg.hash,packageName:pkg.name});groups.set(guid,list);
    }
  }
  for(const [guid,list] of groups) {
    const unique=[];
    for(const a of list)if(!unique.some(b=>equalBytes(a.asset,b.asset)&&a.meta===b.meta))unique.push(a);
    let selected=unique[0];
    if(unique.length>1) {
      catalog.conflicts.push({guid,alternatives:unique.map(a=>({packageHash:a.packageHash,packageName:a.packageName,path:a.path}))});
      selected=list.find(a=>a.packageHash===assetChoices[guid]);
      if(!selected){catalog.assets.push({guid,path:list[0].path,kind:'conflict',status:'conflict'});continue;}
    }
    const a={...selected,packageHashes:[...new Set(list.map(x=>x.packageHash))],documents:[],status:'opaque',kind:'opaque'};
    assets.set(guid,a);
    if(a.asset===null){a.kind='folder';a.status='folder';}
    else {
      try {
        const text=dec.decode(a.asset);const split=splitUnityDocuments(text);
        a.text=text;a.documents=split.documents;a.status='indexed';a.kind='serialized';
        for(const d of split.documents) {
          const node={id:key(guid,d.fileId),guid,fileId:d.fileId,classId:d.classId,text:d.text,path:a.path};
          nodes.set(node.id,node);
          const summary={id:node.id,guid,fileId:d.fileId,name:nameOf(node),path:a.path};
          if(d.classId==='91') {
            try {const layers=layersFor(node),parameters=parametersFor(node);
              catalog.controllers.push({...summary,layers:layers.map(({index,name,syncedLayerIndex})=>({index,name,syncedLayerIndex})),parameters:parameters.map(({text,...p})=>p)});
              a.kind='controller';
            }catch(error){issue(catalog.issues,'controller_unsupported',`${a.path}: ${error.message}`,null,'warning');a.status='unsupported';}
          } else if(MOTION_CLASSES.has(d.classId))catalog.motions.push({...summary,kind:d.classId==='74'?'clip':'blendTree'});
          else if(d.classId==='114') {
            try {const s=script(node);if(s===SCRIPTS.expression){catalog.expressions.push(summary);a.kind='expression';}
              else if(s===SCRIPTS.menu){catalog.menus.push(summary);a.kind='menu';}
            } catch(error){issue(catalog.issues,'script_unsupported',`${a.path}: ${error.message}`,null,'warning');}
          }
        }
      } catch(error) {a.diagnostic=error.message;}
    }
    catalog.assets.push({guid,path:a.path,kind:a.kind,status:a.status,...(a.diagnostic?{diagnostic:a.diagnostic}:{})});
  }
  for(const name of ['assets','controllers','motions','expressions','menus'])catalog[name].sort((a,b)=>a.path.localeCompare(b.path,'en')||(a.id??a.guid).localeCompare(b.id??b.guid,'en'));
  const result={catalog,assets,nodes,inputHashes:[...new Set(packages.map(p=>p.hash))].sort()};
  catalog.materials=buildMaterialCatalog(result,packages);
  return result;
}

function sourceText(node,assignments) {
  let text=canonicalizeObjectReferences(node.text);
  for(const a of assignments.filter(a=>a.targetId===node.id)) {
    const [guid,fileId]=a.motionId.split(':');
    if(node.classId==='1102') {
      assert(a.childIndex===null||a.childIndex===undefined,'State assignment requires childIndex:null');
      text=setField(text,'m_Motion',pptr(guid,fileId));
    } else if(node.classId==='206') {
      const children=items(text,'m_Childs');assert(Number.isInteger(a.childIndex)&&a.childIndex>=0&&a.childIndex<children.length,'BlendTree assignment has no such child');
      children[a.childIndex]=setField(children[a.childIndex],'m_Motion',pptr(guid,fileId),4);
      text=replaceSection(text,'m_Childs','  m_Childs:\n'+children.join(''));
    } else throw new Error('Motion target must be an AnimatorState or BlendTree child');
  }
  return text;
}
function usages(node,text,kernel,knownNames) {
  const result=[],add=(name,kind,detail)=>{if(name)result.push({name,kind,nodeId:node.id,path:node.path,detail});};
  if(node.classId==='206') {
    const type=Number(field(text,'m_BlendType',2,true));assert([0,1,2,3,4].includes(type),'Unsupported BlendTree type');
    if(type===4)for(const item of items(text,'m_Childs'))add(itemField(item,'m_DirectBlendParameter'),'read','Direct blend weight');
    else {add(field(text,'m_BlendParameter',2,true),'read','Blend axis');if(type!==0)add(field(text,'m_BlendParameterY',2,true),'read','Blend Y axis');}
  } else if(node.classId==='1101'||node.classId==='1109') {
    for(const m of text.matchAll(/^    m_ConditionEvent:([^\r\n]*)/gm))add(parseUnityScalar(m[1]),'read','Transition condition');
  } else if(node.classId==='1102') {
    for(const part of ['Speed','Mirror','CycleOffset','Time'])if(field(text,`m_${part}ParameterActive`)==='1')add(field(text,`m_${part}Parameter`),'read',`State ${part}`);
  } else if(node.classId==='74') {
    assert(field(text,'m_Compressed')!=='1','Compressed AnimationClip is not supported');
    const bindings=section(text,'m_ClipBindingConstant')?.text??'';
    const entries=(bindings.match(/^    - [\s\S]*?(?=^    - |^    [A-Za-z_]|$(?![\s\S]))/gm)??[])
      .filter(entry=>field(entry,'typeID',6)==='95'&&field(entry,'path',6)==='0');
    const parameterBindings=entries.filter(entry=>field(entry,'customType',6)==='0'),specialBindings=entries.filter(entry=>field(entry,'customType',6)!=='0');
    let specialCurves=0;
    for(const item of items(text,'m_FloatCurves')) {
      if(itemField(item,'classID')!=='95'||itemField(item,'path')!=='')continue;
      const name=itemField(item,'attribute'),hash=kernel.animatorHash(name)>>>0;
      if(parameterBindings.some(entry=>(Number(field(entry,'attribute',6))>>>0)===hash))add(name,'write','Animator float curve');
      else {assert(!knownNames.has(name),`Animator binding hash does not match ${name}`);specialCurves++;}
    }
    // Muscle/special Animator curves have a nonzero customType. Do not classify
    // a missing Parameter by spelling (spaces are valid in Parameter names).
    assert(specialCurves===specialBindings.length,'Animator binding hash cannot be matched to its float curves');
  } else if(node.classId==='114') {
    const s=script(node);
    assert([SCRIPTS.driver,SCRIPTS.tracking,SCRIPTS.playable,SCRIPTS.layer].includes(s),`Unsupported StateMachineBehaviour script ${s}`);
    if(s===SCRIPTS.driver)for(const item of items(text,'parameters')) {
      const type=Number(itemField(item,'type'));assert([0,1,2,3].includes(type),`Unsupported ParameterDriver operation ${type}`);
      add(itemField(item,'name'),'write','ParameterDriver destination');if(type===3)add(itemField(item,'source'),'read','ParameterDriver copy source');
    }
    if(s===SCRIPTS.playable) {
      const hash=Number(field(text,'outputParamHash')??0);
      if(hash!==0){const names=[...knownNames].filter(n=>(kernel.animatorHash(n)>>>0)===(hash>>>0));assert(names.length===1,'PlayableLayerControl output hash cannot be resolved uniquely');add(names[0],'write','PlayableLayerControl output');}
    }
  }
  return result;
}

/** Return facts and explicit diagnostics. Registration policy is a separate module. */
export function analyzeComposition(index,plan,kernel) {
  const issues=[],blocks=[],slots=[],missingParameters=[],contexts=[],outputContexts=[],externalDependencies=new Map(),resources=new Set(),menuNodes=new Set(),menuParameters=[],dependencyDiagnostics=[],blockStatus=[];
  const resourceOwners=new Map(),resourceLinks=new Map(),diagnosticKeys=new Set(),referenceCandidates=[],preservedReferences=[],preservedEdges=new Map();
  const result={blocks,slots,missingParameters,issues,dependencyDiagnostics,blockStatus,referenceCandidates,preservedReferences,usageComplete:false,summary:{},menuParameters,_preservedEdges:preservedEdges,_contexts:contexts,_outputs:outputContexts,
    _resources:resources,_menuNodes:menuNodes,_externalDependencies:externalDependencies,_planKey:JSON.stringify(plan)};
  if(!plan||plan.schemaVersion!==1||!Array.isArray(plan.outputs)||!plan.outputs.length){issue(issues,'invalid_plan','Plan schemaVersion/outputs are invalid');return result;}
  let selectedReferences;
  try {
    assert(plan.externalReferences===undefined||Array.isArray(plan.externalReferences),'externalReferences must be an array');
    const ids=plan.externalReferences??[];
    for(const id of ids) {
      assert(typeof id==='string'&&/^[a-f0-9]{32}:-?[1-9][0-9]*$/.test(id),`Invalid external reference ID: ${String(id)}`);
      const n=BigInt(id.split(':')[1]);assert(n>=-(1n<<63n)&&n<(1n<<63n),`External reference fileID exceeds signed 64-bit: ${id}`);
    }
    assert(new Set(ids).size===ids.length,'Duplicate external reference IDs');selectedReferences=new Set(ids);
  } catch(error) {issue(issues,'invalid_plan',error.message);return result;}
  if(typeof kernel?.animatorHash!=='function'){issue(issues,'kernel_required','The Hike Animator hash kernel is required');return result;}
  if(JSON.stringify([...(plan.inputHashes??[])].sort())!==JSON.stringify(index.inputHashes))issue(issues,'input_changed','Plan input hashes do not match the loaded packages');
  const getNode=(id,blockId)=>{
    const node=index.nodes.get(id);
    if(!node) {
      const guid=String(id).split(':')[0],conflict=index.catalog.conflicts.find(c=>c.guid===guid);
      throw new Error(conflict&&!index.assets.has(guid)?`Choose a package version for conflicting GUID ${guid}`:`Missing or unsupported object ${id}`);
    }return node;
  };
  function diagnostic(ctx,node,fieldName,id,reason,expectedClasses,message,layerNames=[]) {
    const [targetGuid,targetFileId]=String(id).split(':'),targetPath=index.assets.get(targetGuid)?.path;
    const value={code:`dependency_${reason}`,blockId:ctx?.config.id??null,outputId:ctx?.output.id??null,
      controllerId:ctx?.controller?.id??ctx?.config.controllerId??null,controllerPath:ctx?.controller?.path??null,
      sourceId:node.id,sourceName:nameOf(node),sourcePath:node.path,sourceClass:node.classId,field:fieldName,
      targetId:id,targetGuid,targetFileId,...(targetPath?{targetPath}:{}),reason,...(expectedClasses?{expectedClasses}:{}),layerNames:[...layerNames]};
    const dkey=JSON.stringify([value.blockId,value.sourceId,fieldName,id,reason,layerNames]);
    if(diagnosticKeys.has(dkey))return;diagnosticKeys.add(dkey);dependencyDiagnostics.push(value);
    const detail=message??`${reason}: ${node.path} / ${nameOf(node)} -> ${id} (${fieldName})`;
    issue(issues,value.code,reason==='conflict'?`Choose a package version for conflicting GUID ${targetGuid}; ${detail}`:detail,value.blockId);
  }
  function unavailableReason(id) {
    const [guid]=String(id).split(':');
    if(index.catalog.conflicts.some(c=>c.guid===guid)&&!index.assets.has(guid))return 'conflict';
    return index.assets.has(guid)&&!index.assets.get(guid).documents.length?'unsupported':'missing';
  }
  function addResource(guid,ctx) {
    resources.add(guid);const owners=resourceOwners.get(guid)??new Set();owners.add(ctx);resourceOwners.set(guid,owners);
  }
  const expectedFor=fieldName=>({m_Motion:['74','206'],m_State:['1102'],m_DefaultState:['1102'],m_DstState:['1102'],
    m_StateMachine:['1107'],m_DstStateMachine:['1107'],m_Mask:['319'],m_StateMachineBehaviours:['114'],
    m_Transitions:['1101','1109'],m_AnyStateTransitions:['1101'],m_EntryTransitions:['1109'],m_Texture:['28','89','117','213'],m_Shader:['48'],icon:['28','213']}[fieldName]);
  function hasEditedDescendant(ctx,id) {
    if(!ctx?.assignments.length)return false;
    const pending=[id],seen=new Set();
    while(pending.length) {
      const current=pending.pop();if(seen.has(current))continue;seen.add(current);
      if(ctx.assignments.some(a=>a.targetId===current))return true;
      const n=index.nodes.get(current);if(n?.classId!=='206')continue;
      for(const r of extractReferences(n.text))if(refFieldName(n.text,r)==='m_Motion'&&r.fileId!=='0')pending.push(targetId(n,r));
    }
    return false;
  }
  function retention(ref,node,fieldName,ctx,scope,referenceIndex,text,layerNames=[]) {
    const id=targetId(node,ref);if(!id||fieldName==='m_Script'||BUILTIN_GUIDS.has(ref.guid))return false;
    const selected=selectedReferences.has(id);
    if(!ref.guid&&!selected)return false;
    const target=index.nodes.get(id),asset=index.assets.get(ref.guid??node.guid),expected=expectedFor(fieldName);
    const motion=fieldName==='m_Motion'&&['1102','206'].includes(node.classId),mask=fieldName==='m_Mask'&&node.classId==='91';
    const within=name=>{const s=section(text,name);return s&&ref.start>=s.start&&ref.end<=s.end;};
    const positiveResource=(node.classId==='74'&&(fieldName==='objectReferenceParameter'&&within('m_Events')||fieldName==='value'&&within('m_PPtrCurves')||fieldName==='pptrCurveMapping'&&within('m_ClipBindingConstant')))||
      (node.classId==='21'&&(fieldName==='m_Texture'&&within('m_SavedProperties')||fieldName==='m_Shader'))||
      (node.classId==='114'&&script(node)===SCRIPTS.menu&&fieldName==='icon'&&within('controls'))||
      (node.classId==='Importer'&&fieldName==='second'&&within('externalObjects'));
    const structural=expected&&!motion&&!mask&&!['m_Texture','m_Shader','icon'].includes(fieldName)||
      ['m_Controller','subMenu','Parameters','m_GameObject','m_CorrespondingSourceObject','m_PrefabInstance','m_PrefabAsset'].includes(fieldName);
    const resource=!structural&&positiveResource;
    let reason=null;
    if(!ref.guid||ref.guid===node.guid||ref.guid===ctx?.controller.guid)reason='local_or_owned_reference';
    else if(unavailableReason(id)==='conflict')reason='unresolved_guid_conflict';
    else if(expected&&target&&!expected.includes(target.classId))reason='known_wrong_type';
    else if(!target&&asset?.documents.length)reason='known_missing_file_id';
    else if(structural||!motion&&!mask&&!resource||target&&!motion&&!mask&&!RESOURCE_CLASSES.has(target.classId))reason='structural_or_unclassified_reference';
    else if(motion) {
      const refs=extractReferences(text),motionIndex=refs.slice(0,referenceIndex).filter(r=>refFieldName(text,r)==='m_Motion').length;
      if(ctx?.assignments.some(a=>a.targetId===node.id&&(node.classId==='1102'||a.childIndex===motionIndex)))reason='explicit_motion_assignment';
      else if(hasEditedDescendant(ctx,id))reason='edited_motion_descendant';
    }
    const candidate={edgeId:edgeKey(ctx,node,scope,referenceIndex),targetId:id,targetGuid:id.split(':')[0],targetFileId:ref.fileId,referenceType:ref.type??'2',
      kind:motion?'motion':mask?'mask':'resource',blockId:ctx?.config.id??null,outputId:ctx?.output.id??null,
      controllerId:ctx?.controller?.id??null,controllerPath:ctx?.controller?.path??null,sourceId:node.id,sourceName:nameOf(node),sourcePath:node.path,
      sourceClass:node.classId,field:fieldName,scope,referenceIndex,layerNames:[...layerNames],retainedOnly:false,availableInInput:!!asset,
      ...(asset?{targetPath:asset.path}:{}),eligible:reason===null,eligibilityReason:reason??'unchanged_external_reference',selected};
    referenceCandidates.push(candidate);
    if(!selected)return false;
    if(reason) {
      diagnostic(ctx,node,fieldName,id,reason==='unresolved_guid_conflict'?'conflict':reason==='known_wrong_type'?'wrong_type':'unsupported',expected,
        `External reference cannot be preserved: ${id} (${reason})`,layerNames);return true;
    }
    preservedReferences.push(candidate);preservedEdges.set(candidate.edgeId,candidate);return true;
  }
  function dependency(ref,node,fieldName,ctx,queue,layerNames=[],scope='document',referenceIndex=0,text=node.text) {
    if(ref.fileId==='0'||fieldName==='m_Controller')return;
    if(fieldName==='m_Script') {externalDependencies.set(key(ref.guid,ref.fileId),{guid:ref.guid,fileId:ref.fileId,kind:'script'});return;}
    if(BUILTIN_GUIDS.has(ref.guid)) {externalDependencies.set(key(ref.guid,ref.fileId),{guid:ref.guid,fileId:ref.fileId,kind:'unity_builtin'});return;}
    const id=targetId(node,ref),target=index.nodes.get(id);
    if(ctx) {const edges=ctx.edges.get(node.id)??new Set();edges.add(id);ctx.edges.set(node.id,edges);}
    const expected=['m_Texture','m_Shader','icon'].includes(fieldName)?null:expectedFor(fieldName);
    if(retention(ref,node,fieldName,ctx,scope,referenceIndex,text,layerNames))return;
    if(expected&&(!target||!expected.includes(target.classId))) {
      diagnostic(ctx,node,fieldName,id,target?'wrong_type':unavailableReason(id),expected,`Missing/unsupported ${fieldName} target ${id}; expected class ${expected.join('/')}`,layerNames);return;
    }
    if(target&&STRUCTURE_CLASSES.has(target.classId)) {queue.push(id);return;}
    if(target?.classId==='91'){diagnostic(ctx,node,fieldName,id,'unsupported',null,`A reference would import an entire Controller: ${id} (${fieldName})`,layerNames);return;}
    const asset=index.assets.get(ref.guid??node.guid);
    if(!asset||(!target&&asset.documents.length)){diagnostic(ctx,node,fieldName,id,unavailableReason(id),null,`Missing dependency ${id} (${fieldName})`,layerNames);return;}
    if(target&&!RESOURCE_CLASSES.has(target.classId)){diagnostic(ctx,node,fieldName,id,'unsupported',null,`Unsupported referenced asset class ${target.classId}: ${asset.path}`,layerNames);return;}
    addResource(asset.guid,ctx);
  }
  const outputIds=new Set(),blockIds=new Set();
  for(const output of plan.outputs) {
    try {
      assert(output&&typeof output.id==='string'&&!outputIds.has(output.id),'Output IDs must be unique strings');outputIds.add(output.id);
      assert(['Base','Additive','Gesture','Action','FX','Sitting','TPose','IKPose'].includes(output.playable),`Unsupported output Playable ${output.playable}`);
      assert(output.base?.controllerId,'Every output needs a base Controller');
      const oc={output,contexts:[],layers:[]};outputContexts.push(oc);
      const configs=[output.base,...(output.additions??[])];
      for(let bi=0;bi<configs.length;bi++) {
        const config=configs[bi];
        blockStatus.push({blockId:config?.id??null,outputId:output.id,controllerId:config?.controllerId??null,label:`${output.name} / ${config?.id??'unknown'}`,status:'incomplete',issueCount:0,dependencyCount:0});
        try {
          assert(typeof config.id==='string'&&!blockIds.has(config.id),'Block IDs must be globally unique strings');blockIds.add(config.id);
          if(!index.nodes.has(config.controllerId)) {
            const [guid,fileId]=String(config.controllerId).split(':'),source={id:config.controllerId,guid,fileId,classId:'91',path:index.assets.get(guid)?.path??'',text:`  m_Name: ${JSON.stringify(config.id)}\n`};
            diagnostic({config,output},source,'controllerId',config.controllerId,unavailableReason(config.controllerId),['91']);continue;
          }
          const controller=getNode(config.controllerId,config.id);
          if(controller.classId!=='91'){diagnostic({config,output},controller,'controllerId',controller.id,'wrong_type',['91'],'Block source must be an AnimatorController');continue;}
          const allLayers=layersFor(controller),declared=parametersFor(controller),selected=bi===0?allLayers.map(l=>l.index):config.layerIndices;
          assert(Array.isArray(selected)&&new Set(selected).size===selected.length&&selected.every(i=>Number.isInteger(i)&&allLayers[i]),'Invalid or duplicate selected Layer indices');
          const assignments=(output.motionAssignments??[]).filter(a=>a.blockId===config.id),assignmentKeys=new Set();
          for(const a of assignments){const k=`${a.targetId}/${a.childIndex??'state'}`;assert(!assignmentKeys.has(k),'Duplicate assignment to the same Motion slot');assignmentKeys.add(k);}
          const ctx={config,output,controller,declared,allLayers,selected,assignments,nodeIds:new Set(),texts:new Map(),usages:[],layers:selected.map(i=>allLayers[i]),edges:new Map(),layerRoots:new Map(),parseIncomplete:false};
          contexts.push(ctx);oc.contexts.push(ctx);
          const queue=[];
          for(const layer of ctx.layers) {
            const roots=[];ctx.layerRoots.set(layer.index,roots);
            for(const [ri,r] of extractReferences(layer.text).entries()) {
              const f=refFieldName(layer.text,r);if(r.fileId!=='0'&&f!=='m_Controller')roots.push(targetId(controller,r));
              dependency(r,controller,f,ctx,queue,[layer.name],`layer:${layer.index}`,ri,layer.text);
            }
          }
          let retainedSubassets=false;
          while(queue.length||(bi===0&&!retainedSubassets)) {
            if(!queue.length&&bi===0&&!retainedSubassets) {
              ctx.reachableIds=new Set(ctx.nodeIds);retainedSubassets=true;
              for(const d of index.assets.get(controller.guid).documents)if(d.fileId!==controller.fileId)queue.push(key(controller.guid,d.fileId));
              if(!queue.length)break;
            }
            const id=queue.pop();if(ctx.nodeIds.has(id))continue;
            const node=getNode(id,config.id);
            if(!STRUCTURE_CLASSES.has(node.classId)){diagnostic(ctx,node,'retainedSubasset',id,'unsupported',null,`Unsupported graph class ${node.classId}: ${id}`);continue;}
            ctx.nodeIds.add(id);assert(ctx.nodeIds.size<100000,'Selected object graph is too large');
            try {
              const text=sourceText(node,assignments);ctx.texts.set(id,text);
              // Unknown Behaviours remain blockers, while their other references
              // can still be inspected without interpreting their custom fields.
              if(node.classId==='114'&&![SCRIPTS.driver,SCRIPTS.tracking,SCRIPTS.playable,SCRIPTS.layer].includes(script(node))) {
                const r=refField(text,'m_Script');diagnostic(ctx,node,'m_Script',targetId(node,r),'unsupported',null,`Unsupported StateMachineBehaviour script ${script(node)} at ${node.path}/${node.fileId}`);
              }
              for(const [ri,r] of extractReferences(text).entries())dependency(r,node,refFieldName(text,r),ctx,queue,[],'document',ri,text);
              if(node.classId==='1102')slots.push({blockId:config.id,targetId:id,childIndex:null,reachable:!retainedSubassets,label:`${retainedSubassets?'[unconnected] ':''}${nameOf(node)} / Motion`,motionId:targetId(node,refField(text,'m_Motion'))});
              if(node.classId==='206')for(const [childIndex,c]of items(text,'m_Childs').entries())slots.push({blockId:config.id,targetId:id,childIndex,reachable:!retainedSubassets,label:`${retainedSubassets?'[unconnected] ':''}${nameOf(node)} / child ${childIndex}`,motionId:targetId(node,refField(c.replace(/^  - /,'    '),'m_Motion',4))});
            }catch(error){ctx.parseIncomplete=true;issue(issues,'block_unsupported',`${node.path} / ${nameOf(node)}: ${error.message}`,config.id);}
          }
          ctx.reachableIds??=new Set(ctx.nodeIds);
          for(const a of assignments)assert(ctx.nodeIds.has(a.targetId),`Motion target is not in the selected block: ${a.targetId}`);
          // Partial traversal must never become a complete registration block.
          // Its parsed nodes and slots remain available for source diagnostics.
          if(ctx.parseIncomplete||dependencyDiagnostics.some(d=>d.blockId===config.id))continue;
          // Reject cycles in the motion graph while preserving ordinary State cycles.
          const done=new Set(),active=new Set();
          const visit=id=>{if(done.has(id))return;assert(!active.has(id),`BlendTree cycle at ${id}`);active.add(id);
            const n=index.nodes.get(id);if(n?.classId==='206')for(const [ri,r] of extractReferences(ctx.texts.get(id)).entries())if(refFieldName(ctx.texts.get(id),r)==='m_Motion'&&r.fileId!=='0'&&!preservedEdge(result,ctx,n,'document',ri))visit(targetId(n,r));
            active.delete(id);done.add(id);};
          for(const id of ctx.nodeIds)if(index.nodes.get(id).classId==='206')visit(id);
          const declarations=new Map(declared.map(p=>[p.name,p])),knownNames=new Set(declarations.keys());
          const originDeclarations=new Map();
          for(const id of ctx.nodeIds) {
            const n=index.nodes.get(id);
            for(const c of index.catalog.controllers.filter(c=>c.guid===n.guid))for(const p of c.parameters){knownNames.add(p.name);const list=originDeclarations.get(p.name)??[];if(!list.some(q=>q.type===p.type&&q.defaultValue===p.defaultValue))list.push(p);originDeclarations.set(p.name,list);}
          }
          for(const id of ctx.reachableIds)ctx.usages.push(...usages(index.nodes.get(id),ctx.texts.get(id),kernel,knownNames));
          ctx.usageComplete=!preservedReferences.some(r=>r.blockId===config.id&&r.kind==='motion'&&ctx.reachableIds.has(r.sourceId));
          ctx.parameterRetention=bi===0||!ctx.usageComplete?'all_declared':'used';
          const needed=new Set(ctx.usages.map(u=>u.name)),parameters=[];
          for(const p of declared)if(ctx.parameterRetention==='all_declared'||needed.has(p.name))parameters.push({...p,usage:ctx.usages.filter(u=>u.name===p.name)});
          for(const name of needed)if(!declarations.has(name)) {
            const candidates=originDeclarations.get(name)??[];
            const explicit=plan.animatorChoices?.[output.id]?.[name];
            if(candidates.length===1)parameters.push({...candidates[0],usage:ctx.usages.filter(u=>u.name===name)});
            else if(explicit&&TYPE_IDS[explicit.type]&&Number.isFinite(explicit.defaultValue))parameters.push({name,type:explicit.type,defaultValue:explicit.defaultValue,usage:ctx.usages.filter(u=>u.name===name)});
            else if(BUILTINS.has(name)){const [type,defaultValue]=BUILTINS.get(name);parameters.push({name,type,defaultValue,usage:ctx.usages.filter(u=>u.name===name),builtin:true});}
            else {missingParameters.push({blockId:config.id,outputId:output.id,name,usage:ctx.usages.filter(u=>u.name===name)});issue(issues,'undeclared_parameter',`${name}: choose an Animator type/default for this undeclared Parameter`,config.id);}
          }
          const block={id:config.id,label:`${output.name} / ${nameOf(controller)}${bi===0?' (base)':''}`,outputId:output.id,expressionId:config.expressionId??null,
            parameters:parameters.map(({text,...p})=>p),usageComplete:ctx.usageComplete,parameterRetention:ctx.parameterRetention};blocks.push(block);ctx.block=block;
        }catch(error){issue(issues,'block_unsupported',error.message,config?.id);}
      }
      const defaultOrder=oc.contexts.flatMap(c=>c.layers.map(l=>({blockId:c.config.id,index:l.index}))),order=output.layerOrder??defaultOrder;
      assert(Array.isArray(order)&&order.length===defaultOrder.length&&new Set(order.map(x=>`${x.blockId}/${x.index}`)).size===order.length&&order.every(x=>defaultOrder.some(y=>y.blockId===x.blockId&&y.index===x.index)),'layerOrder must contain every selected Layer exactly once');
      oc.layers=order.map((entry,finalIndex)=>{const ctx=oc.contexts.find(c=>c.config.id===entry.blockId);return {ctx,layer:ctx.allLayers[entry.index],finalIndex};});
      const outputLayerNames=new Set();
      for(const {ctx,layer,finalIndex}of oc.layers) {
        const outputName=output.layerNames?.[`${ctx.config.id}:${layer.index}`]??layer.name;
        assert(typeof outputName==='string'&&outputName.length&&!/[\u0000-\u001f]/.test(outputName),'Invalid output Layer name');
        assert(!outputLayerNames.has(outputName),`Duplicate output Layer name ${outputName}; specify layerNames for the conflicting Layers`);outputLayerNames.add(outputName);
        if(finalIndex===0&&layer.index!==0&&Number(layer.fields.m_DefaultWeight??0)!==1)issue(issues,'first_layer_weight',`Layer ${layer.name} would become the first Layer with implicit weight 1; keep a source first Layer first or choose a weight-1 Layer`,ctx.config.id);
        if(layer.syncedLayerIndex>=0) {
          const target=oc.layers.find(l=>l.ctx===ctx&&l.layer.index===layer.syncedLayerIndex);
          assert(target,`Synced Layer ${layer.name} requires source Layer ${layer.syncedLayerIndex} in the same block`);
          assert(field(layer.text.replace(/^  - /,'    '),'m_Motions',4)==='[]'&&field(layer.text.replace(/^  - /,'    '),'m_Behaviours',4)==='[]',`Synced Layer override Motion/Behaviour is not yet supported: ${layer.name}`);
        }
      }
      for(const ctx of oc.contexts)for(const id of ctx.nodeIds) {
        const node=index.nodes.get(id);if(node.classId!=='114'||script(node)!==SCRIPTS.layer)continue;
        const playable=PLAYABLE_ENUM[Number(field(node.text,'playable'))],sourceIndex=Number(field(node.text,'layer'));
        assert(playable===output.playable,`AnimatorLayerControl ${id} targets ${playable??'unknown Playable'}; a cross-Playable mapping is not defined`);
        assert(oc.layers.some(l=>l.ctx===ctx&&l.layer.index===sourceIndex),`AnimatorLayerControl ${id} targets unselected source Layer ${sourceIndex}`);
      }
    }catch(error){issue(issues,'output_unsupported',error.message,output?.base?.id);}
  }
  for(const output of plan.outputs)for(const a of output.motionAssignments??[])if(!blockIds.has(a.blockId))issue(issues,'unknown_assignment_block',`Unknown Motion assignment block ${a.blockId}`);
  // Optional Menu closure is independent from Animator parameter declarations.
  if(plan.installer?.menuId) {
    const rootId=plan.installer.menuId,[rootGuid,rootFileId]=rootId.split(':'),rootNode=index.nodes.get(rootId)??{id:rootId,guid:rootGuid,fileId:rootFileId,classId:'114',path:index.assets.get(rootGuid)?.path??'',text:'  m_Name: Selected Menu\n'};
    const queue=[{id:rootId,source:rootNode,field:'menuId'}];
    while(queue.length) {
      const {id,source,field:f}=queue.pop();if(menuNodes.has(id))continue;
      try {
        const node=index.nodes.get(id);
        if(!node||node.classId!=='114'||script(node)!==SCRIPTS.menu) {
          diagnostic(null,source,f,id,!node?unavailableReason(id):node.classId!=='114'?'wrong_type':'unsupported',['114'],`Not a supported Expression Menu: ${id}`);continue;
        }
        menuNodes.add(id);
        const text=canonicalizeObjectReferences(node.text);
        for(const control of items(text,'controls')) {
          const normalized=control.replace(/^  - /,'    '),parameter=section(normalized,'parameter',4),subs=section(normalized,'subParameters',4);
          const name=parameter?field(parameter.text,'name',6):null;if(name)menuParameters.push({name,nodeId:id,path:node.path});
          for(const m of (subs?.text??'').matchAll(/^    - name:([^\r\n]*)/gm)){const name=parseUnityScalar(m[1]);if(name)menuParameters.push({name,nodeId:id,path:node.path});}
        }
        for(const [ri,r] of extractReferences(text).entries()) {
          const f=refFieldName(text,r);if(f==='Parameters')continue;
          if(f==='subMenu'&&r.fileId!=='0') {if(!retention(r,node,f,null,'document',ri,text))queue.push({id:targetId(node,r),source:node,field:f});}
          else dependency(r,node,f,null,[],[],'document',ri,text);
        }
      }catch(error){issue(issues,'menu_unsupported',`${source.path}: ${error.message}`);}
    }
  }
  // Only explicitly referenced auxiliary resources are copied, never all package assets.
  const pending=[...resources].flatMap(guid=>[...(resourceOwners.get(guid)??[null])].map(ctx=>({guid,ctx}))),seen=new Set();
  while(pending.length) {
    const {guid,ctx}=pending.pop(),visitKey=`${guid}/${ctx?.config.id??'menu'}`;if(seen.has(visitKey))continue;seen.add(visitKey);
    const asset=index.assets.get(guid);
    try {
      assert(asset&&asset.asset instanceof Uint8Array,`Missing resource ${guid}`);
      const texts=asset.documents.map(d=>({text:d.text,node:index.nodes.get(key(guid,d.fileId))}));
      texts.push({text:String(asset.meta??'').replace(/^guid:[^\r\n]*(?:\r?\n|$)/m,''),node:{id:`${guid}:meta`,guid,fileId:'meta',classId:'Importer',path:asset.path,text:`  m_Name: ${JSON.stringify(asset.path.split('/').pop())}\n`}});
      for(const {text,node}of texts)for(const [ri,r] of extractReferences(text).entries()) {
        if(r.fileId==='0'||r.kind==='local')continue;
        if(BUILTIN_GUIDS.has(r.guid)){externalDependencies.set(key(r.guid,r.fileId),{guid:r.guid,fileId:r.fileId,kind:'unity_builtin'});continue;}
        const id=key(r.guid,r.fileId),target=index.assets.get(r.guid),f=refFieldName(text,r);
        if(retention(r,node,f,ctx,node.classId==='Importer'?'meta':'document',ri,text))continue;
        if(!target){diagnostic(ctx,node,f,id,unavailableReason(id),null,`Missing resource dependency ${id}`);continue;}
        if(target.documents.some(d=>['91','1107','1102','206','74','114'].includes(d.classId))) {
          diagnostic(ctx,node,f,id,'unsupported',null,`Resource dependency requires unsupported graph type: ${target.path}`);continue;
        }
        if(target.documents.length&&!index.nodes.has(id)){diagnostic(ctx,node,f,id,'missing',null,`Missing resource dependency object ${id}`);continue;}
        const links=resourceLinks.get(guid)??new Set();links.add(r.guid);resourceLinks.set(guid,links);
        addResource(r.guid,ctx);pending.push({guid:r.guid,ctx});
      }
    }catch(error){issue(issues,'resource_unsupported',error.message,ctx?.config.id);}
  }
  // Derive source Layer attribution after all edges have been visited. This
  // includes shared descendants and distinguishes retained, unconnected data.
  for(const ctx of contexts) {
    const labels=new Map(),resourceLabels=new Map();
    for(const layer of ctx.layers) {
      const pending=[...(ctx.layerRoots.get(layer.index)??[])],seen=new Set();
      while(pending.length){const id=pending.pop();if(seen.has(id))continue;seen.add(id);const names=labels.get(id)??new Set();names.add(layer.name);labels.set(id,names);pending.push(...(ctx.edges.get(id)??[]));}
      const assetQueue=[...new Set([...seen].map(id=>id.split(':')[0]))].filter(g=>resources.has(g)),assetSeen=new Set();
      while(assetQueue.length){const g=assetQueue.pop();if(assetSeen.has(g))continue;assetSeen.add(g);const names=resourceLabels.get(g)??new Set();names.add(layer.name);resourceLabels.set(g,names);assetQueue.push(...(resourceLinks.get(g)??[]));}
    }
    for(const d of [...dependencyDiagnostics,...referenceCandidates].filter(d=>d.blockId===ctx.config.id)) {
      d.layerNames=[...new Set([...d.layerNames,...(labels.get(d.sourceId)??[]),...(resourceLabels.get(d.sourceId.split(':')[0])??[])])];
      d.retainedOnly=d.sourceId!==ctx.controller.id&&d.layerNames.length===0;
    }
  }
  // A late resource failure can also invalidate an otherwise parsed block.
  for(const status of blockStatus) {
    const ctx=contexts.find(c=>c.config.id===status.blockId);
    if(ctx)status.label=`${ctx.output.name} / ${nameOf(ctx.controller)}${ctx.config===ctx.output.base?' (base)':''}`;
    status.dependencyCount=dependencyDiagnostics.filter(d=>d.blockId===status.blockId).length;
    status.issueCount=issues.filter(i=>i.blockId===status.blockId&&i.severity==='error').length;
    status.status=ctx?.block&&!status.issueCount?'complete':'incomplete';
    status.usageComplete=status.status==='complete'&&ctx.usageComplete;status.parameterRetention=ctx?.parameterRetention??null;
    if(status.dependencyCount||ctx?.parseIncomplete||issues.some(i=>i.blockId===status.blockId&&i.code==='resource_unsupported')) {
      const i=blocks.findIndex(b=>b.id===status.blockId);if(i>=0)blocks.splice(i,1);
    }
  }
  result.usageComplete=blockStatus.every(s=>s.usageComplete)&&!dependencyDiagnostics.length;
  result.summary={outputs:outputContexts.length,blocks:blocks.length,layers:outputContexts.reduce((n,o)=>n+o.layers.length,0),
    objects:contexts.reduce((n,c)=>n+c.nodeIds.size,0),parameters:blocks.reduce((n,b)=>n+b.parameters.length,0),resources:resources.size,menus:menuNodes.size};
  return result;
}

async function digest(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function makeGeneratedAsset(root,relativePath,text,mainFileId,kind='native') {
  assert(typeof root==='string'&&/^Assets\/[\p{L}\p{N}_.-]+$/u.test(root)&&!root.endsWith('/.')&&!root.endsWith('/..'),'Invalid output root');
  assert(typeof relativePath==='string'&&!relativePath.startsWith('/')&&!relativePath.split('/').some(p=>!p||p==='.'||p==='..')&&!/[\\\u0000-\u001f]/.test(relativePath),'Invalid output relative path');
  const path=`${root}/${relativePath}`,guid=(await digest(`animator-composer-v1:${path}`)).slice(0,32);
  const meta=kind==='prefab'?`fileFormatVersion: 2\nguid: ${guid}\nPrefabImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`
    :`fileFormatVersion: 2\nguid: ${guid}\nNativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: ${mainFileId}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`;
  return {guid,path,asset:typeof text==='string'?enc.encode(text):text,meta};
}

/** Generate only after structural and registration diagnostics have been resolved. */
export async function generateComposition(index,plan,analysis,animatorParameters) {
  assert(analysis._planKey===JSON.stringify(plan),'Composition analysis is stale');
  assert(!analysis.issues.some(i=>i.severity==='error'),'Unresolved structural errors prevent generation');
  assert(!(analysis.dependencyDiagnostics??[]).length&&!(analysis.blockStatus??[]).some(s=>s.status==='incomplete'),'Unresolved structural errors prevent generation');
  const root=`Assets/${safeName(plan.name)}`,assets=[],controllers=[],mapping=[],layerMapping=[],outputPreserved=[],outputPreservedKeys=new Set();
  const recordPreserved=(candidate,destination,fileId)=>{
    const outputSourceId=key(destination.guid,fileId),recordKey=candidate.edgeId+outputSourceId;
    if(!outputPreservedKeys.has(recordKey)){outputPreservedKeys.add(recordKey);outputPreserved.push({...candidate,outputSourceId,outputPath:destination.path});}
  };
  const destinations=new Map(),motionVariants=new Map(),contextDest=new Map(),resourceDest=new Map(),menuDest=new Map();
  const expression=await makeGeneratedAsset(root,'Parameters/ExpressionParameters.asset','', '11400000');
  // A shared Motion stays shared unless an explicit per-block assignment changes
  // its descendant graph. Variant identity uses edits, not the source filename.
  function variant(ctx,id,memo=new Map()) {
    if(memo.has(id))return memo.get(id);
    const node=index.nodes.get(id),edits=[];
    if(node.classId==='206') {
      for(const a of ctx.assignments)if(a.targetId===id)edits.push([a.targetId,a.childIndex,a.motionId]);
      for(const [ri,r] of extractReferences(ctx.texts.get(id)).entries())if(refFieldName(ctx.texts.get(id),r)==='m_Motion'&&r.fileId!=='0'&&!preservedEdge(analysis,ctx,node,'document',ri))edits.push(...variant(ctx,targetId(node,r),memo).edits);
    }
    const unique=[...new Map(edits.map(e=>[JSON.stringify(e),e])).values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
    const value={key:id+(unique.length?'|'+JSON.stringify(unique):''),edits:unique};memo.set(id,value);return value;
  }
  for(const ctx of analysis._contexts) {
    const map=new Map();contextDest.set(ctx,map);
    for(const id of ctx.nodeIds) {
      const node=index.nodes.get(id);if(!MOTION_CLASSES.has(node.classId)&&node.classId!=='319')continue;
      const v=MOTION_CLASSES.has(node.classId)?variant(ctx,id):{key:id};
      let entry=motionVariants.get(v.key);
      if(!entry){entry={key:v.key,node,ctx,uses:[],count:0};motionVariants.set(v.key,entry);}
      entry.uses.push({ctx,id});
    }
  }
  for(const ctx of analysis._contexts)for(const id of ctx.nodeIds) {
    const node=index.nodes.get(id),text=ctx.texts.get(id);
    for(const [ri,r] of extractReferences(text).entries()) {
      if(preservedEdge(analysis,ctx,node,'document',ri))continue;
      const target=index.nodes.get(targetId(node,r));if(!target||!MOTION_CLASSES.has(target.classId))continue;
      const entry=motionVariants.get(variant(ctx,target.id).key);if(entry)entry.count++;
    }
  }
  for(const entry of motionVariants.values()) {
    const {node}=entry,ext=node.classId==='74'?'.anim':'.asset',main=node.classId==='74'?'7400000':node.classId==='206'?'20600000':'31900000';
    const suffix=(await digest(entry.key)).slice(0,12),folder=node.classId==='319'?'Masks':entry.count>1?'Shared':node.classId==='74'?'Clips':'BlendTrees';
    const asset=await makeGeneratedAsset(root,`Source/${folder}/${safeName(nameOf(node))}_${suffix}${ext}`,'',main);
    entry.asset=asset;entry.fileId=main;assets.push(asset);
    for(const {ctx,id}of entry.uses)contextDest.get(ctx).set(id,{guid:asset.guid,fileId:main,path:asset.path});
    mapping.push({sourceId:node.id,sourcePath:node.path,outputGuid:asset.guid,outputFileId:main,outputPath:asset.path,blocks:entry.uses.map(u=>u.ctx.config.id),variant:entry.key!==node.id});
  }
  for(const guid of analysis._resources) {
    const source=index.assets.get(guid),filename=source.path.split('/').pop(),extension=/\.[A-Za-z0-9]+$/.exec(filename)?.[0]??'';
    const outputName=safeName(extension?filename.slice(0,-extension.length):filename)+extension;
    const asset=await makeGeneratedAsset(root,`Source/Resources/${guid}/${outputName}`,source.asset,'0');
    asset.meta=source.meta.replace(/^guid:[^\r\n]*$/m,`guid: ${asset.guid}`);resourceDest.set(guid,asset);assets.push(asset);
    mapping.push({sourceGuid:guid,sourcePath:source.path,outputGuid:asset.guid,outputPath:asset.path,wholeAsset:true});
  }
  for(const id of analysis._menuNodes) {
    const node=index.nodes.get(id),asset=await makeGeneratedAsset(root,`Menus/${safeName(nameOf(node))}_${(await digest(id)).slice(0,12)}.asset`,'','11400000');
    menuDest.set(id,{asset,guid:asset.guid,fileId:'11400000',path:asset.path});assets.push(asset);
    mapping.push({sourceId:id,sourcePath:node.path,outputGuid:asset.guid,outputFileId:'11400000',outputPath:asset.path});
  }
  for(const oc of analysis._outputs) {
    const output=oc.output,asset=await makeGeneratedAsset(root,`Controllers/${safeName(output.name)}_${safeName(output.id)}.controller`,'','9100000');assets.push(asset);
    const dest={outputId:output.id,guid:asset.guid,fileId:'9100000',path:asset.path,playable:output.playable};controllers.push(dest);destinations.set(output.id,dest);
    let next=8100000000000000000n;
    for(const ctx of oc.contexts) {
      const map=contextDest.get(ctx);map.set(ctx.controller.id,{guid:asset.guid,fileId:'9100000',path:asset.path});
      for(const id of [...ctx.nodeIds].sort()) {
        const n=index.nodes.get(id);if(MOTION_CLASSES.has(n.classId)||n.classId==='319')continue;
        map.set(id,{guid:asset.guid,fileId:String(++next),path:asset.path});
        mapping.push({sourceId:id,sourcePath:n.path,outputGuid:asset.guid,outputFileId:String(next),outputPath:asset.path,blockId:ctx.config.id});
      }
    }
    oc.generatedAsset=asset;
  }
  const rewrite=(text,node,destination,ctx=null,menu=false,scope='document')=>{
    text=canonicalizeObjectReferences(text);const edits=[];
    for(const [ri,r] of extractReferences(text).entries()) {
      const f=refFieldName(text,r);
      if(r.fileId==='0'&&!(menu&&f==='Parameters'))continue;
      if(f==='m_Script'||BUILTIN_GUIDS.has(r.guid))continue;
      const held=preservedEdge(analysis,ctx,node,scope,ri);
      if(held) {recordPreserved(held,destination,/^--- !u!\d+ &(-?\d+)/m.exec(text)?.[1]??'9100000');continue;}
      const id=targetId(node,r);let to;
      if(menu&&f==='Parameters')to={guid:expression.guid,fileId:'11400000'};
      else if(f==='m_Controller'&&ctx)to=destinations.get(ctx.output.id);
      else to=ctx?contextDest.get(ctx).get(id):null;
      to??=menuDest.get(id);
      const resource=resourceDest.get(r.guid??node.guid);if(!to&&resource)to={guid:resource.guid,fileId:r.fileId,referenceType:r.type??'2'};
      assert(to,`No output mapping for ${node.id} -> ${id} (${f})`);
      edits.push({start:r.start,end:r.end,value:to.guid===destination.guid?`{fileID: ${to.fileId}}`:pptr(to.guid,to.fileId,to.referenceType)});
    }
    return rewrites(text,edits);
  };
  for(const entry of motionVariants.values()) {
    const {node,asset,fileId,ctx}=entry;
    let text=replaceDocumentFileId(ctx.texts.get(node.id),fileId);
    if(field(text,'m_ObjectHideFlags')!==null)text=setField(text,'m_ObjectHideFlags','0');
    asset.asset=enc.encode(PREAMBLE+rewrite(text,node,asset,ctx));
    // One copied Motion can serve several blocks; retain every source context
    // in the report even though its serialized bytes are written only once.
    for(const use of entry.uses)for(const held of analysis.preservedReferences)
      if(held.sourceId===node.id&&held.blockId===use.ctx.config.id&&held.scope==='document')recordPreserved(held,asset,fileId);
  }
  for(const [guid,asset]of resourceDest) {
    const source=index.assets.get(guid);
    const mapText=(text,sourceId,scope,fileId)=>rewrites(text,extractReferences(text).flatMap((r,ri)=>{
      if(r.fileId==='0'||r.kind!=='external')return [];
      const held=analysis.preservedReferences.filter(p=>p.sourceId===sourceId&&p.scope===scope&&p.referenceIndex===ri);
      if(held.length){for(const p of held)recordPreserved(p,asset,fileId);return [];}
      if(!resourceDest.has(r.guid))return [];
      return [{start:r.start,end:r.end,value:pptr(resourceDest.get(r.guid).guid,r.fileId,r.type)}];
    }));
    if(source.text) {
      let text=source.text;
      for(const d of [...source.documents].reverse())text=text.replace(d.text,mapText(d.text,key(guid,d.fileId),'document',d.fileId));
      asset.asset=enc.encode(canonicalizeObjectReferences(text));
    }
    const metaWithoutGuid=asset.meta.replace(/^guid:[^\r\n]*(?:\r?\n|$)/m,'');
    asset.meta=`fileFormatVersion: 2\nguid: ${asset.guid}\n`+mapText(metaWithoutGuid,`${guid}:meta`,'meta','meta').replace(/^fileFormatVersion:[^\r\n]*(?:\r?\n|$)/m,'');
  }
  for(const [id,to]of menuDest) {
    const node=index.nodes.get(id);let text=replaceDocumentFileId(node.text,'11400000');
    if(field(text,'m_ObjectHideFlags')!==null)text=setField(text,'m_ObjectHideFlags','0');
    to.asset.asset=enc.encode(PREAMBLE+rewrite(text,node,to,null,true));
  }
  for(const oc of analysis._outputs) {
    const {output,generatedAsset:asset}=oc,base=oc.contexts[0],outDoc=[];
    let controller=canonicalizeObjectReferences(base.controller.text);
    controller=replaceDocumentFileId(controller,'9100000');controller=setField(controller,'m_Name',JSON.stringify(output.name));
    const list=animatorParameters?.[output.id];assert(Array.isArray(list),`Missing resolved Animator Parameters for ${output.id}`);
    const names=new Set();const params=list.map(p=>{
      assert(p&&typeof p.name==='string'&&p.name&&!names.has(p.name)&&TYPE_IDS[p.type]&&Number.isFinite(p.defaultValue),`Invalid resolved Animator Parameter ${p?.name}`);names.add(p.name);
      assert(p.type==='Float'||Number.isInteger(p.defaultValue),'Noninteger Animator default');assert(!['Bool','Trigger'].includes(p.type)||[0,1].includes(p.defaultValue),'Invalid Bool/Trigger default');
      return `  - m_Name: ${JSON.stringify(p.name)}\n    m_Type: ${TYPE_IDS[p.type]}\n    m_DefaultFloat: ${p.type==='Float'?p.defaultValue:0}\n    m_DefaultInt: ${p.type==='Int'?p.defaultValue:0}\n    m_DefaultBool: ${p.type==='Bool'||p.type==='Trigger'?p.defaultValue:0}\n    m_Controller: {fileID: 9100000}\n`;
    });
    for(const ctx of oc.contexts)for(const name of new Set([...ctx.block.parameters.map(p=>p.name),...ctx.usages.map(u=>u.name)]))assert(names.has(name),`Resolved Animator declarations omit ${name}`);
    controller=replaceSection(controller,'m_AnimatorParameters',`  m_AnimatorParameters:${params.length?'':' []'}\n`+params.join(''));
    const layers=oc.layers.map(({ctx,layer,finalIndex})=>{
      let text=layer.text;
      const outputName=output.layerNames?.[`${ctx.config.id}:${layer.index}`]??layer.name;
      if(outputName!==layer.name)text=setField(text,'m_Name',JSON.stringify(outputName),4);
      if(layer.index===0&&finalIndex!==0)text=setField(text,'m_DefaultWeight','1',4);
      if(layer.syncedLayerIndex>=0)text=setField(text,'m_SyncedLayerIndex',String(oc.layers.find(l=>l.ctx===ctx&&l.layer.index===layer.syncedLayerIndex).finalIndex),4);
      layerMapping.push({outputId:output.id,blockId:ctx.config.id,sourceControllerId:ctx.controller.id,sourceLayer:layer.index,outputLayer:finalIndex,
        sourceName:layer.name,outputName,sourceEffectiveWeight:layer.index===0?1:Number(layer.fields.m_DefaultWeight),outputWeight:finalIndex===0?1:Number(field(text.replace(/^  - /,'    '),'m_DefaultWeight',4))});
      return rewrite(text,ctx.controller,asset,ctx,false,`layer:${layer.index}`);
    });
    controller=replaceSection(controller,'m_AnimatorLayers',`  m_AnimatorLayers:${layers.length?'':' []'}\n`+layers.join(''));
    // The controller's top-level fields may contain references too. Rewriting
    // its already-rewritten Layer pointers a second time would corrupt IDs.
    outDoc.push(controller);
    for(const ctx of oc.contexts)for(const id of [...ctx.nodeIds].sort()) {
      const node=index.nodes.get(id);if(MOTION_CLASSES.has(node.classId)||node.classId==='319')continue;
      const to=contextDest.get(ctx).get(id);let text=replaceDocumentFileId(ctx.texts.get(id),to.fileId);
      if(node.classId==='114'&&script(node)===SCRIPTS.layer) {
        const sourceIndex=Number(field(text,'layer'));text=setField(text,'layer',String(oc.layers.find(l=>l.ctx===ctx&&l.layer.index===sourceIndex).finalIndex));
      }
      outDoc.push(rewrite(text,node,asset,ctx));
    }
    asset.asset=enc.encode(PREAMBLE+outDoc.join(''));
  }
  assert(new Set(assets.map(a=>a.path)).size===assets.length,'Generated output path collision');
  assert(new Set(assets.map(a=>a.guid)).size===assets.length,'Generated output GUID collision');
  const resourceGuids=new Set([...resourceDest.values()].map(a=>a.guid));
  for(const a of assets)if(a.path.endsWith('.controller')||a.path.endsWith('.anim')||a.path.endsWith('.asset')) {
    if(resourceGuids.has(a.guid))continue; // Opaque resources are preserved, not interpreted.
    splitUnityDocuments(dec.decode(a.asset));
  }
  return {assets,controllers,menu:plan.installer?.menuId?{guid:menuDest.get(plan.installer.menuId).guid,fileId:'11400000',path:menuDest.get(plan.installer.menuId).path}:null,
    report:{status:outputPreserved.length?'PASS_WITH_EXTERNAL_REFERENCES':'PASS',runtime:'UNVERIFIED',preservedReferences:outputPreserved,usageComplete:analysis.usageComplete,blockStatus:analysis.blockStatus,objectMapping:mapping,layerMapping,externalDependencies:[...analysis._externalDependencies.values()],
      menuParameters:analysis.menuParameters,menuEditorParametersRetargeted:analysis._menuNodes.size?{guid:expression.guid,fileId:'11400000'}:null,
      supported:'Unity text Controllers, selected Layers/States/Transitions, Clip/BlendTree/Mask, known SDK behaviours, optional Menu/resources',
      limitations:['Unity Import/MA/runtime not executed','Synced Layer Motion/Behaviour overrides unsupported','Cross-Playable AnimatorLayerControl mapping unsupported','Unknown StateMachineBehaviour unsupported']}};
}

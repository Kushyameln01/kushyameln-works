import {indexPackages,analyzeComposition,generateComposition,makeGeneratedAsset} from '../../animator-composer/lib/composition.mjs';
import {parseExpression,serializeExpression} from '../../animator-composer/lib/registration.mjs';
import {digest,validateAssets} from '../../animator-composer/lib/generate.mjs';
import {readUnityPackage,writeUnityPackage,MAX_UNITY_PACKAGE_BYTES} from '../ft/unity-package.mjs';
import {splitUnityDocuments,extractReferences,extractAnimatorLayers,canonicalizeObjectReferences,parseUnityScalar} from '../ft/unity-text.mjs';
import {rootController,parameterText} from './root-layers.mjs';
import {DEFAULT_VALUE_RULES,applyDefaultValueRules,EXPRESSION_SYNC_RULES,applyExpressionSyncRules} from './default-value-rules.mjs';
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const issue=(code,message,detail={})=>({severity:'error',code,message,...detail});
function fail(issues){const e=new Error(issues.map(i=>i.message).join('\n'));e.name='IntegrationError';e.issues=issues;e.report={status:'BLOCKED',issues};throw e;}
export function catalogPackages(packages){
 const index=indexPackages(packages),catalog={...index.catalog,blendTrees:index.catalog.motions.filter(m=>m.kind==='blendTree'),masks:[]};
 for(const n of index.nodes.values())if(n.classId==='319')catalog.masks.push({id:n.id,guid:n.guid,fileId:n.fileId,path:n.path,name:parseUnityScalar(/^  m_Name:([^\r\n]*)$/m.exec(n.text)?.[1]??n.fileId)});
 return {catalog,inputHashes:index.inputHashes};
}
export async function importSources(sources){
 if(!Array.isArray(sources)||!sources.length)throw Error('Choose one or more source files.');
 const owned=sources.map(s=>{if(typeof s?.name!=='string'||!(s.bytes instanceof Uint8Array)||!s.bytes.length||s.bytes.length>MAX_UNITY_PACKAGE_BYTES)throw Error('Each source must contain 1–128 MiB of bytes.');return {name:s.name,bytes:Uint8Array.from(s.bytes)};});
 if(new Set(owned.map(s=>s.name)).size!==owned.length)throw Error('Duplicate source filename; choose distinct paths.');
 const packages=[],used=new Set();
 for(const s of owned){if(used.has(s.name))continue;
  if(/\.unitypackage$/i.test(s.name)){packages.push({name:s.name,hash:await digest(s.bytes),assets:[...readUnityPackage(s.bytes).values()]});used.add(s.name);continue;}
  if(/\.(controller|anim|asset|mask)$/i.test(s.name)){
   const meta=owned.find(m=>m.name===s.name+'.meta');if(!meta)throw Error(`Missing companion meta: ${s.name}.meta`);
   const text=dec.decode(s.bytes);splitUnityDocuments(text);const metadata=dec.decode(meta.bytes),guids=[...metadata.matchAll(/^guid:\s*([a-f0-9]{32})\s*$/gm)];if(guids.length!==1)throw Error(`Invalid meta GUID: ${meta.name}`);
   const bytes=new Uint8Array(s.bytes.length+meta.bytes.length+1);bytes.set(s.bytes);bytes.set(meta.bytes,s.bytes.length+1);
   const path=s.name.startsWith('Assets/')?s.name:`Assets/Imported/${s.name}`;
   packages.push({name:s.name,hash:await digest(bytes),assets:[{guid:guids[0][1],path,asset:s.bytes,meta:metadata}]});used.add(s.name);used.add(meta.name);continue;
  }
  if(s.name.endsWith('.meta')&&owned.some(a=>a.name===s.name.slice(0,-5)))continue;
  throw Error(`Unsupported source: ${s.name}. Use unitypackage or Unity text asset plus meta.`);
 }
 return {...catalogPackages(packages),packages};
}
function validateRequest(index,r){
 const issues=[];
 if(!r||r.schemaVersion!==1)return [issue('request_version','Expected schemaVersion 1.')];
 if(typeof r.name!=='string'||!/^\p{L}[\p{L}\p{N}_.-]{0,63}$|^[0-9][\p{L}\p{N}_.-]{0,63}$/u.test(r.name)||r.name==='..')issues.push(issue('output_name','Output name must contain 1–64 letters, numbers, underscores, hyphens or dots.'));
 if(!['Base','Additive','Gesture','Action','FX','Sitting','TPose','IKPose'].includes(r.playable)||r.writeDefaults!==true)issues.push(issue('options','Choose a supported Playable and new-state Write Defaults ON.'));
 for(const [field,cls]of [['controllerIds','91'],['expressionIds','114']]){
  const ids=r[field];if(!Array.isArray(ids)||(field==='controllerIds'&&!ids.length)||new Set(ids).size!==ids.length){issues.push(issue('selection',`Invalid or duplicate ${field}.`));continue;}
  for(const id of ids){const n=index.nodes.get(id);if(!n||n.classId!==cls||field==='expressionIds'&&!index.catalog.expressions.some(e=>e.id===id))issues.push(issue('selection_type',`${field}: missing or wrong-class identity ${id}.`,{id}));}
 }
 for(const [field,cls]of [['maskId','319'],['binaryTreeId','206'],['smoothTreeId','206']]){const n=index.nodes.get(r[field]);if(!n||n.classId!==cls)issues.push(issue('selection_type',`${field}: missing or wrong-class identity ${r[field]}.`,{id:r[field]}));}
 if(index.catalog.conflicts.length)issues.push(issue('guid_conflict','Different contents share a GUID; remove or resolve the source conflict.',{conflicts:index.catalog.conflicts}));
 return issues;
}
function mergeExpressions(index,ids){
 const rows=new Map(),issues=[],sources=[],changes=[],syncChanges=[];let added=true;
 for(const id of ids){let list;try{list=parseExpression(index.nodes.get(id).text);}catch(e){issues.push(issue('expression_unsupported',`${id}: ${e.message}`,{id}));continue;}
  const normalized=applyDefaultValueRules(list,{domain:'expression',sourceId:id});changes.push(...normalized.changes);
  const synced=applyExpressionSyncRules(normalized.rows,{sourceId:id});syncChanges.push(...synced.changes);
  for(const [i,original] of list.entries()){const row=synced.rows[i];if(row.name==='AlwaysOne')added=false;
   const previous=rows.get(row.name);if(previous&&JSON.stringify(previous.row)!==JSON.stringify(row))issues.push(issue('expression_conflict',`${row.name}: Expression settings differ.`,{name:row.name,options:[previous,{sourceId:id,row}]}));else if(!previous)rows.set(row.name,{row,sourceId:id});
   sources.push({sourceId:id,name:row.name,original,normalized:row});
  }
 }
 const ensured=applyDefaultValueRules([...rows.values()].map(x=>x.row),{domain:'expression',sourceId:'integrator',ensure:true});changes.push(...ensured.changes);
 const result=ensured.rows;try{serializeExpression(result);}catch(e){issues.push(issue('expression_invalid',e.message));}
 return {rows:result,issues,sources,changes,syncChanges,added,bitCost:result.reduce((n,r)=>n+(r.networkSynced?(r.type==='Bool'?1:8):0),0)};
}
export async function integratePackages(packages,request,kernel){
 let index=indexPackages(packages),issues=validateRequest(index,request);if(issues.length)fail(issues);
 const expressions=mergeExpressions(index,request.expressionIds);issues.push(...expressions.issues);if(issues.length)fail(issues);
 // Private index edits happen before dependency traversal: obsolete masks do not enter closure.
 const union=new Map(),alwaysSources=[],sourceLayers=new Map(),ruleChanges=[...expressions.changes];
 for(const id of request.controllerIds){const n=index.nodes.get(id);sourceLayers.set(id,extractAnimatorLayers(n.text));let text=canonicalizeObjectReferences(n.text);const declared=index.catalog.controllers.find(c=>c.id===id).parameters;
  alwaysSources.push(...declared.filter(p=>p.name==='AlwaysOne').map(p=>({sourceId:id,...p})));
  const applied=applyDefaultValueRules(declared,{domain:'animator',sourceId:id});ruleChanges.push(...applied.changes);const normalized=applied.rows;
  for(const p of normalized)if(!union.has(p.name))union.set(p.name,p);
  text=text.replace(/^  m_AnimatorParameters:[\s\S]*?(?=^  [A-Za-z_])/m,'  m_AnimatorParameters:\n'+normalized.map(parameterText).join(''));
  const [guid,fileId]=request.maskId.split(':');text=text.replace(/^    m_Mask:.*$/gm,`    m_Mask: {fileID: ${fileId}, guid: ${guid}, type: 2}`).replace(/^    m_DefaultWeight:.*$/gm,'    m_DefaultWeight: 1');
  index.nodes.set(id,{...n,text});index.catalog.controllers.find(c=>c.id===id).parameters=normalized;
 }
 const ensured=applyDefaultValueRules([...union.values()],{domain:'animator',sourceId:'integrator',ensure:true});ruleChanges.push(...ensured.changes);for(const p of ensured.rows)union.set(p.name,p);
 const helper=await makeGeneratedAsset(`Assets/${request.name}`,'InternalRoots.controller',rootController([...union.values()],[request.binaryTreeId,request.smoothTreeId],request.maskId),'9100000');
 if(index.assets.has(helper.guid))fail([issue('helper_collision','Internal helper GUID collides with input.')]);
 const helperIndex=indexPackages([{hash:await digest(helper.asset),name:'internal',assets:[helper]}]);
 for(const [k,v]of helperIndex.assets)index.assets.set(k,v);for(const [k,v]of helperIndex.nodes)index.nodes.set(k,v);index.catalog.controllers.push(...helperIndex.catalog.controllers);
 const configs=request.controllerIds.map((controllerId,i)=>({id:`controller-${i}`,controllerId,layerIndices:index.catalog.controllers.find(c=>c.id===controllerId).layers.map(l=>l.index)}));
 configs.push({id:'roots',controllerId:`${helper.guid}:9100000`,layerIndices:[0,1]});
 const layerNames={};
 for(const [key,value]of Object.entries(request.layerNames??{})){const found=configs.slice(0,-1).find(c=>c.layerIndices.some(i=>`${c.controllerId}:${i}`===key));if(!found)fail([issue('layer_name_selection',`Unknown layer rename identity ${key}`)]);const i=found.layerIndices.find(i=>`${found.controllerId}:${i}`===key);layerNames[`${found.id}:${i}`]=value;}
 const plan={schemaVersion:1,name:request.name,inputHashes:index.inputHashes,outputs:[{id:'fx',name:request.name,playable:request.playable,base:configs[0],additions:configs.slice(1),layerNames,retainWholeControllers:true,preserveObjectHideFlags:true}],animatorChoices:{fx:{AlwaysOne:{type:'Float',defaultValue:1}}}};
 const analysis=analyzeComposition(index,plan,kernel);issues.push(...analysis.issues,...analysis.dependencyDiagnostics.map(d=>issue('dependency_missing',d.message??`Missing reference ${d.targetId}`,d)));
 const merged=new Map();
 for(const block of analysis.blocks)for(const p of block.parameters){const normalized=applyDefaultValueRules([p],{domain:'animator',sourceId:block.id}).rows[0];const previous=merged.get(p.name);if(previous&&(previous.type!==normalized.type||previous.defaultValue!==normalized.defaultValue))issues.push(issue('animator_conflict',`${p.name}: Animator type or default differs.`,{name:p.name,options:[previous,{...normalized,sourceId:block.id}]}));else merged.set(p.name,{name:p.name,type:normalized.type,defaultValue:normalized.defaultValue});}
 if(issues.some(i=>i.severity==='error'))fail(issues);
 const built=await generateComposition(index,plan,analysis,{fx:[...merged.values()]}),assets=[...built.assets];
 assets.push(await makeGeneratedAsset(`Assets/${request.name}`,'Parameters/ExpressionParameters.asset',serializeExpression(expressions.rows),'11400000'));
 for(const layer of built.report.layerMapping){const original=sourceLayers.get(layer.sourceControllerId)?.[layer.sourceLayer];if(original){layer.sourceSerializedWeight=Number(original.fields.m_DefaultWeight);layer.sourceEffectiveWeight=layer.sourceLayer===0?1:layer.sourceSerializedWeight;}}
 preserveMetadata(assets,index,built,request);
 const verified=validateAssets(assets),archive=writeUnityPackage(assets),reopened=[...readUnityPackage(archive).values()];
 if(reopened.length!==assets.length)throw Error('Roundtrip asset count mismatch.');
 for(const a of assets){const b=reopened.find(b=>b.guid===a.guid);if(!b||a.path!==b.path||a.meta!==b.meta||await digest(a.asset)!==await digest(b.asset))throw Error(`Roundtrip bytes mismatch: ${a.path}`);}
 const report={format:'animator-integrator-report-1',status:'PASS',inputHashes:index.inputHashes,request,controllers:built.controllers,parameters:expressions.rows,animatorParameters:[...merged.values()],bitCost:expressions.bitCost,expressionSources:expressions.sources,defaultValueRules:{rules:DEFAULT_VALUE_RULES,changes:ruleChanges},expressionSyncRules:{rules:EXPRESSION_SYNC_RULES,changes:expressions.syncChanges},alwaysOne:{type:'Float',defaultValue:1,animatorAdded:alwaysSources.length===0,animatorSources:alwaysSources,expressionAdded:expressions.added,newExpressionFlags:expressions.added?{saved:false,networkSynced:false}:null},composition:built.report,staticValidation:{status:'PASS',...verified,roundtripAssets:reopened.length,roundtripBytes:'PASS'},verification:{unityImport:'UNVERIFIED',runtime:'UNVERIFIED'},warnings:issues.filter(i=>i.severity!=='error')};
 return {archive,report,assetCount:assets.length,diagnosticAssets:assets};
}

// Preserve source importer fields; only identities/main-object pointers change.
// The ordered base owns the single final Controller's importer metadata.
function preserveMetadata(assets,index,built,request){
 const mappings=built.report.objectMapping,refs=new Map();
 for(const m of mappings)if(m.sourceId){const list=refs.get(m.sourceId)??[];if(!list.some(x=>x.guid===m.outputGuid&&x.fileId===m.outputFileId))list.push({guid:m.outputGuid,fileId:m.outputFileId});refs.set(m.sourceId,list);}
 const controller=built.controllers[0];for(const id of request.controllerIds)refs.set(id,[{guid:controller.guid,fileId:controller.fileId}]);
 for(const a of assets){let original,main;
  if(a.guid===controller.guid){original=index.assets.get(request.controllerIds[0].split(':')[0]);main=controller.fileId;}
  else {const m=mappings.find(m=>m.outputGuid===a.guid&&m.sourceId);if(m){const [guid,fileId]=m.sourceId.split(':');const source=index.assets.get(guid);if(new RegExp(`^  mainObjectFileID: ${fileId}\\s*$`,'m').test(source.meta??'')){original=source;main=m.outputFileId;}}}
  if(!original)continue;
  let meta=original.meta.replace(/^guid:[^\r\n]*$/m,`guid: ${a.guid}`).replace(/^  mainObjectFileID:[^\r\n]*$/m,`  mainObjectFileID: ${main}`);
  const edits=[];for(const ref of extractReferences(meta.replace(/^guid:[^\r\n]*$/m,line=>' '.repeat(line.length)))){
   if(ref.fileId==='0'||/^0{16}[ef]0{15}$/.test(ref.guid??''))continue;
   const id=`${ref.guid??original.guid}:${ref.fileId}`,to=refs.get(id);
   if(to?.length>1)fail([issue('metadata_ambiguous',`Importer metadata has ambiguous remap: ${id}`)]);
   if(to?.length)edits.push({start:ref.start,end:ref.end,text:to[0].guid===a.guid?`{fileID: ${to[0].fileId}}`:`{fileID: ${to[0].fileId}, guid: ${to[0].guid}, type: ${ref.type??2}}`});
  }
  for(const edit of edits.reverse())meta=meta.slice(0,edit.start)+edit.text+meta.slice(edit.end);a.meta=meta;
 }
}

// Integrator-only materialization: existing asset identities and complete source files survive.
import {splitUnityDocuments,extractReferences,extractAnimatorLayers,extractAnimatorParameters,parseUnityScalar} from '../ft/unity-text.mjs';
import {digest} from '../../animator-composer/lib/generate.mjs';
import {serializeExpression} from '../../animator-composer/lib/registration.mjs';
import {parameterText,rootController} from './root-layers.mjs';
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const STRUCTURAL=new Set(['1107','1102','1101','1109','114']);
const MOTION=new Set(['74','206','319']);
const LAYER_SCRIPT='-1936262289',SDK='67cc4cb7839cd3741b63733d5adf0442';
export const PARENT_FOLDER_PATH='Assets/Merged_DecodeAndSmooth';
export function preservedOutputPath(path){if(path===PARENT_FOLDER_PATH||path.startsWith(PARENT_FOLDER_PATH+'/'))return path;if(!path.startsWith('Assets/'))throw Error('Original Assets-relative path is required.');return `${PARENT_FOLDER_PATH}/${path.slice(7)}`;}
const issue=(code,message,detail={})=>({severity:'error',code,message,...detail});
function blocked(issues){const e=new Error(issues.map(i=>i.message).join('\n'));e.name='IntegrationError';e.issues=issues;e.report={status:'BLOCKED',issues};throw e;}
const sameBytes=(a,b)=>a===null?b===null:b instanceof Uint8Array&&a.length===b.length&&a.every((v,i)=>v===b[i]);
/** Inspect raw packages, before GUID indexing can collapse path ambiguities. */
export function preservationInputIssues(packages,request){
 const issues=[],byGuid=new Map(),byPath=new Map();
 for(const pkg of packages)for(const a of pkg.assets){
  const guid=a.guid.toLowerCase(),prior=byGuid.get(guid),pathKey=a.path.toLowerCase(),pathPrior=byPath.get(pathKey);
  if(prior&&(prior.path!==a.path||prior.meta!==a.meta||!sameBytes(prior.asset,a.asset)))issues.push(issue('preservation_guid_conflict',`GUID ${guid} has conflicting paths or contents.`,{guid,paths:[prior.path,a.path]}));
  if(pathPrior&&pathPrior.guid.toLowerCase()!==guid)issues.push(issue('preservation_path_conflict',`Original path ${a.path} belongs to different GUIDs.`,{path:a.path,guids:[pathPrior.guid,guid]}));
  if(pathPrior&&pathPrior.path!==a.path)issues.push(issue('preservation_path_case_conflict',`Original paths differ only in case: ${pathPrior.path} / ${a.path}.`,{paths:[pathPrior.path,a.path]}));
  byGuid.set(guid,a);byPath.set(pathKey,a);
 }
 if(Array.isArray(request?.expressionIds)&&!request.expressionIds.length)issues.push(issue('expression_destination_missing','Select an existing Expression asset as the merge destination; new GUID issuance is prohibited.'));
 return issues;
}
/** Source-host restrictions are explicit; no fallback extraction or additional Controller host. */
export function preservationHostIssues(index,request){
 const issues=[],selectedControllers=request.controllerIds??[],selectedExpressions=request.expressionIds??[],seen=new Set();
 for(const [kind,ids]of [['controller',selectedControllers],['expression',selectedExpressions]])for(const [i,id]of ids.entries()){
  const node=index.nodes.get(id);if(!node)continue;const asset=index.assets.get(node.guid);
  if(seen.has(node.guid))issues.push(issue('preservation_shared_merge_host',`Multiple merge selections share one host: ${asset.path}.`,{hostGuid:node.guid,path:asset.path,id}));seen.add(node.guid);
  if(i===0)continue;
  const incompatible=asset.documents.filter(d=>d.fileId!==node.fileId&&(kind==='expression'||!STRUCTURAL.has(d.classId)||d.classId==='114'&&!extractReferences(d.text).some(r=>r.guid?.toLowerCase()===SDK&&['-706344726','-646210727','1852460640',LAYER_SCRIPT].includes(r.fileId))));
  if(incompatible.length)issues.push(issue('preservation_embedded_host',`Cannot merge ${asset.path} while preserving its embedded objects; no extraction or alternate host is permitted.`,{hostGuid:node.guid,path:asset.path,objects:incompatible.map(d=>({id:`${node.guid}:${d.fileId}`,classId:d.classId}))}));
 }
 return issues;
}
function section(text,name,indent=2){
 const fields=[...text.matchAll(new RegExp(`^${' '.repeat(indent)}([A-Za-z_][A-Za-z_0-9]*):[^\\r\\n]*(?:\\r?\\n|$)`,'gm'))],positions=fields.flatMap((m,i)=>m[1]===name?[i]:[]);
 if(positions.length!==1)throw Error(`Missing or ambiguous ${name}.`);const i=positions[0];return {start:fields[i].index,end:fields[i+1]?.index??text.length};
}
export function patchSection(text,name,value,indent=2){const s=section(text,name,indent);return text.slice(0,s.start)+value+text.slice(s.end);}
function scalar(text,name,indent=2){const m=new RegExp(`^${' '.repeat(indent)}${name}:([^\\r\\n]*)$`,'m').exec(text);if(!m)throw Error(`Missing ${name}.`);return parseUnityScalar(m[1]);}
function set(text,name,value,indent=2){const re=new RegExp(`^(${' '.repeat(indent)}${name}:)[^\\r\\n]*`,'m');if(!re.test(text))throw Error(`Missing ${name}.`);return text.replace(re,(_,key)=>`${key} ${value}`);}
const ref=id=>{const [guid,fileId]=id.split(':');return `{fileID: ${fileId}, guid: ${guid}, type: 2}`;};
function applyEdits(text,edits){for(const e of [...edits].sort((a,b)=>b.start-a.start))text=text.slice(0,e.start)+e.value+text.slice(e.end);return text;}
function layerControl(node){return node.classId==='114'&&extractReferences(node.text).some(r=>r.guid?.toLowerCase()===SDK&&r.fileId===LAYER_SCRIPT);}
/** Preserve every original file except selected absorbed hosts; only destination sections/structural copies change. */
export async function materializePreservedIntegration(index,request,analysis,animatorParameters,expressionRows){
 const issues=preservationHostIssues(index,request);if(issues.length)blocked(issues);
 const base=index.nodes.get(request.controllerIds[0]),expression=index.nodes.get(request.expressionIds[0]);
 const baseAsset=index.assets.get(base.guid),expressionAsset=index.assets.get(expression.guid),destination={guid:base.guid,fileId:base.fileId,path:preservedOutputPath(baseAsset.path),playable:request.playable,outputId:'fx'};
 const oc=analysis._outputs[0],source=index.assets,absorbed=new Set([...request.controllerIds.slice(1),...request.expressionIds.slice(1)].map(id=>id.split(':')[0]));
 const assets=[...source.values()].filter(a=>!absorbed.has(a.guid)).map(a=>({guid:a.guid,path:preservedOutputPath(a.path),asset:a.asset===null?null:Uint8Array.from(a.asset),meta:a.meta}));
 const pathOwners=new Map();for(const a of assets){const key=a.path.toLowerCase();if(pathOwners.has(key))blocked([issue('preservation_relocation_conflict',`Parent relocation collides at ${a.path}.`,{path:a.path,guids:[pathOwners.get(key),a.guid]})]);pathOwners.set(key,a.guid);}
 const outputByGuid=new Map(assets.map(a=>[a.guid,a])),used=new Set(baseAsset.documents.map(d=>d.fileId)),maps=new Map(),changes=[],mapping=[];
 let next=1n;const allocate=()=>{while(used.has(String(next)))next++;const id=String(next++);used.add(id);return id;};
 const contexts=oc.contexts;
 // Reserve every imported noncolliding ID before allocating collisions/new roots.
 const reservedImports=new Set();
 for(const ctx of contexts.slice(1))for(const d of source.get(ctx.controller.guid).documents)if(d.fileId!==ctx.controller.fileId&&STRUCTURAL.has(d.classId)&&!used.has(d.fileId)&&!reservedImports.has(d.fileId))reservedImports.add(d.fileId);
 for(const id of reservedImports)used.add(id);
 const claimed=new Set(baseAsset.documents.map(d=>d.fileId));
 for(const [i,ctx]of contexts.entries()){
  const map=new Map();maps.set(ctx,map);map.set(ctx.controller.id,{guid:base.guid,fileId:base.fileId});
  for(const d of source.get(ctx.controller.guid).documents){if(d.fileId===ctx.controller.fileId)continue;const id=`${ctx.controller.guid}:${d.fileId}`;
   if(i===0){map.set(id,{guid:base.guid,fileId:d.fileId});continue;}
   const fileId=claimed.has(d.fileId)?allocate():d.fileId;claimed.add(fileId);used.add(fileId);map.set(id,{guid:base.guid,fileId});
   if(fileId!==d.fileId)changes.push({sourceId:id,sourcePath:ctx.controller.path,outputFileId:fileId,reason:'structural_fileid_collision'});
  }
 }
 const resolve=(ctx,id)=>{
  const own=maps.get(ctx).get(id);if(own)return own;
  const candidates=contexts.flatMap(c=>maps.get(c).has(id)?[maps.get(c).get(id)]:[]);return candidates[0]??null;
 };
 const rewrite=(text,node,ctx)=>applyEdits(text,extractReferences(text).flatMap(r=>{
  if(r.fileId==='0')return [];const id=`${(r.guid??node.guid).toLowerCase()}:${r.fileId}`,to=resolve(ctx,id);if(!to)return [];
  if(to.guid===(r.guid??node.guid).toLowerCase()&&to.fileId===r.fileId&&node.guid===base.guid)return [];
  return [{start:r.start,end:r.end,value:to.guid===base.guid?`{fileID: ${to.fileId}}`:ref(`${to.guid}:${to.fileId}`)}];
 }));
 const copyNode=(node,ctx)=>{
  let text=node.text,to=maps.get(ctx).get(node.id);
  if(to.fileId!==node.fileId){const doc=splitUnityDocuments(text).documents[0],start=doc.header.indexOf('&')+1;text=text.slice(0,start)+to.fileId+text.slice(start+node.fileId.length);}
  if(layerControl(node)){const original=Number(scalar(text,'layer')),target=oc.layers.find(l=>l.ctx===ctx&&l.layer.index===original);if(!target)blocked([issue('preservation_layer_reference',`Unresolved layer control in ${node.id}.`,{sourceId:node.id})]);text=set(text,'layer',target.finalIndex);}
  return rewrite(text,node,ctx);
 };
 for(const ctx of contexts)for(const id of ctx.nodeIds){const node=index.nodes.get(id);if(node.guid!==ctx.controller.guid&&layerControl(node)){const original=Number(scalar(node.text,'layer')),target=oc.layers.find(l=>l.ctx===ctx&&l.layer.index===original);if(target?.finalIndex!==original)blocked([issue('preservation_external_layer_control',`Read-only source layer control ${id} would require mutation.`,{sourceId:id,sourcePath:node.path,sourceLayer:original,outputLayer:target?.finalIndex})]);}}
 const layers=oc.layers.map(({ctx,layer,finalIndex})=>{
  let text=layer.text,name=request.layerNames?.[`${ctx.controller.id}:${layer.index}`]??layer.name;
  if(name!==layer.name)text=set(text,'m_Name',JSON.stringify(name),4);
  text=set(text,'m_DefaultWeight',1,4);text=set(text,'m_Mask',ref(request.maskId),4);
  if(layer.syncedLayerIndex>=0)text=set(text,'m_SyncedLayerIndex',oc.layers.find(l=>l.ctx===ctx&&l.layer.index===layer.syncedLayerIndex).finalIndex,4);
  return {text:rewrite(text,ctx.controller,ctx),name,ctx,layer,finalIndex};
 });
 const roots=splitUnityDocuments(rootController([], [request.binaryTreeId,request.smoothTreeId],request.maskId)),rootIds=new Map(['100','101','200','201'].map(id=>[id,allocate()]));
 const rootText=text=>applyEdits(text,extractReferences(text).flatMap(r=>{
  if(r.guid||r.fileId==='0')return [];const to=r.fileId==='9100000'?base.fileId:rootIds.get(r.fileId);return to?[{start:r.start,end:r.end,value:`{fileID: ${to}}`}]:[];
 }));
 const rootLayers=extractAnimatorLayers(roots.documents[0].text).map(l=>rootText(l.text));
 const names=layers.map(l=>l.name);for(const name of ['Root_BinaryParameter','Root_Smooth_Parameter']){if(names.includes(name))blocked([issue('layer_name_conflict',`Duplicate output Layer name ${name}; specify an imported Layer rename.`)]);names.push(name);}
 const baseRaw=dec.decode(baseAsset.asset),baseSourceDocs=splitUnityDocuments(baseRaw).documents,baseDoc=baseSourceDocs.find(d=>d.fileId===base.fileId);let controller=baseDoc.text;
 const originalParameters=new Map();for(const ctx of contexts){const original=source.get(ctx.controller.guid).documents.find(d=>d.fileId===ctx.controller.fileId);for(const record of extractAnimatorParameters(original.text))if(!originalParameters.has(record.name))originalParameters.set(record.name,{record,guid:ctx.controller.guid});}
 const parameterRows=animatorParameters.map(p=>{const prior=originalParameters.get(p.name);if(!prior)return parameterText(p,base.fileId);let text=prior.record.text;const type=String({Float:1,Int:3,Bool:4,Trigger:9}[p.type]),field=p.type==='Float'?'m_DefaultFloat':p.type==='Int'?'m_DefaultInt':'m_DefaultBool';if(prior.record.fields.m_Type!==type)text=set(text,'m_Type',type,4);if(Number(prior.record.fields[field])!==p.defaultValue)text=set(text,field,p.defaultValue,4);const pointer=extractReferences(prior.record.fields.m_Controller)[0];if(pointer.fileId!=='0'&&((pointer.guid??prior.guid).toLowerCase()!==base.guid||pointer.fileId!==base.fileId))text=set(text,'m_Controller',`{fileID: ${base.fileId}}`,4);return text;});
 controller=patchSection(controller,'m_AnimatorParameters',`  m_AnimatorParameters:${animatorParameters.length?'':' []'}\n`+parameterRows.join(''));
 controller=patchSection(controller,'m_AnimatorLayers','  m_AnimatorLayers:\n'+layers.map(l=>l.text).join('')+rootLayers.join(''));
 // Preserve base document order; only explicit layer-control fields in base structural nodes may change.
 const baseEdits=[{start:baseDoc.start,end:baseDoc.end,value:controller}];
 for(const d of baseSourceDocs){const node=index.nodes.get(`${base.guid}:${d.fileId}`);if(d.fileId!==base.fileId&&layerControl(node)){const updated=copyNode(node,contexts[0]);if(updated!==d.text)baseEdits.push({start:d.start,end:d.end,value:updated});}}
 let merged=applyEdits(baseRaw,baseEdits);if(!merged.endsWith('\n'))merged+='\n';
 for(const ctx of contexts.slice(1))for(const d of source.get(ctx.controller.guid).documents){if(d.fileId===ctx.controller.fileId)continue;const node=index.nodes.get(`${ctx.controller.guid}:${d.fileId}`);merged+=copyNode(node,ctx);if(!merged.endsWith('\n'))merged+='\n';}
 for(const d of roots.documents.slice(1)){const to=rootIds.get(d.fileId),start=d.header.indexOf('&')+1;merged+=rootText(d.text.slice(0,start)+to+d.text.slice(start+d.fileId.length));}
 outputByGuid.get(base.guid).asset=enc.encode(merged);
 const expressionText=dec.decode(expressionAsset.asset),expressionDoc=splitUnityDocuments(expressionText).documents.find(d=>d.fileId===expression.fileId),serialized=serializeExpression(expressionRows),s=section(splitUnityDocuments(serialized).documents[0].text,'parameters');
 const parameters=splitUnityDocuments(serialized).documents[0].text.slice(s.start,s.end);
 outputByGuid.get(expression.guid).asset=enc.encode(expressionText.slice(0,expressionDoc.start)+patchSection(expressionDoc.text,'parameters',parameters)+expressionText.slice(expressionDoc.end));
 const layerMapping=layers.map(l=>({outputId:'fx',blockId:l.ctx.config.id,sourceControllerId:l.ctx.controller.id,sourceLayer:l.layer.index,outputLayer:l.finalIndex,sourceName:l.layer.name,outputName:l.name,sourceEffectiveWeight:l.layer.index===0?1:Number(l.layer.fields.m_DefaultWeight),outputWeight:1}));
 for(const [i,name]of ['Root_BinaryParameter','Root_Smooth_Parameter'].entries())layerMapping.push({outputId:'fx',blockId:'roots',sourceControllerId:null,sourceLayer:i,outputLayer:layers.length+i,sourceName:name,outputName:name,outputWeight:1});
 for(const ctx of contexts)for(const [id,to]of maps.get(ctx)){if(id===ctx.controller.id||MOTION.has(index.nodes.get(id)?.classId))continue;mapping.push({sourceId:id,sourcePath:ctx.controller.path,outputGuid:to.guid,outputFileId:to.fileId,outputPath:destination.path,blockId:ctx.config.id});}
 for(const a of assets)for(const d of source.get(a.guid).documents)if(MOTION.has(d.classId))mapping.push({sourceId:`${a.guid}:${d.fileId}`,sourcePath:source.get(a.guid).path,outputGuid:a.guid,outputFileId:d.fileId,outputPath:a.path,preserved:true});
 const existingParent=assets.find(a=>a.path===PARENT_FOLDER_PATH);let parentFolder;
 if(existingParent){if(existingParent.asset!==null||!/^folderAsset:\s*yes\s*$/m.test(existingParent.meta))blocked([issue('preservation_parent_conflict','The requested parent path is already occupied by a non-folder.',{path:PARENT_FOLDER_PATH,guid:existingParent.guid})]);parentFolder={path:PARENT_FOLDER_PATH,guid:existingParent.guid,created:false,sourcePath:source.get(existingParent.guid).path};}
 else {const guid=(await digest(enc.encode('animator-integrator-parent-folder-v1:'+PARENT_FOLDER_PATH))).slice(0,32);if(source.has(guid))blocked([issue('preservation_parent_guid_conflict',`New parent folder GUID collides with input ${guid}.`,{guid,path:source.get(guid).path})]);const parent={guid,path:PARENT_FOLDER_PATH,asset:null,meta:`fileFormatVersion: 2\nguid: ${guid}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`};assets.push(parent);parentFolder={path:PARENT_FOLDER_PATH,guid,created:true};}
 const modifiedHosts=[base.guid,expression.guid],preservation={policy:'original-input-files-v1',parentFolder,sourceAssets:assets.filter(a=>source.has(a.guid)&&!modifiedHosts.includes(a.guid)).map(a=>({guid:a.guid,sourcePath:source.get(a.guid).path,outputPath:a.path})),modifiedHosts:[{guid:base.guid,sourcePath:baseAsset.path,outputPath:destination.path,fileId:base.fileId,kind:'controller'},{guid:expression.guid,sourcePath:expressionAsset.path,outputPath:preservedOutputPath(expressionAsset.path),fileId:expression.fileId,kind:'expression'}],preservedMotionDocuments:mapping.filter(m=>m.preserved),structuralFileIdChanges:changes,absorbedHosts:[...absorbed]};
 assertPreservedSources(index,assets,preservation);
 return {assets,controllers:[destination],preservation,report:{status:'PASS',runtime:'UNVERIFIED',objectMapping:mapping,layerMapping,externalDependencies:[...analysis._externalDependencies.values()],limitations:['Static validation does not establish Unity import/runtime acceptance.']}};
}
/** Product assertion compares source bytes/identity directly, without normalizing IDs/references. */
export function assertPreservedSources(index,assets,preservation){
 const byGuid=new Map(assets.map(a=>[a.guid,a])),modified=new Set(preservation.modifiedHosts.map(h=>h.guid)),absorbed=new Set(preservation.absorbedHosts);
 for(const [guid,original]of index.assets){
  if(absorbed.has(guid))continue;const output=byGuid.get(guid);
  if(!output||output.path!==preservedOutputPath(original.path)||output.meta!==original.meta||(!modified.has(guid)&&!sameBytes(original.asset,output.asset)))blocked([issue('preservation_source_changed',`Source file identity/bytes changed: ${original.path}.`,{guid,path:original.path})]);
  if(modified.has(guid)&&original.asset!==null){const outDocs=splitUnityDocuments(dec.decode(output.asset)).documents;
   for(const d of original.documents){const current=outDocs.find(o=>o.fileId===d.fileId);if(!current||current.header!==d.header||(/^  m_Name:[^\r\n]*$/m.exec(current.text)?.[0]??null)!==(/^  m_Name:[^\r\n]*$/m.exec(d.text)?.[0]??null))blocked([issue('preservation_existing_identity',`Original document identity/name changed: ${guid}:${d.fileId}.`,{guid,path:original.path,fileId:d.fileId})]);}
   const sequence=outDocs.filter(d=>MOTION.has(d.classId)).map(d=>d.fileId),expected=original.documents.filter(d=>MOTION.has(d.classId));
   if(JSON.stringify(sequence)!==JSON.stringify(expected.map(d=>d.fileId)))blocked([issue('preservation_motion_grouping',`Embedded Motion/Mask grouping changed: ${original.path}.`,{guid,path:original.path})]);
   for(const d of expected)if(outDocs.find(o=>o.fileId===d.fileId)?.text!==d.text)blocked([issue('preservation_motion_changed',`Embedded object changed: ${guid}:${d.fileId}.`,{guid,path:original.path,fileId:d.fileId})]);
  }
 }
 for(const a of assets){if(a.path!==PARENT_FOLDER_PATH&&!a.path.startsWith(PARENT_FOLDER_PATH+'/'))blocked([issue('preservation_parent_scope',`Output escaped required parent: ${a.path}.`,{path:a.path})]);if(!index.assets.has(a.guid)&&!(preservation.parentFolder.created&&a.guid===preservation.parentFolder.guid&&a.path===PARENT_FOLDER_PATH&&a.asset===null))blocked([issue('preservation_new_guid',`New asset GUID is prohibited: ${a.guid}.`,{guid:a.guid,path:a.path})]);}
}
/** Validate all copied documents/meta, with precise source/field edge details, before generic package validation. */
export function preservationReferenceIssues(assets,index=null){
 const nodes=new Set(),serialized=new Set(),byGuid=new Map(assets.map(a=>[a.guid,a])),issues=[];
 for(const a of assets){if(a.asset===null)continue;let text;try{text=dec.decode(a.asset);}catch{continue;}if(!/^(?:\uFEFF)?%YAML|^--- !u!/m.test(text))continue;serialized.add(a.guid);for(const d of splitUnityDocuments(text).documents)nodes.add(`${a.guid}:${d.fileId}`);}
 for(const a of assets){const texts=[];if(a.asset!==null){let text;try{text=dec.decode(a.asset);}catch{}if(text&&/^(?:\uFEFF)?%YAML|^--- !u!/m.test(text))for(const d of splitUnityDocuments(text).documents)texts.push({text:d.text,id:`${a.guid}:${d.fileId}`});}texts.push({text:a.meta.replace(/^guid:[^\r\n]*$/m,''),id:`${a.guid}:meta`});
  for(const item of texts)for(const r of extractReferences(item.text)){
   if(r.fileId==='0')continue;const guid=(r.guid??a.guid).toLowerCase(),id=`${guid}:${r.fileId}`,prefix=item.text.slice(0,r.start),field=/([A-Za-z_][A-Za-z_0-9]*):\s*$/.exec(prefix)?.[1]??'object_reference';
   if(nodes.has(id)||r.guid&&field==='m_Script'||/^0{16}[ef]0{15}$/.test(guid))continue;
   const target=byGuid.get(guid);if(target?.asset!==null&&target&&!serialized.has(guid))continue;
   issues.push(issue('preservation_reference_missing',`Unresolved original edge ${item.id} ${field} -> ${id}.`,{sourceId:item.id,sourcePath:index?.assets.get(a.guid)?.path??a.path,outputPath:a.path,field,targetId:id,reference:r.text}));
  }
 }
 return issues;
}

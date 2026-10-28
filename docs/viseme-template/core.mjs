import {writeUnityPackage} from '../shared/ft/unity-package.mjs';
import {splitUnityDocuments,extractReferences} from '../shared/ft/unity-text.mjs';

export const BUILD_ID='viseme-template-1.0.0';
export const SOURCE_SHA256='c0d6510bf1fcd0cb806924a556c91c042aa6da0858785b6015b9b0dedfe20f77';
export const MAX_MESH_BYTES=1024;
const encoder=new TextEncoder();
const key=(guid,id)=>`${guid}:${id}`;
const assert=(condition,message)=>{if(!condition)throw Error(message);};

export function validateMeshName(name){
  if(typeof name!=='string'||!name.trim())throw TypeError('Mesh名称を入力してください。');
  if(/[\x00-\x1f\x7f-\x9f\u2028\u2029\\]/u.test(name)||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(name))throw TypeError('Mesh名称に制御文字や不正な文字は使用できません。');
  if(encoder.encode(name).length>MAX_MESH_BYTES)throw RangeError('Mesh名称はUTF-8で1024バイト以内にしてください。');
  if(name.split('/').some(part=>!part||part==='.'||part==='..'))throw TypeError('Mesh名称はAnimatorからの相対パスで指定してください。');
  return name;
}

function remapReferences(text,sourceGuid,targetGuid,mapping){
  for(const ref of [...extractReferences(text)].reverse()){
    if(ref.fileId==='0')continue;
    const to=mapping.get(key(ref.guid??sourceGuid,ref.fileId));
    assert(to,`参照先を確認できません: ${ref.guid??sourceGuid}:${ref.fileId}`);
    const value=to.guid===targetGuid?`{fileID: ${to.fileId}}`:`{fileID: ${to.fileId}, guid: ${to.guid}, type: ${ref.type??'2'}}`;
    // Preserve unchanged Controller/local references byte-for-byte.
    if(ref.guid===null&&to.guid===targetGuid&&to.fileId===ref.fileId)continue;
    text=text.slice(0,ref.start)+value+text.slice(ref.end);
  }
  return text;
}

function meshClip(document,meshName,pathHash){
  let curves=0,bindings=0;
  // Only the provided Template's SkinnedMeshRenderer BlendShape bindings.
  // Keep all keyframes, values, attributes, flags and unrelated fields intact.
  let text=document.replace(/(^    attribute: blendShape\.[^\n]+\n    path: )Body(\n    classID: 137\n)/gm,(_,prefix,suffix)=>{
    curves++;return prefix+(meshName==='Body'?'Body':JSON.stringify(meshName))+suffix;
  });
  assert(curves===30,'Templateの実行用・Editor用BlendShape Curveが一致しません。');
  const section=/^  m_ClipBindingConstant:\n[\s\S]*?(?=^  [A-Za-z_])/m;
  assert(section.test(text),'TemplateのClip Bindingがありません。');
  text=text.replace(section,part=>part.replace(/(^      path: )2073732236(\n      attribute: \d+\n      script: \{fileID: 0\}\n      typeID: 137\n      customType: 20\n)/gm,(_,prefix,suffix)=>{
    bindings++;return prefix+pathHash+suffix;
  }));
  assert(bindings===15,'TemplateのBlendShape Bindingを一意に確認できません。');
  return text;
}

/** Pure text/packaging host. The provided kernel must be the reviewed Hike ABI. */
export function generatePackage(meshName='Body',{template,kernel}={}){
  validateMeshName(meshName);
  assert(template?.schemaVersion===1&&template.sourceSha256===SOURCE_SHA256&&Array.isArray(template.entries),'Viseme Templateの版が一致しません。');
  assert(typeof kernel?.animatorHash==='function'&&kernel.animatorHash('Body')===2073732236,'HikeのMeshパス計算を確認できません。');
  const pathHash=kernel.animatorHash(meshName);
  assert(Number.isInteger(pathHash)&&pathHash>=0&&pathHash<=0xffffffff,'MeshパスのBinding値が不正です。');
  const entries=template.entries,byGuid=new Map(),documents=new Map(),sourceIds=new Set();
  for(const entry of entries){
    assert(entry&&/^[a-f0-9]{32}$/.test(entry.guid)&&!byGuid.has(entry.guid)&&typeof entry.meta==='string','TemplateのGUIDが不正です。');
    byGuid.set(entry.guid,entry);sourceIds.add(entry.guid);
    if(entry.text!==null)documents.set(entry.guid,splitUnityDocuments(entry.text));
  }
  const controllers=entries.filter(e=>e.path.endsWith('.controller'));
  const trees=entries.filter(e=>e.path.startsWith('Assets/Viseme/BlendTree/')&&e.path.endsWith('.asset')).sort((a,b)=>a.path<b.path?-1:1);
  const clips=entries.filter(e=>e.path.startsWith('Assets/Viseme/Animation/')&&e.path.endsWith('.anim'));
  assert(entries.length===35&&controllers.length===1&&trees.length===15&&clips.length===16,'Templateのアセット構成が一致しません。');
  const clipGuids=new Set(clips.map(c=>c.guid)),owners=new Map(clips.map(c=>[c.guid,new Set()]));
  for(const tree of trees){
    const docs=documents.get(tree.guid).documents;
    assert(docs.length===1&&docs[0].classId==='206'&&docs[0].fileId==='20600000','TemplateのBlendTree構成が一致しません。');
    for(const ref of extractReferences(tree.text)){
      if(ref.fileId==='0')continue;
      assert(clipGuids.has(ref.guid)&&ref.fileId==='7400000','TemplateのTree Motion参照が一致しません。');
      owners.get(ref.guid).add(tree.guid);
    }
  }
  for(const clip of clips){
    const docs=documents.get(clip.guid).documents;
    assert(docs.length===1&&docs[0].classId==='74'&&docs[0].fileId==='7400000'&&owners.get(clip.guid).size>0,'TemplateのClip構成が一致しません。');
  }
  const used=new Set(sourceIds);
  function newGuid(){
    assert(typeof crypto?.getRandomValues==='function','新規GUIDを生成できません。');
    for(let i=0;i<16;i++){
      const guid=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
      if(!/^0+$/.test(guid)&&!used.has(guid)){used.add(guid);return guid;}
    }
    throw Error('新規GUIDが重複しました。');
  }
  const shared=clips.filter(c=>owners.get(c.guid).size>1);
  const outputSources=entries.filter(e=>!e.path.startsWith('Assets/Viseme/Animation'));
  for(const clip of shared)outputSources.push({...clip,path:'Assets/Viseme/'+clip.path.split('/').at(-1)});
  const assetMap=new Map(outputSources.map(e=>[e.guid,{sourceGuid:e.guid,guid:newGuid(),path:e.path}]));
  const objectMap=new Map(),clipMappings=[],removed=[];
  for(const source of outputSources){
    const to=assetMap.get(source.guid);
    for(const doc of documents.get(source.guid)?.documents??[]){
      if(doc.classId==='319'){removed.push({sourceGuid:source.guid,fileId:doc.fileId,classId:doc.classId});continue;}
      objectMap.set(key(source.guid,doc.fileId),{guid:to.guid,fileId:doc.fileId});
    }
  }
  // One copy of each unshared Clip inside its owning Tree. Shared Clips remain
  // ordinary external files directly below Viseme, with their original main ID.
  const embedded=new Map(trees.map(t=>[t.guid,[]]));
  for(const clip of clips){
    const sharedClip=owners.get(clip.guid).size>1;
    const owner=sharedClip?clip.guid:[...owners.get(clip.guid)][0];
    const to=assetMap.get(owner);
    const fileId=sharedClip?'7400000':String(7400001+embedded.get(owner).length);
    objectMap.set(key(clip.guid,'7400000'),{guid:to.guid,fileId});
    if(!sharedClip)embedded.get(owner).push({clip,fileId});
    clipMappings.push({sourceGuid:clip.guid,guid:to.guid,fileId,path:to.path,embedded:!sharedClip});
  }
  const assets=outputSources.map(source=>{
    const to=assetMap.get(source.guid);
    const meta=source.meta.replace(/^guid: [a-f0-9]{32}$/m,'guid: '+to.guid);
    if(source.text===null)return {guid:to.guid,path:to.path,meta,asset:null};
    const parsed=documents.get(source.guid);
    let text=parsed.preamble+parsed.documents.filter(d=>d.classId!=='319').map(d=>d.text).join('');
    if(clipGuids.has(source.guid))text=meshClip(text,meshName,pathHash);
    text=remapReferences(text,source.guid,to.guid,objectMap);
    for(const {clip,fileId} of embedded.get(source.guid)??[]){
      let doc=meshClip(documents.get(clip.guid).documents[0].text,meshName,pathHash);
      doc=doc.replace(/^--- !u!74 &7400000$/m,'--- !u!74 &'+fileId);
      text+=remapReferences(doc,clip.guid,to.guid,objectMap);
    }
    return {guid:to.guid,path:to.path,meta,asset:encoder.encode(text)};
  });
  const decoder=new TextDecoder();
  const actual=new Map(assets.filter(a=>a.asset).map(a=>[a.guid,new Set(splitUnityDocuments(decoder.decode(a.asset)).documents.map(d=>d.fileId))]));
  for(const asset of assets.filter(a=>a.asset))for(const ref of extractReferences(decoder.decode(asset.asset))){
    if(ref.fileId!=='0')assert(actual.get(ref.guid??asset.guid)?.has(ref.fileId),'出力参照が解決できません。');
  }
  const controller=assetMap.get(controllers[0].guid),root=outputSources.find(e=>e.path==='Assets/Viseme');
  return {bytes:writeUnityPackage(assets),fileName:'Viseme.unitypackage',meshName,buildId:BUILD_ID,sourceSha256:SOURCE_SHA256,
    treeCount:trees.length,clipCount:clips.length,embeddedClipCount:clips.length-shared.length,externalClipCount:shared.length,
    controller:{...controller,fileId:'9100000'},rootFolder:assetMap.get(root.guid),
    mapping:{assets:[...assetMap.values()],clips:clipMappings,removed}};
}

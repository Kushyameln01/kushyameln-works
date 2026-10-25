import {writeUnityPackage} from '../shared/ft/unity-package.mjs';
import {splitUnityDocuments,extractReferences} from '../shared/ft/unity-text.mjs';

export const BUILD_ID='parameter-template-1.3.0';
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
const rootNames=new Set(['Binary_Root','Smooth_Root']);
// Inspect every Motion field. A reference outside the supported source format
// must be rejected, never copied through merely because it misses a narrow regex.
const motion=/^([ \t]+(?:-[ \t]+)?)(m_Motion|"m_Motion"|'m_Motion')([ \t]*:[ \t]*)([^\r\n]*)$/gm;
const guidPattern=/^[0-9a-f]{32}$/;

function sourceMotion(value){
  const match=/^\{[ \t]*fileID:[ \t]*(-?\d+)[ \t]*(?:,[ \t]*guid:[ \t]*([0-9a-fA-F]{32})[ \t]*,[ \t]*type:[ \t]*(\d+)[ \t]*)?\}([ \t]*(?:#[^\r\n]*)?)$/.exec(value);
  if(!match)throw new Error('TemplateのMotion参照形式に対応していません。');
  const id=BigInt(match[1]);
  if(id<-(1n<<63n)||id>=(1n<<63n))throw new Error('TemplateのMotion fileIDが範囲外です。');
  const guid=match[2]?.toLowerCase();
  if(id===0n){
    if(guid&&!/^0+$/.test(guid))throw new Error('Templateの空Motion参照が不正です。');
    return {fileId:'0',suffix:match[4]};
  }
  if(!guid||match[3]!=='2')throw new Error('TemplateのMotionには解決可能な外部参照が必要です。');
  return {fileId:String(id),guid,suffix:match[4]};
}

export function validateTarget(target){
  if(typeof target!=='string'||!/^v2\/[\p{L}\p{N}_-]{1,120}$/u.test(target)){
    throw new Error('v2/ に続けて、文字・数字・_・- の名前を入力してください（120文字まで）。');
  }
  const name=target.slice(3);
  if(name==='Parameter')throw new Error('Parameterを、生成するパラメータ名へ変更してください。');
  if(/^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i.test(name))throw new Error('この名前は出力フォルダに使用できません。');
  return name;
}

function crc32(value){
  let crc=0xffffffff;
  for(const byte of encoder.encode(value)){
    crc^=byte;
    for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}

function named(text,leaf){
  const old=/^  m_Name: (.+)$/m.exec(text)?.[1];
  if(!old||/[<>:"/\\|?*\x00-\x1f]/.test(old))throw new Error('Templateの表示名を確認できません。');
  const name=old.includes('Parameter')?old.replaceAll('Parameter',leaf):leaf+'_'+old;
  if(encoder.encode(name+'.asset').length>255)throw new Error('出力ファイル名が長すぎます。パラメータ名を短くしてください。');
  return {name,text:text.replace(/^  m_Name: .+$/m,'  m_Name: '+name)};
}

function replaceParameters(text,leaf){
  // Replace scalar values, never Unity's field names. Display names are
  // handled separately so a target containing "Parameter" is applied once.
  return text.replace(/^(\s+([A-Za-z_][A-Za-z0-9_]*): )([^\r\n]*)$/gm,(line,prefix,key,value)=>{
    return key==='m_Name'?line:prefix+value.replaceAll('Parameter',leaf);
  });
}

function clipDocument(clip,id,leaf){
  let text=clip.text;
  // Only the source template's Animator AAP attributes are renamed. Numeric
  // bindings are updated in their own section, never by global string replace.
  const oldNames=[...text.matchAll(/^    attribute: (.*Parameter.*)$/gm)].map(m=>m[1]);
  const hashes=new Map();
  for(const old of oldNames)hashes.set(String(crc32(old)),String(crc32(old.replaceAll('Parameter',leaf))));
  text=replaceParameters(text,leaf);
  const section=/^  m_ClipBindingConstant:\n[\s\S]*?(?=^  [A-Za-z_])/m;
  if(!section.test(text))throw new Error('TemplateのClip bindingを確認できません。');
  text=text.replace(section,part=>part.replace(/^(      attribute: )(\d+)$/gm,(line,prefix,hash)=>hashes.has(hash)?prefix+hashes.get(hash):line));
  text=named(text,leaf).text;
  return text.replace(/^%YAML 1\.1\n%TAG !u! tag:unity3d.com,2011:\n/,'').replace(/^--- !u!74 &7400000$/m,'--- !u!74 &'+id);
}

function templateIndex(template){
  if(template?.schemaVersion!==1||template.templateRevision!==2||!Array.isArray(template.trees)||!Array.isArray(template.clips))throw new Error('Templateの版または構成が一致しません。');
  const index=new Map();
  for(const [kind,items] of [['206',template.trees],['74',template.clips]]){
    for(const item of items){
      if(!item||!guidPattern.test(item.guid)||index.has(item.guid)||typeof item.text!=='string'||
        [...item.text.matchAll(/^--- !u!/gm)].length!==1||!item.text.includes(`--- !u!${kind} &${kind==='206'?'20600000':'7400000'}\n`)){
        throw new Error('Templateのアセット構造が一致しません。');
      }
      index.set(item.guid,{...item,kind});
    }
  }
  return index;
}

export function generatePackage(target,{template}={}){
  const leaf=validateTarget(target),index=templateIndex(template),used=new Set(index.keys());
  function newGuid(){
    if(typeof globalThis.crypto?.getRandomValues!=='function')throw new Error('この環境では新規GUIDを生成できません。');
    for(let attempt=0;attempt<16;attempt++){
      const guid=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
      if(!/^0+$/.test(guid)&&!used.has(guid)){used.add(guid);return guid;}
    }
    throw new Error('新規GUIDが重複しました。もう一度生成してください。');
  }
  const treeGuids=new Map(template.trees.map(t=>[t.guid,newGuid()]));
  const folderPath='Assets/'+leaf,childPath=folderPath+'/'+leaf+'_Child';
  const assets=[folderPath,childPath].map(path=>{
    const guid=newGuid();
    return {guid,path,asset:null,meta:`fileFormatVersion: 2\nguid: ${guid}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`};
  });
  let clipCount=0;
  const roots={};
  const paths=new Set(),foundRoots=new Set();
  for(const tree of template.trees){
    const localClips=new Map();
    const sourceName=/^  m_Name: (.+)$/m.exec(tree.text)?.[1];
    const isRoot=rootNames.has(sourceName);
    if(isRoot)foundRoots.add(sourceName);
    let text=replaceParameters(tree.text,leaf);
    text=text.replace(motion,(_line,indent,key,_separator,value)=>{
      if(key!=='m_Motion')throw new Error('TemplateのMotionフィールド形式に対応していません。');
      const prefix=indent+key+': ';
      const {fileId,guid,suffix}=sourceMotion(value);
      if(fileId==='0')return prefix+'{fileID: 0}'+suffix;
      const ref=index.get(guid);
      if(!ref||fileId!==(ref.kind==='74'?'7400000':'20600000'))throw new Error('TemplateのMotion参照が解決できません。');
      if(ref.kind==='206'){
        return prefix+`{fileID: 20600000, guid: ${treeGuids.get(guid)}, type: 2}`+suffix;
      }
      if(!localClips.has(guid))localClips.set(guid,String(7400001+localClips.size));
      return prefix+`{fileID: ${localClips.get(guid)}}`+suffix;
    });
    const renamed=named(text,leaf);text=renamed.text;
    const path=(isRoot?folderPath:childPath)+'/'+renamed.name+'.asset';
    if(paths.has(path.toLowerCase()))throw new Error('出力するBlendTree名が重複しています。');paths.add(path.toLowerCase());
    for(const [guid,id] of localClips){
      text=text.trimEnd()+'\n'+clipDocument(index.get(guid),id,leaf);
      clipCount++;
    }
    const guid=treeGuids.get(tree.guid);
    if(isRoot)roots[sourceName==='Binary_Root'?'binary':'smooth']={guid,fileId:'20600000'};
    assets.push({guid,path,asset:encoder.encode(text),meta:`fileFormatVersion: 2\nguid: ${guid}\nNativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: 20600000\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`});
  }
  if(foundRoots.size!==2)throw new Error('TemplateのBinary・Smooth Rootが揃っていません。');
  // Reject any surviving source GUID, missing local Clip, or unsupported
  // external dependency independently of the number of matched Motion fields.
  const output=new Map(assets.filter(asset=>asset.asset!==null).map(asset=>{
    const text=decoder.decode(asset.asset),ids=new Set(splitUnityDocuments(text).documents.map(doc=>doc.fileId));
    return [asset.guid,{text,ids}];
  }));
  for(const [guid,asset]of output)for(const reference of extractReferences(asset.text)){
    if(reference.fileId==='0')continue;
    if(!output.get(reference.guid??guid)?.ids.has(reference.fileId))throw new Error('Templateの出力Motion・Clip参照が解決できません。');
  }
  return {bytes:writeUnityPackage(assets),fileName:leaf+'.unitypackage',folderName:leaf,treeCount:template.trees.length,clipCount,buildId:BUILD_ID,
    roots,rootFolder:{guid:assets[0].guid,path:folderPath}};
}

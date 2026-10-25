import {writeUnityPackage} from '../shared/ft/unity-package.mjs';

export const BUILD_ID='parameter-template-1.0.0';
const encoder=new TextEncoder();
const sourceParameter=/^v2\/Parameter(0|1|2|4|8|Negative)?$/;
const motion=/^(    m_Motion: )\{fileID: (-?\d+), guid: ([0-9a-f]{32}), type: 2\}$/gm;
const guidPattern=/^[0-9a-f]{32}$/;

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

function replaceParameters(text,target){
  return text.replace(/^(\s+(?:m_BlendParameterY?|m_DirectBlendParameter|attribute): )([^\r\n]*)$/gm,(line,prefix,value)=>{
    const match=sourceParameter.exec(value);
    return match?prefix+target+(match[1]??''):line;
  });
}

function clipDocument(clip,id,target,leaf){
  let text=clip.text;
  // Only the fixed template's Animator AAP attributes are renamed. Numeric
  // bindings are updated in their own section, never by global string replace.
  const oldNames=[...text.matchAll(/^    attribute: (v2\/Parameter(?:0|1|2|4|8|Negative)?)$/gm)].map(m=>m[1]);
  const hashes=new Map();
  for(const old of oldNames)hashes.set(String(crc32(old)),String(crc32(target+(sourceParameter.exec(old)[1]??''))));
  text=replaceParameters(text,target);
  const section=/^  m_ClipBindingConstant:\n[\s\S]*?(?=^  [A-Za-z_])/m;
  if(!section.test(text))throw new Error('TemplateのClip bindingを確認できません。');
  text=text.replace(section,part=>part.replace(/^(      attribute: )(\d+)$/gm,(line,prefix,hash)=>hashes.has(hash)?prefix+hashes.get(hash):line));
  text=named(text,leaf).text;
  return text.replace(/^%YAML 1\.1\n%TAG !u! tag:unity3d.com,2011:\n/,'').replace(/^--- !u!74 &7400000$/m,'--- !u!74 &'+id);
}

function templateIndex(template){
  if(template?.schemaVersion!==1||template.trees?.length!==16||template.clips?.length!==20)throw new Error('Templateの版または構成が一致しません。');
  const index=new Map();
  for(const [kind,items] of [['206',template.trees],['74',template.clips]]){
    for(const item of items){
      if(!guidPattern.test(item.guid)||index.has(item.guid)||typeof item.text!=='string'||
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
  const folderGuid=newGuid();
  const assets=[{guid:folderGuid,path:'Assets/'+leaf,asset:null,meta:`fileFormatVersion: 2\nguid: ${folderGuid}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`}];
  let clipCount=0,clipReferences=0,treeReferences=0;
  const paths=new Set();
  for(const tree of template.trees){
    const localClips=new Map();
    let text=replaceParameters(tree.text,target);
    text=text.replace(motion,(_line,prefix,id,guid)=>{
      const ref=index.get(guid);
      if(!ref||id!==(ref.kind==='74'?'7400000':'20600000'))throw new Error('TemplateのMotion参照が解決できません。');
      if(ref.kind==='206'){
        treeReferences++;
        return prefix+`{fileID: 20600000, guid: ${treeGuids.get(guid)}, type: 2}`;
      }
      if(!localClips.has(guid))localClips.set(guid,String(7400001+localClips.size));
      clipReferences++;
      return prefix+`{fileID: ${localClips.get(guid)}}`;
    });
    const renamed=named(text,leaf);text=renamed.text;
    const path='Assets/'+leaf+'/'+renamed.name+'.asset';
    if(paths.has(path.toLowerCase()))throw new Error('出力するBlendTree名が重複しています。');paths.add(path.toLowerCase());
    for(const [guid,id] of localClips){
      text=text.trimEnd()+'\n'+clipDocument(index.get(guid),id,target,leaf);
      clipCount++;
    }
    const guid=treeGuids.get(tree.guid);
    assets.push({guid,path,asset:encoder.encode(text),meta:`fileFormatVersion: 2\nguid: ${guid}\nNativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: 20600000\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`});
  }
  if(clipCount!==30||clipReferences!==34||treeReferences!==13)throw new Error('Templateの参照件数が一致しません。');
  return {bytes:writeUnityPackage(assets),fileName:leaf+'.unitypackage',folderName:leaf,treeCount:16,clipCount,buildId:BUILD_ID};
}

// Motion-only registration. Source Controller/Expression declarations are never read.
import {scanUnityPackage,selectUnityPackage,PACKAGE_LIMITS} from '../../animator-composer/lib/package-selection.mjs';
import {writeUnityPackage} from '../ft/unity-package.mjs';
import {splitUnityDocuments,parseUnityScalar} from '../ft/unity-text.mjs';
import {serializeExpression} from '../../animator-composer/lib/registration.mjs';

const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const PREAMBLE='%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n';
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const order=(a,b)=>a.name<b.name?-1:a.name>b.name?1:0;
function field(text,name,indent=2,required=true,container=false){
 const matches=[...text.matchAll(new RegExp(`^${' '.repeat(indent)}${name}:([^\\r\\n]*)`,'gm'))];
 assert(matches.length<=1&&(!required||matches.length===1),`Missing or ambiguous ${name}`);
 if(!matches.length)return null;
 const match=matches[0],raw=match[1].trim(),quoted=raw.startsWith('"')||raw.startsWith("'"),value=raw.startsWith('#')?'':parseUnityScalar(match[1]);
 if(!container){
  const following=text.slice(match.index+match[0].length).split(/\r?\n/).find(line=>line.trim()&&!line.trimStart().startsWith('#'));
  assert(!following||(/^ */.exec(following)[0].length<=indent&&/^ *(?:- )?[A-Za-z_][A-Za-z_0-9]*:/.test(following)),`Unsupported multiline scalar continuation in ${name}`);
  // Unity names may contain YAML indicators when explicitly quoted. Plain
  // aliases, tags, block scalars and flow collections are not string names.
  if(!quoted&&name!=='script')assert(!/^(?:[\[\]{}&*!|>%@`]|[-?:](?:\s|$))/.test(value)&&!/:\s|:$/.test(value),`Unsupported plain scalar syntax in ${name}`);
 }
 return value;
}
function section(text,name,indent=2){
 const fields=[...text.matchAll(new RegExp(`^${' '.repeat(indent)}([A-Za-z_][A-Za-z_0-9]*):[^\\r\\n]*(?:\\r?\\n|$)`,'gm'))];
 const indexes=fields.flatMap((m,i)=>m[1]===name?[i]:[]);
 assert(indexes.length===1,`Missing or ambiguous ${name}`);const i=indexes[0];
 return text.slice(fields[i].index,fields[i+1]?.index??text.length);
}
function items(text,name,indent=2){
 const part=section(text,name,indent),value=field(part,name,indent,true,true);
 assert(value===''||value==='[]',`Unsupported ${name} sequence`);
 const lines=part.split(/\r?\n/),starts=[];
 for(let i=1;i<lines.length;i++){
  const line=lines[i];if(!line.trim()||line.trimStart().startsWith('#'))continue;
  assert(value!=='[]',`Invalid empty ${name} sequence body`);
  const spaces=/^ */.exec(line)[0].length,content=line.slice(spaces);
  assert(!line.includes('\t')&&spaces>=indent&&spaces%2===0,`Malformed ${name} sequence indentation`);
  if(spaces===indent){
   assert(/^- [A-Za-z_][A-Za-z_0-9]*:/.test(content),`Malformed ${name} sequence item`);starts.push(i);
  }else{
   assert(starts.length>0&&spaces>=indent+2&&/^(?:- )?[A-Za-z_][A-Za-z_0-9]*:/.test(content),`Malformed ${name} sequence body or indentation`);
  }
 }
 assert(value==='[]'||starts.length>0,`Incomplete ${name} sequence`);
 return starts.map((start,i)=>lines.slice(start,starts[i+1]??lines.length).join('\n').replace(new RegExp(`^${' '.repeat(indent)}- `),' '.repeat(indent+2)));
}
function validName(name){
 assert(typeof name==='string'&&name.trim()&&!/[\u0000-\u001f\u007f\u0085\u2028\u2029]/u.test(name)
  &&!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(name),'Invalid Parameter name');
 return name;
}
function uint(value,label){assert(typeof value==='string'&&/^(?:0|[1-9][0-9]*)$/.test(value)&&Number(value)<=0xffffffff,`Unsupported binding ${label}`);return Number(value);}

/** Validate the whole package, inspect every asset independent of its extension,
 * and retain only class74/206 documents. Selection is bounded per batch. */
export function readMotionDocuments(bytes){
 const scan=scanUnityPackage(bytes),documents=[];let clipCount=0,blendTreeCount=0,retained=0;
 const assets=scan.assets.filter(a=>!a.folder);let batch=[],cost=0;
 function consume(){
  if(!batch.length)return;
  const selected=selectUnityPackage(bytes,batch,{allowAnyAsset:true});
  for(const a of selected.assets){
   let text;
   try{text=dec.decode(a.asset);}catch{
    assert(!/^NativeFormatImporter:/m.test(a.meta)&&!/\.(?:anim|controller|asset)$/i.test(a.path),`${a.path}: binary serialized asset cannot be read; export Force Text`);
    continue;
   }
   // Raw imported resources have no serialized objects. Do not claim their imported animations as Clips.
   const unityText=/^--- !u!/m.test(text)||/^%TAG !u! tag:unity3d\.com,2011:/m.test(text);
   const headers=unityText?[...text.matchAll(/^---[^\r\n]*(?:\r?\n|$)/gm)]:[];
   if(!headers.length){
    assert(!/^NativeFormatImporter:/m.test(a.meta)&&!/\.(?:anim|controller|asset)$/i.test(a.path),`${a.path}: serialized document headers are missing; export Force Text`);
    continue;
   }
   const seen=new Set();
   for(let i=0;i<headers.length;i++){
    const h=headers[i],m=/^--- !u!(\d+) &(-?\d+)(?: stripped)?\r?\n$/.exec(h[0]);
    assert(m,`${a.path}: malformed Unity document header`);
    assert(!seen.has(m[2]),`${a.path}: duplicate document fileID ${m[2]}`);seen.add(m[2]);
    if(m[1]!=='74'&&m[1]!=='206')continue;
    assert(!h[0].includes(' stripped'),`${a.path} (${m[2]}): stripped Motion cannot be read completely`);
    const target=text.slice(h.index,headers[i+1]?.index??text.length);
    // Only target bodies are parsed; adjacent Controller/Expression bodies are not inputs.
    let parsed;try{parsed=splitUnityDocuments(text.slice(0,headers[0].index)+target).documents[0];}catch(error){throw new Error(`${a.path} (${m[2]}): ${error.message}`);}
    retained+=enc.encode(target).length;assert(retained<=PACKAGE_LIMITS.selected,'Motion documents exceed 256 MiB budget');
    documents.push({classId:parsed.classId,fileId:parsed.fileId,guid:a.guid,path:a.path,text:target});
    if(parsed.classId==='74')clipCount++;else blendTreeCount++;
   }
  }
  batch=[];cost=0;
 }
 for(const a of assets){
  assert(a.size<=PACKAGE_LIMITS.asset,`${a.path}: asset exceeds 128 MiB inspection limit`);
  const next=a.size+enc.encode(a.meta).length;
  if(cost+next>PACKAGE_LIMITS.selected)consume();batch.push(a.guid);cost+=next;
 }
 consume();return {documents,clipCount,blendTreeCount};
}

function clipParameters(text,kernel,add){
 assert(field(text,'m_Compressed')==='0','Compressed AnimationClip is unsupported');
 const floats=items(text,'m_FloatCurves'),pointers=items(text,'m_PPtrCurves');
 const bindings=items(section(text,'m_ClipBindingConstant'),'genericBindings',4);
 const animatorBindings=bindings.filter(b=>field(b,'typeID',6)==='95'&&field(b,'path',6)==='0');
 const candidates=floats.filter(c=>field(c,'classID',4)==='95'&&field(c,'path',4)==='');
 assert(!pointers.some(c=>field(c,'classID',4)==='95'&&field(c,'path',4)===''),'Animator reference curve is unsupported');
 const validated=animatorBindings.map(b=>{
  const attr=uint(field(b,'attribute',6),'attribute'),custom=uint(field(b,'customType',6),'customType');
  for(const f of ['isPPtrCurve','isIntCurve','isSerializeReferenceCurve']){
   const flag=field(b,f,6,false);assert(flag==='0'||(f==='isSerializeReferenceCurve'&&flag===null),`Unsupported Animator binding ${f}`);
  }
  assert(field(b,'script',6)==='{fileID: 0}','Unsupported Animator binding script');
  return {attr,custom};
 });
 assert(typeof kernel?.animatorHash==='function'||(!validated.length&&!candidates.length),'kernel.animatorHash is required for Clip bindings');
 const curves=candidates.map(c=>({name:validName(field(c,'attribute',4)),hash:kernel.animatorHash(field(c,'attribute',4))>>>0}));
 const byHash=new Map();for(const c of curves){assert(!byHash.has(c.hash),`Animator binding hash collision or duplicate: ${c.name}`);byHash.set(c.hash,c);}
 const matched=new Set();
 for(const {attr,custom}of validated){
  const match=byHash.get(attr);
  assert(match&&!matched.has(attr),'Animator binding cannot be matched one-to-one (unsupported special layout or missing curve)');
  matched.add(attr);if(custom===0)add(match.name);
 }
 assert(matched.size===curves.length,'Animator binding missing for runtime curve');
}
export function collectMotionParameters(documents,kernel){
 assert(Array.isArray(documents),'Motion documents must be an array');const names=new Set();const add=name=>names.add(validName(name));
 for(const d of documents){
  assert(d&&['74','206'].includes(String(d.classId))&&typeof d.text==='string','Expected class74/206 document');
  try{
   const parsed=splitUnityDocuments(d.text).documents;assert(parsed.length===1&&parsed[0].classId===String(d.classId),'Motion document identity mismatch');
   if(String(d.classId)==='206'){
    const type=field(d.text,'m_BlendType');assert(['0','1','2','3','4'].includes(type),'Unsupported BlendTree type');
    const children=items(d.text,'m_Childs');
    if(type==='4')for(const c of children)add(field(c,'m_DirectBlendParameter',4));
    else{add(field(d.text,'m_BlendParameter'));if(type!=='0')add(field(d.text,'m_BlendParameterY'));}
   }else clipParameters(d.text,kernel,add);
  }catch(error){throw new Error(`${d.path??'Motion'} (${d.fileId??'?'}): ${error.message}`);}
 }
 return [...names].map(name=>({name,type:'Float'})).sort(order);
}
export function collectParameters(bytes,{kernel}={}){
 const {documents,clipCount,blendTreeCount}=readMotionDocuments(bytes);
 return {version:1,parameters:collectMotionParameters(documents,kernel),clipCount,blendTreeCount};
}

const objectFields='  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n';
function controllerText(rows,name){
 return PREAMBLE+`--- !u!91 &9100000\nAnimatorController:\n${objectFields}  m_Name: ${JSON.stringify(name)}\n  serializedVersion: 5\n  m_AnimatorParameters:${rows.length?'':' []'}\n`
 +rows.map(r=>`  - m_Name: ${JSON.stringify(r.name)}\n    m_Type: 1\n    m_DefaultFloat: ${r.defaultValue}\n    m_DefaultInt: 0\n    m_DefaultBool: 0\n    m_Controller: {fileID: 9100000}\n`).join('')
 +'  m_AnimatorLayers:\n  - serializedVersion: 5\n    m_Name: Base Layer\n    m_StateMachine: {fileID: 11070000}\n    m_Mask: {fileID: 0}\n    m_Motions: []\n    m_Behaviours: []\n    m_BlendingMode: 0\n    m_SyncedLayerIndex: -1\n    m_DefaultWeight: 1\n    m_IKPass: 0\n    m_SyncedLayerAffectsTiming: 0\n    m_Controller: {fileID: 9100000}\n'
 +`--- !u!1107 &11070000\nAnimatorStateMachine:\n${objectFields}  serializedVersion: 6\n  m_Name: Base Layer\n  m_ChildStates: []\n  m_ChildStateMachines: []\n  m_AnyStateTransitions: []\n  m_EntryTransitions: []\n  m_StateMachineTransitions: {}\n  m_StateMachineBehaviours: []\n  m_AnyStatePosition: {x: 50, y: 20, z: 0}\n  m_EntryPosition: {x: 50, y: 120, z: 0}\n  m_ExitPosition: {x: 800, y: 120, z: 0}\n  m_ParentStateMachinePosition: {x: 800, y: 20, z: 0}\n  m_DefaultState: {fileID: 0}\n`;
}
export async function generateParameterAssets(parameters,settings={}){
 assert(Array.isArray(parameters),'Parameter array is required');
 assert(settings&&typeof settings==='object'&&!Array.isArray(settings),'Generation settings must be an object');
 const config={name:'Parameters',defaultValue:0,saved:false,networkSynced:false,...settings};
 assert(typeof config.name==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(config.name)&&!/^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i.test(config.name),'Invalid output name');
 assert(typeof config.defaultValue==='number'&&Number.isFinite(config.defaultValue)&&config.defaultValue>=-1&&config.defaultValue<=1,'Floatの初期値が-1〜1の範囲外です。');
 for(const flag of ['saved','networkSynced'])assert(typeof config[flag]==='boolean',`${flag} must be true/false`);
 const rows=parameters.map(p=>{assert(p&&p.type==='Float',`${p?.name??'Parameter'}: only Float type is supported`);return {name:p.name,type:'Float',defaultValue:config.defaultValue,saved:config.saved,networkSynced:config.networkSynced};}).sort(order);
 const expression=serializeExpression(rows,config.name+'_ExpressionParameters');
 const root='Assets/'+config.name,used=new Set();
 function guid(){
  assert(typeof globalThis.crypto?.getRandomValues==='function','Secure GUID generation is unavailable');
  for(let i=0;i<16;i++){const value=[...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');if(!/^0+$/.test(value)&&!used.has(value)){used.add(value);return value;}}
  throw new Error('New GUID collision');
 }
 const folderGuid=guid(),assets=[{guid:folderGuid,path:root,asset:null,meta:`fileFormatVersion: 2\nguid: ${folderGuid}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`}];
 for(const [path,text,id]of [[config.name+'.controller',controllerText(rows,config.name),'9100000'],[config.name+'_ExpressionParameters.asset',expression,'11400000']]){
  const value=guid();splitUnityDocuments(text);
  assets.push({guid:value,path:root+'/'+path,asset:enc.encode(text),meta:`fileFormatVersion: 2\nguid: ${value}\nNativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: ${id}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`});
 }
 return {archive:writeUnityPackage(assets),fileName:config.name+'.unitypackage',parameterCount:rows.length,bitCost:rows.filter(r=>r.networkSynced).length*8};
}

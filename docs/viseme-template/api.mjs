// Producer-owned data and versioning. Consumers pass a mesh name, never template URLs.
import {generatePackage,validateMeshName,SOURCE_SHA256} from './core.mjs';
import {prepareKernelModule,instantiateKernel} from '../shared/compute/kernel.mjs';
export {validateMeshName};
export const API_VERSION=1;
export const MAX_PACKAGE_BYTES=4*1024*1024;
const TEMPLATE_SHA256='949c0aabbb2d99dbf42b59811830a57cbeb186577c994fb5caf1927d27816774';
const guid=v=>typeof v==='string'&&/^[0-9a-f]{32}$/.test(v)&&!/^0+$/.test(v);
const ref=v=>guid(v?.guid)&&typeof v.fileId==='string'&&/^-?[1-9]\d*$/.test(v.fileId)&&BigInt(v.fileId)>=-(1n<<63n)&&BigInt(v.fileId)<(1n<<63n);

export function isVisemeResult(value,{meshName=value?.meshName}={}){
  try{
    validateMeshName(meshName);
    return value?.apiVersion===API_VERSION&&value.meshName===meshName&&value.bytes instanceof Uint8Array&&value.bytes.length>0&&value.bytes.length<=MAX_PACKAGE_BYTES&&
      typeof value.fileName==='string'&&/^[^/\\\x00-\x1f]+\.unitypackage$/.test(value.fileName)&&
      typeof value.buildId==='string'&&value.buildId.length>0&&/^[a-f0-9]{64}$/.test(value.sourceSha256)&&
      ref(value.controller)&&guid(value.rootFolder?.guid)&&
      [value.treeCount,value.clipCount,value.embeddedClipCount,value.externalClipCount].every(n=>Number.isSafeInteger(n)&&n>=0)&&
      value.treeCount>0&&value.clipCount===value.embeddedClipCount+value.externalClipCount&&
      Array.isArray(value.mapping?.clips)&&value.mapping.clips.length===value.clipCount&&value.mapping.clips.every(ref)&&
      Array.isArray(value.mapping?.assets)&&value.mapping.assets.length>0&&value.mapping.assets.every(a=>guid(a.sourceGuid)&&guid(a.guid)&&typeof a.path==='string')&&Array.isArray(value.mapping.removed);
  }catch{return false;}
}

export async function generateVisemeTemplate(meshName='Body',{kernel,signal}={}){
  validateMeshName(meshName);
  const response=await fetch(new URL('./template.json',import.meta.url),{credentials:'omit',signal});
  if(!response.ok)throw Error(`Viseme Templateを取得できませんでした（HTTP ${response.status}）。`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>1024*1024)throw Error('Viseme Templateが上限を超えています。');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!==TEMPLATE_SHA256)throw Error('Viseme Templateの内容が確認済みの版と一致しません。');
  const template=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(template.sourceSha256!==SOURCE_SHA256)throw Error('Viseme Templateの元ファイルが一致しません。');
  kernel??=instantiateKernel(await prepareKernelModule({signal}));
  signal?.throwIfAborted();
  const result={apiVersion:API_VERSION,...generatePackage(meshName,{template,kernel})};
  if(!isVisemeResult(result,{meshName}))throw Error('Viseme生成結果の形式が一致しません。');
  return result;
}

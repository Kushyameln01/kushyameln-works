// Public producer-owned API for the Template screen and other browser tools.
// Internal data paths and generator details must stay on this side of the API.
import {generatePackage,validateTarget} from './core.mjs?v=decode-root-1';
export {validateTarget};
export const API_VERSION=1;
export const MAX_TEMPLATE_PACKAGE_BYTES=128*1024*1024;
const validGuid=value=>typeof value==='string'&&/^[0-9a-f]{32}$/.test(value)&&!/^0+$/.test(value);
function validRef(value){
  if(!validGuid(value?.guid)||typeof value.fileId!=='string'||!/^(-?[1-9][0-9]*)$/.test(value.fileId))return false;
  const id=BigInt(value.fileId);return id>=-(1n<<63n)&&id<(1n<<63n);
}
function validPath(value){
  return typeof value==='string'&&value.startsWith('Assets/')&&!/[\\\x00-\x1f]/.test(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');
}
/** API shape validation, independent of an asset digest, build or fixed counts. */
export function isTemplateResult(value,{target=value?.target}={}){
  try{
    validateTarget(target);
    return value?.apiVersion===API_VERSION&&value.target===target
      &&value.bytes instanceof Uint8Array&&value.bytes.byteLength>0&&value.bytes.byteLength<=MAX_TEMPLATE_PACKAGE_BYTES
      &&Number.isSafeInteger(value.treeCount)&&value.treeCount>=2&&Number.isSafeInteger(value.clipCount)&&value.clipCount>=0
      &&typeof value.fileName==='string'&&/^[^\\/\x00-\x1f]+\.unitypackage$/.test(value.fileName)
      &&typeof value.folderName==='string'&&value.folderName.length>0
      &&typeof value.buildId==='string'&&value.buildId.length>0
      &&validRef(value.roots?.binary)&&validRef(value.roots?.smooth)
      &&`${value.roots.binary.guid}:${value.roots.binary.fileId}`!==`${value.roots.smooth.guid}:${value.roots.smooth.fileId}`
      &&validGuid(value.rootFolder?.guid)&&validPath(value.rootFolder.path);
  }catch{return false;}
}
/** Input is a Parameter name; the producer owns current data loading/generation. */
export async function generateTemplate(target){
  validateTarget(target);
  const response=await fetch(new URL('./template.json',import.meta.url),{cache:'no-store'});
  if(!response.ok)throw new Error(`Templateを読み込めませんでした（HTTP ${response.status}）。`);
  const generated=generatePackage(target,{template:await response.json()});
  const result={...generated,apiVersion:API_VERSION,target};
  if(!isTemplateResult(result,{target}))throw new Error('Template APIの出力形式が一致しません。');
  return result;
}

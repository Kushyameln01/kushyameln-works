import {sha256Blob} from '../../vr180/sha256.mjs';
const MAX_READ_BYTES=16*1024*1024;
const KNOWN=Object.freeze({
 'Bernini-R_LightX2V_high_noise.safetensors':['light','high'],
 'Bernini-R_LightX2V_low_noise.safetensors':['light','low'],
 'NSFW-22-H-e8.safetensors':['detail','high'],
 'NSFW-22-L-e8.safetensors':['detail','low']
});
const LABELS=Object.freeze({light:'Light',detail:'Detail',folder:'Folder'});
function validInteger(n){return Number.isSafeInteger(n)&&n>=0;}
function side(label){const lower=label.toLowerCase();return lower==='highnoise'?'high':lower==='lownoise'?'low':null;}
function sourceFor(file){
 return Object.freeze({size:file.size,hash({signal,onProgress}={}){return sha256Blob(file,{signal,onProgress});},async read(offset,length,{signal}={}){
  signal?.throwIfAborted();
  if(!validInteger(offset)||!validInteger(length)||offset>file.size||length>file.size-offset||length>MAX_READ_BYTES)throw new Error('Folder source read range invalid');
  if(length===0)return new Uint8Array();
  const bytes=new Uint8Array(await file.slice(offset,offset+length).arrayBuffer());
  signal?.throwIfAborted();
  if(bytes.length!==length)throw new Error('Truncated folder source read');
  return bytes;
 }});
}
export function openLoraFolder(files){
 if(!files||typeof files[Symbol.iterator]!=='function')throw new Error('Folder files must be iterable');
 const found={light:{},detail:{},folder:{}};
 for(const file of files){
  if(!file||typeof file.name!=='string'||typeof file.slice!=='function'||!validInteger(file.size))throw new Error('Invalid folder file');
  const path=file.webkitRelativePath||file.name;
  if(typeof path!=='string'||!path||path.startsWith('/')||/[\\:\0]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('Unsafe folder path');
  const parts=path.split('/');if(parts.at(-1)!==file.name)throw new Error('Folder path does not match filename');
  if(!file.name.toLowerCase().endsWith('.safetensors'))continue;
  const folderSides=new Set(parts.slice(0,-1).map(side).filter(Boolean));
  if(folderSides.size>1)throw new Error('Conflicting HighNoise/LowNoise folder labels');
  const folderSide=[...folderSides][0];
  const nameSide=side(file.name.slice(0,-'.safetensors'.length));
  const known=Object.hasOwn(KNOWN,file.name)?KNOWN[file.name]:null;
  if(folderSide&&((known&&known[1]!==folderSide)||(nameSide&&nameSide!==folderSide)))throw new Error('Conflicting file and folder noise labels');
  const category=known?.[0]??'folder',noise=known?.[1]??nameSide??folderSide;
  if(!noise)continue;
  if(found[category][noise])throw new Error('Ambiguous HighNoise/LowNoise pair');
  found[category][noise]=Object.freeze({fileName:file.name,path,source:sourceFor(file)});
 }
 if(Object.keys(found.folder).length&&(Object.keys(found.light).length||Object.keys(found.detail).length))throw new Error('Conflicting known and generic folder pairs');
 const pairs=[];
 for(const id of ['light','detail','folder']){
  const {high,low}=found[id];if(!high&&!low)continue;
  if(!high||!low)throw new Error(`Incomplete ${id} HighNoise/LowNoise pair`);
  pairs.push(Object.freeze({id,label:LABELS[id],high,low}));
 }
 if(!pairs.length)throw new Error('No complete HighNoise/LowNoise pair found');
 const byId=new Map(pairs.map(pair=>[pair.id,pair]));
 return Object.freeze({pairs:Object.freeze(pairs),getPair(id){const pair=byId.get(id);if(!pair)throw new Error('Unknown folder pair');return pair;}});
}

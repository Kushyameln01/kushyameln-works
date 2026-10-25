import {Gunzip} from '../../shared/ft/vendor/fflate.mjs';

export const PACKAGE_LIMITS = Object.freeze({compressed:128*1024*1024, expanded:1024*1024*1024,
  asset:128*1024*1024, metadata:32*1024*1024, meta:4*1024*1024, pathname:64*1024,
  members:50000, selected:256*1024*1024});
const BLOCK=512, decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const children=new Set(['asset','asset.meta','pathname','preview.png']);
const settings=new Set(['controller','anim','asset','prefab','mask']);
// Candidate categories only: neither extension nor inventory proves object type.
const resources=new Set(['mat','fbx','obj','blend','dae','3ds','dxf','max','ma','mb',
  'png','jpg','jpeg','gif','bmp','tga','tif','tiff','psd','psb','exr','hdr','dds','ktx','ktx2',
  'wav','mp3','ogg','aif','aiff','flac','aac','m4a','mod','it','s3m','xm',
  'shader','shadergraph','shadersubgraph','compute','cginc','hlsl','rendertexture','cubemap']);
const crcTable=Uint32Array.from({length:256},(_,value)=>{
  for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);
  return value>>>0;
});
function fail(message){throw new Error(`Unitypackage: ${message}`);}
function crcUpdate(crc,bytes){for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return crc>>>0;}
function u32(bytes,offset){return new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0,true);}
function zero(bytes){return bytes.every(byte=>byte===0);}
function text(bytes,label){try{return decoder.decode(bytes);}catch{fail(`invalid UTF-8 in ${label}`);}}
function validGuid(guid){if(typeof guid!=='string'||!/^[0-9a-f]{32}$/.test(guid)||/^0+$/.test(guid))fail('invalid GUID');}
function validPath(path){
  if(!path.startsWith('Assets/')||/[\\:\x00-\x1f\x7f]/.test(path))fail('asset path must be a safe path below Assets/');
  if(path.split('/').some(p=>p===''||p==='.'||p==='..'))fail('unsafe asset path segment');
}
function isFolder(meta,guid){
  if(meta.includes('\0'))fail('invalid asset.meta');
  const matches=[...meta.matchAll(/^guid:\s*([0-9a-f]{32})\s*$/gm)];
  if(matches.length!==1||matches[0][1]!==guid)fail('asset.meta GUID mismatch');
  return /^folderAsset:\s*yes\s*$/m.test(meta);
}
function gzipHeader(bytes){
  if(bytes.length<18||bytes[0]!==31||bytes[1]!==139||bytes[2]!==8||(bytes[3]&0xe0))fail('invalid gzip header');
  const flags=bytes[3],end=bytes.length-8;let offset=10;
  if(flags&4){
    if(offset+2>end)fail('truncated gzip extra field');
    offset+=2+(bytes[offset]|bytes[offset+1]<<8);
    if(offset>end)fail('truncated gzip extra field');
  }
  for(const flag of [8,16]){
    if(!(flags&flag))continue;
    while(offset<end&&bytes[offset]!==0)offset++;
    if(offset>=end)fail('unterminated gzip header string');offset++;
  }
  if(flags&2){
    if(offset+2>end)fail('truncated gzip header checksum');
    if(((crcUpdate(0xffffffff,bytes.subarray(0,offset))^0xffffffff)&0xffff)!==(bytes[offset]|bytes[offset+1]<<8))fail('gzip header checksum mismatch');
    offset+=2;
  }
  if(offset>=end)fail('gzip deflate data is missing');
  return offset;
}
function octal(header,start,size,label){
  const raw=text(header.subarray(start,start+size),`tar ${label}`);
  if(!/^[\x00 ]*[0-7]*[\x00 ]*$/.test(raw))fail(`invalid tar ${label}`);
  const value=Number.parseInt(raw.replace(/[\x00 ]/g,'')||'0',8);
  if(!Number.isSafeInteger(value))fail(`tar ${label} is too large`);
  return value;
}
function headerName(header){
  const field=header.subarray(0,100),nul=field.indexOf(0);
  if(nul>=0&&!zero(field.subarray(nul)))fail('malformed tar string padding');
  return text(nul<0?field:field.subarray(0,nul),'tar header');
}
function classify(path,folder){
  const filename=path.split('/').at(-1),extension=filename.includes('.')?filename.split('.').at(-1).toLowerCase():'';
  return {extension:extension?'.'+extension:'',selectable:!folder&&settings.has(extension),referenceOnly:!folder&&resources.has(extension)};
}

/** Stateful tar reader. Owns at most one header plus retained metadata and selected
 * bodies; discarded bodies/previews never enter a collection of output chunks. */
function tarReader(selected,maxSelectedBytes,maxMetadataBytes,allowAnyAsset){
  const groups=new Map(),members=new Set(),header=new Uint8Array(BLOCK);
  let headerUsed=0,member=null,padding=0,ended=false,endBytes=0,total=0,metadataBytes=0,selectedBytes=0;
  function startMember(){
    if(zero(header)){ended=true;endBytes=BLOCK;return;}
    const expected=octal(header,148,8,'checksum');let checksum=0;
    for(let i=0;i<BLOCK;i++)checksum+=i>=148&&i<156?32:header[i];
    if(checksum!==expected)fail('tar checksum mismatch');
    const magic=text(header.subarray(257,265),'tar magic');
    if(magic!=='ustar  \0'&&magic!=='ustar\0'+'00')fail('unsupported tar format');
    if(magic==='ustar\0'+'00'&&!zero(header.subarray(345,500)))fail('tar prefixes are not supported');
    for(const [start,size,label] of [[100,8,'mode'],[108,8,'uid'],[116,8,'gid'],[136,12,'mtime']])octal(header,start,size,label);
    const size=octal(header,124,12,'size'),name=headerName(header),type=header[156];
    if(!zero(header.subarray(157,257)))fail('tar links are not supported');
    if(![0,48,53].includes(type))fail('tar links and special members are not supported');
    const directory=type===53,match=directory?/^([0-9a-f]{32})\/?$/.exec(name):/^([0-9a-f]{32})\/([^/]+)$/.exec(name);
    if(!match||(!directory&&!children.has(match[2])))fail('invalid Unitypackage member path');
    const guid=match[1],child=match[2];validGuid(guid);
    const key=directory?guid:name;
    if(members.has(key))fail('duplicate tar member');
    members.add(key);if(members.size>PACKAGE_LIMITS.members)fail('tar member count exceeds 50000');
    if(directory&&size!==0)fail('tar directory has data');
    if(size>PACKAGE_LIMITS.expanded)fail('tar member exceeds 1 GiB');
    let group=groups.get(guid);
    if(!group)groups.set(guid,group={directory:false,files:new Map()});
    if(directory){group.directory=true;return;}
    const metadata=child==='asset.meta'||child==='pathname',keep=metadata||(child==='asset'&&selected?.has(guid));
    if(metadata){
      if(size>(child==='asset.meta'?PACKAGE_LIMITS.meta:PACKAGE_LIMITS.pathname))fail(`${child} exceeds metadata member limit`);
      metadataBytes+=size;
      if(metadataBytes>maxMetadataBytes)fail(maxMetadataBytes<PACKAGE_LIMITS.metadata?'metadata exceeds remaining multi-package budget':'metadata exceeds 32 MiB');
    }
    if(selected?.has(guid)&&(child==='asset'||child==='asset.meta')){
      if(child==='asset'&&size>PACKAGE_LIMITS.asset)fail('selected asset exceeds 128 MiB');
      selectedBytes+=size;if(selectedBytes>maxSelectedBytes)fail('selected data and metadata exceed 256 MiB budget');
    }
    const data=keep?new Uint8Array(size):null;
    group.files.set(child,{size,data});member={size,offset:0,data};padding=(BLOCK-size%BLOCK)%BLOCK;
    if(size===0)member=null;
  }
  return {
    push(chunk){
      total+=chunk.length;if(total>PACKAGE_LIMITS.expanded)fail('expanded data exceeds 1 GiB');
      let offset=0;
      while(offset<chunk.length){
        if(ended){if(!zero(chunk.subarray(offset)))fail('invalid tar end marker');endBytes+=chunk.length-offset;break;}
        if(member){
          const count=Math.min(member.size-member.offset,chunk.length-offset);
          if(member.data)member.data.set(chunk.subarray(offset,offset+count),member.offset);
          member.offset+=count;offset+=count;if(member.offset===member.size)member=null;
        }else if(padding){
          const count=Math.min(padding,chunk.length-offset);
          if(!zero(chunk.subarray(offset,offset+count)))fail('nonzero tar member padding');
          padding-=count;offset+=count;
        }else{
          const count=Math.min(BLOCK-headerUsed,chunk.length-offset);
          header.set(chunk.subarray(offset,offset+count),headerUsed);headerUsed+=count;offset+=count;
          if(headerUsed===BLOCK){headerUsed=0;startMember();}
        }
      }
    },
    finish(){
      if(total%BLOCK!==0)fail('truncated tar block');
      if(member||padding||headerUsed)fail('truncated tar member');
      if(!ended)fail('tar end marker is missing');
      if(endBytes<2*BLOCK)fail('invalid tar end marker');
      const inventory=[],assets=[],paths=new Map();
      for(const [guid,group] of groups){
        if(!group.directory||!group.files.has('asset.meta')||!group.files.has('pathname'))fail('incomplete GUID directory');
        const path=text(group.files.get('pathname').data,'pathname'),meta=text(group.files.get('asset.meta').data,'asset.meta');
        validPath(path);const folder=isFolder(meta,guid),body=group.files.get('asset');
        if(folder?body!==undefined:body===undefined)fail(folder?'folderAsset must not contain asset data':'non-folder asset data is missing');
        if(paths.has(path.toLowerCase()))fail(`duplicate asset path ${path}`);paths.set(path.toLowerCase(),folder);
        const record={guid,path,size:body?.size??0,folder,...classify(path,folder),meta};inventory.push(record);
        if(selected?.has(guid)){
          if(record.folder||(!allowAnyAsset&&!record.selectable))fail(`asset is not selectable: ${path}`);
          assets.push({guid,path,meta,asset:body.data});
        }
      }
      for(const entry of inventory){
        const parts=entry.path.toLowerCase().split('/');
        for(let n=2;n<parts.length;n++)if(paths.get(parts.slice(0,n).join('/'))===false)fail('asset path has a non-folder parent');
      }
      if(selected&&assets.length!==selected.size)fail('selected GUID is absent from package');
      return {inventory,assets,expandedBytes:total,selectedBytes,metadataBytes};
    }
  };
}
function read(bytes,selected,maxSelectedBytes=PACKAGE_LIMITS.selected,maxMetadataBytes=PACKAGE_LIMITS.metadata,allowAnyAsset=false){
  if(!(bytes instanceof Uint8Array))fail('expected Uint8Array');
  if(bytes.length>PACKAGE_LIMITS.compressed)fail('compressed data exceeds 128 MiB');
  const headerLength=gzipHeader(bytes),expectedSize=u32(bytes,bytes.length-4);
  if(expectedSize>PACKAGE_LIMITS.expanded)fail('expanded data exceeds 1 GiB');
  const tar=tarReader(selected,maxSelectedBytes,maxMetadataBytes,allowAnyAsset);let length=0,crc=0xffffffff;
  const stream=new Gunzip(chunk=>{length+=chunk.length;tar.push(chunk);crc=crcUpdate(crc,chunk);});
  stream.onmember=()=>fail('multiple gzip members are not supported');
  stream.push(bytes.subarray(0,headerLength),false);
  for(let offset=headerLength;offset<bytes.length;offset+=1024)stream.push(bytes.subarray(offset,Math.min(offset+1024,bytes.length)),false);
  stream.push(new Uint8Array(),true);
  if(length!==expectedSize)fail('gzip size mismatch');
  if(((crc^0xffffffff)>>>0)!==u32(bytes,bytes.length-8))fail('gzip checksum mismatch');
  return tar.finish();
}

/** First pass: return metadata and byte counts only, never asset/preview bodies. */
export function scanUnityPackage(bytes,{maxMetadataBytes=PACKAGE_LIMITS.metadata}={}){
  if(!Number.isSafeInteger(maxMetadataBytes)||maxMetadataBytes<0||maxMetadataBytes>PACKAGE_LIMITS.metadata)fail('invalid metadata budget');
  const {inventory,expandedBytes,metadataBytes}=read(bytes,null,PACKAGE_LIMITS.selected,maxMetadataBytes);
  return {assets:inventory,expandedBytes,metadataBytes};
}

/** Second pass: selected GUIDs are explicit; every member is still validated.
 * allowAnyAsset lets motion-only scanners inspect nonfolder bodies by headers;
 * the default Composer extension restriction and all size limits are retained. */
export function selectUnityPackage(bytes,guids,{maxSelectedBytes=PACKAGE_LIMITS.selected,allowAnyAsset=false}={}){
  if(typeof allowAnyAsset!=='boolean')fail('allowAnyAsset must be boolean');
  if(!Array.isArray(guids)||new Set(guids).size!==guids.length)fail('selection must contain unique GUIDs');
  for(const guid of guids)validGuid(guid);
  if(!Number.isSafeInteger(maxSelectedBytes)||maxSelectedBytes<0||maxSelectedBytes>PACKAGE_LIMITS.selected)fail('invalid selected data budget');
  return read(bytes,new Set(guids),maxSelectedBytes,PACKAGE_LIMITS.metadata,allowAnyAsset);
}

// Read-only ZIP validation derived from motion-clips/lib/archive.mjs.
import {Unzip,UnzipInflate} from '../ft/vendor/fflate.mjs';
import {readUnityPackage} from './package-reader.mjs';
const MAX_IN=32*1024*1024,MAX_OUT=64*1024*1024,MAX_FILES=2048;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
export function safePath(path){if(typeof path!=='string'||!path||path.length>1024||path.startsWith('/')||path.includes('\\')||/[<>"|?*\u0000-\u001f\u007f:]/.test(path)||path.split('/').some(s=>!s||s==='.'||s==='..'||s.length>255||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)||/[ .]$/.test(s)))throw new Error('不正なアーカイブパス');return path}
function zipHeaders(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){end=i;break}
 if(end<0)throw new Error('ZIP終端が不正');const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),offset=v.getUint32(end+16,true);
 if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||count!==v.getUint16(end+8,true)||count>MAX_FILES||count===65535||offset+size!==end)throw new Error('複数disk/ZIP64/件数超過ZIPは未対応');
 let pos=offset,total=0;const entries=[];
 for(let i=0;i<count;i++){if(pos+46>end||v.getUint32(pos,true)!==0x02014b50)throw new Error('ZIP目録不正');const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),compressed=v.getUint32(pos+20,true),length=v.getUint32(pos+24,true),nl=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),local=v.getUint32(pos+42,true);
  if(flags&0x2041||![0,8].includes(method)||compressed===0xffffffff||length===0xffffffff)throw new Error('暗号化/未対応圧縮/ZIP64');if(pos+46+nl+extra+comment>end)throw new Error('ZIP目録範囲外');
  const unixType=(v.getUint32(pos+38,true)>>>16)&0xf000;if(unixType&&unixType!==0x8000&&unixType!==0x4000)throw new Error('ZIP特殊ファイルは未対応');
  const name=decoder.decode(bytes.subarray(pos+46,pos+46+nl));const directory=name.endsWith('/');safePath(directory?name.slice(0,-1):name);total+=length;if(total>MAX_OUT)throw new Error('展開容量超過');
  if(local+30>offset||v.getUint32(local,true)!==0x04034b50||v.getUint16(local+6,true)!==flags||v.getUint16(local+8,true)!==method)throw new Error('ZIPヘッダー不一致');if(!(flags&8)&&(v.getUint32(local+14,true)!==v.getUint32(pos+16,true)||v.getUint32(local+18,true)!==compressed||v.getUint32(local+22,true)!==length))throw new Error('ZIP CRC/容量ヘッダー不一致');const ln=v.getUint16(local+26,true),le=v.getUint16(local+28,true);if(local+30+ln+le+compressed>offset||decoder.decode(bytes.subarray(local+30,local+30+ln))!==name)throw new Error('ZIP参照範囲/名前不一致');
  entries.push({name,length,directory,crc:v.getUint32(pos+16,true)});pos+=46+nl+extra+comment;
 }
 if(pos!==end)throw new Error('ZIP目録長不一致');return entries;
}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
export function readFiles(inputs){
 if(!Array.isArray(inputs)||inputs.length>MAX_FILES)throw new Error('入力件数超過');let inputBytes=0,expanded=0,entryCount=0;const result=[],seen=new Map();
 function accept(path,bytes,directory=false){safePath(directory?path.slice(0,-1):path);const key=path.replace(/\/$/,'').normalize('NFC').toLowerCase();if(seen.has(key))throw new Error('パス重複/同一視衝突');for(const [other,isDirectory] of seen){if((key.startsWith(other+'/')&&!isDirectory)||(other.startsWith(key+'/')&&!directory))throw new Error('ファイルとフォルダのパスが衝突します')}seen.set(key,directory);if(++entryCount>MAX_FILES)throw new Error('件数超過');if(directory)return;expanded+=bytes.length;if(expanded>MAX_OUT)throw new Error('展開容量超過');result.push({path,bytes})}
 for(const input of inputs){safePath(input.path);if(!(input.bytes instanceof Uint8Array))throw new Error('入力バイト不正');inputBytes+=input.bytes.length;if(inputBytes>MAX_IN)throw new Error('入力32MiB超過');
  if(/\.unitypackage$/i.test(input.path)){for(const e of readUnityPackage(input.bytes).values()){if(e.asset)accept(e.path,e.asset);accept(e.path+'.meta',encoder.encode(e.meta))}continue}
  if(!/\.zip$/i.test(input.path)){accept(input.path,input.bytes);continue}
  const expected=zipHeaders(input.bytes);const entries=new Map();for(const e of expected){if(entries.has(e.name))throw new Error('ZIP重複');entries.set(e.name,e)}let done=0,actual=0;const priorExpanded=expanded;
  const unzip=new Unzip(file=>{const e=entries.get(file.name);if(!e)throw new Error('ZIP未登録entry');entries.delete(file.name);let length=0,chunks=[];file.ondata=(error,data,final)=>{if(error)throw error;length+=data.length;actual+=data.length;if(length>e.length||actual+priorExpanded>MAX_OUT)throw new Error('実展開容量超過');chunks.push(data);if(final){if(length!==e.length)throw new Error('展開長不一致');const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}if(crc32(bytes)!==e.crc)throw new Error('CRC不一致');accept(e.name,bytes,e.directory);done++}};file.start()});unzip.register(UnzipInflate);
  for(let pos=0;pos<input.bytes.length;pos+=4096)unzip.push(input.bytes.subarray(pos,pos+4096),pos+4096>=input.bytes.length);
  if(done!==expected.length||entries.size)throw new Error('ZIP展開未完了');
 }
 return result;
}
export function expandInput(input){if(!(input?.bytes instanceof Uint8Array)||input.bytes.byteLength>16*1024*1024)throw RangeError('ARCHIVE_INPUT_LIMIT');return readFiles([input]);}

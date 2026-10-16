import {PROTOTYPE_LIMITS} from './core.mjs';

export const FORMAT_BUDGETS=Object.freeze({metadataBytes:1048576,structures:1024,exifBytes:65536,ifdEntries:512,maxFileBytes:67108864});
const PNG=[137,80,78,71,13,10,26,10],EXIF=[69,120,105,102,0,0];
const ascii=bytes=>String.fromCharCode(...bytes);
const matches=(bytes,signature)=>signature.every((value,i)=>bytes[i]===value);
const error=code=>{throw new Error(code);};
const check=signal=>{if(signal?.aborted)error('CANCELLED');};
export function resolveMediaLimits(overrides={}){
  if(!overrides||typeof overrides!=='object'||Array.isArray(overrides)||Object.keys(overrides).some(key=>!Object.hasOwn(PROTOTYPE_LIMITS,key)))error('INVALID_LIMITS');
  const limits={...PROTOTYPE_LIMITS,...overrides};
  if(Object.values(limits).some(value=>!Number.isSafeInteger(value)||value<1)||limits.maxPixels>16777216||limits.maxFrames>100000||limits.maxDurationSeconds>86400||limits.maxFileBytes>FORMAT_BUDGETS.maxFileBytes)error('INVALID_LIMITS');
  return Object.freeze(limits);
}
function shape(width,height,limits){if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height)||width*height>limits.maxPixels)error('DECODE_PIXEL_LIMIT');}
function imageInfo(container,width,height,orientation,limits,reader){shape(width,height,limits);return Object.freeze({kind:'image',container,codedWidth:width,codedHeight:height,width:orientation>=5?height:width,height:orientation>=5?width:height,orientation,animated:false,metadataBytes:reader.bytes});}
const decodePatches=new WeakMap();
function exifOrientation(bytes,onOrientation=()=>{}){
  if(bytes.byteLength>FORMAT_BUDGETS.exifBytes)error('METADATA_LIMIT');
  const start=matches(bytes,EXIF)?6:0,b=bytes.subarray(start);if(b.length<8)error('INVALID_EXIF');
  const little=b[0]===73&&b[1]===73;if(!little&&!(b[0]===77&&b[1]===77))error('INVALID_EXIF');
  const view=new DataView(b.buffer,b.byteOffset,b.byteLength);if(view.getUint16(2,little)!==42)error('INVALID_EXIF');
  const offset=view.getUint32(4,little);if(offset<8||offset%2||offset+2>b.length)error('INVALID_EXIF');
  const count=view.getUint16(offset,little);if(count>FORMAT_BUDGETS.ifdEntries)error('METADATA_LIMIT');if(offset+2+count*12+4>b.length)error('INVALID_EXIF');
  let orientation=1,seen=false;
  for(let i=0;i<count;i++){
    const entry=offset+2+i*12;if(view.getUint16(entry,little)!==0x112)continue;
    if(seen||view.getUint16(entry+2,little)!==3||view.getUint32(entry+4,little)!==1)error('INVALID_EXIF');
    seen=true;orientation=view.getUint16(entry+8,little);if(orientation<1||orientation>8)error('INVALID_EXIF');onOrientation({offset:start+entry+8,little,value:orientation});
  }
  return orientation;
}
class Reader{
  constructor(file,signal){this.file=file;this.signal=signal;this.bytes=0;this.structures=0;}
  step(){check(this.signal);if(++this.structures>FORMAT_BUDGETS.structures)error('METADATA_LIMIT');}
  async read(offset,length){
    check(this.signal);if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>this.file.size)error('TRUNCATED_MEDIA');
    if(this.bytes+length>FORMAT_BUDGETS.metadataBytes)error('METADATA_LIMIT');this.bytes+=length;
    const bytes=new Uint8Array(await this.file.slice(offset,offset+length).arrayBuffer());check(this.signal);if(bytes.length!==length)error('TRUNCATED_MEDIA');return bytes;
  }
}
async function png(reader,limits){
  let pos=8,width,height,seenIHDR=false,seenIDAT=false,seenExif=false,orientation=1;
  while(pos<reader.file.size){
    reader.step();const h=await reader.read(pos,8),length=new DataView(h.buffer).getUint32(0),type=ascii(h.subarray(4)),end=pos+12+length;
    if(end>reader.file.size)error('INVALID_PNG');if(!seenIHDR&&type!=='IHDR')error('INVALID_PNG');
    if(['acTL','fcTL','fdAT'].includes(type))error('ANIMATION_UNSUPPORTED');
    if(type==='IHDR'){
      if(seenIHDR||length!==13)error('INVALID_PNG');seenIHDR=true;
      const d=await reader.read(pos+8,13),v=new DataView(d.buffer);width=v.getUint32(0);height=v.getUint32(4);shape(width,height,limits);
    }else if(type==='IDAT')seenIDAT=true;
    else if(type==='eXIf'){
      if(seenExif)error('INVALID_EXIF');seenExif=true;if(length>FORMAT_BUDGETS.exifBytes)error('METADATA_LIMIT');orientation=exifOrientation(await reader.read(pos+8,length));
      if(orientation!==1)error('ORIENTATION_UNSUPPORTED');
    }else if(type==='IEND'){
      if(length!==0||!seenIDAT||end!==reader.file.size)error('INVALID_PNG');return imageInfo('PNG',width,height,orientation,limits,reader);
    }
    pos=end;
  }
  error('INVALID_PNG');
}
async function jpeg(reader,limits){
  let pos=2,width,height,components,seenSOF=false,seenExif=false,orientation=1;
  while(pos<reader.file.size){
    reader.step();const markerBytes=await reader.read(pos,2);if(markerBytes[0]!==255)error('INVALID_JPEG');const marker=markerBytes[1];
    if(marker===255){pos++;continue;}
    if([0,0xd8,0xd9,0x01].includes(marker)||(marker>=0xd0&&marker<=0xd7))error('INVALID_JPEG');
    const lengthBytes=await reader.read(pos+2,2),length=new DataView(lengthBytes.buffer).getUint16(0),end=pos+2+length;
    if(length<2||end>reader.file.size)error('INVALID_JPEG');const payload=pos+4,size=length-2;
    if(marker===0xe1){
      const prefix=await reader.read(payload,Math.min(size,6));
      if(matches(prefix,EXIF)){
        if(seenExif)error('INVALID_EXIF');seenExif=true;if(size>FORMAT_BUDGETS.exifBytes)error('METADATA_LIMIT');orientation=exifOrientation(await reader.read(payload,size));
      }else if(ascii(prefix.subarray(0,4))==='Exif')error('INVALID_EXIF');
    }else if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker)){
      if(![0xc0,0xc2].includes(marker))error('JPEG_MODE_UNSUPPORTED');if(seenSOF||size<6)error('INVALID_JPEG');seenSOF=true;
      const d=await reader.read(payload,6),v=new DataView(d.buffer);components=d[5];
      if(d[0]!==8||![1,3].includes(components))error('JPEG_MODE_UNSUPPORTED');if(size!==6+3*components)error('INVALID_JPEG');
      height=v.getUint16(1);width=v.getUint16(3);shape(width,height,limits);
    }else if(marker===0xda){
      if(!seenSOF||size<4)error('INVALID_JPEG');const count=(await reader.read(payload,1))[0];if(count<1||count>components||size!==1+count*2+3)error('INVALID_JPEG');
      return imageInfo('JPEG',width,height,orientation,limits,reader);
    }else if([0xdc,0xcc,0xc8].includes(marker))error('JPEG_MODE_UNSUPPORTED');
    pos=end;
  }
  error('INVALID_JPEG');
}
async function webp(reader,limits,header){
  if(new DataView(header.buffer).getUint32(4,true)+8!==reader.file.size)error('INVALID_WEBP');
  let pos=12,extended=null,bitstream=null,bitstreamType=null,seenExif=false,seenAlpha=false,seenICC=false,seenXMP=false,orientation=1,decodePatch=null;
  while(pos<reader.file.size){
    reader.step();const h=await reader.read(pos,8),type=ascii(h.subarray(0,4)),length=new DataView(h.buffer).getUint32(4,true),end=pos+8+length+(length&1);
    if(end>reader.file.size)error('INVALID_WEBP');if(length&1&&(await reader.read(end-1,1))[0]!==0)error('INVALID_WEBP');
    if(type==='ANIM'||type==='ANMF')error('ANIMATION_UNSUPPORTED');
    if(type==='VP8X'){
      if(extended||pos!==12||length!==10)error('INVALID_WEBP');const d=await reader.read(pos+8,10);
      if(d[0]&2)error('ANIMATION_UNSUPPORTED');if((d[0]&0xc1)||d[1]||d[2]||d[3])error('INVALID_WEBP');
      extended={width:1+d[4]+d[5]*256+d[6]*65536,height:1+d[7]+d[8]*256+d[9]*65536,flags:d[0]};shape(extended.width,extended.height,limits);
    }else if(type==='VP8 '||type==='VP8L'){
      if(bitstream)error('INVALID_WEBP');bitstreamType=type;
      if(type==='VP8 '){
        if(length<10)error('INVALID_WEBP');const d=await reader.read(pos+8,10),v=new DataView(d.buffer);
        if((d[0]&1)||!matches(d.subarray(3),[0x9d,1,0x2a])||(v.getUint16(6,true)&0xc000)||(v.getUint16(8,true)&0xc000))error('INVALID_WEBP');
        bitstream={width:v.getUint16(6,true)&0x3fff,height:v.getUint16(8,true)&0x3fff};
      }else{
        if(length<5||seenAlpha)error('INVALID_WEBP');const d=await reader.read(pos+8,5);if(d[0]!==0x2f||(d[4]&0xe0))error('INVALID_WEBP');
        const bits=new DataView(d.buffer).getUint32(1,true);bitstream={width:1+(bits&0x3fff),height:1+((bits>>>14)&0x3fff)};
      }
      shape(bitstream.width,bitstream.height,limits);
    }else if(type==='ALPH'){
      if(!extended||seenAlpha||bitstream||length<1)error('INVALID_WEBP');seenAlpha=true;
    }else if(type==='EXIF'){
      if(!extended||seenExif)error('INVALID_EXIF');seenExif=true;if(length>FORMAT_BUDGETS.exifBytes)error('METADATA_LIMIT');orientation=exifOrientation(await reader.read(pos+8,length),patch=>{decodePatch={...patch,offset:pos+8+patch.offset};});
    }else if(type==='ICCP'){
      if(!extended||seenICC||bitstream)error('INVALID_WEBP');seenICC=true;
    }else if(type==='XMP '){if(!extended||seenXMP)error('INVALID_WEBP');seenXMP=true;}
    pos=end;
  }
  if(!bitstream||pos!==reader.file.size)error('INVALID_WEBP');
  if(extended&&((extended.width!==bitstream.width||extended.height!==bitstream.height)||Boolean(extended.flags&8)!==seenExif||Boolean(extended.flags&32)!==seenICC||Boolean(extended.flags&4)!==seenXMP||(seenAlpha&&!(extended.flags&16))))error('INVALID_WEBP');
  if(seenAlpha&&bitstreamType!=='VP8 ')error('INVALID_WEBP');
  const info=imageInfo('WebP',bitstream.width,bitstream.height,orientation,limits,reader);
  if(orientation!==1)decodePatches.set(info,{file:reader.file,...decodePatch});
  return info;
}
async function mp4(reader){
  let pos=0,ftyp=false,moov=false,mdat=false;
  while(pos<reader.file.size){
    reader.step();const h=await reader.read(pos,8),type=ascii(h.subarray(4));let size=new DataView(h.buffer).getUint32(0),header=8;
    if(size===1){const e=await reader.read(pos+8,8),wide=new DataView(e.buffer).getBigUint64(0);if(wide>BigInt(Number.MAX_SAFE_INTEGER))error('INVALID_MP4');size=Number(wide);header=16;}
    else if(size===0){if(type!=='mdat')error('INVALID_MP4');size=reader.file.size-pos;}
    if(size<header||pos+size>reader.file.size||!Number.isSafeInteger(pos+size))error('INVALID_MP4');
    if(['moof','styp'].includes(type))error('FRAGMENTED_MP4_UNSUPPORTED');
    if(type==='ftyp'){
      if(pos!==0||ftyp||size<header+8||(size-header)%4)error('INVALID_MP4');ftyp=true;const brand=ascii(await reader.read(pos+header,4));
      if(!['isom','iso2','mp41','mp42','avc1'].includes(brand))error('MP4_BRAND_UNSUPPORTED');
    }else if(type==='moov'){
      if(!ftyp||moov)error('INVALID_MP4');if(size>FORMAT_BUDGETS.metadataBytes)error('METADATA_LIMIT');moov=true;
    }else if(type==='mdat')mdat=true;
    pos+=size;
  }
  if(!ftyp||!moov||!mdat)error('INVALID_MP4');return Object.freeze({kind:'video',container:'MP4',metadataBytes:reader.bytes});
}
export async function inspectMediaFile(file,{limits:overrides={},signal}={}){
  check(signal);const limits=resolveMediaLimits(overrides);if(!(file instanceof Blob)||file.size<8||file.size>limits.maxFileBytes)error('FILE_LIMIT');
  const reader=new Reader(file,signal),head=await reader.read(0,Math.min(16,file.size));
  if(matches(head,PNG))return png(reader,limits);
  if(head[0]===255&&head[1]===216)return jpeg(reader,limits);
  if(ascii(head.subarray(0,4))==='RIFF'&&ascii(head.subarray(8,12))==='WEBP')return webp(reader,limits,head);
  if(matches(head,[0x1a,0x45,0xdf,0xa3]))return Object.freeze({kind:'video',container:'WebM',metadataBytes:reader.bytes});
  if(ascii(head.subarray(4,8))==='ftyp'||ascii(head.subarray(4,8))==='styp')return mp4(reader);
  error('FORMAT_UNSUPPORTED');
}

// Private inspection state binds a verified patch to the exact immutable Blob.
// Callers reserve one extra compressed-file copy before invoking this helper.
export async function prepareImageDecode(file,info,{signal}={}){
  check(signal);if(info.container!=='WebP'||info.orientation===1)return file;
  const patch=decodePatches.get(info);
  if(!patch||patch.file!==file||!Number.isSafeInteger(patch.offset)||patch.offset<12||patch.offset+2>file.size||patch.value!==info.orientation)error('INVALID_EXIF');
  const original=await file.slice(patch.offset,patch.offset+2).arrayBuffer();check(signal);
  if(original.byteLength!==2||new DataView(original).getUint16(0,patch.little)!==patch.value)error('INVALID_EXIF');
  const identity=new Uint8Array(2);new DataView(identity.buffer).setUint16(0,1,patch.little);
  return new Blob([file.slice(0,patch.offset),identity,file.slice(patch.offset+2)],{type:'image/webp'});
}

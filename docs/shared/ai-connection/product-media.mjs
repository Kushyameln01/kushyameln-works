/** Local product media I/O. Pixel packing is separate from owner inference and
 * from the lossless native tensor codec. No File is uploaded by this module. */
import {readMediaFrames,encodePng} from '../media-basic/browser.mjs';
import {validateFrame} from '../media-basic/core.mjs';
import {resolveMediaLimits} from '../media-basic/formats.mjs';
import {zipSync,unzipSync,strToU8} from '../ft/vendor/fflate.mjs';

export const PRODUCT_FRAMES_VERSION='works-product-frames/1';
export const PRODUCT_MEDIA_LIMITS=Object.freeze({maxPixels:4194304,maxFrames:100,maxDurationSeconds:10,maxFileBytes:67108864,maxArtifactBytes:268435456});
const FRAME_BYTES_LIMIT=268435456,TENSOR_BYTES_LIMIT=536870912,MANIFEST_BYTES_LIMIT=1048576;
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const check=signal=>{if(signal?.aborted)fail('CANCELLED','Media operation cancelled');};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const copy=value=>value===undefined?undefined:structuredClone(value);
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const fileInfo=file=>({name:file.name??'local-media',size:file.size,type:file.type,lastModified:file.lastModified??null});
function frameMetadata(frame){return Object.fromEntries(Object.entries(frame).filter(([key])=>key!=='data').map(([key,value])=>[key,copy(value)]));}
// Original video ordering is checked by its decoder. A saved native context can
// deliberately map an ordered image selection to repeated or earlier times.
function validateTimes(frames){for(const frame of frames){const time=frame.timestamp??null,duration=frame.duration??null;if(time!==null&&(!Number.isFinite(time)||time<0))fail('MEDIA_TIMESTAMPS','Frames require finite nonnegative actual timestamps');if(duration!==null&&(!Number.isFinite(duration)||duration<0))fail('MEDIA_DURATION','Invalid frame duration');}}
function requireFrames(media){if(!Array.isArray(media?.frames)||!media.frames.length)fail('MEDIA_FRAMES_REQUIRED','Read an image, video, or frame package first');for(const f of media.frames)validateFrame(f,PRODUCT_MEDIA_LIMITS.maxPixels);validateTimes(media.frames);return media.frames;}
async function completeMedia({frames,metadata,inputId,inputSha256,kind,signal}){
 check(signal);if(!frames.length)fail('MEDIA_NO_FRAMES','No decoded frames');validateTimes(frames);
 const sourceFrameIndices=frames.map((frame,index)=>frame.sourceFrameIndex??index),times=frames.map(frame=>frame.timestamp??null);
 const supply={state:'present',inputId,inputSha256,rgb:{frames:frames.length,height:frames[0].height,width:frames[0].width,geometryStage:'oriented'},frames:frames.map(f=>({width:f.width,height:f.height})),sourceFrameIndices,...(times.every(time=>time!==null)?{sourceFrameTimesSeconds:times}:{})};
 const preview=await encodePng(frames[0],{limits:PRODUCT_MEDIA_LIMITS,adapterMemoryBudgetBytes:536870912});check(signal);
 const result={kind,inputId,inputSha256,metadata,frames,supply,preview,dispose(){frames.length=0;result.preview=null;if(Object.hasOwn(result,'nativeTensor'))result.nativeTensor=null;}};
 return result;
}
async function readFramePackage(file,{signal,onProgress,limits}){
 const bytes=new Uint8Array(await file.arrayBuffer());check(signal);let total=0;const paths=new Set();
 const entries=unzipSync(bytes,{filter:item=>{if(paths.has(item.name)||!(/^(manifest\.json|frames\/\d{6}\.png)$/.test(item.name)))fail('MEDIA_PACKAGE_PATH','Invalid or duplicate frame package path');paths.add(item.name);total+=item.originalSize;if(total>limits.maxArtifactBytes||item.name==='manifest.json'&&item.originalSize>MANIFEST_BYTES_LIMIT)fail('MEDIA_PACKAGE_LIMIT','Frame package exceeds its byte limit');return true;}});
 if(!entries['manifest.json'])fail('MEDIA_PACKAGE_MANIFEST','Frame ZIP has no manifest');
 const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(entries['manifest.json']));
 if(manifest.version!==PRODUCT_FRAMES_VERSION||!Array.isArray(manifest.frames)||!manifest.frames.length||manifest.frames.length>limits.maxFrames)fail('MEDIA_PACKAGE_VERSION','Unsupported or empty frame package');
 if(paths.size!==manifest.frames.length+1)fail('MEDIA_PACKAGE_ENTRIES','Frame package contains unlisted or missing files');
 const frames=[];let retained=0;
 for(let i=0;i<manifest.frames.length;i++){
  check(signal);const info=manifest.frames[i],path=`frames/${String(i).padStart(6,'0')}.png`,png=entries[path];
  if(info.path!==path||!png||png.byteLength!==info.bytes||await digest(png)!==info.sha256)fail('MEDIA_PACKAGE_INTEGRITY','Frame PNG bytes differ from the manifest');check(signal);
  let decoded;
  for await(const frame of readMediaFrames(new File([png],path,{type:'image/png'}),{signal,limits,adapterMemoryBudgetBytes:536870912})){if(decoded)fail('MEDIA_PACKAGE_FRAME','Each package frame must be one PNG');decoded=frame;}
  if(!decoded||decoded.width!==info.width||decoded.height!==info.height)fail('MEDIA_PACKAGE_DIMENSIONS','Frame PNG dimensions differ from the manifest');
  const frame={...copy(info),...decoded,timestamp:info.timestamp??null,duration:info.duration??null};delete frame.path;delete frame.sha256;delete frame.bytes;
  retained+=frame.data.byteLength;if(retained>FRAME_BYTES_LIMIT)fail('MEDIA_MEMORY_LIMIT','Decoded frames exceed 256 MiB; use a smaller input');frames.push(frame);onProgress({phase:'read-package',frameCount:frames.length});await tick();
 }
 // Keep unknown package header fields without recursively nesting the previous
 // manifest on every open/save. Per-frame metadata already lives on each frame.
 const packageHeader=Object.fromEntries(Object.entries(manifest).filter(([key])=>!['metadata','frames'].includes(key)));
 return completeMedia({frames,metadata:{...copy(manifest.metadata??{}),framePackage:copy(packageHeader),file:fileInfo(file),sourceRetention:'Original image/frame package is caller-owned; audio is absent'},kind:manifest.kind??'frames',inputId:'media:'+crypto.randomUUID(),inputSha256:await digest(bytes),signal});
}

/** Images retain alpha for previews. Video timestamps come only from decoded
 * samples (media-basic/WebCodecs), never duration/FPS/HTMLVideoElement seeks. */
export async function readProductMedia(file,{signal,onProgress=()=>{},limits:overrides={}}={}){
 const limits=resolveMediaLimits({...PRODUCT_MEDIA_LIMITS,...overrides});check(signal);
 if(!(file instanceof Blob)||file.size<1||file.size>limits.maxArtifactBytes)fail('MEDIA_FILE_LIMIT','Select a nonempty local media file within the byte limit');
 const signature=new Uint8Array(await file.slice(0,4).arrayBuffer());check(signal);
 if(signature[0]===80&&signature[1]===75&&signature[2]===3&&signature[3]===4)return readFramePackage(file,{signal,onProgress,limits});
 if(file.size>limits.maxFileBytes)fail('MEDIA_FILE_LIMIT','Image/video input exceeds the 64 MiB limit');
 const inputSha256=await digest(await file.arrayBuffer());check(signal);let metadata={},retained=0;const frames=[];
 for await(const decoded of readMediaFrames(file,{signal,limits,adapterMemoryBudgetBytes:536870912,onMetadata:value=>{metadata=value;}})){
  check(signal);retained+=decoded.data.byteLength;if(retained>FRAME_BYTES_LIMIT)fail('MEDIA_MEMORY_LIMIT','Decoded frames exceed 256 MiB; use a smaller input');
  frames.push({...decoded,sourceFrameIndex:frames.length});onProgress({phase:'decode',frameCount:frames.length});await tick();
 }
 return completeMedia({frames,metadata:{...metadata,file:fileInfo(file),identityKind:'file-sha256'},kind:metadata.kind??'image',inputId:'media:'+crypto.randomUUID(),inputSha256,signal});
}

/** Ordered still-image selection. No timeline is invented for a PNG sequence. */
export async function readProductMediaFiles(files,options={}){
 const selected=Array.from(files??[]);if(selected.length===1)return readProductMedia(selected[0],options);
 if(!selected.length||selected.length>PRODUCT_MEDIA_LIMITS.maxFrames)fail('MEDIA_FILE_SELECTION','Select one media file or at most 100 ordered images');
 const frames=[],inputs=[];let retained=0;
 for(const file of selected){
  check(options.signal);const media=await readProductMedia(file,options);
  try{if(media.kind!=='image'||media.frames.length!==1)fail('MEDIA_IMAGE_SEQUENCE','Multiple selection accepts still images only; use one frame ZIP for a timed sequence');const frame=media.frames[0];retained+=frame.data.byteLength;if(retained>FRAME_BYTES_LIMIT)fail('MEDIA_MEMORY_LIMIT','Decoded frames exceed 256 MiB');frames.push({...frame,sourceFrameIndex:frames.length,timestamp:null,duration:null});inputs.push({...fileInfo(file),sha256:media.inputSha256});}finally{media.dispose();}
 }
 const inputSha256=await digest(strToU8(JSON.stringify(inputs)));check(options.signal);
 return completeMedia({frames,metadata:{identityKind:'ordered-file-list-sha256',inputs,timeline:'No timestamps were supplied for the selected still images'},kind:'frames',inputId:'media:'+crypto.randomUUID(),inputSha256,signal:options.signal});
}

function rgbShape(shape){if(!Array.isArray(shape)||shape.length!==5||shape[0]!==1||shape[1]!==3||shape.some(n=>!Number.isSafeInteger(n)||n<1)||!Number.isSafeInteger(shape.reduce((a,b)=>a*b,1)))fail('MEDIA_RGB_SHAPE','RGB pixel packing requires positive N1 C3 T H W dimensions');return shape;}
function selectionFor(media,requirement){
 const frames=requireFrames(media),shape=rgbShape(requirement?.shape??[1,3,frames.length,frames[0].height,frames[0].width]);
 const originalFrameIndex=requirement?.originalFrameIndex??requirement?.provenance?.originalFrameIndex;
 const start=originalFrameIndex??0;
 if(!Number.isSafeInteger(start)||start<0||start+shape[2]>frames.length)fail('MEDIA_FRAME_SELECTION','The shared requirement refers to unavailable decoded frames');
 return {frames:frames.slice(start,start+shape[2]),shape,start};
}

/** Native VAE owner accepts rgb-unit directly and owns its conversion to raw
 * [-1,1]. Without a requirement this packs the actual oriented file dimensions. */
export async function productMediaTensor(media,{requirement,meaning='rgb-unit',context,signal}={}){
 if(!['rgb-unit','raw-decoder-rgb'].includes(meaning))fail('MEDIA_RGB_MEANING','Unsupported native RGB meaning');
 const {frames,shape,start}=selectionFor(media,requirement),[,channels,count,height,width]=shape;
 if(requirement?.dtype&&requirement.dtype!=='float32')fail('MEDIA_RGB_DTYPE','Native RGB pixel packing requires float32');
 if(requirement?.preprocessing&&requirement.preprocessing.interpolation!=='area')fail('MEDIA_RESIZE_POLICY','Only the shared area preprocessing contract is accepted');
 if(frames.some(frame=>frame.width!==width||frame.height!==height))fail('MEDIA_RESIZE_UNAVAILABLE','This media needs the referenced area/center resize implementation before owner tensor preparation');
 if(channels*count*height*width*4>TENSOR_BYTES_LIMIT)fail('MEDIA_TENSOR_LIMIT','Prepared RGB tensor exceeds the 512 MiB buffer limit');
 const data=new Float32Array(channels*count*height*width);
 for(let f=0;f<count;f++){
  check(signal);const frame=frames[f];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const at=y*frame.stride+x*4;if(frame.data[at+3]!==255)fail('MEDIA_ALPHA_UNSUPPORTED','Native VAE RGB input requires opaque pixels; this input contains transparency');
   for(let c=0;c<3;c++){const unit=frame.data[at+c]/255;data[(c*count+f)*height*width+y*width+x]=meaning==='rgb-unit'?unit:unit*2-1;}
  }
  await tick();
 }
 const provenance=requirement?.provenance??{},source=media.supply;
 const selectedContext=context??{schemaVersion:1,contextId:requirement?.requirementId??'media:rgb',inputId:source.inputId,inputSha256:source.inputSha256,slotId:requirement?.role??'media',sourceFrameIndices:(provenance.sourceFrameIndices??source.sourceFrameIndices.slice(start,start+count)),...((provenance.sourceFrameTimesSeconds??source.sourceFrameTimesSeconds?.slice(start,start+count))?{sourceFrameTimesSeconds:provenance.sourceFrameTimesSeconds??source.sourceFrameTimesSeconds.slice(start,start+count)}:{})};
 check(signal);return {dtype:'float32',layout:'NCTHW',shape:[...shape],meaning,data,context:copy(selectedContext)};
}

/** raw decoder floats remain untouched. PNG is an explicitly quantized display
 * packing: raw→(x+1)/2, clip to [0,1], round to 8-bit; no color/coordinate edit. */
export async function previewProductTensor(tensor,{signal,asInput=false}={}){
 const shape=rgbShape(tensor?.shape);
 if(tensor.dtype!=='float32'||tensor.layout!=='NCTHW'||!['rgb-unit','raw-decoder-rgb'].includes(tensor.meaning)||!(tensor.data instanceof Float32Array)||tensor.data.length!==shape.reduce((a,b)=>a*b,1))fail('MEDIA_RGB_TENSOR','Expected an owner float32 NCTHW RGB tensor');
 const [,channels,count,height,width]=shape;if(width*height>PRODUCT_MEDIA_LIMITS.maxPixels||count>PRODUCT_MEDIA_LIMITS.maxFrames||count*width*height*4>FRAME_BYTES_LIMIT)fail('MEDIA_OUTPUT_LIMIT','Output frames exceed product preview limits');
 // The caller restores native tensors with the owner codec. This projection
 // only checks that its optional lineage maps every displayed RGB frame; it
 // does not invent a mapping from causal-floor metadata or source frame count.
 const inputContext=asInput?copy(tensor.context):null;
 if(inputContext){
  const c=inputContext,identifier=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[\u0000-\u001f\u007f]/.test(value);
  if(c.schemaVersion!==1||!identifier(c.inputId)||!identifier(c.contextId)||!identifier(c.slotId)||!(/^[0-9a-f]{64}$/.test(c.inputSha256??''))||!Array.isArray(c.sourceFrameIndices)||c.sourceFrameIndices.length!==count||c.sourceFrameIndices.some(index=>!Number.isSafeInteger(index)||index<0)||c.sourceFrameTimesSeconds!==undefined&&(!Array.isArray(c.sourceFrameTimesSeconds)||c.sourceFrameTimesSeconds.length!==count||c.sourceFrameTimesSeconds.some(time=>!Number.isFinite(time)||time<0)))fail('MEDIA_INPUT_CONTEXT_MAPPING','Saved RGB tensor context must map every input frame; its original lineage cannot be replaced by display frame indices');
 }
 const frames=[],frameHashes=[],times=tensor.context?.sourceFrameTimesSeconds;let clippedValues=0;
 for(let f=0;f<count;f++){
  check(signal);const data=new Uint8ClampedArray(width*height*4);
  for(let pixel=0;pixel<height*width;pixel++){for(let c=0;c<channels;c++){const value=tensor.data[(c*count+f)*height*width+pixel];if(!Number.isFinite(value))fail('MEDIA_NONFINITE_RGB','Owner RGB output contains a nonfinite value');const unit=tensor.meaning==='raw-decoder-rgb'?(value+1)/2:value;if(unit<0||unit>1)clippedValues++;data[pixel*4+c]=Math.round(Math.max(0,Math.min(1,unit))*255);}data[pixel*4+3]=255;}
  // sourceContext mappings can exceed decoder output length after causal-floor;
  // retain them in metadata, but do not claim they timestamp every output frame.
  frames.push({data,width,height,stride:width*4,timestamp:times?.length===count?times[f]:null,duration:null,sourceFrameIndex:inputContext?inputContext.sourceFrameIndices[f]:f});frameHashes.push(await digest(data));await tick();
 }
 const descriptor=Object.fromEntries(Object.entries(tensor).filter(([key])=>key!=='data').map(([key,value])=>[key,copy(value)]));
 const metadata={sourceTensor:descriptor,identityKind:'rgba-frame-list-sha256',pixelPacking:{sourceMeaning:tensor.meaning,mapping:tensor.meaning==='raw-decoder-rgb'?'(x + 1) / 2':'identity',output:'sRGB-labelled RGB8 PNG',quantization:'clip [0,1]; round(value * 255)',clippedValues,rawTensorUnchanged:true},timeline:times?.length===count?'owner context timestamps':'Output timeline is unavailable; no FPS timeline was inferred'};
 const inputSha256=await digest(strToU8(JSON.stringify({descriptor,frameHashes})));check(signal);
 const media=await completeMedia({frames,metadata,kind:count===1?'image':'frames',inputId:inputContext?.inputId??'display:'+crypto.randomUUID(),inputSha256:inputContext?.inputSha256??inputSha256,signal});
 if(asInput){media.nativeTensor=tensor;if(inputContext){media.metadata.identityKind='native-context-original-input';media.supply.provenance={contextId:inputContext.contextId,slotId:inputContext.slotId};}}
 return media;
}

export async function saveProductImage(media,{frameIndex=0,signal}={}){
 const frames=requireFrames(media);if(!Number.isSafeInteger(frameIndex)||!frames[frameIndex])fail('MEDIA_FRAME_INDEX','Select an available frame');check(signal);
 const blob=await encodePng(frames[frameIndex],{limits:PRODUCT_MEDIA_LIMITS,adapterMemoryBudgetBytes:536870912});check(signal);
 return {blob,filename:`frame-${String(frameIndex).padStart(6,'0')}.png`};
}
export async function saveProductFrames(media,{signal,onProgress=()=>{}}={}){
 const frames=requireFrames(media),files={},records=[];let bytes=0;
 for(let i=0;i<frames.length;i++){
  check(signal);const {blob}=await saveProductImage(media,{frameIndex:i,signal}),png=new Uint8Array(await blob.arrayBuffer()),path=`frames/${String(i).padStart(6,'0')}.png`;
  bytes+=png.byteLength;if(bytes>PRODUCT_MEDIA_LIMITS.maxArtifactBytes)fail('MEDIA_PACKAGE_LIMIT','Frame PNGs exceed the package byte limit');
  files[path]=png;records.push({...frameMetadata(frames[i]),path,bytes:png.byteLength,sha256:await digest(png)});onProgress({phase:'save-frames',frameCount:i+1});await tick();
 }
 check(signal);const manifest={version:PRODUCT_FRAMES_VERSION,kind:media.kind??'frames',metadata:copy(media.metadata??{}),sourceInput:{inputId:media.inputId,inputSha256:media.inputSha256},pixelFormat:'RGBA8 browser decoded/display pixels',frames:records};
 files['manifest.json']=strToU8(JSON.stringify(manifest,null,2));if(files['manifest.json'].byteLength>MANIFEST_BYTES_LIMIT)fail('MEDIA_PACKAGE_MANIFEST_LIMIT','Frame metadata exceeds 1 MiB');
 const zipped=zipSync(files,{level:0});await tick();check(signal);if(zipped.byteLength>PRODUCT_MEDIA_LIMITS.maxArtifactBytes)fail('MEDIA_PACKAGE_LIMIT','Frame ZIP exceeds the package byte limit');
 return {blob:new Blob([zipped],{type:'application/zip'}),filename:'media-frames.zip',manifest};
}

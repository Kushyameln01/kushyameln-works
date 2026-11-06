// Owner-side media input. The existing media decoder owns orientation/sRGB;
// native VAE owns shape semantics and the Hike rgb-unit -> [-1,1] operation.
import {readMediaFrames,ADAPTER_MEMORY_DEFAULT} from '../media-basic/browser.mjs';
import {sha256} from '../media-basic/sdk.mjs';
import {validateFrame} from '../media-basic/core.mjs';
import {inspectVaeManifest,validateVaeDescriptor,validateVaeRequest} from './vae.mjs';
import {STREAM_KIND} from './vae-stream.mjs';

function opaqueFrame(frame,maxPixels){
 const checked=validateFrame(frame,maxPixels),{data,width,height,stride}=checked;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[y*stride+x*4+3]!==255)throw Error('透過画像は、背景を明示的に合成してから選んでください');
 return checked;
}

/** Shared by the original image-sequence UI and operational media input. */
export function writeOpaqueRgbaToNcthw(frame,target,{frameIndex,frameCount}={}){
 const {data,width,height,stride}=opaqueFrame(frame,frame.width*frame.height),pixels=width*height;
 if(!(target instanceof Float32Array)||!Number.isSafeInteger(frameCount)||frameCount<1||!Number.isSafeInteger(frameIndex)||frameIndex<0||frameIndex>=frameCount||target.length!==3*frameCount*pixels)throw TypeError('Invalid RGB frame target');
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)target[(c*frameCount+frameIndex)*pixels+y*width+x]=data[y*stride+x*4+c]/255;
 return target;
}

/** Preserve every decoded frame. Packing is extracted from inference/ui.mjs:
 * opaque RGBA8 / 255 -> float32 NCTHW rgb-unit, with no resize or sampling.
 * readFrames injection is for decoder-boundary tests; production uses the
 * existing media-basic decoder and its ordinary format/resource limits.
 */
export async function prepareVaeMediaInput(file,{manifest,slotId,signal,capabilities,onProgress=()=>{},readFrames=readMediaFrames}={}){
 signal?.throwIfAborted();
 if(!(file instanceof Blob))throw TypeError('媒体ファイルを選んでください');
 const inspected=inspectVaeManifest(manifest),stream=manifest.kind===STREAM_KIND;
 const requiredFrames=stream?null:inspected.profile.videoShape[2],maximumFrames=stream?inspected.domain.maxSourceFrames:requiredFrames;
 const frames=[];let width,height,retainedBytes=0;
 async function checkShape(count){
  const shape=stream?[1,3,count,height,width]:[...inspected.profile.videoShape];
  if(!stream&&(width!==shape[4]||height!==shape[3]))throw Error(`このVAEの画像寸法は ${shape[4]}×${shape[3]} です。自動リサイズは行いません`);
  const input={dtype:'float32',layout:'NCTHW',meaning:'rgb-unit',shape};
  validateVaeDescriptor({operation:'encode',tensor:input,manifest});
  if(capabilities){const result=await capabilities({operation:'encode',input});if(result?.support?.supported===false)throw Object.assign(Error(result.support.reason),{code:result.support.code});}
  return shape;
 }
 for await(const frame of readFrames(file,{signal})){
  signal?.throwIfAborted();const checked=validateFrame(frame);
  if(!frames.length){width=checked.width;height=checked.height;}
  if(checked.width!==width||checked.height!==height)throw Error('全フレームの画像寸法を揃えてください。自動リサイズは行いません');
  const count=frames.length+1;if(count>maximumFrames)throw Error(`このVAEには最大 ${maximumFrames} フレームを渡せます。フレームは自動削減しません`);
  const shape=await checkShape(count);
  // Reuse the media adapter's 64 MiB budget for this import route's retained
  // RGBA plus packed tensor; large native tensors remain importable as WKT.
  const packedFrames=stream?count:shape[2];
  if(file.size+retainedBytes+checked.data.byteLength+shape[0]*shape[1]*packedFrames*width*height*4>ADAPTER_MEMORY_DEFAULT)throw Error('媒体取込のサイズ見積りが64 MiBを超えます。前処理済みWKTを使用してください');
  opaqueFrame(frame);
  retainedBytes+=checked.data.byteLength;frames.push({...checked,timestamp:frame.timestamp??null});onProgress({frameCount:count,phase:'media-read'});
 }
 signal?.throwIfAborted();
 if(!frames.length)throw Error('画像フレームがありません');
 if(requiredFrames!==null&&frames.length!==requiredFrames)throw Error(`このVAEには ${requiredFrames} フレーム必要です。入力は ${frames.length} フレームです`);
 const shape=await checkShape(frames.length),data=new Float32Array(shape.reduce((a,b)=>a*b,1));
 for(let t=0;t<frames.length;t++){
  signal?.throwIfAborted();writeOpaqueRgbaToNcthw(frames[t],data,{frameIndex:t,frameCount:frames.length});
 }
 const inputSha256=await sha256(await file.arrayBuffer());signal?.throwIfAborted();
 const times=frames.map(frame=>frame.timestamp),context={schemaVersion:1,contextId:'media:'+crypto.randomUUID(),inputId:'media:'+crypto.randomUUID(),inputSha256,slotId,sourceFrameIndices:frames.map((_,index)=>index),...(times.every(time=>typeof time==='number'&&Number.isFinite(time))?{sourceFrameTimesSeconds:times}:{})};
 const tensor={dtype:'float32',layout:'NCTHW',shape,meaning:'rgb-unit',data,context};
 validateVaeRequest({operation:'encode',tensor,manifest});return tensor;
}

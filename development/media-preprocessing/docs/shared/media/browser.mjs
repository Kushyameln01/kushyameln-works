import {validateFrame} from './sdk.mjs';
import {inspectMediaFile,prepareImageDecode,resolveMediaLimits,FORMAT_BUDGETS} from './formats.mjs';

export const ADAPTER_MEMORY_DEFAULT=64*1024*1024;
function dimensions(width,height,limits){if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height)||width*height>limits.maxPixels)throw RangeError('DECODE_PIXEL_LIMIT');return width*height;}
function check(signal){if(signal?.aborted)throw Error('CANCELLED');}
function budget(value){if(!Number.isSafeInteger(value)||value<1024||value>512*1024*1024)throw RangeError('INVALID_ADAPTER_BUDGET');return value;}
function reserveEstimate(bytes,limit){if(!Number.isSafeInteger(bytes)||bytes>limit)throw RangeError('ADAPTER_MEMORY_BUDGET');return bytes;}
function canvas(w,h){if(typeof OffscreenCanvas!=='function')throw Error('CANVAS_UNSUPPORTED');return new OffscreenCanvas(w,h);}
function context(c){const ctx=c.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});if(!ctx)throw Error('CANVAS_UNSUPPORTED');return ctx;}
function transform(matrix){
  if(!Array.isArray(matrix)||matrix.length!==9||matrix.some(value=>typeof value!=='number'||!Number.isFinite(value)))throw Error('TRANSFORM_UNSUPPORTED');
  const [a,b,u,c,d,v,,,w]=matrix,near=(x,y)=>Math.abs(x-y)<1e-6;
  if(![a,b,c,d].every(x=>[-1,0,1].some(y=>near(x,y)))||!near(u,0)||!near(v,0)||!near(w,1)||!near(a*a+b*b,1)||!near(c*c+d*d,1)||!near(a*c+b*d,0))throw Error('TRANSFORM_UNSUPPORTED');
}

export async function* readMediaFrames(file,{signal,onMetadata=()=>{},onResource=()=>{},limits:overrides={},adapterMemoryBudgetBytes=ADAPTER_MEMORY_DEFAULT}={}){
  check(signal);const limits=resolveMediaLimits(overrides),memoryLimit=budget(adapterMemoryBudgetBytes);
  if(typeof onMetadata!=='function'||typeof onResource!=='function')throw TypeError('INVALID_ADAPTER_OPTIONS');
  const notify=event=>{try{onResource(event);}catch{}};
  const info=await inspectMediaFile(file,{limits,signal});check(signal);
  if(info.kind==='image'){
    const explicitOrientation=info.container==='WebP'&&info.orientation!==1;
    const reservationEstimateBytes=reserveEstimate(file.size*(explicitOrientation?2:1)+FORMAT_BUDGETS.metadataBytes+12*dimensions(info.codedWidth,info.codedHeight,limits),memoryLimit);
    if(typeof createImageBitmap!=='function')throw Error('IMAGE_DECODE_UNSUPPORTED');let bitmap=null,c=null,decodeInput=null;
    try{
      // Native decoding cannot be forcibly cancelled. A result arriving after abort
      // is still owned here, and is closed before cancellation is returned.
      decodeInput=await prepareImageDecode(file,info,{signal});check(signal);
      bitmap=await createImageBitmap(decodeInput,{imageOrientation:'from-image',premultiplyAlpha:'none',colorSpaceConversion:'default'});notify('bitmap-open');check(signal);
      decodeInput=null;dimensions(bitmap.width,bitmap.height,limits);if(bitmap.width!==(explicitOrientation?info.codedWidth:info.width)||bitmap.height!==(explicitOrientation?info.codedHeight:info.height))throw Error('DECODE_DIMENSION_MISMATCH');
      c=canvas(info.width,info.height);const ctx=context(c);
      if(explicitOrientation){const w=info.codedWidth,h=info.codedHeight;const matrices=[null,[1,0,0,1,0,0],[-1,0,0,1,w,0],[-1,0,0,-1,w,h],[1,0,0,-1,0,h],[0,1,1,0,0,0],[0,1,-1,0,h,0],[0,-1,-1,0,h,w],[0,-1,1,0,0,w]];ctx.setTransform(...matrices[info.orientation]);}
      ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height);
      bitmap.close();bitmap=null;notify('bitmap-close');
      onMetadata({...info,colorSpace:'srgb',alpha:'preserved after browser decode',orientationApplied:explicitOrientation?'explicit-webp-exif':'browser-from-image',sourceRetention:'caller-owned input file',resources:{reservationEstimateBytes,adapterMemoryBudgetBytes:memoryLimit,nativeMemoryMeasured:false}});
      check(signal);yield {data:pixels.data,width:c.width,height:c.height,stride:c.width*4,timestamp:null};check(signal);
    }finally{decodeInput=null;if(bitmap){try{bitmap.close();}finally{notify('bitmap-close');}}if(c){c.width=0;c.height=0;}}
    return;
  }
  if(typeof VideoDecoder==='undefined')throw Error('WEBCODECS_UNSUPPORTED');
  const {Input,BlobSource,WEBM,MP4,VideoSampleSink}=await import('./vendor/mediabunny.mjs');check(signal);
  const source=new BlobSource(file,{maxCacheSize:0,useStreamReader:false}),input=new Input({formats:[info.container==='MP4'?MP4:WEBM],source});
  const abort=()=>input.dispose();signal?.addEventListener('abort',abort,{once:true});let iterator=null,c=null,primaryFailure=false;
  try{
    notify('input-open');check(signal);const tracks=await input.getVideoTracks();check(signal);if(tracks.length!==1)throw Error('VIDEO_TRACKS_UNSUPPORTED');const track=tracks[0];
    const codec=await track.getCodec(),internalCodec=await track.getInternalCodecId();check(signal);
    if(info.container==='MP4'?(codec!=='avc'||internalCodec!=='avc1'):codec!=='vp9')throw Error('CODEC_UNSUPPORTED');
    const codedWidth=await track.getCodedWidth(),codedHeight=await track.getCodedHeight(),width=await track.getDisplayWidth(),height=await track.getDisplayHeight();check(signal);
    const codedPixels=dimensions(codedWidth,codedHeight,limits),displayPixels=dimensions(width,height,limits);
    const reservationEstimateBytes=reserveEstimate(file.size+FORMAT_BUDGETS.metadataBytes+20*codedPixels+8*displayPixels,memoryLimit);
    transform(await track.getTransformationMatrix());const rotation=await track.getRotation(),flip=await track.getFlip();check(signal);
    if(![0,90,180,270].includes(rotation)||typeof flip!=='boolean')throw Error('TRANSFORM_UNSUPPORTED');
    const duration=await track.getDurationFromMetadata();check(signal);if(typeof duration!=='number'||!Number.isFinite(duration)||duration<0||duration>limits.maxDurationSeconds)throw Error('DURATION_LIMIT');
    const config=await track.getDecoderConfig();check(signal);if(!config||typeof config.codec!=='string')throw Error('CODEC_UNSUPPORTED');
    dimensions(config.codedWidth,config.codedHeight,limits);
    if(config.codedWidth!==codedWidth||config.codedHeight!==codedHeight)throw Error('CODEC_CONFIG_UNSUPPORTED');
    if(info.container==='MP4'&&(!/^avc1\.[0-9a-f]{6}$/i.test(config.codec)||!config.description||config.description.byteLength<7||config.description.byteLength>FORMAT_BUDGETS.metadataBytes))throw Error('CODEC_CONFIG_UNSUPPORTED');
    if(!await track.canDecode())throw Error('CODEC_UNSUPPORTED');check(signal);
    const audio=(await input.getAudioTracks()).length>0;check(signal);
    onMetadata({...info,kind:'video',codec:codec==='avc'?'H.264':'VP9',codedWidth,codedHeight,width,height,duration,colorSpace:'srgb',rotation,flip,audio:audio?'present in original only':'none',sourceRetention:'caller-owned original; audio not included in PNG sequence',resources:{reservationEstimateBytes,adapterMemoryBudgetBytes:memoryLimit,sourceCacheBytes:0,nativeMemoryMeasured:false}});
    check(signal);c=canvas(width,height);const ctx=context(c);iterator=new VideoSampleSink(track).samples();let count=0,lastTime=-Infinity;
    for(;;){
      check(signal);const next=await iterator.next();if(next.done){check(signal);break;}const sample=next.value;notify('sample-open');let frame;
      try{
        check(signal);if(count>=limits.maxFrames)throw Error('FRAME_LIMIT');
        const samplePixels=dimensions(sample.codedWidth,sample.codedHeight,limits);dimensions(sample.displayWidth,sample.displayHeight,limits);
        if(sample.displayWidth!==width||sample.displayHeight!==height)throw Error('DYNAMIC_DIMENSIONS_UNSUPPORTED');
        reserveEstimate(file.size+FORMAT_BUDGETS.metadataBytes+20*samplePixels+8*displayPixels,memoryLimit);
        if(!Number.isFinite(sample.timestamp)||sample.timestamp<0||sample.timestamp<lastTime)throw Error('TIMESTAMP_ORDER');
        if(!Number.isFinite(sample.duration)||sample.duration<0||sample.timestamp+sample.duration>limits.maxDurationSeconds+1e-9)throw Error('DURATION_LIMIT');
        lastTime=sample.timestamp;count++;ctx.clearRect(0,0,width,height);sample.draw(ctx,0,0);
        frame={data:ctx.getImageData(0,0,width,height).data,width,height,stride:width*4,timestamp:sample.timestamp,duration:sample.duration};
      }finally{try{sample.close();}finally{notify('sample-close');}}
      check(signal);yield frame;check(signal);
    }
    if(count===0)throw Error('NO_VIDEO_FRAMES');
  }catch(error){primaryFailure=true;check(signal);throw error;}
  finally{
    try{input.dispose();try{await iterator?.return?.();}catch(error){if(!primaryFailure&&!signal?.aborted)throw error;}}
    finally{notify('input-close');signal?.removeEventListener('abort',abort);if(c){c.width=0;c.height=0;}}
  }
}
export async function encodePng(frame,{limits:overrides={},adapterMemoryBudgetBytes=ADAPTER_MEMORY_DEFAULT}={}){
  const limits=resolveMediaLimits(overrides),memoryLimit=budget(adapterMemoryBudgetBytes),{data,width,height,stride}=validateFrame(frame,limits.maxPixels);
  reserveEstimate(8*width*height,memoryLimit);if(typeof ImageData!=='function')throw Error('IMAGE_ENCODE_UNSUPPORTED');const c=canvas(width,height);
  try{
    let rgba;
    if(stride===width*4)rgba=new Uint8ClampedArray(data.buffer,data.byteOffset,width*height*4);
    else{rgba=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)rgba.set(data.subarray(y*stride,y*stride+width*4),y*width*4);}
    context(c).putImageData(new ImageData(rgba,width,height,{colorSpace:'srgb'}),0,0);
    const blob=await c.convertToBlob({type:'image/png'});if(blob.size>limits.maxArtifactBytes)throw Error('ARTIFACT_LIMIT');return blob;
  }finally{c.width=0;c.height=0;}
}

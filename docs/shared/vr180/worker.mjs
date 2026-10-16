import {inspectMp4,tagMp4} from './mp4.mjs';
const BUILD='vr180-b1';
let cleanup=null,controller=null,active=false;
async function digestSmall(blob){
  if(blob.size>16*1024*1024)return null;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
}
function validate(info,s){
  if(!s.confirmed)throw Error('CONFIRM_PROJECTION_AND_EYES');
  if(!['sbs','tb'].includes(s.layout)||![180,360].includes(s.fov))throw Error('INPUT_SETTINGS_UNSUPPORTED');
  if(info.projection==='mesh')throw Error('CAMERA_MESH_NOT_SUPPORTED_YET');
  if(info.pose?.some(x=>x!==0))throw Error('DIRECTION_METADATA_NOT_SUPPORTED');
  const expected=s.layout==='sbs'?2:1;
  if(info.stereoMode!==null&&info.stereoMode!==undefined&&info.stereoMode!==expected)throw Error('STEREO_METADATA_CONFLICT');
  if(info.bounds){
    const b=info.bounds,want=s.fov===180?0x40000000:0;
    if(b.top!==0||b.bottom!==0||b.left!==want||b.right!==want)throw Error('FOV_METADATA_CONFLICT');
  }
  const ew=info.width/(s.layout==='sbs'?2:1),eh=info.height/(s.layout==='tb'?2:1);
  if(!Number.isInteger(ew)||!Number.isInteger(eh)||ew/eh!==s.fov/180)throw Error('EYE_DIMENSIONS_AND_FOV_CONFLICT');
  if(s.mode==='copy'&&s.fov!==180)throw Error('COPY_REQUIRES_180_DEGREES');
  if(s.mode==='convert'&&!info.transcodeSafe)throw Error('TIMELINE_NOT_SUPPORTED: '+info.transcodeIssues.join(', '));
}
self.onmessage=async({data:m})=>{
  if(m.type==='cancel'){controller?.abort();return;}
  if(m.type==='release'){await cleanup?.();cleanup=null;self.close();return;}
  if(m.type!=='run'||active)return;active=true;controller=new AbortController();
  const {operationId,inputRevision,file,settings}=m;
  const send=(type,extra)=>self.postMessage({type,operationId,inputRevision,...extra});
  const clock=performance.now(),timings={},events=[];
  const mark=async(name,fn)=>{const start=performance.now();const r=await fn();timings[name]=performance.now()-start;return r;};
  try{
    const info=await mark('inspect',()=>inspectMp4(file,{signal:controller.signal}));
    if(settings.mode==='inspect'){send('result',{result:{info,build:BUILD}});return;}
    validate(info,settings);
    const inputHash=await mark('inputHash',()=>digestSmall(file));
    let media=file,metrics=null;
    if(settings.mode==='convert'){
      const {convertStereo}=await mark('transformLoad',()=>import('./transform.mjs'));
      const result=await mark('convert',()=>convertStereo(file,settings,{signal:controller.signal,jobId:operationId,onProgress:p=>send('progress',{progress:p}),onMetrics:m=>events.push(m)}));
      media=result.file;cleanup=result.cleanup;metrics=result.metrics;
    }else if(settings.mode!=='copy')throw Error('MODE_UNSUPPORTED');
    const layout=settings.mode==='copy'?settings.layout:'sbs';
    const blob=await mark('metadata',()=>tagMp4(media,{layout,signal:controller.signal}));
    const outputInfo=await mark('outputInspect',()=>inspectMp4(blob,{signal:controller.signal}));
    const outputHash=await mark('outputHash',()=>digestSmall(blob));timings.outputPrepared=performance.now()-clock;
    const receipt={schemaVersion:1,build:BUILD,operationId,inputRevision,status:'prepared',settings,input:{bytes:file.size,sha256:inputHash,info},output:{bytes:blob.size,sha256:outputHash,info:outputInfo},hashNote:'SHA-256 calculated only for files <=16MiB; larger hashes remain null',timings,metrics,events,clock:'performance.now, worker',nativePeakBytes:null,audioMetadataCoverage:settings.mode==='copy'?'original audio track boxes preserved':'AAC payload, decoder configuration and supported timeline retained; seek-preroll sample groups are not reproduced by the muxer; seek quality unverified',saveWriteCommitted:false,saveCompleted:false,downloadRecovered:false,targetVRPlayerVerified:false};
    send('result',{result:{blob,receipt,info:outputInfo}});
  }catch(e){try{await cleanup?.();}catch(cleanError){send('cleanup-error',{error:String(cleanError)});}cleanup=null;send('error',{error:e?.message||String(e)});}
};

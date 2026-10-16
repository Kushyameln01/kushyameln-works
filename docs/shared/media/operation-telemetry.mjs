import {makeOperationEvent,sizeBandForPixels,TELEMETRY_BUILDS} from './telemetry.mjs';
import {MEDIA_KERNELS} from './kernel/registry.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KINDS=Object.freeze({started:'start',completed:'complete',failed:'failed',cancelled:'cancelled'});
const ERRORS=Object.freeze({
  POLICY_ALIGNMENT_UNSUPPORTED:'unsupported',SELECTION_ALIGNMENT_UNSUPPORTED:'unsupported',SELECTION_REQUIRED_TIMESTAMP_MISSING:'input_invalid',SELECTION_REQUIRED_TIMESTAMPS:'input_invalid',SELECTION_TIMELINE:'input_invalid',SELECTION_CALLBACKS:'input_invalid',SELECTION_OPTIONS:'input_invalid',SELECTION_LIMITS:'input_invalid',SELECTION_METADATA:'input_invalid',SELECTION_FRAME:'input_invalid',SELECTION_SEQUENCE:'input_invalid',SELECTION_TIMESTAMP_ORDER:'input_invalid',SELECTION_EMPTY:'input_invalid',SELECTION_MEMORY_BUDGET:'budget_exceeded',SELECTION_METADATA_LIMIT:'budget_exceeded',SELECTION_PIXEL_LIMIT:'budget_exceeded',SELECTION_FRAME_LIMIT:'budget_exceeded',SELECTION_DURATION_LIMIT:'budget_exceeded',
  INVALID_JPEG:'input_invalid',INVALID_WEBP:'input_invalid',INVALID_MP4:'input_invalid',INVALID_EXIF:'input_invalid',TRUNCATED_MEDIA:'input_invalid',INVALID_LIMITS:'input_invalid',INVALID_ADAPTER_OPTIONS:'input_invalid',INVALID_ADAPTER_BUDGET:'input_invalid',
  ANIMATION_UNSUPPORTED:'unsupported',JPEG_MODE_UNSUPPORTED:'unsupported',ORIENTATION_UNSUPPORTED:'unsupported',CANVAS_UNSUPPORTED:'unsupported',TRANSFORM_UNSUPPORTED:'unsupported',IMAGE_DECODE_UNSUPPORTED:'unsupported',IMAGE_ENCODE_UNSUPPORTED:'unsupported',VIDEO_TRACKS_UNSUPPORTED:'unsupported',CODEC_CONFIG_UNSUPPORTED:'unsupported',MP4_BRAND_UNSUPPORTED:'unsupported',FRAGMENTED_MP4_UNSUPPORTED:'unsupported',
  ADAPTER_MEMORY_BUDGET:'budget_exceeded',METADATA_LIMIT:'budget_exceeded',DECODE_DIMENSION_MISMATCH:'decode_error',NO_VIDEO_FRAMES:'decode_error',
  INVALID_PNG:'input_invalid',FRAME_DIMENSIONS:'input_invalid',FRAME_BYTES:'input_invalid',TIMESTAMP_ORDER:'input_invalid',FRAME_DURATION:'input_invalid',ALIGNMENT_DIMENSIONS:'input_invalid',ALIGNMENT_BYTES:'input_invalid',ALIGNMENT_ROI:'input_invalid',ALIGNMENT_POLICY:'input_invalid',ALIGNMENT_OPTIONS:'input_invalid',ALIGNMENT_REFERENCE:'input_invalid',REFERENCE_HASH:'input_invalid',
  FORMAT_UNSUPPORTED:'unsupported',WEBCODECS_UNSUPPORTED:'unsupported',CODEC_UNSUPPORTED:'unsupported',DYNAMIC_DIMENSIONS_UNSUPPORTED:'unsupported',SIMD_UNSUPPORTED:'unsupported',POLICY_UNSUPPORTED:'unsupported',
  FILE_LIMIT:'budget_exceeded',DECODE_PIXEL_LIMIT:'budget_exceeded',DURATION_LIMIT:'budget_exceeded',FRAME_LIMIT:'budget_exceeded',ARTIFACT_LIMIT:'budget_exceeded',SDK_MEMORY_BUDGET:'budget_exceeded',
  DECODE_FAILED:'decode_error',ENCODE_FAILED:'encode_error',COMPUTE_FAILED:'kernel_error',OPERATION_TIMEOUT:'timeout',TIMEOUT:'timeout'
});

// One adapter observes one SDK operation. It never retains or forwards the raw event,
// media, metadata object, or error. kernelHash identifies only the registered LBP core;
// operation total includes every SDK stage and ordered onFrame callback, not ZIP work.
export function createOperationTelemetry({client,operationId,task}={}){
  if(typeof client?.enqueue!=='function'||!['image-lbp','video-lbp'].includes(task))throw TypeError('INVALID_TELEMETRY_OPTIONS');
  const expectedKind=task==='image-lbp'?'image':'video',eligible=typeof operationId==='string'&&UUID.test(operationId),reasons={};
  let sizeBand='unknown',observed=0,enqueued=0,skipped=0,startSeen=false,terminalSeen=false,terminal=null,modeCaptured=false,featureMode;
  function skip(reason){skipped++;reasons[reason]=(reasons[reason]??0)+1;return false;}
  function onMetadata(value){
    try{
      if(!value||value.kind!==expectedKind)return false;
      const {width,height}=value,pixels=width*height;
      if(!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1||!Number.isSafeInteger(pixels))return false;
      sizeBand=sizeBandForPixels(pixels);return true;
    }catch{return false;}
  }
  function onEvent(value){
    observed++;
    try{
      if(!eligible)return skip('operation_id');
      if(!value||value.operationId!==operationId)return skip('foreign_operation');
      const kind=Object.hasOwn(KINDS,value.type)?KINDS[value.type]:null;
      if(!kind)return skip('event_type');
      const variant=value.wasmVariant,hash=variant==='unselected'?null:MEDIA_KERNELS[variant]?.sha256;
      if(typeof value.eventId!=='string'||!UUID.test(value.eventId)||value.taskVersion!==1||!TELEMETRY_BUILDS.includes(value.buildId)||!['scalar','simd','unselected'].includes(variant)||value.kernelHash!==hash||![1,2,3,4].includes(value.workerCount))return skip('event_schema');
      if(kind!=='start'&&(typeof value.elapsedMs!=='number'||!Number.isFinite(value.elapsedMs)||value.elapsedMs<0||value.elapsedMs>3600000))return skip('event_schema');
      const mode=Object.hasOwn(value,'featureMode')?value.featureMode:null;
      if(mode!==null&&!['all','alignment','exact-duplicates'].includes(mode))return skip('feature_mode');
      if(modeCaptured&&mode!==featureMode)return skip('feature_mode_changed');
      if(!modeCaptured){featureMode=mode;modeCaptured=true;}
      const wireTask=mode===null?task:task+'-'+mode;
      if(kind==='start'?startSeen:terminalSeen)return skip('duplicate_phase');
      if(kind==='start')startSeen=true;else{terminalSeen=true;terminal=kind;}
      if(kind==='complete'&&sizeBand==='unknown')return skip('size_unknown');
      const durationsMs=kind==='start'?{}:{total:value.elapsedMs};
      if(kind==='complete')for(const key of ['copy','queue','compute']){const v=value.durationsMs?.[key];if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=3600000)durationsMs[key]=v;}
      const event=makeOperationEvent({eventId:value.eventId,operationId,kind,task:wireTask,build:value.buildId,variant,workers:value.workerCount,sizeBand,cacheState:'unknown',errorCode:kind==='failed'?(Object.hasOwn(ERRORS,value.errorCode)?ERRORS[value.errorCode]:'internal'):null,durationsMs});
      if(!client.enqueue(event))return skip('sender_rejected');enqueued++;return true;
    }catch{return skip('adapter_error');}
  }
  function status(){return Object.freeze({observed,enqueued,skipped,sizeBand,startSeen,terminal,featureMode:modeCaptured?featureMode:null,reasons:Object.freeze({...reasons})});}
  return Object.freeze({onEvent,onMetadata,status});
}

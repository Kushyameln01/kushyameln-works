import {PAPER_TASK_TYPES,inspectPaperPayload,snapshotPaperPayload,paperInputBytes,paperInfo,paperResultShape,validPaperResult,paperResultBytes,freezePaperResult,transferPaperInput,preparePaperKernel} from '../media/paper/pool-task.mjs';
const isPaper=type=>PAPER_TASK_TYPES.includes(type);
import {validateRequest,WASM_SHA256} from './protocol.mjs';
import {prepareKernelModule} from './kernel.mjs';
import {MEDIA_KERNELS,prepareMediaKernel} from '../media/kernel/media-kernel.mjs';

import {inspectAlignmentPayload,snapshotAlignment,alignmentInfo,alignmentInputBytes,validAlignmentResult,prepareAlignmentKernel} from '../media/alignment/pool-task.mjs';

export const MAX_MEDIA_INPUT_BYTES=4*1024*1024;
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function inspectTaskRequest(input) {
  if(input?.taskType==='ft-magnitude-batch')return validateRequest(input,{copy:false});
  if(!input||input.protocolVersion!==1||!['media-lbp-tile','media-lbp-chunk','media-align',...PAPER_TASK_TYPES].includes(input.taskType)||input.taskVersion!==1)throw TypeError('Unsupported task/version');
  if(typeof input.jobId!=='string'||!/^[A-Za-z0-9_.:-]{1,64}$/.test(input.jobId)||!int(input.inputRevision,0,Number.MAX_SAFE_INTEGER))throw TypeError('Invalid job identity');
  if(!['scalar','simd'].includes(input.wasmVariant))throw TypeError('Explicit scalar/simd variant required');
  const timeoutMs=input.limits?.timeoutMs??30000;if(!int(timeoutMs,1,30000))throw RangeError('Invalid timeout');
  if(isPaper(input.taskType)){
    if(input.wasmVariant!=='scalar')throw TypeError('Paper is scalar only');
    return {protocolVersion:1,taskType:input.taskType,taskVersion:1,jobId:input.jobId,inputRevision:input.inputRevision,wasmVariant:'scalar',kernelHash:paperInfo().sha256,payload:inspectPaperPayload(input.taskType,input.payload),limits:{timeoutMs}};
  }
  if(input.taskType==='media-align'){
    if(input.wasmVariant!=='scalar')throw TypeError('Alignment is scalar only');
    return {protocolVersion:1,taskType:input.taskType,taskVersion:1,jobId:input.jobId,inputRevision:input.inputRevision,wasmVariant:'scalar',kernelHash:alignmentInfo().sha256,payload:inspectAlignmentPayload(input.payload),limits:{timeoutMs}};
  }
  if(input.taskType==='media-lbp-chunk'){
    const units=input.payload?.units;if(!Array.isArray(units)||units.length<1||units.length>4)throw RangeError('Chunk requires 1..4 units');
    let bytes=0;const seen=new Set();
    const normalized=Array.from(units,u=>{
      if(!int(u?.frameSequence,0,Number.MAX_SAFE_INTEGER)||!int(u?.tileIndex,0,Number.MAX_SAFE_INTEGER))throw RangeError('Invalid unit identity');
      const key=`${u.frameSequence}:${u.tileIndex}`;if(seen.has(key))throw RangeError('Duplicate unit');seen.add(key);
      const tile=inspectTile(u.tile);bytes+=tile.data.byteLength;if(bytes>MAX_MEDIA_INPUT_BYTES)throw RangeError('Chunk input budget');
      return {frameSequence:u.frameSequence,tileIndex:u.tileIndex,tile};
    });
    return {protocolVersion:1,taskType:input.taskType,taskVersion:1,jobId:input.jobId,inputRevision:input.inputRevision,wasmVariant:input.wasmVariant,kernelHash:MEDIA_KERNELS[input.wasmVariant].sha256,payload:{units:normalized},limits:{timeoutMs}};
  }
  return {protocolVersion:1,taskType:input.taskType,taskVersion:1,jobId:input.jobId,inputRevision:input.inputRevision,wasmVariant:input.wasmVariant,kernelHash:MEDIA_KERNELS[input.wasmVariant].sha256,payload:inspectTile(input.payload),limits:{timeoutMs}};
}
function inspectTile(p={}){
  const r=p.region??{};
  if(p.pixelFormat!=='gray8'||!(p.data instanceof Uint8Array)||!(p.data.buffer instanceof ArrayBuffer)||p.data.buffer.resizable||p.data.byteLength>MAX_MEDIA_INPUT_BYTES)throw TypeError('Expected bounded, fixed gray8 bytes');
  for(const key of ['width','height','stride','imageWidth','imageHeight'])if(!int(p[key],1,16777216))throw RangeError('Invalid media dimensions');
  if(p.stride<p.width||p.stride*p.height>p.data.byteLength||p.width*p.height>MAX_MEDIA_INPUT_BYTES)throw RangeError('Invalid stride/byte length');
  if(!int(p.originX,0,p.imageWidth-p.width)||!int(p.originY,0,p.imageHeight-p.height))throw RangeError('Tile outside image');
  if(!int(r.x,0,p.width-1)||!int(r.y,0,p.height-1)||!int(r.width,1,p.width-r.x)||!int(r.height,1,p.height-r.y))throw RangeError('Invalid owned region');
  // Every owned non-image-edge pixel must have its radius-1 neighborhood in this tile.
  if((p.originX+r.x>0&&r.x===0)||(p.originY+r.y>0&&r.y===0)||(p.originX+r.x+r.width<p.imageWidth&&r.x+r.width===p.width)||(p.originY+r.y+r.height<p.imageHeight&&r.y+r.height===p.height))throw RangeError('Missing LBP halo');
  return {pixelFormat:'gray8',width:p.width,height:p.height,stride:p.stride,imageWidth:p.imageWidth,imageHeight:p.imageHeight,originX:p.originX,originY:p.originY,region:{x:r.x,y:r.y,width:r.width,height:r.height},data:p.data};
}
const copyTile=p=>({...p,region:{...p.region},data:new Uint8Array(p.data)});
export function snapshotTaskRequest(r){return {...r,payload:isPaper(r.taskType)?snapshotPaperPayload(r.taskType,r.payload):r.taskType==='media-align'?snapshotAlignment(r.payload):r.taskType==='ft-magnitude-batch'?{masks:r.payload.masks.slice(),weights:r.payload.weights.slice()}:r.taskType==='media-lbp-chunk'?{units:r.payload.units.map(u=>({...u,tile:copyTile(u.tile)}))}:copyTile(r.payload)};}
export function inputBytes(r){if(isPaper(r.taskType))return paperInputBytes(r.taskType,r.payload);return r.taskType==='media-align'?alignmentInputBytes(r.payload):r.taskType==='ft-magnitude-batch'?(r.payload.masks.length+r.payload.weights.length)*8:r.taskType==='media-lbp-chunk'?r.payload.units.reduce((n,u)=>n+u.tile.data.byteLength,0):r.payload.data.byteLength;}
export function kernelInfo(r){if(isPaper(r.taskType))return paperInfo();return r.taskType==='media-align'?alignmentInfo():r.taskType==='ft-magnitude-batch'?{sha256:WASM_SHA256,variant:'scalar',abi:'ft-v1',key:`ft-v1:${WASM_SHA256}:scalar`}:{...MEDIA_KERNELS[r.wasmVariant],variant:r.wasmVariant,key:`${MEDIA_KERNELS[r.wasmVariant].abi}:${r.kernelHash}:${r.wasmVariant}`};}
const tileShape=p=>({...p.region,interiorCount:Math.max(0,Math.min(p.originX+p.region.x+p.region.width,p.imageWidth-1)-Math.max(p.originX+p.region.x,1))*Math.max(0,Math.min(p.originY+p.region.y+p.region.height,p.imageHeight-1)-Math.max(p.originY+p.region.y,1))});
export function resultShape(r){if(isPaper(r.taskType))return paperResultShape(r.taskType,r.payload);return r.taskType==='media-align'?{width:r.payload.width,height:r.payload.height}:r.taskType==='ft-magnitude-batch'?{length:r.payload.masks.length}:r.taskType==='media-lbp-chunk'?{units:r.payload.units.map(u=>({frameSequence:u.frameSequence,tileIndex:u.tileIndex,...tileShape(u.tile)}))}:tileShape(r.payload);}
export function validTaskResult(taskType,shape,result){
  if(isPaper(taskType))return validPaperResult(taskType,shape,result);
  if(taskType==='media-align')return validAlignmentResult(shape,result);
  if(taskType==='ft-magnitude-batch')return Array.isArray(result)&&result.length===shape.length&&Array.from(result).every(x=>typeof x==='number'&&Number.isFinite(x));
  if(taskType==='media-lbp-chunk')return !!(result&&Array.isArray(result.units)&&result.units.length===shape.units.length&&result.units.every((u,i)=>u?.frameSequence===shape.units[i].frameSequence&&u?.tileIndex===shape.units[i].tileIndex&&validTaskResult('media-lbp-tile',shape.units[i],u)));
  return result&&result.width===shape.width&&result.height===shape.height&&result.codes instanceof Uint8Array&&result.codes.byteLength===shape.width*shape.height&&result.histogram instanceof Uint32Array&&result.histogram.length===256&&result.histogram.reduce((a,b)=>a+b,0)===shape.interiorCount;
}
export function resultBytes(result){if(result?.kind==='media-paper-model'||result?.kind==='media-paper-features')return paperResultBytes(result);return result?.kind==='media-alignment'?(result.derivative?result.derivative.data.byteLength+result.derivative.validMask.byteLength:0):Array.isArray(result)?result.length*8:result?.units?result.units.reduce((n,u)=>n+resultBytes(u),0):result?result.codes.byteLength+result.histogram.byteLength:0;}
export function freezeTaskResult(result){if(result?.kind==='media-paper-model'||result?.kind==='media-paper-features')return freezePaperResult(result);if(result?.kind==='media-alignment'){Object.freeze(result.decision);if(result.derivative)Object.freeze(result.derivative);}if(result?.units){result.units.forEach(Object.freeze);Object.freeze(result.units);}return result===undefined?undefined:Object.freeze(result);}
export function transferTaskInput(r){if(isPaper(r.taskType))return transferPaperInput(r.taskType,r.payload);return r.taskType==='media-align'?[r.payload.referenceCodes.buffer,r.payload.currentCodes.buffer,r.payload.data.buffer]:r.taskType==='media-lbp-chunk'?r.payload.units.map(u=>u.tile.data.buffer):r.taskType==='media-lbp-tile'?[r.payload.data.buffer]:[];}
export function prepareTaskModule(options){if(isPaper(options.taskType))return preparePaperKernel(options);return options.taskType==='media-align'?prepareAlignmentKernel(options):options.taskType!=='ft-magnitude-batch'?prepareMediaKernel({...options,variant:options.wasmVariant}):prepareKernelModule(options);}

import {instantiateKernel} from './kernel.mjs';
import {instantiateMediaKernel} from '../media/kernel/media-kernel.mjs';
import {instantiateAlignmentKernel} from '../media/alignment/alignment.mjs';
import {runAlignment} from '../media/alignment/pool-task.mjs';
import {instantiatePaperKernel,runPaperTask,transferPaperResult} from '../media/paper/pool-task.mjs';

export function instantiateTask(request,module){
  return isPaper(request.taskType)?instantiatePaperKernel(module):request.taskType==='media-align'?instantiateAlignmentKernel(module):request.taskType!=='ft-magnitude-batch'?instantiateMediaKernel(module,{variant:request.wasmVariant}):instantiateKernel(module);
}
export function executeTask(request,kernel){
  if(isPaper(request.taskType))return runPaperTask(kernel,request.taskType,request.payload);
  if(request.taskType==='media-align')return runAlignment(kernel,request.payload);
  if(request.taskType==='ft-magnitude-batch')return request.payload.masks.map(mask=>kernel.magnitude(mask,request.payload.weights));
  const units=request.taskType==='media-lbp-chunk'?request.payload.units:[{tile:request.payload}];
  const values=units.map(unit=>{
    const p=unit.tile,r=p.region,allCodes=kernel.run(p),codes=new Uint8Array(r.width*r.height),histogram=new Uint32Array(256);
    for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){
      const code=allCodes[(y+r.y)*p.width+x+r.x];codes[y*r.width+x]=code;
      const gx=p.originX+r.x+x,gy=p.originY+r.y+y;
      if(gx>0&&gx<p.imageWidth-1&&gy>0&&gy<p.imageHeight-1)histogram[code]++;
    }
    return {...(request.taskType==='media-lbp-chunk'?{frameSequence:unit.frameSequence,tileIndex:unit.tileIndex}:{}),width:r.width,height:r.height,codes,histogram};
  });
  return request.taskType==='media-lbp-chunk'?{units:values}:values[0];
}
export function transferTaskResult(result){
  if(result?.kind==='media-paper-model'||result?.kind==='media-paper-features')return transferPaperResult(result);
  if(result?.kind==='media-alignment')return result.derivative?[result.derivative.data.buffer,result.derivative.validMask.buffer]:[];
  if(Array.isArray(result))return [];
  return result?.units?result.units.flatMap(transferTaskResult):result?[result.codes.buffer,result.histogram.buffer]:[];
}
export function taskInputCount(request,result){
  return isPaper(request.taskType)?(request.taskType==='media-paper-fit'?request.payload.samples.length:1):request.taskType==='media-align'?request.payload.width*request.payload.height:request.taskType==='media-lbp-chunk'?request.payload.units.reduce((n,u)=>n+u.tile.width*u.tile.height,0):request.taskType==='media-lbp-tile'?request.payload.width*request.payload.height:result.length;
}

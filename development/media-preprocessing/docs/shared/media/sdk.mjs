import {createComputePool} from '../compute/pool.mjs';
import {BUILD_ID} from '../compute/protocol.mjs';
import {MEDIA_KERNELS,supportsSIMD} from './kernel/media-kernel.mjs';
import {createExactFrameSelector} from './selection.mjs';

import {createAlignmentSession,LBP_CONVENTION} from './alignment/session.mjs';
export {LBP_CONVENTION};

export const MEDIA_BUILD='media-foundation-b2';
export const PROTOTYPE_LIMITS=Object.freeze({maxPixels:1048576,maxFrames:100,maxDurationSeconds:10,maxFileBytes:4194304,maxArtifactBytes:8388608});
const frameTypedPrototype=Object.getPrototypeOf(Uint8Array.prototype),frameGetters=Object.fromEntries(['buffer','byteOffset','byteLength','length'].map(k=>[k,Object.getOwnPropertyDescriptor(frameTypedPrototype,k).get])),frameResizable=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'resizable')?.get;
const frameProperty=(a,k)=>Reflect.apply(frameGetters[k],a,[]);
export function validateFrame(frame,maxPixels=PROTOTYPE_LIMITS.maxPixels){
  const {data,width,height}=frame??{},stride=frame?.stride??width*4;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>maxPixels||!Number.isSafeInteger(stride)||stride<width*4)throw RangeError('FRAME_DIMENSIONS');
  if(!(data instanceof Uint8Array||data instanceof Uint8ClampedArray))throw RangeError('FRAME_BYTES');
  const buffer=frameProperty(data,'buffer'),bytes=frameProperty(data,'byteLength');
  if(!(buffer instanceof ArrayBuffer)||(frameResizable&&Reflect.apply(frameResizable,buffer,[]))||bytes<stride*height||bytes>maxPixels*4)throw RangeError('FRAME_BYTES');
  return {data:new Uint8Array(buffer,frameProperty(data,'byteOffset'),frameProperty(data,'length')),width,height,stride};
}
export function rgbaToGray(frame,maxPixels=PROTOTYPE_LIMITS.maxPixels){
  const {data,width,height,stride}=validateFrame(frame,maxPixels),gray=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*stride+x*4,a=data[i+3];
    const r=Math.floor((data[i]*a+255*(255-a)+127)/255),g=Math.floor((data[i+1]*a+255*(255-a)+127)/255),b=Math.floor((data[i+2]*a+255*(255-a)+127)/255);
    gray[y*width+x]=(77*r+150*g+29*b+128)>>8;
  }
  return gray;
}
export function createMediaProcessor({pool:providedPool,concurrency=4,moduleReuse=false,workerMode='bundle',variant='auto',onEvent=()=>{},chunkUnits=4,lookahead=4,memoryBudgetBytes=16*1024*1024,limits:givenLimits={}}={}){
  if(!['auto','scalar','simd'].includes(variant)||typeof onEvent!=='function')throw TypeError('Invalid processor options');
  if(![1,2,4].includes(chunkUnits)||!Number.isInteger(lookahead)||lookahead<1||lookahead>16||!Number.isSafeInteger(memoryBudgetBytes)||memoryBudgetBytes<1024||memoryBudgetBytes>256*1024*1024)throw RangeError('Invalid resource options');
  const limits=Object.freeze({...PROTOTYPE_LIMITS,...givenLimits});
  for(const key of Object.keys(limits))if(!(key in PROTOTYPE_LIMITS)||!Number.isSafeInteger(limits[key])||limits[key]<1)throw RangeError('Invalid limits');
  if(limits.maxPixels>16777216||limits.maxFrames>100000||limits.maxDurationSeconds>86400)throw RangeError('Limits outside supported bounds');
  let liveBytes=0,peakBytes=0;
  function reserve(op,bytes){if(liveBytes+bytes>memoryBudgetBytes)throw RangeError('SDK_MEMORY_BUDGET');liveBytes+=bytes;op.liveBytes+=bytes;peakBytes=Math.max(peakBytes,liveBytes);op.peakBytes=Math.max(op.peakBytes,op.liveBytes);}
  function release(op,bytes){liveBytes-=bytes;op.liveBytes-=bytes;}
  const simd=supportsSIMD(),selectedVariant=variant==='auto'?(simd?'simd':'scalar'):variant;
  if(selectedVariant==='simd'&&!simd)throw Error('SIMD_UNSUPPORTED');
  const pool=providedPool??createComputePool({concurrency,moduleReuse,workerMode}),owned=!providedPool,operations=new Map();let disposed=false;
  const capabilities=Object.freeze({buildId:MEDIA_BUILD,computeBuild:BUILD_ID,workerMode:pool.getStatus().workerMode,taskVersion:1,frames:'sRGB RGBA8',lbp:'3x3 >= NW,N,NE,E,SE,S,SW,W',variant:selectedVariant,simdSupported:simd,fallbackReason:variant==='auto'&&!simd?'SIMD_UNSUPPORTED':null,selection:['all','exact-duplicates'],alignment:['reference-first-translation','external-reference-translation'],lbpConvention:LBP_CONVENTION,paperOptimization:false,paperAPI:'separate explicit training/inference in paper/sdk.mjs',limits,chunkUnits,lookahead,memoryBudgetBytes,telemetry:'caller-controlled event adapter',output:'ordered frame callback; caller owns outputs'});
  function emit(op,type,extra={}){const e=Object.freeze({eventId:crypto.randomUUID(),operationId:op.id,type,buildId:MEDIA_BUILD,computeBuild:BUILD_ID,taskVersion:1,kernelHash:MEDIA_KERNELS[selectedVariant].sha256,wasmVariant:selectedVariant,workerCount:pool.getStatus().concurrency,featureMode:op.featureMode,elapsedMs:performance.now()-op.start,...extra});if(op.events.length>=128)op.events.shift();op.events.push(e);try{onEvent(e);}catch{}return e;}
  function check(op){if(op.controller.signal.aborted)throw Error(op.timeout?'OPERATION_TIMEOUT':'CANCELLED');}
  function measureJob(op,result){for(const [stage,key] of [['queue','queueMs'],['compute','computeMs']]){const v=result.metrics?.[key];if(op.durationsMs[stage]!==null&&Number.isFinite(v)&&v>=0)op.durationsMs[stage]+=v;else op.durationsMs[stage]=null;}}
  function cancel(id){const op=operations.get(id);if(!op)return false;op.controller.abort();for(const job of op.children)pool.cancel(job);return true;}
  async function analyzeWave(wave,op){
    const began=performance.now(),units=[];
    for(const f of wave){
      const {width,height}=f.shape;
      for(let start=0,index=0;start<height;index++){
        const rows=Math.max(1,Math.min(256,Math.floor(4194304/width)-2));
        const end=Math.min(start+rows,height),top=Math.max(0,start-1),bottom=Math.min(height,end+1);
        units.push({frame:f,frameSequence:f.sequence,tileIndex:index,start,end,top,bottom,inputBytes:(bottom-top)*width,outputBytes:(end-start)*width+1024});start=end;
      }
    }
    let cursor=0;
    while(cursor<units.length){
      check(op);const groups=[];let batchBytes=0;
      while(groups.length<pool.getStatus().concurrency&&cursor<units.length){
        const group=[];let bytes=0,cost=0;
        while(group.length<chunkUnits&&cursor<units.length){
          const u=units[cursor],nextCost=u.inputBytes+u.outputBytes;
          if(bytes+u.inputBytes>4194304||liveBytes+batchBytes+cost+nextCost>memoryBudgetBytes)break;
          group.push(u);bytes+=u.inputBytes;cost+=nextCost;cursor++;
        }
        if(!group.length)break;groups.push(group);batchBytes+=cost;
      }
      if(!groups.length)throw RangeError('SDK_MEMORY_BUDGET');
      reserve(op,batchBytes);let batch;
      try{
        const requests=groups.map(group=>{
          const tiles=group.map(u=>{
            const f=u.frame,{width,height}=f.shape,t=performance.now(),data=f.gray.slice(u.top*width,u.bottom*width);f.tileCopyMs+=performance.now()-t;
            return {frameSequence:u.frameSequence,tileIndex:u.tileIndex,tile:{pixelFormat:'gray8',data,width,height:u.bottom-u.top,stride:width,imageWidth:width,imageHeight:height,originX:0,originY:u.top,region:{x:0,y:u.start-u.top,width,height:u.end-u.start}}};
          });
          const useTile=chunkUnits===1;
          return {protocolVersion:1,taskType:useTile?'media-lbp-tile':'media-lbp-chunk',taskVersion:1,jobId:crypto.randomUUID(),inputRevision:op.revision,wasmVariant:selectedVariant,payload:useTile?tiles[0].tile:{units:tiles}};
        });
        batch=pool.submitBatch(requests);for(const id of batch.jobIds)op.children.add(id);
        // Pool notifications can synchronously reenter cancel() before these IDs exist.
        if(op.controller.signal.aborted)for(const id of batch.jobIds)pool.cancel(id);
        check(op);
        // Pool owns copied/transferable snapshots. These temporary SDK inputs can now die.
        requests.length=0;
        const results=await batch.promise;check(op);
        for(let i=0;i<results.length;i++){
          const r=results[i];if(r.status!=='succeeded')throw Error(r.errorCode??'COMPUTE_FAILED');
          measureJob(op,r);
          const outputs=r.result.units??[r.result];op.jobCount++;
          for(let j=0;j<outputs.length;j++){
            const u=groups[i][j],f=u.frame,value=outputs[j];f.codes.set(value.codes,u.start*f.shape.width);
            for(let k=0;k<256;k++)f.histogram[k]+=value.histogram[k];
            if(!f.jobs.some(x=>x.jobId===r.jobId))f.jobs.push({jobId:r.jobId,...r.metrics});
          }
        }
      }finally{if(batch)for(const id of batch.jobIds){op.children.delete(id);pool.releaseResult(id);}release(op,batchBytes);}
    }
    const elapsed=performance.now()-began;for(const f of wave)op.durationsMs.copy+=f.tileCopyMs;
    return {elapsed,outputs:wave.map(f=>({sequence:f.sequence,timestamp:f.frame.timestamp??null,duration:f.frame.duration??null,width:f.shape.width,height:f.shape.height,stride:f.shape.stride,data:f.shape.data,sceneId:f.frame.sceneId??null,codes:f.codes,histogram:f.histogram,mapping:{coordinateSpace:'display-pixels',sourceToOutput:[1,0,0,1,0,0],crop:[0,0,f.shape.width,f.shape.height]},metrics:{grayMs:f.grayMs,tileCopyMs:f.tileCopyMs,totalMs:elapsed,sharedWaveWall:wave.length>1,jobs:f.jobs},unapplied:['alignment','frame-selection','paper-optimization']}))};
  }
  async function process({frames,onFrame,onOmitted,operationId=crypto.randomUUID(),inputRevision=0,signal,timeoutMs=60000,policy={mode:'all'},alignment}={}){
    if(disposed)throw Error('PROCESSOR_DISPOSED');if(typeof frames!=='function'&&!frames?.[Symbol.asyncIterator]&&!frames?.[Symbol.iterator])throw TypeError('Frame iterable required');
    if(typeof onFrame!=='function'||typeof operationId!=='string'||!/^[A-Za-z0-9_.:-]{1,64}$/.test(operationId)||operations.has(operationId)||!Number.isSafeInteger(inputRevision)||inputRevision<0)throw TypeError('Invalid operation');
    if(!['all','exact-duplicates'].includes(policy?.mode)||Object.keys(policy).some(k=>!(policy.mode==='all'?['mode']:['mode','anchorEvery','requiredTimestamps','budgetBytes']).includes(k)))throw Error('POLICY_UNSUPPORTED');
    const selected=policy.mode==='exact-duplicates',selectionOptions=selected?{...policy}:null;
    if(selected){if(alignment)throw Error('POLICY_ALIGNMENT_UNSUPPORTED');if(typeof onOmitted!=='function')throw TypeError('SELECTION_CALLBACKS');delete selectionOptions.mode;if(Array.isArray(selectionOptions.requiredTimestamps))selectionOptions.requiredTimestamps=selectionOptions.requiredTimestamps.slice();}
    if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw RangeError('Invalid operation timeout');
    const op={id:operationId,featureMode:alignment?'alignment':selected?'exact-duplicates':'all',revision:inputRevision,start:performance.now(),controller:new AbortController(),children:new Set(),durationsMs:{copy:0,queue:0,compute:0},events:[],timeout:false,liveBytes:0,peakBytes:0,jobCount:0};operations.set(op.id,op);
    const abort=()=>cancel(op.id);let timer;let count=0,lastTime=-Infinity,firstTime=null,computeWallMs=0,alignmentWallMs=0,outputMs=0;
    let aligner=null,selector=null,selectionResult=null;
    try{
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();timer=setTimeout(()=>{op.timeout=true;cancel(op.id);},timeoutMs);emit(op,'started');
      if(selected)selector=createExactFrameSelector({...selectionOptions,onFrame,onOmitted,limits,signal:op.controller.signal});
      if(alignment)aligner=await createAlignmentSession({options:alignment,revision:inputRevision,reserve:bytes=>reserve(op,bytes),release:bytes=>release(op,bytes),check:()=>check(op),submit:async payload=>{
        let batch;
        try{
          check(op);batch=pool.submitBatch([{protocolVersion:1,taskType:'media-align',taskVersion:1,jobId:crypto.randomUUID(),inputRevision:op.revision,wasmVariant:'scalar',payload}]);
          for(const id of batch.jobIds){op.children.add(id);if(op.controller.signal.aborted)pool.cancel(id);}check(op);
          const [result]=await batch.promise;check(op);if(result.status!=='succeeded')throw Error(result.errorCode??'ALIGNMENT_FAILED');measureJob(op,result);op.jobCount++;return result;
        }finally{if(batch)for(const id of batch.jobIds){op.children.delete(id);pool.releaseResult(id);}}
      }});
      const source=typeof frames==='function'?frames(op.controller.signal):frames;
      const iterator=source[Symbol.asyncIterator]?.()??source[Symbol.iterator]();
      let done=false;
      // The producer must honor the supplied signal; callback outputs belong to its caller.
      // This wave bound keeps decoding and ordered consumption finite even for slow first frames.
      const maxFrameBytes=limits.maxPixels*6+1024,scratchBytes=Math.max(Math.min(8*1024*1024,limits.maxPixels*2+4096),alignment?Math.min(limits.maxPixels,1048576)*5:0);
      try{
        while(!done){
          check(op);const wave=[];
          while(wave.length<lookahead&&!done){
            if(liveBytes+maxFrameBytes+scratchBytes>memoryBudgetBytes){if(wave.length)break;throw RangeError('SDK_MEMORY_BUDGET');}
            reserve(op,maxFrameBytes);let item;
            try{item=await iterator.next();check(op);}catch(e){release(op,maxFrameBytes);throw e;}
            if(item.done){release(op,maxFrameBytes);done=true;break;}
            const frame=item.value;let actual=0;
            try{
              if(count+wave.length>=limits.maxFrames)throw RangeError('FRAME_LIMIT');
              if(frame.timestamp!==undefined&&frame.timestamp!==null){if(!Number.isFinite(frame.timestamp)||frame.timestamp<lastTime)throw RangeError('TIMESTAMP_ORDER');firstTime??=frame.timestamp;lastTime=frame.timestamp;if(lastTime-firstTime>limits.maxDurationSeconds)throw RangeError('DURATION_LIMIT');}
              if(frame.duration!==undefined&&(!Number.isFinite(frame.duration)||frame.duration<0))throw RangeError('FRAME_DURATION');
              const shape=validateFrame(frame,limits.maxPixels);actual=shape.data.byteLength+2*shape.width*shape.height+1024;
              const t=performance.now(),ownedShape={...shape,data:new Uint8Array(shape.data)},gray=rgbaToGray(ownedShape,limits.maxPixels);
              wave.push({frame:{timestamp:frame.timestamp,duration:frame.duration,sceneId:frame.sceneId},shape:ownedShape,sequence:count+wave.length,gray,codes:new Uint8Array(shape.width*shape.height),histogram:new Uint32Array(256),grayMs:performance.now()-t,tileCopyMs:0,jobs:[],bytes:actual});
            }finally{release(op,maxFrameBytes-actual);}
          }
          if(!wave.length)break;
          const analyzed=await analyzeWave(wave,op);computeWallMs+=analyzed.elapsed;
          for(let i=0;i<analyzed.outputs.length;i++){
            check(op);const alignmentStart=performance.now(),output=aligner?await aligner.apply(analyzed.outputs[i]):analyzed.outputs[i];if(aligner)alignmentWallMs+=performance.now()-alignmentStart;const outputStart=performance.now();if(selector)await selector.push(output);else await onFrame(output);aligner?.releaseOutput();outputMs+=performance.now()-outputStart;check(op);count++;
            release(op,wave[i].bytes);wave[i]=null;analyzed.outputs[i]=null;
          }
        }
      }finally{if(!done)await iterator.return?.();}
      aligner?.dispose();aligner=null;
      if(selector){const finishStart=performance.now();selectionResult=await selector.finish();outputMs+=performance.now()-finishStart;check(op);}
      emit(op,'completed',{frameCount:count,durationsMs:Object.freeze({...op.durationsMs})});return {operationId:op.id,status:'succeeded',frameCount:count,selection:selectionResult,capabilities,resources:{liveBytes:op.liveBytes,peakBytes:op.peakBytes,budgetBytes:memoryBudgetBytes,scope:'SDK-owned frame and temporary tile/result buffers; selector/pool/decoder/caller memory separate'},metrics:{jobCount:op.jobCount,totalMs:performance.now()-op.start,processingWallMs:computeWallMs+alignmentWallMs,lbpWallMs:computeWallMs,alignmentWallMs,outputMs,workDurationsMs:{...op.durationsMs},memoryMeasurement:null,memoryMeasurementReason:'JS heap/decoder memory unavailable; retained pool counters are separate'},log:op.events};
    }catch(error){for(const id of op.children)pool.cancel(id);const code=op.controller.signal.aborted?(op.timeout?'OPERATION_TIMEOUT':'CANCELLED'):String(error?.message??'PROCESSING_FAILED');emit(op,code==='CANCELLED'?'cancelled':'failed',{errorCode:code,frameCount:count});const failure=new Error(code);failure.operation={operationId:op.id,status:code==='CANCELLED'?'cancelled':'failed',frameCount:count,log:op.events};throw failure;
    }finally{selector?.dispose();aligner?.dispose();clearTimeout(timer);try{signal?.removeEventListener('abort',abort);}catch{}for(const id of op.children){pool.cancel(id);pool.releaseResult(id);}op.children.clear();release(op,op.liveBytes);operations.delete(op.id);}
  }
  return Object.freeze({capabilities,process,cancel,getStatus:()=>({disposed,operations:operations.size,resources:{liveBytes,peakBytes,budgetBytes:memoryBudgetBytes},pool:pool.getStatus()}),dispose(){if(disposed)return;disposed=true;for(const id of operations.keys())cancel(id);if(owned)pool.dispose();}});
}

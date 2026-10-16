import {readMediaFrames,encodePng} from './browser.mjs';
import {resolveMediaLimits} from './formats.mjs';
import {validateFrame} from './core.mjs';
import {zipSync,strToU8} from '../ft/vendor/fflate.mjs';
export const BUILD_ID='media-basic-b1';
export const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,96}$/.test(x);
// Dependency injection is for independent contract tests; production uses native browser codecs.
export function createBasicProcessor({readFrames=readMediaFrames,encode=encodePng,afterZip=tick}={}){
  return Object.freeze({process});
  async function process(file,{trialId=crypto.randomUUID(),inputRevision=0,signal,limits:overrides={},onProgress=()=>{},onMetadata=()=>{},onEvent=()=>{}}={}){
    if(!validId(trialId)||!Number.isSafeInteger(inputRevision)||inputRevision<0)throw Error('INPUT_IDENTITY');
    const limits=resolveMediaLimits(overrides),operationId=crypto.randomUUID(),start=performance.now(),stages={},events=[],resources={},files={},frames=[];
    let inputHash=null,metadata=null,artifactBytes=0,first=null,iterator=null,zip=null,zipBlob=null,peakTrackedBytes=0;
    const startedAt=new Date().toISOString();
    const check=()=>{if(signal?.aborted)throw Error('CANCELLED');};
    const notify=(type,extra={})=>{try{onEvent({type,trialId,operationId,inputRevision,...extra});}catch{}};
    const mark=(name,a,b)=>{stages[name]=(stages[name]??0)+b-a;events.push({stage:name,startMs:a-start,endMs:b-start});};
    async function timed(name,fn){const a=performance.now();try{return await fn();}finally{mark(name,a,performance.now());}}
    let heapPeak=null,maxTickGapMs=0,lastTick=performance.now(),longTasks=null,observer;
    const sample=()=>{const h=performance.memory?.usedJSHeapSize;if(Number.isFinite(h))heapPeak=Math.max(heapPeak??0,h);};
    const timer=setInterval(()=>{const n=performance.now();maxTickGapMs=Math.max(maxTickGapMs,n-lastTick);lastTick=n;sample();},16);
    try{if(typeof PerformanceObserver==='function'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){longTasks=[];observer=new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.startTime>=start&&longTasks.length<128)longTasks.push({startMs:e.startTime-start,durationMs:e.duration});});observer.observe({type:'longtask'});}}catch{}
    const input=()=>({bytes:file?.size??null,sha256:inputHash,...metadata});
    const timings=()=>({clock:'performance.now',timeOriginEpochMs:performance.timeOrigin,startedAt,stages:{...stages},events:events.map(e=>({...e})),browserTotalMs:performance.now()-start});
    const memory=()=>({peakTrackedBufferEstimateBytes:peakTrackedBytes,sampledJsHeapPeakBytes:heapPeak,nativePeakBytes:null,nativePeakReason:'Browser codecs/CPU/GPU allocations are not observable; JS heap samples are approximate and not a peak bound',maxEventLoopTickGapMs:maxTickGapMs,timerIntervalMs:16,longTasks});
    const receipt=status=>({schemaVersion:2,buildId:BUILD_ID,trialId,operationId,inputRevision,preprocessing:false,status,input:input(),frameCount:frames.length,childJobs:frames.map(f=>({jobId:f.jobId,inputRevision:f.inputRevision,sourceSha256:f.sourceSha256,sequence:f.sequence,sha256:f.sha256})),timings:timings(),resources:{...resources},memory:memory(),external:{pagePreparation:null,inputTransfer:null,downloadRecovered:null,extraction:null,aiStart:null,aiRead:null,answerReceived:null},externalReason:'Caller-observed journal required; not measured by browser',cacheState:'unknown'});
    notify('start');
    try{
      check();if(!(file instanceof Blob)||file.size<1||file.size>limits.maxFileBytes)throw Error('FILE_LIMIT');
      inputHash=await timed('inputHash',async()=>sha256(await file.arrayBuffer()));check();sample();
      iterator=readFrames(file,{signal,limits,onMetadata:value=>{metadata=value;onMetadata(value);},onResource:event=>{resources[event]=(resources[event]??0)+1;}})[Symbol.asyncIterator]();
      let last=-Infinity;
      for(;;){
        check();const next=await timed('decode',()=>iterator.next());check();if(next.done)break;
        const frame=next.value;validateFrame(frame,limits.maxPixels);
        const sequence=frames.length;if(sequence>=limits.maxFrames)throw Error('FRAME_LIMIT');
        const timestamp=frame.timestamp??null,duration=frame.duration??null;
        if(timestamp!==null&&(!Number.isFinite(timestamp)||timestamp<0||timestamp<last))throw Error('TIMESTAMP_ORDER');
        if(duration!==null&&(!Number.isFinite(duration)||duration<0))throw Error('FRAME_DURATION');
        if(timestamp!==null&&(timestamp+(duration??0)>limits.maxDurationSeconds+1e-9))throw Error('DURATION_LIMIT');
        if(timestamp!==null)last=timestamp;
        const blob=await timed('encode',()=>encode(frame,{limits}));check();
        const data=new Uint8Array(await blob.arrayBuffer());check();artifactBytes+=data.byteLength;
        if(artifactBytes>limits.maxArtifactBytes)throw Error('ARTIFACT_LIMIT');
        const path=`frames/${String(sequence).padStart(6,'0')}.png`,hash=await timed('outputHash',()=>sha256(data));check();
        files[path]=data;first??=blob;
        frames.push({sequence,jobId:`${operationId}:${sequence}`,inputRevision,sourceSha256:inputHash,path,sha256:hash,bytes:data.byteLength,width:frame.width,height:frame.height,timestamp,duration});
        peakTrackedBytes=Math.max(peakTrackedBytes,file.size+artifactBytes+frame.data.byteLength+blob.size+(first===blob?0:first.size));sample();
        onProgress({trialId,operationId,inputRevision,frameCount:frames.length,phase:'decode-encode'});
        await tick();check();
      }
      if(!frames.length)throw Error('NO_FRAMES');
      const manifest={...receipt('decoded'),frames,limits,warnings:['All decoded frames are retained. No LBP, alignment, selection or feature optimization.','Browser decoding applies orientation and sRGB rendering; decoded pixels may differ between decoders.','Keep the original file; PNG sequence contains no audio.','Manifest precedes ZIP generation; final receipt carries ZIP hash and packaging times.']};
      await timed('manifest',async()=>{files['manifest.json']=strToU8(JSON.stringify(manifest,null,2));artifactBytes+=files['manifest.json'].byteLength;if(artifactBytes>limits.maxArtifactBytes)throw Error('ARTIFACT_LIMIT');});check();
      onProgress({trialId,operationId,inputRevision,frameCount:frames.length,phase:'packaging'});await tick();check();
      const a=performance.now();zip=zipSync(files,{level:0});mark('zip',a,performance.now());
      if(zip.byteLength>limits.maxArtifactBytes)throw Error('ARTIFACT_LIMIT');
      peakTrackedBytes=Math.max(peakTrackedBytes,file.size+artifactBytes+zip.byteLength+(first?.size??0));
      // Yield after synchronous packaging so an already-queued cancel wins over ready.
      await afterZip();check();
      zipBlob=await timed('blob',async()=>new Blob([zip],{type:'application/zip'}));check();
      peakTrackedBytes=Math.max(peakTrackedBytes,file.size+artifactBytes+zip.byteLength+zipBlob.size+(first?.size??0));
      const zipHash=await timed('outputHash',()=>sha256(zip));check();sample();await tick();check();
      const final=receipt('ready');final.zip={sha256:zipHash,bytes:zip.byteLength};final.timings.stages.total=final.timings.browserTotalMs;
      notify('complete',{receipt:final});return {zip:zipBlob,preview:first,manifest,receipt:final};
    }catch(error){
      try{await iterator?.return?.();}catch{}
      const cancelled=signal?.aborted||error.message==='CANCELLED';const final=receipt(cancelled?'cancelled':'failed');final.errorCode=cancelled?'CANCELLED':error.message;final.timings.stages.total=final.timings.browserTotalMs;
      notify(final.status,{receipt:final});error.receipt=final;throw error;
    }finally{
      try{await iterator?.return?.();}finally{clearInterval(timer);observer?.disconnect();for(const key of Object.keys(files))delete files[key];zip=null;zipBlob=null;first=null;}
    }
  }
}
export const processMedia=(file,options)=>createBasicProcessor().process(file,options);

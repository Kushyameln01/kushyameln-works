// Private long synthetic trial. One fork module; public/default limits unchanged.
import * as M from '/fork.mjs';
import {fillLongFrame,LONG_FRAME_PROFILE} from './frame.mjs';
import {longProfile,LONG_CONTRACT as C,generationNeedsFrame,assertGenerated} from './profile.mjs';
import {createOutputIndex} from '../output-index-prototype/output-index.mjs';
import {createIndexBudget} from '../index-prototype/index-store.mjs';
import {convertStereo} from '../indexed-transform-prototype/transform.mjs';
import {createFileOutput} from '../../../docs/shared/vr180/file-output.mjs';
import {inspectMp4} from '../../../docs/shared/vr180/mp4.mjs';
import {sha256Blob} from '../../../docs/shared/vr180/sha256.mjs';

const need=(v,m)=>{if(!v)throw Error(m);};
const describe=e=>({name:e.name,message:e.message,status:e.status??null});
const absent=async(root,name)=>{try{await root.getDirectoryHandle(name);return false;}catch(e){if(e.name==='NotFoundError')return true;throw e;}};
const abortError=()=>new DOMException('Long trial canceled or timed out','AbortError');
const hex=bytes=>[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
async function independentlyCleanup(actions){const errors=[];for(const action of actions)try{await action();}catch(e){errors.push(e);}
 if(errors.length)throw new AggregateError(errors,errors.map(e=>e.message).join('; '));}
async function withJobLeases(names,action,index=0){
 if(index===names.length)return action();
 return navigator.locks.request('vr180:index-job:'+names[index],{mode:'exclusive',ifAvailable:true},async lock=>{
  need(lock,'LONG_CLEANUP_JOB_ACTIVE');return withJobLeases(names,action,index+1);});
}
let active=false,aborter,unhandled=0;
self.addEventListener('unhandledrejection',event=>{unhandled++;if(unhandled<=8)self.postMessage({unhandledError:describe(event.reason??Error('unknown'))});});

async function run({namespace,profileId}){
 const profile=longProfile(profileId),result={schema:'vr180-p5-long-browser-v1',profile:profileId,status:'FAIL',files:[],
  settings:C,frameProfile:LONG_FRAME_PROFILE,namespace,namespaceOwned:false,ownership:[],stages:{},
  publicProduct:false,hostRecovery:'PENDING',independentVerification:'PENDING'};
 const jobs={generation:namespace+'-gen',input:namespace+'-convert-in',output:namespace+'-convert-out'};
 let root,cleanup,tx,metrics;aborter=new AbortController();
 const check=()=>{if(aborter.signal.aborted)throw abortError();};
 const stage=async(name,seconds,action)=>{const row=result.stages[name]={startedMs:performance.now(),status:'STARTED'};
  self.postMessage({phase:name});const timer=setTimeout(()=>{row.timedOut=true;aborter.abort();},seconds*1000);
  try{check();const value=await action();check();row.status='PASS';return value;}
  catch(e){row.status='FAIL';row.error=describe(e);throw e;}
  finally{clearTimeout(timer);row.endedMs=performance.now();row.elapsedMs=row.endedMs-row.startedMs;}};
 const persistOwner=async(label,ticket)=>{
  check();need(Object.hasOwn(jobs,label)&&ticket.jobId===jobs[label]&&/^[0-9a-f]{32}$/.test(ticket.ownerToken)
   &&ticket.schema===1&&ticket.format==='vr180-private-index-owner'&&ticket.kind===(label==='input'?'input':'output'),'OWNER_TICKET_INVALID');
  need(result.ownership.length<3&&!result.ownership.some(r=>r.label===label),'OWNER_RECORD_LIMIT');
  const name='owner-'+label+'.json',row={label,name,ticket,startedMs:performance.now(),status:'WRITING',removed:false};result.ownership.push(row);
  const bytes=new TextEncoder().encode(JSON.stringify(ticket));need(bytes.length<=1024,'OWNER_RECORD_SIZE');
  const handle=await root.getFileHandle(name,{create:true});need((await handle.getFile()).size===0,'OWNER_RECORD_NOT_EMPTY');
  let access;
  try{
   access=await handle.createSyncAccessHandle();need(access.getSize()===0,'OWNER_RECORD_NOT_EMPTY');
   for(let at=0;at<bytes.length;){check();const n=access.write(bytes.subarray(at),{at});need(Number.isInteger(n)&&n>0&&n<=bytes.length-at,'OWNER_SHORT_WRITE');at+=n;}
   access.flush();row.flushed=true;need(access.getSize()===bytes.length,'OWNER_SYNC_SIZE');
   const back=new Uint8Array(bytes.length);for(let at=0;at<back.length;){check();const n=access.read(back.subarray(at),{at});need(Number.isInteger(n)&&n>0&&n<=back.length-at,'OWNER_SHORT_READ');at+=n;}
   need(back.every((n,i)=>n===bytes[i]),'OWNER_SYNC_READBACK_DIFFERS');access.close();access=null;row.closed=true;
   const saved=await handle.getFile();need(saved.size===bytes.length&&await saved.text()===new TextDecoder().decode(bytes),'OWNER_READBACK_DIFFERS');
   row.bytes=saved.size;row.persistedJSON=await saved.text();row.sha256=await sha256Blob(saved);row.status='PERSISTED';
  }catch(e){row.status='FAILED';row.error=describe(e);throw e;}
  finally{if(access)try{access.close();row.closed=true;}catch(e){row.closeError=describe(e);}row.endedMs=performance.now();row.elapsedMs=row.endedMs-row.startedMs;}
  check();self.postMessage({ownershipRecord:row});
 };
 async function generate(handle){
  const stats=result.generation={frames:0,fps:30,requestedBitrate:C.bitrate,packets:0,payloadBytes:0,maxPacketBytes:0,
   packetTimestampsStrictlyIncreasing:true,encoderConfigCandidates:[],droppedEncoderConfigCandidates:0,
   actualDecoderConfig:null,decoderConfigEvents:0,latencyMode:'realtime',drawMs:0};
  const budget=createIndexBudget();let index,output,writer,destination,canvas,source,lastTimestamp=-Infinity,retryCleanup,failure,cancellation;
  const cancel=()=>{if(output&&!['finalizing','finalized'].includes(output.state))cancellation??=output.cancel();return cancellation??Promise.resolve();};
  const onAbort=()=>{void cancel().catch(()=>{});};aborter.signal.addEventListener('abort',onAbort,{once:true});
  try{
   const quality=new M.Quality({bitrate:C.bitrate,bitrateMode:'variable'});
   need(await M.canEncodeVideo('avc',{width:C.width,height:C.height,quality,latencyMode:'realtime'}),'LONG_ENCODER_UNSUPPORTED');
   canvas=new OffscreenCanvas(C.width,C.height);const context=canvas.getContext('2d',{alpha:false,colorSpace:'srgb'});need(context,'CANVAS_UNAVAILABLE');
   const pixels=context.createImageData(C.width,C.height),ticket={format:'vr180-private-index-owner',schema:1,kind:'output',
    jobId:jobs.generation,ownerToken:hex(crypto.getRandomValues(new Uint8Array(16)))};
   await persistOwner('generation',ticket);
   try{index=await createOutputIndex({root,jobId:ticket.jobId,ownerToken:ticket.ownerToken,budget,signal:aborter.signal,layout:'sbs'});}
   catch(e){retryCleanup=e.retryCleanup;throw e;}
   destination=await createFileOutput(handle,{signal:aborter.signal});writer=destination.stream.getWriter();
   const format=new M.Mp4OutputFormat({fastStart:false});format._options.vr180Index=index;
   output=new M.Output({format,target:new M.StreamTarget(new WritableStream({
    async write(value){check();need(value?.data instanceof Uint8Array&&Number.isSafeInteger(value.position)&&value.position>=0
     &&Number.isSafeInteger(value.position+value.data.length)&&value.position+value.data.length<=profile.inputFileBytes,'LONG_INPUT_FILE_LIMIT');await writer.write(value);},
    close:()=>writer.close(),abort:reason=>writer.abort(reason),
   },{highWaterMark:1}),{chunked:true,chunkSize:1024**2})});
   source=new M.CanvasSource(canvas,{codec:'avc',quality,latencyMode:'realtime',keyFrameInterval:2,
    onEncoderConfig(config){if(stats.encoderConfigCandidates.length<8)stats.encoderConfigCandidates.push({...config});else stats.droppedEncoderConfigCandidates++;},
    onEncodedPacket(packet,meta){stats.packets++;stats.payloadBytes+=packet.data.length;
     stats.maxPacketBytes=Math.max(stats.maxPacketBytes,packet.data.length);
     need(Number.isSafeInteger(stats.payloadBytes)&&stats.packets<=C.maxFrames,'LONG_PACKET_COUNTER');
     stats.packetTimestampsStrictlyIncreasing&&=Number.isFinite(packet.timestamp)&&packet.timestamp>lastTimestamp;lastTimestamp=packet.timestamp;
     if(meta?.decoderConfig){stats.decoderConfigEvents++;if(!stats.actualDecoderConfig){const c=meta.decoderConfig;
      need(typeof c.codec==='string'&&c.codec.length<=128,'DECODER_CONFIG_CODEC');stats.actualDecoderConfig={source:'first encoded packet metadata',
       codec:c.codec,codedWidth:c.codedWidth,codedHeight:c.codedHeight,descriptionBytes:c.description?.byteLength??0};}}
    }});
   output.addVideoTrack(source,{frameRate:30});await output.start();const started=performance.now();
   while(generationNeedsFrame(stats,profile)){check();const at=performance.now();fillLongFrame(pixels.data,stats.frames);context.putImageData(pixels,0,0);
    stats.drawMs+=performance.now()-at;await source.add(stats.frames/30,1/30);stats.frames++;}
   stats.addMs=performance.now()-started;stats.observedPayloadBeforeFlush=stats.payloadBytes;stats.framesSubmittedBeforeFlush=stats.frames;
   check();source.close();const finalize=performance.now();await output.finalize();stats.finalizeMs=performance.now()-finalize;
   writer.releaseLock();writer=null;check();const indexed=index.metrics;
   need(indexed.metadataClosed&&indexed.verification?.sampleCounts.total===stats.frames,'GENERATED_METADATA_NOT_VERIFIED');
   need(destination.status.extent<=profile.inputFileBytes,'LONG_INPUT_FINAL_LIMIT');
   const expectedMetadata=await sha256Blob(index.metadataSource.slice(indexed.moovPosition),{signal:aborter.signal});
   const saved=await destination.commit({expectedBytes:destination.status.extent});check();const file=await handle.getFile();
   need(saved.committed&&file.size===saved.bytes&&await sha256Blob(file,{signal:aborter.signal})===saved.sha256,'INPUT_FULL_REREAD_DIFFERS');
   need(await sha256Blob(file.slice(indexed.moovPosition),{signal:aborter.signal})===expectedMetadata,'INPUT_METADATA_READBACK_DIFFERS');
   Object.assign(stats,{bytes:file.size,sha256:saved.sha256,seconds:stats.frames/30,index:index.metrics,
    payloadBitsPerSecond:stats.payloadBytes*8/(stats.frames/30),savedWriteCommitted:saved.committed});
   assertGenerated(stats,profile);return file;
  }catch(e){failure=e;throw e;}finally{
   aborter.signal.removeEventListener('abort',onAbort);const errors=[];
   try{await independentlyCleanup([cancel,()=>{writer?.releaseLock();writer=null;},
    async()=>{if(destination&&!destination.status.committed)await destination.abort();},
    ()=>retryCleanup?.(),()=>index?.dispose(),()=>{if(canvas){canvas.width=0;canvas.height=0;}},
   ]);}catch(e){errors.push(e);}
   stats.cleanup={indexReservedBytes:budget.usedBytes,directoryRemoved:root?await absent(root,jobs.generation):null,
    errors:errors.map(describe),saveState:destination?.status??{state:'not-started',committed:false}};
   if(errors.length){const error=failure??new AggregateError(errors,'GENERATOR_CLEANUP_FAILED');
    error.cleanupError=errors.map(e=>e.message).join('; ');error.requiresWorkerTermination=true;if(!failure)throw error;}
  }
 }
 try{
  need(/^v-[a-f0-9-]{36}$/.test(namespace),'LONG_NAMESPACE_INVALID');
  need(isSecureContext&&navigator.storage?.getDirectory&&navigator.locks?.request&&navigator.locks?.query,'NATIVE_CAPABILITY_UNAVAILABLE');
  result.storageBefore=await navigator.storage.estimate();result.estimateUsedAsCapacityGuarantee=false;
  const origin=await navigator.storage.getDirectory();need(await absent(origin,namespace),'NAMESPACE_EXISTS');
  root=await origin.getDirectoryHandle(namespace,{create:true});result.namespaceOwned=true;self.postMessage({namespaceOwned:true});
  const inputHandle=await root.getFileHandle('input.mp4',{create:true});self.postMessage({ownedMediaFile:'input.mp4'});
  const input=await stage('generation',profile.generationSeconds,()=>generate(inputHandle));
  const admissionStarted=performance.now();result.inputInspection=await inspectMp4(input,{signal:aborter.signal});result.inputAdmissionMs=performance.now()-admissionStarted;need(result.inputInspection.transcodeSafe,'GENERATED_PUBLIC_INPUT_REFUSED');
  const target=await root.getFileHandle('output.mp4',{create:true});self.postMessage({ownedMediaFile:'output.mp4'});
  const outcome=await stage('conversion',profile.conversionSeconds,()=>convertStereo(input,
   {mode:'convert',confirmed:true,layout:'sbs',fov:180,eyeSize:512,bitrate:C.bitrate},
   {fork:M,indexRoot:root,outputHandle:target,jobId:namespace+'-convert',outputProfileId:profile.id,signal:aborter.signal,
    onCleanup:fn=>{cleanup=fn;},onOutputCreated:value=>{tx=value;},onMetrics:value=>{metrics=value;},
    onIndexOwnership:ticket=>persistOwner(ticket.kind,ticket),onProgress:progress=>{result.lastConversionProgress=progress;}}));
  result.conversion={metrics:outcome.metrics,verification:outcome.verification,savedInfo:outcome.savedInfo,
   saved:{committed:outcome.saved.committed,bytes:outcome.saved.bytes,sha256:outcome.saved.sha256}};
  const readbackStarted=performance.now(),output=await target.getFile();need(output.size<=profile.outputFileBytes&&outcome.saved.committed
   &&output.size===outcome.saved.bytes&&await sha256Blob(output,{signal:aborter.signal})===outcome.saved.sha256,'OUTPUT_FULL_REREAD_DIFFERS');result.outputReadbackMs=performance.now()-readbackStarted;
  result.files=[{id:'input',name:'input.mp4',bytes:input.size,sha256:result.generation.sha256,file:input},
   {id:'output',name:'output.mp4',bytes:output.size,sha256:outcome.saved.sha256,file:output}];
  result.status='READY_FOR_RUNNER_TRANSFER';
 }catch(e){result.status=/UNAVAILABLE|UNSUPPORTED/.test(e.message)?'BLOCKED':'FAIL';result.error=describe(e);
  if(e.cleanupError||e.requiresWorkerTermination)result.cleanupFailureObserved=true;
 }finally{
  try{await cleanup?.();}catch(e){result.cleanupError=describe(e);result.status='FAIL';}
  result.conversionCleanup={metrics,fileState:tx?.status??null};
  try{
   if(root){result.indexDirectoriesRemoved=(await Promise.all(Object.values(jobs).map(name=>absent(root,name)))).every(Boolean);
    result.heldLocks=(await navigator.locks.query()).held.filter(lock=>lock.name.includes(namespace)).length;
    const generationBytes=result.generation?result.generation.cleanup?.indexReservedBytes:0,conversionBytes=cleanup?metrics?.indexReservedAfterCleanup:0;
    result.indexReservedAfterCleanup=Number.isSafeInteger(generationBytes)&&Number.isSafeInteger(conversionBytes)?generationBytes+conversionBytes:null;
    need(result.indexDirectoriesRemoved&&result.heldLocks===0&&result.indexReservedAfterCleanup===0&&!result.cleanupError
     &&!result.cleanupFailureObserved,'LONG_OWNER_CLEANUP_UNPROVEN');
    await withJobLeases(Object.values(jobs),async()=>{
     need((await Promise.all(Object.values(jobs).map(name=>absent(root,name)))).every(Boolean),'LONG_INDEX_REAPPEARED');
     for(const row of result.ownership){need(row.status==='PERSISTED','OWNER_RECORD_NOT_VERIFIED');const file=await(await root.getFileHandle(row.name)).getFile();
      need(file.size===row.bytes&&await file.text()===row.persistedJSON&&await sha256Blob(file)===row.sha256,'OWNER_RECORD_CHANGED');}
     for(const row of result.ownership){await root.removeEntry(row.name);row.removed=true;}
    });result.ownerRecordsRemoved=true;
   }
  }catch(e){result.cleanupError=describe(e);result.status='FAIL';}
  result.unhandledCount=unhandled;if(unhandled)result.status='FAIL';
  if(result.status!=='READY_FOR_RUNNER_TRANSFER')result.files=[];
 }
 return result;
}
self.onmessage=({data})=>{
 if(data?.action==='cancel'){aborter?.abort();return;}
 if(active){self.postMessage({result:{status:'FAIL',files:[],error:{message:'LONG_RUN_ALREADY_STARTED'}}});return;}
 active=true;run(data).then(result=>self.postMessage({result}),error=>self.postMessage({result:{status:'FAIL',files:[],error:describe(error)}}));
};

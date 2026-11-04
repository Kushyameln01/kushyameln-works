import {createDiffusionModels,PROTOCOL_VERSION,BUILD_ID} from '../../docs/shared/diffusion-models/api/index.mjs';
import {describeTensor} from '../../docs/shared/inference/tensor.mjs';

// This harness has no predictor/operator injection port. All normal calls cross
// the public host API and its actual dedicated Worker. Numerical comparison is
// performed afterwards on the privately persisted output by a separate tool.
const requireValue=(condition,message)=>{if(!condition)throw Error(message);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const plain=value=>JSON.parse(JSON.stringify(value));
const metadata=tensor=>Object.fromEntries(Object.entries(describeTensor(tensor)).map(([key,value])=>[key,ArrayBuffer.isView(value)?Array.from(value):plain(value)]));
const identity=async data=>({bytes:data.byteLength,sha256:await sha(data)});
const errorInfo=error=>({name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,4000),...(error?.code?{code:String(error.code)}:{}),...(error?.details?{details:plain(error.details)}:{})});
const isError=(reply,code)=>reply?.status==='error'&&reply.error?.code===code;
function expectOk(reply,label){requireValue(reply?.status==='ok',label+': '+JSON.stringify(reply?.error??reply));return reply.result;}

export async function capturePublicModelInputs(manifest,fetchBytes=async url=>{
 const response=await fetch(url);requireValue(response.ok,'Private input unavailable: '+url);return new Uint8Array(await response.arrayBuffer());
}){
 const tensor=async item=>{
  const bytes=await fetchBytes(item.url);requireValue(bytes.byteLength===item.bytes&&await sha(bytes)===item.sha256,'Diagnostic input transport identity differs');
  const data=new Float32Array(bytes.slice().buffer),copy={};
  // Transport bookkeeping is separate from the producer's tensor metadata.
  for(const [key,value]of Object.entries(item))if(!['path','url','bytes','sha256'].includes(key))copy[key]=structuredClone(value);
  requireValue(item.dtype==='float32'&&item.shape.reduce((a,b)=>a*b,1)*4===bytes.byteLength,'Explicit F32 input extent differs');
  return {...copy,data};
 };
 const tensors=await Promise.all(manifest.tensors.map(tensor));
 const noise=await tensor(manifest.explicitNoise);
 const initialBytes=await fetchBytes(manifest.initialEmptyTarget.url);
 requireValue(initialBytes.byteLength===manifest.initialEmptyTarget.bytes&&await sha(initialBytes)===manifest.initialEmptyTarget.sha256,'Initial target transport identity differs');
 const initialEmptyTarget=new Float32Array(initialBytes.slice().buffer);
 const conditioning=manifest.conditioning,bytes=await fetchBytes(conditioning.payloadURL),mask=await fetchBytes(conditioning.maskURL);
 requireValue(await sha(bytes)===conditioning.payloadSHA256&&await sha(mask)===conditioning.maskSHA256,'Complete Text payload/mask transport identity differs');
 const makeText=()=>({...structuredClone(conditioning.metadata),data:new Float32Array(bytes.slice().buffer),attentionMask:new Uint8Array(mask)});
 const positive=makeText(),negative=makeText();
 requireValue(positive.shape[0]===1&&positive.shape[2]===4096&&positive.data.length===positive.shape[1]*4096&&positive.attentionMask.length===positive.shape[1],'Text shape/mask extent differs');
 const snapshots=async()=>({tensors:await Promise.all(tensors.map(async value=>({requirementId:value.requirementId,...await identity(value.data)}))),noise:await identity(noise.data),initialEmptyTarget:await identity(initialEmptyTarget),positive:{...await identity(positive.data),mask:await identity(positive.attentionMask)},negative:{...await identity(negative.data),mask:await identity(negative.attentionMask)}});
 return {shapeRequest:structuredClone(manifest.shapeRequest),tensors,noise:noise.data,initialEmptyTarget,positive,negative,snapshots};
}

/** Development lifecycle probe. Numerical requests still use only the public
 * ordinary inputs; the caller supplies the already constructed real API. */
export async function cancelPublicPatchThenReload({api,request,predictInput,files,wasmThreads,onProgress,operations,loaded}){
 let cancellation=null,cancelledAtPatch=false,cancelProgressJob=null;
 const cancelled=await request('predict',predictInput('HIGH',loaded),{onProgress:event=>{
  onProgress(event);
  if(!cancelledAtPatch&&event.result?.model?.stage==='patch'){
   cancelledAtPatch=true;cancelProgressJob={jobId:event.jobId,inputRevision:event.inputRevision};
   cancellation=api.cancel({sessionId:api.sessionId,...cancelProgressJob});
  }
 }});
 requireValue(cancelledAtPatch&&isError(cancelled,'CANCELLED')&&cancellation?.status==='ok'&&cancellation.result.workerTerminated,'Actual prefix cancellation did not terminate its owned Worker');
 operations.push({test:'actual-patch-cancel',code:cancelled.error.code,cancelProgressJob});
 const afterCancel=await request('predict',predictInput('LOW',loaded));requireValue(isError(afterCancel,'MODEL_NOT_LOADED'),'Cancelled Worker retained a model session');operations.push({test:'cancel-retry-needs-load',code:afterCancel.error.code});
 const reloaded=expectOk(await request('load',{files,resource:{wasmThreads}}),'reload after cancellation');requireValue(reloaded.modelSessionId!==loaded.modelSessionId,'Reload reused cancelled model identity');
 const staleAfterReload=await request('predict',{...predictInput('LOW',reloaded),modelSessionId:loaded.modelSessionId});requireValue(isError(staleAfterReload,'STALE_MODEL'),'Old model identity entered replacement Worker');operations.push({test:'reload-stale-session',code:staleAfterReload.error.code});
 return {loaded:reloaded,recovery:{apiSessionId:api.sessionId,cancelledModelSessionId:loaded.modelSessionId,reloadedModelSessionId:reloaded.modelSessionId,cancelProgressJob,cancelledAtPatch:true,workerTerminated:true,completedOperation:null}};
}

/** Smoke-only wrong-side admission probe. These are ordinary public calls;
 * Worker lifetime observations remain diagnostic metadata outside the wire. */
export async function failPublicPairThenPrepareP4({api,request,HIGH,wasmThreads,operations,workerLifetimes}){
 const beforeFailure=workerLifetimes.length;
 const failed=await request('load',{files:{HIGH,LOW:HIGH},resource:{wasmThreads}});
 requireValue(failed?.status==='error','Expected a failed paired load when the retained HIGH File is supplied as LOW');
 const details=failed.error?.details;
 requireValue(details?.workerTerminated===true&&details.preparationDiscarded===true&&details.reloadRequired===true,'Failed paired load did not report Worker termination, preparation discard and required reload');
 const constructed=workerLifetimes.slice(beforeFailure).filter(value=>value.stage==='constructed');
 requireValue(constructed.length===1,'Failed paired load did not construct exactly one observed public Worker');
 const failedWorkerEpoch=constructed[0].workerEpoch;
 requireValue(workerLifetimes.some(value=>value.workerEpoch===failedWorkerEpoch&&value.stage==='terminated'),'Failed paired load Worker was not observed terminated');
 const requestIdentity=Object.fromEntries(['buildId','protocolVersion','sessionId','jobId','inputRevision','op'].map(key=>[key,failed[key]]));
 const failedLoad={requestIdentity,input:{files:{HIGH:'retained HIGH File',LOW:'same retained HIGH File, intentional wrong side'},resource:{wasmThreads}},error:plain(failed.error)};
 operations.push({test:'failed-pair-discarded',workerEpoch:failedWorkerEpoch,requestIdentity,code:failed.error.code,details:plain(details)});
 const beforeStatus=workerLifetimes.length,freshStatus=expectOk(await request('modelStatus',{}),'fresh status after failed paired load');
 requireValue(freshStatus.loaded===false&&freshStatus.cleanupRequired===false&&freshStatus.modelSessionId===null&&freshStatus.resources===null,'Fresh Worker retained a loaded owner, cleanup owner or native resources');
 const freshWorkers=workerLifetimes.slice(beforeStatus).filter(value=>value.stage==='constructed');
 requireValue(freshWorkers.length===1&&freshWorkers[0].workerEpoch!==failedWorkerEpoch,'Status after failed paired load did not use a fresh observed Worker');
 const freshWorkerEpoch=freshWorkers[0].workerEpoch;
 operations.push({test:'failed-pair-fresh-status',workerEpoch:freshWorkerEpoch,loaded:false,cleanupRequired:false,resources:null});
 const preparation=expectOk(await request('prepareP4',{file:HIGH,side:'HIGH'}),'P4 preparation in the fresh idle realm');
 const release=expectOk(await request('releaseP4',{}),'P4 release after failed-pair recovery');
 requireValue(release.released===true&&release.activeORTSessions===0&&release.readLeases===0,'Fresh P4 owner did not release its sessions and read leases');
 requireValue(workerLifetimes.filter(value=>value.stage==='constructed').at(-1)?.workerEpoch===freshWorkerEpoch&&!workerLifetimes.some(value=>value.workerEpoch===freshWorkerEpoch&&value.stage==='terminated'),'P4 preparation/release replaced the fresh idle Worker unexpectedly');
 operations.push({test:'failed-pair-fresh-p4',workerEpoch:freshWorkerEpoch,released:true,activeORTSessions:0,readLeases:0});
 return {apiSessionId:api.sessionId,failedLoad,failedWorkerEpoch,failedWorkerTerminated:true,freshWorkerEpoch,freshStatus:plain(freshStatus),p4:{preparation:plain(preparation),release:plain(release)},neuralExecutionPerformed:false};
}

/** Public API actual-Worker session. Source/input guards belong to the private
 * host, and are never required fields of load/predict/sample. */
export async function startPublicModelBrowser(config){
 requireValue(['smoke','predict','sample'].includes(config.mode),'Explicit public test mode required');
 requireValue([1,4].includes(config.wasmThreads),'Explicit supported thread profile required');
 requireValue(Number.isFinite(config.timeoutMs)&&config.timeoutMs>0,'Bounded session timeout required');
 requireValue(config.cancelBeforeRun===undefined||typeof config.cancelBeforeRun==='boolean','Explicit boolean cancellation probe flag required');
 requireValue(!config.cancelBeforeRun||config.mode==='sample','The explicit pre-run cancellation probe is available in sample mode only');
 requireValue(config.failedPairBeforeRun===undefined||typeof config.failedPairBeforeRun==='boolean','Explicit boolean failed-pair probe flag required');
 requireValue(!config.failedPairBeforeRun||config.mode==='smoke','The explicit failed-pair probe is available in smoke mode only');
 const HIGH=document.querySelector('#model-high').files[0],LOW=document.querySelector('#model-low').files[0];
 requireValue(HIGH instanceof File&&LOW instanceof File,'Both actual retained model Files must be selected');
 if(config.wasmThreads===4)requireValue(crossOriginIsolated&&typeof SharedArrayBuffer==='function','Four-thread harness requires real COOP/COEP isolation');
 if(config.expectedCOI!==undefined)requireValue(crossOriginIsolated===config.expectedCOI,'Observed COI differs from the explicitly requested resource profile');
 const response=await fetch('/__case__.json');requireValue(response.ok,'Private case manifest unavailable');const manifest=await response.json();
 const input=await capturePublicModelInputs(manifest),before=await input.snapshots();
 const started=performance.now(),nativeWorker=globalThis.Worker;let workerEpoch=0;
 const wasmObservations=[],workerLifetimes=[];let wasmObservationCount=0,wasmPeakBytes=0;
 const retainTail=(array,value)=>{if(array.length===128)array.shift();array.push(value);};
 globalThis.Worker=class extends nativeWorker{
  constructor(url,options){
   const requested=new URL(url,location.href),observed=requested.origin===location.origin&&requested.pathname==='/docs/shared/diffusion-models/api/worker.mjs';
   const bootstrap=new URL('/tools/diffusion-models/public-model-worker-observer.mjs',location.href);bootstrap.searchParams.set('worker',requested.href);
   super(observed?bootstrap:url,options);
   if(observed){
    this.observerEpoch=++workerEpoch;workerLifetimes.push({workerEpoch:this.observerEpoch,stage:'constructed',elapsedMs:performance.now()-started});
    this.addEventListener('message',event=>{if(event.data?.__publicWasmObservation){const value={elapsedMs:performance.now()-started,workerEpoch:this.observerEpoch,...event.data};wasmObservationCount++;wasmPeakBytes=Math.max(wasmPeakBytes,value.peakBytes);retainTail(wasmObservations,value);record({stage:'wasm-memory',observation:value});}});
   }
  }
  terminate(){if(this.observerEpoch)workerLifetimes.push({workerEpoch:this.observerEpoch,stage:'terminated',elapsedMs:performance.now()-started});return super.terminate();}
 };
 const api=createDiffusionModels({sessionId:'public-model-'+crypto.randomUUID()});
 let revision=0,serial=0,lastProgress=null,progressCount=0,settled=false,lateProgressCount=0,queue=Promise.resolve(),resultTensor=null,encoded=null,loaded=null,activeIdentity=null;
 let eventCount=0;const events=[],record=event=>{
  const value={elapsedMs:performance.now()-started,...event};eventCount++;retainTail(events,value);
  queue=queue.then(()=>globalThis.reportPublicCheckpoint?.(value));
 };
 const envelope=(op,value={})=>({protocolVersion:PROTOCOL_VERSION,buildId:BUILD_ID,sessionId:api.sessionId,jobId:'public-'+String(++serial),inputRevision:++revision,op,input:value});
 const request=async(op,value={},options={})=>{
  const q=envelope(op,value);record({stage:'request-start',identity:{jobId:q.jobId,inputRevision:q.inputRevision,op}});
  activeIdentity={jobId:q.jobId,inputRevision:q.inputRevision,op};
  let observerError=null;
  const observed=options.onProgress?{onProgress:event=>{
   if(!['buildId','protocolVersion','sessionId','jobId','inputRevision','op'].every(key=>event[key]===q[key]))observerError='Progress belongs to a stale/replaced request';
   else options.onProgress(event);
  }}:{};
  const reply=await api.request(q,observed);
  activeIdentity=null;
  requireValue(!observerError,observerError);
  requireValue(['buildId','protocolVersion','sessionId','jobId','inputRevision','op'].every(key=>reply[key]===q[key]),'Public terminal reply identity differs');
  record({stage:'request-terminal',identity:{jobId:q.jobId,inputRevision:q.inputRevision,op},status:reply.status,...(reply.error?{error:reply.error}:{})});
  return reply;
 };
 const onProgress=event=>{
  if(settled){lateProgressCount++;return;}
  requireValue(event.status==='progress'&&event.sessionId===api.sessionId,'Progress identity differs');
  lastProgress={jobId:event.jobId,inputRevision:event.inputRevision,op:event.op,result:event.result};progressCount++;
  record({stage:'progress',identity:{jobId:event.jobId,inputRevision:event.inputRevision,op:event.op},progress:event.result});
 };
 const heartbeat=setInterval(()=>record({stage:'heartbeat',lastProgress,progressCount}),15000);
 const run={schemaVersion:'bernini-public-model-worker-browser/0.1',mode:config.mode,side:config.side,timestep:config.timestep,wasmThreads:config.wasmThreads,sourceCommit:config.sourceCommit,failedPairBeforeRun:config.failedPairBeforeRun??false,caseClass:manifest.caseClass,profileId:manifest.profileId,conditioningFixture:'Separate owned positive/negative copies of the same retained packet; not original negative-prompt/CFG acceptance',publicWorkerConnected:true,numericalReferencePassed:false,generationReady:false,originalWorkflowAccepted:false,inputIdentitiesBefore:before,operations:[],outcome:'failed',error:null};
 const timeout=setTimeout(()=>{
  run.timeout={timeoutMs:config.timeoutMs,activeIdentity,lastProgress};run.outcome='failed';record({stage:'session-timeout',timeout:run.timeout});
  if(activeIdentity)api.cancel({sessionId:api.sessionId,jobId:activeIdentity.jobId,inputRevision:activeIdentity.inputRevision});
  api.dispose();
 },config.timeoutMs);
 globalThis.__publicModelSession={api,run,input,events,request,record,get tensor(){return resultTensor;},get encoded(){return encoded;},async finish(){
  clearInterval(heartbeat);clearTimeout(timeout);settled=true;
  try{run.resourcesBeforeUnload=expectOk(await request('modelStatus',{}),'status before cleanup');}catch(error){run.statusError=errorInfo(error);}
  try{run.unload=expectOk(await request('unload',{}),'unload');}catch(error){run.cleanupError=errorInfo(error);run.outcome='failed';}
  api.dispose();run.disposed=true;globalThis.Worker=nativeWorker;
  const afterDispose=await api.request(envelope('modelStatus',{}));requireValue(isError(afterDispose,'DISPOSED'),'Disposed owner accepted an operation');run.afterDisposeCode=afterDispose.error.code;
  run.inputIdentitiesAfter=await input.snapshots();run.callerInputsBitExact=JSON.stringify(before)===JSON.stringify(run.inputIdentitiesAfter);
  requireValue(run.callerInputsBitExact,'Public path changed caller-owned input bits');
  if(run.timeout)run.outcome='failed';run.progressCount=progressCount;run.lateProgressCount=lateProgressCount;run.elapsedMs=performance.now()-started;
  run.wasmMemory={observationCount:wasmObservationCount,observationsTail:wasmObservations,retainedObservationLimit:128,peakBytes:wasmPeakBytes,coverage:'Observed main public Worker memories only; process RSS/PSS and JS host buffers are separate'};run.workerLifetimes=workerLifetimes;run.workerObserverRestored=globalThis.Worker===nativeWorker;run.eventCount=eventCount;run.recentEvents=events;run.retainedEventLimit=128;
  record({stage:'finished',outcome:run.outcome});await queue;return plain(run);
 }};
 try{
  if(config.failedPairBeforeRun){
   run.failedPairRecovery=await failPublicPairThenPrepareP4({api,request,HIGH,wasmThreads:config.wasmThreads,operations:run.operations,workerLifetimes});
   record({stage:'failed-pair-recovered',recovery:run.failedPairRecovery});
  }
  loaded=expectOk(await request('load',{files:{HIGH,LOW},resource:{wasmThreads:config.wasmThreads}}),'load actual pair');run.loaded=loaded;
  record({stage:'prepared',modelSessionId:loaded.modelSessionId});
  const normalPredict=(side,model=loaded)=>({side,shapeRequest:input.shapeRequest,tensors:input.tensors,conditioning:input.positive,timestep:config.timestep,modelSessionId:model.modelSessionId});
  const recover=async()=>{
   const recovered=await cancelPublicPatchThenReload({api,request,predictInput:normalPredict,files:{HIGH,LOW},wasmThreads:config.wasmThreads,onProgress,operations:run.operations,loaded});
   loaded=recovered.loaded;run.reloaded=loaded;run.recovery=recovered.recovery;
   record({stage:'cancelled-reloaded',recovery:run.recovery});
  };
  const persist=async(tensor,codecScope)=>{
   resultTensor=tensor;run.tensorMetadata=metadata(resultTensor);run.outputIdentity=await identity(resultTensor.data);run.codecScope=codecScope;
   encoded=expectOk(await request('saveTensor',{tensor:resultTensor}),'canonical save');
   requireValue(encoded.bytes instanceof Uint8Array&&encoded.byteLength===encoded.bytes.byteLength&&await sha(encoded.bytes)===encoded.sha256,'Public canonical writer bytes differ');
   const post=async(name,bytes)=>{const response=await fetch(config.sinkBase+'/'+name,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Content-SHA256':await sha(bytes)},body:bytes});requireValue(response.ok,'Private output save failed: '+name);return await response.json();};
   run.savedPayload=await post('tensor.f32',new Uint8Array(resultTensor.data.buffer,resultTensor.data.byteOffset,resultTensor.data.byteLength));
   run.savedCanonical=await post('tensor.wktensor',encoded.bytes);
   run.codec={sha256:encoded.sha256,byteLength:encoded.byteLength,metadata:metadata(resultTensor)};run.outcome='awaiting-real-file-readback';
  };
  if(config.mode==='smoke'){
   const already=await request('load',{files:{HIGH,LOW},resource:{wasmThreads:config.wasmThreads}});requireValue(isError(already,'MODEL_ALREADY_LOADED'),'Already-loaded owner was discarded');run.operations.push({test:'already-loaded',code:already.error.code});
   const stale=await request('predict',{...normalPredict('HIGH'),modelSessionId:'explicit-stale-model-session'});requireValue(isError(stale,'STALE_MODEL'),'Stale model identity entered numerical owner');run.operations.push({test:'stale-session',code:stale.error.code});
   for(const side of ['HIGH','LOW']){
    const invalid=await request('predict',{...normalPredict(side),timestep:-1});requireValue(invalid.status==='error'&&!['MODEL_NOT_LOADED','STALE_MODEL','NOT_READY'].includes(invalid.error?.code),'Explicit side selection did not reach input validation');run.operations.push({test:'side-invalid-before-neural',side,error:invalid.error});
   }
   await recover();run.smokeCompleted=true;
   await persist(input.tensors[0],'Explicit saved-input codec only; no generated-sample claim from cancelled prefix');
  }else{
   if(config.cancelBeforeRun)await recover();
   let value;
   if(config.mode==='predict')value=normalPredict(config.side);
   else value={shapeRequest:input.shapeRequest,tensors:input.tensors.map((tensor,index)=>index===0?{...tensor,data:input.initialEmptyTarget}:tensor),noise:input.noise,positive:input.positive,negative:input.negative,modelSessionId:loaded.modelSessionId};
   const numeric=expectOk(await request(config.mode,value,{onProgress}),config.mode);resultTensor=numeric.tensor;run.execution=numeric.execution;
   if(run.recovery){
    requireValue(api.sessionId===run.recovery.apiSessionId&&numeric.execution.modelSessionId===run.recovery.reloadedModelSessionId,'Completed numerical result did not belong to the reloaded owner in the same API instance');
    run.recovery.completedOperation={operation:config.mode,modelSessionId:numeric.execution.modelSessionId,apiSessionId:api.sessionId,sameApiInstance:true};
   }
   requireValue(resultTensor.data instanceof Float32Array&&resultTensor.data.every(Number.isFinite),'Normal operation returned nonfinite or nonnative F32');
   if(config.mode==='sample')requireValue(resultTensor.meaning==='wan21-raw-generated-sample:v1'&&resultTensor.latentContract?.normalization?.state==='restored','Sample did not preserve the generated/raw contract');
   else requireValue(resultTensor.meaning==='bernini-flow-velocity:v1','Predict did not return model flow velocity');
   await persist(resultTensor,'Actual normal '+config.mode+' output');
  }
 }catch(error){run.error=errorInfo(error);run.outcome='failed';record({stage:'operation-error',error:run.error});}
 await queue;
 return plain(run);
}

/** Called only after Python has selected the actual O_EXCL disk output as File. */
export async function readbackPublicModelFile(){
 const session=globalThis.__publicModelSession,file=document.querySelector('#saved-tensor').files[0];
 requireValue(session&&file instanceof File&&session.tensor&&session.encoded,'Actual saved File and completed normal output required');
 const decoded=expectOk(await session.request('readTensor',{file}),'canonical actual-file readback');
 requireValue(decoded.sha256===session.encoded.sha256&&decoded.byteLength===session.encoded.byteLength,'Actual File encoded identity differs');
 const before=new Uint32Array(session.tensor.data.buffer,session.tensor.data.byteOffset,session.tensor.data.length),after=new Uint32Array(decoded.tensor.data.buffer,decoded.tensor.data.byteOffset,decoded.tensor.data.length);
 requireValue(before.length===after.length&&before.every((value,index)=>value===after[index]),'Actual File payload bits differ');
 requireValue(JSON.stringify(metadata(session.tensor))===JSON.stringify(metadata(decoded.tensor)),'Actual File metadata differs');
 // Header-only bookkeeping differs from the normal tensor descriptor. Compare
 // every canonical field supplied by saveTensor, preserving meaning/contract.
 for(const [key,value]of Object.entries(session.encoded.metadata))requireValue(JSON.stringify(decoded.tensor[key])===JSON.stringify(value),'Actual File canonical metadata differs: '+key);
 session.run.readback={realDiskFileSelected:true,sha256:decoded.sha256,byteLength:decoded.byteLength,payload:await identity(decoded.tensor.data),payloadElements:before.length,allF32BitsExact:true,metadata:metadata(decoded.tensor)};
 session.run.outcome='completed';session.record({stage:'real-file-readback',payloadElements:before.length,allF32BitsExact:true});
 return plain(session.run.readback);
}

export async function finishPublicModelBrowser(){
 const session=globalThis.__publicModelSession;requireValue(session,'Public model session was not constructed');return await session.finish();
}

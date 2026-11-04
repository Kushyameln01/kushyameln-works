/** Holder-only development harness. Normal requests use the actual management
 * facade; this module has no API injection or numerical implementation port. */
import {createOperationalManagement} from '../../docs/shared/ai-connection/operational-management.mjs';
import {capturePublicModelInputs} from '../../docs/shared/ai-connection/native/diffusion-b6e16647/tools/diffusion-models/public-model-browser.mjs';
import {describeTensor} from '../../docs/shared/ai-connection/native/diffusion-b6e16647/docs/shared/inference/tensor.mjs';

const PUBLIC_WORKER='/docs/shared/ai-connection/native/diffusion-b6e16647/docs/shared/diffusion-models/api/worker.mjs';
const OBSERVER='/tools/ai-connection/diffusion-public-worker-observer.mjs';
const requireValue=(condition,message)=>{if(!condition)throw Error(message);};
const plain=value=>JSON.parse(JSON.stringify(value));
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const identity=async bytes=>({bytes:bytes.byteLength,sha256:await sha(bytes)});
const metadata=tensor=>Object.fromEntries(Object.entries(describeTensor(tensor)).map(([key,value])=>[key,ArrayBuffer.isView(value)?Array.from(value):plain(value)]));
const errorInfo=error=>({name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,4000),...(error?.code?{code:String(error.code)}:{}),...(error?.details?{details:plain(error.details)}:{})});
const expectResult=(reply,label)=>{requireValue(reply?.status==='EXECUTION_COMPLETED'&&reply.nativeReply?.status==='ok',label+' did not return an accepted management/native result');return reply.nativeReply.result;};
const requireError=async(promise,codes,label)=>{try{await promise;}catch(error){requireValue(codes.includes(error?.code),label+': '+String(error?.code??error));return errorInfo(error);}throw Error(label+' unexpectedly succeeded');};

/** Runner compatibility facade over the actual operational controller. It owns
 * no numerical implementation, artifact map, native API or cancellation token. */
export async function createHoldingOperationalManager(configuration={}){
 const controller=createOperationalManagement();
 try{await controller.configureModule('diffusion',configuration);}catch(error){await controller.dispose();throw error;}
 const inspect=()=>{const root=controller.inspect();return {...root.modules.diffusion.observation,activeTarget:root.activeTarget,root,controlTestDouble:root.controlTestDouble};};
 async function execute(operation,input,{requestId='holder:'+crypto.randomUUID(),onProgress}={}){
  let rootTarget=null,progressIdentityError=null;
  const unsubscribe=controller.subscribe(event=>{
   if(event.kind==='started')rootTarget=event.state.activeTarget;
   if(event.kind==='progress'&&event.value.moduleId==='diffusion'){
    const progress=event.value.progress,publicTarget=event.state.modules.diffusion.observation.activeTarget;
    if(!event.state.activeTarget||!publicTarget||event.state.activeTarget.requestId===publicTarget.requestId){progressIdentityError=Error('Root and public progress identities must remain distinct');return;}
    onProgress?.({...progress,rootTarget:event.state.activeTarget,rootRevision:event.state.revision,publicTarget});
   }
  });
  try{
   const reply=await controller.execute({moduleId:'diffusion',operation,input,outputRef:requestId});
   if(progressIdentityError)throw progressIdentityError;
   requireValue(rootTarget&&reply.target&&rootTarget.requestId!==reply.target.requestId,'Root and public terminal identities must remain distinct');
   const rootTerminal=controller.inspect().queue.invocations.find(value=>value.requestId===rootTarget.requestId);
   requireValue(rootTerminal?.originalTerminal&&rootTerminal.resourceReleased&&rootTerminal.resultAccepted,'Operational root terminal/release not confirmed');
   return {...reply,rootTarget,rootTerminal,identitySeparation:{rootRequestId:rootTarget.requestId,rootRevision:rootTarget.revision,publicRequestId:reply.target.requestId,publicManagerRevision:reply.target.managerRevision,nativeInputRevision:reply.target.inputRevision}};
  }finally{unsubscribe();}
 }
 return Object.freeze({inspect,execute,
  load:({files,resource,...options}={})=>execute('load',{files,...(resource!==undefined?{resource}:{})},options),
  modelStatus:options=>execute('modelStatus',{},options),unload:options=>execute('unload',{},options),
  predict:({input,...options}={})=>execute('predict',input,options),sample:({input,...options}={})=>execute('sample',input,options),
  saveTensor:({tensor,...options}={})=>execute('saveTensor',{tensor},options),readTensor:({file,...options}={})=>execute('readTensor',{file},options),
  cancel:target=>controller.cancel(target),dispose:()=>controller.dispose(),
  saveRetainedTensor:ref=>controller.saveTensor(ref),
  openWeightFeed:input=>controller.openWeightFeed(input),getWeightFeedClient:id=>controller.getWeightFeedClient(id),closeWeightFeed:id=>controller.closeWeightFeed(id)
 });
}

export async function startDiffusionPublicBrowser(config){
 requireValue(['smoke','predict','sample'].includes(config.mode),'Explicit mode required');
 requireValue([1,4].includes(config.wasmThreads)&&typeof config.coi==='boolean','Explicit resource and header profile required');
 requireValue(Number.isFinite(config.timeoutMs)&&config.timeoutMs>0,'Bounded session timeout required');
 requireValue(!config.cancelBeforeRun||config.mode==='sample','Cancellation recovery flag requires sample mode');
 const HIGH=document.querySelector('#model-high').files[0],LOW=document.querySelector('#model-low').files[0];
 requireValue(HIGH instanceof File&&LOW instanceof File,'Actual retained HIGH/LOW Files required');
 const windowEnvironment={crossOriginIsolated:globalThis.crossOriginIsolated===true,sharedArrayBuffer:typeof SharedArrayBuffer==='function'};
 requireValue(windowEnvironment.crossOriginIsolated===config.coi,'Observed window isolation differs from explicit header profile');
 if(config.wasmThreads===4)requireValue(config.coi&&windowEnvironment.sharedArrayBuffer,'Four threads require actual COI/SAB; no fallback');
 const response=await fetch('/__case__.json');requireValue(response.ok,'Private manifest unavailable');
 const manifest=await response.json(),input=await capturePublicModelInputs(manifest),before=await input.snapshots();
 const started=performance.now(),nativeWorker=globalThis.Worker;
 let workerEpoch=0,eventCount=0,progressCount=0,lateProgressCount=0,settled=false,queue=Promise.resolve(),manager=null;
 let resultTensor=null,encoded=null,loaded=null,lastProgress=null,wasmObservationCount=0,wasmPeakBytes=0;
 const events=[],workerLifetimes=[],wasmObservations=[],workerEnvironments=[],sampleSteps=[];
 const tail=(array,value)=>{if(array.length===128)array.shift();array.push(value);};
 const record=event=>{const value={elapsedMs:performance.now()-started,...event};eventCount++;tail(events,value);queue=queue.then(()=>globalThis.reportDiffusionCheckpoint?.(value));};
 globalThis.Worker=class extends nativeWorker{
  constructor(url,options){
   const requested=new URL(url,location.href),observed=requested.origin===location.origin&&requested.pathname===PUBLIC_WORKER;
   const epoch=observed?++workerEpoch:null;
   const bootstrap=new URL(OBSERVER,location.href);bootstrap.searchParams.set('worker',requested.href);if(observed)bootstrap.searchParams.set('epoch',String(epoch));
   super(observed?bootstrap:url,options);
   if(observed){
    this.observerEpoch=epoch;workerLifetimes.push({workerEpoch:this.observerEpoch,stage:'constructed',requestedURL:requested.pathname,elapsedMs:performance.now()-started});
    this.addEventListener('message',event=>{if(event.data?.__publicWasmObservation){
     const observation={elapsedMs:performance.now()-started,workerEpoch:this.observerEpoch,...event.data};
     wasmObservationCount++;wasmPeakBytes=Math.max(wasmPeakBytes,observation.peakBytes);tail(wasmObservations,observation);
     if(observation.stage==='worker-bootstrap')workerEnvironments.push({workerEpoch:this.observerEpoch,crossOriginIsolated:observation.crossOriginIsolated,sharedArrayBuffer:observation.sharedArrayBuffer});
     record({stage:'wasm-memory',observation});
    }});
   }
  }
  terminate(){if(this.observerEpoch)workerLifetimes.push({workerEpoch:this.observerEpoch,stage:'terminate-called',elapsedMs:performance.now()-started});return super.terminate();}
 };
 const run={schemaVersion:'works-diffusion-public-management-browser/0.1',sourceCommit:config.sourceCommit,
  mode:config.mode,wasmThreads:config.wasmThreads,coiHeadersRequested:config.coi,windowEnvironment,
  caseClass:manifest.caseClass,profileId:manifest.profileId,
  managementPath:'createOperationalManagement -> configured diffusion -> createDiffusionPublicManagement -> adopted createDiffusionModels -> dedicated Worker -> native model owner',
  controlTestDouble:false,publicWorkerConnected:false,nativeNNExecuted:false,
  conditioningFixture:'Separate owned positive/negative copies of the same saved real L512 packet; CFG1, not original prompt-pair acceptance',
  inputIdentitiesBefore:before,operations:[],outcome:'failed',error:null,
  numericalReferencePassed:false,generationReady:false,originalWorkflowAccepted:false};
 const request=async(operation,args={})=>{
  const requestId='holder:'+operation+':'+crypto.randomUUID();record({stage:'request-start',operation,requestId});
  try{
   const reply=await manager[operation]({...args,requestId});
   expectResult(reply,operation);
   record({stage:'request-terminal',operation,requestId,status:reply.status,rootTarget:reply.rootTarget,publicTarget:reply.target,identitySeparation:reply.identitySeparation,rootTerminal:reply.rootTerminal,terminal:{originalTerminal:reply.terminal?.originalTerminal,resourceReleased:reply.terminal?.resourceReleased,resultAccepted:reply.terminal?.resultAccepted}});
   return reply;
  }catch(error){record({stage:'request-terminal',operation,requestId,status:'error',error:errorInfo(error)});throw error;}
 };
 const onProgress=event=>{
  if(settled){lateProgressCount++;return;}
  lastProgress={sessionId:event.sessionId,jobId:event.jobId,inputRevision:event.inputRevision,managerRevision:event.managerRevision,requestId:event.requestId,rootTarget:event.rootTarget,rootRevision:event.rootRevision,publicTarget:event.publicTarget,op:event.op,result:event.result};
  progressCount++;if(event.result?.model?.stage==='patch')run.nativeNNExecuted=true;
  if(event.op==='sample'&&event.result?.stage==='step-complete')sampleSteps.push({step:event.result.step,steps:event.result.steps,side:event.result.side});
  record({stage:'progress',identity:{sessionId:event.sessionId,jobId:event.jobId,inputRevision:event.inputRevision,managerRevision:event.managerRevision,requestId:event.requestId,rootTarget:event.rootTarget,rootRevision:event.rootRevision,publicTarget:event.publicTarget,op:event.op},progress:event.result});
 };
 const heartbeat=setInterval(()=>record({stage:'heartbeat',lastProgress,progressCount}),15000);
 const timeout=setTimeout(()=>{
  run.timeout={timeoutMs:config.timeoutMs,activeTarget:manager?.inspect().activeTarget??null,lastProgress};run.outcome='failed';record({stage:'session-timeout',timeout:run.timeout});
  const target=manager?.inspect().activeTarget;if(target)void manager.cancel(target).catch(error=>record({stage:'timeout-cancel-error',error:errorInfo(error)}));
 },config.timeoutMs);
 globalThis.__diffusionManagementSession={run,input,record,request,get manager(){return manager;},get tensor(){return resultTensor;},get encoded(){return encoded;},async finish(){
  clearInterval(heartbeat);clearTimeout(timeout);settled=true;
  if(manager){
   try{run.resourcesBeforeUnload=expectResult(await request('modelStatus'),'status before cleanup');}catch(error){run.statusError=errorInfo(error);run.outcome='failed';}
   try{
    run.unload=expectResult(await request('unload'),'unload');
    requireValue(run.unload.unloaded===true&&!manager.inspect().loaded&&!manager.inspect().cleanupRequired,'Management/native unload was not confirmed');
   }catch(error){run.cleanupError=errorInfo(error);run.outcome='failed';}
   try{run.disposition=await manager.dispose();run.disposed=run.disposition.disposed===true;}catch(error){run.disposeError=errorInfo(error);run.outcome='failed';}
  }
  globalThis.Worker=nativeWorker;
  run.inputIdentitiesAfter=await input.snapshots();run.callerInputsBitExact=JSON.stringify(before)===JSON.stringify(run.inputIdentitiesAfter);
  if(!run.callerInputsBitExact){run.outcome='failed';run.inputOwnershipError='Caller input bits changed';}
  const expectedWorkers=workerLifetimes.filter(value=>value.stage==='constructed').length;
  run.resourceEnvironmentVerified=expectedWorkers>0&&workerEnvironments.length===expectedWorkers&&workerEnvironments.every(value=>value.crossOriginIsolated===config.coi&&(config.wasmThreads!==4||value.sharedArrayBuffer===true));
  if(!run.resourceEnvironmentVerified||run.timeout)run.outcome='failed';
  run.workerEnvironments=workerEnvironments;run.workerLifetimes=workerLifetimes;
  run.wasmMemory={observationCount:wasmObservationCount,observationsTail:wasmObservations,retainedObservationLimit:128,peakBytes:wasmPeakBytes,coverage:'Observed main public Worker WASM memories only; process RSS/PSS, JS buffers and unexported allocations are separate; terminate calls are not physical-close proof'};
  run.progressCount=progressCount;run.lateProgressCount=lateProgressCount;run.sampleStepCompletions=sampleSteps;run.elapsedMs=performance.now()-started;
  run.workerObserverRestored=globalThis.Worker===nativeWorker;run.eventCount=eventCount;run.recentEvents=events;run.retainedEventLimit=128;
  record({stage:'finished',outcome:run.outcome});await queue;return plain(run);
 }};
 try{
  // Default operational configuration creates the adopted real public factory.
  manager=await createHoldingOperationalManager({apiSessionId:'management-public:'+crypto.randomUUID(),managerSessionId:'holder-management:'+crypto.randomUUID()});
  const admission=manager.inspect();requireValue(admission.controlTestDouble===false,'Real management API factory required');
  run.apiSessionId=admission.apiSessionId;run.managerSessionId=admission.managerSessionId;
  run.capabilities={modelRuntime:admission.modelRuntime,legacyModelInference:admission.capabilities?.modelInference};
  loaded=expectResult(await request('load',{files:{HIGH,LOW},resource:{wasmThreads:config.wasmThreads}}),'load pair');run.loaded=loaded;
  requireValue(loaded.resource?.wasmThreads===config.wasmThreads&&loaded.resource?.crossOriginIsolated===config.coi,'Native prepared resource profile differs; no fallback is allowed');
  run.publicWorkerConnected=loaded.publicWorkerConnected===true;record({stage:'prepared',modelSessionId:loaded.modelSessionId,modelEpoch:loaded.modelEpoch});
  const normalPredict=(side,model=loaded)=>({side,shapeRequest:input.shapeRequest,tensors:input.tensors,conditioning:input.positive,timestep:config.timestep,modelSessionId:model.modelSessionId});
  const recover=async()=>{
   let cancellation=null,cancelTarget=null,cancelledAtPatch=false,cancelError=null;
   const cancelledWorkerEpoch=workerLifetimes.filter(value=>value.stage==='constructed').at(-1)?.workerEpoch;
   const cancelled=await requireError(request('predict',{input:normalPredict('HIGH'),onProgress:event=>{
    onProgress(event);
    if(!cancelledAtPatch&&event.result?.model?.stage==='patch'){
     cancelledAtPatch=true;cancelTarget=manager.inspect().activeTarget;
     cancellation=manager.cancel(cancelTarget);cancellation.catch(error=>{cancelError=errorInfo(error);});
    }
   }}),['INVOCATION_CANCELLED','CANCELLED'],'Actual prefix cancel');
   const terminal=cancellation?await cancellation:null;
   requireValue(cancelledAtPatch&&terminal?.originalTerminal&&terminal.resourceReleased&&terminal.stopConfirmed&&!cancelError,'Actual prefix cancellation did not confirm the operational root terminal');
   requireValue(workerLifetimes.some(value=>value.workerEpoch===cancelledWorkerEpoch&&value.stage==='terminate-called'),'Actual prefix cancellation did not terminate the observed owned Worker');
   const closeDeadline=performance.now()+30000;let closeProof=null;
   do{
    closeProof=await globalThis.diffusionWorkerCloseState(cancelledWorkerEpoch);
    if(closeProof.observed&&closeProof.closed)break;
    await new Promise(resolve=>setTimeout(resolve,100));
   }while(performance.now()<closeDeadline);
   requireValue(closeProof?.observed&&closeProof.closed&&closeProof.event==='playwright-worker-close','Cancelled Worker physical close was not observed before reload');
   record({stage:'cancelled-worker-closed',workerEpoch:cancelledWorkerEpoch,proof:closeProof});
   const afterCancel=manager.inspect();requireValue(afterCancel.reloadRequired&&!afterCancel.loaded&&afterCancel.modelSessionId===null,'Cancelled model must require reload');
   run.operations.push({test:'actual-patch-cancel',error:cancelled,target:cancelTarget,originalTerminal:true});
   run.operations.push({test:'cancel-retry-needs-load',error:await requireError(request('predict',{input:normalPredict('LOW')}),['MODEL_NOT_LOADED'],'Cancelled retry')});
   const old=loaded;loaded=expectResult(await request('load',{files:{HIGH,LOW},resource:{wasmThreads:config.wasmThreads}}),'reload');
   requireValue(loaded.modelSessionId!==old.modelSessionId&&manager.inspect().apiSessionId===run.apiSessionId,'Reload must replace model identity in the same public API instance');
   const reloadedWorkerEpoch=workerLifetimes.filter(value=>value.stage==='constructed').at(-1)?.workerEpoch;
   requireValue(reloadedWorkerEpoch!==cancelledWorkerEpoch,'Reload reused the cancelled Worker realm');
   const oldError=await requireError(request('predict',{input:{...normalPredict('LOW'),modelSessionId:old.modelSessionId}}),['STALE_MODEL'],'Old model session');
   run.operations.push({test:'reload-old-session-rejected',error:oldError,authority:'Management admission preserves the native model-session authority; rejected before Worker numerical dispatch'});
   run.reloaded=loaded;run.recovery={apiSessionId:run.apiSessionId,cancelledModelSessionId:old.modelSessionId,reloadedModelSessionId:loaded.modelSessionId,cancelledWorkerEpoch,reloadedWorkerEpoch,cancelledWorkerClosedBeforeReload:closeProof,cancelTarget,cancelledAtPatch:true,originalTerminal:true,completedOperation:null};
   record({stage:'cancelled-reloaded',recovery:run.recovery});
  };
  const persist=async(tensor,scope,outputRef)=>{
   resultTensor=tensor;run.tensorMetadata=metadata(tensor);run.outputIdentity=await identity(tensor.data);run.codecScope=scope;
   encoded=expectResult(await request('saveTensor',{tensor}),'save tensor');
   requireValue(encoded.bytes instanceof Uint8Array&&encoded.byteLength===encoded.bytes.byteLength&&await sha(encoded.bytes)===encoded.sha256,'Native canonical bytes differ');
   if(outputRef){
    // This Blob comes from the controller's retained artifact, not a runner map.
    const retained=await manager.saveRetainedTensor(outputRef),decoded=expectResult(await request('readTensor',{file:retained}),'controller-owned artifact readback');
    requireValue(decoded.sha256===encoded.sha256&&JSON.stringify(metadata(decoded.tensor))===JSON.stringify(metadata(tensor)),'Controller retained artifact differs from the native output');
    run.controllerArtifact={outputRef,persistedBy:'createOperationalManagement.saveTensor',canonicalSHA256:decoded.sha256,byteLength:decoded.byteLength,nativeReadbackBitExact:await sha(decoded.tensor.data)===await sha(tensor.data)};
    requireValue(run.controllerArtifact.nativeReadbackBitExact,'Controller retained artifact payload differs');
   }
   const post=async(name,bytes)=>{const response=await fetch(config.sinkBase+'/'+name,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Content-SHA256':await sha(bytes)},body:bytes});requireValue(response.ok,'Actual private disk save failed: '+name);return await response.json();};
   run.savedPayload=await post('tensor.f32',new Uint8Array(tensor.data.buffer,tensor.data.byteOffset,tensor.data.byteLength));
   run.savedCanonical=await post('tensor.wktensor',encoded.bytes);
   run.codec={sha256:encoded.sha256,byteLength:encoded.byteLength,metadata:metadata(tensor)};run.outcome='awaiting-real-file-readback';
  };
  if(config.mode==='smoke'){
   run.operations.push({test:'already-loaded',error:await requireError(request('load',{files:{HIGH,LOW},resource:{wasmThreads:config.wasmThreads}}),['MODEL_ALREADY_LOADED'],'Duplicate load')});
   for(const side of ['HIGH','LOW'])run.operations.push({test:'side-invalid-before-neural',side,error:await requireError(request('predict',{input:{...normalPredict(side),timestep:-1}}),['COMPUTE_ERROR'],'Explicit side invalid input')});
   await recover();run.smokeCompleted=true;
   await persist(input.tensors[0],'Explicit saved-input codec only; cancelled prefix does not establish generated sample numerics');
  }else{
   if(config.cancelBeforeRun)await recover();
   if(config.baseWeightProbe){
    const feed=await manager.openWeightFeed({side:config.side,modelSessionId:loaded.modelSessionId});
    try{
     const client=manager.getWeightFeedClient(feed.feedId),description=await client.describe(),base=await client.baseProvider.describe();
     const block=await client.baseProvider.readBlock('blocks.0.cross_attn.q.weight',0,5120,{...base,fullShape:[5120,5120]});
     requireValue(block instanceof Float32Array&&block.length===5120&&block.every(Number.isFinite),'Bounded immutable base read failed');
     run.baseWeightProbe={binding:feed.binding,protocol:feed.protocol,descriptionSHA256:await sha(new TextEncoder().encode(JSON.stringify(description))),baseIdentity:base,weightId:'blocks.0.cross_attn.q.weight',offset:0,elements:block.length,readIdentity:await identity(block),realLoraLoaded:false,packagePrepared:false};
    }finally{run.baseWeightProbeClose=await manager.closeWeightFeed(feed.feedId);requireValue(run.baseWeightProbeClose.closed===true,'Base-only feed was not closed before NN');}
   }
   const nativeInput=config.mode==='predict'?normalPredict(config.side):{shapeRequest:input.shapeRequest,tensors:input.tensors.map((tensor,index)=>index===0?{...tensor,data:input.initialEmptyTarget}:tensor),noise:input.noise,positive:input.positive,negative:input.negative,modelSessionId:loaded.modelSessionId};
   const reply=await request(config.mode,{input:nativeInput,onProgress});
   const numeric=expectResult(reply,config.mode);resultTensor=numeric.tensor;run.execution=numeric.execution;
   requireValue(reply.normalExecution===true&&reply.snapshot?.executionScope?.kind==='normal'&&reply.artifactRecord,'Actual tensor was not connected to normal management result/snapshot/artifact');
   requireValue(reply.artifact?.tensor&&reply.artifact?.snapshot?.executionScope?.kind==='normal','Operational controller did not retain the actual normal tensor/snapshot');
   requireValue(await sha(reply.artifact.tensor.data)===await sha(resultTensor.data),'Operational artifact payload differs from the public result');
   run.managementResult={status:reply.status,normalExecution:reply.normalExecution,rootTarget:reply.rootTarget,publicTarget:reply.target,identitySeparation:reply.identitySeparation,rootTerminal:reply.rootTerminal,terminal:reply.terminal,snapshot:reply.snapshot,artifactRecord:reply.artifactRecord,controllerArtifactDescriptor:reply.artifact.descriptor,edgeDecisions:reply.edgeDecisions};
   requireValue(numeric.execution.publicWorkerConnected===true&&numeric.execution.modelSessionId===loaded.modelSessionId,'Numerical result did not belong to current native owner');
   requireValue(resultTensor.data instanceof Float32Array&&resultTensor.data.every(Number.isFinite),'Actual output must be finite native F32');run.nativeNNExecuted=true;
   if(config.mode==='sample'){
    requireValue(resultTensor.meaning==='wan21-raw-generated-sample:v1'&&resultTensor.latentContract?.normalization?.state==='restored','Raw sample meaning/restored latentContract changed');
    requireValue(sampleSteps.length===6&&sampleSteps.every((value,index)=>value.step===index&&value.steps===6&&value.side===(index<3?'HIGH':'LOW')),'Actual six-update HIGH3/LOW3 progress was not observed');
   }else requireValue(resultTensor.meaning==='bernini-flow-velocity:v1','Predict velocity meaning changed');
   if(run.recovery)run.recovery.completedOperation={operation:config.mode,modelSessionId:numeric.execution.modelSessionId,apiSessionId:run.apiSessionId,sameApiInstance:true};
   await persist(resultTensor,'Actual operational controller '+config.mode+' output',reply.outputRef);
  }
 }catch(error){run.error=errorInfo(error);run.outcome='failed';record({stage:'operation-error',error:run.error});}
 await queue;return plain(run);
}

/** Host calls this only after selecting its O_EXCL disk output as an actual File. */
export async function readbackDiffusionPublicFile(){
 const session=globalThis.__diffusionManagementSession,file=document.querySelector('#saved-tensor').files[0];
 requireValue(session&&file instanceof File&&session.tensor&&session.encoded,'Actual disk File and completed tensor required');
 const decoded=expectResult(await session.request('readTensor',{file}),'actual-file readback');
 requireValue(decoded.sha256===session.encoded.sha256&&decoded.byteLength===session.encoded.byteLength,'Actual File identity differs');
 const before=new Uint32Array(session.tensor.data.buffer,session.tensor.data.byteOffset,session.tensor.data.length),after=new Uint32Array(decoded.tensor.data.buffer,decoded.tensor.data.byteOffset,decoded.tensor.data.length);
 requireValue(before.length===after.length&&before.every((value,index)=>value===after[index]),'Actual File payload F32 bits differ');
 requireValue(JSON.stringify(metadata(session.tensor))===JSON.stringify(metadata(decoded.tensor)),'Actual File tensor metadata differs');
 for(const [key,value]of Object.entries(session.encoded.metadata))requireValue(JSON.stringify(decoded.tensor[key])===JSON.stringify(value),'Canonical metadata differs: '+key);
 session.run.readback={realDiskFileSelected:true,sha256:decoded.sha256,byteLength:decoded.byteLength,payload:await identity(decoded.tensor.data),payloadElements:before.length,allF32BitsExact:true,metadata:metadata(decoded.tensor)};
 session.run.outcome='completed';session.record({stage:'real-file-readback',payloadElements:before.length,allF32BitsExact:true});return plain(session.run.readback);
}

export async function finishDiffusionPublicBrowser(){
 const session=globalThis.__diffusionManagementSession;requireValue(session,'Management session was not constructed');return await session.finish();
}

// One explicit VAE case through the normal API. References are compared in Python.
import {createInferenceAPI,encodeTensor,decodeTensor,describeTensor} from '/shared/inference/api.mjs';
import {Sha256} from '/shared/vr180/sha256.mjs';

const check=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const elementCount=shape=>shape.reduce((n,value)=>n*value,1);
const hash=bytes=>{const digest=new Sha256();for(let i=0;i<bytes.byteLength;i+=8*1024*1024)digest.update(bytes.subarray(i,i+8*1024*1024));return digest.digestHex();};
const metadata=tensor=>describeTensor(tensor);
let current=null;

function contextFor(spec,operation){
 const frames=operation==='encode'?spec.case.rgbShape[2]:spec.case.decodeRgbShape[2];
 const indices=Array.from({length:frames},(_,index)=>index===2?1:index);
 return {schemaVersion:1,contextId:spec.case.id+'-'+operation,inputId:'synthetic-'+spec.case.id,
  inputSha256:spec.references[operation].input.sha256,slotId:spec.case.role,
  sourceFrameIndices:indices,sourceFrameTimesSeconds:indices.map(index=>index/24)};
}
function descriptorFor(spec,operation){
 return {dtype:'float32',layout:'NCTHW',shape:[...spec.references[operation].input.shape],
  meaning:operation==='encode'?'raw-decoder-rgb':'wan21-raw-latent:v1',
  ...(operation==='decode'?{modelSha256:spec.modelSha256}:{}),context:contextFor(spec,operation)};
}
function expectedProcessing(spec,operation){
 const latentFrames=spec.case.latentShape[2],consumedFrames=spec.case.decodeRgbShape[2];
 const sourceFrames=operation==='encode'?spec.case.rgbShape[2]:consumedFrames;
 return {sourceFrames,latentFrames,consumedFrames,ignoredTailFrames:sourceFrames-consumedFrames,
  decodedFrames:consumedFrames,tailRule:'native-floor-complete-groups-of-four-after-first-frame',
  consumedFrameIndices:Array.from({length:consumedFrames},(_,i)=>i),
  ignoredTailFrameIndices:Array.from({length:sourceFrames-consumedFrames},(_,i)=>consumedFrames+i)};
}
function errorRecord(error){return {name:error.name,message:error.message,stack:error.stack};}
async function rejects(action,pattern,label){
 try{await action();}catch(error){check(pattern.test(String(error)),label+' rejected unexpectedly: '+error);return String(error);}
 throw Error(label+' was accepted');
}
function makeAPI(session){
 let api;
 api=createInferenceAPI({workerFactory:()=>{
  const record={index:session.workers.length,phase:session.phase,operation:session.operation,terminated:false,observations:[]};
  session.workers.push(record);
  const worker=new Worker('/harness/vae/stream_observer_worker.mjs',{type:'module'});
  const terminate=worker.terminate.bind(worker);
  worker.terminate=()=>{if(!record.terminated){record.terminated=true;record.terminatedAtEpochMs=Date.now();}return terminate();};
  worker.addEventListener('message',({data})=>{
   if(data.type==='vae-observation'){
    check(record.observations.length<4,'Observer emitted an unbounded per-unit event list');
    record.observations.push({jobId:data.jobId,inputRevision:data.inputRevision,...data.observation});
   }
  });
  return worker;
 },onState:state=>{
  session.lastState={status:state.status,module:state.module,operation:state.operation,inputRevision:state.inputRevision};
  const progress=state.progress;
  if(!progress)return;
  session.progressCounts[progress.phase]=(session.progressCounts[progress.phase]??0)+1;
  session.lastProgress=structuredClone(progress);
  if(progress.phase==='chunk-start'||progress.phase==='chunk-complete'){
   const value={controlPhase:session.phase,...progress};session.chunks.push(value);
   check(session.chunks.length<=90,'Unexpected number of chunk progress events');
   console.log('vae-stream-progress:'+JSON.stringify(value));
  }
  if(session.phase==='cancel-first-chunk'&&!session.cancelTriggered&&progress.phase==='chunk-complete'&&progress.chunkIndex===0){
   session.cancelTriggered=true;session.cancelAt=structuredClone(progress);session.cancelReturned=api.vae.cancel();
   console.log('vae-stream-lifecycle:'+JSON.stringify({boundary:'cancel-returned',operation:session.operation,atEpochMs:Date.now(),cancelReturned:session.cancelReturned}));
  }
 }});
 return api;
}

globalThis.prepareVaeStream=async spec=>{
 check(current===null,'Dispose the previous explicit VAE case first');
 const session={spec,phase:'capabilities',operation:null,workers:[],progressCounts:{},chunks:[],urls:new Map(),
  prepared:false,controlsDone:false,operations:{}};
 current=session;
 try{
  const files=new Map();
  for(const file of document.querySelector('#bundle').files){check(!files.has(file.name),'Duplicate local asset basename');files.set(file.name,file);}
  const manifestFile=files.get('manifest.json');check(manifestFile instanceof File,'Actual selected manifest File is required');
  const bytes=new Uint8Array(await manifestFile.arrayBuffer());
  check(hash(bytes)===spec.manifestSha256,'Selected manifest bytes differ from verified bundle');
  const manifest=JSON.parse(new TextDecoder().decode(bytes));
  check(manifest.kind==='wan21-vae-stream-v1'&&manifest.model.sha256===spec.modelSha256,'Expected original streaming VAE bundle');
  for(const asset of Object.values(manifest.assets)){
   const file=files.get(asset.file);check(file instanceof File&&file.size===asset.bytes,'Actual local asset File missing or wrong size: '+asset.file);
  }
  session.config={manifest,files,diagnostics:false};session.api=makeAPI(session);
  session.configured=session.api.vae.configure(session.config);
  const capabilities={};
  for(const operation of spec.operations){
   const input=document.querySelector('#'+operation+'-input').files[0],expected=spec.references[operation].input;
   check(input instanceof File&&input.name===expected.file&&input.size===expected.bytes,'Actual source input File missing or wrong size');
   const caps=session.api.vae.capabilities({operation,input:descriptorFor(spec,operation)});
   check(caps.runtime.encode.verified===false&&caps.runtime.decode.verified===false,'Capabilities must not invent runtime verification');
   if(caps.support?.supported===true){
    check(same(caps[operation].input.shape,expected.shape),'Capability query changed full input shape');
    check(same(caps[operation].output.shape,spec.references[operation].output.shape),'Capability query changed exact output shape');
   }
   capabilities[operation]=caps;
  }
  check(session.workers.length===0,'Capabilities spawned a numerical Worker');
  session.prepared=true;
  const blocked=Object.values(capabilities).some(caps=>caps.support?.supported!==true);
  return {passed:!blocked,status:blocked?'BLOCKED_CAPABILITY':'CAPABILITIES_READY',capabilities,
   configured:session.configured,workersCreated:session.workers.length,manifestSha256:spec.manifestSha256,
   scope:'Structural exact-descriptor support; no numerical execution performed'};
 }catch(error){return {passed:false,status:'FAILED',error:errorRecord(error)};}
};

async function runOperation({operation,controls=false}){
 const session=current,result={passed:false,operation,status:'RUNNING'};
 try{
  check(session?.prepared&&session.spec.operations.includes(operation),'Prepare one supported explicit case first');
  const spec=session.spec,api=session.api;session.operation=operation;
  const sourceFile=document.querySelector('#'+operation+'-input').files[0];
  const bytes=new Uint8Array(await sourceFile.arrayBuffer());
  check(hash(bytes)===spec.references[operation].input.sha256,'Actual source input File SHA256 mismatch');
  check(new Uint8Array(new Uint16Array([1]).buffer)[0]===1,'Little-endian host required');
  const input={...descriptorFor(spec,operation),data:new Float32Array(bytes.buffer)};
  check(input.data.length===elementCount(input.shape),'NCTHW source file element count mismatch');
  if(controls&&!session.controlsDone){
   session.phase='cheap-lifecycle-controls';
   const before=session.workers.length;
   const reconfigured=api.vae.configure(session.config);
   check(reconfigured.runtime.encode.verified===false&&reconfigured.runtime.decode.verified===false,'Reconfigure retained prior runtime state');
   const disposable=makeAPI(session);disposable.vae.configure(session.config);disposable.dispose();
   const disposedCapability=disposable.vae.capabilities({operation,input:descriptorFor(spec,operation)});
   check(disposedCapability.support?.code==='MODULE_DISPOSED','Disposed owner did not reject capability');
   const disposedError=await rejects(()=>disposable.vae[operation](input),/disposed/i,'Disposed normal owner');
   check(session.workers.length===before,'Cheap configure/dispose dispatched model execution');
   result.controls={reconfigureBeforeNormal:true,disposedCapability,disposedError,cheapControlsWorkers:0};
   session.phase='cancel-first-chunk';session.cancelTriggered=false;
   result.controls.cancelError=await rejects(()=>api.vae[operation](input),/cancelled/i,'Cancellation after actual first complete chunk');
   check(session.cancelTriggered&&session.cancelReturned&&session.lastState.status==='cancelled','Normal API failed first-chunk cancellation');
   console.log('vae-stream-lifecycle:'+JSON.stringify({boundary:'cancel-rejected',operation,atEpochMs:Date.now()}));
   result.controls.cancelAt=session.cancelAt;result.controls.cancelReturned=session.cancelReturned;
   result.controls.recoveryUsesSameAPI=true;session.controlsDone=true;
  }
  session.phase=controls&&session.controlsDone?'normal-recovery':'normal';
  console.log('vae-stream-lifecycle:'+JSON.stringify({boundary:'before-normal-recovery',operation,atEpochMs:Date.now(),recovery:controls&&session.controlsDone}));
  const started=performance.now(),output=await api.vae[operation](input);
  result.normalWallSeconds=(performance.now()-started)/1000;
  check(output.tensor&&output.inputDescriptor&&output.binding,'Normal VAE result is missing its public fields');
  check(!Object.hasOwn(output,'evidence'),'Normal diagnostics:false result unexpectedly contains evidence');
  check(!Object.hasOwn(output.inputDescriptor,'data'),'Normal input descriptor contains numerical payload');
  const tensor=output.tensor,expected=spec.references[operation].output;
  check(same(tensor.shape,expected.shape)&&tensor.dtype==='float32'&&tensor.layout==='NCTHW','Exact native output dtype/layout/shape mismatch');
  check(tensor.meaning===(operation==='encode'?'raw-posterior-mean':'raw-decoder-rgb'),'Output meaning mismatch');
  check(tensor.modelSha256===spec.modelSha256&&tensor.normalization===undefined&&tensor.latentContract===undefined,'Raw output model/normalization contract mismatch');
  check(same(output.inputDescriptor,metadata(input)),'Normal input descriptor lost actual input metadata');
  check(output.binding.assetsVerified===true&&output.binding.graphMetadataChecked===true,'Normal binding did not verify graphs/assets');
  check(same(output.binding.inputShape,input.shape)&&same(output.binding.outputShape,tensor.shape),'Normal binding full shapes differ');
  const processing=expectedProcessing(spec,operation);
  check(same(output.processing,processing),'Actual source/consumed/tail processing differs from declared native source');
  const wantedContext=structuredClone(input.context);
  wantedContext.sourceFrameIndices=wantedContext.sourceFrameIndices.slice(0,processing.consumedFrames);
  wantedContext.sourceFrameTimesSeconds=wantedContext.sourceFrameTimesSeconds.slice(0,processing.consumedFrames);
  check(same(tensor.context,wantedContext),'Output context did not preserve consumed order/duplicates/times');
  if(tensor.frameProcessing!==undefined){
   const f=tensor.frameProcessing;
   check(f.schemaVersion===1&&f.policy==='wan21-causal-floor-v1'&&f.sourceFrames===processing.sourceFrames&&
    f.latentFrames===processing.latentFrames&&f.consumedFrames===processing.consumedFrames&&f.unusedTailFrames===processing.ignoredTailFrames,'Output frameProcessing mismatch');
   if(f.sourceContext)check(same(f.sourceContext,input.context),'frameProcessing lost full original source mapping');
  }
  check(hash(bytes)===spec.references[operation].input.sha256,'Normal API mutated caller input bytes');
  const worker=session.workers.findLast(value=>value.phase===session.phase&&value.operation===operation);
  const observation=worker?.observations.findLast(value=>value.stage==='native-final');
  check(worker?.terminated&&observation,'Normal Worker final observation/termination missing');
  check(observation.created>0&&observation.created===observation.released&&observation.active===0&&
   observation.maximumActive===1&&observation.runCalls>=observation.created&&observation.tensorDisposeCalls>=2*observation.runCalls,
   'Actual ORT sessions/Tensors were not sequential and released');
  for(const name of ['createErrors','runErrors','releaseErrors','tensorDisposeErrors'])check(observation[name]===0,'Observed native lifecycle error: '+name);
  const serialized=await encodeTensor(tensor),restored=await decodeTensor(serialized);
  check(same(metadata(restored),metadata(tensor)),'Normal save/read changed metadata/context/frameProcessing');
  check(restored.data.length===tensor.data.length,'Normal save/read changed element count');
  for(let index=0;index<tensor.data.length;index++)check(Object.is(restored.data[index],tensor.data[index]),'Normal save/read changed a numerical value');
  const name=operation+'-'+spec.case.id+'.wktensor',url=URL.createObjectURL(new Blob([serialized],{type:'application/octet-stream'}));
  session.urls.set(operation,url);const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();
  result.output={tensor:metadata(tensor),inputDescriptor:output.inputDescriptor,binding:output.binding,processing:output.processing,resultKeys:Object.keys(output)};
  result.observation=observation;result.codec={bytes:serialized.byteLength,download:name,allValuesExact:true,metadataExact:true};
  result.inputPreserved=true;result.passed=true;result.status='NORMAL_OUTPUT_SAVED';
  result.capabilitiesAfter=api.vae.capabilities({operation,input:metadata(input)});
  session.operations[operation]=result;
 }catch(error){result.status='FAILED';result.error=errorRecord(error);result.lastProgress=session?.lastProgress??null;result.workers=session?.workers??[];}
 return result;
}

globalThis.runVaeStreamOperation=async options=>{
 const timeoutMs=options.timeoutMs??7200000;
 check(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=2147483647,'Bounded operation timeout required');
 let timer;
 try{
  return await Promise.race([runOperation(options),new Promise(resolve=>{
   timer=setTimeout(()=>{
    const session=current;session?.api?.vae.cancel();
    resolve({passed:false,status:'FAILED',operation:options.operation,
     error:{name:'TimeoutError',message:'Explicit operation deadline expired; owned normal API Worker cancelled'},
     lastProgress:session?.lastProgress??null,workers:session?.workers??[]});
   },timeoutMs);
  })]);
 }finally{clearTimeout(timer);}
};

globalThis.releaseVaeStreamDownload=operation=>{
 const url=current?.urls.get(operation);if(url){URL.revokeObjectURL(url);current.urls.delete(operation);}return true;
};
globalThis.disposeVaeStream=()=>{
 const session=current;if(!session)return {disposed:true,workers:[]};
 session.api?.dispose();for(const url of session.urls.values())URL.revokeObjectURL(url);
 const result={disposed:true,workers:session.workers,progressCounts:session.progressCounts,chunks:session.chunks,lastState:session.lastState};
 current=null;return result;
};

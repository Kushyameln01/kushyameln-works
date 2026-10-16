import {validateRequest,BUILD_ID,WASM_SHA256} from './protocol.mjs';
import {prepareKernelModule} from './kernel.mjs';

const MAX_OUTSTANDING=12,MAX_INPUT_BYTES=16*1024*1024,MAX_RESULTS=16,MAX_RESULT_BYTES=8*1024*1024;
const terminal=status=>status==='succeeded'||status==='failed'||status==='cancelled';

export function createComputePool({concurrency=2,moduleReuse=false,onUpdate=()=>{},workerFactory=()=>new Worker(new URL('./pool-worker.mjs',import.meta.url),{type:'module'}),prepareModule=prepareKernelModule}={}) {
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw RangeError('concurrency must be 1..4');
  if(typeof moduleReuse!=='boolean'||typeof onUpdate!=='function'||typeof workerFactory!=='function'||typeof prepareModule!=='function')throw TypeError('Invalid pool options');
  const records=new Map(),queue=[],retained=[],pendingCohorts=new Set();
  const abortController=new AbortController();
  let disposed=false,generation=0,running=0,outstanding=0,inputBytes=0,retainedBytes=0,draining=false,cachedModule=null,compileCalls=0,preparationFailure=null,notificationDepth=0,releasing=false;

  const statusOf=r=>({jobId:r.jobId,inputRevision:r.inputRevision,generation:r.generation,status:r.status,phase:r.phase});
  const snapshot=()=>({buildId:BUILD_ID,disposed,concurrency,moduleReuse,queued:outstanding-running,running,outstanding,inputBytes,retainedCount:retained.length,retainedBytes,compileCalls});
  function notify(record) {notificationDepth++;try{onUpdate({...statusOf(record),snapshot:snapshot()});}catch{}finally{notificationDepth--;flushCohorts();}}
  function matching(record,data) {
    return data&&data.protocolVersion===1&&data.buildId===BUILD_ID&&data.taskType===record.taskType&&data.taskVersion===1&&data.jobId===record.jobId&&data.inputRevision===record.inputRevision&&data.generation===record.generation;
  }
  function evict() {
    while(retained.length>MAX_RESULTS||retainedBytes>MAX_RESULT_BYTES){const r=retained.shift();retainedBytes-=r.resultBytes;records.delete(r.jobId);}
  }
  function releaseWhenReady(cohort) {
    if(!cohort||cohort.released)return;
    pendingCohorts.add(cohort);flushCohorts();
  }
  function flushCohorts() {
    if(disposed||notificationDepth||releasing)return;
    releasing=true;
    try {
      while(pendingCohorts.size&&!disposed){
        const cohort=pendingCohorts.values().next().value;
        pendingCohorts.delete(cohort);
        if(cohort.released)continue;
        const members=Array.from(cohort.members);
        if(!members.every(r=>r.status==='running'&&r.ready&&r.worker))continue;
        cohort.released=true;cohort.members.clear();
        for(const r of members)r.cohort=null;
        for(const r of members){
          if(disposed||r.status!=='running'||!r.worker)continue;
          r.startSent=true;
          try{r.worker.postMessage({type:'start',protocolVersion:1,buildId:BUILD_ID,taskType:r.taskType,taskVersion:1,jobId:r.jobId,inputRevision:r.inputRevision,generation:r.generation});}
          catch(error){finish(r,'failed',{errorCode:'WORKER_START_OR_SEND_FAILED',message:String(error?.message??error).slice(0,240)});}
        }
      }
    }finally{releasing=false;}
  }
  function finish(record,status,extra={}) {
    if(terminal(record.status))return false;
    const oldStatus=record.status;
    record.status=status;record.phase=status;
    const cohort=record.cohort;record.cohort=null;cohort?.members.delete(record);
    if(oldStatus==='running')running--;
    const queuedIndex=queue.indexOf(record);if(queuedIndex!==-1)queue.splice(queuedIndex,1);
    clearTimeout(record.timer);record.timer=null;
    const worker=record.worker;record.worker=null;
    if(worker){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;try{worker.terminate();}catch{}}
    outstanding--;inputBytes-=record.inputBytes;
    record.request=null;
    const totalMs=performance.now()-record.acceptedAt;
    const workerMetrics=extra.metrics??{};
    const measuredWorkerMs=Number.isFinite(workerMetrics.loadMs)&&Number.isFinite(workerMetrics.computeMs)?workerMetrics.loadMs+workerMetrics.computeMs+(Number.isFinite(workerMetrics.readyWaitMs)?workerMetrics.readyWaitMs:0):null;
    const workerRoundtripMs=record.workerStartedAt===null?null:performance.now()-record.workerStartedAt;
    const metrics=Object.freeze({...workerMetrics,buildId:BUILD_ID,wasmSha256:WASM_SHA256,queueMs:record.startedAt===null?totalMs:record.startedAt-record.acceptedAt,startupMs:record.bootAt===null||record.workerStartedAt===null?null:record.bootAt-record.workerStartedAt,preparationMs:record.preparationMs,moduleReuse,startTogether:record.startTogether,totalMs,transferResidualMs:workerRoundtripMs===null||measuredWorkerMs===null?null:Math.max(0,workerRoundtripMs-measuredWorkerMs),memoryMeasurement:null});
    const result=extra.result===undefined?undefined:Object.freeze(extra.result);
    record.result=Object.freeze({protocolVersion:1,buildId:BUILD_ID,taskType:record.taskType,taskVersion:1,jobId:record.jobId,inputRevision:record.inputRevision,generation:record.generation,status,...extra,...(result===undefined?{}:{result}),metrics,totalMs});
    record.resultBytes=result?.length*8||0;
    if(disposed){records.delete(record.jobId);}else{retained.push(record);retainedBytes+=record.resultBytes;evict();}
    const resolve=record.resolve;record.resolve=null;
    resolve(record.result);
    notify(record);
    releaseWhenReady(cohort);
    drain();
    return true;
  }
  function moduleForPool() {
    if(!cachedModule){
      const attempt=Promise.resolve().then(()=>prepareModule({signal:abortController.signal,onCompile:()=>{compileCalls++;}})).then(module=>{
        if(!(module instanceof WebAssembly.Module))throw TypeError('Preparation did not return a WASM module');
        return module;
      });
      cachedModule=attempt;
      // Failure is observed by all waiting jobs; only a later explicit submit retries.
      attempt.catch(error=>{if(cachedModule===attempt){cachedModule=null;preparationFailure={error,maxGeneration:generation};}});
    }
    return cachedModule;
  }
  function launch(record,module) {
    if(disposed||record.status!=='running')return;
    try {
      const worker=workerFactory();
      if(disposed||record.status!=='running'){try{worker.terminate();}catch{}return;}
      record.worker=worker;record.workerStartedAt=performance.now();record.phase='starting';
      worker.onmessage=({data})=>{
        if(record.status!=='running'||record.worker!==worker||!matching(record,data))return;
        if(data.type==='phase'){
          if(data.phase==='ready'){
            if(!record.startTogether){finish(record,'failed',{errorCode:'INVALID_RESPONSE'});return;}
            if(record.startSent||record.ready)return;
            record.ready=true;record.phase='ready';notify(record);releaseWhenReady(record.cohort);return;
          }
          if((data.phase!=='loading'&&data.phase!=='computing')||(data.phase==='computing'&&!record.startSent)){finish(record,'failed',{errorCode:'INVALID_RESPONSE'});return;}
          if(record.bootAt===null)record.bootAt=performance.now();
          record.phase=data.phase;notify(record);
        }else if(data.type==='result'){
          if(!record.startSent||!Array.isArray(data.result)||data.result.length!==record.resultLength||Array.from(data.result).some(value=>typeof value!=='number'||!Number.isFinite(value))||typeof data.workerId!=='string'||!data.workerId||typeof data.instanceId!=='string'||!data.instanceId){finish(record,'failed',{errorCode:'INVALID_RESPONSE'});return;}
          if(!moduleReuse&&Number.isInteger(data.metrics?.compileCalls)&&data.metrics.compileCalls>=0)compileCalls+=data.metrics.compileCalls;
          finish(record,'succeeded',{result:data.result,workerId:data.workerId,instanceId:data.instanceId,metrics:data.metrics});
        }else if(data.type==='error')finish(record,'failed',{errorCode:'TASK_FAILED',message:String(data.message??'Task failed').slice(0,240),workerId:data.workerId});
        else finish(record,'failed',{errorCode:'INVALID_RESPONSE'});
      };
      worker.onerror=event=>{event?.preventDefault?.();finish(record,'failed',{errorCode:'WORKER_ERROR'});};
      worker.onmessageerror=()=>finish(record,'failed',{errorCode:'MESSAGE_ERROR'});
      worker.postMessage({...record.request,buildId:BUILD_ID,generation:record.generation,startTogether:record.startTogether,...(module?{module}:{})});
      if(record.status==='running')notify(record);
    } catch(error) {finish(record,'failed',{errorCode:'WORKER_START_OR_SEND_FAILED',message:String(error?.message??error).slice(0,240)});}
  }
  function start(record) {
    record.status='running';record.phase=moduleReuse?'preparing':'starting';record.startedAt=performance.now();running++;
    notify(record);
    if(disposed||record.status!=='running')return;
    if(moduleReuse){
      if(preparationFailure&&record.generation<=preparationFailure.maxGeneration){finish(record,'failed',{errorCode:'PREPARATION_FAILED',message:String(preparationFailure.error?.message??preparationFailure.error).slice(0,240)});return;}
      const began=performance.now();
      moduleForPool().then(module=>{record.preparationMs=performance.now()-began;launch(record,module);},error=>{
        if(!terminal(record.status))finish(record,'failed',{errorCode:'PREPARATION_FAILED',message:String(error?.message??error).slice(0,240)});
      });
    }else launch(record,null);
  }
  function drain() {
    if(draining||disposed)return;
    draining=true;
    try{while(!disposed&&running<concurrency&&queue.length){const r=queue.shift();if(r.status==='queued')start(r);}}finally{draining=false;}
  }
  function submitBatch(inputs,{startTogether=false}={}) {
    if(disposed)throw Error('Compute pool is disposed');
    if(typeof startTogether!=='boolean')throw TypeError('startTogether must be boolean');
    if(!Array.isArray(inputs)||inputs.length<1||inputs.length>MAX_OUTSTANDING)throw RangeError('Expected 1..12 jobs');
    if(startTogether&&(outstanding!==0||inputs.length>concurrency))throw RangeError('Prepared batch requires no outstanding work and count <= concurrency');
    const requests=inputs.map(validateRequest),ids=new Set();
    let bytes=0;
    for(const r of requests){if(ids.has(r.jobId)||records.has(r.jobId))throw Error('jobId is already retained or active');ids.add(r.jobId);bytes+=(r.payload.masks.length+r.payload.weights.length)*8;}
    if(outstanding+requests.length>MAX_OUTSTANDING||inputBytes+bytes>MAX_INPUT_BYTES)throw RangeError('Pool admission limit exceeded');
    const handles=[],cohort=startTogether?{members:new Set(),released:false}:null;
    // Reserve the complete batch before any callback or Worker can re-enter.
    for(const request of requests){
      const record={jobId:request.jobId,inputRevision:request.inputRevision,taskType:request.taskType,generation:++generation,status:'queued',phase:'queued',request,resultLength:request.payload.masks.length,inputBytes:(request.payload.masks.length+request.payload.weights.length)*8,acceptedAt:performance.now(),startedAt:null,workerStartedAt:null,bootAt:null,preparationMs:null,worker:null,result:null,startTogether,cohort,ready:false,startSent:!startTogether};
      cohort?.members.add(record);
      const promise=new Promise(resolve=>{record.resolve=resolve;});
      records.set(record.jobId,record);queue.push(record);outstanding++;inputBytes+=record.inputBytes;
      record.timer=setTimeout(()=>finish(record,'failed',{errorCode:'TIMEOUT'}),request.limits.timeoutMs);
      handles.push({jobId:record.jobId,promise});
    }
    drain();
    return {jobIds:handles.map(h=>h.jobId),promise:Promise.all(handles.map(h=>h.promise))};
  }
  return Object.freeze({
    submit(input){const batch=submitBatch([input]);return {jobId:batch.jobIds[0],promise:batch.promise.then(values=>values[0])};},
    submitBatch,
    getStatus(jobId){if(jobId===undefined)return snapshot();const r=records.get(jobId);return r?statusOf(r):null;},
    getResult(jobId){return records.get(jobId)?.result??null;},
    cancel(jobId){const r=records.get(jobId);return r&&!terminal(r.status)?finish(r,'cancelled',{errorCode:'CANCELLED'}):false;},
    dispose(){if(disposed)return;disposed=true;abortController.abort();cachedModule=null;for(const r of Array.from(records.values()))if(!terminal(r.status))finish(r,'cancelled',{errorCode:'DISPOSED'});records.clear();queue.length=0;retained.length=0;pendingCohorts.clear();retainedBytes=0;}
  });
}

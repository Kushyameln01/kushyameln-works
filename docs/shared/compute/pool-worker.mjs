import {BUILD_ID} from './protocol.mjs';
import {inspectTaskRequest,kernelInfo,prepareTaskModule,instantiateTask,executeTask,transferTaskResult,taskInputCount} from './tasks.mjs';

const workerId=crypto.randomUUID();
const bootEpochMs=performance.timeOrigin+performance.now();
let received=false,pending=null;
const matching=(identity,data)=>['protocolVersion','buildId','taskType','taskVersion','jobId','inputRevision','generation'].every(key=>data[key]===identity[key]);
self.onmessage=async({data})=>{
  if(data?.type==='start'){
    if(pending&&matching(pending.identity,data)){const run=pending.run;pending=null;await run();}
    return;
  }
  if(received)return;
  received=true;
  const identity={protocolVersion:1,buildId:BUILD_ID,taskType:data?.taskType,taskVersion:data?.taskVersion,jobId:data?.jobId,inputRevision:data?.inputRevision,generation:data?.generation,workerId,...(data?.taskType!=='ft-magnitude-batch'?{wasmVariant:data?.wasmVariant,kernelHash:data?.kernelHash}:{})};
  const started=performance.now();
  let kernel=null,request=null;
  const cleanup=()=>{pending=null;kernel?.dispose?.();kernel=null;request=null;self.onmessage=null;};
  const fail=error=>{self.postMessage({...identity,type:'error',message:String(error?.message??error).slice(0,240)});cleanup();};
  try {
    if(data?.buildId!==BUILD_ID||!Number.isSafeInteger(data?.generation)||data.generation<1||(data.startTogether!==undefined&&typeof data.startTogether!=='boolean'))throw Error('Invalid worker identity/options');
    request=inspectTaskRequest(data);
    const info=kernelInfo(request);
    if(request.taskType!=='ft-magnitude-batch'&&data.kernelHash!==info.sha256)throw Error('Kernel identity mismatch');
    self.postMessage({...identity,type:'phase',phase:'loading',bootEpochMs});
    let compileCalls=0,wasmContentType=null;
    const startTogether=data.startTogether===true,needsWasm=info.requiresWasm!==false;
    const module=needsWasm?(data.module??await prepareTaskModule({taskType:request.taskType,wasmVariant:request.wasmVariant,onCompile:()=>compileCalls++,onResponse:value=>{wasmContentType=value;}})):null;
    kernel=needsWasm?instantiateTask(request,module):null;
    const preparedAt=performance.now();
    const compute=async()=>{
      try {
        const computeStart=performance.now();
        self.postMessage({...identity,type:'phase',phase:'computing',instanceId:kernel?.instanceId??null,bootEpochMs});
        const result=await executeTask(request,kernel),transfer=transferTaskResult(result);
        const computeEnd=performance.now();
        self.postMessage({...identity,type:'result',instanceId:kernel?.instanceId??null,result,metrics:{buildId:BUILD_ID,wasmSha256:info.sha256,wasmVariant:info.variant,kernelAbi:info.abi,wasmContentType,bootEpochMs,loadMs:preparedAt-started,readyWaitMs:startTogether?computeStart-preparedAt:0,startTogether,computeMs:computeEnd-computeStart,computeStartEpochMs:performance.timeOrigin+computeStart,computeEndEpochMs:performance.timeOrigin+computeEnd,memoryBytes:kernel?.memory.buffer.byteLength??null,wasmNotApplicable:needsWasm?null:'JavaScript parsing task',inputCount:taskInputCount(request,result),compileCalls,moduleReuse:needsWasm&&data.module instanceof WebAssembly.Module,arena:kernel?.resourceStats?.()??null,memoryMeasurement:null}},transfer);
        cleanup();
      }catch(error){fail(error);}
    };
    if(startTogether){pending={identity,run:compute};self.postMessage({...identity,type:'phase',phase:'ready',instanceId:kernel?.instanceId??null,bootEpochMs});}
    else await compute();
  }catch(error){fail(error);}
};

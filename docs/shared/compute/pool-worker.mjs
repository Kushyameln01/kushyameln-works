import {validateRequest,BUILD_ID,WASM_SHA256} from './protocol.mjs';
import {prepareKernelModule,instantiateKernel} from './kernel.mjs';

const workerId=crypto.randomUUID();
const bootEpochMs=performance.timeOrigin+performance.now();
let received=false,pending=null;
const matching=(identity,data)=>['protocolVersion','buildId','taskType','taskVersion','jobId','inputRevision','generation'].every(key=>data[key]===identity[key]);
self.onmessage=async({data})=>{
  if(data?.type==='start'){
    if(pending&&matching(pending.identity,data)){const run=pending.run;pending=null;run();}
    return;
  }
  if(received)return;
  received=true;
  const identity={protocolVersion:1,buildId:BUILD_ID,taskType:data?.taskType,taskVersion:data?.taskVersion,jobId:data?.jobId,inputRevision:data?.inputRevision,generation:data?.generation,workerId};
  const started=performance.now();
  let kernel=null,request=null;
  const cleanup=()=>{pending=null;kernel=null;request=null;self.onmessage=null;};
  const fail=error=>{self.postMessage({...identity,type:'error',message:String(error?.message??error).slice(0,240)});cleanup();};
  try {
    if(data?.buildId!==BUILD_ID||!Number.isSafeInteger(data?.generation)||data.generation<1||(data.startTogether!==undefined&&typeof data.startTogether!=='boolean'))throw Error('Invalid worker identity/options');
    request=validateRequest(data);
    self.postMessage({...identity,type:'phase',phase:'loading',bootEpochMs});
    let compileCalls=0,wasmContentType=null;
    const startTogether=data.startTogether===true;
    const module=data.module??await prepareKernelModule({onCompile:()=>compileCalls++,onResponse:value=>{wasmContentType=value;}});
    kernel=instantiateKernel(module);
    const preparedAt=performance.now();
    const compute=()=>{
      try {
        const computeStart=performance.now();
        self.postMessage({...identity,type:'phase',phase:'computing',instanceId:kernel.instanceId,bootEpochMs});
        const result=request.payload.masks.map(mask=>kernel.magnitude(mask,request.payload.weights));
        const computeEnd=performance.now();
        self.postMessage({...identity,type:'result',instanceId:kernel.instanceId,result,metrics:{buildId:BUILD_ID,wasmSha256:WASM_SHA256,wasmContentType,bootEpochMs,loadMs:preparedAt-started,readyWaitMs:startTogether?computeStart-preparedAt:0,startTogether,computeMs:computeEnd-computeStart,computeStartEpochMs:performance.timeOrigin+computeStart,computeEndEpochMs:performance.timeOrigin+computeEnd,memoryBytes:kernel.memory.buffer.byteLength,inputCount:result.length,compileCalls,moduleReuse:data.module instanceof WebAssembly.Module,memoryMeasurement:null}});
        cleanup();
      }catch(error){fail(error);}
    };
    if(startTogether){pending={identity,run:compute};self.postMessage({...identity,type:'phase',phase:'ready',instanceId:kernel.instanceId,bootEpochMs});}
    else compute();
  }catch(error){fail(error);}
};

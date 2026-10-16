import {validateFrame,rgbaToGray,MEDIA_BUILD} from '../sdk.mjs';
import {supportsSIMD,MEDIA_KERNELS} from '../kernel/media-kernel.mjs';
import {inspectPaperPayload,snapshotPaperPayload,paperInputBytes,MAX_PAPER_RESULT_BYTES,paperInfo} from './pool-task.mjs';

const id=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,64}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const freeze=v=>{if(v&&typeof v==='object'&&!ArrayBuffer.isView(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const NUMERICAL_ERRORS=new Set(['SOLVER_NONCONVERGENCE','ZERO_SIGNAL','RANK_LIMIT','EIGENSPACE_AMBIGUOUS','PATTERN_AMBIGUOUS','NUMERIC_ACCURACY','INVALID_ARGUMENT','WORKSPACE_LIMIT','PREPROCESSING_HASH','MODEL_HASH','CODE_HASH','PAPER_CODE_HASH','EMPTY_CLASS','TRAINING_SET_MISMATCH','SPLIT_SOURCE_LEAKAGE']);
const METHODS=['svd-diagonal-v1','paper-alg2-diagonal-v1'];
const band=p=>p<1000000?'lt1mp':p<4000000?'1to4mp':p<16000000?'4to16mp':'gte16mp';
const measured=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=3600000?n:null;
function methodOf(task,input){
  // Observe only own data properties. An observer cannot change the selected method.
  try{const own=(value,key)=>value&&Object.getPrototypeOf(value)===Object.prototype?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;const method=own(task==='media-paper-fit'?input:own(input,'model'),'kind');return METHODS.includes(method)?method:'unselected';}catch{return 'unselected';}
}
function failureClass(error){
  let code,detail;try{code=error?.message;detail=error?.detailCode;}catch{return 'internal';}
  if(['PAPER_SDK_MEMORY_BUDGET','PAPER_INPUT_LIMIT','PAPER_METADATA_LIMIT','WORKSPACE_LIMIT'].includes(code)||detail==='WORKSPACE_LIMIT')return 'budget_exceeded';
  if(code==='OPERATION_TIMEOUT'||code==='TIMEOUT')return 'timeout';
  if(code==='SIMD_UNSUPPORTED')return 'unsupported';
  if(error instanceof TypeError||error instanceof RangeError||['INVALID_ARGUMENT','PREPROCESSING_HASH','MODEL_HASH','CODE_HASH','PAPER_CODE_HASH','EMPTY_CLASS','TRAINING_SET_MISMATCH','SPLIT_SOURCE_LEAKAGE'].includes(detail))return 'input_invalid';
  if(NUMERICAL_ERRORS.has(detail)||['TASK_FAILED','COMPUTE_FAILED','WORKER_ERROR'].includes(code))return 'kernel_error';
  return 'internal';
}

// Explicit training/inference client on a caller-owned pool. It never creates a pool.
export function createPaperProcessor({pool,variant='auto',memoryBudgetBytes=16777216,onEvent=()=>{}}={}){
  if(typeof pool?.submitBatch!=='function'||typeof pool?.cancel!=='function'||typeof pool?.releaseResult!=='function')throw TypeError('CALLER_POOL_REQUIRED');
  if(!['auto','scalar','simd'].includes(variant)||!integer(memoryBudgetBytes,1024,16777216)||typeof onEvent!=='function')throw RangeError('PAPER_SDK_OPTIONS');
  const simd=supportsSIMD(),selected=variant==='auto'?(simd?'simd':'scalar'):variant;
  if(selected==='simd'&&!simd)throw Error('SIMD_UNSUPPORTED');
  const operations=new Map();let disposed=false,liveBytes=0,peakBytes=0;
  const capabilities=freeze({version:1,preprocessing:'explicit display crop; no resize; zero-gray halo',preprocessVariant:selected,preprocessKernelHash:MEDIA_KERNELS[selected].sha256,fitInferVariant:'scalar',fitInferKernelHash:paperInfo().sha256,gridLimit:{width:64,height:64},samePool:true,memoryBudgetBytes,sourceVerification:'caller-declared',codeVerification:'SHA-256 of owned LBP bytes',modelScope:'fixed source dimensions and fixed ROI coordinates; no normalization across crops'});
  function check(op){if(op.controller.signal.aborted)throw Error(op.timeout?'OPERATION_TIMEOUT':'CANCELLED');}
  function reserve(op,n){if(liveBytes+n>memoryBudgetBytes)throw RangeError('PAPER_SDK_MEMORY_BUDGET');liveBytes+=n;op.bytes+=n;peakBytes=Math.max(peakBytes,liveBytes);}
  function cancel(operationId){const op=operations.get(operationId);if(!op)return false;op.controller.abort();for(const child of op.children)pool.cancel(child);return true;}
  function workerCount(){try{const count=pool.getStatus?.().concurrency;return integer(count,1,4)?count:null;}catch{return null;}}
  function emit(op,type,errorCode=null){
    const event=Object.freeze({eventId:crypto.randomUUID(),operationId:op.id,type,buildId:MEDIA_BUILD,taskVersion:1,taskFamily:op.family,method:op.method,kernelHash:op.family==='paper-preprocess'?capabilities.preprocessKernelHash:capabilities.fitInferKernelHash,wasmVariant:op.family==='paper-preprocess'?selected:'scalar',workerCount:op.workers,elapsedMs:performance.now()-op.started,sizeBand:type==='started'?'unknown':op.sizeBand,durationsMs:Object.freeze(type==='started'?{queue:null,compute:null}:{...op.durations}),errorCode});
    // Exactly start + one terminal per admitted operation; no raw input/result/Error.
    op.events.push(event);try{const observed=onEvent(event);if(observed&&typeof observed.then==='function')void Promise.resolve(observed).catch(()=>{});}catch{}return event;
  }
  async function execute(options,family,method,body){
    const {operationId=crypto.randomUUID(),inputRevision=0,signal,timeoutMs=30000}=options??{};
    if(disposed)throw Error('PROCESSOR_DISPOSED');if(!id(operationId)||operations.has(operationId)||!integer(inputRevision,0,Number.MAX_SAFE_INTEGER)||!integer(timeoutMs,1,300000))throw TypeError('PAPER_OPERATION');
    const op={id:operationId,revision:inputRevision,bytes:0,children:new Set(),controller:new AbortController(),timeout:false,started:performance.now(),timeoutMs,family,method,workers:workerCount(),sizeBand:'unknown',durations:{queue:null,compute:null},events:[]};operations.set(operationId,op);
    const abort=()=>cancel(operationId);let timer;
    try{emit(op,'started');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();timer=setTimeout(()=>{op.timeout=true;cancel(operationId);},timeoutMs);check(op);const result=await body(op),output={...result,operationId:op.id};check(op);emit(op,'completed');return Object.freeze({...output,log:Object.freeze(op.events.slice())});}
    catch(error){const cancelled=op.controller.signal.aborted&&!op.timeout;emit(op,cancelled?'cancelled':'failed',cancelled?null:op.timeout?'timeout':failureClass(error));const operation=Object.freeze({operationId:op.id,status:cancelled?'cancelled':'failed',log:Object.freeze(op.events.slice())});let failure=error instanceof Error?error:new Error('PAPER_FAILED');try{Object.defineProperty(failure,'operation',{value:operation,enumerable:true,configurable:true});}catch{const replacement=new Error(failure.message);for(const key of ['detailCode','taskType','jobId'])if(Object.hasOwn(failure,key))replacement[key]=failure[key];replacement.operation=operation;failure=replacement;}throw failure;}
    finally{clearTimeout(timer);try{signal?.removeEventListener('abort',abort);}catch{}for(const child of op.children){pool.cancel(child);pool.releaseResult(child);}op.children.clear();liveBytes-=op.bytes;op.bytes=0;operations.delete(operationId);}
  }
  async function submit(op,taskType,payload,wasmVariant){
    let batch;
    try{
      check(op);batch=pool.submitBatch([{protocolVersion:1,taskType,taskVersion:1,jobId:crypto.randomUUID(),inputRevision:op.revision,wasmVariant,payload,limits:{timeoutMs:Math.max(1,Math.min(30000,Math.ceil(op.timeoutMs-(performance.now()-op.started))))}}]);
      for(const child of batch.jobIds){op.children.add(child);if(op.controller.signal.aborted)pool.cancel(child);}check(op);
      const [result]=await batch.promise;op.durations.queue=measured(result.metrics?.queueMs);op.durations.compute=measured(result.metrics?.computeMs);check(op);if(result.status!=='succeeded'){const error=new Error(result.errorCode??'COMPUTE_FAILED');error.detailCode=NUMERICAL_ERRORS.has(result.message)?result.message:null;error.taskType=taskType;error.jobId=result.jobId;throw error;}return result;
    }finally{if(batch)for(const child of batch.jobIds){op.children.delete(child);pool.releaseResult(child);}}
  }
  function preprocess(input,options){return execute(options,'paper-preprocess','lbp3x3',async op=>{
    const shape=validateFrame(input?.frame,16777216),r=input.roi??{};
    const {x,y,width,height}=r,sampleId=input.sampleId,sourceSha256=input.sourceSha256;
    if(Object.keys(r).some(k=>!['x','y','width','height'].includes(k))||!integer(width,1,64)||!integer(height,1,64)||!integer(x,0,shape.width-width)||!integer(y,0,shape.height-height)||!id(sampleId)||!hash(sourceSha256))throw TypeError('PAPER_CROP');
    const p=width*height,w=width+2,h=height+2;op.sizeBand=band(p);reserve(op,6*p+w*h+1024);
    const rgba=new Uint8Array(p*4);for(let row=0;row<height;row++)rgba.set(shape.data.subarray((y+row)*shape.stride+x*4,(y+row)*shape.stride+(x+width)*4),row*width*4);
    const gray=rgbaToGray({data:rgba,width,height,stride:width*4}),data=new Uint8Array(w*h);for(let row=0;row<height;row++)data.set(gray.subarray(row*width,(row+1)*width),(row+1)*w+1);
    const preprocessing=freeze({version:1,grid:{width,height},roi:{x,y,width,height,sourceWidth:shape.width,sourceHeight:shape.height,coordinateSpace:'display-pixels'},resize:'none',luma:'integer77-150-29-white-alpha',lbp:'3x3-ge-NW-N-NE-E-SE-S-SW-W',border:'zero-gray-halo'});
    const result=await submit(op,'media-lbp-tile',{pixelFormat:'gray8',data,width:w,height:h,stride:w,imageWidth:w,imageHeight:h,originX:0,originY:0,region:{x:1,y:1,width,height}},selected);check(op);
    const codes=result.result.codes,codeSha256=await sha(codes);check(op);const preprocessingSha256=await sha(new TextEncoder().encode(canonical(preprocessing)));check(op);
    return Object.freeze({sampleId,sourceSha256,sourceVerification:'caller-declared',codeSha256,codes,width,height,preprocessing,preprocessingSha256,metrics:result.metrics,operationId:op.id});
  });}
  function numerical(taskType,input,options){return execute(options,taskType==='media-paper-fit'?'paper-fit':'paper-infer',methodOf(taskType,input),async op=>{
    const inspected=inspectPaperPayload(taskType,input),method=taskType==='media-paper-fit'?inspected.kind:inspected.model.kind;if(method!==op.method||op.method==='unselected')throw TypeError('PAPER_METHOD_CHANGED');
    // Fit counts grid positions across all training examples, not image dimensions.
    op.sizeBand=band(taskType==='media-paper-fit'?inspected.width*inspected.height*inspected.samples.length:inspected.model.width*inspected.model.height);
    const bytes=paperInputBytes(taskType,inspected);reserve(op,2*bytes+MAX_PAPER_RESULT_BYTES);
    const payload=snapshotPaperPayload(taskType,inspected);return submit(op,taskType,payload,'scalar');
  });}
  return Object.freeze({capabilities,preprocess,fit:(input,options)=>numerical('media-paper-fit',input,options),infer:(input,options)=>numerical('media-paper-infer',input,options),cancel,getStatus:()=>({disposed,operations:operations.size,liveBytes,peakBytes,memoryBudgetBytes,scope:'SDK snapshots and conservative result reservation; pool, Wasm and caller outputs separate'}),dispose(){if(disposed)return;disposed=true;for(const operationId of operations.keys())cancel(operationId);}});
}

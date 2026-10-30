import {BUILD_ID} from './build-info.mjs';
export {BUILD_ID} from './build-info.mjs';
export const PROTOCOL_VERSION='diffusion-models/0.1';
export const MAX_TENSOR_ELEMENTS=1048576;
const OPERATIONS=new Set(['capabilities','inspect','eulerStep','load','predict','sample','cancel','dispose']);
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(x);
const identity=q=>({buildId:BUILD_ID,protocolVersion:q?.protocolVersion,sessionId:q?.sessionId,jobId:q?.jobId,inputRevision:q?.inputRevision,op:q?.op});
const matches=(a,b)=>['buildId','protocolVersion','sessionId','jobId','inputRevision','op'].every(k=>a[k]===b[k]);
const errorResponse=(q,code,message,details)=>({...identity(q),status:'error',error:{code,message,...(details?{details}:{})}});
const ok=(q,result)=>({...identity(q),status:'ok',result});

// Same-page factory. This owns one worker; it never reaches other modules or tabs.
export function createDiffusionModels({sessionId=crypto.randomUUID()}={}){
 if(!validId(sessionId))throw new TypeError('Invalid sessionId');
 let worker=null,active=null,disposed=false,revision=0,generation=0;
 const stopWorker=()=>{generation++;worker?.terminate();worker=null;};
 const settle=(reply)=>{const pending=active;active=null;pending?.resolve(reply);};
 function cancel(target){
  target={...target,protocolVersion:PROTOCOL_VERSION,op:'cancel'};
  if(disposed)return errorResponse(target,'DISPOSED','The API has been disposed');
  if(!active||target?.sessionId!==sessionId||target?.jobId!==active.request.jobId||target?.inputRevision!==active.request.inputRevision)return errorResponse(target,'NOT_RUNNING','The target job is not active');
  const pending=active.request;stopWorker();settle(errorResponse(pending,'CANCELLED','The owned worker was terminated'));
  return ok(target,{cancelled:true,workerTerminated:true});
 }
 function dispose(){
  if(disposed)return;disposed=true;stopWorker();
  if(active)settle(errorResponse(active.request,'DISPOSED','The owned worker was terminated and API disposed'));
 }
 async function request(q){
  if(disposed)return errorResponse(q,'DISPOSED','The API has been disposed');
  if(!q||(q.buildId!==undefined&&q.buildId!==BUILD_ID)||q.protocolVersion!==PROTOCOL_VERSION||q.sessionId!==sessionId||!validId(q.jobId)||!Number.isSafeInteger(q.inputRevision)||q.inputRevision<0)return errorResponse(q,'INVALID_REQUEST','Invalid protocol or request identity');
  if(!OPERATIONS.has(q.op))return errorResponse(q,'UNSUPPORTED_OPERATION','Unsupported operation');
  if(q.op==='cancel'){
   const r=cancel({...q.input,sessionId});return r.status==='ok'?ok(q,r.result):errorResponse(q,r.error.code,r.error.message);
  }
  if(q.op==='dispose'){dispose();return ok(q,{disposed:true});}
  if(q.inputRevision<revision)return errorResponse(q,'STALE_INPUT','The input revision has already been superseded');
  if(q.op!=='capabilities'&&(!q.input||typeof q.input!=='object'))return errorResponse(q,'INVALID_REQUEST','Expected an input object');
  if(active){
   if(q.inputRevision===revision)return errorResponse(q,'BUSY','Only one worker operation may run at a time');
   const old=active.request;stopWorker();settle(errorResponse(old,'STALE_INPUT','A newer input revision terminated this job'));
  }
  revision=q.inputRevision;
  if(q.op==='capabilities')return ok(q,{buildId:BUILD_ID,modelInference:false,eulerStep:true,inspect:true,maxTensorElements:MAX_TENSOR_ELEMENTS,execution:'dedicated-worker',backend:'Hike WASM Euler only',protocolVersion:PROTOCOL_VERSION});
  return new Promise(resolve=>{
   const ownedRequest={...identity(q),input:q.input};active={request:ownedRequest,resolve};
   try{
    if(!worker){
     worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
     const ownedWorker=worker,ownedGeneration=generation;
     worker.onmessage=({data})=>{
      if(disposed||worker!==ownedWorker||generation!==ownedGeneration||!active||!matches(data,active.request))return;
      settle(data);
     };
     worker.onerror=event=>{
      if(worker!==ownedWorker||generation!==ownedGeneration||!active)return;
      const request=active.request;stopWorker();settle(errorResponse(request,'WORKER_ERROR',event.message||'Worker failed'));
     };
     worker.onmessageerror=()=>{
      if(worker!==ownedWorker||generation!==ownedGeneration||!active)return;
      const request=active.request;stopWorker();settle(errorResponse(request,'WORKER_ERROR','Unreadable worker message'));
     };
    }
    // No transfer list: caller arrays and Blob ownership are preserved.
    worker.postMessage(ownedRequest);
   }catch(error){stopWorker();settle(errorResponse(ownedRequest,'INVALID_REQUEST',String(error.message??error)));}
  });
 }
 return Object.freeze({sessionId,request,cancel,dispose});
}

// The caller supplies a dedicated port. There are no global window listeners.
export function attachDiffusionPort(port,api){
 if(!(port instanceof MessagePort)||!api||typeof api.request!=='function')throw new TypeError('Expected a MessagePort and diffusion API');
 let attached=true;
 const onMessage=async event=>{
  const reply=await api.request(event.data);
  if(!attached)return;
  try{port.postMessage(reply);}catch{detach();}
 };
 function detach(){if(!attached)return;attached=false;port.removeEventListener('message',onMessage);port.close();}
 port.addEventListener('message',onMessage);port.start();
 return detach;
}

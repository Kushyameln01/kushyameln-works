import {createComputePool} from './shared/compute/client.mjs';
const CHANNEL='works-compute-bridge-v1';
// Page-owned capability is bounded computation, never privileged extension commands.
export function installWorksBridge(){
 const session=crypto.randomUUID(),active=new Map(),seen=new Set();let disposed=false;
 const send=(r,type,value)=>window.postMessage({channel:CHANNEL,direction:'response',version:1,session,requestId:r.requestId,jobId:r.jobId,inputRevision:r.inputRevision,type,value},location.origin);
 const pool=createComputePool({concurrency:2,onUpdate:s=>{const r=active.get(s.jobId);if(r)send(r,'PROGRESS',s);}});
 function receive(e){
  const r=e.data;
  if(disposed||e.source!==window||e.origin!==location.origin||r?.channel!==CHANNEL||r.direction!=='request'||r.version!==1||typeof r.requestId!=='string'||!/^[-\w]{1,64}$/.test(r.requestId))return;
  if(r.op==='HELLO'){send(r,'READY',{session,taskType:'ft-magnitude-batch',taskVersion:1});return;}
  if(r.session!==session){send(r,'ERROR',{status:'rejected',errorCode:'STALE_SESSION'});return;}
  if(r.op==='STATUS'){send(r,'STATUS',pool.getStatus());return;}
  if(r.op==='CANCEL'){
   const owner=active.get(r.jobId);
   if(owner&&owner.requestId===r.requestId&&owner.inputRevision===r.inputRevision)pool.cancel(r.jobId);
   return;
  }
  if(r.op!=='RUN'){send(r,'ERROR',{status:'rejected',errorCode:'UNSUPPORTED_OPERATION'});return;}
  if(seen.has(r.requestId)){send(r,'ERROR',{status:'rejected',errorCode:'DUPLICATE_REQUEST'});return;}
  if(seen.size>=256){send(r,'ERROR',{status:'rejected',errorCode:'SESSION_LIMIT'});return;}
  seen.add(r.requestId);
  try{
   const q=r.request;
   if(q?.taskType!=='ft-magnitude-batch'||q.taskVersion!==1||q.jobId!==r.jobId||q.inputRevision!==r.inputRevision||active.has(r.jobId))throw Error('REQUEST_CONTRACT');
   active.set(r.jobId,r);const job=pool.submit(q);
   job.promise.then(result=>{send(r,'RESULT',result);active.delete(r.jobId);pool.releaseResult(r.jobId);});
  }catch(err){if(active.get(r.jobId)===r)active.delete(r.jobId);send(r,'ERROR',{status:'rejected',errorCode:'INVALID_REQUEST'});}
 }
 function dispose(){if(disposed)return;disposed=true;window.removeEventListener('message',receive);window.removeEventListener('pagehide',dispose);for(const r of active.values())send(r,'ERROR',{status:'cancelled',errorCode:'PAGE_CLOSED'});pool.dispose();}
 window.addEventListener('message',receive);window.addEventListener('pagehide',dispose);
 return {dispose};
}

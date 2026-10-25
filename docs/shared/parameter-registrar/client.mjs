import {createComputePool} from '../compute/client.mjs';
import {MAX_TASK_BYTES} from './pool-task.mjs';

export const VERSION=1;
const utf8=new TextEncoder();
const size=value=>utf8.encode(JSON.stringify(value)).byteLength;
const aborted=()=>new DOMException('処理を取り消しました。','AbortError');

export function partitionDocuments(documents,maxBytes=MAX_TASK_BYTES-1024){
  const batches=[];let batch=[],used=32;
  for(const doc of documents){
    const n=size(doc)+1;
    if(n+32>maxBytes)throw Error(`${doc.path} (${doc.fileId}): 1オブジェクトの処理データが上限を超えます。`);
    if(used+n>maxBytes){batches.push(batch);batch=[];used=32;}
    batch.push(doc);used+=n;
  }
  if(batch.length)batches.push(batch);
  return batches;
}

/** Borrowed pools stay owned by the caller. Every cancelled ID belongs here. */
export function createParameterRegistrar({pool,scanWorkerFactory=()=>new Worker(new URL('./scan-worker.mjs',import.meta.url),{type:'module'})}={}){
  const ownPool=!pool;
  pool??=createComputePool({concurrency:2,moduleReuse:true});
  const sessionId=crypto.randomUUID();let active=null,disposed=false,sequence=0;
  function begin(inputRevision){
    if(disposed)throw Error('この処理セッションは終了しています。');
    if(active)throw Error('処理中です。完了または取消後に実行してください。');
    if(!Number.isSafeInteger(inputRevision)||inputRevision<0)throw TypeError('inputRevisionが不正です。');
    return active={inputRevision,requestId:`${sessionId}:${++sequence}`,jobs:new Set(),scanner:null,rejectScan:null,cancelled:false};
  }
  const current=r=>{if(disposed||active!==r||r.cancelled)throw aborted();};
  const notify=(callback,value)=>{try{callback?.(value);}catch{}};
  function finish(r){r.scanner?.terminate();r.scanner=null;r.rejectScan=null;if(active===r)active=null;}
  async function run(r,taskType,payload){
    current(r);const jobId=crypto.randomUUID();r.jobs.add(jobId);
    try{
      const {promise}=pool.submit({protocolVersion:1,taskType,taskVersion:1,jobId,inputRevision:r.inputRevision,payload});
      const response=await promise;current(r);
      if(response.status!=='succeeded')throw response.status==='cancelled'?aborted():Error(response.message??`処理に失敗しました（${response.errorCode??response.status}）。`);
      if(response.jobId!==jobId||response.inputRevision!==r.inputRevision||response.taskType!==taskType)throw Error('現在の入力と処理結果が一致しません。');
      return response.result;
    }finally{r.jobs.delete(jobId);pool.releaseResult?.(jobId);}
  }
  function scan(r,bytes){
    return new Promise((resolve,reject)=>{
      r.rejectScan=reject;
      try{
        const worker=r.scanner=scanWorkerFactory();
        worker.onmessage=({data})=>{
          if(active!==r||r.cancelled||data?.sessionId!==sessionId||data.requestId!==r.requestId||data.inputRevision!==r.inputRevision)return;
          if(data.type==='error'){reject(Error(data.message));return;}
          if(data.type!=='result')return;
          if(!Array.isArray(data.documents)||!Number.isSafeInteger(data.clipCount)||data.clipCount<0||!Number.isSafeInteger(data.blendTreeCount)||data.blendTreeCount<0||data.documents.length!==data.clipCount+data.blendTreeCount){reject(Error('読取り結果の形式が不正です。'));return;}
          resolve(data);
        };
        worker.onerror=event=>{event.preventDefault?.();reject(Error('UnityPackageの読取りWorkerが停止しました。'));};
        worker.onmessageerror=()=>reject(Error('UnityPackageの読取り結果を受信できませんでした。'));
        // Transfer a private copy only, keeping the caller's bytes reusable.
        const copy=Uint8Array.from(bytes);
        worker.postMessage({version:1,sessionId,requestId:r.requestId,inputRevision:r.inputRevision,bytes:copy},[copy.buffer]);
      }catch(error){reject(error);}
    });
  }
  return Object.freeze({
    async collect(bytes,{inputRevision=0,onProgress}={}){
      const r=begin(inputRevision);
      try{
        if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>128*1024*1024)throw Error('128 MiB以内のUnityPackageを指定してください。');
        notify(onProgress,{phase:'reading',completed:0,total:1});
        const found=await scan(r,bytes);current(r);r.scanner?.terminate();r.scanner=null;r.rejectScan=null;
        const batches=partitionDocuments(found.documents),names=new Map();
        for(const [i,documents] of batches.entries()){
          notify(onProgress,{phase:'collecting',completed:i,total:batches.length});
          const result=await run(r,'parameter-collect',{documents});
          for(const p of result.parameters){const prev=names.get(p.name);if(prev&&prev.type!==p.type)throw Error(`${p.name}: 使用型が一致しません。`);names.set(p.name,{name:p.name,type:p.type});}
        }
        current(r);notify(onProgress,{phase:'complete',completed:batches.length,total:batches.length});
        return {version:1,parameters:[...names.values()].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0),clipCount:found.clipCount,blendTreeCount:found.blendTreeCount};
      }finally{finish(r);}
    },
    async generate(parameters,settings={}, {inputRevision=0}={}){
      const r=begin(inputRevision);
      try{const result=await run(r,'parameter-generate',{parameters,settings});current(r);const {kind,...output}=result;return output;}
      finally{finish(r);}
    },
    cancel(){
      const r=active;if(!r)return false;r.cancelled=true;active=null;
      r.rejectScan?.(aborted());r.scanner?.terminate();r.scanner=null;r.rejectScan=null;
      for(const id of r.jobs)pool.cancel(id);
      return true;
    },
    dispose(){if(disposed)return;this.cancel();disposed=true;if(ownPool)pool.dispose();}
  });
}

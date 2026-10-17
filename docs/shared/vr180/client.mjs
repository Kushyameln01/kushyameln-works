export async function cleanupTemporaryJob(id) {
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(id)) throw Error('INVALID_JOB_ID');
  if (!globalThis.navigator?.storage?.getDirectory) return;
  try {
    const root=await navigator.storage.getDirectory();
    const dir=await root.getDirectoryHandle('vr180-jobs');
    await dir.removeEntry(id,{recursive:true});
  } catch(e) {if(e.name!=='NotFoundError') throw e;}
}
export class StereoClient {
  constructor({WorkerClass=globalThis.Worker,onEvent=()=>{},cleanup=cleanupTemporaryJob}={}) {
    this.WorkerClass=WorkerClass;this.onEvent=onEvent;this.cleanup=cleanup;this.revision=0;this.current=null;this.cleanupPromise=Promise.resolve();
  }
  emit(e){try{this.onEvent(e);}catch{}}
  run(file,settings) {
    if(this.current) throw Error('PREVIOUS_JOB_NOT_DISPOSED');
    const worker=new this.WorkerClass(new URL('./worker.mjs',import.meta.url),{type:'module'});
    const operationId=crypto.randomUUID(),inputRevision=++this.revision;
    return new Promise((resolve,reject)=>{
      const job={worker,operationId,inputRevision,resolve,reject,settled:false};this.current=job;
      worker.onmessage=({data:m})=>{
        if(this.current!==job||job.settled||m.operationId!==operationId||m.inputRevision!==inputRevision)return;
        if(m.type==='result'){job.settled=true;this.emit(m);resolve(m.result);}
        else if(m.type==='error'){job.settled=true;this.emit(m);reject(Object.assign(Error(m.error),{diagnostics:m.diagnostics??null}));this.release(job);}
        else this.emit(m);
      };
      worker.onerror=e=>{if(this.current===job&&!job.settled){job.settled=true;reject(Error(e.message||'WORKER_FAILED'));this.release(job);}};
      try { worker.postMessage({type:'run',file,settings,operationId,inputRevision}); }
      catch(error) {job.settled=true;reject(error);this.release(job);}
    });
  }
  release(job){
    if(this.current===job)this.current=null;
    job.worker.terminate();
    this.cleanupPromise=this.cleanup(job.operationId).catch(error=>{
      this.emit({type:'cleanup-error',operationId:job.operationId,error:String(error)});throw error;
    });
    // Attach a handler immediately; dispose()/cancel() still return the original failure.
    this.cleanupPromise.catch(()=>{});return this.cleanupPromise;
  }
  async cancel(){
    const job=this.current;
    if(job){if(!job.settled){job.settled=true;job.reject(new DOMException('処理を取り消しました','AbortError'));}await this.release(job);}
    else await this.cleanupPromise;
  }
  async dispose(){await this.cancel();}
}

const BUILD='works-inference-v1';
export function createInferenceClient({workerFactory=()=>new Worker(new URL('./inference-worker.mjs',import.meta.url),{type:'module'}),onState=()=>{}}={}){
 let disposed=false,current=null,revision=0,serial=0;
 const sessionId=crypto.randomUUID();
 let state={status:'idle',inputRevision:revision};
 function update(next){state={...state,...next};onState({...state});}
 function cancel(){if(!current)return;const job=current;current=null;job.worker.terminate();job.reject(new Error('Inference cancelled'));update({status:'cancelled',progress:null});}
 const api={get state(){return{...state};},
  async run(request){
   if(disposed)throw Error('Inference client disposed');if(current)throw Error('Inference client busy');
   const {module,operation,manifest,files,input}=request;
   if(!['vae','text_encoder'].includes(module))throw TypeError('Unsupported inference module');
   const envelope={buildId:BUILD,sessionId,jobId:String(++serial),inputRevision:++revision,module,operation,manifest,files,input};
   const worker=workerFactory();
   return new Promise((resolve,reject)=>{
    const job={worker,resolve,reject,envelope};current=job;
    update({status:'running',module,operation,inputRevision:revision,progress:null,error:null});
    const matches=m=>current===job&&m.buildId===BUILD&&m.sessionId===sessionId&&m.jobId===envelope.jobId&&m.inputRevision===envelope.inputRevision;
    worker.addEventListener('message',({data:m})=>{
     if(!matches(m))return;
     if(m.type==='progress'){update({progress:m.progress});return;}
     if(!['success','failure'].includes(m.type))return;
     current=null;worker.terminate();
     if(m.type==='success'){update({status:'success',progress:null});resolve(m.result);}else{update({status:'error',progress:null,error:m.error});reject(Error(m.error));}
    });
    worker.addEventListener('error',e=>{if(current!==job)return;current=null;worker.terminate();update({status:'error',error:e.message,progress:null});reject(Error(e.message||'Worker failed'));});
    try{worker.postMessage(envelope);}catch(error){current=null;worker.terminate();update({status:'error',error:String(error),progress:null});reject(error);}
   });
  },cancel,invalidate(){cancel();revision++;update({status:'idle',inputRevision:revision,progress:null});},dispose(){cancel();disposed=true;update({status:'disposed'});}
 };
 return api;
}

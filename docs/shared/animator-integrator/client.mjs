const abort=()=>new DOMException('Operation cancelled.','AbortError');
const notify=(fn,p)=>{try{fn?.(p);}catch{}};
/** Dedicated Worker session. Private source copies survive termination and retries. */
export function createAnimatorIntegrator({workerFactory=()=>new Worker(new URL('./worker.mjs?v=vrcft5-rules-1',import.meta.url),{type:'module'})}={}){
 let worker=null,active=null,disposed=false,sequence=0,sources=null,revision=null,workerLoaded=false;
 function terminate(){worker?.terminate();worker=null;workerLoaded=false;}
 function cancel(){if(!active)return false;const current=active;active=null;terminate();current.reject(abort());return true;}
 function validateRevision(value){if(!Number.isSafeInteger(value)||value<0)throw TypeError('Invalid input revision.');}
 function begin(inputRevision){if(disposed)throw Error('Session disposed.');validateRevision(inputRevision);if(active)throw Error('Operation already running.');const operation={inputRevision,id:String(++sequence),reject:null};active=operation;return operation;}
 function current(op){if(disposed||active!==op)throw abort();}
 function call(op,operation,payload,onProgress){
  current(op);return new Promise((resolve,reject)=>{
   op.reject=reject;
   try{
    worker??=workerFactory();
    const fail=e=>{terminate();reject(e);};
    worker.onmessage=({data:m})=>{
     if(active!==op)return;
     if(m?.version!==1||m.id!==op.id||m.inputRevision!==op.inputRevision){fail(Error('Stale or malformed Worker response.'));return;}
     if(m.type==='progress'){if(typeof m.progress?.phase!=='string'){fail(Error('Malformed progress response.'));return;}notify(onProgress,m.progress);return;}
     if(m.type==='error'){const e=new Error(m.error?.message??'Worker failed.');e.name=m.error?.name??'Error';if(m.error?.issues)e.issues=m.error.issues;if(m.error?.report)e.report=m.error.report;reject(e);return;}
     if(m.type!=='result'){fail(Error('Malformed Worker response.'));return;}
     const r=m.result;
     if(operation==='import'&&(!r||!['controllers','expressions','blendTrees','masks'].every(k=>Array.isArray(r.catalog?.[k]))||!Array.isArray(r.inputHashes)||r.inputRevision!==op.inputRevision)){fail(Error('Malformed catalog result.'));return;}
     if(operation==='generate'&&(!(r?.archive instanceof Uint8Array)||!r.archive.length||r.report?.staticValidation?.status!=='PASS'||!Number.isSafeInteger(r.assetCount)||r.assetCount<1)){fail(Error('Malformed generation result.'));return;}
     resolve(r);
    };
    worker.onerror=e=>{e.preventDefault?.();fail(Error(e.message??'Worker stopped.'));};
    worker.onmessageerror=()=>fail(Error('Unreadable Worker response.'));
    worker.postMessage({version:1,id:op.id,inputRevision:op.inputRevision,operation,payload});
   }catch(e){terminate();reject(e);}
  });
 }
 async function load(op,onProgress){const result=await call(op,'import',{sources},onProgress);current(op);workerLoaded=true;return result;}
 return Object.freeze({
  async importSources(input,{inputRevision=0,onProgress}={}){
   if(disposed)throw Error('Session disposed.');validateRevision(inputRevision);
   if(!Array.isArray(input)||!input.length)throw TypeError('Choose source files.');
   const owned=input.map(s=>{if(typeof s?.name!=='string'||!(s.bytes instanceof Uint8Array))throw TypeError('Expected named Uint8Array source.');return {name:s.name,bytes:Uint8Array.from(s.bytes)};});
   cancel();terminate();sources=owned;revision=inputRevision;
   const op=begin(inputRevision);try{return await load(op,onProgress);}finally{if(active===op)active=null;}
  },
  async generate(request,{inputRevision=0,onProgress}={}){
   if(disposed)throw Error('Session disposed.');validateRevision(inputRevision);
   if(!sources||revision!==inputRevision)throw Error('Input revision mismatch. Import current sources first.');
   const ownedRequest=structuredClone(request),op=begin(inputRevision);
   try{if(!workerLoaded)await load(op,onProgress);current(op);const result=await call(op,'generate',{request:ownedRequest},onProgress);current(op);return result;}finally{if(active===op)active=null;}
  },
  cancel,
  dispose(){if(disposed)return;cancel();terminate();sources=null;disposed=true;},
 });
}

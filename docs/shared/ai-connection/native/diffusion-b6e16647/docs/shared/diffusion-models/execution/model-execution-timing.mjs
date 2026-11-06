// Inclusive wall-clock accounting: nested stages/operators must not be summed
// into a fabricated exclusive total or used as a performance acceptance gate.
export function createModelExecutionTiming({clock=()=>performance.now()}={}){
 const started=clock(),totals=Object.create(null),stack=[];let failure=null;
 function begin(kind,details){const entry={kind,details:{...details},started:clock()};stack.push(entry);return entry;}
 function end(entry,failed,error){
  const elapsedMs=clock()-entry.started,row=totals[entry.kind]??={calls:0,elapsedMs:0,failures:0};row.calls++;row.elapsedMs+=elapsedMs;
  if(failed){row.failures++;if(!failure)failure={kind:entry.kind,...entry.details,elapsedMs,error:{name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,1000)}};}
  stack.pop();
 }
 function sync(kind,details,fn){const entry=begin(kind,details);let error,failed=false;try{return fn();}catch(e){failed=true;error=e;throw e;}finally{end(entry,failed,error);}}
 async function asyncRun(kind,details,fn){const entry=begin(kind,details);let error,failed=false;try{return await fn();}catch(e){failed=true;error=e;throw e;}finally{end(entry,failed,error);}}
 function snapshot(){const active=stack.at(-1);return {elapsedMs:clock()-started,inclusive:true,sumIsNotExclusiveTotal:true,totals:structuredClone(totals),activeOperator:active?{kind:active.kind,...active.details,elapsedMs:clock()-active.started}:null,firstFailure:failure?structuredClone(failure):null};}
 return Object.freeze({sync,async:asyncRun,snapshot});
}

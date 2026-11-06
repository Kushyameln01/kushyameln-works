// Owner-local lifecycle helpers. A failed release keeps its original handle;
// independent owners still get their cleanup attempt. No native handle leaves
// this realm and no unreturned allocation is silently replaced with undefined.
export async function releaseOwnedResources(entries){
 const results=await Promise.allSettled(entries.filter(e=>e.value!==null&&e.value!==undefined).map(async entry=>{await entry.release(entry.value);entry.clear();}));
 const failures=results.filter(r=>r.status==='rejected').map(r=>r.reason);
 if(failures.length)throw new AggregateError(failures,'Owned QKV resource cleanup failed; retry before reuse');
}
export async function cleanupAfterFailure(original,cleanup){
 try{await cleanup();return original;}catch(error){const failure=new AggregateError([original,error],'QKV construction and cleanup failed; recover before releasing ownership',{cause:original});failure.recover=cleanup;return failure;}
}

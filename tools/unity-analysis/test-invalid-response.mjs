// Execute only after deployment, using UNITY_PAGES_ROOT.
import assert from 'node:assert/strict';
const root=process.env.UNITY_PAGES_ROOT;assert.ok(root);
const {createComputePool}=await import(new URL('file://'+root+'/shared/compute/pool.mjs'));
const {BUILD_ID}=await import(new URL('file://'+root+'/shared/compute/protocol.mjs'));
export async function checkInvalidResponse(){
 let worker;const pool=createComputePool({workerFactory:()=>worker={terminate(){},postMessage(request){queueMicrotask(()=>{const bad={kind:'unity-analysis',snapshotId:'snapshot',findings:[],references:[],shared:[],completeness:{totalCount:0,returnedCount:0,truncated:false}};bad.circular=bad;worker.onmessage?.({data:{...request,buildId:BUILD_ID,type:'result',result:bad,workerId:'fake',instanceId:'fake'}});});}}});
 try{const task=pool.submit({protocolVersion:1,taskType:'unity-analyze',taskVersion:1,jobId:'invalid-response',inputRevision:1,payload:{schemaVersion:'unity-analysis-snapshot/1',files:[]},limits:{timeoutMs:1000}});const r=await task.promise;assert.equal(r.status,'failed');assert.equal(r.errorCode,'INVALID_RESPONSE');assert.equal(pool.getStatus().outstanding,0);}finally{pool.dispose();}
}

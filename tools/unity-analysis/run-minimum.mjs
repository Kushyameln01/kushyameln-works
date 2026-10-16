// Execute only after a successful Pages deployment and hash-verified cloud acquisition.
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root=process.env.UNITY_PAGES_ROOT;assert.ok(root);
const receipt=JSON.parse(await readFile(root+'/../acquisition.json','utf8'));assert.equal(receipt.status,'verified-deployed-pages-copy');
const base=pathToFileURL(root+'/');
const {createComputePool}=await import(new URL('shared/compute/pool.mjs',base));
const {prepareTaskModule}=await import(new URL('shared/compute/tasks.mjs',base));
const {createUnityAnalyzer}=await import(new URL('shared/unity-analysis/sdk.mjs',base));
const {checkMinimum,checkReservedProperties,checkProvenance}=await import('./test-contract.mjs');
const {checkInvalidResponse}=await import('./test-invalid-response.mjs');
const fixture=JSON.parse(await readFile(new URL('./fixtures/minimum.json',import.meta.url),'utf8'));
const allowed=['shared/unity-analysis/kernel/unity-analysis.wasm','shared/ft/kernel/ft-kernel.wasm'].map(p=>new URL(p,base).href);
const fetchImpl=async url=>{assert.ok(allowed.includes(String(url)));return new Response(await readFile(new URL(url)),{headers:{'content-type':'application/wasm'}});};
function factory(mode){return ()=>{const w=new Worker(new URL('./cloud-worker.mjs',import.meta.url),{workerData:{root,mode}}),a={postMessage:(d,t)=>w.postMessage(d,t),terminate:()=>w.terminate(),onmessage:null,onerror:null,onmessageerror:null};w.on('message',d=>a.onmessage?.({data:d}));w.on('error',e=>a.onerror?.(e));w.on('messageerror',e=>a.onmessageerror?.(e));return a;};}
const results=[];let reference;
for(const concurrency of [1,2,4])for(const moduleReuse of [false,true]){
 const mode=concurrency===4?'bundle':'module';const pool=createComputePool({concurrency,moduleReuse,workerMode:mode,workerFactory:factory(mode),prepareModule:o=>prepareTaskModule({...o,fetchImpl})});
 try{const report=await checkMinimum(pool);if(reference)assert.deepEqual(report.before,reference);else reference=report.before;
 await checkReservedProperties(pool);await checkProvenance(pool);
 const a=createUnityAnalyzer({pool}),b=createUnityAnalyzer({pool});try{const cancelled=a.analyze(fixture.before);a.cancel(cancelled.sessionId);const survivor=b.analyze(fixture.after);const ft=pool.submit({protocolVersion:1,taskType:'ft-magnitude-batch',taskVersion:1,jobId:'mixed-ft',inputRevision:0,payload:{masks:[0,1,3,7],weights:[1,2,4]}});await assert.rejects(cancelled,/CANCELLED/);assert.equal((await survivor).status,'succeeded');const ftResult=await ft.promise;assert.equal(ftResult.status,'succeeded');assert.deepEqual(ftResult.result,[0,1,3,7]);pool.releaseResult(ft.jobId);a.dispose();assert.equal(pool.getStatus().disposed,false);}finally{a.dispose();b.dispose();}
 assert.equal(pool.getStatus().outstanding,0);assert.equal(pool.getStatus().retainedCount,0);
 results.push({concurrency,moduleReuse,mode,status:'PASS',metrics:report.metrics,jobs:report.jobs});
 await writeFile(process.env.UNITY_EVIDENCE_DIR+'/minimum-full-'+concurrency+'-'+moduleReuse+'.json',JSON.stringify(report,null,2));
 }finally{pool.dispose();}
}
await checkInvalidResponse();
console.log(JSON.stringify({status:'PASS',runtime:process.version,deployment:receipt.commit,results,invalidResponse:'PASS'},null,2));

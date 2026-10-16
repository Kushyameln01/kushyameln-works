// Expectations precede bounded batching. Execute only against the next identified Pages copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {base,receipt,poolFor,createComputePool} from './cloud-harness.mjs';
const {createUnityFileAnalyzer}=await import(new URL('shared/unity-analysis/file-sdk.mjs',base));
const ingest=await import(new URL('shared/unity-analysis/ingest-task.mjs',base));
const {BUILD_ID}=await import(new URL('shared/compute/protocol.mjs',base));
assert.equal(receipt.status,'verified-deployed-pages-copy');
const enc=new TextEncoder(),yaml=i=>`%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!1 &1\nGameObject:\n  m_Name: Item ${i}\n`;
const files=n=>Array.from({length:n},(_,i)=>({path:`Assets/${String(i).padStart(3,'0')}.asset`,bytes:enc.encode(yaml(i))}));
const request=(items,jobId='batch')=>({protocolVersion:1,taskType:'unity-parse-batch',taskVersion:1,jobId,inputRevision:7,payload:{files:items}});
const semantic=r=>({before:r.before,after:r.after,diff:r.diff,inputs:r.inputs,completeness:r.completeness,beforeInventory:r.ingestion.before,afterInventory:r.ingestion.after});
const parseJobs=r=>r.ingestion.jobs.filter(j=>j.taskType==='unity-parse'||j.taskType==='unity-parse-batch');
async function analyze(input,{concurrency=2,parseBatchSize=8,after}={}){
 const pool=poolFor(concurrency,false),sdk=createUnityFileAnalyzer({pool,concurrency,parseBatchSize});
 try{const r=await (after?sdk.compare(input,after):sdk.analyze(input));assert.equal(pool.getStatus().outstanding,0);assert.equal(pool.getStatus().retainedCount,0);return r;}finally{sdk.dispose();pool.dispose();}
}

test('batch request limits, path conflicts, byte ownership and order are explicit',()=>{
 for(const input of [[],files(9),[{path:'Assets/too-big.bin',bytes:new Uint8Array(256*1024+1)}],[{path:'../escape',bytes:new Uint8Array()}],
  [{path:'Assets/A',bytes:new Uint8Array()},{path:'Assets/a',bytes:new Uint8Array()}],
  [{path:'Assets/A',bytes:new Uint8Array()},{path:'Assets/A/child',bytes:new Uint8Array()}]])assert.throws(()=>ingest.inspectTaskRequest(request(input)));
 assert.throws(()=>ingest.inspectTaskRequest(request([{path:'Assets/x',bytes:new Uint8Array(new SharedArrayBuffer(1))}])));
 const input=files(2),inspected=ingest.inspectTaskRequest(request(input)),owned=ingest.snapshotTaskRequest(inspected),shape=ingest.resultShape(owned);
 assert.deepEqual(shape.paths,input.map(f=>f.path));assert.equal(shape.count,2);assert.equal(ingest.inputBytes(owned),input.reduce((n,f)=>n+f.bytes.length,0));
 const originalByte=owned.payload.files[0].bytes[0];input[0].bytes[0]^=1;assert.equal(owned.payload.files[0].bytes[0],originalByte);
 assert.equal(ingest.transferTaskInput(owned).length,2);assert.notEqual(owned.payload.files[0].bytes.buffer,input[0].bytes.buffer);
 assert.equal(ingest.kernelInfo(owned).requiresWasm,false);assert.equal(ingest.kernelInfo(owned).retainResult,false);
 const exact=ingest.inspectTaskRequest(request([{path:'Assets/a.bin',bytes:new Uint8Array(128*1024)},{path:'Assets/b.bin',bytes:new Uint8Array(128*1024)}]));
 assert.equal(ingest.inputBytes(exact),256*1024);
 for(const parseBatchSize of [0,9,1.5,NaN])assert.throws(()=>createUnityFileAnalyzer({parseBatchSize}));
});
test('batch response verifies count, ordered identity, bytes, hash and parser contract',async()=>{
 const r=ingest.inspectTaskRequest(request(files(2))),shape=ingest.resultShape(r),result=await ingest.executeTask(r);
 assert.equal(result.kind,'unity-parsed-batch');assert.equal(ingest.validTaskResult(r.taskType,shape,result),true);
 for(const mutate of [x=>x.files.reverse(),x=>x.files.pop(),x=>x.files.push(structuredClone(x.files[0])),x=>x.files[0].path='Assets/forged.asset',
  x=>x.files[0].byteLength++,x=>x.files[0].contentHash='forged',x=>x.files[0].coverage='complete',x=>x.parserVersion='forged',x=>x.kind='unity-parsed']){
  const invalid=structuredClone(result);mutate(invalid);assert.equal(ingest.validTaskResult(r.taskType,shape,invalid),false);
 }
 assert.deepEqual(ingest.transferTaskResult(result),[]);assert.equal(ingest.taskInputCount(r),ingest.inputBytes(r));
});
test('malformed batch response settles INVALID_RESPONSE and does not poison later jobs',async()=>{
 let corrupt=true;
 const pool=createComputePool({workerFactory:()=>{const worker={terminate(){},postMessage(r){queueMicrotask(()=>{
  const items=r.payload.files.map(f=>({path:f.path,byteLength:f.bytes.length,contentHash:'0'.repeat(64),coverage:'opaque',objects:[],issues:[]}));
  if(corrupt)items.reverse();
  worker.onmessage?.({data:{...r,buildId:BUILD_ID,type:'result',workerId:'batch-test-worker',instanceId:null,result:{kind:'unity-parsed-batch',parserVersion:ingest.PARSER_VERSION,files:items}}});
 });}};return worker;}});
 try{const failed=await pool.submit(request(files(2),'invalid-batch')).promise;assert.equal(failed.status,'failed');assert.equal(failed.errorCode,'INVALID_RESPONSE');assert.equal(pool.getStatus().outstanding,0);
  corrupt=false;const recovered=await pool.submit(request(files(2),'valid-batch')).promise;assert.equal(recovered.status,'succeeded');assert.equal(pool.getStatus().retainedCount,0);
 }finally{pool.dispose();}
});
test('64 small files preserve semantics, hashes and order with fewer jobs at one and four Workers',async()=>{
 for(const concurrency of [1,4]){
  const input=files(64),before=input.map(f=>f.bytes.slice()),single=await analyze(input,{concurrency,parseBatchSize:1}),batch=await analyze(input,{concurrency});
  assert.deepEqual(semantic(batch),semantic(single));assert.equal(parseJobs(single).length,64);assert.equal(parseJobs(batch).length,8);
  assert.ok(parseJobs(single).every(j=>j.taskType==='unity-parse'));assert.ok(parseJobs(batch).every(j=>j.taskType==='unity-parse-batch'));
  assert.equal(new Set(parseJobs(batch).map(j=>j.workerId)).size,8);assert.equal(batch.metrics.settings.moduleReuse,false);assert.equal(batch.metrics.settings.parseBatchSize,8);
  assert.ok(parseJobs(batch).every(j=>j.instanceId===null&&j.metrics.wasmSha256===null));assert.deepEqual(input.map(f=>f.bytes),before);
 }
});
test('raw before/after four-function results and all inventory remain identical',async()=>{
 const fixture=JSON.parse(await readFile(new URL('shared/unity-analysis/raw-example.json',base),'utf8'));
 const input=side=>fixture[side].map(f=>({path:f.path,bytes:enc.encode(f.text)}));
 const single=await analyze(input('before'),{parseBatchSize:1,after:input('after')}),batch=await analyze(input('before'),{after:input('after')});
 assert.deepEqual(semantic(batch),semantic(single));assert.equal(parseJobs(batch).length,2);assert.equal(parseJobs(single).length,12);
});
test('one file and files above 256 KiB retain single-job behavior; exactly eight files form one job',async()=>{
 const one=await analyze(files(1));assert.equal(parseJobs(one).length,1);assert.equal(parseJobs(one)[0].taskType,'unity-parse');
 const input=[...files(8),{path:'Assets/999.bin',bytes:new Uint8Array(256*1024+1)}];
 const single=await analyze(input,{parseBatchSize:1}),batch=await analyze(input);
 assert.deepEqual(semantic(batch),semantic(single));assert.deepEqual(new Set(parseJobs(batch).map(j=>j.taskType)),new Set(['unity-parse','unity-parse-batch']));assert.equal(parseJobs(batch).length,2);
});
test('batch output may exceed its raw input budget without truncation or a new normal-input rejection',async()=>{
 const input=files(8).map((f,i)=>({...f,bytes:enc.encode(yaml(i)+Array.from({length:300},(_,j)=>`  field${j}: value${j}\n`).join(''))}));
 assert.ok(input.reduce((n,f)=>n+f.bytes.length,0)<256*1024);
 const single=await analyze(input,{parseBatchSize:1}),batch=await analyze(input);
 assert.deepEqual(semantic(batch),semantic(single));assert.ok(enc.encode(JSON.stringify(batch.before)).length>256*1024);assert.equal(batch.completeness.truncated,false);
});
test('waves keep the shared 16 MiB admission budget with oversized single files',async()=>{
 const pool=poolFor(4,false);let peak=0;const observed={...pool,submit(r){const h=pool.submit(r);peak=Math.max(peak,pool.getStatus().inputBytes);return h;}};
 const sdk=createUnityFileAnalyzer({pool:observed,concurrency:4});
 try{const r=await sdk.analyze(Array.from({length:5},(_,i)=>({path:`Assets/${i}.bin`,bytes:new Uint8Array(4*1024*1024)})));assert.equal(r.before.counts.files,5);assert.ok(peak<=16*1024*1024);assert.equal(pool.getStatus().outstanding,0);assert.equal(pool.getStatus().retainedCount,0);}finally{sdk.dispose();pool.dispose();}
});
test('cancelling an admitted batch preserves a second caller, retained FT data and retry',async()=>{
 const pool=poolFor(4,false);let cancelNext=true,a,pending;
 const watched={...pool,submit(r){const h=pool.submit(r);if(cancelNext&&r.taskType==='unity-parse-batch'){cancelNext=false;queueMicrotask(()=>a.cancel(pending.sessionId));}return h;}};
 a=createUnityFileAnalyzer({pool:watched,concurrency:2});const b=createUnityFileAnalyzer({pool,concurrency:2});
 try{const ft=pool.submit({protocolVersion:1,taskType:'ft-magnitude-batch',taskVersion:1,jobId:'batch-retain-ft',inputRevision:0,payload:{masks:[0,1,3],weights:[1,2]}});assert.equal((await ft.promise).status,'succeeded');const retained=pool.getResult(ft.jobId);
  pending=a.analyze(files(16));const rejection=assert.rejects(pending,/CANCELLED/);const surviving=b.analyze(files(9));await rejection;const r=await surviving;
  assert.equal(r.before.counts.files,9);assert.equal(pool.getResult(ft.jobId),retained);const retry=await a.analyze(files(9));assert.deepEqual(semantic(retry),semantic(r));
  a.dispose();assert.equal(pool.getStatus().disposed,false);assert.equal((await b.analyze(files(1))).before.counts.files,1);pool.releaseResult(ft.jobId);assert.equal(pool.getStatus().outstanding,0);assert.equal(pool.getStatus().retainedCount,0);
 }finally{a.dispose();b.dispose();pool.dispose();}
});

// Performance adoption remains a separate root-owned experiment: identical input hashes/results,
// outerWallMs, fresh pools, five samples at batchSize 1/8; >=15% many-small median gain at 1/4 Workers
// and <=10% small median regression. Functional PASS alone does not establish a speed improvement.

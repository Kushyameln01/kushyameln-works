// Regression of the six public task contracts on a source candidate, through real Node Workers.
// Browser UI acceptance and deployed-byte verification are separate gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {candidatePool,base} from './candidate-harness.mjs';
const fixture=JSON.parse(await readFile(new URL('../unity-analysis/fixtures/minimum.json',import.meta.url),'utf8'));
const raw=JSON.parse(await readFile(new URL('shared/unity-analysis/raw-example.json',base),'utf8')).before.slice(0,2);
const {createUnityAnalyzer}=await import(new URL('shared/unity-analysis/sdk.mjs',base));
const request=(jobId,taskType,payload)=>({protocolVersion:1,taskType,taskVersion:1,jobId,inputRevision:31,payload});
for(const mode of ['module','bundle'])for(const moduleReuse of [false,true])test(`six contracts, ownership and SDK caller: ${mode}, reuse=${moduleReuse}`,async t=>{
  const pool=candidatePool({concurrency:2,moduleReuse,mode});t.after(()=>pool.dispose());
  const files=raw.map(f=>({path:f.path,bytes:new TextEncoder().encode(f.text)}));
  const original=files.map(f=>f.bytes.slice());
  const requests=[
    request('ft','ft-magnitude-batch',{masks:[0,1,2,3],weights:[0.25,1.5]}),
    request('analyze','unity-analyze',fixture.before),
    request('diff','unity-diff',fixture),
    request('expand','unity-expand',files[0]),
    request('parse','unity-parse',files[0]),
    request('batch','unity-parse-batch',{files})
  ];
  const responses=await pool.submitBatch(requests).promise;
  assert.deepEqual(responses.map(r=>r.jobId),requests.map(r=>r.jobId));
  assert.ok(responses.every(r=>r.status==='succeeded'&&r.inputRevision===31),JSON.stringify(responses.map(r=>({task:r.taskType,status:r.status,error:r.errorCode,message:r.message}))));
  assert.equal(new Set(responses.map(r=>r.generation)).size,6);
  assert.equal(new Set(responses.map(r=>r.workerId)).size,6);
  assert.deepEqual(responses[0].result,[0,0.25,1.5,1.75]);
  const analysis=responses[1].result;
  assert.ok(analysis.shared.some(x=>x.fileId==='9223372036854775807'&&x.incoming===2));
  assert.ok(analysis.findings.some(x=>x.code==='PARAMETER_TYPE_CONSTRAINT'&&x.name==='Speed'));
  assert.ok(responses[2].result.changes.some(x=>x.property==='/m_Name'&&x.before==='Idle'&&x.after==='Idle revised'));
  assert.deepEqual(responses[3].result.files[0].bytes,original[0]);
  assert.equal(responses[4].result.file.objects[0].fileId,'9223372036854775807');
  assert.deepEqual(responses[5].result.files.map(f=>f.path),files.map(f=>f.path));
  assert.deepEqual(responses[5].result.files[0],responses[4].result.file);
  for(let i=0;i<files.length;i++)assert.deepEqual(files[i].bytes,original[i]);
  for(const r of responses.slice(0,3)){assert.ok(r.instanceId);assert.ok(r.metrics.memoryBytes>0);assert.equal(pool.getResult(r.jobId),r);}
  for(const r of responses.slice(3)){assert.equal(r.instanceId,null);assert.equal(r.metrics.wasmSha256,null);assert.equal(r.metrics.memoryBytes,null);assert.equal(pool.getResult(r.jobId),null);assert.equal(pool.getStatus(r.jobId),null);}
  assert.equal(pool.getStatus().retainedCount,3);assert.equal(pool.getStatus().outstanding,0);assert.equal(pool.getStatus().inputBytes,0);
  assert.ok(pool.releaseResult('ft'));assert.deepEqual(responses[0].result,[0,0.25,1.5,1.75]);
  const sdk=createUnityAnalyzer({pool});t.after(()=>sdk.dispose());
  const report=await sdk.compare(fixture.before,fixture.after,{inputRevision:32});
  assert.equal(report.status,'succeeded');assert.equal(report.inputRevision,32);assert.equal(report.completeness.truncated,false);
  assert.ok(report.diff.changes.some(x=>x.property==='/m_Name'&&x.after==='Idle revised'));
  assert.equal(pool.getStatus().retainedCount,2); // SDK releases its own three responses only.
  pool.dispose();assert.equal(pool.getStatus().retainedCount,0);assert.equal(pool.getStatus().inputBytes,0);
});

test('FT accepted fractional weights of lengths 1..5 and rejection boundary remain unchanged',async t=>{
  const pool=candidatePool({concurrency:2});t.after(()=>pool.dispose());
  const requests=Array.from({length:5},(_,i)=>{
    const weights=[0.25,1.5,2.25,4,0.5].slice(0,i+1);
    return request(`weights-${i+1}`,'ft-magnitude-batch',{weights,masks:Array.from({length:2**weights.length},(_,mask)=>mask)});
  });
  requests.push(request('empty','ft-magnitude-batch',{weights:[0.25],masks:[]}));
  const responses=await pool.submitBatch(requests).promise;
  responses.forEach((r,i)=>{assert.equal(r.status,'succeeded');assert.deepEqual(r.result,requests[i].payload.masks.map(mask=>requests[i].payload.weights.reduce((sum,w,bit)=>sum+((mask>>bit)&1)*w,0)));});
  for(const weights of [[0],[-1],[NaN],[Infinity],[Number.MAX_VALUE,Number.MAX_VALUE],[],[1,1,1,1,1,1]])assert.throws(()=>pool.submit(request('invalid','ft-magnitude-batch',{masks:[],weights})));
  for(const masks of [[-1],[2],[0.5],[NaN],[Infinity],Array(262145).fill(0)])assert.throws(()=>pool.submit(request('invalid','ft-magnitude-batch',{masks,weights:[1]})));
  assert.equal(pool.getStatus().outstanding,0);assert.equal(pool.getStatus().inputBytes,0);
});

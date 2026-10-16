// Source-candidate profile: real Node Workers, file-backed fixed WASM; not browser performance.
import {candidatePool,base,root} from './candidate-harness.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {BUILD_ID}=await import(new URL('shared/compute/protocol.mjs',base));
const runs=[];
for(const inputCount of [8192,262144])for(let iteration=0;iteration<4;iteration++){
  const masks=Array.from({length:inputCount},(_,i)=>i%8);
  const request={protocolVersion:1,taskType:'ft-magnitude-batch',taskVersion:1,jobId:`profile-${inputCount}-${iteration}`,inputRevision:0,payload:{masks,weights:[1,2,4]}};
  const pool=candidatePool({concurrency:1});
  try{const start=performance.now();const response=await pool.submit(request).promise;const callerElapsedMs=performance.now()-start;
    assert.equal(response.status,'succeeded');assert.deepEqual(response.result,masks);
    const {result,...job}=response;runs.push({inputCount,iteration,callerElapsedMs,correct:true,job});
  }finally{pool.dispose();}
}
const report={kind:'ft-source-profile',schemaVersion:1,buildId:BUILD_ID,sourceRoot:root,environment:{runtime:process.version,platform:process.platform,worker:'node:worker_threads',transport:'file-backed fixed WASM',browser:false},timingScope:'submit call immediately before -> promise resolved immediately after; request generation, assertion and dispose excluded',runs};
await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({buildId:BUILD_ID,rows:runs.length,correct:runs.every(r=>r.correct),output:process.argv[2]}));

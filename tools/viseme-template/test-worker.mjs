// Unmodified product module/bundle Workers in Node; not a browser claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidatePool} from '../shared-compute/candidate-harness.mjs';
import {createVisemeGenerator} from '../../docs/viseme-template/client.mjs';
for(const mode of ['module','bundle'])test(`Viseme client through actual ${mode} Worker: retry, transfer and borrowed pool`,async t=>{
  const pool=candidatePool({mode});t.after(()=>pool.dispose());
  const generator=createVisemeGenerator({pool});t.after(()=>generator.dispose());
  const cancelled=generator.generate('Cancelled',{inputRevision:1});
  generator.cancel();await assert.rejects(cancelled,{name:'AbortError'});
  const result=await generator.generate('顔/メッシュ "A" #1',{inputRevision:2});
  assert.equal(result.embeddedClipCount,15);assert.equal(result.externalClipCount,1);
  assert(result.bytes instanceof Uint8Array&&result.bytes.length>0);
  assert.equal(result.execution.metrics.wasmSha256,'b260ac37862014a9ebb3ebb25739283fe2778e638969e757b2fd34769cd989ad');
  assert.equal(pool.getResult(result.execution.jobId),null);
  assert.equal(pool.getStatus().outstanding,0);
  generator.dispose();
  const ft=await pool.submit({protocolVersion:1,taskType:'ft-magnitude-batch',taskVersion:1,jobId:'survivor',inputRevision:3,payload:{masks:[0,1,3],weights:[1,2]}}).promise;
  assert.equal(ft.status,'succeeded');assert.deepEqual(ft.result,[0,1,3]);
});

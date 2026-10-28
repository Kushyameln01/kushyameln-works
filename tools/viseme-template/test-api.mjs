import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateVisemeTemplate,isVisemeResult} from '../../docs/viseme-template/api.mjs';
import * as tasks from '../../docs/shared/compute/tasks.mjs';
import {prepareKernelModule} from '../../docs/shared/compute/kernel.mjs';
const source=new URL('../../docs/viseme-template/template.json',import.meta.url);
const nativeFetch=globalThis.fetch;
// Node has no file: fetch. Keep actual template and WASM bytes; replace only transport.
globalThis.fetch=async(url,options)=>url.protocol==='file:'?new Response(await readFile(url)):nativeFetch(url,options);
const client=await import('../../docs/viseme-template/client.mjs').catch(()=>({}));
const request=(meshName='Body')=>({protocolVersion:1,taskType:'viseme-template-generate',taskVersion:1,jobId:'viseme.test',inputRevision:7,payload:{meshName}});

test('public API owns source loading, defaults to Body, validates output and rejects corrupted source',async()=>{
  const result=await generateVisemeTemplate();assert(isVisemeResult(result));assert.equal(result.meshName,'Body');
  assert(!isVisemeResult({...result,bytes:new Uint8Array()}));
  assert(!isVisemeResult(result,{meshName:'Other'}));
  assert(!isVisemeResult({...result,mapping:{...result.mapping,clips:[]}}));
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>url.href===source.href?new Response('{}'):original(url,options);
  try{await assert.rejects(generateVisemeTemplate(),/Template/);}finally{globalThis.fetch=original;}
});
test('shared adapter produces transferable delivery-only result using the actual Hike kernel',async()=>{
  const r=tasks.inspectTaskRequest(request());
  const info=tasks.kernelInfo(r);assert.equal(info.retainResult,false);assert.notEqual(info.requiresWasm,false);
  const module=await prepareKernelModule(),kernel=tasks.instantiateTask(r,module);
  const result=await tasks.executeTask(r,kernel);
  assert(isVisemeResult(result));assert(tasks.validTaskResult(r.taskType,tasks.resultShape(r),result));
  assert.equal(result.kind,'viseme-template-package');assert.deepEqual(tasks.transferTaskResult(result),[result.bytes.buffer]);
  assert(!tasks.validTaskResult(r.taskType,tasks.resultShape(r),{...result,meshName:'wrong'}));
  assert.throws(()=>tasks.inspectTaskRequest(request('')));
});
test('cancelling a borrowed-pool client rejects late results, permits retry and leaves other jobs alive',async()=>{
  assert.equal(typeof client.createVisemeGenerator,'function');
  const result=await generateVisemeTemplate();
  const pending=[],cancelled=[],released=[];
  const pool={submit(r){return {jobId:r.jobId,promise:new Promise(resolve=>pending.push({r,resolve}))};},cancel(id){cancelled.push(id);},releaseResult(id){released.push(id);},dispose(){throw Error('Must not dispose caller pool');}};
  const generator=client.createVisemeGenerator({pool});
  const a=generator.generate('Body',{inputRevision:1});const rejected=assert.rejects(a,{name:'AbortError'});
  assert(generator.cancel());
  const b=generator.generate('Body',{inputRevision:2});
  const response=item=>({protocolVersion:1,buildId:'compute-parameter-b1',taskType:item.r.taskType,taskVersion:1,generation:1,jobId:item.r.jobId,inputRevision:item.r.inputRevision,status:'succeeded',result:{kind:'viseme-template-package',...result}});
  pending[1].resolve(response(pending[1]));assert.equal((await b).meshName,'Body');
  pending[0].resolve(response(pending[0]));await rejected;
  assert.deepEqual(cancelled,[pending[0].r.jobId]);assert.equal(released.length,2);
  generator.dispose();await assert.rejects(generator.generate(),/終了/);
});

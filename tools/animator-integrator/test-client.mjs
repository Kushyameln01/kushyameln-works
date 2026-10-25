import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {integratorFixture} from './fixture.mjs';
const client=await import('../../docs/shared/animator-integrator/client.mjs').catch(()=>({}));
function workerFactory(){const worker=new Worker(new URL('./node-worker.mjs',import.meta.url));const bridge={postMessage:(...args)=>worker.postMessage(...args),terminate:()=>worker.terminate()};worker.on('message',data=>bridge.onmessage?.({data}));worker.on('error',e=>bridge.onerror?.(e));return bridge;}
test('public client executes dedicated Worker import/generate and preserves caller buffers across cancel/retry',async()=>{
 assert.equal(typeof client.createAnimatorIntegrator,'function');const f=integratorFixture(),before=Uint8Array.from(f.sources[0].bytes),s=client.createAnimatorIntegrator({workerFactory});
 try{const imported=await s.importSources(f.sources,{inputRevision:4});assert.equal(imported.catalog.controllers.length,2);assert.equal(imported.inputRevision,4);
 const pending=s.generate(f.request,{inputRevision:4});assert.equal(s.cancel(),true);await assert.rejects(pending,e=>e.name==='AbortError');
 const progress=[],r=await s.generate(f.request,{inputRevision:4,onProgress:p=>progress.push(p)});assert(r.archive instanceof Uint8Array);assert.equal(r.report.staticValidation.status,'PASS');assert(progress.length);assert.deepEqual(f.sources[0].bytes,before);
 await assert.rejects(s.generate(f.request,{inputRevision:3}),/revision/i);
 }finally{s.dispose();}await assert.rejects(s.generate(f.request,{inputRevision:4}),/disposed/i);
});
test('new import invalidates running generation; conflicting generation issues survive Worker boundary',async()=>{
 const f=integratorFixture(),s=client.createAnimatorIntegrator({workerFactory});try{await s.importSources(f.sources,{inputRevision:0});const p=s.generate(f.request);const loaded=s.importSources(f.sources,{inputRevision:1});await assert.rejects(p,e=>e.name==='AbortError');await loaded;
 await assert.rejects(s.generate({...f.request,binaryTreeId:f.request.maskId},{inputRevision:1}),e=>e.name==='IntegrationError'&&e.issues.some(i=>i.code==='selection_type'));
 }finally{s.dispose();}
});
test('stale and malformed Worker replies reject rather than expose unvalidated output',async()=>{
 for(const kind of ['stale','malformed']){const s=client.createAnimatorIntegrator({workerFactory:()=>({postMessage(m){queueMicrotask(()=>this.onmessage({data:kind==='stale'?{version:1,id:'stale',inputRevision:m.inputRevision,type:'result',result:{}}:{version:1,id:m.id,inputRevision:m.inputRevision,type:'result',result:{}}}));},terminate(){}})});try{await assert.rejects(s.importSources(integratorFixture().sources),/result|response|stale|catalog/i);}finally{s.dispose();}}
});

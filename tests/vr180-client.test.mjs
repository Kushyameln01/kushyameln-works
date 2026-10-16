import test from 'node:test';
import assert from 'node:assert/strict';
import {StereoClient} from '../docs/shared/vr180/client.mjs';
class MockWorker {
  static instances=[];
  constructor(){MockWorker.instances.push(this);this.messages=[];}
  postMessage(m){this.messages.push(m);}
  terminate(){this.terminated=true;}
  emit(m){this.onmessage?.({data:m});}
}
const message=(w,type,result)=>({type,operationId:w.messages[0].operationId,inputRevision:w.messages[0].inputRevision,result});
test('cancelled input A cannot replace input B with late success or error',async()=>{
  const events=[];const c=new StereoClient({WorkerClass:MockWorker,onEvent:e=>events.push(e),cleanup:async()=>{}});
  const a=c.run(new Blob(['A']),{});const rejected=assert.rejects(a,{name:'AbortError'});const wa=MockWorker.instances.at(-1);
  await c.cancel();await rejected;
  const b=c.run(new Blob(['B']),{});const wb=MockWorker.instances.at(-1);
  wa.emit(message(wa,'result',{wrong:true}));wa.emit({...message(wa,'error'),error:'old'});
  wb.emit(message(wb,'result',{correct:true}));assert.equal((await b).correct,true);
  assert.equal(events.filter(e=>e.type==='result').length,1);await c.dispose();
});
test('revision mismatch is ignored and worker failure cleans its own job',async()=>{
  const removed=[];const c=new StereoClient({WorkerClass:MockWorker,cleanup:async id=>removed.push(id)});
  const p=c.run(new Blob(),{});const w=MockWorker.instances.at(-1);
  w.emit({...message(w,'result',{wrong:true}),inputRevision:999});
  w.emit({...message(w,'error'),error:'CODEC_UNSUPPORTED'});
  await assert.rejects(p,/CODEC_UNSUPPORTED/);await c.dispose();assert.equal(removed.length,1);
});
test('disposing a retained result releases worker and matching temporary storage',async()=>{
  const removed=[];const c=new StereoClient({WorkerClass:MockWorker,cleanup:async id=>removed.push(id)});
  const p=c.run(new Blob(),{});const w=MockWorker.instances.at(-1);w.emit(message(w,'result',{blob:new Blob(['ok'])}));await p;
  assert.notEqual(w.terminated,true);await c.dispose();assert.equal(w.terminated,true);assert.equal(removed[0],w.messages[0].operationId);
});
test('synchronous postMessage failure releases Worker and permits retry',async()=>{
  class BadWorker extends MockWorker {postMessage(){throw Error('DATA_CLONE_FAILED');}}
  const removed=[];const c=new StereoClient({WorkerClass:BadWorker,cleanup:async id=>removed.push(id)});
  await assert.rejects(c.run(new Blob(),{}),/DATA_CLONE_FAILED/);
  await c.dispose();assert.equal(c.current,null);assert.equal(removed.length,1);assert.equal(MockWorker.instances.at(-1).terminated,true);
});

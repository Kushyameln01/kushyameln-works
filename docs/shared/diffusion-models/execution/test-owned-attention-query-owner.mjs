import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnedAttentionQueries} from './owned-attention-query.mjs';

// Ownership/admission doubles only. These tests do not calculate attention.
function fixture(){
 let tensorCreations=0,throwAt=0,cleanupEvents=0,captures=0,runHook=null;const inputs=[],all=[];
 class Tensor{
  constructor(type,data,dims){if(++tensorCreations===throwAt)throw Error('Injected constructor failure');this.type=type;this.data=data;this.dims=dims;this.disposeCalls=0;this.failOnce=false;all.push(this);}
  dispose(){this.disposeCalls++;if(this.failOnce){this.failOnce=false;throw Error('Injected dispose failure');}this.disposed=true;}
 }
 const outputs=feeds=>({max:new Tensor('float32',new Float32Array(feeds.previousMax.data.length),feeds.previousMax.dims),denominator:new Tensor('float32',new Float32Array(feeds.previousDenominator.data.length).fill(1),feeds.previousDenominator.dims),context:new Tensor('float32',new Float32Array(feeds.q.data.length).fill(42),feeds.q.dims)});
 const validate=(tensor,shape)=>{assert.equal(tensor?.type,'float32');assert.deepEqual(tensor.dims,shape);assert.ok(tensor.data.every(Number.isFinite));return tensor.data;};
 const owner=createOwnedAttentionQueries({ort:{Tensor},session:{},assertLive(){},capture(value,count){captures++;assert.equal(value.length,count);assert.ok(value.every(Number.isFinite));return new Float32Array(value);},validateOutput:validate,copyOutput:(...args)=>new Float32Array(validate(...args)),async run(session,feeds){inputs.push(feeds);return runHook?runHook(feeds):outputs(feeds);},onCleanupFailure(){cleanupEvents++;}});
 return {owner,all,inputs,outputs,get captures(){return captures;},get cleanupEvents(){return cleanupEvents;},set run(value){runHook=value;},throwCreation(number){throwAt=number;},get created(){return tensorCreations;}};
}
const query=(owner,expectedKeys=2)=>owner.begin({q:new Float32Array(40*128).fill(1),heads:40,queries:1,headDim:128,expectedKeys});
const tile=(handle,keys=1)=>({queryHandle:handle,k:new Float32Array(40*keys*128),v:new Float32Array(40*keys*128),keys});

test('query captures Q once, retains private state and finishes only after all keys',async()=>{
 const f=fixture(),q=new Float32Array(5120).fill(1),h=f.owner.begin({q,heads:40,queries:1,headDim:128,expectedKeys:2});q.fill(99);
 await f.owner.step(tile(h));assert.equal(f.inputs[0].q.data[0],1);assert.equal(f.owner.stats().ownedTensors,4);assert.throws(()=>f.owner.finish(h),/every expected key/);
 await f.owner.step(tile(h));const output=f.owner.finish(h);assert.equal(output.context[0],42);assert.equal(output.evidence.keys,2);assert.equal(f.captures,5);assert.equal(f.owner.stats().ownedTensors,0);assert.equal(f.owner.stats().currentCpuTensorSpanBytes,0);assert.equal(f.owner.release(h),false);f.owner.disposeAll();
});

test('foreign handles and key overflow reject before K/V capture',async()=>{
 const f=fixture(),h=query(f.owner);const before=f.captures;
 await assert.rejects(f.owner.step(tile({...h})),/foreign|released/);await assert.rejects(f.owner.step(tile(h,3)),/remaining/);assert.equal(f.captures,before);assert.equal(f.owner.stats().stepsCompleted,0);f.owner.release(h);await assert.rejects(f.owner.step(tile(h)),/foreign|released/);f.owner.disposeAll();
});

test('aborted run cleans new outputs and K/V while keeping the old state retryable',async()=>{
 const f=fixture(),h=query(f.owner,1),control=new AbortController();let resolve,first=true;
 f.run=feeds=>{if(first){first=false;return new Promise(done=>{resolve=()=>done(f.outputs(feeds));});}return f.outputs(feeds);};
 const pending=f.owner.step({...tile(h),signal:control.signal});await Promise.resolve();assert.throws(()=>f.owner.release(h),/active/);const reason=new Error('cancel query');control.abort(reason);resolve();await assert.rejects(pending,error=>error===reason);
 assert.equal(f.owner.stats().ownedTensors,4);assert.equal(f.owner.stats().queries[0].processedKeys,0);await f.owner.step(tile(h));f.owner.finish(h);assert.equal(f.owner.stats().ownedTensors,0);f.owner.disposeAll();
});

test('release failure retains failed owners, attempts every tensor and permits recovery',()=>{
 const f=fixture(),h=query(f.owner);f.all[0].failOnce=true;assert.throws(()=>f.owner.release(h),AggregateError);assert.equal(f.cleanupEvents,1);assert.equal(f.owner.stats().ownedTensors,1);assert.ok(f.all.every(t=>t.disposeCalls===1));assert.throws(()=>query(f.owner),/cleanup/);f.owner.disposeAll();assert.equal(f.owner.stats().ownedTensors,0);assert.equal(f.owner.stats().disposed,true);
});

test('finish cannot return a partial success when native release fails',async()=>{
 const f=fixture(),h=query(f.owner,1);await f.owner.step(tile(h));f.inputs[0].q.failOnce=true;assert.throws(()=>f.owner.finish(h),AggregateError);assert.equal(f.owner.stats().ownedTensors,1);assert.throws(()=>f.owner.finish(h),/cleanup/);f.owner.disposeAll();assert.equal(f.owner.stats().ownedTensors,0);
});

test('partial query preparation retains failed cleanup for disposeAll recovery',()=>{
 const f=fixture();f.throwCreation(3);
 // q/max are built before the injected denominator construction failure.
 assert.throws(()=>query(f.owner),/constructor/);assert.equal(f.owner.stats().ownedQueryCount,0);assert.equal(f.owner.stats().queryCreations,1);assert.equal(f.owner.stats().queryReleases,1);assert.equal(f.owner.stats().ownedTensors,0);f.owner.disposeAll();
});

test('wrong native result binding does not leak the other returned Tensor owners',async()=>{
 const f=fixture(),h=query(f.owner,1);f.run=feeds=>{const result=f.outputs(feeds);result.extra=undefined;return result;};await assert.rejects(f.owner.step(tile(h)),/result tensor/);assert.equal(f.owner.stats().ownedTensors,4);assert.equal(f.owner.stats().queries[0].processedKeys,0);f.owner.release(h);f.owner.disposeAll();
});

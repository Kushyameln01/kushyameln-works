import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('./linear.mjs').catch(()=>({}));
test('P4 linear permits intact FFN-down reduction only at four output rows',()=>{
 assert.equal(typeof api.snapshotP4LinearInputs,'function');
 const accepted=api.snapshotP4LinearInputs({x:new Float32Array(2*13824),weight:new Float32Array(4*13824),rows:2,inner:13824,columns:4});
 assert.equal(accepted.x.length,27648);assert.equal(accepted.weight.length,55296);
 for(const [rows,inner,columns] of [[2,13824,5],[2,13823,4],[17,5120,4],[2,5121,4],[0,5120,4]])assert.throws(()=>api.snapshotP4LinearInputs({x:new Float32Array(1),weight:new Float32Array(1),rows,inner,columns}),/shape/);
 assert.throws(()=>api.snapshotP4LinearInputs({x:new Float32Array(13824),weight:new Float32Array(4*13824),rows:1,inner:13824,columns:4,reductionStart:1}),/Unknown/);
});
test('P4 linear owns finite compact native snapshots and rejects subclass/shared/detached storage',()=>{
 assert.equal(typeof api.snapshotP4LinearInputs,'function');
 const x=new Float32Array([1,2,3,4]),w=new Float32Array([5,6,7,8]);
 const out=api.snapshotP4LinearInputs({x,weight:w,rows:2,inner:2,columns:2});x.fill(99);w.fill(99);assert.deepEqual([...out.x],[1,2,3,4]);assert.deepEqual([...out.weight],[5,6,7,8]);
 class Alias extends Float32Array {}
 for(const bad of [new Alias(4),new Float32Array(5).subarray(1),new Float32Array([0,0,NaN,0]),new Float32Array(new SharedArrayBuffer(16))])assert.throws(()=>api.snapshotP4LinearInputs({x:bad,weight:new Float32Array(4),rows:2,inner:2,columns:2}),/F32|finite|compact/);
 const disguised=new Float32Array(new SharedArrayBuffer(16));Object.defineProperty(disguised,'buffer',{get:()=>new ArrayBuffer(16)});assert.throws(()=>api.snapshotP4LinearInputs({x:disguised,weight:new Float32Array(4),rows:2,inner:2,columns:2}),/F32/);
 const detached=new Float32Array(4);structuredClone(detached.buffer,{transfer:[detached.buffer]});assert.throws(()=>api.snapshotP4LinearInputs({x:detached,weight:new Float32Array(4),rows:2,inner:2,columns:2}),/F32|shape/);
});

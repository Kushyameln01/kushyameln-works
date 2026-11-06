import test from 'node:test';
import assert from 'node:assert/strict';
const stage=await import('./stage.mjs').catch(()=>({}));
const conditioning=await import('./conditioning.mjs').catch(()=>({}));
function input(){return {residual:new Float32Array(10240).fill(2),timeAct1:new Float32Array(5120).fill(3),conditioning:conditioning.captureP4FixtureConditioning({data:new Float32Array(8192),shape:[1,2,4096],attentionMask:new Uint8Array([1,0]),fixtureId:'runtime-boundary-test-v1',sourceRef:'test-stage.mjs'})};}
test('run snapshot captures all original context rows and only native owned hidden arrays',()=>{
 assert.equal(typeof stage.snapshotPostSelfAttentionInputs,'function');
 const x=input(),s=stage.snapshotPostSelfAttentionInputs(x);x.residual.fill(99);x.timeAct1.fill(99);x.conditioning.data.fill(99);
 assert.equal(s.residual[0],2);assert.equal(s.timeAct1[0],3);assert.equal(s.conditioning.data[0],0);assert.equal(s.conditioning.rows,2);assert.deepEqual([...s.conditioning.attentionMask],[1,0]);
 const bad=input();class Alias extends Float32Array{};bad.residual=new Alias(10240);assert.throws(()=>stage.snapshotPostSelfAttentionInputs(bad),/F32/);
 const shared=input();shared.timeAct1=new Float32Array(new SharedArrayBuffer(20480));assert.throws(()=>stage.snapshotPostSelfAttentionInputs(shared),/F32/);
 const detached=input();structuredClone(detached.residual.buffer,{transfer:[detached.residual.buffer]});assert.throws(()=>stage.snapshotPostSelfAttentionInputs(detached),/F32/);
});
test('run snapshot rejects unknown profile/shape overrides, forged or mutated captures before awaits',()=>{
 assert.equal(typeof stage.snapshotPostSelfAttentionInputs,'function');
 assert.throws(()=>stage.snapshotPostSelfAttentionInputs({...input(),mask:true}),/Unknown/);
 const x=input();x.conditioning.data[0]=1;assert.throws(()=>stage.snapshotPostSelfAttentionInputs(x),/mutat|captur|seal/i);
 const forged=input();forged.conditioning={...forged.conditioning};assert.throws(()=>stage.snapshotPostSelfAttentionInputs(forged),/captur|seal/i);
 const v=input();v.residual[0]=Infinity;assert.throws(()=>stage.snapshotPostSelfAttentionInputs(v),/finite/i);
});

test('projection evidence selects time chunks and intact FP8 FFN rows at their actual byte offsets',()=>{
 assert.equal(typeof stage.describeP4ProjectionSelection,'function');
 const time={originalKey:'time_projection.1.weight',absoluteByteOffset:111,byteLength:30720*5120*2,fullShape:[30720,5120],storageDtype:'F16',binding:{kind:'runtime-input',name:'time_projection.1.weight'}};
 const got=stage.describeP4ProjectionSelection(time,{rowStart:15360,rows:5120,inner:5120});
 assert.equal(got.originalAbsoluteByteOffset,111);assert.equal(got.absoluteByteOffset,157286511);assert.equal(got.selectedByteLength,52428800);assert.equal(got.selectedElementCount,26214400);assert.equal(got.rowStart,15360);assert.equal(got.rowCount,5120);assert.deepEqual(got.fullShape,[30720,5120]);assert.deepEqual(got.binding,time.binding);assert.equal(time.absoluteByteOffset,111);
 const down=stage.describeP4ProjectionSelection({absoluteByteOffset:222,fullShape:[5120,13824],storageDtype:'F8_E4M3'},{rowStart:8,rows:4,inner:13824});
 assert.equal(down.absoluteByteOffset,110814);assert.equal(down.selectedByteLength,55296);assert.equal(down.selectedElementCount,55296);
});

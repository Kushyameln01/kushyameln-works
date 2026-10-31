import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireQkNormRange,QK_NORM_MAX_ABS} from './norm-admission.mjs';
import {releaseOwnedResources,cleanupAfterFailure} from './ownership.mjs';
import {readFile} from 'node:fs/promises';
import {createHike} from '../../../inference/hike.mjs';
test('QK norm rejects finite values whose f32 square/reduction could overflow',async()=>{
 const finiteHuge=new Float32Array(81920).fill(1e19);assert.throws(()=>requireQkNormRange(finiteHuge),/range/i);
 const wasm=await readFile(new URL('../../../inference/kernel/tensor.wasm',import.meta.url)),kernel=await createHike(wasm,{capacity:5120});
 try{assert.ok(kernel.rmsNorm(finiteHuge,new Float32Array(5120).fill(1),16,5120,1e-6).every(v=>v===0),'Reproduce reused kernel overflow before P4 admission');}finally{kernel.dispose();}
 assert.throws(()=>requireQkNormRange(new Float32Array(81920).fill(NaN)));assert.throws(()=>requireQkNormRange(new Float32Array(81920).fill(Infinity)));
 const safe=new Float32Array(81920).fill(Math.fround(1e15));assert.equal(requireQkNormRange(safe),safe);assert.equal(QK_NORM_MAX_ABS,1e16);assert.ok(5120*QK_NORM_MAX_ABS**2<1e36);
});
test('resource cleanup tries every owner and keeps failed handles for retry',async()=>{
 const first={},second={};let a=first,b=second,callsA=0,callsB=0;
 const descriptors=()=>[{value:a,release:async v=>{assert.equal(v,first);if(++callsA===1)throw Error('release A failed');},clear:()=>{a=null;}},{value:b,release:async v=>{assert.equal(v,second);callsB++;},clear:()=>{b=null;}}];
 await assert.rejects(()=>releaseOwnedResources(descriptors()),AggregateError);assert.equal(a,first);assert.equal(b,null);assert.equal(callsB,1);
 await releaseOwnedResources(descriptors());assert.equal(a,null);assert.equal(callsA,2);assert.equal(callsB,1);
});
test('constructor failure keeps the original error and a local cleanup retry closure',async()=>{
 const original=Error('constructor failed');let calls=0;
 const failure=await cleanupAfterFailure(original,async()=>{if(++calls===1)throw Error('cleanup failed');});
 assert.ok(failure instanceof AggregateError);assert.equal(failure.errors[0],original);assert.equal(failure.cause,original);assert.equal(typeof failure.recover,'function');await failure.recover();assert.equal(calls,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url=new URL('./joint-browser-cases.mjs',import.meta.url);
test('joint comparator visits every selected value and preserves declared gate',async()=>{assert.ok(await fs.stat(url).catch(()=>null),'joint full-selection comparator missing');const {compareAll}=await import(url);const a=new Float32Array(81920),b=new Float64Array(81920);a[81919]=2;const r=compareAll(a,b,{absolute:1e-5,relative:1e-4});assert.equal(r.compared,81920);assert.equal(r.passed,false);assert.deepEqual(r.failedIndices,[81919]);assert.equal(r.maxAbsoluteError,2);});
test('joint comparator rejects missing values, nonfinite values and unspecified gate',async()=>{assert.ok(await fs.stat(url).catch(()=>null),'joint comparator missing');const {compareAll}=await import(url);assert.throws(()=>compareAll(new Float32Array(15),new Float64Array(16),{absolute:0,relative:0}),/length|shape/);assert.throws(()=>compareAll(new Float32Array([NaN]),new Float64Array([0]),{absolute:0,relative:0}),/finite/);assert.throws(()=>compareAll(new Float32Array([0]),new Float64Array([0]),{}),/gate|tolerance/);});

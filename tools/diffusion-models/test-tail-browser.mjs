import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {compare,selectExecutedSources,releaseOwners} from '../../docs/shared/diffusion-models/diagnostics/self-attention-tail/common.mjs';
globalThis.crypto??=webcrypto;
test('all-value comparison checks finite values and last element against fixed envelope',async()=>{
 const gate={abs:1e-4,rel:1e-5};
 assert.equal((await compare(Float32Array.of(1,2),[1,2],gate)).failed,0);
 await assert.rejects(compare(Float32Array.of(1,2.01),[1,2],gate),/Fixed numerical gate failed/);
 await assert.rejects(compare(Float32Array.of(1,NaN),[1,2],gate),/Fixed numerical gate failed/);
 await assert.rejects(compare(Float32Array.of(1,2),[1,Infinity],gate),/Fixed numerical gate failed/);
});
test('executed sources exclude unrequested candidates and reject unknown modules',()=>{
 assert.deepEqual(selectExecutedSources({'docs/a.mjs':'a','docs/old-harness.mjs':'b'},['docs/a.mjs'],{'tools/new.py':'c'}),{'tools/new.py':'c','docs/a.mjs':'a'});
 assert.throws(()=>selectExecutedSources({},['unknown.mjs'],{}),/Unanchored executed source/);
});
test('owner release failure restores observer and attempts all remaining owners',async()=>{
 const calls=[];await assert.rejects(releaseOwners([{async dispose(){calls.push('first');throw Error('failed');}},{async dispose(){calls.push('second');}}],{restore(){calls.push('restore');}}),/cleanup failed/);
 assert.deepEqual(calls,['first','second','restore']);
});

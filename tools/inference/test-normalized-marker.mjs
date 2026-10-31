import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {encodeTensor,decodeTensor} from '../../docs/shared/inference/tensor.mjs';

// Immutable historical implementation, no network and no model execution.
const legacySource=await readFile(new URL('./fixtures/tensor-2c171.mjs',import.meta.url));
assert.equal(createHash('sha256').update(legacySource).digest('hex'),'4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b');
const legacy=await import('data:text/javascript;base64,'+legacySource.toString('base64'));
const MARKER='wan21-comfy-f32-v1';
const fixture=()=>({dtype:'float32',shape:[1,16,1,2,4],layout:'NCTHW',meaning:'wan21-normalized-posterior-mean:v1',
 modelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',data:new Float32Array(128).fill(.25),
 context:{schemaVersion:1,contextId:'serialization-fixture',inputId:'fixture',inputSha256:'a'.repeat(64),slotId:'fixture-slot',sourceFrameIndices:[4,2,2,0],sourceFrameTimesSeconds:[.4,.2,.2,0]}});

test('supplied normalized marker survives current codec with all metadata and values',async()=>{
 const t={...fixture(),normalization:MARKER},r=await decodeTensor(await encodeTensor(t));
 assert.equal(r.normalization,MARKER);assert.equal(r.meaning,t.meaning);assert.deepEqual(r.shape,t.shape);
 assert.deepEqual(r.context,t.context);assert.deepEqual(r.data,t.data);assert.equal(r.modelSha256,t.modelSha256);
});
test('normalized marker is snapshotted before asynchronous digest',async()=>{
 const t={...fixture(),normalization:MARKER},pending=encodeTensor(t);t.normalization='caller-changed-after-dispatch';
 const r=await decodeTensor(await pending);assert.equal(r.normalization,MARKER);
});
test('old markerless normalized file is readable and byte-identical when reserialized',async()=>{
 const t=fixture(),old=await legacy.encodeTensor(t),r=await decodeTensor(old);
 assert.equal(Object.hasOwn(r,'normalization'),false);assert.deepEqual(await encodeTensor(r),old);
});
test('old raw-mean files retain byte-identical serialization and no inferred marker',async()=>{
 const t={...fixture(),meaning:'raw-posterior-mean'},old=await legacy.encodeTensor(t);
 assert.deepEqual(await encodeTensor(t),old);assert.equal(Object.hasOwn(await decodeTensor(old),'normalization'),false);
});
test('historical reader accepts new optional marker; historical writer still drops it',async()=>{
 const t={...fixture(),normalization:MARKER},r=await legacy.decodeTensor(await encodeTensor(t));
 assert.equal(r.normalization,MARKER);assert.deepEqual(r.data,t.data);
 const rewritten=await legacy.decodeTensor(await legacy.encodeTensor(r));assert.equal(Object.hasOwn(rewritten,'normalization'),false);
});
test('raw and conflicting normalized markers remain rejected',async()=>{
 for(const t of [{...fixture(),normalization:'wrong-rule'},{...fixture(),meaning:'raw-posterior-mean',normalization:MARKER}])await assert.rejects(()=>encodeTensor(t),/normalization marker/);
});

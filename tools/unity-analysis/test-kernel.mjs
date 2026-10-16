// AUTHORED BEFORE IMPLEMENTATION. Run only after Pages publication + exact cloud acquisition.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=process.env.UNITY_PAGES_ROOT;
assert.ok(root,'UNITY_PAGES_ROOT must name verified Pages cloud copy');
const {instantiateUnityKernel,prepareUnityKernel}=await import('file://'+root+'/shared/unity-analysis/kernel/kernel.mjs');
const {UNITY_KERNEL}=await import('file://'+root+'/shared/unity-analysis/kernel/registry.mjs');

const input = values => Int32Array.from(values);
async function moduleAndBytes() {
  const bytes = new Uint8Array(await readFile(new URL(UNITY_KERNEL.url)));
  return {bytes, module: await WebAssembly.compile(bytes)};
}
async function kernel() { return instantiateUnityKernel((await moduleAndBytes()).module); }

test('independent incoming, type and diff expected vectors; inputs remain unchanged', async () => {
  const k = await kernel();
  const edges=input([1,1,3,0,3]), actual=input([0,1,2,3,4,1,2]), masks=input([2,2,4,10,16,0,2]);
  const before=input([0,1,2,2147483647]), after=input([0,3,2,2147483646]);
  assert.deepEqual([...k.incoming(edges,5)],[1,2,0,2,0]);
  assert.deepEqual([...k.types(actual,masks)],[0,1,1,1,1,0,2]);
  assert.deepEqual([...k.diff(before,after)],[0,1,0,1]);
  assert.deepEqual([...edges],[1,1,3,0,3]);
  assert.deepEqual([...actual],[0,1,2,3,4,1,2]);
  assert.deepEqual([...before],[0,1,2,2147483647]);
  assert.equal(k.resourceStats().liveBytes,0);
  k.dispose();
});

test('empty input is successful and returned arrays do not alias subsequent calls or Memory', async () => {
  const k=await kernel();
  assert.deepEqual([...k.incoming(input([]),0)],[]);
  assert.deepEqual([...k.incoming(input([]),3)],[0,0,0]);
  assert.deepEqual([...k.types(input([]),input([]))],[]);
  assert.deepEqual([...k.diff(input([]),input([]))],[]);
  const result=k.incoming(input([0,0]),1);
  k.incoming(input([0]),1);
  assert.deepEqual([...result],[2]);
  assert.notEqual(result.buffer,k.memory.buffer);
  const {arenaBase,peakBytes}=k.resourceStats();
  assert.ok(new Uint8Array(k.memory.buffer,arenaBase,peakBytes).every(v=>v===0));
  k.dispose(); assert.deepEqual([...result],[2]);
  assert.throws(()=>k.diff(input([]),input([])),/DISPOSED/);
});

test('adapter rejects invalid shape, range, alias, shared and detached inputs and then recovers', async () => {
  const k=await kernel();
  assert.throws(()=>k.incoming([0],1),/INT32/);
  assert.throws(()=>k.incoming(input([1]),1),/TARGET/);
  assert.throws(()=>k.incoming(input([-1]),1),/TARGET/);
  assert.throws(()=>k.incoming(input([]),-1),/NODE_COUNT/);
  assert.throws(()=>k.types(input([5]),input([31])),/TYPE_TAG/);
  assert.throws(()=>k.types(input([1]),input([32])),/TYPE_MASK/);
  assert.throws(()=>k.types(input([1]),input([])),/LENGTH/);
  assert.throws(()=>k.diff(input([-1]),input([0])),/EQUIVALENCE_ID/);
  assert.throws(()=>k.diff(new Int32Array(k.memory.buffer,0,1),input([0])),/ALIAS/);
  assert.throws(()=>k.diff(new Int32Array(new SharedArrayBuffer(4)),input([0])),/BUFFER/);
  const detached=input([0]); structuredClone(detached,{transfer:[detached.buffer]});
  assert.throws(()=>k.diff(detached,input([])));
  assert.deepEqual([...k.diff(input([8]),input([8]))],[0]); k.dispose();
});

test('prototype maximum, grow-view refresh and independent instances', async () => {
  const {module}=await moduleAndBytes(),a=instantiateUnityKernel(module),b=instantiateUnityKernel(module);
  assert.notEqual(a.memory,b.memory); assert.notEqual(a.instanceId,b.instanceId);
  const n=262144,all=new Int32Array(n),oldBuffer=a.memory.buffer;
  const counts=a.incoming(all,n); assert.equal(counts.length,n); assert.equal(counts[0],n);
  assert.ok(counts.subarray(1).every(v=>v===0)); assert.notEqual(a.memory.buffer,oldBuffer);
  assert.ok(a.memory.buffer.byteLength<=16777216);
  assert.throws(()=>a.incoming(new Int32Array(n+1),1),/VECTOR_LIMIT/);
  assert.throws(()=>a.incoming(input([]),n+1),/NODE_COUNT/);
  assert.deepEqual([...b.incoming(input([0]),1)],[1]); a.dispose(); b.dispose();
});

test('raw ABI validates counts and values before writing output', async () => {
  const {module}=await moduleAndBytes(),ex=new WebAssembly.Instance(module).exports;
  const base=ex.memory.buffer.byteLength; ex.memory.grow(1);
  const a=new Int32Array(ex.memory.buffer,base,8); a.set([0,2,999,999,999,999,999,999]);
  assert.equal(ex.UaIncoming(base,2,2,base+16,2),-2);
  assert.deepEqual([...a.subarray(4,6)],[999,999]);
  assert.equal(ex.UaIncoming(base,-1,2,base+16,2),-1);
  assert.equal(ex.UaIncoming(base,1,2,base+16,1),-1);
  a.set([1,5,2,2]); assert.equal(ex.UaTypeCheck(base,base+8,2,base+16,2),-2);
  assert.deepEqual([...a.subarray(4,6)],[999,999]);
  a.set([0,-1,0,0]); assert.equal(ex.UaDiff(base,base+8,2,base+16,2),-2);
  assert.deepEqual([...a.subarray(4,6)],[999,999]);
  assert.equal(ex.UaDiff(0,0,0,0,0),0);
});

test('preparation verifies identity, rejects corrupt bytes and honors abort', async () => {
  const {bytes}=await moduleAndBytes(); let calls=0;
  const fetchImpl=async()=>new Response(bytes,{headers:{'content-type':'application/wasm'}});
  assert.ok(await prepareUnityKernel({fetchImpl,onCompile:()=>calls++}) instanceof WebAssembly.Module);
  assert.equal(calls,1);
  const changed=bytes.slice();changed[changed.length-1]^=1;
  await assert.rejects(prepareUnityKernel({fetchImpl:async()=>new Response(changed)}),/HASH/);
  const c=new AbortController();c.abort();
  await assert.rejects(prepareUnityKernel({signal:c.signal,fetchImpl}),/aborted/i);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const here=new URL('./',import.meta.url);
assert.ok(fs.existsSync(new URL('./hike.mjs',here)), 'Projection bridge Hike host is not implemented');
const {createProjectionBridge}=await import('./hike.mjs');
const bytes=fs.readFileSync(new URL('./kernel/bridge.wasm',here));
const cases=[];
const run=async(name,fn)=>{await fn();cases.push({name,status:'PASS'});};
const bridge=await createProjectionBridge(bytes);
await run('E4M3FN finite boundaries and signed zero are scaled in Hike',()=>{
  const actual=bridge.dequant(new Uint8Array([0,128,1,129,7,8,56,184,126,254]),0.5);
  const expected=[0,-0,1/1024,-1/1024,7/1024,1/128,0.5,-0.5,224,-224];
  actual.forEach((value,i)=>assert.ok(Object.is(value,expected[i]),`${i}: ${value}`));
});
await run('bias addition is real f32 and preserves caller buffers',()=>{
  const y=new Float32Array([0.5,16777216,-2]),bias=new Float32Array([0.25,1,3]);
  assert.deepEqual(bridge.addBias(y,bias),new Float32Array([0.75,16777216,1]));
  assert.deepEqual(y,new Float32Array([0.5,16777216,-2]));
  assert.deepEqual(bias,new Float32Array([0.25,1,3]));
});
await run('invalid scalar/code/shape/capacity is rejected',()=>{
  for(const scale of [0,-1,NaN,Infinity,'1',null,1e-50,1e40])
    assert.throws(()=>bridge.dequant(new Uint8Array([56]),scale));
  for(const code of [127,255]) assert.throws(()=>bridge.dequant(new Uint8Array([56,code]),1));
  assert.throws(()=>bridge.dequant(new Uint8Array(),1));
  assert.throws(()=>bridge.dequant(new Uint8Array(81921),1));
  assert.throws(()=>bridge.dequant([56],1));
  assert.throws(()=>bridge.addBias(new Float32Array(2),new Float32Array(1)));
  assert.throws(()=>bridge.addBias(new Float32Array(17),new Float32Array(17)));
  assert.throws(()=>bridge.addBias(new Float32Array([NaN]),new Float32Array([0])));
});
await run('overflow never publishes nonfinite output and next call recovers',()=>{
  assert.throws(()=>bridge.dequant(new Uint8Array([126]),3e38));
  assert.throws(()=>bridge.addBias(new Float32Array([3e38]),new Float32Array([3e38])));
  assert.deepEqual(bridge.dequant(new Uint8Array([56,64]),2),new Float32Array([2,4]));
});
await run('full 81920-code buffers use fixed workspace and owned output',()=>{
  const q=Uint8Array.from({length:81920},(_,i)=>i%2?56:184),original=q.slice(),before=bridge.stats();
  const first=bridge.dequant(q,0.25);
  for(let i=0;i<100;i++){
    const out=bridge.dequant(q,0.25);
    assert.ok(out.every((v,j)=>v===(j%2?0.25:-0.25)));
    out[0]=9;
    assert.equal(bridge.stats().memoryBytes,before.memoryBytes);
  }
  assert.deepEqual(q,original);assert.equal(first[0],-0.25);
});
await run('WASM input bytes are snapshotted before asynchronous hash/compile',async()=>{
  const mutable=new Uint8Array(bytes),pending=createProjectionBridge(mutable);mutable.fill(0);
  const other=await pending;assert.deepEqual(other.dequant(new Uint8Array([56]),1),new Float32Array([1]));other.dispose();
});
await run('WASM hash mismatch refuses execution without fallback',async()=>{
  await assert.rejects(createProjectionBridge(new Uint8Array()));
  await assert.rejects(createProjectionBridge(bytes,{expectedSha256:'0'.repeat(64)}));
});
const resources=bridge.stats();
await run('dispose is idempotent and refuses both computations',()=>{
  bridge.dispose();bridge.dispose();
  assert.throws(()=>bridge.dequant(new Uint8Array([56]),1));
  assert.throws(()=>bridge.addBias(new Float32Array([1]),new Float32Array([1])));
  assert.equal(bridge.stats().memoryBytes,0);
});
const result={scope:'Hike dequant/add-bias bridge primitives only; no full model inference',wasmSha256:crypto.createHash('sha256').update(bytes).digest('hex'),cases,resources,jsNumericalFallback:false};
fs.writeFileSync(new URL('./kernel/node-results.json',here),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));

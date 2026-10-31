import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let createQkvRope;try{({createQkvRope}=await import('./rope.mjs'));}catch{}
const f=Math.fround;
function expectedMatrix(positions,ids){
 const result=new Float32Array(4096);
 for(let row=0;row<16;row++)for(let pair=0;pair<64;pair++){
  const axis=pair<22?0:pair<43?1:2,local=pair-(axis===0?0:axis===1?22:43),dim=axis===0?44:42;
  const angle=Number(positions[row*3+axis])/Math.pow(10000,2*local/dim),c=f(Math.cos(angle)),s=f(Math.sin(angle));let m=[c,-s,s,c];
  if(ids[row]!==0){const sourceAngle=ids[row]/Math.pow(10000,2*pair/128),a=f(Math.cos(sourceAngle)),b=f(Math.sin(sourceAngle));m=[f(f(c*a)+f(-s*b)),f(f(c*-b)+f(-s*a)),f(f(s*a)+f(c*b)),f(f(s*-b)+f(c*a))];}
  result.set(m,(row*64+pair)*4);
 }return result;
}
function compare(actual,expected,absolute,relative){assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-expected[i])<=absolute+relative*Math.abs(expected[i]),'index '+i+': '+actual[i]+' vs '+expected[i]);}
function coordinates(){const p=new Float32Array(48),s=new Int32Array(16);for(let i=0;i<16;i++){p.set([i%21,(i*3)%30,(i*7)%52],i*3);s[i]=i%3;}return {positions:p,sourceIds:s};}
test('actual Hike RoPE matrix/apply retains separate axis and source rotations',async()=>{
 assert.equal(typeof createQkvRope,'function','Missing QKV RoPE Hike module');
 const k=await createQkvRope({wasmBytes:await readFile(new URL('./kernel.wasm',import.meta.url))});
 try{
  const input=coordinates(),expected=expectedMatrix(input.positions,input.sourceIds),originalP=input.positions.slice(),originalS=input.sourceIds.slice();
  const matrices=k.matrix(input);compare(matrices,expected,2e-6,2e-6);assert.deepEqual(input.positions,originalP);assert.deepEqual(input.sourceIds,originalS);
  const values=Float32Array.from({length:2048},(_,i)=>f((i%101-50)/32)),before=values.slice(),y=k.apply({values,matrices}),oracle=new Float32Array(2048);
  for(let i=0;i<1024;i++){oracle[i*2]=f(f(expected[i*4]*values[i*2])+f(expected[i*4+1]*values[i*2+1]));oracle[i*2+1]=f(f(expected[i*4+2]*values[i*2])+f(expected[i*4+3]*values[i*2+1]));}
  compare(y,oracle,1e-4,1e-4);assert.deepEqual(values,before);const memory=k.stats().memoryBytes;
  matrices.fill(999);y.fill(999);for(let i=0;i<10;i++){const next=k.matrix(input);compare(next,expected,2e-6,2e-6);k.apply({values,matrices:next});assert.equal(k.stats().memoryBytes,memory);}
  assert.equal(k.stats().workspaceReused,true);
 }finally{k.dispose();}assert.throws(()=>k.matrix(coordinates()),/disposed/);
});
test('RoPE shape/finite/ownership/BUSY contracts reject before writes',async()=>{
 assert.equal(typeof createQkvRope,'function','Missing QKV RoPE Hike module');const k=await createQkvRope({wasmBytes:await readFile(new URL('./kernel.wasm',import.meta.url))});
 try{
  const input=coordinates();assert.throws(()=>k.matrix({...input,positions:new Float32Array(47)}));assert.throws(()=>k.matrix({...input,positions:Float32Array.from({length:48},()=>NaN)}));assert.throws(()=>k.matrix({...input,sourceIds:new Int32Array(16).fill(-1)}));assert.throws(()=>k.matrix({...input,sourceIds:new Int32Array(16).fill(16777217)}));assert.throws(()=>k.matrix({...input,positions:new Float32Array(new ArrayBuffer(200),4,48)}));
  if(typeof SharedArrayBuffer==='function')assert.throws(()=>k.matrix({...input,positions:new Float32Array(new SharedArrayBuffer(192))}));
  let reentered=false;const wrapped={get positions(){reentered=true;assert.throws(()=>k.matrix(input),/busy/);return input.positions;},sourceIds:input.sourceIds};k.matrix(wrapped);assert.equal(reentered,true);
  const matrix=k.matrix(input);assert.throws(()=>k.apply({values:new Float32Array(2047),matrices:matrix}));assert.throws(()=>k.apply({values:new Float32Array(2048),matrices:new Float32Array(4095)}));
 }finally{k.dispose();}
});
test('native RoPE ABI refuses invalid rows/capacity/finite/source IDs',async()=>{
 const bytes=await readFile(new URL('./kernel.wasm',import.meta.url)),{instance}=await WebAssembly.instantiate(bytes,{env:{cos:Math.cos,sin:Math.sin,pow:Math.pow}}),e=instance.exports;
 const start=e.memory.buffer.byteLength;e.memory.grow(1);const p=start,s=p+192,m=s+64,v=m+16384,o=v+8192;
 const sentinel=new Float32Array(e.memory.buffer,m,4096);sentinel.fill(17);
 assert.equal(e.Build(p,s,17,m,4096),-1);assert.equal(e.Build(p,s,16,m,4095),-1);assert.ok(sentinel.every(x=>x===17));
 new Float32Array(e.memory.buffer,p,48)[0]=NaN;assert.equal(e.Build(p,s,16,m,4096),-2);assert.ok(sentinel.every(x=>x===17));new Float32Array(e.memory.buffer,p,48)[0]=0;
 new DataView(e.memory.buffer,s,64).setInt32(0,-1,true);assert.equal(e.Build(p,s,16,m,4096),-2);assert.ok(sentinel.every(x=>x===17));new DataView(e.memory.buffer,s,64).setInt32(0,0,true);
 assert.equal(e.Build(p,s,16,m,4096),0);assert.equal(e.Apply(v,m,17,o,2048),-1);assert.equal(e.Apply(v,m,16,o,2047),-1);
 sentinel[0]=Infinity;assert.equal(e.Apply(v,m,16,o,2048),-2);sentinel[0]=2;new Float32Array(e.memory.buffer,v,2048)[0]=3.4028234663852886e38;assert.equal(e.Apply(v,m,16,o,2048),-3);
});

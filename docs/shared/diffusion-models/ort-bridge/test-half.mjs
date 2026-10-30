import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {createProjectionBridge} from './hike.mjs';

const bytes=fs.readFileSync(new URL('./kernel/bridge.wasm',import.meta.url));
const cases=[];
const run=async(name,fn)=>{await fn();cases.push({name,status:'PASS'});};
const bridge=await createProjectionBridge(bytes);
const memoryBytes=bridge.stats().memoryBytes;
let error=null;
try {
 await run('DecodeF16 is an implemented public Hike bridge operation',()=>assert.equal(typeof bridge.decodeF16,'function'));
 await run('half finite boundaries and signed zero match independent native Float16 decoding',()=>{
  const bits=new Uint16Array([0,32768,1,32769,1023,1024,15360,48128,31743,64511]);
  const actual=bridge.decodeF16(bits);
  const expected=[0,-0,2**-24,-(2**-24),1023*2**-24,2**-14,1,-1,65504,-65504];
  actual.forEach((v,i)=>assert.ok(Object.is(v,expected[i]),`${i}: ${v}`));
 });
 await run('all 63488 finite half bit patterns match native reference exactly',()=>{
  const finite=[];for(let i=0;i<65536;i++)if(((i>>>10)&31)!==31)finite.push(i);
  const bits=Uint16Array.from(finite),actual=bridge.decodeF16(bits),reference=new DataView(new ArrayBuffer(2));
  assert.equal(actual.length,63488);
  for(let i=0;i<bits.length;i++){
   reference.setUint16(0,bits[i],true);
   assert.ok(Object.is(actual[i],reference.getFloat16(0,true)),`half bits ${bits[i].toString(16)}: ${actual[i]}`);
  }
 });
 await run('Inf/NaN and invalid half shapes fail without publishing output and recover',()=>{
  for(const code of [0x7c00,0xfc00,0x7c01,0xfc01,0x7e00,0xfe00,0x7fff,0xffff])
   assert.throws(()=>bridge.decodeF16(new Uint16Array([0x3c00,code,0x4000])));
  for(const input of [new Uint16Array(),new Uint16Array(81921),new Uint8Array([0]),[0]])
   assert.throws(()=>bridge.decodeF16(input));
  assert.deepEqual(bridge.decodeF16(new Uint16Array([0x3c00,0xc000])),new Float32Array([1,-2]));
 });
 await run('full 81920 half inputs retain caller data, own output and reuse fixed workspace',()=>{
  const bits=Uint16Array.from({length:81920},(_,i)=>i%2?0x3c00:0xc000),before=bits.slice(),memory=bridge.stats().memoryBytes;
  const first=bridge.decodeF16(bits);
  for(let i=0;i<30;i++){
   const output=bridge.decodeF16(bits);
   assert.ok(output.every((v,j)=>v===(j%2?1:-2)));
   output.fill(7);
   assert.equal(bridge.stats().memoryBytes,memory);
  }
  assert.deepEqual(bits,before);assert.equal(first[0],-2);assert.equal(first[1],1);
 });
 await run('adding half decoding preserves FP8 and Hike bias operations',()=>{
  assert.deepEqual(bridge.dequant(new Uint8Array([56,64]),0.5),new Float32Array([0.5,1]));
  assert.deepEqual(bridge.addBias(new Float32Array([1]),new Float32Array([0.25])),new Float32Array([1.25]));
 });
 await run('all finite FP8 codes at four scales preserve exact dequant regression',()=>{
  const codes=Uint8Array.from({length:256},(_,i)=>i).filter(v=>(v&127)!==127);
  const scales=[1,0.5,0.0004149845917709172,0.0004648481262847781];
  for(const scale of scales){
   const actual=bridge.dequant(codes,scale);
   for(let i=0;i<codes.length;i++){
    const code=codes[i],exponent=(code>>>3)&15,mantissa=code&7;
    let value=exponent===0?mantissa*2**-9:(1+mantissa/8)*2**(exponent-7);
    if(code&128)value*=-1;
    assert.ok(Object.is(actual[i],Math.fround(value*Math.fround(scale))),`FP8 ${code}/${scale}`);
   }
  }
  fs.writeFileSync(new URL('./kernel/exhaustive-results.json',import.meta.url),JSON.stringify({finiteCodeScaleComparisons:codes.length*scales.length,status:'PASS',memoryBytes,scales,wasmSha256:crypto.createHash('sha256').update(bytes).digest('hex'),generatedBy:'test-half.mjs FP8 regression'},null,2)+'\n');
 });
 await run('raw DecodeF16 ABI rejects count/capacity and uses fresh views after Memory grow',async()=>{
  const module=await WebAssembly.compile(bytes),instance=await WebAssembly.instantiate(module,{}),ex=instance.exports;
  assert.equal(typeof ex.DecodeF16,'function');
  const start=ex.memory.buffer.byteLength;ex.memory.grow(2);
  const view=new DataView(ex.memory.buffer);view.setUint16(start,0x3c00,true);
  assert.equal(ex.DecodeF16(start,1,start+4,1),0);
  assert.equal(view.getFloat32(start+4,true),1);
  assert.equal(ex.DecodeF16(start,0,start+4,1),-1);
  assert.equal(ex.DecodeF16(start,1,start+4,0),-1);
  assert.equal(ex.DecodeF16(start,1,start+4,81921),-1);
  view.setUint16(start,0x7c00,true);assert.equal(ex.DecodeF16(start,1,start+4,1),-2);
 });
 await run('dispose is idempotent and rejects half decoding',()=>{
  bridge.dispose();bridge.dispose();assert.throws(()=>bridge.decodeF16(new Uint16Array([0x3c00])));
 });
} catch(e) {error={name:e.name,message:e.message};process.exitCode=1;}
const resources=bridge.stats();bridge.dispose();
const result={scope:'Hike F16-to-F32 bridge only; no full-model inference or quantized matmul equivalence',cases,error,resources,peakFixedMemoryBytes:memoryBytes,wasmSha256:crypto.createHash('sha256').update(bytes).digest('hex'),reference:'ECMAScript DataView.getFloat16 independent native reference; 63488 finite bit patterns',jsNumericalFallback:false};
const record=process.argv[2];if(record){fs.mkdirSync(path.dirname(record),{recursive:true});fs.writeFileSync(record,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify(result));

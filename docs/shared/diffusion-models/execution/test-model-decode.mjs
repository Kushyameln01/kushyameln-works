import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProjectionBridge} from '../ort-bridge/hike.mjs';
import {createModelLookupDecoder} from './model-decode.mjs';

const lookupBytes=()=>readFile(new URL('./model-decode/model-decode.wasm',import.meta.url));
const bridgeBytes=()=>readFile(new URL('../ort-bridge/kernel/bridge.wasm',import.meta.url));
const finiteHalfCodes=()=>Uint16Array.from({length:65536},(_,index)=>index).filter(code=>(code&0x7c00)!==0x7c00);
const finiteFP8Codes=()=>Uint8Array.from({length:256},(_,index)=>index).filter(code=>(code&127)!==127);
function rawHalf(bits){const raw=new Uint8Array(bits.length*2),view=new DataView(raw.buffer);for(let index=0;index<bits.length;index++)view.setUint16(index*2,bits[index],true);return raw;}
function exactBits(actual,expected,label){
 assert.equal(Object.getPrototypeOf(actual),Float32Array.prototype,label+' returns native F32');
 assert.equal(actual.length,expected.length,label+' count');assert.ok(actual.buffer instanceof ArrayBuffer,label+' nonshared output');assert.equal(actual.byteOffset,0,label+' compact output');assert.equal(actual.byteLength,actual.buffer.byteLength,label+' exact buffer');
 const got=new Uint32Array(actual.buffer),want=new Uint32Array(expected.buffer,expected.byteOffset,expected.length);
 for(let index=0;index<got.length;index++)assert.equal(got[index],want[index],`${label} element ${index}`);
}
async function setup(scales=new Map([['q',Math.fround(.0004149845917709172)],['k',Math.fround(.0004648481262847781)],['unit',1],['half',.5]])){
 const oracle=await createProjectionBridge(await bridgeBytes());let decoder;
 try{decoder=await createModelLookupDecoder({oracle,lookupBytes:await lookupBytes(),scales});return {oracle,decoder,scales};}catch(error){oracle.dispose();throw error;}
}

test('lookup metadata names a new implementation of the same legacy Hike numeric profile',async()=>{
 const {oracle,decoder}=await setup();
 try{
  const description=decoder.describe();assert.equal(description.implementationProfileId,'hike-lookup-table-decoder-v1');assert.equal(description.numericProfileId,'legacy-hike-f16-e4m3fn-f32-v1');
  assert.equal(decoder.stats().disposed,false);assert.equal(decoder.stats().workspaceReused,true);assert.ok(decoder.stats().memoryBytes>0);
 }finally{decoder.dispose();oracle.dispose();}
});

test('all 63488 finite half codes are bit-exact to the original Hike oracle',async()=>{
 const {oracle,decoder}=await setup();
 try{const codes=finiteHalfCodes();assert.equal(codes.length,63488);exactBits(decoder.decodeF16(rawHalf(codes)),oracle.decodeF16(codes),'all finite F16 codes');}
 finally{decoder.dispose();oracle.dispose();}
});

test('all 254 legal FP8 codes at every registered scalar are bit-exact to original Hike dequant',async()=>{
 const {oracle,decoder,scales}=await setup();
 try{const codes=finiteFP8Codes();assert.equal(codes.length,254);for(const [key,scale]of scales)exactBits(decoder.dequant(codes,key),oracle.dequant(codes,scale),'all E4M3FN codes '+key);}
 finally{decoder.dispose();oracle.dispose();}
});

test('all nonfinite half codes and both invalid FP8 codes reject and the next call recovers',async()=>{
 const {oracle,decoder}=await setup();
 try{
  let invalid=0;for(let code=0;code<65536;code++)if((code&0x7c00)===0x7c00){assert.throws(()=>decoder.decodeF16(rawHalf(new Uint16Array([0x3c00,code,0x4000]))));invalid++;}
  assert.equal(invalid,2048);exactBits(decoder.decodeF16(rawHalf(new Uint16Array([0x3c00,0xc000]))),oracle.decodeF16(new Uint16Array([0x3c00,0xc000])),'F16 recovery');
  for(const code of [0x7f,0xff])assert.throws(()=>decoder.dequant(new Uint8Array([0x38,code,0x40]),'q'));
  exactBits(decoder.dequant(new Uint8Array([0x38,0xc0]),'q'),oracle.dequant(new Uint8Array([0x38,0xc0]),Math.fround(.0004149845917709172)),'FP8 recovery');
 }finally{decoder.dispose();oracle.dispose();}
});

test('maximum 81920-element reads retain input and return owned buffers with fixed workspace',async()=>{
 const {oracle,decoder,scales}=await setup();
 try{
  const half=Uint16Array.from({length:81920},(_,index)=>index%2?0x3c00:0xc000),raw=rawHalf(half),rawBefore=raw.slice(),fp8=Uint8Array.from({length:81920},(_,index)=>index%2?0x38:0xc0),fp8Before=fp8.slice();
  const expectedHalf=oracle.decodeF16(half),expectedFP8=oracle.dequant(fp8,scales.get('q')),memoryBytes=decoder.stats().memoryBytes,firstHalf=decoder.decodeF16(raw),firstFP8=decoder.dequant(fp8,'q');
  for(let iteration=0;iteration<4;iteration++){
   const halfResult=decoder.decodeF16(raw),fp8Result=decoder.dequant(fp8,'q');exactBits(halfResult,expectedHalf,'full F16 '+iteration);exactBits(fp8Result,expectedFP8,'full FP8 '+iteration);halfResult.fill(99);fp8Result.fill(99);assert.equal(decoder.stats().memoryBytes,memoryBytes);
  }
  assert.deepEqual(raw,rawBefore);assert.deepEqual(fp8,fp8Before);exactBits(firstHalf,expectedHalf,'retained earlier F16');exactBits(firstFP8,expectedFP8,'retained earlier FP8');
  raw.fill(0);fp8.fill(0);exactBits(firstHalf,expectedHalf,'F16 independent of caller mutation');exactBits(firstFP8,expectedFP8,'FP8 independent of caller mutation');
 }finally{decoder.dispose();oracle.dispose();}
});

test('input types, range caps, shared storage and unknown target keys reject before decoding',async()=>{
 const {oracle,decoder}=await setup();
 try{
  for(const value of [new Uint8Array(),new Uint8Array(1),new Uint8Array(163842),new Uint16Array([0x3c00]),[0,60],new Uint8Array(new SharedArrayBuffer(2)),new Uint8Array(4).subarray(2)])assert.throws(()=>decoder.decodeF16(value));
  for(const value of [new Uint8Array(),new Uint8Array(81921),new Uint16Array([0x38]),[0x38],new Uint8Array(new SharedArrayBuffer(1)),new Uint8Array(2).subarray(1)])assert.throws(()=>decoder.dequant(value,'q'));
  assert.throws(()=>decoder.dequant(new Uint8Array([0x38]),'unknown'));
  const shared=new Uint8Array(new SharedArrayBuffer(2));Object.defineProperty(shared,'buffer',{value:new ArrayBuffer(2)});assert.throws(()=>decoder.decodeF16(shared));
  class Forged extends Uint8Array{get length(){return 2;}get byteLength(){return 2;}get byteOffset(){return 0;}get buffer(){return new ArrayBuffer(2);}}
  assert.throws(()=>decoder.decodeF16(new Forged(1)));
  exactBits(decoder.decodeF16(rawHalf(new Uint16Array([0x3c00]))),oracle.decodeF16(new Uint16Array([0x3c00])),'range/type rejection recovery');
 }finally{decoder.dispose();oracle.dispose();}
});

test('table construction consumes the legacy oracle once per code table and snapshots input scales',async()=>{
 const oracle=await createProjectionBridge(await bridgeBytes()),scales=new Map([['q',.5],['k',1]]);let decoder,halfCalls=0,dequantCalls=0;
 const wrapped={stats(){return oracle.stats();},decodeF16(bits){halfCalls++;assert.equal(bits.length,63488);return oracle.decodeF16(bits);},dequant(codes,scale){dequantCalls++;assert.equal(codes.length,254);return oracle.dequant(codes,scale);}};
 try{
  decoder=await createModelLookupDecoder({oracle:wrapped,lookupBytes:await lookupBytes(),scales});assert.equal(halfCalls,1);assert.equal(dequantCalls,2);
  scales.set('q',9);scales.set('other',.5);decoder.decodeF16(rawHalf(new Uint16Array([0x3c00])));exactBits(decoder.dequant(new Uint8Array([0x38]),'q'),oracle.dequant(new Uint8Array([0x38]),.5),'captured scale');assert.throws(()=>decoder.dequant(new Uint8Array([0x38]),'other'));assert.equal(halfCalls,1);assert.equal(dequantCalls,2);
 }finally{decoder?.dispose();oracle.dispose();}
});

test('construction rejects mutated WASM and invalid scales without disposing the caller oracle',async()=>{
 const oracle=await createProjectionBridge(await bridgeBytes());
 try{
  const corrupted=await lookupBytes();corrupted[0]^=1;await assert.rejects(createModelLookupDecoder({oracle,lookupBytes:corrupted,scales:new Map([['q',1]])}),/hash|SHA/i);
  for(const scale of [0,-1,NaN,Infinity,-Infinity,Number.MIN_VALUE,1e100,1.1])await assert.rejects(createModelLookupDecoder({oracle,lookupBytes:await lookupBytes(),scales:new Map([['q',scale]])}));
  await assert.rejects(createModelLookupDecoder({oracle:{},lookupBytes:await lookupBytes(),scales:new Map([['q',1]])}));
  assert.equal(oracle.stats().disposed,false);assert.equal(oracle.decodeF16(new Uint16Array([0x3c00]))[0],1);
 }finally{oracle.dispose();}
});

test('raw Hike lookup ABI validates the complete code range before writing any output',async()=>{
 const module=await WebAssembly.compile(await lookupBytes());assert.deepEqual(WebAssembly.Module.imports(module),[]);const instance=await WebAssembly.instantiate(module,{}),ex=instance.exports,start=ex.memory.buffer.byteLength;
 ex.memory.grow(5);const codes=start,table=start+16,out=table+65536*4,bytes=new Uint8Array(ex.memory.buffer),view=new DataView(ex.memory.buffer),sentinel=new Uint32Array(ex.memory.buffer,out,3);
 assert.equal(typeof ex.Lookup8,'function');assert.equal(typeof ex.Lookup16,'function');
 const unchanged=()=>assert.deepEqual([...sentinel],[0xdeadbeef,0xdeadbeef,0xdeadbeef]);
 for(const [name,invalid]of [['Lookup8',0x7f],['Lookup8',0xff],['Lookup16',0x7c00],['Lookup16',0xfc00],['Lookup16',0x7fff],['Lookup16',0xffff]]){
  sentinel.fill(0xdeadbeef);if(name==='Lookup8')bytes.set([0x38,invalid,0x40],codes);else{view.setUint16(codes,0x3c00,true);view.setUint16(codes+2,invalid,true);view.setUint16(codes+4,0x4000,true);}
  assert.notEqual(ex[name](codes,3,table,out,81920),0);unchanged();
 }
 for(const name of ['Lookup8','Lookup16'])for(const [count,capacity]of [[0,81920],[81921,81920],[3,2],[1,81921]]){sentinel.fill(0xdeadbeef);assert.notEqual(ex[name](codes,count,table,out,capacity),0);unchanged();}
 // Table slots contain oracle-produced values in production. At this ABI
 // boundary bit patterns, including signed zero, must copy without arithmetic.
 view.setUint32(table+0x3c00*4,0x80000000,true);view.setUint16(codes,0x3c00,true);assert.equal(ex.Lookup16(codes,1,table,out,81920),0);assert.equal(sentinel[0],0x80000000);
 view.setUint32(table+0x38*4,0x80000000,true);bytes[codes]=0x38;assert.equal(ex.Lookup8(codes,1,table,out,81920),0);assert.equal(sentinel[0],0x80000000);
});

test('dispose releases lookup memory and retains caller ownership of the legacy oracle',async()=>{
 const {oracle,decoder}=await setup();decoder.dispose();decoder.dispose();assert.equal(decoder.stats().disposed,true);assert.equal(decoder.stats().memoryBytes,0);assert.throws(()=>decoder.describe(),/disposed/i);assert.throws(()=>decoder.decodeF16(new Uint8Array([0,60])),/disposed/i);assert.throws(()=>decoder.dequant(new Uint8Array([0x38]),'q'),/disposed/i);assert.equal(oracle.stats().disposed,false);assert.equal(oracle.decodeF16(new Uint16Array([0x3c00]))[0],1);oracle.dispose();
});

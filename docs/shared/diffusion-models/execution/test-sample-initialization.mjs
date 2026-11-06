import test from 'node:test';
import assert from 'node:assert/strict';

let initialization;
try{initialization=await import('./sample-initialization.mjs');}catch{}
const generator=()=>{assert.equal(typeof initialization?.createSampleNoise,'function','Owner sample noise initializer is missing');return initialization.createSampleNoise;};

test('owner normal initializer returns compact finite F32 and bounds each WebCrypto request',async t=>{
 const createSampleNoise=generator(),native=crypto.getRandomValues.bind(crypto),sizes=[],scratch=[];
 t.mock.method(crypto,'getRandomValues',words=>{sizes.push(words.byteLength);scratch.push(words);return native(words);});
 const result=await createSampleNoise(32785);
 assert.equal(result.constructor,Float32Array);assert.equal(result.length,32785);assert.equal(result.byteOffset,0);assert.equal(result.byteLength,result.buffer.byteLength);
 assert.ok(result.every(Number.isFinite));assert.ok(result.some(value=>value!==0));assert.deepEqual(sizes,[65536,65536,72]);assert.ok(scratch.every(words=>words.every(value=>value===0)));
 assert.match(initialization.SAMPLE_INITIALIZATION_PROFILE,/host/);
});

test('owner initializer rejects invalid counts and seed options before consuming entropy',async t=>{
 const createSampleNoise=generator();let calls=0;t.mock.method(crypto,'getRandomValues',()=>{calls++;throw Error('unexpected entropy access');});
 for(const count of [0,-1,1.5,NaN,4194305])await assert.rejects(createSampleNoise(count),/capacity|elements/);
 await assert.rejects(createSampleNoise(16,{seed:1}),/Unknown/);await assert.rejects(createSampleNoise(16,{signal:{aborted:false}}),TypeError);assert.equal(calls,0);
});

test('pre-aborted and between-chunk cancellation stop owner entropy generation',async t=>{
 const createSampleNoise=generator(),native=crypto.getRandomValues.bind(crypto),scratch=[];let calls=0;
 t.mock.method(crypto,'getRandomValues',words=>{calls++;scratch.push(words);return native(words);});
 const first=new AbortController();first.abort();await assert.rejects(createSampleNoise(16,{signal:first.signal}),{name:'AbortError'});assert.equal(calls,0);
 const controller=new AbortController();setTimeout(()=>controller.abort(),0);
 await assert.rejects(createSampleNoise(32768,{signal:controller.signal}),{name:'AbortError'});assert.equal(calls,1);assert.ok(scratch.every(words=>words.every(value=>value===0)));
});

test('owner entropy storage is cleared when WebCrypto fails or aborts during a call',async t=>{
 const createSampleNoise=generator(),controller=new AbortController();let scratch;
 const stub=t.mock.method(crypto,'getRandomValues',words=>{scratch=words;words.fill(123);throw Error('entropy failed');});
 await assert.rejects(createSampleNoise(16),/entropy failed/);assert.ok(scratch.every(value=>value===0));
 stub.mock.mockImplementation(words=>{scratch=words;words.fill(123);controller.abort();return words;});
 await assert.rejects(createSampleNoise(16,{signal:controller.signal}),{name:'AbortError'});assert.ok(scratch.every(value=>value===0));
});

test('fixed-word transform preserves caller entropy and rejects ambiguous storage',()=>{
 generator();const transform=initialization.standardNormalFromWords;assert.equal(typeof transform,'function');
 const words=new Uint32Array([0,0xffffffff,0x80000000,0x80000000]),before=words.slice(),normal=transform(words);
 assert.deepEqual(words,before);assert.equal(normal.length,words.length);assert.ok(normal.every(Number.isFinite));
 assert.throws(()=>transform(new Uint32Array(3)),/pair/);assert.throws(()=>transform(new Uint32Array(4).subarray(0,2)),/compact/);
 assert.throws(()=>transform(Object.setPrototypeOf(new Uint8Array(8),Uint32Array.prototype)),/Uint32/);
 if(typeof SharedArrayBuffer==='function')assert.throws(()=>transform(new Uint32Array(new SharedArrayBuffer(8))),/nonshared/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createOrderedAttentionKVPool} from './prepared-attention-kv.mjs';

// Exercise the actual private row loop without allocating model weight matrices.
// These deterministic operators test ownership/order only; native numerical
// evidence is separate. No test hook is added to the candidate's public API.
const source=await readFile(new URL('./model-candidate.mjs',import.meta.url),'utf8');
const body=source.slice(source.indexOf('  async function selfAttention('),source.indexOf('  async function crossAttention('));
const W=5120,H=40,D=128,R=128;
function harness({prepared=true,legacyOutput=false,onProgress=()=>{}}={}){
 const input=Float32Array.from({length:475*W},(_,i)=>((i*17)%257-128)/1024),initial=new Float32Array(input),handles=new Map(),weights=new Set(),calls=[],stores=[];let next=0,kvDone=false;
 const compute={rmsNorm:({input})=>new Float32Array(input),rope:({input})=>new Float32Array(input),gateResidual:({base,value,gate})=>Float32Array.from(base,(v,i)=>Math.fround(v+Math.fround(value[i]*gate[i%W])))};
 const modulated=(x)=>Float32Array.from(x,v=>Math.fround(v+0.125));
 const matrix=async key=>{weights.add(key);return key;},release=key=>weights.delete(key),vector=async()=>new Float32Array(W);
 const linear=async(x,key,rows,_columns,_inner,_bias,s)=>{s.throwIfAborted();calls.push([key,rows]);return Float32Array.from(x,v=>Math.fround(v*(key.includes('.v.')?0.5:0.75)));};
 const makeKVPool=(totalKeys,s)=>{const pool=createOrderedAttentionKVPool({totalKeys,signal:s,prepare:p=>{const h={id:next++,keyStart:p.keyStart,keys:p.keys,byteLength:p.k.byteLength+p.v.byteLength};handles.set(h,{k:new Float32Array(p.k),v:new Float32Array(p.v)});return h;},release:h=>handles.delete(h)});return {...pool,finish(){const result=pool.finish();kvDone=true;return result;}};};
 const attend=async(q,rows,keys,values,total,s,detail,pool)=>{s.throwIfAborted();assert.equal(kvDone,prepared);assert.equal(total,475);assert.equal(rows,Math.min(128,total-detail.queryRowStart));
  // Every query must still see the original all-key V pool, including keys
  // whose input rows have already been overwritten by earlier residuals.
  if(pool){for(let start=0;start<total;start+=256){const h=pool.tileAt(start),p=handles.get(h);for(const row of [0,h.keys-1]){const original=initial[(start+row)*W];assert.equal(p.v[row*D],Math.fround(Math.fround(original+0.125)*0.5));}}}
  else assert.equal(values[0],Math.fround(Math.fround(initial[0]+0.125)*0.5));
  return Float32Array.from(q,v=>Math.fround(v*0.25));};
 const params={W,H,D,R,EPS:1e-6,preparedAttentionKVEnabled:prepared,makeKVPool,hiddenStores:(count,total)=>stores.push([count,total]),matrix,vector,release,modulated,linear,compute,currentChunks:null,timed:(_kind,_detail,fn)=>fn(),attend,releaseKVPool:pool=>pool?.dispose()};
 let fnBody=body;if(legacyOutput)fnBody=fnBody.replace('output=kvPool?input:new Float32Array(total*W)','output=new Float32Array(total*W)').replace('hiddenStores(kvPool?3:4,total)','hiddenStores(4,total)');
 const fn=new Function(...Object.keys(params),fnBody+';return selfAttention;')(...Object.values(params));
 const positions=[],sequence={readPositions(start,rows){positions.push([start,rows]);return {positions:new Int32Array(rows*3),sourceIds:new Int32Array(rows)};}},modulation=Array.from({length:6},()=>new Float32Array(W).fill(0.5));
 return {input,initial,handles,weights,calls,stores,positions,async run(signal=new AbortController().signal){return fn(input,sequence,475,0,modulation,signal,(...event)=>{signal.throwIfAborted();onProgress(...event);signal.throwIfAborted();});}};
}
test('prepared self residual reuses the owned input only after all K/V rows, with exact128/91 tails',async()=>{
 const h=harness(),out=await h.run();assert.equal(out===h.input,true,'prepared path must reuse the owned hidden store');assert.notDeepEqual(out,h.initial);assert.deepEqual(h.stores,[[3,475]]);assert.equal(h.handles.size,0);assert.equal(h.weights.size,0);
 assert.deepEqual(h.positions,[[0,128],[128,128],[256,128],[384,91],[0,128],[128,128],[256,128],[384,91]]);
});
test('in-place and separate-output row loops are bit-identical and retain the explicit injected-ops fallback',async()=>{
 const actual=harness(),old=harness({legacyOutput:true}),legacy=harness({prepared:false});const a=await actual.run(),b=await old.run(),c=await legacy.run();
 assert.deepEqual(new Uint32Array(a.buffer),new Uint32Array(b.buffer));assert.deepEqual(a,c);assert.deepEqual(actual.calls,old.calls);assert.deepEqual(old.input,old.initial);assert.deepEqual(legacy.input,legacy.initial);assert.notEqual(c,legacy.input);assert.deepEqual(legacy.stores,[[4,475]]);
});
for(const cancelPhase of ['self-v','self-attention'])test('cancellation during '+cancelPhase+' releases prepared pools and weights and leaves future input rows intact',async()=>{
 const control=new AbortController(),h=harness({onProgress(stage,_block,completed){if(stage===cancelPhase&&completed===(stage==='self-v'?384:128))control.abort(new DOMException('bounded row cancellation','AbortError'));}});
 await assert.rejects(h.run(control.signal),{name:'AbortError'});assert.equal(h.handles.size,0);assert.equal(h.weights.size,0);assert.deepEqual(h.input.subarray(128*W),h.initial.subarray(128*W));if(cancelPhase==='self-v')assert.deepEqual(h.input,h.initial);
});

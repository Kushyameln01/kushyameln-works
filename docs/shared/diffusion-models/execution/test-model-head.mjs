import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModelMath} from './model-math.mjs';
import {MODEL_WEIGHT_SCHEMA,MODEL_WEIGHT_PROFILE} from './model-weights.mjs';

const W=5120,C=64,F=Math.fround;
const api=await import('./model-head.mjs').catch(()=>({}));
const values=(n,phase=0)=>Float32Array.from({length:n},(_,i)=>Math.sin((i+phase)*.017)*.7+Math.cos((i+phase)*.003)*.2);
function fixture(){
 const weight=Float32Array.from({length:C*W},(_,i)=>(i%31-15)/4096),modulation=values(2*W,71),bias=values(C,93),reads=[];
 const entries={
  'head.head.weight':{fullShape:[C,W],columns:W,storageDtype:'F16',computeDtype:'F32',maxRows:16},
  'head.modulation':{fullShape:[1,2,W],storageDtype:'F16',computeDtype:'F32'},
  'head.head.bias':{fullShape:[C],storageDtype:'F16',computeDtype:'F32'}
 };
 let hold;
 const source={describe(){return {schemaVersion:MODEL_WEIGHT_SCHEMA,executionProfileId:MODEL_WEIGHT_PROFILE,entries:structuredClone(entries)};},
  async readRows(key,start,count,options){reads.push({key,start,count,options});if(hold){const h=hold;hold=null;await h.promise;}return {values:weight.slice(start*W,(start+count)*W)};},
  async readVector(key,start,count,options){reads.push({key,start,count,options});return {values:(key==='head.modulation'?modulation:bias).slice(start,start+count)};}
 };
 return {source,weight,modulation,bias,reads,entries,hold(){let release;const promise=new Promise(r=>{release=r;});hold={promise};return release;}};
}
const mathOwner=async()=>createModelMath({wasmBytes:new Uint8Array(await readFile(new URL('./model-math/kernel.wasm',import.meta.url)))});
// Small in-memory operator adapter isolates head orchestration in Node. The
// browser runner separately uses the real ORT operator and original files.
const scalarOps=()=>({calls:[],async linear({x,weight,rows,columns,inner,signal}){
 this.calls.push({rows,columns,inner});signal?.throwIfAborted();const output=new Float32Array(rows*columns);
 for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){let sum=F(0);for(let d=0;d<inner;d++)sum=F(sum+F(x[r*inner+d]*weight[c*inner+d]));output[r*columns+c]=sum;}
 return {output,evidence:{computeDtype:'F32',rows,columns,inner,fullInner:true}};
}});
function reference(hidden,timeEmbedding,rows,f){
 const result=new Float64Array(rows*C);
 for(let row=0;row<rows;row++){
  let mean=0;for(let d=0;d<W;d++)mean+=hidden[row*W+d];mean/=W;
  let variance=0;for(let d=0;d<W;d++)variance+=(hidden[row*W+d]-mean)**2;variance/=W;
  const inv=1/Math.sqrt(variance+1e-6),modulated=new Float64Array(W);
  for(let d=0;d<W;d++)modulated[d]=f.modulation[d]+timeEmbedding[d]+(hidden[row*W+d]-mean)*inv*(1+f.modulation[W+d]+timeEmbedding[d]);
  for(let c=0;c<C;c++){let sum=f.bias[c];for(let d=0;d<W;d++)sum+=modulated[d]*f.weight[c*W+d];result[row*C+c]=sum;}
 }return result;
}
function compare(actual,expected){
 assert.equal(actual.length,expected.length);let maxAbsolute=0;
 for(let i=0;i<actual.length;i++){const error=Math.abs(actual[i]-expected[i]);maxAbsolute=Math.max(maxAbsolute,error);assert.ok(Number.isFinite(error)&&error<=.001+.0001*Math.abs(expected[i]),'head F64 comparison at '+i+' error '+error);}
 return maxAbsolute;
}

test('final head covers real128x5120 input and all64 outputs using raw time embedding',async t=>{
 assert.equal(typeof api.createModelHead,'function','Missing model final head owner');
 const f=fixture(),math=await mathOwner(),ops=scalarOps(),head=api.createModelHead({source:f.source,math,ops});
 try{
  const rows=128,hidden=values(rows*W),timeEmbedding=values(W,113),original=hidden.slice();hidden[hidden.length-1]+=2;original.set(hidden);
  const expected=reference(hidden,timeEmbedding,rows,f),pending=head.run({hidden,timeEmbedding,rows});hidden.fill(99);timeEmbedding.fill(99);
  const result=await pending,maxAbsolute=compare(result,expected);assert.equal(result.byteOffset,0);assert.equal(result.byteLength,result.buffer.byteLength);
  assert.deepEqual(ops.calls,[{rows:128,columns:64,inner:5120}]);
  assert.deepEqual(f.reads.filter(x=>x.key==='head.head.weight').map(x=>[x.start,x.count]),[[0,16],[16,16],[32,16],[48,16]]);
  assert.ok(f.reads.every(x=>x.options.diagnostics===false));assert.equal(head.stats().cacheBytes,1351936);assert.equal(head.stats().rowsProcessed,128);
  const before=f.reads.length;await head.run({hidden:original.slice(0,W),timeEmbedding:values(W,113),rows:1});assert.equal(f.reads.length,before);
  assert.deepEqual(ops.calls[1],{rows:1,columns:64,inner:5120});
  t.diagnostic(JSON.stringify({rows,comparedElements:result.length,reference:'independent F64',gate:{absolute:.001,relative:.0001},maxAbsolute,cacheBytes:head.stats().cacheBytes}));
 }finally{head.dispose();math.dispose();}
 assert.equal(head.stats().cacheBytes,0);await assert.rejects(head.run({}),/disposed/);
});

test('head rejects invalid shape, noncompact/shared/nonfinite values and unknown timeAct1 input',async()=>{
 assert.equal(typeof api.createModelHead,'function','Missing model final head owner');
 const f=fixture(),math=await mathOwner(),head=api.createModelHead({source:f.source,math,ops:scalarOps()});
 try{
  const input={hidden:new Float32Array(W),timeEmbedding:new Float32Array(W),rows:1};
  for(const rows of [0,129,1.5])await assert.rejects(head.run({...input,rows}),/rows|shape/);
  for(const hidden of [new Float32Array(W-1),new Float32Array(W+1).subarray(1),new Float64Array(W)])await assert.rejects(head.run({...input,hidden}),/compact|F32|shape/);
  if(typeof SharedArrayBuffer==='function')await assert.rejects(head.run({...input,hidden:new Float32Array(new SharedArrayBuffer(W*4))}),/nonshared|F32/);
  const bad=new Float32Array(W);bad[W-1]=NaN;bad.every=()=>true;await assert.rejects(head.run({...input,timeEmbedding:bad}),/finite|F32/);
  await assert.rejects(head.run({...input,timeAct1:input.timeEmbedding}),/Unknown/);assert.equal(f.reads.length,0);
  const result=await head.run(input);assert.equal(result.length,64);assert.equal(head.stats().busy,false);
  const description=f.source.describe(),key='head.head.weight';
  for(const shape of [[63,W],Array(2),Object.assign([63,W],{every:()=>true})]){
   const source={...f.source,describe:()=>({...description,entries:{...description.entries,[key]:{...description.entries[key],fullShape:shape}}})};
   assert.throws(()=>api.createModelHead({source,math,ops:scalarOps()}),/shape\/dtype binding/);
  }
 }finally{head.dispose();math.dispose();}
});

test('head cancellation releases busy ownership and retries an incomplete cache',async()=>{
 assert.equal(typeof api.createModelHead,'function','Missing model final head owner');
 const f=fixture(),math=await mathOwner(),head=api.createModelHead({source:f.source,math,ops:scalarOps()}),controller=new AbortController(),release=f.hold();
 const input={hidden:new Float32Array(W),timeEmbedding:new Float32Array(W),rows:1};
 try{
  const pending=head.run({...input,signal:controller.signal});await Promise.resolve();
  await assert.rejects(head.run(input),/busy/);assert.throws(()=>head.dispose(),/busy|await/i);controller.abort();release();await assert.rejects(pending,{name:'AbortError'});
  assert.equal(head.stats().busy,false);assert.equal(head.stats().cacheBytes,0);assert.equal((await head.run(input)).length,C);
  assert.equal(head.stats().rowsProcessed,1);
 }finally{head.dispose();math.dispose();}
});

test('head invalidates retained weights on source epoch change and rejects a mid-load switch',async()=>{
 const f=fixture();let epoch=0;f.source.weightEpoch=()=>epoch;
 const math=await mathOwner(),head=api.createModelHead({source:f.source,math,ops:scalarOps()}),input={hidden:new Float32Array(W),timeEmbedding:new Float32Array(W),rows:1};
 try{
  const first=await head.run(input),reads=f.reads.length;f.bias[0]+=7;epoch++;
  const next=await head.run(input);assert.equal(next[0],F(first[0]+7));assert.equal(f.reads.length,reads+6);assert.equal(head.stats().cacheWeightEpoch,1);
  epoch++;const release=f.hold(),pending=head.run(input);await Promise.resolve();epoch++;release();await assert.rejects(pending,/epoch|weight.*chang/i);assert.equal(head.stats().cacheBytes,0);
  await head.run(input);assert.equal(head.stats().cacheWeightEpoch,3);
 }finally{head.dispose();math.dispose();}
});

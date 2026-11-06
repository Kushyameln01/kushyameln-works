import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModelMath,MODEL_MATH_LIMITS} from './model-math.mjs';

const bytes=async()=>new Uint8Array(await readFile(new URL('./model-math/kernel.wasm',import.meta.url)));
const create=async()=>createModelMath({wasmBytes:await bytes()});
const F=Math.fround,W=5120;
// Gates are frozen before running the extension: the N2 independent-reference
// normalization gate and P4 RoPE gate. The exact old F32 gates are also retained
// below by direct old/new comparison; no tolerance is enlarged for rows128.
const NORM_GATE=Object.freeze({absolute:.001,relative:.0001});
const ROPE_GATE=Object.freeze({absolute:2e-5,relative:2e-5});
function compare(got,expected,gate,label){
 assert.equal(got.length,expected.length,label+' shape');
 let maxAbsolute=0,failed=0,first=-1;
 for(let i=0;i<got.length;i++){
  const d=Math.abs(got[i]-expected[i]);maxAbsolute=Math.max(maxAbsolute,d);
  if(!Number.isFinite(d)||d>gate.absolute+gate.relative*Math.abs(expected[i])){failed++;if(first<0)first=i;}
 }
 assert.equal(failed,0,label+' all-value gate failed: first='+first+' maxAbsolute='+maxAbsolute);
 return maxAbsolute;
}
const values=(n,offset=0)=>Float32Array.from({length:n},(_,i)=>Math.sin((i+offset)*.019)*1.5+Math.cos((i+offset)*.0031)*.4+(Math.floor(i/W)%11)*.03);
function normF64(x,rows,weight,bias,rms=false){
 const result=new Float64Array(x.length);
 for(let row=0;row<rows;row++){
  let mean=0;if(!rms){for(let c=0;c<W;c++)mean+=x[row*W+c];mean/=W;}
  let variance=0;for(let c=0;c<W;c++){const d=x[row*W+c]-mean;variance+=d*d;}variance/=W;
  const inv=1/Math.sqrt(variance+1e-6);
  for(let c=0;c<W;c++){let v=(x[row*W+c]-mean)*inv;if(weight)v*=weight[c];if(bias)v+=bias[c];result[row*W+c]=v;}
 }
 return result;
}
function coordinates(rows){
 const positions=new Float32Array(rows*3),sourceIds=new Int32Array(rows);
 const edges=[[0,0,0],[20,29,51],[0,29,51],[20,0,51],[20,29,0],[1,0,0],[0,1,0],[0,0,1]];
 for(let row=0;row<rows;row++){
  positions.set(row<edges.length?edges[row]:[row%21,(row*7)%30,(row*13)%52],row*3);
  sourceIds[row]=row===rows-1?16777216:row%10;
 }
 return {positions,sourceIds};
}
// Independent mathematical F64 oracle: direct pair rotations, full all40heads.
// It does not use Hike outputs or reproduce the kernel's intermediate F32s.
function ropeF64(x,rows,positions,sourceIds){
 const result=new Float64Array(x.length);
 for(let row=0;row<rows;row++)for(let head=0;head<40;head++)for(let pair=0;pair<64;pair++){
  const axis=pair<22?0:pair<43?1:2,local=pair-(axis===0?0:axis===1?22:43),dim=axis===0?44:42;
  const spatial=positions[row*3+axis]*Math.pow(10000,-2*local/dim),source=sourceIds[row]*Math.pow(10000,-2*pair/128);
  const c=Math.cos(spatial),s=Math.sin(spatial),sc=Math.cos(source),ss=Math.sin(source);
  const index=row*W+head*128+pair*2,a=x[index],b=x[index+1];
  // The source rotation precedes spatial rotation in the matrix product.
  const u=sc*a-ss*b,v=ss*a+sc*b;
  result[index]=c*u-s*v;result[index+1]=s*u+c*v;
 }
 return result;
}
function geluF32(x){const square=F(x*x),cube=F(square*x),inner=F(x+F(F(.044715)*cube)),phase=F(F(.7978845608028654)*inner),activation=F(Math.tanh(phase));return F(F(F(.5)*x)*F(1+activation));}

test('real128x5120 LN, affine LN and RMS use independent full-feature F64 references for every value',async t=>{
 const owner=await create();
 try{
  const x=values(128*W),weight=values(W,713),bias=values(W,911),before=x.slice(),stats=owner.stats();
  x[5119]+=3;x[127*W+5119]-=2;before.set(x);
  const maxAbs={
   layerNorm:compare(owner.layerNorm({input:x,rows:128}),normF64(x,128),NORM_GATE,'128-row nonaffine LN'),
   affineNorm:compare(owner.affineNorm({input:x,rows:128,weight,bias}),normF64(x,128,weight,bias),NORM_GATE,'128-row affine LN'),
   rmsNorm:compare(owner.rmsNorm({input:x,rows:128,weight}),normF64(x,128,weight,undefined,true),NORM_GATE,'128-row RMS'),
  };
  t.diagnostic(JSON.stringify({reference:'independent F64',elementsEach:x.length,gate:NORM_GATE,maxAbsolute:maxAbs}));
  assert.deepEqual(x,before);
  const last=new Float32Array(W);last[W-1]=4;
  const full=owner.rmsNorm({input:last,rows:1,weight:new Float32Array(W).fill(1)});
  assert.ok(full[W-1]>70,'RMS denominator spans5120, not a128-channel head');
  assert.equal(full.length,W,'one-row tail is exact');
  assert.equal(owner.layerNorm({input:new Float32Array(W).fill(7),rows:1})[W-1],0);
  assert.equal(owner.stats().memoryBytes,stats.memoryBytes);assert.equal(owner.stats().memoryIdentity,stats.memoryIdentity);
  assert.equal(owner.stats().workspaceReused,true);assert.deepEqual(owner.stats().limits,MODEL_MATH_LIMITS);
 }finally{owner.dispose();}
});

test('128-row all40head RoPE matches independent F64 coordinates, grid ends and source IDs0..9',async t=>{
 const owner=await create();
 try{
  const rows=128,x=values(rows*W),{positions,sourceIds}=coordinates(rows),before=x.slice(),p=positions.slice(),s=sourceIds.slice();
  const got=owner.rope({input:x,rows,positions,sourceIds});
  const maxAbsolute=compare(got,ropeF64(x,rows,positions,sourceIds),ROPE_GATE,'128-row all40head RoPE');
  t.diagnostic(JSON.stringify({reference:'independent F64',elements:got.length,gate:ROPE_GATE,maxAbsolute,rows,heads:40,lastGridCoordinate:[20,29,51],sourceIds:'0..9 and16777216'}));
  assert.deepEqual(x,before);assert.deepEqual(positions,p);assert.deepEqual(sourceIds,s);
  const one=x.slice(0,W),oneP=new Float32Array([20,29,51]),oneS=new Int32Array([9]);
  compare(owner.rope({input:one,rows:1,positions:oneP,sourceIds:oneS}),ropeF64(one,1,oneP,oneS),ROPE_GATE,'one-row boundary tail');
  const identity=owner.rope({input:one,rows:1,positions:new Float32Array(3),sourceIds:new Int32Array(1)});
  assert.deepEqual(identity,one);assert.equal(got.length,rows*W);
  got.fill(999);assert.notEqual(owner.rope({input:one,rows:1,positions:oneP,sourceIds:oneS})[0],999);
 }finally{owner.dispose();}
});

test('existing validated P4/N2 math retains exact F32 outputs for legacy shapes',async()=>{
 const [{createPostSelfAttentionMath},{createQkvRope},{createBlockHiddenMath}]=await Promise.all([
  import('../ort-bridge/post-self-attention/math.mjs'),import('../ort-bridge/qkv/rope.mjs'),import('../ort-bridge/block-hidden/math.mjs')
 ]);
 const owner=await create(),old=await createPostSelfAttentionMath({wasmBytes:new Uint8Array(await readFile(new URL('../ort-bridge/post-self-attention/kernel.wasm',import.meta.url)))}),rope=await createQkvRope({wasmBytes:await readFile(new URL('../ort-bridge/qkv/kernel.wasm',import.meta.url))});
 let hidden;
 try{
  const x=values(2*W),weight=values(W,17),bias=values(W,31);
  assert.deepEqual(owner.layerNorm({input:x,rows:2}),old.layerNorm(x,2));
  assert.deepEqual(owner.affineNorm({input:x,rows:2,weight,bias}),old.affineNorm(x,weight,bias,2));
  assert.deepEqual(owner.rmsNorm({input:x,rows:2,weight}),old.rmsNorm(x,weight,2));
  const {positions,sourceIds}=coordinates(16),full=values(16*W),matrix=rope.matrix({positions,sourceIds}),got=owner.rope({input:full,rows:16,positions,sourceIds});
  for(let head=0;head<40;head++){
   const selected=new Float32Array(16*128);for(let row=0;row<16;row++)selected.set(full.subarray(row*W+head*128,row*W+(head+1)*128),row*128);
   const expected=rope.apply({values:selected,matrices:matrix});
   for(let row=0;row<16;row++)assert.deepEqual(got.slice(row*W+head*128,row*W+(head+1)*128),expected.slice(row*128,(row+1)*128));
  }
  // The time embedding retains the old F32 frequency and phase boundaries.
  hidden=await createBlockHiddenMath({wasmBytes:await readFile(new URL('../ort-bridge/block-hidden/kernel.wasm',import.meta.url))});
  for(const timestep of [0,.5,500,1000])assert.deepEqual(owner.sinusoidal({timestep}),hidden.sinusoidal(timestep));
 }finally{owner.dispose();old.dispose();rope.dispose();hidden?.dispose();}
});

test('modulation and residual gate have separate F32 operations, exact128 rows and no gate+1',async()=>{
 const owner=await create();
 try{
  for(const rows of [1,2,127,128]){
   const input=values(rows*W),shift=values(W,7),scale=values(W,11),base=values(rows*W,17),gate=values(W,19);
   const mod=owner.modulate({input,shift,scale,rows}),res=owner.gateResidual({base,value:input,gate,rows});
   for(let i=0;i<input.length;i++){
    assert.equal(mod[i],F(shift[i%W]+F(input[i]*F(1+scale[i%W]))));
    assert.equal(res[i],F(base[i]+F(input[i]*gate[i%W])));
   }
   gate.fill(0);assert.deepEqual(owner.gateResidual({base,value:input,gate,rows}),base);
  }
  const value=new Float32Array(W).fill(F(1.0000001192092896)),gate=value.slice(),base=new Float32Array(W).fill(-F(1.000000238418579));
  assert.equal(owner.gateResidual({base,value,gate,rows:1})[0],0,'multiply rounds before residual addition');
 }finally{owner.dispose();}
});

test('GELU, SiLU, bias and add stream actual widths13824 and final element without padding',async()=>{
 const owner=await create();
 try{
  const n=128*13824,input=values(n),bias=values(13824,13),before=owner.stats();
  const gelu=owner.gelu({input}),silu=owner.silu({input}),biased=owner.bias({input,bias,rows:128,width:13824}),sum=owner.add({a:input,b:input});
  for(let i=0;i<n;i++){
   assert.equal(gelu[i],geluF32(input[i]));
   const sigmoid=F(1/F(1+F(Math.exp(-input[i]))));
   assert.equal(silu[i],F(input[i]*sigmoid));
   assert.equal(biased[i],F(input[i]+bias[i%13824]));assert.equal(sum[i],F(input[i]+input[i]));
  }
  assert.equal(gelu.length,n);assert.equal(biased.length,n);assert.equal(owner.stats().memoryBytes,before.memoryBytes);
  for(const count of [1,81919,81920,81921])assert.equal(owner.gelu({input:new Float32Array(count)}).length,count);
  assert.equal(owner.bias({input:new Float32Array([2]),bias:new Float32Array([3]),rows:1,width:1})[0],5);
  for(const timestep of [0,.5,500,1000]){
   const got=owner.sinusoidal({timestep});assert.equal(got.length,256);
   for(let i=0;i<128;i++){const exponent=F(-F(i)/F(128)),frequency=F(Math.pow(10000,exponent)),phase=F(F(timestep)*frequency);assert.equal(got[i],F(Math.cos(phase)));assert.equal(got[i+128],F(Math.sin(phase)));}
  }
 }finally{owner.dispose();}
});

test('declared Hike SiLU profile matches an independent stable F64 reference over broad and extreme inputs',async t=>{
 const owner=await create();
 try{
  const samples=[-3.4028234663852886e38,-10000,-1000,-100,-90,-89,-88,-40,-20,-10,-1,-0,0,1,10,20,40,88,89,90,100,1000,10000,3.4028234663852886e38];
  for(let i=-4096;i<=4096;i++)samples.push(i/128);
  const input=Float32Array.from(samples),expected=Float64Array.from(input,x=>{if(x>=0)return x/(1+Math.exp(-x));const e=Math.exp(x);return x*e/(1+e);});
  const gate={absolute:2e-7,relative:2e-6},maxAbsolute=compare(owner.silu({input}),expected,gate,'independent stable SiLU');
  assert.match(owner.stats().siluProfile,/not ORT Sigmoid bit parity/);
  t.diagnostic(JSON.stringify({reference:'independent stable F64',operation:'SiLU',elements:input.length,gate,maxAbsolute,ortBitParity:false}));
 }finally{owner.dispose();}
});

test('Hike head-major attention division is bit-exact on all655360 values and exact query3 tail',async t=>{
 const owner=await create();
 try{
  const before=owner.stats();
  for(const queries of [128,3,1]){
   const count=40*queries*128,context=values(count,37),denominator=Float32Array.from({length:40*queries},(_,i)=>(i%31+1)/7),source=context.slice(),denomSource=denominator.slice();
   const got=owner.divideAttention({context,denominator,heads:40,queries,headDim:128});
   assert.equal(got.length,count);
   for(let i=0;i<count;i++)assert.equal(got[i],F(context[i]/denominator[Math.floor(i/128)]),'head-major element '+i);
   assert.deepEqual(context,source);assert.deepEqual(denominator,denomSource);
   got.fill(999);assert.notEqual(owner.divideAttention({context,denominator,queries})[0],999);
  }
  const context=new Float32Array(40*3*128),denominator=new Float32Array(40*3).fill(1);
  for(const value of [0,-1,NaN,Infinity]){const bad=denominator.slice();bad[1]=value;assert.throws(()=>owner.divideAttention({context,denominator:bad,queries:3}),/denominator|Finite/);}
  for(const override of [{heads:1},{queries:0},{queries:129},{headDim:64}])assert.throws(()=>owner.divideAttention({context,denominator,heads:40,queries:3,headDim:128,...override}),/shape/);
  assert.equal(owner.stats().memoryBytes,before.memoryBytes);assert.equal(owner.stats().memoryIdentity,before.memoryIdentity);
  assert.match(owner.stats().attentionDivisionLayout,/head-major/);
  t.diagnostic(JSON.stringify({operation:'divideAttention',reference:'independent JS fround division',queries:[128,3,1],elements:[655360,15360,5120],exactValues:675840,maxAbsolute:0}));
 }finally{owner.dispose();}
});

test('owner pins identity, snapshots bytes and arrays, rejects bad shape/shared/nonfinite and recovers BUSY',async()=>{
 const supplied=await bytes(),pending=createModelMath({wasmBytes:supplied});supplied.fill(0);const owner=await pending;
 try{
  const bad=await bytes();bad[bad.length-1]^=1;await assert.rejects(createModelMath({wasmBytes:bad}),/hash mismatch/);
  if(typeof SharedArrayBuffer==='function')await assert.rejects(createModelMath({wasmBytes:new Uint8Array(new SharedArrayBuffer(8))}),/Nonshared/);
  for(const rows of [0,129,1.5,undefined])assert.throws(()=>owner.layerNorm({input:new Float32Array(W),rows}),/shape/);
  for(const override of [{width:128},{epsilon:1e-5}])assert.throws(()=>owner.layerNorm({input:new Float32Array(W),rows:1,...override}),/shape/);
  for(const input of [new Float32Array(W-1),new Float32Array(W+1).subarray(1),new Float64Array(W)])assert.throws(()=>owner.layerNorm({input,rows:1}),/shape|compact/);
  if(typeof SharedArrayBuffer==='function')assert.throws(()=>owner.layerNorm({input:new Float32Array(new SharedArrayBuffer(W*4)),rows:1}),/nonshared/);
  const detached=new Float32Array(W);structuredClone(detached.buffer,{transfer:[detached.buffer]});assert.throws(()=>owner.layerNorm({input:detached,rows:1}),/shape|compact/);
  for(const v of [NaN,Infinity,-Infinity]){const input=new Float32Array(W);input[0]=v;assert.throws(()=>owner.layerNorm({input,rows:1}),/Finite/);}
  const excessive=new Float32Array(W);excessive[0]=1e17;assert.throws(()=>owner.layerNorm({input:excessive,rows:1}),/admission/);
  const input=new Float32Array(W),positions=new Float32Array(3),sourceIds=new Int32Array(1);
  assert.throws(()=>owner.rope({input,rows:1,positions}),/Int32Array/);
  for(const id of [-1,16777217])assert.throws(()=>owner.rope({input,rows:1,positions,sourceIds:new Int32Array([id])}),/Source IDs/);
  assert.throws(()=>owner.rope({input,rows:1,positions:new Float32Array(2),sourceIds}),/shape/);
  assert.throws(()=>owner.gelu({input:new Float32Array(128*13824+1)}),/shape/);
  assert.throws(()=>owner.bias({input,bias:input,rows:1,width:13825}),/shape/);
  assert.throws(()=>owner.sinusoidal({timestep:1001}),/Timestep/);
  assert.throws(()=>owner.layerNorm({input,rows:1,unexpected:true}),/Unknown/);
  let nestedReads=0;
  const wrapped={get input(){assert.throws(()=>owner.layerNorm({get input(){nestedReads++;return input;},rows:1}),/busy/);assert.throws(()=>owner.dispose(),/busy/);return input;},rows:1};
  owner.layerNorm(wrapped);assert.equal(nestedReads,0);assert.equal(owner.stats().busy,false);
  class Alias extends Float32Array {slice(){throw Error('virtual slice must not run');}every(){return true;}}
  const base=new Alias(W).fill(1),value=new Alias(W).fill(2),gate=new Alias(W).fill(3);
  assert.equal(owner.gateResidual({base,value,gate,rows:1})[0],7);
  class Lying extends Float32Array {get byteOffset(){return 0;}get byteLength(){return this.buffer.byteLength;}}
  assert.throws(()=>owner.layerNorm({input:new Lying(new ArrayBuffer(W*4+4),4,W),rows:1}),/shape|compact/);
  const first=new Float32Array(W).fill(1),second=new Float32Array(W).fill(2),original=first.slice();
  const answer=owner.add({a:first,get b(){first.fill(9);return second;}});
  assert.equal(answer[0],3,'first input snapshot precedes later getter mutation');assert.equal(original[0],1);
  assert.equal(owner.stats().busy,false);assert.ok(owner.stats().snapshotCopyBytes>0);assert.ok(owner.stats().inputCopyBytes>0);assert.ok(owner.stats().outputCopyBytes>0);
 }finally{owner.dispose();owner.dispose();}
 assert.throws(()=>owner.layerNorm({input:new Float32Array(W),rows:1}),/disposed/);
});

test('real Hike ABI accepts128 rows, exact1-row tail and rejects129/capacity/NaN/source IDs before output',async()=>{
 const module=await WebAssembly.compile(await bytes());
 assert.deepEqual(WebAssembly.Module.imports(module).map(x=>x.name).sort(),['cos','exp','pow','sin','sqrt','tanh']);
 const instance=await WebAssembly.instantiate(module,{env:{cos:Math.cos,exp:Math.exp,pow:Math.pow,sin:Math.sin,sqrt:Math.sqrt,tanh:Math.tanh}}),e=instance.exports,start=e.memory.buffer.byteLength;
 e.memory.grow(140);
 const count=128*W,a=start,b=a+count*4,o=b+count*4,w=o+count*4,p=w+13824*4,s=p+128*3*4,m=s+128*4;
 const output=new Float32Array(e.memory.buffer,o,count+1);output.fill(17);
 assert.equal(e.Norm(a,w,w,129,1,o,129*W),-1);assert.equal(e.Norm(a,w,w,128,1,o,count-1),-1);assert.ok(output.every(v=>v===17));
 assert.equal(e.Norm(a,w,w,128,1,o,count),0);assert.equal(output[count-1],0);assert.equal(output[count],17);
 output.fill(17);new Float32Array(e.memory.buffer,a,W)[W-1]=4;
 assert.equal(e.Norm(a,w,w,1,1,o,W),0);assert.notEqual(output[W-1],17);assert.equal(output[W],17,'one-row tail writes no fake query rows');
 output.fill(17);new Float32Array(e.memory.buffer,a,1)[0]=NaN;
 assert.equal(e.Norm(a,w,w,1,1,o,W),-2);assert.equal(output[0],17);new Float32Array(e.memory.buffer,a,1)[0]=0;
 assert.equal(e.RopeBuild(p,s,129,m,129*256),-1);assert.equal(e.RopeBuild(p,s,128,m,128*256-1),-1);
 new Int32Array(e.memory.buffer,s,128)[127]=9;assert.equal(e.RopeBuild(p,s,128,m,128*256),0);
 assert.equal(e.RopeApply(a,m,128,o,count),0);assert.equal(e.RopeApply(a,m,129,o,129*W),-1);
 new Int32Array(e.memory.buffer,s,128)[127]=-1;assert.equal(e.RopeBuild(p,s,128,m,128*256),-2);
 assert.equal(e.Gelu(a,81921,o,81921),-1);assert.equal(e.Bias(a,w,1,13825,0,o,1),-1);
 assert.equal(e.Modulate(a,w,w,129,o,129*W),-1);assert.equal(e.GateResidual(a,b,w,129,o,129*W),-1);
 const denominator=new Float32Array(e.memory.buffer,w,40*128);denominator.fill(2);
 assert.equal(e.DivideAttention(a,w,39,128,128,0,81920,o,81920),-1);
 assert.equal(e.DivideAttention(a,w,40,129,128,0,81920,o,81920),-1);
 assert.equal(e.DivideAttention(a,w,40,128,127,0,81920,o,81920),-1);
 assert.equal(e.DivideAttention(a,w,40,128,128,0,81921,o,81921),-1);
 assert.equal(e.DivideAttention(a,w,40,128,128,count-100,101,o,101),-1);
 assert.equal(e.DivideAttention(a,w,40,128,128,2147483647,1,o,1),-1);
 assert.equal(e.DivideAttention(a,w,40,128,128,-1,1,o,1),-1);
 assert.equal(e.DivideAttention(a,w,40,128,128,0,81920,o,81919),-1);
 output.fill(17);for(const value of [0,-1,NaN,Infinity]){denominator[0]=value;assert.equal(e.DivideAttention(a,w,40,128,128,0,81920,o,81920),-2);assert.equal(output[0],17);}
 denominator[0]=2;assert.equal(e.DivideAttention(a,w,40,128,128,0,81920,o,81920),0);
 output.fill(17);assert.equal(e.DivideAttention(a,w,40,3,128,0,15360,o,15360),0);assert.equal(output[15360],17,'query3 capacity has no padded query writes');
});

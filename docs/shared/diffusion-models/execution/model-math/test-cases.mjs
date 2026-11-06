import {createModelMath} from '../model-math.mjs';
const W=5120,F=Math.fround;
function compare(actual,expected,absolute,relative){
 if(actual.length!==expected.length)throw Error('Reference shape mismatch');
 let maxAbsolute=0,failed=0;
 for(let i=0;i<actual.length;i++){const d=Math.abs(actual[i]-expected[i]);maxAbsolute=Math.max(maxAbsolute,d);if(!Number.isFinite(d)||d>absolute+relative*Math.abs(expected[i]))failed++;}
 if(failed)throw Error('Independent reference gate failed: '+failed+' of '+actual.length);
 return {elements:actual.length,maxAbsolute,failed,gate:{absolute,relative}};
}
function normReference(x,rows,weight,bias,rms=false){
 const expected=new Float64Array(x.length);
 for(let row=0;row<rows;row++){
  let mean=0;if(!rms){for(let c=0;c<W;c++)mean+=x[row*W+c];mean/=W;}
  let variance=0;for(let c=0;c<W;c++){const d=x[row*W+c]-mean;variance+=d*d;}variance/=W;
  const inv=1/Math.sqrt(variance+1e-6);
  for(let c=0;c<W;c++){let value=(x[row*W+c]-mean)*inv;if(weight)value*=weight[c];if(bias)value+=bias[c];expected[row*W+c]=value;}
 }
 return expected;
}
function ropeReference(x,rows,positions,sourceIds){
 const expected=new Float64Array(x.length);
 for(let row=0;row<rows;row++)for(let head=0;head<40;head++)for(let pair=0;pair<64;pair++){
  const axis=pair<22?0:pair<43?1:2,local=pair-(axis===0?0:axis===1?22:43),dim=axis===0?44:42;
  const angle=positions[row*3+axis]*Math.pow(10000,-2*local/dim),source=sourceIds[row]*Math.pow(10000,-2*pair/128);
  const c=Math.cos(angle),s=Math.sin(angle),sc=Math.cos(source),ss=Math.sin(source),index=row*W+head*128+pair*2;
  const u=sc*x[index]-ss*x[index+1],v=ss*x[index]+sc*x[index+1];
  expected[index]=c*u-s*v;expected[index+1]=s*u+c*v;
 }
 return expected;
}
export async function runModelMathCases(){
 const owner=await createModelMath(),rows=128,count=rows*W;
 const x=Float32Array.from({length:count},(_,i)=>Math.sin(i*.019)*1.5+Math.cos(i*.0031)*.4+(Math.floor(i/W)%11)*.03);
 x[W-1]+=3;x[count-1]-=2;
 const weight=Float32Array.from({length:W},(_,i)=>Math.sin((i+713)*.019)*1.5+.4),bias=Float32Array.from({length:W},(_,i)=>Math.cos((i+911)*.0031)*.4);
 const cases=[],comparisons={},before=owner.stats();
 try{
  comparisons.layerNorm=compare(owner.layerNorm({input:x,rows}),normReference(x,rows),.001,.0001);cases.push({id:'full128x5120-layerNorm',status:'PASS'});
  comparisons.affineNorm=compare(owner.affineNorm({input:x,rows,weight,bias}),normReference(x,rows,weight,bias),.001,.0001);cases.push({id:'full128x5120-affineNorm',status:'PASS'});
  comparisons.rmsNorm=compare(owner.rmsNorm({input:x,rows,weight}),normReference(x,rows,weight,undefined,true),.001,.0001);cases.push({id:'full128x5120-rmsNorm',status:'PASS'});
  const positions=new Float32Array(rows*3),sourceIds=new Int32Array(rows),edges=[[0,0,0],[20,29,51],[0,29,51],[20,0,51],[20,29,0]];
  for(let row=0;row<rows;row++){positions.set(row<edges.length?edges[row]:[row%21,row*7%30,row*13%52],row*3);sourceIds[row]=row===rows-1?16777216:row%10;}
  comparisons.rope=compare(owner.rope({input:x,rows,positions,sourceIds}),ropeReference(x,rows,positions,sourceIds),2e-5,2e-5);cases.push({id:'full128x5120-all40head-RoPE',status:'PASS'});
  const one=x.slice(0,W),oneP=new Float32Array([20,29,51]),oneS=new Int32Array([9]);
  comparisons.ropeTail=compare(owner.rope({input:one,rows:1,positions:oneP,sourceIds:oneS}),ropeReference(one,1,oneP,oneS),2e-5,2e-5);
  comparisons.normTail=compare(owner.layerNorm({input:one,rows:1}),normReference(one,1),.001,.0001);cases.push({id:'exact1row-norm-and-RoPE-tails',status:'PASS'});
  const wide=new Float32Array(128*13824).fill(.25),wideBias=Float32Array.from({length:13824},(_,i)=>(i%31-15)/16);
  const got=owner.bias({input:wide,bias:wideBias,rows:128,width:13824});
  for(let i=0;i<got.length;i++)if(got[i]!==F(wide[i]+wideBias[i%13824]))throw Error('Wide bias chunk column mismatch: '+i);
  comparisons.wideBias={elements:got.length,failed:0,maxAbsolute:0};cases.push({id:'128x13824-bias-chunks',status:'PASS'});
  const samples=[-3.4028234663852886e38,-10000,-1000,-100,-90,-89,-88,-40,0,40,88,89,90,100,1000,10000,3.4028234663852886e38];
  for(let i=-4096;i<=4096;i++)samples.push(i/128);
  const siluInput=Float32Array.from(samples),siluExpected=Float64Array.from(siluInput,x=>{if(x>=0)return x/(1+Math.exp(-x));const e=Math.exp(x);return x*e/(1+e);});
  comparisons.silu=compare(owner.silu({input:siluInput}),siluExpected,2e-7,2e-6);cases.push({id:'independent-stable-F64-SiLU-broad-and-extreme',status:'PASS'});
  for(const queries of [128,3]){
   const count=40*queries*128,context=Float32Array.from({length:count},(_,i)=>Math.sin(i*.013)*1.7),denominator=Float32Array.from({length:40*queries},(_,i)=>(i%31+1)/7);
   const actual=owner.divideAttention({context,denominator,heads:40,queries,headDim:128}),expected=Float32Array.from(context,(value,i)=>F(value/denominator[Math.floor(i/128)]));
   comparisons['divideAttentionQ'+queries]=compare(actual,expected,0,0);cases.push({id:'head-major-attention-division-Q'+queries,status:'PASS'});
  }
  const after=owner.stats();if(after.memoryBytes!==before.memoryBytes||after.memoryIdentity!==before.memoryIdentity)throw Error('Workspace grew between calls');
  return {schemaVersion:'model-math-d1/1',passed:true,reference:'independent JS F64 all values; fixed gates',cases,comparisons,stats:after,siluOrtBitParity:false,scope:'D1 math primitives only; no model weights, NN callback, complete block or model forward'};
 }finally{owner.dispose();}
}

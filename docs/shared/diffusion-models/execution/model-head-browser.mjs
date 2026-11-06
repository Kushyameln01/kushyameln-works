import {createModelWeightSource} from './model-weights.mjs';
import {createModelMath} from './model-math.mjs';
import {createBatchedModelOps} from './batched-ops.mjs';
import {createModelHead} from './model-head.mjs';

const W=5120,C=64;
const GATE=Object.freeze({absolute:.001,relative:.0001});
const demand=(ok,message)=>{if(!ok)throw Error(message);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
function half(bits){
 const sign=bits&0x8000?-1:1,exponent=bits>>>10&31,mantissa=bits&1023;
 return exponent===31?mantissa?NaN:sign*Infinity:sign*(exponent===0?mantissa*2**-24:(1+mantissa/1024)*2**(exponent-15));
}
async function directF16(file,entry){
 demand(entry.storageDtype==='F16','Actual head must retain original F16 weights');
 const raw=new Uint8Array(await file.slice(entry.absoluteByteOffset,entry.absoluteByteOffset+entry.byteLength).arrayBuffer()),view=new DataView(raw.buffer),values=new Float64Array(raw.length/2);
 for(let i=0;i<values.length;i++){values[i]=half(view.getUint16(2*i,true));demand(Number.isFinite(values[i]),'Nonfinite original head weight');}
 return {values,readBytes:raw.length,rawSHA256:await sha(raw)};
}
function inputs(rows,phase){
 const hidden=new Float32Array(rows*W),timeEmbedding=new Float32Array(W);
 for(let i=0;i<hidden.length;i++)hidden[i]=Math.sin((i+phase)*.017)*.7+Math.cos((i+phase)*.003)*.2+(Math.floor(i/W)%7)*.03;
 for(let i=0;i<W;i++)timeEmbedding[i]=Math.sin((i+phase)*.009)*.3+Math.cos((i+phase)*.001)*.1;
 hidden[hidden.length-1]+=1.25;return {hidden,timeEmbedding,rows};
}
// Independent F64 direct formula and full5120 reduction. The reference reads
// actual original bytes independently and never consumes owner intermediates.
function reference(input,parameters){
 const {hidden,timeEmbedding,rows}=input,{weight,modulation,bias}=parameters,result=new Float64Array(rows*C);
 for(let row=0;row<rows;row++){
  let mean=0;for(let d=0;d<W;d++)mean+=hidden[row*W+d];mean/=W;
  let variance=0;for(let d=0;d<W;d++)variance+=(hidden[row*W+d]-mean)**2;variance/=W;
  const inv=1/Math.sqrt(variance+1e-6),modulated=new Float64Array(W);
  for(let d=0;d<W;d++)modulated[d]=modulation[d]+timeEmbedding[d]+(hidden[row*W+d]-mean)*inv*(1+modulation[W+d]+timeEmbedding[d]);
  for(let c=0;c<C;c++){let sum=bias[c];for(let d=0;d<W;d++)sum+=modulated[d]*weight[c*W+d];result[row*C+c]=sum;}
 }return result;
}
function compare(actual,expected,label){
 demand(actual.length===expected.length,label+' exact output shape');let failed=0,maxAbsolute=0,maxRelative=0;
 for(let i=0;i<actual.length;i++){
  const error=Math.abs(actual[i]-expected[i]);maxAbsolute=Math.max(maxAbsolute,error);maxRelative=Math.max(maxRelative,error/Math.max(1e-30,Math.abs(expected[i])));
  if(!Number.isFinite(error)||error>GATE.absolute+GATE.relative*Math.abs(expected[i]))failed++;
 }
 demand(failed===0,label+' failed '+failed+' values; maxAbsolute='+maxAbsolute);
 return {comparedElements:actual.length,failed,maxAbsolute,maxRelative,gate:{...GATE}};
}

/** Diagnostics only: retained immutable Files, ordinary numerical inputs,
 * independently decoded full head and F64 expected values. No hash receipt
 * gates execution or substitutes for running every supplied token row.
 */
export async function runModelHeadBrowser({HIGH,LOW}){
 const math=await createModelMath(),ops=await createBatchedModelOps(),models=[];
 try{
  for(const side of ['LOW','HIGH']){
   demand(({HIGH,LOW})[side] instanceof File,'Retained original File required');
   const file=({HIGH,LOW})[side],source=await createModelWeightSource({file,side});let owner;
   try{
    const identity=source.describe(),entries=identity.entries,selected={};let independentReadBytes=0;
    for(const [name,key]of [['weight','head.head.weight'],['modulation','head.modulation'],['bias','head.head.bias']]){selected[name]=await directF16(file,entries[key]);independentReadBytes+=selected[name].readBytes;}
    const parameters=Object.fromEntries(Object.entries(selected).map(([name,value])=>[name,value.values]));owner=createModelHead({source,math,ops});
    const cases=[];
    for(const [rows,phase]of [[128,113],[1,271],[3,617]]){
     const input=inputs(rows,phase),expected=reference(input,parameters),before=source.stats(),pending=owner.run(input);input.hidden.fill(99);input.timeEmbedding.fill(99);
     const output=await pending,comparison=compare(output,expected,side+' real head rows'+rows),after=source.stats();
     demand(output.length===rows*C,'No fake head rows permitted');
     if(rows===128)demand(after.payloadReads-before.payloadReads===6,'Head must load all64 actual rows in four bounded reads plus modulation/bias');
     else demand(after.payloadReads===before.payloadReads,'Bounded head cache must be reused');
     demand(owner.stats().lastLinearEvidence?.rows===rows&&owner.stats().lastLinearEvidence?.columns===64&&owner.stats().lastLinearEvidence?.inner===5120,'Real full-inner ORT linear evidence required');
     cases.push({rows,phase,comparison,fullInner:5120,outputColumns:64,phantomRows:0,linearEvidence:owner.stats().lastLinearEvidence,sourcePayloadReads:after.payloadReads-before.payloadReads});
    }
    const stats=owner.stats();demand(stats.rowsProcessed===132&&stats.cacheBytes===1351936,'Full head processing/cache bounds');
    models.push({side,headerSHA256:identity.headerSHA256,fileBytes:identity.fileBytes,retainedFile:true,fullSourceTargets:identity.targetCount,fullFileHashRecomputed:false,payloadSampleAdmission:false,rawTimeEmbedding:true,reference:'independent direct-file F16 decode and F64 formula',parameters:Object.fromEntries(Object.entries(selected).map(([name,value])=>[name,{elements:value.values.length,readBytes:value.readBytes,rawSHA256:value.rawSHA256}])),independentReadBytes,cases,headStats:stats,sourceStats:source.stats()});
   }finally{owner?.dispose();source.dispose();}
  }
  return {passed:true,scope:'actual final head operator only; full40block inference not implemented',originalProductionPrecisionVerified:false,generationReady:false,models,mathStats:math.stats(),opsStats:ops.stats(),comparedElements:models.reduce((n,m)=>n+m.cases.reduce((k,c)=>k+c.comparison.comparedElements,0),0)};
 }finally{math.dispose();await ops.dispose();}
}

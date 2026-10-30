import {createLatentSpace,NORMALIZED_MEAN} from './latent-space.mjs';
import * as interop from '../tensor-interop.mjs';
import {encodeTensor,decodeTensor} from '../../inference/tensor.mjs';

// Breaks caught: wrong i/8 channel mapping on F1, same-count shape acceptance,
// profile leakage into the legacy guard, relabelled samples, aliasing, and ABI reuse.
// Source-derived oracle is separate from the Hike/host implementation.
const f=Math.fround;
const mean=Float32Array.from([-.7571,-.7089,-.9113,.1075,-.1745,.9653,-.1517,1.5508,.4134,-.0715,.5517,-.3632,-.1922,-.9497,.2503,-.2921]);
const std=Float32Array.from([2.8184,1.4541,2.3275,2.6558,1.2196,1.7708,2.6052,2.0743,3.2687,2.1526,2.8652,1.5579,1.6382,1.1253,2.8251,1.916]);
const normal=(x,c)=>f(f(f(x-mean[c])*1)/std[c]);
const inverse=(x,c)=>f(f(f(x*std[c])/1)+mean[c]);
const check=(value,message)=>{if(!value)throw Error(message);};
const reject=fn=>{let caught=false;try{fn();}catch{caught=true;}check(caught,'Expected rejection');};
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const raw=(data,shape=[1,16,1,2,2])=>({dtype:'float32',shape:[...shape],layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:interop.WAN21_VAE_SHA256,data});
export async function runF1Cases(read,{metadataCodec}={}){
 const bytes=await read('build/latent-space.wasm'),space=await createLatentSpace(bytes),cases=[];
 const run=(name,fn)=>{fn();cases.push({name,status:'PASS'});};
 const input=raw(Float32Array.from({length:64},(_,i)=>(i%19-9)/8));
 const original=input.data.slice();let normalized,restored,maxRoundTripError=0;
 run('F1 all64 values use perchannel positions4 and staged f32',()=>{
  normalized=space.normalizeRawMean(input);
  check(normalized.shape.join(',')==='1,16,1,2,2'&&normalized.data.length===64,'F1 shape was padded or changed');
  normalized.data.forEach((v,i)=>check(Object.is(v,normal(input.data[i],Math.floor(i/4))),`F1 normal index${i}`));
  check(normalized.meaning===NORMALIZED_MEAN&&normalized.modelSha256===interop.WAN21_VAE_SHA256,'Mean semantics/model changed');
 });
 run('F1 rawzero gets source channel coefficients, no sampler skip',()=>{
  const zero=space.normalizeRawMean(raw(new Float32Array(64)));
  check(Object.is(zero.data[0],0.2686275839805603),'Literal channel0 zero normalization');
  zero.data.forEach((v,i)=>check(Object.is(v,normal(0,Math.floor(i/4))),'Zero perchannel arithmetic'));
 });
 run('F1 inverse all64 values preserves multiply divide add order',()=>{
  const fixture={...normalized,data:Float32Array.from({length:64},(_,i)=>(i%11-5)/4)};
  const result=space.restoreRawMean(fixture);
  result.data.forEach((v,i)=>check(Object.is(v,inverse(fixture.data[i],Math.floor(i/4))),'F1 inverse order'));
  check(result.meaning==='raw-posterior-mean'&&result.normalization===undefined,'Raw restored semantics');
  restored=space.restoreRawMean(normalized);
  restored.data.forEach((v,i)=>{maxRoundTripError=Math.max(maxRoundTripError,Math.abs(v-original[i]));});
  check(maxRoundTripError<=2e-6,'Predeclared roundtrip maxAbs2e-6 exceeded');
 });
 run('legacy128 guard stays strict and explicit F1 guard accepts only F1',()=>{
  check(typeof interop.requireWanRawLatentF1==='function','Missing dedicated F1 guard');
  check(interop.requireWanRawLatentF1(input)===input,'F1 guard result');
  reject(()=>interop.requireWanRawLatent(input));
  reject(()=>interop.requireWanRawLatentF1(raw(new Float32Array(128),[1,16,2,2,2])));
  reject(()=>interop.requireWanRawLatentF1({...input,shape:[1,16,2,1,2]}));
  reject(()=>interop.requireWanRawLatentF1({...input,profileId:'wan21-raw-f32-5x16x16'}));
  reject(()=>interop.requireWanRawLatentF1({...input,normalization:'wan21-comfy-f32-v1'}));
  reject(()=>interop.requireWanRawLatentF1({...input,latentContract:{representation:'generated-sample'}}));
 });
 run('F1 rejects samecountwrongshape model semantics markers and nonfinite',()=>{
  for(const fixture of [{...input,shape:[1,16,2,1,2]},{...input,shape:[1,16,1,1,4]},
   {...input,modelSha256:'0'.repeat(64)},{...input,meaning:'wan21-raw-generated-sample:v1'},
   {...input,normalization:'wan21-comfy-f32-v1'},{...input,data:new Float32Array(64).fill(NaN)},
   {...input,attentionMask:new Uint8Array([1])}])reject(()=>space.normalizeRawMean(fixture));
  reject(()=>space.restoreRawMean({...normalized,meaning:'wan21-normalized-generated-sample:v1'}));
  reject(()=>space.restoreRawMean({...normalized,modelSha256:undefined}));
  reject(()=>space.normalizeRawMean({...input,profileId:'wan21-raw-f32-5x16x16'}));
  reject(()=>space.normalizeRawMean({...input,latentContract:{representation:'generated-sample'}}));
 });
 run('F1 metadata context and arrays are owned, repeated mixedprofiles reuse arena',()=>{
  const context={schemaVersion:1,contextId:'still-1',inputId:'original',inputSha256:'a'.repeat(64),slotId:'slot-2',sourceFrameIndices:[80],sourceFrameTimesSeconds:[5]};
  const value=space.normalizeRawMean({...input,context}),back=space.restoreRawMean(value);
  check(value.context!==context&&back.context!==value.context,'Context aliases input');
  check(value.context.sourceFrameIndices.join(',')==='80'&&back.context.sourceFrameTimesSeconds[0]===5,'Frame metadata lost');
  value.context.sourceFrameIndices[0]=9;value.shape[0]=9;value.data[0]=99;
  check(context.sourceFrameIndices[0]===80&&input.shape[0]===1&&input.data.every((v,i)=>Object.is(v,original[i])),'Caller changed');
  const before=space.stats().memoryBytes;
  for(let i=0;i<50;i++){space.restoreRawMean(space.normalizeRawMean(input));space.normalizeRawMean(raw(new Float32Array(128),[1,16,2,2,2]));}
  check(space.stats().memoryBytes===before,'Workspace grew on repeats');
 });
 const saved=await encodeTensor(normalized),decoded=await decodeTensor(saved),binaryRestored=space.restoreRawMean(decoded);
 check(decoded.shape.join(',')==='1,16,1,2,2'&&decoded.meaning===NORMALIZED_MEAN,'Binary profile/meaning changed');
 binaryRestored.data.forEach((v,i)=>check(Math.abs(v-original[i])<=2e-6,'F1 binary mean roundtrip'));
 cases.push({name:'F1 versionedmean existing WKTENSOR numeric roundtrip',status:'PASS'});
 if(metadataCodec){
  const context={schemaVersion:1,contextId:'still-binary',inputId:'original',inputSha256:'a'.repeat(64),slotId:'slot-2',sourceFrameIndices:[80],sourceFrameTimesSeconds:[5]};
  const norm=space.normalizeRawMean({...input,context});
  const encoded=await metadataCodec.encodeTensor(norm),decoded=await metadataCodec.decodeTensor(encoded),restored=space.restoreRawMean(decoded);
  restored.data.forEach((v,i)=>check(Math.abs(v-original[i])<=2e-6,'G1C F1 mean numerical roundtrip'));
  check(JSON.stringify(restored.context)===JSON.stringify(context)&&restored.context!==context,'G1C F1 context metadata roundtrip');
  check(restored.meaning==='raw-posterior-mean'&&restored.modelSha256===interop.WAN21_VAE_SHA256,'G1C F1 producer meaning roundtrip');
  cases.push({name:'pinned actual G1C codec preserves F1 context/meaning/model and numerical roundtrip',status:'PASS'});
 }
 const module=await WebAssembly.compile(bytes),native=new WebAssembly.Instance(module,{}),memory=native.exports.memory,start=memory.buffer.byteLength;memory.grow(1);
 const source=new Float32Array(memory.buffer,start,128),outPtr=start+512;source.fill(0);
 check(typeof native.exports.NormalizeRawMeanF1==='function'&&typeof native.exports.RestoreRawMeanF1==='function','F1 native ABI missing');
 check(native.exports.NormalizeRawMeanF1(start,64,outPtr,64)===0,'F1 count64 native');
 new Float32Array(memory.buffer,outPtr,64).forEach((v,i)=>check(Object.is(v,normal(0,Math.floor(i/4))),'Native channel mapping'));
 check(native.exports.NormalizeRawMeanF1(start,128,outPtr,128)===-1,'F1 accepts128');
 check(native.exports.NormalizeRawMean(start,64,outPtr,128)===-1,'Legacy ABI accepts64');
 check(native.exports.RestoreRawMeanF1(start,64,outPtr,63)===-1,'F1 shortcapacity');
 source[63]=NaN;new Float32Array(memory.buffer,outPtr,64).fill(123);
 check(native.exports.NormalizeRawMeanF1(start,64,outPtr,64)===-2,'F1 nonfinite input');
 check(new Float32Array(memory.buffer,outPtr,64).every(v=>v===123),'Rejected F1 input changed output');
 cases.push({name:'dedicated native64 ABI rejects wrongcount capacity and nonfinite',status:'PASS'});
 const stats=space.stats();space.dispose();reject(()=>space.normalizeRawMean(input));reject(()=>space.restoreRawMean(normalized));
 cases.push({name:'F1 disposed operations rejected',status:'PASS'});
 return{scope:'F1 and legacy posterior-mean arithmetic only; no VAE model inference or generated-sample path',cases,roundTripTolerance:2e-6,maxRoundTripError,stats,wasmSHA256:await digest(bytes),normalizedSHA256:await digest(new Uint8Array(normalized.data.buffer)),restoredSHA256:await digest(new Uint8Array(restored.data.buffer)),callerPreserved:true,jsNumericalFallback:false,actualVaeBundleReceived:false,metadataCodecScope:metadataCodec?'actual pinned54bfead G1C codec, not merged into current runtime':'current codec numerical fields only'};
}

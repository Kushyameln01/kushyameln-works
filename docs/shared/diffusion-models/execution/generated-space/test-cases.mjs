import {createGeneratedLatentSpace,createGeneratedTargetPointwise,GENERATED_MODEL_LATENT,GENERATED_RAW_SAMPLE,NORMALIZATION,ORIGINAL81_TARGET_SHAPE} from '../generated-space.mjs';
import {createSchedulerKernel} from '../../scheduler/scheduler-kernel.mjs';
import {createEulerKernel} from '../../euler-kernel.mjs';
import {BASE_MODEL_HASHES} from '../../lora/weights.mjs';
import {WAN21_VAE_SHA256} from '../../tensor-interop.mjs';
import {GENERATED_SPACE_KERNEL} from './kernel-registry.mjs';
import {encodeTensor,decodeTensor,describeTensor} from '../../../inference/tensor.mjs';
const f=Math.fround;
// Independent source transcription used only by this harness, never production.
const mean=[-.7571,-.7089,-.9113,.1075,-.1745,.9653,-.1517,1.5508,.4134,-.0715,.5517,-.3632,-.1922,-.9497,.2503,-.2921].map(f);
const std=[2.8184,1.4541,2.3275,2.6558,1.2196,1.7708,2.6052,2.0743,3.2687,2.1526,2.8652,1.5579,1.6382,1.1253,2.8251,1.916].map(f);
const check=(value,message)=>{if(!value)throw Error(message);};
const rejected=async(fn,pattern)=>{try{await fn();}catch(error){if(pattern)check(pattern.test(error.message)||pattern.test(error.name),'Unexpected rejection: '+error);return error;}throw Error('Expected rejection');};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),v=>v.toString(16).padStart(2,'0')).join('');
const count=shape=>shape.reduce((a,b)=>a*b,1);
const tensor=(data,shape=ORIGINAL81_TARGET_SHAPE)=>({dtype:'float32',layout:'NCTHW',shape:[...shape],meaning:GENERATED_MODEL_LATENT,normalization:NORMALIZATION,producerModelSha256s:[BASE_MODEL_HASHES.HIGH,BASE_MODEL_HASHES.LOW],data});
function compare(actual,expected,name){
 check(actual.length===expected.length,name+' count');let maxAbs=0,maxRelative=0,sum=0,exact=0;
 for(let i=0;i<actual.length;i++){const a=actual[i],e=expected[i],d=Math.abs(a-e);check(Number.isFinite(a),name+' finite at '+i);if(Object.is(a,e))exact++;maxAbs=Math.max(maxAbs,d);maxRelative=Math.max(maxRelative,d/Math.max(Math.abs(e),1e-12));sum+=d*d;}
 const metrics={elements:actual.length,exactValues:exact,maxAbs,maxRelative,rmse:Math.sqrt(sum/actual.length),gate:{exact:true,maxAbs:1e-6,maxRelative:1e-6,rmse:1e-6}};
 check(exact===actual.length&&maxAbs<=1e-6&&maxRelative<=1e-6&&metrics.rmse<=1e-6,name+' numerical gate '+JSON.stringify(metrics));return metrics;
}
export async function runGeneratedCases(read){
 const bytes=await read('build/generated-space.wasm'),cases=[],shape=[...ORIGINAL81_TARGET_SHAPE],elements=count(shape),positions=shape[2]*shape[3]*shape[4],comparisons={};let savedTensor;
 const run=async(name,fn)=>{await fn();cases.push({name,status:'PASS'});};
 const owner=await createGeneratedLatentSpace({wasmBytes:bytes,targetShape:shape});
 const input=Float32Array.from({length:elements},(_,i)=>f(((i%1009)-504)/127)),snapshot=input.slice();let raw;
 await run('dedicated Hike source WASM and build hashes bind the exact executed assets',async()=>{
  const record=JSON.parse(new TextDecoder().decode(await read('build/build-record.json')));
  check(await digest(bytes)===record.wasmSha256&&record.wasmSha256===GENERATED_SPACE_KERNEL.sha256,'WASM hash binding');
  check(await digest(await read('generated-space.hike'))===record.sourceSha256&&record.sourceSha256===GENERATED_SPACE_KERNEL.sourceSha256,'Hike source hash binding');
  check(await digest(await read('../generated-space.mjs'))===record.hostSha256,'Host hash binding');
 });
 await run('actual original81 generated restoration compares every value with staged F32 oracle',async()=>{
  const context={schemaVersion:1,contextId:'d3-original81-target',inputId:'supplied-model-latent',inputSha256:await digest(new Uint8Array(input.buffer)),slotId:'target-output',sourceFrameIndices:Array.from({length:81},(_,i)=>i),sourceFrameTimesSeconds:Array.from({length:81},(_,i)=>i/16)};
  raw=await owner.restore({...tensor(input),context});
  const expected=Float32Array.from(input,(v,i)=>f(f(f(v*std[Math.floor(i/positions)])/f(1))+mean[Math.floor(i/positions)]));
  comparisons.restore=compare(raw.data,expected,'restore');check(raw.meaning===GENERATED_RAW_SAMPLE,'Generated meaning');check(raw.meaning!=='raw-posterior-mean','Mean relabel');
  check(raw.latentContract.representation==='generated-sample'&&raw.latentContract.space==='raw'&&raw.latentContract.normalization.state==='restored','Raw contract');
  check(raw.latentContract.vaeModelSha256===WAN21_VAE_SHA256&&raw.latentContract.producerModelSha256s.join()===tensor(input).producerModelSha256s.join(),'Producer/VAE identity separation');
  check(input.every((v,i)=>Object.is(v,snapshot[i])),'Caller mutated');check(raw.data.buffer!==input.buffer,'Borrowed output');
 });
 await run('canonical tensor codec saves and reloads every actual target payload bit and generated metadata',async()=>{
  const encoded=await encodeTensor(raw),decoded=await decodeTensor(encoded);
  const actualBits=new Uint32Array(decoded.data.buffer,decoded.data.byteOffset,decoded.data.length),expectedBits=new Uint32Array(raw.data.buffer,raw.data.byteOffset,raw.data.length);let exactBits=0;
  check(actualBits.length===elements,'Saved tensor element count');for(let i=0;i<elements;i++){check(actualBits[i]===expectedBits[i],'Saved tensor payload bits at '+i);exactBits++;}
  check(JSON.stringify(decoded.latentContract)===JSON.stringify(raw.latentContract),'Saved latentContract changed');
  check(JSON.stringify(decoded.context)===JSON.stringify(raw.context),'Saved context changed');
  check(JSON.stringify(decoded.latentContract.producerModelSha256s)===JSON.stringify(raw.latentContract.producerModelSha256s),'Saved producer models changed');
  check(decoded.normalization===undefined&&raw.normalization===undefined,'Raw generated top-level normalization marker must be absent');
  check(decoded.data.buffer!==raw.data.buffer,'Saved decode borrowed payload');
  savedTensor={codecPath:'docs/shared/inference/tensor.mjs',codecSha256:await digest(await read('../../../inference/tensor.mjs')),encodedByteLength:encoded.byteLength,encodedSha256:await digest(encoded),payloadSha256:decoded.dataSha256,payloadBitsCompared:elements,payloadBitsExact:exactBits,readbackMetadata:{schemaVersion:decoded.schemaVersion,byteOrder:decoded.byteOrder,byteLength:decoded.byteLength,dataSha256:decoded.dataSha256,...describeTensor(decoded)}};
 });
 await run('generated restoration rejects repeat restoration, posterior means, masks, axis swaps and wrong normalization',async()=>{
  await rejected(()=>owner.restore(raw),/meaning|generated/i);
  for(const change of [t=>t.meaning='raw-posterior-mean',t=>t.meaning='wan21-normalized-posterior-mean:v1',t=>t.normalization='none',t=>t.layout='NTHWC',t=>t.shape=[1,16,21,104,60],t=>t.attentionMask=new Uint8Array([1]),t=>t.mask=new Uint8Array([1]),t=>t.producerModelSha256s=[WAN21_VAE_SHA256],t=>t.profileId='wan21-raw-f32-1x16x32']){const t=tensor(input);change(t);await rejected(()=>owner.restore(t));}
 });
 await run('arbitrary target shape uses global NCTHW channel indices across chunk boundaries',async()=>{
  const s=[1,16,3,17,19],small=await createGeneratedLatentSpace({wasmBytes:bytes,targetShape:s}),x=Float32Array.from({length:count(s)},(_,i)=>f((i%61-30)/9)),out=await small.restore(tensor(x,s)),p=s[2]*s[3]*s[4];
  comparisons.channelBoundaries=compare(out.data,Float32Array.from(x,(v,i)=>f(f(f(v*std[Math.floor(i/p)])/f(1))+mean[Math.floor(i/p)])),'channel boundaries');small.dispose();
 });
 await run('raw context normalization preserves declared list order and source metadata including zeros',async()=>{
  const contexts=[{shape:[1,16,1,2,3],data:new Float32Array(96),context:{contextId:'ref-b',sourceFrameIndices:[9,2,9]}},{shape:[1,16,2,1,3],data:new Float32Array(96).fill(.5),context:{contextId:'ref-a',sourceFrameIndices:[4,1]}}];
  const result=await owner.normalizeContexts(contexts.map(x=>({...x,dtype:'float32',layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:WAN21_VAE_SHA256})));
  check(result.map(x=>x.context.contextId).join()==='ref-b,ref-a','Context reorder');
  for(let j=0;j<result.length;j++){const p=contexts[j].shape.slice(2).reduce((a,b)=>a*b),expected=Float32Array.from(contexts[j].data,(v,i)=>f(f(f(v-mean[Math.floor(i/p)])*f(1))/std[Math.floor(i/p)]));compare(result[j].data,expected,'context '+j);check(result[j].meaning==='wan21-normalized-posterior-mean:v1','Context meaning');}
  check(result[0].data.some(v=>v!==0),'Zero context normalization skipped');result[0].context.sourceFrameIndices[0]=77;check(contexts[0].context.sourceFrameIndices[0]===9,'Context metadata borrowed');
  const direct=await owner.normalizeContextRaw({...contexts[0],dtype:'float32',layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:WAN21_VAE_SHA256});compare(direct.data,result[0].data,'single context');
  await rejected(()=>owner.normalizeContextRaw({...contexts[0],dtype:'float32',layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:WAN21_VAE_SHA256,profileId:'wan21-raw-f32-1x16x32'}));
  const large={dtype:'float32',shape,layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:WAN21_VAE_SHA256,data:input};await rejected(()=>owner.normalizeContexts(Array(5).fill(large)),/aggregate/);
 });
 await run('inputs snapshot before async execution and cancellation leaves reusable bounded workspaces',async()=>{
  const smallShape=[1,16,1,32,17],small=await createGeneratedLatentSpace({wasmBytes:bytes,targetShape:smallShape}),x=new Float32Array(count(smallShape)).fill(.5),promise=small.restore(tensor(x,smallShape));x.fill(99);const result=await promise;check(result.data[0]===f(f(f(.5*std[0])/f(1))+mean[0]),'Unsnapshotted input');
  const c=new AbortController();c.abort();await rejected(()=>small.restore(tensor(x,smallShape),{signal:c.signal}),/Abort/);
  const mid=new AbortController();await rejected(()=>small.restore(tensor(x,smallShape),{signal:mid.signal,onProgress:()=>mid.abort()}),/Abort/);
  const before=small.stats();await small.restore(tensor(new Float32Array(x.length),smallShape));const after=small.stats();check(before.memoryBytes===after.memoryBytes&&after.arenaBytes===32768,'Arena growth');check(after.workspaceZeroed===true,'Cancelled workspace not cleared');small.dispose();await rejected(()=>small.restore(tensor(x,smallShape)),/disposed/);
  const dying=await createGeneratedLatentSpace({wasmBytes:bytes,targetShape:smallShape});await rejected(()=>dying.restore(tensor(x,smallShape),{onProgress:()=>dying.dispose()}),/disposed/);check(dying.stats().memoryBytes===0&&!dying.stats().busy,'Dispose during execution retained memory');
 });
 await run('shared nonfinite wrong lengths and source hash mismatches reject',async()=>{
  const bad=tensor(input);bad.data=input.slice();bad.data[123]=NaN;await rejected(()=>owner.restore(bad));
  await rejected(()=>owner.restore(tensor(new Float32Array(16))));
  if(typeof SharedArrayBuffer!=='undefined')await rejected(()=>owner.restore(tensor(new Float32Array(new SharedArrayBuffer(elements*4)))));
  const changed=new Uint8Array(bytes);changed[changed.length-1]^=1;await rejected(()=>createGeneratedLatentSpace({wasmBytes:changed,targetShape:shape}),/hash/);
 });
 await run('native generated ABI rejects invalid extents and nonfinite input before writes',async()=>{
  const module=await WebAssembly.compile(bytes),native=new WebAssembly.Instance(module,{}),memory=native.exports.memory,base=memory.buffer.byteLength;memory.grow(1);
  const x=new Float32Array(memory.buffer,base,16),out=new Float32Array(memory.buffer,base+128,16);x.fill(.5);out.fill(123);
  for(const name of ['RestoreGeneratedChunk','NormalizeContextRawChunk','RestoreHighHandoffChunk','NormalizeHighHandoffChunk']){
   for(const args of [[0,4096,0,1,16],[1,0,0,1,16],[1,4096,-1,1,16],[1,4096,16,1,16],[1,4096,0,0,16],[1,4096,0,1,17],[1,4096,0,262145,4194320]])check(native.exports[name](base,args[0],base+128,...args.slice(1))===-1,'Native extent accepted');
   x[0]=NaN;check(native.exports[name](base,1,base+128,4096,0,1,16)===-2,'Native NaN accepted');x[0]=.5;
   check(out.every(v=>v===123),'Invalid native call wrote output');
  }
 });
 const schedulerBytes=await read('../../scheduler/build/scheduler.wasm'),scheduler=createSchedulerKernel(await WebAssembly.compile(schedulerBytes)),euler=await createEulerKernel(await read('../../kernel/euler.wasm')),pointwise=createGeneratedTargetPointwise({scheduler,euler,targetShape:shape});
 await run('actual original81 HIGH inverse raw handoff LOW normalization and zero-noise remix follow source F32 stages',async()=>{
  const sigma=f(.8333333134651184),denominator=f(1-sigma),inverse=await pointwise.inverseNoiseScale({shape,latent:input,sigma});
  const expectedInverse=Float32Array.from(input,v=>f(v/denominator));comparisons.highHandoffInverse=compare(inverse.data,expectedInverse,'HIGH handoff inverse');
  const highInput={...tensor(inverse.data),producerModelSha256s:[BASE_MODEL_HASHES.HIGH]},highRaw=await owner.restoreHighHandoff(highInput);
  check(highRaw.meaning==='bernini-high-handoff-raw:v1'&&highRaw.normalization===undefined&&highRaw.latentContract===undefined,'HIGH raw handoff semantics');
  check(highRaw.handoffProfile==='bernini-high-low-wan21-handoff:v1','HIGH handoff profile');
  const expectedRaw=Float32Array.from(expectedInverse,(v,i)=>f(f(f(v*std[Math.floor(i/positions)])/f(1))+mean[Math.floor(i/positions)]));comparisons.highHandoffRaw=compare(highRaw.data,expectedRaw,'HIGH raw handoff');
  const lowModel=await owner.normalizeHighHandoff(highRaw),expectedLow=Float32Array.from(expectedRaw,(v,i)=>f(f(f(v-mean[Math.floor(i/positions)])*f(1))/std[Math.floor(i/positions)]));comparisons.lowHandoffModel=compare(lowModel.data,expectedLow,'LOW normalized handoff');
  check(lowModel.meaning===GENERATED_MODEL_LATENT&&lowModel.normalization===NORMALIZATION&&lowModel.handoffNormalization==='applied','LOW handoff semantics');
  check(lowModel.producerModelSha256s.join()===BASE_MODEL_HASHES.HIGH,'Handoff producers changed');
  const lowMixed=await pointwise.noiseMix({shape,noise:new Float32Array(elements),latent:lowModel.data,sigma,noiseScale:1});comparisons.lowHandoffNoiseMix=compare(lowMixed.data,Float32Array.from(expectedLow,v=>f(f(sigma*f(f(1)*f(0)))+f(denominator*v))),'LOW handoff zero-noise mix');
  const zeros=new Float32Array(elements);zeros[15]=-0;const skipped=await owner.normalizeHighHandoff({...highRaw,data:zeros});comparisons.lowHandoffAllZeroSkip=compare(skipped.data,zeros,'LOW all-zero raw skip');
  check(skipped.handoffNormalization==='skipped-all-zero-raw','Zero skip provenance');
  const mixedZeros=new Float32Array(elements);mixedZeros[0]=f(1e-6);const normalizedMixed=await owner.normalizeHighHandoff({...highRaw,data:mixedZeros});comparisons.lowHandoffMixedZeros=compare(normalizedMixed.data,Float32Array.from(mixedZeros,(v,i)=>f(f(f(v-mean[Math.floor(i/positions)])*f(1))/std[Math.floor(i/positions)])),'LOW mixed zero chunks');
  check(normalizedMixed.handoffNormalization==='applied'&&normalizedMixed.data[8192]!==0,'Per-chunk all-zero skip is forbidden');
  await rejected(()=>owner.restoreHighHandoff({...highInput,producerModelSha256s:[BASE_MODEL_HASHES.LOW]}),/HIGH/);
  await rejected(()=>owner.normalizeHighHandoff({...highRaw,producerModelSha256s:[BASE_MODEL_HASHES.LOW]}),/HIGH/);
  for(const change of [t=>t.meaning='raw-posterior-mean',t=>t.meaning=GENERATED_RAW_SAMPLE,t=>t.normalization=NORMALIZATION,t=>t.handoffProfile='wrong',t=>t.latentContract=raw.latentContract,t=>t.attentionMask=new Uint8Array([1])]){const value={...highRaw};change(value);await rejected(()=>owner.normalizeHighHandoff(value));}
  await rejected(()=>owner.restoreHighHandoff(highRaw));await rejected(()=>owner.restore(highRaw));
 });
 await run('all original81 pointwise operations compare all 2096640 supplied values with independent F32 oracles',async()=>{
  const x=input,y=Float32Array.from(input,(v,i)=>f((i%31-15)/11)),sigma=f(.8333333134651184),nextSigma=f(.7148972749710083),noiseScale=f(.7),s=f(1-sigma);
  const request={shape,noise:x,latent:y,sigma,noiseScale};
  const mixed=await pointwise.noiseMix(request);comparisons.noiseMix=compare(mixed.data,Float32Array.from(x,(v,i)=>f(f(sigma*f(noiseScale*v))+f(s*y[i]))),'noiseMix');
  const inverse=await pointwise.inverseNoiseScale({shape,latent:x,sigma});comparisons.inverseNoiseScale=compare(inverse.data,Float32Array.from(x,v=>f(v/s)),'inverseNoiseScale');
  const denoised=await pointwise.flowDenoised({shape,input:x,velocity:y,sigma});comparisons.flowDenoised=compare(denoised.data,Float32Array.from(x,(v,i)=>f(v-f(y[i]*sigma))),'flowDenoised');
  const stepped=await pointwise.eulerStep({shape,latent:x,denoised:y,sigma,nextSigma});comparisons.eulerStep=compare(stepped.data,Float32Array.from(x,(v,i)=>f(v+f(f(f(v-y[i])/sigma)*f(nextSigma-sigma)))),'eulerStep');
  check(input.every((v,i)=>Object.is(v,snapshot[i])),'Pointwise caller mutation');
 });
 await run('target pointwise cancellation exact shape guards and disposal keep primitives separate from prediction',async()=>{
  await rejected(()=>pointwise.noiseMix({shape:[1,16,21,104,60],noise:input,latent:input,sigma:.5,noiseScale:1}));
  await rejected(()=>pointwise.noiseMix({shape,noise:input,latent:input,sigma:.5}));
  for(const metadata of [{layout:'NTHWC'},{dtype:'float64'},{axes:['N','T','H','W','C']},{profileId:'wan21-raw-f32-1x16x32'}])await rejected(()=>pointwise.noiseMix({shape,noise:input,latent:input,sigma:.5,noiseScale:1,...metadata}));
  const c=new AbortController();await rejected(()=>pointwise.eulerStep({shape,latent:input,denoised:input,sigma:1,nextSigma:0},{signal:c.signal,onProgress:()=>c.abort()}),/Abort/);
  check(!('predict'in pointwise)&&!('sample'in pointwise),'Hypothetical predictor');
 });
 const stats=owner.stats(),pointwiseStats=pointwise.stats();pointwise.dispose();scheduler.dispose();euler.dispose();owner.dispose();await rejected(()=>owner.restore(tensor(input)),/disposed/);
 return {scope:'D3 standalone Hike arithmetic with supplied arrays; no neural predictions, model execution, sampling or VAE decode',shape,elements,positionsPerChannel:positions,predeclaredGate:'Every output must be bit-exact staged F32; maxAbs/maxRelative/RMSE additionally <=1e-6',comparisons,savedTensor,cases,wasmSha256:await digest(bytes),sourceSha256:GENERATED_SPACE_KERNEL.sourceSha256,restoredSha256:await digest(new Uint8Array(raw.data.buffer)),stats,pointwiseStats,jsNumericalFallback:false,generationReady:false};
}

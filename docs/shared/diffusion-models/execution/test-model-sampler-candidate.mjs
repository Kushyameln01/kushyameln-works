import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBerniniModelSamplerCandidate} from './model-sampler-candidate.mjs';
import {BERNINI_TARGETS,TARGET_PROVENANCE} from '../lora/targets.mjs';
import {P4_INPUT_SEMANTICS} from './capabilities.mjs';
import {BERNINI_WORKFLOW_RULE_ID,deriveWorkflowShapes} from '../../ai-connection/workflow-shapes.mjs';
import {createGeneratedLatentSpace,createGeneratedTargetPointwise,GENERATED_MODEL_LATENT,HIGH_HANDOFF_RAW,HIGH_HANDOFF_PROFILE,NORMALIZATION} from './generated-space.mjs';
import {createSchedulerKernel} from '../scheduler/scheduler-kernel.mjs';
import {createEulerKernel} from '../euler-kernel.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';

const bytes=async path=>new Uint8Array(await readFile(new URL(path,import.meta.url)));
const preparationBytes=async()=>({bridgeBytes:await bytes('../ort-bridge/kernel/bridge.wasm'),lookupBytes:await bytes('./model-decode/model-decode.wasm'),mathWasmBytes:await bytes('./model-math/kernel.wasm'),schedulerWasmBytes:await bytes('../scheduler/build/scheduler.wasm'),eulerWasmBytes:await bytes('../kernel/euler.wasm'),generatedSpaceWasmBytes:await bytes('./generated-space/build/generated-space.wasm')});
// Sparse immutable files reproduce the pinned actual headers and configuration
// only. Payload access throws: these tests cannot produce a synthetic model run.
function sparseFile(side){
 const encoder=new TextEncoder(),fp8=key=>/^blocks\.\d+\.(self_attn\.[qkvo]|cross_attn\.[qkv]|ffn\.[02])\.weight$/.test(key);
 const targets=BERNINI_TARGETS.map(target=>({name:target.key,shape:target.shape,dtype:fp8(target.key)?'F8_E4M3':'F16'})),compressed=targets.filter(target=>target.dtype==='F8_E4M3');
 const entries=[...compressed.map(target=>({name:target.name.slice(0,-7)+'.weight_scale',shape:[],dtype:'F32'})),...targets.filter(target=>target.dtype==='F16'),...compressed,...compressed.map(target=>({name:target.name.slice(0,-7)+'.comfy_quant',shape:[27],dtype:'U8'}))];
 const order=['F32','F16','F8_E4M3','U8'];entries.sort((a,b)=>order.indexOf(a.dtype)-order.indexOf(b.dtype)||(a.name<b.name?-1:a.name>b.name?1:0));
 const header={__metadata__:side==='LOW'?{format:'pt',model_type:'bernini_low'}:{model_type:'bernini_high',format:'pt'}};let cursor=0,payloadReads=0;
 for(const entry of entries){const size=entry.shape.reduce((a,b)=>a*b,1)*({F32:4,F16:2,F8_E4M3:1,U8:1}[entry.dtype]);header[entry.name]={dtype:entry.dtype,shape:entry.shape,data_offsets:[cursor,cursor+size]};entry.offset=cursor;entry.bytes=size;cursor+=size;}
 const json=encoder.encode(JSON.stringify(header)),headerBytes=new Uint8Array(Math.ceil(json.length/8)*8);headerBytes.fill(32);headerBytes.set(json);
 const prefix=new Uint8Array(8);new DataView(prefix.buffer).setBigUint64(0,BigInt(headerBytes.length),true);const payload=8+headerBytes.length,size=payload+cursor;
 assert.equal(size,TARGET_PROVENANCE.models.find(value=>value.name.includes(side)).fileBytes);
 const copy=(out,start,offset,source)=>{const begin=Math.max(start,offset),end=Math.min(start+out.length,offset+source.length);if(end>begin)out.set(source.subarray(begin-offset,end-offset),begin-start);};
 class HeaderOnlyOriginal extends Blob{
  get size(){return size;}
  async arrayBuffer(){throw Error('Whole model read forbidden');}
  slice(start,end){return {async arrayBuffer(){
   const out=new Uint8Array(end-start);copy(out,start,0,prefix);copy(out,start,8,headerBytes);
   if(start>=payload){const entry=entries.find(value=>start>=payload+value.offset&&start<payload+value.offset+value.bytes);if(!entry||!['F32','U8'].includes(entry.dtype)){payloadReads++;throw Error('Neural payload forbidden in admission tests');}
    if(entry.dtype==='F32'){const scalar=new Uint8Array(4);new DataView(scalar.buffer).setFloat32(0,.5,true);copy(out,start,payload+entry.offset,scalar);}else copy(out,start,payload+entry.offset,encoder.encode('{"format": "float8_e4m3fn"}'));
   }return out.buffer;
  }};}
 }
 return {file:new HeaderOnlyOriginal(),get payloadReads(){return payloadReads;}};
}
function input({context=false}={}){
 const absent=()=>({state:'absent'}),semantics={};for(const role of ['target-latent','source-latent','reference-latent','context-latent'])semantics[role]={meaning:role==='target-latent'?GENERATED_MODEL_LATENT:'wan21-normalized-posterior-mean:v1',normalization:NORMALIZATION};
 const slots=Array.from({length:8},(_,slotIndex)=>({slotIndex,wired:absent(),editor:absent()}));
 const shapeRequest={ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:1,height:16,width:32},refMaxSize:32,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],temporalRule:'first-then-groups-floor',patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',concatOrder:'target-first',paddingMode:'none'},semantics,media:{sourceVideo:context?{state:'present',rgb:{frames:1,height:16,width:32}}:absent(),referenceVideo:absent(),slots}};
 const canonical=deriveWorkflowShapes(shapeRequest),requirements=['target.latent',...canonical.orderedContexts.entries.map(entry=>entry.contextKey+'.latent')].map(id=>canonical.requirements.find(value=>value.requirementId===id));
 const tensors=requirements.map(requirement=>({requirementId:requirement.requirementId,shape:[...requirement.shape],dtype:'float32',meaning:requirement.meaning,normalization:requirement.normalization,data:new Float32Array(requirement.shape.reduce((a,b)=>a*b,1))}));
 const text=()=>({...structuredClone(P4_INPUT_SEMANTICS.conditioning),shape:[1,1,4096],data:new Float32Array(4096),attentionMask:new Uint8Array([1])});
 return {shapeRequest,tensors,noise:Float32Array.from({length:128},(_,index)=>(index-64)/128),positive:text(),negative:text()};
}
async function prepare(){const HIGH=sparseFile('HIGH'),LOW=sparseFile('LOW'),candidate=await createBerniniModelSamplerCandidate({files:{HIGH:HIGH.file,LOW:LOW.file},...await preparationBytes()});return {candidate,HIGH,LOW};}

test('factory rejects predictor/owner injection and missing immutable sides before preparation',async()=>{
 const files={HIGH:new Blob(),LOW:new Blob()};
 for(const extra of [{predictor:()=>{}},{ops:{}},{math:{}},{source:{}},{seed:1}])await assert.rejects(createBerniniModelSamplerCandidate({files,...extra}),/Unknown/);
 await assert.rejects(createBerniniModelSamplerCandidate({files:{HIGH:new Blob()}}),/HIGH and LOW/);
 const controller=new AbortController();controller.abort();await assert.rejects(createBerniniModelSamplerCandidate({files,signal:controller.signal}),{name:'AbortError'});
});
test('actual internally constructed models use lookup sources and share exactly two ORT sessions',async()=>{
 const {candidate,HIGH,LOW}=await prepare();
 try{
  const description=candidate.describe(),stats=candidate.stats();assert.equal(description.experimental,true);assert.equal(description.acceptedProduction,false);assert.equal(description.generationReady,false);assert.equal(description.publicRuntimeEnabled,false);assert.equal(description.steps,6);assert.equal(description.splitStep,3);assert.equal(description.cfg,1);assert.match(description.weightCache,/owned prepared F32 stage weights/);assert.equal(description.resource.wasmThreads,1);assert.equal(description.resource.readAheadBytes,1048576);
  assert.equal(description.models.HIGH.model.modelSha256,BASE_MODEL_HASHES.HIGH);assert.equal(description.models.LOW.model.modelSha256,BASE_MODEL_HASHES.LOW);
  assert.equal(stats.sources.HIGH.decoderSelection,'lookup');assert.equal(stats.sources.LOW.decoderSelection,'lookup');assert.equal(stats.sharedSessionCreations,2);assert.equal(stats.models.HIGH.math.memoryIdentity,stats.models.LOW.math.memoryIdentity);assert.equal(stats.sources.HIGH.payloadReads,0);assert.equal(stats.sources.LOW.payloadReads,0);
  assert.equal(HIGH.payloadReads+LOW.payloadReads,0);
 }finally{await candidate.dispose();await candidate.dispose();}
 const stats=candidate.stats();assert.equal(stats.disposed,true);assert.equal(stats.ops.disposed,true);assert.equal(stats.math.disposed,true);assert.equal(stats.sources.HIGH.disposed,true);assert.equal(stats.sources.LOW.disposed,true);assert.equal(stats.models.HIGH.disposed,true);assert.equal(stats.models.LOW.disposed,true);assert.throws(()=>candidate.describe(),/disposed/);
});
test('sample rejects noise, both Text branches, ambiguous metadata and canonical binding before neural access',async()=>{
 const {candidate,HIGH,LOW}=await prepare();
 try{
  for(const change of [x=>delete x.noise,x=>x.noise=new Float64Array(128),x=>x.noise[127]=NaN,x=>x.seed=10,x=>x.predictor=()=>{},x=>x.onTrace=()=>{},x=>x.cfg=2,x=>delete x.negative,x=>x.negative.normalization='none',x=>x.negative.attentionMask[0]=0,x=>x.positive.modelSha256='0'.repeat(64),x=>x.shapeRequest.semantics['target-latent'].meaning='raw-posterior-mean',x=>x.tensors[0].requirementId='source.latent',x=>x.tensors[0].data=new Float32Array(129),x=>x.tensors[0].latentContract={},x=>x.tensors[0].mask=new Float32Array(128),x=>x.onProgress=1]){
   const request=input();change(request);await assert.rejects(candidate.sample(request));
  }
  assert.equal(candidate.stats().samples,0);assert.equal(candidate.stats().busy,false);assert.equal(HIGH.payloadReads+LOW.payloadReads,0);assert.equal(candidate.stats().models.HIGH.stats?.predictions??candidate.stats().models.HIGH.predictions,0);
 }finally{await candidate.dispose();}
});
test('diagnostic initial X uses real Hike, copies snapshots, and cancellation disposes owned shared sessions',async()=>{
 const {candidate,HIGH,LOW}=await prepare(),controller=new AbortController(),request=input();delete request.tensors;const original=request.noise.slice();let trace=null,disposing;
 const pending=candidate.diagnose({...request,signal:controller.signal},{onTrace(event){trace=event;assert.equal(event.name,'initialX');assert.deepEqual(event.data,original);event.data.fill(17);disposing=candidate.dispose();return new Float32Array(128).fill(99);}});
 await assert.rejects(pending,{name:'AbortError'});await disposing;assert.ok(trace);assert.deepEqual(request.noise,original);assert.equal(candidate.stats().disposed,true);assert.equal(candidate.stats().samples,0);assert.equal(candidate.stats().models.HIGH.predictions,0);assert.equal(candidate.stats().models.LOW.predictions,0);assert.equal(HIGH.payloadReads+LOW.payloadReads,0);
});
test('raw canonical context enters the dedicated normalization owner before any neural call',async()=>{
 const {candidate,HIGH,LOW}=await prepare(),request=input({context:true}),controller=new AbortController();
 const context=request.tensors[1];context.meaning='raw-posterior-mean';delete context.normalization;
 const {WAN21_VAE_SHA256}=await import('../tensor-interop.mjs');context.modelSha256=WAN21_VAE_SHA256;context.context={inputId:'source-test',originalFrameIndices:[0],sourceFrameTimesSeconds:[0]};
 const original=structuredClone(context),pending=candidate.diagnose({...request,signal:controller.signal},{onTrace(event){assert.equal(event.name,'initialX');controller.abort();}});
 try{await assert.rejects(pending,{name:'AbortError'});assert.equal(candidate.stats().rawContextNormalizations,1);assert.deepEqual(context,original);assert.equal(HIGH.payloadReads+LOW.payloadReads,0);}finally{await candidate.dispose();}
});
test('a whole sample holds both HIGH and LOW weight epochs until cancelled terminal cleanup',async()=>{
 const {candidate,HIGH,LOW}=await prepare(),controller=new AbortController(),feeds=['HIGH','LOW'].map(side=>candidate.getWeightFeed(side));
 try{
  const pending=candidate.diagnose({...input(),signal:controller.signal},{async onTrace(event){assert.equal(event.name,'initialX');for(const feed of feeds){assert.equal(feed.stats().operationLeases,1);await assert.rejects(feed.clear(),{code:'WEIGHT_OPERATION_ACTIVE'});}controller.abort();}});
  await assert.rejects(pending,{name:'AbortError'});for(const feed of feeds){assert.equal(feed.stats().operationLeases,0);assert.equal(feed.stats().readLeases,0);await feed.clear();}
  assert.equal(HIGH.payloadReads+LOW.payloadReads,0);assert.equal(candidate.stats().busy,false);
 }finally{await candidate.dispose();}
});
test('pointwise boundary preserves actual HIGH public conversion, LOW process_in and zero-noise remapping',async()=>{
 const kernelBytes=await preparationBytes(),scheduler=createSchedulerKernel(await WebAssembly.compile(kernelBytes.schedulerWasmBytes)),euler=await createEulerKernel(kernelBytes.eulerWasmBytes),shape=[1,16,1,2,4],space=await createGeneratedLatentSpace({wasmBytes:kernelBytes.generatedSpaceWasmBytes,targetShape:shape}),pointwise=createGeneratedTargetPointwise({scheduler,euler,targetShape:shape});
 const generated=data=>({dtype:'float32',shape,layout:'NCTHW',meaning:GENERATED_MODEL_LATENT,normalization:NORMALIZATION,producerModelSha256s:[BASE_MODEL_HASHES.HIGH],data});
 try{
  const schedule=scheduler.schedule(),sigma=schedule.sigmas[3],x=Float32Array.from({length:128},(_,index)=>(index%19-9)*.00000013+index*.0137),inverse=await pointwise.inverseNoiseScale({shape,latent:x,sigma}),high=await space.restoreHighHandoff(generated(inverse.data));
  assert.equal(high.meaning,HIGH_HANDOFF_RAW);assert.equal(high.handoffProfile,HIGH_HANDOFF_PROFILE);assert.equal(high.latentContract,undefined);assert.equal(high.normalization,undefined);
  const low=await space.normalizeHighHandoff(high),entry=await pointwise.noiseMix({shape,noise:new Float32Array(128),latent:low.data,sigma,noiseScale:1});
  assert.equal(low.meaning,GENERATED_MODEL_LATENT);assert.equal(low.handoffNormalization,'applied');assert.ok(entry.data.some((value,index)=>!Object.is(value,x[index])),'Boundary round-trip rounding must remain observable');
  const means=[-.7571,-.7089,-.9113,.1075,-.1745,.9653,-.1517,1.5508,.4134,-.0715,.5517,-.3632,-.1922,-.9497,.2503,-.2921],stds=[2.8184,1.4541,2.3275,2.6558,1.2196,1.7708,2.6052,2.0743,3.2687,2.1526,2.8652,1.5579,1.6382,1.1253,2.8251,1.916],f=Math.fround;
  for(let index=0;index<128;index++){
   const channel=Math.floor(index/8),inv=f(x[index]/f(1-sigma)),raw=f(f(f(inv*f(stds[channel]))/1)+f(means[channel])),normalized=f(f(f(raw-f(means[channel]))*1)/f(stds[channel])),expected=f(f(sigma*f(1*0))+f(f(1-sigma)*normalized));
   assert.equal(high.data[index],raw);assert.equal(low.data[index],normalized);assert.equal(entry.data[index],expected);
  }
  const zero=await space.normalizeHighHandoff({...high,data:new Float32Array(128)});assert.equal(zero.handoffNormalization,'skipped-all-zero-raw');assert.ok(zero.data.every(value=>value===0));assert.equal(space.stats().allZeroHandoffSkips,1);
  const final=await space.restore({...generated(entry.data),producerModelSha256s:[BASE_MODEL_HASHES.HIGH,BASE_MODEL_HASHES.LOW]});assert.equal(final.meaning,'wan21-raw-generated-sample:v1');assert.deepEqual(final.latentContract.producerModelSha256s,[BASE_MODEL_HASHES.HIGH,BASE_MODEL_HASHES.LOW]);assert.equal(final.latentContract.normalization.state,'restored');assert.throws(()=>space.restore(final),/unrestored/);
 }finally{pointwise.dispose();space.dispose();scheduler.dispose();euler.dispose();}
});

test('sampler resource admission rejects invalid or unisolated profiles before payload access',async()=>{
 const files={HIGH:new Blob(),LOW:new Blob()};
 for(const resource of [{wasmThreads:3},{readAheadBytes:-1},{readAheadBytes:1048577},{readAheadBytes:1.5}])await assert.rejects(createBerniniModelSamplerCandidate({files,...resource}),/bounded readAheadBytes/);
 if(globalThis.crossOriginIsolated!==true)await assert.rejects(createBerniniModelSamplerCandidate({files,wasmThreads:4}),{code:'UNSUPPORTED_RESOURCE_CONFIG'});
});

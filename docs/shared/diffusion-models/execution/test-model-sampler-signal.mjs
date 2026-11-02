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


const disposeSettled=async candidate=>Promise.race([candidate.dispose().then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),100))]);

test('native signal own addEventListener override cannot strand sampler state or disposal',async()=>{
 const {candidate,HIGH,LOW}=await prepare(),controller=new AbortController();let calls=0;
 Object.defineProperty(controller.signal,'addEventListener',{value(){calls++;throw Error('listener attach failed');}});
 try{
  await assert.rejects(candidate.sample({signal:controller.signal}));
  assert.equal(calls,0,'sampler must use captured native listener attachment');
  assert.equal(candidate.stats().busy,false,'failed operation must not remain busy');
  await assert.rejects(candidate.sample({}),error=>!/busy/.test(error.message));
  assert.equal(HIGH.payloadReads+LOW.payloadReads,0);
 }finally{assert.equal(await disposeSettled(candidate),true,'dispose must settle after signal attachment failure');}
});

test('native signal own removeEventListener override cannot strand terminal cleanup',async()=>{
 const {candidate,HIGH,LOW}=await prepare(),controller=new AbortController();let calls=0;
 Object.defineProperty(controller.signal,'removeEventListener',{value(){calls++;throw Error('listener detach failed');}});
 try{
  await assert.rejects(candidate.sample({signal:controller.signal}));
  assert.equal(calls,0,'sampler must use captured native listener removal');
  assert.equal(candidate.stats().busy,false);
  await assert.rejects(candidate.sample({}),error=>!/busy/.test(error.message));
  assert.equal(HIGH.payloadReads+LOW.payloadReads,0);
 }finally{assert.equal(await disposeSettled(candidate),true,'dispose must settle after signal removal failure');}
});

test('native aborted state and reason cannot be hidden by signal own properties',async()=>{
 const {candidate}=await prepare(),controller=new AbortController(),reason=new Error('native abort reason');
 controller.abort(reason);
 Object.defineProperty(controller.signal,'throwIfAborted',{value(){}});
 Object.defineProperty(controller.signal,'aborted',{get(){return false;}});
 Object.defineProperty(controller.signal,'reason',{get(){throw Error('shadow reason getter must not run');}});
 try{
  await assert.rejects(candidate.sample({signal:controller.signal}),error=>error===reason);
  assert.equal(candidate.stats().busy,false);
 }finally{assert.equal(await disposeSettled(candidate),true);}
});

test('duck typed signal methods do not establish a native AbortSignal',async()=>{
 const {candidate}=await prepare(),fake={throwIfAborted(){},addEventListener(){},removeEventListener(){}};
 try{await assert.rejects(candidate.sample({signal:fake}),/Native AbortSignal/);assert.equal(candidate.stats().busy,false);}
 finally{assert.equal(await disposeSettled(candidate),true);}
});

test('native cancellation still relays its internal reason when signal methods and reason are shadowed',async()=>{
 const {candidate,HIGH,LOW}=await prepare(),controller=new AbortController(),reason=new Error('native cancellation remains observable');let calls=0;
 for(const key of ['addEventListener','removeEventListener'])Object.defineProperty(controller.signal,key,{value(){calls++;throw Error('shadow event method must not run');}});
 Object.defineProperty(controller.signal,'throwIfAborted',{value(){}});
 Object.defineProperty(controller.signal,'reason',{get(){throw Error('shadow reason must not run');}});
 const request=input(),noise=request.noise.slice();
 try{
  await assert.rejects(candidate.diagnose({...request,signal:controller.signal},{onTrace(trace){assert.equal(trace.name,'initialX');trace.data.fill(99);controller.abort(reason);}}),error=>error===reason);
  assert.equal(calls,0);assert.equal(candidate.stats().busy,false);assert.equal(candidate.stats().samples,0);assert.deepEqual(request.noise,noise);assert.equal(HIGH.payloadReads+LOW.payloadReads,0);
 }finally{assert.equal(await disposeSettled(candidate),true);}
});

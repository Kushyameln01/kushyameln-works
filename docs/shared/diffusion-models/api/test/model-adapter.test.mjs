// State/ownership tests only. The module mock performs no neural inference.
import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {BASE_MODEL_HASHES} from '../../lora/weights.mjs';
const created=[];
let prepareFailure=null,disposeFailure=false,describeFailure=false,delayPrediction=false;
const raw=()=>({dtype:'float32',shape:[1,16,1,2,4],layout:'NCTHW',meaning:'wan21-raw-generated-sample:v1',data:Float32Array.from({length:128},(_,i)=>i/128),latentContract:{schemaVersion:1,representation:'generated-sample',space:'raw',vaeModelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',producerModelSha256s:[BASE_MODEL_HASHES.HIGH,BASE_MODEL_HASHES.LOW],normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}}});
mock.module(new URL('../../execution/model-sampler-candidate.mjs',import.meta.url).href,{exports:{createBerniniModelSamplerCandidate:async({files,signal,wasmThreads})=>{
 if(prepareFailure)throw prepareFailure;
 const state={files,wasmThreads,disposed:false,predictions:[],samples:0,resources:{},statsFailure:false,executionFailure:null};created.push(state);
 return {
  describe:()=>{if(describeFailure)throw Error('injected describe failure');return {profile:'unit-state-double-not-NN',models:Object.fromEntries(['HIGH','LOW'].map(side=>[side,{model:{side,modelSha256:BASE_MODEL_HASHES[side]}}])),scheduler:'fixed-unit-double'};},
  stats:()=>{if(state.statsFailure)throw Error('injected stats failure');return {disposed:state.disposed,predictions:state.predictions.length,samples:state.samples,...state.resources};},
  async predict(input){assert.ok(input.signal instanceof AbortSignal);state.predictions.push(input.side);input.onProgress?.({operation:'predict',side:input.side,model:{stage:'block-complete',block:0}});if(state.executionFailure)throw state.executionFailure;if(delayPrediction)await new Promise((resolve,reject)=>input.signal.addEventListener('abort',()=>reject(input.signal.reason),{once:true}));return {...raw(),meaning:'bernini-flow-velocity:v1',latentContract:undefined,modelSha256:BASE_MODEL_HASHES[input.side],evidence:{profile:'unit-state-double-not-NN',publicRuntimeEnabled:false}};},
  async sample(input){assert.ok(input.signal instanceof AbortSignal);state.samples++;input.onProgress?.({stage:'step-complete',step:5});if(state.executionFailure)throw state.executionFailure;return {...raw(),evidence:{profile:'unit-state-double-not-NN',publicRuntimeEnabled:false}};},
  getWeightFeed(side){return state.weightFeed??{describe:()=>({side,epoch:0,logicalRegistry:{side,targets:[]}}),consumer:{currentEpoch:()=>0},baseProvider:{}};},
  async dispose(){if(disposeFailure)throw Error('injected disposal failure');await state.disposeWait;state.disposed=true;}
 };
}}});
let module;
try{module=await import('../model-adapter.mjs');}catch{}
const adapter=()=>{assert.equal(typeof module?.createModelAdapter,'function','Public model adapter is missing');return module.createModelAdapter();};
const files=()=>({HIGH:new Blob(['high']),LOW:new Blob(['low'])});

test('paired model load owns one runtime and switches sides through ordinary predict',async()=>{
 const owner=adapter(),pair=files(),loaded=await owner.execute('load',{files:pair});
 assert.equal(loaded.loaded,true);assert.ok(loaded.modelSessionId);
 await assert.rejects(owner.execute('load',{files:files()}),{code:'MODEL_ALREADY_LOADED'});
 const progress=[];
 for(const side of ['HIGH','LOW']){
  const result=await owner.execute('predict',{side,timestep:750,modelSessionId:loaded.modelSessionId},{onProgress:event=>progress.push(event)});
  assert.equal(result.tensor.meaning,'bernini-flow-velocity:v1');assert.equal(result.execution.publicWorkerConnected,true);assert.equal(result.execution.generationReady,false);assert.equal(result.tensor.evidence,undefined);
 }
 assert.deepEqual(created.at(-1).predictions,['HIGH','LOW']);assert.equal(progress.length,2);
 await owner.dispose();assert.equal(created.at(-1).disposed,true);
});

test('unloaded and stale model sessions fail before numerical dispatch',async()=>{
 const owner=adapter();await assert.rejects(owner.execute('sample',{}),{code:'MODEL_NOT_LOADED'});
 const first=await owner.execute('load',{files:files()});await owner.execute('unload',{});
 const second=await owner.execute('load',{files:files()});assert.notEqual(first.modelSessionId,second.modelSessionId);
 await assert.rejects(owner.execute('predict',{side:'HIGH',modelSessionId:first.modelSessionId}),{code:'STALE_MODEL'});
 assert.equal(created.at(-1).predictions.length,0);await owner.dispose();
});

test('explicit weight ports bind the current model and become stale after unload',async()=>{
 const {createDiffusionWeightClient}=await import('../weight-port.mjs'),owner=adapter();
 await assert.rejects(owner.execute('openWeightFeed',{side:'LOW'}),{code:'MODEL_NOT_LOADED'});
 const loaded=await owner.execute('load',{files:files()});
 await assert.rejects(owner.execute('openWeightFeed',{side:'OTHER',modelSessionId:loaded.modelSessionId}),{code:'INVALID_MODEL_INPUT'});
 await assert.rejects(owner.execute('openWeightFeed',{side:'LOW',modelSessionId:'old'}),{code:'STALE_MODEL'});
 const opened=await owner.execute('openWeightFeed',{side:'LOW',modelSessionId:loaded.modelSessionId}),client=await createDiffusionWeightClient({port:opened.port,binding:opened.binding});
 assert.equal(opened.binding.modelSessionId,loaded.modelSessionId);assert.equal((await client.describe()).side,'LOW');
 await owner.execute('unload',{});for(let i=0;i<20&&client.isValid();i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(client.isValid(),false);await owner.dispose();
});

test('unload aborts duplex validation before waiting for the runtime to drain it',async()=>{
 const {createDiffusionWeightClient}=await import('../weight-port.mjs'),owner=adapter();await owner.execute('load',{files:files()});const state=created.at(-1);let resolveDrain,entered=false,refs=1,timer;
 state.disposeWait=new Promise(resolve=>{resolveDrain=resolve;});state.weightFeed={describe:()=>({epoch:0}),stats:()=>({activePackageHash:null}),baseProvider:{},consumer:{currentEpoch:()=>0,async prepareLoad(pkg){return {pkg:pkg.retain('native-test')};},async validate(candidate,ctx){entered=true;try{return await candidate.pkg.readBlock('unit',0,1,{signal:ctx.signal});}finally{resolveDrain();}},async rollback(){},async releaseCandidate(candidate){await candidate.pkg.release();}}};
 const opened=await owner.execute('openWeightFeed',{side:'LOW'}),client=await createDiffusionWeightClient({port:opened.port}),pkg={describe:()=>({}),isValid:()=>true,retain(){refs++;return {describe:this.describe,isValid:this.isValid,readBlock:this.readBlock,async release(){refs--;}};},async readBlock(id,offset,count,{signal}){await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},async release(){refs--;}};
 try{
  const candidate=await client.consumer.prepareLoad(pkg),validation=client.consumer.validate(candidate).catch(error=>error);while(!entered)await new Promise(resolve=>setImmediate(resolve));
  await Promise.race([owner.execute('unload',{}),new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('unload waited for a port that it had not aborted')),500);})]);clearTimeout(timer);assert.equal((await validation).code,'STALE_MODEL');
  await client.dispose();await pkg.release();assert.equal(refs,0);assert.equal(state.disposed,true);
 }finally{clearTimeout(timer);resolveDrain();await owner.dispose();}
});

test('a direct weight-port cleanup failure blocks the next prediction without a status query',async()=>{
 const {createDiffusionWeightClient}=await import('../weight-port.mjs'),owner=adapter();await owner.execute('load',{files:files()});const state=created.at(-1);
 state.weightFeed={describe:()=>({epoch:0}),stats:()=>({activePackageHash:null}),baseProvider:{},consumer:{currentEpoch:()=>0},async clear(){state.resources.weightFeeds={LOW:{cleanupPending:1}};throw Object.assign(Error('package release failed'),{code:'PACKAGE_RELEASE_FAILED'});}};
 const opened=await owner.execute('openWeightFeed',{side:'LOW'}),client=await createDiffusionWeightClient({port:opened.port});
 try{await assert.rejects(client.clear(),{code:'PACKAGE_RELEASE_FAILED'});await assert.rejects(owner.execute('predict',{side:'LOW'}),{code:'MODEL_CLEANUP_REQUIRED'});assert.equal(state.predictions.length,0);}
 finally{await owner.execute('unload',{});await client.dispose();await owner.dispose();}
});

test('failed preparation leaves the adapter loadable and failed unload remains retryable',async()=>{
 const owner=adapter();prepareFailure=Error('preparation failure');
 await assert.rejects(owner.execute('load',{files:files()}),/preparation failure/);prepareFailure=null;
 await owner.execute('load',{files:files()});disposeFailure=true;
 await assert.rejects(owner.execute('unload',{}),/disposal failure/);
 disposeFailure=false;await owner.execute('unload',{});assert.equal((await owner.execute('modelStatus',{})).loaded,false);await owner.dispose();
});

test('normal model requests reject diagnostic/callback fields instead of requiring or ignoring them',async()=>{
 const owner=adapter();await owner.execute('load',{files:files()});
 for(const extra of [{reference:{}},{gate:{}},{receipt:{}},{signal:new AbortController().signal},{onProgress(){}}])await assert.rejects(owner.execute('sample',{...extra}),{code:'INVALID_MODEL_INPUT'});
 assert.equal(created.at(-1).samples,0);await owner.dispose();
});

test('canonical generated sample save and actual Blob readback preserve every payload bit and meaning',async()=>{
 const owner=adapter();await owner.execute('load',{files:files()});const output=await owner.execute('sample',{});
 const tensor=output.tensor,before=new Uint32Array(tensor.data.buffer).slice();
 const saved=await owner.execute('saveTensor',{tensor});assert.ok(saved.bytes instanceof Uint8Array);assert.equal(saved.byteLength,saved.bytes.length);
 const restored=await owner.execute('readTensor',{file:new File([saved.bytes],'saved.wktensor')});
 assert.deepEqual(new Uint32Array(restored.tensor.data.buffer),before);assert.deepEqual(new Uint32Array(tensor.data.buffer),before);assert.equal(restored.tensor.meaning,'wan21-raw-generated-sample:v1');assert.deepEqual(restored.tensor.latentContract,tensor.latentContract);assert.equal(restored.tensor.normalization,undefined);await owner.dispose();
});

test('codec bound is separate from pointwise budget and rejects oversize before file read',async()=>{
 const owner=adapter(),tensor={dtype:'float32',shape:[1048577],layout:'C',meaning:'unit-codec-payload',data:new Float32Array(1048577)};
 assert.ok((await owner.execute('saveTensor',{tensor})).byteLength>4194304);
 const huge=new Blob([new Uint8Array(64*1024*1024+1)]);await assert.rejects(owner.execute('readTensor',{file:huge}),{code:'TENSOR_FILE_BUDGET_EXCEEDED'});await owner.dispose();
});

test('preparation cleanup failure retains the only disposal capability for retry',async()=>{
 const owner=adapter();describeFailure=true;disposeFailure=true;
 try{await assert.rejects(owner.execute('load',{files:files()}),{code:'MODEL_PREPARATION_CLEANUP_FAILED'});}finally{describeFailure=false;disposeFailure=false;}
 const state=await owner.execute('modelStatus',{});assert.equal(state.loaded,false);assert.equal(state.cleanupRequired,true);
 await assert.rejects(owner.execute('predict',{side:'HIGH'}),{code:'MODEL_CLEANUP_REQUIRED'});
 await owner.execute('unload',{});assert.equal(created.at(-1).disposed,true);await owner.execute('load',{files:files()});await owner.dispose();
});

test('a factory rejection never returns a cleanup owner to the direct adapter',async()=>{
 const owner=adapter(),before=created.length,error=new AggregateError([Error('partial preparation'),Error('cleanup failed')],'factory preparation and cleanup failed');
 let recovered=false;error.recover=async()=>{recovered=true;};prepareFailure=error;
 try{await assert.rejects(owner.execute('load',{files:files()}),failure=>failure===error);}finally{prepareFailure=null;}
 assert.equal(created.length,before);assert.equal(owner.status().loaded,false);assert.equal(owner.status().resources,null);
 await owner.execute('unload',{});assert.equal(recovered,false,'the direct adapter received no owner; its public host must discard this Worker');await owner.dispose();
});

for(const [label,resources] of [
 ['ops cleanup pending',{ops:{cleanupPending:true}}],
 ['ops closing',{ops:{closing:true}}],
 ['HIGH closing',{models:{HIGH:{closing:true},LOW:{closing:false}}}],
 ['LOW cleanup pending',{models:{HIGH:{closing:false},LOW:{cleanupPending:true}}}]
])for(const op of ['predict','sample'])test(op+' failure latches cleanup required for '+label,async()=>{
 const owner=adapter();await owner.execute('load',{files:files()});const state=created.at(-1);state.resources=resources;state.executionFailure=Error('execution cleanup failed');
 try{
  await assert.rejects(owner.execute(op,{...(op==='predict'?{side:'HIGH'}:{})}),{code:'MODEL_CLEANUP_REQUIRED'});
  state.resources={};state.executionFailure=null;
  const status=owner.status();assert.equal(status.loaded,false);assert.equal(status.cleanupRequired,true);
  const dispatched=state.predictions.length+state.samples;
  for(const next of ['predict','sample'])await assert.rejects(owner.execute(next,{}),{code:'MODEL_CLEANUP_REQUIRED'});
  assert.equal(state.predictions.length+state.samples,dispatched,'cleanup latch must prevent further numerical dispatch');
  disposeFailure=true;await assert.rejects(owner.execute('unload',{}),{code:'MODEL_UNLOAD_FAILED'});assert.equal(owner.status().cleanupRequired,true);
  disposeFailure=false;await owner.execute('unload',{});assert.equal(state.disposed,true);assert.equal(owner.status().cleanupRequired,false);
 }finally{disposeFailure=false;await owner.dispose();}
});

for(const op of ['predict','sample'])test(op+' input failure with healthy resources preserves the loaded owner',async()=>{
 const owner=adapter(),loaded=await owner.execute('load',{files:files()}),state=created.at(-1),error=new RangeError('invalid timestep or input');state.executionFailure=error;
 try{
  await assert.rejects(owner.execute(op,{}),failure=>failure===error);const status=owner.status();
  assert.equal(status.loaded,true);assert.equal(status.cleanupRequired,false);assert.equal(status.modelSessionId,loaded.modelSessionId);
  state.executionFailure=null;await owner.execute('predict',{side:'HIGH',modelSessionId:loaded.modelSessionId});
 }finally{await owner.dispose();}
});

test('unreadable resource stats after execution failure require cleanup without stranding unload',async()=>{
 const owner=adapter();await owner.execute('load',{files:files()});const state=created.at(-1);state.statsFailure=true;state.executionFailure=Error('execution failed');
 try{
  await assert.rejects(owner.execute('predict',{side:'HIGH'}),{code:'MODEL_CLEANUP_REQUIRED'});
  assert.equal(owner.status().cleanupRequired,true);assert.equal(owner.status().resources,null);
  const unloaded=await owner.execute('unload',{});assert.equal(unloaded.unloaded,true);assert.equal(unloaded.resources,null);assert.equal(state.disposed,true);
  assert.equal(owner.status().loaded,false);assert.equal(owner.status().cleanupRequired,false);
 }finally{state.statsFailure=false;await owner.dispose();}
});

test('unreadable status counters conservatively block dispatch but successful disposal still unloads',async()=>{
 const owner=adapter();await owner.execute('load',{files:files()});const state=created.at(-1);state.statsFailure=true;
 try{
  const status=owner.status();assert.equal(status.loaded,false);assert.equal(status.cleanupRequired,true);assert.equal(status.resources,null);
  await assert.rejects(owner.execute('sample',{}),{code:'MODEL_CLEANUP_REQUIRED'});assert.equal(state.samples,0);
  await owner.execute('unload',{});assert.equal(state.disposed,true);assert.equal(owner.status().cleanupRequired,false);
 }finally{state.statsFailure=false;await owner.dispose();}
});

test('dispose aborts an active model operation then awaits cleanup without a busy lock leak',async()=>{
 const owner=adapter();await owner.execute('load',{files:files()});delayPrediction=true;
 try{
  const pending=owner.execute('predict',{side:'HIGH'}),rejected=assert.rejects(pending,{name:'AbortError'});await owner.dispose();await rejected;
  assert.equal(created.at(-1).disposed,true);assert.equal(owner.status().busy,false);assert.equal(owner.status().disposed,true);
 }finally{delayPrediction=false;}
});

test('canonical save rejects a shared attention mask even when an own buffer property conceals it',async()=>{
 const owner=adapter(),mask=new Uint8Array(new SharedArrayBuffer(2));mask.set([1,0]);Object.defineProperty(mask,'buffer',{value:new ArrayBuffer(2)});
 const tensor={dtype:'float32',shape:[1,2,4096],layout:'BLC',meaning:'text_hidden_states',data:new Float32Array(8192),attentionMask:mask};
 await assert.rejects(owner.execute('saveTensor',{tensor}),{code:'INVALID_TENSOR'});await owner.dispose();
});

test('explicit four-thread resource requires isolated SharedArrayBuffer environment and never falls back',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crossOriginIsolated'),owner=adapter(),before=created.length;
 try{
  Object.defineProperty(globalThis,'crossOriginIsolated',{value:false,configurable:true});
  await assert.rejects(owner.execute('load',{files:files(),resource:{wasmThreads:4}}),{code:'UNSUPPORTED_RESOURCE_CONFIG'});assert.equal(created.length,before);
  Object.defineProperty(globalThis,'crossOriginIsolated',{value:true,configurable:true});
  const loaded=await owner.execute('load',{files:files(),resource:{wasmThreads:4}});assert.equal(created.at(-1).wasmThreads,4);assert.equal(loaded.resource.wasmThreads,4);await owner.execute('unload',{});
  await assert.rejects(owner.execute('load',{files:files(),resource:{wasmThreads:2}}),{code:'UNSUPPORTED_RESOURCE_CONFIG'});
 }finally{if(descriptor)Object.defineProperty(globalThis,'crossOriginIsolated',descriptor);else delete globalThis.crossOriginIsolated;await owner.dispose();}
});

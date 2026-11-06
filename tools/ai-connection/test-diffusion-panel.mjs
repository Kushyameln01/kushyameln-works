import test from 'node:test';
import assert from 'node:assert/strict';
const path=new URL('../../docs/ai-connection/diffusion.mjs',import.meta.url).href;
const ui=await import(path).catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const {describeNormalGenerationInputs}=await import('../../docs/shared/ai-connection/native/diffusion-pages-20261106/docs/shared/diffusion-models/execution/sample-initialization.mjs');
const {deriveWorkflowShapes}=await import('../../docs/shared/ai-connection/native/diffusion-pages-20261106/docs/shared/ai-connection/workflow-shapes.mjs');

test('sample planning changes only requested target dimensions in an owned template',()=>{
 assert.equal(typeof ui.buildSamplePlan,'function');
 const normalInputs=describeNormalGenerationInputs(),before=structuredClone(normalInputs);
 const plan=ui.buildSamplePlan({normalInputs},{width:48,height:32,frames:5},deriveWorkflowShapes);
 assert.deepEqual(plan.shapeRequest.target,{batch:1,width:48,height:32,frames:5});
 assert.deepEqual(plan.shapePlan.target.initialLatentShape,[1,16,2,4,6]);
 assert.deepEqual(plan.shapeRequest.media,before.defaults.shapeRequest.media);
 assert.deepEqual(normalInputs,before);
 assert.throws(()=>ui.buildSamplePlan({}, {width:32,height:16,frames:1},deriveWorkflowShapes),{code:'NORMAL_INPUTS_UNAVAILABLE'});
});

test('conditioning descriptor preserves all rows and source metadata without transforming payloads',()=>{
 assert.equal(typeof ui.conditioningDescriptor,'function');
 const source={dtype:'float32',shape:[1,512,4096],layout:'BLC',meaning:'text_hidden_states',normalization:'umt5-final-rmsnorm-f32-v1',modelSha256:'a'.repeat(64),tokenizerSha256:'b'.repeat(64),data:new Float32Array([9]),attentionMask:new Uint8Array(512).fill(1)};
 const descriptor=ui.conditioningDescriptor(source);
 assert.deepEqual(descriptor.attentionMask,{dtype:'uint8',shape:[512]});
 assert.deepEqual(descriptor.shape,[1,512,4096]);assert.equal(descriptor.normalization,source.normalization);
 assert.equal('data' in descriptor,false);assert.equal(source.data[0],9);assert.equal(source.attentionMask.length,512);
 descriptor.shape[1]=1;assert.equal(source.shape[1],512);
});

test('generated raw filename requires a raw restored generated-sample contract',()=>{
 assert.equal(typeof ui.resultFilename,'function');
 const tensor={meaning:'wan21-raw-generated-sample:v1',latentContract:{representation:'generated-sample',space:'raw',normalization:{state:'restored',owner:'diffusion_models',id:'wan21-comfy-f32-v1'}}};
 assert.equal(ui.resultFilename(tensor),'diffusion-raw-generated-sample.wktensor');
 assert.equal(ui.resultFilename({meaning:'raw-posterior-mean'}),'diffusion-tensor.wktensor');
 assert.equal(ui.resultFilename({...tensor,latentContract:{...tensor.latentContract,space:'model'}}),'diffusion-tensor.wktensor');
});

const constants={protocolVersion:'diffusion-models/0.1',buildId:'fixed-build'};
const reply=(q,status='ok',value={})=>({...q,status,...(status==='ok'?{result:value}:{error:value})});
test('cancel targets the exact active request and waits for its original terminal reply',async()=>{
 assert.equal(typeof ui.createRequestSession,'function');
 let command,finish,cancelTarget;const api={sessionId:'session-1',request(q){command=q;return new Promise(resolve=>{finish=resolve;});},cancel(target){cancelTarget=target;return {status:'ok',result:{cancelled:true}};},dispose(){}};
 const session=ui.createRequestSession(api,constants),pending=session.request('sample',{positive:{}});pending.catch(()=>{});
 assert.equal(session.active.request,command);assert.throws(()=>session.request('readTensor',{}),{code:'BUSY'});
 let ended=false;const cancellation=session.cancel().then(()=>{ended=true;});await Promise.resolve();
 assert.deepEqual(cancelTarget,{sessionId:'session-1',jobId:command.jobId,inputRevision:command.inputRevision});assert.equal(ended,false);assert.ok(session.active);
 finish(reply(command,'error',{code:'CANCELLED',message:'terminated'}));await assert.rejects(pending,{code:'CANCELLED'});await cancellation;
 assert.equal(session.active,null);assert.equal(ended,true);
});

test('request session rejects a foreign reply and ignores progress after terminal',async()=>{
 assert.equal(typeof ui.createRequestSession,'function');let q,observer;const progress=[];
 const api={sessionId:'session-2',request(command,options){q=command;observer=options.onProgress;observer(reply(q,'progress',{step:1}));return Promise.resolve(reply({...q,jobId:'foreign'}));},dispose(){}};
 const session=ui.createRequestSession(api,constants,{onProgress:event=>progress.push(event)});
 await assert.rejects(session.request('modelStatus',{}),{code:'INVALID_RESPONSE'});assert.equal(progress.length,1);
 observer(reply(q,'progress',{step:2}));assert.equal(progress.length,1);session.dispose();assert.equal(session.disposed,true);
 assert.throws(()=>session.request('capabilities',{}),{code:'DISPOSED'});
});

test('target planning rejects canonical frame loss, spatial loss and patch padding',()=>{
 const capability={normalInputs:describeNormalGenerationInputs()};
 assert.throws(()=>ui.buildSamplePlan(capability,{width:33,height:16,frames:1},deriveWorkflowShapes),{code:'UNSUPPORTED_TARGET_GEOMETRY'});
 assert.throws(()=>ui.buildSamplePlan(capability,{width:32,height:16,frames:2},deriveWorkflowShapes),{code:'UNSUPPORTED_TARGET_GEOMETRY'});
 assert.throws(()=>ui.buildSamplePlan(capability,{width:24,height:16,frames:1},deriveWorkflowShapes),{code:'UNSUPPORTED_PADDING'});
});

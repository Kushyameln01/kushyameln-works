import test from 'node:test';
import assert from 'node:assert/strict';
import {describeExecutionCapabilities,checkExecutionSupport,P4_SHAPES,P4_LIMITS,P4_INPUT_SEMANTICS,POINTWISE_MAX_ELEMENTS} from './capabilities.mjs';
import {requireWanRawLatent,requireWanRawLatentF1,requireWanRawLatentRect} from '../tensor-interop.mjs';

const request=()=>({operation:'postSelfAttention',model:{side:'HIGH'},blockIndex:0,contextLatents:[],inputs:{...structuredClone(P4_INPUT_SEMANTICS),conditioning:{...structuredClone(P4_INPUT_SEMANTICS.conditioning),shape:[1,512,4096]}}});
const codes=value=>checkExecutionSupport(value).reasons.map(reason=>reason.code);
test('P4 metadata support is shape-bounded and independent of sample hashes or receipts',()=>{
 for(const side of ['HIGH','LOW'])for(const L of [1,4,512]){const q=request();q.model.side=side;q.inputs.conditioning.shape[1]=L;const result=checkExecutionSupport(q);assert.equal(result.supported,true);assert.deepEqual(result.reasons,[]);assert.equal(result.validation,'metadata-only');assert.equal(result.modelInference,false);assert.equal(result.generationReady,false);}
 const capabilities=describeExecutionCapabilities();assert.deepEqual(capabilities.operations.postSelfAttention.shapes,P4_SHAPES);assert.equal(capabilities.operations.postSelfAttention.producerAuthentication,false);assert.equal(capabilities.operations.validateConditioning.maxTensorElements,2097152);assert.equal(capabilities.pointwiseMaxTensorElements,POINTWISE_MAX_ELEMENTS);
 assert.deepEqual(capabilities.operations.postSelfAttention.limits,P4_LIMITS);assert.equal(P4_LIMITS.maxDecodeElements,81920);assert.equal(P4_LIMITS.maxProjectionRows,16);assert.equal(P4_LIMITS.ffnDownMaxWeightRows,4);assert.equal(P4_LIMITS.ffnDownInner,13824);assert.equal(P4_LIMITS.graphQueryRows,2);assert.equal(P4_LIMITS.keyChunkMax,64);assert.equal(P4_LIMITS.aggregatePeakMeasured,false);assert.equal(P4_LIMITS.aggregatePeakBytes,null);
 for(const control of ['prepareP4','runP4','releaseP4','checkSupport']){assert.equal(capabilities.controls[control].available,true);assert.deepEqual(capabilities.controls[control].transport,['direct','message-port']);}
 assert.ok(codes({operation:'runP4'}).includes('UNSUPPORTED_OPERATION'));
});
test('capability snapshots cannot mutate the shared runtime extents',()=>{
 const a=describeExecutionCapabilities();a.operations.postSelfAttention.shapes.residual[0]=32760;a.operations.postSelfAttention.inputs.residual.meaning='changed';a.models.HIGH='changed';
 const b=describeExecutionCapabilities();assert.equal(b.operations.postSelfAttention.shapes.residual[0],2);assert.equal(b.operations.postSelfAttention.inputs.residual.meaning,'bernini-block0-post-self-attention-hidden:v1');assert.notEqual(b.models.HIGH,'changed');assert.ok(Object.isFrozen(P4_SHAPES.residual));
});
test('unsupported production shape, context, block, dtype and model report extensions',()=>{
 const cases=[
  ['UNSUPPORTED_SHAPE',q=>{q.inputs.residual.shape=[32760,5120];}],
  ['UNSUPPORTED_SHAPE',q=>{q.inputs.residual.shape=[1,2,5120];}],
  ['UNSUPPORTED_SHAPE',q=>{q.inputs.conditioning.shape=[1,513,4096];}],
  ['UNSUPPORTED_CONTEXT',q=>{q.contextLatents=[{shape:[1,16,21,60,104]}];}],
  ['UNSUPPORTED_CONTEXT',q=>{q.contextLatents={};}],
  ['UNSUPPORTED_BLOCK',q=>{q.blockIndex=1;}],
  ['UNSUPPORTED_DTYPE',q=>{q.inputs.residual.dtype='float16';}],
  ['UNSUPPORTED_MODEL',q=>{q.model.side='UNKNOWN';}],
  ['UNSUPPORTED_MODEL',q=>{delete q.model;}],
  ['MODEL_IDENTITY_MISMATCH',q=>{q.model.modelSha256='0'.repeat(64);}],
  ['MODEL_IDENTITY_MISMATCH',q=>{delete q.inputs.conditioning.modelSha256;}],
  ['TOKENIZER_IDENTITY_MISMATCH',q=>{delete q.inputs.conditioning.tokenizerSha256;}],
  ['TOKENIZER_IDENTITY_MISMATCH',q=>{q.inputs.conditioning.tokenizerSha256='0'.repeat(64);}],
  ['UNSUPPORTED_NORMALIZATION',q=>{q.inputs.conditioning.normalization='none';}],
  ['UNSUPPORTED_NORMALIZATION',q=>{q.inputs.residual.normalization='wan21-comfy-f32-v1';}],
  ['SEMANTIC_MISMATCH',q=>{q.inputs.residual.meaning='raw-posterior-mean';}],
  ['UNSUPPORTED_LAYOUT',q=>{q.inputs.residual.layout='BLC';}]
 ];
 for(const [code,change] of cases){const q=request();change(q);const result=checkExecutionSupport(q);assert.equal(result.supported,false,code);assert.ok(result.reasons.some(reason=>reason.code===code),code);for(const reason of result.reasons){assert.equal(typeof reason.message,'string');assert.ok(reason.requiredExtension);}}
});
test('missing semantics and inputs are refused without native allocation',()=>{
 const q=request();delete q.inputs.timeAct1;delete q.inputs.conditioning.normalization;assert.ok(codes(q).includes('MISSING_INPUT'));assert.ok(codes(q).includes('UNSUPPORTED_NORMALIZATION'));
 assert.deepEqual(codes({operation:'arbitraryModelOperator'}),['UNSUPPORTED_OPERATION']);assert.deepEqual(codes(null),['INVALID_DESCRIPTOR']);
 assert.deepEqual(codes({operation:'load'}),['MODEL_PAIR_REQUIRED']);
 for(const operation of ['predict','sample']){const result=checkExecutionSupport({operation});assert.equal(result.implemented,true);assert.equal(result.executableRoute,true);assert.equal(result.supported,false);assert.ok(codes({operation}).includes('MISSING_SHAPE_REQUEST'));assert.ok(!codes({operation}).includes('NOT_READY'));}
});
test('three exact mean profiles stay separate from generated samples and equal-count reshapes',()=>{
 const capabilities=describeExecutionCapabilities();
 for(const profile of capabilities.operations.normalizeRawMean.profiles){
  const tensor={...profile};
  assert.equal(checkExecutionSupport({operation:'normalizeRawMean',inputs:{tensor}}).supported,true);
  const restored={...tensor,meaning:'wan21-normalized-posterior-mean:v1',normalization:'wan21-comfy-f32-v1'};
  assert.equal(checkExecutionSupport({operation:'restoreRawMean',inputs:{tensor:restored}}).supported,true);
 }
 const tensor={dtype:'float32',shape:[1,16,1,2,4],layout:'NCTHW',meaning:'wan21-raw-generated-sample:v1',normalization:'none'};
 assert.ok(codes({operation:'normalizeRawMean',inputs:{tensor}}).includes('SEMANTIC_MISMATCH'));
 tensor.meaning='raw-posterior-mean';tensor.shape=[1,16,1,1,8];assert.ok(codes({operation:'normalizeRawMean',inputs:{tensor}}).includes('UNSUPPORTED_SHAPE'));
 tensor.shape=[1,16,1,2,4];assert.ok(codes({operation:'validateRawLatent',inputs:{tensor}}).includes('MODEL_IDENTITY_MISMATCH'));
});
test('mean marker descriptors match canonical shared codec498 guards for every profile',()=>{
 const capabilities=describeExecutionCapabilities(),guards=[requireWanRawLatent,requireWanRawLatentF1,requireWanRawLatentRect];
 capabilities.operations.validateRawLatent.profiles.forEach((profile,i)=>{
  const data=new Float32Array(profile.shape.reduce((a,b)=>a*b,1));
  assert.equal(profile.normalizationMarkerState,'absent');
  for(const normalization of ['none','wan21-comfy-f32-v1']){
   const tensor={...profile,data,normalization};
   assert.throws(()=>guards[i](tensor),/normalization|normalized\/generated metadata/);assert.ok(codes({operation:'validateRawLatent',inputs:{tensor}}).includes('UNSUPPORTED_NORMALIZATION'));
   assert.ok(codes({operation:'normalizeRawMean',inputs:{tensor}}).includes('UNSUPPORTED_NORMALIZATION'));
  }
  const generatedMetadata={...profile,data,latentContract:{representation:'generated-sample'}};
  assert.throws(()=>guards[i](generatedMetadata));assert.ok(codes({operation:'validateRawLatent',inputs:{tensor:generatedMetadata}}).includes('SEMANTIC_MISMATCH'));
 });
 assert.equal(capabilities.operations.normalizeRawMean.normalizationMarkerState,'absent');
});
test('pointwise 1M budget does not reject published 2M-element Text conditioning',()=>{
 const latent={dtype:'float32',shape:[1,16,21,60,104]};assert.ok(codes({operation:'noiseMix',inputs:{latent,noise:latent}}).includes('TENSOR_BUDGET_EXCEEDED'));
 const exact={dtype:'float32',shape:[POINTWISE_MAX_ELEMENTS]};assert.equal(checkExecutionSupport({operation:'flowDenoised',inputs:{input:exact,velocity:exact}}).supported,true);
 const tensor={dtype:'float32',shape:[1,512,4096],layout:'BLC',meaning:'text_hidden_states',modelSha256:P4_INPUT_SEMANTICS.conditioning.modelSha256};assert.equal(checkExecutionSupport({operation:'validateConditioning',inputs:{tensor}}).supported,true);
 delete tensor.modelSha256;assert.ok(codes({operation:'validateConditioning',inputs:{tensor}}).includes('MODEL_IDENTITY_MISMATCH'));
 const unequal={...exact,shape:[2]};assert.ok(codes({operation:'eulerStep',inputs:{latent:exact,denoised:unequal}}).includes('UNSUPPORTED_SHAPE'));
 const empty={dtype:'float32',shape:[0]};assert.equal(checkExecutionSupport({operation:'eulerStep',inputs:{latent:empty,denoised:empty}}).supported,true);
 for(const operation of ['noiseMix','inverseNoiseScale','flowDenoised'])assert.ok(codes({operation,inputs:{latent:empty,noise:empty,input:empty,velocity:empty}}).includes('UNSUPPORTED_SHAPE'));
 assert.deepEqual(describeExecutionCapabilities().operations.eulerStep.emptyShape,[0]);
});
test('legacy partial projections and fixed scheduler retain explicit dimensions/profile',()=>{
 for(const operation of ['linearProjection','linearProjectionF32']){
  const name=operation==='linearProjection'?'q':'weight',q={operation,inputs:{[name]:{dtype:operation==='linearProjection'?'uint8':'float32',shape:[16,5120]},x:{dtype:'float32',shape:[5120]},bias:{dtype:'float32',shape:[16]}}};
  assert.equal(checkExecutionSupport(q).supported,true);q.inputs[name].shape=[5120,16];assert.ok(codes(q).includes('UNSUPPORTED_SHAPE'));
 }
 assert.equal(checkExecutionSupport({operation:'schedule',profile:'bernini-comfy-simple6-shift5-v1'}).supported,true);assert.deepEqual(codes({operation:'schedule',profile:'other'}),['UNSUPPORTED_PROFILE']);
});

test('P4 accepts the published Text RMSNorm ID and preserves its old descriptive alias',()=>{
 for(const normalization of ['umt5-final-rmsnorm-f32-v1','encoder-final-rmsnorm']){const q=request();q.inputs.conditioning.normalization=normalization;assert.equal(checkExecutionSupport(q).supported,true);}
 const q=request();q.inputs.conditioning.normalization='encoder-final-rmsnorm';assert.ok(codes({operation:'validateConditioning',inputs:{tensor:q.inputs.conditioning}}).includes('UNSUPPORTED_NORMALIZATION'));
});

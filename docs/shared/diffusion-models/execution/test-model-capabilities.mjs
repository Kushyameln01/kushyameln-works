import test from 'node:test';
import assert from 'node:assert/strict';
import {describeExecutionCapabilities,checkExecutionSupport,P4_INPUT_SEMANTICS} from './capabilities.mjs';
import {deriveWorkflowShapes,BERNINI_WORKFLOW_RULE_ID} from '../../ai-connection/workflow-shapes.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';
import {WAN21_VAE_SHA256} from '../tensor-interop.mjs';

// Metadata only: this file allocates no model/latent payload or native owner.
function request(operation='predict',{full=false,frames=1,height=16,width=32}={}){
 const absent=()=>({state:'absent'}),semantics=Object.fromEntries(['target-latent','source-latent','reference-latent','context-latent'].map(role=>[role,{meaning:role==='target-latent'?'bernini-generated-model-latent:v1':'wan21-normalized-posterior-mean:v1',normalization:'wan21-comfy-f32-v1'}]));
 const shapeRequest={ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:full?81:frames,height:full?480:height,width:full?832:width},refMaxSize:848,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],temporalRule:'first-then-groups-floor',patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',concatOrder:'target-first',paddingMode:'none'},semantics,media:{sourceVideo:full?{state:'present',rgb:{frames:81,height:480,width:832}}:absent(),referenceVideo:absent(),slots:full?[0,1,2].map(slotIndex=>({slotIndex,wired:{state:'present',rgb:{frames:1,height:848,width:848}},editor:absent()})):[]}};
 const canonical=deriveWorkflowShapes(shapeRequest),ids=['target.latent',...canonical.orderedContexts.entries.map(entry=>entry.contextKey+'.latent')];
 const tensors=ids.map(id=>{const r=canonical.requirements.find(value=>value.requirementId===id);return {requirementId:id,dtype:r.dtype,shape:[...r.shape],axes:[...r.axes],layout:'NCTHW',meaning:r.meaning,normalization:r.normalization};});
 const text=()=>({...structuredClone(P4_INPUT_SEMANTICS.conditioning),shape:[1,512,4096],attentionMask:{dtype:'uint8',shape:[512]}});
 return {operation,shapeRequest,...(operation==='predict'?{model:{side:'HIGH'},timestep:750,inputs:{tensors,conditioning:text()}}:{inputs:{tensors,noise:{dtype:'float32',shape:[...tensors[0].shape]},positive:text(),negative:text()}})};
}
const reasons=q=>checkExecutionSupport(q).reasons.map(value=>value.code);

test('public model routes are implemented while accepted public domains remain empty',()=>{
 const capabilities=describeExecutionCapabilities();
 assert.equal(capabilities.modelRoutesImplemented,true);assert.equal(capabilities.modelInference,false);assert.equal(capabilities.generationReady,false);assert.equal(capabilities.acceptedProduction,false);assert.deepEqual(capabilities.confirmedPublicInputDomains,[]);
 for(const name of ['load','predict','sample']){
  const value=capabilities.operations[name];assert.equal(value.available,true);assert.equal(value.implemented,true);assert.equal(value.executableRoute,true);assert.equal(value.acceptedProduction,false);assert.equal(value.generationReady,false);assert.deepEqual(value.confirmedPublicInputDomains,[]);assert.equal(value.numericalAcceptance,'NOT_ESTABLISHED');assert.equal(value.reason,undefined);
 }
 assert.deepEqual(capabilities.operations.load.requiredModels,['HIGH','LOW']);
 assert.equal(capabilities.operations.predict.planning.kind,'allocation-planning-cap-only');assert.equal(capabilities.operations.predict.planning.validatedInputDomain,false);assert.equal(capabilities.operations.predict.planning.aggregatePeakMeasured,false);
 assert.equal(capabilities.operations.sample.schedule.steps,6);assert.equal(capabilities.operations.sample.schedule.splitStep,3);assert.equal(capabilities.operations.sample.schedule.cfg,1);assert.equal(capabilities.operations.sample.targetMaxElements,4194304);
 capabilities.operations.predict.planning.maxSequenceTokens=1;assert.equal(describeExecutionCapabilities().operations.predict.planning.maxSequenceTokens,90000);
});

test('load metadata requires the HIGH/LOW pair without inspecting File payloads',()=>{
 const q={operation:'load',models:{HIGH:{modelSha256:BASE_MODEL_HASHES.HIGH},LOW:{modelSha256:BASE_MODEL_HASHES.LOW}},resource:{wasmThreads:4}};
 Object.defineProperty(q,'files',{get(){assert.fail('Metadata support cannot read model files');}});
 const result=checkExecutionSupport(q);assert.equal(result.supported,true);assert.equal(result.structurallyAdmitted,true);assert.equal(result.numericallyAccepted,false);assert.ok(result.structure.requiredEnvironment.includes('crossOriginIsolated'));
 delete q.models.LOW;assert.ok(reasons(q).includes('MODEL_PAIR_REQUIRED'));q.models.LOW={modelSha256:'0'.repeat(64)};assert.ok(reasons(q).includes('MODEL_IDENTITY_MISMATCH'));
 q.models.LOW.modelSha256=BASE_MODEL_HASHES.LOW;q.resource.wasmThreads=2;assert.ok(reasons(q).includes('UNSUPPORTED_RESOURCE_CONFIG'));
});

test('complete shared context population admits the declared full shape structurally only',()=>{
 for(const operation of ['predict','sample']){
  const q=request(operation,{full:true});
  q.contextLatents=q.inputs.tensors.slice(1).map(value=>({requirementId:value.requirementId,shape:[...value.shape]}));
  for(const tensor of q.inputs.tensors)Object.defineProperty(tensor,'data',{get(){assert.fail('Metadata check must not read latent payloads');}});
  for(const name of operation==='predict'?['conditioning']:['positive','negative'])Object.defineProperty(q.inputs[name],'data',{get(){assert.fail('Metadata check must not read Text payloads');}});
  const result=checkExecutionSupport(q);assert.deepEqual(result.reasons,[]);assert.equal(result.supported,true);assert.equal(result.supportKind,'structural-admission-only');assert.equal(result.numericallyAccepted,false);assert.equal(result.modelInference,false);assert.equal(result.generationReady,false);assert.deepEqual(result.confirmedPublicInputDomains,[]);
  assert.deepEqual(result.structure.targetShape,[1,16,21,60,104]);assert.equal(result.structure.totalTokens,73947);assert.equal(result.structure.contextTokens,41187);assert.equal(result.structure.targetTokens,32760);assert.deepEqual(result.structure.orderedContextKeys,['source','context:0:0','context:1:0','context:2:0']);assert.deepEqual(result.structure.orderedSourceIds,[1,2,3,4]);assert.equal(result.structure.planning.plannedHiddenStoreBytes,1514434560);assert.equal(result.structure.planning.plannedFourHiddenStoreBytes,6057738240);
 }
});

test('shape admission follows the shared rule then rejects unsupported sequence boundaries',()=>{
 const cases=[
  ['UNSUPPORTED_PADDING',q=>{q.shapeRequest.target.width=24;}],
  ['UNSUPPORTED_GEOMETRY',q=>{q.shapeRequest.geometry.patchSize=[1,1,2];}],
  ['UNSUPPORTED_GEOMETRY',q=>{q.shapeRequest.target.batch=2;}],
  ['INCOMPLETE_CONTEXT',q=>{q.shapeRequest.media.sourceVideo={state:'unknown'};}],
  ['INCOMPLETE_CONTEXT',q=>{q.shapeRequest.geometry.concatOrder='context-first';}],
  ['SEMANTIC_MISMATCH',q=>{q.shapeRequest.semantics['target-latent'].meaning='raw-posterior-mean';}],
  ['UNSUPPORTED_NORMALIZATION',q=>{q.inputs.conditioning.normalization='encoder-final-rmsnorm';}],
  ['MISSING_MASK',q=>{delete q.inputs.conditioning.attentionMask;}],
  ['UNSUPPORTED_SHAPE',q=>{q.inputs.conditioning.attentionMask.shape=[511];}],
  ['UNSUPPORTED_SHAPE',q=>{q.inputs.conditioning.shape=[1,513,4096];}],
  ['UNSUPPORTED_TIMESTEP',q=>{q.timestep=1001;}],
  ['UNSUPPORTED_DTYPE',q=>{q.inputs.tensors[0].dtype='float16';}],
  ['CONTEXT_ORDER_MISMATCH',q=>{q.inputs.tensors[0].requirementId='source.latent';}]
 ];
 for(const [code,change]of cases){const q=request();change(q);const result=checkExecutionSupport(q);assert.equal(result.supported,false,code);assert.ok(result.reasons.some(reason=>reason.code===code),code);assert.equal(result.executableRoute,true);assert.equal(result.structurallyAdmitted,false);}
 const q=request('predict',{full:true});[q.inputs.tensors[1],q.inputs.tensors[2]]=[q.inputs.tensors[2],q.inputs.tensors[1]];assert.ok(reasons(q).includes('CONTEXT_ORDER_MISMATCH'));
});

test('planning caps and generated-space capacity remain separate from validated domains',()=>{
 const exact=request('predict',{width:90000*16});let result=checkExecutionSupport(exact);assert.equal(result.supported,true);assert.equal(result.structure.totalTokens,90000);assert.equal(result.structure.planning.validatedInputDomain,false);assert.deepEqual(result.confirmedPublicInputDomains,[]);
 const over=request('predict',{width:90001*16});assert.ok(reasons(over).includes('RESOURCE_BUDGET'));
 const generated=request('sample',{width:65537*16});assert.ok(reasons(generated).includes('GENERATED_TENSOR_BUDGET_EXCEEDED'));assert.ok(!reasons(generated).includes('RESOURCE_BUDGET'));
});

test('sample noise, raw context conversion and optional zero target match runtime ownership',()=>{
 const q=request('sample');delete q.inputs.tensors;assert.equal(checkExecutionSupport(q).supported,true);delete q.inputs.noise;assert.equal(checkExecutionSupport(q).supported,true);
 const withContext=request('sample',{full:true});withContext.inputs.tensors[1].meaning='raw-posterior-mean';delete withContext.inputs.tensors[1].normalization;withContext.inputs.tensors[1].modelSha256=WAN21_VAE_SHA256;assert.equal(checkExecutionSupport(withContext).supported,true);
 withContext.inputs.tensors[1].normalization='none';assert.ok(reasons(withContext).includes('UNSUPPORTED_NORMALIZATION'));delete withContext.inputs.tensors[1].normalization;delete withContext.inputs.tensors[1].modelSha256;assert.ok(reasons(withContext).includes('MODEL_IDENTITY_MISMATCH'));
 delete withContext.inputs.tensors;assert.ok(reasons(withContext).includes('MISSING_INPUT'));
 const prediction=request('predict',{full:true});prediction.inputs.tensors[1].meaning='raw-posterior-mean';assert.ok(reasons(prediction).includes('SEMANTIC_MISMATCH'));
});

test('normal generation defaults and canonical context-only tensors are declared by the existing owner route',t=>{
 const capabilities=describeExecutionCapabilities(),sample=capabilities.operations.sample,defaults=sample.normalInputs;
 assert.ok(defaults,'Normal generation owner contract required');assert.equal(defaults.owner,'diffusion_models');assert.equal(defaults.target.default,'zero-from-shapeRequest');assert.equal(defaults.noise.optional,true);assert.match(defaults.noise.profile,/host/);assert.equal(defaults.noise.comfyRngBitIdentity,false);assert.equal(defaults.seedInput,false);
 assert.equal(sample.supportedUISettings.cfg.value,1);assert.equal(sample.supportedUISettings.steps.value,6);assert.equal(defaults.limits.targetMaxElements,4194304);assert.equal(defaults.limits.totalSequenceTokens,90000);assert.equal(defaults.limits.pointwiseMaxElementsAppliesToSample,false);
 assert.deepEqual(capabilities.operations.load.normalInputs,defaults);
 const template=defaults.defaults.shapeRequest;assert.deepEqual(template.target,{batch:1,frames:1,height:16,width:32});assert.equal(template.media.slots.length,8);assert.ok(template.media.slots.every(slot=>slot.wired.state==='absent'&&slot.editor.state==='absent'));
 const canonical=deriveWorkflowShapes(template);assert.deepEqual(canonical.requirements.find(value=>value.requirementId==='target.latent').shape,[1,16,1,2,4]);
 t.mock.method(crypto,'getRandomValues',()=>assert.fail('Metadata support must not consume entropy'));
 const ordinary=request('sample');ordinary.shapeRequest=template;delete ordinary.inputs.noise;delete ordinary.inputs.tensors;assert.equal(checkExecutionSupport(ordinary).supported,true);
 template.target.width=999;assert.equal(describeExecutionCapabilities().operations.sample.normalInputs.defaults.shapeRequest.target.width,32);
 const q=request('sample',{full:true});q.inputs.tensors=q.inputs.tensors.slice(1);delete q.inputs.noise;const result=checkExecutionSupport(q);assert.equal(result.supported,true);assert.equal(result.structure.initialTarget,'owner-zero');assert.equal(result.structure.noiseProfile,defaults.noise.profile);
 [q.inputs.tensors[0],q.inputs.tensors[1]]=[q.inputs.tensors[1],q.inputs.tensors[0]];assert.ok(reasons(q).includes('CONTEXT_ORDER_MISMATCH'));
 const seeded=request('sample');seeded.seed=1;assert.ok(reasons(seeded).includes('UNSUPPORTED_OPTION'));
});

test('no receipt, sample payload hash or independent reference is required for structural admission',()=>{
 for(const operation of ['predict','sample']){const q=request(operation);q.identification={payloadHash:'arbitrary-cache-key'};Object.defineProperty(q,'receipt',{get(){assert.fail('No receipt access');}});Object.defineProperty(q,'independentReference',{get(){assert.fail('No numeric-reference access');}});assert.equal(checkExecutionSupport(q).supported,true);}
});

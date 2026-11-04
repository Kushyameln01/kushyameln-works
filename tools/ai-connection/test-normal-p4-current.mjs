// Current ordinary P4 adoption uses actual native capabilities. Only expensive
// model/ORT construction is substituted in the lifecycle boundary test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const m=await import('../../docs/shared/ai-connection/adapters/normal-p4-current.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));

test('current ordinary P4 has an independent fixed adoption and canonical Text marker',()=>{
 assert.equal(typeof m.inspectNormalP4CurrentAdoption,'function','Current P4 adoption is required');
 const adoption=m.inspectNormalP4CurrentAdoption();
 assert.equal(adoption.sourceRef.commit,'b6e166478a8e072c9ffd3ce562bfdb0c89634920');
 assert.equal(adoption.buildId,'diffusion-models/0.1+e5ba40ce01bd04e4a432846afb737a9d8c37c56450df68af51460d9140c3e4c6');
 assert.equal(adoption.operationId,'postSelfAttention');
 assert.equal(adoption.conditioning.normalization,'umt5-final-rmsnorm-f32-v1');
 assert.equal(adoption.modelFilesEmbedded,false);
 assert.equal(adoption.generationReady,false);
});

function inputs(){
 const c=m.inspectNormalP4CurrentAdoption().inputs;
 return Object.fromEntries(Object.entries(c).map(([name,contract])=>{const shape=contract.shape.map(n=>n??512);return [name,{...structuredClone(contract),shape,data:new Float32Array(shape.reduce((a,b)=>a*b,1)),...(name==='conditioning'?{attentionMask:new Uint8Array(512).fill(1)}:{})}];}));
}
const options={modelFile:new Blob(['metadata-query-only; never a model']),side:'LOW',inputPayloadBudgetBytes:8450560};

test('actual current P4 admits canonical L512 through the ordinary queue with NN0',async()=>{
 assert.equal(typeof m.createNormalP4CurrentOperation,'function','Current P4 operation factory is required');
 let nativeCalls=0;const p4=await m.createNormalP4CurrentOperation({...options,onNativeRequest:()=>nativeCalls++});
 try{
  const values=inputs(),descriptor=m.createNormalP4RequestDescriptor({inputs:values});
  const q=await p4.querySupport(descriptor);
  assert.equal(q.status,'SUPPORTED');assert.equal(q.dispatchSupported,true);
  assert.equal(q.nativeSupport.supported,true);assert.equal(q.observation.sourceRef.commit,'b6e166478a8e072c9ffd3ce562bfdb0c89634920');
  assert.equal(q.observation.loadedState.nativeOwnerPrepared,false);assert.equal(nativeCalls,0);
  assert.equal(descriptor.artifacts.conditioning.native.metadata.normalization,'umt5-final-rmsnorm-f32-v1');
  assert.equal(q.observation.resourceState.requiredBytes,8450560);
  assert.deepEqual(q.consumerPorts.conditioning.tensor.shape,[1,512,4096]);
 }finally{await p4.dispose();}
});

test('current P4 preserves native rejection of wrong marker without preparing a model',async()=>{
 const p4=await m.createNormalP4CurrentOperation(options);
 try{const values=inputs();values.conditioning.normalization='invented-marker';const q=await p4.querySupport(m.createNormalP4RequestDescriptor({inputs:values}));assert.equal(q.status,'UNSUPPORTED');assert.ok(q.reasons.some(r=>r.code==='UNSUPPORTED_NORMALIZATION'&&r.authority==='native-checkExecutionSupport'));assert.equal(q.observation.loadedState.nativeOwnerPrepared,false);}finally{await p4.dispose();}
});

test('ordinary P4 requires an explicit local modelFile and model side',async()=>{
 await assert.rejects(()=>m.createNormalP4CurrentOperation({side:'LOW'}),{code:'NORMAL_P4_MODEL_FILE_REQUIRED'});
 await assert.rejects(()=>m.createNormalP4CurrentOperation({modelFile:options.modelFile}),{code:'NORMAL_P4_MODEL_SIDE_REQUIRED'});
});

test('P4 standard service accepts native input envelope and leaves unknown fields for owner rejection',async()=>{
 assert.equal(typeof m.createP4Management,'function','Operational P4 service is required');
 const p4=await m.createP4Management(options);
 try{
  const input={inputs:inputs()},query=await p4.query({operation:'postSelfAttention',input});
  assert.equal(query.status,'SUPPORTED');assert.equal(query.dispatchSupported,true);assert.equal(query.support.supported,true);
  assert.equal(p4.inspect().activeTarget,null);
  const extra=await p4.query({operation:'postSelfAttention',input:{...input,unknownNativeField:true}});
  assert.equal(extra.status,'UNSUPPORTED');assert.ok(extra.reasons.some(r=>r.code==='NORMAL_P4_PARAMETERS_UNSUPPORTED'));
  const wrong=await p4.query({operation:'sample',input});
  assert.equal(wrong.status,'UNSUPPORTED');assert.ok(wrong.reasons.some(r=>r.code==='OWNER_OPERATION_UNSUPPORTED'));
  assert.equal(query.observation.loadedState.nativeOwnerPrepared,false);
 }finally{await p4.dispose();}
});

test('the independent P4 adoption detects substituted native source bytes',async()=>{
 assert.equal(typeof m.verifyNormalP4CurrentSources,'function');
 await assert.rejects(()=>m.verifyNormalP4CurrentSources({read:async file=>{const bytes=new Uint8Array(await readFile(new URL(file,m.NORMAL_P4_CURRENT_ROOT_URL)));if(file.endsWith('/execution/capabilities.mjs'))bytes[0]^=1;return bytes;}}),{code:'NORMAL_P4_CURRENT_SOURCE_MISMATCH'});
});

test('current P4 dispatch retains canonical tensors, native options and shared holder output',async()=>{
 const api=await import('../../docs/shared/ai-connection/native/diffusion-b6e16647/docs/shared/diffusion-models/api/index.mjs');
 let created=0,disposed=0,received;
 const nativeModule={...api,async createBerniniP4Execution(o){created++;assert.deepEqual(Object.keys(o).sort(),['file','side']);assert.equal(o.file,options.modelFile);const model={side:o.side,modelSha256:api.describeExecutionCapabilities().models[o.side]};let stopped=false;
  return {model,describe:()=>({source:{modelHash:model.modelSha256}}),weightFeed:{registry:()=>({modelHash:model.modelSha256,executionProfileId:'boundary-only',graphHash:'b'.repeat(64),registryHash:'c'.repeat(64)})},checkSupport:api.checkExecutionSupport,run:async(request,runOptions)=>{received=structuredClone(request);assert.deepEqual(Object.keys(runOptions),['signal']);return {tensor:{...structuredClone(api.describeExecutionCapabilities().operations.postSelfAttention.output),data:new Float32Array(request.inputs.residual.data),modelSha256:model.modelSha256},state:{operation:'postSelfAttention',model,generationReady:false}};},stats:()=>({disposed:stopped,stage:{activeORTSessions:stopped?0:1},feed:{readLeases:0}}),dispose:async()=>{stopped=true;disposed++;}};
 }};
 const p4=await m.createNormalP4CurrentOperation({...options,nativeModule});
 try{const values=inputs(),d=m.createNormalP4RequestDescriptor({inputs:values});const result=await p4.execute({descriptor:d,input:values});assert.equal(result.status,'EXECUTION_COMPLETED');assert.equal(created,1);assert.equal(disposed,1);assert.equal(received.inputs.conditioning.normalization,'umt5-final-rmsnorm-f32-v1');assert.deepEqual(received.inputs.conditioning.attentionMask,values.conditioning.attentionMask);assert.deepEqual(Object.keys(received).sort(),['blockIndex','contextLatents','inputs','model','operation']);assert.equal(result.snapshot.stepBindings[0].artifactRefs.length,3);assert.equal(result.output.tensor.meaning,'bernini-block0-output-hidden:v1');assert.equal(result.generationReady,false);}finally{await p4.dispose();}
 const service=await m.createP4Management({...options,nativeModule});
 try{const values=inputs(),result=await service.execute({operation:'postSelfAttention',input:{inputs:values}});assert.equal(result.status,'EXECUTION_COMPLETED');assert.equal(created,2);assert.equal(disposed,2);assert.equal(result.tensor,result.output.tensor);assert.equal(result.result,result.output);assert.equal(service.inspect().activeTarget,null);}finally{await service.dispose();}
});

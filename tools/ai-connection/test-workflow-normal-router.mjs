import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveWorkflowShapes,BERNINI_WORKFLOW_RULE_ID} from '../../docs/shared/ai-connection/workflow-shapes.mjs';

const api=await import('../../docs/shared/ai-connection/adapters/workflow-normal-router.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
const route=args=>{assert.equal(typeof api.queryWorkflowOwners,'function','Workflow owner router required');return api.queryWorkflowOwners(args);};
function plan(){return deriveWorkflowShapes({ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:5,height:16,width:32},refMaxSize:848,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',temporalRule:'first-then-groups-floor',concatOrder:'target-first'},media:{sourceVideo:{state:'present',rgb:{frames:5,height:16,width:32}},referenceVideo:{state:'unknown'},slots:[]}});}
function descriptor(operationId,meaning,metadata={}){return {operationId,artifact:{artifactId:'explicit:'+operationId,kind:'tensor',tensor:{...(meaning!==undefined?{nativeMeaning:meaning}:{})},native:{schemaId:'fixture:owner-tensor',schemaVersion:'1',metadata},semantics:{schemaId:'fixture:explicit-owner-meaning',schemaVersion:'1',spaceId:meaning,normalization:'none'},extensions:{future:{keep:['a','a']}}},modelRefs:['model:explicit'],targetRefs:[]};}

// Catches a global owner choice, role-to-mean inference, or changed owner reasons.
test('known RGB and latent requirements query their explicitly bound owners independently',async()=>{
  const shapePlan=plan(),rgb=descriptor('encode','raw-decoder-rgb'),latentContract={decoderRef:'decoder:explicit',context:{sourceId:4,inputId:'context:actual'}},latent=descriptor('decode','caller:generated-sample',{modelSha256:'model:explicit',latentContract}),generic=descriptor('decode',undefined),seen=[];
  const encodeReply={status:'SUPPORTED',capabilityRef:'owner:encode',reasons:[],ownerSource:{sourceRef:'encoder:actual'}},decodeReply={status:'UNSUPPORTED',capabilityRef:null,reasons:[{code:'OWNER_DECODER_CONTRACT',fieldPath:'/artifact/native/metadata/latentContract',reason:'Actual configured decoder does not accept this contract'}],ownerSource:{sourceRef:'decoder:actual'}};
  const encoder={async querySupport(d){assert.equal(this,encoder);seen.push(d);assert.deepEqual(d.artifact.tensor.shape,[1,3,5,16,32]);return encodeReply;}},decoder={async querySupport(d){assert.equal(this,decoder);seen.push(d);assert.deepEqual(d.artifact.tensor.shape,[1,16,2,2,4]);assert.equal(d.artifact.native.metadata.latentContract,latentContract);return decodeReply;}},unboundMeaning={async querySupport(d){seen.push(d);assert.equal(d.artifact.tensor.nativeMeaning,undefined);return {status:'UNVERIFIED',reasons:[{code:'OWNER_MEANING_UNBOUND',fieldPath:'/artifact/tensor/nativeMeaning'}]};}};
  const r=await route({shapePlan,bindings:[{requirementId:'source.rgb',owner:encoder,descriptor:rgb},{requirementId:'source.latent',owner:decoder,descriptor:latent},{requirementId:'target.latent',owner:unboundMeaning,descriptor:generic}]});
  assert.equal(seen.length,3);
  const find=id=>r.requirements.find(x=>x.requirementId===id);
  assert.equal(find('source.rgb').ownerResponse,encodeReply);
  assert.equal(find('source.latent').ownerResponse,decodeReply);
  assert.equal(find('source.latent').reasons,decodeReply.reasons);
  assert.equal(find('target.latent').status,'UNVERIFIED');
  assert.equal(find('reference.rgb').status,'UNVERIFIED');
  assert.equal(find('slot:0.latent').status,'NOT_REQUIRED');
  assert.equal(r.shapePlan,shapePlan);assert.equal(r.generationReady,false);
});

// Catches invoking metadata factories or owners for unresolved/absent requirements.
test('explicit descriptor factories preserve supplied model decoder context and opaque attachments',async()=>{
  const shapePlan=plan(),supply={meaning:'raw-posterior-mean',modelSha256:'model:actual',decoderRef:{modelSha256:'decoder:actual'},context:{inputId:'media:actual',sourceFrames:[9,9]},future:new Uint8Array(1024*1024)},seen=[];
  let builds=0,queries=0;
  const owner={async querySupport(d){queries++;assert.equal(d.artifact.native.metadata,supply);return {status:'SUPPORTED',capabilityRef:'owner:explicit',reasons:[]};}},createDescriptor=({requirement,operationId,supply:received})=>{builds++;assert.equal(received,supply);seen.push(requirement.requirementId);return descriptor(operationId,received.meaning,received);};
  const r=await route({shapePlan,bindings:[{requirementId:'source.latent',owner,operationId:'decode',supply,createDescriptor},{requirementId:'reference.latent',owner,operationId:'decode',supply,createDescriptor},{requirementId:'slot:0.latent',owner,operationId:'decode',supply,createDescriptor}]});
  assert.equal(builds,1);assert.equal(queries,1);assert.deepEqual(seen,['source.latent']);
  const result=r.requirements.find(x=>x.requirementId==='source.latent');
  assert.equal(result.descriptor.artifact.native.metadata.future,supply.future);
  assert.equal(result.descriptor.modelRefs[0],'model:explicit');
  assert.deepEqual(result.descriptor.artifact.tensor.shape,[1,16,2,2,4]);
});

// Catches ambiguous routing being resolved by array order after one owner has queried.
test('duplicate requirement owner bindings reject before any owner query',async()=>{
  let calls=0;const owner={querySupport(){calls++;return {status:'SUPPORTED',reasons:[]};}},binding={requirementId:'source.rgb',owner,descriptor:descriptor('encode','rgb-unit')};
  await assert.rejects(route({shapePlan:plan(),bindings:[binding,{...binding}]}),{name:'TypeError'});
  assert.equal(calls,0);
});

// Actual configured VAE capability validator under a no-run transport boundary.
test('real VAE facade routes controlled RGB and mean while target81 stays owner unsupported',async()=>{
  const m=await import('../../docs/shared/ai-connection/adapters/normal-vae-owner.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
  assert.equal(typeof m.createNormalVaeOwner,'function','Concrete normal VAE facade required');
  const rootArg=process.argv.indexOf('--native-root'),nativeRoot=process.env.NORMAL_VAE_NATIVE_ROOT??(rootArg>=0?process.argv[rootArg+1]:null);
  assert.ok(nativeRoot,'NORMAL_VAE_NATIVE_ROOT must identify the fixed498 materialized source');
  const {readFileSync}=await import('node:fs'),{createHash}=await import('node:crypto'),{join}=await import('node:path'),{pathToFileURL}=await import('node:url');
  assert.equal(createHash('sha256').update(readFileSync(join(nativeRoot,'docs/shared/inference/api.mjs'))).digest('hex'),'b637a22e6447b638e0739d8510c4361cec52f9bf25b4be15e8cf65bfc06accda');
  const nativeModule=await import(pathToFileURL(join(nativeRoot,'docs/shared/inference/api.mjs'))),{createNormalOperationAdapter}=await import('../../docs/shared/ai-connection/adapters/normal-operation.mjs');
  const hash='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',asset=(file,bytes,shape)=>({file,bytes,sha256:'a'.repeat(64),...(shape?{shape}:{})});
  const manifest={schemaVersion:1,kind:'wan21-vae-profile-v1',model:{sha256:hash,executionDtype:'float32'},profile:{id:'fixture:configured-rect',videoShape:[1,3,1,16,32],latentShape:[1,16,1,2,4],layout:'NCTHW',latentSpace:'raw',posterior:'mean',opset:17},assets:{encoder:asset('encoder.onnx',8),decoderBody:asset('decoder.onnx',8),conv2Weight:asset('conv2.f32',1024,[16,16]),conv2Bias:asset('bias.f32',64,[16])},inference:{inputName:'input',outputName:'output',executionProvider:'wasm',threads:1,graphOptimizationLevel:'disabled'}};
  let nativeRuns=0;
  const owner=await m.createNormalVaeOwner({nativeModule,configuration:{manifest,files:new Map(Object.values(manifest.assets).map(a=>[a.file,new Blob([new Uint8Array(a.bytes)])]))},clientFactory:()=>({get state(){return {status:'idle',module:'vae'};},run(){nativeRuns++;throw Error('Metadata query cannot run a graph');},cancel(){},dispose(){}})}),host=createNormalOperationAdapter({owner});
  try{
    const shapePlan=deriveWorkflowShapes({ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:81,height:480,width:832},refMaxSize:848,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',temporalRule:'first-then-groups-floor',concatOrder:'target-first'},media:{sourceVideo:{state:'absent'},referenceVideo:{state:'absent'},slots:[{slotIndex:0,wired:{state:'present',inputId:'controlled:rect',rgb:{frames:1,height:16,width:32},sourceFrameIndices:[7]},editor:{state:'absent'}}]}});
    const context={schemaVersion:1,contextId:'context:explicit-rect',inputId:'controlled:rect',inputSha256:'b'.repeat(64),slotId:'source',sourceFrameIndices:[7]},createDescriptor=({requirement,operationId,supply})=>m.createNormalVaeRequestDescriptor(operationId,{...supply,dtype:requirement.dtype,layout:requirement.axes.join(''),shape:requirement.shape});
    const result=await route({shapePlan,bindings:[{requirementId:'context:0:0.rgb',owner:host,operationId:'encode',supply:{meaning:'raw-decoder-rgb',context},createDescriptor},{requirementId:'context:0:0.latent',owner:host,operationId:'decode',supply:{meaning:'raw-posterior-mean',modelSha256:hash,context},createDescriptor},{requirementId:'target.latent',owner:host,operationId:'decode',supply:{meaning:'raw-posterior-mean',modelSha256:hash},createDescriptor}]});
    const rgb=result.requirements.find(r=>r.requirementId==='context:0:0.rgb'),mean=result.requirements.find(r=>r.requirementId==='context:0:0.latent'),target=result.requirements.find(r=>r.requirementId==='target.latent');
    assert.equal(rgb.status,'SUPPORTED');assert.equal(mean.status,'SUPPORTED');assert.equal(rgb.ownerResponse.dispatchSupported,true);assert.equal(mean.ownerResponse.dispatchSupported,true);
    assert.equal(mean.ownerResponse.consumerPort.profileRef,'fixture:configured-rect');
    assert.deepEqual(mean.descriptor.artifact.native.metadata.context,context);assert.equal(mean.descriptor.artifact.native.metadata.modelSha256,hash);
    assert.equal(target.status,'UNSUPPORTED');assert.equal(target.ownerResponse.nativeSupport.code,'DESCRIPTOR_UNSUPPORTED');assert.equal(target.reasons,target.ownerResponse.reasons);
    assert.equal(rgb.ownerResponse.nativeCapabilities.runtime.encode.verified,false);assert.equal(nativeRuns,0);
  }finally{await host.dispose();}
});

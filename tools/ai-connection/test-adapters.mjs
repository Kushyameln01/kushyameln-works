import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnedArtifactStore,captureNativeTensor,restoreNativeTensor} from '../../docs/shared/ai-connection/adapters/artifacts.mjs';
import {createTextVaeAdapter} from '../../docs/shared/ai-connection/adapters/text-vae.mjs';
import {createDiffusionAdapter} from '../../docs/shared/ai-connection/adapters/diffusion.mjs';
import {createLoraAdapter} from '../../docs/shared/ai-connection/adapters/lora.mjs';
import {edgeFixture} from './fixtures.mjs';
const clone=structuredClone;
function sample(){return {dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'wan21-raw-generated-sample:v1',data:new Float32Array(128).fill(.25),
 latentContract:{schemaVersion:1,representation:'generated-sample',space:'raw',vaeModelSha256:'b'.repeat(64),producerModelSha256s:['c'.repeat(64),'d'.repeat(64)],normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}},
 context:{schemaVersion:1,contextId:'ctx',inputId:'video',inputSha256:'a'.repeat(64),slotId:'slot9',sourceFrameIndices:[4,2,2,1,0],sourceFrameTimesSeconds:[.4,.2,.2,.1,0]},future:{array:[3,3,1]}};}
function template(){const d=clone(edgeFixture().artifact);d.tensor.axes=['N','C','T','H','W'];d.profileRef='tiny';d.native.schemaId='fixture:native';return d;}
function config(nativeClient){return {descriptor:{moduleId:'test:vae',nativeAPI:{version:'works-ai-1',build:'works-inference-v1'},operations:[{operationId:'decode',implementationState:'implemented'}]},module:'vae',nativeClient,artifactStore:createOwnedArtifactStore(),binding:{ownerId:'owner:vae',sessionId:'manager-1'},sourceVerified:true};}
test('native tensor roundtrip preserves all producers, decoder, F5 times, unknown fields and response evidence',()=>{
 const store=createOwnedArtifactStore(),t=sample(),response={tensor:t,evidence:{inputProducer:['c','d'],unknown:{x:1}}};
 const handle=captureNativeTensor({tensor:t,response,descriptor:template(),extensions:{'future:opaque':{schemaId:'future',schemaVersion:'1',requiredForUse:false,data:{x:[2,2]}}},store});
 t.data.fill(99);t.context.sourceFrameIndices[0]=99;
 const restored=restoreNativeTensor(handle,store);assert.deepEqual(restored.data,new Float32Array(128).fill(.25));assert.deepEqual(restored.context.sourceFrameIndices,[4,2,2,1,0]);
 assert.deepEqual(handle.descriptor.provenance.producerRefs.map(x=>x.value),['c'.repeat(64),'d'.repeat(64)]);assert.equal(handle.descriptor.provenance.consumerBindings[0].value,'b'.repeat(64));
 assert.deepEqual(store.get(handle.responseRef).evidence,response.evidence);assert.equal(handle.descriptor.lineage.sourceFrames[0].indices.length,5);
 handle.descriptor.provenance.producerRefs.pop();assert.throws(()=>restoreNativeTensor(handle,store),/descriptor/i);
});
test('mask/tokenizer and arbitrary optional binaries stay owned without JSON number expansion',()=>{
 const store=createOwnedArtifactStore(),tensor={dtype:'float32',shape:[1,2,3],layout:'BLC',meaning:'text_hidden_states',data:new Float32Array(6),attentionMask:new Uint8Array([1,0]),tokenizerSha256:'f'.repeat(64),modelSha256:'e'.repeat(64),futureMask:new Uint16Array([8,9])};
 const d=template();d.tensor.axes=['B','L','C'];const h=captureNativeTensor({tensor,descriptor:d,response:{tensor,attentionMask:tensor.attentionMask},store});
 assert.ok(h.descriptor.native.metadata.attentionMask.binaryRef);assert.deepEqual(restoreNativeTensor(h,store),tensor);
 store.release(h.nativeRef);assert.throws(()=>restoreNativeTensor(h,store),/released|missing/i);
});
test('Text/VAE direct invocation uses exact operation, request/revision mapping and string error',async()=>{
 const seen=[],native={decode(t){seen.push(t);return {tensor:t,evidence:{native:true}};},cancel(){return true;},dispose(){}};
 const a=createTextVaeAdapter(config(native));
 const r=await a.invoke({requestId:'q1',operationId:'decode',input:sample(),localRevision:7});assert.equal(r.status,'ok');assert.equal(r.native.apiVersion,'works-ai-1');assert.equal(r.localRevision,7);assert.equal(seen.length,1);
 assert.equal((await a.invoke({requestId:'q1',operationId:'decode',input:sample(),localRevision:7})).status,'error');
 const b=createTextVaeAdapter(config({decode(){throw Error('unknown native string');},cancel(){return false;}}));
 const e=await b.invoke({requestId:'q2',operationId:'decode',input:sample(),localRevision:3});assert.equal(e.error.nativeCode,null);assert.equal(e.error.rawMessage,'unknown native string');
});
test('cancel compares active request and revision before native cancel; late result is not adopted',async()=>{
 let resolve,cancel=0;const a=createTextVaeAdapter(config({decode(){return new Promise(r=>resolve=r);},cancel(){cancel++;return true;}}));
 const promise=a.invoke({requestId:'old',operationId:'decode',input:sample(),localRevision:1});
 assert.equal((await a.cancel({requestId:'other',localRevision:1})).accepted,false);assert.equal(cancel,0);
 assert.equal((await a.cancel({requestId:'old',localRevision:1})).accepted,true);resolve({tensor:sample()});assert.equal((await promise).status,'cancelled');
 await a.cancel({requestId:'old',localRevision:1});assert.equal(cancel,1);
});
test('unverified source and unimplemented operation cannot dispatch',async()=>{
 let calls=0;const options=config({decode(){calls++;}});options.sourceVerified=false;const a=createTextVaeAdapter(options);assert.equal((await a.invoke({requestId:'1',operationId:'decode',input:sample(),localRevision:1})).status,'unverified');assert.equal(calls,0);
 options.sourceVerified=true;options.descriptor.operations[0].implementationState='not-implemented';assert.equal((await createTextVaeAdapter(options).invoke({requestId:'1',operationId:'decode',input:sample(),localRevision:1})).status,'blocked');assert.equal(calls,0);
});
test('Diffusion native wire/build/session/revision remain distinct and wrong replies rejected',async()=>{
 const options={...config(null),descriptor:{nativeAPI:{version:'diffusion-models/0.1',build:'native-build'},operations:[{operationId:'schedule',implementationState:'implemented'}]},binding:{ownerId:'dm-owner',sessionId:'manager',nativeSessionId:'native',inputRevision:11},sourceVerified:true};
 let sent;options.nativeClient={request:async q=>{sent=q;return {...q,status:'ok',result:{sigmas:new Float32Array([1,.5,0])}};}};
 const a=createDiffusionAdapter(options),r=await a.invoke({requestId:'m-1',operationId:'schedule',input:{profile:'declared'},localRevision:3});assert.equal(sent.inputRevision,11);assert.equal(sent.protocolVersion,'diffusion-models/0.1');assert.equal(sent.sessionId,'native');assert.equal(r.localRevision,3);assert.equal(r.status,'ok');
 options.nativeClient={request:async q=>({...q,jobId:'wrong',status:'ok',result:{}})};assert.equal((await createDiffusionAdapter(options).invoke({requestId:'m-2',operationId:'schedule',input:{},localRevision:3})).status,'error');
});
test('LoRA v2 positional native arguments and local revisions are explicit, no implicit HIGH/LOW mapping',async()=>{
 const options={...config(null),descriptor:{nativeAPI:{version:'lora-connection/2.0-draft.1',build:'declared'},operations:[{operationId:'plan',implementationState:'implemented'}]},sourceVerified:true};let args;
 options.nativeClient={plan(...a){args=a;return {coverage:'PARTIAL',generationReady:false,localInputRevision:8};},cancel(){return true;}};
 const r=await createLoraAdapter(options).invoke({requestId:'lp',operationId:'plan',nativeArguments:[{pairId:'opaque',noise:'high'},{explicitTarget:true}],localRevision:100,nativeRevisionBinding:{sdkInstanceId:'sdk1',inputRevision:8,applicationRevision:2}});
 assert.equal(r.status,'ok');assert.equal(args[0].pairId,'opaque');assert.equal(r.nativeRevisionBinding.inputRevision,8);assert.equal(r.localRevision,100);assert.equal(r.result.generationReady,false);
});
test('connected invocation reuses M2 and cannot dispatch a known incompatible edge',async()=>{let calls=0;const a=createTextVaeAdapter(config({decode(){calls++;return{};}}));const edge=edgeFixture();edge.consumerPort.tensor.maxElements=3;const r=await a.invoke({requestId:'blocked',operationId:'decode',input:sample(),localRevision:1,edge});assert.equal(r.status,'blocked');assert.equal(r.edgeDecision.compatibility,'INCOMPATIBLE');assert.equal(calls,0);});
test('native and descriptor references cannot be mixed between handles',()=>{const store=createOwnedArtifactStore(),h=captureNativeTensor({tensor:sample(),descriptor:template(),store});const other=sample();other.meaning='raw-posterior-mean';h.nativeRef=store.put(other);assert.throws(()=>restoreNativeTensor(h,store),/handle|binding|association/i);});
test('failed capture rolls back every allocated owned reference',()=>{const store=createOwnedArtifactStore(),before=store.size;assert.throws(()=>captureNativeTensor({tensor:sample(),response:{callback(){}},descriptor:template(),store}));assert.equal(store.size,before);});
test('connected dispatch binds the exact declared port and operation to its owned payload',async()=>{
 const edge=edgeFixture(),store=createOwnedArtifactStore();let calls=0;
 const t={dtype:'float32',shape:[1,4],layout:'BC',meaning:'mean',data:new Float32Array([1,2,3,4])};
 const h=captureNativeTensor({tensor:t,descriptor:edge.artifact,store});edge.artifact=h.descriptor;edge.implementationState.consumer.operationId='decode';
 const options=config({decode(input){calls++;assert.deepEqual(input.data,t.data);return {tensor:input};}});options.artifactStore=store;options.binding={ownerId:'consumer',bindingRef:'consumer',sessionId:'manager'};options.descriptor.operations[0].inputPorts=[clone(edge.consumerPort)];
 const a=createTextVaeAdapter(options),q={requestId:'bound1',operationId:'decode',localRevision:1,edge,inputHandle:h};
 assert.equal((await a.invoke(q)).status,'ok');assert.equal(calls,1);
 const wrong=clone(edge);wrong.implementationState.consumer.operationId='some-other-op';assert.equal((await a.invoke({...q,requestId:'bound2',edge:wrong})).status,'blocked');assert.equal(calls,1);
});
test('shared binary storage is rejected instead of falsely advertising owned immutable copies',()=>{
 const store=createOwnedArtifactStore(),tensor=sample();tensor.data=new Float32Array(new SharedArrayBuffer(512));
 assert.throws(()=>captureNativeTensor({tensor,descriptor:template(),store}),/shared/i);assert.equal(store.size,0);
});
test('LoRA explicit native failure code is preserved without mapping Text/VAE string errors',async()=>{
 const nativeError=Object.assign(Error('Recovery is required'),{code:'RECOVERY_REQUIRED'});
 const options={...config({plan(){throw nativeError;}}),descriptor:{nativeAPI:{version:'lora-connection/2.0-draft.1',build:'declared'},operations:[{operationId:'plan',implementationState:'implemented'}]}};
 const r=await createLoraAdapter(options).invoke({requestId:'lora-error',operationId:'plan',nativeArguments:[{}],localRevision:9,nativeRevisionBinding:{sdkInstanceId:'test-sdk',inputRevision:1,applicationRevision:1}});
 assert.equal(r.status,'error');assert.equal(r.error.nativeCode,'RECOVERY_REQUIRED');assert.equal(r.error.rawMessage,nativeError.message);
});

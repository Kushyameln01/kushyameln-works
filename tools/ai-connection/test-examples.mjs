import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateModuleDescriptor,validateArtifactDescriptor,validatePipelineProfile,validateExecutionSnapshot} from '../../docs/shared/ai-connection/descriptor.mjs';
import {evaluateEdge} from '../../docs/shared/ai-connection/compatibility.mjs';
const read=name=>readFile(new URL(`../../docs/shared/ai-connection/examples/${name}.json`,import.meta.url),'utf8').then(JSON.parse);
const registry=await read('registry');
test('external manifests describe all current owner modules without native imports',async()=>{
 for(const name of ['text','vae','diffusion','lora','synthetic-audio']) {
  const m=await read(name);assert.equal(validateModuleDescriptor(m,registry).valid,true,JSON.stringify(validateModuleDescriptor(m,registry)));
  assert.equal(m.adapterRef,null);assert.ok(m.operations.length);
 }
});
test('main and unmerged G1C source identities and native API versions stay distinct',async()=>{
 const text=await read('text'),vae=await read('vae'),dm=await read('diffusion'),lora=await read('lora');
 assert.equal(text.implementationRef.commit,'6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095');
 assert.equal(vae.implementationRef.commit,text.implementationRef.commit);
 assert.equal(dm.implementationRef.commit,'029ce9336a61e53bc6172fa4a7b7189b15f2efa0');
 assert.equal(lora.implementationRef.commit,dm.implementationRef.commit);
 assert.equal(text.nativeAPI.version,'works-ai-1');assert.equal(dm.nativeAPI.version,'diffusion-models/0.1');assert.equal(lora.nativeAPI.version,'1');
});
test('Diffusion sample is not implemented while partial numeric operations remain described',async()=>{
 const dm=await read('diffusion');assert.equal(dm.operations.find(x=>x.operationId==='sample').implementationState,'not-implemented');
 assert.equal(dm.operations.find(x=>x.operationId==='eulerStep').constraints.maxElements,1048576);
 assert.equal(dm.operations.find(x=>x.operationId==='restoreRawMean').constraints.exactElements,128);
 assert.equal(dm.operations.find(x=>x.operationId==='validateConditioning').inputPorts[0].tensor.shape[1],512);
});
test('G1C source-frame arrays remain F=5 when latent T=2, optional information unchanged',async()=>{
 const a=await read('g1c-sample-artifact'),before=structuredClone(a),result=validateArtifactDescriptor(a,registry);
 assert.equal(result.valid,true,JSON.stringify(result));assert.deepEqual(a,before);
 assert.equal(a.tensor.shape[2],2);assert.equal(a.lineage.sourceFrames[0].indices.length,5);
  assert.equal(a.native.metadata.meaning,'wan21-raw-generated-sample:v1');
  assert.equal(a.tensor.nativeMeaning,'wan21-raw-generated-sample:v1');
  assert.deepEqual(registry.schemas.find(s=>s.schemaId==='example:raw-generated-sample').nativeMeanings,['wan21-raw-generated-sample:v1']);
 assert.deepEqual(a.native.metadata.latentContract.producerModelSha256s,a.provenance.producerRefs.map(x=>x.value));
 assert.deepEqual(a.lineage.sourceFrames[0].indices,[4,2,2,1,0]);
 assert.equal(a.extensions['future:opaque'].requiredForUse,false);
});
test('a genuinely different no-LoRA non-Wan one-step profile and snapshot are representable',async()=>{
 const m=await read('synthetic-audio'),p=await read('synthetic-audio-profile'),s=await read('synthetic-audio-snapshot');
 assert.equal(validatePipelineProfile(p,registry).valid,true);assert.equal(validateExecutionSnapshot(s,registry).valid,true);
 assert.equal(p.steps.length,1);assert.equal(p.steps[0].moduleId,m.moduleId);assert.deepEqual(m.operations[0].inputPorts[0].tensor.shape,[1,2,480]);
 assert.deepEqual(p.steps[0].adapterRefs,[]);assert.notEqual(s.managerRevision,s.stepBindings[0].localRevisionBindings.native);
});
test('same contract substitution changes opaque module identity and preserves topology',async()=>{
 const m=await read('synthetic-audio');m.moduleId='example:alternate-independent-audio';m.moduleVersion='alternate-fixture/1';
 assert.equal(validateModuleDescriptor(m,registry).valid,true);
});
test('synthetic audio replacement edge has reasoned compatible contract while execution remains blocked',async()=>{
 const m=await read('synthetic-audio');
 const producerPort=structuredClone(m.operations[0].outputPorts[0]);
 const consumerPort=structuredClone(m.operations[0].inputPorts[0]);
 consumerPort.bindingRef='example:replacement-audio:pcm';consumerPort.owner='replacement-audio';
 const artifact={contractVersion:m.contractVersion,artifactId:'example:pcm-fixture',kind:'tensor',
  native:{schemaId:'example:synthetic-audio-native',schemaVersion:'1',payloadRef:'fixture:pcm-payload-not-executed',metadata:{meaning:'synthetic:pcm'}},
  semantics:structuredClone(producerPort.semantics),profileRef:producerPort.profileRef,
  tensor:{dtype:'float32',shape:[1,2,480],axes:['batch','channel','sample'],nativeMeaning:'synthetic:pcm',dataRef:'fixture:pcm-payload-not-executed'},
  provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[]},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,
  ownership:{ownerId:producerPort.owner,mode:'copy'},extensions:{}};
 const implementationState=Object.fromEntries([['producer',producerPort],['consumer',consumerPort]].map(([side,port])=>[side,{bindingRef:port.bindingRef,state:'not-implemented',roles:['tensor-transform'],operationId:'condition-audio'}]));
 const activeBindings=Object.fromEntries([['producer',producerPort],['consumer',consumerPort]].map(([side,port])=>[side,{bindingRef:port.bindingRef,valid:true,ownerId:port.owner,currentRevision:1,expectedRevision:1}]));
 const result=evaluateEdge({producerPort,consumerPort,artifact,adapters:[],registry,implementationState,
  requiredScopes:['fixture'],evidence:[],resourceState:{status:'available',ownerId:'fixture-manager',requiredBytes:3840,budgetBytes:8192,occupiedBytes:0},activeBindings});
 assert.equal(result.compatibility,'COMPATIBLE',JSON.stringify(result.reasons));
 assert.equal(result.readiness.state,'blocked');assert.equal(result.validation[0].result,'not-verified');
 assert.ok(result.readiness.reasons.includes('IMPLEMENTATION_NOT_READY:producer'));
 assert.ok(result.checks.some(c=>c.fieldPath==='/tensor/shape'&&c.outcome==='match'));
 for(const c of result.checks){assert.ok(c.reason);assert.ok(c.owner);assert.ok(c.contractRefs.includes(producerPort.sourceRef.sha256));}
});

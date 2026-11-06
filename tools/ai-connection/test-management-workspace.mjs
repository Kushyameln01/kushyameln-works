import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync} from '../../docs/shared/ft/vendor/fflate.mjs';
import {createReferenceOwner,createReferenceDescriptor,REFERENCE_REGISTRY} from '../../docs/shared/ai-connection/reference-owner.mjs';
import {createManagementHost} from '../../docs/shared/ai-connection/management-host.mjs';
import {canonicalBytes,sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';
const api=await import('../../docs/shared/ai-connection/management-workspace.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
async function setup(){const owner=await createReferenceOwner(),host=createManagementHost({owners:{ref:owner}}),tensor={dtype:'float32',shape:[1,4],layout:'BC',meaning:'saved-control-value',data:new Float32Array([.25,-1,7,3])};const descriptor=createReferenceDescriptor('copy',tensor).artifact;descriptor.provenance.producerRefs=[{identityKind:'model',role:'producer',algorithm:'sha256',value:'a'.repeat(64),scope:'full-file'},{identityKind:'model',role:'producer',algorithm:'sha256',value:'b'.repeat(64),scope:'full-file'}];descriptor.lineage={inputs:['source'],sourceFrames:[{inputId:'source',slotId:'reference',indices:[4,4,0],timesSeconds:[.2,.2,0]}]};descriptor.extensions={'future:extra':{schemaId:'future:extra',schemaVersion:'99',requiredForUse:false,data:{bytes:new Uint8Array([8,9]),unchanged:['x','x']}}};const profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'control:save',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:['source'],steps:[{stepId:'copy',moduleId:'ref',operationId:'copy',inputBindings:[{portId:'input',artifactRef:'source'}],outputBindings:[{portId:'input',artifactRef:'final'}],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:[]};await host.configure({profile,externalInputs:{source:{descriptor,tensor}},selections:{loraEnabled:false}});await host.execute();return {owner,host};}
test('durable input/output, snapshot, provenance, frames, unknown binary extension survive fresh read and rerun',async()=>{assert.equal(typeof api.buildManagementBundle,'function');const f=await setup();try{const bundle=await api.buildManagementBundle({registry:REFERENCE_REGISTRY,state:f.host.exportState(),artifacts:f.host.exportArtifacts(),fileRequirements:[{id:'model',name:'local.safetensors',size:13}]});const r=await api.readManagementBundle(bundle.bytes,{registry:REFERENCE_REGISTRY});assert.deepEqual(r.artifacts.final.tensor.data,new Float32Array([.25,-1,7,3]));assert.equal(r.artifacts.source.descriptor.provenance.producerRefs.length,2);assert.deepEqual(r.artifacts.source.descriptor.lineage.sourceFrames[0].indices,[4,4,0]);assert.deepEqual(r.artifacts.final.descriptor.extensions['future:extra'].data.bytes,new Uint8Array([8,9]));assert.equal(r.fileRequirements[0].reselectRequired,true);assert.equal(r.artifacts.final.snapshot.snapshotId,r.artifacts.final.descriptor.snapshotId);const next=createManagementHost({owners:{ref:await createReferenceOwner()}});try{await next.restore(r.restore);assert.equal((await next.execute()).status,'COMPLETED');}finally{await next.dispose();}}finally{await f.host.dispose();}});
test('actual bytes tamper and omitted snapshot are rejected before restoring any record',async()=>{const f=await setup();try{const b=await api.buildManagementBundle({registry:REFERENCE_REGISTRY,state:f.host.exportState(),artifacts:f.host.exportArtifacts()});const entries=unzipSync(b.bytes),manifest=JSON.parse(new TextDecoder().decode(entries['manifest.json'])),native=manifest.artifacts[0].nativePath;entries[native][entries[native].length-1]^=1;await assert.rejects(()=>api.readManagementBundle(zipSync(entries),{registry:REFERENCE_REGISTRY}),{code:'ASSET_HASH_MISMATCH'});const missing=unzipSync(b.bytes);delete missing[manifest.artifacts[1].snapshotPath];await assert.rejects(()=>api.readManagementBundle(zipSync(missing),{registry:REFERENCE_REGISTRY}),{code:'REQUIRED_ASSET_MISSING'});}finally{await f.host.dispose();}});
test('runtime File capabilities and unsupported codec fields cannot silently become saved tensor evidence',async()=>{const f=await setup();try{const state=f.host.exportState();state.accidentalFile=new Blob(['secret']);await assert.rejects(()=>api.buildManagementBundle({registry:REFERENCE_REGISTRY,state,artifacts:f.host.exportArtifacts()}),{code:'WORKSPACE_RUNTIME_VALUE'});const artifacts=f.host.exportArtifacts();artifacts.final.tensor.normalization='owner:unsupported-marker';artifacts.final.descriptor.native.metadata.normalization='owner:unsupported-marker';await assert.rejects(()=>api.buildManagementBundle({registry:REFERENCE_REGISTRY,state:f.host.exportState(),artifacts}),{code:'NATIVE_METADATA_MISMATCH'});}finally{await f.host.dispose();}});

// These fixtures avoid optional typed metadata so rejection exercises the
// persistence boundary itself, independently of pipeline metadata adaptation.
async function auditFixture(){
 const owner=await createReferenceOwner(),host=createManagementHost({owners:{ref:owner}});
 const tensor={dtype:'float32',shape:[1,4],layout:'BC',meaning:'audit-saved-value',data:new Float32Array([.25,-1,7,3])};
 const descriptor=createReferenceDescriptor('copy',tensor).artifact;
 const profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'audit:save',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:['source'],steps:[{stepId:'copy',moduleId:'ref',operationId:'copy',inputBindings:[{portId:'input',artifactRef:'source'}],outputBindings:[{portId:'output',artifactRef:'final'}],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:[]};
 await host.configure({profile,externalInputs:{source:{descriptor,tensor}}});await host.execute({requestId:'audit-A'});return {owner,host};
}

test('workspace cannot repair original common/native descriptor contradictions while capturing bytes',async()=>{
 const f=await auditFixture();try{
  for(const mutate of [d=>d.tensor.shape=[2,2],d=>d.tensor.dtype='int32',d=>d.tensor.axes=['C','B'],d=>d.tensor.nativeMeaning='different-meaning',d=>d.native.metadata.meaning='different-native-meaning']){
   const artifacts=f.host.exportArtifacts();mutate(artifacts.final.descriptor);
   await assert.rejects(()=>api.buildManagementBundle({state:f.host.exportState(),artifacts,registry:REFERENCE_REGISTRY}),{code:'WORKSPACE_DESCRIPTOR_MISMATCH'});
  }
 }finally{await f.host.dispose();}
});

test('valid foreign snapshot and rehashed persisted management-target splice cannot restore as accepted bindings',async()=>{
 const f=await auditFixture();try{
  const state=f.host.exportState(),first=f.host.exportArtifacts();await f.host.execute({requestId:'audit-B'});const second=f.host.exportArtifacts();
  first.final.snapshot=second.final.snapshot;first.final.descriptor.snapshotId=second.final.descriptor.snapshotId;
  await assert.rejects(()=>api.buildManagementBundle({state,artifacts:first,registry:REFERENCE_REGISTRY}),{code:'WORKSPACE_SNAPSHOT_BINDING'});
  const mutations=[m=>{delete m.target;},m=>{m.target.requestId='unrelated-request';},m=>{m.target.activeToken='unrelated-active-token';}];
  for(const mutate of mutations){const altered=structuredClone(second);mutate(altered.final.management);await assert.rejects(()=>api.buildManagementBundle({state:f.host.exportState(),artifacts:altered,registry:REFERENCE_REGISTRY}),{code:'WORKSPACE_SNAPSHOT_BINDING'});}
  const bundle=await api.buildManagementBundle({state:f.host.exportState(),artifacts:second,registry:REFERENCE_REGISTRY});
  for(const mutate of [m=>{m.target.managerRevision++;},...mutations]){
   const entries=unzipSync(bundle.bytes),manifest=JSON.parse(new TextDecoder().decode(entries['manifest.json']));
   mutate(manifest.extensions['works:management-workspace'].data.artifactRefs.find(r=>r.ref==='final').management);
   entries['manifest.json']=canonicalBytes(manifest);const receipt=JSON.parse(new TextDecoder().decode(entries['receipt.json']));receipt.manifestByteLength=entries['manifest.json'].byteLength;receipt.manifestSha256=await sha256Bytes(entries['manifest.json']);entries['receipt.json']=canonicalBytes(receipt);
   await assert.rejects(()=>api.readManagementBundle(zipSync(entries),{registry:REFERENCE_REGISTRY}),{code:'WORKSPACE_SNAPSHOT_BINDING'});
  }
 }finally{await f.host.dispose();}
});

test('unknown required extension remains blocked while known binary evidence and trace roundtrip without runtime grants',async()=>{
 const f=await auditFixture();try{
  const artifacts=f.host.exportArtifacts(),record=artifacts.final;
  record.descriptor.extensions={'owner:required':{schemaId:'owner:required',schemaVersion:'2',requiredForUse:true,data:{keep:[1,2]}}};
  record.evidence={schemaVersion:1,artifactId:record.descriptor.artifactId,records:[{evidenceId:'audit:evidence',data:{bytes:new Uint8Array([9,8])}}]};
  record.trace={schemaVersion:1,artifactId:record.descriptor.artifactId,records:[{traceId:'audit:trace',data:{frames:[4,4,0]}}]};
  const registry={...REFERENCE_REGISTRY,schemas:[...REFERENCE_REGISTRY.schemas,{schemaId:'owner:required',schemaVersion:'2'}]};
  await assert.rejects(()=>api.buildManagementBundle({state:f.host.exportState(),artifacts,registry:REFERENCE_REGISTRY}),{code:'WORKSPACE_UNVERIFIED'});
  const bundle=await api.buildManagementBundle({state:f.host.exportState(),artifacts,registry});
  await assert.rejects(()=>api.readManagementBundle(bundle.bytes,{registry:REFERENCE_REGISTRY}),{code:'WORKSPACE_UNVERIFIED'});
  const restored=await api.readManagementBundle(bundle.bytes,{registry});assert.deepEqual(restored.artifacts.final.evidence.records[0].data.bytes,new Uint8Array([9,8]));assert.deepEqual(restored.artifacts.final.trace.records[0].data.frames,[4,4,0]);
 }finally{await f.host.dispose();}
});

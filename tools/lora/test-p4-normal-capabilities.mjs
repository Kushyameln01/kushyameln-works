import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,loraSource,MODEL,GRAPH,PROFILE,W,B,conditioning,planInput} from './p4-adapter-fixture.mjs';
import {createDiffusionP4Adapter} from '../../docs/shared/inference/lora/diffusion-p4-adapter.mjs';

const POLICY='comfy-lora-b5a4321-linear-diff-v1';
async function setup(fn){const f=await fixture();try{await fn(f);}finally{await f.close();}}
async function binding(){return {ownerRecordId:'synthetic-owner-record:cross-q3',scope:'verified-runtime-target-range',sourceSha256:await loraSource().hash(),modelHash:MODEL,graphHash:GRAPH,side:'HIGH',executionProfileId:PROFILE,loaderPolicyId:POLICY,trainingBaseVerified:false,evidenceRef:{repository:'fixture-only',commit:'a'.repeat(40),path:'synthetic-owner-result.json',scope:'synthetic-original/control-only; not real LoRA acceptance'},targets:[{weightId:W,fullShape:[5120,5120],ranges:[{offset:2*5120,count:3*5120}]},{weightId:B,fullShape:[5120],ranges:[{offset:2,count:3}]}]};}
function request(record){return {operation:'apply',sourceSha256:record.sourceSha256,modelHash:record.modelHash,graphHash:record.graphHash,side:record.side,executionProfileId:record.executionProfileId,loaderPolicyId:record.loaderPolicyId,targets:[{weightId:W,fullShape:[5120,5120],slice:{startRow:2,rowCount:3},binding:{kind:'runtime-input',name:W},dtype:'F32',layout:'row-major',parameterRole:'weight'},{weightId:B,fullShape:[5120],slice:{startRow:2,rowCount:3},binding:{kind:'hike-parameter',name:B},dtype:'F32',layout:'row-major',parameterRole:'bias'}]};}
function adapter(f,sourceBindings){return createDiffusionP4Adapter({consumer:f.feed,isOwnerCurrent:()=>true,...(sourceBindings===undefined?{}:{sourceBindings})});}

test('P4 normal capability inspection requires no runtime or conditioning dependency',()=>setup(async f=>{
 const a=adapter(f),c=a.describeCapabilities();assert.equal(c.schemaVersion,'lora-p4-capabilities/0.1-draft.1');assert.equal(c.adapterVersion,'lora-diffusion-p4-adapter/0.2-draft.1');assert.equal(c.coverage,'PARTIAL');assert.equal(c.generationReady,false);assert.equal(c.targets.length,12);assert.deepEqual(c.loaderPolicy.variants,['linear-down-up','linear-a-b','additive-diff','additive-diff-b']);
 const q=c.targets.find(t=>t.weightId===W),ffn=c.targets.find(t=>t.weightId==='blocks.0.ffn.2.weight');assert.deepEqual(q.fullShape,[5120,5120]);assert.deepEqual(q.allowedRows,[0,5120]);assert.equal(q.storageDtype,'F8_E4M3');assert.equal(q.computeDtype,'F32');assert.equal(q.maxRows,16);assert.equal(ffn.maxRows,4);assert.equal(ffn.maxBlockElements,81920);assert.equal(Object.hasOwn(c,'original'),false);assert.equal(Object.hasOwn(c,'validationGate'),false);assert.equal(f.source.stats().reads,0);
 await assert.rejects(a.run(f.input(),{isCurrent:()=>true}),{code:'DIAGNOSTIC_RUNTIME_REQUIRED'});
 const p=await f.sdk.plan(planInput(f,a));assert.throws(()=>a.targetForPlan(p,f.validation()),{code:'DIAGNOSTIC_RUNTIME_REQUIRED'});
}));
test('P4 owner source binding captures immutable runtime-fit scope and all requested ranges',()=>setup(async f=>{
 const r=await binding(),query=request(r),a=adapter(f,[r]);r.targets[0].ranges[0].count=0;r.evidenceRef.scope='caller mutation';const result=a.assessSupport(query);
 assert.equal(result.supported,true);assert.deepEqual(result.reasonCodes,[]);assert.equal(result.sourceBinding.ownerRecordId,'synthetic-owner-record:cross-q3');assert.equal(result.sourceBinding.trainingBaseVerified,false);assert.equal(result.sourceBinding.scope,'verified-runtime-target-range');assert.equal(a.describeCapabilities().verifiedSourceBindings.length,1);
 const subset=request(await binding());subset.targets.forEach(t=>t.slice={startRow:3,rowCount:1});assert.equal(a.assessSupport(subset).supported,true);assert.equal(f.source.stats().reads,0);
}));
test('P4 normal support refuses unknown source, wrong base/graph/loader and unknown request mode',()=>setup(async f=>{
 const r=await binding(),a=adapter(f,[r]);for(const [field,value,reason]of [['sourceSha256','b'.repeat(64),'UNKNOWN_SOURCE_BINDING'],['modelHash','b'.repeat(64),'MODEL_IDENTITY_MISMATCH'],['graphHash','b'.repeat(64),'GRAPH_IDENTITY_MISMATCH'],['side','LOW','SIDE_MISMATCH'],['executionProfileId','other','EXECUTION_PROFILE_MISMATCH'],['loaderPolicyId','other','UNSUPPORTED_LOADER_POLICY'],['operation','mean','UNSUPPORTED_OPERATION']]){const q=request(r);q[field]=value;const result=a.assessSupport(q);assert.equal(result.supported,false,field);assert.ok(result.reasonCodes.includes(reason),field+': '+result.reasonCodes);}
 assert.equal(a.assessSupport({...request(r),sourceBindings:[r]}).supported,false);assert.equal(f.source.stats().reads,0);
}));
test('P4 normal support distinguishes native target range from owner-proven source range',()=>setup(async f=>{
 const r=await binding(),a=adapter(f,[r]);for(const [change,reason]of [[q=>q.targets[0].slice={startRow:5,rowCount:1},'SOURCE_RANGE_UNVERIFIED'],[q=>q.targets[0].slice={startRow:5120,rowCount:1},'TARGET_RANGE_UNSUPPORTED'],[q=>q.targets[0].fullShape=[4,5120],'FULL_SHAPE_MISMATCH'],[q=>q.targets[0].binding={kind:'initializer',name:W},'BINDING_MISMATCH'],[q=>q.targets[0].dtype='F16','DTYPE_UNSUPPORTED'],[q=>q.targets[0].layout='column-major','LAYOUT_UNSUPPORTED'],[q=>q.targets.push({...q.targets[0]}),'DUPLICATE_TARGET'],[q=>q.targets[0].weightId='unknown','TARGET_UNSUPPORTED']]){const q=request(r);change(q);const result=a.assessSupport(q);assert.equal(result.supported,false);assert.ok(result.reasonCodes.includes(reason),reason+': '+result.reasonCodes);}
 assert.equal(f.feed.stats().transactions,0);
}));
test('P4 source binding metadata rejects malformed, overlapping and training-guarantee declarations',()=>setup(async f=>{
 for(const change of [r=>r.trainingBaseVerified=true,r=>r.targets[0].ranges[0].offset++,r=>r.targets[0].ranges.push({...r.targets[0].ranges[0]}),r=>r.sourceSha256='bad',r=>r.targets[0].fullShape=[4,5120],r=>r.evidenceRef=null]){const r=await binding();change(r);assert.throws(()=>adapter(f,[r]),{code:'INVALID_SOURCE_BINDING'});}
}));
test('P4 default owner binding is explicitly light LOW cross-Q4 and never all-target acceptance',()=>setup(async f=>{
 const {KNOWN_P4_SOURCE_BINDINGS}=await import('../../docs/shared/inference/lora/p4-source-bindings.mjs');assert.equal(KNOWN_P4_SOURCE_BINDINGS.length,1);const r=KNOWN_P4_SOURCE_BINDINGS[0];assert.equal(r.side,'LOW');assert.equal(r.sourceSha256,'86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b');assert.deepEqual(r.targets.map(t=>t.ranges),[[{offset:0,count:20480}],[{offset:0,count:4}]]);assert.equal(r.trainingBaseVerified,false);
 const a=adapter(f);assert.equal(a.describeCapabilities().verifiedSourceBindings.length,0);const result=a.assessSupport(request(r));assert.equal(result.supported,false);assert.ok(result.reasonCodes.includes('MODEL_IDENTITY_MISMATCH'));
}));
test('P4 support answers reflect stale owner and changed native registry without reading weights',()=>setup(async f=>{
 const r=await binding(),q=request(r);let current=true,changed=false;const a=createDiffusionP4Adapter({consumer:{...f.feed,registry(){const d=f.feed.registry();if(changed)d.registryHash='0'.repeat(64);return d;}},isOwnerCurrent:()=>current,sourceBindings:[r]});
 current=false;assert.ok(a.assessSupport(q).reasonCodes.includes('OWNER_NOT_CURRENT'));current=true;changed=true;assert.ok(a.assessSupport(q).reasonCodes.includes('NATIVE_REGISTRY_CHANGED'));assert.equal(f.source.stats().reads,0);
}));
test('P4 application range budget is independent from the per-block row limit',()=>setup(async f=>{
 const r=await binding();r.targets[0].ranges=[{offset:0,count:5120*5120}];const a=adapter(f,[r]),q=request(r);q.targets=[{...q.targets[0],slice:{startRow:0,rowCount:820}}];const result=a.assessSupport(q);assert.equal(result.supported,false);assert.ok(result.reasonCodes.includes('PATCH_BUDGET_EXCEEDED'));assert.equal(f.feed.stats().transactions,0);
}));
test('P4 weight axes and normalization use existing descriptor values and reject incompatible declarations',()=>setup(async f=>{
 const r=await binding(),a=adapter(f,[r]),caps=a.describeCapabilities();assert.deepEqual(caps.targets.find(t=>t.weightId===W).axes,['O','I']);assert.deepEqual(caps.targets.find(t=>t.weightId===B).axes,['O']);assert.equal(caps.targets.find(t=>t.weightId===W).normalization,'none');
 const q=request(r);q.targets[0].axes=['O','I'];q.targets[0].normalization='none';q.targets[1].axes=['O'];q.targets[1].normalization='none';assert.equal(a.assessSupport(q).supported,true);
 q.targets[0].axes=['I','O'];assert.ok(a.assessSupport(q).reasonCodes.includes('AXES_UNSUPPORTED'));q.targets[0].axes=['O','I'];q.targets[0].normalization='normalized';assert.ok(a.assessSupport(q).reasonCodes.includes('NORMALIZATION_UNSUPPORTED'));
}));
test('P4 base restoration capability needs no LoRA source or target request and refuses source-specific fields',()=>setup(async f=>{
 const a=adapter(f,[]),q={operation:'restore-base',modelHash:MODEL,graphHash:GRAPH,side:'HIGH',executionProfileId:PROFILE};const result=a.assessSupport(q);assert.equal(result.supported,true);assert.deepEqual(result.reasonCodes,[]);assert.equal(result.sourceBinding,null);
 for(const extra of [{sourceSha256:'a'.repeat(64)},{targets:[]},{loaderPolicyId:POLICY}]){const denied=a.assessSupport({...q,...extra});assert.equal(denied.supported,false);assert.ok(denied.reasonCodes.includes('RESTORE_SOURCE_FIELDS_UNSUPPORTED'));}
 assert.equal(f.source.stats().reads,0);
}));

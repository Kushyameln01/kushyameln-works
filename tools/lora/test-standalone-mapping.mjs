import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as plannerV2 from '../../docs/shared/inference/lora/planner-v2.mjs';
import * as oldTargets from '../../docs/shared/diffusion-models/lora/targets.mjs';

const modelHash='a'.repeat(64),sourceSha256='f'.repeat(64);
const key='diffusion_model.blocks.0.self_attn.q.weight';
const inventory=JSON.parse(fs.readFileSync(new URL('../../development/lora/contracts/original-inventory.json',import.meta.url)));
const loadRegistry=()=>import('../../docs/shared/inference/lora/standalone-registry.mjs');
const loadPlanner=()=>import('../../docs/shared/inference/lora/standalone-planner.mjs');

// Mutations caught: exporting a second classifier, changing factor orientation,
// or accepting an unsupported dialect before target selection.
test('standalone shares the v2 classifier and preserves loader arithmetic',()=>{
 assert.equal(typeof plannerV2.classifyPatchesV2,'function');
 const tensors={
  'x.lora_down.weight':{dtype:'F16',shape:[2,3]},
  'x.lora_up.weight':{dtype:'F32',shape:[4,2]},
  'x.alpha':{dtype:'BF16',shape:[]},
  'x.diff_b':{dtype:'F32',shape:[4]}
 };
 const operations=plannerV2.classifyPatchesV2({tensors},{loaderPolicyId:plannerV2.LOADER_POLICY_ID,strength:-1,alphaValues:{'x.alpha':1}});
 assert.deepEqual(operations.map(o=>[o.key,o.fullShape,o.scale,o.variant]),[
  ['x.weight',[4,3],-0.5,'linear-down-up'],['x.bias',[4],-1,'additive-diff-b']
 ]);
 assert.throws(()=>plannerV2.classifyPatchesV2({tensors:{...tensors,'x.dora_scale':{dtype:'BF16',shape:[4]}}},{loaderPolicyId:plannerV2.LOADER_POLICY_ID,strength:1,alphaValues:{'x.alpha':1}}),/unknown|Unsupported/);
});

// Mutations caught: duplicated generated data or a broken legacy import path.
test('canonical table has one LoRA owner and preserves all existing Diffusion exports',async()=>{
 const canonical=await import('../../docs/shared/inference/lora/bernini-targets.mjs');
 assert.equal(oldTargets.BERNINI_TARGETS,canonical.BERNINI_TARGETS);
 assert.equal(oldTargets.TARGET_PROVENANCE,canonical.TARGET_PROVENANCE);
 assert.equal(oldTargets.resolveLoraTarget,canonical.resolveLoraTarget);
 assert.equal(oldTargets.resolveLoraBiasTarget,canonical.resolveLoraBiasTarget);
 assert.equal(oldTargets.BERNINI_TARGETS.length,1095);
});

test('Bernini registry supplies logical identities without inventing graph slots',async()=>{
 const {createBerniniStandaloneRegistry,validateStandaloneRegistry,STANDALONE_CONTRACT_VERSION}=await loadRegistry();
 const registry=createBerniniStandaloneRegistry({modelHash,side:'HIGH'});
 assert.equal(registry.contractVersion,STANDALONE_CONTRACT_VERSION);
 assert.equal(registry.targets.length,1053);
 assert.ok(!('graphHash' in registry));assert.ok(!('executionProfileId' in registry));
 const target=registry.targets.find(t=>t.key===key);
 assert.deepEqual(target,{key,weightId:'blocks.0.self_attn.q.weight',fullShape:[5120,5120],dtype:'F32',layout:'row-major',parameterRole:'weight',logicalBinding:{kind:'logical-weight',name:'blocks.0.self_attn.q.weight'}});
 assert.ok(!('binding' in target));assert.ok(Object.isFrozen(target.fullShape));
 const checked=validateStandaloneRegistry(registry);assert.deepEqual(checked,registry);assert.notEqual(checked,registry);
});

function inspectionFromInventory(item){
 const tensors={},alphaValues={};
 for(const pair of item.lowRankPairs){
  const down=item.pairId==='light'?'.lora_down.weight':'.lora_A.weight';
  const up=item.pairId==='light'?'.lora_up.weight':'.lora_B.weight';
  tensors[pair.targetStem+down]={dtype:'BF16',shape:pair.downShape};
  tensors[pair.targetStem+up]={dtype:'BF16',shape:pair.upShape};
  if(pair.alpha!==null){tensors[pair.targetStem+'.alpha']={dtype:'BF16',shape:[]};alphaValues[pair.targetStem+'.alpha']=pair.alpha;}
 }
 // Golden shape rules are independent of the production canonical resolver.
 for(const stem of item.weightDiffTargets)tensors[stem+'.diff']={dtype:'BF16',shape:stem==='diffusion_model.head.head'?[64,5120]:[5120]};
 for(const stem of item.biasDiffTargets)tensors[stem+'.diff_b']={dtype:'BF16',shape:[stem==='diffusion_model.head.head'?64:stem.endsWith('.ffn.0')?13824:stem==='diffusion_model.time_projection.1'?30720:5120]};
 assert.equal(Object.keys(tensors).length,item.tensorCount);
 return {inspection:{tensors},alphaValues};
}

test('cached original inventory maps every declared patch and original full coordinate',async()=>{
 const {createBerniniStandaloneRegistry}=await loadRegistry();const {buildStandalonePlan}=await loadPlanner();
 let totalPatches=0,totalElements=0;
 for(const item of inventory){
  const registry=createBerniniStandaloneRegistry({modelHash,side:item.side.toUpperCase()});
  const plan=buildStandalonePlan({...inspectionFromInventory(item),registry,sourceSha256:item.sha256,strength:1,loaderPolicyId:plannerV2.LOADER_POLICY_ID});
  const light=item.pairId==='light';
  assert.equal(plan.coverage,'FULL');assert.equal(plan.completeAdapter,true);
  assert.equal(plan.operations.length,light?1052:400);
  assert.equal(plan.operations.reduce((n,o)=>n+o.fullShape.reduce((a,b)=>a*b,1),0),light?14286919744:14050918400);
  assert.deepEqual(plan.excludedTargets,[]);assert.deepEqual(plan.excludedRegions,[]);
  assert.equal(plan.mapping.logicalNameShapeMatched,true);assert.equal(plan.mapping.standaloneTargetSupported,true);
  assert.equal(plan.mapping.graphBinding,'UNBOUND');assert.equal(plan.mapping.trainingBaseVerified,false);
  for(const op of plan.operations){assert.deepEqual(op.slice,{startRow:0,rowCount:op.fullShape[0]});assert.deepEqual(op.fullShape,op.target.fullShape);}
  totalPatches+=plan.operations.length;totalElements+=plan.operations.reduce((n,o)=>n+o.fullShape.reduce((a,b)=>a*b,1),0);
 }
 assert.equal(totalPatches,2904);assert.equal(totalElements,56675676288);
});

test('explicit row selection retains original full shape and reports omitted targets and tails',async()=>{
 const {createBerniniStandaloneRegistry}=await loadRegistry();const {buildStandalonePlan}=await loadPlanner();
 const registry=createBerniniStandaloneRegistry({modelHash,side:'LOW'});
 const plan=buildStandalonePlan({...inspectionFromInventory(inventory[0]),registry,sourceSha256,strength:1,loaderPolicyId:plannerV2.LOADER_POLICY_ID,selections:[{key,slice:{startRow:3,rowCount:17}}]});
 assert.equal(plan.coverage,'PARTIAL');assert.equal(plan.completeAdapter,false);assert.equal(plan.operations.length,1);
 assert.deepEqual(plan.operations[0].fullShape,[5120,5120]);assert.deepEqual(plan.operations[0].slice,{startRow:3,rowCount:17});
 assert.equal(plan.excludedTargets.length,1051);
 assert.deepEqual(plan.excludedRegions.map(x=>x.slice),[{startRow:0,rowCount:3},{startRow:20,rowCount:5100}]);
});

test('source hash identifies structurally compatible content without a sample allowlist',async()=>{
 const {createBerniniStandaloneRegistry}=await loadRegistry();const {buildStandalonePlan}=await loadPlanner();
 const args={...inspectionFromInventory(inventory[2]),registry:createBerniniStandaloneRegistry({modelHash,side:'HIGH'}),strength:0,loaderPolicyId:plannerV2.LOADER_POLICY_ID};
 const plan=buildStandalonePlan({...args,sourceSha256});assert.equal(plan.sourceSha256,sourceSha256);assert.equal(plan.operations.length,400);
 assert.ok(plan.operations.every(o=>o.scale===0));
 assert.throws(()=>buildStandalonePlan({...args,sourceSha256:'not-a-hash'}),/SHA|hash/i);
});

test('registries reject ambiguous logical identities and mismatching Bernini descriptors',async()=>{
 const {createBerniniStandaloneRegistry,validateStandaloneRegistry}=await loadRegistry();
 const registry=createBerniniStandaloneRegistry({modelHash,side:'HIGH'});const first=registry.targets[0],second=registry.targets.find(t=>t.key!==first.key&&t.parameterRole===first.parameterRole);
 for(const target of [first,{...second,weightId:first.weightId},{...second,logicalBinding:first.logicalBinding}]){
  assert.throws(()=>validateStandaloneRegistry({...registry,targets:[first,target]}),/Duplicate|duplicate/);
 }
 for(const target of [{...first,fullShape:[1]},{...first,dtype:'BF16'},{...first,logicalBinding:{kind:'runtime-input',name:'fake-slot'}}]){
  assert.throws(()=>createBerniniStandaloneRegistry({modelHash,side:'HIGH',targets:[target]}),/shape|dtype|logical|target/i);
 }
 assert.throws(()=>validateStandaloneRegistry({...registry,graphHash:'b'.repeat(64)}),/unknown|Unsupported/);
 assert.throws(()=>validateStandaloneRegistry({...registry,side:'BOTH'}),/side|identity/i);
 assert.throws(()=>validateStandaloneRegistry({...registry,modelHash:new String(modelHash)}),/identity/i);
 assert.throws(()=>createBerniniStandaloneRegistry({modelHash,side:'HIGH',targets:null}),/identity|target/i);
});

test('plans reject absent targets, shape mismatches, duplicate selections and invalid coordinates',async()=>{
 const {createBerniniStandaloneRegistry}=await loadRegistry();const {buildStandalonePlan}=await loadPlanner();
 const registry=createBerniniStandaloneRegistry({modelHash,side:'HIGH'});
 const args={...inspectionFromInventory(inventory[2]),registry,sourceSha256,strength:1,loaderPolicyId:plannerV2.LOADER_POLICY_ID};
 assert.throws(()=>buildStandalonePlan({...args,registry:{...registry,targets:registry.targets.filter(t=>t.key!==key)}}),/Missing target/);
 assert.throws(()=>buildStandalonePlan({...args,registry:{...registry,targets:registry.targets.map(t=>t.key===key?{...t,fullShape:[5120,5119]}:t)}}),/shape mismatch/i);
 for(const selections of [[],[{key,slice:{startRow:-1,rowCount:1}}],[{key,slice:{startRow:5119,rowCount:2}}],[{key,slice:{startRow:0,rowCount:0}}],[{key,slice:{startRow:0,rowCount:1,columnCount:1}}],[{key,slice:{startRow:0,rowCount:1}},{key,slice:{startRow:1,rowCount:1}}],[{key:'missing.weight',slice:{startRow:0,rowCount:1}}]]){
  assert.throws(()=>buildStandalonePlan({...args,selections}),/selection|slice|coordinate|Duplicate|Missing|Unsupported/i);
 }
});

test('classifier rejects rank, alpha and dialect problems before selection can hide them',()=>{
 assert.equal(typeof plannerV2.classifyPatchesV2,'function');
 const opts={loaderPolicyId:plannerV2.LOADER_POLICY_ID,strength:1,alphaValues:{}};
 for(const tensors of [
  {'x.lora_A.weight':{dtype:'BF16',shape:[2,3]}},
  {'x.lora_A.weight':{dtype:'BF16',shape:[0,3]},'x.lora_B.weight':{dtype:'BF16',shape:[4,0]}},
  {'x.lora_A.weight':{dtype:'BF16',shape:[2,3]},'x.lora_B.weight':{dtype:'BF16',shape:[4,3]}},
  {'x.lora_A.weight':{dtype:'BF16',shape:[2,3]},'x.lora_up.weight':{dtype:'BF16',shape:[4,2]}},
  {'x.alpha':{dtype:'BF16',shape:[]}},
  {'x.diff':{dtype:'I8',shape:[4]}},
  {'x.lora_A.weight':{dtype:'BF16',shape:[2,3]},'x.lora_B.weight':{dtype:'BF16',shape:[4,2]},'x.alpha':{dtype:'BF16',shape:[]}}
 ])assert.throws(()=>plannerV2.classifyPatchesV2({tensors},opts),/Unsupported|invalid|Missing|mismatch/i);
 const absent=plannerV2.classifyPatchesV2({tensors:{'x.lora_A.weight':{dtype:'BF16',shape:[2,3]},'x.lora_B.weight':{dtype:'BF16',shape:[4,2]}}},opts);
 assert.equal(absent[0].scale,1);assert.equal(absent[0].alpha,null);
});

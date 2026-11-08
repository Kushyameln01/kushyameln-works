import test from 'node:test';
import assert from 'node:assert/strict';

const plannerURL=new URL('../../docs/shared/inference/lora/planner-v2.mjs',import.meta.url);
const policyURL=new URL('../../docs/shared/inference/lora/loader-policy.mjs',import.meta.url);
const VERSION='lora-connection/2.0-draft.1';
const POLICY='comfy-lora-b5a4321-linear-diff-v1';
const HASH='a'.repeat(64);
async function modules(){return {p:await import(plannerURL),l:await import(policyURL)};}
function tensor(shape,dtype='BF16'){return {shape,dtype};}
function inspection(){return {tensors:{
 'q.lora_down.weight':tensor([2,3]),'q.lora_up.weight':tensor([4,2]),'q.alpha':tensor([]),
 'q.diff_b':tensor([4]),'norm.diff':tensor([4]),'other.lora_A.weight':tensor([1,3]),'other.lora_B.weight':tensor([4,1])
}};}
function target(key,shape,kind='runtime-input'){
return {key,weightId:key,module:'diffusion_models',shape,dtype:'F32',layout:'row-major',parameterRole:key.endsWith('.bias')?'bias':'weight',binding:{kind,name:key},transform:{kind:'identity'}};
}
function registry(){return {contractVersion:VERSION,modelHash:HASH,graphHash:HASH,registryVersion:'fixture-v2',side:'HIGH',executionProfileId:'small-linear-fixture',loaderPolicyId:POLICY,targets:[target('q.weight',[4,3]),target('q.bias',[4],'hike-parameter'),target('norm.weight',[4],'initializer'),target('other.weight',[4,3],'initializer')]};}
function request(extra={}){return {inspection:inspection(),registry:registry(),sourceSha256:HASH,strength:2,loaderPolicyId:POLICY,alphaValues:{'q.alpha':4},...extra};}

test('v2 entrypoint is additive and fixes the loader source and supported variants',async()=>{
 const {p,l}=await modules();assert.equal(p.CONTRACT_VERSION,VERSION);assert.equal(p.LOADER_POLICY_ID,POLICY);
 assert.equal(l.LOADER_POLICY.sourceCommit,'b5a432157de6b8884f81104cd02926adf4d597e4');
 assert.deepEqual(l.LOADER_VARIANTS,['linear-down-up','linear-a-b','additive-diff','additive-diff-b']);
});
test('fixed policy uses alpha/rank, absent alpha one and strength for delta only',async()=>{
 const {p}=await modules(),plan=p.buildPlanV2(request());
 assert.equal(plan.coverage,'FULL');assert.equal(plan.completeAdapter,true);
 assert.deepEqual(plan.operations.map(o=>[o.target.key,o.scale]),[['q.weight',4],['q.bias',2],['norm.weight',2],['other.weight',2]]);
 assert.equal(plan.operations[0].rank,2);assert.equal(plan.operations[0].alpha,4);
 for(const strength of [0,-2]){const x=p.buildPlanV2(request({strength}));assert.equal(x.operations[0].scale,2*strength);assert.equal(x.operations[1].scale,strength);}
 const zero=p.buildPlanV2(request({alphaValues:{'q.alpha':0}}));assert.equal(zero.operations[0].scale,0);
 const negative=p.buildPlanV2(request({alphaValues:{'q.alpha':-2}}));assert.equal(negative.operations[0].scale,-2);
});
test('missing loader policy or unknown variant never receives a default scale',async()=>{
 const {p,l}=await modules();
 for(const loaderPolicyId of [undefined,'other-policy'])assert.throws(()=>p.buildPlanV2(request({loaderPolicyId})),/loader|policy/i);
 for(const alphaValues of [{},{'q.alpha':NaN},{'q.alpha':Infinity}])assert.throws(()=>p.buildPlanV2(request({alphaValues})),/alpha/i);
 assert.throws(()=>l.effectiveScale({loaderPolicyId:POLICY,variant:'dora',rank:2,alpha:null,strength:1}),/variant/i);
 assert.throws(()=>p.buildPlanV2(request({strength:Number.MAX_VALUE})),/strength|scale/i);
});
test('all binding kinds preserve their own names and reject graphInitializer spoofing',async()=>{
 const {p}=await modules(),r=p.validateRegistryV2(registry());
 assert.deepEqual(r.targets.map(t=>t.binding.kind),['runtime-input','hike-parameter','initializer','initializer']);
 assert.equal('graphInitializer' in r.targets[0],false);assert.equal(r.targets[0].binding.name,'q.weight');
 const bad=registry();bad.targets[0].graphInitializer='q.weight';assert.throws(()=>p.validateRegistryV2(bad),/unknown|unsupported|graphInitializer/i);
});
test('registry rejects unsupported transforms, ambiguous bindings and unsafe shapes',async()=>{
 const {p}=await modules();
 for(const change of [r=>{r.targets[0].binding.kind='unknown';},r=>{r.targets[0].transform={kind:'transpose'};},r=>{r.targets[0].slice={startRow:0,rowCount:1};},r=>{r.targets[0].quantization={dtype:'FP8'};},r=>{r.targets[0].dtype='FP8';},r=>{r.targets[0].shape=[Number.MAX_SAFE_INTEGER,2];},r=>{r.targets[1].binding={...r.targets[0].binding};},r=>{r.targets[0].parameterRole='bias';}]){
  const r=registry();change(r);assert.throws(()=>p.validateRegistryV2(r),/unsupported|duplicate|invalid|role|shape/i);
 }
});
test('partial keeps original shapes, exact source and included/excluded patches',async()=>{
 const {p}=await modules();const r=registry();r.targets=r.targets.filter(t=>t.key.startsWith('q.'));
 const plan=p.buildPlanV2(request({registry:r,diagnostic:{targets:[{key:'q.weight',slice:{startRow:1,rowCount:2}},{key:'q.bias',slice:{startRow:1,rowCount:2}}]}}));
 assert.equal(plan.coverage,'PARTIAL');assert.equal(plan.completeAdapter,false);assert.equal(plan.sourceSha256,HASH);
 assert.deepEqual(plan.operations[0].fullShape,[4,3]);assert.deepEqual(plan.operations[0].target.shape,[4,3]);assert.deepEqual(plan.operations[0].slice,{startRow:1,rowCount:2});
 assert.deepEqual(plan.includedPatches.map(x=>x.key),['q.weight','q.bias']);
 assert.deepEqual(plan.excludedTargets.map(x=>x.key),['norm.weight','other.weight']);
 assert.deepEqual(plan.excludedTargets[0].names,['norm.diff']);
 assert.deepEqual(plan.includedPatches[1].names,['q.diff_b']);
 assert.deepEqual(plan.excludedRegions.filter(x=>x.key==='q.weight').map(x=>x.slice),[{startRow:0,rowCount:1},{startRow:3,rowCount:1}]);
 assert.ok(Object.isFrozen(plan.operations[0].target.binding));
});
test('partial still rejects unknown and malformed excluded tensors',async()=>{
 const {p}=await modules(),diagnostic={targets:[{key:'q.weight',slice:{startRow:0,rowCount:1}}]};
 for(const mutate of [i=>{i.tensors['excluded.dora_scale']=tensor([4]);},i=>{i.tensors['other.lora_B.weight']=tensor([4,2]);},i=>{i.tensors['other.lora_mid.weight']=tensor([1,1]);},i=>{i.tensors['norm.diff']=tensor([1,1,1,1]);}]){
  const i=inspection();mutate(i);assert.throws(()=>p.buildPlanV2(request({inspection:i,diagnostic})),/unknown|unsupported|rank|shape/i);
 }
});
test('full plan never accepts incomplete registry while diagnostic has explicit selection',async()=>{
 const {p}=await modules(),r=registry();r.targets=r.targets.filter(t=>t.key==='q.weight');
 assert.throws(()=>p.buildPlanV2(request({registry:r})),/missing.*target/i);
 const plan=p.buildPlanV2(request({registry:r,diagnostic:{targets:[{key:'q.weight',slice:{startRow:0,rowCount:4}}]}}));
 assert.equal(plan.coverage,'PARTIAL');assert.equal(plan.completeAdapter,false);assert.equal(plan.excludedTargets.length,3);
});
test('diagnostic rejects unsafe, empty, duplicate and column slices before execution',async()=>{
 const {p}=await modules();
 for(const diagnostic of [{targets:[]},{targets:[{key:'q.weight',slice:{startRow:-1,rowCount:1}}]},{targets:[{key:'q.weight',slice:{startRow:3,rowCount:2}}]},{targets:[{key:'q.weight',slice:{startRow:0,rowCount:0}}]},{targets:[{key:'q.weight',slice:{startRow:0,rowCount:1,startColumn:1}}]},{targets:[{key:'missing.weight',slice:{startRow:0,rowCount:1}}]},{targets:[{key:'q.weight',slice:{startRow:0,rowCount:1}},{key:'q.weight',slice:{startRow:1,rowCount:1}}]}])assert.throws(()=>p.buildPlanV2(request({diagnostic})),/slice|diagnostic|missing|duplicate|unknown|target/i);
});
test('factor dialect mixing, orphan alpha, unsupported dtype and target mismatch reject',async()=>{
 const {p}=await modules();
 for(const mutate of [i=>{i.tensors['q.lora_A.weight']=i.tensors['q.lora_down.weight'];},i=>{delete i.tensors['q.lora_up.weight'];},i=>{i.tensors['orphan.alpha']=tensor([]);},i=>{i.tensors['q.alpha']=tensor([1]);},i=>{i.tensors['q.lora_down.weight'].dtype='I8';}]){const i=inspection();mutate(i);assert.throws(()=>p.buildPlanV2(request({inspection:i})),/unsupported|mixed|incomplete|orphan|alpha|dtype/i);}
 const r=registry();r.targets[0].shape=[2,6];assert.throws(()=>p.buildPlanV2(request({registry:r})),/shape/i);
});
test('alpha attached to a diff-only target is an orphan rather than an inferred multiplier',async()=>{
 const {p}=await modules(),i=inspection();i.tensors['norm.alpha']=tensor([]);
 assert.throws(()=>p.buildPlanV2(request({inspection:i,alphaValues:{'q.alpha':4,'norm.alpha':2}})),/orphan alpha/i);
});
test('plan identity inputs must be explicit and caller data remains unchanged',async()=>{
 const {p}=await modules();for(const sourceSha256 of [undefined,'wrong'])assert.throws(()=>p.buildPlanV2(request({sourceSha256})),/source|hash/i);
 const q=request(),before=structuredClone(q),plan=p.buildPlanV2(q);assert.deepEqual(q,before);q.registry.targets[0].binding.name='mutated';assert.equal(plan.registry.targets[0].binding.name,'q.weight');
});

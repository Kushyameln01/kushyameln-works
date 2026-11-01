import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,planInput,context,conditioning,digest,W,identities} from './p4-adapter-fixture.mjs';
const module=await import('../../docs/shared/inference/lora/diffusion-p4-adapter.mjs').catch(()=>({}));
function adapter(f,changes={}){assert.equal(typeof module.createDiffusionP4Adapter,'function','versioned P4 canonical LoRA adapter required');return module.createDiffusionP4Adapter({consumer:f.feed,isOwnerCurrent:()=>true,run:f.run,cloneConditioning:conditioning.cloneP4CapturedConditioning,...changes});}
async function withFixture(fn,options){const f=await fixture(options);try{await fn(f);}finally{await f.close();}}
async function prepared(f,a,strength=1){const plan=await f.sdk.plan(planInput(f,a,strength)),sink=a.createSink(plan),value=await f.sdk.prepare(plan,{baseProvider:a.baseProvider,sink});return {plan,sink,value};}
test('P4 exposes verified distinct registry and full-coordinate bounded bindings',()=>withFixture(async f=>{
 const a=adapter(f),d=await a.describeBinding();assert.equal(module.P4_ADAPTER_VERSION,'lora-diffusion-p4-adapter/0.1-draft.1');assert.equal(d.offsetUnit,'elements in original full tensor');assert.notEqual(d.nativeRegistryHash,d.connectionRegistryHash);assert.equal(a.registry.targets.length,12);
 const down=a.registry.targets.find(t=>t.weightId==='blocks.0.ffn.2.weight');assert.deepEqual(down.shape,[5120,13824]);assert.equal(down.blockLimits.maxRows,4);assert.equal(down.blockLimits.maxElements,81920);assert.equal(down.binding.kind,'runtime-input');assert.equal(down.binding.name,down.weightId);assert.equal(Object.hasOwn(down,'graphInitializer'),false);
 const forged=f.feed.registry();forged.targets[0].binding.kind='initializer';assert.throws(()=>adapter(f,{consumer:{...f.feed,registry:()=>forged}}),/registry|binding|integrity/i);
 const wrong=f.feed.registry();wrong.modelHash='0'.repeat(64);const {registryHash,...body}=wrong;wrong.registryHash=identities.diagnosticRegistryHash(body);assert.throws(()=>adapter(f,{consumer:{...f.feed,registry:()=>wrong}}),/registry|model|identity/i);
}));
test('P4 full-row FFN-down blocks remain bounded and selected slices use original coordinates',()=>withFixture(async f=>{
 const a=adapter(f),p=await prepared(f,a);assert.ok(p.value.manifest.blocks.every(b=>b.count<=81920&&(b.parameterRole!=='weight'||b.slice.rowCount<=4)));assert.deepEqual(p.value.manifest.blocks.filter(b=>b.parameterRole==='weight').map(b=>b.slice),[{startRow:2,rowCount:4},{startRow:6,rowCount:2}]);assert.equal(p.value.manifest.blocks[0].offset,2*13824);await f.sdk.release(p.value);
},{stem:'blocks.0.ffn.2',rowCount:6}));
test('P4 strength0/positive/negative/reapply and release retain independent active bytes',()=>withFixture(async f=>{
 const a=adapter(f);let positive;
 for(const strength of [0,1,-1,1]){const p=await prepared(f,a,strength),v=f.validation(strength),receipt=await f.sdk.stage(p.value,a.targetForPlan(p.plan,v));assert.equal(receipt.state,'CONSUMER_APPLIED');assert.equal(receipt.coverage,'PARTIAL');assert.equal(receipt.validation.evidence.nativeReceipt.valid,true);assert.equal(receipt.ownership.kind,'independent-copy');await f.sdk.release(p.value);await a.finalize(p.plan);const result=await a.run(f.input(),{isCurrent:()=>true});assert.equal(result.output[0],v.expected[0]);assert.equal((await f.feed.readRows(W,0,1)).values[0],2);assert.equal((await a.baseProvider.readBlock(W,2*5120,5120,{modelHash:p.plan.registry.modelHash,graphHash:p.plan.registry.graphHash,registryHash:p.plan.registryHash,fullShape:[5120,5120],side:'HIGH',executionProfileId:p.plan.registry.executionProfileId}))[0],2);if(strength===1){const h=digest((await f.feed.readRows(W,2,1)).values);if(positive)assert.equal(h,positive);positive=h;}}
 const result=await a.restoreBase({...f.validation(0),isCurrent:()=>true});assert.equal(result.application,'IMMUTABLE_BASE');assert.equal(result.snapshotPublished,false);assert.equal((await a.run(f.input(),{isCurrent:()=>true})).output[0],5);
}));
test('P4 rejects FULL, forged slice, oversized selection and unknown original tensor before writes',()=>withFixture(async f=>{
 const a=adapter(f),p=await f.sdk.plan(planInput(f,a));const full={...p,coverage:'FULL'};await assert.rejects(a.createSink(full).begin({...p}),/partial|plan/i);
 const bad={...p,operations:p.operations.map((o,i)=>i?o:{...o,fullShape:[1,5120]})};await assert.rejects(a.createSink(bad).begin({...p}),/shape|slice|plan/i);
 const big=await f.sdk.plan({...planInput(f,a),diagnostic:{targets:[{key:'diffusion_model.'+W,slice:{startRow:0,rowCount:820}}]}});await assert.rejects(a.createSink(big).begin({...p}),/budget|patch|bytes/i);assert.equal(f.feed.stats().transactions,0);
}));
test('P4 unknown source tensor is rejected by actual SDK planner',()=>withFixture(async f=>{const a=adapter(f);await assert.rejects(f.sdk.plan(planInput(f,a)),/unknown|unsupported/i);assert.equal(f.feed.stats().transactions,0);},{unknown:true}));
test('P4 input/expected/conditioning are captured before caller mutation',()=>withFixture(async f=>{
 const a=adapter(f),p=await prepared(f,a),v=f.validation(),target=a.targetForPlan(p.plan,v);v.input.residual.fill(100);v.input.timeAct1.fill(100);v.expected.fill(100);v.input.conditioning.data.fill(100);const receipt=await f.sdk.stage(p.value,target);assert.equal(receipt.validation.valid,true);await f.sdk.release(p.value);await a.finalize(p.plan);
 const bad=f.validation();bad.input.conditioning=structuredClone(bad.input.conditioning);assert.throws(()=>a.targetForPlan(p.plan,bad),/capture|conditioning|recogn/i);
}));
test('P4 rejects boolean validation and failed numerical reference and preserves prior feed',()=>withFixture(async f=>{
 const a=adapter(f),p=await prepared(f,a),v=f.validation();v.expected.fill(100);v.expectedSHA256=digest(v.expected);await assert.rejects(f.sdk.stage(p.value,a.targetForPlan(p.plan,v)),/validation|scope/i);assert.equal(f.feed.stats().epoch,0);assert.equal(f.feed.stats().candidates,0);await f.sdk.release(p.value);
 const b=adapter(f,{consumer:{...f.feed,validate:async()=>true}}),q=await prepared(f,b);await assert.rejects(f.sdk.stage(q.value,b.targetForPlan(q.plan,f.validation())),/receipt|validation/i);await f.sdk.release(q.value);
}));
test('P4 cancellation reaches the run signal and cleanup survives stale SDK selection',()=>withFixture(async f=>{
 let entered,release;const enteredP=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);let seen;
 const a=adapter(f,{run:async(view,input)=>{seen=input.signal;entered();await barrier;return f.run(view,input);}}),p=await prepared(f,a),controller=new AbortController(),task=f.sdk.stage(p.value,a.targetForPlan(p.plan,f.validation()),{signal:controller.signal});await enteredP;controller.abort();release();await assert.rejects(task);assert.equal(seen.aborted,true);assert.equal(f.feed.stats().epoch,0);assert.equal(f.feed.stats().candidates,0);await f.sdk.release(p.value);
 const recovered=adapter(f),next=await prepared(f,recovered);const receipt=await f.sdk.stage(next.value,recovered.targetForPlan(next.plan,f.validation()));assert.equal(receipt.state,'CONSUMER_APPLIED');await f.sdk.release(next.value);await recovered.finalize(next.plan);
}));
test('P4 old rollback cannot overwrite a later committed feed',()=>withFixture(async f=>{
 const a=adapter(f),old=await prepared(f,a,1),t=a.targetForPlan(old.plan,f.validation(1)),ctx=context(old.value),c=await t.prepareLoad(old.value.handle,ctx);await t.validate(c,ctx);await t.commit(c,ctx);await f.sdk.release(old.value);
 const next=await prepared(f,a,-1);await f.sdk.stage(next.value,a.targetForPlan(next.plan,f.validation(-1)));const before=f.feed.describe();await t.rollback(c,{...ctx,isCurrent:()=>false});assert.equal(f.feed.describe().packageHash,before.packageHash);assert.equal((await a.run(f.input(),{isCurrent:()=>true})).output[0],4.625);await f.sdk.release(next.value);await a.finalize(next.plan);
}));
test('P4 rejects rehashed wrong graph/profile/rows/operator instead of trusting hash labels',()=>withFixture(async f=>{
 for(const change of [r=>r.graphHash='0'.repeat(64),r=>r.executionProfileId='other',r=>r.original.entries[W].maxRows=17,r=>{r.original.entries[W].operatorBinding.graphInput='spoof';r.targets[0].operatorBinding.graphInput='spoof';},r=>{const k='blocks.0.norm3.weight';r.original.entries[k].operatorBinding.hikeExport='spoof';}]){const r=f.feed.registry();change(r);const {registryHash,...body}=r;r.registryHash=identities.diagnosticRegistryHash(body);assert.throws(()=>adapter(f,{consumer:{...f.feed,registry:()=>r}}),/profile|graph|registry|binding|source|row/i);}
}));
test('P4 missing declared bias coverage rejects even with a recomputed complete manifest hash',()=>withFixture(async f=>{
 const a=adapter(f),plan=await f.sdk.plan(planInput(f,a)),sink=a.createSink(plan),{p4Hash}=await import('../../docs/shared/inference/lora/diffusion-p4-registry.mjs');
 const partial={...sink,async writeBlock(b){if(b.parameterRole==='weight')return sink.writeBlock(b);},async finish(m){const {bundleHash,...body}=structuredClone(m);body.blocks=body.blocks.filter(b=>b.parameterRole==='weight');return sink.finish({...body,bundleHash:p4Hash(body)});}};
 await assert.rejects(f.sdk.prepare(plan,{baseProvider:a.baseProvider,sink:partial}),/coverage|incomplete/i);assert.equal(f.feed.stats().transactions,0);assert.equal(f.feed.stats().packages,0);
}));
test('P4 native epoch is authoritative and stale cleanup cannot replace a successor',()=>withFixture(async f=>{
 const a=adapter(f),p=await prepared(f,a),t=a.targetForPlan(p.plan,f.validation()),ctx=context(p.value),one=await t.prepareLoad(p.value.handle,ctx),two=await t.prepareLoad(p.value.handle,ctx);await t.validate(one,ctx);await t.validate(two,ctx);await t.commit(one,ctx);await assert.rejects(t.commit(two,ctx),/stale|epoch/i);await t.rollback(two,{...ctx,isCurrent:()=>false});assert.equal(f.feed.describe().epoch,1);await t.rollback(one,{...ctx,isCurrent:()=>false});assert.equal(f.feed.describe().epoch,2);assert.equal((await f.feed.readRows(W,2,1)).values[0],2);await f.sdk.release(p.value);
}));
test('P4 explicit outer application binding is preserved without becoming SDK or native revision',()=>withFixture(async f=>{
 const a=adapter(f),p=await prepared(f,a),v=f.validation();v.applicationBinding={namespace:'manager-selection',revision:'outside:42',resource:{generation:'g1'}};const t=a.targetForPlan(p.plan,v);v.applicationBinding.resource.generation='changed';const r=await f.sdk.stage(p.value,t);assert.deepEqual(r.validation.evidence.applicationBinding,{namespace:'manager-selection',revision:'outside:42',resource:{generation:'g1'}});assert.notEqual(r.localApplicationRevision,42);await f.sdk.release(p.value);await a.finalize(p.plan);
}));
test('P4 rich or cyclic conditioning metadata rejects explicitly before preparation',()=>withFixture(async f=>{
 const a=adapter(f),plan=await f.sdk.plan(planInput(f,a));for(const extra of [new Uint8Array([1]),new Map([['x',1]]),(()=>{const c={};c.self=c;return c;})()]){const v=f.validation();v.input.conditioning=conditioning.captureP4FixtureConditioning({shape:[1,1,4096],data:new Float32Array(4096),attentionMask:new Uint8Array([1]),fixtureId:'unsupported-rich',sourceRef:'control-only',extra});assert.throws(()=>a.targetForPlan(plan,v),{code:'UNSUPPORTED_CONDITIONING_METADATA'});}assert.equal(f.feed.stats().transactions,0);
}));
test('P4 source/provider bindings and complete-column block ranges reject before storage access',()=>withFixture(async f=>{
 const a=adapter(f),plan=await f.sdk.plan(planInput(f,a)),ctx={modelHash:plan.registry.modelHash,graphHash:plan.registry.graphHash,registryHash:plan.registryHash,fullShape:[5120,5120],side:'HIGH',executionProfileId:plan.registry.executionProfileId};const before=f.source.stats().reads;await assert.rejects(a.baseProvider.readBlock(W,0,5120,{...ctx,registryHash:'0'.repeat(64)}),/identity/i);await assert.rejects(a.baseProvider.readBlock(W,1,5120,ctx),/column|range/i);assert.equal(f.source.stats().reads,before);
}));
test('P4 sink captures SDK block bytes before its first await',()=>withFixture(async f=>{
 const a=adapter(f),plan=await f.sdk.plan(planInput(f,a)),sink=a.createSink(plan),mutating={...sink,writeBlock(b){const p=sink.writeBlock(b);b.data.fill(99);return p;}};const p=await f.sdk.prepare(plan,{baseProvider:a.baseProvider,sink:mutating});const r=await f.sdk.stage(p,a.targetForPlan(plan,f.validation()));assert.equal(r.state,'CONSUMER_APPLIED');assert.equal((await f.feed.readRows(W,2,1)).values[0],2.125);await f.sdk.release(p);await a.finalize(plan);
}));
test('P4 active run checks captured lease scope and rejects foreign output/evidence',()=>withFixture(async f=>{
 for(const change of [r=>r.output=new Float32Array(16),r=>r.evidence.executionProfileId='other',r=>r.evidence.graphSHA256='0'.repeat(64),r=>r.evidence.weightFeedPackageHash='0'.repeat(64),r=>r.evidence.weightFeedEpoch=999]){const a=adapter(f,{run:async(view,input)=>{const r=await f.run(view,input);change(r);return r;}});await assert.rejects(a.run(f.input(),{isCurrent:()=>true}),/tensor|F32|receipt|scope|identity|evidence/i);assert.equal(f.feed.stats().readLeases,0);}
}));
test('P4 base restore rejects malformed actual commit receipts and rolls back the base switch',()=>withFixture(async f=>{
 const a=adapter(f),p=await prepared(f,a);await f.sdk.stage(p.value,a.targetForPlan(p.plan,f.validation()));await f.sdk.release(p.value);await a.finalize(p.plan);const patched=f.feed.describe().packageHash;
 for(const change of [r=>r.graphHash='0'.repeat(64),r=>r.modelInference=true,r=>r.generationReady=true,r=>r.epoch=0]){const b=adapter(f,{consumer:{...f.feed,async commit(...args){const r=await f.feed.commit(...args);change(r);return r;}}});await assert.rejects(b.restoreBase({...f.validation(0),isCurrent:()=>true}),/commit|identity|receipt/i);assert.equal(f.feed.describe().packageHash,patched);}
}));
test('P4 old SDK plan is invalid after a new selection without creating native candidates',()=>withFixture(async f=>{
 const a=adapter(f),old=await prepared(f,a);await f.sdk.plan(planInput(f,a,-1));await assert.rejects(f.sdk.stage(old.value,a.targetForPlan(old.plan,f.validation())),/stale/i);assert.equal(f.feed.stats().candidates,0);assert.equal(f.feed.stats().epoch,0);await f.sdk.release(old.value);
}));
test('P4 prepared handle cannot release during validation and active owns bytes after terminal',()=>withFixture(async f=>{
 let entered,release;const enteredP=new Promise(r=>entered=r),barrier=new Promise(r=>release=r),a=adapter(f,{run:async(view,input)=>{entered();await barrier;return f.run(view,input);}}),p=await prepared(f,a),task=f.sdk.stage(p.value,a.targetForPlan(p.plan,f.validation()));await enteredP;await assert.rejects(f.sdk.release(p.value),/in use|transaction/i);release();await task;await f.sdk.release(p.value);await a.finalize(p.plan);assert.equal(f.feed.stats().packages,0);assert.equal(f.feed.stats().candidates,0);assert.equal(f.feed.stats().activePatchBytes,(3*5120+3)*4);assert.equal((await a.run(f.input(),{isCurrent:()=>true})).output[0],5.375);
}));
test('P4 direct SDK cancellation changes SDK revision without changing native epoch and permits recovery',()=>withFixture(async f=>{
 let entered,release;const enteredP=new Promise(r=>entered=r),barrier=new Promise(r=>release=r),a=adapter(f,{run:async(view,input)=>{entered();await barrier;return f.run(view,input);}}),p=await prepared(f,a),task=f.sdk.stage(p.value,a.targetForPlan(p.plan,f.validation()));await enteredP;f.sdk.cancel();release();await assert.rejects(task);assert.equal(f.feed.stats().epoch,0);assert.equal(f.feed.stats().candidates,0);await f.sdk.release(p.value);const q=await prepared(f,a),r=await f.sdk.stage(q.value,a.targetForPlan(q.plan,f.validation()));assert.equal(r.localApplicationRevision,3);assert.equal(f.feed.stats().epoch,1);await f.sdk.release(q.value);await a.finalize(q.plan);
}));

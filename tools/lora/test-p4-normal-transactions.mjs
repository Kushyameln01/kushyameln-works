import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,loraSource,MODEL,GRAPH,PROFILE,W,B,conditioning,planInput,context} from './p4-adapter-fixture.mjs';
import {createDiffusionP4Adapter} from '../../docs/shared/inference/lora/diffusion-p4-adapter.mjs';

const POLICY='comfy-lora-b5a4321-linear-diff-v1';
async function setup(fn){const f=await fixture();try{await fn(f);}finally{await f.close();}}
async function binding(){return {ownerRecordId:'synthetic-normal-owner-binding',scope:'verified-runtime-target-range',sourceSha256:await loraSource().hash(),modelHash:MODEL,graphHash:GRAPH,side:'HIGH',executionProfileId:PROFILE,loaderPolicyId:POLICY,trainingBaseVerified:false,evidenceRef:{repository:'fixture-only',commit:'a'.repeat(40),path:'synthetic-normal-result.json',scope:'synthetic original; fake forward'},targets:[{weightId:W,fullShape:[5120,5120],ranges:[{offset:2*5120,count:3*5120}]},{weightId:B,fullShape:[5120],ranges:[{offset:2,count:3}]}]};}
async function adapter(f,extra={}){return createDiffusionP4Adapter({consumer:f.feed,isOwnerCurrent:()=>true,sourceBindings:[await binding()],...extra});}
async function prepared(f,a,strength=1){const plan=await f.sdk.plan(planInput(f,a,strength)),value=await f.sdk.prepare(plan,{baseProvider:a.baseProvider,sink:a.createSink(plan)});return {plan,value};}
async function normalApply(f,a,strength=1,extra={}){const p=await prepared(f,a,strength),target=a.targetForPlan(p.plan,{validationMode:'normal',...extra}),r=await f.sdk.stage(p.value,target,{validationMode:'normal'});await a.finalize(p.plan);await f.sdk.release(p.value);return {p,r};}

test('P4 normal validate and restore require no forward, conditioning, independent expected or gate',()=>setup(async f=>{
 const a=await adapter(f);for(const strength of [0,1,-1,1]){const {r}=await normalApply(f,a,strength);assert.equal(r.validationMode,'normal');assert.equal(r.validation.validationMode,'normal');assert.equal(r.validation.numericalComparison,false);assert.equal(r.validation.evidence.nativeReceipt.numericalComparison,false);assert.equal(r.validation.evidence.sourceBinding.ownerRecordId,'synthetic-normal-owner-binding');assert.equal(r.coverage,'PARTIAL');assert.equal(r.generationReady,false);assert.equal(r.state,'CONSUMER_APPLIED');assert.equal(f.feed.stats().packages,0);assert.equal(f.feed.stats().candidates,0);assert.equal((await f.feed.readRows(W,2,1)).values[0],2+strength*0.125);}
 const result=await a.restoreBase({validationMode:'normal',isCurrent:()=>true});assert.equal(result.validationMode,'normal');assert.equal(result.validation.numericalComparison,false);assert.equal(result.validation.schemaVersion,'bernini-p4-f32-feed-admission/0.1');assert.equal(Object.hasOwn(result.commit,'validationMode'),false);assert.equal(result.snapshotPublished,false);assert.equal(f.feed.stats().activePatchBytes,0);assert.equal(f.feed.stats().candidates,0);
}));
test('P4 normal and diagnostic explicit modes are checked at the SDK boundary',()=>setup(async f=>{
 const a=await adapter(f,{run:f.run,cloneConditioning:conditioning.cloneP4CapturedConditioning});
 let p=await prepared(f,a);await assert.rejects(f.sdk.stage(p.value,a.targetForPlan(p.plan,{validationMode:'normal'})),{code:'VALIDATION_MODE_MISMATCH'});await f.sdk.release(p.value);
 p=await prepared(f,a);await assert.rejects(f.sdk.stage(p.value,a.targetForPlan(p.plan,f.validation()),{validationMode:'normal'}),{code:'VALIDATION_MODE_MISMATCH'});await f.sdk.release(p.value);
 p=await prepared(f,a);const v={...f.validation(),validationMode:'diagnostic'},r=await f.sdk.stage(p.value,a.targetForPlan(p.plan,v),{validationMode:'diagnostic'});assert.equal(r.validationMode,'diagnostic');assert.equal(r.validation.numericalComparison,true);assert.equal(r.validation.evidence.nativeReceipt.schemaVersion,'bernini-p4-f32-feed-validation/0.1');assert.equal(r.validation.evidence.nativeReceipt.diagnosticOnly,true);assert.equal(r.validation.evidence.nativeAdmission.schemaVersion,'bernini-p4-f32-feed-admission/0.1');await a.finalize(p.plan);await f.sdk.release(p.value);
}));
test('P4 normal constructor rejects forward/reference fields and unknown source before native preparation',()=>setup(async f=>{
 const a=await adapter(f),p=await f.sdk.plan(planInput(f,a));for(const extra of [{input:f.input()},{expected:new Float32Array(10240)},{gateId:'anything'},{referenceId:'anything'},{run:()=>{}}])assert.throws(()=>a.targetForPlan(p,{validationMode:'normal',...extra}),{code:'INVALID_NORMAL_VALIDATION'});
 const unknown={...p,sourceSha256:'b'.repeat(64)};assert.throws(()=>a.targetForPlan(unknown,{validationMode:'normal'}),{code:'NORMAL_APPLICATION_UNSUPPORTED'});assert.equal(f.feed.stats().candidates,0);assert.equal(f.feed.stats().transactions,0);
}));
test('P4 normal compact application binding is captured without admitting forward data',()=>setup(async f=>{
 const a=await adapter(f),p=await prepared(f,a),applicationBinding={managerRevision:91,resourceGeneration:'test:g1',tuple:{sdkInstanceId:p.plan.sdkInstanceId,localInputRevision:p.plan.localInputRevision}},target=a.targetForPlan(p.plan,{validationMode:'normal',applicationBinding});applicationBinding.tuple.localInputRevision=999;
 const r=await f.sdk.stage(p.value,target,{validationMode:'normal'});assert.equal(r.validation.evidence.applicationBinding.tuple.localInputRevision,p.plan.localInputRevision);assert.notEqual(r.localApplicationRevision,91);await a.finalize(p.plan);await f.sdk.release(p.value);
}));
test('P4 normal rejects wrong admission scope, counts, epoch and completeness receipts and rolls back candidates',()=>setup(async f=>{
 for(const change of [r=>r.schemaVersion='bernini-p4-f32-feed-validation/0.2',r=>r.epoch++,r=>r.patchBytes++,r=>r.blockCount++,r=>r.patchRangeCount++,r=>r.numericalComparison=true,r=>r.immutableBasePreserved=false,r=>r.completeDeclaredRanges=false,r=>r.scope='FULL',r=>r.gateId='diagnostic-gate']){const a=await adapter(f,{consumer:{...f.feed,async validate(...args){const r=await f.feed.validate(...args);change(r);return r;}}}),p=await prepared(f,a);await assert.rejects(f.sdk.stage(p.value,a.targetForPlan(p.plan,{validationMode:'normal'}),{validationMode:'normal'}),/receipt|identity|scope|normal|validation|admission/i);assert.equal(f.feed.stats().epoch,0);assert.equal(f.feed.stats().candidates,0);await f.sdk.release(p.value);}
}));
test('P4 normal cancellation and prepared release barrier preserve old feed and permit recovery',()=>setup(async f=>{
 let entered,release;const enteredP=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);const a=await adapter(f,{consumer:{...f.feed,async validate(...args){entered();await barrier;return f.feed.validate(...args);}}}),p=await prepared(f,a),task=f.sdk.stage(p.value,a.targetForPlan(p.plan,{validationMode:'normal'}),{validationMode:'normal'});await enteredP;await assert.rejects(f.sdk.release(p.value),/in use|transaction/i);f.sdk.cancel();release();await assert.rejects(task);assert.equal(f.feed.stats().epoch,0);assert.equal(f.feed.stats().candidates,0);await f.sdk.release(p.value);
 const fresh=await adapter(f);const {r}=await normalApply(f,fresh);assert.equal(r.state,'CONSUMER_APPLIED');assert.equal(f.feed.stats().readLeases,0);
}));
test('P4 normal old rollback cannot overwrite a successor and package release keeps private active bytes',()=>setup(async f=>{
 const a=await adapter(f),p=await prepared(f,a),target=a.targetForPlan(p.plan,{validationMode:'normal'}),ctx=context(p.value,{validationMode:'normal'}),c=await target.prepareLoad(p.value.handle,ctx);await target.validate(c,ctx);await target.commit(c,ctx);await f.sdk.release(p.value);
 await normalApply(f,a,-1);const before=f.feed.describe();await target.rollback(c);assert.equal(f.feed.describe().epoch,before.epoch);assert.equal(f.feed.describe().packageHash,before.packageHash);assert.equal((await f.feed.readRows(W,2,1)).values[0],1.875);assert.equal(f.feed.stats().packages,0);assert.equal(f.feed.stats().readLeases,0);
}));

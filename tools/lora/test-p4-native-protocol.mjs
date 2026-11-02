import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,planInput,context,conditioning,identities} from './p4-adapter-fixture.mjs';
import {createDiffusionP4Adapter} from '../../docs/shared/inference/lora/diffusion-p4-adapter.mjs';
import {p4NativeValidationProtocol,P4_NATIVE_PROTOCOL_LEGACY,P4_NATIVE_PROTOCOL_SPLIT} from '../../docs/shared/inference/lora/diffusion-p4-registry.mjs';

async function setup(fn){const f=await fixture();try{await fn(f);}finally{await f.close();}}
function adapter(f,extra={}){return createDiffusionP4Adapter({consumer:f.feed,isOwnerCurrent:()=>true,run:f.run,cloneConditioning:conditioning.cloneP4CapturedConditioning,...extra});}
const split=f=>p4NativeValidationProtocol(f.feed.registry())===P4_NATIVE_PROTOCOL_SPLIT;

test('P4 native protocol is registry-bound and legacy diagnostic source refuses normal admission',()=>setup(async f=>{
 const a=adapter(f),caps=a.describeCapabilities(),ownerSplit=split(f);assert.equal(caps.normalValidationAvailable,ownerSplit);assert.equal(caps.nativeValidationProtocol,ownerSplit?P4_NATIVE_PROTOCOL_SPLIT:P4_NATIVE_PROTOCOL_LEGACY);
 if(ownerSplit){assert.equal((await a.restoreBase({validationMode:'normal',isCurrent:()=>true})).validation.schemaVersion,'bernini-p4-f32-feed-admission/0.1');}
 else{await assert.rejects(a.restoreBase({validationMode:'normal',isCurrent:()=>true}),{code:'NORMAL_VALIDATION_UNAVAILABLE'});assert.equal(f.feed.stats().candidates,0);const fake=adapter(f,{consumer:{...f.feed,validationCapabilities(){return {modes:['normal','diagnostic']};},diagnose(){throw Error('Must not be used to invent a protocol');}}});assert.equal(fake.describeCapabilities().normalValidationAvailable,false);}
}));
test('P4 rejects rehashed unsupported or mixed admission and diagnostic gate protocols',()=>setup(async f=>{
 for(const change of [r=>r.validationGate.id='unknown',r=>r.numericalDiagnostics={id:'unknown'},r=>r.validationGate.numericalComparisonRequired=true]){const r=f.feed.registry();change(r);const {registryHash,...body}=r;r.registryHash=identities.diagnosticRegistryHash(body);assert.throws(()=>adapter(f,{consumer:{...f.feed,registry:()=>r}}),/protocol|registry|gate/i);}
 if(split(f))assert.throws(()=>adapter(f,{consumer:{...f.feed,diagnose:undefined}}),{code:'INVALID_NATIVE_CONSUMER'});
}));
test('P4 diagnostic translation uses owner admission and diagnosis without leaking SDK mode to native context',()=>setup(async f=>{
 const calls=[],observe=name=>async(value,input)=>{calls.push(name);for(const field of ['validationMode','applicationBinding','selection','localInputRevision'])assert.equal(Object.hasOwn(input,field),false);return f.feed[name](value,input);},consumer={...f.feed,validate:observe('validate'),commit:observe('commit'),...(split(f)?{diagnose:observe('diagnose')}:{})},a=adapter(f,{consumer});
 const plan=await f.sdk.plan(planInput(f,a)),p=await f.sdk.prepare(plan,{baseProvider:a.baseProvider,sink:a.createSink(plan)}),r=await f.sdk.stage(p,a.targetForPlan(plan,{...f.validation(),validationMode:'diagnostic'}),{validationMode:'diagnostic'});
 assert.equal(r.validationMode,'diagnostic');assert.equal(r.validation.numericalComparison,true);assert.deepEqual(calls,split(f)?['validate','diagnose','commit']:['validate','commit']);await a.finalize(plan);await f.sdk.release(p);
}));
test('P4 owner-current and diagnostic failure prevent adapter commit after native admission',()=>setup(async f=>{
 let current=true;const a=adapter(f,{isOwnerCurrent:()=>current}),plan=await f.sdk.plan(planInput(f,a)),p=await f.sdk.prepare(plan,{baseProvider:a.baseProvider,sink:a.createSink(plan)}),target=a.targetForPlan(plan,f.validation()),ctx=context(p),candidate=await target.prepareLoad(p.handle,ctx);
 await assert.rejects(target.commit(candidate,ctx),{code:'VALIDATION_REQUIRED'});assert.equal((await target.validate(candidate,ctx)).valid,true);current=false;await assert.rejects(target.commit(candidate,ctx),/current|owner|stale/i);assert.equal(f.feed.stats().epoch,0);current=true;await target.rollback(candidate);await f.sdk.release(p);
 const next=await f.sdk.plan(planInput(f,a)),q=await f.sdk.prepare(next,{baseProvider:a.baseProvider,sink:a.createSink(next)}),bad=f.validation();bad.expected.fill(123);const {digest}=await import('./p4-adapter-fixture.mjs');bad.expectedSHA256=digest(bad.expected);const failedTarget=a.targetForPlan(next,bad),nextCtx=context(q),failed=await failedTarget.prepareLoad(q.handle,nextCtx);assert.equal((await failedTarget.validate(failed,nextCtx)).valid,false);await assert.rejects(failedTarget.commit(failed,nextCtx),{code:'VALIDATION_REQUIRED'});assert.equal(f.feed.stats().epoch,0);await failedTarget.rollback(failed);await f.sdk.release(q);
}));
test('P4 rejects an altered native commit epoch and rolls the actual switch back',()=>setup(async f=>{
 const a=adapter(f,{consumer:{...f.feed,async commit(...args){const receipt=await f.feed.commit(...args);return {...receipt,epoch:receipt.epoch+10};}}}),plan=await f.sdk.plan(planInput(f,a)),p=await f.sdk.prepare(plan,{baseProvider:a.baseProvider,sink:a.createSink(plan)}),before=f.feed.describe();
 await assert.rejects(f.sdk.stage(p,a.targetForPlan(plan,f.validation())),/epoch|receipt/i);assert.equal(f.feed.describe().packageHash,before.packageHash);assert.equal(f.feed.stats().candidates,0);await f.sdk.release(p);
}));

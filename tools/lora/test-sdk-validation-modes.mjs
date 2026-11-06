import test from 'node:test';
import assert from 'node:assert/strict';
import {engine,storage,baseProvider,consumer,planInput} from './v2-fixture.mjs';

async function withPrepared(run){
 const e=await engine(),sink=storage();
 try{
  const plan=await e.api.plan(planInput());
  const prepared=await e.api.prepare(plan,{sink,baseProvider});
  await run({e,sink,plan,prepared});
 }finally{await e.close();}
}

// This exercises the SDK's mode boundary with real tiny Hike preparation and
// a declared test consumer. It does not certify a real model/base binding.
function modeConsumer(changes={}){
 const c=consumer(),validate=c.validate,commit=c.commit;
 c.validate=async(...args)=>({...await validate(...args),validationMode:args[1].validationMode});
 c.commit=async(...args)=>({...await commit(...args),validationMode:args[1].validationMode});
 return Object.assign(c,changes);
}

for(const validationMode of ['normal','diagnostic'])test('SDK captures explicit '+validationMode+' mode without changing application coverage',()=>withPrepared(async({e,prepared,plan,sink})=>{
 const c=modeConsumer(),observed=[],load=c.prepareLoad,validate=c.validate,commit=c.commit;
 c.prepareLoad=async(h,ctx)=>{observed.push(ctx);return load(h,ctx);};
 c.validate=async(value,ctx)=>{observed.push(ctx);return validate(value,ctx);};
 c.commit=async(value,ctx)=>{observed.push(ctx);return commit(value,ctx);};
 const result=await e.api.stage(prepared,c,{validationMode});
 assert.equal(result.validationMode,validationMode);
 assert.equal(result.validation.validationMode,validationMode);
 assert.equal(result.coverage,'PARTIAL');
 assert.equal(result.scope,plan.scope);
 assert.equal(result.planId,plan.planId);
 assert.equal(result.generationReady,false);
 assert.equal(result.snapshotPublished,false);
 assert.equal(observed.length,3);
 for(const ctx of observed){
  assert.equal(ctx.validationMode,validationMode);
  assert.equal(Object.isFrozen(ctx),true);
  assert.equal(Object.hasOwn(ctx,'expected'),false);
  assert.equal(Object.hasOwn(ctx,'gate'),false);
  assert.equal(Object.hasOwn(ctx,'tolerance'),false);
 }
 await e.api.release(prepared);
 assert.equal(sink.released,1);
 assert.deepEqual(c.candidate.bytes.map(b=>[...b]),[[10,11],[23]]);
}));

test('omitting validationMode retains legacy context/result and prepared identity',()=>withPrepared(async({e,prepared,sink})=>{
 const c=consumer(),validate=c.validate,commit=c.commit,snapshot=JSON.stringify(prepared.manifest);
 c.validate=async(v,ctx)=>{assert.equal(Object.hasOwn(ctx,'validationMode'),false);return validate(v,ctx);};
 c.commit=async(v,ctx)=>{assert.equal(Object.hasOwn(ctx,'validationMode'),false);return commit(v,ctx);};
 const result=await e.api.stage(prepared,c);
 assert.equal(Object.hasOwn(result,'validationMode'),false);
 assert.equal(Object.hasOwn(result.validation,'validationMode'),false);
 assert.equal(JSON.stringify(prepared.manifest),snapshot);
 await e.api.release(prepared);
 assert.equal(sink.released,1);
}));

test('unknown validationMode rejects before native describe/load without poisoning prepared bytes',()=>withPrepared(async({e,prepared})=>{
 let describes=0,loads=0;
 const c=modeConsumer(),describe=c.describe,load=c.prepareLoad;
 c.describe=async()=>{describes++;return describe();};
 c.prepareLoad=async(...a)=>{loads++;return load(...a);};
 for(const validationMode of [null,'legacy','NORMAL',true,{}]){
  await assert.rejects(e.api.stage(prepared,c,{validationMode}),{code:'UNSUPPORTED_VALIDATION_MODE'});
 }
 assert.equal(describes,0);
 assert.equal(loads,0);
 assert.equal(c.commits,0);
 assert.equal(c.rollbacks,0);
 assert.equal((await e.api.stage(prepared,c,{validationMode:'normal'})).state,'STAGED');
 await e.api.release(prepared);
}));

test('explicit normal mode rejects a missing or different validation receipt mode',()=>withPrepared(async({e,prepared})=>{
 for(const mode of [undefined,'diagnostic']){
  const c=modeConsumer(),validate=c.validate;
  c.validate=async(...args)=>{const v=await validate(...args);if(mode===undefined)delete v.validationMode;else v.validationMode=mode;return v;};
  await assert.rejects(e.api.stage(prepared,c,{validationMode:'normal'}),{code:'VALIDATION_MODE_MISMATCH'});
  assert.equal(c.commits,0);
  assert.equal(c.rollbacks,1);
 }
 await e.api.release(prepared);
}));

test('explicit normal mode rejects a boolean validation result',()=>withPrepared(async({e,prepared})=>{
 const c=modeConsumer({validate:async()=>true});
 await assert.rejects(e.api.stage(prepared,c,{validationMode:'normal'}),/validation|mode/i);
 assert.equal(c.commits,0);
 assert.equal(c.rollbacks,1);
 await e.api.release(prepared);
}));

test('explicit mode also binds the stored validation snapshot after receipt accessors run',()=>withPrepared(async({e,prepared})=>{
 const c=modeConsumer(),validate=c.validate;
 c.validate=async(...a)=>{
  const receipt=await validate(...a);let reads=0;
  Object.defineProperty(receipt,'validationMode',{enumerable:true,get:()=>++reads===1?'normal':'diagnostic'});
  return receipt;
 };
 await assert.rejects(e.api.stage(prepared,c,{validationMode:'normal'}),{code:'VALIDATION_MODE_MISMATCH'});
 assert.equal(c.commits,0);
 assert.equal(c.rollbacks,1);
 await e.api.release(prepared);
}));

test('a normal mode receipt cannot relabel PARTIAL scope as full coverage',()=>withPrepared(async({e,prepared})=>{
 const c=modeConsumer(),validate=c.validate;
 c.validate=async(...a)=>({...await validate(...a),coverage:'FULL',scope:'full-adapter'});
 await assert.rejects(e.api.stage(prepared,c,{validationMode:'normal'}),/scope|identity/i);
 assert.equal(c.commits,0);
 assert.equal(c.rollbacks,1);
 await e.api.release(prepared);
}));

test('explicit normal mode requires matching commit receipt mode and rolls back on mismatch',()=>withPrepared(async({e,prepared,sink})=>{
 for(const mode of [undefined,'diagnostic']){
  const c=modeConsumer(),commit=c.commit;
  c.commit=async(...a)=>{const v=await commit(...a);if(mode===undefined)delete v.validationMode;else v.validationMode=mode;return v;};
  await assert.rejects(e.api.stage(prepared,c,{validationMode:'normal'}),{code:'VALIDATION_MODE_MISMATCH'});
  assert.equal(c.commits,1);
  assert.equal(c.rollbacks,1);
  assert.equal(sink.released,0);
 }
 await e.api.release(prepared);
 assert.equal(sink.released,1);
}));

test('normal validation still checks external current immediately before commit',()=>withPrepared(async({e,prepared})=>{
 let isCurrent=true;
 const c=modeConsumer(),validate=c.validate;
 c.validate=async(...a)=>{const v=await validate(...a);isCurrent=false;return v;};
 await assert.rejects(e.api.stage(prepared,c,{validationMode:'normal',isCurrent:()=>isCurrent}),/current|stale/i);
 assert.equal(c.commits,0);
 assert.equal(c.rollbacks,1);
 await e.api.release(prepared);
}));

test('normal mode preserves in-use blocking, cooperative cancellation and terminal release',()=>withPrepared(async({e,prepared,sink})=>{
 let entered,resume,seenSignal;
 const started=new Promise(r=>entered=r),barrier=new Promise(r=>resume=r),c=modeConsumer(),validate=c.validate;
 c.validate=async(...args)=>{seenSignal=args[1].signal;entered();await barrier;return validate(...args);};
 const pending=e.api.stage(prepared,c,{validationMode:'normal'});
 await started;
 await assert.rejects(e.api.release(prepared),/use|transaction/i);
 e.api.cancel();
 assert.equal(seenSignal.aborted,true);
 assert.equal(sink.released,0);
 resume();
 await assert.rejects(pending,/cancel|stale|abort/i);
 assert.equal(c.commits,0);
 assert.equal(c.rollbacks,1);
 await e.api.release(prepared);
 assert.equal(sink.released,1);
}));

test('normal mode retains live lease bytes until the lease ends',()=>withPrepared(async({e,prepared,sink})=>{
 let valid=true;
 const c=modeConsumer(),commit=c.commit;
 c.commit=async(...a)=>({...await commit(...a),ownership:{kind:'lease',ownerId:'normal-test-lease',isValid:()=>valid}});
 try{
  const result=await e.api.stage(prepared,c,{validationMode:'normal'});
  assert.equal(result.ownership.kind,'lease');
  await assert.rejects(e.api.release(prepared),/lease/i);
  assert.equal(sink.released,0);
 }finally{valid=false;}
 await e.api.release(prepared);
 assert.equal(sink.released,1);
}));

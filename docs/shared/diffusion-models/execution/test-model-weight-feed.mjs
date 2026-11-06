import test from 'node:test';
import assert from 'node:assert/strict';
import {BERNINI_TARGETS,TARGET_PROVENANCE} from '../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';
import {MODEL_WEIGHT_SCHEMA,MODEL_WEIGHT_PROFILE} from './model-weights.mjs';
import {readFile} from 'node:fs/promises';

const api=await import('./model-weight-feed.mjs').catch(()=>({}));
const W='blocks.0.cross_attn.q.weight',B='blocks.0.cross_attn.q.bias';
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(ordered(v))))),x=>x.toString(16).padStart(2,'0')).join('');
function fixture(){
 const entries=Object.fromEntries(BERNINI_TARGETS.map(t=>{const columns=t.key.endsWith('.weight')&&t.shape.length>=2?t.shape.slice(1).reduce((a,b)=>a*b,1):null;return [t.key,{originalKey:t.key,key:t.canonical,weightId:t.key,fullShape:t.shape.slice(),columns,elementCount:t.shape.reduce((a,b)=>a*b,1),computeDtype:'F32',storageDtype:'F16',binding:{kind:columns?'runtime-input':'hike-parameter',name:t.key},operatorBinding:{programSlot:t.key,kind:columns?'linear':'linear-bias'},transform:{kind:'identity'},maxRows:columns?Math.min(16,Math.floor(81920/columns)):undefined}];}));
 const pinned=TARGET_PROVENANCE.models.find(m=>m.name.includes('LOW')),reads=[];let disposed=false;
 const description={schemaVersion:MODEL_WEIGHT_SCHEMA,executionProfileId:MODEL_WEIGHT_PROFILE,side:'LOW',modelHash:BASE_MODEL_HASHES.LOW,headerSHA256:pinned.headerSHA256,fileBytes:pinned.fileBytes,pinnedCoreCommit:TARGET_PROVENANCE.pinnedComfyCommit,targetCount:1095,blockCount:40,entries};
 const read=async(key,start,count,row)=>{assert.ok(!disposed);const e=entries[key],elements=count*(row?e.columns:1);assert.ok(elements<=81920);if(row)assert.ok(count<=e.maxRows);reads.push({key,start,count,row});return {values:new Float32Array(elements).fill(1),shape:row?[count,e.columns]:[count],source:{...structuredClone(e),elementOffset:start*(row?e.columns:1)}};};
 return {source:{describe:()=>structuredClone(description),readRows:(id,start,count)=>read(id,start,count,true),readVector:(id,start,count)=>read(id,start,count,false),stats:()=>({disposed}),dispose(){disposed=true;}},reads};
}
async function setup(){assert.equal(typeof api.createFullModelWeightFeed,'function','full-model final-F32 feed is required');const f=fixture(),feed=await api.createFullModelWeightFeed({source:f.source});return {...f,feed};}
async function packageOf(feed,{bad=false,delayed=false}={}){
 const registry=await feed.consumer.describe(),registryHash=feed.describe().logicalRegistryHash;
 const body={packageVersion:'lora-owned-package/0.1-draft.1',contractVersion:'lora-standalone/1.0-draft.1',registry,registryHash,baseIdentity:await feed.baseProvider.describe(),side:'LOW',loaderPolicyId:registry.loaderPolicyId,compositionOrder:['light','detail'],adapters:[],sources:[],selectedTargets:[{weightId:W,key:'diffusion_model.'+W,fullShape:[5120,5120],ranges:[{startRow:0,rowCount:17}]},{weightId:B,key:'diffusion_model.'+B,fullShape:[5120],ranges:[{startRow:0,rowCount:4}]}],coverage:'PARTIAL',scope:'diagnostic-projection',completeAdapter:false,generationReady:false,buildId:'1'.repeat(64),planId:'2'.repeat(64)};
 const manifest={...body,packageHash:await hash(body)};let refs=1,releaseRead=null,hold=delayed;const reads=[];
 function cap(){let released=false;return Object.freeze({describe(){assert.ok(!released);return structuredClone(manifest);},isValid:()=>!released&&refs>0,retain(){assert.ok(!released);refs++;return cap();},async readBlock(id,offset,count,{signal}={}){assert.ok(!released);signal?.throwIfAborted();reads.push({id,offset,count});if(hold){hold=false;await new Promise(r=>{releaseRead=r;});}signal?.throwIfAborted();return new Float32Array(count).fill(bad?NaN:id===B?3:2);},async release(){if(!released){released=true;refs--;}}});}
 return {pkg:cap(),manifest,reads,get refs(){return refs;},releaseRead(){releaseRead?.();}};
}
const context=m=>({contractVersion:m.contractVersion,sdkInstanceId:'test-sdk',localRevision:1,transactionId:'test-transaction',side:m.side,planId:m.planId,packageHash:m.packageHash,registryHash:m.registryHash,coverage:m.coverage,scope:m.scope,validationMode:'normal',isCurrent:()=>true});

test('full feed maps canonical logical targets to native operators and splits genuine base reads',async()=>{
 const {feed,reads}=await setup();try{
  const d=feed.describe();assert.equal(d.logicalRegistry.targets.length,1053);assert.equal(d.bindingDescriptor.nativeTargetCount,1095);assert.equal(d.bindingDescriptor.baseOnlyTargets.length,42);
  const base=await feed.baseProvider.readBlock(W,0,17*5120,{...await feed.baseProvider.describe(),fullShape:[5120,5120]});assert.equal(base.length,17*5120);assert.deepEqual(reads.map(r=>r.count),[16,1]);base.fill(99);
  assert.equal((await feed.baseProvider.readBlock(W,0,5120,{...await feed.baseProvider.describe(),fullShape:[5120,5120]}))[0],1);
  await assert.rejects(feed.baseProvider.readBlock(W,0,1,{...await feed.baseProvider.describe(),fullShape:[5120,5120]}),/row|range/i);
  await assert.rejects(feed.baseProvider.readBlock(W,0,5120,{...await feed.baseProvider.describe(),modelHash:'0'.repeat(64),fullShape:[5120,5120]}),/identity/i);
 }finally{await feed.dispose();}
});

test('normal admission streams every declared value, pins operation epochs, owns active package and restores base',async()=>{
 const {feed}=await setup();let old,active,operation;try{
  const p=await packageOf(feed),ctx=context(p.manifest),c=await feed.consumer.prepareLoad(p.pkg,ctx);
  const receipt=await feed.consumer.validate(c,ctx);assert.equal(receipt.valid,true);assert.equal(receipt.validationMode,'normal');assert.equal(receipt.comparedElements,0);assert.equal(receipt.validatedElements,17*5120+4);assert.deepEqual(p.reads.map(r=>r.count),[81920,5120,4]);
  old=await feed.capture();operation=await feed.capture({operation:true});await assert.rejects(feed.consumer.commit(c,ctx),/operation/i);await operation.release();operation=null;
  const commit=await feed.consumer.commit(c,ctx);assert.equal(commit.state,'CONSUMER_APPLIED');assert.equal(commit.epoch,1);assert.equal(commit.ownership.kind,'lease');await feed.consumer.releaseCandidate(c,ctx);await p.pkg.release();assert.equal(p.refs,1);
  active=await feed.capture();assert.equal((await feed.source.readRows(W,0,1)).values[0],2);assert.equal((await feed.source.readVector(B,0,4)).values[0],3);assert.equal((await old.source.readRows(W,0,1)).values[0],1);
  assert.equal((await feed.source.readRows(W,20,1)).values[0],1);assert.equal((await feed.baseProvider.readBlock(W,0,5120,{...await feed.baseProvider.describe(),fullShape:[5120,5120]}))[0],1);
  await feed.clear();assert.equal(feed.source.weightEpoch(),2);assert.equal((await feed.source.readRows(W,0,1)).values[0],1);assert.equal((await active.source.readRows(W,0,1)).values[0],2);
  await active.release();active=null;assert.equal(p.refs,0);
 }finally{await operation?.release();await active?.release();await old?.release();await feed.dispose();}assert.equal(feed.stats().readLeases,0);assert.equal(feed.stats().candidates,0);
});

test('invalid completed values and cancelled validation never admit or publish a candidate',async()=>{
 const {feed}=await setup();try{
  const bad=await packageOf(feed,{bad:true}),ctx=context(bad.manifest),c=await feed.consumer.prepareLoad(bad.pkg,ctx);await assert.rejects(feed.consumer.validate(c,ctx),/finite/i);await assert.rejects(feed.consumer.commit(c,ctx),/admi|valid/i);await feed.consumer.rollback(c,ctx);await feed.consumer.releaseCandidate(c,ctx);await bad.pkg.release();
  const pending=await packageOf(feed,{delayed:true}),controller=new AbortController(),cancelCtx={...context(pending.manifest),signal:controller.signal},candidate=await feed.consumer.prepareLoad(pending.pkg,cancelCtx),validation=feed.consumer.validate(candidate,cancelCtx);
  while(!pending.reads.length)await new Promise(r=>setImmediate(r));controller.abort();pending.releaseRead();await assert.rejects(validation,{name:'AbortError'});await feed.consumer.rollback(candidate,cancelCtx);await feed.consumer.releaseCandidate(candidate,cancelCtx);await pending.pkg.release();assert.equal(feed.stats().epoch,0);assert.equal(feed.stats().candidates,0);
 }finally{await feed.dispose();}
});

test('canonical mapping is the exact legacy inventory and fixed LoRA source, with no native initializer fiction',async()=>{
 const bytes=await readFile(new URL('../../inference/lora/bernini-targets.mjs',import.meta.url));
 assert.equal(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join(''),'772ca63c3b82bafa7b2345cdda3361679112fcf4a97c79b67564da0fa196217d');
 const f=fixture(),original=f.source.describe();f.source.describe=()=>({...original,entries:{...original.entries,[W]:{...original.entries[W],binding:{kind:'initializer',name:W}}}});
 await assert.rejects(api.createFullModelWeightFeed({source:f.source}),/binding/i);
});

test('old candidate rollback cannot replace a successor and partial-row reads reject',async()=>{
 const {feed}=await setup();try{
  const a=await packageOf(feed),ca=await feed.consumer.prepareLoad(a.pkg,context(a.manifest));await feed.consumer.validate(ca,context(a.manifest));await feed.consumer.commit(ca,context(a.manifest));
  const b=await packageOf(feed),cb=await feed.consumer.prepareLoad(b.pkg,context(b.manifest));await feed.consumer.validate(cb,context(b.manifest));await feed.consumer.commit(cb,context(b.manifest));
  assert.equal((await feed.consumer.rollback(ca,context(a.manifest))).restored,false);assert.equal(feed.consumer.currentEpoch(),2);
  await assert.rejects(feed.source.readRows(W,.5,1),/row|range/i);
  assert.equal((await feed.consumer.rollback(cb,context(b.manifest))).restored,true);assert.equal(feed.consumer.currentEpoch(),3);
  await feed.consumer.releaseCandidate(ca);await feed.consumer.releaseCandidate(cb);await a.pkg.release();await b.pkg.release();
 }finally{await feed.dispose();}
});

test('read lease release retries failed terminal cleanup and disposal leaves original base caller-owned',async()=>{
 const {feed,source}=await setup();let failures=1,retains=0;
 try{
  const p=await packageOf(feed),ctx=context(p.manifest);
  const wrap=(cap,index=0)=>({...cap,retain:owner=>wrap(cap.retain(owner),++retains),async release(){if(index===3&&failures-- >0)throw Error('injected retained capability release');return cap.release();}});
  const pkg=wrap(p.pkg),candidate=await feed.consumer.prepareLoad(pkg,ctx);await feed.consumer.validate(candidate,ctx);await feed.consumer.commit(candidate,ctx);await feed.consumer.releaseCandidate(candidate,ctx);
  const capture=feed.capture({operation:true});capture.source.describe();
  // A release capability failure is injected on just the captured native lease.
  // The capability can be retried without losing the operation pin's terminal state.
  assert.equal(feed.stats().operationLeases,1);await assert.rejects(capture.release(),/injected/);assert.equal(feed.stats().operationLeases,1);await capture.release();assert.equal(feed.stats().operationLeases,0);
  await p.pkg.release();
 }finally{await feed.dispose();}assert.equal(source.stats().disposed,false);assert.equal(feed.stats().readLeases,0);
});

test('native reads overlay only declared validated ranges from a completed provider',async()=>{
 const {feed}=await setup();try{
  const p=await packageOf(feed),body=structuredClone(p.manifest);delete body.packageHash;body.selectedTargets[0].ranges=[{startRow:2,rowCount:1}];const manifest={...body,packageHash:await hash(body)};
  const wrap=cap=>({...cap,describe:()=>structuredClone(manifest),retain:owner=>wrap(cap.retain(owner))});
  const pkg=wrap(p.pkg),ctx=context(manifest),candidate=await feed.consumer.prepareLoad(pkg,ctx);await feed.consumer.validate(candidate,ctx);await feed.consumer.commit(candidate,ctx);await feed.consumer.releaseCandidate(candidate);
  const read=await feed.source.readRows(W,0,16);assert.equal(read.values[0],1);assert.equal(read.values[2*5120],2);assert.equal(read.values[3*5120],1);await p.pkg.release();
 }finally{await feed.dispose();}
});

test('commit pins candidate state across asynchronous retain',async()=>{
 const {feed}=await setup();try{
  const p=await packageOf(feed);let release,retains=0;const waiting=new Promise(r=>{release=r;});
  const wrap=cap=>({...cap,retain(owner){const next=cap.retain(owner);return ++retains===2?waiting.then(()=>wrap(next)):wrap(next);}});
  const pkg=wrap(p.pkg),ctx=context(p.manifest),candidate=await feed.consumer.prepareLoad(pkg,ctx);await feed.consumer.validate(candidate,ctx);const commit=feed.consumer.commit(candidate,ctx);
  await Promise.resolve();try{await assert.rejects(feed.consumer.releaseCandidate(candidate),/busy|commit/i);}finally{release();}await commit;await feed.consumer.releaseCandidate(candidate);await p.pkg.release();
 }finally{await feed.dispose();}
});

test('dispose waits for terminal clear and retries retained cleanup failures',async()=>{
 const {feed}=await setup();const p=await packageOf(feed);let release,retains=0,fail=true,first=true;const waiting=new Promise(r=>{release=r;});
 const wrap=(cap,index=0)=>({...cap,retain:owner=>wrap(cap.retain(owner),++retains),async release(){if(index===2){if(first){first=false;await waiting;}if(fail)throw Error('terminal clear release failure');}return cap.release();}});
 const ctx=context(p.manifest),candidate=await feed.consumer.prepareLoad(wrap(p.pkg),ctx);await feed.consumer.validate(candidate,ctx);await feed.consumer.commit(candidate,ctx);await feed.consumer.releaseCandidate(candidate);
 const clear=feed.clear();let settled=false;const disposal=feed.dispose().then(()=>{settled=true;},e=>{settled=true;throw e;});await new Promise(r=>setImmediate(r));try{assert.equal(settled,false);}finally{release();}await assert.rejects(clear,/terminal/);await assert.rejects(disposal,/cleanup/);assert.equal(feed.stats().disposed,false);fail=false;await feed.dispose();assert.equal(feed.stats().cleanupPending,0);assert.equal(feed.stats().disposed,true);await p.pkg.release();
});

test('rollback cleanup failure remains owned by candidate and normal terminal retry cleans it',async()=>{
 const {feed}=await setup();try{
  const p=await packageOf(feed);let retains=0,fail=true;
  const wrap=(cap,index=0)=>({...cap,retain:owner=>wrap(cap.retain(owner),++retains),async release(){if(index===2&&fail){fail=false;throw Error('rollback release failure');}return cap.release();}});
  const ctx=context(p.manifest),candidate=await feed.consumer.prepareLoad(wrap(p.pkg),ctx);await feed.consumer.validate(candidate,ctx);await feed.consumer.commit(candidate,ctx);
  await assert.rejects(feed.consumer.rollback(candidate,ctx),/rollback/);assert.equal(feed.stats().cleanupPending,1);await feed.consumer.rollback(candidate,ctx);await feed.consumer.releaseCandidate(candidate);assert.equal(feed.stats().cleanupPending,0);await p.pkg.release();
 }finally{await feed.dispose();}
});

test('candidate terminal cleanup is exclusive while rollback awaits retained release',async()=>{
 const {feed}=await setup();try{
  const p=await packageOf(feed);let release,retains=0;const waiting=new Promise(r=>{release=r;});
  const wrap=(cap,index=0)=>({...cap,retain:owner=>wrap(cap.retain(owner),++retains),async release(){if(index===2)await waiting;return cap.release();}});
  const ctx=context(p.manifest),candidate=await feed.consumer.prepareLoad(wrap(p.pkg),ctx);await feed.consumer.validate(candidate,ctx);await feed.consumer.commit(candidate,ctx);const rollback=feed.consumer.rollback(candidate,ctx);
  const terminal=feed.consumer.releaseCandidate(candidate);terminal.catch(()=>{});await new Promise(r=>setImmediate(r));release();await assert.rejects(terminal,/busy|terminal/i);await rollback;await feed.consumer.releaseCandidate(candidate);await p.pkg.release();
 }finally{await feed.dispose();}
});

test('clear retries its failed active capability release without borrowing candidate cleanup',async()=>{
 const {feed}=await setup();try{
  const p=await packageOf(feed);let retains=0,fail=true;const wrap=(cap,index=0)=>({...cap,retain:owner=>wrap(cap.retain(owner),++retains),async release(){if(index===2&&fail){fail=false;throw Error('clear-owned release failure');}return cap.release();}});
  const ctx=context(p.manifest),candidate=await feed.consumer.prepareLoad(wrap(p.pkg),ctx);await feed.consumer.validate(candidate,ctx);await feed.consumer.commit(candidate,ctx);await feed.consumer.releaseCandidate(candidate);
  await assert.rejects(feed.clear(),/clear-owned/);assert.equal(feed.stats().cleanupPending,1);await feed.clear();assert.equal(feed.stats().cleanupPending,0);await p.pkg.release();assert.equal(p.refs,0);
 }finally{await feed.dispose();}
});

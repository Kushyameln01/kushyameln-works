import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeightPortRPC,attachDiffusionWeightServer,createDiffusionWeightClient} from '../weight-port.mjs';
import {createFullModelWeightFeed} from '../../execution/model-weight-feed.mjs';
import {hashMetadata} from '../../execution/model-weight-bindings.mjs';
import {BERNINI_TARGETS,TARGET_PROVENANCE} from '../../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../../lora/weights.mjs';
import {MODEL_WEIGHT_SCHEMA,MODEL_WEIGHT_PROFILE} from '../../execution/model-weights.mjs';
const W='blocks.0.cross_attn.q.weight',B='blocks.0.cross_attn.q.bias';
function source(){
 const entries=Object.fromEntries(BERNINI_TARGETS.map(t=>{const columns=t.key.endsWith('.weight')&&t.shape.length>=2?t.shape.slice(1).reduce((a,b)=>a*b,1):null;return [t.key,{originalKey:t.key,key:t.canonical,weightId:t.key,fullShape:t.shape.slice(),columns,elementCount:t.shape.reduce((a,b)=>a*b,1),computeDtype:'F32',storageDtype:'F16',binding:{kind:columns?'runtime-input':'hike-parameter',name:t.key},operatorBinding:{programSlot:t.key,kind:columns?'linear':'linear-bias'},transform:{kind:'identity'},maxRows:columns?Math.min(16,Math.floor(81920/columns)):undefined}];}));
 const pinned=TARGET_PROVENANCE.models.find(m=>m.name.includes('LOW'));
 const metadata={schemaVersion:MODEL_WEIGHT_SCHEMA,executionProfileId:MODEL_WEIGHT_PROFILE,side:'LOW',modelHash:BASE_MODEL_HASHES.LOW,headerSHA256:pinned.headerSHA256,fileBytes:pinned.fileBytes,pinnedCoreCommit:TARGET_PROVENANCE.pinnedComfyCommit,targetCount:1095,blockCount:40,entries};
 return {describe:()=>structuredClone(metadata),stats:()=>({disposed:false}),readRows:async(id,start,count)=>({values:new Float32Array(count*entries[id].columns).fill(1)}),readVector:async(id,start,count)=>({values:new Float32Array(count).fill(1)})};
}
async function fixture(){const feed=await createFullModelWeightFeed({source:source()}),channel=new MessageChannel(),binding={side:'LOW',modelSessionId:'session-first',modelEpoch:1},server=attachDiffusionWeightServer(channel.port1,feed,{binding});const client=await createDiffusionWeightClient({port:channel.port2,binding});return {feed,client,server};}
async function packageOf(client,{pause=false,bad=false}={}){
 const registry=await client.consumer.describe(),description=await client.describe(),identity=await client.baseProvider.describe();
 const body={packageVersion:'lora-owned-package/0.1-draft.1',contractVersion:'lora-standalone/1.0-draft.1',registry,registryHash:description.logicalRegistryHash,baseIdentity:identity,side:'LOW',loaderPolicyId:registry.loaderPolicyId,compositionOrder:['light','detail'],adapters:[],sources:[],selectedTargets:[{weightId:W,key:'diffusion_model.'+W,fullShape:[5120,5120],ranges:[{startRow:0,rowCount:2}]},{weightId:B,key:'diffusion_model.'+B,fullShape:[5120],ranges:[{startRow:0,rowCount:4}]}],coverage:'PARTIAL',scope:'duplex-conforming-source-only',completeAdapter:false,generationReady:false,buildId:'1'.repeat(64),planId:'2'.repeat(64)};
 const manifest={...body,packageHash:await hashMetadata(body)};let refs=1,reads=0,paused=pause,unpause,releaseFailure=false;
 function cap(){let released=false;return Object.freeze({describe:()=>structuredClone(manifest),isValid:()=>!released,retain(){assert.equal(released,false);refs++;return cap();},async readBlock(id,offset,count,{signal}={}){reads++;if(paused){paused=false;await new Promise((resolve,reject)=>{unpause=resolve;signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});});}signal?.throwIfAborted();const target=registry.targets.find(t=>t.weightId===id),data=await client.baseProvider.readBlock(id,offset,count,{...identity,fullShape:target.fullShape,signal});for(let i=0;i<data.length;i++)data[i]+=id===B?2:1;if(bad)data[0]=NaN;return data;},async release(){if(releaseFailure)throw Error('injected release failure');if(!released){released=true;refs--;}}});}
 return {pkg:cap(),manifest,get refs(){return refs;},get reads(){return reads;},set releaseFailure(value){releaseFailure=value;},unpause:()=>unpause?.()};
}
const ctx=m=>({contractVersion:m.contractVersion,sdkInstanceId:'host-sdk',localRevision:1,transactionId:'transaction-first',side:m.side,planId:m.planId,packageHash:m.packageHash,registryHash:m.registryHash,coverage:m.coverage,scope:m.scope,validationMode:'normal',isCurrent:()=>true});

test('duplex RPC permits nested reverse calls and releases cancellation records',async()=>{
 const c=new MessageChannel();let left,right;
 left=createWeightPortRPC(c.port1,{handlers:{outer:async([n])=>await left.call('nested',[n])+1}});
 right=createWeightPortRPC(c.port2,{handlers:{nested:async([n])=>n*2}});
 try{assert.equal(await right.call('outer',[3]),7);assert.equal(left.stats().pending,0);assert.equal(right.stats().pending,0);}
 finally{left.close();right.close();}
});

test('real full-feed consumer reads host-completed F32 through nested immutable base reads',async()=>{
 const {feed,client,server}=await fixture();let old;
 try{
  const p=await packageOf(client),context=ctx(p.manifest),candidate=await client.consumer.prepareLoad(p.pkg,context);
  assert.equal((await client.consumer.validate(candidate,context)).validatedElements,10244);
  const pin=feed.capture({operation:true});await assert.rejects(client.consumer.commit(candidate,context),{code:'WEIGHT_OPERATION_ACTIVE'});await pin.release();
  const receipt=await client.consumer.commit(candidate,context);assert.equal(receipt.ownership.isValid(),true);assert.equal(client.consumer.currentEpoch(),1);
  await client.consumer.releaseCandidate(candidate,context);await p.pkg.release();assert.equal(p.refs,1);
  assert.equal((await feed.source.readRows(W,0,1)).values[0],2);assert.equal((await feed.source.readVector(B,0,4)).values[0],3);
  old=feed.capture();await client.clear();assert.equal((await feed.source.readRows(W,0,1)).values[0],1);assert.equal((await old.source.readRows(W,0,1)).values[0],2);
  assert.equal(receipt.ownership.isValid(),false);receipt.epoch=client.consumer.currentEpoch();assert.equal(receipt.ownership.isValid(),false,'Public receipt mutation cannot restore old authority');await old.release();old=null;assert.equal(p.refs,0);
  const identity=await client.baseProvider.describe(),base=await client.baseProvider.readBlock(W,0,5120,{...identity,fullShape:[5120,5120]});base.fill(999);assert.equal((await client.baseProvider.readBlock(W,0,5120,{...identity,fullShape:[5120,5120]}))[0],1);
  await assert.rejects(client.baseProvider.readBlock(W,0,1048577,{}),{code:'WEIGHT_RANGE_INVALID'});
  await assert.rejects(client.baseProvider.readBlock(W,0,5120,{...identity,modelHash:'0'.repeat(64),fullShape:[5120,5120]}),{code:'BASE_IDENTITY_MISMATCH'});
  await client.dispose();assert.equal(client.isValid(),false);
 }finally{await old?.release();server.close();await feed.dispose();}
});

test('cancelled admission cleans its original candidate; invalid final values cannot activate',async()=>{
 const {feed,client,server}=await fixture();try{
  const p=await packageOf(client,{pause:true}),controller=new AbortController(),context={...ctx(p.manifest),signal:controller.signal},candidate=await client.consumer.prepareLoad(p.pkg,context),validation=client.consumer.validate(candidate,context);
  while(!p.reads)await new Promise(resolve=>setImmediate(resolve));controller.abort();p.unpause();await assert.rejects(validation,{name:'AbortError'});
  await new Promise(resolve=>setImmediate(resolve));await client.consumer.rollback(candidate,context);await client.consumer.releaseCandidate(candidate,context);await p.pkg.release();assert.equal(p.refs,0);
  const bad=await packageOf(client,{bad:true}),badCtx=ctx(bad.manifest),badCandidate=await client.consumer.prepareLoad(bad.pkg,badCtx);await assert.rejects(client.consumer.validate(badCandidate,badCtx),/finite/i);await assert.rejects(client.consumer.commit(badCandidate,badCtx),/admission/i);await client.consumer.rollback(badCandidate,badCtx);await client.consumer.releaseCandidate(badCandidate,badCtx);await bad.pkg.release();assert.equal(feed.stats().epoch,0);await client.dispose();
 }finally{server.close();await feed.dispose();}
});

test('session closure invalidates pending calls and releases retained host package capabilities',async()=>{
 const {feed,client,server}=await fixture();const p=await packageOf(client);try{
  const candidate=await client.consumer.prepareLoad(p.pkg,ctx(p.manifest));assert.ok(candidate);await p.pkg.release();assert.equal(p.refs,1);
  server.close(Object.assign(Error('Model reload'),{code:'STALE_MODEL'}));
  for(let i=0;i<20&&client.isValid();i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(client.isValid(),false);
  await assert.rejects(client.describe(),{code:'WEIGHT_PORT_CLOSED'});assert.equal(p.refs,0);
 }finally{server.close();await feed.dispose();}
});

test('an unexposed candidate resolving after connection closure is still released',async()=>{
 const c=new MessageChannel(),owned=new Set();let server,released=0;
 const feed={describe:()=>({epoch:0}),stats:()=>({activePackageHash:null}),baseProvider:{},consumer:{currentEpoch:()=>0,async prepareLoad(){const candidate={};owned.add(candidate);queueMicrotask(()=>server.close());return candidate;},async rollback(){},async releaseCandidate(candidate){owned.delete(candidate);released++;}}};
 server=attachDiffusionWeightServer(c.port1,feed);const client=await createDiffusionWeightClient({port:c.port2});
 const pkg={describe:()=>({}),isValid:()=>true,retain(){return this;},readBlock(){},async release(){}};
 await assert.rejects(client.consumer.prepareLoad(pkg),/closed|cleanup/i);for(let i=0;i<20&&owned.size;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(owned.size,0);assert.equal(released,1);await client.dispose();
});

test('abort after native prepare resolves removes the candidate whose reply was never adopted',async()=>{
 const c=new MessageChannel(),owned=new Set(),controller=new AbortController();let released=0,refs=1;
 const feed={describe:()=>({epoch:0}),stats:()=>({activePackageHash:null}),baseProvider:{},consumer:{currentEpoch:()=>0,async prepareLoad(){const candidate={};owned.add(candidate);queueMicrotask(()=>controller.abort());return candidate;},async rollback(){},async releaseCandidate(candidate){owned.delete(candidate);released++;}}},server=attachDiffusionWeightServer(c.port1,feed),client=await createDiffusionWeightClient({port:c.port2});
 const pkg={describe:()=>({}),isValid:()=>true,retain(){refs++;return {describe:this.describe,isValid:this.isValid,readBlock(){},async release(){refs--;}};},async release(){refs--;}};
 try{await assert.rejects(client.consumer.prepareLoad(pkg,{signal:controller.signal}),{name:'AbortError'});assert.equal(owned.size,0);assert.equal(released,1);await pkg.release();assert.equal(refs,0);}
 finally{server.close();await client.dispose();}
});

test('host release failure retains its cleanup capability and disposal retries after closure',async()=>{
 const {feed,client,server}=await fixture(),p=await packageOf(client);
 try{
  await client.consumer.prepareLoad(p.pkg,ctx(p.manifest));await p.pkg.release();p.releaseFailure=true;server.close();
  for(let i=0;i<20&&!client.inspect().cleanupRequired;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(client.inspect().retainedPackages,1);assert.equal(client.inspect().cleanupRequired,true);
  await assert.rejects(client.dispose(),/release requires retry/i);assert.equal(client.inspect().retainedPackages,1);p.releaseFailure=false;await client.dispose();assert.equal(client.inspect().retainedPackages,0);assert.equal(p.refs,0);
 }finally{p.releaseFailure=false;await client.dispose();server.close();await feed.dispose();}
});

test('a remotely completed clear invalidates old ownership before a stale post-reply guard throws',async()=>{
 const feed=await createFullModelWeightFeed({source:source()}),c=new MessageChannel();let current=true;
 const server=attachDiffusionWeightServer(c.port1,{...feed,async clear(context){const value=await feed.clear(context);current=false;return value;}}),client=await createDiffusionWeightClient({port:c.port2});
 try{
  const p=await packageOf(client),context=ctx(p.manifest),candidate=await client.consumer.prepareLoad(p.pkg,context);await client.consumer.validate(candidate,context);const receipt=await client.consumer.commit(candidate,context);await client.consumer.releaseCandidate(candidate,context);await p.pkg.release();assert.equal(receipt.ownership.isValid(),true);
  await assert.rejects(client.clear({isCurrent:()=>current}),{code:'STALE_CONTEXT'});assert.equal(client.consumer.currentEpoch(),2);assert.equal(receipt.ownership.isValid(),false);receipt.epoch=2;assert.equal(receipt.ownership.isValid(),false);current=true;await client.dispose();
 }finally{server.close();await feed.dispose();}
});

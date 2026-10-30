import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url=new URL('../../docs/shared/inference/lora/v1-adapter.mjs',import.meta.url);
const hash='a'.repeat(64), version='lora-connection/2.0-draft.1', policy='comfy-lora-b5a4321-linear-diff-v1';
async function adapter(){assert.ok(await fs.stat(url).catch(()=>null),'versioned v1 adapter is not implemented');return import(url);}
const options=()=>({side:'HIGH',executionProfileId:'fixture-v1',loaderPolicyId:policy});
function registry(){return {apiVersion:1,modelHash:hash,graphHash:hash,registryVersion:'fixture',targets:[{key:'layer.weight',weightId:'w',module:'diffusion_models',graphInitializer:'W',shape:[2,2],dtype:'F32',layout:'row-major'},{key:'layer.bias',weightId:'b',module:'diffusion_models',graphInitializer:'B',shape:[2],dtype:'F32',layout:'row-major'}]};}
const context=()=>({contractVersion:version,coverage:'FULL',scope:'full-adapter',planId:'p',registryHash:hash,sourceSha256:hash,localInputRevision:3,localApplicationRevision:3,isCurrent:()=>true});
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
async function boundContext(wrapped){const c=context(),r=await wrapped.describe();const {sha256}=await import('../../docs/shared/inference/lora/planner.mjs');return {...c,registryHash:await sha256(new TextEncoder().encode(JSON.stringify(ordered(r))))};}
test('v1 registry adapter creates only true initializer bindings without mutating v1 identity',async()=>{
 const {adaptV1Registry}=await adapter(),r=registry(),out=adaptV1Registry(r,options());
 assert.equal(out.contractVersion,version);assert.equal(out.side,'HIGH');assert.equal(out.targets[0].binding.kind,'initializer');assert.equal(out.targets[0].binding.name,'W');assert.equal(out.targets[1].parameterRole,'bias');assert.equal('graphInitializer' in out.targets[0],false);assert.equal(r.apiVersion,1);assert.equal(r.targets[0].graphInitializer,'W');assert.ok(Object.isFrozen(out.targets[0]));
});
test('v1 adapter refuses runtime relabeling, transforms, ambiguous role and guessed policy',async()=>{
 const {adaptV1Registry}=await adapter();
 for(const change of [{binding:{kind:'runtime-input',name:'W'}},{binding:{kind:'hike-parameter',name:'W'}},{binding:{kind:'initializer',name:'other'}},{slice:{startRow:0,rowCount:1}},{transpose:true},{quantization:{dtype:'FP8'}},{transform:{kind:'transpose'}},{key:'opaque'}]){const r=registry();Object.assign(r.targets[0],change);assert.throws(()=>adaptV1Registry(r,options()),/unsupported|initializer|role|binding|transform/i);}
 assert.throws(()=>adaptV1Registry(registry(),{...options(),loaderPolicyId:'unknown'}),/policy/i);
});
test('v1 sink adapter maps full initializer blocks and refuses partial and runtime before writes',async()=>{
 const {createV1SinkAdapter}=await adapter(),calls=[];
 const native={begin:async m=>calls.push(['begin',m]),writeBlock:async b=>calls.push(['write',b]),finish:async m=>({native:true,manifest:m}),abort:async e=>calls.push(['abort',e]),release:async h=>calls.push(['release',h])};
 assert.throws(()=>createV1SinkAdapter(native),/registry/i);
 const sink=createV1SinkAdapter(native,{registry:registry()}),m={...context(),complete:false,blocks:[]};
 await assert.rejects(sink.begin({...m,coverage:'PARTIAL'}),/partial|full/i);assert.equal(calls.length,0);
 await sink.begin(m);assert.equal(calls[0][1].apiVersion,1);
 const b={weightId:'w',binding:{kind:'initializer',name:'W'},offset:0,count:2,fullShape:[2,2],dtype:'F32',data:new Float32Array([1,2])};
 await assert.rejects(sink.writeBlock({...b,binding:{kind:'runtime-input',name:'W'}}),/initializer/i);
 await sink.writeBlock(b);assert.equal(calls[1][1].graphInitializer,'W');assert.equal('binding' in calls[1][1],false);assert.deepEqual(calls[1][1].shape,[2,2]);assert.deepEqual([...calls[1][1].data],[1,2]);
 const h=await sink.finish({...m,complete:true,blocks:[{...b,data:undefined}]});assert.equal(h.native,true);assert.equal(h.manifest.blocks[0].graphInitializer,'W');await sink.release(h);assert.equal(calls.at(-1)[0],'release');
});
test('v1 consumer adapter requires declared full scope and owned bytes; preserves legacy boolean evidence',async()=>{
 const {adaptV1Consumer}=await adapter();let legacyContext,commits=0;
 const native={describe:async()=>registry(),prepareLoad:async(h,c)=>{legacyContext=c;return h;},validate:async()=>true,commit:async()=>{commits++;},rollback:async()=>{}};
 assert.throws(()=>adaptV1Consumer(native,options()),/scope|ownership/i);
 const ownership={kind:'independent-copy',ownerId:'fixture-session'},wrapped=adaptV1Consumer(native,{...options(),validationScope:'full-adapter',ownership});
 const c=await boundContext(wrapped);const candidate=await wrapped.prepareLoad({native:true},c),verdict=await wrapped.validate(candidate,c);
 assert.equal(legacyContext.apiVersion,1);assert.equal(legacyContext.connectionRegistryHash,c.registryHash);assert.equal(verdict.valid,true);assert.equal(verdict.coverage,'FULL');assert.equal(verdict.scope,'full-adapter');assert.equal(verdict.registryHash,c.registryHash);assert.equal(verdict.evidence.kind,'legacy-boolean');assert.equal(verdict.evidence.modelValidation,'not-independently-verified');
 const receipt=await wrapped.commit(candidate,c);assert.equal(receipt.state,'CONSUMER_APPLIED');assert.equal(receipt.planId,c.planId);assert.equal(receipt.ownership.ownerId,'fixture-session');assert.equal(commits,1);
 await assert.rejects(wrapped.prepareLoad({}, {...c,coverage:'PARTIAL',scope:'diagnostic-projection'}),/full|partial/i);
 native.validate=async()=>({valid:true});assert.equal((await wrapped.validate(candidate,c)).valid,false);
 native.commit=async()=>({state:'STAGED'});await assert.rejects(wrapped.commit(candidate,c),/staged|apply|state/i);
});
test('v1 consumer refuses stale commit, missing owner and expired lease',async()=>{
 const {adaptV1Consumer}=await adapter();let commits=0;
 const native={describe:async()=>registry(),prepareLoad:async h=>h,validate:async()=>true,commit:async()=>{commits++;},rollback:async()=>{}};
 const params={...options(),validationScope:'full-adapter'};
 assert.throws(()=>adaptV1Consumer(native,{...params,ownership:{kind:'independent-copy'}}),/owner/i);
 let valid=true;const wrapped=adaptV1Consumer(native,{...params,ownership:{kind:'lease',ownerId:'lease-owner',isValid:()=>valid}}),c=await boundContext(wrapped);
 await assert.rejects(wrapped.commit({}, {...c,isCurrent:()=>false}),/stale|current/i);assert.equal(commits,0);
 valid=false;await assert.rejects(wrapped.commit({},c),/lease/i);assert.equal(commits,0);
});
test('v1 consumer registry changes reject before loading or commit and rollback retains original native context',async()=>{
 const {adaptV1Consumer}=await adapter();let r=registry(),loads=0,commits=0,rollbackContext;
 const native={describe:async()=>r,prepareLoad:async h=>{loads++;return h;},validate:async()=>true,commit:async()=>{commits++;},rollback:async(h,c)=>{rollbackContext=c;}};
 const wrapped=adaptV1Consumer(native,{...options(),validationScope:'full-adapter',ownership:{kind:'independent-copy',ownerId:'session'}}),c=await boundContext(wrapped);
 r.targets[0].graphInitializer='different';await assert.rejects(wrapped.prepareLoad({},c),/registry|identity/i);assert.equal(loads,0);
 r=registry();const candidate=await wrapped.prepareLoad({},c);await wrapped.validate(candidate,c);r.targets[0].shape=[1,4];await assert.rejects(wrapped.commit(candidate,c),/registry|identity/i);assert.equal(commits,0);
 await wrapped.rollback(candidate,{...c,isCurrent:()=>false});const {objectHash}=await import('../../docs/shared/inference/lora/planner.mjs');assert.equal(rollbackContext.registryHash,await objectHash(registry()));assert.equal(rollbackContext.connectionRegistryHash,c.registryHash);
});
test('v2 Hike prepare and stage bridge documented v1 initializer manifest/context consistently',async()=>{
 const {adaptV1Registry,createV1SinkAdapter,adaptV1Consumer}=await adapter();
 const {engine,baseProvider,selection}=await import('./v2-fixture.mjs');const {objectHash}=await import('../../docs/shared/inference/lora/planner.mjs');
 const r=registry();r.targets[0].shape=[3,2];r.targets[1].shape=[3];const opts=options(),reg=adaptV1Registry(r,opts),e=await engine();let manifest,active,releases=0;const blocks=[];
 const nativeSink={begin:async m=>{assert.equal(m.apiVersion,1);assert.equal(m.inputRevision,m.connectionV2.localInputRevision);assert.equal(m.applicationRevision,m.connectionV2.localApplicationRevision);},writeBlock:async b=>{assert.ok(['W','B'].includes(b.graphInitializer));assert.deepEqual(b.shape,b.weightId==='w'?[3,2]:[3]);blocks.push({...b,data:b.data.slice()});},finish:async m=>{manifest=m;assert.equal(m.complete,true);assert.equal(m.registryHash,await objectHash(r));assert.match(m.adapterSetHash,/^[a-f0-9]{64}$/);const {bundleHash,...unhashed}=m;assert.equal(bundleHash,await objectHash(unhashed));return {manifest:m,blocks};},abort:async()=>{},release:async()=>{releases++;for(const b of blocks)b.data.fill(0);}};
 const nativeTarget={describe:async()=>r,prepareLoad:async(h,c)=>{assert.equal(c.apiVersion,1);assert.equal(c.registryHash,h.manifest.registryHash);assert.equal(c.adapterSetHash,h.manifest.adapterSetHash);assert.equal(c.bundleHash,h.manifest.bundleHash);assert.equal(c.inputRevision,h.manifest.inputRevision);return {bytes:h.blocks.map(b=>b.data.slice())};},validate:async c=>c.bytes[0][0]===15&&c.bytes.at(-1)[0]===21,commit:async(c,ctx)=>{assert.equal(ctx.isCurrent(),true);active=c;},rollback:async()=>{}};
 try{
  const plan=await e.api.plan({selection,strength:1,registry:reg,loaderPolicyId:policy});
  const p=await e.api.prepare(plan,{baseProvider,sink:createV1SinkAdapter(nativeSink,{registry:r}),blockRows:3});
  const receipt=await e.api.stage(p,adaptV1Consumer(nativeTarget,{...opts,validationScope:'full-adapter',ownership:{kind:'independent-copy',ownerId:'legacy-session'}}));
  assert.equal(receipt.state,'CONSUMER_APPLIED');assert.equal(receipt.generationReady,false);assert.equal(receipt.validation.evidence.kind,'legacy-boolean');assert.equal(manifest.connectionRegistryHash,plan.registryHash);assert.deepEqual([...active.bytes[0]],[15,19,10,11,23,29]);assert.deepEqual([...active.bytes[1]],[21,23,25]);
  await e.api.release(p);assert.equal(releases,1);assert.equal(blocks[0].data[0],0);assert.equal(active.bytes[0][0],15);
 }finally{await e.close();}
});
test('v1 adapter candidate ownership ends after rollback and failed preparation keeps cleanup context',async()=>{
 const {adaptV1Consumer}=await adapter();let fail=false,rollbacks=0,lastNativeContext,commits=0;
 const native={describe:async()=>registry(),prepareLoad:async()=>{if(fail)throw Error('native partial allocation failed');return 'opaque-native-candidate';},validate:async candidate=>candidate==='opaque-native-candidate',commit:async candidate=>{assert.equal(candidate,'opaque-native-candidate');commits++;},rollback:async(candidate,c)=>{rollbacks++;lastNativeContext=c;assert.equal(candidate,fail?undefined:'opaque-native-candidate');}};
 const wrapped=adaptV1Consumer(native,{...options(),validationScope:'full-adapter',ownership:{kind:'independent-copy',ownerId:'session'}}),c=await boundContext(wrapped),candidate=await wrapped.prepareLoad({},c);
 assert.equal((await wrapped.validate(candidate,c)).valid,true);await wrapped.rollback(candidate,c);await assert.rejects(wrapped.commit(candidate,c),/candidate|released|foreign/i);assert.equal(commits,0);
 fail=true;await assert.rejects(wrapped.prepareLoad({},c),/allocation failed/);await wrapped.rollback(undefined,{...c,isCurrent:()=>false});assert.equal(rollbacks,2);assert.equal(lastNativeContext.connectionRegistryHash,c.registryHash);assert.equal(lastNativeContext.isCurrent(),false);
});
test('v2-to-v1 commit failure rolls back using unchanged native package identity',async()=>{
 const {adaptV1Registry,createV1SinkAdapter,adaptV1Consumer}=await adapter(),{engine,baseProvider,selection}=await import('./v2-fixture.mjs');
 const r=registry();r.targets[0].shape=[3,2];r.targets[1].shape=[3];const opts=options(),e=await engine(),blocks=[];let loaded,rolledBack=0;
 const nativeSink={begin:async()=>{},writeBlock:async b=>blocks.push({...b,data:b.data.slice()}),finish:async manifest=>({manifest,blocks}),abort:async()=>{},release:async()=>{}};
 const nativeTarget={describe:async()=>r,prepareLoad:async(h,c)=>{loaded={manifest:h.manifest,context:c};return loaded;},validate:async()=>true,commit:async()=>{throw Error('native commit failed');},rollback:async(candidate,c)=>{assert.equal(candidate,loaded);assert.equal(c.bundleHash,loaded.manifest.bundleHash);assert.equal(c.adapterSetHash,loaded.manifest.adapterSetHash);assert.equal(c.registryHash,loaded.manifest.registryHash);assert.deepEqual(c.blocks,loaded.manifest.blocks);assert.deepEqual(c.blocks[0].shape,[3,2]);rolledBack++;}};
 try{const plan=await e.api.plan({selection,strength:1,registry:adaptV1Registry(r,opts),loaderPolicyId:policy}),p=await e.api.prepare(plan,{baseProvider,sink:createV1SinkAdapter(nativeSink,{registry:r})});
 await assert.rejects(e.api.stage(p,adaptV1Consumer(nativeTarget,{...opts,validationScope:'full-adapter',ownership:{kind:'independent-copy',ownerId:'legacy'}})),/native commit failed/);assert.equal(rolledBack,1);await e.api.release(p);
 }finally{await e.close();}
});

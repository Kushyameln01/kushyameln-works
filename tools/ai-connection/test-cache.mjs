import test from 'node:test';
import assert from 'node:assert/strict';
import {buildArtifactCacheKey,createArtifactCache} from '../../docs/shared/ai-connection/cache.mjs';
import {canonicalBytes,hashCanonical} from '../../docs/shared/ai-connection/canonical.mjs';

const sourceRef={repository:'fixture:cache',commit:'a'.repeat(40),path:'api.mjs'};
const identity=(role,value)=>({identityKind:'model',role,algorithm:'sha256',value:value.repeat(64),scope:'full-file'});
const spec=()=>({modules:[{moduleId:'fixture:audio',moduleVersion:'1',nativeVersion:'fixture/1',buildId:'fixture-build',sourceRef}],
 modelBindings:[identity('producer','b')],tokenizerBindings:[],profileRef:'fixture:stereo/1',config:{variant:'A'},
 inputHashes:[{inputId:'input:a',sha256:'c'.repeat(64)}],maskHash:null,context:{indices:[2,1,1],times:[0.2,0.1,0.1]},adapterBindings:[],dependencies:[{dependencyId:'input:a',revision:3}]});
const state=(overrides={})=>({readerOwnerId:'reader',revisionBindings:{'input:a':3},leases:[],...overrides});
const ownership={ownerId:'cache-owner',mode:'copy'};
const entry=(key,payload=Uint8Array.of(1,2,3,4),extra={})=>({key,metadata:{kind:'audio',optional:{indices:[2,1,1]}},payload,ownership,...extra});
const cache=(extra={})=>createArtifactCache({maxBytes:100000,ownerId:'cache-owner',release:async()=>{},...extra});
const cost=e=>canonicalBytes(e.key.descriptor).byteLength+canonicalBytes(e.metadata).byteLength+canonicalBytes(e.ownership).byteLength+(e.ownership.mode==='lease'?e.payload.buffer.byteLength:e.payload.byteLength);

test('versioned canonical key changes for every numerical/module/input dependency and keeps array ordering',async()=>{
 const original=spec(),base=await buildArtifactCacheKey(original);
 assert.match(base.key,/^works-artifact-cache\/1.0-draft.1:[0-9a-f]{64}$/);
 for(const mutate of [s=>s.modules[0].buildId='different',s=>s.modules[0].sourceRef.commit='d'.repeat(40),s=>s.modelBindings[0].value='e'.repeat(64),s=>s.tokenizerBindings.push(identity('tokenizer','f')),s=>s.profileRef='other',s=>s.config.variant='B',s=>s.inputHashes[0].sha256='d'.repeat(64),s=>s.maskHash='e'.repeat(64),s=>s.context.indices.reverse(),s=>s.adapterBindings.push({adapterId:'fixture:lora',adapterVersion:'2',state:'applied',config:{strength:0.5,selection:'opaque'},sourceRef}),s=>s.dependencies[0].revision=4]) {
  const changed=structuredClone(original);mutate(changed);assert.notEqual((await buildArtifactCacheKey(changed)).key,base.key);
 }
 const reordered=Object.fromEntries(Object.entries(original).reverse());assert.equal((await buildArtifactCacheKey(reordered)).key,base.key);
 assert.deepEqual(original.context.indices,[2,1,1]);assert.equal(Object.hasOwn(base.descriptor,'lora'),false);
});
test('base/audio key has no global LoRA requirement and optional native LoRA JSON is retained and hashed',async()=>{
 const plain=await buildArtifactCacheKey(spec());const s=spec();s.lora={'native:selection':{state:'owner-declared',sides:['opaque-stage']}};
 const withOpaque=await buildArtifactCacheKey(s);assert.notEqual(withOpaque.key,plain.key);assert.deepEqual(withOpaque.descriptor.lora,s.lora);
});
test('key requires explicit dependencies/config/input/mask/context/adapters and rejects unsafe JSON',async()=>{
 for(const field of ['modules','modelBindings','tokenizerBindings','profileRef','config','inputHashes','maskHash','context','adapterBindings','dependencies']) {
  const s=spec();delete s[field];await assert.rejects(buildArtifactCacheKey(s),{code:'INVALID_CACHE_KEY'});
 }
 const s=spec();s.dependencies.push({dependencyId:'input:a',revision:4});await assert.rejects(buildArtifactCacheKey(s),{code:'INVALID_CACHE_KEY'});
 const bad=spec();bad.config.handle=()=>{};await assert.rejects(buildArtifactCacheKey(bad),{code:'INVALID_CACHE_KEY'});
});
test('copy insertion and reads retain binary type but isolate owner bytes and metadata',async()=>{
 const key=await buildArtifactCacheKey(spec()),c=cache(),payload=Float32Array.of(1,2),e=entry(key,payload);
 await c.put(e,state());payload[0]=99;e.metadata.optional.indices[0]=99;
 const first=await c.get(key.key,state());assert.equal(first.status,'hit');assert.ok(first.payload instanceof Float32Array);assert.deepEqual([...first.payload],[1,2]);assert.deepEqual(first.metadata.optional.indices,[2,1,1]);
 assert.equal(first.ownership.ownerId,'reader');assert.equal(first.ownership.mode,'copy');first.payload[0]=88;first.metadata.kind='changed';
 const second=await c.get(key.key,state());assert.equal(second.payload[0],1);assert.equal(second.metadata.kind,'audio');
});
test('strict byte budget uses LRU and releases evicted cache-owned resource once',async()=>{
 const keys=[];for(const variant of ['A','B','C']){const s=spec();s.config.variant=variant;keys.push(await buildArtifactCacheKey(s));}
 const releases=[],maxBytes=cost(entry(keys[0]))+cost(entry(keys[1])),c=cache({maxBytes,release:async e=>releases.push(e)});
 await c.put(entry(keys[0]),state());await c.put(entry(keys[1]),state());await c.get(keys[0].key,state());await c.put(entry(keys[2]),state());
 assert.equal((await c.get(keys[1].key,state())).status,'miss');assert.equal((await c.get(keys[0].key,state())).status,'hit');assert.equal(releases.length,1);assert.equal(releases[0].key,keys[1].key);assert.equal(releases[0].ownerId,'cache-owner');
 assert.ok(c.inspect().retainedBytes<=maxBytes);await c.clear();assert.equal(releases.length,3);assert.equal(new Set(releases.map(e=>e.entryId)).size,3);assert.equal(c.inspect().retainedBytes,0);
});
test('oversized insertion never evicts existing entries or adopts foreign ownership',async()=>{
 const a=await buildArtifactCacheKey(spec()),c=cache({maxBytes:cost(entry(a))});await c.put(entry(a),state());
 const s=spec();s.config.variant='B';const b=await buildArtifactCacheKey(s);
 await assert.rejects(c.put(entry(b,new Uint8Array(100)),state()),{code:'CACHE_BUDGET_EXCEEDED'});
 assert.equal((await c.get(a.key,state())).status,'hit');
 await assert.rejects(c.put(entry(b,Uint8Array.of(1),{ownership:{ownerId:'foreign',mode:'copy'}}),state()),{code:'CACHE_OWNER_MISMATCH'});
});
test('only affected declared dependencies invalidate, and same revision is unchanged',async()=>{
 const a=await buildArtifactCacheKey(spec()),other=spec();other.dependencies=[{dependencyId:'input:b',revision:7}];other.inputHashes[0].inputId='input:b';const b=await buildArtifactCacheKey(other),released=[];
 const c=cache({release:async e=>released.push(e.key)});await c.put(entry(a),state());await c.put(entry(b),state({revisionBindings:{'input:b':7}}));
 assert.deepEqual((await c.invalidateArtifacts({dependencyId:'unrelated',revision:4})).invalidated,[]);
 assert.deepEqual((await c.invalidateArtifacts({dependencyId:'input:a',revision:3})).invalidated,[]);
 assert.deepEqual((await c.invalidateArtifacts({dependencyId:'input:a',revision:4})).invalidated,[a.key]);assert.deepEqual(released,[a.key]);
 assert.equal((await c.get(b.key,state({revisionBindings:{'input:b':7}}))).status,'hit');
});
test('stale or missing current dependency revision prevents adoption and does not refresh LRU',async()=>{
 const key=await buildArtifactCacheKey(spec()),c=cache();await c.put(entry(key),state());
 assert.equal((await c.get(key.key,state({revisionBindings:{'input:a':4}}))).status,'stale');
 assert.equal((await c.get(key.key,state({revisionBindings:{}}))).status,'stale');
 await assert.rejects(c.put(entry(key),state({revisionBindings:{'input:a':4}})),{code:'CACHE_STALE_INPUT'});
 await assert.rejects(c.get(key.key),{code:'CACHE_STATE_REQUIRED'});
});
test('immutable lease requires explicit current holder owner revision and returns an independent read copy',async()=>{
 const key=await buildArtifactCacheKey(spec()),payload=new Uint8Array(new ArrayBuffer(100),10,4),lease={ownerId:'cache-owner',mode:'lease',leaseId:'lease:1',leaseOwnerId:'native-owner',leaseRevision:2,immutable:true};
 const leaseState=state({leases:[{leaseId:'lease:1',ownerId:'native-owner',holderId:'cache-owner',revision:2,valid:true,immutable:true}]});
 const c=cache();await c.put(entry(key,payload,{ownership:lease}),leaseState);const hit=await c.get(key.key,leaseState);assert.equal(hit.status,'hit');assert.notEqual(hit.payload.buffer,payload.buffer);
 assert.equal(c.inspect().retainedBytes,cost(entry(key,payload,{ownership:lease})));
 for(const leases of [[],[{...leaseState.leases[0],revision:3}],[{...leaseState.leases[0],valid:false}],[{...leaseState.leases[0],holderId:'foreign'}]])assert.equal((await c.get(key.key,state({leases}))).status,'lease-expired');
 await assert.rejects(c.put(entry(key,payload,{ownership:lease}),state()),{code:'CACHE_LEASE_INVALID'});
});
test('release failure retains payload and accounting, clear does not retry or claim empty, owner proof recovers once',async()=>{
 const key=await buildArtifactCacheKey(spec());let calls=0;const c=cache({release:async()=>{calls++;throw new Error('owner release failed after uncertain cleanup');}});
 const stored=await c.put(entry(key),state());const before=c.inspect().retainedBytes;
 const result=await c.clear();assert.equal(result.status,'recovery-required');assert.equal(c.inspect().retainedBytes,before);assert.equal((await c.get(key.key,state())).status,'recovery-required');
 await c.clear();assert.equal(calls,1);assert.equal(c.inspect().retainedBytes,before);
 await assert.rejects(c.confirmReleased(key.key,{ownerId:'foreign',evidenceRef:'proof'}),{code:'CACHE_OWNER_MISMATCH'});
 await assert.rejects(c.confirmReleased(key.key,{ownerId:'cache-owner'}),{code:'CACHE_RECOVERY_PROOF_REQUIRED'});
 await c.confirmReleased(key.key,{ownerId:'cache-owner',entryId:stored.entryId,evidenceRef:'fixture:owner-confirmed-already-released'});assert.equal(c.inspect().retainedBytes,0);assert.equal(calls,1);
});
test('failed eviction leaves old entry retained and new one unadopted',async()=>{
 const a=await buildArtifactCacheKey(spec()),s=spec();s.config.variant='B';const b=await buildArtifactCacheKey(s),c=cache({maxBytes:cost(entry(a)),release:async()=>{throw new Error('cannot prove freed');}});
 await c.put(entry(a),state());await assert.rejects(c.put(entry(b),state()),{code:'CACHE_RELEASE_FAILED'});
 assert.equal((await c.get(b.key,state())).status,'miss');assert.equal(c.inspect().retainedBytes,cost(entry(a)));assert.equal(c.inspect().entries.length,1);
});
test('all async mutations serialize; clear and invalidation never release an entry twice',async()=>{
 const key=await buildArtifactCacheKey(spec()),released=[],c=cache({release:async e=>{await Promise.resolve();released.push(e.entryId);}});
 await c.put(entry(key),state());await Promise.all([c.clear(),c.invalidateArtifacts({dependencyId:'input:a',revision:4}),c.clear()]);assert.equal(released.length,1);assert.equal(c.inspect().retainedBytes,0);
});
test('key digest is verified and metadata runtime handles or shared-memory aliases are rejected',async()=>{
 const key=await buildArtifactCacheKey(spec()),c=cache();const forged={...key,key:key.key.slice(0,-1)+(key.key.endsWith('0')?'1':'0')};
 await assert.rejects(c.put(entry(forged),state()),{code:'CACHE_KEY_DIGEST_MISMATCH'});
 await assert.rejects(c.put(entry(key,Uint8Array.of(1),{metadata:{handle:()=>{}}}),state()),{code:'CACHE_METADATA_INVALID'});
 await assert.rejects(c.put(entry(key,{arbitraryHandle:true}),state()),{code:'CACHE_BINARY_INVALID'});
 if(typeof SharedArrayBuffer!=='undefined')await assert.rejects(c.put(entry(key,new Uint8Array(new SharedArrayBuffer(4))),state()),{code:'CACHE_BINARY_INVALID'});
});
test('versionless key cannot be adopted even with a self-consistent digest',async()=>{
 const key=await buildArtifactCacheKey(spec()),descriptor=structuredClone(key.descriptor);delete descriptor.cacheKeyVersion;
 const forged={descriptor,key:`works-artifact-cache/1.0-draft.1:${await hashCanonical(descriptor)}`};
 await assert.rejects(cache().put(entry(forged),state()),{code:'INVALID_CACHE_KEY'});
});
test('resizable and detached backing buffers are not retained under a stale byte count',async()=>{
 const key=await buildArtifactCacheKey(spec()),c=cache();
 const growable=new ArrayBuffer(4,{maxByteLength:64});assert.equal(growable.resizable,true);
 await assert.rejects(c.put(entry(key,new Uint8Array(growable)),state()),{code:'CACHE_BINARY_INVALID'});
 const buffer=new ArrayBuffer(4),view=new Uint8Array(buffer);structuredClone(buffer,{transfer:[buffer]});
 const lease={ownerId:'cache-owner',mode:'lease',leaseId:'detached',leaseOwnerId:'native-owner',leaseRevision:1,immutable:true};
 await assert.rejects(c.put(entry(key,view,{ownership:lease}),state({leases:[{leaseId:'detached',ownerId:'native-owner',holderId:'cache-owner',revision:1,valid:true,immutable:true}]})),{code:'CACHE_BINARY_INVALID'});
 assert.equal(c.inspect().retainedBytes,0);
});
test('one lease identity cannot be adopted twice or released twice across different cache entries',async()=>{
 const a=await buildArtifactCacheKey(spec()),s=spec();s.config.variant='B';const b=await buildArtifactCacheKey(s),releases=[];
 const own={ownerId:'cache-owner',mode:'lease',leaseId:'lease:once',leaseOwnerId:'native-owner',leaseRevision:1,immutable:true};
 const current=state({leases:[{leaseId:own.leaseId,ownerId:own.leaseOwnerId,holderId:'cache-owner',revision:1,valid:true,immutable:true}]}),c=cache({release:async e=>releases.push(e)});
 await c.put(entry(a,Uint8Array.of(1),{ownership:own}),current);
 await assert.rejects(c.put(entry(b,Uint8Array.of(2),{ownership:own}),current),{code:'CACHE_LEASE_ALREADY_HELD'});
 await c.clear();assert.equal(releases.length,1);
 await assert.rejects(c.put(entry(b,Uint8Array.of(2),{ownership:own}),current),{code:'CACHE_LEASE_ALREADY_HELD'});assert.equal(releases.length,1);
});
test('release proof is bound to the current entry rather than replayable on the same cache key',async()=>{
 const key=await buildArtifactCacheKey(spec()),c=cache({release:async()=>{throw new Error('uncertain release');}});
 const first=await c.put(entry(key),state());await c.clear();
 const proof={ownerId:'cache-owner',entryId:first.entryId,evidenceRef:'fixture:first-resource-confirmed'};
 await c.confirmReleased(key.key,proof);
 const second=await c.put(entry(key,Uint8Array.of(5,6,7,8)),state());await c.clear();const retained=c.inspect().retainedBytes;
 assert.notEqual(second.entryId,first.entryId);
 await assert.rejects(c.confirmReleased(key.key,proof),{code:'CACHE_RECOVERY_TARGET_MISMATCH'});
 assert.equal(c.inspect().retainedBytes,retained);assert.equal(c.inspect().entries[0].entryId,second.entryId);
 await c.confirmReleased(key.key,{ownerId:'cache-owner',entryId:second.entryId,evidenceRef:'fixture:second-resource-confirmed'});assert.equal(c.inspect().retainedBytes,0);
});
test('cache recreation for the same owner cannot recreate an old recovery target identity',async()=>{
 const key=await buildArtifactCacheKey(spec()),a=cache({release:async()=>{throw new Error('uncertain A');}}),b=cache({release:async()=>{throw new Error('uncertain B');}});
 const first=await a.put(entry(key),state());await a.clear();const second=await b.put(entry(key),state());await b.clear();
 assert.notEqual(first.entryId,second.entryId);
 await assert.rejects(b.confirmReleased(key.key,{ownerId:'cache-owner',entryId:first.entryId,evidenceRef:'fixture:old-cache-proof'}),{code:'CACHE_RECOVERY_TARGET_MISMATCH'});
 assert.ok(b.inspect().retainedBytes>0);
});
test('leased recovery proof must identify the same native lease ownership',async()=>{
 const key=await buildArtifactCacheKey(spec()),own={ownerId:'cache-owner',mode:'lease',leaseId:'lease:release',leaseOwnerId:'native-owner',leaseRevision:1,immutable:true};
 const current=state({leases:[{leaseId:own.leaseId,ownerId:own.leaseOwnerId,holderId:'cache-owner',revision:1,valid:true,immutable:true}]}),c=cache({release:async()=>{throw new Error('uncertain lease release');}});
 const stored=await c.put(entry(key,Uint8Array.of(1),{ownership:own}),current);await c.clear();const retained=c.inspect().retainedBytes;
 const proof={ownerId:'cache-owner',entryId:stored.entryId,evidenceRef:'fixture:lease-confirmation',lease:{leaseId:own.leaseId,leaseOwnerId:own.leaseOwnerId,leaseRevision:2}};
 await assert.rejects(c.confirmReleased(key.key,proof),{code:'CACHE_RECOVERY_TARGET_MISMATCH'});assert.equal(c.inspect().retainedBytes,retained);
 proof.lease.leaseRevision=1;await c.confirmReleased(key.key,proof);assert.equal(c.inspect().retainedBytes,0);
});

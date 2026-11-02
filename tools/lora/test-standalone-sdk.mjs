import assert from 'node:assert/strict';
import test from 'node:test';
import {validateStandaloneRegistry,STANDALONE_CONTRACT_VERSION as V} from '../../docs/shared/inference/lora/standalone-registry.mjs';
import {LOADER_POLICY_ID} from '../../docs/shared/inference/lora/loader-policy.mjs';

const load=()=>import('../../docs/shared/inference/lora/standalone-sdk.mjs');
const target=(key,fullShape)=>({key,weightId:key,fullShape,dtype:'F32',layout:'row-major',parameterRole:key.endsWith('.bias')?'bias':'weight',logicalBinding:{kind:key.endsWith('.bias')?'logical-bias':'logical-weight',name:key}});
const registry=validateStandaloneRegistry({contractVersion:V,modelHash:'a'.repeat(64),registryVersion:'tiny-sdk-test/1',mappingVersion:'explicit-tiny-test/1',side:'HIGH',loaderPolicyId:LOADER_POLICY_ID,targets:[target('layer.weight',[2,2]),target('layer.bias',[2])]});
const base={describe:()=>({modelHash:registry.modelHash,side:'HIGH',baseVersion:'immutable-test/1'}),readBlock:async(id,offset,count)=>new Float32Array((id==='layer.weight'?[10,20,30,40]:[5,6]).slice(offset,offset+count))};
function blob(tensors){let at=0;const header={},parts=[];for(const [name,[shape,values]]of Object.entries(tensors)){const bytes=new Uint8Array(new Float32Array(values).buffer);header[name]={dtype:'F32',shape,data_offsets:[at,at+bytes.length]};at+=bytes.length;parts.push(bytes);}const h=new TextEncoder().encode(JSON.stringify(header)),prefix=new Uint8Array(8);new DataView(prefix.buffer).setBigUint64(0,BigInt(h.length),true);return new Blob([prefix,h,...parts]);}
const light=()=>blob({'layer.lora_down.weight':[[1,2],[1,2]],'layer.lora_up.weight':[[2,1],[3,4]],'layer.diff_b':[[2],[0.5,1]]});
const detail=()=>blob({'layer.lora_A.weight':[[1,2],[-1,1]],'layer.lora_B.weight':[[2,1],[2,3]]});
function kernel(){let disposed=0;return {info:{wasmSha256:'b'.repeat(64),maxBlockElements:1048576},decode(bytes,dtype){assert.equal(dtype,'F32');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return Float32Array.from({length:bytes.length/4},(_,i)=>view.getFloat32(i*4,true));},product({down,up,rows,cols,rank}){const out=new Float32Array(rows*cols);for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){let sum=0;for(let k=0;k<rank;k++)sum=Math.fround(sum+Math.fround(up[r*rank+k]*down[k*cols+c]));out[r*cols+c]=sum;}return out;},apply({base,delta,scale}){return Float32Array.from(base,(v,i)=>Math.fround(v+Math.fround(scale*delta[i])));},dispose(){disposed++;},stats:()=>({disposed})};}
function consumer(){
 let epoch=0,active=null,commits=0,rollbacks=0,disposed=0;const candidates=new Set();
 const out={contractVersion:V,describe:()=>registry,currentEpoch:()=>epoch,
  async prepareLoad(pkg,ctx){const c={lease:pkg.retain('tiny-consumer-candidate'),epoch,previous:null,committed:false};candidates.add(c);return c;},
  async validate(c,ctx){for await(const _ of c.lease.blocks()){}return {contractVersion:V,valid:true,validationMode:ctx.validationMode,planId:ctx.planId,packageHash:ctx.packageHash,registryHash:ctx.registryHash,coverage:ctx.coverage,scope:ctx.scope};},
  async commit(c,ctx){if(!ctx.isCurrent()||c.epoch!==epoch)throw Error('stale consumer candidate');c.previous=active;active=c.lease;c.committed=true;epoch++;commits++;return {contractVersion:V,state:'CONSUMER_APPLIED',validationMode:ctx.validationMode,planId:ctx.planId,packageHash:ctx.packageHash,registryHash:ctx.registryHash,epoch,ownership:{kind:'lease',ownerId:'tiny-consumer',isValid:()=>active?.isValid()===true}};},
  async rollback(c){rollbacks++;if(!c)return;if(c.committed&&active===c.lease){active=c.previous;c.previous=null;epoch++;}await c.lease.release();candidates.delete(c);},
  async releaseCandidate(c){if(!c)return;if(c.committed){await c.previous?.release();c.previous=null;}else await c.lease.release();candidates.delete(c);},
  read:async id=>active?active.readBlock(id,0,id==='layer.weight'?4:2):base.readBlock(id,0,id==='layer.weight'?4:2),
  async dispose(){disposed++;await active?.release();active=null;for(const c of candidates)await c.lease.release();candidates.clear();},stats:()=>({epoch,commits,rollbacks,disposed,candidates:candidates.size})};return out;
}
async function fixture(){const m=await load(),k=kernel(),sdk=m.createLoraStandalone({registry,baseProvider:base,kernel:k}),target=consumer();return {sdk,k,target,async close(){await sdk.recover();await sdk.dispose();await target.dispose();}};}
async function registerBoth(sdk){await sdk.register({pairId:'light',file:light()});await sdk.register({pairId:'detail',file:detail()});}
function memoryWriter(){const sources=new Map();let manifest=null;return {sources,get manifest(){return manifest;},writer:{async writeSource(name,chunks){const parts=[];for await(const bytes of chunks)parts.push(bytes.slice());sources.set(name,new Blob(parts));},async writeManifest(value){manifest=structuredClone(value);}}};}

// These are control/ownership tests with a tiny independent F32 fixture, not
// evidence of all-target Hike or original-file numerical acceptance.
test('standalone SDK supports the declared fixed-side normal transaction API',async()=>{
 const m=await load();assert.equal(typeof m.createLoraStandalone,'function');const f=await fixture();try{
  assert.equal(f.sdk.contractVersion,V);assert.equal(f.sdk.capabilities().side,'HIGH');assert.equal(f.sdk.stats().localRevision,0);
  await registerBoth(f.sdk);assert.deepEqual(f.sdk.inspect().sources.map(s=>s.sourceId),['light@HIGH','detail@HIGH']);
  assert.equal(f.sdk.capabilities().independentExpectedRequired,false);
 }finally{await f.close();}
});
test('normal apply composes light then detail, rebuilds immutable base and restores base',async()=>{const f=await fixture();try{
 await registerBoth(f.sdk);
 for(const [selections,w,b]of [
  [[{pairId:'detail',strength:1},{pairId:'light',strength:1}],[11,28,31,51],[5.5,7]],
  [[{pairId:'light',strength:0},{pairId:'detail',strength:0}],[10,20,30,40],[5,6]],
  [[{pairId:'light',strength:-1}],[7,14,26,32],[4.5,5]],
  [[{pairId:'detail',strength:1}],[8,22,27,43],[5,6]],
  [[{pairId:'light',strength:1}],[13,26,34,48],[5.5,7]],
  [[{pairId:'light',strength:1}],[13,26,34,48],[5.5,7]]
 ]){const receipt=await f.sdk.apply({selections,target:f.target});assert.equal(receipt.state,'CONSUMER_APPLIED');assert.equal(receipt.validationMode,'normal');assert.deepEqual([...await f.target.read('layer.weight')],w);assert.deepEqual([...await f.target.read('layer.bias')],b);}
 await f.sdk.restoreBase({target:f.target});assert.deepEqual([...await f.target.read('layer.weight')],[10,20,30,40]);assert.deepEqual([...await f.target.read('layer.bias')],[5,6]);assert.equal(f.sdk.stats().preparedPackages,0);
 }finally{await f.close();}});
test('registration hashes once and prepared packages retain branded verified sources',async()=>{const f=await fixture();let hashes=0,releases=0;try{
 const b=light();const source={retain(){let valid=true;return {source:{size:b.size,async read(o,n){if(o===0&&n===b.size)hashes++;return new Uint8Array(await b.slice(o,o+n).arrayBuffer());}},isValid:()=>valid,release(){if(valid){valid=false;releases++;}}};}};
 const receipt=await f.sdk.register({pairId:'light',source});assert.match(receipt.sourceSha256,/^[a-f0-9]{64}$/);assert.equal(hashes,1);
 await f.sdk.apply({selections:[{pairId:'light',strength:1}],target:f.target});await f.sdk.apply({selections:[{pairId:'light',strength:-1}],target:f.target});assert.equal(hashes,1);
 await f.sdk.dispose();assert.equal(releases,0);assert.deepEqual([...await f.target.read('layer.weight')],[7,14,26,32]);await f.target.dispose();assert.equal(releases,1);assert.equal(f.k.stats().disposed,0);
 }finally{await f.close();}});
test('compose captures selections, canonical order and explicit PARTIAL full-coordinate ranges',async()=>{const f=await fixture();try{
 await registerBoth(f.sdk);const selections=[{pairId:'detail',strength:1},{pairId:'light',strength:1}];const plan=await f.sdk.compose({selections,targets:[{key:'layer.weight',slice:{startRow:1,rowCount:1}}]});selections[0].strength=99;
 assert.deepEqual(plan.adapters.map(a=>a.pairId),['light','detail']);assert.equal(plan.coverage,'PARTIAL');assert.equal(plan.adapters[1].plan.strength,1);assert.deepEqual(plan.adapters[0].plan.operations[0].fullShape,[2,2]);
 const p=await f.sdk.prepare(plan);await f.sdk.stage(p,f.target);await f.sdk.release(p);assert.deepEqual([...await f.target.read('layer.weight')],[10,20,31,51]);
 }finally{await f.close();}});
test('unknown inputs and unregistered/duplicate pair selections reject before commit',async()=>{const f=await fixture();try{
 await assert.rejects(f.sdk.register({pairId:'other',file:light()}),/pair/i);await assert.rejects(f.sdk.register({pairId:'light',file:light(),source:light()}),/source|file/i);await assert.rejects(f.sdk.compose({selections:[{pairId:'light',strength:1}]}),/registered/i);await registerBoth(f.sdk);
 for(const selections of [[{pairId:'light',strength:Infinity}],[{pairId:'light',strength:1},{pairId:'light',strength:2}]])await assert.rejects(f.sdk.compose({selections}),/strength|duplicate/i);
 await assert.rejects(f.sdk.apply({selections:[],target:f.target,expected:new Float32Array()}),/unknown|Unsupported/);const p=await f.sdk.prepare(await f.sdk.compose({selections:[]}));await assert.rejects(f.sdk.stage(p,f.target,{validationMode:'diagnostic'}),/mode|normal/i);await f.sdk.release(p);assert.equal(f.target.stats().commits,0);
 }finally{await f.close();}});
test('new composition, source replacement and cancel invalidate branded local plans',async()=>{const f=await fixture();try{
 await registerBoth(f.sdk);const old=await f.sdk.compose({selections:[{pairId:'light',strength:1}]});await f.sdk.compose({selections:[]});await assert.rejects(f.sdk.prepare(old),/stale/i);
 const plan=await f.sdk.compose({selections:[{pairId:'light',strength:1}]}),p=await f.sdk.prepare(plan);await f.sdk.register({pairId:'light',file:light()});await assert.rejects(f.sdk.stage(p,f.target),/stale/i);await f.sdk.release(p);
 const cancelled=await f.sdk.compose({selections:[]});f.sdk.cancel();await assert.rejects(f.sdk.prepare(cancelled),/stale/i);await assert.rejects(f.sdk.prepare(structuredClone(cancelled)),/foreign|stale/i);
 }finally{await f.close();}});
test('cancellation waits bounded terminal work, blocks overlap and refuses delayed commit',async()=>{const f=await fixture();try{
 await registerBoth(f.sdk);let entered,finish;const started=new Promise(r=>entered=r),gate=new Promise(r=>finish=r);const native=f.target.validate;f.target.validate=async(c,ctx)=>{entered();await gate;return native(c,ctx);};
 const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}]}));const stage=f.sdk.stage(p,f.target);await started;const revision=f.sdk.stats().localRevision;f.sdk.cancel();assert.equal(f.sdk.stats().busy,true);assert.ok(f.sdk.stats().localRevision>revision);await assert.rejects(f.sdk.release(p),/use|busy/i);await assert.rejects(f.sdk.compose({selections:[]}),/busy/i);finish();await assert.rejects(stage,/cancel|stale|abort/i);assert.equal(f.target.stats().commits,0);await f.sdk.release(p);
 }finally{await f.close();}});
test('failed normal receipts roll back; failed rollback quarantines until explicit recover',async()=>{const f=await fixture();try{
 await registerBoth(f.sdk);const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}]}));const rollback=f.target.rollback;let fail=true;f.target.validate=async()=>true;f.target.rollback=async(...args)=>{if(fail)throw Error('rollback blocked');return rollback(...args);};
 await assert.rejects(f.sdk.stage(p,f.target),/rollback|recovery/i);assert.equal(f.sdk.stats().recoveryRequired,true);await assert.rejects(f.sdk.release(p),/recovery/i);await assert.rejects(f.sdk.compose({selections:[]}),/recovery/i);fail=false;await f.sdk.recover(p);assert.equal(f.sdk.stats().recoveryRequired,false);await f.sdk.release(p);assert.equal(f.target.stats().commits,0);
 }finally{await f.close();}});
test('consumer epoch differs from SDK revision and malformed commit epoch rolls back publication',async()=>{const f=await fixture();try{
 await registerBoth(f.sdk);const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}]}));const commit=f.target.commit;f.target.commit=async(...args)=>({...await commit(...args),epoch:99});await assert.rejects(f.sdk.stage(p,f.target),/epoch/i);assert.deepEqual([...await f.target.read('layer.weight')],[10,20,30,40]);await f.sdk.release(p);assert.notEqual(f.sdk.stats().localRevision,f.target.currentEpoch());
 }finally{await f.close();}});
test('dispose cancels then waits terminal work and leaves caller consumer/kernel intact',async()=>{const f=await fixture();try{
 await registerBoth(f.sdk);let entered,finish;const started=new Promise(r=>entered=r),gate=new Promise(r=>finish=r),native=f.target.validate;f.target.validate=async(c,ctx)=>{entered();await gate;return native(c,ctx);};
 const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}]})),stage=f.sdk.stage(p,f.target);await started;let done=false;const disposal=f.sdk.dispose().then(()=>done=true);await Promise.resolve();assert.equal(done,false);finish();await assert.rejects(stage,/dispose|cancel|stale|abort/i);await disposal;assert.equal(f.k.stats().disposed,0);assert.equal(f.target.stats().disposed,0);await assert.rejects(f.sdk.compose({selections:[]}),/disposed/i);
 }finally{await f.close();}});
test('registration cancellation reaches source hashing and releases its retained capability',async()=>{const f=await fixture();try{
 const b=light(),controller=new AbortController();let entered,finish,releases=0;const started=new Promise(r=>entered=r),gate=new Promise(r=>finish=r);
 const source={retain(){return {source:{size:b.size,async read(o,n){entered();await gate;return new Uint8Array(await b.slice(o,o+n).arrayBuffer());}},isValid:()=>true,release(){releases++;}};}};
 const pending=f.sdk.register({pairId:'light',source,signal:controller.signal});await started;controller.abort();assert.equal(f.sdk.stats().busy,true);finish();await assert.rejects(pending,/abort/i);assert.equal(releases,1);assert.equal(f.sdk.inspect().sources.length,0);
 }finally{await f.close();}});
test('receipt accessors cannot cancel after commit and discard the predecessor before rollback',async()=>{const f=await fixture();try{
 await registerBoth(f.sdk);await f.sdk.apply({selections:[{pairId:'light',strength:1}],target:f.target});const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'detail',strength:1}]}));
 const native=f.target.commit;f.target.commit=async(...args)=>{const receipt=await native(...args);return {...receipt,get ownership(){f.sdk.cancel();return receipt.ownership;}};};
 await assert.rejects(f.sdk.stage(p,f.target),/cancel|stale/i);assert.deepEqual([...await f.target.read('layer.weight')],[13,26,34,48]);assert.equal(f.sdk.stats().recoveryRequired,false);await f.sdk.release(p);
 }finally{await f.close();}});
test('failed registration release during dispose is retained for recover and retry',async()=>{const f=await fixture();try{
 const b=light();let fail=true,releases=0;const source={retain(){return {source:{size:b.size,read:async(o,n)=>new Uint8Array(await b.slice(o,o+n).arrayBuffer())},isValid:()=>true,release(){releases++;if(fail)throw Error('release blocked');}};}};
 await f.sdk.register({pairId:'light',source});await assert.rejects(f.sdk.dispose(),/resources|retained|release/i);assert.equal(f.sdk.stats().recoveryRequired,true);assert.equal(f.sdk.stats().registeredSources,1);fail=false;await f.sdk.recover();assert.equal(f.sdk.stats().recoveryRequired,false);assert.equal(f.sdk.stats().registeredSources,0);await f.sdk.dispose();assert.equal(releases,2);
 }finally{await f.close();}});
test('failed prepared creator release remains owned and recover retries it',async()=>{const f=await fixture();try{
 const b=light();let fail=true,releases=0;const source={retain(){return {source:{size:b.size,read:async(o,n)=>new Uint8Array(await b.slice(o,o+n).arrayBuffer())},isValid:()=>true,release(){releases++;if(fail)throw Error('source release blocked');}};}};
 await f.sdk.register({pairId:'light',source});const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}]}));await f.sdk.register({pairId:'light',file:light()});await assert.rejects(f.sdk.release(p),/release/i);assert.equal(f.sdk.stats().preparedPackages,1);assert.equal(f.sdk.stats().recoveryRequired,true);fail=false;await f.sdk.recover(p);assert.equal(f.sdk.stats().preparedPackages,0);assert.equal(f.sdk.stats().recoveryRequired,false);assert.equal(releases,2);
 }finally{await f.close();}});
test('external currentness is rechecked after validation before actual commit',async()=>{const f=await fixture();try{
 await registerBoth(f.sdk);let current=true;const validate=f.target.validate;f.target.validate=async(...args)=>{const receipt=await validate(...args);current=false;return receipt;};
 const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}]}));await assert.rejects(f.sdk.stage(p,f.target,{isCurrent:()=>current}),/current|context/i);assert.equal(f.target.stats().commits,0);await f.sdk.release(p);
 }finally{await f.close();}});
test('apply captures its consumer and control declarations before asynchronous preparation',async()=>{const f=await fixture(),other=consumer();try{
 await registerBoth(f.sdk);const input={selections:[{pairId:'light',strength:1}],target:f.target,isCurrent:()=>true,validationMode:'normal'},pending=f.sdk.apply(input);input.target=other;input.isCurrent=()=>false;input.validationMode='diagnostic';input.selections[0].strength=-1;
 await pending;assert.equal(f.target.stats().commits,1);assert.equal(other.stats().commits,0);assert.deepEqual([...await f.target.read('layer.weight')],[13,26,34,48]);
 }finally{await f.close();await other.dispose();}});
test('a source callback can request dispose before its register promise returns',async()=>{const f=await fixture();let disposal;try{
 const b=light();let releases=0;const source={retain(){disposal=f.sdk.dispose();return {source:{size:b.size,read:async(o,n)=>new Uint8Array(await b.slice(o,o+n).arrayBuffer())},isValid:()=>true,release(){releases++;}};}};
 await assert.rejects(f.sdk.register({pairId:'light',source}),/cancel|dispose|abort/i);await disposal;assert.equal(f.sdk.stats().busy,false);assert.equal(f.sdk.stats().registeredSources,0);assert.equal(releases,1);
 }finally{await disposal?.catch(()=>{});await f.close();}});
test('recovery is a busy terminal task and never retries one consumer rollback concurrently',async()=>{const f=await fixture();let finish;try{
 await registerBoth(f.sdk);const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}]})),native=f.target.rollback;let initial=true,calls=0,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>finish=r);f.target.validate=async()=>false;f.target.rollback=async(...args)=>{if(initial)throw Error('initial rollback blocked');calls++;entered();await gate;return native(...args);};await assert.rejects(f.sdk.stage(p,f.target),/recovery/i);initial=false;
 const first=f.sdk.recover(p);await started;let secondBusy=false;const second=f.sdk.recover(p).catch(e=>{secondBusy=e.code==='BUSY';});const busy=f.sdk.stats().busy;finish();await first;await second;assert.equal(busy,true);assert.equal(secondBusy,true);assert.equal(calls,1);await f.sdk.release(p);
 }finally{finish?.();await f.close();}});
test('pre-handle source cleanup recovery remains owned by the SDK',async()=>{const f=await fixture();try{
 let fail=true,releases=0;const source={retain(){return {source:{size:16,read:async()=>new Uint8Array()},isValid:()=>true,release(){releases++;if(fail)throw Error('prehandle release blocked');}};}};
 await assert.rejects(f.sdk.register({pairId:'light',source}),/capture|cleanup|release/i);assert.equal(f.sdk.stats().recoveryRequired,true);await assert.rejects(f.sdk.compose({selections:[]}),/recovery/i);fail=false;await f.sdk.recover();assert.equal(f.sdk.stats().recoveryRequired,false);assert.equal(releases,2);assert.equal(f.sdk.stats().registeredSources,0);
 }finally{await f.close();}});
test('ordinary SDK save reopens durable payload into a fresh SDK transaction and consumer',async()=>{const f=await fixture();let reopened;try{
 await registerBoth(f.sdk);const plan=await f.sdk.compose({selections:[{pairId:'light',strength:1},{pairId:'detail',strength:1}]}),p=await f.sdk.prepare(plan);await f.sdk.stage(p,f.target);const saved=memoryWriter(),manifest=await f.sdk.save(p,{writer:saved.writer}),oldId=p.handle.handleId,oldInstance=f.sdk.sdkInstanceId;
 assert.deepEqual(manifest,saved.manifest);assert.equal(saved.sources.size,2);await f.sdk.dispose();await f.target.dispose();await assert.rejects(p.handle.readBlock('layer.weight',0,4),/release/i);
 const m=await load(),sdk=m.createLoraStandalone({registry,baseProvider:base,kernel:f.k}),host=consumer();reopened={sdk,host};const opened=await sdk.openPackage({manifest:saved.manifest,sources:saved.sources});
 assert.notEqual(opened.handle.handleId,oldId);assert.notEqual(sdk.sdkInstanceId,oldInstance);assert.equal(opened.sdkInstanceId,sdk.sdkInstanceId);assert.equal(opened.localRevision,sdk.stats().localRevision);assert.match(opened.transactionId,/^[0-9a-f-]{36}$/);assert.notEqual(opened.transactionId,p.transactionId);assert.equal(opened.originPlanId,manifest.planId);assert.equal(opened.planId,manifest.planId);assert.equal(opened.manifest.packageHash,manifest.packageHash);assert.deepEqual(opened.manifest,manifest);
 let context;const prepare=host.prepareLoad;host.prepareLoad=async(pkg,ctx)=>{context=ctx;return prepare(pkg,ctx);};await sdk.stage(opened,host);assert.equal(context.sdkInstanceId,sdk.sdkInstanceId);assert.equal(context.transactionId,opened.transactionId);assert.equal(context.localRevision,opened.localRevision);assert.deepEqual([...await host.read('layer.weight')],[11,28,31,51]);assert.deepEqual([...await host.read('layer.bias')],[5.5,7]);await sdk.release(opened);assert.deepEqual([...await host.read('layer.weight')],[11,28,31,51]);
 }finally{await reopened?.sdk.dispose();await reopened?.host.dispose();await f.close();}});
test('SDK rejects tampered manifests, payloads, wrong base and wrong registry before consumer preparation',async()=>{const f=await fixture();try{
 await registerBoth(f.sdk);const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}]})),saved=memoryWriter();await f.sdk.save(p,{writer:saved.writer});await f.sdk.release(p);
 await assert.rejects(f.sdk.openPackage({manifest:{...saved.manifest,packageHash:'0'.repeat(64)},sources:saved.sources}),/hash|integrity/i);
 const changed=new Map(saved.sources),bytes=new Uint8Array(await changed.values().next().value.arrayBuffer());bytes[bytes.length-1]^=128;changed.set(changed.keys().next().value,new Blob([bytes]));await assert.rejects(f.sdk.openPackage({manifest:saved.manifest,sources:changed}),/hash/i);
 const wrong=structuredClone(saved.manifest);wrong.registry.side='LOW';await assert.rejects(f.sdk.openPackage({manifest:wrong,sources:saved.sources}),/registry|side/i);
 await assert.rejects(f.sdk.openPackage({manifest:saved.manifest,sources:saved.sources,handle:p.handle}),/unknown|Unsupported/i);
 const m=await load(),bad=m.createLoraStandalone({registry,baseProvider:{...base,describe:()=>({modelHash:'c'.repeat(64),side:'HIGH'})},kernel:f.k});try{await assert.rejects(bad.openPackage({manifest:saved.manifest,sources:saved.sources}),/base|identity/i);assert.equal(bad.stats().preparedPackages,0);}finally{await bad.dispose();}
 assert.equal(f.target.stats().commits,0);assert.equal(f.sdk.stats().preparedPackages,0);assert.equal(f.sdk.stats().recoveryRequired,false);
 }finally{await f.close();}});
test('save requires a current live prepared package and blocks release until terminal cancellation',async()=>{const f=await fixture();let finish;try{
 await registerBoth(f.sdk);const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}]}));let entered,manifests=0;const started=new Promise(r=>entered=r),gate=new Promise(r=>finish=r),controller=new AbortController();const pending=f.sdk.save(p,{signal:controller.signal,writer:{async writeSource(_,chunks){entered();await gate;for await(const _ of chunks){}},async writeManifest(){manifests++;}}});await started;assert.equal(f.sdk.stats().busy,true);await assert.rejects(f.sdk.release(p),/use|busy/i);controller.abort();finish();await assert.rejects(pending,/abort/i);assert.equal(manifests,0);await f.sdk.save(p,{writer:memoryWriter().writer});
 await f.sdk.compose({selections:[]});await assert.rejects(f.sdk.save(p,{writer:memoryWriter().writer}),/stale/i);await f.sdk.release(p);
 }finally{finish?.();await f.close();}});
test('cancelled package open releases fresh payload leases without publishing a prepared handle',async()=>{const f=await fixture();let finish;try{
 await registerBoth(f.sdk);const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}]})),saved=memoryWriter();await f.sdk.save(p,{writer:saved.writer});await f.sdk.release(p);const b=saved.sources.values().next().value;let entered,releases=0;const started=new Promise(r=>entered=r),gate=new Promise(r=>finish=r);const source={retain(){return {source:{size:b.size,async read(o,n){entered();await gate;return new Uint8Array(await b.slice(o,o+n).arrayBuffer());}},isValid:()=>true,release(){releases++;}};}};
 const input={manifest:saved.manifest,sources:new Map([[saved.sources.keys().next().value,source]])},pending=f.sdk.openPackage(input);await started;f.sdk.cancel();assert.equal(f.sdk.stats().busy,true);finish();await assert.rejects(pending,/cancel|stale|abort/i);assert.equal(f.sdk.stats().preparedPackages,0);assert.equal(releases,1);
 }finally{finish?.();await f.close();}});
test('failed package open retains pre-handle payload cleanup for SDK recovery',async()=>{const f=await fixture();try{
 await registerBoth(f.sdk);const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}]})),saved=memoryWriter();await f.sdk.save(p,{writer:saved.writer});await f.sdk.release(p);const bytes=new Uint8Array(await saved.sources.values().next().value.arrayBuffer());bytes[bytes.length-1]^=128;let fail=true,releases=0;const source={retain(){return {source:{size:bytes.length,read:async(o,n)=>bytes.slice(o,o+n)},isValid:()=>true,release(){releases++;if(fail)throw Error('saved payload release blocked');}};}};
 await assert.rejects(f.sdk.openPackage({manifest:saved.manifest,sources:new Map([[saved.sources.keys().next().value,source]])}),/cleanup|hash|release/i);assert.equal(f.sdk.stats().recoveryRequired,true);assert.equal(f.sdk.stats().preparedPackages,0);fail=false;await f.sdk.recover();assert.equal(f.sdk.stats().recoveryRequired,false);assert.equal(releases,2);
 }finally{await f.close();}});
test('package open snapshots persisted metadata and source-map bindings before awaiting',async()=>{const f=await fixture();try{
 await registerBoth(f.sdk);const p=await f.sdk.prepare(await f.sdk.compose({selections:[{pairId:'light',strength:1}]})),saved=memoryWriter();await f.sdk.save(p,{writer:saved.writer});await f.sdk.release(p);const input={manifest:structuredClone(saved.manifest),sources:new Map(saved.sources)},opening=f.sdk.openPackage(input);input.manifest.packageHash='0'.repeat(64);input.sources.clear();
 const opened=await opening;await f.sdk.stage(opened,f.target);assert.deepEqual([...await f.target.read('layer.weight')],[13,26,34,48]);await f.sdk.release(opened);
 }finally{await f.close();}});

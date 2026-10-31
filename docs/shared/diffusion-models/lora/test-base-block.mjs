import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {diagnosticRegistryHash} from './diagnostic-identity.mjs';

assert.ok(existsSync(new URL('./base-block.mjs',import.meta.url)),'Bounded fragment provider implementation missing');
const {createBerniniBlockProvider}=await import('./base-block.mjs');
const path=process.env.BERNINI_E1_BLOCK_ARTIFACT??'/workspace/work/diffusion-private-e1/base-blocks.json';
const artifact=existsSync(path)?JSON.parse(await readFile(path,'utf8')):null;
const hikeBytes=await readFile(new URL('../ort-bridge/kernel/bridge.wasm',import.meta.url));
const refs=JSON.parse(await readFile(new URL('../../../../development/ai-connection/l1-reference.json',import.meta.url)));
const sha=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',value)).toString('hex');
const copy=()=>structuredClone(artifact);
const init=(input=copy(),side='LOW',options={})=>createBerniniBlockProvider({artifact:input,side,hikeBytes,...options});
const binding=p=>{const r=p.describe();return {modelHash:r.modelHash,graphHash:r.graphHash,registryHash:r.registryHash};};
test('invalid or whole-file claims reject without treating fragments as a full File',async()=>{
 for(const bad of [null,{},new Blob(['not a fragment'])])await assert.rejects(()=>createBerniniBlockProvider({artifact:bad,side:'LOW',hikeBytes}));
});
for(const ref of refs.models)test('actual '+ref.side+' fragment gives owned Hike F32 blocks without the original model File', {skip:!artifact},async()=>{
 const p=await init(copy(),ref.side);
 try{
  assert.deepEqual(p.describe(),artifact.sides[ref.side].registry);const ctx=binding(p);
  const weight=await p.baseProvider.readBlock('q.weight',0,81920,ctx),bias=await p.baseProvider.readBlock('q.bias',0,16,ctx);
  assert.equal(await sha(weight),ref.weightSHA256);assert.equal(await sha(bias),ref.biasSHA256);
  const memory=p.stats().hike.memoryBytes;weight.fill(99);bias.fill(99);
  assert.equal((await p.baseProvider.readBlock('q.weight',0,13,ctx)).length,13);assert.equal(p.stats().hike.memoryBytes,memory);
  assert.equal(p.stats().fullFileHashRecomputed,false);assert.equal(p.stats().fullFileSHA256Verified,false);assert.equal(p.stats().unprovidedRangesAvailable,false);assert.deepEqual(p.stats().providedRangeIds,['header','q.weight','q.bias','weight_scale','comfy_quant']);
  const descriptor=p.describe();descriptor.targets[0].shape[0]=1;assert.deepEqual(p.describe().targets[0].shape,[16,5120]);
 }finally{p.dispose();}
 await assert.rejects(()=>p.baseProvider.readBlock('q.weight',0,1,{}),/disposed/i);
});
test('all artifact bytes and metadata are captured before the first asynchronous hash', {skip:!artifact},async()=>{
 const input=copy(),pending=init(input);input.sides.LOW.registry.targets[0].shape[0]=1;input.sides.LOW.ranges[1].data='broken';input.sides.HIGH=null;
 const p=await pending;try{assert.equal(await sha(await p.baseProvider.readBlock('q.weight',0,81920,binding(p))),refs.models.find(r=>r.side==='LOW').weightSHA256);}finally{p.dispose();}
});
test('provided range corruption, absolute offsets, base64 and incomplete coverage reject', {skip:!artifact},async()=>{
 for(const mutate of [
  b=>{b.ranges[1].sha256='0'.repeat(64);},b=>{b.ranges[1].absoluteByteOffset++;},b=>{b.ranges[1].byteLength++;},b=>{b.ranges[1].data='!'+b.ranges[1].data.slice(1);},b=>{b.ranges.pop();},b=>{b.ranges.push({...b.ranges[1],id:'unprovided-original-rows'});},b=>{b.registry.targets[0].shape[0]=1;}
 ]){const input=copy();mutate(input.sides.LOW);await assert.rejects(()=>init(input));}
});
test('self-consistent forged registry, scale, config and prior-owner provenance are not accepted', {skip:!artifact},async()=>{
 for(const mutate of [
  b=>{b.registry.targets[0].source.payloadByteOffset++;},b=>{b.registry.targets[0].fp8.scale*=2;},b=>{b.registry.targets[0].transform.rowStart=16;b.registry.targets[1].transform.rowStart=16;},b=>{b.source.modelSha256='0'.repeat(64);},b=>{b.source.priorOwnerReceipt.verified=false;},b=>{b.registry.baseVerification.fullFileSHA256Verified=true;}
 ]){const input=copy(),b=input.sides.LOW;mutate(b);b.registry.registryHash=diagnosticRegistryHash(b.registry);await assert.rejects(()=>init(input));}
 for(const id of ['header','comfy_quant','weight_scale']){const input=copy(),r=input.sides.LOW.ranges.find(r=>r.id===id),bytes=Buffer.from(r.data,'base64');bytes[0]^=1;r.data=bytes.toString('base64');r.sha256=await sha(bytes);await assert.rejects(()=>init(input));}
 const input=copy();input.fullFileHashRecomputed=true;await assert.rejects(()=>init(input));await assert.rejects(()=>init(copy(),'OTHER'));
});
test('fragment reads reject wrong identity, absent data, ranges and aborted signals', {skip:!artifact},async()=>{
 const p=await init();try{
  const ctx=binding(p);for(const args of [['unknown',0,1,ctx],['q.weight',81920,1,ctx],['q.bias',0,17,ctx],['q.weight',0,0,ctx],['q.weight',-1,1,ctx],['q.weight',0,1,{...ctx,registryHash:'0'.repeat(64)}]])await assert.rejects(()=>p.baseProvider.readBlock(...args));
  const signal=new AbortController();signal.abort();const calls=p.stats().hike.calls;await assert.rejects(()=>p.baseProvider.readBlock('q.weight',0,1,{...ctx,signal:signal.signal}),{name:'AbortError'});assert.equal(p.stats().hike.calls,calls);
  const controller=new AbortController(),pending=p.baseProvider.readBlock('q.weight',0,81920,{...ctx,signal:controller.signal});controller.abort();await assert.rejects(pending,{name:'AbortError'});
 }finally{p.dispose();}
});
test('initialization cancellation and dispose stop acceptance after bounded work', {skip:!artifact},async()=>{
 const controller=new AbortController(),pending=init(copy(),'LOW',{signal:controller.signal});controller.abort();await assert.rejects(pending,{name:'AbortError'});
 const p=await init(),reading=p.baseProvider.readBlock('q.weight',0,81920,binding(p));p.dispose();await assert.rejects(reading,/disposed/i);p.dispose();assert.equal(p.stats().disposed,true);assert.equal(p.stats().hike,null);
});

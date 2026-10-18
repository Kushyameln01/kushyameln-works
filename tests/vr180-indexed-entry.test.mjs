import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectExecutionRoute,INDEXED_PROFILE} from '../docs/shared/vr180/route-profile.mjs';
import {convertIndexed} from '../docs/shared/vr180/indexed/entry.mjs';
const settings={mode:'convert',executionRoute:'indexed',confirmed:true,layout:'sbs',fov:180};
test('route selection keeps legacy defaults and refuses unsupported indexed capabilities or capacity profiles',()=>{
  assert.equal(selectExecutionRoute({mode:'convert'},{inputBytes:2**40}).id,'legacy');
  for(const mode of ['inspect','copy'])assert.equal(selectExecutionRoute({mode,executionRoute:'indexed'}).id,'legacy');
  assert.throws(()=>selectExecutionRoute(settings,{inputBytes:1}),/HANDLE_REQUIRED/);
  assert.throws(()=>selectExecutionRoute(settings,{outputHandle:{},inputBytes:2**30+1}),/INPUT_LIMIT/);
  for(const outputProfileId of ['p5-5gb','p5-10gb',2000000000])assert.throws(()=>selectExecutionRoute({...settings,outputProfileId},{outputHandle:{},inputBytes:1}),/PROFILE_UNSUPPORTED/);
  assert.equal(selectExecutionRoute(settings,{outputHandle:{},inputBytes:2**30}).profile,INDEXED_PROFILE);
  assert.equal(INDEXED_PROFILE.maxOutputBytes,2**30);assert.equal(INDEXED_PROFILE.maxSamples,100000);
});
test('entry uses only combined fork and preserves verified observation across registry cleanup failure',async()=>{
  const order=[],fork={},observation=Object.freeze({bytes:3,committed:true}),directory={};let fail=true,cleanup;
  const options={operationId:'entry-test',inputRevision:3,outputHandle:{},onCleanup:fn=>{cleanup=fn;},
    createRegistry:async()=>({identity:{operationId:'entry-test'},directory,persist:async ticket=>order.push(ticket.kind),cleanup:async()=>{order.push('registry-clean');if(fail)throw Error('REGISTRY_REMOVE_FAILED');}}),
    loadFork:async()=>{order.push('fork-load');return fork;},loadRuntime:async()=>({convertStereo:async(_file,_settings,options)=>{
      assert.equal(options.fork,fork);assert.equal(options.indexRoot,directory);assert.equal(options.outputProfileId,'default');
      options.onCleanup(async()=>order.push('live-clean'));await options.onIndexOwnership({kind:'input'});await options.onIndexOwnership({kind:'output'});
      return {file:new Blob(['out']),savedObservation:observation,cleanup:async()=>order.push('live-clean')};
    }})};
  let error;await assert.rejects(convertIndexed(new Blob(['in']),settings,options),e=>{error=e;return /REMOVE_FAILED/.test(e.message);});
  assert.equal(error.savedObservation,observation);assert.equal(error.registry.status,'retained');
  assert.deepEqual(order,['fork-load','input','output','live-clean','registry-clean']);fail=false;await cleanup();
  assert.deepEqual(order.slice(-2),['live-clean','registry-clean']);
});
test('missing registry capabilities fail before importing either codec implementation',async()=>{
  let loads=0;await assert.rejects(convertIndexed(new Blob(['in']),settings,{outputHandle:{},operationId:'entry',inputRevision:1,
    storage:null,loadRuntime:async()=>{loads++;},loadFork:async()=>{loads++;}}),/OPFS_UNAVAILABLE/);assert.equal(loads,0);
});
test('entry imports no original vendor and keeps the runtime/fork lazy',async()=>{
  const source=await readFile(new URL('../docs/shared/vr180/indexed/entry.mjs',import.meta.url),'utf8');
  assert(!source.includes('media-basic'));assert(source.includes("() => import('./transform.mjs')"));
  assert(source.includes("() => import('../vendor/mediabunny-indexed.mjs')"));
});

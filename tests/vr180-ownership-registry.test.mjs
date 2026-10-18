import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {nodeRoot,testLocks} from '../development/vr180/output-index-prototype/node-backend.mjs';
import {createOwnershipRegistry,recoverIndexedJob,listIndexedJobs,REGISTRY_ROOT} from '../docs/shared/vr180/ownership-registry.mjs';
const ticket=kind=>({format:'vr180-private-index-owner',schema:1,jobId:'registry-test'+(kind==='input'?'-in':'-out'),ownerToken:'a'.repeat(32),kind});
function setup(t,hooks={}) {
  const path=mkdtempSync(join(tmpdir(),'vr180-registry-'));t.after(()=>rmSync(path,{recursive:true,force:true}));
  const backend=nodeRoot(path,hooks),locks=testLocks(),storage={getDirectory:async()=>backend.root},events=[];
  return {path,backend,locks,storage,events,options:{operationId:'registry-test',inputRevision:7,storage,locks,onObservation:e=>events.push(e)}};
}
for(const count of [0,1,2])test(`registry durably records and cleans only its ${count} tickets`,async t=>{
  const h=setup(t,{shortWrite:7,shortRead:5}),registry=await createOwnershipRegistry(h.options);
  for(const kind of ['input','output'].slice(0,count))await registry.persist(ticket(kind));
  for(const event of h.events.filter(e=>['ready','persisted'].includes(e.status))){
    assert(event.bytes<=1024);assert.equal(event.flushed,true);assert.equal(event.closed,true);assert.equal(event.readbackMatched,true);
    assert(event.writeCalls>1);assert(event.readCalls>1);assert.equal(createHash('sha256').update(event.persistedJSON).digest('hex'),event.sha256);
    assert.equal(JSON.parse(event.persistedJSON).identity?.inputRevision??JSON.parse(event.persistedJSON).inputRevision,7);
  }
  assert.equal(h.backend.open.size,0);assert.equal((await listIndexedJobs(h)).jobs[0].ticketCount,count);
  assert.equal((await registry.cleanup()).status,'complete');assert.equal(h.locks.held.size,0);
  assert.deepEqual(readdirSync(join(h.path,REGISTRY_ROOT)),[]);await registry.cleanup();
});
test('partial ticket write retains raw evidence and never announces persistence or index permission',async t=>{
  let fail=false;const h=setup(t,{write(path){if(fail&&path.endsWith('input.json'))return 0;}});
  const registry=await createOwnershipRegistry(h.options);fail=true;
  await assert.rejects(registry.persist(ticket('input')),/WRITE_PROGRESS/);
  await assert.rejects(registry.cleanup(),e=>e.requiresWorkerTermination&&/PARTIAL_RECORD_RETAINED/.test(e.message));
  assert.equal(h.backend.open.size,0);assert.equal(h.events.filter(e=>e.status==='persisted').length,0);
  assert(existsSync(join(h.path,REGISTRY_ROOT,registry.identity.namespace,'input.json')));
  assert.equal((await listIndexedJobs(h)).jobs[0].status,'retained');
});
test('close failure keeps ownership and reports HOLD until handle close can be retried',async t=>{
  let fail=true;const h=setup(t,{close(){if(fail)throw Error('CLOSE_FAILED');}});let failure;
  await assert.rejects(createOwnershipRegistry(h.options),e=>{failure=e;return /CLOSE_FAILED/.test(e.message);});
  assert.equal(h.backend.open.size,1);fail=false;
  await assert.rejects(failure.retryCleanup(),/PARTIAL_RECORD_RETAINED/);assert.equal(h.backend.open.size,0);
  assert.equal(h.events.filter(e=>e.status==='ready').length,0);
});
test('duplicate identity, foreign ticket and unknown entry never authorize removal',async t=>{
  const h=setup(t),registry=await createOwnershipRegistry(h.options);
  await assert.rejects(createOwnershipRegistry(h.options),/LEASE_BUSY/);
  await assert.rejects(registry.persist({...ticket('input'),jobId:'foreign-in'}),/TICKET_INVALID/);
  writeFileSync(join(h.path,REGISTRY_ROOT,registry.identity.namespace,'unknown.json'),'unrelated');
  const before=h.backend.calls.remove.length;await assert.rejects(registry.cleanup(),/UNKNOWN_ENTRY/);
  assert.equal(h.backend.calls.remove.length,before);
});
test('last directory removal failure retains a live retry without adopting unknown new entries',async t=>{
  let fail=true;const h=setup(t,{remove(path){if(fail&&path.endsWith('registry-test-r7'))throw Error('REMOVE_FAILED');}});
  const registry=await createOwnershipRegistry(h.options);await registry.persist(ticket('input'));
  await assert.rejects(registry.cleanup(),/REMOVE_FAILED/);
  assert.deepEqual(readdirSync(join(h.path,REGISTRY_ROOT,registry.identity.namespace)),[]);
  assert.equal(h.locks.held.size,1);fail=false;await registry.cleanup();assert.equal(h.locks.held.size,0);
});
test('explicit reopened registry recovery uses matching tickets and preserves a different owner',async t=>{
  const h=setup(t),registry=await createOwnershipRegistry(h.options);await registry.persist(ticket('input'));
  const dir=join(h.path,REGISTRY_ROOT,registry.identity.namespace),saved=Object.fromEntries(readdirSync(dir).map(n=>[n,readFileSync(join(dir,n))]));
  await registry.cleanup();mkdirSync(dir);for(const [name,bytes]of Object.entries(saved))writeFileSync(join(dir,name),bytes);
  mkdirSync(join(h.path,REGISTRY_ROOT,'other-owner'));
  let received;
  await recoverIndexedJob(registry.identity,{...h,cleanupOwner:async options=>{received=options;return {status:'already-absent'};}});
  assert.equal(received.ownerToken,ticket('input').ownerToken);assert.equal(received.jobId,'registry-test-in');
  assert.deepEqual(readdirSync(join(h.path,REGISTRY_ROOT)),['other-owner']);assert.equal(h.locks.held.size,0);
});
test('recovery retains a failed child owner cleanup closure and retries it before reacquiring the job',async t=>{
  const h=setup(t),registry=await createOwnershipRegistry(h.options);await registry.persist(ticket('input'));
  const dir=join(h.path,REGISTRY_ROOT,registry.identity.namespace),saved=Object.fromEntries(readdirSync(dir).map(n=>[n,readFileSync(join(dir,n))]));
  await registry.cleanup();mkdirSync(dir);for(const [name,bytes]of Object.entries(saved))writeFileSync(join(dir,name),bytes);
  let calls=0,retried=0,failure;
  await assert.rejects(recoverIndexedJob(registry.identity,{...h,cleanupOwner:async()=>{
    if(++calls===1)throw Object.assign(Error('CHILD_CLOSE_FAILED'),{retryCleanup:async()=>{retried++;}});
    assert.equal(retried,1);return {status:'already-absent'};
  }}),error=>{failure=error;return /CHILD_CLOSE_FAILED/.test(error.message);});
  assert.equal(h.locks.held.size,0);assert(existsSync(dir));
  assert.equal((await failure.retryCleanup()).status,'complete');assert.equal(retried,1);assert.equal(calls,2);
  assert.equal(existsSync(dir),false);
});

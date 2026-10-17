// Harness protocol tests on real temporary files; not native OPFS qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, rm, readFile, writeFile, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {nodeRoot, testLocks} from '../development/vr180/output-index-prototype/node-backend.mjs';

const source = JSON.parse(execFileSync('python', ['-c', `import importlib.util,json
s=importlib.util.spec_from_file_location('probe','tools/vr180/probe-indexed-conversion.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
print(json.dumps({k:getattr(m,k) for k in ['REGISTRY','WORKER','CLEANUP']}))`], {encoding: 'utf8'}));
const ticket = (kind, job='trial') => ({format:'vr180-private-index-owner',schema:1,
  jobId:job+(kind==='input'?'-in':'-out'),ownerToken:(kind==='input'?'1':'2').repeat(32),kind});
const describe = e => ({name:e.name,message:e.message,status:e.status??null});
const missing = async (root, name) => {try {await root.getDirectoryHandle(name); return false;}
  catch(e) {if(e.name==='NotFoundError') return true; throw e;}};
async function fixture(t, hooks={}) {
  const path=await mkdtemp(join(tmpdir(),'vr180-registry-'));t.after(()=>rm(path,{recursive:true,force:true}));
  const backend=nodeRoot(path,hooks),locks=testLocks();locks.query=async()=>({held:[...locks.held.values()],pending:[]});
  const row={operationId:'trial',status:'PASS',metrics:{indexReservedAfterCleanup:0}};
  const context=vm.createContext({crypto,TextEncoder,TextDecoder,Uint8Array,performance,
    require:(ok,msg)=>{if(!ok)throw Error(msg);},describe,missing,navigator:{locks}});
  const create=vm.runInContext(source.REGISTRY+'\ncreateOwnershipRegistry',context);
  const registry=await create(backend.root,'trial',row);
  return {path,...backend,locks,row,registry,context};
}
async function persistBoth(f) {await f.registry.persist(ticket('input'));await f.registry.persist(ticket('output'));}

test('short writes/reads complete, flush and closed-file readback precede acknowledgment',async t=>{
  const f=await fixture(t,{shortWrite:7,shortRead:11});await persistBoth(f);
  assert.equal(f.open.size,0);assert.equal(f.calls.getFile.length,2);
  for(const record of f.row.indexOwnership) {
    assert.deepEqual(JSON.parse(await readFile(join(f.path,'registry-trial',record.name),'utf8')),JSON.parse(JSON.stringify(record.ticket)));
    assert.equal(record.persistedJSON,JSON.stringify(record.ticket));assert.equal(record.status,'PERSISTED');
    assert.ok(record.writeCalls>1&&record.readCalls>1&&record.flushed&&record.closed&&record.readbackMatched);
    assert.ok(record.durationMs>=0&&record.endedMs>=record.startedMs);assert.ok(record.bytes<=1024);
  }
  await assert.rejects(f.registry.persist(ticket('input')),/REGISTRY_TICKET_LIMIT/);
  assert.equal(f.calls.remove.length,0);
});
test('normal and cancellation proof remove only registry under both leases',async t=>{
  for(const status of ['PASS','EXPECTED_CANCELLATION']) {
    const f=await fixture(t);f.row.status=status;await persistBoth(f);
    await f.root.getDirectoryHandle('other-live-job',{create:true});
    assert.equal(await f.registry.removeAfterVerifiedCleanup(),true);
    assert.deepEqual(await readdir(f.path),['other-live-job']);assert.equal(f.locks.held.size,0);
    assert.equal(f.row.registry.status,'REMOVED');assert.ok(f.row.indexOwnership.every(r=>r.removed));
  }
});
test('unknown budget, cleanup error, existing index, and active lease each retain both tickets',async t=>{
  for(const kind of ['budget','cleanup','directory','lease']) {
    const f=await fixture(t);await persistBoth(f);
    if(kind==='budget')f.row.metrics={};
    if(kind==='cleanup')f.row.cleanupError={message:'dispose failed'};
    if(kind==='directory')await f.root.getDirectoryHandle('trial-in',{create:true});
    if(kind==='lease')f.locks.held.set('vr180:index-job:trial-in',{name:'vr180:index-job:trial-in'});
    assert.equal(await f.registry.removeAfterVerifiedCleanup(),false);
    assert.equal(f.row.registry.status,'RETAINED');assert.equal(f.calls.remove.length,0);
    assert.equal((await readdir(join(f.path,'registry-trial'))).length,2);
  }
});
test('lease acquisition, not an empty query snapshot, authorizes ticket removal',async t=>{
  const f=await fixture(t);await persistBoth(f);
  f.locks.held.set('vr180:index-job:trial-out',{name:'vr180:index-job:trial-out'});
  f.locks.query=async()=>({held:[],pending:[]});
  assert.equal(await f.registry.removeAfterVerifiedCleanup(),false);
  assert.match(f.row.registry.error.message,/REGISTRY_OUTPUT_LEASE_BUSY/);
  assert.equal(f.calls.remove.length,0);assert.equal(f.locks.held.size,1);
});
test('zero write, zero read, flush rejection, and close rejection never acknowledge persistence',async t=>{
  for(const kind of ['write','read','flush','close']) {
    let closeAttempts=0;
    const hooks=kind==='write'?{write:()=>0}:kind==='read'?{read:()=>0}:
      kind==='flush'?{flush:()=>{throw Error('FLUSH_FAILED');}}:
      {close:()=>{if(++closeAttempts===1)throw Error('CLOSE_FAILED');}};
    const f=await fixture(t,hooks);await assert.rejects(f.registry.persist(ticket('input')));
    assert.equal(f.row.indexOwnership[0].status,'FAILED');assert.equal(f.open.size,0);
    assert.equal(await f.registry.removeAfterVerifiedCleanup(),false);assert.equal(f.calls.remove.length,0);
  }
});
test('changed second record prevents deletion of either record',async t=>{
  const f=await fixture(t);await persistBoth(f);
  const path=join(f.path,'registry-trial','output.json');const raw=await readFile(path,'utf8');
  await writeFile(path,raw.replace('2'.repeat(32),'3'.repeat(32)));
  assert.equal(await f.registry.removeAfterVerifiedCleanup(),false);
  assert.match(f.row.registry.error.message,/REGISTRY_REMOVAL_CONTENT_MISMATCH/);assert.equal(f.calls.remove.length,0);
});
test('unexpected registry entry is preserved and prevents successful namespace removal',async t=>{
  const f=await fixture(t);await persistBoth(f);await writeFile(join(f.path,'registry-trial','unknown.bin'),'keep');
  assert.equal(await f.registry.removeAfterVerifiedCleanup(),false);assert.equal(f.row.registry.status,'RETAINED');
  assert.equal(await readFile(join(f.path,'registry-trial','unknown.bin'),'utf8'),'keep');
  assert.equal(f.calls.remove.length,0);
});
test('Worker uses hook completion before conversion continues, including cancel; Page deletes known files only',async t=>{
  const path=await mkdtemp(join(tmpdir(),'vr180-registry-worker-'));t.after(()=>rm(path,{recursive:true,force:true}));
  const backend=nodeRoot(path),locks=testLocks();locks.query=async()=>({held:[...locks.held.values()],pending:[]});
  const messages=[],namespace='native-trial';let acknowledged=0;
  const sha256Blob=async blob=>Buffer.from(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex');
  const context=vm.createContext({crypto,TextEncoder,TextDecoder,Uint8Array,performance,AbortController,Error,
    isSecureContext:true,navigator:{locks,storage:{getDirectory:async()=>backend.root}},fork:{},sha256Blob,
    // Browser File structured-cloning is exercised by the native run; the Node
    // file adapter cannot clone openAsBlob, so retain JSON message facts here.
    fetch:async()=>new Response(new Blob(['input'])),self:{addEventListener(){},postMessage:m=>messages.push(JSON.parse(JSON.stringify(m)))},
    convertStereo:async(file,settings,options)=>{
      for(const kind of ['input','output']) {
        const item=ticket(kind,options.jobId);await options.onIndexOwnership(item);
        const raw=await readFile(join(path,namespace,'registry-'+options.jobId,kind+'.json'),'utf8');
        assert.deepEqual(JSON.parse(raw),item);assert.equal(backend.open.size,0);acknowledged++;
      }
      const tx={status:{state:'open',committed:false}};options.onOutputCreated(tx);options.onCleanup(async()=>{});
      const metrics={indexReservedAfterCleanup:0};options.onMetrics(metrics);options.onProgress({videoFrames:10});
      if(options.signal.aborted){tx.status={state:'aborted',committed:false};const error=Error('cancel');error.name='AbortError';throw error;}
      const access=await options.outputHandle.createSyncAccessHandle();access.write(new Uint8Array([1,2,3]),{at:0});access.flush();access.close();
      const saved=await options.outputHandle.getFile();tx.status={state:'committed',committed:true};
      return {saved:{committed:true,bytes:saved.size,sha256:await sha256Blob(saved)},verification:{metadataHashMatched:true},metrics,savedInfo:{}};
    },URL:{revokeObjectURL(){}},
  });
  vm.runInContext(source.WORKER.replace(/^import .*;\n/gm,''),context);
  const cases=[{name:'success',source:'test',settings:{}},{name:'cancel',source:'test',settings:{},expectCancel:true}];
  await context.self.onmessage({data:{namespace,cases}});
  const result=messages.find(m=>m.result).result;
  assert.equal(result.status,'READY_FOR_DOWNLOAD');assert.deepEqual(result.cases.map(r=>r.status),['PASS','EXPECTED_CANCELLATION']);
  assert.equal(acknowledged,4);assert.equal(messages.filter(m=>m.ownershipRecord).length,4);
  assert.ok(result.cases.every(r=>r.registry.removed&&r.indexDirectoriesRemoved&&r.heldJobLocks===0&&r.indexReservedAfterCleanup===0));
  context.__indexedProbe={namespace,worker:{terminate(){}},urls:[],record:result,expectedCases:2,ownershipRecords:[]};
  await writeFile(join(path,namespace,'unknown.bin'),'preserve');
  let cleanup=await vm.runInContext('('+source.CLEANUP+')()',context);
  assert.equal(cleanup.status,'RETAINED');assert.equal(cleanup.reason,'UNKNOWN_NAMESPACE_ENTRY');
  assert.equal(await readFile(join(path,namespace,'success.mp4')).then(b=>b.length),3);
  await rm(join(path,namespace,'unknown.bin'));
  cleanup=await vm.runInContext('('+source.CLEANUP+')()',context);assert.equal(cleanup.status,'REMOVED');
  assert.deepEqual(await readdir(path),[]);
});
test('Page failure cleanup retains unknown namespace and recovered tickets',async t=>{
  const f=await fixture(t);await persistBoth(f);
  f.context.URL={revokeObjectURL(){}};
  f.context.__indexedProbe={namespace:'test',worker:{terminate(){}},urls:[],record:{status:'FAIL',cases:[]},expectedCases:1,
    ownershipRecords:[{ticket:ticket('input')}]};
  const cleanup=await vm.runInContext('('+source.CLEANUP+')()',f.context);
  assert.equal(cleanup.status,'RETAINED');assert.equal(cleanup.ownershipRecords.length,1);assert.equal(f.calls.remove.length,0);
  assert.match(cleanup.scope,/until that context is closed/);
});

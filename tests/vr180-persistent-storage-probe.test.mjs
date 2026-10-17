// Actual probe Worker code, using temporary-file adapters. Not native OPFS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, rm, readdir, open, rename, readFile, writeFile, stat} from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {Sha256} from '../docs/shared/vr180/sha256.mjs';

const data=JSON.parse(execFileSync('python',['-c',`import importlib.util,json
s=importlib.util.spec_from_file_location('probe','tools/vr180/probe-persistent-storage.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
print(json.dumps({'worker':m.WORKER,'expected':m.expected_witness()}))`],{encoding:'utf8'}));
const namespace='vr180-persist-'+'1'.repeat(32);
async function fixture(t, fail={}) {
 const path=await mkdtemp(join(tmpdir(),'vr180-persist-worker-'));t.after(()=>rm(path,{recursive:true,force:true}));
 let writes=0,closed=0,aborted=0;const removed=[];
 const missing=()=>new DOMException('missing','NotFoundError');
 const directory=current=>({
  async getDirectoryHandle(name,{create=false}={}) {
   const target=join(current,name);try{await stat(target);}catch(e){if(e.code!=='ENOENT')throw e;if(!create)throw missing();await mkdir(target);}
   return directory(target);
  },
  async getFileHandle(name,{create=false}={}) {
   const target=join(current,name);try{await stat(target);}catch(e){if(e.code!=='ENOENT')throw e;if(!create)throw missing();await writeFile(target,'');}
   return {getFile:()=>openAsBlob(target),async createWritable(){
    const stage=target+'.stage',handle=await open(stage,'wx');
    return {async write(bytes){if(++writes===fail.write)throw Error('WRITE_FAILED');
      for(let at=0;at<bytes.length;){const {bytesWritten}=await handle.write(bytes.subarray(at));assert.ok(bytesWritten>0);at+=bytesWritten;}},
     async close(){if(fail.close)throw Error('CLOSE_FAILED');await handle.sync();await handle.close();await rename(stage,target);closed++;},
     async abort(){await handle.close();await rm(stage);aborted++;}};
   }};
  },
  async *entries(){for(const entry of await readdir(current,{withFileTypes:true}))yield [entry.name,{kind:entry.isDirectory()?'directory':'file'}];},
  async removeEntry(name){removed.push(name);await rm(join(current,name),{recursive:false}).catch(async e=>{
   if(e.code==='ERR_FS_EISDIR'){const {rmdir}=await import('node:fs/promises');await rmdir(join(current,name));}else throw e;});},
 });
 const root=directory(path);
 const context=vm.createContext({Sha256,Uint8Array,performance,setTimeout,FileSystemFileHandle:class {createWritable(){}},isSecureContext:true,
  navigator:{storage:{getDirectory:async()=>root,estimate:async()=>({quota:10737418240,usage:0}),persisted:async()=>false},userAgent:'Node test adapter'},
  location:{origin:'http://127.0.0.1:1234'},self:{postMessage(){}}});
 const execute=vm.runInContext(data.worker.replace(/^import .*;\n/gm,'')+'\nexecute',context);
 return {path,execute,removed,stats:()=>({writes,closed,aborted})};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('complete 16 MiB actual file matches Python byte/hash oracle on both full reads',async t=>{
 const f=await fixture(t);const first=plain(await f.execute({action:'write',namespace}));
 assert.equal(first.status,'PASS');assert.equal(first.committed,true);assert.equal(first.writerClosed,true);
 assert.equal(first.writeCalls,16);assert.deepEqual(first.readback,data.expected);assert.equal(first.namespaceRemoved,false);
 assert.equal((await stat(join(f.path,namespace,'witness.bin'))).size,16*1024*1024);
 const second=plain(await f.execute({action:'restart-read-and-cleanup',namespace}));
 assert.equal(second.status,'PASS');assert.deepEqual(second.readback,data.expected);assert.equal(second.namespaceRemoved,true);
 assert.deepEqual(f.stats(),{writes:16,closed:1,aborted:0});assert.deepEqual(await readdir(f.path),[]);
 // Fresh native browser/process/profile reuse remains the separate cloud gate.
});
test('write and close failure never claim commit/readback success',async t=>{
 for(const fail of [{write:2},{close:true}]) {
  const f=await fixture(t,fail);const row=plain(await f.execute({action:'write',namespace}));
  assert.equal(row.status,'FAIL');assert.equal(row.committed,false);assert.equal(row.writerClosed,false);
  assert.equal(row.writerAborted,true);assert.equal(row.readback,undefined);assert.equal(f.removed.length,0);
  assert.equal((await stat(join(f.path,namespace,'witness.bin'))).size,0);
 }
});
test('restart rejects unknown directory entries without deleting witness or unknown file',async t=>{
 const f=await fixture(t);const first=await f.execute({action:'write',namespace});assert.equal(first.status,'PASS');
 await writeFile(join(f.path,namespace,'unknown.bin'),'keep');
 const row=await f.execute({action:'restart-read-and-cleanup',namespace});
 assert.equal(row.status,'FAIL');assert.match(row.error.message,/UNKNOWN_NAMESPACE_ENTRY/);assert.equal(f.removed.length,0);
 assert.equal(await readFile(join(f.path,namespace,'unknown.bin'),'utf8'),'keep');
 assert.equal((await stat(join(f.path,namespace,'witness.bin'))).size,16*1024*1024);
});
test('existing namespace cannot be adopted or overwritten',async t=>{
 const f=await fixture(t);await mkdir(join(f.path,namespace));await writeFile(join(f.path,namespace,'foreign.bin'),'keep');
 const row=await f.execute({action:'write',namespace});assert.equal(row.status,'FAIL');assert.match(row.error.message,/NAMESPACE_EXISTS/);
 assert.deepEqual(f.stats(),{writes:0,closed:0,aborted:0});assert.equal(f.removed.length,0);
});

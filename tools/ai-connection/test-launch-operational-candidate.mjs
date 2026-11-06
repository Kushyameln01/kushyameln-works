import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parseOptions,startOperationalCandidate} from './launch-operational-candidate.mjs';
const exec=promisify(execFile);

async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'operational-launch-'));
 try{
  await mkdir(join(root,'docs/ai-connection/modules'),{recursive:true});
  await writeFile(join(root,'docs/ai-connection/modules/index.html'),'<!doctype html><title>Local UI</title>');
  await writeFile(join(root,'docs/worker.mjs'),'export const actualSource=true;');
  await writeFile(join(root,'docs/alternate.html'),'<!doctype html><title>Alternate committed page</title>');
  await mkdir(join(root,'alternate-docs/ai-connection/modules'),{recursive:true});
  await writeFile(join(root,'alternate-docs/ai-connection/modules/index.html'),'<!doctype html><title>Alternate docs tree</title>');
  await writeFile(join(root,'docs/native.wasm'),new Uint8Array([0,97,115,109]));
  await writeFile(join(root,'private.safetensors'),'private model bytes');
  await symlink(join(root,'private.safetensors'),join(root,'docs/private.safetensors'));
  await exec('git',['init','-q',root]);await exec('git',['-C',root,'add','docs','alternate-docs']);
  await exec('git',['-C',root,'-c','user.name=Launcher Test','-c','user.email=launcher@example.invalid','commit','-qm','fixture']);
  const head=(await exec('git',['-C',root,'rev-parse','HEAD'])).stdout.trim();
  await fn(root,head);
 }finally{await rm(root,{recursive:true,force:true});}
}

test('default launcher serves docs modules and WASM without COI or private paths',()=>fixture(async root=>{
 const run=await startOperationalCandidate({root,port:0});
 try{
  assert.equal(run.server.address().address,'127.0.0.1');
  const directory=await fetch(run.origin+'/ai-connection/modules',{redirect:'manual'});assert.equal(directory.status,302);assert.equal(directory.headers.get('location'),'/ai-connection/modules/');
  const page=await fetch(run.url);assert.equal(page.status,200);assert.equal(page.headers.get('cross-origin-opener-policy'),null);assert.match(await page.text(),/Local UI/);
  const worker=await fetch(run.origin+'/worker.mjs');assert.match(worker.headers.get('content-type'),/^text\/javascript/);
  const wasm=await fetch(run.origin+'/native.wasm');assert.equal(wasm.headers.get('content-type'),'application/wasm');assert.equal((await wasm.arrayBuffer()).byteLength,4);
  assert.equal((await fetch(run.origin+'/private.safetensors')).status,403);
  assert.equal((await fetch(run.origin+'/workspace/private.safetensors')).status,404);
  assert.equal((await fetch(run.origin+'/worker.mjs',{method:'POST',body:'no writes'})).status,405);
 }finally{await run.close();}
}));

test('COI headers require an explicit option and CLI rejects ambiguous input',()=>fixture(async root=>{
 assert.deepEqual(parseOptions([]),{port:8765,coi:false});assert.throws(()=>parseOptions(['--coi','yes']),/true or.*false/);assert.throws(()=>parseOptions(['--host','0.0.0.0']),/Unknown option/);
 const run=await startOperationalCandidate({root,port:0,coi:true});
 try{const response=await fetch(run.url);assert.equal(response.headers.get('cross-origin-opener-policy'),'same-origin');assert.equal(response.headers.get('cross-origin-embedder-policy'),'require-corp');}
 finally{await run.close();}
}));

test('explicit fixed source requires HEAD and refuses changed or uncommitted served bytes',()=>fixture(async(root,head)=>{
 await assert.rejects(startOperationalCandidate({root,port:0,sourceCommit:'0'.repeat(40)}),{code:'SOURCE_HEAD_MISMATCH'});
 const run=await startOperationalCandidate({root,port:0,sourceCommit:head});
 try{
  assert.equal((await fetch(run.url)).status,200);
  await writeFile(join(root,'docs/worker.mjs'),'changed working source');
  const changed=await fetch(run.origin+'/worker.mjs');assert.equal(changed.status,409);assert.match(await changed.text(),/SOURCE_NOT_FROZEN/);
  await writeFile(join(root,'docs/new.mjs'),'uncommitted source');assert.equal((await fetch(run.origin+'/new.mjs')).status,409);
  await rm(join(root,'docs/ai-connection/modules/index.html'));await symlink(join(root,'docs/alternate.html'),join(root,'docs/ai-connection/modules/index.html'));
  const replaced=await fetch(run.url);assert.equal(replaced.status,409);assert.match(await replaced.text(),/SOURCE_NOT_FROZEN/);
 }finally{await run.close();}
 await rename(join(root,'docs'),join(root,'original-docs'));await symlink(join(root,'alternate-docs'),join(root,'docs'));
 const replacedDocs=await startOperationalCandidate({root,port:0,sourceCommit:head});
 try{assert.equal((await fetch(replacedDocs.url)).status,409);}
 finally{await replacedDocs.close();}
}));

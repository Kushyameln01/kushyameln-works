import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const script=fileURLToPath(new URL('./verify-normal-p4.mjs',import.meta.url));
const run=args=>spawnSync(process.execPath,[script,...args],{encoding:'utf8'});

test('CLI help describes the five required paths without opening sources',()=>{
 const result=run(['--help']);
 assert.equal(result.status,0,result.stderr);
 for(const option of ['--diffusion-root','--acquisition','--tensor','--owner-root','--output'])assert(result.stdout.includes(option));
});

test('missing required CLI paths terminate before source or input access',()=>{
 const result=run([]);
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/Required --diffusion-root/);
});

test('a changed acquired source is rejected before its module can execute',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'verify-normal-p4-'));
 try{
  const relative='docs/shared/diffusion-models/api/index.mjs';
  const source=path.join(directory,relative);
  const bytes=Buffer.from('throw new Error("UNVERIFIED_MODULE_EXECUTED");\n');
  await fs.mkdir(path.dirname(source),{recursive:true});await fs.writeFile(source,bytes);
  const acquisition=path.join(directory,'acquisition.json'),output=path.join(directory,'result.json');
  await fs.writeFile(acquisition,JSON.stringify({fixedDistributionSha:'b6e166478a8e072c9ffd3ce562bfdb0c89634920',files:[{path:relative,bytes:bytes.length,sha256:'0'.repeat(64)}]}));
  const result=run(['--diffusion-root',directory,'--acquisition',acquisition,'--tensor',path.join(directory,'absent.wktensor'),'--owner-root',directory,'--output',output]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Source SHA-256 mismatch/);
  assert.doesNotMatch(result.stderr,/Error: UNVERIFIED_MODULE_EXECUTED/);
  await assert.rejects(fs.access(output),{code:'ENOENT'});
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('an omitted relative module cannot escape acquisition verification',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'verify-normal-p4-closure-'));
 try{
  const sources={
   'docs/shared/diffusion-models/api/index.mjs':'export {value} from "./unverified.mjs";\n',
   'docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs':'export {};\n',
   'docs/shared/diffusion-models/execution/capabilities.mjs':'export {};\n'
  },files=[];
  for(const [relative,source] of Object.entries(sources)){
   const target=path.join(directory,relative),bytes=Buffer.from(source);
   await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
   files.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const acquisition=path.join(directory,'acquisition.json');
  await fs.writeFile(acquisition,JSON.stringify({fixedDistributionSha:'b6e166478a8e072c9ffd3ce562bfdb0c89634920',files}));
  const result=run(['--diffusion-root',directory,'--acquisition',acquisition,'--tensor',path.join(directory,'absent.wktensor'),'--owner-root',directory,'--output',path.join(directory,'result.json')]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Imported dependency absent from acquisition/);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm,symlink,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const exporter=new URL('./export-e1-base-block.mjs',import.meta.url);
assert.ok(existsSync(exporter),'Bounded real-base exporter implementation missing');
const {exportE1BaseBlock}=await import('./export-e1-base-block.mjs');
const repo=resolve(new URL('../..',import.meta.url).pathname),models=process.env.BERNINI_MODELS_DIR??'/workspace/work/retained/bernini';
test('exporter rejects relative, repository and symlink-to-repository output before model reads',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'e1-export-test-'));
 try{
  await symlink(repo,join(temp,'repo'),'dir');
  await mkdir(join(temp,'foreign-repository/.git'),{recursive:true});
  await writeFile(join(temp,'foreign-repository/.git/HEAD'),'ref: refs/heads/main\n');
  for(const output of ['relative-private.json',join(repo,'development/ai-connection/forbidden-base.json'),join(temp,'repo/forbidden-base.json'),join(temp,'foreign-repository/forbidden-base.json')]){
   await assert.rejects(()=>exportE1BaseBlock({output,models:'/not-a-model-folder'}),/absolute|repository|private|repo/i);
  }
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('exporter never overwrites an existing private artifact',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'e1-export-test-')),output=join(temp,'keep.json');
 try{await writeFile(output,'existing');await assert.rejects(()=>exportE1BaseBlock({output,models:'/not-a-model-folder'}),/existing|overwrite/i);assert.equal(await readFile(output,'utf8'),'existing');}
 finally{await rm(temp,{recursive:true,force:true});}
});
test('actual original bases export only five bounded ranges with explicit prior-owner provenance', {skip:!existsSync(join(models,'manifest.json'))},async()=>{
 const temp=await mkdtemp(join(tmpdir(),'e1-export-test-')),output=join(temp,'base.json');
 try{
  const receipt=await exportE1BaseBlock({output,models});const bytes=await readFile(output);assert.ok(bytes.length<1048576);
  const artifact=JSON.parse(bytes);assert.equal(artifact.schemaVersion,'bernini-diagnostic-base-block/0.1');assert.equal(artifact.scope,'PARTIAL');assert.equal(artifact.fullFileHashRecomputed,false);
  for(const side of ['HIGH','LOW']){const b=artifact.sides[side];assert.equal(b.source.priorOwnerReceipt.verification,'PRIOR_OWNER_RECEIPT_NOT_REHASHED');assert.equal(b.registry.baseVerification.fullFileSHA256Verified,false);assert.equal(b.source.fileBytes,15574833216);assert.deepEqual(b.ranges.map(r=>[r.id,r.byteLength]),[['header',181280],['q.weight',81920],['q.bias',32],['weight_scale',4],['comfy_quant',27]]);for(const r of b.ranges)assert.equal(Buffer.from(r.data,'base64').length,r.byteLength);}
  assert.equal(receipt.fullFileHashRecomputed,false);assert.ok(receipt.maximumReadBytes<=181280);assert.ok(receipt.actualSourceReadBytes<1048576);
 }finally{await rm(temp,{recursive:true,force:true});}
});

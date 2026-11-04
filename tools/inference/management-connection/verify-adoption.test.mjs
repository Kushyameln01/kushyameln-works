import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,rm,symlink,unlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSync} from '../../../docs/shared/ft/vendor/fflate.mjs';
import {acquireConnectionSources} from './source.mjs';
import {verifyAdoption} from './verify-adoption.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const OLD_MANIFEST=resolve(ROOT,'development/inference/codec-marker-handoff/manifests/text/manifest.json');
const MEAN_PATH=resolve(ROOT,'development/inference/p2-p3-acceptance/p2/updated-884/decode/mean/normalized-mean/native.wktensor');
const actualBundle=process.env.KW_ADOPTION_TEST_BUNDLE,actualSource=process.env.KW_ADOPTION_TEST_SOURCE;
let temporary,baseline,serial=0;
before(async()=>{temporary=await mkdtemp(resolve(tmpdir(),'kw-adoption-source-tests-'));baseline=(await acquireConnectionSources({repositoryRoot:ROOT,outputRoot:resolve(temporary,'base')})).management.root;});
after(async()=>{if(temporary)await rm(temporary,{recursive:true,force:true});});

async function fixture(mutate){
 const root=resolve(temporary,'case-'+serial++);await cp(baseline,root,{recursive:true});
 const path=resolve(root,'ACQUISITION.json'),receipt=JSON.parse(await readFile(path,'utf8'));
 await mutate(receipt,root);await writeFile(path,JSON.stringify(receipt));return root;
}
async function rejectsBeforeSelection(root,code){
 const output=resolve(temporary,'out-'+serial++);globalThis.__unverifiedManagementImport=false;
 await assert.rejects(verifyAdoption({managementRoot:root,textBundle:'unused',textSource:'unused',manifest:OLD_MANIFEST,output}),error=>error.code===code);
 const receipt=JSON.parse(await readFile(resolve(output,'receipt.json'),'utf8'));
 assert.equal(receipt.error.code,code);assert.equal(receipt.codec,undefined);assert.equal(receipt.selection,undefined);
 assert.equal(receipt.neuralCalls,0);assert.equal(receipt.forbiddenRunCalls,0);assert.equal(globalThis.__unverifiedManagementImport,false);
}

test('empty acquisition cannot authorize management imports',async()=>{
 await rejectsBeforeSelection(await fixture(r=>{r.files=[];}),'MANAGEMENT_SOURCE_CLOSURE_INCOMPLETE');
});
test('omitted import root cannot execute its modified unlisted module',async()=>{
 const root=await fixture(async(r,p)=>{const path=r.roots[0];r.files=r.files.filter(f=>f.path!==path);await writeFile(resolve(p,path),(await readFile(resolve(p,path),'utf8'))+'\nglobalThis.__unverifiedManagementImport=true;\n');});
 await rejectsBeforeSelection(root,'MANAGEMENT_SOURCE_CLOSURE_INCOMPLETE');
});
test('omitted transitive dependency cannot authorize management imports',async()=>{
 await rejectsBeforeSelection(await fixture(r=>{const dependency=r.files.find(f=>!r.roots.includes(f.path));assert(dependency);r.files=r.files.filter(f=>f.path!==dependency.path);}),'MANAGEMENT_SOURCE_CLOSURE_INCOMPLETE');
});
test('modified actual listed source fails before module import',async()=>{
 const root=await fixture(async(r,p)=>{const path=r.roots[0];await writeFile(resolve(p,path),(await readFile(resolve(p,path),'utf8'))+'\nglobalThis.__unverifiedManagementImport=true;\n');});
 await rejectsBeforeSelection(root,'MANAGEMENT_SOURCE_BYTES_MISMATCH');
});
test('duplicate acquisition source paths are rejected',async()=>{
 await rejectsBeforeSelection(await fixture(r=>{r.files.push({...r.files[0]});}),'MANAGEMENT_SOURCE_DUPLICATE_PATH');
});
test('noncanonical acquisition source paths are rejected',async()=>{
 await rejectsBeforeSelection(await fixture(r=>{r.files[0].path=r.files[0].path.replace('/adapters/','/adapters/../adapters/');}),'MANAGEMENT_SOURCE_UNSAFE_PATH');
});
test('source symlinks cannot redirect the effective relative import base',async()=>{
 const root=await fixture(async(r,p)=>{const local=resolve(p,r.roots[0]),target=resolve(temporary,'redirected-'+serial++ +'.mjs');await writeFile(target,await readFile(local));await unlink(local);await symlink(target,local);});
 await rejectsBeforeSelection(root,'MANAGEMENT_SOURCE_UNSAFE_PATH');
});
test('complete exact acquisition passes the source gate and reaches selection validation',async()=>{
 const output=resolve(temporary,'out-'+serial++);
 await assert.rejects(verifyAdoption({managementRoot:baseline,textBundle:'unused',textSource:'unused',manifest:OLD_MANIFEST,output}),/Selected Text manifest must be exact420e bytes/);
 const receipt=JSON.parse(await readFile(resolve(output,'receipt.json'),'utf8'));assert.equal(receipt.sources.management.length,15);assert.equal(receipt.forbiddenRunCalls,0);
});
test('explicit normalized mean selection retains caller provenance rather than public P2 attribution',{skip:!actualBundle||!actualSource?'Set KW_ADOPTION_TEST_BUNDLE and KW_ADOPTION_TEST_SOURCE for the actual-file storage integration case':false},async()=>{
 const output=resolve(temporary,'override-'+serial++);
 const receipt=await verifyAdoption({managementRoot:baseline,textBundle:actualBundle,textSource:actualSource,normalizedMean:MEAN_PATH,output});
 const entries=unzipSync(new Uint8Array(await readFile(resolve(output,'normalized-mean.management.zip'))));
 const manifest=JSON.parse(new TextDecoder().decode(entries['manifest.json']));
 const source=manifest.extensions['works:management-workspace'].data.artifactRefs[0].sourceRecords[0];
 assert.match(source.scope,/Caller-selected saved normalized mean/);assert.doesNotMatch(source.scope,/Existing public P2/);assert.equal(receipt.forbiddenRunCalls,0);assert.equal(receipt.originalSourceAfterClose.closed,true);
});

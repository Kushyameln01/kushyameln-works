// Authored before removal of public preprocessing. Static checks do not execute product code.
// Runtime checks require an independently hash-verified, deployed Pages acquisition.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';

const mode=process.argv[2]??'static';
assert.ok(['static','runtime'].includes(mode),'Use static or runtime');
const repo=resolve(new URL('../..',import.meta.url).pathname);
const root=resolve(process.env.BASELINE_PAGES_ROOT??repo+'/docs');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function list(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())result.push(...await list(p));else{assert.ok(e.isFile(),'No symlinks or special files');result.push(relative(root,p));}}return result.sort();}
const files=await list(root);
for(const path of files)assert.ok(!/^(shared\/media\/|media-lab\/|paper-lab\/)/.test(path),'Retired public path: '+path);
for(const name of ['shared/compute/registered-tasks.mjs','shared/compute/pool-worker.bundle.mjs']){
  const source=await readFile(root+'/'+name,'utf8');
  assert.doesNotMatch(source,/media-lbp|media-align|media-paper|shared\/media\/|\.\.\/media\//,name+' includes preprocessing');
}
const allowed=JSON.parse(await readFile(repo+'/security/public-files.json','utf8')).files.slice().sort();
assert.deepEqual(files,allowed,'Exact public inventory');
for(const path of ['shared/media-basic/sdk.mjs','media-runner/app.mjs','media-runner/index.html'])assert.ok(files.includes(path),path);
const archive=repo+'/development/media-preprocessing';
const provenance=JSON.parse(await readFile(archive+'/snapshot.json','utf8'));
assert.equal(provenance.sourceCommit,'1a3bd7ce3791cdd18a0eda7fd569b46e5cdd2b05');
assert.equal(provenance.executableStandalone,false);
for(const f of provenance.files)assert.equal(digest(await readFile(archive+'/'+f.archivePath)),f.sha256,f.archivePath);
console.log('PASS static publication: retired paths absent, FT registry/bundle clean, exact allowlist, archive hashes');
if(mode==='static')process.exit(0);

assert.ok(process.env.BASELINE_PAGES_ROOT&&process.env.BASELINE_PAGES_RECEIPT,'Runtime requires BASELINE_PAGES_ROOT and BASELINE_PAGES_RECEIPT');
const receipt=JSON.parse(await readFile(process.env.BASELINE_PAGES_RECEIPT,'utf8'));
assert.equal(receipt.status,'verified-deployed-pages-copy');
assert.match(receipt.sourceCommit,/^[0-9a-f]{40}$/);
assert.deepEqual(Object.keys(receipt.files).sort(),files,'Receipt must include every acquired public file');
for(const file of files)assert.equal(digest(await readFile(root+'/'+file)),receipt.files[file],file+' differs from acquisition');

// This adapter executes the unchanged acquired browser Worker. All network requests are
// intercepted and constrained to the two independently acquired WASM assets.
const adapter=`
const {parentPort,workerData}=require('node:worker_threads');
const {readFile}=require('node:fs/promises');
globalThis.crypto=require('node:crypto').webcrypto;
let fetches=[];
globalThis.self={postMessage:m=>parentPort.postMessage({kind:'product',message:m,fetches:fetches.slice()})};
globalThis.fetch=async(url,options)=>{
 const target=String(url);if(!workerData.allowed.includes(target)||options?.credentials!=='omit')throw Error('Unexpected product fetch '+target);
 fetches.push(target);return new Response(await readFile(new URL(target)),{headers:{'content-type':'application/wasm'}});
};
import(workerData.module).then(()=>{parentPort.on('message',data=>self.onmessage?.({data}));parentPort.postMessage({kind:'ready'});}).catch(e=>{throw e});
`;
const base=pathToFileURL(root+'/');
const allowedFetch=['shared/ft/kernel/ft-kernel.wasm','shared/unity-analysis/kernel/unity-analysis.wasm'].map(p=>new URL(p,base).href);
const {BUILD_ID}=await import(new URL('shared/compute/protocol.mjs',base));
const {UNITY_KERNEL}=await import(new URL('shared/unity-analysis/kernel/registry.mjs',base));
assert.equal(BUILD_ID,'compute-unity-b4');
const identity=(taskType,payload,extra={})=>({protocolVersion:1,buildId:BUILD_ID,taskType,taskVersion:1,jobId:'publication-'+taskType,inputRevision:23,generation:5,payload,...extra});
async function run(module,request){
 const worker=new Worker(adapter,{eval:true,workerData:{module:new URL(module,base).href,allowed:allowedFetch}});
 try{return await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Worker timeout')),15000);
  worker.once('error',e=>{clearTimeout(timer);reject(e)});
  worker.on('message',packet=>{
   if(packet.kind==='ready'){worker.postMessage(request);return;}
   if(['result','error'].includes(packet.message?.type)){clearTimeout(timer);resolve(packet);}
  });
 });}finally{await worker.terminate();}
}
const fixture=JSON.parse(await readFile(repo+'/tools/unity-analysis/fixtures/minimum.json','utf8'));
const yaml=new TextEncoder().encode('%YAML 1.1\n--- !u!1 &1\nGameObject:\n  m_Name: Baseline preserved\n');
for(const module of ['shared/compute/pool-worker.mjs','shared/compute/pool-worker.bundle.mjs']){
 for(const type of ['media-lbp-tile','media-lbp-chunk','media-align','media-paper-fit','media-paper-infer']){
  const r=await run(module,identity(type,{}, {wasmVariant:'scalar',kernelHash:'0'.repeat(64)}));
  assert.equal(r.message.type,'error',type);assert.match(r.message.message,/対応していないprotocol・task・versionです/,'Reject the task type, not merely its payload');
  assert.equal(r.fetches.length,0,'Reject before loading a kernel');
 }
 for(const masks of [[0,3,5],[]]){
  const {message:r,fetches}=await run(module,identity('ft-magnitude-batch',{masks,weights:[1,2,4]}));
  assert.equal(r.type,'result',r.message);assert.deepEqual(r.result,masks);assert.deepEqual(fetches,[allowedFetch[0]]);
  assert.equal(r.inputRevision,23);assert.equal(r.generation,5);
 }
 const analyze=await run(module,identity('unity-analyze',fixture.before,{wasmVariant:'scalar',kernelHash:UNITY_KERNEL.sha256}));
 assert.equal(analyze.message.type,'result',analyze.message.message);
 assert.equal(analyze.message.result.kind,'unity-analysis');assert.equal(analyze.message.inputRevision,23);
 assert.equal(analyze.message.result.references.filter(r=>r.state==='resolved').length,2);
 assert.ok(analyze.message.result.shared.some(r=>r.fileId==='9223372036854775807'&&r.incoming===2));
 assert.equal(analyze.message.result.completeness.truncated,false);assert.deepEqual(analyze.fetches,[allowedFetch[1]]);
 const diff=await run(module,identity('unity-diff',fixture,{wasmVariant:'scalar',kernelHash:UNITY_KERNEL.sha256}));
 assert.equal(diff.message.type,'result',diff.message.message);
 assert.ok(diff.message.result.changes.some(c=>c.property==='/m_Name'&&c.before==='Idle'&&c.after==='Idle revised'));
 for(const taskType of ['unity-expand','unity-parse']){
  const r=await run(module,identity(taskType,{path:'Assets/Example.asset',bytes:yaml},{wasmVariant:'javascript',kernelHash:null}));
  assert.equal(r.message.type,'result',r.message.message);assert.equal(r.message.inputRevision,23);assert.equal(r.fetches.length,0);
  assert.equal(r.message.metrics.wasmVariant,'javascript');assert.equal(r.message.metrics.memoryBytes,null);
  if(taskType==='unity-expand')assert.deepEqual(r.message.result.files,[{path:'Assets/Example.asset',bytes:yaml}]);
  else{assert.equal(r.message.result.file.contentHash,digest(yaml));assert.equal(r.message.result.file.objects[0].properties.m_Name,'Baseline preserved');}
 }
 const batchFiles=['Assets/First.asset','Assets/Second.asset'].map(path=>({path,bytes:yaml}));
 const batch=await run(module,identity('unity-parse-batch',{files:batchFiles},{wasmVariant:'javascript',kernelHash:null}));
 assert.equal(batch.message.type,'result',batch.message.message);assert.equal(batch.message.inputRevision,23);assert.equal(batch.fetches.length,0);
 assert.equal(batch.message.result.kind,'unity-parsed-batch');assert.deepEqual(batch.message.result.files.map(f=>f.path),batchFiles.map(f=>f.path));
 for(const file of batch.message.result.files){assert.equal(file.contentHash,digest(yaml));assert.equal(file.objects[0].properties.m_Name,'Baseline preserved');}
 assert.equal(batch.message.metrics.memoryBytes,null);
 console.log('PASS deployed '+module+': 5 retired task rejections, FT zero/empty, Unity analyze/diff/expand/parse/parse-batch, identity and fetch constraints');
}

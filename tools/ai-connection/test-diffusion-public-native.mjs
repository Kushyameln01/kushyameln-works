import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const n=await import('../../docs/shared/ai-connection/adapters/diffusion-public/native.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
test('latest fixed public factory exposes model and completed-weight operations within their scoped acceptance',async()=>{assert.equal(typeof n.createDiffusionModels,'function');const api=n.createDiffusionModels({sessionId:'native-source-check'});try{const r=await api.request({protocolVersion:n.PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'caps',inputRevision:0,op:'capabilities',input:{}});assert.equal(r.status,'ok');assert.equal(r.buildId,n.BUILD_ID);assert.equal(r.result.modelInference,false);assert.deepEqual(r.result.modelRuntime.operationsImplemented,['load','predict','sample','unload','modelStatus','saveTensor','readTensor','openWeightFeed']);assert.match(r.result.modelRuntime.weightFeed,/explicit duplex MessagePort/);assert.equal(r.result.modelRuntime.generationReady,false);assert.equal(r.result.modelRuntime.originalWorkflowAccepted,false);}finally{api.dispose();}});
test('the adoption exposes the complete real owner namespace including explicit port and client factories',async()=>{
 const api=await import(new URL('docs/shared/diffusion-models/api/index.mjs',n.DIFFUSION_PUBLIC_ROOT_URL));
 assert.equal(n.default,api);assert.equal(n.diffusionPublicApi,api);
 assert.deepEqual(Object.keys(api),['BUILD_ID','MAX_TENSOR_ELEMENTS','PROTOCOL_VERSION','WEIGHT_PORT_PROTOCOL','attachDiffusionPort','checkExecutionSupport','createBerniniP4Execution','createDiffusionModels','createDiffusionWeightClient','describeExecutionCapabilities']);
 for(const name of Object.keys(api))assert.equal(n[name],api[name],name);
 assert.equal(n.WEIGHT_PORT_PROTOCOL,'diffusion-weight-port/1');
});
test('the latest source proof covers every owner build source and relative runtime dependency',async()=>{
 const proof=await n.verifyDiffusionPublicSources(),adoption=n.inspectDiffusionPublicAdoption();
 assert.equal(proof.sourceRef.commit,'b6e166478a8e072c9ffd3ce562bfdb0c89634920');
 assert.equal(proof.sourceRef.sha256,'39a6c77c9d0366072f03f53b2fdaa185802388fcd54232db0ee34c56a2b6c4b7');
 assert.equal(proof.sourceDigest,'e5ba40ce01bd04e4a432846afb737a9d8c37c56450df68af51460d9140c3e4c6');
 const build=await import(new URL('docs/shared/diffusion-models/api/build-info.mjs',n.DIFFUSION_PUBLIC_ROOT_URL));
 const files=new Map(proof.files.map(file=>[file.path,file]));
 assert.equal(Object.keys(build.BUILD_SOURCES).length,153);assert.equal(adoption.ownerBuildSourceCount,153);
 assert.equal(proof.files.filter(file=>file.ownerBuildInventory).length,153);
 assert.equal(createHash('sha256').update(JSON.stringify(build.BUILD_SOURCES)).digest('hex'),proof.sourceDigest);
 assert.equal(build.BUILD_ID,proof.buildId);assert.equal(proof.buildId,n.BUILD_ID);
 for(const [path,hash] of Object.entries(build.BUILD_SOURCES)){
  const url=new URL(path,new URL('docs/shared/diffusion-models/api/',n.DIFFUSION_PUBLIC_ROOT_URL));
  assert.equal(files.get(url.href.slice(n.DIFFUSION_PUBLIC_ROOT_URL.href.length))?.sha256,hash,path);
 }
 for(const file of proof.files.filter(file=>/\.(mjs|js)$/.test(file.path))){
  const source=await readFile(new URL(file.path,n.DIFFUSION_PUBLIC_ROOT_URL),'utf8');
  for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\bnew\s+URL\s*\(\s*)['"](\.[^'"]+)['"]/g)){
   const target=new URL(match[1],new URL(file.path,n.DIFFUSION_PUBLIC_ROOT_URL));
   assert.ok(files.has(target.href.slice(n.DIFFUSION_PUBLIC_ROOT_URL.href.length)),file.path+' -> '+match[1]);
  }
 }
 for(const path of ['docs/shared/diffusion-models/api/weight-port.mjs','docs/shared/diffusion-models/execution/model-weight-feed.mjs','docs/shared/diffusion-models/execution/model-weight-bindings.mjs','docs/shared/inference/lora/standalone-registry.mjs','docs/shared/inference/lora/bernini-targets.mjs'])assert.ok(files.get(path)?.ownerBuildInventory,path);
 assert.equal(adoption.modelFilesEmbedded,false);assert.equal(adoption.generationReady,false);assert.equal(adoption.originalWorkflowAccepted,false);
 // The historical source is retained as an independent historical adoption.
 const previous=JSON.parse(await readFile(new URL('../../docs/shared/ai-connection/native/diffusion-ffeeeedb/SOURCE.json',import.meta.url),'utf8'));
 assert.equal(previous.sourceCommit,'ffeeeedb6b57d182a977c3ac02c042ce235fc87a');assert.notEqual(previous.buildId,n.BUILD_ID);
});
test('a substituted public source cannot be accepted under the fixed model source pin',async()=>{assert.equal(typeof n.verifyDiffusionPublicSources,'function');await assert.rejects(()=>n.verifyDiffusionPublicSources({read:async file=>{const b=new Uint8Array(await readFile(new URL(file,n.DIFFUSION_PUBLIC_ROOT_URL)));if(file.endsWith('/api/worker.mjs'))b[0]^=1;return b;}}),{code:'DIFFUSION_PUBLIC_SOURCE_MISMATCH'});});
test('substituted new weight-feed dependencies cannot pass the fixed source proof',async()=>{
 await assert.rejects(()=>n.verifyDiffusionPublicSources({read:async file=>{
  const bytes=new Uint8Array(await readFile(new URL(file,n.DIFFUSION_PUBLIC_ROOT_URL)));
  if(file.endsWith('/execution/model-weight-feed.mjs'))bytes[0]^=1;
  return bytes;
 }}),{code:'DIFFUSION_PUBLIC_SOURCE_MISMATCH',fieldPath:'docs/shared/diffusion-models/execution/model-weight-feed.mjs'});
});

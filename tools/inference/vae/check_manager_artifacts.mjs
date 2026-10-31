// Recorded real outputs through the acquired manager's capture/queue/package.
// This check never invokes a native model operation or simulates new inference.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {decodeTensor} from '../../../docs/shared/inference/tensor.mjs';

const {values} = parseArgs({options:{'manager-root':{type:'string'},output:{type:'string'}}});
assert.ok(values['manager-root'] && values.output, '--manager-root and fresh --output required');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const peer = resolve(values['manager-root']), out = resolve(values.output);
const root = join(repo, 'development/inference/e6/current-peers');
const sha = b => createHash('sha256').update(b).digest('hex');
const read = async p => new Uint8Array(await readFile(p));
const importPeer = p => import(pathToFileURL(join(peer, 'docs/shared/ai-connection', p)).href);
const checksBytes = await read(join(root, 'manager-source-checks.json'));
assert.equal(sha(checksBytes), '1b5b9667af9d86bcdae18c55ccddee7cb44bded9e86ec8a536d60b5cf49629f3');
const checks = JSON.parse(new TextDecoder().decode(checksBytes));
assert.equal(checks.commit, 'a26879057d169cb2eecff30503d64adba5057c52');
for (const record of checks.records) {
  const b = await read(join(peer, record.path));
  assert.equal(b.length, record.bytes, record.path);
  assert.equal(sha(b), record.sha256, record.path);
}
assert.equal(sha(await read(join(repo, 'docs/shared/inference/tensor.mjs'))),
  '4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b');
const {captureNativeTensor, restoreNativeTensor, releaseArtifactHandle, createOwnedArtifactStore} = await importPeer('adapters/artifacts.mjs');
const {createInvocationQueue} = await importPeer('queue.mjs');
const {writeArtifactPackage, readArtifactPackage, PACKAGE_VERSION} = await importPeer('package.mjs');
const {canonicalBytes} = await importPeer('canonical.mjs');
const reportBytes = await read(join(root, 'joint64-acceptance-results.json'));
assert.equal(sha(reportBytes), '844f702dcacc3faa3c5bbbdb6c065a4d43b8729364b0c67c1a8448f943a22a26');
const original = JSON.parse(new TextDecoder().decode(reportBytes));
assert.equal(original.passed, true);
assert.equal(original.evidence.normalizationApplied, false);
const originalFiles = [
  ['source/joint64-acceptance-results.json', reportBytes],
  ['source/diffusion-438-f1-results.json', await read(join(root, 'diffusion-438-f1-results.json'))],
  ['source/f1-manifest.json', await read(join(repo, 'development/inference/vae-v1/fixtures/bundle-manifest.json'))],
];
assert.equal(sha(originalFiles[1][1]), '3bc208bef8771c8928c885f1b99384e200b7896f25f90ac02db13550ce0afd06');
assert.equal(sha(originalFiles[2][1]), original.manifestSha256);
const sourceRef = {repository:'https://github.com/Kushyameln01/kushyameln-works',
  commit:'54bfeadbd83f1fea074c503c0e05ec478aba5cfb',path:'docs/shared/inference/tensor.mjs'};
const codec = {codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef};
// Local diagnostic registry, not a claim of adoption by the product registry.
const registry = {schemas:[
  {schemaId:'diagnostic:g1c-native',schemaVersion:'1',g1cMetadata:true},
  {schemaId:'diagnostic:raw-mean',schemaVersion:'1',nativeMeanings:['raw-posterior-mean']},
  {schemaId:'diagnostic:raw-rgb',schemaVersion:'1',nativeMeanings:['raw-decoder-rgb']},
],roles:[],codecs:[{...codec,decode:decodeTensor}]};
const assets = new Map(originalFiles);
const manifest = {packageVersion:PACKAGE_VERSION,packageId:'diagnostic:recorded-joint64',
  payloadBindings:[],artifacts:[],files:originalFiles.map(([path])=>({path,kind:'attachment',required:true})),extensions:{}};
const store = createOwnedArtifactStore(), handles = [], summaries = [];
const eventLog = [], started = performance.now();
let maxRss = process.memoryUsage().rss, active = 0, maxActive = 0;
const queue = createInvocationQueue({resourceBindings:[{
  bindingId:'recorded-artifact-files',ownerId:'diagnostic:file-owner',resourceGeneration:'files-1',
  cancel:async()=>({stopped:false}), // No cancellation exercised or stop guarantee claimed.
  afterTerminal:async()=>({reusable:active===0}),
  release:async target=>{eventLog.push({event:'file-operation-released',requestId:target.requestId});},
}]});
await mkdir(out, {recursive:false});
const bytesOnDisk = {registry,write:async(path,bytes)=>{
  const p=join(out,'package',path);await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes);
}};
const source = {read:async path=>{
  try{return await read(join(out,'package',path));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}};
const variants = [
  {id:'mean64',file:'restored-still64.wktensor',identity:original.input,semantic:'diagnostic:raw-mean'},
  {id:'rgb768',file:'restore64-rgb.wktensor',identity:original.numeric,semantic:'diagnostic:raw-rgb'},
];
try {
  const jobs = variants.map((v,i)=>queue.enqueue({id:`capture-${v.id}`,requestId:`file-${v.id}`,
    ownerId:'diagnostic:file-owner',resourceBinding:'recorded-artifact-files',resourceGeneration:'files-1',revision:1,activeToken:`capture-token-${i}`},async()=>{
    active++;maxActive=Math.max(maxActive,active);eventLog.push({event:'capture-start',artifactId:v.id});
    try {
      const raw=await read(join(root,v.file));assert.equal(sha(raw),v.identity.fileSha256);
      const tensor=await decodeTensor(raw);
      assert.deepEqual(tensor.shape,v.identity.header.shape);
      assert.equal(tensor.meaning,v.identity.header.meaning);
      assert.equal(sha(new Uint8Array(tensor.data.buffer,tensor.data.byteOffset,tensor.data.byteLength)),v.identity.payloadSha256);
      assert.deepEqual(tensor.context,v.identity.header.context);
      const traceId=`recorded:${v.id}`;
      const descriptor={contractVersion:'works-module-contract/1.0-draft.1',artifactId:v.id,kind:'tensor',
        native:{schemaId:'diagnostic:g1c-native',schemaVersion:'1',payloadRef:'pending',metadata:{}},
        semantics:{schemaId:v.semantic,schemaVersion:'1',spaceId:'raw'},
        tensor:{dtype:tensor.dtype,shape:tensor.shape,axes:['N','C','T','H','W'],nativeMeaning:tensor.meaning,dataRef:'pending'},
        provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[traceId]},
        lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:'diagnostic:file-owner',mode:'copy'},extensions:{}};
      const response={tensor,evidence:{historicalExecution:true,sourceReportSha256:sha(reportBytes),
        ...(v.id==='rgb768'?{nativeEvidence:original.evidence}:{sourceOwnerResultsSha256:sha(originalFiles[1][1])})}};
      const handle=captureNativeTensor({tensor,response,descriptor,store,registry});handles.push(handle);
      assert.deepEqual(restoreNativeTensor(handle,store),tensor);
      assert.deepEqual(store.get(handle.responseRef),response);
      // Verify capture owns data and arrays independently of this caller view.
      tensor.data[0]=123; tensor.context.sourceFrameIndices[0]=99;
      assert.deepEqual(restoreNativeTensor(handle,store).context,v.identity.header.context);
      assert.equal(sha(new Uint8Array(restoreNativeTensor(handle,store).data.buffer)),v.identity.payloadSha256);
      const dir=`artifacts/${v.id}`, paths={nativePath:`${dir}/native.wktensor`,descriptorPath:`${dir}/descriptor.json`,
        evidencePath:`${dir}/evidence.json`,tracePath:`${dir}/trace.json`,snapshotPath:`${dir}/snapshot.json`,extensionsPath:`${dir}/extensions.json`};
      manifest.artifacts.push({artifactId:v.id,...paths,codec});
      manifest.payloadBindings.push({ref:handle.descriptor.native.payloadRef,artifactId:v.id,nativePath:paths.nativePath,kind:'decoded-tensor-data'});
      const evidence={schemaVersion:1,artifactId:v.id,records:[{evidenceId:`evidence:${v.id}`,data:{
        scope:'preservation of recorded real outputs; no new inference',...store.get(handle.responseRef).evidence,
        nativeFileSha256:sha(raw),inputArtifactId:'mean64',inputNativeFileSha256:original.input.fileSha256,
        outputArtifactId:'rgb768',outputNativeFileSha256:original.numeric.fileSha256}}]};
      const trace={schemaVersion:1,artifactId:v.id,records:[{traceId,data:{
        scope:'historical execution linkage copied from fixed reports; not current execution',
        inputArtifactId:'mean64',inputNativeFileSha256:original.input.fileSha256,
        outputArtifactId:'rgb768',outputNativeFileSha256:original.numeric.fileSha256,
        sourceReportPath:originalFiles[0][0],sourceReportSha256:sha(reportBytes),
        profileId:original.profileId,modelSha256:original.evidence.modelSha256,normalizationApplied:false}}]};
      for(const [key,kind,value] of [
        ['nativePath','native',raw],['descriptorPath','descriptor',canonicalBytes(handle.descriptor)],
        ['evidencePath','evidence',canonicalBytes(evidence)],['tracePath','trace',canonicalBytes(trace)],
        ['snapshotPath','snapshot',canonicalBytes(null)],['extensionsPath','extensions',canonicalBytes({})],
      ]){assets.set(paths[key],value);manifest.files.push({path:paths[key],kind,required:true});}
      summaries.push({artifactId:v.id,shape:handle.descriptor.tensor.shape,meaning:handle.descriptor.tensor.nativeMeaning,
        fileSha256:sha(raw),payloadSha256:v.identity.payloadSha256,context:handle.descriptor.native.metadata.context});
    } finally {active--;eventLog.push({event:'capture-end',artifactId:v.id});maxRss=Math.max(maxRss,process.memoryUsage().rss);}
  }));
  await Promise.all(jobs);await queue.drain();assert.equal(maxActive,1);
  const receipt=await writeArtifactPackage(manifest,assets,bytesOnDisk);
  const result=await readArtifactPackage(source,registry);assert.equal(result.status,'complete');
  for(const artifact of result.artifacts){
    const v=variants.find(v=>v.id===artifact.descriptor.artifactId);
    assert.deepEqual(artifact.restoredNative,await decodeTensor(await read(join(root,v.file))));
    assert.deepEqual(result.assets.get(artifact.binding.nativePath),await read(join(root,v.file)));
    assert.equal(artifact.restoredEvidence.records[0].data.inputNativeFileSha256,original.input.fileSha256);
    assert.equal(artifact.restoredEvidence.records[0].data.outputNativeFileSha256,original.numeric.fileSha256);
    if(v.id==='rgb768')assert.deepEqual(artifact.restoredEvidence.records[0].data.nativeEvidence,original.evidence);
    assert.equal(artifact.descriptor.snapshotId,null);
  }
  const rejected=[];
  for(const [name,path,code,mutate] of [
    ['missing-rgb-evidence','artifacts/rgb768/evidence.json','REQUIRED_ASSET_MISSING',()=>null],
    ['native-header-modified','artifacts/mean64/native.wktensor','ASSET_HASH_MISMATCH',b=>{b[5]^=1;return b;}],
    ['native-payload-modified','artifacts/rgb768/native.wktensor','ASSET_HASH_MISMATCH',b=>{b[b.length-1]^=1;return b;}],
  ]){
    await assert.rejects(()=>readArtifactPackage({read:async p=>{const b=await source.read(p);return p===path?mutate(b):b;}},registry),e=>e.code===code);
    rejected.push({name,code,scope:'fault injection at read boundary; original stored files unchanged'});
  }
  for(const h of handles)releaseArtifactHandle(h,store);
  assert.equal(store.size,0);const queueState=queue.inspect();const disposed=await queue.dispose();
  assert.deepEqual(disposed.quarantined,[]);assert.equal(queueState.groups[0].activeInvocationId,null);
  const files=[...result.assets].map(([path,b])=>({path,bytes:b.length,sha256:sha(b)}));
  files.push(...await Promise.all(['manifest.json','receipt.json'].map(async path=>{const b=await source.read(path);return {path,bytes:b.length,sha256:sha(b)};})));
  const output={passed:true,scope:'Recorded real64 mean and RGB through actual manager capture/queue/package on Node',
    managerCommit:checks.commit,nativeCodecSource:sourceRef,nativeCodecSha256:'4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b',
    sourceFileChecks:checks.records.length,artifacts:summaries,packageStatus:result.status,receipt,rejected,files,
    resourceScope:{wallSeconds:(performance.now()-started)/1000,sampledProcessRssMaxBytes:maxRss,
      measurement:'Node RSS at capture boundaries, not whole-device or inference peak',
      nodePid:process.pid,workersCreated:0,sessionsCreated:0,storeReferencesAfterRelease:store.size,maxConcurrentFileOperations:maxActive,
      queueDisposed:disposed.disposed,queueState,eventLog},
    newInference:false,nativeOperationInvoked:false,liveManagedBrowserPipelineAccepted:false,generatedSampleAccepted:false,
    snapshotPublished:false,productionRegistryAdoption:false};
  await writeFile(join(out,'results.json'),JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({passed:true,artifacts:summaries.length,rejected:rejected.length,packageStatus:result.status,wallSeconds:output.resourceScope.wallSeconds}));
} finally {
  for(const h of handles){try{releaseArtifactHandle(h,store);}catch{}}
  store.clear();await queue.dispose();
}

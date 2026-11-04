#!/usr/bin/env node
/** Verify selected configuration and saved payloads through the actual acquired
 * management APIs. No neural executor, model export, or owner arithmetic runs. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {openAsBlob} from 'node:fs';
import {mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import {dirname,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs,promisify} from 'node:util';
import * as native from '../../../docs/shared/inference/api.mjs';
import {inspectTextEncoderManifest} from '../../../docs/shared/inference/text-encoder.mjs';
import {createManagedInferenceBridge,createCurrentNativeCodec} from '../../../docs/shared/inference/management-adapter.mjs';
import {importManagementSource,MANAGEMENT_COMMIT,MANAGEMENT_SOURCE_ROOTS,relativeSourceDependencies,validateSourcePath} from './source.mjs';
import {openPositionalSource} from '../text-encoder/node_sdk_host.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),exec=promisify(execFile);
const SELF=relative(ROOT,fileURLToPath(import.meta.url));
const OWNER_SOURCE='20f640a6e071b6c060a212e89b28f0c8965923f7';
const MANIFEST_SHA='420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405';
const LONG_SHA='18ed985965e4dd90e5db3fe85b3ea55e0839d073008749ab99c9cc9d6927c00a';
const LONG_PATH='development/inference/management-20261104/text/plain-long-accepted/plain-long-eos512.wktensor';
const MEAN_PATH='development/inference/p2-p3-acceptance/p2/updated-884/decode/mean/normalized-mean/native.wktensor';
const MEAN_SHA='f7b2b158096937648a14a224ca4961543eace129a24ae3b88394a810f6c18840';
const FRAME_RECEIPT='development/inference/standalone-20261102/evidence/vae-source-f4-acceptance.json';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=(code,message)=>Object.assign(Error(message),{code});
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const bytes=t=>new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength);
const fileRecord=(path,b)=>({path,bytes:b.length,sha256:hash(b)});
const writeJson=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const git=async args=>(await exec('git',args,{cwd:ROOT,encoding:'buffer',maxBuffer:16*1024*1024})).stdout;

export const HELP=`Usage: node ${SELF} --management-root <acquired-e166-directory> --text-bundle <existing-bundle> --text-source <original-safetensors> --output <fresh-directory>
  [--manifest <selected-manifest.json>] [--conditioning <existing-long-WKT>]
  [--normalized-mean <existing-normalized-mean-WKT>] [--frame-tensor <existing-source-F4-WKT>]
  [--execution-source-sha <fixed-commit-containing-this-CLI>]
Uses existing file-backed Blob assets and existing WKT payloads. Configure and
management capture/save/read only; client.run rejects every attempted NN call.
The optional execution SHA is checked against the actual CLI and runtime bytes.
Without it, CLI sourceCommit stays null and runtime source remains fixed20f.`;

async function verifySources(managementRoot,executionSha){
 if(executionSha&&!/^[a-f0-9]{40}$/.test(executionSha))throw fail('FULL_EXECUTION_SHA_REQUIRED','Full execution commit required');
 const acquired=await json(resolve(managementRoot,'ACQUISITION.json'));
 assert.equal(acquired.commit,MANAGEMENT_COMMIT,'Exact acquired management commit required');
 const declared=new Map();
 if(!Array.isArray(acquired.files)||!Array.isArray(acquired.roots)||acquired.roots.length!==MANAGEMENT_SOURCE_ROOTS.length||new Set(acquired.roots).size!==MANAGEMENT_SOURCE_ROOTS.length||!MANAGEMENT_SOURCE_ROOTS.every(path=>acquired.roots.includes(path)))throw fail('MANAGEMENT_SOURCE_CLOSURE_INCOMPLETE','Acquisition must declare the four actual management import roots');
 for(const f of acquired.files){
  try{validateSourcePath(f?.path);}catch{throw fail('MANAGEMENT_SOURCE_UNSAFE_PATH','Acquisition source paths must be canonical safe repository-relative paths');}
  if(declared.has(f.path))throw fail('MANAGEMENT_SOURCE_DUPLICATE_PATH','Duplicate acquisition source path: '+f.path);
  declared.set(f.path,f);
 }
 // Derive the required closure from fixed Git bytes, never from the supplied
 // receipt or unverified local source. No acquired module is imported here.
 const expectedFiles=new Map(),pending=[...MANAGEMENT_SOURCE_ROOTS];
 while(pending.length){
  const path=pending.shift();if(expectedFiles.has(path))continue;
  const fixed=await git(['show',MANAGEMENT_COMMIT+':'+path]);expectedFiles.set(path,fixed);
  pending.push(...relativeSourceDependencies(path,fixed));
 }
 const missing=[...expectedFiles.keys()].filter(path=>!declared.has(path)),extra=[...declared.keys()].filter(path=>!expectedFiles.has(path));
 if(missing.length||extra.length)throw fail('MANAGEMENT_SOURCE_CLOSURE_INCOMPLETE','Acquisition must exactly cover the actual management import closure; missing: '+missing.join(', ')+'; extra: '+extra.join(', '));
 const management=[],canonicalRoot=await realpath(managementRoot);
 for(const [path,fixed] of expectedFiles){
  const f=declared.get(path),localPath=resolve(managementRoot,path);
  if(await realpath(localPath)!==resolve(canonicalRoot,path))throw fail('MANAGEMENT_SOURCE_UNSAFE_PATH','Management import path cannot redirect through a symlink: '+path);
  const local=await readFile(localPath),digest=hash(fixed),gitBlobSha=createHash('sha1').update(Buffer.from('blob '+fixed.length+'\0')).update(fixed).digest('hex');
  if(f.bytes!==fixed.length||f.sha256!==digest||f.gitBlobSha!==undefined&&f.gitBlobSha!==gitBlobSha||!local.equals(fixed))throw fail('MANAGEMENT_SOURCE_BYTES_MISMATCH','Actual management file or acquisition identity differs from fixed Git bytes: '+path);
  management.push({...f,gitBlobSha,exactGitBytes:true});
 }
 const accepted=await json(resolve(ROOT,'development/inference/management-20261104/text/managed-accepted/source-input-acquisition.json'));
 const runtime=[];
 for(const f of accepted.servedSources.filter(f=>f.module==='owner'&&f.path.startsWith('docs/'))){
  const local=await readFile(resolve(ROOT,f.path));assert.equal(local.length,f.bytes);assert.equal(hash(local),f.sha256,'Accepted runtime changed: '+f.path);
  if(executionSha)assert.deepEqual(local,await git(['show',executionSha+':'+f.path]));
  runtime.push({path:f.path,bytes:local.length,sha256:hash(local),originalExecutionSourceSha:f.commit,exactAcceptedBytes:true});
 }
 const self=await readFile(fileURLToPath(import.meta.url));
 if(executionSha)assert.deepEqual(self,await git(['show',executionSha+':'+SELF]));
 const dependencies=[];
 for(const path of ['tools/inference/management-connection/source.mjs','tools/inference/text-encoder/node_sdk_host.mjs']){const local=await readFile(resolve(ROOT,path));if(executionSha)assert.deepEqual(local,await git(['show',executionSha+':'+path]));dependencies.push(fileRecord(path,local));}
 const bridgePath='docs/shared/inference/management-adapter.mjs',bridge=await readFile(resolve(ROOT,bridgePath));
 const originalBridge=accepted.servedSources.find(f=>f.path===bridgePath);assert.equal(hash(bridge),originalBridge.sha256);
 if(executionSha)assert.deepEqual(bridge,await git(['show',executionSha+':'+bridgePath]));
 return {managementCommit:MANAGEMENT_COMMIT,managementImportRoots:[...MANAGEMENT_SOURCE_ROOTS],completeManagementImportClosure:true,management,runtime,bridge:{path:bridgePath,bytes:bridge.length,sha256:hash(bridge),exactAcceptedBytes:true},cli:{path:SELF,bytes:self.length,sha256:hash(self),sourceCommit:executionSha??null,exactGitBytes:!!executionSha,dependencies},checkoutHead:(await git(['rev-parse','HEAD'])).toString().trim(),reusedNumericEvidence:{executionSourceSha:accepted.executionSourceSha,scope:'Existing plain/ID L512 active3 managed-browser evidence only; no new numerical acceptance',manifestSha256:accepted.textManifestMapping.selectedSha256}};
}

async function fileBindings(manifest,bundle,source){
 const files=new Map(),assets=[];let sourceReader;
 const selected=[...manifest.blocks,manifest.finalNorm,manifest.embedding.rowHashes,manifest.tokenizer,{path:manifest.embedding.sourceFile,bytes:manifest.embedding.sourceBytes,sha256:manifest.modelSha256,originalModel:true}];
 try{
 for(const a of selected){
  const local=resolve(a.originalModel?source:resolve(bundle,a.path));
  const file=a.originalModel?await openPositionalSource(local,a.bytes):await openAsBlob(local);
  if(a.originalModel)sourceReader=file;
  assert.equal(file.size,a.bytes,'Actual file size differs: '+a.path);
  files.set(a.path,file);assets.push({path:a.path,localPath:local,bytes:file.size,declaredSha256:a.sha256,binding:a.originalModel?'Existing openPositionalSource; actual fstat-bound original model':'node:fs.openAsBlob; actual file-backed Blob',...(a.originalModel?{statIdentity:file.statIdentity,stats:file.stats()}:{}),payloadRead:false,fullFileHashRecomputed:false});
 }
 return {files,assets,sourceReader};
 }catch(error){if(sourceReader)try{await sourceReader.close();}catch(cleanup){error.sourceCleanupError=String(cleanup.message??cleanup);}throw error;}
}

async function retain(bridge,tensor,input,{id,out,sourceRecords,selection}={}){
 const record=bridge.captureSavedTensor(tensor,{artifactId:id,sourceRecords,trace:{schemaVersion:1,artifactId:id,records:[{traceId:id+':saved-input-only',data:{scope:'Existing saved payload through management capture/save/read; no inference',...(selection?{selectedTextConfiguration:selection}:{})}}]}});
 const saved=await bridge.save({records:{[id]:record}}),savedPath=resolve(out,id+'.management.zip');
 await writeFile(savedPath,saved.bytes,{flag:'wx'});
 const reselected=new Uint8Array(await readFile(savedPath)),restored=await bridge.read(reselected),actual=restored.artifacts[id];
 assert.deepEqual(bytes(actual.tensor),bytes(tensor),'Every saved data word must survive');
 assert.deepEqual(native.describeTensor(actual.tensor),native.describeTensor(tensor),'Every native metadata field must survive');
 assert.deepEqual(actual.sourceRecords,sourceRecords,'Input provenance must survive');
 assert.deepEqual(actual.trace,record.trace,'Outer configuration and trace must survive');
 const encoded=await native.encodeTensor(actual.tensor);assert.equal(hash(encoded),hash(input),'Native WKT bytes must remain identical');
 return {input:fileRecord(sourceRecords[0].path,input),managementPackage:fileRecord(relative(ROOT,savedPath),reselected),receipt:saved.receipt,elements:tensor.data.length,allDataWordsEqual:true,allNativeMetadataEqual:true,sourceRecordsEqual:true,traceEqual:true,nativeWktBytesIdentical:true,nativeDescriptor:native.describeTensor(actual.tensor),snapshotScope:'Persistence only; no execution snapshot is invented'};
}

export async function verifyAdoption(options){
 for(const key of ['managementRoot','textBundle','textSource','output'])if(!options[key])throw fail('ADOPTION_ARGUMENT_REQUIRED','Required '+key);
 const out=resolve(options.output);await mkdir(out,{recursive:false});
 const started=performance.now();
 const receipt={schemaVersion:1,status:'RUNNING',scope:'Actual management configuration selection and persistence of existing payloads only',neuralCalls:0,exports:0,workersCreated:0,forbiddenRunCalls:0,generationReady:false,originalWorkflowAccepted:false,acceptedProduction:false,attempts:[]};
 let bridge,sourceReader;
 try{
  receipt.sources=await verifySources(resolve(options.managementRoot),options.executionSourceSha);
  const manifestPath=resolve(options.manifest??resolve(options.textBundle,'manifest.json')),raw=await readFile(manifestPath);
  assert.equal(hash(raw),MANIFEST_SHA,'Selected Text manifest must be exact420e bytes');
  const manifest=JSON.parse(raw),expected=inspectTextEncoderManifest(manifest),bindings=await fileBindings(manifest,options.textBundle,options.textSource);
  sourceReader=bindings.sourceReader;
  const calls=[],client={state:{status:'idle'},run(){receipt.forbiddenRunCalls++;throw fail('NN_FORBIDDEN','This selection/storage verifier cannot execute a neural request');},cancel(){return false;},dispose(){this.state={status:'disposed'};}};
  const api={apiVersion:native.API_VERSION,textEncoder:native.createTextEncoderModule({client,ownsClient:false}),vae:native.createVaeModule({client,ownsClient:false}),dispose(){this.textEncoder.dispose();this.vae.dispose();client.dispose();}};
  const sourceRef={repository:'Kushyameln01/kushyameln-works',commit:options.executionSourceSha??OWNER_SOURCE,path:'docs/shared/inference/api.mjs'};
  const codec=createCurrentNativeCodec(native,sourceRef),manager=await importManagementSource(resolve(options.managementRoot));
  receipt.codec={codecId:codec.codecId,codecVersion:codec.codecVersion,sourceRef:codec.sourceRef};
  bridge=createManagedInferenceBridge({manager,nativeAPI:api,nativeModule:native,sourceRef,codec,onNativeRequest:r=>calls.push({module:r.module,operation:r.operation})});
  const oldManifest=await json(resolve(ROOT,'development/inference/codec-marker-handoff/manifests/text/manifest.json'));
  const old=await bridge.configure('text_encoder',{manifest:oldManifest,files:bindings.files});assert.equal(old.value.configured,true);assert(old.value.graphBindings.every(b=>b.recipeId===null));
  receipt.oldConfiguration={compatible:true,graphBindings:old.value.graphBindings,terminal:old.terminal};
  const configured=await bridge.configure('text_encoder',{manifest,files:bindings.files});
  assert.deepEqual(configured.value.graphBindings,expected.graphBindings);assert.equal(configured.value.graphBindings.length,24);
  assert.equal(configured.value.modelSha256,manifest.modelSha256);assert.equal(configured.value.tokenizerSha256,manifest.tokenizer.sha256);assert.equal(configured.value.output.normalization,'umt5-final-rmsnorm-f32-v1');
  const plain=bridge.querySupport('text_encoder','encode',{text:'Hello world'}),ids=bridge.querySupport('text_encoder','encode',{tokenIds:[1],attentionMask:[1]});assert.equal(plain.support.supported,true);assert.equal(ids.support.supported,true);
  receipt.selection={manifest:fileRecord(relative(ROOT,manifestPath),raw),graphBindingsExact:true,capabilities:configured.value,terminal:configured.terminal,assets:bindings.assets,actualFileBindings:bindings.files.size,assetPayloadReads:0,fullModelOrGraphHashesRecomputed:0,support:{plain:plain.support,ids:ids.support},supportScope:'Configured contract and actual local file sizes; native execution hash and NN remain unperformed'};
  const selection={manifest:receipt.selection.manifest,graphBindings:configured.value.graphBindings,sourceRef};
  const conditioningPath=resolve(options.conditioning??resolve(ROOT,LONG_PATH)),conditioningBytes=await readFile(conditioningPath);assert.equal(hash(conditioningBytes),LONG_SHA);
  const conditioning=await native.decodeTensor(conditioningBytes);assert.deepEqual(conditioning.shape,[1,512,4096]);assert.equal(conditioning.attentionMask.length,512);assert(conditioning.attentionMask.every(x=>x===1));assert.equal(conditioning.normalization,'umt5-final-rmsnorm-f32-v1');
  receipt.storage={conditioning:await retain(bridge,conditioning,conditioningBytes,{id:'plain-long-conditioning',out,sourceRecords:[{path:relative(ROOT,conditioningPath),sha256:hash(conditioningBytes),modelExecutionSourceSha:'78954ee92d1b76c6652f50df1668159a55db6dc9',scope:'Existing real plain-long L512 all-active saved tensor; no re-encode'}],selection})};
  const callerSelectedMean=options.normalizedMean!==undefined,meanPath=resolve(options.normalizedMean??resolve(ROOT,MEAN_PATH)),meanBytes=await readFile(meanPath),mean=await native.decodeTensor(meanBytes);
  if(!callerSelectedMean)assert.equal(hash(meanBytes),MEAN_SHA,'Default public P2 normalized mean must retain its fixed bytes');
  assert.equal(mean.meaning,'wan21-normalized-posterior-mean:v1');assert.equal(mean.normalization,'wan21-comfy-f32-v1');
  receipt.storage.normalizedMean=await retain(bridge,mean,meanBytes,{id:'normalized-mean',out,sourceRecords:[{path:relative(ROOT,meanPath),sha256:hash(meanBytes),scope:callerSelectedMean?'Caller-selected saved normalized mean; no numerical acceptance or normalization conversion claimed':'Existing public P2 normalized mean, fixed bytes verified; no normalization conversion'}]});
  if(options.frameTensor){
   const framePath=resolve(options.frameTensor),frameBytes=await readFile(framePath),original=await json(resolve(ROOT,FRAME_RECEIPT)),expectedFrame=original.operations.encode.comparison;
   assert.equal(hash(frameBytes),expectedFrame.fileSha256,'Existing accepted source-F4 WKT required');assert.equal(frameBytes.length,expectedFrame.bytes);
   const frame=await native.decodeTensor(frameBytes);assert.deepEqual(frame.frameProcessing,expectedFrame.header.frameProcessing);assert.deepEqual(frame.context,expectedFrame.header.context);
   receipt.storage.frameProcessing=await retain(bridge,frame,frameBytes,{id:'source-f4',out,sourceRecords:[{path:relative(ROOT,framePath),sha256:hash(frameBytes),originalAcceptance:FRAME_RECEIPT,scope:'Existing synthetic source-F4 native NN output; no new slot, frames or inference'}]});
  }else receipt.storage.frameProcessing={status:'NOT_CHECKED',reason:'Existing accepted source-F4 WKT not supplied; no frame or slot metadata is synthesized',expectedArtifactSha256:(await json(resolve(ROOT,FRAME_RECEIPT))).operations.encode.comparison.fileSha256};
  receipt.nativeRequests=calls;assert.equal(calls.length,2);assert(calls.every(c=>c.operation==='configure'));assert.equal(receipt.forbiddenRunCalls,0);
  receipt.disposal=await bridge.dispose();receipt.finalBridge=bridge.inspect();assert.equal(receipt.finalBridge.artifactStoreEntries,0);assert.equal(receipt.finalBridge.disposed,true);
  receipt.status='PASS';receipt.passed=true;
 }catch(error){receipt.status='FAIL';receipt.passed=false;receipt.error={code:error.code??error.name,message:error.message,stack:error.stack,...(error.sourceCleanupError?{sourceCleanupError:error.sourceCleanupError}:{})};throw error;}
 finally{
  if(bridge&&!receipt.disposal)try{receipt.disposal=await bridge.dispose();}catch(error){receipt.cleanupError=String(error.message??error);receipt.passed=false;receipt.status='FAIL';}
  if(sourceReader)try{receipt.originalSourceBeforeClose=sourceReader.stats();try{await sourceReader.close();}finally{receipt.originalSourceAfterClose=sourceReader.stats();}assert.equal(receipt.originalSourceBeforeClose.readCalls,0);assert.equal(receipt.originalSourceBeforeClose.readBytes,0);assert.equal(receipt.originalSourceAfterClose.closed,true);}catch(error){receipt.sourceCleanupError=String(error.message??error);receipt.passed=false;receipt.status='FAIL';}
  receipt.elapsedMs=performance.now()-started;
  const usage=process.resourceUsage();receipt.nodeRusage={maxRssKiB:usage.maxRSS,maxRssBytes:usage.maxRSS*1024,scope:'Node process lifetime high-water, including imports and verification; not a whole workflow or device peak'};
  await writeJson(resolve(out,'receipt.json'),receipt);
 }
 if(!receipt.passed)throw fail('ADOPTION_CLEANUP_FAILED','Verification or cleanup did not complete');
 return receipt;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const {values}=parseArgs({options:{help:{type:'boolean'},'management-root':{type:'string'},'text-bundle':{type:'string'},'text-source':{type:'string'},output:{type:'string'},manifest:{type:'string'},conditioning:{type:'string'},'normalized-mean':{type:'string'},'frame-tensor':{type:'string'},'execution-source-sha':{type:'string'}}});
  if(values.help)console.log(HELP);else{const r=await verifyAdoption({managementRoot:values['management-root'],textBundle:values['text-bundle'],textSource:values['text-source'],output:values.output,manifest:values.manifest,conditioning:values.conditioning,normalizedMean:values['normalized-mean'],frameTensor:values['frame-tensor'],executionSourceSha:values['execution-source-sha']});console.log(JSON.stringify({status:r.status,manifestSha256:r.selection.manifest.sha256,graphBindings:r.selection.capabilities.graphBindings.length,actualFileBindings:r.selection.actualFileBindings,neuralCalls:r.neuralCalls,forbiddenRunCalls:r.forbiddenRunCalls,receipt:resolve(values.output,'receipt.json')}));}
 }catch(error){console.error(JSON.stringify({code:error.code??error.name,message:error.message}));process.exitCode=1;}
}

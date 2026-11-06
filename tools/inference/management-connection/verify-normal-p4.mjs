// Development-only receipt: fixed source and saved Text ingress; no model arithmetic.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';

const DIFFUSION_SOURCE='b6e166478a8e072c9ffd3ce562bfdb0c89634920';
const CODEC_SOURCE='20f640a6e071b6c060a212e89b28f0c8965923f7';
const PRODUCER_SOURCE='78954ee92d1b76c6652f50df1668159a55db6dc9';
const MANIFEST_SHA256='420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405';
const FIXTURE_SHA256='18ed985965e4dd90e5db3fe85b3ea55e0839d073008749ab99c9cc9d6927c00a';
const CODEC_PATH='docs/shared/inference/tensor.mjs';
const API_PATH='docs/shared/diffusion-models/api/index.mjs';
const NATIVE_PATH='docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs';
const REQUIRED_SOURCE_PATHS=[API_PATH,NATIVE_PATH,'docs/shared/diffusion-models/execution/capabilities.mjs'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitBlob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const viewBytes=view=>new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
const git=(root,args)=>execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});

function relativeSource(value){
 if(typeof value!=='string'||value.includes('\\')||path.posix.isAbsolute(value)||value!==path.posix.normalize(value)||value==='..'||value.startsWith('../'))throw TypeError('Invalid acquisition source path');
 return value;
}

async function checkAcquiredSource(root,entry){
 const relative=relativeSource(entry.path),bytes=await fs.readFile(path.join(root,relative));
 assert(Number.isSafeInteger(entry.bytes)&&entry.bytes>=0,'Invalid acquisition source byte count');
 assert.equal(bytes.length,entry.bytes,'Source byte count mismatch: '+relative);
 assert.match(entry.sha256??'',/^[0-9a-f]{64}$/,'Invalid acquisition source SHA-256');
 assert.equal(hash(bytes),entry.sha256,'Source SHA-256 mismatch: '+relative);
 if(entry.gitBlob!==undefined)assert.equal(gitBlob(bytes),entry.gitBlob,'Source Git blob mismatch: '+relative);
 return {path:relative,bytes:bytes.length,sha256:hash(bytes),gitBlob:gitBlob(bytes)};
}

async function checkImportClosure(root,sourcePaths){
 const imports=/(?:\b(?:import|export)\s+[^;]*?\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g;
 for(const relative of sourcePaths){
  if(!relative.endsWith('.mjs'))continue;
  const source=await fs.readFile(path.join(root,relative),'utf8');
  for(const match of source.matchAll(imports)){
   const specifier=match[1];if(!specifier.startsWith('.'))continue;
   const dependency=relativeSource(path.posix.normalize(path.posix.join(path.posix.dirname(relative),specifier)));
   assert(sourcePaths.has(dependency),'Imported dependency absent from acquisition: '+relative+' -> '+dependency);
  }
 }
}

async function scriptProof(){
 const scriptPath=fileURLToPath(import.meta.url),bytes=await fs.readFile(scriptPath);
 const proof={path:scriptPath,bytes:bytes.length,sha256:hash(bytes),gitBlob:gitBlob(bytes),checkoutSha:null,scriptSourceSha:null,uncommittedAtExecution:true};
 try{
  const root=git(path.dirname(scriptPath),['rev-parse','--show-toplevel']).toString().trim();
  proof.checkoutSha=git(root,['rev-parse','HEAD']).toString().trim();
  const relative=path.relative(root,scriptPath).split(path.sep).join('/');
  if(hash(git(root,['show',proof.checkoutSha+':'+relative]))===proof.sha256){proof.scriptSourceSha=proof.checkoutSha;proof.uncommittedAtExecution=false;}
 }catch{/* A copied/uncommitted helper is recorded honestly, never assigned a fixed code SHA. */}
 return proof;
}

function verifySnapshot(snapshot,tensor,original){
 assert.deepEqual(snapshot.shape,tensor.shape);
 assert.equal(snapshot.data.length,tensor.data.length);
 const words=new Uint32Array(snapshot.data.buffer,snapshot.data.byteOffset,snapshot.data.length);
 const expected=new Uint32Array(tensor.data.buffer,tensor.data.byteOffset,tensor.data.length);
 for(let i=0;i<words.length;i++)assert.equal(words[i],expected[i],'Conditioning word changed at '+i);
 assert.deepEqual(snapshot.attentionMask,tensor.attentionMask);
 assert.equal(snapshot.modelSha256,original.modelSha256);
 assert.equal(snapshot.tokenizerSha256,original.tokenizerSha256);
 assert.equal(snapshot.metadata.nativeTensorMetadata.normalization,original.normalization);
 assert.deepEqual(snapshot.metadata.verification,{producerAuthenticated:false,realExecutionVerified:false,jointlyAccepted:false});
 assert.notEqual(snapshot.data.buffer,tensor.data.buffer);
 assert.notEqual(snapshot.attentionMask.buffer,tensor.attentionMask.buffer);
}

async function main(){
 const {values}=parseArgs({options:{'diffusion-root':{type:'string'},acquisition:{type:'string'},tensor:{type:'string'},'owner-root':{type:'string'},output:{type:'string'},help:{type:'boolean'}}});
 if(values.help){console.log('Usage: node verify-normal-p4.mjs --diffusion-root DIR --acquisition FILE --tensor FILE --owner-root DIR --output NEW_FILE\nFixed-source NN0 verification only; no model factory, projection, inference, or export.');return;}
 for(const name of ['diffusion-root','acquisition','tensor','owner-root','output'])if(!values[name])throw TypeError('Required --'+name);
 const diffusionRoot=path.resolve(values['diffusion-root']),ownerRoot=path.resolve(values['owner-root']);
 const acquisitionPath=path.resolve(values.acquisition),inputPath=path.resolve(values.tensor),output=path.resolve(values.output);
 const acquisitionBytes=await fs.readFile(acquisitionPath),acquisition=JSON.parse(acquisitionBytes);
 assert.equal(acquisition.fixedDistributionSha,DIFFUSION_SOURCE,'This probe reproduces the fixed b6e1664 contract');
 assert(Array.isArray(acquisition.files)&&acquisition.files.length>0,'Acquisition files are required');
 assert(acquisition.runtimeAssets===undefined||Array.isArray(acquisition.runtimeAssets),'Invalid acquisition runtimeAssets');
 const checkedSources=[];
 for(const entry of [...acquisition.files,...(acquisition.runtimeAssets??[])])checkedSources.push(await checkAcquiredSource(diffusionRoot,entry));
 const sourcePaths=new Set(checkedSources.map(entry=>entry.path));
 for(const relative of REQUIRED_SOURCE_PATHS)assert(sourcePaths.has(relative),'Required source absent from acquisition: '+relative);
 await checkImportClosure(diffusionRoot,sourcePaths);
 // Bind the manifest and actual bytes to immutable git objects, before any imported code runs.
 for(const entry of checkedSources)assert.equal(hash(git(ownerRoot,['show',DIFFUSION_SOURCE+':'+entry.path])),entry.sha256,'Acquisition differs from fixed Diffusion Git source: '+entry.path);
 const codecPath=path.join(ownerRoot,CODEC_PATH),codecBytes=await fs.readFile(codecPath);
 assert.equal(hash(codecBytes),hash(git(ownerRoot,['show',CODEC_SOURCE+':'+CODEC_PATH])),'Codec differs from fixed 20f source');
 const inputBytes=await fs.readFile(inputPath);
 assert.equal(inputBytes.length,8390098,'Expected saved plain-long-eos512 fixture bytes');
 assert.equal(hash(inputBytes),FIXTURE_SHA256,'Expected original saved real Text L512 fixture');
 const helper=await scriptProof(),started=performance.now();
 const {decodeTensor}=await import(pathToFileURL(codecPath));
 const api=await import(pathToFileURL(path.join(diffusionRoot,API_PATH)));
 const native=await import(pathToFileURL(path.join(diffusionRoot,NATIVE_PATH)));
 const tensor=await decodeTensor(inputBytes);
 assert.equal(tensor.dtype,'float32');assert.equal(tensor.layout,'BLC');assert.equal(tensor.meaning,'text_hidden_states');
 assert.equal(tensor.normalization,'umt5-final-rmsnorm-f32-v1');assert.deepEqual(tensor.shape,[1,512,4096]);
 assert.equal(tensor.attentionMask.length,512);assert(tensor.attentionMask.every(value=>value===1));
 const original={modelSha256:tensor.modelSha256,tokenizerSha256:tensor.tokenizerSha256,normalization:tensor.normalization,dataSha256:hash(viewBytes(tensor.data)),maskSha256:hash(viewBytes(tensor.attentionMask))};
 const capabilities=api.describeExecutionCapabilities();
 const descriptor={operation:'postSelfAttention',model:{side:'LOW',modelSha256:capabilities.models.LOW},blockIndex:0,contextLatents:[],inputs:{
  residual:{dtype:'float32',shape:[2,5120],layout:'LC',meaning:'bernini-block0-post-self-attention-hidden:v1',normalization:'none'},
  timeAct1:{dtype:'float32',shape:[5120],layout:'C',meaning:'bernini-time-embedding-silu:v1',normalization:'none'},
  conditioning:{dtype:tensor.dtype,shape:[...tensor.shape],layout:tensor.layout,meaning:tensor.meaning,...{normalization:original.normalization,modelSha256:original.modelSha256,tokenizerSha256:original.tokenizerSha256}}
 }};
 const lowSupport=api.checkExecutionSupport(descriptor);
 const highSupport=api.checkExecutionSupport({...descriptor,model:{side:'HIGH',modelSha256:capabilities.models.HIGH}});
 for(const support of [lowSupport,highSupport]){assert.equal(support.supported,true);assert.equal(support.validation,'metadata-only');assert.equal(support.modelInference,false);assert.equal(support.generationReady,false);}
 const wrongNormalization=structuredClone(descriptor);wrongNormalization.inputs.conditioning.normalization='unrecognized-normalization';
 const wrongNormalizationSupport=api.checkExecutionSupport(wrongNormalization);
 assert.equal(wrongNormalizationSupport.supported,false);assert(wrongNormalizationSupport.reasons.some(value=>value.code==='UNSUPPORTED_NORMALIZATION'));
 const missingTokenizer=structuredClone(descriptor);delete missingTokenizer.inputs.conditioning.tokenizerSha256;
 const missingTokenizerSupport=api.checkExecutionSupport(missingTokenizer);
 assert.equal(missingTokenizerSupport.supported,false);assert(missingTokenizerSupport.reasons.some(value=>value.code==='TOKENIZER_IDENTITY_MISMATCH'));
 const ordinary=native.snapshotP4NativeConditioning(tensor),captured=native.captureP4Conditioning(tensor),protectedSnapshot=native.snapshotP4CapturedConditioning(captured);
 for(const snapshot of [ordinary,captured,protectedSnapshot])verifySnapshot(snapshot,tensor,original);
 for(const [a,b] of [[ordinary,captured],[ordinary,protectedSnapshot],[captured,protectedSnapshot]]){assert.notEqual(a.data.buffer,b.data.buffer);assert.notEqual(a.attentionMask.buffer,b.attentionMask.buffer);}
 assert.equal(hash(viewBytes(tensor.data)),original.dataSha256);assert.equal(hash(viewBytes(tensor.attentionMask)),original.maskSha256);
 assert.equal(tensor.modelSha256,original.modelSha256);assert.equal(tensor.tokenizerSha256,original.tokenizerSha256);assert.equal(tensor.normalization,original.normalization);
 assert.equal(hash(await fs.readFile(inputPath)),FIXTURE_SHA256,'Saved input changed');
 const receipt={schemaVersion:1,passed:true,scope:'Actual saved Text L512 metadata support and ordinary/protected native ingress only; no model arithmetic',fixedDiffusionDistributionSha:DIFFUSION_SOURCE,helper,
  acquisition:{path:acquisitionPath,bytes:acquisitionBytes.length,sha256:hash(acquisitionBytes),checkedFiles:checkedSources.length,checkedBytes:checkedSources.reduce((sum,entry)=>sum+entry.bytes,0),fixedGitObjectsVerified:true},
  codec:{path:codecPath,sourceSha:CODEC_SOURCE,bytes:codecBytes.length,sha256:hash(codecBytes)},producerExecutionSourceSha:PRODUCER_SOURCE,approvedManifestSha256:MANIFEST_SHA256,
  input:{path:inputPath,bytes:inputBytes.length,wholeSha256:FIXTURE_SHA256,...original,shape:[...tensor.shape],elements:tensor.data.length,activeMaskValues:512},descriptor,lowSupport,highSupport,
  negativeChecks:{wrongNormalization:wrongNormalizationSupport,missingTokenizer:missingTokenizerSupport},capabilityContract:{canonicalConditioning:capabilities.operations.postSelfAttention.inputs.conditioning,normalizationAliases:capabilities.operations.postSelfAttention.textNormalizationAliases},
  checks:{all2097152DataWordsRetained:true,all512MaskBytesRetained:true,normalNativeAndProtectedSnapshotsOwnIndependentBuffers:true,modelTokenizerFinalMarkerRetained:true,decodedInputUnchanged:true,savedInputUnchanged:true,normalRequestNeedsNoReferenceGateReceiptOrFixedPrompt:true},verificationFlags:ordinary.metadata.verification,
  metadataSupportOnly:true,neuralRuns:0,modelsLoaded:0,projectionExecuted:false,crossAttentionExecuted:false,ffnExecuted:false,exports:0,numericalAcceptance:false,aggregateResourceAcceptance:false,independentOwnerAcknowledgement:false,elapsedMs:performance.now()-started,nodeRusagePeakRssBytes:process.resourceUsage().maxRSS*1024};
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({passed:true,output,lowSupported:true,highSupported:true,elements:2097152,activeTokens:512,normalization:original.normalization,neuralRuns:0,modelsLoaded:0,scriptSourceSha:helper.scriptSourceSha}));
}

main().catch(error=>{console.error((error.code??error.name)+': '+error.message);process.exitCode=1;});

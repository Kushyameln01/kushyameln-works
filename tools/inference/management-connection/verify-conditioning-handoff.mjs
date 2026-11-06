// Saved native conditioning -> actual Diffusion capture. Validation/copy only.
// This development verifier is not an ordinary API input requirement.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytesOf=view=>new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
function equalWords(a,b){
 assert.equal(a.length,b.length);
 const x=new Uint32Array(a.buffer,a.byteOffset,a.length),y=new Uint32Array(b.buffer,b.byteOffset,b.length);
 for(let i=0;i<x.length;i++)if(x[i]!==y[i])assert.fail('Conditioning word changed at '+i);
}
async function fixedFile(root,commit,relative){
 const bytes=await fs.readFile(path.join(root,relative));
 const expected=execFileSync('git',['show',commit+':'+relative],{cwd:ownerRoot,maxBuffer:2*1024*1024});
 assert.equal(bytes.length,expected.length);assert.equal(hash(bytes),hash(expected),'Fixed source differs: '+relative);
 return {path:relative,bytes:bytes.length,sha256:hash(bytes),executionSourceSha:commit,githubUrl:'https://github.com/Kushyameln01/kushyameln-works/blob/'+commit+'/'+relative};
}

const {values}=parseArgs({options:{tensor:{type:'string'},'owner-root':{type:'string'},'owner-source-sha':{type:'string'},'diffusion-root':{type:'string'},'diffusion-source-sha':{type:'string'},'producer-source-sha':{type:'string'},'case-id':{type:'string'},'script-source-sha':{type:'string'},output:{type:'string'}}});
for(const key of ['tensor','owner-root','owner-source-sha','diffusion-root','diffusion-source-sha','output'])if(!values[key])throw TypeError('Required --'+key);
const ownerRoot=path.resolve(values['owner-root']),diffusionRoot=path.resolve(values['diffusion-root']);
const scriptPath=fileURLToPath(import.meta.url),scriptRelative=path.relative(ownerRoot,scriptPath).split(path.sep).join('/');
const scriptBytes=await fs.readFile(scriptPath);
const scriptProof={path:scriptRelative,bytes:scriptBytes.length,sha256:hash(scriptBytes),executionSourceSha:values['script-source-sha']??null,uncommittedAtExecution:!values['script-source-sha'],baseImplementationSourceSha:values['owner-source-sha']};
if(values['script-source-sha']){
 const fixed=execFileSync('git',['show',values['script-source-sha']+':'+scriptRelative],{cwd:ownerRoot,maxBuffer:2*1024*1024});
 assert.equal(hash(scriptBytes),hash(fixed),'Verifier differs from its pinned script source');
 scriptProof.githubUrl='https://github.com/Kushyameln01/kushyameln-works/blob/'+values['script-source-sha']+'/'+scriptRelative;
}
const codecPath='docs/shared/inference/tensor.mjs';
const capturePath='docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs';
const sourceClosure=[await fixedFile(ownerRoot,values['owner-source-sha'],codecPath),await fixedFile(diffusionRoot,values['diffusion-source-sha'],capturePath)];
const proof={schemaVersion:1,scope:'Verifier and actual codec/capture source bytes checked before execution',script:scriptProof,sourceClosure};
const output=path.resolve(values.output);await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output+'.source-proof.json',JSON.stringify(proof,null,2)+'\n');

const started=performance.now();
const {decodeTensor}=await import(pathToFileURL(path.join(ownerRoot,codecPath)));
const diffusion=await import(pathToFileURL(path.join(diffusionRoot,capturePath)));
const inputBytes=await fs.readFile(values.tensor),tensor=await decodeTensor(inputBytes);
assert.equal(tensor.normalization,'umt5-final-rmsnorm-f32-v1','The supplied Text payload must retain its final RMSNorm marker');
const original={shape:[...tensor.shape],modelSha256:tensor.modelSha256,tokenizerSha256:tensor.tokenizerSha256,normalization:tensor.normalization,dataSha256:hash(bytesOf(tensor.data)),maskSha256:hash(bytesOf(tensor.attentionMask))};
const captured=diffusion.captureP4Conditioning(tensor);
const snapshot=diffusion.snapshotP4CapturedConditioning(captured);
equalWords(snapshot.data,tensor.data);assert.deepEqual(snapshot.attentionMask,tensor.attentionMask);
assert.deepEqual(snapshot.shape,original.shape);
assert.equal(snapshot.modelSha256,original.modelSha256);assert.equal(snapshot.tokenizerSha256,original.tokenizerSha256);
assert.equal(snapshot.metadata.nativeTensorMetadata.normalization,original.normalization);
assert.notEqual(captured.data.buffer,tensor.data.buffer);assert.notEqual(captured.attentionMask.buffer,tensor.attentionMask.buffer);
assert.notEqual(snapshot.data.buffer,captured.data.buffer);assert.notEqual(snapshot.attentionMask.buffer,captured.attentionMask.buffer);
assert.notEqual(snapshot.data.buffer,tensor.data.buffer);assert.notEqual(snapshot.attentionMask.buffer,tensor.attentionMask.buffer);

// Mutate only this process's decoded input, never the saved WKT or protected capture.
new Uint32Array(tensor.data.buffer)[0]^=1;tensor.attentionMask[0]^=1;
tensor.modelSha256='a'.repeat(64);tensor.tokenizerSha256='b'.repeat(64);tensor.normalization='ownership-check-only';
const afterInput=diffusion.snapshotP4CapturedConditioning(captured);
equalWords(afterInput.data,snapshot.data);assert.deepEqual(afterInput.attentionMask,snapshot.attentionMask);
assert.equal(afterInput.modelSha256,original.modelSha256);assert.equal(afterInput.tokenizerSha256,original.tokenizerSha256);
assert.equal(afterInput.metadata.nativeTensorMetadata.normalization,original.normalization);

new Uint32Array(afterInput.data.buffer)[0]^=1;afterInput.attentionMask[0]^=1;
afterInput.modelSha256='c'.repeat(64);afterInput.metadata.nativeTensorMetadata.normalization='snapshot-check-only';
const finalSnapshot=diffusion.snapshotP4CapturedConditioning(captured);
equalWords(finalSnapshot.data,snapshot.data);assert.deepEqual(finalSnapshot.attentionMask,snapshot.attentionMask);
assert.equal(finalSnapshot.modelSha256,original.modelSha256);assert.equal(finalSnapshot.tokenizerSha256,original.tokenizerSha256);
assert.equal(finalSnapshot.metadata.nativeTensorMetadata.normalization,original.normalization);
assert.equal(hash(bytesOf(finalSnapshot.data)),original.dataSha256);assert.equal(hash(bytesOf(finalSnapshot.attentionMask)),original.maskSha256);

const receipt={schemaVersion:1,passed:true,scope:'Saved real conditioning payload -> actual fixed Diffusion capture/snapshot only; no model arithmetic',caseId:values['case-id']??null,producerExecutionSourceSha:values['producer-source-sha']??null,
 sourceProof:proof,input:{path:path.resolve(values.tensor),bytes:inputBytes.length,sha256:hash(inputBytes),dtype:snapshot.dtype,layout:snapshot.layout,meaning:snapshot.meaning,shape:original.shape,elements:snapshot.data.length,dataSha256:original.dataSha256,modelSha256:original.modelSha256,tokenizerSha256:original.tokenizerSha256,normalization:original.normalization,maskLength:snapshot.attentionMask.length,activeMaskValues:snapshot.attentionMask.reduce((n,v)=>n+v,0),maskSha256:original.maskSha256},
 checks:{allDataWordsEqual:true,allMaskValuesEqual:true,modelTokenizerFinalMarkerRetained:true,inputCaptureSnapshotBuffersIndependent:true,inputMutationDoesNotChangeCapture:true,snapshotMutationDoesNotChangeProtectedCapture:true},
 capture:{schemaVersion:finalSnapshot.schemaVersion,rows:finalSnapshot.rows,verification:finalSnapshot.metadata.verification,normalizationLocation:'metadata.nativeTensorMetadata.normalization'},
 elapsedMs:performance.now()-started,nodeRusagePeakRssBytes:process.resourceUsage().maxRSS*1024,projectionExecuted:false,crossAttentionExecuted:false,ffnExecuted:false,neuralRuns:0,exports:0,independentRecipientEnvironmentAck:false,
 normalConnection:'Native tensor and explicit model/Tokenizer bindings only; no prompt hash,payload hash,numerical gate or detailed receipt is required by ordinary capture',ownership:'Capture and snapshots own independent bytes; caller releases all references when finished. Protected capture token is local to the receiving Diffusion module instance.'};
await fs.writeFile(output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({passed:true,output,elements:receipt.input.elements,rows:receipt.capture.rows,checks:receipt.checks,neuralRuns:0,projectionExecuted:false,crossAttentionExecuted:false,ffnExecuted:false},null,2));

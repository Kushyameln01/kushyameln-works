// E6's retrieved Diffusion closure: explicit unsupported profiles and metadata deltas.
// No neural inference, VAE conversion, generated sample or common-manager implementation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const args=Object.fromEntries(Array.from({length:(process.argv.length-2)/2},(_,i)=>[process.argv[2+i*2],process.argv[3+i*2]]));
for(const key of ['--peer-root','--still','--rectangle','--output'])if(!args[key])throw Error('Required '+key);
const root=path.resolve(args['--peer-root']);
const identity=JSON.parse(fs.readFileSync(new URL('../../../development/inference/e6/peer-source-identity.json',import.meta.url),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const record of identity.normalizationDependencyClosure){
 const bytes=fs.readFileSync(path.join(root,record.path));assert.equal(sha(bytes),record.sha256,record.path);
}
const load=rel=>import(pathToFileURL(path.join(root,rel)).href);
const codec=await load('docs/shared/inference/tensor.mjs');
const interop=await load('docs/shared/diffusion-models/tensor-interop.mjs');
const space=await load('docs/shared/diffusion-models/latent-space/latent-space.mjs');
const kernel=await space.createLatentSpace(fs.readFileSync(path.join(root,'docs/shared/diffusion-models/latent-space/build/latent-space.wasm')));
const checks=[];
function rejected(name,fn){let error;try{fn();}catch(e){error={name:e.name,message:e.message};}assert.ok(error,name);assert.equal(error.name,'RangeError');assert.match(error.message,/shape/);checks.push({name,rejected:true,error});}
const report={sourceCommit:identity.sourceCommit,kind:'E6 boundary classification, not joint acceptance',checks,
 neuralInference:false,normalizationExtension:false,ownerAcknowledged:false};
try{
 for(const [role,file,shape] of [['accepted64',args['--still'],[1,16,1,2,2]],['acceptedRectangle128',args['--rectangle'],[1,16,1,2,4]]]){
  const bytes=new Uint8Array(fs.readFileSync(file)),tensor=await codec.decodeTensor(bytes);
  assert.deepEqual(tensor.shape,shape);assert.equal(tensor.meaning,'raw-posterior-mean');
  assert.equal(tensor.modelSha256,interop.WAN21_VAE_SHA256);
  report[role]={fileSha256:sha(bytes),payloadSha256:tensor.dataSha256,shape,elements:tensor.data.length};
  rejected(role+' validator',()=>interop.requireWanRawLatent(tensor));
  rejected(role+' normalize',()=>kernel.normalizeRawMean(tensor));
  // A rejection-only fixture. Values are NOT numerically converted or sent to a decoder.
  rejected(role+' restore shape',()=>kernel.restoreRawMean({...tensor,meaning:space.NORMALIZED_MEAN,normalization:space.NORMALIZATION}));
 }
 assert.equal(kernel.stats().calls,0);
 const context={schemaVersion:1,contextId:'metadata-only-fixture',inputId:'synthetic-old128',inputSha256:'b'.repeat(64),
  slotId:'diagnostic',sourceFrameIndices:[0,1,2,3,4],sourceFrameTimesSeconds:[0,.1,.2,.3,.4]};
 const old={dtype:'float32',layout:'NCTHW',meaning:'raw-posterior-mean',shape:[1,16,2,2,2],
  modelSha256:interop.WAN21_VAE_SHA256,data:Float32Array.from({length:128},(_,i)=>(i-64)/32),context};
 const normalized=kernel.normalizeRawMean(old),restored=kernel.restoreRawMean(normalized);
 let maxAbs=0;for(let i=0;i<128;i++)maxAbs=Math.max(maxAbs,Math.abs(old.data[i]-restored.data[i]));
 assert.ok(maxAbs<=2e-6);assert.equal(kernel.stats().calls,2);
 const saved=await interop.encodeWanRawLatent(old),readback=await interop.decodeWanRawLatent(saved);
 const text={dtype:'float32',layout:'BLC',meaning:'text_hidden_states',shape:[1,2,4096],data:new Float32Array(8192),
  modelSha256:interop.WAN_TEXT_ENCODER_SHA256,attentionMask:Uint8Array.of(1,0),tokenizerSha256:'e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458'};
 const textRead=await interop.decodeWanConditioning(await interop.encodeWanConditioning(text));
 report.old128Math={passed:true,maxAbs,gate:2e-6,calls:kernel.stats().calls,fixture:'synthetic original profile; no actual rectangle reshape'};
 report.metadataObservations={contextAfterNormalize:normalized.context??null,contextAfterRestore:restored.context??null,
  contextAfterSaveRead:readback.context??null,tokenizerAfterConditioningSaveRead:textRead.tokenizerSha256??null,
  maskAfterConditioningSaveRead:Array.from(textRead.attentionMask),jointPreservation:false};
 assert.equal(normalized.context,undefined);assert.equal(restored.context,undefined);assert.equal(readback.context,undefined);
 assert.equal(textRead.tokenizerSha256,undefined);assert.deepEqual(Array.from(textRead.attentionMask),[1,0]);
 report.boundaryChecksPassed=true;report.readiness='new profiles unsupported; metadata-preserving joint edge blocked';
}finally{kernel.dispose();}
fs.mkdirSync(path.dirname(path.resolve(args['--output'])),{recursive:true});
fs.writeFileSync(args['--output'],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({boundaryChecksPassed:report.boundaryChecksPassed,readiness:report.readiness,metadata:report.metadataObservations},null,2));

// NN0 metadata/codec fixture. Imports the exact native tensor codec, never VAE/ORT.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {pathToFileURL} from 'node:url';

globalThis.crypto??=webcrypto;
const directory='/tmp/kw-vae-source81-alias-20261102';
const info=JSON.parse(await fs.readFile(directory+'/artifact-identity.json','utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const codecBytes=await fs.readFile(info.nativeCodec.path);
assert.equal(codecBytes.length,info.nativeCodec.bytes);
assert.equal(sha(codecBytes),info.nativeCodec.sha256);
const {decodeTensor,encodeTensor,describeTensor}=await import(pathToFileURL(info.nativeCodec.path).href);
const originalBytes=await fs.readFile(info.actualMeanWktPath);
const originalFileSha=sha(originalBytes);
const original=await decodeTensor(new Uint8Array(originalBytes.buffer,originalBytes.byteOffset,originalBytes.byteLength));
assert.deepEqual(original.shape,[1,16,21,60,104]);
assert.equal(original.dtype,'float32');assert.equal(original.layout,'NCTHW');
assert.equal(original.meaning,'raw-posterior-mean');assert.equal(original.modelSha256,info.modelSha256);
assert.equal(Object.hasOwn(original,'normalization'),false);assert.equal(Object.hasOwn(original,'latentContract'),false);
const originalDescriptor=describeTensor(original);
const originalHeaderLength=originalBytes.readUInt32LE(8);
const originalHeader=JSON.parse(originalBytes.subarray(12,12+originalHeaderLength).toString('utf8'));
const payload=new Uint8Array(original.data.buffer,original.data.byteOffset,original.data.byteLength);
assert.equal(sha(payload),originalHeader.dataSha256);
assert.equal(original.data.length,2096640);assert.equal(payload.byteLength,8386560);

// Full all-value comparison with independent original-source mean, not a new NN.
const referenceBytes=await fs.readFile(info.independentSource81MeanPath);
const meanPair=info.artifactPairs.find(value=>value.operation==='encode'&&value.kind==='output');
assert.equal(referenceBytes.length,payload.byteLength);
assert.equal(sha(referenceBytes),meanPair.recordedSource81Sha256);
const reference=new DataView(referenceBytes.buffer,referenceBytes.byteOffset,referenceBytes.byteLength);
const gate=info.comparisonGate;
assert.equal(gate.atol,.002);assert.equal(gate.rtol,.002);assert.equal(gate.maxAbs,.002);
let maxAbs=0,squared=0,finite=true,failed=0,firstFailed=null;
for(let i=0;i<original.data.length;i++){
 const actual=original.data[i],expected=reference.getFloat32(i*4,true),error=Math.abs(actual-expected);
 if(!Number.isFinite(actual)||!Number.isFinite(expected))finite=false;
 if(!Number.isFinite(error)||error>gate.atol+gate.rtol*Math.abs(expected)){failed++;firstFailed??=i;}
 maxAbs=Math.max(maxAbs,error);squared+=error*error;
}
assert.equal(finite,true);assert.equal(failed,0);assert.ok(maxAbs<=gate.maxAbs);

// Only identifiers/role are synthetic; all81 original mapping entries/times stay.
assert.equal(original.context.sourceFrameIndices.length,81);
assert.equal(original.context.sourceFrameTimesSeconds.length,81);
assert.ok(new Set(original.context.sourceFrameIndices).size<81,'Actual duplicate mapping required');
assert.deepEqual(original.frameProcessing.sourceContext,original.context);
const syntheticContext={...structuredClone(original.context),
 contextId:'nn0-synthetic-source81-role-fixture',
 inputId:'synthetic-source81-alias-metadata-only',slotId:'source'};
const fixture={...original,context:syntheticContext,
 frameProcessing:{...structuredClone(original.frameProcessing),sourceContext:structuredClone(syntheticContext)}};
assert.equal(fixture.frameProcessing.sourceFrames,81);assert.equal(fixture.frameProcessing.latentFrames,21);
assert.equal(fixture.frameProcessing.consumedFrames,81);assert.equal(fixture.frameProcessing.unusedTailFrames,0);
const expectedDescriptor=describeTensor(fixture);
const serialized=await encodeTensor(fixture);
const restored=await decodeTensor(serialized);
assert.deepEqual(describeTensor(restored),expectedDescriptor);
assert.deepEqual(restored.context.sourceFrameIndices,original.context.sourceFrameIndices);
assert.deepEqual(restored.context.sourceFrameTimesSeconds,original.context.sourceFrameTimesSeconds);
assert.deepEqual(restored.frameProcessing.sourceContext,syntheticContext);
assert.equal(restored.meaning,original.meaning);assert.equal(restored.modelSha256,original.modelSha256);
assert.equal(Object.hasOwn(restored,'normalization'),Object.hasOwn(original,'normalization'));
let exact=0;
for(let i=0;i<original.data.length;i++){assert.ok(Object.is(restored.data[i],original.data[i]));exact++;}
const restoredPayload=new Uint8Array(restored.data.buffer,restored.data.byteOffset,restored.data.byteLength);
assert.equal(sha(restoredPayload),originalHeader.dataSha256);
assert.deepEqual(describeTensor(original),originalDescriptor,'Original target metadata was mutated');
assert.equal(sha(await fs.readFile(info.actualMeanWktPath)),originalFileSha,'Original target WKT changed');
assert.equal(sha(await fs.readFile(info.manifestObservation.path)),info.manifestObservation.sha256,'Manifest changed');
const fixturePath=directory+'/source81-role-fixture.wktensor';
await fs.writeFile(fixturePath,serialized,{flag:'wx'});
const savedBytes=await fs.readFile(fixturePath);
const saved=await decodeTensor(new Uint8Array(savedBytes.buffer,savedBytes.byteOffset,savedBytes.byteLength));
assert.deepEqual(describeTensor(saved),expectedDescriptor);
for(let i=0;i<original.data.length;i++)assert.ok(Object.is(saved.data[i],original.data[i]));
const scriptBytes=await fs.readFile(new URL(import.meta.url));
const duplicatePositions=[];
for(let i=0;i<restored.context.sourceFrameIndices.length;i++){
 const frame=restored.context.sourceFrameIndices[i],earlier=restored.context.sourceFrameIndices.indexOf(frame);
 if(earlier<i)duplicatePositions.push({sourceFrameIndex:frame,positions:[earlier,i]});
}
const proof={schemaVersion:1,status:'PASS_NN0_NUMERIC_ALIAS_AND_SYNTHETIC_CODEC_FIXTURE',passed:true,
 newNNRuns:0,newSourceRoleInferenceInvocations:0,graphsImported:false,ortImported:false,
 finalTargetAcceptanceClaimed:false,thread4OrCoiEnvironmentTested:false,crossOriginIsolationManipulated:false,
 productionOrToolOrGraphEdits:false,manifestMutated:false,
 scope:'Numeric-evidence reuse from the existing real target81 mean plus an explicitly synthetic source-role metadata fixture through the exact native codec. No new source-role NN invocation, no target decode check, no final target acceptance.',
 nativeCodec:info.nativeCodec,nodeVersion:process.version,
 privateFixtureRunner:{path:directory+'/codec-fixture.mjs',bytes:scriptBytes.length,sha256:sha(scriptBytes)},
 parentNativeReport:info.parentNativeReport,derivedSource81Report:info.derivedSource81Report,
 modelSha256:info.modelSha256,originalVendorSource:info.originalVendorSource,
 actualProducerRevision:info.actualProducerRevision,referenceArtifactPairs:info.artifactPairs,
 actualMean:{path:info.actualMeanWktPath,bytes:originalBytes.length,sha256:originalFileSha,
  payloadBytes:payload.byteLength,payloadSha256:originalHeader.dataSha256,elements:original.data.length,
  descriptor:originalDescriptor},
 independentSource81MeanComparison:{passed:true,elements:original.data.length,allValuesCompared:true,
  allFinite:finite,failedAllcloseElements:failed,firstFailedElement:firstFailed,maxAbs,
  rmse:Math.sqrt(squared/original.data.length),gate,referenceSha256:sha(referenceBytes)},
 syntheticRoleFixture:{path:fixturePath,bytes:savedBytes.length,sha256:sha(savedBytes),
  payloadBytes:restoredPayload.byteLength,payloadSha256:sha(restoredPayload),
  allValueBitwiseExactCount:exact,allValuesBitwiseExact:true,savedFileReadbackAllValuesBitwiseExact:true,
  descriptor:describeTensor(saved),syntheticFields:['context.contextId','context.inputId','context.slotId',
   'frameProcessing.sourceContext.contextId','frameProcessing.sourceContext.inputId','frameProcessing.sourceContext.slotId'],
  frameIndicesCount:81,frameTimesCount:81,duplicatesPreserved:duplicatePositions,
  contextMappingPreserved:true,sourceContextPreserved:true,meaningPreserved:true,modelHashPreserved:true,
  normalizationPresencePreserved:true,normalizationPresent:false},
 manifestObservation:info.manifestObservation,
 limitations:['Source-role identifiers are synthetic metadata, not a separately executed source81 inference.',
  'Target81 decode and final combined acceptance are outside this NN0 proof.',
  'The large RGB input/reference artifacts were not rehashed here; their recorded native-parent hashes and actual hardlink identities were checked.',
  'No physical-media, BF16-arithmetic, threads4, COI, resource-peak or generated-sample claim is added.']};
await fs.writeFile(directory+'/proof.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,newNNRuns:0,proof:directory+'/proof.json',
 fixture:proof.syntheticRoleFixture.path,fixtureBytes:proof.syntheticRoleFixture.bytes,
 fixtureSha256:proof.syntheticRoleFixture.sha256,payloadSha256:proof.syntheticRoleFixture.payloadSha256,
 allValuesBitwiseExact:exact,independentMeanMaxAbs:maxAbs,codecSourceRevision:info.nativeCodec.gitRevision}));

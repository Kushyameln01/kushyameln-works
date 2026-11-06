// NN0 replay. Keep original model/source/PASS fields; change observer transport
// only. Decompress an existing .json.gz when needed, never rerun a model.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {parseArgs} from 'node:util';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compactReportObservations,restoreObservation} from './observation-archive.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const {values}=parseArgs({options:{input:{type:'string'},output:{type:'string'}}});
if(!values.input||!values.output)throw TypeError('--input existing result.json[.gz] and --output fresh private directory required');
const started=performance.now(),inputPath=resolve(values.input),output=resolve(values.output);
await mkdir(output,{recursive:false});
const input=await readFile(inputPath),isGzip=input[0]===31&&input[1]===139;
let raw=isGzip?gunzipSync(input):input;
const originalBytes=raw.length,originalSha256=sha(raw),original=JSON.parse(raw.toString('utf8'));raw=null;
const packed=compactReportObservations(original),encoded=Buffer.from(JSON.stringify(packed)),wire=JSON.parse(encoded);
const getNative=report=>Array.isArray(report.native?.workers)?report.native:report;
const oldNative=getNative(original),newNative=getNative(wire);
assert.equal(newNative.workers.length,oldNative.workers.length);
const {workers:oldWorkers,...oldRest}=oldNative,{workers:newWorkers,...newRest}=newNative;
assert.deepEqual(newRest,oldRest,'Every non-observation native result/evidence field stays unchanged');
if(oldNative!==original){const {native:oldPart,...a}=original,{native:newPart,...b}=wire;assert.deepEqual(b,a,'Every outer report/source/resource field stays unchanged');}
const workers=[];
for(let i=0;i<oldWorkers.length;i++){
 const {observations:expected,...oldFields}=oldWorkers[i],{observations:archive,...newFields}=newWorkers[i];
 assert.deepEqual(newFields,oldFields);assert.equal(archive.observations.length,expected.length);
 // Check one complete original observation at a time. This is equivalent to
 // full deep equality but avoids materializing a second hundreds-of-MiB tree.
 const expectedHash=createHash('sha256'),restoredHash=createHash('sha256');
 for(let index=0;index<expected.length;index++){
  const restored=restoreObservation(archive,index);assert.deepEqual(restored,expected[index]);
  expectedHash.update(JSON.stringify(expected[index])+'\n');restoredHash.update(JSON.stringify(restored)+'\n');
 }
 const originalSequenceSha256=expectedHash.digest('hex'),restoredSequenceSha256=restoredHash.digest('hex');
 assert.equal(restoredSequenceSha256,originalSequenceSha256,'Original observation order and JSON metadata are exact');
 workers.push({index:i,phase:oldWorkers[i].phase,observations:expected.length,sessionMetadataRecords:archive.sessionMetadata.length,prefixReferences:archive.sessionReferences.filter(n=>Number.isSafeInteger(n)).length,explicitReferences:archive.sessionReferences.filter(Array.isArray).length,deepEqual:true,originalSequenceSha256,restoredSequenceSha256});
}
const compressed=gzipSync(encoded,{level:9,mtime:0});await writeFile(join(output,'result.compact.json.gz'),compressed,{flag:'wx'});
const sources=[];for(const path of ['observation-archive.mjs','replay-observations.mjs']){const url=new URL(path,import.meta.url),bytes=await readFile(url);sources.push({path:fileURLToPath(url),bytes:bytes.length,sha256:sha(bytes)});}
const receipt={passed:true,scope:'Lossless diagnostic observation transport replay; every event/count/boundary/cancel field and all session metadata verified; no numerical/model change',originalExecutionSourceSha:original.executionSourceSha??oldNative.executionSourceSha??null,originalPassed:original.passed,originalNativePassed:oldNative.passed,newNeuralRuns:0,newExports:0,input:{path:inputPath,bytes:input.length,sha256:sha(input),gzip:isGzip,jsonBytes:originalBytes,jsonSha256:originalSha256},compacted:{path:'result.compact.json.gz',bytes:compressed.length,sha256:sha(compressed),jsonBytes:encoded.length,jsonSha256:sha(encoded),jsonReductionFraction:1-encoded.length/originalBytes},verification:{allNonObservationFieldsDeepEqual:true,allObservationsDeepEqual:true,fullOriginalSequenceHashesEqual:true,method:'Per-observation complete deepEqual and ordered JSON hash; every remaining worker/native/report field deepEqual'},workers,sources,wallSeconds:(performance.now()-started)/1000,processResources:{...process.resourceUsage(),rssBytes:process.memoryUsage().rss}};
await writeFile(join(output,'replay-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,newNeuralRuns:0,inputJsonBytes:originalBytes,compactJsonBytes:encoded.length,compactGzipBytes:compressed.length,observations:workers.reduce((n,w)=>n+w.observations,0),sessionMetadataRecords:workers.reduce((n,w)=>n+w.sessionMetadataRecords,0),wallSeconds:receipt.wallSeconds}));

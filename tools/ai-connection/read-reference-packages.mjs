#!/usr/bin/env node
// Read the four distributed diagnostic packages using the unchanged E4 reader.
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {readArtifactPackage} from '../../docs/shared/ai-connection/package.mjs';
import {sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';

const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--codec')throw TypeError('Usage: node tools/ai-connection/read-reference-packages.mjs --codec <855f435-root>/docs/shared/inference/tensor.mjs');
const codecPath=resolve(args[1]),digest='4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b';
if(await sha256Bytes(new Uint8Array(await readFile(codecPath)))!==digest)throw Error('Actual codec bytes differ from the fixed source');
const {decodeTensor}=await import(pathToFileURL(codecPath).href);
const source={repository:'Kushyameln01/kushyameln-works',commit:'855f435120f08eb9e818e51281fc26f0e2633829',path:'docs/shared/inference/tensor.mjs'};
const registry={schemas:[
 {schemaId:'works:p2:g1c-metadata',schemaVersion:'1'},
 {schemaId:'works:p2:raw-posterior-mean',schemaVersion:'1',nativeMeanings:['raw-posterior-mean']},
 {schemaId:'works:p2:raw-decoder-rgb',schemaVersion:'1',nativeMeanings:['raw-decoder-rgb']},
 {schemaId:'works:p2-scope',schemaVersion:'1'},
 {schemaId:'works:diagnostic-wktensor-metadata',schemaVersion:'1'},
 {schemaId:'works:diagnostic-q-projection',schemaVersion:'1',nativeMeanings:['works:diagnostic-q-projection:v1']},
 ...['works:diagnostic-application-envelope','works:diagnostic-base-evidence','works:diagnostic-scope','works:local-input-reference'].map(schemaId=>({schemaId,schemaVersion:'1'}))
],roles:[],codecs:[source,{...source,repository:'https://github.com/Kushyameln01/kushyameln-works',sha256:digest}].map(sourceRef=>({codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef,decode:decodeTensor}))};
const reports=[];
for(const name of ['rect-raw-mean','rect-restored-mean','received-owner-rgb','snapshot-candidate']){
 const root=fileURLToPath(new URL(`../../development/ai-connection/reference-adoption/fixtures/${name}/`,import.meta.url));
 const result=await readArtifactPackage({async read(path){const file=resolve(root,path);if(!file.startsWith(root.endsWith(sep)?root:root+sep))throw Error('Storage path escapes package');try{return new Uint8Array(await readFile(file));}catch(e){if(e.code==='ENOENT')return null;throw e;}}},registry);
 if(result.status!=='complete')throw Error('Diagnostic package did not restore completely: '+name);
 reports.push({name,status:result.status,manifestSha256:result.receipt.manifestSha256,artifactId:result.artifacts[0].descriptor.artifactId,snapshotId:result.artifacts[0].descriptor.snapshotId,generationAccepted:false});
}
process.stdout.write(JSON.stringify({status:'PASS',scope:'distributed diagnostic package integrity/readback only',packages:reports},null,2)+'\n');

#!/usr/bin/env node
// Read only the newly published original package. Never call its builder/writer.
import fs from 'node:fs/promises';
import {writeSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];
if(!args.repo||!args.received)throw Error('--repo and --received are required');
const repo=path.resolve(args.repo),received=path.resolve(args.received),source='8849891f19124df31847bd691503c2491278eaa8',distribution='c4860579d01d9f704cb16714e364a22668f9d57e';
const base='development/ai-connection/lora-p4-adapter/manager-884/e4-output16',directory=path.join(received,base),sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...argv)=>{const r=spawnSync('git',argv,{cwd:repo,maxBuffer:64*1024*1024});if(r.status!==0)throw Error('Fixed source object read failed');return r.stdout;};
const assert=(v,m)=>{if(!v)throw Error(m);};
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'p3-fixed-reader-')),moduleSources=[],seen=new Set();
async function materialize(p){
 if(seen.has(p))return;seen.add(p);const b=git('show',source+':'+p),destination=path.join(temporary,p);await fs.mkdir(path.dirname(destination),{recursive:true,mode:0o700});await fs.writeFile(destination,b,{mode:0o600,flag:'wx'});
 moduleSources.push({commit:source,path:p,byteLength:b.length,sha256:sha(b),gitObjectId:git('rev-parse',source+':'+p).toString().trim()});
 if(p.endsWith('.mjs'))for(const m of b.toString().matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g))await materialize(path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1])));
}
try{
 for(const p of ['docs/shared/ai-connection/package.mjs','docs/shared/ai-connection/diagnostic-package.mjs','docs/shared/ai-connection/codecs/wktensor.mjs'])await materialize(p);
 const {readArtifactPackage}=await import(pathToFileURL(path.join(temporary,'docs/shared/ai-connection/package.mjs'))),{DIAGNOSTIC_OUTPUT_MEANING}=await import(pathToFileURL(path.join(temporary,'docs/shared/ai-connection/diagnostic-package.mjs'))),{createAdoptedWktensorCodec,verifyAdoptedWktensorSource}=await import(pathToFileURL(path.join(temporary,'docs/shared/ai-connection/codecs/wktensor.mjs')));
 const codecBytes=git('show',source+':docs/shared/ai-connection/codecs/tensor-2bdca59.mjs'),origin=git('show','2bdca59ea78580d4fe7a9d31a8de33209b64d029:docs/shared/inference/tensor.mjs');assert(codecBytes.equals(origin),'Codec origin/deployment changed');const codecProof=await verifyAdoptedWktensorSource(new Uint8Array(codecBytes)),codec=createAdoptedWktensorCodec();
 const delivery=JSON.parse(await fs.readFile(path.join(directory,'DELIVERY.json'),'utf8')),before=[];
 for(const f of delivery.packageFiles){const b=await fs.readFile(path.join(directory,f.path));assert(b.length===f.byteLength&&sha(b)===f.sha256&&b.equals(git('show',distribution+':'+base+'/'+f.path)),'Acquired package file does not match original published bytes');before.push({path:base+'/'+f.path,byteLength:b.length,sha256:sha(b)});}
 assert(before.length===8&&before.reduce((n,f)=>n+f.byteLength,0)===32171,'Eight original files required');
 const extensions=JSON.parse(await fs.readFile(path.join(directory,'extensions.json'),'utf8'));
 // Exact existing helper registration, over its already-saved extensions;
 // codec implementation is the unchanged adopted2bd export above.
 const registry={schemas:[{schemaId:'works:diagnostic-wktensor-metadata',schemaVersion:'1'},{schemaId:'works:diagnostic-q-projection',schemaVersion:'1',nativeMeanings:[DIAGNOSTIC_OUTPUT_MEANING]},...Object.values(extensions).map(e=>({schemaId:e.schemaId,schemaVersion:e.schemaVersion}))],roles:[],codecs:[{codecId:codec.codecId,codecVersion:codec.codecVersion,sourceRef:codec.sourceRef,decode:codec.decode}]};
 const reads=[];
 const reader=(mode='complete')=>({async read(p){assert(/^[A-Za-z0-9_.-]+$/.test(p),'Unsafe relative package path');if(mode==='missing-snapshot'&&p==='snapshot.json')return null;try{const b=new Uint8Array(await fs.readFile(path.join(directory,p)));reads.push({mode,path:p,byteLength:b.length});if(mode==='tampered'&&p.endsWith('.wktensor')){const changed=new Uint8Array(b);changed[changed.length-1]^=1;return changed;}return b;}catch(e){if(e.code==='ENOENT')return null;throw e;}}});
 const restored=await readArtifactPackage(reader(),registry),artifact=restored.artifacts[0],outputHash=sha(new Uint8Array(artifact.native.data.buffer,artifact.native.data.byteOffset,artifact.native.data.byteLength));
 assert(restored.status==='complete'&&restored.artifacts.length===1&&artifact.native.data.byteLength===64&&artifact.native.data.length===16&&outputHash==='04f51332b6934ad9a8658f9b52a6aa7000733b7f4ad1d453c8c68bdcabdb3575','Actual output16 readback differs');
 assert(restored.receipt.manifestSha256==='6d12468c1ca1348f01f74e023ed09942ea622f25930c03a6fa0ee04d9bd18979'&&restored.receipt.manifestByteLength===2124&&artifact.snapshot.snapshotHash==='70052e13634e2218092ed167ac41800bf8a1c9ee77726b53592d9fc9870ae108','Actual historical snapshot/manifest differs');
 const refusal=async mode=>{try{await readArtifactPackage(reader(mode),registry);}catch(e){return {code:e.code,fieldPath:e.fieldPath??null};}throw Error('Expected refusal absent');};
 const tampered=await refusal('tampered'),missing=await refusal('missing-snapshot');assert(tampered.code==='ASSET_HASH_MISMATCH'&&missing.code==='REQUIRED_ASSET_MISSING','Reader refusal used wrong code');
 for(const f of before){const b=await fs.readFile(path.join(received,f.path));assert(sha(b)===f.sha256,'Original package bytes changed');}
 writeSync(1,JSON.stringify({schemaVersion:'management-c486-existing-p3-payload-readback/1',observedUTC:new Date().toISOString(),status:'PASS_FRESH_EXISTING_P3_PACKAGE_READBACK',sourceCommit:source,distributionCommit:distribution,scope:'New receiver readback of original eight published884 package files; separate from prior metadata-only acquisition',files:before,sourceModules:moduleSources,codecProof,registryAuthority:'Existing diagnostic-package.mjs registration over saved extension metadata; no replacement codec',readback:{status:restored.status,artifactCount:restored.artifacts.length,outputByteLength:artifact.native.data.byteLength,outputValues:artifact.native.data.length,outputSha256:outputHash,meaning:artifact.native.meaning,shape:artifact.native.shape,layout:artifact.native.layout,snapshotId:artifact.snapshot.snapshotId,snapshotHash:artifact.snapshot.snapshotHash,manifestReceipt:restored.receipt},tampered,missingSnapshot:missing,readOperations:reads,negativeMethod:'Fresh filesystem-reader returned-byte clone altered / snapshot result omitted; original files unchanged',originalFilesUnchanged:true,packageBuilderCalls:0,packageWriterCalls:0,nativePrepareCalls:0,neuralExecutions:0,modelExports:0,fileWholeHashes:0,livePublicationBrandRecreated:false,currentLiveAdmission:false,generationReady:false},null,2)+'\n');
}finally{await fs.rm(temporary,{recursive:true,force:true});}

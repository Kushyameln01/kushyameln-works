#!/usr/bin/env node
// Receiver-only acceptance: existing strict mean profiles and real LoRA PARTIAL
// transactions share a browser. Private input ranges never become HTTP assets.
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const EXPECTED_ARTIFACT_BYTES=709364,EXPECTED_ARTIFACT_SHA='25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff';
const PRIOR_ACCEPTED_COMMIT='0c27874908638afc748ea2455a2779a16736730b';
const HELP='node tools/ai-connection/test-lora-nonrect.mjs --peer-root <fixed peer checkout> --peer-commit <40hex> --artifact <private base-blocks.json> --reference-root <prior e1-joint directory> --lora-root <original folder> --out <new private evidence directory>';
const argv=process.argv.slice(2),args={};
if(argv.length===1&&argv[0]==='--help'){console.log(HELP);process.exit(0);}
const keys=['peer-root','peer-commit','artifact','reference-root','lora-root','out'];
for(let i=0;i<argv.length;i+=2){const key=argv[i].slice(2);if(!argv[i].startsWith('--')||!keys.includes(key)||!argv[i+1]||Object.hasOwn(args,key))throw Error('Explicit unique known argument/value required: '+HELP);args[key]=argv[i+1];}
for(const k of keys)if(!args[k])throw Error('Missing --'+k);
if(!/^[a-f0-9]{40}$/.test(args['peer-commit']))throw Error('Complete pinned peer commit required');
const peerRoot=await fsp.realpath(args['peer-root']),artifactPath=await fsp.realpath(args.artifact),referenceRoot=await fsp.realpath(args['reference-root']),loraRoot=await fsp.realpath(args['lora-root']),out=path.resolve(args.out);
const within=(p,base)=>p===base||p.startsWith(base+path.sep),sha=b=>createHash('sha256').update(b).digest('hex');
if(within(artifactPath,root)||within(artifactPath,peerRoot)||within(out,root)||within(out,peerRoot)||within(out,referenceRoot))throw Error('Private artifact and new evidence must remain outside source/reference repositories');
await fsp.mkdir(out,{recursive:true,mode:0o700});
if((await fsp.readdir(out)).length)throw Error('Use a new empty evidence directory; retain earlier trials');
await fsp.chmod(out,0o700);const actualDir=path.join(out,'actual');await fsp.mkdir(actualDir,{mode:0o700});
const artifactStat=await fsp.stat(artifactPath,{bigint:true});
if(!artifactStat.isFile()||Number(artifactStat.mode)&0o077)throw Error('Private artifact must be a regular file without group/other access');
const artifactBytes=await fsp.readFile(artifactPath);
if(artifactBytes.length!==EXPECTED_ARTIFACT_BYTES||sha(artifactBytes)!==EXPECTED_ARTIFACT_SHA)throw Error('Owner-delivered artifact bytes/SHA mismatch');
const artifact=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(artifactBytes));
if(artifact.schemaVersion!=='bernini-diagnostic-base-block/0.1'||artifact.scope!=='PARTIAL'||artifact.fullFileHashRecomputed!==false)throw Error('Explicit bounded artifact required');
const git=(...a)=>execFileSync('git',a,{cwd:root,maxBuffer:32*1024*1024}),sourceCommit=git('rev-parse','HEAD').toString().trim(),pinned=(commit,repoPath)=>git('show',commit+':'+repoPath);
const runnerPath='tools/ai-connection/test-lora-nonrect.mjs',runnerBytes=await fsp.readFile(fileURLToPath(import.meta.url));
if(!runnerBytes.equals(pinned(sourceCommit,runnerPath)))throw Error('Commit this acceptance runner before actual execution');
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const references={},referenceFiles=new Map(),referenceProof=[];
const rangeNames={header:null,'q.weight':'blocks.0.self_attn.q.weight','q.bias':'blocks.0.self_attn.q.bias',weight_scale:'blocks.0.self_attn.q.weight_scale',comfy_quant:'blocks.0.self_attn.q.comfy_quant'};
const rangeIds=Object.keys(rangeNames),rangeLengths=[181280,81920,32,4,27];
const gate={baseDecode:{absolute:0,relative:0},weight:{absolute:1e-5,relative:1e-4},bias:{absolute:0,relative:0},projection:{absolute:1e-6,relative:1e-5}};
for(const side of ['HIGH','LOW']){
 const folder=path.join(referenceRoot,side+'-fixed'),refDir=path.join(folder,'reference'),referenceBytes=await fsp.readFile(path.join(refDir,'reference.json')),reference=JSON.parse(referenceBytes),oldBytes=await fsp.readFile(path.join(folder,'result.json')),old=JSON.parse(oldBytes),provided=artifact.sides?.[side];
 if(!referenceBytes.equals(pinned(PRIOR_ACCEPTED_COMMIT,'development/ai-connection/evidence/lora-e1/'+side+'-reference.json'))||!oldBytes.equals(pinned(PRIOR_ACCEPTED_COMMIT,'development/ai-connection/evidence/lora-e1/'+side+'-result.json')))throw Error('Retained independent reference/receipt differs from fixed accepted commit');
 if(reference.side!==side||old.status!=='PASS_DIAGNOSTIC_PARTIAL'||!provided||!same(reference.gates,gate)||reference.cases.length!==6)throw Error('Prior independently accepted reference identity/gates required');
 if(provided.source.modelSha256!==reference.baseIdentity.expectedFullSha256||provided.source.modelSha256!==old.baseAcquisitionReceipt.actualSHA256||!same(provided.registry,old.binding.nativeRegistry))throw Error('Artifact model/registry differs from previously accepted original base');
 if(provided.ranges?.length!==5)throw Error('Five original bounded ranges required');
 const ranges=provided.ranges.map((r,i)=>{const raw=Buffer.from(r.data,'base64'),key=rangeNames[r.id],prior=key?reference.inputRanges.find(v=>v.name===key)?.sha256:reference.baseIdentity.headerSha256;
  if(r.id!==rangeIds[i]||r.byteLength!==rangeLengths[i]||raw.length!==r.byteLength||raw.toString('base64')!==r.data||sha(raw)!==r.sha256||prior!==r.sha256)throw Error('Bounded input differs from prior original reference: '+side+'/'+r.id);
  return {id:r.id,absoluteByteOffset:r.absoluteByteOffset,bytes:r.byteLength,sha256:r.sha256,priorReferenceRangeEqual:true};
 });
 if(ranges[0].absoluteByteOffset!==8||ranges[0].sha256!==provided.registry.baseVerification.headerSHA256)throw Error('Original header identity differs');
 const records=[reference.activation,reference.baseWeight,reference.baseBias,...reference.cases.flatMap(c=>[c.weight,c.bias])];
 for(const r of records){if(!/^[A-Za-z0-9_.-]+$/.test(r.file))throw Error('Invalid reference path');const bytes=await fsp.readFile(path.join(refDir,r.file));if(bytes.length!==r.bytes||sha(bytes)!==r.sha256)throw Error('Independent reference array changed');referenceFiles.set(side+'/'+r.file,bytes);}
 for(const pair of ['light','detail'])if(!same(reference.cases.filter(c=>c.pairId===pair).map(c=>c.strength),[0,1,-1]))throw Error('Predeclared strengths changed');
 references[side]=reference;referenceProof.push({side,referenceJSONSHA256:sha(referenceBytes),priorTrialSourceCommit:old.loraSourceCommit,priorModelAcquisitionStatus:old.baseAcquisitionReceipt.status,priorModelFullFileVerified:old.baseAcquisitionReceipt.fullFileVerified,priorModelReceiptIsHistorical:true,modelSha256:provided.source.modelSha256,nativeRegistryHash:provided.registry.registryHash,ranges,reusedIndependentReference:true});
}
const sourceRecords=new Map(),serverErrors=[],requests=[];let selectedSide=null;
const allowedDevelopment=new Set(['ai-connection/e6/source/g1c-tensor.mjs',...['f1','rect'].flatMap(n=>['manifest.json','mean.wktensor'].map(s=>'ai-connection/e6/received-7e091/'+n+'-'+s))]);
const serve=async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/acceptance'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><input id="artifact" type="file"><input id="loras" type="file" multiple>');return;}
  if(pathname.startsWith('/artifact/')&&req.method==='POST'){
   const name=pathname.slice('/artifact/'.length);if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error('Unsafe output name');let size=0;const chunks=[];
   for await(const c of req){size+=c.length;if(size>2*1024*1024)throw Error('Selected evidence output budget exceeded');chunks.push(c);}
   await fsp.writeFile(path.join(actualDir,name),Buffer.concat(chunks),{mode:0o600});res.end('saved privately');return;
  }
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  if(pathname.startsWith('/reference/')){const name=pathname.slice('/reference/'.length);if(!selectedSide||!referenceFiles.has(selectedSide+'/'+name)){res.writeHead(404).end();return;}res.setHeader('Content-Type','application/octet-stream');res.end(referenceFiles.get(selectedSide+'/'+name));return;}
  let base,relative,commit,repoPath;
  if(pathname.startsWith('/peer/shared/')){base=path.join(peerRoot,'docs/shared');relative=pathname.slice('/peer/shared/'.length);commit=args['peer-commit'];repoPath='docs/shared/'+relative;}
  else if(pathname.startsWith('/peer/development/')){base=path.join(peerRoot,'development');relative=pathname.slice('/peer/development/'.length);if(!allowedDevelopment.has(relative)){res.writeHead(404).end();return;}commit=args['peer-commit'];repoPath='development/'+relative;}
  else if(pathname.startsWith('/our/shared/')){base=path.join(root,'docs/shared');relative=pathname.slice('/our/shared/'.length);commit=sourceCommit;repoPath='docs/shared/'+relative;}
  else if(pathname==='/runner/joint-browser-cases.mjs'){base=here;relative='joint-browser-cases.mjs';commit=sourceCommit;repoPath='tools/ai-connection/'+relative;}
  else{res.writeHead(404).end();return;}
  const file=path.resolve(base,relative);if(!within(file,path.resolve(base))||file===path.resolve(base))throw Error('Unsafe source path');
  const bytes=await fsp.readFile(file);if(!bytes.equals(pinned(commit,repoPath)))throw Error('Loaded source differs from pinned Git blob: '+repoPath);
  sourceRecords.set(commit+':'+repoPath,{commit,path:repoPath,bytes:bytes.length,sha256:sha(bytes)});
  const ext=path.extname(file);res.setHeader('Content-Type',['.mjs','.js'].includes(ext)?'text/javascript':ext==='.wasm'?'application/wasm':ext==='.json'?'application/json':'application/octet-stream');res.end(bytes);
 }catch(error){serverErrors.push(String(error));res.writeHead(500).end('Pinned source request failed');}
};
const report={dateJST:'2026-10-31',scope:'Existing rectangular mean profile with real-original LoRA bounded PARTIAL transactions in one browser; no full model or generated sample',status:'RUNNING',loraSourceCommit:sourceCommit,peerCommit:args['peer-commit'],priorAcceptedReceiptCommit:PRIOR_ACCEPTED_COMMIT,runnerSourceSHA256:sha(runnerBytes),artifact:{bytes:artifactBytes.length,sha256:sha(artifactBytes),mode:Number(artifactStat.mode&0o777n).toString(8),scope:'PARTIAL',fullFileHashRecomputed:false},referenceProof,completeAdapter:false,generationReady:false,snapshotPublished:false,modelInference:false,nativeAPI:null,meanBefore:null,meanAfter:null,joint:[]};
const server=http.createServer((req,res)=>{void serve(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=require(process.env.LORA_PLAYWRIGHT_MODULE??'/opt/codex/cua_node/lib/node_modules/playwright');let browser;
const snapshot=async()=>{report.loadedSources=[...sourceRecords.values()].sort((a,b)=>(a.commit+':'+a.path).localeCompare(b.commit+':'+b.path));report.serverErrors=[...serverErrors];await fsp.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.LORA_CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});report.browser=browser.version();const page=await browser.newPage();report.pageErrors=[];
 page.on('pageerror',e=>report.pageErrors.push(String(e)));page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('console',m=>{if(m.text().startsWith('JOINT '))console.log(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/acceptance`);await page.locator('#artifact').setInputFiles(artifactPath);
 const inventory=JSON.parse(await fsp.readFile(path.join(root,'development/lora/contracts/original-inventory.json'),'utf8'));
 const files=inventory.map(x=>path.join(loraRoot,x.pairId+'-safetensors',x.fileName));if(files.length!==4)throw Error('Exactly four original LoRA paths required');await page.locator('#loras').setInputFiles(files);
 report.nativeAPI=await page.evaluate(async()=>{const {runE6API}=await import('/peer/shared/diffusion-models/api/test/e6-cases.mjs');return runE6API();});
 if(report.nativeAPI.passed!==true||report.nativeAPI.cases.length!==4)throw Error('Native existing-profile API boundary failed');
 const runMean=()=>page.evaluate(async()=>{const [{runRectCases},metadataCodec]=await Promise.all([import('/peer/shared/diffusion-models/latent-space/test-rect-cases.mjs'),import('/peer/development/ai-connection/e6/source/g1c-tensor.mjs')]);const read=async name=>{const url=name.startsWith('fixture/')?'/peer/development/ai-connection/e6/received-7e091/'+name.slice(8):'/peer/shared/diffusion-models/latent-space/'+name;const r=await fetch(url);if(!r.ok)throw Error('Mean source unavailable');return new Uint8Array(await r.arrayBuffer());};return runRectCases(read,{metadataCodec});});
 report.meanBefore=await runMean();await snapshot();
 for(const side of ['HIGH','LOW']){
  selectedSide=side;const reference=references[side];
  const joint=await page.evaluate(async({reference,expectedSHA,expectedBytes})=>{try{
   const file=document.querySelector('#artifact').files[0],bytes=await file.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==expectedBytes||digest!==expectedSHA)throw Error('Browser private artifact identity mismatch');const artifact=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   const [{runJointCases},{createBerniniBlockProvider}]=await Promise.all([import('/runner/joint-browser-cases.mjs'),import('/peer/shared/diffusion-models/lora/base-block.mjs')]);
   const names=new Set(reference.cases.map(c=>c.retainedOriginalIdentity.fileName)),loraFiles=[...document.querySelector('#loras').files].filter(f=>names.has(f.name));
   return runJointCases({loraFiles,reference,baseFactory:({side})=>createBerniniBlockProvider({artifact,side})});
  }catch(error){return {side:reference.side,status:'FAIL',error:String(error.stack||error)};}},{reference,expectedSHA:EXPECTED_ARTIFACT_SHA,expectedBytes:EXPECTED_ARTIFACT_BYTES});
  report.joint.push(joint);await snapshot();if(joint.status!=='PASS_DIAGNOSTIC_PARTIAL'||joint.cases.length!==10)throw Error('Actual original LoRA joint diagnostic failed: '+side);
 }
 report.meanAfter=await runMean();
 const fields=['profile','shape','fixtureFileSHA256','manifestSHA256','normalizedSHA256','restoredSHA256','maxRoundTripAbs'];
 const project=r=>r.outputs.map(o=>Object.fromEntries(fields.map(k=>[k,o[k]])));
 if(!same(project(report.meanBefore),project(report.meanAfter)))throw Error('Mean profile/shape/normalized/restored bytes changed across LoRA transactions');
 report.meanUnchangedAcrossLoRaTransactions=true;report.originalModelHTTPRequests=requests.filter(p=>p.includes('.safetensors'));report.privateArtifactHTTPGetRequests=requests.filter(p=>p.includes(path.basename(artifactPath)));
 const after=await fsp.stat(artifactPath,{bigint:true});report.artifactFileUnchangedAcrossTrial=['size','mtimeNs','ino','dev'].every(k=>String(after[k])===String(artifactStat[k]));
 if(report.pageErrors.length||serverErrors.length||report.originalModelHTTPRequests.length||report.privateArtifactHTTPGetRequests.length||!report.artifactFileUnchangedAcrossTrial)throw Error('Source/ownership/input-transport acceptance failed');
 report.status='PASS_EXISTING_RECT_MEAN_AND_PARTIAL_LORA';
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;}
finally{await snapshot();await browser?.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({status:report.status,jointCases:report.joint.reduce((n,r)=>n+(r.cases?.length??0),0),meanBeforeCases:report.meanBefore?.cases?.length,meanAfterCases:report.meanAfter?.cases?.length,nativeAPICases:report.nativeAPI?.cases?.length,result:path.join(out,'result.json'),error:report.error}));

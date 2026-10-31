#!/usr/bin/env node
// Receiver-only P3: one selected original File, bounded actual base, and pinned
// management/native owners. Inputs are picked locally, never HTTP assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const FIXED={manager:'edda43f9ea69c5b3ab1af3c6eb82295f2912887c',lora:'fc2789a0f649e33f15eb13750e6a983b5c52d170',diffusion:'5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3'};
const PRIOR='0c27874908638afc748ea2455a2779a16736730b',REPOSITORY='https://github.com/Kushyameln01/kushyameln-works';
const ARTIFACT={bytes:709364,sha256:'25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff'};
const usage='node tools/ai-connection/test-lora-managed-snapshot.mjs --manager-root <edda43 checkout> --lora-root <fc2789 checkout> --diffusion-root <5f880 checkout> --artifact <private base-blocks.json> --reference-root <HIGH-fixed/reference> --file <selected original.safetensors> --pair light --side HIGH --expected-sha256 <64hex> --out <new private evidence directory>';
const argv=process.argv.slice(2),args={},keys=['manager-root','lora-root','diffusion-root','artifact','reference-root','file','pair','side','expected-sha256','out'];
if(argv.length===1&&argv[0]==='--help'){console.log(usage);process.exit(0);}
for(let i=0;i<argv.length;i+=2){const key=argv[i].slice(2);if(!argv[i].startsWith('--')||!keys.includes(key)||!argv[i+1]||Object.hasOwn(args,key))throw Error('Explicit unique known argument/value required: '+usage);args[key]=argv[i+1];}
for(const key of keys)if(!args[key])throw Error('Missing --'+key+'\n'+usage);
if(args.pair!=='light'||args.side!=='HIGH'||!/^[a-f0-9]{64}$/.test(args['expected-sha256']))throw Error('This receiver trial explicitly accepts only light/HIGH and an expected whole-source SHA-256');
const roots=Object.fromEntries(await Promise.all(['manager','lora','diffusion'].map(async key=>[key,await fs.realpath(args[key+'-root'])])));
const artifactPath=await fs.realpath(args.artifact),referenceRoot=await fs.realpath(args['reference-root']),originalPath=await fs.realpath(args.file),outRequested=path.resolve(args.out);
const within=(p,r)=>p===r||p.startsWith(r+path.sep),sha=b=>createHash('sha256').update(b).digest('hex'),same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
function ordered(v){return Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;}
for(const r of [root,...Object.values(roots)])if(within(artifactPath,r)||within(originalPath,r)||within(outRequested,r))throw Error('Private inputs/output must stay outside all source repositories');
if(within(outRequested,referenceRoot)||within(referenceRoot,outRequested))throw Error('New outputs must not replace or contain accepted reference inputs');
await fs.mkdir(outRequested,{recursive:true,mode:0o700});const out=await fs.realpath(outRequested);
for(const r of [root,...Object.values(roots),referenceRoot])if(within(out,r))throw Error('Resolved private output escapes into a source/reference repository');
if((await fs.readdir(out)).length)throw Error('Use a new empty evidence directory; retain previous attempts');await fs.chmod(out,0o700);
const actualDir=path.join(out,'actual');await fs.mkdir(actualDir,{mode:0o700});
const git=(...a)=>execFileSync('git',a,{cwd:root,maxBuffer:64*1024*1024}),ownCommit=git('rev-parse','HEAD').toString().trim(),pinned=(commit,p)=>git('show',commit+':'+p),records=new Map();
for(const [owner,r] of Object.entries(roots)){const observed=execFileSync('git',['-C',r,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(observed!==FIXED[owner])throw Error('Explicit '+owner+' source root is not at its fixed commit');}
async function source(owner,repoPath){
 const commit=owner==='receiver'?ownCommit:FIXED[owner],ownerRoot=owner==='receiver'?root:roots[owner],file=path.resolve(ownerRoot,repoPath);
 if(!within(file,ownerRoot)||file===ownerRoot||!within(await fs.realpath(file),ownerRoot))throw Error('Source path escapes its owner root');
 const bytes=await fs.readFile(file);if(!bytes.equals(pinned(commit,repoPath)))throw Error('Source bytes differ from fixed Git blob: '+owner+'/'+repoPath);
 records.set(owner+':'+repoPath,{owner,commit,path:repoPath,bytes:bytes.length,sha256:sha(bytes)});return bytes;
}
const runner=await source('receiver','tools/ai-connection/test-lora-managed-snapshot.mjs');await source('receiver','tools/ai-connection/managed-snapshot-browser-cases.mjs');await source('receiver','tools/ai-connection/p3-norm-edge.mjs');
const sourcePins={},pinPaths={sdk:['lora','docs/shared/inference/lora/sdk-v2.mjs'],adapter:['lora','docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs'],kernel:['lora','docs/shared/inference/lora/kernel/lora.wasm'],diffusion:['diffusion','docs/shared/diffusion-models/lora/diagnostic-consumer.mjs']};
for(const [key,[owner,p]] of Object.entries(pinPaths)){const bytes=await source(owner,p);sourcePins[key]={repository:REPOSITORY,commit:FIXED[owner],path:p,sha256:sha(bytes),...(key==='kernel'?{byteLength:bytes.length}:{})};}
if(sourcePins.kernel.byteLength!==5051||sourcePins.kernel.sha256!=='3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24')throw Error('Corrected fixed kernel is required');
const artifactStat=await fs.stat(artifactPath,{bigint:true}),originalStat=await fs.stat(originalPath,{bigint:true}),identity=s=>Object.fromEntries(['size','mtimeNs','ctimeNs','ino','dev'].map(k=>[k,String(s[k])]));
if(!artifactStat.isFile()||Number(artifactStat.mode&0o077n)!==0||!originalStat.isFile())throw Error('Private artifact permissions and actual regular original File are required');
const artifactBytes=await fs.readFile(artifactPath);if(artifactBytes.length!==ARTIFACT.bytes||sha(artifactBytes)!==ARTIFACT.sha256)throw Error('Private base artifact bytes/SHA-256 mismatch');
const artifact=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(artifactBytes));if(artifact.schemaVersion!=='bernini-diagnostic-base-block/0.1'||artifact.scope!=='PARTIAL'||artifact.fullFileHashRecomputed!==false)throw Error('Explicit bounded base artifact required');
const referenceBytes=await fs.readFile(path.join(referenceRoot,'reference.json')),gateBytes=await fs.readFile(path.join(referenceRoot,'pre-execution-gates.json')),oldBytes=await fs.readFile(path.join(referenceRoot,'../result.json'));
const referencePath='development/ai-connection/evidence/lora-e1/HIGH-reference.json',gatePath='development/ai-connection/evidence/lora-e1/HIGH-gates.json';
if(!referenceBytes.equals(pinned(PRIOR,referencePath))||!gateBytes.equals(pinned(PRIOR,gatePath))||!oldBytes.equals(pinned(PRIOR,'development/ai-connection/evidence/lora-e1/HIGH-result.json')))throw Error('Accepted independent reference/gates/receipt differ from their immutable original commit');
const reference=JSON.parse(referenceBytes),gates=JSON.parse(gateBytes),old=JSON.parse(oldBytes),provided=artifact.sides?.HIGH;
if(reference.side!=='HIGH'||old.status!=='PASS_DIAGNOSTIC_PARTIAL'||!same(reference.gates,gates.gates)||!provided||provided.source.modelSha256!==reference.baseIdentity.expectedFullSha256||provided.source.modelSha256!==old.baseAcquisitionReceipt.actualSHA256||!same(provided.registry,old.binding.nativeRegistry))throw Error('Actual base or independent-reference identity mismatch');
const selected=reference.cases.filter(c=>c.pairId==='light');if(!same(selected.map(c=>c.strength),[0,1,-1])||selected.some(c=>c.retainedOriginalIdentity.sha256!==args['expected-sha256']||c.retainedOriginalIdentity.fileName!==path.basename(originalPath)))throw Error('Selected original/strengths differ from retained reference');
const inventory=JSON.parse(await source('lora','development/lora/contracts/original-inventory.json')),original=inventory.find(v=>v.pairId==='light'&&v.side.toUpperCase()==='HIGH');
if(!original||original.sha256!==args['expected-sha256']||original.fileName!==path.basename(originalPath)||String(original.bytes)!==String(originalStat.size))throw Error('Selected original metadata differs from retained inventory; browser must still verify its full hash');
const ids=['header','q.weight','q.bias','weight_scale','comfy_quant'],lengths=[181280,81920,32,4,27],names={header:null,'q.weight':'blocks.0.self_attn.q.weight','q.bias':'blocks.0.self_attn.q.bias',weight_scale:'blocks.0.self_attn.q.weight_scale',comfy_quant:'blocks.0.self_attn.q.comfy_quant'};
if(provided.ranges.length!==5)throw Error('Exactly five selected raw ranges required');
const rawRanges=provided.ranges.map((r,i)=>{const bytes=Buffer.from(r.data,'base64'),name=names[r.id],prior=name?reference.inputRanges.find(v=>v.name===name)?.sha256:reference.baseIdentity.headerSha256;if(r.id!==ids[i]||r.byteLength!==lengths[i]||bytes.length!==r.byteLength||bytes.toString('base64')!==r.data||sha(bytes)!==r.sha256||prior!==r.sha256)throw Error('Raw delivered range differs from prior independent original bytes');return {id:r.id,absoluteByteOffset:r.absoluteByteOffset,bytes:r.byteLength,sha256:r.sha256,priorRangeEqual:true};});
const header=JSON.parse(Buffer.from(provided.ranges[0].data,'base64').toString('utf8'));for(const r of rawRanges){const expected=r.id==='header'?8:8+lengths[0]+header[names[r.id]].data_offsets[0];if(r.absoluteByteOffset!==expected)throw Error('Delivered range absolute offset differs from original header');}
const referenceFiles=new Map();for(const r of [reference.activation,reference.baseWeight,reference.baseBias,...selected.flatMap(c=>[c.weight,c.bias])]){if(!/^[A-Za-z0-9_.-]+$/.test(r.file))throw Error('Unsafe reference array path');const bytes=await fs.readFile(path.join(referenceRoot,r.file));if(bytes.length!==r.bytes||sha(bytes)!==r.sha256)throw Error('Independent expected array bytes/hash changed');referenceFiles.set(r.file,bytes);}
const referenceInputs={referenceIdentity:{sourceRef:{repository:REPOSITORY,commit:PRIOR,path:referencePath},sha256:sha(referenceBytes),referenceId:'p3:accepted-high-reference'},gateIdentity:{sourceRef:{repository:REPOSITORY,commit:PRIOR,path:gatePath},sha256:sha(gateBytes),gateId:'p3:accepted-high-gates'}};
const referenceProof={priorAcceptedReceiptCommit:PRIOR,referenceJSONSHA256:sha(referenceBytes),gateJSONSHA256:sha(gateBytes),priorTrialSourceCommit:old.loraSourceCommit,priorModelFullFileVerified:old.baseAcquisitionReceipt.fullFileVerified,priorModelReceiptIsHistorical:true,fullFileHashRecomputed:false,nativeRegistryHash:provided.registry.registryHash,modelSha256:provided.source.modelSha256,ranges:rawRanges,reusedIndependentReference:true,selectedArrayCount:referenceFiles.size};
const serverErrors=[],requests=[],artifacts=[];
const receiverFiles=new Set(['tools/ai-connection/managed-snapshot-browser-cases.mjs','tools/ai-connection/p3-norm-edge.mjs','docs/shared/inference/lora/management-admission-inputs.mjs','docs/shared/inference/lora/numeric-declarations.mjs']);
const allowedManagerDevelopment=new Set(['ai-connection/reference-adoption/CANDIDATES.json']);
const serve=async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);requests.push({method:req.method,path:pathname});
 if(pathname==='/acceptance'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><input id="source" type="file"><input id="artifact" type="file">');return;}
 if(pathname.startsWith('/artifact/')&&req.method==='POST'){const name=pathname.slice('/artifact/'.length);if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error('Unsafe selected output path');let count=0;const chunks=[];for await(const c of req){count+=c.length;if(count>2*1024*1024)throw Error('Selected output budget exceeded');chunks.push(c);}const bytes=Buffer.concat(chunks);await fs.writeFile(path.join(actualDir,name),bytes,{mode:0o600,flag:'wx'});artifacts.push({file:name,bytes:bytes.length,sha256:sha(bytes)});res.end('saved privately');return;}
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 if(pathname.startsWith('/reference/')){const bytes=referenceFiles.get(pathname.slice('/reference/'.length));if(!bytes){res.writeHead(404).end();return;}res.setHeader('Content-Type','application/octet-stream');res.end(bytes);return;}
 let owner,repoPath;
 if(pathname.startsWith('/management/shared/')){owner='manager';repoPath='docs/shared/'+pathname.slice('/management/shared/'.length);}
 else if(pathname.startsWith('/management/development/')){const rest=pathname.slice('/management/development/'.length);if(!allowedManagerDevelopment.has(rest)){res.writeHead(404).end();return;}owner='manager';repoPath='development/'+rest;}
 else if(pathname.startsWith('/lora/shared/')){owner='lora';repoPath='docs/shared/'+pathname.slice('/lora/shared/'.length);}
 else if(pathname.startsWith('/diffusion/shared/')){owner='diffusion';repoPath='docs/shared/'+pathname.slice('/diffusion/shared/'.length);}
 else if(pathname==='/lora-tools/ai-connection/joint-browser-cases.mjs'){owner='lora';repoPath='tools/ai-connection/joint-browser-cases.mjs';}
 else if(pathname.startsWith('/receiver/')){owner='receiver';repoPath=pathname.slice('/receiver/'.length);if(!receiverFiles.has(repoPath)){res.writeHead(404).end();return;}}
 else{res.writeHead(404).end();return;}
 const bytes=await source(owner,repoPath),ext=path.extname(repoPath);res.setHeader('Content-Type',['.mjs','.js'].includes(ext)?'text/javascript':ext==='.wasm'?'application/wasm':ext==='.json'?'application/json':'application/octet-stream');res.end(bytes);
 }catch(error){serverErrors.push(String(error));res.writeHead(500).end('Fixed source request failed');}};
const server=http.createServer((req,res)=>{void serve(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=require(process.env.LORA_PLAYWRIGHT_MODULE??'/opt/codex/cua_node/lib/node_modules/playwright');let browser;
const report={dateJST:'2026-10-31',receiverCommit:ownCommit,fixedCommits:FIXED,runnerSourceSHA256:sha(runner),sourcePins,referenceInputs,referenceProof,privateBaseArtifact:{...ARTIFACT,mode:Number(artifactStat.mode&0o777n).toString(8),coverage:'PARTIAL',fullFileHashRecomputed:false},inputSelection:{pairId:'light',side:'HIGH',fileName:path.basename(originalPath),bytes:Number(originalStat.size),expectedSha256:args['expected-sha256'],fullHashPerformedByHost:false},scope:'One selected actual LoRA light/HIGH File and actual bounded base through native queue/snapshot/P1; no full model or generated output',completeAdapter:false,modelInference:false,generationReady:false};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.LORA_CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});report.browser=browser.version();const page=await browser.newPage(),pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));page.on('console',m=>{if(m.text().startsWith('MANAGED-REAL '))console.log(m.text());});
 await page.goto('http://127.0.0.1:'+server.address().port+'/acceptance');await page.locator('#source').setInputFiles(originalPath);await page.locator('#artifact').setInputFiles(artifactPath);
 const result=await page.evaluate(async({reference,input,sourcePins,referenceInputs,expectedArtifact})=>{try{
  const file=document.querySelector('#source').files[0],artifactFile=document.querySelector('#artifact').files[0],bytes=await artifactFile.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==expectedArtifact.bytes||hash!==expectedArtifact.sha256)throw Error('Browser received private artifact identity mismatch');const artifact=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  const {runManagedSnapshotCases}=await import('/receiver/tools/ai-connection/managed-snapshot-browser-cases.mjs');return runManagedSnapshotCases({file,artifact,reference,input,sourcePins,referenceInputs});
 }catch(error){return {status:'FAIL',error:String(error.stack??error),generationReady:false};}},{reference,input:{pairId:'light',side:'HIGH',expectedSha256:args['expected-sha256']},sourcePins,referenceInputs,expectedArtifact:ARTIFACT});
 Object.assign(report,result);report.pageErrors=pageErrors;report.inputFileUnchanged=same(identity(originalStat),identity(await fs.stat(originalPath,{bigint:true})));report.artifactFileUnchanged=same(identity(artifactStat),identity(await fs.stat(artifactPath,{bigint:true})));report.privateInputHTTPRequests=requests.filter(r=>r.method==='GET'&&(r.path.endsWith('.safetensors')||r.path.includes(path.basename(artifactPath))));report.legacyBridgeLoaded=[...records.values()].some(r=>r.path.endsWith('/diagnostic-lora.mjs'));
 if(pageErrors.length||serverErrors.length||!report.inputFileUnchanged||!report.artifactFileUnchanged||report.privateInputHTTPRequests.length||report.legacyBridgeLoaded||report.generationReady!==false){report.status='FAIL';report.transportError='Input/source/legacy/generation invariant failed';}
 if(report.status!=='PASS_MANAGED_REAL_BASE_PARTIAL_SNAPSHOT')process.exitCode=1;
}catch(error){report.status='FAIL';report.error=String(error.stack??error);process.exitCode=1;}
finally{report.loadedSources=[...records.values()];report.serverErrors=serverErrors;report.selectedArtifacts=artifacts;await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});await browser?.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({status:report.status,cases:report.cases?.length,generationReady:report.generationReady,result:path.join(out,'result.json'),error:report.error}));

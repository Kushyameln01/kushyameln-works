#!/usr/bin/env node
// Management-owned transport for actual original Files. Numerical work remains
// in the pinned LoRA oracle/SDK/Hike and native Diffusion ORT/Hike modules.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const here=path.dirname(fileURLToPath(import.meta.url));
const managementRoot=path.resolve(here,'../..');
const repository='https://github.com/Kushyameln01/kushyameln-works';
const usage='node tools/ai-connection/run-managed-lora-real.mjs --lora-root <fixed LoRA archive> --lora-commit <40hex> --diffusion-root <fixed Diffusion archive> --diffusion-commit <40hex> --side HIGH|LOW --base <actual complete original> --base-receipt <current full-hash/stat receipt> --originals-root <original LoRA folder> --out <new private evidence folder>';
const argv=process.argv.slice(2);
if(argv.length===1&&argv[0]==='--help'){console.log(usage);process.exit(0);}
const required=['lora-root','lora-commit','diffusion-root','diffusion-commit','side','base','base-receipt','originals-root','out'];
const args={};
for(let i=0;i<argv.length;i+=2){
 const name=argv[i]?.slice(2);
 if(!argv[i]?.startsWith('--')||!required.includes(name))throw Error('Unknown argument: '+argv[i]);
 if(Object.hasOwn(args,name)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('One explicit value required for --'+name);
 args[name]=argv[i+1];
}
for(const name of required)if(!args[name])throw Error('Missing --'+name+'\n'+usage);
if(!['HIGH','LOW'].includes(args.side)||!['lora-commit','diffusion-commit'].every(k=>/^[a-f0-9]{40}$/.test(args[k])))throw Error('Full lowercase Git commits and an explicit HIGH/LOW side required');

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const within=(file,dir)=>file.startsWith(path.resolve(dir)+path.sep);
const roots={management:managementRoot,lora:path.resolve(args['lora-root']),diffusion:path.resolve(args['diffusion-root'])};
const managementCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:managementRoot,encoding:'utf8'}).trim();
const commits={management:managementCommit,lora:args['lora-commit'],diffusion:args['diffusion-commit']};
const sourceRecords=new Map(),referenceRecords=new Map(),artifactRecords=new Map(),sourceServiceErrors=[];
const fileState=s=>Object.fromEntries(['size','mtimeNs','ctimeNs','ino','dev'].map(k=>[k,String(s[k])]));
const sameState=(a,b)=>Object.keys(a).every(k=>a[k]===b[k]);
const sourceCache=new Map();

async function pinnedSource(owner,repoPath){
 const key=owner+':'+repoPath;
 if(sourceCache.has(key))return sourceCache.get(key);
 if(!repoPath||repoPath.includes('\\')||path.posix.normalize(repoPath)!==repoPath||repoPath.startsWith('/')||repoPath.startsWith('../'))throw Error('Unsafe source path');
 const diskPath=path.resolve(roots[owner],repoPath);
 if(!within(diskPath,roots[owner])||!within(await fsp.realpath(diskPath),await fsp.realpath(roots[owner])))throw Error('Source path escapes its fixed root');
 const bytes=await fsp.readFile(diskPath);
 const object=execFileSync('git',['show',commits[owner]+':'+repoPath],{cwd:managementRoot,maxBuffer:64*1024*1024});
 if(!bytes.equals(object))throw Error(owner+' source differs from pinned Git object: '+repoPath);
 const blobSHA=execFileSync('git',['rev-parse',commits[owner]+':'+repoPath],{cwd:managementRoot,encoding:'utf8'}).trim();
 const record={owner,repository,commit:commits[owner],path:repoPath,sha256:sha(bytes),byteLength:bytes.length,blobSHA,gitBlobVerified:true,httpPaths:[]};
 sourceRecords.set(key,record);const value={bytes,record};sourceCache.set(key,value);return value;
}

// Resolve the actual exported boundary before any private payload processing.
const pinPaths={
 sdk:['lora','docs/shared/inference/lora/sdk-v2.mjs'],
 adapter:['lora','docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs'],
 kernel:['lora','docs/shared/inference/lora/kernel/lora.wasm'],
 diffusion:['diffusion','docs/shared/diffusion-models/lora/diagnostic-consumer.mjs'],
 management:['management','docs/shared/ai-connection/adapters/adopted-lora.mjs']
};
const sourcePins={};
for(const [name,[owner,repoPath]]of Object.entries(pinPaths)){
 const {record}=await pinnedSource(owner,repoPath);
 sourcePins[name]={repository:record.repository,commit:record.commit,path:record.path,sha256:record.sha256,...(name==='kernel'?{byteLength:record.byteLength}:{})};
}
if(sourcePins.kernel.byteLength!==5051||sourcePins.kernel.sha256!=='3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24')throw Error('This acceptance requires the corrected, real-original-tested LoRA kernel');
await pinnedSource('management','tools/ai-connection/run-managed-lora-real.mjs');
await pinnedSource('management','tools/ai-connection/managed-lora-browser-cases.mjs');
const oracle=await pinnedSource('lora','tools/ai-connection/lora-reference.py');
const inventorySource=await pinnedSource('lora','development/lora/contracts/original-inventory.json');
const inventory=JSON.parse(inventorySource.bytes.toString('utf8'));
if(!Array.isArray(inventory)||inventory.length!==4||new Set(inventory.map(x=>x.pairId+'/'+x.side.toUpperCase())).size!==4||inventory.some(x=>!['light','detail'].includes(x.pairId)||!['high','low'].includes(x.side)||path.basename(x.fileName)!==x.fileName||!Number.isSafeInteger(x.bytes)||x.bytes<=0||!/^[a-f0-9]{64}$/.test(x.sha256)))throw Error('The pinned four-original inventory is invalid');

const basePath=path.resolve(args.base),baseReceiptPath=path.resolve(args['base-receipt']);
const baseReceiptBytes=await fsp.readFile(baseReceiptPath),baseReceipt=JSON.parse(baseReceiptBytes.toString('utf8'));
const baseStat=await fsp.stat(basePath,{bigint:true});
const baseHashes={HIGH:'9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52',LOW:'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3'};
const actualDigest=baseReceipt.actualSHA256??baseReceipt.observedSHA256??baseReceipt.verifiedSHA256??baseReceipt.verifiedSha256??baseReceipt.sha256;
if(!baseStat.isFile()||baseStat.size!==15574833216n||baseReceipt.fullFileVerified!==true||baseReceipt.role!==args.side||String(baseReceipt.expectedBytes)!==String(baseStat.size)||actualDigest!==baseReceipt.expectedSHA256||actualDigest!==baseHashes[args.side])throw Error('A complete verified original base acquisition receipt with the required side, size and full SHA is required');
if(!baseReceipt.fileStat||['size','mtimeNs','ino','dev'].some(k=>String(baseReceipt.fileStat[k])!==String(baseStat[k])))throw Error('Full-hash receipt is not bound to this unchanged original File');
const inputRecords=[{kind:'base',side:args.side,path:basePath,expectedSha256:actualDigest,fullHashEvidence:'current complete acquisition receipt bound to this immutable file',before:fileState(baseStat)}];
const loraFiles=[];
for(const item of inventory){
 if(item.side.toUpperCase()!==args.side)continue;
 const file=path.join(path.resolve(args['originals-root']),item.pairId+'-safetensors',item.fileName),stat=await fsp.stat(file,{bigint:true});
 if(!stat.isFile()||String(stat.size)!==String(item.bytes))throw Error('Original LoRA missing or incorrect size: '+item.fileName);
 inputRecords.push({kind:'lora',pairId:item.pairId,side:item.side.toUpperCase(),path:file,expectedSha256:item.sha256,fullHashEvidence:'actual SDK source.hash() required before accepting each new original',before:fileState(stat)});
 loraFiles.push(file);
}

const out=path.resolve(args.out);
for(const dir of Object.values(roots))if(out===dir||within(out,dir))throw Error('Evidence output must be outside source repositories/archives');
let ancestor=out;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
const containingRepo=(()=>{try{return execFileSync('git',['rev-parse','--show-toplevel'],{cwd:ancestor,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return null;}})();
if(containingRepo)throw Error('Raw numerical evidence must be outside every Git repository');
if(fs.existsSync(out)&&(await fsp.readdir(out)).length)throw Error('Use a new or empty private evidence directory');
await fsp.mkdir(out,{recursive:true,mode:0o700});await fsp.chmod(out,0o700);
const refDir=path.join(out,'reference'),actualDir=path.join(out,'actual'),verifiedDir=path.join(out,'verified-source');
for(const dir of [refDir,actualDir,verifiedDir])await fsp.mkdir(dir,{mode:0o700});
await fsp.writeFile(path.join(verifiedDir,'lora-reference.py'),oracle.bytes,{mode:0o600,flag:'wx'});
await fsp.writeFile(path.join(verifiedDir,'original-inventory.json'),inventorySource.bytes,{mode:0o600,flag:'wx'});
await fsp.writeFile(path.join(out,'base-acquisition-receipt.json'),baseReceiptBytes,{mode:0o600,flag:'wx'});

let browser,server,pageErrors=[],result={status:'FAIL'},runError;
const provenance={schemaVersion:'management-lora-real-result/1',observedUTC:new Date().toISOString(),side:args.side,repository,managementCommit,loraCommit:commits.lora,diffusionCommit:commits.diffusion,sourcePins,scope:'PARTIAL',completeAdapter:false,generationReady:false,snapshotPublished:false,sourceInputs:'genuine local complete immutable original Files; no sparse File or synthetic base substitution',baseAcquisitionReceipt:baseReceipt,baseFullHashReceiptReused:true,oracleSource:oracle.record,inventorySource:inventorySource.record,notExecutedOriginals:inventory.filter(item=>item.side.toUpperCase()!==args.side).map(({pairId,side,fileName,bytes,sha256})=>({pairId,side:side.toUpperCase(),fileName,bytes,sha256,status:'inventory identity only; other side not executed by this trial'}))};
try{
 console.log(JSON.stringify({stage:'independent-reference',side:args.side,baseFullSha256:actualDigest}));
 const oracleOutput=execFileSync(process.env.LORA_PYTHON??'python',[path.join(verifiedDir,'lora-reference.py'),'--side',args.side,'--base',basePath,'--lora-root',path.resolve(args['originals-root']),'--inventory',path.join(verifiedDir,'original-inventory.json'),'--out',refDir],{cwd:out,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},maxBuffer:2*1024*1024});
 await fsp.writeFile(path.join(out,'oracle-stdout.json'),oracleOutput,{mode:0o600,flag:'wx'});
 for(const name of await fsp.readdir(refDir)){
  if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error('Unsafe generated reference filename');
  const bytes=await fsp.readFile(path.join(refDir,name));referenceRecords.set(name,{path:name,byteLength:bytes.length,sha256:sha(bytes),bytes});
 }
 const reference=JSON.parse(referenceRecords.get('reference.json').bytes.toString('utf8'));
 for(const rec of inputRecords)if(!sameState(rec.before,fileState(await fsp.stat(rec.path,{bigint:true}))))throw Error('Original File changed during reference calculation: '+path.basename(rec.path));
 const serve=async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(req.method==='GET'&&pathname==='/joint'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><input id="base" type="file"><input id="loras" type="file" multiple>');return;}
   if(pathname.startsWith('/artifact/')&&req.method==='POST'){
    const name=pathname.slice('/artifact/'.length);
    if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\.(?:f32|f64|json|bin)$/.test(name))throw Error('Unsafe artifact filename');
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)throw Error('Evidence artifact exceeds 2 MiB');chunks.push(chunk);}
    const bytes=Buffer.concat(chunks);await fsp.writeFile(path.join(actualDir,name),bytes,{mode:0o600,flag:'wx'});artifactRecords.set(name,{path:'actual/'+name,byteLength:bytes.length,sha256:sha(bytes)});res.end('saved');return;
   }
   if(req.method!=='GET'){res.writeHead(405).end();return;}
   if(pathname.startsWith('/reference/')){
    const name=pathname.slice('/reference/'.length),record=referenceRecords.get(name);
    if(!record){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',name.endsWith('.json')?'application/json':'application/octet-stream');res.end(record.bytes);return;
   }
   let owner,repoPath;
   if(pathname.startsWith('/management/')){owner='management';repoPath='docs/'+pathname.slice('/management/'.length);}
   else if(pathname.startsWith('/lora/')){owner='lora';repoPath='docs/'+pathname.slice('/lora/'.length);}
   else if(pathname.startsWith('/diffusion/')){owner='diffusion';repoPath='docs/'+pathname.slice('/diffusion/'.length);}
   else if(pathname.startsWith('/lora-tools/')){owner='lora';repoPath='tools/'+pathname.slice('/lora-tools/'.length);}
   else if(pathname==='/runner/managed-lora-browser-cases.mjs'){owner='management';repoPath='tools/ai-connection/managed-lora-browser-cases.mjs';}
   else{res.writeHead(404).end();return;}
   const {bytes,record}=await pinnedSource(owner,repoPath);
   if(!record.httpPaths.includes(pathname))record.httpPaths.push(pathname);
   res.setHeader('Content-Type',repoPath.endsWith('.mjs')||repoPath.endsWith('.js')?'text/javascript':repoPath.endsWith('.wasm')?'application/wasm':repoPath.endsWith('.json')?'application/json':'application/octet-stream');res.end(bytes);
  }catch(error){sourceServiceErrors.push(String(error));console.error('Managed source/artifact refusal: '+String(error));res.writeHead(500).end(String(error));}
 };
 server=http.createServer((req,res)=>{void serve(req,res);});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const require=createRequire(import.meta.url),{chromium}=require(process.env.LORA_PLAYWRIGHT_MODULE??'/opt/codex/cua_node/lib/node_modules/playwright');
 browser=await chromium.launch({headless:true,executablePath:process.env.LORA_CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 provenance.browser=browser.version();const page=await browser.newPage();
 page.on('pageerror',e=>pageErrors.push(String(e)));page.on('console',m=>{if(/^(MANAGED|JOINT) /.test(m.text()))console.log(m.text());});
 const origin=`http://127.0.0.1:${server.address().port}`;
 await page.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin?route.continue():route.abort('blockedbyclient');});
 await page.goto(origin+'/joint');await page.locator('#base').setInputFiles(basePath);await page.locator('#loras').setInputFiles(loraFiles);
 result=await page.evaluate(async({reference,sourcePins})=>{
  try{const {runManagedLoraCases}=await import('/runner/managed-lora-browser-cases.mjs');return await runManagedLoraCases({baseFile:document.querySelector('#base').files[0],loraFiles:[...document.querySelector('#loras').files],reference,sourcePins});}
  catch(error){return {status:'FAIL',error:String(error.stack||error),cause:String(error.cause??'')};}
 },{reference,sourcePins});
}catch(error){runError=error;result={status:'FAIL',error:String(error.stack||error)};}
finally{
 if(browser)try{await browser.close();}catch(error){runError??=error;}
 if(server)try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){runError??=error;}
 const changed=[];for(const rec of inputRecords){try{rec.after=fileState(await fsp.stat(rec.path,{bigint:true}));rec.unchanged=sameState(rec.before,rec.after);}catch(error){rec.unchanged=false;rec.afterError=String(error);}if(!rec.unchanged)changed.push(rec.path);}
 const final={...result,...provenance,pageErrors,sourceServiceErrors,inputFiles:inputRecords,sourceFiles:[...sourceRecords.values()],referenceFiles:[...referenceRecords.values()].map(({bytes,...record})=>record),artifacts:[...artifactRecords.values()],originalsUnchangedAcrossTrial:changed.length===0};
 if(changed.length||pageErrors.length||sourceServiceErrors.length||runError){final.status='FAIL';final.transportError=String(runError??(changed.length?'Original File changed during trial':pageErrors[0]??sourceServiceErrors[0]));}
 await fsp.writeFile(path.join(out,'source-receipt.json'),JSON.stringify({schemaVersion:'management-lora-source-receipt/1',sourcePins,sourceFiles:final.sourceFiles,oracle:oracle.record,inventory:inventorySource.record},null,2)+'\n',{mode:0o600,flag:'wx'});
 await fsp.writeFile(path.join(out,'result.json'),JSON.stringify(final,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({status:final.status,side:args.side,cases:final.cases?.length,result:path.join(out,'result.json'),error:final.error??final.transportError}));
 if(final.status!=='PASS_MANAGED_DIAGNOSTIC_PARTIAL')process.exitCode=1;
}

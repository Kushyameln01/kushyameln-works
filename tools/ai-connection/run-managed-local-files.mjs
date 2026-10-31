#!/usr/bin/env node
// Local File/state/save/cancel validation. The selected LoRA File is real;
// base/control values are explicitly synthetic fixtures, separate from E1.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const here=path.dirname(fileURLToPath(import.meta.url)),managementRoot=path.resolve(here,'../..');
const repository='https://github.com/Kushyameln01/kushyameln-works';
const fixtureScope='synthetic-manager-control-fixture';
const required=['lora-root','lora-commit','diffusion-root','diffusion-commit','codec-root','codec-commit','inputs','out'];
const usage='node tools/ai-connection/run-managed-local-files.mjs --lora-root <fixed LoRA archive> --lora-commit <40hex> --diffusion-root <fixed Diffusion archive> --diffusion-commit <40hex> --codec-root <fixed Text/VAE archive> --codec-commit <40hex> --inputs <private local-File selection JSON> --out <new private evidence folder>'; 
const argv=process.argv.slice(2),args={};
if(argv.length===1&&argv[0]==='--help'){console.log(usage);process.exit(0);}
for(let i=0;i<argv.length;i+=2){const k=argv[i]?.slice(2);if(!argv[i]?.startsWith('--')||!required.includes(k))throw Error('Unknown argument: '+argv[i]);if(!argv[i+1]||argv[i+1].startsWith('--')||Object.hasOwn(args,k))throw Error('One explicit value required for --'+k);args[k]=argv[i+1];}
for(const k of required)if(!args[k])throw Error('Missing --'+k+'\n'+usage);
if(!['lora-commit','diffusion-commit','codec-commit'].every(k=>/^[a-f0-9]{40}$/.test(args[k])))throw Error('Complete lowercase source commits required');
const sha=b=>createHash('sha256').update(b).digest('hex'),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const within=(file,root)=>file.startsWith(path.resolve(root)+path.sep);
const roots={management:managementRoot,lora:path.resolve(args['lora-root']),diffusion:path.resolve(args['diffusion-root']),codec:path.resolve(args['codec-root'])};
const managementCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:managementRoot,encoding:'utf8'}).trim();
const commits={management:managementCommit,lora:args['lora-commit'],diffusion:args['diffusion-commit'],codec:args['codec-commit']};
const sourceRecords=new Map(),sourceCache=new Map(),referenceRecords=new Map(),artifactRecords=new Map(),packageRecords=new Map(),serviceErrors=[];
const fileState=stat=>Object.fromEntries(['size','mtimeNs','ctimeNs','ino','dev'].map(k=>[k,String(stat[k])]));
const sameState=(a,b)=>Object.keys(a).every(k=>a[k]===b[k]);

async function pinnedSource(owner,repoPath){
 const key=owner+':'+repoPath;if(sourceCache.has(key))return sourceCache.get(key);
 if(!repoPath||repoPath.includes('\\')||path.posix.normalize(repoPath)!==repoPath||repoPath.startsWith('/')||repoPath.startsWith('../'))throw Error('Unsafe source path');
 const file=path.resolve(roots[owner],repoPath);
 if(!within(file,roots[owner])||!within(await fsp.realpath(file),await fsp.realpath(roots[owner])))throw Error('Source path escapes fixed owner root');
 const bytes=await fsp.readFile(file),object=execFileSync('git',['show',commits[owner]+':'+repoPath],{cwd:managementRoot,maxBuffer:64*1024*1024});
 if(!bytes.equals(object))throw Error(owner+' source differs from pinned Git object: '+repoPath);
 const blobSHA=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
 const record={owner,repository,commit:commits[owner],path:repoPath,byteLength:bytes.length,sha256:sha(bytes),blobSHA,gitBlobVerified:true,httpPaths:[]};
 const value={bytes,record};sourceRecords.set(key,record);sourceCache.set(key,value);return value;
}
const sourcePins={},pinPaths={
 sdk:['lora','docs/shared/inference/lora/sdk-v2.mjs'],adapter:['lora','docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs'],kernel:['lora','docs/shared/inference/lora/kernel/lora.wasm'],
 diffusion:['diffusion','docs/shared/diffusion-models/lora/diagnostic-consumer.mjs'],management:['management','docs/shared/ai-connection/adapters/adopted-lora.mjs'],codec:['codec','docs/shared/inference/tensor.mjs']
};
for(const [name,[owner,repoPath]]of Object.entries(pinPaths)){const {record}=await pinnedSource(owner,repoPath);sourcePins[name]={repository,commit:record.commit,path:record.path,sha256:record.sha256,...(name==='kernel'?{byteLength:record.byteLength}:{})};}
if(sourcePins.kernel.byteLength!==5051||sourcePins.kernel.sha256!=='3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24')throw Error('Corrected owner LoRA kernel required');
await pinnedSource('management','tools/ai-connection/run-managed-local-files.mjs');
await pinnedSource('management','tools/ai-connection/managed-local-file-browser-cases.mjs');
const controlOracle=await pinnedSource('management','tools/ai-connection/managed-lora-control-reference.py');
const ownerOracle=await pinnedSource('lora','tools/ai-connection/lora-reference.py');
const inventory=await pinnedSource('lora','development/lora/contracts/original-inventory.json');
await pinnedSource('lora','docs/shared/inference/lora/kernel/registry.mjs');

const inputsPath=path.resolve(args.inputs),inputsBytes=await fsp.readFile(inputsPath),inputsStat=await fsp.stat(inputsPath,{bigint:true});
if(inputsBytes.length>1024*1024)throw Error('Input selection JSON exceeds budget');
const inputs=JSON.parse(inputsBytes.toString('utf8'));
if(inputs.fixtureScope!==fixtureScope||!inputs.positive||!hex(inputs.positive.expectedSha256)||!['light','detail'].includes(inputs.positive.selection?.pairId)||!['high','low'].includes(inputs.positive.selection?.noise)||!Array.isArray(inputs.negatives)||inputs.negatives.length>32)throw Error('Explicit local positive selection/hash, negative list and synthetic-manager-control-fixture label required');
const inputRecords=[],negativePaths=[];
async function inputFile(item,kind){
 if(typeof item?.path!=='string'||!item.path)throw Error('Explicit real local File path required');
 const file=path.resolve(path.dirname(inputsPath),item.path),stat=await fsp.stat(file,{bigint:true});if(!stat.isFile()||stat.size<1n)throw Error('Regular nonempty local File required');
 item.fileName=path.basename(file);
 const record={kind,sourceNo:item.sourceNo??null,path:file,fileName:item.fileName,byteLength:String(stat.size),expectedSha256:item.expectedSha256??item.sha256??null,expectedClassification:item.expectedClassification??null,before:fileState(stat),fullHashScope:kind==='positive'?'positive source hash must be verified by actual native SDK during browser route':'CLI stream hash of unchanged explicitly selected negative File'};
 if(kind==='negative'){
  if(typeof item.expectedClassification!=='string'||!item.expectedClassification)throw Error('Each negative input needs its explicit expected classification');
  const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);record.sha256=hash.digest('hex');
  if(record.expectedSha256!==null&&(!hex(record.expectedSha256)||record.expectedSha256!==record.sha256))throw Error('Selected negative File hash differs from its supplied receipt: '+item.fileName);
  if(!sameState(record.before,fileState(await fsp.stat(file,{bigint:true}))))throw Error('Selected File changed during hash verification');
 }
 inputRecords.push(record);return file;
}
const positivePath=await inputFile(inputs.positive,'positive');
for(const item of inputs.negatives)negativePaths.push(await inputFile(item,'negative'));
if(new Set([positivePath,...negativePaths]).size!==1+negativePaths.length)throw Error('Each selected local File path must be distinct');

const out=path.resolve(args.out);for(const root of Object.values(roots))if(out===root||within(out,root))throw Error('Private evidence output must be outside source repositories/archives');
let ancestor=out;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
let containingRepo;try{containingRepo=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:ancestor,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
if(containingRepo)throw Error('Private raw evidence must remain outside every Git repository');
if(fs.existsSync(out)&&(await fsp.readdir(out)).length)throw Error('Use a new or empty private evidence directory');
await fsp.mkdir(out,{recursive:true,mode:0o700});await fsp.chmod(out,0o700);
const refDir=path.join(out,'reference'),actualDir=path.join(out,'actual'),packageDir=path.join(out,'packages'),verifiedDir=path.join(out,'verified-source');
for(const dir of [refDir,actualDir,packageDir,verifiedDir])await fsp.mkdir(dir,{mode:0o700});
const sourceCopies=[['managed-lora-control-reference.py',controlOracle],['lora-reference.py',ownerOracle],['original-inventory.json',inventory]];
for(const [name,{bytes}]of sourceCopies)await fsp.writeFile(path.join(verifiedDir,name),bytes,{mode:0o600,flag:'wx'});
await fsp.writeFile(path.join(out,'inputs.json'),inputsBytes,{mode:0o600,flag:'wx'});

let browser,server,runError,result={status:'FAIL'},pageErrors=[];
const provenance={schemaVersion:'management-local-file-result/1',observedUTC:new Date().toISOString(),repository,managementCommit,loraCommit:commits.lora,diffusionCommit:commits.diffusion,codecCommit:commits.codec,sourcePins,fixtureScope,baseSource:'synthetic manager-control fixture; not a real base-model File',sourceInputs:'only explicitly selected real local positive/negative Files; no remote Drive loading',managementRealE1Executed:false,modelInference:false,generationReady:false,snapshotPublished:false,inputSelection:{byteLength:inputsBytes.length,sha256:sha(inputsBytes),before:fileState(inputsStat)},controlOracleSource:controlOracle.record,ownerOracleSource:ownerOracle.record,inventorySource:inventory.record};
try{
 console.log(JSON.stringify({stage:'synthetic-manager-control-reference',positive:inputs.positive.fileName,negativeCount:negativePaths.length,fixtureScope}));
 const oracleOutput=execFileSync(process.env.LORA_PYTHON??'python',[path.join(verifiedDir,'managed-lora-control-reference.py'),'--owner-reference',path.join(verifiedDir,'lora-reference.py'),'--input',positivePath,'--out',refDir],{cwd:out,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},maxBuffer:2*1024*1024});
 await fsp.writeFile(path.join(out,'oracle-stdout.json'),oracleOutput,{mode:0o600,flag:'wx'});
 for(const name of await fsp.readdir(refDir)){if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error('Unsafe generated reference filename');const bytes=await fsp.readFile(path.join(refDir,name));referenceRecords.set(name,{path:name,byteLength:bytes.length,sha256:sha(bytes),bytes});}
 const referenceRecord=referenceRecords.get('reference.json');if(!referenceRecord)throw Error('Control oracle did not produce reference.json');
 const reference=JSON.parse(referenceRecord.bytes.toString('utf8'));
 for(const rec of inputRecords)if(!sameState(rec.before,fileState(await fsp.stat(rec.path,{bigint:true}))))throw Error('Selected local File changed during control reference generation');
 const boundedBody=async req=>{const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>2*1024*1024)throw Error('Private artifact/package file exceeds 2 MiB');chunks.push(chunk);}return Buffer.concat(chunks);};
 const packagePath=pathname=>{
  const parts=pathname.slice('/package/'.length).split('/'),id=parts.shift(),segments=parts;
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id??'')||!segments.length||segments.some(s=>!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(s)))throw Error('Unsafe package ID/relative path');
  const relative=segments.join('/'),file=path.resolve(packageDir,id,...segments);if(!within(file,packageDir))throw Error('Package path escaped private output');return {id,relative,file,key:id+'/'+relative};
 };
 const serve=async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(req.method==='GET'&&pathname==='/joint'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><input id="positive" type="file"><input id="negatives" type="file" multiple>');return;}
   if(pathname.startsWith('/artifact/')&&req.method==='POST'){
    const name=pathname.slice('/artifact/'.length);if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\.(?:f32|f64|json|bin)$/.test(name))throw Error('Unsafe artifact filename');
    const bytes=await boundedBody(req);await fsp.writeFile(path.join(actualDir,name),bytes,{mode:0o600,flag:'wx'});artifactRecords.set(name,{path:'actual/'+name,byteLength:bytes.length,sha256:sha(bytes)});res.end('saved');return;
   }
   if(pathname.startsWith('/package/')){
    const p=packagePath(pathname);
    if(req.method==='POST'){
     const bytes=await boundedBody(req);await fsp.mkdir(path.dirname(p.file),{recursive:true,mode:0o700});await fsp.writeFile(p.file,bytes,{mode:0o600,flag:'wx'});
     packageRecords.set(p.key,{packageId:p.id,path:p.relative,byteLength:bytes.length,sha256:sha(bytes),freshWrite:true,readbackCount:0});res.end('saved');return;
    }
    if(req.method==='GET'){
     const record=packageRecords.get(p.key);if(!record){res.writeHead(404).end();return;}
     const bytes=await fsp.readFile(p.file);if(bytes.length!==record.byteLength||sha(bytes)!==record.sha256)throw Error('Saved package bytes changed before fresh disk readback');record.readbackCount++;record.diskReadbackHashMatched=true;res.setHeader('Content-Type','application/octet-stream');res.end(bytes);return;
    }
    res.writeHead(405).end();return;
   }
   if(req.method!=='GET'){res.writeHead(405).end();return;}
   if(pathname.startsWith('/reference/')){
    const name=pathname.slice('/reference/'.length),record=referenceRecords.get(name);if(!record){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',name.endsWith('.json')?'application/json':'application/octet-stream');res.end(record.bytes);return;
   }
   let owner,repoPath;
   if(pathname.startsWith('/management/')){owner='management';repoPath='docs/'+pathname.slice('/management/'.length);}
   else if(pathname.startsWith('/lora/')){owner='lora';repoPath='docs/'+pathname.slice('/lora/'.length);}
   else if(pathname.startsWith('/diffusion/')){owner='diffusion';repoPath='docs/'+pathname.slice('/diffusion/'.length);}
   else if(pathname.startsWith('/codec/')){owner='codec';repoPath='docs/'+pathname.slice('/codec/'.length);}
   else if(pathname.startsWith('/lora-tools/')){owner='lora';repoPath='tools/'+pathname.slice('/lora-tools/'.length);}
   else if(pathname==='/runner/managed-local-file-browser-cases.mjs'){owner='management';repoPath='tools/ai-connection/managed-local-file-browser-cases.mjs';}
   else{res.writeHead(404).end();return;}
   const {bytes,record}=await pinnedSource(owner,repoPath);if(!record.httpPaths.includes(pathname))record.httpPaths.push(pathname);
   res.setHeader('Content-Type',repoPath.endsWith('.mjs')||repoPath.endsWith('.js')?'text/javascript':repoPath.endsWith('.wasm')?'application/wasm':repoPath.endsWith('.json')?'application/json':'application/octet-stream');res.end(bytes);
  }catch(error){serviceErrors.push(String(error));console.error('Managed local File service refusal: '+String(error));res.writeHead(500).end(String(error));}
 };
 server=http.createServer((req,res)=>{void serve(req,res);});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const require=createRequire(import.meta.url),{chromium}=require(process.env.LORA_PLAYWRIGHT_MODULE??'/opt/codex/cua_node/lib/node_modules/playwright');
 browser=await chromium.launch({headless:true,executablePath:process.env.LORA_CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 provenance.browser=browser.version();const page=await browser.newPage(),origin=`http://127.0.0.1:${server.address().port}`;
 page.on('pageerror',e=>pageErrors.push(String(e)));page.on('console',m=>{if(/^(MANAGED(?:-FILE)?|LOCAL) /.test(m.text()))console.log(m.text());});
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
 await page.goto(origin+'/joint');await page.locator('#positive').setInputFiles(positivePath);if(negativePaths.length)await page.locator('#negatives').setInputFiles(negativePaths);
 result=await page.evaluate(async({inputs,reference,sourcePins})=>{
  try{const {runManagedLocalFileCases}=await import('/runner/managed-local-file-browser-cases.mjs');return await runManagedLocalFileCases({positiveFile:document.querySelector('#positive').files[0],negativeFiles:[...document.querySelector('#negatives').files],inputs,reference,sourcePins});}
  catch(error){return {status:'FAIL',error:String(error.stack||error),cause:String(error.cause??'')};}
 },{inputs,reference,sourcePins});
 if(result.status==='PASS_MANAGED_LOCAL_FILE_ROUTE'){
  const observed=result.localInput?.sourceSha256;
  if(observed!==inputs.positive.expectedSha256||result.localInput?.registration?.fullFileSHA256!==observed)throw Error('Successful local route did not retain actual positive native full-hash evidence');
  inputRecords[0].sha256=observed;inputRecords[0].fullHashScope='actual browser native registration/source.hash verified the explicitly selected local File';
  if(result.inputClassifications?.length!==inputs.negatives.length)throw Error('Successful local route did not classify every selected negative File');
  for(let i=0;i<inputs.negatives.length;i++){
   const expected=inputs.negatives[i].expectedClassification,actual=result.inputClassifications[i];
   if(actual.sourceNo!==inputs.negatives[i].sourceNo||actual.fileName!==inputs.negatives[i].fileName||(expected==='UNSUPPORTED'?!actual.classification?.startsWith('UNSUPPORTED'):actual.classification!==expected))throw Error('Actual native classification differs from the declared selected negative input');
  }
 }
}catch(error){runError=error;result={...result,status:'FAIL',error:String(error.stack||error)};}
finally{
 if(browser)try{await browser.close();}catch(error){runError??=error;}
 if(server)try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){runError??=error;}
 let originalsUnchanged=true;for(const rec of inputRecords){try{rec.after=fileState(await fsp.stat(rec.path,{bigint:true}));rec.unchanged=sameState(rec.before,rec.after);}catch(error){rec.unchanged=false;rec.afterError=String(error);}if(!rec.unchanged)originalsUnchanged=false;}
 try{provenance.inputSelection.after=fileState(await fsp.stat(inputsPath,{bigint:true}));provenance.inputSelection.unchanged=sameState(provenance.inputSelection.before,provenance.inputSelection.after)&&sha(await fsp.readFile(inputsPath))===provenance.inputSelection.sha256;}catch(error){provenance.inputSelection.unchanged=false;provenance.inputSelection.afterError=String(error);}
 const final={...result,...provenance,pageErrors,serviceErrors,inputFiles:inputRecords,sourceFiles:[...sourceRecords.values()],referenceFiles:[...referenceRecords.values()].map(({bytes,...record})=>record),artifacts:[...artifactRecords.values()],packageFiles:[...packageRecords.values()],originalsUnchangedAcrossTrial:originalsUnchanged};
 if(!originalsUnchanged||!provenance.inputSelection.unchanged||pageErrors.length||serviceErrors.length||runError){final.status='FAIL';final.transportError=String(runError??(!originalsUnchanged?'Selected File changed during trial':!provenance.inputSelection.unchanged?'Input selection changed during trial':pageErrors[0]??serviceErrors[0]));}
 await fsp.writeFile(path.join(out,'source-receipt.json'),JSON.stringify({schemaVersion:'management-local-file-source-receipt/1',fixtureScope,sourcePins,sourceFiles:final.sourceFiles,controlOracle:controlOracle.record,ownerOracle:ownerOracle.record},null,2)+'\n',{mode:0o600,flag:'wx'});
 await fsp.writeFile(path.join(out,'result.json'),JSON.stringify(final,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({status:final.status,fixtureScope,result:path.join(out,'result.json'),error:final.error??final.transportError}));if(final.status!=='PASS_MANAGED_LOCAL_FILE_ROUTE')process.exitCode=1;
}

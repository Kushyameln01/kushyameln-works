#!/usr/bin/env node
// Actual local File + pinned public LoRA/Diffusion browser joint runner.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const argv=process.argv.slice(2),args={};
if(argv.includes('--help')){console.log('node tools/ai-connection/test-lora-diffusion.mjs --peer-root <fixed peer checkout> --peer-commit <40hex> --side HIGH|LOW --base <actual original> --base-receipt <verified acquisition receipt> --lora-root <original folder> --out <private evidence folder>');process.exit(0);}
for(let i=0;i<argv.length;i+=2){if(!argv[i].startsWith('--')||!argv[i+1])throw Error('Explicit named argument/value required');args[argv[i].slice(2)]=argv[i+1];}
for(const k of ['peer-root','peer-commit','side','base','base-receipt','lora-root','out'])if(!args[k])throw Error('Missing --'+k);
if(!['HIGH','LOW'].includes(args.side)||!/^[a-f0-9]{40}$/.test(args['peer-commit']))throw Error('Pinned peer commit and explicit HIGH/LOW required');
const out=path.resolve(args.out),peerRoot=path.resolve(args['peer-root']),refDir=path.join(out,'reference'),actualDir=path.join(out,'actual');
await fsp.mkdir(refDir,{recursive:true});await fsp.mkdir(actualDir,{recursive:true});
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const sha=b=>createHash('sha256').update(b).digest('hex'),baseReceipt=JSON.parse(await fsp.readFile(args['base-receipt'],'utf8')),baseStat=await fsp.stat(args.base,{bigint:true});
if(baseReceipt.fullFileVerified!==true||baseReceipt.role!==args.side||String(baseReceipt.expectedBytes)!==String(baseStat.size))throw Error('A complete verified base acquisition receipt is required');
const actualDigest=baseReceipt.actualSHA256??baseReceipt.observedSHA256??baseReceipt.verifiedSHA256??baseReceipt.verifiedSha256??baseReceipt.sha256;
if(actualDigest!==baseReceipt.expectedSHA256)throw Error('Acquisition full-file SHA mismatch');
const bound=baseReceipt.fileStat;if(!bound||['size','mtimeNs','ino','dev'].some(k=>String(bound[k])!==String(baseStat[k])))throw Error('Full-hash receipt is not bound to this unchanged original file');
const baseHashes={HIGH:'9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52',LOW:'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3'};
if(actualDigest!==baseHashes[args.side])throw Error('Not the required original model');
console.log(JSON.stringify({stage:'reference',side:args.side,baseFullSha256:actualDigest,baseHashReceiptReused:true}));
execFileSync('python',[path.join(here,'lora-reference.py'),'--side',args.side,'--base',path.resolve(args.base),'--lora-root',path.resolve(args['lora-root']),'--out',refDir],{cwd:root,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},maxBuffer:2*1024*1024});
const reference=JSON.parse(await fsp.readFile(path.join(refDir,'reference.json'),'utf8')),requested=new Map(),ourRequested=new Map();
const serve=async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/joint'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><input id="base" type="file"><input id="loras" type="file" multiple>');return;}
  if(pathname.startsWith('/artifact/')&&req.method==='POST'){
   const name=pathname.slice('/artifact/'.length);if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error('Unsafe artifact name');let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>2*1024*1024)throw Error('Evidence artifact budget exceeded');chunks.push(c);}await fsp.writeFile(path.join(actualDir,name),Buffer.concat(chunks));res.end('saved');return;
  }
  let base,relative;
  if(pathname.startsWith('/our/')){base=path.join(root,'docs');relative=pathname.slice(5);}
  else if(pathname.startsWith('/peer/')){base=path.join(peerRoot,'docs');relative=pathname.slice(6);}
  else if(pathname.startsWith('/reference/')){base=refDir;relative=pathname.slice(11);}
  else if(pathname==='/runner/joint-browser-cases.mjs'){base=here;relative='joint-browser-cases.mjs';}
  else{res.writeHead(404).end();return;}
  const file=path.resolve(base,relative);if(!file.startsWith(path.resolve(base)+path.sep))throw Error('Unsafe source path');const bytes=await fsp.readFile(file);
  if(pathname.startsWith('/peer/')){const repoPath=path.posix.join('docs',relative),expected=execFileSync('git',['show',args['peer-commit']+':'+repoPath],{cwd:root,maxBuffer:32*1024*1024});if(!bytes.equals(expected))throw Error('Peer source differs from pinned Git object: '+repoPath);requested.set(repoPath,{path:repoPath,bytes:bytes.length,sha256:sha(bytes),gitCommit:args['peer-commit']});}
  if(pathname.startsWith('/our/')||pathname==='/runner/joint-browser-cases.mjs'){const repoPath=pathname.startsWith('/our/')?path.posix.join('docs',relative):'tools/ai-connection/joint-browser-cases.mjs',expected=execFileSync('git',['show',sourceCommit+':'+repoPath],{cwd:root,maxBuffer:32*1024*1024});if(!bytes.equals(expected))throw Error('LoRA/runner source differs from pinned Git object: '+repoPath);ourRequested.set(repoPath,{path:repoPath,bytes:bytes.length,sha256:sha(bytes),gitCommit:sourceCommit});}
  res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'application/octet-stream');res.end(bytes);
 }catch(error){console.error(String(error));res.writeHead(500).end(String(error));}
};
const server=http.createServer((req,res)=>{void serve(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=require(process.env.LORA_PLAYWRIGHT_MODULE??'/opt/codex/cua_node/lib/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.LORA_CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));page.on('console',m=>{if(m.text().startsWith('JOINT '))console.log(m.text());});await page.goto(`http://127.0.0.1:${server.address().port}/joint`);
 await page.locator('#base').setInputFiles(path.resolve(args.base));const inventory=JSON.parse(await fsp.readFile(path.join(root,'development/lora/contracts/original-inventory.json'),'utf8'));
 const files=inventory.filter(x=>x.side.toUpperCase()===args.side).map(x=>path.join(path.resolve(args['lora-root']),x.pairId+'-safetensors',x.fileName));await page.locator('#loras').setInputFiles(files);
 const result=await page.evaluate(async reference=>{try{const {runJointCases}=await import('/runner/joint-browser-cases.mjs');return await runJointCases({baseFile:document.querySelector('#base').files[0],loraFiles:[...document.querySelector('#loras').files],reference});}catch(e){return {status:'FAIL',error:String(e.stack||e),cause:String(e.cause??'')};}},reference);
 const after=await fsp.stat(args.base,{bigint:true}),baseUnchanged=['size','mtimeNs','ino','dev'].every(k=>String(after[k])===String(baseStat[k]));
 const final={dateJST:'2026-10-31',browser:browser.version(),peerCommit:args['peer-commit'],loraSourceCommit:sourceCommit,runnerSourceSHA256:sha(await fsp.readFile(fileURLToPath(import.meta.url))),oracleSourceSHA256:sha(await fsp.readFile(path.join(here,'lora-reference.py'))),sourceInputs:'genuine local immutable original File references; no sparse model surrogate',baseAcquisitionReceipt:baseReceipt,baseFileUnchangedAcrossTrial:baseUnchanged,pageErrors,peerSourceFiles:[...requested.values()],ourSourceFiles:[...ourRequested.values()],...result};
 if(!baseUnchanged){final.status='FAIL';final.error='Original file changed after its bound hash receipt';}
 await fsp.writeFile(path.join(out,'result.json'),JSON.stringify(final,null,2)+'\n');await fsp.copyFile(args['base-receipt'],path.join(out,'base-acquisition-receipt.json'));
 console.log(JSON.stringify({status:final.status,side:args.side,cases:final.cases?.length,pageErrors,result:path.join(out,'result.json'),error:final.error}));if(final.status!=='PASS_DIAGNOSTIC_PARTIAL'||pageErrors.length)process.exitCode=1;
}finally{await browser.close();await new Promise(r=>server.close(r));}

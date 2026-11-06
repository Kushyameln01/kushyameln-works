// Import-only receiver verification. No File, SDK operation, model or tensor is used.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const receiverRoot='/workspace/work/lora-implementation';
const roots={receiver:receiverRoot,management:'/workspace/work/lora/manager-edda43',lora:'/workspace/work/lora/p3-owner-fc278',diffusion:'/workspace/work/lora/nonrect-peer-5f880'};
const commits={receiver:execFileSync('git',['rev-parse','HEAD'],{cwd:receiverRoot,encoding:'utf8'}).trim(),management:'edda43f9ea69c5b3ab1af3c6eb82295f2912887c',lora:'fc2789a0f649e33f15eb13750e6a983b5c52d170',diffusion:'5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3'};
const sha=b=>createHash('sha256').update(b).digest('hex'),sources=new Map(),requests=[],errors=[];
async function source(owner,relative){
 const file=path.resolve(roots[owner],relative);if(!file.startsWith(roots[owner]+'/'))throw Error('Escaping source');
 const bytes=await fs.readFile(file),expected=execFileSync('git',['show',commits[owner]+':'+relative],{cwd:receiverRoot,maxBuffer:64*1024*1024});if(!bytes.equals(expected))throw Error('Uncommitted source '+relative);
 sources.set(owner+':'+relative,{owner,commit:commits[owner],path:relative,byteLength:bytes.length,sha256:sha(bytes)});return bytes;
}
const cli=new TextDecoder().decode(await source('receiver','tools/ai-connection/test-lora-managed-snapshot.mjs'));
const list=cli.match(/const receiverFiles=new Set\(\[([^\]]+)\]\)/)?.[1];if(!list)throw Error('Actual receiver allowlist unavailable');
const receiverFiles=new Set([...list.matchAll(/'([^']+)'/g)].map(m=>m[1]));
const server=http.createServer((req,res)=>{void(async()=>{try{
 const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname);requests.push(name);
 if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,">');return;}
 let owner,relative;
 if(name.startsWith('/receiver/')){owner='receiver';relative=name.slice('/receiver/'.length);if(!receiverFiles.has(relative))throw Error('Actual receiver route refuses '+relative);}
 else if(name.startsWith('/management/shared/')){owner='management';relative='docs/shared/'+name.slice('/management/shared/'.length);}
 else if(name.startsWith('/lora/shared/')){owner='lora';relative='docs/shared/'+name.slice('/lora/shared/'.length);}
 else if(name.startsWith('/diffusion/shared/')){owner='diffusion';relative='docs/shared/'+name.slice('/diffusion/shared/'.length);}
 else if(name==='/lora-tools/ai-connection/joint-browser-cases.mjs'){owner='lora';relative='tools/ai-connection/joint-browser-cases.mjs';}
 else throw Error('Unexpected request '+name);
 const bytes=await source(owner,relative);res.setHeader('Content-Type',relative.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(bytes);
 }catch(error){errors.push(String(error));res.writeHead(500).end('Pinned import unavailable');}})();});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const report={scope:'import-only use of actual receiver allowlist and fixed source blobs',commits,originalFilesOpened:0,nativeOperationsInvoked:0,modelInference:false};
try{
 const {chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});report.browser=browser.version();const page=await browser.newPage();page.on('pageerror',error=>errors.push(String(error)));await page.goto('http://127.0.0.1:'+server.address().port+'/');
 report.exports=await page.evaluate(async()=>{const [data,numeric,shim,cases]=await Promise.all([import('/receiver/docs/shared/inference/lora/management-admission-inputs.mjs'),import('/receiver/docs/shared/inference/lora/numeric-declarations.mjs'),import('/receiver/tools/ai-connection/p3-norm-edge.mjs'),import('/receiver/tools/ai-connection/managed-snapshot-browser-cases.mjs')]);return {inputVersion:data.LORA_MANAGEMENT_ADMISSION_INPUTS_VERSION,numericVersion:numeric.LORA_NUMERIC_DECLARATIONS_VERSION,inputFactory:typeof data.createLoraManagementAdmissionInputs,numericFactory:typeof numeric.describeLoraNumericDeclarations,legacyShim:typeof shim.createP3NormEdge,receiverEntry:typeof cases.runManagedSnapshotCases};});
 if(errors.length||Object.entries(report.exports).some(([key,value])=>!key.endsWith('Version')&&value!=='function')||requests.some(p=>p.endsWith('.wasm')||p.endsWith('.safetensors')))throw Error('Import-only invariant failed');
 report.status='PASS_IMPORT_ONLY_RECEIVER_HANDOFF';
}catch(error){report.status='FAIL';report.error=String(error.stack??error);process.exitCode=1;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));report.requests=requests;report.errors=errors;report.sourceProof=[...sources.values()];await fs.writeFile('/workspace/work/lora/management-handoff/import-smoke.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,sourceFiles:report.sourceProof.length,originalFilesOpened:0,nativeOperationsInvoked:0,error:report.error}));

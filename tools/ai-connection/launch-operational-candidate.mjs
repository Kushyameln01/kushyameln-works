#!/usr/bin/env node
// Serve this checkout's operational UI and native dependencies. Models remain
// local browser Files; no model directory or private output is mounted here.
import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,extname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const git=promisify(execFile);
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
const fail=(code,message)=>Object.assign(Error(message),{code});
const within=(root,file)=>file.startsWith(root+sep);

export function parseOptions(argv){
 const options={port:8765,coi:false};
 for(let index=0;index<argv.length;index++){
  const name=argv[index];
  if(name==='--help'){options.help=true;continue;}
  if(!['--port','--coi','--source-commit'].includes(name))throw fail('INVALID_OPTION','Unknown option: '+name);
  const value=argv[++index];
  if(value===undefined)throw fail('INVALID_OPTION','Value required for '+name);
  if(name==='--port'){
   if(!/^\d+$/.test(value)||Number(value)>65535)throw fail('INVALID_PORT','Use --port 0..65535');
   options.port=Number(value);
  }else if(name==='--coi'){
   if(!['true','false'].includes(value))throw fail('INVALID_COI','Use --coi true or --coi false');
   options.coi=value==='true';
  }else{
   if(!/^[a-f0-9]{40}$/.test(value))throw fail('INVALID_SOURCE_COMMIT','Use a complete 40-character source commit');
   options.sourceCommit=value;
  }
 }
 return options;
}

export async function startOperationalCandidate({port=8765,coi=false,sourceCommit,root=ROOT}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw fail('INVALID_PORT','Use --port 0..65535');
 if(typeof coi!=='boolean')throw fail('INVALID_COI','COI must be explicit true or false');
 if(sourceCommit&&!/^[a-f0-9]{40}$/.test(sourceCommit))throw fail('INVALID_SOURCE_COMMIT','Use a complete 40-character source commit');
 root=await realpath(root);
 const docsPath=join(root,'docs'),docs=await realpath(docsPath);
 if(!within(root,docs))throw fail('DOCS_OUTSIDE_CHECKOUT','docs must be inside this checkout');
 async function requireHead(){
  const head=(await git('git',['-C',root,'rev-parse','HEAD'])).stdout.trim();
  if(sourceCommit&&head!==sourceCommit)throw fail('SOURCE_HEAD_MISMATCH','--source-commit must equal this checkout HEAD');
  return head;
 }
 const head=await requireHead();
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(coi){
   res.setHeader('Cross-Origin-Opener-Policy','same-origin');
   res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
   res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  }
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');res.writeHead(405).end();return;}
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
   if(pathname==='/'){res.writeHead(302,{Location:'/ai-connection/modules/'}).end();return;}
   if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
   let file=resolve(docs,'.'+pathname),sourceFile=resolve(docsPath,'.'+pathname);
   if(!within(docs,file))throw fail('PATH_OUTSIDE_DOCS','Only this checkout docs tree is served');
   if((await stat(file)).isDirectory()){
    if(!pathname.endsWith('/')){res.writeHead(302,{Location:pathname+'/'}).end();return;}
    file=join(file,'index.html');
    sourceFile=join(sourceFile,'index.html');
   }
   file=await realpath(file);
   if(!within(docs,file))throw fail('PATH_OUTSIDE_DOCS','No private paths or external symlinks are served');
   const bytes=await readFile(file);
   if(sourceCommit){
    await requireHead();
    // Bind the Git object to the requested docs path, even if the working
    // path is a symlink to a different committed source within this checkout.
    const name=relative(root,sourceFile).split(sep).join('/');
    let committed;
    try{committed=(await git('git',['-C',root,'show',sourceCommit+':'+name],{encoding:'buffer',maxBuffer:64*1024*1024})).stdout;}
    catch{throw fail('SOURCE_NOT_FROZEN','Requested source is not in the fixed commit: '+name);}
    if(!bytes.equals(committed))throw fail('SOURCE_NOT_FROZEN','Working source differs from '+sourceCommit+':'+name);
   }
   res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');
   res.setHeader('Content-Length',bytes.length);
   res.writeHead(200);res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){
   const status=error.code==='PATH_OUTSIDE_DOCS'?403:error.code?.startsWith('SOURCE_')?409:['ENOENT','ENOTDIR','EISDIR'].includes(error.code)?404:error instanceof URIError?400:500;
   res.setHeader('Content-Type','text/plain; charset=utf-8');
   res.writeHead(status).end(req.method==='HEAD'?undefined:status===409?error.code+': '+error.message:status===500?'Source unavailable':String(status));
  }
 });
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
 const origin='http://127.0.0.1:'+server.address().port;
 return {server,origin,url:origin+'/ai-connection/modules/',head,coi,sourceCommit:sourceCommit??null,close:()=>new Promise((done,reject)=>server.close(error=>error?reject(error):done()))};
}

async function main(){
 const options=parseOptions(process.argv.slice(2));
 if(options.help){
  process.stdout.write('Usage: node tools/ai-connection/launch-operational-candidate.mjs [--port 8765] [--coi false|true] [--source-commit FULL_SHA]\nServes this checkout docs on 127.0.0.1 only. Default UI: 1 thread, no COI.\nFor 4 threads, explicitly use --coi true, verify COI/SAB, then select 4 in the UI.\nWithout --source-commit this is a working-tree candidate; no fixed-source claim.\nStop with Ctrl+C. Models are selected as local Files, never HTTP-mounted.\n');
  return;
 }
 const running=await startOperationalCandidate(options);
 process.stdout.write(JSON.stringify({url:running.url,checkout:ROOT,head:running.head,coiHeaders:running.coi,defaultUiThreads:1,sourceCommit:running.sourceCommit,sourceMode:running.sourceCommit?'HEAD and requested source bytes checked against Git':'working-tree candidate; fixed source unverified',stop:'Ctrl+C (SIGINT/SIGTERM)',modelTransport:'browser local File selection; no private HTTP mount'})+'\n');
 let stopping=false;
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(stopping)return;stopping=true;running.close().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write((error.code??'ERROR')+': '+error.message+'\n');process.exitCode=1;});

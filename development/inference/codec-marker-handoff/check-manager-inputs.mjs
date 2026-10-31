#!/usr/bin/env node
// Same-host actual browser File/Map configure probe; no model execution.
import assert from 'node:assert/strict';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const HERE=dirname(fileURLToPath(import.meta.url));
const FLAGS=['manager-root','native-root','rect-bundle','text-bundle','text-source','output'];
const HELP='node check-manager-inputs.mjs --manager-root <dir> --native-root <dir> --rect-bundle <dir> --text-bundle <dir> --text-source <file> --output <fresh-json>';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function parse(argv){
 if(argv.length===1&&argv[0]==='--help'){console.log(HELP);return null;}
 const args={};
 for(let i=0;i<argv.length;i+=2){const key=argv[i]?.startsWith('--')?argv[i].slice(2):'';if(!FLAGS.includes(key)||args[key]!==undefined||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Explicit unique supported path arguments required. '+HELP);args[key]=resolve(argv[i+1]);}
 for(const key of FLAGS)if(!args[key])throw Error('Missing --'+key+'. '+HELP);
 return args;
}
async function manifestAt(bundle,expected){const path=resolve(bundle,'manifest.json'),raw=await readFile(path);assert.equal(raw.byteLength,expected.byteLength);assert.equal(digest(raw),expected.sha256,'Selected manifest SHA-256');return {path,byteLength:raw.byteLength,sha256:digest(raw)};}
async function browser(config){
 const child=spawn(process.env.WORKS_INPUT_PYTHON??'python',[resolve(HERE,'browser-inputs.py')],{stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.stdin.end(JSON.stringify(config));
 const timer=setTimeout(()=>child.kill('SIGTERM'),60000);
 try{return await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{try{if(code!==0)throw Error('Browser helper failed: '+stderr);const receipt=JSON.parse(stdout);accept({receipt,child:{pid:child.pid,exitCode:code,exitSignal:signal,exitObserved:true,reportedHarnessPid:receipt.processOwnership?.harnessPid,reportedHarnessCtime:receipt.processOwnership?.harnessCtime,pidMatchesReportedHarness:child.pid===receipt.processOwnership?.harnessPid}});}catch(error){reject(error);}});});}finally{clearTimeout(timer);}
}
async function run(args){
 const selected=JSON.parse(await readFile(resolve(HERE,'INPUTS.json'),'utf8'));
 const result={schemaVersion:'works-same-host-configure-check/1.0',passed:false,scope:'Actual acquired manager adapter + native module configure with real Chromium local File/Map; same host, no separate Codex environment acceptance',inputPaths:args,sourcePins:selected.sourcePins,sourceChecks:[],importedModuleChecks:[],manifestChecks:{},localInputLengthChecks:[],neuralRuns:0,exportRuns:0,assetPayloadHashesVerified:false,originalModelReinventoried:false,actualSeparateManagerEnvironmentAck:false,fullReferenceAdoptionTested:false,descriptorScope:'Local configure-only direct adapter dispatch declaration; not production M1/evaluateEdge/adoption acceptance'};
 let server;const served=new Map();
 try{
  for(const expected of selected.sourceInspection){if(!expected.path.endsWith('.mjs'))continue;const kind=expected.commit===selected.sourcePins.managerRequested?'manager':'native',root=args[kind+'-root'];const raw=await readFile(resolve(root,expected.path));assert.equal(digest(raw),expected.sha256,'Acquired source: '+expected.path);assert.equal(raw.byteLength,expected.byteLength);result.sourceChecks.push({...expected,kind,matchesSelectedInspection:true});}
  result.runtimeHelperChecks=[];for(const expected of selected.runtimeHelperInspection??[]){const raw=await readFile(resolve(args['native-root'],expected.path));assert.equal(digest(raw),expected.sha256,'Process ownership helper hash');result.runtimeHelperChecks.push({...expected,matchesSelectedInspection:true});}
  result.probeSourceChecks=[];for(const file of ['check-manager-inputs.mjs','browser-configure-probe.mjs','browser-inputs.py']){const raw=await readFile(resolve(HERE,file));result.probeSourceChecks.push({path:file,sha256:digest(raw),byteLength:raw.byteLength});}
  result.manifestChecks={rect:await manifestAt(args['rect-bundle'],selected.rect.manifest),text:await manifestAt(args['text-bundle'],selected.text.manifest)};
  for(const [module,rows] of [['rect',selected.rect.assets],['text',selected.text.assets]])for(const row of rows){const path=module==='text'&&row.role==='original-embedding-source'?args['text-source']:resolve(args[module+'-bundle'],row.mapKey);const info=await stat(path);assert.ok(info.isFile());assert.equal(info.size,row.expectedBytes,'Local input length: '+row.mapKey);result.localInputLengthChecks.push({module,mapKey:row.mapKey,path,bytes:info.size,payloadRead:false});}
  server=createServer(async(req,res)=>{try{
   if(req.method!=='GET'){res.writeHead(405);res.end();return;}
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><input type=file multiple id=rect><input type=file multiple id=text><input type=file id=source><script type=module src="/browser-configure-probe.mjs"></script>');return;}
   if(pathname==='/browser-configure-probe.mjs'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile(resolve(HERE,'browser-configure-probe.mjs')));return;}
   const match=/^\/(manager|native)\/(.+\.mjs)$/.exec(pathname);if(!match||pathname.includes('\\')||pathname.includes('\0')){res.writeHead(404);res.end();return;}
   const [,kind,relative]=match,root=args[kind+'-root'],path=resolve(root,relative);if(!path.startsWith(root+sep))throw Error('Source path escapes explicit root');
   const raw=await readFile(path),expected=selected.sourceInspection.find(x=>x.path===relative&&(kind==='manager'?x.commit===selected.sourcePins.managerRequested:x.commit!==selected.sourcePins.managerRequested));
   assert.ok(expected,'Unbound imported source: '+kind+'/'+relative);assert.equal(digest(raw),expected.sha256,'Imported source SHA');
   served.set(kind+'/'+relative,{kind,path:relative,sha256:digest(raw),byteLength:raw.byteLength,expectedSourcePin:expected.commit,matchesSelectedInspection:true});res.writeHead(200,{'Content-Type':'text/javascript'});res.end(raw);
  }catch(error){res.writeHead(500,{'Content-Type':'text/plain'});res.end(error.message);}});
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
  const config={url:'http://127.0.0.1:'+server.address().port+'/',spec:selected,rectFiles:[resolve(args['rect-bundle'],'manifest.json'),...selected.rect.assets.map(x=>resolve(args['rect-bundle'],x.mapKey))],textFiles:[resolve(args['text-bundle'],'manifest.json'),...selected.text.assets.filter(x=>x.role!=='original-embedding-source').map(x=>resolve(args['text-bundle'],x.mapKey))],textSource:args['text-source'],nativeRoot:args['native-root']};
  const launch=await browser(config);result.browser=launch.receipt;result.pythonChild=launch.child;assert.equal(launch.child.pidMatchesReportedHarness,true);
  result.importedModuleChecks=[...served.values()].sort((a,b)=>(a.kind+a.path).localeCompare(b.kind+b.path));
  assert.equal(result.browser.passed,true,JSON.stringify(result.browser.error??result.browser.configure?.error??result.browser.pageErrors));
  assert.equal(result.browser.configure.actualOriginalFileBytes,selected.text.originalModelBytes);
  assert.equal(result.browser.browserClosed,true);assert.equal(result.browser.configure.neuralRuns,0);
  result.passed=true;
 }catch(error){result.error={name:error.name,message:error.message};}
 finally{if(server){server.closeAllConnections();await new Promise(resolveClose=>server.close(resolveClose));}result.localServerClosed=true;}
 result.nodeFileLimit={status:'DETECTED_AND_NOT_USED',statBytes:6735906897,node24OpenAsBlobAndFileBytes:2440939601,scope:'Existing source-file metadata characterization; no original payload read',failedTrialPath:'INPUTS.node-file-limit.json',resolution:'Use actual Chromium file input; never fabricate size or replace model'};
 result.limits=['Configure does not verify graph/original payload hashes or numeric execution','Same host/shared filesystem only; separate management Codex ACK remains unverified','API build label is not a source digest; exact imported module bytes are recorded','No Text plain independent numeric comparison or production admission/resource claim'];
 await mkdir(dirname(args.output),{recursive:true});await writeFile(args.output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,output:args.output,importedModuleCount:result.importedModuleChecks.length,guards:result.browser?.configure?.guards??null,error:result.error??null}));return result.passed?0:1;
}
try{const args=parse(process.argv.slice(2));if(args)process.exitCode=await run(args);}catch(error){console.error(error.message);process.exitCode=1;}

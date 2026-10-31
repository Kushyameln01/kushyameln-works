/** Explicit-source CLI for the mandatory Rect decode route. This file never
 * exports ONNX, downloads weights, or substitutes a different shape/model. */
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {resolve,dirname,relative,sep,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonicalBytes,sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';
import {loadReferenceSet} from '../../docs/shared/ai-connection/reference-loader.mjs';
import {createNormRequiredRectAdapter} from '../../docs/shared/ai-connection/adapters/norm-required-rect.mjs';
import {NORM_EXECUTION_POLICIES} from '../../docs/shared/ai-connection/norm-execution.mjs';
import {prepareRectNormInputs,RECT_NATIVE_COMMIT,RECT_CATALOG_SHA256,RECT_REFERENCE_SHA256,RECT_PRIOR_EVIDENCE} from './norm-required-rect-browser.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),REPO='Kushyameln01/kushyameln-works';
const INPUT_SHA256='dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612';
const MANIFEST_PATH='development/inference/e6/fixtures/bundle-manifest.json',MANIFEST_SHA256='450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a';
const fail=(code,message)=>Object.assign(Error(message),{code});
export const RECT_NATIVE_SOURCE_PINS=Object.freeze({
 'docs/shared/inference/vae-api.mjs':'75f791130cbb27961ea530376d4715ddd9555e80ee3e2b8453824af42be0511e',
 'docs/shared/inference/client.mjs':'53751cde923b7128da29266a29810942afd6e6ae32fad1fc87605e952cecd55e',
 'docs/shared/inference/tensor.mjs':'4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b',
 'docs/shared/inference/vae.mjs':'3b5f5d2cbe116f9477966da0a63d8f35141f14d9544efafde51e40db337b90d7',
 'docs/shared/inference/inference-worker.mjs':'2883899154abd747e8358b953c47977af3c0df064e8a32a32d719aeaaec07f35',
 'docs/shared/inference/vendor/ort.wasm.min.mjs':'d5a6d7bc8ee587648fb3742dde8c0094d17cbd3822a68bbec8ddfcd4f2adb88e',
 'docs/shared/inference/hike.mjs':'26f4eda97daf0ca66a05264aebf0cd9a7fd2e97350b974a5c2e7ad6e10fa5b65',
 'docs/shared/inference/text-encoder.mjs':'9d4f528a926dc40bdbf721c5072518d0e027019a5a0912deeac0dc0f449fd8a2',
 'docs/shared/inference/tokenizer.mjs':'4a7811d4e36fbcc568e2a2a1e0941fd78261f84b231a96458d919ea0259fb9a5',
 'docs/shared/inference/vendor/sentencepiece.mjs':'31ce41230f8694c63afa1ffeecb862d0bf3768d858328d335530997a86a1f27d',
 'docs/shared/inference/api.mjs':'01f56a19c58286f4c582cb41015ebd7773f2d7ae76545ab0ca7be052909c0f1f',
 'docs/shared/inference/text-encoder-api.mjs':'b20fc73262c12558e2c54fb7ac8bfd20775c39dd2dbe4a47efd0a73632ec9a99',
 'docs/shared/inference/kernel/tensor.wasm':'9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8',
 'docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs':'5687566b1bc1c8cf628d76c2ddb16b2a3b81a7997273d4666564880495088e57',
 'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm':'be0e129949062ad50290ef94683fac8be5bb6156f709e030b7a5f1661a2f6c17'
});
async function digestFile(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path,{highWaterMark:1024*1024}))hash.update(chunk);return hash.digest('hex');}
async function checkedBytes(path,expected,code){const b=new Uint8Array(await readFile(path));if(await sha256Bytes(b)!==expected)throw fail(code,`Bytes differ from the fixed original: ${path}`);return b;}
async function loadReferences(){
 const path='docs/shared/ai-connection/reference/catalog.v1.json',catalogBytes=new Uint8Array(await readFile(join(ROOT,path))),catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
 const files=new Map(await Promise.all(catalog.files.map(async f=>[f.path,new Uint8Array(await readFile(join(ROOT,f.path)))])));
 return loadReferenceSet({catalogBytes,files,expectedCatalogSha256:RECT_CATALOG_SHA256});
}
/** Original File hashes are streamed with bounded RAM. Missing assets remain
 * missing; no download, export, local search or alternate bundle is attempted. */
export async function preflightNormRequiredRect({nativeRoot,bundleRoot,inputPath,referencePath}={}){
 if(!nativeRoot)throw fail('NATIVE_ROOT_REQUIRED','Explicit --native-root is required');
 const sourceProof=[];
 for(const [path,sha256] of Object.entries(RECT_NATIVE_SOURCE_PINS)){
  let bytes;try{bytes=await checkedBytes(join(nativeRoot,path),sha256,'NATIVE_SOURCE_MISMATCH');}catch(e){if(e.code==='ENOENT')throw fail('NATIVE_SOURCE_MISMATCH',`Missing exact855 source: ${path}`);throw e;}
  sourceProof.push({sourceRef:{repository:REPO,commit:RECT_NATIVE_COMMIT,path},sha256,byteLength:bytes.length});
 }
 if(!bundleRoot||!inputPath||!referencePath)throw fail('ORIGINAL_INPUT_REQUIRED','Explicit --bundle-root, --input and --reference are required');
 const manifestBytes=await checkedBytes(join(nativeRoot,MANIFEST_PATH),MANIFEST_SHA256,'RECT_MANIFEST_MISMATCH'),manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
 const inputBytes=await checkedBytes(inputPath,INPUT_SHA256,'RECT_INPUT_ORIGINAL_MISMATCH'),referenceBytes=await checkedBytes(referencePath,RECT_REFERENCE_SHA256,'RECT_REFERENCE_MISMATCH');
 if(inputBytes.length!==1084||referenceBytes.length!==6144)throw fail('RECT_ORIGINAL_SIZE_MISMATCH','Exact recorded Rect input and reference lengths are required');
 const codec=await import(pathToFileURL(resolve(nativeRoot,'docs/shared/inference/tensor.mjs')).href),tensor=await codec.decodeTensor(inputBytes);
 if(JSON.stringify(tensor.shape)!=='[1,16,1,2,4]'||tensor.meaning!=='raw-posterior-mean'||tensor.normalization!==undefined||tensor.modelSha256!==manifest.model.sha256)throw fail('RECT_INPUT_ORIGINAL_MISMATCH','The original restored Rect mean profile must remain intact');
 const assetReceipts=[],missingAssets=[];
 for(const role of ['decoderBody','conv2Weight','conv2Bias']){
  const d=manifest.assets[role],path=resolve(bundleRoot,d.file);let s;try{s=await stat(path);}catch(e){if(e.code==='ENOENT'){missingAssets.push({role,fileName:d.file,expectedBytes:d.bytes,expectedSha256:d.sha256});continue;}throw e;}
  if(!s.isFile()||s.size!==d.bytes||await digestFile(path)!==d.sha256)throw fail('ORIGINAL_ASSET_MISMATCH',`Exact existing exported asset required: ${d.file}`);
  assetReceipts.push({role,fileName:d.file,path,byteLength:s.size,sha256:d.sha256,stat:{device:s.dev,inode:s.ino,size:s.size,mtimeMs:s.mtimeMs},fullBytesHashed:true});
 }
 return {sourceProof,manifest,tensor,assetReceipts,missingAssets,inputIdentity:{sourceRef:{repository:REPO,commit:'35151d1f447d6bba30931a8c28636b2d5d9c3820',path:'development/inference/reference-adoption/p2/run/restored.wktensor'},sha256:INPUT_SHA256,byteLength:inputBytes.length,payloadSha256:tensor.dataSha256,shape:tensor.shape,meaning:tensor.meaning,modelSha256:tensor.modelSha256,context:tensor.context},referenceIdentity:{sourceRef:{repository:REPO,commit:RECT_NATIVE_COMMIT,path:'development/inference/e6/fixtures/png-roundtrip.f32'},sha256:RECT_REFERENCE_SHA256,byteLength:referenceBytes.length,elements:1536},manifestIdentity:{sourceRef:{repository:REPO,commit:RECT_NATIVE_COMMIT,path:MANIFEST_PATH},sha256:MANIFEST_SHA256,byteLength:manifestBytes.length}};
}
async function managementSources(){
 const visited=new Set(),proof=[];
 async function visit(path){path=resolve(ROOT,path);if(visited.has(path))return;if(!path.startsWith(ROOT+sep))throw fail('MANAGER_SOURCE_ESCAPE','Imports must remain in the explicit repository');visited.add(path);const b=new Uint8Array(await readFile(path));proof.push({path:relative(ROOT,path).split(sep).join('/'),sha256:await sha256Bytes(b),byteLength:b.length});if(!path.endsWith('.mjs'))return;for(const m of new TextDecoder().decode(b).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g))await visit(resolve(dirname(path),m[1]));}
 await visit('tools/ai-connection/norm-required-rect-browser.mjs');await visit('tools/ai-connection/run-norm-required-rect.mjs');return proof;
}
function safeChild(root,path){if(typeof path!=='string'||!path||path.startsWith('/')||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw fail('UNSAFE_OUTPUT_PATH','Only exact package-relative paths are accepted');const file=resolve(root,path);if(!file.startsWith(resolve(root)+sep))throw fail('UNSAFE_OUTPUT_PATH','Package path escaped its fresh task output');return file;}
async function browserRun({nativeRoot,out,inputPath,referencePath,preflight,managerCommit,resourceState,scenario,managerSource}){
 const nativePins=new Map(preflight.sourceProof.map(p=>[p.sourceRef.path,p.sha256])),managerPins=new Map(managerSource.sourceReceipts.map(p=>[p.path,p.sha256]));
 const network=[],errors=[],workerEvents=[],workerRecords=new Map(),createdWaiters=new Map();let browser,server,page;
 const serverFaults=[];
 try{
  const html='<!doctype html><meta charset="utf-8"><title>Required Rect acceptance</title><input id="rect-assets" type="file" multiple><input id="rect-input" type="file"><input id="rect-reference" type="file"><script type="module">import {runNormRequiredRectBrowser} from "/tools/ai-connection/norm-required-rect-browser.mjs";globalThis.runRequiredRect=runNormRequiredRectBrowser;</script>';
  server=createServer(async(req,res)=>{try{
   if(req.method!=='GET'){res.writeHead(405);res.end();return;}
   const path=decodeURIComponent(new URL(req.url,'http://local').pathname);if(path==='/favicon.ico'){res.writeHead(204);res.end();return;}if(path==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;}
   let full,expected;
   if(path.startsWith('/native/')){const relativePath='docs/'+path.slice('/native/'.length);expected=nativePins.get(relativePath);if(!expected)throw fail('UNVERIFIED_NATIVE_RESOURCE',relativePath);full=resolve(nativeRoot,relativePath);}
   else if(path.startsWith('/docs/shared/ai-connection/reference/')){const relativePath=path.slice(1);full=safeChild(ROOT,relativePath);}
   else{const relativePath=path.slice(1);expected=managerPins.get(relativePath);if(!expected)throw fail('UNVERIFIED_MANAGER_RESOURCE',relativePath);full=safeChild(ROOT,relativePath);}
   const data=new Uint8Array(await readFile(full));if(expected&&await sha256Bytes(data)!==expected)throw fail('EXECUTED_SOURCE_CHANGED','Source changed after receipt before browser delivery');
   const type=full.endsWith('.mjs')?'text/javascript':full.endsWith('.wasm')?'application/wasm':full.endsWith('.json')?'application/json':'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Content-Length':data.length,'Cache-Control':'no-store'});res.end(data);
  }catch(e){serverFaults.push({code:e.code??null,message:e.message});if(!res.headersSent)res.writeHead(500);res.end('Verified local source unavailable');}});
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});const origin=`http://127.0.0.1:${server.address().port}`;
  const require=createRequire('/opt/codex/cua_node/package.json'),{chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  page=await browser.newPage();page.setDefaultTimeout(240000);page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>network.push({url:r.url(),method:r.method()}));
  await page.route('**/*',route=>route.request().method()==='GET'&&route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  page.on('worker',worker=>{const url=worker.url(),token=new URL(url).searchParams.get('rectJobToken');if(!token){errors.push('Native Worker lacks its exact owner token');return;}if(workerRecords.has(token)){errors.push('Worker owner token was reused');return;}let close;const closed=new Promise(r=>close=r),record={token,url,closed,proof:null};workerRecords.set(token,record);workerEvents.push({kind:'created',token,url});createdWaiters.get(token)?.();createdWaiters.delete(token);worker.on('close',()=>{record.proof={closed:true,token,url,event:'playwright-worker-close'};workerEvents.push({kind:'closed',token,url});close(record.proof);});});
  await page.exposeFunction('__rectAwaitWorkerClosed',async token=>{
   let timer;try{return await Promise.race([(async()=>{if(!workerRecords.has(token))await new Promise(r=>createdWaiters.set(token,r));return workerRecords.get(token).closed;})(),new Promise((_,no)=>timer=setTimeout(()=>no(fail('WORKER_CLOSE_NOT_OBSERVED','Timeout is not computation-stop evidence')),240000))]);}finally{clearTimeout(timer);createdWaiters.delete(token);}
  });
  await page.exposeFunction('__rectWritePackageFile',async(caseName,path,b64)=>{const directory=safeChild(out,caseName),file=safeChild(directory,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,Buffer.from(b64,'base64'),{flag:'wx'});});
  await page.exposeFunction('__rectReadPackageFile',async(caseName,path)=>{try{return (await readFile(safeChild(safeChild(out,caseName),path))).toString('base64');}catch(e){if(e.code==='ENOENT')return null;throw e;}});
  await page.goto(origin+'/');await page.locator('#rect-assets').setInputFiles(preflight.assetReceipts.map(a=>a.path));await page.locator('#rect-input').setInputFiles(resolve(inputPath));await page.locator('#rect-reference').setInputFiles(resolve(referencePath));await page.waitForFunction(()=>typeof globalThis.runRequiredRect==='function');
  const result=await page.evaluate(plan=>globalThis.runRequiredRect(plan),{manifest:preflight.manifest,managerCommit,resourceState,scenario,managerSource});
  return {...result,status:errors.length||serverFaults.length||[...workerRecords.values()].some(r=>!r.proof)?'FAIL':result.status,browserVersion:browser.version(),workerEvents,workerResources:{created:workerEvents.filter(e=>e.kind==='created').length,closed:workerEvents.filter(e=>e.kind==='closed').length,live:[...workerRecords.values()].filter(r=>!r.proof).map(r=>r.token)},network:{scope:'local GET only; original graph Files selected locally',requests:network},browserErrors:errors,sourceServerFaults:serverFaults};
 }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}
}
export async function runNormRequiredRect({nativeRoot,bundleRoot,inputPath,referencePath,out,managerCommit,resourceState,scenario='decode'}={}){
 if(!['decode','cancel-recover'].includes(scenario))throw fail('UNKNOWN_SCENARIO','Select decode or cancel-recover');
 if(!out||!/^[a-f0-9]{40}$/.test(managerCommit??''))throw fail('MANAGER_TARGET_REQUIRED','A fresh --out and full --manager-commit are required');
 const preflight=await preflightNormRequiredRect({nativeRoot,bundleRoot,inputPath,referencePath}),referenceSet=await loadReferences(),sourceReceipts=await managementSources();
 const managerSource={commit:null,baseCommit:managerCommit,reason:'Working-tree checkpoint is authenticated by explicit sourceReceipts; no uncommitted native pin is promoted.',sourceReceipts};
 const metadata=prepareRectNormInputs({tensor:preflight.tensor,referenceSet,managerCommit,resourceState});
 const blockedAdapter=createNormRequiredRectAdapter({nativeFactory:()=>{throw fail('NATIVE_DISPATCH_FORBIDDEN','Preflight must not create a native client');},descriptor:metadata.descriptor,binding:metadata.binding,sourceVerified:true,artifactStore:metadata.store,ownerLifecycle:{cancelled:()=>{throw fail('NO_NATIVE_JOB','No native job exists');},afterTerminal:()=>{throw fail('NO_NATIVE_JOB','No native job exists');},release:()=>{throw fail('NO_NATIVE_JOB','No native job exists');}},executionScope:'actual-vae-profile-decode'});
 let declaration,declarationFailure;
 try{declaration=await blockedAdapter.run({...metadata,manifest:preflight.manifest,files:new Map(),validationSpec:metadata.validationSpec,readCurrent:metadata.readCurrent,validateOutput:()=>{throw fail('NATIVE_DISPATCH_FORBIDDEN','No validation before actual output');},publishOutput:()=>{throw fail('NATIVE_DISPATCH_FORBIDDEN','No output before native decode');}});}catch(error){if(error.code!=='NORM_DECLARATION_BLOCKED'||!error.decision)throw error;declarationFailure={code:error.code,message:error.message,decision:error.decision};}finally{await blockedAdapter.dispose();metadata.store.clear();}
 await mkdir(dirname(resolve(out)),{recursive:true});await mkdir(out);
 const common={schemaVersion:'works-norm-required-rect-run/0.1-draft.1',scenario,nativeSource:{repository:REPO,commit:RECT_NATIVE_COMMIT,apiVersion:'works-ai-1',build:'works-inference-v1'},priorEvidence:metadata.priorInputEvidence,managementSource:managerSource,sourceProof:preflight.sourceProof,inputIdentity:preflight.inputIdentity,referenceIdentity:preflight.referenceIdentity,manifestIdentity:preflight.manifestIdentity,assetReceipts:preflight.assetReceipts,resourceState:resourceState??null,referenceCatalog:{sourceRef:{repository:REPO,commit:'6dae9a6fac3e9ad29ea941f22211edbe4aa894ad',path:'docs/shared/ai-connection/reference/catalog.v1.json'},sha256:RECT_CATALOG_SHA256},freshEncode:false,generationReady:false,snapshotPublished:false};
 let result;
 if(preflight.missingAssets.length||!resourceState||declarationFailure)result={...common,status:'BLOCKED',blockedEdge:preflight.missingAssets.length?'actual-vae-decode':declarationFailure?'norm-declaration':'explicit-model-resource-state',declarationFailure:declarationFailure??null,missingAssets:preflight.missingAssets,nativeCalls:0,browserLaunched:false,modelInference:false,reason:declarationFailure?'The sole norm judge rejected the explicit declaration or live resource state; see declarationFailure.':preflight.missingAssets.length?'Exact existing decode assets are absent; no model download/export/shape substitution.':'Original assets are present, but no explicit current model resource budget was provided.',normExecution:{...(declaration?.normExecution??{policyId:'rect-decode',phase:'declaration',executionCreated:false,decisions:[{phase:'declaration',decision:declarationFailure.decision}]}),requiredNormIds:[...NORM_EXECUTION_POLICIES['rect-decode'].requiredNormIds]}};
 else{try{result={...common,...await browserRun({nativeRoot,out,inputPath,referencePath,preflight,managerCommit,resourceState,scenario,managerSource}),browserLaunched:true};}catch(error){result={...common,status:'FAIL',browserLaunched:true,nativeCalls:null,error:{code:error.code??null,message:String(error.message??error)},modelInference:null};}}
 await writeFile(join(out,'result.json'),new Uint8Array([...canonicalBytes(result),10]),{flag:'wx'});return result;
}
const HELP='Usage: node tools/ai-connection/run-norm-required-rect.mjs --native-root <fixed855-source> --bundle-root <existing3assets> --input <351-restored.wktensor> --reference <existing-png-roundtrip.f32> --out <fresh-directory> --manager-commit <fullSHA> [--resource-state <explicitJSON-file>] [--scenario decode|cancel-recover]\nMissing original assets produce BLOCKED/native0 without launching a browser. Original encode evidence is reused; no re-export.';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(args.includes('--help'))console.log(HELP);else{const allowed=new Set(['native-root','bundle-root','input','reference','out','manager-commit','resource-state','scenario']),q={};for(let i=0;i<args.length;i+=2){const key=args[i]?.slice(2);if(!args[i]?.startsWith('--')||!allowed.has(key)||!args[i+1]||args[i+1].startsWith('--'))throw fail('INVALID_ARGUMENT',`Unknown or incomplete argument: ${args[i]}`);q[key]=args[i+1];}for(const key of ['native-root','bundle-root','input','reference','out','manager-commit'])if(!q[key])throw fail('MISSING_ARGUMENT',`Missing --${key}`);const resourceState=q['resource-state']?JSON.parse(await readFile(q['resource-state'],'utf8')):undefined,result=await runNormRequiredRect({nativeRoot:q['native-root'],bundleRoot:q['bundle-root'],inputPath:q.input,referencePath:q.reference,out:q.out,managerCommit:q['manager-commit'],resourceState,scenario:q.scenario});console.log(JSON.stringify({status:result.status,blockedEdge:result.blockedEdge??null,nativeCalls:result.nativeCalls,missingAssets:result.missingAssets??[],out:q.out},null,2));if(result.status==='FAIL')process.exitCode=1;}}catch(error){console.error(JSON.stringify({code:error.code??null,message:String(error.message??error)}));process.exitCode=1;}
}

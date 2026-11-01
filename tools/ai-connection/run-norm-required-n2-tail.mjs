#!/usr/bin/env node
/** Explicit retained-asset runner. It never downloads/recalculates a prefix,
 * reference or model. Private payloads travel through File/CDP, never HTTP. */
import {readFile,writeFile,mkdir,stat,open,realpath} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {dirname,resolve,join,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalBytes,canonicalize,hashCanonical,sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';
import {N2_TAIL_FILES,N2_TAIL_BUILD,N2_TAIL_SOURCE,verifyN2TailSource} from '../../docs/shared/ai-connection/adapters/n2-tail/source.mjs';
import {N2_TAIL_PUBLIC_FILES} from '../../docs/shared/ai-connection/adapters/n2-tail/input-pins.mjs';
import {N2_TAIL_PINS,N2_TAIL_TRUSTED_INPUTS,N2_TAIL_GATES,N2_TAIL_CATALOG_REF} from '../../docs/shared/ai-connection/adapters/n2-tail/declarations.mjs';
import {verifyAdoptedWktensorSource,ADOPTED_WKTENSOR_DEPLOYMENT_PATH} from '../../docs/shared/ai-connection/codecs/wktensor.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),base='development/ai-connection/self-attention-tail/';
const fail=(code,message)=>Object.assign(Error(message),{code});
const same=(a,b)=>canonicalize(a)===canonicalize(b);
const hash=b=>sha256Bytes(new Uint8Array(b));
const readonlyJSON=async path=>JSON.parse(await readFile(path,'utf8'));
function child(root,path){const file=resolve(root,path);if(typeof path!=='string'||path.startsWith('/')||path.includes('\\')||!file.startsWith(resolve(root)+sep)||path.split('/').some(s=>!s||s==='.'||s==='..'))throw fail('N2_TAIL_PATH_INVALID','Unsafe relative source/package path');return file;}
const f32=values=>{if(!Array.isArray(values)||values.some(v=>!Number.isFinite(v)))throw fail('N2_TAIL_PAYLOAD_INVALID','Finite F32 array required');return Float32Array.from(values);};
const f32hash=values=>hash(new Uint8Array(f32(values).buffer));
function budget(value){if(value===undefined)return null;if(value?.scope!=='n2-tail-diagnostic-only'||value.tailHikeCapacityBytes!==2883584||value.ortSharedMemoryCapacityBytes!==16777216||value.maxReturnedOutputBytes!==163840||!Number.isSafeInteger(value.maxElapsedMs)||value.maxElapsedMs<1||value.maxElapsedMs>2147483647)throw fail('N2_TAIL_DIAGNOSTIC_BUDGET_INVALID','Supply explicit N2 tail diagnostic capacities and positive maxElapsedMs; total RAM remains unknown');return structuredClone(value);}
async function checked(path,pin,code='N2_TAIL_PUBLIC_RECEIPT_MISMATCH'){
 const bytes=new Uint8Array(await readFile(path));if(pin.byteLength!==undefined&&bytes.byteLength!==pin.byteLength||await hash(bytes)!==pin.sha256)throw fail(code,'Exact pinned bytes required: '+path);return bytes;
}
async function verifyBuild(nativeRoot,publicFiles){
 const path='docs/shared/diffusion-models/api/build-info.mjs',text=new TextDecoder().decode(publicFiles.get(path)),match=text.match(/export const BUILD_SOURCES=Object\.freeze\(([\s\S]*)\);\s*$/);
 if(!match)throw fail('N2_TAIL_BUILD_MISMATCH','Fixed current100 source inventory missing');const inventory=JSON.parse(match[1]);
 if(Object.keys(inventory).length!==100||await hashCanonical(inventory)!==N2_TAIL_BUILD.split('+')[1])throw fail('N2_TAIL_BUILD_MISMATCH','Fixed current100 source inventory digest differs');
 const records=[];for(const [name,sha256]of Object.entries(inventory)){const file=resolve(nativeRoot,'docs/shared/diffusion-models/api',name);if(!file.startsWith(resolve(nativeRoot)+sep))throw fail('N2_TAIL_BUILD_MISMATCH','Build inventory escaped root');const bytes=await checked(file,{sha256},'N2_TAIL_BUILD_MISMATCH');records.push({path:relative(nativeRoot,file).split(sep).join('/'),sha256,byteLength:bytes.length});}
 return {buildId:N2_TAIL_BUILD,sourceInventorySHA256:await hashCanonical(inventory),verifiedSourceCount:100,files:records,scope:'current100 public build closure; separate from executed source proof and actual numerical acceptance'};
}
async function privateJSON(path,pin,role,side,missing,receipts){
 if(!path){missing.push({side,role,path:null,expectedSha256:pin.sha256,expectedBytes:pin.byteLength??null,reason:'Explicit asset path not supplied'});return null;}
 if(!isAbsolute(path)||resolve(path)===ROOT||resolve(path).startsWith(ROOT+sep))throw fail('N2_TAIL_PRIVATE_PATH_REQUIRED','Private assets must be explicit absolute paths outside this repository: '+role);
 let s;try{s=await stat(path);}catch(e){if(e.code==='ENOENT'){missing.push({side,role,path,expectedSha256:pin.sha256,expectedBytes:pin.byteLength??null,reason:'Actual payload missing at supplied path'});return null;}throw e;}
 if((await realpath(path)).startsWith(ROOT+sep))throw fail('N2_TAIL_PRIVATE_PATH_REQUIRED','Private asset resolves inside repository');
 if(!s.isFile()||s.size>32*1024*1024)throw fail('N2_TAIL_PRIVATE_PAYLOAD_INVALID','Expected a bounded retained JSON artifact: '+role);
 const bytes=await checked(path,pin,'N2_TAIL_PRIVATE_HASH_MISMATCH');receipts.push({side,role,path,sha256:pin.sha256,byteLength:bytes.length,fullBytesHashedThisRun:true});return JSON.parse(new TextDecoder().decode(bytes));
}
async function modelReceipt(path,anchor,side,missing,receipts){
 if(!path){missing.push({side,role:'model',path:null,expectedBytes:15574833216,expectedHeaderSHA256:anchor.headerSHA256,reason:'Explicit original model File path not supplied'});return;}
 if(!isAbsolute(path)||resolve(path).startsWith(ROOT+sep))throw fail('N2_TAIL_PRIVATE_PATH_REQUIRED','Original model must remain outside repository');
 let s;try{s=await stat(path);}catch(e){if(e.code==='ENOENT'){missing.push({side,role:'model',path,expectedBytes:15574833216,expectedHeaderSHA256:anchor.headerSHA256,reason:'Original model File absent'});return;}throw e;}
 if((await realpath(path)).startsWith(ROOT+sep))throw fail('N2_TAIL_PRIVATE_PATH_REQUIRED','Original model resolves inside repository');
 if(!s.isFile()||s.size!==15574833216)throw fail('N2_TAIL_MODEL_MISMATCH','Original model size differs');const file=await open(path,'r');
 try{const prefix=Buffer.alloc(8);if((await file.read(prefix,0,8,0)).bytesRead!==8)throw fail('N2_TAIL_MODEL_MISMATCH','Model header prefix truncated');const size=prefix.readBigUInt64LE();if(size<2n||size>1048576n)throw fail('N2_TAIL_MODEL_MISMATCH','Original bounded model header length differs');const header=Buffer.alloc(Number(size));if((await file.read(header,0,header.length,8)).bytesRead!==header.length||await hash(header)!==anchor.headerSHA256)throw fail('N2_TAIL_MODEL_MISMATCH','Original model header identity differs');receipts.push({side,role:'model',path,byteLength:s.size,headerByteLength:header.length,headerSHA256:anchor.headerSHA256,fullFileSHA256Verified:false,fullFileHashRecomputed:false,selectedParameterBytesMustBeVerifiedByNativeOwner:true});}finally{await file.close();}
}
/** Public source receipts can be checked while actual private inputs are absent.
 * Missing assets are returned; a known identity mismatch rejects immediately. */
export async function preflightNormRequiredN2Tail({nativeRoot,assets={},diagnosticBudget}={}){
 if(!nativeRoot)throw fail('N2_TAIL_NATIVE_ROOT_REQUIRED','Explicit fixed --native-root required');const limits=budget(diagnosticBudget),files=new Map();
 for(const pin of N2_TAIL_FILES)files.set(pin.path,await checked(child(nativeRoot,pin.path),pin,'N2_TAIL_SOURCE_MISMATCH'));
 const sourceProof=await verifyN2TailSource({files}),publicFiles=new Map(),publicReceiptProof=[];
 for(const pin of N2_TAIL_PUBLIC_FILES){const bytes=await checked(child(nativeRoot,pin.path),pin);publicFiles.set(pin.path,bytes);publicReceiptProof.push({...pin,sourceRef:{...N2_TAIL_SOURCE,path:pin.path}});}
 const buildSourceProof=await verifyBuild(nativeRoot,publicFiles),codecProof=await verifyAdoptedWktensorSource(new Uint8Array(await readFile(join(ROOT,ADOPTED_WKTENSOR_DEPLOYMENT_PATH))));
 const parse=path=>JSON.parse(new TextDecoder().decode(publicFiles.get(path))),tailPlan=parse(base+'core/candidate-plan.json');if(!same(Object.fromEntries(Object.keys(N2_TAIL_GATES).map(k=>[k,tailPlan.gates[k]])),N2_TAIL_GATES))throw fail('N2_TAIL_GATES_CHANGED','Frozen eight owner gates required');
 const missingAssets=[],assetReceipts=[],payloads={};let savedCount=0;
 for(const side of ['HIGH','LOW']){
  const low=side.toLowerCase(),a=assets[side]??{},trusted=N2_TAIL_TRUSTED_INPUTS[side],prefixReceipt=parse('development/ai-connection/qkv-next/hidden-runtime/'+low+'-comparison.json'),capture=parse(base+'integration/'+low+'-attention-capture.json'),localReceipt=parse(base+'core/final-reference/'+low+'-local-reference-receipt.json'),composedReceipt=parse(base+'core/final-reference/'+low+'-composed-reference-receipt.json'),savedReceipt=parse(base+'output-export/'+low+'-export-receipt.json');
  if(!same(savedReceipt.inputBindings,trusted)||!same(localReceipt.gates,tailPlan.gates)||!same(composedReceipt.gates,tailPlan.gates)||!prefixReceipt.passed||!capture.passed||!capture.producerDisposed||!capture.browserCloseBarrier.browserDisconnected||capture.blockIndex!==0||capture.scheduleIndex!==trusted.scheduleIndex)throw fail('N2_TAIL_INPUT_RECEIPT_MISMATCH','Fixed source input/owner-close/gate receipts differ');
  const prefix=await privateJSON(a.fullPrefixArtifact,{sha256:trusted.fullPrefix.artifactSHA256},'fullPrefixArtifact',side,missingAssets,assetReceipts),attention=await privateJSON(a.attentionArtifact,{sha256:trusted.attention.artifactSHA256},'attentionArtifact',side,missingAssets,assetReceipts),local=await privateJSON(a.localReference,{sha256:localReceipt.referenceSHA256,byteLength:localReceipt.referenceBytes},'localReference',side,missingAssets,assetReceipts),composed=await privateJSON(a.composedReference,{sha256:composedReceipt.referenceSHA256,byteLength:composedReceipt.referenceBytes},'composedReference',side,missingAssets,assetReceipts),saved=await privateJSON(a.savedOutput,{sha256:savedReceipt.privateArtifactSHA256,byteLength:savedReceipt.privateArtifactUTF8Bytes},'savedOutput',side,missingAssets,assetReceipts);
  await modelReceipt(a.model,localReceipt,side,missingAssets,assetReceipts);
  if(prefix){for(const name of ['patchHidden','timeAct1'])if(await f32hash(prefix.arrays[name])!==trusted.fullPrefix[name+'SHA256'])throw fail('N2_TAIL_INPUT_BITS_MISMATCH','Actual prefix bits differ: '+name);}
  if(attention&&(attention.side!==side||await f32hash(attention.attention)!==trusted.attention.contextSHA256))throw fail('N2_TAIL_INPUT_BITS_MISMATCH','Actual captured attention bits differ');
  for(const [reference,receipt,mode]of [[local,localReceipt,'LOCAL_ACTUAL_INPUTS'],[composed,composedReceipt,'COMPOSED_INDEPENDENT_PREFIX']])if(reference){if(reference.side!==side||reference.mode!==mode||reference.planSHA256!==N2_TAIL_PINS.gateRef.sha256||!same(reference.gates,tailPlan.gates)||!same(reference.inputBindings,receipt.inputBindings)||reference.case.blockIndex!==0||reference.case.scheduleIndex!==trusted.scheduleIndex)throw fail('N2_TAIL_REFERENCE_MISMATCH','Exact local/composed input binding and gates required');}
  if(saved){if(saved.side!==side||!same(saved.inputBindings,trusted))throw fail('N2_TAIL_SAVED_OUTPUT_MISMATCH','Saved replay receipt side/input differs');for(const name of Object.keys(savedReceipt.arrayIdentities))if(await f32hash(saved.arrays[name])!==savedReceipt.arrayIdentities[name].sha256)throw fail('N2_TAIL_SAVED_OUTPUT_MISMATCH','Saved replay output bits differ: '+name);savedCount++;}
  payloads[side]={side,trustedInputs:trusted,fullPrefixArtifact:prefix,actualAttentionArtifact:attention,localTailReference:local,composedTailReference:composed,localReceipt,composedReceipt,tailPlan,modelPath:a.model??null};
 }
 return {sourceProof,publicReceiptProof,buildSourceProof,codecProof,assetReceipts,missingAssets,diagnosticBudget:limits,savedOutputAcceptance:{state:savedCount===2?'HASH_VERIFIED':'BLOCKED',sidesVerified:savedCount,numericalAcceptanceRerun:false,purpose:'Separate saved output file/array bit acceptance; never a fresh numerical pass'},payloads,files};
}
async function managementSources(){
 const visited=new Set(),records=[];
 async function visit(path){path=resolve(ROOT,path);if(visited.has(path))return;if(!path.startsWith(ROOT+sep))throw fail('N2_TAIL_MANAGER_SOURCE_ESCAPE','Manager import escaped repository');visited.add(path);const bytes=new Uint8Array(await readFile(path));records.push({path:relative(ROOT,path).split(sep).join('/'),sha256:await hash(bytes),byteLength:bytes.length});if(path.endsWith('.mjs'))for(const m of new TextDecoder().decode(bytes).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g))await visit(resolve(dirname(path),m[1]));}
 await visit('tools/ai-connection/norm-required-n2-tail-browser.mjs');await visit('tools/ai-connection/run-norm-required-n2-tail.mjs');return records;
}
/** Public receipts keep named output identities and omit activation/model values. */
export function publicN2TailReceipt(value){
 if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return {privateBinaryPayloadOmitted:true,byteLength:value.byteLength};
 if(Array.isArray(value))return value.map(publicN2TailReceipt);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key,entry])=>{
  if(['scale','privateArtifactText','expected','tensor','input','inputs','attention','patchHidden','timeAct1'].includes(key))return false;
  if(key==='arrays')return entry&&typeof entry==='object'&&!Array.isArray(entry)&&Object.values(entry).every(d=>d&&typeof d==='object'&&!Array.isArray(d)&&/^[a-f0-9]{64}$/.test(d.sha256)&&Array.isArray(d.shape)&&Number.isSafeInteger(d.byteLength));
  return true;
 }).map(([key,entry])=>[key,publicN2TailReceipt(entry)]));
 return value;
}
async function browserRun({nativeRoot,out,preflight,managerSource}){
 const nativePins=new Map([...N2_TAIL_FILES,...preflight.publicReceiptProof,...preflight.buildSourceProof.files].map(p=>[p.path,p.sha256])),managerPins=new Map(managerSource.map(p=>[p.path,p.sha256])),serverFaults=[],network=[],browserErrors=[];let server;
 const require=createRequire(import.meta.url);let playwright;try{playwright=require('playwright');}catch{playwright=require('/opt/codex/cua_node/lib/node_modules/playwright');}
 try{
  server=createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://local').pathname);if(req.method!=='GET')throw fail('N2_TAIL_HTTP_METHOD','Only verified public GET sources served');if(path==='/'){const html='<input id="model" type="file"><script type="module">import {runNormRequiredN2TailBrowser} from "/management/tools/ai-connection/norm-required-n2-tail-browser.mjs";globalThis.runN2=runNormRequiredN2TailBrowser;</script>';res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return;}if(path==='/favicon.ico'){res.writeHead(204);res.end();return;}const native=path.startsWith('/native/'),prefix=native?'/native/':'/management/';if(!path.startsWith(prefix))throw fail('N2_TAIL_HTTP_PATH','Only pinned public sources allowed');const relativePath=path.slice(prefix.length),sha256=(native?nativePins:managerPins).get(relativePath);if(!sha256)throw fail('N2_TAIL_HTTP_UNPINNED','No public source pin: '+relativePath);const file=child(native?nativeRoot:ROOT,relativePath),bytes=await checked(file,{sha256},'N2_TAIL_SOURCE_CHANGED');res.writeHead(200,{'Content-Type':file.endsWith('.mjs')||file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/json','Cache-Control':'no-store'});res.end(bytes);}catch(e){serverFaults.push({code:e.code??null,message:e.message});res.writeHead(500);res.end('Verified public source unavailable');}});
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});const origin='http://127.0.0.1:'+server.address().port,results=[];
  const catalogPath=N2_TAIL_CATALOG_REF.path,catalogBytes=await checked(join(ROOT,catalogPath),N2_TAIL_CATALOG_REF,'N2_TAIL_CATALOG_MISMATCH'),catalog=JSON.parse(new TextDecoder().decode(catalogBytes)),referenceFiles=await Promise.all(catalog.files.map(async p=>[p.path,Array.from(await readFile(join(ROOT,p.path)))]));
  for(const side of ['HIGH','LOW']){
   let browser;try{
    browser=await playwright.chromium.launch({executablePath:process.env.WORKS_CHROMIUM??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();page.setDefaultTimeout(preflight.diagnosticBudget.maxElapsedMs+60000);
    page.on('pageerror',e=>browserErrors.push(String(e)));page.on('request',r=>network.push({method:r.method(),url:r.url()}));await page.route('**/*',route=>route.request().method()==='GET'&&route.request().url().startsWith(origin+'/')?route.continue():route.abort());
    await page.exposeFunction('__n2Write',async(path,b64)=>{const file=child(join(out,side.toLowerCase()+'-outputs'),path);await mkdir(dirname(file),{recursive:true});await writeFile(file,Buffer.from(b64,'base64'),{flag:'wx',mode:0o600});});
    await page.exposeFunction('__n2Read',async path=>{try{return (await readFile(child(join(out,side.toLowerCase()+'-outputs'),path))).toString('base64');}catch(e){if(e.code==='ENOENT')return null;throw e;}});
    await page.goto(origin+'/');await page.locator('#model').setInputFiles(preflight.payloads[side].modelPath);await page.waitForFunction(()=>typeof globalThis.runN2==='function');
    const result=await page.evaluate(plan=>globalThis.runN2(plan),{payload:preflight.payloads[side],diagnosticBudget:preflight.diagnosticBudget,catalogPath,catalogBytes:Array.from(catalogBytes),referenceFiles,managerSource});results.push(result);
   }finally{await browser?.close();}
  }
  return {status:serverFaults.length||browserErrors.length?'FAIL':'PASS',results,browserLaunched:true,nativeCalls:results.reduce((n,r)=>n+r.nativeCalls,0),actualNumericalAccepted:results.length===2&&results.every(r=>r.actualNumericalAccepted),network:{scope:'Only pinned public sources over loopback GET; private model File and activation payloads via File/CDP only',requests:network},serverFaults,browserErrors};
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}
}
function assetsExample(){return Object.fromEntries(['HIGH','LOW'].map(side=>{const low=side.toLowerCase();return [side,{model:'/private/models/'+(side==='HIGH'?'Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors':'Bernini_LOW_fp8_e4m3fn_scaled.safetensors'),fullPrefixArtifact:'/private/prefix/'+low+'-prefix-actual.json',attentionArtifact:'/private/attention/'+low+'-attention-actual.json',localReference:'/private/reference/'+low+'-local-reference.json',composedReference:'/private/reference/'+low+'-composed-reference.json',savedOutput:'/private/saved/'+low+'-tail-outputs.json'}];}));}
export async function runNormRequiredN2Tail({nativeRoot,assets={},out,diagnosticBudget}={}){
 if(!out||!isAbsolute(out)||resolve(out)===ROOT||resolve(out).startsWith(ROOT+sep))throw fail('N2_TAIL_PRIVATE_OUTPUT_REQUIRED','Fresh absolute private --out outside repository required');
 const preflight=await preflightNormRequiredN2Tail({nativeRoot,assets,diagnosticBudget});await mkdir(dirname(out),{recursive:true});const actualParent=await realpath(dirname(out));if(actualParent===ROOT||actualParent.startsWith(ROOT+sep))throw fail('N2_TAIL_PRIVATE_OUTPUT_REQUIRED','Private output parent resolves inside repository');await mkdir(out,{mode:0o700});
 const common={schemaVersion:'works-norm-required-n2-tail-run/0.1',sides:['HIGH1','LOW3'],nativeSource:N2_TAIL_SOURCE,sourceProof:preflight.sourceProof,buildSourceProof:preflight.buildSourceProof,publicReceiptProof:preflight.publicReceiptProof,codecProof:preflight.codecProof,assetReceipts:preflight.assetReceipts,savedOutputAcceptance:preflight.savedOutputAcceptance,diagnosticBudget:preflight.diagnosticBudget,missingAssets:preflight.missingAssets,generationReady:false,modelInference:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY',totalPeakBytes:null};
 let result;if(preflight.missingAssets.length||!preflight.diagnosticBudget)result={...common,status:'BLOCKED',blockedEdge:preflight.missingAssets.length?'actual-private-assets':'explicit-n2-tail-diagnostic-budget',actualNumericalAccepted:false,nativeCalls:0,browserLaunched:false,numericalState:'NOT_VERIFIED',stopConditions:['Any missing or mismatched private payload stops before browser/native','Fixed source/public receipt/hash mismatch rejects preflight','Explicit maxElapsedMs aborts original operation; release waits original terminal','No full RAM/host peak claim; native ORTMemoryBytes null remains null']};
 else{const managerSource=await managementSources();try{result={...common,managementSource:managerSource,...await browserRun({nativeRoot,out,preflight,managerSource})};}catch(error){result={...common,status:'FAIL',actualNumericalAccepted:false,browserLaunched:true,nativeCalls:null,error:{code:error.code??null,message:String(error.message??error)}};}}
 result=publicN2TailReceipt(result);await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 await writeFile(join(out,'assets.example.json'),JSON.stringify(assetsExample(),null,2)+'\n',{flag:'wx',mode:0o600});
 await writeFile(join(out,'REPRODUCE.md'),'Run this exact management checkout and verified a49aac execution root on the environment holding the original private files. Copy assets.example.json to assets.json and replace all paths with existing absolute private paths. Supply diagnostic-budget.json with {"scope":"n2-tail-diagnostic-only","tailHikeCapacityBytes":2883584,"ortSharedMemoryCapacityBytes":16777216,"maxReturnedOutputBytes":163840,"maxElapsedMs":<explicit positive milliseconds>}.\n\nnode tools/ai-connection/run-norm-required-n2-tail.mjs --native-root /fixed/a49aac4 --assets /private/assets.json --diagnostic-budget /private/diagnostic-budget.json --out /private/fresh-n2-run\n\nNo model download, prefix/reference regeneration or full model hash is performed. Fresh eight-comparison numerical acceptance and existing saved-output hash acceptance are distinct. Missing files yield BLOCKED/native0/browserfalse. Five private E4 output artifacts are written under each side and actually read back before N-ARTIFACT. Total RAM, host/ORT allocator peak, generation and HIGH-to-LOW handoff remain unverified.\n',{flag:'wx',mode:0o600});return result;
}
export const N2_TAIL_RUNNER_HELP='Usage: node tools/ai-connection/run-norm-required-n2-tail.mjs --native-root <fixed-a49aac-root> --out <fresh-private-absolute-directory> [--assets <private-paths.json>] [--diagnostic-budget <N2-tail-only-limits.json>]\nRuns fixed HIGH1 and LOW3 separately using createSelfAttentionTail in each browser realm. Missing original private assets or diagnostic limits produce BLOCKED, native0/browserfalse; no numerical dryrun pass. See assets.example.json and REPRODUCE.md in the result directory.';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(args.includes('--help'))console.log(N2_TAIL_RUNNER_HELP);else{const values={},allowed=new Set(['native-root','out','assets','diagnostic-budget']);for(let i=0;i<args.length;i+=2){const name=args[i]?.slice(2);if(!args[i]?.startsWith('--')||!allowed.has(name)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(values,name))throw fail('N2_TAIL_ARGUMENT_INVALID','Unknown, duplicate or incomplete flag: '+args[i]);values[name]=args[i+1];}const result=await runNormRequiredN2Tail({nativeRoot:values['native-root'],out:values.out,assets:values.assets?await readonlyJSON(values.assets):{},diagnosticBudget:values['diagnostic-budget']?await readonlyJSON(values['diagnostic-budget']):undefined});console.log(JSON.stringify({status:result.status,blockedEdge:result.blockedEdge??null,nativeCalls:result.nativeCalls,browserLaunched:result.browserLaunched,actualNumericalAccepted:result.actualNumericalAccepted,out:values.out}));if(result.status==='FAIL')process.exitCode=1;}}
 catch(error){console.error(JSON.stringify({code:error.code??null,message:String(error.message??error)}));process.exitCode=1;}
}

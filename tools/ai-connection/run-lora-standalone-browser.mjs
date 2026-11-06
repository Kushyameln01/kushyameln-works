#!/usr/bin/env node
/** Actual shipped management→standalone LoRA SDK→Hike browser acceptance.
 * The provider/consumer and selected Files are development references. No real
 * Diffusion binding, trained base or generation READY is established. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,dirname,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';
import {createLoraFixtureBytes,LORA_FIXTURE_DOMAIN} from './lora-standalone-fixtures.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),DOCS=join(ROOT,'docs');
const git=promisify(execFile),sha=b=>sha256Bytes(new Uint8Array(b));
const fail=(code,message)=>Object.assign(Error(message),{code});
const MIME={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'};
const contentType=path=>Object.entries(MIME).find(([suffix])=>path.endsWith(suffix))?.[1]??'application/octet-stream';
const SCOPE='New management adapter connected to the actual fixed standalone LoRA SDK and Hike kernel, with locally selected synthetic safetensors Files and LoRA-owner conformant independent-base/reference consumer. Not real Diffusion graph application, training-base verification, full-original arithmetic rerun or generation READY.';
async function sourceReceipt(path,commit){
 const bytes=new Uint8Array(await readFile(path)),record={path:relative(ROOT,path).split(sep).join('/'),byteLength:bytes.byteLength,sha256:await sha(bytes)};
 if(commit){const expected=new Uint8Array((await git('git',['-C',ROOT,'show',commit+':'+record.path],{encoding:'buffer',maxBuffer:32*1024*1024})).stdout);if(expected.byteLength!==record.byteLength||await sha(expected)!==record.sha256)throw fail('BROWSER_SOURCE_NOT_FROZEN','Actual source differs from fixed commit: '+record.path);}
 return {bytes,record};
}
async function startStaticServer({commit,requests,errors,records}){
 const cache=new Map();
 const capture=async file=>{if(!cache.has(file)){const r=await sourceReceipt(file,commit);cache.set(file,r.bytes);records.set(r.record.path,r.record);}return cache.get(file);};
 await capture(join(DOCS,'ai-connection/lora/index.html'));
 const server=createServer(async(request,response)=>{
  const url=new URL(request.url,'http://local'),path=decodeURIComponent(url.pathname);requests.push({method:request.method,path});response.setHeader('Cache-Control','no-store');response.setHeader('Cross-Origin-Opener-Policy','same-origin');response.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  if(request.method!=='GET'){errors.push({code:'NON_GET_REQUEST',path,method:request.method});response.writeHead(405).end();return;}
  if(path==='/favicon.ico'){response.writeHead(204).end();return;}
  const file=resolve(DOCS,'.'+(path.endsWith('/')?path+'index.html':path));if(!file.startsWith(DOCS+sep)){errors.push({code:'SOURCE_PATH_ESCAPE',path});response.writeHead(403).end();return;}
  try{response.setHeader('Content-Type',contentType(file));response.end(await capture(file));}catch(error){errors.push({code:error.code??'SOURCE_READ_FAILED',path,message:error.message});response.writeHead(404).end();}
 });
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});return {server,origin:'http://127.0.0.1:'+server.address().port};
}
async function visibleJSON(page,selector){const value=await page.locator(selector).textContent();try{return JSON.parse(value);}catch{throw fail('VISIBLE_STATE_INVALID',selector+' must contain JSON, got '+String(value).slice(0,240));}}
async function click(page,selector){const control=page.locator(selector);for(let i=0;i<8&&!await control.isVisible();i++){const summary=control.locator('xpath=ancestor::details[not(@open)][last()]/summary');if(!await summary.count())break;await summary.click();}await control.click({timeout:10000});}
async function waitState(page,predicate,selector='#high-state'){
 await page.waitForFunction(({selector,predicate})=>{try{return Function('s','return ('+predicate+')(s)')(JSON.parse(document.querySelector(selector)?.textContent??''));}catch{return false;}},{selector,predicate:String(predicate)},{timeout:30000});return visibleJSON(page,selector);
}
async function pageState(page){const state={status:await page.locator('#status').textContent()};for(const side of ['high','low'])for(const suffix of ['state','status','save-state','read-state']){const loc=page.locator('#'+side+'-'+suffix);if(await loc.count()){const text=await loc.textContent();try{state[side+'-'+suffix]=JSON.parse(text);}catch{state[side+'-'+suffix]=text;}}}return state;}

export async function makeLoraBrowserFiles(out){
 const files={};for(const side of ['HIGH','LOW']){files[side]={};for(const pairId of ['light','detail']){const bytes=createLoraFixtureBytes({side,pairId}),name=`management-${pairId}-${side}.safetensors`,path=join(out,name);await writeFile(path,bytes,{flag:'wx',mode:0o600});files[side][pairId]={path,name,bytes,byteLength:bytes.byteLength,sha256:await sha(bytes),side,pairId,kind:'synthetic-development-local-File'};}}return files;
}

export async function runLoraStandaloneBrowser({out,managerCommit,development=false,smoke=false}={}){
 if(!out)throw fail('BROWSER_OUTPUT_REQUIRED','Fresh --out directory required');if(!development&&!/^[a-f0-9]{40}$/.test(managerCommit??''))throw fail('BROWSER_COMMIT_REQUIRED','Final run requires full --manager-commit');
 out=resolve(out);await mkdir(dirname(out),{recursive:true});await mkdir(out,{mode:0o700});
 const started=performance.now(),records=new Map(),sourceErrors=[],browserErrors=[],requests=[],cases=[],workers=[];let server,browser,page,result;
 const record=async(name,fn)=>{const at=performance.now();try{const value=await fn();cases.push({name,status:'PASS',durationMs:performance.now()-at,...value});}catch(error){cases.push({name,status:'FAIL',durationMs:performance.now()-at,code:error.code??null,message:error.message});throw error;}};
 try{
  for(const file of [fileURLToPath(import.meta.url),join(ROOT,'tools/ai-connection/lora-standalone-fixtures.mjs')]){const r=await sourceReceipt(file,development?null:managerCommit);records.set(r.record.path,r.record);}
  const service=await startStaticServer({commit:development?null:managerCommit,requests,errors:sourceErrors,records});server=service.server;
  const require=createRequire('/opt/codex/cua_node/package.json'),{chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',error=>browserErrors.push(error.message));page.on('worker',worker=>{const r={url:worker.url(),closed:false};workers.push(r);worker.on('close',()=>r.closed=true);});
  await page.route('**/*',route=>{const request=route.request();if(request.method()==='GET'&&new URL(request.url()).origin===service.origin)return route.continue();sourceErrors.push({code:'OFF_ORIGIN_OR_MUTATING_REQUEST',url:request.url(),method:request.method()});return route.abort();});
  await page.goto(service.origin+'/ai-connection/lora/');
  await record('shipped-lora-page-and-independent-file-controls',async()=>{for(const selector of ['#status','#high-light-file','#high-detail-file','#low-light-file','#low-detail-file','#high-register','#low-register','#high-apply','#low-apply','#high-restore','#low-restore','#batch-apply','#batch-recover','#high-state','#low-state'])await page.locator(selector).waitFor({state:'attached',timeout:10000});return {route:'/ai-connection/lora/',scope:SCOPE};});
  if(!smoke)await runCases({page,out,record});
  await page.screenshot({path:join(out,'browser.png'),fullPage:true});result={status:cases.every(c=>c.status==='PASS')&&!sourceErrors.length&&!browserErrors.length?'PASS':'FAIL',browserVersion:browser.version()};
 }catch(error){result={status:'FAIL',code:error.code??null,message:error.message};if(page)try{result.failureState=await pageState(page);await page.screenshot({path:join(out,'failure.png'),fullPage:true});}catch{}}
 finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}}
 const output={schemaVersion:'works-management-lora-browser/1',...result,scope:SCOPE,development,verificationKind:'actual-new-LoRA-SDK-Hike-management-control',management:{commit:managerCommit??null,fixedSourceVerified:!development&&result.status==='PASS',files:[...records.values()]},adoptedLora:{commit:'6d0c8df4cd4992f26745d2d26394f5e194d2567f',contractVersion:'lora-standalone/1.0-draft.1'},fixtureDomain:LORA_FIXTURE_DOMAIN,cases,sourceErrors,browserErrors,network:{scope:'Only public static GET; local File bytes remain in browser/OPFS, not uploaded to server',requests},resources:{browserDurationMs:performance.now()-started,workerCreated:workers.length,workerClosed:workers.filter(w=>w.closed).length,osRSSBytes:null,totalPeakRAMBytes:null},graphBinding:'UNBOUND',trainingBaseVerified:false,generationReady:false};
 await writeFile(join(out,'result.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx',mode:0o600});return output;
}

async function sideState(page,side){return visibleJSON(page,'#'+side+'-state');}
async function referenceState(page,side){return visibleJSON(page,'#'+side+'-reference-state');}
async function waitSide(page,side,states){
 if(!Array.isArray(states))states=[states];await page.waitForFunction(({side,states})=>states.includes(document.querySelector('#'+side+'-status')?.dataset.state),{side,states},{timeout:30000});return page.locator('#'+side+'-status').getAttribute('data-state');
}
async function action(page,side,operation,wanted){await click(page,'#'+side+'-'+operation);const state=await waitSide(page,side,[wanted,'ERROR']);assert.equal(state,wanted,await page.locator('#error-details').textContent());return sideState(page,side);}
async function setSelection(page,side,{light,detail,lightStrength=1,detailStrength=1}){for(const [pair,value] of Object.entries({light,detail})){const input=page.locator('#'+side+'-'+pair+'-enabled');if(value)await input.check();else await input.uncheck();await page.locator('#'+side+'-'+pair+'-strength').fill(String(pair==='light'?lightStrength:detailStrength));}}
async function developmentControls(page,side){const input=page.locator('#'+side+'-mode');if(!await input.isVisible())await input.locator('..').locator('summary').click();}
async function readActive(page,side,expected){await developmentControls(page,side);const before=await visibleJSON(page,'#'+side+'-lease-state'),previousSequence=before.readSequence??0;await click(page,'#'+side+'-read-active');await page.waitForFunction(({side,previousSequence})=>{try{const value=JSON.parse(document.querySelector('#'+side+'-lease-state')?.textContent??'');return value.firstValues?.length>0&&value.readSequence>previousSequence;}catch{return false;}},{side,previousSequence});const read=await visibleJSON(page,'#'+side+'-lease-state');assert.deepEqual(read.firstValues.slice(0,4),expected);assert.equal(read.offset,5120);assert.equal(read.count,5120);assert.equal(read.byteLength,20480);assert.match(read.sha256,/^[a-f0-9]{64}$/);return read;}
function identity(state){return {sdkInstanceId:state.lastResult?.nativeReceipt?.sdkInstanceId??state.lastResult?.managementAcknowledgement?.sdkInstanceId,managerRevision:state.managerRevision,localRevision:state.sdk?.localRevision,consumerEpoch:state.consumerEpoch,snapshotId:state.snapshot?.snapshotId,lastRequestId:state.lastResult?.target?.requestId};}
function assertApplied(state){assert.equal(state.lastResult?.status,'EXECUTION_COMPLETED');assert.equal(state.lastResult?.nativeReceipt?.state,'CONSUMER_APPLIED');assert.equal(state.lastResult?.nativeReceipt?.contractVersion,'lora-standalone/1.0-draft.1');assert.equal(state.lastResult.nativeReceipt.localRevision,state.sdk.localRevision);assert.equal(state.lastResult.nativeReceipt.consumerEpoch,state.consumerEpoch);assert.equal(state.activeTarget,null);assert.equal(state.lastResult?.terminal?.originalTerminal,true);assert.equal(state.lastResult?.terminal?.resourceReleased,true);assert.equal(state.lastResult?.terminal?.resultAccepted,true);assert.equal(state.graphBinding,'UNBOUND');assert.equal(state.generationReady,false);}

async function runCases({page,out,record}){
 const files=await makeLoraBrowserFiles(out),base=[-.0390625,-.03125,-.0234375,-.015625],highLight=[-.0078125,0,.0078125,.015625],highDetail=[-.0703125,-.0625,-.0546875,-.046875],lowBoth=highLight;
 await record('selected-high-light-only-register-and-real-sdk-hike-apply',async()=>{
  await page.locator('#high-light-file').setInputFiles(files.HIGH.light.path);await setSelection(page,'high',{light:true,detail:false});await action(page,'high','register','REGISTERED');const registered=await sideState(page,'high');assert.equal(registered.registered.length,1);assert.equal((await sideState(page,'low')).registered?.length??0,0);const applied=await action(page,'high','apply','APPLIED');assertApplied(applied);const read=await readActive(page,'high',highLight),resources=await referenceState(page,'high');assert.ok(resources.kernel.productCalls>0);assert.equal(resources.kernel.memoryBytes,33554432);assert.equal(resources.consumer.active,true);return {file:{...files.HIGH.light,bytes:undefined,path:relative(out,files.HIGH.light.path)},identity:identity(applied),read,resources,requiredFiles:'Only selected HIGH light File; LOW and detail absent'};
 });
 await record('compose-prepare-stage-both-pairs-and-finite-owner-admission',async()=>{
  await page.locator('#high-detail-file').setInputFiles(files.HIGH.detail.path);await setSelection(page,'high',{light:true,detail:true});await action(page,'high','register','REGISTERED');await action(page,'high','compose','COMPOSED');await action(page,'high','prepare','PREPARED');const prepared=await sideState(page,'high');assert.ok(prepared.prepared.length>0);const applied=await action(page,'high','stage','APPLIED');assertApplied(applied);assert.notEqual(applied.managerRevision,applied.sdk.localRevision);assert.equal(applied.lastResult.nativeReceipt.validation.checkedElements,5120);const read=await readActive(page,'high',base),resources=await referenceState(page,'high');assert.deepEqual(read.fullShape,[5120,5120]);assert.ok(resources.controls.completedElements>=5120);return {identity:identity(applied),read,resources,selectedFile:{name:files.HIGH.detail.name,byteLength:files.HIGH.detail.byteLength,sha256:files.HIGH.detail.sha256},scope:'Native compose/prepare/stage; selected canonical full-shape row complete F32 admission by existing owner consumer'};
 });
 await record('pair-removal-strength-change-reapply-and-base-restore',async()=>{
  await setSelection(page,'high',{light:true,detail:false});const first=await action(page,'high','apply','APPLIED');const one=await readActive(page,'high',highLight);const next=await action(page,'high','apply','APPLIED');const reapplied=await readActive(page,'high',highLight);assert.equal(one.sha256,reapplied.sha256,'Reapplication must rebuild from immutable base rather than accumulate');assert.ok(next.consumerEpoch>first.consumerEpoch);
  await setSelection(page,'high',{light:true,detail:false,lightStrength:-1});await action(page,'high','apply','APPLIED');const changed=await readActive(page,'high',highDetail);
  await setSelection(page,'high',{light:false,detail:true});await action(page,'high','apply','APPLIED');const detail=await readActive(page,'high',highDetail);
  const restored=await action(page,'high','restore','RESTORED'),read=await readActive(page,'high',base);assertApplied(restored);return {one,reapplied,changed,detail,base:read,identity:identity(restored)};
 });
 await record('low-is-separate-instance-and-selected-files-only',async()=>{
  await page.locator('#low-light-file').setInputFiles(files.LOW.light.path);await page.locator('#low-detail-file').setInputFiles(files.LOW.detail.path);await setSelection(page,'low',{light:true,detail:true});await action(page,'low','register','REGISTERED');const applied=await action(page,'low','apply','APPLIED');assertApplied(applied);const high=await sideState(page,'high');assert.notEqual(applied.resourceBinding.ownerId,high.resourceBinding.ownerId);assert.notEqual(identity(applied).sdkInstanceId,identity(high).sdkInstanceId);const read=await readActive(page,'low',lowBoth);assert.ok(read.referenceResources.kernel.productCalls>0);assert.equal(read.referenceResources.kernel.memoryBytes,33554432);return {HIGH:identity(high),LOW:identity(applied),read,files:['light','detail'].map(pair=>({name:files.LOW[pair].name,byteLength:files.LOW[pair].byteLength,sha256:files.LOW[pair].sha256}))};
 });
 await record('target-cancel-awaits-original-terminal-and-old-target-does-not-cancel-next',async()=>{
  await developmentControls(page,'high');await page.locator('#high-mode').selectOption('delay');await setSelection(page,'high',{light:true,detail:true});const before=await sideState(page,'high');await click(page,'#high-apply');await waitState(page,s=>s.controls?.waiting===true,'#high-reference-state');const target=(await sideState(page,'high')).activeTarget;assert.ok(target);
  await click(page,'#high-cancel');await waitSide(page,'high','CANCELLING');assert.equal(await page.locator('#high-apply').isDisabled(),true);await click(page,'#high-continue');await waitSide(page,'high','CANCELLED');const cancelled=await sideState(page,'high');assert.equal(cancelled.activeTarget,null);assert.equal(cancelled.consumerEpoch,before.consumerEpoch);assert.equal(cancelled.snapshot?.snapshotId,before.snapshot?.snapshotId);assert.equal(cancelled.lastResult?.target?.requestId,before.lastResult?.target?.requestId);
  await click(page,'#high-apply');await waitState(page,s=>s.controls?.waiting===true,'#high-reference-state');const nextTarget=(await sideState(page,'high')).activeTarget;assert.notEqual(nextTarget.requestId,target.requestId);await click(page,'#high-cancel-old');await waitSide(page,'high','OLD_TARGET_REJECTED');assert.equal((await sideState(page,'high')).activeTarget.requestId,nextTarget.requestId);await click(page,'#high-continue');await waitSide(page,'high','APPLIED');const accepted=await sideState(page,'high');assertApplied(accepted);await page.locator('#high-mode').selectOption('success');return {cancelled,oldTarget:target,newTarget:nextTarget,identity:identity(accepted),read:await readActive(page,'high',base)};
 });
 await record('consumer-failure-preserves-prior-publication-and-recover-retry',async()=>{
  await developmentControls(page,'high');await page.locator('#high-mode').selectOption('fail');const before=await sideState(page,'high');await click(page,'#high-apply');await waitSide(page,'high','ERROR');const failed=await sideState(page,'high');assert.equal(failed.consumerEpoch,before.consumerEpoch);await page.locator('#high-mode').selectOption('success');await action(page,'high','recover','RECOVERED');const applied=await action(page,'high','apply','APPLIED');assertApplied(applied);return {before:identity(before),failed,after:identity(applied)};
 });
 await record('high-low-batch-side-failure-is-not-global-success-and-base-recovery-is-new-transaction',async()=>{
  await setSelection(page,'high',{light:true,detail:true});await setSelection(page,'low',{light:true,detail:true});await developmentControls(page,'low');await page.locator('#low-mode').selectOption('fail');await page.locator('#batch-high').check();await page.locator('#batch-low').check();await click(page,'#batch-apply');await page.waitForFunction(()=>['BATCH_FAILED','ERROR'].includes(document.querySelector('#status')?.dataset.state),{timeout:30000});assert.equal(await page.locator('#status').getAttribute('data-state'),'BATCH_FAILED');const failed=await visibleJSON(page,'#batch-state'),batch=failed.lastBatch??failed;assert.equal(batch.status,'BATCH_FAILED');assert.equal(batch.accepted,false);assert.equal(batch.results.HIGH.nativeReceipt.state,'CONSUMER_APPLIED');assert.ok(batch.errors.LOW);await page.locator('#low-mode').selectOption('success');await click(page,'#batch-recover');await page.waitForFunction(()=>['BASE_RECOVERED','ERROR'].includes(document.querySelector('#status')?.dataset.state),{timeout:30000});assert.equal(await page.locator('#status').getAttribute('data-state'),'BASE_RECOVERED',await page.locator('#error-details').textContent());const recovered=await visibleJSON(page,'#batch-state'),recovery=recovered.lastRecovery??recovered;assert.equal(recovery.status,'BASE_RECOVERED');assert.equal(recovery.originalBatchStatus,'BATCH_FAILED');assert.equal(recovery.recovered,true);return {failed,recovered,HIGH:await readActive(page,'high',base),LOW:await readActive(page,'low',base)};
 });
 await record('low-side-terminal-release-before-browser-reload',async()=>{
  await action(page,'low','dispose','DISPOSED');const resources=await referenceState(page,'low');assert.equal(resources.backingDisposed,true);assert.equal(resources.baseAlive,false);assert.equal(resources.kernel.memoryBytes,0);assert.equal(resources.kernel.leaseCount,0);assert.equal(resources.consumer.active,false);assert.equal(resources.consumer.candidates,0);assert.equal(resources.consumer.readLeases,0);assert.equal(resources.consumer.inFlight,0);return {resources};
 });
 let saved;
 await record('sdk-streaming-real-payload-and-manifest-save-to-opfs',async()=>{
  await setSelection(page,'high',{light:true,detail:true});await action(page,'high','apply','APPLIED');await action(page,'high','save','SAVED');saved=await visibleJSON(page,'#high-save-state');assert.ok(saved.manifest,'Actual native manifest must be visible for package acquisition');const manifest=saved.manifest;assert.match(manifest.packageHash,/^[a-f0-9]{64}$/);const identities=[files.HIGH.light,files.HIGH.detail].map(f=>f.sha256);assert.ok(JSON.stringify(manifest).includes(identities[0]));assert.ok(JSON.stringify(manifest).includes(identities[1]));return {saved,scope:'SDK writer consumes real source chunks into OPFS and publishes native manifest last; no whole-payload Blob'};
 });
 await record('prepared-creator-release-does-not-revoke-active-consumer-lease',async()=>{
  const before=await readActive(page,'high',base);await action(page,'high','release','RELEASED');const after=await readActive(page,'high',base);assert.equal(after.sha256,before.sha256);const resources=await referenceState(page,'high');assert.equal(resources.consumer.active,true);assert.ok(resources.kernel.leaseCount>0);return {before,after,resources};
 });
 await record('page-reload-opfs-fresh-sdk-open-and-reapply',async()=>{
  const before=await sideState(page,'high');await page.reload();await page.locator('#high-open-saved').waitFor();await action(page,'high','open-saved','OPENED');const reopened=await sideState(page,'high');assert.notEqual(reopened.resourceBinding.ownerId,before.resourceBinding.ownerId);assert.equal(reopened.activeTarget,null);assert.equal(reopened.snapshot,null);await action(page,'high','stage','APPLIED');const applied=await sideState(page,'high');assertApplied(applied);const read=await readActive(page,'high',base);return {before:identity(before),reopened,after:identity(applied),read,scope:'Actual saved payload reverified by new SDK; manager/native runtime handles and authority are not restored'};
 });
 await record('sdk-dispose-retains-independent-active-and-read-leases',async()=>{
  await developmentControls(page,'high');await click(page,'#high-capture-lease');await page.waitForFunction(()=>{try{return JSON.parse(document.querySelector('#high-lease-state')?.textContent??'').leaseHeld===true;}catch{return false;}});await action(page,'high','dispose-sdk','SDK_DISPOSED');await click(page,'#high-read-lease');const held=await visibleJSON(page,'#high-lease-state');assert.deepEqual(held.firstValues.slice(0,4),base);assert.equal(held.leaseHeld,true);const resources=await referenceState(page,'high');assert.equal(resources.consumer.active,true);assert.ok(resources.kernel.leaseCount>0);await click(page,'#high-release-lease');return {held,resources};
 });
 await record('final-consumer-and-backing-release',async()=>{
  await click(page,'#dispose-all');await page.waitForFunction(()=>['DISPOSED','ERROR'].includes(document.querySelector('#status')?.dataset.state),{timeout:30000});assert.equal(await page.locator('#status').getAttribute('data-state'),'DISPOSED',await page.locator('#error-details').textContent());const resources={HIGH:await referenceState(page,'high'),LOW:await referenceState(page,'low')};for(const r of Object.values(resources)){if(r.kernel){assert.equal(r.kernel.memoryBytes,0);assert.equal(r.kernel.leaseCount,0);}if(r.consumer){assert.equal(r.consumer.active,false);assert.equal(r.consumer.readLeases,0);assert.equal(r.consumer.candidates,0);assert.equal(r.consumer.inFlight,0);}if(r.cache)assert.equal(r.cache.bytes??r.cache.residentBytes??0,0);}return {resources};
 });
}
export const LORA_BROWSER_HELP='Usage: node tools/ai-connection/run-lora-standalone-browser.mjs --out <fresh-dir> --manager-commit <full-SHA> [--smoke]\nDevelopment only: --development --out <fresh-dir>. Uses actual shipped File controls, SDK, Hike, OPFS and fresh reopen; synthetic canonical-shape Files and LoRA-owner reference base/consumer, not real Diffusion.';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const options={};for(let i=2;i<process.argv.length;i++){const k=process.argv[i];if(k==='--help'){console.log(LORA_BROWSER_HELP);process.exit(0);}if(['--development','--smoke'].includes(k)){options[k.slice(2)]=true;continue;}if(!['--out','--manager-commit'].includes(k)||!process.argv[i+1]||process.argv[i+1].startsWith('--')||options[k.slice(2)])throw fail('BROWSER_ARGUMENT_INVALID','Unknown/duplicate/incomplete argument '+k);options[k.slice(2)]=process.argv[++i];}const r=await runLoraStandaloneBrowser({out:options.out,managerCommit:options['manager-commit'],development:options.development,smoke:options.smoke});console.log(JSON.stringify({status:r.status,cases:r.cases.map(({name,status})=>({name,status})),out:options.out}));if(r.status!=='PASS')process.exitCode=1;}catch(error){console.error(JSON.stringify({status:'FAIL',code:error.code??null,message:error.message}));process.exitCode=1;}
}

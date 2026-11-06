#!/usr/bin/env node
/** Exercise the shipped standalone management page through visible controls.
 * No owner injection, hidden execution hook, remote model, or private asset is
 * used. The generated local WKT File is a development control-copy expectation,
 * not evidence for any neural-network implementation. */
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
import {createAdoptedWktensorCodec} from '../../docs/shared/ai-connection/codecs/wktensor.mjs';
import {REFERENCE_REGISTRY} from '../../docs/shared/ai-connection/reference-owner.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const DOCS=join(ROOT,'docs'),git=promisify(execFile),codec=createAdoptedWktensorCodec();
const raw=t=>new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength);
const failure=(code,message)=>Object.assign(Error(message),{code});
const sha=bytes=>sha256Bytes(new Uint8Array(bytes));
const MIME={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'};
const sourceType=path=>Object.entries(MIME).find(([suffix])=>path.endsWith(suffix))?.[1]??'application/octet-stream';
const SUMMARY_SCOPE='Standalone management control, local File handling and durable tensor-copy preservation; no real neural-network numerical acceptance, inter-module ACK or product generation READY claim.';

async function sourceReceipt(path,commit){
 const bytes=new Uint8Array(await readFile(path)),record={path:relative(ROOT,path).split(sep).join('/'),byteLength:bytes.byteLength,sha256:await sha(bytes)};
 if(commit){let expected;try{expected=new Uint8Array((await git('git',['-C',ROOT,'show',commit+':'+record.path],{encoding:'buffer',maxBuffer:32*1024*1024})).stdout);}catch{throw failure('BROWSER_SOURCE_NOT_FROZEN','Missing committed source '+record.path);}
  if(expected.byteLength!==record.byteLength||await sha(expected)!==record.sha256)throw failure('BROWSER_SOURCE_NOT_FROZEN','Working source differs from fixed commit: '+record.path);
 }
 return {record,bytes};
}

/** Literal development input, deliberately including the original workflow's
 * target latent extent. Copy is the only expected computation. */
export async function makeStandaloneBrowserInput(){
 const shape=[1,16,21,60,104],length=shape.reduce((a,b)=>a*b,1),data=new Float32Array(length);
 // Exactly representable quarter values provide an independent, manually
 // specified expectation for every selected input element.
 for(let i=0;i<length;i++)data[i]=(i%17-8)/4;
 const frames=Array.from({length:81},(_,i)=>i),times=frames.map(i=>i/24);
 const tensor={dtype:'float32',shape,layout:'NCTHW',meaning:'raw-posterior-mean',data,modelSha256:'1'.repeat(64),context:{schemaVersion:1,contextId:'standalone:81-frame:source',inputId:'source:video',inputSha256:'2'.repeat(64),slotId:'source',sourceFrameIndices:frames,sourceFrameTimesSeconds:times}};
 const bytes=await codec.encode(tensor);
 return {tensor,bytes,identity:{filename:'source-81-frame-raw-mean.wktensor',nativeByteLength:bytes.byteLength,nativeSHA256:await sha(bytes),payloadByteLength:data.byteLength,payloadSHA256:await sha(raw(tensor)),dtype:tensor.dtype,shape,layout:tensor.layout,meaning:tensor.meaning,context:tensor.context,independentSamples:{indices:[0,1,8,16,length-1],values:[-2,-1.75,0,2,( (length-1)%17-8)/4]},expectation:'Literal F32 quarter-value pattern plus unchanged local selected tensor bytes; management control only'}};
}

async function startStaticServer({commit,requests,sourceErrors,records}){
 const cached=new Map();
 async function capture(file){if(!cached.has(file)){const receipt=await sourceReceipt(file,commit);cached.set(file,receipt.bytes);records.set(receipt.record.path,receipt.record);}return cached.get(file);}
 // Check the entry route before the browser starts. Subsequent module reads
 // undergo the same fixed-commit comparison, including the owner's self-fetch.
 await capture(join(DOCS,'ai-connection/index.html'));
 const server=createServer(async(request,response)=>{
  const url=new URL(request.url,'http://local'),path=decodeURIComponent(url.pathname);requests.push({method:request.method,path});
  response.setHeader('Cache-Control','no-store');response.setHeader('Cross-Origin-Opener-Policy','same-origin');response.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  if(request.method!=='GET'){sourceErrors.push({code:'NON_GET_REQUEST',path,method:request.method});response.writeHead(405).end();return;}
  if(path==='/favicon.ico'){response.writeHead(204).end();return;}
  const file=resolve(DOCS,'.'+(path.endsWith('/')?path+'index.html':path));
  if(!file.startsWith(DOCS+sep)){sourceErrors.push({code:'SOURCE_PATH_ESCAPE',path});response.writeHead(403).end();return;}
  try{const bytes=await capture(file);response.setHeader('Content-Type',sourceType(file));response.end(bytes);}catch(error){sourceErrors.push({code:error.code??'SOURCE_READ_FAILED',path,message:error.message});response.writeHead(404).end();}
 });
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
 return {server,origin:'http://127.0.0.1:'+server.address().port};
}

async function visibleJSON(page,selector){const value=await page.locator(selector).textContent();try{return JSON.parse(value);}catch{throw failure('BROWSER_STATE_NOT_JSON',selector+' must show inspectable JSON; received '+String(value).slice(0,300));}}
async function controlClick(page,selector){await page.locator(selector).click({timeout:10000});}
async function download(page,selector,out,name){const pending=page.waitForEvent('download',{timeout:30000});await controlClick(page,selector);const file=await pending,path=join(out,name??file.suggestedFilename());await file.saveAs(path);const bytes=new Uint8Array(await readFile(path));return {path,filename:file.suggestedFilename(),byteLength:bytes.byteLength,sha256:await sha(bytes),bytes};}
async function snapshot(page){return {status:await page.locator('#status').textContent(),fileStatus:await page.locator('#file-status').textContent(),steps:await page.locator('#step-list').textContent(),outputs:await page.locator('#output-list').textContent(),owner:await visibleJSON(page,'#owner-state')};}
async function waitDataState(page,states){if(!Array.isArray(states))states=[states];await page.waitForFunction(states=>states.includes(document.querySelector('#status')?.dataset.state),states,{timeout:30000});return page.locator('#status').getAttribute('data-state');}
async function waitInspect(page,predicate,selector='#owner-state'){
 await page.waitForFunction(({selector,predicate})=>{try{return Function('state','return ('+predicate+')(state)')(JSON.parse(document.querySelector(selector)?.textContent??''));}catch{return false;}},{selector,predicate:String(predicate)},{timeout:30000});
 return visibleJSON(page,selector);
}
function assertReleased(state){assert.equal(state.activeTarget,null,'Original reference invocation must have reached terminal');assert.deepEqual(state.retainedTargets,[],'Owner must release retained operation records');assert.equal(state.cleanupPending,false);assert.equal(state.resourceState.occupiedBytes,0);assert.equal(state.ownership.logicalOwnedRecords,0);assert.equal(state.ownership.logicalPayloadBytes,0);}
async function assertCopied(bytes,input){
 const tensor=await codec.decode(bytes);assert.deepEqual(tensor.shape,input.identity.shape);assert.equal(tensor.dtype,input.identity.dtype);assert.equal(tensor.layout,input.identity.layout);assert.equal(tensor.meaning,input.identity.meaning);assert.deepEqual(tensor.context,input.identity.context);assert.equal(await sha(raw(tensor)),input.identity.payloadSHA256);
 for(let i=0;i<input.identity.independentSamples.indices.length;i++)assert.equal(tensor.data[input.identity.independentSamples.indices[i]],input.identity.independentSamples.values[i]);
 return {byteExact:true,dtype:tensor.dtype,shape:tensor.shape,meaning:tensor.meaning,context:tensor.context,payloadSHA256:await sha(raw(tensor)),payloadByteLength:tensor.data.byteLength};
}
async function readBundle(bytes){const {readManagementBundle}=await import('../../docs/shared/ai-connection/management-workspace.mjs');return readManagementBundle(bytes,{registry:REFERENCE_REGISTRY});}
async function assertBundleCopied(download,input,{partial=false,expectedExtension}={}){
 const bundle=await readBundle(download.bytes),artifacts=bundle.artifacts??bundle.records;
 assert.ok(artifacts&&typeof artifacts==='object','Readback must return explicit artifact records');
 const refs=Object.keys(artifacts);assert.ok(refs.includes(partial?'partial':'final'),'Downloaded package must bind the selected result');
 const record=artifacts[partial?'partial':'final'];assert.ok(record.tensor?.data instanceof Float32Array,'Package must hydrate actual F32 payload');
 assert.equal(await sha(raw(record.tensor)),input.identity.payloadSHA256);assert.deepEqual(record.tensor.context,input.identity.context);assert.deepEqual(record.tensor.shape,input.identity.shape);assert.equal(record.tensor.dtype,input.identity.dtype);assert.equal(record.tensor.meaning,input.identity.meaning);
 assert.deepEqual(record.descriptor.tensor.shape,input.identity.shape);assert.equal(record.descriptor.tensor.dtype,input.identity.dtype);assert.equal(record.descriptor.tensor.nativeMeaning,input.identity.meaning);
 if(expectedExtension)assert.deepEqual(bundle.state.profile.extensions,expectedExtension);
 assert.equal(bundle.state.generationReady,false);assert.equal(bundle.state.load,'NOT_READY');assert.equal(bundle.state.predict,'NOT_READY');assert.equal(bundle.state.sample,'NOT_READY');
 return {artifactRefs:refs,byteExact:true,payloadSHA256:input.identity.payloadSHA256,shape:record.tensor.shape,dtype:record.tensor.dtype,meaning:record.tensor.meaning,contextPreserved:true,profileExtensionsPreserved:Boolean(expectedExtension),snapshotCount:bundle.state.snapshots?.length??0};
}

/** Real DOM/File/download acceptance. This is exported only as a Node runner;
 * the actual page exposes no automation-only execution API. */
export async function runStandaloneBrowser({out,managerCommit,development=false,smoke=false}={}){
 if(!out)throw failure('BROWSER_OUTPUT_REQUIRED','A fresh --out directory is required');
 if(!development&&!/^[a-f0-9]{40}$/.test(managerCommit??''))throw failure('BROWSER_COMMIT_REQUIRED','Final acceptance needs a full --manager-commit; use --development only for a labelled RED/dev run');
 out=resolve(out);await mkdir(dirname(out),{recursive:true,mode:0o700});await mkdir(out,{mode:0o700});
 const started=performance.now(),sourceErrors=[],browserErrors=[],requests=[],records=new Map(),cases=[],downloads=[],workers=[];
 let server,browser,page,result;
 const record=async(name,fn)=>{const t=performance.now();try{const value=await fn();cases.push({name,status:'PASS',durationMs:performance.now()-t,...value});}catch(error){cases.push({name,status:'FAIL',durationMs:performance.now()-t,code:error.code??null,message:error.message});throw error;}};
 try{
  const own=await sourceReceipt(fileURLToPath(import.meta.url),development?null:managerCommit);records.set(own.record.path,own.record);
  const service=await startStaticServer({commit:development?null:managerCommit,requests,sourceErrors,records});server=service.server;
  const require=createRequire('/opt/codex/cua_node/package.json'),{chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  page.on('pageerror',error=>browserErrors.push(error.message));page.on('worker',worker=>{const record={url:worker.url(),closed:false};workers.push(record);worker.on('close',()=>record.closed=true);});
  await page.route('**/*',route=>{const request=route.request();if(request.method()==='GET'&&new URL(request.url()).origin===service.origin)return route.continue();sourceErrors.push({code:'OFF_ORIGIN_OR_MUTATING_REQUEST',url:request.url(),method:request.method()});return route.abort();});
  await page.goto(service.origin+'/ai-connection/');
  await record('shipped-browser-entry-and-ordinary-controls',async()=>{
   for(const id of ['#pipeline-file','#tensor-file','#asset-files','#bundle-file','#reference-mode','#budget-bytes','#lora-enabled','#require-assets','#configure','#query','#run','#cancel','#retry','#recover','#continue-run','#save-partial','#save-final','#status','#step-list','#output-list','#file-status','#profile-json','#owner-state','#reference-state','#dispose'])await page.locator(id).waitFor({state:'attached',timeout:10000});
   const source=await page.locator('main').textContent();assert.doesNotMatch(source,/independent reference.*required|kernel proof.*required|prior PASS.*required|ACK.*required/i);
   return {route:'/ai-connection/',ordinaryEntry:true,privateAssetsRequired:false};
  });
  if(!smoke)await runControlCases({page,out,record,downloads});
  await page.screenshot({path:join(out,'browser.png'),fullPage:true});
  result={status:cases.every(c=>c.status==='PASS')&&!sourceErrors.length&&!browserErrors.length?'PASS':'FAIL',browserVersion:browser.version()};
 }catch(error){result={status:'FAIL',code:error.code??null,message:error.message};if(page)try{result.failureState={...await snapshot(page),reference:await visibleJSON(page,'#reference-state'),uiError:await page.locator('#error-details').textContent()};await page.screenshot({path:join(out,'failure.png'),fullPage:true});}catch{}}
 finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}}
 const publicResult={schemaVersion:'works-standalone-management-browser/0.1',...result,scope:SUMMARY_SCOPE,verificationKind:'actual-browser-reference-owner-control',scenario:smoke?'route-only':'full-control-and-roundtrip',development,management:{commit:managerCommit??null,fixedSourceVerified:!development&&result.status==='PASS',files:[...records.values()]},cases,downloads:downloads.map(({bytes,...r})=>({...r,path:relative(out,r.path)})),resources:{browserDurationMs:performance.now()-started,workerCreated:workers.length,workerClosed:workers.filter(w=>w.closed).length,workerScope:'Playwright observed actual Worker events; reference owner normally runs in main realm',osRSSBytes:null,ORTMemoryBytes:null,totalPeakRAMBytes:null,logicalPayloadAllowanceIsRAMMeasurement:false},sourceErrors,browserErrors,network:{scope:'Only static public source GET over loopback; local File contents never uploaded to server',requests},generationReady:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};
 await writeFile(join(out,'result.json'),JSON.stringify(publicResult,null,2)+'\n',{flag:'wx',mode:0o600});return publicResult;
}

// Filled by the same public controls used manually. Tests intentionally wait
// for observable owner-terminal/release state rather than treating timeouts as
// successful cancellation or disposal.
async function runControlCases({page,out,record,downloads}){
 const input=await makeStandaloneBrowserInput();
 await writeFile(join(out,input.identity.filename),input.bytes,{flag:'wx',mode:0o600});
 const profile=JSON.parse(await page.locator('#profile-json').inputValue());
 const extension={'future:workflow-note':{schemaId:'future:workflow-note',schemaVersion:'9',requiredForUse:false,data:{order:[8,2,2,0],workflow:'81-frame target',keep:'optional metadata'}}};profile.extensions=extension;
 const file={name:input.identity.filename,mimeType:'application/octet-stream',buffer:Buffer.from(input.bytes)};
 const configure=async(mode='success',budget=64*1024*1024)=>{if(!await page.locator('#reference-mode').isVisible())await page.locator('#reference-mode').locator('..').locator('summary').click();await page.locator('#reference-mode').selectOption(mode);await page.locator('#budget-bytes').fill(String(budget));await controlClick(page,'#configure');assert.equal(await waitDataState(page,['CONFIGURED','ERROR']),'CONFIGURED',await page.locator('#error-details').textContent());};
 const run=async(selector='#run')=>{await controlClick(page,selector);return waitDataState(page,['COMPLETED','PARTIAL','BLOCKED','CANCELLED','ERROR']);};
 await record('large-81-frame-local-file-selected',async()=>{
  await waitDataState(page,'READY_FOR_INPUT');
  await page.locator('#pipeline-file').setInputFiles({name:'control-pipeline.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(profile))});await waitDataState(page,'PIPELINE_LOADED');
  await page.locator('#asset-files').setInputFiles([{name:'development-asset.bin',mimeType:'application/octet-stream',buffer:Buffer.from([7,4,2])}]);await waitDataState(page,'INPUT_CHANGED');await page.locator('#require-assets').check();
  await page.locator('#tensor-file').setInputFiles(file);await waitDataState(page,'INPUT_LOADED');
  await configure();
  return {input:input.identity,state:await snapshot(page)};
 });
 await record('ordinary-copy-and-lora-off',async()=>{
  await page.locator('#lora-enabled').uncheck();await controlClick(page,'#query');await waitDataState(page,['SUPPORTED','BLOCKED']);
  const query=await visibleJSON(page,'#control-details');assert.equal(query.query.steps.find(s=>s.stepId==='input-copy').status,'SUPPORTED');
  assert.equal(await run(),'COMPLETED');
  const state=await visibleJSON(page,'#owner-state');assert.equal(state.steps['optional-lora-path'].status,'BYPASSED');assert.equal(state.snapshots.length,2,'LoRA-off route must not invoke the optional owner step');
  assert.equal(state.activeTarget,null);assertReleased(await visibleJSON(page,'#reference-state'));
  for(const s of Object.values(state.steps))if(s.status==='COMPLETED')assert.equal(s.terminal.originalTerminal,true);
  return {state:await snapshot(page),reference:await visibleJSON(page,'#reference-state'),expectation:'Owner receives ordinary tensor declarations; no numerical reference, gate, prior PASS or detailed receipt required'};
 });
 await record('final-native-tensor-real-file-readback',async()=>{const output=await download(page,'#output-list [data-artifact-ref="final"] button',out,'final.wktensor');downloads.push(output);assert.equal(output.sha256,input.identity.nativeSHA256);return assertCopied(output.bytes,input);});
 let finalBundle;
 await record('final-package-browser-download',async()=>{
  finalBundle=await download(page,'#save-final',out,'management-final.zip');downloads.push(finalBundle);
  assert.ok(finalBundle.byteLength>0,'Final package download must contain bytes; native decoded payload length is checked independently of ZIP compression');
  return {byteLength:finalBundle.byteLength,sha256:finalBundle.sha256,readback:await assertBundleCopied(finalBundle,input,{expectedExtension:extension})};
 });
 await record('conditional-selection-invalidation-and-ordinary-on-route',async()=>{
  const before=await visibleJSON(page,'#owner-state');await page.locator('#lora-enabled').check();await waitDataState(page,'SELECTION_CHANGED');
  const changed=await visibleJSON(page,'#owner-state');assert.ok(changed.revision>before.revision);assert.deepEqual(changed.snapshots,[]);assert.deepEqual(changed.artifactRefs,['input']);
  assert.equal(await run(),'COMPLETED');const state=await visibleJSON(page,'#owner-state');assert.equal(state.steps['optional-lora-path'].status,'COMPLETED');assert.equal(state.snapshots.length,3);assertReleased(await visibleJSON(page,'#reference-state'));
  await page.locator('#lora-enabled').uncheck();await waitDataState(page,'SELECTION_CHANGED');
  return {scope:'Conditional control-copy branch selection only; no actual LoRA model application',state};
 });
 await record('owner-capability-change-invalidates-and-refuses-budget',async()=>{
  const before=await visibleJSON(page,'#reference-state');await configure('success',input.identity.payloadByteLength-1);
  const changed=await visibleJSON(page,'#reference-state');assert.notEqual(changed.resourceGeneration,before.resourceGeneration);assert.ok(changed.configurationRevision>before.configurationRevision);
  assert.equal(await run(),'BLOCKED');const state=await visibleJSON(page,'#owner-state');assert.equal(state.steps['input-copy'].status,'UNSUPPORTED');assert.ok(state.steps['input-copy'].reasons.some(r=>r.code==='OWNER_RESOURCE_BUDGET'));assert.deepEqual(state.snapshots,[]);assert.equal(state.artifactRefs.includes('final'),false);assertReleased(changed);
  await configure();assert.equal(await run('#retry'),'COMPLETED');return {state,scope:'Logical selected input payload allowance; not total RAM or model resources'};
 });
 await record('delay-partial-download-and-target-cancel',async()=>{
  await configure('delay');await controlClick(page,'#run');await waitInspect(page,s=>s.steps['input-copy']?.status==='RUNNING');
  await controlClick(page,'#continue-run');await waitInspect(page,s=>s.steps['input-copy']?.status==='COMPLETED'&&s.steps['final-copy']?.status==='RUNNING');
  const partial=await download(page,'#save-partial',out,'management-partial.zip');downloads.push(partial);const readback=await assertBundleCopied(partial,input,{partial:true,expectedExtension:extension});assert.equal(readback.artifactRefs.includes('final'),false);
  const before=await visibleJSON(page,'#owner-state');assert.ok(before.activeTarget);await controlClick(page,'#cancel');await waitDataState(page,'CANCELLED');await waitInspect(page,s=>s.activeTarget===null);
  const state=await visibleJSON(page,'#owner-state');assert.equal(state.steps['final-copy'].status,'CANCELLED');assert.equal(state.artifactRefs.includes('final'),false);assertReleased(await visibleJSON(page,'#reference-state'));
  return {readback,state,reference:await visibleJSON(page,'#reference-state'),stopEvidence:'Exact target cancellation awaited original promise terminal and owner release; timeout is only a failure bound'};
 });
 await record('owner-failure-isolated-and-retry',async()=>{
  await configure('fail');assert.equal(await run(),'BLOCKED');const failed=await visibleJSON(page,'#owner-state');assert.equal(failed.steps['input-copy'].status,'FAILED');assert.equal(failed.steps['input-copy'].error.code,'REFERENCE_EXECUTION_FAILED');assertReleased(await visibleJSON(page,'#reference-state'));
  await configure('success');assert.equal(await run('#retry'),'COMPLETED');return {failed,retry:await snapshot(page)};
 });
 await record('cancel-late-original-terminal-and-old-result-exclusion',async()=>{
  await configure('cancel-late');await controlClick(page,'#run');await waitInspect(page,s=>s.steps['input-copy']?.status==='RUNNING');const old=(await visibleJSON(page,'#owner-state')).activeTarget;
  await controlClick(page,'#cancel');await waitDataState(page,'CANCELLING');assert.equal(await page.locator('#run').isDisabled(),true,'A new job must wait for original terminal');
  // The owner deliberately returns an old result only after this explicit
  // barrier. Suppression is checked after its actual promise has settled.
  await controlClick(page,'#continue-run');await waitDataState(page,'CANCELLED');const cancelled=await waitInspect(page,s=>s.activeTarget===null);assert.equal(cancelled.artifactRefs.includes('partial'),false);assert.equal(cancelled.snapshots.length,0);assertReleased(await visibleJSON(page,'#reference-state'));
  await configure('success');assert.equal(await run('#retry'),'COMPLETED');const next=await visibleJSON(page,'#owner-state');assert.notEqual(next.steps['input-copy'].target.requestId,old.requestId);return {oldTarget:old,cancelled,newState:next,reference:await visibleJSON(page,'#reference-state')};
 });
 await record('release-failure-quarantine-recover-new-owner',async()=>{
  await configure('release-fail');assert.equal(await run(),'BLOCKED');const failed=await visibleJSON(page,'#owner-state'),ownerBefore=await visibleJSON(page,'#reference-state');assert.equal(failed.steps['input-copy'].error.code,'RESOURCE_CLEANUP_FAILED');assert.equal(failed.owners['reference:control'].recoveryRequired,true);assert.equal(ownerBefore.cleanupPending,true);
  assert.equal(await run('#retry'),'BLOCKED');const blocked=await visibleJSON(page,'#owner-state');assert.equal(blocked.steps['input-copy'].status,'OWNER_RECOVERY_REQUIRED');assert.equal((await visibleJSON(page,'#reference-state')).ownerInstanceId,ownerBefore.ownerInstanceId);
  await controlClick(page,'#recover');await waitDataState(page,'RECOVERED');const recovered=await visibleJSON(page,'#reference-state');assert.notEqual(recovered.ownerInstanceId,ownerBefore.ownerInstanceId);assertReleased(recovered);assert.equal((await visibleJSON(page,'#owner-state')).owners['reference:control'].recoveryRequired,false);
  assert.equal(await run('#retry'),'COMPLETED');return {failed,blocked,recovered,state:await snapshot(page)};
 });
 await record('browser-reload-bundle-restore-and-file-reselection',async()=>{
  await page.reload();await waitDataState(page,'READY_FOR_INPUT');await page.locator('#bundle-file').setInputFiles({name:'saved-management-final.zip',mimeType:'application/zip',buffer:Buffer.from(finalBundle.bytes)});await waitDataState(page,['RESTORED','ERROR']);assert.equal(await page.locator('#status').getAttribute('data-state'),'RESTORED',await page.locator('#error-details').textContent());
  assert.equal(await page.locator('#file-status').getAttribute('data-reselection-required'),'true');assert.equal(await page.locator('#run').isDisabled(),true);assert.match(await page.locator('#saved-state').textContent(),/権限.*復元されません/);
  const restored=await visibleJSON(page,'#owner-state');assert.ok(restored.artifactRefs.includes('final'));assert.ok(restored.artifactRefs.includes('input'),'Durable tensor payload can be restored independently of the old File grant');assert.deepEqual(restored.snapshots,[]);assert.ok(restored.restoredSnapshots.length>0);
  const restoredNative=await download(page,'#output-list [data-artifact-ref="final"] button',out,'restored-final.wktensor');downloads.push(restoredNative);assert.equal(restoredNative.sha256,input.identity.nativeSHA256);const preservation=await assertCopied(restoredNative.bytes,input);
  await page.locator('#asset-files').setInputFiles([{name:'development-asset.bin',mimeType:'application/octet-stream',buffer:Buffer.from([7,4,2])}]);await waitDataState(page,'INPUT_CHANGED');assert.equal(await page.locator('#file-status').getAttribute('data-reselection-required'),'false');await configure();assert.equal(await run(),'COMPLETED');return {restored,preservation,state:await snapshot(page),scope:'Durable tensor payload reused; original required owner-asset File grant invalidated and explicitly reselected'};
 });
 await record('unknown-optional-native-metadata-requires-lossless-bundle',async()=>{
  // The public WKT reader retains optional header JSON. Its pinned writer has
  // a narrower declaration set. Exercise that actual asymmetric boundary,
  // without changing the owner's native format or inventing a new codec.
  const size=new DataView(input.bytes.buffer,input.bytes.byteOffset,input.bytes.byteLength).getUint32(8,true);
  const metadata=JSON.parse(new TextDecoder().decode(input.bytes.subarray(12,12+size)));
  const optional={schemaId:'future:control-native-note',schemaVersion:'9',requiredForUse:false,data:{orderedFrames:[80,2,2,0],token:'keep exactly',nested:{camera:'reference'}}};metadata.futureOptional=optional;
  const header=new TextEncoder().encode(JSON.stringify(metadata)),bytes=new Uint8Array(12+header.byteLength+input.identity.payloadByteLength);bytes.set(input.bytes.subarray(0,8));new DataView(bytes.buffer).setUint32(8,header.byteLength,true);bytes.set(header,12);bytes.set(input.bytes.subarray(12+size),12+header.byteLength);
  await page.locator('#tensor-file').setInputFiles({name:'source-with-optional-native-metadata.wktensor',mimeType:'application/octet-stream',buffer:Buffer.from(bytes)});await waitDataState(page,'INPUT_LOADED');await configure();assert.equal(await run(),'COMPLETED');
  await controlClick(page,'#output-list [data-artifact-ref="final"] button');await waitDataState(page,'ERROR');const rejection=JSON.parse(await page.locator('#error-details').textContent());assert.equal(rejection.code,'NATIVE_SAVE_METADATA_LOSS');assert.match(rejection.message,/bundle/i);
  const bundle=await download(page,'#save-final',out,'management-optional-native-metadata.zip');downloads.push(bundle);const restored=await readBundle(bundle.bytes);assert.deepEqual(restored.artifacts.input.tensor.futureOptional,optional);assert.deepEqual(restored.artifacts.final.tensor.futureOptional,optional);assert.deepEqual(restored.artifacts.final.descriptor.native.metadata.futureOptional,optional);
  const copied=await assertBundleCopied(bundle,input,{expectedExtension:extension});assertReleased(await visibleJSON(page,'#reference-state'));
  return {selectedFile:{byteLength:bytes.byteLength,sha256:await sha(bytes)},rejection,optionalMetadataPreserved:true,readback:copied,scope:'Bare native codec cannot preserve this unknown optional header; explicit refusal prevents loss. Authenticated bundle sidecars restore all metadata with the verified native payload.'};
 });
 await record('explicit-management-disposal',async()=>{
  await controlClick(page,'#dispose');await waitDataState(page,'DISPOSED');const state=await visibleJSON(page,'#owner-state'),reference=await visibleJSON(page,'#reference-state');assert.equal(state.disposed,true);assert.equal(reference.disposed,true);assertReleased(reference);return {state,reference};
 });
}

export const STANDALONE_BROWSER_HELP='Usage: node tools/ai-connection/run-standalone-browser.mjs --out <fresh-directory> --manager-commit <full-SHA> [--smoke]\nDevelopment RED/iteration only: --development --out <fresh-directory>. Serves the actual docs/ai-connection page and public modules over loopback. Uses real Chromium File selection and downloads; no model assets or NN prerequisite.';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const values={};for(let i=2;i<process.argv.length;i++){const key=process.argv[i];if(key==='--help'){console.log(STANDALONE_BROWSER_HELP);process.exit(0);}if(['--development','--smoke'].includes(key)){values[key.slice(2)]=true;continue;}if(!['--out','--manager-commit'].includes(key)||!process.argv[i+1]||process.argv[i+1].startsWith('--')||values[key.slice(2)])throw failure('BROWSER_ARGUMENT_INVALID','Unknown, duplicate or incomplete argument: '+key);values[key.slice(2)]=process.argv[++i];}const result=await runStandaloneBrowser({out:values.out,managerCommit:values['manager-commit'],development:values.development,smoke:values.smoke});console.log(JSON.stringify({status:result.status,development:result.development,cases:result.cases.map(({name,status})=>({name,status})),out:values.out}));if(result.status!=='PASS')process.exitCode=1;}catch(error){console.error(JSON.stringify({status:'FAIL',code:error.code??null,message:error.message}));process.exitCode=1;}
}

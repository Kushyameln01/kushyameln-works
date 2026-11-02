#!/usr/bin/env node
/** Actual public Worker/control and canonical-file checks. This deliberately
 * uses no real model pair and never treats its synthetic codec fixture as a
 * neural prediction, a sample result, or model/production acceptance. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,dirname,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),DOCS=join(ROOT,'docs');
const ADAPTER='/shared/ai-connection/adapters/diffusion-public/adapter.mjs';
const NATIVE='/shared/ai-connection/native/diffusion-ffeeeedb/';
const git=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const failure=(code,message)=>Object.assign(Error(message),{code});
const SCOPE='CONTROL ONLY: actual adopted public factory/Worker, default one-thread admission, no-COI rejection, queue and canonical synthetic-file preservation. No real HIGH/LOW model loaded; no neural predict/sample or production/Pages numerical acceptance.';
const MIME={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'};
const sourceType=path=>Object.entries(MIME).find(([suffix])=>path.endsWith(suffix))?.[1]??'application/octet-stream';
const HARNESS='<!doctype html><html lang="en"><meta charset="utf-8"><title>Diffusion public CONTROL harness</title><body><h1>Diffusion public CONTROL harness</h1><p>No model pair; synthetic codec fixture only. No neural output.</p><label>Invalid HIGH File <input id="high" type="file"></label><label>Invalid LOW File <input id="low" type="file"></label><label>Saved synthetic tensor File <input id="tensor" type="file"></label><pre id="state"></pre></body></html>';

async function bounded(promise,label,ms=60000){
 let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure('CONTROL_TIMEOUT',label+' exceeded '+ms+'ms; no stop or success inferred')),ms);})]);}finally{clearTimeout(timer);}
}
async function sourceReceipt(path,commit){
 const bytes=new Uint8Array(await readFile(path)),record={path:relative(ROOT,path).split(sep).join('/'),byteLength:bytes.byteLength,sha256:sha(bytes)};
 if(commit){let expected;try{expected=new Uint8Array((await git('git',['-C',ROOT,'show',commit+':'+record.path],{encoding:'buffer',maxBuffer:32*1024*1024})).stdout);}catch{throw failure('CONTROL_SOURCE_NOT_FROZEN','Missing committed source '+record.path);}
  if(expected.byteLength!==record.byteLength||sha(expected)!==record.sha256)throw failure('CONTROL_SOURCE_NOT_FROZEN','Working source differs from fixed commit: '+record.path);
 }
 return {record,bytes};
}
async function startStaticServer({commit,requests,sourceErrors,records}){
 const cached=new Map();
 async function capture(file){if(!cached.has(file)){const r=await sourceReceipt(file,commit);cached.set(file,r.bytes);records.set(r.record.path,r.record);}return cached.get(file);}
 await capture(join(DOCS,ADAPTER));
 const server=createServer(async(request,response)=>{
  const url=new URL(request.url,'http://local'),path=decodeURIComponent(url.pathname);requests.push({method:request.method,path});response.setHeader('Cache-Control','no-store');
  // Intentionally no COOP/COEP. This is the ordinary non-isolated Pages
  // resource environment, not a claim about actual Pages-hosted inference.
  if(request.method!=='GET'){sourceErrors.push({code:'NON_GET_REQUEST',path,method:request.method});response.writeHead(405).end();return;}
  if(path==='/__diffusion_public_control__'){response.setHeader('Content-Type',MIME['.html']);response.end(HARNESS);return;}
  if(path==='/favicon.ico'){response.writeHead(204).end();return;}
  const file=resolve(DOCS,'.'+path);
  if(!file.startsWith(DOCS+sep)){sourceErrors.push({code:'SOURCE_PATH_ESCAPE',path});response.writeHead(403).end();return;}
  try{const bytes=await capture(file);response.setHeader('Content-Type',sourceType(file));response.end(bytes);}catch(error){sourceErrors.push({code:error.code??'SOURCE_READ_FAILED',path,message:error.message});response.writeHead(404).end();}
 });
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
 return {server,origin:'http://127.0.0.1:'+server.address().port};
}

export function makeSyntheticGeneratedSample(){
 const data=new Float32Array(128);for(let i=0;i<data.length;i++)data[i]=(i%17-8)/4;data[8]=-0;
 const tensor={dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'wan21-raw-generated-sample:v1',latentContract:{schemaVersion:1,representation:'generated-sample',space:'raw',vaeModelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',producerModelSha256s:['9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52','ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3'],normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}},data};
 return {tensor,payload:new Uint8Array(data.buffer).slice(),classification:'synthetic codec fixture; producer/decoder hashes are literal metadata declarations, not neural provenance'};
}
function inspectCanonicalFile(bytes,fixture){
 assert.equal(Buffer.from(bytes.subarray(0,8)).toString(),'WKTSR001');const length=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,true);
 assert.ok(length>0&&length<=65536);const header=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+length))),payload=bytes.subarray(12+length);
 assert.equal(bytes.byteLength,12+length+512);assert.deepEqual(Buffer.from(payload),Buffer.from(fixture.payload));
 for(const key of ['dtype','shape','layout','meaning','latentContract'])assert.deepEqual(header[key],fixture.tensor[key]);
 assert.equal(header.byteOrder,'little');assert.equal(header.byteLength,512);assert.equal(header.dataSha256,sha(fixture.payload));assert.equal(header.normalization,undefined);assert.equal(header.modelSha256,undefined);
 return {byteLength:bytes.byteLength,sha256:sha(bytes),payloadByteLength:payload.byteLength,payloadSHA256:sha(payload),header,byteExact:true,negativeZeroPreserved:new DataView(payload.buffer,payload.byteOffset,payload.byteLength).getUint32(8*4,true)===0x80000000};
}

export async function runDiffusionPublicControl({out,managerCommit,development=false}={}){
 if(!out)throw failure('CONTROL_OUTPUT_REQUIRED','A fresh --out directory is required');
 if(!development&&!/^[a-f0-9]{40}$/.test(managerCommit??''))throw failure('CONTROL_COMMIT_REQUIRED','Final control verification requires a full --manager-commit; --development is explicitly unfrozen');
 out=resolve(out);await mkdir(dirname(out),{recursive:true,mode:0o700});await mkdir(out,{mode:0o700});
 const started=performance.now(),sourceErrors=[],browserErrors=[],requests=[],records=new Map(),cases=[],downloads=[],workers=[];
 let server,browser,page,result,origin;
 const record=async(name,fn)=>{const began=performance.now();try{const detail=await bounded(fn(),name);cases.push({name,durationMs:performance.now()-began,...detail,status:'PASS'});}catch(error){cases.push({name,status:'FAIL',durationMs:performance.now()-began,code:error.code??null,message:error.message});throw error;}};
 const workerCloses=()=>bounded(Promise.all(workers.map(w=>w.terminal)),'Observed actual Worker closes',10000);
 const workerSnapshot=()=>workers.map(({terminal,...w})=>({...w}));
 try{
  const own=await sourceReceipt(fileURLToPath(import.meta.url),development?null:managerCommit);records.set(own.record.path,own.record);
  const service=await startStaticServer({commit:development?null:managerCommit,requests,sourceErrors,records});server=service.server;origin=service.origin;
  const require=createRequire('/opt/codex/cua_node/package.json'),{chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  page=await browser.newPage({viewport:{width:1200,height:900},acceptDownloads:true});
  page.on('pageerror',error=>browserErrors.push(error.message));page.on('worker',worker=>{let closed;const row={url:worker.url(),closed:false,terminal:new Promise(done=>{closed=done;})};workers.push(row);worker.on('close',()=>{row.closed=true;closed();});});
  await page.route('**/*',route=>{const request=route.request();if(request.method()==='GET'&&new URL(request.url()).origin===origin)return route.continue();sourceErrors.push({code:'OFF_ORIGIN_OR_MUTATING_REQUEST',url:request.url(),method:request.method()});return route.abort();});
  const navigation=await page.goto(origin+'/__diffusion_public_control__');assert.equal(navigation.headers()['cross-origin-opener-policy'],undefined);assert.equal(navigation.headers()['cross-origin-embedder-policy'],undefined);
  await record('real-factory-capabilities-no-coi-no-injected-api',async()=>{
   const state=await page.evaluate(async adapter=>{const {createDiffusionPublicManagement}=await import(adapter);window.control={manager:await createDiffusionPublicManagement({managerSessionId:'browser-control-manager',apiSessionId:'browser-control-api'})};return {environment:{crossOriginIsolated:globalThis.crossOriginIsolated===true,sharedArrayBuffer:typeof SharedArrayBuffer==='function',worker:typeof Worker==='function'},state:control.manager.inspect()};},ADAPTER);
   assert.equal(state.environment.crossOriginIsolated,false);assert.equal(state.environment.worker,true);assert.equal(state.state.controlTestDouble,false);assert.equal(state.state.capabilities.modelInference,false);
   assert.deepEqual(state.state.modelRuntime.operationsImplemented,['load','predict','sample','unload','modelStatus','saveTensor','readTensor']);assert.equal(state.state.loaded,false);assert.equal(state.state.generationReady,false);assert.equal(workers.length,0);
   return {environment:state.environment,legacyModelInference:false,implemented:state.state.modelRuntime.operationsImplemented,workerDeferredUntilRequest:true,controlTestDouble:false};
  });
  await record('model-not-loaded-admission-and-pre-dispatch-cancel',async()=>{
   const before=workers.length,r=await page.evaluate(async()=>{const m=control.manager,query=await m.query({operation:'sample',input:{}});let sampleError;try{await m.sample({input:{},requestId:'sample-before-load'});}catch(e){sampleError={code:e.code,message:e.message};}const abort=new AbortController();abort.abort();let cancelError;try{await m.sample({input:{},requestId:'pre-aborted',signal:abort.signal});}catch(e){cancelError={code:e.code,message:e.message};}return {query,sampleError,cancelError,state:m.inspect()};});
   assert.equal(r.query.implemented,true);assert.equal(r.query.dispatchSupported,false);assert.equal(r.sampleError.code,'MODEL_NOT_LOADED');assert.equal(r.cancelError.code,'INVOCATION_CANCELLED');assert.equal(workers.length,before);assert.equal(r.state.loaded,false);
   for(const id of ['sample-before-load','pre-aborted']){const terminal=r.state.queue.invocations.find(v=>v.requestId===id);assert.equal(terminal.originalTerminal,true);assert.equal(terminal.resourceReleased,true);assert.equal(terminal.resultAccepted,false);}
   return {sampleError:r.sampleError,cancelError:r.cancelError,noWorkerDispatched:true,modelWorkStarted:false};
  });
  await record('actual-model-status-worker-and-queued-cancel',async()=>{
   const r=await page.evaluate(async()=>{const m=control.manager,first=m.modelStatus({requestId:'initial-status'}),abort=new AbortController();const queued=m.sample({input:{},requestId:'queued-before-load',signal:abort.signal}).then(v=>({accepted:true}),e=>({code:e.code,message:e.message}));const seen=m.inspect().queue.invocations.find(v=>v.requestId==='queued-before-load');abort.abort();const [status,cancelled]=await Promise.all([first,queued]);return {status,cancelled,seen,state:m.inspect()};});
   assert.equal(r.seen.state,'queued');assert.equal(r.cancelled.code,'INVOCATION_CANCELLED');assert.equal(r.status.loaded,false);assert.equal(r.status.cleanupRequired,false);assert.equal(r.state.activeTarget,null);assert.equal(workers.length,1);
   const terminal=r.state.queue.invocations.find(v=>v.requestId==='queued-before-load');assert.equal(terminal.resultAccepted,false);assert.equal(terminal.originalTerminal,false);assert.equal(terminal.stopAcknowledged,false);
   return {actualWorkerCreated:true,nativeStatus:r.status.result,queuedCancelledBeforeDispatch:true,nativeStopClaimed:false,unstartedQueueRecord:terminal};
  });
  const invalidHigh=join(out,'synthetic-invalid-HIGH.bin'),invalidLow=join(out,'synthetic-invalid-LOW.bin');
  await writeFile(invalidHigh,new Uint8Array([0,1,2,3,4,5,6,7]),{flag:'wx',mode:0o600});await writeFile(invalidLow,new Uint8Array([7,6,5,4,3,2,1,0]),{flag:'wx',mode:0o600});
  await page.locator('#high').setInputFiles(invalidHigh);await page.locator('#low').setInputFiles(invalidLow);
  await record('explicit-four-threads-no-coi-rejected-no-one-thread-fallback',async()=>{
   const before=workers.length,r=await page.evaluate(async native=>{const m=control.manager,files={HIGH:document.querySelector('#high').files[0],LOW:document.querySelector('#low').files[0]};let managed;try{await m.load({files,resource:{wasmThreads:4},requestId:'four-threads-rejected'});}catch(e){managed={code:e.code,message:e.message};}const n=await import(native),api=n.createDiffusionModels({sessionId:'raw-four-thread-control'});try{const reply=await api.request({protocolVersion:n.PROTOCOL_VERSION,buildId:n.BUILD_ID,sessionId:api.sessionId,jobId:'explicit-four',inputRevision:1,op:'load',input:{files,resource:{wasmThreads:4}}});return {managed,native:reply};}finally{api.dispose();}},'/shared/ai-connection/adapters/diffusion-public/native.mjs');
   assert.equal(r.managed.code,'UNSUPPORTED_RESOURCE_CONFIG');assert.equal(r.native.status,'error');assert.equal(r.native.error.code,'UNSUPPORTED_RESOURCE_CONFIG');assert.equal(r.native.error.details.requestedThreads,4);assert.equal(r.native.error.details.noFallback,true);assert.equal(r.native.error.details.workerTerminated,true);assert.equal(workers.length,before+1);await bounded(workers.at(-1).terminal,'Rejected four-thread Worker close',10000);
   return {managementError:r.managed,nativeError:r.native.error,requestedThreads:4,fallbackApplied:false,managementDispatchBlocked:true,nativeWorkerDiscarded:true,modelLoaded:false};
  });
  await record('exact-target-cancel-terminates-real-control-worker-reload-required',async()=>{
   const before=workers.length,r=await page.evaluate(async()=>{const m=control.manager,pending=m.modelStatus({requestId:'cancel-native-control'}).then(value=>({accepted:true}),e=>({code:e.code,message:e.message}));let target;for(let i=0;i<20&&!target;i++){await Promise.resolve();target=m.inspect().activeTarget;}if(!target)throw Error('Control request did not expose its real native target');const cancelled=await m.cancel(target),original=await pending;let sampleError;try{await m.sample({input:{},requestId:'sample-after-native-cancel'});}catch(e){sampleError={code:e.code,message:e.message};}return {target,cancelled,original,sampleError,state:m.inspect()};});
   assert.equal(r.cancelled.cancelled,true);assert.equal(r.cancelled.originalTerminal,true);assert.equal(r.original.code,'INVOCATION_CANCELLED');assert.equal(r.sampleError.code,'MODEL_NOT_LOADED');assert.equal(r.state.loaded,false);assert.equal(r.state.reloadRequired,true);assert.equal(r.state.cleanupRequired,false);assert.equal(workers.length,before);await workerCloses();const terminal=r.state.queue.invocations.find(v=>v.requestId==='cancel-native-control');assert.equal(terminal.stopAcknowledged,true);assert.equal(terminal.originalTerminal,true);assert.equal(terminal.resourceReleased,true);assert.equal(terminal.reusable,true);assert.equal(terminal.resultAccepted,false);
   return {cancelledOperation:'modelStatus',modelOrNeuralWorkStarted:false,exactTarget:r.target,originalError:r.original,terminal,actualWorkerClosed:true,reloadRequired:true,sampleRetryError:r.sampleError,scope:'Actual native control-request cancellation; real neural sample cancellation requires the retained-model runner'};
  });
  await record('one-thread-file-pair-reaches-real-worker-failed-prepare-is-discarded',async()=>{
   const before=workers.length,r=await page.evaluate(async()=>{const m=control.manager,files={HIGH:document.querySelector('#high').files[0],LOW:document.querySelector('#low').files[0]};let error;try{await m.load({files,resource:{wasmThreads:1},requestId:'one-thread-invalid-pair'});}catch(e){error={code:e.code,message:e.message,details:e.details};}return {error,state:m.inspect()};});
   assert.ok(r.error);assert.equal(r.error.code,'INVALID_SAFETENSORS');assert.match(r.error.message,/Header length exceeds file/);assert.equal(r.error.details.workerTerminated,true);assert.equal(r.error.details.preparationDiscarded,true);assert.equal(r.error.details.reloadRequired,true);assert.equal(r.state.loaded,false);assert.equal(r.state.cleanupRequired,false);assert.equal(r.state.reloadRequired,true);assert.equal(workers.length,before+1);await workerCloses();
   return {resource:{wasmThreads:1,crossOriginIsolated:false},fileSizes:{HIGH:8,LOW:8},error:r.error,actualWorkerAdmission:true,modelLoadSucceeded:false,neuralExecution:false,workerDiscarded:true,management:{loaded:r.state.loaded,cleanupRequired:r.state.cleanupRequired,reloadRequired:r.state.reloadRequired}};
  });
  await record('fresh-worker-status-clean-after-failed-preparation',async()=>{
   const before=workers.length,r=await page.evaluate(async()=>{const result=await control.manager.modelStatus({requestId:'fresh-status'});return {result,state:control.manager.inspect()};});
   assert.equal(workers.length,before+1);assert.equal(r.result.loaded,false);assert.equal(r.result.cleanupRequired,false);assert.equal(r.result.modelSessionId,null);assert.equal(r.result.modelEpoch,0);assert.equal(r.result.busy,false);assert.equal(r.state.reloadRequired,true);
   return {nativeStatus:r.result.result,freshWorker:true,cleanupRequired:false,reloadStillRequired:true,modelLoaded:false};
  });
  const fixture=makeSyntheticGeneratedSample();
  await writeFile(join(out,'synthetic-codec-payload.f32'),fixture.payload,{flag:'wx',mode:0o600});
  await record('synthetic-raw-generated-sample-save-download-and-disk-file-read',async()=>{
   const meta={...fixture.tensor};delete meta.data;const pending=page.waitForEvent('download',{timeout:30000});
   const saved=await page.evaluate(async({metadata,payload})=>{const data=new Float32Array(new Uint8Array(payload).buffer);const result=await control.manager.saveTensor({tensor:{...metadata,data},requestId:'save-synthetic'});control.saved=result;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([result.bytes],{type:'application/octet-stream'}));a.href=url;a.download='synthetic-raw-generated-sample.wktensor';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return {byteLength:result.byteLength,sha256:result.sha256,metadata:result.metadata,normalExecution:result.normalExecution};},{metadata:meta,payload:Array.from(fixture.payload)});
   const download=await pending,path=join(out,'synthetic-raw-generated-sample.wktensor');await download.saveAs(path);const bytes=new Uint8Array(await readFile(path)),canonical=inspectCanonicalFile(bytes,fixture);assert.equal(saved.sha256,canonical.sha256);assert.equal(saved.byteLength,bytes.byteLength);assert.equal(saved.normalExecution,false);assert.deepEqual(saved.metadata.latentContract,fixture.tensor.latentContract);assert.equal(canonical.negativeZeroPreserved,true);
   await page.locator('#tensor').setInputFiles(path);
   const read=await page.evaluate(async()=>{const file=document.querySelector('#tensor').files[0],result=await control.manager.readTensor({file,requestId:'read-synthetic-disk-file'}),{data,...metadata}=result.tensor;control.restored=result;const held=await control.manager.restoreArtifact(result.artifactRecord.artifactId);return {file:{name:file.name,size:file.size,nativeFile:file instanceof File},sha256:result.sha256,byteLength:result.byteLength,metadata,payload:Array.from(new Uint8Array(data.buffer,data.byteOffset,data.byteLength)),ownedPayload:Array.from(new Uint8Array(held.data.buffer,held.data.byteOffset,held.data.byteLength)),artifactRecord:result.artifactRecord,normalExecution:result.normalExecution};});
   assert.equal(read.file.nativeFile,true);assert.equal(read.file.size,bytes.byteLength);assert.equal(read.sha256,canonical.sha256);assert.equal(read.byteLength,bytes.byteLength);assert.deepEqual(Buffer.from(read.payload),Buffer.from(fixture.payload));assert.deepEqual(read.ownedPayload,read.payload);assert.equal(read.normalExecution,false);
   for(const key of ['dtype','shape','layout','meaning','latentContract'])assert.deepEqual(read.metadata[key],fixture.tensor[key]);assert.equal(read.artifactRecord.descriptor.tensor.nativeMeaning,'wan21-raw-generated-sample:v1');assert.deepEqual(read.artifactRecord.descriptor.native.metadata.latentContract,fixture.tensor.latentContract);
   downloads.push({filename:download.suggestedFilename(),path:relative(out,path),...canonical,classification:fixture.classification});
   return {classification:fixture.classification,actualBrowserDownload:true,actualDiskFileSelected:true,file:read.file,canonical,metadataPreserved:true,ownedArtifactByteExact:true,neuralOutput:false};
  });
  await record('actual-unload-closes-worker-and-new-status-reopens-only-control',async()=>{
   const before=workers.length,r=await page.evaluate(async()=>{const result=await control.manager.unload({requestId:'unload-control'});return {result,state:control.manager.inspect()};});assert.equal(r.result.unloaded,true);assert.equal(r.state.loaded,false);assert.equal(r.state.reloadRequired,false);assert.equal(r.state.cleanupRequired,false);await workerCloses();
   const status=await page.evaluate(async()=>{const r=await control.manager.modelStatus({requestId:'status-after-unload'});return r.result;});assert.equal(workers.length,before+1);assert.equal(status.loaded,false);return {unloaded:true,allPreviousWorkersClosed:true,statusWorkerReopened:true,nativeStatus:status,scope:'Unloaded empty control owner only; no real model pair was allocated'};
  });
  await record('dispose-releases-artifacts-and-observed-worker-closes',async()=>{
   const r=await page.evaluate(async()=>{const result=await control.manager.dispose(),state=control.manager.inspect();document.querySelector('#state').textContent=JSON.stringify(state,null,2);return {result,state};});assert.equal(r.result.disposed,true);assert.equal(r.state.disposed,true);assert.equal(r.state.artifactCount,0);assert.equal(r.state.activeTarget,null);assert.equal(r.state.queue.disposed,true);assert.ok(r.state.queue.groups.every(g=>g.activeInvocationId===null&&!g.queued.length&&!g.quarantined));await workerCloses();return {disposed:true,artifactCount:0,actualWorkerCreated:workers.length,actualWorkerClosed:workers.filter(w=>w.closed).length};
  });
  await record('entire-native-closure-and-manager-served-with-source-guards',async()=>{
   const manifest=JSON.parse(await readFile(join(DOCS,NATIVE,'SOURCE.json'),'utf8'));
   for(const f of manifest.files){const path='docs'+NATIVE+f.path,got=records.get(path);assert.ok(got,'Missing actual native GET '+path);assert.equal(got.sha256,f.sha256);assert.equal(got.byteLength,f.byteLength);}
   assert.equal(manifest.files.length,150);for(const path of ['docs'+ADAPTER,'docs/shared/ai-connection/adapters/diffusion-public/native.mjs','docs'+NATIVE+'docs/shared/diffusion-models/api/worker.mjs','docs'+NATIVE+'docs/shared/inference/vendor/ort.wasm.min.mjs','docs'+NATIVE+'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm'])assert.ok(records.has(path),'Required source GET '+path);
   assert.equal(sourceErrors.length,0);assert.equal(browserErrors.length,0);return {managerSourceGET:true,nativeSourceFilesGET:manifest.files.length,workerSourceGET:true,ortSourceGET:true,allNativeBytesMatchPinnedManifest:true,allServedBytesMatchManagerCommit:!development};
  });
  await page.screenshot({path:join(out,'browser-control.png'),fullPage:true});result={status:cases.every(c=>c.status==='PASS')&&!sourceErrors.length&&!browserErrors.length?'PASS':'FAIL',browserVersion:browser.version()};
 }catch(error){result={status:'FAIL',code:error.code??null,message:error.message,browserVersion:browser?.version()??null};if(page)try{result.failureState=await page.evaluate(()=>window.control?.manager.inspect());await page.screenshot({path:join(out,'failure.png'),fullPage:true});}catch{}}
 finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}}
 const publicResult={schemaVersion:'works-diffusion-public-browser-control/0.1',...result,scope:SCOPE,verificationKind:'actual-public-worker-control-synthetic-codec',development,management:{commit:managerCommit??null,fixedSourceVerified:!development&&result.status==='PASS',files:[...records.values()]},environment:{coiHeadersSent:false,ordinaryNoCOI:true,wasmThreadsRequested:1,actualModelLoaded:false,actualNeuralSample:false,actualNeuralPredict:false,realModelInputsPresent:false},cases,downloads,resources:{browserDurationMs:performance.now()-started,workers:workerSnapshot(),workerCreated:workers.length,workerClosed:workers.filter(w=>w.closed).length,workerClosesBeforeBrowserShutdown:cases.find(c=>c.name==='dispose-releases-artifacts-and-observed-worker-closes')?.actualWorkerClosed??null,osRSSBytes:null,ORTMemoryBytes:null,totalPeakRAMBytes:null},sourceErrors,browserErrors,network:{scope:'Static fixed public source GET only over loopback. Selected File bytes stay local to browser/Worker; no uploads.',requests},generationReady:false,originalWorkflowAccepted:false,acceptedProduction:false,modelInference:false};
 await writeFile(join(out,'result.json'),JSON.stringify(publicResult,null,2)+'\n',{flag:'wx',mode:0o600});return publicResult;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i++){if(args[i]==='--out')options.out=args[++i];else if(args[i]==='--manager-commit')options.managerCommit=args[++i];else if(args[i]==='--development')options.development=true;else throw failure('CONTROL_ARGUMENT','Unknown argument '+args[i]);}
 try{const result=await runDiffusionPublicControl(options);console.log(JSON.stringify({status:result.status,out:resolve(options.out),scope:result.scope,cases:result.cases.map(({name,status})=>({name,status})),fixedSourceVerified:result.management.fixedSourceVerified}));if(result.status!=='PASS')process.exitCode=1;}catch(error){console.error(error.code??'CONTROL_RUNNER_ERROR',error.message);process.exitCode=1;}
}

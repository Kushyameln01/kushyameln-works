#!/usr/bin/env node
// Development acceptance only. No Diffusion, management, or real-base decoder.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,fork,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {createLoraStandalone} from '../../docs/shared/inference/lora/standalone-sdk.mjs';
import {createBerniniStandaloneRegistry} from '../../docs/shared/inference/lora/standalone-registry.mjs';
import {captureOwnedLoraSource,createLoraProductCache} from '../../docs/shared/inference/lora/owned-package.mjs';
import {createStreamingKernel} from '../../docs/shared/inference/lora/kernel/streaming/host.mjs';
import {createIndependentBaseProvider,createStandaloneReferenceHost,standaloneCoordinates} from './standalone-host.mjs';
import {openStandaloneNodeSource,createStandaloneNodeWriter} from './standalone-node-source.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const ORACLE=path.join(HERE,'standalone-reference.py');
const WASM=path.join(ROOT,'docs/shared/inference/lora/kernel/streaming/lora.wasm');
const PILOT_KEYS=['diffusion_model.blocks.0.cross_attn.q.weight','diffusion_model.blocks.0.ffn.2.weight'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const sameBytes=(a,b)=>a.length===b.length&&Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength));
const errorRecord=error=>({name:error?.name??'Error',message:String(error?.message??error),stack:String(error?.stack??'').split('\n').slice(0,15).join('\n'),...(error?.errors?{causes:[...error.errors].map(errorRecord)}:{})});
const reportFile=(name,value)=>fs.writeFile(name,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});

/** All active cases park before a group can advance to its minimum coordinate. */
export function createCohortScheduler(caseIds,targetIndices){
 const active=new Set(caseIds),pending=new Map(),running=new Set(),previous=new Map();let failure=null,groups=0,completedBlocks=0;
 const compare=(a,b)=>a[0]-b[0]||a[1]-b[1];
 function pump(){
  if(failure||running.size||[...active].some(id=>!pending.has(id)))return;
  if(!active.size)return;
  let first=null;for(const value of pending.values())if(first===null||compare(value.order,first)<0)first=value.order;
  const selected=[...pending].filter(([,value])=>compare(value.order,first)===0);groups++;
  for(const [id,value]of selected){pending.delete(id);running.add(id);value.resolve();}
 }
 return Object.freeze({
  before(id,coordinate){return new Promise((resolve,reject)=>{
   if(failure){reject(failure);return;}if(!active.has(id)){reject(Error('Inactive cohort case'));return;}
   if(pending.has(id)||running.has(id)){reject(Error('Cohort case already waiting or running'));return;}
   const index=targetIndices.get(coordinate.key),order=[index,coordinate.offset];
   if(!Number.isSafeInteger(index)||!Number.isSafeInteger(coordinate.offset)||coordinate.offset<0){reject(Error('Unknown cohort target/coordinate'));return;}
   if(previous.has(id)&&compare(order,previous.get(id))<=0){reject(Error('Nonmonotonic cohort coordinates'));return;}
   previous.set(id,order);pending.set(id,{order,resolve,reject});pump();
  });},
  finished(id){if(!running.delete(id))throw Error('Cohort completion without a released block');completedBlocks++;pump();},
  done(id){if(pending.has(id)||running.has(id))throw Error('Cohort case completed with pending block');active.delete(id);pump();},
  abort(error){if(failure)return;failure=error;for(const value of pending.values())value.reject(error);pending.clear();},
  stats:()=>({activeCases:active.size,pendingCases:pending.size,runningCases:running.size,groups,completedBlocks,aborted:!!failure})
 });
}

/** Reserve before producing an owned F32 block, retain through its oracle ack.
 * Production admission and development comparison have separate completion.
 */
export function createBoundedComparisonQueue({maxFrames=16,maxBytes=32*1024*1024,onError}={}){
 if(!Number.isSafeInteger(maxFrames)||maxFrames<1||!Number.isSafeInteger(maxBytes)||maxBytes<4)throw RangeError('Invalid comparison queue budget');
 const reservations=new Map(),waiting=[],tasks=new Set();let bytes=0,peakBytes=0,peakFrames=0,accepted=0,completed=0,failure=null;
 function reserve(size){const token=Object.freeze({}),state={size,enqueued:false};reservations.set(token,state);bytes+=size;peakBytes=Math.max(peakBytes,bytes);peakFrames=Math.max(peakFrames,reservations.size);return token;}
 function pump(){if(failure)return;while(waiting.length&&reservations.size<maxFrames&&bytes+waiting[0].size<=maxBytes){const next=waiting.shift();next.resolve(reserve(next.size));}}
 function drop(token){const state=reservations.get(token);if(!state)return;reservations.delete(token);bytes-=state.size;pump();}
 function abort(error){if(failure)return;failure=error;for(const producer of waiting)producer.reject(error);waiting.length=0;for(const [token,state]of reservations)if(!state.enqueued)drop(token);}
 return Object.freeze({
  acquire(size){if(failure)return Promise.reject(failure);if(!Number.isSafeInteger(size)||size<4||size>maxBytes)return Promise.reject(RangeError('Comparison frame exceeds byte budget'));
   if(!waiting.length&&reservations.size<maxFrames&&bytes+size<=maxBytes)return Promise.resolve(reserve(size));
   return new Promise((resolve,reject)=>waiting.push({size,resolve,reject}));
  },
  enqueue(token,compare){const state=reservations.get(token);if(failure)throw failure;if(!state||state.enqueued||typeof compare!=='function')throw Error('Invalid comparison reservation');state.enqueued=true;accepted++;
   let tracked;tracked=Promise.resolve().then(compare).then(value=>{completed++;return value;},error=>{const first=!failure;abort(error);if(first)onError?.(error);throw error;}).finally(()=>{drop(token);tasks.delete(tracked);});tasks.add(tracked);
   // Every failure remains stored for drain(); attach a handler immediately so
   // a producer can keep computing without an unhandled rejection interval.
   void tracked.catch(()=>{});
  },
  release(token){const state=reservations.get(token);if(state?.enqueued)throw Error('Cannot release a frame before its comparison is terminal');drop(token);},
  abort,
  async drain(){while(tasks.size)await Promise.allSettled([...tasks]);if(failure)throw failure;if(reservations.size||waiting.length)throw Error('Unsubmitted comparison reservations remain at drain');},
  stats:()=>({maxFrames,maxBytes,retainedFrames:reservations.size,retainedBytes:bytes,peakRetainedFrames:peakFrames,peakRetainedBytes:peakBytes,comparisonPromises:tasks.size,waitingProducers:waiting.length,acceptedFrames:accepted,completedFrames:completed,failed:!!failure})
 });
}

/** One serialized frame queue per independent Python process. */
export function createOracleClient({python=process.env.PYTHON??'python',oraclePath=ORACLE}={}){
 if(os.endianness()!=='LE')throw Error('The actual F32 framing requires a little-endian Node host');
 const child=spawn(python,[oraclePath],{stdio:['pipe','pipe','pipe'],env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
 let waiter=null,tail=Promise.resolve(),terminal=false,closed=false,exitCode=null,stderr='',lastError=null;
 // close also follows a spawn failure, for which Node never emits exit.
 const exited=new Promise(resolve=>{child.once('close',(code,signal)=>{closed=true;exitCode=code;const result={code,signal};if(waiter){waiter.reject(lastError??Error('Independent oracle exited before response: '+JSON.stringify(result)+' '+stderr));waiter=null;}resolve(result);});});
 child.on('error',error=>{lastError=error;waiter?.reject(error);waiter=null;});
 child.stdin.on('error',error=>{lastError=error;waiter?.reject(error);waiter=null;});
 child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-65536);});
 const lines=createInterface({input:child.stdout});lines.on('line',line=>{
  const current=waiter;waiter=null;if(!current){lastError=Error('Unexpected independent oracle stdout');return;}
  try{const value=JSON.parse(line);if(value.ok!==true)throw Error('Independent oracle: '+value.error);current.resolve(value);}catch(error){current.reject(error);}
 });
 async function write(bytes){
  if(closed||child.stdin.destroyed)throw lastError??Error('Independent oracle input closed');
  if(child.stdin.write(bytes))return;
  await new Promise((resolve,reject)=>{
   const cleanup=()=>{child.stdin.removeListener('drain',drained);child.stdin.removeListener('error',failed);child.stdin.removeListener('close',ended);child.removeListener('close',ended);};
   const drained=()=>{cleanup();resolve();},failed=error=>{cleanup();reject(error);},ended=()=>failed(lastError??Error('Independent oracle input closed before drain'));
   child.stdin.once('drain',drained);child.stdin.once('error',failed);child.stdin.once('close',ended);child.once('close',ended);
   if(closed||child.stdin.destroyed)ended();
  });
 }
 function request(header,data){
  const work=tail.then(async()=>{
   if(terminal||closed||lastError)throw lastError??Error('Independent oracle is terminal');
   const raw=Buffer.from(JSON.stringify(header)),prefix=Buffer.allocUnsafe(4);prefix.writeUInt32LE(raw.length);
   const response=new Promise((resolve,reject)=>{waiter={resolve,reject};});
   // An error response can precede drain on a large payload. Handle it now,
   // and let it interrupt a blocked write without losing the original error.
   void response.catch(()=>{});const rejectedResponse=response.then(()=>new Promise(()=>{}));
   try{await Promise.race([write(Buffer.concat([prefix,raw])),rejectedResponse]);if(header.op==='compare'){
    if(!(data instanceof Float32Array)||data.length!==header.count)throw Error('Actual oracle payload must be complete F32 data');
    await Promise.race([write(Buffer.from(data.buffer,data.byteOffset,data.byteLength)),rejectedResponse]);
   }}catch(error){lastError??=error;waiter?.reject(error);waiter=null;throw error;}
   return response;
  });tail=work;void work.catch(()=>{});return work;
 }
 return Object.freeze({pid:child.pid,request,
  async finalize(){const result=await request({op:'finalize'});terminal=true;child.stdin.end();const exit=await exited;if(exit.code!==(result.passed?0:2))throw Error('Independent oracle unexpected terminal exit '+JSON.stringify(exit));return result;},
  async stop(){if(!closed){terminal=true;child.kill('SIGTERM');await exited;}lines.close();},
  stats:()=>({pid:child.pid,closed,exitCode,stderr})
 });
}

function definitions(side){return [
 ...['light','detail'].flatMap(pairId=>[0,1,-1].map(strength=>({id:`${side}-${pairId}-${strength}`,selections:[{pairId,strength}]}))),
 {id:`${side}-both-plus`,selections:[{pairId:'light',strength:1},{pairId:'detail',strength:1}]},
 {id:`${side}-both-minus`,selections:[{pairId:'light',strength:1},{pairId:'detail',strength:-1}]}
];}

async function headerIdentity(cap){return digest(await cap.read(8,cap.inspection.headerBytes));}
async function processMemory(pid){try{const text=await fs.readFile(`/proc/${pid}/status`,'utf8'),field=name=>Number(text.match(new RegExp('^'+name+':\\s+(\\d+)','m'))?.[1]??0)*1024;return {rssBytes:field('VmRSS'),peakRssBytes:field('VmHWM')};}catch{return null;}}
function assertSource(asset,cap,headerHash){
 if(cap.size!==asset.bytes||cap.sourceSha256!==asset.sha256||asset.headerSha256&&headerHash!==asset.headerSha256)throw Error('Actual captured source identity differs from private asset manifest: '+asset.id);
}

async function runSide(config){
 const {side,assets,pilot,out}=config,started=Date.now(),raws=[],caps=[],sdks=[],hosts=[],views=[],stagePromises=[];
 let phase='initializing',hashProgress=null,kernel,cache,oracle,scheduler,comparisons,oracleInitial,oracleFinal,oraclePeak=null,progressTimer;
 const report={format:'lora-standalone-acceptance/1',side,status:'INCOMPLETE',coverage:pilot?'PARTIAL':'FULL',pilot:!!pilot,
  startedAt:new Date().toISOString(),runtime:config.runtime,syntheticBase:{meaning:'independent-dyadic-f32-base-v1',formula:'F32((originalFullElementCoordinate % 17 - 8) / 128)',trainingBaseIdentityClaim:false},
  persistence:{},registrations:[],cases:[],baseRestore:null,cleanup:null,limitations:['No real Bernini base values or training-base identity claim','No Diffusion graph binding, model inference, or generation quality validation']};
 const progress={completedCases:0,producedElements:0,producedBlocks:0,comparedElements:0,failedElements:0,blocks:0};
 const publish=async()=>{oraclePeak=await processMemory(oracle?.pid)??oraclePeak;const elapsed=(Date.now()-started)/1000;process.send?.({type:'progress',side,phase,elapsedSeconds:elapsed,...progress,elementsPerSecond:progress.comparedElements/Math.max(1,elapsed),hashProgress,rssBytes:process.memoryUsage().rss,oracleMemory:oraclePeak,scheduler:scheduler?.stats(),comparisonQueue:comparisons?.stats()});};
 const captureProgress=value=>{hashProgress=value;};
 const makeSDK=()=>{const sdk=createLoraStandalone({registry,baseProvider,kernel,cache});sdks.push(sdk);return sdk;};
 const modelHash=digest(Buffer.from('standalone-independent-dyadic-f32-base-v1:'+side));
 const registry=createBerniniStandaloneRegistry({modelHash,side}),baseProvider=createIndependentBaseProvider(registry),byKey=new Map(registry.targets.map(t=>[t.key,t]));
 const targets=pilot?PILOT_KEYS.map(key=>({key,slice:{startRow:0,rowCount:byKey.get(key).fullShape[0]}})):undefined;
 const operationInput=selections=>({selections,...(targets?{targets}:{})});
 let failure=null;
 try{
  await fs.mkdir(out,{mode:0o700});kernel=await createStreamingKernel({wasmBytes:await fs.readFile(WASM)});cache=createLoraProductCache({maxBytes:64*1024*1024});report.kernel=kernel.info;
  progressTimer=setInterval(()=>{void publish();},30000);progressTimer.unref();
  phase='capture-original-sources';const originals=new Map(),rawOriginals=new Map();
  for(const asset of assets){const raw=await openStandaloneNodeSource(asset.path);raws.push(raw);rawOriginals.set(asset.pairId,raw);
   const cap=await captureOwnedLoraSource(raw,{sourceId:`${asset.pairId}@${side}`,onProgress:captureProgress});caps.push(cap);const headerHash=await headerIdentity(cap);assertSource(asset,cap,headerHash);originals.set(asset.pairId,cap);
   report.registrations.push({phase:'original-capture',pairId:asset.pairId,path:asset.path,bytes:cap.size,sourceSha256:cap.sourceSha256,headerSha256:headerHash,tensorCount:Object.keys(cap.inspection.tensors).length});
  }
  hashProgress=null;phase='save-owned-package';const bootstrap=makeSDK();for(const asset of assets)await bootstrap.register({pairId:asset.pairId,source:originals.get(asset.pairId)});
  const initialPrepared=await bootstrap.prepare(await bootstrap.compose(operationInput([{pairId:'light',strength:1},{pairId:'detail',strength:1}])));
  if(typeof bootstrap.save!=='function'||typeof bootstrap.openPackage!=='function')throw Error('Ordinary standalone SDK save/openPackage integration is required');
  const packageManifest=initialPrepared.manifest,oldHandle=initialPrepared.handle.handleId;
  const wide=byKey.get(PILOT_KEYS[1]),columns=wide.fullShape[1],coordinates=[{offset:0,count:columns},{offset:(wide.fullShape[0]-1)*columns,count:columns}];
  const independentLease=initialPrepared.handle.retain('acceptance-independent-prepared');views.push(independentLease);
  const originalRows=[];for(const coordinate of coordinates)originalRows.push(await independentLease.readBlock(wide.weightId,coordinate.offset,coordinate.count));
  const savedDir=path.join(out,'owned'),writer=await createStandaloneNodeWriter(savedDir);await bootstrap.save(initialPrepared,{writer});
  await bootstrap.release(initialPrepared);await bootstrap.dispose();for(const cap of originals.values())await cap.release();for(const raw of rawOriginals.values())await raw.release();
  const survivingRow=await independentLease.readBlock(wide.weightId,coordinates[1].offset,columns);
  if(!sameBytes(survivingRow,originalRows[1]))throw Error('Independent prepared lease changed after creator/source/SDK release');
  await independentLease.release();
  report.persistence.preparedIndependentLeaseSurvivedSDKDispose=true;report.persistence.originalSourcesReleased=assets.map(a=>rawOriginals.get(a.pairId).stats());
  if(report.persistence.originalSourcesReleased.some(s=>!s.closed))throw Error('Original source handles remain live after persistence handoff');
  phase='fresh-sdk-open-saved-package';const savedManifest=JSON.parse(await fs.readFile(path.join(savedDir,'manifest.json'),'utf8')),savedInputs=new Map(),savedByPair=new Map();
  for(const descriptor of savedManifest.sources){const raw=await openStandaloneNodeSource(path.join(savedDir,descriptor.fileName));raws.push(raw);savedInputs.set(descriptor.fileName,raw);savedByPair.set(descriptor.sourceId.split('@')[0],raw);}
  const reopenedSDK=makeSDK(),reopened=await reopenedSDK.openPackage({manifest:savedManifest,sources:savedInputs});
  if(reopened.handle.handleId===oldHandle)throw Error('Saved package revived the old live handle');
  const reopenLease=reopened.handle.retain('acceptance-fresh-reopen-reader');views.push(reopenLease);
  const reopenedChecks=[];for(let i=0;i<coordinates.length;i++){const data=await reopenLease.readBlock(wide.weightId,coordinates[i].offset,columns);if(!sameBytes(data,originalRows[i]))throw Error('Fresh SDK reopen changed full-width original head/tail values');reopenedChecks.push({...coordinates[i],actualSha256:digest(Buffer.from(data.buffer)),identicalToBeforeSave:true});}
  await reopenLease.release();await reopenedSDK.release(reopened);await reopenedSDK.dispose();
  report.persistence={...report.persistence,ordinarySDKSave:true,ordinarySDKOpenPackage:true,packageHash:packageManifest.packageHash,manifestSha256:digest(await fs.readFile(path.join(savedDir,'manifest.json'))),oldHandleId:oldHandle,newHandleId:reopened.handle.handleId,freshHandle:true,readbackTarget:wide.key,readbackFullShape:wide.fullShape,fullWidthHeadTail:reopenedChecks,writer:writer.stats(),hashPhases:['original-capture','SDK-save-payload-verification','SDK-openPackage-fresh-payload-verification','saved-source-cohort-capture']};
  phase='capture-saved-cohort-sources';const savedCaps=new Map();for(const asset of assets){const cap=await captureOwnedLoraSource(savedByPair.get(asset.pairId),{sourceId:`${asset.pairId}@${side}`,onProgress:captureProgress});caps.push(cap);const headerHash=await headerIdentity(cap);assertSource(asset,cap,headerHash);savedCaps.set(asset.pairId,cap);report.registrations.push({phase:'saved-cohort-capture',pairId:asset.pairId,path:savedByPair.get(asset.pairId).path,bytes:cap.size,sourceSha256:cap.sourceSha256,headerSha256:headerHash});}hashProgress=null;cache.clear();
  const cases=definitions(side),sourceId=pairId=>assets.find(a=>a.pairId===pairId).id,baseId=side+'-base-restore';
  oracle=createOracleClient();oracleInitial=await oracle.request({op:'init',sources:assets.map(a=>({id:a.id,path:a.path,side,bytes:a.bytes,headerSha256:a.headerSha256,sourceSha256:a.sha256})),cases:[...cases.map(c=>({id:c.id,side,sources:c.selections.map(s=>({sourceId:sourceId(s.pairId),strength:s.strength})),...(pilot?{targetKeys:PILOT_KEYS}:{})})),{id:baseId,side,sources:[],targetsFrom:[sourceId('light')],...(pilot?{targetKeys:PILOT_KEYS}:{})}]});
  report.oracleInitial=oracleInitial;
  const inventory=oracleInitial.sources;if(inventory.find(s=>s.id===sourceId('light')).patchCount!==1052||inventory.find(s=>s.id===sourceId('detail')).patchCount!==400||inventory.find(s=>s.id===sourceId('light')).elements!==14286919744||inventory.find(s=>s.id===sourceId('detail')).elements!==14050918400)throw Error('Independent original patch/element counts differ from required full input domain');
  scheduler=createCohortScheduler(cases.map(c=>c.id),new Map(registry.targets.map((target,index)=>[target.key,index])));
  comparisons=createBoundedComparisonQueue({onError:error=>{scheduler.abort(error);for(const sdk of sdks)sdk.cancel();}});const blockReservations=new Map();
  phase='prepare-cohort';const cohort=[];
  for(const definition of cases){const sdk=makeSDK();for(const selection of definition.selections)await sdk.register({pairId:selection.pairId,source:savedCaps.get(selection.pairId)});
   const prepared=await sdk.prepare(await sdk.compose(operationInput(definition.selections))),state={...definition,sdk,prepared,manifest:prepared.manifest,producedElements:0,producedBlocks:0,comparedElements:0,blocks:0,failedElements:0};
   const expected=oracleInitial.cases.find(c=>c.id===definition.id),selectedElements=prepared.manifest.selectedTargets.reduce((n,t)=>n+t.ranges.reduce((sum,r)=>sum+r.rowCount,0)*(t.fullShape.length===2?t.fullShape[1]:1),0);
   if(prepared.manifest.selectedTargets.length!==expected.expectedTargets||selectedElements!==expected.expectedElements||prepared.manifest.coverage!==expected.coverage)throw Error('Product selected full-coordinate coverage differs from independent original source union: '+definition.id);
   const host=createStandaloneReferenceHost({registry,baseProvider,blockRows:128,onBeforeBlock:async coordinate=>{
    await scheduler.before(definition.id,coordinate);const token=await comparisons.acquire(coordinate.count*4);blockReservations.set(definition.id,token);
   },onBlock:coordinate=>{
    const token=blockReservations.get(definition.id);blockReservations.delete(definition.id);
    comparisons.enqueue(token,async()=>{
     const ack=await oracle.request({op:'compare',caseId:definition.id,targetKey:coordinate.key,offset:coordinate.offset,count:coordinate.count},coordinate.data);
     state.comparedElements+=coordinate.count;state.blocks++;state.failedElements+=ack.failedElements;progress.comparedElements+=coordinate.count;progress.blocks++;progress.failedElements+=ack.failedElements;
     if(ack.failedElements)throw Error('Independent numerical comparison failed for '+definition.id+' '+coordinate.key+' offset '+coordinate.offset+' ('+ack.failedElements+' values)');
    });
    state.producedElements+=coordinate.count;state.producedBlocks++;progress.producedElements+=coordinate.count;progress.producedBlocks++;scheduler.finished(definition.id);
   }});hosts.push(host);state.host=host;cohort.push(state);
  }
  phase='full-coordinate-cohort';for(const state of cohort){const promise=(async()=>{try{state.receipt=await state.sdk.stage(state.prepared,state.host);if(state.receipt.validation.checkedElements!==state.producedElements||state.receipt.validation.blockCount!==state.producedBlocks)throw Error('Normal SDK receipt does not cover every produced block');scheduler.done(state.id);progress.completedCases++;}catch(error){scheduler.abort(error);comparisons.abort(error);for(const other of cohort)other.sdk.cancel();throw error;}})();stagePromises.push(promise);}
  const terminals=await Promise.allSettled(stagePromises);const rejected=terminals.filter(t=>t.status==='rejected');if(rejected.length)throw new AggregateError(rejected.map(t=>t.reason),'Cohort stage failed');
  phase='drain-cohort-independent-comparisons';await comparisons.drain();
  for(const state of cohort)if(state.producedElements!==state.comparedElements||state.producedBlocks!==state.blocks)throw Error('Independent comparison queue did not cover every produced cohort block');
  phase='verify-consumer-lease-after-sdk-dispose';for(const state of cohort){const view=state.host.capture();views.push(view);await state.sdk.release(state.prepared);await state.sdk.dispose();
   const first=state.manifest.selectedTargets[0],count=first.fullShape.length===2?first.fullShape[1]:1,read=await view.readBlock(first.weightId,0,count);if(!(read instanceof Float32Array)||!read.every(Number.isFinite))throw Error('Active consumer lease failed after SDK disposal');
   state.leaseProof={sdkDisposed:true,consumerLeaseStillReadable:true,targetKey:first.key,offset:0,count,sha256:digest(Buffer.from(read.buffer))};await view.release();
   report.cases.push({id:state.id,selections:state.selections,coverage:state.manifest.coverage,selectedTargets:state.manifest.selectedTargets.length,producedElements:state.producedElements,producedBlocks:state.producedBlocks,comparedElements:state.comparedElements,blocks:state.blocks,failedElements:state.failedElements,packageHash:state.manifest.packageHash,receipt:state.receipt,leaseProof:state.leaseProof,sdkStats:state.sdk.stats(),hostStats:state.host.stats()});
  }
  phase='restore-base-and-compare-prior-selected-coordinates';const baseHost=cohort.find(c=>c.id===side+'-both-plus').host,baseSDK=makeSDK(),baseReceipt=await baseSDK.restoreBase({target:baseHost});await baseSDK.dispose();
  const baseView=baseHost.capture();views.push(baseView);let baseProducedElements=0,baseProducedBlocks=0,baseElements=0,baseBlocks=0,baseFailures=0;
  const prior=cohort.find(c=>c.id===side+'-light-1').manifest;
  for(const coordinate of standaloneCoordinates(prior,{blockRows:128})){const token=await comparisons.acquire(coordinate.count*4),data=await baseView.readBlock(coordinate.weightId,coordinate.offset,coordinate.count);
   comparisons.enqueue(token,async()=>{const ack=await oracle.request({op:'compare',caseId:baseId,targetKey:coordinate.key,offset:coordinate.offset,count:coordinate.count},data);baseElements+=coordinate.count;baseBlocks++;baseFailures+=ack.failedElements;progress.comparedElements+=coordinate.count;progress.blocks++;progress.failedElements+=ack.failedElements;if(ack.failedElements)throw Error('Independent base restoration comparison failed');});
   baseProducedElements+=coordinate.count;baseProducedBlocks++;progress.producedElements+=coordinate.count;progress.producedBlocks++;
  }
  phase='drain-base-independent-comparisons';await comparisons.drain();await baseView.release();report.baseRestore={receipt:baseReceipt,normalAdmissionSelectedElements:baseReceipt.validation?.checkedElements??null,producedPriorSelectedElements:baseProducedElements,producedBlocks:baseProducedBlocks,independentlyComparedPriorSelectedElements:baseElements,blocks:baseBlocks,failedElements:baseFailures,scope:'All previously selected light target full coordinates'};
  if(progress.producedElements!==progress.comparedElements||progress.producedBlocks!==progress.blocks)throw Error('Independent comparison queue did not drain every produced full-coordinate block');
  phase='independent-final-verdict';oraclePeak=await processMemory(oracle.pid)??oraclePeak;oracleFinal=await oracle.finalize();report.oracle=oracleFinal;
  if(!oracleFinal.passed||oracleFinal.coverage!==(pilot?'PARTIAL':'FULL')||progress.failedElements)throw Error('Independent all-selected numerical/coverage gate failed');
  report.status=pilot?'PILOT_PASS':'PASS';
 }catch(error){failure=error;report.error=errorRecord(error);report.status='FAIL';scheduler?.abort(error);comparisons?.abort(error);for(const sdk of sdks)sdk.cancel();
  try{await comparisons?.drain();}catch(comparisonError){report.comparisonError=errorRecord(comparisonError);}
  if(oracle&&!oracleFinal)try{report.oracleIncomplete=await oracle.request({op:'summary'});}catch(summaryError){report.oracleSummaryError=errorRecord(summaryError);}
 }finally{
  clearInterval(progressTimer);phase='cleanup';const errors=[];await Promise.allSettled(stagePromises);report.executionResourceStats={kernel:kernel?.stats(),cache:cache?.stats(),comparisonQueue:comparisons?.stats()};
  for(const view of views)try{await view.release();}catch(error){errors.push(error);}
  for(const host of hosts)try{await host.dispose();}catch(error){errors.push(error);}
  for(const sdk of sdks)try{await sdk.dispose();}catch(error){errors.push(error);}
  for(const cap of caps)try{await cap.release();}catch(error){errors.push(error);}
  for(const raw of raws)try{await raw.release();}catch(error){errors.push(error);}
  try{await oracle?.stop();}catch(error){errors.push(error);}cache?.clear();kernel?.dispose();
  const sdkStats=sdks.map(s=>s.stats()),hostStats=hosts.map(h=>h.stats()),sourceStats=raws.map(r=>r.stats()),kernelStats=kernel?.stats();
  const queueStats=comparisons?.stats(),queueClean=!queueStats||queueStats.retainedFrames===0&&queueStats.retainedBytes===0&&queueStats.comparisonPromises===0&&queueStats.waitingProducers===0;
  const clean=sdkStats.every(s=>s.disposed&&!s.busy&&s.registeredSources===0&&s.preparedPackages===0&&!s.recoveryRequired)&&hostStats.every(s=>s.disposed&&s.candidates===0&&s.readLeases===0&&s.inFlight===0&&!s.active)&&sourceStats.every(s=>s.closed&&s.references===0&&s.inFlight===0)&&(!kernelStats||kernelStats.disposed&&kernelStats.leaseCount===0)&&queueClean&&errors.length===0;
  report.cleanup={passed:clean,sdkStats,hostStats,sourceStats,kernelStats,cache:cache?.stats(),comparisonQueue:queueStats,errors:errors.map(errorRecord)};
  if(!clean){report.status='FAIL';failure??=Error('Acceptance resource cleanup incomplete');}
  report.elapsedSeconds=(Date.now()-started)/1000;report.finishedAt=new Date().toISOString();report.progress=progress;report.scheduler=scheduler?.stats();report.resources={node:process.memoryUsage(),nodeResourceUsage:process.resourceUsage(),oraclePeak,oracleProcess:oracle?.stats()};
  await reportFile(path.join(out,failure?'incomplete.json':'report.json'),report);await publish();
 }
 return report;
}

async function runtimeProof({pilot}){
 const seen=new Set(),records=[];
 async function visit(filename){filename=path.resolve(filename);if(seen.has(filename))return;seen.add(filename);const bytes=await fs.readFile(filename),relative=path.relative(ROOT,filename);let headHash=null;
  try{headHash=digest(execFileSync('git',['show',`HEAD:${relative}`],{cwd:ROOT,stdio:['ignore','pipe','ignore'],maxBuffer:16*1024*1024}));}catch{}
  const record={path:relative,absolutePath:filename,bytes:bytes.length,sha256:digest(bytes),headSha256:headHash,matchesHEAD:headHash===digest(bytes)};records.push(record);
  if(filename.endsWith('.mjs')){const source=bytes.toString('utf8'),matches=[...source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)];for(const match of matches)if(match[1].startsWith('.'))await visit(path.resolve(path.dirname(filename),match[1]));}
 }
 await visit(fileURLToPath(import.meta.url));await visit(ORACLE);await visit(WASM);
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),dirty=records.filter(r=>!r.matchesHEAD);
 if(!pilot&&dirty.length)throw Error('FULL acceptance requires runtime source closure committed at HEAD: '+dirty.map(r=>r.path).join(', '));
 return {gitHEAD:head,gitStatus:execFileSync('git',['status','--short'],{cwd:ROOT,encoding:'utf8'}),mode:pilot?'PILOT dirty sources permitted and hashed':'FULL all runtime sources match HEAD',allRuntimeSourcesMatchHEAD:dirty.length===0,closure:records.sort((a,b)=>a.path.localeCompare(b.path))};
}

async function main(argv){
 if(argv[0]==='--worker-config'){const config=JSON.parse(await fs.readFile(argv[1],'utf8'));const result=await runSide(config);process.send?.({type:'result',side:config.side,result});return result.status==='PASS'||result.status==='PILOT_PASS'?0:1;}
 const args={};for(let i=0;i<argv.length;i+=2){if(!argv[i]?.startsWith('--')||argv[i+1]===undefined)throw Error('Expected --name value CLI arguments');args[argv[i].slice(2)]=argv[i+1];}
 if(Object.keys(args).some(k=>!['assets','cases','out','side','pilot-targets'].includes(k))||!args.assets||!args.out||args.cases!=='all-targets-and-composition'||args.side&&!['HIGH','LOW'].includes(args.side)||args['pilot-targets']&&args['pilot-targets']!=='2')throw Error('Usage: node tools/lora/standalone-acceptance.mjs --assets PRIVATE.json --cases all-targets-and-composition --out FRESH_DIR [--side HIGH|LOW] [--pilot-targets 2]');
 const pilot=args['pilot-targets']==='2',out=path.resolve(args.out),assetPath=path.resolve(args.assets),rawManifest=JSON.parse(await fs.readFile(assetPath,'utf8')),input=Array.isArray(rawManifest)?rawManifest:rawManifest.sources;
 if(!Array.isArray(input))throw Error('Private assets manifest must be an array or {sources:[]}');
 const assets=input.map(a=>({...a,side:a.side?.toUpperCase(),sha256:a.sha256??a.sourceSha256,id:a.id??a.pairId+'-'+a.side?.toUpperCase(),path:path.resolve(path.dirname(assetPath),a.path)}));
 const sides=args.side?[args.side]:['HIGH','LOW'];for(const side of sides){const selected=assets.filter(a=>a.side===side);if(selected.length!==2||new Set(selected.map(a=>a.pairId)).size!==2||selected.some(a=>!['light','detail'].includes(a.pairId)||!Number.isSafeInteger(a.bytes)||a.bytes<8||!/^([a-f0-9]{64})$/.test(a.sha256)||!/^([a-f0-9]{64})$/.test(a.headerSha256)))throw Error('Each selected side requires light/detail private paths, bytes, SHA-256, and header SHA-256');}
 const runtime=await runtimeProof({pilot});await fs.mkdir(out,{mode:0o700});const started=Date.now();await reportFile(path.join(out,'run-config.json'),{assetsManifest:assetPath,sides,pilot,startedAt:new Date().toISOString(),runtime});
 const children=[],results=[];let interrupted=false;const interrupt=()=>{interrupted=true;for(const child of children)child.kill('SIGTERM');};process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
 try{const workers=sides.map(async side=>{const config={side,pilot,out:path.join(out,side),assets:assets.filter(a=>a.side===side),runtime},configPath=path.join(out,side+'-worker-config.json');await reportFile(configPath,config);
   const child=fork(fileURLToPath(import.meta.url),['--worker-config',configPath],{cwd:ROOT,stdio:['ignore','inherit','inherit','ipc'],env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});children.push(child);let result;
   child.on('message',message=>{if(message.type==='progress')console.log(JSON.stringify(message));if(message.type==='result')result=message.result;});const [code,signal]=await once(child,'exit');
   if(!result)result={side,status:'INCOMPLETE',error:{message:'Side worker exited without final report',code,signal}};results.push(result);return {side,code,signal,status:result.status};
  });const workersResult=await Promise.all(workers),passed=!interrupted&&results.length===sides.length&&results.every(r=>r.status===(pilot?'PILOT_PASS':'PASS'));
  const final={format:'lora-standalone-acceptance-run/1',status:passed?(pilot?'PILOT_PASS':'PASS'):'FAIL',coverage:pilot?'PARTIAL':'FULL',pilot,elapsedSeconds:(Date.now()-started)/1000,runtime,workers:workersResult,sides:results};await reportFile(path.join(out,passed?'report.json':'incomplete.json'),final);console.log(JSON.stringify({status:final.status,coverage:final.coverage,report:path.join(out,passed?'report.json':'incomplete.json'),elapsedSeconds:final.elapsedSeconds}));return passed?0:1;
 }finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);}
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){main(process.argv.slice(2)).then(code=>{process.exitCode=code;}).catch(error=>{console.error(JSON.stringify({status:'FAIL',error:errorRecord(error)}));process.exitCode=1;});}

// Browser acceptance fixture only: a tiny controller domain, not the originals
// or all 2,904 logical patches. Expected values never enter the normal API.
import {createLoraStandalone} from '../../docs/shared/inference/lora/standalone-sdk.mjs';
import {createStreamingKernel} from '../../docs/shared/inference/lora/kernel/streaming/host.mjs';
import {STANDALONE_CONTRACT_VERSION as VERSION} from '../../docs/shared/inference/lora/standalone-registry.mjs';
import {createIndependentBaseProvider,createStandaloneReferenceHost} from './standalone-host.mjs';

const assert=(value,message)=>{if(!value)throw Error(message);};
const rejected=async(fn,pattern,label)=>{let cause;try{await fn();}catch(e){cause=e;}assert(cause,label+' did not reject');assert(pattern.test(String(cause?.message??cause)),label+': '+String(cause));return {name:cause.name,code:cause.code??null,message:cause.message};};
const target=(key,fullShape)=>({key,weightId:key,fullShape,dtype:'F32',layout:'row-major',parameterRole:key.endsWith('.bias')?'bias':'weight',logicalBinding:{kind:key.endsWith('.bias')?'logical-bias':'logical-weight',name:key}});
const registry={contractVersion:VERSION,modelHash:'a'.repeat(64),registryVersion:'browser-tiny-controller/1',mappingVersion:'explicit-browser-fixture/1',side:'HIGH',loaderPolicyId:'comfy-lora-b5a4321-linear-diff-v1',targets:[target('layer.weight',[3,2]),target('layer.bias',[3])]};
const BASE={weight:[-.0625,-.0546875,-.046875,-.0390625,-.03125,-.0234375],bias:[-.0625,-.0546875,-.046875]};
const LIGHT_PLUS={weight:[2.9375,5.9453125,3.953125,7.9609375,4.96875,9.9765625],bias:[.4375,.9453125,1.453125]};
const LIGHT_MINUS={weight:[-3.0625,-6.0546875,-4.046875,-8.0390625,-5.03125,-10.0234375],bias:[-.5625,-1.0546875,-1.546875]};
const DETAIL_PLUS={weight:[-2.0625,1.9453125,-3.046875,2.9609375,-4.03125,3.9765625],bias:[-.3125,.4453125,-.796875]};
const DETAIL_MINUS={weight:[1.9375,-2.0546875,2.953125,-3.0390625,3.96875,-4.0234375],bias:[.1875,-.5546875,.703125]};
const BOTH_PLUS={weight:[.9375,7.9453125,.953125,10.9609375,.96875,13.9765625],bias:[.1875,1.4453125,.703125]};
const BOTH_MINUS={weight:[-1.0625,-8.0546875,-1.046875,-11.0390625,-1.03125,-14.0234375],bias:[-.3125,-1.5546875,-.796875]};
const selection=(pairId,strength)=>({pairId,strength});
const both=()=>[selection('detail',1),selection('light',1)];

function safetensorsFile(name,tensors){
 let at=0;const header={},parts=[];
 for(const [key,[shape,values]]of Object.entries(tensors)){
  const bytes=new Uint8Array(values.length*4),view=new DataView(bytes.buffer);values.forEach((value,i)=>view.setFloat32(i*4,value,true));
  header[key]={dtype:'F32',shape,data_offsets:[at,at+bytes.length]};at+=bytes.length;parts.push(bytes);
 }
 const h=new TextEncoder().encode(JSON.stringify(header)),prefix=new Uint8Array(8);new DataView(prefix.buffer).setBigUint64(0,BigInt(h.length),true);
 return new File([prefix,h,...parts],name,{type:'application/octet-stream',lastModified:0});
}
function files(){return {
 light:safetensorsFile('light-fixture.safetensors',{'layer.lora_down.weight':[[1,2],[1,2]],'layer.lora_up.weight':[[3,1],[3,4,5]],'layer.diff_b':[[3],[.5,1,1.5]]}),
 detail:safetensorsFile('detail-fixture.safetensors',{'layer.lora_A.weight':[[1,2],[-1,1]],'layer.lora_B.weight':[[3,1],[2,3,4]],'layer.diff_b':[[3],[-.25,.5,-.75]]})
};}
function countedBase(){
 const provider=createIndependentBaseProvider(registry);let disposed=false,inFlight=0,reads=0;
 const live=()=>assert(!disposed,'Fixture base provider disposed');
 return Object.freeze({describe(){live();return provider.describe();},async readBlock(...args){live();inFlight++;reads++;try{return await provider.readBlock(...args);}finally{inFlight--; }},stats:()=>({disposed,inFlight,reads,retainedBytes:0}),dispose(){assert(inFlight===0,'Base reads still running');disposed=true;}});
}
function sameValues(actual,expected,label){assert(actual instanceof Float32Array,label+' is not F32');assert(actual.length===expected.length,label+' length');for(let i=0;i<actual.length;i++)assert(actual[i]===expected[i],label+' at '+i+': '+actual[i]+' != '+expected[i]);}
async function checkActive(host,expected,label){
 const view=host.capture();try{const weight=await view.readBlock('layer.weight',0,6),bias=await view.readBlock('layer.bias',0,3);sameValues(weight,expected.weight,label+' weight');sameValues(bias,expected.bias,label+' bias');return {epoch:view.epoch,packageHash:view.packageHash,weight:[...weight],bias:[...bias]};}finally{await view.release();}
}
function normalReceipt(receipt,label){
 assert(receipt.state==='CONSUMER_APPLIED'&&receipt.validationMode==='normal',label+' receipt mode/state');
 assert(receipt.validation?.numericalComparison===false&&receipt.validation?.modelInference===false,label+' normal receipt misstates numerical/inference validation');
 for(const key of ['expected','gate','gateId','referenceId','tolerance'])assert(!Object.hasOwn(receipt,key)&&!Object.hasOwn(receipt.validation,key),label+' diagnostic argument '+key);
 assert(receipt.generationReady===false,label+' claims generation readiness');
}
function terminal(sdk,host,kernel,base,pkg){
 const result={sdk:sdk.stats(),consumer:host.stats(),kernel:kernel.stats(),base:base.stats(),package:pkg?.stats()??null};
 assert(result.sdk.disposed&&result.sdk.preparedPackages===0&&result.sdk.registeredSources===0&&!result.sdk.busy&&!result.sdk.recoveryRequired,'SDK resources retained');
 assert(result.consumer.disposed&&!result.consumer.active&&result.consumer.candidates===0&&result.consumer.readLeases===0&&result.consumer.inFlight===0,'Consumer resources retained');
 assert(result.kernel.disposed&&result.kernel.memoryBytes===0&&result.kernel.leaseCount===0&&result.kernel.residentDownBytes===0,'Kernel resources retained');
 assert(result.base.disposed&&result.base.inFlight===0&&result.base.retainedBytes===0,'Base resources retained');
 if(result.package)assert(result.package.references===0&&result.package.inFlight===0&&result.package.released&&result.package.cache.bytes===0,'Package resources retained');
 return result;
}

export async function runControlAndSave({directoryName}){
 assert(globalThis.isSecureContext&&typeof navigator.storage?.getDirectory==='function','OPFS requires a supported secure context');
 const started=performance.now(),base=countedBase(),kernel=await createStreamingKernel(),sdk=createLoraStandalone({registry,baseProvider:base,kernel});
 let cancelOnBlock=false,failRollback=false,creator;const normalContextKeys=new Set(),blockReads=[];
 const host=createStandaloneReferenceHost({registry,baseProvider:base,blockRows:2,onBlock(block){blockReads.push({weightId:block.weightId,offset:block.offset,count:block.count});if(cancelOnBlock){cancelOnBlock=false;sdk.cancel();}}});
 const consumer=Object.freeze({...host,prepareLoad(pkg,context){for(const key of Object.keys(context))normalContextKeys.add(key);for(const key of ['expected','gate','gateId','referenceId','tolerance'])assert(!Object.hasOwn(context,key),'Normal context contains '+key);return host.prepareLoad(pkg,context);},rollback(...args){if(failRollback)throw Error('Injected browser rollback failure');return host.rollback(...args);}});
 const report={kind:'tiny-standalone-browser-controller-domain',wholeModel:false,all2904Patches:false,registry,sourceFiles:[],cases:[],normalContextKeys:[],kernel:kernel.info};
 try{
  const input=files();for(const pairId of ['light','detail']){assert(input[pairId] instanceof File,'Actual File required');const registration=await sdk.register({pairId,file:input[pairId]});report.sourceFiles.push({pairId,name:input[pairId].name,bytes:input[pairId].size,registration});}
  assert(sdk.capabilities().independentExpectedRequired===false,'Normal API requires an oracle');
  const cases=[
   ['light-zero',[selection('light',0)],BASE],['light-positive',[selection('light',1)],LIGHT_PLUS],['light-negative',[selection('light',-1)],LIGHT_MINUS],
   ['detail-zero',[selection('detail',0)],BASE],['detail-positive',[selection('detail',1)],DETAIL_PLUS],['detail-negative',[selection('detail',-1)],DETAIL_MINUS],
   ['both-zero',[selection('detail',0),selection('light',0)],BASE],['both-positive',both(),BOTH_PLUS],['both-negative',[selection('detail',-1),selection('light',-1)],BOTH_MINUS],
   ['both-reapply',both(),BOTH_PLUS],['both-reapply-same',both(),BOTH_PLUS],['remove-detail',[selection('light',1)],LIGHT_PLUS],['both-before-remove-light',both(),BOTH_PLUS],['remove-light',[selection('detail',1)],DETAIL_PLUS]
  ];
  for(const [label,selections,expected]of cases){const receipt=await sdk.apply({selections,target:consumer});normalReceipt(receipt,label);report.cases.push({label,receipt,actual:await checkActive(host,expected,label)});}
  const restored=await sdk.restoreBase({target:consumer});normalReceipt(restored,'restore-base');report.cases.push({label:'restore-base',receipt:restored,actual:await checkActive(host,BASE,'restore-base')});
  const prior=await sdk.apply({selections:both(),target:consumer});normalReceipt(prior,'before-cancel');
  const beforeCancel=host.stats(),cancelledPlan=await sdk.compose({selections:[selection('light',-1)]}),cancelled=await sdk.prepare(cancelledPlan);
  cancelOnBlock=true;failRollback=true;
  const cancellation=await rejected(()=>sdk.stage(cancelled,consumer),/rollback|recovery/i,'cancel/rollback');
  assert(host.currentEpoch()===beforeCancel.epoch&&host.stats().activePackageHash===beforeCancel.activePackageHash,'Cancelled stream published an epoch/package');
  assert(sdk.stats().recoveryRequired,'Failed rollback was not retained for recovery');
  await rejected(()=>sdk.release(cancelled),/recovery/i,'release before recovery');
  failRollback=false;await sdk.recover(cancelled);assert(!sdk.stats().recoveryRequired,'Recovery did not terminate');
  await rejected(()=>sdk.prepare(cancelledPlan),/stale|revision/i,'cancelled plan');await sdk.release(cancelled);
  report.cancellation={error:cancellation,epochBefore:beforeCancel.epoch,epochAfter:host.currentEpoch(),oldActivePreserved:await checkActive(host,BOTH_PLUS,'cancel-preserved'),recovered:true,stalePlanRejected:true};
  const oldPlan=await sdk.compose({selections:[selection('light',1)]});await sdk.compose({selections:[]});await rejected(()=>sdk.prepare(oldPlan),/stale|revision/i,'superseded plan');
  const plan=await sdk.compose({selections:both()}),prepared=await sdk.prepare(plan);creator=prepared.handle;const savedReceipt=await sdk.stage(prepared,consumer);normalReceipt(savedReceipt,'save-active');
  const root=await navigator.storage.getDirectory(),directory=await root.getDirectoryHandle(directoryName,{create:true}),writes=[];
  const manifest=await sdk.save(prepared,{writer:{async writeSource(fileName,chunks){assert(/^source-\d+\.safetensors$/.test(fileName),'Unexpected source filename');const file=await directory.getFileHandle(fileName,{create:true}),stream=await file.createWritable();let bytes=0;try{for await(const chunk of chunks){assert(chunk instanceof Uint8Array,'Source chunk type');await stream.write(chunk);bytes+=chunk.byteLength;}await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}writes.push({fileName,bytes});},async writeManifest(value){const file=await directory.getFileHandle('package.json',{create:true}),stream=await file.createWritable();try{await stream.write(JSON.stringify(value));await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}}}});
  assert(manifest.planId===prepared.planId,'Saved origin plan changed');for(const key of ['handle','handleId','transactionId','sdkInstanceId','localRevision'])assert(!Object.hasOwn(manifest,key),'Serialized runtime capability '+key);
  report.saved={directoryName,manifestFile:'package.json',packageHash:manifest.packageHash,originPlanId:prepared.planId,originTransactionId:prepared.transactionId,originSdkInstanceId:sdk.sdkInstanceId,writes,sourceDescriptors:manifest.sources};
  await sdk.release(prepared);assert(!creator.isValid(),'Creator capability remained usable after release');await sdk.dispose();kernel.dispose();
  assert(kernel.stats().closing&&!kernel.stats().disposed&&kernel.stats().leaseCount===1,'Active consumer did not retain its kernel lease');
  report.ownerReleasedActiveRead=await checkActive(host,BOTH_PLUS,'active-after-owner-disposal');
  report.beforeFinalConsumerRelease={sdk:sdk.stats(),consumer:host.stats(),kernel:kernel.stats(),package:creator.stats()};
  await host.dispose();base.dispose();report.terminal=terminal(sdk,host,kernel,base,creator);report.normalContextKeys=[...normalContextKeys].sort();report.normalBlocksRead=blockReads.length;report.elapsedMs=performance.now()-started;report.passed=true;return report;
 }finally{failRollback=false;await sdk.dispose().catch(()=>{});await host.dispose().catch(()=>{});kernel.dispose();base.dispose();}
}

export async function runFreshReadback({directoryName,originPlanId,originTransactionId,originSdkInstanceId,packageHash}){
 const started=performance.now(),root=await navigator.storage.getDirectory(),directory=await root.getDirectoryHandle(directoryName),manifestFile=await (await directory.getFileHandle('package.json')).getFile(),manifest=JSON.parse(await manifestFile.text());
 assert(manifest.packageHash===packageHash&&manifest.planId===originPlanId,'OPFS manifest identity changed');const sources={},sourceFiles=[];
 for(const descriptor of manifest.sources){const file=await (await directory.getFileHandle(descriptor.fileName)).getFile();assert(file instanceof File&&file.name===descriptor.fileName&&file.size===descriptor.size,'OPFS raw File mismatch');sources[descriptor.fileName]=file;sourceFiles.push({name:file.name,bytes:file.size,sourceSha256:descriptor.sourceSha256});}
 const base=countedBase(),kernel=await createStreamingKernel(),sdk=createLoraStandalone({registry,baseProvider:base,kernel}),host=createStandaloneReferenceHost({registry,baseProvider:base,blockRows:2});let creator;
 try{
  assert(sdk.stats().registeredSources===0&&sdk.sdkInstanceId!==originSdkInstanceId,'Readback reused a source SDK');
  await rejected(()=>sdk.stage(manifest,host),/stale|prepared|unavailable/i,'serialized manifest as runtime handle');
  const prepared=await sdk.openPackage({manifest,sources});creator=prepared.handle;
  assert(prepared.originPlanId===originPlanId&&prepared.planId===originPlanId,'Origin metadata lost');
  assert(typeof prepared.transactionId==='string'&&prepared.transactionId!==originTransactionId,'Runtime transaction revived from persistence');
  const receipt=await sdk.stage(prepared,host);normalReceipt(receipt,'fresh-open');
  assert(receipt.sdkInstanceId===sdk.sdkInstanceId&&receipt.transactionId===prepared.transactionId,'Fresh runtime authority omitted');
  const actual=await checkActive(host,BOTH_PLUS,'fresh-opfs-readback');await sdk.release(prepared);await sdk.dispose();kernel.dispose();
  const afterOwnerDisposal=await checkActive(host,BOTH_PLUS,'fresh-active-after-owner-disposal');await host.dispose();base.dispose();
  const result={kind:'fresh-browser-page-opfs-readback',wholeModel:false,all2904Patches:false,passed:true,sourceFiles,manifestBytes:manifestFile.size,originPlanId,transactionId:prepared.transactionId,sdkInstanceId:sdk.sdkInstanceId,packageHash,receipt,actual,afterOwnerDisposal,terminal:terminal(sdk,host,kernel,base,creator),elapsedMs:performance.now()-started};
  await root.removeEntry(directoryName,{recursive:true});let remains=false;for await(const name of root.keys())if(name===directoryName)remains=true;assert(!remains,'OPFS fixture directory retained');result.opfsRemoved=true;return result;
 }finally{await sdk.dispose().catch(()=>{});await host.dispose().catch(()=>{});kernel.dispose();base.dispose();}
}

import {createDiffusionAdapter} from '/management/shared/ai-connection/adapters/diffusion.mjs';
import {createAdoptedLoraAdapter} from '/management/shared/ai-connection/adapters/adopted-lora.mjs';
import {createManagedDiagnosticPackage} from '/management/shared/ai-connection/diagnostic-package.mjs';
import {writeArtifactPackage,readArtifactPackage} from '/management/shared/ai-connection/package.mjs';
import {createDiffusionModels,PROTOCOL_VERSION,BUILD_ID} from '/diffusion/shared/diffusion-models/api/index.mjs';
import {createLoraSource} from '/diffusion/shared/diffusion-models/lora/source.mjs';
import {createDiagnosticConsumer} from '/diffusion/shared/diffusion-models/lora/diagnostic-consumer.mjs';
import {diagnosticRegistryHash} from '/diffusion/shared/diffusion-models/lora/diagnostic-identity.mjs';
import {createOrtProjectionStage} from '/diffusion/shared/diffusion-models/ort-bridge/stage.mjs';
import {createLoraV2} from '/lora/shared/inference/lora/sdk-v2.mjs';
import * as ownerExports from '/lora/shared/inference/lora/diffusion-diagnostic-adapter.mjs';
import * as codec from '/codec/shared/inference/tensor.mjs';
import {compareAll} from '/lora-tools/ai-connection/joint-browser-cases.mjs';

const assert=(ok,message)=>{if(!ok)throw Error(message);};
const bytes=v=>v instanceof ArrayBuffer?new Uint8Array(v):new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
const sha=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',v)),n=>n.toString(16).padStart(2,'0')).join('');
async function load(record,Type){const r=await fetch('/reference/'+record.file);assert(r.ok,'Independent reference absent');const b=await r.arrayBuffer();assert(b.byteLength===record.bytes&&await sha(b)===record.sha256,'Independent reference hash mismatch');return new Type(b);}
async function save(name,value){const b=bytes(value),r=await fetch('/artifact/'+name,{method:'POST',body:b});assert(r.ok,'Private evidence write failed');return {file:name,bytes:b.byteLength,sha256:await sha(b)};}
async function rejected(action,label){let caught;try{await action();}catch(e){caught=e;}assert(caught,'Expected rejection: '+label);return {rejected:true,code:caught.code??null,error:String(caught)};}

export async function runManagedLocalFileCases({positiveFile,negativeFiles,inputs,reference,sourcePins}){
 const report={status:'RUNNING',scope:'managed-local-File-control-route',fixtureScope:'synthetic-manager-control-fixture',realBase:false,newRealE1Acceptance:false,modelInference:false,generationReady:false,snapshotPublished:false,cases:[],inputClassifications:[],lifecycle:[],sourcePins};
 assert(reference.realBase===false&&reference.scope==='synthetic-manager-control-fixture','Control fixture must never be labeled a real base');
 const selection=structuredClone(inputs.positive.selection),side=selection.noise.toUpperCase();
 const baseWeight=await load(reference.baseWeight,Float32Array),baseBias=await load(reference.baseBias,Float32Array),x=await load(reference.activation,Float32Array);
 const fixtureEvidence={kind:'synthetic-manager-control-fixture',realBase:false,weightSha256:reference.baseWeight.sha256,biasSha256:reference.baseBias.sha256,learningBaseCompatibility:'not established by this test',purpose:'management File/state/ownership/save/cancel; accepted real numerical evidence is separate'};
 const dm=createDiffusionModels({sessionId:'managed-file-'+crypto.randomUUID()});let io,sdk,stage,consumer,prepared=null,envelope=null,facade,source,loaded,ownerLive=true,currentRevision=0,appliedRevision=null,seq=0,localRevision=0;
 const request=async(operationId,input)=>io.invoke({requestId:'file-route-'+(++seq),operationId,localRevision:++localRevision,input});
 const resourceBinding={ownerId:'managed-file-owner:'+crypto.randomUUID(),bindingId:'managed-file-diagnostic',resourceGeneration:crypto.randomUUID()},managerSessionId=crypto.randomUUID();
 const target=(phase,revision=currentRevision)=>({managerSessionId,managerRevision:revision,requestId:phase+':'+(++seq),resourceBinding:{...resourceBinding}});
 const current=t=>ownerLive&&t.managerSessionId===managerSessionId&&['ownerId','bindingId','resourceGeneration'].every(k=>t.resourceBinding?.[k]===resourceBinding[k])&&(t.managerRevision===currentRevision||t.managerRevision===appliedRevision);
 try{
  assert(positiveFile instanceof File&&positiveFile.name.toLowerCase().endsWith('.safetensors'),'Product input must be a locally selected safetensors File');
  io=createDiffusionAdapter({descriptor:{nativeAPI:{version:PROTOCOL_VERSION,build:BUILD_ID},operations:['loadLora','listLoras','readLoraSource','unloadLora'].map(operationId=>({operationId,implementationState:'implemented'}))},nativeClient:dm,binding:{ownerId:resourceBinding.ownerId,sessionId:managerSessionId,nativeSessionId:dm.sessionId,inputRevision:5},sourceVerified:true});
  const registryResponse=await fetch('/lora-tools/ai-connection/fixtures/diffusion-diagnostic-registry.json');assert(registryResponse.ok,'Pinned owner registry fixture unavailable');
  const registries=await registryResponse.json(),native=structuredClone(registries.registries.find(r=>r.side===side));
  for(const t of native.targets){t.transform.rowStart=0;t.source.elementOffset=0;}native.registryHash=diagnosticRegistryHash(native);
  report.expectedProfileBinding={modelHash:native.modelHash,graphHash:native.graphHash,registryHash:native.registryHash,role:'expected diagnostic profile identity; fixture bytes are synthetic'};
  const loadInput={file:positiveFile,stage:side,strength:1,baseModelSha256:native.modelHash,expectedFileSHA256:inputs.positive.expectedSha256};
  console.log('MANAGED-FILE verifying locally selected original '+positiveFile.name);
  loaded=await request('loadLora',loadInput);assert(loaded.status==='ok'&&loaded.result.applied===false&&loaded.result.fullFileSHA256===inputs.positive.expectedSha256,'Local File registration/full-hash binding failed');
  source=createLoraSource({sessionId:dm.sessionId,binding:loaded.result,inputRevision:5,request:async q=>{const r=await io.invoke({requestId:q.jobId,operationId:q.op,localRevision:++localRevision,input:q.input});return r.native.rawReply;}});
  report.localInput={fileName:positiveFile.name,byteLength:positiveFile.size,lastModified:positiveFile.lastModified,kind:'local-File',registration:loaded.result,sourceSha256:await source.hash(),registeredIsApplied:loaded.result.applied};
  sdk=await createLoraV2({sourceFactory:()=>source});
  const inspected=await sdk.inspect(selection);assert(inspected.state==='SOURCE_INSPECTED'&&inspected.sourceSha256===null,'Header-only inspection must retain native integrity status');report.localInput.inspection={state:inspected.state,tensorCount:inspected.tensorCount,integrity:inspected.integrity,sourceSha256:inspected.sourceSha256};
  const baseProvider={async readBlock(id,offset,count,context={}){context.signal?.throwIfAborted();assert(context.modelHash===native.modelHash&&context.graphHash===native.graphHash,'Fixture read identity mismatch');const data=id==='q.weight'?baseWeight:id==='q.bias'?baseBias:null;assert(data&&Number.isSafeInteger(offset)&&Number.isSafeInteger(count)&&offset>=0&&count>0&&offset+count<=data.length,'Read outside declared synthetic fixture');return data.slice(offset,offset+count);}};
  stage=await createOrtProjectionStage();consumer=createDiagnosticConsumer({registry:native,stage,baseProvider});
  const pins=Object.fromEntries(['sdk','adapter','kernel','diffusion'].map(key=>[key,sourcePins[key]]));
  facade=createAdoptedLoraAdapter({ownerExports,sdk,consumer,baseProvider,sourcePins:pins,resourceBinding,isOwnerCurrent:current});
  const diagnostic={targets:[{key:'diffusion_model.blocks.0.self_attn.q.weight',slice:{startRow:0,rowCount:16}},...(reference.hasBias?[{key:'diffusion_model.blocks.0.self_attn.q.bias',slice:{startRow:0,rowCount:16}}]:[])]};
  const plan=async strength=>{currentRevision++;return facade.plan({selection,strength,diagnostic},{target:target('plan')});};
  const cleanup=async()=>{if(!prepared)return;await facade.recover(prepared,{target:target('recover')});if(envelope)await facade.finalize(prepared,envelope,{target:target('finalize-cleanup')});await facade.release(prepared,{target:target('release-cleanup')});prepared=null;envelope=null;};
  const apply=async(ref,label)=>{
   const p=await plan(ref.strength),weight=new Float32Array(81920),bias=new Float32Array(baseBias);const writes=[];
   try{
    prepared=await facade.prepare(p,{target:target('prepare'),onBlock:block=>{(block.weightId==='q.weight'?weight:bias).set(block.data,block.offset);writes.push({weightId:block.weightId,offset:block.offset,count:block.count,sha256:block.sha256,fullShape:block.fullShape,slice:block.slice,binding:block.binding});}});
    const wc=compareAll(weight,await load(ref.weight,Float64Array),reference.gates.weight),bc=compareAll(bias,await load(ref.bias,Float32Array),reference.gates.bias);assert(wc.passed&&bc.passed,'Full selected control weight/bias mismatch');
    envelope=await facade.stage(prepared,{x,expected:new Float32Array(ref.expectedOutput),tolerance:reference.gates.projection},{target:target('stage'),isCurrent:current});appliedRevision=currentRevision;
    const originalEnvelope=envelope;await facade.finalize(prepared,envelope,{target:target('finalize')});await facade.release(prepared,{target:target('release')});prepared=null;envelope=null;
    const result=await facade.run({x},{target:target('run')}),oc=compareAll(result.output,new Float32Array(ref.expectedOutput),reference.gates.projection);assert(oc.passed&&result.modelInference===false&&originalEnvelope.receipt.generationReady===false,'Control output/state mismatch');
    const savedEnvelope=structuredClone(originalEnvelope);savedEnvelope.management.outputBinding={sha256:await sha(result.output),byteLength:64,meaning:'works:diagnostic-q-projection:v1',packageHash:result.packageHash,epoch:result.epoch};
    const record={label,strength:ref.strength,managerRevision:currentRevision,weightComparison:wc,biasComparison:bc,outputComparison:oc,writes,actualOutput:[...result.output],expectedOutput:ref.expectedOutput,application:originalEnvelope,outputHash:savedEnvelope.management.outputBinding.sha256,fixtureEvidence,preparedReleasedBeforeRun:true,candidateHistoryReleasedBeforeRun:true,weightArtifact:await save(label+'-weight.f32',weight),biasArtifact:await save(label+'-bias.f32',bias)};
    report.cases.push(record);return {record,result,savedEnvelope};
   }finally{await cleanup();}
  };
  let saved;
  for(const ref of reference.cases)saved=await apply(ref,ref.id);
  const positive=reference.cases.find(ref=>ref.strength===1),again=await apply(positive,'local-reapply');
  assert(again.record.weightArtifact.sha256===report.cases.find(c=>c.strength===1).weightArtifact.sha256,'Reapplication double-added weights');
  const seed=await createManagedDiagnosticPackage({output:again.result.output,applicationEnvelope:again.savedEnvelope,inputIdentity:{inputId:'selected-local-safetensors',fileName:positiveFile.name,byteLength:positiveFile.size,sha256:report.localInput.sourceSha256},baseEvidence:fixtureEvidence,codec:{codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef:sourcePins.codec,encode:codec.encodeTensor,decode:codec.decodeTensor}});
  const prefix='/package/local-file-diagnostic/';
  const writer={registry:seed.registry,async write(path,data){const r=await fetch(prefix+path,{method:'POST',body:data});assert(r.ok,'E4 filesystem write failed');}};
  const reader={async read(path){const r=await fetch(prefix+path);return r.status===404?null:r.ok?new Uint8Array(await r.arrayBuffer()):Promise.reject(Error('E4 filesystem read failed'));}};
  const packageReceipt=await writeArtifactPackage(seed.manifest,seed.assets,writer),restored=await readArtifactPackage(reader,seed.registry);assert(restored.status==='complete'&&await sha(restored.artifacts[0].native.data)===again.record.outputHash,'Actual saved package/output readback differs');
  const tampered=await rejected(()=>readArtifactPackage({read:async path=>{const b=await reader.read(path);if(b&&path.endsWith('.wktensor'))b[b.length-1]^=1;return b;}},seed.registry),'tampered native package');
  const missing=await rejected(()=>readArtifactPackage({read:path=>path==='evidence.json'?null:reader.read(path)},seed.registry),'missing required applied evidence');
  assert(tampered.code==='ASSET_HASH_MISMATCH'&&missing.code==='REQUIRED_ASSET_MISSING','Save negatives must fail for the intended integrity reason');
  report.savedPackage={receipt:packageReceipt,status:restored.status,outputSha256:again.record.outputHash,applicationPreserved:restored.artifacts[0].evidence??null,originalFileEmbedded:false,reselectRequired:true,tampered,missing,generationReady:false,snapshotPublished:false};
  const before=await facade.run({x},{target:target('before-cancel')}),priorRevision=appliedRevision,cp=await plan(1);let blocks=0;
  const cancelled=await rejected(()=>facade.prepare(cp,{target:target('cancel-prepare'),onBlock:()=>{blocks++;sdk.cancel();}}),'bounded SDK cancel');assert(cancelled.code==='CANCELLED'||cancelled.code==='STALE_PLAN','Prepare must terminate for the explicit cancellation');
  report.lifecycle.push({kind:'cancel-after-Hike-before-stage',...cancelled,blocks});
  await facade.recover(undefined,{target:target('recover-cancel')});const after=await facade.run({x},{target:target('observe-prior',priorRevision)});assert(blocks===1&&await sha(before.output)===await sha(after.output),'Cancel changed active independent copy');
  report.lifecycle.push({kind:'prior-cohort-observation-after-cancel',priorManagerRevision:priorRevision,failedSelectionManagerRevision:currentRevision,failedSelectionPublished:false,unchanged:true});
  saved=await apply(positive,'local-cancel-recovery');
  for(let index=0;index<negativeFiles.length;index++){
   const file=negativeFiles[index],r=await request('loadLora',{file,stage:side,strength:1,baseModelSha256:native.modelHash});assert(r.status==='error'&&r.error?.nativeCode==='UNSUPPORTED_LORA','Unsupported reference File must fail its actual dtype/target handler, not a transport or stale-state error');
   report.inputClassifications.push({sourceNo:inputs.negatives[index].sourceNo,fileName:file.name,byteLength:file.size,classification:'UNSUPPORTED_BY_SELECTED_PROFILE',error:r.error,graphCompatibility:'not inferred from filename',nativeBindingUnaffected:await source.hash()===report.localInput.sourceSha256});
  }
  const url=await request('loadLora',{file:'https://drive.google.com/file/d/development-reference/view',stage:side,strength:1,baseModelSha256:native.modelHash});assert(url.status==='error','Drive URL must not become a product File input');report.remoteURLInput={rejected:true,error:url.error,usedAsProductSource:false};
  const unload=await request('unloadLora',{bindingId:loaded.result.bindingId,stage:side});assert(unload.status==='ok','Exact local File release failed');
  const oldSource=await rejected(()=>source.hash(),'old source binding after unload');assert(oldSource.code==='SOURCE_BINDING_UNAVAILABLE','Old source must fail because its exact binding was released');report.lifecycle.push({kind:'source-after-unload',...oldSource});
  const retained=await facade.run({x},{target:target('copy-after-source-unload')});assert(await sha(retained.output)===saved.record.outputHash,'Active consumer borrowed disposed source/package bytes');
  report.ownership={mode:'independent-copy',copySurvivesPreparedHistoryAndSourceUnload:true,nativeLease:'N/A: independent-copy consumer'};
  report.nativeBinding=await facade.describeBinding();await io.dispose();io=null;await sdk.dispose();sdk=null;await consumer.dispose();consumer=null;await stage.dispose();stage=null;await dm.dispose();
  report.cleanup={awaitedOperationsTerminal:true,sdkDisposed:true,consumerDisposed:true,ortSessionDisposed:true,nativeFileModuleDisposed:true,processPeakMeasured:false};report.status='PASS_MANAGED_LOCAL_FILE_ROUTE';return report;
 }catch(error){report.status='FAIL';report.error=String(error.stack??error);return report;}
 finally{ownerLive=false;if(prepared)try{await facade?.recover(prepared,{target:target('final-recover')});await facade?.release(prepared,{target:target('final-release')});}catch(error){report.cleanupError=String(error);}await sdk?.dispose();await consumer?.dispose();await stage?.dispose();await io?.dispose();await dm.dispose();}
}

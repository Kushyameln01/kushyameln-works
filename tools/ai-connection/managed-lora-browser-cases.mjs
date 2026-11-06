// Genuine local File trial through the management adoption facade. Numerical
// interpretation and gates are the accepted owner's independent oracle/compare.
import {compareAll} from '/lora-tools/ai-connection/joint-browser-cases.mjs';
import {createAdoptedLoraAdapter} from '/management/shared/ai-connection/adapters/adopted-lora.mjs';
import * as ownerExports from '/lora/shared/inference/lora/diffusion-diagnostic-adapter.mjs';
import {createLoraV2} from '/lora/shared/inference/lora/sdk-v2.mjs';
import {sha256Blob} from '/lora/shared/vr180/sha256.mjs';
import {createBerniniDiagnosticBase} from '/diffusion/shared/diffusion-models/lora/diagnostic-base.mjs';
import {createDiagnosticConsumer} from '/diffusion/shared/diffusion-models/lora/diagnostic-consumer.mjs';
import {createOrtProjectionStage} from '/diffusion/shared/diffusion-models/ort-bridge/stage.mjs';

const assert=(condition,message)=>{if(!condition)throw Error(message);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const binary=v=>v instanceof ArrayBuffer?new Uint8Array(v):new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
async function save(name,value){const bytes=binary(value),response=await fetch('/artifact/'+encodeURIComponent(name),{method:'POST',body:bytes});assert(response.ok,'Private evidence write failed');return {file:name,bytes:bytes.byteLength,sha256:await sha(bytes)};}
async function load(record,Type){const response=await fetch('/reference/'+record.file);assert(response.ok,'Missing independent reference');const bytes=await response.arrayBuffer();assert(bytes.byteLength===record.bytes&&await sha(bytes)===record.sha256,'Independent reference hash/bytes mismatch');return new Type(bytes);}
async function rejects(action,label){let caught;try{await action();}catch(error){caught=error;}assert(caught,'Expected rejection: '+label);return {rejected:true,code:caught.code??null,error:String(caught)};}

export async function runManagedLoraCases({baseFile,loraFiles,reference,sourcePins}){
 const report={status:'RUNNING',side:reference.side,coverage:'PARTIAL',completeAdapter:false,generationReady:false,snapshotPublished:false,modelInference:false,managementSource:sourcePins.management,
  originalFullShape:[5120,5120],selectedRows:[0,16],allColumns:[0,5120],cases:[],lifecycle:[],weightAttempts:[],sourcePins,sessionScope:'actual ORT/Hike Q projection session; not full-model session or E5 snapshot acceptance'};
 const {sdk:sdkPin,adapter:adapterPin,kernel:kernelPin,diffusion:diffusionPin}=sourcePins,pins={sdk:sdkPin,adapter:adapterPin,kernel:kernelPin,diffusion:diffusionPin};
 const x=await load(reference.activation,Float32Array),baseExpectedWeight=await load(reference.baseWeight,Float32Array),baseExpectedBias=await load(reference.baseBias,Float32Array);
 let base,stage,consumer,ownerCurrent=true,managerRevision=0,sequence=0;
 try{
  console.log('MANAGED '+reference.side+' creating actual File base / ORT / Hike');
  base=await createBerniniDiagnosticBase({file:baseFile,side:reference.side,rowStart:0});const native=base.describe();
  const nativeIdentity={modelHash:native.modelHash,graphHash:native.graphHash,registryHash:native.registryHash,side:native.side,scope:'PARTIAL'};
  const actualBaseWeight=await base.baseProvider.readBlock('q.weight',0,81920,nativeIdentity),actualBaseBias=await base.baseProvider.readBlock('q.bias',0,16,nativeIdentity);
  report.baseDecode={weight:compareAll(actualBaseWeight,baseExpectedWeight,reference.gates.baseDecode),bias:compareAll(actualBaseBias,baseExpectedBias,reference.gates.baseDecode),weightBytesEqual:await sha(actualBaseWeight)===reference.baseWeight.sha256,biasBytesEqual:await sha(actualBaseBias)===reference.baseBias.sha256,
   weightArtifact:await save(reference.side+'-managed-base-weight.f32',actualBaseWeight),biasArtifact:await save(reference.side+'-managed-base-bias.f32',actualBaseBias),nativeRegistry:native};
  assert(report.baseDecode.weight.passed&&report.baseDecode.bias.passed&&report.baseDecode.weightBytesEqual&&report.baseDecode.biasBytesEqual,'Actual base decode differs from independent original-byte oracle');
  stage=await createOrtProjectionStage();consumer=createDiagnosticConsumer({registry:native,stage,baseProvider:base.baseProvider});
  const managerSessionId=crypto.randomUUID();
  for(const pair of ['light','detail']){
   const refs=reference.cases.filter(ref=>ref.pairId===pair),first=refs[0],file=loraFiles.find(value=>value.name===first?.retainedOriginalIdentity.fileName);assert(file,'Missing actual '+pair+' original');
   let fullHash=null,hashPromise=null;const source={size:file.size,
    async read(offset,length,{signal}={}){signal?.throwIfAborted();assert(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&length<=16*1024*1024&&offset+length<=file.size,'Original source range invalid');const bytes=await file.slice(offset,offset+length).arrayBuffer();signal?.throwIfAborted();return new Uint8Array(bytes);},
    async hash({signal}={}){signal?.throwIfAborted();if(fullHash===null){hashPromise??=sha256Blob(file,{signal});fullHash=await hashPromise;assert(fullHash===first.retainedOriginalIdentity.sha256,'Genuine LoRA full-file digest mismatch');console.log('MANAGED '+pair+' '+reference.side+' whole original hash verified');}signal?.throwIfAborted();return fullHash;}};
   const sdk=await createLoraV2({sourceFactory:()=>source});
   const resourceBinding={ownerId:`managed:${managerSessionId}:${pair}:${reference.side}`,bindingId:`projection:${pair}:${reference.side}`,resourceGeneration:crypto.randomUUID()};let selectedRevision=managerRevision,activeRevision=null,pairCurrent=true;
   const ownsTarget=t=>ownerCurrent&&pairCurrent&&t.managerSessionId===managerSessionId&&['ownerId','bindingId','resourceGeneration'].every(key=>t.resourceBinding?.[key]===resourceBinding[key])&&(t.managerRevision===selectedRevision||t.managerRevision===activeRevision);
   const adapter=createAdoptedLoraAdapter({ownerExports,sdk,consumer,baseProvider:base.baseProvider,sourcePins:pins,resourceBinding,isOwnerCurrent:ownsTarget});
   const target=(phase,revision=managerRevision)=>({managerSessionId,managerRevision:revision,requestId:`${pair}:${reference.side}:${++sequence}:${phase}`,resourceBinding:{...resourceBinding}});
   const selection={pairId:pair,noise:reference.side.toLowerCase()},diagnostic={targets:[{key:'diffusion_model.blocks.0.self_attn.q.weight',slice:{startRow:0,rowCount:16}},...(pair==='light'?[{key:'diffusion_model.blocks.0.self_attn.q.bias',slice:{startRow:0,rowCount:16}}]:[])]};
   let positiveHash,prepared=null,envelope=null;
   const makePlan=async strength=>{managerRevision++;selectedRevision=managerRevision;return adapter.plan({selection,strength,loaderPolicyId:'comfy-lora-b5a4321-linear-diff-v1',diagnostic},{target:target('plan')});};
   const cleanup=async()=>{if(!prepared)return;await adapter.recover(prepared,{target:target('recover')});if(envelope)await adapter.finalize(prepared,envelope,{target:target('finalize')});await adapter.release(prepared,{target:target('release')});prepared=null;envelope=null;};
   const apply=async(ref,label='initial')=>{
    console.log(`MANAGED ${pair} ${reference.side} strength ${ref.strength} ${label}`);const plan=await makePlan(ref.strength);
    assert(plan.sourceSha256===ref.retainedOriginalIdentity.sha256&&plan.coverage==='PARTIAL'&&plan.completeAdapter===false&&plan.buildId===kernelPin.sha256,'Actual plan source/build/scope mismatch');
    assert(plan.excludedTargets.length===ref.excludedPatchCount,'Original excluded patch coverage changed');
    const actualWeight=new Float32Array(81920),actualBias=new Float32Array(actualBaseBias),writes=[];
    try{
     prepared=await adapter.prepare(plan,{target:target('prepare'),onBlock:async block=>{
      assert(block.fullShape.join(',')===(block.weightId==='q.weight'?'5120,5120':'5120'),'Full-shape identity lost');
      if(block.weightId==='q.weight')actualWeight.set(block.data,block.offset);else if(block.weightId==='q.bias')actualBias.set(block.data,block.offset);else throw Error('Unexpected selected weight');
      writes.push({weightId:block.weightId,offset:block.offset,count:block.count,sha256:block.sha256,fullShape:block.fullShape,slice:block.slice,binding:block.binding});
     }});
     const expectedWeight=await load(ref.weight,Float64Array),expectedBias=await load(ref.bias,Float32Array),weightComparison=compareAll(actualWeight,expectedWeight,reference.gates.weight),biasComparison=compareAll(actualBias,expectedBias,reference.gates.bias);
     const prefix=`${ref.id}-managed-${label}`,weightArtifact=await save(prefix+'-weight.f32',actualWeight),biasArtifact=await save(prefix+'-bias.f32',actualBias);
     report.weightAttempts.push({id:prefix,weightComparison,biasComparison,weightArtifact,biasArtifact});assert(weightComparison.passed&&biasComparison.passed,'Management selected weight/bias comparison failed');
     envelope=await adapter.stage(prepared,{x,expected:new Float32Array(ref.expectedOutput),tolerance:reference.gates.projection},{target:target('stage'),isCurrent:ownsTarget});
     const receipt=envelope.receipt;assert(receipt.state==='CONSUMER_APPLIED'&&receipt.coverage==='PARTIAL'&&receipt.scope==='diagnostic-projection'&&receipt.generationReady===false&&receipt.snapshotPublished===false,'Diagnostic native scope/state promoted');
     assert(envelope.management.kernelSha256===kernelPin.sha256,'Management adopted kernel identity differs');
     const retainedEnvelope=structuredClone(envelope);activeRevision=managerRevision;await adapter.finalize(prepared,envelope,{target:target('finalize')});await adapter.release(prepared,{target:target('release')});prepared=null;envelope=null;
     const result=await adapter.run({x},{target:target('run')}),outputComparison=compareAll(result.output,new Float32Array(ref.expectedOutput),reference.gates.projection);assert(outputComparison.passed,'Management actual ORT/Hike projection mismatch');
     if(ref.strength===1){if(positiveHash)assert(positiveHash===weightArtifact.sha256,'Reapplication added twice to changed base');else positiveHash=weightArtifact.sha256;}
     const record={id:prefix,pairId:pair,side:reference.side,strength:ref.strength,sourceSha256:plan.sourceSha256,sdkInstanceId:sdk.sdkInstanceId,planId:plan.planId,registryHash:plan.registryHash,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision,managerRevision,
      coverage:'PARTIAL',completeAdapter:false,generationReady:false,excludedPatchCount:plan.excludedTargets.length,weightComparison,biasComparison,outputComparison,weightArtifact,biasArtifact,writes,actualOutput:[...result.output],expectedOutput:ref.expectedOutput,
      receipt:retainedEnvelope,consumerEvidence:result.evidence,preparedReleasedBeforeRun:true,candidateHistoryReleasedBeforeRun:true,binding:await adapter.describeBinding()};
     if(label==='initial'&&ref.strength===0){record.scopeArtifact=await save(`${pair}-${reference.side}-managed-scope.json`,new TextEncoder().encode(JSON.stringify({sourceSha256:plan.sourceSha256,selection,diagnostic,coverage:plan.coverage,completeAdapter:plan.completeAdapter,includedPatches:plan.includedPatches,excludedTargets:plan.excludedTargets,excludedRegions:plan.excludedRegions})));}
     report.cases.push(record);return record;
    }finally{await cleanup();}
   };
   try{
    for(const ref of refs)await apply(ref);
    const restore=await adapter.restoreBase({x,expected:new Float32Array(reference.baseExpectedOutput),tolerance:reference.gates.projection},{target:target('restore-base'),isCurrent:ownsTarget});
    const baseResult=await adapter.run({x},{target:target('run-base')}),baseComparison=compareAll(baseResult.output,new Float32Array(reference.baseExpectedOutput),reference.gates.projection);assert(baseComparison.passed,'Managed immutable-base restoration mismatch');
    report.lifecycle.push({pairId:pair,kind:'management-base-restore',receipt:restore,comparison:baseComparison,actualOutput:[...baseResult.output]});
    const nonzero=refs.find(ref=>ref.strength===1);await apply(nonzero,'reapply');
    const before=await adapter.run({x},{target:target('before-cancel')}),cancelPlan=await makePlan(1);let observed=0;
    const cancellation=await rejects(()=>adapter.prepare(cancelPlan,{target:target('cancel-prepare'),onBlock:()=>{observed++;sdk.cancel();}}),'cancel after real Hike block');
    await adapter.recover(undefined,{target:target('recover-cancel')});const after=await adapter.run({x},{target:target('observe-prior-after-cancel',activeRevision)});assert(observed===1&&await sha(before.output)===await sha(after.output),'Management cancelled preparation changed active owned feed');
    report.lifecycle.push({pairId:pair,kind:'management-cancel-after-real-Hike-block',...cancellation,observed,activeFeedUnchanged:true,observedPriorManagerRevision:activeRevision,failedSelectionManagerRevision:managerRevision,failedSelectionPublished:false});
    const failurePlan=await makePlan(1),wrong=new Float32Array(nonzero.expectedOutput);wrong[0]+=1;
    try{prepared=await adapter.prepare(failurePlan,{target:target('failure-prepare')});report.lifecycle.push({pairId:pair,kind:'management-invalid-reference-rollback',...await rejects(()=>adapter.stage(prepared,{x,expected:wrong,tolerance:reference.gates.projection},{target:target('failure-stage'),isCurrent:ownsTarget}),'native independent validation failure')});}finally{await cleanup();}
    const still=await adapter.run({x},{target:target('observe-prior-after-failure',activeRevision)});assert(await sha(still.output)===await sha(before.output),'Failed management candidate changed active feed');
    const recovery=await apply(nonzero,'cancel-recovery');report.lifecycle.push({pairId:pair,kind:'management-cancel-and-validation-recovery',passed:recovery.outputComparison.passed});
   }finally{await cleanup();pairCurrent=false;await sdk.dispose();}
  }
  report.baseProviderStats=base.stats();report.lease={mode:'independent-copy',nativeLease:'N/A: acquired consumer does not offer leases',copySurvivesPreparedAndCandidateRelease:true};
  report.status='PASS_MANAGED_DIAGNOSTIC_PARTIAL';console.log('MANAGED '+reference.side+' PASS through adopted management facade');return report;
 }catch(error){report.status='FAIL';report.error=String(error.stack??error);report.cause=String(error.cause??'');return report;}
 finally{ownerCurrent=false;await consumer?.dispose();await stage?.dispose();base?.dispose();}
}

const SHA=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export function compareAll(actual,expected,gate){
 if(!(actual instanceof Float32Array)||!(expected instanceof Float32Array||expected instanceof Float64Array)||actual.length!==expected.length||actual.length<1)throw Error('Comparison length/shape mismatch');
 if(!gate||!['absolute','relative'].every(k=>typeof gate[k]==='number'&&Number.isFinite(gate[k])&&gate[k]>=0))throw Error('Explicit finite nonnegative gate required');
 let maxAbsoluteError=0,failedCount=0;const failedIndices=[];
 for(let i=0;i<actual.length;i++){if(!Number.isFinite(actual[i])||!Number.isFinite(expected[i]))throw Error('Nonfinite comparison value');const d=Math.abs(actual[i]-expected[i]);maxAbsoluteError=Math.max(maxAbsoluteError,d);if(d>gate.absolute+gate.relative*Math.abs(expected[i])){failedCount++;if(failedIndices.length<16)failedIndices.push(i);}}
 return {passed:failedCount===0,compared:actual.length,maxAbsoluteError,failedCount,failedIndices,gate:{...gate}};
}
function assert(value,message){if(!value)throw Error(message);}
async function rejects(action,label){let error;try{await action();}catch(e){error=e;}assert(error,'Expected rejection: '+label);return {passed:true,error:String(error),code:error.code??null};}
export async function runJointCases({baseFile,loraFiles,reference}){
 const ours='/our/shared/inference/lora/',peer='/peer/shared/diffusion-models/';
 const [{createLoraV2},{createBerniniDiagnosticBase},{createDiagnosticConsumer},{createOrtProjectionStage},{createDiffusionDiagnosticAdapter},{sha256Blob},{adaptV1Registry,createV1SinkAdapter}]=await Promise.all([
  import(ours+'sdk-v2.mjs'),import(peer+'lora/diagnostic-base.mjs'),import(peer+'lora/diagnostic-consumer.mjs'),import(peer+'ort-bridge/stage.mjs'),import(ours+'diffusion-diagnostic-adapter.mjs'),import('/our/shared/vr180/sha256.mjs'),import(ours+'v1-adapter.mjs')]);
 const save=async(name,bytes)=>{const b=bytes instanceof ArrayBuffer?new Uint8Array(bytes):new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);const r=await fetch('/artifact/'+encodeURIComponent(name),{method:'POST',body:b});if(!r.ok)throw Error('Artifact write failed');return {file:name,bytes:b.byteLength,sha256:await SHA(b)};};
 const load=async(record,Type)=>{const r=await fetch('/reference/'+record.file);if(!r.ok)throw Error('Missing independent reference '+record.file);const b=await r.arrayBuffer();assert(b.byteLength===record.bytes&&await SHA(b)===record.sha256,'Independent reference bytes/hash mismatch');return new Type(b);};
 const emit=(text)=>console.log('JOINT '+text);
 const x=await load(reference.activation,Float32Array),baseExpectedWeight=await load(reference.baseWeight,Float32Array),baseExpectedBias=await load(reference.baseBias,Float32Array);
 const report={side:reference.side,status:'RUNNING',coverage:'PARTIAL',completeAdapter:false,generationReady:false,modelInference:false,cases:[],weightAttempts:[],lifecycle:[],fullOriginalShape:[5120,5120],selectedRows:[0,16],allColumns:[0,5120],precision:'FP8 scalar→Hike F32; LoRA Hike F32; ORT WASM Gemm→Hike bias; not original GPU precision equivalence'};
 let base,stage,consumer,ownerCurrent=true;
 try{
  emit(reference.side+' creating actual base/ORT/Hike');base=await createBerniniDiagnosticBase({file:baseFile,side:reference.side,rowStart:0});const native=base.describe();
  const nativeIdentity={modelHash:native.modelHash,graphHash:native.graphHash,registryHash:native.registryHash,side:native.side,scope:'PARTIAL'};
  const actualBaseWeight=await base.baseProvider.readBlock('q.weight',0,81920,nativeIdentity),actualBaseBias=await base.baseProvider.readBlock('q.bias',0,16,nativeIdentity);
  report.baseDecode={weight:compareAll(actualBaseWeight,baseExpectedWeight,reference.gates.baseDecode),bias:compareAll(actualBaseBias,baseExpectedBias,reference.gates.baseDecode),weightBytesEqual:await SHA(actualBaseWeight)===reference.baseWeight.sha256,biasBytesEqual:await SHA(actualBaseBias)===reference.baseBias.sha256,weightArtifact:await save(reference.side+'-decoded-base-weight.f32',actualBaseWeight),biasArtifact:await save(reference.side+'-decoded-base-bias.f32',actualBaseBias)};
  assert(report.baseDecode.weight.passed&&report.baseDecode.bias.passed&&report.baseDecode.weightBytesEqual&&report.baseDecode.biasBytesEqual,'Real base Hike decode differs from independent oracle');
  stage=await createOrtProjectionStage();consumer=createDiagnosticConsumer({registry:native,stage,baseProvider:base.baseProvider});const adapter=createDiffusionDiagnosticAdapter({consumer,baseProvider:base.baseProvider,isOwnerCurrent:()=>ownerCurrent});report.binding=await adapter.describeBinding();
  const baseRef={x,expected:new Float32Array(reference.baseExpectedOutput),tolerance:reference.gates.projection,isCurrent:()=>true};
  const errors=[];for(const fn of [()=>adaptV1Registry(adapter.registry,{side:native.side,executionProfileId:native.executionProfileId,loaderPolicyId:adapter.registry.loaderPolicyId}),()=>createV1SinkAdapter({begin(){},writeBlock(){},finish(){},abort(){},release(){}},{registry:adapter.registry})])errors.push(await rejects(async()=>fn(),'v1 refusal without binding/coverage relabeling'));report.v1Refusal=errors;
  for(const pair of ['light','detail']){
   const refs=reference.cases.filter(c=>c.pairId===pair),first=refs[0],file=loraFiles.find(f=>f.name===first.retainedOriginalIdentity.fileName);assert(file,'Missing actual LoRA '+pair);
   let verified=null,pendingHash=null;const source={size:file.size,read:async(offset,length,{signal}={})=>{signal?.throwIfAborted();assert(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&length<=16*1024*1024&&offset+length<=file.size,'Invalid source range');const b=await file.slice(offset,offset+length).arrayBuffer();signal?.throwIfAborted();return new Uint8Array(b);},hash:async({signal}={})=>{signal?.throwIfAborted();if(!verified){pendingHash??=sha256Blob(file,{signal});verified=await pendingHash;assert(verified===first.retainedOriginalIdentity.sha256,'Actual LoRA full hash differs from retained identity');emit(pair+' '+reference.side+' full source hash verified');}signal?.throwIfAborted();return verified;}};
   const sdk=await createLoraV2({sourceFactory:()=>source}),selection={pairId:pair,noise:native.side.toLowerCase()},diagnostic={targets:[{key:'diffusion_model.blocks.0.self_attn.q.weight',slice:{startRow:0,rowCount:16}},...(pair==='light'?[{key:'diffusion_model.blocks.0.self_attn.q.bias',slice:{startRow:0,rowCount:16}}]:[])]};
   const makePlan=strength=>sdk.plan({selection,strength,registry:adapter.registry,loaderPolicyId:adapter.registry.loaderPolicyId,diagnostic});
   let positiveHash;
   const apply=async(ref,label='initial')=>{
    emit(pair+' '+reference.side+' strength '+ref.strength+' '+label);const plan=await makePlan(ref.strength);assert(plan.coverage==='PARTIAL'&&!plan.completeAdapter&&plan.sourceSha256===ref.retainedOriginalIdentity.sha256,'Plan source/scope mismatch');assert(plan.excludedTargets.length===ref.excludedPatchCount,'Original excluded patch count changed');
    const nativeSink=adapter.createSink(plan),actualWeight=new Float32Array(81920),actualBias=new Float32Array(actualBaseBias),writes=[];
    const sink={...nativeSink,writeBlock:async b=>{if(b.weightId==='q.weight')actualWeight.set(b.data,b.offset);else if(b.weightId==='q.bias')actualBias.set(b.data,b.offset);else throw Error('Unexpected patch binding');writes.push({weightId:b.weightId,offset:b.offset,count:b.count,sha256:b.sha256,binding:b.binding});await nativeSink.writeBlock(b);}};
    let prepared;try{
     prepared=await sdk.prepare(plan,{baseProvider:adapter.baseProvider,sink});const ew=await load(ref.weight,Float64Array),eb=await load(ref.bias,Float32Array);const wc=compareAll(actualWeight,ew,reference.gates.weight),bc=compareAll(actualBias,eb,reference.gates.bias);
     const prefix=ref.id+'-'+label;const weightArtifact=await save(prefix+'-actual-weight.f32',actualWeight),biasArtifact=await save(prefix+'-actual-bias.f32',actualBias);report.weightAttempts.push({id:prefix,weightComparison:wc,biasComparison:bc,weightArtifact,biasArtifact});assert(wc.passed&&bc.passed,'Full selected weight/bias gate failed');
     const target=adapter.targetForPlan(plan,{x,expected:new Float32Array(ref.expectedOutput),tolerance:reference.gates.projection});const receipt=await sdk.stage(prepared,target);assert(receipt.state==='CONSUMER_APPLIED'&&receipt.coverage==='PARTIAL'&&receipt.generationReady===false,'Diagnostic state was promoted');
     await sdk.release(prepared);prepared=null;await adapter.finalize(plan);const result=await adapter.run({x});const oc=compareAll(result.output,new Float32Array(ref.expectedOutput),reference.gates.projection);assert(oc.passed,'Actual consumer output gate failed');
     if(ref.strength===1){if(positiveHash)assert(positiveHash===weightArtifact.sha256,'Reapplication double-added to patched weights');else positiveHash=weightArtifact.sha256;}
     const record={id:prefix,pairId:pair,side:native.side,strength:ref.strength,sourceSha256:plan.sourceSha256,planId:plan.planId,localInputRevision:plan.localInputRevision,sdkInstanceId:sdk.sdkInstanceId,coverage:plan.coverage,completeAdapter:false,excludedPatchCount:plan.excludedTargets.length,weightComparison:wc,biasComparison:bc,outputComparison:oc,weightArtifact,biasArtifact,actualOutput:[...result.output],expectedOutput:ref.expectedOutput,writes,receipt,consumerEvidence:result.evidence,preparedReleasedBeforeRun:true,candidateHistoryReleasedBeforeRun:true,passThrough:(await adapter.describeBinding()).passThrough.filter(r=>r.planId===plan.planId)};
     report.cases.push(record);
     if(label==='initial'&&ref.strength===0){const scope={sourceSha256:plan.sourceSha256,selection,coverage:'PARTIAL',completeAdapter:false,fullShape:[5120,5120],diagnostic,includedPatches:plan.includedPatches,excludedTargets:plan.excludedTargets,excludedRegions:plan.excludedRegions};record.scopeArtifact=await save(pair+'-'+native.side+'-scope.json',new TextEncoder().encode(JSON.stringify(scope)));}
     return record;
    }finally{if(prepared)await sdk.release(prepared);await adapter.finalize(plan);}
   };
   try{
    for(const ref of refs)await apply(ref);
    const restore=await adapter.restoreBase(baseRef),restored=await adapter.run({x});const restoredCheck=compareAll(restored.output,new Float32Array(reference.baseExpectedOutput),reference.gates.projection);assert(restoredCheck.passed,'Base restore did not reproduce original');report.lifecycle.push({pairId:pair,side:native.side,kind:'base-restore',receipt:restore,comparison:restoredCheck,actualOutput:[...restored.output]});
    const nonzero=refs.find(c=>c.strength===1);await apply(nonzero,'reapply');
    const beforeCancel=await adapter.run({x}),cp=await makePlan(1),cs=adapter.createSink(cp);let readCount=0;const cancelled=await rejects(()=>sdk.prepare(cp,{sink:cs,baseProvider:{readBlock:async(...a)=>{const v=await adapter.baseProvider.readBlock(...a);readCount++;sdk.cancel();return v;}}}),'cancel after actual immutable-base read');const afterCancel=await adapter.run({x});assert(readCount===1&&await SHA(beforeCancel.output)===await SHA(afterCancel.output),'Cancelled preparation changed active feed');report.lifecycle.push({pairId:pair,kind:'cancel-prepare-after-real-read',...cancelled,readCount,activeFeedUnchanged:true});
    const old=await makePlan(0);await makePlan(1);report.lifecycle.push({pairId:pair,kind:'stale-plan',...await rejects(()=>sdk.prepare(old,{sink:adapter.createSink(old),baseProvider:adapter.baseProvider}),'old plan prepare')});
    const fp=await makePlan(1),fs=adapter.createSink(fp);let fv;try{fv=await sdk.prepare(fp,{sink:fs,baseProvider:adapter.baseProvider});const wrong=new Float32Array(nonzero.expectedOutput);wrong[0]+=1;report.lifecycle.push({pairId:pair,kind:'validation-failure-rollback',...await rejects(()=>sdk.stage(fv,adapter.targetForPlan(fp,{x,expected:wrong,tolerance:reference.gates.projection})),'wrong independent expected must fail')});}finally{if(fv)await sdk.release(fv);await adapter.finalize(fp);}
    const still=await adapter.run({x});assert(await SHA(still.output)===await SHA(beforeCancel.output),'Failed candidate changed current feed');
    const ac=new AbortController(),running=adapter.run({x,signal:ac.signal});ac.abort(new Error('explicit diagnostic run cancellation'));report.lifecycle.push({pairId:pair,kind:'cooperative-consumer-cancel',...await rejects(()=>running,'consumer abort result rejection')});
    const recovery=await apply(nonzero,'cancel-recovery');report.lifecycle.push({pairId:pair,kind:'cancel-recovery',passed:recovery.outputComparison.passed,actualOutput:recovery.actualOutput});
    const beforeLate=await adapter.run({x}),latePlan=await makePlan(-1),lateSink=adapter.createSink(latePlan);let latePrepared;try{latePrepared=await sdk.prepare(latePlan,{sink:lateSink,baseProvider:adapter.baseProvider});const negative=refs.find(c=>c.strength===-1),lateTarget=adapter.targetForPlan(latePlan,{x,expected:new Float32Array(negative.expectedOutput),tolerance:reference.gates.projection});const cancellingTarget={...lateTarget,commit:async(...a)=>{const result=await lateTarget.commit(...a);sdk.cancel();return result;}};const rejected=await rejects(()=>sdk.stage(latePrepared,cancellingTarget),'cancel after native commit before SDK completion');const after=await adapter.run({x});assert(await SHA(after.output)===await SHA(beforeLate.output),'Late cancellation did not restore previous owned diagnostic feed');report.lifecycle.push({pairId:pair,kind:'cancel-after-native-commit-rollback',...rejected,priorFeedRestored:true,actualOutput:[...after.output],expectedPriorOutput:[...beforeLate.output]});}finally{if(latePrepared)await sdk.release(latePrepared);await adapter.finalize(latePlan);}
   }finally{await sdk.dispose();}
  }
  // Actual public native transaction failures, with actual decoded base values.
  for(const fault of ['missing','duplicate','checksum','binding']){const sink=consumer.createSink();try{await sink.begin(nativeIdentity);const b={weightId:'q.weight',offset:0,count:81920,shape:[16,5120],dtype:'F32',sha256:await SHA(actualBaseWeight),data:actualBaseWeight};if(fault==='checksum')b.sha256='0'.repeat(64);if(fault==='binding')b.weightId='foreign.weight';if(fault==='missing'){await sink.writeBlock(b);report.lifecycle.push({kind:fault,...await rejects(()=>sink.finish(nativeIdentity),'missing native bias block')});}else if(fault==='duplicate'){await sink.writeBlock(b);report.lifecycle.push({kind:fault,...await rejects(()=>sink.writeBlock(b),'overlapping native block')});}else report.lifecycle.push({kind:fault,...await rejects(()=>sink.writeBlock(b),fault)});}finally{await sink.abort();}}
  const nc={...nativeIdentity,isCurrent:()=>true},one=await consumer.prepareBase(nc);let two;
  try{
   const v={...nc,x,expected:new Float32Array(reference.baseExpectedOutput),tolerance:reference.gates.projection};
   assert((await consumer.validate(one,v)).valid,'First real base candidate failed');
   const firstCommit=await consumer.commit(one,nc);
   // Native candidates capture the active epoch at preparation. Prepare the
   // replacement only after the first switch; never bypass its stale guard.
   two=await consumer.prepareBase(nc);assert((await consumer.validate(two,v)).valid,'Replacement real base candidate failed');
   const newerCommit=await consumer.commit(two,nc);
   assert(firstCommit.committed&&newerCommit.committed&&newerCommit.epoch>firstCommit.epoch,'Real candidate commits did not advance epochs');
   const rollback=await consumer.rollback(one,nc),r=await consumer.run({x});
   const c=compareAll(r.output,new Float32Array(reference.baseExpectedOutput),reference.gates.projection);
   assert(!rollback.restored&&c.passed,'Old committed rollback changed newer active feed');
   report.lifecycle.push({kind:'old-committed-rollback-new-epoch',passed:true,firstCommit,newerCommit,rollback,comparison:c,actualOutput:[...r.output]});
  }finally{await consumer.releaseCandidate(one);if(two)await consumer.releaseCandidate(two);}
  report.baseProviderStats=base.stats();report.binding=await adapter.describeBinding();report.lease={mode:'independent-copy',activeLease:'N/A: actual native consumer offers independent owned copy; no lease support fabricated',copySurvivesPreparedAndCandidateRelease:true};report.status='PASS_DIAGNOSTIC_PARTIAL';emit(native.side+' PASS actual real-base/LoRA joint diagnostic');return report;
 }catch(error){report.status='FAIL';report.error=String(error.stack||error);return report;}
 finally{ownerCurrent=false;await consumer?.dispose();await stage?.dispose();base?.dispose();}
}

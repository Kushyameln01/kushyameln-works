import {createFullModelWeightSource} from './model-weights.mjs';
import {createFullModelWeightFeed} from './model-weight-feed.mjs';
import {hashMetadata} from './model-weight-bindings.mjs';
import {createP4Linear} from '../ort-bridge/post-self-attention/linear.mjs';

const W='blocks.0.cross_attn.q.weight',B='blocks.0.cross_attn.q.bias';
const check=(v,message)=>{if(!v)throw Error(message);};
function compare(actual,expected){check(actual.length===expected.length,'Diagnostic shape mismatch');let maxAbsolute=0,failed=0;for(let i=0;i<actual.length;i++){const error=Math.abs(actual[i]-expected[i]);maxAbsolute=Math.max(maxAbsolute,error);if(!Number.isFinite(error)||error>0.00001+0.0001*Math.abs(expected[i]))failed++;}check(!failed,'Independent real-base operator comparison failed');return {elements:actual.length,maxAbsolute,failed,absolute:0.00001,relative:0.0001};}

/** Development validation only. This package supplies completed F32 test
 * weights; it performs no low-rank math and is not an actual LoRA artifact. */
export async function runFullWeightFeedRealBaseCase({file,diagnostic}){
 let source,feed,linear,candidate,old,patched,refs=1;
 const began=performance.now(),p=diagnostic,finalW=new Float32Array(p.finalWeight),finalB=new Float32Array(p.finalBias),x=new Float32Array(p.x);
 try{
  source=await createFullModelWeightSource({file,side:'LOW',decoder:'lookup'});feed=await createFullModelWeightFeed({source});linear=await createP4Linear();
  const registry=feed.consumer.describe(),baseIdentity=feed.baseProvider.describe(),baseW=await feed.baseProvider.readBlock(W,0,20480,{...baseIdentity,fullShape:[5120,5120]}),baseB=await feed.baseProvider.readBlock(B,0,4,{...baseIdentity,fullShape:[5120]});
  const baseDecode={weight:compare(baseW,p.baseWeight),bias:compare(baseB,p.baseBias)};
  const body={packageVersion:'lora-owned-package/0.1-draft.1',contractVersion:'lora-standalone/1.0-draft.1',registry,registryHash:feed.describe().logicalRegistryHash,baseIdentity,side:'LOW',loaderPolicyId:registry.loaderPolicyId,compositionOrder:['light','detail'],adapters:[],sources:[],selectedTargets:[{weightId:W,key:'diffusion_model.'+W,fullShape:[5120,5120],ranges:[{startRow:0,rowCount:4}]},{weightId:B,key:'diffusion_model.'+B,fullShape:[5120],ranges:[{startRow:0,rowCount:4}]}],coverage:'PARTIAL',scope:'diagnostic-projection',completeAdapter:false,generationReady:false,buildId:'1'.repeat(64),planId:'2'.repeat(64)},manifest={...body,packageHash:await hashMetadata(body)};
  function capability(){let released=false;return Object.freeze({describe(){check(!released,'Test package capability released');return structuredClone(manifest);},isValid:()=>!released&&refs>0,retain(){check(!released,'Cannot retain released package');refs++;return capability();},async readBlock(id,offset,count,{signal}={}){check(!released,'Package released');signal?.throwIfAborted();const values=id===W?finalW:id===B?finalB:null;check(values&&offset>=0&&offset+count<=values.length,'Completed test package range');return values.slice(offset,offset+count);},async release(){if(!released){released=true;refs--;}}});}
  const pkg=capability(),ctx={contractVersion:manifest.contractVersion,sdkInstanceId:'bounded-real-base',localRevision:1,transactionId:'completed-f32-test',side:'LOW',planId:manifest.planId,packageHash:manifest.packageHash,registryHash:manifest.registryHash,coverage:manifest.coverage,scope:manifest.scope,validationMode:'normal',isCurrent:()=>true};
  old=feed.capture();candidate=await feed.consumer.prepareLoad(pkg,ctx);const admission=await feed.consumer.validate(candidate,ctx),commit=await feed.consumer.commit(candidate,ctx);await feed.consumer.releaseCandidate(candidate);candidate=null;await pkg.release();patched=feed.capture();
  const effectiveW=await feed.source.readRows(W,0,4),effectiveB=await feed.source.readVector(B,0,4),projection=await linear.run({x,weight:effectiveW.values,rows:2,inner:5120,columns:4}),output=feed.source.addBias(projection.output,effectiveB.values,2,4),comparison=compare(output,p.finalOutput);
  check(projection.evidence.weightBinding==='final-f32-runtime-input','Actual ORT binding changed');check(refs===2,'Active/read capabilities must survive creator release');
  compare((await old.source.readRows(W,0,4)).values,p.baseWeight);await feed.clear();
  const restoredW=await feed.source.readRows(W,0,4),restoredB=await feed.source.readVector(B,0,4),baseProjection=await linear.run({x,weight:restoredW.values,rows:2,inner:5120,columns:4}),restoredOutput=feed.source.addBias(baseProjection.output,restoredB.values,2,4),restored=compare(restoredOutput,p.baseOutput);
  compare((await patched.source.readRows(W,0,4)).values,p.finalWeight);compare((await feed.baseProvider.readBlock(W,0,20480,{...baseIdentity,fullShape:[5120,5120]})),p.baseWeight);
  await patched.release();patched=null;await old.release();old=null;check(refs===0,'Completed F32 package retained after restoration');
  const resource={source:source.stats(),feed:feed.stats(),linear:linear.stats()};await linear.dispose();const linearAfter=linear.stats();linear=null;await feed.dispose();const feedAfter=feed.stats();feed=null;source.dispose();const sourceAfter=source.stats();source=null;
  check(linearAfter.activeORTSessions===0&&linearAfter.pendingTensors===0&&feedAfter.readLeases===0&&feedAfter.candidates===0,'Native owner cleanup incomplete');
  return {schemaVersion:'bernini-full-model-weight-feed-real-base-check/1',passed:true,scope:'LOW crossQ four rows and explicit bias four values; two query rows; conforming completed-F32 test package only',actualLoRA:false,fullModelLoRA:false,modelPredictExecuted:false,generationReady:false,environment:{crossOriginIsolated,wasmThreads:1,silentThreadFallback:false},shape:{input:[2,5120],originalWeight:[5120,5120],selectedWeight:[4,5120],bias:[4]},baseDecode,admission,commit:{...commit,ownership:{kind:commit.ownership.kind,ownerId:commit.ownership.ownerId}},comparison,restored,readLeasesPreservedAcrossClear:true,creatorReleasedBeforeOperator:true,actualORT:projection.evidence,actualHikeBias:true,resource,cleanup:{linear:linearAfter,feed:feedAfter,source:sourceAfter,packageReferences:refs},elapsedMs:performance.now()-began};
 }finally{await patched?.release();await old?.release();if(candidate)await feed?.consumer.rollback(candidate);if(candidate)await feed?.consumer.releaseCandidate(candidate);await linear?.dispose();await feed?.dispose();source?.dispose();}
}

import {createP4Linear} from '../ort-bridge/post-self-attention/linear.mjs';

const WEIGHT='blocks.0.cross_attn.q.weight',BIAS='blocks.0.cross_attn.q.bias';
const HISTORICAL_ARTIFACT_SHA256='461b643ebcd7a481f6bec905f4b2e5d925593811c391b5f55f141f37817c9961';
const PLAN_SHA256='051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600';
const PATCH_SHA256={
 [WEIGHT]:'f5b76a1de323194fa88dab6fbaa7b5138cc0c27724d3bece336aeadcb609cd85',
 [BIAS]:'b5a4674fd0865509179117934d39549a6c1b1a12679d03cb71a69f3c4411ca49'
};
const FIELDS=['modelHash','graphHash','registryHash','side','executionProfileId','scope'];
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const demand=(condition,message)=>{if(!condition)throw Error(message);};
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),v=>v.toString(16).padStart(2,'0')).join('');
function tensor(value,count){
 demand(Object.getPrototypeOf(value??{})===Float32Array.prototype&&value.buffer instanceof ArrayBuffer&&value.byteOffset===0&&value.byteLength===value.buffer.byteLength&&value.length===count,'Compact native nonshared F32 diagnostic input required');
 const owned=new Float32Array(value);demand(owned.every(Number.isFinite),'Finite diagnostic input required');return owned;
}
function normalRead(result,description){
 demand(result.values.every(Number.isFinite),'Normal feed returned nonfinite F32');
 demand(!Object.hasOwn(result.source,'rawSHA256')&&!Object.hasOwn(result.source,'decodedF32SHA256')&&!Object.hasOwn(result.source,'rawHashMeaning')&&!Object.hasOwn(result.source.weightFeed,'patches'),'Normal read retained per-range diagnostic hashes or receipts');
 demand(result.source.weightFeed.epoch===description.epoch&&result.source.weightFeed.packageHash===description.packageHash,'Normal feed read epoch/package binding mismatch');
}

/** Diagnostic browser case: completed historical SDK F32 enters normal native admission. */
export async function runNormalWeightFeedBrowserCase({owner,patchArtifact,crossNorm,expectedQ}={}){
 const feed=owner?.weightFeed;
 demand(feed&&['registry','createSink','captureSource','prepareLoad','validate','commit','rollback','releaseCandidate','addBias','stats'].every(k=>typeof feed[k]==='function'),'Live normal P4 owner/native weight feed required');
 const input=tensor(crossNorm,10240),expected=tensor(expectedQ,10240),artifact=structuredClone(patchArtifact),registry=feed.registry(),initial=feed.stats();
 demand(artifact?.schemaVersion==='bernini-p4-final-f32-patches/0.1'&&artifact.side==='LOW'&&artifact.side===registry.side&&artifact.candidatePlanSHA256===PLAN_SHA256,'Frozen historical LOW completed-F32 artifact identity mismatch');
 demand(Array.isArray(artifact.patches)&&artifact.patches.length===2,'Exactly historical cross-Q4 weight/bias patches required');
 demand(!initial.disposed&&initial.activePatchBytes===0&&initial.packages===0&&initial.candidates===0&&initial.transactions===0&&initial.readLeases===0,'Diagnostic case requires an idle owner at immutable base');
 const identity=Object.fromEntries(FIELDS.map(k=>[k,registry[k]])),context={...identity,isCurrent:()=>{const state=owner.stats();return state.disposed===false&&state.closing===false;}};
 const blocks=[WEIGHT,BIAS].map(weightId=>{
  const target=registry.targets.find(t=>t.weightId===weightId),matching=artifact.patches.filter(p=>p.weightId===weightId),count=weightId===WEIGHT?20480:4;
  demand(target&&matching.length===1,'Historical patch target missing or duplicated');const p=matching[0];
  demand(p.offset===0&&p.count===count&&equal(p.fullShape,target.fullShape)&&equal(p.binding,target.binding)&&p.dtype==='F32'&&p.sha256===PATCH_SHA256[weightId],'Historical patch full shape/binding/range/hash mismatch');
  demand(Array.isArray(p.data)&&p.data.length===count&&p.data.every(v=>typeof v==='number'&&Number.isFinite(v)),'Historical patch requires exact finite numeric F32 elements');
  const data=new Float32Array(p.data);demand(data.every(Number.isFinite),'Historical patch exceeds finite F32');
  return {weightId,offset:0,count,fullShape:[...target.fullShape],binding:structuredClone(target.binding),dtype:'F32',sha256:p.sha256,data};
 });
 let sink=null,handle=null,candidate=null,baseLease=null,activeLease=null,linear=null,linearAfter=null,receipt=null,primary=null;
 try{
  for(const b of blocks)demand(await sha(b.data)===b.sha256,'Historical completed-F32 patch bytes differ from frozen block hash');
  const inputSHA256=await sha(input),expectedQSHA256=await sha(expected),selectedExpected=new Float32Array(8);
  for(let row=0;row<2;row++)selectedExpected.set(expected.subarray(row*5120,row*5120+4),row*4);
  baseLease=feed.captureSource();const baseDescription=baseLease.describe();
  const priorWeight=await baseLease.readRows(WEIGHT,0,4,{diagnostics:false}),priorBias=await baseLease.readVector(BIAS,0,4,{diagnostics:false}),priorUnselected=await baseLease.readRows(WEIGHT,4,1,{diagnostics:false});
  for(const result of [priorWeight,priorBias,priorUnselected])normalRead(result,baseDescription);
  const baseWeightSHA256=await sha(priorWeight.values),baseBiasSHA256=await sha(priorBias.values),unselectedRowSHA256=await sha(priorUnselected.values);
  sink=feed.createSink();await sink.begin({...identity,patches:blocks.map(({weightId,offset,count})=>({weightId,offset,count}))});
  for(const b of blocks)await sink.writeBlock(b);
  handle=await sink.finish(identity);candidate=await feed.prepareLoad(handle,context);
  // Numerical input/expected output and the historical receipt never enter admission.
  const admission=await feed.validate(candidate,context);
  demand(admission.valid&&admission.numericalComparison===false&&admission.completeDeclaredRanges===true&&admission.patchRangeCount===2,'Normal structural admission failed or required numerical comparison');
  const commit=await feed.commit(candidate,context);demand(commit.committed&&commit.numericalComparison===false,'Normal completed-F32 feed commit failed');
  await sink.release(handle);handle=null;
  demand(feed.stats().packages===0&&feed.stats().activePatchBytes===81936,'Committed feed did not retain its independent bytes after package release');
  activeLease=feed.captureSource();const activeDescription=activeLease.describe(),weight=await activeLease.readRows(WEIGHT,0,4,{diagnostics:false}),bias=await activeLease.readVector(BIAS,0,4,{diagnostics:false}),unchanged=await activeLease.readRows(WEIGHT,4,1,{diagnostics:false});
  for(const result of [weight,bias,unchanged])normalRead(result,activeDescription);
  demand(await sha(weight.values)===PATCH_SHA256[WEIGHT]&&await sha(bias.values)===PATCH_SHA256[BIAS],'Actual normal feed differs from completed SDK F32 bytes');
  demand(await sha(unchanged.values)===unselectedRowSHA256,'Normal patch changed an undeclared row');
  demand(await sha((await baseLease.readRows(WEIGHT,0,4,{diagnostics:false})).values)===baseWeightSHA256&&await sha((await baseLease.readVector(BIAS,0,4,{diagnostics:false})).values)===baseBiasSHA256,'Prior immutable base lease changed after normal commit');
  linear=await createP4Linear();const projected=await linear.run({x:input,weight:weight.values,rows:2,inner:5120,columns:4});
  demand(projected.evidence.graphSHA256===registry.graphHash&&projected.evidence.weightBinding==='final-f32-runtime-input'&&projected.evidence.innerSplit===false,'Actual ORT final-F32 projection graph/binding mismatch');
  const output=feed.addBias(projected.output,bias.values,2,4),absolute=0.01,relative=0.001;let maxAbsoluteError=0,sumSquaredError=0,failedElements=0;
  for(let i=0;i<8;i++){const error=Math.abs(output[i]-selectedExpected[i]);maxAbsoluteError=Math.max(maxAbsoluteError,error);sumSquaredError+=error*error;if(!Number.isFinite(error)||error>absolute+relative*Math.abs(selectedExpected[i]))failedElements++;}
  demand(failedElements===0,'Normal feed actual ORT/Hike cross-Q4 output failed the composed diagnostic tolerance');
  const outputSHA256=await sha(output),selectedExpectedSHA256=await sha(selectedExpected);
  const rollback=await feed.rollback(candidate,context);candidate=null;
  demand(rollback.restored===true&&feed.stats().activePackageHash===initial.activePackageHash&&feed.stats().activePatchBytes===0,'Normal candidate rollback failed to restore immutable base');
  demand(await sha((await feed.readRows(WEIGHT,0,4,{diagnostics:false})).values)===baseWeightSHA256&&await sha((await feed.readVector(BIAS,0,4,{diagnostics:false})).values)===baseBiasSHA256,'Rollback changed original selected base bytes');
  demand(await sha((await baseLease.readRows(WEIGHT,0,4,{diagnostics:false})).values)===baseWeightSHA256&&await sha((await activeLease.readRows(WEIGHT,0,4,{diagnostics:false})).values)===PATCH_SHA256[WEIGHT]&&await sha((await activeLease.readVector(BIAS,0,4,{diagnostics:false})).values)===PATCH_SHA256[BIAS],'Retained base or patched lease changed across rollback');
  receipt={schemaVersion:'bernini-normal-weight-feed-browser/0.1',passed:true,diagnosticOnly:true,side:registry.side,scope:'PARTIAL',modelInference:false,generationReady:false,canonicalLoraAdapterJointAccepted:false,lowRankArithmeticExecuted:false,
   historicalArtifact:{expectedFileSHA256:HISTORICAL_ARTIFACT_SHA256,wholeFileSHA256VerifiedByThisCase:false,candidatePlanSHA256:PLAN_SHA256,weightSHA256:PATCH_SHA256[WEIGHT],biasSHA256:PATCH_SHA256[BIAS]},
   normalAdmission:admission,normalCommit:commit,
   projection:{comparedElements:8,queryRows:2,outputColumns:4,inner:5120,innerSplit:false,graphSHA256:projected.evidence.graphSHA256,crossNormSHA256:inputSHA256,independentFullQSHA256:expectedQSHA256,selectedExpectedSHA256,outputSHA256,absoluteTolerance:absolute,relativeTolerance:relative,maxAbsoluteError,rootMeanSquareError:Math.sqrt(sumSquaredError/8),failedElements,actualORT:true,actualHikeBias:true},
   lifecycle:{packageReleasedBeforeProjection:true,baseLeaseUnchangedAfterCommit:true,patchedLeaseUnchangedAcrossRollback:true,undeclaredRowPreserved:true,rollbackRestored:true,immutableBasePackageHash:initial.activePackageHash,baseWeightSHA256,baseBiasSHA256,unselectedRowSHA256}};
 }catch(error){primary=error;}
 const failures=[];
 for(const cleanup of [async()=>{if(linear){await linear.dispose();linearAfter=linear.stats();linear=null;}},async()=>{if(candidate){await feed.rollback(candidate,context);candidate=null;}},async()=>{if(handle){await sink.release(handle);handle=null;}},async()=>{await sink?.abort();},()=>{activeLease?.release();activeLease=null;},()=>{baseLease?.release();baseLease=null;}])try{await cleanup();}catch(error){failures.push(error);}
 if(failures.length)throw new AggregateError(primary?[primary,...failures]:failures,'Normal weight-feed browser case cleanup failed');
 if(primary)throw primary;
 const after=feed.stats();
 demand(after.packages===0&&after.candidates===0&&after.transactions===0&&after.readLeases===0&&after.inFlight===0&&after.knownPatchBytes===0&&after.activePackageHash===initial.activePackageHash,'Normal feed browser case retained resources after cleanup');
 demand(linearAfter?.disposed===true&&linearAfter.activeORTSessions===0&&linearAfter.pendingTensors===0&&!linearAfter.cleanupPending,'Diagnostic projection ORT resources remain live');
 return {...receipt,cleanup:{ownerDisposed:owner.stats().disposed,packages:after.packages,candidates:after.candidates,transactions:after.transactions,readLeases:after.readLeases,inFlight:after.inFlight,knownPatchBytes:after.knownPatchBytes,linearDisposed:linearAfter.disposed,linearActiveORTSessions:linearAfter.activeORTSessions,linearPendingTensors:linearAfter.pendingTensors}};
}

import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {basename,dirname,resolve,relative,sep} from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';
import {createSnapshotManager} from '../../docs/shared/ai-connection/snapshot.mjs';
import {createInvocationQueue} from '../../docs/shared/ai-connection/queue.mjs';

const REPOSITORY='https://github.com/Kushyameln01/kushyameln-works';
const LORA_COMMIT='fc2789a0f649e33f15eb13750e6a983b5c52d170';
const DIFFUSION_COMMIT='5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const KEY='diffusion_model.blocks.0.self_attn.q';
const SCOPE='diagnostic-projection';
const SOURCE_SCOPE='synthetic-rank128-BF16-safetensors; synthetic-immutable-base; actual-native-SDK-LoRAHike-ORTProjectionHike-consumer';
const CONTROL_EXPECTATIONS=new Map([[-1,{weightFirst:.5,bias:1.875,output:2.375}],[0,{weightFirst:1,bias:2,output:3}],[1,{weightFirst:1.5,bias:2.125,output:3.625}]]);
const fixtureCache=new Map();
const activeCount=q=>q.inspect().groups.reduce((n,g)=>n+(g.activeInvocationId===null?0:1)+g.queued.length,0);
const currentBindings=b=>Object.fromEntries(b.steps.map(s=>[s.stepId,{localRevisionBindings:s.localRevisionBindings,resourceBinding:s.resourceBinding}]));
const includesError=(error,text)=>String(error?.message).includes(text)||(error instanceof AggregateError&&[...error.errors].some(e=>includesError(e,text)));

// This is a control source, not a model implementation or a numerical fallback.
// Its three nonzero BF16 constants make the independent expected outputs exact.
function controlSource(){
 const rank=128,down=new Uint16Array(rank*5120),up=new Uint16Array(5120*rank),bias=new Uint16Array(5120);
 down[0]=0x3f00;for(let row=0;row<5120;row++)up[row*rank]=0x3f80;bias.fill(0x3e00);
 const parts=[[KEY+'.lora_down.weight',[rank,5120],down],[KEY+'.lora_up.weight',[5120,rank],up],[KEY+'.diff_b',[5120],bias]];
 let offset=0;const header={};
 for(const [name,shape,data] of parts){header[name]={dtype:'BF16',shape,data_offsets:[offset,offset+data.byteLength]};offset+=data.byteLength;}
 const h=new TextEncoder().encode(JSON.stringify(header)),bytes=new Uint8Array(8+h.length+offset);new DataView(bytes.buffer).setBigUint64(0,BigInt(h.length),true);bytes.set(h,8);offset=8+h.length;
 for(const [,,data] of parts){const view=new DataView(bytes.buffer,offset,data.byteLength);for(let i=0;i<data.length;i++)view.setUint16(i*2,data[i],true);offset+=data.byteLength;}
 const digest=sha256Bytes(bytes);
 return {size:bytes.length,read:async(o,n,{signal}={})=>{signal?.throwIfAborted();return bytes.slice(o,o+n);},hash:()=>digest};
}

async function nativeSourceProof(root,commit,entries){
 const visited=new Set(),proof=[];
 async function visit(path){
  if(visited.has(path))return;visited.add(path);
  const full=resolve(root,path);assert.ok(full.startsWith(resolve(root)+sep),'Native import remains within the source root');
  const bytes=new Uint8Array(await readFile(full)),git=spawnSync('git',['-C',ROOT,'show',`${commit}:${path}`],{maxBuffer:32*1024*1024});
  assert.equal(git.status,0,`Original full Git object must exist: ${commit}:${path}`);assert.deepEqual(Buffer.from(bytes),git.stdout,`Native bytes differ from ${commit}:${path}`);
  proof.push({repository:REPOSITORY,commit,path,byteLength:bytes.length,sha256:await sha256Bytes(bytes),gitObjectMatched:true,sha256Matched:true});
  if(!path.endsWith('.mjs'))return;
  const code=new TextDecoder().decode(bytes),imports=[...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)];
  for(const match of imports){const dependency=relative(root,resolve(dirname(full),match[1])).split(sep).join('/');await visit(dependency);}
 }
 for(const path of entries)await visit(path);return proof;
}

async function nativeFixture({loraRoot,diffusionRoot}){
 assert.ok(loraRoot&&diffusionRoot,'Explicit WORKS_SNAPSHOT_LORA_ROOT and WORKS_SNAPSHOT_DIFFUSION_ROOT are required');
 const cacheKey=resolve(loraRoot)+'\n'+resolve(diffusionRoot);if(fixtureCache.has(cacheKey))return fixtureCache.get(cacheKey);
 const promise=(async()=>{
  const adoption=await import('../../docs/shared/ai-connection/adapters/adopted-lora.mjs');
  assert.equal(typeof adoption.createCandidateAdoptedLoraAdapter,'function','Separate fc+5f candidate factory is implemented');
  assert.ok(adoption.CANDIDATE_ADOPTED_LORA_SOURCE,'Candidate source pins are explicit');
  const pins=adoption.CANDIDATE_ADOPTED_LORA_SOURCE;
  assert.equal(pins.sdk.commit,LORA_COMMIT);assert.equal(pins.adapter.commit,LORA_COMMIT);assert.equal(pins.kernel.commit,LORA_COMMIT);assert.equal(pins.diffusion.commit,DIFFUSION_COMMIT);
  const [loraProof,diffusionProof]=await Promise.all([
   nativeSourceProof(loraRoot,LORA_COMMIT,[pins.sdk.path,pins.adapter.path,pins.kernel.path,'docs/shared/inference/lora/kernel/host.mjs','tools/ai-connection/fixtures/diffusion-diagnostic-registry.json','tools/ai-connection/lora-reference.py']),
   nativeSourceProof(diffusionRoot,DIFFUSION_COMMIT,[pins.diffusion.path,'docs/shared/diffusion-models/ort-bridge/stage.mjs','docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm','docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs','docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm'])
  ]);
  const sourceProof=[...loraProof,...diffusionProof];for(const [role,pin] of Object.entries(pins)){const item=sourceProof.find(p=>p.commit===pin.commit&&p.path===pin.path);assert.equal(item?.sha256,pin.sha256,`Exact ${role} digest`);if(pin.byteLength!==undefined)assert.equal(item.byteLength,pin.byteLength);}
  const ownerExports=await import(pathToFileURL(resolve(loraRoot,pins.adapter.path)).href),{createLoraV2}=await import(pathToFileURL(resolve(loraRoot,pins.sdk.path)).href),{createKernel}=await import(pathToFileURL(resolve(loraRoot,'docs/shared/inference/lora/kernel/host.mjs')).href);
  const {createDiagnosticConsumer}=await import(pathToFileURL(resolve(diffusionRoot,pins.diffusion.path)).href),{diagnosticRegistryHash}=await import(pathToFileURL(resolve(diffusionRoot,'docs/shared/diffusion-models/lora/diagnostic-identity.mjs')).href);
  const {createOrtProjectionStage}=await import(pathToFileURL(resolve(diffusionRoot,'docs/shared/diffusion-models/ort-bridge/stage.mjs')).href);
  const {createSnapshotNativeLoraOwner}=await import('../../docs/shared/ai-connection/adapters/snapshot-native-lora.mjs');
  assert.equal(typeof createSnapshotNativeLoraOwner,'function');
  const registries=JSON.parse(await readFile(resolve(loraRoot,'tools/ai-connection/fixtures/diffusion-diagnostic-registry.json'),'utf8')).registries;
  return {createCandidateAdoptedLoraAdapter:adoption.createCandidateAdoptedLoraAdapter,createSnapshotNativeLoraOwner,ownerExports,createLoraV2,createKernel,createDiagnosticConsumer,createOrtProjectionStage,diagnosticRegistryHash,registries,pins,sourceProof,wasmBytes:await readFile(resolve(loraRoot,pins.kernel.path)),projectionHikeBytes:await readFile(resolve(diffusionRoot,'docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm'))};
 })();fixtureCache.set(cacheKey,promise);try{return await promise;}catch(e){fixtureCache.delete(cacheKey);throw e;}
}

function profile(){return {contractVersion:'works-module-contract/1.0-draft.1',profileId:'p3:light-diagnostic-pair',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:['source:HIGH','source:LOW'],steps:['HIGH','LOW'].map(side=>({stepId:side,moduleId:'native-lora:'+side,operationId:'diagnose',inputBindings:[{portId:'source',artifactRef:'source:'+side}],outputBindings:[{portId:'feed',artifactRef:'feed:'+side}],adapterRefs:[],resourceGroupRefs:[]})),requiredEvidenceScopes:[SCOPE]};}

async function setupPair(f){
 const sides={},events=[];let manager;
 for(const side of ['HIGH','LOW']){
  const native=structuredClone(f.registries.find(r=>r.side===side));for(const target of native.targets){target.transform.rowStart=0;target.source.elementOffset=0;}native.registryHash=f.diagnosticRegistryHash(native);
  const fault={commit:false,rollback:false,rollbackUnconfirmed:false,prepare:false,abort:false},baseProvider={readBlock:async(id,o,n)=>Float32Array.from({length:n},(_,i)=>id==='q.bias'?2:(o+i)%5120===0?1:0)};
  const stage=await f.createOrtProjectionStage({hikeBytes:f.projectionHikeBytes});
  const consumer=f.createDiagnosticConsumer({registry:native,stage,baseProvider});
  const wrapped=Object.freeze({...consumer,
   createSink(){const sink=consumer.createSink();return Object.freeze({...sink,async abort(...args){events.push({side,phase:'NATIVE_SINK_ABORT_ATTEMPT'});if(fault.abort)throw Object.assign(Error('controlled native sink abort cleanup failure'),{code:'CONTROLLED_SINK_ABORT'});await sink.abort(...args);events.push({side,phase:'NATIVE_SINK_ABORTED'});}});},
   async commit(...args){if(fault.commit){events.push({side,phase:'CONTROLLED_COMMIT_FAILURE'});throw Object.assign(Error('controlled LOW native commit failure'),{code:'CONTROLLED_LOW_COMMIT'});}const receipt=await consumer.commit(...args);events.push({side,phase:'NATIVE_COMMITTED',epoch:receipt.epoch});return receipt;},
   async rollback(...args){events.push({side,phase:'NATIVE_ROLLBACK_ATTEMPT'});if(fault.rollback)throw Object.assign(Error('controlled HIGH native rollback cleanup failure'),{code:'CONTROLLED_HIGH_ROLLBACK'});if(fault.rollbackUnconfirmed){events.push({side,phase:'NATIVE_ROLLBACK_UNCONFIRMED'});return {restored:false,scope:'PARTIAL',modelInference:false};}const receipt=await consumer.rollback(...args);events.push({side,phase:'NATIVE_ROLLED_BACK',restored:receipt.restored});return receipt;},
   async releaseCandidate(...args){events.push({side,phase:'NATIVE_CANDIDATE_RELEASED',managerState:manager?.inspect().state??'BASELINE'});return consumer.releaseCandidate(...args);}
  });
  const x=new Float32Array(5120);x[0]=1;const context={modelHash:native.modelHash,graphHash:native.graphHash,registryHash:native.registryHash,side,scope:'PARTIAL',isCurrent:()=>true};
  const baseline=await consumer.prepareBase(context);assert.equal((await consumer.validate(baseline,{...context,x,expected:new Float32Array(16).fill(3),tolerance:{absolute:0,relative:0}})).valid,true);await consumer.commit(baseline,context);await consumer.releaseCandidate(baseline);
  const kernel=await f.createKernel({wasmBytes:f.wasmBytes}),sdk=await f.createLoraV2({sourceFactory:()=>controlSource(),kernel});
  const resourceBinding={ownerId:'manager:p3:'+side,bindingId:'resource:p3:'+side,resourceGeneration:'resource-generation:p3:'+side};
  const sourcePins=Object.fromEntries(Object.entries(f.pins).map(([key,pin])=>[key,{repository:REPOSITORY,...structuredClone(pin)}]));
  const observedOwnerExports={...f.ownerExports,createDiffusionDiagnosticAdapter(options){
   const original=f.ownerExports.createDiffusionDiagnosticAdapter(options);
   return Object.freeze({...original,targetForPlan(...args){const target=original.targetForPlan(...args);return Object.freeze({...target,async commit(...input){const receipt=await target.commit(...input);events.push({side,phase:'NATIVE_OWNER_RECEIPT',state:receipt.state,ownership:structuredClone(receipt.ownership)});return receipt;}});}});
  }};
  const adapter=f.createCandidateAdoptedLoraAdapter({ownerExports:observedOwnerExports,sdk,consumer:wrapped,baseProvider,sourcePins,resourceBinding,isOwnerCurrent:()=>true});
  const entry={side,native,fault,consumer,stage,kernel,sdk,resourceBinding,adapter,x,owner:null,captured:[],preparedElements:0,preparedControls:[],snapshotCurrent:true,lastPlan:null,lastPlanTarget:null,restoreInvocation:null};
  entry.observedAdapter=Object.freeze({...adapter,async prepare(plan,options){
   const expected=CONTROL_EXPECTATIONS.get(plan.strength);assert.ok(expected,'Only explicit independent control strengths are supported by this test fixture');
   const observed={side,strength:plan.strength,planId:plan.planId,localRevisionBindings:{sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision},firstWeight:null,bias:null,comparedValues:0};entry.preparedControls.push(observed);
   return adapter.prepare(plan,{...options,onBlock:async block=>{
   if(fault.prepare)throw Object.assign(Error('controlled prepare observer failure'),{code:'CONTROLLED_PREPARE_OBSERVER'});
   assert.ok(['q.weight','q.bias'].includes(block.weightId));
   for(let i=0;i<block.data.length;i++)assert.equal(block.data[i],block.weightId==='q.bias'?expected.bias:(block.offset+i)%5120===0?expected.weightFirst:0,'Whole selected native BF16 merge block matches the independent control constants');
   if(block.offset===0){if(block.weightId==='q.bias')observed.bias=block.data[0];else observed.firstWeight=block.data[0];}observed.comparedValues+=block.count;
   entry.preparedElements+=block.count;if(options.onBlock)await options.onBlock(block);
  }});}});
  function restoreRecord(target){const record=entry.restoreInvocation;if(!record||target.invocationId!==record.queueTarget.invocationId)return null;assert.deepEqual(target,record.queueTarget,'Restore callback belongs to the exact owned queue invocation');return record;}
  entry.queue=createInvocationQueue({resourceBindings:[{...resourceBinding,
   async cancel(t){const r=restoreRecord(t);if(!r)return entry.owner.cancelInvocation(t);if(!r.terminal)await adapter.cancelCurrent(r.phaseTarget);await r.rawTask?.catch(()=>{});return {stopped:r.terminal};},
   async afterTerminal(t,o){const r=restoreRecord(t);if(!r)return entry.owner.afterInvocation(t,o);r.afterTerminal=true;events.push({side,phase:'RESTORE_AFTER_TERMINAL'});return {reusable:o.notStarted===true||r.terminal&&!(r.error instanceof AggregateError)};},
   async release(t,o){const r=restoreRecord(t);if(!r)return entry.owner.releaseInvocation(t,o);assert.ok(o.notStarted===true||r.terminal,'Restore resource release follows the actual native terminal');r.released=true;events.push({side,phase:'RESTORE_RESOURCE_RELEASED'});}
  }]});
  sides[side]=entry;
 }
 manager=createSnapshotManager({managerSessionId:'manager:p3:native'});events.length=0;
 async function selection(revision,strength=1){
  const steps=[];
  for(const side of ['HIGH','LOW']){
   const s=sides[side],target={managerSessionId:'manager:p3:native',managerRevision:revision,requestId:`request:p3:${revision}:${side}:plan`,resourceBinding:s.resourceBinding};
   const plan=await s.adapter.plan({selection:{pairId:'light',noise:side.toLowerCase()},strength,diagnostic:{targets:[{key:KEY+'.weight',slice:{startRow:0,rowCount:16}},{key:KEY+'.bias',slice:{startRow:0,rowCount:16}}]}},{target});
   s.lastPlan=plan;s.lastPlanTarget=target;s.snapshotCurrent=true;
   const expected=CONTROL_EXPECTATIONS.get(strength);assert.ok(expected,'Independent control reference for the explicit strength is required');
   const validation={x:s.x,expected:new Float32Array(16).fill(expected.output),tolerance:{absolute:0,relative:0}};
   const owner=f.createSnapshotNativeLoraOwner({adapter:s.observedAdapter,plan,planTarget:target,validation,resourceBinding:s.resourceBinding,queue:s.queue,requestPrefix:`p3:${revision}:${side}`});s.owner=owner;
   const wrapped={...owner,async prepare(context){const prepared=await owner.prepare(context);s.captured.push({candidate:prepared.candidate,context,owner});return prepared;}};
   steps.push({stepId:side,moduleId:'native-lora:'+side,operationId:'diagnose',moduleVersion:'native-lora-candidate/fc2789a+5f880fd',nativeBindingRefs:[plan.registryHash],artifactRefs:['source:'+side],modelProfileRefs:[s.native.executionProfileId],adapterSelectionRefs:[],localRevisionBindings:{sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision},sourceRef:{repository:REPOSITORY,commit:LORA_COMMIT,path:f.pins.sdk.path},nativeBuild:f.pins.kernel.sha256,implementationState:'implemented',resourceBinding:s.resourceBinding,isCurrent:()=>s.snapshotCurrent&&s.lastPlan===plan,owner:wrapped});
  }
  return {snapshotId:`snapshot:p3:${revision}`,managerRevision:revision,artifactManifestRef:`artifacts:p3:${revision}`,evidenceManifestRef:`evidence:p3:${revision}`,requestedScope:{kind:'diagnostic',scopeId:SCOPE},steps};
 }
 async function outputs(){const result={};for(const [side,s] of Object.entries(sides)){const r=await s.consumer.run({x:s.x});assert.equal(r.scope,'PARTIAL');assert.equal(r.modelInference,false);assert.equal(r.output.every(v=>v===r.output[0]),true);result[side]=r.output[0];}return result;}
 async function cleanup(){
  for(const s of Object.values(sides)){s.fault.commit=false;s.fault.rollback=false;s.fault.rollbackUnconfirmed=false;s.fault.prepare=false;s.fault.abort=false;}
  await manager.recover().catch(()=>{});await manager.dispose().catch(()=>{});
  for(const s of Object.values(sides)){await s.queue.drain();await s.sdk.dispose();s.kernel.dispose();await s.consumer.dispose();await s.stage.dispose();}
 }
 return {sides,events,manager,selection,outputs,cleanup};
}

/** Reproducible native transaction test. Source/base are expressly fixtures;
 * SDK, both Hike kernels, ORT projection, adapter and consumer are originals. */
export async function runSnapshotNativeLoraCase({loraRoot,diffusionRoot,scenario='pair-publication'}={}){
 const f=await nativeFixture({loraRoot,diffusionRoot}),p=await setupPair(f),{manager,sides,events}=p;
 const result={scenario,state:'PASS',scope:SOURCE_SCOPE,coverage:'PARTIAL',modelInference:false,generationReady:false,realBaseVerified:false,sourceProof:f.sourceProof};
 try{
  const first=await p.selection(1,scenario==='zero-reapply-restore'?0:1);
  if(scenario==='prepare-cleanup-recovery'){
   sides.HIGH.fault.prepare=true;sides.HIGH.fault.abort=true;
   let failure;try{await manager.stageSnapshot(profile(),first);}catch(error){failure=error;}
   assert.ok(failure);assert.equal(includesError(failure,'controlled prepare observer failure'),true);
   result.blockedState=manager.inspect().state;assert.equal(result.blockedState,'RECOVERY_REQUIRED');
   let blocked;try{await manager.stageSnapshot(profile(),{...first,snapshotId:'snapshot:p3:blocked',managerRevision:2});}catch(error){blocked=error;}
   result.newWorkBlocked=blocked?.code==='RECOVERY_REQUIRED';assert.equal(result.newWorkBlocked,true);
   sides.HIGH.fault.abort=false;sides.HIGH.fault.prepare=false;await manager.recover();result.recoveredState=manager.inspect().state;
   result.retainedSinkCleanupRetried=events.filter(e=>e.side==='HIGH'&&e.phase==='NATIVE_SINK_ABORT_ATTEMPT').length>=2&&events.some(e=>e.side==='HIGH'&&e.phase==='NATIVE_SINK_ABORTED');
   result.afterRecovery=await p.outputs();result.queueStillQuarantined=sides.HIGH.queue.inspect().groups.some(g=>g.quarantined);
   const rb=sides.HIGH.resourceBinding;let quarantined;
   try{await sides.HIGH.queue.enqueue({id:'p3:quarantined-reuse',requestId:'request:p3:quarantined-reuse',ownerId:rb.ownerId,resourceBinding:rb.bindingId,resourceGeneration:rb.resourceGeneration,revision:2,activeToken:'token:p3:quarantined-reuse'},()=>assert.fail('Quarantined native resource must not dispatch'));}catch(error){quarantined=error;}
   result.queueReuseBlocked=quarantined?.code==='RESOURCE_QUARANTINED';assert.equal(result.queueReuseBlocked,true);
   Object.assign(result,{snapshotState:manager.inspect().state,activeSnapshotId:manager.active?.snapshotId??null,events});return result;
  }
  const token=await manager.stageSnapshot(profile(),first);
  assert.equal(manager.inspect().state,'STAGED');assert.equal(manager.active,null);assert.deepEqual(await p.outputs(),{HIGH:3,LOW:3});
  assert.equal(sides.HIGH.preparedElements,81936);assert.equal(sides.LOW.preparedElements,81936);
  result.wholeSelectedNativeMergeValuesCompared=163872;
  result.pendingQueueSlotsAtCheckpoint=Object.values(sides).reduce((n,s)=>n+activeCount(s.queue),0);assert.equal(result.pendingQueueSlotsAtCheckpoint,2);
  if(scenario==='zero-reapply-restore'){
   const zeroPublished=await manager.publishSnapshot(token,{currentBindings:currentBindings(first)});assert.equal(zeroPublished.state,'SNAPSHOT_PUBLISHED');result.afterZero=await p.outputs();assert.deepEqual(result.afterZero,{HIGH:3,LOW:3});
   const second=await p.selection(2,1),secondToken=await manager.stageSnapshot(profile(),second);await manager.publishSnapshot(secondToken,{currentBindings:currentBindings(second)});
   result.afterReapply=await p.outputs();assert.deepEqual(result.afterReapply,{HIGH:3.625,LOW:3.625});
   const third=await p.selection(3,1),thirdToken=await manager.stageSnapshot(profile(),third);await manager.publishSnapshot(thirdToken,{currentBindings:currentBindings(third)});
   result.afterReapplyAgain=await p.outputs();assert.deepEqual(result.afterReapplyAgain,{HIGH:3.625,LOW:3.625},'Repeated strength one starts from the immutable base, not the previous applied feed');
   result.preparedControls=Object.values(sides).flatMap(s=>s.preparedControls.map(c=>structuredClone(c)));assert.equal(result.preparedControls.length,6);
   for(const c of result.preparedControls){const expected=CONTROL_EXPECTATIONS.get(c.strength);assert.equal(c.firstWeight,expected.weightFirst);assert.equal(c.bias,expected.bias);assert.equal(c.comparedValues,81936);}
   result.wholeSelectedNativeMergeValuesCompared=Object.values(sides).reduce((n,s)=>n+s.preparedElements,0);assert.equal(result.wholeSelectedNativeMergeValuesCompared,491616);
   result.reapplicationAccumulated=result.preparedControls.some(c=>c.strength===1&&(c.firstWeight!==1.5||c.bias!==2.125));assert.equal(result.reapplicationAccumulated,false);
   for(const s of Object.values(sides))s.snapshotCurrent=false;
   result.snapshotCurrentBeforeRestore=manager.inspect().selectionCurrent;assert.equal(result.snapshotCurrentBeforeRestore,false);
   result.restoreReceipts=[];
   for(const [side,s] of Object.entries(sides)){
    const selected=third.steps.find(step=>step.stepId===side),selectedPlan=s.lastPlan,localRevisionBindings=structuredClone(selected.localRevisionBindings),phaseTarget={...structuredClone(s.lastPlanTarget),requestId:`request:p3:3:${side}:restore-base`};
    const id=`p3:3:${side}:restore-base`,queueRequest=`request:p3:queue:3:${side}:restore-base`,activeToken=`token:p3:3:${side}:restore-base`,queueTarget={invocationId:id,bindingId:s.resourceBinding.bindingId,ownerId:s.resourceBinding.ownerId,resourceGeneration:s.resourceBinding.resourceGeneration,requestId:queueRequest,revision:3,activeToken};
    const r={queueTarget,phaseTarget,localRevisionBindings,terminal:false,afterTerminal:false,released:false,error:null,rawTask:null};s.restoreInvocation=r;
    const isCurrent=observed=>s.lastPlan===selectedPlan&&manager.active?.snapshotId===third.snapshotId&&manager.inspect().managerRevision===3&&observed.managerSessionId===s.lastPlanTarget.managerSessionId&&observed.managerRevision===s.lastPlanTarget.managerRevision&&['ownerId','bindingId','resourceGeneration'].every(k=>observed.resourceBinding[k]===s.resourceBinding[k])&&localRevisionBindings.sdkInstanceId===s.sdk.sdkInstanceId&&['sdkInstanceId','localInputRevision','localApplicationRevision'].every(k=>localRevisionBindings[k]===selectedPlan[k]&&localRevisionBindings[k]===selected.localRevisionBindings[k]);
    assert.equal(isCurrent(phaseTarget),true);
    const native=await s.queue.enqueue({id,requestId:queueRequest,ownerId:queueTarget.ownerId,resourceBinding:queueTarget.bindingId,resourceGeneration:queueTarget.resourceGeneration,revision:3,activeToken},({signal,target})=>{
     assert.deepEqual(target,queueTarget);r.rawTask=s.adapter.restoreBase({x:s.x,expected:new Float32Array(16).fill(3),tolerance:{absolute:0,relative:0},signal},{target:phaseTarget,isCurrent}).then(receipt=>{r.receipt=receipt;return receipt;},error=>{r.error=error;throw error;}).finally(()=>{r.terminal=true;events.push({side,phase:'RESTORE_NATIVE_TERMINAL'});});return r.rawTask;
    });
    const queueReceipt=s.queue.inspect().invocations.find(i=>i.id===id);assert.ok(queueReceipt?.originalTerminal&&queueReceipt.resourceReleased&&queueReceipt.reusable&&queueReceipt.resultAccepted);assert.equal(r.afterTerminal,true);assert.equal(r.released,true);
    assert.equal(native.application,'IMMUTABLE_BASE');assert.equal(native.snapshotPublished,false);assert.equal(native.generationReady,false);assert.equal(native.scope,'diagnostic-projection');
    result.restoreReceipts.push({side,native,management:{target:phaseTarget,localRevisionBindings,queueTarget,snapshotRef:third.snapshotId,snapshotPublished:false,generationReady:false},queue:queueReceipt});
   }
   result.afterRestore=await p.outputs();assert.deepEqual(result.afterRestore,{HIGH:3,LOW:3});result.restorePublishedSnapshot=false;assert.equal(manager.active.snapshotId,third.snapshotId);
  }else if(scenario==='pair-publication'||scenario==='stale-rollback'){
   result.beforePublish=await p.outputs();const published=await manager.publishSnapshot(token,{currentBindings:currentBindings(first)});
   result.afterPublish=await p.outputs();assert.deepEqual(result.afterPublish,{HIGH:3.625,LOW:3.625});assert.equal(published.generationReady,false);
   result.dynamicNativeOwnershipPreserved=published.nativeStates.every(s=>{const native=events.find(e=>e.side===s.stepId&&e.phase==='NATIVE_OWNER_RECEIPT');return native?.state===s.state&&native.ownership.kind===s.ownership.kind&&native.ownership.ownerId===s.ownership.ownerId&&s.ownership.kind==='independent-copy'&&s.ownership.ownerId!==sides[s.stepId].resourceBinding.ownerId;});
   result.finalizedAfterPublication=events.filter(e=>e.phase==='NATIVE_CANDIDATE_RELEASED').length===2&&events.filter(e=>e.phase==='NATIVE_CANDIDATE_RELEASED').every(e=>e.managerState==='SNAPSHOT_PUBLISHED');
   result.pendingQueueSlotsAfterPublish=Object.values(sides).reduce((n,s)=>n+activeCount(s.queue),0);
   assert.equal(Object.values(sides).every(s=>s.queue.inspect().invocations.every(i=>i.originalTerminal&&i.resourceReleased&&i.reusable)),true,'Publication waits for native terminal and queue owner release');
   if(scenario==='stale-rollback'){
    const previous=Object.values(sides).map(s=>s.captured[0]),next=await p.selection(2,-1);await manager.publishSnapshot(await manager.stageSnapshot(profile(),next),{currentBindings:currentBindings(next)});
    result.newerFeed=await p.outputs();assert.deepEqual(result.newerFeed,{HIGH:2.375,LOW:2.375});
    for(const old of previous)await old.owner.rollback(old.candidate,old.context);
    result.afterOldRollback=await p.outputs();assert.deepEqual(result.afterOldRollback,result.newerFeed);
   }
  }else if(scenario==='cancel-at-checkpoint'){
   const captured=sides.HIGH.captured[0],cancel=sides.HIGH.owner.invocationTarget(captured.candidate);
   assert.ok(cancel?.id&&cancel.target,'Owner exposes its exact public queue cancellation target');
   let wrong;try{await sides.HIGH.queue.cancelInvocation(cancel.id,{...cancel.target,revision:0});}catch(error){wrong=error;}
   result.wrongTargetRejected=wrong?.code==='TARGET_MISMATCH';assert.equal(result.wrongTargetRejected,true);
   result.cancelReport=await sides.HIGH.queue.cancelInvocation(cancel.id,cancel.target);
   assert.equal(result.cancelReport.originalTerminal,true);assert.equal(result.cancelReport.resourceReleased,true);assert.equal(result.cancelReport.reusable,true);assert.equal(result.cancelReport.quarantined,false);
   await manager.abortSnapshot(token);result.afterCancellation=await p.outputs();assert.deepEqual(result.afterCancellation,{HIGH:3,LOW:3});
   const next=await p.selection(2);await manager.publishSnapshot(await manager.stageSnapshot(profile(),next),{currentBindings:currentBindings(next)});result.successorFeed=await p.outputs();
   let stale;try{await sides.HIGH.queue.cancelInvocation(cancel.id,cancel.target);}catch(error){stale=error;}
   result.oldCancelRejected=stale?.code==='STALE_INVOCATION';assert.equal(result.oldCancelRejected,true);
  }else if(scenario==='low-failure'||scenario==='cleanup-recovery'||scenario==='rollback-unconfirmed'){
   sides.LOW.fault.commit=true;if(scenario==='cleanup-recovery')sides.HIGH.fault.rollback=true;if(scenario==='rollback-unconfirmed')sides.HIGH.fault.rollbackUnconfirmed=true;
   let failure;try{await manager.publishSnapshot(token,{currentBindings:currentBindings(first)});}catch(error){failure=error;}
   assert.ok(failure,'LOW fault must reject snapshot publication');assert.equal(includesError(failure,'controlled LOW native commit failure'),true);
   result.failedNativeSide='LOW';result.highActuallyCommitted=events.some(e=>e.side==='HIGH'&&e.phase==='NATIVE_COMMITTED');assert.equal(result.highActuallyCommitted,true);assert.equal(manager.active,null);
   if(scenario==='rollback-unconfirmed'){
    result.blockedState=manager.inspect().state;result.selectionCurrentWhileBlocked=manager.inspect().selectionCurrent;assert.equal(result.blockedState,'RECOVERY_REQUIRED');
    let blocked;try{await manager.stageSnapshot(profile(),{...first,snapshotId:'snapshot:p3:blocked',managerRevision:2});}catch(error){blocked=error;}
    result.newWorkBlocked=blocked?.code==='RECOVERY_REQUIRED';result.unrestoredFeed=await p.outputs();
    const retained=sides.HIGH.owner.inspect(sides.HIGH.captured[0].candidate);result.highCandidateRetained=retained.preparedReleased===false&&retained.rolledBack===false;
    result.nativeCandidateReleaseCount=events.filter(e=>e.phase==='NATIVE_CANDIDATE_RELEASED').length;
   }else if(scenario==='cleanup-recovery'){
    result.blockedState=manager.inspect().state;result.selectionCurrentWhileBlocked=manager.inspect().selectionCurrent;result.beforeRecovery=await p.outputs();
    let blocked;try{await manager.stageSnapshot(profile(),{...first,snapshotId:'snapshot:p3:blocked',managerRevision:2});}catch(error){blocked=error;}
    result.newWorkBlocked=blocked?.code==='RECOVERY_REQUIRED';assert.equal(result.newWorkBlocked,true);
    sides.HIGH.fault.rollback=false;sides.LOW.fault.commit=false;await manager.recover();result.afterRecovery=await p.outputs();result.recoveredState=manager.inspect().state;
    result.rollbackRetried=events.filter(e=>e.side==='HIGH'&&e.phase==='NATIVE_ROLLBACK_ATTEMPT').length>=2;
   }else{result.afterFailure=await p.outputs();assert.deepEqual(result.afterFailure,{HIGH:3,LOW:3});}
   result.queueReusable=Object.values(sides).every(s=>s.queue.inspect().groups.every(g=>!g.quarantined));
  }else throw Error('Unknown P3 scenario: '+scenario);
  Object.assign(result,{snapshotState:manager.inspect().state,selectionCurrent:manager.inspect().selectionCurrent,activeSnapshotId:manager.active?.snapshotId??null,events});return result;
 }finally{await p.cleanup();}
}

async function referenceArray(referencePath,record,width){
 assert.ok(record&&typeof record.file==='string'&&!record.file.includes('/')&&!record.file.includes('\\'));
 const bytes=new Uint8Array(await readFile(resolve(dirname(referencePath),record.file)));
 assert.equal(bytes.length,record.bytes);assert.equal(bytes.length,record.elements*width);assert.equal(await sha256Bytes(bytes),record.sha256);
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),result=width===4?new Float32Array(record.elements):new Float64Array(record.elements);
 for(let i=0;i<result.length;i++)result[i]=width===4?view.getFloat32(i*4,true):view.getFloat64(i*8,true);assert.equal(result.every(Number.isFinite),true);return result;
}

/** Optional original-input trial. Uses one genuine original File and the
 * independently generated owner NumPy reference over an explicit fixture base.
 * It neither acquires a real base nor re-runs or replaces the original20 proof. */
export async function runOriginalSnapshotNativeLoraCase({loraRoot,diffusionRoot,originalPath,referencePath,expectedSha256}={}){
 assert.ok(originalPath&&referencePath&&/^[a-f0-9]{64}$/.test(expectedSha256),'Explicit original path, independent reference and expected full hash required');
 const f=await nativeFixture({loraRoot,diffusionRoot}),referenceBytes=new Uint8Array(await readFile(referencePath)),reference=JSON.parse(new TextDecoder().decode(referenceBytes));
 assert.equal(reference.realBase,false);assert.equal(reference.scope,'synthetic-manager-control-fixture');
 const selected=reference.cases.find(c=>c.strength===1);assert.ok(selected);assert.equal(reference.input.fileName,basename(originalPath));
 const [baseWeight,baseBias,x,expectedWeight,expectedBias]=await Promise.all([
  referenceArray(referencePath,reference.baseWeight,4),referenceArray(referencePath,reference.baseBias,4),referenceArray(referencePath,reference.activation,4),referenceArray(referencePath,selected.weight,8),referenceArray(referencePath,selected.bias,4)
 ]);
 assert.equal(baseWeight.length,81920);assert.equal(baseBias.length,16);assert.equal(x.length,5120);assert.equal(expectedWeight.length,81920);assert.equal(expectedBias.length,16);
 const file=new File([await openAsBlob(originalPath)],basename(originalPath),{type:'application/octet-stream'});assert.equal(file.size,reference.input.byteLength);
 const hasher=createHash('sha256'),hashStarted=performance.now();for await(const chunk of Readable.fromWeb(file.stream()))hasher.update(chunk);const fullSha256=hasher.digest('hex'),hashMs=performance.now()-hashStarted;
 assert.equal(fullSha256,expectedSha256,'This run hashes the genuine selected File, not an inventory label');
 const source={size:file.size,hash:async({signal}={})=>{signal?.throwIfAborted();return fullSha256;},async read(offset,length,{signal}={}){signal?.throwIfAborted();assert.ok(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=file.size-length&&length<=16*1024*1024);const data=new Uint8Array(await file.slice(offset,offset+length).arrayBuffer());signal?.throwIfAborted();assert.equal(data.length,length);return data;}};
 const native=structuredClone(f.registries.find(r=>r.side==='HIGH'));for(const t of native.targets){t.transform.rowStart=0;t.source.elementOffset=0;}native.registryHash=f.diagnosticRegistryHash(native);
 const baseProvider={async readBlock(id,offset,count){return (id==='q.bias'?baseBias:baseWeight).slice(offset,offset+count);}},stage=await f.createOrtProjectionStage({hikeBytes:f.projectionHikeBytes});
 const consumer=f.createDiagnosticConsumer({registry:native,stage,baseProvider}),kernel=await f.createKernel({wasmBytes:f.wasmBytes}),sdk=await f.createLoraV2({sourceFactory:()=>source,kernel});
 const resourceBinding={ownerId:'manager:p3:original:HIGH',bindingId:'resource:p3:original:HIGH',resourceGeneration:'resource-generation:p3:original:HIGH'},target={managerSessionId:'manager:p3:original',managerRevision:1,requestId:'request:p3:original:plan',resourceBinding};
 const sourcePins=Object.fromEntries(Object.entries(f.pins).map(([key,pin])=>[key,{repository:REPOSITORY,...structuredClone(pin)}]));
 const adapter=f.createCandidateAdoptedLoraAdapter({ownerExports:f.ownerExports,sdk,consumer,baseProvider,sourcePins,resourceBinding,isOwnerCurrent:()=>true}),manager=createSnapshotManager({managerSessionId:target.managerSessionId});
 let owner,comparedValues=0,maxWeightAbsoluteError=0;const queue=createInvocationQueue({resourceBindings:[{...resourceBinding,cancel:t=>owner.cancelInvocation(t),afterTerminal:(t,o)=>owner.afterInvocation(t,o),release:(t,o)=>owner.releaseInvocation(t,o)}]});
 try{
  const nativeContext={modelHash:native.modelHash,graphHash:native.graphHash,registryHash:native.registryHash,side:'HIGH',scope:'PARTIAL',isCurrent:()=>true},baseline=await consumer.prepareBase(nativeContext);
  assert.equal((await consumer.validate(baseline,{...nativeContext,x,expected:Float32Array.from(reference.baseExpectedOutput),tolerance:reference.gates.projection})).valid,true);await consumer.commit(baseline,nativeContext);await consumer.releaseCandidate(baseline);
  const plan=await adapter.plan({selection:{pairId:'light',noise:'high'},strength:1,diagnostic:{targets:[{key:KEY+'.weight',slice:{startRow:0,rowCount:16}},{key:KEY+'.bias',slice:{startRow:0,rowCount:16}}]}},{target});assert.equal(plan.sourceSha256,fullSha256);
  const observedAdapter=Object.freeze({...adapter,async prepare(p,options){return adapter.prepare(p,{...options,onBlock:block=>{
   assert.ok(['q.weight','q.bias'].includes(block.weightId));const expected=block.weightId==='q.bias'?expectedBias:expectedWeight,gate=block.weightId==='q.bias'?reference.gates.bias:reference.gates.weight;
   for(let i=0;i<block.count;i++){const actual=block.data[i],want=expected[block.offset+i],delta=Math.abs(actual-want);assert.ok(Number.isFinite(delta)&&delta<=gate.absolute+gate.relative*Math.abs(want),'Prepared original LoRA block passes the pre-existing owner reference gate');if(block.weightId==='q.weight')maxWeightAbsoluteError=Math.max(maxWeightAbsoluteError,delta);comparedValues++;}
  }});}});
  owner=f.createSnapshotNativeLoraOwner({adapter:observedAdapter,plan,planTarget:target,validation:{x,expected:Float32Array.from(selected.expectedOutput),tolerance:reference.gates.projection},resourceBinding,queue,requestPrefix:'p3:original:HIGH'});
  const selectedProfile=profile();selectedProfile.profileId='p3:original-high-diagnostic';selectedProfile.steps=selectedProfile.steps.filter(s=>s.stepId==='HIGH');selectedProfile.externalArtifactRefs=['source:HIGH'];
  const bindings={snapshotId:'snapshot:p3:original:HIGH',managerRevision:1,artifactManifestRef:'artifacts:p3:original',evidenceManifestRef:'evidence:p3:original',requestedScope:{kind:'diagnostic',scopeId:SCOPE},steps:[{stepId:'HIGH',moduleId:'native-lora:HIGH',operationId:'diagnose',moduleVersion:'native-lora-candidate/fc2789a+5f880fd',nativeBindingRefs:[plan.registryHash],artifactRefs:['source:HIGH'],modelProfileRefs:[native.executionProfileId],adapterSelectionRefs:[],localRevisionBindings:{sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision},sourceRef:{repository:REPOSITORY,commit:LORA_COMMIT,path:f.pins.sdk.path},nativeBuild:f.pins.kernel.sha256,implementationState:'implemented',resourceBinding,isCurrent:()=>true,owner}]};
  const token=await manager.stageSnapshot(selectedProfile,bindings);assert.equal(comparedValues,81936);const before=await consumer.run({x});assert.deepEqual([...before.output],reference.baseExpectedOutput);
  const published=await manager.publishSnapshot(token,{currentBindings:currentBindings(bindings)}),after=await consumer.run({x});assert.equal(published.state,'SNAPSHOT_PUBLISHED');assert.equal(published.generationReady,false);
  for(let i=0;i<16;i++)assert.ok(Math.abs(after.output[i]-selected.expectedOutput[i])<=reference.gates.projection.absolute+reference.gates.projection.relative*Math.abs(selected.expectedOutput[i]));
  assert.equal(after.scope,'PARTIAL');assert.equal(after.modelInference,false);assert.deepEqual(after.evidence.executionProviders,['wasm']);
  return {scenario:'original-file',state:'PASS',scope:'genuine-local-File; synthetic-manager-control-fixture-base; actual-native-SDK-LoRAHike-ORTProjectionHike-consumer; diagnostic-only',coverage:'PARTIAL',generationReady:false,realBaseVerified:false,original20Recomputed:false,sourceProof:f.sourceProof,originalInput:{fileName:file.name,byteLength:file.size,sha256:fullSha256,fullFileHashComputedThisRun:true,hashMs},reference:{sha256:await sha256Bytes(referenceBytes),scope:reference.scope,gates:reference.gates,input:reference.input,weight: selected.weight,bias:selected.bias},comparedValues,maxWeightAbsoluteError,expectedOutput:selected.expectedOutput,actualOutput:[...after.output],runtimeEvidence:after.evidence,snapshotState:manager.inspect().state,selectionCurrent:manager.inspect().selectionCurrent,nativeStates:published.nativeStates,queue:queue.inspect()};
 }finally{await manager.recover().catch(()=>{});await manager.dispose();await queue.drain();await sdk.dispose();kernel.dispose();await consumer.dispose();await stage.dispose();}
}

async function main(){
 const args=process.argv.slice(2),value=flag=>{const at=args.indexOf(flag);return at<0?undefined:args[at+1];};
 const loraRoot=value('--lora-root')??process.env.WORKS_SNAPSHOT_LORA_ROOT,diffusionRoot=value('--diffusion-root')??process.env.WORKS_SNAPSHOT_DIFFUSION_ROOT;
 const originalPath=value('--original'),scenarios=value('--scenario')?[value('--scenario')]:originalPath?['original-file']:['pair-publication','low-failure','stale-rollback','cleanup-recovery','cancel-at-checkpoint','prepare-cleanup-recovery','rollback-unconfirmed','zero-reapply-restore'],results=[];
 for(const scenario of scenarios)results.push(scenario==='original-file'?await runOriginalSnapshotNativeLoraCase({loraRoot,diffusionRoot,originalPath,referencePath:value('--reference'),expectedSha256:value('--expected-sha256')}):await runSnapshotNativeLoraCase({loraRoot,diffusionRoot,scenario}));
 const json=JSON.stringify({schemaVersion:'works-snapshot-native-lora-run/0.1',state:'PASS',scopes:[...new Set(results.map(r=>r.scope))],generationReady:false,realBaseVerified:false,results},null,2)+'\n',output=value('--output');
 if(output)await writeFile(output,json);process.stdout.write(output?`P3 ${results.length} native transaction cases PASS; ${output}\n`:json);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exitCode=1;});

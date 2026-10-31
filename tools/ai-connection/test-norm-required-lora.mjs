import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadReferenceSet} from '../../docs/shared/ai-connection/reference-loader.mjs';
import {normEdgeFixture} from './norm-execution-fixtures.mjs';
import {createSnapshotManager} from '../../docs/shared/ai-connection/snapshot.mjs';
import {createInvocationQueue} from '../../docs/shared/ai-connection/queue.mjs';

const CANDIDATE='works-candidate-adopted-lora/0.1-draft.1';
let fixedSet;
async function referenceSet(){
 if(fixedSet)return fixedSet;
 const root=new URL('../../',import.meta.url),path='docs/shared/ai-connection/reference/catalog.v1.json',catalogBytes=new Uint8Array(await readFile(new URL(path,root))),catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
 const files=new Map(await Promise.all(catalog.files.map(async f=>[f.path,new Uint8Array(await readFile(new URL(f.path,root)))])));
 return fixedSet=await loadReferenceSet({catalogBytes,files,expectedCatalogSha256:'14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c'});
}
async function factory(){const module=await import('../../docs/shared/ai-connection/adapters/norm-required-lora.mjs');assert.equal(typeof module.createNormRequiredLoraExecution,'function');return module.createNormRequiredLoraExecution;}
function probe(){
 const calls=[],adapter={contractVersion:CANDIDATE};
 for(const name of ['plan','prepare','openStage','finalize','release','recover','cancelCurrent','describeBinding'])adapter[name]=async(...args)=>{calls.push({name,args});throw Error('Native dispatch was forbidden by this constructor test');};
 return {adapter,calls};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});void promise.catch(()=>{});return {promise,resolve,reject};};
const count=(calls,name)=>calls.filter(c=>c.name===name).length;
const revisions=plan=>({sdkInstanceId:plan.sdkInstanceId,localInputRevision:plan.localInputRevision,localApplicationRevision:plan.localApplicationRevision});
function nativeAdapter(f,{afterFinalize}={}){
 const calls=[],state={applied:false,validationObserved:false,finalized:false},prepared=Object.freeze({state:'PREPARED',manifest:{...structuredClone(f.plan),bundleHash:'9'.repeat(64)},handle:Object.freeze({opaque:'fake-public-owner-package'})});
 const adapter={contractVersion:CANDIDATE,registry:f.plan.registry,
  async plan(input,options){calls.push({name:'plan',input,options});return f.plan;},
  async describeBinding(){calls.push({name:'describeBinding'});return structuredClone(f.binding);},
  async prepare(plan,options){assert.equal(plan,f.plan);calls.push({name:'prepare',options});return prepared;},
  openStage(value,validation,options){
   assert.equal(value,prepared);calls.push({name:'openStage',options});const done=deferred();let terminal=false,committed=false;
   const management={adoptionVersion:CANDIDATE,ownerAdapterVersion:'lora-diffusion-diagnostic-adapter/0.1',target:structuredClone(options.target),resourceBinding:structuredClone(f.resourceBinding),sourcePins:structuredClone(f.pins),kernelSha256:f.pins.kernel.sha256,localRevisionBindings:revisions(f.plan),coverage:'PARTIAL',scope:'diagnostic-projection',generationReady:false};
   const checkpoint=Promise.resolve().then(()=>{calls.push({name:'nativeValidate',receipt:f.nativeValidation});state.validationObserved=true;return {validation:f.nativeValidation,management};});
   const envelope={receipt:{contractVersion:f.plan.contractVersion,state:'CONSUMER_APPLIED',sdkInstanceId:f.plan.sdkInstanceId,...revisions(f.plan),planId:f.plan.planId,registryHash:f.plan.registryHash,sourceSha256:f.plan.sourceSha256,bundleHash:prepared.manifest.bundleHash,coverage:'PARTIAL',scope:'diagnostic-projection',validation:f.nativeValidation,ownership:{kind:'independent-copy',ownerId:'native:exact-dynamic-copy'},snapshotPublished:false,generationReady:false},management};
   const abort=()=>{if(!terminal){terminal=true;done.reject(Object.assign(Error('Fake native stage aborted at commit gate'),{code:'SNAPSHOT_ABORTED'}));}};
   options.signal?.addEventListener('abort',abort,{once:true});
   return {checkpoint,completion:done.promise,
    async commit(){calls.push({name:'nativeCommit'});assert.equal(state.validationObserved,true);assert.equal(terminal,false);committed=true;state.applied=true;terminal=true;done.resolve(envelope);return done.promise;},
    abort,
    async rollback(){calls.push({name:'nativeRollback'});assert.equal(state.finalized,false,'Published native rollback history is already retired');abort();state.applied=false;return {completed:true,native:{restored:committed,scope:'PARTIAL',modelInference:false}};}
   };
  },
  async finalize(value,envelope){assert.equal(value,prepared);assert.equal(envelope.receipt.ownership.ownerId,'native:exact-dynamic-copy');calls.push({name:'finalize'});state.finalized=true;afterFinalize?.();return {finalized:true,generationReady:false};},
  async release(value){assert.equal(value,prepared);calls.push({name:'release'});return {released:true};},
  async recover(){calls.push({name:'recover'});return {recoveryCompleted:true};},
  async cancelCurrent(){calls.push({name:'cancelCurrent'});return {accepted:true};}
 };
 return {adapter,calls,state};
}
function ownerEvidence(f,result='pass'){
 return {evidenceId:'owner:actual-comparison',result,coverage:'PARTIAL',scope:'diagnostic-projection',baseKind:'synthetic-fixture',referenceId:'fixture:reference',planId:f.plan.planId,sourceSha256:f.plan.sourceSha256,strength:f.plan.strength,nativeRegistryHash:f.binding.owner.nativeRegistryHash,connectionRegistryHash:f.plan.registryHash,referenceSha256:f.numeric.referenceRef.sha256};
}
function snapshotInputs(f,owner){
 const profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'norm-test:diagnostic',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:['source:norm'],steps:[{stepId:'HIGH',moduleId:'native-lora:norm',operationId:'diagnose',inputBindings:[{portId:'source',artifactRef:'source:norm'}],outputBindings:[{portId:'feed',artifactRef:'feed:norm'}],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:['diagnostic-projection']};
 const bindings={snapshotId:'snapshot:norm',managerRevision:1,artifactManifestRef:'artifacts:norm',evidenceManifestRef:'evidence:norm',requestedScope:{kind:'diagnostic',scopeId:'diagnostic-projection'},steps:[{stepId:'HIGH',moduleId:'native-lora:norm',operationId:'diagnose',moduleVersion:'fake-public-native-owner/1',nativeBindingRefs:[f.plan.registryHash],artifactRefs:['source:norm'],modelProfileRefs:[f.plan.registry.executionProfileId],adapterSelectionRefs:[],localRevisionBindings:revisions(f.plan),sourceRef:structuredClone(f.pins.sdk),nativeBuild:f.plan.buildId,implementationState:'implemented',resourceBinding:structuredClone(f.resourceBinding),isCurrent:()=>true,owner}]};
 const currentBindings={HIGH:{localRevisionBindings:revisions(f.plan),resourceBinding:structuredClone(f.resourceBinding)}};return {profile,bindings,currentBindings};
}
async function executionFixture({evidenceResult='pass',staleAfterPublication=false,mutateOwnerEvidence}={}){
 const create=await factory(),f=await normEdgeFixture(),current={activeBindings:structuredClone(f.edgeInput.activeBindings),resourceState:structuredClone(f.edgeInput.resourceState)};
 const native=nativeAdapter(f,{afterFinalize:()=>{if(staleAfterPublication)current.activeBindings.producer.valid=false;}}),ownerEvidenceCalls=[],comparison={result:evidenceResult,throws:false};
 const execution=create({adapter:native.adapter,referenceSet:f.referenceSet,edgeInput:f.edgeInput,readCurrent:()=>structuredClone(current),readOwnerEvidence:input=>{ownerEvidenceCalls.push(input);assert.equal(native.state.validationObserved,true,'Owner comparison follows the actual native validation checkpoint');if(comparison.throws)throw Object.assign(Error('Owner comparison reader unavailable'),{code:'OWNER_COMPARISON_UNAVAILABLE'});const receipt=ownerEvidence(f,comparison.result);mutateOwnerEvidence?.(receipt);return receipt;}});
 assert.equal(count(native.calls,'plan'),0,'Declaration admission does not invoke the native SDK');
 const planInput={selection:{pairId:'light',noise:'high'},strength:1,diagnostic:{targets:f.plan.operations.map(op=>({key:op.key,slice:op.slice}))}};
 const plan=await execution.plan(planInput,{target:f.planTarget});assert.equal(plan,f.plan);assert.equal(count(native.calls,'plan'),1);
 let owner;const queue=createInvocationQueue({resourceBindings:[{...f.resourceBinding,cancel:t=>owner.cancelInvocation(t),afterTerminal:(t,o)=>owner.afterInvocation(t,o),release:(t,o)=>owner.releaseInvocation(t,o)}]});
 owner=await execution.createSnapshotOwner({plan,validation:{x:new Float32Array(5120),expected:new Float32Array(16),tolerance:{absolute:0,relative:0}},resourceBinding:f.resourceBinding,queue,requestPrefix:'norm-test'});
 const manager=createSnapshotManager({managerSessionId:f.planTarget.managerSessionId}),inputs=snapshotInputs(f,owner);
 return {f,native,execution,current,ownerEvidenceCalls,comparison,queue,owner,manager,...inputs,async dispose(){current.activeBindings.producer.valid=true;await manager.recover().catch(()=>{});await manager.dispose();await queue.drain();}};
}
async function unstartedExecution(){
 const create=await factory(),f=await normEdgeFixture(),native=nativeAdapter(f),ownerEvidenceCalls=[];
 const execution=create({adapter:native.adapter,referenceSet:f.referenceSet,edgeInput:f.edgeInput,readCurrent:()=>({activeBindings:structuredClone(f.edgeInput.activeBindings),resourceState:structuredClone(f.edgeInput.resourceState)}),readOwnerEvidence:input=>{ownerEvidenceCalls.push(input);return ownerEvidence(f);}});
 const planInput={selection:{pairId:'light',noise:'high'},strength:1,diagnostic:{targets:f.plan.operations.map(op=>({key:op.key,slice:op.slice}))}};
 return {f,native,execution,planInput,ownerEvidenceCalls};
}

test('mandatory LoRA norm entry rejects missing inputs before any native method',async()=>{
 const create=await factory(),set=await referenceSet(),f=await normEdgeFixture();
 for(const key of ['adapter','referenceSet','edgeInput','readCurrent','readOwnerEvidence']){
  const {adapter,calls}=probe(),options={adapter,referenceSet:set,edgeInput:f.edgeInput,readCurrent:()=>({activeBindings:structuredClone(f.edgeInput.activeBindings),resourceState:structuredClone(f.edgeInput.resourceState)}),readOwnerEvidence:()=>ownerEvidence(f)};
  await create(options);assert.deepEqual(calls,[]);delete options[key];await assert.rejects(async()=>create(options),`Missing ${key} must be rejected`);assert.deepEqual(calls,[]);
 }
});

test('unverified ReferenceSet cannot enter the mandatory LoRA dispatch path',async()=>{
 const create=await factory(),{adapter,calls}=probe();
 await assert.rejects(async()=>create({adapter,referenceSet:{catalogSha256:'a'.repeat(64)},edgeInput:{},readCurrent:()=>({})}));assert.deepEqual(calls,[]);
});

test('future numeric or publication receipts cannot authorize native planning',async()=>{
 const create=await factory();
 for(const mutate of [
  f=>f.edgeInput.evidence.push({evidenceId:'future:numeric',scope:f.numeric.scope,result:'pass'}),
  f=>f.edgeInput.evidence.push({evidenceId:'future:publication',scope:'norm:N-TRANSACTION',result:'pass'}),
  f=>f.edgeInput.referenceContext.delegations={'N-TRANSACTION':{checker:'snapshot.mjs',receiptRef:'future:publication',receipt:{state:'SNAPSHOT_PUBLISHED'}}},
  f=>f.edgeInput.referenceContext.phase='published'
 ]){
  const f=await normEdgeFixture(),{adapter,calls}=probe(),readCurrent=()=>({activeBindings:structuredClone(f.edgeInput.activeBindings),resourceState:structuredClone(f.edgeInput.resourceState)});
  const readOwnerEvidence=()=>ownerEvidence(f);
  await create({adapter,referenceSet:f.referenceSet,edgeInput:f.edgeInput,readCurrent,readOwnerEvidence});assert.deepEqual(calls,[],'A valid declaration needs no native probe');
  mutate(f);await assert.rejects(async()=>create({adapter,referenceSet:f.referenceSet,edgeInput:f.edgeInput,readCurrent,readOwnerEvidence}));assert.deepEqual(calls,[],'A future receipt is rejected before SDK plan, prepare or binding calls');
 }
});

test('owner comparison reader is mandatory without dispatching a native probe',async()=>{
 const create=await factory(),f=await normEdgeFixture(),{adapter,calls}=probe();
 await assert.rejects(async()=>create({adapter,referenceSet:f.referenceSet,edgeInput:f.edgeInput,readCurrent:()=>({activeBindings:structuredClone(f.edgeInput.activeBindings),resourceState:structuredClone(f.edgeInput.resourceState)})}));assert.deepEqual(calls,[]);
});

test('binding changes after declaration admission still block the first native plan call',async()=>{
 const create=await factory(),f=await normEdgeFixture(),{adapter,calls}=probe(),current={activeBindings:structuredClone(f.edgeInput.activeBindings),resourceState:structuredClone(f.edgeInput.resourceState)};
 const execution=await create({adapter,referenceSet:f.referenceSet,edgeInput:f.edgeInput,readCurrent:()=>structuredClone(current),readOwnerEvidence:()=>ownerEvidence(f)});assert.deepEqual(calls,[]);
 current.activeBindings.producer.valid=false;
 await assert.rejects(execution.plan({selection:{pairId:'light',noise:'high'},strength:1,diagnostic:{targets:f.plan.operations.map(op=>({key:op.key,slice:op.slice}))}},{target:f.planTarget}));assert.deepEqual(calls,[],'A stale binding must not advance native SDK revisions');
});

test('actual native validation followed by failed owner evidence never opens the commit gate',{timeout:5000},async()=>{
 const f=await executionFixture({evidenceResult:'fail'});
 try{
  let blocked;try{await f.manager.stageSnapshot(f.profile,f.bindings);}catch(error){blocked=error;}
  assert.equal(blocked?.code,'NORM_VALIDATED_BLOCKED');assert.equal(blocked.decision.validation.some(v=>v.scope==='norm:N-EVIDENCE'&&v.result==='fail'),true);
  assert.equal(count(f.native.calls,'nativeValidate'),1);assert.equal(f.f.nativeValidation.valid,true);
  assert.equal(f.ownerEvidenceCalls.length,1);assert.equal(count(f.native.calls,'nativeCommit'),0);
  assert.equal(f.execution.inspect().decisions.at(-1).phase,'validated');assert.equal(f.execution.inspect().decisions.at(-1).decision.readiness.state,'failed');
  assert.equal(f.manager.active,null);assert.equal(f.native.state.applied,false);
  assert.equal(count(f.native.calls,'nativeRollback'),1);assert.equal(count(f.native.calls,'release'),1);
  assert.equal(f.queue.inspect().groups.every(g=>g.activeInvocationId===null&&!g.quarantined),true);
 }finally{await f.dispose();}
});

test('owner comparison for another plan, source, strength, registry or reference cannot open commit',{timeout:5000},async()=>{
 for(const mutate of [e=>e.planId='0'.repeat(64),e=>e.sourceSha256='0'.repeat(64),e=>e.strength=0,e=>e.nativeRegistryHash='0'.repeat(64),e=>e.connectionRegistryHash='0'.repeat(64),e=>e.referenceSha256='0'.repeat(64)]){
  const f=await executionFixture({mutateOwnerEvidence:mutate});
  try{await assert.rejects(f.manager.stageSnapshot(f.profile,f.bindings));assert.equal(count(f.native.calls,'nativeValidate'),1);assert.equal(f.ownerEvidenceCalls.length,1);assert.equal(count(f.native.calls,'nativeCommit'),0);assert.equal(f.manager.active,null);}
  finally{await f.dispose();}
 }
});

test('mandatory LoRA path consumes actual validation before commit and actual publication afterward',{timeout:5000},async()=>{
 const f=await executionFixture();
 try{
  const token=await f.manager.stageSnapshot(f.profile,f.bindings);
  assert.equal(count(f.native.calls,'nativeValidate'),1);assert.equal(count(f.native.calls,'nativeCommit'),0);assert.equal(f.manager.active,null);
  const staged=f.execution.inspect();assert.equal(staged.phase,'validated');assert.equal(staged.publicationObserved,false);assert.equal(staged.decisions.some(d=>d.phase==='published'),false);
  assert.equal(staged.decisions.at(-1).decision.validation.find(v=>v.scope==='norm:N-TRANSACTION').pending,true);
  const result=await f.manager.publishSnapshot(token,{currentBindings:f.currentBindings});
  assert.equal(result.state,'SNAPSHOT_PUBLISHED');assert.equal(result.cleanupRequired,false);assert.equal(result.generationReady,false);
  assert.equal(count(f.native.calls,'nativeCommit'),1);assert.equal(count(f.native.calls,'nativeRollback'),0);
  assert.equal(count(f.native.calls,'finalize'),1);assert.equal(count(f.native.calls,'release'),1);
  assert.equal(f.manager.inspect().selectionCurrent,true);assert.equal(f.native.state.applied,true);
  const published=f.execution.inspect();assert.equal(published.phase,'published');assert.equal(published.publicationObserved,true);
  assert.equal(published.decisions.at(-1).decision.validation.find(v=>v.scope==='norm:N-TRANSACTION').result,'pass');
  assert.equal(published.decisions.every(d=>d.decision.referenceTrace.catalogSha256===f.f.referenceSet.catalogSha256),true);
  assert.equal(f.queue.inspect().invocations.every(i=>i.originalTerminal&&i.resourceReleased&&i.reusable),true);
 }finally{await f.dispose();}
});

test('postpublication norm failure preserves the published feed and recovery never recommits or rolls back',{timeout:5000},async()=>{
 const f=await executionFixture({staleAfterPublication:true});
 try{
  const token=await f.manager.stageSnapshot(f.profile,f.bindings),result=await f.manager.publishSnapshot(token,{currentBindings:f.currentBindings});
  assert.equal(result.state,'SNAPSHOT_PUBLISHED');assert.equal(result.cleanupRequired,true);
  assert.equal(f.manager.active.snapshotId,'snapshot:norm');assert.equal(f.manager.inspect().state,'RECOVERY_REQUIRED');assert.equal(f.manager.inspect().selectionCurrent,false);
  assert.equal(f.execution.inspect().publicationObserved,true);assert.equal(f.execution.inspect().decisions.at(-1).phase,'published');assert.equal(f.execution.inspect().decisions.at(-1).decision.readiness.state,'blocked');
  assert.equal(f.native.state.applied,true);assert.equal(count(f.native.calls,'nativeCommit'),1);assert.equal(count(f.native.calls,'nativeRollback'),0);
  await assert.rejects(f.manager.stageSnapshot(f.profile,{...f.bindings,snapshotId:'snapshot:norm:next',managerRevision:2}),{code:'RECOVERY_REQUIRED'});
  const before=f.native.calls.map(c=>c.name);f.current.activeBindings.producer.valid=true;await f.manager.recover();
  assert.deepEqual(f.native.calls.map(c=>c.name),before,'Recovery audits retained publication evidence without executing native work again');
  assert.equal(f.ownerEvidenceCalls.length,1,'Publication recovery reuses the comparison obtained after validation');
  assert.equal(f.manager.inspect().state,'SNAPSHOT_PUBLISHED');assert.equal(f.manager.inspect().selectionCurrent,true);
  assert.equal(f.execution.inspect().phase,'published');
 }finally{await f.dispose();}
});

test('a failed selected cohort cannot be rescued by retrying its cached checkpoint or changing owner comparison',{timeout:5000},async()=>{
 for(const throws of [false,true]){
  const f=await executionFixture({evidenceResult:'fail'}),step=f.bindings.steps[0],target={snapshotId:f.bindings.snapshotId,snapshotHash:'4'.repeat(64),managerSessionId:f.f.planTarget.managerSessionId,managerRevision:1,stepId:step.stepId,operationId:step.operationId,resourceBinding:structuredClone(step.resourceBinding),localRevisionBindings:structuredClone(step.localRevisionBindings)};
  const context={target,snapshotId:target.snapshotId,snapshotHash:target.snapshotHash,profileRef:`${f.profile.profileId}@${f.profile.profileVersion}`,managerSessionId:target.managerSessionId,managerRevision:1,stepId:step.stepId,operationId:step.operationId,scopeId:'diagnostic-projection',sourceRef:structuredClone(step.sourceRef),nativeBuild:step.nativeBuild,resourceBinding:structuredClone(step.resourceBinding),localRevisionBindings:structuredClone(step.localRevisionBindings),isCurrent:()=>true};
  let candidate;
  try{
   // Keep the original public candidate alive at the SDK commit gate. A real
   // coordinator would clean it up immediately after the initial rejection.
   f.comparison.throws=throws;({candidate}=await f.owner.prepare(context));
   await assert.rejects(f.owner.validate(candidate,context));assert.equal(count(f.native.calls,'nativeValidate'),1);assert.equal(f.f.nativeValidation.valid,true);assert.equal(f.ownerEvidenceCalls.length,1);
   f.comparison.result='pass';f.comparison.throws=false;
   await assert.rejects(f.owner.validate(candidate,context),{code:'NORM_EXECUTION_FAILED'});
   assert.equal(f.ownerEvidenceCalls.length,1,'A failed cohort must reject before reading replacement comparison evidence');
   await assert.rejects(f.owner.commit(candidate,context),{code:'NORM_EXECUTION_FAILED'});
   assert.equal(count(f.native.calls,'nativeCommit'),0);assert.equal(f.native.state.applied,false);
  }finally{if(candidate){await f.owner.rollback(candidate,context);await f.owner.release(candidate,context);}await f.dispose();}
 }
});

test('missing native plan target is rejected before describing or planning the native adapter',async()=>{
 const f=await unstartedExecution();let rejected;
 try{await f.execution.plan(f.planInput);}catch(error){rejected=error;}
 assert.equal(count(f.native.calls,'describeBinding'),0);assert.equal(count(f.native.calls,'plan'),0);assert.ok(rejected);
});

test('missing or malformed F32 validation references and undeclared gates reject before native preparation',async()=>{
 const valid=()=>({x:new Float32Array(5120),expected:new Float32Array(16),tolerance:{absolute:0,relative:0}});
 for(const invalid of [
  ()=>undefined,
  ()=>({...valid(),x:new Float32Array(5119)}),
  ()=>({...valid(),expected:new Float32Array(15)}),
  ()=>({...valid(),x:new Float64Array(5120)}),
  ()=>({...valid(),expected:new Float64Array(16)}),
  ()=>({...valid(),x:new Float32Array(5121).subarray(1)}),
  ()=>({...valid(),x:new Float32Array(5120).fill(Infinity)}),
  ()=>({...valid(),expected:new Float32Array(16).fill(NaN)}),
  ()=>({...valid(),tolerance:undefined}),
  ()=>({...valid(),tolerance:{absolute:.001,relative:0}})
 ]){
  const f=await unstartedExecution(),plan=await f.execution.plan(f.planInput,{target:f.f.planTarget}),queueCalls=[],queue={inspect:()=>({invocations:[]}),enqueue:(...args)=>{queueCalls.push(args);throw Error('Malformed reference must not enqueue native work');}};
  await assert.rejects(async()=>f.execution.createSnapshotOwner({plan,validation:invalid(),resourceBinding:f.f.resourceBinding,queue,requestPrefix:'invalid-reference'}));
  assert.equal(count(f.native.calls,'prepare'),0);assert.deepEqual(queueCalls,[]);
 }
});

test('finite reference bytes with the wrong expected-output SHA are rejected before native preparation',{timeout:5000},async()=>{
 const f=await unstartedExecution(),plan=await f.execution.plan(f.planInput,{target:f.f.planTarget});let owner;
 const queue=createInvocationQueue({resourceBindings:[{...f.f.resourceBinding,cancel:t=>owner.cancelInvocation(t),afterTerminal:(t,o)=>owner.afterInvocation(t,o),release:(t,o)=>owner.releaseInvocation(t,o)}]}),manager=createSnapshotManager({managerSessionId:f.f.planTarget.managerSessionId});
 try{
  let rejected;
  try{owner=await f.execution.createSnapshotOwner({plan,validation:{x:new Float32Array(5120),expected:new Float32Array(16).fill(1),tolerance:{absolute:0,relative:0}},resourceBinding:f.f.resourceBinding,queue,requestPrefix:'wrong-reference-payload'});const inputs=snapshotInputs(f.f,owner);await manager.stageSnapshot(inputs.profile,inputs.bindings);}catch(error){rejected=error;}
  assert.equal(count(f.native.calls,'prepare'),0);assert.equal(count(f.native.calls,'nativeValidate'),0);assert.equal(count(f.native.calls,'nativeCommit'),0);assert.equal(f.ownerEvidenceCalls.length,0);assert.ok(rejected);
 }finally{await manager.recover().catch(()=>{});await manager.dispose();await queue.drain();}
});
test('fresh normative bindings and resources are required immediately before opening the native commit gate',{timeout:5000},async()=>{
 for(const mutate of [
  f=>f.current.activeBindings.producer.valid=false,
  f=>f.current.activeBindings.producer.currentRevision++,
  f=>f.current.resourceState.status='unavailable',
  f=>f.current.resourceState.occupiedBytes=f.current.resourceState.budgetBytes
 ]){
  const f=await executionFixture();
  try{
   const token=await f.manager.stageSnapshot(f.profile,f.bindings);assert.equal(count(f.native.calls,'nativeValidate'),1);assert.equal(f.ownerEvidenceCalls.length,1);
   mutate(f);let blocked;try{await f.manager.publishSnapshot(token,{currentBindings:f.currentBindings});}catch(error){blocked=error;}
   assert.equal(count(f.native.calls,'nativeCommit'),0,'A stale norm binding or resource must not open the actual SDK commit gate');
   assert.equal(blocked?.code,'NORM_VALIDATED_BLOCKED');assert.equal(f.manager.active,null);assert.equal(f.manager.inspect().state,'FAILED');
   assert.equal(count(f.native.calls,'nativeValidate'),1);assert.equal(f.ownerEvidenceCalls.length,1,'Commit rechecks the retained actual evidence without rerunning validation or comparison');
   assert.equal(f.queue.inspect().invocations.every(r=>r.originalTerminal&&r.resourceReleased),true);
   assert.ok(f.execution.inspect().failure);assert.equal(f.execution.inspect().publicationObserved,false);
  }finally{await f.dispose();}
 }
});

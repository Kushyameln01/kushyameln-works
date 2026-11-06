// Control-only reference owners; the real evaluator, queue and snapshots execute.
import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../../docs/shared/ai-connection/management-host.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
const clone=structuredClone;
async function setup({steps,externalInputs,selections={},ownerOptions={}}={}){
 assert.equal(typeof module.createManagementHost,'function','Standalone management host must exist');
 const {createReferenceOwner,createReferenceDescriptor}=await import('../../docs/shared/ai-connection/reference-owner.mjs');
 const a=await createReferenceOwner({ownerId:'owner:a',...ownerOptions}),b=await createReferenceOwner({ownerId:'owner:b'});
 const tensor={dtype:'float32',layout:'BC',shape:[1,4],meaning:'reference:value',data:new Float32Array([1,2,3,4]),context:{inputId:'original:video',slotId:'source',sourceFrameIndices:[0,0,3],sourceFrameTimesSeconds:[0,0,.1]}};
 const descriptor=createReferenceDescriptor('copy',tensor).artifact;
 descriptor.provenance.producerRefs=[];
 descriptor.lineage={inputs:['original:left','original:right'],sourceFrames:[{inputId:'original:video',slotId:'source',indices:[0,0,3],timesSeconds:[0,0,.1]}]};
 descriptor.extensions={...descriptor.extensions,'future:optional':{schemaId:'future:optional',schemaVersion:'9',requiredForUse:false,data:{retain:['x','x'],unknown:42}}};
 const record={tensor,descriptor,sourceMetadata:{workflowSlot:'source',frameOrder:[0,0,3],optionalMask:new Uint8Array([1,0,1])}};
 const profile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'reference:standalone',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:['input'],steps:steps??[{stepId:'first',moduleId:'owner:a',operationId:'copy',inputBindings:[{portId:'input',artifactRef:'input'}],outputBindings:[{portId:'output',artifactRef:'first-output'}],adapterRefs:[],resourceGroupRefs:[]},{stepId:'second',moduleId:'owner:b',operationId:'copy',inputBindings:[{portId:'input',artifactRef:'first-output'}],outputBindings:[{portId:'output',artifactRef:'final-output'}],adapterRefs:[],resourceGroupRefs:[]}],requiredEvidenceScopes:[]};
 const host=module.createManagementHost({owners:{'owner:a':a.owner??a,'owner:b':b.owner??b},managerSessionId:'management:test'});
 await host.configure({profile,externalInputs:externalInputs??{input:record},selections});
 return {host,a,b,profile,record,descriptor,tensor};
}
// Removing graph validation would query owners for a structurally impossible DAG.
test('invalid graph is rejected before any owner capability query',async()=>{
 const f=await setup();try{
 const bad=clone(f.profile);bad.steps[0].inputBindings[0].artifactRef='final-output';
 await assert.rejects(()=>f.host.configure({profile:bad,externalInputs:{input:f.record}}),e=>e.code==='PIPELINE_INVALID'&&e.issues.some(i=>i.code==='PIPELINE_CYCLE'));
 assert.equal((await f.host.execute()).status,'COMPLETED');
 }finally{await f.host.dispose();}
});
// Collapsing multiple producer records or rewriting native context loses lineage.
test('whole pipeline owns successful results and preserves producer side data without native manager metadata',async()=>{
 const f=await setup();try{
 const events=[];f.host.subscribe(e=>events.push(e));
 const result=await f.host.execute({requestId:'normal-run'});
 assert.equal(result.status,'COMPLETED');assert.equal(result.steps.second.status,'COMPLETED');
 assert.deepEqual(result.artifacts['final-output'].tensor.data,new Float32Array([1,2,3,4]));
 assert.deepEqual(result.artifacts['final-output'].tensor.context,{inputId:'original:video',slotId:'source',sourceFrameIndices:[0,0,3],sourceFrameTimesSeconds:[0,0,.1]});
 assert.deepEqual(result.artifacts['final-output'].descriptor.lineage.inputs,['original:left','original:right']);
 assert.deepEqual(result.artifacts['final-output'].descriptor.extensions['future:optional'].data.retain,['x','x']);
 assert.deepEqual(result.artifacts['final-output'].sourceRecords[0].sourceRecords[0].sourceMetadata,{workflowSlot:'source',frameOrder:[0,0,3],optionalMask:new Uint8Array([1,0,1])});
 assert.equal(result.snapshots.length,2);assert.equal(result.snapshots.every(s=>s.executionScope.kind==='normal'),true);
 assert.equal(events.some(e=>e.type==='progress'),true);assert.equal(result.generationReady,false);
 result.artifacts['final-output'].tensor.data[0]=900;
 assert.equal(f.host.exportArtifacts()['final-output'].tensor.data[0],1);
 assert.equal(JSON.stringify(f.host.exportState()).includes('Float32Array'),false);
 }finally{await f.host.dispose();}
});
// Blocking one branch must not prevent independent output, and its dependant cannot run.
test('unsupported independent branch remains partial while available branch completes',async()=>{
 const f=await setup();try{
 const p=clone(f.profile);p.steps[1].inputBindings[0].artifactRef='input';p.steps[0].moduleId='absent:owner';p.steps.push({...clone(p.steps[1]),stepId:'dependent',inputBindings:[{portId:'input',artifactRef:'first-output'}],outputBindings:[{portId:'output',artifactRef:'dependent-output'}]});
 await f.host.configure({profile:p,externalInputs:{input:f.record}});
 const result=await f.host.execute();assert.equal(result.status,'PARTIAL');
 assert.equal(result.steps.first.status,'OWNER_UNCONFIRMED');assert.equal(result.steps.second.status,'COMPLETED');assert.equal(result.steps.dependent.status,'DEPENDENCY_BLOCKED');
 assert.equal(result.artifacts['final-output'].tensor.data[3],4);assert.equal(result.artifacts['first-output'],undefined);
 }finally{await f.host.dispose();}
});
// A false LoRA-like selection is a generic bypass, requiring no absent owner/assets.
test('disabled optional step bypasses explicitly and missing required external record stays unconfirmed',async()=>{
 const f=await setup();try{
 const p=clone(f.profile);p.steps[0].moduleId='missing:optional';p.steps[0].when={selection:'useOptional',equals:true};p.steps[0].bypass={output:'input'};
 await f.host.configure({profile:p,externalInputs:{input:f.record},selections:{useOptional:false}});
 let r=await f.host.execute();assert.equal(r.status,'COMPLETED');assert.equal(r.steps.first.status,'BYPASSED');assert.equal(r.steps.second.status,'COMPLETED');
 await f.host.configure({profile:p,externalInputs:{},selections:{useOptional:false}});
 r=await f.host.execute();assert.equal(r.status,'BLOCKED');assert.equal(r.steps.first.status,'INPUT_UNCONFIRMED');assert.equal(r.steps.second.status,'DEPENDENCY_BLOCKED');
 }finally{await f.host.dispose();}
});
// Cancel cannot settle before the owner original promise; the old token cannot stop retry.
test('target cancel retains original terminal barrier and old target cannot cancel the next run',async()=>{
 const f=await setup();try{
 f.a.controls.setBehavior({mode:'cancel-late'});
 const pending=f.host.execute({requestId:'old'});await f.a.controls.waitForInvocation();
 const target=f.host.inspect().activeTarget;let cancelled=false;
 const stopping=f.host.cancel(target).then(()=>{cancelled=true;});await new Promise(r=>setImmediate(r));assert.equal(cancelled,false);
 f.a.controls.continueInvocation();await stopping;assert.equal((await pending).status,'CANCELLED');
 f.a.controls.setBehavior({mode:'delay'});
 const next=f.host.execute({requestId:'new'});await f.a.controls.waitForInvocation();
 await assert.rejects(()=>f.host.cancel(target),{code:'TARGET_MISMATCH'});
 f.a.controls.continueInvocation();assert.equal((await next).status,'COMPLETED');
 }finally{await f.host.dispose();}
});
// Failure/retry preserves completed independent outputs and never claims failed output.
test('failure after partial completion can retry without losing independently owned results',async()=>{
 const f=await setup();try{
 f.b.controls.setBehavior({mode:'fail'});const r=await f.host.execute();
 assert.equal(r.status,'PARTIAL');assert.equal(r.steps.second.status,'FAILED');assert.equal(f.host.exportArtifacts()['first-output'].tensor.data[0],1);
 f.b.controls.setBehavior({mode:'success'});assert.equal((await f.host.execute()).status,'COMPLETED');
 }finally{await f.host.dispose();}
});
// A published normal snapshot is not an accepted output when owner cleanup fails.
test('release failure quarantines native reuse until explicit owner recovery',async()=>{
 const f=await setup();try{
 f.a.controls.failNextRelease();let r=await f.host.execute();
 assert.equal(r.status,'BLOCKED');assert.equal(r.steps.first.error.code,'RESOURCE_CLEANUP_FAILED');assert.equal(r.artifacts['first-output'],undefined);
 r=await f.host.execute();assert.equal(r.steps.first.status,'OWNER_RECOVERY_REQUIRED');
 await f.host.recover('owner:a');assert.equal((await f.host.execute()).status,'COMPLETED');
 }finally{await f.host.dispose();}
});
// Capability changes while running invalidate old support/results even if native succeeds late.
test('changed capabilities invalidate in-flight adoption and require a fresh owner binding',async()=>{
 const f=await setup();try{
 f.a.controls.setBehavior({mode:'cancel-late'});const pending=f.host.execute();await f.a.controls.waitForInvocation();
 f.a.controls.changeCapabilities({supportedTensor:{shape:[1,8]}});f.a.controls.continueInvocation();
 const old=await pending;assert.equal(old.artifacts['first-output'],undefined);assert.equal(old.steps.first.status,'FAILED');
 await f.host.reconfigureOwner('owner:a',{supportedTensor:{shape:[1,8]}});f.a.controls.setBehavior({mode:'success'});
 const now=await f.host.execute();assert.equal(now.status,'BLOCKED');assert.equal(now.steps.first.reasons.some(r=>r.code==='OWNER_SHAPE_UNSUPPORTED'),true);
 }finally{await f.host.dispose();}
});
// Workspace restoration is historical data, not live File capabilities or native sessions.
test('restored saved outputs remain inspectable while original File input requires reselection',async()=>{
 const f=await setup();try{
 await f.host.execute();const saved=f.host.exportState(),records=f.host.exportArtifacts();
 await f.host.restore({profile:saved.profile,selections:saved.selections,records,snapshotMetadata:saved.snapshots,unconfirmedExternalRefs:['input']});
 assert.equal(f.host.exportArtifacts()['final-output'].tensor.data[2],3);
 const r=await f.host.execute();assert.equal(r.status,'BLOCKED');assert.equal(r.steps.first.status,'INPUT_UNCONFIRMED');
 }finally{await f.host.dispose();}
});
// Unused optional assets must not become entry conditions for a bypassed branch.
test('bypass requires only explicitly mapped input ports and never the disabled asset',async()=>{
 const f=await setup();try{
 const p=clone(f.profile);p.externalArtifactRefs.push('optional-file');
 p.steps[0].moduleId='absent:lora';p.steps[0].inputBindings.push({portId:'lora',artifactRef:'optional-file'});
 p.steps[0].when={selection:'enabled',equals:true};p.steps[0].bypass={output:'input'};
 await f.host.configure({profile:p,externalInputs:{input:f.record},selections:{enabled:false}});
 const r=await f.host.execute();assert.equal(r.status,'COMPLETED');assert.equal(r.steps.first.status,'BYPASSED');assert.equal(r.steps.second.status,'COMPLETED');
 }finally{await f.host.dispose();}
});
// Configure must own the supplied File/tensor record before its first await.
test('configuration captures record bytes before an asynchronous caller can mutate them',async()=>{
 const f=await setup();try{
 const pending=f.host.configure({profile:f.profile,externalInputs:{input:f.record}});
 f.record.tensor.data[0]=99;await pending;
 assert.equal((await f.host.execute()).artifacts['final-output'].tensor.data[0],1);
 }finally{await f.host.dispose();}
});
// Multiple input bindings must remain separate into the owner's one snapshot.
test('named inputs preserve every independent record and publish matching named outputs',async()=>{
 const f=await setup();try{
 const p=clone(f.profile);p.externalArtifactRefs=['left','right'];p.steps=[{stepId:'named',moduleId:'owner:a',operationId:'copy',inputBindings:[{portId:'left',artifactRef:'left'},{portId:'right',artifactRef:'right'}],outputBindings:[{portId:'left',artifactRef:'left-result'},{portId:'right',artifactRef:'right-result'}],adapterRefs:[],resourceGroupRefs:[]}];
 const right=clone(f.record);right.descriptor.artifactId='right:input';right.tensor.data=new Float32Array([5,6,7,8]);
 await f.host.configure({profile:p,externalInputs:{left:f.record,right}});
 const r=await f.host.execute();assert.equal(r.status,'COMPLETED');assert.deepEqual(r.artifacts['left-result'].tensor.data,new Float32Array([1,2,3,4]));assert.deepEqual(r.artifacts['right-result'].tensor.data,new Float32Array([5,6,7,8]));
 assert.equal(r.snapshots[0].stepBindings[0].artifactRefs.length,2);assert.equal(r.artifacts['right-result'].sourceRecords.length,2);
 }finally{await f.host.dispose();}
});
// Durable tensor bytes do not need the original File grant once verified from package.
test('durable restored external tensors execute while snapshots remain historical until rerun',async()=>{
 const f=await setup();try{
 await f.host.execute();const saved=f.host.exportState(),records=f.host.exportArtifacts();
 assert.equal(records['final-output'].snapshot.executionScope.kind,'normal');
 await f.host.restore({profile:saved.profile,selections:saved.selections,records,snapshotMetadata:saved.snapshots});
 assert.equal(f.host.inspect().restoredSnapshots.length,2);assert.equal(f.host.inspect().snapshots.length,0);
 assert.equal((await f.host.execute()).status,'COMPLETED');
 }finally{await f.host.dispose();}
});
// A failed new run must not expose the preceding run's final output as current.
test('new run retires previous current results before a failing first dispatch',async()=>{
 const f=await setup();try{
 await f.host.execute();assert.equal(f.host.exportArtifacts()['final-output'].tensor.data[0],1);
 f.a.controls.setBehavior({mode:'fail'});assert.equal((await f.host.execute()).status,'BLOCKED');
 assert.equal(f.host.exportArtifacts()['final-output'],undefined);assert.equal(f.host.exportArtifacts()['first-output'],undefined);
 }finally{await f.host.dispose();}
});
// Independent branches sharing an owner must use its existing queue without losing one result.
test('two independent steps sharing one owner complete through the same normal queue',async()=>{
 const f=await setup();try{
 const p=clone(f.profile);p.steps[1].moduleId='owner:a';p.steps[1].inputBindings[0].artifactRef='input';
 await f.host.configure({profile:p,externalInputs:{input:f.record}});
 const r=await f.host.execute();assert.equal(r.status,'COMPLETED',JSON.stringify(r.steps));assert.equal(r.steps.first.status,'COMPLETED');assert.equal(r.steps.second.status,'COMPLETED');
 assert.equal(r.snapshots.length,2);assert.deepEqual(r.artifacts['final-output'].tensor.data,new Float32Array([1,2,3,4]));
 }finally{await f.host.dispose();}
});
// An unrelated delayed owner must not become an implicit dependency of a ready branch.
test('a ready branch reaches its downstream output while another owner remains delayed',async()=>{
 const f=await setup();let release;try{
 const p=clone(f.profile);p.steps[1].inputBindings[0].artifactRef='input';p.steps.push({...clone(p.steps[1]),stepId:'third',inputBindings:[{portId:'input',artifactRef:'final-output'}],outputBindings:[{portId:'output',artifactRef:'third-output'}]});
 await f.host.configure({profile:p,externalInputs:{input:f.record}});f.a.controls.setBehavior({mode:'cancel-late'});
 let complete;const completed=new Promise(r=>complete=r);f.host.subscribe(e=>{if(e.type==='step'&&e.stepId==='third'&&e.status==='COMPLETED')complete(true);});
 const running=f.host.execute();release=()=>f.a.controls.continueInvocation();await f.a.controls.waitForInvocation();
 const ready=await Promise.race([completed,new Promise(r=>setTimeout(()=>r(false),100))]);
 release();release=null;await running;assert.equal(ready,true,'Independent third step must complete before delayed first owner terminates');
 }finally{release?.();await f.host.dispose();}
});
// Geometry binding must precede owner admission, and formula agreement is not owner support.
test('shared workflow shape binds actual dispatch without overriding owner unsupported reasons',async()=>{
 const f=await setup();try{
 const {createReferenceDescriptor}=await import('../../docs/shared/ai-connection/reference-owner.mjs');
 const p=clone(f.profile);p.steps=[p.steps[0]];p.steps[0].inputBindings[0].workflowRequirementId='context:0:0.rgb';
 p.workflowShapeRequest={schemaVersion:1,ruleId:'bernini-ca69274-b5a4321-wan21-shapes-v1',target:{batch:1,frames:81,height:480,width:832},refMaxSize:848,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',temporalRule:'first-then-groups-floor',concatOrder:'target-first'},media:{sourceVideo:{state:'absent'},referenceVideo:{state:'absent'},slots:[{slotIndex:0,wired:{state:'present',rgb:{frames:1,height:16,width:32}},editor:{state:'absent'}}]}};
 await f.host.configure({profile:p,externalInputs:{input:f.record}});
 let r=await f.host.execute();assert.equal(r.status,'BLOCKED');assert.equal(r.steps.first.reasons[0].code,'WORKFLOW_BINDING_CONTRACT_MISMATCH');
 const tensor={dtype:'float32',layout:'NCTHW',shape:[1,3,1,16,32],meaning:'reference:value',data:new Float32Array(1536)};
 const record={tensor,descriptor:createReferenceDescriptor('copy',tensor).artifact};
 await f.host.configure({profile:p,externalInputs:{input:record}});r=await f.host.execute();assert.equal(r.status,'COMPLETED');
 assert.deepEqual(f.host.exportState().profile.workflowShapeRequest.target,{batch:1,frames:81,height:480,width:832});
 await f.host.reconfigureOwner('owner:a',{supportedTensor:{shape:[1,3,1,32,32]}});
 r=await f.host.execute();assert.equal(r.status,'BLOCKED');assert.equal(r.steps.first.reasons.some(r=>r.code==='OWNER_SHAPE_UNSUPPORTED'),true);
 }finally{await f.host.dispose();}
});
// An absent optional workflow supply is not a mandatory owner/File requirement.
test('absent mapped workflow input is skipped before requiring a record or owner',async()=>{
 const f=await setup();try{
 const p=clone(f.profile);p.steps=[p.steps[0]];p.steps[0].moduleId='absent:owner';p.steps[0].inputBindings[0].workflowRequirementId='source.rgb';
 p.workflowShapeRequest={ruleId:'bernini-ca69274-b5a4321-wan21-shapes-v1',target:{batch:1,frames:81,height:480,width:832},geometry:{dtype:'float32',rgbChannels:3},media:{sourceVideo:{state:'absent'},referenceVideo:{state:'absent'},slots:[]}};
 await f.host.configure({profile:p,externalInputs:{}});const r=await f.host.execute();assert.equal(r.status,'COMPLETED');assert.equal(r.steps.first.status,'SKIPPED');
 }finally{await f.host.dispose();}
});

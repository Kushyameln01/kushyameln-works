import test from 'node:test';
import assert from 'node:assert/strict';

const api=await import('../../docs/shared/ai-connection/adapters/workflow-normal-requests.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
const bridge=args=>{
  assert.equal(typeof api.queryWorkflowRequirements,'function','workflow requirements query bridge is required');
  return api.queryWorkflowRequirements(args);
};
const requirement=(requirementId,extra={})=>({requirementId,role:'context-latent',state:'known',shape:[1,16,1,2,4],dtype:'float32',axes:['N','C','T','H','W'],meaning:null,normalization:null,provenance:{},issues:[],...extra});
const descriptor=()=>({operationId:'normalizeRawMean',artifact:{artifactId:'input:mean',kind:'tensor',tensor:{nativeMeaning:'wan21-raw-posterior-mean:v1'},semantics:{schemaId:'wan21:latent',schemaVersion:'1',spaceId:'wan21-raw-posterior-mean:v1',normalization:'none'},native:{schemaId:'owner:mean',schemaVersion:'1',metadata:{meaning:'wan21-raw-posterior-mean:v1'}},extensions:{'future:opaque':{requiredForUse:false,data:{keep:['a','a']}}}},modelRefs:['model:actual'],targetRefs:['HIGH']});

// Catches treating computable geometry as owner support or rewriting its refusal.
test('known workflow geometry reaches owner and retains its unsupported response',async()=>{
  const d=descriptor(),req=requirement('target:latent',{shape:[1,16,21,60,104]}),reason={code:'OWNER_SHAPE_UNSUPPORTED',fieldPath:'/artifact/tensor/shape',reason:'Actual owner has no matching contract'},ownerResponse={status:'UNSUPPORTED',capabilityRef:null,reasons:[reason],observation:{sourceRef:{repository:'owner:actual',commit:'a'.repeat(40)}},future:{keep:true}};
  let calls=0;
  const r=await bridge({shapePlan:{requirements:[req]},bindings:[{requirementId:req.requirementId,descriptor:d}],queryOwner:async got=>{calls++;assert.deepEqual(got.artifact.tensor.shape,[1,16,21,60,104]);assert.deepEqual(got.artifact.tensor.axes,['N','C','T','H','W']);assert.equal(got.artifact.tensor.dtype,'float32');return ownerResponse;}});
  assert.equal(calls,1);
  assert.equal(r.requirements[0].status,'UNSUPPORTED');
  assert.equal(r.requirements[0].ownerResponse,ownerResponse);
  assert.equal(r.requirements[0].reasons,ownerResponse.reasons);
  assert.equal(d.artifact.tensor.shape,undefined);
  assert.equal(r.generationReady,false);
});

// Catches a global unknown/absent gate blocking independent known requirements.
test('unknown requirements stay dependent while absent optional input is not required',async()=>{
  const reason={code:'MEDIA_DIMENSIONS_UNKNOWN',fieldPath:'/sourceVideo/rgb/height',affects:['source:latent'],reason:'Supplied dimensions are unresolved'},known=requirement('slot:rect:latent'),unknown=requirement('source:latent',{state:'unknown',shape:null,issues:[reason]}),absent=requirement('slot:unused',{state:'absent',shape:null});
  const ownerResponse={status:'SUPPORTED',capabilityRef:'owner:rect',reasons:[],consumerPort:{profileRef:'owner:actual-rect'},observation:{ownerId:'owner:actual'}};
  let calls=0;
  const r=await bridge({shapePlan:{requirements:[known,unknown,absent]},bindings:[{requirementId:known.requirementId,descriptor:descriptor()},{requirementId:unknown.requirementId,descriptor:descriptor()}],queryOwner:async()=>{calls++;return ownerResponse;}});
  assert.equal(calls,1);
  assert.deepEqual(r.requirements.map(x=>x.status),['SUPPORTED','UNVERIFIED','NOT_REQUIRED']);
  assert.equal(r.requirements[0].ownerResponse,ownerResponse);
  assert.equal(r.requirements[1].reasons[0],reason);
  assert.equal(r.requirements[2].required,false);
});

// Catches cloning payloads, erasing future metadata or replacing explicit profiles.
test('metadata projection preserves opaque attachments and explicit caller meaning',async()=>{
  const d=descriptor(),attachment=new Uint8Array(1024*1024),extension={requiredForUse:false,payload:attachment};
  d.artifact.profileRef='caller:explicit-profile';
  Object.assign(d.artifact.tensor,{shape:[1,16,1,2,4],dtype:'float32',axes:['N','C','T','H','W']});
  d.artifact.extensions['future:binary']=extension;
  const r=await bridge({shapePlan:{requirements:[requirement('rect:latent')]},bindings:[{requirementId:'rect:latent',descriptor:d}],queryOwner:async got=>{
    assert.equal(got.artifact.profileRef,'caller:explicit-profile');
    assert.equal(got.artifact.extensions,d.artifact.extensions);
    assert.equal(got.artifact.extensions['future:binary'].payload,attachment);
    assert.equal(got.artifact.native,d.artifact.native);
    assert.equal(got.artifact.semantics,d.artifact.semantics);
    assert.equal(got.artifact.tensor.nativeMeaning,'wan21-raw-posterior-mean:v1');
    assert.equal(got.artifact.tensor.shape,d.artifact.tensor.shape);
    assert.equal(got.artifact.tensor.axes,d.artifact.tensor.axes);
    assert.equal(got.modelRefs,d.modelRefs);
    assert.equal(got.targetRefs,d.targetRefs);
    return {status:'UNVERIFIED',capabilityRef:null,reasons:[{code:'OWNER_PROFILE_UNKNOWN',fieldPath:'/artifact/profileRef'}]};
  }});
  assert.equal(r.requirements[0].status,'UNVERIFIED');
});

// Catches silently replacing explicit native semantics to make a workflow query fit.
test('contradictory explicit plan semantics reject input without claiming owner support',async()=>{
  for(const [contract,fieldPath,observed] of [
    [{meaning:'owner:different-meaning'},'/artifact/tensor/nativeMeaning','wan21-raw-posterior-mean:v1'],
    [{normalization:'owner:different-normalization'},'/artifact/semantics/normalization','none']
  ]){
    const d=descriptor(),r=requirement('rect:latent',contract);
    let calls=0;
    const result=await bridge({shapePlan:{requirements:[r]},bindings:[{requirementId:r.requirementId,descriptor:d}],queryOwner:async()=>{calls++;return {status:'SUPPORTED',reasons:[]};}});
    const entry=result.requirements[0];
    assert.equal(calls,0);
    assert.equal(entry.status,'NOT_QUERIED');
    assert.equal(entry.ownerResponse,null);
    assert.deepEqual(entry.inputAdmission,{state:'REJECTED',code:'WORKFLOW_BINDING_CONTRACT_MISMATCH',fieldPath,expected:Object.values(contract)[0],observed});
    assert.equal(entry.descriptor,d);
    assert.equal(result.shapePlan.requirements[0],r);
  }
});

// Catches replacing a real descriptor's geometry with the plan's requested geometry.
test('explicit shape dtype or axes contradiction is rejected instead of overwritten',async()=>{
  for(const [field,observed,expected] of [
    ['shape',[1,16,1,2,2],[1,16,1,2,4]],
    ['dtype','float16','float32'],
    ['axes',['N','C','H','T','W'],['N','C','T','H','W']]
  ]){
    const d=descriptor(),req=requirement('rect:latent');
    d.artifact.tensor[field]=observed;
    let calls=0;
    const r=await bridge({shapePlan:{requirements:[req]},bindings:[{requirementId:req.requirementId,descriptor:d}],queryOwner:async()=>{calls++;return {status:'SUPPORTED',reasons:[]};}});
    assert.equal(calls,0);
    assert.equal(r.requirements[0].status,'NOT_QUERIED');
    assert.equal(r.requirements[0].ownerResponse,null);
    assert.deepEqual(r.requirements[0].inputAdmission,{state:'REJECTED',code:'WORKFLOW_BINDING_CONTRACT_MISMATCH',fieldPath:'/artifact/tensor/'+field,expected,observed});
    assert.equal(d.artifact.tensor[field],observed);
  }
});

// Catches trusting a known label while a required shape or type field is unresolved.
test('incomplete geometry cannot reach an owner even if its state says known',async()=>{
  for(const fields of [{shape:null},{shape:[1,16,,2,4]},{dtype:null},{axes:null}]){
    let calls=0;
    const req=requirement('rect:latent',fields),r=await bridge({shapePlan:{requirements:[req]},bindings:[{requirementId:req.requirementId,descriptor:descriptor()}],queryOwner:async()=>{calls++;return {status:'SUPPORTED',reasons:[]};}});
    assert.equal(calls,0);
    assert.equal(r.requirements[0].status,'UNVERIFIED');
  }
});

// Catches comparing independently serialized normalization contracts by object identity.
test('JSON normalization contracts are compared by value without replacing the binding',async()=>{
  const d=descriptor(),normalization={owner:'declared',parameters:{scale:[1,2],enabled:true}};
  d.artifact.semantics.normalization=normalization;
  const req=requirement('rect:latent',{normalization:{parameters:{enabled:true,scale:[1,2]},owner:'declared'}}),ownerResponse={status:'SUPPORTED',capabilityRef:'owner:json-normalization',reasons:[]};
  let calls=0;
  const run=()=>bridge({shapePlan:{requirements:[req]},bindings:[{requirementId:req.requirementId,descriptor:d}],queryOwner:async got=>{calls++;assert.equal(got.artifact.semantics.normalization,normalization);return ownerResponse;}});
  const accepted=await run();
  assert.equal(calls,1);
  assert.equal(accepted.requirements[0].ownerResponse,ownerResponse);
  req.normalization.parameters.scale[1]=3;
  const rejected=await run();
  assert.equal(calls,1);
  assert.equal(rejected.requirements[0].status,'NOT_QUERIED');
  assert.equal(rejected.requirements[0].inputAdmission.fieldPath,'/artifact/semantics/normalization');
  assert.deepEqual(rejected.requirements[0].inputAdmission.expected,{parameters:{enabled:true,scale:[1,3]},owner:'declared'});
  assert.deepEqual(rejected.requirements[0].inputAdmission.observed,{owner:'declared',parameters:{scale:[1,2],enabled:true}});
});

// Real helper integration: logical geometry never replaces the owner's support result.
test('shared workflow plan queries Rect and target81 independently through the bridge',async()=>{
  const {deriveWorkflowShapes,BERNINI_WORKFLOW_RULE_ID}=await import('../../docs/shared/ai-connection/workflow-shapes.mjs');
  const shapePlan=deriveWorkflowShapes({schemaVersion:1,ruleId:BERNINI_WORKFLOW_RULE_ID,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',temporalRule:'first-then-groups-floor',concatOrder:'target-first'},target:{batch:1,frames:81,height:480,width:832},refMaxSize:848,media:{sourceVideo:{state:'absent'},referenceVideo:{state:'absent'},slots:[{slotIndex:0,wired:{state:'present',rgb:{frames:1,height:16,width:32},inputId:'controlled-rect',sourceFrameIndices:[0]},editor:{state:'absent'}}]}});
  const rect=descriptor(),target=descriptor();
  rect.artifact.artifactId='input:controlled-rect';target.artifact.artifactId='input:target81';
  const ownerSource={repository:'fixture:actual-owner-response',commit:'b'.repeat(40)},responses={
    'input:controlled-rect':{status:'SUPPORTED',capabilityRef:'fixture:rect-supported',reasons:[],ownerSource},
    'input:target81':{status:'UNSUPPORTED',capabilityRef:null,reasons:[{code:'OWNER_SHAPE_UNSUPPORTED',fieldPath:'/artifact/tensor/shape',reason:'Configured owner does not support this requested shape'}],ownerSource}
  },received=[];
  const r=await bridge({shapePlan,bindings:[{requirementId:'context:0:0.latent',descriptor:rect},{requirementId:'target.latent',descriptor:target}],queryOwner:async d=>{received.push(d);return responses[d.artifact.artifactId];}});
  assert.equal(received.length,2);
  assert.deepEqual(received.find(d=>d.artifact.artifactId==='input:controlled-rect').artifact.tensor.shape,[1,16,1,2,4]);
  assert.deepEqual(received.find(d=>d.artifact.artifactId==='input:target81').artifact.tensor.shape,[1,16,21,60,104]);
  const rectResult=r.requirements.find(x=>x.requirementId==='context:0:0.latent'),targetResult=r.requirements.find(x=>x.requirementId==='target.latent');
  assert.equal(rectResult.status,'SUPPORTED');assert.equal(rectResult.ownerResponse,responses['input:controlled-rect']);
  assert.equal(targetResult.status,'UNSUPPORTED');assert.equal(targetResult.reasons,responses['input:target81'].reasons);assert.equal(targetResult.ownerResponse.ownerSource,ownerSource);
  assert.equal(r.requirements.find(x=>x.requirementId==='source.latent').status,'NOT_REQUIRED');
});

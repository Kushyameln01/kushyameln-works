// Finite graph compiler tests: expected graph identities are hand-derived.
import test from 'node:test';
import assert from 'node:assert/strict';
const {compilePipeline,resolvePipelineWorkflowRequest}=await import('../../docs/shared/ai-connection/pipeline.mjs').catch(error=>error.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(error));

const copy=structuredClone;
function step(stepId,inputBindings,outputBindings,extra={}){
  return {stepId,moduleId:'reference:'+stepId,operationId:'transform',inputBindings,outputBindings,adapterRefs:[],resourceGroupRefs:[],...extra};
}
function profile(steps,externalArtifactRefs=['source:rgb']){
  return {contractVersion:'works-module-contract/1.0-draft.1',profileId:'standalone:finite-test',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs,steps,requiredEvidenceScopes:[]};
}
function artifact(id){return {artifactId:id,provenance:{producerRefs:[{role:'producer',value:'first'},{role:'producer',value:'second'}]},lineage:{sourceFrames:[{indices:[8,2,8],timesSeconds:[0.8,0.2,0.8]}]},extensions:{'future:optional':{keep:['x','x']}}};}
const record=ref=>({descriptor:artifact(ref),tensor:{dtype:'float32',shape:[1],data:new Float32Array([7])}});
function compile(p,options){assert.equal(typeof compilePipeline,'function','New finite pipeline compiler must be implemented');return compilePipeline(p,options);}
function issue(p,code,options){assert.throws(()=>compile(p,options),error=>error.code==='PIPELINE_INVALID'&&error.issues.some(entry=>entry.code===code));}

// A consumer-first declaration must resolve by identity, not declaration order.
test('resolves forward references with stable topological layers and exact port sources',()=>{
  const p=profile([
    step('save',[{portId:'rgb',artifactRef:'decoded:rgb'}],[{portId:'file',artifactRef:'saved:file'}]),
    step('encode',[{portId:'rgb',artifactRef:'source:rgb'}],[{portId:'mean',artifactRef:'encoded:mean'}]),
    step('decode',[{portId:'mean',artifactRef:'encoded:mean'}],[{portId:'rgb',artifactRef:'decoded:rgb'}]),
    step('preview',[{portId:'rgb',artifactRef:'source:rgb'}],[{portId:'preview',artifactRef:'preview:rgb'}]),
  ]);
  const plan=compile(p,{externalInputs:{'source:rgb':record('source:rgb')}});
  assert.deepEqual(plan.topologicalOrder,['encode','preview','decode','save']);
  assert.deepEqual(plan.layers,[['encode','preview'],['decode'],['save']]);
  assert.deepEqual(plan.steps.map(s=>[s.stepId,s.dependencies]),[['encode',[]],['preview',[]],['decode',['encode']],['save',['decode']]]);
  assert.deepEqual(plan.steps[2].inputBindings[0].source,{kind:'step',artifactRef:'encoded:mean',stepId:'encode',portId:'mean'});
  assert.deepEqual(plan.steps[0].inputBindings[0].source,{kind:'external',artifactRef:'source:rgb',state:'AVAILABLE'});
  assert.deepEqual(plan.finalArtifactRefs,['saved:file','preview:rgb']);
  assert.deepEqual(p.steps.map(s=>s.stepId),['save','encode','decode','preview']);
});

// A missing declared File is a runtime input question; dangling IDs are invalid.
test('keeps an unconfirmed branch without blocking an independent available branch',()=>{
  const p=profile([
    step('needs-file',[{portId:'source',artifactRef:'file:pending'}],[{portId:'out',artifactRef:'pending:out'}]),
    step('independent',[{portId:'source',artifactRef:'source:rgb'}],[{portId:'out',artifactRef:'ready:out'}]),
  ],['file:pending','source:rgb']);
  const plan=compile(p,{externalInputs:{'file:pending':{descriptor:artifact('file:pending')},'source:rgb':record('source:rgb')}});
  assert.equal(plan.externalBindings['file:pending'].state,'INPUT_UNCONFIRMED');
  assert.equal(plan.externalBindings['source:rgb'].state,'AVAILABLE');
  assert.deepEqual(plan.layers,[['needs-file','independent']]);
  assert.equal(plan.steps[0].inputBindings[0].source.state,'INPUT_UNCONFIRMED');
  assert.equal(plan.steps[1].inputBindings[0].source.state,'AVAILABLE');
  const broken=copy(p);broken.steps[0].inputBindings[0].artifactRef='undeclared:file';
  issue(broken,'UNRESOLVED_ARTIFACT');
});

// Multiple provenance producers describe one tensor; they are not graph writers.
test('preserves multi-producer provenance, frame order and optional extensions without freezing caller tensors',()=>{
  const input=record('source:rgb'),plan=compile(profile([step('one',[{portId:'in',artifactRef:'source:rgb'}],[{portId:'out',artifactRef:'done'}])]),{externalInputs:{'source:rgb':input}});
  assert.deepEqual(plan.externalBindings['source:rgb'].descriptor.provenance.producerRefs,[{role:'producer',value:'first'},{role:'producer',value:'second'}]);
  assert.deepEqual(plan.externalBindings['source:rgb'].descriptor.lineage.sourceFrames[0],{indices:[8,2,8],timesSeconds:[0.8,0.2,0.8]});
  assert.deepEqual(plan.externalBindings['source:rgb'].descriptor.extensions['future:optional'].keep,['x','x']);
  input.tensor.data[0]=99;input.descriptor.lineage.sourceFrames[0].indices[0]=99;
  assert.equal(plan.externalBindings['source:rgb'].descriptor.lineage.sourceFrames[0].indices[0],8);
  assert.equal(Object.hasOwn(plan.externalBindings['source:rgb'],'tensor'),false);
  assert.equal(Object.isFrozen(plan),true);assert.equal(Object.isFrozen(plan.steps[0].inputBindings[0].source),true);
  assert.throws(()=>plan.layers[0].push('foreign'),TypeError);
});

// Disabled optional transforms need an explicit port-level passthrough.
test('generic selection conditions preserve bypass mapping and distinguish absent selection',()=>{
  const p=profile([
    step('optional',[{portId:'base',artifactRef:'source:rgb'}],[{portId:'selected',artifactRef:'selected:rgb'}],{when:{selection:'useOptional',equals:true},bypass:{selected:'base'}}),
    step('consume',[{portId:'source',artifactRef:'selected:rgb'}],[{portId:'out',artifactRef:'done'}]),
  ]);
  const off=compile(p,{selections:{useOptional:false}}),on=compile(p,{selections:{useOptional:true}}),unknown=compile(p);
  assert.equal(off.steps[0].condition.state,'BYPASSED');
  assert.deepEqual(off.steps[0].bypassBindings,[{outputPortId:'selected',inputPortId:'base'}]);
  assert.equal(on.steps[0].condition.state,'ACTIVE');
  assert.equal(unknown.steps[0].condition.state,'SELECTION_UNCONFIRMED');
  assert.deepEqual(off.steps[1].dependencies,['optional']);
  const skipped=copy(p);delete skipped.steps[0].bypass;
  assert.equal(compile(skipped,{selections:{useOptional:false}}).steps[0].condition.state,'SKIPPED');
});

// Removing checks below could dispatch malformed graphs before owner capability.
test('rejects self-cycles and multi-step cycles',()=>{
  issue(profile([step('self',[{portId:'in',artifactRef:'self:out'}],[{portId:'out',artifactRef:'self:out'}])],[]),'PIPELINE_CYCLE');
  issue(profile([step('A',[{portId:'in',artifactRef:'B:out'}],[{portId:'out',artifactRef:'A:out'}]),step('B',[{portId:'in',artifactRef:'A:out'}],[{portId:'out',artifactRef:'B:out'}])],[]),'PIPELINE_CYCLE');
});
test('rejects duplicate graph writers and external/output collisions',()=>{
  issue(profile([step('A',[],[{portId:'out',artifactRef:'shared'}]),step('B',[],[{portId:'out',artifactRef:'shared'}])]),'MULTIPLE_PRODUCERS');
  issue(profile([step('A',[],[{portId:'out',artifactRef:'source:rgb'}])]),'MULTIPLE_PRODUCERS');
  issue(profile([step('A',[],[])],['same','same']),'DUPLICATE_ARTIFACT');
});
test('rejects duplicate or missing step and port identities',()=>{
  issue(profile([step('same',[],[]),step('same',[],[])]),'DUPLICATE_STEP');
  const missing=profile([step('one',[],[])]);delete missing.steps[0].stepId;issue(missing,'SCHEMA_REQUIRED');
  issue(profile([step('one',[{portId:'in',artifactRef:'source:rgb'},{portId:'in',artifactRef:'source:rgb'}],[])]),'DUPLICATE_PORT');
  issue(profile([step('one',[],[{portId:'out',artifactRef:'first'},{portId:'out',artifactRef:'second'}])]),'DUPLICATE_PORT');
  issue(profile([step('one',[{artifactRef:'source:rgb'}],[])]),'SCHEMA_REQUIRED');
});
test('rejects malformed conditions and implicit or partial bypass mappings',()=>{
  const base=profile([step('one',[{portId:'in',artifactRef:'source:rgb'}],[{portId:'out',artifactRef:'done'}])]);
  for(const when of [{selection:'x'},{selection:'',equals:true},{selection:'x',equals:[]}]){const p=copy(base);p.steps[0].when=when;issue(p,'INVALID_CONDITION');}
  for(const bypass of [{out:'absent'},{other:'in'},{}]){const p=copy(base);p.steps[0].when={selection:'x',equals:true};p.steps[0].bypass=bypass;issue(p,'INVALID_BYPASS');}
  const unconditional=copy(base);unconditional.steps[0].bypass={out:'in'};issue(unconditional,'INVALID_BYPASS');
});
test('explicit final refs must resolve exactly and remain ordered',()=>{
  const p=profile([step('one',[{portId:'in',artifactRef:'source:rgb'}],[{portId:'out',artifactRef:'done'}])]);p.finalArtifactRefs=['done','source:rgb'];
  assert.deepEqual(compile(p).finalArtifactRefs,['done','source:rgb']);
  p.finalArtifactRefs=['unknown'];issue(p,'INVALID_FINAL_REF');
  p.finalArtifactRefs=['done','done'];issue(p,'INVALID_FINAL_REF');
});
test('unknown live input names are rejected rather than becoming undeclared graph sources',()=>{
  issue(profile([step('one',[],[])]),'UNDECLARED_EXTERNAL_INPUT',{externalInputs:{foreign:record('foreign')}});
});
test('retains schema enforcement and diagnostic profile evidence fields',()=>{
  const p=profile([step('one',[],[])]);p.requiredEvidenceScopes=['existing:diagnostic'];
  assert.deepEqual(compile(p).profile.requiredEvidenceScopes,['existing:diagnostic']);
  p.contractVersion='unknown-contract';issue(p,'SCHEMA_CONST');
});

// Binary masks/extensions remain caller-independent, rather than being stripped
// or treated as native tensor payloads by the structural plan.
test('owns binary descriptor metadata without mutating or sharing caller buffers',()=>{
  const input=record('source:rgb');input.descriptor.extensions['future:optional'].bytes=new Uint8Array([4,2,9]);input.descriptor.native={metadata:{mask:new Uint16Array([8,5]),opaque:new Uint8Array([6,7]).buffer}};
  const plan=compile(profile([step('one',[{portId:'in',artifactRef:'source:rgb'}],[])]),{externalInputs:{'source:rgb':input}}),descriptor=plan.externalBindings['source:rgb'].descriptor;
  input.descriptor.extensions['future:optional'].bytes[0]=99;input.descriptor.native.metadata.mask[0]=99;new Uint8Array(input.descriptor.native.metadata.opaque)[0]=99;
  assert.deepEqual(descriptor.extensions['future:optional'].bytes,new Uint8Array([4,2,9]));
  assert.deepEqual(descriptor.native.metadata.mask,new Uint16Array([8,5]));
  assert.deepEqual(new Uint8Array(descriptor.native.metadata.opaque),new Uint8Array([6,7]));
  descriptor.extensions['future:optional'].bytes[1]=88;
  assert.equal(input.descriptor.extensions['future:optional'].bytes[1],2);
});

const workflowRequest=()=>({ruleId:'bernini-ca69274-b5a4321-wan21-shapes-v1',target:{batch:1,frames:5,height:16,width:32},refMaxSize:848,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',temporalRule:'first-then-groups-floor',concatOrder:'target-first'},media:{sourceVideo:{state:'unknown'},referenceVideo:{state:'absent'},slots:[]}});
function workflowProfile(){const p=profile([step('owner',[{portId:'image',artifactRef:'source:rgb',workflowRequirementId:'target.rgb'}],[{portId:'out',artifactRef:'done'}])]);p.workflowShapeRequest=workflowRequest();return p;}
function bindWorkflow(plan,descriptor,selectedStep=plan.steps[0]){assert.equal(typeof resolvePipelineWorkflowRequest,'function','Shared geometry-to-operation binding must be implemented');return resolvePipelineWorkflowRequest({shapePlan:plan.workflowShapePlan,step:selectedStep,descriptor});}

// Literal expected geometry comes from 5 RGB frames, not a diagnostic profile ID.
test('derives workflow geometry once and binds it into the actual scalar operation request',()=>{
  const p=workflowProfile(),plan=compile(p),descriptor={operationId:'transform',modelRefs:['caller:model'],artifact:{tensor:{nativeMeaning:'rgb'},semantics:{normalization:'none'},extensions:{keep:{mask:new Uint8Array([1,0])}}}};
  assert.deepEqual(plan.workflowShapePlan.target.requestedRgbShape,[1,3,5,16,32]);
  assert.deepEqual(plan.workflowShapePlan.target.initialLatentShape,[1,16,2,2,4]);
  const result=bindWorkflow(plan,descriptor);
  assert.equal(result.status,'BOUND');assert.equal(result.descriptor.operationId,'transform');assert.deepEqual(result.descriptor.modelRefs,['caller:model']);
  assert.deepEqual(result.descriptor.artifact.tensor,{nativeMeaning:'rgb',shape:[1,3,5,16,32],dtype:'float32',axes:['N','C','T','H','W']});
  assert.deepEqual(result.descriptor.artifact.extensions.keep.mask,new Uint8Array([1,0]));
  assert.equal(Object.hasOwn(descriptor.artifact.tensor,'shape'),false);
});
test('workflow binding rejects an explicit shape conflict before owner query and preserves unknown geometry scope',()=>{
  const plan=compile(workflowProfile()),conflict=bindWorkflow(plan,{operationId:'transform',artifact:{tensor:{shape:[1,3,81,480,832],dtype:'float32',axes:['N','C','T','H','W']}}});
  assert.equal(conflict.status,'BLOCKED');assert.equal(conflict.reasons[0].code,'WORKFLOW_BINDING_CONTRACT_MISMATCH');assert.equal(conflict.reasons[0].fieldPath,'/artifact/tensor/shape');
  const p=workflowProfile();p.steps[0].inputBindings[0].workflowRequirementId='source.rgb';
  const unknown=bindWorkflow(compile(p),{operationId:'transform',artifact:{tensor:{}}});
  assert.equal(unknown.status,'INPUT_UNCONFIRMED');assert.equal(unknown.requirements[0].requirementId,'source.rgb');
  p.steps[0].inputBindings[0].workflowRequirementId='reference.rgb';
  assert.equal(bindWorkflow(compile(p),{operationId:'transform',artifact:{tensor:{}}}).status,'NOT_REQUIRED');
});
test('named workflow inputs keep per-port geometry and operation metadata in one owner request',()=>{
  const p=workflowProfile();p.steps[0].inputBindings.push({portId:'latent',artifactRef:'source:latent',workflowRequirementId:'target.latent'});p.externalArtifactRefs.push('source:latent');
  const plan=compile(p),descriptor={operationId:'joint',parameters:{schedule:'owner-owned'},artifacts:{image:{tensor:{}},latent:{tensor:{},native:{metadata:{decoder:'exact'}}}}},result=bindWorkflow(plan,descriptor);
  assert.equal(result.status,'BOUND');assert.equal(result.descriptor.operationId,'joint');assert.deepEqual(result.descriptor.parameters,{schedule:'owner-owned'});
  assert.deepEqual(result.descriptor.artifacts.image.tensor.shape,[1,3,5,16,32]);assert.deepEqual(result.descriptor.artifacts.latent.tensor.shape,[1,16,2,2,4]);assert.equal(result.descriptor.artifacts.latent.native.metadata.decoder,'exact');
  descriptor.artifacts.latent.tensor.shape=[1,16,21,60,104];const conflict=bindWorkflow(plan,descriptor);assert.equal(conflict.status,'BLOCKED');assert.equal(conflict.reasons[0].fieldPath,'/artifacts/latent/tensor/shape');
});
test('undeclared workflow requirement bindings fail structural admission',()=>{
  const p=workflowProfile();p.steps[0].inputBindings[0].workflowRequirementId='invented.rgb';issue(p,'UNRESOLVED_WORKFLOW_REQUIREMENT');
  delete p.workflowShapeRequest;issue(p,'UNRESOLVED_WORKFLOW_REQUIREMENT');
});
test('a repeated requirement on different named ports reports the conflicting port exactly',()=>{
  const p=workflowProfile();p.externalArtifactRefs.push('other:rgb');p.steps[0].inputBindings.push({portId:'other',artifactRef:'other:rgb',workflowRequirementId:'target.rgb'});
  const result=bindWorkflow(compile(p),{operationId:'joint',artifacts:{image:{tensor:{shape:[1,3,5,16,32]}},other:{tensor:{shape:[1,3,9,16,32]}}}});
  assert.equal(result.status,'BLOCKED');assert.equal(result.reasons[0].fieldPath,'/artifacts/other/tensor/shape');
});

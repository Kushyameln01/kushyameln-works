import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadReferenceSet} from '../../docs/shared/ai-connection/reference-loader.mjs';
import {evaluateEdge} from '../../docs/shared/ai-connection/compatibility.mjs';
import {createNormExecution} from '../../docs/shared/ai-connection/norm-execution.mjs';

const root=new URL('../../',import.meta.url);
const modulePath='../../docs/shared/ai-connection/adapters/p4-cross-ffn/declarations.mjs';
let declarations;
try{declarations=await import(modulePath);}catch{}
async function setup(inputClass='native-text-encoder'){
 assert.ok(declarations,'P4 declarations must support the real loader/evaluateEdge boundary');
 const m=declarations,pin=m.P4_CATALOG_REF,catalogBytes=new Uint8Array(await readFile(new URL(pin.path,root))),catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
 const files=new Map(await Promise.all(catalog.files.map(async f=>[f.path,new Uint8Array(await readFile(new URL(f.path,root)))])));
 const referenceSet=await loadReferenceSet({catalogPath:pin.path,catalogBytes,files,expectedCatalogSha256:pin.sha256});
 const binding={ownerId:'p4-owner',sessionId:'session',bindingId:'p4',resourceGeneration:'generation-1',sourceRef:m.P4_PINS.sourceRef,buildId:m.P4_PINS.buildId,kernelDigest:m.P4_PINS.mathWasm.sha256,byteLength:m.P4_PINS.mathWasm.byteLength,bridgeWasmSHA256:m.P4_PINS.bridgeWasm.sha256,attentionWasmSHA256:m.P4_PINS.attentionWasm.sha256};
 const target={requestId:'p4-request',managerSessionId:'session',managerRevision:1,activeToken:'current',resourceBinding:{bindingId:'p4',ownerId:'p4-owner',resourceGeneration:'generation-1'},localRevisionBindings:{producer:1,consumer:1}};
 const args={referenceSet,managerSourceRef:{repository:'Kushyameln01/kushyameln-works',commit:'5aa5a806f84a875c542b2922fe80ef6faafc7915',path:'docs/shared/ai-connection/adapters/norm-required-p4-cross-ffn.mjs'},binding,target,conditioningMetadata:structuredClone(inputClass==='explicit-fixture'?m.P4_CONDITIONING_CASES.fixture:m.P4_CONDITIONING_CASES.nativeText),savedInputBindings:structuredClone(m.P4_TRUSTED_INPUTS.HIGH),resourceState:{status:'available',ownerId:'p4-owner',requiredBytes:63709184,budgetBytes:80000000,occupiedBytes:0},extensions:{'future:opaque':{schemaId:'future:opaque',schemaVersion:'1',requiredForUse:false,data:{keep:['x','x']}}}};
 return {m,args,referenceSet,q:m.prepareP4NormInputs(args)};
}
function numericFixture(m){return {recordId:m.P4_EXEC_RECORD_ID,scope:'p4:fixture:local-composed',ownerSourceRef:structuredClone(m.P4_PINS.sourceRef),kernelDigest:m.P4_PINS.mathWasm.sha256,gateRef:structuredClone(m.P4_PINS.gateRef),referenceRef:structuredClone(m.P4_FIXTURE_REFERENCE_REFS.HIGH)};}


async function nativeDeclarationFixture(comparisonModes=['local','composed']){
 const {m,args,referenceSet}=await setup(),sourceRef={repository:'fixture:owner-declaration',commit:'b'.repeat(40),path:'native-text-reference.json'};
 const payload=mode=>({sourceRef:{...sourceRef,path:mode+'-reference.json'},sha256:(mode==='local'?'a':'b').repeat(64),byteLength:128,payloadSha256:(mode==='local'?'c':'d').repeat(64),payloadByteLength:256});
 const ref={sourceRef,sha256:'e'.repeat(64),byteLength:128,referenceId:'fixture:declaration-only-native-text-reference',side:'HIGH',blockIndex:0,scheduleIndex:1,inputClass:'native-text-encoder',textRows:512,conditioningBinding:structuredClone(args.conditioningMetadata),savedInputBindings:structuredClone(args.savedInputBindings),...Object.fromEntries(comparisonModes.map(mode=>[mode,payload(mode)]))};
 const gate=structuredClone(m.P4_PINS.gateRef);gate.sourceRef={...sourceRef,path:'native-text-predeclared-gate.json'};gate.gateId='fixture:declaration-only-native-text-gate';gate.sha256='f'.repeat(64);gate.byteLength=128;
 args.numericRequirement={recordId:m.P4_EXEC_RECORD_ID,scope:'fixture:declaration-only-native-text',ownerSourceRef:m.P4_PINS.sourceRef,kernelDigest:m.P4_PINS.mathWasm.sha256,gateRef:gate,referenceRef:ref};
 const prior={sourceRef:{...sourceRef,path:'prior-pass.json'},sha256:'9'.repeat(64),byteLength:128,result:'PASS',executionProfileId:m.P4_PROFILE_ID,ownerSourceRef:m.P4_PINS.sourceRef,buildId:m.P4_PINS.buildId,inputClass:'native-text-encoder',textRows:512,conditioningBinding:structuredClone(args.conditioningMetadata),savedInputBindings:structuredClone(args.savedInputBindings),referenceRef:structuredClone(ref),gateRef:structuredClone(gate),outputHashes:Object.fromEntries(Object.keys(m.P4_OUTPUTS).map(name=>[name+'SHA256','8'.repeat(64)])),strictParameterChecks:29,comparisonModes:structuredClone(comparisonModes)};
 args.validationSpec={gate:structuredClone(gate.gates),priorOwnerPass:prior,comparisonModes:structuredClone(comparisonModes),comparisonCount:25*comparisonModes.length,count:15927296*comparisonModes.length};
 return {m,args,referenceSet};

}

// Catches accidental admission based on matching shape alone when numeric evidence is absent.
test('fixed native Text contract stays compatible and blocked without P4 numerical references',async()=>{
 const {q}=await setup(),r=evaluateEdge(q);
 assert.equal(r.compatibility,'COMPATIBLE',JSON.stringify(r.checks.filter(c=>c.outcome!=='match')));assert.equal(r.readiness.state,'blocked');
 assert.ok(r.referenceTrace.validation.some(v=>v.result==='NOT_VERIFIED'));
 assert.equal(q.evidence.length,0);assert.deepEqual(q.artifact.extensions,{'future:opaque':{schemaId:'future:opaque',schemaVersion:'1',requiredForUse:false,data:{keep:['x','x']}}});
 assert.equal(q.artifact.tensor.nativeMeaning,'works:p4-output:blockOutput:f32');
});
// Catches treating unknown required declarations as numeric-only missing.
test('missing profile, conditioning or required source declarations remain unverified',async()=>{
 for(const mutate of [q=>delete q.referenceContext.nativeDeclarations.producer.nativeProfileId,q=>delete q.referenceContext.nativeDeclarations.producer.conditioning.shape,q=>delete q.referenceContext.nativeDeclarations.producer.conditioning.rows,q=>delete q.referenceContext.nativeDeclarations.producer.kernelDigest,q=>q.referenceContext.normIds.push('N-P4-UNKNOWN'),q=>q.referenceContext.profileBindings.pop()]){
  const {q}=await setup();mutate(q);assert.equal(evaluateEdge(q).compatibility,'UNVERIFIED');
 }
});
// Catches silently accepting known bad side/source/axis/condition bindings.
test('known P4 source, output, side and native Text conflicts are incompatible',async()=>{
 for(const mutate of [q=>q.artifact.tensor.shape=[5120,2],q=>q.artifact.tensor.nativeMeaning='text_hidden_states',q=>q.referenceContext.nativeDeclarations.producer.scheduleIndex=3,q=>q.referenceContext.nativeDeclarations.producer.sourceRef.commit='0'.repeat(40),q=>q.referenceContext.nativeDeclarations.producer.conditioning.modelSha256='0'.repeat(64),q=>q.referenceContext.nativeDeclarations.producer.outputs.gate.axes=['L','C']]){
  const {q}=await setup();mutate(q);assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');
 }
});
// Catches relabeling the already available K4 numerical cohort to L512.
test('fixture references cannot authorize the native Text cohort even with relabeled numeric fields',async()=>{
 const {m,args}=await setup();args.numericRequirement=numericFixture(m);
 let q=m.prepareP4NormInputs(args);assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');
 args.numericRequirement.referenceRef.inputClass='native-text-encoder';args.numericRequirement.referenceRef.textRows=512;
 q=m.prepareP4NormInputs(args);assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');
});
// Catches losing case-specific numeric identity or accepting a changed owner gate.
test('fixed fixture numeric identities admit declarations but reject gate and payload mismatches',async()=>{
 const {m,args,referenceSet}=await setup('explicit-fixture');args.numericRequirement=numericFixture(m);
 const q=m.prepareP4NormInputs(args);assert.equal(evaluateEdge(q).compatibility,'COMPATIBLE');
 assert.equal(evaluateEdge(q).readiness.state,'blocked');
 const execution=createNormExecution({policyId:m.P4_POLICY_ID,referenceSet,edgeInput:q});
 assert.equal(execution.inspect().phase,'declaration');
 for(const mutate of [q=>q.referenceContext.numericRequirements[0].gateRef.gates.localCut.abs=1,q=>q.referenceContext.numericRequirements[0].referenceRef.local.payloadSha256='0'.repeat(64),q=>q.referenceContext.numericRequirements[0].ownerSourceRef.commit='0'.repeat(40),q=>q.referenceContext.numericRequirements[0].kernelDigest='0'.repeat(64)]){
  const changed=m.prepareP4NormInputs(args);mutate(changed);assert.equal(evaluateEdge(changed).compatibility,'INCOMPATIBLE');
 }
 const missing=m.prepareP4NormInputs(args);missing.referenceContext.profileBindings.pop();
 assert.equal(evaluateEdge(missing).compatibility,'UNVERIFIED');
 for(const field of ['conditioning','kernelDigest','sourceRef','side']){
  const missing=m.prepareP4NormInputs(args);delete missing.referenceContext.nativeDeclarations.producer[field];
  assert.equal(evaluateEdge(missing).compatibility,'UNVERIFIED',field);
 }
});
// Catches injecting a prior owner receipt into the current operation's evidence phase.
test('current numerical evidence cannot be preloaded into a P4 execution',async()=>{
 const {m,args,referenceSet}=await setup('explicit-fixture');args.numericRequirement=numericFixture(m);
 const q=m.prepareP4NormInputs(args);q.evidence.push({scope:'p4:fixture:local-composed',result:'pass'});
 assert.throws(()=>createNormExecution({policyId:m.P4_POLICY_ID,referenceSet,edgeInput:q}),{code:'FUTURE_NORM_RECEIPT'});
});
// Synthetic identities exercise declaration binding only. They are not actual
// owner receipts, never enter a holding runner and cannot establish PASS.
// Catches forcing the fixture gate's outer identity onto a distinct owner case.
test('native Text gate is separately predeclared and remains bound to its prior owner declaration',async()=>{
 const {m,args,referenceSet}=await nativeDeclarationFixture();
 const gate=args.numericRequirement.gateRef,prior=args.validationSpec.priorOwnerPass;
 const q=m.prepareP4NormInputs(args),decision=evaluateEdge(q);
 assert.equal(decision.compatibility,'COMPATIBLE');assert.equal(decision.readiness.state,'blocked');assert.deepEqual(q.evidence,[]);
 assert.equal(createNormExecution({policyId:m.P4_POLICY_ID,referenceSet,edgeInput:q}).inspect().phase,'declaration');
 q.referenceContext.numericRequirements[0].gateRef.sha256='7'.repeat(64);assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');
 const noPrior=m.prepareP4NormInputs({...args,validationSpec:{gate:gate.gates}}),missing=evaluateEdge(noPrior);assert.equal(missing.compatibility,'COMPATIBLE');assert.equal(missing.readiness.state,'blocked');
 assert.throws(()=>createNormExecution({policyId:m.P4_POLICY_ID,referenceSet,edgeInput:noPrior}),{code:'NORM_DECLARATION_BLOCKED'});
 const noGate=m.prepareP4NormInputs({...args,validationSpec:{priorOwnerPass:prior}});
 assert.throws(()=>createNormExecution({policyId:m.P4_POLICY_ID,referenceSet,edgeInput:noGate}),{code:'NORM_DECLARATION_BLOCKED'});
});
// Catches demanding an unrequested local oracle when the owner established
// only composed25, and catches promoting a missing/mismatched declared mode.
test('native Text composed-only declarations require exactly their selected reference mode',async()=>{
 const {m,args,referenceSet}=await nativeDeclarationFixture(['composed']);
 const q=m.prepareP4NormInputs(args),r=evaluateEdge(q);
 assert.equal(r.compatibility,'COMPATIBLE');assert.equal(r.readiness.state,'blocked');assert.deepEqual(q.evidence,[]);
 assert.equal(createNormExecution({policyId:m.P4_POLICY_ID,referenceSet,edgeInput:q}).inspect().phase,'declaration');
 const missing=m.prepareP4NormInputs(args);delete missing.referenceContext.numericRequirements[0].referenceRef.composed;
 assert.equal(evaluateEdge(missing).compatibility,'COMPATIBLE');assert.equal(evaluateEdge(missing).readiness.state,'blocked');
 assert.throws(()=>createNormExecution({policyId:m.P4_POLICY_ID,referenceSet,edgeInput:missing}),{code:'NORM_DECLARATION_BLOCKED'});
 const noModes=m.prepareP4NormInputs(args);delete noModes.referenceContext.validationSpec.comparisonModes;assert.equal(evaluateEdge(noModes).compatibility,'COMPATIBLE');assert.equal(evaluateEdge(noModes).readiness.state,'blocked');
 const optional=m.prepareP4NormInputs(args);optional.referenceContext.numericRequirements[0].referenceRef.local=structuredClone(m.P4_FIXTURE_REFERENCE_REFS.HIGH.local);assert.equal(evaluateEdge(optional).compatibility,'COMPATIBLE');assert.equal(createNormExecution({policyId:m.P4_POLICY_ID,referenceSet,edgeInput:optional}).inspect().phase,'declaration');
 const mismatch=m.prepareP4NormInputs(args);mismatch.referenceContext.validationSpec.priorOwnerPass.comparisonModes=['local','composed'];assert.equal(evaluateEdge(mismatch).compatibility,'INCOMPATIBLE');
 const wrongCount=m.prepareP4NormInputs(args);wrongCount.referenceContext.validationSpec.comparisonCount=50;assert.equal(evaluateEdge(wrongCount).compatibility,'INCOMPATIBLE');
 for(const modes of [['local'],['composed','local'],['composed','composed']]){
  const unsupported=m.prepareP4NormInputs(args),spec=unsupported.referenceContext.validationSpec;spec.comparisonModes=modes;spec.priorOwnerPass.comparisonModes=structuredClone(modes);spec.comparisonCount=25*modes.length;spec.count=15927296*modes.length;assert.equal(evaluateEdge(unsupported).compatibility,'INCOMPATIBLE');
 }
 const fixture=m.prepareP4NormInputs(args);fixture.referenceContext.numericRequirements[0].referenceRef.composed=structuredClone(m.P4_FIXTURE_REFERENCE_REFS.HIGH.composed);assert.equal(evaluateEdge(fixture).compatibility,'INCOMPATIBLE');
});
// Catches dropping full Text row extent or adding an alias as a separate output.
test('25 output wrapper shapes preserve full native Text rows and block hidden identity',async()=>{
 const {m}=await setup(),outputs=m.p4OutputSpecs(512);
 assert.equal(Object.keys(outputs).length,25);assert.deepEqual(outputs.textLinear0.shape,[512,5120]);
 assert.deepEqual(outputs.ffnUp.shape,[2,13824]);assert.deepEqual(outputs.gate.axes,['C']);
 assert.equal(Object.hasOwn(outputs,'output'),false);
 assert.equal(outputs.blockOutput.semanticId,'works:p4-output:blockOutput:f32');
 assert.equal(outputs.blockOutput.ownerNativeMeaning,null);
 const bytes=Object.values(outputs).reduce((sum,o)=>sum+o.shape.reduce((a,b)=>a*b,1)*4,0);assert.equal(bytes,63709184);
 for(const rows of [0,513,1.5])assert.throws(()=>m.p4OutputSpecs(rows),{code:'P4_DECLARATION_INVALID'});
});
// Catches mutable caller declarations changing the selected execution cohort after prepare.
test('prepared edge snapshots caller metadata while rejecting non-JSON declarations',async()=>{
 const {m,args}=await setup(),q=m.prepareP4NormInputs(args);args.conditioningMetadata.shape[1]=4;args.extensions['future:opaque'].data.keep.push('lost');
 assert.deepEqual(q.referenceContext.nativeDeclarations.producer.conditioning.shape,[1,512,4096]);
 assert.deepEqual(q.artifact.extensions,{'future:opaque':{schemaId:'future:opaque',schemaVersion:'1',requiredForUse:false,data:{keep:['x','x']}}});
 assert.throws(()=>m.prepareP4NormInputs({...args,extensions:new Map()}),{code:'P4_DECLARATION_INVALID'});
});
// Catches allowing a forged success boolean or a single changed delivered module through source admission.
test('source proof requires all pinned actual bytes and rejects mutation before digest',{skip:!process.env.P4_NATIVE_SOURCE_ROOT},async()=>{
 const {m}=await setup(),source=await import('../../docs/shared/ai-connection/adapters/p4-cross-ffn/source.mjs');
 assert.equal(source.isVerifiedP4CrossFfnSource({verified:true}),false);
 const files=new Map(await Promise.all(source.P4_FILES.map(async f=>[f.path,new Uint8Array(await readFile(new URL(f.path,new URL('file://'+process.env.P4_NATIVE_SOURCE_ROOT.replace(/\/$/,'')+'/'))))])));
 const before=new Uint8Array(files.values().next().value),pending=source.verifyP4CrossFfnSource({files});
 files.values().next().value[0]^=1;
 const proof=await pending;assert.equal(source.isVerifiedP4CrossFfnSource(proof),true);
 assert.equal(source.isVerifiedP4CrossFfnSource(structuredClone(proof)),false);
 assert.equal(source.P4_FILES.length,51);assert.ok(source.P4_FILES.some(f=>f.path==='docs/shared/diffusion-models/diagnostics/self-attention-tail/common.mjs'));
 await assert.rejects(()=>source.verifyP4CrossFfnSource({files}),{code:'P4_SOURCE_MISMATCH'});
 files.set(source.P4_FILES[0].path,before);files.delete(source.P4_FILES.at(-1).path);
 await assert.rejects(()=>source.verifyP4CrossFfnSource({files}),{code:'P4_SOURCE_MISMATCH'});
});

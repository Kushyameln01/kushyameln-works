import test from 'node:test';
import assert from 'node:assert/strict';
import {createNormExecution} from '../../docs/shared/ai-connection/norm-execution.mjs';
import {normEdgeFixture} from './norm-execution-fixtures.mjs';
test('required norm execution rejects absent immutable inputs and unknown policy',()=>{
 assert.throws(()=>createNormExecution({policyId:'lora-q16'}),{code:'NORM_INPUT_REQUIRED'});
 assert.throws(()=>createNormExecution({policyId:'caller-chosen-empty'}),{code:'UNKNOWN_NORM_POLICY'});
});
test('a declaration cannot contain future evidence or caller-owned phase selection',async()=>{
 const f=await normEdgeFixture();f.edgeInput.evidence=[{scope:'norm:N-TRANSACTION',result:'pass'}];
 assert.throws(()=>createNormExecution({policyId:'lora-q16',...f}),{code:'FUTURE_NORM_RECEIPT'});
 f.edgeInput.evidence=[];f.edgeInput.referenceContext.phase='published';assert.throws(()=>createNormExecution({policyId:'lora-q16',...f}),{code:'NORM_PHASE_OWNED'});
});
function observations(f,result='pass'){
 const q=f.edgeInput,target=structuredClone(q.referenceContext.evidenceTarget),id='owner:comparison',delegation={checker:'owner-validation',receiptRef:id,target};
 const evidence=(scope,evidenceId,more)=>({scope,evidenceId,result,subjectRefs:[q.producerPort.bindingRef,q.consumerPort.bindingRef],contractRefs:[...new Set([q.producerPort,q.consumerPort].flatMap(p=>[p.sourceRef.commit,p.nativeAPI.version,p.nativeAPI.build]))],artifactRef:q.artifact.artifactId,profileRef:q.artifact.profileRef,inputConditions:{shape:q.artifact.tensor.shape,dtype:q.artifact.tensor.dtype,coverage:target.coverage,scope:target.scope,baseKind:target.baseKind,referenceId:target.referenceId,environment:'node-test'},...more});
 return {evidence:[evidence(f.numeric.scope,'native:validation',{normBinding:{catalogSha256:f.referenceSet.catalogSha256,...structuredClone(f.numeric)}}),evidence('norm:N-EVIDENCE',id,{delegation,normBinding:{catalogSha256:f.referenceSet.catalogSha256}})],delegations:{'N-EVIDENCE':delegation},evidenceTarget:target};
}
test('a failed numerical cohort cannot be rescued by a later replacement pass receipt',async()=>{
 const f=await normEdgeFixture(),guard=createNormExecution({policyId:'lora-q16',...f});
 assert.throws(()=>guard.validated(observations(f,'fail')),{code:'NORM_VALIDATED_BLOCKED'});
 assert.throws(()=>guard.validated(observations(f)),{code:'NORM_EXECUTION_FAILED'});assert.ok(guard.inspect().failure);
});
test('phase observations cannot relabel the predeclared base, reference, scope or coverage',async()=>{
 for(const field of ['baseKind','referenceId','scope','coverage']){const f=await normEdgeFixture(),guard=createNormExecution({policyId:'lora-q16',...f}),o=observations(f);o.evidenceTarget[field]='caller-relabel';assert.throws(()=>guard.validated(o),{code:'NORM_DECLARATION_IMMUTABLE'});}
});
test('declarations and gates are copied before the first native operation',async()=>{
 const f=await normEdgeFixture(),accepted=observations(f),guard=createNormExecution({policyId:'lora-q16',...f});
 f.edgeInput.referenceContext.numericRequirements[0].gateRef.sha256='0'.repeat(64);f.edgeInput.referenceContext.nativeDeclarations.producer.baseDtype='F64';
 assert.equal(guard.validated(accepted).readiness.state,'ready');
});
test('future receipt scopes remain rejected after declaration admission',async()=>{
 const f=await normEdgeFixture(),guard=createNormExecution({policyId:'lora-q16',...f}),o=observations(f);o.evidence.push({...o.evidence[0],scope:'norm:N-TRANSACTION'});
 assert.throws(()=>guard.validated(o),{code:'FUTURE_NORM_RECEIPT'});
});
test('live observations cannot replace the selected expected binding cohort',async()=>{
 const f=await normEdgeFixture(),guard=createNormExecution({policyId:'lora-q16',...f}),o=observations(f),bindings=structuredClone(f.edgeInput.activeBindings);bindings.consumer.expectedRevision=4;bindings.consumer.currentRevision=4;o.activeBindings=bindings;
 assert.throws(()=>guard.validated(o),{code:'NORM_BINDING_COHORT_MISMATCH'});
});
test('the mandatory entry cannot replace declared expected bindings while initially sealing its guard',async()=>{
 const {createNormRequiredLoraExecution}=await import('../../docs/shared/ai-connection/adapters/norm-required-lora.mjs'),f=await normEdgeFixture(),calls=[],adapter={contractVersion:'works-candidate-adopted-lora/0.1-draft.1'};
 for(const name of ['plan','describeBinding','prepare','openStage','finalize','release','recover','cancelCurrent'])adapter[name]=async()=>{calls.push(name);throw Error('No native operation allowed');};
 const activeBindings=structuredClone(f.edgeInput.activeBindings);activeBindings.consumer.currentRevision=4;activeBindings.consumer.expectedRevision=4;
 assert.throws(()=>createNormRequiredLoraExecution({adapter,...f,readCurrent:()=>({activeBindings,resourceState:f.edgeInput.resourceState}),readOwnerEvidence:()=>{throw Error('No comparison allowed');}}),{code:'NORM_BINDING_COHORT_MISMATCH'});assert.deepEqual(calls,[]);
});
test('the fixed LoRA policy cannot omit its Comfy loader binding together with all three required fields',async()=>{
 const f=await normEdgeFixture();f.edgeInput.referenceContext.profileBindings=f.edgeInput.referenceContext.profileBindings.filter(b=>b.recordId!=='LOAD-COMFY-LINEAR-DIFF');for(const field of ['baseDtype','outputDtype','layout'])delete f.edgeInput.referenceContext.nativeDeclarations.producer[field];
 assert.throws(()=>createNormExecution({policyId:'lora-q16',...f}),e=>e.code==='NORM_DECLARATION_BLOCKED'&&e.decision.compatibility==='UNVERIFIED'&&e.decision.reasons.some(r=>r.code==='REQUIRED_PROFILE_BINDING_MISSING'));
});
for(const recordId of ['LOAD-COMFY-LINEAR-DIFF','LOAD-LOCAL-SAFETENSORS','EXEC-BERNINI-Q16-F32'])for(const field of ['side','representation'])test(`fixed LoRA profile ${recordId} rejects a different ${field}`,async()=>{
 const f=await normEdgeFixture(),binding=f.edgeInput.referenceContext.profileBindings.find(b=>b.recordId===recordId);binding[field]=field==='side'?(binding.side==='producer'?'consumer':'producer'):'raw-latent';
 assert.throws(()=>createNormExecution({policyId:'lora-q16',...f}),e=>e.code==='NORM_DECLARATION_BLOCKED'&&e.decision.compatibility==='INCOMPATIBLE'&&e.decision.reasons.some(r=>r.code===(field==='side'?'REQUIRED_PROFILE_SIDE_MISMATCH':'REQUIRED_PROFILE_REPRESENTATION_MISMATCH')));
});
test('Rect decode cannot replace its required shape profile with unrelated selected numeric declarations',async()=>{
 const f=await normEdgeFixture();f.edgeInput.referenceContext.normIds.push('N-SHAPE','N-ARTIFACT');
 assert.throws(()=>createNormExecution({policyId:'rect-decode',...f}),e=>e.code==='NORM_DECLARATION_BLOCKED'&&e.decision.compatibility==='UNVERIFIED'&&e.decision.reasons.some(r=>r.code==='REQUIRED_PROFILE_BINDING_MISSING'));
});
test('mandatory profile comparisons are retained in trace with supported explicit LoRA labels',async()=>{
 const f=await normEdgeFixture();for(const b of f.edgeInput.referenceContext.profileBindings)b.representation=b.recordId.startsWith('LOAD-')?'loader':'diagnostic-projection';
 const guard=createNormExecution({policyId:'lora-q16',...f}),trace=guard.inspect().initialDecision.referenceTrace;
 assert.deepEqual(trace.requiredNormPolicy.requiredProfileBindings.map(b=>[b.recordId,b.side]),[['LOAD-COMFY-LINEAR-DIFF','producer'],['LOAD-LOCAL-SAFETENSORS','producer'],['EXEC-BERNINI-Q16-F32','consumer']]);assert.equal(guard.inspect().initialDecision.readiness.state,'ready');
});

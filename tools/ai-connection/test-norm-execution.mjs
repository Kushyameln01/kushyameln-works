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

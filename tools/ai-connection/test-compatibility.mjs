import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEdge } from '../../docs/shared/ai-connection/compatibility.mjs';

import { edgeFixture } from './fixtures.mjs';

test('matching explicit fixture is compatible with fully reasoned checks',()=>{
  const q=edgeFixture(),r=evaluateEdge(q);assert.equal(r.compatibility,'COMPATIBLE');assert.equal(r.readiness.state,'ready');
  assert.deepEqual(r.roles,q.implementationState);assert.ok(r.checks.length>8);
  for(const c of r.checks){assert.ok(c.fieldPath);assert.ok(c.contractRefs.length);assert.ok(c.owner);assert.ok(c.reason);}
});
test('same shape does not make sample a mean',()=>{const q=edgeFixture();q.artifact.semantics.schemaId='fixture:sample';q.registry.schemas.push({schemaId:'fixture:sample',schemaVersion:'1'});assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');});
test('wrong decoder is incompatible, producers remain distinct',()=>{const q=edgeFixture();q.consumerPort.requiredIdentities=[{identityKind:'model',role:'decoder',algorithm:'sha256',value:'b'.repeat(64),scope:'full'}];q.artifact.provenance.consumerBindings=[{identityKind:'model',role:'decoder',algorithm:'sha256',value:'c'.repeat(64),scope:'full'}];const r=evaluateEdge(q);assert.equal(r.compatibility,'INCOMPATIBLE');assert.ok(r.reasons.some(x=>x.code==='PROVENANCE_MISMATCH'));});
test('actual mandatory metadata loss is not an adapter opportunity',()=>{const q=edgeFixture();delete q.artifact.native.metadata.meaning;assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');});
test('unknown semantic is unverified, even when both labels match',()=>{const q=edgeFixture();q.registry.schemas=[];assert.equal(evaluateEdge(q).compatibility,'UNVERIFIED');});
test('unknown required extension is unverified; optional is opaque and unchanged',()=>{const q=edgeFixture();q.artifact.extensions['example:future']={schemaId:'future',schemaVersion:'9',requiredForUse:false,data:{all:[1,1,2]}};const before=structuredClone(q);assert.equal(evaluateEdge(q).compatibility,'COMPATIBLE');assert.deepEqual(q,before);q.artifact.extensions['example:future'].requiredForUse=true;assert.equal(evaluateEdge(q).compatibility,'UNVERIFIED');});
test('static operation cap and transient RAM are separate',()=>{const q=edgeFixture();q.consumerPort.tensor.maxElements=3;assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');delete q.consumerPort.tensor.maxElements;q.resourceState.budgetBytes=10;const r=evaluateEdge(q);assert.equal(r.compatibility,'COMPATIBLE');assert.equal(r.readiness.state,'blocked');});
test('restore adapter must be specific available versioned and permitted',()=>{
  const q=edgeFixture();q.artifact.semantics.spaceId=q.producerPort.semantics.spaceId='normalized';
  assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');
  q.adapters=[{adapterId:'fixture:restore/1',version:'1',owner:'numerical-owner',sourceRef:q.producerPort.sourceRef,available:true,profiles:['fixture:tiny/1'],
    rules:[{fieldPath:'/semantics/spaceId',from:'normalized',to:'raw',reason:'fixture restoration'}],evidenceRefs:['ev:restore']}];
  q.producerPort.allowedAdapterRefs=q.consumerPort.allowedAdapterRefs=['fixture:restore/1'];
  let r=evaluateEdge(q);assert.equal(r.compatibility,'NEEDS_ADAPTER');assert.deepEqual(r.adapterRefs,['fixture:restore/1']);assert.equal(r.readiness.state,'blocked');
  q.adapters[0].available=false;assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');
  q.adapters[0].available=true;delete q.adapters[0].sourceRef;assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');
});
test('metadata declaration of restored cannot replace required numeric scope',()=>{const q=edgeFixture();q.requiredScopes=['real-restoration'];q.artifact.native.metadata.restored=true;const r=evaluateEdge(q);assert.equal(r.compatibility,'COMPATIBLE');assert.equal(r.validation[0].result,'not-verified');assert.equal(r.readiness.state,'blocked');});
test('unimplemented operation cannot be made ready by fixture evidence',()=>{const q=edgeFixture();q.implementationState.consumer.state='not-implemented';const r=evaluateEdge(q);assert.equal(r.compatibility,'COMPATIBLE');assert.equal(r.readiness.state,'blocked');});
test('partial evidence and unrelated binding evidence cannot satisfy full scope',()=>{const q=edgeFixture();q.requiredScopes=['full-model'];assert.equal(evaluateEdge(q).validation[0].result,'not-verified');q.requiredScopes=['fixture'];q.evidence[0].subjectRefs=['other'];assert.equal(evaluateEdge(q).validation[0].result,'not-verified');});
test('stale and missing explicit states block without rewriting contract compatibility',()=>{const q=edgeFixture();q.activeBindings.consumer.currentRevision=4;assert.equal(evaluateEdge(q).readiness.state,'blocked');delete q.activeBindings;delete q.resourceState;delete q.implementationState;delete q.requiredScopes;assert.equal(evaluateEdge(q).readiness.state,'blocked');});
test('explicit failed validation fails readiness and preserves the contract decision',()=>{const q=edgeFixture();q.evidence[0].result='fail';const r=evaluateEdge(q);assert.equal(r.compatibility,'COMPATIBLE');assert.equal(r.readiness.state,'failed');});
test('pointwise cap is local to selected operation, never a global Text tensor cap',()=>{const q=edgeFixture();q.artifact.tensor.shape=[1,512,4096];q.artifact.tensor.axes=['B','L','C'];for(const p of [q.producerPort,q.consumerPort])p.tensor={dtypes:['float32'],axes:['B','L','C'],shape:[1,512,4096]};assert.equal(evaluateEdge(q).compatibility,'COMPATIBLE');q.consumerPort.tensor.maxElements=1048576;assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');});
test('malformed/unknown contract and non-finite budget never ready',()=>{const q=edgeFixture();q.artifact.contractVersion='unknown';assert.equal(evaluateEdge(q).compatibility,'UNVERIFIED');const r=edgeFixture();r.resourceState.budgetBytes=NaN;assert.equal(evaluateEdge(r).readiness.state,'blocked');});
test('evidence for another source commit or artifact shape is not accepted',()=>{const q=edgeFixture();q.producerPort.sourceRef={...q.producerPort.sourceRef,commit:'b'.repeat(40)};assert.equal(evaluateEdge(q).validation[0].result,'not-verified');const r=edgeFixture();r.evidence[0].inputConditions.shape=[4];assert.equal(evaluateEdge(r).validation[0].result,'not-verified');});
test('malformed port declaration cannot be compatible even when artifact fits',()=>{const q=edgeFixture();q.consumerPort.tensor.shape=[1,4];q.consumerPort.requiredMetadata=['not-a-pointer'];assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');});
test('decoder identity must occur in consumer binding location',()=>{const q=edgeFixture();const identity={identityKind:'model',role:'decoder',algorithm:'sha256',value:'b'.repeat(64),scope:'full'};q.consumerPort.requiredIdentities=[{...identity,location:'consumerBindings'}];q.artifact.provenance.producerRefs=[identity];assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');q.artifact.provenance.consumerBindings=[identity];assert.equal(evaluateEdge(q).compatibility,'COMPATIBLE');});
test('borrowed/leased artifacts need explicit current validity and owner',()=>{const q=edgeFixture();q.artifact.ownership.mode='lease';for(const p of [q.producerPort,q.consumerPort])p.ownershipModes=['lease'];assert.equal(evaluateEdge(q).readiness.state,'blocked');q.activeBindings.artifact={artifactRef:'a',ownerId:'producer',valid:true,leaseCurrent:true};assert.equal(evaluateEdge(q).readiness.state,'ready');});
test('unbound implementation state cannot approve another operation',()=>{const q=edgeFixture();q.implementationState.consumer.bindingRef='some-other-operation';assert.equal(evaluateEdge(q).readiness.state,'blocked');});
test('malformed JSON inputs return blocked decisions rather than exceptions',()=>{
  for(const mutate of [q=>q.producerPort.requiredMetadata=42,q=>q.artifact.provenance.producerRefs={},q=>q.registry.schemas=[null],q=>q.adapters=[null],q=>q.evidence=[null],q=>q.consumerPort.tensor.dtypes=42]) {
    const q=edgeFixture();mutate(q);assert.doesNotThrow(()=>evaluateEdge(q));
  }
});
test('known semantic schema must define and enforce nativeMeaning correspondence',()=>{const q=edgeFixture();q.artifact.tensor.nativeMeaning='generated-sample';assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');q.artifact.tensor.nativeMeaning='mean';delete q.registry.schemas[0].nativeMeanings;assert.equal(evaluateEdge(q).compatibility,'UNVERIFIED');});
test('registered semantic native assertions enforce normalization metadata',()=>{const q=edgeFixture();q.registry.schemas[0].nativeAssertions=[{metadataPath:'/normalization/state',expected:'restored'}];q.artifact.native.metadata.normalization={state:'normalized'};assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');q.artifact.native.metadata.normalization.state='restored';assert.equal(evaluateEdge(q).compatibility,'COMPATIBLE');});
test('required semantic fields declared by registry cannot be ignored',()=>{const q=edgeFixture();q.registry.schemas[0].semanticFields=['meaning'];q.producerPort.semantics.meaning=q.consumerPort.semantics.meaning='mean';q.artifact.semantics.meaning='sample';assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');});
test('malformed extension requirements and evidence lists never throw',()=>{
  for(const mutate of [q=>{q.consumerPort.requiredExtensionSchemas=[null];q.artifact.extensions['a:b']={schemaId:'future',schemaVersion:'1',requiredForUse:false,data:{}};},q=>q.evidence[0].subjectRefs={},q=>q.evidence[0].contractRefs={},q=>q.registry.roles={}]) {
    const q=edgeFixture();mutate(q);assert.doesNotThrow(()=>evaluateEdge(q));assert.notEqual(evaluateEdge(q).readiness.state,'ready');
  }
});

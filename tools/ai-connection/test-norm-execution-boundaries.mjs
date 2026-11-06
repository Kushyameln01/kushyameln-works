// Independent phase admission tests. All execution/evidence values below are
// labelled fixtures; this suite never claims native or model numerical proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadReferenceSet} from '../../docs/shared/ai-connection/reference-loader.mjs';
import {evaluateEdge} from '../../docs/shared/ai-connection/compatibility.mjs';
import {edgeFixture} from './fixtures.mjs';

const root=new URL('../../',import.meta.url),catalogPath='docs/shared/ai-connection/reference/catalog.v1.json';
const catalogBytes=new Uint8Array(await readFile(new URL(catalogPath,root))),catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
const files=new Map(await Promise.all(catalog.files.map(async file=>[file.path,new Uint8Array(await readFile(new URL(file.path,root)))])));
const referenceSet=await loadReferenceSet({catalogBytes,files,expectedCatalogSha256:'14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c'});
const NUMERIC='fixture:owner-numeric',TRANSACTION='norm:N-TRANSACTION';
function fixture(phase='declaration'){
 const q=edgeFixture(),record=referenceSet.profileRecords.get('EXEC-BERNINI-Q16-F32');
 const base=structuredClone(q.evidence[0]);
 q.artifact.tensor={dtype:'float32',shape:[16],axes:['O'],nativeMeaning:'projection-fixture',dataRef:'payload:a'};
 q.artifact.native.metadata.meaning='projection-fixture';q.registry.schemas[0].nativeMeanings=['projection-fixture'];
 for(const port of [q.producerPort,q.consumerPort])port.tensor={dtypes:['float32'],shape:[16],axes:['O']};
 q.producerPort.sourceRef=structuredClone(record.sourceRefs[0]);
 base.inputConditions.shape=[16];base.contractRefs.push(q.producerPort.sourceRef.commit);
 const requirement={recordId:record.recordId,scope:NUMERIC,ownerSourceRef:structuredClone(q.producerPort.sourceRef),kernelDigest:'3'.repeat(64),gateRef:{gateId:'fixture:predeclared',sourceRef:structuredClone(q.producerPort.sourceRef),sha256:'1'.repeat(64)},referenceRef:{sourceRef:structuredClone(q.producerPort.sourceRef),sha256:'2'.repeat(64)}};
 const target={requestId:'fixture:current-request',snapshotId:'fixture:future-snapshot',managerSessionId:'fixture:session',managerRevision:7,resourceBinding:{ownerId:'producer',bindingId:'producer',resourceGeneration:'fixture:g1'},localRevisionBindings:{sdkInstanceId:'fixture:sdk',localInputRevision:2,localApplicationRevision:3}};
 const delegation={checker:'queue.mjs',receiptRef:'fixture:transaction-evidence',target:structuredClone(target)};
 q.requiredScopes=[];q.evidence=[];
 q.requiredNormPolicy={policyId:'rect-mean',requiredNormIds:['N-NUMERIC','N-TRANSACTION']};
 q.referenceContext={referenceSet,phase,normIds:['N-NUMERIC','N-TRANSACTION'],profileBindings:[{recordId:record.recordId,side:'producer',representation:'diagnostic-projection'}],nativeDeclarations:{producer:{...structuredClone(record.requiredDeclarations),nativeProfileId:record.nativeProfileId,kernelDigest:requirement.kernelDigest}},numericRequirements:[requirement],managerState:{target:structuredClone(target)},delegations:{'N-TRANSACTION':delegation}};
 const numeric={...structuredClone(base),evidenceId:'fixture:numeric-evidence',scope:NUMERIC,normBinding:{catalogSha256:referenceSet.catalogSha256,...structuredClone(requirement)}};
 const transaction={...structuredClone(base),evidenceId:delegation.receiptRef,scope:TRANSACTION,delegation:structuredClone(delegation),normBinding:{catalogSha256:referenceSet.catalogSha256}};
 return {q,numeric,transaction,requirement,target};
}
const scope=(result,name)=>result.validation.find(item=>item.scope===name);

test('required norm policy rejects omitted context rather than silently taking legacy evaluator path',()=>{
 const {q}=fixture();delete q.referenceContext;const result=evaluateEdge(q);
 assert.equal(result.compatibility,'UNVERIFIED');assert.notEqual(result.readiness.state,'ready');
});

test('required norm policy rejects omitted required norm and fabricated verified-set view',()=>{
 for(const mutate of [q=>q.referenceContext.normIds=['N-NUMERIC'],q=>q.referenceContext.referenceSet={...referenceSet}]){
  const {q}=fixture();mutate(q);const result=evaluateEdge(q);assert.equal(result.compatibility,'UNVERIFIED');assert.notEqual(result.readiness.state,'ready');
 }
});

test('unknown norm phase cannot fall through to an apparently ready complete evaluation',()=>{
 const {q,numeric,transaction}=fixture('future-unknown-phase');q.evidence=[numeric,transaction];const result=evaluateEdge(q);
 assert.equal(result.compatibility,'UNVERIFIED');assert.notEqual(result.readiness.state,'ready');
});

test('declaration never reads pre-supplied numeric or transaction success JSON as completed proof',()=>{
 const {q,numeric,transaction}=fixture();q.evidence=[numeric,transaction];const result=evaluateEdge(q);
 for(const [name,duePhase] of [[NUMERIC,'validated'],[TRANSACTION,'published']]){
  const entry=scope(result,name);assert.equal(entry.result,'not-verified');assert.equal(entry.pending,true);assert.equal(entry.duePhase,duePhase);assert.deepEqual(entry.evidenceRefs,[]);assert.ok(result.referenceTrace.pendingScopeRefs.includes(name));
 }
 assert.equal(result.compatibility,'COMPATIBLE');assert.equal(result.readiness.state,'ready');
});

test('validated phase consumes numeric validation but cannot consume future publication JSON',()=>{
 const {q,numeric,transaction}=fixture('validated');q.evidence=[numeric,transaction];const result=evaluateEdge(q);
 assert.equal(scope(result,NUMERIC).result,'pass');assert.notEqual(scope(result,NUMERIC).pending,true);
 assert.equal(scope(result,TRANSACTION).result,'not-verified');assert.equal(scope(result,TRANSACTION).pending,true);assert.equal(scope(result,TRANSACTION).duePhase,'published');assert.deepEqual(scope(result,TRANSACTION).evidenceRefs,[]);
 assert.equal(result.readiness.state,'ready');
});

test('a missing predeclared numeric gate blocks declaration despite its later receipt phase',()=>{
 for(const missing of ['gateRef','referenceRef']){
  const {q}=fixture();delete q.referenceContext.numericRequirements[0][missing];const result=evaluateEdge(q);
  assert.equal(result.compatibility,'COMPATIBLE');assert.equal(result.readiness.state,'blocked');assert.equal(scope(result,NUMERIC).result,'not-verified');
 }
});

test('legacy calls without required policy or norm context retain their documented behavior',()=>{
 const q=edgeFixture(),result=evaluateEdge(q);assert.equal(result.compatibility,'COMPATIBLE');assert.equal(result.readiness.state,'ready');assert.equal(Object.hasOwn(result,'referenceTrace'),false);
});

test('validated phase rejects absent or wrong-kernel numeric receipt while transaction remains pending',()=>{
 for(const wrongKernel of [false,true]){
  const {q,numeric,transaction}=fixture('validated');
  if(wrongKernel){numeric.normBinding.kernelDigest='4'.repeat(64);q.evidence=[numeric,transaction];}else q.evidence=[transaction];
  const result=evaluateEdge(q);assert.equal(result.compatibility,'COMPATIBLE');assert.equal(scope(result,NUMERIC).result,'not-verified');assert.notEqual(scope(result,NUMERIC).pending,true);assert.equal(result.readiness.state,'blocked');assert.equal(scope(result,TRANSACTION).pending,true);
 }
});

test('numeric failure is due at validated phase and fails admission before publication',()=>{
 const {q,numeric,transaction}=fixture('validated');numeric.result='fail';q.evidence=[numeric,transaction];const result=evaluateEdge(q);
 assert.equal(scope(result,NUMERIC).result,'fail');assert.equal(result.readiness.state,'failed');assert.equal(scope(result,TRANSACTION).result,'not-verified');assert.equal(scope(result,TRANSACTION).pending,true);
});

test('a future transaction failure label cannot poison earlier successful numeric validation',()=>{
 const {q,numeric,transaction}=fixture('validated');transaction.result='fail';q.evidence=[numeric,transaction];const result=evaluateEdge(q);
 assert.equal(scope(result,NUMERIC).result,'pass');assert.equal(scope(result,TRANSACTION).result,'not-verified');assert.equal(scope(result,TRANSACTION).pending,true);assert.equal(result.readiness.state,'ready');
});

test('published phase requires exact request/revision/resource/local-revision evidence bindings',()=>{
 for(const mutate of [e=>e.delegation.target.requestId='retired-request',e=>e.delegation.target.managerRevision--,e=>e.delegation.target.resourceBinding.resourceGeneration='retired-generation',e=>e.delegation.target.localRevisionBindings.localApplicationRevision--]){
  const {q,numeric,transaction}=fixture('published');mutate(transaction);q.evidence=[numeric,transaction];const result=evaluateEdge(q);
  assert.equal(scope(result,NUMERIC).result,'pass');assert.equal(scope(result,TRANSACTION).result,'not-verified');assert.notEqual(scope(result,TRANSACTION).pending,true);assert.equal(result.readiness.state,'blocked');
 }
});

test('complete due receipts at published phase do not turn a stale active resource into ready',()=>{
 const {q,numeric,transaction}=fixture('published');q.evidence=[numeric,transaction];q.activeBindings.producer.currentRevision++;
 const result=evaluateEdge(q);assert.equal(scope(result,NUMERIC).result,'pass');assert.equal(scope(result,TRANSACTION).result,'pass');assert.equal(result.compatibility,'COMPATIBLE');assert.equal(result.readiness.state,'blocked');assert.ok(result.readiness.reasons.includes('BINDING_NOT_CURRENT:producer'));
});

test('published phase consumes both due receipts and retains separate numeric/transaction results',()=>{
 const {q,numeric,transaction}=fixture('published');q.evidence=[numeric,transaction];const result=evaluateEdge(q);
 for(const name of [NUMERIC,TRANSACTION]){assert.equal(scope(result,name).result,'pass');assert.notEqual(scope(result,name).pending,true);}
 assert.deepEqual(result.referenceTrace.pendingScopeRefs,[]);assert.equal(result.readiness.state,'ready');
});

test('a numeric scope cannot reuse a reserved transaction scope to defer its validation failure',()=>{
 const {q,numeric}=fixture('validated');q.referenceContext.numericRequirements[0].scope='norm:N-TRANSACTION';numeric.scope='norm:N-TRANSACTION';numeric.normBinding.scope='norm:N-TRANSACTION';numeric.result='fail';q.evidence=[numeric];
 const result=evaluateEdge(q);assert.equal(result.compatibility,'INCOMPATIBLE');assert.notEqual(result.readiness.state,'ready');
 assert.ok(result.checks.some(c=>c.fieldPath==='/referenceContext/numericRequirements/0/scope'&&c.outcome==='mismatch'));
});

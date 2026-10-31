// Independent contract-boundary regressions. Synthetic declarations only;
// these are not owner numerical validation or a real-model execution claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadReferenceSet} from '../../docs/shared/ai-connection/reference-loader.mjs';
import {evaluateEdge} from '../../docs/shared/ai-connection/compatibility.mjs';
import {edgeFixture} from './fixtures.mjs';

const root=new URL('../../',import.meta.url),path='docs/shared/ai-connection/reference/catalog.v1.json';
const catalogBytes=new Uint8Array(await readFile(new URL(path,root)));
const catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
const files=new Map(await Promise.all(catalog.files.map(async f=>[f.path,new Uint8Array(await readFile(new URL(f.path,root)))])));
const referenceSet=await loadReferenceSet({catalogBytes,files,expectedCatalogSha256:'14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c'});
const pinnedSource={repository:'fixture:owner',commit:'b'.repeat(40),path:'gate.mjs'};
function fixture(normIds,profileBindings=[]){
 const q=edgeFixture();
 q.referenceContext={referenceSet,normIds,profileBindings,nativeDeclarations:{producer:{},consumer:{}}};
 return q;
}
function numericRequirement(recordId='EXEC-BERNINI-Q16-F32'){
 return {recordId,scope:'owner:predeclared-numeric-gate',ownerSourceRef:pinnedSource,kernelDigest:'1'.repeat(64),gateRef:{sourceRef:pinnedSource,sha256:'2'.repeat(64),gateId:'owner:gate'},referenceRef:{sourceRef:pinnedSource,sha256:'3'.repeat(64)}};
}
function numericEvidence(q,r){return {...structuredClone(q.evidence[0]),evidenceId:'ev:self-repeated-numeric',scope:r.scope,normBinding:{catalogSha256:referenceSet.catalogSha256,...structuredClone(r)}};}

for(const [normId,recordId,representation] of [
 ['N-SHAPE','LOAD-LOCAL-SAFETENSORS','raw-latent'],
 ['N-NORMALIZATION','NORM-RAW-GENERATED-DECLARATION','raw-latent'],
 ['N-LOADER','LOAD-FP8-BASE','owned-F32-row-major'],
])test(`${normId}: required known profile without finite supported binding cannot silently pass`,()=>{
 const q=fixture([normId],[{recordId,side:'producer',representation}]);
 const r=evaluateEdge(q);
 assert.equal(r.compatibility,'UNVERIFIED');
 assert.notEqual(r.readiness.state,'ready');
});

test('N-NUMERIC: a shape record cannot act as an execution profile just because its ID exists',()=>{
 const q=fixture(['N-NUMERIC']),r=numericRequirement('SHAPE-VAE-WAN21-F1-16X32');
 q.referenceContext.numericRequirements=[r];q.evidence.push(numericEvidence(q,r));
 const result=evaluateEdge(q);
 assert.equal(result.compatibility,'UNVERIFIED');
 assert.equal(result.validation.find(s=>s.scope===r.scope).result,'not-verified');
});

test('N-NUMERIC: self-repeated receipt fields do not authenticate an unrelated owner source/profile',()=>{
 const q=fixture(['N-NUMERIC'],[{recordId:'EXEC-BERNINI-Q16-F32',side:'producer',representation:'diagnostic-projection'}]),r=numericRequirement();
 q.referenceContext.nativeDeclarations.producer={executionProfileId:'not-the-required-profile',precisionProfile:'arbitrary-f64'};
 q.referenceContext.numericRequirements=[r];q.evidence.push(numericEvidence(q,r));
 const result=evaluateEdge(q);
 assert.notEqual(result.validation.find(s=>s.scope===r.scope).result,'pass');
 assert.notEqual(result.readiness.state,'ready');
});

test('N-TRANSACTION: a caller-labelled old target plus matching JSON cannot replace current checker receipt',()=>{
 const q=fixture(['N-TRANSACTION']);
 const target={managerSessionId:'retired-session',managerRevision:1,requestId:'retired-request',resourceBinding:{ownerId:'foreign-owner',bindingId:'retired-binding',resourceGeneration:'retired-generation'}};
 q.referenceContext.delegations={'N-TRANSACTION':{checker:'queue.mjs',receiptRef:'unresolved:queue-receipt',target}};
 q.evidence.push({...structuredClone(q.evidence[0]),evidenceId:'ev:self-repeated-transaction',scope:'norm:N-TRANSACTION',delegation:{checker:'queue.mjs',receiptRef:'unresolved:queue-receipt',target},normBinding:{catalogSha256:referenceSet.catalogSha256}});
 const result=evaluateEdge(q);
 assert.equal(result.validation.find(s=>s.scope==='norm:N-TRANSACTION').result,'not-verified');
 assert.notEqual(result.readiness.state,'ready');
});

test('N-MAPPING: public factory/version labels alone do not bind exact registry pair and selected region',()=>{
 const q=fixture(['N-MAPPING']);q.referenceContext.mapping={ownerRole:'LoRA',factory:'createDiffusionDiagnosticAdapter',adapterVersion:'lora-diffusion-diagnostic-adapter/0.1',duplicateMappingAllowed:false,regressionOnly:false};
 const result=evaluateEdge(q);
 assert.equal(result.compatibility,'UNVERIFIED');
 assert.notEqual(result.readiness.state,'ready');
});

test('N-IDENTITY: malformed JSON candidate module must become unknown rather than throw TypeError',()=>{
 const q=fixture(['N-IDENTITY']);q.referenceContext.candidateSet={schemaVersion:'works-candidate-set/0.1-draft.1',status:'candidate',candidateSetId:'candidate:malformed',sourceRef:pinnedSource,modules:[null]};
 let result;assert.doesNotThrow(()=>{result=evaluateEdge(q);});
 assert.equal(result.compatibility,'UNVERIFIED');
});

test('N-EVIDENCE: fixture input conditions cannot satisfy a newly required real-base/full-model scope',()=>{
 const q=fixture(['N-EVIDENCE']);
 q.referenceContext.delegations={'N-EVIDENCE':{checker:'owner-validation',receiptRef:'unresolved:real-base-full',target:{coverage:'FULL',scope:'full-model-session',baseKind:'real-base',referenceId:'independent-real-base-reference'}}};
 const d=q.referenceContext.delegations['N-EVIDENCE'];
 q.evidence.push({...structuredClone(q.evidence[0]),evidenceId:'ev:fixture-relabeled-full',scope:'norm:N-EVIDENCE',delegation:structuredClone(d),normBinding:{catalogSha256:referenceSet.catalogSha256}});
 const result=evaluateEdge(q);
 assert.equal(result.validation.find(s=>s.scope==='norm:N-EVIDENCE').result,'not-verified');
 assert.notEqual(result.readiness.state,'ready');
});

test('N-NUMERIC: copying the native profile label still cannot bind an unrelated owner/kernel receipt',()=>{
 const q=fixture(['N-NUMERIC'],[{recordId:'EXEC-BERNINI-Q16-F32',side:'producer',representation:'diagnostic-projection'}]),r=numericRequirement();
 q.referenceContext.nativeDeclarations.producer={nativeProfileId:'bernini-q16x5120-f32-wasm-v1'};
 q.referenceContext.numericRequirements=[r];q.evidence.push(numericEvidence(q,r));
 const result=evaluateEdge(q);
 assert.equal(result.validation.find(s=>s.scope===r.scope).result,'not-verified');
 assert.notEqual(result.readiness.state,'ready');
});

test('N-EVIDENCE: complete target fields do not promote actual fixture coverage to declared real-base FULL',()=>{
 const q=fixture(['N-EVIDENCE']);
 const target={artifactRef:q.artifact.artifactId,profileRef:q.artifact.profileRef,coverage:'FULL',scope:'full-model-session',baseKind:'real-base',referenceId:'independent-real-base-reference'};
 q.referenceContext.evidenceTarget=structuredClone(target);
 q.referenceContext.delegations={'N-EVIDENCE':{checker:'owner-validation',receiptRef:'unresolved:real-base-full',target}};
 q.evidence.push({...structuredClone(q.evidence[0]),evidenceId:'ev:fixture-relabeled-full-with-target',scope:'norm:N-EVIDENCE',delegation:structuredClone(q.referenceContext.delegations['N-EVIDENCE']),normBinding:{catalogSha256:referenceSet.catalogSha256}});
 const result=evaluateEdge(q);
 assert.equal(result.validation.find(s=>s.scope==='norm:N-EVIDENCE').result,'not-verified');
 assert.notEqual(result.readiness.state,'ready');
});

test('N-NUMERIC: missing native profile declarations are unknown contracts, separately from absent gate evidence',()=>{
 const q=fixture(['N-NUMERIC']);
 q.referenceContext.numericRequirements=[{recordId:'EXEC-BERNINI-Q16-F32',scope:'owner:predeclared-numeric-gate'}];
 const result=evaluateEdge(q);
 assert.equal(result.compatibility,'UNVERIFIED');
 assert.equal(result.validation.find(s=>s.scope==='owner:predeclared-numeric-gate').result,'not-verified');
 assert.equal(result.readiness.state,'blocked');
 assert.ok(result.checks.some(c=>c.fieldPath==='/referenceContext/profileBindings'&&c.outcome==='unknown'));
});

test('N-IDENTITY: a verified adopted producer cannot authorize an omitted candidate consumer identity',()=>{
 const q=fixture(['N-IDENTITY']);q.requiredScopes=[];q.evidence=[];
 const producer={repository:'Kushyameln01/kushyameln-works',commit:'0c27874908638afc748ea2455a2779a16736730b',path:'docs/shared/inference/lora/sdk-v2.mjs'};
 q.producerPort.sourceRef=producer;
 q.consumerPort.sourceRef={repository:producer.repository,commit:'5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3',path:'docs/shared/diffusion-models/lora/diagnostic-consumer.mjs'};
 q.referenceContext.adoptionSetId='ADOPT-MANAGER-285967';
 q.referenceContext.identityBindings=[{side:'producer',module:'lora',loadedSourceRef:producer,kernelDigest:'3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24',byteLength:5051}];
 const result=evaluateEdge(q);
 assert.equal(result.compatibility,'UNVERIFIED');assert.equal(result.readiness.state,'blocked');
 assert.ok(result.checks.some(c=>c.fieldPath==='/referenceContext/identityBindings/consumer'&&c.outcome==='unknown'));
});

function rgbShapeFixture(representation,meaning){
 const q=fixture(['N-SHAPE'],[{recordId:'SHAPE-VAE-WAN21-F1-16X32',side:'producer',representation}]);
 const shape=[1,3,1,16,32],axes=['N','C','T','H','W'];
 q.referenceContext.nativeDeclarations.producer={nativeProfileId:'wan21-raw-f32-1x16x32',modelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'};
 q.artifact.tensor={...q.artifact.tensor,shape,axes,nativeMeaning:meaning};q.artifact.native.metadata.meaning=meaning;
 for(const port of [q.producerPort,q.consumerPort])port.tensor={...port.tensor,shape:[...shape],axes:[...axes]};
 q.registry.schemas[0].nativeMeanings=['rgb-unit','raw-decoder-rgb'];
 q.requiredScopes=[];q.evidence=[];q.resourceState.requiredBytes=6144;q.resourceState.budgetBytes=100000;
 return q;
}

test('N-SHAPE: Rect RGB decoder output preserves raw-decoder-rgb meaning without an affine or relabel',()=>{
 const q=rgbShapeFixture('rgb-decoder-raw','raw-decoder-rgb'),result=evaluateEdge(q);
 assert.equal(result.compatibility,'COMPATIBLE');assert.equal(result.readiness.state,'ready');
 assert.equal(q.artifact.tensor.nativeMeaning,'raw-decoder-rgb');assert.deepEqual(result.adapterRefs,[]);
});

test('N-SHAPE: explicit Rect RGB unit input retains its distinct rgb-unit meaning',()=>{
 const q=rgbShapeFixture('rgb-input-unit','rgb-unit'),result=evaluateEdge(q);
 assert.equal(result.compatibility,'COMPATIBLE');assert.equal(result.readiness.state,'ready');
 assert.equal(q.artifact.tensor.nativeMeaning,'rgb-unit');assert.deepEqual(result.adapterRefs,[]);
});

test('N-SHAPE: ambiguous RGB representation with no native meaning declaration remains unknown',()=>{
 const q=rgbShapeFixture('rgb','rgb-unit'),result=evaluateEdge(q);
 assert.equal(result.compatibility,'UNVERIFIED');assert.equal(result.readiness.state,'blocked');
 assert.ok(result.checks.some(c=>c.outcome==='unknown'&&c.fieldPath==='/tensor/nativeMeaning'));
});

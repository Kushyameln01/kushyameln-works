import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadReferenceSet,REFERENCE_CATALOG_PATH} from '../../docs/shared/ai-connection/reference-loader.mjs';
import {sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';

const root=new URL('../../',import.meta.url);
async function load(path=REFERENCE_CATALOG_PATH){
 const catalogBytes=new Uint8Array(await readFile(new URL(path,root))),catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
 const files=new Map(await Promise.all(catalog.files.map(async f=>[f.path,new Uint8Array(await readFile(new URL(f.path,root)))])));
 const expectedCatalogSha256=path===REFERENCE_CATALOG_PATH?'14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c':(await declarations()).N2_TAIL_CATALOG_REF.sha256;
 return loadReferenceSet({catalogPath:path,catalogBytes,files,expectedCatalogSha256});
}
test('explicit candidate catalog path is the authenticated receipt path and original default is preserved',async()=>{
 const path='docs/shared/ai-connection/reference/candidates/n2-tail/catalog.v1.json';
 const catalogBytes=new Uint8Array(await readFile(new URL(REFERENCE_CATALOG_PATH,root))),catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
 const files=new Map(await Promise.all(catalog.files.map(async f=>[f.path,new Uint8Array(await readFile(new URL(f.path,root)))])));
 const set=await loadReferenceSet({catalogPath:path,catalogBytes,files,expectedCatalogSha256:await sha256Bytes(catalogBytes)});
 assert.equal(set.integrityReceipts[0].path,path);
 assert.equal(set.contractRefs[0].path,path);
 assert.equal((await load()).integrityReceipts[0].path,REFERENCE_CATALOG_PATH);
});
test('catalog receipt identities reject unsafe or empty explicitly selected paths',async()=>{
 for(const catalogPath of ['',null,'../catalog.json','/catalog.json','https://example.test/catalog.json','a\\catalog.json']){
  await assert.rejects(()=>loadReferenceSet({catalogPath}),{code:'CATALOG_PATH_INVALID'});
 }
});

const candidatePath='docs/shared/ai-connection/reference/candidates/n2-tail/catalog.v1.json';
async function declarations(){return import('../../docs/shared/ai-connection/adapters/n2-tail/declarations.mjs');}
async function tailFixture(side='HIGH'){
 const m=await declarations(),referenceSet=await load(candidatePath),{edgeFixture}=await import('./fixtures.mjs'),q=edgeFixture();
 const sourceBinding={sourceRef:m.N2_TAIL_PINS.sourceRef,kernelDigest:m.N2_TAIL_PINS.mathWasm.sha256,byteLength:m.N2_TAIL_PINS.mathWasm.byteLength,bridgeWasmSHA256:m.N2_TAIL_PINS.bridgeWasm.sha256,buildId:m.N2_TAIL_PINS.buildId};
 const d=m.describeN2TailDeclarations({side,sourceBinding,trustedInputs:m.N2_TAIL_TRUSTED_INPUTS[side],artifactId:q.artifact.artifactId});
 q.artifact.profileRef=m.N2_TAIL_PROFILE_ID;q.artifact.tensor={...q.artifact.tensor,dtype:'float32',shape:[2,5120],axes:['L','C'],nativeMeaning:'block0-self-attention-residual-token-hidden'};
 for(const p of [q.producerPort,q.consumerPort]){p.profileRef=m.N2_TAIL_PROFILE_ID;p.tensor={dtypes:['float32'],shape:[2,5120],axes:['L','C']};}
 q.registry.schemas[0].nativeMeanings=['block0-self-attention-residual-token-hidden'];q.evidence=[];q.requiredScopes=[];
 q.referenceContext={referenceSet,normIds:['N-N2-TAIL-SHAPE','N-N2-TAIL-NUMERIC'],...structuredClone(d)};
 return {q,m,referenceSet};
}
test('candidate preserves all historical records and bytes and adds separate tail profile/norm records',async()=>{
 const original=await load(),candidate=await load(candidatePath);
 for(const view of ['profileRecords','normRecords','ruleRecords'])for(const [id,record]of original[view])assert.deepEqual(candidate[view].get(id),record,id);
 assert.equal(original.catalogSha256,'14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c');
 assert.equal(candidate.profileRecords.size,original.profileRecords.size+2);assert.equal(candidate.normRecords.size,original.normRecords.size+2);
 const m=await declarations(),exec=candidate.profileRecords.get(m.N2_TAIL_EXEC_RECORD_ID);
 assert.equal(exec.nativeProfileId,'bernini-block0-n2-self-attention-residual-f32-v1');
 assert.equal(exec.requiredDeclarations.buildId,'diffusion-models/0.1+bba4dc740028dcecf849a36e395970b24358a6185378336d61d3a063ad72bc74');
 assert.equal(candidate.catalog.candidate.executionSourceCommit,'a49aac492cc68e2dd6037e0deb4a6954731a847a');
 assert.equal(candidate.catalog.candidate.distributionCommit,'beffdcb800b629d0b13ff43bbc90e9f74c659152');
});
test('matching tail contracts without numerical receipt remain compatible, unverified and blocked for both fixed sides',async()=>{
 const {evaluateEdge}=await import('../../docs/shared/ai-connection/compatibility.mjs');
 for(const side of ['HIGH','LOW']){const {q}=await tailFixture(side),r=evaluateEdge(q);assert.equal(r.compatibility,'COMPATIBLE');assert.equal(r.readiness.state,'blocked');assert.ok(r.referenceTrace.validation.some(v=>v.result==='NOT_VERIFIED'));}
});
test('finite tail norms reject known wrong hidden meaning, shape, side, time, gate and preserve missing declarations as unverified',async()=>{
 const {evaluateEdge}=await import('../../docs/shared/ai-connection/compatibility.mjs');
 for(const mutate of [q=>q.artifact.tensor.nativeMeaning='mean',q=>q.artifact.tensor.shape=[5120,2],q=>q.referenceContext.nativeDeclarations.producer.side='LOW',q=>q.referenceContext.nativeDeclarations.producer.scheduleIndex=3,q=>q.referenceContext.nativeDeclarations.producer.trustedInputs.attention.contextSHA256='0'.repeat(64),q=>q.referenceContext.nativeDeclarations.producer.outputs.gate.axes=['L','C']]){
  const {q}=await tailFixture();mutate(q);assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');
 }
 for(const mutate of [q=>delete q.referenceContext.nativeDeclarations.producer.nativeProfileId,q=>q.referenceContext.normIds.push('N-N2-TAIL-UNSUPPORTED'),q=>q.referenceContext.profileBindings[1].recordId='EXEC-N2-UNKNOWN']){
  const {q}=await tailFixture();mutate(q);assert.equal(evaluateEdge(q).compatibility,'UNVERIFIED');
 }
});
test('declaration builder snapshots explicit observations without inventing a numerical receipt',async()=>{
 const m=await declarations(),trusted=structuredClone(m.N2_TAIL_TRUSTED_INPUTS.HIGH),sourceBinding={};
 const d=m.describeN2TailDeclarations({side:'HIGH',trustedInputs:trusted,sourceBinding,artifactId:'a'});trusted.tokens=3;
 assert.equal(d.nativeDeclarations.producer.trustedInputs.tokens,2);assert.equal(d.nativeDeclarations.producer.kernelDigest,null);
 assert.deepEqual(d.numericRequirements,[]);assert.ok(Object.isFrozen(d.nativeDeclarations.producer.outputs.gate));
 assert.throws(()=>m.describeN2TailDeclarations({side:'other'}),{code:'N2_TAIL_DECLARATION_INVALID'});
});
test('mandatory tail execution policy binds shape and execution producer records before any native run',async()=>{
 const {NORM_EXECUTION_POLICIES}=await import('../../docs/shared/ai-connection/norm-execution.mjs'),m=await declarations(),p=NORM_EXECUTION_POLICIES[m.N2_TAIL_POLICY_ID];
 assert.ok(p);assert.deepEqual(p.requiredNormIds,['N-IDENTITY','N-N2-TAIL-SHAPE','N-N2-TAIL-NUMERIC','N-EVIDENCE','N-TRANSACTION']);
 assert.equal(p.requiredNormIds.includes('N-ARTIFACT'),false);
 assert.deepEqual(p.requiredProfileBindings.map(x=>x.recordId),[m.N2_TAIL_SHAPE_RECORD_ID,m.N2_TAIL_EXEC_RECORD_ID]);
});
test('tail norms cannot be satisfied by omitting one native binding or selecting an unrelated historical profile',async()=>{
 const {evaluateEdge}=await import('../../docs/shared/ai-connection/compatibility.mjs');
 for(const mutate of [q=>q.referenceContext.profileBindings.pop(),q=>q.referenceContext.profileBindings.shift(),q=>q.referenceContext.profileBindings[1].side='consumer',q=>q.referenceContext.profileBindings[1].recordId='EXEC-BERNINI-Q16-F32']){
  const {q}=await tailFixture();mutate(q);assert.equal(evaluateEdge(q).compatibility,'UNVERIFIED');
 }
});
test('numeric identities bind the frozen eight gates before a receipt may authorize execution',async()=>{
 const {evaluateEdge}=await import('../../docs/shared/ai-connection/compatibility.mjs');
 for(const modify of [r=>r.gateRef.gates.localO.abs=1,r=>r.gateRef.sha256='0'.repeat(64),r=>r.gateRef.sourceRef.commit='0'.repeat(40)]){
  const {q,m}=await tailFixture();q.producerPort.sourceRef=structuredClone(m.N2_TAIL_PINS.sourceRef);
  const r={recordId:m.N2_TAIL_EXEC_RECORD_ID,scope:'controlled-boundary:tail',ownerSourceRef:structuredClone(m.N2_TAIL_PINS.sourceRef),kernelDigest:m.N2_TAIL_PINS.mathWasm.sha256,gateRef:structuredClone(m.N2_TAIL_PINS.gateRef),referenceRef:{sourceRef:m.N2_TAIL_PINS.sourceRef,sha256:'2'.repeat(64)}};
  modify(r);q.referenceContext.numericRequirements=[r];assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');
 }
});
test('declaration builder refuses mutable collection metadata instead of pretending deep immutability',async()=>{
 const m=await declarations();
 for(const args of [{trustedInputs:new Map()},{sourceBinding:{sourceRef:new Date()}},{numericRequirement:{gateRef:new Set()}}]){
  assert.throws(()=>m.describeN2TailDeclarations({side:'HIGH',...args}),{code:'N2_TAIL_DECLARATION_INVALID'});
 }
});
test('predeclared local/composed references bind fixed public receipts and payload identities per side',async()=>{
 const {evaluateEdge}=await import('../../docs/shared/ai-connection/compatibility.mjs');
 const m=await declarations();assert.ok(m.N2_TAIL_REFERENCE_REFS);
 for(const side of ['HIGH','LOW']){
  const {q}=await tailFixture(side);q.producerPort.sourceRef=structuredClone(m.N2_TAIL_PINS.sourceRef);
  const requirement={recordId:m.N2_TAIL_EXEC_RECORD_ID,scope:'controlled-boundary:reference-metadata',ownerSourceRef:structuredClone(m.N2_TAIL_PINS.sourceRef),kernelDigest:m.N2_TAIL_PINS.mathWasm.sha256,gateRef:structuredClone(m.N2_TAIL_PINS.gateRef),referenceRef:structuredClone(m.N2_TAIL_REFERENCE_REFS[side])};
  q.referenceContext.numericRequirements=[structuredClone(requirement)];assert.equal(evaluateEdge(q).compatibility,'COMPATIBLE');assert.equal(evaluateEdge(q).readiness.state,'blocked');
  for(const mutate of [r=>r.referenceRef.local.payloadSha256='0'.repeat(64),r=>r.referenceRef.composed.sha256='0'.repeat(64),r=>r.referenceRef.side=side==='HIGH'?'LOW':'HIGH',r=>r.referenceRef.sha256='0'.repeat(64)]){
   q.referenceContext.numericRequirements=[structuredClone(requirement)];mutate(q.referenceContext.numericRequirements[0]);assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');
  }
  q.referenceContext.numericRequirements=[structuredClone(requirement)];delete q.referenceContext.numericRequirements[0].referenceRef.composed;assert.equal(evaluateEdge(q).compatibility,'COMPATIBLE');assert.equal(evaluateEdge(q).readiness.state,'blocked');
 }
});
test('candidate explicitly pins historical catalog provenance and authenticates its actual bytes with the fixed catalog pin',async()=>{
 const m=await declarations(),candidate=await load(candidatePath),parentCatalogSourceRef={repository:'Kushyameln01/kushyameln-works',commit:'6dae9a6fac3e9ad29ea941f22211edbe4aa894ad',path:REFERENCE_CATALOG_PATH};
 const parentBytes=new Uint8Array(await readFile(new URL(REFERENCE_CATALOG_PATH,root)));
 assert.deepEqual(candidate.catalog.parentCatalogSourceRef,parentCatalogSourceRef);
 assert.equal(candidate.catalog.parentCatalogSha256,'14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c');
 assert.equal(candidate.catalog.parentCatalogSha256,await sha256Bytes(parentBytes));
 assert.deepEqual(m.N2_TAIL_PINS.parentCatalogSourceRef,parentCatalogSourceRef);assert.equal(m.N2_TAIL_PINS.parentCatalogSha256,candidate.catalog.parentCatalogSha256);
 const pin=m.N2_TAIL_CATALOG_REF;assert.ok(pin);assert.equal(pin.path,candidatePath);assert.equal(pin.sha256,candidate.catalogSha256);
 const catalogBytes=new Uint8Array(await readFile(new URL(pin.path,root)));assert.equal(catalogBytes.byteLength,pin.byteLength);
 const files=new Map(await Promise.all(candidate.catalog.files.map(async f=>[f.path,new Uint8Array(await readFile(new URL(f.path,root)))])));
 const loaded=await loadReferenceSet({catalogPath:pin.path,catalogBytes,files,expectedCatalogSha256:pin.sha256});assert.equal(loaded.integrityReceipts[0].path,pin.path);assert.equal(loaded.integrityReceipts[0].sha256,pin.sha256);
 const changed=new Uint8Array(catalogBytes.length+1);changed.set(catalogBytes);changed[changed.length-1]=32;
 await assert.rejects(()=>loadReferenceSet({catalogPath:pin.path,catalogBytes:changed,files,expectedCatalogSha256:pin.sha256}),{code:'CATALOG_HASH_MISMATCH'});
});

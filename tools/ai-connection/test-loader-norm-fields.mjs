// Contract comparisons only: expected literals come from fixed6dae loader policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadReferenceSet} from '../../docs/shared/ai-connection/reference-loader.mjs';
import {evaluateEdge} from '../../docs/shared/ai-connection/compatibility.mjs';
import {edgeFixture} from './fixtures.mjs';
const root=new URL('../../',import.meta.url),catalogBytes=new Uint8Array(await readFile(new URL('docs/shared/ai-connection/reference/catalog.v1.json',root)));
const catalog=JSON.parse(new TextDecoder().decode(catalogBytes));
const files=new Map(await Promise.all(catalog.files.map(async r=>[r.path,new Uint8Array(await readFile(new URL(r.path,root)))])));
const referenceSet=await loadReferenceSet({catalogBytes,files,expectedCatalogSha256:'14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c'});
function fixture(){const q=edgeFixture();q.referenceContext={referenceSet,normIds:['N-LOADER'],profileBindings:[{recordId:'LOAD-COMFY-LINEAR-DIFF',side:'producer',representation:'loader'}],nativeDeclarations:{producer:{loaderPolicyId:'comfy-lora-b5a4321-linear-diff-v1',variant:'linear-down-up',sourceDtype:'BF16',targetRank:2,strength:0,baseDtype:'F32',outputDtype:'F32',layout:'row-major'}}};return q;}
test('loader declared F32 base/output and row-major preserve compatible standalone declaration input',()=>{const q=fixture(),before=structuredClone(q.artifact),r=evaluateEdge(q);assert.equal(r.compatibility,'COMPATIBLE');assert.deepEqual(q.artifact,before);});
for(const [field,conflict] of [['baseDtype','F16'],['outputDtype','BF16'],['layout','column-major']]){
 test(`loader missing ${field} is UNVERIFIED with a field/norm reason`,()=>{const q=fixture();delete q.referenceContext.nativeDeclarations.producer[field];const r=evaluateEdge(q);assert.equal(r.compatibility,'UNVERIFIED');assert.equal(r.readiness.state,'blocked');assert.ok(r.checks.some(c=>c.normId==='N-LOADER'&&c.fieldPath===`/referenceContext/nativeDeclarations/producer/${field}`&&c.outcome==='unknown'));});
 test(`loader conflicting ${field} is INCOMPATIBLE rather than missing numerical evidence`,()=>{const q=fixture();q.referenceContext.nativeDeclarations.producer[field]=conflict;const r=evaluateEdge(q);assert.equal(r.compatibility,'INCOMPATIBLE');assert.ok(r.checks.some(c=>c.normId==='N-LOADER'&&c.fieldPath===`/referenceContext/nativeDeclarations/producer/${field}`&&c.outcome==='mismatch'));});
}
function observedFixture(){
 const q=fixture(),d=q.referenceContext.nativeDeclarations.producer;
 q.referenceContext.requireLoaderObservations=true;
 const n=d.numericDeclarations={key:'layer.q',weightId:'weight:q',baseDtype:'F32',outputDtype:'F32',layout:'row-major',baseLayout:'row-major',presence:{observed:{}},origins:{observed:{}},observed:{}};
 for(const [name,path] of [['baseDtype','/nativeRegistry/targets/0/computeDtype'],['outputDtype','/connectionRegistry/targets/0/dtype'],['layout','/connectionRegistry/targets/0/layout'],['baseLayout','/nativeRegistry/targets/0/layout']]){
  n.presence[name]=true;n.origins[name]={container:'ownerBinding',path,key:n.key,weightId:n.weightId};
 }
 for(const [group,fields] of [['native',{dtype:'F32',computeDtype:'F32',layout:'row-major',storageDtype:'FP8_E4M3FN'}],['connection',{dtype:'F32',layout:'row-major'}],['target',{dtype:'F32',layout:'row-major'}]]){
  n.observed[group]=fields;n.presence.observed[group]={};n.origins.observed[group]={};
  for(const field of Object.keys(fields)){
   n.presence.observed[group][field]=true;
   n.origins.observed[group][field]={container:group==='target'?'plan':'ownerBinding',path:group==='target'?`/operations/0/target/${field}`:`/${group==='native'?'nativeRegistry':'connectionRegistry'}/targets/0/${field}`,key:n.key,weightId:n.weightId};
  }
 }
 return q;
}
test('formal DATA loader observations preserve FP8 storage separately from F32 prepared values',()=>{
 const q=observedFixture(),before=structuredClone(q.referenceContext.nativeDeclarations.producer.numericDeclarations);
 assert.equal(evaluateEdge(q).compatibility,'COMPATIBLE');assert.deepEqual(q.referenceContext.nativeDeclarations.producer.numericDeclarations,before);
});
for(const [group,field,bad] of [['native','dtype','F16'],['native','computeDtype','BF16'],['connection','dtype','F16'],['target','dtype','F16'],['native','layout','column-major'],['connection','layout','column-major'],['target','layout','column-major']]){
 test(`DATA ${group}.${field} observation conflicts are INCOMPATIBLE`,()=>{
  const q=observedFixture();q.referenceContext.nativeDeclarations.producer.numericDeclarations.observed[group][field]=bad;
  const r=evaluateEdge(q);assert.equal(r.compatibility,'INCOMPATIBLE');assert.ok(r.checks.some(c=>c.fieldPath.endsWith(`/observed/${group}/${field}`)&&c.outcome==='mismatch'));
 });
 test(`DATA ${group}.${field} missing observation is UNVERIFIED`,()=>{
  const q=observedFixture(),n=q.referenceContext.nativeDeclarations.producer.numericDeclarations;
  delete n.observed[group][field];n.presence.observed[group][field]=false;
  const r=evaluateEdge(q);assert.equal(r.compatibility,'UNVERIFIED');assert.ok(r.checks.some(c=>c.fieldPath.endsWith(`/observed/${group}/${field}`)&&c.outcome==='unknown'));
 });
}
for(const field of ['presence','origins'])test(`formal DATA missing ${field} cannot rely on matching F32 literals`,()=>{
 const q=observedFixture();delete q.referenceContext.nativeDeclarations.producer.numericDeclarations[field];assert.equal(evaluateEdge(q).compatibility,'UNVERIFIED');
});
test('formal DATA false or foreign observation provenance is incompatible',()=>{
 const q=observedFixture();q.referenceContext.nativeDeclarations.producer.numericDeclarations.origins.observed.target.dtype.container='ownerBinding';assert.equal(evaluateEdge(q).compatibility,'INCOMPATIBLE');
});
test('formal DATA omission cannot fall back to a standalone loader declaration',()=>{
 const q=fixture();q.referenceContext.requireLoaderObservations=true;assert.equal(evaluateEdge(q).compatibility,'UNVERIFIED');
});

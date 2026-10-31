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

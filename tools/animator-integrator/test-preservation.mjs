// External execution only. Authored under static-only verification; not run in Codex.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {integratorFixture,GUIDS,MOTIONS,MASK,asset,PREAMBLE,tree,clip,doc,behaviour,parameter} from './fixture.mjs';
import {integratePackages,importSources} from '../../docs/shared/animator-integrator/integrate.mjs';
import {readUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {indexPackages} from '../../docs/animator-composer/lib/composition.mjs';
import {assertPreservedSources,preservedOutputPath} from '../../docs/shared/animator-integrator/materialize-preserved.mjs';
import {splitUnityDocuments,extractReferences,extractAnimatorLayers} from '../../docs/shared/ft/unity-text.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
const kernel=await instantiateFtKernel(fs.readFileSync(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url)));
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{ignoreBOM:true}),run=f=>integratePackages(f.packages,f.request,kernel);
const parent='Assets/Merged_DecodeAndSmooth';
// Independent expected path derivation, not the production mapper.
const expectedPath=path=>path===parent||path.startsWith(parent+'/')?path:parent+'/'+path.substring('Assets/'.length);
function folder(guid,path){return {guid,path,asset:null,meta:`fileFormatVersion: 2\nguid: ${guid}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: original-folder\n`};}
test('all original files and unreferenced embedded/standalone motions survive byte-identically under the sole parent prefix',async()=>{
 const f=integratorFixture(),host=f.packages[0].assets.find(a=>a.guid===MOTIONS);host.asset=enc.encode(dec.decode(host.asset)+clip('8000000000000001234','Unreferenced embedded Clip').slice(PREAMBLE.length));
 const loose=asset('b7'.repeat(16),'Assets/Unselected/A tree !.asset',PREAMBLE+tree('20612345','Unselected Tree','NotUsed'),'20612345');f.packages[0].assets.push(loose,folder('b8'.repeat(16),'Assets/Unselected'));
 const before=structuredClone(f.packages),r=await run(f);assert.deepEqual(f.packages,before);
 for(const original of f.packages[0].assets.filter(a=>![GUIDS.base,GUIDS.add,GUIDS.expr].includes(a.guid))){const out=r.diagnosticAssets.find(a=>a.guid===original.guid);assert(out,original.path);assert.equal(out.path,expectedPath(original.path));assert.equal(out.meta,original.meta);assert.deepEqual(out.asset,original.asset);}
 const outHost=r.diagnosticAssets.find(a=>a.guid===MOTIONS);assert.deepEqual(splitUnityDocuments(dec.decode(outHost.asset)).documents.map(d=>[d.fileId,d.text]),splitUnityDocuments(dec.decode(host.asset)).documents.map(d=>[d.fileId,d.text]));
 assert(r.diagnosticAssets.every(a=>a.path===parent||a.path.startsWith(parent+'/')));assert.equal(r.report.preservation.parentFolder.created,true);const reopened=[...readUnityPackage(r.archive).values()];for(const folder of r.diagnosticAssets.filter(a=>a.asset===null)){const restored=reopened.find(a=>a.guid===folder.guid);assert.equal(restored.asset,null);assert.equal(restored.path,folder.path);assert.equal(restored.meta,folder.meta);}assert.equal(r.diagnosticAssets.filter(a=>!f.packages[0].assets.some(s=>s.guid===a.guid)).length,1);
});
test('destination names/GUIDs/nonstandard main IDs/meta survive and request.name only names the archive',async()=>{
 const f=integratorFixture(),base=f.packages[0].assets.find(a=>a.guid===GUIDS.base),expr=f.packages[0].assets.find(a=>a.guid===GUIDS.expr);
 base.asset=enc.encode('\uFEFF'+dec.decode(base.asset).replaceAll('9100000','9100031'));base.meta=base.meta.replaceAll('9100000','9100031');f.request.controllerIds[0]=GUIDS.base+':9100031';
 expr.asset=enc.encode(dec.decode(expr.asset).replaceAll('11400000','11400031').replace('m_Name: "ExpressionParameters"','m_Name: "Original Expression Name"'));expr.meta=expr.meta.replaceAll('11400000','11400031');f.request.expressionIds[0]=GUIDS.expr+':11400031';f.request.name='ArchiveNameOnly';
 const r=await run(f),b=r.diagnosticAssets.find(a=>a.guid===GUIDS.base),e=r.diagnosticAssets.find(a=>a.guid===GUIDS.expr);assert.equal(b.meta,base.meta);assert.equal(e.meta,expr.meta);assert.equal(b.path,expectedPath(base.path));assert.equal(e.path,expectedPath(expr.path));assert.equal(dec.decode(b.asset).charCodeAt(0),0xfeff);
 for(const [original,output,id]of [[base,b,'9100031'],[expr,e,'11400031']]){const sourceDoc=splitUnityDocuments(dec.decode(original.asset)).documents.find(d=>d.fileId===id),outDoc=splitUnityDocuments(dec.decode(output.asset)).documents.find(d=>d.fileId===id);assert.equal(outDoc.header,sourceDoc.header);assert.equal(/^  m_Name:.*$/m.exec(outDoc.text)[0],/^  m_Name:.*$/m.exec(sourceDoc.text)[0]);}
 assert(!r.diagnosticAssets.some(a=>a.path.includes('ArchiveNameOnly')));assert.equal(r.report.controllers[0].fileId,'9100031');
});
test('base structural IDs stay, only colliding added IDs move, and base embedded Motion documents stay in place',async()=>{
 const f=integratorFixture(),base=f.packages[0].assets.find(a=>a.guid===GUIDS.base);base.asset=enc.encode(dec.decode(base.asset)+tree('777','Base embedded Tree','BaseInput'));
 const before=splitUnityDocuments(dec.decode(base.asset)).documents,r=await run(f),out=splitUnityDocuments(dec.decode(r.diagnosticAssets.find(a=>a.guid===GUIDS.base).asset)).documents;
 for(const d of before.filter(d=>d.classId!=='91'))assert.equal(out.find(o=>o.fileId===d.fileId).text,d.text);
 assert(r.report.preservation.structuralFileIdChanges.some(c=>c.sourceId===GUIDS.add+':100'));assert(r.report.preservation.structuralFileIdChanges.some(c=>c.sourceId===GUIDS.add+':200'));assert(!r.report.preservation.structuralFileIdChanges.some(c=>c.sourceId===GUIDS.add+':999'));
 assert.equal(r.report.composition.objectMapping.find(m=>m.sourceId===GUIDS.add+':201').outputFileId,'201');
});
test('embedded additional hosts and missing Expression destination block instead of extraction or identity issuance',async()=>{
 for(const cls of ['206','319']){const f=integratorFixture(),add=f.packages[0].assets.find(a=>a.guid===GUIDS.add);add.asset=enc.encode(dec.decode(add.asset)+(cls==='206'?tree('300','Embedded source','Axis'):doc(319,'300','AvatarMask:\n  m_Name: Inner\n  m_Elements: []\n')));await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='preservation_embedded_host'&&i.hostGuid===GUIDS.add&&i.objects.some(o=>o.id===GUIDS.add+':300')));}
 const f=integratorFixture();f.request.expressionIds=[];await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='expression_destination_missing'));
 const g=integratorFixture(),guid='b9'.repeat(16),expr=structuredClone(g.packages[0].assets.find(a=>a.guid===GUIDS.expr));expr.guid=guid;expr.path='Assets/AdditionalExpression.asset';expr.meta=expr.meta.replace(GUIDS.expr,guid);expr.asset=enc.encode(dec.decode(expr.asset)+tree('9999','Co-hosted','Axis'));g.packages[0].assets.push(expr);g.request.expressionIds.push(guid+':11400000');await assert.rejects(run(g),e=>e.issues.some(i=>i.code==='preservation_embedded_host'&&i.hostGuid===guid));
});
test('raw GUID/path and relocated-path conflicts block without automatic renaming',async()=>{
 for(const mode of ['same-guid-other-path','same-path-other-guid','relocated-path']){const f=integratorFixture(),original=f.packages[0].assets.find(a=>a.guid===MASK),copy=structuredClone(original);
  if(mode==='same-guid-other-path')copy.path='Assets/Another.mask';else{copy.guid='ba'.repeat(16);copy.meta=copy.meta.replace(MASK,copy.guid);if(mode==='relocated-path')copy.path=parent+'/'+original.path.slice(7);}f.packages[0].assets.push(copy);await assert.rejects(run(f),e=>e.issues.some(i=>['preservation_guid_conflict','preservation_path_conflict','preservation_relocation_conflict'].includes(i.code)));}
});
test('source metadata backreferences to absorbed hosts block with exact original edge',async()=>{
 const f=integratorFixture(),clip=f.packages[0].assets.find(a=>a.guid===GUIDS.clip);clip.meta=clip.meta.replace('  externalObjects: {}',`  externalObjects:\n  - first:\n      type: AnimatorController\n      assembly: UnityEditor\n    second: {fileID: 9100000, guid: ${GUIDS.add}, type: 2}`);
 await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='preservation_reference_missing'&&i.sourceId===GUIDS.clip+':meta'&&i.targetId===GUIDS.add+':9100000'));
});
test('existing parent GUID/meta is reused without double prefixes; only a new parent may receive a new GUID',async()=>{
 const f=integratorFixture();for(const a of f.packages[0].assets)a.path=parent+'/'+a.path.slice(7);const existing=folder('bb'.repeat(16),parent);f.packages[0].assets.push(existing);const r=await run(f);assert.equal(r.report.preservation.parentFolder.created,false);assert.equal(r.report.preservation.parentFolder.guid,existing.guid);assert.equal(r.diagnosticAssets.find(a=>a.guid===existing.guid).meta,existing.meta);assert(r.diagnosticAssets.every(a=>f.packages[0].assets.some(s=>s.guid===a.guid)));assert(!r.diagnosticAssets.some(a=>a.path.includes('/Merged_DecodeAndSmooth/Merged_DecodeAndSmooth/')));
 const g=integratorFixture(),guid=createHash('sha256').update('animator-integrator-parent-folder-v1:'+parent).digest('hex').slice(0,32);g.packages[0].assets.push(asset(guid,'Assets/Collision.anim',clip(),'7400000'));await assert.rejects(run(g),e=>e.issues.some(i=>i.code==='preservation_parent_guid_conflict'));
});
test('standalone basenames cannot invent original paths, and product assertions reject source-byte mutation',async()=>{
 const f=integratorFixture(),a=f.packages[0].assets.find(a=>a.guid===MASK);await assert.rejects(importSources([{name:'Chosen.mask',bytes:a.asset},{name:'Chosen.mask.meta',bytes:enc.encode(a.meta)}]),e=>e.issues.some(i=>i.code==='preservation_original_path_required'));
 const r=await run(f),tampered=structuredClone(r.diagnosticAssets);tampered.find(a=>a.guid===GUIDS.clip).asset[0]^=1;assert.throws(()=>assertPreservedSources(indexPackages(f.packages),tampered,r.report.preservation),e=>e.issues.some(i=>i.code==='preservation_source_changed'));
 assert.equal(preservedOutputPath('Assets/A.asset'),'Assets/Merged_DecodeAndSmooth/A.asset');assert.equal(preservedOutputPath(parent+'/A.asset'),parent+'/A.asset');
});

test('imported AnimatorLayerControl retargets only its layer index in the merged structural graph',async()=>{
 const f=integratorFixture(),add=f.packages[0].assets.find(a=>a.guid===GUIDS.add);add.asset=enc.encode(dec.decode(add.asset).replace('  m_StateMachineBehaviours: []','  m_StateMachineBehaviours:\n  - {fileID: 500}')+behaviour('500','-1936262289','  playable: 1\n  layer: 1\n  goalWeight: 0\n  blendDuration: 0.3\n  debugString: \n'));const source=Uint8Array.from(add.asset),r=await run(f),controller=r.diagnosticAssets.find(a=>a.guid===GUIDS.base),control=splitUnityDocuments(dec.decode(controller.asset)).documents.find(d=>d.fileId==='500');
 assert(control.text.includes('  layer: 2\n'));assert(control.text.includes('  playable: 1\n'));assert(control.text.includes('  goalWeight: 0\n'));assert.deepEqual(add.asset,source);
});
test('untouched Animator parameter rows retain inactive defaults, extra fields and null Controller pointers',async()=>{
 const f=integratorFixture(),base=f.packages[0].assets.find(a=>a.guid===GUIDS.base),original=parameter('BaseInput').replace('    m_DefaultInt: 0','    m_DefaultInt: 777').replace('    m_DefaultBool: 0','    m_DefaultBool: 1').replace('    m_Controller: {fileID: 9100000}','    m_Controller: {fileID: 0}');base.asset=enc.encode(dec.decode(base.asset).replace(parameter('BaseInput'),original));const r=await run(f),text=dec.decode(r.diagnosticAssets.find(a=>a.guid===GUIDS.base).asset);assert(text.includes(original));
});

// External execution only; current rule changes have static verification only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {integratorFixture,GUIDS,MOTIONS,PREAMBLE,asset,parameter,tree,doc,MASK} from './fixture.mjs';
import {splitUnityDocuments,extractAnimatorLayers,extractAnimatorParameters,extractReferences} from '../../docs/shared/ft/unity-text.mjs';
import {parseExpression,serializeExpression} from '../../docs/animator-composer/lib/registration.mjs';
import {readUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
const core=await import('../../docs/shared/animator-integrator/integrate.mjs').catch(()=>({}));
const kernel=await instantiateFtKernel(fs.readFileSync(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url)));
const dec=new TextDecoder(),enc=new TextEncoder();
const run=f=>core.integratePackages(f.packages,f.request,kernel);
const ctrlIdentity=assets=>assets.find(a=>a.guid===GUIDS.base);
test('whole controllers, independent Expressions, roots, all masks and weights roundtrip without source mutation',async()=>{
 assert.equal(typeof core.integratePackages,'function','integration core must exist');
 const f=integratorFixture(),before=structuredClone(f.packages),r=await run(f),assets=[...readUnityPackage(r.archive).values()];
 assert.deepEqual(f.packages,before);assert.equal(r.assetCount,assets.length);assert.equal(ctrlIdentity(assets).guid,GUIDS.base);for(const original of f.packages[0].assets.filter(a=>![GUIDS.base,GUIDS.add,GUIDS.expr].includes(a.guid))){const output=assets.find(a=>a.guid===original.guid);assert(output);assert.equal(output.path,'Assets/Merged_DecodeAndSmooth/'+original.path.slice(7));assert.equal(output.meta,original.meta);assert.deepEqual(output.asset,original.asset);}assert.equal(assets.find(a=>a.guid===GUIDS.base).meta,f.packages[0].assets[0].meta);assert.equal(assets.find(a=>a.guid===GUIDS.expr).meta,f.packages[0].assets.find(a=>a.guid===GUIDS.expr).meta);assert(!assets.some(a=>a.path.includes('Installer')));
 const ctrl=assets.find(a=>a.path.endsWith('.controller')),text=dec.decode(ctrl.asset),layers=extractAnimatorLayers(text);
 assert.deepEqual(layers.map(l=>l.name),['Base Layer','Add Layer','NotSelected','Root_BinaryParameter','Root_Smooth_Parameter']);
 const maskRefs=layers.map(l=>extractReferences(l.fields.m_Mask)[0]);
 assert(maskRefs.every(r=>r.guid===maskRefs[0].guid&&r.fileId===maskRefs[0].fileId));assert(layers.every(l=>l.fields.m_DefaultWeight==='1'));
 const params=extractAnimatorParameters(text);assert(params.some(p=>p.name==='EntirelyUnused'));assert(params.some(p=>p.name==='AlwaysOne'&&p.fields.m_Type==='1'&&p.fields.m_DefaultFloat==='1'));
 const docs=splitUnityDocuments(text).documents;assert(docs.some(d=>d.text.includes('m_Name: Unreachable')));
 assert.equal(docs.filter(d=>d.classId==='1102'&&/m_WriteDefaultValues: 1/.test(d.text)).length,2);
 const all=assets.flatMap(a=>a.asset&&/^%YAML|^--- !u!/m.test(dec.decode(a.asset))?splitUnityDocuments(dec.decode(a.asset)).documents.map(d=>({...d,guid:a.guid})):[]),byId=new Map(all.map(d=>[`${d.guid}:${d.fileId}`,d]));
 for(const [rootIndex,layer] of layers.slice(-2).entries()){const machine=byId.get(`${ctrl.guid}:${extractReferences(layer.fields.m_StateMachine)[0].fileId}`),defaultRef=extractReferences(/^  m_DefaultState:.*$/m.exec(machine.text)[0])[0],state=byId.get(`${ctrl.guid}:${defaultRef.fileId}`),motion=extractReferences(/^  m_Motion:.*$/m.exec(state.text)[0])[0];assert.equal(byId.get(`${motion.guid??ctrl.guid}:${motion.fileId}`).classId,'206');const mapping=r.report.composition.objectMapping.find(m=>m.outputGuid===(motion.guid??ctrl.guid)&&m.outputFileId===motion.fileId);assert.equal(mapping.sourceId,[f.request.binaryTreeId,f.request.smoothTreeId][rootIndex]);}
 const expression=assets.find(a=>a.guid===GUIDS.expr),rows=parseExpression(dec.decode(expression.asset));
 assert.deepEqual(rows,[{name:'ExternalOnly',type:'Float',defaultValue:0.25,saved:true,networkSynced:true},{name:'AlwaysOne',type:'Float',defaultValue:1,saved:true,networkSynced:false}]);
 assert.equal(r.report.staticValidation.status,'PASS');assert.equal(r.report.verification.unityImport,'UNVERIFIED');
 for(const d of all)for(const ref of extractReferences(d.text))if(ref.fileId!=='0'&&ref.guid!=='67cc4cb7839cd3741b63733d5adf0442')assert(byId.has(`${ref.guid??d.guid}:${ref.fileId}`),`unresolved ${ref.text}`);
 const mask=assets.find(a=>a.guid===maskRefs[0].guid);assert.equal(dec.decode(mask.asset).replace(/&31900000/,'&31900000'),dec.decode(f.packages[0].assets.find(a=>a.guid===MASK).asset));
 for(const mapping of r.report.composition.objectMapping.filter(m=>[`${MOTIONS}:300`,`${MOTIONS}:301`,`${GUIDS.clip}:7400000`].includes(m.sourceId))){const original=f.packages[0].assets.find(a=>a.guid===mapping.sourceId.split(':')[0]);const source=splitUnityDocuments(dec.decode(original.asset)).documents.find(d=>d.fileId===mapping.sourceId.split(':')[1]);const output=byId.get(`${mapping.outputGuid}:${mapping.outputFileId}`);assert.equal(/^  m_ObjectHideFlags:.*$/m.exec(output.text)?.[0],/^  m_ObjectHideFlags:.*$/m.exec(source.text)?.[0]);}
});
test('missing AlwaysOne added local unsaved; no other Animator names automatically registered',async()=>{const f=integratorFixture();f.packages[0].assets.find(a=>a.guid===GUIDS.expr).asset=enc.encode(serializeExpression([]));const r=await run(f);const expr=r.diagnosticAssets.find(a=>a.guid===GUIDS.expr);assert.deepEqual(parseExpression(dec.decode(expr.asset)),[{name:'AlwaysOne',type:'Float',defaultValue:1,saved:false,networkSynced:false}]);assert.equal(r.report.alwaysOne.expressionAdded,true);});
test('conflicting non-AlwaysOne Animator defaults and duplicate layer names block output',async()=>{const f=integratorFixture();f.packages[0].assets[1].asset=enc.encode(dec.decode(f.packages[0].assets[1].asset).replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+parameter('BaseInput',1,0.5)));await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='animator_conflict'));const g=integratorFixture();g.packages[0].assets[1].asset=enc.encode(dec.decode(g.packages[0].assets[1].asset).replace('m_Name: Add Layer','m_Name: Base Layer'));await assert.rejects(run(g),e=>e.issues.some(i=>i.message.includes('Duplicate output Layer')));});
test('Expression conflicts remain independent and AlwaysOne flags still conflict',async()=>{const f=integratorFixture(),id='ab'.repeat(16);f.packages[0].assets.push(asset(id,'Assets/Other.asset',serializeExpression([{name:'ExternalOnly',type:'Float',defaultValue:0.5,saved:true,networkSynced:true}]),'11400000'));f.request.expressionIds.push(`${id}:11400000`);await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='expression_conflict'));});
test('wrong class and missing unrelated graph dependencies block',async()=>{const f=integratorFixture();f.request.binaryTreeId=`${GUIDS.clip}:7400000`;await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='selection_type'));const g=integratorFixture();g.packages[0].assets=g.packages[0].assets.filter(a=>a.guid!==GUIDS.clip);await assert.rejects(run(g),e=>e.issues.some(i=>i.code==='dependency_missing'));});
test('input reads exact package identities and standalone asset+meta, refuses unsupported sources',async()=>{assert.equal(typeof core.importSources,'function');const f=integratorFixture(),r=await core.importSources(f.sources);assert.equal(r.catalog.controllers.length,2);assert.equal(r.catalog.masks.length,1);assert(r.catalog.blendTrees.every(x=>x.id.includes(':')));assert.equal(r.inputHashes[0].length,64);const a=f.packages[0].assets.find(a=>a.guid===MASK);const s=await core.importSources([{name:'Assets/Selected.mask',bytes:a.asset},{name:'Assets/Selected.mask.meta',bytes:enc.encode(a.meta)}]);assert.equal(s.catalog.masks.length,1);await assert.rejects(core.importSources([{name:'x.zip',bytes:enc.encode('x')}]),/unsupported/i);});
test('v2-prefixed exact defaults normalize both domains while bare and alias names retain inputs',async()=>{
 const f=integratorFixture(),names=['v2/EyeLidLeft','v2/EyeLidRight','v2/EyeLid'],untouched=[{name:'EyeLidLeft',type:'Float',defaultValue:0.2},{name:'EyeLidRight',type:'Int',defaultValue:0},{name:'EyeLid',type:'Float',defaultValue:0.4},{name:'v2.EyeLidLeft',type:'Float',defaultValue:0.3},{name:'Prefix/v2/EyeLidRight',type:'Float',defaultValue:0.6},{name:'v2/eyelid',type:'Float',defaultValue:0.5},{name:'v2/EyeLidLeftExtra',type:'Float',defaultValue:0.1}];
 for(const a of f.packages[0].assets.slice(0,2))a.asset=enc.encode(dec.decode(a.asset).replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+names.map(name=>parameter(name,3,0)).join('')+untouched.map(p=>parameter(p.name,p.type==='Float'?1:3,p.defaultValue)).join('')));
 const expr=f.packages[0].assets.find(a=>a.guid===GUIDS.expr);expr.asset=enc.encode(serializeExpression([{name:'AlwaysOne',type:'Int',defaultValue:0,saved:true,networkSynced:false},...names.map(name=>({name,type:'Int',defaultValue:0,saved:true,networkSynced:false})),...untouched.map(p=>({...p,saved:false,networkSynced:false}))]));
 const r=await run(f);
 for(const list of [r.report.animatorParameters,r.report.parameters]){for(const name of names){const p=list.find(p=>p.name===name);assert.deepEqual([p.type,p.defaultValue],['Float',0.75]);}for(const expected of untouched){const actual=list.find(p=>p.name===expected.name);assert.deepEqual({name:actual.name,type:actual.type,defaultValue:actual.defaultValue},expected);}}
 assert(r.report.defaultValueRules.changes.some(c=>c.domain==='expression'&&c.name==='v2/EyeLidRight'&&c.before.type==='Int'&&c.after.defaultValue===0.75));
 const g=integratorFixture();g.packages[0].assets.find(a=>a.guid===GUIDS.expr).asset=enc.encode(serializeExpression([]));const v=await run(g);assert(!v.report.parameters.some(p=>p.name.startsWith('v2/EyeLid')));
});
test('explicit layer renames use GUID:fileID:sourceIndex keys and base metadata survives',async()=>{
 const f=integratorFixture();f.packages[0].assets[1].asset=enc.encode(dec.decode(f.packages[0].assets[1].asset).replace('m_Name: Add Layer','m_Name: Base Layer'));
 f.request.layerNames={[`${GUIDS.add}:9100000:0`]:'Explicit Name'};f.packages[0].assets[0].meta+='  userMarker: retain-base\n';
 const clip=f.packages[0].assets.find(a=>a.guid===GUIDS.clip);clip.meta=clip.meta.replace('  userData: ','  userData: original-clip-importer');
 const r=await run(f),ctrl=r.diagnosticAssets.find(a=>a.path.endsWith('.controller'));assert(extractAnimatorLayers(dec.decode(ctrl.asset)).some(l=>l.name==='Explicit Name'));assert(ctrl.meta.includes('userMarker: retain-base'));assert(r.diagnosticAssets.find(a=>a.path.endsWith('.anim')).meta.includes('original-clip-importer'));
});
test('Expression duplicate definitions merge once; conflicting AlwaysOne flags remain blocked',async()=>{
 const f=integratorFixture(),id='ab'.repeat(16),expression=f.packages[0].assets.find(a=>a.guid===GUIDS.expr);f.packages[0].assets.push({...structuredClone(expression),guid:id,path:'Assets/Copy.asset',meta:expression.meta.replace(GUIDS.expr,id)});f.request.expressionIds.push(`${id}:11400000`);
 const r=await run(f);assert.equal(r.report.parameters.length,2);
 f.packages[0].assets.at(-1).asset=enc.encode(dec.decode(expression.asset).replace('    networkSynced: 0','    networkSynced: 1'));await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='expression_conflict'&&i.name==='AlwaysOne'));
});
test('source weight provenance records authorized replacement of imported zero weights',async()=>{const r=await run(integratorFixture());const entry=r.report.composition.layerMapping.find(l=>l.sourceControllerId===`${GUIDS.add}:9100000`&&l.sourceLayer===1);assert.equal(entry.sourceEffectiveWeight,0);assert.equal(entry.outputWeight,1);});
test('explicit supported Playable context passes through; invalid Playable is rejected',async()=>{
 const f=integratorFixture();f.request.playable='Gesture';const r=await run(f);assert.equal(r.report.controllers[0].playable,'Gesture');assert.equal(r.report.request.playable,'Gesture');
 f.request.playable='Unknown';await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='options'));
});

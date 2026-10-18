import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture,asset,GUIDS,SDK,PREAMBLE,doc,ref} from './fixture-composition.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
import {serializeExpression,parseExpression} from '../../docs/animator-composer/lib/registration.mjs';
import {analyze,generate,validateAssets,digest} from '../../docs/animator-composer/lib/generate.mjs';
import {readUnityPackage,writeUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {splitUnityDocuments,extractReferences,extractAnimatorParameters,extractAnimatorLayers,parseUnityScalar} from '../../docs/shared/ft/unity-text.mjs';
const enc=new TextEncoder(),dec=new TextDecoder();
export function generationFixture(){
  const f=fixture(),p=f.plan,o=p.outputs[0];
  o.layerNames={'add:0':'Imported Feature'};o.layerOrder=[{blockId:'base',index:0},{blockId:'add',index:0}];
  f.packages[0].assets.push(asset(GUIDS.expr,'Assets/Registration.asset',serializeExpression([
    {name:'Axis',type:'Float',defaultValue:.75,networkSynced:true,saved:false},
    {name:'MenuOnly',type:'Int',defaultValue:3,networkSynced:false,saved:true}
  ]),'11400000'));
  p.globalExpressionId=`${GUIDS.expr}:11400000`;p.parameterEdits.Axis={applyAnimatorDefault:true};
  f.packages[0].assets.push(asset(GUIDS.menu,'Assets/Menu.asset',PREAMBLE+doc(114,'11400000',
    `MonoBehaviour:\n  m_ObjectHideFlags: 0\n  m_GameObject: {fileID: 0}\n  m_Enabled: 1\n  m_Script: {fileID: -340790334, guid: ${SDK}, type: 3}\n  m_Name: Menu\n  m_EditorClassIdentifier: \n  controls:\n  - name: Test\n    icon: {fileID: 0}\n    type: 1\n    parameter:\n      name: MenuOnly\n    value: 1\n    style: 0\n    subMenu: {fileID: 0}\n    subParameters: []\n    labels: []\n  Parameters: ${ref('11400000',GUIDS.expr)}\n`),'11400000'));
  p.installer.menuId=`${GUIDS.menu}:11400000`;
  return f;
}
// Avoid running tests when this fixture module is imported by the Worker harness.
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 const kernel=await instantiateFtKernel(await readFile(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url)));
 const {packages,plan}=generationFixture(),source=packages.map(p=>p.assets.map(a=>({guid:a.guid,bytes:a.asset?.slice(),meta:a.meta})));
 const prepared=analyze(packages,plan,kernel);
 assert.equal(prepared.view.ready,true,JSON.stringify(prepared.view.issues));
 assert.deepEqual(prepared.registration.registrations.map(p=>p.name),['Axis','MenuOnly']);
 assert.equal(prepared.registration.animators.fx.find(p=>p.name==='Axis').defaultValue,.75);
 const result=await generate(packages,plan,kernel);
 const emitted=[...readUnityPackage(result.archive).values()];
 assert.equal(emitted.length,result.assetCount);assert.equal(result.report.bitCost,8);
 const expression=emitted.find(a=>a.path.endsWith('/Parameters/ExpressionParameters.asset'));
 assert.deepEqual(parseExpression(dec.decode(expression.asset)),[
   {name:'Axis',type:'Float',defaultValue:.75,saved:false,networkSynced:true},
   {name:'MenuOnly',type:'Int',defaultValue:3,saved:true,networkSynced:false}
 ]);
 const controller=emitted.find(a=>a.path.endsWith('.controller'));
 const text=dec.decode(controller.asset);
 assert.deepEqual(extractAnimatorLayers(text).map(l=>l.name),['Base Layer','Imported Feature']);
 const params=extractAnimatorParameters(text);assert.equal(Number(params.find(p=>p.name==='Axis').fields.m_DefaultFloat),.75);
 assert(!params.some(p=>p.name==='Unused'));assert(params.some(p=>p.name==='KeptUnused'));
 assert(!splitUnityDocuments(text).documents.some(d=>d.classId==='206'||d.classId==='74'),'Motion must be visible under Source');
 const motions=emitted.filter(a=>a.path.includes('/Source/')&&a.asset&&/^%YAML/.test(dec.decode(a.asset))).flatMap(a=>splitUnityDocuments(dec.decode(a.asset)).documents.map(d=>({a,d}))).filter(x=>['206','74'].includes(x.d.classId));
 assert.equal(motions.filter(x=>x.d.classId==='74').length,1,'Shared Clip is copied once');
 assert(motions.some(x=>x.d.classId==='206'));
 for(const {a,d} of motions){const main=/mainObjectFileID: (\d+)/.exec(a.meta);assert(main);assert.equal(main[1],d.fileId);assert(/^  m_ObjectHideFlags: 0$/m.test(d.text));}
 const prefab=emitted.find(a=>a.path.endsWith('/Installer.prefab')),prefabText=dec.decode(prefab.asset);
 assert(prefabText.includes('localOnly: 1'));assert(prefabText.includes('m_overrideAnimatorDefaults: 1'));
 assert(prefabText.includes('guid: 7ef83cb0c23d4d7c9d41021e544a1978'));
 assert.equal(splitUnityDocuments(prefabText).documents.filter(d=>d.classId==='1').length,1);
 const maRows=prefabText.match(/^  - nameOrPrefix:[\s\S]*?(?=^  - nameOrPrefix:|^---|$(?![\s\S]))/gm);
 assert.equal(maRows.length,2);
 const menu=emitted.find(a=>a.guid===result.report.composition?.menu?.guid)||emitted.find(a=>a.path.includes('/Menus/')&&a.asset&&dec.decode(a.asset).includes('controls:'));
 assert(menu,'Selected menu copied');
 assert(extractReferences(dec.decode(menu.asset)).some(r=>r.guid===expression.guid),'Editor menu lookup points to finalized Expression');
 validateAssets(emitted);
 assert.deepEqual(result.report.verification,{unityImport:'UNVERIFIED',maBuild:'UNVERIFIED',vrchat:'UNVERIFIED'});
 const again=await generate(packages,plan,kernel);assert.deepEqual(again.archive,result.archive,'Same input and Plan yield identical package');
 packages.forEach((p,i)=>p.assets.forEach((a,j)=>{assert.deepEqual(a.asset,source[i][j].bytes);assert.equal(a.meta,source[i][j].meta);}));
 const mismatch=structuredClone(plan);mismatch.inputHashes=['b'.repeat(64)];assert(!analyze(packages,mismatch,kernel).view.ready);
 await assert.rejects(()=>generate(packages,mismatch,kernel),/未設定|競合/);
 const edit=structuredClone(plan);edit.parameterEdits.Axis={defaultValue:0};assert(!analyze(packages,edit,kernel).view.ready);
 const omitted=structuredClone(plan);omitted.globalExpressionId=null;omitted.parameterEdits={};omitted.installer.menuId=null;
 const undecided=analyze(packages,omitted,kernel);assert(undecided.view.rows.some(r=>r.registered===null));assert(!undecided.view.ready);
 for(const row of undecided.view.rows)if(!row.fixed)omitted.parameterEdits[row.name]={registered:false};
 const internal=await generate(packages,omitted,kernel);assert.equal(internal.report.parameters.length,0);
 // A selected Menu may never silently add names omitted by a fixed Expression.
 const badMenuPackages=structuredClone(packages);
 const badMenu=badMenuPackages[0].assets.find(a=>a.guid===GUIDS.menu);
 badMenu.asset=enc.encode(dec.decode(badMenu.asset).replace('name: MenuOnly','name: MissingMenuInput'));
 const badMenuView=analyze(badMenuPackages,plan,kernel).view;
 assert(!badMenuView.ready);assert(badMenuView.issues.some(i=>i.code==='menu_parameter_unregistered'));
 assert.equal(badMenuView.rows.find(r=>r.name==='MissingMenuInput').registered,false);
 const menuPlan=structuredClone(omitted);menuPlan.installer.menuId=plan.installer.menuId;
 let menuView=analyze(packages,menuPlan,kernel).view;
 assert.equal(menuView.rows.find(r=>r.name==='MenuOnly').type,null);
 menuPlan.parameterEdits.MenuOnly={registered:true,defaultValue:0,saved:false,networkSynced:false};
 assert(!analyze(packages,menuPlan,kernel).view.ready,'Menu-only type must be explicit');
 menuPlan.parameterEdits.MenuOnly.type='Int';
 const menuResult=await generate(packages,menuPlan,kernel);
 assert.deepEqual(menuResult.report.parameters.map(r=>r.name),['MenuOnly']);
 assert(!analyze(packages,menuPlan,kernel).registration.animators.fx.some(p=>p.name==='MenuOnly'),'Menu-only candidate must not create fake Animator declarations');
 // Corrupting a State Motion must be caught by the independent output graph gate.
 const corrupt=emitted.map(a=>({...a,asset:a.asset?.slice()}));const bad=corrupt.find(a=>a.path===controller.path);
 const old=dec.decode(bad.asset);bad.asset=enc.encode(old.replace(/m_Motion: \{fileID: [^}]+\}/,'m_Motion: {fileID: 99999999}'));
 assert.throws(()=>validateAssets(corrupt),/参照先/);
 // Real archive IO is part of the input contract, not a fabricated catalog.
 assert.equal(readUnityPackage(writeUnityPackage(packages[0].assets)).size,packages[0].assets.length);
 console.log(`PASS: full generation, locked Expression, Source identity, MA/Menu, round-trip, determinism, input immutability, invalid Plan (package ${result.archive.length} bytes)`);
}

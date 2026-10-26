import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Worker as NodeWorker} from 'node:worker_threads';
import {generateTemplate,isTemplateResult} from '../../docs/parameter-template/api.mjs';
import {collectParameters,generateParameterAssets} from '../../docs/shared/parameter-registrar/core.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
import {readUnityPackage,writeUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {splitUnityDocuments,extractReferences,extractAnimatorLayers,extractAnimatorParameters} from '../../docs/shared/ft/unity-text.mjs';
import {parseExpression} from '../../docs/animator-composer/lib/registration.mjs';
import {createAnimatorIntegrator} from '../../docs/shared/animator-integrator/client.mjs';
import {buildIntermediateAssets} from '../../docs/decode-smooth-builder/assembly.mjs';
const dec=new TextDecoder(),workers=[];
class BrowserWorker {
 constructor(url){
  const script=`import {parentPort} from 'node:worker_threads';import {readFile} from 'node:fs/promises';globalThis.self=globalThis;globalThis.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);globalThis.fetch=async url=>new Response(await readFile(url),{headers:{'Content-Type':String(url).endsWith('.wasm')?'application/wasm':'application/json'}});await import(${JSON.stringify(url.href)});parentPort.on('message',data=>globalThis.onmessage?.({data}));`;
  this.node=new NodeWorker(new URL('data:text/javascript,'+encodeURIComponent(script)),{execArgv:[]});this.node.on('message',data=>this.onmessage?.({data}));this.node.on('error',e=>this.onerror?.({message:e.message,error:e}));this.terminated=false;this.url=url.href;workers.push(this);
 }
 postMessage(...args){this.node.postMessage(...args);}
 terminate(){this.terminated=true;this.node.terminate();}
}
const reference=r=>r.guid+':'+r.fileId;
const parentPath='Assets/Merged_DecodeAndSmooth';
function preservedPath(path){assert.ok(path.startsWith('Assets/'));return path===parentPath||path.startsWith(parentPath+'/')?path:parentPath+'/'+path.slice('Assets/'.length);}
const docsOf=assets=>[...assets.values()].filter(a=>a.asset!==null).flatMap(a=>{
 const text=dec.decode(a.asset);if(!/^--- !u!/m.test(text))return [];
 return splitUnityDocuments(text).documents.map(d=>({...d,guid:a.guid,path:a.path}));
});
function one(bytes,cls){const list=docsOf(readUnityPackage(bytes)).filter(d=>d.classId===cls);assert.equal(list.length,1);return {guid:list[0].guid,fileId:list[0].fileId};}
let fixturePromise;
async function fixture(){return fixturePromise??=(async()=>{
 const kernel=await instantiateFtKernel(await readFile(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url))),templates=[],registrations=[];
 for(const [i,target]of ['v2/EyeLidLeft','v2/EyeLidRight'].entries()){
  const previousFetch=globalThis.fetch;let generated;try{globalThis.fetch=async url=>new Response(await readFile(url));generated=await generateTemplate(target);}finally{globalThis.fetch=previousFetch;}templates.push({...generated,target});
  const collected=collectParameters(generated.bytes,{kernel}),r=await generateParameterAssets(collected.parameters,{name:`Registration_${i+1}`});registrations.push({...r,controller:one(r.archive,'91'),expression:one(r.archive,'114')});
 }
 const built=await buildIntermediateAssets(templates);
 // Retain opaque bytes and reuse an existing parent; the pipeline case below
 // covers creation of a missing parent. Neither case may double its prefix.
 const opaqueGuid='abcdef0123456789abcdef0123456789',parentGuid='0123456789abcdef0123456789abcdef';
 const motionEntries=[...readUnityPackage(built.motionPackage).values(),
  {guid:parentGuid,path:parentPath,asset:null,meta:`fileFormatVersion: 2\nguid: ${parentGuid}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: existing parent preservation fixture\n  assetBundleName: \n  assetBundleVariant: \n`},
  {guid:opaqueGuid,path:parentPath+'/PreservedBytes.bin',asset:new Uint8Array([0,255,128,13,10,0,42]),meta:`fileFormatVersion: 2\nguid: ${opaqueGuid}\nDefaultImporter:\n  externalObjects: {}\n  userData: opaque preservation fixture\n  assetBundleName: \n  assetBundleVariant: \n`}];
 built.motionPackage=writeUnityPackage(motionEntries);
 const sources=[{name:'Base.unitypackage',bytes:built.basePackage},...registrations.map(r=>({name:r.fileName,bytes:r.archive})),{name:'Motions.unitypackage',bytes:built.motionPackage},{name:'Safety.unitypackage',bytes:built.maskPackage}];
 return {templates,registrations,built,sources};
})();}
async function helper(){const m=await import('../../docs/decode-smooth-builder/integrator-request.mjs').catch(()=>null);assert.equal(typeof m?.createIntegratorRequest,'function','the batch must create a request for the existing Integrator API');return m.createIntegratorRequest;}
function assertWholeFiles(originals,assets){
 for(const [guid,original]of originals){
  const actual=assets.get(guid);assert.ok(actual,`Missing original file ${original.path} (${guid})`);
  assert.equal(actual.path,preservedPath(original.path),`Original relative pathname changed: ${guid}`);
  assert.equal(actual.meta,original.meta,`Original importer/GUID changed: ${guid}`);
  assert.deepEqual(actual.asset,original.asset,`Original file bytes or embedded-object layout changed: ${guid}`);
  assert.deepEqual(docsOf(new Map([[guid,actual]])).map(d=>[d.classId,d.fileId,d.text]),docsOf(new Map([[guid,original]])).map(d=>[d.classId,d.fileId,d.text]),`Original document IDs/order/co-location changed: ${guid}`);
 }
}
function validateOutput(output,built){
 const report=output.integratorReport??output.report,assets=readUnityPackage(output.archive),objects=docsOf(assets),byId=new Map(objects.map(d=>[reference(d),d])),mapping=report.composition.objectMapping,ctrl=assets.get(report.controllers[0].guid),controllerText=dec.decode(ctrl.asset),layers=extractAnimatorLayers(controllerText);
 const sourcePackages=[built.basePackage,built.motionPackage,built.maskPackage,...built.registrations.map(r=>r.archive)],allSources=new Map();
 for(const bytes of sourcePackages)for(const [guid,entry]of readUnityPackage(bytes)){assert.ok(!allSources.has(guid),`Duplicate fixture GUID ${guid}`);allSources.set(guid,entry);}
 const discardedHosts=[...report.request.controllerIds.slice(1),...report.request.expressionIds.slice(1)].map(id=>id.split(':')[0]),expectedGuids=new Set(allSources.keys());
 for(const guid of discardedHosts)expectedGuids.delete(guid);
 const parents=[...assets.values()].filter(a=>a.path===parentPath);assert.equal(parents.length,1);assert.equal(parents[0].asset,null);assert.match(parents[0].meta,/^folderAsset: yes$/m);expectedGuids.add(parents[0].guid);
 const originalParent=[...allSources.values()].find(a=>a.path===parentPath);if(originalParent)assert.equal(parents[0].guid,originalParent.guid);
 assert.deepEqual(new Set(assets.keys()),expectedGuids,'Only the new parent folder may receive a new GUID; all original files/folders must retain their GUIDs');
 assert.ok([...assets.values()].every(a=>a.path===parentPath||a.path.startsWith(parentPath+'/')));
 assertWholeFiles(readUnityPackage(built.motionPackage),assets);
 assertWholeFiles(readUnityPackage(built.maskPackage),assets);
 for(const [guid,entry]of allSources)if(entry.asset===null)assertWholeFiles(new Map([[guid,entry]]),assets);
 for(const id of [report.request.controllerIds[0],report.request.expressionIds[0]]){
  const [guid,fileId]=id.split(':'),source=allSources.get(guid),actual=assets.get(guid),original=docsOf(new Map([[guid,source]])).find(d=>d.fileId===fileId),out=byId.get(id);
  assert.ok(actual&&original&&out,`Original output host missing: ${id}`);assert.equal(actual.path,preservedPath(source.path));assert.equal(actual.meta,source.meta);assert.equal(out.classId,original.classId);assert.equal(out.text.match(/^  m_Name:.*$/m)?.[0],original.text.match(/^  m_Name:.*$/m)?.[0]);
 }
 assert.equal(report.controllers[0].guid,report.request.controllerIds[0].split(':')[0]);assert.equal(report.controllers[0].fileId,report.request.controllerIds[0].split(':')[1]);
 assert.equal(layers.length,3);assert.deepEqual(layers.map(l=>l.name),['Base Layer','Root_BinaryParameter','Root_Smooth_Parameter']);for(const layer of layers)assert.equal(layer.fields.m_DefaultWeight,'1');
 const controllerObjects=objects.filter(d=>d.guid===ctrl.guid);
 assert.equal(controllerObjects.filter(d=>d.classId==='1107').length,4,'Excluded Registrar roots must not remain as orphan subassets');
 assert.equal(controllerObjects.length,8);
 for(const d of controllerObjects.filter(d=>['1107','1102','1109'].includes(d.classId)))assert.match(d.text,/^  m_ObjectHideFlags: 1$/m);
 for(const r of built.registrations){
  assert.ok(!mapping.some(m=>m.sourceId.startsWith(r.controller.guid+':')),'Excluded Registrar objects must not have output mappings');
  const source=docsOf(readUnityPackage(r.archive)).find(d=>d.classId==='1107');
  assert.match(source.text,/^  m_ObjectHideFlags: 1$/m,'Registrar must retain its hidden source Layer0');
 }
 assert.equal(report.preservation.omittedEmptyStateMachines.length,built.registrations.length);
 const maskMapping=mapping.find(m=>m.sourceId===reference(built.refs.mask));assert.ok(maskMapping);assert.equal(maskMapping.outputGuid+':'+maskMapping.outputFileId,reference(built.refs.mask));for(const layer of layers){const r=extractReferences(layer.fields.m_Mask)[0];assert.equal((r.guid??ctrl.guid)+':'+r.fileId,reference(built.refs.mask));}
 const outMask=byId.get(reference(built.refs.mask));assert.match(outMask.text,/m_Mask: 0{104}\n/);assert.match(outMask.text,/m_Elements: \[\]/);
 for(const original of docsOf(readUnityPackage(built.basePackage)).filter(d=>d.classId!=='91')){const out=byId.get(reference(original));assert.ok(out,`Base structure ID changed: ${reference(original)}`);assert.equal(out.text,original.text);assert.notEqual(out.classId,'1102');}
 for(const [i,source]of [built.refs.binaryTree,built.refs.smoothTree].entries()){
  const m=mapping.find(m=>m.sourceId===reference(source));assert.ok(m);assert.equal(m.outputGuid+':'+m.outputFileId,reference(source));const tree=byId.get(reference(source));assert.equal(tree.classId,'206');assert.match(tree.text,/m_NormalizedBlendValues: 0/);assert.equal((tree.text.match(/m_DirectBlendParameter: AlwaysOne/g)??[]).length,2);
  const layer=layers.at(i-2),machineRef=extractReferences(layer.fields.m_StateMachine)[0],machine=byId.get(ctrl.guid+':'+machineRef.fileId),stateRef=extractReferences(machine.text.match(/^  m_DefaultState:.*$/m)[0])[0],state=byId.get(ctrl.guid+':'+stateRef.fileId),motion=extractReferences(state.text.match(/^  m_Motion:.*$/m)[0])[0];assert.equal((motion.guid??ctrl.guid)+':'+motion.fileId,reference(tree));assert.match(state.text,/m_WriteDefaultValues: 1/);assert.equal(layer.fields.m_BlendingMode,'0');
 }
 const sourceMotions=new Map(docsOf(readUnityPackage(built.motionPackage)).filter(d=>['74','206'].includes(d.classId)).map(d=>[reference(d),d])),pending=[reference(built.refs.binaryTree),reference(built.refs.smoothTree)],closure=new Set();
 while(pending.length){const id=pending.pop();if(closure.has(id))continue;closure.add(id);const node=sourceMotions.get(id);assert.ok(node,`Missing source Motion ${id}`);for(const r of extractReferences(node.text)){if(r.fileId==='0')continue;const target=(r.guid??node.guid)+':'+r.fileId;if(sourceMotions.has(target))pending.push(target);}}
 assert.ok(sourceMotions.size>closure.size,'Fixture must contain Motion documents outside the selected Root closure');
 const motionMappings=mapping.filter(m=>sourceMotions.has(m.sourceId));assert.deepEqual(new Set(motionMappings.map(m=>m.sourceId)),new Set(sourceMotions.keys()));
 for(const m of motionMappings){assert.equal(m.outputGuid+':'+m.outputFileId,m.sourceId,`Motion identity changed: ${m.sourceId}`);assert.equal(m.sourcePath,sourceMotions.get(m.sourceId).path);assert.equal(m.outputPath,preservedPath(sourceMotions.get(m.sourceId).path));}
 for(const [id,original]of sourceMotions){const out=byId.get(id);assert.ok(out,`Source Motion omitted: ${id}`);assert.equal(out.path,preservedPath(original.path));assert.equal(out.text,original.text,`Motion document changed or moved: ${id}`);}
 const checkedMotions=sourceMotions.size;assert.equal(checkedMotions,objects.filter(d=>['74','206'].includes(d.classId)).length);
 const preservation=report.preservation;assert.ok(preservation);assert.equal(preservation.parentFolder.path,parentPath);assert.equal(preservation.parentFolder.guid,parents[0].guid);assert.equal(preservation.parentFolder.created,!originalParent);
 const hostGuids=new Set([report.request.controllerIds[0],report.request.expressionIds[0]].map(id=>id.split(':')[0]));
 assert.deepEqual(new Set(preservation.sourceAssets.map(a=>a.guid)),new Set([...allSources.keys()].filter(guid=>!hostGuids.has(guid)&&!discardedHosts.includes(guid))));
 for(const item of [...preservation.sourceAssets,...preservation.modifiedHosts]){assert.equal(item.sourcePath,allSources.get(item.guid).path);assert.equal(item.outputPath,preservedPath(item.sourcePath));}
 assert.deepEqual(new Set(preservation.modifiedHosts.map(h=>h.guid)),hostGuids);
 for(const change of preservation.structuralFileIdChanges){assert.ok(!sourceMotions.has(change.sourceId));assert.notEqual(change.sourceId.split(':')[0],report.controllers[0].guid);assert.notEqual(change.sourceId.split(':')[1],change.outputFileId);}
 const params=extractAnimatorParameters(controllerText),always=params.find(p=>p.name==='AlwaysOne');assert.equal(always.fields.m_Type,'1');assert.equal(always.fields.m_DefaultFloat,'1');const expressions=objects.filter(d=>d.classId==='114').flatMap(d=>parseExpression(d.text));assert.equal(expressions.find(p=>p.name==='AlwaysOne').defaultValue,1);assert.ok(expressions.every(p=>p.saved===false));for(const p of expressions){if(/(?:[0-9]|Negative)$/.test(p.name)){assert.equal(p.type,'Bool');assert.ok(p.defaultValue===0||p.defaultValue===1);}assert.equal(p.defaultValue,Number(params.find(a=>a.name===p.name).fields.m_DefaultFloat));}for(const name of ['v2/EyeLidLeft','v2/EyeLidRight'])assert.equal(expressions.find(p=>p.name===name).defaultValue,0.75);assert.ok(Array.isArray(report.expressionBoolRules.changes));assert.equal(report.vrcft5RangeSync.enabled,true);assert.ok(Array.isArray(report.vrcft5RangeSync.matches));assert.ok(report.vrcft5RangeSync.matches.every(p=>expressions.find(row=>row.name===p.name)?.networkSynced===p.networkSynced));assert.deepEqual(expressions,report.parameters);assert.ok(Array.isArray(report.expressionSyncRules.changes));assert.ok(report.bitCost<=256);assert.equal(report.staticValidation.status,'PASS');assert.equal(report.staticValidation.roundtripBytes,'PASS');
 return {assets:assets.size,objects:objects.length,layerCount:layers.length,parameterCount:params.length,treeCount:objects.filter(d=>d.classId==='206').length,clipCount:objects.filter(d=>d.classId==='74').length,checkedMotions};
}
test('exact catalog identities create ordered requests and omit generated Registrar layers',async()=>{
 const create=await helper(),f=await fixture(),session=createAnimatorIntegrator({workerFactory:()=>new BrowserWorker(new URL('../../docs/shared/animator-integrator/worker.mjs',import.meta.url))});
 try{const {catalog}=await session.importSources(f.sources,{inputRevision:7}),request=create({catalog,refs:f.built.refs,registrations:f.registrations});assert.deepEqual(request.controllerIds,[reference(f.built.refs.baseController),...f.registrations.map(r=>reference(r.controller))]);assert.deepEqual(request.expressionIds,f.registrations.map(r=>reference(r.expression)));assert.equal(request.name,'DecodeSmooth');assert.equal(request.writeDefaults,true);assert.equal(request.playable,'FX');assert.deepEqual(request.parameterOnlyControllerIds,f.registrations.map(r=>reference(r.controller)));assert.ok(!request.layerNames);assert.ok(!('animatorDefaults' in request));
 const wrong=structuredClone(catalog);wrong.controllers[0].id='f'.repeat(32)+':9100000';assert.throws(()=>create({catalog:wrong,refs:f.built.refs,registrations:f.registrations}),/identity|GUID|参照/i);
 }finally{session.dispose();}
});
test('Integrator retains all source files and embedded Clips with original GUIDs, paths and bytes, including unreferenced inputs',async()=>{
 const create=await helper(),f=await fixture(),session=createAnimatorIntegrator({workerFactory:()=>new BrowserWorker(new URL('../../docs/shared/animator-integrator/worker.mjs',import.meta.url))}),originals=f.sources.map(p=>p.bytes.slice());
 try{const imported=await session.importSources(f.sources,{inputRevision:8}),request=create({catalog:imported.catalog,refs:f.built.refs,registrations:f.registrations});const pending=session.generate(request,{inputRevision:8}),rejected=assert.rejects(pending,e=>e.name==='AbortError');assert.equal(session.cancel(),true);await rejected;const progress=[],output=await session.generate(request,{inputRevision:8,onProgress:p=>progress.push(p.phase)}),verified=validateOutput(output,{...f.built,registrations:f.registrations});assert.ok(progress.includes('reading'));f.sources.forEach((s,i)=>assert.deepEqual(s.bytes,originals[i]));await assert.rejects(session.generate(request,{inputRevision:9}),/revision/i);
 }finally{session.dispose();}
});
test('batch refuses to omit Registrar layers with synchronization, overrides or nonempty state machines',async()=>{
 const create=await helper(),f=await fixture(),session=createAnimatorIntegrator({workerFactory:()=>new BrowserWorker(new URL('../../docs/shared/animator-integrator/worker.mjs',import.meta.url))});
 try{const {catalog}=await session.importSources(f.sources,{inputRevision:19});
  for(const [before,after]of [['m_SyncedLayerIndex: -1','m_SyncedLayerIndex: 0'],['m_Behaviours: []','m_Behaviours: [{fileID: 10}]'],['m_DefaultState: {fileID: 0}','m_DefaultState: {fileID: 10}']]){
   const registration=f.registrations[0],entries=readUnityPackage(registration.archive),entry=entries.get(registration.controller.guid),original=dec.decode(entry.asset);assert(original.includes(before));
   entry.asset=new TextEncoder().encode(original.replace(before,after));
   const changed={...registration,archive:writeUnityPackage([...entries.values()])};
   assert.throws(()=>create({catalog,refs:f.built.refs,registrations:[changed,...f.registrations.slice(1)]}),/Only generated empty/);
  }
 }finally{session.dispose();}
});
test('batch pipeline uses shared Template/Registrar jobs and the existing Integrator, returning final counts and source evidence',async()=>{
 const m=await import('../../docs/decode-smooth-builder/pipeline.mjs').catch(()=>null);assert.equal(typeof m?.createDecodeSmoothBuilder,'function','the batch pipeline must call the actual Integrator');const previous=globalThis.Worker;globalThis.Worker=BrowserWorker;const start=workers.length,builder=m.createDecodeSmoothBuilder({concurrency:2});
 try{const output=await builder.build(['v2/EyeLidLeft','v2/EyeLidRight'],{inputRevision:12}),verified=validateOutput(output,output.intermediates);assert.deepEqual(output.summary,{targetCount:2,layerCount:3,parameterCount:verified.parameterCount,treeCount:verified.treeCount,clipCount:verified.clipCount});assert.equal(output.fileName,'DecodeSmooth.unitypackage');assert.equal(output.report.sourceRef,'922e9616d87debcddb1e602a194ad0c16071ad8f');assert.equal(output.integratorReport,output.report.integrator);assert.equal(output.report.inputRevision,12);assert.ok(output.intermediates.templates.every(t=>isTemplateResult(t,{target:t.target})));assert.equal(output.report.buildId,'decode-smooth-integrator-4');assert.deepEqual(output.report.registrarSettings,{defaultValue:0,saved:false,networkSynced:false});assert.equal(output.report.jobs.filter(j=>j.taskType==='parameter-template-generate').length,2);assert.ok(workers.slice(start).some(w=>new URL(w.url).pathname.endsWith('/shared/animator-integrator/worker.mjs')));assert.ok(!workers.slice(start).some(w=>w.url.includes('/animator-composer/prototype/')));assert.ok(workers.slice(start).every(w=>w.terminated));
  if(process.env.DECODE_SMOOTH_EVIDENCE_DIR){const path=process.env.DECODE_SMOOTH_EVIDENCE_DIR;await mkdir(path,{recursive:true});await Promise.all([writeFile(join(path,'final.unitypackage'),output.archive),writeFile(join(path,'integrator-report.json'),JSON.stringify(output.integratorReport,null,2)),writeFile(join(path,'batch-report.json'),JSON.stringify(output.report,null,2)),writeFile(join(path,'verification.json'),JSON.stringify(verified,null,2)),...['motion','base','mask'].map(key=>writeFile(join(path,`source-${key}.unitypackage`),output.intermediates[key+'Package'])),...output.intermediates.registrations.map((r,i)=>writeFile(join(path,`registration-${i+1}.unitypackage`),r.archive)),...output.intermediates.templates.map((r,i)=>writeFile(join(path,`template-${i+1}.unitypackage`),r.bytes))]);console.log('Integration evidence: '+path);}
 }finally{builder.dispose();globalThis.Worker=previous;}
});
test('one and three target batches both emit only the base and two root layers',async()=>{
 const {createDecodeSmoothBuilder}=await import('../../docs/decode-smooth-builder/pipeline.mjs'),previous=globalThis.Worker;globalThis.Worker=BrowserWorker;
 try{for(const names of [['v2/EyeLidLeft'],['v2/EyeLidLeft','v2/EyeLidRight','v2/JawX']]){
  const builder=createDecodeSmoothBuilder();try{const output=await builder.build(names,{inputRevision:names.length});
   const layers=extractAnimatorLayers(dec.decode(readUnityPackage(output.archive).get(output.integratorReport.controllers[0].guid).asset));
   assert.deepEqual(layers.map(l=>l.name),['Base Layer','Root_BinaryParameter','Root_Smooth_Parameter']);
   assert.equal(output.summary.layerCount,3);assert.equal(output.summary.targetCount,names.length);
   for(const name of names)assert(output.integratorReport.animatorParameters.some(p=>p.name===name));
   assertWholeFiles(readUnityPackage(output.intermediates.motionPackage),readUnityPackage(output.archive));
   assertWholeFiles(readUnityPackage(output.intermediates.maskPackage),readUnityPackage(output.archive));
  }finally{builder.dispose();}
 }}finally{globalThis.Worker=previous;}
});

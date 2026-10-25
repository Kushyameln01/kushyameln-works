import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Worker as NodeWorker} from 'node:worker_threads';
import {generateTemplate,isTemplateResult} from '../../docs/parameter-template/api.mjs';
import {collectParameters,generateParameterAssets} from '../../docs/shared/parameter-registrar/core.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
import {readUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {splitUnityDocuments,extractReferences,extractAnimatorLayers,extractAnimatorParameters,replaceDocumentFileId,canonicalizeObjectReferences} from '../../docs/shared/ft/unity-text.mjs';
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
const docsOf=assets=>[...assets.values()].filter(a=>a.asset!==null).flatMap(a=>splitUnityDocuments(dec.decode(a.asset)).documents.map(d=>({...d,guid:a.guid,path:a.path})));
function one(bytes,cls){const list=docsOf(readUnityPackage(bytes)).filter(d=>d.classId===cls);assert.equal(list.length,1);return {guid:list[0].guid,fileId:list[0].fileId};}
let fixturePromise;
async function fixture(){return fixturePromise??=(async()=>{
 const kernel=await instantiateFtKernel(await readFile(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url))),templates=[],registrations=[];
 for(const [i,target]of ['v2/EyeLidLeft','v2/EyeLidRight'].entries()){
  const previousFetch=globalThis.fetch;let generated;try{globalThis.fetch=async url=>new Response(await readFile(url));generated=await generateTemplate(target);}finally{globalThis.fetch=previousFetch;}templates.push({...generated,target});
  const collected=collectParameters(generated.bytes,{kernel}),r=await generateParameterAssets(collected.parameters,{name:`Registration_${i+1}`});registrations.push({...r,controller:one(r.archive,'91'),expression:one(r.archive,'114')});
 }
 const built=await buildIntermediateAssets(templates),sources=[{name:'Base.unitypackage',bytes:built.basePackage},...registrations.map(r=>({name:r.fileName,bytes:r.archive})),{name:'Motions.unitypackage',bytes:built.motionPackage},{name:'Safety.unitypackage',bytes:built.maskPackage}];
 return {templates,registrations,built,sources};
})();}
async function helper(){const m=await import('../../docs/decode-smooth-builder/integrator-request.mjs').catch(()=>null);assert.equal(typeof m?.createIntegratorRequest,'function','the batch must create a request for the existing Integrator API');return m.createIntegratorRequest;}
function symbolic(text,guid,reverse=null){
 text=canonicalizeObjectReferences(replaceDocumentFileId(text,'1'));
 for(const r of [...extractReferences(text)].reverse()){if(r.fileId==='0')continue;const id=(r.guid??guid)+':'+r.fileId,source=reverse?reverse.get(id):id;assert.ok(source,`Missing provenance ${id}`);text=text.slice(0,r.start)+'{SOURCE: '+source+'}'+text.slice(r.end);}
 return text;
}
function validateOutput(output,built){
 const report=output.integratorReport??output.report,assets=readUnityPackage(output.archive),objects=docsOf(assets),byId=new Map(objects.map(d=>[reference(d),d])),mapping=report.composition.objectMapping,reverse=new Map(mapping.filter(m=>m.sourceId).map(m=>[m.outputGuid+':'+m.outputFileId,m.sourceId])),ctrl=assets.get(report.controllers[0].guid),controllerText=dec.decode(ctrl.asset),layers=extractAnimatorLayers(controllerText);
 assert.equal(layers.length,5);assert.deepEqual(layers.map(l=>l.name),['Base Layer','Parameters 1','Parameters 2','Root_BinaryParameter','Root_Smooth_Parameter']);for(const layer of layers)assert.equal(layer.fields.m_DefaultWeight,'1');
 const maskMapping=mapping.find(m=>m.sourceId===reference(built.refs.mask));assert.ok(maskMapping);for(const layer of layers){const r=extractReferences(layer.fields.m_Mask)[0];assert.equal((r.guid??ctrl.guid)+':'+r.fileId,maskMapping.outputGuid+':'+maskMapping.outputFileId);}
 const originalMask=docsOf(readUnityPackage(built.maskPackage))[0],outMask=byId.get(maskMapping.outputGuid+':'+maskMapping.outputFileId);assert.equal(symbolic(outMask.text,outMask.guid,reverse),symbolic(originalMask.text,originalMask.guid));assert.match(outMask.text,/m_Mask: 0{104}\n/);assert.match(outMask.text,/m_Elements: \[\]/);
 for(const original of docsOf(readUnityPackage(built.basePackage)).filter(d=>d.classId!=='91')){const m=mapping.find(m=>m.sourceId===reference(original));assert.ok(m);const out=byId.get(m.outputGuid+':'+m.outputFileId);assert.equal(symbolic(out.text,out.guid,reverse),symbolic(original.text,original.guid));assert.notEqual(out.classId,'1102');}
 for(const [i,source]of [built.refs.binaryTree,built.refs.smoothTree].entries()){
  const m=mapping.find(m=>m.sourceId===reference(source)),tree=byId.get(m.outputGuid+':'+m.outputFileId);assert.equal(tree.classId,'206');assert.match(tree.text,/m_NormalizedBlendValues: 0/);assert.equal((tree.text.match(/m_DirectBlendParameter: AlwaysOne/g)??[]).length,2);
  const layer=layers.at(i-2),machineRef=extractReferences(layer.fields.m_StateMachine)[0],machine=byId.get(ctrl.guid+':'+machineRef.fileId),stateRef=extractReferences(machine.text.match(/^  m_DefaultState:.*$/m)[0])[0],state=byId.get(ctrl.guid+':'+stateRef.fileId),motion=extractReferences(state.text.match(/^  m_Motion:.*$/m)[0])[0];assert.equal((motion.guid??ctrl.guid)+':'+motion.fileId,reference(tree));assert.match(state.text,/m_WriteDefaultValues: 1/);assert.equal(layer.fields.m_BlendingMode,'0');
 }
 const sourceMotions=new Map(docsOf(readUnityPackage(built.motionPackage)).filter(d=>['74','206'].includes(d.classId)).map(d=>[reference(d),d])),pending=[reference(built.refs.binaryTree),reference(built.refs.smoothTree)],closure=new Set();
 while(pending.length){const id=pending.pop();if(closure.has(id))continue;closure.add(id);const node=sourceMotions.get(id);assert.ok(node,`Missing source Motion ${id}`);for(const r of extractReferences(node.text)){if(r.fileId==='0')continue;const target=(r.guid??node.guid)+':'+r.fileId;if(sourceMotions.has(target))pending.push(target);}}
 assert.deepEqual(new Set(mapping.filter(m=>sourceMotions.has(m.sourceId)).map(m=>m.sourceId)),closure);let checkedMotions=0;
 for(const m of mapping.filter(m=>sourceMotions.has(m.sourceId))){const original=sourceMotions.get(m.sourceId),out=byId.get(m.outputGuid+':'+m.outputFileId);assert.equal(symbolic(out.text,out.guid,reverse),symbolic(original.text,original.guid),`Motion setting/curve changed ${m.sourceId}`);checkedMotions++;}
 assert.equal(checkedMotions,objects.filter(d=>['74','206'].includes(d.classId)).length);assert.equal(checkedMotions,closure.size);
 const params=extractAnimatorParameters(controllerText),always=params.find(p=>p.name==='AlwaysOne');assert.equal(always.fields.m_Type,'1');assert.equal(always.fields.m_DefaultFloat,'1');const expressions=objects.filter(d=>d.classId==='114').flatMap(d=>parseExpression(d.text));assert.equal(expressions.find(p=>p.name==='AlwaysOne').defaultValue,1);assert.ok(expressions.every(p=>p.saved===false));for(const p of expressions){if(/(?:[0-9]|Negative)$/.test(p.name)){assert.equal(p.type,'Bool');assert.ok(p.defaultValue===0||p.defaultValue===1);}assert.equal(p.defaultValue,Number(params.find(a=>a.name===p.name).fields.m_DefaultFloat));}for(const name of ['v2/EyeLidLeft','v2/EyeLidRight'])assert.equal(expressions.find(p=>p.name===name).defaultValue,0.75);assert.ok(Array.isArray(report.expressionBoolRules.changes));assert.equal(report.vrcft5RangeSync.enabled,true);assert.ok(Array.isArray(report.vrcft5RangeSync.matches));assert.ok(report.vrcft5RangeSync.matches.every(p=>expressions.find(row=>row.name===p.name)?.networkSynced===p.networkSynced));assert.deepEqual(expressions,report.parameters);assert.ok(Array.isArray(report.expressionSyncRules.changes));assert.ok(report.bitCost<=256);assert.equal(report.staticValidation.status,'PASS');assert.equal(report.staticValidation.roundtripBytes,'PASS');
 return {assets:assets.size,objects:objects.length,layerCount:layers.length,parameterCount:params.length,treeCount:objects.filter(d=>d.classId==='206').length,clipCount:objects.filter(d=>d.classId==='74').length,checkedMotions};
}
test('exact catalog identities create ordered requests and explicitly name generated Registrar empty layers',async()=>{
 const create=await helper(),f=await fixture(),session=createAnimatorIntegrator({workerFactory:()=>new BrowserWorker(new URL('../../docs/shared/animator-integrator/worker.mjs',import.meta.url))});
 try{const {catalog}=await session.importSources(f.sources,{inputRevision:7}),request=create({catalog,refs:f.built.refs,registrations:f.registrations});assert.deepEqual(request.controllerIds,[reference(f.built.refs.baseController),...f.registrations.map(r=>reference(r.controller))]);assert.deepEqual(request.expressionIds,f.registrations.map(r=>reference(r.expression)));assert.equal(request.name,'DecodeSmooth');assert.equal(request.writeDefaults,true);assert.equal(request.playable,'FX');assert.deepEqual(request.layerNames,Object.fromEntries(f.registrations.map((r,i)=>[reference(r.controller)+':0',`Parameters ${i+1}`])));assert.ok(!('animatorDefaults' in request));
 const wrong=structuredClone(catalog);wrong.controllers[0].id='f'.repeat(32)+':9100000';assert.throws(()=>create({catalog:wrong,refs:f.built.refs,registrations:f.registrations}),/identity|GUID|参照/i);
 }finally{session.dispose();}
});
test('real Template and Registrar packages pass the actual Integrator Worker with semantic preservation and cancellation retry',async()=>{
 const create=await helper(),f=await fixture(),session=createAnimatorIntegrator({workerFactory:()=>new BrowserWorker(new URL('../../docs/shared/animator-integrator/worker.mjs',import.meta.url))}),originals=f.sources.map(p=>p.bytes.slice());
 try{const imported=await session.importSources(f.sources,{inputRevision:8}),request=create({catalog:imported.catalog,refs:f.built.refs,registrations:f.registrations});const pending=session.generate(request,{inputRevision:8}),rejected=assert.rejects(pending,e=>e.name==='AbortError');assert.equal(session.cancel(),true);await rejected;const progress=[],output=await session.generate(request,{inputRevision:8,onProgress:p=>progress.push(p.phase)}),verified=validateOutput(output,f.built);assert.ok(progress.includes('reading'));f.sources.forEach((s,i)=>assert.deepEqual(s.bytes,originals[i]));await assert.rejects(session.generate(request,{inputRevision:9}),/revision/i);
 }finally{session.dispose();}
});
test('batch pipeline uses shared Template/Registrar jobs and the existing Integrator, returning final counts and source evidence',async()=>{
 const m=await import('../../docs/decode-smooth-builder/pipeline.mjs').catch(()=>null);assert.equal(typeof m?.createDecodeSmoothBuilder,'function','the batch pipeline must call the actual Integrator');const previous=globalThis.Worker;globalThis.Worker=BrowserWorker;const start=workers.length,builder=m.createDecodeSmoothBuilder({concurrency:2});
 try{const output=await builder.build(['v2/EyeLidLeft','v2/EyeLidRight'],{inputRevision:12}),verified=validateOutput(output,output.intermediates);assert.deepEqual(output.summary,{targetCount:2,layerCount:5,parameterCount:verified.parameterCount,treeCount:verified.treeCount,clipCount:verified.clipCount});assert.equal(output.fileName,'DecodeSmooth.unitypackage');assert.equal(output.report.sourceRef,'922e9616d87debcddb1e602a194ad0c16071ad8f');assert.equal(output.integratorReport,output.report.integrator);assert.equal(output.report.inputRevision,12);assert.ok(output.intermediates.templates.every(t=>isTemplateResult(t,{target:t.target})));assert.equal(output.report.buildId,'decode-smooth-integrator-2');assert.deepEqual(output.report.registrarSettings,{defaultValue:0,saved:false,networkSynced:false});assert.equal(output.report.jobs.filter(j=>j.taskType==='parameter-template-generate').length,2);assert.ok(workers.slice(start).some(w=>w.url.endsWith('/shared/animator-integrator/worker.mjs')));assert.ok(!workers.slice(start).some(w=>w.url.includes('/animator-composer/prototype/')));assert.ok(workers.slice(start).every(w=>w.terminated));
  if(process.env.DECODE_SMOOTH_EVIDENCE_DIR){const path=process.env.DECODE_SMOOTH_EVIDENCE_DIR;await mkdir(path,{recursive:true});await Promise.all([writeFile(join(path,'final.unitypackage'),output.archive),writeFile(join(path,'integrator-report.json'),JSON.stringify(output.integratorReport,null,2)),writeFile(join(path,'batch-report.json'),JSON.stringify(output.report,null,2)),writeFile(join(path,'verification.json'),JSON.stringify(verified,null,2)),...['motion','base','mask'].map(key=>writeFile(join(path,`source-${key}.unitypackage`),output.intermediates[key+'Package'])),...output.intermediates.registrations.map((r,i)=>writeFile(join(path,`registration-${i+1}.unitypackage`),r.archive)),...output.intermediates.templates.map((r,i)=>writeFile(join(path,`template-${i+1}.unitypackage`),r.bytes))]);console.log('Integration evidence: '+path);}
 }finally{builder.dispose();globalThis.Worker=previous;}
});

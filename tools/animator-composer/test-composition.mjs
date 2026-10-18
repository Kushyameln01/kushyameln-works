import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {indexPackages,analyzeComposition,generateComposition,makeGeneratedAsset} from '../../docs/animator-composer/lib/composition.mjs';
import {splitUnityDocuments,extractReferences,extractAnimatorLayers,extractAnimatorParameters,canonicalizeObjectReferences,replaceDocumentFileId} from '../../docs/shared/ft/unity-text.mjs';
import {readUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
import {fixture,GUIDS,SDK,PREAMBLE,asset,controller,parameter,layer,machine,state,tree,clip,behaviour,ref,doc} from './fixture-composition.mjs';
const kernel=await instantiateFtKernel(fs.readFileSync(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url)));
const decoder=new TextDecoder(),encode=t=>new TextEncoder().encode(t),clone=structuredClone;
const errors=a=>a.issues.filter(i=>i.severity==='error');
function analyze(f){const index=indexPackages(f.packages,f.plan.assetChoices);return {index,analysis:analyzeComposition(index,f.plan,kernel)};}
function resolved(analysis){const result={};for(const b of analysis.blocks){const byName=new Map((result[b.outputId]??[]).map(p=>[p.name,p]));for(const p of b.parameters)byName.set(p.name,{name:p.name,type:p.type,defaultValue:p.defaultValue});result[b.outputId]=[...byName.values()];}return result;}
async function generate(f){const {index,analysis}=analyze(f);assert.deepEqual(errors(analysis),[]);return {index,analysis,result:await generateComposition(index,f.plan,analysis,resolved(analysis))};}
function texts(result){return result.assets.filter(a=>a.path.endsWith('.controller')||a.path.endsWith('.anim')||a.path.endsWith('.asset')).flatMap(a=>splitUnityDocuments(decoder.decode(a.asset)).documents.map(d=>({...d,guid:a.guid,path:a.path})));}
function graphCheck(result){const nodes=texts(result),ids=new Set(nodes.map(n=>`${n.guid}:${n.fileId}`));for(const n of nodes)for(const r of extractReferences(n.text)){if(r.fileId==='0'||r.guid===SDK)continue;assert(ids.has(`${r.guid??n.guid}:${r.fileId}`),`Dangling ${n.path}: ${r.text}`);}}
let cases=0;

{
 const f=fixture(),before=clone(f),{index,analysis,result}=await generate(f);
 assert.equal(index.catalog.assets.length,5);assert.equal(index.catalog.controllers.length,2);assert.equal(index.catalog.motions.length,4);
 assert.equal(index.catalog.assets.find(a=>a.guid===GUIDS.junk).status,'opaque');
 assert.deepEqual(analysis.blocks.find(b=>b.id==='base').parameters.map(p=>p.name),['BaseInput','KeptUnused']);
 assert.deepEqual(analysis.blocks.find(b=>b.id==='add').parameters.map(p=>p.name),['Axis','Clock']);
 const ctr=result.assets.find(a=>a.path.endsWith('.controller')),ct=decoder.decode(ctr.asset);
 assert.deepEqual(extractAnimatorLayers(ct).map(l=>l.name),['Base Layer','Added Layer']);
 assert.equal(extractAnimatorLayers(ct)[1].fields.m_DefaultWeight,'1');
 assert(!ct.includes('Unused State'));assert(!result.assets.some(a=>a.path.includes('Unused_Root')));
 assert.equal(result.assets.filter(a=>a.path.endsWith('.anim')).length,1);assert(result.assets.find(a=>a.path.endsWith('.anim')).path.includes('/Shared/'));
 assert(!texts(result).filter(n=>n.path.endsWith('.controller')).some(n=>['74','206'].includes(n.classId)));
 graphCheck(result);assert.deepEqual(f,before,'Inputs are immutable');
 const again=await generate(f);assert.deepEqual(again.result.assets,result.assets,'Same inputs and Plan reproduce all bytes');cases++;
}
{
 const f=fixture();delete f.plan.outputs[0].layerNames;const {analysis}=analyze(f);assert(errors(analysis).some(i=>i.message.includes('Duplicate output Layer name')));cases++;
}
{
 const f=fixture(),other=clone(f.packages[0]);other.hash='b'.repeat(64);other.name='another.unitypackage';
 other.assets=[{...other.assets[0],asset:encode(decoder.decode(other.assets[0].asset).replace('m_Name: Base\n','m_Name: Changed\n'))}];f.packages.push(other);f.plan.inputHashes.push(other.hash);
 let a=analyze(f);assert.equal(a.index.catalog.conflicts.length,1);assert(!a.index.assets.has(GUIDS.base));assert(errors(a.analysis).some(i=>i.message.includes('conflicting GUID')));
 f.plan.assetChoices[GUIDS.base]=other.hash;a=analyze(f);assert.equal(a.index.catalog.controllers.find(c=>c.guid===GUIDS.base).name,'Changed');assert.deepEqual(errors(a.analysis),[]);cases++;
}
{
 const f=fixture(),other=clone(f.packages[0]);other.hash='b'.repeat(64);f.packages.push(other);f.plan.inputHashes.push(other.hash);const a=analyze(f);assert.equal(a.index.catalog.conflicts.length,0);assert.deepEqual(errors(a.analysis),[]);cases++;
}
{
 const f=fixture();f.packages[0].assets=f.packages[0].assets.filter(a=>a.guid!==GUIDS.clip);assert(errors(analyze(f).analysis).some(i=>i.message.includes('m_Motion')));cases++;
}
{
 const f=fixture(),add=f.packages[0].assets.find(a=>a.guid===GUIDS.add);add.asset=encode(decoder.decode(add.asset).replace('  m_StateMachineBehaviours: []','  m_StateMachineBehaviours:\n  - {fileID: 500}')+behaviour('500','123456','  unknownParam: Hidden\n'));
 assert(errors(analyze(f).analysis).some(i=>i.message.includes('Unsupported StateMachineBehaviour')));cases++;
}
{
 const f=fixture();f.plan.outputs[0].motionAssignments=[{blockId:'add',targetId:`${GUIDS.add}:200`,childIndex:null,motionId:`${GUIDS.clip}:7400000`}];
 const {analysis,result}=await generate(f);assert.deepEqual(analysis.blocks.find(b=>b.id==='add').parameters.map(p=>p.name),['Clock']);assert(!texts(result).some(n=>n.classId==='206'));graphCheck(result);cases++;
}
{
 const f=fixture();f.plan.outputs[0].motionAssignments=[{blockId:'add',targetId:`${GUIDS.add}:300`,childIndex:0,motionId:`${GUIDS.tree}:20600000`}];
 const a=analyze(f);assert(a.analysis.missingParameters.some(p=>p.name==='Undeclared'));assert(errors(a.analysis).some(i=>i.code==='undeclared_parameter'));
 f.plan.animatorChoices.fx={Undeclared:{type:'Float',defaultValue:0.25}};
 const {result,analysis}=await generate(f);assert(analysis.blocks.find(b=>b.id==='add').parameters.some(p=>p.name==='Undeclared'&&p.defaultValue===0.25));graphCheck(result);cases++;
}
{
 const f=fixture();f.plan.outputs[0].motionAssignments=[{blockId:'add',targetId:`${GUIDS.add}:301`,childIndex:0,motionId:`${GUIDS.clip}:7400000`}];assert(errors(analyze(f).analysis).some(i=>i.message.includes('not in the selected block')));cases++;
}
{
 const f=fixture();f.plan.outputs[0].motionAssignments=[{blockId:'add',targetId:`${GUIDS.add}:300`,childIndex:0,motionId:`${GUIDS.add}:300`}];assert(errors(analyze(f).analysis).some(i=>i.message.includes('BlendTree cycle')));cases++;
}
{
 const f=fixture(),add=f.packages[0].assets.find(a=>a.guid===GUIDS.add);
 add.asset=encode(controller('Layer control',[parameter('Axis'),parameter('Unused')],[layer('A','100'),layer('B','101',{weight:1})],
 machine('100','A','200')+state('200','LC State',ref('300'),{behaviours:['500']})+tree('300','A Root','Axis')+
 machine('101','B','201')+state('201','B State',ref('301'))+tree('301','B Root','Unused')+
 behaviour('500','-1936262289','  playable: 1\n  layer: 1\n  goalWeight: 0\n  blendDuration: 0.3\n  debugString: \n')));
 f.plan.outputs[0].additions[0].layerIndices=[0,1];f.plan.outputs[0].layerOrder=[{blockId:'base',index:0},{blockId:'add',index:1},{blockId:'add',index:0}];
 const {result}=await generate(f);assert(texts(result).find(n=>n.classId==='114').text.includes('  layer: 1\n'));graphCheck(result);
 f.plan.outputs[0].additions[0].layerIndices=[0];delete f.plan.outputs[0].layerOrder;assert(errors(analyze(f).analysis).some(i=>i.message.includes('unselected source Layer')));cases++;
}
{
 const f=fixture(),add=f.packages[0].assets.find(a=>a.guid===GUIDS.add);
 add.asset=encode(controller('Synced',[parameter('Axis')],[layer('A','100'),layer('B','100',{synced:0})],machine('100','A','200')+state('200','A',ref('300'))+tree('300','Root','Axis')));
 f.plan.outputs[0].additions[0].layerIndices=[0,1];const {result}=await generate(f);const ls=extractAnimatorLayers(decoder.decode(result.assets.find(a=>a.path.endsWith('.controller')).asset));assert.equal(ls[2].fields.m_SyncedLayerIndex,'1');
 f.plan.outputs[0].additions[0].layerIndices=[1];assert(errors(analyze(f).analysis).some(i=>i.message.includes('requires source Layer')));cases++;
}
{
 const f=fixture(),add=f.packages[0].assets.find(a=>a.guid===GUIDS.add);add.asset=encode(decoder.decode(add.asset).replace('  m_StateMachineBehaviours: []','  m_StateMachineBehaviours:\n  - {fileID: 500}')+behaviour('500','1852460640','  layer: 3\n  goalWeight: 1\n  blendDuration: 0\n  debugString: \n  outputParamHash: 0\n'));
 const {result}=await generate(f);assert(texts(result).find(n=>n.classId==='114').text.includes('  layer: 3\n'));cases++;
}
{
 const f=fixture();f.plan.outputs.push({...clone(f.plan.outputs[0]),id:'additive',name:'Other',playable:'Additive',base:{id:'otherbase',controllerId:`${GUIDS.base}:9100000`},additions:[],layerNames:{}});
 const {result}=await generate(f);assert.equal(result.controllers.length,2);assert.equal(result.assets.filter(a=>a.path.endsWith('.anim')).length,1);graphCheck(result);cases++;
}
{
 const f=fixture(),clipAsset=f.packages[0].assets.find(a=>a.guid===GUIDS.clip);clipAsset.asset=encode(clip('7400000','AAP','Axis',kernel.animatorHash('Axis')>>>0));
 f.plan.animatorChoices.fx={Axis:{type:'Float',defaultValue:0}};const {result}=await generate(f);const output=result.assets.find(a=>a.path.endsWith('.anim'));
 assert.equal(decoder.decode(output.asset),decoder.decode(clipAsset.asset),'Curve data is exactly preserved');
 clipAsset.asset=encode(clip('7400000','AAP','Axis',123));assert(errors(analyze(f).analysis).some(i=>i.message.includes('binding hash')));cases++;
}
{
 const f=fixture(),menu=asset(GUIDS.menu,'Assets/Menu.asset',PREAMBLE+behaviour('11400000','-340790334',
 `  Parameters: ${ref('11400000',GUIDS.expr)}\n  controls:\n  - name: Control\n    icon: ${ref('2800000',GUIDS.image).replace('type: 2','type: 3')}\n    type: 102\n    parameter:\n      name: MenuOnly\n    value: 1\n    subMenu: {fileID: 0}\n    subParameters: []\n    labels:\n    - name: LabelIsNotAParameter\n      icon: {fileID: 0}\n`),'11400000');
 const image={guid:GUIDS.image,path:'Assets/icon.png',asset:new Uint8Array([137,80,78,71]),meta:`fileFormatVersion: 2\nguid: ${GUIDS.image}\nTextureImporter:\n  externalObjects: {}\n  serializedVersion: 12\n`};
 f.packages[0].assets.push(menu,image);f.plan.installer.menuId=`${GUIDS.menu}:11400000`;
 const {analysis,result}=await generate(f);assert.deepEqual(analysis.menuParameters.map(p=>p.name),['MenuOnly']);assert(result.menu);
 const expression=await makeGeneratedAsset('Assets/ComposerFixture','Parameters/ExpressionParameters.asset','','11400000');
 const text=decoder.decode(result.assets.find(a=>a.guid===result.menu.guid).asset);assert(text.includes(`Parameters: ${ref('11400000',expression.guid)}`));
 assert(extractReferences(text).some(r=>r.fileId==='2800000'&&r.type==='3'),'Imported resource reference type is preserved');
 assert.equal(result.assets.filter(a=>a.path.endsWith('.png')).length,1);assert.deepEqual(result.assets.find(a=>a.path.endsWith('.png')).asset,image.asset);cases++;
}
{
 const f=fixture();f.plan.inputHashes=['b'.repeat(64)];assert(errors(analyze(f).analysis).some(i=>i.code==='input_changed'));
 const normal=fixture(),{index,analysis}=analyze(normal);normal.plan.name='changed';await assert.rejects(()=>generateComposition(index,normal.plan,analysis,resolved(analysis)),/stale/);cases++;
}
{
 const f=fixture(),base=f.packages[0].assets.find(a=>a.guid===GUIDS.base);
 base.asset=encode(decoder.decode(base.asset)+tree('777','UnconnectedBaseTree','MissingButUnconnected'));
 const {analysis,result}=await generate(f);assert(texts(result).some(n=>n.text.includes('m_Name: UnconnectedBaseTree')));
 assert(!analysis.missingParameters.some(p=>p.name==='MissingButUnconnected'));assert(analysis.slots.some(s=>!s.reachable));cases++;
}
{
 const f=fixture(),alt='99999999999999999999999999999999';f.packages[0].assets.push(asset(alt,'Assets/Alt.anim',clip('7400000','Alt'),'7400000'));
 f.plan.outputs[0].additions.push({...f.plan.outputs[0].additions[0],id:'second'});f.plan.outputs[0].layerNames['second:0']='Second';
 f.plan.outputs[0].motionAssignments=[{blockId:'second',targetId:`${GUIDS.add}:300`,childIndex:0,motionId:`${alt}:7400000`}];
 const {result}=await generate(f);assert.equal(texts(result).filter(n=>n.classId==='206').length,2);graphCheck(result);cases++;
}
{
 const f=fixture(),add=f.packages[0].assets.find(a=>a.guid===GUIDS.add);add.asset=encode(decoder.decode(add.asset).replace('m_Motion: {fileID: 300}','m_Motion: {fileID: 201}'));
 assert(errors(analyze(f).analysis).some(i=>i.message.includes('expected class 74/206')));cases++;
}
let originalRegression=null;
// Optional private source regression. Source bytes are read at runtime, never
// embedded in public files or committed fixtures.
if(process.argv[2]) {
 const packages=['ARKIT','DontHaveARKIT','FT_PARAMETER_PROXY','DecodeParameter_Sample_ver1.01'].map(name=>{
   const bytes=fs.readFileSync(`${process.argv[2]}/${name}.unitypackage`);
   return {name,hash:createHash('sha256').update(bytes).digest('hex'),assets:[...readUnityPackage(bytes).values()]};
 });
 const index=indexPackages(packages),base=index.catalog.controllers.find(c=>index.assets.get(c.guid).packageName==='ARKIT'&&c.name==='ARKit_FT_FX'),
   eye=index.catalog.controllers.find(c=>c.name==='ThreusMaho_NK_BaseFX_GestureSuppress'),add=index.catalog.controllers.find(c=>c.name==='Additive+C_Maho');
 const plan={schemaVersion:1,name:'OriginalStructureRegression',inputHashes:packages.map(p=>p.hash),assetChoices:{},outputs:[
   {id:'fx',name:'Combined',playable:'FX',base:{id:'base',controllerId:base.id},additions:[{id:'eyes',controllerId:eye.id,layerIndices:eye.layers.filter(l=>['EyeXY_Para','EyeXY_Shape'].includes(l.name)).map(l=>l.index)}]},
   {id:'additive',name:'Additive',playable:'Additive',base:{id:'additiveBase',controllerId:add.id},additions:[]}],
   animatorChoices:{fx:{'v2/MouthRaiserLower':{type:'Float',defaultValue:0}}},installer:{}};
 const analysis=analyzeComposition(index,plan,kernel);assert.deepEqual(errors(analysis),[]);
 const result=await generateComposition(index,plan,analysis,resolved(analysis));graphCheck(result);
 const outputNodes=new Map(texts(result).map(n=>[`${n.guid}:${n.fileId}`,n]));
 const inverse=new Map();for(const m of result.report.objectMapping)if(m.sourceId){const key=`${m.outputGuid}:${m.outputFileId}`;const ids=inverse.get(key)??new Set();ids.add(m.sourceId);inverse.set(key,ids);}
 const withoutIdentity=text=>{
   let value=replaceDocumentFileId(canonicalizeObjectReferences(text),'1').replace(/^  m_ObjectHideFlags:[^\r\n]*/m,'  m_ObjectHideFlags: 0');
   for(const r of [...extractReferences(value)].reverse())value=value.slice(0,r.start)+'{REFERENCE}'+value.slice(r.end);
   return value.replaceAll('\r\n','\n');
 };
 let compared=0,references=0;
 for(const m of result.report.objectMapping) {
   if(!m.sourceId)continue;const source=index.nodes.get(m.sourceId),output=outputNodes.get(`${m.outputGuid}:${m.outputFileId}`);
   assert(output,`Missing mapped output ${m.outputPath}`);assert.equal(source.classId,output.classId);
   // No Motion assignments, LayerControl or parameter renames are requested in
   // this regression, so all copied document fields must otherwise be exact.
   assert.equal(withoutIdentity(output.text),withoutIdentity(source.text),`Unintended serialized change: ${m.sourceId}`);
   const before=extractReferences(canonicalizeObjectReferences(source.text)),after=extractReferences(canonicalizeObjectReferences(output.text));assert.equal(after.length,before.length);
   for(let i=0;i<before.length;i++) {
     const a=before[i],b=after[i];if(a.fileId==='0'){assert.equal(b.fileId,'0');continue;}
     if(a.guid===SDK){assert.equal(a.fileId,b.fileId);assert.equal(a.guid,b.guid);continue;}
     const original=`${a.guid??source.guid}:${a.fileId}`,final=`${b.guid??output.guid}:${b.fileId}`;
     assert(inverse.get(final)?.has(original),`Wrong mapped reference ${original} -> ${final}`);references++;
   }
   compared++;
 }
 for(const controller of [base,add])for(const source of index.assets.get(controller.guid).documents)if(source.classId!=='91')
   assert(result.report.objectMapping.some(m=>m.sourceId===`${controller.guid}:${source.fileId}`),'Every base subasset, including unreachable subassets, is retained');
 originalRegression={status:'PASS',layers:analysis.summary.layers,comparedDocuments:compared,comparedReferences:references,assets:result.assets.length};
}
console.log(JSON.stringify({status:'PASS',cases,scope:'Independent Unity text fixtures with actual Hike hash kernel',originalRegression,unity:'NOT_RUN'}));

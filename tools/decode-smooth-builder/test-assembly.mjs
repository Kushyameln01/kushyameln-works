import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generatePackage} from '../../docs/parameter-template/core.mjs';
import {readUnityPackage,writeUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {splitUnityDocuments,extractReferences,extractAnimatorLayers,extractAnimatorParameters} from '../../docs/shared/ft/unity-text.mjs';
import {buildIntermediateAssets} from '../../docs/decode-smooth-builder/assembly.mjs';

const template=JSON.parse(await readFile(new URL('../../docs/parameter-template/template.json',import.meta.url),'utf8'));
const decoder=new TextDecoder(),encoder=new TextEncoder();
const generated=['v2/EyeLidLeft','v2/EyeLidRight'].map(target=>({target,...generatePackage(target,{template})}));
const source=generated.map(p=>readUnityPackage(p.bytes));
const docs=entry=>splitUnityDocuments(decoder.decode(entry.asset)).documents;
const allDocs=entries=>[...entries.values()].filter(e=>e.asset!==null).flatMap(e=>docs(e).map(d=>({...d,guid:e.guid,path:e.path})));
const byName=(entries,name)=>allDocs(entries).filter(d=>new RegExp(`^  m_Name: ${name}$`,'m').test(d.text));
const replaceEntry=(input,predicate,change)=>({...input,bytes:writeUnityPackage([...readUnityPackage(input.bytes).values()].map(e=>predicate(e)?change(e):e))});
const root=(entries,leaf,kind)=>byName(entries,leaf+'_'+kind+'_Root').find(d=>d.classId==='206');

test('real two-name Template packages produce three real intermediate packages with independent readback totals',async()=>{
  const result=await buildIntermediateAssets(generated);
  for(const key of ['motionPackage','basePackage','maskPackage']){
    assert.ok(result[key] instanceof Uint8Array);
    assert.ok(result[key].length>100);
  }
  const motion=readUnityPackage(result.motionPackage),objects=allDocs(motion);
  assert.equal(motion.size,39);
  assert.equal([...motion.values()].filter(e=>e.asset===null).length,5);
  assert.equal(objects.filter(d=>d.classId==='206').length,34);
  assert.equal(objects.filter(d=>d.classId==='74').length,60);
  assert.deepEqual(result.summary,{targetCount:2,treeCount:34,clipCount:60});
  const packs={baseController:readUnityPackage(result.basePackage),mask:readUnityPackage(result.maskPackage),binaryTree:motion,smoothTree:motion};
  const classes={baseController:'91',mask:'319',binaryTree:'206',smoothTree:'206'};
  const inputGuids=new Set(source.flatMap(p=>[...p.keys()])),newGuids=new Set();
  for(const [key,ref]of Object.entries(result.refs)){
    assert.match(ref.guid,/^[0-9a-f]{32}$/);
    assert.match(ref.fileId,/^[1-9][0-9]*$/);
    assert.equal(typeof ref.fileId,'string');
    assert.ok(!inputGuids.has(ref.guid));
    assert.ok(!newGuids.has(ref.guid));newGuids.add(ref.guid);
    assert.equal(docs(packs[key].get(ref.guid)).find(d=>d.fileId===ref.fileId)?.classId,classes[key]);
  }
});

test('relocation preserves all original GUIDs, metadata, asset bytes and embedded local references',async()=>{
  const inputSnapshots=generated.map(p=>p.bytes.slice());
  const motion=readUnityPackage((await buildIntermediateAssets(generated)).motionPackage);
  const folder=[...motion.values()].find(e=>e.path==='Assets/Root_DecodeSmooth');
  assert.equal(folder.asset,null);assert.match(folder.meta,/^folderAsset: yes$/m);
  for(const original of source.flatMap(p=>[...p.values()])){
    const output=motion.get(original.guid);
    assert.ok(output,original.path);
    assert.equal(output.path,'Assets/Root_DecodeSmooth/'+original.path.slice('Assets/'.length));
    assert.equal(output.meta,original.meta);
    assert.deepEqual(output.asset,original.asset);
    if(output.asset===null)continue;
    const documents=docs(output),ids=new Set(documents.map(d=>d.fileId));
    for(const ref of extractReferences(decoder.decode(output.asset))){
      if(ref.fileId==='0')continue;
      if(ref.guid){
        assert.ok(motion.has(ref.guid));
        assert.ok(docs(motion.get(ref.guid)).some(d=>d.fileId===ref.fileId));
      }else assert.ok(ids.has(ref.fileId),`embedded ${output.path}:${ref.fileId}`);
    }
  }
  generated.forEach((p,i)=>assert.deepEqual(p.bytes,inputSnapshots[i]));
});

test('both new DirectTrees use each exact root GUID/fileID in input order with AlwaysOne and normalization off',async()=>{
  const result=await buildIntermediateAssets(generated),motion=readUnityPackage(result.motionPackage);
  for(const [key,kind,name]of [['binaryTree','Binary','Root_BinaryParameter'],['smoothTree','Smooth','Root_Smooth_Parameter']]){
    const tree=docs(motion.get(result.refs[key].guid)).find(d=>d.fileId===result.refs[key].fileId);
    assert.equal(tree.classId,'206');assert.match(tree.text,new RegExp(`^  m_Name: ${name}$`,'m'));
    assert.match(tree.text,/^  m_BlendType: 4$/m);
    assert.match(tree.text,/^  m_NormalizedBlendValues: 0$/m);
    assert.equal([...tree.text.matchAll(/^    m_DirectBlendParameter: AlwaysOne$/gm)].length,2);
    assert.equal([...tree.text.matchAll(/^  - serializedVersion: 2$/gm)].length,2);
    const motions=extractReferences(tree.text).filter(r=>r.kind==='external');
    assert.deepEqual(motions.map(r=>({guid:r.guid,fileId:r.fileId,type:r.type})),source.map((entries,i)=>{
      const original=root(entries,generated[i].target.slice(3),kind);
      return {guid:original.guid,fileId:original.fileId,type:'2'};
    }));
  }
});

test('base has one Layer0, Float AlwaysOne=1, and Entry to an empty child machine with no State or Motion',async()=>{
  const result=await buildIntermediateAssets(generated),base=readUnityPackage(result.basePackage);
  const entry=base.get(result.refs.baseController.guid),objects=docs(entry),text=decoder.decode(entry.asset);
  const layers=extractAnimatorLayers(text),parameters=extractAnimatorParameters(text);
  assert.equal(layers.length,1);assert.equal(layers[0].name,'Base Layer');
  assert.equal(parameters.length,1);assert.equal(parameters[0].name,'AlwaysOne');
  assert.equal(parameters[0].fields.m_Type,'1');assert.equal(parameters[0].fields.m_DefaultFloat,'1');
  assert.deepEqual(objects.map(d=>d.classId).sort(),['1107','1107','1109','91'].sort());
  const machines=objects.filter(d=>d.classId==='1107');
  const parent=machines.find(d=>!d.text.includes('m_ChildStateMachines: []'));
  const child=machines.find(d=>d!==parent),transition=objects.find(d=>d.classId==='1109');
  assert.match(layers[0].fields.m_StateMachine,new RegExp(`fileID: ${parent.fileId}`));
  assert.match(parent.text,new RegExp(`m_StateMachine: \\{fileID: ${child.fileId}\\}`));
  assert.match(parent.text,new RegExp(`m_EntryTransitions:\\n  - \\{fileID: ${transition.fileId}\\}`));
  assert.match(child.text,/^  m_ChildStateMachines: \[\]$/m);
  assert.match(child.text,/^  m_EntryTransitions: \[\]$/m);
  for(const machine of machines){
    assert.match(machine.text,/^  m_ChildStates: \[\]$/m);
    assert.match(machine.text,/^  m_DefaultState: \{fileID: 0\}$/m);
  }
  assert.match(transition.text,/^  m_Conditions: \[\]$/m);
  assert.match(transition.text,new RegExp(`m_DstStateMachine: \\{fileID: ${child.fileId}\\}`));
  assert.match(transition.text,/^  m_DstState: \{fileID: 0\}$/m);
  assert.match(transition.text,/^  m_IsExit: 0$/m);
  assert.doesNotMatch(text,/^  m_Motion:/m);
  const ids=new Set(objects.map(d=>d.fileId));
  for(const ref of extractReferences(text))if(ref.fileId!=='0')assert.ok(!ref.guid&&ids.has(ref.fileId));
  // This proves serialized structure only. Unity Import and consumer-specific
  // treatment of an empty child machine remain intentionally unverified.
});

test('Safety masks all 13 Humanoid parts and has no imported rig or transform entries',async()=>{
  const result=await buildIntermediateAssets(generated),mask=readUnityPackage(result.maskPackage);
  const objects=docs(mask.get(result.refs.mask.guid));assert.equal(objects.length,1);
  assert.equal(objects[0].classId,'319');assert.match(objects[0].text,/^  m_Name: Safety$/m);
  const humanoid=/^  m_Mask: ([0-9a-f]+)$/m.exec(objects[0].text)?.[1];
  assert.equal(humanoid?.length,13*8);assert.equal(humanoid,'0'.repeat(13*8));
  assert.match(objects[0].text,/^  m_Elements: \[\]$/m);
  assert.doesNotMatch(objects[0].text,/m_Path:|m_Weight:|ImportRig/);
});

test('empty inputs, duplicate targets/GUIDs and case-colliding relocated paths fail explicitly',async()=>{
  await assert.rejects(buildIntermediateAssets([]),/package.*required/i);
  await assert.rejects(buildIntermediateAssets([generated[0],generated[0]]),/duplicate target/i);
  const firstRoot=root(source[0],'EyeLidLeft','Binary');
  const collision=replaceEntry(generated[1],e=>e.guid===root(source[1],'EyeLidRight','Binary').guid,e=>({
    ...e,guid:firstRoot.guid,meta:e.meta.replace(/^guid: .+$/m,'guid: '+firstRoot.guid)
  }));
  await assert.rejects(buildIntermediateAssets([generated[0],collision]),/duplicate GUID/i);
  const pathCollision=replaceEntry(generated[1],()=>true,e=>({...e,path:e.path.replace(/^Assets\/EyeLidRight(?=\/|$)/,'Assets/eyelidleft')}));
  await assert.rejects(buildIntermediateAssets([generated[0],pathCollision]),/duplicate.*path/i);
});

test('missing, ambiguous and wrong-type exact root identities fail instead of guessing a root by substring',async()=>{
  const original=generated[0],binary=root(source[0],'EyeLidLeft','Binary');
  const renamed=replaceEntry(original,e=>e.guid===binary.guid,e=>({...e,asset:encoder.encode(decoder.decode(e.asset).replace('m_Name: EyeLidLeft_Binary_Root','m_Name: prefix_EyeLidLeft_Binary_Root_suffix'))}));
  await assert.rejects(buildIntermediateAssets([renamed]),/Binary_Root.*missing|missing.*Binary_Root/i);
  const ambiguous=replaceEntry(original,e=>e.guid===root(source[0],'EyeLidLeft','Smooth').guid,e=>({...e,asset:encoder.encode(decoder.decode(e.asset).replace('m_Name: EyeLidLeft_Smooth_Root','m_Name: EyeLidLeft_Binary_Root'))}));
  await assert.rejects(buildIntermediateAssets([ambiguous]),/Binary_Root.*ambiguous|ambiguous.*Binary_Root/i);
  const wrongType=replaceEntry(original,e=>e.guid===binary.guid,e=>({...e,asset:encoder.encode(decoder.decode(e.asset).replace('--- !u!206 &20600000\nBlendTree:','--- !u!74 &20600000\nAnimationClip:'))}));
  await assert.rejects(buildIntermediateAssets([wrongType]),/Binary_Root.*class 206|Binary_Root.*BlendTree/i);
});

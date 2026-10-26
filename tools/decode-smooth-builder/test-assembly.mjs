import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateTemplate} from '../../docs/parameter-template/api.mjs';
import {readUnityPackage,writeUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {splitUnityDocuments,extractReferences,extractAnimatorLayers,extractAnimatorParameters} from '../../docs/shared/ft/unity-text.mjs';
import {buildIntermediateAssets} from '../../docs/decode-smooth-builder/assembly.mjs';

const decoder=new TextDecoder(),encoder=new TextEncoder();
const previousFetch=globalThis.fetch;let generated;
try{globalThis.fetch=async url=>new Response(await readFile(url));generated=await Promise.all(['v2/EyeLidLeft','v2/EyeLidRight'].map(target=>generateTemplate(target)));}
finally{globalThis.fetch=previousFetch;}
const source=generated.map(p=>readUnityPackage(p.bytes));
const docs=entry=>splitUnityDocuments(decoder.decode(entry.asset)).documents;
const allDocs=entries=>[...entries.values()].filter(e=>e.asset!==null).flatMap(e=>docs(e).map(d=>({...d,guid:e.guid,path:e.path})));
const replaceEntry=(input,predicate,change)=>({...input,bytes:writeUnityPackage([...readUnityPackage(input.bytes).values()].map(e=>predicate(e)?change(e):e))});
const root=(entries,reference)=>docs(entries.get(reference.guid)).find(d=>d.fileId===reference.fileId);

test('real two-name Template packages produce three real intermediate packages with independent readback totals',async()=>{
  const result=await buildIntermediateAssets(generated);
  for(const key of ['motionPackage','basePackage','maskPackage']){
    assert.ok(result[key] instanceof Uint8Array);
    assert.ok(result[key].length>100);
  }
  const motion=readUnityPackage(result.motionPackage),objects=allDocs(motion);
  const originals=source.flatMap(p=>[...p.values()]),originalObjects=source.flatMap(allDocs),treeCount=originalObjects.filter(d=>d.classId==='206').length+2,clipCount=originalObjects.filter(d=>d.classId==='74').length;
  assert.equal(motion.size,originals.length+3);
  assert.equal([...motion.values()].filter(e=>e.asset===null).length,originals.filter(e=>e.asset===null).length+1);
  assert.equal(objects.filter(d=>d.classId==='206').length,treeCount);
  assert.equal(objects.filter(d=>d.classId==='74').length,clipCount);
  assert.deepEqual(result.summary,{targetCount:generated.length,treeCount,clipCount});
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
  for(const [key,kind,name]of [['binaryTree','binary','Root_BinaryParameter'],['smoothTree','smooth','Root_Smooth_Parameter']]){
    const tree=docs(motion.get(result.refs[key].guid)).find(d=>d.fileId===result.refs[key].fileId);
    assert.equal(tree.classId,'206');assert.match(tree.text,new RegExp(`^  m_Name: ${name}$`,'m'));
    assert.match(tree.text,/^  m_BlendType: 4$/m);
    assert.match(tree.text,/^  m_NormalizedBlendValues: 0$/m);
    assert.equal([...tree.text.matchAll(/^    m_DirectBlendParameter: AlwaysOne$/gm)].length,generated.length);
    assert.equal([...tree.text.matchAll(/^  - serializedVersion: 2$/gm)].length,generated.length);
    const motions=extractReferences(tree.text).filter(r=>r.kind==='external');
    assert.deepEqual(motions.map(r=>({guid:r.guid,fileId:r.fileId,type:r.type})),source.map((entries,i)=>{
      const original=root(entries,generated[i].roots[kind]);
      return {guid:entries.get(generated[i].roots[kind].guid).guid,fileId:original.fileId,type:'2'};
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
  const firstRoot=generated[0].roots.binary;
  const collision=replaceEntry(generated[1],e=>e.guid===generated[1].roots.binary.guid,e=>({
    ...e,guid:firstRoot.guid,meta:e.meta.replace(/^guid: .+$/m,'guid: '+firstRoot.guid)
  }));
  await assert.rejects(buildIntermediateAssets([generated[0],collision]),/duplicate GUID/i);
  const originalPath=generated[1].rootFolder.path,collidingPath='Assets/'+generated[0].rootFolder.path.slice('Assets/'.length).toLowerCase();
  const pathCollision={...replaceEntry(generated[1],()=>true,e=>({...e,path:collidingPath+e.path.slice(originalPath.length)})),rootFolder:{...generated[1].rootFolder,path:collidingPath}};
  await assert.rejects(buildIntermediateAssets([generated[0],pathCollision]),/duplicate.*path/i);
});

test('root display names and folder placement may change while exact API metadata still resolves',async()=>{
  const original=generated[0],rootGuids=new Set(Object.values(original.roots).map(r=>r.guid)),newPath='Assets/Changed/Container';
  const renamed={...replaceEntry(original,()=>true,e=>({...e,path:newPath+e.path.slice(original.rootFolder.path.length),...(e.asset&&rootGuids.has(e.guid)?{asset:encoder.encode(decoder.decode(e.asset).replace(/^  m_Name:.*$/m,'  m_Name: Edited display name'))}:{})})),rootFolder:{...original.rootFolder,path:newPath}};
  const result=await buildIntermediateAssets([renamed]),motion=readUnityPackage(result.motionPackage);
  for(const [key,kind]of [['binaryTree','binary'],['smoothTree','smooth']]){
    const tree=root(motion,result.refs[key]),refs=extractReferences(tree.text).filter(r=>r.guid);
    assert.deepEqual(refs.map(r=>({guid:r.guid,fileId:r.fileId})),[original.roots[kind]]);
    assert.ok(motion.has(original.roots[kind].guid));
  }
});

test('wrong root/folder metadata and wrong root object classes are rejected without display-name guessing',async()=>{
  const original=generated[0],binary=original.roots.binary,occupied=new Set(docs(source[0].get(binary.guid)).map(d=>d.fileId));let missingId=1n;while(occupied.has(String(missingId)))missingId++;
  await assert.rejects(buildIntermediateAssets([{...original,roots:undefined}]),/root.*GUID\/fileID/i);
  await assert.rejects(buildIntermediateAssets([{...original,roots:{...original.roots,binary:{...binary,fileId:String(missingId)}}}]),/root.*GUID\/fileID/i);
  await assert.rejects(buildIntermediateAssets([{...original,roots:{...original.roots,binary:original.roots.smooth}}]),/distinct GUID\/fileID/i);
  await assert.rejects(buildIntermediateAssets([{...original,rootFolder:{...original.rootFolder,path:original.rootFolder.path+'/Unrelated'}}]),/rootFolder.*GUID\/path/i);
  await assert.rejects(buildIntermediateAssets([{...original,rootFolder:{...original.rootFolder,guid:binary.guid}}]),/rootFolder.*GUID\/path/i);
  const wrongType=replaceEntry(original,e=>e.guid===binary.guid,e=>({...e,asset:encoder.encode(decoder.decode(e.asset).replace(`--- !u!206 &${binary.fileId}\nBlendTree:`,`--- !u!74 &${binary.fileId}\nAnimationClip:`))}));
  await assert.rejects(buildIntermediateAssets([wrongType]),/root.*class 206|root.*BlendTree/i);
});

test('assembly counts variable source contents instead of a fixed Template size',async()=>{
  const original=generated[0],entries=[...readUnityPackage(original.bytes).values()];let candidate=1;
  while(entries.some(e=>e.guid===candidate.toString(16).padStart(32,'0')))candidate++;
  const guid=candidate.toString(16).padStart(32,'0'),entry={guid,path:original.rootFolder.path+'/Variable_'+guid+'.asset',asset:encoder.encode('%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!206 &20600000\nBlendTree:\n  m_Name: Additional tree\n  m_Childs: []\n--- !u!74 &7400000\nAnimationClip:\n  m_Name: Additional clip\n'),meta:`fileFormatVersion: 2\nguid: ${guid}\nNativeFormatImporter:\n  mainObjectFileID: 20600000\n`};
  const changed={...original,bytes:writeUnityPackage([...entries,entry]),treeCount:original.treeCount+1,clipCount:original.clipCount+1},result=await buildIntermediateAssets([changed]),sourceObjects=allDocs(readUnityPackage(changed.bytes)),motion=readUnityPackage(result.motionPackage);
  assert.deepEqual(result.summary,{targetCount:1,treeCount:sourceObjects.filter(d=>d.classId==='206').length+2,clipCount:sourceObjects.filter(d=>d.classId==='74').length});
  assert.deepEqual(motion.get(guid).asset,entry.asset);
});

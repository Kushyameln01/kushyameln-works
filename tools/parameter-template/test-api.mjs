// Runtime regression cases for external validation. Not executed in the
// static-only Codex repair session.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateTemplate,isTemplateResult} from '../../docs/parameter-template/api.mjs';
import {readUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {splitUnityDocuments} from '../../docs/shared/ft/unity-text.mjs';
const original=JSON.parse(await readFile(new URL('../../docs/parameter-template/template.json',import.meta.url),'utf8'));
async function withSource(source,callback){
  const previous=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{assert.equal(url.pathname,new URL('../../docs/parameter-template/template.json',import.meta.url).pathname);calls.push(options);return new Response(JSON.stringify(source));};
  try{return await callback(calls);}finally{globalThis.fetch=previous;}
}
function objectCounts(bytes){
  const objects=[...readUnityPackage(bytes).values()].filter(e=>e.asset).flatMap(e=>splitUnityDocuments(new TextDecoder().decode(e.asset)).documents);
  return {trees:objects.filter(d=>d.classId==='206').length,clips:objects.filter(d=>d.classId==='74').length};
}
// Catches an omitted/wrong/duplicated Decode child: saved Clips alone cannot
// write Decode/<target> unless the Binary root actually references their Tree.
function decodeConnection(result){
  const entries=readUnityPackage(result.bytes),binary=entries.get(result.roots.binary.guid);
  const tree=splitUnityDocuments(new TextDecoder().decode(binary.asset)).documents.find(d=>d.fileId===result.roots.binary.fileId);
  const children=[...tree.text.matchAll(/^  - serializedVersion: 2\n[\s\S]*?(?=^  - serializedVersion:|^  m_BlendParameter:)/gm)].map(m=>m[0]);
  const names=children.map(child=>{
    const guid=/m_Motion: \{fileID: 20600000, guid: ([0-9a-f]{32}), type: 2\}/.exec(child)?.[1];
    assert(guid&&entries.has(guid),'Every Binary child must resolve to a generated Tree');
    return /^  m_Name: (.+)$/m.exec(new TextDecoder().decode(entries.get(guid).asset))[1];
  });
  const leaf=result.target.slice(3);
  assert.deepEqual(names,[...['1','2','4','8','Negative'].map(suffix=>leaf+'_Binary_Decode'+suffix),leaf+'_Decode_Root']);
  assert.match(children.at(-1),/^    m_DirectBlendParameter: AlwaysOne$/m);
  assert.match(children.at(-1),/^    m_TimeScale: 1$/m);
  assert.match(tree.text,/^  m_NormalizedBlendValues: 0$/m);
  return children;
}
test('generated Binary root reaches the existing Decode root once and preserves the source',async()=>{
  const snapshot=JSON.stringify(original);
  await withSource(original,async()=>{
    for(const target of ['v2/EyeLidLeft','v2/JawX']){
      const result=await generateTemplate(target);decodeConnection(result);
      assert.deepEqual(objectCounts(result.bytes),{trees:16,clips:30});
    }
  });
  assert.equal(JSON.stringify(original),snapshot);
});
test('an existing Binary-to-Decode child is preserved without duplication',async()=>{
  const changed=structuredClone(original),binary=changed.trees.find(t=>/^  m_Name: Binary_Root$/m.test(t.text)),decode=changed.trees.find(t=>/^  m_Name: Decode_Root$/m.test(t.text));
  const child=`  - serializedVersion: 2\n    m_Motion: {fileID: 20600000, guid: ${decode.guid}, type: 2}\n    m_Threshold: 0\n    m_Position: {x: 0, y: 0}\n    m_TimeScale: 1\n    m_CycleOffset: 0\n    m_DirectBlendParameter: AlwaysOne\n    m_Mirror: 0\n`;
  binary.text=binary.text.replace(/^  m_BlendParameter:/m,child+'  m_BlendParameter:');
  await withSource(changed,async()=>decodeConnection(await generateTemplate('v2/AlreadyConnected')));
});
test('a missing Decode root fails instead of emitting an unconnected Binary root',async()=>{
  const changed=structuredClone(original);changed.trees=changed.trees.filter(t=>!/^  m_Name: Decode_Root$/m.test(t.text));
  await withSource(changed,async()=>assert.rejects(generateTemplate('v2/MissingDecode'),/Decode_Root/));
});
test('a changed current Template is loaded without a content digest gate or cached data',async()=>{
  const changed=structuredClone(original);changed.editMarker='supported data edit changes source bytes';
  await withSource(changed,async calls=>{
    const a=await generateTemplate('v2/EditedSource'),b=await generateTemplate('v2/EditedSource');
    assert(isTemplateResult(a,{target:'v2/EditedSource'}));assert(isTemplateResult(b,{target:'v2/EditedSource'}));
    assert.equal(calls.length,2);assert(calls.every(options=>options.cache==='no-store'));
    assert(isTemplateResult({...a,buildId:'future-compatible-generator-build'},{target:a.target}));
    const counts=objectCounts(a.bytes);assert.equal(a.treeCount,counts.trees);assert.equal(a.clipCount,counts.clips);
  });
});
test('additional valid Template Tree and Clip entries use actual package counts and exact root roles',async()=>{
  const changed=structuredClone(original),allGuids=new Set([...changed.trees,...changed.clips].map(x=>x.guid));
  const clip=changed.clips.find(c=>changed.trees.some(t=>t.text.includes(c.guid))),tree=changed.trees.find(t=>t.text.includes(clip.guid));
  assert(clip&&tree);const extraClip=structuredClone(clip),extraTree=structuredClone(tree);
  let candidate=1n;const nextGuid=()=>{while(allGuids.has(candidate.toString(16).padStart(32,'0')))candidate++;const value=candidate.toString(16).padStart(32,'0');allGuids.add(value);candidate++;return value;};
  extraClip.guid=nextGuid();extraTree.guid=nextGuid();
  extraClip.text=extraClip.text.replace(/^  m_Name: .+$/m,'  m_Name: Parameter_AdditionalClip');
  extraTree.text=extraTree.text.replace(/^  m_Name: .+$/m,'  m_Name: Parameter_AdditionalTree').replaceAll(clip.guid,extraClip.guid);
  changed.clips.push(extraClip);changed.trees.push(extraTree);
  await withSource(changed,async()=>{
    const result=await generateTemplate('v2/VariableCounts'),counts=objectCounts(result.bytes);
    assert.equal(result.treeCount,changed.trees.length);assert.equal(result.treeCount,counts.trees);assert.equal(result.clipCount,counts.clips);
    const entries=readUnityPackage(result.bytes);
    for(const ref of Object.values(result.roots))assert(splitUnityDocuments(new TextDecoder().decode(entries.get(ref.guid).asset)).documents.some(d=>d.fileId===ref.fileId&&d.classId==='206'));
    assert.equal(entries.get(result.rootFolder.guid).path,result.rootFolder.path);
  });
});
test('unsupported schema and unresolved Motion references still reject; malformed API identities are rejected',async()=>{
  await withSource({...original,schemaVersion:0},async()=>assert.rejects(generateTemplate('v2/InvalidSchema'),/Template/));
  const broken=structuredClone(original);broken.trees[0].text=broken.trees[0].text.replace(/(m_Motion: \{fileID: -?\d+, guid: )[0-9a-f]{32}/,'$1'+'f'.repeat(32));
  assert.notEqual(broken.trees[0].text,original.trees[0].text);
  await withSource(broken,async()=>assert.rejects(generateTemplate('v2/InvalidReference'),/参照/));
  await withSource(original,async()=>{
    const result=await generateTemplate('v2/ValidShape');
    assert.equal(isTemplateResult(result,{target:'v2/AnotherTarget'}),false);
    assert.equal(isTemplateResult({...result,bytes:new Uint8Array()}),false);
    assert.equal(isTemplateResult({...result,roots:{binary:result.roots.binary,smooth:result.roots.binary}}),false);
    assert.equal(isTemplateResult({...result,rootFolder:{...result.rootFolder,path:'Assets/../Escape'}}),false);
  });
});
test('every edited Motion field is validated instead of silently bypassing rewriting',async()=>{
  for(const value of ['{fileID: 7400000}','{fileID: 7400000, guid: '+'f'.repeat(32)+', type: 3}','{fileID: 7400000, guid: broken, type: 2}','{fileID: 7400000, type: 2}']){
    const changed=structuredClone(original);changed.trees[0].text=changed.trees[0].text.replace(/^(    m_Motion: )[^\n]+/m,'$1'+value);
    assert.notEqual(changed.trees[0].text,original.trees[0].text);
    await withSource(changed,async()=>assert.rejects(generateTemplate('v2/RejectedMotion'),/Motion/));
  }
  for(const edit of [value=>'{fileID: 0}',value=>value.replaceAll(', ', ',').replace(/guid: ([0-9a-f]{32})/,(_,guid)=>'guid: '+guid.toUpperCase())]){
    const changed=structuredClone(original);changed.trees[0].text=changed.trees[0].text.replace(/^(    m_Motion: )([^\n]+)/m,(_,prefix,value)=>prefix+edit(value));
    await withSource(changed,async()=>{const result=await generateTemplate('v2/SupportedMotion');assert(isTemplateResult(result,{target:'v2/SupportedMotion'}));});
  }
});

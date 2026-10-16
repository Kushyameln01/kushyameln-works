// Expected contracts authored before the parser. Run only on a hash-verified Pages copy.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root=process.env.UNITY_PAGES_ROOT;
if(!root)throw Error('UNITY_PAGES_ROOT must identify the acquired Pages revision');
const {parseUnityFile,TEXT_LIMITS}=await import(pathToFileURL(root+'/shared/unity-analysis/text.mjs'));
const fixtureRoot=new URL('./fixtures/raw-before/Assets/',import.meta.url);
const wrap=(body,id='1',classId='114')=>`%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!${classId} &${id}\n${body}`;
const parse=(text,path='Assets/Test.asset')=>parseUnityFile({path,text});

export async function checkTextParser(){
 const controller=parse(await readFile(new URL('Demo.controller',fixtureRoot),'utf8'),'Assets/Demo.controller');
 assert.equal(controller.coverage,'serialized');assert.equal(controller.objects.length,6);
 const declaration=controller.objects.find(o=>o.fileId==='9100000').parameters[0];
 assert.equal(declaration.name,'Speed');assert.equal(declaration.type,'Float');assert.equal(declaration.domain,'animator');
 const condition=controller.objects.find(o=>o.fileId==='11010000').parameterUses[0];
 assert.deepEqual(condition.allowedTypes,['Bool','Trigger']);assert.equal(condition.unowned,true);
 assert.equal(condition.property,'/m_Conditions/0/m_ConditionEvent');
 assert.ok(controller.objects.find(o=>o.fileId==='11020000').references.some(r=>r.property==='/m_Motion'&&r.role==='animator-owner'));
 assert.equal(controller.objects.find(o=>o.fileId==='11020000').parameterUses.length,0);
 const tree=parse(await readFile(new URL('Shared.asset',fixtureRoot),'utf8'));
 assert.equal(tree.objects[0].references[0].fileId,'9223372036854775807');
 assert.equal(tree.objects[0].references.length,2);assert.deepEqual(tree.objects[0].parameterUses[0].allowedTypes,['Float']);
 const clip=parse(await readFile(new URL('Clip.anim',fixtureRoot),'utf8'));
 assert.equal(clip.objects[0].fileId,'9223372036854775807');
 const meta=parse(await readFile(new URL('Demo.controller.meta',fixtureRoot),'utf8'),'Assets/Demo.controller.meta');
 assert.equal(meta.coverage,'meta-only');assert.equal(meta.meta.guid,'a'.repeat(32));assert.equal(meta.meta.folderAsset,false);

 const flowText=wrap('MonoBehaviour:\n  empty: [ ]\n  mapping: { }\n  quote: "literal &x *y !z"\n  scalar: 1e20\n  "m/Ref~name": {fileID: -9223372036854775808,\n    guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 2}\n');
 const flow=parse(flowText);assert.equal(flow.coverage,'serialized');const object=flow.objects[0];
 assert.deepEqual(object.properties.empty,[]);assert.equal(Object.keys(object.properties.mapping).length,0);
 assert.equal(object.properties.scalar,'1e20');assert.equal(object.references[0].property,'/m~1Ref~0name');
 assert.equal(flowText.slice(object.references[0].source.start,object.references[0].source.end).startsWith('{fileID:'),true);
 assert.ok(object.references[0].source.line>1&&object.references[0].source.column>0);
 const block=parse(wrap('MonoBehaviour:\n  m_Ref:\n    type: 2\n    guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n    fileID: 123\n'));
 assert.equal(block.objects[0].references[0].fileId,'123');
 const quotedItem=parse(wrap('MonoBehaviour:\n  values:\n  - "entry": 1\n    next: 2\n'));
 assert.equal(quotedItem.objects[0].properties.values[0].entry,'1');assert.equal(quotedItem.coverage,'serialized');
 const noId=parse(wrap('MonoBehaviour:\n  ref: {guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 2}\n'));
 assert.equal(noId.coverage,'partial');assert.equal(noId.objects[0].references.length,0);

 const duplicate=parse(wrap('MonoBehaviour:\n  x: 1\n  x: 2\n  ref: {fileID: 99}\n'));
 assert.equal(duplicate.coverage,'partial');assert.equal(duplicate.objects[0].references.length,0);
 assert.ok(duplicate.issues.some(i=>i.code==='YAML_DUPLICATE_KEY'&&i.relatedSources?.length===1));
 assert.ok(duplicate.objects[0].rawText.includes('x: 1')&&duplicate.objects[0].rawText.includes('x: 2'));
 const duplicateId=parse(wrap('MonoBehaviour:\n  x: 1\n')+'--- !u!114 &1\nMonoBehaviour:\n  x: 2\n');
 assert.equal(duplicateId.objects.length,2);assert.equal(duplicateId.coverage,'partial');
 assert.ok(duplicateId.issues.some(i=>i.code==='DUPLICATE_DOCUMENT_FILE_ID'));
 for(const body of ['MonoBehaviour:\n  ref: &x {fileID: 99}\n','MonoBehaviour:\n  ref: *x\n','MonoBehaviour:\n  <<: {x: 1}\n','MonoBehaviour:\n  text: |\n    data\n','MonoBehaviour:\n  ? key: value\n','MonoBehaviour:\n  *key: value\n']){
  const r=parse(wrap(body));assert.equal(r.coverage,'partial');assert.equal(r.objects[0].references.length,0);assert.ok(r.issues.length);
 }
 assert.equal(parse('%YAML 9.9\n--- !u!114 &1\nMonoBehaviour:\n  ref: {fileID: 99}\n').objects[0].references.length,0);
 const invalidMeta=parse('fileFormatVersion: 2\nguid: '+ 'a'.repeat(32)+'\nguid: '+ 'b'.repeat(32)+'\n','Assets/Test.asset.meta');
 assert.equal(invalidMeta.meta,undefined);assert.equal(invalidMeta.coverage,'partial');
 assert.equal(parse(wrap('MonoBehaviour:\n  x: 1\n','9223372036854775808')).objects.length,0);
 const badHeader=parse('--- !u!114 &invalid\nMonoBehaviour:\n  x: 1\n');
 assert.ok(badHeader.unparsedDocuments[0].rawText.includes('&invalid'));
 assert.equal(parse('arbitrary binary-ish text').coverage,'opaque');

 const expression=wrap('MonoBehaviour:\n  m_Script: {fileID: -1506855854, guid: 67cc4cb7839cd3741b63733d5adf0442, type: 3}\n  parameters:\n  - name: Toggle\n    valueType: 2\n    saved: 1\n    defaultValue: 0\n    networkSynced: 1\n');
 const e=parse(expression).objects[0].parameters[0];assert.equal(e.domain,'vrchat-expression');assert.equal(e.type,'Bool');assert.ok(e.schemaIdentity);
 const unrelated=parse(expression.replace('67cc4cb7839cd3741b63733d5adf0442','11111111111111111111111111111111'));
 assert.equal(unrelated.objects[0].parameters.length,0);assert.ok(unrelated.issues.length);
 const malformedScript=parse(expression.replace('guid: 67cc4cb7839cd3741b63733d5adf0442','guid: []'));
 assert.equal(malformedScript.objects[0].parameters.length,0);assert.equal(malformedScript.coverage,'partial');
 const malformedMode=parse(wrap('AnimatorStateTransition:\n  m_Conditions:\n  - m_ConditionMode: {}\n    m_ConditionEvent: Enabled\n','4','1101'));
 assert.deepEqual(malformedMode.objects[0].parameterUses[0].allowedTypes,[]);
 const inheritedType=parse(wrap('AnimatorController:\n  m_AnimatorParameters:\n  - m_Name: Value\n    m_Type: toString\n','5','91'));
 assert.equal(inheritedType.objects[0].parameters[0].type,'Unknown');
 const state=parse(wrap('AnimatorState:\n  m_MirrorParameterActive: 1\n  m_MirrorParameter: Reflect\n','2','1102'));
 assert.deepEqual(state.objects[0].parameterUses[0].allowedTypes,[]);assert.ok(state.issues.length);
 const conditions=parse(wrap('AnimatorStateTransition:\n  m_Conditions:\n  - m_ConditionMode: 2\n    m_ConditionEvent: Enabled\n  - m_ConditionMode: 6\n    m_ConditionEvent: Index\n','3','1101'));
 assert.deepEqual(conditions.objects[0].parameterUses.map(u=>u.allowedTypes),[['Bool'],['Int']]);
 const crlf=parse(wrap('MonoBehaviour:\n  ref: {fileID: 1}\n').replaceAll('\n','\r\n'));
 assert.equal(crlf.objects[0].references[0].source.line,5);
 assert.throws(()=>parse('x'.repeat(TEXT_LIMITS.maxTextBytes+1)),/TEXT_.*LIMIT/);
 assert.throws(()=>parse(wrap('MonoBehaviour:\n  x: '+ '['.repeat(70)+'0'+']'.repeat(70)+'\n')),/YAML_DEPTH_LIMIT/);
 return {status:'PASS',controllerObjects:controller.objects.length,fixtureFileId:clip.objects[0].fileId};
}

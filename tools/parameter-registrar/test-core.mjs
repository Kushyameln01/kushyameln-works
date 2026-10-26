import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {writeUnityPackage,readUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {scanUnityPackage,selectUnityPackage} from '../../docs/animator-composer/lib/package-selection.mjs';
import {splitUnityDocuments,extractAnimatorParameters,extractReferences,parseUnityScalar} from '../../docs/shared/ft/unity-text.mjs';
import {parseExpression} from '../../docs/animator-composer/lib/registration.mjs';
import {indexPackages,analyzeComposition} from '../../docs/animator-composer/lib/composition.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
import {gzipSync,gunzipSync} from '../../docs/shared/ft/vendor/fflate.mjs';
import {generateTemplate} from '../../docs/parameter-template/api.mjs';
import {PREAMBLE,tree,curve,binding,clip,declaration,asset} from './fixture-core.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
let core;try{core=await import('../../docs/shared/parameter-registrar/core.mjs');}catch{}
assert(core,'Parameter registrar core is missing');
const {readMotionDocuments,collectMotionParameters,collectParameters,generateParameterAssets}=core;
const kernel=await instantiateFtKernel(await readFile(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url)));
const hash=n=>kernel.animatorHash(n),params=names=>[...names].sort().map(name=>({name,type:'Float'}));
const documents=text=>[{classId:/!u!(\d+)/.exec(text)[1],fileId:'7400000',guid:'a'.repeat(32),path:'Assets/Test.asset',text}];
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
await test('unsupported name scalar syntax and numeric continuations never become registrations',()=>{
 const syntax=['|-\n    Actual Axis','Actual\n    Axis','Actual\n  Axis','[Actual, Axis]','{name: Actual}','&anchor Actual','*alias','!tag Actual','? Actual','- Actual','Actual: Axis'];
 for(const value of syntax){
  assert.throws(()=>collectMotionParameters(documents(tree(0,value)),kernel),/scalar|syntax|continuation|indent|sequence/i,value);
  assert.throws(()=>collectMotionParameters(documents(tree(4,'X','Y',value.replaceAll('\n    ','\n      '))),kernel),/scalar|syntax|continuation|indent|sequence/i,value);
  const c=clip(curve('Actual').replace('attribute: "Actual"','attribute: '+value.replaceAll('\n    ','\n      ')),binding(hash(value.split('\n')[0])));
  assert.throws(()=>collectMotionParameters(documents(c),kernel),/scalar|syntax|continuation|indent|sequence/i,value);
 }
 assert.deepEqual(collectMotionParameters(documents(tree(0,'Actual # note: status')),kernel),params(['Actual']));
 for(const literal of ['|-','[Actual, Axis]','&anchor Actual','Actual: Axis','? Actual']){
  assert.deepEqual(collectMotionParameters(documents(tree(0,JSON.stringify(literal))),kernel),params([literal]));
  assert.deepEqual(collectMotionParameters(documents(clip(curve(literal),binding(hash(literal)))),kernel),params([literal]));
 }
 assert.throws(()=>collectMotionParameters(documents(tree().replace('m_BlendType: 0','m_BlendType: 0\n    1')),kernel),/scalar|continuation|sequence|indent/i);
 assert.throws(()=>collectMotionParameters(documents(clip(curve('Actual'),binding(hash('Actual')).replace('typeID: 95','typeID: 95\n        0'))),kernel),/scalar|continuation|sequence|indent/i);
});
await test('sequence bodies reject hidden or malformed entries instead of silently dropping curves',()=>{
 const c=curve('AAP'),b=binding(hash('AAP'));
 const malformed=[
  clip().replace('  m_FloatCurves: []','  m_FloatCurves: []\n'+c.replace(/^  - /,'   - ')),
  clip(c,b).replace(/^  - curve:/m,'   - curve:'),
  clip().replace('  m_FloatCurves: []','  m_FloatCurves: []\n    attribute: AAP'),
  clip(c,b).replace('    attribute: "AAP"','   attribute: "AAP"'),
  clip(c,b).replace('    genericBindings:','    genericBindings: []'),
  tree().replace('  m_Childs:','  m_Childs: []'),
  tree().replace('  - serializedVersion:','    - serializedVersion:')
 ];
 for(const text of malformed)assert.throws(()=>collectMotionParameters(documents(text),kernel),/sequence|indent|empty|malformed|incomplete/i);
 const commented=clip(c,b).replace('  m_FloatCurves:','  m_FloatCurves: # runtime\n  # comment');
 assert.deepEqual(collectMotionParameters(documents(commented),kernel),params(['AAP']));
});
await test('all actual target objects regardless extension, enclosing declarations or external links',async()=>{
 const assets=[asset(1,'Assets/Hidden.controller',PREAMBLE+declaration()+tree()),
 asset(2,'Assets/Orphan.unrelated',PREAMBLE+clip(curve('ClipOnly'),binding(hash('ClipOnly')))),
 asset(3,'Assets/Image.png',new Uint8Array([137,80,78,71,0,255]))];
 assets[2].meta=assets[2].meta.replace('NativeFormatImporter:','TextureImporter:');
 const bytes=writeUnityPackage(assets),before=bytes.slice(),read=readMotionDocuments(bytes);
 assert.equal(read.clipCount,1);assert.equal(read.blendTreeCount,1);
 assert.deepEqual(read.documents.map(d=>d.classId).sort(),['206','74']);
 assert(!read.documents.some(d=>d.text.includes('NeverRead')));
 assert.equal(read.documents[1].fileId,'7400000');
 assert.deepEqual(await collectParameters(bytes,{kernel}),{version:1,parameters:params(['Axis','ClipOnly']),clipCount:1,blendTreeCount:1});
 assets[0].asset=new TextEncoder().encode(PREAMBLE+declaration('ChangedBool')+tree());
 assert.deepEqual((await collectParameters(writeUnityPackage(assets),{kernel})).parameters,params(['Axis','ClipOnly']));
 assert.deepEqual(bytes,before);
 const scan=scanUnityPackage(bytes);assert.equal(scan.assets.length,3);
 assert.throws(()=>selectUnityPackage(bytes,[assets[1].guid]),/not selectable/);
 assert.equal(selectUnityPackage(bytes,[assets[1].guid],{allowAnyAsset:true}).assets.length,1);
});
await test('unrelated Markdown and ordinary YAML separators are ignored',()=>{
 const markdown=asset(1,'Assets/README.txt','# Notes\n---\nNothing to register.\n');markdown.meta=markdown.meta.replace('NativeFormatImporter:','DefaultImporter:');
 const yaml=asset(2,'Assets/ordinary.yaml','---\nname: Resource\n');yaml.meta=yaml.meta.replace('NativeFormatImporter:','DefaultImporter:');
 assert.deepEqual(readMotionDocuments(writeUnityPackage([markdown,yaml])),{documents:[],clipCount:0,blendTreeCount:0});
});
await test('packages expanded beyond 128 MiB keep every target',()=>{
 const tarParts=[];
 for(let i=1;i<=2;i++){
  const resource=asset(i,`Assets/Large${i}.png`,new Uint8Array(65*1024*1024));resource.meta=resource.meta.replace('NativeFormatImporter:','TextureImporter:');
  const tar=gunzipSync(writeUnityPackage([resource]));tarParts.push(tar.subarray(0,tar.length-1024));
 }
 tarParts.push(gunzipSync(writeUnityPackage([asset(3,'Assets/Target.noextension',PREAMBLE+tree())])));
 const tar=new Uint8Array(tarParts.reduce((n,a)=>n+a.length,0));let offset=0;for(const part of tarParts){tar.set(part,offset);offset+=part.length;}
 const bytes=gzipSync(tar,{level:1,mtime:0});assert(tar.length>128*1024*1024);
 assert.deepEqual(collectParameters(bytes,{kernel}),{version:1,parameters:params(['Axis']),clipCount:0,blendTreeCount:1});
});
await test('BlendTree reads active one/two axes or Direct weights only',()=>{
 assert.deepEqual(collectMotionParameters(documents(tree(0)),kernel),params(['Axis']));
 for(const t of [1,2,3])assert.deepEqual(collectMotionParameters(documents(tree(t)),kernel),params(['Axis','UnusedY']));
 assert.deepEqual(collectMotionParameters(documents(tree(4)),kernel),params(['UnusedDirect']));
 assert.throws(()=>collectMotionParameters(documents(tree(5)),kernel),/BlendTree/);
 assert.throws(()=>collectMotionParameters(documents(tree(0,'')),kernel),/Parameter|name/);
});
await test('Clip matches runtime AAP hashes exactly and excludes editor, transforms and special Animator curves',()=>{
 const float=curve('AAP')+curve('Muscle')+curve('blendShape.Test',{classId:137,path:'Face'})+curve('m_LocalPosition.x',{classId:4,path:'Bone'});
 const bindings=binding(hash('AAP'))+binding(hash('Muscle'),{customType:8})+binding(hash('blendShape.Test'),{typeId:137,path:123})+binding(1,{typeId:4,path:42});
 assert.deepEqual(collectMotionParameters(documents(clip(float,bindings,{editor:curve('EditorOnly')})),kernel),params(['AAP']));
 assert.throws(()=>collectMotionParameters(documents(clip(curve('Missing'),'')),kernel),/binding/);
 assert.throws(()=>collectMotionParameters(documents(clip('',binding(hash('Missing')))),kernel),/binding/);
 assert.throws(()=>collectMotionParameters(documents(clip(curve('Wrong'),binding(hash('Other')))),kernel),/binding/);
 assert.throws(()=>collectMotionParameters(documents(clip(curve('Duplicate')+curve('Duplicate'),binding(hash('Duplicate')))),kernel),/binding|ambiguous|duplicate/i);
 const collide={animatorHash:()=>123};assert.throws(()=>collectMotionParameters(documents(clip(curve('A')+curve('B'),binding(123)+binding(123))),collide),/binding|ambiguous|collision/i);
 assert.throws(()=>collectMotionParameters(documents(clip(curve('AAP'),binding(hash('AAP')))),{}),/kernel|animatorHash/);
});
await test('special Clips require complete correspondence and reject indexed or unmatched runtime layouts',()=>{
 const indexed=clip(curve('Spine Front-Back')+curve('RootT.x'),binding(0,{customType:8})+binding(1,{customType:8}));
 assert.throws(()=>collectMotionParameters(documents(indexed),kernel),/binding/);
 const unmatched=clip(curve('RootT.x')+curve('UnmatchedAAP'),binding(0,{customType:8}));
 assert.throws(()=>collectMotionParameters(documents(unmatched),kernel),/binding/);
 const exact=clip(curve('Special'),binding(hash('Special'),{customType:8}));
 assert.deepEqual(collectMotionParameters(documents(exact),kernel),[]);
 const mixed=clip(curve('AAP')+curve('Spine Front-Back'),binding(hash('AAP'))+binding(0,{customType:8}));
 assert.throws(()=>collectMotionParameters(documents(mixed),kernel),/binding/);
});
await test('unsupported integer/reference/compressed and incomplete internal targets reject with identity',()=>{
 for(const flags of [{int:1},{pptr:1},{reference:1}])assert.throws(()=>collectMotionParameters(documents(clip(curve('AAP'),binding(hash('AAP'),flags))),kernel),/Test.asset.*(unsupported|Unsupported|integer|reference|binding)/);
 assert.throws(()=>collectMotionParameters(documents(clip('','',{compressed:1})),kernel),/compressed|Compressed/);
 const binary=asset(1,'Assets/Binary.anim',new Uint8Array([0,1,255]),'7400000');
 assert.throws(()=>readMotionDocuments(writeUnityPackage([binary])),/Binary.anim/);
 const malformed=asset(1,'Assets/Bad.txt',PREAMBLE+'--- !u!74 &9007199254740993\nAnimationClip:\n  m_Compressed: 0\n');
 assert.throws(()=>collectParameters(writeUnityPackage([malformed]),{kernel}),/Bad.txt|missing|Missing/);
 const bigId=asset(1,'Assets/BigId.any',PREAMBLE+tree(0,'Axis','Y','D','9007199254740993'));
 assert.equal(readMotionDocuments(writeUnityPackage([bigId])).documents[0].fileId,'9007199254740993');
});
await test('missing integer flags, stripped targets and malformed target preambles fail explicitly',()=>{
 const missingFlag=clip(curve('AAP'),binding(hash('AAP'))).replace('      isIntCurve: 0\n','');
 assert.throws(()=>collectMotionParameters(documents(missingFlag),kernel),/isIntCurve|binding/);
 const stripped=PREAMBLE+tree().replace('&20600000\n','&20600000 stripped\n');
 assert.throws(()=>collectParameters(writeUnityPackage([asset(1,'Assets/Stripped.asset',stripped)]),{kernel}),/stripped|Stripped/);
 assert.throws(()=>readMotionDocuments(writeUnityPackage([asset(1,'Assets/BadPreamble.any','garbage\n'+tree())])),/preamble|Preamble/);
});
await test('generated package is only new minimal Controller, Expression and folder with editable generation settings',async()=>{
 const p=params(['A / \'quoted\'','日本語']),before=structuredClone(p);
 const out=await generateParameterAssets(p,{name:'Custom',defaultValue:0.25,saved:true,networkSynced:true});
 assert.equal(out.fileName,'Custom.unitypackage');assert.equal(out.parameterCount,2);assert.equal(out.bitCost,16);
 assert.deepEqual(Object.keys(out).sort(),['archive','bitCost','fileName','parameterCount']);
 const entries=[...readUnityPackage(out.archive).values()];assert.equal(entries.length,3);assert.equal(entries.filter(a=>a.asset===null).length,1);
 assert(entries.every(a=>!a.path.includes('report')));
 const controller=entries.find(a=>a.path.endsWith('.controller')),expression=entries.find(a=>a.path.endsWith('.asset'));
 const ct=new TextDecoder().decode(controller.asset),et=new TextDecoder().decode(expression.asset);
 const docs=splitUnityDocuments(ct).documents;assert.deepEqual(docs.map(d=>d.classId).sort(),['1107','91']);
 assert.match(docs.find(d=>d.classId==='1107').text,/^  m_ObjectHideFlags: 1$/m);
 assert.match(docs.find(d=>d.classId==='91').text,/^  m_ObjectHideFlags: 0$/m);
 assert.match(ct,/m_ChildStates: \[\]/);assert.match(ct,/m_DefaultState: \{fileID: 0\}/);
 assert.deepEqual(extractAnimatorParameters(ct).map(p=>({name:p.name,type:p.fields.m_Type,value:p.fields.m_DefaultFloat})),p.map(p=>({name:p.name,type:'1',value:'0.25'})));
 assert.deepEqual(parseExpression(et),p.map(p=>({...p,defaultValue:0.25,saved:true,networkSynced:true})));
 const ids=new Set(docs.map(d=>d.fileId));for(const r of extractReferences(ct))if(r.fileId!=='0'&&!r.guid)assert(ids.has(r.fileId));
 assert.deepEqual(p,before);assert.equal((await collectParameters(out.archive,{kernel})).parameters.length,0);
 const index=indexPackages([{hash:'a'.repeat(64),name:'Generated',assets:entries}]);assert.equal(index.catalog.controllers.length,1);assert.equal(index.catalog.motions.length,0);
 const id=index.catalog.controllers[0].id;
 const analysis=analyzeComposition(index,{schemaVersion:1,inputHashes:['a'.repeat(64)],outputs:[{id:'fx',name:'FX',playable:'FX',base:{id:'base',controllerId:id,layers:[0]},additions:[]}],assetChoices:{},externalReferences:[]},kernel);
 assert.deepEqual(analysis.issues.filter(i=>i.severity==='error'),[]);
});
await test('defaults are generated settings and invalid types, defaults, built-ins and budgets reject',async()=>{
 await assert.rejects(()=>generateParameterAssets([],{saved:1}),/saved|true/);
 await assert.rejects(()=>generateParameterAssets([],{defaultValue:2}),/Float|範囲/);
 const out=await generateParameterAssets(params(['A']));
 const expr=[...readUnityPackage(out.archive).values()].find(a=>a.path.endsWith('.asset'));
 assert.deepEqual(parseExpression(new TextDecoder().decode(expr.asset)),[{name:'A',type:'Float',defaultValue:0,saved:false,networkSynced:false}]);
 for(const [p,s,re] of [[[ {name:'A',type:'Bool'}],{},/Float|type|型/],[params(['A']),{defaultValue:2},/Float|範囲/],[params(['A']),{saved:1},/saved|true/],[params(['VelocityX']),{},/組込み|built/],[params(Array.from({length:33},(_,i)=>'P'+i)),{networkSynced:true},/256|同期/],[params(['A']),{name:'../bad'},/name|名前|path/],[params(['A']),{name:'日本語'},/name|名前|path/]])await assert.rejects(()=>generateParameterAssets(p,s),re);
});
await test('Template public API -> collection -> new package -> independent source-set readback',async()=>{
 const previousFetch=globalThis.fetch;let generated;
 try{globalThis.fetch=async url=>new Response(await readFile(url));generated=await generateTemplate('v2/Test');}finally{globalThis.fetch=previousFetch;}
 const collected=await collectParameters(generated.bytes,{kernel}),expected=new Set();let sourceTrees=0,sourceClips=0;
 const value=(text,name,indent=2)=>parseUnityScalar(new RegExp(`^${' '.repeat(indent)}${name}:([^\r\n]*)`,'m').exec(text)?.[1]??'');
 for(const entry of readUnityPackage(generated.bytes).values())if(entry.asset)for(const document of splitUnityDocuments(new TextDecoder().decode(entry.asset)).documents){
  if(document.classId==='206'){
   sourceTrees++;const type=Number(value(document.text,'m_BlendType'));
   if(type===4)for(const match of document.text.matchAll(/^    m_DirectBlendParameter:([^\r\n]*)/gm)){const name=parseUnityScalar(match[1]);if(name)expected.add(name);}
   else{const x=value(document.text,'m_BlendParameter'),y=value(document.text,'m_BlendParameterY');if(x)expected.add(x);if(type!==0&&y)expected.add(y);}
  }else if(document.classId==='74'){
   sourceClips++;const bindings=document.text.match(/^  m_ClipBindingConstant:[\s\S]*?(?=^  [A-Za-z_]|$(?![\s\S]))/m)?.[0]??'',activeHashes=new Set((bindings.match(/^    - [\s\S]*?(?=^    - |^    [A-Za-z_]|$(?![\s\S]))/gm)??[]).filter(b=>value(b,'typeID',6)==='95'&&value(b,'path',6)==='0'&&value(b,'customType',6)==='0').map(b=>Number(value(b,'attribute',6))>>>0));
   const curves=document.text.match(/^  m_FloatCurves:[\s\S]*?(?=^  [A-Za-z_]|$(?![\s\S]))/m)?.[0]??'';
   for(const curve of curves.match(/^  - [\s\S]*?(?=^  - |$(?![\s\S]))/gm)??[]){const name=value(curve,'attribute',4);if(value(curve,'classID',4)==='95'&&value(curve,'path',4)===''&&activeHashes.has(hash(name)>>>0))expected.add(name);}
  }
 }
 assert.equal(collected.clipCount,sourceClips);assert.equal(collected.blendTreeCount,sourceTrees);assert.equal(generated.treeCount,sourceTrees);assert.equal(generated.clipCount,sourceClips);assert.deepEqual(collected.parameters,params([...expected]));
 const out=await generateParameterAssets(collected.parameters),expr=[...readUnityPackage(out.archive).values()].find(a=>a.path.endsWith('.asset'));
 assert.deepEqual(parseExpression(new TextDecoder().decode(expr.asset)).map(p=>p.name),[...expected].sort());
});
console.log(`PASS ${passed} core groups; Unity Editor import/runtime not exercised.`);

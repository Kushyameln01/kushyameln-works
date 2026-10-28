import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
const root=new URL('../../',import.meta.url);
const template=JSON.parse(await readFile(new URL('docs/viseme-template/template.json',root),'utf8'));
const kernel=await instantiateFtKernel(await readFile(new URL('docs/shared/ft/kernel/ft-kernel.wasm',root)));
const core=await import('../../docs/viseme-template/core.mjs').catch(()=>({}));
const decoder=new TextDecoder();

test('generation preserves Controller and omits AvatarMask and stores only shared Clips externally',()=>{
  assert.equal(typeof core.generatePackage,'function','Viseme generator must be available');
  const result=core.generatePackage('Body',{template,kernel});
  const entries=[...readUnityPackage(result.bytes).values()];
  assert.equal(entries.length,19);
  assert.equal(entries.filter(e=>e.path.endsWith('.controller')).length,1);
  assert.equal(entries.filter(e=>e.path.endsWith('.asset')).length,15);
  assert.ok(entries.every(e=>!e.path.includes('/Animation')));
  const sourceController=template.entries.find(e=>e.path.endsWith('.controller'));
  let expected=sourceController.text.replace(/^--- !u!319 &-?\d+\n[\s\S]*?(?=^--- !u!|$(?![\s\S]))/m,'');
  for(const m of result.mapping.assets)expected=expected.replaceAll(m.sourceGuid,m.guid);
  assert.equal(decoder.decode(entries.find(e=>e.path===sourceController.path).asset),expected);
  assert.equal(result.treeCount,15);assert.equal(result.clipCount,16);assert.equal(result.embeddedClipCount,15);assert.equal(result.externalClipCount,1);
  const refs=[];let clipCount=0;
  for(const entry of entries.filter(e=>e.path.endsWith('.asset'))){
    const text=decoder.decode(entry.asset);
    clipCount+=[...text.matchAll(/^--- !u!74 /gm)].length;
    refs.push(...[...text.matchAll(/m_Motion: \{fileID: (-?\d+)(?:, guid: ([a-f0-9]+), type: 2)?\}/g)].map(m=>(m[2]??entry.guid)+':'+m[1]));
  }
  assert.equal(clipCount,15);
  assert.ok(!entries.some(e=>e.asset&&decoder.decode(e.asset).includes('--- !u!319')));
  assert.equal(entries.filter(e=>e.path.endsWith('.anim')).map(e=>e.path).join(),'Assets/Viseme/Viseme_none.anim');assert.equal(refs.length,30);assert.equal(new Set(refs).size,16);
});
test('two runs have unique new GUIDs and do not change the Template',()=>{
  assert.equal(typeof core.generatePackage,'function');
  const before=JSON.stringify(template),old=new Set(template.entries.map(e=>e.guid));
  const a=readUnityPackage(core.generatePackage('Body',{template,kernel}).bytes);
  const b=readUnityPackage(core.generatePackage('Body',{template,kernel}).bytes);
  for(const g of a.keys()){assert.ok(!old.has(g));assert.ok(!b.has(g));}
  assert.equal(JSON.stringify(template),before);
});
test('runtime, Editor and genericBinding mesh paths change together',async()=>{
  assert.equal(typeof core.generatePackage,'function');
  for(const mesh of ['Body','Face','顔/メッシュ "A" #1',' Face ','Face:Mesh','😀']){
    const result=core.generatePackage(mesh,{template,kernel});
    const entries=readUnityPackage(result.bytes);
    for(const c of result.mapping.clips){
      const source=template.entries.find(e=>e.guid===c.sourceGuid).text;
      const text=decoder.decode(entries.get(c.guid).asset);
      const doc=text.split(/(?=^--- !u!)/m).find(d=>d.startsWith('--- !u!74 &'+c.fileId+'\n'));
      const paths=[...doc.matchAll(/^    path: (.*)$/gm)].map(m=>m[1].startsWith('"')?JSON.parse(m[1]):m[1]);
      assert.equal(paths.length,30);assert.ok(paths.every(p=>p===mesh));
      const bindings=[...doc.matchAll(/^      path: (\d+)$/gm)].map(m=>Number(m[1]));
      assert.equal(bindings.length,15);assert.ok(bindings.every(h=>h===kernel.animatorHash(mesh)));
      const normalize=s=>s.replace(/^%YAML.*\n%TAG.*\n/m,'').replace(/^--- !u!74 &-?\d+/m,'--- !u!74 &ID').replace(/^    path: .*$/gm,'    path: PATH').replace(/^      path: \d+$/gm,'      path: HASH');
      assert.equal(normalize(doc),normalize(source));
    }
    if(mesh==='Body'||mesh==='顔/メッシュ "A" #1'){
      const dir=new URL('development/viseme-template/evidence/',root);await mkdir(dir,{recursive:true});
      await writeFile(new URL(mesh==='Body'?'node-body.unitypackage':'node-unicode.unitypackage',dir),result.bytes);
    }
  }
});
test('mesh validation rejects empty, control characters and invalid relative paths without silently trimming',()=>{
  assert.equal(typeof core.validateMeshName,'function');
  for(const name of ['', '  ',null,12,'a\nb','a\0b','a\\b','/Body','Body/','A//B','A/../B','\ud800'])assert.throws(()=>core.validateMeshName(name));
  for(const name of ['Body','顔','Face/Body',' Face '])assert.equal(core.validateMeshName(name),name);
});
test('broken templates and wrong kernels fail instead of shipping unresolved references',()=>{
  assert.equal(typeof core.generatePackage,'function');
  const bad=structuredClone(template);bad.entries=bad.entries.filter(e=>!e.path.endsWith('Viseme_none.anim'));
  assert.throws(()=>core.generatePackage('Body',{template:bad,kernel}));
  assert.throws(()=>core.generatePackage('Body',{template,kernel:{animatorHash:()=>0}}));
});

import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readUnityPackage} from '../../docs/shared/ft/unity-package.mjs';

// Breaks caught: missing conversion, stale binding hash, embedded child Trees,
// dangling child references, unsafe output paths and reused output identities.
let core;
try { core=await import('../../docs/parameter-template/core.mjs'); } catch(e) {
  if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;
}
assert.equal(typeof core?.generatePackage,'function','Template generation is not implemented');
const template=JSON.parse(await readFile(new URL('../../docs/parameter-template/template.json',import.meta.url),'utf8'));
const frozen=JSON.stringify(template);
for(const bad of ['', 'EyeLidLeft','v2/','v2/../X','v2/X/Y','v2/X\\Y','v2/X:Z','v2/<img>','v2/CON','v2/Parameter','v2/'+ 'X'.repeat(121)]){
  assert.throws(()=>core.generatePackage(bad,{template}),undefined,`reject ${bad}`);
}
assert.equal(core.validateTarget('v2/EyeLidLeft'),'EyeLidLeft');
assert.throws(()=>core.generatePackage('v2/'+'あ'.repeat(120),{template}),/長すぎます/);
let firstGuids;
for(const target of ['v2/EyeLidLeft','v2/JawOpen','v2/EyeLidLeft','v2/ParameterTest','v2/0Eye','v2/Eye-Lid','v2/まぶた']){
  const result=core.generatePackage(target,{template});
  const leaf=target.slice(3), entries=[...readUnityPackage(result.bytes).values()];
  assert.equal(result.folderName,leaf);assert.equal(result.fileName,leaf+'.unitypackage');
  assert.equal(result.treeCount,16);assert.equal(result.clipCount,30);
  assert.equal(entries.length,17); // one folder plus sixteen Tree assets
  const guids=new Set(entries.map(e=>e.guid));assert.equal(guids.size,17);
  for(const e of [...template.trees,...template.clips])assert(!guids.has(e.guid),'new assets need new GUIDs');
  if(firstGuids)for(const g of guids)assert(!firstGuids.has(g),'regeneration must allocate fresh GUIDs');
  firstGuids=guids;
  let local=0,external=0,clipCount=0;
  for(const e of entries){
    assert(e.path.startsWith('Assets/'+leaf));
    if(e.asset===null){assert.equal(e.path,'Assets/'+leaf);continue;}
    const text=new TextDecoder().decode(e.asset);
    assert(!/^\s+(?:m_BlendParameterY?|m_DirectBlendParameter|attribute): v2\/Parameter(?:0|1|2|4|8|Negative)?$/m.test(text));
    assert.equal([...text.matchAll(/^--- !u!206 /gm)].length,1,'each file has only one Tree');
    const docs=[...text.matchAll(/^--- !u!(\d+) &(-?\d+)\n([\s\S]*?)(?=^--- !u!|$(?![\s\S]))/gm)];
    const ids=new Map(docs.map(d=>[d[2],d[1]]));assert.equal(ids.size,docs.length);
    clipCount+=docs.filter(d=>d[1]==='74').length;
    const name=/^  m_Name: (.+)$/m.exec(text)[1];
    assert.equal(e.path,'Assets/'+leaf+'/'+name+'.asset');assert(name.includes(leaf));
    for(const d of docs){
      const display=/^  m_Name: (.+)$/m.exec(d[3])[1];
      assert(display.includes(leaf));assert(!/[0-9a-f]{32}/.test(display));
    }
    assert.match(e.meta,/mainObjectFileID: 20600000/);
    for(const m of text.matchAll(/^    m_Motion: \{fileID: (-?\d+)(?:, guid: ([0-9a-f]{32}), type: 2)?\}$/gm)){
      if(m[2]){assert(guids.has(m[2]));assert.equal(m[1],'20600000');external++;}
      else{assert.equal(ids.get(m[1]),'74');local++;}
    }
    if(name.endsWith('Binary_Decode0'))assert(text.includes('value: 0.0325'));
    if(name.endsWith('Binary_Root'))assert.equal([...text.matchAll(/m_Motion:/g)].length,5);
  }
  assert.equal(local,34);assert.equal(external,13);assert.equal(clipCount,30);
  assert.equal(JSON.stringify(template),frozen,'generation may not mutate the template');
  if(process.env.DECODE_TEST_OUTPUT){
    await mkdir(process.env.DECODE_TEST_OUTPUT,{recursive:true});
    await writeFile(process.env.DECODE_TEST_OUTPUT+'/'+leaf+'.unitypackage',result.bytes);
  }
}
console.log('PASS: 7 generations, 16 independent Trees, 30 embedded Clips, 47 resolved Motion references; invalid paths and source preservation');

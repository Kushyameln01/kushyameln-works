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
// Pin the requested Template revision independently of the generated output.
// A prefix replacement would incorrectly alter bit suffixes or _Function;
// two sequential replacements would also turn the new v2 value into Decode.
const byName=items=>new Map(items.map(item=>[/^  m_Name: (.+)$/m.exec(item.text)[1],item.text]));
const sourceTrees=byName(template.trees),sourceClips=byName(template.clips);
for(const [name,parameter] of [
  ['Parameter_Smooth','Decode/Parameter'],
  ['v2Parameter_Smooth','Decode/Parameter'],
  ['Simple_Root','Decode/Parameter'],
  ['Self_Parameter_Smooth','v2/Parameter'],
  ['Self_F_Parameter_Smooth','Smooth/Parameter_Function'],
  ['F_Parameter_Smooth','Function/Parameter'],
  ['FunctionParameter_Smooth','Function/Parameter'],
  ...['0','1','2','4','8','Negative'].map(suffix=>['Binary_Decode'+suffix,'v2/Parameter'+suffix]),
]){
  assert.equal(/^  m_BlendParameter: (.+)$/m.exec(sourceTrees.get(name))[1],parameter,`Template parameter: ${name}`);
}
for(const [stem,parameter,hash] of [
  ['Answer','Decode/Parameter','1151114644'],
  ['Smooth','v2/Parameter','815615974'],
  ['Another','Smooth/Parameter_Function','996132519'],
]){
  for(const value of ['-1','0','+1']){
    const text=sourceClips.get(stem+'='+value);
    assert.deepEqual([...text.matchAll(/^    attribute: (.+)$/gm)].map(m=>m[1]),[parameter,parameter],`Template Clip attributes: ${stem}=${value}`);
    assert.deepEqual([...text.matchAll(/^      attribute: (\d+)$/gm)].map(m=>m[1]),[hash],`Template Clip CRC32: ${stem}=${value}`);
  }
}
assert.equal(core.BUILD_ID,'parameter-template-1.4.0');
assert.equal(template.templateRevision,2);
assert.equal(template.sourceSha256,'9b22ae3d088ceef597b9ac98015da917599842ab3f9932859c658ddd34c99c09');
assert.deepEqual(template.valueRemap,{'v2/Parameter':'Decode/Parameter','Smooth/Parameter':'v2/Parameter'});
assert.throws(()=>core.generatePackage('v2/EyeLidLeft',{template:{...template,templateRevision:1}}),/Template/);
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
  assert.equal(result.treeCount,16);assert.equal(result.clipCount,30);assert.equal(result.buildId,'parameter-template-1.4.0');
  assert.equal(entries.length,18); // two folders plus sixteen Tree assets
  const guids=new Set(entries.map(e=>e.guid));assert.equal(guids.size,18);
  for(const e of [...template.trees,...template.clips])assert(!guids.has(e.guid),'new assets need new GUIDs');
  if(firstGuids)for(const g of guids)assert(!firstGuids.has(g),'regeneration must allocate fresh GUIDs');
  firstGuids=guids;
  let local=0,external=0,clipCount=0,rootCount=0,childCount=0;
  const folders=new Set(),fieldValues=new Set();
  const expectedFields=new Set([...template.trees,...template.clips].flatMap(item=>[...item.text.matchAll(/^\s+(?:m_BlendParameterY?|m_DirectBlendParameter|attribute): ([^\r\n]+)$/gm)].map(m=>m[1].replaceAll('Parameter',leaf))));
  for(const e of entries){
    assert(e.path.startsWith('Assets/'+leaf));
    if(e.asset===null){folders.add(e.path);assert.match(e.meta,/folderAsset: yes/);continue;}
    const text=new TextDecoder().decode(e.asset);
    assert(!/^\s+(?:m_BlendParameterY?|m_DirectBlendParameter|attribute): v2\/Parameter(?:0|1|2|4|8|Negative)?$/m.test(text));
    assert.equal([...text.matchAll(/^--- !u!206 /gm)].length,1,'each file has only one Tree');
    const docs=[...text.matchAll(/^--- !u!(\d+) &(-?\d+)\n([\s\S]*?)(?=^--- !u!|$(?![\s\S]))/gm)];
    const ids=new Map(docs.map(d=>[d[2],d[1]]));assert.equal(ids.size,docs.length);
    clipCount+=docs.filter(d=>d[1]==='74').length;
    const name=/^  m_Name: (.+)$/m.exec(text)[1];
    const isRoot=name===leaf+'_Binary_Root'||name===leaf+'_Smooth_Root';
    assert.equal(e.path,'Assets/'+leaf+'/'+(isRoot?'':leaf+'_Child/')+name+'.asset');assert(name.includes(leaf));
    if(isRoot)rootCount++;else childCount++;
    for(const m of text.matchAll(/^\s+(?:m_BlendParameterY?|m_DirectBlendParameter|attribute): ([^\r\n]+)$/gm)){
      if(!/^\d+$/.test(m[1]))fieldValues.add(m[1]);
    }
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
    if(name.endsWith('Binary_Root'))assert.equal([...text.matchAll(/m_Motion:/g)].length,6);
  }
  assert.equal(local,34);assert.equal(external,14);assert.equal(clipCount,30);
  assert.equal(rootCount,2);assert.equal(childCount,14);
  assert.deepEqual(folders,new Set(['Assets/'+leaf,'Assets/'+leaf+'/'+leaf+'_Child']));
  assert.deepEqual(fieldValues,new Set([...expectedFields].filter(v=>!/^\d+$/.test(v))));
  for(const value of ['Decode/'+leaf,'v2/'+leaf,'Smooth/'+leaf+'_Function','Function/'+leaf,'Proxy/'+leaf+'/Output','Proxy/'+leaf+'/Cartesian',...['0','1','2','4','8','Negative'].map(suffix=>'v2/'+leaf+suffix)])assert(fieldValues.has(value),value);
  assert(!fieldValues.has('Smooth/'+leaf),'the former Smooth output is now the exact v2 name');
  assert.equal(JSON.stringify(template),frozen,'generation may not mutate the template');
  if(process.env.DECODE_TEST_OUTPUT){
    await mkdir(process.env.DECODE_TEST_OUTPUT,{recursive:true});
    await writeFile(process.env.DECODE_TEST_OUTPUT+'/'+leaf+'.unitypackage',result.bytes);
  }
}
console.log('PASS: 7 generations, Template revision 2 exact value remap and CRC32, preserved bit/_Function names, 16 independent Trees, 30 embedded Clips, 48 Motion references including Binary-to-Decode; invalid paths and source preservation');

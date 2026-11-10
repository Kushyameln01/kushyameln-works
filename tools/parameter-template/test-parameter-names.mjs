// External regression cases authored before the prefix repair.
// Do not execute in the static-only Codex session.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateTemplate,isTemplateResult,validateTarget} from '../../docs/parameter-template/api.mjs';
import {readUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {splitUnityDocuments} from '../../docs/shared/ft/unity-text.mjs';

const template=JSON.parse(await readFile(new URL('../../docs/parameter-template/template.json',import.meta.url),'utf8'));
const decoder=new TextDecoder(),encoder=new TextEncoder();
async function generated(target){
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify(template));
  try{return await generateTemplate(target);}finally{globalThis.fetch=previous;}
}
// Independent CRC calculation: never import the generator's replacement/hash helper.
function crc(value){
  let n=0xffffffff;
  for(const b of encoder.encode(value)){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}
  return String((n^0xffffffff)>>>0);
}
function inspect(result){
  const entries=[...readUnityPackage(result.bytes).values()];
  const documents=entries.filter(e=>e.asset!==null).flatMap(e=>splitUnityDocuments(decoder.decode(e.asset)).documents);
  const names=new Set();
  for(const d of documents){
    for(const m of d.text.matchAll(/^\s+(?:m_BlendParameter|m_BlendParameterY|m_DirectBlendParameter|attribute): ([^\r\n]+)$/gm)){
      if(!/^\d+$/.test(m[1]))names.add(m[1]);
    }
    if(d.classId==='74'){
      const curves=/^  m_FloatCurves:\n([\s\S]*?)(?=^  [A-Za-z_])/m.exec(d.text)?.[1]??'';
      const attributes=[...curves.matchAll(/^    attribute: (.+)$/gm)].map(m=>m[1]);
      const bindings=/^  m_ClipBindingConstant:\n([\s\S]*?)(?=^  [A-Za-z_])/m.exec(d.text)?.[1]??'';
      assert.deepEqual([...bindings.matchAll(/^      attribute: (\d+)$/gm)].map(m=>m[1]),attributes.map(crc));
    }
  }
  return {entries,documents,names};
}

for(const example of [
  {target:'EyeLidLeft',helper:'EyeLidLeft',artifact:'EyeLidLeft'},
  {target:'Custom/EyeLidLeft',helper:'Custom/EyeLidLeft',artifact:'Custom%2FEyeLidLeft'},
  {target:'Other/Avatar/EyeLidLeft',helper:'Other/Avatar/EyeLidLeft',artifact:'Other%2FAvatar%2FEyeLidLeft'},
  {target:'v2/EyeLidLeft',helper:'EyeLidLeft',artifact:'EyeLidLeft'},
  {target:'Custom/ParameterTune',helper:'Custom/ParameterTune',artifact:'Custom%2FParameterTune'},
  {target:'Parameter',helper:'Parameter',artifact:'Parameter'},
  {target:'日本語/まぶた',helper:'日本語/まぶた',artifact:'日本語%2Fまぶた'},
])test(`exact names and Clip hashes: ${example.target}`,async()=>{
  const result=await generated(example.target),{names,entries,documents}=inspect(result);
  assert(isTemplateResult(result,{target:example.target}));
  assert.equal(result.target,example.target);
  for(const suffix of ['','0','1','2','4','8','Negative'])assert(names.has(example.target+suffix),example.target+suffix);
  for(const name of ['Decode/'+example.helper,'Function/'+example.helper,'Proxy/'+example.helper+'/Cartesian','Proxy/'+example.helper+'/Output','Smooth/'+example.helper+'_Function'])assert(names.has(name),name);
  if(!example.target.startsWith('v2/'))assert(![...names].some(name=>name.startsWith('v2/')));
  assert.equal(result.folderName,example.artifact);
  assert.equal(result.fileName,example.artifact+'.unitypackage');
  assert.equal(result.rootFolder.path,'Assets/'+example.artifact);
  assert(entries.every(e=>e.path==='Assets/'+example.artifact||e.path.startsWith('Assets/'+example.artifact+'/')));
  // Compare Clip numeric key data directly with its original source Clip.
  const numericKeys=text=>[...text.matchAll(/^        (?:time|value|inSlope|outSlope|tangentMode|weightedMode|inWeight|outWeight): [^\r\n]+$/gm)].map(m=>m[0]);
  for(const clip of documents.filter(d=>d.classId==='74')){
    const name=/^  m_Name: (.+)$/m.exec(clip.text)[1];
    const sources=template.clips.filter(source=>{
      const before=/^  m_Name: (.+)$/m.exec(source.text)[1];
      return name===(before.includes('Parameter')?before.replaceAll('Parameter',example.artifact):example.artifact+'_'+before);
    });
    assert.equal(sources.length,1,name);
    assert.deepEqual(numericKeys(clip.text),numericKeys(sources[0].text),name);
  }
});

test('different namespaces remain distinct in logical helpers and physical paths',async()=>{
  const a=await generated('ns1/EyeLidLeft'),b=await generated('ns2/EyeLidLeft');
  assert.notEqual(a.rootFolder.path,b.rootFolder.path);
  assert(inspect(a).names.has('Function/ns1/EyeLidLeft'));
  assert(inspect(b).names.has('Function/ns2/EyeLidLeft'));
});
test('component limits, invalid path syntax and controls reject without trimming',async()=>{
  for(const name of ['',' Eye','Eye ','/Eye','Eye/','Eye//Lid','Eye/../Lid','Eye/./Lid','Eye\\Lid','Eye\nLid','Eye\0Lid','Eye\n','Eye\r','Eye\u2028','Eye\u2029','Eye%2FLid','Eye:Lid','Eye.Lid','a'.repeat(121),'ns/'+'a'.repeat(121),'CON','v2/CON'])assert.throws(()=>validateTarget(name),undefined,name);
  for(const name of ['a'.repeat(120),'ns/'+'a'.repeat(120),'v2/'+'a'.repeat(120),'Eye_1-Left','v2/Parameter'])assert.doesNotThrow(()=>validateTarget(name),name);
  const result=await generated('a'.repeat(120));assert(isTemplateResult(result));
  await assert.rejects(generated('日本語'.repeat(40)),/ファイル名/);
});
test('legacy v2 targets retain helper names and output asset names',async()=>{
  const result=await generated('v2/EyeLidLeft'),{entries,names}=inspect(result);
  assert.equal(result.fileName,'EyeLidLeft.unitypackage');
  assert(entries.some(e=>e.path==='Assets/EyeLidLeft/EyeLidLeft_Binary_Root.asset'));
  assert(names.has('Smooth/EyeLidLeft_Function'));
  assert(!names.has('Smooth/v2/EyeLidLeft_Function'));
});

// Explicit mixed-data validation: recovered real motions + synthetic integration inputs.
// No recovered template is embedded in this repository.
import {integratorFixture,asset,parameter,GUIDS} from './fixture.mjs';
import {parseUnityScalar} from '../../docs/shared/ft/unity-text.mjs';
export function mixedFixture(template){
 const f=integratorFixture(),names=new Set(['AlwaysOne']);
 for(const source of template.trees){for(const match of source.text.matchAll(/^\s+m_(?:BlendParameterY?|DirectBlendParameter):([^\r\n]*)/gm)){const name=parseUnityScalar(match[1]);if(name)names.add(name);}}
 for(const source of template.clips){for(const match of source.text.matchAll(/^    attribute:([^\r\n]*)\r?\n    path:([^\r\n]*)\r?\n    classID: 95$/gm)){if(!parseUnityScalar(match[2]))names.add(parseUnityScalar(match[1]));}}
 const base=f.packages[0].assets.find(a=>a.guid===GUIDS.base),dec=new TextDecoder();
 const existing=new Set([...dec.decode(base.asset).matchAll(/^  - m_Name: (.*)$/gm)].map(m=>parseUnityScalar(m[1])));
 base.asset=new TextEncoder().encode(dec.decode(base.asset).replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+[...names].filter(n=>!existing.has(n)).map(n=>parameter(n,1,n==='AlwaysOne'?1:0)).join('')));
 for(const kind of ['trees','clips'])for(const source of template[kind]){const name=parseUnityScalar(/^  m_Name:([^\r\n]*)$/m.exec(source.text)[1]),main=kind==='trees'?'20600000':'7400000';f.packages[0].assets.push(asset(source.guid,`Assets/RecoveredMotions/${name.replace(/[^A-Za-z0-9_-]/g,'_')}_${source.guid}.${kind==='trees'?'asset':'anim'}`,source.text,main));}
 const select=name=>{const source=template.trees.find(t=>parseUnityScalar(/^  m_Name:([^\r\n]*)$/m.exec(t.text)[1])===name);if(!source)throw Error(`Recovered template missing ${name}`);return `${source.guid}:20600000`;};
 f.request.binaryTreeId=select('Binary_Root');f.request.smoothTreeId=select('Smooth_Root');
 delete f.sources;return f;
}

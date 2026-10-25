import {fixture,asset,PREAMBLE,doc,GUIDS,parameter,state,tree,ref} from '../animator-composer/fixture-composition.mjs';
import {serializeExpression} from '../../docs/animator-composer/lib/registration.mjs';
import {writeUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
export * from '../animator-composer/fixture-composition.mjs';
export const MOTIONS='a9'.repeat(16);
export const MASK='99999999999999999999999999999999';
export function integratorFixture(){
 const {packages}=fixture(),assets=packages[0].assets;
 const base=assets[0],add=assets[1];
 // Pure structural additional Controller; original Motion container retains both Trees together.
 const originalAdd=new TextDecoder().decode(add.asset),docs=originalAdd.match(/--- !u![\s\S]*?(?=--- !u!|$(?![\s\S]))/g)??[],trees=docs.filter(d=>d.startsWith('--- !u!206 '));
 add.asset=new TextEncoder().encode(originalAdd.replace(/--- !u!206 [\s\S]*?(?=--- !u!|$(?![\s\S]))/g,'').replace('m_Motion: {fileID: 300}',`m_Motion: {fileID: 300, guid: ${MOTIONS}, type: 2}`).replace('m_Motion: {fileID: 301}',`m_Motion: {fileID: 301, guid: ${MOTIONS}, type: 2}`));
 assets.push(asset(MOTIONS,'Assets/OriginalMotionContainer.asset',PREAMBLE+trees.join(''),'300'));
 base.asset=new TextEncoder().encode(new TextDecoder().decode(base.asset).replace('    m_Mask: {fileID: 0}',`    m_Mask: {fileID: 31900000, guid: ${'e'.repeat(32)}, type: 2}`).replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+parameter('AlwaysOne',3,0)));
 add.asset=new TextEncoder().encode(new TextDecoder().decode(add.asset).replace('m_Name: Base Layer','m_Name: Add Layer').replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+parameter('AlwaysOne',4,0)+parameter('EntirelyUnused')).concat(state('999','Unreachable',ref('7400000',GUIDS.clip))));
 assets.push(asset(MASK,'Assets/Selected.mask',PREAMBLE+doc(319,'31900000','AvatarMask:\n  m_ObjectHideFlags: 0\n  m_Name: Selected\n  m_Mask: 01000000\n  m_Elements: []\n'),'31900000'));
 assets.push(asset(GUIDS.expr,'Assets/Expressions.asset',serializeExpression([{name:'ExternalOnly',type:'Float',defaultValue:0.25,saved:true,networkSynced:true},{name:'AlwaysOne',type:'Int',defaultValue:0,saved:true,networkSynced:false}]),'11400000'));
 const request={schemaVersion:1,name:'Integrated',controllerIds:[`${GUIDS.base}:9100000`,`${GUIDS.add}:9100000`],expressionIds:[`${GUIDS.expr}:11400000`],maskId:`${MASK}:31900000`,binaryTreeId:`${MOTIONS}:300`,smoothTreeId:`${MOTIONS}:301`,playable:'FX',writeDefaults:true};
 return {packages,request,sources:[{name:'fixture.unitypackage',bytes:writeUnityPackage(assets)}]};
}

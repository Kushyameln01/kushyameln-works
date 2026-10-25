// Independent synthetic documents; hashes are supplied by the test, never a Controller dictionary.
export const PREAMBLE='%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n';
export const doc=(classId,id,body)=>`--- !u!${classId} &${id}\n${body}`;
export const tree=(type=0,x='Axis',y='UnusedY',direct='UnusedDirect',id='20600000')=>doc(206,id,`BlendTree:\n  m_Name: Orphan\n  m_Childs:\n  - serializedVersion: 2\n    m_Motion: {fileID: 7400000, guid: ffffffffffffffffffffffffffffffff, type: 2}\n    m_DirectBlendParameter: ${direct}\n  m_BlendParameter: ${x}\n  m_BlendParameterY: ${y}\n  m_BlendType: ${type}\n`);
export const curve=(name,{classId=95,path='',flags=16}={})=>`  - curve:\n      m_Curve: []\n    attribute: ${JSON.stringify(name)}\n    path: ${JSON.stringify(path)}\n    classID: ${classId}\n    script: {fileID: 0}\n    flags: ${flags}\n`;
export const binding=(hash,{customType=0,path=0,typeId=95,int=0,pptr=0,reference=0}={})=>`    - serializedVersion: 2\n      path: ${path}\n      attribute: ${hash}\n      script: {fileID: 0}\n      typeID: ${typeId}\n      customType: ${customType}\n      isPPtrCurve: ${pptr}\n      isIntCurve: ${int}\n      isSerializeReferenceCurve: ${reference}\n`;
export const clip=(curves='',bindings='',{id='7400000',editor='',compressed=0}={})=>doc(74,id,`AnimationClip:\n  m_Name: Orphan Clip\n  serializedVersion: 7\n  m_Legacy: 0\n  m_Compressed: ${compressed}\n  m_FloatCurves:${curves?'':' []'}\n${curves}  m_PPtrCurves: []\n  m_ClipBindingConstant:\n    genericBindings:${bindings?'':' []'}\n${bindings}    pptrCurveMapping: []\n  m_EditorCurves:${editor?'':' []'}\n${editor}  m_Events: []\n`);
export const declaration=(name='NeverRead')=>doc(91,'9100000',`AnimatorController:\n  m_Name: Misleading\n  m_AnimatorParameters:\n  - m_Name: ${name}\n    m_Type: 4\n    m_DefaultBool: 1\n  m_AnimatorLayers: []\n`);
export function asset(n,path,text,main='0'){
  const guid=n.toString(16).padStart(32,'0');
  return {guid,path,asset:typeof text==='string'?new TextEncoder().encode(text):text,
    meta:`fileFormatVersion: 2\nguid: ${guid}\nNativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: ${main}\n`};
}

// Small independent serialized examples; no user/source packages are embedded.
export const PREAMBLE = '%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n';
export const SDK = '67cc4cb7839cd3741b63733d5adf0442';
export const GUIDS = { base:'11111111111111111111111111111111', add:'22222222222222222222222222222222',
  clip:'33333333333333333333333333333333', tree:'44444444444444444444444444444444',
  menu:'55555555555555555555555555555555', expr:'66666666666666666666666666666666',
  image:'77777777777777777777777777777777', junk:'88888888888888888888888888888888' };
export const ref = (id, guid) => guid ? `{fileID: ${id}, guid: ${guid}, type: 2}` : `{fileID: ${id}}`;
export const doc = (cls, id, body) => `--- !u!${cls} &${id}\n${body}`;
export function parameter(name, type=1, value=0) {
  return `  - m_Name: ${name}\n    m_Type: ${type}\n    m_DefaultFloat: ${type===1?value:0}\n    m_DefaultInt: ${type===3?value:0}\n    m_DefaultBool: ${type===4||type===9?value:0}\n    m_Controller: {fileID: 9100000}\n`;
}
export function layer(name, machine, {weight=0, synced=-1, mask=ref(0)}={}) {
  return `  - serializedVersion: 5\n    m_Name: ${name}\n    m_StateMachine: ${ref(machine)}\n    m_Mask: ${mask}\n    m_Motions: []\n    m_Behaviours: []\n    m_BlendingMode: 0\n    m_SyncedLayerIndex: ${synced}\n    m_DefaultWeight: ${weight}\n    m_IKPass: 0\n    m_SyncedLayerAffectsTiming: 0\n    m_Controller: {fileID: 9100000}\n`;
}
export function controller(name, parameters, layers, extras='') {
  return PREAMBLE+doc(91,'9100000',`AnimatorController:\n  m_ObjectHideFlags: 0\n  m_Name: ${name}\n  serializedVersion: 5\n  m_AnimatorParameters:${parameters.length?'':' []'}\n${parameters.join('')}  m_AnimatorLayers:${layers.length?'':' []'}\n${layers.join('')}`)+extras;
}
export function machine(id,name,state,{behaviours=[]}={}) {
  return doc(1107,id,`AnimatorStateMachine:\n  m_ObjectHideFlags: 1\n  m_Name: ${name}\n  m_ChildStates:\n  - serializedVersion: 1\n    m_State: ${ref(state)}\n    m_Position: {x: 20, y: 40, z: 0}\n  m_ChildStateMachines: []\n  m_AnyStateTransitions: []\n  m_EntryTransitions: []\n  m_StateMachineTransitions: {}\n  m_StateMachineBehaviours:${behaviours.length?'':' []'}\n${behaviours.map(x=>'  - '+ref(x)+'\n').join('')}  m_DefaultState: ${ref(state)}\n`);
}
export function state(id,name,motion,{behaviours=[],time=null,transition=null}={}) {
  return doc(1102,id,`AnimatorState:\n  serializedVersion: 6\n  m_ObjectHideFlags: 1\n  m_Name: ${name}\n  m_Speed: 1\n  m_CycleOffset: 0\n  m_Transitions:${transition?'':' []'}\n${transition?'  - '+ref(transition)+'\n':''}  m_StateMachineBehaviours:${behaviours.length?'':' []'}\n${behaviours.map(x=>'  - '+ref(x)+'\n').join('')}  m_WriteDefaultValues: 0\n  m_Motion: ${motion}\n  m_SpeedParameterActive: 0\n  m_MirrorParameterActive: 0\n  m_CycleOffsetParameterActive: 0\n  m_TimeParameterActive: ${time?1:0}\n  m_SpeedParameter: \n  m_MirrorParameter: \n  m_CycleOffsetParameter: \n  m_TimeParameter: ${time??''}\n`);
}
export function tree(id,name,axis,children=[ref('7400000',GUIDS.clip)]) {
  return doc(206,id,`BlendTree:\n  m_ObjectHideFlags: 1\n  m_Name: ${name}\n  m_Childs:\n${children.map((r,i)=>`  - serializedVersion: 2\n    m_Motion: ${r}\n    m_Threshold: ${i}\n    m_Position: {x: 0, y: 0}\n    m_TimeScale: 1\n    m_CycleOffset: 0\n    m_DirectBlendParameter: AlwaysOne\n    m_Mirror: 0\n`).join('')}  m_BlendParameter: ${axis}\n  m_BlendParameterY: InactiveY\n  m_MinThreshold: 0\n  m_MaxThreshold: 1\n  m_UseAutomaticThresholds: 0\n  m_NormalizedBlendValues: 0\n  m_BlendType: 0\n`);
}
export function clip(id='7400000',name='Shared',parameterName=null,hash=0) {
  return PREAMBLE+doc(74,id,`AnimationClip:\n  m_ObjectHideFlags: 0\n  m_Name: ${name}\n  serializedVersion: 7\n  m_Legacy: 0\n  m_Compressed: 0\n  m_RotationCurves: []\n  m_CompressedRotationCurves: []\n  m_EulerCurves: []\n  m_PositionCurves: []\n  m_ScaleCurves: []\n  m_FloatCurves:${parameterName?'':' []'}\n${parameterName?`  - curve:\n      serializedVersion: 2\n      m_Curve:\n      - serializedVersion: 3\n        time: 0\n        value: 0.75\n        inSlope: 0\n        outSlope: 0\n    attribute: ${parameterName}\n    path: \n    classID: 95\n    script: {fileID: 0}\n`:''}  m_PPtrCurves: []\n  m_SampleRate: 60\n  m_WrapMode: 0\n  m_Bounds:\n    m_Center: {x: 0, y: 0, z: 0}\n    m_Extent: {x: 0, y: 0, z: 0}\n  m_ClipBindingConstant:\n    genericBindings:${parameterName?'':' []'}\n${parameterName?`    - serializedVersion: 2\n      path: 0\n      attribute: ${hash}\n      script: {fileID: 0}\n      typeID: 95\n      customType: 0\n      isPPtrCurve: 0\n      isIntCurve: 0\n      isSerializeReferenceCurve: 0\n`:''}    pptrCurveMapping: []\n  m_AnimationClipSettings:\n    serializedVersion: 2\n    m_StartTime: 0\n    m_StopTime: 1\n    m_LoopTime: 0\n  m_EditorCurves: []\n  m_Events: []\n`);
}
export function behaviour(id,script,body) {
  return doc(114,id,`MonoBehaviour:\n  m_ObjectHideFlags: 1\n  m_GameObject: {fileID: 0}\n  m_Enabled: 1\n  m_Script: {fileID: ${script}, guid: ${SDK}, type: 3}\n  m_Name: \n  m_EditorClassIdentifier: \n${body}`);
}
export function asset(guid,path,text,main='9100000') {
  return {guid,path,asset:new TextEncoder().encode(text),meta:`fileFormatVersion: 2\nguid: ${guid}\nNativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: ${main}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`};
}
export function fixture() {
  const base=asset(GUIDS.base,'Assets/Base.controller',controller('Base',[parameter('BaseInput'),parameter('KeptUnused')],[layer('Base Layer','100')],
    machine('100','Base Layer','200')+state('200','Base State',ref('7400000',GUIDS.clip))));
  const addition=asset(GUIDS.add,'Assets/Add.controller',controller('Addition',[parameter('Axis'),parameter('Clock'),parameter('Unused')],
    [layer('Base Layer','100'),layer('NotSelected','101')],
    machine('100','Base Layer','200')+state('200','Addition State',ref('300'),{time:'Clock'})+
    tree('300','Axis Root','Axis')+machine('101','NotSelected','201')+state('201','Unused State',ref('301'))+
    tree('301','Unused Root','Unused')));
  const shared=asset(GUIDS.clip,'Assets/Shared.anim',clip(),'7400000');
  const standalone=asset(GUIDS.tree,'Assets/Standalone.asset',PREAMBLE+tree('20600000','Standalone','Undeclared'),'20600000');
  const junk=asset(GUIDS.junk,'Assets/NotSelected.asset','not supported and irrelevant','0');
  const packages=[{name:'fixture.unitypackage',hash:'a'.repeat(64),assets:[base,addition,shared,standalone,junk]}];
  const plan={schemaVersion:1,name:'ComposerFixture',inputHashes:['a'.repeat(64)],assetChoices:{},outputs:[
    {id:'fx',name:'Combined',playable:'FX',base:{id:'base',controllerId:`${GUIDS.base}:9100000`,expressionId:null},
      additions:[{id:'add',controllerId:`${GUIDS.add}:9100000`,layerIndices:[0],expressionId:null}],layerNames:{'add:0':'Added Layer'},motionAssignments:[]}],
    globalExpressionId:null,parameterEdits:{},conflictChoices:{},animatorChoices:{},
    installer:{pathMode:'Absolute',mergeMode:'Append',matchWriteDefaults:false,menuId:null}};
  return {packages,plan};
}

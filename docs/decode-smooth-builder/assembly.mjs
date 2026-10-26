import {readUnityPackage,writeUnityPackage} from '../shared/ft/unity-package.mjs';
import {splitUnityDocuments} from '../shared/ft/unity-text.mjs';
import {validateTarget} from '../parameter-template/api.mjs';

const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
const ROOT='Assets/Root_DecodeSmooth';
const PREAMBLE='%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n';
const objectFields='  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n';
const graphObjectFields=objectFields.replace('m_ObjectHideFlags: 0','m_ObjectHideFlags: 1');

function fail(message){throw new Error('DecodeSmooth assembly: '+message);}
function exactRoot(objects,reference,kind,target){
  if(!reference||typeof reference.guid!=='string'||!/^[a-fA-F0-9]{32}$/.test(reference.guid)||/^0+$/.test(reference.guid)||typeof reference.fileId!=='string'||!/^-?[1-9][0-9]*$/.test(reference.fileId)){
    fail(`${target}: ${kind} root requires an exact GUID/fileID`);
  }
  const id=BigInt(reference.fileId);
  if(id<-(1n<<63n)||id>=(1n<<63n))fail(`${target}: ${kind} root fileID exceeds signed 64-bit range`);
  const guid=reference.guid.toLowerCase(),matches=objects.filter(document=>document.guid===guid&&document.fileId===reference.fileId);
  if(matches.length!==1)fail(`${target}: missing or ambiguous ${kind} root GUID/fileID`);
  const root=matches[0];
  if(root.classId!=='206'||!/^BlendTree:\r?\n/.test(root.body)||root.header.includes(' stripped')){
    fail(`${target}: ${kind} root must be a complete class 206 BlendTree`);
  }
  return {guid:root.guid,fileId:root.fileId};
}

function uniqueGuid(used){
  if(typeof globalThis.crypto?.getRandomValues!=='function')fail('secure GUID generation is unavailable');
  for(let attempt=0;attempt<16;attempt++){
    const guid=Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
    if(!/^0+$/.test(guid)&&!used.has(guid)){used.add(guid);return guid;}
  }
  fail('new GUID collision');
}

function folderEntry(guid,path){
  return {guid,path,asset:null,meta:`fileFormatVersion: 2\nguid: ${guid}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`};
}
function assetEntry(guid,path,text,fileId){
  // Verify new document identities without round-tripping original asset text.
  splitUnityDocuments(text);
  return {guid,path,asset:encoder.encode(text),meta:`fileFormatVersion: 2\nguid: ${guid}\nNativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: ${fileId}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`};
}

function directTree(name,motions){
  return PREAMBLE+`--- !u!206 &20600000\nBlendTree:\n${objectFields}  m_Name: ${name}\n  m_Childs:\n`
    +motions.map(ref=>`  - serializedVersion: 2\n    m_Motion: {fileID: ${ref.fileId}, guid: ${ref.guid}, type: 2}\n    m_Threshold: 0\n    m_Position: {x: 0, y: 0}\n    m_TimeScale: 1\n    m_CycleOffset: 0\n    m_DirectBlendParameter: AlwaysOne\n    m_Mirror: 0\n`).join('')
    +'  m_BlendParameter: Blend\n  m_BlendParameterY: Blend\n  m_MinThreshold: 0\n  m_MaxThreshold: 1\n  m_UseAutomaticThresholds: 0\n  m_NormalizedBlendValues: 0\n  m_BlendType: 4\n';
}

function stateMachine(fileId,name,{child=false}={}){
  return `--- !u!1107 &${fileId}\nAnimatorStateMachine:\n${graphObjectFields}  serializedVersion: 6\n  m_Name: ${name}\n  m_ChildStates: []\n`
    +(child?'  m_ChildStateMachines: []\n':'  m_ChildStateMachines:\n  - serializedVersion: 1\n    m_StateMachine: {fileID: 11070001}\n    m_Position: {x: 300, y: 120, z: 0}\n')
    +'  m_AnyStateTransitions: []\n'
    +(child?'  m_EntryTransitions: []\n':'  m_EntryTransitions:\n  - {fileID: 11090000}\n')
    +'  m_StateMachineTransitions: {}\n  m_StateMachineBehaviours: []\n  m_AnyStatePosition: {x: 50, y: 20, z: 0}\n  m_EntryPosition: {x: 50, y: 120, z: 0}\n  m_ExitPosition: {x: 800, y: 120, z: 0}\n  m_ParentStateMachinePosition: {x: 800, y: 20, z: 0}\n  m_DefaultState: {fileID: 0}\n';
}

function baseController(){
  // Prototype candidate: m_DefaultState is an AnimatorState PPtr and cannot
  // point to a child AnimatorStateMachine. An unconditional Entry transition
  // enters the empty child machine instead. No dummy State/Clip/Motion is added.
  // Unity Import and downstream consumers' definition of an "Empty" Layer are
  // UNVERIFIED. Readback proves this serialized structure, not Editor behavior.
  return PREAMBLE+`--- !u!91 &9100000\nAnimatorController:\n${objectFields}  m_Name: DecodeSmooth_Base\n  serializedVersion: 5\n  m_AnimatorParameters:\n  - m_Name: AlwaysOne\n    m_Type: 1\n    m_DefaultFloat: 1\n    m_DefaultInt: 0\n    m_DefaultBool: 0\n    m_Controller: {fileID: 9100000}\n  m_AnimatorLayers:\n  - serializedVersion: 5\n    m_Name: Base Layer\n    m_StateMachine: {fileID: 11070000}\n    m_Mask: {fileID: 0}\n    m_Motions: []\n    m_Behaviours: []\n    m_BlendingMode: 0\n    m_SyncedLayerIndex: -1\n    m_DefaultWeight: 1\n    m_IKPass: 0\n    m_SyncedLayerAffectsTiming: 0\n    m_Controller: {fileID: 9100000}\n`
    +stateMachine('11070000','Base Layer')+stateMachine('11070001','No Animation',{child:true})
    +`--- !u!1109 &11090000\nAnimatorTransition:\n${graphObjectFields}  m_Name: \n  m_Conditions: []\n  m_DstStateMachine: {fileID: 11070001}\n  m_DstState: {fileID: 0}\n  m_Solo: 0\n  m_Mute: 0\n  m_IsExit: 0\n  serializedVersion: 1\n`;
}

function safetyMask(){
  // AvatarMaskBodyPart's 13 Humanoid entries are uint32 values in Unity's
  // m_Mask hex serialization. All zero; no transform paths/rig are imported.
  return PREAMBLE+`--- !u!319 &31900000\nAvatarMask:\n${objectFields}  m_Name: Safety\n  m_Mask: ${'00000000'.repeat(13)}\n  m_Elements: []\n`;
}

/** Build actual 4b/4c/4d packages. The only edits to source entries are paths.
 * All refs retain exact decimal-string fileIDs; original asset/meta bytes,
 * embedded AnimationClips, curves and parameter values are left intact.
 */
export async function buildIntermediateAssets(generatedPackages){
  if(!Array.isArray(generatedPackages)||!generatedPackages.length)fail('at least one generated package is required');
  const targets=new Set(),usedGuids=new Set(),paths=new Set(),inputs=[],relocated=[];
  for(const input of generatedPackages){
    if(!input||typeof input!=='object')fail('invalid generated package');
    validateTarget(input.target);
    if(targets.has(input.target))fail(`duplicate target ${input.target}`);
    targets.add(input.target);
    const entries=[...readUnityPackage(input.bytes).values()];
    const rootFolder=input.rootFolder;
    if(!rootFolder||typeof rootFolder.guid!=='string'||!/^[a-fA-F0-9]{32}$/.test(rootFolder.guid)||typeof rootFolder.path!=='string')fail(`${input.target}: rootFolder metadata is required`);
    const folder=entries.find(entry=>entry.guid===rootFolder.guid.toLowerCase());
    if(!folder||folder.asset!==null||folder.path!==rootFolder.path)fail(`${input.target}: rootFolder GUID/path does not resolve to the declared folder`);
    const top=folder.path;
    for(const entry of entries){
      if(entry.path!==top&&!entry.path.startsWith(top+'/'))fail(`${input.target}: asset outside its top folder: ${entry.path}`);
      if(usedGuids.has(entry.guid))fail(`duplicate GUID ${entry.guid}`);
      usedGuids.add(entry.guid);
      const path=ROOT+'/'+entry.path.slice('Assets/'.length),key=path.toLowerCase();
      if(paths.has(key))fail(`duplicate relocated path ${path}`);
      paths.add(key);
      relocated.push({...entry,path});
    }
    inputs.push({target:input.target,roots:input.roots,entries});
  }
  let treeCount=2,clipCount=0;
  const binary=[],smooth=[];
  for(const {target,roots,entries}of inputs){
    const objects=[];
    for(const entry of entries){
      if(entry.asset===null)continue;
      let parsed;
      try{parsed=splitUnityDocuments(decoder.decode(entry.asset));}
      catch(error){fail(`${target}: ${entry.path}: ${error.message}`);}
      for(const document of parsed.documents){
        objects.push({...document,guid:entry.guid});
        if(document.classId==='206')treeCount++;
        if(document.classId==='74')clipCount++;
      }
    }
    const binaryRoot=exactRoot(objects,roots?.binary,'binary',target),smoothRoot=exactRoot(objects,roots?.smooth,'smooth',target);
    if(binaryRoot.guid===smoothRoot.guid&&binaryRoot.fileId===smoothRoot.fileId)fail(`${target}: binary and smooth roots must have distinct GUID/fileIDs`);
    binary.push(binaryRoot);
    smooth.push(smoothRoot);
  }
  const refs={
    baseController:{guid:uniqueGuid(usedGuids),fileId:'9100000'},
    mask:{guid:uniqueGuid(usedGuids),fileId:'31900000'},
    binaryTree:{guid:uniqueGuid(usedGuids),fileId:'20600000'},
    smoothTree:{guid:uniqueGuid(usedGuids),fileId:'20600000'}
  };
  const motionEntries=[folderEntry(uniqueGuid(usedGuids),ROOT),...relocated,
    assetEntry(refs.binaryTree.guid,ROOT+'/Root_BinaryParameter.asset',directTree('Root_BinaryParameter',binary),refs.binaryTree.fileId),
    assetEntry(refs.smoothTree.guid,ROOT+'/Root_Smooth_Parameter.asset',directTree('Root_Smooth_Parameter',smooth),refs.smoothTree.fileId)];
  return {
    motionPackage:writeUnityPackage(motionEntries),
    basePackage:writeUnityPackage([assetEntry(refs.baseController.guid,'Assets/DecodeSmooth_Base.controller',baseController(),refs.baseController.fileId)]),
    maskPackage:writeUnityPackage([assetEntry(refs.mask.guid,'Assets/Safety.mask',safetyMask(),refs.mask.fileId)]),
    refs,summary:{targetCount:inputs.length,treeCount,clipCount}
  };
}

import {readUnityPackage} from '../shared/ft/unity-package.mjs';
import {splitUnityDocuments,extractAnimatorLayers,extractReferences} from '../shared/ft/unity-text.mjs';
const decoder=new TextDecoder('utf-8',{fatal:true});
function fail(message,id){const e=new Error(message);e.name='IntegratorSelectionError';e.code='INTEGRATOR_SELECTION';e.issues=[{severity:'error',code:'batch_reference',message,...(id?{id}:{})}];throw e;}
function identity(ref){
 if(!ref||typeof ref.guid!=='string'||!/^[a-fA-F0-9]{32}$/.test(ref.guid)||/^0+$/.test(ref.guid)||typeof ref.fileId!=='string'||!/^-?[1-9][0-9]*$/.test(ref.fileId))fail('Invalid GUID/fileID identity.');
 const n=BigInt(ref.fileId);if(n<-(1n<<63n)||n>=(1n<<63n))fail('fileID exceeds signed 64-bit range.');return ref.guid.toLowerCase()+':'+ref.fileId;
}
function exact(catalog,kind,ref){const id=identity(ref),matches=(catalog?.[kind]??[]).filter(a=>a.id===id);if(matches.length!==1||matches[0].guid?.toLowerCase()!==ref.guid.toLowerCase()||matches[0].fileId!==ref.fileId)fail(`Expected exact ${kind} GUID/fileID identity ${id}.`,id);return matches[0];}
function emptyRegistrarLayers(registration,controller){
 if(!(registration.archive instanceof Uint8Array))fail('Generated Registrar archive is required.',controller.id);
 const entries=readUnityPackage(registration.archive),entry=entries.get(controller.guid),documents=entry?.asset?splitUnityDocuments(decoder.decode(entry.asset)).documents:[],root=documents.find(d=>d.fileId===controller.fileId&&d.classId==='91');
 if(!root)fail('Generated Registrar Controller identity is missing.',controller.id);
 const layers=extractAnimatorLayers(root.text);if(layers.length!==controller.layers.length)fail('Registrar layer catalog differs from its generated archive.',controller.id);
 for(const [i,layer]of layers.entries()){
  if(controller.layers[i]?.index!==i||controller.layers[i].name!==layer.name)fail('Registrar layer catalog differs from its generated archive.',controller.id);
  if(layer.fields.m_SyncedLayerIndex!=='-1'||layer.fields.m_Motions!=='[]'||layer.fields.m_Behaviours!=='[]')fail('Only generated empty, unsynchronized Registrar layers may be omitted.',controller.id);
  const r=extractReferences(layer.fields.m_StateMachine)[0],source=entries.get(r.guid??controller.guid),machine=source?.asset?splitUnityDocuments(decoder.decode(source.asset)).documents.find(d=>d.fileId===r.fileId&&d.classId==='1107'):null;
  if(!machine||!['m_ChildStates','m_ChildStateMachines','m_AnyStateTransitions','m_EntryTransitions','m_StateMachineBehaviours'].every(name=>new RegExp(`^  ${name}: \\[\\]\\r?$`,'m').test(machine.text))||!/^  m_StateMachineTransitions: \{\}\r?$/m.test(machine.text)||!/^  m_DefaultState: \{fileID: 0\}\r?$/m.test(machine.text))fail('Only generated empty Registrar layers may be omitted.',controller.id);
 }
 return layers;
}
/** Keep Registrar declarations and subassets without emitting their empty layers. */
export function createIntegratorRequest({catalog,refs,registrations}){
 if(!refs||!Array.isArray(registrations)||!registrations.length)fail('Generated base, mask, trees and Registrar outputs are required.');
 const base=exact(catalog,'controllers',refs.baseController),mask=exact(catalog,'masks',refs.mask),binary=exact(catalog,'blendTrees',refs.binaryTree),smooth=exact(catalog,'blendTrees',refs.smoothTree),controllerIds=[base.id],expressionIds=[],parameterOnlyControllerIds=[];
 for(const registration of registrations){const c=exact(catalog,'controllers',registration.controller),e=exact(catalog,'expressions',registration.expression);if(controllerIds.includes(c.id)||expressionIds.includes(e.id))fail('Duplicate generated Registrar identity.',c.id);emptyRegistrarLayers(registration,c);controllerIds.push(c.id);expressionIds.push(e.id);parameterOnlyControllerIds.push(c.id);}
 return {schemaVersion:1,name:'DecodeSmooth',controllerIds,expressionIds,parameterOnlyControllerIds,maskId:mask.id,binaryTreeId:binary.id,smoothTreeId:smooth.id,playable:'FX',writeDefaults:true};
}

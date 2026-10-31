import {evaluateEdge} from '../compatibility.mjs';
import {restoreNativeTensor} from './artifacts.mjs';
export function createDirectAdapter({descriptor,nativeClient,binding,artifactStore,sourceVerified=false,invokeNative,cancelNative,nativeEnvelope,allowedMethods,requiresRevisionBinding=false,supportsConnected=true}){
 if(!descriptor?.nativeAPI||!nativeClient||!binding?.ownerId||!binding.sessionId)throw TypeError('Explicit descriptor, client and owner/session binding required');
 let active=null,disposed=false;const ids=new Set();
 const error=(code,raw,nativeCode=null)=>({code,nativeCode,rawMessage:String(raw?.message??raw)});
 async function invoke(q={}){
  const base={requestId:q.requestId,localRevision:q.localRevision,nativeRevisionBinding:q.nativeRevisionBinding??null,native:nativeEnvelope(q)};
  if(disposed)return {...base,status:'error',error:error('DISPOSED','Adapter disposed')};
  if(!sourceVerified)return {...base,status:'unverified',error:error('SOURCE_UNVERIFIED','Exact native source/export has not been acquired')};
  if(typeof q.requestId!=='string'||!q.requestId||!Number.isSafeInteger(q.localRevision)||q.localRevision<0||ids.has(q.requestId))return {...base,status:'error',error:error('INVALID_INVOCATION','Unique request ID and explicit local revision required')};
  ids.add(q.requestId);
  const op=descriptor.operations?.find(op=>op.operationId===q.operationId);
  if(op?.implementationState!=='implemented'||!allowedMethods.includes(q.operationId))return {...base,status:'blocked',error:error('OPERATION_NOT_READY','No implemented acquired native operation mapping')};
  let nativeQ=q;
  if(q.edge){
   if(!supportsConnected)return {...base,status:'blocked',error:error('CONNECTED_MAPPING_UNVERIFIED','This native positional edge has no acquired checked-payload mapping')};
   const edgeDecision=evaluateEdge(q.edge);base.edgeDecision=edgeDecision;
   if(edgeDecision.readiness.state!=='ready')return {...base,status:'blocked',error:error('EDGE_NOT_READY','Explicit selected edge is not ready')};
   const declaredPort=op.inputPorts?.find(p=>p.bindingRef===binding.bindingRef);
   if(!q.inputHandle||JSON.stringify(q.inputHandle.descriptor)!==JSON.stringify(q.edge.artifact)||q.edge.consumerPort.owner!==binding.ownerId||q.edge.consumerPort.bindingRef!==binding.bindingRef||q.edge.implementationState?.consumer?.operationId!==q.operationId||!declaredPort||JSON.stringify(declaredPort)!==JSON.stringify(q.edge.consumerPort))return {...base,status:'blocked',error:error('EDGE_BINDING_MISMATCH','Owned input and declared operation/consumer port must match the evaluated edge')};
   try{nativeQ={...q,input:restoreNativeTensor(q.inputHandle,artifactStore)};}catch(e){return {...base,status:'error',error:error('ARTIFACT_HANDLE_INVALID',e)};}
  }
  if(requiresRevisionBinding&&(!q.nativeRevisionBinding?.sdkInstanceId||!Number.isSafeInteger(q.nativeRevisionBinding.inputRevision)||!Number.isSafeInteger(q.nativeRevisionBinding.applicationRevision)))return {...base,status:'error',error:error('REVISION_BINDING_REQUIRED','Native revisions must be explicit and separate')};
  if(active)return {...base,status:'blocked',error:error('OWNER_BUSY','Queue this invocation on its declared resource owner')};
  const token={requestId:q.requestId,localRevision:q.localRevision,cancelled:false};active=token;
  try{
   // Direct arguments stay local. No function, AbortSignal or native handle is cloned to a port.
   const result=await invokeNative(nativeQ,{recordReply:reply=>{base.native.rawReply=reply;}});
   if(token.cancelled)return {...base,status:'cancelled'};
   return {...base,status:'ok',result};
  }catch(e){return {...base,status:token.cancelled?'cancelled':'error',error:error('NATIVE_ERROR',e,e?.nativeCode??null)};}
  finally{if(active===token)active=null;}
 }
 async function cancel(target){
  if(!active||active.requestId!==target?.requestId||active.localRevision!==target?.localRevision)return {accepted:false,stopped:false};
  active.cancelled=true;const reply=await cancelNative(target);
  // Acceptance does not prove terminal cleanup; the queue's owner barrier must observe it.
  return {accepted:true,nativeReply:reply,stopped:reply===true||reply?.stopped===true};
 }
 return Object.freeze({invoke,cancel,get active(){return active?{requestId:active.requestId,localRevision:active.localRevision}:null;},async dispose(){if(active)throw Error('Owner must cancel and observe invocation terminal before dispose');disposed=true;},binding:Object.freeze({...binding})});
}

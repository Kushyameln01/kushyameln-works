import {checkExecutionSupport,describeExecutionCapabilities,P4_SHAPES} from './capabilities.mjs';
import {createP4WeightSource} from '../ort-bridge/post-self-attention/source.mjs';
import {createP4WeightFeed} from '../ort-bridge/post-self-attention/weights.mjs';
import {createPostSelfAttention,snapshotPostSelfAttentionInputs} from '../ort-bridge/post-self-attention/stage.mjs';
import {cleanupAfterFailure} from '../ort-bridge/qkv/ownership.mjs';

const clone=x=>structuredClone(x);
const fail=(code,message,details)=>{throw Object.assign(new Error(message),{code,details});};
function declaredRequest(request,model){
 if(!request||typeof request!=='object'||Array.isArray(request))fail('INVALID_REQUEST','Normal P4 request object required');
 if(Object.keys(request).some(k=>!['operation','model','blockIndex','contextLatents','residual','timeAct1','conditioning','inputs'].includes(k)))fail('INVALID_REQUEST','Unknown normal P4 request field');
 if(request.inputs!==undefined&&['residual','timeAct1','conditioning'].some(k=>Object.hasOwn(request,k)))fail('INVALID_REQUEST','Use canonical inputs or flat tensors, not both');
 const descriptor={operation:request.operation??'postSelfAttention',model:request.model??model,blockIndex:request.blockIndex??0,contextLatents:request.contextLatents??[],inputs:request.inputs??{residual:request.residual,timeAct1:request.timeAct1,conditioning:request.conditioning}};
 const support=checkExecutionSupport(descriptor);
 if(descriptor.operation!=='postSelfAttention')fail('UNSUPPORTED_OPERATION','This owner implements postSelfAttention only');
 if(!support.supported)fail('UNSUPPORTED_REQUEST','The owner cannot execute the declared request',support);
 if(descriptor.model.side!==model.side||(descriptor.model.modelSha256!==undefined&&descriptor.model.modelSha256!==model.modelSha256))fail('MODEL_IDENTITY_MISMATCH','Request model differs from the prepared owner');
 return descriptor;
}
/** The same ingress snapshot used by the runtime, independently testable without construction. */
export function snapshotNormalP4Inputs(request,model,options={}){
 const {inputs}=declaredRequest(request,model);
 return snapshotPostSelfAttentionInputs({residual:inputs.residual.data,timeAct1:inputs.timeAct1.data,conditioning:inputs.conditioning,...options},{normal:true});
}

/** Standalone owner; no manager, fixed payload, numerical reference or receipt is required. */
export async function createBerniniP4Execution(options={}){
 if(Object.keys(options).some(k=>!['file','side','bridgeBytes','mathBytes','attentionBytes'].includes(k)))fail('INVALID_REQUEST','Unknown P4 preparation option');
 const operatorBytes=value=>{if(value===undefined)return undefined;if(Object.getPrototypeOf(value??{})===ArrayBuffer.prototype)return value.slice(0);if(Object.getPrototypeOf(value??{})===Uint8Array.prototype&&value.buffer instanceof ArrayBuffer)return new Uint8Array(value);fail('INVALID_REQUEST','Nonshared operator bytes required');};
 const ownedOptions={file:options.file,side:options.side,bridgeBytes:operatorBytes(options.bridgeBytes),mathBytes:operatorBytes(options.mathBytes),attentionBytes:operatorBytes(options.attentionBytes)};
 let source=null,feed=null,stage=null,disposed=false,closing=false,pending=null;
 const live=()=>{if(disposed||closing)fail('DISPOSED','Normal P4 owner is closing or disposed');};
 const cleanup=async()=>{await stage?.dispose();await feed?.dispose();source?.dispose();};
 const dispose=()=>{if(disposed)return Promise.resolve();if(pending)return pending;closing=true;pending=cleanup().then(()=>{disposed=true;closing=false;}).finally(()=>{pending=null;});return pending;};
 try{
  source=await createP4WeightSource(ownedOptions);
  feed=createP4WeightFeed({source,includeTextEmbedding:true});
  stage=await createPostSelfAttention({source:feed,mathBytes:ownedOptions.mathBytes,attentionBytes:ownedOptions.attentionBytes,diagnostics:false});
  const original=source.describe(),model=Object.freeze({side:original.side,modelSha256:original.modelHash});
  const execute=async(request,options,detailed)=>{
   live();const {inputs}=declaredRequest(request,model);
   if(!options||Object.keys(options).some(k=>!['signal','onProgress'].includes(k)))fail('INVALID_REQUEST','Only signal and onProgress are run options');
   // The core takes all owned snapshots synchronously before its first await.
   const result=await stage.run({residual:inputs.residual.data,timeAct1:inputs.timeAct1.data,conditioning:inputs.conditioning,...options},{diagnostics:detailed});
   if(detailed)return result;
   return {tensor:{data:result.output,dtype:'float32',shape:[...P4_SHAPES.blockOutput],layout:'LC',meaning:'bernini-block0-output-hidden:v1',normalization:'none',modelSha256:model.modelSha256},state:{operation:'postSelfAttention',model:clone(model),blockIndex:0,executionProfileId:result.executionProfileId,weightFeed:result.weightState,modelInference:false,generationReady:false},resources:result.resources,elapsedMs:result.elapsedMs};
  };
  return Object.freeze({model,weightFeed:feed,
   describe(){live();return {...describeExecutionCapabilities().operations.postSelfAttention,model:clone(model),normalOutput:'final tensor only',diagnosticMethod:'diagnose',source:{modelHash:original.modelHash,headerSHA256:original.headerSHA256,graphHash:original.graphHash,precisionProfile:original.precisionProfile,fullFileSHA256Verified:false}};},
   checkSupport(request={}){live();try{return checkExecutionSupport(declaredRequest(request,model));}catch(error){return error.details?.schemaVersion==='diffusion-execution-support/0.1'?error.details:{schemaVersion:'diffusion-execution-support/0.1',operation:request?.operation??'postSelfAttention',supported:false,reasons:[{code:error.code??'INVALID_REQUEST',message:error.message,requiredExtension:'request-contract'}],modelInference:false,generationReady:false,validation:'metadata-only'};}},
   run(request,options={}){return execute(request,options,false);},
   diagnose(request,options={}){return execute(request,options,true);},
   stats(){return {disposed,closing,stage:stage?.stats()??null,feed:feed?.stats()??null,source:source?.stats()??null};},dispose,recover:dispose
  });
 }catch(error){closing=true;throw await cleanupAfterFailure(error,dispose);}
}

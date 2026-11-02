import {BASE_MODEL_HASHES,LORA_LIMITS} from '../lora/weights.mjs';
import {WAN_TEXT_ENCODER_SHA256,WAN21_VAE_SHA256,WAN21_RAW_PROFILE,WAN21_RAW_F1_PROFILE,WAN21_RAW_RECT_PROFILE} from '../tensor-interop.mjs';
import {NORMALIZED_MEAN,NORMALIZATION} from '../latent-space/latent-space.mjs';
import {PROFILE as SCHEDULE_PROFILE} from '../scheduler/scheduler-kernel.mjs';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const POINTWISE_MAX_ELEMENTS=1048576;
// Matches the native Text tokenizer binding in conditioning.mjs and tokenizer.mjs.
export const P4_TEXT_TOKENIZER_SHA256='e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458';
/** Shared operator extents. A null dimension is the bounded Text sequence axis. */
export const P4_SHAPES=freeze({blockIndex:0,tokens:2,hiddenWidth:5120,textWidth:4096,textRows:[1,512],residual:[2,5120],timeAct1:[5120],conditioning:[1,null,4096],blockOutput:[2,5120],ffnWidth:13824,headCount:40,headDim:128});
// These are admission limits from post-self-attention/source.mjs and linear.mjs,
// not measurements of aggregate browser, ORT allocator or host memory peaks.
export const P4_LIMITS=freeze({maxDecodeElements:81920,maxRawReadBytes:163840,maxProjectionRows:16,maxWeightRows:16,ffnDownMaxWeightRows:4,ordinaryInnerMax:5120,ffnDownInner:13824,ffnDownInnerSplit:false,graphQueryRows:2,keyChunkMin:1,keyChunkMax:64,aggregatePeakBytes:null,aggregatePeakMeasured:false});
export const P4_INPUT_SEMANTICS=freeze({
 residual:{dtype:'float32',shape:P4_SHAPES.residual,layout:'LC',meaning:'bernini-block0-post-self-attention-hidden:v1',normalization:'none'},
 timeAct1:{dtype:'float32',shape:P4_SHAPES.timeAct1,layout:'C',meaning:'bernini-time-embedding-silu:v1',normalization:'none'},
 conditioning:{dtype:'float32',shape:P4_SHAPES.conditioning,layout:'BLC',meaning:'text_hidden_states',normalization:'umt5-final-rmsnorm-f32-v1',modelSha256:WAN_TEXT_ENCODER_SHA256,tokenizerSha256:P4_TEXT_TOKENIZER_SHA256}
});
const RAW_PROFILES=[WAN21_RAW_PROFILE,WAN21_RAW_F1_PROFILE,WAN21_RAW_RECT_PROFILE];
const ADMIN=['capabilities','inspect','inspectLora','loadLora','listLoras','readLora','readLoraSource','unloadLora','cancel','dispose'];
const POINTWISE={noiseMix:['noise','latent'],inverseNoiseScale:['latent'],flowDenoised:['input','velocity'],eulerStep:['latent','denoised']};
const MEAN=['validateRawLatent','normalizeRawMean','restoreRawMean'];
const UNREADY=['load','predict','sample'];
const KNOWN=new Set([...ADMIN,...Object.keys(POINTWISE),...MEAN,...UNREADY,'schedule','validateConditioning','linearProjection','linearProjectionF32','postSelfAttention']);
const sameShape=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((n,i)=>n===b[i]);
const tensor=(shape,layout,meaning,normalization)=>({dtype:'float32',shape,layout,meaning,...(normalization!==undefined?{normalization}:{})});
const clone=value=>structuredClone(value);

/** Metadata only: no payload reads, receipt checks, model loading or dispatch. */
export function describeExecutionCapabilities(){
 const operations=Object.fromEntries(ADMIN.map(name=>[name,{available:true,kind:'control-or-weight-io'}]));
 for(const [name,names] of Object.entries(POINTWISE))operations[name]={available:true,kind:'numeric-primitive',inputs:names,maxTensorElements:POINTWISE_MAX_ELEMENTS,maxRank:8,dtype:'float32',matchingShapes:true,zeroElementsAllowed:name==='eulerStep',...(name==='eulerStep'?{emptyShape:[0]}:{})};
 for(const name of MEAN){
  const restoring=name==='restoreRawMean';
  operations[name]={available:true,kind:'posterior-mean',input:'tensor',profiles:RAW_PROFILES.map(profile=>{
   const strictRaw=true;
   return {...profile,dtype:'float32',modelSha256:WAN21_VAE_SHA256,normalizationMarkerState:restoring?'optional-exact-rule-id':strictRaw?'absent':'absent',latentContractState:restoring||strictRaw?'absent':'absent'};
  }),meaning:restoring?NORMALIZED_MEAN:'raw-posterior-mean',normalizationMarkerState:restoring?'optional':name==='normalizeRawMean'?'absent':'profile-specific',normalizationRuleId:restoring?NORMALIZATION:null};
 }
 operations.schedule={available:true,kind:'numeric-primitive',profile:SCHEDULE_PROFILE};
 operations.validateConditioning={available:true,kind:'metadata-validation',input:tensor([1,null,4096],'BLC','text_hidden_states'),textRows:[1,512],modelSha256:WAN_TEXT_ENCODER_SHA256,maxTensorElements:2097152,attentionMask:{dtype:'uint8',shape:['L'],values:[0,1],requiresActivePosition:true}};
 for(const name of ['linearProjection','linearProjectionF32'])operations[name]={available:true,kind:'partial-projection',inputs:{[name==='linearProjection'?'q':'weight']:{dtype:name==='linearProjection'?'uint8':'float32',shape:[16,5120]},x:{dtype:'float32',shape:[5120]},bias:{dtype:'float32',shape:[16]}},output:{dtype:'float32',shape:[16]},...(name==='linearProjection'?{scale:'finite-positive'}:{})};
 operations.postSelfAttention={available:true,kind:'partial-neural-operator',blockIndex:P4_SHAPES.blockIndex,shapes:P4_SHAPES,limits:P4_LIMITS,inputs:P4_INPUT_SEMANTICS,contextLatents:[],modelSides:Object.keys(BASE_MODEL_HASHES),computeDtype:'float32',output:tensor(P4_SHAPES.blockOutput,'LC','bernini-block0-output-hidden:v1','none'),attentionMask:'provenance-only; all Text rows consumed; no cross-attention softmax mask',missingTokenizerPolicy:'reject',producerAuthentication:false,textNormalizationAliases:['encoder-final-rmsnorm']};
 for(const name of UNREADY)operations[name]={available:false,reason:'NOT_READY'};
 const controls={
  prepareP4:{available:true,transport:['direct','message-port'],input:'local immutable Blob and explicit model side',creates:'owned-idle-p4-execution'},
  runP4:{available:true,transport:['direct','message-port'],executionOperation:'postSelfAttention',request:'canonical execution descriptor and typed payload; not a checkExecutionSupport operation alias'},
  releaseP4:{available:true,transport:['direct','message-port'],releases:'owned-p4-execution'},
  checkSupport:{available:true,transport:['direct','message-port'],request:'canonical execution descriptor',execution:false}
 };
 return clone({schemaVersion:'diffusion-execution-capabilities/0.1',protocolVersion:'diffusion-models/0.1',models:BASE_MODEL_HASHES,operations,controls,pointwiseMaxTensorElements:POINTWISE_MAX_ELEMENTS,loraLimits:LORA_LIMITS,modelInference:false,generationReady:false,scope:'Implemented operation and metadata limits; numerical validation and management adoption remain separate.'});
}

/** Check declared compatibility, without treating metadata as execution evidence. */
export function checkExecutionSupport(request={}){
 const reasons=[];
 const reject=(code,message,requiredExtension)=>reasons.push({code,message,requiredExtension});
 const operation=request?.operation;
 const result=()=>({schemaVersion:'diffusion-execution-support/0.1',operation:typeof operation==='string'?operation:null,supported:reasons.length===0,reasons,modelInference:false,generationReady:false,validation:'metadata-only'});
 if(!request||typeof request!=='object'||Array.isArray(request)){reject('INVALID_DESCRIPTOR','An execution request descriptor is required','execution-request-descriptor');return result();}
 if(!KNOWN.has(operation)){reject('UNSUPPORTED_OPERATION','The requested operation is not implemented','new-operation');return result();}
 const model=request.model;
 if(model!==undefined){
  if(!model||typeof model!=='object'||!Object.hasOwn(BASE_MODEL_HASHES,model.side))reject('UNSUPPORTED_MODEL','Select the implemented HIGH or LOW Bernini model','model-implementation');
  else if(model.modelSha256!==undefined&&model.modelSha256!==BASE_MODEL_HASHES[model.side])reject('MODEL_IDENTITY_MISMATCH','The declared model hash does not match its selected side','model-binding');
 }
 if(request.contextLatents!==undefined&&(!Array.isArray(request.contextLatents)||request.contextLatents.length))reject('UNSUPPORTED_CONTEXT','This execution entry has no context-latent path','context-latents');
 if(UNREADY.includes(operation)){reject('NOT_READY','No complete validated model load, prediction or sampling path is implemented','complete-model-inference');return result();}
 if(ADMIN.includes(operation))return result();
 const inputs=request.inputs;
 const read=name=>{
  const value=inputs?.[name];
  if(!value||typeof value!=='object'||Array.isArray(value)){reject('MISSING_INPUT','Missing tensor descriptor: '+name,'input-descriptor');return null;}
  return value;
 };
 const dtype=(value,name,expected='float32')=>{if(value.dtype!==expected)reject('UNSUPPORTED_DTYPE',name+' requires '+expected,'dtype-conversion-or-operator');};
 const field=(value,name,key,expected)=>{if(value[key]!==expected)reject(key==='normalization'?'UNSUPPORTED_NORMALIZATION':key==='layout'?'UNSUPPORTED_LAYOUT':'SEMANTIC_MISMATCH',name+' requires '+key+' '+expected,key==='normalization'?'normalization-adapter':'tensor-contract');};
 const shape=(value,name,expected)=>{if(!sameShape(value.shape,expected))reject('UNSUPPORTED_SHAPE',name+' requires shape ['+expected.join(',')+']','operator-shape-extension');};
 const identity=(value,name,expected)=>{if(value.modelSha256!==expected)reject('MODEL_IDENTITY_MISMATCH',name+' requires the known producer model identity','producer-model-binding');};
 const text=(value,name,strict=false)=>{
  dtype(value,name);field(value,name,'layout','BLC');field(value,name,'meaning','text_hidden_states');
  const s=value.shape;if(!Array.isArray(s)||s.length!==3||s[0]!==1||s[2]!==P4_SHAPES.textWidth||!Number.isSafeInteger(s[1])||s[1]<P4_SHAPES.textRows[0]||s[1]>P4_SHAPES.textRows[1])reject('UNSUPPORTED_SHAPE',name+' requires BLC [1,L,4096] with integer 1<=L<=512','text-sequence-extension');
  identity(value,name,WAN_TEXT_ENCODER_SHA256);
  if(strict||value.normalization!==undefined){if(!(strict&&value.normalization==='encoder-final-rmsnorm'))field(value,name,'normalization','umt5-final-rmsnorm-f32-v1');}
  if(strict&&value.tokenizerSha256!==P4_TEXT_TOKENIZER_SHA256)reject('TOKENIZER_IDENTITY_MISMATCH',name+' requires the known Text tokenizer identity; missing provenance is rejected','tokenizer-binding');
 };
 if(operation==='postSelfAttention'){
  if(model===undefined)reject('UNSUPPORTED_MODEL','postSelfAttention requires an explicit HIGH or LOW model','model-selection');
  if(request.blockIndex!==undefined&&request.blockIndex!==P4_SHAPES.blockIndex)reject('UNSUPPORTED_BLOCK','Only block0 post-self-attention is implemented','additional-transformer-blocks');
  for(const name of ['residual','timeAct1']){const value=read(name);if(!value)continue;const expected=P4_INPUT_SEMANTICS[name];dtype(value,name);shape(value,name,expected.shape);for(const key of ['layout','meaning','normalization'])field(value,name,key,expected[key]);}
  const conditioning=read('conditioning');if(conditioning)text(conditioning,'conditioning',true);
  return result();
 }
 if(operation==='schedule'){
  if(request.profile!==SCHEDULE_PROFILE)reject('UNSUPPORTED_PROFILE','Only '+SCHEDULE_PROFILE+' is implemented','scheduler-profile');
  return result();
 }
 if(operation==='validateConditioning'){const value=read('tensor');if(value)text(value,'tensor');return result();}
 if(MEAN.includes(operation)){
  const value=read('tensor');if(!value)return result();dtype(value,'tensor');field(value,'tensor','layout','NCTHW');identity(value,'tensor',WAN21_VAE_SHA256);
  const profile=RAW_PROFILES.find(p=>sameShape(value.shape,p.shape));
  if(!profile)reject('UNSUPPORTED_SHAPE','Only the three published Wan21 posterior-mean shape profiles are implemented','posterior-mean-shape-profile');
  else if(value.profileId!==undefined&&value.profileId!==profile.id)reject('UNSUPPORTED_PROFILE','Posterior-mean profile ID and dimensions differ','posterior-mean-profile-binding');
  const restored=operation==='restoreRawMean';field(value,'tensor','meaning',restored?NORMALIZED_MEAN:'raw-posterior-mean');
  const strictRaw=true;
  if(restored){if(value.normalization!==undefined)field(value,'tensor','normalization',NORMALIZATION);}
  else if(strictRaw&&value.normalization!==undefined)reject('UNSUPPORTED_NORMALIZATION','This raw posterior-mean operation requires the normalization marker to be absent','posterior-mean-normalization');
  if(value.latentContract!==undefined&&(restored||strictRaw))reject('SEMANTIC_MISMATCH','Generated samples are not posterior means','generated-sample-restoration');
  if(value.attentionMask!==undefined)reject('SEMANTIC_MISMATCH','Posterior means cannot carry a Text mask','tensor-contract');
  return result();
 }
 if(Object.hasOwn(POINTWISE,operation)){
  let first;
  for(const name of POINTWISE[operation]){
   const value=read(name);if(!value)continue;dtype(value,name);const s=value.shape;
   const emptyEuler=operation==='eulerStep'&&sameShape(s,[0]);
   if(!emptyEuler&&(!Array.isArray(s)||s.length<1||s.length>8||s.some(n=>!Number.isSafeInteger(n)||n<1))){reject('UNSUPPORTED_SHAPE',name+' requires 1..8 positive safe tensor dimensions, or [0] for empty Euler input','tensor-shape');continue;}
   let count=1;for(const n of s){count*=n;if(!Number.isSafeInteger(count)||count>POINTWISE_MAX_ELEMENTS){reject('TENSOR_BUDGET_EXCEEDED',name+' exceeds '+POINTWISE_MAX_ELEMENTS+' elements','pointwise-capacity');break;}}
   if(first&&!sameShape(s,first))reject('UNSUPPORTED_SHAPE','Pointwise input shapes must match','explicit-tensor-conversion');else if(!first)first=s;
  }
  return result();
 }
 if(operation==='linearProjection'||operation==='linearProjectionF32'){
  for(const [name,expectedShape,expectedType] of [[operation==='linearProjection'?'q':'weight',[16,5120],operation==='linearProjection'?'uint8':'float32'],['x',[5120],'float32'],['bias',[16],'float32']]){const value=read(name);if(value){dtype(value,name,expectedType);shape(value,name,expectedShape);}}
 }
 return result();
}

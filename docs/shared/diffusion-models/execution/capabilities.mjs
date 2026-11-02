import {BASE_MODEL_HASHES,LORA_LIMITS} from '../lora/weights.mjs';
import {WAN_TEXT_ENCODER_SHA256,WAN21_VAE_SHA256,WAN21_RAW_PROFILE,WAN21_RAW_F1_PROFILE,WAN21_RAW_RECT_PROFILE} from '../tensor-interop.mjs';
import {NORMALIZED_MEAN,NORMALIZATION} from '../latent-space/latent-space.mjs';
import {PROFILE as SCHEDULE_PROFILE} from '../scheduler/scheduler-kernel.mjs';
import {deriveWorkflowShapes,BERNINI_WORKFLOW_RULE_ID} from '../../ai-connection/workflow-shapes.mjs';
import {MODEL_CANDIDATE_LIMITS} from './model-candidate.mjs';
import {GENERATED_MAX_ELEMENTS,GENERATED_MODEL_LATENT,GENERATED_RAW_SAMPLE} from './generated-space.mjs';

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
const ADMIN=['capabilities','inspect','inspectLora','loadLora','listLoras','readLora','readLoraSource','unloadLora','cancel','dispose','unload','modelStatus','saveTensor','readTensor'];
const POINTWISE={noiseMix:['noise','latent'],inverseNoiseScale:['latent'],flowDenoised:['input','velocity'],eulerStep:['latent','denoised']};
const MEAN=['validateRawLatent','normalizeRawMean','restoreRawMean'];
const MODEL=['load','predict','sample'];
const KNOWN=new Set([...ADMIN,...Object.keys(POINTWISE),...MEAN,...MODEL,'schedule','validateConditioning','linearProjection','linearProjectionF32','postSelfAttention']);
const sameShape=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&b.every((n,i)=>{const d=Object.getOwnPropertyDescriptor(a,String(i));return d&&Object.hasOwn(d,'value')&&d.value===n;});
const tensor=(shape,layout,meaning,normalization)=>({dtype:'float32',shape,layout,meaning,...(normalization!==undefined?{normalization}:{})});
const clone=value=>structuredClone(value);
const modelPlanning=()=>({kind:'allocation-planning-cap-only',maxSequenceTokens:MODEL_CANDIDATE_LIMITS.maxSequenceTokens,hostHiddenStoreCount:MODEL_CANDIDATE_LIMITS.hostHiddenStoreCount,hostHiddenStoreDtype:'float32',hiddenWidth:MODEL_CANDIDATE_LIMITS.hiddenWidth,maxHiddenStoreBytesExclusive:MODEL_CANDIDATE_LIMITS.maxHiddenStoreBytesExclusive,aggregatePeakMeasured:false,validatedInputDomain:false});
const modelText=()=>({...clone(P4_INPUT_SEMANTICS.conditioning),textRows:[1,512],normalizationAliases:[],attentionMask:{dtype:'uint8',shape:['L'],values:[0,1],requiresActivePosition:true,maskedRowsMustBeZero:true,softmax:'provenance-only; every supplied Text row participates'}});

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
 const modelCommon={available:true,implemented:true,executableRoute:true,transport:['dedicated-worker','message-port'],acceptedProduction:false,generationReady:false,confirmedPublicInputDomains:[],numericalAcceptance:'NOT_ESTABLISHED',validation:'Runtime structure/finite-value admission is separate from independent numerical and resource acceptance'};
 operations.load={...modelCommon,kind:'staged-model-preparation',requiredModels:['HIGH','LOW'],descriptor:{models:{HIGH:{modelSha256:BASE_MODEL_HASHES.HIGH},LOW:{modelSha256:BASE_MODEL_HASHES.LOW}}},runtimeInput:'files.HIGH and files.LOW must be original immutable File/Blob objects; this metadata check does not inspect files',storageDtype:['F8_E4M3','F16'],computeDtype:'float32',resource:{wasmThreads:[1,4],default:1,thread4RequiresCrossOriginIsolation:true,freshRealmRequiredForProfileChange:true},legacySingleFile:'Header inspection only; MODEL_PAIR_REQUIRED/NOT_READY'};
 for(const name of ['predict','sample'])operations[name]={...modelCommon,kind:name==='predict'?'complete-model-route':'complete-sampler-route',requiresLoadedModelPair:true,shapeAuthority:'deriveWorkflowShapes',workflowRuleId:BERNINI_WORKFLOW_RULE_ID,descriptor:{shapeRequest:'explicit shared workflow metadata',inputs:{tensors:'ordered target then all canonical context tensor metadata',...(name==='predict'?{conditioning:'canonical Text tensor metadata',timestep:'request.timestep in0..1000'}:{noise:'explicit float32 target-shape metadata',positive:'canonical Text tensor metadata',negative:'canonical Text tensor metadata'})}},geometry:{batch:1,latentChannels:16,patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',concatOrder:'target-first',padding:'unsupported; all patch tails must be zero'},contexts:{population:'complete explicit shared shapeRequest media population',order:'source -> reference_video -> original reference-slot order -> each frame order',sourceIds:'shared deriveWorkflowShapes target0 and ordered contexts1+',predictMeaning:NORMALIZED_MEAN,sampleAdditionalMeaning:'raw-posterior-mean normalized by generated-space owner with the known VAE identity'},conditioning:modelText(),computeDtype:'float32',blocks:40,attention:{heads:40,headDim:128,queryTile:128,keyTile:256,allQueriesKeysAndHeads:true},planning:modelPlanning(),loraApplied:false,...(name==='predict'?{modelSides:['HIGH','LOW'],output:{...tensor([1,16,null,null,null],'NCTHW','bernini-flow-velocity:v1'),space:'model'}}:{targetMaxElements:GENERATED_MAX_ELEMENTS,noise:'explicit compact nonshared finite F32; no seed/RNG callback',schedule:{profile:SCHEDULE_PROFILE,sampler:'Euler',steps:6,shift:5,splitStep:3,sides:['HIGH','HIGH','HIGH','LOW','LOW','LOW'],cfg:1,negativePass:'validated; no neural negative pass at CFG1'},output:{...tensor([1,16,null,null,null],'NCTHW',GENERATED_RAW_SAMPLE),space:'raw',latentContract:{representation:'generated-sample',space:'raw',normalization:{id:NORMALIZATION,state:'restored',owner:'diffusion_models'}}}})};
 const controls={
  prepareP4:{available:true,transport:['direct','message-port'],input:'local immutable Blob and explicit model side',creates:'owned-idle-p4-execution'},
  runP4:{available:true,transport:['direct','message-port'],executionOperation:'postSelfAttention',request:'canonical execution descriptor and typed payload; not a checkExecutionSupport operation alias'},
  releaseP4:{available:true,transport:['direct','message-port'],releases:'owned-p4-execution'},
  checkSupport:{available:true,transport:['direct','message-port'],request:'canonical execution descriptor',execution:false}
 };
 return clone({schemaVersion:'diffusion-execution-capabilities/0.1',protocolVersion:'diffusion-models/0.1',models:BASE_MODEL_HASHES,operations,controls,pointwiseMaxTensorElements:POINTWISE_MAX_ELEMENTS,loraLimits:LORA_LIMITS,modelRoutesImplemented:true,confirmedPublicInputDomains:[],acceptedProduction:false,modelInference:false,generationReady:false,scope:'Implemented routes and structural allocation-planning limits; metadata admission does not establish numerical or aggregate resource acceptance.'});
}

/** Check declared compatibility, without treating metadata as execution evidence. */
export function checkExecutionSupport(request={}){
 const reasons=[];
 const reject=(code,message,requiredExtension)=>reasons.push({code,message,requiredExtension});
 const operation=request?.operation;
 let modelStructure=null;
 const result=()=>({schemaVersion:'diffusion-execution-support/0.1',operation:typeof operation==='string'?operation:null,supported:reasons.length===0,reasons,modelInference:false,generationReady:false,validation:'metadata-only',...(MODEL.includes(operation)?{implemented:true,executableRoute:true,structurallyAdmitted:reasons.length===0,supportKind:'structural-admission-only',numericallyAccepted:false,acceptedProduction:false,confirmedPublicInputDomains:[],runtimeChecks:['loaded HIGH/LOW pair, authenticated header/model binding, compact nonshared finite tensor payloads, mask values/active position/masked-row zeros, cancellation and actual resource availability'],...(modelStructure?{structure:modelStructure}:{})}:{})});
 if(!request||typeof request!=='object'||Array.isArray(request)){reject('INVALID_DESCRIPTOR','An execution request descriptor is required','execution-request-descriptor');return result();}
 if(!KNOWN.has(operation)){reject('UNSUPPORTED_OPERATION','The requested operation is not implemented','new-operation');return result();}
 const model=request.model;
 if(model!==undefined){
  if(!model||typeof model!=='object'||!Object.hasOwn(BASE_MODEL_HASHES,model.side))reject('UNSUPPORTED_MODEL','Select the implemented HIGH or LOW Bernini model','model-implementation');
  else if(model.modelSha256!==undefined&&model.modelSha256!==BASE_MODEL_HASHES[model.side])reject('MODEL_IDENTITY_MISMATCH','The declared model hash does not match its selected side','model-binding');
 }
 if(!MODEL.includes(operation)&&request.contextLatents!==undefined&&(!Array.isArray(request.contextLatents)||request.contextLatents.length))reject('UNSUPPORTED_CONTEXT','This execution entry has no context-latent path','context-latents');
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
 if(operation==='load'){
  const pair=request.models;
  if(!pair||typeof pair!=='object'||Array.isArray(pair)||['HIGH','LOW'].some(side=>!pair[side]||typeof pair[side]!=='object'||Array.isArray(pair[side])))reject('MODEL_PAIR_REQUIRED','load requires models.HIGH and models.LOW metadata; actual files are checked only by runtime load','paired-model-descriptor');
  else for(const side of ['HIGH','LOW']){
   const entry=pair[side];
   if(entry.side!==undefined&&entry.side!==side||entry.modelSha256!==undefined&&entry.modelSha256!==BASE_MODEL_HASHES[side])reject('MODEL_IDENTITY_MISMATCH','The '+side+' descriptor differs from the original model binding','model-binding');
  }
  const threads=request.resource?.wasmThreads??1;
  if(![1,4].includes(threads))reject('UNSUPPORTED_RESOURCE_CONFIG','wasmThreads must be1 or explicit4 with cross-origin isolation','resource-profile');
  modelStructure={modelSides:['HIGH','LOW'],wasmThreads:threads,requiresLoadedModelPair:false,runtimeFileValidation:true,requiredEnvironment:threads===4?['crossOriginIsolated','SharedArrayBuffer','Worker','fresh ORT realm']:['dedicated Worker']};
  return result();
 }
 if(operation==='predict'||operation==='sample'){
  if(operation==='predict'&&model===undefined)reject('UNSUPPORTED_MODEL','predict requires model.side HIGH or LOW','model-selection');
  let canonical=null;
  if(!request.shapeRequest||typeof request.shapeRequest!=='object'||!Object.hasOwn(request.shapeRequest,'semantics'))reject('MISSING_SHAPE_REQUEST','Explicit shapeRequest and owner-declared semantics are required','shared-workflow-shape-descriptor');
  else try{canonical=deriveWorkflowShapes(request.shapeRequest);}catch(error){reject('INVALID_SHAPE_REQUEST',String(error.message??error),'shared-workflow-shape-descriptor');}
  const fullText=(value,name)=>{
   text(value,name,true);field(value,name,'normalization','umt5-final-rmsnorm-f32-v1');
   const mask=value.attentionMask;
   if(!mask||typeof mask!=='object'||Array.isArray(mask)){reject('MISSING_MASK','Full-model conditioning requires attentionMask metadata {dtype:uint8,shape:[L]}','text-mask-descriptor');return;}
   dtype(mask,name+'.attentionMask','uint8');shape(mask,name+'.attentionMask',[value.shape?.[1]]);
  };
  for(const name of operation==='predict'?['conditioning']:['positive','negative']){const value=read(name);if(value)fullText(value,name);}
  if(operation==='predict'&&(typeof request.timestep!=='number'||!Number.isFinite(request.timestep)||request.timestep<0||request.timestep>1000))reject('UNSUPPORTED_TIMESTEP','predict requires finite request.timestep in0..1000','timestep-descriptor');
  if(!canonical)return result();
  const g=canonical.geometry,contexts=canonical.orderedContexts.entries,total=canonical.concatenation.totalTokens;
  if(!sameShape(g.patchSize,[1,2,2])||g.hiddenSize!==5120||g.latentChannels!==16||!['F32','float32'].includes(g.dtype))reject('UNSUPPORTED_GEOMETRY','The sequence owner requires F32, C16, patch[1,2,2] and hidden5120','sequence-geometry');
  if(!canonical.orderedContexts.complete||total===null||!sameShape(canonical.concatenation.shapePerBatch,[1,total,5120]))reject('INCOMPLETE_CONTEXT','Complete canonical context population and target-first batch1 concatenation are required','shared-context-population');
  const ids=['target.latent',...contexts.map(entry=>entry.contextKey+'.latent')],byId=new Map(canonical.requirements.map(value=>[value.requirementId,value])),requirements=ids.map(id=>byId.get(id));
  for(let index=0;index<ids.length;index++){
   const requirement=requirements[index],tokens=byId.get(ids[index].slice(0,-7)+'.tokens');
   if(requirement?.state!=='known'||tokens?.state!=='known'){reject('UNKNOWN_SHAPE','Canonical latent and token shapes must be known for '+ids[index],'shared-workflow-shape-descriptor');continue;}
   if(tokens.padding?.tail?.some(value=>value!==0))reject('UNSUPPORTED_PADDING','Odd latent dimensions require core padding support; padding is not implemented for '+ids[index],'sequence-padding');
   if(requirement.shape[0]!==1||requirement.shape[1]!==16)reject('UNSUPPORTED_GEOMETRY','Every sequence stream requires batch1 and C16','sequence-geometry');
   if(requirement.dtype!=='float32')reject('UNSUPPORTED_DTYPE','Canonical latent requirements must declare float32','dtype-declaration');
   if(requirement.meaning!==(index===0?GENERATED_MODEL_LATENT:NORMALIZED_MEAN)||requirement.normalization!==NORMALIZATION)reject('SEMANTIC_MISMATCH','Canonical target/context meaning and normalization differ for '+ids[index],'latent-semantic-declaration');
   const sourceId=index===0?canonical.concatenation.targetSourceId:contexts[index-1].sourceId;
   if(!Number.isSafeInteger(sourceId)||sourceId<0||sourceId>16777216)reject('UNSUPPORTED_SOURCE_ID','The sequence source ID must be exactly representable for '+ids[index],'sequence-coordinate-extension');
  }
  const plannedStore=total===null?null:total*MODEL_CANDIDATE_LIMITS.hiddenWidth*4;
  if(total!==null&&(total>MODEL_CANDIDATE_LIMITS.maxSequenceTokens||plannedStore>=MODEL_CANDIDATE_LIMITS.maxHiddenStoreBytesExclusive))reject('RESOURCE_BUDGET','The complete sequence exceeds the selected conservative allocation planning cap; this is not a numerical domain limit','execution-resource-configuration');
  const target=requirements[0],elements=target?.shape?.reduce((a,b)=>a*b,1);
  if(operation==='sample'){
   if(elements>GENERATED_MAX_ELEMENTS)reject('GENERATED_TENSOR_BUDGET_EXCEEDED','Sample target exceeds generated-space/pointwise capacity of '+GENERATED_MAX_ELEMENTS+' elements','generated-space-capacity');
   const noise=read('noise');if(noise){dtype(noise,'noise');if(target?.shape)shape(noise,'noise',target.shape);}
  }
  const tensors=inputs?.tensors;
  if(tensors===undefined&&operation==='sample'&&!contexts.length){/* Runtime creates the zero target before explicit-noise mixing. */}
  else if(!Array.isArray(tensors)||tensors.length!==ids.length)reject('MISSING_INPUT','inputs.tensors must describe exactly target then all canonical ordered contexts','ordered-tensor-descriptors');
  else for(let index=0;index<ids.length;index++){
   const entry=Object.getOwnPropertyDescriptor(tensors,String(index)),value=entry&&Object.hasOwn(entry,'value')?entry.value:null,requirement=requirements[index];
   if(!value||typeof value!=='object'||Array.isArray(value)){reject('MISSING_INPUT','Missing tensor descriptor: '+ids[index],'ordered-tensor-descriptors');continue;}
   if(value.requirementId!==ids[index])reject('CONTEXT_ORDER_MISMATCH','Tensor descriptors must follow the shared canonical order; expected '+ids[index],'ordered-tensor-binding');
   dtype(value,ids[index]);if(requirement?.shape)shape(value,ids[index],requirement.shape);
   if(value.layout!==undefined)field(value,ids[index],'layout','NCTHW');
   if(value.axes!==undefined&&!sameShape(value.axes,['N','C','T','H','W']))reject('UNSUPPORTED_LAYOUT','Latent axes must be N,C,T,H,W','tensor-contract');
   const raw=operation==='sample'&&index>0&&value.meaning==='raw-posterior-mean';
   if(raw){
    if(value.normalization!==undefined)reject('UNSUPPORTED_NORMALIZATION','Raw sample contexts require an absent normalization marker','posterior-mean-normalization');
    identity(value,ids[index],WAN21_VAE_SHA256);
    if(requirement?.shape?.reduce((a,b)=>a*b,1)>GENERATED_MAX_ELEMENTS)reject('GENERATED_TENSOR_BUDGET_EXCEEDED','Raw context normalization exceeds generated-space capacity','generated-space-capacity');
    if(value.profileId!==undefined&&!RAW_PROFILES.some(profile=>profile.id===value.profileId&&sameShape(value.shape,profile.shape)))reject('UNSUPPORTED_PROFILE','Raw context profile ID must identify its exact published shape','posterior-mean-profile-binding');
   }else{field(value,ids[index],'meaning',index===0?GENERATED_MODEL_LATENT:NORMALIZED_MEAN);field(value,ids[index],'normalization',NORMALIZATION);}
   if(operation==='sample'){
    if(['values','attentionMask','mask','noiseMask','denoiseMask','latentContract'].some(key=>value[key]!==undefined))reject('SEMANTIC_MISMATCH','Sample inputs cannot carry alternate payloads, masks or restored latent contracts','latent-input-contract');
    if(index===0&&value.profileId!==undefined)reject('UNSUPPORTED_PROFILE','Generated targets cannot use a posterior-mean profile','generated-target-contract');
    if(value.byteLength!==undefined&&requirement?.shape&&value.byteLength!==requirement.shape.reduce((a,b)=>a*b,1)*4)reject('UNSUPPORTED_SHAPE','Declared latent byteLength differs from canonical F32 storage','tensor-contract');
   }
  }
  if(request.contextLatents!==undefined){
   if(!Array.isArray(request.contextLatents)||request.contextLatents.length!==contexts.length)reject('CONTEXT_ORDER_MISMATCH','Optional contextLatents metadata must match the shared canonical population','ordered-context-descriptor');
   else for(let index=0;index<contexts.length;index++){const value=request.contextLatents[index],expected=requirements[index+1];if(value?.shape!==undefined&&!sameShape(value.shape,expected?.shape)||value?.requirementId!==undefined&&value.requirementId!==ids[index+1])reject('CONTEXT_ORDER_MISMATCH','Optional contextLatents metadata differs from canonical order/shape','ordered-context-descriptor');}
  }
  modelStructure={shapeAuthority:'deriveWorkflowShapes',ruleId:canonical.ruleId,targetShape:clone(target?.shape??null),targetTokens:canonical.target.tokenCount,totalTokens:total,contextTokens:canonical.concatenation.contextTokens,orderedContextKeys:contexts.map(entry=>entry.contextKey),orderedSourceIds:contexts.map(entry=>entry.sourceId),planning:{...modelPlanning(),plannedHiddenStoreBytes:plannedStore,plannedFourHiddenStoreBytes:plannedStore===null?null:plannedStore*4},issues:clone(canonical.issues)};
  return result();
 }
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

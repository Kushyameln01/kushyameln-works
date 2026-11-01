import {freeze} from './planner.mjs';
import {Sha256} from '../../vr180/sha256.mjs';
export const P4_PROFILE='bernini-block0-n2-cross-ffn-f32-candidate-v1';
export const P4_GRAPH_SHA256='9c3bbaf2488a763ab56a96a8f5ddfc65510bf197799ed83b9f6ead512cf7a52e';
export const P4_SOURCE_COMMIT='7ee36228030ba3bb544a90b1d4b528702a7bae32';
const HEX=/^[a-f0-9]{64}$/;
const MODELS={HIGH:['9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52','d8aec897e3af480492d7eca7b57141ea968e89cde7f46ea7886db11754ebd6e3'],LOW:['ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3','286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b']};
export const p4Fail=(code,message)=>{throw Object.assign(Error(message),{code});};
export function canonicalP4JSON(v,seen=new Set()){
 if(v===null||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(typeof v==='string'&&v.isWellFormed())return JSON.stringify(v);
 if(v&&typeof v==='object'&&!seen.has(v)){
  seen.add(v);let result;
  if(Array.isArray(v)){if(Reflect.ownKeys(v).length!==v.length+1||Array.from({length:v.length},(_,i)=>i).some(i=>!Object.hasOwn(v,i)))p4Fail('INVALID_NATIVE_REGISTRY','Dense JSON array required');result='['+v.map(x=>canonicalP4JSON(x,seen)).join(',')+']';}
  else if(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null){const keys=Reflect.ownKeys(v);if(keys.some(k=>typeof k!=='string'||!Object.getOwnPropertyDescriptor(v,k).enumerable||Object.getOwnPropertyDescriptor(v,k).get||Object.getOwnPropertyDescriptor(v,k).set))p4Fail('INVALID_NATIVE_REGISTRY','Plain JSON data required');result='{'+keys.sort().map(k=>canonicalP4JSON(k,seen)+':'+canonicalP4JSON(v[k],seen)).join(',')+'}';}
  else p4Fail('INVALID_NATIVE_REGISTRY','JSON-only descriptor required');seen.delete(v);return result;
 }
 p4Fail('INVALID_NATIVE_REGISTRY','Finite acyclic JSON-only descriptor required');
}
export const p4Equal=(a,b)=>canonicalP4JSON(a)===canonicalP4JSON(b);
export function p4Hash(value){const h=new Sha256();h.update(new TextEncoder().encode(canonicalP4JSON(value)));return h.digestHex();}
const baseSpecs={};
for(const [stem,shape,dtype]of [['text_embedding.0',[5120,4096],'F16'],['text_embedding.2',[5120,5120],'F16'],...['q','k','v','o'].map(k=>['blocks.0.cross_attn.'+k,[5120,5120],k==='o'?'F16':'F8_E4M3']),['blocks.0.ffn.0',[13824,5120],'F8_E4M3'],['blocks.0.ffn.2',[5120,13824],'F8_E4M3']]){
 baseSpecs[stem+'.weight']={shape,dtype,columns:shape[1],allowed:[0,shape[0]],maxRows:stem==='blocks.0.ffn.2'?4:16};baseSpecs[stem+'.bias']={shape:[shape[0]],dtype:'F16',columns:null,allowed:[0,shape[0]]};
}
for(const k of ['blocks.0.norm3.weight','blocks.0.norm3.bias','blocks.0.cross_attn.norm_q.weight','blocks.0.cross_attn.norm_k.weight'])baseSpecs[k]={shape:[5120],dtype:'F16',columns:null,allowed:[0,5120]};
baseSpecs['time_projection.1.weight']={shape:[30720,5120],dtype:'F16',columns:5120,allowed:[15360,30720],maxRows:16};baseSpecs['time_projection.1.bias']={shape:[30720],dtype:'F16',columns:null,allowed:[15360,30720]};baseSpecs['blocks.0.modulation']={shape:[1,6,5120],dtype:'F16',columns:null,allowed:[15360,30720]};
function operatorBinding(key,columns){
 if(columns)return {programSlot:key,graphInput:'weight',operator:key.slice(0,-7)};
 if(key.startsWith('blocks.0.norm3.'))return {programSlot:key,hikeExport:'Norm',hikeParameter:key.endsWith('.bias')?'bias':'weight',operator:'norm3-affine-layernorm'};
 if(key.startsWith('blocks.0.cross_attn.norm_'))return {programSlot:key,hikeExport:'Norm',hikeParameter:'weight',operator:key.slice(0,-7)};
 if(key==='blocks.0.modulation')return {programSlot:key,hikeExport:'Add',hikeParameter:'x',operator:'ffn-modulation-chunks3-5'};
 return {programSlot:key,hikeExport:'AddBias',hikeParameter:'bias',operator:key.slice(0,-5)};
}
function entry(e,key,s,fileBytes){
 if(!e||e.originalKey!==key||e.weightId!==key||e.key!=='diffusion_model.'+key||!p4Equal(e.fullShape,s.shape)||e.storageDtype!==s.dtype||e.computeDtype!=='F32'||e.layout!=='row-major'||e.columns!==s.columns||!p4Equal(e.binding,{kind:s.columns?'runtime-input':'hike-parameter',name:key})||!p4Equal(e.transform,{kind:'identity',transpose:false})||!p4Equal(e.operatorBinding,operatorBinding(key,s.columns))||!Number.isSafeInteger(e.absoluteByteOffset)||e.absoluteByteOffset<8||e.byteLength!==s.shape.reduce((a,b)=>a*b,1)*(s.dtype==='F8_E4M3'?1:2)||e.absoluteByteOffset>fileBytes-e.byteLength)p4Fail('INVALID_NATIVE_BINDING','P4 original source identity/shape/storage/binding mismatch: '+key);
 if(s.columns?e.maxRows!==s.maxRows||!p4Equal(e.allowedRows,s.allowed)||e.operatorBinding.graphInput!=='weight':!p4Equal(e.allowedElements,s.allowed))p4Fail('INVALID_NATIVE_BINDING','P4 original row/element mapping mismatch: '+key);
 if(s.dtype==='F8_E4M3'){
  const stem=key.slice(0,-7),scale=e.scaleSource,quant=e.quantConfigSource;
  if(e.fp8ProfileId!=='scaled-e4m3fn-scalar-f32-v1'||!HEX.test(e.scaleSHA256)||!HEX.test(e.quantConfigSHA256)||scale?.originalKey!==stem+'.weight_scale'||scale.storageDtype!=='F32'||!p4Equal(scale.fullShape,[])||scale.byteLength!==4||quant?.originalKey!==stem+'.comfy_quant'||quant.storageDtype!=='U8'||!p4Equal(quant.fullShape,[27])||quant.byteLength!==27||![scale,quant].every(v=>Number.isSafeInteger(v.absoluteByteOffset)&&v.absoluteByteOffset>=8&&v.absoluteByteOffset<=fileBytes-v.byteLength))p4Fail('INVALID_NATIVE_BINDING','P4 FP8 scale/quant source identity mismatch: '+key);
 }else if(e.fp8ProfileId!==null)p4Fail('INVALID_NATIVE_BINDING','Unexpected FP8 profile for F16 source');
}
export function validateP4NativeRegistry(input){
 canonicalP4JSON(input);const r=structuredClone(input),model=MODELS[r.side],o=r.original;
 if(r.schemaVersion!=='bernini-p4-f32-feed-registry/0.1'||r.scope!=='PARTIAL'||r.completeAdapter!==false||r.generationReady!==false||r.executionProfileId!==P4_PROFILE||!model||r.modelHash!==model[0]||r.graphHash!==P4_GRAPH_SHA256||!HEX.test(r.registryHash)||!o||o.schemaVersion!=='bernini-p4-original-weights/0.1'||o.executionProfileId!==P4_PROFILE||o.side!==r.side||o.modelHash!==r.modelHash||o.graphHash!==r.graphHash||o.headerSHA256!==model[1]||o.fileBytes!==15574833216||o.bridgeWasmSHA256!=='ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd'||o.fullFileSHA256Verified!==false||o.fullFileHashRecomputed!==false||o.modelHashRole!=='expected-original-full-hash-not-current-reauthentication'||o.packageHash!==null)p4Fail('INVALID_NATIVE_REGISTRY','Fixed Bernini P4 model/profile/graph/source identity required');
 if(!p4Equal(Object.keys(o.entries??{}).sort(),Object.keys(baseSpecs).sort()))p4Fail('INVALID_NATIVE_REGISTRY','Complete P4 original source entry set required');
 for(const [key,s]of Object.entries(baseSpecs))entry(o.entries[key],key,s,o.fileBytes);
 const stems=[...['q','k','v','o'].map(k=>'blocks.0.cross_attn.'+k),'blocks.0.ffn.0','blocks.0.ffn.2'];
 if(r.targets?.length===16)stems.push('text_embedding.0','text_embedding.2');else if(r.targets?.length!==12)p4Fail('INVALID_NATIVE_REGISTRY','Explicit complete native P4 target set required');
 const expected=stems.flatMap(k=>['weight','bias'].map(role=>({...structuredClone(o.entries[k+'.'+role]),parameterRole:role,dtype:'F32',shape:[...o.entries[k+'.'+role].fullShape],transform:{kind:'identity'},patchCoordinates:'full-original-elements',unchangedRanges:'immutable-base-pass-through'})));
 if(!p4Equal(r.targets,expected)||!p4Equal(r.coverage,{fullModel:false,kind:'explicit-sparse-final-f32-ranges',unselectedTargets:'immutable-base-pass-through',unselectedRows:'immutable-base-pass-through',canonicalLoraAdapterExtension:'PENDING'})||!p4Equal(r.validationGate,{id:'p4-cross-ffn-composed-f32-v1',absolute:0.01,relative:0.001,scope:'composed-new-stage-only'})||!p4Equal(r.resourceLimits,{maxBlockElements:81920,maxPatchBytes:16777216,maxRetainedPatchBytes:67108864,maxPackages:4,maxCandidates:4,maxReadLeases:16,maxTransactions:4}))p4Fail('INVALID_NATIVE_REGISTRY','Fixed P4 target/binding/coverage/gate/resource registry required');
 const {registryHash,...descriptor}=r;if(p4Hash(descriptor)!==registryHash)p4Fail('REGISTRY_INTEGRITY_ERROR','P4 native registry hash mismatch');return freeze(r);
}

import {inspectSafetensors} from '../api/safetensors.mjs';
import {sha256Blob} from '../../vr180/sha256.mjs';
import {BERNINI_TARGETS,resolveLoraTarget,resolveLoraBiasTarget} from './targets.mjs';

export const LORA_LIMITS=Object.freeze({maxHeaderBytes:8*1024*1024,maxReadBytes:4*1024*1024,hashChunkBytes:1024*1024,maxJsonDepth:32});
export const BASE_MODEL_HASHES=Object.freeze({HIGH:'9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52',LOW:'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3'});
const SCHEMA='comfy-wan-lora-io/1',WIDTH=Object.freeze({F16:2,BF16:2,F32:4});
const fail=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
function hashString(value,code='INVALID_LORA_BINDING') {if(typeof value!=='string'||!/^[a-f0-9]{64}$/i.test(value))fail(code,'Expected SHA-256');return value.toLowerCase();}
export function validateLoraBinding(options){
 if(!options||typeof options!=='object')fail('INVALID_LORA_BINDING','Expected stage/strength/base hash');
 const {stage,strength,baseModelSha256,expectedFileSHA256}=options;
 if(typeof stage!=='string'||!Object.hasOwn(BASE_MODEL_HASHES,stage)||typeof strength!=='number'||!Number.isFinite(strength))fail('INVALID_LORA_BINDING','Explicit HIGH/LOW and finite numeric strength required');
 const base=hashString(baseModelSha256);
 if(base!==BASE_MODEL_HASHES[stage])fail('INVALID_LORA_BINDING','Base model hash does not match selected stage');
 const out={stage,strength,baseModelSha256:base};
 if(expectedFileSHA256!==undefined)out.expectedFileSHA256=hashString(expectedFileSHA256);
 return Object.freeze(out);
}
function finiteBytes(data,dtype){
 const width=WIDTH[dtype],view=new DataView(data.buffer,data.byteOffset,data.byteLength);
 if(!width||data.byteLength%width)fail('INVALID_LORA','Invalid stored dtype byte length');
 for(let at=0;at<data.byteLength;at+=width){
  const bits=width===4?view.getUint32(at,true):view.getUint16(at,true);
  if(dtype==='F32'?(bits&0x7f800000)===0x7f800000:dtype==='BF16'?(bits&0x7f80)===0x7f80:(bits&0x7c00)===0x7c00)fail('INVALID_LORA','Nonfinite stored tensor value');
 }
}
async function exact(file,start,length){
 const bytes=new Uint8Array(await file.slice(start,start+length).arrayBuffer());
 if(bytes.length!==length)fail('INVALID_LORA','Short or oversized file read');return bytes;
}
function scalar(data,dtype){
 finiteBytes(data,dtype);const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
 if(dtype==='F32')return view.getFloat32(0,true);
 if(dtype==='BF16'){const raw=new DataView(new ArrayBuffer(4));raw.setUint32(0,view.getUint16(0,true)*65536,true);return raw.getFloat32(0,true);}
 const bits=view.getUint16(0,true),sign=bits&0x8000?-1:1,exponent=(bits>>>10)&31,mantissa=bits&1023;
 return sign*(exponent===0?mantissa*2**-24:(1+mantissa/1024)*2**(exponent-15));
}
async function inspect(file){
 try{return await inspectSafetensors(file,{rejectDuplicateKeys:true});}
 catch(error){if(error.code?.startsWith('LORA_'))throw error;fail('INVALID_LORA',String(error.message??error));}
}
const equalShape=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export async function inspectLoraFile(file){
 const header=await inspect(file),groups=new Map();
 if(!header.tensors.length)fail('INVALID_LORA','No LoRA tensors');
 for(const tensor of header.tensors){
  if(!Object.hasOwn(WIDTH,tensor.dtype))fail('UNSUPPORTED_LORA','Supported stored dtypes are F16/BF16/F32');
  let stem,kind,dialect;
  for(const [suffix,k,d]of [['.lora_down.weight','down','downUp'],['.lora_up.weight','up','downUp'],['.lora_A.weight','down','AB'],['.lora_B.weight','up','AB'],['.alpha','alpha',null],['.diff_b','bias',null],['.diff','diff',null]]){
   if(tensor.name.endsWith(suffix)){stem=tensor.name.slice(0,-suffix.length);kind=k;dialect=d;break;}
  }
  if(!kind)fail('UNSUPPORTED_LORA','Unsupported LoRA tensor: '+tensor.name);
  const target=resolveLoraTarget(stem);
  if(!target)fail('UNSUPPORTED_LORA','Unknown exact native target: '+stem);
  let g=groups.get(stem);if(!g){g={alias:stem,target,dialect:null};groups.set(stem,g);}
  if(g[kind]||(dialect&&g.dialect&&dialect!==g.dialect))fail('INVALID_LORA','Duplicate or mixed LoRA dialect: '+stem);
  if(dialect)g.dialect=dialect;g[kind]=tensor;
 }
 const pairs=[],deltas=[],covered=new Set();
 const reserve=target=>{if(covered.has(target.canonical))fail('INVALID_LORA','Conflicting patches for '+target.canonical);covered.add(target.canonical);};
 for(const g of groups.values()){
  if(g.down||g.up){
   if(!g.down||!g.up||g.diff)fail('INVALID_LORA','Incomplete/conflicting factor pair: '+g.alias);
   if(!g.target.linear||g.down.shape.length!==2||g.up.shape.length!==2)fail('UNSUPPORTED_LORA','Only 2D linear factor pairs are supported');
   const [rank,inFeatures]=g.down.shape,[outFeatures,upRank]=g.up.shape;
   if(rank<1||rank!==upRank||!equalShape(g.target.shape,[outFeatures,inFeatures]))fail('INVALID_LORA','Factor rank/base shape mismatch');
   let alpha=null;
   if(g.alpha){
    if(g.alpha.byteLength!==WIDTH[g.alpha.dtype])fail('INVALID_LORA','Alpha must contain one scalar');
    const raw=await exact(file,8+header.headerBytes+g.alpha.dataOffsets[0],g.alpha.byteLength);alpha=scalar(raw,g.alpha.dtype);
   }
   reserve(g.target);
   pairs.push({target:g.target.canonical,baseWeightKey:g.target.key,alias:g.alias,dialect:g.dialect,rank,inFeatures,outFeatures,downTensor:g.down.name,upTensor:g.up.name,alphaTensor:g.alpha?.name??null,alpha,alphaPresent:!!g.alpha,alphaRankMultiplier:g.alpha?alpha/rank:1});
  }else if(g.alpha)fail('INVALID_LORA','Orphan alpha tensor: '+g.alias);
  if(g.diff){
   if(!equalShape(g.diff.shape,g.target.shape))fail('INVALID_LORA','Additive difference shape mismatch');reserve(g.target);
   deltas.push({target:g.target.canonical,alias:g.alias,kind:'diff',tensorName:g.diff.name,dtype:g.diff.dtype,shape:[...g.diff.shape]});
  }
  if(g.bias){
   const target=resolveLoraBiasTarget(g.alias);
   if(!target)fail('UNSUPPORTED_LORA','No exact bias target for '+g.alias);
   if(!equalShape(g.bias.shape,target.shape))fail('INVALID_LORA','Additive bias shape mismatch');reserve(target);
   deltas.push({target:target.canonical,alias:g.alias,kind:'diff_b',tensorName:g.bias.name,dtype:g.bias.dtype,shape:[...g.bias.shape]});
  }
 }
 if(!pairs.length&&!deltas.length)fail('INVALID_LORA','No supported factors or additive differences');
 return freeze({schemaVersion:SCHEMA,fileName:header.name,fileBytes:header.fileBytes,headerBytes:header.headerBytes,headerSHA256:header.headerSHA256,fullFileSHA256:null,fullFileHashStatus:'NOT_COMPUTED',pairs,deltas,tensors:header.tensors,linearTargetCount:BERNINI_TARGETS.filter(t=>t.linear).length,applied:false,payloadValidation:'ON_READ',baseCompatibility:'NOT_PROVEN'});
}
export async function loadLoraFile(file,options){
 const binding=validateLoraBinding(options);
 const inspected=await inspectLoraFile(file);
 let fullFileSHA256;
 try{fullFileSHA256=await sha256Blob(file,{chunkBytes:LORA_LIMITS.hashChunkBytes});}
 catch(error){fail('INVALID_LORA',String(error.message??error));}
 if(binding.expectedFileSHA256&&fullFileSHA256!==binding.expectedFileSHA256)fail('LORA_HASH_MISMATCH','Whole file SHA-256 does not match expected hash');
 const after=await inspect(file);
 if(after.headerSHA256!==inspected.headerSHA256||after.fileBytes!==inspected.fileBytes)fail('LORA_HASH_MISMATCH','File header/length changed during hashing');
 return freeze({...inspected,...binding,fullFileSHA256,fullFileHashStatus:'STREAMED_WHOLE_FILE_SHA256',sourceBaseCompatibility:'CALLER_DECLARED_NOT_PROVEN'});
}
function snapshotBinding(binding){
 const options=validateLoraBinding(binding),{schemaVersion,fileBytes,headerBytes,headerSHA256,fullFileSHA256}=binding;
 if(schemaVersion!==SCHEMA||!Number.isSafeInteger(fileBytes)||fileBytes<8||!Number.isSafeInteger(headerBytes)||headerBytes<2)fail('INVALID_LORA_BINDING','Invalid loaded binding metadata');
 return {...options,schemaVersion,fileBytes,headerBytes,headerSHA256:hashString(headerSHA256),fullFileSHA256:hashString(fullFileSHA256)};
}
async function boundInspection(file,binding){
 const inspected=await inspectLoraFile(file);
 if(inspected.headerSHA256!==binding.headerSHA256||inspected.fileBytes!==binding.fileBytes||inspected.headerBytes!==binding.headerBytes)fail('INVALID_LORA_BINDING','Registered source header/length differs');
 return inspected;
}
function range(offset,count,maximum){
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(count)||count<0)fail('INVALID_LORA','Explicit safe nonnegative range required');
 if(count>LORA_LIMITS.maxReadBytes)fail('LORA_READ_BUDGET_EXCEEDED','Read exceeds 4 MiB budget');
 if(offset>maximum||count>maximum-offset)fail('INVALID_LORA','Read outside source range');
}
// Internal trusted-binding helpers: the API host must supply the same immutable
// File/Blob reference that it registered on successful load, and its private
// metadata. Rechecking header/size rejects changed descriptors; it does not
// rehash every payload or authenticate an arbitrary caller-forged binding.
function provenance(binding){const {stage,strength,baseModelSha256,fileBytes,headerSHA256,fullFileSHA256}=binding;return {stage,strength,baseModelSha256,fileBytes,headerSHA256,fullFileSHA256,fullFileHashStatus:'VERIFIED_AT_LOAD_IMMUTABLE_BINDING',headerHashStatus:'REVERIFIED_ON_READ',applied:false};}
export async function readLoraTensor(file,binding,request){
 const owned=snapshotBinding(binding),{tensorName,elementOffset,elementCount}=request??{};
 if(typeof tensorName!=='string'||!Number.isSafeInteger(elementOffset)||elementOffset<0||!Number.isSafeInteger(elementCount)||elementCount<0)fail('INVALID_LORA','Explicit tensor element range required');
 const inspection=await boundInspection(file,owned),tensor=inspection.tensors.find(t=>t.name===tensorName);
 if(!tensor)fail('INVALID_LORA','Unknown registered tensor');
 const width=WIDTH[tensor.dtype],total=tensor.byteLength/width;
 if(elementCount>Math.floor(LORA_LIMITS.maxReadBytes/width))fail('LORA_READ_BUDGET_EXCEEDED','Tensor read exceeds 4 MiB budget');
 range(elementOffset,elementCount,total);
 const byteLength=elementCount*width,start=8+inspection.headerBytes+tensor.dataOffsets[0]+elementOffset*width;
 const data=await exact(file,start,byteLength);finiteBytes(data,tensor.dtype);
 return {...provenance(owned),tensorName,dtype:tensor.dtype,shape:[...tensor.shape],byteOrder:'little-endian',elementOffset,elementCount,byteLength,data,rangeSHA256:await sha(data),payloadValidation:'RANGE_FINITE_CHECKED'};
}
export async function readLoraBytes(file,binding,request){
 const owned=snapshotBinding(binding),{byteOffset,byteLength}=request??{};range(byteOffset,byteLength,owned.fileBytes);
 await boundInspection(file,owned);const data=await exact(file,byteOffset,byteLength);
 return {...provenance(owned),byteOffset,byteLength,data,rangeSHA256:await sha(data),payloadValidation:'NOT_PERFORMED_RAW_SOURCE_READ'};
}

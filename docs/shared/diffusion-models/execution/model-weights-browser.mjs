import {createModelWeightSource,MODEL_WEIGHT_SCHEMA,MODEL_WEIGHT_PROFILE} from './model-weights.mjs';
import {BERNINI_TARGETS} from '../lora/targets.mjs';

const demand=(condition,message)=>{if(!condition)throw Error(message);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
function referenceHalf(bits){
 const sign=bits&0x8000?-1:1,exponent=bits>>>10&31,mantissa=bits&1023;
 if(exponent===31)return mantissa?NaN:sign*Infinity;
 return Math.fround(sign*(exponent===0?mantissa*2**-24:(1+mantissa/1024)*2**(exponent-15)));
}
function referenceE4M3FN(code,scale){
 const sign=code&128?-1:1,exponent=code>>>3&15,mantissa=code&7;
 if(exponent===15&&mantissa===7)return NaN;
 const decoded=sign*(exponent===0?mantissa*2**-9:(1+mantissa/8)*2**(exponent-7));
 return Math.fround(decoded*Math.fround(scale));
}
const sameShape=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
async function selectedCase(file,source,selection){
 const {key,start,count,mode}=selection,entry=source.describe().entries[key];
 const result=await source[mode==='rows'?'readRows':'readVector'](key,start,count,{diagnostics:false});
 demand(!Object.hasOwn(result.source,'rawSHA256')&&!Object.hasOwn(result.source,'decodedF32SHA256'),'Normal read unexpectedly required diagnostic payload hashes');
 const raw=new Uint8Array(await file.slice(result.source.absoluteByteOffset,result.source.absoluteByteOffset+result.source.selectedByteLength).arrayBuffer());
 demand(raw.length===result.raw.length&&raw.every((value,index)=>value===result.raw[index]),'Direct-file raw bytes differ from source range');
 let scale=null,scaleReadBytes=0;
 if(entry.storageDtype==='F8_E4M3'){
  const bytes=await file.slice(entry.scaleSource.absoluteByteOffset,entry.scaleSource.absoluteByteOffset+4).arrayBuffer();scale=new DataView(bytes).getFloat32(0,true);scaleReadBytes=4;
  demand(scale===entry.scale&&Number.isFinite(scale)&&scale>0,'Independent original scalar does not match source metadata');
 }
 const expected=new Float32Array(result.values.length),view=new DataView(raw.buffer),actualBits=new Uint32Array(result.values.buffer,result.values.byteOffset,result.values.length),expectedBits=new Uint32Array(expected.buffer);
 let failedElements=0,bitMismatches=0,maxAbsoluteError=0;
 for(let i=0;i<expected.length;i++){
  expected[i]=entry.storageDtype==='F16'?referenceHalf(view.getUint16(i*2,true)):referenceE4M3FN(raw[i],scale);
  const error=Math.abs(result.values[i]-expected[i]);if(!Number.isFinite(error)||error!==0)failedElements++;
  if(expectedBits[i]!==actualBits[i])bitMismatches++;maxAbsoluteError=Math.max(maxAbsoluteError,error);
 }
 demand(failedElements===0&&bitMismatches===0,'Independent Hike decode comparison failed for '+key);
 return {originalKey:key,fullShape:[...entry.fullShape],storageDtype:entry.storageDtype,computeDtype:entry.computeDtype,fp8ProfileId:entry.fp8ProfileId,mode,start,count,columns:entry.columns,elementOffset:result.source.elementOffset,comparedElements:expected.length,storageBytes:raw.length,independentReadBytes:raw.length+scaleReadBytes,rawSHA256:await sha(raw),decodedF32SHA256:await sha(result.values),independentF32SHA256:await sha(expected),failedElements,bitMismatches,maxAbsoluteError,normalPayloadHashesRequired:false};
}

/** Diagnostics only; these selected payload comparisons never gate normal source construction. */
export async function runModelWeightRegistryBrowser({HIGH,LOW,decoder='legacy'}){
 const models=[],selections=[
  {key:'blocks.39.self_attn.q.weight',start:0,count:16,mode:'rows'},
  {key:'blocks.39.ffn.2.weight',start:0,count:5,mode:'rows'},
  {key:'head.head.weight',start:0,count:16,mode:'rows'},
  {key:'head.head.bias',start:0,count:64,mode:'vector'},
  {key:'blocks.39.norm3.weight',start:0,count:5120,mode:'vector'},
  {key:'blocks.39.norm3.bias',start:0,count:5120,mode:'vector'},
  {key:'patch_embedding.weight',start:0,count:16,mode:'rows'}
 ];
 for(const side of ['LOW','HIGH']){
  const file=side==='LOW'?LOW:HIGH;demand(file instanceof File,'Actual retained browser File required');let source=null;
  try{
   source=await createModelWeightSource({file,side,decoder});const description=source.describe(),entries=Object.values(description.entries);
   demand(description.schemaVersion===MODEL_WEIGHT_SCHEMA&&description.executionProfileId===MODEL_WEIGHT_PROFILE&&entries.length===1095,'Full model registry identity/coverage mismatch');
   demand(entries.length===BERNINI_TARGETS.length&&BERNINI_TARGETS.every(target=>{const entry=description.entries[target.key];return entry?.originalKey===target.key&&sameShape(entry.fullShape,target.shape)&&entry.computeDtype==='F32'&&entry.binding.name===target.key&&entry.operatorBinding.programSlot===target.key;}),'Actual header target/full-shape/binding inventory mismatch');
   demand(description.parameterFreeNormalization.length===81,'Nonaffine normalization contract mismatch');
   demand(source.stats().payloadReads===0&&description.fullFileHashRecomputed===false&&description.payloadSampleAdmission===false,'Source construction read model payload or recomputed the full hash');
   const cases=[];for(const selection of selections)cases.push(await selectedCase(file,source,selection));
   const beforeDispose=source.stats();source.dispose();const afterDispose=source.stats();
   demand(beforeDispose.maxPayloadReadBytes<=163840&&afterDispose.disposed&&afterDispose.hike===null,'Decode bounds or disposal failed');
   models.push({side,fileBytes:description.fileBytes,headerSHA256:description.headerSHA256,modelHash:description.modelHash,modelHashRole:description.modelHashRole,targetCount:entries.length,F16Targets:entries.filter(entry=>entry.storageDtype==='F16').length,FP8Targets:entries.filter(entry=>entry.storageDtype==='F8_E4M3').length,blockCount:description.blockCount,parameterFreeNormalizationCount:description.parameterFreeNormalization.length,fp8Profile:'scaled-e4m3fn-scalar-f32-v1',decoder:description.decoder,schemaVersion:description.schemaVersion,executionProfileId:description.executionProfileId,cases,resources:{beforeDispose,afterDispose}});
  }finally{source?.dispose();}
 }
 return {schemaVersion:'bernini-full-model-weight-registry-browser/0.1',passed:true,diagnosticOnly:true,actualRetainedFiles:true,actualHikeWasm:true,decoder,independentReference:'Direct original File range; independent JS binary16 and E4M3FN decode with f32 scalar multiplication; all selected values compared bitwise',models,totalComparedElements:models.reduce((sum,model)=>sum+model.cases.reduce((n,value)=>n+value.comparedElements,0),0),totalSourceReadBytes:models.reduce((sum,model)=>sum+model.resources.beforeDispose.readBytes,0),totalIndependentReadBytes:models.reduce((sum,model)=>sum+model.cases.reduce((n,value)=>n+value.independentReadBytes,0),0),fullFileHashRecomputed:false,payloadSampleAdmission:false,canonicalLoraAdapterExtension:'PENDING',modelInference:false,generationReady:false};
}

/** Source-ordered FP32 inner norm lowering. Original graph/weights stay immutable. */
import {Sha256} from '../vr180/sha256.mjs';
const TYPE='umt5-inner-rmsnorm-avx2-cascade-f32-v1',STATUSES=new Set(['source-ordered-fp32','diagnostic-only-unaccepted']),CHUNK=8*1024*1024;
const checkSignal=signal=>{if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const decodeHex=value=>Uint8Array.from(value.match(/../g)??[],value=>parseInt(value,16));
const decodeBase64=value=>Uint8Array.from(atob(value),value=>value.charCodeAt(0));
function integer(bytes){let value=0,scale=1;for(const byte of bytes){value+=(byte&127)*scale;if(byte<128)return value;scale*=128;}throw TypeError('Invalid graph length varint');}

export function inspectInnerRmsNormRecipe(recipe,sourceRecord){
 if(recipe?.schemaVersion!==1||recipe.type!==TYPE||!STATUSES.has(recipe.status))throw TypeError('Unsupported inner RMSNorm recipe');
 if(!Number.isSafeInteger(recipe.index)||recipe.index<0||recipe.index>23||!Number.isSafeInteger(recipe.sourceAsset?.bytes)||recipe.sourceAsset.bytes<1||!/^[0-9a-f]{64}$/.test(recipe.sourceAsset.sha256)||!/^[0-9a-f]{64}$/.test(recipe.executedGraphSha256))throw TypeError('Invalid norm graph identity');
 if(sourceRecord&&(recipe.index!==sourceRecord.index||recipe.path!==sourceRecord.path||recipe.sourceAsset.bytes!==sourceRecord.bytes||recipe.sourceAsset.sha256!==sourceRecord.sha256))throw TypeError('Norm recipe does not match original asset');
 if(!Array.isArray(recipe.operations)||recipe.operations.length!==3)throw TypeError('Exactly two inner norm replacements and graph length required');
 const roles=['graph-length','inner-rmsnorm-0-reduce-mean','inner-rmsnorm-1-reduce-mean'];let end=0,delta=0;
 const operations=recipe.operations.map((value,index)=>{
  if(value.role!==roles[index]||!Number.isSafeInteger(value.offset)||value.offset<end||!/^([0-9a-f]{2})+$/.test(value.beforeHex)||typeof value.afterBase64!=='string')throw TypeError('Invalid bounded norm replacement');
  const before=decodeHex(value.beforeHex),after=decodeBase64(value.afterBase64);
  if(!after.length||before.length>65536||after.length>65536||value.offset+before.length>recipe.sourceAsset.bytes)throw TypeError('Unbounded norm metadata replacement');
  end=value.offset+before.length;delta+=after.length-before.length;return {...value,before,after};
 });
 if(!Number.isSafeInteger(recipe.executedBytes)||recipe.executedBytes!==recipe.sourceAsset.bytes+delta||delta<1||delta>65536)throw TypeError('Invalid norm graph growth');
 const header=operations[0],nodesDelta=operations.slice(1).reduce((sum,value)=>sum+value.after.length-value.before.length,0);
 if(integer(header.before)!==recipe.sourceGraphLength||integer(header.after)!==recipe.executedGraphLength||recipe.executedGraphLength!==recipe.sourceGraphLength+nodesDelta||header.offset+header.before.length!==recipe.sourceGraphPayloadOffset||recipe.sourceGraphPayloadOffset+recipe.sourceGraphLength>recipe.sourceAsset.bytes)throw TypeError('Invalid original/executed graph length');
 return {operations,recipeId:TYPE,status:recipe.status,sourceAssetSha256:recipe.sourceAsset.sha256,executedGraphSha256:recipe.executedGraphSha256};
}

/** Original-asset verification belongs to the loader before this one allocation. */
export async function rewriteInnerRmsNormGraph(bytes,recipe,{verifiedSourceAssetSha256,signal,onProgress}={}){
 const {operations}=inspectInnerRmsNormRecipe(recipe);
 if(!(bytes instanceof Uint8Array)||bytes.byteLength!==recipe.sourceAsset.bytes||verifiedSourceAssetSha256!==recipe.sourceAsset.sha256)throw Error('Norm original source asset hash verification required');
 checkSignal(signal);
 for(const operation of operations)for(let index=0;index<operation.before.length;index++)if(bytes[operation.offset+index]!==operation.before[index])throw Error('Original norm graph metadata changed');
 const output=new Uint8Array(recipe.executedBytes);let sourceOffset=0,targetOffset=0;
 async function copyUntil(end){
  while(sourceOffset<end){checkSignal(signal);const take=Math.min(CHUNK,end-sourceOffset);onProgress?.({stage:'text-norm-graph-copy',index:recipe.index,offset:sourceOffset,total:bytes.byteLength,wholeGraphCopies:1});checkSignal(signal);output.set(bytes.subarray(sourceOffset,sourceOffset+take),targetOffset);sourceOffset+=take;targetOffset+=take;await tick();checkSignal(signal);}
 }
 for(const operation of operations){await copyUntil(operation.offset);output.set(operation.after,targetOffset);targetOffset+=operation.after.length;sourceOffset+=operation.before.length;}
 await copyUntil(bytes.byteLength);checkSignal(signal);
 if(targetOffset!==output.byteLength)throw Error('Norm transformed graph size mismatch');
 return output;
}

/** Call after replacing the loader's old buffer reference, so it may be freed. */
export async function verifyInnerRmsNormGraph(bytes,recipe,{signal,onProgress}={}){
 inspectInnerRmsNormRecipe(recipe);
 if(!(bytes instanceof Uint8Array)||bytes.byteLength!==recipe.executedBytes)throw TypeError('Norm executed graph size mismatch');
 const hash=new Sha256();
 for(let offset=0;offset<bytes.length;offset+=CHUNK){checkSignal(signal);onProgress?.({stage:'text-norm-execution-graph-hash',index:recipe.index,offset,total:bytes.length});checkSignal(signal);hash.update(bytes.subarray(offset,Math.min(offset+CHUNK,bytes.length)));await tick();checkSignal(signal);}
 const actual=hash.digestHex();if(actual!==recipe.executedGraphSha256)throw Error('Norm execution graph hash mismatch');
 return {recipeId:TYPE,status:recipe.status,index:recipe.index,path:recipe.path,sourceAssetSha256:recipe.sourceAsset.sha256,executedGraphSha256:actual,sourceBytes:recipe.sourceAsset.bytes,executedBytes:recipe.executedBytes,wholeGraphCopies:1,newModelExports:0};
}

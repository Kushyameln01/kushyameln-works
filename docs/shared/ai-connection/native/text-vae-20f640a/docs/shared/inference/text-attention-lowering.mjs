/** Bounded diagnostic candidate. Production adoption requires the fixed numeric gate. */
import {Sha256} from '../vr180/sha256.mjs';

const TYPE='umt5-sdpa-scale-cancellation-candidate-v1';
const STATUS='diagnostic-only-unaccepted';
const PREFIX='/block/layer.0/SelfAttention/';
const CHUNK=8*1024*1024;
const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
const checkSignal=signal=>{if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');};
const hex=bytes=>Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
const decode=value=>Uint8Array.from(value.match(/../g),value=>parseInt(value,16));

export function inspectSdpaScaleRecipe(recipe,sourceRecord){
 if(recipe?.schemaVersion!==1||recipe.type!==TYPE||recipe.status!==STATUS)throw TypeError('Unsupported SDPA scale recipe');
 if(!Number.isSafeInteger(recipe.index)||recipe.index<0||recipe.index>23||!Number.isSafeInteger(recipe.sourceAsset?.bytes)||recipe.sourceAsset.bytes<1||!/^[0-9a-f]{64}$/.test(recipe.sourceAsset.sha256)||!/^[0-9a-f]{64}$/.test(recipe.executedGraphSha256))throw TypeError('Invalid SDPA source/executed graph record');
 if(sourceRecord&&(recipe.index!==sourceRecord.index||recipe.path!==sourceRecord.path||recipe.sourceAsset.bytes!==sourceRecord.bytes||recipe.sourceAsset.sha256!==sourceRecord.sha256))throw TypeError('SDPA recipe does not match original asset record');
 const expected=[['Constant_16','0000003f','00000000'],['Constant_26','0000803f','00000041']];
 if(!Array.isArray(recipe.patches)||recipe.patches.length!==2)throw TypeError('Exactly two bounded SDPA scalar patches required');
 for(let index=0;index<2;index++){
  const patch=recipe.patches[index],[suffix,before,after]=expected[index];
  if(patch.nodeName!==PREFIX+suffix||patch.beforeHex!==before||patch.afterHex!==after||!Number.isSafeInteger(patch.offset)||patch.offset<0||patch.offset+4>recipe.sourceAsset.bytes)throw TypeError('Invalid bounded SDPA scalar patch');
 }
 if(Math.abs(recipe.patches[0].offset-recipe.patches[1].offset)<4)throw TypeError('Overlapping SDPA patches');
 return {recipeId:TYPE,status:STATUS,sourceAssetSha256:recipe.sourceAsset.sha256,executedGraphSha256:recipe.executedGraphSha256};
}

/** Mutate only caller-owned graph bytes. A supplied verified hash must refer to
 * this same private buffer after the loader's completed original-asset check. */
export async function applySdpaScaleRecipeInPlace(bytes,recipe,{signal,onProgress,verifiedSourceAssetSha256}={}){
 inspectSdpaScaleRecipe(recipe);
 if(!(bytes instanceof Uint8Array)||bytes.byteLength!==recipe.sourceAsset.bytes)throw TypeError('SDPA graph buffer size mismatch');
 async function hash(stage){
  const value=new Sha256();
  for(let offset=0;offset<bytes.byteLength;offset+=CHUNK){
   checkSignal(signal);onProgress?.({stage,index:recipe.index,offset,total:bytes.byteLength});checkSignal(signal);
   value.update(bytes.subarray(offset,Math.min(offset+CHUNK,bytes.byteLength)));
   await yieldTask();checkSignal(signal);
  }
  return value.digestHex();
 }
 checkSignal(signal);
 const sourceAssetSha256=verifiedSourceAssetSha256??await hash('sdpa-source-asset-hash');
 if(sourceAssetSha256!==recipe.sourceAsset.sha256)throw Error('SDPA source asset hash mismatch');
 for(const patch of recipe.patches)if(hex(bytes.subarray(patch.offset,patch.offset+4))!==patch.beforeHex)throw Error('SDPA Constant payload mismatch');
 checkSignal(signal);
 for(const patch of recipe.patches)bytes.set(decode(patch.afterHex),patch.offset);
 try{
  const executedGraphSha256=await hash('sdpa-execution-graph-hash');
  if(executedGraphSha256!==recipe.executedGraphSha256)throw Error('SDPA execution graph hash mismatch');
  return {schemaVersion:1,recipeId:TYPE,status:STATUS,index:recipe.index,path:recipe.path,bytes:bytes.byteLength,
   sourceAssetSha256,executedGraphSha256,patches:recipe.patches.map(patch=>({...patch})),newExports:0,newNeuralRuns:0};
 }catch(error){
  // Cancellation/failure before session creation returns original caller bytes.
  for(const patch of recipe.patches)bytes.set(decode(patch.beforeHex),patch.offset);
  throw error;
 }
}

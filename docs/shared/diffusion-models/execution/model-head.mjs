import {MODEL_WEIGHT_SCHEMA,MODEL_WEIGHT_PROFILE,MODEL_WEIGHT_LIMITS} from './model-weights.mjs';

export const MODEL_HEAD_PROFILE='bernini-final-head-f32-rows128-v1';
export const MODEL_HEAD_LIMITS=Object.freeze({maxRows:128,hiddenWidth:5120,outputWidth:64,epsilon:1e-6,cacheBytes:1351936});
const {maxRows,hiddenWidth:width,outputWidth:columns,epsilon}=MODEL_HEAD_LIMITS;
const typed=Object.getPrototypeOf(Float32Array.prototype);
const slots=Object.fromEntries(['buffer','byteLength','byteOffset','length'].map(key=>[key,Object.getOwnPropertyDescriptor(typed,key).get]));
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
function sameShape(a,b){
 if(!Array.isArray(a)||a.length!==b.length)return false;
 for(let i=0;i<b.length;i++)if(!Object.hasOwn(a,i)||a[i]!==b[i])return false;
 return true;
}
const abort=signal=>signal?.throwIfAborted();
function snapshot(value,count,label){
 const fail=()=>{throw TypeError(label+': compact nonshared finite exact-shape F32 required');};
 if(Object.getPrototypeOf(value??{})!==Float32Array.prototype)fail();
 let buffer,length,offset,bytes;
 try{buffer=slots.buffer.call(value);length=slots.length.call(value);offset=slots.byteOffset.call(value);bytes=slots.byteLength.call(value);}catch{fail();}
 if(Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||length!==count||offset!==0||bytes!==bufferLength.call(buffer))fail();
 const owned=new Float32Array(value);for(let i=0;i<owned.length;i++)if(!Number.isFinite(owned[i]))fail();return owned;
}

/** Wan Head: parameter-free LN -> raw-e shift/scale -> full 5120x64 linear.
 * Every supplied token row, including context rows, executes this owner. The
 * sequence owner selects target rows only after the head, as the core does.
 * Dependencies remain caller-owned and are not disposed with this cache.
 */
export function createModelHead({source,math,ops}={}){
 if(!['describe','readRows','readVector'].every(key=>typeof source?.[key]==='function'))throw TypeError('Full original/completed model source required');
 if(!['layerNorm','modulate','add','bias'].every(key=>typeof math?.[key]==='function')||typeof ops?.linear!=='function')throw TypeError('Model math and batched linear operators required');
 const description=source.describe(),entries=description.entries;
 if(description.schemaVersion!==MODEL_WEIGHT_SCHEMA||description.executionProfileId!==MODEL_WEIGHT_PROFILE)throw TypeError('Identified full-model head source required');
 for(const [key,shape]of [['head.head.weight',[columns,width]],['head.modulation',[1,2,width]],['head.head.bias',[columns]]]){
  const entry=entries?.[key];if(!entry||!sameShape(entry.fullShape,shape)||entry.computeDtype!=='F32'||entry.storageDtype!=='F16')throw TypeError('Original head shape/dtype binding mismatch: '+key);
 }
 const entry=entries['head.head.weight'],weightRows=Math.min(entry.maxRows,Math.floor(MODEL_WEIGHT_LIMITS.maxBlockElements/width));
 if(entry.columns!==width||!Number.isSafeInteger(weightRows)||weightRows<1)throw TypeError('Bounded full-inner head source rows required');
 let busy=false,disposed=false,cache=null,cacheWeightEpoch=null,cacheInvalidations=0,runs=0,rowsProcessed=0,sourceReads=0,sourceF32Bytes=0,lastEvidence=null;
 const live=signal=>{if(disposed)throw Error('Model head disposed');abort(signal);};
 const weightEpoch=()=>{const at=typeof source.weightEpoch==='function'?source.weightEpoch():source.describe().weightEpoch??null;if(at!==null&&(!Number.isSafeInteger(at)||at<0))throw TypeError('Valid source weight epoch required');return at;};
 function currentEpoch(at){if(weightEpoch()!==at){cache=null;cacheWeightEpoch=null;cacheInvalidations++;throw Object.assign(new Error('Model head weight epoch changed during execution'),{code:'STALE_WEIGHT_EPOCH'});}}
 async function load(signal,at){
  if(cache&&cacheWeightEpoch!==at){cache=null;cacheWeightEpoch=null;cacheInvalidations++;}
  if(cache)return cache;
  // Build privately and publish only after every bounded read succeeds. A
  // cancelled/failed load never exposes a partially initialized cache.
  const weight=new Float32Array(columns*width);
  for(let start=0;start<columns;start+=weightRows){
   const count=Math.min(weightRows,columns-start),read=await source.readRows('head.head.weight',start,count,{signal,diagnostics:false});live(signal);currentEpoch(at);
   const values=snapshot(read.values,count*width,'Head weight');weight.set(values,start*width);sourceReads++;sourceF32Bytes+=values.byteLength;
  }
  const readMod=await source.readVector('head.modulation',0,2*width,{signal,diagnostics:false});live(signal);currentEpoch(at);
  const modulation=snapshot(readMod.values,2*width,'Head modulation');sourceReads++;sourceF32Bytes+=modulation.byteLength;
  const readBias=await source.readVector('head.head.bias',0,columns,{signal,diagnostics:false});live(signal);currentEpoch(at);
  const bias=snapshot(readBias.values,columns,'Head bias');sourceReads++;sourceF32Bytes+=bias.byteLength;
  cache={weight,shift:modulation.slice(0,width),scale:modulation.slice(width),bias};cacheWeightEpoch=at;return cache;
 }
 return Object.freeze({
  async run(input={}){
   live();if(busy)throw Error('Model head busy');busy=true;
   try{
    if(Object.keys(input).some(key=>!['hidden','timeEmbedding','rows','signal'].includes(key)))throw TypeError('Unknown model head input');
    const {rows}=input;if(!Number.isSafeInteger(rows)||rows<1||rows>maxRows)throw RangeError('Head rows shape requires 1..128');
    // Snapshot hidden before reading any later caller-controlled getter.
    const hidden=snapshot(input.hidden,rows*width,'Head hidden'),timeEmbedding=snapshot(input.timeEmbedding,width,'Raw time embedding'),signal=input.signal;live(signal);
    const at=weightEpoch(),parameters=await load(signal,at);live(signal);currentEpoch(at);
    // e is time_embedding's raw output. It is added separately to both
    // learned vectors; SiLU/time_projection are not part of the final head.
    const shift=math.add({a:parameters.shift,b:timeEmbedding}),scale=math.add({a:parameters.scale,b:timeEmbedding});
    const normalized=math.layerNorm({input:hidden,rows,width,epsilon}),modulated=math.modulate({input:normalized,shift,scale,rows,width});live(signal);
    const projected=await ops.linear({x:modulated,weight:parameters.weight,rows,columns,inner:width,signal});live(signal);currentEpoch(at);
    const projection=snapshot(projected.output,rows*columns,'Head projection'),output=snapshot(math.bias({input:projection,bias:parameters.bias,rows,width:columns}),rows*columns,'Head output');live(signal);
    runs++;rowsProcessed+=rows;lastEvidence=projected.evidence?structuredClone(projected.evidence):null;return output;
   }finally{busy=false;}
  },
  describe(){live();return {schemaVersion:'works-model-head/0.1',profile:MODEL_HEAD_PROFILE,limits:{...MODEL_HEAD_LIMITS},sourceSchema:MODEL_WEIGHT_SCHEMA,operator:'head.norm -> (modulation + raw time_embedding) -> head.head',timeInput:'raw time_embedding e; no timeAct1 or projected e0',fullInner:width,outputColumns:columns,contextRowsExecute:true,normalization:{kind:'layernorm',elementwiseAffine:false,epsilon},cachePolicy:'bounded full head only; no payload hashes',originalProductionPrecisionVerified:false,modelInference:false,generationReady:false};},
  stats(){return {busy,disposed,runs,rowsProcessed,sourceReads,sourceF32Bytes,cacheWeightEpoch,cacheInvalidations,cacheBytes:cache?cache.weight.byteLength+cache.shift.byteLength+cache.scale.byteLength+cache.bias.byteLength:0,lastLinearEvidence:lastEvidence?structuredClone(lastEvidence):null};},
  dispose(){if(busy)throw Error('Await active model head before disposal; owner busy');cache=null;disposed=true;}
 });
}

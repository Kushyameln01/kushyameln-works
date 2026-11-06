import {createFullModelWeightSource,MODEL_WEIGHT_SCHEMA,MODEL_WEIGHT_PROFILE,MODEL_WEIGHT_LIMITS} from './model-weights.mjs';
import {createModelMath} from './model-math.mjs';
import {createModelSequence} from './model-sequence.mjs';
import {createModelHead} from './model-head.mjs';
import {snapshotP4NativeConditioning} from '../ort-bridge/post-self-attention/conditioning.mjs';
import {BERNINI_TARGETS,TARGET_PROVENANCE} from '../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';
import {createModelChunkEmitter,validateModelChunkOptions,MODEL_CHUNK_STAGES,MODEL_CHUNK_MAX_ELEMENTS} from './model-chunk-diagnostics.mjs';
import {createModelExecutionTiming} from './model-execution-timing.mjs';

export const MODEL_CANDIDATE_PROFILE='bernini-full40-batched-f32-experimental-v1';
export const MODEL_CANDIDATE_LIMITS=Object.freeze({blocks:40,rows:128,keys:256,hiddenWidth:5120,heads:40,headDim:128,ffnWidth:13824,textWidth:4096,textRows:512,maxSequenceTokens:90000,hostHiddenStoreCount:4,maxHiddenStoreBytesExclusive:2147483648,diagnosticMaxTokens:128,maxStageWeightCacheBytes:566231040});
const W=5120,H=40,D=128,R=128,K=256,F=13824,EPS=1e-6,INITIAL_MAX=-3.4028234663852886e38;
const typed=Object.getPrototypeOf(Float32Array.prototype),slots=Object.fromEntries(['buffer','length','byteOffset','byteLength'].map(key=>[key,Object.getOwnPropertyDescriptor(typed,key).get]));
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
// Keep cancellation on native slots. Caller-owned method properties must not
// strand the owner's busy/terminal state during listener attachment or cleanup.
const signalThrowIfAborted=AbortSignal.prototype.throwIfAborted;
const signalReason=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'reason').get;
const signalAddListener=EventTarget.prototype.addEventListener;
const signalRemoveListener=EventTarget.prototype.removeEventListener;
const abort=signal=>{if(signal!==undefined)signalThrowIfAborted.call(signal);};
function known(value,names,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!names.includes(key)))throw TypeError('Unknown '+label+' field or invalid object');}
function sameShape(a,b){
 if(!Array.isArray(a)||a.length!==b.length)return false;
 for(let i=0;i<b.length;i++){const entry=Object.getOwnPropertyDescriptor(a,String(i));if(!entry||!Object.hasOwn(entry,'value')||entry.value!==b[i])return false;}
 return true;
}
function f32(value,count,label){
 const fail=()=>{throw TypeError(label+': native compact nonshared finite exact-shape F32 required');};
 if(Object.getPrototypeOf(value??{})!==Float32Array.prototype)fail();
 let buffer,length,offset,bytes;
 try{buffer=slots.buffer.call(value);length=slots.length.call(value);offset=slots.byteOffset.call(value);bytes=slots.byteLength.call(value);}catch{fail();}
 if(Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||length!==count||offset!==0||bytes!==bufferLength.call(buffer))fail();
 const result=new Float32Array(value);for(let i=0;i<count;i++)if(!Number.isFinite(result[i]))fail();return result;
}
function bytes(value){
 if(value===undefined)return undefined;
 if(Object.getPrototypeOf(value??{})===ArrayBuffer.prototype)return new Uint8Array(value).slice();
 if(Object.getPrototypeOf(value??{})===Uint8Array.prototype&&Object.getPrototypeOf(slots.buffer.call(value))===ArrayBuffer.prototype)return new Uint8Array(value);
 throw TypeError('Native nonshared operator bytes required');
}
function sourceIdentity(source){
 if(!['describe','readRows','readVector'].every(key=>typeof source?.[key]==='function'))throw TypeError('Identified full-model source required');
 const description=source.describe(),side=description.side,pinned=TARGET_PROVENANCE.models.find(model=>typeof side==='string'&&model.name.includes(side));
 if(description.schemaVersion!==MODEL_WEIGHT_SCHEMA||description.executionProfileId!==MODEL_WEIGHT_PROFILE||!pinned||description.modelHash!==BASE_MODEL_HASHES[side]||description.headerSHA256!==pinned.headerSHA256||description.fileBytes!==pinned.fileBytes||description.pinnedCoreCommit!==TARGET_PROVENANCE.pinnedComfyCommit||description.blockCount!==40||description.targetCount!==1095)throw TypeError('Original full-model schema, side, header, size and pinned-core identity required');
 if(!description.entries||Object.keys(description.entries).length!==BERNINI_TARGETS.length)throw TypeError('All 1095 original targets required');
 for(const target of BERNINI_TARGETS){
  const entry=description.entries[target.key],matrix=target.key.endsWith('.weight')&&target.shape.length>=2,inner=matrix?target.shape.slice(1).reduce((a,b)=>a*b,1):null;
  if(!entry||!sameShape(entry.fullShape,target.shape)||entry.computeDtype!=='F32'||!['F16','F8_E4M3'].includes(entry.storageDtype)||entry.columns!==inner||(matrix&&(!Number.isSafeInteger(entry.maxRows)||entry.maxRows<1||entry.maxRows>MODEL_WEIGHT_LIMITS.maxRows)))throw TypeError('Full-model target shape/dtype/range mismatch: '+target.key);
 }
 return description;
}
// Layout copying only. All additions, multiplications, reductions, softmax and
// final attention division execute in the supplied Hike/ORT operator owners.
function headMajor(rows,source,start=0){
 const result=new Float32Array(rows*W);
 for(let head=0;head<H;head++)for(let row=0;row<rows;row++)result.set(source.subarray((start+row)*W+head*D,(start+row)*W+(head+1)*D),(head*rows+row)*D);
 return result;
}
function rowMajor(heads,rows){
 const result=new Float32Array(rows*W);
 for(let head=0;head<H;head++)for(let row=0;row<rows;row++)result.set(heads.subarray((head*rows+row)*D,(head*rows+row+1)*D),row*W+head*D);
 return result;
}

/** Experimental complete base-model graph. This is deliberately separate from
 * the public load/predict/sample runtime. Dependencies are operator owners,
 * never a callback which substitutes a prediction. Injected owners stay owned
 * by their caller. The default immutable source authenticates header and size,
 * not a newly recomputed full-file hash. No LoRA completion is supplied here.
 */
export async function createBerniniModelCandidate(options={}){
 known(options,['file','side','source','math','ops','bridgeBytes','mathWasmBytes','decoder','lookupBytes','readAheadBytes','numThreads','signal'],'candidate preparation');
 // Capture preparation primitives and operator bytes before any source await.
 const prepared={file:options.file,side:options.side,source:options.source,math:options.math,ops:options.ops,bridgeBytes:bytes(options.bridgeBytes),mathWasmBytes:bytes(options.mathWasmBytes),decoder:options.decoder,lookupBytes:bytes(options.lookupBytes),readAheadBytes:options.readAheadBytes,numThreads:options.numThreads,signal:options.signal};
 const explicitDecoder=prepared.decoder!==undefined;if(!explicitDecoder)prepared.decoder='lookup';
 const {signal}=prepared;abort(signal);
 if(prepared.numThreads!==undefined&&![1,4].includes(prepared.numThreads))throw RangeError('numThreads must be 1 or explicit COI profile4');
 if(prepared.ops!==undefined&&prepared.numThreads!==undefined)throw TypeError('Configure supplied operators before injection; do not also request numThreads');
 if(prepared.readAheadBytes!==undefined&&(!Number.isSafeInteger(prepared.readAheadBytes)||prepared.readAheadBytes<0||prepared.readAheadBytes>1048576))throw RangeError('readAheadBytes must be 0..1048576');
 if(!['legacy','lookup'].includes(prepared.decoder)||(prepared.lookupBytes!==undefined&&prepared.decoder!=='lookup'))throw TypeError('Explicit legacy or lookup decoder selection required');
 if(prepared.source!==undefined&&(prepared.file!==undefined||prepared.side!==undefined||prepared.bridgeBytes!==undefined||explicitDecoder||prepared.lookupBytes!==undefined||prepared.readAheadBytes!==undefined))throw TypeError('Use supplied source or file/side/decoder preparation, not both');
 let source=prepared.source??null,math=prepared.math??null,ops=prepared.ops??null,head=null;
 const owned={source:!source,math:!math,ops:!ops};let disposed=false,busy=false,closing=false,disposePending=null,activeController=null,activeTerminal=null;
 const metrics={predictions:0,diagnosticRuns:0,failedPredictions:0,sourceReads:0,sourceF32Bytes:0,linearRuns:0,attentionTiles:0,blocksCompleted:0,activeHiddenStores:0,activeHiddenStoreBytes:0,peakHiddenStoreBytes:0,stageWeightCacheBytes:0,peakStageWeightCacheBytes:0,lastRun:null,lastTiming:null,lastDiagnostic:null,lastFailure:null};
 const weights=new Set(),cacheSizes=new WeakMap(),preparedHandles=new WeakSet(),weightLabels=new WeakMap();
 let currentTiming=null,currentChunks=null,currentContext=null,releaseRetained=null;
 const timed=(kind,detail,fn)=>currentTiming?currentTiming.sync(kind,detail,fn):fn();
 const timedAsync=(kind,detail,fn)=>currentTiming?currentTiming.async(kind,detail,fn):fn();
 const copyF32=(value,count,label)=>timed('snapshotCopy',{operator:label,elements:count,bytes:count*4},()=>f32(value,count,label));
 const emitRows=(name,data,fullShape,rowAxis,columns,rowStart,rowCount,block=null,coordinates=false)=>currentChunks?.rows(name,{data,fullShape,rowAxis,columns,globalRowStart:rowStart,rowCount,block,layout:rowAxis===null?'NCTHW-contiguous-row-span':fullShape.length===4?'BLHD':fullShape.length===2?'BC':name==='timeProjection'?'BKC':'BLC',...(coordinates?{coordinatesForRows:(start,count)=>currentContext.sequence.readPositions(start,count)}:{})});
 const live=s=>{abort(signal);abort(s);if(disposed||closing)throw Error('Model candidate disposed or closing');};
 const cleanup=async()=>{
  const errors=[];
  if(releaseRetained)for(const weight of [...weights])try{releaseRetained(weight);}catch(error){errors.push(error);}
  for(const operation of [async()=>{head?.dispose();head=null;},async()=>{if(owned.ops){await ops?.dispose();weights.clear();metrics.stageWeightCacheBytes=0;}},async()=>{if(owned.math)math?.dispose();},async()=>{if(owned.source)source?.dispose();}])try{await operation();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Model candidate cleanup incomplete; retry disposal');
 };
 const dispose=()=>{
  if(disposed)return Promise.resolve();if(disposePending)return disposePending;
  closing=true;activeController?.abort(new DOMException('Model candidate disposed during prediction','AbortError'));
  const terminal=activeTerminal;disposePending=Promise.resolve().then(async()=>{await terminal;await cleanup();disposed=true;closing=false;}).finally(()=>{disposePending=null;});return disposePending;
 };
 try{
  if(!source)source=await createFullModelWeightSource({file:prepared.file,side:prepared.side,bridgeBytes:prepared.bridgeBytes,decoder:prepared.decoder,lookupBytes:prepared.lookupBytes,readAheadBytes:prepared.readAheadBytes??0,signal});
  live();const identity=sourceIdentity(source);
  if(!math)math=await createModelMath({wasmBytes:prepared.mathWasmBytes});live();
  if(!['layerNorm','affineNorm','rmsNorm','modulate','gateResidual','add','gelu','silu','bias','sinusoidal','rope','divideAttention'].every(key=>typeof math?.[key]==='function'))throw TypeError('Complete native model math including divideAttention required');
  if(!ops){const {createBatchedModelOps}=await import('./batched-ops.mjs');live();ops=await createBatchedModelOps({numThreads:prepared.numThreads??1});}live();
  if(!['linear','attentionTile'].every(key=>typeof ops?.[key]==='function'))throw TypeError('Native full-inner linear and batched attention owners required');
  const mathOwner=math;
  const compute=Object.fromEntries(['layerNorm','affineNorm','rmsNorm','modulate','gateResidual','add','gelu','silu','bias','sinusoidal','rope','divideAttention'].map(key=>[key,args=>timed('math',{operator:key,...Object.fromEntries(['rows','width','queries','heads','headDim','timestep'].filter(name=>args?.[name]!==undefined).map(name=>[name,args[name]]))},()=>mathOwner[key](args))]));
  const headSource={describe:()=>source.describe(),readRows:(key,start,count,options)=>timedAsync('weightReadDecode',{operator:key,weightRowStart:start,weightRows:count},()=>source.readRows(key,start,count,options)),readVector:(key,start,count,options)=>timedAsync('weightReadDecode',{operator:key,elementOffset:start,elements:count},()=>source.readVector(key,start,count,options))};
  const headOps={linear:args=>timedAsync('linear',{operator:'head.head.weight',rows:args.rows,columns:args.columns,inner:args.inner},()=>ops.linear(args))};
  head=createModelHead({source:headSource,math:compute,ops:headOps});
  const preparedWeightsEnabled=['prepareLinearWeight','linearPrepared','releaseLinearWeight'].every(key=>typeof ops[key]==='function');
  const persistentAttentionEnabled=['beginAttentionQuery','attentionQueryTile','finishAttentionQuery','releaseAttentionQuery'].every(key=>typeof ops[key]==='function');
  const release=value=>{if(value&&weights.has(value)){if(preparedHandles.has(value))timed('weightRelease',{...weightLabels.get(value)},()=>ops.releaseLinearWeight(value));weights.delete(value);metrics.stageWeightCacheBytes-=cacheSizes.get(value)??0;cacheSizes.delete(value);}};
  releaseRetained=release;
  const retain=value=>{weights.add(value);cacheSizes.set(value,value.byteLength);metrics.stageWeightCacheBytes+=value.byteLength;metrics.peakStageWeightCacheBytes=Math.max(metrics.peakStageWeightCacheBytes,metrics.stageWeightCacheBytes);return value;};
  async function vector(key,s){
   live(s);const entry=identity.entries[key],count=entry.fullShape.reduce((a,b)=>a*b,1);
   const result=new Float32Array(count);
   for(let start=0;start<count;start+=MODEL_WEIGHT_LIMITS.maxBlockElements){
    const n=Math.min(MODEL_WEIGHT_LIMITS.maxBlockElements,count-start),read=await timedAsync('weightReadDecode',{operator:key,elementOffset:start,elements:n},()=>source.readVector(key,start,n,{signal:s,diagnostics:false}));live(s);
    const values=copyF32(read.values,n,key);timed('hostCopy',{operator:key,bytes:values.byteLength},()=>result.set(values,start));metrics.sourceReads++;metrics.sourceF32Bytes+=values.byteLength;
   }
   return result;
  }
  async function matrix(key,s,start=0,count=identity.entries[key].fullShape[0]){
   live(s);const entry=identity.entries[key],inner=entry.columns,maxRows=Math.min(entry.maxRows,Math.floor(MODEL_WEIGHT_LIMITS.maxBlockElements/inner)),result=retain(new Float32Array(count*inner)),label={operator:key,weightRowStart:start,weightRows:count,inner};weightLabels.set(result,label);
   try{
    for(let row=0;row<count;row+=maxRows){
     const n=Math.min(maxRows,count-row),read=await timedAsync('weightReadDecode',{...label,weightRowStart:start+row,weightRows:n,elements:n*inner},()=>source.readRows(key,start+row,n,{signal:s,diagnostics:false}));live(s);
     const values=copyF32(read.values,n*inner,key);timed('hostCopy',{operator:key,bytes:values.byteLength},()=>result.set(values,row*inner));metrics.sourceReads++;metrics.sourceF32Bytes+=values.byteLength;
    }
    if(!preparedWeightsEnabled)return result;
    const byteLength=cacheSizes.get(result),handle=timed('weightPrepare',label,()=>ops.prepareLinearWeight({weight:result,columns:count,inner,ownership:'take'}));
    weights.delete(result);cacheSizes.delete(result);weights.add(handle);cacheSizes.set(handle,byteLength);preparedHandles.add(handle);weightLabels.set(handle,label);return handle;
   }catch(error){release(result);throw error;}
  }
  async function linear(x,weight,rows,columns,inner,bias,s){
   live(s);const detail={...weightLabels.get(weight),rows,columns,inner};
   const result=await timedAsync('linear',detail,()=>preparedHandles.has(weight)?ops.linearPrepared({x,weightHandle:weight,rows,signal:s}):ops.linear({x,weight,rows,columns,inner,signal:s}));live(s);metrics.linearRuns++;
   const value=copyF32(result.output,rows*columns,'Linear output');return bias?copyF32(compute.bias({input:value,bias,rows,width:columns}),rows*columns,'Biased output'):value;
  }
  async function dense(key,x,rows,inner,s){
   const weight=await matrix(key+'.weight',s);
   try{return await linear(x,weight,rows,identity.entries[key+'.weight'].fullShape[0],inner,await vector(key+'.bias',s),s);}finally{release(weight);}
  }
  function hiddenStores(count,total){metrics.activeHiddenStores=count;metrics.activeHiddenStoreBytes=count*total*W*4;metrics.peakHiddenStoreBytes=Math.max(metrics.peakHiddenStoreBytes,metrics.activeHiddenStoreBytes);}
  function modulated(x,rows,shift,scale){return compute.modulate({input:compute.layerNorm({input:x,rows,width:W,epsilon:EPS}),shift,scale,rows,width:W});}
  async function attend(q,queries,keys,values,totalKeys,s,detail={}){
   const query=timed('layoutCopy',{operator:'query-head-major',rows:queries,bytes:queries*W*4},()=>headMajor(queries,q));
   let handle=null,error,failed=false,state=persistentAttentionEnabled?null:{max:new Float32Array(H*queries).fill(INITIAL_MAX),denominator:new Float32Array(H*queries),context:new Float32Array(queries*W)};
   try{
    if(persistentAttentionEnabled)handle=timed('attentionPrepare',{...detail,queries,heads:H,headDim:D,expectedKeys:totalKeys},()=>ops.beginAttentionQuery({q:query,heads:H,queries,headDim:D,expectedKeys:totalKeys,signal:s}));
    for(let start=0;start<totalKeys;start+=K){
     const n=Math.min(K,totalKeys-start);live(s);
     const keyTile=timed('layoutCopy',{operator:'key-head-major',rows:n,bytes:n*W*4},()=>headMajor(n,keys,start)),valueTile=timed('layoutCopy',{operator:'value-head-major',rows:n,bytes:n*W*4},()=>headMajor(n,values,start));
     if(handle)await timedAsync('attention',{...detail,keyRowStart:start,keys:n,queries,heads:H,headDim:D},()=>ops.attentionQueryTile({queryHandle:handle,k:keyTile,v:valueTile,keys:n,signal:s}));
     else state=await timedAsync('attention',{...detail,keyRowStart:start,keys:n,queries,heads:H,headDim:D},()=>ops.attentionTile({q:query,k:keyTile,v:valueTile,previousMax:state.max,previousDenominator:state.denominator,previousContext:state.context,heads:H,queries,keys:n,headDim:D,signal:s}));
     live(s);metrics.attentionTiles++;
    }
    if(handle)state=timed('attentionFinish',{...detail,queries,heads:H,headDim:D},()=>ops.finishAttentionQuery(handle,{signal:s}));
    const normalized=copyF32(compute.divideAttention({context:state.context,denominator:state.denominator,heads:H,queries,headDim:D}),queries*W,'Normalized attention');
    return timed('layoutCopy',{operator:'attention-row-major',rows:queries,bytes:queries*W*4},()=>rowMajor(normalized,queries));
   }catch(failure){failed=true;error=failure;throw failure;}
   finally{if(handle)try{timed('attentionRelease',detail,()=>ops.releaseAttentionQuery(handle));}catch(cleanupError){throw failed?new AggregateError([error,cleanupError],'Attention query and release failed',{cause:error}):cleanupError;}}
  }
  async function prefix(sequence,conditioning,timestep,total,s,progress,trace){
   const sinusoid=compute.sinusoidal({timestep}),timeFirst=compute.silu({input:await dense('time_embedding.0',sinusoid,1,256,s)}),e=await dense('time_embedding.2',timeFirst,1,W,s),timeAct1=compute.silu({input:e}),projectionBias=await vector('time_projection.1.bias',s),e0=[];
   for(let chunk=0;chunk<6;chunk++){const weight=await matrix('time_projection.1.weight',s,chunk*W,W);try{e0.push(await linear(timeAct1,weight,1,W,W,projectionBias.slice(chunk*W,(chunk+1)*W),s));}finally{release(weight);}}
   if(currentChunks){
    await emitRows('timeRaw',e,[1,W],0,W,0,1);await emitRows('timeAct1',timeAct1,[1,W],0,W,0,1);
    for(let chunk=0;chunk<6;chunk++)await emitRows('timeProjection',e0[chunk],[1,6,W],1,W,chunk,1);
   }
   let text=new Float32Array(conditioning.rows*W);
   for(const [stage,inner]of [['text_embedding.0',4096],['text_embedding.2',W]]){
    const weight=await matrix(stage+'.weight',s),bias=await vector(stage+'.bias',s),input=stage.endsWith('.0')?conditioning.data:text,output=new Float32Array(conditioning.rows*W);
    try{for(let start=0;start<conditioning.rows;start+=R){const rows=Math.min(R,conditioning.rows-start),value=await linear(input.slice(start*inner,(start+rows)*inner),weight,rows,W,inner,bias,s);output.set(stage.endsWith('.0')?compute.gelu({input:value}):value,start*W);if(currentChunks&&stage.endsWith('.2'))await emitRows('textEmbedded',value,[1,conditioning.rows,W],1,W,start,rows);}}finally{release(weight);}
    text=output;
   }
   const weight=await matrix('patch_embedding.weight',s),bias=await vector('patch_embedding.bias',s),hidden=new Float32Array(total*W);hiddenStores(1,total);
   try{for(let start=0;start<total;start+=R){const rows=Math.min(R,total-start),value=await linear(sequence.readPatchRows(start,rows),weight,rows,W,64,bias,s);hidden.set(value,start*W);if(currentChunks)await emitRows('patchHidden',value,[1,total,W],1,W,start,rows,null,true);progress('patch',null,start+rows,total);}}finally{release(weight);}
   if(trace){
    const projectedTime=new Float32Array(6*W);for(let chunk=0;chunk<6;chunk++)projectedTime.set(e0[chunk],chunk*W);
    await trace('patchHidden',[1,total,W],hidden);await trace('textEmbedded',[1,conditioning.rows,W],text);await trace('timeRaw',[1,W],e);await trace('timeAct1',[1,W],timeAct1);await trace('timeProjection',[1,6,W],projectedTime);
   }
   return {hidden,text,e,e0};
  }
  async function selfAttention(input,sequence,total,block,modulation,s,progress){
   const base='blocks.'+block+'.self_attn',keys=new Float32Array(total*W),values=new Float32Array(total*W),output=new Float32Array(total*W);hiddenStores(4,total);
   // K/V share one LN1/modulation result per row. Their two matrices occupy
   // the same 2x5120^2 cache bound already required by the Q/O phase. Every
   // scalar projection/norm/RoPE operation remains unchanged.
   const kw=await matrix(base+'.k.weight',s),vw=await matrix(base+'.v.weight',s);
   try{
    const kb=await vector(base+'.k.bias',s),vb=await vector(base+'.v.bias',s),kn=await vector(base+'.norm_k.weight',s);
    for(let start=0;start<total;start+=R){
     const rows=Math.min(R,total-start),x=modulated(input.slice(start*W,(start+rows)*W),rows,modulation[0],modulation[1]);
     if(currentChunks)await emitRows('postModulated',x,[1,total,W],1,W,start,rows,block,true);
     const kp=await linear(x,kw,rows,W,W,kb,s),normalized=compute.rmsNorm({input:kp,weight:kn,rows,width:W,epsilon:EPS}),k=compute.rope({input:normalized,rows,...sequence.readPositions(start,rows)}),v=await linear(x,vw,rows,W,W,vb,s);
     keys.set(k,start*W);values.set(v,start*W);
     if(currentChunks){await emitRows('kProjected',kp,[1,total,H,D],1,W,start,rows,block,true);await emitRows('kNormalized',normalized,[1,total,H,D],1,W,start,rows,block,true);await emitRows('k',k,[1,total,H,D],1,W,start,rows,block,true);await emitRows('v',v,[1,total,H,D],1,W,start,rows,block,true);}
     progress('self-k',block,start+rows,total);progress('self-v',block,start+rows,total);
    }
   }finally{release(kw);release(vw);}
   const qw=await matrix(base+'.q.weight',s),ow=await matrix(base+'.o.weight',s);
   try{
    const qb=await vector(base+'.q.bias',s),ob=await vector(base+'.o.bias',s),qn=await vector(base+'.norm_q.weight',s);
    for(let start=0;start<total;start+=R){
     const rows=Math.min(R,total-start),original=input.slice(start*W,(start+rows)*W),x=modulated(original,rows,modulation[0],modulation[1]),qp=await linear(x,qw,rows,W,W,qb,s),normalized=compute.rmsNorm({input:qp,weight:qn,rows,width:W,epsilon:EPS}),q=compute.rope({input:normalized,rows,...sequence.readPositions(start,rows)});
     if(currentChunks){await emitRows('qProjected',qp,[1,total,H,D],1,W,start,rows,block,true);await emitRows('qNormalized',normalized,[1,total,H,D],1,W,start,rows,block,true);await emitRows('q',q,[1,total,H,D],1,W,start,rows,block,true);}
     const context=await attend(q,rows,keys,values,total,s,{phase:'self-attention',block,queryRowStart:start}),projected=await linear(context,ow,rows,W,W,ob,s),residual=compute.gateResidual({base:original,value:projected,gate:modulation[2],rows,width:W});output.set(residual,start*W);
     if(currentChunks){await emitRows('selfAttention',context,[1,total,H,D],1,W,start,rows,block,true);await emitRows('oProjection',projected,[1,total,W],1,W,start,rows,block,true);await emitRows('selfResidual',residual,[1,total,W],1,W,start,rows,block,true);}
     progress('self-attention',block,start+rows,total);
    }
   }finally{release(qw);release(ow);}
   return output;
  }
  async function crossAttention(hidden,text,textRows,total,block,s,progress){
   const base='blocks.'+block+'.cross_attn',keys=new Float32Array(textRows*W),values=new Float32Array(textRows*W);
   for(const [kind,store]of [['k',keys],['v',values]]){
    const weight=await matrix(base+'.'+kind+'.weight',s),bias=await vector(base+'.'+kind+'.bias',s),norm=kind==='k'?await vector(base+'.norm_k.weight',s):null;
    try{for(let start=0;start<textRows;start+=R){const rows=Math.min(R,textRows-start);let projected=await linear(text.slice(start*W,(start+rows)*W),weight,rows,W,W,bias,s);if(norm)projected=compute.rmsNorm({input:projected,weight:norm,rows,width:W,epsilon:EPS});store.set(projected,start*W);if(currentChunks)await emitRows(kind==='k'?'crossK':'crossV',projected,[1,textRows,H,D],1,W,start,rows,block);}}finally{release(weight);}
   }
   const qw=await matrix(base+'.q.weight',s),ow=await matrix(base+'.o.weight',s);
   try{
    const qb=await vector(base+'.q.bias',s),ob=await vector(base+'.o.bias',s),qn=await vector(base+'.norm_q.weight',s),nw=await vector('blocks.'+block+'.norm3.weight',s),nb=await vector('blocks.'+block+'.norm3.bias',s);
    for(let start=0;start<total;start+=R){
     const rows=Math.min(R,total-start),original=hidden.slice(start*W,(start+rows)*W),x=compute.affineNorm({input:original,weight:nw,bias:nb,rows,width:W,epsilon:EPS}),q=compute.rmsNorm({input:await linear(x,qw,rows,W,W,qb,s),weight:qn,rows,width:W,epsilon:EPS});
     if(currentChunks)await emitRows('crossQ',q,[1,total,H,D],1,W,start,rows,block,true);
     const context=await attend(q,rows,keys,values,textRows,s,{phase:'cross-attention',block,queryRowStart:start}),projected=await linear(context,ow,rows,W,W,ob,s),residual=compute.add({a:original,b:projected});hidden.set(residual,start*W);
     if(currentChunks){await emitRows('crossAttention',context,[1,total,H,D],1,W,start,rows,block,true);await emitRows('crossResidual',residual,[1,total,W],1,W,start,rows,block,true);}
     progress('cross-attention',block,start+rows,total);
    }
   }finally{release(qw);release(ow);}
  }
  async function ffn(hidden,total,block,modulation,s,progress){
   const base='blocks.'+block+'.ffn',chunks=[];let down=null;
   try{
    for(let start=0;start<F;start+=W){const count=Math.min(W,F-start);chunks.push({start,count,weight:await matrix(base+'.0.weight',s,start,count)});}
    down=await matrix(base+'.2.weight',s);const upBias=await vector(base+'.0.bias',s),downBias=await vector(base+'.2.bias',s);
    for(let start=0;start<total;start+=R){
     const rows=Math.min(R,total-start),original=hidden.slice(start*W,(start+rows)*W),x=modulated(original,rows,modulation[3],modulation[4]),expanded=new Float32Array(rows*F);
     for(const chunk of chunks){const projected=await linear(x,chunk.weight,rows,chunk.count,W,upBias.slice(chunk.start,chunk.start+chunk.count),s);for(let row=0;row<rows;row++)expanded.set(projected.subarray(row*chunk.count,(row+1)*chunk.count),row*F+chunk.start);}
     const activated=compute.gelu({input:expanded}),projected=await linear(activated,down,rows,W,F,downBias,s),residual=compute.gateResidual({base:original,value:projected,gate:modulation[5],rows,width:W});hidden.set(residual,start*W);
     if(currentChunks){await emitRows('ffnPostModulated',x,[1,total,W],1,W,start,rows,block,true);await emitRows('ffnUp',expanded,[1,total,F],1,F,start,rows,block,true);await emitRows('ffnActivated',activated,[1,total,F],1,F,start,rows,block,true);await emitRows('ffnDown',projected,[1,total,W],1,W,start,rows,block,true);await emitRows('ffnOutput',residual,[1,total,W],1,W,start,rows,block,true);}
     progress('ffn',block,start+rows,total);
    }
   }finally{for(const chunk of chunks)release(chunk.weight);release(down);}
  }
  async function execute(input={},onTrace=null,chunkOptions=null){
    live();if(busy)throw Error('Model candidate busy');busy=true;let sequence=null,hidden=null,resolveTerminal,executionError,executionFailed=false,counted=null;
    currentTiming=createModelExecutionTiming();currentChunks=null;currentContext=null;metrics.lastFailure=null;
    activeController=new AbortController();activeTerminal=new Promise(resolve=>{resolveTerminal=resolve;});const listeners=[];
    try{
     known(input,['shapeRequest','tensors','conditioning','timestep','signal','onProgress'],'candidate prediction');
     for(const external of [signal,input.signal])if(external!==undefined){
      abort(external);const relay=()=>activeController?.abort(signalReason.call(external));signalAddListener.call(external,'abort',relay,{once:true});listeners.push([external,relay]);
     }
     const s=activeController.signal,timestep=input.timestep,onProgress=input.onProgress;live(s);
     if(typeof timestep!=='number'||!Number.isFinite(timestep)||timestep<0||timestep>1000)throw RangeError('Timestep in 0..1000 required');
     if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('onProgress must be a function');
     sequence=timed('inputSnapshot',{operator:'canonical-sequence'},()=>createModelSequence({shapeRequest:input.shapeRequest,tensors:input.tensors}));const layout=sequence.describe(),plannedHiddenStoreBytes=layout.totalTokens*W*4;
     if(layout.totalTokens>MODEL_CANDIDATE_LIMITS.maxSequenceTokens||plannedHiddenStoreBytes>=MODEL_CANDIDATE_LIMITS.maxHiddenStoreBytesExclusive)throw Object.assign(new RangeError('Complete target/context sequence exceeds the selected host allocation planning cap'),{code:'RESOURCE_BUDGET',details:{totalTokens:layout.totalTokens,maxSequenceTokens:MODEL_CANDIDATE_LIMITS.maxSequenceTokens,hostHiddenStoreCount:4,plannedHiddenStoreBytes,plannedFourHiddenStoreBytes:4*plannedHiddenStoreBytes,maxHiddenStoreBytesExclusive:MODEL_CANDIDATE_LIMITS.maxHiddenStoreBytesExclusive,planningCapOnly:true,aggregatePeakMeasured:false,acceptedProduction:false}});
     const conditioning=timed('inputSnapshot',{operator:'native-conditioning'},()=>snapshotP4NativeConditioning(input.conditioning));
     if(onTrace&&layout.totalTokens>MODEL_CANDIDATE_LIMITS.diagnosticMaxTokens)throw RangeError('Diagnostic trace requires totalTokens<=128; use diagnoseChunks for bounded whole-sequence comparison');
     if(conditioning.metadata.nativeTensorMetadata.normalization!=='umt5-final-rmsnorm-f32-v1')throw TypeError('Canonical umt5-final-rmsnorm-f32-v1 Text normalization required');
     for(let i=0;i<layout.streams.length;i++){const stream=layout.streams[i];if(stream.dtype!=='float32'||stream.meaning!==(i===0?'bernini-generated-model-latent:v1':'wan21-normalized-posterior-mean:v1')||stream.normalization!=='wan21-comfy-f32-v1')throw TypeError('Canonical native float32 Bernini model latent semantics required');}
     currentContext={sequence,block:null,phase:'prefix'};
     if(chunkOptions)currentChunks=createModelChunkEmitter({options:chunkOptions,model:{side:identity.side,modelSha256:identity.modelHash},timestep,signal:s,check:()=>live(s)});
     const total=layout.totalTokens,progress=(stage,block,completedRows,totalRows)=>{live(s);onProgress?.({profile:MODEL_CANDIDATE_PROFILE,stage,block,completedRows,totalRows,blocks:40,acceptedProduction:false,timing:currentTiming.snapshot(),...(currentChunks?{chunkDiagnostics:currentChunks.stats()}:{} )});live(s);},trace=onTrace?async(name,shape,data)=>{live(s);await onTrace({name,shape:[...shape],data:new Float32Array(data),dtype:'float32',profile:MODEL_CANDIDATE_PROFILE,acceptedProduction:false});live(s);}:null;
     const started=performance.now(),before={sourceReads:metrics.sourceReads,sourceF32Bytes:metrics.sourceF32Bytes,linearRuns:metrics.linearRuns,attentionTiles:metrics.attentionTiles},beforeOps=ops.stats?.();metrics.blocksCompleted=0;
     const prefixResult=await timedAsync('stage.prefix',{stage:'prefix'},()=>prefix(sequence,conditioning,timestep,total,s,progress,trace));hidden=prefixResult.hidden;prefixResult.hidden=null;
     for(let block=0;block<40;block++){
      currentContext.block=block;currentContext.phase='block-modulation';
      const raw=await vector('blocks.'+block+'.modulation',s),modulation=[];for(let chunk=0;chunk<6;chunk++)modulation.push(compute.add({a:raw.slice(chunk*W,(chunk+1)*W),b:prefixResult.e0[chunk]}));
      if(currentChunks)await emitRows('blockInput',hidden,[1,total,W],1,W,0,total,block,true);
      currentContext.phase='self-attention';hidden=await timedAsync('stage.selfAttention',{stage:'self-attention',block},()=>selfAttention(hidden,sequence,total,block,modulation,s,progress));
      hiddenStores(1,total);currentContext.phase='cross-attention';await timedAsync('stage.crossAttention',{stage:'cross-attention',block},()=>crossAttention(hidden,prefixResult.text,conditioning.rows,total,block,s,progress));
      currentContext.phase='ffn';await timedAsync('stage.ffn',{stage:'ffn',block},()=>ffn(hidden,total,block,modulation,s,progress));metrics.blocksCompleted=block+1;
      if(currentChunks)await emitRows('blockOutput',hidden,[1,total,W],1,W,0,total,block,true);
      progress('block-complete',block,total,total);if(trace)await trace('block'+String(block).padStart(2,'0')+'Output',[1,total,W],hidden);
      if(chunkOptions?.stopAfterBlock===block){
       const evidence={profile:MODEL_CANDIDATE_PROFILE,diagnosticOnly:true,stoppedAfterBlock:block,blocksCompleted:metrics.blocksCompleted,totalTokens:total,targetTokens:layout.targetTokens,contextTokens:layout.contextTokens,targetShape:[...layout.targetShape],textRows:conditioning.rows,headExecuted:false,targetExtractionPerformed:false,fullPrediction:false,acceptedProduction:false,timings:currentTiming.snapshot(),chunks:currentChunks.stats(),elapsedMs:performance.now()-started};
       metrics.diagnosticRuns++;counted='diagnostic';metrics.lastDiagnostic=structuredClone(evidence);
       return {kind:'diagnostic-block-result',...evidence};
      }
     }
     currentContext.block=null;currentContext.phase='head';
     const output=new Float32Array(layout.targetShape.reduce((a,b)=>a*b,1)),headAll=trace?new Float32Array(total*64):null;let headRows=0,writtenRows=0;
     await timedAsync('stage.head',{stage:'head'},async()=>{
      for(let start=0;start<total;start+=R){
       const rows=Math.min(R,total-start),beforeHead=head.stats();let projected;
       try{projected=await head.run({hidden:hidden.slice(start*W,(start+rows)*W),timeEmbedding:prefixResult.e,rows,signal:s});}finally{const afterHead=head.stats();metrics.sourceReads+=afterHead.sourceReads-beforeHead.sourceReads;metrics.sourceF32Bytes+=afterHead.sourceF32Bytes-beforeHead.sourceF32Bytes;metrics.linearRuns+=afterHead.runs-beforeHead.runs;}
       live(s);if(currentChunks)await emitRows('headAll',projected,[1,total,64],1,64,start,rows);
       const write=sequence.writeTargetHeadRows(projected,start,output);headRows+=write.processedRows;writtenRows+=write.writtenTargetRows;if(headAll)headAll.set(projected,start*64);progress('head',null,start+rows,total);
      }
     });
     if(trace){await trace('headAll',[1,total,64],headAll);await trace('prediction',layout.targetShape,output);}
     if(currentChunks)await emitRows('prediction',output,layout.targetShape,null,layout.targetShape.at(-1),0,output.length/layout.targetShape.at(-1));
     const afterOps=ops.stats?.(),copyDelta=key=>Number.isFinite(beforeOps?.[key])&&Number.isFinite(afterOps?.[key])?afterOps[key]-beforeOps[key]:null;
     const operatorTimings=beforeOps?.timings&&afterOps?.timings?Object.fromEntries(Object.keys(afterOps.timings).map(key=>[key,afterOps.timings[key]-(beforeOps.timings[key]??0)])):null;
     const evidence={profile:MODEL_CANDIDATE_PROFILE,experimental:true,acceptedProduction:false,generationReady:false,blockCount:40,blocksCompleted:metrics.blocksCompleted,totalTokens:total,targetTokens:layout.targetTokens,contextTokens:layout.contextTokens,headRows,writtenTargetRows:writtenRows,textRows:conditioning.rows,textMask:'validated provenance; every supplied row participates in cross-attention softmax',rawTimeEmbeddingInHead:true,weightStrategy:preparedWeightsEnabled?'owned opaque stage weights; one validated JS buffer and persistent ORT Tensor reused; native WASM uploads not measured':'host full stage matrices, loaded once per prediction; compact FFN output chunks; head cache retained; ORT weight inputs snapshotted on every tile',preparedWeightsEnabled,persistentAttentionEnabled,sourceReads:metrics.sourceReads-before.sourceReads,sourceF32Bytes:metrics.sourceF32Bytes-before.sourceF32Bytes,linearRuns:metrics.linearRuns-before.linearRuns,attentionTiles:metrics.attentionTiles-before.attentionTiles,operatorInputCopyBytes:copyDelta('inputCopyBytes'),operatorOutputCopyBytes:copyDelta('outputCopyBytes'),operatorRuntimeInputSpanBytes:copyDelta('runtimeInputSpanBytes'),timings:currentTiming.snapshot(),operatorTimings,...(currentChunks?{chunkDiagnostics:currentChunks.stats()}:{}),elapsedMs:performance.now()-started,source:{side:identity.side,modelSha256:identity.modelHash,headerSHA256:identity.headerSHA256,fullFileSHA256Verified:false},originalProductionPrecisionVerified:false};
     metrics.predictions++;counted='prediction';metrics.lastRun=structuredClone(evidence);
     return {data:output,dtype:'float32',shape:[...layout.targetShape],layout:'NCTHW',meaning:'bernini-flow-velocity:v1',space:'model',modelSha256:identity.modelHash,evidence};
    }catch(error){executionFailed=true;executionError=error;try{const ownerState=ops.stats?.();if(ownerState?.closing||ownerState?.cleanupPending||ownerState?.attentionQueries?.cleanupPending)closing=true;}catch{}metrics.failedPredictions++;metrics.lastFailure={name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,1000),code:error?.code??null,context:currentContext?{block:currentContext.block,phase:currentContext.phase}:null,timing:currentTiming.snapshot(),chunkDiagnostics:currentChunks?.stats()??null};throw error;}
    finally{
     const cleanupErrors=[];hidden=null;
     try{sequence?.dispose();}catch(error){cleanupErrors.push(error);}
     for(const weight of [...weights])try{release(weight);}catch(error){cleanupErrors.push(error);}
     hiddenStores(0,0);
     for(const [external,relay]of listeners)try{signalRemoveListener.call(external,'abort',relay);}catch(error){cleanupErrors.push(error);}
     try{
      metrics.lastTiming={...currentTiming.snapshot(),...(currentChunks?{chunkDiagnostics:currentChunks.stats()}:{}),cleanupErrors:cleanupErrors.map(error=>String(error.message??error))};
      if(cleanupErrors.length){closing=true;if(counted==='prediction')metrics.predictions--;if(counted==='diagnostic')metrics.diagnosticRuns--;if(!executionFailed)metrics.failedPredictions++;throw new AggregateError([...(executionFailed?[executionError]:[]),...cleanupErrors],'Model prediction cleanup incomplete; recover/dispose required before retry',{cause:executionFailed?executionError:cleanupErrors[0]});}
     }finally{currentTiming=null;currentChunks=null;currentContext=null;busy=false;activeController=null;activeTerminal=null;resolveTerminal();}
    }
  }
  return Object.freeze({
   predict(input={}){return execute(input);},
   diagnose(input={},options={}){known(options,['onTrace'],'candidate diagnostics');if(typeof options.onTrace!=='function')return Promise.reject(TypeError('diagnose requires an onTrace function'));return execute(input,options.onTrace);},
   diagnoseChunks(input={},options={}){let captured;try{captured=validateModelChunkOptions(options);}catch(error){return Promise.reject(error);}return execute(input,null,captured);},
   describe(){live();return {schemaVersion:'works-bernini-model-candidate/0.1',profile:MODEL_CANDIDATE_PROFILE,experimental:true,acceptedProduction:false,generationReady:false,publicRuntimeEnabled:false,model:{side:identity.side,modelSha256:identity.modelHash,headerSHA256:identity.headerSHA256,pinnedCoreCommit:identity.pinnedCoreCommit,fullFileSHA256Verified:false},limits:{...MODEL_CANDIDATE_LIMITS},chunkDiagnostics:{schemaVersion:'bernini-model-chunk/1',maxRows:128,maxElements:MODEL_CHUNK_MAX_ELEMENTS,stages:[...MODEL_CHUNK_STAGES],legacyTraceMaxTokens:128,wholeSequenceChunkComparison:true,diagnosticStopAfterBlock:true},allocationAdmission:{kind:'conservative host allocation planning cap; not an accepted production domain',maxSequenceTokens:90000,hostHiddenStoreCount:4,hiddenStoreDtype:'float32',hiddenStoreWidth:5120,plannedHiddenStoreBytesAtCap:1843200000,plannedFourHiddenStoreBytesAtCap:7372800000,maxHiddenStoreBytesExclusive:2147483648,aggregatePeakMeasured:false},graph:'patch/text/time prefix -> all 40 global-self/cross/FFN blocks -> final head on all tokens -> target-only unpatchify',conditioning:'canonical native Text float32 BLC [1,L,4096], L1..512, known model/tokenizer, mask and umt5-final-rmsnorm-f32-v1',attention:'all sequence keys; query128/key256 tiles; no score matrix spanning the sequence; native denominator division; cross text mask not applied to softmax',memory:'self: block input, output, K and V host stores of N*5120; Q per128rows; cross/FFN inplace after self stores released; one stage cache, not all40 blocks',resourceAccounting:'named host spans and stage weight caches only; temporary snapshots, source decode buffers, GC latency and ORT allocator additional; aggregate peak unmeasured',lora:'no adapter application in this base candidate',output:{dtype:'float32',layout:'NCTHW',meaning:'bernini-flow-velocity:v1',space:'model',coordinates:'flow velocity in Bernini model latent coordinates; not a generated sample or VAE posterior mean'},originalProductionPrecisionVerified:false,requiredShapeAcceptance:'BLOCKED: complete requested target/context, all40 blocks and final head require scoped native numerical and aggregate resource acceptance'};},
   stats(){return {...structuredClone(metrics),timing:currentTiming?.snapshot()??structuredClone(metrics.lastTiming),chunkDiagnostics:currentChunks?.stats()??metrics.lastTiming?.chunkDiagnostics??null,busy,disposed,closing,head:head?.stats()??null,math:math?.stats?.()??null,ops:ops?.stats?.()??null,source:source?.stats?.()??null};},
   dispose,recover:dispose
  });
 }catch(error){closing=true;try{await cleanup();disposed=true;}catch(cleanupError){throw new AggregateError([error,cleanupError],'Model candidate preparation and cleanup failed',{cause:error});}throw error;}
}

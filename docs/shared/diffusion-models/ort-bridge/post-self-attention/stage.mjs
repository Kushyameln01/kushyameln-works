import {createP4Linear} from './linear.mjs';
import {createPostSelfAttentionMath} from './math.mjs';
import {snapshotP4CapturedConditioning,p4ConditioningMetadataBytes} from './conditioning.mjs';
import {createStreamAccumulator} from '../stream-attention/hike.mjs';
import {STREAM_WASM_SHA256} from '../stream-attention/registry.mjs';
import {BRIDGE_WASM_SHA256} from '../kernel/registry.mjs';
import {POST_SELF_ATTENTION_MATH_SHA256} from './registry.mjs';
import {releaseOwnedResources,cleanupAfterFailure} from '../qkv/ownership.mjs';
import {Sha256} from '../../../vr180/sha256.mjs';
export const POST_SELF_ATTENTION_PROFILE='bernini-block0-n2-cross-ffn-f32-candidate-v1';
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const clone=x=>structuredClone(x),abort=signal=>signal?.throwIfAborted();
const slots=Object.fromEntries(['length','byteOffset','byteLength','buffer'].map(k=>[k,Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Float32Array.prototype),k).get]));
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
function bytes(x){if(Object.getPrototypeOf(x??{})===ArrayBuffer.prototype)return new Uint8Array(x).slice();if(ArrayBuffer.isView(x)&&Object.getPrototypeOf(x)===Uint8Array.prototype){const b=slots.buffer.call(x);if(b instanceof ArrayBuffer&&slots.byteOffset.call(x)===0&&slots.byteLength.call(x)===bufferLength.call(b))return new Uint8Array(x);}throw TypeError('Native compact nonshared operator bytes required');}
function f32(x,n){if(!ArrayBuffer.isView(x)||Object.getPrototypeOf(x)!==Float32Array.prototype)throw TypeError('Native compact nonshared exact-shape F32 required');const b=slots.buffer.call(x);if(!(b instanceof ArrayBuffer)||slots.length.call(x)!==n||slots.byteOffset.call(x)!==0||slots.byteLength.call(x)!==bufferLength.call(b))throw TypeError('Native compact nonshared exact-shape F32 required');const y=new Float32Array(x);if(!y.every(Number.isFinite))throw TypeError('Finite F32 required');if(!y.every(v=>Math.abs(v)<=1e16))throw RangeError('P4 numeric admission exceeded');return y;}
export function snapshotPostSelfAttentionInputs(input={}){
 if(Object.keys(input).some(k=>!['residual','timeAct1','conditioning','signal','onProgress'].includes(k)))throw TypeError('Unknown P4 run input; N2/profile/core shape are fixed');
 const {residual,timeAct1,conditioning,signal,onProgress}=input;
 if(signal!==undefined&&!(signal instanceof AbortSignal))throw TypeError('AbortSignal required');abort(signal);if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('Progress callback required');
 return {residual:f32(residual,10240),timeAct1:f32(timeAct1,5120),conditioning:snapshotP4CapturedConditioning(conditioning),signal,onProgress};
}
export function describeP4ProjectionSelection(entry,{rowStart,rows,inner}){
 const original=clone(entry),originalAbsoluteByteOffset=original.absoluteByteOffset??null,storageWidth=original.storageDtype==='F16'?2:original.storageDtype==='F8_E4M3'?1:null;
 return {...original,originalAbsoluteByteOffset,absoluteByteOffset:originalAbsoluteByteOffset===null||storageWidth===null?null:originalAbsoluteByteOffset+rowStart*inner*storageWidth,rowStart,rowCount:rows,elementOffset:rowStart*inner,elementCount:rows*inner,selectedRows:[rowStart,rowStart+rows],selectedElementCount:rows*inner,selectedByteLength:storageWidth===null?null:rows*inner*storageWidth};
}
const flags=()=>({productionHiddenVerified:false,originalWorkflowInputsVerified:false,originalProductionPrecisionVerified:false,fullBlockVerified:false,modelInference:false,lowIsHighHandoff:false,generationReady:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'});
function sourceContract(source){if(!source||['describe','readRows','readVector','addBias','stats'].some(k=>typeof source[k]!=='function'))throw TypeError('Explicit final-F32 P4 source required');return source;}
function sourceIdentity(d){return {epoch:d.epoch??d.weightFeed?.epoch??null,packageHash:d.packageHash??d.weightFeed?.packageHash??null};}
function memoryOf(s){return s?.hike?.memoryBytes??s?.source?.hike?.memoryBytes??s?.base?.hike?.memoryBytes??null;}
export async function createPostSelfAttention(options={}){
 if(Object.keys(options).some(k=>!['source','mathBytes','attentionBytes','disposeSource'].includes(k)))throw TypeError('Unknown P4 constructor input');
 let {source,mathBytes,attentionBytes,disposeSource=false}=options;sourceContract(source);if(typeof disposeSource!=='boolean')throw TypeError('Explicit disposeSource boolean required');
 if(mathBytes!==undefined)mathBytes=bytes(mathBytes);if(attentionBytes!==undefined)attentionBytes=bytes(attentionBytes);
 let math=null,linear=null,attention=null,busy=false,disposed=false,closing=false,active=null,pending=null;
 let completedRuns=0,cancelledRuns=0,inputSnapshotCopyBytes=0,returnedOutputBytes=0,projectionTiles=0;
 const live=()=>{if(disposed)throw Error('Post self-attention disposed');if(closing)throw Object.assign(Error('P4 resource recovery required'),{code:'RECOVERY_REQUIRED'});};
 const cleanup=()=>releaseOwnedResources([{value:linear,release:v=>v.dispose(),clear:()=>linear=null},{value:math,release:v=>v.dispose(),clear:()=>math=null},{value:attention,release:v=>v.dispose(),clear:()=>attention=null},{value:disposeSource?source:null,release:v=>v.dispose(),clear:()=>source=null}]);
 const dispose=()=>{if(disposed)return Promise.resolve();if(pending)return pending;closing=true;pending=(async()=>{try{await active;await cleanup();disposed=true;closing=false;}finally{pending=null;}})();return pending;};
 try{
  math=await createPostSelfAttentionMath({wasmBytes:mathBytes});
  if(attentionBytes===undefined){const response=await fetch(new URL('../stream-attention/kernel.wasm',import.meta.url));if(!response.ok)throw Error('Stream accumulator unavailable');attentionBytes=await response.arrayBuffer();}
  attention=await createStreamAccumulator(attentionBytes);linear=await createP4Linear();
  const operatorSources={upstreamCoreCommit:'b5a432157de6b8884f81104cd02926adf4d597e4',bridgeWasmSHA256:BRIDGE_WASM_SHA256,mathWasmSHA256:POST_SELF_ATTENTION_MATH_SHA256,attentionWasmSHA256:STREAM_WASM_SHA256,linear:linear.describe()};
  return Object.freeze({
   describe(){live();return {schemaVersion:'bernini-post-self-attention/0.1',executionProfileId:POST_SELF_ATTENTION_PROFILE,tokens:2,hiddenWidth:5120,textWidth:4096,textRows:[1,512],ffnWidth:13824,headCount:40,headDim:128,epsilon:1e-6,inputBinding:'caller-supplied candidate values; no producer/schedule authentication',producerAuthenticated:false,mask:'none; captured mask retained as provenance',rope:'none',timeProjectionChunks:[3,4,5],source:clone(source.describe()),operatorSources:clone(operatorSources),...flags()};},
   async run(input={}){
    live();if(busy)throw Error('Post self-attention busy');busy=true;let done,lease=null,operationSignal;active=new Promise(resolve=>done=resolve);
    try{
     // Hidden values, conditioning metadata/mask and weight epoch are owned before
     // hashing or operator awaits can permit caller mutation/commit.
     const owned=snapshotPostSelfAttentionInputs(input),{signal,onProgress}=owned;operationSignal=signal;
     lease=typeof source.captureSource==='function'?source.captureSource():null;const runSource=sourceContract(lease??source),original=clone(runSource.describe()),pinned=sourceIdentity(original);
     const check=()=>{abort(signal);if(closing)throw Error('P4 disposal requested during run');const current=sourceIdentity(runSource.describe());if(current.epoch!==pinned.epoch||current.packageHash!==pinned.packageHash)throw Error('P4 source epoch/package changed during run');};
     const inspectTile=tile=>{const binding=tile.source?.weightFeed;if(binding&&(binding.epoch!==pinned.epoch||binding.packageHash!==pinned.packageHash))throw Error('P4 tile weight-feed epoch/package mismatch');};
     const L=owned.conditioning.rows,inputBytes=owned.residual.byteLength+owned.timeAct1.byteLength+(owned.conditioning.sealBytes??owned.conditioning.data.byteLength+owned.conditioning.attentionMask.byteLength);inputSnapshotCopyBytes+=inputBytes;
     const before={source:runSource.stats(),linear:linear.stats(),math:math.stats(),attention:attention.stats()},started=performance.now(),conditioningMetadataBytes=p4ConditioningMetadataBytes(owned.conditioning.metadata);
     const inputHashes={residualSHA256:await sha(owned.residual),timeAct1SHA256:await sha(owned.timeAct1),conditioningSHA256:await sha(owned.conditioning.data),conditioningMaskSHA256:await sha(owned.conditioning.attentionMask),conditioningMetadataSHA256:await sha(conditioningMetadataBytes)};check();
     const parameterSources={};let tiles=0,readMs=0,linearMs=0,biasMs=0,mathMs=0,attentionMs=0,linearOutputAssemblyBytes=0,projectionBatchCopyBytes=0,maxDecodedWeightTileBytes=0,maxRawWeightTileBytes=0,maxLinearInputBytes=0,maxBiasVectorBytes=0,sourceVectorSnapshotBytes=0,projectionBiasTileCopyBytes=0,geluBatchCopyBytes=0,geluOutputAssemblyBytes=0;
     const callMath=(name,...args)=>{const start=performance.now(),value=math[name](...args);mathMs+=performance.now()-start;return value;};
     const vector=async(key,start,count)=>{const at=performance.now(),v=await runSource.readVector(key,start,count,{signal});check();inspectTile(v);readMs+=performance.now()-at;parameterSources[key+(start?':'+start:'')]=clone(v.source);const values=f32(v.values,count);sourceVectorSnapshotBytes+=values.byteLength;return values;};
     const project=async(key,x,rows,inner,columns,rowStart=0)=>{
      const biasRead=await vector(key.replace('.weight','.bias'),rowStart,columns);maxBiasVectorBytes=Math.max(maxBiasVectorBytes,biasRead.byteLength);
      const out=new Float32Array(rows*columns),rawHasher=new Sha256(),effectiveHasher=new Sha256(),tileBindings=[];const tileColumns=inner===13824?4:16;
      for(let column=0;column<columns;column+=tileColumns){
       check();const count=Math.min(tileColumns,columns-column),at=performance.now(),tile=await runSource.readRows(key,rowStart+column,count,{signal});check();inspectTile(tile);readMs+=performance.now()-at;
       rawHasher.update(tile.raw);effectiveHasher.update(new Uint8Array(tile.values.buffer,tile.values.byteOffset,tile.values.byteLength));maxDecodedWeightTileBytes=Math.max(maxDecodedWeightTileBytes,tile.values.byteLength);maxRawWeightTileBytes=Math.max(maxRawWeightTileBytes,tile.raw.byteLength);
       if(tile.source?.weightFeed)tileBindings.push({rowStart:rowStart+column,rowCount:count,...clone(tile.source.weightFeed)});
       const bias=biasRead.slice(column,column+count);projectionBiasTileCopyBytes+=bias.byteLength;
       for(let offset=0;offset<rows;offset+=16){
        const batch=Math.min(16,rows-offset),xb=x.slice(offset*inner,(offset+batch)*inner);projectionBatchCopyBytes+=xb.byteLength;maxLinearInputBytes=Math.max(maxLinearInputBytes,xb.byteLength);
        const beforeLinear=performance.now(),projected=await linear.run({x:xb,weight:tile.values,rows:batch,inner,columns:count,signal});check();linearMs+=performance.now()-beforeLinear;
        const beforeBias=performance.now(),biased=runSource.addBias(projected.output,bias,batch,count);biasMs+=performance.now()-beforeBias;
        for(let token=0;token<batch;token++)out.set(biased.subarray(token*count,(token+1)*count),(offset+token)*columns+column);linearOutputAssemblyBytes+=biased.byteLength;tiles++;
       }
       onProgress?.({stage:'projection',operator:key,sourceRowStart:rowStart+column,completedRows:column+count,totalRows:columns,textRows:L,tiles});check();
      }
      parameterSources[key+':'+rowStart]={...describeP4ProjectionSelection(original.entries?.[key]??{},{rowStart,rows:columns,inner}),rawSHA256:rawHasher.digestHex(),effectiveF32SHA256:effectiveHasher.digestHex(),rawHashMeaning:'immutable-original-storage-only',effectiveHashMeaning:'final-F32-weight-consumed-by-ORT',selectedRawBytes:Number(rawHasher.bytesHashed),selectedEffectiveBytes:Number(effectiveHasher.bytesHashed),weightFeed:pinned,tileBindings};return out;
     };
     const gelu=x=>{if(x.length<=27648)return callMath('gelu',x);const result=new Float32Array(x.length);for(let offset=0;offset<x.length;offset+=27648){const tile=x.slice(offset,Math.min(offset+27648,x.length));geluBatchCopyBytes+=tile.byteLength;const output=callMath('gelu',tile);result.set(output,offset);geluOutputAssemblyBytes+=output.byteLength;}return result;};
     const arrays={};
     arrays.textLinear0=await project('text_embedding.0.weight',owned.conditioning.data,L,4096,5120);
     arrays.textGelu=gelu(arrays.textLinear0);
     arrays.textEmbedded=await project('text_embedding.2.weight',arrays.textGelu,L,5120,5120);
     const norm3Weight=await vector('blocks.0.norm3.weight',0,5120),norm3Bias=await vector('blocks.0.norm3.bias',0,5120);
     arrays.crossNorm=callMath('affineNorm',owned.residual,norm3Weight,norm3Bias,2);
     arrays.qkvQ=await project('blocks.0.cross_attn.q.weight',arrays.crossNorm,2,5120,5120);
     arrays.qkvK=await project('blocks.0.cross_attn.k.weight',arrays.textEmbedded,L,5120,5120);
     arrays.qkvV=await project('blocks.0.cross_attn.v.weight',arrays.textEmbedded,L,5120,5120);
     const normQWeight=await vector('blocks.0.cross_attn.norm_q.weight',0,5120),normKWeight=await vector('blocks.0.cross_attn.norm_k.weight',0,5120);
     arrays.normQ=callMath('rmsNorm',arrays.qkvQ,normQWeight,2);arrays.normK=callMath('rmsNorm',arrays.qkvK,normKWeight,L);
     arrays.crossContext=new Float32Array(10240);const headEvidence=[];let attentionTiles=0,attentionHostCopyBytes=0;
     for(let head=0;head<40;head++){
      check();const at=performance.now(),q=new Float32Array(256);for(let row=0;row<2;row++)q.set(arrays.normQ.subarray(row*5120+head*128,row*5120+(head+1)*128),row*128);attentionHostCopyBytes+=q.byteLength;
      let prevMax=new Float32Array(2).fill(-3.4028234663852886e38);attention.reset(2);
      for(let offset=0;offset<L;offset+=64){
       const keys=Math.min(64,L-offset),k=new Float32Array(keys*128),v=new Float32Array(keys*128);for(let row=0;row<keys;row++){k.set(arrays.normK.subarray((offset+row)*5120+head*128,(offset+row)*5120+(head+1)*128),row*128);v.set(arrays.qkvV.subarray((offset+row)*5120+head*128,(offset+row)*5120+(head+1)*128),row*128);}attentionHostCopyBytes+=k.byteLength+v.byteLength;
       const scored=await linear.score({q,k,prevMax,keys,signal});check();attention.update({weights:scored.weights,values:v,alpha:scored.alpha,keys});prevMax=scored.newMax;attentionTiles++;
      }
      const context=attention.finish(),denominators=attention.denominators();for(let row=0;row<2;row++)arrays.crossContext.set(context.subarray(row*128,(row+1)*128),row*5120+head*128);
      headEvidence.push({head,keyCount:L,tiles:Math.ceil(L/64),logicalFinalKeys:(L-1)%64+1,denominatorsSHA256:await sha(denominators.subarray(0,2)),rowMaxSHA256:await sha(prevMax.subarray(0,2))});check();attentionMs+=performance.now()-at;
      onProgress?.({stage:'cross-attention',head,completedHeads:head+1,totalHeads:40,keyCount:L,attentionTiles});check();
     }
     arrays.crossO=await project('blocks.0.cross_attn.o.weight',arrays.crossContext,2,5120,5120);
     arrays.crossResidual=callMath('add',owned.residual,arrays.crossO);
     arrays.ffnLayerNorm=callMath('layerNorm',arrays.crossResidual,2);
     for(const chunk of [3,4,5])arrays['timeProjection'+chunk]=await project('time_projection.1.weight',owned.timeAct1,1,5120,5120,chunk*5120);
     arrays.shift=callMath('add',await vector('blocks.0.modulation',15360,5120),arrays.timeProjection3);
     arrays.scale=callMath('add',await vector('blocks.0.modulation',20480,5120),arrays.timeProjection4);
     arrays.gate=callMath('add',await vector('blocks.0.modulation',25600,5120),arrays.timeProjection5);
     arrays.ffnModulated=callMath('modulate',arrays.ffnLayerNorm,arrays.shift,arrays.scale,2);
     arrays.ffnUp=await project('blocks.0.ffn.0.weight',arrays.ffnModulated,2,5120,13824);
     arrays.ffnGelu=gelu(arrays.ffnUp);
     arrays.ffnDown=await project('blocks.0.ffn.2.weight',arrays.ffnGelu,2,13824,5120);
     const gated=callMath('gateResidual',arrays.crossResidual,arrays.ffnDown,arrays.gate,2);arrays.ffnGated=gated.gated;arrays.blockOutput=gated.residual;
     const outputHashes=Object.fromEntries(await Promise.all(Object.entries(arrays).map(async([name,value])=>[name+'SHA256',await sha(value)])));check();
     const after={source:runSource.stats(),linear:linear.stats(),math:math.stats(),attention:attention.stats()};
     if(before.math.memoryBytes!==after.math.memoryBytes||before.attention.memoryBytes!==after.attention.memoryBytes||(memoryOf(before.source)!==null&&memoryOf(before.source)!==memoryOf(after.source)))throw Error('P4 Hike workspace grew');
     const returnedArraysBytes=Object.values(arrays).reduce((sum,x)=>sum+x.byteLength,0),conditioningSealBytes=owned.conditioning.sealBytes??owned.conditioning.data.byteLength+owned.conditioning.attentionMask.byteLength;
     const conditioningMetadataBinaryBytes=Math.max(0,conditioningSealBytes-owned.conditioning.data.byteLength-owned.conditioning.attentionMask.byteLength);
     const resources={inputSnapshotBytes:inputBytes,conditioningSnapshotBytes:conditioningSealBytes,conditioningSealBytes,conditioningProtectedSealBytes:conditioningSealBytes,conditioningEvidenceMetadataCopyBytes:conditioningMetadataBinaryBytes,conditioningMetadataBindingEncodingBytes:conditioningMetadataBytes.byteLength,conditioningMetadataBindingEncodingTrafficBytes:conditioningMetadataBytes.byteLength,returnedArraysBytes,maxDecodedWeightTileBytes,maxRawWeightTileBytes,maxLinearInputBytes,maxBiasVectorBytes,maxDecodeElements:81920,ffnDownInner:13824,ffnDownOutputTile:4,innerSplit:false,mathMemoryBytes:after.math.memoryBytes,mathArenaBytes:after.math.arenaBytes,attentionMemoryBytes:after.attention.memoryBytes,attentionArenaBytes:after.attention.arenaBytes,sourceMemoryBytes:memoryOf(after.source),ORTSessionCount:2,ORTMemoryBytes:null,allocatorPeakBytes:null,GCPeakBytes:null,hostPeakBytes:null,inputSnapshotTrafficBytes:inputBytes,projectionBatchCopyTrafficBytes:projectionBatchCopyBytes,linearInputSnapshotTrafficBytes:after.linear.inputCopyBytes-before.linear.inputCopyBytes,linearOutputSnapshotTrafficBytes:after.linear.outputCopyBytes-before.linear.outputCopyBytes,linearOutputAssemblyTrafficBytes:linearOutputAssemblyBytes,attentionHostCopyTrafficBytes:attentionHostCopyBytes,attentionDenominatorsCopyTrafficBytes:320,attentionContextAssemblyTrafficBytes:40960,projectionBiasTileCopyTrafficBytes:projectionBiasTileCopyBytes,geluBatchCopyTrafficBytes:geluBatchCopyBytes,geluOutputAssemblyTrafficBytes:geluOutputAssemblyBytes,mathSnapshotTrafficBytes:after.math.snapshotCopyBytes-before.math.snapshotCopyBytes,mathInputTrafficBytes:after.math.inputCopyBytes-before.math.inputCopyBytes,mathOutputTrafficBytes:after.math.outputCopyBytes-before.math.outputCopyBytes,attentionInputTrafficBytes:after.attention.inputCopyBytes-before.attention.inputCopyBytes,attentionOutputTrafficBytes:after.attention.outputCopyBytes-before.attention.outputCopyBytes,retainedParameterVectorsBytes:81920,knownRetainedNumericBytes:inputBytes+conditioningSealBytes+returnedArraysBytes+81920+conditioningMetadataBinaryBytes+conditioningMetadataBytes.byteLength,sourceVectorSnapshotTrafficBytes:sourceVectorSnapshotBytes,mathClearTrafficBytes:after.math.clearBytes-before.math.clearBytes,scope:'P4 fixed Hike Memory capacities, stage numeric arrays, Task1 protected capture seal, and cumulative copy traffic; protected seal and run snapshot are separate copies; no whole-pipeline peak claim; excludes caller/reference/file/browser/GC and unknown ORT allocator'};
     const evidence={schemaVersion:'bernini-post-self-attention-evidence/0.1',executionProfileId:POST_SELF_ATTENTION_PROFILE,scope:'ACTUAL_N2_BLOCK0_CROSS_ATTENTION_FFN_F32_CANDIDATE',inputBinding:'caller-supplied candidate values; producer, side, schedule and meaning require separately anchored harness binding',producerAuthenticated:false,side:original.side??null,modelHash:original.modelHash??null,headerSHA256:original.headerSHA256??null,fullFileSHA256Verified:false,fullFileHashRecomputed:false,inputHashes,outputHashes,weightFeedPackageHash:pinned.packageHash,weightFeedEpoch:pinned.epoch,graphSHA256:operatorSources.linear.graphSHA256,scoreGraphSHA256:operatorSources.linear.scoreGraphSHA256,conditioning:{schemaVersion:owned.conditioning.schemaVersion,rows:L,shape:clone(owned.conditioning.shape),meaning:owned.conditioning.meaning,metadata:clone(owned.conditioning.metadata),maskedRowsRetained:true,maskApplied:false},headCount:40,headDim:128,queryRows:2,scoreGraphWorkspaceRows:2,unusedQueryWorkspaceRows:0,keyCount:L,phantomKeys:0,rope:'none',qkNormWidth:5120,normEpsilon:1e-6,norm3Affine:true,crossResidualGate:false,timeProjectionChunks:[3,4,5],ffnShape:[5120,13824,5120],gelu:'tanh',gateScalePlusOne:false,ffnModulationScalePlusOne:true,operatorSources:clone(operatorSources),parameterSources,headEvidence,tiles,attentionTiles,before,after,elapsed:{readMs,linearMs,biasMs,mathMs,attentionMs,totalMs:performance.now()-started},resources,...flags()};
     check();completedRuns++;projectionTiles+=tiles;returnedOutputBytes+=returnedArraysBytes;return {...arrays,output:arrays.blockOutput,evidence};
    }catch(error){if(operationSignal?.aborted)cancelledRuns++;if(linear?.stats().cleanupPending)closing=true;throw error;}finally{try{lease?.release?.();}finally{busy=false;done();active=null;}}
   },
   stats(){return {busy,disposed,cleanupPending:closing,completedRuns,cancelledRuns,inputSnapshotCopyBytes,returnedOutputBytes,projectionTiles,activeORTSessions:linear?.stats().activeORTSessions??0,source:source?.stats()??null,linear:linear?.stats()??null,math:math?.stats()??null,attention:attention?.stats()??null};},dispose,recover:dispose
  });
 }catch(error){closing=true;throw await cleanupAfterFailure(error,dispose);}
}

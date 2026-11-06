import {createTailWeightSource} from './source.mjs';
import {createSelfAttentionTailMath} from './math.mjs';
import {snapshotTrustedInputs,verifyTailInputHashes} from './trusted.mjs';
import {createDynamicLinear} from '../block-hidden/linear.mjs';
import {releaseOwnedResources,cleanupAfterFailure} from '../qkv/ownership.mjs';
import {Sha256} from '../../../vr180/sha256.mjs';
import {BRIDGE_WASM_SHA256} from '../kernel/registry.mjs';
import {SELF_ATTENTION_TAIL_MATH_SHA256} from './registry.mjs';
const PROFILE='bernini-block0-n2-self-attention-residual-f32-v1';
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join(''),copy=x=>structuredClone(x),abort=s=>s?.throwIfAborted();
function bytes(value){if(value instanceof ArrayBuffer)return new Uint8Array(value).slice();if(value instanceof Uint8Array&&value.buffer instanceof ArrayBuffer)return new Uint8Array(value);throw TypeError('Nonshared owned operator bytes required');}
const typedArrayPrototype=Object.getPrototypeOf(Float32Array.prototype),typedSlots=Object.fromEntries(['length','byteOffset','byteLength','buffer'].map(name=>[name,Object.getOwnPropertyDescriptor(typedArrayPrototype,name).get])),typedTag=Object.getOwnPropertyDescriptor(typedArrayPrototype,Symbol.toStringTag).get,bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
function compactF32(value,length){
 if(!ArrayBuffer.isView(value)||typedTag.call(value)!=='Float32Array')return false;
 const buffer=typedSlots.buffer.call(value);
 return buffer instanceof ArrayBuffer&&typedSlots.length.call(value)===length&&typedSlots.byteOffset.call(value)===0&&typedSlots.byteLength.call(value)===bufferLength.call(buffer);
}
function f32(value,length){
 if(!compactF32(value,length))throw TypeError('Compact finite nonshared exact-shape F32 required');
 const owned=new Float32Array(value);
 if(!owned.every(Number.isFinite))throw TypeError('Compact finite nonshared exact-shape F32 required');
 if(!owned.every(x=>Math.abs(x)<=1e16))throw RangeError('Tail input numeric admission exceeded');
 return owned;
}
export async function createSelfAttentionTail(options={}){
 if(Object.keys(options).some(k=>!['file','side','trustedInputs','bridgeBytes','mathBytes'].includes(k)))throw TypeError('Unknown self-attention tail constructor input');
 let {file,side,trustedInputs,bridgeBytes,mathBytes}=options;
 const trusted=snapshotTrustedInputs(side,trustedInputs);
 // All caller-mutable constructor values are copied before the first await.
 if(bridgeBytes!==undefined)bridgeBytes=bytes(bridgeBytes);if(mathBytes!==undefined)mathBytes=bytes(mathBytes);
 let source=null,linear=null,math=null,busy=false,disposed=false,closing=false,pending=null,completedRuns=0,cancelledRuns=0,inputSnapshotCopyBytes=0,returnedOutputBytes=0;
 const cleanup=()=>releaseOwnedResources([{value:linear,release:v=>v.dispose(),clear:()=>linear=null},{value:source,release:v=>v.dispose(),clear:()=>source=null},{value:math,release:v=>v.dispose(),clear:()=>math=null}]);
 const dispose=()=>{if(disposed)return Promise.resolve();if(busy)return Promise.reject(Error('Cancel and await tail run before disposal'));if(pending)return pending;closing=true;pending=Promise.resolve().then(async()=>{try{await cleanup();disposed=true;closing=false;}finally{pending=null;}});return pending;};
 const live=()=>{if(disposed)throw Error('Self-attention tail disposed');if(closing)throw Object.assign(Error('Tail native resource recovery required'),{code:'RECOVERY_REQUIRED'});};
 try{
  source=await createTailWeightSource({file,side,bridgeBytes});file=null;math=await createSelfAttentionTailMath({wasmBytes:mathBytes});linear=await createDynamicLinear({includeSilu:false});
  const original=source.describe(),operatorSources={upstreamCoreCommit:'b5a432157de6b8884f81104cd02926adf4d597e4',bridgeWasmSHA256:BRIDGE_WASM_SHA256,mathWasmSHA256:SELF_ATTENTION_TAIL_MATH_SHA256,linear:linear.describe()};
  return Object.freeze({
   describe(){live();return {schemaVersion:'bernini-self-attention-tail/0.1',executionProfileId:PROFILE,precisionProfile:'scaled-e4m3fn-scalar-f32-v1 plus F16-to-F32; ORT F32 Gemm and Hike separate F32 multiply/add',side,blockIndex:0,scheduleIndex:trusted.scheduleIndex,tokens:2,originalCoreShape:[1,2,5120],operatorShape:[2,5120],layout:'LC',timeProjectionChunks:[2],residualBasis:'original-fullprefix-arrays.patchHidden',original:copy(original),trustedInputs:copy(trusted),operatorSources:copy(operatorSources),productionHiddenVerified:false,originalWorkflowInputsVerified:false,originalProductionPrecisionVerified:false,fullBlockVerified:false,modelInference:false,lowIsHighHandoff:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};},
   async run(input={}){
    live();if(busy)throw Error('Self-attention tail busy');busy=true;let operationSignal;
    try{
     if(Object.keys(input).some(k=>!['attention','patchHidden','timeAct1','signal','onProgress'].includes(k)))throw TypeError('Unknown tail run input; side/block/time/profile are fixed');
     const {attention,patchHidden,timeAct1,signal,onProgress}=input;operationSignal=signal;
     if(signal!==undefined&&!(signal instanceof AbortSignal))throw TypeError('AbortSignal required');abort(signal);if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('Progress callback required');
     const owned={attention:f32(attention,10240),patchHidden:f32(patchHidden,10240),timeAct1:f32(timeAct1,5120)};
     inputSnapshotCopyBytes+=owned.attention.byteLength+owned.patchHidden.byteLength+owned.timeAct1.byteLength;
     const inputHashes=await verifyTailInputHashes(trusted,owned,signal);live();abort(signal);
     const before={source:source.stats(),linear:linear.stats(),math:math.stats()},started=performance.now(),parameterSources={};let tiles=0,readMs=0,linearMs=0,biasMs=0;
     const project=async(key,x,rows,rowStart)=>{
      const biasRead=await source.readVector(key.replace('.weight','.bias'),rowStart,5120,{signal});live();abort(signal);
      const out=new Float32Array(rows*5120),rawHasher=new Sha256(),decodedHasher=new Sha256();
      for(let row=0;row<5120;row+=16){
       abort(signal);const start=performance.now(),tile=await source.readRows(key,rowStart+row,16,{signal});live();abort(signal);rawHasher.update(tile.raw);decodedHasher.update(new Uint8Array(tile.values.buffer));
       const afterRead=performance.now(),projected=await linear.run({x,weight:tile.values,rows,inner:5120,columns:16,signal});live();abort(signal);const afterLinear=performance.now(),biased=source.addBias(projected.output,biasRead.values.slice(row,row+16),rows,16),afterBias=performance.now();
       for(let token=0;token<rows;token++)out.set(biased.subarray(token*16,token*16+16),token*5120+row);
       tiles++;readMs+=afterRead-start;linearMs+=afterLinear-afterRead;biasMs+=afterBias-afterLinear;
       onProgress?.({operator:key,completedRows:row+16,totalRows:5120,sourceRowStart:rowStart+row,tiles});abort(signal);
      }
      parameterSources[key]={...original.entries[key],selectedRows:[rowStart,rowStart+5120],rawSHA256:rawHasher.digestHex(),decodedF32SHA256:decodedHasher.digestHex(),selectedRawBytes:Number(rawHasher.bytesHashed),selectedDecodedBytes:Number(decodedHasher.bytesHashed),bias:biasRead.source};return out;
     };
     const o=await project('blocks.0.self_attn.o.weight',owned.attention,2,0);live();abort(signal);
     const gateProjection=await project('time_projection.1.weight',owned.timeAct1,1,10240);live();abort(signal);
     const modulation=await source.readVector('blocks.0.modulation',10240,5120,{signal});live();abort(signal);parameterSources['blocks.0.modulation']=modulation.source;
     const {gate,gated,residual}=math.run({o,gateProjection,modulation:modulation.values,patchHidden:owned.patchHidden,rows:2});abort(signal);
     const arrays={o,gateProjection,gate,gated,residual},outputHashes=Object.fromEntries(await Promise.all(Object.entries(arrays).map(async([name,value])=>[name+'SHA256',await sha(value)])));live();abort(signal);
     const after={source:source.stats(),linear:linear.stats(),math:math.stats()};
     if(before.source.hike.memoryBytes!==after.source.hike.memoryBytes||before.math.memoryBytes!==after.math.memoryBytes)throw Error('Tail Hike workspace grew');
     const returnedArraysBytes=Object.values(arrays).reduce((sum,value)=>sum+value.byteLength,0);returnedOutputBytes+=returnedArraysBytes;
     const evidence={schemaVersion:'bernini-self-attention-tail-evidence/0.1',executionProfileId:PROFILE,scope:'ACTUAL_N2_BLOCK0_O_CHUNK2_GATE_AND_ORIGINAL_PATCH_HIDDEN_RESIDUAL_F32_DIAGNOSTIC',side,blockIndex:0,scheduleIndex:trusted.scheduleIndex,tokens:2,originalCoreShape:[1,2,5120],operatorShape:[2,5120],layout:'LC',timeProjectionChunks:[2],gateRowRange:[10240,15360],modulationElementRange:[10240,15360],residualBasis:'original-fullprefix-arrays.patchHidden',arithmetic:'gate=f32(modulation+timeGate); gated=f32(O*gate); residual=f32(patchHidden+gated); separate F32 multiply/add; no scale+1',modelHash:original.modelHash,headerSHA256:original.headerSHA256,fullFileSHA256Verified:false,fullFileHashRecomputed:false,trustedInputs:copy(trusted),inputHashes,outputHashes,operatorSources:copy(operatorSources),parameterSources,tiles,before,after,elapsed:{readMs,linearMs,biasMs,totalMs:performance.now()-started},resources:{returnedArraysBytes,inputSnapshotBytes:102400,maxRawWeightTileBytes:163840,maxDecodedWeightTileBytes:327680,maxLinearXSnapshotBytes:40960,maxLinearWeightSnapshotBytes:327680,maxBiasVectorBytes:20480,maxF16DecodeBitsBytes:163840,maxWeightTileAndDecodeCopiesBytes:163840+163840+327680,modulationValuesBytes:20480,mathArenaBytes:after.math.arenaBytes,decodeArenaBytes:after.source.hike.arenaBytes,hikeMemoryBytes:after.source.hike.memoryBytes+after.math.memoryBytes,hikeMemoryCount:2,ORTSessionCount:1,ORTMemoryBytes:null,allocatorPeakBytes:null,GCPeakBytes:null,hostPeakBytes:null,sourceHeaderReadBytes:after.source.headerReadBytes,sourceConfigReadBytes:after.source.configReadBytes,sourceSelectedReadBytes:after.source.payloadReadBytes-before.source.payloadReadBytes,sourceSelectedReadCalls:after.source.payloadReads-before.source.payloadReads,inputSnapshotTrafficBytes:102400,linearInputSnapshotTrafficBytes:after.linear.inputCopyBytes-before.linear.inputCopyBytes,linearOutputSnapshotTrafficBytes:after.linear.outputCopyBytes-before.linear.outputCopyBytes,mathSnapshotTrafficBytes:after.math.snapshotCopyBytes-before.math.snapshotCopyBytes,mathInputTrafficBytes:after.math.inputCopyBytes-before.math.inputCopyBytes,mathOutputTrafficBytes:after.math.outputCopyBytes-before.math.outputCopyBytes,decodeInputTrafficBytes:after.source.hike.inputCopyBytes-before.source.hike.inputCopyBytes,decodeOutputTrafficBytes:after.source.hike.outputCopyBytes-before.source.hike.outputCopyBytes,hikeDecodeClearTrafficBytes:(after.source.hike.calls-before.source.hike.calls)*after.source.hike.arenaBytes,scope:'tail owner only, fixed Memory capacities plus named host spans and cumulative copies; excludes caller/file/reference/browser allocations and unknown ORT allocator/GC/host peak; not full resource budget proof'},productionHiddenVerified:false,originalWorkflowInputsVerified:false,originalProductionPrecisionVerified:false,fullBlockVerified:false,modelInference:false,lowIsHighHandoff:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};
     completedRuns++;return {...arrays,evidence};
    }catch(error){if(operationSignal?.aborted)cancelledRuns++;if(linear?.stats().cleanupPending)closing=true;throw error;}finally{busy=false;}
   },
   stats(){return {busy,disposed,cleanupPending:closing,completedRuns,cancelledRuns,inputSnapshotCopyBytes,returnedOutputBytes,activeORTSessions:linear&&!linear.stats().disposed?1:0,source:source?.stats()??null,linear:linear?.stats()??null,math:math?.stats()??null};},dispose,recover:dispose
  });
 }catch(error){closing=true;throw await cleanupAfterFailure(error,dispose);}
}

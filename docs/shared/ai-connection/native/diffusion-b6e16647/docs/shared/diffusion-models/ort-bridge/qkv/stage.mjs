import * as ort from '../../../inference/vendor/ort.wasm.min.mjs';
import {createHike} from '../../../inference/hike.mjs';
import {createQkvBase} from './base.mjs';
import {createQkvProjectionGraph} from './graph.mjs';
import {createQkvRope} from './rope.mjs';
import {createStreamAttention} from '../stream-attention/stage.mjs';
import {requireQkNormRange,QK_NORM_MAX_ABS} from './norm-admission.mjs';
import {releaseOwnedResources,cleanupAfterFailure} from './ownership.mjs';
const TENSOR_HASH='9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8';
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const copy=v=>structuredClone(v),abort=s=>s?.throwIfAborted();
const shape=(a,b)=>Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>Object.hasOwn(a,i)&&a[i]===v);
function f32(a,n){if(!(a instanceof Float32Array)||a.length!==n||!(a.buffer instanceof ArrayBuffer)||a.byteOffset!==0||a.byteLength!==a.buffer.byteLength||!a.every(Number.isFinite))throw TypeError('Compact nonshared finite F32 exact shape required');}
function bytes(b){if(b instanceof ArrayBuffer)return new Uint8Array(b).slice();if(b instanceof Uint8Array&&b.buffer instanceof ArrayBuffer)return new Uint8Array(b);throw TypeError('Owned kernel bytes required');}
const PROFILE='bernini-block0-qkv5120-norm-rope-selected16-head0-f32-v1';
ort.env.wasm.wasmPaths={mjs:new URL('../../../inference/vendor/ort-wasm-simd-threaded.mjs',import.meta.url).href,wasm:new URL('../../../inference/vendor/ort-wasm-simd-threaded.wasm',import.meta.url).href};ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;

// Actual original weights; the caller's hidden values are explicitly supplied
// operator inputs. This factory never certifies an upstream model activation.
export async function createActualQkvDiagnostic({file,side,bridgeBytes,tensorBytes,ropeBytes}={}){
 if(bridgeBytes!==undefined)bridgeBytes=bytes(bridgeBytes);if(tensorBytes!==undefined)tensorBytes=bytes(tensorBytes);if(ropeBytes!==undefined)ropeBytes=bytes(ropeBytes);
 let base=null,norm=null,rope=null,projection=null,attention=null,disposed=false,closing=false,busy=false,completedRuns=0,cancelledRuns=0;
 const cleanup=()=>releaseOwnedResources([
  {value:attention,release:v=>v.dispose(),clear:()=>{attention=null;}},
  {value:projection,release:v=>v.release(),clear:()=>{projection=null;}},
  {value:norm,release:v=>v.dispose(),clear:()=>{norm=null;}},
  {value:rope,release:v=>v.dispose(),clear:()=>{rope=null;}},
  {value:base,release:v=>v.dispose(),clear:()=>{base=null;}}
 ]);
 let pendingDisposal=null;
 const disposeOwned=()=>{if(disposed)return Promise.resolve();if(busy)return Promise.reject(Error('Cancel and await QKV run before disposal'));if(pendingDisposal)return pendingDisposal;closing=true;pendingDisposal=Promise.resolve().then(async()=>{try{await cleanup();disposed=true;closing=false;}finally{pendingDisposal=null;}});return pendingDisposal;};
 try{
  base=await createQkvBase({file,side,hikeBytes:bridgeBytes});
  if(tensorBytes===undefined){const r=await fetch(new URL('../../../inference/kernel/tensor.wasm',import.meta.url));if(!r.ok)throw Error('Pinned generic Hike tensor kernel unavailable');tensorBytes=new Uint8Array(await r.arrayBuffer());}
  if(await sha(tensorBytes)!==TENSOR_HASH)throw Error('Generic Hike tensor kernel hash mismatch');
  norm=await createHike(tensorBytes,{capacity:5120});rope=await createQkvRope({wasmBytes:ropeBytes});
  const graph=createQkvProjectionGraph(),graphHash=await sha(graph),started=performance.now();
  projection=await ort.InferenceSession.create(graph,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  attention=await createStreamAttention();const sessionCreateMs=performance.now()-started,original=base.describe();
  const live=()=>{if(disposed)throw Error('QKV diagnostic disposed');if(closing)throw Object.assign(Error('QKV resource cleanup must finish before reuse'),{code:'RECOVERY_REQUIRED'});};
  return Object.freeze({
   describe(){live();return {schemaVersion:'bernini-qkv-diagnostic/0.1',executionProfileId:PROFILE,scope:'ACTUAL_WEIGHTS_EXPLICIT_HIDDEN_N16_FULL_WIDTH_HEAD0',original:copy(original),input:{hidden:[16,5120],positions:[16,3],sourceIds:[16]},projection:[16,5120],normAxis:5120,numericAdmission:{normInputMaxAbs:QK_NORM_MAX_ABS,normInputRangeOwner:'Diffusion P4 diagnostic only'},headCount:40,selectedHead:0,selectedShape:[16,128],declaredAttentionKeys:16,productionQKVVerified:false,actualModelHiddenVerified:false,originalProductionPrecisionVerified:false,fullSequenceVerified:false,modelInference:false,P5:'BLOCKED',projectionGraphSHA256:graphHash,tensorHikeSHA256:TENSOR_HASH};},
   async run(input={}){
    live();if(busy)throw Error('QKV diagnostic busy');busy=true;let xTensor=null,operationSignal;
    try{
     const {hidden,positions,sourceIds,signal,onProgress,headIndex=0}=input;operationSignal=signal;abort(signal);if(headIndex!==0)throw RangeError('P4 diagnostic supports head0 only');f32(hidden,81920);f32(positions,48);
     if(!(sourceIds instanceof Int32Array)||sourceIds.length!==16||!(sourceIds.buffer instanceof ArrayBuffer)||sourceIds.byteOffset!==0||sourceIds.byteLength!==sourceIds.buffer.byteLength||!sourceIds.every(v=>v>=0&&v<=16777216))throw TypeError('Compact exact source-id array required');
     for(let i=0;i<16;i++)for(let axis=0;axis<3;axis++){const v=positions[i*3+axis];if(!Number.isInteger(v)||v<0||v>=[21,30,52][axis])throw RangeError('Explicit selected target-grid coordinate out of range');}
     if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('Progress callback required');
     const ownedHidden=hidden.slice(),ownedPositions=positions.slice(),ownedSourceIds=sourceIds.slice();
     const [hiddenSHA256,positionsSHA256,sourceIdsSHA256]=await Promise.all([sha(ownedHidden),sha(ownedPositions),sha(ownedSourceIds)]);live();abort(signal);
     const start=performance.now(),baseBefore=base.stats(),ropeBefore=rope.stats(),normBefore=norm.stats(),qkv={},sourceWeights={},shapes={input:[16,5120],fullProjection:[16,5120],selectedHead:[16,128]};let readMs=0,ortMs=0,biasMs=0,tiles=0;
     xTensor=new ort.Tensor('float32',ownedHidden,[16,5120]);
     for(const kind of ['q','k','v']){
      const output=new Float32Array(81920),bias=base.bias(kind),weightHash=base.newWeightHash(),decodedHash=base.newWeightHash();
      for(let row=0;row<5120;row+=16){
       abort(signal);const beforeRead=performance.now(),tile=await base.readWeightTile(kind,row,{signal});live();abort(signal);weightHash.update(tile.raw);decodedHash.update(new Uint8Array(tile.values.buffer,tile.values.byteOffset,tile.values.byteLength));const afterRead=performance.now();let wTensor,result;
       try{
        wTensor=new ort.Tensor('float32',tile.values,[16,5120]);result=await projection.run({x:xTensor,weight:wTensor});live();abort(signal);
        if(result.projection?.type!=='float32'||!shape(result.projection.dims,[16,16]))throw Error('Actual batch projection shape mismatch');
        const values=new Float32Array(result.projection.data);f32(values,256);const afterOrt=performance.now(),withBias=base.addBias(values,bias.slice(row,row+16)),afterBias=performance.now();
        for(let token=0;token<16;token++)output.set(withBias.subarray(token*16,token*16+16),token*5120+row);
        tiles++;readMs+=afterRead-beforeRead;ortMs+=afterOrt-afterRead;biasMs+=afterBias-afterOrt;
        if(base.stats().hike.memoryBytes!==baseBefore.hike.memoryBytes)throw Error('QKV bridge workspace grew');
        onProgress?.({operator:kind,completedRows:row+16,totalRows:5120,tiles});abort(signal);
       }finally{for(const value of Object.values(result??{}))value.dispose?.();wTensor?.dispose?.();}
      }
      qkv[kind]=output;sourceWeights[kind]={...original.weights[kind],rawSHA256:weightHash.digestHex(),decodedF32SHA256:decodedHash.digestHex(),rawBytes:Number(weightHash.bytesHashed),decodedBytes:Number(decodedHash.bytesHashed)};
     }
     const beforeNorm=performance.now(),normalized={q:norm.rmsNorm(requireQkNormRange(qkv.q),base.norm('q'),16,5120,1e-6),k:norm.rmsNorm(requireQkNormRange(qkv.k),base.norm('k'),16,5120,1e-6)};abort(signal);
     const select=data=>{const out=new Float32Array(2048);for(let row=0;row<16;row++)out.set(data.subarray(row*5120,row*5120+128),row*128);return out;};
     const afterNorm=performance.now(),matrices=rope.matrix({positions:ownedPositions,sourceIds:ownedSourceIds}),q=rope.apply({values:select(normalized.q),matrices}),k=rope.apply({values:select(normalized.k),matrices}),v=select(qkv.v),afterRope=performance.now();abort(signal);
     const bindingId='actual-weight-hidden-fixture-n16-head0',source={describe:()=>({schemaVersion:'works-postnorm-rope-qkv/0.1',bindingId,rows:16,headDim:128,keyCount:16,dtype:'float32',querySpace:'post-qk-norm-rope',keySpace:'post-qk-norm-rope',valueSpace:'projected-value',mask:'none',dropout:0,provenance:{kind:'precomputed-tensors',producer:'actual-original-weights-explicit-hidden-diagnostic',executionProfileId:PROFILE,modelHash:original.modelHash,hiddenSHA256,actualModelHiddenVerified:false}}),async readKV(offset,count,{signal:s}={}){abort(s);if(offset!==0||count!==16)throw Error('Selected diagnostic source range');return {bindingId,offset,count,k:k.slice(),v:v.slice(),kShape:[16,128],vShape:[16,128]};}};
     const attended=await attention.run({q,source,signal});live();abort(signal);completedRuns++;
     const end=performance.now(),baseAfter=base.stats(),ropeAfter=rope.stats(),normAfter=norm.stats(),attentionStats=attention.stats();
     return {qkv,norm:normalized,matrices,q,k,v,attention:attended.output,evidence:{schemaVersion:'bernini-qkv-evidence/0.1',scope:'ACTUAL_WEIGHTS_EXPLICIT_HIDDEN_N16_FULL_WIDTH_HEAD0',executionProfileId:PROFILE,original:copy(original),sourceWeights,shapes,tiles,hiddenSHA256,positionsSHA256,sourceIdsSHA256,projectionGraphSHA256:graphHash,tensorHikeSHA256:TENSOR_HASH,ortVersion:ort.env.versions?.web??null,ortSessionCreations:2,sessionCreateMs,baseBefore,baseAfter,normBefore,normAfter,ropeBefore,ropeAfter,attention:attended.evidence,elapsed:{readMs,ortMs,biasMs,normMs:afterNorm-beforeNorm,ropeMs:afterRope-afterNorm,attentionMs:end-afterRope,totalRunMs:end-start},resources:{fullQKVBytes:983040,fullNormQKBytes:655360,hiddenCallerAndSnapshotBytes:655360,largestRawWeightTileBytes:81920,largestDecodedWeightTileBytes:327680,baseParametersRetainedBytes:102400,currentParameterCopyBytes:20480,projectionOutputOriginalAndSnapshotAndBiasBytes:3072,selectedQKVBytes:24576,ropeMatricesBytes:16384,weightFileReadBytes:78643200,logicalProjectionInputBytes:tiles*655360,logicalProjectionOutputBytes:tiles*1024,hikeMemoryBytes:baseAfter.hike.memoryBytes+normAfter.memoryBytes+ropeAfter.memoryBytes+attentionStats.hike.memoryBytes,hikeMemoryCount:4,baseHikeInputCopyBytes:baseAfter.hike.inputCopyBytes-baseBefore.hike.inputCopyBytes,baseHikeOutputCopyBytes:baseAfter.hike.outputCopyBytes-baseBefore.hike.outputCopyBytes,baseHikeArenaClearWriteBytes:(baseAfter.hike.calls-baseBefore.hike.calls)*baseAfter.hike.arenaBytes,normInputOutputCopyBytes:2*(327680+20480+327680),ORTMemoryBytes:null,producerResidentBytes:null,scope:'named retained numeric buffers and traffic; not allocator/GC/harness/reference or full pipeline peak'},productionQKVVerified:false,actualModelHiddenVerified:false,originalProductionPrecisionVerified:false,fullSequenceVerified:false,fullHeadCountVerified:false,modelInference:false,P5:'BLOCKED'}};
    }catch(error){if(operationSignal?.aborted)cancelledRuns++;throw error;}
    finally{xTensor?.dispose?.();busy=false;}
   },
   stats(){return {disposed,cleanupPending:closing,busy,completedRuns,cancelledRuns,ortSessionCreations:2,base:base?.stats()??null,norm:norm?.stats()??null,rope:rope?.stats()??null,attention:attention?.stats()??null};},
   dispose:disposeOwned,recover:disposeOwned
  });
 }catch(error){closing=true;throw await cleanupAfterFailure(error,disposeOwned);}
}

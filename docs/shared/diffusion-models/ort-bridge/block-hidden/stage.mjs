import {createWeightSource} from './source.mjs';
import {createDynamicLinear} from './linear.mjs';
import {createBlockHiddenMath} from './math.mjs';
import {createLatentSpace} from '../../latent-space/latent-space.mjs';
import {createSchedulerKernel} from '../../scheduler/scheduler-kernel.mjs';
import {releaseOwnedResources,cleanupAfterFailure} from '../qkv/ownership.mjs';
import {Sha256} from '../../../vr180/sha256.mjs';
import {BLOCK_HIDDEN_MATH_SHA256} from './registry.mjs';
const sha=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',x)),v=>v.toString(16).padStart(2,'0')).join(''),copy=x=>structuredClone(x),abort=s=>s?.throwIfAborted();
const PROFILE='bernini-rect2-block0-postmod-f32-v1',PRECISION='bernini-block0-prefix-hike-f32-ort-silu-v1';
const SCHEDULER_HASH='bcd35eb9e0bef45c2f21d99ca77a1edeae57c8ea7fa763086492dc1fa40dd220',RAW_MEAN_HASH='289977e71b65ca42ac9f3fa2b614882bc0eba7420e70620927a25740db6f53a3';
function bytes(v){if(v instanceof ArrayBuffer)return new Uint8Array(v).slice();if(v instanceof Uint8Array&&v.buffer instanceof ArrayBuffer)return new Uint8Array(v);throw TypeError('Nonshared owned binary required');}
function f32(v,n){if(!(v instanceof Float32Array)||v.length!==n||!(v.buffer instanceof ArrayBuffer)||v.byteOffset!==0||v.byteLength!==v.buffer.byteLength||!v.every(Number.isFinite))throw TypeError('Compact finite exact-shape F32 required');return v.slice();}
async function load(v,path){if(v!==undefined)return v;const r=await fetch(new URL(path,import.meta.url));if(!r.ok)throw Error('Pinned Hike operator unavailable');return new Uint8Array(await r.arrayBuffer());}
export async function createBlockHiddenPrefix({file,side,bridgeBytes,mathBytes,latentBytes,schedulerBytes}={}){
 if(!['HIGH','LOW'].includes(side))throw TypeError('Explicit original model side required');
 if(bridgeBytes!==undefined)bridgeBytes=bytes(bridgeBytes);if(mathBytes!==undefined)mathBytes=bytes(mathBytes);if(latentBytes!==undefined)latentBytes=bytes(latentBytes);if(schedulerBytes!==undefined)schedulerBytes=bytes(schedulerBytes);
 let source=null,linear=null,math=null,latent=null,scheduler=null,busy=false,disposed=false,closing=false,pending=null,completedRuns=0,cancelledRuns=0;
 const cleanup=()=>releaseOwnedResources([{value:linear,release:v=>v.dispose(),clear:()=>linear=null},{value:source,release:v=>v.dispose(),clear:()=>source=null},{value:math,release:v=>v.dispose(),clear:()=>math=null},{value:latent,release:v=>v.dispose(),clear:()=>latent=null},{value:scheduler,release:v=>v.dispose(),clear:()=>scheduler=null}]);
 const dispose=()=>{if(disposed)return Promise.resolve();if(busy)return Promise.reject(Error('Cancel and await prefix run before disposal'));if(pending)return pending;closing=true;pending=Promise.resolve().then(async()=>{try{await cleanup();disposed=true;closing=false;}finally{pending=null;}});return pending;};
 const live=()=>{if(disposed)throw Error('Block hidden prefix disposed');if(closing)throw Object.assign(Error('Prefix resource recovery required'),{code:'RECOVERY_REQUIRED'});};
 try{
  source=await createWeightSource({file,side,bridgeBytes});math=await createBlockHiddenMath({wasmBytes:mathBytes});latent=await createLatentSpace(await load(latentBytes,'../../latent-space/build/latent-space.wasm'));
  const sb=await load(schedulerBytes,'../../scheduler/build/scheduler.wasm');if(await sha(sb)!==SCHEDULER_HASH)throw Error('Scheduler hash mismatch');scheduler=createSchedulerKernel(await WebAssembly.compile(sb));linear=await createDynamicLinear();
  const original=source.describe(),operatorSources={upstreamCoreCommit:'b5a432157de6b8884f81104cd02926adf4d597e4',mathWasmSHA256:BLOCK_HIDDEN_MATH_SHA256,schedulerWasmSHA256:SCHEDULER_HASH,latent:latent.stats(),linear:linear.describe(),bridgeWasmSHA256:source.stats().hike.wasmSha256??source.stats().hike.wasmSHA256??'ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd'};
  return Object.freeze({
   describe(){live();return {schemaVersion:'bernini-block-hidden/0.1',executionProfileId:PROFILE,precisionProfile:PRECISION,side,blockIndex:0,original:copy(original),operatorSources:copy(operatorSources),rawShape:[1,16,1,2,4],originalCoreShape:[1,2,5120],operatorShape:[2,5120],implicitBatch:1,layout:'LC',grid:[1,1,2],timeProjectionChunks:[0,1],productionHiddenVerified:false,originalWorkflowInputsVerified:false,originalProductionPrecisionVerified:false,modelInference:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};},
   async run(input={}){
    live();if(busy)throw Error('Block hidden prefix busy');busy=true;let operationSignal;
    try{
     const {rawMean,noise,noiseScale,scheduleIndex,signal,onProgress}=input;operationSignal=signal;abort(signal);
     if(Object.keys(input).some(k=>!['rawMean','noise','noiseScale','scheduleIndex','signal','onProgress'].includes(k)))throw TypeError('Unknown prefix input; coordinates and block are derived, not overridden');
     if(noiseScale!==1||scheduleIndex!==(side==='HIGH'?1:3))throw RangeError('Fixed diagnostic HIGH1/LOW3 and explicit noiseScale1 required');
     if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('Progress callback required');
     const ownedMean={...structuredClone({...rawMean,data:undefined}),data:f32(rawMean?.data,128)},ownedNoise=f32(noise,128);
     for(let i=0;i<128;i++)if(ownedNoise[i]!==Math.fround((((i*29+7)%127)-63)/64))throw RangeError('Explicit diagnostic noise recipe mismatch');
     const [rawMeanSHA256,noiseSHA256]=await Promise.all([sha(ownedMean.data),sha(ownedNoise)]);live();abort(signal);if(rawMeanSHA256!==RAW_MEAN_HASH||(ownedMean.dataSha256!==undefined&&ownedMean.dataSha256!==rawMeanSHA256))throw Error('Actual VAE Rect mean source binding mismatch');
     const before={source:source.stats(),math:math.stats(),latent:latent.stats(),scheduler:scheduler.stats(),linear:linear.stats()},started=performance.now(),schedule=scheduler.schedule(),sigma=schedule.sigmas[scheduleIndex],timestep=scheduler.timesteps(new Float32Array([sigma]))[0],arrays={},parameterSources={};
     arrays.normalizedMean=latent.normalizeRawMean(ownedMean).data;arrays.noisedLatent=scheduler.noiseMix(ownedNoise,arrays.normalizedMean,sigma,noiseScale);abort(signal);
     arrays.patches=new Float32Array(128);for(let token=0;token<2;token++)for(let channel=0;channel<16;channel++)for(let kh=0;kh<2;kh++)for(let kw=0;kw<2;kw++)arrays.patches[token*64+channel*4+kh*2+kw]=arrays.noisedLatent[channel*8+kh*4+token*2+kw];
     let tiles=0,readMs=0,linearMs=0,biasMs=0;
     const project=async(key,x,rows,inner,outputWidth)=>{
      const biasRead=await source.readVector(key.replace('.weight','.bias'),0,outputWidth,{signal});abort(signal);const bias=biasRead.values,out=new Float32Array(rows*outputWidth),rawHasher=new Sha256(),decodedHasher=new Sha256();
      for(let row=0;row<outputWidth;row+=16){
       abort(signal);const start=performance.now(),tile=await source.readRows(key,row,16,{signal});live();abort(signal);rawHasher.update(tile.raw);decodedHasher.update(new Uint8Array(tile.values.buffer));const afterRead=performance.now(),projected=await linear.run({x,weight:tile.values,rows,inner,columns:16,signal});live();abort(signal);const afterLinear=performance.now(),biased=source.addBias(projected.output,bias.slice(row,row+16),rows,16),afterBias=performance.now();
       for(let r=0;r<rows;r++)out.set(biased.subarray(r*16,r*16+16),r*outputWidth+row);
       tiles++;readMs+=afterRead-start;linearMs+=afterLinear-afterRead;biasMs+=afterBias-afterLinear;
       onProgress?.({operator:key,completedRows:row+16,totalRows:outputWidth,tiles});abort(signal);
      }
      parameterSources[key]={...original.entries[key],selectedRows:[0,outputWidth],rawSHA256:rawHasher.digestHex(),decodedF32SHA256:decodedHasher.digestHex(),selectedRawBytes:Number(rawHasher.bytesHashed),selectedDecodedBytes:Number(decodedHasher.bytesHashed),bias:biasRead.source};return out;
     };
     arrays.patchHidden=await project('patch_embedding.weight',arrays.patches,2,64,5120);
     arrays.timeSin=math.sinusoidal(timestep);arrays.timeLinear0=await project('time_embedding.0.weight',arrays.timeSin,1,256,5120);
     arrays.timeAct0=await linear.silu({x:arrays.timeLinear0,signal});arrays.timeEmbedding=await project('time_embedding.2.weight',arrays.timeAct0,1,5120,5120);arrays.timeAct1=await linear.silu({x:arrays.timeEmbedding,signal});arrays.timeProjection=await project('time_projection.1.weight',arrays.timeAct1,1,5120,10240);
     const modulation=await source.readVector('blocks.0.modulation',0,10240,{signal});live();abort(signal);parameterSources['blocks.0.modulation']=modulation.source;
     const shiftScale=math.add(arrays.timeProjection,modulation.values);arrays.shift=shiftScale.slice(0,5120);arrays.scale=shiftScale.slice(5120);arrays.layerNorm=math.layerNorm(arrays.patchHidden,2);arrays.hidden=math.modulate(arrays.layerNorm,arrays.shift,arrays.scale,2);abort(signal);
     const positions=new Float32Array([0,0,0,0,0,1]),sourceIds=new Int32Array([0,0]),[hiddenSHA256,positionsSHA256,sourceIdsSHA256,sigmaSHA256,timestepSHA256]=await Promise.all([sha(arrays.hidden),sha(positions),sha(sourceIds),sha(new Float32Array([sigma])),sha(new Float32Array([timestep]))]);live();abort(signal);
     const after={source:source.stats(),math:math.stats(),latent:latent.stats(),scheduler:scheduler.stats(),linear:linear.stats()};
     for(const name of ['math','latent','scheduler'])if(before[name].memoryBytes!==after[name].memoryBytes)throw Error('Prefix Hike workspace grew');if(before.source.hike.memoryBytes!==after.source.hike.memoryBytes)throw Error('Decode Hike workspace grew');
     const arrayBytes=Object.values(arrays).reduce((n,v)=>n+v.byteLength,0),evidence={schemaVersion:'bernini-block-hidden-evidence/0.1',executionProfileId:PROFILE,precisionProfile:PRECISION,scope:'ACTUAL_MODEL_OPERATORS_FROM_ACTUAL_RECT_MEAN_WITH_EXPLICIT_DIAGNOSTIC_NOISE',side,modelHash:original.modelHash,headerSHA256:original.headerSHA256,fullFileSHA256Verified:false,blockIndex:0,scheduleIndex,sigma,timestep,sigmaSHA256,timestepSHA256,rawMeanSHA256,noiseSHA256,hiddenSHA256,positionsSHA256,sourceIdsSHA256,implicitBatch:1,originalCoreShape:[1,2,5120],operatorShape:[2,5120],layout:'LC',grid:[1,1,2],rowToGrid:[[0,0,0],[0,0,1]],sourceIds:[0,0],contextLatents:[],noiseScale,postModulationComputedByModelOperators:true,rawMeanSource:{repository:'Kushyameln01/kushyameln-works',commit:'855f435120f08eb9e818e51281fc26f0e2633829',path:'development/inference/e6/fixtures/png-mean.wktensor',fileSHA256:'6539204ef61dc0f706238b74e2bcabf8bbcce971f5056d0b0d7e288811516b71',payloadSHA256:RAW_MEAN_HASH,modelSha256:ownedMean.modelSha256},originalWorkflowInputsVerified:false,productionHiddenVerified:false,originalProductionPrecisionVerified:false,fullBlockVerified:false,lowIsHighHandoff:false,modelInference:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY',operatorSources:copy(operatorSources),parameterSources,tiles,before,after,elapsed:{readMs,linearMs,biasMs,totalMs:performance.now()-started},resources:{returnedStageArraysBytes:arrayBytes,positionsAndSourceIdsBytes:positions.byteLength+sourceIds.byteLength,callerAndOwnedRawMeanNoiseBytes:2048,maxRawWeightTileBytes:163840,maxDecodedWeightTileBytes:327680,maxLinearXSnapshotBytes:20480,maxLinearWeightSnapshotBytes:327680,maxBiasVectorBytes:40960,maxWeightTileAndDecodeCopiesBytes:163840+163840+327680,maxBridgeDecodeTypedBitsBytes:163840,maxShiftScaleTemporaryBytes:40960,hikeMemoryBytes:after.source.hike.memoryBytes+after.math.memoryBytes+after.latent.memoryBytes+after.scheduler.memoryBytes,hikeMemoryCount:4,ORTMemoryBytes:null,ORTSessionCount:2,sourceReadBytes:after.source.readBytes-before.source.readBytes,hikeDecodeClearTrafficBytes:(after.source.hike.calls-before.source.hike.calls)*after.source.hike.arenaBytes,linearInputSnapshotTrafficBytes:after.linear.inputCopyBytes-before.linear.inputCopyBytes,linearOutputSnapshotTrafficBytes:after.linear.outputCopyBytes-before.linear.outputCopyBytes,scope:'serial prefix only; numeric live-set upper bound excludes ORT allocator, GC/browser/File/harness/reference and downstream; not production peak proof'}};
     completedRuns++;return {hidden:arrays.hidden,positions,sourceIds,arrays,evidence};
    }catch(e){if(operationSignal?.aborted)cancelledRuns++;if(linear?.stats().cleanupPending)closing=true;throw e;}finally{busy=false;}
   },
   stats(){return {busy,disposed,cleanupPending:closing,completedRuns,cancelledRuns,source:source?.stats()??null,linear:linear?.stats()??null,math:math?.stats()??null,latent:latent?.stats()??null,scheduler:scheduler?.stats()??null};},dispose,recover:dispose
  });
 }catch(e){closing=true;throw await cleanupAfterFailure(e,dispose);}
}

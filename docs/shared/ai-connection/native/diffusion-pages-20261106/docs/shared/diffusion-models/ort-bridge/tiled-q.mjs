import {inspectSafetensors} from '../api/safetensors.mjs';
import {TARGET_PROVENANCE} from '../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';
import {createProjectionBridge} from './hike.mjs';
import {createOrtProjectionStage} from './stage.mjs';
import {BRIDGE_WASM_SHA256} from './kernel/registry.mjs';
const GRAPH='af48828a7e93d75f529cee34c9b609cf4c3748f095a2c6fb3d5f1d71424988b0';
const PROFILE='bernini-q5120x5120-row16-one-token-f32-v1';
const clone=value=>structuredClone(value);
const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
const abort=signal=>signal?.throwIfAborted();
function error(code,message){throw Object.assign(new Error(message),{code});}
function activation(x){if(!(x instanceof Float32Array)||x.length!==5120||!(x.buffer instanceof ArrayBuffer)||x.byteOffset!==0||x.byteLength!==x.buffer.byteLength||!x.every(Number.isFinite))error('INVALID_TENSOR','Compact nonshared finite activation Float32Array[5120] required');}

// E7 candidate: full original Q output dimension is staged in 16-row feeds.
// This separate contract does not expand the fixed L1 registry/selected slice.
export async function createTiledQProjection({file,side,hikeBytes,signal}={}){
 if(!(file instanceof Blob)||!['LOW','HIGH'].includes(side))throw TypeError('Immutable original File and explicit HIGH/LOW required');
 abort(signal);let ownedFile=file,provider=null,stage=null,biasAll=null,disposed=false,busy=false;
 let completedRuns=0,cancelledRuns=0,lastStageMemory=null;
 const live=()=>{if(disposed)error('DISPOSED','Tiled Q candidate disposed');};
 const guard=s=>{live();abort(signal);abort(s);};
 try{
  let inspected=await inspectSafetensors(ownedFile,{rejectDuplicateKeys:true});guard();
  const pinned=TARGET_PROVENANCE.models.find(m=>m.name.includes(side));
  if(inspected.fileBytes!==pinned.fileBytes||inspected.headerSHA256!==pinned.headerSHA256)error('BASE_IDENTITY_MISMATCH','Actual original header/side/size mismatch');
  const tensors=new Map(inspected.tensors.map(t=>[t.name,t]));
  const weight=tensors.get('blocks.0.self_attn.q.weight'),bias=tensors.get('blocks.0.self_attn.q.bias'),scaleDesc=tensors.get('blocks.0.self_attn.q.weight_scale'),quant=tensors.get('blocks.0.self_attn.q.comfy_quant');
  if(weight?.dtype!=='F8_E4M3'||JSON.stringify(weight.shape)!=='[5120,5120]'||bias?.dtype!=='F16'||JSON.stringify(bias.shape)!=='[5120]'||scaleDesc?.dtype!=='F32'||scaleDesc.byteLength!==4||quant?.dtype!=='U8'||quant.byteLength!==27)error('BASE_PROFILE_MISMATCH','Original Q full shape/dtype/quantization profile mismatch');
  const payloadStart=8+inspected.headerBytes,metadata={headerSHA256:inspected.headerSHA256,fileBytes:inspected.fileBytes,payloadStart};
  inspected=null;tensors.clear();
  const exact=async(start,count,s)=>{guard(s);const bytes=await ownedFile.slice(start,start+count).arrayBuffer();guard(s);if(bytes.byteLength!==count)error('BASE_READ_FAILED','Bounded original range length mismatch');return bytes;};
  const quantBytes=await exact(payloadStart+quant.dataOffsets[0],27);
  if(new TextDecoder('utf-8',{fatal:true}).decode(quantBytes)!=='{"format": "float8_e4m3fn"}')error('BASE_PROFILE_MISMATCH','Actual quantization config mismatch');
  const scaleBytes=await exact(payloadStart+scaleDesc.dataOffsets[0],4),scale=new DataView(scaleBytes).getFloat32(0,true);
  if(!Number.isFinite(scale)||scale<=0)error('BASE_PROFILE_MISMATCH','Positive finite scalar F32 scale required');
  const configHash=await sha(quantBytes),scaleHash=await sha(scaleBytes);guard();
  if(hikeBytes===undefined){const r=await fetch(new URL('./kernel/bridge.wasm',import.meta.url));if(!r.ok)error('HIKE_UNAVAILABLE','Pinned Hike asset unavailable');hikeBytes=await r.arrayBuffer();guard();}
  provider=await createProjectionBridge(hikeBytes);guard();
  let biasRaw=await exact(payloadStart+bias.dataOffsets[0],10240),biasBits=new Uint16Array(5120),view=new DataView(biasRaw);
  for(let i=0;i<5120;i++)biasBits[i]=view.getUint16(i*2,true);
  biasAll=provider.decodeF16(biasBits);biasRaw=null;biasBits=null;view=null;
  stage=await createOrtProjectionStage({hikeBytes});guard();
  const original={...metadata,modelHash:BASE_MODEL_HASHES[side],side,originalKey:weight.name,fullShape:[5120,5120],biasOriginalKey:bias.name,storageDtype:'F8_E4M3',biasStorageDtype:'F16',computeDtype:'F32',scale,scaleHash,scaleKey:scaleDesc.name,configHash,fp8ProfileId:'scaled-e4m3fn-scalar-f32-v1',fullFileSHA256Verified:false};
  return Object.freeze({
   describe(){live();return {schemaVersion:'bernini-tiled-linear/0.1',executionProfileId:PROFILE,scope:'ONE_TOKEN_FULL_Q_ROWS',original:clone(original),shape:{input:[1,5120],output:[1,5120],rowTile:[16,5120]},bindings:{weight:{kind:'runtime-input',name:'weight'},bias:{kind:'hike-parameter',name:'bias'}},graphHash:GRAPH,modelInference:false,productionFP8Equivalence:'UNVERIFIED',attention:'UNIMPLEMENTED'};},
   async run({x,rows=5120,signal:runSignal,onProgress}={}){
    guard(runSignal);if(busy)error('BUSY','One tiled Q invocation at a time');activation(x);
    if(!Number.isInteger(rows)||rows<16||rows>5120||rows%16)throw RangeError('rows must be a multiple of16 in16..5120');
    if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('onProgress callback required');
    // Capture caller activation before the first asynchronous original read.
    const started=performance.now(),scope=rows===5120?'ONE_TOKEN_FULL_Q_ROWS':'ONE_TOKEN_SELECTED_Q_ROWS';
    const ownedX=new Float32Array(x),output=new Float32Array(rows),providerHikeStart=provider.stats();
    let readMs=0,dequantMs=0,stageMs=0,tiles=0,stageHikeFirst=null,stageHikeLast=null,stageEvidenceFirst=null,stageEvidenceLast=null;
    busy=true;
    try{
     for(let row=0;row<rows;row+=16){
      guard(runSignal);const beforeRead=performance.now();
      const raw=await exact(payloadStart+weight.dataOffsets[0]+row*5120,81920,runSignal),afterRead=performance.now();
      const weights=provider.dequant(new Uint8Array(raw),scale),afterDequant=performance.now();
      const tileBias=biasAll.slice(row,row+16),result=await stage.runF32({weight:weights,x:ownedX,bias:tileBias}),afterStage=performance.now();guard(runSignal);
      if(result.evidence?.graphSHA256!==GRAPH||result.evidence?.ortVersion!=='1.24.3'||result.evidence?.hikeWasmSHA256!==BRIDGE_WASM_SHA256||!(result.output instanceof Float32Array)||result.output.length!==16||!result.output.every(Number.isFinite))error('EXECUTION_PROFILE_MISMATCH','Actual Hike/ORT graph output identity mismatch');
      output.set(result.output,row);tiles++;readMs+=afterRead-beforeRead;dequantMs+=afterDequant-afterRead;stageMs+=afterStage-afterDequant;
      stageHikeLast=result.evidence.hikeMemory;stageEvidenceLast=result.evidence;if(!stageHikeFirst){stageHikeFirst=stageHikeLast;stageEvidenceFirst=stageEvidenceLast;}
      if(stageHikeFirst.memoryBytes!==stageHikeLast.memoryBytes||provider.stats().memoryBytes!==providerHikeStart.memoryBytes)error('WORKSPACE_CHANGED','Fixed candidate Hike workspace grew during row staging');
      onProgress?.({completedRows:row+16,totalRows:rows,tiles,scope});guard(runSignal);
     }
     completedRuns++;lastStageMemory=clone(stageHikeLast);
     return {output,evidence:{schemaVersion:'bernini-tiled-linear-evidence/0.1',scope,executionProfileId:PROFILE,original:clone(original),shape:{input:[1,5120],output:[1,rows],originalWeight:[5120,5120],tile:[16,5120]},tiles,ortSessionCreations:1,graphHash:GRAPH,hikeWasmSHA256:BRIDGE_WASM_SHA256,providerHikeStart,providerHikeEnd:provider.stats(),stageHikeFirst:clone(stageHikeFirst),stageHikeLast:clone(stageHikeLast),stageFirst:clone(stageEvidenceFirst),stageLast:clone(stageEvidenceLast),elapsed:{readMs,dequantMs,stageMs,totalRunMs:performance.now()-started},bytes:{weightFileReads:81920*tiles,managedCopies:20480+758144*tiles,logicalOrtInputTransfers:348160*tiles,logicalOrtOutputTransfers:64*tiles,knownNamedNumericLiveBytes:839936,hikeMemoryTotal:providerHikeStart.memoryBytes+stageHikeLast.memoryBytes,knownNamedNumericPlusHikeBytes:839936+providerHikeStart.memoryBytes+stageHikeLast.memoryBytes,knownLiveScope:'named numeric array logical live bound only; excludes metadata, WASM bytes/compile/runtime, ORT internals, other caller arrays and GC-unreclaimed allocations',ortMemoryBytes:null,OSPeakBytes:null},limits:{attention:'UNIMPLEMENTED',productionTokenCount:'NOT_TESTED',fullPredict:'NOT_READY',fullModelPrecision:'UNVERIFIED',combinedPipelineBudget:'UNVERIFIED'}}};
    }catch(e){if(runSignal?.aborted||signal?.aborted)cancelledRuns++;throw e;}
    finally{busy=false;}
   },
   stats(){return {disposed,busy,completedRuns,cancelledRuns,ortSessionCreations:1,ortSessionsActive:stage?1:0,providerHike:provider?.stats()??null,stageHikeLast:clone(lastStageMemory)};},
   async dispose(){if(disposed)return;if(busy)error('BUSY','Cancel/await tiled run before disposing its owned stage');disposed=true;ownedFile=null;biasAll=null;try{await stage?.dispose();}finally{stage=null;provider?.dispose();provider=null;}}
  });
 }catch(e){disposed=true;ownedFile=null;biasAll=null;await stage?.dispose();provider?.dispose();throw e;}
}

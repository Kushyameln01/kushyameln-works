import * as ort from '../../inference/vendor/ort.wasm.min.mjs';
import {createProjectionBridge} from './hike.mjs';
import {BRIDGE_WASM_SHA256} from './kernel/registry.mjs';
import {createProjectionGraph} from './graph.mjs';

// Fixed diagnostic partial graph. This never loads a full Bernini model.
ort.env.wasm.wasmPaths={
 mjs:new URL('../../inference/vendor/ort-wasm-simd-threaded.mjs',import.meta.url).href,
 wasm:new URL('../../inference/vendor/ort-wasm-simd-threaded.wasm',import.meta.url).href
};
ort.env.wasm.numThreads=1;
ort.env.wasm.proxy=false;
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
function floats(v,n){if(!(v instanceof Float32Array)||v.length!==n||!v.every(Number.isFinite))throw TypeError('Finite f32 tensor with exact shape required');}
export async function createOrtProjectionStage({hikeBytes}={}){
 if(hikeBytes===undefined){
  const response=await fetch(new URL('./kernel/bridge.wasm',import.meta.url));
  if(!response.ok)throw Error('Hike projection kernel unavailable');
  hikeBytes=await response.arrayBuffer();
 }
 let hike=await createProjectionBridge(hikeBytes),session;
 const graph=createProjectionGraph(),graphSHA256=await sha(graph);
 const begin=performance.now();
 try{session=await ort.InferenceSession.create(graph,{executionProviders:['wasm'],graphOptimizationLevel:'all'});}
 catch(error){hike.dispose();throw error;}
 const sessionCreateMs=performance.now()-begin;
 let busy=false,disposed=false;
 return {
  async run({q,scale,bias,x}){
   if(disposed)throw Error('Projection stage disposed');
   if(busy)throw Error('Projection stage busy');
   if(!(q instanceof Uint8Array)||q.length!==81920)throw RangeError('Q tile must be [16,5120] E4M3FN');
   floats(bias,16);floats(x,5120);
   if(typeof scale!=='number'||!Number.isFinite(scale)||scale<=0)throw TypeError('Positive finite scale required');
   // Own all inputs before the asynchronous ORT boundary.
   const qOwned=new Uint8Array(q),xOwned=new Float32Array(x),biasOwned=new Float32Array(bias);
   busy=true;let xTensor,wTensor,result;
   try{
    const start=performance.now();
    const weights=hike.dequant(qOwned,scale),afterDequant=performance.now();
    xTensor=new ort.Tensor('float32',xOwned,[1,5120]);
    wTensor=new ort.Tensor('float32',weights,[16,5120]);
    result=await session.run({x:xTensor,weight:wTensor});
    const afterOrt=performance.now(),projection=result.projection;
    if(projection.type!=='float32'||projection.dims.length!==2||projection.dims[0]!==1||projection.dims[1]!==16)throw Error('Unexpected ORT partial tensor');
    const output=hike.addBias(projection.data,biasOwned),end=performance.now();
    return {output,evidence:{scope:'partial Q projection; synthetic/explicit activation; not full-model prediction',executionProviders:['wasm'],ortVersion:ort.env.versions?.web??null,numThreads:ort.env.wasm.numThreads,proxy:ort.env.wasm.proxy,graphSHA256,hikeWasmSHA256:BRIDGE_WASM_SHA256,hikeMemory:hike.stats(),sessionCreateMs,elapsed:{dequantMs:afterDequant-start,ortMs:afterOrt-afterDequant,biasMs:end-afterOrt,totalRunMs:end-start},boundaryBytes:{qInput:81920,hikeWeightsToOrt:327680,xInput:20480,ortOutputToHike:64,biasInput:64,ownedOutput:64},OSMemoryPeak:null,OSMemoryReason:'not measured for bounded operator validation'}};
   }finally{
    result?.projection?.dispose?.();xTensor?.dispose?.();wTensor?.dispose?.();busy=false;
   }
  },
  async dispose(){
   if(disposed)return;
   if(busy)throw Error('Cannot dispose an active projection stage; terminate its owned Worker for cancellation');
   disposed=true;
   try{await session.release();}finally{session=null;hike.dispose();hike=null;}
  }
 };
}

import * as ort from '../../../inference/vendor/ort.wasm.min.mjs';
import {createDynamicLinearGraph} from '../block-hidden/graph.mjs';
import {createTwoQueryGraph} from '../attention-heads/graph.mjs';
import {releaseOwnedResources,cleanupAfterFailure} from '../qkv/ownership.mjs';
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
ort.env.wasm.wasmPaths={mjs:new URL('../../../inference/vendor/ort-wasm-simd-threaded.mjs',import.meta.url).href,wasm:new URL('../../../inference/vendor/ort-wasm-simd-threaded.wasm',import.meta.url).href};ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
const slots=Object.fromEntries(['length','byteOffset','byteLength','buffer'].map(k=>[k,Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Float32Array.prototype),k).get]));
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
function f32(x,n){
 if(!ArrayBuffer.isView(x)||Object.getPrototypeOf(x)!==Float32Array.prototype)throw TypeError('Native compact nonshared F32 exact shape required');
 const b=slots.buffer.call(x);if(!(b instanceof ArrayBuffer)||slots.length.call(x)!==n||slots.byteOffset.call(x)!==0||slots.byteLength.call(x)!==bufferLength.call(b))throw TypeError('Native compact nonshared F32 exact shape required');
 const out=new Float32Array(x);if(!out.every(Number.isFinite))throw TypeError('Finite F32 required');return out;
}
export function snapshotP4LinearInputs(input={}){
 if(Object.keys(input).some(k=>!['x','weight','rows','inner','columns','signal'].includes(k)))throw TypeError('Unknown P4 linear input; reduction splitting is excluded');
 const {x,weight,rows,inner,columns,signal}=input;
 if(!Number.isInteger(rows)||rows<1||rows>16||!Number.isInteger(inner)||inner<1||!(inner<=5120||inner===13824)||!Number.isInteger(columns)||columns<1||columns>(inner===13824?4:16))throw RangeError('Bounded P4 linear shape required; inner13824 requires columns<=4');
 if(signal!==undefined&&!(signal instanceof AbortSignal))throw TypeError('AbortSignal required');signal?.throwIfAborted();
 return {x:f32(x,rows*inner),weight:f32(weight,columns*inner),rows,inner,columns,signal};
}
// This owner differs from the prefix owner only at the explicitly admitted intact
// 13824-element FFN-down reduction. It never partitions the inner dimension.
export async function createP4Linear(){
 let session=null,score=null,disposed=false,closing=false,busy=false,active=null,pending=null;
 let runs=0,scoreRuns=0,inputCopyBytes=0,outputCopyBytes=0,ortMs=0;const tensors=new Set();
 const retain=t=>{tensors.add(t);return t;};
 const cleanTensors=()=>releaseOwnedResources([...tensors].map(value=>({value,release:v=>v.dispose(),clear:()=>tensors.delete(value)})));
 const cleanup=()=>releaseOwnedResources([{value:session,release:v=>v.release(),clear:()=>session=null},{value:score,release:v=>v.release(),clear:()=>score=null},{value:tensors.size?tensors:null,release:cleanTensors,clear:()=>{}}]);
 const live=()=>{if(disposed)throw Error('P4 linear disposed');if(closing)throw Object.assign(Error('P4 linear cleanup required'),{code:'RECOVERY_REQUIRED'});};
 const dispose=()=>{if(disposed)return Promise.resolve();if(pending)return pending;closing=true;pending=(async()=>{try{await active;await cleanup();disposed=true;closing=false;}finally{pending=null;}})();return pending;};
 const execute=async task=>{live();if(busy)throw Error('P4 linear busy');busy=true;let done;active=new Promise(resolve=>done=resolve);let primary;try{return await task();}catch(e){primary=e;throw e;}finally{try{await cleanTensors();}catch(e){closing=true;throw new AggregateError(primary?[primary,e]:[e],'P4 ORT cleanup failed; recover before reuse',{cause:primary??e});}finally{busy=false;done();active=null;}}};
 try{
  const graph=createDynamicLinearGraph(),scoreGraph=createTwoQueryGraph(),graphSHA256=await sha(graph),scoreGraphSHA256=await sha(scoreGraph);
  session=await ort.InferenceSession.create(graph,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  score=await ort.InferenceSession.create(scoreGraph,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  return Object.freeze({
   run(input={}){return execute(async()=>{
    // All caller storage is captured before the first ORT await.
    const {x,weight,rows,inner,columns,signal}=snapshotP4LinearInputs(input);inputCopyBytes+=x.byteLength+weight.byteLength;
    const xt=retain(new ort.Tensor('float32',x,[rows,inner])),wt=retain(new ort.Tensor('float32',weight,[columns,inner])),start=performance.now();
    const result=await session.run({x:xt,weight:wt});ortMs+=performance.now()-start;for(const tensor of Object.values(result))retain(tensor);signal?.throwIfAborted();
    if(result.projection?.type!=='float32'||String(result.projection.dims)!==String([rows,columns]))throw Error('P4 ORT projection shape mismatch');
    const output=f32(result.projection.data,rows*columns);outputCopyBytes+=output.byteLength;runs++;return {output,evidence:{graphSHA256,rows,inner,columns,weightBinding:'final-f32-runtime-input',computeDtype:'F32',innerSplit:false}};
   });},
   score(input={}){return execute(async()=>{
    if(Object.keys(input).some(k=>!['q','k','prevMax','keys','signal'].includes(k)))throw TypeError('Unknown P4 attention-score input');
    const {keys,signal}=input;if(!Number.isInteger(keys)||keys<1||keys>64)throw RangeError('P4 exact logical key tile1..64 required');if(signal!==undefined&&!(signal instanceof AbortSignal))throw TypeError('AbortSignal required');signal?.throwIfAborted();
    const q=f32(input.q,256),k=f32(input.k,keys*128),prevMax=f32(input.prevMax,2);inputCopyBytes+=q.byteLength+k.byteLength+prevMax.byteLength;
    const qt=retain(new ort.Tensor('float32',q,[2,128])),kt=retain(new ort.Tensor('float32',k,[keys,128])),pt=retain(new ort.Tensor('float32',prevMax,[2])),start=performance.now();
    const result=await score.run({q:qt,k:kt,prevMax:pt});ortMs+=performance.now()-start;for(const tensor of Object.values(result))retain(tensor);signal?.throwIfAborted();
    const out={};for(const [name,n,dims] of [['weights',2*keys,[2,keys]],['alpha',2,[2]],['newMax',2,[2]]]){if(result[name]?.type!=='float32'||String(result[name].dims)!==String(dims))throw Error('P4 ORT score shape mismatch');out[name]=f32(result[name].data,n);outputCopyBytes+=out[name].byteLength;}
    scoreRuns++;return out;
   });},
   describe(){live();return {graphSHA256,scoreGraphSHA256,weightBinding:'final-f32-runtime-input',rows:[1,16],ordinaryInner:[1,5120],ffnDownInner:13824,ffnDownMaxOutputColumns:4,innerSplit:false,scoreGraphQueryRows:2,scoreGraphQueryRowsConsumed:2,scoreGraphInactiveRows:0,ortVersion:ort.env.versions?.web??null,sessionCreations:2};},
   stats(){return {busy,disposed,cleanupPending:closing,pendingTensors:tensors.size,runs,scoreRuns,inputCopyBytes,outputCopyBytes,ortMs,sessionCreations:2,activeORTSessions:Number(!!session)+Number(!!score)};},dispose,recover:dispose
  });
 }catch(error){closing=true;throw await cleanupAfterFailure(error,dispose);}
}

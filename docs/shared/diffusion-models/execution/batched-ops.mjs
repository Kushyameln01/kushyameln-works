import * as ort from '../../inference/vendor/ort.wasm.min.mjs';
import {createDynamicLinearGraph} from '../ort-bridge/block-hidden/graph.mjs';
import {releaseOwnedResources,cleanupAfterFailure} from '../ort-bridge/qkv/ownership.mjs';
import {createBatchedAttentionGraph,BATCHED_ATTENTION_SCALE} from './batched-attention-graph.mjs';

ort.env.wasm.wasmPaths={mjs:new URL('../../inference/vendor/ort-wasm-simd-threaded.mjs',import.meta.url).href,wasm:new URL('../../inference/vendor/ort-wasm-simd-threaded.wasm',import.meta.url).href};
ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;

export const BATCHED_F32_PROFILE='f32-ort-gemm-batched-online-softmax-context-matmul-v1';
export const BATCHED_MODEL_LIMITS=Object.freeze({maxRows:128,maxColumns:5120,maxInner:13824,heads:40,maxQueries:128,maxKeys:256,headDim:128});
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
const sameShape=(actual,expected)=>Array.isArray(actual)&&actual.length===expected.length&&expected.every((n,i)=>actual[i]===n);
const typedArrayPrototype=Object.getPrototypeOf(Float32Array.prototype);
const typedArraySlot=Object.fromEntries(['buffer','byteLength','byteOffset','length'].map(name=>[name,Object.getOwnPropertyDescriptor(typedArrayPrototype,name).get]));
const arrayBufferByteLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
function snapshot(value,length,label,{nonnegative=false}={}){
 const fail=()=>{throw TypeError(label+': native compact nonshared finite exact-shape F32 required');};
 if(Object.getPrototypeOf(value??{})!==Float32Array.prototype)fail();
 let buffer,byteLength,byteOffset,actualLength;
 try{buffer=typedArraySlot.buffer.call(value);byteLength=typedArraySlot.byteLength.call(value);byteOffset=typedArraySlot.byteOffset.call(value);actualLength=typedArraySlot.length.call(value);}catch{fail();}
 if(actualLength!==length||Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||byteOffset!==0||byteLength!==arrayBufferByteLength.call(buffer))fail();
 // The native typed-array constructor reads internal slots, ignoring caller
 // overrides of length, iterator, every and slice. Check the owned bytes.
 const owned=new Float32Array(value);
 for(let i=0;i<owned.length;i++)if(!Number.isFinite(owned[i])||(nonnegative&&owned[i]<0))fail();
 return owned;
}
function output(tensor,shape,label){
 if(tensor?.type!=='float32'||!sameShape(tensor.dims,shape)||!(tensor.data instanceof Float32Array)||tensor.data.length!==shape.reduce((a,b)=>a*b,1)||!tensor.data.every(Number.isFinite))throw Error('ORT '+label+' finite F32/shape mismatch');
 return tensor.data.slice();
}
function bounded(value,max,label){if(!Number.isSafeInteger(value)||value<1||value>max)throw RangeError(label+' exceeds bounded shape 1..'+max);return value;}

// Limits bound named F32 spans: the largest weight tile is 270 MiB; its owned
// snapshot is another 270 MiB. Attention scores are at most 5 MiB, independent
// of the sequence length. ORT allocator memory is additional and not estimated.
export async function createBatchedModelOps(options={}){
 const {maxRows=128,maxColumns=5120,maxInner=13824}=options;
 const limits=Object.freeze({maxRows:bounded(maxRows,128,'maxRows'),maxColumns:bounded(maxColumns,5120,'maxColumns'),maxInner:bounded(maxInner,13824,'maxInner'),heads:40,maxQueries:128,maxKeys:256,headDim:128});
 let linearSession=null,attentionSession=null,busy=false,disposed=false,closing=false,pending=null,linearRuns=0,attentionRuns=0,inputCopyBytes=0,outputCopyBytes=0;
 const tensors=new Set(),retain=value=>{tensors.add(value);return value;};
 const live=()=>{if(disposed)throw Error('Batched model ops disposed');if(closing)throw Object.assign(Error('Batched model ops cleanup required'),{code:'RECOVERY_REQUIRED'});};
 const cleanupTensors=()=>releaseOwnedResources([...tensors].map(value=>({value,release:t=>t.dispose(),clear:()=>tensors.delete(value)})));
 const cleanup=()=>releaseOwnedResources([
  {value:tensors.size?tensors:null,release:()=>cleanupTensors(),clear:()=>{}},
  {value:linearSession,release:s=>s.release(),clear:()=>{linearSession=null;}},
  {value:attentionSession,release:s=>s.release(),clear:()=>{attentionSession=null;}}
 ]);
 const dispose=()=>{
  if(disposed)return Promise.resolve();if(busy)return Promise.reject(Error('Cancel and await active batched operation before disposal'));if(pending)return pending;
  closing=true;pending=Promise.resolve().then(async()=>{try{await cleanup();disposed=true;closing=false;}finally{pending=null;}});return pending;
 };
 const finish=async primary=>{try{await cleanupTensors();}catch(error){closing=true;throw new AggregateError(primary?[primary,error]:[error],'Batched ORT tensor cleanup failed; call recover before reuse',{cause:primary??error});}finally{busy=false;}};
 const tensor=(data,shape)=>{inputCopyBytes+=data.byteLength;return retain(new ort.Tensor('float32',data,shape));};
 try{
  const linearGraph=createDynamicLinearGraph(),attentionGraph=createBatchedAttentionGraph();
  const linearGraphSHA256=await digest(linearGraph),attentionGraphSHA256=await digest(attentionGraph);
  linearSession=await ort.InferenceSession.create(linearGraph,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  attentionSession=await ort.InferenceSession.create(attentionGraph,{executionProviders:['wasm'],graphOptimizationLevel:'disabled'});
  return Object.freeze({
   async linear(input={}){
    live();if(busy)throw Error('Batched model ops busy');busy=true;let primary;
    try{
     const {x,weight,rows,columns,inner,signal}=input;signal?.throwIfAborted();bounded(rows,limits.maxRows,'rows');bounded(columns,limits.maxColumns,'columns');bounded(inner,limits.maxInner,'inner');
     // Snapshot every caller-owned span before session.run's first await.
     const a=snapshot(x,rows*inner,'x'),b=snapshot(weight,columns*inner,'weight');
     const result=await linearSession.run({x:tensor(a,[rows,inner]),weight:tensor(b,[columns,inner])});for(const value of Object.values(result))retain(value);signal?.throwIfAborted();
     const projection=output(result.projection,[rows,columns],'projection');outputCopyBytes+=projection.byteLength;linearRuns++;
     return {output:projection,evidence:{precisionProfile:BATCHED_F32_PROFILE,computeF32:true,computeDtype:'F32',rows,columns,inner,fullInner:true,graphSHA256:linearGraphSHA256,weightBinding:'runtime-input',ortVersion:ort.env.versions?.web??null}};
    }catch(error){primary=error;throw error;}finally{await finish(primary);}
   },
   async attentionTile(input={}){
    live();if(busy)throw Error('Batched model ops busy');busy=true;let primary;
    try{
     const {q,k,v,previousMax,previousDenominator,previousContext,heads,queries,keys,headDim,signal}=input;signal?.throwIfAborted();
     if(heads!==40||headDim!==128)throw RangeError('Bounded attention shape requires H40/D128');bounded(queries,128,'queries');bounded(keys,256,'keys');
     const rowCount=heads*queries,qSize=rowCount*headDim,kvSize=heads*keys*headDim;
     const ownedQ=snapshot(q,qSize,'q'),ownedK=snapshot(k,kvSize,'k'),ownedV=snapshot(v,kvSize,'v'),ownedMax=snapshot(previousMax,rowCount,'previousMax'),ownedDenominator=snapshot(previousDenominator,rowCount,'previousDenominator',{nonnegative:true}),ownedContext=snapshot(previousContext,qSize,'previousContext');
     const result=await attentionSession.run({q:tensor(ownedQ,[heads,queries,headDim]),k:tensor(ownedK,[heads,keys,headDim]),v:tensor(ownedV,[heads,keys,headDim]),previousMax:tensor(ownedMax,[heads,queries]),previousDenominator:tensor(ownedDenominator,[heads,queries]),previousContext:tensor(ownedContext,[heads,queries,headDim])});
     for(const value of Object.values(result))retain(value);signal?.throwIfAborted();
     const max=output(result.max,[heads,queries],'max'),denominator=output(result.denominator,[heads,queries],'denominator'),context=output(result.context,[heads,queries,headDim],'context');
     if(!denominator.every(n=>n>0))throw Error('ORT attention denominator must be positive');
     outputCopyBytes+=max.byteLength+denominator.byteLength+context.byteLength;attentionRuns++;
     return {max,denominator,context,evidence:{precisionProfile:BATCHED_F32_PROFILE,computeF32:true,computeDtype:'F32',heads,queries,keys,headDim,logicalScoreElements:heads*queries*keys,phantomQueries:0,phantomKeys:0,scale:BATCHED_ATTENTION_SCALE,contextReduction:'ORT F32 batched MatMul; independent profile from Hike scalar recurrence',graphSHA256:attentionGraphSHA256,ortVersion:ort.env.versions?.web??null}};
    }catch(error){primary=error;throw error;}finally{await finish(primary);}
   },
   describe(){live();return {schemaVersion:'works-batched-model-ops/0.1',precisionProfile:BATCHED_F32_PROFILE,computeF32:true,limits:{...limits},linearGraphSHA256,attentionGraphSHA256,sessionCreations:2,initialAttentionState:{max:-3.4028234663852886e38,denominator:0,context:0},layout:'head-major contiguous [H,Q,D]/[H,K,D]',context:'unnormalized online numerator; divide by denominator after all keys',scale:BATCHED_ATTENTION_SCALE,originalProductionPrecisionVerified:false,modelInference:false};},
   stats(){return {busy,disposed,cleanupPending:closing,pendingTensors:tensors.size,linearRuns,attentionRuns,inputCopyBytes,outputCopyBytes,sessionCreations:2};},dispose,recover:dispose
  });
 }catch(error){closing=true;throw await cleanupAfterFailure(error,dispose);}
}

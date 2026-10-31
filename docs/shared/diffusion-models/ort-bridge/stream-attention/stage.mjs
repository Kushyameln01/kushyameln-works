import * as ort from '../../../inference/vendor/ort.wasm.min.mjs';
import {createStreamAttentionGraph,ATTENTION_SCALE} from './graph.mjs';
import {createStreamAccumulator} from './hike.mjs';
import {STREAM_WASM_SHA256} from './registry.mjs';
ort.env.wasm.wasmPaths={mjs:new URL('../../../inference/vendor/ort-wasm-simd-threaded.mjs',import.meta.url).href,wasm:new URL('../../../inference/vendor/ort-wasm-simd-threaded.wasm',import.meta.url).href};
ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
const digest=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
const clone=v=>structuredClone(v);
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(v);
const dims=(a,b)=>Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>Object.hasOwn(a,i)&&a[i]===v);
function floats(a,n){if(!(a instanceof Float32Array)||a.length!==n||!(a.buffer instanceof ArrayBuffer)||a.byteOffset!==0||a.byteLength!==a.buffer.byteLength||!a.every(Number.isFinite))throw TypeError('Compact nonshared finite exact-shape F32 tensor required');}
function binding(d){if(d?.schemaVersion!=='works-postnorm-rope-qkv/0.1'||!validId(d.bindingId)||d.rows!==16||d.headDim!==128||!Number.isSafeInteger(d.keyCount)||d.keyCount<1||d.keyCount>32760||d.dtype!=='float32'||d.querySpace!=='post-qk-norm-rope'||d.keySpace!=='post-qk-norm-rope'||d.valueSpace!=='projected-value'||d.mask!=='none'||d.dropout!==0||!['explicit-fixture','precomputed-tensors'].includes(d.provenance?.kind))throw TypeError('Explicit postnorm/RoPE one-head source contract required');return d;}
export async function createStreamAttention({hikeBytes}={}){
 if(hikeBytes===undefined){const r=await fetch(new URL('./kernel.wasm',import.meta.url));if(!r.ok)throw Error('Stream Hike unavailable');hikeBytes=await r.arrayBuffer();}
 let hike=await createStreamAccumulator(hikeBytes),session=null,disposed=false,busy=false,last=null;
 const graph=createStreamAttentionGraph(),graphSHA256=await digest(graph),begin=performance.now();
 try{session=await ort.InferenceSession.create(graph,{executionProviders:['wasm'],graphOptimizationLevel:'all'});}catch(e){hike.dispose();throw e;}
 const sessionCreateMs=performance.now()-begin;
 const live=()=>{if(disposed)throw Error('Stream attention disposed');};
 return Object.freeze({
  describe(){live();return {schemaVersion:'works-stream-attention/0.1',scope:'EXPLICIT_Q16_ONE_HEAD_ALL_KEYS',input:{query:[16,128],keyCount:[1,32760],logicalTileMax:64,tail:'exact-shape'},precisionProfile:'f32-ort-score-exp-hike-recurrence-v1',scale:ATTENTION_SCALE,graphSHA256,hikeWasmSHA256:STREAM_WASM_SHA256,requiredSourceSchema:'works-postnorm-rope-qkv/0.1',productionQKVVerified:false,modelInference:false};},
  async run(input={}){
   live();if(busy)throw Error('Stream attention busy');busy=true;let qTensor=null;
   try{
   const {q,source,signal,onProgress}=input;signal?.throwIfAborted();floats(q,2048);
   if(typeof source?.describe!=='function'||typeof source?.readKV!=='function')throw TypeError('Explicit versioned QKV source required');
   const sourceBinding=binding(clone(source.describe())),read=source.readKV.bind(source);if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('onProgress must be a function');
   const started=performance.now(),ownedQ=new Float32Array(q);let prevMax=new Float32Array(16).fill(-3.4028234663852886e38);
   const memoryBefore=hike.stats();let tiles=0,keysConsumed=0,ortMs=0,hikeMs=0,readMs=0,maxUpdates=0,finalKeyCount=0;
   hike.reset(16);
    qTensor=new ort.Tensor('float32',ownedQ,[16,128]);
    for(let offset=0;offset<sourceBinding.keyCount;offset+=64){
     signal?.throwIfAborted();const count=Math.min(64,sourceBinding.keyCount-offset),beforeRead=performance.now();
     const received=await read(offset,count,{signal});live();signal?.throwIfAborted();
     if(received?.bindingId!==sourceBinding.bindingId||received.offset!==offset||received.count!==count||!dims(received.kShape,[count,128])||!dims(received.vShape,[count,128]))throw Error('QKV source binding/logical range mismatch');
     floats(received.k,count*128);floats(received.v,count*128);
     const k=new Float32Array(received.k),v=new Float32Array(received.v),afterRead=performance.now();let kTensor,prevTensor,result;
     try{
      kTensor=new ort.Tensor('float32',k,[count,128]);prevTensor=new ort.Tensor('float32',prevMax,[16]);
      result=await session.run({q:qTensor,k:kTensor,prevMax:prevTensor});live();signal?.throwIfAborted();
      if(result.weights?.type!=='float32'||!dims(result.weights.dims,[16,count])||result.alpha?.type!=='float32'||!dims(result.alpha.dims,[16])||result.newMax?.type!=='float32'||!dims(result.newMax.dims,[16]))throw Error('Actual ORT logical tile shape mismatch');
      const weights=new Float32Array(result.weights.data),alpha=new Float32Array(result.alpha.data),nextMax=new Float32Array(result.newMax.data);floats(weights,16*count);floats(alpha,16);floats(nextMax,16);
      for(let r=0;r<16;r++){if(nextMax[r]<prevMax[r])throw Error('Row maximum decreased');if(nextMax[r]>prevMax[r])maxUpdates++;}
      const afterOrt=performance.now();hike.update({weights,values:v,alpha,keys:count});const afterHike=performance.now();
      signal?.throwIfAborted();prevMax=nextMax;tiles++;keysConsumed+=count;finalKeyCount=count;readMs+=afterRead-beforeRead;ortMs+=afterOrt-afterRead;hikeMs+=afterHike-afterOrt;
      if(hike.stats().memoryBytes!==memoryBefore.memoryBytes)throw Error('Stream Hike workspace grew');
      onProgress?.({offset,count,keysConsumed,totalKeys:sourceBinding.keyCount,tiles});signal?.throwIfAborted();
     }finally{for(const value of Object.values(result??{}))value.dispose?.();kTensor?.dispose?.();prevTensor?.dispose?.();}
    }
    const beforeFinish=performance.now(),output=hike.finish(),denominators=hike.denominators(),ended=performance.now();hikeMs+=ended-beforeFinish;last={tiles,keysConsumed};
    return {output,denominators,rowMax:prevMax.slice(),evidence:{schemaVersion:'works-stream-attention-evidence/0.1',scope:'EXPLICIT_Q16_ONE_HEAD_ALL_KEYS',sourceBinding:clone(sourceBinding),precisionProfile:'f32-ort-score-exp-hike-recurrence-v1',queryShape:[16,128],outputShape:[16,128],keysConsumed,tiles,finalKeyCount,phantomKeys:0,scale:ATTENTION_SCALE,maxUpdates,graphSHA256,hikeWasmSHA256:STREAM_WASM_SHA256,ortVersion:ort.env.versions?.web??null,ortSessionCreations:1,sessionCreateMs,hikeMemoryStart:memoryBefore,hikeMemoryEnd:hike.stats(),elapsed:{readMs,ortMs,hikeMs,totalRunMs:ended-started},productionQKVVerified:false,resources:{sourceQKVInputBytes:8192+sourceBinding.keyCount*1024,hostSnapshotCopyBytes:8192+sourceBinding.keyCount*1088+tiles*128+128,hikeInputCopyBytes:hike.stats().inputCopyBytes-memoryBefore.inputCopyBytes,hikeOutputCopyBytes:hike.stats().outputCopyBytes-memoryBefore.outputCopyBytes,hikeArenaResetBytes:hike.stats().arenaBytes,hikeTransientClearBytes:36928*tiles,logicalOrtInputBytes:tiles*(8192+64)+sourceBinding.keyCount*512,logicalOrtOutputBytes:sourceBinding.keyCount*64+tiles*128,logicalMaxScoreTileElements:1024,selectedDenseScoreBytes:16*sourceBinding.keyCount*4,knownNamedNumericLiveBytes:164288,knownNamedNumericPlusHikeBytes:164288+hike.stats().memoryBytes,knownLiveScope:'conservative named numeric array spans only; excludes producer full KV backing, metadata, compiler/ORT Memory, GC-unreclaimed arrays, harness/reference and other caller buffers',producerResidentBytes:null,producerResidentReason:'source provenance kind is not a resident-byte proof; on-demand fixture audited separately',ortMemoryBytes:null},fullHeadCountVerified:false,originalProductionPrecisionVerified:false,E8:'BLOCKED'}};
   }finally{qTensor?.dispose?.();busy=false;}
  },
  stats(){return {disposed,busy,ortSessionCreations:1,hike:hike?.stats()??null,last:clone(last)};},
  async dispose(){if(disposed)return;if(busy)throw Error('Cancel and await active stream before disposal');disposed=true;try{await session.release();}finally{session=null;hike.dispose();hike=null;}}
 });
}

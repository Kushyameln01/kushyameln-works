/** Actual staged Wan UMT5 encoder. CPU WASM only; FP32 prepared diagnostics. */
const TYPE='wan-umt5-staged-fp32';
const MODEL='c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68';
const DIM=4096;
const HEX=/^[0-9a-f]{64}$/;
const failure=(message)=>{throw new Error(message);};
const checkSignal=(signal)=>{if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');};
const hex=(bytes)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function sha256(bytes){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));}
function record(r,label){if(!r||typeof r.path!=='string'||!Number.isSafeInteger(r.bytes)||r.bytes<1||!HEX.test(r.sha256))failure(`Invalid ${label} manifest record`);}
export function inspectTextEncoderManifest(manifest){
 if(!manifest||manifest.type!==TYPE||manifest.schemaVersion!==1||manifest.modelSha256!==MODEL)failure('Unsupported text model manifest');
 if(!manifest.complete||manifest.numLayers!==24||manifest.hiddenSize!==DIM||!Array.isArray(manifest.blocks)||manifest.blocks.length!==24)failure('Incomplete text encoder manifest');
 if(manifest.onnxOpset!==17||manifest.ortVersion!=='1.24.3'||manifest.maxTokens!==512)failure('Unsupported text runtime manifest');
 const e=manifest.embedding;
 if(!e||e.dtype!=='float16-le'||e.hiddenSize!==DIM||e.vocabSize!==256384||!Number.isSafeInteger(e.offset)||typeof e.sourceFile!=='string'||e.sourceBytes!==6735906897)failure('Invalid text embedding manifest');
 manifest.blocks.forEach((r,i)=>{record(r,'block');if(r.index!==i||!r.nativePass)failure('Unverified text block manifest');});
 record(manifest.finalNorm,'final norm');if(manifest.finalNorm.bytes!==DIM*4||manifest.finalNorm.epsilon!==1e-6)failure('Invalid final norm manifest');
 record(e.rowHashes,'embedding row hashes');if(e.rowHashes.bytes!==e.vocabSize*32)failure('Invalid embedding row hash table');
 return {type:TYPE,hiddenSize:DIM,numLayers:24,maxTokens:512,arithmetic:manifest.arithmetic,modelSha256:MODEL};
}
export async function loadTextEncoder({manifest,files,ort,hike,signal,onProgress}={}){
 const info=inspectTextEncoderManifest(manifest);checkSignal(signal);
 if(!(files instanceof Map))failure('Text encoder files must be a Map');
 if(!ort?.InferenceSession?.create||!ort?.Tensor)failure('ORT WASM runtime required');
 if(typeof hike?.rmsNorm!=='function')failure('Hike RMSNorm kernel required');
 const ortVersion=ort.env?.versions?.web??ort.env?.versions?.common;
 if(ortVersion&&ortVersion!=='1.24.3')failure(`ORT version mismatch: ${ortVersion}`);
 if(!ort.env?.wasm)failure('ORT WASM environment required');
 ort.env.wasm.numThreads=1;
 let disposed=false,running=false,currentSession=null,activeDone=Promise.resolve();
 const get=(path)=>files.get(path)??failure(`Missing text model file: ${path}`);
 function size(file){return file instanceof Uint8Array?file.byteLength:file.size;}
 async function read(path,start=0,length){
  const f=get(path),end=length===undefined?size(f):start+length;
  if(!Number.isSafeInteger(start)||start<0||end>size(f))failure(`Invalid text file range: ${path}`);
  return f instanceof Uint8Array?f.slice(start,end):new Uint8Array(await f.slice(start,end).arrayBuffer());
 }
 async function verified(r){
  if(size(get(r.path))!==r.bytes)failure(`Text file size mismatch: ${r.path}`);
  const bytes=await read(r.path);if(await sha256(bytes)!==r.sha256)failure(`Text file hash mismatch: ${r.path}`);return bytes;
 }
 const source=manifest.embedding;
 if(size(get(source.sourceFile))!==source.sourceBytes)failure('Original UMT5 source size mismatch');
 for(const b of manifest.blocks)if(size(get(b.path))!==b.bytes)failure(`Text block size mismatch: ${b.path}`);
 const normBytes=await verified(manifest.finalNorm),normWeight=new Float32Array(normBytes.buffer,normBytes.byteOffset,DIM);
 const rowHashes=await verified(source.rowHashes);
 checkSignal(signal);
 onProgress?.({stage:'text-ready',blocks:24});
 const check=(s)=>{checkSignal(signal);checkSignal(s);if(disposed)failure('Text encoder disposed');};
 function half(u){
  const sign=(u&32768)?-1:1,exponent=(u>>>10)&31,fraction=u&1023;
  return exponent===0?sign*fraction*2**-24:exponent===31?(fraction?NaN:sign*Infinity):sign*(1+fraction/1024)*2**(exponent-15);
 }
 async function embeddings(ids){
  const x=new Float32Array(ids.length*DIM),cache=new Map();
  for(let i=0;i<ids.length;i++){
   let row=cache.get(ids[i]);
   if(!row){
    const bytes=await read(source.sourceFile,source.offset+ids[i]*DIM*2,DIM*2);
    const expected=hex(rowHashes.subarray(ids[i]*32,(ids[i]+1)*32));
    if(await sha256(bytes)!==expected)failure(`Original embedding row hash mismatch: token ${ids[i]}`);
    row=new Float32Array(DIM);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    for(let j=0;j<DIM;j++){row[j]=half(view.getUint16(j*2,true));if(!Number.isFinite(row[j]))failure('Non-finite original token embedding');}
    cache.set(ids[i],row);
   }
   x.set(row,i*DIM);
  }
  return x;
 }
 async function run({tokenIds,attentionMask,signal:runSignal,onProgress:progress}={}){
  if(running)failure('Text encoder already running');check(runSignal);
  const ids=Array.from(tokenIds??[],Number),mask=Array.from(attentionMask??[],Number);
  if(!ids.length||ids.length>512||ids.length!==mask.length||ids.some(v=>!Number.isSafeInteger(v)||v<0||v>=source.vocabSize)||mask.some(v=>v!==0&&v!==1)||!mask.includes(1))failure('Invalid text token IDs or attention mask');
  let length=ids.length;
  if(manifest.trailingMaskCompaction?.pass===true)while(length>1&&mask[length-1]===0)length--;
  // Keep internal masked positions. Only trailing masked rows may be elided.
  const effectiveIds=ids.slice(0,length),effectiveMask=Float32Array.from(mask.slice(0,length));
  running=true;let finish;activeDone=new Promise(resolve=>{finish=resolve;});
  const emit=(event)=>{onProgress?.(event);progress?.(event);};
  try{
   let hidden=await embeddings(effectiveIds);check(runSignal);emit({stage:'text-embedding',effectiveTokens:length,outputTokens:ids.length});
   for(const b of manifest.blocks){
    check(runSignal);let bytes=await verified(b);check(runSignal);
    currentSession=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});bytes=null;
    let hiddenInput,maskInput,result;
    try{
     check(runSignal);
     hiddenInput=new ort.Tensor('float32',hidden,[1,length,DIM]);maskInput=new ort.Tensor('float32',effectiveMask,[1,length]);
     result=await currentSession.run({hidden:hiddenInput,mask:maskInput});check(runSignal);
     const next=result.hidden_out;
     if(!next||next.type!=='float32'||next.dims.join(',')!==[1,length,DIM].join(',')||next.data.length!==length*DIM)failure('Unexpected text block output tensor');
     hidden=new Float32Array(next.data);
    }finally{
     try{for(const tensor of new Set([...Object.values(result??{}),hiddenInput,maskInput]))tensor?.dispose?.();}
     finally{const session=currentSession;currentSession=null;await session?.release();}
    }
    emit({stage:'text-block',completed:b.index+1,total:24,effectiveTokens:length});
   }
   check(runSignal);
   const normalized=await hike.rmsNorm(hidden,normWeight,length,DIM,manifest.finalNorm.epsilon);
   if(!(normalized instanceof Float32Array)||normalized.length!==length*DIM||normalized.some(v=>!Number.isFinite(v)))failure('Invalid Hike final RMSNorm result');
   const result=new Float32Array(ids.length*DIM);
   for(let i=0;i<length;i++)if(mask[i])result.set(normalized.subarray(i*DIM,(i+1)*DIM),i*DIM);
   check(runSignal);emit({stage:'text-complete',completed:24,total:24});
   return {hiddenStates:result,shape:[1,ids.length,DIM],attentionMask:Uint8Array.from(mask),provenance:{...info,effectiveTokens:length,trailingMaskCompaction:length<ids.length,hikeOperation:'actual encoder.final_layer_norm',hikeContributed:true,finalNumericGate:manifest.numericGate,preparedFixtureNativeMaxAbsError:manifest.nativeFinalMaxAbsError,sourceSha256:manifest.sourceSha256,manifestModelSha256:MODEL}};
  }finally{running=false;finish();}
 }
 async function dispose(){disposed=true;await activeDone;if(currentSession){await currentSession.release();currentSession=null;}}
 return Object.freeze({run,dispose,info});
}

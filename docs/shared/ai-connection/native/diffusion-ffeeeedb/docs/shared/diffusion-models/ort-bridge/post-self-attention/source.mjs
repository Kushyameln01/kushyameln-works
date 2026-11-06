import {inspectSafetensors} from '../../api/safetensors.mjs';
import {TARGET_PROVENANCE} from '../../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../../lora/weights.mjs';
import {createProjectionBridge} from '../hike.mjs';
import {createDynamicLinearGraph} from '../block-hidden/graph.mjs';
import {BRIDGE_WASM_SHA256} from '../kernel/registry.mjs';

const copy=x=>structuredClone(x),abort=s=>s?.throwIfAborted();
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const equalShape=(a,b)=>Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>a[i]===v);
function parameterBinding(key){
 if(key.startsWith('blocks.0.norm3.'))return {programSlot:key,hikeExport:'Norm',hikeParameter:key.endsWith('.bias')?'bias':'weight',operator:'norm3-affine-layernorm'};
 if(key.startsWith('blocks.0.cross_attn.norm_'))return {programSlot:key,hikeExport:'Norm',hikeParameter:'weight',operator:key.slice(0,-7)};
 if(key==='blocks.0.modulation')return {programSlot:key,hikeExport:'Add',hikeParameter:'x',operator:'ffn-modulation-chunks3-5'};
 return {programSlot:key,hikeExport:'AddBias',hikeParameter:'bias',operator:key.slice(0,-5)};
}
const SPECS={};
for(const [stem,fullShape,storageDtype] of [
 ['text_embedding.0',[5120,4096],'F16'],['text_embedding.2',[5120,5120],'F16'],
 ...['q','k','v','o'].map(k=>['blocks.0.cross_attn.'+k,[5120,5120],k==='o'?'F16':'F8_E4M3']),
 ['blocks.0.ffn.0',[13824,5120],'F8_E4M3'],['blocks.0.ffn.2',[5120,13824],'F8_E4M3']
]){
 SPECS[stem+'.weight']={storageDtype,fullShape,columns:fullShape[1],allowedRows:[0,fullShape[0]],maxRows:stem==='blocks.0.ffn.2'?4:16};
 SPECS[stem+'.bias']={storageDtype:'F16',fullShape:[fullShape[0]],allowedElements:[0,fullShape[0]]};
}
for(const key of ['blocks.0.norm3.weight','blocks.0.norm3.bias','blocks.0.cross_attn.norm_q.weight','blocks.0.cross_attn.norm_k.weight'])SPECS[key]={storageDtype:'F16',fullShape:[5120],allowedElements:[0,5120]};
SPECS['time_projection.1.weight']={storageDtype:'F16',fullShape:[30720,5120],columns:5120,allowedRows:[15360,30720],maxRows:16};
SPECS['time_projection.1.bias']={storageDtype:'F16',fullShape:[30720],allowedElements:[15360,30720]};
SPECS['blocks.0.modulation']={storageDtype:'F16',fullShape:[1,6,5120],allowedElements:[15360,30720]};

const typed=Object.getPrototypeOf(Float32Array.prototype),slot=Object.fromEntries(['length','byteOffset','byteLength','buffer'].map(k=>[k,Object.getOwnPropertyDescriptor(typed,k).get])),tag=Object.getOwnPropertyDescriptor(typed,Symbol.toStringTag).get,bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
function ownedBytes(value){if(value instanceof ArrayBuffer)return new Uint8Array(value).slice();if(ArrayBuffer.isView(value)&&tag.call(value)==='Uint8Array'&&slot.buffer.call(value) instanceof ArrayBuffer)return new Uint8Array(value);throw TypeError('Nonshared bridge bytes required');}
function compact(value,count){if(!ArrayBuffer.isView(value)||tag.call(value)!=='Float32Array')throw TypeError('Compact nonshared finite F32 required');const buffer=slot.buffer.call(value);if(!(buffer instanceof ArrayBuffer)||slot.length.call(value)!==count||slot.byteOffset.call(value)!==0||slot.byteLength.call(value)!==bufferLength.call(buffer))throw TypeError('Compact nonshared finite F32 required');const out=new Float32Array(value);if(!out.every(Number.isFinite))throw TypeError('Compact nonshared finite F32 required');return out;}

/** Reads immutable original storage only. It never applies or subtracts a patch. */
export async function createP4WeightSource({file,side,bridgeBytes}={}){
 if(!(file instanceof Blob)||!['HIGH','LOW'].includes(side))throw TypeError('Original immutable Blob and explicit side required');
 if(bridgeBytes!==undefined)bridgeBytes=ownedBytes(bridgeBytes);
 let original=file,bridge=null,busy=false,disposed=false,reads=0,readBytes=0,headerReads=0,headerReadBytes=0,configReads=0,configReadBytes=0,payloadReads=0,payloadReadBytes=0,maxPayloadReadBytes=0;
 const live=signal=>{if(disposed)throw Error('P4 weight source disposed');abort(signal);};
 const read=async(offset,count,kind,signal)=>{
  live(signal);if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||offset<0||count<1||count>163840||offset>original.size-count)throw RangeError('Bounded original read range');
  const raw=new Uint8Array(await original.slice(offset,offset+count).arrayBuffer());live(signal);if(raw.length!==count)throw Error('Original range length mismatch');
  reads++;readBytes+=count;if(kind==='config'){configReads++;configReadBytes+=count;}else{payloadReads++;payloadReadBytes+=count;maxPayloadReadBytes=Math.max(maxPayloadReadBytes,count);}return raw;
 };
 try{
  const inspected=await inspectSafetensors(original,{rejectDuplicateKeys:true});live();const pinned=TARGET_PROVENANCE.models.find(m=>m.name.includes(side));
  if(inspected.fileBytes!==pinned.fileBytes||inspected.headerSHA256!==pinned.headerSHA256)throw Error('Original base side/header/size mismatch');
  headerReads=2;headerReadBytes=8+inspected.headerBytes;reads=headerReads;readBytes=headerReadBytes;
  const descriptors=new Map(inspected.tensors.map(t=>[t.name,t])),payload=8+inspected.headerBytes,entries={},scales=new Map();
  for(const [key,spec]of Object.entries(SPECS)){
   const d=descriptors.get(key);if(!d||d.dtype!==spec.storageDtype||!equalShape(d.shape,spec.fullShape))throw Error('Original key/full shape/dtype mismatch: '+key);
   entries[key]={originalKey:key,key:'diffusion_model.'+key,weightId:key,fullShape:[...spec.fullShape],storageDtype:d.dtype,computeDtype:'F32',layout:'row-major',columns:spec.columns??null,absoluteByteOffset:payload+d.dataOffsets[0],byteLength:d.byteLength,
    binding:{kind:spec.columns?'runtime-input':'hike-parameter',name:key},operatorBinding:spec.columns?{programSlot:key,graphInput:'weight',operator:key.slice(0,-7)}:parameterBinding(key),
    transform:{kind:'identity',transpose:false},fp8ProfileId:null,...(spec.columns?{allowedRows:[...spec.allowedRows],maxRows:spec.maxRows}:{allowedElements:[...spec.allowedElements]})};
   if(d.dtype!=='F8_E4M3')continue;
   const stem=key.slice(0,-7),sd=descriptors.get(stem+'.weight_scale'),qd=descriptors.get(stem+'.comfy_quant');
   if(sd?.dtype!=='F32'||!equalShape(sd.shape,[])||sd.byteLength!==4||qd?.dtype!=='U8'||!equalShape(qd.shape,[27])||qd.byteLength!==27)throw Error('Own FP8 scalar scale/profile descriptor mismatch: '+key);
   const scaleRaw=await read(payload+sd.dataOffsets[0],4,'config'),configRaw=await read(payload+qd.dataOffsets[0],27,'config'),scale=new DataView(scaleRaw.buffer).getFloat32(0,true);
   if(!Number.isFinite(scale)||scale<=0||new TextDecoder('utf8',{fatal:true}).decode(configRaw)!=='{"format": "float8_e4m3fn"}')throw Error('Own FP8 scalar scale/profile mismatch: '+key);
   scales.set(key,scale);
   Object.assign(entries[key],{fp8ProfileId:'scaled-e4m3fn-scalar-f32-v1',scaleSHA256:await sha(scaleRaw),quantConfigSHA256:await sha(configRaw),scaleSource:{originalKey:sd.name,fullShape:[],storageDtype:'F32',absoluteByteOffset:payload+sd.dataOffsets[0],byteLength:4},quantConfigSource:{originalKey:qd.name,fullShape:[27],storageDtype:'U8',absoluteByteOffset:payload+qd.dataOffsets[0],byteLength:27}});live();
  }
  if(bridgeBytes===undefined){const r=await fetch(new URL('../kernel/bridge.wasm',import.meta.url));if(!r.ok)throw Error('P4 Hike bridge unavailable');bridgeBytes=ownedBytes(await r.arrayBuffer());live();}
  bridge=await createProjectionBridge(bridgeBytes);live();
  const identity={schemaVersion:'bernini-p4-original-weights/0.1',executionProfileId:'bernini-block0-n2-cross-ffn-f32-candidate-v1',side,modelHash:BASE_MODEL_HASHES[side],headerSHA256:inspected.headerSHA256,fileBytes:inspected.fileBytes,graphHash:await sha(createDynamicLinearGraph()),bridgeWasmSHA256:BRIDGE_WASM_SHA256,
   precisionProfile:'per-entry original F16 or scalar-scaled E4M3FN decoded by Hike to F32; ORT F32 Gemm and separate Hike F32 parameters; original production precision unverified',fullFileSHA256Verified:false,fullFileHashRecomputed:false,modelHashRole:'expected-original-full-hash-not-current-reauthentication',packageHash:null,entries};live();
  const operation=async(key,start,count,rowMode,options)=>{
   live();if(busy)throw Error('P4 weight source busy');busy=true;
   try{
    const {signal,diagnostics=true}=options??{};if(typeof diagnostics!=='boolean')throw TypeError('Explicit diagnostics boolean required');live(signal);const e=entries[key];if(!e)throw RangeError('Unregistered original key');if(Boolean(e.columns)!==rowMode)throw RangeError('Original key binding kind mismatch');
    const [lower,upper]=rowMode?e.allowedRows:e.allowedElements;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(count)||start<lower||count<1||start>upper-count||(rowMode&&count>e.maxRows))throw RangeError('Original selected key range');
    const n=count*(rowMode?e.columns:1);if(n>81920)throw RangeError('Decode block range');const width=e.storageDtype==='F16'?2:1,offset=e.absoluteByteOffset+start*(rowMode?e.columns:1)*width,raw=await read(offset,n*width,'payload',signal);
    let values;if(e.storageDtype==='F8_E4M3')values=bridge.dequant(raw,scales.get(key));else{const bits=new Uint16Array(n),view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);for(let i=0;i<n;i++)bits[i]=view.getUint16(i*2,true);values=bridge.decodeF16(bits);}live(signal);
    let hashes={};if(diagnostics){const [rawSHA256,decodedF32SHA256]=await Promise.all([sha(raw),sha(values)]);hashes={rawSHA256,decodedF32SHA256};}live(signal);
    return {values,raw,shape:rowMode?[count,e.columns]:[count],source:{...copy(e),rowStart:rowMode?start:null,rowCount:rowMode?count:null,elementOffset:rowMode?null:start,elementCount:n,absoluteByteOffset:offset,selectedByteLength:raw.length,...hashes}};
   }finally{busy=false;}
  };
  return Object.freeze({
   describe(){live();return copy(identity);},readRows(key,start,count=16,options){return operation(key,start,count,true,options);},readVector(key,start,count,options){return operation(key,start,count,false,options);},
   addBias(values,bias,rows,columns){live();if(busy)throw Error('P4 weight source busy');busy=true;try{if(!Number.isInteger(rows)||rows<1||rows>16||!Number.isInteger(columns)||columns<1||columns>16)throw RangeError('Bounded bias range');const x=compact(values,rows*columns),b=compact(bias,columns),out=new Float32Array(x.length);for(let row=0;row<rows;row++)out.set(bridge.addBias(x.subarray(row*columns,(row+1)*columns),b),row*columns);return out;}finally{busy=false;}},
   stats(){return {disposed,busy,reads,readBytes,headerReads,headerReadBytes,configReads,configReadBytes,payloadReads,payloadReadBytes,maxPayloadReadBytes,hike:bridge?.stats()??null,fullFileHashRecomputed:false};},
   dispose(){if(busy)throw Error('Await P4 weight source operation before disposal');if(disposed)return;disposed=true;original=null;scales.clear();bridge?.dispose();bridge=null;}
  });
 }catch(error){disposed=true;original=null;bridge?.dispose();throw error;}
}

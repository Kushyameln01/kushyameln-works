import {inspectSafetensors} from '../api/safetensors.mjs';
import {TARGET_PROVENANCE} from '../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';
import {createProjectionBridge} from '../ort-bridge/hike.mjs';
import {BRIDGE_WASM_SHA256} from '../ort-bridge/kernel/registry.mjs';
import {createModelLookupDecoder,MODEL_DECODE_NUMERIC_PROFILE,MODEL_DECODE_IMPLEMENTATION_PROFILE} from './model-decode.mjs';

export const MODEL_WEIGHT_SCHEMA='bernini-full-model-original-weights/0.1';
export const MODEL_WEIGHT_PROFILE='bernini-40-block-prefix-head-f32-v1';
export const MODEL_WEIGHT_LIMITS=Object.freeze({maxBlockElements:81920,maxPayloadReadBytes:163840,maxRows:16});
const FP8_PROFILE='scaled-e4m3fn-scalar-f32-v1',QUANT_CONFIG='{"format": "float8_e4m3fn"}';
const copy=value=>structuredClone(value),abort=signal=>signal?.throwIfAborted();
const sameShape=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,i)=>value===b[i]);
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
const typed=Object.getPrototypeOf(Float32Array.prototype),slots=Object.fromEntries(['length','byteOffset','byteLength','buffer'].map(key=>[key,Object.getOwnPropertyDescriptor(typed,key).get]));
const tag=Object.getOwnPropertyDescriptor(typed,Symbol.toStringTag).get,bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
function ownedBytes(value){
 if(value instanceof ArrayBuffer)return new Uint8Array(value).slice();
 if(ArrayBuffer.isView(value)&&tag.call(value)==='Uint8Array'&&slots.buffer.call(value) instanceof ArrayBuffer)return new Uint8Array(value);
 throw TypeError('Nonshared bridge bytes required');
}
function ownedF32(value,count){
 if(!ArrayBuffer.isView(value)||tag.call(value)!=='Float32Array')throw TypeError('Compact owned finite F32 required');
 const buffer=slots.buffer.call(value);
 if(!(buffer instanceof ArrayBuffer)||slots.length.call(value)!==count||slots.byteOffset.call(value)!==0||slots.byteLength.call(value)!==bufferLength.call(buffer))throw TypeError('Compact owned finite F32 required');
 const out=new Float32Array(value);if(!out.every(Number.isFinite))throw TypeError('Compact owned finite F32 required');return out;
}
function operatorBinding(key,rowMode){
 const block=/^blocks\.(\d+)\./.exec(key),blockIndex=block?Number(block[1]):null;
 if(rowMode)return {programSlot:key,graphInput:'weight',operator:key.slice(0,-7),blockIndex,kind:key==='patch_embedding.weight'?'conv3d-im2col':'linear'};
 if(/\.norm[13]\.(weight|bias)$/.test(key))return {programSlot:key,hikeExport:'Norm',hikeParameter:key.endsWith('.bias')?'bias':'weight',operator:key.replace(/\.(weight|bias)$/,''),blockIndex,kind:'affine-layernorm'};
 if(/\.norm_[qk]\.weight$/.test(key))return {programSlot:key,hikeExport:'Norm',hikeParameter:'weight',operator:key.slice(0,-7),blockIndex,kind:'rmsnorm'};
 if(key.endsWith('.modulation'))return {programSlot:key,hikeExport:'Add',hikeParameter:'x',operator:key,blockIndex,kind:'modulation',chunks:key==='head.modulation'?2:6};
 if(key.endsWith('.bias'))return {programSlot:key,hikeExport:'AddBias',hikeParameter:'bias',operator:key.slice(0,-5),blockIndex,kind:'linear-bias'};
 throw Error('Unrecognized original parameter binding: '+key);
}
function selected(entries,key,start,count,rowMode){
 if(!Object.hasOwn(entries,key))throw RangeError('Unregistered original key');const entry=entries[key];
 if(Boolean(entry.columns)!==rowMode)throw RangeError('Original key binding kind mismatch');
 const limit=rowMode?entry.fullShape[0]:entry.elementCount;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(count)||start<0||count<1||start>limit-count||(rowMode&&count>entry.maxRows))throw RangeError('Original selected key range');
 const elements=count*(rowMode?entry.columns:1);if(elements>MODEL_WEIGHT_LIMITS.maxBlockElements)throw RangeError('Decode block range');
 return {entry,elements,elementOffset:start*(rowMode?entry.columns:1)};
}

/** Header/size identified immutable originals. No payload sample or full-file hash admission. */
export async function createModelWeightSource({file,side,bridgeBytes,decoder='legacy',lookupBytes,signal}={}){
 if(!(file instanceof Blob)||typeof side!=='string'||!Object.hasOwn(BASE_MODEL_HASHES,side))throw TypeError('Original immutable Blob and explicit HIGH/LOW side required');
 if(!['legacy','lookup'].includes(decoder)||(lookupBytes!==undefined&&decoder!=='lookup'))throw TypeError('Explicit legacy or lookup decoder selection required');
 abort(signal);if(bridgeBytes!==undefined)bridgeBytes=ownedBytes(bridgeBytes);if(lookupBytes!==undefined)lookupBytes=ownedBytes(lookupBytes);
 let original=file,bridge=null,lookup=null,busy=false,disposed=false,headerReads=0,headerReadBytes=0,configReads=0,configReadBytes=0,payloadReads=0,payloadReadBytes=0,maxPayloadReadBytes=0,decodedF32Bytes=0;
 const live=s=>{if(disposed)throw Error('Model weight source disposed');abort(signal);abort(s);};
 const read=async(offset,count,kind,s)=>{
  live(s);if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||offset<0||count<1||count>MODEL_WEIGHT_LIMITS.maxPayloadReadBytes||offset>original.size-count)throw RangeError('Bounded original read range');
  const raw=new Uint8Array(await original.slice(offset,offset+count).arrayBuffer());live(s);if(raw.length!==count)throw Error('Original range length mismatch');
  if(kind==='config'){configReads++;configReadBytes+=count;}else{payloadReads++;payloadReadBytes+=count;maxPayloadReadBytes=Math.max(maxPayloadReadBytes,count);}return raw;
 };
 try{
  const inspected=await inspectSafetensors(original,{rejectDuplicateKeys:true});live();const pinned=TARGET_PROVENANCE.models.find(model=>model.name.includes(side));
  if(inspected.fileBytes!==pinned.fileBytes||inspected.headerSHA256!==pinned.headerSHA256)throw Error('Original base side/header/size mismatch');
  headerReads=2;headerReadBytes=8+inspected.headerBytes;
  const descriptors=new Map(inspected.tensors.map(tensor=>[tensor.name,tensor])),payload=8+inspected.headerBytes,entries=Object.create(null),scales=new Map();
  // The authenticated header supplies keys, shapes, offsets and storage types.
  // Quantization metadata is a decode configuration, never a patchable weight.
  for(const descriptor of inspected.tensors){
   if(!['F16','F8_E4M3'].includes(descriptor.dtype))continue;
   const key=descriptor.name,fullShape=[...descriptor.shape],rowMode=key.endsWith('.weight')&&fullShape.length>=2;
   const columns=rowMode?fullShape.slice(1).reduce((a,b)=>a*b,1):null,width=descriptor.dtype==='F16'?2:1;
   if(fullShape.length===0||fullShape.some(value=>value<1)||(rowMode&&columns>MODEL_WEIGHT_LIMITS.maxBlockElements))throw Error('Original target shape exceeds supported row contract: '+key);
   entries[key]={originalKey:key,key:'diffusion_model.'+key,weightId:key,fullShape,storageDtype:descriptor.dtype,computeDtype:'F32',layout:'row-major',columns,elementCount:descriptor.byteLength/width,absoluteByteOffset:payload+descriptor.dataOffsets[0],byteLength:descriptor.byteLength,
    binding:{kind:rowMode?'runtime-input':'hike-parameter',name:key},operatorBinding:operatorBinding(key,rowMode),
    transform:key==='patch_embedding.weight'?{kind:'conv3d-im2col-C-kT-kH-kW',transpose:false,storageShape:fullShape,linearShape:[fullShape[0],columns]}:{kind:'identity',transpose:false},
    fp8ProfileId:null,scale:null,scaleSource:null,quantConfigSource:null,
    ...(rowMode?{allowedRows:[0,fullShape[0]],maxRows:Math.min(MODEL_WEIGHT_LIMITS.maxRows,Math.floor(MODEL_WEIGHT_LIMITS.maxBlockElements/columns))}:{allowedElements:[0,descriptor.byteLength/width],maxElements:MODEL_WEIGHT_LIMITS.maxBlockElements})};
   if(descriptor.dtype!=='F8_E4M3')continue;
   const stem=key.slice(0,-7),sd=descriptors.get(stem+'.weight_scale'),qd=descriptors.get(stem+'.comfy_quant');
   if(!key.endsWith('.weight')||sd?.dtype!=='F32'||!sameShape(sd.shape,[])||sd.byteLength!==4||qd?.dtype!=='U8'||!sameShape(qd.shape,[27])||qd.byteLength!==27)throw Error('Own FP8 scalar scale/profile descriptor mismatch: '+key);
   const scaleRaw=await read(payload+sd.dataOffsets[0],4,'config'),quantRaw=await read(payload+qd.dataOffsets[0],27,'config'),scale=new DataView(scaleRaw.buffer).getFloat32(0,true);
   if(!Number.isFinite(scale)||scale<=0||new TextDecoder('utf8',{fatal:true}).decode(quantRaw)!==QUANT_CONFIG)throw Error('Own FP8 scalar scale/profile mismatch: '+key);
   scales.set(key,scale);Object.assign(entries[key],{fp8ProfileId:FP8_PROFILE,scale,
    scaleSource:{originalKey:sd.name,fullShape:[],storageDtype:'F32',absoluteByteOffset:payload+sd.dataOffsets[0],byteLength:4},
    quantConfigSource:{originalKey:qd.name,fullShape:[27],storageDtype:'U8',absoluteByteOffset:payload+qd.dataOffsets[0],byteLength:27}});
  }
  if(Object.keys(entries).length!==TARGET_PROVENANCE.allTensorTargets)throw Error('Incomplete original model target registry');
  if(bridgeBytes===undefined){const response=await fetch(new URL('../ort-bridge/kernel/bridge.wasm',import.meta.url));if(!response.ok)throw Error('Model Hike projection bridge unavailable');bridgeBytes=ownedBytes(await response.arrayBuffer());live();}
  bridge=await createProjectionBridge(bridgeBytes);live();
  if(decoder==='lookup'){lookup=await createModelLookupDecoder({oracle:bridge,lookupBytes,scales,signal});live();}
  const parameterFreeNormalization=[...Array.from({length:40},(_,blockIndex)=>[1,2].map(norm=>({operator:`blocks.${blockIndex}.norm${norm}`,kind:'layernorm',elementwiseAffine:false,epsilon:1e-6,parameterKeys:[]}))).flat(),{operator:'head.norm',kind:'layernorm',elementwiseAffine:false,epsilon:1e-6,parameterKeys:[]}];
  const identity={schemaVersion:MODEL_WEIGHT_SCHEMA,executionProfileId:MODEL_WEIGHT_PROFILE,side,modelHash:BASE_MODEL_HASHES[side],headerSHA256:inspected.headerSHA256,fileBytes:inspected.fileBytes,bridgeWasmSHA256:BRIDGE_WASM_SHA256,pinnedCoreCommit:TARGET_PROVENANCE.pinnedComfyCommit,
   decoder:{selection:decoder,numericProfileId:MODEL_DECODE_NUMERIC_PROFILE,implementationProfileId:decoder==='lookup'?MODEL_DECODE_IMPLEMENTATION_PROFILE:'legacy-hike-direct-decoder-v1',...(lookup?lookup.describe():{})},
   targetCount:Object.keys(entries).length,blockCount:40,entries,parameterFreeNormalization,resourceLimits:{...MODEL_WEIGHT_LIMITS},
   coverage:{fullModelTargets:true,blocks:[0,39],prefix:true,head:true,quantizationMetadataIsWeightTarget:false,canonicalLoraAdapterExtension:'PENDING'},
   precisionProfile:'Original F16 or per-target scalar-scaled E4M3FN decoded by Hike to owned F32; production precision parity unverified',
   fullFileSHA256Verified:false,fullFileHashRecomputed:false,modelHashRole:'expected-original-full-hash-not-current-reauthentication',payloadSampleAdmission:false,packageHash:null,generationReady:false};
  const operation=async(key,start,count,rowMode,options)=>{
   live();if(busy)throw Error('Model weight source busy');busy=true;
   try{
    const {signal:s,diagnostics=false}=options??{};if(typeof diagnostics!=='boolean')throw TypeError('Explicit diagnostics boolean required');live(s);
    const {entry,elements,elementOffset}=selected(entries,key,start,count,rowMode),width=entry.storageDtype==='F16'?2:1,offset=entry.absoluteByteOffset+elementOffset*width,raw=await read(offset,elements*width,'payload',s);
    let values;if(lookup)values=entry.storageDtype==='F8_E4M3'?lookup.dequant(raw,key):lookup.decodeF16(raw);else if(entry.storageDtype==='F8_E4M3')values=bridge.dequant(raw,scales.get(key));else{const bits=new Uint16Array(elements),view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);for(let i=0;i<elements;i++)bits[i]=view.getUint16(i*2,true);values=bridge.decodeF16(bits);}live(s);decodedF32Bytes+=values.byteLength;
    let hashes={};if(diagnostics){const [rawSHA256,decodedF32SHA256]=await Promise.all([sha(raw),sha(values)]);hashes={rawSHA256,decodedF32SHA256};}live(s);
    return {values,raw,shape:rowMode?[count,entry.columns]:[count],source:{...copy(entry),rowStart:rowMode?start:null,rowCount:rowMode?count:null,elementOffset,selectedElementCount:elements,selectedByteLength:raw.length,absoluteByteOffset:offset,...hashes}};
   }finally{busy=false;}
  };
  return Object.freeze({
   describe(){live();return copy(identity);},readRows(key,start,count=16,options){return operation(key,start,count,true,options);},readVector(key,start,count,options){return operation(key,start,count,false,options);},
   addBias(values,bias,rows,columns){
    live();if(busy)throw Error('Model weight source busy');busy=true;
    try{if(!Number.isInteger(rows)||rows<1||rows>16||!Number.isInteger(columns)||columns<1||columns>16)throw RangeError('Bounded bias shape');const x=ownedF32(values,rows*columns),b=ownedF32(bias,columns),out=new Float32Array(x.length);for(let row=0;row<rows;row++)out.set(bridge.addBias(x.subarray(row*columns,(row+1)*columns),b),row*columns);return out;}finally{busy=false;}
   },
   stats(){return {disposed,busy,reads:headerReads+configReads+payloadReads,readBytes:headerReadBytes+configReadBytes+payloadReadBytes,headerReads,headerReadBytes,configReads,configReadBytes,payloadReads,payloadReadBytes,maxPayloadReadBytes,decodedF32Bytes,hike:bridge?.stats()??null,decoder:lookup?.stats()??null,decoderSelection:decoder,fullFileHashRecomputed:false,payloadSampleAdmission:false};},
   dispose(){if(busy)throw Error('Await model weight source operation before disposal');if(disposed)return;disposed=true;original=null;scales.clear();lookup?.dispose();lookup=null;bridge?.dispose();bridge=null;}
  });
 }catch(error){disposed=true;original=null;lookup?.dispose();bridge?.dispose();throw error;}
}
export const createFullModelWeightSource=createModelWeightSource;

/** Final-F32 port. Completion arithmetic and adapter mapping belong to its caller. */
export function createCompletedModelWeightSource({source,completedProvider}={}){
 if(!['describe','readRows','readVector','stats'].every(key=>typeof source?.[key]==='function')||typeof completedProvider?.readBlock!=='function')throw TypeError('Original model source and completed F32 provider required');
 const original=source.describe();if(original.schemaVersion!==MODEL_WEIGHT_SCHEMA||original.executionProfileId!==MODEL_WEIGHT_PROFILE)throw TypeError('Identified full-model source required');
 const providerRead=completedProvider.readBlock.bind(completedProvider);let disposed=false,busy=false,completionReads=0,completedF32Bytes=0,basePassThroughReads=0;
 const live=signal=>{if(disposed)throw Error('Completed model weight source disposed');abort(signal);};
 const operation=async(key,start,count,rowMode,options)=>{
  live();if(busy)throw Error('Completed model weight source busy');busy=true;
  try{
   const {signal,diagnostics=false}=options??{};if(typeof diagnostics!=='boolean')throw TypeError('Explicit diagnostics boolean required');live(signal);
   const {entry,elements,elementOffset}=selected(original.entries,key,start,count,rowMode),base=await source[rowMode?'readRows':'readVector'](key,start,count,{signal,diagnostics});live(signal);
   const result=await providerRead({originalKey:key,weightId:key,entry:copy(entry),offset:elementOffset,count:elements,fullShape:[...entry.fullShape],binding:copy(entry.binding),dtype:'F32',baseValues:ownedF32(base.values,elements),signal});live(signal);completionReads++;
   const values=result===null||result===undefined?ownedF32(base.values,elements):ownedF32(result,elements),kind=result===null||result===undefined?'immutable-base-pass-through':'completed-final-f32';
   if(kind==='completed-final-f32')completedF32Bytes+=values.byteLength;else basePassThroughReads++;
   const metadata={...copy(base.source),completedWeight:{kind,arithmetic:'external',canonicalLoraAdapterExtension:'PENDING'}};
   // A base-storage hash continues to describe storage; an effective F32 hash
   // is generated only when the caller explicitly requests diagnostics.
   if(diagnostics){metadata.decodedF32SHA256=await sha(values);metadata.rawHashMeaning='immutable-original-storage-only';}live(signal);
   return {...base,values,source:metadata};
  }finally{busy=false;}
 };
 return Object.freeze({describe(){live();return {...copy(original),completedWeightPort:{dtype:'F32',coordinates:'full-original-elements',arithmetic:'external',canonicalLoraAdapterExtension:'PENDING'}};},
  readRows(key,start,count=16,options){return operation(key,start,count,true,options);},readVector(key,start,count,options){return operation(key,start,count,false,options);},
  addBias(...args){live();if(busy)throw Error('Completed model weight source busy');return source.addBias(...args);},
  stats(){return {disposed,busy,completionReads,completedF32Bytes,basePassThroughReads,source:source.stats()};},
  dispose(){if(busy)throw Error('Await completed model weight operation before disposal');disposed=true;}
 });
}

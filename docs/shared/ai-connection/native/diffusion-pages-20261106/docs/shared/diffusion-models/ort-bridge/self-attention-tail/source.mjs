import {inspectSafetensors} from '../../api/safetensors.mjs';
import {TARGET_PROVENANCE} from '../../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../../lora/weights.mjs';
import {createProjectionBridge} from '../hike.mjs';
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const copy=x=>structuredClone(x),abort=s=>s?.throwIfAborted(),shape=(a,b)=>a.length===b.length&&b.every((v,i)=>a[i]===v);
const KEYS={
 'blocks.0.self_attn.o.weight':{dtype:'F8_E4M3',fullShape:[5120,5120],columns:5120,allowedRows:[0,5120]},
 'blocks.0.self_attn.o.bias':{dtype:'F16',fullShape:[5120],allowedElements:[0,5120]},
 'time_projection.1.weight':{dtype:'F16',fullShape:[30720,5120],columns:5120,allowedRows:[10240,15360]},
 'time_projection.1.bias':{dtype:'F16',fullShape:[30720],allowedElements:[10240,15360]},
 'blocks.0.modulation':{dtype:'F16',fullShape:[1,6,5120],allowedElements:[10240,15360]}
};
function ownedBytes(v){if(v instanceof ArrayBuffer)return new Uint8Array(v).slice();if(v instanceof Uint8Array&&v.buffer instanceof ArrayBuffer)return new Uint8Array(v);throw TypeError('Nonshared bridge bytes required');}
export async function createTailWeightSource({file,side,bridgeBytes}={}){
 if(!(file instanceof Blob)||!['HIGH','LOW'].includes(side))throw TypeError('Original immutable Blob and explicit side required');
 if(bridgeBytes!==undefined)bridgeBytes=ownedBytes(bridgeBytes);
 let original=file,bridge=null,busy=false,disposed=false,reads=0,readBytes=0,headerReads=0,headerReadBytes=0,configReads=0,configReadBytes=0,payloadReads=0,payloadReadBytes=0,maxPayloadReadBytes=0;
 const live=s=>{if(disposed)throw Error('Tail weight source disposed');abort(s);};
 const read=async(offset,count,kind,s)=>{live(s);if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||offset<0||count<1||count>163840||offset>original.size-count)throw RangeError('Bounded original read range');const raw=new Uint8Array(await original.slice(offset,offset+count).arrayBuffer());live(s);if(raw.length!==count)throw Error('Original range length mismatch');reads++;readBytes+=count;if(kind==='config'){configReads++;configReadBytes+=count;}else{payloadReads++;payloadReadBytes+=count;maxPayloadReadBytes=Math.max(maxPayloadReadBytes,count);}return raw;};
 try{
  const checked=await inspectSafetensors(file,{rejectDuplicateKeys:true});live();const pinned=TARGET_PROVENANCE.models.find(m=>m.name.includes(side));
  if(checked.fileBytes!==pinned.fileBytes||checked.headerSHA256!==pinned.headerSHA256)throw Error('Original base side/header/size mismatch');
  headerReads=2;headerReadBytes=8+checked.headerBytes;reads=headerReads;readBytes=headerReadBytes;
  const descriptors=new Map(checked.tensors.map(t=>[t.name,t])),payload=8+checked.headerBytes,entries={};
  for(const [key,spec] of Object.entries(KEYS)){
   const d=descriptors.get(key);if(!d||d.dtype!==spec.dtype||!shape(d.shape,spec.fullShape))throw Error('Original key/full shape/dtype mismatch: '+key);
   entries[key]={originalKey:key,fullShape:[...spec.fullShape],storageDtype:spec.dtype,computeDtype:'F32',columns:spec.columns??null,elementCount:d.byteLength/(spec.dtype==='F16'?2:1),absoluteByteOffset:payload+d.dataOffsets[0],byteLength:d.byteLength,binding:spec.columns?'runtime-input':'hike-parameter',transform:'identity-row-major',...(spec.allowedRows?{allowedRows:[...spec.allowedRows]}:{allowedElements:[...spec.allowedElements]})};
  }
  const key='blocks.0.self_attn.o.weight',prefix='blocks.0.self_attn.o',sd=descriptors.get(prefix+'.weight_scale'),cd=descriptors.get(prefix+'.comfy_quant');
  if(sd?.dtype!=='F32'||!shape(sd.shape,[])||sd.byteLength!==4||cd?.dtype!=='U8'||!shape(cd.shape,[27])||cd.byteLength!==27)throw Error('O own FP8 scalar scale/profile binding mismatch');
  const sr=await read(payload+sd.dataOffsets[0],4,'config'),cr=await read(payload+cd.dataOffsets[0],27,'config'),scale=new DataView(sr.buffer).getFloat32(0,true);
  if(!Number.isFinite(scale)||scale<=0||new TextDecoder().decode(cr)!=='{"format": "float8_e4m3fn"}')throw Error('O own FP8 scalar scale/profile mismatch');
  Object.assign(entries[key],{scale,scaleSHA256:await sha(sr),quantConfigSHA256:await sha(cr),scaleSource:{originalKey:prefix+'.weight_scale',fullShape:[],storageDtype:'F32',absoluteByteOffset:payload+sd.dataOffsets[0],byteLength:4},quantConfigSource:{originalKey:prefix+'.comfy_quant',fullShape:[27],storageDtype:'U8',absoluteByteOffset:payload+cd.dataOffsets[0],byteLength:27},fp8ProfileId:'scaled-e4m3fn-scalar-f32-v1'});live();
  if(bridgeBytes===undefined){const r=await fetch(new URL('../kernel/bridge.wasm',import.meta.url));if(!r.ok)throw Error('Hike projection bridge unavailable');bridgeBytes=new Uint8Array(await r.arrayBuffer());live();}
  bridge=await createProjectionBridge(bridgeBytes);live();
  const identity={side,modelHash:BASE_MODEL_HASHES[side],headerSHA256:checked.headerSHA256,fileBytes:checked.fileBytes,fullFileSHA256Verified:false,fullFileHashRecomputed:false,modelHashRole:'expected-original-full-hash-prior-owner-receipt-not-current-reauthentication',entries:copy(entries)};
  const operation=async(key,start,count,rowMode,options)=>{
   live();if(busy)throw Error('Tail weight source busy');busy=true;
   try{const {signal}=options??{};live(signal);if(!Object.hasOwn(entries,key))throw RangeError('Unregistered original key');const e=entries[key],columns=e.columns,width=e.storageDtype==='F16'?2:1;
    if(rowMode?!columns:columns)throw RangeError('Registered key binding kind mismatch');const [lower,upper]=rowMode?e.allowedRows:e.allowedElements;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(count)||start<lower||count<1||start>upper-count||(rowMode?count>16:count>5120))throw RangeError('Original selected key range');
    const n=count*(rowMode?columns:1);if(n>81920)throw RangeError('Decode block range');const offset=e.absoluteByteOffset+start*(rowMode?columns:1)*width,raw=await read(offset,n*width,'payload',signal);
    let values;if(e.storageDtype==='F8_E4M3')values=bridge.dequant(raw,e.scale);else{const u=new Uint16Array(raw.length/2),d=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);for(let i=0;i<u.length;i++)u[i]=d.getUint16(i*2,true);values=bridge.decodeF16(u);}live(signal);
    const [rawSHA256,decodedF32SHA256]=await Promise.all([sha(raw),sha(values)]);live(signal);
    return {values,raw,shape:rowMode?[count,columns]:[count],source:{...copy(e),rowStart:rowMode?start:null,rowCount:rowMode?count:null,elementOffset:rowMode?null:start,elementCount:n,absoluteByteOffset:offset,selectedByteLength:raw.length,rawSHA256,decodedF32SHA256}};
   }finally{busy=false;}
  };
  return Object.freeze({describe(){live();return copy(identity);},readRows(key,start,count=16,options){return operation(key,start,count,true,options);},readVector(key,start,count,options){return operation(key,start,count,false,options);},
   addBias(values,bias,rows,columns){live();if(busy)throw Error('Tail weight source busy');busy=true;try{if(!Number.isInteger(rows)||rows<1||rows>2||!Number.isInteger(columns)||columns<1||columns>16||!(values instanceof Float32Array)||values.length!==rows*columns||!(bias instanceof Float32Array)||bias.length!==columns||!(values.buffer instanceof ArrayBuffer)||!(bias.buffer instanceof ArrayBuffer)||values.byteOffset!==0||values.byteLength!==values.buffer.byteLength||bias.byteOffset!==0||bias.byteLength!==bias.buffer.byteLength||!values.every(Number.isFinite)||!bias.every(Number.isFinite))throw TypeError('Finite exact compact bias shape required');const out=new Float32Array(values.length);for(let row=0;row<rows;row++)out.set(bridge.addBias(values.subarray(row*columns,(row+1)*columns),bias),row*columns);return out;}finally{busy=false;}},
   stats(){return {disposed,busy,reads,readBytes,headerReads,headerReadBytes,configReads,configReadBytes,payloadReads,payloadReadBytes,maxPayloadReadBytes,maxReadBytes:Math.max(checked.headerBytes,maxPayloadReadBytes),hike:bridge?.stats()??null,fullFileHashRecomputed:false};},dispose(){if(busy)throw Error('Await tail weight source operation before disposal');disposed=true;original=null;bridge?.dispose();bridge=null;}
  });
 }catch(e){disposed=true;original=null;bridge?.dispose();throw e;}
}

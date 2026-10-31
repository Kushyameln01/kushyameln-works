import {inspectSafetensors} from '../../api/safetensors.mjs';
import {TARGET_PROVENANCE} from '../../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../../lora/weights.mjs';
import {createProjectionBridge} from '../hike.mjs';
import {Sha256} from '../../../vr180/sha256.mjs';
const copy=v=>structuredClone(v),sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const exactShape=(a,b)=>Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>Object.hasOwn(a,i)&&a[i]===v);
const abort=s=>s?.throwIfAborted();
export async function createQkvBase({file,side,hikeBytes,signal}={}){
 if(!(file instanceof Blob)||!['LOW','HIGH'].includes(side))throw TypeError('Original immutable Blob and explicit side required');
 // Capture external binary views before inspect/hash awaits.
 if(hikeBytes!==undefined){if(hikeBytes instanceof ArrayBuffer)hikeBytes=new Uint8Array(hikeBytes).slice();else if(hikeBytes instanceof Uint8Array&&hikeBytes.buffer instanceof ArrayBuffer)hikeBytes=new Uint8Array(hikeBytes);else throw TypeError('Owned nonshared Hike bytes required');}
 let original=file,bridge=null,disposed=false,busy=false,readBytes=0,reads=0,maxReadBytes=0;
 const guard=s=>{if(disposed)throw Error('QKV base disposed');abort(signal);abort(s);};
 const read=async(offset,count,s)=>{guard(s);if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||offset<0||count<1||offset>original.size-count||count>181280)throw RangeError('Bounded original read range');const raw=new Uint8Array(await original.slice(offset,offset+count).arrayBuffer());guard(s);if(raw.length!==count)throw Error('Original range length mismatch');reads++;readBytes+=count;maxReadBytes=Math.max(maxReadBytes,count);return raw;};
 try{
  const checked=await inspectSafetensors(original,{rejectDuplicateKeys:true});guard();const pinned=TARGET_PROVENANCE.models.find(m=>m.name.includes(side));
  if(checked.fileBytes!==pinned.fileBytes||checked.headerSHA256!==pinned.headerSHA256)throw Error('Original base side/header/size mismatch');
  const desc=new Map(checked.tensors.map(t=>[t.name,t])),payload=8+checked.headerBytes;
  const target=(name,dtype,shape)=>{const d=desc.get(name);if(!d||d.dtype!==dtype||!exactShape(d.shape,shape))throw Error('Actual QKV tensor shape/dtype mismatch: '+name);return d;};
  const weights={},biases={},norms={},metadata=[];
  if(hikeBytes===undefined){const r=await fetch(new URL('../kernel/bridge.wasm',import.meta.url));if(!r.ok)throw Error('Projection bridge unavailable');hikeBytes=await r.arrayBuffer();guard();}
  bridge=await createProjectionBridge(hikeBytes);guard();
  const half=async d=>{const raw=await read(payload+d.dataOffsets[0],d.byteLength);const bits=new Uint16Array(raw.length/2),v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);for(let i=0;i<bits.length;i++)bits[i]=v.getUint16(i*2,true);const out=bridge.decodeF16(bits);metadata.push({key:d.name,storageDtype:d.dtype,shape:[...d.shape],absoluteByteOffset:payload+d.dataOffsets[0],byteLength:raw.length,sourceSHA256:await sha(raw),decodedSHA256:await sha(out)});guard();return out;};
  for(const kind of ['q','k','v']){
   const prefix='blocks.0.self_attn.'+kind,w=target(prefix+'.weight','F8_E4M3',[5120,5120]),b=target(prefix+'.bias','F16',[5120]);
   const scale=desc.get(prefix+'.weight_scale'),config=target(prefix+'.comfy_quant','U8',[27]);
   if(scale?.dtype!=='F32'||scale.byteLength!==4||!exactShape(scale.shape,[]))throw Error('Per-tensor scalar F32 scale required');
   const sr=await read(payload+scale.dataOffsets[0],4),cr=await read(payload+config.dataOffsets[0],27),s=new DataView(sr.buffer,sr.byteOffset,4).getFloat32(0,true);
   if(!Number.isFinite(s)||s<=0||new TextDecoder('utf8',{fatal:true}).decode(cr)!=='{"format": "float8_e4m3fn"}')throw Error('Actual scaled E4M3FN profile mismatch');
   weights[kind]={key:w.name,absoluteByteOffset:payload+w.dataOffsets[0],byteLength:w.byteLength,shape:[...w.shape],storageDtype:w.dtype,scale:s,scaleSHA256:await sha(sr),quantConfigSHA256:await sha(cr)};guard();biases[kind]=await half(b);
  }
  for(const kind of ['q','k'])norms[kind]=await half(target('blocks.0.self_attn.norm_'+kind+'.weight','F16',[5120]));
  const identity={side,modelHash:BASE_MODEL_HASHES[side],headerSHA256:pinned.headerSHA256,fileBytes:pinned.fileBytes,fullFileSHA256Verified:false,fullFileHashRecomputed:false,modelHashRole:'expected-original-full-hash-prior-owner-receipt-not-current-reauthentication',fp8ProfileId:'scaled-e4m3fn-scalar-f32-v1',computeDtype:'F32',weights:copy(weights),parameters:copy(metadata)};
  return Object.freeze({
   describe(){guard();return copy(identity);},
   async readWeightTile(kind,row,{signal:runSignal}={}){guard(runSignal);if(busy)throw Error('QKV base busy');if(!Object.hasOwn(weights,kind)||!Number.isInteger(row)||row<0||row>5104||row%16)throw RangeError('QKV full-column row tile range');busy=true;try{const raw=await read(weights[kind].absoluteByteOffset+row*5120,81920,runSignal);const values=bridge.dequant(raw,weights[kind].scale);guard(runSignal);return {values,raw,row,shape:[16,5120]};}finally{busy=false;}},
   bias(kind){guard();if(!Object.hasOwn(biases,kind))throw Error('Unknown bias');return biases[kind].slice();},
   norm(kind){guard();if(!Object.hasOwn(norms,kind))throw Error('Unknown QK norm');return norms[kind].slice();},
   addBias(values,bias){guard();if(!(values instanceof Float32Array)||values.length!==256||!(bias instanceof Float32Array)||bias.length!==16)throw Error('N16 row16 bias shape');const out=new Float32Array(256);for(let i=0;i<16;i++)out.set(bridge.addBias(values.subarray(i*16,i*16+16),bias),i*16);return out;},
   newWeightHash(){guard();return new Sha256();},
   stats(){return {disposed,busy,reads,readBytes,maxReadBytes,hike:bridge?.stats()??null,fullFileHashRecomputed:false};},
   dispose(){if(disposed)return;if(busy)throw Error('Await QKV base read before disposal');disposed=true;original=null;bridge?.dispose();bridge=null;for(const k of Object.keys(biases))biases[k]=null;for(const k of Object.keys(norms))norms[k]=null;}
  });
 }catch(error){disposed=true;original=null;bridge?.dispose();throw error;}
}

import {inspectSafetensors} from '../../api/safetensors.mjs';
import {TARGET_PROVENANCE} from '../../lora/targets.mjs';
import {BASE_MODEL_HASHES} from '../../lora/weights.mjs';
import {createProjectionBridge} from '../hike.mjs';
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const abort=s=>s?.throwIfAborted(),copy=x=>structuredClone(x),shape=(a,b)=>a.length===b.length&&b.every((x,i)=>a[i]===x);
const KEYS={
 'patch_embedding.weight':['F16',[5120,16,1,2,2],64], 'patch_embedding.bias':['F16',[5120]],
 'time_embedding.0.weight':['F16',[5120,256],256], 'time_embedding.0.bias':['F16',[5120]],
 'time_embedding.2.weight':['F16',[5120,5120],5120], 'time_embedding.2.bias':['F16',[5120]],
 'time_projection.1.weight':['F16',[30720,5120],5120], 'time_projection.1.bias':['F16',[30720]],
 'blocks.0.modulation':['F16',[1,6,5120]]
};
for(const k of ['q','k','v']){KEYS['blocks.0.self_attn.'+k+'.weight']=['F8_E4M3',[5120,5120],5120];KEYS['blocks.0.self_attn.'+k+'.bias']=['F16',[5120]];}
for(const k of ['q','k'])KEYS['blocks.0.self_attn.norm_'+k+'.weight']=['F16',[5120]];
function ownedBytes(b){if(b instanceof ArrayBuffer)return new Uint8Array(b).slice();if(b instanceof Uint8Array&&b.buffer instanceof ArrayBuffer)return new Uint8Array(b);throw TypeError('Nonshared bridge bytes required');}
export async function createWeightSource({file,side,bridgeBytes,signal}={}){
 if(!(file instanceof Blob)||!['HIGH','LOW'].includes(side))throw TypeError('Original immutable Blob and explicit side required');
 if(bridgeBytes!==undefined)bridgeBytes=ownedBytes(bridgeBytes);
 let original=file,bridge=null,busy=false,disposed=false,reads=0,readBytes=0,maxReadBytes=0;
 const live=s=>{if(disposed)throw Error('Weight source disposed');abort(signal);abort(s);};
 const read=async(offset,count,s)=>{live(s);if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||offset<0||count<1||count>181280||offset>original.size-count)throw RangeError('Bounded original read range');const b=new Uint8Array(await original.slice(offset,offset+count).arrayBuffer());live(s);if(b.length!==count)throw Error('Original range length mismatch');reads++;readBytes+=count;maxReadBytes=Math.max(maxReadBytes,count);return b;};
 try{
  const checked=await inspectSafetensors(file,{rejectDuplicateKeys:true});live();const pinned=TARGET_PROVENANCE.models.find(m=>m.name.includes(side));
  if(checked.fileBytes!==pinned.fileBytes||checked.headerSHA256!==pinned.headerSHA256)throw Error('Original base side/header/size mismatch');
  // Header reads are performed by the bounded parser, separately from payload reads.
  reads=2;readBytes=8+checked.headerBytes;maxReadBytes=checked.headerBytes;
  const descriptors=new Map(checked.tensors.map(d=>[d.name,d])),payload=8+checked.headerBytes,entries={};
  for(const [key,[dtype,fullShape,columns]] of Object.entries(KEYS)){
   const d=descriptors.get(key);if(!d||d.dtype!==dtype||!shape(d.shape,fullShape))throw Error('Original key/full shape/dtype mismatch: '+key);
   entries[key]={originalKey:key,fullShape:[...fullShape],storageDtype:dtype,computeDtype:'F32',columns:columns??null,elementCount:d.byteLength/(dtype==='F16'?2:1),absoluteByteOffset:payload+d.dataOffsets[0],byteLength:d.byteLength,binding:columns?'runtime-input':'hike-parameter',transform:columns===64?'conv3d-im2col-C-kT-kH-kW':'identity-row-major'};
  }
  if(bridgeBytes===undefined){const r=await fetch(new URL('../kernel/bridge.wasm',import.meta.url));if(!r.ok)throw Error('Hike projection bridge unavailable');bridgeBytes=new Uint8Array(await r.arrayBuffer());live();}
  bridge=await createProjectionBridge(bridgeBytes);live();
  for(const kind of ['q','k','v']){
   const key='blocks.0.self_attn.'+kind+'.weight',prefix=key.slice(0,-7),sd=descriptors.get(prefix+'.weight_scale'),cd=descriptors.get(prefix+'.comfy_quant');
   if(sd?.dtype!=='F32'||!shape(sd.shape,[])||sd.byteLength!==4||cd?.dtype!=='U8'||!shape(cd.shape,[27]))throw Error('FP8 scalar scale/profile binding mismatch');
   const sr=await read(payload+sd.dataOffsets[0],4),cr=await read(payload+cd.dataOffsets[0],27),scale=new DataView(sr.buffer).getFloat32(0,true);
   if(!Number.isFinite(scale)||scale<=0||new TextDecoder().decode(cr)!=='{"format": "float8_e4m3fn"}')throw Error('FP8 scalar scale/profile mismatch');
   Object.assign(entries[key],{scale,scaleSHA256:await sha(sr),quantConfigSHA256:await sha(cr),fp8ProfileId:'scaled-e4m3fn-scalar-f32-v1'});live();
  }
  const identity={side,modelHash:BASE_MODEL_HASHES[side],headerSHA256:checked.headerSHA256,fileBytes:checked.fileBytes,fullFileSHA256Verified:false,fullFileHashRecomputed:false,modelHashRole:'expected-original-full-hash-prior-owner-receipt-not-current-reauthentication',entries:copy(entries)};
  const keyEntry=key=>{if(!Object.hasOwn(entries,key))throw RangeError('Unregistered original key');return entries[key];};
  const decode=(raw,e)=>{if(e.storageDtype==='F8_E4M3')return bridge.dequant(raw,e.scale);const u=new Uint16Array(raw.length/2),d=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);for(let i=0;i<u.length;i++)u[i]=d.getUint16(i*2,true);return bridge.decodeF16(u);};
  const operation=async(key,start,count,rowMode,s)=>{live(s);if(busy)throw Error('Weight source busy');busy=true;try{const e=keyEntry(key),columns=e.columns,width=e.storageDtype==='F16'?2:1;if(rowMode?!columns:columns)throw RangeError('Registered key binding kind mismatch');const total=rowMode?e.fullShape[0]:e.elementCount;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(count)||start<0||count<1||start>total-count||(rowMode?count>16:count>10240))throw RangeError('Original key range');const n=count*(rowMode?columns:1);if(n>81920)throw RangeError('Decode block range');const offset=e.absoluteByteOffset+start*(rowMode?columns:1)*width,raw=await read(offset,n*width,s),values=decode(raw,e);live(s);const rawSHA256=await sha(raw),decodedF32SHA256=await sha(values);live(s);return {values,raw,shape:rowMode?[count,columns]:[count],source:{...copy(e),rowStart:rowMode?start:null,rowCount:rowMode?count:null,elementOffset:rowMode?null:start,elementCount:n,absoluteByteOffset:offset,selectedByteLength:raw.length,rawSHA256,decodedF32SHA256}};}finally{busy=false;}};
  return Object.freeze({describe(){live();return copy(identity);},readRows(key,start,count=16,{signal:s}={}){return operation(key,start,count,true,s);},readVector(key,start,count,{signal:s}={}){return operation(key,start,count,false,s);},
   addBias(values,bias,rows,columns){live();if(busy)throw Error('Weight source busy');busy=true;try{if(!Number.isInteger(rows)||rows<1||rows>16||!Number.isInteger(columns)||columns<1||columns>16||!(values instanceof Float32Array)||values.length!==rows*columns||!(bias instanceof Float32Array)||bias.length!==columns||!(values.buffer instanceof ArrayBuffer)||!(bias.buffer instanceof ArrayBuffer)||values.byteOffset!==0||values.byteLength!==values.buffer.byteLength||bias.byteOffset!==0||bias.byteLength!==bias.buffer.byteLength||!values.every(Number.isFinite)||!bias.every(Number.isFinite))throw TypeError('Finite exact compact bias shape required');const out=new Float32Array(values.length);for(let r=0;r<rows;r++)out.set(bridge.addBias(values.subarray(r*columns,(r+1)*columns),bias),r*columns);return out;}finally{busy=false;}},
   stats(){return {disposed,busy,reads,readBytes,maxReadBytes,hike:bridge?.stats()??null,fullFileHashRecomputed:false};},dispose(){if(busy)throw Error('Await weight source operation before disposal');disposed=true;original=null;bridge?.dispose();bridge=null;}
  });
 }catch(e){disposed=true;original=null;bridge?.dispose();throw e;}
}

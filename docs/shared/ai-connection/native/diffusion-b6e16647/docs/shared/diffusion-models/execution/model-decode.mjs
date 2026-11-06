import {MODEL_DECODE_WASM_SHA256} from './model-decode/registry.mjs';
import {BRIDGE_WASM_SHA256} from '../ort-bridge/kernel/registry.mjs';

const MAX_ELEMENTS=81920,F16_TABLE_ELEMENTS=65536,F8_TABLE_ELEMENTS=256;
export const MODEL_DECODE_NUMERIC_PROFILE='legacy-hike-f16-e4m3fn-f32-v1';
export const MODEL_DECODE_IMPLEMENTATION_PROFILE='hike-lookup-table-decoder-v1';
const typed=Object.getPrototypeOf(Uint8Array.prototype),slots=Object.fromEntries(['length','byteOffset','byteLength','buffer'].map(key=>[key,Object.getOwnPropertyDescriptor(typed,key).get]));
const tag=Object.getOwnPropertyDescriptor(typed,Symbol.toStringTag).get,bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
function compact(value,type){
 if(!ArrayBuffer.isView(value)||tag.call(value)!==type)throw TypeError('Compact nonshared '+type+' required');const buffer=slots.buffer.call(value);
 if(!(buffer instanceof ArrayBuffer)||slots.byteOffset.call(value)!==0||slots.byteLength.call(value)!==bufferLength.call(buffer))throw TypeError('Compact nonshared '+type+' required');return buffer;
}
function wasmSnapshot(value){
 if(value instanceof ArrayBuffer){bufferLength.call(value);return new Uint8Array(value).slice();}
 const buffer=compact(value,'Uint8Array');return new Uint8Array(buffer).slice();
}
function oracleOutput(value,count){
 const buffer=compact(value,'Float32Array');if(slots.length.call(value)!==count)throw TypeError('Exact finite oracle F32 table output required');
 const result=new Float32Array(buffer).slice();if(!result.every(Number.isFinite))throw TypeError('Finite oracle F32 table output required');return result;
}

/** Numeric tables are generated privately by the original Hike bridge only. */
export async function createModelLookupDecoder({oracle,lookupBytes,scales=new Map(),signal}={}){
 signal?.throwIfAborted();
 if(!['dequant','decodeF16','stats'].every(key=>typeof oracle?.[key]==='function')||oracle.stats().wasmSha256!==BRIDGE_WASM_SHA256)throw TypeError('Pinned legacy Hike numeric oracle required');
 if(!(scales instanceof Map))throw TypeError('Explicit per-target F32 scale Map required');const selectedScales=new Map();
 for(const [key,scale]of scales){if(typeof key!=='string'||!key||typeof scale!=='number'||!Number.isFinite(scale)||scale<=0||Math.fround(scale)!==scale)throw TypeError('Per-target positive finite F32 scale required');selectedScales.set(key,scale);}
 let bytes;if(lookupBytes!==undefined)bytes=wasmSnapshot(lookupBytes);else{const response=await fetch(new URL('./model-decode/model-decode.wasm',import.meta.url));if(!response.ok)throw Error('Hike model lookup decoder unavailable');bytes=new Uint8Array(await response.arrayBuffer());}signal?.throwIfAborted();
 const digest=await sha(bytes);if(digest!==MODEL_DECODE_WASM_SHA256)throw Error('Model lookup decoder WASM hash mismatch');signal?.throwIfAborted();
 const module=await WebAssembly.compile(bytes);if(WebAssembly.Module.imports(module).length)throw Error('Unexpected lookup decoder WASM imports');signal?.throwIfAborted();
 let instance=await WebAssembly.instantiate(module,{}),memory=instance.exports.memory;
 if(!(memory instanceof WebAssembly.Memory)||!['Lookup8','Lookup16'].every(key=>typeof instance.exports[key]==='function'))throw Error('Model lookup decoder ABI missing');
 const start=memory.buffer.byteLength,codesPtr=start,f16Ptr=codesPtr+MAX_ELEMENTS*2,f8Ptr=f16Ptr+F16_TABLE_ELEMENTS*4,outPtr=f8Ptr+F8_TABLE_ELEMENTS*4,arenaBytes=outPtr+MAX_ELEMENTS*4-start;
 memory.grow(Math.ceil(arenaBytes/65536));
 const tables=new Map();let disposed=false,calls=0,inputCopyBytes=0,outputCopyBytes=0,wasmTableCopyBytes=F16_TABLE_ELEMENTS*4;
 try{
  // Integer code enumeration and bit copies introduce no alternate decoder.
  const halfCodes=new Uint16Array(63488);let at=0;for(let code=0;code<65536;code++)if((code>>>10&31)!==31)halfCodes[at++]=code;
  const halfValues=oracleOutput(oracle.decodeF16(halfCodes),halfCodes.length),halfBits=new Uint32Array(halfValues.buffer),halfTableBits=new Uint32Array(memory.buffer,f16Ptr,F16_TABLE_ELEMENTS);
  for(let i=0;i<halfCodes.length;i++)halfTableBits[halfCodes[i]]=halfBits[i];signal?.throwIfAborted();
  const fp8Codes=new Uint8Array(254);at=0;for(let code=0;code<256;code++)if((code&127)!==127)fp8Codes[at++]=code;
  for(const [key,scale]of selectedScales){
   const values=oracleOutput(oracle.dequant(fp8Codes,scale),fp8Codes.length),bits=new Uint32Array(values.buffer),table=new Uint32Array(F8_TABLE_ELEMENTS);
   for(let i=0;i<fp8Codes.length;i++)table[fp8Codes[i]]=bits[i];tables.set(key,table);signal?.throwIfAborted();
  }
 }catch(error){new Uint8Array(memory.buffer,start,arenaBytes).fill(0);tables.clear();instance=null;memory=null;throw error;}
 const live=()=>{if(disposed)throw Error('Model lookup decoder disposed');};
 const decode=(raw,key,half)=>{
  live();const buffer=compact(raw,'Uint8Array'),length=slots.length.call(raw),count=half?length/2:length;
  if(!Number.isInteger(count)||count<1||count>MAX_ELEMENTS)throw RangeError('Lookup decode requires 1..81920 elements with complete F16 bytes');
  let table;if(!half){table=tables.get(key);if(!table)throw RangeError('Unregistered FP8 table target');new Uint32Array(memory.buffer,f8Ptr,F8_TABLE_ELEMENTS).set(table);wasmTableCopyBytes+=table.byteLength;}
  new Uint8Array(memory.buffer,codesPtr,length).set(new Uint8Array(buffer));inputCopyBytes+=length;
  try{
   const status=instance.exports[half?'Lookup16':'Lookup8'](codesPtr,count,half?f16Ptr:f8Ptr,outPtr,MAX_ELEMENTS);
   if(status!==0)throw Error('Hike lookup decoder rejected storage code/range: '+status);
   // Every reachable table slot was checked finite at construction, and the
   // Hike preflight rejects every nonfinite storage code before lookup.
   const result=new Float32Array(memory.buffer,outPtr,count).slice();calls++;outputCopyBytes+=result.byteLength;return result;
  }finally{new Uint8Array(memory.buffer,codesPtr,length).fill(0);new Uint8Array(memory.buffer,outPtr,count*4).fill(0);}
 };
 return Object.freeze({
  decodeF16(raw){return decode(raw,null,true);},dequant(raw,key){return decode(raw,key,false);},
  describe(){live();return {numericProfileId:MODEL_DECODE_NUMERIC_PROFILE,implementationProfileId:MODEL_DECODE_IMPLEMENTATION_PROFILE,wasmSha256:digest,oracleWasmSha256:BRIDGE_WASM_SHA256,finiteF16Codes:63488,legalFP8Codes:254,fp8Tables:tables.size,maxElements:MAX_ELEMENTS,arithmetic:'Legacy Hike oracle constructs tables once; Hike integer-code lookup copies exact F32 values',tablesPublished:false};},
  stats(){return {disposed,workspaceReused:true,memoryBytes:memory?.buffer.byteLength??0,arenaBytes,tableBytes:disposed?0:F16_TABLE_ELEMENTS*4+(tables.size+1)*F8_TABLE_ELEMENTS*4,wasmTableBytes:disposed?0:(F16_TABLE_ELEMENTS+F8_TABLE_ELEMENTS)*4,hostTableBytes:tables.size*F8_TABLE_ELEMENTS*4,fp8Tables:tables.size,calls,inputCopyBytes,outputCopyBytes,wasmTableCopyBytes};},
  dispose(){if(disposed)return;new Uint8Array(memory.buffer,start,arenaBytes).fill(0);disposed=true;tables.clear();instance=null;memory=null;}
 });
}

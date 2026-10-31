// Owned bounded fragments from a prior-owner export. This is not a virtual full
// model File and cannot read any omitted tensor or unselected original row.
import {createProjectionBridge} from '../ort-bridge/hike.mjs';
import {createProjectionGraph} from '../ort-bridge/graph.mjs';
import {parseStrictJson} from './strict-json.mjs';
import {BASE_MODEL_HASHES} from './weights.mjs';
import {TARGET_PROVENANCE} from './targets.mjs';
import {canonicalRegistryJSON,diagnosticRegistryHash,verifyDiagnosticRegistryHash} from './diagnostic-identity.mjs';

export const BASE_BLOCK_SCHEMA='bernini-diagnostic-base-block/0.1';
const HEADER_BYTES=181280,PROFILE='scaled-e4m3fn-scalar-f32-v1',SHA=/^[a-f0-9]{64}$/;
const ids=['header','q.weight','q.bias','weight_scale','comfy_quant'];
const lengths=[HEADER_BYTES,81920,32,4,27];
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const copy=value=>structuredClone(value);
function fail(code,message){throw Object.assign(new Error(message),{code});}
const signalCheck=signal=>signal?.throwIfAborted();
function plain(value){return value&&Object.getPrototypeOf(value)===Object.prototype;}
function exactArray(a,b){return Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>Object.hasOwn(a,i)&&a[i]===v);}
function decodeRange(value,id,length){
 if(!plain(value)||value.id!==id||value.byteLength!==length||!Number.isSafeInteger(value.absoluteByteOffset)||value.absoluteByteOffset<0||!SHA.test(value.sha256)||value.encoding!=='base64'||typeof value.data!=='string'||value.data.length!==4*Math.ceil(length/3)||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data))fail('INVALID_BASE_FRAGMENT','Invalid bounded range, bytes, digest or base64');
 const text=atob(value.data);if(text.length!==length||btoa(text)!==value.data)fail('INVALID_BASE_FRAGMENT','Noncanonical base64 or range length mismatch');
 const bytes=Uint8Array.from(text,c=>c.charCodeAt(0));
 return {id,absoluteByteOffset:value.absoluteByteOffset,byteLength:length,sha256:value.sha256,data:bytes};
}
function descriptor(header,name,dtype,shape,bytes,fileBytes){
 const d=header[name];if(!plain(d)||d.dtype!==dtype||!exactArray(d.shape,shape)||!Array.isArray(d.data_offsets)||d.data_offsets.length!==2||!d.data_offsets.every(Number.isSafeInteger)||d.data_offsets[0]<0||d.data_offsets[1]-d.data_offsets[0]!==bytes||d.data_offsets[1]>fileBytes-8-HEADER_BYTES)fail('BASE_PROFILE_MISMATCH','Original header target dtype, full shape or source bounds mismatch: '+name);
 return {name,dtype,shape:[...d.shape],dataOffsets:[...d.data_offsets]};
}

export async function createBerniniBlockProvider({artifact,side,hikeBytes,signal}={}){
 if(!['HIGH','LOW'].includes(side))throw TypeError('Explicit HIGH/LOW side required');
 if(!plain(artifact)||artifact.schemaVersion!==BASE_BLOCK_SCHEMA||artifact.scope!=='PARTIAL'||artifact.fullFileHashRecomputed!==false||!plain(artifact.sides)||!Object.hasOwn(artifact.sides,side)||Object.keys(artifact.sides).some(k=>!['HIGH','LOW'].includes(k)))fail('INVALID_BASE_FRAGMENT','Expected explicitly partial base-block artifact, never a full File');
 if(new TextEncoder().encode(JSON.stringify(artifact)).byteLength>=1048576)fail('BASE_FRAGMENT_BUDGET','Bounded artifact exceeds 1MiB JSON budget');
 // Capture every metadata object, base64 string and provided binary kernel
 // before the first asynchronous digest/compile. No caller-owned view is kept.
 let owned=copy(artifact),selected=owned.sides[side],ownedHike;
 if(hikeBytes!==undefined){if(hikeBytes instanceof ArrayBuffer)ownedHike=new Uint8Array(hikeBytes).slice();else if(hikeBytes instanceof Uint8Array&&hikeBytes.buffer instanceof ArrayBuffer)ownedHike=new Uint8Array(hikeBytes);else throw TypeError('Owned nonshared Hike bytes required');}
 if(!plain(selected)||!Array.isArray(selected.ranges)||selected.ranges.length!==5)fail('INVALID_BASE_FRAGMENT','Exactly the five declared bounded ranges are required');
 const ranges=new Map(ids.map((id,i)=>[id,decodeRange(selected.ranges[i],id,lengths[i])]));
 const pinned=TARGET_PROVENANCE.models.find(m=>m.name.includes(side)),source=selected.source,prior=source?.priorOwnerReceipt;
 if(!plain(source)||source.name!==pinned.name||source.fileBytes!==pinned.fileBytes||source.modelSha256!==BASE_MODEL_HASHES[side]||!plain(prior)||prior.kind!=='retained-download-manifest'||!SHA.test(prior.manifestSha256)||prior.sha256!==BASE_MODEL_HASHES[side]||prior.verified!==true||prior.verification!=='PRIOR_OWNER_RECEIPT_NOT_REHASHED'||prior.authenticity!=='not-independently-certified')fail('BASE_PROVENANCE_MISMATCH','Prior-owner receipt must remain distinct from current full-file verification');
 const priorReceipt=copy(prior);let hike=null,disposed=false,busy=false;const reads=[];
 const alive=()=>{if(disposed)fail('DISPOSED','Bounded base provider disposed');signalCheck(signal);};
 try{
  signalCheck(signal);verifyDiagnosticRegistryHash(selected.registry);
  for(const range of ranges.values()){if(await digest(range.data)!==range.sha256)fail('BASE_FRAGMENT_INTEGRITY','Provided fragment SHA-256 mismatch: '+range.id);signalCheck(signal);}
  const headerRange=ranges.get('header');if(headerRange.absoluteByteOffset!==8||headerRange.sha256!==pinned.headerSHA256)fail('BASE_IDENTITY_MISMATCH','Original header identity or side mismatch');
  let header;try{header=parseStrictJson(new TextDecoder('utf8',{fatal:true}).decode(headerRange.data),{maxDepth:32});}catch{fail('BASE_PROFILE_MISMATCH','Invalid original strict header');}
  const w=descriptor(header,'blocks.0.self_attn.q.weight','F8_E4M3',[5120,5120],5120*5120,pinned.fileBytes),b=descriptor(header,'blocks.0.self_attn.q.bias','F16',[5120],5120*2,pinned.fileBytes);
  const rawScale=header['blocks.0.self_attn.q.weight_scale'];
  if(!Array.isArray(rawScale?.shape)||rawScale.shape.length>1||(rawScale.shape.length===1&&rawScale.shape[0]!==1))fail('BASE_PROFILE_MISMATCH','Scalar FP8 scale required');
  const s=descriptor(header,'blocks.0.self_attn.q.weight_scale','F32',rawScale.shape,4,pinned.fileBytes),quant=descriptor(header,'blocks.0.self_attn.q.comfy_quant','U8',[27],27,pinned.fileBytes),payloadStart=8+HEADER_BYTES;
  const offsets=[8,payloadStart+w.dataOffsets[0],payloadStart+b.dataOffsets[0],payloadStart+s.dataOffsets[0],payloadStart+quant.dataOffsets[0]];
  for(let i=0;i<ids.length;i++)if(ranges.get(ids[i]).absoluteByteOffset!==offsets[i])fail('BASE_FRAGMENT_RANGE_MISMATCH','Fragment absolute offset differs from the original header: '+ids[i]);
  const scaleRange=ranges.get('weight_scale'),scale=new DataView(scaleRange.data.buffer,scaleRange.data.byteOffset,4).getFloat32(0,true),config=ranges.get('comfy_quant');
  if(!Number.isFinite(scale)||scale<=0||new TextDecoder('utf8',{fatal:true}).decode(config.data)!=='{"format": "float8_e4m3fn"}')fail('BASE_PROFILE_MISMATCH','Scalar FP8 scale or quantization profile mismatch');
  const graphHash=await digest(createProjectionGraph());signalCheck(signal);
  const targets=[
   {key:'diffusion_model.'+w.name,weightId:'q.weight',originalKey:w.name,fullShape:[5120,5120],shape:[16,5120],dtype:'F32',storageDtype:w.dtype,computeDtype:'F32',layout:'row-major',binding:{kind:'runtime-input',name:'weight'},transform:{kind:'row-slice',rowStart:0,rowCount:16,columnStart:0,columnCount:5120,transpose:false},source:{payloadByteOffset:w.dataOffsets[0],elementOffset:0,byteWidth:1},fp8:{profileId:PROFILE,scaleKey:s.name,scaleShape:[...s.shape],scaleDtype:'F32',scale,scaleSHA256:scaleRange.sha256}},
   {key:'diffusion_model.'+b.name,weightId:'q.bias',originalKey:b.name,fullShape:[5120],shape:[16],dtype:'F32',storageDtype:b.dtype,computeDtype:'F32',layout:'row-major',binding:{kind:'hike-parameter',name:'bias'},transform:{kind:'row-slice',rowStart:0,rowCount:16,transpose:false},source:{payloadByteOffset:b.dataOffsets[0],elementOffset:0,byteWidth:2},fp8:null}
  ];
  const descriptorValue={schemaVersion:'bernini-diagnostic-registry/0.1',scope:'PARTIAL',modelHash:BASE_MODEL_HASHES[side],side,graphHash,executionProfileId:'bernini-q16x5120-f32-wasm-v1',fp8ProfileId:PROFILE,quantizationConfig:{key:quant.name,sha256:config.sha256,format:'float8_e4m3fn'},baseVerification:{kind:'header-and-ranges',headerSHA256:pinned.headerSHA256,fileBytes:pinned.fileBytes,fullFileSHA256Verified:false,modelHashRole:'expected-original-full-hash-not-current-file-proof'},targets,coverage:{kind:'PARTIAL',fullModel:false,selectedOriginalKeys:targets.map(t=>t.originalKey),excluded:'all other parameters and unselected rows',selectedRowCount:16}};
  const registry={...descriptorValue,registryHash:diagnosticRegistryHash(descriptorValue)};
  if(canonicalRegistryJSON(selected.registry)!==canonicalRegistryJSON(registry))fail('BASE_REGISTRY_MISMATCH','Native registry differs from original header, supplied scale or bounded slice');
  const payloads=new Map(['q.weight','q.bias'].map(id=>[id,ranges.get(id)])),rangeMetadata=[...ranges.values()].map(({data,...metadata})=>metadata);
  ranges.clear();owned=null;selected=null;
  if(ownedHike===undefined){const response=await fetch(new URL('../ort-bridge/kernel/bridge.wasm',import.meta.url));if(!response.ok)fail('HIKE_UNAVAILABLE','Bounded base Hike unavailable');ownedHike=new Uint8Array(await response.arrayBuffer());signalCheck(signal);}
  hike=await createProjectionBridge(ownedHike);alive();ownedHike=null;
  const baseProvider=Object.freeze({async readBlock(weightId,elementOffset,elementCount,context={}){
   alive();signalCheck(context.signal);
   if(context.modelHash!==registry.modelHash||context.graphHash!==registry.graphHash||context.registryHash!==registry.registryHash)fail('BASE_IDENTITY_MISMATCH','Bounded base read model, graph or registry identity mismatch');
   const range=payloads.get(weightId),target=targets.find(t=>t.weightId===weightId);if(!range||!target)fail('UNKNOWN_WEIGHT','Original range is not present in this bounded artifact');
   const count=weightId==='q.weight'?81920:16;
   if(!Number.isSafeInteger(elementOffset)||!Number.isSafeInteger(elementCount)||elementOffset<0||elementCount<1||elementOffset>count||elementCount>count-elementOffset)throw RangeError('Read outside the provided selected fragment');
   if(busy)fail('BASE_BUSY','Only one bounded base read at a time');busy=true;
   try{
    const width=target.source.byteWidth,begin=elementOffset*width,raw=range.data.slice(begin,begin+elementCount*width);let output;
    if(weightId==='q.weight')output=hike.dequant(raw,scale);
    else{const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),bits=new Uint16Array(elementCount);for(let i=0;i<bits.length;i++)bits[i]=view.getUint16(i*2,true);output=hike.decodeF16(bits);}
    const rangeSHA256=await digest(raw);alive();signalCheck(context.signal);const outputSHA256=await digest(output);alive();signalCheck(context.signal);
    reads.push({weightId,elementOffset,elementCount,absoluteByteOffset:range.absoluteByteOffset+begin,byteLength:raw.byteLength,rangeSHA256,outputSHA256});if(reads.length>64)reads.shift();return output;
   }finally{busy=false;}
  }});
  return Object.freeze({
   describe(){alive();return copy(registry);},baseProvider,
   stats(){return {disposed,busy,source:'bounded-fragment-artifact',scope:'PARTIAL',fullFileHashRecomputed:false,fullFileSHA256Verified:false,unprovidedRangesAvailable:false,providedRangeIds:[...ids],providedRanges:copy(rangeMetadata),priorOwnerReceipt:copy(priorReceipt),hike:hike?.stats()??null,reads:copy(reads)};},
   dispose(){if(disposed)return;disposed=true;payloads.clear();reads.length=0;hike?.dispose();hike=null;}
  });
 }catch(error){disposed=true;ranges.clear();owned=null;selected=null;ownedHike=null;hike?.dispose();throw error;}
}

import {inspectSafetensors} from '../api/safetensors.mjs';
import {createProjectionBridge} from '../ort-bridge/hike.mjs';
import {createProjectionGraph} from '../ort-bridge/graph.mjs';
import {BASE_MODEL_HASHES} from './weights.mjs';
import {TARGET_PROVENANCE} from './targets.mjs';
import {canonicalRegistryJSON,diagnosticRegistryHash} from './diagnostic-identity.mjs';
export {canonicalRegistryJSON} from './diagnostic-identity.mjs';
const VERSION='bernini-diagnostic-registry/0.1';
const PROFILE='scaled-e4m3fn-scalar-f32-v1';
const copy=v=>structuredClone(v);
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
function fail(code,message){throw Object.assign(new Error(message),{code});}
function check(signal){signal?.throwIfAborted();}
export async function createBerniniDiagnosticBase({file,side,rowStart=0,hikeBytes,signal}={}){
 if(!(file instanceof Blob))throw TypeError('Immutable local File/Blob required');
 if(!['HIGH','LOW'].includes(side))throw TypeError('Explicit HIGH/LOW side required');
 if(!Number.isSafeInteger(rowStart)||rowStart<0||rowStart+16>5120)throw RangeError('Selected row slice outside full shape');
 check(signal);let ownedFile=file,hike=null,disposed=false,busy=false;const reads=[];
 const active=()=>{if(disposed)fail('DISPOSED','Base provider disposed');};
 const alive=()=>{active();check(signal);};
 try{
  const inspected=await inspectSafetensors(ownedFile,{rejectDuplicateKeys:true});alive();
  const pinned=TARGET_PROVENANCE.models.find(m=>m.name.includes(side));
  if(inspected.headerSHA256!==pinned.headerSHA256||inspected.fileBytes!==pinned.fileBytes)fail('BASE_IDENTITY_MISMATCH','Base header/side identity mismatch');
  const descriptors=new Map(inspected.tensors.map(t=>[t.name,t]));
  const w=descriptors.get('blocks.0.self_attn.q.weight'),b=descriptors.get('blocks.0.self_attn.q.bias'),s=descriptors.get('blocks.0.self_attn.q.weight_scale'),quant=descriptors.get('blocks.0.self_attn.q.comfy_quant');
  if(w?.dtype!=='F8_E4M3'||JSON.stringify(w.shape)!=='[5120,5120]'||b?.dtype!=='F16'||JSON.stringify(b.shape)!=='[5120]'||s?.dtype!=='F32'||s.byteLength!==4)fail('BASE_PROFILE_MISMATCH','Actual weight/bias/scale shape or dtype mismatch');
  const payloadStart=8+inspected.headerBytes;
  if(quant?.dtype!=='U8'||quant.byteLength!==27)fail('BASE_PROFILE_MISMATCH','Quantization config descriptor mismatch');
  const quantBytes=await ownedFile.slice(payloadStart+quant.dataOffsets[0],payloadStart+quant.dataOffsets[1]).arrayBuffer();alive();
  if(new TextDecoder('utf-8',{fatal:true}).decode(quantBytes)!=='{"format": "float8_e4m3fn"}')fail('BASE_PROFILE_MISMATCH','Quantization config does not match the scalar E4M3FN profile');
  const quantSHA256=await sha(quantBytes);alive();
  const scaleBytes=await ownedFile.slice(payloadStart+s.dataOffsets[0],payloadStart+s.dataOffsets[1]).arrayBuffer();alive();
  const scale=new DataView(scaleBytes).getFloat32(0,true);
  if(!Number.isFinite(scale)||scale<=0)fail('BASE_PROFILE_MISMATCH','Positive finite scalar FP8 scale required');
  const scaleSHA256=await sha(scaleBytes),graphHash=await sha(createProjectionGraph());alive();
  const targets=[
   {key:'diffusion_model.'+w.name,weightId:'q.weight',originalKey:w.name,fullShape:[5120,5120],shape:[16,5120],dtype:'F32',storageDtype:w.dtype,computeDtype:'F32',layout:'row-major',binding:{kind:'runtime-input',name:'weight'},transform:{kind:'row-slice',rowStart,rowCount:16,columnStart:0,columnCount:5120,transpose:false},source:{payloadByteOffset:w.dataOffsets[0],elementOffset:rowStart*5120,byteWidth:1},fp8:{profileId:PROFILE,scaleKey:s.name,scaleShape:[...s.shape],scaleDtype:'F32',scale,scaleSHA256}},
   {key:'diffusion_model.'+b.name,weightId:'q.bias',originalKey:b.name,fullShape:[5120],shape:[16],dtype:'F32',storageDtype:b.dtype,computeDtype:'F32',layout:'row-major',binding:{kind:'hike-parameter',name:'bias'},transform:{kind:'row-slice',rowStart,rowCount:16,transpose:false},source:{payloadByteOffset:b.dataOffsets[0],elementOffset:rowStart,byteWidth:2},fp8:null}
  ];
  const descriptor={schemaVersion:VERSION,scope:'PARTIAL',modelHash:BASE_MODEL_HASHES[side],side,graphHash,executionProfileId:'bernini-q16x5120-f32-wasm-v1',fp8ProfileId:PROFILE,quantizationConfig:{key:quant.name,sha256:quantSHA256,format:'float8_e4m3fn'},baseVerification:{kind:'header-and-ranges',headerSHA256:inspected.headerSHA256,fileBytes:inspected.fileBytes,fullFileSHA256Verified:false,modelHashRole:'expected-original-full-hash-not-current-file-proof'},targets,coverage:{kind:'PARTIAL',fullModel:false,selectedOriginalKeys:targets.map(t=>t.originalKey),excluded:'all other parameters and unselected rows',selectedRowCount:16}};
  const registry={...descriptor,registryHash:diagnosticRegistryHash(descriptor)};alive();
  if(hikeBytes===undefined){const r=await fetch(new URL('../ort-bridge/kernel/bridge.wasm',import.meta.url));if(!r.ok)fail('HIKE_UNAVAILABLE','Base Hike unavailable');hikeBytes=await r.arrayBuffer();alive();}
  hike=await createProjectionBridge(hikeBytes);alive();
  const baseProvider=Object.freeze({async readBlock(weightId,elementOffset,elementCount,context={}){
   active();check(context.signal);
   if(context.modelHash!==registry.modelHash||context.graphHash!==registry.graphHash||context.registryHash!==registry.registryHash)fail('BASE_IDENTITY_MISMATCH','Base read binding identity mismatch');
   if(busy)fail('BASE_BUSY','Only one base read at a time');
   const t=targets.find(t=>t.weightId===weightId);if(!t)fail('UNKNOWN_WEIGHT','Unknown weight target');
   const count=t.shape.reduce((a,b)=>a*b,1);
   if(!Number.isSafeInteger(elementOffset)||!Number.isSafeInteger(elementCount)||elementOffset<0||elementCount<1||elementOffset>count||elementCount>count-elementOffset||elementCount>81920)throw RangeError('Base selected-slice read range outside bounds');
   busy=true;
   try{
    const offset=payloadStart+t.source.payloadByteOffset+(t.source.elementOffset+elementOffset)*t.source.byteWidth,length=elementCount*t.source.byteWidth;
    const raw=await ownedFile.slice(offset,offset+length).arrayBuffer();active();check(context.signal);check(signal);
    if(raw.byteLength!==length)fail('BASE_READ_FAILED','Base range read length mismatch');
    const rangeSHA256=await sha(raw);active();check(context.signal);check(signal);
    let output;
    if(t.storageDtype==='F8_E4M3')output=hike.dequant(new Uint8Array(raw),scale);
    else{const view=new DataView(raw),bits=new Uint16Array(elementCount);for(let i=0;i<bits.length;i++)bits[i]=view.getUint16(i*2,true);output=hike.decodeF16(bits);}
    check(context.signal);check(signal);active();
    reads.push({weightId,elementOffset,elementCount,fileByteOffset:offset,byteLength:length,rangeSHA256,outputSHA256:await sha(output)});if(reads.length>64)reads.shift();
    active();check(context.signal);check(signal);return output;
   }finally{busy=false;}
  }});
  return Object.freeze({describe(){active();return copy(registry);},baseProvider,stats(){return {disposed,busy,hike:hike?.stats()??null,reads:copy(reads),fullFileHashRecomputed:false};},dispose(){if(disposed)return;disposed=true;ownedFile=null;hike?.dispose();hike=null;reads.length=0;}});
 }catch(error){disposed=true;ownedFile=null;hike?.dispose();throw error;}
}

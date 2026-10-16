import {safePath} from './archive.mjs';
import {expandInput} from './archive.mjs';
import {parseUnityFile} from './text.mjs';
import {bytes,freezeDeep,plain,LIMITS} from './model.mjs';
export const PARSER_VERSION='unity-text-1';
export const isIngest=t=>t==='unity-expand'||t==='unity-parse'||t==='unity-parse-batch';
const MAX_IN=16*1024*1024,MAX_OUT=64*1024*1024,MAX_TEXT=4*1024*1024;
// File IR cannot exceed the existing snapshot budget. Envelope headroom avoids rejecting a valid snapshot.
export const PARSE_BATCH_LIMITS=Object.freeze({maxFiles:8,maxInputBytes:256*1024,maxFileIRBytes:LIMITS.maxInputBytes,maxResultBytes:LIMITS.maxInputBytes+64*1024});
function byteArray(b){if(!(b instanceof Uint8Array)||(typeof SharedArrayBuffer!=='undefined'&&b.buffer instanceof SharedArrayBuffer)||b.buffer.resizable||b.byteLength>MAX_IN)throw TypeError('Invalid owned ingestion bytes');return b;}
function batchFiles(files){
 if(!Array.isArray(files)||files.length<1||files.length>PARSE_BATCH_LIMITS.maxFiles)throw RangeError('PARSE_BATCH_FILE_COUNT_LIMIT');
 let total=0;const seen=new Set();
 return files.map(file=>{const path=safePath(file?.path),data=byteArray(file?.bytes),key=path.normalize('NFC').toLowerCase();
  total+=data.byteLength;if(total>PARSE_BATCH_LIMITS.maxInputBytes)throw RangeError('PARSE_BATCH_INPUT_LIMIT');
  if(seen.has(key))throw TypeError('PARSE_BATCH_PATH_CONFLICT');for(const prior of seen)if(key.startsWith(prior+'/')||prior.startsWith(key+'/'))throw TypeError('PARSE_BATCH_PATH_CONFLICT');seen.add(key);
  return {path,bytes:data};
 });
}
export function inspectTaskRequest(r){
 if(!r||r.protocolVersion!==1||!isIngest(r.taskType)||r.taskVersion!==1||typeof r.jobId!=='string'||!/^[A-Za-z0-9_.:-]{1,64}$/.test(r.jobId)||!Number.isSafeInteger(r.inputRevision)||r.inputRevision<0)throw TypeError('Invalid ingestion identity');
 const timeoutMs=r.limits?.timeoutMs??30000;if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw RangeError('Invalid ingestion timeout');
 const payload=r.taskType==='unity-parse-batch'?{files:batchFiles(r.payload?.files)}:{path:safePath(r.payload?.path),bytes:byteArray(r.payload?.bytes)};
 return {protocolVersion:1,taskType:r.taskType,taskVersion:1,jobId:r.jobId,inputRevision:r.inputRevision,wasmVariant:'javascript',kernelHash:null,payload,limits:{timeoutMs}};
}
export const snapshotTaskRequest=r=>({...r,payload:r.taskType==='unity-parse-batch'?{files:r.payload.files.map(f=>({path:f.path,bytes:f.bytes.slice()}))}:{path:r.payload.path,bytes:r.payload.bytes.slice()}});
export const inputBytes=r=>r.taskType==='unity-parse-batch'?r.payload.files.reduce((n,f)=>n+f.bytes.byteLength,0):r.payload.bytes.byteLength;
export const kernelInfo=()=>({key:PARSER_VERSION,requiresWasm:false,retainResult:false,sha256:null,variant:'javascript',abi:PARSER_VERSION});
export const resultShape=r=>r.taskType==='unity-parse-batch'?{kind:'unity-parsed-batch',count:r.payload.files.length,paths:r.payload.files.map(f=>f.path),byteLengths:r.payload.files.map(f=>f.bytes.byteLength)}:{kind:r.taskType==='unity-expand'?'unity-expanded':'unity-parsed',path:r.payload.path,byteLength:r.payload.bytes.byteLength};
const validFile=(f,path,length)=>plain(f)&&f.path===path&&f.byteLength===length&&/^[0-9a-f]{64}$/.test(f.contentHash)&&Array.isArray(f.objects)&&Array.isArray(f.issues)&&['serialized','partial','opaque','meta-only'].includes(f.coverage);
export function validTaskResult(t,s,r){
 if(!r||r.kind!==s.kind||r.parserVersion!==PARSER_VERSION)return false;
 if(t==='unity-parse-batch'){
  if(!Array.isArray(r.files)||r.files.length!==s.count||s.count<1||s.count>PARSE_BATCH_LIMITS.maxFiles)return false;
  let total=0;for(let i=0;i<r.files.length;i++){const f=r.files[i];if(!validFile(f,s.paths[i],s.byteLengths[i]))return false;total+=bytes(f);if(total>PARSE_BATCH_LIMITS.maxFileIRBytes||bytes({kind:'unity-parsed',path:f.path,parserVersion:PARSER_VERSION,file:f})>MAX_TEXT)return false;}
  return bytes(r)<=PARSE_BATCH_LIMITS.maxResultBytes;
 }
 if(r.path!==s.path)return false;
 if(t==='unity-parse')return validFile(r.file,s.path,s.byteLength)&&bytes(r)<=MAX_TEXT;
 if(!Array.isArray(r.files)||r.files.length>2048)return false;let total=0;for(const f of r.files){safePath(f.path);if(!(f.bytes instanceof Uint8Array)||(typeof SharedArrayBuffer!=='undefined'&&f.bytes.buffer instanceof SharedArrayBuffer))return false;total+=f.bytes.byteLength;}return total<=MAX_OUT;
}
export const resultBytes=r=>r?.kind==='unity-expanded'?r.files.reduce((n,f)=>n+f.bytes.byteLength,0):r?bytes(r):0;
export const freezeTaskResult=freezeDeep;
export const transferTaskInput=r=>r.taskType==='unity-parse-batch'?[...new Set(r.payload.files.map(f=>f.bytes.buffer))]:[r.payload.bytes.buffer];
export const transferTaskResult=r=>r.kind==='unity-expanded'?[...new Set(r.files.map(f=>f.bytes.buffer))]:[];
export const prepareTaskModule=()=>{throw Error('Ingestion has no WASM');};
export const instantiateTask=()=>null;
async function parseFile({path,bytes:raw}){
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');
 let file;const supported=/\.(controller|anim|prefab|unity|asset|mat|overrideController|meta)$/i.test(path);
 if(!supported)file={path,objects:[],coverage:'opaque',reason:'Unsupported extension; bytes inventoried',issues:[]};
 else if(raw.length>MAX_TEXT)throw RangeError('TEXT_BYTE_LIMIT');
 else {let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{file={path,objects:[],coverage:'opaque',reason:'Non UTF-8 or binary content',issues:[]};}
  if(text!==undefined){if(text.includes('\0'))file={path,objects:[],coverage:'opaque',reason:'Binary content (NUL)',issues:[]};else file=parseUnityFile({path,text});}}
 file.contentHash=hash;file.byteLength=raw.byteLength;
 const result={kind:'unity-parsed',path,parserVersion:PARSER_VERSION,file};if(bytes(result)>MAX_TEXT)throw RangeError('FILE_IR_LIMIT');return result;
}
export async function executeTask(r){
 if(r.taskType==='unity-expand')return {kind:'unity-expanded',path:r.payload.path,parserVersion:PARSER_VERSION,files:expandInput(r.payload)};
 if(r.taskType!=='unity-parse-batch')return parseFile(r.payload);
 const files=[];let total=0;
 for(const input of r.payload.files){const result=await parseFile(input);total+=bytes(result.file);if(total>PARSE_BATCH_LIMITS.maxFileIRBytes)throw RangeError('SNAPSHOT_IR_LIMIT');files.push(result.file);}
 const result={kind:'unity-parsed-batch',parserVersion:PARSER_VERSION,files};if(bytes(result)>PARSE_BATCH_LIMITS.maxResultBytes)throw RangeError('PARSE_BATCH_RESULT_LIMIT');return result;
}
export const taskInputCount=inputBytes;

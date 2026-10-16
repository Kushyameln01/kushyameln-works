import {safePath} from './archive.mjs';
import {expandInput} from './archive.mjs';
import {parseUnityFile} from './text.mjs';
import {bytes,freezeDeep} from './model.mjs';
export const PARSER_VERSION='unity-text-1';
export const isIngest=t=>t==='unity-expand'||t==='unity-parse';
const MAX_IN=16*1024*1024,MAX_OUT=64*1024*1024,MAX_TEXT=4*1024*1024;
function byteArray(b){if(!(b instanceof Uint8Array)||(typeof SharedArrayBuffer!=='undefined'&&b.buffer instanceof SharedArrayBuffer)||b.buffer.resizable||b.byteLength>MAX_IN)throw TypeError('Invalid owned ingestion bytes');return b;}
export function inspectTaskRequest(r){
 if(!r||r.protocolVersion!==1||!isIngest(r.taskType)||r.taskVersion!==1||typeof r.jobId!=='string'||!/^[A-Za-z0-9_.:-]{1,64}$/.test(r.jobId)||!Number.isSafeInteger(r.inputRevision)||r.inputRevision<0)throw TypeError('Invalid ingestion identity');
 const timeoutMs=r.limits?.timeoutMs??30000;if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw RangeError('Invalid ingestion timeout');
 safePath(r.payload?.path);byteArray(r.payload?.bytes);
 return {protocolVersion:1,taskType:r.taskType,taskVersion:1,jobId:r.jobId,inputRevision:r.inputRevision,wasmVariant:'javascript',kernelHash:null,payload:{path:r.payload.path,bytes:r.payload.bytes},limits:{timeoutMs}};
}
export const snapshotTaskRequest=r=>({...r,payload:{path:r.payload.path,bytes:r.payload.bytes.slice()}});
export const inputBytes=r=>r.payload.bytes.byteLength;
export const kernelInfo=()=>({key:PARSER_VERSION,requiresWasm:false,retainResult:false,sha256:null,variant:'javascript',abi:PARSER_VERSION});
export const resultShape=r=>({kind:r.taskType==='unity-expand'?'unity-expanded':'unity-parsed',path:r.payload.path});
export function validTaskResult(t,s,r){if(!r||r.kind!==s.kind||r.path!==s.path||r.parserVersion!==PARSER_VERSION)return false;if(t==='unity-parse')return r.file?.path===s.path&&Array.isArray(r.file.objects)&&bytes(r)<=MAX_TEXT;if(!Array.isArray(r.files)||r.files.length>2048)return false;let total=0;for(const f of r.files){safePath(f.path);if(!(f.bytes instanceof Uint8Array)||(typeof SharedArrayBuffer!=='undefined'&&f.bytes.buffer instanceof SharedArrayBuffer))return false;total+=f.bytes.byteLength;}return total<=MAX_OUT;}
export const resultBytes=r=>r?.kind==='unity-expanded'?r.files.reduce((n,f)=>n+f.bytes.byteLength,0):r?bytes(r):0;
export const freezeTaskResult=freezeDeep;
export const transferTaskInput=r=>[r.payload.bytes.buffer];
export const transferTaskResult=r=>r.kind==='unity-expanded'?[...new Set(r.files.map(f=>f.bytes.buffer))]:[];
export const prepareTaskModule=()=>{throw Error('Ingestion has no WASM');};
export const instantiateTask=()=>null;
export async function executeTask(r){
 const {path,bytes:raw}=r.payload;
 if(r.taskType==='unity-expand')return {kind:'unity-expanded',path,parserVersion:PARSER_VERSION,files:expandInput(r.payload)};
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');
 let file;const supported=/\.(controller|anim|prefab|unity|asset|mat|overrideController|meta)$/i.test(path);
 if(!supported)file={path,objects:[],coverage:'opaque',reason:'Unsupported extension; bytes inventoried',issues:[]};
 else if(raw.length>MAX_TEXT)throw RangeError('TEXT_BYTE_LIMIT');
 else {let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{file={path,objects:[],coverage:'opaque',reason:'Non UTF-8 or binary content',issues:[]};}
  if(text!==undefined){if(text.includes('\0'))file={path,objects:[],coverage:'opaque',reason:'Binary content (NUL)',issues:[]};else file=parseUnityFile({path,text});}}
 file.contentHash=hash;file.byteLength=raw.byteLength;
 const result={kind:'unity-parsed',path,parserVersion:PARSER_VERSION,file};if(bytes(result)>MAX_TEXT)throw RangeError('FILE_IR_LIMIT');return result;
}
export const taskInputCount=r=>r.payload.bytes.byteLength;

import {collectMotionParameters,generateParameterAssets} from './core.mjs';
import {prepareKernelModule,instantiateKernel} from '../compute/kernel.mjs';
import {WASM_SHA256} from '../compute/protocol.mjs';

export const TASK_VERSION=1;
export const MAX_TASK_BYTES=8*1024*1024;
export const isParameterTask=type=>type==='parameter-collect'||type==='parameter-generate';
const size=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const validName=name=>typeof name==='string'&&name.length>0&&name.trim().length>0&&!/[\u0000-\u001f\u007f\u0085\u2028\u2029]/u.test(name);
function parameters(value){
  if(!Array.isArray(value)||value.length>8192)throw RangeError('Parameter登録数の上限は8192です。');
  const seen=new Set();
  for(const p of value){if(!p||!validName(p.name)||p.type!=='Float'||seen.has(p.name))throw TypeError('Parameter名・型・重複を確認してください。');seen.add(p.name);}
  return value;
}
function documents(value){
  if(!Array.isArray(value)||value.length<1)throw TypeError('Clip/BlendTreeの入力がありません。');
  for(const d of value)if(!d||!['74','206'].includes(d.classId)||typeof d.text!=='string'||typeof d.fileId!=='string'||!/^-[1-9][0-9]*$|^[1-9][0-9]*$/.test(d.fileId)||typeof d.guid!=='string'||!/^[a-f0-9]{32}$/.test(d.guid)||typeof d.path!=='string')throw TypeError('Clip/BlendTreeの入力形式を確認してください。');
  return value;
}
export function inspectTaskRequest(r){
  if(!r||r.protocolVersion!==1||r.taskVersion!==1||!isParameterTask(r.taskType)||typeof r.jobId!=='string'||!/^[A-Za-z0-9_.:-]{1,64}$/.test(r.jobId)||!Number.isSafeInteger(r.inputRevision)||r.inputRevision<0)throw TypeError('Invalid Parameter task identity');
  const timeoutMs=r.limits?.timeoutMs??30000;
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw RangeError('Invalid Parameter task timeout');
  const payload=r.taskType==='parameter-collect'?{documents:documents(r.payload?.documents)}:{parameters:parameters(r.payload?.parameters),settings:r.payload?.settings??{}};
  if(size(payload)>MAX_TASK_BYTES)throw RangeError('Parameter処理データが8 MiBの上限を超えます。');
  return {protocolVersion:1,taskType:r.taskType,taskVersion:1,jobId:r.jobId,inputRevision:r.inputRevision,wasmVariant:r.taskType==='parameter-collect'?'scalar':'javascript',kernelHash:r.taskType==='parameter-collect'?WASM_SHA256:null,payload,limits:{timeoutMs}};
}
export const snapshotTaskRequest=r=>({...r,payload:structuredClone(r.payload)});
export const inputBytes=r=>size(r.payload);
export const kernelInfo=r=>(typeof r==='string'?r:r.taskType)==='parameter-collect'
  ?{requiresWasm:true,retainResult:false,sha256:WASM_SHA256,variant:'scalar',abi:'ft-v1',key:`ft-v1:${WASM_SHA256}:scalar`}
  :{requiresWasm:false,retainResult:false,sha256:null,variant:'javascript',abi:'parameter-assets-1',key:'parameter-assets-1'};
export const resultShape=r=>r.taskType==='parameter-collect'?{kind:'parameter-names'}:{kind:'parameter-assets',parameterCount:r.payload.parameters.length,bitCost:r.payload.settings.networkSynced?r.payload.parameters.length*8:0};
export function validTaskResult(taskType,shape,result){
  if(!result||result.kind!==shape.kind)return false;
  if(taskType==='parameter-collect'){
    try{parameters(result.parameters);return size(result)<=MAX_TASK_BYTES;}catch{return false;}
  }
  return result.archive instanceof Uint8Array&&result.archive.byteLength>0&&result.archive.byteLength<=MAX_TASK_BYTES
    &&typeof result.fileName==='string'&&/^[A-Za-z0-9_-]{1,64}\.unitypackage$/.test(result.fileName)
    &&result.parameterCount===shape.parameterCount&&result.bitCost===shape.bitCost;
}
export const resultBytes=r=>r?.archive instanceof Uint8Array?r.archive.byteLength+512:r?size(r):0;
export function freezeTaskResult(r){if(r?.parameters){for(const p of r.parameters)Object.freeze(p);Object.freeze(r.parameters);}return r?Object.freeze(r):r;}
export const transferTaskInput=()=>[];
export const transferTaskResult=r=>r?.archive instanceof Uint8Array?[r.archive.buffer]:[];
export const prepareTaskModule=prepareKernelModule;
export const instantiateTask=(r,module)=>instantiateKernel(module);
export async function executeTask(r,kernel){
  if(r.taskType==='parameter-collect')return {kind:'parameter-names',parameters:collectMotionParameters(r.payload.documents,kernel)};
  return {kind:'parameter-assets',...await generateParameterAssets(r.payload.parameters,r.payload.settings)};
}
export const taskInputCount=r=>r.taskType==='parameter-collect'?r.payload.documents.length:r.payload.parameters.length;

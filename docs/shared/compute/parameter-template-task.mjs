import {generatePackage,validateTarget,BUILD_ID as TEMPLATE_BUILD_ID} from '../../parameter-template/core.mjs';

export const isTemplateTask=type=>type==='parameter-template-generate';
const encoder=new TextEncoder();
const TEMPLATE_SHA256='d11aa908b86a75021a7be4ad0367a45cb3206346d1a370202a4d25aaab3be3f1';
const size=value=>encoder.encode(JSON.stringify(value)).byteLength;

export function inspectTaskRequest(r){
  if(!r||r.protocolVersion!==1||r.taskVersion!==1||!isTemplateTask(r.taskType)||typeof r.jobId!=='string'||!/^[A-Za-z0-9_.:-]{1,64}$/.test(r.jobId)||!Number.isSafeInteger(r.inputRevision)||r.inputRevision<0)throw new TypeError('Invalid Template task identity');
  validateTarget(r.payload?.target);
  const timeoutMs=r.limits?.timeoutMs??30000;
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new RangeError('Invalid Template task timeout');
  return {protocolVersion:1,taskType:r.taskType,taskVersion:1,jobId:r.jobId,inputRevision:r.inputRevision,
    wasmVariant:'javascript',kernelHash:null,payload:{target:r.payload.target},limits:{timeoutMs}};
}
export const snapshotTaskRequest=r=>({...r,payload:{target:r.payload.target}});
export const inputBytes=r=>size(r.payload);
export const kernelInfo=()=>({requiresWasm:false,retainResult:false,sha256:null,variant:'javascript',abi:TEMPLATE_BUILD_ID,key:TEMPLATE_BUILD_ID});
export const resultShape=r=>({kind:'parameter-template-package',target:r.payload.target});
export const validTaskResult=(taskType,shape,r)=>isTemplateTask(taskType)&&r?.kind===shape.kind&&r.target===shape.target
  &&r.buildId===TEMPLATE_BUILD_ID&&r.bytes instanceof Uint8Array&&r.bytes.byteLength>0&&r.bytes.byteLength<=128*1024*1024
  &&r.treeCount===16&&r.clipCount===30&&typeof r.fileName==='string'&&r.fileName.endsWith('.unitypackage');
export const resultBytes=r=>r?.bytes instanceof Uint8Array?r.bytes.byteLength+512:0;
export const freezeTaskResult=r=>Object.freeze(r);
export const transferTaskInput=()=>[];
export const transferTaskResult=r=>r?.bytes instanceof Uint8Array?[r.bytes.buffer]:[];
export const prepareTaskModule=async()=>null;
export const instantiateTask=()=>null;
export async function executeTask(request){
  const response=await fetch(new URL('../../parameter-template/template.json',import.meta.url));
  if(!response.ok)throw new Error(`Template HTTP ${response.status}`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==TEMPLATE_SHA256)throw new Error('Templateの版を確認できません。');
  const template=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  return {kind:'parameter-template-package',target:request.payload.target,...generatePackage(request.payload.target,{template})};
}
export const taskInputCount=()=>1;

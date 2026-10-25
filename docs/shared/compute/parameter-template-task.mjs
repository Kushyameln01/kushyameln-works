import {generateTemplate,validateTarget,isTemplateResult,API_VERSION} from '../../parameter-template/api.mjs';

export const isTemplateTask=type=>type==='parameter-template-generate';
const encoder=new TextEncoder();
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
export const kernelInfo=()=>({requiresWasm:false,retainResult:false,sha256:null,variant:'javascript',abi:`parameter-template-api-${API_VERSION}`,key:`parameter-template-api-${API_VERSION}`});
export const resultShape=r=>({kind:'parameter-template-package',target:r.payload.target});
export const validTaskResult=(taskType,shape,r)=>isTemplateTask(taskType)&&r?.kind===shape.kind&&isTemplateResult(r,{target:shape.target});
export const resultBytes=r=>r?.bytes instanceof Uint8Array?r.bytes.byteLength+512:0;
export const freezeTaskResult=r=>Object.freeze(r);
export const transferTaskInput=()=>[];
export const transferTaskResult=r=>r?.bytes instanceof Uint8Array?[r.bytes.buffer]:[];
export const prepareTaskModule=async()=>null;
export const instantiateTask=()=>null;
export async function executeTask(request){
  return {kind:'parameter-template-package',...await generateTemplate(request.payload.target)};
}
export const taskInputCount=()=>1;

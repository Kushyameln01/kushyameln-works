import {generateVisemeTemplate,validateMeshName,isVisemeResult} from '../../viseme-template/api.mjs';
import {prepareKernelModule,instantiateKernel} from './kernel.mjs';
import {WASM_SHA256} from './protocol.mjs';

export const isVisemeTask=type=>type==='viseme-template-generate';
export function inspectTaskRequest(r){
  if(!r||r.protocolVersion!==1||r.taskVersion!==1||!isVisemeTask(r.taskType)||typeof r.jobId!=='string'||!/^[A-Za-z0-9_.:-]{1,64}$/.test(r.jobId)||!Number.isSafeInteger(r.inputRevision)||r.inputRevision<0)throw TypeError('Invalid Viseme task identity');
  const meshName=r.payload?.meshName??'Body';validateMeshName(meshName);
  const timeoutMs=r.limits?.timeoutMs??30000;
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw RangeError('Invalid Viseme task timeout');
  return {protocolVersion:1,taskType:r.taskType,taskVersion:1,jobId:r.jobId,inputRevision:r.inputRevision,
    wasmVariant:'scalar',kernelHash:WASM_SHA256,payload:{meshName},limits:{timeoutMs}};
}
export const snapshotTaskRequest=r=>({...r,payload:{meshName:r.payload.meshName}});
export const inputBytes=r=>new TextEncoder().encode(r.payload.meshName).length;
export const kernelInfo=()=>({requiresWasm:true,retainResult:false,sha256:WASM_SHA256,variant:'scalar',abi:'ft-v1',key:`ft-v1:${WASM_SHA256}:scalar`});
export const resultShape=r=>({kind:'viseme-template-package',meshName:r.payload.meshName});
export const validTaskResult=(type,shape,r)=>isVisemeTask(type)&&r?.kind===shape.kind&&isVisemeResult(r,{meshName:shape.meshName});
export const resultBytes=r=>r?.bytes instanceof Uint8Array?r.bytes.length+new TextEncoder().encode(JSON.stringify({...r,bytes:null})).length:0;
export const freezeTaskResult=r=>Object.freeze(r);
export const transferTaskInput=()=>[];
export const transferTaskResult=r=>r?.bytes instanceof Uint8Array?[r.bytes.buffer]:[];
export const prepareTaskModule=prepareKernelModule;
export const instantiateTask=(_r,module)=>instantiateKernel(module);
export const executeTask=async(r,kernel)=>({kind:'viseme-template-package',...await generateVisemeTemplate(r.payload.meshName,{kernel})});
export const taskInputCount=()=>1;

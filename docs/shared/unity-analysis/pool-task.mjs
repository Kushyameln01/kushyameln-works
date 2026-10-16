import {inspectSnapshot,bytes,freezeDeep,LIMITS} from './model.mjs';
import {analyzeSnapshot,compareSnapshots} from './analysis.mjs';
import {UNITY_KERNEL} from './kernel/registry.mjs';
import {prepareUnityKernel,instantiateUnityKernel} from './kernel/kernel.mjs';
export const isUnity=t=>t==='unity-analyze'||t==='unity-diff';
export function inspectTaskRequest(r){
 if(!r||r.protocolVersion!==1||!isUnity(r.taskType)||r.taskVersion!==1||typeof r.jobId!=='string'||!/^[A-Za-z0-9_.:-]{1,64}$/.test(r.jobId)||!Number.isSafeInteger(r.inputRevision)||r.inputRevision<0)throw TypeError('Invalid Unity task identity');
 const timeoutMs=r.limits?.timeoutMs??30000;if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw RangeError('Invalid Unity task timeout');
 if(r.taskType==='unity-analyze')inspectSnapshot(r.payload);else{inspectSnapshot(r.payload?.before);inspectSnapshot(r.payload?.after);}
 if(bytes(r.payload)>LIMITS.maxInputBytes*(r.taskType==='unity-diff'?2:1))throw RangeError('Unity task input budget');
 return {protocolVersion:1,taskType:r.taskType,taskVersion:1,jobId:r.jobId,inputRevision:r.inputRevision,wasmVariant:'scalar',kernelHash:UNITY_KERNEL.sha256,payload:r.payload,limits:{timeoutMs}};
}
export const snapshotTaskRequest=r=>({...r,payload:structuredClone(r.payload)});
export const inputBytes=r=>bytes(r.payload);
export const kernelInfo=()=>({...UNITY_KERNEL,requiresWasm:true});
export const resultShape=r=>({kind:r.taskType==='unity-diff'?'unity-diff':'unity-analysis',snapshotId:r.payload.snapshotId??'snapshot'});
export function validTaskResult(taskType,shape,result){return !!(result&&result.kind===shape.kind&&result.completeness?.truncated===false&&Number.isSafeInteger(result.completeness.totalCount)&&result.completeness.totalCount===result.completeness.returnedCount&&bytes(result)<=LIMITS.maxReportBytes&&(taskType==='unity-analyze'?result.snapshotId===shape.snapshotId&&Array.isArray(result.findings)&&Array.isArray(result.references)&&Array.isArray(result.shared)&&result.findings.length===result.completeness.totalCount:Array.isArray(result.changes)&&result.changes.length===result.completeness.totalCount));}
export const resultBytes=r=>r?bytes(r):0;
export const freezeTaskResult=freezeDeep;
export const transferTaskInput=()=>[];
export const transferTaskResult=()=>[];
export const prepareTaskModule=prepareUnityKernel;
export const instantiateTask=(r,module)=>instantiateUnityKernel(module);
export function executeTask(r,kernel){const result=r.taskType==='unity-analyze'?analyzeSnapshot(r.payload,kernel):compareSnapshots(r.payload.before,r.payload.after,kernel);if(bytes(result)>LIMITS.maxReportBytes)throw RangeError('Unity report output budget');return result;}
export const taskInputCount=r=>r.taskType==='unity-analyze'?r.payload.files.reduce((n,f)=>n+f.objects.length,0):r.payload.before.files.length+r.payload.after.files.length;

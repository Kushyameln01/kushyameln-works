import {KNOWLEDGE_KERNEL} from './kernel/registry.mjs';
import {validateStep,compareRecord,prepareKnowledgeKernel,instantiateKnowledgeKernel,MAX_INPUT_BYTES,MAX_OUTPUT_BYTES} from './kernel/kernel.mjs';
export const isKnowledge=t=>t==='knowledge-index-step';
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(v);
const identityKeys=['datasetVersion','algorithmVersion','inputHash','configHash','tokenTableHash','shardId','segmentId'];
const metaBytes=p=>new TextEncoder().encode(JSON.stringify(Object.fromEntries(identityKeys.map(k=>[k,p[k]])))).length+80;
export const inputBytes=r=>r.payload.records.length*12+metaBytes(r.payload);
export function inspectTaskRequest(r){
 if(!r||r.protocolVersion!==1||!isKnowledge(r.taskType)||r.taskVersion!==1||typeof r.jobId!=='string'||!/^[A-Za-z0-9_.:-]{1,64}$/.test(r.jobId)||!Number.isSafeInteger(r.inputRevision)||r.inputRevision<0)throw TypeError('Invalid knowledge task identity');
 const timeoutMs=r.limits?.timeoutMs??30000;if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw RangeError('Invalid knowledge timeout');
 const p=validateStep(r.payload);
 if(!id(p.datasetVersion)||p.algorithmVersion!==1||!['inputHash','configHash','tokenTableHash'].every(k=>hash(p[k]))||!id(p.shardId)||!(id(p.segmentId)||(Number.isSafeInteger(p.segmentId)&&p.segmentId>=0)))throw TypeError('Invalid knowledge dataset identity');
 const request={protocolVersion:1,taskType:r.taskType,taskVersion:1,jobId:r.jobId,inputRevision:r.inputRevision,wasmVariant:'scalar',kernelHash:KNOWLEDGE_KERNEL.sha256,payload:{...Object.fromEntries(identityKeys.map(k=>[k,p[k]])),records:p.records,cursor:p.cursor,state:p.state?{termId:p.state.termId,docId:p.state.docId,fieldId:p.state.fieldId,count:p.state.count}:null,final:p.final,outputCapacity:p.outputCapacity},limits:{timeoutMs}};
 if(inputBytes(request)>MAX_INPUT_BYTES)throw RangeError('Knowledge input budget');return request;
}
export const snapshotTaskRequest=r=>({...r,payload:{...r.payload,records:r.payload.records.map(x=>x.slice()),state:r.payload.state?{...r.payload.state}:null}});
export const kernelInfo=()=>({...KNOWLEDGE_KERNEL,requiresWasm:true,retainResult:false});
export const resultShape=r=>({...Object.fromEntries(identityKeys.map(k=>[k,r.payload[k]])),cursor:r.payload.cursor,length:r.payload.records.length,final:r.payload.final,capacity:r.payload.outputCapacity,previousCount:r.payload.state?.count??0});
export function validTaskResult(t,s,r){
 if(!isKnowledge(t)||!r||r.kind!=='knowledge-index-step'||!identityKeys.every(k=>r[k]===s[k])||!Number.isInteger(r.consumed)||r.consumed<0||r.consumed>s.length||r.nextCursor!==s.cursor+r.consumed||typeof r.done!=='boolean'||typeof r.outputFull!=='boolean'||!Array.isArray(r.postings)||r.postings.length>s.capacity||resultBytes(r)>MAX_OUTPUT_BYTES)return false;
 try{validateStep({records:[],cursor:r.nextCursor,state:r.state,final:r.done,outputCapacity:s.capacity});}catch{return false;}
 if(r.state===undefined||(r.consumed<s.length&&!r.outputFull)||(r.outputFull&&(r.postings.length!==s.capacity||r.state===null)))return false;
 if(r.postings.reduce((n,p)=>n+(Array.isArray(p)?p[3]:NaN),0)+(r.state?.count??0)!==s.previousCount+r.consumed)return false;
 if(r.done&&(!s.final||r.consumed!==s.length||r.state!==null||r.outputFull))return false;
 if(!r.done&&s.final&&r.consumed===s.length&&r.state===null)return false;
 let previous=null;for(const p of r.postings){if(!Array.isArray(p)||p.length!==4||!p.every(v=>Number.isInteger(v)&&v>=0&&v<=2147483647)||p[3]===0||(previous&&compareRecord(previous,p)>=0))return false;previous=p;}
 if(previous&&r.state&&compareRecord(previous,[r.state.termId,r.state.docId,r.state.fieldId])>=0)return false;
 return true;
}
export const resultBytes=r=>r?(r.postings?.length??0)*16+metaBytes(r):0;
export function freezeTaskResult(r){if(!r)return r;for(const p of r.postings??[])Object.freeze(p);if(r.postings)Object.freeze(r.postings);if(r.state)Object.freeze(r.state);return Object.freeze(r);}
export const transferTaskInput=()=>[];
export const transferTaskResult=()=>[];
export const prepareTaskModule=prepareKnowledgeKernel;
export const instantiateTask=(r,m)=>instantiateKnowledgeKernel(m);
export function executeTask(r,kernel){const result={kind:'knowledge-index-step',...Object.fromEntries(identityKeys.map(k=>[k,r.payload[k]])),...kernel.step(r.payload)};if(!validTaskResult(r.taskType,resultShape(r),result))throw Error('Invalid knowledge result');return result;}
export const taskInputCount=r=>r.payload.records.length;

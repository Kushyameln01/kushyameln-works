// Deployment registry: existing task set plus the shared Unity adapter.
import * as base from './registered-tasks.mjs';
import * as unity from '../unity-analysis/pool-task.mjs';
import * as ingest from '../unity-analysis/ingest-task.mjs';
// Keep the Sites task registry's existing public limit without adding a media dependency on Pages.
export const MAX_MEDIA_INPUT_BYTES=Reflect.get(base,'MAX_MEDIA_INPUT_BYTES');
const adapter=r=>ingest.isIngest(typeof r==='string'?r:r?.taskType)?ingest:unity.isUnity(typeof r==='string'?r:r?.taskType)?unity:base;
const resultAdapter=r=>['unity-expanded','unity-parsed','unity-parsed-batch'].includes(r?.kind)?ingest:r?.kind?.startsWith('unity-')?unity:base;
export const inspectTaskRequest=r=>adapter(r).inspectTaskRequest(r);
export const snapshotTaskRequest=r=>adapter(r).snapshotTaskRequest(r);
export const inputBytes=r=>adapter(r).inputBytes(r);
export const kernelInfo=r=>adapter(r).kernelInfo(r);
export const resultShape=r=>adapter(r).resultShape(r);
export const validTaskResult=(t,s,r)=>adapter(t).validTaskResult(t,s,r);
export const resultBytes=r=>resultAdapter(r).resultBytes(r);
export const freezeTaskResult=r=>resultAdapter(r).freezeTaskResult(r);
export const transferTaskInput=r=>adapter(r).transferTaskInput(r);
export const transferTaskResult=r=>resultAdapter(r).transferTaskResult(r);
export const prepareTaskModule=o=>adapter(o).prepareTaskModule(o);
export const instantiateTask=(r,m)=>adapter(r).instantiateTask(r,m);
export const executeTask=(r,k)=>adapter(r).executeTask(r,k);
export const taskInputCount=(r,v)=>adapter(r).taskInputCount(r,v);

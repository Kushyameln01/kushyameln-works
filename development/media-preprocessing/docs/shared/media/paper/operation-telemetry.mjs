import {makeOperationEvent} from '../telemetry.mjs';
import {MEDIA_KERNEL_IDENTITIES} from '../kernel/identities.mjs';
import {PAPER_KERNEL_IDENTITY} from './identities.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KINDS=Object.freeze({started:'start',completed:'complete',failed:'failed',cancelled:'cancelled'});
const METHODS=Object.freeze({'svd-diagonal-v1':'svd-diagonal-v1','paper-alg2-diagonal-v1':'alg2-diagonal-v1'});
const ERRORS=['input_invalid','unsupported','budget_exceeded','kernel_error','timeout','internal'];
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=3600000;

// Multi-operation observer with no retained event/input/model/operation map.
// SDK owns one start + terminal; sender and collector own stable-ID/phase dedup.
export function createPaperOperationTelemetry({client}={}){
  if(typeof client?.enqueue!=='function')throw TypeError('INVALID_TELEMETRY_OPTIONS');
  let observed=0,enqueued=0,skipped=0,disposed=false;const reasons={};
  function skip(reason){skipped++;reasons[reason]=(reasons[reason]??0)+1;return false;}
  function onEvent(value){
    observed++;
    if(disposed)return skip('disposed');
    try{
      if(!value||typeof value.operationId!=='string'||!UUID.test(value.operationId))return skip('operation_id');
      const kind=Object.hasOwn(KINDS,value.type)?KINDS[value.type]:null;
      if(!kind)return skip('event_type');
      if(value.workerCount===null)return skip('workers_unknown');
      if(typeof value.eventId!=='string'||!UUID.test(value.eventId)||value.buildId!=='media-foundation-b2'||value.taskVersion!==1||![1,2,3,4].includes(value.workerCount)||!finite(value.elapsedMs))return skip('event_schema');
      let task,hash;const variant=value.wasmVariant;
      if(value.taskFamily==='paper-preprocess'){
        if(value.method!=='lbp3x3'||!['scalar','simd'].includes(variant))return skip('event_schema');
        task='paper-preprocess';hash=MEDIA_KERNEL_IDENTITIES[variant].sha256;
      }else if(['paper-fit','paper-infer'].includes(value.taskFamily)){
        if(variant!=='scalar')return skip('event_schema');
        if(value.method==='unselected'){if(kind==='complete')return skip('method_unknown');task=value.taskFamily;}
        else if(Object.hasOwn(METHODS,value.method))task=`${value.taskFamily}-${METHODS[value.method]}`;
        else return skip('event_schema');
        hash=PAPER_KERNEL_IDENTITY.sha256;
      }else return skip('event_schema');
      if(value.kernelHash!==hash||!['unknown','lt1mp','1to4mp','4to16mp','gte16mp'].includes(value.sizeBand)||(kind==='complete'&&value.sizeBand==='unknown')||(kind==='failed'?!ERRORS.includes(value.errorCode):value.errorCode!==null))return skip('event_schema');
      const durationsMs=kind==='start'?{}:{total:value.elapsedMs};
      for(const key of ['queue','compute']){const v=value.durationsMs?.[key];if(v!==null&&!finite(v))return skip('event_schema');if(kind==='start'){if(v!==null)return skip('event_schema');}else if(v!==null)durationsMs[key]=v;}
      const event=makeOperationEvent({eventId:value.eventId,operationId:value.operationId,kind,task,build:value.buildId,variant,workers:value.workerCount,sizeBand:value.sizeBand,cacheState:'unknown',errorCode:value.errorCode,durationsMs});
      if(!client.enqueue(event))return skip('sender_rejected');enqueued++;return true;
    }catch{return skip('adapter_error');}
  }
  return Object.freeze({onEvent,status:()=>Object.freeze({observed,enqueued,skipped,disposed,reasons:Object.freeze({...reasons})}),dispose(){disposed=true;}});
}

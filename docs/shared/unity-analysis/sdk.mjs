import {createComputePool} from '../compute/client.mjs';
import {BUILD_ID} from '../compute/protocol.mjs';
import {inspectSnapshot,REPORT_SCHEMA,ANALYZER_VERSION,RULES_VERSION,freezeDeep,bytes,LIMITS,canonical} from './model.mjs';
import {UNITY_KERNEL} from './kernel/registry.mjs';
export function createUnityAnalyzer({pool,concurrency=2,moduleReuse=false,workerMode='module'}={}){
 const ownsPool=!pool;pool??=createComputePool({concurrency,moduleReuse,workerMode});const sessions=new Map();let disposed=false,sequence=0;
 function cancel(sessionId){const s=sessions.get(sessionId);if(!s||s.done)return false;s.cancelled=true;for(const id of s.jobs)pool.cancel(id);return true;}
 function start(before,after,{inputRevision=0,timeoutMs=30000,sessionTimeoutMs=120000,sessionId=`ua-${crypto.randomUUID()}`}={}){
  if(disposed)throw Error('Analyzer is disposed');if(!Number.isSafeInteger(inputRevision)||inputRevision<0)throw TypeError('Invalid inputRevision');
  if(!Number.isSafeInteger(sessionTimeoutMs)||sessionTimeoutMs<1||sessionTimeoutMs>300000)throw RangeError('Session deadline must be 1..300000 ms');
  if(typeof sessionId!=='string'||!/^[A-Za-z0-9_.:-]{1,48}$/.test(sessionId)||sessions.has(sessionId))throw TypeError('Invalid/duplicate sessionId');
  inspectSnapshot(before);if(after)inspectSnapshot(after);
  if(sessions.size>=4){const finished=[...sessions].find(([,s])=>s.done);if(finished)sessions.delete(finished[0]);else throw RangeError('At most four analyzer sessions');}
  // Own immutable snapshot: caller edits cannot change a queued or compared input.
  before=structuredClone(before);after=after?structuredClone(after):null;
  const s={jobs:[],responses:[],cancelled:false,done:false,report:null};sessions.set(sessionId,s);const started=performance.now();
  const timer=setTimeout(()=>{s.deadline=true;cancel(sessionId);},sessionTimeoutMs);
  async function submit(taskType,payload){
   if(s.cancelled)throw Error(s.deadline?'SESSION_TIMEOUT':'CANCELLED');const jobId=`${sessionId}.${++sequence}`;
   const h=pool.submit({protocolVersion:1,taskType,taskVersion:1,jobId,inputRevision,payload,limits:{timeoutMs}});s.jobs.push(h.jobId);
   const res=await h.promise;s.responses.push(res);pool.releaseResult?.(res.jobId);
   if(s.cancelled||res.status==='cancelled')throw Error(s.deadline?'SESSION_TIMEOUT':'CANCELLED');
   if(res.status!=='succeeded')throw Error(res.errorCode+': '+(res.message??'Task failed'));
   if(res.inputRevision!==inputRevision||res.jobId!==jobId||res.buildId!==BUILD_ID||res.metrics?.wasmSha256!==UNITY_KERNEL.sha256)throw Error('RESULT_IDENTITY_MISMATCH');
   return res.result;
  }
  const promise=(async()=>{try{
   const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(x)))),v=>v.toString(16).padStart(2,'0')).join('');
   const inputs={before:{sha256:await hash(before),method:'canonical JSON UTF-8 SHA-256',representation:'structured snapshot'},...(after?{after:{sha256:await hash(after),method:'canonical JSON UTF-8 SHA-256',representation:'structured snapshot'}}:{})};
   const beforeResult=await submit('unity-analyze',before);let afterResult=null,diff=null;
   if(after){afterResult=await submit('unity-analyze',after);diff=await submit('unity-diff',{before,after});}
   if(s.cancelled)throw Error('CANCELLED');
   const report={schemaVersion:REPORT_SCHEMA,analyzerVersion:ANALYZER_VERSION,ruleSetVersion:RULES_VERSION,buildId:BUILD_ID,wasmHash:UNITY_KERNEL.sha256,sessionId,inputRevision,inputs,status:'succeeded',before:beforeResult,...(afterResult?{after:afterResult,diff}:{}),jobs:s.responses.map(({result,...r})=>r),metrics:{totalMs:performance.now()-started,logicalInputBytes:bytes(before)+(after?bytes(after):0)},completeness:{totalCount:beforeResult.findings.length+(afterResult?.findings.length??0)+(diff?.changes.length??0),returnedCount:beforeResult.findings.length+(afterResult?.findings.length??0)+(diff?.changes.length??0),truncated:false}};
   if(bytes(report)>LIMITS.maxReportBytes)throw RangeError('Report budget exceeded; no truncated export produced');
   s.report=freezeDeep(report);return s.report;
  }finally{clearTimeout(timer);s.done=true;for(const id of s.jobs){pool.cancel(id);pool.releaseResult?.(id);}s.responses=[];before=null;after=null;}})();
  promise.sessionId=sessionId;return promise;
 }
 return Object.freeze({analyze:(input,options)=>start(input,null,options),compare:(before,after,options)=>start(before,after,options),cancel,getReport:id=>sessions.get(id)?.report??null,
  dispose(sessionId){if(sessionId!==undefined){cancel(sessionId);sessions.delete(sessionId);return;}if(disposed)return;disposed=true;for(const id of sessions.keys())cancel(id);sessions.clear();if(ownsPool)pool.dispose();}});
}

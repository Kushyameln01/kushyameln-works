// Independent consumer of the public shared API; no scheduler internals.
import {createComputePool} from '../shared/compute/pool.mjs';
import {BUILD_ID,WASM_SHA256} from '../shared/compute/protocol.mjs';
import {prepareTaskModule} from '../shared/compute/tasks.mjs';
export const median=values=>{const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length?(sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2):null;};
const validTimes=values=>values.every(value=>Number.isFinite(value)&&value>=0);
export const chooseModuleReuse=(without,withReuse,lifecyclePassed)=>lifecyclePassed&&without.length===5&&withReuse.length===5&&validTimes(without)&&validTimes(withReuse)&&median(without)>0&&median(withReuse)<=median(without)*0.9;
const statistics=values=>({sampleCount:values.length,medianMs:validTimes(values)?median(values):null,minMs:values.length&&validTimes(values)?Math.min(...values):null,maxMs:values.length&&validTimes(values)?Math.max(...values):null});
const someVerified=values=>values.includes(true)?true:values.includes(null)?null:false;
const allVerified=values=>values.includes(false)?false:values.includes(null)?null:true;
const parallelVerdict=run=>run.overlap===null?null:run.correct&&run.overlap&&run.distinctWorkers>=2&&run.distinctInstances>=2;
const fullVerdict=run=>run.fullConcurrencyOverlapMs===null?null:run.correct&&run.fullConcurrencyOverlapMs>0;

// Half-open compute intervals. Reference counts keep repeated worker IDs from
// becoming multiple Workers; only positive-width segments contribute time.
function summarizeIntervals(jobs,concurrency){
  const events=[],issues=[];let zeroLengthIntervalCount=0;
  jobs.forEach((job,index)=>{
    const start=job.metrics?.computeStartEpochMs,end=job.metrics?.computeEndEpochMs,reasons=[];
    if(typeof job.workerId!=='string'||!job.workerId.length)reasons.push('missing_worker_id');
    if(!Number.isFinite(start))reasons.push('nonfinite_start');
    if(!Number.isFinite(end))reasons.push('nonfinite_end');
    if(Number.isFinite(start)&&Number.isFinite(end)&&end<start)reasons.push('end_before_start');
    if(reasons.length){issues.push({index,jobId:job.jobId??null,reasons});return;}
    if(start===end){zeroLengthIntervalCount++;return;}
    events.push({time:start,id:job.workerId,delta:1},{time:end,id:job.workerId,delta:-1});
  });
  const intervalValidation={status:issues.length?'NOT VERIFIED':'PASS',intervalCount:jobs.length,positiveIntervalCount:events.length/2,zeroLengthIntervalCount,invalidIntervalCount:issues.length,issues};
  if(issues.length)return{overlap:null,maxConcurrentWorkers:null,overlapDurationByConcurrency:null,fullConcurrencyOverlapMs:null,intervalValidation};
  events.sort((a,b)=>a.time-b.time||a.delta-b.delta);
  const active=new Map(),durations={'1':0,'2':0,'3':0,'4':0};let previous=null,maxConcurrentWorkers=0;
  for(const event of events){
    if(previous!==null&&event.time>previous&&active.size){
      durations[active.size]=(durations[active.size]??0)+event.time-previous;
      maxConcurrentWorkers=Math.max(maxConcurrentWorkers,active.size);
    }
    const count=(active.get(event.id)??0)+event.delta;
    if(count)active.set(event.id,count);else active.delete(event.id);
    previous=event.time;
  }
  return{overlap:maxConcurrentWorkers>=2,maxConcurrentWorkers,overlapDurationByConcurrency:durations,fullConcurrencyOverlapMs:durations[concurrency]??0,intervalValidation};
}
export function summarizeResults(results,expected,concurrency=2){
  const correct=results.length===expected.length&&results.every((r,i)=>r.status==='succeeded'&&Array.isArray(r.result)&&r.result.length===expected[i].length&&r.result.every((x,j)=>x===expected[i][j]));
  const jobs=results.map(({result,...r})=>({...r,resultCount:result?.length,checksum:result?.reduce((a,b)=>a+b,0)}));
  return{correct,...summarizeIntervals(jobs,concurrency),distinctWorkers:new Set(jobs.map(x=>x.workerId).filter(Boolean)).size,distinctInstances:new Set(jobs.map(x=>x.instanceId).filter(Boolean)).size,jobs};
}
export const environment=()=>({buildId:BUILD_ID,sourceCommit:null,sourceCommitNote:'配信側でcommitを取得できないため未取得。版別の配信照合記録と対応づける。',wasmSha256:WASM_SHA256,pageUrl:globalThis.location?.href??null,deliveryOrigin:globalThis.location?.origin??null,userAgent:globalThis.navigator?.userAgent??null,platform:globalThis.navigator?.platform??null,hardwareConcurrency:globalThis.navigator?.hardwareConcurrency??null,cacheState:'unknown',memoryMeasurement:null,execution:'current browser session',intervalClock:'performance.timeOrigin + performance.now()',timingPrecision:'browser-dependent; not measured'});
const make=(masks=[0,3,5],limits)=>({protocolVersion:1,jobId:crypto.randomUUID(),inputRevision:0,taskType:'ft-magnitude-batch',taskVersion:1,payload:{masks,weights:[1,2,4]},...(limits?{limits}:{})});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),x=>x.toString(16).padStart(2,'0')).join('');
function guard(ctx){if(!ctx.isCurrent())throw Error('検証は取り消されました');}
function open(ctx,options){guard(ctx);const pool=(ctx.createPool??createComputePool)({...options,onUpdate:s=>{if(ctx.isCurrent())ctx.onProgress?.(s);options.onUpdate?.(s);}});ctx.onPool(pool);return pool;}
const clock=ctx=>ctx.now?.()??performance.now();
const timingDefinition='request作成後・submit呼出し直前→返却Promiseのawait直後。guard・正答検査・整形・表示は含めない。ジョブtotalMsとは別。';
export async function runPreparedComparison(ctx){
  const masks=Array.from({length:262144},(_,i)=>i%8),inputHash=await hash({masks,weights:[1,2,4]});guard(ctx);
  const runs=[],orderPlan=[[2,4],[4,2]];
  for(const [blockIndex,order] of orderPlan.entries())for(const [orderIndex,concurrency] of order.entries()){
    const pool=open(ctx,{concurrency,moduleReuse:false}),results=[],waves=[];
    try{
      for(let offset=0;offset<4;offset+=concurrency){
        guard(ctx);const requests=Array.from({length:concurrency},()=>make(masks)),start=clock(ctx);
        const group=await pool.submitBatch(requests,{startTogether:true}).promise;
        const callerElapsedMs=clock(ctx)-start;guard(ctx);
        waves.push({waveIndex:waves.length,callerElapsedMs,...summarizeResults(group,Array(concurrency).fill(masks),concurrency)});results.push(...group);
      }
      runs.push({blockIndex,orderIndex,concurrency,startTogether:true,apiElapsedSumMs:waves.reduce((sum,wave)=>sum+wave.callerElapsedMs,0),waves,...summarizeResults(results,Array(4).fill(masks),concurrency),resources:pool.getStatus()});
      ctx.onPartial?.({kind:'prepared-parallel-capability',completed:runs.length,total:4});
    }finally{pool.dispose();}
  }
  return{schemaVersion:2,kind:'prepared-parallel-capability',environment:environment(),timingDefinition,inputHash,inputCountPerJob:masks.length,jobCountPerRun:4,orderPlan,startTogether:true,moduleReuse:false,runs,correct:runs.every(r=>r.correct),parallelVerified:allVerified(runs.map(parallelVerdict)),fullConcurrencyVerified:allVerified(runs.flatMap(r=>r.waves.map(fullVerdict))),note:'各波は準備後に開始。apiElapsedSumMsはAPI区間の合計で、連続した壁時計時間ではない。readyWaitMsはcomputeMsに含めない。通常性能比較とは別の能力確認。'};
}
export async function runComparison(ctx){
  const masks=Array.from({length:262144},(_,i)=>i%8),payload={masks,weights:[1,2,4]},inputHash=await hash(payload);guard(ctx);
  const runs=[],orderPlan=[[1,2,4],[1,4,2],[2,1,4],[2,4,1],[4,1,2],[4,2,1]];
  for(const [blockIndex,order] of orderPlan.entries())for(const [orderIndex,concurrency] of order.entries()){
    guard(ctx);const pool=open(ctx,{concurrency,moduleReuse:false});
    try{
      const requests=Array.from({length:4},()=>make(masks)),start=clock(ctx);
      const results=await pool.submitBatch(requests).promise;
      const callerElapsedMs=clock(ctx)-start;guard(ctx);
      runs.push({blockIndex,orderIndex,concurrency,callerElapsedMs,...summarizeResults(results,Array(4).fill(masks),concurrency),resources:pool.getStatus()});
      ctx.onPartial?.({kind:'parallel-comparison',completed:runs.length,total:18});
    }finally{pool.dispose();}
  }
  const summary=[1,2,4].map(concurrency=>{const rows=runs.filter(r=>r.concurrency===concurrency);return{concurrency,...statistics(rows.map(r=>r.callerElapsedMs)),firstObservedMs:rows[0].callerElapsedMs,subsequent:statistics(rows.slice(1).map(r=>r.callerElapsedMs)),allCorrect:rows.every(r=>r.correct),overlapObserved:someVerified(rows.map(r=>r.overlap)),fullConcurrencyObserved:someVerified(rows.map(fullVerdict))};});
  const correct=runs.every(r=>r.correct),performanceComparable=correct&&validTimes(runs.map(r=>r.callerElapsedMs))&&summary[0].medianMs>0;
  const performanceComparisonReason=performanceComparable?null:!correct?'全試行の正答が揃っていないため、速度比較は未成立です。失敗を含む生の時間と結果は保持しています。':'有効な計測時間と正の基準中央値が揃っていないため、速度比較は未成立です。';
  for(const row of summary)row.reductionVsOneWorkerPercent=performanceComparable?(1-row.medianMs/summary[0].medianMs)*100:null;
  return{schemaVersion:2,kind:'parallel-comparison',environment:environment(),timingDefinition,inputHash,jobCountPerRun:4,inputCountPerJob:masks.length,orderPlan,moduleReuse:false,startTogether:false,runs,summary,correct,performanceComparable,performanceComparisonReason,parallelVerified:someVerified(runs.filter(r=>r.concurrency>=2).map(parallelVerdict)),note:'順序を均等化した6試行。初回をcoldとは呼ばず、この試行数で統計的確実性を保証しない。並行性と時間短縮は別判定。'};
}
export async function runModuleComparison(ctx,lifecyclePassed=false){
  const masks=Array.from({length:8192},(_,i)=>i%8),inputHash=await hash({masks,weights:[1,2,4]});guard(ctx);
  const blocks=[],orderPlan=[[false,true],[true,false]];
  for(const [blockIndex,order] of orderPlan.entries()){
    const modes=[];
    for(const [orderIndex,moduleReuse] of order.entries()){
      const pool=open(ctx,{concurrency:1,moduleReuse}),runs=[];
      try{
        for(let iteration=0;iteration<6;iteration++){
          guard(ctx);const request=make(masks),start=clock(ctx);
          const result=await pool.submit(request).promise;
          const callerElapsedMs=clock(ctx)-start;guard(ctx);
          runs.push({iteration,callerElapsedMs,...summarizeResults([result],[masks],1)});
        }
        modes.push({orderIndex,moduleReuse,runs,firstObservedMs:runs[0].callerElapsedMs,subsequent:statistics(runs.slice(1).map(r=>r.callerElapsedMs)),resources:pool.getStatus()});
      }finally{pool.dispose();}
    }
    const allCorrect=modes.every(m=>m.runs.every(r=>r.correct)),without=modes.find(m=>!m.moduleReuse),withReuse=modes.find(m=>m.moduleReuse);
    blocks.push({blockIndex,order,modes,allCorrect,recommendReuse:chooseModuleReuse(without.runs.slice(1).map(r=>r.callerElapsedMs),withReuse.runs.slice(1).map(r=>r.callerElapsedMs),lifecyclePassed&&allCorrect)});
    ctx.onPartial?.({kind:'module-comparison',completed:blocks.length,total:2});
  }
  return{schemaVersion:2,kind:'module-comparison',environment:environment(),timingDefinition,inputHash,inputCountPerJob:masks.length,concurrency:1,startTogether:false,orderPlan,blocks,allCorrect:blocks.every(b=>b.allCorrect),lifecyclePassed,recommendReuse:blocks.every(b=>b.recommendReuse),defaultRemains:false,criterion:'off→onとon→offの両ブロックで、後続5回のcallerElapsedMs中央値が各10%以上短縮し、同一結果と両方式の取消・復帰が合格した場合のみ採用候補。既定値は変更しない。'};
}
// Fixed fixtures only. Use the existing dependency seam, then the real reviewed
// WASM loader and Worker route; this is not an arbitrary-code input interface.
export async function runPreparationRecovery(ctx){
  const matches=(result,request)=>['protocolVersion','jobId','inputRevision','taskType','taskVersion'].every(key=>result[key]===request[key])&&Number.isSafeInteger(result.generation)&&result.generation>0;
  let timeoutAndRetry,sharedSurvivor;
  {
    let attempts=0;const signals=[];
    const pool=open(ctx,{concurrency:2,moduleReuse:true,prepareModule:options=>{
      attempts++;signals.push(options.signal);
      return attempts===1?new Promise(()=>{}):prepareTaskModule(options);
    }});
    try{
      const timeoutRequest=make([0,3,5],{timeoutMs:40});
      const timed=await pool.submit(timeoutRequest).promise;guard(ctx);
      const recoveryRequest=make(),recovery=await pool.submit(recoveryRequest).promise;guard(ctx);
      const resources=pool.getStatus();
      const checks={timedOut:timed.errorCode==='TIMEOUT',timedIdentity:matches(timed,timeoutRequest),abortedOldPreparation:signals[0]?.aborted===true,reprepared:attempts===2,recoveryCorrect:matches(recovery,recoveryRequest)&&summarizeResults([recovery],[[0,3,5]],1).correct,outstandingCleared:resources.outstanding===0&&resources.inputBytes===0};
      timeoutAndRetry={attempts,checks,passed:Object.values(checks).every(Boolean),timed,recovery,resources};
    }finally{pool.dispose();}
    timeoutAndRetry.afterDispose=pool.getStatus();
  }
  ctx.onPartial?.({kind:'preparation-recovery',completed:1,total:2});
  {
    let attempts=0,signal,release,started;
    const preparationStarted=new Promise(resolve=>{started=resolve;});
    const pool=open(ctx,{concurrency:2,moduleReuse:true,prepareModule:options=>{
      attempts++;signal=options.signal;started(true);
      return new Promise((resolve,reject)=>{release=()=>{prepareTaskModule(options).then(resolve,reject);};});
    }});
    try{
      const a=make(),b=make(),batch=pool.submitBatch([a,b]);
      const began=await Promise.race([preparationStarted,batch.promise.then(()=>false)]);guard(ctx);
      if(!began)throw Error('固定診断のModule準備開始を確認できませんでした');
      const cancelled=pool.cancel(a.jobId),survivorProtected=signal?.aborted===false;
      release();
      const results=await batch.promise;guard(ctx);
      const resources=pool.getStatus();
      const checks={cancelled:cancelled&&results[0].errorCode==='CANCELLED'&&matches(results[0],a),survivorProtected,sharedPreparation:attempts===1,survivorCorrect:matches(results[1],b)&&summarizeResults([results[1]],[[0,3,5]],1).correct,outstandingCleared:resources.outstanding===0&&resources.inputBytes===0};
      sharedSurvivor={attempts,checks,passed:Object.values(checks).every(Boolean),results,resources};
    }finally{pool.dispose();}
    sharedSurvivor.afterDispose=pool.getStatus();
  }
  return{schemaVersion:2,kind:'preparation-recovery',environment:environment(),timeoutAndRetry,sharedSurvivor,passed:timeoutAndRetry.passed&&sharedSurvivor.passed,note:'固定未決準備→個別40ms timeout→明示再投入と、同keyの一方取消→生存ジョブの実WASM回収を検査。準備自体の30秒期限は疑似時計の単体検査で別に確認する。'};
}
export async function runLifecycle(ctx){
  const modes=[];
  for(const moduleReuse of [false,true]){
    const a=make(Array.from({length:262144},(_,i)=>i%8)),b=make(),c=make();let activeCancelled=false;
    const pool=open(ctx,{concurrency:1,moduleReuse,onUpdate:s=>{if(s.jobId===a.jobId&&s.phase==='computing')activeCancelled=pool.cancel(a.jobId);}});
    try{
      const batch=pool.submitBatch([a,b,c]);const queuedCancelled=pool.cancel(c.jobId);const initial=await batch.promise;guard(ctx);
      const timed=await pool.submit(make([0,3,5],{timeoutMs:1})).promise;guard(ctx);
      const recovery=await pool.submit(make()).promise;guard(ctx);
      let invalidRejected=false;try{pool.submit({...make(),taskType:'unknown'});}catch{invalidRejected=true;}
      const snapshots=[];for(let i=0;i<18;i++){guard(ctx);const r=await pool.submit(make(i%2?[]:[0])).promise;guard(ctx);if(r.status!=='succeeded')throw Error('反復計算に失敗');snapshots.push(pool.getStatus());}
      const pending=pool.submitBatch([make(),make()]);pool.dispose();const disposed=await pending.promise;guard(ctx);
      let disposedRejected=false;try{pool.submit(make());}catch{disposedRejected=true;}
      const checks={activeCancelled:activeCancelled&&initial[0].status==='cancelled',queuedCancelled:queuedCancelled&&initial[2].status==='cancelled',survivorCorrect:summarizeResults([initial[1]],[[0,3,5]]).correct,timeout:timed.errorCode==='TIMEOUT',recoveryCorrect:summarizeResults([recovery],[[0,3,5]]).correct,invalidRejected,bounded:snapshots.every(s=>s.outstanding===0&&s.inputBytes===0&&s.retainedCount<=16&&s.retainedBytes<=8388608),disposedSettled:disposed.every(r=>r.status==='cancelled'),disposedRejected,disposedCleared:pool.getStatus().retainedCount===0&&pool.getStatus().inputBytes===0};
      modes.push({moduleReuse,checks,passed:Object.values(checks).every(Boolean),initial:initial.map(({result,...r})=>r),timeout:timed,recovery,snapshots,afterDispose:pool.getStatus()});
      ctx.onPartial?.({kind:'lifecycle',completed:modes.length,total:2});
    }finally{pool.dispose();}
  }
  return{kind:'lifecycle',environment:environment(),modes,passed:modes.every(m=>m.passed),memoryNote:'保持件数と論理byte上限の検査。JSヒープやGC解放時刻は未測定。'};
}

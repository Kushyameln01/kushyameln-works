// Independent consumer of the public shared API; no scheduler internals.
import {createComputePool} from '../shared/compute/pool.mjs';
import {BUILD_ID,WASM_SHA256} from '../shared/compute/protocol.mjs';
export const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
export const chooseModuleReuse=(without,withReuse,lifecyclePassed)=>lifecyclePassed&&without.length===5&&withReuse.length===5&&median(withReuse)<=median(without)*0.9;
export function summarizeResults(results,expected){
  const correct=results.length===expected.length&&results.every((r,i)=>r.status==='succeeded'&&Array.isArray(r.result)&&r.result.length===expected[i].length&&r.result.every((x,j)=>x===expected[i][j]));
  const jobs=results.map(({result,...r})=>({...r,resultCount:result?.length,checksum:result?.reduce((a,b)=>a+b,0)}));
  let overlap=false;
  for(let i=0;i<jobs.length;i++)for(let j=i+1;j<jobs.length;j++){
    const a=jobs[i],b=jobs[j];
    if(a.workerId&&b.workerId&&a.workerId!==b.workerId&&Number.isFinite(a.metrics?.computeStartEpochMs)&&Number.isFinite(b.metrics?.computeStartEpochMs)&&Math.max(a.metrics.computeStartEpochMs,b.metrics.computeStartEpochMs)<Math.min(a.metrics.computeEndEpochMs,b.metrics.computeEndEpochMs))overlap=true;
  }
  return{correct,overlap,distinctWorkers:new Set(jobs.map(x=>x.workerId).filter(Boolean)).size,distinctInstances:new Set(jobs.map(x=>x.instanceId).filter(Boolean)).size,jobs};
}
export const environment=()=>({buildId:BUILD_ID,wasmSha256:WASM_SHA256,userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,cacheState:'unknown',memoryMeasurement:null,execution:'current browser session'});
const make=(masks=[0,3,5],limits)=>({protocolVersion:1,jobId:crypto.randomUUID(),inputRevision:0,taskType:'ft-magnitude-batch',taskVersion:1,payload:{masks,weights:[1,2,4]},...(limits?{limits}:{})});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),x=>x.toString(16).padStart(2,'0')).join('');
function guard(ctx){if(!ctx.isCurrent())throw Error('検証は取り消されました');}
function open(ctx,options){guard(ctx);const pool=(ctx.createPool??createComputePool)({...options,onUpdate:s=>{if(ctx.isCurrent())ctx.onProgress?.(s);options.onUpdate?.(s);}});ctx.onPool(pool);return pool;}
export async function runPreparedComparison(ctx){
  const masks=Array.from({length:262144},(_,i)=>i%8),inputHash=await hash({masks,weights:[1,2,4]});guard(ctx);const runs=[];
  for(const concurrency of [2,4]){
    const pool=open(ctx,{concurrency,moduleReuse:false}),results=[],start=performance.now();
    try{for(let offset=0;offset<4;offset+=concurrency){guard(ctx);const group=await pool.submitBatch(Array.from({length:concurrency},()=>make(masks)),{startTogether:true}).promise;guard(ctx);results.push(...group);}runs.push({concurrency,totalMs:performance.now()-start,startTogether:true,...summarizeResults(results,Array(4).fill(masks)),resources:pool.getStatus()});}
    finally{pool.dispose();}
  }
  return{kind:'prepared-parallel-capability',environment:environment(),inputHash,inputCountPerJob:masks.length,jobCountPerMode:4,startTogether:true,moduleReuse:false,runs,correct:runs.every(r=>r.correct),parallelVerified:runs.every(r=>r.correct&&r.overlap&&r.distinctWorkers>=2&&r.distinctInstances>=2),note:'準備完了後に同じ実計算を開始。readyWaitMsはcomputeMsに含めない。通常の1/2/4性能比較とは別の能力確認。'};
}
export async function runComparison(ctx){
  const masks=Array.from({length:262144},(_,i)=>i%8),payload={masks,weights:[1,2,4]},inputHash=await hash(payload);guard(ctx);
  const runs=[];
  for(const concurrency of [1,2,4])for(let iteration=0;iteration<4;iteration++){
    guard(ctx);const pool=open(ctx,{concurrency,moduleReuse:false}),start=performance.now();
    try{const results=await pool.submitBatch(Array.from({length:4},()=>make(masks))).promise;guard(ctx);runs.push({concurrency,iteration,totalMs:performance.now()-start,...summarizeResults(results,Array(4).fill(masks)),resources:pool.getStatus()});ctx.onPartial?.({kind:'parallel-comparison',completed:runs.length,total:12});}
    finally{pool.dispose();}
  }
  const summary=[1,2,4].map(concurrency=>{const rows=runs.filter(r=>r.concurrency===concurrency);return{concurrency,firstMs:rows[0].totalMs,subsequentMedianMs:median(rows.slice(1).map(r=>r.totalMs)),allCorrect:rows.every(r=>r.correct),overlapObserved:rows.some(r=>r.overlap)};});
  return{kind:'parallel-comparison',environment:environment(),inputHash,jobCountPerRun:4,inputCountPerJob:masks.length,moduleReuse:false,runs,summary,correct:runs.every(r=>r.correct),parallelVerified:runs.some(r=>r.concurrency>=2&&r.correct&&r.overlap&&r.distinctWorkers>=2&&r.distinctInstances>=2)};
}
export async function runModuleComparison(ctx,lifecyclePassed=false){
  const masks=Array.from({length:8192},(_,i)=>i%8),inputHash=await hash({masks,weights:[1,2,4]});guard(ctx);const modes=[];
  for(const moduleReuse of [false,true]){const pool=open(ctx,{concurrency:1,moduleReuse}),runs=[];try{for(let i=0;i<6;i++){guard(ctx);const r=await pool.submit(make(masks)).promise;guard(ctx);runs.push({totalMs:r.totalMs,...summarizeResults([r],[masks])});}modes.push({moduleReuse,runs,subsequentMedianMs:median(runs.slice(1).map(r=>r.totalMs)),resources:pool.getStatus()});}finally{pool.dispose();}}
  const allCorrect=modes.every(m=>m.runs.every(r=>r.correct));
  return{kind:'module-comparison',environment:environment(),inputHash,modes,allCorrect,lifecyclePassed,recommendReuse:chooseModuleReuse(modes[0].runs.slice(1).map(r=>r.totalMs),modes[1].runs.slice(1).map(r=>r.totalMs),lifecyclePassed&&allCorrect),defaultRemains:false,criterion:'後続5回の中央値が10%以上短縮し、同一結果と両方式の取消・復帰が合格した場合のみ採用候補'};
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

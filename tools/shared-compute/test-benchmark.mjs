import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as benchmark from '../../docs/worker-runner/benchmark.mjs';
import {summarizeResults,chooseModuleReuse,runComparison,runModuleComparison,runPreparedComparison} from '../../docs/worker-runner/benchmark.mjs';
import {createComputePool} from '../../docs/shared/compute/pool.mjs';
import {instantiateKernel} from '../../docs/shared/compute/kernel.mjs';

const item=(workerId,start,end,result=[0,3,5])=>({status:'succeeded',result,workerId,instanceId:workerId,totalMs:999,metrics:{computeStartEpochMs:start,computeEndEpochMs:end}});
const expected=rows=>rows.map(()=>[0,3,5]);
const intervals=(rows,concurrency=2)=>summarizeResults(rows,expected(rows),concurrency);
let result=intervals([item('a',1,3),item('b',2,4)]);
assert.equal(result.overlap,true);
assert.equal(result.maxConcurrentWorkers,2);
assert.deepEqual(result.overlapDurationByConcurrency,{'1':2,'2':1,'3':0,'4':0});
assert.equal(result.fullConcurrencyOverlapMs,1);
assert.equal(result.intervalValidation.status,'PASS');
result=intervals([item('a',1,2),item('b',2,4)]);
assert.equal(result.overlap,false);assert.equal(result.maxConcurrentWorkers,1);
assert.equal(result.fullConcurrencyOverlapMs,0);
result=intervals([item('a',1,3),item('a',2,4)]);
assert.equal(result.overlap,false);assert.equal(result.maxConcurrentWorkers,1);
assert.equal(result.overlapDurationByConcurrency['1'],3);
result=intervals([item('d',4,8),item('b',2,6),item('a',1,5),item('c',3,7)],4);
assert.equal(result.maxConcurrentWorkers,4);assert.equal(result.fullConcurrencyOverlapMs,1);
assert.deepEqual(result.overlapDurationByConcurrency,{'1':2,'2':2,'3':2,'4':1});
result=intervals([item('a',1,1),item('b',1,2)],2);
assert.equal(result.maxConcurrentWorkers,1);assert.equal(result.intervalValidation.zeroLengthIntervalCount,1);
for(const invalid of [item('',1,3),item('b',NaN,3),item('b',1,Infinity),item('b',3,1),item('b',1,undefined)]){
  result=intervals([item('a',1,5),invalid]);
  assert.equal(result.overlap,null);assert.equal(result.maxConcurrentWorkers,null);
  assert.equal(result.fullConcurrencyOverlapMs,null);assert.equal(result.overlapDurationByConcurrency,null);
  assert.equal(result.intervalValidation.status,'NOT VERIFIED');assert.equal(result.intervalValidation.invalidIntervalCount,1);
  assert.equal(result.intervalValidation.issues[0].index,1);
}
assert.equal(summarizeResults([item('a',1,3,[0,9,5])],[[0,3,5]]).correct,false);
assert.equal(summarizeResults([item('a',1,3,[])],[[]]).correct,true);
assert.equal(summarizeResults([item('a',1,3,[0])],[[0]]).correct,true);
assert.equal(chooseModuleReuse([100,100,100,100,100],[91,91,91,91,91],true),false);
assert.equal(chooseModuleReuse([100,100,100,100,100],[90,90,90,90,90],true),true);
assert.equal(chooseModuleReuse([100,100,100,100,100],[50,50,50,50,50],false),false);
assert.equal(chooseModuleReuse([100,100,100,100,100],[0,0,0,0,NaN],true),false);
assert.equal(benchmark.median([1,4,2,3]),2.5);

// Fake time makes setup, guard and report overhead distinguishable from the
// synchronous submit cost and asynchronous result return that must be measured.
function fixture({badInterval=false,failedPoolIndex=null,onDuration=()=>17}={}){
  let clock=0,poolCount=0;
  const pools=[],admissions=[],jobIds=new Set();
  const ctx={isCurrent(){clock+=100;return true;},onPool(){clock+=200;},now:()=>clock,onPartial(){clock+=300;},
    createPool(options){
      clock+=400;const poolIndex=poolCount++,record={...options,poolIndex,disposed:false};pools.push(record);
      function submit(requests,batchOptions){
        for(const request of requests){assert.equal(request.protocolVersion,1);assert(!jobIds.has(request.jobId));jobIds.add(request.jobId);assert.deepEqual(request.payload.weights,[1,2,4]);assert(request.payload.masks.every((x,j)=>x===j%8));}
        const duration=onDuration({...record,call:record.calls??0});record.calls=(record.calls??0)+1;
        admissions.push({concurrency:options.concurrency,moduleReuse:options.moduleReuse,count:requests.length,inputCount:requests[0].payload.masks.length,startTogether:batchOptions?.startTogether??false,poolIndex});
        const start=clock;clock+=5;
        return{promise:Promise.resolve().then(()=>{clock+=duration-5;return requests.map((request,i)=>({...item('w'+i%options.concurrency,start+1+Math.floor(i/options.concurrency)*3,badInterval?undefined:start+4+Math.floor(i/options.concurrency)*3,request.payload.masks.slice()),jobId:request.jobId,inputRevision:request.inputRevision,generation:i+1,...(poolIndex===failedPoolIndex?{status:'failed',errorCode:'TIMEOUT',result:undefined,workerId:null,instanceId:null,metrics:{}}:{})}));})};
      }
      return{submitBatch:submit,submit(request){const handle=submit([request]);return{promise:handle.promise.then(rows=>rows[0])};},getStatus(){clock+=500;return{outstanding:0,inputBytes:0};},dispose(){record.disposed=true;clock+=600;}};
    }};
  return{ctx,pools,admissions};
}
const normal=fixture();
const comparison=await runComparison(normal.ctx);
assert.equal(comparison.schemaVersion,2);assert.equal(comparison.runs.length,18);
assert.deepEqual(comparison.orderPlan,[[1,2,4],[1,4,2],[2,1,4],[2,4,1],[4,1,2],[4,2,1]]);
assert.deepEqual(normal.admissions.map(x=>x.concurrency),comparison.orderPlan.flat());
assert(normal.admissions.every(x=>x.count===4&&x.inputCount===262144&&!x.moduleReuse&&!x.startTogether));
assert(comparison.runs.every(r=>r.callerElapsedMs===17&&r.jobs.every(j=>j.totalMs===999)));
assert(comparison.summary.every(s=>s.sampleCount===6&&s.medianMs===17&&s.minMs===17&&s.maxMs===17));
assert(comparison.correct);assert(comparison.parallelVerified);assert(normal.pools.every(p=>p.disposed));

// Observed browser failure: the first one-Worker trial times out, but the other
// seventeen trials succeed. Preserve every observation without calling this a
// comparable same-work performance experiment or deriving any speed reduction.
const failedComparison=await runComparison(fixture({failedPoolIndex:0,onDuration:({poolIndex})=>poolIndex===0?30000:17}).ctx);
assert.equal(failedComparison.correct,false);assert.equal(failedComparison.runs.length,18);
assert.equal(failedComparison.runs[0].callerElapsedMs,30000);
assert(failedComparison.runs[0].jobs.every(job=>job.status==='failed'&&job.errorCode==='TIMEOUT'));
assert.equal(failedComparison.summary[0].sampleCount,6);assert.equal(failedComparison.summary[0].maxMs,30000);
assert(failedComparison.summary.every(row=>row.reductionVsOneWorkerPercent===null));
assert.equal(failedComparison.performanceComparable,false);assert.equal(typeof failedComparison.performanceComparisonReason,'string');
assert(failedComparison.performanceComparisonReason.length>0);
assert.equal(comparison.performanceComparable,true);assert.equal(comparison.performanceComparisonReason,null);
assert(comparison.summary.every(row=>row.reductionVsOneWorkerPercent===0));

const preparedFixture=fixture();
const prepared=await runPreparedComparison(preparedFixture.ctx);
assert.equal(prepared.schemaVersion,2);assert.deepEqual(prepared.orderPlan,[[2,4],[4,2]]);
assert.deepEqual(preparedFixture.admissions.map(({concurrency,count})=>({concurrency,count})),[{concurrency:2,count:2},{concurrency:2,count:2},{concurrency:4,count:4},{concurrency:4,count:4},{concurrency:2,count:2},{concurrency:2,count:2}]);
assert(preparedFixture.admissions.every(x=>x.startTogether&&!x.moduleReuse&&x.inputCount===262144));
assert(prepared.runs.every(r=>r.waves.every(w=>w.callerElapsedMs===17)&&r.apiElapsedSumMs===(r.concurrency===2?34:17)));
assert(prepared.runs.every(r=>!Object.hasOwn(r,'callerElapsedMs')&&!Object.hasOwn(r,'totalMs')));
assert(prepared.correct);assert(prepared.parallelVerified);assert(prepared.fullConcurrencyVerified);
const missingIntervals=await runPreparedComparison(fixture({badInterval:true}).ctx);
assert.equal(missingIntervals.parallelVerified,null);assert.equal(missingIntervals.fullConcurrencyVerified,null);

const moduleFixture=fixture({onDuration:({moduleReuse})=>moduleReuse?80:100});
const modules=await runModuleComparison(moduleFixture.ctx,true);
assert.equal(modules.schemaVersion,2);assert.deepEqual(modules.orderPlan,[[false,true],[true,false]]);
assert.deepEqual(moduleFixture.pools.map(p=>p.moduleReuse),[false,true,true,false]);
assert(moduleFixture.admissions.every(x=>x.count===1&&x.inputCount===8192&&x.concurrency===1));
assert.equal(modules.blocks.length,2);assert(modules.blocks.every(b=>b.modes.every(m=>m.runs.length===6&&m.subsequent.sampleCount===5)));
assert(modules.blocks.every(b=>b.recommendReuse));assert.equal(modules.recommendReuse,true);assert.equal(modules.defaultRemains,false);
assert(modules.blocks.every(b=>b.modes.every(m=>m.runs.every(r=>r.callerElapsedMs===(m.moduleReuse?80:100)&&r.jobs[0].totalMs===999))));
const orderDependent=await runModuleComparison(fixture({onDuration:({moduleReuse,poolIndex})=>moduleReuse?(poolIndex===1?80:95):100}).ctx,true);
assert.equal(orderDependent.blocks[0].recommendReuse,true);assert.equal(orderDependent.blocks[1].recommendReuse,false);assert.equal(orderDependent.recommendReuse,false);
const lifecycleMissing=await runModuleComparison(fixture().ctx,false);assert.equal(lifecycleMissing.recommendReuse,false);

assert.equal(typeof benchmark.runPreparationRecovery,'function');
// The same fixed browser diagnostic runs against the real pool and Hike WASM.
// Only Worker transport and fetch are replaced here; this is not browser proof.
const originalFetch=globalThis.fetch,wasmURL=new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url);
let wrongResult=false,workerCount=0;
class InlineWorker{
  postMessage(request){
    const kernel=instantiateKernel(request.module),workerId='inline-'+(++workerCount);
    queueMicrotask(()=>{
      if(this.terminated)return;
      const start=performance.timeOrigin+performance.now();
      const values=request.payload.masks.map(mask=>kernel.magnitude(mask,request.payload.weights));
      if(wrongResult)values[0]=123;
      this.onmessage?.({data:{...request,type:'result',workerId,instanceId:kernel.instanceId,result:values,metrics:{computeStartEpochMs:start,computeEndEpochMs:start+1,loadMs:0,computeMs:1}}});
    });
  }
  terminate(){this.terminated=true;}
}
globalThis.fetch=async(url,options)=>{assert.equal(String(url),wasmURL.href);assert.equal(options.credentials,'omit');return new Response(await readFile(wasmURL),{headers:{'content-type':'application/wasm'}});};
function diagnosticContext(){
  const pools=[];
  return{pools,isCurrent:()=>true,onPool:pool=>pools.push(pool),createPool:options=>{
    const pool=createComputePool({...options,workerFactory:()=>new InlineWorker()}),bounded=request=>({...request,limits:{timeoutMs:Math.min(request.limits?.timeoutMs??30000,500)}});
    return{...pool,submit:request=>pool.submit(bounded(request)),submitBatch:requests=>pool.submitBatch(requests.map(bounded))};
  }};
}
try{
  const ctx=diagnosticContext(),recovery=await benchmark.runPreparationRecovery(ctx);
  assert.equal(recovery.schemaVersion,2);assert.equal(recovery.passed,true);
  assert.equal(recovery.timeoutAndRetry.timed.errorCode,'TIMEOUT');
  assert.equal(recovery.timeoutAndRetry.attempts,2);assert.equal(recovery.timeoutAndRetry.checks.abortedOldPreparation,true);
  assert.deepEqual(recovery.timeoutAndRetry.recovery.result,[0,3,5]);
  assert.equal(recovery.sharedSurvivor.attempts,1);assert.equal(recovery.sharedSurvivor.checks.survivorCorrect,true);
  assert(ctx.pools.every(pool=>pool.getStatus().disposed));
  wrongResult=true;
  const failed=await benchmark.runPreparationRecovery(diagnosticContext());
  assert.equal(failed.passed,false);assert.equal(failed.timeoutAndRetry.checks.recoveryCorrect,false);
}finally{globalThis.fetch=originalFetch;}

console.log('PASS schema 2: distinct-worker duration sweep, invalid/zero/touching intervals, exact caller boundary, six order permutations, prepared wave sums, AB/BA adoption, unchanged job timings, fixed recovery diagnostic with real pool/WASM (simulated Worker transport)');

import {validateRequest, BUILD_ID} from './protocol.mjs';
export {createComputePool} from './pool.mjs';
export function createComputeClient({workerFactory = () => new Worker(new URL('./compute-worker.mjs', import.meta.url), {type:'module'}), onUpdate = () => {}} = {}) {
  let latest = null, disposed = false;
  const notify = record => { try { onUpdate({jobId:record.jobId,status:record.status,phase:record.phase}); } catch {} };
  function finish(record, status, extra = {}) {
    if (record.status !== 'running') return;
    record.status = status; record.phase = status;
    clearTimeout(record.timer); record.worker?.terminate(); record.worker = null;
    record.result = {protocolVersion:1,buildId:BUILD_ID,jobId:record.jobId,inputRevision:record.inputRevision,status,...extra,totalMs:performance.now()-record.start};
    const resolve = record.resolve; record.resolve = null; resolve(record.result); notify(record);
  }
  return {
    submit(input) {
      if (disposed) throw new Error('処理基盤は終了しています');
      if (latest?.status === 'running') throw new Error('処理中です。完了または取消後に投入してください');
      const start = performance.now(), request = validateRequest(input);
      const record = {jobId:request.jobId,inputRevision:request.inputRevision,status:'running',phase:'starting',start,worker:null};
      latest = record;
      const promise = new Promise(resolve => { record.resolve = resolve; });
      record.timer = setTimeout(() => finish(record,'failed',{errorCode:'TIMEOUT'}),request.limits.timeoutMs);
      try {
        const worker = record.worker = workerFactory();
        worker.onmessage = ({data}) => {
          if (latest !== record || record.status !== 'running' || !data || data.jobId !== record.jobId || data.inputRevision !== record.inputRevision) return;
          if (data.type === 'phase') { record.phase=data.phase; notify(record); }
          else if (data.type === 'result') {
            if (!Array.isArray(data.result) || data.result.length !== request.payload.masks.length || Array.from(data.result).some(x=>!Number.isFinite(x))) finish(record,'failed',{errorCode:'INVALID_RESPONSE'});
            else finish(record,'succeeded',{result:data.result,metrics:data.metrics,workerId:data.workerId});
          } else if (data.type === 'error') finish(record,'failed',{errorCode:'TASK_FAILED',message:String(data.message).slice(0,240)});
        };
        worker.onerror = event => {event.preventDefault?.();finish(record,'failed',{errorCode:'WORKER_ERROR'});};
        worker.onmessageerror = () => finish(record,'failed',{errorCode:'MESSAGE_ERROR'});
        worker.postMessage(request); notify(record);
      } catch { finish(record,'failed',{errorCode:'WORKER_START_OR_SEND_FAILED'}); }
      return {jobId:record.jobId,promise};
    },
    getStatus(jobId) {return latest?.jobId === jobId ? {jobId,status:latest.status,phase:latest.phase} : null;},
    getResult(jobId) {return latest?.jobId === jobId ? latest.result ?? null : null;},
    cancel(jobId) {if(latest?.jobId !== jobId || latest.status !== 'running') return false;finish(latest,'cancelled',{errorCode:'CANCELLED'});return true;},
    dispose() {disposed=true;if(latest?.status === 'running')finish(latest,'cancelled',{errorCode:'DISPOSED'});latest=null;}
  };
}

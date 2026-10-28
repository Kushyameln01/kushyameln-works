import {createComputePool} from '../shared/compute/client.mjs';
import {BUILD_ID as POOL_BUILD} from '../shared/compute/protocol.mjs';
import {validateMeshName,isVisemeResult} from './api.mjs';
const abort=()=>new DOMException('生成を取り消しました。','AbortError');

/** A borrowed pool remains owned by its caller. This client retains no package. */
export function createVisemeGenerator({pool,workerMode='module'}={}){
  const ownsPool=!pool;pool??=createComputePool({concurrency:1,workerMode});
  let active=null,disposed=false;
  return Object.freeze({
    async generate(meshName='Body',{inputRevision=0,timeoutMs=30000}={}){
      if(disposed)throw Error('生成セッションは終了しています。');
      if(active)throw Error('生成中です。完了または取消後に起動してください。');
      validateMeshName(meshName);
      const record={jobId:crypto.randomUUID(),cancelled:false};active=record;
      try{
        const response=await pool.submit({protocolVersion:1,taskType:'viseme-template-generate',taskVersion:1,jobId:record.jobId,inputRevision,payload:{meshName},limits:{timeoutMs}}).promise;
        if(disposed||active!==record||record.cancelled)throw abort();
        if(response.protocolVersion!==1||response.buildId!==POOL_BUILD||response.taskType!=='viseme-template-generate'||response.taskVersion!==1||response.jobId!==record.jobId||response.inputRevision!==inputRevision||!Number.isSafeInteger(response.generation)||response.generation<1)throw Error('生成結果と現在の入力が一致しません。');
        if(response.status==='cancelled')throw abort();
        if(response.status!=='succeeded')throw Error(response.message??`生成に失敗しました（${response.errorCode??response.status}）。`);
        if(!isVisemeResult(response.result,{meshName}))throw Error('生成結果の形式が一致しません。');
        return {...response.result,execution:{jobId:record.jobId,inputRevision,generation:response.generation,poolBuildId:response.buildId,metrics:response.metrics??null}};
      }finally{pool.releaseResult(record.jobId);if(active===record)active=null;}
    },
    cancel(){if(!active)return false;const record=active;record.cancelled=true;active=null;pool.cancel(record.jobId);return true;},
    dispose(){if(disposed)return;this.cancel();disposed=true;if(ownsPool)pool.dispose();}
  });
}

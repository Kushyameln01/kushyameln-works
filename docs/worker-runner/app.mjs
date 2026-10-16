import {createComputePool} from '../shared/compute/client.mjs';
import {BUILD_ID} from '../shared/compute/protocol.mjs';
import {environment,runComparison,runModuleComparison,runLifecycle,runPreparedComparison,runPreparationRecovery} from './benchmark.mjs';
const $=id=>document.getElementById(id);
let revision=0,operation=null,lifecyclePassed=false,lastDiagnostic=null;
const make=(masks=[0,3,5])=>({protocolVersion:1,jobId:crypto.randomUUID(),inputRevision:revision,taskType:'ft-magnitude-batch',taskVersion:1,payload:{masks,weights:[1,2,4]}});
$('build').textContent='Web Worker共有基盤 · '+BUILD_ID;$('environment').textContent=JSON.stringify(environment(),null,2);
function controls(busy){for(const id of ['run','sample','batch','empty','compare','module-test','lifecycle','preparation-recovery','concurrency','reuse','together','prepared'])$(id).disabled=busy;$('cancel').disabled=!busy;$('save-diagnostics').disabled=busy||!lastDiagnostic;}
function stop(){if(operation){const old=operation;operation=null;for(const pool of old.pools)pool.dispose();}controls(false);}
function changed(){revision++;lastDiagnostic=null;stop();lifecyclePassed=false;$('result').value='';$('diagnostics').value='';$('resources').textContent='';$('status').textContent='入力が変わりました。再実行してください。';}
$('request').addEventListener('input',changed);
$('concurrency').onchange=changed;$('reuse').onchange=changed;$('together').onchange=changed;
function sample(kind){changed();$('request').value=JSON.stringify(kind==='batch'?[make(),make([0,7])]:make(kind==='empty'?[]:[0,3,5]),null,2);$('status').textContent='待機中';}
$('sample').onclick=()=>sample('single');$('batch').onclick=()=>sample('batch');$('empty').onclick=()=>sample('empty');sample('batch');
function begin(){stop();lastDiagnostic=null;const ctx={revision,pools:new Set()};operation=ctx;controls(true);$('status').textContent='準備中';$('diagnostics').value='';
  ctx.isCurrent=()=>operation===ctx&&revision===ctx.revision;
  ctx.onPool=pool=>ctx.pools.add(pool);
  ctx.onProgress=s=>{if(ctx.isCurrent()){$('status').textContent=s.status+' / '+s.phase+' · '+s.jobId;$('resources').textContent=JSON.stringify(s.snapshot,null,2);}};
  ctx.onPartial=value=>{if(ctx.isCurrent())$('diagnostics').value=JSON.stringify(value,null,2);};return ctx;
}
function end(ctx){for(const p of ctx.pools)p.dispose();if(ctx.isCurrent()){operation=null;controls(false);}}
$('cancel').onclick=()=>{lastDiagnostic=null;stop();$('status').textContent='取消済み。実行中・待機中のジョブを終了しました。';$('diagnostics').value='';};
$('run').onclick=async()=>{const ctx=begin();$('result').value='';try{
  const input=JSON.parse($('request').value),pool=createComputePool({concurrency:Number($('concurrency').value),moduleReuse:$('reuse').checked,onUpdate:ctx.onProgress});ctx.onPool(pool);
  const isBatch=Array.isArray(input),handle=pool.submitBatch(isBatch?input:[input],{startTogether:$('together').checked});const results=await handle.promise;
  if(ctx.isCurrent()){$('result').value=JSON.stringify(isBatch?results:results[0],null,2);$('status').textContent=results.every(r=>r.status==='succeeded')?'完了': '終了（結果のstatusを確認してください）';$('resources').textContent=JSON.stringify(pool.getStatus(),null,2);}
}catch(e){if(ctx.isCurrent()){$('status').textContent=e.message;$('result').value=JSON.stringify({status:'rejected',message:e.message},null,2);}}finally{end(ctx);}};
for(const [id,run] of [['prepared',runPreparedComparison],['compare',runComparison],['module-test',ctx=>runModuleComparison(ctx,lifecyclePassed)],['lifecycle',runLifecycle],['preparation-recovery',runPreparationRecovery]])$(id).onclick=async()=>{if(id==='lifecycle')lifecyclePassed=false;const ctx=begin();try{const report=await run(ctx);if(ctx.isCurrent()){lastDiagnostic=report;$('diagnostics').value=JSON.stringify(report,null,2);$('status').textContent='検証完了。検証結果JSONを確認してください。';if(id==='lifecycle')lifecyclePassed=report.passed;}}catch(e){if(ctx.isCurrent()){lastDiagnostic={kind:'diagnostic-error',environment:environment(),error:e.message};$('diagnostics').value=JSON.stringify(lastDiagnostic,null,2);$('status').textContent='検証でエラーが発生しました。';}}finally{end(ctx);}};
$('save-diagnostics').onclick=()=>{
  if(operation||!lastDiagnostic)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(lastDiagnostic,null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download=`compute-${BUILD_ID}-${lastDiagnostic.kind}.json`;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('pagehide',stop);

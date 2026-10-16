import {processMedia,BUILD_ID} from '../shared/media-basic/sdk.mjs';
import {createHistory} from '../shared/media-basic/history.mjs';
import {createTelemetryClient,refreshTelemetryClient,makeBaselineEvent,sizeBandForPixels} from '../shared/media-basic/telemetry.mjs';
const $=id=>document.getElementById(id),urls=new Map();let storage;try{storage=localStorage;}catch{}
const history=createHistory(storage);let client=createTelemetryClient(),controller=null,busy=false,generation=0,current=null,inputs=0;
const pageReadyMs=performance.now(),navigation=performance.getEntriesByType('navigation')[0];
const page={timeOriginEpochMs:performance.timeOrigin,moduleReadyMs:pageReadyMs,navigation:navigation?{type:navigation.type,responseStartMs:navigation.responseStart,responseEndMs:navigation.responseEnd,domInteractiveMs:navigation.domInteractive}:null,cacheState:'unknown'};
$('trial-id').value=new URLSearchParams(location.search).get('trialId')??'';
function release(id){if(urls.has(id))URL.revokeObjectURL(urls.get(id));urls.delete(id);$(id).hidden=true;$(id).removeAttribute(id==='preview'?'src':'href');}
function clear(){for(const id of ['download','receipt','preview'])release(id);current=null;$('result').value='';}
function url(id,blob,name){release(id);const value=URL.createObjectURL(blob);urls.set(id,value);$(id)[id==='preview'?'src':'href']=value;if(name)$(id).download=name;$(id).hidden=false;}
const json=value=>new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
function historyStatus(){const h=history.snapshot();$('history-status').textContent=`保持 ${h.records.length}件・上限による除外 ${h.evicted}件・追加不可 ${h.dropped}件${h.storageFailure?'。'+h.storageFailure:''}`;}
function showCollection(source=client){if(source!==client)return;const s=source.status();$('telemetry-status').textContent=`集計ログ：保存確認 ${s.stored}件・保留 ${s.pending}件・未収集 ${s.rejected+s.expired+s.dropped}件${s.lastError?'（'+s.lastError+'）':''}`;if(current){current.collection={...s,scope:'client lifetime counters; no media/hash sent'};$('result').value=JSON.stringify(current,null,2);url('receipt',json(current),`media-${current.trialId}-receipt.json`);history.append(current);historyStatus();}}
async function flush(source=client){for(let i=0;i<2;i++){await source.flush();showCollection(source);if(!source.status().pending)break;}}
function changed(){generation++;controller?.abort();clear();$('status').textContent='入力を変更しました。読み出しを実行してください。';}
for(const id of ['file','trial-id','run-condition'])$(id).addEventListener('change',changed);
$('cancel').addEventListener('click',()=>controller?.abort());
addEventListener('pagehide',()=>{controller?.abort();client.dispose();for(const id of [...urls.keys()])release(id);});
$('history-export').addEventListener('click',()=>url('history-download',json(history.snapshot()),'media-baseline-history.json'));
$('history-clear').addEventListener('click',()=>{history.clear();release('history-download');historyStatus();});
$('download').addEventListener('click',()=>{if(current){current.downloadClick={epochMs:Date.now(),pageMs:performance.now(),meaning:'click only; recovery not observed'};history.append(current);url('receipt',json(current),`media-${current.trialId}-receipt.json`);$('result').value=JSON.stringify(current,null,2);}});
historyStatus();
function errorCode(code){if(/LIMIT|BUDGET/.test(code))return 'budget_exceeded';if(/UNSUPPORTED/.test(code))return 'unsupported';if(/INVALID|FRAME_|TIMESTAMP|IDENTITY|TRUNCATED/.test(code))return 'input_invalid';return 'internal';}
$('run').addEventListener('click',async()=>{
  if(busy)return;const file=$('file').files[0];if(!file){$('status').textContent='ファイルを選択してください。';return;}
  client=refreshTelemetryClient(client);const sender=client;clear();busy=true;$('run').disabled=true;$('cancel').disabled=false;const revision=++generation,trialId=$('trial-id').value.trim()||crypto.randomUUID(),inputStart=performance.now(),aborter=new AbortController();controller=aborter;const timeout=setTimeout(()=>aborter.abort('TIMEOUT'),30000);let task=null,sizeBand='unknown',startEvent=null;
  const condition=$('run-condition').value,runIndex=++inputs;
  function enqueue(event){try{sender.enqueue(makeBaselineEvent(event));showCollection(sender);}catch{}}
  try{
    const head=new Uint8Array(await file.slice(0,12).arrayBuffer()),box=String.fromCharCode(...head.subarray(4,8));task=([0x1a,0x45,0xdf,0xa3].every((v,i)=>head[i]===v)||['ftyp','styp'].includes(box))?'video-decode':'image-decode';
    if(aborter.signal.aborted||revision!==generation)throw Error('CANCELLED');
    const output=await processMedia(file,{trialId,inputRevision:revision,signal:aborter.signal,onMetadata:m=>{sizeBand=sizeBandForPixels(m.width*m.height);},onProgress:p=>{if(revision===generation)$('status').textContent=p.phase==='packaging'?'ZIPを生成中…':`${p.frameCount}フレームを読み出しました。`;},onEvent:e=>{
      if(e.type==='start'){startEvent={operationId:e.operationId,task,kind:'start',sizeBand,cacheState:'unknown'};enqueue(startEvent);void flush(sender);}
    }});
    if(aborter.signal.aborted||revision!==generation)throw Error('CANCELLED');
    current={...output.receipt,page,condition,runIndex,inputStartPageMs:inputStart};
    const a=performance.now();url('download',output.zip,`media-${trialId}.zip`);url('preview',output.preview);const end=performance.now();current.timings.stages.outputReady=end-a;current.outputReadyPageMs=end;current.timings.inputToOutputReadyMs=end-inputStart;
    enqueue({operationId:current.operationId,kind:'complete',task,sizeBand,cacheState:'unknown',durationsMs:{...current.timings.stages,total:current.timings.inputToOutputReadyMs}});
    $('status').textContent=`完了：${current.frameCount}フレームをすべて保存しました。ZIPと計測記録を回収できます。`;
  }catch(error){
    const timedOut=aborter.signal.reason==='TIMEOUT',terminal=timedOut?'failed':aborter.signal.aborted?'cancelled':'failed';
    if(revision!==generation&&error.receipt){history.append({...error.receipt,status:terminal,page,condition,runIndex,inputStartPageMs:inputStart,staleInput:true});historyStatus();}
    if(revision===generation){current={...(error.receipt??{schemaVersion:2,buildId:BUILD_ID,trialId,operationId:crypto.randomUUID(),inputRevision:revision,status:terminal,scope:'runner-preparation; SDK not started'}),page,condition,runIndex,status:terminal,inputStartPageMs:inputStart,errorCode:aborter.signal.reason==='TIMEOUT'?'TIMEOUT':error.message};$('status').textContent=terminal==='cancelled'?'取り消しました。':`完了できませんでした：${error.message}`;}
    if(startEvent)enqueue({...startEvent,kind:terminal,errorCode:terminal==='failed'?(timedOut?'timeout':errorCode(error.message)):null,sizeBand,durationsMs:error.receipt?.timings?.stages??{total:performance.now()-inputStart}});
  }finally{
    clearTimeout(timeout);controller=null;busy=false;$('run').disabled=false;$('cancel').disabled=true;if(current){history.append(current);showCollection();}void flush(sender);
  }
});

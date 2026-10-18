import {createSharedDiagnostics} from './shared-diagnostics.mjs';
import {createComputePool} from '../../shared/compute/client.mjs';

// The panel owns its pool and optional comparison bytes; the File SDK borrows it.
export function createDiagnosticsPanel({getContext,getAvailability,prepare}){
  const $=id=>document.getElementById(id),pageSize=50;
  let pool=null,service=null,report=null,active=null,baseline=null,capture=null,page=0,rows=[],lastReport=null,lastCoverage=null,disposed=false,operationStarted=null;
  const statusNames={'not-run':'未実施',running:'診断中',succeeded:'診断完了',failed:'診断失敗',cancelled:'取消'};
  function ensure(){
    if(!service){
      pool=createComputePool({concurrency:2,moduleReuse:false});
      service=createSharedDiagnostics({pool,onUpdate:update});
      service.invalidate(currentContext());
      report=service.getReport();
    }
    return service;
  }
  const target=()=>$('shared-target').value;
  const currentContext=()=>({...getContext(),target:target()});
  function update(next){
    if(disposed)return;
    report=next;
    if(next.status!=='running')active=null;
    if(next!==lastReport){
      lastReport=next;page=0;rows=[];
      for(const [side,result]of [['before',next.sdkReport?.before],['after',next.sdkReport?.after]]){
        for(const item of result?.findings??[])rows.push({side,kind:'診断',item});
        for(const item of result?.shared??[])rows.push({side,kind:'共有参照',item});
      }
      for(const item of next.sdkReport?.diff?.changes??[])rows.push({side:'diff',kind:'構造差分',item});
      for(const item of next.sdkReport?.diff?.fileChanges??[])rows.push({side:'diff',kind:'ファイル差分',item});
      for(const item of next.sdkReport?.diff?.ambiguous??[])rows.push({side:'diff',kind:'対応が曖昧',item});
      $('shared-json').textContent='';$('shared-json-details').open=false;
    }
    refresh();renderRows();
    if(next.status!=='running'&&operationStarted!==null){$('shared-timing').textContent=`画面操作から結果表示まで ${(performance.now()-operationStarted).toFixed(1)} ms（端末内計測、Worker 2、Module再利用なし）。SDK内部の時間は全件JSONに記録しています。`;operationStarted=null;}
  }
  function refresh(){
    const available=getAvailability(),busy=!!active||!!capture,kind=target();
    const canRead=kind==='input'?available.input:available.output;
    $('shared-target').disabled=busy;
    $('shared-run').disabled=busy||!canRead;
    $('shared-keep').disabled=busy||!canRead;
    $('shared-compare').disabled=busy||!canRead||!baseline||baseline.source?.target!==kind;
    $('shared-clear').disabled=busy||!baseline;
    $('shared-cancel').disabled=!busy;
    $('shared-save').disabled=busy;
    $('shared-status').textContent=capture?'比較基準を準備しています。':report?`${statusNames[report.status]??report.status}${report.reason?`：${typeof report.reason==='string'?report.reason:report.reason.message??report.reason.code??''}`:''}`:'まだ共有診断を実行していません。';
    $('shared-revision').textContent=report?`操作 ${report.operationId??'未割当'} / 対象 ${report.context?.target??kind} / 入力 ${report.context?.inputRevision??0}・選択 ${report.context?.selectionRevision??0}・構成 ${report.context?.planRevision??0}`:'';
    $('shared-baseline').textContent=baseline?`保持中：${baseline.source?.target==='output'?'生成物':'選択済み入力'} / 入力 ${baseline.source?.context?.inputRevision??'?'}・選択 ${baseline.source?.context?.selectionRevision??'?'}・構成 ${baseline.source?.context?.planRevision??'?'}（明示的に解除するまで保持）`:'比較基準は未指定です。';
    const sdk=report?.sdkReport;
    $('shared-summary').textContent=sdk?`入力側 ${sdk.before?.counts?.files??0}ファイル / 指摘 ${sdk.before?.counts?.findings??0}件${sdk.after?`、比較側 ${sdk.after.counts?.files??0}ファイル / 指摘 ${sdk.after.counts?.findings??0}件`:''}。全件JSONと診断した素材範囲は別に記録しています。`:'';
    if(report?.inputCoverage!==lastCoverage){lastCoverage=report?.inputCoverage;$('shared-coverage').textContent=lastCoverage?JSON.stringify(lastCoverage,null,2):'未選択・参照のみの素材や解析不能な項目は、全範囲診断済みとは扱いません。';}
    // Compact size is cached by the service; never serialize the complete report while paging.
    $('shared-size').textContent=service&&report?.status!=='running'?`全件JSON（非整形時） ${service.getCompactBytes().toLocaleString()} bytes` : '';
  }
  function renderRows(){
    const q=$('shared-search').value.trim().toLocaleLowerCase();
    const visible=q?rows.filter(r=>[r.side,r.kind,r.item.code,r.item.message,r.item.path,r.item.source?.path,r.item.assetId,r.item.fileId].some(v=>String(v??'').toLocaleLowerCase().includes(q))):rows;
    page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(visible.length/pageSize)-1)));
    $('shared-count').textContent=`${visible.length}件 / ${page+1}ページ（50件ずつ）`;
    $('shared-prev').disabled=page===0;$('shared-next').disabled=(page+1)*pageSize>=visible.length;
    const list=$('shared-rows');list.replaceChildren();
    for(const row of visible.slice(page*pageSize,(page+1)*pageSize)){
      const li=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('pre');
      title.textContent=`${row.side}・${row.kind} ${row.item.code??''}`;
      detail.textContent=JSON.stringify(row.item,null,2);li.append(title,detail);list.append(li);
    }
  }
  function run(compare=false){
    if(disposed||active||capture)return;
    const ctx=currentContext(),held=baseline;
    if(compare&&held?.source?.target!==ctx.target)return;
    const started=performance.now(),controller=ensure();operationStarted=started;
    active=controller.start({...ctx,target:compare?'compare':ctx.target},async args=>{
      const payload=await prepare(ctx.target,args,ctx);
      return compare?{before:held,after:payload}:payload;
    });
    // start publishes synchronously. The asynchronous operation owns the final update.
    refresh();
    active.promise.catch(()=>{}); // service normally resolves every terminal envelope
  }
  async function keep(){
    if(disposed||active||capture)return;
    const ctx=currentContext(),control=new AbortController(),token={operationId:'baseline-'+crypto.randomUUID(),control};
    capture=token;refresh();
    try{
      const payload=await prepare(ctx.target,{operationId:token.operationId,signal:control.signal},ctx);
      if(capture!==token||control.signal.aborted)return;
      if(payload.notRunReason)throw Error(typeof payload.notRunReason==='string'?payload.notRunReason:payload.notRunReason.message??payload.notRunReason.code);
      baseline=payload;capture=null;refresh();$('shared-status').textContent='比較基準を保持しました。設定や素材を変更した後に同じ対象で比較できます。';
    }catch(error){if(capture===token){capture=null;refresh();$('shared-status').textContent=`比較基準を保持できませんでした：${error.message}`;}}
  }
  function cancel(){capture?.control.abort();capture=null;active?.cancel();active=null;refresh();}
  function invalidate(){
    capture?.control.abort();capture=null;active=null;
    service?.invalidate(currentContext());refresh();
  }
  $('shared-run').addEventListener('click',()=>run());$('shared-compare').addEventListener('click',()=>run(true));
  $('shared-keep').addEventListener('click',keep);$('shared-clear').addEventListener('click',()=>{baseline=null;refresh();});
  $('shared-cancel').addEventListener('click',cancel);$('shared-target').addEventListener('change',invalidate);
  $('shared-search').addEventListener('input',()=>{page=0;renderRows();});
  $('shared-prev').addEventListener('click',()=>{page--;renderRows();});$('shared-next').addEventListener('click',()=>{page++;renderRows();});
  $('shared-json-details').addEventListener('toggle',()=>{if($('shared-json-details').open&&!active&&!capture)$('shared-json').textContent=ensure().getJSON();});
  $('shared-save').addEventListener('click',()=>{
    if(active||capture)return;
    const json=ensure().getJSON(),url=URL.createObjectURL(new Blob([json],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download='SharedAnalysisReport.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('shared-status').textContent='全件JSONのダウンロードを開始しました。保存先の確認はブラウザで行ってください。';
  });
  refresh();renderRows();
  return {refresh,invalidate,cancel,dispose(){disposed=true;capture?.control.abort();active?.cancel();service?.dispose();pool?.dispose();baseline=null;rows=[];report=null;}};
}

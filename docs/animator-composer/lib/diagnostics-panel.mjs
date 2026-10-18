import {createSharedDiagnostics} from './shared-diagnostics.mjs';

// The panel owns its pool and optional comparison bytes; the File SDK borrows it.
export function createDiagnosticsPanel({getContext,getAvailability,prepare}){
  const $=id=>document.getElementById(id),pageSize=50;
  const collectMetrics=new URLSearchParams(globalThis.location?.search??'').get('measure')==='1';
  let pool=null,poolModulePromise=null,service=null,report=null,active=null,baseline=null,capture=null,page=0,rows=[],lastReport=null,lastCoverage=null,disposed=false,operationStarted=null,rowDetails=new WeakMap(),coverageJSON=null;
  const coverageDetails=$('shared-coverage').closest('details'),coverageSummary=document.createElement('p');coverageSummary.className='small';coverageDetails.before(coverageSummary);
  const newUiMetrics=operationId=>({operationId,operationToResultDomMs:null,stages:Object.fromEntries(['domUpdate','rowsDomUpdate','rowJSON','coverageJSON','fullJSONDomUpdate','rowDetailDomUpdate','coverageDetailDomUpdate'].map(name=>[name,{calls:0,totalMs:0,lastMs:null}]))});
  let uiMetrics=collectMetrics?newUiMetrics(null):null,updating=false;
  function recordUiStage(name,started){if(uiMetrics){const stage=uiMetrics.stages[name],elapsed=performance.now()-started;stage.calls++;stage.totalMs+=elapsed;stage.lastMs=elapsed;}}
  function observeUi(name,fn){if(!uiMetrics)return fn();const started=performance.now();try{return fn();}finally{recordUiStage(name,started);}}
  function publishMeasurements(){
    if(!collectMetrics||disposed||updating)return;
    // A small independent receipt: reading it never formats or sizes the report.
    try{$('shared-timing').dataset.measurements=JSON.stringify({schemaVersion:'composer-diagnostics-measurements/1',operationId:report?.operationId??null,status:report?.status??'not-run',unit:'ms',service:service?.getMetrics()??null,ui:uiMetrics,
      timingNotes:'Nested intervals must not be added. DOM intervals end after synchronous updates, not browser paint. prepare and sdkSettlement include waiting until resolve/reject; no terminal observation is fabricated while pending. Receipt serialization is excluded from DOM intervals.'});}catch{}
  }
  const statusNames={'not-run':'未実施',running:'診断中',succeeded:'診断完了',failed:'診断失敗',cancelled:'取消'};
  async function ensurePool({signal}){
    if(disposed||signal.aborted)throw Error('CANCELLED');
    if(pool)return pool;
    if(!poolModulePromise){
      const pending=import('../../shared/compute/client.mjs');poolModulePromise=pending;
      pending.catch(()=>{if(poolModulePromise===pending)poolModulePromise=null;});
    }
    const module=await poolModulePromise;
    if(disposed||signal.aborted)throw Error('CANCELLED');
    // The page owns this pool. A cancelled importer may finish loading code but cannot create it.
    return pool??=module.createComputePool({concurrency:2,moduleReuse:false});
  }
  function ensure(){
    if(!service){
      service=createSharedDiagnostics({poolFactory:ensurePool,onUpdate:update,collectMetrics});
      service.invalidate(currentContext());
      report=service.getReport();
    }
    return service;
  }
  const target=()=>$('shared-target').value;
  const currentContext=()=>({...getContext(),target:target()});
  function update(next){
    if(disposed)return;
    if(uiMetrics&&next.operationId!==uiMetrics.operationId)uiMetrics=newUiMetrics(next.operationId);
    const domStarted=collectMetrics?performance.now():0;updating=true;
    try{
    report=next;
    if(next.status!=='running')active=null;
    if(next!==lastReport){
      lastReport=next;page=0;rows=[];rowDetails=new WeakMap();
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
    if(next.status!=='running'&&operationStarted!==null){const elapsed=performance.now()-operationStarted;if(uiMetrics)uiMetrics.operationToResultDomMs=elapsed;$('shared-timing').textContent=`画面操作から結果のDOM更新直後まで ${elapsed.toFixed(1)} ms（描画完了は含みません。端末内計測、Worker 2、Module再利用なし）。SDK内部の時間は全件JSONに記録しています。`;operationStarted=null;}
    }finally{recordUiStage('domUpdate',domStarted);updating=false;publishMeasurements();}
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
    if(report?.inputCoverage!==lastCoverage){
      lastCoverage=report?.inputCoverage;coverageJSON=null;$('shared-coverage').textContent='';
      const scopes=lastCoverage?.before?[['入力側',lastCoverage.before],['比較側',lastCoverage.after]]:[['診断対象',lastCoverage]];
      coverageSummary.textContent=scopes.filter(([,scope])=>scope).map(([label,scope])=>{
        const counts=scope.sdk?.fileCoverageCounts;
        const selection=scope.scope==='generated-output'?`生成対象 ${scope.generatedAssetCount??'未集計'} Asset・同梱しない外部参照 ${scope.externalReferences?.length??'未集計'}件。`:`選択外 ${scope.unselected?.length??'未集計'}・参照のみ ${scope.referenceOnly?.length??'未集計'}・未採用 ${scope.unadopted?.length??'未集計'}件。`;
        return `${label}：${scope.sdk?.fileCount??scope.preflight?.fileCount??'未集計'}ファイル、部分解析 ${counts?.partial??'未集計'}・本文未解析 ${counts?.opaque??'未集計'}。${selection}`;
      }).join(' ')+' 全素材の診断済みを意味しません。範囲の詳細は下の欄で確認できます。';
      renderCoverageDetail();
    }
    // Compact size is cached by the service; never serialize the complete report while paging.
    $('shared-size').textContent=service&&report?.status!=='running'?`全件JSON（非整形時） ${service.getCompactBytes().toLocaleString()} bytes` : '';
  }
  function renderCoverageDetail(){
    if(disposed||!coverageDetails.open)return;
    observeUi('coverageDetailDomUpdate',()=>{
      if(lastCoverage&&coverageJSON===null)coverageJSON=observeUi('coverageJSON',()=>JSON.stringify(lastCoverage,null,2));
      $('shared-coverage').textContent=coverageJSON??'未選択・参照のみの素材や解析不能な項目は、全範囲診断済みとは扱いません。';
    });
    publishMeasurements();
  }
  function renderRows(){
    const domStarted=collectMetrics?performance.now():0;
    try{
    const q=$('shared-search').value.trim().toLocaleLowerCase();
    const visible=q?rows.filter(r=>[r.side,r.kind,r.item.code,r.item.message,r.item.path,r.item.source?.path,r.item.assetId,r.item.fileId].some(v=>String(v??'').toLocaleLowerCase().includes(q))):rows;
    page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(visible.length/pageSize)-1)));
    $('shared-count').textContent=`${visible.length}件 / ${page+1}ページ（50件ずつ）`;
    $('shared-prev').disabled=page===0;$('shared-next').disabled=(page+1)*pageSize>=visible.length;
    const list=$('shared-rows');list.replaceChildren();
    for(const row of visible.slice(page*pageSize,(page+1)*pageSize)){
      const li=document.createElement('li'),details=document.createElement('details'),summary=document.createElement('summary'),detail=document.createElement('pre'),item=row.item,rowReport=report;
      const path=item.path??item.source?.path??item.pathAfter??item.pathBefore??item.identity??item.key??item.assetId??'';
      const reason=item.message??item.reason??(item.incoming!==undefined?`参照元 ${item.incoming}件`:item.beforeCount!==undefined?`対応候補：変更前 ${item.beforeCount}・変更後 ${item.afterCount}件`:'');
      summary.textContent=[`${row.side}・${row.kind}`,item.severity,item.code??item.kind,path,item.property,reason].filter(v=>v!==undefined&&v!==null&&v!=='').join(' / ');
      details.append(summary,detail);li.append(details);list.append(li);
      details.addEventListener('toggle',()=>{
        if(disposed||!details.open||report!==rowReport)return;
        observeUi('rowDetailDomUpdate',()=>{
          if(!rowDetails.has(row))rowDetails.set(row,observeUi('rowJSON',()=>JSON.stringify(item,null,2)));
          detail.textContent=rowDetails.get(row);
        });
        publishMeasurements();
      });
    }
    }finally{recordUiStage('rowsDomUpdate',domStarted);publishMeasurements();}
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
  coverageDetails.addEventListener('toggle',renderCoverageDetail);
  $('shared-json-details').addEventListener('toggle',()=>{if(!disposed&&$('shared-json-details').open&&!active&&!capture){observeUi('fullJSONDomUpdate',()=>{$('shared-json').textContent=ensure().getJSON();});publishMeasurements();}});
  $('shared-save').addEventListener('click',()=>{
    if(disposed||active||capture)return;
    const json=ensure().getJSON(),url=URL.createObjectURL(new Blob([json],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download='SharedAnalysisReport.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('shared-status').textContent='全件JSONのダウンロードを開始しました。保存先の確認はブラウザで行ってください。';
    publishMeasurements();
    if(collectMetrics){
      // Capture once after save initiation, outside diagnostic/UI run intervals.
      try{
        const paths=[],limit=512;let count=0;
        for(const entry of performance.getEntriesByType('resource')){
          const resource=new URL(entry.name,location.href);if(resource.origin!==location.origin)continue;
          count++;if(paths.length<limit)paths.push(resource.pathname+resource.search);
        }
        $('shared-timing').dataset.resources=JSON.stringify({schemaVersion:'composer-diagnostics-resources/1',status:'observed',operationId:report?.operationId??null,capturedAfter:'shared-json-download-start',count,returnedCount:paths.length,truncated:count>limit,paths,
          scope:'Retained same-origin Resource Timing entries only; truncated describes this receipt limit. Earlier browser buffer evictions are not observable here.'});
      }catch(error){$('shared-timing').dataset.resources=JSON.stringify({schemaVersion:'composer-diagnostics-resources/1',status:'unavailable',count:null,returnedCount:0,truncated:null,paths:[],reason:String(error?.message??error)});}
    }
  });
  refresh();renderRows();
  return {refresh,invalidate,cancel,dispose(){disposed=true;capture?.control.abort();active?.cancel();service?.dispose();pool?.dispose();coverageDetails.removeEventListener('toggle',renderCoverageDetail);poolModulePromise=null;baseline=null;rows=[];report=null;lastReport=null;lastCoverage=null;rowDetails=new WeakMap();coverageJSON=null;}};
}

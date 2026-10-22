// Load computation only on an explicit indexing action; ordinary browsing stays static.
const api=await window.technicalLibraryReady,$=id=>document.getElementById(id),key='works-technical-library-run-v1';
let session=null,busy=false;
const saved=()=>{if($('saved-runs').value)return $('saved-runs').value;try{return localStorage.getItem(key);}catch{return null;}};
const remember=id=>{try{localStorage.setItem(key,id);}catch{$('index-status').textContent='再開IDを保存できません: '+id;}};
function show(state){
 const labels={idle:'未開始',running:'索引を作成中',complete:'索引を保存しました。検索に使用しています。','paused-saved':'中断・保存済み','stopped-unsaved':'停止しました。最後に保存できた区間から再開できます。',closed:'処理を終了しました。保存状態は残っています。'};
 $('index-status').textContent=(labels[state.status]??state.status)+(state.error?' / '+state.error:'');
 $('index-delete').disabled=busy||!$('saved-runs').value;$('index-start').disabled=busy;$('index-pause').disabled=!busy;$('index-resume').disabled=busy||!saved();$('index-close').disabled=!session;
}
async function run(resume){
 if(busy)return;let failure=null;busy=true;show({status:'running'});
 try{
  if(session){await session.close();session=null;}
  const {createLibrarySession}=await import('../shared/technical-library/session.mjs');
  session=await createLibrarySession(api.dataset,{onUpdate:show});
  if(resume)await session.resume(saved());else {const runId=crypto.randomUUID();remember(runId);await session.start({runId});}
  if(session.result())api.setIndex(session.result());
 }catch(error){failure='処理できません: '+error.message;}
 finally{busy=false;try{await refreshRuns();}catch(e){failure??='保存状態一覧を読めません: '+e.message;}show(session?.status()??{status:'idle'});if(failure)$('index-status').textContent=failure;}
}
$('index-start').addEventListener('click',()=>run(false));$('index-resume').addEventListener('click',()=>run(true));
$('index-pause').addEventListener('click',()=>{session?.pause();$('index-status').textContent='区間の完了と保存を待っています。';});
$('index-close').addEventListener('click',async()=>{if(session){await session.close();session=null;}api.clearIndex();busy=false;show({status:'closed'});});
async function refreshRuns(){const {openStore}=await import('../shared/technical-library/store.mjs');const store=await openStore();try{const runs=await store.list(),select=$('saved-runs'),previous=saved();select.replaceChildren(new Option('保存状態を選択',''));for(const r of runs)select.add(new Option(`${r.createdAt??''} · ${r.status} · ${r.runId}`,r.runId));if(runs.some(r=>r.runId===previous))select.value=previous;$('index-delete').disabled=busy||!select.value;$('index-resume').disabled=busy||!select.value;}finally{store.close();}}
$('index-tools').addEventListener('toggle',()=>{if($('index-tools').open)refreshRuns().catch(e=>{$('index-status').textContent=e.message;});});
$('saved-runs').addEventListener('change',()=>show(session?.status()??{status:'idle'}));
$('index-delete').addEventListener('click',async()=>{const id=$('saved-runs').value;if(busy||!id||!confirm(`保存状態 ${id} とその入力・途中結果を削除します。再開できなくなります。削除しますか？`))return;const {openStore}=await import('../shared/technical-library/store.mjs');const store=await openStore();try{await store.delete(id);try{if(localStorage.getItem(key)===id)localStorage.removeItem(key);}catch{}await refreshRuns();$('index-status').textContent='選んだ保存状態を削除しました。他の保存状態は保持しています。';}catch(e){$('index-status').textContent=e.message;}finally{store.close();}});
show({status:'idle'});
// Browser termination is not a guaranteed save point: each completed segment is already committed.
window.addEventListener('pagehide',()=>{session?.close();session=null;},{once:true});

import { SOURCE_SLOTS } from './lib/source-intake.mjs';
import { ROLE_LABELS, buildViewModel, filterParameters, validateAudit } from './view-model.mjs';

const $ = id => document.getElementById(id);
const make = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
};
let files = [], inspection = null, worker = null, running = null, generation = 0;
let replacementKey = null, replacementAttempt = null, currentResult = null, model = null, audit = null, auditRead = 0;
const urls = new Set();
const sizes = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes/1024)} KB` : `${(bytes/1048576).toFixed(1)} MB`;
const shortPath = path => path.split('/').at(-1);

function stopWorker() { worker?.terminate(); worker = null; running = null; }
function clearError() { $('error-box').hidden = true; $('error-list').replaceChildren(); }
function showError(title, issues) {
  $('error-title').textContent = title;
  $('error-list').replaceChildren(...issues.filter(x => typeof x === 'string').map(x => make('li',x)));
  $('error-box').hidden = false;
  $('error-box').focus();
}
function resetAudit() {
  auditRead++; audit = null;
  $('audit-file').value = '';
  $('audit-result').hidden = true;
  $('audit-status').textContent = '監査結果はまだ読み込んでいません。';
  $('audit-rows').replaceChildren();
  $('audit-metrics').replaceChildren();
  $('audit-context').textContent = '';
}
function discardResult() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
  for (const id of ['package','report','readme','index','spec']) $(id+'-download').removeAttribute('href');
  currentResult = null; model = null;
  $('result-content').hidden = true;
  $('result-placeholder').hidden = false;
  $('parameter-rows').replaceChildren();
  $('parameter-detail').replaceChildren();
  $('parameter-detail').hidden = true;
  $('module-list').replaceChildren();
  $('change-rows').replaceChildren();
  resetAudit();
}
function controls() {
  $('generate-button').disabled = Boolean(running) || !inspection?.ready;
  $('cancel-button').disabled = !running;
  $('clear-files').disabled = files.length === 0;
  $('inspect-again').hidden = !files.length || Boolean(running) || Boolean(inspection);
  $('generate-form').setAttribute('aria-busy',String(running === 'generate'));
  $('prepare').setAttribute('aria-busy',String(running === 'inspect'));
}
function renderSelection() {
  const items = inspection?.items ?? [];
  const matched = new Set(items.filter(x => x.status === 'matched').map(x => x.key));
  $('ready-count').textContent = `${matched.size} / ${SOURCE_SLOTS.length} 確認済み`;
  $('ready-count').className = inspection?.ready ? 'badge good' : 'badge';
  $('source-slots').replaceChildren(...SOURCE_SLOTS.map(slot => {
    const item = items.find(x => x.key === slot.key && x.status === 'matched');
    const card = make('article',null,'source-card'+(item?' good':''));
    const state = item ? '一致' : running === 'inspect' ? '照合中' : '未選択';
    card.append(make('h3',slot.name),make('p',state,'slot-state'),make('p',item ? `${item.name} · ${sizes(item.size)}` : 'この原本を追加してください。'));
    const button = make('button',item ? '交換' : 'この原本を選ぶ');
    button.type = 'button';
    button.setAttribute('aria-label',`${slot.name}を${item?'交換':'選択'}`);
    button.addEventListener('click',() => { replacementKey = slot.key; $('replacement-file').value = ''; $('replacement-file').click(); });
    card.append(button); return card;
  }));
  const issues = items.filter(x => x.status !== 'matched');
  $('selection-issues').hidden = !issues.length;
  $('selection-issue-list').replaceChildren(...issues.map(item => {
    const li = make('li'); li.append(make('span',`${item.name}：${item.message}`));
    const remove = make('button','この選択を外す','quiet'); remove.type='button';
    remove.addEventListener('click',() => removeFile(item.index)); li.append(remove); return li;
  }));
  $('selected-details').hidden = !files.length;
  $('selected-list').replaceChildren(...files.map((file,index) => {
    const li=make('li'); li.append(make('span',`${file.name}（${sizes(file.size)}）`));
    const remove=make('button','解除'); remove.type='button'; remove.setAttribute('aria-label',`${file.name}の選択を解除`);
    remove.addEventListener('click',()=>removeFile(index)); li.append(remove); return li;
  }));
  controls();
}
function removeFile(index) { applyFiles(files.filter((_,i) => i !== index)); }
function applyFiles(next, attempt = null) {
  generation++; stopWorker(); discardResult(); clearError();
  files=next; inspection=null; replacementAttempt=attempt;
  $('generation-progress').hidden=true;
  $('generation-status').textContent='4原本の照合が完了すると生成できます。';
  if (!files.length) { $('inspection-status').textContent='原本を選択してください。'; renderSelection(); return; }
  startJob('inspect');
}
function failJob(title, issues) {
  const kind=running;
  stopWorker(); replacementAttempt=null;
  if(kind==='inspect') inspection=null;
  discardResult();
  $('generation-progress').hidden=true;
  $(kind==='inspect'?'inspection-status':'generation-status').textContent='処理を完了できませんでした。表示された内容を確認してください。';
  renderSelection(); showError(title,issues);
}
function startJob(kind) {
  stopWorker(); generation++;
  const id=generation;
  running=kind; clearError();
  if(kind==='generate') discardResult();
  $(kind==='inspect'?'inspection-status':'generation-status').textContent=kind==='inspect'?'選択したファイルの内容を照合しています。':'生成を開始しています。';
  $('generation-progress').hidden=kind!=='generate';
  $('generation-progress').value=0;
  renderSelection();
  try {
    const instance=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
    worker=instance;
    instance.addEventListener('message',event=>{
      const data=event.data;
      if(worker!==instance || data?.id!==id || generation!==id) return;
      if(data.type==='progress') {
        $(kind==='inspect'?'inspection-status':'generation-status').textContent=data.message;
        if(kind==='generate') {
          if(data.value===null) $('generation-progress').removeAttribute('value');
          else $('generation-progress').value=data.value;
        }
      } else if(data.type==='error') failJob(data.message,data.issues??[]);
      else if(data.type==='inspected' && kind==='inspect') {
        if(!Array.isArray(data.items) || !Array.isArray(data.missing) || typeof data.ready!=='boolean') {
          failJob('照合結果が不正です。',['もう一度照合してください。']); return;
        }
        stopWorker();
        const attempt=replacementAttempt; replacementAttempt=null;
        if(attempt && !data.items.some(item=>item.index===attempt.candidateIndex && item.key===attempt.key && item.status==='matched')) {
          files=attempt.files; inspection=attempt.inspection;
          renderSelection();
          $('inspection-status').textContent='交換候補が指定した原本と一致しないため、元の選択を保持しました。';
          showError('指定した原本と一致しません。',['対応する原本を選んでください。元の選択は解除していません。']);
          return;
        }
        inspection=data; renderSelection();
        $('inspection-status').textContent=data.ready?'4原本の内容を確認しました。構成を確認して生成できます。':`照合が完了しました。${data.missing.length?`不足している原本は${data.missing.length}個です。`:''}表示された選択を確認してください。`;
        $('generation-status').textContent=data.ready?'準備ができました。生成ボタンで処理を開始します。':'選択を整えると生成できます。';
      } else if(data.type==='complete' && kind==='generate') {
        try {
          if(!(data.archiveBuffer instanceof ArrayBuffer) || typeof data.readme!=='string') throw new Error('生成ファイルを受け取れませんでした。');
          const nextModel=buildViewModel(data);
          stopWorker(); currentResult=data; model=nextModel;
          renderResult(data); controls();
        } catch(error) { failJob('結果を表示できませんでした。',[error.message]); }
      }
    });
    instance.addEventListener('error',event=>{event.preventDefault();if(worker===instance) failJob('処理用プログラムを読み込めませんでした。',['ページを再読み込みして試してください。']);});
    instance.addEventListener('messageerror',()=>{if(worker===instance) failJob('処理結果を読み取れませんでした。',['もう一度実行してください。']);});
    instance.postMessage({type:kind,id,files:[...files]});
  } catch(error) { failJob('処理を開始できませんでした。',[error.message]); }
}
function download(id,body,type) { const url=URL.createObjectURL(new Blob([body],{type}));urls.add(url);$(id+'-download').href=url; }
function metric(number,label) {const node=make('div',null,'metric');node.append(make('strong',number),make('span',label));return node;}
function verification() {
  const state = !audit ? 'Unity Import：未確認' : audit.fail ? `Unity Import：不合格 ${audit.fail}件` : audit.warn ? `Unity Import：警告 ${audit.warn}件` : 'Unity Import：監査合格';
  $('verification-list').replaceChildren(make('p','生成物の静的検査：合格','good'),make('p',state,audit&&!audit.fail&&!audit.warn?'good':''),make('p','MAビルド：未確認'),make('p','OSC / Remote：未確認'));
}
function renderResult(data) {
  download('package',data.archiveBuffer,'application/octet-stream');
  for(const [id,body] of [['report',data.report],['index',data.structureIndex],['spec',data.generationSpec]]) download(id,JSON.stringify(body,null,2)+'\n','application/json;charset=utf-8');
  download('readme',data.readme,'text/markdown;charset=utf-8');
  $('result-summary').textContent=`生成と静的検査が完了しました。${data.assetCount}アセット・${sizes(data.archiveBytes)}。`;
  $('result-metrics').replaceChildren(metric(model.externalCount,'外部Parameter'),metric(`${model.networkBits} bit`,'このFT構成の同期量'),metric(model.modules.length,'FX + AdditiveのLayer'));
  $('result-content').hidden=false; $('result-placeholder').hidden=true;
  $('generation-progress').value=6;
  $('generation-status').textContent='生成が完了しました。結果を確認し、Unitypackageを保存してください。';
  $('installer-path').textContent=model.spec.installation.prefab;
  verification(); renderParameters(); renderModules();
  const cleanup=data.report.parameter_cleanup;
  $('change-summary').replaceChildren(make('p',`Animator宣言の除去 ${cleanup.removed_declarations}件、外部登録の追加 ${cleanup.added_registrations}件・除去 ${cleanup.removed_registrations}件。`));
  $('change-rows').replaceChildren(...model.changes.map(change=>{
    const row=make('tr');for(const text of [change.kind,change.name,change.detail]) row.append(make('td',text));return row;
  }));
  $('result-title').focus();
}
function renderParameters() {
  if(!model)return;
  const entries=filterParameters(model.parameters,$('parameter-search').value,$('parameter-filter').value);
  $('parameter-count').textContent=`${entries.length}項目を表示。名前を選ぶと型の対応と採用根拠を確認できます。`;
  $('parameter-rows').replaceChildren(...entries.map(p=>{
    const row=make('tr'),first=make('td'),button=make('button',p.name);button.type='button';button.addEventListener('click',()=>showParameter(p));first.append(button);row.append(first);
    const e=p.external;
    for(const text of [ROLE_LABELS[p.role]??p.role,e.required?e.type:'登録なし',e.required?e.default_value:'—',e.required?(e.network_synced?'ON':'ローカル'):'—',e.required?(e.saved?'ON':'OFF'):'—']) row.append(make('td',text));
    return row;
  }));
}
function showParameter(p) {
  const panel=$('parameter-detail');panel.replaceChildren(make('h3',p.name));
  const dl=make('dl');
  const pair=(term,definition)=>dl.append(make('dt',term),make('dd',definition));
  pair('役割',ROLE_LABELS[p.role]??p.role);
  pair('採用根拠（生成器の記録）',p.decision_reason);
  pair('供給元',`Local：${p.supply.local} / Remote：${p.supply.remote}`);
  pair('Animatorの宣言',p.animator.map(a=>`${shortPath(a.controller_path)}：${a.type} / 初期値 ${a.default_value}${a.conversion==='bool_to_float_0_1'?'（外部Boolを0/1のFloatとして使用）':''}`).join('\n'));
  pair('参照',`読取り ${p.readers.length}件 / 書込み ${p.writers.length}件`);
  panel.append(dl);
  const details=make('details'),summary=make('summary','原本の登録と参照先の記録');details.append(summary,make('pre',JSON.stringify({source:p.source_observations,readers:p.readers,writers:p.writers},null,2)));panel.append(details);panel.hidden=false;panel.focus();
}
function renderModules() {
  $('module-list').replaceChildren(...model.modules.map(m=>{
    const card=make('article');card.append(make('h3',`${shortPath(m.controller)} / ${m.layer}`),make('p',`Layer ${m.layer_index}`));
    if(!m.entries.length)card.append(make('p','独立Rootへの入口なし'));
    for(const entry of m.entries) {
      const root=model.roots.find(r=>r.guid===entry.guid&&String(r.file_id)===String(entry.file_id));
      card.append(make('p',entry.path));
      if(root)card.append(make('p',`読取り：${root.read_parameters.join(', ') || 'なし'}`));
    }
    return card;
  }));
}
function renderAudit() {
  if(!audit)return;
  $('audit-result').hidden=false;
  $('audit-metrics').replaceChildren(metric(audit.pass,'合格'),metric(audit.warn,'警告'),metric(audit.fail,'不合格'));
  $('audit-context').textContent=`Unity ${audit.unityVersion} / 取得日時 ${audit.generatedAtUtc}。生成仕様が一致する監査結果です。MAビルドとOSC/Remote動作は、この監査の対象外です。`;
  const checks=audit.checks.filter(c=>$('audit-all').checked || c.status!=='PASS');
  $('audit-rows').replaceChildren(...checks.map(c=>{const row=make('tr');for(const text of [c.status,c.path,`${c.expected??'—'} / ${c.actual??'—'}`,c.detail??''])row.append(make('td',text));return row;}));
  if(!checks.length){const row=make('tr'),cell=make('td','警告・不合格の項目はありません。');cell.setAttribute('colspan','4');row.append(cell);$('audit-rows').append(row);}
  verification();
}

$('source-files').addEventListener('change',()=>{const selected=[...$('source-files').files];$('source-files').value='';if(selected.length)applyFiles([...files,...selected]);});
$('replacement-file').addEventListener('change',()=>{
  const selected=[...$('replacement-file').files],key=replacementKey;replacementKey=null;$('replacement-file').value='';
  if(!selected.length||!key)return;
  const oldFiles=files,oldInspection=inspection;
  const removeIndices=new Set((inspection?.items??[]).filter(x=>x.key===key).map(x=>x.index));
  const next=files.filter((_,index)=>!removeIndices.has(index));const candidateIndex=next.length;next.push(selected[0]);
  applyFiles(next,{key,files:oldFiles,inspection:oldInspection,candidateIndex});
});
$('clear-files').addEventListener('click',()=>applyFiles([]));
$('inspect-again').addEventListener('click',()=>{if(files.length&&!running)startJob('inspect');});
$('generate-form').addEventListener('submit',event=>{event.preventDefault();if(!running&&inspection?.ready)startJob('generate');});
$('cancel-button').addEventListener('click',()=>{
  if(!running)return;const kind=running;generation++;stopWorker();replacementAttempt=null;
  if(kind==='inspect')inspection=null;
  discardResult();clearError();$('generation-progress').hidden=true;
  $(kind==='inspect'?'inspection-status':'generation-status').textContent='処理を取り消しました。選択したファイルは保持しています。';renderSelection();
});
$('parameter-search').addEventListener('input',renderParameters);
$('parameter-filter').addEventListener('change',renderParameters);
$('audit-all').addEventListener('change',renderAudit);
$('audit-file').addEventListener('change',async()=>{
  const file=$('audit-file').files[0];if(!file||!model)return;
  const token=++auditRead,expected=model.expectedAudit;
  audit=null;$('audit-result').hidden=true;verification();$('audit-status').textContent='監査結果を照合しています。';
  try {
    if(file.size>10*1024*1024)throw new Error('監査JSONは10MB以下のファイルを選択してください。');
    const text=await file.text();
    if(token!==auditRead||!model||model.expectedAudit!==expected)return;
    audit=validateAudit(JSON.parse(text),expected);renderAudit();
    $('audit-status').textContent=`現在の生成物との対応を確認しました。${audit.fail?'不合格の項目を確認してください。':audit.warn?'警告の項目を確認してください。':'Import監査は合格です。'}`;
  } catch(error) {
    if(token!==auditRead)return;
    audit=null;$('audit-result').hidden=true;verification();
    $('audit-status').textContent=`監査結果を採用できませんでした。${error instanceof SyntaxError?'JSONの形式を確認してください。':error.message}`;
  }
});
window.addEventListener('pagehide',()=>{generation++;stopWorker();inspection=null;replacementAttempt=null;discardResult();$('generation-progress').hidden=true;$('inspection-status').textContent='ページを離れたため処理結果を破棄しました。再開するには照合してください。';renderSelection();});
renderSelection();
if(!('Worker' in window)||!('WebAssembly' in window)) {
  $('source-files').disabled=true;$('replacement-file').disabled=true;
  $('inspection-status').textContent='このブラウザではWorkerまたはWebAssemblyを利用できません。対応ブラウザで開いてください。';
}

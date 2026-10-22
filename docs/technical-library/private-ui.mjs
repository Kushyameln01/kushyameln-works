// Private records are never passed to the public app or its sharing controls.
import {openPrivateLibrary} from '../shared/technical-library/private-library.mjs';
const $=id=>document.getElementById(id),panel=$('private-panel');
let handle=null,revision=0,offset=0,current=null,busy=false,opening=false,detailSelection=0;
const node=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
function message(value){$('private-status').textContent=value;}
function lock(value){busy=value;for(const el of panel.querySelectorAll('button,input,select'))el.disabled=value;}
function clear(){detailSelection++;current=null;offset=0;$('private-results').replaceChildren();$('private-detail').replaceChildren();}
function end(){revision++;handle?.close();handle=null;delete window.technicalLibraryPrivate;clear();$('private-datasets').replaceChildren();$('private-query').value='';$('private-dataset-file').value='';$('private-artifact-files').value='';panel.hidden=true;$('private-open').disabled=false;}
async function refresh(){
 const token=revision,list=await handle.listDatasets();if(token!==revision)throw Error('PRIVATE_UI_CLOSED');const selected=$('private-datasets').value;$('private-datasets').replaceChildren(node('option','データを選択'));
 $('private-datasets').firstChild.value='';for(const row of list){const option=node('option',`${row.datasetId} · ${row.datasetVersion} · ${row.counts.entries}項目`);option.value=row.datasetId;$('private-datasets').append(option);}
 if(list.some(r=>r.datasetId===selected))$('private-datasets').value=selected;
 return list;
}
async function search(){
 const id=$('private-datasets').value;if(!id){clear();message('保存済みデータを選択してください。');return;}
 const token=revision,result=await handle.search(id,{query:$('private-query').value,offset,limit:20});if(token!==revision)throw Error('PRIVATE_UI_CLOSED');current={datasetId:id,snapshot:result.snapshot};
 detailSelection++;$('private-results').replaceChildren();$('private-detail').replaceChildren();
 for(const hit of result.items){const article=node('article',''),button=node('button',hit.title);button.type='button';button.addEventListener('click',()=>act(async()=>{
  const detailToken=revision,selection=++detailSelection;$('private-detail').replaceChildren();const detail=await handle.readEntry(id,hit.entryId,{expected:result.snapshot});if(detailToken!==revision||selection!==detailSelection)throw Error('PRIVATE_UI_CLOSED');const area=$('private-detail');area.replaceChildren(node('h3',detail.entry.title),node('p',detail.entry.summary));
  for(const claim of detail.entry.claims??[])area.append(node('p',`${claim.kind}: ${claim.text} — ${claim.locator}`));
  for(const source of detail.sources){const item=node('p',`${source.title} · ${source.access} · 内容確認: ${source.contentStatus}`);item.append(node('br',''));const label=source.reference.value;
   // Private links require explicit navigation; no prefetch or embedded document.
   if(source.reference.kind==='url'){const a=node('a',label);a.href=label;a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';item.append(a);}else item.append(node('span',label));
   if(source.section)item.append(node('span',' · '+source.section));area.append(item);
  }
  const evidenceArea=node('section','');evidenceArea.id='private-evidence';area.append(evidenceArea);renderEvidence(detail.evidence,evidenceArea,{id,entryId:hit.entryId,expected:result.snapshot,revision:detailToken,selection});
  message('選択項目と原本の保存 hash を確認しました。元資料の内容の正しさを保証するものではありません。');
 }));article.append(button,node('p',hit.summary));$('private-results').append(article);}
 $('private-previous').dataset.available=String(offset>0);$('private-next').dataset.available=String(result.hasMore);
 message(`${result.totalCount}件中 ${result.items.length}件。${result.coverage}`);
}

const valueText=value=>value===null||value===undefined?'未記録':typeof value==='object'?JSON.stringify(value):String(value);
function renderEvidence(evidence,area,selection){
 area.replaceChildren(node('h3','記録された外部引用・添付'));
 if(!evidence.available){area.append(node('p','分類資料の対応記録はありません。'));return;}
 const page=evidence.page;
 area.append(node('p',`原資料: ${page.title} · ${page.url}`),node('p',`原資料版: ${page.originalDatasetVersion} · 本文 hash: ${page.bodyHash}`),node('p',`取得時点: ${valueText(page.retrievedAt)} · 更新時点: ${valueText(page.updatedAt)} · sequence: ${valueText(page.currentSequence)}`),node('p','版の記述: '+valueText(page.statedVersionAndDateEvidence)),node('p','原資料の確認範囲: '+valueText(page.reviewCoverage)));
 area.append(node('p',`全${evidence.totalCount}件（外部引用${evidence.counts.citations}件・添付出現${evidence.counts.attachments}件） · ${evidence.offset}件目の後から${evidence.items.length}件。引用の記録は、主張の独立検証ではありません。`));
 for(const item of evidence.items){
  const card=node('article','');card.dataset.evidenceType=item.type;
  if(item.type==='citation'){
   const source=item.externalSource,local=item.sourceRole==='local_execution_example'&&item.eligibleAsExternalTechnicalEvidence===false,a=node(local?'span':'a',source.url);if(!local){a.href=source.url;a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';}card.append(node('h4',item.originalLabel===null?'ラベル未記録':item.originalLabel),a,node('blockquote',item.sourceText));
   if(local)card.append(node('p','ローカル実行例 · 外部技術根拠ではありません。実行・取得は行っていません。'));
   if(item.correction)card.append(node('p',`訂正追補 hash: ${item.correction.addendumHash} · ${item.correction.boundaryStatus} · 外部本文確認: ${item.correction.externalBodyVerification}`));
   card.append(node('p',`版: ${valueText(source.version)} · commit: ${valueText(source.commit)}`),node('p',`確認状態: ${valueText(source.verificationStatus)} · 本文確認: ${valueText(source.contentCheckedAt)} · 到達確認: ${valueText(source.accessCheckedAt)}`),node('p',`資料名: ${valueText(source.documentTitle)} · 発行元: ${valueText(source.publisher)} · ${valueText(source.publisherStatus)}`),node('p','アクセス条件: '+valueText(source.accessConditions)),node('p','照合記録: '+valueText(source.check)),node('p','引用関係: '+item.relationshipStatus));
  }else{
   card.append(node('h4',item.labels.join(' / ')),node('p',item.reference),node('blockquote',item.context),node('p','原台帳: 未取得 · 現状態: '+(item.effectiveStatus==='report-text-retrieved'?'追補で報告本文を取得':'未取得')));
   if(item.followup)card.append(node('p',`追補取得時点: ${item.followup.retrievedAt} · hash: ${item.followup.result.sha256} · bytes: ${item.followup.result.text_byte_size}`),node('p',item.followup.note));
   card.append(node('p','添付の取得状態は、生ログ取得や実験再現の検証を意味しません。'));
  }
  card.append(node('p',`見出し: ${valueText(item.location.heading)} · ブロック内行: ${item.location.lineInBlock}`),node('p',`block: ${item.location.blockId} · hash: ${item.location.blockHash}`));area.append(card);
 }
 const navigation=node('div','');
 for(const [label,next,available] of [['前の根拠',Math.max(0,evidence.offset-evidence.limit),evidence.offset>0],['次の根拠',evidence.nextOffset,evidence.hasMore]]){
  const button=node('button',label);button.type='button';button.dataset.evidencePage='true';button.dataset.available=String(available);button.disabled=!available;
  button.addEventListener('click',()=>act(async()=>{
   if(selection.revision!==revision||selection.selection!==detailSelection)return;
   area.replaceChildren(node('p','根拠を確認しています。'));
   try{const nextPage=await handle.readEvidence(selection.id,selection.entryId,{expected:selection.expected,offset:next,limit:evidence.limit});if(selection.revision!==revision||selection.selection!==detailSelection)return;renderEvidence(nextPage,area,selection);}
   catch(error){if(selection.revision===revision&&selection.selection===detailSelection)area.replaceChildren(node('p','根拠を表示できません: '+error.message+'。再検索して現在の項目を開いてください。'));throw error;}
  }));navigation.append(button);
 }
 area.append(navigation);
}
async function act(fn){if(busy||!handle)return;const token=revision;lock(true);try{await fn();}catch(error){if(token===revision)message('操作できません: '+error.message);}finally{if(token===revision){lock(false);$('private-previous').disabled=$('private-previous').dataset.available!=='true';$('private-next').disabled=$('private-next').dataset.available!=='true';for(const button of panel.querySelectorAll('[data-evidence-page]'))button.disabled=button.dataset.available!=='true';}}}
$('private-open').addEventListener('click',async()=>{
 if(handle||opening)return;opening=true;$('private-open').disabled=true;const token=revision;
 try{const opened=await openPrivateLibrary();if(token!==revision){opened.close();return;}handle=opened;window.technicalLibraryPrivate=handle;panel.hidden=false;await act(async()=>{await refresh();message('このブラウザ内だけに保存します。公開目録・共有文には追加されません。');});}
 catch(error){if(token===revision){message('保存領域を開けません: '+error.message);panel.hidden=false;$('private-open').disabled=false;}}
 finally{opening=false;}
});
$('private-close').addEventListener('click',end);
$('private-search-form').addEventListener('submit',e=>{e.preventDefault();act(async()=>{offset=0;await search();});});
$('private-datasets').addEventListener('change',()=>act(async()=>{clear();if($('private-datasets').value)await handle.read($('private-datasets').value);await search();}));
$('private-previous').addEventListener('click',()=>act(async()=>{offset=Math.max(0,offset-20);await search();}));
$('private-next').addEventListener('click',()=>act(async()=>{offset+=20;await search();}));
async function importFiles(replace){
 const file=$('private-dataset-file').files[0];if(!file)throw Error('データ JSON を選択してください。');if(file.size>16*1024*1024)throw Error('データ JSON は16MiB以内です。');
 const dataset=JSON.parse(await file.text()),files=[...$('private-artifact-files').files];if(files.reduce((n,f)=>n+f.size,0)>16*1024*1024)throw Error('原本ファイル合計は16MiB以内です。');
 const manifest=dataset.provenance?.sourceArtifacts;if(!Array.isArray(manifest))throw Error('原本の対応表がありません。');if(files.length!==manifest.length)throw Error('原本ファイル数が対応表と一致しません。');
 const used=new Set(),artifacts=[];for(const row of manifest){const matches=files.filter(f=>f.name===row.name);if(matches.length!==1||used.has(matches[0]))throw Error('原本ファイル名を一意に対応付けられません。');used.add(matches[0]);artifacts.push({artifactId:row.artifactId,name:row.name,bytes:new Uint8Array(await matches[0].arrayBuffer())});}
 if(replace){if(!current||current.datasetId!==dataset.datasetId)throw Error('更新する保存済みデータを選択してください。');await handle.replace(dataset,artifacts,{expected:current.snapshot});}else await handle.register(dataset,artifacts);
 await refresh();$('private-datasets').value=dataset.datasetId;offset=0;await handle.read(dataset.datasetId);await search();$('private-dataset-file').value='';$('private-artifact-files').value='';
}
$('private-import').addEventListener('click',()=>act(()=>importFiles(false)));
$('private-replace').addEventListener('click',()=>act(()=>importFiles(true)));
$('private-delete').addEventListener('click',()=>act(async()=>{
 if(!current)throw Error('削除するデータを選択してください。');const target=current;if(!confirm(`私有データ ${target.datasetId} の保存内容と原本添付を削除します。元のクラウド資料と公開目録は残ります。`))return;
 await handle.remove(target.datasetId,{expected:target.snapshot});clear();await refresh();message('選択した私有データを削除しました。');
}));
window.addEventListener('pagehide',end,{once:true});

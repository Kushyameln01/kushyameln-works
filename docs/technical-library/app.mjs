import {validateDataset} from '../shared/technical-library/model.mjs';
import {search,list,read,exportEntry} from '../shared/technical-library/search.mjs';
const $=id=>document.getElementById(id),base=new URL('./',import.meta.url),requests=new AbortController();
let dataset,manifest,index,selectedEntry=null,folder=null,offset=0,detailRevision=0,closed=false;
const pageSize=8;
const text=(tag,value,className)=>{const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;};
async function checkedJSON(path){
 const response=await fetch(new URL(path,base),{signal:requests.signal});if(!response.ok)throw Error('資料を取得できません: '+response.status);
 const bytes=await response.arrayBuffer(),expected=manifest.files[path];if(!expected)throw Error('manifestにない資料です');
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(digest!==expected.sha256||bytes.byteLength!==expected.bytes)throw Error('資料の版・hashが一致しません');
 return JSON.parse(new TextDecoder().decode(bytes));
}
function render(){
 const result=search(dataset,{query:$('query').value,folder,offset,limit:pageSize,...(index?{postings:index.postings,terms:index.terms,docIds:index.docIds??index.entryIds}:{})});
 $('coverage').textContent=result.coverage;
 $('search-status').textContent=result.totalCount===0?'一致する項目はありません。語を短くするか、分類を変えてください。':`${result.totalCount}件中 ${offset+1}〜${offset+result.items.length}件 · ${result.indexSource==='postings'?'作成した索引':'目録'}を検索`;
 $('results').replaceChildren(...result.items.map(hit=>{const article=text('article','','card');const h=text('h2','');const a=text('a',hit.title);a.href=new URL('items/'+hit.entryId+'/',base).href;h.append(a);article.append(h,text('p',hit.summary),text('p',hit.appliesTo,'meta'));const actions=text('div','','actions');const button=text('button','条件・根拠・共有');button.type='button';button.addEventListener('click',()=>showDetail(hit.entryId));actions.append(button);article.append(actions);return article;}));
 $('previous').disabled=offset===0;$('next').disabled=!result.hasMore;
 return result;
}
async function showDetail(id){
 const revision=++detailRevision;selectedEntry=id;$('detail').hidden=false;$('detail-title').textContent='読込み中';$('detail-content').replaceChildren();$('share-text').value='';$('share-copy').disabled=true;$('share-json').disabled=true;
 try{
  const item=await checkedJSON('items/'+id+'/entry.json');if(closed||revision!==detailRevision)return;
  if(item.datasetVersion!==dataset.datasetVersion||item.entry.entryId!==id)throw Error('項目の版が一致しません');
  // Validate sources and public boundary before rendering this separately fetched item.
  validateDataset({...dataset,entries:[item.entry],sources:item.sources});
  const entry=item.entry;$('detail-title').textContent=entry.title;const content=$('detail-content');content.append(text('p',entry.summary),text('p','対象: '+entry.appliesTo));
  for(const [title,values] of [['適用条件',entry.conditions],['限界',entry.limitations]]){content.append(text('h3',title));const ul=document.createElement('ul');for(const value of values??[])ul.append(text('li',value));content.append(ul);}
  content.append(text('h3','根拠'));const ul=document.createElement('ul');for(const source of item.sources){const li=document.createElement('li'),a=text('a',source.title);a.href=source.url;a.rel='noopener noreferrer';li.append(a,text('span',' — '+source.section),text('p','公開資料 · 内容確認 '+source.contentCheckedAt+' · '+source.revision,'muted'));ul.append(li);}content.append(ul);
  const direct=text('a','項目の直接URL');direct.href=new URL('items/'+id+'/',base).href;content.append(direct);
  $('share-text').value=exportEntry(dataset,id,{baseURL:base.href}).markdown;$('share-status').textContent='紹介文には適用条件と根拠を含めています。';$('share-copy').disabled=false;$('share-json').disabled=false;$('detail').scrollIntoView({block:'start',behavior:'smooth'});
 }catch(error){if(revision===detailRevision){$('detail-title').textContent='項目を読めませんでした';$('detail-content').replaceChildren(text('p',error.message));}}
}
function downloadJSON(value,name){const blob=new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
window.technicalLibraryReady=(async()=>{
 const response=await fetch(new URL('manifest.json',base),{signal:requests.signal});if(!response.ok)throw Error('manifestを取得できません');manifest=await response.json();dataset=validateDataset(await checkedJSON('catalog.json'));if(dataset.datasetVersion!==manifest.datasetVersion)throw Error('目録の版が一致しません');
 $('dataset-version').textContent='データ版 '+dataset.datasetVersion+' · '+dataset.entries.length+'項目';
 for(const f of [{folderId:null,title:'すべて'},...dataset.folders]){const button=text('button',f.title);button.type='button';button.setAttribute('aria-current',String(f.folderId===folder));button.addEventListener('click',()=>{folder=f.folderId;offset=0;for(const b of $('folders').children)b.setAttribute('aria-current',String(b===button));render();});$('folders').append(button);}
 $('search-form').addEventListener('submit',event=>{event.preventDefault();offset=0;render();});
 $('previous').addEventListener('click',()=>{offset=Math.max(0,offset-pageSize);render();});$('next').addEventListener('click',()=>{offset+=pageSize;render();});
 $('detail-close').addEventListener('click',()=>{detailRevision++;selectedEntry=null;$('detail').hidden=true;$('detail-content').replaceChildren();$('share-text').value='';});
 $('share-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('share-text').value);$('share-status').textContent='紹介文をコピーしました。';}catch{$('share-text').focus();$('share-text').select();$('share-status').textContent='自動コピーを利用できません。選択された紹介文をコピーしてください。';}});
 $('share-json').addEventListener('click',()=>{if(selectedEntry)downloadJSON(exportEntry(dataset,selectedEntry,{baseURL:base.href}).json,selectedEntry+'.json');});
 window.technicalLibrary={dataset,search:options=>search(dataset,{...(index?{postings:index.postings,terms:index.terms,docIds:index.docIds??index.entryIds}:{}),...options}),list:options=>list(dataset,options),read:async id=>{read(dataset,id);const item=await checkedJSON('items/'+id+'/entry.json');if(item.datasetVersion!==dataset.datasetVersion||item.entry.entryId!==id)throw Error('項目の版が一致しません');validateDataset({...dataset,entries:[item.entry],sources:item.sources});return item;},export:id=>exportEntry(dataset,id,{baseURL:base.href}),setIndex:value=>{index=value;offset=0;render();},clearIndex:()=>{index=undefined;render();},showDetail};
 render();const id=new URL(location.href).searchParams.get('entry');if(id&&dataset.entries.some(e=>e.entryId===id))await showDetail(id);
 return window.technicalLibrary;
})().catch(error=>{$('search-status').textContent='読込み失敗: '+error.message;throw error;});
window.addEventListener('pagehide',()=>{closed=true;requests.abort();detailRevision++;index=undefined;selectedEntry=null;},{once:true});

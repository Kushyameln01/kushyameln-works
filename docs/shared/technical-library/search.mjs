import {validateDataset,normalize,tokenize,indexedFields,FIELD_WEIGHTS,sourceURL} from './model.mjs';
export const COVERAGE='タイトル・別名・要約・タグ・対象技術と版。手順の本文は検索対象外。';
export function search(dataset,{query='',folder=null,version=null,offset=0,limit=50,postings,terms,docIds}={}){
 validateDataset(dataset);
 if(typeof query!=='string'||query.length>512)throw TypeError('Query must be at most 512 characters');
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw RangeError('Invalid page range');
 const q=normalize(query),tokens=[...new Set(tokenize(q))],tokenSet=new Set(tokens),scores=new Map();
 if(postings!==undefined){
  if(!Array.isArray(postings)||!Array.isArray(terms)||terms.some(t=>typeof t!=='string')||new Set(terms).size!==terms.length)throw TypeError('Invalid posting index');
  if(docIds!==undefined&&(!Array.isArray(docIds)||docIds.length!==dataset.entries.length||docIds.some((id,i)=>id!==dataset.entries[i].entryId)))throw TypeError('Posting document order mismatch');
  const matching=new Set(terms.flatMap((t,i)=>tokenSet.has(t)?[i+1]:[]));
  for(const p of postings){
   if(!Array.isArray(p)||p.length!==4||p.some(v=>!Number.isSafeInteger(v)||v<1)||p[0]>terms.length||p[1]>dataset.entries.length||p[2]>4)throw TypeError('Invalid posting record');
   if(matching.has(p[0]))scores.set(p[1],(scores.get(p[1])??0)+FIELD_WEIGHTS[p[2]]*Math.min(p[3],8));
  }
 }else{
  dataset.entries.forEach((e,i)=>{let score=0;indexedFields(e).forEach((field,f)=>{const counts=new Map();for(const token of tokenize(field))if(tokenSet.has(token))counts.set(token,(counts.get(token)??0)+1);for(const count of counts.values())score+=FIELD_WEIGHTS[f+1]*Math.min(count,8);});if(score)scores.set(i+1,score);});
 }
 const hits=[];
 dataset.entries.forEach((entry,i)=>{
  if(folder&&!entry.folderIds.includes(folder)||version&&version!==dataset.datasetVersion&&version!==entry.appliesTo)return;
  let score=scores.get(i+1)??0;if(q&&score===0)return;
  const matchedFields=[];
  indexedFields(entry).forEach((field,f)=>{const n=normalize(field);if(q&&n.includes(q)){score+=FIELD_WEIGHTS[f+1]*12;matchedFields.push(['title','aliases','summary','tags'][f]);}});
  if(q&&(normalize(entry.title)===q||entry.aliases.some(a=>normalize(a)===q)))score+=10000;
  hits.push({entryId:entry.entryId,title:entry.title,summary:entry.summary,folderIds:entry.folderIds,entryVersion:entry.entryVersion,appliesTo:entry.appliesTo??null,sourceUrls:entry.sourceIds.map(id=>dataset.sources.find(s=>s.sourceId===id).url),score,matchReason:!q?'一覧':matchedFields.length?'一致: '+matchedFields.join(', '):'検索語と索引語の一致'});
 });
 if(q)hits.sort((a,b)=>b.score-a.score||a.entryId.localeCompare(b.entryId));
 const items=hits.slice(offset,offset+limit),hasMore=offset+items.length<hits.length;
 return {query,datasetVersion:dataset.datasetVersion,coverage:COVERAGE,indexSource:postings===undefined?'metadata':'postings',items,totalCount:hits.length,offset,limit,hasMore,nextOffset:hasMore?offset+items.length:null,completeness:{complete:offset===0&&!hasMore,totalCount:hits.length,returnedCount:items.length,truncated:hasMore||offset>0}};
}
export function list(dataset,options={}){return search(dataset,{...options,query:''});}
export function read(dataset,entryId){validateDataset(dataset);const entry=dataset.entries.find(e=>e.entryId===entryId);if(!entry)throw RangeError('Unknown entry');return {datasetVersion:dataset.datasetVersion,entry,sources:entry.sourceIds.map(id=>dataset.sources.find(s=>s.sourceId===id))};}
export function exportEntry(dataset,entryId,{baseURL}={}){
 const {entry,sources}=read(dataset,entryId);const base=sourceURL(baseURL);const itemPath='items/'+entry.entryId+'/';const url=new URL(itemPath,base).href;
 const fixedPath='releases/'+dataset.datasetVersion+'/items/'+entry.entryId+'/';const fixedURL=new URL(fixedPath,base).href;
 const json={entryId:entry.entryId,entryVersion:entry.entryVersion,datasetVersion:dataset.datasetVersion,title:entry.title,summary:entry.summary,appliesTo:entry.appliesTo??null,conditions:entry.conditions??[],limitations:entry.limitations??[],url,fixedURL,sources:sources.map(s=>({sourceId:s.sourceId,url:s.url,section:s.section??null,access:s.access}))};
 return {json,markdown:[entry.title,entry.summary,'対象: '+(entry.appliesTo??'項目の適用条件を確認'),...json.conditions.map(c=>'条件: '+c),...json.limitations.map(c=>'限界: '+c),'項目: '+url,'固定版: '+fixedURL,'データ版: '+dataset.datasetVersion,...sources.map(s=>'根拠: '+s.url+(s.section?' — '+s.section:''))].join('\n')};
}
export function searchEntries(entries,query,options={}){return search({...options.dataset,entries},{...options,query});}

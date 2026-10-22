import test from 'node:test';
import assert from 'node:assert/strict';
const model=await import('../docs/shared/technical-library/model.mjs').catch(()=>({}));
const api=await import('../docs/shared/technical-library/search.mjs').catch(()=>({}));
const entry=(entryId,title,extra={})=>({entryId,entryVersion:1,title,aliases:[],summary:'技術の条件と根拠',tags:[],folderIds:['web'],sourceIds:['s'],visibility:'public',publicationDecision:'candidate',...extra});
const dataset={schemaVersion:1,datasetVersion:'test.1',folders:[{folderId:'web',title:'Web'}],sources:[{sourceId:'s',url:'https://example.org/spec',access:'public'}],entries:[entry('csharp','C# 識別子',{aliases:['C#']}),entry('complete','保存完了',{aliases:['IDBTransaction.complete'],summary:'IndexedDB transaction complete で保存完了を確認する'}),entry('cancel','cancel と中断',{aliases:['cancel'],summary:'Workerを終了する取消。途中状態の保存とは別'})]};
test('exact identifiers survive normalization and rank first',()=>{
 assert.equal(typeof api.search,'function','search API is implemented');
 assert.equal(api.search(dataset,{query:'Ｃ＃'}).items[0].entryId,'csharp');
 assert.equal(api.search(dataset,{query:'IDBTransaction.complete'}).items[0].entryId,'complete');
});
test('pagination distinguishes partial results and exhausted results',()=>{
 const first=api.search(dataset,{query:'',limit:2});assert.equal(first.items.length,2);assert.equal(first.hasMore,true);assert.equal(first.completeness.complete,false);
 const second=api.search(dataset,{query:'',limit:2,offset:first.nextOffset});assert.equal(second.items.length,1);assert.equal(second.hasMore,false);
 assert.equal(api.search(dataset,{query:'definitelynomatch'}).totalCount,0);
 assert.throws(()=>api.search(dataset,{query:'',limit:201}));
});
test('private candidates never reach search, indexing, or export',()=>{
 const d={...dataset,entries:[...dataset.entries,entry('secret','PRIVATE_CANARY',{visibility:'private'})]};
 assert.throws(()=>model.validateDataset(d));
 assert.throws(()=>model.prepareIndex(d));
 assert.throws(()=>api.search(d,{query:'PRIVATE_CANARY'}));
});
test('postings are the candidate source and cannot silently fall back',()=>{
 const idx=model.prepareIndex(dataset);const postings=idx.records.map(([t,d,f])=>[t,d,f,1]);
 assert.equal(api.search(dataset,{query:'C#',terms:idx.terms,postings}).items[0].entryId,'csharp');
 assert.equal(api.search(dataset,{query:'C#',terms:idx.terms,postings:[]}).totalCount,0);
 assert.throws(()=>api.search(dataset,{query:'C#',terms:idx.terms,postings:[[1,999,1,1]]}));
});
test('token IDs and document IDs are stable, one based, and sorted',()=>{
 const a=model.prepareIndex(dataset),b=model.prepareIndex(structuredClone(dataset));assert.deepEqual(a,b);
 assert.deepEqual(a.entryIds,dataset.entries.map(e=>e.entryId));
 for(const r of a.records){assert.ok(r[0]>=1&&r[0]<=a.terms.length);assert.ok(r[1]>=1&&r[1]<=3);assert.ok(r[2]>=1&&r[2]<=4);}
 for(let i=1;i<a.records.length;i++){const p=a.records[i-1],r=a.records[i];assert.ok(p[1]<r[1]||p[1]===r[1]&&(p[0]<r[0]||p[0]===r[0]&&p[2]<=r[2]));}
});
test('public source URLs reject script schemes and credentials',()=>{
 assert.throws(()=>model.validateDataset({...dataset,sources:[{sourceId:'s',url:'javascript:alert(1)',access:'public'}]}));
 assert.throws(()=>model.validateDataset({...dataset,sources:[{sourceId:'s',url:'https://user:pass@example.org',access:'public'}]}));
});
test('share data preserves source links, version, and source entry',()=>{
 const out=api.exportEntry(dataset,'complete',{baseURL:'https://example.org/works/technical-library/'});
 assert.match(out.markdown,/test\.1/);assert.match(out.markdown,/https:\/\/example\.org\/spec/);assert.equal(out.json.entryId,'complete');
 assert.match(out.json.url,/\/works\/technical-library\/items\/complete\/$/);
});
test('version filters and source provenance are explicit',()=>{
 assert.equal(api.search(dataset,{query:'',version:'old'}).totalCount,0);
 const r=api.search(dataset,{query:'保存完了'});assert.equal(r.datasetVersion,'test.1');assert.deepEqual(r.items[0].sourceUrls,['https://example.org/spec']);assert.match(r.coverage,/本文/);
});
test('metadata and posting search use identical term-frequency scoring',()=>{
 const d={...dataset,entries:[entry('repeat','repeat',{summary:Array(30).fill('repeat').join(' ')}),entry('other','other',{summary:'repeat'})]};
 const idx=model.prepareIndex(d),counts=new Map();for(const row of idx.records){const key=row.join(':');counts.set(key,(counts.get(key)??0)+1);}
 const postings=[...counts].map(([key,n])=>[...key.split(':').map(Number),n]);
 const a=api.search(d,{query:'repeat'}),b=api.search(d,{query:'repeat',terms:idx.terms,postings});
 assert.deepEqual(a.items,b.items);
});

import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateDataset} from '../../docs/shared/technical-library/model.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),out=resolve(root,'docs/technical-library');
const data=validateDataset(JSON.parse(await readFile(resolve(out,'catalog-source.json'),'utf8')));
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest={schemaVersion:1,datasetVersion:data.datasetVersion,candidate:false,files:{}};
async function emit(path,contents){const full=resolve(out,path);await mkdir(resolve(full,'..'),{recursive:true});await writeFile(full,contents);manifest.files[path]={sha256:sha(contents),bytes:Buffer.byteLength(contents)};}
await emit('items/index.html','<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>技術情報の項目</title></head><body><main><h1>技術情報の項目</h1><p><a href="../">目録で項目を検索する</a></p></main></body></html>\n');
const entries=[];
for(const original of data.entries){
 const entry={...original,bodyHash:sha(original.body??'')};const item={schemaVersion:1,datasetVersion:data.datasetVersion,entry,sources:entry.sourceIds.map(id=>data.sources.find(s=>s.sourceId===id))};
 const {body,...metadata}=entry;entries.push(metadata);
 const json=JSON.stringify(item,null,2)+'\n';
 for(const prefix of ['',`releases/${data.datasetVersion}/`]){
  const depth=prefix?'../../../../':'../../';
  await emit(prefix+`items/${entry.entryId}/entry.json`,json);
  const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(entry.title)} | Works 技術情報</title><link rel="stylesheet" href="${depth}style.css"></head><body><main><p class="candidate">技術情報ライブラリ · データ版 ${escape(data.datasetVersion)}</p><nav aria-label="パンくず"><a href="${depth}">技術情報ライブラリ</a> / ${escape(data.folders.find(f=>f.folderId===entry.folderIds[0]).title)}</nav><article><h1>${escape(entry.title)}</h1><p class="summary">${escape(entry.summary)}</p><p>対象: ${escape(entry.appliesTo)}</p><h2>適用条件</h2><ul>${(entry.conditions??[]).map(x=>`<li>${escape(x)}</li>`).join('')}</ul><h2>判断の材料</h2><p class="body-copy">${escape(entry.body)}</p><h2>限界</h2><ul>${(entry.limitations??[]).map(x=>`<li>${escape(x)}</li>`).join('')}</ul><h2>根拠</h2><ul>${item.sources.map(s=>`<li><a href="${escape(s.url)}" rel="noopener noreferrer">${escape(s.title)}</a> — ${escape(s.section)}<br>公開資料 · 内容確認 ${escape(s.contentCheckedAt)} · ${escape(s.revision)}</li>`).join('')}</ul><p>独自要約。出典の本文転載ではありません。候補版の動作・性能や公開先の合格を示す記録ではありません。</p><p><a href="entry.json">構造化JSON</a> · <a href="${depth}?entry=${encodeURIComponent(entry.entryId)}">共有文を作る</a></p></article></main></body></html>\n`;
  await emit(prefix+`items/${entry.entryId}/index.html`,html);
 }
}
const catalog={...data,entries};
await emit('catalog.json',JSON.stringify(catalog)+'\n');
await emit(`releases/${data.datasetVersion}/catalog.json`,JSON.stringify(catalog)+'\n');
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const publication={status:'candidate-only; human publication review required',datasetVersion:data.datasetVersion,privateSourcesIncluded:false,licenseReview:'Original short summaries; external source links only. Source licenses and all dependencies require review before publication.',files:[]};
async function inventory(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const full=resolve(dir,ent.name);if(ent.isDirectory())await inventory(full);else{const bytes=await readFile(full);publication.files.push({path:relative(root,full),sha256:sha(bytes),bytes:bytes.length,purpose:'Technical library candidate',publicationApproved:false});}}}
await inventory(out);
if(process.env.PUBLICATION_REPORT)await writeFile(resolve(process.env.PUBLICATION_REPORT),JSON.stringify(publication,null,2)+'\n');
console.log(JSON.stringify({entries:entries.length,manifestFiles:Object.keys(manifest.files).length,datasetVersion:data.datasetVersion,status:'generated candidate; not published'}));

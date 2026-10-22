// Candidate data contract. No fetched content is executable configuration.
export const SCHEMA_VERSION=1;
export const FIELD_WEIGHTS=Object.freeze({1:8,2:7,3:2,4:4});
const ID=/^[a-z0-9][a-z0-9._-]{0,79}$/;
export function normalize(value){return String(value??'').normalize('NFKC').toLowerCase().trim();}
export function tokenize(value){
 const text=normalize(value),out=[];
 for(const part of text.match(/[a-z0-9_][a-z0-9_+#.:-]*|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu)??[]){
  out.push(part);
  if(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(part)&&part.length>2){const chars=Array.from(part);for(let i=0;i<chars.length-1;i++)out.push(chars.slice(i,i+2).join(''));}
 }
 return out;
}
export function sourceURL(value){
 if(typeof value!=='string')throw TypeError('Source URL must be a string');
 const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw TypeError('Unsafe source URL');return u.href;
}
const strings=(xs,label)=>{if(!Array.isArray(xs)||xs.some(x=>typeof x!=='string'||x.length>16384))throw TypeError('Invalid '+label);};
export function validateDataset(dataset){
 if(dataset?.schemaVersion!==SCHEMA_VERSION||typeof dataset.datasetVersion!=='string'||!ID.test(dataset.datasetVersion))throw TypeError('Invalid dataset version');
 if(!Array.isArray(dataset.entries)||dataset.entries.length>10000||!Array.isArray(dataset.sources)||!Array.isArray(dataset.folders))throw TypeError('Invalid dataset collections');
 const sourceIds=new Set(),folderIds=new Set(),entryIds=new Set();
 for(const s of dataset.sources){if(!s||!ID.test(s.sourceId)||sourceIds.has(s.sourceId)||s.access!=='public')throw TypeError('Invalid public source');sourceURL(s.url);sourceIds.add(s.sourceId);}
 for(const f of dataset.folders){if(!f||!ID.test(f.folderId)||folderIds.has(f.folderId))throw TypeError('Invalid folder');folderIds.add(f.folderId);}
 for(const e of dataset.entries){
  if(!e||!ID.test(e.entryId)||entryIds.has(e.entryId)||!Number.isSafeInteger(e.entryVersion)||e.entryVersion<1)throw TypeError('Invalid entry identity');entryIds.add(e.entryId);
  if(e.visibility!=='public'||!['candidate','approved'].includes(e.publicationDecision))throw TypeError('Nonpublic entry is not permitted in a public candidate');
  if(typeof e.title!=='string'||!e.title.trim()||e.title.length>512||typeof e.summary!=='string'||e.summary.length>16384)throw TypeError('Invalid entry text');
  for(const key of ['aliases','tags','folderIds','sourceIds'])strings(e[key],key);
  if(!e.sourceIds.length||e.sourceIds.some(id=>!sourceIds.has(id))||!e.folderIds.length||e.folderIds.some(id=>!folderIds.has(id)))throw TypeError('Unknown entry source or folder');
  if(e.claims){if(!Array.isArray(e.claims))throw TypeError('Invalid claims');for(const c of e.claims)if(typeof c.text!=='string'||!['specification','measurement','inference'].includes(c.kind)||!Array.isArray(c.sourceIds)||!c.sourceIds.length||c.sourceIds.some(id=>!e.sourceIds.includes(id)))throw TypeError('Invalid claim provenance');}
 }
 return dataset;
}
export function indexedFields(entry){return [entry.title,entry.aliases.join(' '),entry.summary,[...entry.tags,entry.technology??'',entry.appliesTo??''].join(' ')];}
export function prepareIndex(dataset){
 validateDataset(dataset);
 // Intern and number tokens one entry at a time. Do not retain all tokenized
 // fields and a flattened copy alongside the numeric input tuples.
 const provisional=new Map(),records=[];
 dataset.entries.forEach((entry,doc)=>indexedFields(entry).forEach((value,field)=>{
  for(const token of tokenize(value)){
   let id=provisional.get(token);if(id===undefined){id=provisional.size+1;provisional.set(token,id);}
   records.push([id,doc+1,field+1]);
  }
 }));
 const terms=[...provisional.keys()].sort(),remap=new Uint32Array(terms.length+1);
 terms.forEach((term,i)=>{remap[provisional.get(term)]=i+1;});
 for(const record of records)record[0]=remap[record[0]];
 records.sort((a,b)=>a[1]-b[1]||a[0]-b[0]||a[2]-b[2]);
 return {terms,records,entryIds:dataset.entries.map(e=>e.entryId)};
}

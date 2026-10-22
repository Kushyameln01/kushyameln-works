// Private browser-only records. No public dataset, export, or compute API is used.
import {normalize,tokenize} from './model.mjs';
import {resolvePrivateEvidence} from './private-evidence.mjs';
export const PRIVATE_SCHEMA_VERSION=1;
export const PRIVATE_LIMITS=Object.freeze({jsonBytes:16*1024*1024,artifactBytes:16*1024*1024,entries:10000});
const ID=/^[a-z0-9][a-z0-9._-]{0,79}$/;
const HASH=/^[a-f0-9]{64}$/;
const encoder=new TextEncoder();
const fail=code=>{throw Error(code);};
const id=x=>typeof x==='string'&&ID.test(x);
function string(x,max=16384){return typeof x==='string'&&x.length<=max;}
function canonical(value,depth=0){
 if(depth>40)fail('PRIVATE_JSON_DEPTH');
 if(value===null||typeof value==='boolean'||typeof value==='string')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))fail('PRIVATE_JSON_NUMBER');return value;}
 if(Array.isArray(value))return value.map(x=>canonical(x,depth+1));
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)){
  const out=Object.create(null);for(const key of Object.keys(value).sort())out[key]=canonical(value[key],depth+1);return out;
 }
 fail('PRIVATE_JSON_VALUE');
}
const encoded=value=>encoder.encode(JSON.stringify(canonical(value)));
export async function privateDigest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function copyJSON(value){const bytes=encoded(value);if(bytes.length>PRIVATE_LIMITS.jsonBytes)fail('PRIVATE_JSON_LIMIT');return JSON.parse(new TextDecoder().decode(bytes));}
function array(value,max=10000){if(!Array.isArray(value)||value.length>max)fail('PRIVATE_COLLECTION');return value;}
function unique(items,key){const set=new Set();for(const item of array(items)){if(!item||!id(item[key])||set.has(item[key]))fail('PRIVATE_DUPLICATE_OR_ID');set.add(item[key]);}return set;}
function strings(value,max=10000){return array(value,max).every(x=>string(x));}
function reference(ref){
 if(!ref||!string(ref.value,4096))fail('PRIVATE_REFERENCE');
 if(ref.kind==='url'){let u;try{u=new URL(ref.value);}catch{fail('PRIVATE_REFERENCE');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)fail('PRIVATE_REFERENCE');}
 else if(ref.kind==='space-page'){if(!/^page_[a-zA-Z0-9_-]+$/.test(ref.value))fail('PRIVATE_REFERENCE');}
 else if(ref.kind==='library-file'){if(!/^libfile[_-][a-zA-Z0-9_-]+$/.test(ref.value))fail('PRIVATE_REFERENCE');}
 else fail('PRIVATE_REFERENCE');
}
export function validatePrivateDataset(d){
 if(!d||d.schemaVersion!==1||d.namespace!=='private'||d.visibility!=='private'||d.publicationDecision!=='not-approved'||!id(d.datasetId)||!id(d.datasetVersion))fail('PRIVATE_SCHEMA');
 const entries=unique(d.entries,'entryId'),sources=unique(d.sources,'sourceId'),folders=unique(d.folders,'folderId');
 if(entries.size>PRIVATE_LIMITS.entries)fail('PRIVATE_ENTRY_LIMIT');
 for(const f of d.folders)if(!string(f.title,512)||!f.title.trim())fail('PRIVATE_FOLDER');
 for(const s of d.sources){reference(s.reference);if(!string(s.title,512)||!s.title.trim()||!['public','restricted','unknown'].includes(s.access)||!['unread','partial','read'].includes(s.contentStatus))fail('PRIVATE_SOURCE');if(s.contentHash!==undefined&&!HASH.test(s.contentHash))fail('PRIVATE_SOURCE_HASH');}
 for(const e of d.entries){
  if(e.visibility!=='private'||e.publicationDecision!=='not-approved'||!Number.isSafeInteger(e.entryVersion)||e.entryVersion<1||!string(e.title,512)||!e.title.trim()||!string(e.summary)||!strings(e.aliases)||!strings(e.tags)||!strings(e.sourceIds)||!strings(e.folderIds))fail('PRIVATE_ENTRY');
  if(!e.sourceIds.length||!e.folderIds.length||e.sourceIds.some(x=>!sources.has(x))||e.folderIds.some(x=>!folders.has(x)))fail('PRIVATE_DANGLING_REFERENCE');
  for(const c of array(e.claims??[])){if(!string(c.text)||!['specification','measurement','inference','unverified'].includes(c.kind)||!strings(c.sourceIds)||!c.sourceIds.length||c.sourceIds.some(x=>!e.sourceIds.includes(x))||!string(c.locator))fail('PRIVATE_CLAIM');}
 }
 if(!d.provenance||!string(d.provenance.mappingVersion,128)||!d.provenance.mappingVersion)fail('PRIVATE_PROVENANCE');
 unique(d.provenance.sourceArtifacts,'artifactId');
 for(const a of d.provenance.sourceArtifacts)if(!string(a.name,512)||!a.name||!HASH.test(a.sha256)||!Number.isSafeInteger(a.bytes)||a.bytes<0)fail('PRIVATE_ARTIFACT_MANIFEST');
 return d;
}
const counts=d=>({entries:d.entries.length,sources:d.sources.length,folders:d.folders.length,artifacts:d.provenance.sourceArtifacts.length});
const snapshot=r=>({incarnation:r.incarnation,generation:r.generation,hash:r.hash});
function expect(r,e){if(!e||typeof e.incarnation!=='string'||!Number.isSafeInteger(e.generation)||!HASH.test(e.hash)||!r||r.incarnation!==e.incarnation||r.generation!==e.generation||r.hash!==e.hash)fail('STALE_DATASET');}
async function prepare(dataset,artifacts){
 const body=validatePrivateDataset(copyJSON(dataset));
 let total=0;const ids=new Set();const copied=array(artifacts).map(a=>{
  if(!a||!id(a.artifactId)||ids.has(a.artifactId)||!string(a.name,512)||!(a.bytes instanceof Uint8Array))fail('PRIVATE_ARTIFACT');
  ids.add(a.artifactId);total+=a.bytes.byteLength;if(total>PRIVATE_LIMITS.artifactBytes)fail('PRIVATE_ARTIFACT_LIMIT');
  return {datasetId:body.datasetId,artifactId:a.artifactId,name:a.name,bytes:new Uint8Array(a.bytes)};
 });
 if(copied.length!==body.provenance.sourceArtifacts.length)fail('PRIVATE_ARTIFACT_COUNT');
 for(const a of copied){const m=body.provenance.sourceArtifacts.find(m=>m.artifactId===a.artifactId);a.sha256=await privateDigest(a.bytes);if(!m||m.name!==a.name||m.bytes!==a.bytes.length||m.sha256!==a.sha256)fail('PRIVATE_ARTIFACT_HASH');}
 return {body,artifacts:copied,hash:await privateDigest(encoded(body)),counts:counts(body)};
}
export function openPrivateLibrary({dbName='works-technical-library-private-v1'}={}){
 if(typeof dbName!=='string'||!dbName.startsWith('works-technical-library-private-'))return Promise.reject(Error('PRIVATE_DB_NAME'));
 return new Promise((resolve,reject)=>{
  let abandoned=false;const req=indexedDB.open(dbName,1);
  req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('datasets',{keyPath:'datasetId'});const a=db.createObjectStore('artifacts',{keyPath:['datasetId','artifactId']});a.createIndex('datasetId','datasetId');};
  req.onerror=()=>reject(req.error);req.onblocked=()=>{abandoned=true;reject(Error('PRIVATE_DB_BLOCKED'));};
  req.onsuccess=()=>{if(abandoned){req.result.close();return;}resolve(new PrivateLibrary(req.result));};
 });
}
class PrivateLibrary{
 constructor(db){this.db=db;this.closed=false;db.onversionchange=()=>this.close();}
 status(){return {status:this.closed?'closed':'open',namespace:'private',schemaVersion:1,storageBoundary:'same-browser-profile-and-origin'};}
 assertOpen(){if(this.closed)fail('PRIVATE_LIBRARY_CLOSED');}
 close(){if(!this.closed){this.closed=true;this.db.close();}}
 async get(datasetId,full=false){
  this.assertOpen();if(!id(datasetId))fail('PRIVATE_DATASET_ID');
  const result=await new Promise((resolve,reject)=>{const tx=this.db.transaction(full?['datasets','artifacts']:['datasets'],'readonly');let row,artifacts;tx.objectStore('datasets').get(datasetId).onsuccess=e=>row=e.target.result;if(full)tx.objectStore('artifacts').index('datasetId').getAll(datasetId).onsuccess=e=>artifacts=e.target.result;tx.oncomplete=()=>resolve({row,artifacts});tx.onabort=()=>reject(tx.error||Error('PRIVATE_READ_ABORT'));});
  this.assertOpen();if(!result.row)fail('PRIVATE_DATASET_MISSING');
  try{
   const r=result.row;validatePrivateDataset(r.body);if(r.datasetId!==datasetId||r.body.datasetId!==datasetId||typeof r.incarnation!=='string'||!Number.isSafeInteger(r.generation)||r.generation<1||r.hash!==await privateDigest(encoded(r.body))||JSON.stringify(r.counts)!==JSON.stringify(counts(r.body)))fail('CORRUPT_PRIVATE_DATASET');
   if(full){const verified=await prepare(r.body,result.artifacts);if(verified.hash!==r.hash)fail('CORRUPT_PRIVATE_DATASET');}
  }catch{fail('CORRUPT_PRIVATE_DATASET');}
  this.assertOpen();return result;
 }
 async read(datasetId,{expected}={}){const {row,artifacts}=await this.get(datasetId,true);if(expected)expect(row,expected);return {dataset:row.body,artifacts,snapshot:snapshot(row),counts:row.counts,verification:'metadata-and-artifact-bytes'};}
 async listDatasets(){
  this.assertOpen();const ids=await new Promise((resolve,reject)=>{const tx=this.db.transaction('datasets','readonly'),q=tx.objectStore('datasets').getAllKeys();tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});
  const out=[];for(const id of ids){const {row}=await this.get(id);out.push({datasetId:id,datasetVersion:row.body.datasetVersion,snapshot:snapshot(row),counts:row.counts,verification:'metadata-and-artifact-manifest'});}return out;
 }
 async register(dataset,artifacts,{expected=null}={}){if(expected!==null)fail('PRIVATE_CREATE_EXPECTATION');return this.write(dataset,artifacts,null);}
 async replace(dataset,artifacts,{expected}={}){if(!expected)fail('PRIVATE_EXPECTED_REQUIRED');return this.write(dataset,artifacts,expected);}
 async write(dataset,artifacts,expected){
  this.assertOpen();expected=expected===null?null:copyJSON(expected);
  // Capture caller input before any asynchronous read; later mutation cannot alter this write.
  const preparation=prepare(dataset,artifacts);const p=await preparation;
  if(expected!==null)await this.read(p.body.datasetId,{expected});this.assertOpen();
  return new Promise((resolve,reject)=>{
   const tx=this.db.transaction(['datasets','artifacts'],'readwrite');let reason,out;
   tx.objectStore('datasets').get(p.body.datasetId).onsuccess=e=>{try{
    const old=e.target.result;
    if(expected===null){if(old)fail('PRIVATE_DATASET_EXISTS');}else{expect(old,expected);if(old.body.datasetVersion===p.body.datasetVersion&&old.hash!==p.hash)fail('PRIVATE_VERSION_REUSE');if(old.hash===p.hash){out=snapshot(old);return;}}
    const row={datasetId:p.body.datasetId,body:p.body,hash:p.hash,counts:p.counts,incarnation:old?.incarnation??crypto.randomUUID(),generation:(old?.generation??0)+1};out=snapshot(row);
    tx.objectStore('datasets').put(row);const store=tx.objectStore('artifacts');
    store.index('datasetId').openCursor(p.body.datasetId).onsuccess=e=>{try{const c=e.target.result;if(c){c.delete();c.continue();}else for(const a of p.artifacts)store.put(a);}catch(err){reason=err;tx.abort();}};
   }catch(err){reason=err;tx.abort();}};
   tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(reason||tx.error||Error('PRIVATE_SAVE_ABORT'));
  });
 }
 async remove(datasetId,{expected}={}){
  this.assertOpen();if(!expected)fail('PRIVATE_EXPECTED_REQUIRED');expected=copyJSON(expected);
  return new Promise((resolve,reject)=>{const tx=this.db.transaction(['datasets','artifacts'],'readwrite');let reason;tx.objectStore('datasets').get(datasetId).onsuccess=e=>{try{expect(e.target.result,expected);tx.objectStore('datasets').delete(datasetId);tx.objectStore('artifacts').index('datasetId').openCursor(datasetId).onsuccess=e=>{try{const c=e.target.result;if(c){c.delete();c.continue();}}catch(err){reason=err;tx.abort();}};}catch(err){reason=err;tx.abort();}};tx.oncomplete=()=>resolve({deleted:true,datasetId});tx.onabort=()=>reject(reason||tx.error||Error('PRIVATE_DELETE_ABORT'));});
 }
 async search(datasetId,{query='',offset=0,limit=50,expected}={}){
  if(!string(query,512)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)fail('PRIVATE_SEARCH_OPTIONS');
  const {row}=await this.get(datasetId);if(expected)expect(row,expected);const q=normalize(query),tokens=new Set(tokenize(q));
  const hits=row.body.entries.map(e=>{const fields=[e.title,...e.aliases,e.summary,...e.tags];let score=0;for(const f of fields)for(const token of tokenize(f))if(tokens.has(token))score++;if(q&&(normalize(e.title)===q||e.aliases.some(a=>normalize(a)===q)))score+=10000;return {entryId:e.entryId,title:e.title,summary:e.summary,score,matchReason:q?'タイトル・別名・要約・タグ':'一覧'};}).filter(e=>!q||e.score>0);
  if(q)hits.sort((a,b)=>b.score-a.score||a.entryId.localeCompare(b.entryId));const items=hits.slice(offset,offset+limit),hasMore=offset+items.length<hits.length;
  return {namespace:'private',datasetId,datasetVersion:row.body.datasetVersion,snapshot:snapshot(row),coverage:'タイトル・別名・要約・タグ。本文と原本添付は検索対象外。',verification:'metadata-and-artifact-manifest',items,totalCount:hits.length,offset,limit,hasMore,nextOffset:hasMore?offset+items.length:null,completeness:{complete:offset===0&&!hasMore,totalCount:hits.length,returnedCount:items.length,truncated:offset>0||hasMore}};
 }
 async readEntry(datasetId,entryId,{expected}={}){
  if(!expected)fail('PRIVATE_EXPECTED_REQUIRED');expected=copyJSON(expected);const value=await this.read(datasetId,{expected}),entry=value.dataset.entries.find(e=>e.entryId===entryId);if(!entry)fail('PRIVATE_ENTRY_MISSING');
  const evidence=await resolvePrivateEvidence(value.dataset,entry,value.snapshot,{artifacts:value.artifacts});this.assertOpen();
  return {namespace:'private',datasetId,datasetVersion:value.dataset.datasetVersion,snapshot:value.snapshot,entry,sources:entry.sourceIds.map(id=>value.dataset.sources.find(s=>s.sourceId===id)),provenance:value.dataset.provenance,verification:value.verification,evidence};
 }
 async readEvidence(datasetId,entryId,{expected,offset=0,limit=20}={}){
  if(!expected)fail('PRIVATE_EXPECTED_REQUIRED');expected=copyJSON(expected);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50)fail('PRIVATE_EVIDENCE_OPTIONS');
  const value=await this.read(datasetId,{expected}),entry=value.dataset.entries.find(e=>e.entryId===entryId);if(!entry)fail('PRIVATE_ENTRY_MISSING');
  const evidence=await resolvePrivateEvidence(value.dataset,entry,value.snapshot,{offset,limit,artifacts:value.artifacts});this.assertOpen();return evidence;
 }

}

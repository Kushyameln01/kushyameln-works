import {applyCitationCorrections} from './private-corrections.mjs';
// Read-only projection of preserved classification records; never a new claim approval.
const HASH=/^[a-f0-9]{64}$/;
const invalid=()=>{throw Error('PRIVATE_EVIDENCE_INVALID');};
const text=x=>typeof x==='string';
const str=x=>text(x)&&x.length>0;
const list=x=>{if(!Array.isArray(x))invalid();return x;};
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
function url(value){if(!str(value))invalid();let u;try{u=new URL(value);}catch{invalid();}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)invalid();return u;}
function keyed(rows,key){const map=new Map();for(const row of list(rows)){const k=row&&key(row);if(!str(k)||map.has(k))invalid();map.set(k,row);}return map;}
const select=(object,keys)=>Object.fromEntries(keys.map(k=>[k,object[k]??null]));
function containsReferenceToken(context,target){
 // Deliberately limited grammar: complete Markdown target, autolink, or
 // whitespace/backtick-delimited bare reference. Ambiguous text fails closed.
 for(const match of context.matchAll(/\]\(([^()\s]+)\)/gu))if(match[1]===target)return true;
 for(const match of context.matchAll(/<([^<>\s]+)>/gu))if(match[1]===target)return true;
 return context.split(/[\s`]+/u).some(token=>token===target);
}
export async function resolvePrivateEvidence(dataset,entry,snapshot,{offset=0,limit=20,artifacts}={}){
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('PRIVATE_EVIDENCE_OPTIONS');
 const base={schemaVersion:'classification-evidence-1',snapshot:{...snapshot},datasetId:dataset.datasetId,datasetVersion:dataset.datasetVersion,entryId:entry.entryId};
 const markers=[entry.originalSourceId,dataset.originalCatalog,dataset.originalCorrespondence,dataset.attachmentFollowup,dataset.citationCorrections];
 if(markers.every(x=>x===undefined))return {...base,available:false,reason:'NO_CLASSIFICATION_CORRESPONDENCE',items:[],counts:{citations:0,attachments:0},totalCount:0,offset,limit,hasMore:false,nextOffset:null,completeness:{complete:true,totalCount:0,returnedCount:0,truncated:false}};
 const overlay=await applyCitationCorrections(dataset,artifacts);
 const catalog=dataset.originalCatalog,correspondence=overlay?.correspondence??dataset.originalCorrespondence,followup=dataset.attachmentFollowup;
 if(!str(entry.originalSourceId)||!catalog||!correspondence||!followup||catalog.schemaVersion!=='classification-preparation-1.0'||correspondence.schemaVersion!=='classification-preparation-1.0'||!str(catalog.datasetVersion))invalid();
 const originals=keyed(catalog.sources,x=>x.sourceId),original=originals.get(entry.originalSourceId);
 if(!original||!str(original.pageId)||!HASH.test(original.bodyHash)||original.bodyHashAlgorithm!=='sha256-utf8-returned-markdown')invalid();
 const pageURL=url(original.url);if(pageURL.href!==`https://chatgpt.com/space/${original.pageId}`)invalid();
 const linked=dataset.sources.filter(s=>entry.sourceIds.includes(s.sourceId)&&s.originalSourceId===entry.originalSourceId);
 if(linked.length!==1||linked[0].reference.kind!=='space-page'||linked[0].reference.value!==original.pageId||linked[0].contentHash!==original.bodyHash)invalid();
 const externals=keyed(correspondence.externalSources,x=>x.sourceId);
 const passages=keyed(correspondence.sourcePassages,x=>str(x.registrationSourceId)&&str(x.blockId)?JSON.stringify([x.registrationSourceId,x.blockId]):null);
 const checked=new Set();
 async function location(sourceId,loc,quote){
  if(!loc||!str(loc.blockId)||!HASH.test(loc.blockHash)||!(loc.heading===null||text(loc.heading))||!Number.isSafeInteger(loc.lineInBlock)||loc.lineInBlock<1||!text(quote))invalid();
  const key=JSON.stringify([sourceId,loc.blockId]),passage=passages.get(key);
  if(!passage||!text(passage.text)||passage.blockHash!==loc.blockHash)invalid();
  if(!checked.has(key)){if(await sha(passage.text)!==passage.blockHash)invalid();checked.add(key);}
  if(passage.text.split('\n')[loc.lineInBlock-1]!==quote)invalid();
 }
 const citations=[];
 for(const [citationIndex,c] of list(correspondence.citationOccurrences).entries()){
  if(!c||!str(c.registrationSourceId))invalid();if(c.registrationSourceId!==entry.originalSourceId)continue;
  const external=externals.get(c.externalSourceId);if(!external||!text(c.relationshipStatus)||!(c.originalLabel===null||text(c.originalLabel)))invalid();url(external.url);
  await location(c.registrationSourceId,c.location,c.sourceText);
  // The target URL must actually occur in this recorded quotation, not merely
  // be a valid but unrelated row in the external-source table.
  const correction=overlay?.annotations.get(citationIndex)??null;
  if(!correction&&!containsReferenceToken(c.sourceText,external.url))invalid();
  citations.push({type:'citation',...(correction?{correction}:{}),...(correction?.sourceRole==='local_execution_example'?{sourceRole:'local_execution_example',eligibleAsExternalTechnicalEvidence:false}:{}),citationIndex,registrationSourceId:c.registrationSourceId,externalSourceId:c.externalSourceId,originalLabel:c.originalLabel,sourceText:c.sourceText,location:{...c.location},relationshipStatus:c.relationshipStatus,externalSource:select(external,['sourceId','url','titlesInSource','documentTitle','publisher','publisherStatus','version','commit','verificationStatus','contentCheckedAt','accessCheckedAt','updatedAt','accessConditions','check'])});
 }
 const originalsAttachments=list(correspondence.unreadAttachments);keyed(originalsAttachments,x=>x.reference);
 let received=null;
 if(followup.result!==null){
  const r=followup.result;
  if(!r||!str(r.page_id)||!str(r.reference)||!originalsAttachments.some(a=>a.reference===r.reference)||!text(r.text)||!HASH.test(r.sha256)||!Number.isSafeInteger(r.text_byte_size)||r.text_byte_size<0||!text(followup.retrievedAt)||!text(followup.note))invalid();
  if(r.text_representation!=='source'||r.kind!=='text'||!str(r.mime_type)||!Number.isSafeInteger(r.byte_size)||r.byte_size!==r.text_byte_size||new TextEncoder().encode(r.text).length!==r.text_byte_size||await sha(r.text)!==r.sha256)invalid();
  received={retrievedAt:followup.retrievedAt,note:followup.note,result:select(r,['reference','page_id','mime_type','byte_size','sha256','text_representation','text_byte_size','kind'])};
 }
 const attachments=[];
 for(const [attachmentIndex,a] of originalsAttachments.entries()){
  if(!str(a.reference)||!list(a.labels).every(text))invalid();
  for(const [occurrenceIndex,o] of list(a.occurrences).entries()){
   if(!o||!str(o.sourceId))invalid();if(o.sourceId!==entry.originalSourceId)continue;
   await location(o.sourceId,o.location,o.context);if(!containsReferenceToken(o.context,a.reference))invalid();const matched=received?.result.reference===a.reference?received:null;
   attachments.push({type:'attachment',attachmentIndex,occurrenceIndex,reference:a.reference,labels:[...a.labels],context:o.context,location:{...o.location},originalStatus:'unread',followup:matched,effectiveStatus:matched?'report-text-retrieved':'unretrieved'});
  }
 }
 const all=[...citations,...attachments],items=all.slice(offset,offset+limit),hasMore=offset+items.length<all.length;
 return {...base,available:true,page:{...select(original,['sourceId','pageId','url','title','bodyHash','bodyHashAlgorithm','retrievedAt','updatedAt','currentSequence','statedVersionAndDateEvidence','reviewCoverage']),originalDatasetVersion:catalog.datasetVersion},items,counts:{citations:citations.length,attachments:attachments.length},totalCount:all.length,offset,limit,hasMore,nextOffset:hasMore?offset+items.length:null,completeness:{complete:offset===0&&!hasMore,totalCount:all.length,returnedCount:items.length,truncated:offset>0||hasMore}};
}

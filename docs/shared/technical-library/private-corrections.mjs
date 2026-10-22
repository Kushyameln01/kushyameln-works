// Explicit raw-artifact overlay. Hash integrity is not publisher authentication.
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const invalid=()=>{throw Error('PRIVATE_CORRECTION_INVALID');};
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
const sha=value=>hash(encoder.encode(value));
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));return x;}
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function exactly(rows,predicate){if(!Array.isArray(rows))invalid();const matches=rows.filter(predicate);if(matches.length!==1)invalid();return matches[0];}
function range(pair,length){if(!Array.isArray(pair)||pair.length!==2||pair.some(n=>!Number.isSafeInteger(n))||pair[0]<0||pair[1]<=pair[0]||pair[1]>length)invalid();return pair;}
function span(value,spec,target){
 if(typeof value!=='string'||!spec||typeof target!=='string')invalid();
 const chars=Array.from(value),bytes=encoder.encode(value);
 const cp=range(spec.unicodeCodePoints0BasedEndExclusive,chars.length),u16=range(spec.utf16CodeUnits0BasedEndExclusive,value.length),u8=range(spec.utf8Bytes0BasedEndExclusive,bytes.length);
 const prefix=chars.slice(0,cp[0]).join(''),middle=chars.slice(cp[0],cp[1]).join('');
 if(middle!==target||value.slice(...u16)!==target||decoder.decode(bytes.slice(...u8))!==target||prefix.length!==u16[0]||(prefix+middle).length!==u16[1]||encoder.encode(prefix).length!==u8[0]||encoder.encode(prefix+middle).length!==u8[1])invalid();
 return u16;
}
export async function applyCitationCorrections(dataset,artifacts){
 if(dataset.citationCorrections===undefined)return null;
 try{return await apply(dataset,artifacts);}catch{invalid();}
}
async function apply(dataset,artifacts){
 const wrapper=dataset.citationCorrections,add=wrapper?.addendum;
 if(!wrapper||typeof wrapper.artifactId!=='string'||!add||add.schemaVersion!=='citation-correction-addendum-1.0'||!Array.isArray(artifacts)||!Array.isArray(add.originalFiles)||add.originalFiles.length!==5||!Array.isArray(add.corrections)||add.corrections.length!==3)invalid();
 const manifest=dataset.provenance?.sourceArtifacts;
 async function checkedArtifact(artifactId){
  const declaration=exactly(manifest,m=>m.artifactId===artifactId),a=exactly(artifacts,a=>a.artifactId===artifactId);
  if(!(a.bytes instanceof Uint8Array)||a.name!==declaration.name||a.bytes.length!==declaration.bytes||await hash(a.bytes)!==declaration.sha256)invalid();return a;
 }
 const addRaw=await checkedArtifact(wrapper.artifactId),addHash=await hash(addRaw.bytes);
 if(!same(JSON.parse(decoder.decode(addRaw.bytes)),add))invalid();
 const names=new Set(),baseRaw=new Map();
 for(const spec of add.originalFiles){
  if(!spec||typeof spec.name!=='string'||names.has(spec.name))invalid();names.add(spec.name);
  const m=exactly(manifest,m=>m.name===spec.name);if(m.artifactId===wrapper.artifactId)invalid();const a=await checkedArtifact(m.artifactId);
  if(a.bytes.length!==spec.bytes||await hash(a.bytes)!==spec.sha256)invalid();baseRaw.set(spec.name,a);
 }
 if(manifest.length!==6||artifacts.length!==6)invalid();
 for(const [name,key] of [['source-catalog.json','originalCatalog'],['source-correspondence.json','originalCorrespondence'],['attachment-followup.json','attachmentFollowup']]){
  const a=baseRaw.get(name);if(!a||!same(JSON.parse(decoder.decode(a.bytes)),dataset[key]))invalid();
 }
 const base=dataset.originalCorrespondence,info=add.originalCorrespondence,raw=baseRaw.get(info?.fileName);
 if(!raw||raw.bytes.length!==info.bytes||await hash(raw.bytes)!==info.sha256||base.citationOccurrences.length!==info.citationCount||base.externalSources.length!==info.externalSourceCount)invalid();
 const effective={...base,externalSources:[...base.externalSources],citationOccurrences:[...base.citationOccurrences]},annotations=new Map();
 const addition=add.proposedSourceAddition;
 if(!addition||typeof addition.url!=='string'||addition.sourceId!=='url:'+await sha(addition.url)||base.externalSources.some(s=>s.sourceId===addition.sourceId))invalid();
 let remapped=0,boundaries=0;
 for(const correction of add.corrections){
  const index=correction.citationIndex0Based,loc=correction.citationLocator;
  if(!Number.isSafeInteger(index)||index<0||index>=base.citationOccurrences.length||annotations.has(index)||!loc||loc.baseSha256!==info.sha256)invalid();
  const old=base.citationOccurrences[index];if(!same(old,correction.originalCitation)||old.externalSourceId!==correction.oldExternalSourceId||old.registrationSourceId!==loc.registrationSourceId||!same(old.location,{blockId:loc.blockId,blockHash:loc.blockHash,heading:loc.heading,lineInBlock:loc.lineInBlock})||await sha(old.sourceText)!==loc.sourceTextSha256)invalid();
  const oldSource=exactly(base.externalSources,s=>s.sourceId===old.externalSourceId);
  if(oldSource.url!==correction.oldTarget||correction.sourceTextUnchanged!==true||correction.blockHashUnchanged!==true||correction.externalBodyVerification!=='not_performed')invalid();
  const catalog=exactly(dataset.originalCatalog.sources,s=>s.sourceId===old.registrationSourceId);
  if(catalog.url!==correction.pageUrl||catalog.retrievedAt!==correction.snapshotRetrievedAt)invalid();
  const block=exactly(base.sourcePassages,p=>p.registrationSourceId===old.registrationSourceId&&p.blockId===loc.blockId);
  if(block.blockHash!==loc.blockHash||await sha(block.text)!==loc.blockHash)invalid();
  const lines=block.text.split('\n');if(!Number.isSafeInteger(loc.lineInBlock)||loc.lineInBlock<1||lines[loc.lineInBlock-1]!==old.sourceText)invalid();
  const exact=correction.exactTargetSpan,sourceSpan=span(old.sourceText,exact?.inSourceText,correction.newTarget),blockSpan=span(block.text,exact?.inBlockMarkdown,correction.newTarget);
  if(old.sourceText.slice(0,sourceSpan[0])!==exact.precedingText||old.sourceText.slice(sourceSpan[1])!==exact.followingText)invalid();
  const lineStart=lines.slice(0,loc.lineInBlock-1).reduce((n,line)=>n+line.length+1,0);
  if(blockSpan[0]!==lineStart+sourceSpan[0]||blockSpan[1]!==lineStart+sourceSpan[1])invalid();
  if(correction.kind==='extraction_target_correction'){
   if(correction.boundaryStatus!=='exact_markdown_destination'||correction.newExternalSourceId!==addition.sourceId||correction.newTarget!==addition.url||!exact.precedingText.endsWith('](')||!exact.followingText.startsWith(')'))invalid();
   effective.citationOccurrences[index]={...old,externalSourceId:addition.sourceId};remapped++;
  }else if(correction.kind==='boundary_and_role_annotation_no_target_change'){
   if(correction.boundaryStatus!=='context_supported_explicit_span_not_markdown_token'||correction.oldTarget!==correction.newTarget||correction.oldExternalSourceId!==correction.newExternalSourceId||correction.sourceRole!=='local_execution_example'||correction.eligibleAsExternalTechnicalEvidence!==false)invalid();boundaries++;
  }else invalid();
  annotations.set(index,{kind:correction.kind,boundaryStatus:correction.boundaryStatus,sourceRole:correction.sourceRole??null,eligibleAsExternalTechnicalEvidence:correction.eligibleAsExternalTechnicalEvidence??null,externalBodyVerification:correction.externalBodyVerification,addendumHash:addHash,citationLocator:{...loc}});
 }
 if(remapped!==2||boundaries!==1)invalid();effective.externalSources.push(addition);
 return {correspondence:effective,annotations,addendumHash:addHash};
}

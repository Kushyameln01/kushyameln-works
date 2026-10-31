import {canonicalize,sha256Bytes} from './canonical.mjs';

const verifiedSets=new WeakSet();
export const isVerifiedReferenceSet=value=>verifiedSets.has(value);

export const REFERENCE_CATALOG_PATH='docs/shared/ai-connection/reference/catalog.v1.json';
const VERSION='1.0-draft.1',CATALOG='works-reference-catalog/'+VERSION,PROFILE='works-profile-reference/'+VERSION,NORMS='works-manager-norms/'+VERSION,NUMERICAL='works-numerical-rules/'+VERSION;
const categories=['shape','numeric-execution','normalization','loader-policy'];
const text=v=>typeof v==='string'&&v.length>0,plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(code,fieldPath,message)=>{throw Object.assign(new Error(message),{code,fieldPath});};
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function safePath(path){return text(path)&&!path.startsWith('/')&&!/[\\\u0000-\u001f\u007f:]/.test(path)&&path.split('/').every(part=>part&&part!=='.'&&part!=='..');}
function ownedBytes(value,path){if(!(value instanceof Uint8Array))fail('REFERENCE_BYTES_REQUIRED',path,'Actual registered Uint8Array bytes are required.');return new Uint8Array(value);}
function parse(bytes,path){try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));canonicalize(value);if(!plain(value))throw TypeError('Root reference document must be an object.');return value;}catch(error){fail('REFERENCE_JSON_INVALID',path,error.message);}}
function refs(value,path){if(!Array.isArray(value)||!value.length)fail('REFERENCE_SCHEMA_INVALID',path,'Nonempty pinned source references are required.');for(const [i,ref] of value.entries())if(!plain(ref)||!text(ref.repository)||!text(ref.path)||!/^[a-f0-9]{40}$/.test(ref.commit))fail('REFERENCE_SCHEMA_INVALID',`${path}/${i}`,'Source reference requires repository/full commit/path.');}
function strings(value,path){if(!Array.isArray(value)||value.some(v=>!text(v)))fail('REFERENCE_SCHEMA_INVALID',path,'Expected a string array.');}
function required(value,keys,path){for(const key of keys)if(!Object.hasOwn(value,key))fail('REFERENCE_SCHEMA_INVALID',`${path}/${key}`,'Required reference schema field is missing.');}
function add(map,key,value,path){if(!text(key))fail('REFERENCE_SCHEMA_INVALID',path,'Record ID must be a nonempty string.');if(map.has(key))fail('REFERENCE_DUPLICATE_ID',path,'Duplicate IDs cannot overwrite registered reference records.');map.set(key,value);}
function profile(record,path){
 if(!plain(record))fail('REFERENCE_SCHEMA_INVALID',path,'Profile record must be an object.');
 required(record,['recordId','nativeProfileId','ownerRole','nativeContract','sourceRefs','requiredDeclarations','admissionConstraints','evidenceScopes','limitations'],path);
 if(record.nativeProfileId!==null&&!text(record.nativeProfileId)||!text(record.ownerRole)||record.nativeContract!==null&&!text(record.nativeContract)||!plain(record.requiredDeclarations)||!plain(record.admissionConstraints)||!Array.isArray(record.evidenceScopes)||!Array.isArray(record.limitations))fail('REFERENCE_SCHEMA_INVALID',path,'Invalid public profile declarations or owner/native identity.');refs(record.sourceRefs,`${path}/sourceRefs`);
}
function norm(record,path){
 if(!plain(record))fail('REFERENCE_SCHEMA_INVALID',path,'Norm record must be an object.');required(record,['normId','title','decisionOwner','managerReads','comparisons','profileRefs','numericalRuleRefs','reasonLabels','status'],path);
 if(!text(record.title)||!text(record.decisionOwner)||!text(record.status))fail('REFERENCE_SCHEMA_INVALID',path,'Norm owner/title/status must be explicit.');
 for(const key of ['managerReads','comparisons','profileRefs','numericalRuleRefs','reasonLabels'])strings(record[key],`${path}/${key}`);
}
function rule(record,path){
 if(!plain(record))fail('REFERENCE_SCHEMA_INVALID',path,'Numerical rule must be an object.');required(record,['ruleId','ownerRole','sourceRefs','rule','conditions','evidenceScope','notManagerResponsibility','normInputs'],path);
 if(!text(record.ownerRole)||!plain(record.rule)||!plain(record.conditions)||!text(record.evidenceScope)||record.notManagerResponsibility!==true||!Array.isArray(record.normInputs))fail('REFERENCE_SCHEMA_INVALID',path,'Numerical rule scope/owner must remain explicitly outside management numerical implementation.');refs(record.sourceRefs,`${path}/sourceRefs`);
}
// A Map-compatible read interface with private closure storage. Do not freeze a
// native Map: Map#set and its forEach third argument would still expose writes.
function readonlyMap(entries){
 const values=new Map(entries),view=Object.create(null);
 Object.defineProperties(view,{
  size:{enumerable:true,get:()=>values.size},
  get:{value:key=>values.get(key)},has:{value:key=>values.has(key)},
  keys:{value:()=>values.keys()},values:{value:()=>values.values()},entries:{value:()=>values.entries()},
  forEach:{value:(callback,thisArg)=>{if(typeof callback!=='function')throw TypeError('Callback must be a function.');for(const [key,value] of values)Reflect.apply(callback,thisArg,[value,key,view]);}},
  [Symbol.iterator]:{value:()=>values.entries()},[Symbol.toStringTag]:{value:'ReadonlyReferenceMap'}
 });return Object.freeze(view);
}

/** Authenticate an explicitly provided fixed catalog and its registered JSON
 * bytes. This performs structural integrity/indexing only, no edge judgment,
 * inference import, file-system access, URL retrieval or runtime-adoption claim. */
export async function loadReferenceSet({catalogBytes,files,expectedCatalogSha256}={}){
 if(!hex(expectedCatalogSha256))fail('CATALOG_PIN_REQUIRED','expectedCatalogSha256','Explicit lowercase SHA-256 catalog pin is required.');
 if(!(files instanceof Map))fail('REFERENCE_FILES_REQUIRED','files','Explicit registered-path Map of bytes is required.');
 // Snapshot before the first digest await; later caller mutation cannot change
 // either the authenticated bytes or the parsed immutable values.
 const catBytes=ownedBytes(catalogBytes,REFERENCE_CATALOG_PATH),inputs=new Map();for(const [path,bytes] of files)inputs.set(path,ownedBytes(bytes,path));
 const catalogSha256=await sha256Bytes(catBytes);if(catalogSha256!==expectedCatalogSha256)fail('CATALOG_HASH_MISMATCH',REFERENCE_CATALOG_PATH,'Catalog bytes do not match their fixed external source pin.');
 const catalog=parse(catBytes,REFERENCE_CATALOG_PATH);
 if(catalog.schemaVersion!==CATALOG||catalog.documentVersion!==VERSION||catalog.runtimeIntegrated!==false)fail('CATALOG_SCHEMA_UNSUPPORTED',REFERENCE_CATALOG_PATH,'Unknown catalog schema/version or rewritten source adoption status.');
 if(!Array.isArray(catalog.files)||catalog.files.length!==6)fail('REFERENCE_FILE_SET_INVALID','/files','This schema requires four profile documents, norms and numerical rules.');
 const registrations=new Map(),optionalDocs=new Map();
 for(const [i,entry] of catalog.files.entries()){
  const path=`/files/${i}`;if(!plain(entry)||!safePath(entry.path)||registrations.has(entry.path)||!hex(entry.sha256)||!Number.isSafeInteger(entry.byteLength)||entry.byteLength<1||![PROFILE,NORMS,NUMERICAL].includes(entry.schemaVersion)||entry.documentVersion!==VERSION)fail('REFERENCE_REGISTRATION_INVALID',path,'Unique path, byte hash/length and known schema/document version are required.');registrations.set(entry.path,entry);
 }
 if(catalog.documents!==undefined){if(!Array.isArray(catalog.documents))fail('REFERENCE_DOCUMENTS_INVALID','/documents','Optional document metadata must be an array.');for(const [i,entry] of catalog.documents.entries()){
  if(!plain(entry)||!safePath(entry.path)||optionalDocs.has(entry.path)||registrations.has(entry.path)||!hex(entry.sha256)||entry.byteLength!==undefined&&(!Number.isSafeInteger(entry.byteLength)||entry.byteLength<1))fail('REFERENCE_DOCUMENTS_INVALID',`/documents/${i}`,'Optional document identities require unique paths and byte hashes.');optionalDocs.set(entry.path,entry);
 }}
 for(const path of inputs.keys())if(!registrations.has(path)&&!optionalDocs.has(path))fail('UNREGISTERED_REFERENCE_FILE',path,'Unregistered files cannot join an authenticated reference set.');
 const integrityReceipts=[{path:REFERENCE_CATALOG_PATH,sha256:catalogSha256,byteLength:catBytes.length}],contractRefs=[{path:REFERENCE_CATALOG_PATH,sha256:catalogSha256,byteLength:catBytes.length,schemaVersion:CATALOG,documentVersion:VERSION,kind:'catalog',recordIds:[]}];
 const profiles=new Map(),norms=new Map(),rules=new Map(),profileCategories=new Map(),seenCategories=new Set(),documents=[];let normsDocument,numericalRules;
 for(const [path,entry] of registrations){
  const bytes=inputs.get(path);if(!bytes)fail('REFERENCE_FILE_MISSING',path,'A required registered JSON document is missing.');
  if(bytes.length!==entry.byteLength)fail('REFERENCE_LENGTH_MISMATCH',path,'Reference byte length does not match its catalog registration.');const digest=await sha256Bytes(bytes);if(digest!==entry.sha256)fail('REFERENCE_HASH_MISMATCH',path,'Reference bytes do not match their registered SHA-256.');
  const document=parse(bytes,path);if(document.schemaVersion!==entry.schemaVersion||document.documentVersion!==entry.documentVersion||document.runtimeIntegrated!==undefined&&document.runtimeIntegrated!==false)fail('REFERENCE_SCHEMA_MISMATCH',path,'Document header differs from its registered schema/version or source status.');documents.push({path,document});
  let kind,recordIds;
  if(entry.schemaVersion===PROFILE){
   if(!categories.includes(document.category)||seenCategories.has(document.category)||document.runtimeIntegrated!==false||!Array.isArray(document.records))fail('REFERENCE_SCHEMA_INVALID',path,'Each declared profile category must appear once with records and original runtimeIntegrated:false.');seenCategories.add(document.category);kind='profile';recordIds=[];
   for(const [i,record] of document.records.entries()){profile(record,`${path}/records/${i}`);add(profiles,record.recordId,record,`${path}/records/${i}/recordId`);profileCategories.set(record.recordId,document.category);recordIds.push(record.recordId);}
  }else if(entry.schemaVersion===NORMS){
   if(normsDocument||document.runtimeIntegrated!==false||!Array.isArray(document.rules))fail('REFERENCE_SCHEMA_INVALID',path,'One manager norm document with original source status is required.');normsDocument=document;kind='norms';recordIds=[];if(document.sourceRefs!==undefined)refs(document.sourceRefs,`${path}/sourceRefs`);
   for(const [i,record] of document.rules.entries()){norm(record,`${path}/rules/${i}`);add(norms,record.normId,record,`${path}/rules/${i}/normId`);recordIds.push(record.normId);}
  }else{
   if(numericalRules||!Array.isArray(document.rules))fail('REFERENCE_SCHEMA_INVALID',path,'One numerical-rule document is required.');numericalRules=document;kind='numerical-rules';recordIds=[];
   for(const [i,record] of document.rules.entries()){rule(record,`${path}/rules/${i}`);add(rules,record.ruleId,record,`${path}/rules/${i}/ruleId`);recordIds.push(record.ruleId);}
  }
  integrityReceipts.push({path,sha256:digest,byteLength:bytes.length});contractRefs.push({path,sha256:digest,byteLength:bytes.length,schemaVersion:entry.schemaVersion,documentVersion:entry.documentVersion,kind,...(document.category?{category:document.category}:{}),recordIds});
 }
 if(seenCategories.size!==4||!normsDocument||!numericalRules)fail('REFERENCE_FILE_SET_INVALID','/files','All four profile categories, manager norms and numerical rules are required.');
 // Only known typed reference fields are resolved. URLs, native IDs and source
 // paths remain opaque references; they are never fetched or guessed as IDs.
 function resolve(value,path){if(Array.isArray(value)){value.forEach((v,i)=>resolve(v,`${path}/${i}`));return;}if(!plain(value))return;
  for(const [key,item] of Object.entries(value)){
   const fieldPath=`${path}/${key}`;
   if(['profileRefs','supportedMeanShapeRecordRefs'].includes(key)){strings(item,fieldPath);for(const id of item)if(!profiles.has(id)||key==='supportedMeanShapeRecordRefs'&&profileCategories.get(id)!=='shape')fail('REFERENCE_CROSSREF_MISSING',fieldPath,'Profile reference does not identify a registered profile record of the required category.');}
   if(['numericalRuleRefs','ruleRefs'].includes(key)){strings(item,fieldPath);for(const id of item)if(!rules.has(id))fail('REFERENCE_CROSSREF_MISSING',fieldPath,'Numerical rule reference does not identify a registered rule.');}
   if(key==='normalizationRecordId'||key==='executionRecordRef'){const expected=key==='normalizationRecordId'?'normalization':'numeric-execution';if(!text(item)||!profiles.has(item)||profileCategories.get(item)!==expected)fail('REFERENCE_CROSSREF_MISSING',fieldPath,'Typed profile reference is missing or names a different category.');}
   resolve(item,fieldPath);
  }
 }
 resolve(catalog,REFERENCE_CATALOG_PATH);for(const {path,document} of documents)resolve(document,path);
 for(const [path,entry] of optionalDocs)if(inputs.has(path)){const bytes=inputs.get(path),digest=await sha256Bytes(bytes);if(digest!==entry.sha256||entry.byteLength!==undefined&&bytes.length!==entry.byteLength)fail('REFERENCE_DOCUMENT_HASH_MISMATCH',path,'Provided optional document bytes differ from their metadata.');integrityReceipts.push({path,sha256:digest,byteLength:bytes.length});}
 freeze(catalog);for(const {document} of documents)freeze(document);freeze(integrityReceipts);freeze(contractRefs);
 const result=Object.freeze({catalog,catalogSha256,profileRecords:readonlyMap(profiles),normRecords:readonlyMap(norms),numericalRules,ruleRecords:readonlyMap(rules),contractRefs,integrityReceipts});verifiedSets.add(result);return result;
}

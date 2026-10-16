// Caller-level bounds and declared origin groups. No numeric feature computation.
export const PAPER_CALLER_LIMITS=Object.freeze({files:64,totalFileBytes:33554432,fileBytes:4194304,jsonBytes:4194304,exportRetentionBytes:25165824});
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,64}$/.test(v);
export function validateDataset(rows){
 if(!Array.isArray(rows)||rows.length<3||rows.length>PAPER_CALLER_LIMITS.files)throw Error('DATASET_LIMIT');
 const groups=new Map(),counts=[0,0,0];let bytes=0;
 const out=rows.map((r,i)=>{
  if(!r?.file||!Number.isSafeInteger(r.file.size)||r.file.size<1||r.file.size>PAPER_CALLER_LIMITS.fileBytes)throw Error('FILE_LIMIT');
  if(typeof r.file.name!=='string'||new TextEncoder().encode(r.file.name).length>512||!id(r.groupId)||!['train','evaluation'].includes(r.split)||(r.split==='train'?![0,1].includes(r.label):r.label!==null))throw Error('DATASET_ENTRY');
  bytes+=r.file.size;if(bytes>PAPER_CALLER_LIMITS.totalFileBytes)throw Error('DATASET_LIMIT');
  if(groups.has(r.groupId)&&groups.get(r.groupId)!==r.split)throw Error('GROUP_SPLIT_LEAKAGE');groups.set(r.groupId,r.split);counts[r.split==='evaluation'?2:r.label]++;
  return Object.freeze({file:r.file,groupId:r.groupId,split:r.split,label:r.label,sampleId:`sample-${String(i).padStart(3,'0')}`});
 });
 if(counts.some(n=>n===0))throw Error('DATASET_CLASSES');return Object.freeze(out);
}
export function validateSources(rows){
 const seen=new Map();for(const r of rows){if(!/^[a-f0-9]{64}$/.test(r.sourceSha256))throw Error('SOURCE_HASH');const previous=seen.get(r.sourceSha256);
  if(previous&&previous.split!==r.split)throw Error('SOURCE_SPLIT_LEAKAGE');if(previous&&previous.label!==r.label)throw Error('SOURCE_LABEL_CONFLICT');if(previous)throw Error('DUPLICATE_SOURCE');seen.set(r.sourceSha256,r);
 }
}
export function exportPaperModel(model){
 const p=model.width*model.height,k=model.featureCount;if(!Number.isSafeInteger(p)||p<1||p>4096||!Number.isSafeInteger(k)||k<1||k>16)throw Error('MODEL_SHAPE');
 function encode(a,n,bytes){if(!(a instanceof (bytes===8?Float64Array:Uint8Array))||a.length!==n||!a.every(Number.isFinite))throw Error('MODEL_COEFFICIENTS');const b=new Uint8Array(n*bytes),v=new DataView(b.buffer);for(let i=0;i<n;i++)if(bytes===8)v.setFloat64(i*8,a[i],true);else b[i]=a[i];return {type:bytes===8?'Float64LE':'Uint8',length:n,hex:Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')};}
 const c=model.coefficients;return {...model,coefficients:{spatial:encode(c.spatial,p*k,8),...(model.kind==='svd-diagonal-v1'?{pattern:encode(c.pattern,256*k,8)}:{selectedCodes:encode(c.selectedCodes,k,1)})}};
}
export function restorePaperModel(model){
 const p=model.width*model.height,k=model.featureCount;if(!Number.isSafeInteger(p)||p<1||p>4096||!Number.isSafeInteger(k)||k<1||k>16)throw Error('MODEL_SHAPE');
 function decode(a,n,bytes){if(a?.length!==n||a.type!==(bytes===8?'Float64LE':'Uint8')||typeof a.hex!=='string'||a.hex.length!==n*bytes*2||!/^[0-9a-f]+$/.test(a.hex))throw Error('MODEL_COEFFICIENTS');const b=Uint8Array.from(a.hex.match(/../g),v=>parseInt(v,16)),view=new DataView(b.buffer);const out=bytes===8?Float64Array.from({length:n},(_,i)=>view.getFloat64(i*8,true)):b;if(!out.every(Number.isFinite))throw Error('MODEL_COEFFICIENTS');return out;}
 const c=model.coefficients;return {...model,coefficients:{spatial:decode(c.spatial,p*k,8),...(model.kind==='svd-diagonal-v1'?{pattern:decode(c.pattern,256*k,8)}:{selectedCodes:decode(c.selectedCodes,k,1)})}};
}
export function serializePaperOutput(value,maxBytes=PAPER_CALLER_LIMITS.jsonBytes){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>PAPER_CALLER_LIMITS.jsonBytes)throw Error('OUTPUT_LIMIT');
 let numbers=0;const chunks=[];let bytes=0,part='';const enc=new TextEncoder();
 function add(text){bytes+=enc.encode(text).length;if(bytes>maxBytes)throw Error('OUTPUT_LIMIT');part+=text;if(part.length>=16384){chunks.push(part);part='';}}
 function visit(v,depth){
  if(depth>20)throw Error('OUTPUT_DEPTH');if(v===null||typeof v==='boolean'){add(String(v));return;}
  if(typeof v==='number'){if(!Number.isFinite(v))throw Error('OUTPUT_NONFINITE');if(++numbers>400000)throw Error('OUTPUT_ARRAY_LIMIT');add(String(v));return;}
  if(typeof v==='string'){if(v.length>maxBytes)throw Error('OUTPUT_LIMIT');add(JSON.stringify(v));return;}
  if(Array.isArray(v)||ArrayBuffer.isView(v)){if(v.length>70000)throw Error('OUTPUT_ARRAY_LIMIT');add('[');for(let i=0;i<v.length;i++){if(i)add(',');visit(v[i],depth+1);}add(']');return;}
  if(!v||typeof v!=='object')throw Error('OUTPUT_TYPE');const names=Object.keys(v);if(names.length>1024)throw Error('OUTPUT_FIELDS');add('{');names.forEach((k,i)=>{if(i)add(',');add(JSON.stringify(k));add(':');visit(v[k],depth+1);});add('}');
 }
 visit(value,0);if(part)chunks.push(part);return {text:chunks.join(''),bytes,retentionBudgetBytes:PAPER_CALLER_LIMITS.exportRetentionBytes,scope:'logical string/UTF-8/Blob payload allowance; JS object/native allocator overhead is not measured'};
}

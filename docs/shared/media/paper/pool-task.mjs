// Finite jobs for the existing pool. No scheduler, Worker or numeric JS solver.
import {PAPER_KERNEL,preparePaperKernel,instantiatePaperKernel} from './paper.mjs';
export {preparePaperKernel,instantiatePaperKernel};
export const PAPER_TASK_TYPES=Object.freeze(['media-paper-fit','media-paper-infer']);
export const MAX_PAPER_INPUT_BYTES=4194304,MAX_PAPER_RESULT_BYTES=2097152;
const [FIT,INFER]=PAPER_TASK_TYPES,KINDS=['svd-diagonal-v1','paper-alg2-diagonal-v1'];
const enc=new TextEncoder(),int=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),id=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,64}$/.test(v);
const typedProto=Object.getPrototypeOf(Uint8Array.prototype),getters=Object.fromEntries(['length','buffer','byteOffset','byteLength'].map(k=>[k,Object.getOwnPropertyDescriptor(typedProto,k).get]));
const typed=(a,k)=>Reflect.apply(getters[k],a,[]);
const resizableGetter=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'resizable')?.get;
function record(v){if(!v||Object.getPrototypeOf(v)!==Object.prototype)throw TypeError('PAPER_RECORD');return v;}
function own(v,key,optional=false){record(v);const d=Object.getOwnPropertyDescriptor(v,key);if(!d&&optional)return undefined;if(!d||!('value'in d))throw TypeError('PAPER_ACCESSOR_OR_FIELD');return d.value;}
function keys(v,allowed,required=allowed){record(v);if(Object.keys(v).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(v,k)))throw TypeError('PAPER_FIELDS');for(const k of Object.keys(v))own(v,k);}
function json(value,limit){
 let size=0;const add=s=>{size+=enc.encode(s).byteLength;if(size>limit)throw RangeError('PAPER_METADATA_LIMIT');return s;};
 function visit(v,depth){
  if(depth>16)throw RangeError('PAPER_METADATA_DEPTH');
  if(v===null)return add('null');if(typeof v==='boolean')return add(String(v));if(typeof v==='number'&&Number.isFinite(v))return add(JSON.stringify(v));
  if(typeof v==='string'){if(v.length>limit)throw RangeError('PAPER_METADATA_LIMIT');return add(JSON.stringify(v));}
  if(Array.isArray(v)){if(v.length>4096)throw RangeError('PAPER_METADATA_COUNT');const parts=[];for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!('value'in d))throw TypeError('PAPER_METADATA_ACCESSOR');parts.push((i?add(','):'')+visit(d.value,depth+1));}return add('[')+parts.join('')+add(']');}
  record(v);const names=Object.keys(v).sort();if(names.length>8192)throw RangeError('PAPER_METADATA_COUNT');return add('{')+names.map((k,i)=>{if(k.length>limit)throw RangeError('PAPER_METADATA_LIMIT');return (i?add(','):'')+add(JSON.stringify(k))+add(':')+visit(own(v,k),depth+1);}).join('')+add('}');
 }
 const text=visit(value,0);return {value:JSON.parse(text),text,bytes:size};
}
function array(a,Type,n){if(!(a instanceof Type)||typed(a,'length')!==n)throw TypeError('PAPER_ARRAY');const b=typed(a,'buffer');if(!(b instanceof ArrayBuffer)||(resizableGetter&&Reflect.apply(resizableGetter,b,[])))throw TypeError('PAPER_ARRAY');new Uint8Array(b,typed(a,'byteOffset'),typed(a,'byteLength'));return a;}
function grid(w,h){if(!int(w,1,64)||!int(h,1,64))throw RangeError('PAPER_GRID');return w*h;}
function preprocess(value,w,h){
 const p=json(value,16384).value;keys(p,['version','grid','roi','resize','luma','lbp','border']);keys(p.grid,['width','height']);
 if(p.version!==1||p.grid.width!==w||p.grid.height!==h||p.resize!=='none'||p.luma!=='integer77-150-29-white-alpha'||p.lbp!=='3x3-ge-NW-N-NE-E-SE-S-SW-W'||p.border!=='zero-gray-halo')throw TypeError('PAPER_PREPROCESSING');
 if(['synthetic-numeric-fixture','maximum-numeric-fixture'].includes(p.roi))return p;
 const r=p.roi;keys(r,['x','y','width','height','sourceWidth','sourceHeight','coordinateSpace']);
 if(r.coordinateSpace!=='display-pixels'||r.width!==w||r.height!==h||!int(r.x,0,16777216)||!int(r.y,0,16777216)||!int(r.sourceWidth,1,16777216)||!int(r.sourceHeight,1,16777216)||r.sourceWidth*r.sourceHeight>16777216||r.x+w>r.sourceWidth||r.y+h>r.sourceHeight)throw TypeError('PAPER_ROI');
 return p;
}
const preprocessingKind=p=>typeof p.roi==='string'?'synthetic-numeric':'media-crop';
function split(value,samples){
 const m=json(value,524288).value;if(m.version!==1||!hash(m.preprocessingSha256)||!Array.isArray(m.groups)||!Array.isArray(m.samples)||m.groups.length>1536||m.samples.length>1536)throw TypeError('PAPER_SPLIT');
 const groups=new Map(),ids=new Map(),sources=new Map();
 for(const g of m.groups){if(!id(g.groupId)||!['train','calibration','evaluation'].includes(g.split)||groups.has(g.groupId))throw TypeError('PAPER_SPLIT_GROUP');groups.set(g.groupId,g.split);}
 for(const s of m.samples){const part=groups.get(s.groupId);if(!id(s.sampleId)||ids.has(s.sampleId)||!part||![0,1].includes(s.label)||!hash(s.sourceSha256)||!hash(s.codeSha256))throw TypeError('PAPER_SPLIT_SAMPLE');if(sources.has(s.sourceSha256)&&sources.get(s.sourceSha256)!==part)throw TypeError('PAPER_SPLIT_LEAKAGE');sources.set(s.sourceSha256,part);ids.set(s.sampleId,{...s,split:part});}
 const training=Array.from(ids.values()).filter(x=>x.split==='train');
 if(samples){if(training.length!==samples.length)throw TypeError('PAPER_TRAINING_SET');const seen=new Set(),counts=[0,0];for(const s of samples){const v=ids.get(s.sampleId);if(!v||v.split!=='train'||seen.has(s.sampleId))throw TypeError('PAPER_TRAINING_SET');seen.add(s.sampleId);counts[v.label]++;}if(!counts[0]||!counts[1])throw TypeError('PAPER_EMPTY_CLASS');}
 return m;
}
function source(value){const s=json(value,1024).value;keys(s,['sampleId','groupId','sourceSha256','codeSha256','split']);if(!id(s.sampleId)||!id(s.groupId)||!hash(s.sourceSha256)||!hash(s.codeSha256)||!['train','calibration','evaluation'].includes(s.split))throw TypeError('PAPER_SOURCE');return s;}
function modelParts(value){
 record(value);const raw={};for(const key of Object.keys(value))if(key!=='coefficients')raw[key]=own(value,key);
 const m=json(raw,65536).value,p=grid(m.width,m.height),k=m.featureCount;
 if(m.schema!==1||!KINDS.includes(m.kind)||!int(k,1,16)||!int(m.requestedFeatureCount,k,16)||!['strict','allow-fewer'].includes(m.rankPolicy)||m.status!==(k<m.requestedFeatureCount?'rank-limited':'complete')||(m.rankPolicy==='strict'&&k!==m.requestedFeatureCount)||!['synthetic-numeric','media-crop'].includes(m.preprocessingKind)||m.abi!==PAPER_KERNEL.abi||m.kernelSha256!==PAPER_KERNEL.sha256||!hash(m.modelHash)||!hash(m.preprocessingSha256)||!hash(m.trainingHash)||!hash(m.splitHash))throw TypeError('PAPER_MODEL_IDENTITY');
 if(!Array.isArray(m.classCounts)||m.classCounts.length!==2||m.classCounts.some(n=>!int(n,1,511))||m.classCounts[0]+m.classCounts[1]>512||m.rankScale!=='max(1,trace(G_initial))')throw TypeError('PAPER_MODEL_POLICY');
 const policy={maxSweeps:64,tolerance:1e-12,rankCutoff:1e-8,rankGuard:1e-10,eigenspaceGap:1e-8,patternGap:1e-8};if(json(m.numericPolicy,1024).text!==json(policy,1024).text)throw TypeError('PAPER_MODEL_POLICY');
 const d=m.diagnostics;if(!d||!['alpha','eigenResidual','eigenOrthogonality','selectedUOrthogonality','selectedPairResidual','maxSweeps','workspaceBytes'].every(k=>typeof d[k]==='number'&&Number.isFinite(d[k]))||d.alpha<1||d.eigenResidual<0||d.eigenResidual>1e-10||d.eigenOrthogonality<0||d.eigenOrthogonality>1e-10||d.selectedUOrthogonality<0||d.selectedUOrthogonality>1e-8||d.selectedPairResidual<0||d.selectedPairResidual>1e-8||!int(d.maxSweeps,0,64)||!int(d.workspaceBytes,0,12582912)||!Array.isArray(d.initialRankInterval)||d.initialRankInterval.length!==2||!int(d.initialRankInterval[0],0,256)||!int(d.initialRankInterval[1],d.initialRankInterval[0],256)||d.rankAmbiguous!==(d.initialRankInterval[0]!==d.initialRankInterval[1]))throw TypeError('PAPER_MODEL_DIAGNOSTICS');
 const c=own(value,'coefficients'),secondKey=m.kind===KINDS[0]?'pattern':'selectedCodes';keys(c,['spatial',secondKey]);
 const spatial=array(own(c,'spatial'),Float64Array,p*k),second=array(own(c,secondKey),secondKey==='pattern'?Float64Array:Uint8Array,secondKey==='pattern'?256*k:k);
 if(!Reflect.apply(Float64Array.prototype.every,spatial,[Number.isFinite])||(secondKey==='pattern'&&!Reflect.apply(Float64Array.prototype.every,second,[Number.isFinite])))throw TypeError('PAPER_MODEL_NONFINITE');
 if(secondKey==='selectedCodes'){const seen=new Set();for(let i=0;i<k;i++)seen.add(second[i]);if(seen.size!==k)throw TypeError('PAPER_MODEL_CODES');}
 return {...m,coefficients:{spatial,[secondKey]:second}};
}
function checkType(type){if(!PAPER_TASK_TYPES.includes(type))throw TypeError('PAPER_TASK_TYPE');}
function metadata(type,p){
 if(type===FIT)return {...p,samples:p.samples.map(s=>({sampleId:s.sampleId}))};
 const {codes,model,...rest}=p,{coefficients,...meta}=model;return {...rest,model:meta};
}
function inputArrays(type,p){return type===FIT?p.samples.map(s=>s.codes):[p.model.coefficients.spatial,p.model.coefficients.pattern??p.model.coefficients.selectedCodes,p.codes];}
export function paperInputBytes(type,p){checkType(type);return inputArrays(type,p).reduce((n,a)=>n+typed(a,'byteLength'),0)+json(metadata(type,p),MAX_PAPER_INPUT_BYTES).bytes;}
export function inspectPaperPayload(type,p){
 checkType(type);let normalized;
 if(type===FIT){
  keys(p,['kind','width','height','featureCount','rankPolicy','preprocessing','samples','splitManifest'],['kind','width','height','featureCount','preprocessing','samples','splitManifest']);
  const width=own(p,'width'),height=own(p,'height'),n=grid(width,height),kind=own(p,'kind'),featureCount=own(p,'featureCount'),rankPolicy=own(p,'rankPolicy',true)??'strict',raw=own(p,'samples');
  if(!KINDS.includes(kind)||!int(featureCount,1,16)||!['strict','allow-fewer'].includes(rankPolicy)||!Array.isArray(raw)||raw.length<2||raw.length>512)throw RangeError('PAPER_FIT_OPTIONS');
  const samples=[];for(let i=0;i<raw.length;i++){const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d||!('value'in d))throw TypeError('PAPER_SAMPLE_ACCESSOR');keys(d.value,['sampleId','codes']);const sampleId=own(d.value,'sampleId');if(!id(sampleId))throw TypeError('PAPER_SAMPLE_ID');samples.push({sampleId,codes:array(own(d.value,'codes'),Uint8Array,n)});}
  normalized={kind,width,height,featureCount,rankPolicy,preprocessing:preprocess(own(p,'preprocessing'),width,height),samples,splitManifest:split(own(p,'splitManifest'),samples)};
 }else{
  keys(p,['model','codes','preprocessing','source']);const model=modelParts(own(p,'model')),preprocessing=preprocess(own(p,'preprocessing'),model.width,model.height);
  if(preprocessingKind(preprocessing)!==model.preprocessingKind)throw TypeError('PAPER_PREPROCESSING_PROVENANCE');
  normalized={model,codes:array(own(p,'codes'),Uint8Array,model.width*model.height),preprocessing,source:source(own(p,'source'))};
 }
 if(paperInputBytes(type,normalized)>MAX_PAPER_INPUT_BYTES)throw RangeError('PAPER_INPUT_LIMIT');return normalized;
}
export function snapshotPaperPayload(type,p){
 checkType(type);const meta=json(metadata(type,p),MAX_PAPER_INPUT_BYTES).value;
 if(type===FIT)return {...meta,samples:p.samples.map((s,i)=>({sampleId:meta.samples[i].sampleId,codes:new Uint8Array(s.codes)}))};
 const c=p.model.coefficients;return {...meta,model:{...meta.model,coefficients:{spatial:new Float64Array(c.spatial),...(c.pattern?{pattern:new Float64Array(c.pattern)}:{selectedCodes:new Uint8Array(c.selectedCodes)})}},codes:new Uint8Array(p.codes)};
}
export const paperInfo=()=>({...PAPER_KERNEL,variant:'scalar',key:`${PAPER_KERNEL.abi}:${PAPER_KERNEL.sha256}:scalar`});
export function transferPaperInput(type,p){checkType(type);return inputArrays(type,p).map(a=>typed(a,'buffer'));}
export function paperResultShape(type,p){
 checkType(type);if(type===FIT)return {kind:p.kind,width:p.width,height:p.height,featureCount:p.featureCount,rankPolicy:p.rankPolicy,preprocessingText:json(p.preprocessing,16384).text,splitText:json(p.splitManifest,524288).text};
 return {modelHash:p.model.modelHash,modelKind:p.model.kind,width:p.model.width,height:p.model.height,featureCount:p.model.featureCount,trainingHash:p.model.trainingHash,splitHash:p.model.splitHash,preprocessingText:json(p.preprocessing,16384).text,sourceText:json(p.source,1024).text};
}
const verification=()=>({source:'caller-declared',codeSha256:'verified'});
export async function runPaperTask(kernel,type,p){
 checkType(type);
 if(type===FIT){
  const preprocessing=json(p.preprocessing,16384).value,splitManifest=json(p.splitManifest,524288).value;
  // kernel.fit synchronously captures its own bounded arrays before its first await.
  const model=await kernel.fit(p);return {kind:'media-paper-model',model,preprocessing,splitManifest};
 }
 // Hashing yields before kernel.infer; capture coefficients and codes first.
 const owned=snapshotPaperPayload(type,p),digest=await crypto.subtle.digest('SHA-256',owned.codes);
 const actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(actual!==owned.source.codeSha256)throw Error('PAPER_CODE_HASH');
 const features=await kernel.infer(owned),m=owned.model;
 return {kind:'media-paper-features',modelHash:m.modelHash,modelKind:m.kind,width:m.width,height:m.height,featureCount:m.featureCount,features,preprocessing:owned.preprocessing,source:owned.source,provenanceVerification:verification(),trainingHash:m.trainingHash,splitHash:m.splitHash};
}
function resultParts(r){
 if(r?.kind==='media-paper-model'){const {coefficients,...meta}=r.model;return {arrays:[coefficients.spatial,coefficients.pattern??coefficients.selectedCodes],metadata:{...r,model:meta}};}
 if(r?.kind==='media-paper-features'){const {features,...meta}=r;return {arrays:[features],metadata:meta};}
 throw TypeError('PAPER_RESULT_KIND');
}
export function paperResultBytes(r){const p=resultParts(r);return p.arrays.reduce((n,a)=>n+typed(a,'byteLength'),0)+json(p.metadata,MAX_PAPER_RESULT_BYTES).bytes;}
export function transferPaperResult(r){return resultParts(r).arrays.map(a=>typed(a,'buffer'));}
export function validPaperResult(type,shape,r){
 try{
  checkType(type);if(paperResultBytes(r)>MAX_PAPER_RESULT_BYTES)return false;
  if(type===FIT){
   keys(r,['kind','model','preprocessing','splitManifest']);if(r.kind!=='media-paper-model')return false;
   const m=modelParts(r.model);if(m.kind!==shape.kind||m.width!==shape.width||m.height!==shape.height||m.requestedFeatureCount!==shape.featureCount||m.rankPolicy!==shape.rankPolicy)return false;
   const preprocessing=preprocess(r.preprocessing,m.width,m.height),manifest=split(r.splitManifest);
   if(preprocessingKind(preprocessing)!==m.preprocessingKind||json(preprocessing,16384).text!==shape.preprocessingText||json(manifest,524288).text!==shape.splitText||manifest.preprocessingSha256!==m.preprocessingSha256)return false;
   const groups=new Map(manifest.groups.map(g=>[g.groupId,g.split])),counts=[0,0];for(const s of manifest.samples)if(groups.get(s.groupId)==='train')counts[s.label]++;
   return counts.every((n,i)=>n===m.classCounts[i]);
  }
  keys(r,['kind','modelHash','modelKind','width','height','featureCount','features','preprocessing','source','provenanceVerification','trainingHash','splitHash']);
  if(r.kind!=='media-paper-features'||!['modelHash','modelKind','width','height','featureCount','trainingHash','splitHash'].every(k=>r[k]===shape[k]))return false;
  array(r.features,Float64Array,shape.featureCount);if(!Reflect.apply(Float64Array.prototype.every,r.features,[Number.isFinite]))return false;
  return json(preprocess(r.preprocessing,r.width,r.height),16384).text===shape.preprocessingText&&json(source(r.source),1024).text===shape.sourceText&&json(r.provenanceVerification,1024).text===json(verification(),1024).text;
 }catch{return false;}
}
export function freezePaperResult(r){
 function freeze(v){if(v&&typeof v==='object'&&!ArrayBuffer.isView(v)){for(const value of Object.values(v))freeze(value);Object.freeze(v);}return v;}
 return freeze(r);
}

export const SCHEMA='unity-analysis-snapshot/1';
export const REPORT_SCHEMA='unity-analysis-report/1';
export const ANALYZER_VERSION='unity-analysis-0.1.0';
export const RULES_VERSION='unity-static-1';
export const TYPES=Object.freeze({Unknown:0,Float:1,Int:2,Bool:3,Trigger:4});
export const LIMITS=Object.freeze({maxFiles:4096,maxObjects:65536,maxEdges:262144,maxProperties:262144,maxInputBytes:4*1024*1024,maxReportBytes:8*1024*1024});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export const plain=o=>!!o&&typeof o==='object'&&!Array.isArray(o)&&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
export function bytes(value){return new TextEncoder().encode(JSON.stringify(value)).byteLength;}
export function fileId(value,{zero=true}={}){if(typeof value!=='string'||! /^-?(0|[1-9][0-9]*)$/.test(value)||value==='-0')throw TypeError('fileID must be a decimal string');const n=BigInt(value);if(n<-(1n<<63n)||n>(1n<<63n)-1n||(!zero&&n===0n))throw RangeError('fileID outside signed 64-bit range');return value;}
export function guid(value){if(typeof value!=='string'||!/^[0-9a-fA-F]{32}$/.test(value))throw TypeError('Invalid GUID');return value.toLowerCase();}
export function safePath(path){if(typeof path!=='string'||!path||path.length>1024||/[\\\x00-\x1f]/.test(path)||path.startsWith('/')||path.split('/').some(x=>!x||x==='.'||x==='..')||path.includes(':'))throw TypeError('Unsafe relative input path');return path;}
function boundedText(v,max=1024){if(typeof v!=='string'||v.length>max)throw TypeError('Invalid text field');return v;}
function value(v,depth=0){if(depth>64)throw RangeError('Property depth limit');if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return;if(Array.isArray(v)){for(const x of v)value(x,depth+1);return;}if(plain(v)){for(const [k,x]of Object.entries(v)){boundedText(k);value(x,depth+1);}return;}throw TypeError('Properties must be JSON values');}
export function sourcePosition(source){if(source==null)return {};if(!plain(source)||Object.keys(source).some(k=>!['line','column','start','end','endLine','endColumn'].includes(k))||Object.values(source).some(v=>!Number.isSafeInteger(v)||v<0))throw TypeError('Invalid source position');return {...source};}
export function inspectSnapshot(input){
 if(!plain(input)||input.schemaVersion!==SCHEMA||!Array.isArray(input.files)||input.files.length>LIMITS.maxFiles)throw TypeError('Expected '+SCHEMA+' and bounded files');
 boundedText(input.snapshotId??'snapshot',128);let objects=0,edges=0,properties=0;
 for(const f of input.files){if(!plain(f))throw TypeError('Invalid file');safePath(f.path);if(f.guid!=null)guid(f.guid);if(f.coverage!=null&&!['structured-input','serialized','partial','opaque','meta-only'].includes(f.coverage))throw TypeError('Invalid coverage state');if(!Array.isArray(f.objects))throw TypeError('File objects required');if(f.contentHash!=null&&!/^[0-9a-f]{64}$/.test(f.contentHash))throw TypeError('Invalid SHA256');objects+=f.objects.length;
  for(const o of f.objects){if(!plain(o))throw TypeError('Invalid object');fileId(o.fileId,{zero:false});sourcePosition(o.source);boundedText(o.classId??'',32);if(!plain(o.properties??{}))throw TypeError('Properties map required');value(o.properties??{});properties+=Object.keys(o.properties??{}).length;
   for(const r of o.references??[]){boundedText(r.property);sourcePosition(r.source);fileId(r.fileId);if(r.guid!=null)guid(r.guid);edges++;}
   for(const p of o.parameters??[]){boundedText(p.name);if(!own(TYPES,p.type))throw TypeError('Unknown parameter type tag');}
   for(const u of o.parameterUses??[]){boundedText(u.name);sourcePosition(u.source);boundedText(u.rule??'supplied-rule');if(!Array.isArray(u.allowedTypes)||u.allowedTypes.some(t=>!own(TYPES,t)||t==='Unknown'))throw TypeError('Invalid allowed types');if(u.scopeFileId!=null)fileId(u.scopeFileId,{zero:false});}
  }
 }
 if(objects>LIMITS.maxObjects||edges>LIMITS.maxEdges||properties>LIMITS.maxProperties||bytes(input)>LIMITS.maxInputBytes)throw RangeError('Snapshot limit exceeded');
 return input;
}
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(plain(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export function freezeDeep(v){if(v&&typeof v==='object'&&!ArrayBuffer.isView(v)&&!Object.isFrozen(v)){Object.values(v).forEach(freezeDeep);Object.freeze(v);}return v;}
export function buildIndex(input){
 inspectSnapshot(input);const nodes=[],assetMap=new Map(),guidMap=new Map(),findings=[];
 for(const [fi,f]of input.files.entries()){
  const assetId=f.guid?guid(f.guid):`input:${f.path}`;const entry={...f,assetId,inputFileIndex:fi,nodes:new Map()};const byAsset=assetMap.get(assetId)??[];byAsset.push(entry);assetMap.set(assetId,byAsset);if(f.guid)guidMap.set(guid(f.guid),byAsset);
  for(const o of f.objects){const n={...o,index:nodes.length,assetId,file:f,fileIndex:fi,key:`${assetId}:${o.fileId}`,source:{...(o.source??{}),path:f.path,fileId:o.fileId,classId:o.classId}};nodes.push(n);const matches=entry.nodes.get(o.fileId)??[];matches.push(n);entry.nodes.set(o.fileId,matches);}
 }
 for(const [assetId,entries]of assetMap)if(entries.length>1)findings.push({code:'DUPLICATE_ASSET_ID',category:'reference',severity:'warning',confidence:'confirmed',assetId,paths:entries.map(e=>e.path)});
 for(const entries of assetMap.values())for(const e of entries)for(const [id,ns]of e.nodes)if(ns.length>1)findings.push({code:'DUPLICATE_FILE_ID',category:'reference',severity:'error',confidence:'confirmed',path:e.path,fileId:id});
 return {nodes,assetMap,guidMap,findings};
}

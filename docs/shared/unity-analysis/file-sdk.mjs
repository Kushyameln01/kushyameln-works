import {createComputePool} from '../compute/client.mjs';
import {BUILD_ID} from '../compute/protocol.mjs';
import {createUnityAnalyzer} from './sdk.mjs';
import {SCHEMA,bytes,freezeDeep,LIMITS,inspectSnapshot} from './model.mjs';
import {safePath} from './archive.mjs';
import {PARSER_VERSION} from './ingest-task.mjs';
const MAX_RAW=32*1024*1024,MAX_EXPANDED=64*1024*1024,MAX_FILES=2048;
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
export function createUnityFileAnalyzer({pool,concurrency=2,moduleReuse=false,workerMode='module',onProgress=()=>{}}={}){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw RangeError('concurrency must be 1..4');
 const ownsPool=!pool;pool??=createComputePool({concurrency,moduleReuse,workerMode});const analyzer=createUnityAnalyzer({pool});const sessions=new Map();let disposed=false,sequence=0;
 const progress=e=>{try{onProgress(e);}catch{}};
 function cancel(id){const s=sessions.get(id);if(!s||s.done)return false;s.cancelled=true;for(const job of s.jobs)pool.cancel(job);if(s.analysisId)analyzer.cancel(s.analysisId);return true;}
 function start(beforeInputs,afterInputs,options={}){
  const started=performance.now(),stages={inputSnapshotMs:0,readMs:0,hashMs:0,expandWallMs:0,parseWallMs:0,metadataMs:0,analysisWallMs:0,reportFinalizeMs:0},ownership={inputSnapshotBytes:0,expandedRetainedPeakBytes:0};
  if(disposed)throw Error('Analyzer is disposed');const {inputRevision=0,sessionId='uf-'+crypto.randomUUID(),sessionTimeoutMs=120000,timeoutMs=30000}=options;
  if(!Number.isSafeInteger(inputRevision)||inputRevision<0||typeof sessionId!=='string'||!/^[A-Za-z0-9_.:-]{1,44}$/.test(sessionId)||sessions.has(sessionId))throw TypeError('Invalid session identity');
  if(!Number.isSafeInteger(sessionTimeoutMs)||sessionTimeoutMs<1||sessionTimeoutMs>300000)throw RangeError('Invalid session deadline');
  const ownInputs=inputs=>{if(!Array.isArray(inputs)||inputs.length>MAX_FILES)throw RangeError('INPUT_FILE_COUNT_LIMIT');let total=0;return inputs.map(f=>{const path=safePath(f.webkitRelativePath||f.path||f.name),size=f.bytes instanceof Uint8Array?f.bytes.byteLength:f.size;if(!Number.isSafeInteger(size)||size<0||size>16*1024*1024)throw RangeError('INPUT_FILE_SIZE_LIMIT');total+=size;if(total>MAX_RAW)throw RangeError('RAW_INPUT_LIMIT');if(!(f.bytes instanceof Uint8Array)&&typeof f.arrayBuffer!=='function')throw TypeError('Expected File or {path,bytes}');if(f.bytes instanceof Uint8Array)ownership.inputSnapshotBytes+=size;return {path,size,input:f.bytes instanceof Uint8Array?f.bytes.slice():f};});};
  if(sessions.size>=4){const old=[...sessions].find(([,s])=>s.done);if(old)sessions.delete(old[0]);else throw RangeError('SESSION_COUNT_LIMIT');}
  const copyStarted=performance.now();const parameterLinks=structuredClone(options.parameterLinks??{});let before=ownInputs(beforeInputs),after=afterInputs==null?null:ownInputs(afterInputs);const s={jobs:new Set(),receipts:[],done:false,cancelled:false,report:null};sessions.set(sessionId,s);stages.inputSnapshotMs=performance.now()-copyStarted;
  const timer=setTimeout(()=>{s.deadline=true;cancel(sessionId);},sessionTimeoutMs);
  const check=()=>{if(s.cancelled)throw Error(s.deadline?'SESSION_TIMEOUT':'CANCELLED');};
  async function submit(taskType,payload){check();const jobId=`${sessionId}.${++sequence}`;const h=pool.submit({protocolVersion:1,taskType,taskVersion:1,jobId,inputRevision,payload,limits:{timeoutMs}});s.jobs.add(jobId);const r=await h.promise;s.jobs.delete(jobId);pool.releaseResult?.(jobId);const {result,...receipt}=r;s.receipts.push(receipt);check();if(r.status!=='succeeded')throw Error(`${r.errorCode}: ${r.message??''}`);if(r.buildId!==BUILD_ID||r.jobId!==jobId||r.inputRevision!==inputRevision||r.metrics?.wasmSha256!==null||result?.parserVersion!==PARSER_VERSION)throw Error('INGEST_IDENTITY_MISMATCH');return result;}
  async function snapshot(inputs,label){
   const files=[],selected=[];let expanded=0;const seen=new Map();
   for(const f of inputs){check();progress({sessionId,inputRevision,stage:'reading',snapshot:label,path:f.path});check();const readStarted=performance.now();let raw=f.input instanceof Uint8Array?f.input:new Uint8Array(await f.input.arrayBuffer());stages.readMs+=performance.now()-readStarted;check();if(raw.byteLength!==f.size)throw Error('INPUT_CHANGED');const hashStarted=performance.now();selected.push({path:f.path,byteLength:raw.length,sha256:await sha(raw)});stages.hashMs+=performance.now()-hashStarted;check();
    const expansionStarted=performance.now(),isArchive=/\.(zip|unitypackage)$/i.test(f.path);const items=isArchive?(await submit('unity-expand',{path:f.path,bytes:raw})).files:[{path:f.path,bytes:raw}];if(isArchive)stages.expandWallMs+=performance.now()-expansionStarted;raw=null;f.input=null;
    for(const item of items){const key=safePath(item.path).normalize('NFC').toLowerCase();if(seen.has(key))throw Error('INPUT_PATH_CONFLICT: '+item.path);for(const existing of seen.keys())if(key.startsWith(existing+'/')||existing.startsWith(key+'/'))throw Error('INPUT_PATH_PREFIX_CONFLICT');seen.set(key,true);expanded+=item.bytes.byteLength;if(expanded>MAX_EXPANDED)throw RangeError('EXPANDED_BYTE_LIMIT');if(files.length>=MAX_FILES)throw RangeError('EXPANDED_FILE_COUNT_LIMIT');files.push({path:item.path,bytes:item.bytes});}
   }
   ownership.expandedRetainedPeakBytes=Math.max(ownership.expandedRetainedPeakBytes,expanded);const parseStarted=performance.now();
   files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);const parsed=new Array(files.length);let cursor=0,irBytes=0;
   // Batches cap both Worker count and admitted input bytes. Each result is delivery-only.
   while(cursor<files.length){check();const batch=[];let amount=0;while(cursor<files.length&&batch.length<concurrency){const f=files[cursor];if(batch.length&&amount+f.bytes.byteLength>16*1024*1024)break;amount+=f.bytes.byteLength;batch.push({index:cursor++,file:f});}
    const results=await Promise.all(batch.map(async ({index,file})=>{progress({sessionId,inputRevision,stage:'parsing',snapshot:label,path:file.path,completed:index,total:files.length});const r=await submit('unity-parse',file);file.bytes=null;return {index,file:r.file};}));
    for(const r of results){irBytes+=bytes(r.file);if(irBytes>LIMITS.maxInputBytes)throw RangeError('SNAPSHOT_IR_LIMIT');parsed[r.index]={...r.file};}
   }
   stages.parseWallMs+=performance.now()-parseStarted;const metadataStarted=performance.now();const metas=new Map();for(const f of parsed)if(f.path.endsWith('.meta')&&f.meta?.guid&&f.coverage!=='partial'&&f.coverage!=='opaque'){const path=f.path.slice(0,-5),m=metas.get(path)??[];m.push(f);metas.set(path,m);}
   for(const f of parsed){const ms=metas.get(f.path);if(ms?.length===1){f.guid=ms[0].meta.guid;f.metaPath=ms[0].path;}else if(ms?.length>1){f.coverage='partial';f.reason='Ambiguous metadata';}}
   const result={schemaVersion:SCHEMA,snapshotId:label,files:parsed,...(parameterLinks[label]?{parameterLinks:parameterLinks[label]}:{})};inspectSnapshot(result);stages.metadataMs+=performance.now()-metadataStarted;
   return {snapshot:result,inventory:{selected,files:parsed.map(f=>({path:f.path,sha256:f.contentHash,byteLength:f.byteLength})),rawHashMethod:'actual selected/expanded bytes SHA-256',expandedBytes:expanded}};
  }
  const promise=(async()=>{try{const b=await snapshot(before,'before');before=null;const a=after?await snapshot(after,'after'):null;after=null;check();progress({sessionId,inputRevision,stage:'analyzing'});check();s.analysisId=sessionId+'.a';const opts={inputRevision,sessionId:s.analysisId,timeoutMs,sessionTimeoutMs:Math.max(1,Math.min(300000,sessionTimeoutMs-(performance.now()-started))|0)};
   const analysisStarted=performance.now();const report=await (a?analyzer.compare(b.snapshot,a.snapshot,opts):analyzer.analyze(b.snapshot,opts));check();stages.analysisWallMs=performance.now()-analysisStarted;const finalizeStarted=performance.now();
   const final={...report,sessionId,inputRevision,ingestion:{parserVersion:PARSER_VERSION,before:b.inventory,...(a?{after:a.inventory}:{}),jobs:s.receipts},metrics:{...report.metrics,totalMs:performance.now()-started,analysisStageMs:report.metrics.totalMs,stages,ownership,settings:{concurrency,moduleReuse:pool.getStatus().moduleReuse,workerMode:pool.getStatus().workerMode},timingNotes:'Stage wall sums across snapshots; parse includes task admission/validation, metadata includes IR validation. Startup includes imports/message delivery. reportFinalize and total end before the final report byte-limit check and freeze; caller elapsed includes both.'}};
   stages.reportFinalizeMs=performance.now()-finalizeStarted;final.metrics.totalMs=performance.now()-started;if(bytes(final)>LIMITS.maxReportBytes)throw RangeError('REPORT_BYTE_LIMIT');s.report=freezeDeep(final);s.done=true;progress({sessionId,inputRevision,stage:'complete'});return s.report;
  }finally{clearTimeout(timer);s.done=true;s.cancelled=true;for(const id of s.jobs){pool.cancel(id);pool.releaseResult?.(id);}s.jobs.clear();if(s.analysisId)analyzer.dispose(s.analysisId);s.receipts=[];before=null;after=null;}})();promise.sessionId=sessionId;return promise;
 }
 return Object.freeze({analyze:(inputs,options)=>start(inputs,null,options),compare:(before,after,options)=>start(before,after,options),cancel,getReport:id=>sessions.get(id)?.report??null,dispose(id){if(id!==undefined){cancel(id);sessions.delete(id);return;}if(disposed)return;disposed=true;for(const id of sessions.keys())cancel(id);sessions.clear();analyzer.dispose();if(ownsPool)pool.dispose();}});
}

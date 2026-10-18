// Optional read-only diagnostics. Composer inputs, generation decisions and output bytes are untouched.
export const DIAGNOSTIC_LIMITS=Object.freeze({fileBytes:16*1024*1024,sideBytes:32*1024*1024,textBytes:4*1024*1024,files:2048});
const encoder=new TextEncoder(),textExtension=/\.(controller|anim|prefab|unity|asset|mat|overrideController|meta)$/i;
const now=()=>performance.now();
const fail=code=>{throw new Error(code);};
// Count before encoding: preflight must not allocate copies of earlier accepted inputs.
function utf8Length(value){let size=0;for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c<128)size++;else if(c<2048)size+=2;else if(c>=0xd800&&c<=0xdbff&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){size+=4;i++;}else size+=3;}return size;}
function checkedPath(path){
 if(typeof path!=='string'||!path||path.length>1024||path.startsWith('/')||path.includes('\\')||/[<>"|?*\u0000-\u001f\u007f:]/.test(path)||path.split('/').some(s=>!s||s==='.'||s==='..'||s.length>255||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)||/[ .]$/.test(s)))fail('INPUT_PATH_INVALID');
 return path;
}
export function preflightDiagnosticFiles(files){
 if(!Array.isArray(files)||files.length>DIAGNOSTIC_LIMITS.files)fail('INPUT_FILE_COUNT_LIMIT');
 const seen=new Set();let totalBytes=0;
 for(const file of files){
  const path=checkedPath(file?.path),key=path.normalize('NFC').toLowerCase();
  if(seen.has(key))fail('INPUT_PATH_CONFLICT');
  for(const prior of seen)if(key.startsWith(prior+'/')||prior.startsWith(key+'/'))fail('INPUT_PATH_PREFIX_CONFLICT');
  seen.add(key);let size;
  if(file.bytes instanceof Uint8Array){if((typeof SharedArrayBuffer!=='undefined'&&file.bytes.buffer instanceof SharedArrayBuffer)||file.bytes.buffer.resizable)fail('INPUT_BYTES_MUST_BE_OWNED');size=file.bytes.byteLength;}
  else if(typeof file.text==='string')size=utf8Length(file.text);
  else fail('INPUT_BYTES_REQUIRED');
  if(size>DIAGNOSTIC_LIMITS.fileBytes)fail('INPUT_FILE_SIZE_LIMIT');
  if(textExtension.test(path)&&size>DIAGNOSTIC_LIMITS.textBytes)fail('TEXT_BYTE_LIMIT');
  totalBytes+=size;if(totalBytes>DIAGNOSTIC_LIMITS.sideBytes)fail('RAW_INPUT_LIMIT');
  // This adapter receives already selected files and never re-expands packages.
  if(/\.(zip|unitypackage)$/i.test(path))fail('ARCHIVE_REEXPANSION_DISABLED');
 }
 return {fileCount:files.length,totalBytes};
}
export function copyDiagnosticFiles(files){preflightDiagnosticFiles(files);return files.map(f=>({path:f.path,bytes:f.bytes instanceof Uint8Array?f.bytes.slice():encoder.encode(f.text)}));}
export function diagnosticFileRecords(assets){
 const files=[];for(const asset of assets){if(asset.asset!==null&&asset.asset!==undefined)files.push({path:asset.path,bytes:asset.asset});if(typeof asset.meta!=='string')fail('ASSET_META_REQUIRED');files.push({path:asset.path+'.meta',text:asset.meta});}return files;
}
const clone=value=>value==null?value:structuredClone(value);
function freeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))freeze(child);return value;}
function reason(error,code='DIAGNOSTIC_FAILED'){return {code:error?.code??code,message:String(error?.message??error??code)};}
function identity(context){for(const key of ['inputRevision','selectionRevision','planRevision'])if(!Number.isSafeInteger(context?.[key])||context[key]<0)fail('INVALID_'+key);if(!['input','output','compare'].includes(context?.target))fail('INVALID_DIAGNOSTIC_TARGET');}
function checkedLinks(links){
 if(!Array.isArray(links)||links.length>4096)fail('PARAMETER_LINK_LIMIT');
 for(const link of links)for(const key of ['expression','controller']){const ref=link?.[key];if(typeof ref?.assetId!=='string'||!ref.assetId||typeof ref.fileId!=='string'||! /^-?(0|[1-9][0-9]*)$/.test(ref.fileId)||ref.fileId==='-0'||BigInt(ref.fileId)===0n||BigInt(ref.fileId)<-(1n<<63n)||BigInt(ref.fileId)>(1n<<63n)-1n)fail('PARAMETER_LINK_ID_INVALID');}
 return links;
}
function withSdkCoverage(scope,side,expectedFiles){
 const fileCoverageCounts={serialized:0,partial:0,opaque:0,'meta-only':0,'structured-input':0,unknown:0};
 for(const file of side?.files??[])fileCoverageCounts[Object.hasOwn(fileCoverageCounts,file.coverage)?file.coverage:'unknown']++;
 return {...scope,sdk:{fileCount:side?.files?.length??null,expectedFileCount:expectedFiles,
  allSuppliedFilesAccountedFor:Array.isArray(side?.files)&&side.files.length===expectedFiles,fileCoverageCounts,
  coverageSummary:side?.coverage??null},fullOriginalMaterialsDiagnosis:'not-claimed'};
}
function matchesFiles(side,files){
 if(!Array.isArray(side?.files)||side.files.length!==files.length)return false;
 const expected=new Set(files.map(f=>f.path)),actual=new Set(side.files.map(f=>f.path));
 return actual.size===expected.size&&[...actual].every(path=>expected.has(path));
}
function noResult(context,operationId=null,why={code:'NOT_REQUESTED',message:'共有診断は未実施です。'}){
 return {schemaVersion:'animator-composer-diagnostics/1',operationId,status:'not-run',context:clone(context??{}),reason:why,source:null,inputCoverage:null,mapping:null,
  sourcePositionUnit:'UTF-16 code units',sourcePositionConvention:{offset:'zero-based, end-exclusive',lineColumn:'one-based'},fileIdRepresentation:'signed-64 decimal string',
  exportCompleteness:{allAvailableReportRecordsIncluded:true,sdkReportIncluded:false,truncated:false},timings:{callerElapsedMs:null,prepareMs:null,sdkCallMs:null},
  timingNotes:'callerElapsedMs includes preparation and SDK settlement (including SDK report validation/freeze), ending before envelope JSON sizing/freeze. UI operation elapsed measures the complete await.',sdkReport:null};
}
// Opt-in observations never enter the report, its byte count, or its JSON cache.
function newMetrics(enabled,operationId=null,context=null){
 if(!enabled)return null;
 return {schemaVersion:'composer-diagnostics-service-metrics/1',operationId,context:clone(context),status:'not-run',unit:'ms',
  stages:Object.fromEntries(['prepare','sdkSettlement','envelopeSize','freeze','fullJSON'].map(name=>[name,{calls:0,totalMs:0,lastMs:null}]))};
}
function recordStage(metrics,name,started){if(metrics){const stage=metrics.stages[name],elapsed=now()-started;stage.calls++;stage.totalMs+=elapsed;stage.lastMs=elapsed;}}
function observe(metrics,name,fn){if(!metrics)return fn();const started=now();try{return fn();}finally{recordStage(metrics,name,started);}}
/** The caller owns pool. This service only cancels/disposes its own SDK sessions. */
export function createSharedDiagnostics({pool,onUpdate=()=>{},collectMetrics=false,analyzerFactory=async options=>{const {createUnityFileAnalyzer}=await import('../../shared/unity-analysis/file-sdk.mjs');return createUnityFileAnalyzer(options);}}={}){
 let disposed=false,current=null,report=freeze(noResult()),pretty=null,compactBytes=null,analyzer=null,analyzerPromise=null;
 let metrics=newMetrics(collectMetrics);
 const isCurrent=record=>!disposed&&current===record&&!record.done;
 const publish=(value,knownSize=null)=>{report=observe(metrics,'freeze',()=>freeze(value));if(metrics)metrics.status=value.status;pretty=null;compactBytes=knownSize;try{onUpdate(report);}catch{}};
 const measure=()=>{if(compactBytes===null)compactBytes=observe(metrics,'envelopeSize',()=>encoder.encode(JSON.stringify(report)).byteLength);return compactBytes;};
 const finalize=(record,status,why=null,sdkReport=null)=>{
  if(record.done)return record.result;
  let value={...record.envelope,status,reason:why,sdkReport,timings:{...record.envelope.timings,callerElapsedMs:now()-record.started,...(record.sdkStarted?{sdkCallMs:now()-record.sdkStarted}:{})},
   exportCompleteness:{allAvailableReportRecordsIncluded:true,sdkReportIncluded:status==='succeeded',truncated:false}};
  let size;
  try{size=observe(record.metrics,'envelopeSize',()=>encoder.encode(JSON.stringify(value)).byteLength);}
  catch{value={...noResult(record.context,record.operationId),status:'failed',reason:{code:'ENVELOPE_NOT_JSON',message:'診断の付加情報をJSONとして記録できませんでした。'},timings:{callerElapsedMs:now()-record.started,prepareMs:null,sdkCallMs:null}};size=observe(record.metrics,'envelopeSize',()=>encoder.encode(JSON.stringify(value)).byteLength);}
  record.done=true;
  record.result=observe(record.metrics,'freeze',()=>freeze(value));if(record.metrics)record.metrics.status=value.status;
  if(current===record&&!disposed)publish(record.result,size);
  record.resolve(record.result);return record.result;
 };
 const cancelRecord=(record,why={code:'CANCELLED',message:'共有診断を取り消しました。'})=>{
  if(!record||record.done)return false;record.abort.abort();try{analyzer?.cancel(record.operationId);}catch{}
  finalize(record,'cancelled',why);return true;
 };
 const ensureAnalyzer=()=>{
  if(!analyzerPromise)analyzerPromise=Promise.resolve().then(()=>{
   if(!pool)fail('PAGE_OWNED_POOL_REQUIRED');
   return analyzerFactory({pool,onProgress:event=>{
    const record=current;if(!record||!isCurrent(record)||event?.sessionId!==record.operationId||event.inputRevision!==record.context.inputRevision)return;
    record.envelope={...record.envelope,progress:clone(event)};publish(record.envelope);
   }});
  }).then(value=>{if(disposed){value.dispose?.();fail('DIAGNOSTICS_DISPOSED');}analyzer=value;return value;}).catch(error=>{analyzerPromise=null;throw error;});
  return analyzerPromise;
 };
 function start(context,prepare){
  cancelRecord(current,{code:'SUPERSEDED',message:'新しい共有診断に置き換えました。'});
  context={inputRevision:context?.inputRevision,selectionRevision:context?.selectionRevision,planRevision:context?.planRevision,target:context?.target};
  const operationId='sd-'+crypto.randomUUID(),started=now();
  let resolve;const promise=new Promise(r=>{resolve=r;});
  const record={operationId,context,started,abort:new AbortController(),resolve,done:false,metrics:newMetrics(collectMetrics,operationId,context),envelope:{...noResult(context,operationId),status:'running',reason:null,progress:{stage:'preparing'}}};
  metrics=record.metrics;
  current=record;if(!disposed)publish(record.envelope);
  // The operation ID and handle exist before prepare or any synchronous SDK exception.
  Promise.resolve().then(async()=>{
   let sdk=null;
   try{
    if(disposed)fail('DIAGNOSTICS_DISPOSED');if(!isCurrent(record))return;identity(context);if(typeof prepare!=='function')fail('DIAGNOSTIC_PREPARE_REQUIRED');
    const prepareStarted=now();let prepared;
    try{prepared=await prepare({operationId,signal:record.abort.signal});}finally{recordStage(record.metrics,'prepare',prepareStarted);}
    if(!isCurrent(record))return;
    const compare=context.target==='compare',before=compare?prepared?.before:prepared,after=compare?prepared?.after:null;
    if(!before||compare&&!after)fail('DIAGNOSTIC_PAYLOAD_REQUIRED');
    record.envelope={...record.envelope,source:clone(compare?{before:before.source,after:after.source}:before.source??null),
     inputCoverage:clone(compare?{before:before.coverage,after:after.coverage}:before.coverage??null),mapping:clone(compare?{before:before.mapping??null,after:after.mapping??null}:before.mapping??null),
     timings:{...record.envelope.timings,prepareMs:now()-prepareStarted}};
    if(before.notRunReason||after?.notRunReason){finalize(record,'not-run',clone(before.notRunReason??after.notRunReason));return;}
    if(compare&&before.source?.target!==after.source?.target)fail('COMPARISON_TARGET_MISMATCH');
    // Both sides are checked before the SDK starts its own input snapshots/copies.
    preflightDiagnosticFiles(before.files);if(after)preflightDiagnosticFiles(after.files);
    if(before.files.some(f=>!(f.bytes instanceof Uint8Array))||after?.files.some(f=>!(f.bytes instanceof Uint8Array)))fail('INPUT_BYTES_REQUIRED');
    const parameterLinks={before:checkedLinks(before.parameterLinks??[]),...(after?{after:checkedLinks(after.parameterLinks??[])}:{})};
    sdk=await ensureAnalyzer();if(!isCurrent(record))return;
    record.envelope={...record.envelope,progress:{stage:'starting'}};publish(record.envelope);
    const sdkStarted=record.sdkStarted=now(),options={inputRevision:context.inputRevision,sessionId:operationId,parameterLinks};
    let result;
    try{result=await (after?sdk.compare(before.files,after.files,options):sdk.analyze(before.files,options));}finally{recordStage(record.metrics,'sdkSettlement',sdkStarted);}
    if(!isCurrent(record))return;
    if(result?.status!=='succeeded'||result.sessionId!==operationId||result.inputRevision!==context.inputRevision||result.completeness?.truncated!==false||result.completeness.totalCount!==result.completeness.returnedCount||!matchesFiles(result.before,before.files)||after&&!matchesFiles(result.after,after.files))fail('SDK_REPORT_IDENTITY_OR_COMPLETENESS_MISMATCH');
    record.envelope={...record.envelope,progress:{stage:'complete'},timings:{...record.envelope.timings,sdkCallMs:now()-sdkStarted},
     inputCoverage:compare?{before:withSdkCoverage(record.envelope.inputCoverage.before,result.before,before.files.length),after:withSdkCoverage(record.envelope.inputCoverage.after,result.after,after.files.length)}:withSdkCoverage(record.envelope.inputCoverage,result.before,before.files.length)};
    finalize(record,'succeeded',null,result);
   }catch(error){if(isCurrent(record)||disposed&&!record.done)finalize(record,record.abort.signal.aborted?'cancelled':'failed',reason(error));}
   finally{try{sdk?.dispose?.(operationId);}catch{}}
  });
  return Object.freeze({operationId,promise,cancel:()=>cancelRecord(record)});
 }
 return Object.freeze({start,getReport:()=>report,getMetrics:()=>clone(metrics),getJSON(){return pretty??=observe(metrics,'fullJSON',()=>JSON.stringify(report,null,2)+'\n');},getCompactBytes:measure,
  cancel:()=>cancelRecord(current),invalidate(context){cancelRecord(current,{code:'INPUT_CHANGED',message:'入力または設定の変更により旧診断を無効化しました。'});current=null;if(!disposed){metrics=newMetrics(collectMetrics,null,context);publish(noResult(context,null,{code:'INPUT_CHANGED',message:'現在の入力・設定で共有診断を実行してください。'}));}},
  dispose(){if(disposed)return;cancelRecord(current);disposed=true;current=null;report=freeze(noResult({},null,{code:'DISPOSED',message:'共有診断を終了しました。'}));pretty=null;compactBytes=null;try{analyzer?.dispose?.();}catch{}analyzer=null;analyzerPromise=null;}
 });
}

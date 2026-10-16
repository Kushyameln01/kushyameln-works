// One accepted, SDK-owned immutable report per UI revision. No telemetry or report mutation.
export function createReportCache({clock=()=>performance.now()}={}){
 if(typeof clock!=='function')throw TypeError('A local clock is required');
 let revision=0,report=null,compactBytes=null,prettyText=null;
 let compactSerializations=0,compactSerializationMs=0,prettySerializations=0,prettySerializationMs=0,renderCount=0,renderMs=0;
 function reset(nextRevision){
  if(!Number.isSafeInteger(nextRevision)||nextRevision<revision)throw RangeError('UI revision must not go backwards');
  revision=nextRevision;report=null;compactBytes=null;prettyText=null;
  compactSerializations=0;compactSerializationMs=0;prettySerializations=0;prettySerializationMs=0;renderCount=0;renderMs=0;
 }
 function accept(value,inputRevision){
  if(inputRevision!==revision)return false;
  if(report!==null)return report===value;
  if(!value||typeof value!=='object'||Array.isArray(value))throw TypeError('A report object is required');
  const started=clock(),size=new TextEncoder().encode(JSON.stringify(value)).byteLength,elapsed=clock()-started;
  report=value;compactBytes=size;compactSerializations=1;compactSerializationMs=elapsed;
  return true;
 }
 function pretty(){
  if(report===null)throw Error('REPORT_CACHE_EMPTY');
  if(prettyText===null){const started=clock();prettyText=JSON.stringify(report,null,2);prettySerializationMs=clock()-started;prettySerializations++;}
  return prettyText;
 }
 function recordRender(elapsedMs){if(!Number.isFinite(elapsedMs)||elapsedMs<0)throw RangeError('Invalid render interval');if(report===null)return;renderCount++;renderMs+=elapsedMs;}
 const diagnostics=()=>Object.freeze({revision,hasReport:report!==null,compactBytes,compactSerializations,compactSerializationMs,prettyCached:prettyText!==null,prettySerializations,prettySerializationMs,renderCount,renderMs,scope:'local UI only; render excludes browser paint; compact timing includes UTF-8 sizing'});
 return Object.freeze({reset,accept,pretty,recordRender,diagnostics,get compactBytes(){return compactBytes;}});
}

// DedicatedWorker diagnostics only. Native chunks are comparison operands;
// the server never returns a tensor or replaces any model computation.
let active=null;
const emit=(type,value)=>postMessage({type,value});
const compactError=error=>({name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,2000),code:error?.code??null,stack:String(error?.stack??'').slice(0,5000)});
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export function validateExecutionProfile(config,isolated=globalThis.crossOriginIsolated,shared=typeof SharedArrayBuffer==='function'){
 if(!['blocks','predict'].includes(config.operation)||![1,4].includes(config.wasmThreads)||!['legacy','lookup'].includes(config.decoder)||!Number.isSafeInteger(config.readAheadBytes)||config.readAheadBytes<0||config.readAheadBytes>1048576)throw TypeError('Explicit operation, wasmThreads1|4, decoder and bounded readAheadBytes required');
 if(config.wasmThreads===4&&(!isolated||!shared))throw Error('Explicit wasmThreads4 requires COOP/COEP cross-origin isolation and SharedArrayBuffer');
 if(config.wasmThreads===1&&isolated!==false)throw Error('wasmThreads1 diagnostic requires the separate no-COI route');
 if(config.operation==='predict'&&config.blockLimit!==39)throw Error('Prediction diagnostic requires all40 blocks and final head');
 return {operation:config.operation,wasmThreads:config.wasmThreads,crossOriginIsolated:isolated,decoder:config.decoder,readAheadBytes:config.readAheadBytes};
}
export function modelChunkOptions(config,onChunk){
 const result={stages:[...config.stages],maxRows:128,onChunk};
 if(config.operation==='blocks')result.stopAfterBlock=config.blockLimit;
 return result;
}
function metadata(event){
 const result={};
 for(const key of ['schemaVersion','name','block','globalRowStart','rowCount','rowAxis','columns','storageElementOffset','shape','fullShape','dtype','layout','axes','fullAxes','coordinateAxes','model','timestep'])if(event[key]!==undefined)result[key]=event[key];
 if(event.coordinates)result.coordinates={positions:Array.from(event.coordinates.positions),sourceIds:Array.from(event.coordinates.sourceIds)};
 return result;
}
async function readInput(entry,signal){
 const response=await fetch(entry.url,{signal,cache:'no-store'});if(!response.ok)throw Error('Declared input fetch failed: '+entry.url);
 const data=await response.arrayBuffer();if(data.byteLength!==entry.bytes||await hash(data)!==entry.sha256)throw Error('Declared input identity mismatch: '+entry.url);
 return data;
}
async function run({file,config}){
 if(active)throw Error('Dedicated diagnostic Worker already active');
 if(!(file instanceof File)||file.size!==15574833216)throw TypeError('Local pinned Bernini File required');
 const executionProfile=validateExecutionProfile(config);
 const controller=new AbortController();active=controller;let owner=null,observer=null,timer=null,lastProgress=null,lastChunk=null,lastStats=null,bodyBytes=0,chunks=0,comparisonMs=0,completed=false,executionError=null,cleanupError=null;
 const started=performance.now(),events=[];
 const record=(phase,extra={})=>{const value={phase,elapsedMs:performance.now()-started,...extra};events.push(value);emit('phase',value);};
 const snapshot=phase=>{const stats=owner?.stats?.()??lastStats;return {phase,elapsedMs:performance.now()-started,lastProgress,lastChunk,stats,operatorTiming:stats?.ops?.timings??null,modelTiming:stats?.timing??null,resource:observer?.snapshot(phase)??null,jsHeap:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit}:null,jsHeapObservation:performance.memory?'nonstandard performance.memory; excludes most typed-array backing stores':'unavailable'};};
 try{
  const {createResourceObserver}=await import('/docs/shared/diffusion-models/diagnostics/resource-observer/observer.mjs');
  observer=createResourceObserver({modules:config.wasmModules});observer.install();record('observer-installed-before-candidate-import');
  timer=setInterval(()=>emit('progress',snapshot('periodic')),3000);
  const {createBerniniModelCandidate}=await import('/docs/shared/diffusion-models/execution/model-candidate.mjs');
  const tensors=[];
  for(const tensor of config.tensors){const data=new Float32Array(await readInput(tensor,controller.signal));tensors.push({requirementId:tensor.requirementId,dtype:tensor.dtype,shape:[...tensor.shape],layout:tensor.layout,meaning:tensor.meaning,normalization:tensor.normalization,data});}
  const textData=new Float32Array(await readInput(config.conditioning.payload,controller.signal)),mask=new Uint8Array(await readInput(config.conditioning.mask,controller.signal));
  const text=config.conditioning.metadata,conditioning={dtype:'float32',layout:'BLC',meaning:'text_hidden_states',shape:[...text.shape],normalization:text.normalization,modelSha256:text.modelSha256,tokenizerSha256:text.tokenizerSha256,attentionMask:mask,data:textData};
  record('saved-inputs-loaded',{tensors:tensors.map(({data,...value})=>({...value,bytes:data.byteLength})),textRows:conditioning.shape[1]});
  owner=await createBerniniModelCandidate({file,side:config.side,numThreads:config.wasmThreads,readAheadBytes:config.readAheadBytes,decoder:config.decoder,signal:controller.signal});
  record('candidate-loaded',{description:owner.describe(),resource:observer.snapshot('after-load')});
  const result=await owner.diagnoseChunks({shapeRequest:config.shapeRequest,tensors,conditioning,timestep:config.timestep,signal:controller.signal,onProgress:value=>{lastProgress=value;}},modelChunkOptions(config,async event=>{
   const began=performance.now(),meta=metadata(event);lastChunk={...meta};
   delete lastChunk.coordinates;
   if(!(event.data instanceof Float32Array)||event.data.byteOffset!==0||event.data.byteLength!==event.data.buffer.byteLength||event.data.byteLength>8388608)throw Error('Exact owned bounded chunk required');
   emit('chunk-start',{name:meta.name,block:meta.block,globalRowStart:meta.globalRowStart,rowCount:meta.rowCount,fullShape:meta.fullShape,elapsedMs:performance.now()-started});
   const response=await fetch('/compare',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Run-ID':config.runId,'X-Chunk-Metadata':btoa(JSON.stringify(meta))},body:event.data,signal:controller.signal});
   const comparison=await response.json();if(!response.ok)throw Object.assign(Error(comparison.error??'Independent chunk comparison transport failed'),{code:comparison.code??'CHUNK_COMPARE_FAILED'});
   comparisonMs+=performance.now()-began;bodyBytes+=event.data.byteLength;chunks++;
   if(comparison.failed!==0)throw Object.assign(Error('Independent numeric gate failed: '+meta.name+' block '+meta.block+' row '+meta.globalRowStart),{code:'NUMERIC_GATE_FAILED'});
   emit('chunk-compared',{...comparison,elapsedMs:performance.now()-started});
  }));
  const summary=result.data?{dtype:result.dtype,shape:[...result.shape],layout:result.layout,meaning:result.meaning,bytes:result.data.byteLength,sha256:await hash(result.data),evidence:result.evidence}:result;
  completed=true;lastStats=owner.stats();record('diagnostic-completed',{result:summary,stats:lastStats,resource:observer.snapshot('after-diagnostic')});
 }catch(error){executionError=compactError(error);lastStats=owner?.stats?.()??lastStats;record('diagnostic-failed',{error:executionError,lastProgress,lastChunk,stats:lastStats});}
 finally{
  if(timer!==null)clearInterval(timer);
  try{await owner?.dispose();record('candidate-disposed',{stats:owner?.stats?.()??lastStats});}catch(error){cleanupError=compactError(error);record('dispose-failed',{error:cleanupError});}
  if(observer){await observer.settle();record('after-dispose',{resource:observer.snapshot('after-dispose'),diagnostics:observer.diagnostics()});observer.restore();}
  active=null;
 }
 return {schemaVersion:'bernini-production-chunk-worker/1',completed:completed&&!cleanupError,operation:config.operation,blockLimit:config.blockLimit,side:config.side,totalTokens:config.totalTokens,publicPredictAccepted:false,productionSampleAccepted:false,generationReady:false,executionError,cleanupError,lastProgress,lastChunk,stats:lastStats,events,chunks,bodyBytes,comparisonMs,elapsedMs:performance.now()-started,...executionProfile,observerRestored:true,localModelFile:{name:file.name,bytes:file.size},unknownResourceCoverage:['WASM Memory capacity is not allocator usage','ORT native internal copies/allocator live bytes are not directly observable','performance.memory excludes most ArrayBuffer backing stores','RSS/PSS and whole-process observations belong to outer runner']};
}
if(typeof self!=='undefined')self.onmessage=async({data})=>{
 if(data?.kind==='cancel'){active?.abort(new DOMException('Diagnostic cancelled by harness','AbortError'));return;}
 if(data?.kind!=='run')return;
 try{emit('result',await run(data));}catch(error){emit('fatal',compactError(error));}
};

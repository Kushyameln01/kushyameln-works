import {createInferenceAPI,encodeTensor} from '/shared/inference/api.mjs';
import {tokenizePlainText} from '/shared/inference/tokenizer.mjs';
import {validateTextEncoderInput} from '/shared/inference/text-encoder-api.mjs';
import {observePlainMemory} from './plain_memory.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const equal=(a,b)=>JSON.stringify(Array.from(a))===JSON.stringify(Array.from(b));
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
let memoryPhase='setup';
const pageMemory=observePlainMemory(value=>console.log('plain-memory:'+JSON.stringify({source:'page',phase:memoryPhase,...value})));
globalThis.runPlain=async spec=>{
 const result={passed:false,scope:'One explicit plain prompt; actual native Worker/ORT WASM/Hike final norm; independent comparison is outside this browser helper',workers:{created:0,terminated:0},events:[],observations:[],newExports:0};
 let api,phase='full',cancelTriggered=false;const urls=[];
 try{
  const files=new Map();for(const file of document.querySelector('#bundle').files){check(!files.has(file.name),'Duplicate local filename');files.set(file.name,file);}
  const source=document.querySelector('#source').files[0];check(source instanceof File&&source.size===spec.manifest.modelBytes,'Actual original source File');
  const manifestFile=files.get('manifest.json'),manifestBytes=await manifestFile.arrayBuffer();check(await hash(manifestBytes)===spec.input.manifestSha256,'Selected manifest bytes');
  const manifest=JSON.parse(new TextDecoder().decode(manifestBytes));files.set(manifest.embedding.sourceFile,source);
  const tokenizer=await tokenizePlainText(spec.input.text,new Uint8Array(await files.get(manifest.tokenizer.path).arrayBuffer()));
  check(equal(tokenizer.tokenIds,spec.input.tokenIds)&&equal(tokenizer.attentionMask,spec.input.attentionMask),'Independent Python/browser all512 tokenizer IDs and mask');
  result.tokenizer={tokenIds:Array.from(tokenizer.tokenIds),attentionMask:Array.from(tokenizer.attentionMask),sha256:tokenizer.tokenizerSha256,effectiveTokens:tokenizer.effectiveTokens,all512IdsMatch:true,all512MaskMatch:true};
  const workerFactory=()=>{
   const worker=new Worker('/plain-proof/plain_observer_worker.mjs',{type:'module'});result.workers.created++;
   const terminate=worker.terminate.bind(worker);let terminated=false;
   worker.terminate=()=>{if(!terminated){terminated=true;result.workers.terminated++;pageMemory.mark('worker-terminate',{phase,workersTerminated:result.workers.terminated});}return terminate();};
   worker.addEventListener('message',({data})=>{if(data.plainMemory)console.log('plain-memory:'+JSON.stringify({source:'worker',phase,...data.plainMemory}));if(data.plainObservation)result.observations.push({phase,jobId:data.jobId,inputRevision:data.inputRevision,type:data.type,progress:data.progress??null,counts:data.plainObservation});});
   return worker;
  };
  api=createInferenceAPI({workerFactory,onState:state=>{
   if(state.progress){const event={phase,inputRevision:state.inputRevision,...state.progress};result.events.push(event);console.log('plain-progress:'+JSON.stringify(event));}
   if(phase==='cancel'&&!cancelTriggered&&state.progress?.stage==='text-block'&&state.progress.completed===1){cancelTriggered=true;result.cancelTarget={inputRevision:state.inputRevision,progress:state.progress};result.nativeCancelAccepted=api.textEncoder.cancel();}
  }});
  api.textEncoder.configure({manifest,files,diagnostics:true});
  memoryPhase='full';pageMemory.mark('full-start');const started=performance.now(),output=await api.textEncoder.encode({text:spec.input.text});
  result.fullWallSeconds=(performance.now()-started)/1000;
  pageMemory.mark('full-end');memoryPhase='between';
  const tensor=output.tensor,evidence=output.evidence,session=evidence.sessionObservation;
  check(tensor.dtype==='float32'&&tensor.layout==='BLC'&&tensor.meaning==='text_hidden_states'&&JSON.stringify(tensor.shape)==='[1,512,4096]','Plain output exact contract');
  check(tensor.modelSha256===manifest.modelSha256&&tensor.tokenizerSha256===manifest.tokenizer.sha256,'Actual output provenance');
  check(equal(tensor.attentionMask,spec.input.attentionMask),'Actual native output mask');
  check(evidence.inputMode==='plain-text'&&evidence.hikeContributed&&evidence.hikeOperation==='actual encoder.final_layer_norm','Actual plain/Hike contribution');
  check(session.created===24&&session.released===24&&session.active===0&&session.maximumActive===1&&session.runCalls===24&&session.tensorDisposeCalls===72,'Real24-session/Tensor lifetime');
  let paddingExactlyZero=true,finite=true;for(let row=0;row<512;row++)for(let c=0;c<4096;c++){const value=tensor.data[row*4096+c];if(!Number.isFinite(value))finite=false;if(!tensor.attentionMask[row]&&value!==0)paddingExactlyZero=false;}
  check(finite&&paddingExactlyZero,'Full output finite and every masked value exactly0');
  result.output={shape:tensor.shape,dtype:tensor.dtype,layout:tensor.layout,meaning:tensor.meaning,modelSha256:tensor.modelSha256,tokenizerSha256:tensor.tokenizerSha256,attentionMask:Array.from(tensor.attentionMask),finite,paddingExactlyZero,elements:tensor.data.length};result.evidence=evidence;
  const bytes=await encodeTensor(tensor),url=URL.createObjectURL(new Blob([bytes]));urls.push(url);const anchor=document.createElement('a');anchor.href=url;anchor.download='plain-conditioning.wktensor';anchor.click();
  result.download={bytes:bytes.byteLength,sha256:await hash(bytes)};
  phase='cancel';memoryPhase='cancel';pageMemory.mark('cancel-start');const cancelStart=performance.now();
  try{await api.textEncoder.encode({text:spec.input.text});throw Error('Cancellation did not reject');}catch(error){check(cancelTriggered&&result.nativeCancelAccepted&&String(error).includes('cancelled'),'Native plain cancellation');result.cancelError=String(error);}
  result.cancelWallSeconds=(performance.now()-cancelStart)/1000;result.cancelState=api.state;check(api.state.status==='cancelled','Cancellation terminal state');
  pageMemory.mark('cancel-end');memoryPhase='finished';
  check(result.workers.created===2&&result.workers.terminated===2,'Owned full/cancel Workers terminated');
  result.passed=true;
 }catch(error){result.error={name:error.name,message:error.message,stack:error.stack};}
 finally{api?.dispose();result.disposedState=api?.state??null;for(const url of urls)URL.revokeObjectURL(url);result.pageMemoryObservation=pageMemory.summary();pageMemory.mark('page-disposed');}
 return result;
};

// Suite evidence remains separate from the historical single-prompt proof above.
// A control terminates the owned native Worker after its observed boundary; it
// does not claim that an asynchronous browser/ORT operation was paused there.
globalThis.runTextSuite=async spec=>{
 const result={passed:false,scope:'Explicit Text cases; actual Worker/ORT WASM/Hike, with independent all-value comparison outside this helper',cases:[],controls:[],negativeCases:[],workers:{created:0,terminated:0},events:[],observations:[],newExports:0};
 const apis=new Set(),urls=[],outputs=new Map();let phase='setup',activeCase=null;
 try{
  const files=new Map();for(const file of document.querySelector('#bundle').files){check(!files.has(file.name),'Duplicate local filename');files.set(file.name,file);}
  const source=document.querySelector('#source').files[0];check(source instanceof File&&source.size===spec.manifest.modelBytes,'Actual original source File');
  const manifestBytes=await files.get('manifest.json').arrayBuffer(),manifestSha256=await hash(manifestBytes);
  const expectedHash=spec.manifestSha256??spec.inputs?.[0]?.manifestSha256??spec.controlInputs?.[0]?.manifestSha256;
  check(expectedHash&&manifestSha256===expectedHash,'Selected suite manifest bytes');
  const manifest=JSON.parse(new TextDecoder().decode(manifestBytes));check(JSON.stringify(manifest)===JSON.stringify(spec.manifest),'Suite selected manifest content');files.set(manifest.embedding.sourceFile,source);
  result.manifestSha256=manifestSha256;
  async function caseFiles(record){
   const selected=new Map(files);
   if(record.byteGraph!==undefined){
    check(Number.isInteger(record.byteGraph)&&record.byteGraph>=0&&record.byteGraph<24,'Bounded bytes graph index');
    const path=manifest.blocks[record.byteGraph].path;
    selected.set(path,new Uint8Array(await files.get(path).arrayBuffer()));
   }
   return selected;
  }
  function makeAPI(selected,onMemory=()=>{}){
   let api;const workerPhase=phase,workerCase=activeCase;
   api=createInferenceAPI({workerFactory:()=>{
    const worker=new Worker('/plain-proof/plain_observer_worker.mjs',{type:'module'});result.workers.created++;
    const terminate=worker.terminate.bind(worker);let terminated=false;
    worker.terminate=()=>{if(!terminated){terminated=true;result.workers.terminated++;pageMemory.mark('worker-terminate',{phase:workerPhase,caseId:workerCase,workersTerminated:result.workers.terminated});}return terminate();};
    worker.addEventListener('message',({data})=>{
     if(data.plainMemory){const event={source:'worker',phase:workerPhase,caseId:workerCase,...data.plainMemory};console.log('plain-memory:'+JSON.stringify(event));onMemory(data.plainMemory,api);}
     if(data.plainObservation)result.observations.push({phase:workerPhase,caseId:workerCase,jobId:data.jobId,inputRevision:data.inputRevision,type:data.type,progress:data.progress??null,counts:data.plainObservation});
    });
    return worker;
   },onState:state=>{
    if(state.progress){const event={phase,caseId:activeCase,inputRevision:state.inputRevision,...state.progress};result.events.push(event);console.log('plain-progress:'+JSON.stringify(event));}
   }});
   api.textEncoder.configure({manifest,files:selected,diagnostics:true});apis.add(api);return api;
  }
  async function inspectInput(record){
   check(typeof record.id==='string'&&/^[A-Za-z0-9_-]+$/.test(record.id),'Safe unique suite case ID');
   const input=validateTextEncoderInput(record.input);
   if(input.text!==undefined){
    const tokenizer=await tokenizePlainText(input.text,new Uint8Array(await files.get(manifest.tokenizer.path).arrayBuffer()));
    check(equal(tokenizer.tokenIds,record.tokenIds)&&equal(tokenizer.attentionMask,record.attentionMask),'Independent Python/browser complete tokenizer IDs and mask');
    check(JSON.stringify(record.shape)==='[1,512,4096]','Plain native output shape');
    return{tokenIds:Array.from(tokenizer.tokenIds),attentionMask:Array.from(tokenizer.attentionMask),sha256:tokenizer.tokenizerSha256,effectiveTokens:tokenizer.effectiveTokens,allIdsMatch:true,allMaskMatch:true};
   }
   check(equal(input.tokenIds,record.tokenIds)&&equal(input.attentionMask,record.attentionMask),'Explicit ID case contract');
   check(JSON.stringify(record.shape)===JSON.stringify([1,input.tokenIds.length,4096]),'Explicit ID native output shape');return null;
  }
  function inspectOutput(output,record){
   const tensor=output.tensor,evidence=output.evidence,session=evidence?.sessionObservation;
   check(tensor.dtype==='float32'&&tensor.layout==='BLC'&&tensor.meaning==='text_hidden_states'&&JSON.stringify(tensor.shape)===JSON.stringify(record.shape),'Case exact native output contract');
   check(tensor.modelSha256===manifest.modelSha256&&tensor.tokenizerSha256===manifest.tokenizer.sha256,'Case actual output provenance');
   check(equal(tensor.attentionMask,record.attentionMask),'Case native output mask');
   check(evidence.inputMode===(record.input.text!==undefined?'plain-text':'token-ids')&&evidence.hikeContributed&&evidence.hikeOperation==='actual encoder.final_layer_norm','Case native input/Hike contribution');
   check(session?.created===24&&session.released===24&&session.active===0&&session.maximumActive===1&&session.runCalls===24&&session.tensorDisposeCalls===72,'Real case24-session/Tensor lifetime');
   const rows=record.shape[1];check(tensor.data.length===rows*4096,'Every native output element present');
   let paddingExactlyZero=true,finite=true;
   for(let row=0;row<rows;row++)for(let c=0;c<4096;c++){const value=tensor.data[row*4096+c];if(!Number.isFinite(value))finite=false;if(!record.attentionMask[row]&&value!==0)paddingExactlyZero=false;}
   check(finite&&paddingExactlyZero,'Case full output finite and every masked value exactly0');
   return{shape:tensor.shape,dtype:tensor.dtype,layout:tensor.layout,meaning:tensor.meaning,modelSha256:tensor.modelSha256,tokenizerSha256:tensor.tokenizerSha256,attentionMask:Array.from(tensor.attentionMask),finite,paddingExactlyZero,elements:tensor.data.length};
  }
  // Host ownership is checked after the actual serializer's awaited hash. The
  // module cancel API controls inference and does not abort this codec call.
  async function saveOwned(tensor,name,owner,cancelSave=false){
   const revision=owner.revision,pending=encodeTensor(tensor);
   if(cancelSave)owner.revision++;
   const bytes=await pending;
   if(owner.revision!==revision)return{published:false,serializedBytes:bytes.byteLength,reason:'Host save revision invalidated; serializer completed without publication'};
   const url=URL.createObjectURL(new Blob([bytes]));urls.push(url);const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();
   return{published:true,name,bytes:bytes.byteLength,sha256:await hash(bytes)};
  }
  const records=new Map();for(const record of [...(spec.inputs??[]),...(spec.controlInputs??[])]){check(!records.has(record.id),'Unique suite case ID');records.set(record.id,record);}
  for(const negative of spec.negativeCases??[]){
   const entry={id:negative.id,passed:false,newNeuralRuns:0};result.negativeCases.push(entry);
   try{
    const input=validateTextEncoderInput(negative.input);
    if(input.text!==undefined)await tokenizePlainText(input.text,new Uint8Array(await files.get(manifest.tokenizer.path).arrayBuffer()));
    entry.acceptedUnexpectedly=true;
   }catch(error){const expectedError=negative.expectedError??negative.errorIncludes;entry.error={name:error.name,message:error.message};entry.passed=!expectedError||error.message.includes(expectedError);}
   check(entry.passed,'Negative suite input was not rejected as declared: '+negative.id);
  }
  if(spec.preflightOnly){
   result.preflight=[];
   for(const record of records.values())result.preflight.push({id:record.id,passed:true,shape:record.shape,tokenizer:await inspectInput(record),tokenIds:Array.from(record.tokenIds),attentionMask:Array.from(record.attentionMask)});
   result.newNeuralRuns=0;result.scope='Actual tokenizer and input contract preflight; no Worker or neural execution';check(result.workers.created===0,'Preflight must not create a Worker');result.passed=true;return result;
  }
  for(const record of spec.inputs??[]){
   activeCase=record.id;phase='case:'+record.id;memoryPhase=phase;pageMemory.mark('case-start',{caseId:record.id});
   const tokenizer=await inspectInput(record),selected=await caseFiles(record),api=makeAPI(selected),started=performance.now();
   try{
    const output=await api.textEncoder.encode(record.input),metadata=inspectOutput(output,record);
    const download=await saveOwned(output.tensor,record.id+'.wktensor',{revision:1});
    outputs.set(record.id,output);
    result.cases.push({id:record.id,passed:true,tokenizer,output:metadata,evidence:output.evidence,download,wallSeconds:(performance.now()-started)/1000,inputStorage:record.byteGraph===undefined?'File-backed':'One graph bytes; remaining graphs/source File-backed',byteGraph:record.byteGraph??null});
   }finally{api.dispose();apis.delete(api);pageMemory.mark('case-end',{caseId:record.id});}
  }
  for(const control of spec.controls??[]){
   const record=records.get(control.caseId);check(record,'Control must name a selected case');activeCase=record.id;phase='control:'+control.id;memoryPhase=phase;
   const entry={id:control.id,caseId:record.id,action:control.action,event:control.event??null,triggered:false,published:false,passed:false};result.controls.push(entry);
   if(control.action==='cancel-save'){
    const output=outputs.get(record.id);check(output,'Save cancellation reuses a completed selected numerical case');
    entry.triggered=true;entry.codec=await saveOwned(output.tensor,'cancelled-'+record.id+'.wktensor',{revision:1},true);entry.published=entry.codec.published;entry.passed=!entry.published;entry.scope='Host publication cancellation; native tensor serializer completed';continue;
   }
   check(['cancel','reconfigure','dispose'].includes(control.action)&&typeof control.event==='string','Supported native cancellation control');
   await inspectInput(record);const selected=await caseFiles(record);let timer;
   const api=makeAPI(selected,(event,currentAPI)=>{
    if(entry.triggered||event.event!==control.event||control.fileName!==undefined&&event.fileName!==control.fileName||control.inputBytes!==undefined&&event.inputBytes!==control.inputBytes)return;
    entry.triggered=true;entry.boundary={...event};entry.stateBefore=currentAPI.state;
    if(control.action==='cancel')entry.nativeCancelAccepted=currentAPI.textEncoder.cancel();
    else if(control.action==='reconfigure'){currentAPI.textEncoder.configure({manifest,files:selected,diagnostics:true});entry.reconfigured=true;}
    else currentAPI.dispose();
   });
   const started=performance.now();
   try{
    timer=setTimeout(()=>{entry.timedOut=true;api.textEncoder.cancel();},control.timeoutMs??1800000);
    try{await api.textEncoder.encode(record.input);entry.resolvedUnexpectedly=true;}catch(error){entry.error=String(error);}
    clearTimeout(timer);await new Promise(resolve=>setTimeout(resolve,0));entry.stateAfter=api.state;
    const terminal=control.action==='dispose'?'disposed':'cancelled';
    entry.passed=entry.triggered&&!entry.timedOut&&!entry.resolvedUnexpectedly&&entry.error?.includes('cancelled')&&entry.stateAfter.status===terminal&&(control.action!=='cancel'||entry.nativeCancelAccepted===true);
    entry.wallSeconds=(performance.now()-started)/1000;entry.scope='Observed boundary followed by native owner termination; no numeric replacement or exact native pause claim';check(entry.passed,'Native suite control failed: '+control.id);
    if(control.recover){
     check(control.action==='cancel','Recovery requires a live configured API after cancel');
     const priorRevision=api.state.inputRevision,output=await api.textEncoder.encode(record.input),metadata=inspectOutput(output,record),stateAfter=api.state;
     check(stateAfter.status==='success'&&stateAfter.inputRevision>priorRevision,'Recovery must advance revision and complete on the same configured API');
     entry.recovery={passed:true,output:metadata,evidence:output.evidence,values:Array.from(output.tensor.data),stateAfter,priorRevision};
    }
   }finally{clearTimeout(timer);api.dispose();apis.delete(api);}
  }
  check(result.workers.created===result.workers.terminated,'Every suite-owned Worker terminated');result.passed=true;
 }catch(error){result.error={name:error.name,message:error.message,stack:error.stack};}
 finally{for(const api of apis)api.dispose();for(const url of urls)URL.revokeObjectURL(url);result.pageMemoryObservation=pageMemory.summary();pageMemory.mark('suite-disposed');}
 return result;
};

import {createInferenceAPI,encodeTensor} from '/shared/inference/api.mjs';
import {tokenizePlainText} from '/shared/inference/tokenizer.mjs';
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
  api.textEncoder.configure({manifest,files});
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

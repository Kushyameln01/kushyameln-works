const failure=(code,message,details)=>Object.assign(new Error(message),{code,...(details?{details}:{})});
const sameIdentity=(reply,request)=>['buildId','protocolVersion','sessionId','jobId','inputRevision','op'].every(key=>reply?.[key]===request[key]);

/** Use the owner's complete template; the panel supplies target dimensions only. */
export function buildSamplePlan(capability,dimensions,deriveWorkflowShapes){
 const template=capability?.normalInputs?.defaults?.shapeRequest;
 if(!template)throw failure('NORMAL_INPUTS_UNAVAILABLE','通常生成の入力契約が公開されていません。配布版を確認してください。');
 for(const key of ['width','height','frames'])if(!Number.isSafeInteger(dimensions[key])||dimensions[key]<1)throw failure('INVALID_DIMENSIONS','幅・高さ・フレーム数には正の整数を指定してください。');
 const shapeRequest=structuredClone(template);
 Object.assign(shapeRequest.target,dimensions);
 const shapePlan=deriveWorkflowShapes(shapeRequest);
 const target=shapePlan.requirements.find(entry=>entry.requirementId==='target.latent');
 if(target?.qualification?.spatialRoundtripExact!==true||target?.qualification?.fullFrameRetention!==true)throw failure('UNSUPPORTED_TARGET_GEOMETRY','指定サイズでは要求した全画素・全フレームを保持できません。幅・高さを16刻み、フレーム数を1から4刻みに変更してください。',{qualification:target?.qualification,requiredChange:'幅・高さは16以上の16刻み、フレーム数は1以上で1から4刻みに指定してください。'});
 if(shapePlan.target.padding?.tail?.some(value=>value!==0))throw failure('UNSUPPORTED_PADDING','指定サイズには未対応の patch padding が必要です。幅・高さを16刻みに変更してください。',{padding:shapePlan.target.padding,requiredChange:'幅・高さを16以上の16刻みに指定してください。'});
 if(!shapePlan.orderedContexts?.complete||shapePlan.orderedContexts.entries.length)throw failure('UNSUPPORTED_CONTEXT','このパネルは target のみを扱います。context を含む入力には対応していません。');
 return {shapeRequest,shapePlan};
}

export function conditioningDescriptor(tensor){
 const result={};
 for(const key of ['dtype','shape','layout','meaning','normalization','modelSha256','tokenizerSha256'])if(tensor[key]!==undefined)result[key]=structuredClone(tensor[key]);
 if(tensor.attentionMask!==undefined)result.attentionMask={dtype:'uint8',shape:[tensor.attentionMask.length]};
 return result;
}

export function resultFilename(tensor){
 const contract=tensor?.latentContract,normalization=contract?.normalization;
 return tensor?.meaning==='wan21-raw-generated-sample:v1'&&contract?.representation==='generated-sample'&&contract?.space==='raw'&&normalization?.state==='restored'&&normalization?.owner==='diffusion_models'&&normalization?.id==='wan21-comfy-f32-v1'
  ?'diffusion-raw-generated-sample.wktensor':'diffusion-tensor.wktensor';
}

/** One direct public API request at a time, with exact cancellation ownership. */
export function createRequestSession(api,{protocolVersion,buildId},{onActive=()=>{},onProgress=()=>{}}={}){
 let serial=0,revision=0,active=null,disposed=false;
 function request(op,input={}){
  if(disposed)throw failure('DISPOSED','管理は終了しています。');
  if(active)throw failure('BUSY','処理の完了を待ってください。');
  const command={protocolVersion,buildId,sessionId:api.sessionId,jobId:'df-'+(++serial),inputRevision:++revision,op,input};
  let finish;const record={request:command,done:new Promise(resolve=>{finish=resolve;})};active=record;onActive(record);
  return (async()=>{
   try{
    const reply=await api.request(command,{onProgress:event=>{
     if(!disposed&&active===record&&sameIdentity(event,command)&&event.status==='progress')onProgress(event);
    }});
    if(!sameIdentity(reply,command))throw failure('INVALID_RESPONSE','実行対象と一致しない応答を受信しました。');
    if(reply.status==='error')throw failure(reply.error?.code??'EXECUTION_FAILED',reply.error?.message??'処理に失敗しました。',reply.error?.details);
    if(reply.status!=='ok')throw failure('INVALID_RESPONSE','終端応答の形式が不正です。');
    if(disposed)throw failure('DISPOSED','管理は終了しています。');
    return reply.result;
   }finally{
    if(active===record){active=null;onActive(null);}finish();
   }
  })();
 }
 async function cancel(){
  const record=active;if(!record)return null;
  const {sessionId,jobId,inputRevision}=record.request;
  const reply=api.cancel({sessionId,jobId,inputRevision});
  if(reply.status!=='ok')throw failure(reply.error?.code??'CANCEL_FAILED',reply.error?.message??'取消に失敗しました。',reply.error?.details);
  await record.done;return reply.result;
 }
 function dispose(){if(disposed)return;disposed=true;api.dispose();}
 return Object.freeze({request,cancel,dispose,get active(){return active;},get disposed(){return disposed;}});
}

function metadata(tensor){
 const result={};
 for(const [key,value]of Object.entries(tensor??{})){
  if(key==='data'||key==='evidence')continue;
  result[key]=key==='attentionMask'?{dtype:'uint8',shape:[value.length],activePositions:Array.from(value).filter(x=>x===1).length}:value;
 }
 if(tensor?.data)result.payloadByteLength=tensor.data.byteLength;
 return result;
}
const json=value=>JSON.stringify(value,(_,entry)=>typeof entry==='bigint'?String(entry):entry,2);

export function mountDiffusionPanel(doc=document,loadNative=()=>import('../shared/ai-connection/adapters/diffusion-public/native.mjs')){
 const ids=['panel','high-file','low-file','positive-file','negative-file','same-positive','width','height','frames','threads','thread-note','fixed-settings','load','run','cancel','unload','inspect-status','dispose','restart','status','model-status','progress','progress-text','shape-summary','conditioning-summary','reuse-file','read','result-summary','result-metadata','save','saved-state','error','error-details','technical'];
 const el=Object.fromEntries(ids.map(id=>[id,doc.getElementById('df-'+id)]));
 let native=null,session=null,caps=null,busy=false,initializing=false,modelSessionId=null,cleanupRequired=false,cancelRequested=false,latestAction=0,output=null,outputOrigin=null,downloadUrl=null;
 const canFour=globalThis.crossOriginIsolated===true&&typeof SharedArrayBuffer==='function';
 const status=(message,state='READY')=>{el.status.textContent=message;el.status.dataset.state=state;};
 const modelStatus=()=>{el['model-status'].textContent=cleanupRequired?'解放を再試行する必要があります。':modelSessionId?'HIGH / LOW モデルを読み込み済みです。':'モデルは未読込みです。取消後は同じ File から再読込みできます。';};
 const revokeDownload=()=>{if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;}};
 function render(){
  const ready=!!session&&!session.disposed&&!initializing,locked=busy||!ready;
  for(const key of ['positive-file','same-positive','width','height','frames','reuse-file'])el[key].disabled=locked;
  el['negative-file'].disabled=locked||el['same-positive'].checked;
  for(const key of ['high-file','low-file','threads'])el[key].disabled=locked||!!modelSessionId||cleanupRequired;
  el.threads.querySelector('option[value="4"]').disabled=!canFour;
  el.load.disabled=locked||!!modelSessionId||cleanupRequired||!el['high-file'].files?.[0]||!el['low-file'].files?.[0];
  const textReady=!!el['positive-file'].files?.[0]&&(el['same-positive'].checked||!!el['negative-file'].files?.[0]);
  el.run.disabled=locked||!modelSessionId||cleanupRequired||!textReady;
  el.read.disabled=locked||!el['reuse-file'].files?.[0];el.save.disabled=locked||!output;
  el.cancel.disabled=!busy||!session?.active||cancelRequested;
  el.unload.disabled=locked||(!modelSessionId&&!cleanupRequired);
  el['inspect-status'].disabled=locked;el.dispose.disabled=locked;
  el.restart.disabled=busy||initializing||ready;
  el.panel.setAttribute('aria-busy',String(busy||initializing));modelStatus();
 }
 function showError(error){
  const code=error.code??'UNEXPECTED_ERROR';
  if(code==='CANCELLED'||error.details?.workerTerminated||error.details?.reloadRequired){modelSessionId=null;cleanupRequired=false;}
  if(['MODEL_CLEANUP_REQUIRED','MODEL_UNLOAD_FAILED'].includes(code)||error.details?.cleanupRequired)cleanupRequired=true;
  if(['MODEL_NOT_LOADED','STALE_MODEL'].includes(code))modelSessionId=null;
  el.error.hidden=false;el.error.textContent=code+': '+String(error.message??error);
  el['error-details'].textContent=json({code,message:String(error.message??error),...(error.details?{details:error.details}:{})});
  status(code==='CANCELLED'?'取消が完了しました。モデルの再読込みが必要です。':'処理を完了できませんでした。下の理由を確認してください。',code==='CANCELLED'?'CANCELLED':'ERROR');
 }
 function publishResult(tensor,origin,extra={}){
  revokeDownload();output=tensor;outputOrigin=origin;
  const summary=metadata(tensor),shape=Array.isArray(tensor.shape)?'['+tensor.shape.join(', ')+']':'不明';
  el['result-summary'].textContent=(origin==='sample'?'生成結果':'File から読んだ tensor')+' — '+tensor.dtype+' / '+tensor.layout+' '+shape+' / '+tensor.meaning;
  el['result-metadata'].textContent=json({...summary,...extra});
  el['saved-state'].textContent='この結果を WKTENSOR として保存できます。VAE による画像への復号は行っていません。';
 }
 async function action(message,work){
  if(busy||!session||session.disposed)return;
  const actionId=++latestAction;busy=true;cancelRequested=false;el.error.hidden=true;el.progress.value=0;el['progress-text'].textContent='';status(message,'RUNNING');render();
  const isCurrent=()=>latestAction===actionId&&!!session&&!session.disposed;
  try{await work(isCurrent);}catch(error){if(isCurrent())showError(error);}
  finally{if(latestAction===actionId){busy=false;cancelRequested=false;render();}}
 }
 function plan(){
  for(const key of ['width','height','frames'])if(!el[key].checkValidity())throw failure('INVALID_DIMENSIONS','幅・高さは16以上の16刻み、フレーム数は1以上で1から4刻みに指定してください。',{field:key,requiredChange:el[key].validationMessage});
  const value=buildSamplePlan(caps.executionDescriptor.operations.sample,{width:Number(el.width.value),height:Number(el.height.value),frames:Number(el.frames.value)},native.deriveWorkflowShapes);
  const target=value.shapePlan.target;
  el['shape-summary'].textContent='要求サイズ '+el.width.value+' × '+el.height.value+' / '+el.frames.value+' フレーム → latent ['+target.initialLatentShape?.join(', ')+'] / target '+target.tokenCount+' tokens';
  return value;
 }
 function preview(){try{if(caps)plan();}catch(error){el['shape-summary'].textContent=error.message;}}
 async function initialize(){
  if(busy||initializing)return;initializing=true;status('Diffusion の公開 API を読み込んでいます。','INITIALIZING');render();
  const actionId=++latestAction;let ownedSession=null;
  try{
   native=await loadNative();if(actionId!==latestAction)return;
   const api=await native.createDiffusionModels();
   if(actionId!==latestAction){api.dispose();return;}
   ownedSession=createRequestSession(api,{protocolVersion:native.PROTOCOL_VERSION,buildId:native.BUILD_ID},{onActive:()=>render(),onProgress:event=>{
    const sample=event.result??{},detail=sample.model??sample;
    const step=detail.step??sample.step??detail.stepIndex,block=detail.block??detail.blockIndex;
    const rows=detail.completedRows??detail.queryRows,totalRows=detail.totalRows;
    el['progress-text'].textContent=[detail.phase,detail.stage,detail.side??sample.side,Number.isInteger(step)?'step '+(step+1)+'/6':null,block!==undefined&&block!==null?'block '+block:null,rows!==undefined?'rows '+rows+(totalRows!==undefined?'/'+totalRows:''):null].filter(Boolean).join(' / ')||'処理中';
    if(Number.isInteger(step)&&step>=0&&step<6)el.progress.value=step/6;
   }});
   session=ownedSession;
   const observedCaps=await ownedSession.request('capabilities',{});
   if(actionId!==latestAction)return;caps=observedCaps;
   const sample=caps.executionDescriptor?.operations?.sample,defaults=sample?.normalInputs?.defaults;
   if(!defaults?.shapeRequest||!sample.supportedUISettings)throw failure('NORMAL_INPUTS_UNAVAILABLE','通常生成の入力契約が見つかりません。配布版を確認してください。');
   for(const key of ['width','height','frames'])el[key].value=String(defaults.shapeRequest.target[key]);
   el.threads.value=String(defaults.wasmThreads);
   const settings=sample.supportedUISettings;
   el['fixed-settings'].textContent=['sampler','scheduler','steps','shift','splitStep','cfg','noiseScale','augmentation','batch'].map(key=>key+' '+settings[key].value).join(' / ');
   el['technical'].textContent=json({protocolVersion:native.PROTOCOL_VERSION,buildId:native.BUILD_ID,executionDescriptor:caps.executionDescriptor,modelRuntime:caps.modelRuntime});
   modelSessionId=null;cleanupRequired=false;el.error.hidden=true;preview();status('File を選択してください。保存済み WKTENSOR はモデルなしで読めます。');
  }catch(error){ownedSession?.dispose();if(actionId===latestAction)showError(error);}
  finally{if(actionId===latestAction){initializing=false;render();}}
 }
 el['thread-note'].textContent=canFour?'この環境では 1 または 4 WASM threads を明示的に選べます。':'この環境では 1 WASM thread を使用します。4 は cross-origin isolation と SharedArrayBuffer が必要です。';
 el.load.addEventListener('click',()=>action('HIGH / LOW モデルを読み込んでいます。',async current=>{
  const files={HIGH:el['high-file'].files[0],LOW:el['low-file'].files[0]};
  const loaded=await session.request('load',{files,resource:{wasmThreads:Number(el.threads.value)}});
  if(!current())return;modelSessionId=loaded.modelSessionId;cleanupRequired=false;
  el['technical'].textContent=json({protocolVersion:native.PROTOCOL_VERSION,buildId:native.BUILD_ID,load:loaded});status('モデルを読み込みました。conditioning File と出力サイズを確認して生成できます。');
 }));
 el.run.addEventListener('click',()=>action('conditioning File を読んでいます。',async current=>{
  const {shapeRequest,shapePlan}=plan(),positiveFile=el['positive-file'].files[0],negativeFile=el['same-positive'].checked?positiveFile:el['negative-file'].files[0];
  if(!positiveFile||!negativeFile)throw failure('CONDITIONING_REQUIRED','positive と negative の File、または同じ positive を使う指定が必要です。');
  const positive=(await session.request('readTensor',{file:positiveFile})).tensor;
  const negative=negativeFile===positiveFile?positive:(await session.request('readTensor',{file:negativeFile})).tensor;
  if(!current())return;
  el['conditioning-summary'].textContent=json({positive:metadata(positive),negative:metadata(negative),samePositiveFile:negativeFile===positiveFile});
  const support=await session.request('checkSupport',{operation:'sample',shapeRequest,inputs:{positive:conditioningDescriptor(positive),negative:conditioningDescriptor(negative)}});
  el['technical'].textContent=json({protocolVersion:native.PROTOCOL_VERSION,buildId:native.BUILD_ID,shapePlan,support});
  if(!support.supported)throw failure('UNSUPPORTED_INPUT','指定した入力は実行できません。必要な変更はエラー詳細を確認してください。',{reasons:support.reasons});
  status('Diffusion を実行しています。初期 target と標準正規ノイズは実行側が作成します。','RUNNING');
  const result=await session.request('sample',{shapeRequest,positive,negative,modelSessionId});
  if(!current())return;publishResult(result.tensor,'sample',{execution:result.execution});el.progress.value=1;status('生成した raw sample を受け取りました。WKTENSOR として保存できます。','COMPLETE');
 }));
 el.read.addEventListener('click',()=>action('WKTENSOR File を読んでいます。',async current=>{
  const file=el['reuse-file'].files[0],result=await session.request('readTensor',{file});
  if(!current())return;publishResult(result.tensor,'file',{file:{name:file.name,byteLength:result.byteLength,sha256:result.sha256}});status('File の tensor を読み込みました。内容の意味を保って再保存できます。','COMPLETE');
 }));
 el.save.addEventListener('click',()=>action('WKTENSOR を作成しています。',async current=>{
  const tensor=output,origin=outputOrigin,result=await session.request('saveTensor',{tensor});if(!current())return;
  if(!(result.bytes instanceof Uint8Array))throw failure('INVALID_RESPONSE','保存用 bytes が返されませんでした。');
  revokeDownload();downloadUrl=URL.createObjectURL(new Blob([result.bytes],{type:'application/octet-stream'}));
  const link=doc.createElement('a');link.href=downloadUrl;link.download=resultFilename(tensor);doc.body.append(link);link.click();link.remove();
  el['saved-state'].textContent='ダウンロードを開始しました: '+link.download+' / '+result.byteLength+' bytes / SHA-256 '+result.sha256;
  status(origin==='sample'?'生成結果のダウンロードを開始しました。':'読戻した tensor のダウンロードを開始しました。','COMPLETE');
 }));
 el.cancel.addEventListener('click',async()=>{
  if(!session?.active||cancelRequested)return;cancelRequested=true;modelSessionId=null;cleanupRequired=false;status('対象の処理を取り消しています。終端応答を待っています。','CANCELLING');render();
  try{await session.cancel();}catch(error){showError(error);}finally{render();}
 });
 el.unload.addEventListener('click',()=>action('モデルを解放しています。',async current=>{
  const result=await session.request('unload',{});if(!current())return;modelSessionId=null;cleanupRequired=false;revokeDownload();el['technical'].textContent=json(result);status('モデルを解放しました。File を変更して再読込みできます。');
 }));
 el['inspect-status'].addEventListener('click',()=>action('モデルの状態を確認しています。',async current=>{
  const result=await session.request('modelStatus',{});if(!current())return;modelSessionId=result.loaded?result.modelSessionId:null;cleanupRequired=result.cleanupRequired===true;el['technical'].textContent=json(result);status(cleanupRequired?'モデルの解放を再試行してください。':'モデルの状態を確認しました。');
 }));
 el.dispose.addEventListener('click',()=>{if(busy)return;latestAction++;session?.dispose();modelSessionId=null;cleanupRequired=false;revokeDownload();status('管理を終了し、Worker を終了しました。再開すると同じ File を使えます。','DISPOSED');render();});
 el.restart.addEventListener('click',initialize);
 for(const key of ['high-file','low-file','positive-file','negative-file','same-positive','reuse-file'])el[key].addEventListener('change',render);
 for(const key of ['width','height','frames'])el[key].addEventListener('input',preview);
 function shutdown(){
  latestAction++;session?.dispose();busy=false;initializing=false;cancelRequested=false;modelSessionId=null;cleanupRequired=false;revokeDownload();
  status('管理を終了し、Worker を終了しました。再開すると同じ File を使えます。','DISPOSED');render();
 }
 globalThis.addEventListener?.('pagehide',shutdown);
 globalThis.addEventListener?.('pageshow',event=>{if(event.persisted)render();});
 render();void initialize();
 return Object.freeze({dispose:shutdown});
}

if(typeof document!=='undefined'&&document.getElementById('df-panel'))mountDiffusionPanel();

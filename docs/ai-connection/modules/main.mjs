import {createOperationalManagement} from '../../shared/ai-connection/operational-management.mjs';

const $=id=>document.getElementById(id);
const moduleIds=['text','vae','mean','diffusion'];
const moduleNames={text:'Text Encoder',vae:'VAE',mean:'Mean変換',diffusion:'Diffusion'};
const dirty=new Set(['text','vae','mean','diffusion']);
let controller=null,unsubscribe=null,busy=false,disposed=false,lastExecution=null,lastRoute=null,diffusionNeedsLoad=true,diffusionSelectionChanged=true,cancellation=null;
let revision=0;

function json(value){
 const seen=new WeakSet();
 return JSON.stringify(value,(_,item)=>{
  if(item instanceof Blob)return {type:item.type,bytes:item.size,...(item instanceof File?{name:item.name}:{} )};
  if(item instanceof Map)return {mapKeys:[...item.keys()]};
  if(ArrayBuffer.isView(item))return `[${item.constructor.name}: ${item.length??item.byteLength} values]`;
  if(item instanceof ArrayBuffer)return `[ArrayBuffer: ${item.byteLength} bytes]`;
  if(item&&typeof item==='object'){if(seen.has(item))return '[shared reference]';seen.add(item);}
  return item;
 },2)??'null';
}
function errorInfo(error){return {code:error?.code??error?.name??'ERROR',message:error?.message??String(error),...(error?.details?{details:error.details}:{}),...(error?.issues?{issues:error.issues}:{}),...(error?.reasons?{reasons:error.reasons}:{}),...(error?.response?{response:error.response}:{})};}
function fail(code,message){throw Object.assign(Error(message),{code});}
function status(message,state='READY'){$('status').textContent=message;$('status').dataset.state=state;}
function showError(error){const details=errorInfo(error);$('error-details').textContent=json(details);status(`${details.code}: ${details.message}`,'ERROR');}
function parse(id){try{return JSON.parse($(id).value);}catch(error){fail('INVALID_INPUT_JSON',`${id}: ${error.message}`);}}
function outputRef(id){const value=$(id+'-output').value.trim();if(!value)fail('OUTPUT_REF_REQUIRED','出力の参照名を入力してください。');return value;}
function state(){return controller?.inspect()??{};}
function stateName(value){return typeof value==='string'?value:value?.status??value?.state??'—';}
function download(value,name,type='application/octet-stream'){
 const blob=value instanceof Blob?value:new Blob([value],{type});
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function fileList(id){return Array.from($(id).files??[]);}
function fileSummary(files){return files.length?files.map(file=>`${file.webkitRelativePath||file.name} (${file.size.toLocaleString()} bytes)`).join('\n'):'未選択';}
function markDirty(id){dirty.add(id);revision++;if(id==='diffusion')diffusionSelectionChanged=true;render();}
function syncDiffusion(view=state()){
 const observation=view.modules?.diffusion?.observation;
 diffusionNeedsLoad=diffusionSelectionChanged||observation?.loaded!==true||observation?.reloadRequired===true||observation?.cleanupRequired===true;
 return observation;
}
function diffusionNotice({includeUnloaded=false}={}){
 const observation=syncDiffusion();
 if(observation?.cleanupRequired===true)return ' Diffusionは明示的なunloadで解放を確認してください。';
 if(observation?.reloadRequired===true||includeUnloaded&&observation&&diffusionNeedsLoad)return ' Diffusionの次の推論にはモデルの再loadが必要です。';
 return '';
}
function cancelledStatus(){
 if(cancellation?.error){showError(cancellation.error);return;}
 if(cancellation?.pending){status('対象の取消と元の実行の終端を待っています。','CANCELLING');return;}
 status('取消の終端を確認しました。'+diffusionNotice(),'CANCELLED');
}
function workspaceSettings(){
 return {fields:Object.fromEntries([...document.querySelectorAll('textarea,input[type=text],select')].filter(field=>!['reference-ref','recovery-module'].includes(field.id)).map(field=>[field.id,field.value])),routeSelections:Object.fromEntries([...document.querySelectorAll('section[aria-labelledby="route-heading"] input[type=checkbox]')].map(field=>[field.id,field.checked]))};
}
function restoreSettings(settings){
 for(const [id,value]of Object.entries(settings?.fields??{})){const field=$(id);if(field&&typeof value==='string'&&field.matches('textarea,input[type=text],select'))field.value=value;}
 for(const [id,value]of Object.entries(settings?.routeSelections??{})){const field=$(id);if(field?.matches('section[aria-labelledby="route-heading"] input[type=checkbox]'))field.checked=value===true;}
}

async function modelConfiguration(id){
 const selected=fileList(id+'-bundle');
 if(!selected.length)fail('MODEL_FOLDER_REQUIRED',`${moduleNames[id]}の実行用モデルフォルダを選んでください。`);
 const files=new Map();let root=null;
 for(const file of selected){
  const parts=(file.webkitRelativePath||file.name).replaceAll('\\','/').split('/');
  if(parts.some(part=>!part||part==='.'||part==='..'))fail('INVALID_MODEL_PATH','モデルFileの相対pathが不正です。');
  // webkitRelativePath includes exactly one selected-directory component.
  // Preserve every remaining segment; never flatten native manifest paths.
  if(file.webkitRelativePath){const current=parts.shift();if(root!==null&&root!==current)fail('MULTIPLE_MODEL_ROOTS','一つのモデルフォルダを選択してください。');root=current;}
  const path=parts.join('/');if(files.has(path))fail('DUPLICATE_MODEL_PATH',`モデルFileのpathが重複しています: ${path}`);files.set(path,file);
 }
 let manifestFile=$(id+'-manifest').files[0];
 if(!manifestFile){
  const manifests=[...files.keys()].filter(path=>path.split('/').at(-1)==='manifest.json');
  if(manifests.length!==1||manifests[0]!=='manifest.json')fail('MANIFEST_SELECTION_REQUIRED','実行用manifest JSONを選択してください。未選択の場合は、フォルダ直下に一つだけmanifest.jsonが必要です。');
  manifestFile=files.get('manifest.json');
 }
 const manifest=JSON.parse(await manifestFile.text());
 if(id==='text'&&$('text-source').files[0]){
  const binding=manifest?.embedding?.sourceFile;
  if(typeof binding!=='string'||!binding)fail('SOURCE_BINDING_REQUIRED','manifest.embedding.sourceFileがないため元UMT5 Fileを対応付けできません。');
  files.set(binding,$('text-source').files[0]);
 }
 return {manifest,files};
}
function textInput(){
 if($('text-tokens').value.trim())return parse('text-tokens');
 return {text:$('text-prompt').value};
}
function operationRequest(id){
 if(id==='text')return {moduleId:id,operation:'encode',input:textInput(),outputRef:outputRef(id)};
 return {moduleId:id,operation:$(id+'-operation').value,input:parse(id+'-input'),outputRef:outputRef(id)};
}
function requireConfigured(id,operation){
 syncDiffusion();
 if(dirty.has(id)||!state().modules?.[id]?.configured)fail('MODULE_CONFIGURATION_REQUIRED',`${moduleNames[id]}の設定を適用してください。`);
 if(id==='diffusion'&&diffusionNeedsLoad&&['predict','sample'].includes(operation))fail('MODEL_LOAD_REQUIRED','選択したHIGH・LOWモデルをloadしてください。');
}
async function configure(id){
 const config=['text','vae'].includes(id)?await modelConfiguration(id):{};
 await controller.configureModule(id,config);dirty.delete(id);
 if(id==='diffusion')diffusionSelectionChanged=true;
 status(`${moduleNames[id]}の設定を適用しました。`,'CONFIGURED');
}
async function execute(request){
 requireConfigured(request.moduleId,request.operation);
 lastExecution={kind:'module',request:structuredClone(request),revision};
 const result=await controller.execute(request);$('result-details').textContent=json(result);
 if(request.moduleId==='diffusion'&&request.operation==='load')diffusionSelectionChanged=false;
 syncDiffusion();
 status(`${moduleNames[request.moduleId]} / ${request.operation}: ${result.status??'実行完了'}`,result.status??'EXECUTION_COMPLETED');return result;
}
function validateRoute(route){
 if(!route||!Array.isArray(route.steps)||!route.steps.length)fail('ROUTE_STEPS_REQUIRED','経路には一つ以上のstepが必要です。');
 for(const step of route.steps){if(!moduleIds.includes(step.moduleId))fail('UNKNOWN_MODULE',`未対応のmoduleです: ${step.moduleId}`);requireConfigured(step.moduleId,step.operation);}
}
async function executeRoute(route){
 validateRoute(route);lastExecution={kind:'route',request:structuredClone(route),revision};lastRoute=null;
 const result=await controller.executeRoute(route);lastRoute=result;$('result-details').textContent=json(result);status(`経路: ${result.status??'実行完了'}`,result.status??'EXECUTION_COMPLETED');return result;
}
async function action(fn,{working=true}={}){
 if(!controller||disposed)return;
 if(working&&(busy||cancellation?.pending))return;
 if(working){busy=true;cancellation=null;$('error-details').textContent='なし';status('処理しています。','RUNNING');render();}
 try{return await fn();}catch(error){if(['INVOCATION_CANCELLED','CANCELLED'].includes(error?.code))cancelledStatus();else showError(error);}finally{if(working)busy=false;render();}
}
function renderModules(view){
 const body=$('module-list');body.replaceChildren();
 for(const id of moduleIds){
  const entry=view.modules?.[id],configured=entry?.configured===true&&!dirty.has(id),label=configured?'適用済み':dirty.has(id)?'未適用 / 変更あり':'未設定';
  const row=body.insertRow();row.dataset.moduleId=id;row.insertCell().textContent=moduleNames[id];row.insertCell().textContent=label;row.insertCell().textContent=stateName(entry?.state);
  $(id+'-state').textContent=`${label} · ${stateName(entry?.state)}${id==='diffusion'&&diffusionNeedsLoad?' · predict / sampleの前にloadが必要':''}`;
 }
}
function artifacts(view){return Array.isArray(view.artifacts)?view.artifacts:Object.entries(view.artifacts??{}).map(([ref,record])=>({ref,...record}));}
function renderOutputs(view){
 const records=artifacts(view),list=$('output-list');list.replaceChildren();
 const picker=$('reference-ref'),selected=picker.value;picker.replaceChildren();
 if(!records.length){const li=document.createElement('li');li.textContent='出力はまだありません。';list.append(li);const option=document.createElement('option');option.value='';option.textContent='まだありません';picker.append(option);}
 for(const record of records){
  const ref=record.ref??record.outputRef;if(!ref)continue;
  const option=document.createElement('option');option.value=ref;option.textContent=ref;picker.append(option);
  const li=document.createElement('li');li.dataset.artifactRef=ref;li.append(document.createTextNode(ref));
  const detail=document.createElement('span');detail.className='output-description';const tensor=record.descriptor?.tensor;detail.textContent=`${record.moduleId??'保存tensor'}${record.operation?' / '+record.operation:''}${tensor?' · '+(tensor.dtype??'')+' '+JSON.stringify(tensor.shape??[]):''}`;li.append(detail);
  if(tensor||record.descriptor?.kind==='tensor'){const button=document.createElement('button');button.type='button';button.textContent='native tensorを保存';button.disabled=busy||disposed;button.addEventListener('click',()=>action(async()=>{const data=await controller.saveTensor(ref);download(data,ref.replace(/[^a-zA-Z0-9_-]/g,'_')+'.wktensor');status(`${ref} をnative形式で保存しました。`,'SAVED');}));li.append(button);}list.append(li);
 }
 if([...picker.options].some(option=>option.value===selected))picker.value=selected;
}
function renderRoute(view){
 const route=lastRoute??view.lastRoute,steps=route?.steps??[];const body=$('step-list');body.replaceChildren();
 if(!steps.length){const row=body.insertRow();row.insertCell().colSpan=3;row.cells[0].textContent='まだ経路を実行していません。';return;}
 for(const step of steps){const row=body.insertRow();row.dataset.stepId=step.stepId??'';row.insertCell().textContent=step.stepId??'';row.insertCell().textContent=`${step.moduleId??''} / ${step.operation??step.response?.operation??''}`;row.insertCell().textContent=stateName(step.response??step);}
}
function render(event){
 const view=event?.state??state();disposed=view.disposed===true;syncDiffusion(view);
 $('state-details').textContent=json(view);renderModules(view);renderOutputs(view);renderRoute(view);
 const unavailable=!controller||disposed,locked=busy||cancellation?.pending===true;
 for(const input of document.querySelectorAll('input,textarea,select'))input.disabled=unavailable||locked;
 for(const button of document.querySelectorAll('button'))button.disabled=unavailable||locked;
 $('cancel').disabled=unavailable||cancellation?.pending===true||!view.activeTarget;
 $('retry').disabled=unavailable||locked||!lastExecution||lastExecution.revision!==revision;
 $('recover').disabled=unavailable||locked;
 $('dispose').disabled=unavailable||locked;
 $('insert-reference').disabled=unavailable||locked||!$('reference-ref').value;
 $('tensor-import').disabled=unavailable||locked||!$('tensor-file').files[0];
 for(const id of moduleIds){
  const ready=!dirty.has(id)&&view.modules?.[id]?.configured===true;
  $(id+'-query').disabled=unavailable||locked||!ready;
  $(id+'-run').disabled=unavailable||locked||!ready||(id==='diffusion'&&diffusionNeedsLoad&&['predict','sample'].includes($('diffusion-operation').value));
 }
 $('diffusion-load').disabled=unavailable||locked||dirty.has('diffusion')||!view.modules?.diffusion?.configured||!$('diffusion-high').files[0]||!$('diffusion-low').files[0];
 if(event?.kind==='progress'){
  const value=event.value??{},raw=value.progress??{},progress=raw.result??raw.progress??raw;
  const total=progress.total??progress.totalSteps??progress.steps,step=progress.step;
  const completed=progress.completed??(Number.isFinite(step)&&Number.isFinite(progress.steps)?step+1:step);
  const stage=progress.message??progress.phase??progress.stage??progress.state?.phase??'実行中';
  const side=progress.side?` / ${progress.side}`:'';
  const count=Number.isFinite(total)&&total>0&&Number.isFinite(completed)?` (${completed}/${total})`:'';
  if(!cancellation?.pending)status(`${moduleNames[value.moduleId]??value.moduleId??''}: ${stage}${side}${count}`,'RUNNING');
  if(Number.isFinite(total)&&total>0&&Number.isFinite(completed)){$('progress').max=total;$('progress').value=completed;}else $('progress').removeAttribute('value');
 }else if(!locked){$('progress').max=1;$('progress').value=0;}
}
function routeFromForms(){
 const steps=[];
 const add=(stepId,request)=>steps.push({stepId,...request});
 if($('route-text').checked)add('text-encode',operationRequest('text'));
 if($('route-vae-encode').checked)add('vae-encode',{moduleId:'vae',operation:'encode',input:parse('vae-input'),outputRef:outputRef('vae')});
 if($('route-mean').checked)add('mean-transform',operationRequest('mean'));
 if($('route-diffusion').checked)add('diffusion-model',operationRequest('diffusion'));
 if($('route-vae-decode').checked)add('vae-decode',{moduleId:'vae',operation:'decode',input:parse('route-decode-input'),outputRef:'decoded-output'});
 if(!steps.length)fail('ROUTE_STEPS_REQUIRED','経路に含めるmoduleを選んでください。');
 const externalRefs=new Set();const produced=new Set(steps.map(step=>step.outputRef));
 const visit=value=>{if(!value||typeof value!=='object')return;if(typeof value.$ref==='string'&&!produced.has(value.$ref))externalRefs.add(value.$ref);for(const child of Object.values(value))visit(child);};steps.forEach(step=>visit(step.input));
 $('route-json').value=json({steps,externalRefs:[...externalRefs],finalRefs:[steps.at(-1).outputRef]});revision++;status('選択した各moduleの入力から経路を作成しました。参照先とnative入力を確認してください。','ROUTE_EDITED');
}

for(const id of moduleIds){
 $(id+'-configure').addEventListener('click',()=>action(()=>configure(id)));
 $(id+'-query').addEventListener('click',()=>action(async()=>{const request=operationRequest(id);requireConfigured(id,request.operation);const result=await controller.query(request);$('result-details').textContent=json(result);status(`${moduleNames[id]}の能力照会: ${result.status??'完了'}`,result.status??'QUERIED');}));
 $(id+'-run').addEventListener('click',()=>action(()=>execute(operationRequest(id))));
}
for(const id of ['text','vae'])$(id+'-bundle').addEventListener('change',()=>{$(id+'-files').textContent=fileSummary(fileList(id+'-bundle'));markDirty(id);});
for(const id of ['text','vae'])$(id+'-manifest').addEventListener('change',()=>markDirty(id));
$('text-source').addEventListener('change',()=>markDirty('text'));
for(const id of ['diffusion-high','diffusion-low','diffusion-threads'])$(id).addEventListener('change',()=>{$('diffusion-files').textContent=`HIGH: ${fileSummary(fileList('diffusion-high'))}\nLOW: ${fileSummary(fileList('diffusion-low'))}`;diffusionSelectionChanged=true;revision++;render();});
$('diffusion-load').addEventListener('click',()=>action(async()=>{
 const wasmThreads=Number($('diffusion-threads').value);
 if(wasmThreads===4&&globalThis.crossOriginIsolated!==true)fail('CROSS_ORIGIN_ISOLATION_REQUIRED','4 threadsにはCOIが必要です。このページはCOI無効です。1 threadは明示的に選択できます。');
 await execute({moduleId:'diffusion',operation:'load',input:{files:{HIGH:$('diffusion-high').files[0],LOW:$('diffusion-low').files[0]},resource:{wasmThreads}},outputRef:'diffusion-load'});
}));
$('tensor-file').addEventListener('change',()=>render());
$('tensor-import').addEventListener('click',()=>action(async()=>{const file=$('tensor-file').files[0],ref=$('tensor-ref').value.trim();if(!file||!ref)fail('TENSOR_INPUT_REQUIRED','tensor Fileと参照名を指定してください。');await controller.importTensor(ref,file);revision++;$('tensor-status').textContent=`${file.name} を ${ref} として登録しました。`;status('tensorを登録しました。','IMPORTED');}));
$('insert-reference').addEventListener('click',()=>{const target=$($('reference-target').value),ref=$('reference-ref').value,path=$('reference-path').value,requirementId=$('reference-requirement').value.trim();if(!ref)return;const text=JSON.stringify({$ref:ref,...(path?{path}:{}),...(requirementId?{requirementId}:{})});target.setRangeText(text,target.selectionStart??0,target.selectionEnd??0,'end');target.focus();revision++;render();});
$('reference-ref').addEventListener('change',()=>render());
$('cancel').addEventListener('click',()=>action(async()=>{const target=state().activeTarget;if(!target||cancellation?.pending)return;cancellation={target,pending:true,error:null};cancelledStatus();render();try{await controller.cancel(target);}catch(error){cancellation.error=error;}finally{cancellation.pending=false;}cancelledStatus();},{working:false}));
$('retry').addEventListener('click',()=>action(async()=>{if(!lastExecution||lastExecution.revision!==revision)fail('RETRY_INPUT_CHANGED','入力変更後は各moduleまたは経路の実行を選んでください。');const saved=lastExecution;return saved.kind==='route'?executeRoute(saved.request):execute(saved.request);}));
$('recover').addEventListener('click',()=>action(async()=>{const moduleId=$('recovery-module').value||undefined;await controller.recover(moduleId);syncDiffusion();status(`${moduleId?moduleNames[moduleId]:'全module'}の復旧を実行しました。${!moduleId||moduleId==='diffusion'?diffusionNotice({includeUnloaded:true}):''}`,'RECOVERED');}));
$('dispose').addEventListener('click',()=>action(async()=>{await controller.dispose();status('全moduleを終了しました。再利用する場合はページを読み直してください。','DISPOSED');}));
$('route-from-forms').addEventListener('click',()=>action(async()=>routeFromForms()));
$('route-run').addEventListener('click',()=>action(()=>executeRoute(parse('route-json'))));
$('save-workspace').addEventListener('click',()=>action(async()=>{const bundle=await controller.saveWorkspace({workspaceSettings:workspaceSettings()});download(bundle?.bytes??bundle,'ai-modules-workspace.zip','application/zip');$('saved-state').textContent='現在の部分結果・入力欄・経路設定を保存しました。読戻しではtensorを復元し、モデルFileは再選択します。';status('workspace bundleを保存しました。','SAVED');}));
$('workspace-file').addEventListener('change',()=>action(async()=>{const file=$('workspace-file').files[0];if(!file)return;const restored=await controller.restoreWorkspace(file);restoreSettings(restored.workspaceSettings);for(const id of moduleIds)dirty.add(id);for(const id of ['text-manifest','text-bundle','text-source','vae-manifest','vae-bundle','diffusion-high','diffusion-low','tensor-file'])$(id).value='';for(const id of ['text','vae'])$(id+'-files').textContent='保存設定を読戻しました。元のmanifestとモデルフォルダを再選択してください。';$('diffusion-files').textContent='元のHIGH・LOWモデルFileを再選択してください。';diffusionSelectionChanged=true;lastExecution=null;lastRoute=null;revision++;$('result-details').textContent=json(restored);$('saved-state').textContent=`${file.name} の入力欄・経路設定とtensorを読戻しました。実行には元のモデルFileを再選択して設定を適用し、Diffusionをloadしてください。`;status('bundleを読戻しました。モデルFileを再選択してください。','RESTORED');}));
for(const element of document.querySelectorAll('textarea,input[type=text],select'))element.addEventListener('change',()=>{revision++;render();});

$('environment').textContent=`このページのCOI: ${globalThis.crossOriginIsolated===true?'有効（4 threadsを選択可能）':'無効（1 threadを選択可能）'}。threadsは自動で切り替えません。`;
try{controller=await createOperationalManagement();unsubscribe=controller.subscribe(render);render();status('使用するmoduleのモデルを選び、設定を適用してください。','READY_FOR_INPUT');}catch(error){showError(error);render();}
addEventListener('pagehide',()=>{unsubscribe?.();void controller?.dispose().catch(()=>{});},{once:true});

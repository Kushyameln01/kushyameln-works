import {createOperationalInferenceOwner} from '/shared/inference/operational-owner.mjs';
import * as textVae from '/manager/docs/shared/ai-connection/adapters/text-vae.mjs';
import * as artifacts from '/manager/docs/shared/ai-connection/adapters/artifacts.mjs';
import * as queue from '/manager/docs/shared/ai-connection/queue.mjs';
import * as workspace from '/manager/docs/shared/ai-connection/management-workspace.mjs';

const manager={...textVae,...artifacts,...queue,...workspace};
const $=id=>document.getElementById(id);
const controls=[...document.querySelectorAll('input,select,textarea,button')];
const modelCaps={text_encoder:null,vae:null};
const configured={text_encoder:false,vae:false};
const urls=new Set();
let owner=null,config=null,textManifest=null,vaeManifest=null,action=null;
let disposed=true,cancelling=false,generation=0,runPromise=null,runOutcome=null,ready;

function message(value,tone='normal'){
  $('status').textContent=value;
  $('status').dataset.tone=tone;
}
function failed(error){message(`${error?.code?`${error.code}: `:''}${error?.message??error}`,'error');}
function isCancelled(error){return error?.name==='AbortError'||/CANCEL|ABORT/i.test(error?.code??'')||/cancelled|canceled|aborted/i.test(error?.message??'');}
function busy(){return Boolean(action||cancelling||owner?.busy);}
function live(){return Boolean(owner&&!disposed);}
function recordId(record){return record?.artifactId??record?.descriptor?.artifactId;}
function selectedRecord(id){return live()&&id?owner.getRecord(id):null;}
function scalar(value){
  if(value===null||value===undefined)return '未指定';
  if(typeof value!=='object')return String(value);
  if(Array.isArray(value)||ArrayBuffer.isView(value)){
    const size=value.length;
    return `[${Array.from(value).slice(0,128).join(', ')}${size>128?`, … (${size}件)`:''}]`;
  }
  return Object.entries(value).filter(([key,v])=>key!=='data'&&typeof v!=='object').map(([key,v])=>`${key}: ${v}`).join(' / ')||'未指定';
}
function rows(node,entries){
  node.replaceChildren();
  for(const [label,value] of entries){
    if(value===undefined||value===null)continue;
    const dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=label;dd.textContent=typeof value==='string'?value:scalar(value);node.append(dt,dd);
  }
}
function metadata(record){
  const d=record?.descriptor??{};
  return record?.tensor??d.native?.metadata??d.tensor??{};
}
function recordLabel(record){
  const t=metadata(record),d=record?.descriptor??{};
  return `${record.name??t.meaning??d.tensor?.nativeMeaning??'tensor'} · [${(t.shape??d.tensor?.shape??[]).join(', ')}] · ${recordId(record)}`;
}
function renderRecord(node,record){
  if(!record){rows(node,[['状態','テンソルを選んでください']]);return;}
  const t=metadata(record),d=record.descriptor??{},lc=t.latentContract,ctx=t.context,f=t.frameProcessing;
  const entries=[['名前',record.name],['意味',t.meaning??d.tensor?.nativeMeaning],['shape',scalar(t.shape??d.tensor?.shape)],['dtype / layout',`${t.dtype??d.tensor?.dtype??'未指定'} / ${t.layout??d.tensor?.axes?.join('')??'未指定'}`],['attention mask',t.attentionMask!==undefined?scalar(t.attentionMask):'なし'],['normalization',t.normalization??d.semantics?.normalization??'未指定'],['model',t.modelSha256],['tokenizer',t.tokenizerSha256]];
  if(lc)entries.push(['latent表現',lc.representation],['latent空間',lc.space],['decoder model',lc.vaeModelSha256],['producer model',lc.producerModelSha256s?.join('\n')],['latent normalization',scalar(lc.normalization)]);
  if(ctx)entries.push(['元入力',ctx.inputId],['入力SHA-256',ctx.inputSha256],['slot',ctx.slotId],['元フレーム',scalar(ctx.sourceFrameIndices)],['時刻（秒）',ctx.sourceFrameTimesSeconds!==undefined?scalar(ctx.sourceFrameTimesSeconds):undefined]);
  if(f)entries.push(['フレーム処理',scalar(f)]);
  entries.push(['artifact',recordId(record)]);
  rows(node,entries);
}
function renderCapabilities(module,caps){
  const text=module==='text_encoder';
  const entries=[['設定',caps?.configured?'設定済み（実行は別操作）':'未設定'],['操作',caps?.operations?.join(' / ')]];
  if(text)entries.push(['出力shape',scalar(caps?.output?.shape)],['意味',caps?.output?.meaning],['normalization',caps?.output?.normalization],['graphBindings',String(caps?.graphBindings?.length??0)]);
  else for(const op of ['encode','decode'])entries.push([`${op} 入力`,scalar(caps?.[op]?.input?.shape)],[`${op} 出力`,scalar(caps?.[op]?.output?.shape)]);
  rows($(text?'text-capabilities':'vae-capabilities'),entries);
}
function refreshRecords(preferredId){
  const records=live()?owner.records():[];
  for(const [id,empty] of [['input-artifact','テンソルを読み込んでください'],['result-artifact','結果はありません']]){
    const select=$(id),previous=preferredId??select.value;
    select.replaceChildren(new Option(records.length?'テンソルを選んでください':empty,''));
    for(const record of records)select.add(new Option(recordLabel(record),recordId(record)));
    if(records.some(r=>recordId(r)===previous))select.value=previous;
    else if(records.length)select.value=recordId(records[records.length-1]);
  }
  $('record-count').textContent=`${records.length}件`;
  renderRecord($('input-summary'),selectedRecord($('input-artifact').value));
  renderRecord($('result-summary'),selectedRecord($('result-artifact').value));
  updateControls();
}
function updateControls(){
  const locked=busy(),active=live(),module=$('module').value,text=module==='text_encoder';
  for(const control of controls)control.disabled=locked||!active;
  $('cancel').disabled=action!=='run'||cancelling||!owner?.busy;
  $('reinitialize').disabled=locked||!disposed;
  $('configure-text').disabled=locked||!active||!textManifest;
  $('configure-vae').disabled=locked||!active||!vaeManifest;
  $('use-host-vae').disabled=locked||!active||!config?.vaeManifestUrl;
  $('operation').disabled=locked||!active||text;
  const decodeOption=$('operation').querySelector('[value="decode"]');decodeOption.disabled=text;
  if(text)$('operation').value='encode';
  $('text-inputs').hidden=!text;$('vae-inputs').hidden=text;
  $('plain-text-input').hidden=$('text-mode').value!=='plain-text';
  $('token-ids-input').hidden=$('text-mode').value!=='token-ids';
  $('run').disabled=locked||!active||!configured[module]||(!text&&!$('input-artifact').value);
  $('input-artifact').disabled=locked||!active||!$('input-artifact').options.length||!owner?.records().length;
  $('result-artifact').disabled=locked||!active||!$('result-artifact').value;
  for(const id of ['use-result','download-tensor','save-package'])$(id).disabled=locked||!active||!$('result-artifact').value;
  $('clear-records').disabled=locked||!active||!owner?.records().length;
  $('load-fixture').disabled=locked||!active||!$('fixture-select').value;
  $('dispose').disabled=locked||!active;
}
function clearProgress(){$('progress').hidden=true;$('progress').removeAttribute('value');}
function onState(state,currentGeneration){
  if(currentGeneration!==generation||action!=='run')return;
  updateControls();
  if(cancelling)return;
  if(state.status==='running'){
    const p=state.progress??{};
    const stage=p.phase??p.stage??'実行中';
    const counters=Number.isFinite(p.completed)&&Number.isFinite(p.total)?[p.completed,p.total]:[p.chunkIndex,p.chunkCount];
    const [completed,total]=counters;
    const frame=Number.isFinite(p.featureFrame)&&Number.isFinite(p.featureFrames)?` · frame ${p.featureFrame} / ${p.featureFrames}`:'';
    if(Number.isFinite(completed)&&Number.isFinite(total)&&total>0){
      $('progress').hidden=false;$('progress').max=total;$('progress').value=completed;
      message(`${stage} · ${completed} / ${total}${frame}`);
    }else message(stage);
  }
}
async function fetchJSON(url){
  const response=await fetch(url);if(!response.ok)throw Error(`読み込めませんでした (${response.status})`);
  return response.json();
}
async function perform(name,task){
  if(busy()||!live())return;
  action=name;updateControls();
  try{return await task();}catch(error){failed(error);}finally{action=null;updateControls();}
}
function revokeDownloads(){for(const url of urls)URL.revokeObjectURL(url);urls.clear();}
function download(bytes,name,type){
  const url=URL.createObjectURL(new Blob([bytes],{type}));urls.add(url);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},1000);
}
function filename(record){
  const t=metadata(record);
  return `${t.meaning??'tensor'}-${(t.shape??[]).join('x')}`.replace(/[^a-zA-Z0-9._-]/g,'-');
}
async function initialize(){
  if(action)return;
  action='initialize';message('起動しています');updateControls();
  try{
    config??=await fetchJSON('/candidate-config.json');
    textManifest??=await fetchJSON(config.textManifestUrl);
    const currentGeneration=++generation;
    owner=await createOperationalInferenceOwner({manager,sourceRef:config.sourceRef,onState:state=>onState(state,currentGeneration)});
    disposed=false;
    for(const module of ['text_encoder','vae']){configured[module]=false;modelCaps[module]=null;renderCapabilities(module,null);}
    $('use-host-vae').hidden=!config.vaeManifestUrl;
    $('fixture-inputs').hidden=!config.fixtures?.length;
    $('fixture-select').replaceChildren(new Option('入力を選んでください',''));
    for(const fixture of config.fixtures??[])$('fixture-select').add(new Option(fixture.label??fixture.id,fixture.id));
    refreshRecords();message('モデル資材を選んで設定してください');
    return owner;
  }catch(error){failed(error);throw error;}finally{action=null;updateControls();}
}
function invalidateModel(module){
  configured[module]=false;modelCaps[module]=null;
  rows($(module==='text_encoder'?'text-capabilities':'vae-capabilities'),[]);
  $(module==='text_encoder'?'text-model-info':'vae-model-info').textContent='資材を変更しました。設定し直してください';
  updateControls();
}
for(const id of ['text-assets','text-source'])$(id).addEventListener('change',()=>invalidateModel('text_encoder'));
$('vae-assets').addEventListener('change',()=>invalidateModel('vae'));
$('vae-manifest').addEventListener('change',()=>perform('manifest',async()=>{
  vaeManifest=null;invalidateModel('vae');
  const file=$('vae-manifest').files[0];if(!file)return;
  vaeManifest=JSON.parse(await file.text());$('vae-manifest-info').textContent=file.name;
  message('VAE資材を選んで設定してください');
}));
$('use-host-vae').addEventListener('click',()=>perform('manifest',async()=>{
  vaeManifest=null;invalidateModel('vae');
  vaeManifest=await fetchJSON(config.vaeManifestUrl);$('vae-manifest').value='';
  $('vae-manifest-info').textContent='用意されたmanifestを選択中';message('VAE資材を選んで設定してください');
}));
$('configure-text').addEventListener('click',()=>perform('configure',async()=>{
  invalidateModel('text_encoder');
  message('Textを設定しています');
  const files=[...$('text-assets').files,...$('text-source').files];
  await owner.configureText({manifest:textManifest,files});
  const caps=await owner.capabilities('text_encoder');modelCaps.text_encoder=caps;configured.text_encoder=Boolean(caps.configured);
  renderCapabilities('text_encoder',caps);$('text-model-info').textContent=`選択資材 ${files.length}件`;
  message('Textを設定しました。入力を選んで実行してください');
}));
$('configure-vae').addEventListener('click',()=>perform('configure',async()=>{
  invalidateModel('vae');
  message('VAEを設定しています');
  const files=[...$('vae-assets').files];await owner.configureVae({manifest:vaeManifest,files});
  const caps=await owner.capabilities('vae');modelCaps.vae=caps;configured.vae=Boolean(caps.configured);
  renderCapabilities('vae',caps);$('vae-model-info').textContent=`選択資材 ${files.length}件`;
  message('VAEを設定しました。入力を選んで実行してください');
}));
for(const id of ['module','operation','text-mode'])$(id).addEventListener('change',updateControls);
$('input-artifact').addEventListener('change',()=>{renderRecord($('input-summary'),selectedRecord($('input-artifact').value));updateControls();});
$('result-artifact').addEventListener('change',()=>{renderRecord($('result-summary'),selectedRecord($('result-artifact').value));updateControls();});
$('fixture-select').addEventListener('change',updateControls);
$('tensor-file').addEventListener('change',()=>perform('import',async()=>{
  const file=$('tensor-file').files[0];if(!file)return;
  message('テンソルを読み込んでいます');
  const record=await owner.importTensor(new Uint8Array(await file.arrayBuffer()),{name:file.name});
  refreshRecords(recordId(record));message('テンソルを読み込みました');$('tensor-file').value='';
}));
$('package-file').addEventListener('change',()=>perform('read',async()=>{
  const file=$('package-file').files[0];if(!file)return;
  message('管理ZIPを読み込んでいます');
  await owner.readPackage(new Uint8Array(await file.arrayBuffer()));revokeDownloads();refreshRecords();
  message('管理ZIPを読み込み、履歴を置き換えました。テンソルを入力に使えます');$('package-file').value='';
}));
$('load-fixture').addEventListener('click',()=>perform('import',async()=>{
  const fixture=config.fixtures.find(item=>item.id===$('fixture-select').value);if(!fixture)return;
  message('用意された入力を読み込んでいます');
  const response=await fetch(fixture.url);if(!response.ok)throw Error(`入力を読み込めませんでした (${response.status})`);
  const record=await owner.importTensor(new Uint8Array(await response.arrayBuffer()),{name:fixture.label??fixture.id});
  refreshRecords(recordId(record));message('入力テンソルを読み込みました');
}));
$('run').addEventListener('click',()=>{
  if(busy()||!live())return;
  action='run';runOutcome=null;clearProgress();message('実行を準備しています');updateControls();
  runPromise=(async()=>{
    try{
      const module=$('module').value,operation=module==='text_encoder'?'encode':$('operation').value;
      const request={module,operation};let input;
      if(module==='text_encoder'){
        if($('text-mode').value==='plain-text')input={text:$('prompt').value};
        else{const tokens=JSON.parse($('token-input').value);input={tokenIds:tokens.tokenIds,attentionMask:tokens.attentionMask};}
        request.input=input;
      }else{
        request.inputArtifactId=$('input-artifact').value;
        input=selectedRecord(request.inputArtifactId)?.tensor;
      }
      const caps=await owner.capabilities(module,{operation,input});
      if(caps.support?.supported===false)throw Object.assign(Error(caps.support.reason),{code:caps.support.code});
      const result=await owner.execute(request);
      runOutcome={status:'completed'};
      refreshRecords(recordId(result.record));
      if(!cancelling)message('実行が完了しました。結果を保存・再利用できます');
    }catch(error){
      runOutcome={status:isCancelled(error)?'cancelled':'failed',error};
      if(!cancelling){if(runOutcome.status==='cancelled')message('実行を取り消しました');else failed(error);}
    }
    finally{action=null;clearProgress();updateControls();}
  })();
});
$('cancel').addEventListener('click',async()=>{
  if(action!=='run'||cancelling)return;
  cancelling=true;message('取消中です。元の実行の終了を待っています');updateControls();
  try{
    await owner.cancel();await runPromise;
    if(runOutcome?.status==='completed')message('実行は完了しています。結果を保存・再利用できます');
    else if(runOutcome?.status==='cancelled')message('実行を取り消しました。再実行できます');
    else if(runOutcome?.error)failed(runOutcome.error);
    else message('実行は終了しています');
  }
  catch(error){await runPromise;failed(error);}
  finally{cancelling=false;clearProgress();updateControls();}
});
$('use-result').addEventListener('click',()=>{
  $('input-artifact').value=$('result-artifact').value;$('module').value='vae';
  renderRecord($('input-summary'),selectedRecord($('input-artifact').value));updateControls();message('選択したテンソルをVAE入力にしました。操作を選んでください');
});
$('download-tensor').addEventListener('click',()=>perform('save',async()=>{
  const id=$('result-artifact').value,record=selectedRecord(id),bytes=await owner.tensorBytes(id);
  download(bytes,`${filename(record)}.wktensor`,'application/octet-stream');message('選択したテンソルを保存しました');
}));
$('save-package').addEventListener('click',()=>perform('save',async()=>{
  const id=$('result-artifact').value,record=selectedRecord(id);message('管理ZIPを作成しています');
  const result=await owner.save({artifactIds:[id]});download(result.bytes,`${filename(record)}-management.zip`,'application/zip');
  message('選択した結果と必要な元入力を管理ZIPに保存しました');
}));
$('clear-records').addEventListener('click',()=>perform('clear',async()=>{
  await owner.clearRecords();revokeDownloads();refreshRecords();message('履歴を消しました');
}));
$('dispose').addEventListener('click',()=>perform('dispose',async()=>{
  await owner.dispose();disposed=true;generation++;revokeDownloads();vaeManifest=null;
  for(const module of ['text_encoder','vae']){configured[module]=false;modelCaps[module]=null;renderCapabilities(module,null);}
  for(const id of ['text-assets','text-source','vae-manifest','vae-assets','tensor-file','package-file'])$(id).value='';
  $('text-model-info').textContent='未設定';$('vae-model-info').textContent='未設定';$('vae-manifest-info').textContent='manifestを選んでください';
  refreshRecords();message('資源を解放しました。再初期化すると続けられます');
}));
$('reinitialize').addEventListener('click',()=>{ready=initialize();ready.catch(()=>{});});
window.addEventListener('pagehide',()=>{generation++;revokeDownloads();if(live())void Promise.resolve(owner.dispose()).catch(()=>{});});
ready=initialize();
window.ownerCandidate=Object.freeze({get owner(){return owner;},get ready(){return ready;}});
ready.catch(()=>{});

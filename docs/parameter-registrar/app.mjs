import {createParameterRegistrar} from '../shared/parameter-registrar/client.mjs';

const byId=id=>document.getElementById(id);
const form=byId('registrar'),fileInput=byId('package-file'),collect=byId('collect');
const cancel=byId('cancel'),generate=byId('generate'),status=byId('status');
const outputName=byId('output-name'),defaultValue=byId('default-value');
const saved=byId('saved'),networkSynced=byId('network-synced');
const collection=byId('collection'),parameterCount=byId('parameter-count');
const parameterList=byId('parameter-list'),result=byId('result');
const summary=byId('summary'),download=byId('download');
let registrar=null,revision=0,busy=false,parameters=null,downloadURL=null;

function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
function clearDownload(){
  if(downloadURL)URL.revokeObjectURL(downloadURL);
  downloadURL=null;
  download.removeAttribute('href');download.removeAttribute('download');
  result.hidden=true;summary.textContent='';
}
function updateControls(){
  collect.disabled=busy||!fileInput.files?.length;
  generate.disabled=busy||!parameters?.length;
  cancel.hidden=!busy;
  form.setAttribute('aria-busy',String(busy));
}
function invalidate(){
  ++revision;
  registrar?.cancel();
  busy=false;clearDownload();updateControls();
}
function clearCollection(){
  parameters=null;parameterList.replaceChildren();parameterCount.textContent='';
  collection.hidden=true;byId('names').open=false;updateControls();
}
function client(){return registrar??=createParameterRegistrar();}
function errorMessage(error,fallback){
  return error instanceof Error&&error.message?`${fallback} ${error.message}`:fallback;
}
function progressText(progress){
  if(typeof progress==='string')return progress;
  if(!progress||typeof progress!=='object')return 'パラメータ名を抽出しています…';
  const phases={reading:'パッケージを読み取っています',collecting:'パラメータ名を抽出しています',complete:'抽出が完了しました'};
  const text=phases[progress.phase]??'パラメータ名を抽出しています';
  return Number.isFinite(progress.completed)&&Number.isFinite(progress.total)
    ?`${text}… ${progress.completed} / ${progress.total}`:`${text}…`;
}

fileInput.addEventListener('change',()=>{
  invalidate();clearCollection();
  message(fileInput.files?.length?'「パラメータ名を抽出」を押してください。':'unitypackageを選択してください。');
});
for(const input of [outputName,defaultValue,saved,networkSynced]){
  input.addEventListener('input',()=>{
    const wasBusy=busy;
    invalidate();input.removeAttribute('aria-invalid');
    message(parameters?.length?'設定を変更しました。この設定で生成してください。':wasBusy?'処理を取り消しました。パラメータ名を抽出してください。':'unitypackageを選択して、パラメータ名を抽出してください。');
  });
}
cancel.addEventListener('click',()=>{invalidate();message('処理を取り消しました。');});

collect.addEventListener('click',async()=>{
  invalidate();clearCollection();
  const file=fileInput.files?.[0];
  if(!file){message('unitypackageを選択してください。',true);return;}
  const current=revision;
  busy=true;updateControls();message('ファイルを読み込んでいます…');
  try{
    if(file.size>128*1024*1024)throw new Error('入力は128 MiB以内のUnityPackageを指定してください。');
    let bytes;
    try{bytes=new Uint8Array(await file.arrayBuffer());}
    catch(error){throw new Error(errorMessage(error,'ファイルを読み込めませんでした。選択し直してお試しください。'));}
    if(current!==revision)return;
    const data=await client().collect(bytes,{inputRevision:current,onProgress:progress=>{
      if(current===revision)message(progressText(progress));
    }});
    if(current!==revision)return;
    parameters=data.parameters;
    const fragment=document.createDocumentFragment();
    for(const parameter of parameters){const item=document.createElement('li');item.textContent=parameter.name;fragment.append(item);}
    parameterList.replaceChildren(fragment);
    parameterCount.textContent=`${parameters.length}個のパラメータ ／ Clip ${data.clipCount}個・BlendTree ${data.blendTreeCount}個`;
    collection.hidden=false;
    message(parameters.length?'抽出が完了しました。共通設定を確認して生成してください。':'登録対象のパラメータ名は見つかりませんでした。別のunitypackageを選択してください。');
  }catch(error){
    if(current===revision){clearCollection();message(errorMessage(error,'抽出できませんでした。入力ファイルを確認してください。'),true);}
  }finally{
    if(current===revision){busy=false;updateControls();}
  }
});

form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||!parameters?.length)return;
  invalidate();
  outputName.removeAttribute('aria-invalid');defaultValue.removeAttribute('aria-invalid');
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(outputName.value)){
    outputName.setAttribute('aria-invalid','true');message('出力名を半角英数字・_・-の1〜64文字で入力してください。',true);outputName.focus();return;
  }
  const value=defaultValue.valueAsNumber;
  if(!Number.isFinite(value)||value < -1||value > 1){
    defaultValue.setAttribute('aria-invalid','true');message('初期値は-1〜1の数値を入力してください。',true);defaultValue.focus();return;
  }
  const settings={name:outputName.value,defaultValue:value,saved:saved.checked,networkSynced:networkSynced.checked};
  const current=revision;
  busy=true;updateControls();message('ControllerとExpressionParametersを生成しています…');
  try{
    const data=await client().generate(parameters,settings,{inputRevision:current});
    if(current!==revision)return;
    downloadURL=URL.createObjectURL(new Blob([data.archive],{type:'application/octet-stream'}));
    download.href=downloadURL;download.download=data.fileName;
    summary.textContent=`${data.parameterCount}個のパラメータ ／ 同期コスト ${data.bitCost} bit ／ Controller・ExpressionParameters`;
    result.hidden=false;message('生成が完了しました。unitypackageをダウンロードできます。');
  }catch(error){
    if(current===revision){clearDownload();message(errorMessage(error,'生成できませんでした。設定を確認して、もう一度お試しください。'),true);}
  }finally{
    if(current===revision){busy=false;updateControls();}
  }
});

window.addEventListener('pagehide',()=>{
  invalidate();registrar?.dispose();registrar=null;updateControls();
});
updateControls();

import {createAnimatorIntegrator} from '../shared/animator-integrator/client.mjs';

const el=id=>document.getElementById(id);
const ui=Object.fromEntries(['source-files','file-summary','load','integrator','selection','controller-list','expression-list','mask','binary-tree','smooth-tree','output-name','playable','vrcft5-range-sync','generate','cancel','status','issues','issue-list','result','result-summary','download','report-download','report-view','layer-conflicts','layer-name-fields'].map(id=>[id,el(id)]));
let client=null,revision=0,sourceRevision=null,busy=false,catalog=null,controllers=[],selectedControllers=new Set(),selectedExpressions=new Set(),layerNames={},urls=[];
function session(){return client??=createAnimatorIntegrator();}
function message(value,error=false){ui.status.textContent=value;ui.status.dataset.error=String(error);}
function clearOutput(){for(const url of urls)URL.revokeObjectURL(url);urls=[];ui.result.hidden=true;ui.download.removeAttribute('href');ui['report-download'].removeAttribute('href');ui['report-view'].textContent='';}
function clearIssues(){ui.issues.hidden=true;ui['issue-list'].replaceChildren();}
function showError(error){const list=error?.issues??[{message:error?.message||String(error)}];ui['issue-list'].replaceChildren();for(const issue of list){const li=document.createElement('li');li.textContent=issue.message||String(issue);ui['issue-list'].append(li);}ui.issues.hidden=false;message(error?.name==='AbortError'?'処理を取り消しました。':'生成できませんでした。表示された項目を確認してください。',true);}
function controls(){ui.load.disabled=busy||!ui['source-files'].files?.length;ui.selection.disabled=busy;ui.generate.disabled=busy||!catalog;ui.cancel.hidden=!busy;ui.integrator.setAttribute('aria-busy',String(busy));}
function invalidate(){++revision;clearOutput();clearIssues();if(busy){client?.cancel();busy=false;catalog=null;ui.integrator.hidden=true;}controls();}
function inputChanged(){invalidate();message('参照・設定を変更しました。この設定で生成してください。');}
function assetLabel(asset){return (asset.name||asset.path||asset.id)+(asset.path?' — '+asset.path:'');}
function fillSelect(select,items,suggest){const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='参照を選択';select.replaceChildren(placeholder);for(const asset of items){const option=document.createElement('option');option.value=asset.id;option.textContent=assetLabel(asset);select.append(option);}const found=items.filter(a=>a.name===suggest);if(found.length===1)select.value=found[0].id;else if(items.length===1&&!suggest)select.value=items[0].id;}
function renderLayers(){
  const entries=controllers.filter(c=>selectedControllers.has(c.id)).flatMap(c=>(c.layers??[]).map(l=>({key:c.id+':'+l.index,name:l.name,label:(c.name||c.path)+' / '+l.name})));
  const counts=new Map();for(const entry of entries)counts.set(entry.name,(counts.get(entry.name)||0)+1);
  const conflicts=entries.filter(e=>counts.get(e.name)>1||['Root_BinaryParameter','Root_Smooth_Parameter'].includes(e.name));
  ui['layer-name-fields'].replaceChildren();ui['layer-conflicts'].hidden=!conflicts.length;
  for(const entry of conflicts){const label=document.createElement('label');label.textContent=entry.label;const input=document.createElement('input');input.value=layerNames[entry.key]??entry.name;input.dataset.layerKey=entry.key;input.addEventListener('input',()=>{layerNames[entry.key]=input.value;inputChanged();});label.append(input);ui['layer-name-fields'].append(label);}
}
function renderControllers(){
  ui['controller-list'].replaceChildren();
  for(const [index,asset] of controllers.entries()){
    const li=document.createElement('li'),label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span'),name=document.createElement('span'),path=document.createElement('span');
    check.type='checkbox';check.value=asset.id;check.checked=selectedControllers.has(asset.id);name.className='asset-name';name.textContent=asset.name||asset.id;path.className='small';path.textContent=(asset.path||'')+' / '+(asset.layers?.length??'?')+' Layer';text.className='asset-text';text.append(name,path);label.append(check,text);li.append(label);
    check.addEventListener('change',()=>{check.checked?selectedControllers.add(asset.id):selectedControllers.delete(asset.id);inputChanged();renderLayers();});
    const actions=document.createElement('div');actions.className='order-actions';
    for(const [step,title] of [[-1,'上へ'],[1,'下へ']]){const button=document.createElement('button');button.type='button';button.textContent=title;button.disabled=index+step<0||index+step>=controllers.length;button.setAttribute('aria-label',(asset.name||'Controller')+'を'+title);button.addEventListener('click',()=>{[controllers[index],controllers[index+step]]=[controllers[index+step],controllers[index]];inputChanged();renderControllers();renderLayers();});actions.append(button);}
    li.append(actions);ui['controller-list'].append(li);
  }
  if(!controllers.length)ui['controller-list'].textContent='Controllerが見つかりません。';
}
function renderExpressions(){ui['expression-list'].replaceChildren();for(const asset of catalog.expressions??[]){const li=document.createElement('li'),label=document.createElement('label'),check=document.createElement('input'),span=document.createElement('span');check.type='checkbox';check.value=asset.id;check.checked=selectedExpressions.has(asset.id);span.textContent=assetLabel(asset);label.append(check,span);li.append(label);check.addEventListener('change',()=>{check.checked?selectedExpressions.add(asset.id):selectedExpressions.delete(asset.id);inputChanged();});ui['expression-list'].append(li);}if(!catalog.expressions?.length)ui['expression-list'].textContent='ExpressionParametersが見つかりません。';}
ui['source-files'].addEventListener('change',()=>{invalidate();catalog=null;ui.integrator.hidden=true;const files=[...ui['source-files'].files];ui['file-summary'].textContent=files.length?files.map(f=>f.name).join('、'):'素材を選択してください。';message(files.length?'「素材を読み込む」を押してください。':'素材を選択してください。');controls();});
ui.load.addEventListener('click',async()=>{
  invalidate();catalog=null;ui.integrator.hidden=true;const current=revision;busy=true;controls();message('素材を読み込んでいます…');
  try{const sources=await Promise.all([...ui['source-files'].files].map(async file=>({name:file.name,bytes:new Uint8Array(await file.arrayBuffer())})));if(current!==revision)return;const data=await session().importSources(sources,{inputRevision:current});if(current!==revision)return;sourceRevision=current;catalog=data.catalog;controllers=[...(catalog.controllers??[])];selectedControllers=new Set(controllers.length===1?[controllers[0].id]:[]);selectedExpressions=new Set(catalog.expressions?.length===1?[catalog.expressions[0].id]:[]);layerNames={};renderControllers();renderExpressions();renderLayers();fillSelect(ui.mask,catalog.masks??[]);fillSelect(ui['binary-tree'],catalog.blendTrees??[],'Root_BinaryParameter');fillSelect(ui['smooth-tree'],catalog.blendTrees??[],'Root_Smooth_Parameter');ui.integrator.hidden=false;message('素材を読み込みました。統合する参照を指定してください。');}
  catch(error){if(current===revision)showError(error);}
  finally{if(current===revision){busy=false;controls();}}
});
for(const field of [ui.mask,ui['binary-tree'],ui['smooth-tree'],ui['output-name'],ui.playable,ui['vrcft5-range-sync']])field.addEventListener(field===ui['output-name']?'input':'change',inputChanged);
ui.cancel.addEventListener('click',()=>{invalidate();message('処理を取り消しました。「素材を読み込む」から再開できます。');});
ui.integrator.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!catalog)return;invalidate();const current=revision;
  const request={schemaVersion:1,name:ui['output-name'].value.trim(),controllerIds:controllers.filter(c=>selectedControllers.has(c.id)).map(c=>c.id),expressionIds:[...selectedExpressions],maskId:ui.mask.value,binaryTreeId:ui['binary-tree'].value,smoothTreeId:ui['smooth-tree'].value,playable:ui.playable.value,writeDefaults:true,vrcft5RangeSync:ui['vrcft5-range-sync'].checked,layerNames:(()=>{const activeKeys=new Set(controllers.filter(c=>selectedControllers.has(c.id)).flatMap(c=>(c.layers??[]).map(l=>c.id+':'+l.index)));return Object.fromEntries(Object.entries(layerNames).filter(([key])=>activeKeys.has(key)));})()};
  if(!request.controllerIds.length||!request.expressionIds.length||!request.maskId||!request.binaryTreeId||!request.smoothTreeId){showError(new Error('Controller、ExpressionParameters、AvatarMask、Binary・Smoothの参照をそれぞれ指定してください。'));return;}
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(request.name)){showError(new Error('出力名は半角英数字で始まる英数字・_・-の1〜64文字にしてください。'));ui['output-name'].focus();return;}
  busy=true;controls();message('Controller・ExpressionParametersを統合しています…');
  try{const data=await session().generate(request,{inputRevision:sourceRevision});if(current!==revision)return;const report=JSON.stringify(data.report,null,2);urls=[URL.createObjectURL(new Blob([data.archive],{type:'application/octet-stream'})),URL.createObjectURL(new Blob([report],{type:'application/json'}))];ui.download.href=urls[0];ui.download.download=request.name+'.unitypackage';ui['report-download'].href=urls[1];ui['report-download'].download=request.name+'-report.json';const count=data.report?.composition?.layerMapping?.length;ui['result-summary'].textContent=(count!==undefined?count+' Layer ／ ':'')+data.assetCount+' Asset ／ 全Layer Weight 1・共通Mask';ui['report-view'].textContent=report;ui.result.hidden=false;message('統合が完了しました。Unitypackageと検証記録を保存できます。');}
  catch(error){if(current===revision)showError(error);}
  finally{if(current===revision){busy=false;controls();}}
});
window.addEventListener('pagehide',()=>{client?.dispose();client=null;clearOutput();});
controls();

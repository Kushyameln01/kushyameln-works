const $=id=>document.getElementById(id);
const own=(map,key)=>map&&Object.prototype.hasOwnProperty.call(map,key)?map[key]:undefined;
const put=(map,key,value)=>Object.defineProperty(map,key,{value,writable:true,enumerable:true,configurable:true});
const state={files:[],inputs:[],catalog:null,view:null,worker:null,busy:null,job:0,loaded:false,restored:false,urls:[],timer:null,pending:false,
  previousAnalysis:null,avatarId:'',avatarOutput:'',motionPage:0,referencePage:0,layerQueries:new Map(),viewStale:true};
let serial=0;
const uid=prefix=>`${prefix}-${Date.now().toString(36)}-${++serial}`;
function output(){return {id:uid('output'),name:'CombinedFX',playable:'FX',base:{id:uid('base'),controllerId:'',expressionId:null},additions:[],layerOrder:[],layerNames:{},motionAssignments:[]};}
function newPlan(){return {schemaVersion:1,name:'AnimatorComposer',inputHashes:[],assetChoices:{},externalReferences:[],outputs:[output()],globalExpressionId:null,
  parameterEdits:{},conflictChoices:{},animatorChoices:{},installer:{pathMode:'Absolute',mergeMode:'Append',matchWriteDefaults:false,menuId:null}};}
let plan=newPlan();
function el(tag,text,attrs={}){const node=document.createElement(tag);if(text!==undefined&&text!==null)node.textContent=String(text);for(const [key,value]of Object.entries(attrs)){if(key==='class')node.className=value;else node.setAttribute(key,String(value));}return node;}
function button(text,fn,cls='quiet'){const b=el('button',text,{type:'button',class:cls});b.addEventListener('click',fn);return b;}
function label(text,control){const l=el('label',text);l.append(control);return l;}
function input(type,value,onChange,attrs={}){const n=el('input',null,{type,...attrs});if(type==='checkbox')n.checked=!!value;else n.value=value??'';n.addEventListener('change',()=>onChange(type==='checkbox'?n.checked:n.value));return n;}
function select(options,value,onChange,attrs={}){const n=el('select',null,attrs);for(const o of options){const option=el('option',o.label,{value:o.value});n.append(option);}n.value=value??'';n.addEventListener('change',()=>onChange(n.value));return n;}
function sourceLabel(id){if(id==='menu'||id.startsWith('menu:'))return '選択Menu';const b=plan.outputs.flatMap(o=>[o.base,...o.additions]).find(b=>b.id===id);return b?controller(b.controllerId)?.name??id:id==='global'?'統合全体':id;}
function controller(id){return state.catalog?.controllers?.find(c=>c.id===id);}
function assetOptions(items,empty='未指定'){return [{value:'',label:empty},...(items??[]).map(a=>({value:a.id,label:`${a.name||a.path.split('/').at(-1)} — ${a.path}`}))];}
function clearDownloads(){for(const u of state.urls)URL.revokeObjectURL(u);state.urls=[];}
function invalidate(){state.viewStale=true;clearDownloads();$('result').hidden=true;$('result-placeholder').hidden=false;$('result-placeholder').textContent='現在の設定で生成すると、結果を表示します。';$('generate').disabled=true;$('analysis-status').textContent='設定が変わりました。再解析後の結果を確認してください。';renderReferences();}
function setStatus(message){$('status').textContent=message;}
function showError(message,issues=[]){$('error').replaceChildren(el('p',message));if(issues.length){const ul=el('ul');for(const i of issues)ul.append(el('li',i.message??i));$('error').append(ul);}$('error').hidden=false;}
function resetError(){$('error').hidden=true;$('error').replaceChildren();}
function setBusy(kind){state.busy=kind;$('configuration').disabled=!state.loaded||!!kind;$('cancel').disabled=!kind;$('files').disabled=!!kind;$('clear').disabled=!!kind;$('reload').disabled=!!kind;for(const b of $('file-list').querySelectorAll('button'))b.disabled=!!kind;for(const s of $('asset-conflicts').querySelectorAll('select'))s.disabled=!!kind;}
function getWorker(){
  if(state.worker)return state.worker;
  const w=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});state.worker=w;
  w.addEventListener('message',({data})=>{
    if(state.worker!==w||data.id!==state.job)return;
    if(data.type==='progress'){setStatus(data.message);return;}
    const kind=state.busy;setBusy(null);
    if(data.type==='error'){
      if(kind==='load'){state.loaded=false;$('configuration').disabled=true;$('reload').hidden=!state.files.length;}
      showError(data.message,data.issues);setStatus('処理を完了できませんでした。表示された項目を確認してください。');
    }else if(data.type==='loaded'){
      state.loaded=true;state.inputs=data.inputs;state.catalog=data.catalog;state.view=null;
      if(!state.restored)plan.inputHashes=data.inputs.map(i=>i.hash);
      $('configuration').disabled=false;$('reload').hidden=true;
      renderCatalog();renderConfig();renderFiles();setStatus(`${data.inputs.length}ファイルを読み込みました。ベースControllerと追加する構造を選んでください。`);
      updateRebind();scheduleAnalysis();
    }else if(data.type==='catalog'){
      state.catalog=data.catalog;state.view=null;renderCatalog();renderConfig();scheduleAnalysis();
    }else if(data.type==='analyzed'){
      state.view=data.view;state.viewStale=false;state.catalog=data.view.catalog??state.catalog;renderAnalysis();renderInstallContext();
      setStatus(data.view.ready?(data.view.preservedReferences?.length?'外部参照を維持する設定です。導入先に必要なAssetを確認して生成してください。':'設定が確定しました。Unitypackageを生成できます。'):'未設定・競合・依存関係を確認してください。');
    }else if(data.type==='complete'){
      renderResult(data);setStatus('生成とpackageの再読込み検査が完了しました。');
      $('generate').disabled=false;
    }
    if(state.pending&&!state.busy){state.pending=false;scheduleAnalysis();}
  });
  w.addEventListener('error',()=>{if(state.worker!==w)return;w.terminate();state.worker=null;state.loaded=false;setBusy(null);invalidate();$('reload').hidden=!state.files.length;showError('処理用Workerを起動・実行できませんでした。素材の再読込みを試してください。');});
  return w;
}
function post(type,data={}){if(state.busy)return;resetError();setBusy(type);getWorker().postMessage({id:++state.job,type,...data});}
function referenceContext(){return JSON.stringify({outputs:plan.outputs,externalReferences:plan.externalReferences??[]});}
function load(){if(state.view&&!state.viewStale)state.previousAnalysis={diagnostics:state.view.dependencyDiagnostics??[],conflicts:state.catalog?.conflicts??[],configuration:referenceContext()};else state.previousAnalysis=null;invalidate();state.view=null;state.loaded=false;clearTimeout(state.timer);state.pending=false;post('load',{files:state.files,assetChoices:plan.assetChoices});}
function scheduleAnalysis(){
  clearTimeout(state.timer);if(!state.loaded)return;
  if(state.busy){state.pending=true;return;}
  state.timer=setTimeout(()=>{state.timer=null;if(state.busy){state.pending=true;return;}post('analyze',{plan:structuredClone(plan)});},180);
}
function changed(rerender=false){invalidate();if(rerender)renderConfig();scheduleAnalysis();}
function stop(){clearTimeout(state.timer);state.timer=null;state.pending=false;state.worker?.terminate();state.worker=null;state.job++;state.loaded=false;setBusy(null);invalidate();$('reload').hidden=!state.files.length;setStatus('処理を取り消しました。素材は再読込みできます。');}

function renderFiles(){
  $('file-list').replaceChildren();
  state.files.forEach((file,i)=>{const li=el('li');li.append(el('span',`${file.name} (${(file.size/1024/1024).toFixed(2)} MiB)`),button('解除',()=>{state.files.splice(i,1);renderFiles();if(state.files.length)load();else clearAll();}));$('file-list').append(li);});
}
function clearAll(){stop();state.files=[];state.inputs=[];state.catalog=null;state.view=null;state.previousAnalysis=null;state.avatarId='';state.avatarOutput='';state.layerQueries.clear();state.restored=false;plan=newPlan();$('reload').hidden=true;renderFiles();renderCatalog();renderConfig();renderAnalysis();setStatus('Unitypackageを読み込んでください。');resetError();}
function renderCatalog(){
  const c=state.catalog;$('asset-count').textContent=c?`${c.assets?.length??0} Asset / ${c.controllers?.length??0} Controller`:'未読込み';
  const host=$('asset-conflicts');host.replaceChildren();host.hidden=!(c?.conflicts?.length);
  if(!host.hidden){host.append(el('p','同じGUIDの異なる版があります。採用する素材を指定してください。',{class:'notice warning'}));
    for(const conflict of c.conflicts){const card=el('div',null,{class:'conflict-card'});card.append(el('p',conflict.alternatives[0]?.path??conflict.guid),el('p',`GUID ${conflict.guid}`,{class:'small'}));const refs=(state.previousAnalysis?.diagnostics??[]).filter(d=>d.targetGuid===conflict.guid);if(refs.length)card.append(el('p',`前回の不足参照：${[...new Set(refs.map(d=>d.sourceName))].join('、')}`,{class:'small'}));const opts=[{value:'',label:'採用する版を選択'},...conflict.alternatives.map(a=>({value:a.packageHash,label:`${a.packageName} — ${a.path}`}))];card.append(select(opts,plan.assetChoices[conflict.guid],v=>{if(v)plan.assetChoices[conflict.guid]=v;else delete plan.assetChoices[conflict.guid];invalidate();post('catalog',{assetChoices:plan.assetChoices});},{'aria-label':`${conflict.guid}の採用元`}));host.append(card);}}
  renderAssetList();renderMaterials();
}
function renderAssetList(){
  const query=$('asset-search').value.toLowerCase();const rows=(state.catalog?.assets??[]).filter(a=>`${a.path} ${a.kind}`.toLowerCase().includes(query));
  $('asset-list-count').textContent=`${rows.length}件${rows.length>300?'（先頭300件を表示。検索で絞れます）':''}`;$('asset-list').replaceChildren();
  for(const a of rows.slice(0,300)){const row=el('div',null,{class:'asset-row'});row.append(el('div',a.path),el('span',`${a.kind??'Asset'} / ${a.status??'読込み済み'}`));$('asset-list').append(row);}
}
function renderMaterials(){
  const host=$('material-cards');host.replaceChildren();
  for(const pkg of state.catalog?.materials?.packages??[]){
    const card=el('article',null,{class:'material-card'}),count=k=>pkg[k]?.length??0;
    card.append(el('h3',pkg.name),el('p',`Controller ${count('controllerIds')} / Motion ${count('motionIds')} / Expression ${count('expressionIds')} / Menu ${count('menuIds')}`,{class:'small'}));
    if(pkg.sourceMotionCount!==undefined&&pkg.sourceMotionCount!==count('motionIds'))card.append(el('p',`原本内のMotionは${pkg.sourceMotionCount}件です。上の件数は現在採用できる版の数で、未選択の競合などを含みません。`,{class:'notice warning'}));
    if(count('controllerIds'))card.append(el('p','「構成を選ぶ」でベースまたは追加ブロックのControllerを指定します。'));
    else if(count('motionIds'))card.append(el('p','Motion素材です。ベースを選んで解析した後、「既存Motionを置換」から使用できます。独立したLayerを新設する機能はありません。'));
    else if(count('expressionIds'))card.append(el('p','登録定義です。この素材のブロックに適用するか、統合後の全体用にするかを選びます。'));
    else card.append(el('p','Controllerを含まない素材です。合成に使うControllerを含む別のpackageが必要です。'));
    if(count('avatarIds'))card.append(el('p','PrefabのDescriptorから設定候補を確認できます。',{class:'fixed-tag'}));
    host.append(card);
  }
}
function setBlockController(o,b,value){
  if(b.controllerId===value)return;
  b.controllerId=value;if(b!==o.base)b.layerIndices=[];
  o.motionAssignments=o.motionAssignments.filter(a=>a.blockId!==b.id);
  for(const k of Object.keys(o.layerNames??{}))if(k.startsWith(b.id+':'))delete o.layerNames[k];
  syncOrder(o);changed(true);
}
function renderAvatarChoice(){
  const avatars=state.catalog?.materials?.avatars??[],pick=$('avatar-select'),target=$('avatar-output');
  pick.replaceChildren();for(const opt of assetOptions(avatars,'Prefabの設定を確認する'))pick.append(el('option',opt.label,{value:opt.value}));
  if(!avatars.some(a=>a.id===state.avatarId))state.avatarId='';pick.value=state.avatarId;
  target.replaceChildren();for(const o of plan.outputs)target.append(el('option',`${o.name} / ${o.playable}`,{value:o.id}));
  if(!plan.outputs.some(o=>o.id===state.avatarOutput))state.avatarOutput=plan.outputs[0]?.id??'';target.value=state.avatarOutput;
  const host=$('avatar-details');host.replaceChildren();const avatar=avatars.find(a=>a.id===state.avatarId),o=plan.outputs.find(o=>o.id===state.avatarOutput);
  if(!avatar){host.append(el('p',avatars.length?'確認したいPrefabを選択してください。':'Descriptorから候補を取得できるPrefabがありません。Controllerを直接選択できます。',{class:'small'}));return;}
  host.append(el('p',`出典：${avatar.path}`),el('p',`Descriptor：${avatar.descriptorId}`,{class:'small'}));
  for(const d of avatar.diagnostics??[])host.append(el('p',typeof d==='string'?d:d.message,{class:'notice warning'}));
  for(const c of avatar.controllers??[]){
    const info=controller(c.controllerId),row=el('div',null,{class:'candidate-row'});row.append(el('span',`${c.playable}：${c.isDefault?'SDK標準':info?.name??c.controllerId??'指定なし'}`));
    if(c.controllerId)row.append(el('span',info?.path??'参照先が読込み素材にありません',{class:'small'}));
    if(c.playable===o?.playable&&c.selectable&&avatar.selectable)row.append(button(`${o.name}のベースに採用`,()=>setBlockController(o,o.base,c.controllerId)));
    host.append(row);
  }
  const expression=state.catalog?.expressions.find(e=>e.id===avatar.expressionId),menu=state.catalog?.menus.find(e=>e.id===avatar.menuId);
  host.append(el('p',`元Expression：${expression?.path??avatar.expressionId??'指定なし'}`,{class:'small'}));
  if(o&&avatar.selectable&&avatar.customExpressions&&avatar.expressionAvailable&&expression)host.append(button('このExpressionをベースブロックへ採用',()=>{o.base.expressionId=expression.id;changed(true);}));
  if(plan.globalExpressionId)host.append(el('p','現在は全体用Expressionを適用中です。ベース用へ採用しても、全体指定を解除するまで登録には適用しません。',{class:'notice warning'}));
  host.append(el('p',`元Menu：${menu?.path??avatar.menuId??'指定なし'}。対象Avatarに登録済みなら、追加Menuとして再度導入する必要はありません。`,{class:'small'}));
}
function renderInstallContext(){
  const host=$('install-context');host.replaceChildren();
  host.append(el('p',plan.installer.mergeMode==='Replace'?'現在の設定：対象Playableの既存Controllerを置き換えます。保持したい既存Layerを出力に含めてください。':'現在の設定：対象Playableへ追加します。出力に既存FX全体が含まれる場合は、二重導入を避けるため置換を選びます。',{class:'notice'}));
  for(const o of plan.outputs){
    const matches=(state.catalog?.materials?.avatars??[]).filter(a=>a.controllers?.some(c=>c.controllerId===o.base.controllerId&&c.playable===o.playable&&c.selectable));
    if(!matches.length)continue;
    const note=el('p',`${o.name}のベースは、${matches.map(a=>a.name).join('、')}のDescriptorに登録された${o.playable}です。`,{class:'small'});host.append(note);
    if(plan.installer.mergeMode==='Append')host.append(el('p','同じ原本状態のAvatarへ導入する場合、元ControllerとLayerが重なる構成です。導入先を確認して方式を選んでください。',{class:'notice warning'}));
    if(matches.some(a=>a.menuId&&a.menuId===plan.installer.menuId))host.append(el('p','追加Menuに原本のRoot Menuを選んでいます。対象Avatarに登録済みなら二重に追加される可能性があります。',{class:'notice warning'}));
  }
}
function syncOrder(o){
  const available=[];for(const b of [o.base,...o.additions]){const c=controller(b.controllerId);for(const l of c?.layers??[])if(b===o.base||b.layerIndices.includes(l.index))available.push({blockId:b.id,index:l.index});}
  const key=l=>`${l.blockId}:${l.index}`, valid=new Set(available.map(key)),seen=new Set();
  o.layerOrder=(o.layerOrder??[]).filter(l=>{const k=key(l);if(!valid.has(k)||seen.has(k))return false;seen.add(k);return true;});
  for(const l of available)if(!seen.has(key(l)))o.layerOrder.push(l);
  for(const k of Object.keys(o.layerNames??{}))if(!valid.has(k))delete o.layerNames[k];
}
function renderConfig(){
  $('output-name').value=plan.name;
  const global=$('global-expression');global.replaceChildren();for(const o of assetOptions(state.catalog?.expressions,'未指定（ブロック別に設定）'))global.append(el('option',o.label,{value:o.value}));global.value=plan.globalExpressionId??'';
  $('global-explanation').textContent=plan.globalExpressionId?'全体用Expressionを登録設定として採用します。ブロック別Expressionは適用されません。':'全体用を指定すると、ブロック別のExpression設定は適用しません。';
  $('outputs').replaceChildren();for(const o of plan.outputs)renderOutput(o);
  $('merge-mode').value=plan.installer.mergeMode;$('path-mode').value=plan.installer.pathMode;$('match-wd').checked=plan.installer.matchWriteDefaults;
  const menu=$('menu');menu.replaceChildren();for(const opt of assetOptions(state.catalog?.menus,'Menuを追加しない'))menu.append(el('option',opt.label,{value:opt.value}));menu.value=plan.installer.menuId??'';
  renderAvatarChoice();renderExpressionScope();renderInstallContext();renderMotionSlots();renderReferences();updateRebind();
}
function renderOutput(o){
  const card=el('article',null,{class:'output-card'}),heading=el('div',null,{class:'heading'});heading.append(el('h3',`${o.name} / ${o.playable}`));
  if(plan.outputs.length>1)heading.append(button('出力を解除',()=>{plan.outputs=plan.outputs.filter(x=>x!==o);changed(true);},'quiet danger'));card.append(heading);
  const fields=el('div',null,{class:'fields'});
  fields.append(label('Controller名',input('text',o.name,v=>{o.name=v;changed();},{maxlength:64})),label('Playable',select(['FX','Additive','Gesture','Action','Base','Sitting','TPose','IKPose'].map(v=>({value:v,label:v})),o.playable,v=>{o.playable=v;changed(true);})));card.append(fields);
  for(const b of [o.base,...o.additions]){
    const base=b===o.base,block=el('div',null,{class:`block-card${base?'':' addition'}`,'data-block-id':b.id}),head=el('div',null,{class:'heading'});
    head.append(el('h3',base?'ベースブロック':`追加ブロック ${o.additions.indexOf(b)+1}`));
    if(!base)head.append(button('解除',()=>{o.additions=o.additions.filter(x=>x!==b);syncOrder(o);changed(true);}));block.append(head);
    const f=el('div',null,{class:'fields'});
    f.append(label('Controller',select(assetOptions(state.catalog?.controllers,'Controllerを選択'),b.controllerId,v=>setBlockController(o,b,v))));
    const expression=select(assetOptions(state.catalog?.expressions,'未指定（サイトで編集）'),b.expressionId,v=>{b.expressionId=v||null;changed(true);});expression.disabled=!!plan.globalExpressionId;
    f.append(label(plan.globalExpressionId?'ブロック用Expression（全体用を適用中）':'この素材の登録を確定するExpression',expression));block.append(f);
    block.append(el('p',plan.globalExpressionId?'全体用の定義を適用中です。このブロックの定義は保存され、全体指定を解除すると再び適用されます。':b.expressionId?'このブロックの登録値と、非掲載項目の除外を固定します。':'このブロックの未設定項目を、解析後に登録表で編集します。',{class:'small'}));
    const c=controller(b.controllerId);
    if(c){if(base){block.append(el('p',`${c.layers.length} Layerと既存Parameterを保持します。`,{class:'small'}));block.append(el('p','現在のAvatar FXをベースにする場合は、生成欄で「既存Controllerを置換」を選びます。追加機能だけをまとめる場合は、その導入先に合わせて「追加」を選びます。',{class:'small'}));}else{
      const picks=el('div',null,{class:'layer-picks'});
      const search=input('search',state.layerQueries.get(b.id)??'',()=>{}, {'aria-label':'追加Layerを名前で検索',placeholder:'追加Layerを名前で検索'});
      const filter=()=>{const q=search.value.toLowerCase();state.layerQueries.set(b.id,search.value);for(const n of picks.children)n.hidden=!n.textContent.toLowerCase().includes(q);};search.addEventListener('input',filter);block.append(label('追加Layerを絞り込む',search));
      for(const l of c.layers){const checkbox=input('checkbox',b.layerIndices.includes(l.index),v=>{b.layerIndices=v?[...b.layerIndices,l.index].sort((a,b)=>a-b):b.layerIndices.filter(n=>n!==l.index);syncOrder(o);changed(true);});const lab=el('label',` ${l.index}: ${l.name}`);lab.append(checkbox);picks.append(lab);}filter();block.append(el('p',`${b.layerIndices.length} / ${c.layers.length} Layerを選択`,{class:'small'}),picks);
    }}
    card.append(block);
  }
  card.append(button('追加ブロックを作る',()=>{o.additions.push({id:uid('add'),controllerId:'',layerIndices:[],expressionId:null});changed(true);}));
  const details=el('details');details.open=true;details.append(el('summary','出力Layerの順序'));const ol=el('ol',null,{class:'order-list'});
  for(const [i,l]of o.layerOrder.entries()){
    const b=[o.base,...o.additions].find(b=>b.id===l.blockId),c=controller(b?.controllerId),layer=c?.layers.find(x=>x.index===l.index);
    const li=el('li'),name=el('span');name.append(input('text',o.layerNames?.[`${l.blockId}:${l.index}`]??layer?.name??'',v=>{(o.layerNames??={})[`${l.blockId}:${l.index}`]=v;changed();},{'aria-label':`${layer?.name??'Layer'}の出力名`}),el('span',`${b===o.base?'ベース':'追加'}・${c?.name??''}`,{class:'small'}));li.append(name);
    for(const [delta,text]of [[-1,'↑'],[1,'↓']]){const move=button(text,()=>{const j=i+delta;[o.layerOrder[i],o.layerOrder[j]]=[o.layerOrder[j],o.layerOrder[i]];changed(true);});move.disabled=i+delta<0||i+delta>=o.layerOrder.length;move.setAttribute('aria-label',`${layer?.name??'Layer'}を${delta<0?'上':'下'}へ`);li.append(move);}ol.append(li);
  }
  details.append(ol);card.append(details);$('outputs').append(card);
}
function renderMotionSlots(){
  const host=$('motion-slots'),paging=$('motion-paging');host.replaceChildren();paging.replaceChildren();
  const all=state.view?.slots??[];
  if(!$('motion-panel').open){$('motion-count').textContent=`${all.length}箇所。開くと割当先を表示します。`;return;}
  const q=$('motion-slot-search').value.toLowerCase(),mq=$('motion-choice-search').value.toLowerCase();
  const slots=all.filter(s=>`${s.label} ${sourceLabel(s.blockId)}`.toLowerCase().includes(q));
  const motions=(state.catalog?.motions??[]).filter(m=>`${m.name} ${m.path}`.toLowerCase().includes(mq));
  const pageSize=20,maxPage=Math.max(0,Math.ceil(slots.length/pageSize)-1);state.motionPage=Math.min(state.motionPage,maxPage);
  $('motion-count').textContent=`割当先 ${slots.length} / ${all.length}箇所、候補 ${motions.length}件。1ページ20箇所、候補は先頭80件です。名前で絞り込めます。`;
  if(!slots.length){host.append(el('p',all.length?'検索に一致する割当先はありません。':'ベースと追加Layerを選び、構成を解析してください。',{class:'small'}));return;}
  for(const slot of slots.slice(state.motionPage*pageSize,(state.motionPage+1)*pageSize)){
    const o=plan.outputs.find(o=>[o.base,...o.additions].some(b=>b.id===slot.blockId));if(!o)continue;
    const assignment=o.motionAssignments.find(a=>a.blockId===slot.blockId&&a.targetId===slot.targetId&&(a.childIndex??null)===(slot.childIndex??null));
    const row=el('div',null,{class:'slot'});row.append(el('label',`${slot.label} / ${sourceLabel(slot.blockId)}`));
    const candidates=motions.slice(0,80),selected=state.catalog?.motions.find(m=>m.id===assignment?.motionId);
    if(selected&&!candidates.some(m=>m.id===selected.id))candidates.unshift(selected);
    const control=select(assetOptions(candidates,'原本のMotionを維持'),assignment?.motionId??'',v=>{o.motionAssignments=o.motionAssignments.filter(a=>!(a.blockId===slot.blockId&&a.targetId===slot.targetId&&(a.childIndex??null)===(slot.childIndex??null)));if(v)o.motionAssignments.push({blockId:slot.blockId,targetId:slot.targetId,childIndex:slot.childIndex??null,motionId:v});changed();},{'aria-label':slot.label});
    row.append(control,el('span',slot.motionId?`現在の参照：${state.catalog?.motions.find(m=>m.id===slot.motionId)?.name??slot.motionId}`:'現在の参照：None (Motion)',{class:'small'}));host.append(row);
  }
  const prev=button('前の20箇所',()=>{state.motionPage--;renderMotionSlots();}),next=button('次の20箇所',()=>{state.motionPage++;renderMotionSlots();});prev.disabled=state.motionPage===0;next.disabled=state.motionPage>=maxPage;
  paging.append(prev,el('span',`${state.motionPage+1} / ${maxPage+1}`,{class:'small'}),next);
}
function renderReferences(){
  const all=state.view?.referenceCandidates??[],held=state.view?.preservedReferences??[],host=$('reference-list'),paging=$('reference-paging'),groups=new Map();host.replaceChildren();paging.replaceChildren();
  for(const r of all){if(!groups.has(r.targetId))groups.set(r.targetId,[]);groups.get(r.targetId).push(r);}
  const selected=plan.externalReferences??[],count=new Set(held.map(r=>r.targetId)).size;
  $('reference-summary').textContent=`外部Assetの参照を維持する（候補 ${groups.size}件 / 維持 ${count}件${state.viewStale&&state.view?'・前回解析／再解析待ち':''}）`;
  $('external-context').hidden=state.viewStale||!count;
  $('external-context').textContent=`外部Asset ${count}件を同梱せず、原本のGUID・fileIDを維持します。導入先に同じAssetが必要です。${held.some(r=>r.kind==='motion'&&!r.retainedOnly)?'外部Motion内の使用Parameterは未確認です。該当ブロックは元Controllerの宣言を全て保持します。':''}`;
  const saved=$('reference-saved');saved.replaceChildren();
  for(const id of selected){const active=held.some(r=>r.targetId===id),li=el('li');li.append(el('span',`${id}${state.viewStale?'（再解析待ち）':active?'（参照を維持）':'（現在の構成では未適用）'}`),button('維持設定を解除',()=>{plan.externalReferences=(plan.externalReferences??[]).filter(x=>x!==id);changed();renderReferences();}));saved.append(li);}
  if(!$('reference-panel').open)return;
  const q=$('reference-search').value.toLowerCase(),rows=[...groups.values()].filter(list=>list.some(r=>`${r.targetId} ${r.targetPath??''} ${r.controllerPath??''} ${(r.layerNames??[]).join(' ')} ${r.sourceName??''}`.toLowerCase().includes(q)));
  rows.sort((a,b)=>Number(a[0].availableInInput)-Number(b[0].availableInInput));
  const pageSize=20,maxPage=Math.max(0,Math.ceil(rows.length/pageSize)-1);state.referencePage=Math.min(state.referencePage,maxPage);
  $('reference-count').textContent=`${state.viewStale&&state.view?'前回の解析結果です。再解析後に適用範囲を確認してください。':''}${rows.length} / ${groups.size}件。1ページ20件です。参照先ごとに、維持するものを選んでください。`;
  if(!rows.length)host.append(el('p',all.length?'検索に一致する参照はありません。':'構成の解析後に、外部Assetへの参照候補を表示します。',{class:'small'}));
  for(const list of rows.slice(state.referencePage*pageSize,(state.referencePage+1)*pageSize)){
    const r=list[0],eligible=list.filter(x=>x.eligible),chosen=selected.includes(r.targetId),card=el('article',null,{class:'reference-card'});
    card.append(el('p',r.targetPath??r.targetId),el('p',`${[...new Set(list.map(x=>({motion:'Motion',mask:'AvatarMask',resource:'参照リソース',structure:'編集対象の構造'})[x.kind]??x.kind))].join(' / ')}・${r.availableInInput?'素材内に収録':'素材には未収録'}・参照 ${list.length}箇所`,{class:'small'}));
    if(r.targetPath)card.append(el('p',r.targetId,{class:'small'}));
    const checkbox=input('checkbox',chosen,v=>{const ids=new Set(plan.externalReferences??[]);if(v)ids.add(r.targetId);else ids.delete(r.targetId);plan.externalReferences=[...ids];changed();renderReferences();},{'aria-label':`${r.targetId}の外部参照を維持`});checkbox.disabled=!chosen&&!eligible.length;
    const lab=el('label','同梱せず、導入先の既存Assetを参照する',{class:'check'});lab.append(checkbox);card.append(lab);
    const reasons=[...new Set(list.filter(x=>!x.eligible).map(x=>x.eligibilityReason))];
    if(reasons.length)card.append(el('p',`維持できない参照があります：${reasons.map(reason=>({local_or_owned_reference:'Controller内部または同じAsset内の参照',unresolved_guid_conflict:'同じGUIDの採用版が未確定',known_wrong_type:'参照先の型が不一致',known_missing_file_id:'指定fileIDが素材内に存在しない',structural_or_unclassified_reference:'編集に必要な構造、または用途を確認できない参照',explicit_motion_assignment:'置換先として指定したMotion',edited_motion_descendant:'配下のMotionに置換設定がある'})[reason]??'用途を確認できない参照').join(' / ')}。${eligible.length?'維持できない参照のエラーが残るため、この指定のままでは生成できません。':'原本の構造・割当・依存素材を確認してください。'}`,{class:'notice warning'}));
    const details=el('details'),ul=el('ul');details.append(el('summary','参照元を確認'));
    for(const x of list)ul.append(el('li',`${x.controllerPath??x.sourcePath} → ${(x.layerNames??[]).join(' / ')||'Layer外'} → ${x.sourceName??x.sourceId} → ${x.field}${x.retainedOnly?'（未到達の保持分）':''}`));details.append(ul);card.append(details);host.append(card);
  }
  const prev=button('前の20件',()=>{state.referencePage--;renderReferences();}),next=button('次の20件',()=>{state.referencePage++;renderReferences();});prev.disabled=state.referencePage===0;next.disabled=state.referencePage>=maxPage;paging.append(prev,el('span',`${state.referencePage+1} / ${maxPage+1}`,{class:'small'}),next);
}
function focusParameter(name){$('parameter-search').value=name;$('parameter-filter').value='all';renderParameters();const row=$('parameter-rows').querySelectorAll('tr')[0];row?.scrollIntoView?.({block:'center'});row?.focus();}
function parameterErrors(){return new Set((state.view?.issues??[]).filter(i=>i.severity==='error').flatMap(i=>i.parameterNames??[]));}
function renderExpressionScope(){
  const host=$('expression-scope');host.replaceChildren();
  if(!plan.globalExpressionId)return;
  const definition=state.catalog?.expressions.find(e=>e.id===plan.globalExpressionId),scope=state.view?.expressionScope;
  const box=el('div',null,{class:'notice warning'});box.append(el('p',`全体用を適用中：${definition?.name??plan.globalExpressionId}。この定義にない項目は、追加素材の分も外部登録しません。`));
  box.append(button('全体指定を解除してブロック別へ戻す',()=>{plan.globalExpressionId=null;changed(true);}));
  if(!state.viewStale&&scope?.mode==='global'&&scope.globalExpressionId===plan.globalExpressionId){
    box.append(el('p',`ブロック別からの設定変更：${scope.changes.length}件。ブロック用定義${scope.ignoredBlockExpressions}件は保存したまま適用を休止しています。${scope.partial?'依存不足などにより、比較は解析できた範囲のみです。':''}`));
    if(scope.comparisonUnavailable)box.append(el('p','ブロック別の設定との差分は、定義のエラーを解消後に確認できます。'));
    if(scope.changes.length){const details=el('details'),list=el('ul');details.append(el('summary','登録・除外・値の変更を確認'));
      const describe=v=>!v?'候補なし':v.registered===true?`登録 ${v.type} / 初期値 ${v.defaultValue} / 同期 ${v.networkSynced?'ON':'OFF'} / Saved ${v.saved?'ON':'OFF'}`:v.registered===false?'除外':'未設定';
      for(const r of scope.changes)list.append(el('li',`${r.name}：${describe(r.before)} → ${r.after?describe(r.after):'候補から外れる（登録しない）'}`));details.append(list);box.append(details);
    }
  }else box.append(el('p','適用範囲と登録の差分を再解析しています。'));
  host.append(box);
}
function renderDependencies(){
  const diagnostics=state.view?.dependencyDiagnostics??[],host=$('dependency-list'),groups=new Map();host.replaceChildren();
  $('dependencies').hidden=!diagnostics.length&&!state.previousAnalysis?.diagnostics.length;
  for(const d of diagnostics){const k=`${d.reason}/${d.targetId}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(d);}
  const guidCount=new Set(diagnostics.map(d=>d.targetGuid)).size;
  $('dependency-count').textContent=`参照先 ${groups.size}件 / GUID ${guidCount}件 / 参照箇所 ${diagnostics.length}件。生成は依存解決後に進められます。`;
  const old=state.previousAnalysis;
  if(old&&old.configuration===referenceContext()&&state.view){
    const before=new Set(old.diagnostics.map(d=>d.targetId)),now=new Set(diagnostics.map(d=>d.targetId));
    const resolved=[...before].filter(id=>!now.has(id)),remaining=[...before].filter(id=>now.has(id)),added=[...now].filter(id=>!before.has(id));
    const unresolvedConflicts=(state.catalog?.conflicts??[]).filter(c=>!plan.assetChoices[c.guid]);
    const removedLabel=state.view.analysisComplete?'依存解消':'一覧から外れた（解消は未判定）';
    $('dependency-recovery').textContent=`素材再読込み前との比較：${removedLabel} ${resolved.length}件、残存 ${remaining.length}件、新たな要確認 ${added.length}件。未選択のGUID競合 ${unresolvedConflicts.length}件。解析できない構造の先は未確認です。`;
  }else $('dependency-recovery').textContent='依存素材を追加すると、同じ構成の前回解析との変化を表示します。';
  const q=$('dependency-search').value.toLowerCase();
  for(const list of groups.values()){
    if(q&&!list.some(d=>`${d.controllerPath} ${(d.layerNames??[]).join(' ')} ${d.sourceName} ${d.sourcePath} ${d.targetId}`.toLowerCase().includes(q)))continue;
    const d=list[0],box=el('details');box.append(el('summary',`${({missing:'未収録',conflict:'版の採用が必要',wrong_type:'参照先の型が不一致',unsupported:'未対応'})[d.reason]??d.reason}：${d.targetPath??d.targetId} (${list.length}箇所)`));
    box.append(el('p',`GUID ${d.targetGuid} / fileID ${d.targetFileId}`,{class:'small'}));
    const ul=el('ul');for(const ref of list)ul.append(el('li',`${ref.controllerPath??ref.sourcePath} → ${(ref.layerNames??[]).join(' / ')||'Layer外'} → ${ref.sourceName??ref.sourceId} → ${ref.field}${ref.retainedOnly?'（ベース内の未到達保持分）':''}`));box.append(ul);
    if(d.reason==='conflict')box.append(button('素材の版を選ぶ欄へ',()=>{const control=Array.from($('asset-conflicts').querySelectorAll('select')).find(n=>n.getAttribute('aria-label')===`${d.targetGuid}の採用元`);control?.scrollIntoView?.({block:'center'});control?.focus();}));
    if(list.some(ref=>(state.view?.referenceCandidates??[]).some(c=>c.targetId===ref.targetId&&c.eligible)))box.append(button('この参照を維持する設定へ',()=>{$('reference-panel').open=true;$('reference-search').value=d.targetId;state.referencePage=0;renderReferences();$('reference-panel').scrollIntoView?.({block:'start'});}));
    host.append(box);
  }
}
function renderIssues(){
  const host=$('issues'),issues=state.view?.issues??[];host.replaceChildren();host.hidden=!issues.length;if(!issues.length)return;
  const box=el('div',null,{class:`notice ${issues.some(i=>i.severity==='error')?'error':'warning'}`}),ul=el('ul');
  const undecided=issues.filter(i=>i.code==='registration_undecided');if(undecided.length)ul.append(el('li',`外部登録が未設定：${undecided.length}項目。下の要確認表で登録または除外を選択してください。`));
  const deps=issues.filter(i=>(i.code??'').startsWith('dependency_'));if(deps.length){const li=el('li',`依存素材の要確認：${deps.length}箇所。不足・競合の一覧で参照元を確認してください。`);li.append(button('依存素材の一覧へ',()=>{$('dependencies').scrollIntoView?.({block:'start'});$('dependency-search').focus();}));ul.append(li);}
  for(const i of issues.filter(i=>i.code!=='registration_undecided'&&!(i.code??'').startsWith('dependency_'))){
    const li=el('li',`${i.severity==='error'?'要確認':'補足'}：${i.message}`);
    if(i.action==='expression-scope')li.append(button('Expressionの適用範囲へ',()=>{$('global-expression').scrollIntoView?.({block:'center'});$('global-expression').focus();}));
    else if(i.parameterNames?.length)li.append(button('対象の登録項目へ',()=>{if(i.parameterNames.length===1)focusParameter(i.parameterNames[0]);else{$('parameter-search').value='';$('parameter-filter').value='attention';renderParameters();$('parameter-rows').scrollIntoView?.({block:'center'});}}));
    else if(i.blockId)li.append(button('該当ブロックへ',()=>{const nodes=Array.from($('outputs').querySelectorAll('div'));nodes.find(n=>n.getAttribute?.('data-block-id')===i.blockId)?.scrollIntoView?.({block:'center'});}));
    ul.append(li);
  }
  box.append(ul);host.append(box);
}
const rowPending=r=>!r.fixed&&!r.conflict&&(r.registered===null||r.registered===undefined||r.unresolved===true||r.registered===true&&!['Float','Int','Bool'].includes(r.type));
function valueFor(r){return {registered:!!r.registered,type:['Float','Int','Bool'].includes(r.type)?r.type:'',defaultValue:Number.isFinite(r.defaultValue)?r.defaultValue:0,saved:!!r.saved,networkSynced:!!r.networkSynced,applyAnimatorDefault:!!r.applyAnimatorDefault};}
function editRow(r,changes){const value=r.fixed?{...(own(plan.parameterEdits,r.name)??{}),...changes}:{...valueFor(r),...(own(plan.parameterEdits,r.name)??{}),...changes};put(plan.parameterEdits,r.name,value);changed();}
function renderAnalysis(){
  const view=state.view;$('summary').replaceChildren();const rows=view?.rows??[],partial=view?.analysisComplete===false;
  $('analysis-status').textContent=!view?'構成を選ぶと解析結果を表示します。':partial?'解析は未完了です。下のParameter数・同期量は、解析できた部分だけの値です。未解析部分を0件として扱わないでください。':view.ready?(view.preservedReferences?.length?'生成する構造と登録設定の静的検査が完了しました。維持する外部Assetの内容と、導入先での参照解決は未確認です。':'構造と登録設定の静的検査が完了しました。Unity・MA・実動作の確認は別途必要です。'):'構造を解析しました。下の要確認項目を解消してください。';
  $('analysis-status').className=`notice${partial||view?.preservedReferences?.length?' warning':''}`;
  const status=$('block-status');status.replaceChildren();for(const b of view?.blockStatus??[]){const card=el('div',null,{class:'material-card'});card.append(el('strong',b.label??sourceLabel(b.blockId)),el('p',b.status==='complete'?'構造解析済み':`解析未完了・依存 ${b.dependencyCount??0}箇所 / 要確認 ${b.issueCount??0}件`,{class:b.status==='complete'?'fixed-tag':'unresolved-tag'}));if(b.usageComplete===false&&b.status==='complete')card.append(el('p','外部Motion内の使用Parameterは未確認。元のParameter宣言を全て保持します。',{class:'notice warning'}));status.append(card);}
  for(const [value,text]of [[rows.length,'Parameter'],[rows.filter(r=>r.fixed).length,'固定済み'],[rows.filter(rowPending).length,'未設定'],[view?.bitCost??0,'同期 bit']]){const m=el('div',null,{class:'metric'});m.append(el('strong',value),el('span',`${partial?'部分解析：':''}${text}`));$('summary').append(m);}
  renderIssues();renderDependencies();renderReferences();renderExpressionScope();renderAnimatorConflicts();renderParameters();renderSavedSettings();renderMotionSlots();$('generate').disabled=!view?.ready;
}
function renderAnimatorConflicts(){
  const host=$('animator-conflicts');host.replaceChildren();const conflicts=state.view?.animatorConflicts??[],missing=state.view?.missingParameters??[];
  for(const item of [...conflicts,...missing]){
    const card=el('div',null,{class:'conflict-card'});card.append(el('p',`Animator宣言：${item.name} / ${plan.outputs.find(o=>o.id===item.outputId)?.name??item.outputId}`));
    const current=own(own(plan.animatorChoices,item.outputId),item.name);let type=current?.type??'',value=current?.defaultValue??'';
    const save=()=>{if(type!==''&&value!==''&&Number.isFinite(Number(value))){saveAnimatorChoice(item.outputId,item.name,{type,defaultValue:Number(value)});changed();}};
    const fields=el('div',null,{class:'fields'});
    if(item.options?.length){fields.append(label('元定義を採用',select([{value:'',label:'選択してください'},...item.options.map((o,i)=>({value:String(i),label:`${sourceLabel(o.sourceId)}: ${o.type} / ${o.defaultValue}`}))],'',v=>{if(v!==''){const selected=item.options[Number(v)];saveAnimatorChoice(item.outputId,item.name,{type:selected.type,defaultValue:selected.defaultValue});changed();}})));}
    fields.append(label('型',select([{value:'',label:'型を選択'},...['Float','Int','Bool','Trigger'].map(v=>({value:v,label:v}))],type,v=>{type=v;save();})),label('初期値',input('number',value,v=>{value=v;save();},{step:'any'})));card.append(fields);host.append(card);
  }
}
function saveAnimatorChoice(outputId,name,value){
  if(!own(plan.animatorChoices,outputId))put(plan.animatorChoices,outputId,{});
  put(own(plan.animatorChoices,outputId),name,value);
}
function renderSavedSettings(){
  const host=$('saved-settings');host.replaceChildren();
  const add=(kind,name,value,remove)=>{const li=el('li');li.append(el('span',`${kind}: ${name} — ${JSON.stringify(value)}`),button('設定を解除',()=>{remove();changed();renderSavedSettings();}));host.append(li);};
  for(const [name,value]of Object.entries(plan.parameterEdits))add('登録編集',name,value,()=>delete plan.parameterEdits[name]);
  for(const [name,value]of Object.entries(plan.conflictChoices))add('登録の採用元',name,value,()=>delete plan.conflictChoices[name]);
  for(const [outputId,map]of Object.entries(plan.animatorChoices))for(const [name,value]of Object.entries(map))add('Animator宣言',`${outputId}/${name}`,value,()=>{delete map[name];if(!Object.keys(map).length)delete plan.animatorChoices[outputId];});
  if(!host.children.length)host.append(el('li','保存されたサイト編集はありません。'));
}
function renderParameters(){
  const query=$('parameter-search').value.toLowerCase(),filter=$('parameter-filter').value,all=state.view?.rows??[];
  const errorNames=parameterErrors();
  const rows=all.filter(r=>r.name.toLowerCase().includes(query)&&(filter==='all'||filter==='attention'&&(rowPending(r)||r.conflict||errorNames.has(r.name))||filter==='registered'&&r.registered===true||filter==='internal'&&r.registered===false||filter==='fixed'&&r.fixed));
  $('parameter-count').textContent=all.length?`${rows.length} / ${all.length}件${!rows.length&&filter==='attention'?'。この表示範囲に登録の要確認項目はありません。固定値は「すべて」で確認できます。':''}${state.view?.analysisComplete===false?' 集計は解析できた部分のみです。':''}`:state.view?.analysisComplete===false?'登録の集計は未完了です。構成と依存素材の要確認項目を解消してください。':'構成を選択して解析してください。';
  $('parameter-rows').replaceChildren();$('register-pending').disabled=!all.some(rowPending);$('exclude-pending').disabled=!all.some(rowPending);
  for(const r of rows){
    const tr=el('tr',null,{tabindex:'-1'}),name=el('td');name.append(el('div',r.name),el('span',(r.sourceIds??[]).map(sourceLabel).join(' / '),{class:'small'}),el('span',r.conflict?'競合':r.fixed?'Expressionで固定':rowPending(r)?'登録先が未設定':'サイトで設定',{class:`small ${r.fixed?'fixed-tag':'unresolved-tag'}`}));
    if(errorNames.has(r.name))name.append(el('span','要確認のエラーがあります',{class:'small unresolved-tag'}));
    if(own(plan.parameterEdits,r.name))name.append(button('このサイト編集を解除',()=>{delete plan.parameterEdits[r.name];changed();}));
    tr.append(name);const registration=el('td');
    const definition=o=>JSON.stringify(['registered','type','defaultValue','saved','networkSynced'].map(k=>o.value[k]));
    if(r.conflict||new Set((r.options??[]).map(definition)).size>1){registration.append(select([{value:'',label:'採用元を選択'},...(r.options??[]).map(o=>({value:o.sourceId,label:`${o.label??sourceLabel(o.sourceId)}: ${o.value.registered===false?'除外':`${o.value.type} / ${o.value.defaultValue} / Saved ${o.value.saved?'ON':'OFF'} / 同期 ${o.value.networkSynced?'ON':'OFF'}`}`}))],own(plan.conflictChoices,r.name)??'',v=>{if(v)put(plan.conflictChoices,r.name,v);else delete plan.conflictChoices[r.name];changed();},{'aria-label':`${r.name}の競合解決`}));}
    else if(r.fixed)registration.append(el('span',r.registered?'登録':'除外'));
    else registration.append(select([{value:'',label:'未設定'},{value:'yes',label:'登録'},{value:'no',label:'除外'}],r.registered===true?'yes':r.registered===false?'no':'',v=>{if(v===''){delete plan.parameterEdits[r.name];changed();}else editRow(r,{registered:v==='yes'});},{'aria-label':`${r.name}の外部登録`}));
    tr.append(registration);const frozen=r.fixed||r.conflict||r.registered!==true;
    const type=select([{value:'',label:'型を選択'},...['Float','Int','Bool'].map(v=>({value:v,label:v}))],valueFor(r).type,v=>editRow(r,{type:v}),{'aria-label':`${r.name}の外部型`});type.disabled=frozen;
    const def=input('number',r.defaultValue??0,v=>editRow(r,{defaultValue:v===''?NaN:Number(v)}),{step:'any','aria-label':`${r.name}の初期値`});def.disabled=frozen;
    const sync=input('checkbox',r.networkSynced,v=>editRow(r,{networkSynced:v}),{'aria-label':`${r.name}を同期`});sync.disabled=frozen;
    const saved=input('checkbox',r.saved,v=>editRow(r,{saved:v}),{'aria-label':`${r.name}を保存`});saved.disabled=frozen;
    const apply=input('checkbox',r.applyAnimatorDefault,v=>editRow(r,{applyAnimatorDefault:v}),{'aria-label':`${r.name}の初期値をAnimatorへ反映`});apply.disabled=!r.applyAnimatorDefault&&(r.conflict||r.registered!==true);
    for(const control of [type,def,sync,saved,apply]){const td=el('td');td.append(control);tr.append(td);}$('parameter-rows').append(tr);
  }
}
function downloadLink(node,bytes,type,filename){const url=URL.createObjectURL(new Blob([bytes],{type}));state.urls.push(url);node.href=url;node.download=filename;}
function renderResult(data){
  clearDownloads();$('result').hidden=false;$('result-placeholder').hidden=true;
  const preserved=data.report.preservedReferences??[];
  $('result-validation').textContent=preserved.length?`外部Asset ${new Set(preserved.map(r=>r.targetId)).size}件の参照を維持しています。Sourceへの収集は一部です。導入先に同じGUID・fileIDのAssetが必要です。外部内容・Unity Import・MAビルド・実動作は未確認です。`:'生成した構造と登録設定を静的検査済み。Unity Import・MAビルド・VRChatの実動作は未確認です。';
  $('result-validation').className=`notice${preserved.length?' warning':''}`;
  $('result-summary').textContent=`${data.assetCount} Asset / ${(data.archiveBytes/1024).toFixed(1)} KiB / 同期 ${data.report.bitCost} bit`;
  downloadLink($('download'),data.archiveBuffer,'application/octet-stream',`${data.plan.name}.unitypackage`);
  downloadLink($('report-download'),JSON.stringify(data.report,null,2),'application/json','GenerationReport.json');
  downloadLink($('result-plan'),JSON.stringify(data.plan,null,2),'application/json','CompositionPlan.json');
  $('installer-path').textContent=`${data.report.outputRoot}/Installer.prefab`;$('report-view').textContent=JSON.stringify(data.report,null,2);
}
function updateRebind(){const expected=[...plan.inputHashes].sort(),actual=state.inputs.map(i=>i.hash).sort();$('rebind').hidden=!state.loaded||JSON.stringify(expected)===JSON.stringify(actual);}
function savePlan(){const a=el('a');const url=URL.createObjectURL(new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}));a.href=url;a.download='CompositionPlan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function shapeOfPlan(p){
  if(!p||p.schemaVersion!==1||typeof p.name!=='string'||!Array.isArray(p.outputs)||!p.outputs.length||p.outputs.length>8||!Array.isArray(p.inputHashes)||!p.installer)throw new Error('対応する構成ファイルではありません。');
  for(const o of p.outputs)if(!o?.base||!Array.isArray(o.additions)||!Array.isArray(o.layerOrder)||!Array.isArray(o.motionAssignments))throw new Error('構成ファイルのブロックまたはLayer設定が不正です。');
  for(const k of ['assetChoices','parameterEdits','conflictChoices','animatorChoices'])if(!p[k]||typeof p[k]!=='object'||Array.isArray(p[k]))throw new Error('構成ファイルの設定が不正です。');
  if(p.externalReferences!==undefined&&(!Array.isArray(p.externalReferences)||p.externalReferences.some(id=>typeof id!=='string')))throw new Error('外部参照の設定が不正です。');
  return p;
}
$('files').addEventListener('change',()=>{const files=[...$('files').files];$('files').value='';if(!files.length)return;state.files.push(...files);renderFiles();load();});
$('clear').addEventListener('click',clearAll);$('reload').addEventListener('click',load);$('cancel').addEventListener('click',stop);
$('asset-search').addEventListener('input',renderAssetList);
$('avatar-select').addEventListener('change',()=>{state.avatarId=$('avatar-select').value;renderAvatarChoice();});
$('avatar-output').addEventListener('change',()=>{state.avatarOutput=$('avatar-output').value;renderAvatarChoice();});
$('dependency-search').addEventListener('input',renderDependencies);
$('reference-panel').addEventListener('toggle',renderReferences);
$('reference-search').addEventListener('input',()=>{state.referencePage=0;renderReferences();});
$('motion-panel').addEventListener('toggle',renderMotionSlots);
for(const id of ['motion-slot-search','motion-choice-search'])$(id).addEventListener('input',()=>{state.motionPage=0;renderMotionSlots();});
$('save-diagnostics').addEventListener('click',()=>{if(!state.view||state.viewStale)return;const a=el('a'),url=URL.createObjectURL(new Blob([JSON.stringify({format:'composer-dependency-report-1',inputHashes:plan.inputHashes,blocks:state.view.blockStatus,dependencies:state.view.dependencyDiagnostics,preservedReferences:state.view.preservedReferences,usageComplete:state.view.usageComplete,issues:state.view.issues},null,2)],{type:'application/json'}));a.href=url;a.download='DependencyReport.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('output-name').addEventListener('change',()=>{plan.name=$('output-name').value;changed();});
$('global-expression').addEventListener('change',()=>{plan.globalExpressionId=$('global-expression').value||null;changed(true);});
$('add-output').addEventListener('click',()=>{if(plan.outputs.length>=8)return;const o=output();o.name=`Combined${plan.outputs.length+1}`;o.playable=['FX','Additive','Gesture','Action','Base','Sitting','TPose','IKPose'].find(p=>!plan.outputs.some(o=>o.playable===p))??'FX';plan.outputs.push(o);changed(true);});
$('analyze').addEventListener('click',()=>{clearTimeout(state.timer);state.timer=null;if(state.loaded&&!state.busy){invalidate();post('analyze',{plan:structuredClone(plan)});}});
$('parameter-search').addEventListener('input',renderParameters);$('parameter-filter').addEventListener('change',renderParameters);
for(const [id,registered]of [['register-pending',true],['exclude-pending',false]])$(id).addEventListener('click',()=>{for(const r of state.view?.rows??[])if(rowPending(r))put(plan.parameterEdits,r.name,{...valueFor(r),registered});changed();});
for(const [id,key]of [['merge-mode','mergeMode'],['path-mode','pathMode'],['menu','menuId']])$(id).addEventListener('change',()=>{plan.installer[key]=$(id).value||null;changed();renderInstallContext();});
$('match-wd').addEventListener('change',()=>{plan.installer.matchWriteDefaults=$('match-wd').checked;changed();});
$('generate').addEventListener('click',()=>{clearTimeout(state.timer);state.timer=null;if(state.busy||state.viewStale||!state.view?.ready)return;clearDownloads();$('result').hidden=true;$('result-placeholder').hidden=false;$('generate').disabled=true;post('generate',{plan:structuredClone(plan)});});
$('save-plan').addEventListener('click',savePlan);
$('plan-file').addEventListener('change',async()=>{const file=$('plan-file').files[0];$('plan-file').value='';if(!file)return;try{if(file.size>2*1024*1024)throw new Error('構成ファイルが大きすぎます。');const loaded=shapeOfPlan(JSON.parse(await file.text()));plan=loaded;state.restored=true;state.view=null;invalidate();renderConfig();renderSavedSettings();updateRebind();post('catalog',{assetChoices:plan.assetChoices});}catch(e){showError(e.message);}});
$('rebind').addEventListener('click',()=>{plan.inputHashes=state.inputs.map(i=>i.hash);state.restored=false;updateRebind();changed();setStatus('現在の素材で構成を再検査します。参照先が変わった項目は再指定してください。');});
window.addEventListener('beforeunload',()=>{state.worker?.terminate();for(const url of state.urls)URL.revokeObjectURL(url);});
renderConfig();renderAnalysis();
if(typeof Worker==='undefined'||typeof WebAssembly==='undefined'){$('files').disabled=true;showError('このツールにはWeb WorkerとWebAssemblyに対応したブラウザが必要です。');}

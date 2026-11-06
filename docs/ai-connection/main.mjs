import {createManagementHost} from '../shared/ai-connection/management-host.mjs';
import {createReferenceOwner,createReferenceDescriptor} from '../shared/ai-connection/reference-owner.mjs';
import {createAdoptedWktensorCodec} from '../shared/ai-connection/codecs/wktensor.mjs';
import {buildManagementBundle,readManagementBundle} from '../shared/ai-connection/management-workspace.mjs';

const $=id=>document.getElementById(id);
const ownerId='reference:control';
const codec=createAdoptedWktensorCodec();
const flags={generationReady:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};
const defaultStep=(stepId,input,output,condition={})=>({stepId,moduleId:ownerId,operationId:'copy',inputBindings:[{portId:'input',artifactRef:input}],outputBindings:[{portId:'input',artifactRef:output}],adapterRefs:[],resourceGroupRefs:[],...condition});
const defaultProfile={contractVersion:'works-module-contract/1.0-draft.1',profileId:'works:standalone-management-reference',profileVersion:'1',semanticProfileRefs:[],externalArtifactRefs:['input'],steps:[defaultStep('input-copy','input','partial'),defaultStep('optional-lora-path','partial','selected',{when:{selection:'loraEnabled',equals:true},bypass:{input:'input'}}),defaultStep('final-copy','selected','final')],requiredEvidenceScopes:[]};
$('profile-json').value=JSON.stringify(defaultProfile,null,2);

let host=null,owner=null,unsubscribe=null,configured=false,running=false,applying=false;
let records={},fileBindings={},lastQuery=null,lastResult=null,selectedAssets=[],requiredAssetBindings=[];
let latestState={},errorRecord=null,configurationSerial=0;
const asJson=value=>JSON.stringify(value,(_,v)=>ArrayBuffer.isView(v)?`[${v.constructor.name}: ${v.length} values]`:v,2);
const errorJson=error=>({code:error?.code??error?.name??'ERROR',message:error?.message??String(error),...(error?.issues?{issues:error.issues}:{}),...(error?.details?{details:error.details}:{})});
const reasonText=entry=>typeof entry==='string'?entry:entry?.reason??entry?.message??entry?.code??'';
const reasonsText=entries=>(entries??[]).map(reasonText).filter(Boolean).join(' / ');
const stateOf=state=>state?.status??state?.state??'CONFIGURED';
const activeTarget=()=>host?.inspect().activeTarget??null;
const assetRequirements=()=>$('require-assets').checked?[...new Map([...requiredAssetBindings,...selectedAssets.map(file=>({id:file.name,name:file.name,size:file.size,lastModified:file.lastModified,role:'owner-asset',reselectRequired:true}))].map(binding=>[binding.id,binding])).values()]:[];
const ownerConfiguration=()=>({operations:['copy'],budgetBytes:Number($('budget-bytes').value),files:selectedAssets,requiredFiles:assetRequirements().map(binding=>binding.id)});
const behaviorConfiguration=()=>({mode:$('reference-mode').value==='release-fail'?'success':$('reference-mode').value,releaseFailures:$('reference-mode').value==='release-fail'?1:0});
const settings=()=>({inputRef:$('input-ref').value,profileText:$('profile-json').value,loraEnabled:$('lora-enabled').checked,budgetBytes:Number($('budget-bytes').value),referenceMode:$('reference-mode').value,requireAssets:$('require-assets').checked,tensorBindings:fileBindings});
const selections=()=>({loraEnabled:$('lora-enabled').checked});
const needsReselection=()=>assetRequirements().some(binding=>!selectedAssets.some(file=>file.name===binding.id));

function status(message,state){$('status').textContent=message;if(state)$('status').dataset.state=state;}
function showError(error){errorRecord=errorJson(error);$('error-details').textContent=asJson(errorRecord);status(`${errorRecord.code}: ${errorRecord.message}`,'ERROR');}
function clearError(){errorRecord=null;$('error-details').textContent='なし';}
function updateFileStatus(){
 const entries=Object.entries(fileBindings);
 $('file-status').dataset.reselectionRequired=String(needsReselection());
 if(!entries.length){$('file-status').textContent='入力Fileを選択してください。';return;}
 $('file-status').textContent=entries.map(([ref,b])=>`${ref}: ${b.name} (${b.size.toLocaleString()} bytes)${b.durable?' — 保存payloadから復旧済み（元のFile参照は失効）':' — このページで選択済み'}`).join('\n')+(needsReselection()?'\nownerの必須資材である追加Fileを再選択してください。':'');
}
function updateButtons(){
 const disposed=host?.inspect().disposed===true;
 const available=Boolean(host)&&configured&&!applying&&!disposed;
 $('configure').disabled=!host||applying||disposed;
 $('query').disabled=!available||running;
 $('run').disabled=!available||running||needsReselection();
 $('retry').disabled=!available||running||needsReselection();
 $('cancel').disabled=!running||!activeTarget();
 $('recover').disabled=!host||running||applying||disposed;
 $('dispose').disabled=!host||running||applying||disposed;
 $('continue-run').disabled=!running||!['delay','cancel-late'].includes(owner?.inspect().behavior?.mode);
 const outputRefs=Object.keys(host?.exportArtifacts?.()??{}).filter(ref=>!Object.hasOwn(fileBindings,ref));
 $('save-partial').disabled=!host||!outputRefs.length||applying;
 $('save-final').disabled=!host||lastResult?.status!=='COMPLETED'||running||applying;
}
function renderSteps(state){
 const rows=Object.keys(state?.steps??{}).length?state.steps:lastQuery?.steps??[];
 const entries=Array.isArray(rows)?rows:Object.entries(rows).map(([stepId,value])=>({stepId,...value}));
 const body=$('step-list');body.replaceChildren();
 if(!entries.length){const row=body.insertRow();const cell=row.insertCell();cell.colSpan=3;cell.textContent='設定適用後に表示します。';return;}
 for(const step of entries){
  const row=body.insertRow();row.dataset.stepId=step.stepId??'';row.dataset.state=stateOf(step);
  row.insertCell().textContent=step.stepId??'';
  row.insertCell().textContent=stateOf(step);
  row.insertCell().textContent=reasonsText(step.reasons??step.support?.reasons??(step.error?[step.error]:[]));
 }
}
function download(bytes,filename,type='application/zip'){
 const blob=bytes instanceof Blob?bytes:new Blob([bytes],{type});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function sameNativeValue(a,b){
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)||a instanceof ArrayBuffer||b instanceof ArrayBuffer){
  if(a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;
  const x=a instanceof ArrayBuffer?new Uint8Array(a):new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=b instanceof ArrayBuffer?new Uint8Array(b):new Uint8Array(b.buffer,b.byteOffset,b.byteLength);
  return x.every((value,index)=>value===y[index]);
 }
 const keys=Object.keys(a),other=Object.keys(b);
 return Array.isArray(a)===Array.isArray(b)&&keys.length===other.length&&keys.every(key=>Object.hasOwn(b,key)&&sameNativeValue(a[key],b[key]));
}
async function encodeNativeWithoutLoss(tensor){
 const original=structuredClone(tensor),bytes=await codec.encode(original),restored=await codec.decode(bytes);
 // A native codec may add its own header fields. Every original field,
 // including optional metadata and exact payload bytes, must survive.
 const lost=Object.keys(original).filter(key=>!Object.hasOwn(restored,key)||!sameNativeValue(original[key],restored[key]));
 if(lost.length)throw Object.assign(Error('単体tensor保存では情報を保持できません。部分・最終bundleで保存してください。'),{code:'NATIVE_SAVE_METADATA_LOSS',details:{fieldPaths:lost.map(key=>'/'+key.replaceAll('~','~0').replaceAll('/','~1'))}});
 return bytes;
}
function renderOutputs(){
 const artifacts=host?.exportArtifacts?.()??{},list=$('output-list');list.replaceChildren();
 const outputRefs=Object.keys(artifacts).filter(ref=>!Object.hasOwn(fileBindings,ref));
 if(!outputRefs.length){const li=document.createElement('li');li.textContent='保存できる出力はまだありません。';list.append(li);return;}
 for(const ref of outputRefs){
  const record=artifacts[ref],tensor=record.tensor??{},li=document.createElement('li');li.dataset.artifactRef=ref;li.dataset.shape=JSON.stringify(tensor.shape??record.descriptor?.tensor?.shape??[]);li.dataset.dtype=tensor.dtype??record.descriptor?.tensor?.dtype??'';
  const bytes=tensor.data?.byteLength??0;li.textContent=`${ref} — ${li.dataset.dtype} ${li.dataset.shape} / ${bytes.toLocaleString()} bytes`;
  const button=document.createElement('button');button.type='button';button.textContent='tensorを保存';button.addEventListener('click',()=>runAction(async()=>{download(await encodeNativeWithoutLoss(tensor),`${ref.replace(/[^a-zA-Z0-9_-]/g,'_')}.wktensor`,'application/octet-stream');status(`${ref} を保存しました。`,'SAVED');}));li.append(button);list.append(li);
 }
}
function render(event){
 latestState=event?.state??host?.inspect()??{};
 $('owner-state').textContent=asJson(latestState);
 $('reference-state').textContent=asJson(owner?.inspect()??{});
 renderSteps(latestState);renderOutputs();updateButtons();
 const steps=Array.isArray(latestState.steps)?latestState.steps:Object.values(latestState.steps??{}),completed=steps.filter(step=>['COMPLETED','BYPASSED','SKIPPED'].includes(stateOf(step))).length;
 $('progress').max=Math.max(1,steps.length);$('progress').value=completed;
 if(event?.type==='progress'){
  const progress=event.progress??{};status(`${event.stepId??''}: ${progress.message??progress.phase??'実行中'}`,'RUNNING');
 }
}
async function runAction(action){try{await action();}catch(error){showError(error);}finally{render();}}
function parseProfile(){const input=JSON.parse($('profile-json').value);return input.profile??input;}
async function configure(){
 applying=true;clearError();status('設定と現在のowner能力を確認しています。','CONFIGURING');updateButtons();
 try{
  const profile=parseProfile(),budget=Number($('budget-bytes').value);if(!Number.isSafeInteger(budget)||budget<0)throw Object.assign(Error('対応容量は0以上の整数bytesで指定してください。'),{code:'INVALID_BUDGET'});
  owner.controls.setBehavior(behaviorConfiguration());
  await host.reconfigureOwner(ownerId,ownerConfiguration());
  await host.configure({profile,externalInputs:records,selections:selections()});
  configured=true;configurationSerial++;lastResult=null;
  $('configuration-status').textContent=`設定 ${configurationSerial} を適用しました。構成の変更により、以前の実行結果の採用とcacheは失効します。`;
  status(needsReselection()?'保存payloadを読み込みました。再実行には元のFileを再選択してください。':'設定を適用しました。実行能力を確認できます。','CONFIGURED');
 }finally{applying=false;updateButtons();}
}
async function query(){
 clearError();lastQuery=await host.query();$('control-details').textContent=asJson({query:lastQuery,...flags});
 renderSteps(lastQuery);status(`能力照会: ${lastQuery.status}${reasonsText(lastQuery.reasons)?` — ${reasonsText(lastQuery.reasons)}`:''}`,lastQuery.status);
}
async function execute(){
 if(needsReselection())throw Object.assign(Error('元の入力Fileを再選択してください。保存payloadだけではFileの選択確認を復元しません。'),{code:'FILE_RESELECTION_REQUIRED'});
 clearError();running=true;lastResult=null;status('pipelineを実行しています。','RUNNING');updateButtons();
 try{
  const result=await host.execute();lastResult=result;
  $('control-details').textContent=asJson({query:lastQuery,result,...flags});
  status(`実行結果: ${result.status}${reasonsText(result.reasons)?` — ${reasonsText(result.reasons)}`:''}`,result.status);
 }finally{running=false;updateButtons();}
}
async function loadTensor(file){
 if(!file)return;const ref=$('input-ref').value.trim();if(!ref)throw Object.assign(Error('入力参照を指定してください。'),{code:'INPUT_REF_REQUIRED'});
 const tensor=await codec.decode(new Uint8Array(await file.arrayBuffer()));
 const descriptor=createReferenceDescriptor('copy',tensor).artifact;
 records[ref]={descriptor,tensor,fileBinding:{ref,name:file.name,size:file.size,type:file.type,lastModified:file.lastModified,durable:false}};
 fileBindings[ref]={...records[ref].fileBinding};updateFileStatus();
 if(configured)await host.configure({profile:parseProfile(),externalInputs:records,selections:selections()});
 configured=false;lastResult=null;$('configuration-status').textContent='Fileを変更しました。設定を適用してください。';status(`${ref} の入力Fileを読み込みました。shape ${JSON.stringify(tensor.shape)}`,'INPUT_LOADED');updateButtons();
}
async function saveBundle(kind){
 const bundle=await buildManagementBundle({state:{...host.exportState(),workspaceSettings:settings(),saveKind:kind},artifacts:host.exportArtifacts(),fileRequirements:assetRequirements(),registry:owner.getRegistry(),kind});
 const bytes=bundle.bytes;download(bytes,`management-${kind}.zip`);$('saved-state').textContent=`${kind==='final'?'最終':'部分'}bundleを保存しました。tensorはpayloadから復旧できます。ownerが必要とする追加Fileは、読戻し後に再選択してください。`;status('bundleを保存しました。','SAVED');
}
async function loadBundle(file){
 if(!file)return;const restored=await readManagementBundle(new Uint8Array(await file.arrayBuffer()),{registry:owner.getRegistry()});
 const savedSettings=restored.state?.workspaceSettings??{};
 if(savedSettings.profileText)$('profile-json').value=savedSettings.profileText;
 if(savedSettings.inputRef)$('input-ref').value=savedSettings.inputRef;
 if(savedSettings.budgetBytes!==undefined)$('budget-bytes').value=String(savedSettings.budgetBytes);
 if(savedSettings.referenceMode)$('reference-mode').value=savedSettings.referenceMode;
 $('lora-enabled').checked=savedSettings.loraEnabled===true;
 $('require-assets').checked=savedSettings.requireAssets===true;
 const state=restored.state??{},loaded=restored.artifacts??restored.records??{};
 fileBindings=Object.fromEntries(Object.entries(savedSettings.tensorBindings??{}).map(([ref,binding])=>[ref,{...binding,durable:true}]));
 records=Object.fromEntries(Object.entries(loaded).filter(([ref])=>(state.profile?.externalArtifactRefs??[]).includes(ref)));
 requiredAssetBindings=restored.fileRequirements??[];
 selectedAssets=[];$('tensor-file').value='';$('asset-files').value='';$('asset-status').textContent='追加のFileは保存bundleから復元されません。必要なら再選択してください。';
 owner.controls.setBehavior(behaviorConfiguration());await host.reconfigureOwner(ownerId,ownerConfiguration());
 await host.restore(restored.restore);
 configured=true;lastResult=null;lastQuery=null;updateFileStatus();
 $('saved-state').textContent=`${file.name} のpayload・descriptor・snapshot・設定を読戻しました。保存済みtensorは再利用できます。元の追加Fileの選択権限は復元されません。`;
 $('configuration-status').textContent=needsReselection()?'保存設定を復旧しました。必須の追加Fileを再選択して設定を適用してください。':'保存設定とdurable tensorを復旧しました。再実行できます。';status(needsReselection()?'bundleの読戻しが完了しました。必須の追加Fileを再選択してください。':'bundleの読戻しが完了しました。tensorは保存payloadから再実行できます。','RESTORED');
}

$('configure').addEventListener('click',()=>runAction(configure));
$('query').addEventListener('click',()=>runAction(query));
$('run').addEventListener('click',()=>runAction(execute));
$('retry').addEventListener('click',()=>runAction(execute));
$('cancel').addEventListener('click',()=>runAction(async()=>{const target=activeTarget();if(!target)return;status('対象の実行を取り消し、元のPromiseと解放の終端を待っています。','CANCELLING');await host.cancel(target);status('取消の終端を確認しました。','CANCELLED');}));
$('recover').addEventListener('click',()=>runAction(async()=>{status('ownerに停止と解放の再試行を依頼しています。','RECOVERING');const result=await host.recover(ownerId);$('control-details').textContent=asJson({recovery:result,...flags});status('解放の再試行が完了しました。','RECOVERED');}));
$('dispose').addEventListener('click',()=>runAction(async()=>{status('ownerの停止と解放を待っています。','DISPOSING');await host.dispose();status('管理とownerの解放が完了しました。再利用する場合はページを読み直してください。','DISPOSED');}));
$('continue-run').addEventListener('click',()=>runAction(async()=>{owner.controls.continueInvocation();status('現在遅延していた実行を継続します。','RUNNING');}));
$('tensor-file').addEventListener('change',event=>runAction(()=>loadTensor(event.target.files[0])));
$('pipeline-file').addEventListener('change',event=>runAction(async()=>{const file=event.target.files[0];if(!file)return;const value=JSON.parse(await file.text());$('profile-json').value=JSON.stringify(value.profile??value,null,2);configured=false;lastResult=null;status(`${file.name} のpipeline設定を読み込みました。設定を適用してください。`,'PIPELINE_LOADED');}));
$('asset-files').addEventListener('change',event=>runAction(async()=>{selectedAssets=Array.from(event.target.files);$('asset-status').textContent=selectedAssets.length?selectedAssets.map(f=>`${f.name} (${f.size.toLocaleString()} bytes)`).join(' / '):'追加のFileは選択されていません。';updateFileStatus();if(configured)await host.reconfigureOwner(ownerId,ownerConfiguration());configured=false;status('ローカルFile選択を変更しました。設定を適用してください。','INPUT_CHANGED');}));
for(const id of ['budget-bytes','reference-mode','require-assets','profile-json'])$(id).addEventListener('change',()=>{configured=false;lastResult=null;updateFileStatus();$('configuration-status').textContent='設定を編集しました。適用後に次の実行へ反映します。';updateButtons();});
$('lora-enabled').addEventListener('change',()=>runAction(async()=>{if(!host||!configured)return;await host.setSelections(selections());lastResult=null;status('選択変更を反映し、以前の結果を失効しました。','SELECTION_CHANGED');}));
$('save-partial').addEventListener('click',()=>runAction(()=>saveBundle('partial')));
$('save-final').addEventListener('click',()=>runAction(()=>saveBundle('final')));
$('bundle-file').addEventListener('change',event=>runAction(()=>loadBundle(event.target.files[0])));

try{
 owner=await createReferenceOwner({ownerId,configuration:ownerConfiguration(),behavior:behaviorConfiguration()});
 host=createManagementHost({owners:{[ownerId]:owner}});unsubscribe=host.subscribe(render);render();status('入力Fileを選び、設定を適用してください。','READY_FOR_INPUT');
}catch(error){showError(error);}
// Explicitly dispose the owner when leaving; the browser may end pending work
// before asynchronous cleanup finishes, so restored Files are never live handles.
addEventListener('pagehide',()=>{unsubscribe?.();void host?.dispose().catch(()=>{});},{once:true});

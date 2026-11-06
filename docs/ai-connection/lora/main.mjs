import {createLoraManagementSide} from '../../shared/ai-connection/adapters/lora-standalone/adapter.mjs';
import {createLoraManagement} from '../../shared/ai-connection/adapters/lora-standalone/management.mjs';
import {createReferenceSide} from '../../shared/ai-connection/adapters/lora-standalone/reference.mjs';
import {createLoraDirectoryStorage} from '../../shared/ai-connection/adapters/lora-standalone/storage.mjs';
import {sha256Bytes} from '../../shared/ai-connection/canonical.mjs';

const $=id=>document.getElementById(id),names=['HIGH','LOW'],pairs=['light','detail'];
const sides=Object.fromEntries(names.map(side=>[side,{side,id:side.toLowerCase(),files:{},backing:null,adapter:null,unsubscribe:null,busy:false,planHandle:null,preparedHandle:null,history:[],lease:null,leaseBacking:null,saved:null,directory:null,retired:[],configurationRevision:0}]));
let manager=null,managerUnsubscribe=null,batchBusy=false,ending=false,ended=false;
const flags={graphBinding:'UNBOUND',generationReady:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};
const errorRecord=e=>({code:e?.code??e?.name??'ERROR',message:e?.message??String(e),...(e instanceof AggregateError?{errors:e.errors.map(errorRecord)}:{})});
const json=value=>JSON.stringify(value,(_,v)=>typeof v==='function'?undefined:typeof v==='bigint'?v.toString():ArrayBuffer.isView(v)?{type:v.constructor.name,byteLength:v.byteLength}:v,2);
const el=(s,name)=>$(s.id+'-'+name);
const status=(text,state)=>{$('status').textContent=text;$('status').dataset.state=state;};
const sideStatus=(s,text,state)=>{el(s,'status').textContent=text;el(s,'status').dataset.state=state;};
const showError=(e,s)=>{const value=errorRecord(e);$('error-details').textContent=json(value);if(s)sideStatus(s,value.code+': '+value.message,s.cancelRequested&&!s.adapter?.inspect().recoveryRequired?'CANCELLED':'ERROR');else status(value.code+': '+value.message,'ERROR');};
const selections=s=>pairs.filter(pair=>el(s,pair+'-enabled').checked).map(pair=>{const strength=Number(el(s,pair+'-strength').value);if(!Number.isFinite(strength))throw Object.assign(Error('強度は有限の数で指定してください。'),{code:'INVALID_STRENGTH'});return {pairId:pair,strength};});
const behavior=s=>({mode:el(s,'mode').value==='release-fail'?'success':el(s,'mode').value,releaseFailures:el(s,'mode').value==='release-fail'?1:0});
const savedKey=s=>'works:lora-management:last-save:'+s.side;

function buildPanels(){for(const s of Object.values(sides)){const fragment=$('side-template').content.cloneNode(true);fragment.querySelector('[data-label=side-title]').textContent=s.side;for(const node of fragment.querySelectorAll('[data-id]')){node.id=s.id+'-'+node.dataset.id;delete node.dataset.id;}for(const node of fragment.querySelectorAll('[data-for]')){node.htmlFor=s.id+'-'+node.dataset.for;delete node.dataset.for;}fragment.querySelector('[data-label=side-mode]').id=s.id+'-side-mode';$('side-panels').append(fragment);}}
function remember(s,target){if(target&&!s.history.some(v=>v.requestId===target.requestId))s.history.push(structuredClone(target));}
function render(s){
 const state=s.adapter?.inspect()??null,active=state?.activeTarget??null;remember(s,active);
 el(s,'state').textContent=json({...(state??{side:s.side,loaded:false}),ui:{planHandle:s.planHandle,preparedHandle:s.preparedHandle,configurationRevision:s.configurationRevision,retiredBackingCount:s.retired.length},...flags});
 el(s,'reference-state').textContent=json(s.backing?.inspect()??{side:s.side,loaded:false});
 el(s,'identities').textContent=state?`管理 revision ${state.managerRevision} ／ SDK revision ${state.sdk?.localRevision??'?'} ／ consumer epoch ${state.consumerEpoch??'?'} ／ ${state.resourceBinding?.resourceGeneration??''}`:'SDK revision・管理revision・consumer epochは別々に記録します。';
 el(s,'side-mode').textContent=state?.disposed?'SDK終了':state?.recoveryRequired?'回復待ち':s.backing?'開発用base / consumer':'未起動';
 const unavailable=ending||batchBusy||s.busy||Boolean(active),disposed=state?.disposed===true;
 for(const name of ['register','query','apply','restore','compose','open-saved','open-files','choose-directory'])el(s,name).disabled=unavailable;
 el(s,'prepare').disabled=unavailable||!s.planHandle||disposed;
 el(s,'stage').disabled=unavailable||!s.preparedHandle||disposed;
 el(s,'release').disabled=unavailable||!state?.prepared?.length||disposed;
 el(s,'save').disabled=unavailable||!s.preparedHandle||disposed;
 el(s,'cancel').disabled=ending||!active;
 el(s,'recover').disabled=unavailable||!s.adapter||disposed;
 el(s,'dispose').disabled=ending||batchBusy||!s.backing;
 el(s,'dispose-sdk').disabled=ending||batchBusy||!s.adapter||disposed;
 el(s,'continue').disabled=!s.backing||!(s.backing.controls.stats().waiting||active&&el(s,'mode').value==='delay');
 el(s,'read-active').disabled=ending||!s.backing||Boolean(active);
 el(s,'capture-lease').disabled=ending||!s.backing||Boolean(active)||!!s.lease;
 el(s,'read-lease').disabled=ending||!s.lease;
 el(s,'release-lease').disabled=ending||!s.lease;
 el(s,'cancel-old').disabled=ending||!s.adapter||!s.history.some(t=>t.requestId!==active?.requestId);
 $('batch-apply').disabled=ending||batchBusy||Object.values(sides).some(x=>x.busy||x.adapter?.inspect().activeTarget);
 $('batch-recover').disabled=ending||batchBusy||!manager?.inspect().recoveryRequired||Object.values(sides).some(x=>x.busy||x.adapter?.inspect().activeTarget);
 $('dispose-all').disabled=ending;
 // Owner hooks can wait without emitting a progress event. Observe active
 // control state for the view only; this timer never settles native work.
 if((s.busy||active)&&!s.refreshTimer)s.refreshTimer=setTimeout(()=>{s.refreshTimer=null;render(s);},100);
 else if(!s.busy&&!active&&s.refreshTimer){clearTimeout(s.refreshTimer);s.refreshTimer=null;}
 if(ended)for(const button of document.querySelectorAll('main button'))button.disabled=true;
}
function renderAll(){for(const s of Object.values(sides))render(s);if(manager)$('batch-state').textContent=json(manager.inspect());}
function observe(s){s.unsubscribe?.();s.unsubscribe=s.adapter.subscribe(event=>{remember(s,event.target);render(s);if(event.type==='progress'){$('progress').value=event.progress?.bytesHashed??0;$('progress').max=Math.max(1,event.progress?.totalBytes??1);sideStatus(s,`${event.operation}: ${event.progress?.phase??'処理中'}`,'BUSY');}});}
async function attach(s,backing){
 const adapter=await createLoraManagementSide({side:s.side,registry:backing.registry,baseProvider:backing.baseProvider,consumer:backing.consumer,kernel:backing.kernel,cache:backing.cache});
 s.backing=backing;s.adapter=adapter;observe(s);
 if(!manager){manager=createLoraManagement({sides:{[s.side]:adapter}});managerUnsubscribe=manager.subscribe(event=>{$('batch-state').textContent=json(event.state??manager.inspect());});}
 else await manager.replaceSide({side:s.side,adapter});
 renderAll();return s;
}
async function ensureSide(s){if(s.adapter&&!s.adapter.inspect().disposed)return s;if(s.backing){s.unsubscribe?.();s.retired.push(s.backing);s.backing=null;s.adapter=null;}return attach(s,await createReferenceSide({side:s.side,behavior:behavior(s)}));}
async function freshSide(s){
 if(s.adapter){s.backing?.controls.continue();await s.adapter.dispose();s.unsubscribe?.();s.retired.push(s.backing);s.adapter=null;s.backing=null;}
 s.planHandle=null;s.preparedHandle=null;
 return attach(s,await createReferenceSide({side:s.side,behavior:behavior(s)}));
}
async function call(s,operation,args={}){await ensureSide(s);const result=await manager.run({side:s.side,operation,args});return result.result??result;}
function handles(s,result){remember(s,result?.target);if(result?.planHandle)s.planHandle=result.planHandle;if(result?.preparedHandle)s.preparedHandle=result.preparedHandle;return result;}
async function action(s,fn){try{$('error-details').textContent='なし';await fn();}catch(e){showError(e,s);}finally{renderAll();}}
async function operation(s,label,state,fn){s.busy=true;s.cancelRequested=false;$('progress').removeAttribute('value');sideStatus(s,label,'BUSY');renderAll();try{const result=await fn();handles(s,result);sideStatus(s,`${label}が完了しました。`,state);return result;}finally{s.busy=false;$('progress').max=1;$('progress').value=1;renderAll();}}
async function cancel(s){if(!s.adapter)return;const target=s.adapter.inspect().activeTarget;if(!target)return;s.cancelRequested=true;sideStatus(s,'対象を取り消し、元の処理と解放の終端を待っています。','CANCELLING');const result=await s.adapter.cancel(target);sideStatus(s,result.reusable?'取消の終端と再利用可能な状態を確認しました。':'取消の終端を確認しました。再利用前に回復が必要です。',result.reusable?'CANCELLED':'RECOVERY_REQUIRED');return result;}
async function settingChanged(s){s.configurationRevision++;s.planHandle=null;s.preparedHandle=null;const target=s.adapter?.inspect().activeTarget;if(target)await cancel(s);sideStatus(s,'選択を変更しました。新しい組合せを適用してください。','CONFIGURATION_CHANGED');renderAll();}
async function register(s){return operation(s,'選択Fileの登録','REGISTERED',async()=>{await ensureSide(s);const selected=pairs.filter(pair=>s.files[pair]);if(!selected.length)throw Object.assign(Error('このsideで登録する.safetensorsを選択してください。組合せなしのbase復帰にFileは不要です。'),{code:'LOCAL_FILE_REQUIRED'});const results=[];for(const pairId of selected){const result=await call(s,'register',{pairId,file:s.files[pairId]});handles(s,result);results.push(result);}s.planHandle=null;s.preparedHandle=null;return {results};});}
async function apply(s){return operation(s,'現在の組合せの適用','APPLIED',async()=>{await ensureSide(s);s.backing.controls.setBehavior(behavior(s));return call(s,'apply',{selections:selections(s),targets:s.backing.targets});});}
async function restore(s){return operation(s,'baseへの復帰','RESTORED',async()=>{await ensureSide(s);s.backing.controls.setBehavior(behavior(s));return call(s,'restoreBase');});}
async function recover(s){return operation(s,'回復','RECOVERED',async()=>{await ensureSide(s);return s.adapter.recover();});}

async function storageRoot(){if(!navigator.storage?.getDirectory)throw Object.assign(Error('このブラウザはOPFSに対応していません。保存先フォルダを選択してください。'),{code:'OPFS_UNAVAILABLE'});return (await navigator.storage.getDirectory()).getDirectoryHandle('works-lora-management',{create:true});}
async function saveStorage(s){const name=`${s.side.toLowerCase()}-${Date.now()}-${crypto.randomUUID()}`,root=s.directory??await (await storageRoot()).getDirectoryHandle(s.side,{create:true}),directory=await root.getDirectoryHandle(name,{create:true});return {storage:createLoraDirectoryStorage(directory),directory,name,kind:s.directory?'selected-directory':'opfs'};}
async function save(s){return operation(s,'実payloadのstream保存','SAVED',async()=>{
 if(!s.preparedHandle)throw Object.assign(Error('現在の組合せを適用するか、packageを準備してください。'),{code:'PREPARED_HANDLE_REQUIRED'});
 const destination=await saveStorage(s),result=await call(s,'save',{preparedHandle:s.preparedHandle,writer:destination.storage.writer});
 const state={schemaVersion:'works-lora-ui-state/1',side:s.side,selections:selections(s),targets:s.backing.targets,snapshot:s.adapter.inspect().snapshot,graphBinding:'UNBOUND',generationReady:false};await destination.storage.writeManagementState(state);
 s.saved={storage:destination.storage,location:{kind:destination.kind,side:s.side,name:destination.name}};
 if(destination.kind==='opfs')localStorage.setItem(savedKey(s),JSON.stringify(s.saved.location));
 el(s,'save-state').textContent=json({location:s.saved.location,manifest:result.manifest,nativeReceipt:result.nativeReceipt,managementAcknowledgement:result.managementAcknowledgement,managementState:state,actualPayloadSaved:true,runtimeAuthorityRestored:false});el(s,'storage-state').textContent=`保存先: ${destination.kind==='opfs'?'ブラウザ専用保存領域':'選択したフォルダ'} / ${destination.name}`;el(s,'save-message').textContent='実payloadとmanifestの保存が完了しました。読戻しは新しいSDKで行います。';return result;
 });}
async function reopen(s,{manifest,sources},location){return operation(s,'新SDKでのpackage読戻し','OPENED',async()=>{await freshSide(s);const result=await call(s,'openPackage',{manifest,sources});handles(s,result);for(const pair of pairs){s.files[pair]=null;el(s,pair+'-file').value='';el(s,pair+'-enabled').checked=false;el(s,pair+'-file-state').textContent='未選択';}for(const a of result.manifest.adapters){if(!pairs.includes(a.pairId))continue;const source=result.manifest.sources.find(d=>d.sourceId===a.sourceId),file=source?sources.get(source.fileName):null;el(s,a.pairId+'-enabled').checked=true;el(s,a.pairId+'-strength').value=String(a.plan.strength);if(file){s.files[a.pairId]=file;el(s,a.pairId+'-file-state').textContent=`保存payload: ${file.name} / ${file.size.toLocaleString()} bytes`;}}el(s,'save-state').textContent=json({location,manifest:result.manifest,nativeReceipt:result.nativeReceipt,managementAcknowledgement:result.managementAcknowledgement,actualPayloadRead:true,freshSdkInstanceId:s.adapter.inspect().sdk?.sdkInstanceId??result.managementAcknowledgement?.sdkInstanceId??result.nativeReceipt?.sdkInstanceId,runtimeAuthorityRestored:false});el(s,'save-message').textContent='実payloadを検査し、新しいSDKで開きました。「準備packageを適用」で再適用できます。強度を変更する場合は、先に「選択Fileを登録」で保存payloadを登録してください。';return result;});}
async function openSaved(s){
 let storage=s.saved?.storage,location=s.saved?.location;
 if(!storage){let saved;try{saved=JSON.parse(localStorage.getItem(savedKey(s))??'null');}catch{}if(!saved||saved.kind!=='opfs'||saved.side!==s.side||typeof saved.name!=='string'||saved.name.includes('/')||saved.name.includes('\\'))throw Object.assign(Error('このsideのブラウザ保存がありません。保存manifestとpayloadを選択して開くこともできます。'),{code:'SAVED_PACKAGE_UNAVAILABLE'});const root=await (await storageRoot()).getDirectoryHandle(s.side),directory=await root.getDirectoryHandle(saved.name);storage=createLoraDirectoryStorage(directory);location=saved;s.saved={storage,location};}
 const pkg=await storage.readPackage();return reopen(s,pkg,location);
}
async function openFiles(s){const manifestFile=el(s,'manifest-file').files[0];if(!manifestFile)throw Object.assign(Error('保存manifest.jsonを選択してください。'),{code:'MANIFEST_FILE_REQUIRED'});const manifest=JSON.parse(await manifestFile.text()),sources=new Map(Array.from(el(s,'payload-files').files,file=>[file.name,file]));return reopen(s,{manifest,sources},{kind:'selected-files',manifestName:manifestFile.name,payloadNames:[...sources.keys()]});}

async function read(s,held=false){
 if(!s.backing)throw Object.assign(Error('このsideはまだ起動していません。'),{code:'SIDE_NOT_LOADED'});
 const view=held?s.lease:s.backing.consumer.capture(),backing=held?s.leaseBacking:s.backing;
 if(!view)throw Object.assign(Error('読取りleaseを保持してください。'),{code:'READ_LEASE_REQUIRED'});
 try{const target=backing.registry.targets.find(t=>t.key===backing.targets[0].key),cols=target.fullShape.length===2?target.fullShape[1]:1,offset=backing.targets[0].slice.startRow*cols,count=backing.targets[0].slice.rowCount*cols;const data=await view.readBlock(target.weightId,offset,count,{fullShape:target.fullShape,side:s.side});const result={readSequence:s.readSequence=(s.readSequence??0)+1,epoch:view.epoch,packageHash:view.packageHash,weightId:target.weightId,fullShape:target.fullShape,offset,count,dtype:'F32',layout:'row-major',firstValues:Array.from(data.subarray(0,4)),byteLength:data.byteLength,sha256:await sha256Bytes(new Uint8Array(data.buffer,data.byteOffset,data.byteLength)),leaseHeld:held,referenceResources:backing.inspect()};el(s,'lease-state').textContent=json(result);return result;}finally{if(!held)await view.release();render(s);}
}
async function disposeSide(s,{sdkOnly=false}={}){
 s.backing?.controls.continue();if(s.adapter)await s.adapter.dispose();s.planHandle=null;s.preparedHandle=null;
 if(!sdkOnly){if(s.lease){await s.lease.release();s.lease=null;s.leaseBacking=null;}for(const backing of [...s.retired,s.backing].filter(Boolean)){backing.controls.continue();await backing.disposeBacking();}s.retired=[];}
 sideStatus(s,sdkOnly?'SDKを終了しました。consumerのactive/read leaseとbaseは、そのownerが保持します。':'このsideのSDK・consumer・参照資源を終了しました。',sdkOnly?'SDK_DISPOSED':'DISPOSED');renderAll();
}
async function batchApply(){batchBusy=true;status('選択したsideを順に適用しています。','BUSY');renderAll();try{const selected=names.filter(side=>$('batch-'+side.toLowerCase()).checked);if(!selected.length)throw Object.assign(Error('一括操作するsideを選択してください。'),{code:'BATCH_SIDE_REQUIRED'});for(const side of selected){const s=sides[side];await ensureSide(s);s.backing.controls.setBehavior(behavior(s));}const result=await manager.applyBatch({selectionsBySide:Object.fromEntries(selected.map(side=>[side,selections(sides[side])])),targetsBySide:Object.fromEntries(selected.map(side=>[side,sides[side].backing.targets]))});for(const side of selected){const s=sides[side],state=s.adapter.inspect();const handle=state.prepared.at(-1)?.preparedHandle;if(handle)s.preparedHandle=handle;sideStatus(s,state.recoveryRequired?'このsideは回復が必要です。':'一括操作の結果を確認してください。',state.recoveryRequired?'RECOVERY_REQUIRED':result.status==='BATCH_COMPLETED'?'APPLIED':'BATCH_FAILED');}status(result.status==='BATCH_COMPLETED'?'選択した全sideの適用が完了しました。':'一括操作は完了していません。sideごとの状態を確認し、回復してください。',result.status);$('batch-state').textContent=json(result);return result;}finally{batchBusy=false;renderAll();}}
async function batchRecover(){if(!manager)throw Object.assign(Error('回復する管理instanceがありません。'),{code:'MANAGEMENT_NOT_LOADED'});batchBusy=true;status('SDKを回復し、新しい取引でbaseへ戻しています。','BUSY');renderAll();try{for(const s of Object.values(sides))if(s.backing)s.backing.controls.setBehavior({mode:'success',releaseFailures:0,rollbackFailures:0});const result=await manager.recoverBatch({strategy:'restoreBase'});for(const s of Object.values(sides))if(s.adapter){const state=s.adapter.inspect();s.preparedHandle=state.prepared.at(-1)?.preparedHandle??null;sideStatus(s,'回復結果を確認しました。元の失敗取引を成功へ変更していません。',result.status==='BASE_RECOVERED'?'RESTORED':'RECOVERY_REQUIRED');}status(result.status==='BASE_RECOVERED'?'新しい取引でbaseへの復帰を確認しました。':'回復は完了していません。sideごとの状態を確認してください。',result.status);$('batch-state').textContent=json(result);return result;}finally{batchBusy=false;renderAll();}}
async function disposeAll(){ending=true;status('SDKの終端と、consumer・lease・参照資源の解放を待っています。','BUSY');renderAll();try{for(const s of Object.values(sides))await disposeSide(s);await manager?.dispose();managerUnsubscribe?.();ended=true;status('全SDKと参照資源を終了しました。再利用する場合はページを読み直してください。','DISPOSED');}finally{ending=false;renderAll();}}

buildPanels();
for(const s of Object.values(sides)){
 for(const pair of pairs){el(s,pair+'-file').addEventListener('change',()=>action(s,async()=>{const file=el(s,pair+'-file').files[0];s.files[pair]=file??null;el(s,pair+'-enabled').checked=!!file;el(s,pair+'-file-state').textContent=file?`${file.name} / ${file.size.toLocaleString()} bytes`:'未選択';await settingChanged(s);}));for(const field of ['enabled','strength'])el(s,pair+'-'+field).addEventListener('change',()=>action(s,()=>settingChanged(s)));}
 el(s,'register').addEventListener('click',()=>action(s,()=>register(s)));
 el(s,'query').addEventListener('click',()=>action(s,()=>operation(s,'接続能力の照会','SUPPORTED',async()=>{const result=await call(s,'query');el(s,'state').textContent=json(result);if(result.dispatchSupported!==true)throw Object.assign(Error(result.reasons?.map(r=>r.reason).join(' / ')??'この要求は実行できません。'),{code:result.reasons?.[0]?.code??'UNSUPPORTED'});return result;})));
 el(s,'apply').addEventListener('click',()=>action(s,()=>apply(s)));
 el(s,'restore').addEventListener('click',()=>action(s,()=>restore(s)));
 el(s,'compose').addEventListener('click',()=>action(s,()=>operation(s,'合成planの作成','COMPOSED',async()=>{await ensureSide(s);return call(s,'compose',{selections:selections(s),targets:s.backing.targets});})));
 el(s,'prepare').addEventListener('click',()=>action(s,()=>operation(s,'packageの準備','PREPARED',()=>call(s,'prepare',{planHandle:s.planHandle}))));
 el(s,'stage').addEventListener('click',()=>action(s,()=>operation(s,'準備packageの適用','APPLIED',async()=>{await ensureSide(s);s.backing.controls.setBehavior(behavior(s));return call(s,'stage',{preparedHandle:s.preparedHandle});})));
 el(s,'cancel').addEventListener('click',()=>action(s,()=>cancel(s)));
 el(s,'recover').addEventListener('click',()=>action(s,()=>recover(s)));
 el(s,'release').addEventListener('click',()=>action(s,()=>operation(s,'保持している準備packageの解放','RELEASED',async()=>{let result;for(const p of s.adapter.inspect().prepared)result=await call(s,'release',{preparedHandle:p.preparedHandle});s.preparedHandle=null;return result;})));
 el(s,'dispose').addEventListener('click',()=>action(s,()=>disposeSide(s)));
 el(s,'dispose-sdk').addEventListener('click',()=>action(s,()=>disposeSide(s,{sdkOnly:true})));
 el(s,'save').addEventListener('click',()=>action(s,()=>save(s)));
 el(s,'open-saved').addEventListener('click',()=>action(s,()=>openSaved(s)));
 el(s,'open-files').addEventListener('click',()=>action(s,()=>openFiles(s)));
 el(s,'choose-directory').addEventListener('click',()=>action(s,async()=>{if(typeof showDirectoryPicker!=='function')throw Object.assign(Error('このブラウザでは保存先フォルダの選択を利用できません。OPFS保存を使えます。'),{code:'DIRECTORY_PICKER_UNAVAILABLE'});s.directory=await showDirectoryPicker({mode:'readwrite'});el(s,'storage-state').textContent=`保存先フォルダ: ${s.directory.name}。保存ごとに新しい子フォルダを作成します。`;}));
 el(s,'mode').addEventListener('change',()=>action(s,async()=>{s.backing?.controls.setBehavior(behavior(s));render(s);}));
 el(s,'continue').addEventListener('click',()=>action(s,async()=>{s.backing?.controls.continue();render(s);}));
 el(s,'read-active').addEventListener('click',()=>action(s,()=>read(s)));
 el(s,'capture-lease').addEventListener('click',()=>action(s,async()=>{if(!s.backing)throw Object.assign(Error('先にsideを起動してください。'),{code:'SIDE_NOT_LOADED'});s.lease=s.backing.consumer.capture();s.leaseBacking=s.backing;await read(s,true);}));
 el(s,'read-lease').addEventListener('click',()=>action(s,()=>read(s,true)));
 el(s,'release-lease').addEventListener('click',()=>action(s,async()=>{await s.lease?.release();s.lease=null;s.leaseBacking=null;el(s,'lease-state').textContent=json({leaseHeld:false,released:true});}));
 el(s,'cancel-old').addEventListener('click',()=>action(s,async()=>{const current=s.adapter?.inspect().activeTarget,target=s.history.find(t=>t.requestId!==current?.requestId);if(!target)throw Object.assign(Error('以前の対象がありません。'),{code:'OLD_TARGET_REQUIRED'});try{await s.adapter.cancel(target);throw Object.assign(Error('以前の対象が取消として受理されました。'),{code:'OLD_TARGET_ACCEPTED'});}catch(e){if(e.code!=='TARGET_MISMATCH')throw e;el(s,'lease-state').textContent=json({code:e.code,oldTarget:target,currentTarget:current,rejected:true});sideStatus(s,'古い対象の取消を拒否しました。後続の実行状態は変更しません。','OLD_TARGET_REJECTED');}}));
}
$('batch-apply').addEventListener('click',()=>action(null,batchApply));
$('batch-recover').addEventListener('click',()=>action(null,batchRecover));
$('dispose-all').addEventListener('click',()=>action(null,disposeAll));
renderAll();status('必要なsideのFileを選択し、登録してください。組合せなしのbase経路はFileなしで利用できます。','READY_FOR_FILE');
addEventListener('pagehide',()=>{for(const s of Object.values(sides)){s.backing?.controls.continue();void s.adapter?.dispose().catch(()=>{});}},{once:true});

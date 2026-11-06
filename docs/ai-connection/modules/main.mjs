const $=id=>document.getElementById(id);
const slots=['source','reference'];
const settingsFields=['prompt','negative-prompt','width','height','frames','noise-mode','text-manifest-mode','diffusion-threads',...['light','detail'].flatMap(pair=>['high','low'].map(side=>'lora-'+pair+'-'+side+'-strength'))];
const names={text:'Text Encoder',vae:'VAE'};
const stateLabels={unconfigured:'未読込',configuring:'モデル準備中',ready:'準備完了',running:'実行中',cancelling:'取消の終端を確認中',failed:'対処が必要',disposed:'終了',reloading:'再読込中',recovering:'復旧中','applying-lora':'LoRA適用中','removing-lora':'Baseへ復帰中'};
const phaseLabels={'text-configuration':'Text Encoderを準備しています。','vae-configuration':'VAEを準備しています。','diffusion-configuration':'Diffusionを準備しています。','model-load':'HIGH・LOWモデルを読み込んでいます。','model-unload':'モデルの解放を確認しています。','owner-support':'モデルの対応条件を確認しています。','prepare-media-source':'Sourceをモデル入力に準備しています。','prepare-media-reference':'Referenceをモデル入力に準備しています。',generation:'Text → 入力encode → Diffusion → 結果decodeを実行しています。','waiting-for-owner-terminal':'取消の終端と資源の解放を待っています。'};
let createController,mediaTools,controller,unsubscribe,view={},localBusy=false,localAbort=null,configurationDirty=true,loadedSelection=false,resultPreview=null,resultTensor=null,resultOrigin=null,resultRef=null;
const inputs={source:null,reference:null};

function fail(code,message){throw Object.assign(Error(message),{code});}
function status(message,state='READY'){$('status').textContent=message;$('status').dataset.state=state;}
function feedback(message){$('operation-feedback').textContent=message;}
function download(artifact,fallback){
 const blob=artifact?.blob??artifact;
 if(!(blob instanceof Blob))fail('SAVE_RESULT_INVALID','保存用のファイルが返されませんでした。');
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=artifact.filename??fallback;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function fileList(id){return Array.from($(id).files??[]);}
function fileSummary(files){return files.length?files.map(file=>file.webkitRelativePath||file.name).join('\n'):'未選択';}
function cleanupState(){
 if(view.disposed)return {cleanup:false,reload:false};
 const owner=view.owner??{},observation=owner.modules?.diffusion?.observation??{};
 return {cleanup:observation.cleanupRequired===true||(owner.recoveryOwners??[]).length>0||Object.values(owner.modules??{}).some(module=>/recovery-required|cleanup-required/.test(module.state??'')||module.observation?.cleanupRequired===true||module.observation?.recoveryRequired===true)||(owner.weightFeeds??[]).some(feed=>feed.cleanupRequired===true),reload:observation.reloadRequired===true||loadedSelection&&observation.loaded===false};
}
function render(){
 const {cleanup,reload}=cleanupState(),busy=localBusy||view.busy===true,disposed=view.disposed===true;
 const restorationRequired=view.restorationRequired===true||view.loraState==='restore-required';
 const ready=!!controller&&view.configured===true&&!configurationDirty&&!cleanup&&!reload&&!disposed&&!restorationRequired;
 $('state-badge').textContent=restorationRequired?'LoRAの復元が必要':cleanup?'解放・復旧が必要':reload?'モデル再読込が必要':stateLabels[view.state]??'準備中';
 $('configuration-state').textContent=configurationDirty?'選択を適用してください':ready?'読込済み':'未読込';
 $('configure').disabled=!createController||busy;
 $('run').disabled=busy||!ready;
 $('cancel').disabled=!busy||(!view.busy&&!localAbort);
 $('reload').disabled=!controller||busy||!loadedSelection||configurationDirty||disposed;
 $('recover').disabled=!controller||busy||disposed;
 $('dispose').disabled=!controller||busy||disposed;
 $('lora-apply').disabled=busy||!ready;
 $('lora-remove').disabled=busy||!controller||disposed||(!view.lora&&!restorationRequired);
 $('text-manifest').disabled=busy||$('text-manifest-mode').value!=='selected';
 $('noise-file').disabled=busy||$('noise-mode').value!=='file';
 $('model-state').textContent=restorationRequired?'LoRAの適用を確認できませんでした。「LoRAを外してBaseへ戻す」または「解放・復旧を再試行」を実行してください。':cleanup?'資源の解放確認が必要です。「解放・復旧を再試行」を実行してください。':reload?'取消などによりモデルが未読込になりました。「選択モデルを再読込」を実行してください。':disposed?'モデルを終了しました。再び使う場合は「モデルを準備・読込」を実行してください。':ready?'HIGH・LOWモデル読込済み。入力と生成条件を確認して実行してください。':'モデルを選択し、「モデルを準備・読込」を実行してください。';
 $('lora-state').textContent=restorationRequired?'適用未確認 · Baseへの復元が必要':view.lora?Object.entries(view.lora).map(([side,selections])=>`${side}: ${selections.map(item=>`${item.pairId} ${item.strength}`).join(' / ')}`).join(' · '):'Baseモデル';
 for(const slot of slots){const present=!!inputs[slot];for(const suffix of ['load','clear','export','tensor-save'])$(slot+'-'+suffix).disabled=!mediaTools||busy||(suffix!=='load'&&!present);$(slot+'-tensor-file').disabled=!mediaTools||busy;}
 $('result-export').disabled=busy||!resultPreview;$('result-image-save').disabled=busy||!resultPreview;
 $('result-tensor-save').disabled=busy||!resultTensor||view.disposed===true;
 $('result-tensor-file').disabled=!mediaTools||busy;
 $('save-workspace').disabled=!controller||busy||disposed;$('workspace-file').disabled=!createController||busy;
 for(const field of document.querySelectorAll('[aria-labelledby="models-heading"] input,[aria-labelledby="models-heading"] select,[aria-labelledby="lora-heading"] input,[aria-labelledby="generation-heading"] input:not(#seed),[aria-labelledby="generation-heading"] select,[aria-labelledby="generation-heading"] textarea,.media-grid input[type=file]'))field.disabled=busy;
 $('text-manifest').disabled=busy||$('text-manifest-mode').value!=='selected';$('noise-file').disabled=busy||$('noise-mode').value!=='file';
}
function receiveState(next){
 view=next;render();
 if(next.busy){const message=phaseLabels[next.phase]??(next.phase?.startsWith('lora-')?'LoRAの接続・適用を処理しています。':`${stateLabels[next.state]??'処理中'}。`);status(message,next.state.toUpperCase());$('progress').removeAttribute('value');}
 else $('progress').value=next.hasResult?1:0;
}
function showError(error){
 const code=error?.code??error?.name??'ERROR';
 if(['AbortError','CANCELLED','INVOCATION_CANCELLED'].includes(code)){const {cleanup,reload}=cleanupState();status('取消の終端を確認しました。',cleanup?'CLEANUP_REQUIRED':reload?'RELOAD_REQUIRED':'CANCELLED');feedback(cleanup?'「解放・復旧を再試行」で資源の解放を確認してください。':reload?'次の生成には「選択モデルを再読込」が必要です。':'入力と設定を確認して次の操作を選べます。');return;}
 const reasons=error.reasons??error.details?.reasons??error.support?.reasons??[],detail=[error.message,...reasons.map(reason=>typeof reason==='string'?reason:reason.reason??reason.message)].filter(Boolean).join(' / ');
 let next='入力と設定を確認し、表示された理由に対応してから再実行してください。';
 if(/INVALID_SAFETENSORS/.test(code))next='選択したHIGH・LOWモデルが完全なsafetensorsか確認して選び直し、モデルを再読込してください。';
 else if(/MODEL.*(?:LOAD|RELOAD)|RELOAD_REQUIRED/.test(code))next='選択したHIGH・LOWモデルを再読込してください。';
 else if(/LORA_RESTORE_REQUIRED/.test(code))next='「LoRAを外してBaseへ戻す」または「解放・復旧を再試行」で適用状態を復元してください。';
 else if(/CLEANUP|RECOVERY|TERMINAL_UNCONFIRMED|CLOSE_UNCONFIRMED|RESTORE_UNCONFIRMED|APPLICATION_UNCONFIRMED/.test(code))next='「解放・復旧を再試行」で資源の解放を確認してください。';
 else if(/MODEL_FOLDER|MODEL_SELECTION|MANIFEST|SOURCE_BINDING|MODEL_PATH|MULTIPLE_MODEL_ROOTS/.test(code))next='manifestと対応するモデルフォルダを選び直し、「モデルを準備・読込」を実行してください。';
 else if(/CROSS_ORIGIN|SHARED_ARRAY|RESOURCE_CONFIG/.test(code))next='4 threadsにはCOIとSharedArrayBufferが必要です。対応する環境で開くか、1 threadを選び直してください。';
 else if(/MEDIA_RESIZE_UNAVAILABLE/.test(code))next='入力を生成サイズと同じ大きさの対応画像・動画にして、読込み直してください。';
 else if(/MEDIA_ALPHA_UNSUPPORTED/.test(code))next='モデル入力と内部RGB tensor保存には、不透明な画像を選択してください。PNG保存は透過を保持できます。';
 else if(/NOISE/.test(code))next='ゼロ初期値を選ぶか、対応する保存noiseファイルを選び直してください。';
 else if(/MEDIA|RGB|TENSOR/.test(code))next='対応する画像・動画、またはこの画面で保存したファイルを選び直してください。';
 status(`処理を完了できませんでした (${code})。`,'ERROR');feedback(`${detail} 次の操作: ${next}`);
}
async function action(label,fn,{media=false}={}){
 if(localBusy||view.busy)return;
 localBusy=true;localAbort=media?new AbortController():null;status(label,'RUNNING');feedback('処理の完了を待っています。');$('progress').removeAttribute('value');render();
 try{return await fn(localAbort?.signal);}catch(error){if($('result-state').textContent==='生成中'){$('result-state').textContent='結果なし';$('result-status').textContent='生成を完了できませんでした。実行の状態と次の操作を確認してください。';}showError(error);}finally{localBusy=false;localAbort=null;$('progress').value=resultPreview?1:0;render();}
}
function clearPreview(slot){const container=$(slot+'-preview');container.replaceChildren();container.classList.add('empty-preview');container.textContent=slot==='result'?'結果のpreview':'まだ読込まれていません。';}
function preview(slot,media){
 const container=$(slot+'-preview');container.replaceChildren();container.classList.remove('empty-preview');
 const canvas=document.createElement('canvas'),figure=document.createElement('figure'),caption=document.createElement('figcaption');figure.append(canvas,caption);container.append(figure);
 const draw=index=>{const frame=media.frames[index];canvas.width=frame.width;canvas.height=frame.height;const bytes=new Uint8ClampedArray(frame.width*frame.height*4);for(let row=0;row<frame.height;row++)bytes.set(frame.data.subarray(row*frame.stride,row*frame.stride+frame.width*4),row*frame.width*4);canvas.getContext('2d').putImageData(new ImageData(bytes,frame.width,frame.height),0,0);caption.textContent=`${index+1} / ${media.frames.length} · ${frame.width} × ${frame.height}${Number.isFinite(frame.timestamp)?' · '+frame.timestamp.toFixed(3)+' 秒':''}`;};
 draw(0);
 if(media.frames.length>1){const controls=document.createElement('div'),label=document.createElement('label'),range=document.createElement('input');controls.className='frame-controls';range.type='range';range.min='0';range.max=String(media.frames.length-1);range.value='0';range.id=slot+'-frame-index';range.setAttribute('aria-label','previewするフレーム');label.htmlFor=range.id;label.textContent='フレームを選ぶ';range.addEventListener('input',()=>draw(Number(range.value)));controls.append(label,range);container.append(controls);}
}
async function modelConfiguration(id){
 const selected=fileList(id+'-bundle');if(!selected.length)fail('MODEL_FOLDER_REQUIRED',`${names[id]}のモデルフォルダを選んでください。`);
 const files=new Map();let root=null;
 for(const file of selected){const parts=(file.webkitRelativePath||file.name).replaceAll('\\','/').split('/');if(parts.some(part=>!part||part==='.'||part==='..'))fail('INVALID_MODEL_PATH','モデルFileの相対pathが不正です。');if(file.webkitRelativePath){const current=parts.shift();if(root!==null&&root!==current)fail('MULTIPLE_MODEL_ROOTS','一つのモデルフォルダを選択してください。');root=current;}const path=parts.join('/');if(files.has(path))fail('DUPLICATE_MODEL_PATH',`モデルFileのpathが重複しています: ${path}`);files.set(path,file);}
 let manifestFile=$(id+'-manifest').files[0];const current=id==='text'&&$('text-manifest-mode').value==='current';
 if(!manifestFile&&!current){const manifests=[...files.keys()].filter(path=>path.split('/').at(-1)==='manifest.json');if(manifests.length!==1||manifests[0]!=='manifest.json')fail('MANIFEST_SELECTION_REQUIRED','実行用manifestを選択してください。未選択ならフォルダ直下に一つだけmanifest.jsonが必要です。');manifestFile=files.get('manifest.json');}
 const native=await import('../../shared/ai-connection/adapters/text-vae-standalone/native.mjs');
 const manifest=current?await native.readTextVaeConfigurationManifest('text'):JSON.parse(await manifestFile.text());
 if(id==='text'&&$('text-source').files[0]){const binding=manifest?.embedding?.sourceFile;if(typeof binding!=='string'||!binding)fail('SOURCE_BINDING_REQUIRED','選択したText manifestには元UMT5モデルの対応pathがありません。');files.set(binding,$('text-source').files[0]);}
 return {manifest,files};
}
function numberValue(id){const field=$(id);if(!field.value.trim()||!field.checkValidity())fail('GENERATION_CONDITION_REQUIRED',`${field.labels?.[0]?.textContent??id}を確認してください。`);return Number(field.value);}
function loraSelections(){const selections={};for(const pair of ['light','detail']){const HIGH=$('lora-'+pair+'-high').files[0],LOW=$('lora-'+pair+'-low').files[0];if(HIGH||LOW)selections[pair]={...(HIGH?{HIGH:{file:HIGH,strength:numberValue('lora-'+pair+'-high-strength')}}:{}),...(LOW?{LOW:{file:LOW,strength:numberValue('lora-'+pair+'-low-strength')}}:{})};}return selections;}
function connect(){unsubscribe?.();loadedSelection=false;controller=createController();unsubscribe=controller.subscribe(receiveState);}
async function saveInputTensor(slot,signal){if(view.disposed)connect();const artifact=await controller.saveInput(inputs[slot],{kind:slot});if(signal.aborted)fail('CANCELLED','取消しました。');download(artifact,slot+'-input.wktensor');$('storage-status').textContent=`${slot}の内部tensorを保存しました。PNGフレームとは別のファイルです。`;status('入力の内部tensorを保存しました。');feedback('モデルは実行していません。値と付随情報を含む内部tensorファイルです。');}
async function readTensor(slot,file,signal){if(!file)fail('TENSOR_FILE_REQUIRED','読戻すtensorを選択してください。');if(view.disposed)connect();const {tensor,ref}=await controller.readTensor(file);if(signal.aborted)fail('CANCELLED','取消しました。');const display=await mediaTools.previewProductTensor(tensor,{signal,asInput:slot!=='result'});if(slot==='result'){resultPreview?.dispose();resultPreview=display;resultTensor=tensor;resultOrigin='restored';resultRef=ref;$('result-state').textContent='保存結果を読戻し';$('result-status').textContent='保存した内部RGB tensorを読戻しました。この操作ではモデルを実行していません。';}else{inputs[slot]?.dispose();inputs[slot]=display;$(slot+'-status').textContent=`保存tensorを読戻し · ${tensor.shape[4]} × ${tensor.shape[3]} · ${tensor.shape[2]} フレーム`; }preview(slot,display);status('保存した内部tensorを読戻しました。');feedback('読戻した値をpreviewしています。この操作ではモデルを実行していません。');}

$('configure').addEventListener('click',()=>action('モデルを準備・読込しています。',async()=>{if(!controller||view.disposed)connect();const [text,vae]=await Promise.all([modelConfiguration('text'),modelConfiguration('vae')]);const HIGH=$('diffusion-high').files[0],LOW=$('diffusion-low').files[0];if(!HIGH||!LOW)fail('MODEL_SELECTION_REQUIRED','DiffusionのHIGH・LOWモデルを両方選択してください。');configurationDirty=false;loadedSelection=true;await controller.configure({text,vae,models:{HIGH,LOW},threads:Number($('diffusion-threads').value)});status('モデルを読み込みました。');feedback('入力と生成条件を確認して「生成を実行」を押してください。');}));
$('run').addEventListener('click',()=>action('生成を実行しています。',async()=>{resultPreview?.dispose();resultPreview=null;resultTensor=null;resultRef=null;clearPreview('result');$('result-state').textContent='生成中';$('result-status').textContent='実モデルの生成結果を待っています。';const response=await controller.run({prompt:$('prompt').value,negativePrompt:$('negative-prompt').value,media:{source:inputs.source,reference:inputs.reference},target:{width:numberValue('width'),height:numberValue('height'),frames:numberValue('frames')},steps:numberValue('steps'),guidance:numberValue('guidance'),noise:{mode:$('noise-mode').value,...($('noise-mode').value==='file'?{file:$('noise-file').files[0]}:{})},loraSelections:loraSelections()});const tensor=response.tensor??controller.getResult();const display=await mediaTools.previewProductTensor(tensor);resultPreview?.dispose();resultPreview=display;resultTensor=tensor;resultOrigin='generated';resultRef=response.result.ref;preview('result',display);$('result-state').textContent='実モデル生成結果';$('result-status').textContent=`${tensor.shape[4]} × ${tensor.shape[3]} · ${tensor.shape[2]} フレーム · ${response.result?.noiseMode==='zeros'?'ゼロ初期値で実行':'保存noiseで実行'}`;status('生成と結果のdecodeが完了しました。','COMPLETED');feedback('結果のpreviewを確認し、PNGフレームまたは内部tensorを保存できます。');}));
$('cancel').addEventListener('click',async()=>{localAbort?.abort();status('取消の終端と資源の解放を待っています。','CANCELLING');try{if(view.busy)await controller.cancel();}catch(error){showError(error);}finally{render();}});
for(const id of ['reload','recover','dispose'])$(id).addEventListener('click',()=>action(id==='reload'?'モデルを再読込しています。':id==='recover'?'資源の解放と復旧を確認しています。':'モデルを終了しています。',async()=>{await controller[id]();if(id==='dispose'){resultTensor=null;resultRef=null;$('result-status').textContent='モデルと内部結果を解放しました。表示中のPNG previewは保存できます。内部tensorは保存済みファイルを読戻せます。';}if(id==='reload'||id==='recover')configurationDirty=false;status(id==='dispose'?'モデルを終了しました。':id==='recover'?'解放・復旧を確認しました。':'モデルを再読込しました。');feedback(id==='dispose'?'再び使う場合はモデルを準備・読込してください。':'次の生成条件を確認してください。');}));
$('lora-apply').addEventListener('click',()=>action('LoRAを適用しています。',async()=>{await controller.applyLora(loraSelections());status('LoRAの設定を適用しました。');feedback('現在のFileと強度で生成できます。');}));
$('lora-remove').addEventListener('click',()=>action('Baseモデルへ戻しています。',async()=>{await controller.removeLora();for(const pair of ['light','detail'])for(const side of ['high','low'])$('lora-'+pair+'-'+side).value='';status('LoRAを外してBaseモデルへ戻しました。');feedback('次の生成はBaseモデルを使用します。');}));
for(const slot of slots){
 $(slot+'-load').addEventListener('click',()=>action('画像・動画を読み込んでいます。',async signal=>{const selected=fileList(slot+'-file'),media=await mediaTools.readProductMediaFiles(selected,{signal,onProgress:p=>{$(slot+'-status').textContent=`読込中 · ${p.frameCount??0} フレーム`;}}).catch(error=>{$(slot+'-status').textContent=(['CANCELLED','AbortError'].includes(error.code??error.name)?'読込を取り消しました。':'読込を完了できませんでした。')+(inputs[slot]?'以前の入力を保持しています。':'');throw error;});inputs[slot]?.dispose();inputs[slot]=media;preview(slot,media);const first=media.frames[0];$(slot+'-status').textContent=`${selected.map(file=>file.name).join(' / ')} · ${first.width} × ${first.height} · ${media.frames.length} フレーム`;status('画像・動画を読み込みました。');feedback('previewを確認してください。モデルは実行していません。');},{media:true}));
 $(slot+'-clear').addEventListener('click',()=>{inputs[slot]?.dispose();inputs[slot]=null;$(slot+'-file').value='';$(slot+'-tensor-file').value='';$(slot+'-status').textContent='未選択';clearPreview(slot);render();});
 $(slot+'-export').addEventListener('click',()=>action('PNGフレームを保存しています。',async signal=>{download(await mediaTools.saveProductFrames(inputs[slot],{signal}),slot+'-frames.zip');status('PNGフレームをZIPに保存しました。');feedback('画像と実測時刻などの情報を含みます。同じ入力欄からZIPを読戻せます。');},{media:true}));
 $(slot+'-tensor-save').addEventListener('click',()=>action('内部tensorを保存しています。',signal=>saveInputTensor(slot,signal),{media:true}));
 $(slot+'-tensor-file').addEventListener('change',()=>action('入力tensorを読戻しています。',signal=>readTensor(slot,$(slot+'-tensor-file').files[0],signal),{media:true}));
}
$('result-image-save').addEventListener('click',()=>action('表示中の画像を保存しています。',async signal=>{const frameIndex=Number($('result-frame-index')?.value??0);download(await mediaTools.saveProductImage(resultPreview,{frameIndex,signal}),'result.png');status('表示中の画像をPNGで保存しました。');feedback('元のfloat32値は内部tensor保存で保持できます。');},{media:true}));
$('result-export').addEventListener('click',()=>action('結果のPNGフレームを保存しています。',async signal=>{download(await mediaTools.saveProductFrames(resultPreview,{signal}),'result-frames.zip');status('結果のPNGフレームを保存しました。');feedback('PNGは表示用の8-bit画像です。元のfloat32値は内部tensor保存で保持できます。');},{media:true}));
$('result-tensor-save').addEventListener('click',()=>action('結果の内部tensorを保存しています。',async()=>{download(await controller.saveArtifact(resultRef,{filename:resultOrigin==='generated'?'generated-result.wktensor':'restored-result.wktensor'}),'result.wktensor');status('結果の内部tensorを保存しました。');feedback('PNGフレームとは別に、元の値と付随情報を保存しました。');}));
$('result-tensor-file').addEventListener('change',()=>action('結果tensorを読戻しています。',signal=>readTensor('result',$('result-tensor-file').files[0],signal),{media:true}));
for(const id of ['text-manifest-mode','text-manifest','text-bundle','text-source','vae-manifest','vae-bundle','diffusion-high','diffusion-low','diffusion-threads'])$(id).addEventListener('change',()=>{configurationDirty=true;for(const kind of ['text','vae'])$(kind+'-files').textContent=fileSummary(fileList(kind+'-bundle'));$('diffusion-files').textContent=fileSummary([...fileList('diffusion-high'),...fileList('diffusion-low')]);render();});
$('noise-mode').addEventListener('change',render);
$('save-workspace').addEventListener('click',()=>action('作業と中間結果を保存しています。',async()=>{const formSettings={fields:Object.fromEntries(settingsFields.map(id=>[id,$(id).value]))};const bundle=await controller.saveWorkspace({formSettings});download(new Blob([bundle.bytes],{type:'application/zip'}),'ai-workspace.zip');$('workspace-status').textContent='保持済みの中間tensor・結果とフォーム設定を保存しました。読戻し時はモデルと入力媒体を再選択してください。';status('作業・中間結果のbundleを保存しました。');feedback('保持されている部分結果を含みます。保存の操作ではモデルを実行していません。');}));
$('workspace-file').addEventListener('change',()=>action('作業bundleを読戻しています。',async()=>{const file=$('workspace-file').files[0];if(!file)return;if(view.disposed)connect();const restored=await controller.restoreWorkspace(file);for(const id of settingsFields){const value=restored.formSettings?.fields?.[id];if(typeof value==='string')$(id).value=value;}for(const input of document.querySelectorAll('input[type=file]'))input.value='';for(const slot of slots){inputs[slot]?.dispose();inputs[slot]=null;clearPreview(slot);$(slot+'-status').textContent='入力媒体を再選択してください。';}resultPreview?.dispose();resultPreview=null;resultTensor=null;resultRef=null;clearPreview('result');$('result-state').textContent='結果なし';$('result-status').textContent='保持済みの部分結果をbundleから読戻しました。個別のRGB tensorは上の読戻し欄からpreviewできます。';if(restored.tensor&&restored.result){resultTensor=restored.tensor;resultRef=restored.result.ref;resultOrigin='restored';resultPreview=await mediaTools.previewProductTensor(resultTensor);preview('result',resultPreview);$('result-state').textContent='保存結果を読戻し';$('result-status').textContent=`bundle内の完成済み結果を読戻しました · ${resultTensor.shape[4]} × ${resultTensor.shape[3]} · ${resultTensor.shape[2]} フレーム。この操作ではモデルを実行していません。`;}configurationDirty=true;loadedSelection=false;for(const kind of ['text','vae'])$(kind+'-files').textContent='manifestとモデルフォルダを再選択してください。';$('diffusion-files').textContent='HIGH・LOWモデルを再選択してください。';$('workspace-status').textContent=`${file.name}を読戻しました。フォーム設定と${restored.artifactRefs?.length??0}個の保持済みtensorを復元しました。モデル・入力媒体・LoRA・noiseのFileを再選択し、モデルを準備・読込してください。`;status('作業bundleを読戻しました。モデルFileを再選択してください。','RESTORED');feedback('モデルsessionとFile選択権限は復元していません。');}));


async function initialize(){
 $('environment').textContent=`COI: ${globalThis.crossOriginIsolated===true?'有効':'無効'} · SharedArrayBuffer: ${typeof SharedArrayBuffer==='function'?'利用可':'利用不可'}`;
 try{const [product,media]=await Promise.all([import('../../shared/ai-connection/product-management.mjs'),import('../../shared/ai-connection/product-media.mjs')]);createController=product.createProductManagement;mediaTools=media;connect();status('モデルと入力を選択してください。');render();}catch(error){showError(error);}
}
initialize();

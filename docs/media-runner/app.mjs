import {frameArtifacts} from '../shared/media/frame-artifacts.mjs';
import {createMediaProcessor,MEDIA_BUILD,PROTOTYPE_LIMITS} from '../shared/media/sdk.mjs';
import {readMediaFrames,encodePng} from '../shared/media/browser.mjs';
import {resolveMediaLimits} from '../shared/media/formats.mjs';
import {zipSync,strToU8} from '../shared/ft/vendor/fflate.mjs';
import {createTelemetryClient} from '../shared/media/telemetry.mjs';
import {createOperationTelemetry} from '../shared/media/operation-telemetry.mjs';

const limits=resolveMediaLimits(PROTOTYPE_LIMITS);
const $=id=>document.getElementById(id),urls=new Set();let processor=null,controller=null,busy=false,generation=0;
let collectionClient=createTelemetryClient(),operationTelemetry=null;
const resourceCounts={};
function clearOutput(){for(const url of urls)URL.revokeObjectURL(url);urls.clear();$('download').hidden=true;$('download').removeAttribute('href');$('preview').hidden=true;$('preview').removeAttribute('src');$('aligned-preview').hidden=true;$('aligned-preview').removeAttribute('src');$('result').value='';}
function cancel(){controller?.abort();processor?.dispose();}
function selectionControls(){const active=$('selection-mode').value==='exact-duplicates';$('anchor-every').disabled=!active;$('required-timestamps').disabled=!active;}
function selectionPolicy(){
  const mode=$('selection-mode').value;if(mode==='all')return {mode};if(mode!=='exact-duplicates')throw Error('POLICY_UNSUPPORTED');
  const anchorText=$('anchor-every').value.trim(),anchorEvery=Number(anchorText);if(!anchorText||!Number.isSafeInteger(anchorEvery)||anchorEvery<0||anchorEvery>100000)throw Error('SELECTION_OPTIONS');
  const text=$('required-timestamps').value.trim();if(text.length>4096)throw Error('SELECTION_REQUIRED_TIMESTAMPS');
  const parts=text?text.split(',').map(value=>value.trim()):[];if(parts.length>128||parts.some(value=>! /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)))throw Error('SELECTION_REQUIRED_TIMESTAMPS');
  const requiredTimestamps=parts.map(Number);if(requiredTimestamps.some(value=>!Number.isFinite(value)||value<0||value>86400)||new Set(requiredTimestamps).size!==requiredTimestamps.length)throw Error('SELECTION_REQUIRED_TIMESTAMPS');
  return {mode,anchorEvery,requiredTimestamps,budgetBytes:16777216};
}
function changed(){generation++;cancel();clearOutput();selectionControls();$('status').textContent='入力を変更しました。前処理を実行してください。';}
for(const id of ['file','workers','variant','reuse','chunk','lookahead','worker-mode','align','roi-x','roi-y','roi-w','roi-h','search-radius','selection-mode','anchor-every','required-timestamps'])$(id).addEventListener('change',changed);
selectionControls();
$('cancel').addEventListener('click',cancel);addEventListener('pagehide',()=>{cancel();collectionClient.dispose();clearOutput();});
function objectURL(blob){const url=URL.createObjectURL(blob);urls.add(url);return url;}
function showCollection(client=collectionClient,adapter=operationTelemetry){
  if(client!==collectionClient)return;if(adapter!==operationTelemetry)adapter=operationTelemetry;const s=client.status();
  $('telemetry-status').textContent=`保存確認 ${s.stored}・重複保存確認 ${s.duplicate}・保留 ${s.pending}・未収集 ${s.rejected+s.expired+s.dropped}`;
  $('telemetry-details').textContent=JSON.stringify({scope:'SDK operation; client lifetime counters',sender:s,operation:adapter?.status()??null},null,2);
}
async function flushCollection(client,adapter){
  // A start flush may still be draining its snapshot when the terminal arrives.
  // At most two snapshots are drained here; processing/output never awaits transport.
  for(let pass=0;pass<2;pass++){const pending=client.flush();showCollection(client,adapter);await pending;showCollection(client,adapter);if(!client.status().pending)break;}
}
function collectionSnapshot(client,adapter){return {state:'snapshot-not-operation-receipt',scope:'SDK operation only; ZIP packaging excluded',counters:'client lifetime',sender:client.status(),operation:adapter?.status()??null};}
showCollection();
$('run').addEventListener('click',async()=>{
  if(busy)return;const file=$('file').files[0];if(!file){$('status').textContent='ファイルを選択してください。';return;}
  clearOutput();busy=true;$('run').disabled=true;$('cancel').disabled=false;const revision=++generation,started=performance.now(),operationId=crypto.randomUUID();controller=new AbortController();const files={},frames=[],omittedFrames=[];let artifactBytes=0,metadata=null,firstBlob=null,firstAlignedBlob=null,adapter=null;
  if(['expired','unavailable','disposed'].includes(collectionClient.status().sessionState)){collectionClient.dispose();collectionClient=createTelemetryClient();}const client=collectionClient;
  for(const key of Object.keys(resourceCounts))delete resourceCounts[key];
  try{
    const head=new Uint8Array(await file.slice(0,12).arrayBuffer()),box=String.fromCharCode(...head.subarray(4,8)),task=([0x1a,0x45,0xdf,0xa3].every((v,i)=>head[i]===v)||['ftyp','styp'].includes(box))?'video-lbp':'image-lbp';
    if(controller.signal.aborted||revision!==generation)throw Error('CANCELLED');
    adapter=createOperationTelemetry({client,operationId,task});operationTelemetry=adapter;
    processor=createMediaProcessor({limits,concurrency:Number($('workers').value),moduleReuse:$('reuse').checked,variant:$('variant').value,chunkUnits:Number($('chunk').value),lookahead:Number($('lookahead').value),workerMode:$('worker-mode').value,onEvent:event=>{adapter.onEvent(event);showCollection(client,adapter);if(event.type==='started')void flushCollection(client,adapter);}});$('capabilities').textContent=JSON.stringify(processor.capabilities,null,2);$('status').textContent='処理中…';
    const policy=selectionPolicy(),alignment=$('align').checked?{reference:'first-frame',referenceId:operationId,sceneId:operationId,roi:{x:Number($('roi-x').value),y:Number($('roi-y').value),width:Number($('roi-w').value),height:Number($('roi-h').value)},searchRadius:Number($('search-radius').value),policy:{maxCost:.05,minGap:.05,minTexture:.1,minMatches:3,minInlierRatio:.75,maxFbError:0,consensusTolerance:0}}:undefined;
    const check=()=>{if(controller.signal.aborted||revision!==generation)throw Error('CANCELLED');};
    const result=await processor.process({alignment,policy,operationId,inputRevision:revision,signal:controller.signal,frames:async function*(signal){for await(const frame of readMediaFrames(file,{signal,limits,onMetadata:value=>{metadata=value;adapter.onMetadata(value);},onResource:event=>{resourceCounts[event]=(resourceCounts[event]??0)+1;}}))yield alignment?{...frame,sceneId:operationId}:frame;},onOmitted:entry=>{
      check();if(omittedFrames.length>=limits.maxFrames)throw Error('SELECTION_FRAME_LIMIT');
      const {sequence,timestamp,duration,referenceSequence,reason}=entry??{};
      if(policy.mode!=='exact-duplicates'||!Number.isSafeInteger(sequence)||sequence<0||sequence>=limits.maxFrames||!Number.isSafeInteger(referenceSequence)||referenceSequence<0||referenceSequence>=sequence||reason!=='exact-duplicate'||(timestamp!==null&&(!Number.isFinite(timestamp)||timestamp<0||timestamp>86400))||(duration!==null&&(!Number.isFinite(duration)||duration<0||duration>86400))||(omittedFrames.length&&omittedFrames.at(-1).sequence>=sequence)||!frames.some(frame=>frame.sequence===referenceSequence))throw Error('SELECTION_TIMELINE');
      omittedFrames.push({sequence,timestamp,duration,referenceSequence,reason});$('status').textContent=`処理中：保持${frames.length}・省略${omittedFrames.length}フレーム`;
    },onFrame:async frame=>{
      const exported=await frameArtifacts(frame,{encodePng:frame=>encodePng(frame,{limits}),remainingBytes:limits.maxArtifactBytes-artifactBytes,check});
      artifactBytes+=exported.bytes;Object.assign(files,exported.files);firstBlob??=exported.original;firstAlignedBlob??=exported.derivative;frames.push(exported.record);$('status').textContent=`処理中：保持${frames.length}・省略${omittedFrames.length}フレーム`;
    }});
    if(controller.signal.aborted||revision!==generation)throw Error('CANCELLED');
    const timeline=[...frames,...omittedFrames].map(frame=>frame.sequence).sort((a,b)=>a-b);
    if(!Number.isSafeInteger(result.frameCount)||result.frameCount>limits.maxFrames||timeline.length!==result.frameCount||timeline.some((sequence,index)=>sequence!==index))throw Error('SELECTION_TIMELINE');
    const selection={policy,processedFrameCount:result.frameCount,keptFrameCount:frames.length,omittedFrameCount:omittedFrames.length,summary:result.selection??null};
    const manifest={schemaVersion:1,buildId:MEDIA_BUILD,operation:result,input:{bytes:file.size,...metadata},alignmentPolicy:alignment?{id:'roi-policy-v1',calibration:'synthetic fixture only; general performance unverified',sceneAssumption:'caller selected one scene; no automatic cut detection',...alignment}:null,selection,frames,omittedFrames,resources:{...resourceCounts},collection:collectionSnapshot(client,adapter),timing:{browserBeforePackagingMs:performance.now()-started,AITransferAndReadMs:null,AITransferAndReadReason:'Measured by caller outside browser'},warnings:['This runner outputs standard LBP; paper-derived feature optimization is available through the separate paper-lab caller and is not applied here.','Keep the complete kept/omitted source timeline; selection does not shorten playback or audio.','Telemetry covers SDK processing and ordered output callbacks, including selector finish; ZIP creation is outside that operation.','Keep the original local file; PNG sequence contains no audio.']};
    files['manifest.json']=strToU8(JSON.stringify(manifest,null,2));artifactBytes+=files['manifest.json'].byteLength;if(artifactBytes>limits.maxArtifactBytes)throw Error('ARTIFACT_LIMIT');
    const packStart=performance.now(),zip=zipSync(files,{level:0});if(zip.byteLength>limits.maxArtifactBytes)throw Error('ARTIFACT_LIMIT');
    if(controller.signal.aborted||revision!==generation)throw Error('CANCELLED');
    const href=objectURL(new Blob([zip],{type:'application/zip'}));$('download').href=href;$('download').download=`media-${operationId}.zip`;$('download').hidden=false;
    if(firstBlob){$('preview').src=objectURL(firstBlob);$('preview').hidden=false;}
    if(firstAlignedBlob){$('aligned-preview').src=objectURL(firstAlignedBlob);$('aligned-preview').hidden=false;}
    $('result').value=JSON.stringify({schemaVersion:1,buildId:MEDIA_BUILD,operationId,status:result.status,frameCount:result.frameCount,processedFrameCount:result.frameCount,keptFrameCount:frames.length,omittedFrameCount:omittedFrames.length,selection,alignment:{requested:!!alignment,applied:frames.filter(f=>f.alignment?.applied).length,reasons:frames.map(f=>f.alignment?.reason??null)},timestamps:frames.map(f=>f.timestamp),input:manifest.input,resources:manifest.resources,metrics:{...result.metrics,packagingMs:performance.now()-packStart,browserTotalMs:performance.now()-started,zipBytes:zip.byteLength},pool:processor.getStatus().pool,collection:manifest.collection,capabilities:result.capabilities},null,2);$('status').textContent=`完了：入力${result.frameCount}・保持${frames.length}・省略${omittedFrames.length}フレーム。結果を保存できます。`;
  }catch(error){clearOutput();$('status').textContent=controller.signal.aborted?'取り消しました。':`処理を完了できませんでした：${error.message}`;$('result').value=JSON.stringify({status:controller.signal.aborted?'cancelled':'failed',code:error.message,operation:error.operation??null,resources:resourceCounts,collection:collectionSnapshot(client,adapter)},null,2);
  }finally{processor?.dispose();processor=null;controller=null;busy=false;$('run').disabled=false;$('cancel').disabled=true;void flushCollection(client,adapter);}
});

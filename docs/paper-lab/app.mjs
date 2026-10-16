import {createComputePool} from '../shared/compute/pool.mjs';
import {createPaperProcessor} from '../shared/media/paper/sdk.mjs';
import {validateDataset,validateSources,serializePaperOutput,exportPaperModel,PAPER_CALLER_LIMITS} from '../shared/media/paper/dataset.mjs';
import {readMediaFrames} from '../shared/media/browser.mjs';
import {inspectMediaFile,resolveMediaLimits} from '../shared/media/formats.mjs';
import {createTelemetryClient} from '../shared/media/telemetry.mjs';
import {createPaperOperationTelemetry} from '../shared/media/paper/operation-telemetry.mjs';
const $=id=>document.getElementById(id),limits=resolveMediaLimits();let busy=false,generation=0,controller=null,sdk=null,pool=null,url=null;
let collectionClient=createTelemetryClient(),paperTelemetry=null;
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const fields=['class0','class1','evaluation','groups0','groups1','groups-eval','x','y','width','height','kind','features'];
function clear(){if(url)URL.revokeObjectURL(url);url=null;$('download').hidden=true;$('download').removeAttribute('href');$('result').value='';}
function cancel(){controller?.abort();sdk?.dispose();}
function names(){for(const [file,id]of [['class0','names0'],['class1','names1'],['evaluation','names-eval']])$(id).textContent=Array.from($(file).files).map((f,i)=>`${i+1}: ${f.name}`).join(' / ');}
for(const id of fields)$(id).addEventListener('change',()=>{generation++;cancel();clear();names();$('status').textContent='入力を変更しました。設定を確認して実行してください。';});
$('cancel').addEventListener('click',cancel);addEventListener('pagehide',()=>{cancel();pool?.dispose();paperTelemetry?.dispose();collectionClient.dispose();clear();});
function collectionSnapshot(client,adapter){return {state:'snapshot-not-operation-receipt',scope:'Paper SDK operations only; caller decode, dataset setup and export excluded',counters:'client lifetime',sender:client.status(),observer:adapter?.status()??null};}
function showCollection(client=collectionClient,adapter=paperTelemetry){
 if(client!==collectionClient)return;if(adapter!==paperTelemetry)adapter=paperTelemetry;const s=client.status();
 $('telemetry-status').textContent=`保存確認 ${s.stored}・重複保存確認 ${s.duplicate}・保留 ${s.pending}・未収集 ${s.rejected+s.expired+s.dropped}・送信対象外 ${adapter?.status().skipped??0}`;
 $('telemetry-details').textContent=JSON.stringify(collectionSnapshot(client,adapter),null,2);
}
function collectionPump(client,adapter){
 let flight=null;
 const flush=()=>{if(flight)return flight;flight=client.flush().then(()=>showCollection(client,adapter)).catch(()=>{}).finally(()=>{flight=null;});showCollection(client,adapter);return flight;};
 // Each call drains one bounded sender snapshot. Finalization waits for at most
 // that existing snapshot, then drains one remaining snapshot; UI never awaits it.
 return {flush,async finish(){if(flight)await flight;await flush();}};
}
function entries(){const rows=[];for(const [files,groups,split,label]of [['class0','groups0','train',0],['class1','groups1','train',1],['evaluation','groups-eval','evaluation',null]]){const f=Array.from($(files).files),g=$(groups).value.trim().split(/\r?\n/).map(s=>s.trim());if(f.length!==g.length)throw Error('GROUP_COUNT');for(let i=0;i<f.length;i++)rows.push({file:f[i],groupId:g[i],split,label});}return validateDataset(rows);}
$('run').addEventListener('click',async()=>{
 if(busy)return;clear();busy=true;const revision=++generation,started=performance.now();controller=new AbortController();$('run').disabled=true;$('cancel').disabled=false;for(const id of fields)$(id).disabled=true;
 if(collectionClient.status().disposed||['expired','unavailable'].includes(collectionClient.status().sessionState)){collectionClient.dispose();collectionClient=createTelemetryClient();}const client=collectionClient,adapter=createPaperOperationTelemetry({client}),pump=collectionPump(client,adapter);paperTelemetry=adapter;showCollection(client,adapter);
 const check=()=>{if(controller.signal.aborted||revision!==generation)throw Error('CANCELLED');},timings={hashAndInspectMs:0,decodeMs:0,preprocessMs:0,fitMs:0,inferMs:0,serializationPass1Ms:0},resources={};
 try{
  const rows=entries(),roi=Object.fromEntries(['x','y','width','height'].map(k=>[k,Number($(k).value)])),kind=$('kind').value,featureCount=Number($('features').value);
  if(![roi.x,roi.y].every(n=>Number.isSafeInteger(n)&&n>=0)||![roi.width,roi.height].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=64)||!Number.isInteger(featureCount)||featureCount<1||featureCount>16||!['svd-diagonal-v1','paper-alg2-diagonal-v1'].includes(kind))throw Error('PAPER_SETTINGS');
  let preprocessing=null,preprocessingSha256=null,shape=null;const prepared=[];const preflight=performance.now();
  for(const row of rows){check();const meta=await inspectMediaFile(row.file,{limits,signal:controller.signal});check();if(meta.kind!=='image')throw Error('PAPER_IMAGES_ONLY');if(roi.x+roi.width>meta.width||roi.y+roi.height>meta.height)throw Error('PAPER_CROP');if(shape&&(shape.width!==meta.width||shape.height!==meta.height))throw Error('PAPER_SOURCE_DIMENSIONS');shape=meta;const sourceSha256=await sha(await row.file.arrayBuffer());check();prepared.push({...row,sourceSha256,metadata:meta});}
  validateSources(prepared);timings.hashAndInspectMs=performance.now()-preflight;
  pool=createComputePool({concurrency:4,workerMode:'bundle',moduleReuse:false});sdk=createPaperProcessor({pool,onEvent:event=>{adapter.onEvent(event);showCollection(client,adapter);if(['completed','failed','cancelled'].includes(event.type))void pump.flush();}});
  for(let index=0;index<prepared.length;index++){
   check();const row=prepared[index];$('status').textContent=`LBPを作成中：${index+1}/${prepared.length}`;
   const iterator=readMediaFrames(row.file,{limits,signal:controller.signal,onResource:r=>resources[r]=(resources[r]??0)+1})[Symbol.asyncIterator]();
   try{let t=performance.now();const first=await iterator.next();timings.decodeMs+=performance.now()-t;check();if(first.done)throw Error('NO_IMAGE');t=performance.now();const result=await sdk.preprocess({frame:first.value,roi,sampleId:row.sampleId,sourceSha256:row.sourceSha256},{signal:controller.signal,inputRevision:revision});timings.preprocessMs+=performance.now()-t;check();if(preprocessingSha256&&preprocessingSha256!==result.preprocessingSha256)throw Error('PREPROCESSING_HASH');preprocessing=result.preprocessing;preprocessingSha256=result.preprocessingSha256;row.codes=result.codes;row.codeSha256=result.codeSha256;row.preprocessMetrics=result.metrics;t=performance.now();if(!(await iterator.next()).done)throw Error('PAPER_IMAGES_ONLY');timings.decodeMs+=performance.now()-t;}finally{await iterator.return?.();}
  }
  check();const groups=[...new Map(prepared.map(r=>[r.groupId,{groupId:r.groupId,split:r.split}])).values()],training=prepared.filter(r=>r.split==='train');
  const splitManifest={version:1,preprocessingSha256,groups,samples:training.map(r=>({sampleId:r.sampleId,groupId:r.groupId,label:r.label,sourceSha256:r.sourceSha256,codeSha256:r.codeSha256}))};
  $('status').textContent='学習中…';let t=performance.now();const fit=await sdk.fit({kind,width:roi.width,height:roi.height,featureCount,rankPolicy:'strict',preprocessing,splitManifest,samples:training.map(r=>({sampleId:r.sampleId,codes:r.codes}))},{signal:controller.signal,inputRevision:revision});timings.fitMs=performance.now()-t;check();const evaluations=[];
  for(const row of prepared.filter(r=>r.split==='evaluation')){check();$('status').textContent=`評価中：${row.sampleId}`;t=performance.now();const inference=await sdk.infer({model:fit.result.model,codes:row.codes,preprocessing,source:{sampleId:row.sampleId,groupId:row.groupId,sourceSha256:row.sourceSha256,codeSha256:row.codeSha256,split:row.split}},{signal:controller.signal,inputRevision:revision});timings.inferMs+=performance.now()-t;check();evaluations.push({...inference.result,features:Array.from(inference.result.features),metrics:inference.metrics});}
  const output={schemaVersion:1,caller:'paper-lab',settingsFrozenBeforeFit:{kind,featureCount,rankPolicy:'strict',roi},sourceVerification:'SHA-256 calculated from selected File bytes by this caller; origin group is caller-declared',scope:'media transport and two-class feature extraction; no classifier or generalization claim',preprocessing,splitManifest,splitHashScope:'training samples and declared groups; full evaluation-source manifest is the caller samples array',samples:prepared.map(({file,codes,...row})=>({...row,file:{name:file.name,bytes:file.size},codes:Array.from(codes)})),model:exportPaperModel(fit.result.model),modelEncoding:'Float64LE/Uint8 hex; use restorePaperModel before infer; preserves negative zero',evaluations,fitMetrics:fit.metrics,capabilities:sdk.capabilities,timings,resources:{phase:'operations settled; before caller dispose',decoder:resources,sdk:sdk.getStatus(),pool:pool.getStatus()},logging:'Fixed Paper SDK lifecycle metadata sent independently; media, source/group labels, filenames and model remain local. Receipt is shown separately.',collection:collectionSnapshot(client,adapter),limits:PAPER_CALLER_LIMITS};
  check();t=performance.now();serializePaperOutput(output);timings.serializationPass1Ms=performance.now()-t;timings.totalBeforeFinalSerializationMs=performance.now()-started;const serialized=serializePaperOutput(output);check();url=URL.createObjectURL(new Blob([serialized.text],{type:'application/json'}));$('download').href=url;$('download').download='paper-media-result.json';$('download').hidden=false;
  sdk.dispose();pool.dispose();$('result').value=JSON.stringify({status:'succeeded',sampleCount:prepared.length,modelHash:output.model.modelHash,kind,featureCount:output.model.featureCount,evaluations: evaluations.map(r=>({sampleId:r.source.sampleId,features:r.features})),timings:{...timings,totalMs:performance.now()-started},jsonBytes:serialized.bytes,resources:{decoder:resources,sdk:sdk.getStatus(),pool:pool.getStatus()},capabilities:output.capabilities,collection:output.collection},null,2);$('status').textContent='完了：モデルと評価結果を保存できます。';
 }catch(error){clear();$('status').textContent=controller.signal.aborted?'取り消しました。':`完了できませんでした：${error.message}${error.detailCode?' / '+error.detailCode:''}`;$('result').value=JSON.stringify({status:controller.signal.aborted?'cancelled':'failed',code:error.message,detailCode:error.detailCode??null,timings:{...timings,totalMs:performance.now()-started},resources:{decoder:resources,sdk:sdk?.getStatus()??null,pool:pool?.getStatus()??null},collection:collectionSnapshot(client,adapter)},null,2);}
 finally{sdk?.dispose();pool?.dispose();adapter.dispose();sdk=null;pool=null;controller=null;busy=false;$('run').disabled=false;$('cancel').disabled=true;for(const id of fields)$(id).disabled=false;void pump.finish();}
});

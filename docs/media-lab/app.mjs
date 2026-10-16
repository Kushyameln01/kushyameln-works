import {createComputePool} from '../shared/compute/pool.mjs';
import {createMediaProcessor,MEDIA_BUILD,PROTOTYPE_LIMITS} from '../shared/media/sdk.mjs';
import {readMediaFrames,encodePng} from '../shared/media/browser.mjs';
import {resolveMediaLimits} from '../shared/media/formats.mjs';
import {createTelemetryClient} from '../shared/media/telemetry.mjs';
import {createOperationTelemetry} from '../shared/media/operation-telemetry.mjs';
import {zipSync,strToU8} from '../shared/ft/vendor/fflate.mjs';
const limits=resolveMediaLimits(PROTOTYPE_LIMITS);
const $=id=>document.getElementById(id),urls=new Set(),controllers=new Set(),processors=new Set();let busy=false,stopped=false,operationA=null,activePool=null,cancelRequest=null,activeReport=null,lastAPhase=null;
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
function url(blob){const u=URL.createObjectURL(blob);urls.add(u);return u;}
function reset(){for(const u of urls)URL.revokeObjectURL(u);urls.clear();for(const id of ['download','save-report']){$(id).hidden=true;$(id).removeAttribute('href');}$('report').value='';}
function stop(){stopped=true;for(const c of controllers)c.abort();for(const p of processors)p.dispose();}
function options(){return {concurrency:Number($('workers').value),variant:$('variant').value,chunkUnits:Number($('chunk').value),lookahead:Number($('lookahead').value),workerMode:$('mode').value,moduleReuse:$('reuse').checked};}
async function trial(file,settings,{pool,operationId=crypto.randomUUID(),client,inputRevision=0}={}){
 const head=new Uint8Array(await file.slice(0,12).arrayBuffer()),box=String.fromCharCode(...head.subarray(4,8));if(stopped)throw Error('CANCELLED');
 const controller=new AbortController();controllers.add(controller);const telemetry=settings.remoteTelemetry===false?null:createOperationTelemetry({client,operationId,task:([0x1a,0x45,0xdf,0xa3].every((v,i)=>head[i]===v)||['ftyp','styp'].includes(box))?'video-lbp':'image-lbp'});
 const processor=createMediaProcessor({...settings,limits,pool,...(telemetry?{onEvent:e=>{telemetry.onEvent(e);if(settings.remoteTelemetry===true)void client.flush();}}:{})});processors.add(processor);
 const started=performance.now(),frames=[],files={};let metadata=null,bytes=0,encodeMs=0,firstOutputMs=null;const resources={};
 try{
  const result=await processor.process({operationId,inputRevision,signal:controller.signal,timeoutMs:300000,frames:signal=>readMediaFrames(file,{signal,limits,onMetadata:m=>{metadata=m;telemetry?.onMetadata(m);},onResource:r=>resources[r]=(resources[r]??0)+1}),onFrame:async f=>{
   firstOutputMs??=performance.now()-started;const encodingStart=performance.now();const blob=await encodePng(f,{limits});encodeMs+=performance.now()-encodingStart;const stem=`frame-${String(f.sequence).padStart(4,'0')}`;
   if(bytes+blob.size+f.codes.byteLength>PROTOTYPE_LIMITS.maxArtifactBytes)throw Error('ARTIFACT_LIMIT');bytes+=blob.size+f.codes.byteLength;
   files[stem+'.png']=new Uint8Array(await blob.arrayBuffer());files[stem+'.lbp']=f.codes;
   frames.push({sequence:f.sequence,timestamp:f.timestamp,width:f.width,height:f.height,colorArtifact:stem+'.png',lbpArtifact:stem+'.lbp',histogram:Array.from(f.histogram),mapping:f.mapping,metrics:f.metrics,codeSha256:await sha(f.codes),colorSha256:await sha(f.data)});
  }});
  const manifest={schemaVersion:1,caller:'media-lab',buildId:MEDIA_BUILD,settings,input:{bytes:file.size,...metadata},operation:result,frames,resources};
  files['manifest.json']=strToU8(JSON.stringify(manifest,null,2));const packStart=performance.now(),zip=zipSync(files,{level:0});if(zip.length>PROTOTYPE_LIMITS.maxArtifactBytes)throw Error('ARTIFACT_LIMIT');
  return {zip,record:{operationId,settings,status:'succeeded',frameCount:result.frameCount,frameHashes:frames.map(f=>({timestamp:f.timestamp,color:f.colorSha256,lbp:f.codeSha256})),metrics:{...result.metrics,firstOutputMs,encodeMs,packagingMs:performance.now()-packStart,browserTotalMs:performance.now()-started,zipBytes:zip.length},resources:{...resources,sdk:result.resources,pool:processor.getStatus().pool},jobs:frames.flatMap(f=>f.metrics.jobs).filter((j,i,a)=>a.findIndex(k=>k.jobId===j.jobId)===i),telemetry:telemetry?.status()??{enabled:false}}};
 }catch(e){return {zip:null,record:{operationId,settings,status:e.operation?.status??(controller.signal.aborted?'cancelled':'failed'),code:String(e.message),metrics:{browserTotalMs:performance.now()-started},resources:{...resources,sdk:processor.getStatus().resources,pool:processor.getStatus().pool},telemetry:telemetry?.status()??{enabled:false}}};}
 finally{processor.dispose();processors.delete(processor);controllers.delete(controller);}
}
function medians(records,key){const groups={};for(const r of records){if(r.status!=='succeeded')continue;const value=String(r.settings[key]);(groups[value]??=[]).push(r.metrics.browserTotalMs);}return Object.fromEntries(Object.entries(groups).map(([k,a])=>{const sorted=a.toSorted((x,y)=>x-y),mid=Math.floor(a.length/2);return [k,{count:a.length,medianMs:a.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,minMs:sorted[0],maxMs:sorted.at(-1)}];}));}
async function run(kind){
 if(busy)return;const file=$('file').files[0];if(!file){$('status').textContent='ファイルを選択してください。';return;}
 reset();busy=true;stopped=false;for(const id of ['loader','chunks','single','shared','telemetry'])$(id).disabled=true;$('stop').disabled=false;
 const client=kind==='telemetry'?null:createTelemetryClient(),settings=options(),report={schemaVersion:1,buildId:MEDIA_BUILD,caller:'media-lab',kind,settings,createdAt:new Date().toISOString(),poolLifecycle:'fresh per comparison trial; same caller-owned pool for shared A/B/C',cacheCondition:'first observation then repeated browser cache; no forced cold reset',input:{bytes:file.size,sha256:null},records:[],scope:'browser decode through ZIP; excludes file chooser/download/AI reasoning; frame hashes add equal instrumentation to all conditions'};let last=null,sharedPool=null;
 if(kind==='telemetry'){report.incomplete=false;report.observationScope='Remote observer/transmission effect within decode-to-ZIP only; local SDK logs remain enabled';report.senderLifecycle='Fresh sender/grant for each on trial; none for off; finite drain outside measured interval before next trial';}
 try{
  if(file.size<=limits.maxFileBytes)report.input.sha256=await sha(await file.arrayBuffer());else report.input.hashReason='file-limit';
  if(stopped)throw Error('CANCELLED');
  if(kind==='shared'){
   report.poolEvents=[];activeReport=report;cancelRequest=null;lastAPhase=null;sharedPool=createComputePool({...settings,onUpdate:event=>{if(report.poolEvents.length<128)report.poolEvents.push({atMs:performance.now(),...event});if(event.inputRevision===101){lastAPhase=event.phase;if(cancelRequest&&['loading','computing'].includes(event.phase))applyCancel();}}});activePool=sharedPool;const a=crypto.randomUUID(),b=crypto.randomUUID();operationA=a;$('cancel-a').disabled=false;$('status').textContent='操作Aと操作Bを実行中。操作Aのみ取消できます。';
   const both=await Promise.all([trial(file,settings,{pool:sharedPool,operationId:a,client,inputRevision:101}),trial(file,settings,{pool:sharedPool,operationId:b,client,inputRevision:102})]);report.records=both.map((v,i)=>({...v.record,role:i?'B':'A'}));last=both[1].zip;const retry=await trial(file,settings,{pool:sharedPool,client,inputRevision:103});report.records.push({...retry.record,role:'C-reuse'});report.sharedPoolFinal=sharedPool.getStatus();report.cancelCheck={requested:!!report.cancellation,applied:report.cancellation?.applied??false,aCancelled:both[0].record.status==='cancelled',bSucceeded:both[1].record.status==='succeeded',reuseSucceeded:retry.record.status==='succeeded'};
  }else{
   const schedule=kind==='telemetry'?Array.from({length:20},(_,i)=>({...settings,remoteTelemetry:[true,false,false,true][i%4]})):kind==='loader'?Array.from({length:20},(_,i)=>({...settings,workerMode:['module','bundle','bundle','module'][i%4]})):kind==='chunks'?Array.from({length:30},(_,i)=>({...settings,chunkUnits:[1,2,4][(i%3+Math.floor(i/3))%3]})):[settings];
   report.schedule=schedule;for(let i=0;i<schedule.length;i++){
    if(stopped){if(kind==='telemetry')report.incomplete=true;break;}$('status').textContent=`測定中：${i+1}/${schedule.length}`;
    const trialClient=kind==='telemetry'?(schedule[i].remoteTelemetry?createTelemetryClient():null):client;let r;
    try{
     r=await trial(file,schedule[i],{client:trialClient});
     if(kind==='telemetry'){
      const drainStart=performance.now();let sender=null,settled=true,received=null;
      if(trialClient){for(let pass=0;pass<2;pass++){await trialClient.flush();sender=trialClient.status();if(!sender.pending&&!sender.inFlight)break;}settled=sender.pending===0&&sender.inFlight===false;received=sender.generated===2&&sender.stored+sender.duplicate===2&&sender.dropped+sender.rejected+sender.expired===0;}
      r.record.collectionDrain={elapsedMs:performance.now()-drainStart,settled,received,sender};if(!settled||(trialClient&&!received)||r.record.status!=='succeeded')report.incomplete=true;
     }
    }finally{if(kind==='telemetry')trialClient?.dispose();}
    report.records.push({...r.record,trial:i+1});last=r.zip??last;$('report').value=JSON.stringify(report,null,2);if(r.record.status!=='succeeded'||report.incomplete)break;
   }
   report.summary=medians(report.records,kind==='telemetry'?'remoteTelemetry':kind==='chunks'?'chunkUnits':'workerMode');
   if(kind==='telemetry'){
    report.blocks=[];for(let i=0;i<report.records.length;i+=4){const block=report.records.slice(i,i+4),complete=block.length===4&&block.every(r=>r.status==='succeeded'&&r.collectionDrain.settled&&(!r.settings.remoteTelemetry||r.collectionDrain.received));const on=block.filter(r=>r.settings.remoteTelemetry),off=block.filter(r=>!r.settings.remoteTelemetry),mean=rows=>rows.reduce((n,r)=>n+r.metrics.browserTotalMs,0)/rows.length;report.blocks.push({block:i/4+1,trials:block.map(r=>r.trial),complete,onMeanMinusOffMeanMs:complete?mean(on)-mean(off):null});}
   }
  }
  report.outputsIdentical=report.records.filter(r=>r.status==='succeeded').every((r,_,a)=>JSON.stringify(r.frameHashes)===JSON.stringify(a[0].frameHashes));
  if(client)await client.flush();report.collection=client?.status()??{scope:'per-trial collectionDrain; off has no sender'};$('collection').textContent='SDKログの受信状況：'+JSON.stringify(report.collection);$('report').value=JSON.stringify(report,null,2);
  $('save-report').href=url(new Blob([$('report').value],{type:'application/json'}));$('save-report').download='media-comparison.json';$('save-report').hidden=false;
  if(last){$('download').href=url(new Blob([last],{type:'application/zip'}));$('download').download='media-lab-last-output.zip';$('download').hidden=false;}
  $('status').textContent=`${report.incomplete?'比較未完了':'完了'}：${report.records.length}回の記録。`;
 }catch(e){$('status').textContent='確認を完了できませんでした：'+e.message;$('report').value=JSON.stringify({...report,error:e.message},null,2);}
 finally{client?.dispose();sharedPool?.dispose();operationA=null;activePool=null;activeReport=null;cancelRequest=null;busy=false;$('cancel-a').disabled=true;$('stop').disabled=true;for(const id of ['loader','chunks','single','shared','telemetry'])$(id).disabled=false;}
}
for(const kind of ['loader','chunks','single','shared','telemetry'])$(kind).addEventListener('click',()=>run(kind));
function applyCancel(){if(!activeReport||!cancelRequest||activeReport.cancellation?.applied)return;const phase=lastAPhase;let applied=false;for(const p of processors)applied=p.cancel(operationA)||applied;activeReport.cancellation={...cancelRequest,applied,appliedAtMs:performance.now(),phase,pool:activePool?.getStatus()};}
$('cancel-a').addEventListener('click',()=>{cancelRequest={requestedAtMs:performance.now(),phase:lastAPhase};if(activeReport)activeReport.cancellation={...cancelRequest,applied:false};if(['loading','computing'].includes(lastAPhase))applyCancel();$('cancel-a').disabled=true;});$('stop').addEventListener('click',stop);addEventListener('pagehide',()=>{stop();reset();});

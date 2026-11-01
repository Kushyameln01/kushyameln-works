/** Local Chromium harness. Private tensors stay in File inputs and browser memory. */
const demand=(value,message)=>{if(!value)throw Error(message);};
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),x=>x.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const phase=async name=>globalThis.__normalP4Phase?.({phase:name,atMs:performance.now()});
const file=id=>document.querySelector('#'+id).files[0];
const files=id=>new Map([...document.querySelector('#'+id).files].map(value=>[value.name,value]));
const shapeText=value=>JSON.stringify(value);
function assertPublicReceipt(value,path='receipt',seen=new WeakSet()){
 if(!value||typeof value!=='object'||seen.has(value))return;
 seen.add(value);demand(!ArrayBuffer.isView(value)&&!(value instanceof ArrayBuffer),'Private binary payload in public receipt: '+path);
 for(const [key,item] of Object.entries(value)){
  demand(key!=='data'&&key!=='raw'&&key!=='values','Private tensor payload field in public receipt: '+path+'.'+key);
  assertPublicReceipt(item,path+'.'+key,seen);
 }
}

function instrumentModel(model){
 const receipt={fileBytes:model.size,fullPayloadReadCalls:0,sliceCalls:0,sliceReadCalls:0,sliceReadBytes:0,maxSliceReadBytes:0};
 const slice=model.slice.bind(model);
 for(const method of ['arrayBuffer','text','stream'])Object.defineProperty(model,method,{value(){receipt.fullPayloadReadCalls++;throw Error('Full model payload read forbidden in validation');}});
 Object.defineProperty(model,'slice',{value(start=0,end=model.size,type){
  receipt.sliceCalls++;const part=slice(start,end,type),read=part.arrayBuffer.bind(part);
  Object.defineProperty(part,'arrayBuffer',{value:async()=>{receipt.sliceReadCalls++;receipt.sliceReadBytes+=part.size;receipt.maxSliceReadBytes=Math.max(receipt.maxSliceReadBytes,part.size);return read();}});
  return part;
 }});
 return receipt;
}

async function inputHashes(request){
 return {residualSHA256:await sha(request.residual.data),timeAct1SHA256:await sha(request.timeAct1.data),conditioningSHA256:await sha(request.conditioning.data),conditioningMaskSHA256:await sha(request.conditioning.attentionMask),conditioningMetadataSHA256:await sha(new TextEncoder().encode(JSON.stringify(Object.fromEntries(Object.entries(request.conditioning).filter(([key])=>!['data','attentionMask'].includes(key))))))};
}

function compare(actual,reference,absolute,relative){
 demand(actual instanceof Float32Array&&reference instanceof Float32Array&&actual.length===reference.length,'Exact comparison lengths required');
 let failures=0,nonfinite=0,maxAbsoluteError=0,maxRelativeError=0,maxGateRatio=0;
 for(let i=0;i<actual.length;i++){
  const x=actual[i],y=reference[i];if(!Number.isFinite(x)||!Number.isFinite(y)){nonfinite++;continue;}
  const error=Math.abs(x-y),limit=absolute+relative*Math.abs(y);failures+=error>limit?1:0;
  maxAbsoluteError=Math.max(maxAbsoluteError,error);maxRelativeError=Math.max(maxRelativeError,Math.abs(y)>0?error/Math.abs(y):error===0?0:Infinity);maxGateRatio=Math.max(maxGateRatio,limit>0?error/limit:error===0?0:Infinity);
 }
 return {passed:failures===0&&nonfinite===0,elements:actual.length,failedElements:failures,nonfiniteElements:nonfinite,maxAbsoluteError,maxRelativeError:Number.isFinite(maxRelativeError)?maxRelativeError:null,maxGateRatio:Number.isFinite(maxGateRatio)?maxGateRatio:null,gate:{absolute,relative,rule:'abs(actual-reference) <= absolute + relative*abs(reference); all values'}};
}

async function referenceMap(id,manifestId){
 const manifest=JSON.parse(await file(manifestId).text()),selected=files(id),out={};
 demand(Object.keys(manifest.arrays).length===25&&selected.size===25,'Frozen all25 references required');
 for(const [name,entry] of Object.entries(manifest.arrays)){
  const input=selected.get(entry.path);demand(input&&input.size===entry.bytes,'Frozen reference file length mismatch: '+name);
  const buffer=await input.arrayBuffer();demand(await sha(buffer)===entry.sha256,'Frozen reference file SHA256 mismatch: '+name);
  out[name]={data:new Float32Array(buffer),shape:entry.shape,sha256:entry.sha256};
 }
 return {arrays:out,manifestSHA256:await sha(await file(manifestId).arrayBuffer()),gates:manifest.gates};
}

async function rejected(operation){
 try{await operation();return {rejected:false};}catch(error){return {rejected:true,errorName:error.name,errorCode:error.code??null,errorMessage:String(error.message).slice(0,240)};}
}

function zeroCounters(value,names,path='owner',out=[]){
 if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
  if(names.includes(key))out.push({path:path+'.'+key,value:item});
  else if(item&&typeof item==='object'&&!ArrayBuffer.isView(item))zeroCounters(item,names,path+'.'+key,out);
 }
 return out;
}

export async function runNormalP4BrowserValidation(){
 const {publicMetrics,publicEvidence}=await import('/shared/diffusion-models/diagnostics/p4-cross-ffn/run.mjs');
 const {createBerniniP4Execution}=await import('/shared/diffusion-models/execution/p4.mjs');
 const saved=JSON.parse(await file('saved').text()),native=JSON.parse(await file('native').text());
 const request={blockIndex:0,contextLatents:[],residual:{data:Float32Array.from(saved.arrays.residual),shape:[2,5120],dtype:'float32',layout:'LC',meaning:'bernini-block0-post-self-attention-hidden:v1',normalization:'none'},timeAct1:{data:Float32Array.from(saved.inputs.timeAct1),shape:[5120],dtype:'float32',layout:'C',meaning:'bernini-time-embedding-silu:v1',normalization:'none'},conditioning:{...native,data:Float32Array.from(native.data),attentionMask:Uint8Array.from(native.attentionMask),normalization:'encoder-final-rmsnorm'}};
 const before=await inputHashes(request),model=file('model'),modelRead=instrumentModel(model),phases=[];
 let owner;
 const capture=async name=>{const stats=owner?.stats();phases.push({phase:name,atMs:performance.now(),stats:stats??null,jsHeap:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit}:null});await phase(name);};
 const result={schemaVersion:'bernini-normal-p4-browser-validation/0.1',side:'LOW',scope:'BOUNDED_N2_BLOCK0_P4_ONLY',passed:false,inputHashes:before,modelRead,phases};
 try{
  await capture('before-factory');owner=await createBerniniP4Execution({file:model,side:'LOW'});await capture('factory-ready');
  result.factory={methods:['describe','checkSupport','run','diagnose','weightFeed','dispose','stats'].filter(name=>typeof owner[name]==='function'||name==='weightFeed'&&owner[name]),description:owner.describe(),model:owner.model??null};
  result.support=await owner.checkSupport(request);demand(result.support.supported===true,'Valid flat normal request must report supported');
  await capture('normal-start');let seen=new Set();const normalBegan=performance.now();
  const normal=await owner.run(request,{onProgress(event){const key=event.operator??event.stage;if(!seen.has(key)){seen.add(key);phase('normal:'+key);}}});
  result.normal={elapsedMs:performance.now()-normalBegan,keys:Object.keys(normal),tensorKeys:Object.keys(normal.tensor??{}),state:normal.state,resources:normal.resources};
  demand(['tensor','state','resources'].every(name=>Object.hasOwn(normal,name))&&Object.keys(normal).every(name=>['tensor','state','resources','elapsedMs'].includes(name)),'Normal result must contain final tensor and execution metadata only');
  const tensor=normal.tensor;demand(tensor?.data instanceof Float32Array&&tensor.data.length===10240&&same(tensor.shape,[2,5120])&&tensor.layout==='LC'&&tensor.dtype==='float32'&&tensor.meaning==='bernini-block0-output-hidden:v1'&&tensor.normalization==='none','Normal result tensor descriptor mismatch');
  result.normal.outputSHA256=await sha(tensor.data);result.normal.outputBytes=tensor.data.byteLength;
  result.normal.inputsPreserved=same(before,await inputHashes(request));demand(result.normal.inputsPreserved,'Normal run changed input buffers/metadata');
  const normalOutput=new Float32Array(tensor.data);
  // Open reference arrays after the normal call so their host memory is excluded from its run.
  const composed=await referenceMap('composed','composedManifest'),local=await referenceMap('local','localManifest');
  result.references={composedManifestSHA256:composed.manifestSHA256,localManifestSHA256:local.manifestSHA256,originalGatesUnchanged:same(composed.gates,{localCut:{abs:.001,rel:.0001},composed:{abs:.01,rel:.001},rule:'abs(actual-reference) <= abs + rel*abs(reference); all values, no percentile pass'})};
  demand(result.references.originalGatesUnchanged&&same(local.gates,composed.gates),'Original frozen numerical gates changed');
  result.normal.composed=compare(normalOutput,composed.arrays.blockOutput.data,.01,.001);demand(result.normal.composed.passed,'Normal final tensor failed old composed reference gate');
  await capture('normal-complete');assertPublicReceipt(result);await globalThis.__normalP4Checkpoint?.(result);seen=new Set();await capture('diagnose-start');const diagnoseBegan=performance.now();
  const diagnostic=await owner.diagnose(request,{onProgress(event){const key=event.operator??event.stage;if(!seen.has(key)){seen.add(key);phase('diagnose:'+key);}}});
  result.diagnostic={elapsedMs:performance.now()-diagnoseBegan,outputCount:25,allCuts:{},evidence:publicEvidence(diagnostic.evidence)};
  for(const [name,reference] of Object.entries(composed.arrays)){
   const actual=diagnostic[name];demand(actual instanceof Float32Array,'Missing diagnostic output: '+name);
   const cut={shape:reference.shape,bytes:actual.byteLength,sha256:await sha(actual),composed:compare(actual,reference.data,.01,.001),local:compare(actual,local.arrays[name].data,.001,.0001)};
   result.diagnostic.allCuts[name]=cut;demand(cut.composed.passed&&cut.local.passed,'Old reference gate failed: '+name);
  }
  result.diagnostic.normalFinalBitIdentical=await sha(diagnostic.blockOutput)===result.normal.outputSHA256;
  result.diagnostic.inputsPreserved=same(before,await inputHashes(request));demand(result.diagnostic.normalFinalBitIdentical&&result.diagnostic.inputsPreserved,'Normal/diagnostic equivalence or input preservation failed');
  await capture('diagnose-complete');assertPublicReceipt(result);await globalThis.__normalP4Checkpoint?.(result);
  await capture('weight-feed-start');
  const {runNormalWeightFeedBrowserCase}=await import('/shared/diffusion-models/execution/weight-feed-browser.mjs');
  const patchResponse=await fetch('/_normal-p4-private-patch.json');demand(patchResponse.ok,'Retained native prepared patch unavailable');
  result.weightFeed=await runNormalWeightFeedBrowserCase({owner,patchArtifact:await patchResponse.json(),crossNorm:new Float32Array(await file('crossNorm').arrayBuffer()),expectedQ:new Float32Array(await file('expectedQ').arrayBuffer())});
  demand(result.weightFeed.passed===true,'Normal committed weight-feed projection check failed');
  await capture('weight-feed-complete');assertPublicReceipt(result);await globalThis.__normalP4Checkpoint?.(result);
  const unsupported=[];
  for(const [name,change] of [['N3',{residual:{...request.residual,shape:[3,5120]}}],['N32760',{residual:{...request.residual,shape:[32760,5120]}}],['context-latent',{contextLatents:[{shape:[1,5120],dtype:'float32',layout:'LC',meaning:'context',normalization:'none',data:new Float32Array(5120)}]}]]){
   const candidate={...request,...change},reads=modelRead.sliceReadCalls,support=await owner.checkSupport(candidate),rejection=await rejected(()=>owner.run(candidate));
   unsupported.push({name,support,...rejection,modelReadsAdded:modelRead.sliceReadCalls-reads});demand(support.supported===false&&rejection.rejected&&modelRead.sliceReadCalls===reads,'Unsupported request reached model arithmetic: '+name);
  }
  result.unsupported=unsupported;
  // Changed native payload and hidden values with valid identity metadata must reach an actual tile.
  const altered={...request,residual:{...request.residual,data:new Float32Array(request.residual.data)},timeAct1:{...request.timeAct1,data:new Float32Array(request.timeAct1.data)},conditioning:{dtype:'float32',layout:'BLC',meaning:'text_hidden_states',normalization:'encoder-final-rmsnorm',shape:[1,1,4096],data:request.conditioning.data.slice(0,4096),attentionMask:new Uint8Array([1]),modelSha256:request.conditioning.modelSha256,tokenizerSha256:request.conditioning.tokenizerSha256,producer:{module:'text_encoder',sourceCommit:'altered-nonfixture-metadata'},diagnosticVariant:'changed-L1-hidden-and-text'}};
  altered.residual.data[0]+=0.125;altered.timeAct1.data[0]-=0.25;altered.conditioning.data[0]+=0.375;
  const alteredBefore=await inputHashes(altered),controller=new AbortController();let tile=null;
  result.altered={inputHashes:alteredBefore,support:await owner.checkSupport(altered),notFrozenPayload:alteredBefore.conditioningSHA256!==before.conditioningSHA256,notFrozenHidden:alteredBefore.residualSHA256!==before.residualSHA256};demand(result.altered.support.supported===true,'Valid altered L1 request must report supported');
  const cancelledBefore=owner.stats().stage.cancelledRuns,cancelBegan=performance.now();await capture('altered-L1-start');
  const running=owner.run(altered,{signal:controller.signal,onProgress(event){if(!tile&&event.stage==='projection'){tile={stage:event.stage,operator:event.operator,sourceRowStart:event.sourceRowStart,completedRows:event.completedRows,totalRows:event.totalRows,textRows:event.textRows,tiles:event.tiles};controller.abort();}}});
  const busy=await rejected(()=>owner.run(altered));const cancel=await rejected(()=>running);
  Object.assign(result.altered,{busy,cancel,cancelElapsedMs:performance.now()-cancelBegan,completedTile:tile,inputsPreserved:same(alteredBefore,await inputHashes(altered)),statsAfterCancel:owner.stats()});
  demand(busy.rejected&&/busy/i.test(busy.errorMessage)&&cancel.rejected&&cancel.errorName==='AbortError'&&result.altered.statsAfterCancel.stage.cancelledRuns===cancelledBefore+1&&tile&&tile.tiles>0&&result.altered.inputsPreserved,'Altered nonfixture/busy/cancel/input-preservation check failed');
  const afterCancelCounters=zeroCounters(owner.stats(),['readLeases','pendingTensors']);result.altered.releasedCounters=afterCancelCounters;demand(['readLeases','pendingTensors'].every(name=>afterCancelCounters.some(row=>row.path.endsWith('.'+name)))&&afterCancelCounters.every(row=>row.value===0),'Cancellation retained a read lease/pending tensor or omitted required counters');
  await capture('altered-L1-cancelled');
  const disposeBegan=performance.now();await owner.dispose();result.disposal={elapsedMs:performance.now()-disposeBegan,stats:owner.stats()};
  result.disposal.releasedCounters=zeroCounters(result.disposal.stats,['activeORTSessions','readLeases','pendingTensors']);
  result.disposal.runAfterDispose=await rejected(()=>owner.run(request));
  demand(result.disposal.stats.disposed===true&&['activeORTSessions','readLeases'].every(name=>result.disposal.releasedCounters.some(row=>row.path.endsWith('.'+name)))&&result.disposal.releasedCounters.every(row=>row.value===0)&&result.disposal.runAfterDispose.rejected,'Dispose failed to release owned resources');
  await capture('disposed');
  demand(modelRead.fullPayloadReadCalls===0&&modelRead.sliceReadCalls>0&&modelRead.maxSliceReadBytes<modelRead.fileBytes,'Model must enter through bounded File slices');
  result.passed=true;assertPublicReceipt(result);return result;
 }finally{await owner?.dispose();}
}

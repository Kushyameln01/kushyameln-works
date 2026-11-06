import {capacityPlan,createControlledInput,PROFILE,INPUT_ROWS,INPUT_INNER,OUTPUT_COLUMNS} from './plan.mjs';

const demand=(condition,message)=>{if(!condition)throw Error(message);};
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),v=>v.toString(16).padStart(2,'0')).join('');
const metadata=error=>({name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,1000)});
const abort=signal=>AbortSignal.prototype.throwIfAborted.call(signal);
const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
function pageSnapshot(value){
 const bits=new Uint32Array(value.buffer,value.byteOffset,value.length),count=Math.ceil(value.length/1024),samples=new Uint32Array(count+1);
 for(let n=0;n<count;n++)samples[n]=bits[n*1024];samples[count]=bits[bits.length-1];
 return samples;
}
function pagesEqual(value,samples){
 const bits=new Uint32Array(value.buffer,value.byteOffset,value.length),count=Math.ceil(value.length/1024);
 if(samples.length!==count+1)return false;
 for(let n=0;n<count;n++)if(samples[n]!==bits[n*1024])return false;
 return samples[count]===bits[bits.length-1];
}
function checkHiddenStores(stores,plan){
 let checked=0;
 for(let n=0;n<stores.length;n++){
  const value=stores[n],expected=(n+1)/8;
  demand(value.length===plan.totalTokens*5120&&value.byteLength===plan.hostStoreBytes,'Native host-store extent changed');
  for(let i=0;i<value.length;i+=1024){demand(value[i]===expected,'Capacity sentinel page changed');checked++;}
  demand(value[value.length-1]===expected,'Capacity sentinel tail changed');checked++;
 }
 return checked;
}

/** Explicitly invoked diagnostic only; no tensors enter the normal module API. */
export async function runTargetCapacity({file,contract,referenceBytes,referenceMeta,memoryObserver,checkpoint,timeoutMs=600000,cancelAfterStage=null}={}){
 demand(file instanceof File,'Actual original LOW File required');
 demand(typeof checkpoint==='function','Diagnostic checkpoint receiver required');
 demand(new Uint32Array(new Uint8Array([1,0,0,0]).buffer)[0]===1,'Little-endian F32 diagnostic runtime required');
 demand(contract.profileId===PROFILE&&contract.gate.absolute===.001&&contract.gate.relative===.0001,'Fixed pre-execution profile/gate required');
 const plan=capacityPlan();demand(stable(plan)===stable(contract.plan),'Fixed canonical capacity plan required');
 const controller=new AbortController(),started=performance.now(),events=[];
 let source=null,ops=null,math=null,stores=[],weights=[],weightSamples=[],input=null,projection=null,biased=null,reference=null,outcome='failed',error=null,cleanupErrors=[],checkpointErrors=[],result=null;
 const emit=async(stage,extra={})=>{
  const record={stage,elapsedMs:performance.now()-started,...extra,resources:{source:source?.stats()??null,ops:ops?.stats()??null,math:math?.stats()??null,liveHostStoreCount:stores.length,liveHostStoreBytes:stores.reduce((n,v)=>n+v.byteLength,0),liveWeightCacheBytes:weights.reduce((n,v)=>n+v.byteLength,0)},wasmMemory:memoryObserver.sample(stage)};
  events.push(record);await checkpoint(record);
  if(stage===cancelAfterStage)controller.abort(new DOMException('Requested diagnostic stage cancellation','AbortError'));
  abort(controller.signal);
 };
 const timer=setTimeout(()=>controller.abort(new DOMException('Capacity diagnostic timeout','AbortError')),timeoutMs);
 const matrix=async(key,start,count,registry)=>{
  const entry=registry.entries[key],columns=entry.columns;
  demand(entry.binding.kind==='runtime-input'&&entry.fullShape.length===2,'Actual matrix runtime binding required');
  demand(start>=0&&count>=1&&start+count<=entry.fullShape[0],'Actual source row bounds');
  const output=new Float32Array(count*columns);weights.push(output);
  for(let first=0;first<count;first+=entry.maxRows){
   abort(controller.signal);const rows=Math.min(entry.maxRows,count-first),read=await source.readRows(key,start+first,rows,{signal:controller.signal,diagnostics:false});
   demand(read.values.length===rows*columns,'Actual owned source block extent mismatch');output.set(read.values,first*columns);
  }
  return output;
 };
 try{
  const weightsModule=await import('../../../../docs/shared/diffusion-models/execution/model-weights.mjs');
  const opsModule=await import('../../../../docs/shared/diffusion-models/execution/batched-ops.mjs');
  const mathModule=await import('../../../../docs/shared/diffusion-models/execution/model-math.mjs');
  await emit('before-owner-create');
  source=await weightsModule.createFullModelWeightSource({file,side:'LOW',decoder:'lookup',signal:controller.signal});
  const registry=source.describe();
  demand(registry.modelHash===contract.model.previouslyVerifiedModelSHA256&&registry.headerSHA256===contract.model.headerSHA256,'Pinned actual LOW source identity required');
  ops=await opsModule.createBatchedModelOps();math=await mathModule.createModelMath();
  await emit('owners-ready',{sourceIdentity:{side:registry.side,modelHash:registry.modelHash,headerSHA256:registry.headerSHA256,fullFileHashRecomputed:false,registryTargetCount:registry.targetCount}});
  for(let n=0;n<plan.hostStoreCount;n++){
   abort(controller.signal);const value=new Float32Array(plan.totalTokens*5120);value.fill((n+1)/8);stores.push(value);
   await emit('host-store-allocated',{storeIndex:n,nativeBytes:value.byteLength,meaning:'capacity-sentinel-not-model-hidden'});
  }
  await emit('host-stores-ready',{pageSentinelsChecked:checkHiddenStores(stores,plan),hiddenPayloadHashed:false});
  const up=registry.entries['blocks.0.ffn.0.weight'],down=registry.entries['blocks.0.ffn.2.weight'];
  demand(JSON.stringify(up.fullShape)==='[13824,5120]'&&JSON.stringify(down.fullShape)==='[5120,13824]','Actual original FFN shapes required');
  for(const [start,count]of [[0,5120],[5120,5120],[10240,3584]]){await matrix('blocks.0.ffn.0.weight',start,count,registry);await emit('up-chunk-staged',{rowStart:start,rowCount:count});}
  const downWeight=await matrix('blocks.0.ffn.2.weight',0,OUTPUT_COLUMNS,registry);
  const bias=(await source.readVector('blocks.0.ffn.2.bias',0,OUTPUT_COLUMNS,{signal:controller.signal})).values;
  demand(weights.reduce((n,v)=>n+v.byteLength,0)===plan.components.ffnStageCache,'Exact complete FFN cache required');
  weightSamples=weights.map(pageSnapshot);
  await emit('weights-ready',{weightBindings:contract.weightBindings,weightPageSampleCount:weightSamples.reduce((n,v)=>n+v.length,0),fullWeightHashComputed:false});
  input=createControlledInput();const inputBefore=await sha(input);
  demand(inputBefore===contract.input.sha256&&inputBefore===referenceMeta.inputSHA256,'Independent/native exact controlled input identity required');
  demand(await sha(referenceBytes)===referenceMeta.outputSHA256&&referenceBytes.byteLength===OUTPUT_COLUMNS*INPUT_ROWS*4,'Private independent reference bytes/hash required');
  reference=new Float32Array(referenceBytes);
  demand(reference.length===655360&&reference.every(Number.isFinite),'Complete finite independent reference required');
  await emit('before-linear',{inputSHA256:inputBefore,inputBytes:input.byteLength,rows:INPUT_ROWS,columns:OUTPUT_COLUMNS,inner:INPUT_INNER});
  const linear=await ops.linear({x:input,weight:downWeight,rows:INPUT_ROWS,columns:OUTPUT_COLUMNS,inner:INPUT_INNER,signal:controller.signal});projection=linear.output;
  demand(projection instanceof Float32Array&&projection.length===655360&&projection.byteLength===2621440,'Complete655360-value native projection required');
  await emit('after-linear',{linearEvidence:linear.evidence});
  biased=math.bias({input:projection,bias,rows:INPUT_ROWS,width:OUTPUT_COLUMNS});
  demand(biased instanceof Float32Array&&biased.length===655360&&biased.byteLength===2621440,'Complete655360-value native biased projection required');
  const inputAfter=await sha(input);demand(inputAfter===inputBefore,'Controlled input was mutated');
  const weightsPagePreserved=weights.every((value,n)=>pagesEqual(value,weightSamples[n]));demand(weightsPagePreserved,'A staged weight page sentinel was mutated');
  const sentinels=checkHiddenStores(stores,plan);let failed=0,nonfinite=0,maxAbs=0,maxGateFraction=0;
  for(let n=0;n<biased.length;n++){
   const actual=biased[n],expected=reference[n];if(!Number.isFinite(actual)||!Number.isFinite(expected)){nonfinite++;failed++;continue;}
   const delta=Math.abs(actual-expected),limit=contract.gate.absolute+contract.gate.relative*Math.abs(expected);maxAbs=Math.max(maxAbs,delta);maxGateFraction=Math.max(maxGateFraction,delta/limit);if(delta>limit)failed++;
  }
  result={comparedElements:biased.length,failed,nonfinite,maxAbs,maxGateFraction,projectionSHA256:await sha(projection),biasedProjectionSHA256:await sha(biased),inputSHA256Preserved:true,inputSHA256:inputAfter,weightsPagePreserved,weightPreservationScope:'One native F32 word per4096byte page plus exact tail, not a full-weight bit comparison',hiddenPageSentinelsChecked:sentinels,hiddenPreservationScope:'Nonzero-filled capacity sentinels sampled per4096byte page plus tail; no payload hash and no real hidden meaning'};
  await emit('compared',{comparison:result});demand(failed===0&&nonfinite===0,'Fixed all-value gate failed');outcome='completed';
 }catch(caught){error=metadata(caught);outcome=controller.signal.aborted?'cancelled':'blocked';}
 finally{
  clearTimeout(timer);
  const before={stage:'before-dispose',elapsedMs:performance.now()-started,wasmMemory:memoryObserver.sample('before-dispose'),logicalHostStoreBytes:stores.reduce((n,v)=>n+v.byteLength,0),logicalWeightCacheBytes:weights.reduce((n,v)=>n+v.byteLength,0)};events.push(before);try{await checkpoint(before);}catch(caught){checkpointErrors.push(metadata(caught));}
  stores=[];weights=[];weightSamples=[];input=null;projection=null;biased=null;reference=null;
  for(const release of [async()=>await ops?.dispose(),async()=>math?.dispose(),async()=>source?.dispose()])try{await release();}catch(caught){cleanupErrors.push(metadata(caught));}
  const after={stage:'after-dispose',elapsedMs:performance.now()-started,wasmMemory:memoryObserver.sample('after-dispose'),logicalHostStoreCount:stores.length,logicalWeightCacheBytes:0,ops:ops?.stats()??null,math:math?.stats()??null,source:source?.stats()??null};events.push(after);try{await checkpoint(after);}catch(caught){checkpointErrors.push(metadata(caught));}
  if(cleanupErrors.length||checkpointErrors.length)outcome='blocked';
 }
 return {schemaVersion:'bernini-target-capacity-result/0.1',profileId:PROFILE,outcome,passed:outcome==='completed',plan,comparison:result,error,cleanupErrors,checkpointErrors,elapsedMs:performance.now()-started,wasmMemory:memoryObserver.sample('returned-after-dispose'),resources:{ops:ops?.stats()??null,math:math?.stats()??null,source:source?.stats()??null},events,
  scope:{capacitySentinelsOnly:true,actualOriginalLowFfnDownTile:result!==null,fullInnerDimension:13824,all655360OutputsCompared:result?.comparedElements===655360,noHiddenPayloadHash:true,realProductionHidden:false,allQueryExecution:false,full40Prediction:false,sampling:false,acceptedProduction:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY',generationReady:false},releaseMeaning:'Logical owner/session/tensor disposal and browser closure; reachable WASM memories may remain before browser closure; no forced GC or OS-release claim'};
}

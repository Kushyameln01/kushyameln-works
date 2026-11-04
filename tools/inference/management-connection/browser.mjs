import * as native from '/shared/inference/api.mjs';
import {createManagedInferenceBridge,createCurrentNativeCodec,captureRestoredConditioning} from '/shared/inference/management-adapter.mjs';
import {createTextVaeAdapter} from '/manager/docs/shared/ai-connection/adapters/text-vae.mjs';
import {createInvocationQueue} from '/manager/docs/shared/ai-connection/queue.mjs';
import * as artifacts from '/manager/docs/shared/ai-connection/adapters/artifacts.mjs';
import * as workspace from '/manager/docs/shared/ai-connection/management-workspace.mjs';
import * as diffusion from '/diffusion/docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs';
import {createObservationArchive,appendObservation} from './observation-archive.mjs';

const check=(ok,message)=>{if(!ok)throw Error(message);};
// Management canonical JSON sorts object keys. Compare metadata structurally;
// array/axis order, typed bytes, field presence and identity values stay strict.
function same(a,b){
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){
  if(!ArrayBuffer.isView(a)||!ArrayBuffer.isView(b)||a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;
  const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);return x.every((v,i)=>v===y[i]);
 }
 if(Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
}
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
async function selected(id){const files=new Map(Array.from(document.querySelector(id).files,file=>[file.name,file]));return {manifest:JSON.parse(await files.get('manifest.json').text()),files};}
async function fetchBytes(name){const r=await fetch('/inputs/'+name);check(r.ok,'Missing selected input '+name);return new Uint8Array(await r.arrayBuffer());}
function compare(actual,expected,gate){let maxAbs=0,squared=0,allclose=actual.length===expected.length;for(let i=0;i<expected.length;i++){const e=Math.abs(actual[i]-expected[i]);maxAbs=Math.max(maxAbs,e);squared+=e*e;if(!Number.isFinite(actual[i])||e>gate.atol+gate.rtol*Math.abs(expected[i]))allclose=false;}return {elements:expected.length,maxAbs,rmse:Math.sqrt(squared/expected.length),gate,passed:allclose&&maxAbs<=gate.maxAbs};}
function download(name,bytes){const url=URL.createObjectURL(new Blob([bytes])),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}

globalThis.runManagementConnection=async spec=>{
 const result={passed:false,scope:'Actual management adapter/shared queue and actual browser native API, selected cases only',executionSourceSha:spec.executionSourceSha,managementSourceSha:spec.managementSourceSha,diffusionSourceSha:spec.diffusionSourceSha,newExports:0,newOracleRuns:0,generatedProductionAccepted:false,generationReady:false,workers:[],phases:[],comparisons:{},storage:[]};
 let api,bridge,phase='setup',cancelPromise,cancelIssued=false,textCancelPromise,textCancelIssued=false;
 const phaseStart=performance.now(),mark=value=>{phase=value;const event={phase,epochMs:Date.now(),elapsedSeconds:(performance.now()-phaseStart)/1000};result.phases.push(event);console.log('management-connection-progress:'+JSON.stringify(event));};
 const workerFactory=()=>{
  const worker=new Worker('/observer/owner-normal-worker.mjs',{type:'module'}),record={phase,index:result.workers.length,terminated:false,observations:createObservationArchive()};result.workers.push(record);
  const terminate=worker.terminate.bind(worker);worker.terminate=()=>{record.terminated=true;record.terminatedAtEpochMs=Date.now();return terminate();};
  worker.addEventListener('message',({data})=>{
   if(!data.ownerObservation)return;appendObservation(record.observations,{type:data.type,...data.ownerObservation});
   if(phase==='rect-cancel'&&!cancelIssued&&data.ownerObservation.event==='session-created'){
    cancelIssued=true;const target=bridge.inspect().targets.find(x=>x.module==='vae'&&x.operation==='decode')?.target;check(target,'Exact active management cancellation target');cancelPromise=bridge.cancel(target);
   }
  });return worker;
 };
 async function persist(name,execution){
  const inputs=execution.inputRecord?{[execution.inputRecord.descriptor.artifactId]:execution.inputRecord}:{};
  const saved=await bridge.save({records:{[name]:execution.record},inputs});
  const loaded=await bridge.read(saved.bytes),t=loaded.artifacts[name].tensor;
  check(equal(t.data,execution.native.tensor.data),'Management changed native tensor values');
  check(same(native.describeTensor(t),native.describeTensor(execution.native.tensor)),'Management changed native metadata');
  if(execution.inputRecord){const input=loaded.artifacts[execution.inputRecord.descriptor.artifactId].tensor;check(equal(input.data,execution.inputRecord.tensor.data),'Original decode/encode input payload lost');check(same(native.describeTensor(input),native.describeTensor(execution.inputRecord.tensor)),'Input producer/decoder/context metadata lost');}
  check(same(loaded.artifacts[name].trace.records[0].data.native.binding,execution.native.binding),'Native binding lost from outer trace');
  const bytes=await native.encodeTensor(t);download(name+'.wktensor',bytes);download(name+'.management.zip',saved.bytes);
  result.storage.push({name,packageBytes:saved.bytes.length,packageSha256:await sha(saved.bytes),wktBytes:bytes.length,wktSha256:await sha(bytes),payloadAndMetadataExact:true,inputRetained:!!execution.inputRecord,receipt:saved.receipt});return loaded.artifacts[name];
 }
 try{
  api=native.createInferenceAPI({workerFactory,onState:state=>{
   if(phase!=='text-cancel'||textCancelIssued||!spec.textCancelStage||state.module!=='text_encoder'||state.progress?.stage!==spec.textCancelStage)return;
   const target=bridge?.inspect().targets.find(x=>x.module==='text_encoder'&&x.operation==='encode')?.target;
   if(!target)return;
   textCancelIssued=true;result.textCancel={stage:spec.textCancelStage,boundary:structuredClone(state.progress),target:structuredClone(target)};
   textCancelPromise=bridge.cancel(target);
  }});
  const manager={createTextVaeAdapter,createInvocationQueue,...artifacts,...workspace},sourceRef={repository:'Kushyameln01/kushyameln-works',commit:spec.executionSourceSha,path:'docs/shared/inference/api.mjs'};
  bridge=createManagedInferenceBridge({manager,nativeAPI:api,nativeModule:native,sourceRef,codec:createCurrentNativeCodec(native,sourceRef)});
  if(spec.scope==='rect'||spec.scope==='both'){
   await bridge.configure('vae',await selected('#vae-bundle'));
   const raw=await native.decodeTensor(await fetchBytes('generated.wktensor'));
   check(raw.meaning==='wan21-raw-generated-sample:v1'&&raw.latentContract?.normalization.state==='restored','Selected saved sample must be Diffusion-restored raw');
   result.sampleInput=native.describeTensor(raw);
   const existingMean=await native.decodeTensor(await fetchBytes('mean.wktensor'));
   const encodeInput={dtype:'float32',shape:[1,3,1,16,32],layout:'NCTHW',meaning:'rgb-unit',data:new Float32Array((await fetchBytes('png-unit.f32')).buffer),context:existingMean.context};
   result.support=bridge.querySupport('vae','encode',native.describeTensor(encodeInput));check(result.support.support.supported,'Configured Rect capability must support input');
   result.unsupported81=bridge.querySupport('vae','encode',{...native.describeTensor(encodeInput),shape:[1,3,81,480,832]});check(!result.unsupported81.support.supported,'Fixed Rect graph must reject target81');
   if(!spec.preflightOnly){
    mark('rect-cancel');try{await bridge.execute({module:'vae',operation:'decode',input:raw});throw Error('Requested cancellation did not reject');}catch(e){check(e.code==='INVOCATION_CANCELLED','Unexpected cancel error: '+e);result.cancel={errorCode:e.code};}
    result.cancel.barrier=await cancelPromise;check(cancelIssued&&result.cancel.barrier.originalTerminal&&result.cancel.barrier.resourceReleased&&result.cancel.barrier.reusable,'Original terminal/release cancellation barrier');
    mark('rect-encode');const encoded=await bridge.execute({module:'vae',operation:'encode',input:encodeInput});
    result.comparisons.mean=compare(encoded.native.tensor.data,new Float32Array((await fetchBytes('png-mean.f32')).buffer),spec.vaeGate);check(result.comparisons.mean.passed,'Rect mean independent reference comparison');await persist('rect-mean',encoded);
    mark('rect-mean-decode');const decoded=await bridge.execute({module:'vae',operation:'decode',input:encoded.native.tensor});
    result.comparisons.rgb=compare(decoded.native.tensor.data,new Float32Array((await fetchBytes('png-roundtrip.f32')).buffer),spec.vaeGate);check(result.comparisons.rgb.passed,'Rect RGB independent reference comparison');await persist('rect-rgb',decoded);
    mark('restored-generated-decode');const generated=await bridge.execute({module:'vae',operation:'decode',input:raw});
    check(same(generated.native.inputDescriptor.latentContract,raw.latentContract),'Generated producer/decoder/restoration metadata changed');check(generated.native.binding.assetsVerified&&generated.native.binding.graphMetadataChecked,'Actual decode graph/asset checks');await persist('saved-generated-rgb',generated);
    result.savedGeneratedDecode={scope:'Synthetic saved contract input; actual VAE decode and management storage; no real Diffusion generation acceptance',inputDescriptor:generated.native.inputDescriptor,binding:generated.native.binding};
   }
  }
  if(spec.scope==='text'||spec.scope==='both'){
   const configuration=await selected('#text-bundle'),source=document.querySelector('#text-source').files[0];
   const selectedManifestSha256=await sha(await configuration.files.get('manifest.json').arrayBuffer());
   check(selectedManifestSha256===spec.textManifestMapping?.selectedSha256,'Runtime selected Text manifest differs from explicit mapping');
   check(spec.plainInput.manifestSha256===spec.textManifestMapping.originalSha256,'Original independent input manifest binding changed');
   result.textManifestMapping=structuredClone(spec.textManifestMapping);
   configuration.files.set(configuration.manifest.embedding.sourceFile,source);await bridge.configure('text_encoder',configuration);
   const plainInput=spec.plainInput;
   result.textSupport=bridge.querySupport('text_encoder','encode',{text:plainInput.text});check(result.textSupport.support.supported,'Configured Text support');
   if(!spec.preflightOnly){
    const expected=new Float32Array((await fetchBytes('plain-reference.f32')).buffer);
    if(spec.textCancelStage){
     mark('text-cancel');try{await bridge.execute({module:'text_encoder',operation:'encode',input:{text:plainInput.text}});throw Error('Requested Text execution-hash cancellation did not reject');}catch(e){check(e.code==='INVOCATION_CANCELLED','Unexpected Text cancel error: '+e);}
     check(textCancelIssued&&textCancelPromise,'Requested native execution-hash progress was not observed');
     result.textCancel.barrier=await textCancelPromise;
     check(result.textCancel.barrier.originalTerminal&&result.textCancel.barrier.resourceReleased&&result.textCancel.barrier.reusable,'Text original terminal/release cancellation barrier');
    }
    for(const [name,input]of [['text-plain',{text:plainInput.text}],['text-id',{tokenIds:plainInput.tokenIds,attentionMask:plainInput.attentionMask}]]){
     mark(name);const execution=await bridge.execute({module:'text_encoder',operation:'encode',input});
     result.comparisons[name]=compare(execution.native.tensor.data,expected,spec.textGate);check(result.comparisons[name].passed,'Selected Text mode independent all-value comparison');
     const restored=await persist(name,execution),capture=captureRestoredConditioning({record:restored,diffusion}),snapshot=diffusion.snapshotP4CapturedConditioning(capture);
     check(equal(snapshot.data,execution.native.tensor.data)&&equal(snapshot.attentionMask,execution.native.tensor.attentionMask),'Real P4 capture changed payload/mask');check(snapshot.metadata.nativeTensorMetadata.normalization==='umt5-final-rmsnorm-f32-v1','P4 capture lost final RMSNorm marker');
     result[name]={inputMode:execution.native.inputMode,tensor:native.describeTensor(restored.tensor),diffusionCapture:{rows:snapshot.rows,modelSha256:snapshot.modelSha256,tokenizerSha256:snapshot.tokenizerSha256,normalization:snapshot.metadata.nativeTensorMetadata.normalization,verification:snapshot.metadata.verification,projectionExecuted:false,crossAttentionExecuted:false}};
     if(name==='text-plain'&&result.textCancel)result.textCancel.recoveredBy=name;
    }
   }
  }
  result.newNeuralCalls=spec.preflightOnly?0:result.workers.filter(w=>!['rect-cancel','text-cancel'].includes(w.phase)).length;
  result.cancelledWorkers=result.workers.filter(w=>['rect-cancel','text-cancel'].includes(w.phase)).length;
  result.passed=true;
 }catch(e){result.failure={name:e.name,code:e.code??null,message:e.message,stack:e.stack};}
 finally{
  mark('dispose');if(bridge)result.disposal=await bridge.dispose();else api?.dispose();
  result.queue=bridge?.inspect();result.nativeDisposedState=api?.state;
  result.workerSummary={created:result.workers.length,terminated:result.workers.filter(w=>w.terminated).length,live:result.workers.filter(w=>!w.terminated).length};
  if(result.workerSummary.live||result.nativeDisposedState?.status!=='disposed')result.passed=false;
  result.wallSeconds=(performance.now()-phaseStart)/1000;
 }
 return result;
};

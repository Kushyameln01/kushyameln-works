import {createInferenceAPI,encodeTensor,decodeTensor} from '/shared/inference/api.mjs';

const check=(condition,message)=>{if(!condition)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const equalData=(a,b)=>a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
const descriptor=({data,...metadata})=>structuredClone(metadata);
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
async function selected(selector){
 const files=new Map();for(const file of document.querySelector(selector).files){check(!files.has(file.name),'Duplicate selected basename: '+file.name);files.set(file.name,file);}
 const file=files.get('manifest.json');check(file instanceof File,'Selected manifest File required');
 return {manifest:JSON.parse(await file.text()),files};
}
async function reference(name){const response=await fetch('/references/'+name);check(response.ok,'Reference unavailable: '+name);return new Float32Array(await response.arrayBuffer());}
function compare(actual,expected,gate){
 let maxAbs=0,sumSquares=0,allclose=actual.length===expected.length,finite=true;
 for(let i=0;i<expected.length;i++){const error=Math.abs(actual[i]-expected[i]);if(!Number.isFinite(actual[i])||!Number.isFinite(expected[i]))finite=false;maxAbs=Math.max(maxAbs,error);sumSquares+=error*error;if(error>gate.atol+gate.rtol*Math.abs(expected[i]))allclose=false;}
 return {passed:finite&&allclose&&maxAbs<=gate.maxAbs,elements:expected.length,allValuesCompared:true,finite,allclose,maxAbs,rmse:Math.sqrt(sumSquares/expected.length),gate};
}
function normalResult(output,label,requireBinding=true){
 check(output?.tensor,label+' must return a tensor');
 if(requireBinding)check(output.inputDescriptor&&output.binding,label+' must return inputDescriptor/binding');
 check(!Object.hasOwn(output,'evidence'),label+' normal result must omit evidence');
 if(output.inputDescriptor)check(!Object.hasOwn(output.inputDescriptor,'data'),label+' input descriptor must omit payload');
 return {tensor:descriptor(output.tensor),...(output.inputDescriptor?{inputDescriptor:output.inputDescriptor}:{}),...(output.binding?{binding:output.binding}:{}),resultKeys:Object.keys(output)};
}
async function roundtrip(tensor){
 const bytes=await encodeTensor(tensor),restored=await decodeTensor(bytes);
 check(equalData(restored.data,tensor.data),'Codec changed tensor values');
 for(const key of ['dtype','layout','shape','meaning','normalization','modelSha256','tokenizerSha256','context','latentContract'])check(same(restored[key],tensor[key]),'Codec changed '+key);
 if(tensor.attentionMask)check(equalData(restored.attentionMask,tensor.attentionMask),'Codec changed attentionMask');
 return {bytes,summary:{bytes:bytes.byteLength,sha256:await digest(bytes),metadata:descriptor(restored),payloadExact:true,metadataExact:true}};
}
async function rejected(action,pattern,label){
 try{await action();}catch(error){check(pattern.test(String(error)),label+' rejected with unexpected error: '+error);return String(error);}
 throw Error(label+' was accepted');
}

globalThis.runOwnerNormal=async spec=>{
 const result={passed:false,scope:'Default owner API; one Rect mean encode/decode and one plain Hello world against reused full references; no management implementation',newExports:0,newOracleRuns:0,workers:[],states:[],phases:[]};
 let api,phase='setup',vaeCancelIssued=false,textCancelIssued=false;
 const start=performance.now();
 const mark=next=>{phase=next;const event={phase,epochMs:Date.now(),elapsedSeconds:(performance.now()-start)/1000};result.phases.push(event);console.log('owner-normal-progress:'+JSON.stringify(event));};
 const workerFactory=()=>{
  const worker=new Worker('/owner-normal/owner-normal-worker.mjs',{type:'module'}),record={index:result.workers.length,phase,terminated:false,observations:[]};result.workers.push(record);
  const terminate=worker.terminate.bind(worker);worker.terminate=()=>{if(!record.terminated){record.terminated=true;record.terminatedAtEpochMs=Date.now();}return terminate();};
  worker.addEventListener('message',({data})=>{
   if(data.ownerObservation){record.observations.push({type:data.type,...data.ownerObservation});
    if(phase==='text-cancel'&&!textCancelIssued&&data.ownerObservation.event==='graph-hash-update'){
     textCancelIssued=true;result.text.cancelAt={phase:'graph-hash-update',inputBytes:data.ownerObservation.inputBytes,counts:data.ownerObservation.counts};result.text.cancelReturned=api.textEncoder.cancel();
    }
   }
  });return worker;
 };
 function completedWorker(name,expected){
  const worker=result.workers.find(w=>w.phase===name),last=worker?.observations.findLast(o=>o.type==='success');
  check(worker?.terminated&&last,'Successful Worker not observed/terminated: '+name);
  check(last.counts.created===expected&&last.counts.released===expected&&last.counts.active===0&&last.counts.runCalls===expected&&last.counts.maximumActive===1,'Actual session lifetime mismatch: '+name);
  return {counts:last.counts,sessions:last.sessions};
 }
 try{
  api=createInferenceAPI({workerFactory,onState:state=>{
   result.states.push({phase,status:state.status,module:state.module,operation:state.operation,inputRevision:state.inputRevision,progress:state.progress??null});
   if(phase==='vae-cancel'&&!vaeCancelIssued&&state.progress?.phase==='running'){
    vaeCancelIssued=true;result.vae.cancelAt=structuredClone(state.progress);result.vae.cancelReturned=api.vae.cancel();
   }
  }});
  const vae=await selected('#vae-bundle'),text=await selected('#text-bundle'),source=document.querySelector('#text-source').files[0];
  check(source instanceof File&&source.size===text.manifest.modelBytes,'Original Text source File size');text.files.set(text.manifest.embedding.sourceFile,source);
  check(vae.manifest.profile.id==='wan21-raw-f32-1x16x32','Existing accepted Rect profile required');
  const input={dtype:'float32',layout:'NCTHW',shape:[...vae.manifest.profile.videoShape],meaning:'rgb-unit',data:await reference('png-unit.f32'),context:{schemaVersion:1,contextId:'owner-normal-rect-0',inputId:'existing-rect-diagnostic',inputSha256:spec.rectInputSha256,slotId:'diagnostic-still',sourceFrameIndices:[0],sourceFrameTimesSeconds:[0]}};
  const inputSnapshot=input.data.slice();result.vae={configured:api.vae.configure(vae)};
  result.vae.capabilities=api.vae.capabilities({operation:'encode',input:descriptor(input)});
  check(result.vae.capabilities.support?.supported===true,'Configured Rect descriptor must be supported');
  check(result.vae.capabilities.runtime?.encode?.verified===false&&result.vae.capabilities.runtime?.decode?.verified===false,'Configure must not claim graph execution');
  const unsupported={...descriptor(input),shape:[1,3,81,480,832]};
  result.vae.unsupported81=api.vae.capabilities({operation:'encode',input:unsupported});
  const support=result.vae.unsupported81.support;
  check(support?.supported===false&&typeof support.code==='string'&&/graph|profile/i.test(support.reason??''),'81-frame shape must explain the required profile/graph action');
  check(result.workers.length===0,'Capability query dispatched a Worker');
  const badShape={...input,shape:[1,3,1,32,16]};
  result.vae.badShapeError=await rejected(()=>api.vae.encode(badShape),/shape|profile/i,'Wrong full NCTHW shape');
  check(result.workers.length===0,'Unsupported shape dispatched a Worker');
  mark('vae-cancel');const running=api.vae.encode(input);
  result.vae.busyError=await rejected(()=>api.vae.encode(input),/busy/i,'Concurrent VAE request');
  result.vae.cancelError=await rejected(()=>running,/cancelled/i,'Actual-running VAE cancellation');
  check(vaeCancelIssued&&result.vae.cancelReturned,'VAE did not cancel at real running progress');
  mark('vae-encode');const encoded=await api.vae.encode(input);result.vae.encode=normalResult(encoded,'VAE encode');
  result.vae.encode.comparison=compare(encoded.tensor.data,await reference('png-mean.f32'),spec.vaeGate);check(result.vae.encode.comparison.passed,'All Rect mean values differ from reused reference');
  check(encoded.tensor.meaning==='raw-posterior-mean'&&encoded.tensor.normalization===undefined,'Raw posterior-mean boundary');
  check(equalData(input.data,inputSnapshot)&&same(encoded.tensor.context,input.context),'Input ownership/context preservation');
  result.vae.encode.sessionObservation=completedWorker('vae-encode',1);
  check(encoded.binding.assetsVerified===true&&encoded.binding.graphMetadataChecked===true,'VAE encode must verify actual assets and graph metadata');
  check(same(encoded.binding.inputShape,input.shape)&&same(encoded.binding.outputShape,encoded.tensor.shape),'Actual encode binding shapes');
  const meanSaved=await roundtrip(encoded.tensor);result.vae.encode.codec=meanSaved.summary;
  mark('vae-decode');const decoded=await api.vae.decode(encoded.tensor);result.vae.decode=normalResult(decoded,'VAE decode');
  result.vae.decode.comparison=compare(decoded.tensor.data,await reference('png-roundtrip.f32'),spec.vaeGate);check(result.vae.decode.comparison.passed,'All Rect RGB values differ from reused reference');
  check(decoded.tensor.meaning==='raw-decoder-rgb'&&same(decoded.tensor.context,input.context),'Raw RGB/context boundary');
  result.vae.decode.sessionObservation=completedWorker('vae-decode',1);result.vae.decode.codec=(await roundtrip(decoded.tensor)).summary;
  check(decoded.binding.assetsVerified===true&&decoded.binding.graphMetadataChecked===true,'VAE decode must verify actual assets and graph metadata');
  check(same(decoded.binding.inputShape,encoded.tensor.shape)&&same(decoded.binding.outputShape,decoded.tensor.shape),'Actual decode binding shapes');
  result.vae.afterExecution=api.vae.capabilities();check(result.vae.afterExecution.runtime.encode.verified===true&&result.vae.afterExecution.runtime.decode.verified===true,'Successful exact configured operations must expose their own verification');
  api.vae.dispose();result.vae.disposedError=await rejected(()=>api.vae.encode(input),/disposed/i,'Disposed VAE encode');
  result.vae.disposedConfigureError=await rejected(()=>api.vae.configure(vae),/disposed/i,'Disposed VAE configure');
  result.text={configured:api.textEncoder.configure(text)};
  mark('text-full');const output=await api.textEncoder.encode({text:'Hello world'});result.text.output=normalResult(output,'Text encode',false);
  const tensor=output.tensor;
  check(tensor.dtype==='float32'&&tensor.layout==='BLC'&&tensor.meaning==='text_hidden_states'&&same(tensor.shape,[1,512,4096]),'Exact full512 Text tensor contract');
  check(tensor.normalization==='umt5-final-rmsnorm-f32-v1','Actual Text final RMSNorm marker');
  check(tensor.modelSha256===text.manifest.modelSha256&&tensor.tokenizerSha256===text.manifest.tokenizer.sha256,'Text model/Tokenizer binding');
  check(equalData(tensor.attentionMask,Uint8Array.from(spec.plainInput.attentionMask)),'All512 native mask positions');
  let paddingExactlyZero=true;for(let i=0;i<tensor.data.length;i++)if(!tensor.attentionMask[Math.floor(i/4096)]&&tensor.data[i]!==0)paddingExactlyZero=false;
  check(paddingExactlyZero,'Masked Text rows must remain exactly zero');result.text.paddingExactlyZero=true;
  result.text.comparison=compare(tensor.data,await reference('plain-reference.f32'),spec.textGate);check(result.text.comparison.passed,'All Text values differ from independent reused full512 reference');
  result.text.sessionObservation=completedWorker('text-full',24);check(result.text.sessionObservation.counts.tensorDisposeCalls===72,'All24 Text input/mask/output tensors disposed');
  const saved=await roundtrip(tensor);result.text.codec=saved.summary;
  const url=URL.createObjectURL(new Blob([saved.bytes])),anchor=document.createElement('a');anchor.href=url;anchor.download='normal-conditioning.wktensor';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  mark('text-cancel');result.text.cancelError=await rejected(()=>api.textEncoder.encode({text:'Hello world'}),/cancelled/i,'Text early-loading cancellation');
  check(textCancelIssued&&result.text.cancelReturned&&result.text.cancelAt.counts.created===0,'Text cancellation must occur in graph hashing before any second-run ORT session');
  const cancelledWorker=result.workers.find(w=>w.phase==='text-cancel');check(cancelledWorker?.terminated,'Cancelled Text Worker not terminated');
  api.textEncoder.dispose();result.text.disposedError=await rejected(()=>api.textEncoder.encode({text:'Hello world'}),/disposed/i,'Disposed Text encode');
  result.text.disposedConfigureError=await rejected(()=>api.textEncoder.configure(text),/disposed/i,'Disposed Text configure');
  api.dispose();check(result.workers.length===5&&result.workers.every(w=>w.terminated),'Every owned inference Worker must terminate');
  mark('complete');result.passed=true;
 }catch(error){result.error={name:error.name,message:error.message,stack:error.stack};}
 finally{api?.dispose();result.disposedState=api?.state??null;result.wallSeconds=(performance.now()-start)/1000;}
 return result;
};

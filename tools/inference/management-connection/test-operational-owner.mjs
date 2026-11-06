// Operational control/storage integration only: acquired e166 management code,
// real native factories/codecs and saved real tensors. The executor does no NN.
// The generated-sample fixture is explicitly synthetic, never a real raw sample.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as native from '../../../docs/shared/inference/api.mjs';
import {inspectTextEncoderManifest} from '../../../docs/shared/inference/text-encoder.mjs';
import {acquireSourceClosure,importManagementSource,MANAGEMENT_COMMIT,MANAGEMENT_SOURCE_ROOTS} from './source.mjs';
import {bindOperationalFiles,createOperationalInferenceOwner} from '../../../docs/shared/inference/operational-owner.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const sourceRef={repository:'Kushyameln01/kushyameln-works',commit:'367367dc758f7bfb4231803da62afe574f1bafca',path:'docs/shared/inference/api.mjs'};
let temporary,manager,text,mean,rgb,encodeInput,syntheticGenerated,textManifest,oldManifest,vaeManifest,streamManifest;
const load=path=>readFile(resolve(ROOT,path));
const json=async path=>JSON.parse(await load(path));
const textAssets=m=>[...m.blocks,m.finalNorm,m.embedding.rowHashes,{path:m.embedding.sourceFile,bytes:m.embedding.sourceBytes},m.tokenizer];
const exactFiles=(module,manifest)=>new Map((module==='text_encoder'?textAssets(manifest):Object.values(manifest.assets)).map(a=>[a.path??a.file,{size:a.bytes}]));
before(async()=>{
 temporary=await mkdtemp(resolve(tmpdir(),'kw-operational-owner-'));
 const source=await acquireSourceClosure({repositoryRoot:ROOT,outputRoot:resolve(temporary,'management'),commit:MANAGEMENT_COMMIT,roots:MANAGEMENT_SOURCE_ROOTS});
 manager=await importManagementSource(source.root);
 [text,mean,rgb,syntheticGenerated]=await Promise.all([
  'development/inference/standalone-20261102/text/full512-conditioning/conditioning.wktensor',
  'development/inference/p2-p3-acceptance/p2/updated-884/decode/mean/restored-mean/native.wktensor',
  'development/inference/p2-p3-acceptance/p2/updated-884/decode/decode/1-decoded-rgb/rgb.wktensor',
  'development/inference/management-20261104/generated-fixture/raw-generated.wktensor'
 ].map(async path=>native.decodeTensor(await load(path))));
 [textManifest,oldManifest,vaeManifest,streamManifest]=await Promise.all([
  'development/inference/management-20261104/text/source-ordered-fp32/manifest.json',
  'development/inference/codec-marker-handoff/manifests/text/manifest.json',
  'development/inference/codec-marker-handoff/manifests/vae-rect/manifest.json',
  'development/inference/standalone-20261102/evidence/vae-stream-manifest.json'
 ].map(json));
 const unit=await load('development/inference/e6/fixtures/png-unit.f32');
 encodeInput={dtype:'float32',layout:'NCTHW',shape:[1,3,1,16,32],meaning:'rgb-unit',data:new Float32Array(Uint8Array.from(unit).buffer),context:structuredClone(mean.context)};
});
after(async()=>{if(temporary)await rm(temporary,{recursive:true,force:true});});

function setup({hold=false,slowCancel=false,wrongBindings=false}={}){
 let state={status:'idle'},active=null,disposed=false,releaseCancelled;
 const calls=[],cancellation=[];
 const client={get state(){return state;},run(request){
  assert.equal(active,null,'service must serialize owner operations');
  calls.push(request);state={status:'running',module:request.module};
  return new Promise((accept,reject)=>{
   const finish=error=>{
    if(!active)return;active=null;state={status:'idle'};
    if(error){reject(error);return;}
    if(request.module==='text_encoder')accept({tensor:structuredClone(text),attentionMask:new Uint8Array(text.attentionMask),inputMode:request.input.text!==undefined?'plain-text':'token-ids',graphBindings:inspectTextEncoderManifest(request.manifest).graphBindings});
    else{
     const tensor=structuredClone(request.operation==='encode'?mean:rgb);
     // This is transport preservation of an existing native field, no arithmetic.
     if(request.input.frameProcessing)tensor.frameProcessing=structuredClone(request.input.frameProcessing);
     accept({tensor,inputDescriptor:native.describeTensor(request.input),binding:{operation:request.operation,inputShape:[...request.input.shape],outputShape:[...tensor.shape],assetsVerified:true,assetHashes:{fixture:'saved-real-output-no-new-NN'},graphMetadataChecked:true}});
    }
   };
   active={finish};if(!hold)queueMicrotask(()=>finish());
  });
 },cancel(){
  cancellation.push('requested');
  const end=()=>active?.finish(new DOMException('Controlled executor aborted','AbortError'));
  if(slowCancel)releaseCancelled=end;else end();
  return true;
 },dispose(){this.cancel();disposed=true;}};
 const textEncoder=native.createTextEncoderModule({client,ownsClient:false});
 const api={apiVersion:native.API_VERSION,textEncoder:wrongBindings?{...textEncoder,configure(args){const result=textEncoder.configure(args);return {...result,graphBindings:[]};}}:textEncoder,
  vae:native.createVaeModule({client,ownsClient:false}),dispose(){this.textEncoder.dispose();this.vae.dispose();client.dispose();}};
 const owner=createOperationalInferenceOwner({manager,sourceRef,nativeAPI:api});
 return {owner,calls,cancellation,client,finish(){active?.finish();},releaseCancelled(){releaseCancelled?.();},get disposed(){return disposed;},
  async configure(){await owner.configureText({manifest:textManifest,files:exactFiles('text_encoder',textManifest)});await owner.configureVae({manifest:vaeManifest,files:exactFiles('vae',vaeManifest)});}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('file binding retains exact Map values and rejects missing, wrong-sized or aliased keys without reading',()=>{
 const files=exactFiles('text_encoder',textManifest),first=textManifest.blocks[0].path;
 files.get(first).arrayBuffer=()=>{throw Error('binding must not read model bytes');};
 const result=bindOperationalFiles({module:'text_encoder',manifest:textManifest,files});
 assert.notEqual(result,files);assert.equal(result.get(first),files.get(first));assert.equal(result.size,28);
 const absent=new Map(files);absent.delete(first);
 assert.throws(()=>bindOperationalFiles({module:'text_encoder',manifest:textManifest,files:absent}),/missing/i);
 const wrong=new Map(files);wrong.set(first,{size:1});
 assert.throws(()=>bindOperationalFiles({module:'text_encoder',manifest:textManifest,files:wrong}),/size/i);
 const aliases=new Map(files);aliases.delete(first);aliases.set('prefix/'+first,files.get(first));
 assert.throws(()=>bindOperationalFiles({module:'text_encoder',manifest:textManifest,files:aliases}),/missing/i);
});

test('array binding uses directory suffix or unique basename and refuses ambiguous selection',()=>{
 const manifest=structuredClone(vaeManifest);
 const files=Object.values(manifest.assets).map(a=>({name:a.file,size:a.bytes,webkitRelativePath:'selected/model/'+a.file,arrayBuffer(){throw Error('no eager model reads');}}));
 const result=bindOperationalFiles({module:'vae',manifest,files});
 assert.equal(result.get(manifest.assets.encoder.file),files[0]);
 const basenameOnly=files.map(({webkitRelativePath,...file})=>file);
 const browserFile=new File([new Uint8Array(64)],manifest.assets.conv2Bias.file);
 basenameOnly[3]=browserFile;
 const basenameBound=bindOperationalFiles({module:'vae',manifest,files:basenameOnly});
 assert.equal(basenameBound.get(manifest.assets.encoder.file),basenameOnly[0]);
 assert.equal(basenameBound.get(manifest.assets.conv2Bias.file),browserFile);
 const encoder=manifest.assets.encoder;
 assert.throws(()=>bindOperationalFiles({module:'vae',manifest,files:[...files,{name:encoder.file,size:encoder.bytes,webkitRelativePath:'other/'+encoder.file}]}),/ambiguous/i);
 const streamFiles=exactFiles('vae',streamManifest),streamBound=bindOperationalFiles({module:'vae',manifest:streamManifest,files:streamFiles});
 assert.equal(streamBound.size,Object.keys(streamManifest.assets).length,'stream units come from existing validated schema');
 const blob=new Blob([new Uint8Array(64)]),blobMap=new Map(exactFiles('vae',manifest));blobMap.set(manifest.assets.conv2Bias.file,blob);
 assert.equal(bindOperationalFiles({module:'vae',manifest,files:blobMap}).get(manifest.assets.conv2Bias.file),blob);
});

test('operational Text requires all source-ordered FP32 bindings while independent native old compatibility remains',async()=>{
 const s=setup();try{
  await assert.rejects(s.owner.configureText({manifest:oldManifest,files:exactFiles('text_encoder',oldManifest)}),/source-ordered-fp32/i);
  const mixed=structuredClone(textManifest);mixed.blocks[23].normLowering.status='diagnostic-only-unaccepted';
  await assert.rejects(s.owner.configureText({manifest:mixed,files:exactFiles('text_encoder',mixed)}),/source-ordered-fp32/i);
  const configured=await s.owner.configureText({manifest:textManifest,files:exactFiles('text_encoder',textManifest)});
  assert.equal(configured.value.graphBindings.length,24);
  assert.ok(configured.value.graphBindings.every(binding=>binding.recipeStatus==='source-ordered-fp32'));
  assert.equal(s.owner.capabilities('text_encoder').configured,true);
  const legacy=native.createTextEncoderModule({client:s.client,ownsClient:false});
  assert.equal(legacy.configure({manifest:oldManifest,files:exactFiles('text_encoder',oldManifest)}).configured,true);legacy.dispose();
 }finally{await s.owner.dispose();}
 const mismatch=setup({wrongBindings:true});try{
  await assert.rejects(mismatch.owner.configureText({manifest:textManifest,files:exactFiles('text_encoder',textManifest)}),/binding/i);
  await assert.rejects(mismatch.owner.execute({module:'text_encoder',operation:'encode',input:{text:'must not run a rejected configuration'}}),/configur|binding/i);
  assert.equal(mismatch.calls.length,0);
 }finally{await mismatch.owner.dispose();}
});

test('default owner runs the ordinary native Worker client and forwards its state',async()=>{
 const prior=globalThis.Worker,workers=[],states=[];
 class ControlledWorker{
  listeners=new Map();terminated=false;
  constructor(url,options){assert.ok(url.pathname.endsWith('/inference-worker.mjs'));assert.equal(options.type,'module');workers.push(this);}
  addEventListener(type,listener){this.listeners.set(type,listener);}
  postMessage(envelope){
   assert.equal(envelope.module,'text_encoder');assert.equal(envelope.input.text,'ordinary worker path');
   assert.equal(envelope.diagnostics,false);
   queueMicrotask(()=>this.listeners.get('message')({data:{...envelope,type:'success',result:{tensor:structuredClone(text),attentionMask:new Uint8Array(text.attentionMask),inputMode:'plain-text',graphBindings:inspectTextEncoderManifest(envelope.manifest).graphBindings}}}));
  }
  terminate(){this.terminated=true;}
 }
 globalThis.Worker=ControlledWorker;
 let owner;
 try{
  owner=createOperationalInferenceOwner({manager,sourceRef,onState:state=>states.push(state)});
  await owner.configureText({manifest:textManifest,files:exactFiles('text_encoder',textManifest)});
  const result=await owner.execute({module:'text_encoder',operation:'encode',input:{text:'ordinary worker path'}});
  assert.equal(result.native.inputMode,'plain-text');assert.equal(workers.length,1);assert.equal(workers[0].terminated,true);
  assert.ok(states.some(state=>state.status==='running'));assert.ok(states.some(state=>state.status==='success'));
 }finally{await owner?.dispose();if(prior===undefined)delete globalThis.Worker;else globalThis.Worker=prior;}
});

test('plain and explicit IDs reach real factories, saved Text metadata and lightweight registry remain intact',async()=>{
 const s=setup();try{await s.configure();
  const plain=await s.owner.execute({module:'text_encoder',operation:'encode',input:{text:'a plain prompt'}});
  const ids=await s.owner.execute({module:'text_encoder',operation:'encode',input:{tokenIds:[42,1,0],attentionMask:[1,1,0]}});
  assert.equal(s.calls[0].input.text,'a plain prompt');assert.equal(Object.hasOwn(s.calls[0].input,'data'),false);
  assert.deepEqual([...s.calls[1].input.tokenIds],[42,1,0]);assert.deepEqual([...s.calls[1].input.attentionMask],[1,1,0]);
  assert.equal(plain.native.inputMode,'plain-text');assert.equal(ids.native.inputMode,'token-ids');
  assert.equal(plain.record.tensor.normalization,'umt5-final-rmsnorm-f32-v1');
  assert.deepEqual(plain.record.tensor.attentionMask,text.attentionMask);
  assert.equal(plain.record.tensor.tokenizerSha256,text.tokenizerSha256);assert.equal(plain.record.tensor.modelSha256,text.modelSha256);
  assert.equal(s.owner.getRecord(plain.record.descriptor.artifactId),plain.record);
  const summaries=s.owner.records();assert.equal(summaries.length,2);
  assert.equal(summaries[0].artifactId,plain.record.descriptor.artifactId);assert.equal(Object.hasOwn(summaries[0],'tensor'),false);
  summaries[0].descriptor.tensor.shape[0]=99;assert.equal(plain.record.descriptor.tensor.shape[0],1);
  const roundtrip=await native.decodeTensor(await s.owner.tensorBytes(plain.record.descriptor.artifactId));
  assert.deepEqual(roundtrip.attentionMask,text.attentionMask);assert.equal(roundtrip.data[123],text.data[123]);
  assert.equal(s.owner.busy,false);
 }finally{await s.owner.dispose();}
});

test('synthetic raw generated input decodes directly and recursive save/read/reuse retains all dependencies',async()=>{
 const s=setup();try{await s.configure();
  const imported=await s.owner.importTensor(await native.encodeTensor(syntheticGenerated),{name:'SYNTHETIC-NOT-REAL.wktensor'});
  const rawId=imported.descriptor.artifactId;
  assert.equal(Object.hasOwn(imported.tensor,'name'),false);
  assert.equal(s.owner.records().find(r=>r.artifactId===rawId).name,'SYNTHETIC-NOT-REAL.wktensor');
  const decode=await s.owner.execute({module:'vae',operation:'decode',inputArtifactId:rawId});
  assert.equal(s.calls[0].input.meaning,'wan21-raw-generated-sample:v1');
  assert.deepEqual(s.calls[0].input.latentContract,syntheticGenerated.latentContract);
  assert.deepEqual(s.calls[0].input.data,syntheticGenerated.data);
  assert.equal(Object.hasOwn(s.calls[0].input,'normalization'),false);
  assert.deepEqual(decode.inputRecord.sourceRecords,[{artifactRef:rawId}]);
  assert.deepEqual(decode.inputRecord.tensor.latentContract,syntheticGenerated.latentContract);
  const outputId=decode.record.descriptor.artifactId,inputId=decode.inputRecord.descriptor.artifactId;
  const saved=await s.owner.save({artifactIds:[outputId]});
  const loaded=await s.owner.readPackage(saved.bytes);
  assert.equal(Object.keys(loaded.artifacts).length,3);
  assert.deepEqual(new Set(s.owner.records().map(r=>r.artifactId)),new Set([rawId,inputId,outputId]));
  assert.deepEqual(s.owner.getRecord(rawId).tensor.latentContract,syntheticGenerated.latentContract);
  assert.equal(s.owner.records().find(r=>r.artifactId===rawId).name,'SYNTHETIC-NOT-REAL.wktensor','caller-selected filename survives save/read outside native metadata');
  assert.equal(Object.hasOwn(s.owner.getRecord(rawId).tensor,'name'),false);
  assert.equal(Object.hasOwn(s.owner.getRecord(rawId).tensor,'fileName'),false);
  await s.owner.readPackage(saved.bytes); // Explicit workspace replacement permits same-package reread.
  assert.equal(s.owner.records().length,3);assert.equal(s.owner.capabilities('vae').configured,true);
  // Existing raw decoder RGB exceeds the encoder's native value range. The
  // service must reject it without clipping or relabelling the saved tensor.
  await assert.rejects(s.owner.execute({module:'vae',operation:'encode',inputArtifactId:outputId}),/\[-1,1\]/);
  const rgbInput=await s.owner.importTensor(await native.encodeTensor(encodeInput));
  const encoded=await s.owner.execute({module:'vae',operation:'encode',inputArtifactId:rgbInput.descriptor.artifactId});
  const reused=await s.owner.execute({module:'vae',operation:'decode',inputArtifactId:encoded.record.descriptor.artifactId});
  assert.deepEqual(reused.inputRecord.sourceRecords,[{artifactRef:encoded.record.descriptor.artifactId}]);
  const chained=await s.owner.save({artifactIds:[reused.record.descriptor.artifactId]});
  await s.owner.readPackage(chained.bytes);assert.equal(s.owner.records().length,5);
  const idsBefore=s.owner.records().map(r=>r.artifactId);
  await assert.rejects(s.owner.readPackage(new Uint8Array([1,2,3])));
  assert.deepEqual(s.owner.records().map(r=>r.artifactId),idsBefore,'failed read must preserve current records');
  s.owner.clearRecords();assert.deepEqual(s.owner.records(),[]);
 }finally{await s.owner.dispose();}
});

test('real mean metadata including causal frame processing survives import, execute and saved native bytes',async()=>{
 const s=setup();try{await s.configure();
  const framed={...mean,frameProcessing:{schemaVersion:1,policy:'wan21-causal-floor-v1',sourceFrames:4,latentFrames:1,consumedFrames:1,unusedTailFrames:3,sourceContext:{...mean.context,sourceFrameIndices:[0,1,2,3],sourceFrameTimesSeconds:[0,.04,.08,.12]}}};
  const record=await s.owner.importTensor(await native.encodeTensor(framed));
  const result=await s.owner.execute({module:'vae',operation:'decode',inputArtifactId:record.descriptor.artifactId});
  assert.deepEqual(result.inputRecord.tensor.frameProcessing,framed.frameProcessing);
  const readback=await native.decodeTensor(await s.owner.tensorBytes(result.inputRecord.descriptor.artifactId));
  assert.deepEqual(readback.frameProcessing,framed.frameProcessing);assert.equal(readback.meaning,mean.meaning);assert.equal(readback.modelSha256,mean.modelSha256);
  await assert.rejects(s.owner.execute({module:'vae',operation:'decode',input:mean,inputArtifactId:record.descriptor.artifactId}),/choose|either|exclusive/i);
  await assert.rejects(s.owner.execute({module:'vae',operation:'decode',inputArtifactId:'missing'}),/unknown|missing/i);
 }finally{await s.owner.dispose();}
});

test('cancel waits original executor terminal, blocks mutations during cancellation and then allows retry',async()=>{
 const s=setup({hold:true,slowCancel:true});try{await s.configure();
  const pending=s.owner.execute({module:'vae',operation:'decode',input:mean});
  const rejected=assert.rejects(pending,error=>error.code==='INVOCATION_CANCELLED');await tick();
  let cancellationDone=false;const cancellation=s.owner.cancel().then(result=>{cancellationDone=true;return result;});await tick();
  assert.equal(s.owner.busy,true);assert.equal(cancellationDone,false,'cancel acceptance is not the original terminal');
  await assert.rejects(s.owner.configureVae({manifest:vaeManifest,files:exactFiles('vae',vaeManifest)}),/busy|active/i);
  await assert.rejects(s.owner.readPackage(new Uint8Array()),/busy|active/i);
  assert.throws(()=>s.owner.clearRecords(),/busy|active/i);
  await assert.rejects(s.owner.execute({module:'vae',operation:'decode',input:mean}),/busy|active/i);
  s.releaseCancelled();await rejected;
  const terminal=await cancellation;assert.equal(terminal.originalTerminal,true);assert.equal(terminal.resourceReleased,true);assert.equal(terminal.reusable,true);
  assert.equal(s.owner.busy,false);
  const retry=s.owner.execute({module:'vae',operation:'decode',input:mean});await tick();s.finish();assert.equal((await retry).terminal.resultAccepted,true);
  const controller=new AbortController();const aborted=s.owner.execute({module:'vae',operation:'decode',input:mean,signal:controller.signal});
  const abortedRejection=assert.rejects(aborted,error=>error.code==='INVOCATION_CANCELLED');await tick();controller.abort();await tick();s.releaseCancelled();await abortedRejection;
  assert.equal(s.owner.busy,false);
 }finally{await s.owner.dispose();}
});

test('dispose closes immediately, waits original terminal and clears references without detaching caller arrays',async()=>{
 const s=setup({hold:true,slowCancel:true});await s.configure();
 const imported=await s.owner.importTensor(await native.encodeTensor(mean));const held=imported.tensor.data;
 const pending=s.owner.execute({module:'vae',operation:'decode',input:mean});const rejected=assert.rejects(pending,error=>error.code==='INVOCATION_CANCELLED');await tick();
 let done=false;const disposal=s.owner.dispose().then(()=>{done=true;});await tick();assert.equal(done,false);
 await assert.rejects(s.owner.importTensor(await native.encodeTensor(mean)),/disposed|closed/i);
 s.releaseCancelled();await rejected;await disposal;
 assert.equal(s.disposed,true);assert.equal(s.owner.busy,false);assert.deepEqual(s.owner.records(),[]);
 assert.equal(held.byteLength,mean.data.byteLength);assert.equal(held[0],mean.data[0]);await s.owner.dispose();
});

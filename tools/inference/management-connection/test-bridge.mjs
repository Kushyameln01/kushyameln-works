// Control/storage boundary tests. Actual public native module factories and
// acquired management/Diffusion code, with a controlled native executor. These
// tests do not execute or certify neural inference.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import * as native from '../../../docs/shared/inference/api.mjs';
import {inspectTextEncoderManifest} from '../../../docs/shared/inference/text-encoder.mjs';
import {createManagedInferenceBridge,createCurrentNativeCodec,captureRestoredConditioning} from '../../../docs/shared/inference/management-adapter.mjs';
import {acquireConnectionSources,importManagementSource,importDiffusionConditioning} from './source.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const sourceRef={repository:'Kushyameln01/kushyameln-works',commit:'badff7a436b56207a084c4c770e01490899a576c',path:'docs/shared/inference/api.mjs'};
let temporary,manager,diffusion,text,mean,rgb,encodeInput,textManifest,vaeManifest,plainInput;
before(async()=>{
 temporary=await mkdtemp(resolve(tmpdir(),'kw-managed-boundary-'));
 const acquired=await acquireConnectionSources({repositoryRoot:ROOT,outputRoot:resolve(temporary,'sources')});
 manager=await importManagementSource(acquired.management.root);diffusion=await importDiffusionConditioning(acquired.diffusion.root);
 const load=path=>readFile(resolve(ROOT,path));
 text=await native.decodeTensor(await load('development/inference/standalone-20261102/text/full512-conditioning/conditioning.wktensor'));
 mean=await native.decodeTensor(await load('development/inference/p2-p3-acceptance/p2/updated-884/decode/mean/restored-mean/native.wktensor'));
 rgb=await native.decodeTensor(await load('development/inference/p2-p3-acceptance/p2/updated-884/decode/decode/1-decoded-rgb/rgb.wktensor'));
 const unit=await load('development/inference/e6/fixtures/png-unit.f32');
 encodeInput={dtype:'float32',layout:'NCTHW',shape:[1,3,1,16,32],meaning:'rgb-unit',data:new Float32Array(Uint8Array.from(unit).buffer),context:structuredClone(mean.context)};
 plainInput=JSON.parse(await load('development/inference/standalone-20261102/text/full512-conditioning/diagnostic/input-record.json'));
 textManifest=JSON.parse(await load('development/inference/codec-marker-handoff/manifests/text/manifest.json'));
 vaeManifest=JSON.parse(await load('development/inference/codec-marker-handoff/manifests/vae-rect/manifest.json'));
});
after(async()=>{if(temporary)await rm(temporary,{recursive:true,force:true});});

function setup({hold=false,onNativeRequest,graphBindings,textConfigurationManifest=textManifest}={}){
 let state={status:'idle'},active=null,disposed=false,maxActive=0,inFlight=0;const calls=[];
 const client={get state(){return state;},run(request){
  assert.equal(disposed,false);assert.equal(inFlight,0,'real shared queue must serialize both modules');
  state={status:'running',module:request.module};inFlight++;maxActive=Math.max(maxActive,inFlight);calls.push(request);
  return new Promise((accept,reject)=>{
   const finish=(error)=>{if(!active)return;active=null;inFlight--;state={status:'idle'};
    if(error){reject(error);return;}
    if(request.module==='text_encoder'){accept({tensor:structuredClone(text),attentionMask:new Uint8Array(text.attentionMask),inputMode:request.input.text!==undefined?'plain-text':'token-ids',...(graphBindings?{graphBindings}: {})});return;}
    const out=request.operation==='encode'?mean:rgb;
    accept({tensor:structuredClone(out),inputDescriptor:native.describeTensor(request.input),binding:{operation:request.operation,inputShape:[...request.input.shape],outputShape:[...out.shape],assetsVerified:true,assetHashes:{controlFixture:'not-a-model-run'},graphMetadataChecked:true}});
   };
   active={finish};if(!hold)queueMicrotask(()=>finish());
  });
 },cancel(){active?.finish(new DOMException('Controlled executor aborted','AbortError'));return true;},dispose(){this.cancel();disposed=true;}};
 const api={apiVersion:'works-ai-1',textEncoder:native.createTextEncoderModule({client,ownsClient:false}),vae:native.createVaeModule({client,ownsClient:false}),dispose(){this.textEncoder.dispose();this.vae.dispose();client.dispose();}};
 const codec=createCurrentNativeCodec(native,sourceRef);
 const bridge=createManagedInferenceBridge({manager,nativeAPI:api,nativeModule:native,sourceRef,codec,onNativeRequest});
 const tm=textConfigurationManifest;
 const textFiles=new Map([...tm.blocks,tm.finalNorm,tm.embedding.rowHashes,{path:tm.embedding.sourceFile,bytes:tm.embedding.sourceBytes},tm.tokenizer].map(a=>[a.path??a.file,{size:a.bytes}]));
 const vaeFiles=new Map(Object.values(vaeManifest.assets).map(a=>[a.file,{size:a.bytes}]));
 return {bridge,client,calls,configure:async()=>{await bridge.configure('text_encoder',{manifest:tm,files:textFiles});await bridge.configure('vae',{manifest:vaeManifest,files:vaeFiles});},get disposed(){return disposed;},get maxActive(){return maxActive;}};
}

test('actual management adapter, native plain/ID input and owned tensor capture preserve final normalization',async()=>{
 const s=setup();try{await s.configure();
  const [plain,ids]=await Promise.all([
   s.bridge.execute({module:'text_encoder',operation:'encode',input:plainInput.input}),
   s.bridge.execute({module:'text_encoder',operation:'encode',input:{tokenIds:plainInput.tokenIds,attentionMask:plainInput.attentionMask}})
  ]);
  assert.equal(s.maxActive,1);assert.equal(plain.native.inputMode,'plain-text');assert.equal(ids.native.inputMode,'token-ids');
  for(const r of [plain,ids]){assert.deepEqual(r.record.tensor.data,text.data);assert.deepEqual(r.record.tensor.attentionMask,text.attentionMask);assert.equal(r.record.tensor.normalization,'umt5-final-rmsnorm-f32-v1');assert.equal(r.record.tensor.tokenizerSha256,text.tokenizerSha256);assert.equal(r.terminal.resourceReleased,true);}
  assert.equal(s.bridge.inspect().artifactStoreEntries,0);
 }finally{await s.bridge.dispose();}assert.equal(s.disposed,true);
});

test('current native Text graph bindings survive actual management save/read outside tensor metadata',async()=>{
 const candidate=JSON.parse(await readFile(resolve(ROOT,'development/inference/management-20261104/text/candidate-manifest.json')));
 const bindings=inspectTextEncoderManifest(candidate).graphBindings,expected=structuredClone(bindings);
 assert.equal(bindings.length,24);assert.ok(bindings.every(b=>b.sourceAssetSha256!==b.executedGraphSha256));
 const s=setup({graphBindings:bindings,textConfigurationManifest:candidate});try{await s.configure();
  const execution=await s.bridge.execute({module:'text_encoder',operation:'encode',input:plainInput.input});
  assert.deepEqual(execution.native.graphBindings,expected,'Actual public native factory must retain its ordinary result bindings');
  assert.equal(Object.hasOwn(execution.native.tensor,'graphBindings'),false);
  assert.deepEqual(execution.record.trace.records[0].data.native.graphBindings,expected);
  execution.native.graphBindings[0].executedGraphSha256='f'.repeat(64);
  const saved=await s.bridge.save({records:{conditioning:execution.record}}),loaded=await s.bridge.read(saved.bytes);
  assert.deepEqual(loaded.artifacts.conditioning.trace.records[0].data.native.graphBindings,expected);
  assert.equal(Object.hasOwn(loaded.artifacts.conditioning.tensor,'graphBindings'),false);
  assert.deepEqual(loaded.artifacts.conditioning.tensor.data,text.data);
 }finally{await s.bridge.dispose();}
});

test('Rect native encode/decode paths preserve context; restored generated-sample stays generated',async()=>{
 const s=setup();try{await s.configure();
  const encoded=await s.bridge.execute({module:'vae',operation:'encode',input:encodeInput});
  assert.deepEqual(encoded.record.tensor.context,mean.context);
  const generated={dtype:mean.dtype,shape:[...mean.shape],layout:mean.layout,data:new Float32Array(mean.data),meaning:'wan21-raw-generated-sample:v1',modelSha256:'a'.repeat(64),latentContract:{schemaVersion:1,representation:'generated-sample',space:'raw',vaeModelSha256:mean.modelSha256,producerModelSha256s:['a'.repeat(64),'b'.repeat(64)],normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}}};
  const decoded=await s.bridge.execute({module:'vae',operation:'decode',input:generated});
  assert.equal(s.calls.at(-1).input.meaning,generated.meaning);assert.deepEqual(s.calls.at(-1).input.latentContract,generated.latentContract);
  assert.deepEqual(decoded.record.sourceRecords[0].nativeInputDescriptor.latentContract,generated.latentContract);
  assert.deepEqual(decoded.record.trace.records[0].data.native.inputDescriptor.latentContract,generated.latentContract);
  await assert.rejects(s.bridge.save({records:{decoded:decoded.record}}),e=>e.code==='DEPENDENCY_REQUIRED');
  const saved=await s.bridge.save({records:{decoded:decoded.record},inputs:{[decoded.inputRecord.descriptor.artifactId]:decoded.inputRecord}});const loaded=await s.bridge.read(saved.bytes);
  const recoveredRaw=loaded.artifacts[decoded.inputRecord.descriptor.artifactId].tensor;
  assert.deepEqual(recoveredRaw.data,generated.data);assert.equal(recoveredRaw.meaning,generated.meaning);assert.deepEqual(recoveredRaw.latentContract,generated.latentContract);
  assert.deepEqual(loaded.artifacts.decoded.tensor.data,rgb.data);assert.deepEqual(loaded.artifacts.decoded.sourceRecords[0].nativeInputDescriptor.latentContract,generated.latentContract);
  assert.deepEqual(loaded.artifacts.decoded.trace.records[0].data.native.binding,decoded.native.binding);
 }finally{await s.bridge.dispose();}
});

test('browser metadata equality accepts canonical management key order and rejects actual binding changes',async()=>{
 const browserSource=(await readFile(new URL('./browser.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 const sandbox=vm.createContext({});vm.runInContext(browserSource+'\nglobalThis.compareNativeMetadata=same;',sandbox);
 const s=setup();try{await s.configure();
  const execution=await s.bridge.execute({module:'vae',operation:'encode',input:encodeInput});
  const saved=await s.bridge.save({records:{mean:execution.record},inputs:{[execution.inputRecord.descriptor.artifactId]:execution.inputRecord}});
  const loaded=await s.bridge.read(saved.bytes),restored=loaded.artifacts.mean.trace.records[0].data.native.binding;
  assert.deepEqual(restored,execution.native.binding,'Real management save/read retains every binding value');
  assert.notEqual(JSON.stringify(restored),JSON.stringify(execution.native.binding),'Pinned manager canonical JSON changes native object key order');
  assert.equal(sandbox.compareNativeMetadata(restored,execution.native.binding),true);
  const wrongShape=structuredClone(restored);wrongShape.outputShape=[1,16,1,4,2];
  assert.equal(sandbox.compareNativeMetadata(wrongShape,execution.native.binding),false,'Tensor axis order must remain strict');
  const wrongHash=structuredClone(restored);wrongHash.assetHashes.controlFixture='changed';
  assert.equal(sandbox.compareNativeMetadata(wrongHash,execution.native.binding),false,'Asset hash values must remain strict');
 }finally{await s.bridge.dispose();}
});

test('current codec injection preserves causal-tail metadata and real full512 payload reaches actual P4 capture',async()=>{
 const s=setup();try{
  const sourceContext={...mean.context,sourceFrameIndices:[0,1,2,3],sourceFrameTimesSeconds:[0,0.04,0.08,0.12]};
  const framed={...mean,frameProcessing:{schemaVersion:1,policy:'wan21-causal-floor-v1',sourceFrames:4,latentFrames:1,consumedFrames:1,unusedTailFrames:3,sourceContext}};
  const record=s.bridge.captureSavedTensor(framed,{artifactId:'tail-contract-fixture'});
  const textRecord=s.bridge.captureSavedTensor(text,{artifactId:'actual-full512'});
  const saved=await s.bridge.save({records:{tail:record,conditioning:textRecord}});const restored=await s.bridge.read(saved.bytes);
  assert.deepEqual(restored.artifacts.tail.tensor.frameProcessing,framed.frameProcessing);
  const capture=captureRestoredConditioning({record:restored.artifacts.conditioning,diffusion});
  const checked=diffusion.snapshotP4CapturedConditioning(capture);
  assert.deepEqual(checked.data,text.data);assert.deepEqual(checked.attentionMask,text.attentionMask);
  assert.equal(checked.metadata.nativeTensorMetadata.normalization,text.normalization);assert.equal(checked.tokenizerSha256,text.tokenizerSha256);
  assert.notEqual(checked.data.buffer,restored.artifacts.conditioning.tensor.data.buffer);
  assert.equal(checked.metadata.verification.realExecutionVerified,false);
 }finally{await s.bridge.dispose();}
});

test('exact-target cancellation stops original operation, permits retry and rejects stale cancel',async()=>{
 let dispatched;const started=new Promise(resolve=>dispatched=resolve);const s=setup({hold:true,onNativeRequest:event=>{if(event.module==='vae'&&event.operation==='decode')dispatched(event);}});
 try{await s.configure();
  const pending=s.bridge.execute({module:'vae',operation:'decode',input:mean});
  const rejected=assert.rejects(pending,e=>e.code==='INVOCATION_CANCELLED');await started;
  const target=s.bridge.inspect().targets.find(x=>x.module==='vae'&&x.operation==='decode').target;
  const cancelled=await s.bridge.cancel(target);await rejected;assert.equal(cancelled.originalTerminal,true);assert.equal(cancelled.resourceReleased,true);assert.equal(cancelled.reusable,true);
  await assert.rejects(s.bridge.cancel(target),e=>e.code==='STALE_INVOCATION');
  const retry=s.bridge.execute({module:'vae',operation:'decode',input:mean});await new Promise(resolve=>setImmediate(resolve));
  // Disposal is the second cancellation; it waits for the actual original Promise.
  const retried=assert.rejects(retry,e=>e.code==='INVOCATION_CANCELLED');await s.bridge.dispose();await retried;assert.equal(s.disposed,true);
 }finally{await s.bridge.dispose();}
});

test('cancel between queue pump and native dispatch releases the unstarted owner barrier',async()=>{
 const s=setup();try{await s.configure();const controller=new AbortController();
  const pending=s.bridge.execute({module:'vae',operation:'decode',input:mean,signal:controller.signal});
  const rejected=assert.rejects(pending,e=>e.code==='INVOCATION_CANCELLED');queueMicrotask(()=>controller.abort());await rejected;
  assert.equal(s.calls.length,0,'unstarted cancellation must not dispatch a native job');
  assert.equal(s.bridge.inspect().queue.groups[0].quarantined,false);
  const retry=await s.bridge.execute({module:'vae',operation:'decode',input:mean});assert.equal(retry.terminal.resourceReleased,true);assert.equal(s.calls.length,1);
 }finally{await s.bridge.dispose();}
});

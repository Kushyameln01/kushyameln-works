// Actual native factories/validators/codecs; controlled client transport only.
// This suite performs no NN/model loading and claims no numerical acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const api=await import('../../docs/shared/ai-connection/adapters/text-vae-standalone/management.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(fn){for(let n=0;n<100;n++){if(fn())return;await tick();}throw Error('control boundary not reached');}
const root=new URL('../../docs/shared/ai-connection/native/text-vae-badff7a/',import.meta.url);
async function config(kind='text'){
 const manifest=await api.readTextVaeConfigurationManifest(kind);
 const records=kind==='text'?[...manifest.blocks,manifest.finalNorm,manifest.embedding.rowHashes,{path:manifest.embedding.sourceFile,bytes:manifest.embedding.sourceBytes},manifest.tokenizer]:Object.values(manifest.assets).map(a=>({...a,path:a.file}));
 return {manifest,files:new Map(records.map(a=>[a.path,{size:a.bytes}]))};
}
function transport({hold=false,cleanupFailure=false,graphBindingsMutation}={}){
 const pending=[],clients=[];let failCleanup=cleanupFailure;
 return {pending,clients,setCleanupFailure(v){failCleanup=v;},clientFactory({onState}){
  const owned={disposed:false};clients.push(owned);
  let state={status:'idle'},rejectActive;
  return {get state(){return state;},async run(q){
   state={status:'running',module:q.module};onState({...state,progress:{stage:'controlled-start'}});
   let resume;const wait=new Promise((resolve,reject)=>{resume=resolve;rejectActive=reject;});pending.push({request:q,resume});
   if(hold)await wait;
   state={status:'success',module:q.module};rejectActive=null;
   const L=q.input.tokenIds?.length??512,mask=q.input.attentionMask??Uint8Array.from({length:L},(_,i)=>i===0?1:0);
   const graphBindings=q.manifest.blocks.map(r=>({index:r.index,path:r.path,sourceAssetSha256:r.sha256,executedGraphSha256:r.normLowering?.executedGraphSha256??r.attentionLowering?.executedGraphSha256??r.sha256,recipeId:r.normLowering?.type??r.attentionLowering?.type??null,...(r.normLowering?{recipeStatus:r.normLowering.status}:{})}));
   if(graphBindingsMutation==='wrong')graphBindings[0].executedGraphSha256='0'.repeat(64);
   return {...(graphBindingsMutation==='missing'?{}:{graphBindings}),tensor:{dtype:'float32',layout:'BLC',shape:[1,L,4096],meaning:'text_hidden_states',data:new Float32Array(L*4096),attentionMask:new Uint8Array(mask),modelSha256:q.manifest.modelSha256,tokenizerSha256:q.manifest.tokenizer.sha256,normalization:'umt5-final-rmsnorm-f32-v1'},attentionMask:new Uint8Array(mask),inputMode:q.input.text!==undefined?'plain-text':'token-ids'};
  },cancel(){state={status:'cancelled'};rejectActive?.(Error('cancelled'));rejectActive=null;},dispose(){if(failCleanup)throw Error('controlled cleanup failure');this.cancel();state={status:'disposed'};owned.disposed=true;}};
 }};
}
async function fixture(options={}){
 assert.equal(typeof api.createTextVaeStandaloneManagement,'function','Standalone management factory required');
 const control=transport(options),host=await api.createTextVaeStandaloneManagement({kind:'text',configuration:await config(),controlOnly:{clientFactory:control.clientFactory}});return {host,control};
}

test('ordinary native query rejects malformed input without transport dispatch',async()=>{
 const {host,control}=await fixture();try{
  assert.equal(host.query({operation:'encode',input:{text:''}}).support.supported,true);
  assert.equal(host.query({operation:'encode',input:{tokenIds:[1],attentionMask:[0]}}).support.supported,false);
  assert.equal(control.pending.length,0);
  const r=await host.execute({operation:'encode',input:{tokenIds:[1,0],attentionMask:[1,0]}});
  assert.equal(r.status,'EXECUTION_COMPLETED');assert.deepEqual(r.tensor.shape,[1,2,4096]);assert.equal(r.tensor.normalization,'umt5-final-rmsnorm-f32-v1');assert.equal(r.terminal.originalTerminal,true);assert.equal(r.terminal.resourceReleased,true);assert.equal(r.generationReady,false);
 }finally{await host.dispose();}
});

test('concurrent configure or recover followed by dispose cannot reopen native resources',async()=>{
 for(const operation of ['configure','recover']){
  const {host,control}=await fixture(),next=await config();
  const changing=operation==='configure'?host.configure(next):host.recover();
  const closing=host.dispose();const [changed,closed]=await Promise.allSettled([changing,closing]);
  assert.equal(closed.status,'fulfilled');if(changed.status==='rejected')assert.equal(changed.reason.code,'TEXT_VAE_DISPOSED');
  assert.equal(host.inspect().disposed,true);assert.equal(host.inspect().queue.disposed,true);
  assert.equal(host.inspect().localFileBindings,0);assert.equal(host.inspect().configured,false);
  assert.equal(control.clients.filter(c=>!c.disposed).length,0);
  await host.dispose();assert.equal(control.clients.filter(c=>!c.disposed).length,0);
  await assert.rejects(()=>host.recover(),{code:'TEXT_VAE_DISPOSED'});
 }
});

test('queued Text and VAE capture independent bytes from caller SharedArrayBuffer views',async()=>{
 for(const kind of ['text','vae']){
  const pending=[];
  const host=await api.createTextVaeStandaloneManagement({kind,configuration:await config(kind),controlOnly:{clientFactory(){let status='idle',rejectActive;return {get state(){return {status,module:kind==='text'?'text_encoder':'vae'};},async run(request){status='running';await new Promise((resolve,reject)=>{rejectActive=reject;pending.push({request,resume:resolve});});status='error';throw Error('controlled terminal');},cancel(){status='cancelled';rejectActive?.(Error('cancelled'));},dispose(){status='disposed';}};}}});
  const textInput={tokenIds:new Int32Array(new SharedArrayBuffer(8)),attentionMask:new Uint8Array(new SharedArrayBuffer(2))};textInput.tokenIds.set([2,0]);textInput.attentionMask.set([1,0]);
  const vaeInput={dtype:'float32',layout:'NCTHW',shape:[1,3,4,16,32],meaning:'raw-decoder-rgb',data:new Float32Array(new SharedArrayBuffer(6144*4))};vaeInput.data[0]=0.25;
  const input=kind==='text'?textInput:vaeInput;
  try{
   const a=host.execute({operation:'encode',input}).catch(e=>e);await until(()=>pending.length===1);
   const b=host.execute({operation:'encode',input}).catch(e=>e);
   if(kind==='text'){input.tokenIds[0]=77;input.attentionMask.set([0,1]);}else input.data[0]=0.75;
   pending[0].resume();await a;await until(()=>pending.length===2);
   const captured=pending[1].request.input;
   if(kind==='text'){assert.deepEqual(Array.from(captured.tokenIds),[2,0]);assert.deepEqual(Array.from(captured.attentionMask),[1,0]);assert.ok(captured.tokenIds.buffer instanceof ArrayBuffer);assert.ok(captured.attentionMask.buffer instanceof ArrayBuffer);}else{assert.equal(captured.data[0],0.25);assert.ok(captured.data.buffer instanceof ArrayBuffer);}
   pending[1].resume();await b;
  }finally{for(const p of pending)p.resume();await host.dispose();}
 }
});

test('progress cancellation suppresses later request observers and subscribers in the same dispatch',async()=>{
 for(const boundary of ['global','request','subscriber']){
  const control=transport({hold:true}),seen=[];let host,cancellation;
  const cancel=()=>{cancellation=host.cancel(host.inspect().activeTarget);};
  host=await api.createTextVaeStandaloneManagement({kind:'text',configuration:await config(),onProgress(event){if(event.progress){seen.push('global');if(boundary==='global')cancel();}},controlOnly:{clientFactory:control.clientFactory}});
  host.subscribe(state=>{if(state.progress){seen.push('subscriber1');if(boundary==='subscriber')cancel();}});
  host.subscribe(state=>{if(state.progress)seen.push('subscriber2');});
  try{
   const result=host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]},onProgress(event){if(event.progress){seen.push('request');if(boundary==='request')cancel();}}}).catch(e=>e);
   await until(()=>!!cancellation);await cancellation;assert.equal((await result).code,'INVOCATION_CANCELLED');
   assert.deepEqual(seen,boundary==='global'?['global']:boundary==='request'?['global','request']:['global','request','subscriber1']);
  }finally{await host.dispose();}
 }
});

test('subscriber cancellation before native ingress leaves queue reusable without dispatch',async()=>{
 const {host,control}=await fixture();let cancellation;
 const unsubscribe=host.subscribe(state=>{if(state.activeTarget&&!state.progress&&!cancellation)cancellation=host.cancel(state.activeTarget);});
 try{const result=await host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]}}).catch(e=>e);await cancellation;
  assert.equal(result.code,'INVOCATION_CANCELLED');assert.equal(control.pending.length,0);assert.equal(host.inspect().recoveryRequired,false);
  unsubscribe();assert.equal((await host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]}})).status,'EXECUTION_COMPLETED');
 }finally{unsubscribe();await host.dispose();}
});

test('failed disposal remains terminal while retry releases retained native configuration',async()=>{
 const {host,control}=await fixture({cleanupFailure:true});
 await assert.rejects(()=>host.dispose(),/controlled cleanup failure/);assert.equal(host.inspect().disposalRequested,true);
 await assert.rejects(()=>host.configure({manifest:{},files:new Map()}),{code:'TEXT_VAE_DISPOSED'});await assert.rejects(()=>host.recover(),{code:'TEXT_VAE_DISPOSED'});
 control.setCleanupFailure(false);await host.dispose();assert.equal(host.inspect().localFileBindings,0);assert.equal(control.clients.filter(c=>!c.disposed).length,0);
});

test('successful terminal disposal clears recovery requirement from a quarantined retired queue',async()=>{
 const {host,control}=await fixture({cleanupFailure:true});
 await assert.rejects(()=>host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]}}),{code:'RESOURCE_CLEANUP_FAILED'});
 control.setCleanupFailure(false);await host.dispose();assert.equal(host.inspect().disposed,true);assert.equal(host.inspect().recoveryRequired,false);assert.equal(host.inspect().localFileBindings,0);
});

test('queued requests serialize actual native ingress and retain ordinary plain input',async()=>{
 const {host,control}=await fixture({hold:true});try{
  const a=host.execute({operation:'encode',input:{text:'first'},requestId:'A'}),b=host.execute({operation:'encode',input:{text:'second'},requestId:'B'});
  await until(()=>control.pending.length===1);assert.equal(host.inspect().queue.groups[0].queued.length,1);
  control.pending[0].resume();const ar=await a;assert.equal(ar.result.inputMode,'plain-text');
  await until(()=>control.pending.length===2);assert.equal(control.pending[1].request.input.text,'second');control.pending[1].resume();await b;
 }finally{await host.dispose();}
});

test('cancel rejects old result and exact stale target cannot stop retry',async()=>{
 const {host,control}=await fixture({hold:true});try{
  const a=host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]},requestId:'A'}).catch(e=>e);
  await until(()=>control.pending.length===1);const old=host.inspect().activeTarget;await host.cancel(old);assert.equal((await a).code,'INVOCATION_CANCELLED');
  const b=host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]},requestId:'B'});await until(()=>control.pending.length===2);
  await assert.rejects(()=>host.cancel(old),{code:'TARGET_MISMATCH'});control.pending[1].resume();assert.equal((await b).status,'EXECUTION_COMPLETED');
 }finally{await host.dispose();}
});

test('failed native release quarantines output until cleanup recovery',async()=>{
 const {host,control}=await fixture({cleanupFailure:true});try{
  await assert.rejects(()=>host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]}}),{code:'RESOURCE_CLEANUP_FAILED'});
  assert.equal(host.inspect().currentResult,null);assert.equal(host.inspect().recoveryRequired,true);
  await assert.rejects(()=>host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]}}));
  control.setCleanupFailure(false);await host.recover();assert.equal(host.inspect().recoveryRequired,false);
  assert.equal((await host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]}})).status,'EXECUTION_COMPLETED');
 }finally{control.setCleanupFailure(false);await host.dispose();}
});

test('progress observer errors cannot fail execution and reconfigure cancels pending work',async()=>{
 const {host,control}=await fixture({hold:true});try{
  const seen=[];host.subscribe(s=>seen.push(s));
  const a=host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]},onProgress(){throw Error('view error');}}).catch(e=>e);
  await until(()=>control.pending.length===1);const before=host.inspect().configurationRevision;await host.configure(await config());assert.equal((await a).code,'INVOCATION_CANCELLED');
  assert.equal(host.inspect().configurationRevision,before+1);assert.ok(seen.some(s=>s.progress?.stage==='controlled-start'));assert.equal(host.inspect().currentResult,null);
 }finally{await host.dispose();}
});

test('invalid native reconfiguration leaves prior usable manifest and revision intact',async()=>{
 const {host}=await fixture();try{const before=host.inspect().configurationRevision,bad=await config();bad.manifest.hiddenSize=17;
  await assert.rejects(()=>host.configure(bad));assert.equal(host.inspect().configurationRevision,before);assert.equal(host.inspect().recoveryRequired,false);
  assert.equal((await host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]}})).status,'EXECUTION_COMPLETED');
 }finally{await host.dispose();}
});

test('abort queued request never publishes or interrupts its running predecessor',async()=>{
 const {host,control}=await fixture({hold:true});try{
  const a=host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]}});await until(()=>control.pending.length===1);
  const abort=new AbortController(),b=host.execute({operation:'encode',input:{tokenIds:[2],attentionMask:[1]},signal:abort.signal}).catch(e=>e);abort.abort();assert.equal((await b).code,'INVOCATION_CANCELLED');
  assert.equal(control.pending.length,1);control.pending[0].resume();assert.equal((await a).status,'EXECUTION_COMPLETED');
 }finally{await host.dispose();}
});

test('stream descriptor support is native and independent raw decode needs no generated receipt',async()=>{
 assert.equal(typeof api.createTextVaeStandaloneManagement,'function');const host=await api.createTextVaeStandaloneManagement({kind:'vae',configuration:await config('vae')});try{
  const input={dtype:'float32',layout:'NCTHW',shape:[1,16,21,60,104],meaning:'wan21-raw-latent:v1'};
  const q=host.query({operation:'decode',input});assert.equal(q.support.supported,true);assert.deepEqual(q.decode.output.shape,[1,3,81,480,832]);assert.equal(q.runtime.decode.verified,false);
  assert.equal(host.query({operation:'decode',input:{...input,normalization:'wan21-comfy-f32-v1',meaning:'wan21-normalized-posterior-mean:v1'}}).support.supported,false);
 }finally{await host.dispose();}
});

test('stream result binds configured threads and preserves actual tail processing',async()=>{
 assert.equal(typeof api.createTextVaeStandaloneManagement,'function');
 const {requiredStreamAssets}=await import('../../docs/shared/ai-connection/adapters/text-vae-standalone/native.mjs');
 for(const mutation of ['none','threads','processing']){
  const configuration=await config('vae');
  const host=await api.createTextVaeStandaloneManagement({kind:'vae',configuration,controlOnly:{clientFactory(){return {state:{status:'idle'},async run(q){
   const output={tensor:{dtype:'float32',layout:'NCTHW',shape:[1,16,1,2,4],meaning:'raw-posterior-mean',modelSha256:q.manifest.model.sha256,data:new Float32Array(128),frameProcessing:{schemaVersion:1,policy:'wan21-causal-floor-v1',sourceFrames:4,latentFrames:1,consumedFrames:1,unusedTailFrames:3}},inputDescriptor:api.describeTensor(q.input),binding:{operation:'encode',kind:'wan21-vae-stream-v1',inputShape:[1,3,4,16,32],outputShape:[1,16,1,2,4],assetsVerified:true,assetHashes:Object.fromEntries(requiredStreamAssets(q.manifest,'encode').map(id=>[id,q.manifest.assets[id].sha256])),graphMetadataChecked:true,executionProvider:'wasm',threads:1},processing:{sourceFrames:4,latentFrames:1,consumedFrames:1,ignoredTailFrames:3,decodedFrames:1,tailRule:'native-floor-complete-groups-of-four-after-first-frame',consumedFrameIndices:[0],ignoredTailFrameIndices:[1,2,3]}};
   if(mutation==='threads')output.binding.threads=4;if(mutation==='processing')delete output.processing;return output;
  },cancel(){},dispose(){}};}}});
  try{const run=()=>host.execute({operation:'encode',input:{dtype:'float32',layout:'NCTHW',shape:[1,3,4,16,32],meaning:'raw-decoder-rgb',data:new Float32Array(6144)}});
   if(mutation==='none'){const r=await run();assert.equal(r.result.processing.ignoredTailFrames,3);assert.equal(r.tensor.frameProcessing.sourceFrames,4);assert.equal(r.tensor.frameProcessing.unusedTailFrames,3);}else await assert.rejects(run,{code:'TEXT_VAE_RESULT_MISMATCH'});
  }finally{await host.dispose();}
 }
});

test('adopted native codec roundtrip retains supplied frameProcessing and marker',async()=>{
 assert.equal(typeof api.encodeTensor,'function');const t={dtype:'float32',layout:'NCTHW',shape:[1,16,1,2,2],meaning:'wan21-normalized-posterior-mean:v1',normalization:'wan21-comfy-f32-v1',data:new Float32Array(64),frameProcessing:{schemaVersion:1,policy:'wan21-causal-floor-v1',sourceFrames:4,latentFrames:1,consumedFrames:1,unusedTailFrames:3}};
 const restored=await api.decodeTensor(await api.encodeTensor(t));assert.deepEqual(restored.frameProcessing,t.frameProcessing);assert.equal(restored.normalization,t.normalization);assert.notEqual(restored.data.buffer,t.data.buffer);
});


test('default adoption selects fixed 20f owner, source-ordered manifest and current codec',async()=>{
 const native=await import('../../docs/shared/ai-connection/adapters/text-vae-standalone/native.mjs');
 assert.equal(native.ADOPTED_TEXT_VAE_SOURCE.commit,'20f640a6e071b6c060a212e89b28f0c8965923f7');
 const manifest=await native.readTextVaeConfigurationManifest('text');
 assert.equal(manifest.blocks.length,24);
 for(const block of manifest.blocks){assert.equal(block.normLowering.type,'umt5-inner-rmsnorm-avx2-cascade-f32-v1');assert.equal(block.normLowering.status,'source-ordered-fp32');assert.equal(block.normLowering.sourceAsset.sha256,block.sha256);assert.equal(block.attentionLowering,undefined);}
 const codec=native.createCurrentTextVaeCodec();assert.equal(codec.codecVersion,'WKTSR001/schemaVersion1');assert.equal(codec.sourceRef.commit,native.ADOPTED_TEXT_VAE_SOURCE.commit);assert.equal(codec.sourceRef.path,'docs/shared/inference/tensor.mjs');
});

test('current native result requires exact configured graph bindings outside strict tensor',async()=>{
 for(const mutation of ['wrong','missing']){
  const {host}=await fixture({graphBindingsMutation:mutation});
  try{await assert.rejects(()=>host.execute({operation:'encode',input:{tokenIds:[1],attentionMask:[1]}}),{code:'TEXT_VAE_RESULT_MISMATCH'});}finally{await host.dispose();}
 }
});

test('fixed manifest recipes reject wrong source binding and missing configuration manifest',async()=>{
 const native=await import('../../docs/shared/ai-connection/adapters/text-vae-standalone/native.mjs');
 const manifest=await native.readTextVaeConfigurationManifest('text');
 const module=native.createTextEncoderModule();
 try{
  const wrong=structuredClone(manifest);assert.ok(wrong.blocks[0].normLowering,'Selected manifest must carry normLowering');wrong.blocks[0].normLowering.sourceAsset.sha256='0'.repeat(64);
  assert.throws(()=>module.configure({manifest:wrong,files:new Map()}),/recipe.*original asset/i);
  assert.throws(()=>module.configure({files:new Map()}),/manifest/i);
 }finally{module.dispose();}
});

test('native source bootstrap rejects missing or changed selected manifest bytes',async()=>{
 const native=await import('../../docs/shared/ai-connection/adapters/text-vae-standalone/native.mjs');
 const manifestPath=native.TEXT_VAE_CONFIGURATION_PATHS.text;
 for(const mutation of ['missing','changed'])await assert.rejects(()=>native.verifyTextVaeStandaloneSources({async read(path){const bytes=new Uint8Array(await readFile(new URL(path,native.TEXT_VAE_STANDALONE_ROOT_URL)));if(path===manifestPath){if(mutation==='missing')return new Uint8Array();bytes[bytes.length-2]^=1;}return bytes;}}),{code:'TEXT_VAE_SOURCE_MISMATCH',fieldPath:manifestPath});
});


test('retained badff7a source and legacy manifest remain independently usable regression',async()=>{
 const source=JSON.parse(await readFile(new URL('SOURCE.json',root),'utf8'));
 assert.equal(source.sourceRef.commit,'badff7a436b56207a084c4c770e01490899a576c');
 for(const file of source.files){const bytes=await readFile(new URL(file.path,root));assert.equal(bytes.byteLength,file.byteLength);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
 const legacy=await import(new URL('docs/shared/inference/api.mjs',root));
 const latest=await import('../../docs/shared/ai-connection/adapters/text-vae-standalone/native.mjs');
 const manifest=await latest.readTextVaeConfigurationManifest('legacyText');
 const oldModule=legacy.createTextEncoderModule(),newModule=latest.createTextEncoderModule();
 try{assert.equal(oldModule.configure({manifest,files:new Map()}).configured,true);const caps=newModule.configure({manifest,files:new Map()});assert.equal(caps.configured,true);assert.ok(caps.graphBindings.every(binding=>binding.recipeId===null&&binding.executedGraphSha256===binding.sourceAssetSha256));}finally{oldModule.dispose();newModule.dispose();}
 const markerless={dtype:'float32',shape:[1,1,4096],layout:'BLC',meaning:'text_hidden_states',data:new Float32Array(4096),attentionMask:Uint8Array.of(1)};
 const decoded=await latest.decodeTensor(await legacy.encodeTensor(markerless));assert.equal(decoded.normalization,undefined);assert.deepEqual(decoded.attentionMask,markerless.attentionMask);
});

test('current codec preserves all text mask and identity fields without inferring lowering',async()=>{
 const native=await import('../../docs/shared/ai-connection/adapters/text-vae-standalone/native.mjs'),codec=native.createCurrentTextVaeCodec();
 const tensor={dtype:'float32',layout:'BLC',shape:[1,2,4096],meaning:'text_hidden_states',data:Float32Array.from({length:8192},(_,i)=>i/8192),modelSha256:'1'.repeat(64),tokenizerSha256:'2'.repeat(64),normalization:'umt5-final-rmsnorm-f32-v1',attentionMask:Uint8Array.of(1,0)};
 const bytes=await codec.encode(tensor),decoded=await codec.decode(bytes);
 for(const key of ['dtype','layout','shape','meaning','data','modelSha256','tokenizerSha256','normalization','attentionMask'])assert.deepEqual(decoded[key],tensor[key],key);
 assert.notEqual(decoded.data.buffer,tensor.data.buffer);assert.notEqual(decoded.attentionMask.buffer,tensor.attentionMask.buffer);assert.equal(decoded.graphBindings,undefined);assert.equal(decoded.normLowering,undefined);
 const changed=bytes.slice();changed[changed.length-1]^=1;await assert.rejects(()=>codec.decode(changed),/SHA-256 mismatch/);
 await assert.rejects(()=>codec.encode({...tensor,normalization:'encoder-final-rmsnorm'}),/normalization marker contradicts/);
});

test('current codec retains generated producers decoder restoration and causal source mapping',async()=>{
 const codec=api.createCurrentTextVaeCodec();
 const context={schemaVersion:1,contextId:'context-raw',inputId:'source',inputSha256:'4'.repeat(64),slotId:'main',sourceFrameIndices:[9,10,11,12],sourceFrameTimesSeconds:[0.3,0.4,0.5,0.6]};
 const tensor={dtype:'float32',layout:'NCTHW',shape:[1,16,1,2,2],meaning:'wan21-raw-generated-sample:v1',modelSha256:'1'.repeat(64),data:new Float32Array(64),context,frameProcessing:{schemaVersion:1,policy:'wan21-causal-floor-v1',sourceFrames:4,latentFrames:1,consumedFrames:1,unusedTailFrames:3,sourceContext:context},latentContract:{schemaVersion:1,representation:'generated-sample',space:'raw',vaeModelSha256:'3'.repeat(64),producerModelSha256s:['1'.repeat(64),'2'.repeat(64)],normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}}};
 tensor.data[0]=-3.5;tensor.data[1]=4.25;
 const decoded=await codec.decode(await codec.encode(tensor));
 for(const key of ['meaning','modelSha256','data','context','frameProcessing','latentContract'])assert.deepEqual(decoded[key],tensor[key],key);
 assert.equal(decoded.normalization,undefined);assert.notEqual(decoded.data.buffer,tensor.data.buffer);
 const missing=structuredClone(tensor);delete missing.latentContract;await assert.rejects(()=>codec.encode(missing),/separate latent contract/);
 const wrong=structuredClone(tensor);wrong.latentContract.normalization.owner='vae';await assert.rejects(()=>codec.encode(wrong),/generated-sample contract/);
});

test('actual norm lowering copies only bounded metadata and rejects unverified or corrupt execution',async()=>{
 const native=await import('../../docs/shared/ai-connection/adapters/text-vae-standalone/native.mjs');
 const {rewriteInnerRmsNormGraph,verifyInnerRmsNormGraph}=await import(new URL('docs/shared/inference/text-norm-lowering.mjs',native.TEXT_VAE_STANDALONE_ROOT_URL));
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 const original=Uint8Array.from([19,9,1,2,9,9,9,9,9,9,3,4,9,9,9,9,9,9,9,9]),expected=Uint8Array.from([22,9,10,11,12,9,9,9,9,9,9,20,21,22,23,9,9,9,9,9,9,9,9]);
 const op=(role,offset,before,after)=>({role,offset,beforeHex:Buffer.from(before).toString('hex'),afterBase64:Buffer.from(after).toString('base64')});
 const recipe={schemaVersion:1,type:'umt5-inner-rmsnorm-avx2-cascade-f32-v1',status:'source-ordered-fp32',index:0,path:'control-graph',sourceAsset:{bytes:20,sha256:sha(original)},executedBytes:23,executedGraphSha256:sha(expected),sourceGraphPayloadOffset:1,sourceGraphLength:19,executedGraphLength:22,operations:[op('graph-length',0,[19],[22]),op('inner-rmsnorm-0-reduce-mean',2,[1,2],[10,11,12]),op('inner-rmsnorm-1-reduce-mean',10,[3,4],[20,21,22,23])]};
 const output=await rewriteInnerRmsNormGraph(original,recipe,{verifiedSourceAssetSha256:sha(original)});
 assert.deepEqual(output,expected);assert.notEqual(output.buffer,original.buffer);assert.equal(original[0],19);
 const verified=await verifyInnerRmsNormGraph(output,recipe);assert.equal(verified.executedGraphSha256,sha(expected));assert.equal(verified.status,'source-ordered-fp32');
 await assert.rejects(()=>rewriteInnerRmsNormGraph(original,recipe),/hash verification required/);
 const corrupted=output.slice();corrupted[corrupted.length-1]^=1;await assert.rejects(()=>verifyInnerRmsNormGraph(corrupted,recipe),/execution graph hash mismatch/);
 const abort=new AbortController();await assert.rejects(()=>rewriteInnerRmsNormGraph(original,recipe,{verifiedSourceAssetSha256:sha(original),signal:abort.signal,onProgress(){abort.abort(new DOMException('norm control aborted','AbortError'));}}),/norm control aborted/);assert.equal(original[0],19);
});

test('ordinary all512 active legal IDs retain selected norm bindings without numerical proof inputs',async()=>{
 const {host,control}=await fixture();
 try{
  const tokenIds=Int32Array.from({length:512},(_,i)=>i),attentionMask=new Uint8Array(512).fill(1);
  const result=await host.execute({operation:'encode',input:{tokenIds,attentionMask}});
  assert.deepEqual(result.tensor.shape,[1,512,4096]);assert.deepEqual(result.tensor.attentionMask,attentionMask);assert.equal(control.pending[0].request.input.tokenIds[0],0);
  assert.equal(result.result.graphBindings.length,24);assert.ok(result.result.graphBindings.every(binding=>binding.recipeId==='umt5-inner-rmsnorm-avx2-cascade-f32-v1'&&binding.recipeStatus==='source-ordered-fp32'&&binding.sourceAssetSha256!==binding.executedGraphSha256));
  assert.equal(result.tensor.graphBindings,undefined);assert.equal(result.result.evidence,undefined);assert.equal(result.controlOnly,true);assert.equal(result.generationReady,false);
 }finally{await host.dispose();}
});

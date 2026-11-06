// Actual fixed498 native descriptor/capability validators, controlled transport.
// No Worker, graph execution, tensor math, independent reference or numerical PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createNormalOperationAdapter} from '../../docs/shared/ai-connection/adapters/normal-operation.mjs';
const m=await import('../../docs/shared/ai-connection/adapters/normal-vae-owner.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
const rootArg=process.argv.indexOf('--native-root'),root=rootArg>=0?process.argv[rootArg+1]:process.env.NORMAL_VAE_NATIVE_ROOT;
if(!root)throw Error('Fixed498 source required: --native-root <materialized repository root> or NORMAL_VAE_NATIVE_ROOT');
const nativeRoot=resolve(root);
for(const [path,expected] of Object.entries({'api.mjs':'b637a22e6447b638e0739d8510c4361cec52f9bf25b4be15e8cf65bfc06accda','vae-api.mjs':'8de43d144b7a08fe9d0449b8a252ef7133e742a8b70071000a3895a78d6e8a2a','vae.mjs':'24808b4594b77e481b878e2109fd3d65555aeace1eccb9298df9f5df0d92c047','tensor.mjs':'e200fef69be3909a13bc91a59743681df1072817eadc7c1865717afe0c3c9f8e'}))assert.equal(createHash('sha256').update(readFileSync(join(nativeRoot,'docs/shared/inference',path))).digest('hex'),expected,'Fixed498 native source '+path);
const nativeModule=await import(pathToFileURL(join(nativeRoot,'docs/shared/inference/api.mjs')));
const copy=structuredClone,hash='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b';
function configuration(){
 const asset=(file,bytes,shape)=>({file,bytes,sha256:'a'.repeat(64),...(shape?{shape}:{})});
 const manifest={schemaVersion:1,kind:'wan21-vae-profile-v1',model:{sha256:hash,executionDtype:'float32'},profile:{id:'native:configured-rect',videoShape:[1,3,1,16,32],latentShape:[1,16,1,2,4],layout:'NCTHW',latentSpace:'raw',posterior:'mean',opset:17},assets:{encoder:asset('encoder.onnx',8),decoderBody:asset('decoder.onnx',8),conv2Weight:asset('conv2.f32',1024,[16,16]),conv2Bias:asset('bias.f32',64,[16])},inference:{inputName:'input',outputName:'output',executionProvider:'wasm',threads:1,graphOptimizationLevel:'disabled'}};
 return {manifest,files:new Map(Object.values(manifest.assets).map(a=>[a.file,new Blob([new Uint8Array(a.bytes)])]))};
}
function tensor(operation='encode'){
 return {dtype:'float32',layout:'NCTHW',shape:operation==='encode'?[1,3,1,16,32]:[1,16,1,2,4],meaning:operation==='encode'?'raw-decoder-rgb':'raw-posterior-mean',...(operation==='decode'?{modelSha256:hash}:{}),data:new Float32Array(operation==='encode'?1536:128),context:{schemaVersion:1,contextId:'source:0',inputId:'source',inputSha256:'b'.repeat(64),slotId:'source',sourceFrameIndices:[0]}};
}
function controlled({wait,result,dispose}={}){
 const requests=[],clients=[];
 const clientFactory=()=>{
  let status='idle',rejectActive;
  const client={get state(){return{status,module:'vae'};},async run(q){status='running';requests.push(q);try{
   if(wait)await new Promise((resolve,reject)=>{rejectActive=reject;wait({resolve,reject,request:q});});
   const operation=q.operation,p=q.manifest.profile,roles=operation==='encode'?['encoder']:['decoderBody','conv2Weight','conv2Bias'];
   // Transport-only payload. Actual NN checks occur in the separate holding run.
   const value={tensor:{dtype:'float32',layout:'NCTHW',shape:[...(operation==='encode'?p.latentShape:p.videoShape)],meaning:operation==='encode'?'raw-posterior-mean':'raw-decoder-rgb',modelSha256:hash,data:new Float32Array(operation==='encode'?128:1536),context:copy(q.input.context)},inputDescriptor:nativeModule.describeTensor(q.input),binding:{operation,inputShape:[...q.input.shape],outputShape:[...(operation==='encode'?p.latentShape:p.videoShape)],assetsVerified:true,assetHashes:Object.fromEntries(roles.map(role=>[role,q.manifest.assets[role].sha256])),graphMetadataChecked:true}};
   status='success';return result?result(value):value;
  }catch(e){status='error';throw e;}finally{rejectActive=null;}},cancel(){status='cancelled';rejectActive?.(Error('Inference cancelled'));},dispose(){if(dispose)dispose();client.cancel();status='disposed';}};
  clients.push(client);return client;
 };
 return {clientFactory,requests,clients};
}
async function owner(options={}){assert.equal(typeof m.createNormalVaeOwner,'function','Normal VAE facade required');const transport=controlled(options),config=configuration();return {owner:await m.createNormalVaeOwner({nativeModule,configuration:config,clientFactory:transport.clientFactory,inputPayloadBudgetBytes:options.inputPayloadBudgetBytes}),transport,config};}

test('descriptor-only VAE query construction never reads or clones tensor payload',()=>{
 const input=tensor('decode');Object.defineProperty(input,'data',{get(){throw Error('Descriptor construction read tensor payload');}});const descriptor=m.createNormalVaeRequestDescriptor('decode',input);assert.equal(descriptor.artifact.native.metadata.data,undefined);assert.deepEqual(descriptor.artifact.tensor.shape,input.shape);
});

// Removing actual native capability queries, or adding a manager shape allowlist,
// makes owner-defined profile selection and exact-shape refusal fail here.
test('fixed498 capabilities drive ordinary support without diagnostic prerequisites',async()=>{
 const f=await owner();try{
  const d=m.createNormalVaeRequestDescriptor('encode',tensor()),r=await f.owner.querySupport(d);
  assert.equal(r.status,'SUPPORTED');assert.equal(r.consumerPort.profileRef,'native:configured-rect');assert.equal(r.nativeSupport.code,'SUPPORTED');assert.equal(r.nativeCapabilities.runtime.encode.verified,false);assert.equal(f.transport.requests.length,0);assert.equal(d.artifact.native.metadata.data,undefined);assert.equal(f.owner.observe().nativeAPI.build,'works-inference-v1');assert.equal(f.owner.observe().nativeSessionId,undefined);
  f.config.manifest.profile.id='owner:new-profile';await f.owner.configure(f.config);assert.equal((await f.owner.querySupport(d)).consumerPort.profileRef,'owner:new-profile');
 }finally{await f.owner.dispose();}
});
test('logical imported payload extent is bounded independently from current request and full RAM',async()=>{
 const f=await owner();try{const encode=await f.owner.querySupport(m.createNormalVaeRequestDescriptor('encode',tensor()));assert.equal(encode.observation.resourceState.requiredBytes,6144);assert.equal(encode.observation.resourceState.budgetBytes,6144);const decode=await f.owner.querySupport(m.createNormalVaeRequestDescriptor('decode',tensor('decode')));assert.equal(decode.observation.resourceState.requiredBytes,512);assert.equal(decode.observation.resourceState.budgetBytes,6144);assert.match(decode.observation.resourceState.scope,/one logical imported payload/);assert.match(decode.observation.resourceState.scope,/excludes.*copies.*ORT.*host.*total RAM/);}finally{await f.owner.dispose();}
 const g=await owner({inputPayloadBudgetBytes:511}),host=createNormalOperationAdapter({owner:g.owner});try{const reply=await host.querySupport(m.createNormalVaeRequestDescriptor('decode',tensor('decode')));assert.equal(reply.status,'SUPPORTED');assert.equal(reply.dispatchSupported,false);assert.equal(reply.edgeDecision.readiness.state,'blocked');assert.equal(g.transport.requests.length,0);}finally{await host.dispose();}
});
test('model selection references compare actual configured model and unknown reference formats stay unverified',async()=>{
 const f=await owner();try{for(const ref of [hash,{identityKind:'model',role:'decoder',algorithm:'sha256',value:hash,scope:'full-file'}]){const d=m.createNormalVaeRequestDescriptor('decode',tensor('decode'));d.modelRefs=[ref];assert.equal((await f.owner.querySupport(d)).status,'SUPPORTED');}const wrong=m.createNormalVaeRequestDescriptor('decode',tensor('decode'));wrong.modelRefs=['f'.repeat(64)];const mismatch=await f.owner.querySupport(wrong);assert.equal(mismatch.status,'UNSUPPORTED');assert.equal(mismatch.reasons[0].code,'NORMAL_VAE_MODEL_MISMATCH');const unknown=m.createNormalVaeRequestDescriptor('decode',tensor('decode'));unknown.modelRefs=[{futureModelRef:'retained-opaque'}];const unresolved=await f.owner.querySupport(unknown);assert.equal(unresolved.status,'UNVERIFIED');assert.equal(unresolved.reasons[0].code,'NORMAL_VAE_MODEL_REFERENCE_UNVERIFIED');assert.equal(f.transport.requests.length,0);}finally{await f.owner.dispose();}
});
test('missing asset and incompatible native meaning or shape preserve exact owner reasons',async()=>{
 const f=await owner();try{
  f.config.files.delete('encoder.onnx');await f.owner.configure(f.config);const missing=await f.owner.querySupport(m.createNormalVaeRequestDescriptor('encode',tensor()));assert.equal(missing.status,'UNSUPPORTED');assert.equal(missing.nativeSupport.code,'MISSING_ASSET');assert.match(missing.reasons[0].reason,/encoder.onnx/);assert.deepEqual(missing.reasons[0].requiredChanges,['Provide the configured asset via files Map']);
  for(const change of [t=>t.shape=[1,16,21,60,104],t=>{t.meaning='wan21-normalized-posterior-mean:v1';t.normalization='wan21-comfy-f32-v1';},t=>t.modelSha256='f'.repeat(64)]){const t=tensor('decode');change(t);const r=await f.owner.querySupport(m.createNormalVaeRequestDescriptor('decode',t));assert.equal(r.status,'UNSUPPORTED');assert.equal(r.nativeSupport.code,'DESCRIPTOR_UNSUPPORTED');}
  assert.equal(f.transport.requests.length,0);
 }finally{await f.owner.dispose();}
});
test('shared normal host preserves VAE tensor inputDescriptor and binding through terminal release',async()=>{
 const f=await owner(),host=createNormalOperationAdapter({owner:f.owner});try{
  for(const op of ['encode','decode']){const input=tensor(op),descriptor=m.createNormalVaeRequestDescriptor(op,input),result=await host.execute({descriptor,input});assert.equal(result.status,'EXECUTION_COMPLETED');assert.equal(result.terminal.originalTerminal,true);assert.equal(result.terminal.resourceReleased,true);assert.equal(result.output.inputDescriptor.meaning,input.meaning);assert.deepEqual(result.output.inputDescriptor.context,input.context);assert.equal(result.output.binding.assetsVerified,true);assert.equal(result.output.binding.operation,op);assert.equal(result.output.evidence,undefined);assert.equal(result.generationReady,false);}
  assert.equal(f.transport.requests.length,2);assert.equal(f.transport.requests.every(q=>q.diagnostics===false),true);
 }finally{await host.dispose();}
});
test('explicit common and native descriptor contradictions cannot be silently overwritten',async()=>{
 const f=await owner();try{for(const [key,value] of [['meaning','foreign'],['shape',[1,3,1,32,16]],['layout','NTHWC'],['dtype','float16']]){const d=m.createNormalVaeRequestDescriptor('encode',tensor());d.artifact.native.metadata[key]=value;const r=await f.owner.querySupport(d);assert.equal(r.status,'UNSUPPORTED');assert.equal(r.reasons[0].code,'NORMAL_VAE_DESCRIPTOR_CONFLICT');}assert.equal(f.transport.requests.length,0);}finally{await f.owner.dispose();}
});
// Decoded files contain storage headers too; native describeTensor owns the
// semantic metadata projection and must not mistake those headers for meaning.
test('ordinary decoded WKT input retains native semantic snapshot through normal decode',async()=>{
 const f=await owner(),host=createNormalOperationAdapter({owner:f.owner});try{const input=await nativeModule.decodeTensor(await nativeModule.encodeTensor(tensor('decode')));assert.equal(input.schemaVersion,1);const result=await host.execute({descriptor:m.createNormalVaeRequestDescriptor('decode',input),input});assert.equal(result.status,'EXECUTION_COMPLETED');assert.equal(result.output.inputDescriptor.byteOrder,undefined);assert.deepEqual(result.output.inputDescriptor,nativeModule.describeTensor(input));}finally{await host.dispose();}
});
test('configure invalidates prior support and resets native runtime observations',async()=>{
 const f=await owner(),d=m.createNormalVaeRequestDescriptor('encode',tensor()),target={requestId:'old'};try{await f.owner.querySupport(d);const before=f.owner.observe();await f.owner.configure(f.config);assert.notEqual(f.owner.observe().resourceGeneration,before.resourceGeneration);await assert.rejects(()=>f.owner.invoke({descriptor:d,input:tensor(),target}),{code:'NORMAL_SUPPORT_STALE'});assert.equal((await f.owner.querySupport(d)).nativeCapabilities.runtime.encode.verified,false);assert.equal(f.transport.requests.length,0);}finally{await f.owner.dispose();}
});
test('exact cancellation rejects A and stale A cannot cancel next native B',async()=>{
 const pending=[];const f=await owner({wait:x=>pending.push(x)}),host=createNormalOperationAdapter({owner:f.owner}),d=m.createNormalVaeRequestDescriptor('encode',tensor());
 try{const a=host.execute({descriptor:d,input:tensor(),requestId:'A'}).catch(e=>e);while(pending.length<1)await new Promise(r=>setImmediate(r));const old=host.inspect().activeTarget;await host.cancel(old);assert.equal((await a).code,'INVOCATION_CANCELLED');const b=host.execute({descriptor:d,input:tensor(),requestId:'B'});while(pending.length<2)await new Promise(r=>setImmediate(r));await assert.rejects(()=>host.cancel(old),{code:'TARGET_MISMATCH'});pending[1].resolve();assert.equal((await b).status,'EXECUTION_COMPLETED');}finally{for(const p of pending)p.resolve();await host.dispose();}
});
test('native result binding mismatch cannot become current normal completion',async()=>{
 const f=await owner({result:r=>({...r,binding:{...r.binding,assetHashes:{encoder:'f'.repeat(64)}}})}),host=createNormalOperationAdapter({owner:f.owner});try{await assert.rejects(()=>host.execute({descriptor:m.createNormalVaeRequestDescriptor('encode',tensor()),input:tensor()}),{code:'NORMAL_VAE_RESULT_BINDING_MISMATCH'});assert.equal(host.inspect().currentResult,null);}finally{await host.dispose();}
});
test('failed private disposal blocks support until recovery completes',async()=>{
 let failOnce=true;const f=await owner({dispose:()=>{if(failOnce){failOnce=false;throw Error('Worker resource stop failed');}}});try{await assert.rejects(()=>f.owner.configure(f.config),/Worker resource stop failed/);assert.equal(f.owner.observe().cleanupPending,true);await assert.rejects(()=>f.owner.querySupport(m.createNormalVaeRequestDescriptor('encode',tensor())),{code:'NORMAL_OWNER_RECOVERY_REQUIRED'});assert.equal((await f.owner.recover()).resourceReleased,true);assert.equal((await f.owner.querySupport(m.createNormalVaeRequestDescriptor('encode',tensor()))).status,'SUPPORTED');}finally{await f.owner.dispose();}
});

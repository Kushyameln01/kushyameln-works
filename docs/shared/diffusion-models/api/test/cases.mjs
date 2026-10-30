const results=[];
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
function fixture(overrides={},padding=8){
 const object={x:{dtype:'F32',shape:[2],data_offsets:[0,8]},...overrides};
 let h=JSON.stringify(object); h+=' '.repeat((8-h.length%8)%8);
 const bytes=new TextEncoder().encode(h),prefix=new ArrayBuffer(8);
 new DataView(prefix).setBigUint64(0,BigInt(bytes.length),true);
 return new Blob([prefix,bytes,new Uint8Array(padding)]);
}
export async function run(){
 let mod;
 try{mod=await import('../index.mjs');}catch(error){throw Error('Missing diffusion API implementation: '+error.message);}
 const test=async(name,fn)=>{await fn();results.push({name,passed:true});};
 const api=mod.createDiffusionModels({sessionId:'test-session'});
 let seq=0;
 const req=(op,input={},revision=0)=>({protocolVersion:'diffusion-models/0.1',sessionId:api.sessionId,jobId:'j'+(++seq),inputRevision:revision,op,input});
 const ask=(op,input,revision)=>api.request(req(op,input,revision));
 await test('Capabilities truthfully distinguish real Euler from unavailable neural inference',async()=>{
  const r=await ask('capabilities');assert(r.status==='ok','capabilities failed');
  assert(r.result.modelInference===false && r.result.eulerStep===true,'truthful capabilities');
  assert(r.result.schedule&&r.result.noiseMix&&r.result.inverseNoiseScale&&r.result.flowDenoised&&r.result.validateConditioning&&r.result.validateRawLatent&&r.result.normalizeRawMean&&r.result.restoreRawMean&&r.result.linearProjection&&r.result.partialOnly,'additive capabilities missing');
  assert(r.result.maxTensorElements===1048576,'Euler budget missing');assert(r.buildId===r.result.buildId&&r.buildId.includes('diffusion-models/0.1'),'build identity missing');
 });
 await test('Header-only inspection validates bytes and returns original identities',async()=>{
  const q=req('inspect',{file:fixture()});const r=await api.request(q);
  assert(r.status==='ok'&&r.result.tensorCount===1&&r.result.payloadBytes===8,'inspect result');
  for(const key of ['protocolVersion','sessionId','jobId','inputRevision','op'])assert(r[key]===q[key],'echo '+key);
  assert(r.result.headerSHA256?.length===64&&r.result.fullFileSHA256===null,'hash provenance wrong');
 });
 await test('Invalid safetensors extents dtype shape and payload are rejected',async()=>{
  const bad=[fixture({x:{dtype:'F32',shape:[3],data_offsets:[0,8]}}),fixture({x:{dtype:'WHAT',shape:[2],data_offsets:[0,8]}}),fixture({x:{dtype:'F32',shape:[2],data_offsets:[1,9]}}),fixture({},7),fixture({x:{dtype:'F32',shape:[-1],data_offsets:[0,8]}})];
  for(const file of bad){const r=await ask('inspect',{file});assert(r.status==='error'&&r.error.code==='INVALID_SAFETENSORS','invalid accepted');}
  const prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,8388609n,true);
  const r=await ask('inspect',{file:new Blob([prefix])});assert(r.status==='error','oversize header accepted');
 });
 await test('Real Hike Euler returns numeric result and preserves caller arrays',async()=>{
  const latent=new Float32Array([3,7,-2]),denoised=new Float32Array([1,3,2]);
  const r=await ask('eulerStep',{latent,denoised,sigma:2,nextSigma:1});
  assert(r.status==='ok',JSON.stringify(r.error));assert(r.result.latent instanceof Float32Array,'binary result');
  assert(String([...r.result.latent])==='2,5,0','Euler result');
  assert(String([...latent])==='3,7,-2'&&String([...denoised])==='1,3,2','caller mutated/detached');
  assert(r.result.hikeWasmSHA256?.length===64,'Hike provenance missing');
 });
 await test('Euler rejects invalid dtype shape and nonfinite values',async()=>{
  const bad=[{latent:[1],denoised:new Float32Array([1]),sigma:1,nextSigma:0},{latent:new Float32Array([1]),denoised:new Float32Array(2),sigma:1,nextSigma:0},{latent:new Float32Array([NaN]),denoised:new Float32Array([1]),sigma:1,nextSigma:0},{latent:new Float32Array([1]),denoised:new Float32Array([1]),sigma:0,nextSigma:0}];
  for(const input of bad){const r=await ask('eulerStep',input);assert(r.status==='error','invalid Euler accepted');}
 });
 await test('Euler enforces its tensor budget before result allocation',async()=>{
  const a=new Float32Array(1048577);const r=await ask('eulerStep',{latent:a,denoised:a,sigma:1,nextSigma:0});
  assert(r.error?.code==='TENSOR_BUDGET_EXCEEDED','oversize tensor accepted');
 });
 await test('Stale worker replies cannot settle the active request',async()=>{
  const NativeWorker=globalThis.Worker;let owned;
  globalThis.Worker=class extends NativeWorker{constructor(...args){super(...args);owned=this;}};
  const isolated=mod.createDiffusionModels({sessionId:'stale-check'});
  try{
   const q={protocolVersion:'diffusion-models/0.1',sessionId:'stale-check',jobId:'real-job',inputRevision:0,op:'inspect',input:{file:fixture()}};
   let settled=false;const pending=isolated.request(q).then(r=>{settled=true;return r;});
   for(const change of [{jobId:'old-job'},{sessionId:'old-session'},{inputRevision:99},{protocolVersion:'wrong'},{op:'predict'},{buildId:'wrong-build'},{buildId:undefined}])owned.dispatchEvent(new MessageEvent('message',{data:{...q,...change,status:'ok',result:{stale:true}}}));
   await Promise.resolve();assert(!settled,'stale reply settled real job');
   const r=await pending;assert(r.status==='ok'&&r.result.tensorCount===1&&!r.result.stale,'real reply lost');
  }finally{isolated.dispose();globalThis.Worker=NativeWorker;}
 });
 await test('Actual Hike schedule exposes exact simple6 and HIGH LOW split with six times',async()=>{
  const r=await ask('schedule',{profile:'bernini-comfy-simple6-shift5-v1'});assert(r.status==='ok',JSON.stringify(r.error));
  assert(r.result.sigmas instanceof Float32Array&&String([...r.result.tableIndices])==='999,833,666,499,333,166','schedule binary/index result');
  const expected=[1,0.9617158770561218,0.9092148542404175,0.8333333134651184,0.7148972749710083,0.5005995035171509,0];
  assert(r.result.sigmas.every((v,i)=>Object.is(v,expected[i])),'sigma literal mismatch');assert(r.result.highSigmas[3]===r.result.lowSigmas[0]&&r.result.modelTimesteps.length===6,'stage split/times');
  const bad=await ask('schedule',{profile:'another'});assert(bad.status==='error','unknown schedule accepted');
 });
 await test('Actual Hike noise inverse and flow primitives preserve caller bytes and shape',async()=>{
  const noise=new Float32Array([2,-2,1,0]),latent=new Float32Array([4,2,-1,3]);
  const mix=await ask('noiseMix',{noise,latent,shape:[1,4],sigma:.25,noiseScale:1});assert(mix.status==='ok'&&String([...mix.result.data])==='3.5,1,-0.5,2.25'&&String(mix.result.shape)==='1,4','noise mix literal');
  const inv=await ask('inverseNoiseScale',{latent:new Float32Array([1,-2,3]),shape:[3],sigma:.5});assert(inv.status==='ok'&&String([...inv.result.data])==='2,-4,6','inverse literal');
  const flow=await ask('flowDenoised',{input:new Float32Array([2,-1,0]),velocity:new Float32Array([1,2,-3]),shape:[3],sigma:.5});assert(flow.status==='ok'&&String([...flow.result.data])==='1.5,-2,1.5','flow literal');assert(String([...noise])==='2,-2,1,0'&&String([...latent])==='4,2,-1,3','caller changed');
 });
 await test('Pointwise primitives reject shape dtype nonfinite singular and overbudget input',async()=>{
  const a=new Float32Array([1]);
  for(const input of [{latent:a,shape:[2],sigma:.5},{latent:[1],shape:[1],sigma:.5},{latent:a,shape:[1],sigma:1},{latent:new Float32Array([NaN]),shape:[1],sigma:.5},{latent:new Float32Array(1048577),shape:[1048577],sigma:.5}])assert((await ask('inverseNoiseScale',input)).status==='error','invalid pointwise input accepted');
 });
 await test('Published tensor boundary validation returns metadata only and rejects mixed spaces provenance',async()=>{
  const condition={dtype:'float32',shape:[1,2,4096],layout:'BLC',meaning:'text_hidden_states',data:new Float32Array(8192),attentionMask:new Uint8Array([1,0]),modelSha256:'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68'};
  const raw={dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',data:new Float32Array(128),modelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'};
  for(const [op,tensor] of [['validateConditioning',condition],['validateRawLatent',raw]]){const r=await ask(op,{tensor});assert(r.status==='ok'&&r.result.byteLength===tensor.data.byteLength&&r.result.data===undefined&&r.result.modelSha256===tensor.modelSha256,'boundary metadata');}
  assert((await ask('validateRawLatent',{tensor:{...raw,meaning:'normalized-diffusion-latent'}})).status==='error','normalized raw relabel accepted');assert((await ask('validateConditioning',{tensor:{...condition,modelSha256:raw.modelSha256}})).status==='error','wrong encoder provenance accepted');assert((await ask('validateConditioning',{tensor:{...condition,attentionMask:new Uint8Array([1,2])}})).status==='error','bad mask accepted');
 });
 await test('Diffusion Hike explicitly normalizes raw means and restores published binary readback',async()=>{
  const raw={dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',data:new Float32Array(128),modelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'};
  const r=await ask('normalizeRawMean',{tensor:raw});assert(r.status==='ok',JSON.stringify(r.error));assert(r.result.normalizationApplied===true&&r.result.tensor.data instanceof Float32Array&&r.result.tensor.meaning==='wan21-normalized-posterior-mean:v1'&&r.result.tensor.normalization==='wan21-comfy-f32-v1','normalization semantics');
  const mean=[-.7571,-.7089,-.9113,.1075,-.1745,.9653,-.1517,1.5508,.4134,-.0715,.5517,-.3632,-.1922,-.9497,.2503,-.2921],std=[2.8184,1.4541,2.3275,2.6558,1.2196,1.7708,2.6052,2.0743,3.2687,2.1526,2.8652,1.5579,1.6382,1.1253,2.8251,1.916];
  const f=Math.fround;r.result.tensor.data.forEach((v,i)=>assert(Object.is(v,f(f(f(0-f(mean[Math.floor(i/8)]))*1)/f(std[Math.floor(i/8)]))),'raw0 channel norm source order'));assert(raw.data.every(v=>v===0),'raw caller changed');
  const {encodeTensor,decodeTensor}=await import('../../../inference/tensor.mjs');
  const persisted=await decodeTensor(await encodeTensor(r.result.tensor));const restored=await ask('restoreRawMean',{tensor:persisted});assert(restored.status==='ok',JSON.stringify(restored.error));assert(restored.result.tensor.meaning==='raw-posterior-mean'&&restored.result.tensor.data.every(v=>Math.abs(v)<=2e-6),'normalized wktensor restore');
  const nonzero={...raw,data:Float32Array.from({length:128},(_,i)=>((i%23)-11)/4)},n=await ask('normalizeRawMean',{tensor:nonzero}),back=await ask('restoreRawMean',{tensor:n.result.tensor});assert(back.status==='ok'&&back.result.tensor.data.every((v,i)=>Math.abs(v-nonzero.data[i])<=2e-6),'nonzero roundtrip tolerance');
 });
 await test('Raw mean normalization rejects wrong meaning model shape and generated sample semantics',async()=>{
  const raw={dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',data:new Float32Array(128),modelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'};
  for(const tensor of [{...raw,meaning:'normalized-diffusion-latent'},{...raw,modelSha256:'a'.repeat(64)},{...raw,shape:[1,16,1,4,2]}])assert((await ask('normalizeRawMean',{tensor})).status==='error','wrong raw input accepted');
  assert((await ask('restoreRawMean',{tensor:raw})).status==='error','raw input restored as if normalized');
  const n=await ask('normalizeRawMean',{tensor:raw});assert((await ask('restoreRawMean',{tensor:{...n.result.tensor,meaning:'generated-diffusion-sample'}})).status==='error','generated sample relabelled posterior mean');
 });
 await test('Real Hike ORT Hike partial projection computes literal without claiming model inference',async()=>{
  const q=new Uint8Array(81920),x=new Float32Array(5120),bias=new Float32Array(16);q.set([56,64,68]);q.set([72,74,76],5120);x.set([2,0,-1]);bias.set([.125,-1]);
  const r=await ask('linearProjection',{q,scale:1,bias,x});assert(r.status==='ok',JSON.stringify(r.error));assert(r.result.output instanceof Float32Array&&r.result.output[0]===-.875&&r.result.output[1]===1&&r.result.output.slice(2).every(v=>v===0),'partial literal');assert(r.result.evidence.executionProviders[0]==='wasm'&&r.result.evidence.scope.includes('partial'),'partial execution evidence');assert(q[0]===56&&x[0]===2&&bias[0]===.125,'partial caller changed');
  assert((await ask('linearProjection',{q:new Uint8Array(1),scale:1,bias,x})).status==='error','bad partial shape accepted');
 });
 await test('Both actual weight tiles pass independent tolerance through external partial API',async()=>{
  const fixture=await (await fetch('../../linear/work/fixture.json')).json();
  for(const item of fixture.models){const q=new Uint8Array(await (await fetch('../../linear/'+item.tileFile)).arrayBuffer()),bias=new Float32Array(await (await fetch('../../linear/'+item.biasFile)).arrayBuffer()),x=Float32Array.from({length:5120},(_,i)=>((i%31)-15)/64);const r=await ask('linearProjection',{q,scale:item.scale,bias,x});assert(r.status==='ok',JSON.stringify(r.error));r.result.output.forEach((v,i)=>assert(Math.abs(v-item.expectedDouble[i])<=1e-4+1e-5*Math.abs(item.expectedDouble[i]),'realweight partial tolerance'));}
 });
 await test('Neural operations fail closed without injection or fake predictions',async()=>{
  for(const op of ['load','predict','sample']){const r=await ask(op,op==='load'?{file:fixture()}:{});assert(r.status==='error'&&r.error.code==='NOT_READY','NN fake result');}
 });
 await test('Identity protocol and unsupported operations are rejected before work',async()=>{
  for(const change of [{protocolVersion:'wrong'},{sessionId:'wrong'},{jobId:''},{inputRevision:-1}]){
   const r=await api.request({...req('inspect',{file:fixture()}),...change});assert(r.status==='error','bad envelope accepted');
  }
  const r=await ask('runAnything');assert(r.error.code==='UNSUPPORTED_OPERATION','unknown operation');
 });
 await test('New input revision terminates the older job and suppresses its result',async()=>{
  const isolated=mod.createDiffusionModels({sessionId:'revision-check'});
  const q=(jobId,inputRevision,op,input)=>({protocolVersion:'diffusion-models/0.1',sessionId:isolated.sessionId,jobId,inputRevision,op,input});
  try{
   const old=isolated.request(q('old',1,'inspect',{file:fixture()}));
   const fresh=isolated.request(q('fresh',2,'eulerStep',{latent:new Float32Array([4]),denoised:new Float32Array([2]),sigma:2,nextSigma:1}));
   assert((await old).error?.code==='STALE_INPUT','old job was not invalidated');
   const r=await fresh;assert(r.status==='ok'&&r.result.latent[0]===3,'new input failed');
  }finally{isolated.dispose();}
 });
 await test('Busy refusal and cancellation settle active request then allow reuse',async()=>{
  const q=req('inspect',{file:fixture()});const first=api.request(q);
  const busy=await ask('inspect',{file:fixture()});assert(busy.error?.code==='BUSY','parallel request accepted');
  const cancelled=api.cancel({sessionId:q.sessionId,jobId:q.jobId,inputRevision:q.inputRevision});
  assert(cancelled.status==='ok','cancel target');assert(cancelled.protocolVersion==='diffusion-models/0.1'&&cancelled.op==='cancel','cancel identity');
  const r=await first;assert(r.error?.code==='CANCELLED','active request not settled');
  const fresh=await ask('inspect',{file:fixture()},1);assert(fresh.status==='ok','reuse failed');
  const old=await ask('inspect',{file:fixture()},0);assert(old.error?.code==='STALE_INPUT','old revision accepted');
 });
 await test('Explicit MessagePort returns binary results with echoed identifiers',async()=>{
  const channel=new MessageChannel();const detach=mod.attachDiffusionPort(channel.port1,api);
  const q=req('eulerStep',{latent:new Float32Array([4]),denoised:new Float32Array([2]),sigma:2,nextSigma:0},1);
  const p=new Promise(resolve=>channel.port2.onmessage=e=>resolve(e.data));channel.port2.postMessage(q);
  const r=await p;assert(r.status==='ok'&&r.result.latent[0]===2&&r.jobId===q.jobId,'port Euler result');
  const call=async(op,input)=>{const q=req(op,input,1),p=new Promise(resolve=>channel.port2.onmessage=e=>resolve(e.data));channel.port2.postMessage(q);return p;};
  const schedule=await call('schedule',{profile:'bernini-comfy-simple6-shift5-v1'});assert(schedule.status==='ok'&&schedule.result.sigmas instanceof Float32Array&&schedule.result.highSigmas[3]===schedule.result.lowSigmas[0],'port schedule');
  const flow=await call('flowDenoised',{input:new Float32Array([2]),velocity:new Float32Array([1]),shape:[1],sigma:.5});assert(flow.status==='ok'&&flow.result.data[0]===1.5,'port flow');
  const qTile=new Uint8Array(81920),x=new Float32Array(5120),bias=new Float32Array(16);bias[0]=2;const partial=await call('linearProjection',{q:qTile,scale:1,x,bias});assert(partial.status==='ok'&&partial.result.output[0]===2,'port partial');
  const raw={dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',data:new Float32Array(128),modelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'};
  const normalized=await call('normalizeRawMean',{tensor:raw});assert(normalized.status==='ok'&&normalized.result.tensor.data instanceof Float32Array&&normalized.result.tensor.data[0]!==0,'port normalized binary');const restored=await call('restoreRawMean',{tensor:normalized.result.tensor});assert(restored.status==='ok'&&Math.abs(restored.result.tensor.data[0])<=2e-6&&raw.data.length===128&&raw.data[0]===0,'port raw binary/ownership');
  detach();channel.port2.close();
 });
 await test('Cancelling a pending partial pipeline allows a fresh real partial result',async()=>{
  const isolated=mod.createDiffusionModels({sessionId:'partial-cancel'}),input={q:new Uint8Array(81920),x:new Float32Array(5120),bias:new Float32Array(16),scale:1};input.bias[0]=3;
  const q={protocolVersion:'diffusion-models/0.1',sessionId:isolated.sessionId,jobId:'cancel-partial',inputRevision:0,op:'linearProjection',input};
  try{const pending=isolated.request(q);assert(isolated.cancel(q).status==='ok','partial cancel refused');assert((await pending).error?.code==='CANCELLED','partial did not settle');const fresh=await isolated.request({...q,jobId:'fresh-partial',inputRevision:1});assert(fresh.status==='ok'&&fresh.result.output[0]===3,'fresh real partial after cancellation failed');}finally{isolated.dispose();}
 });
 await test('Dispose settles active request and permanently refuses later work',async()=>{
  const active=ask('inspect',{file:fixture()},1);api.dispose();
  assert((await active).error?.code==='DISPOSED','dispose did not settle');
  assert((await ask('capabilities',{},1)).error?.code==='DISPOSED','disposed API accepted work');
 });
 return {passed:true,tests:results};
}

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
  detach();channel.port2.close();
 });
 await test('Dispose settles active request and permanently refuses later work',async()=>{
  const active=ask('inspect',{file:fixture()},1);api.dispose();
  assert((await active).error?.code==='DISPOSED','dispose did not settle');
  assert((await ask('capabilities',{},1)).error?.code==='DISPOSED','disposed API accepted work');
 });
 return {passed:true,tests:results};
}

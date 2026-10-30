// Self-contained private test entry: inject on the deployment origin, not published.
export async function run({apiUrl,sourceUrl,sdkUrl}){
 const apiModule=await import(apiUrl),{createLoraSource}=await import(sourceUrl),{createLora}=await import(sdkUrl),cases=[];
 const assert=(yes,message)=>{if(!yes)throw Error(message);};
 const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 const baseHash='9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52';
 function fixture(){
  const down='diffusion_model.blocks.0.self_attn.q.lora_down.weight',up='diffusion_model.blocks.0.self_attn.q.lora_up.weight',a=new Float32Array(5120).fill(.25),b=new Float32Array(5120).fill(.5);
  let text=JSON.stringify({[down]:{dtype:'F32',shape:[1,5120],data_offsets:[0,a.byteLength]},[up]:{dtype:'F32',shape:[5120,1],data_offsets:[a.byteLength,a.byteLength+b.byteLength]}});text+=' '.repeat((8-text.length%8)%8);
  const header=new TextEncoder().encode(text),prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,BigInt(header.length),true);
  return new File([prefix,header,a,b],'explicit-synthetic-native-lora.safetensors');
 }
 for(const mode of ['direct-javascript','explicit-message-port']){
  const api=apiModule.createDiffusionModels({sessionId:'source-'+crypto.randomUUID()});let detach,ch,pending=new Map();
  const direct=q=>api.request(q);
  const request=mode==='direct-javascript'?direct:q=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(q.jobId);reject(Error('MessagePort response timeout'));},60000);pending.set(q.jobId,{resolve,reject,timer});ch.port2.postMessage(q);});
  if(mode==='explicit-message-port'){
   ch=new MessageChannel();detach=apiModule.attachDiffusionPort(ch.port1,api);ch.port2.addEventListener('message',({data})=>{const p=pending.get(data.jobId);if(!p)return;pending.delete(data.jobId);clearTimeout(p.timer);p.resolve(data);});ch.port2.start();
  }
  const ask=(op,input={})=>request({buildId:apiModule.BUILD_ID,protocolVersion:apiModule.PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'source-control-'+crypto.randomUUID(),inputRevision:0,op,input});
  const ok=r=>{assert(r.status==='ok',JSON.stringify(r.error));return r.result;};
  let sdk;
  try{
   const file=fixture(),fullHash=await sha(await file.arrayBuffer());
   const binding=ok(await ask('loadLora',{file,stage:'HIGH',strength:3,baseModelSha256:baseHash,expectedFileSHA256:fullHash}));
   assert(binding.applied===false&&binding.fullFileSHA256===fullHash,'Actual registration identity');
   const source=createLoraSource({request,sessionId:api.sessionId,binding,inputRevision:0});
   const header=await source.read(0,8);assert(header instanceof Uint8Array&&new DataView(header.buffer).getBigUint64(0,true)>0n,'SDK prefix bytes');
   assert(await source.hash()===fullHash,'Server verified source hash');
   const empty=await source.read(source.size,0);assert(empty instanceof Uint8Array&&empty.length===0,'Current zero-byte read');
   // The peer SDK accepts an explicit source descriptor. No target, consumer,
   // base provider, sink, prepare or apply operation is fabricated here.
   sdk=await createLora({catalog:{connected:{high:{fileName:file.name,source,sha256:binding.fullFileSHA256}}}});
   const report=await sdk.inspect({category:'connected',noise:'high'});
   assert(report.tensorCount===2&&report.unknownTensors.length===0&&report.sourceSha256===fullHash,'Real SDK inspection over registered source');
   assert(report.integrity==='header-and-range-validated; whole-file-hash-not-verified','SDK inspect scope changed');
   assert(typeof sdk.kernelInfo.wasmSha256==='string'&&sdk.kernelInfo.wasmSha256.length===64,'Real SDK Hike kernel not loaded');
   const forged=createLoraSource({request,sessionId:api.sessionId,binding:{...binding,fullFileSHA256:'0'.repeat(64)},inputRevision:0});let refused=false;try{await forged.hash();}catch{refused=true;}assert(refused,'Caller-provided forged hash trusted');
   const replacement=ok(await ask('loadLora',{file,stage:'HIGH',strength:1,baseModelSha256:baseHash}));assert(replacement.bindingId!==binding.bindingId,'Replacement reused binding');
   for(const operation of [()=>source.read(0,8),()=>source.hash()]){let oldRejected=false;try{await operation();}catch{oldRejected=true;}assert(oldRejected,'Old source survived replacement');}
   const fresh=createLoraSource({request,sessionId:api.sessionId,binding:replacement,inputRevision:0});assert(await fresh.hash()===fullHash,'Replacement source hash');
   ok(await ask('unloadLora',{bindingId:replacement.bindingId,stage:'HIGH'}));let unloaded=false;try{await fresh.read(0,0);}catch{unloaded=true;}assert(unloaded,'Empty read bypassed unload');
   api.dispose();let disposed=false;try{await fresh.hash();}catch{disposed=true;}assert(disposed,'Disposed API source remained usable');
   cases.push({name:mode+' actual SDK.inspect over Diffusion File-backed source',passed:true,buildId:apiModule.BUILD_ID,fileBytes:file.size,sourceSha256:fullHash,headerSHA256:binding.headerSHA256,tensorCount:report.tensorCount,sdkKernelSha256:sdk.kernelInfo.wasmSha256,scope:'Synthetic file transport and actual SDK inspection only; no target, prepare, apply or full-model inference'});
  }finally{
   await sdk?.dispose();api.dispose();detach?.();ch?.port2.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Test transport closed'));}pending.clear();
  }
 }
 return{passed:cases.every(c=>c.passed),cases,prepared:false,applied:false,modelInference:false};
}

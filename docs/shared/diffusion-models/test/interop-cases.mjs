import {createInferenceAPI,bindInferencePort,encodeTensor,decodeTensor} from '../../inference/api.mjs';
const assert=(value,message)=>{if(!value)throw Error(message);};
const rejects=async(fn,pattern)=>{let error;try{await fn();}catch(e){error=e;}assert(error&&(!pattern||pattern.test(error.message)),'Expected rejection '+pattern);};
const encoder='c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68';
const vae='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b';
function conditioning(){const backing=new Float32Array(8194);backing[0]=91;backing[8193]=92;const data=backing.subarray(1,8193);data[0]=.5;data[4096]=-.25;return{dtype:'float32',shape:[1,2,4096],layout:'BLC',meaning:'text_hidden_states',data,modelSha256:encoder,attentionMask:new Uint8Array([1,0])};}
function raw(){const data=new Float32Array(128);data[0]=-1;data[127]=2;return{dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',data,modelSha256:vae};}
export async function runInteropCases(){
 let helper;try{helper=await import('../tensor-interop.mjs');}catch(e){throw Error('Wan tensor interop implementation missing: '+e.message);}
 const results=[],test=async(name,fn)=>{await fn();results.push({name,passed:true});};
 await test('Strict conditioning boundary accepts published BLC output without changing ownership',async()=>{
  const t=conditioning(),view=t.data,mask=t.attentionMask;assert(helper.requireWanConditioning(t)===t,'tensor copied/relabelled');assert(t.data===view&&t.attentionMask===mask&&t.data[0]===.5,'caller mutated');
 });
 await test('Conditioning rejects wrong meaning layout shape hash mask and declared byte length',async()=>{
  const cases=[{meaning:'raw-posterior-mean'},{layout:'NCTHW'},{shape:[1,4096,2]},{dtype:'float16'},{modelSha256:vae},{modelSha256:undefined},{attentionMask:undefined},{attentionMask:new Uint8Array([1,2])},{attentionMask:new Uint8Array([0,0])},{attentionMask:[1,0]},{byteLength:4},{data:new Float32Array(8)}];
  for(const change of cases)await rejects(()=>helper.requireWanConditioning({...conditioning(),...change}));
  const t=conditioning();t.data[0]=NaN;await rejects(()=>helper.requireWanConditioning(t));
 });
 await test('Raw VAE boundary requires the published mean profile and VAE provenance',async()=>{
  const t=raw();assert(helper.requireWanRawLatent(t)===t,'raw tensor changed');
  for(const change of [{meaning:'normalized-diffusion-latent'},{meaning:'text_hidden_states'},{layout:'BLC'},{shape:[1,16,1,2,4]},{modelSha256:encoder},{modelSha256:undefined},{byteLength:1},{attentionMask:new Uint8Array([1])}])await rejects(()=>helper.requireWanRawLatent({...raw(),...change}));
 });
 await test('Explicit encoder and VAE bindings remain separate from diffusion model identity',async()=>{
  const other='a'.repeat(64);await rejects(()=>helper.requireWanConditioning(conditioning(),{encoderModelSha256:other}));await rejects(()=>helper.requireWanRawLatent(raw(),{vaeModelSha256:other}));
  await rejects(()=>helper.requireWanConditioning(conditioning(),{encoderModelSha256:'invalid'}));await rejects(()=>helper.requireWanRawLatent(raw(),{vaeModelSha256:'invalid'}));
 });
 await test('Published wktensor serialization preserves mask metadata bytes and independent ownership',async()=>{
  const t=conditioning(),encoded=await helper.encodeWanConditioning(t),restored=await decodeTensor(encoded);
  assert(restored.dtype==='float32'&&restored.layout==='BLC'&&restored.meaning==='text_hidden_states'&&restored.modelSha256===encoder,'metadata lost');assert(String(restored.shape)==='1,2,4096'&&String(restored.attentionMask)==='1,0','shape/mask lost');assert(restored.data.length===8192&&restored.data[0]===.5&&restored.data[4096]===-.25,'payload wrong');assert(restored.data.buffer!==t.data.buffer&&restored.attentionMask.buffer!==t.attentionMask.buffer,'shared caller ownership');restored.data[0]=99;restored.attentionMask[0]=0;assert(t.data[0]===.5&&t.attentionMask[0]===1,'caller modified by readback');
  const direct=await encodeTensor(t),fromPublished=await helper.decodeWanConditioning(direct);assert(fromPublished.data[4096]===-.25&&fromPublished.modelSha256===encoder,'published -> diffusion rejected');
  const latent=raw(),rawBytes=await helper.encodeWanRawLatent(latent),rawRestored=await helper.decodeWanRawLatent(rawBytes);assert(rawRestored.meaning==='raw-posterior-mean'&&rawRestored.modelSha256===vae&&rawRestored.data[127]===2,'raw semantics changed');
  const blob=new Blob([rawBytes]);const blobRestored=await helper.decodeWanRawLatent(await blob.arrayBuffer());assert(blobRestored.data[0]===-1,'Blob readback failed');
 });
 await test('Pending encode owns shape mask provenance and data before asynchronous hashing',async()=>{
  const tensor=conditioning(),pending=helper.encodeWanConditioning(tensor);tensor.modelSha256='a'.repeat(64);tensor.shape[1]=1;tensor.shape[2]=8192;tensor.attentionMask[0]=0;tensor.data[0]=99;
  const saved=await decodeTensor(await pending);assert(saved.modelSha256===encoder&&String(saved.shape)==='1,2,4096'&&String(saved.attentionMask)==='1,0'&&saved.data[0]===.5,'pending conditioning metadata/payload changed');
  const latent=raw(),rawPending=helper.encodeWanRawLatent(latent);latent.modelSha256='b'.repeat(64);latent.shape[2]=1;latent.shape[3]=4;latent.data[0]=99;
  const savedRaw=await decodeTensor(await rawPending);assert(savedRaw.modelSha256===vae&&String(savedRaw.shape)==='1,16,2,2,2'&&savedRaw.data[0]===-1,'pending raw metadata/payload changed');
 });
 await test('Pending decode snapshots the expected producer binding',async()=>{
  const binding={encoderModelSha256:encoder},bytes=await encodeTensor(conditioning()),pending=helper.decodeWanConditioning(bytes,binding);binding.encoderModelSha256=vae;
  assert((await pending).modelSha256===encoder,'decode encoder binding changed while hashing');
  const rawBinding={vaeModelSha256:vae},rawBytes=await encodeTensor(raw()),rawPending=helper.decodeWanRawLatent(rawBytes,rawBinding);rawBinding.vaeModelSha256=encoder;assert((await rawPending).modelSha256===vae,'decode VAE binding changed while hashing');
 });
 await test('Published wktensor hash validation and boundary validation reject altered files',async()=>{
  const bytes=await helper.encodeWanConditioning(conditioning());bytes[bytes.length-1]^=1;await rejects(()=>helper.decodeWanConditioning(bytes),/SHA-256/);
  await rejects(async()=>helper.decodeWanRawLatent(await encodeTensor(conditioning())));
  await rejects(async()=>helper.decodeWanConditioning(await encodeTensor({...conditioning(),modelSha256:vae})));
 });
 const api=createInferenceAPI();
 try{
  await test('Actual published same-page modules advertise independent operations and unconfigured state',async()=>{
   const text=api.textEncoder.capabilities(),v=api.vae.capabilities();assert(text.module==='text_encoder'&&text.configured===false&&text.output.meaning==='text_hidden_states','Text API');assert(v.module==='vae'&&v.configured===false&&v.inputSpace==='raw'&&v.decode.input.meaning==='raw-posterior-mean','VAE API');await rejects(()=>api.textEncoder.encode({text:'test'}),/Configure/);await rejects(()=>api.vae.decode(raw()),/Configure/);
  });
  await test('Actual published explicit MessagePort capabilities work and unconfigured inference fails',async()=>{
   const channel=new MessageChannel(),unbind=bindInferencePort(channel.port1,api);let serial=0;
   const call=(module,method,args)=>new Promise((resolve,reject)=>{const id='interop-'+(++serial),timer=setTimeout(()=>reject(Error('Port timeout')),2000);const listener=event=>{if(event.data?.id!==id)return;clearTimeout(timer);channel.port2.removeEventListener('message',listener);resolve(event.data);};channel.port2.addEventListener('message',listener);channel.port2.start();channel.port2.postMessage({apiVersion:'works-ai-1',id,module,method,args});});
   try{const t=await call('text_encoder','capabilities'),v=await call('vae','capabilities');assert(t.ok&&v.ok&&t.result.configured===false&&v.result.configured===false,'real port capabilities');const unready=await call('vae','decode',raw());assert(!unready.ok&&/Configure/.test(unready.error),'unconfigured inference did not fail');}finally{unbind();channel.port2.close();}
  });
 }finally{api.dispose();}
 return{passed:true,publishedCommit:'d2e9e3cba6269464bf556acc73c0b97030f75b5f',modulesConfigured:false,fullInferenceTested:false,numericNormalizationImplemented:false,tests:results};
}

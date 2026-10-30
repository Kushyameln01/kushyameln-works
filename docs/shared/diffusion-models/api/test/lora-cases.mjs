// Self-contained: can be injected locally on the real public origin.
export async function run(apiUrl='../index.mjs'){
 const apiModule=await import(apiUrl),checks=[];
 const assert=(v,message)=>{if(!v)throw Error(message);};
 const test=async(name,fn)=>{await fn();checks.push({name,passed:true});};
 const hashes={HIGH:'9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52',LOW:'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3'};
 const down='diffusion_model.blocks.0.self_attn.q.lora_down.weight',up='diffusion_model.blocks.0.self_attn.q.lora_up.weight';
 const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),n=>n.toString(16).padStart(2,'0')).join('');
 function fixture(dtype='F32',first=1){
  const width=dtype==='F32'?4:2,a=new Uint8Array(5120*width),b=new Uint8Array(5120*width),v=new DataView(a.buffer),w=new DataView(b.buffer);
  if(dtype==='F32'){[first,-2,.5].forEach((x,i)=>v.setFloat32(i*4,x,true));w.setFloat32(0,1,true);}
  else{const values=dtype==='F16'?[first===1?0x3c00:0x4000,0xc000,0x3800]:[first===1?0x3f80:0x4000,0xc000,0x3f00];values.forEach((x,i)=>v.setUint16(i*2,x,true));w.setUint16(0,dtype==='F16'?0x3c00:0x3f80,true);}
  const descriptors={[down]:{dtype,shape:[1,5120],data_offsets:[0,a.length]},[up]:{dtype,shape:[5120,1],data_offsets:[a.length,a.length+b.length]}};
  let text=JSON.stringify(descriptors);text+=' '.repeat((8-text.length%8)%8);const header=new TextEncoder().encode(text),prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,BigInt(header.length),true);
  const file=new File([prefix,header,a,b],'synthetic-linear-'+dtype+'.safetensors');return{file,downBytes:a,dtype};
 }
 const api=apiModule.createDiffusionModels({sessionId:'lora-test-'+crypto.randomUUID()});let serial=0,revision=0;
 const req=(op,input={},rev=revision)=>({protocolVersion:'diffusion-models/0.1',sessionId:api.sessionId,jobId:'lora-'+(++serial),inputRevision:rev,op,input});
 const ask=(op,input={},rev=revision)=>api.request(req(op,input,rev));
 const options=(file,stage='LOW',strength=1)=>({file,stage,strength,baseModelSha256:hashes[stage]});
 const f32=fixture();let high,low,report;
 try{
  await test('Capabilities distinguish LoRA weight IO from unapplied full inference',async()=>{
   const r=await ask('capabilities');assert(r.status==='ok'&&r.result.loraWeightIO===true&&r.result.loraApplied===false&&r.result.modelInference===false,'LoRA capability missing');for(const op of ['inspectLora','loadLora','listLoras','readLora','readLoraSource','unloadLora'])assert(r.result[op]===true,'missing '+op);
  });
  await test('Header inspection identifies actual paired stored tensors without full hash',async()=>{
   const r=await ask('inspectLora',{file:f32.file});assert(r.status==='ok',JSON.stringify(r.error));report=r.result;assert(report.pairs.length===1&&report.pairs[0].rank===1&&report.fullFileSHA256===null&&report.applied===false,'inspection result');
  });
  await test('Two stage bindings preserve explicit zero strength and hash original bytes',async()=>{
   high=(await ask('loadLora',options(f32.file,'HIGH',3))).result;
   const expected=await sha(await f32.file.arrayBuffer()),q=req('loadLora',{...options(f32.file,'LOW',0),expectedFileSHA256:expected}),pending=api.request(q);
   q.input.stage='HIGH';q.input.strength=99;q.input.baseModelSha256=hashes.HIGH;q.input.expectedFileSHA256='a'.repeat(64);
   const r=await pending;assert(r.status==='ok',JSON.stringify(r.error));low=r.result;assert(high.bindingId&&low.bindingId&&high.bindingId!==low.bindingId&&low.stage==='LOW'&&low.strength===0&&low.fullFileSHA256===expected,'binding identity/hash/immutable input snapshot');
   const listed=await ask('listLoras');assert(listed.status==='ok'&&listed.result.bindings.length===2&&listed.result.applied===false,'two stage list');
  });
  await test('F16 BF16 F32 reads return exact owned stored bytes with finite range evidence',async()=>{
   for(const dtype of ['F16','BF16','F32']){const sample=fixture(dtype),loaded=await ask('loadLora',options(sample.file,'LOW',-1));assert(loaded.status==='ok',JSON.stringify(loaded.error));low=loaded.result;const r=await ask('readLora',{bindingId:low.bindingId,stage:'LOW',tensorName:down,elementOffset:0,elementCount:3});assert(r.status==='ok',JSON.stringify(r.error));assert(r.result.data instanceof Uint8Array&&r.result.dtype===dtype&&r.result.strength===-1&&r.result.bindingId===low.bindingId,'stored dtype metadata');assert(String([...r.result.data])===String([...sample.downBytes.slice(0,dtype==='F32'?12:6)]),'stored bytes changed');assert(r.result.rangeSHA256===await sha(r.result.data),'range hash');r.result.data.fill(255);const reread=await ask('readLora',{bindingId:low.bindingId,stage:'LOW',tensorName:down,elementOffset:0,elementCount:1});assert(reread.status==='ok'&&reread.result.data.some(v=>v!==255),'caller output modified retained file');}
  });
  await test('Host metadata is independent of returned load and list mutations',async()=>{
   low.strength=123;low.stage='HIGH';low.tensors.find(t=>t.name===down).dataOffsets[0]=999999;
   const list=(await ask('listLoras')).result.bindings,stored=list.find(x=>x.bindingId===low.bindingId);assert(stored.stage==='LOW'&&stored.strength===-1,'load metadata alias');stored.tensors.find(t=>t.name===down).shape[0]=999;stored.strength=400;
   const r=await ask('readLora',{bindingId:low.bindingId,stage:'LOW',tensorName:down,elementOffset:0,elementCount:1,file:new Blob(['forged']),binding:{strength:999,tensors:[]}});assert(r.status==='ok'&&r.result.strength===-1&&r.result.shape[0]===1,'list alias or forged descriptor accepted');
  });
  await test('Invalid declaration failed replacement and expected-hash failure preserve old binding',async()=>{
   for(const input of [{file:f32.file,stage:'low',strength:1,baseModelSha256:hashes.LOW},{file:f32.file,stage:'LOW',baseModelSha256:hashes.LOW},{...options(f32.file),strength:NaN},{...options(f32.file),baseModelSha256:hashes.HIGH},{...options(new Blob(['bad file']))},{...options(f32.file),expectedFileSHA256:'a'.repeat(64)}])assert((await ask('loadLora',input)).status==='error','bad declaration/replacement accepted');
   const listed=(await ask('listLoras')).result.bindings;assert(listed.find(x=>x.stage==='LOW').bindingId===low.bindingId,'failed load replaced binding');
  });
  await test('Raw source reads preserve file identity and enforce range bounds',async()=>{
   const r=await ask('readLoraSource',{bindingId:high.bindingId,stage:'HIGH',byteOffset:0,byteLength:8});assert(r.status==='ok',JSON.stringify(r.error));assert(r.result.data instanceof Uint8Array&&r.result.data.length===8&&r.result.bindingId===high.bindingId&&r.result.byteOffset===0&&r.result.fullFileSHA256===high.fullFileSHA256,'source read identity');assert(r.result.rangeSHA256===await sha(r.result.data),'source range hash');
   const empty=await ask('readLoraSource',{bindingId:high.bindingId,stage:'HIGH',byteOffset:0,byteLength:0});assert(empty.status==='ok'&&empty.result.data.length===0&&empty.result.rangeSHA256==='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','explicit empty source read');
   for(const range of [{byteOffset:-1,byteLength:8},{byteOffset:0,byteLength:4194305},{byteOffset:f32.file.size-1,byteLength:2}])assert((await ask('readLoraSource',{bindingId:high.bindingId,stage:'HIGH',...range})).status==='error','bad byte range accepted');
  });
  await test('Wrong stage foreign handle and invalid tensor ranges are rejected',async()=>{
   for(const change of [{stage:'LOW'},{bindingId:'foreign'},{tensorName:'unknown'},{elementOffset:-1},{elementCount:4194305}]){const r=await ask('readLora',{bindingId:high.bindingId,stage:'HIGH',tensorName:down,elementOffset:0,elementCount:1,...change});assert(r.status==='error','wrong binding/range accepted');}
   const foreign=apiModule.createDiffusionModels();try{const r=await foreign.request({protocolVersion:'diffusion-models/0.1',sessionId:foreign.sessionId,jobId:'foreign',inputRevision:0,op:'readLora',input:{bindingId:high.bindingId,stage:'HIGH',tensorName:down,elementOffset:0,elementCount:1}});assert(r.status==='error','foreign API handle accepted');}finally{foreign.dispose();}
  });
  await test('Cancelled replacement and Worker regeneration keep earlier binding readable',async()=>{
   const q=req('loadLora',options(fixture('F32',2).file,'LOW',2)),pending=api.request(q);assert(api.cancel(q).status==='ok','cancel replacement');assert((await pending).error?.code==='CANCELLED','load cancellation not settled');
   revision++;const r=await ask('readLora',{bindingId:low.bindingId,stage:'LOW',tensorName:down,elementOffset:0,elementCount:1});assert(r.status==='ok'&&new DataView(r.result.data.buffer).getFloat32(0,true)===1,'binding lost across cancel/new revision');
  });
  await test('Busy control operations do not mutate bindings and a newer revision supersedes pending replacement',async()=>{
   const q=req('loadLora',options(fixture('F32',2).file,'LOW',4)),pending=api.request(q);
   assert((await ask('listLoras')).error?.code==='BUSY','list bypassed BUSY');assert((await ask('unloadLora',{bindingId:low.bindingId,stage:'LOW'})).error?.code==='BUSY','unload bypassed BUSY');
   revision++;const read=ask('readLora',{bindingId:low.bindingId,stage:'LOW',tensorName:down,elementOffset:0,elementCount:1});assert((await pending).error?.code==='STALE_INPUT','new revision did not supersede replacement');const r=await read;assert(r.status==='ok'&&r.result.strength===-1,'old binding lost after supersession');
  });
  await test('Successful replacement invalidates the earlier opaque handle',async()=>{
   const old=low.bindingId,r=await ask('loadLora',options(fixture('F32',2).file,'LOW',2));assert(r.status==='ok'&&r.result.bindingId!==old,'replacement identity reused');low=r.result;assert((await ask('readLoraSource',{bindingId:old,stage:'LOW',byteOffset:0,byteLength:8})).status==='error','old handle remained usable');
  });
  await test('Stale terminated Worker success cannot commit even when request identity is reused',async()=>{
   const NativeWorker=globalThis.Worker;const workers=[];globalThis.Worker=class extends NativeWorker{constructor(...args){super(...args);workers.push(this);}};
   const isolated=apiModule.createDiffusionModels({sessionId:'stale-lora'}),q={protocolVersion:'diffusion-models/0.1',sessionId:isolated.sessionId,jobId:'same-id',inputRevision:0,op:'loadLora',input:options(f32.file,'LOW',1)};
   try{const first=isolated.request(q);isolated.cancel(q);assert((await first).error?.code==='CANCELLED','first job not cancelled');const next=isolated.request(q),fake={...report,stage:'LOW',strength:1,baseModelSha256:hashes.LOW,fullFileSHA256:'a'.repeat(64),applied:false,payloadValidation:'ON_READ'};workers[0].dispatchEvent(new MessageEvent('message',{data:{...q,buildId:apiModule.BUILD_ID,status:'ok',result:fake}}));const actual=await next;assert(actual.status==='ok'&&actual.result.fullFileSHA256===await sha(await f32.file.arrayBuffer()),'stale worker committed fake binding');}finally{isolated.dispose();globalThis.Worker=NativeWorker;}
  });
  await test('Explicit MessagePort loads files lists bindings and returns binary source and tensor bytes',async()=>{
   const channel=new MessageChannel(),detach=apiModule.attachDiffusionPort(channel.port1,api);let id=0;
   const call=(op,input={})=>new Promise((resolve,reject)=>{const q=req(op,input),timer=setTimeout(()=>reject(Error('LoRA port timeout')),5000),listener=event=>{if(event.data?.jobId!==q.jobId)return;clearTimeout(timer);channel.port2.removeEventListener('message',listener);resolve(event.data);};channel.port2.addEventListener('message',listener);channel.port2.start();channel.port2.postMessage(q);});
   try{const loaded=await call('loadLora',options(f32.file,'HIGH',0));assert(loaded.status==='ok',JSON.stringify(loaded.error));high=loaded.result;const r=await call('readLora',{bindingId:high.bindingId,stage:'HIGH',tensorName:down,elementOffset:0,elementCount:1}),source=await call('readLoraSource',{bindingId:high.bindingId,stage:'HIGH',byteOffset:0,byteLength:8});assert(r.status==='ok'&&r.result.data instanceof Uint8Array&&source.status==='ok'&&source.result.data.length===8&&high.strength===0,'port load/read bytes');assert((await call('listLoras')).result.bindings.length===2,'port list');assert(f32.file.size>0&&await f32.file.slice(0,8).arrayBuffer(),'input File ownership lost');}finally{detach();channel.port2.close();}
  });
  await test('Numeric payload validation is performed on tensor ranges and not falsely claimed by loading',async()=>{
   const sample=fixture(),bytes=await sample.file.arrayBuffer(),view=new DataView(bytes),header=Number(view.getBigUint64(0,true));view.setUint32(8+header,0x7f800000,true);const file=new File([bytes],'nonfinite-payload.safetensors'),isolated=apiModule.createDiffusionModels();
   let id=0;const call=(op,input)=>isolated.request({protocolVersion:'diffusion-models/0.1',sessionId:isolated.sessionId,jobId:'range-'+(++id),inputRevision:0,op,input});
   try{const loaded=await call('loadLora',options(file));assert(loaded.status==='ok'&&loaded.result.payloadValidation==='ON_READ','load misrepresented payload validation');const binding=loaded.result,range=await call('readLora',{bindingId:binding.bindingId,stage:'LOW',tensorName:down,elementOffset:0,elementCount:1});assert(range.status==='error','nonfinite numeric range accepted');const source=await call('readLoraSource',{bindingId:binding.bindingId,stage:'LOW',byteOffset:8+header,byteLength:4});assert(source.status==='ok'&&source.result.payloadValidation==='NOT_PERFORMED_RAW_SOURCE_READ','raw source overstated numeric validation');}finally{isolated.dispose();}
  });
  await test('Unload clears only the matching stage while predict and sample remain NOT_READY',async()=>{
   assert((await ask('unloadLora',{bindingId:high.bindingId,stage:'LOW'})).status==='error','unloaded wrong stage');const r=await ask('unloadLora',{bindingId:high.bindingId,stage:'HIGH'});assert(r.status==='ok'&&r.result.unloaded===true,'unload failed');assert((await ask('listLoras')).result.bindings.length===1,'unrelated stage removed');assert((await ask('readLoraSource',{bindingId:high.bindingId,stage:'HIGH',byteOffset:0,byteLength:8})).status==='error','unloaded handle readable');for(const op of ['predict','sample'])assert((await ask(op)).error?.code==='NOT_READY','unapplied LoRA claimed inference');
  });
  await test('Dispose settles in-flight work and refuses subsequent LoRA access',async()=>{
   const pending=ask('readLoraSource',{bindingId:low.bindingId,stage:'LOW',byteOffset:0,byteLength:8});api.dispose();assert((await pending).error?.code==='DISPOSED','dispose did not settle');assert((await ask('listLoras')).error?.code==='DISPOSED','disposed list allowed');
  });
  return{passed:true,scope:'synthetic LoRA file-backed IO/session controls only; no LoRA arithmetic or full inference',tests:checks};
 }finally{api.dispose();}
}

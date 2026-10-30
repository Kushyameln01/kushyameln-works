// Native Wan2.1 VAE fixed-profile API. Model files stay in the caller's browser.
const MODEL_HASH='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b';
const LIMIT=2147483647;
const HASH=/^[a-f0-9]{64}$/;
function fail(message){throw new TypeError(message);}
function shape(value){if(!Array.isArray(value)||value.length!==5||value.some(n=>!Number.isSafeInteger(n)||n<1))fail('Expected a positive NCTHW shape');let count=1;for(const n of value){count*=n;if(!Number.isSafeInteger(count)||count>LIMIT/4)fail('Tensor exceeds fixed profile byte limit');}return count;}
function same(a,b){return a.length===b.length&&a.every((n,i)=>n===b[i]);}
function asset(name,value){if(!value||typeof value.file!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value.file)||value.file.includes('..'))fail('Invalid local asset path: '+name);if(!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>LIMIT||!HASH.test(value.sha256))fail('Invalid local asset metadata: '+name);return value;}
export function validateVaeRequest({operation,tensor,manifest}){
 if(!['encode','decode'].includes(operation))fail('VAE operation must be encode or decode');
 if(manifest?.schemaVersion!==1||manifest.kind!=='wan21-vae-profile-v1'||manifest.model?.sha256!==MODEL_HASH||manifest.model?.executionDtype!=='float32')fail('Unsupported VAE model/profile manifest');
 const p=manifest.profile;if(!p||p.layout!=='NCTHW'||p.latentSpace!=='raw'||p.posterior!=='mean'||p.opset!==17)fail('Only exported raw mean NCTHW profiles are supported');
 shape(p.videoShape);shape(p.latentShape);
 const [batch,channels,frames,height,width]=p.videoShape;
 if(batch!==1||channels!==3||frames%4!==1||height%8!==0||width%8!==0||!same(p.latentShape,[batch,16,(frames-1)/4+1,height/8,width/8]))fail('Invalid Wan2.1 temporal/spatial profile');
 const wanted=operation==='encode'?p.videoShape:p.latentShape;
 const meanings=operation==='encode'?['raw-decoder-rgb','rgb-unit']:['raw-posterior-mean'];
 if(!meanings.includes(tensor?.meaning))fail('Tensor meaning cannot connect to this VAE operation: expected '+meanings.join(' or '));
 if(operation==='decode'&&tensor.modelSha256!==undefined&&tensor.modelSha256!==manifest.model.sha256)fail('Tensor model provenance does not match this VAE model');
 if(!tensor||tensor.dtype!=='float32'||tensor.layout!=='NCTHW'||!(tensor.data instanceof Float32Array)||!Array.isArray(tensor.shape)||!same(tensor.shape,wanted)||tensor.data.length!==shape(wanted))fail('Tensor dtype, layout, shape or byte length does not match exported profile');
 for(const value of tensor.data)if(!Number.isFinite(value))fail('Nonfinite VAE input');
 if(operation==='encode'){const lower=tensor.meaning==='rgb-unit'?0:-1;for(const value of tensor.data)if(value<lower||value>1)fail(tensor.meaning==='rgb-unit'?'Encoder rgb-unit values must be in [0,1]':'Encoder RGB tensor values must be in [-1,1]');}
 const assets=manifest.assets;if(!assets||typeof assets!=='object')fail('Missing VAE assets');
 const names=['encoder','decoderBody','conv2Weight','conv2Bias'];for(const name of names)asset(name,assets[name]);
 if(new Set(names.map(n=>assets[n].file)).size!==names.length)fail('VAE asset names must be distinct');
 if(assets.conv2Weight.bytes!==1024||!same(assets.conv2Weight.shape??[],[16,16])||assets.conv2Bias.bytes!==64||!same(assets.conv2Bias.shape??[],[16]))fail('Unexpected conv2 weight/bias shape');
 const inf=manifest.inference;if(inf?.inputName!=='input'||inf.outputName!=='output'||inf.executionProvider!=='wasm'||inf.threads!==1||inf.graphOptimizationLevel!=='disabled')fail('Profile requires the validated single-thread ORT WASM execution contract');
 return {count:tensor.data.length,inputShape:[...wanted],outputShape:[...(operation==='encode'?p.latentShape:p.videoShape)],profileId:p.id};
}
function abort(signal){if(signal?.aborted)throw new DOMException('VAE operation aborted','AbortError');}
async function bytesFor(descriptor,files){
 if(!(files instanceof Map))fail('Local model files must be a Map');
 const file=files.get(descriptor.file);if(!file)fail('Missing local model file: '+descriptor.file);
 const size=file instanceof Uint8Array?file.byteLength:file?.size;
 if(size!==descriptor.bytes)fail('Local model file size mismatch: '+descriptor.file);
 const bytes=file instanceof Uint8Array?file:new Uint8Array(await file.arrayBuffer());
 if(bytes.byteLength!==descriptor.bytes)fail('Local model file changed while loading: '+descriptor.file);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==descriptor.sha256)fail('Local model file hash mismatch: '+descriptor.file);
 return bytes;
}
function f32(bytes){if(bytes.byteLength%4)fail('Misaligned float32 file');const result=new Float32Array(bytes.byteLength/4);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<result.length;i++){result[i]=view.getFloat32(i*4,true);if(!Number.isFinite(result[i]))fail('Nonfinite model coefficient');}return result;}
export async function runVae({operation,tensor,manifest,files,ort,hike,onProgress=()=>{},signal}){
 const request=validateVaeRequest({operation,tensor,manifest});abort(signal);
 if(!(files instanceof Map))fail('Local model files must be a Map');
 const required=operation==='encode'?['encoder']:['decoderBody','conv2Weight','conv2Bias'];
 for(const role of required)if(!files.has(manifest.assets[role].file))fail('Missing local model file: '+manifest.assets[role].file);
 if(operation==='encode'&&tensor.meaning==='rgb-unit'&&!hike?.affine)fail('VAE unit RGB encode requires a real Hike affine kernel');
 if(!ort?.InferenceSession?.create||!ort?.Tensor)fail('VAE requires the pinned ORT WASM runtime');
 if(ort.env?.wasm?.numThreads!==1)fail('VAE requires ORT WASM numThreads=1');
 if(operation==='decode'&&(!hike?.matmul||!hike?.affine))fail('VAE decode requires real Hike MatMul and affine kernels');
 let session,input,outputs;let hikeCalls=0;const timings={};const start=performance.now();
 try{
  onProgress({phase:'loading',operation,profileId:request.profileId});
  const graphName=operation==='encode'?'encoder':'decoderBody';
  let data=tensor.data;
  const hashes={};
  if(operation==='encode'&&tensor.meaning==='rgb-unit'){
   onProgress({phase:'hike-rgb-range',operation,profileId:request.profileId});const before=performance.now();
   data=hike.affine(data,2,-1);hikeCalls++;
   if(!(data instanceof Float32Array)||data.length!==tensor.data.length)fail('Hike returned an invalid RGB range tensor');
   for(const value of data)if(!Number.isFinite(value)||value< -1||value>1)fail('Hike returned invalid RGB range values');
   timings.hikeMs=performance.now()-before;
  }
  if(operation==='decode'){
   const weightBytes=await bytesFor(manifest.assets.conv2Weight,files);abort(signal);const biasBytes=await bytesFor(manifest.assets.conv2Bias,files);abort(signal);
   const weight=f32(weightBytes),bias=f32(biasBytes),positions=data.length/16;
   onProgress({phase:'hike-conv2',operation,profileId:request.profileId});const before=performance.now();
   data=hike.matmul(weight,data,16,16,positions);hikeCalls++;
   if(!(data instanceof Float32Array)||data.length!==tensor.data.length)fail('Hike returned an invalid conv2 tensor');
   for(let channel=0;channel<16;channel++){data.set(hike.affine(data.subarray(channel*positions,(channel+1)*positions),1,bias[channel]),channel*positions);hikeCalls++;}
   timings.hikeMs=performance.now()-before;hashes.conv2Weight=manifest.assets.conv2Weight.sha256;hashes.conv2Bias=manifest.assets.conv2Bias.sha256;
  }
  const graphBytes=await bytesFor(manifest.assets[graphName],files);hashes[graphName]=manifest.assets[graphName].sha256;abort(signal);
  onProgress({phase:'creating-session',operation,profileId:request.profileId});const sessionStart=performance.now();
  session=await ort.InferenceSession.create(graphBytes,{executionProviders:['wasm'],graphOptimizationLevel:'disabled'});timings.loadMs=performance.now()-sessionStart;abort(signal);
  input=new ort.Tensor('float32',data,request.inputShape);
  onProgress({phase:'running',operation,profileId:request.profileId});const inferStart=performance.now();
  outputs=await session.run({input});timings.inferenceMs=performance.now()-inferStart;abort(signal);
  const output=outputs.output;if(output?.type!=='float32'||!same(output.dims??[],request.outputShape)||!(output.data instanceof Float32Array)||output.data.length!==shape(request.outputShape))fail('ORT output does not match exported VAE profile');
  const result=new Float32Array(output.data);for(const value of result)if(!Number.isFinite(value))fail('Nonfinite VAE output');
  const meaning=operation==='encode'?'raw-posterior-mean':'raw-decoder-rgb';
  timings.totalMs=performance.now()-start;onProgress({phase:'complete',operation,profileId:request.profileId});
  return {tensor:{dtype:'float32',layout:'NCTHW',shape:request.outputShape,data:result,meaning,modelSha256:manifest.model.sha256},evidence:{operation,profileId:request.profileId,modelSha256:manifest.model.sha256,assetHashes:hashes,provider:'wasm',threads:1,executionDtype:'float32',storedDtype:'bfloat16',hikeContributed:hikeCalls>0,inputMeaning:tensor.meaning,hikeCalls,timings}};
 }finally{
  for(const value of Object.values(outputs??{}))value.dispose?.();input?.dispose?.();if(session)await session.release();
 }
}

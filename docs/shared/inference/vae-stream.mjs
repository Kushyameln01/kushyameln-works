// Native Wan2.1 causal streaming. Histories belong to one job, in host memory.
import {snapshotTensorMetadata,describeTensor,requireTensorDescriptor} from './tensor.mjs';
export const STREAM_KIND='wan21-vae-stream-v1';
export const RAW_LATENT='wan21-raw-latent:v1';
const GENERATED='wan21-raw-generated-sample:v1';
const MODEL='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b';
const HASH=/^[a-f0-9]{64}$/,LIMIT=2147483647;
const KINDS=['causal','pointwise','attention','spatial','temporalDown','temporalUp','add'];
function fail(message){throw new TypeError(message);}
function same(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((n,i)=>n===b[i]);}
function count(shape){let n=1;if(!Array.isArray(shape)||![4,5].includes(shape.length))fail('Expected NCHW or NCTHW shape');for(const d of shape){if(!Number.isSafeInteger(d)||d<1)fail('Expected positive tensor dimensions');n*=d;if(!Number.isSafeInteger(n)||n>LIMIT/4)fail('Streaming tensor exceeds byte limit');}return n;}
function abort(signal){if(signal?.aborted)throw new DOMException('VAE operation aborted','AbortError');}
function checkedAsset(id,a){
 if(!a||typeof a.file!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(a.file)||a.file.includes('..')||!Number.isSafeInteger(a.bytes)||a.bytes<1||a.bytes>LIMIT||!HASH.test(a.sha256))fail('Invalid streaming asset: '+id);
 if(['conv2Weight','conv2Bias'].includes(id))return;
 if(!KINDS.includes(a.kind))fail('Unsupported streaming unit kind: '+id);
 const cached=['causal','temporalDown','temporalUp'].includes(a.kind),history=a.kind==='temporalDown'?1:2;
 if(!same(a.inputNames,a.kind==='add'?['input','shortcut']:cached?['input','history']:['input'])||!same(a.outputNames,cached?['output','historyOutput']:['output'])||a.inputFrames!==(a.kind==='temporalDown'?2:1))fail('Invalid streaming unit I/O: '+id);
 if(cached?a.historyFrames!==history:a.historyFrames!==undefined)fail('Invalid streaming history contract: '+id);
 if(a.kind!=='add'&&(!Number.isSafeInteger(a.channelsIn)||a.channelsIn<1||!Number.isSafeInteger(a.channelsOut)||a.channelsOut<1))fail('Invalid streaming unit channels: '+id);
}
function validateProgram(steps,assets,depth=0,seen=new Set()){
 if(!Array.isArray(steps)||depth>64||seen.has(steps))fail('Invalid recursive VAE program');seen.add(steps);
 for(const s of steps){
  if(!s||typeof s!=='object')fail('Invalid VAE program node');
  if(s.op==='unit'){
   const a=assets[s.asset];if(!a||['spatial','temporalDown','temporalUp','add'].includes(a.kind)||s.kind!==a.kind||s.channelsIn!==a.channelsIn||s.channelsOut!==a.channelsOut||(a.kind==='causal'?s.cache!==s.asset:s.cache!==undefined))fail('Invalid VAE unit reference');
  }else if(s.op==='residual'){
   if(assets.residualAdd?.kind!=='add')fail('Residual program requires the ORT residualAdd asset');
   validateProgram(s.shortcut,assets,depth+1,seen);validateProgram(s.body,assets,depth+1,seen);
  }else if(s.op==='resample'){
   if(!['upsample2d','upsample3d','downsample2d','downsample3d'].includes(s.mode)||assets[s.spatial]?.kind!=='spatial')fail('Invalid spatial resample reference');
   if(s.mode.endsWith('3d')){if(assets[s.temporal]?.kind!==(s.mode.startsWith('up')?'temporalUp':'temporalDown')||s.cache!==s.temporal)fail('Invalid temporal resample reference');}
   else if(s.temporal!==undefined||s.cache!==undefined)fail('Unexpected temporal resample state');
  }else if(s.op==='mean'){
   if(s.channels!==16)fail('VAE posterior mean must select 16 channels');
  }else fail('Unknown VAE program operation');
 }
 seen.delete(steps);
}
export function inspectStreamManifest(manifest){
 if(manifest?.schemaVersion!==1||manifest.kind!==STREAM_KIND||manifest.model?.sha256!==MODEL||manifest.model?.executionDtype!=='float32')fail('Unsupported streaming VAE model manifest');
 const p=manifest.profile,d=manifest.domain,inf=manifest.inference;
 if(!p||typeof p.id!=='string'||!p.id||p.layout!=='NCTHW'||p.latentSpace!=='raw'||p.posterior!=='mean'||p.opset!==17)fail('Only raw mean NCTHW streaming profiles are supported');
 if(d?.maxSourceFrames!==81||d.minSpatial!==16||d.maxSpatial!==848||d.spatialStride!==16)fail('Unsupported streaming VAE domain');
 if(inf?.executionProvider!=='wasm'||![1,4].includes(inf.threads)||inf.graphOptimizationLevel!=='disabled')fail('Streaming VAE requires explicit ORT WASM threads1 or4');
 const assets=manifest.assets;if(!assets||typeof assets!=='object'||Array.isArray(assets))fail('Missing streaming assets');
 const names=Object.keys(assets);for(const id of names)checkedAsset(id,assets[id]);
 if(new Set(names.map(id=>assets[id].file)).size!==names.length)fail('Streaming asset filenames must be distinct');
 for(const [id,bytes,shape] of [['conv2Weight',1024,[16,16]],['conv2Bias',64,[16]]])if(assets[id]?.bytes!==bytes||!same(assets[id]?.shape,shape))fail('Invalid Hike conv2 asset: '+id);
 if(!manifest.programs||!Object.hasOwn(manifest.programs,'encode')||!Object.hasOwn(manifest.programs,'decode'))fail('Missing streaming programs');
 for(const op of ['encode','decode'])validateProgram(manifest.programs[op],assets);
 return structuredClone({kind:STREAM_KIND,profile:p,domain:d,model:manifest.model,assets,inference:inf,programs:manifest.programs});
}
function threadEnvironment(threads,environment){
 if(threads===4&&(environment.crossOriginIsolated!==true||typeof environment.SharedArrayBuffer!=='function'))fail('Streaming VAE threads4 requires cross-origin isolation and SharedArrayBuffer; no fallback to threads1');
 return threads;
}
export function streamThreadCount(manifest,environment=globalThis){
 return threadEnvironment(inspectStreamManifest(manifest).inference.threads,environment);
}
function unitShape(a,s,scale=1){
 if(s[1]!==a.channelsIn||s[2]%a.inputFrames)fail('Streaming feature shape does not match unit');
 const out=[1,a.channelsOut,a.kind==='temporalUp'?s[2]*2:a.kind==='temporalDown'?s[2]/2:s[2],s[3]*scale,s[4]*scale];count(out);return out;
}
function programShape(steps,shape,manifest,first){
 let s=[...shape];for(const n of steps){
  if(n.op==='unit')s=unitShape(manifest.assets[n.asset],s);
  else if(n.op==='residual'){const shortcut=programShape(n.shortcut,s,manifest,first);s=programShape(n.body,s,manifest,first);if(!same(s,shortcut))fail('Residual shapes do not agree');}
  else if(n.op==='resample'){
   if(n.mode==='upsample3d'&&!first)s=unitShape(manifest.assets[n.temporal],s);
   s=unitShape(manifest.assets[n.spatial],s,n.mode.startsWith('up')?2:.5);
   if(n.mode==='downsample3d'&&!first)s=unitShape(manifest.assets[n.temporal],s);
  }else{if(s[1]<n.channels)fail('Posterior mean channel count exceeds feature');s[1]=n.channels;}
 }return s;
}
function processing(sourceFrames,latentFrames,consumedFrames){
 return {sourceFrames,latentFrames,consumedFrames,ignoredTailFrames:sourceFrames-consumedFrames,decodedFrames:consumedFrames,tailRule:'native-floor-complete-groups-of-four-after-first-frame',consumedFrameIndices:Array.from({length:consumedFrames},(_,i)=>i),ignoredTailFrameIndices:Array.from({length:sourceFrames-consumedFrames},(_,i)=>consumedFrames+i)};
}
export function validateStreamDescriptor({operation,tensor,manifest}){
 if(!['encode','decode'].includes(operation))fail('VAE operation must be encode or decode');
 const m=inspectStreamManifest(manifest);threadEnvironment(m.inference.threads,globalThis);requireTensorDescriptor(tensor,{dtype:'float32',layout:'NCTHW'});count(tensor.shape);
 if(tensor.shape.length!==5||tensor.shape[0]!==1)fail('Streaming VAE requires batch-one NCTHW');
 const encode=operation==='encode',meanings=encode?['raw-decoder-rgb','rgb-unit']:['raw-posterior-mean',RAW_LATENT,GENERATED];
 if(!meanings.includes(tensor.meaning))fail('Tensor meaning cannot connect to streaming VAE');
 const [batch,c,t,h,w]=tensor.shape,videoH=encode?h:h*8,videoW=encode?w:w*8;
 if(c!==(encode?3:16)||videoH<m.domain.minSpatial||videoW<m.domain.minSpatial||videoH>m.domain.maxSpatial||videoW>m.domain.maxSpatial||videoH%m.domain.spatialStride||videoW%m.domain.spatialStride||t>(encode?81:21))fail('Tensor shape is outside the streaming VAE domain');
 const metadata=snapshotTensorMetadata(tensor),latentFrames=encode?1+Math.floor((t-1)/4):t,consumedFrames=1+4*(latentFrames-1),sourceFrames=encode?t:consumedFrames;
 if(encode&&metadata.context&&metadata.context.sourceFrameIndices.length!==t)fail('Encode context must map every source frame');
 if(!encode){
  if(tensor.normalization!==undefined)fail('Raw decoder input cannot carry normalization');
  if(tensor.meaning===GENERATED){
   const contract=metadata.latentContract;
   if(!contract||contract.representation!=='generated-sample'||contract.space!=='raw'||contract.vaeModelSha256!==m.model.sha256||contract.normalization?.id!=='wan21-comfy-f32-v1'||contract.normalization.state!=='restored'||contract.normalization.owner!=='diffusion_models')fail('Generated sample requires diffusion_models raw restoration for this VAE');
  }else{
   if(tensor.latentContract!==undefined)fail('Raw latent cannot carry a generated-sample contract');
   if(tensor.modelSha256!==undefined&&tensor.modelSha256!==m.model.sha256)fail('Raw latent model provenance does not match this VAE');
  }
 }
 const outputShape=encode?[batch,16,latentFrames,h/8,w/8]:[batch,3,consumedFrames,h*8,w*8];count(outputShape);
 for(const first of [true,false]){
  const input=[1,c,first?1:encode?4:1,h,w],expected=[1,outputShape[1],first?1:encode?1:4,outputShape[3],outputShape[4]];
  if(!same(programShape(m.programs[operation],input,m,first),expected))fail('Streaming program does not implement the native VAE shape contract');
 }
 return {count:count(tensor.shape),inputShape:[...tensor.shape],outputShape,profileId:m.profile.id,metadata,processing:processing(sourceFrames,latentFrames,consumedFrames)};
}
export function streamCapabilities(manifest,request={}){
 const m=inspectStreamManifest(manifest);
 return {kind:STREAM_KIND,profileId:m.profile.id,domain:m.domain,inference:m.inference,layout:'NCTHW',latentSpace:'raw',posterior:'mean',nativeCausalStreaming:true,...(request.tensor&&request.operation?{request:validateStreamDescriptor({...request,manifest})}:{})};
}
export function requiredStreamAssets(manifest,operation){
 if(!['encode','decode'].includes(operation))fail('VAE operation must be encode or decode');
 const m=inspectStreamManifest(manifest),ids=new Set(operation==='decode'?['conv2Weight','conv2Bias']:[]);
 function visit(steps){for(const s of steps){
  if(s.op==='unit')ids.add(s.asset);
  else if(s.op==='residual'){ids.add('residualAdd');visit(s.shortcut);visit(s.body);}
  else if(s.op==='resample'){ids.add(s.spatial);if(s.temporal)ids.add(s.temporal);}
 }}
 visit(m.programs[operation]);return [...ids];
}
async function bytesFor(a,files,signal){
 abort(signal);const file=files.get(a.file);if(!file)fail('Missing local model file: '+a.file);
 const size=file instanceof Uint8Array?file.byteLength:file?.size;if(size!==a.bytes)fail('Local model file size mismatch: '+a.file);
 // Own mutable byte arrays before hashing; progress callbacks may yield to callers.
 const bytes=file instanceof Uint8Array?new Uint8Array(file):new Uint8Array(await file.arrayBuffer());abort(signal);
 if(bytes.byteLength!==a.bytes)fail('Local model file changed while loading: '+a.file);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');abort(signal);
 if(hash!==a.sha256)fail('Local model file hash mismatch: '+a.file);return bytes;
}
function floats(bytes){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),data=new Float32Array(bytes.byteLength/4);for(let i=0;i<data.length;i++){data[i]=view.getFloat32(i*4,true);if(!Number.isFinite(data[i]))fail('Nonfinite Hike coefficient');}return data;}
function feature(data,shape){if(!(data instanceof Float32Array)||data.length!==count(shape))fail('Invalid streaming feature tensor');return {data,shape};}
function frameFeature(frameData,shape){
 count(shape);const frameSize=shape[1]*shape[3]*shape[4];
 if(frameData.length!==shape[2]||frameData.some(data=>!(data instanceof Float32Array)||data.length!==frameSize))fail('Invalid streaming feature frames');
 return {frameData,shape};
}
function frameData(x,index,metrics){
 if(x.frameData)return x.frameData[index];
 const [,c,t,h,w]=x.shape;if(t===1)return x.data;
 const plane=h*w,data=new Float32Array(c*plane);
 for(let channel=0;channel<c;channel++)data.set(x.data.subarray((channel*t+index)*plane,(channel*t+index+1)*plane),channel*plane);
 metrics.inputFrameCopiedBytes+=data.byteLength;return data;
}
// Internal features are lists of CHW frames. Pack NCTHW only for temporal pairs.
function frames(x,start,length,metrics){
 const [,c,t,h,w]=x.shape;if(start<0||length<1||start+length>t)fail('Invalid feature frame slice');
 if(start===0&&length===t)return x;
 return frameFeature(Array.from({length},(_,i)=>frameData(x,start+i,metrics)),[1,c,length,h,w]);
}
function packedFrames(x,start,length,metrics){
 if(x.data&&start===0&&length===x.shape[2])return x.data;
 if(length===1)return frameData(x,start,metrics);
 const [,c,,h,w]=x.shape,plane=h*w,data=new Float32Array(c*length*plane);
 for(let frame=0;frame<length;frame++){
  const source=frameData(x,start+frame,metrics);
  for(let channel=0;channel<c;channel++)data.set(source.subarray(channel*plane,(channel+1)*plane),(channel*length+frame)*plane);
 }
 metrics.temporalPackBytes+=data.byteLength;return data;
}
function splitFrames(data,shape,metrics){
 const [,c,t,h,w]=shape;if(t===1)return [data];
 const plane=h*w,output=Array.from({length:t},()=>new Float32Array(c*plane));
 for(let frame=0;frame<t;frame++)for(let channel=0;channel<c;channel++)output[frame].set(data.subarray((channel*t+frame)*plane,(channel*t+frame+1)*plane),channel*plane);
 metrics.temporalSplitBytes+=data.byteLength;return output;
}
function scatter(target,x,start,metrics){
 const [,c,t,h,w]=target.shape,plane=h*w,n=x.shape[2];if(c!==x.shape[1]||h!==x.shape[3]||w!==x.shape[4]||start+n>t)fail('Feature output shape mismatch');
 for(let frame=0;frame<n;frame++){
  const data=frameData(x,frame,metrics);
  for(let channel=0;channel<c;channel++)target.data.set(data.subarray(channel*plane,(channel+1)*plane),(channel*t+start+frame)*plane);
 }
 metrics.finalScatterBytes+=c*n*plane*4;
}
function metadata(entries,names,shapes){
 if(!Array.isArray(entries)||entries.length!==names.length)fail('Streaming graph metadata unavailable');
 for(let i=0;i<names.length;i++){
  const e=entries.find(e=>e.name===names[i]),s=shapes[i];
  if(!e||e.type!=='float32'||!Array.isArray(e.shape)||e.shape.length!==s.length||e.shape.some((d,j)=>typeof d==='number'?d!==s[j]:typeof d!=='string'||!d))fail('Streaming graph metadata shape mismatch: '+names[i]);
 }
}
function checkedOutput(value,shape,name){
 if(value?.type!=='float32'||!same(value.dims,shape)||!(value.data instanceof Float32Array)||value.data.length!==count(shape))fail('Streaming ORT output shape mismatch: '+name);
 return value.data;
}
export async function runStreamVae({operation,tensor,manifest,files,ort,hike,onProgress=()=>{},signal,diagnostics=false}){
 const request=validateStreamDescriptor({operation,tensor,manifest}),m=inspectStreamManifest(manifest),inputDescriptor=describeTensor(tensor),inputMeaning=tensor.meaning;
 if(!(tensor.data instanceof Float32Array)||tensor.data.length!==request.count)fail('Tensor byte length does not match streaming request');
 if(!(files instanceof Map))fail('Local model files must be a Map');
 for(const id of requiredStreamAssets(manifest,operation)){const a=m.assets[id],file=files.get(a.file),size=file instanceof Uint8Array?file.byteLength:file?.size;if(size!==a.bytes)fail('Missing or mismatched local model file: '+a.file);}
 if(!ort?.InferenceSession?.create||!ort?.Tensor||ort.env?.wasm?.numThreads!==m.inference.threads)fail('Streaming VAE runtime threads do not match the explicit manifest');
 if((operation==='decode'&&(!hike?.matmul||!hike?.affine))||(operation==='encode'&&inputMeaning==='rgb-unit'&&!hike?.affine))fail('Streaming VAE requires real Hike kernels');
 for(const v of tensor.data){if(!Number.isFinite(v))fail('Nonfinite VAE input');if(operation==='encode'&&(v<(inputMeaning==='rgb-unit'?0:-1)||v>1))fail('Encoder RGB values are outside the declared range');}
 abort(signal);
 const state=new Map(),hashes={},metrics={sessionsCreated:0,graphRuns:0,hikeCalls:0,historyCopies:0,historyRetentions:0,maxHostHistoryBytes:0,inputFrameCopiedBytes:0,temporalPackBytes:0,temporalSplitBytes:0,hostOutputCopiedBytes:0,hostHistoryCopiedBytes:0,adoptedOutputBytes:0,adoptedHistoryBytes:0,finalScatterBytes:0,finalFiniteScannedValues:0},start=performance.now();
 const result=feature(new Float32Array(count(request.outputShape)),request.outputShape);let chunkIndex=0,hasFuture=false;
 function progress(phase,extra={}){abort(signal);onProgress({phase,operation,profileId:request.profileId,chunkIndex,chunkCount:request.processing.latentFrames,...extra});abort(signal);}
 function save(id,value){if(value){state.set(id,value);metrics.historyRetentions++;}else state.delete(id);let bytes=0;for(const v of state.values())bytes+=v.data?.byteLength??0;metrics.maxHostHistoryBytes=Math.max(metrics.maxHostHistoryBytes,bytes);}
 function ownedOutput(value,shape,name,history=false){
  const data=checkedOutput(value,shape,name);
  // Pinned ORT1.24.3 CPU output processing allocates an ordinary typed array
  // and copies out of HEAPU8. Tensor.dispose releases its wrapper, not that
  // array. Never retain a shared heap view, subview, or unknown-provider array.
  const adopt=ort.env?.versions?.web==='1.24.3'&&value.location==='cpu'&&data.buffer instanceof ArrayBuffer&&data.byteOffset===0&&data.byteLength===data.buffer.byteLength;
  if(adopt){metrics[history?'adoptedHistoryBytes':'adoptedOutputBytes']+=data.byteLength;return data;}
  metrics[history?'hostHistoryCopiedBytes':'hostOutputCopiedBytes']+=data.byteLength;
  if(history)metrics.historyCopies++;
  return new Float32Array(data);
 }
 async function runUnit(id,x,{scale=1,shortcut}={}){
  const a=m.assets[id],spatial=a.kind==='spatial',add=a.kind==='add',outputShape=add?[...x.shape]:unitShape(a,x.shape,scale),step=a.inputFrames;
  const outputFrames=[];let session;
  try{
   progress('loading-unit',{asset:id});const bytes=await bytesFor(a,files,signal);hashes[id]=a.sha256;
   progress('creating-session',{asset:id});session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'disabled'});metrics.sessionsCreated++;abort(signal);
   if(ort.env.wasm.numThreads!==m.inference.threads)fail('ORT WASM changed the explicitly requested streaming thread count; fallback is unsupported');
   for(let offset=0;offset<x.shape[2];offset+=step){
    let inputs=[],outputs;
    try{
     const inShape=spatial?[1,x.shape[1],x.shape[3],x.shape[4]]:[1,x.shape[1],step,x.shape[3],x.shape[4]];
     const outShape=spatial?[1,outputShape[1],outputShape[3],outputShape[4]]:[1,outputShape[1],a.kind==='temporalUp'?2:1,outputShape[3],outputShape[4]];
     const inputShapes=[inShape],inputData=[packedFrames(x,offset,step,metrics)],outputShapes=[outShape];
     if(a.historyFrames){
      const hs=[1,a.channelsIn,a.historyFrames,x.shape[3],x.shape[4]],previous=state.get(id);count(hs);
      if(previous&&!same(previous.shape,hs))fail('Streaming history shape mismatch');
      inputShapes.push(hs);inputData.push(previous?.data??new Float32Array(count(hs)));outputShapes.push(hs);
     }else if(add){inputShapes.push([1,shortcut.shape[1],step,shortcut.shape[3],shortcut.shape[4]]);inputData.push(packedFrames(shortcut,offset,step,metrics));}
     metadata(session.inputMetadata,a.inputNames,inputShapes);metadata(session.outputMetadata,a.outputNames,outputShapes);
     for(let i=0;i<inputData.length;i++)inputs.push(new ort.Tensor('float32',inputData[i],inputShapes[i]));
     progress('running-unit',{asset:id,featureFrame:offset,featureFrames:x.shape[2]});
     outputs=await session.run(Object.fromEntries(a.inputNames.map((name,i)=>[name,inputs[i]])));metrics.graphRuns++;abort(signal);
     if(!outputs||Object.keys(outputs).length!==a.outputNames.length)fail('Unexpected streaming graph outputs');
     const data=ownedOutput(outputs.output,outShape,'output');
     outputFrames.push(...splitFrames(data,spatial?[1,outShape[1],1,outShape[2],outShape[3]]:outShape,metrics));
     if(a.historyFrames){
      const keep=hasFuture||offset+step<x.shape[2];
      checkedOutput(outputs.historyOutput,outputShapes[1],'historyOutput');
      save(id,keep?feature(ownedOutput(outputs.historyOutput,outputShapes[1],'historyOutput',true),outputShapes[1]):null);
     }
    }finally{for(const value of new Set([...Object.values(outputs??{}),...inputs]))value?.dispose?.();}
   }
   return frameFeature(outputFrames,outputShape);
  }finally{if(session)await session.release();}
 }
 async function execute(steps,input,first){
  let x=input;for(const s of steps){
   abort(signal);
   if(s.op==='unit')x=await runUnit(s.asset,x);
   else if(s.op==='residual'){const shortcut=await execute(s.shortcut,x,first);x=await runUnit('residualAdd',await execute(s.body,x,first),{shortcut});}
   else if(s.op==='mean'){const size=s.channels*x.shape[3]*x.shape[4];x=frameFeature(Array.from({length:x.shape[2]},(_,i)=>frameData(x,i,metrics).subarray(0,size)),[1,s.channels,...x.shape.slice(2)]);}
   else{
    if(s.mode==='upsample3d'){
     if(first){if(hasFuture)save(s.temporal,{shape:[1,x.shape[1],2,x.shape[3],x.shape[4]]});}
     else x=await runUnit(s.temporal,x);
    }
    x=await runUnit(s.spatial,x,{scale:s.mode.startsWith('up')?2:.5});
    if(s.mode==='downsample3d'){
     if(first){if(hasFuture)save(s.temporal,feature(packedFrames(x,x.shape[2]-1,1,metrics),[1,x.shape[1],1,x.shape[3],x.shape[4]]));}
     else x=await runUnit(s.temporal,x);
    }
   }
  }return x;
 }
 try{
  let weight,bias;if(operation==='decode'){
   progress('loading-conv2');weight=floats(await bytesFor(m.assets.conv2Weight,files,signal));bias=floats(await bytesFor(m.assets.conv2Bias,files,signal));
   hashes.conv2Weight=m.assets.conv2Weight.sha256;hashes.conv2Bias=m.assets.conv2Bias.sha256;
  }
  let outputOffset=0;
  for(chunkIndex=0;chunkIndex<request.processing.latentFrames;chunkIndex++){
   hasFuture=chunkIndex+1<request.processing.latentFrames;const first=chunkIndex===0,sourceOffset=operation==='encode'?(first?0:1+4*(chunkIndex-1)):chunkIndex;
   let chunk=frames(feature(tensor.data,request.inputShape),sourceOffset,operation==='encode'&&!first?4:1,metrics);progress('chunk-start');
   if(operation==='encode'&&inputMeaning==='rgb-unit'){
    const converted=[];for(let frame=0;frame<chunk.shape[2];frame++){
     const data=hike.affine(packedFrames(chunk,frame,1,metrics),2,-1);metrics.hikeCalls++;
     if(!(data instanceof Float32Array)||data.length!==chunk.shape[1]*chunk.shape[3]*chunk.shape[4])fail('Hike returned invalid RGB tensor');
     for(const v of data)if(!Number.isFinite(v)||v< -1||v>1)fail('Hike returned invalid RGB values');converted.push(data);
    }chunk=frameFeature(converted,chunk.shape);
   }else if(operation==='decode'){
    progress('hike-conv2');const positions=chunk.shape[3]*chunk.shape[4];let data=hike.matmul(weight,packedFrames(chunk,0,1,metrics),16,16,positions);metrics.hikeCalls++;
    if(!(data instanceof Float32Array)||data.length!==16*positions)fail('Hike returned invalid conv2 tensor');
    for(let c=0;c<16;c++){const shifted=hike.affine(data.subarray(c*positions,(c+1)*positions),1,bias[c]);metrics.hikeCalls++;if(!(shifted instanceof Float32Array)||shifted.length!==positions)fail('Hike returned invalid conv2 bias tensor');data.set(shifted,c*positions);}
    for(const v of data)if(!Number.isFinite(v))fail('Hike returned nonfinite conv2 values');chunk=frameFeature([data],chunk.shape);
   }
   const output=await execute(m.programs[operation],chunk,first);scatter(result,output,outputOffset,metrics);outputOffset+=output.shape[2];progress('chunk-complete');
  }
  if(outputOffset!==request.outputShape[2])fail('Incomplete streaming VAE output');
  for(const value of result.data)if(!Number.isFinite(value))fail('Nonfinite VAE output');metrics.finalFiniteScannedValues=result.data.length;
  const context=request.metadata.context?structuredClone(request.metadata.context):undefined;
  if(operation==='encode'&&context){context.sourceFrameIndices=context.sourceFrameIndices.slice(0,request.processing.consumedFrames);if(context.sourceFrameTimesSeconds)context.sourceFrameTimesSeconds=context.sourceFrameTimesSeconds.slice(0,request.processing.consumedFrames);}
  const frameProcessing=operation==='decode'&&request.metadata.frameProcessing?request.metadata.frameProcessing:{schemaVersion:1,policy:'wan21-causal-floor-v1',sourceFrames:request.processing.sourceFrames,latentFrames:request.processing.latentFrames,consumedFrames:request.processing.consumedFrames,unusedTailFrames:request.processing.ignoredTailFrames,...(operation==='encode'&&request.metadata.context?{sourceContext:request.metadata.context}:{})};
  progress('complete');
  return {tensor:{dtype:'float32',layout:'NCTHW',shape:request.outputShape,data:result.data,meaning:operation==='encode'?'raw-posterior-mean':'raw-decoder-rgb',modelSha256:m.model.sha256,frameProcessing,...(context?{context}:{})},inputDescriptor,binding:{operation,kind:STREAM_KIND,inputShape:request.inputShape,outputShape:request.outputShape,assetsVerified:true,assetHashes:hashes,graphMetadataChecked:true,executionProvider:'wasm',threads:m.inference.threads},processing:request.processing,...(diagnostics?{evidence:{operation,profileId:request.profileId,modelSha256:m.model.sha256,assetHashes:hashes,provider:'wasm',threads:m.inference.threads,executionDtype:'float32',storedDtype:m.model.storedDtype,inputMeaning,inputModelSha256:tensor.modelSha256??null,...(request.metadata.latentContract?{latentContract:request.metadata.latentContract}:{}),normalizationApplied:false,hikeContributed:metrics.hikeCalls>0,...metrics,maxActiveSessions:1,totalMs:performance.now()-start}}:{})};
 }finally{state.clear();}
}

// Real-runtime instrumentation for V1 acceptance. No surrogate neural outputs.
import * as ort from '/shared/inference/vendor/ort.wasm.min.mjs';
import {createHike} from '/shared/inference/hike.mjs';
import {runVae} from '/shared/inference/vae.mjs';

ort.env.wasm.wasmPaths={mjs:'/shared/inference/vendor/ort-wasm-simd-threaded.mjs',wasm:'/shared/inference/vendor/ort-wasm-simd-threaded.wasm'};
ort.env.wasm.numThreads=1;
ort.env.wasm.proxy=false;
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
function compare(a,b,g){
 let maxAbs=0,squared=0,passed=a.length===b.length;
 for(let i=0;i<b.length;i++){const e=Math.abs(a[i]-b[i]);maxAbs=Math.max(maxAbs,e);squared+=e*e;if(!Number.isFinite(a[i])||e>g.atol+g.rtol*Math.abs(b[i]))passed=false;}
 return{passed:passed&&maxAbs<=g.maxAbs,count:b.length,maxAbs,rmse:Math.sqrt(squared/b.length)};
}
self.onmessage=async({data:{manifest,files,gate}})=>{
 let hike;
 const sessions={created:0,released:0,active:0,runCalls:0};
 try{
  const kernel=await(await fetch('/shared/inference/kernel/tensor.wasm')).arrayBuffer();
  const kernelHash=await hash(kernel);
  if(kernelHash!=='9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8')throw Error('Pinned Hike hash mismatch');
  hike=await createHike(kernel);
  const realOrt={env:ort.env,Tensor:ort.Tensor,InferenceSession:{create:async(...args)=>{
   const session=await ort.InferenceSession.create(...args);sessions.created++;sessions.active++;
   return{run:async(...inputs)=>{sessions.runCalls++;return session.run(...inputs);},release:async()=>{await session.release();sessions.released++;sessions.active--;}};
  }}};
  const read=async descriptor=>{
   const file=files.get(descriptor.file);if(!file)throw Error('Missing reference '+descriptor.file);
   const bytes=await file.arrayBuffer();if(await hash(bytes)!==descriptor.sha256)throw Error('Reference hash mismatch');
   return new Float32Array(bytes);
  };
  const cases=[];
  for(const operation of ['encode','decode']){
   const ref=manifest.references[operation],data=await read(ref.input),before=data.slice();
   const tensor={dtype:'float32',layout:'NCTHW',shape:operation==='encode'?manifest.profile.videoShape:manifest.profile.latentShape,
    meaning:operation==='encode'?'raw-decoder-rgb':'raw-posterior-mean',modelSha256:manifest.model.sha256,data};
   const result=await runVae({operation,tensor,manifest,files,ort:realOrt,hike});
   const numeric=compare(result.tensor.data,await read(ref.output),gate);
   const inputPreserved=data.every((v,i)=>Object.is(v,before[i]));
   if(!numeric.passed||!inputPreserved||sessions.active!==0)throw Error('Actual runtime/reference/session check failed '+operation);
   if(operation==='decode'&&(!result.evidence.hikeContributed||result.evidence.hikeCalls!==17))throw Error('Actual conv2 Hike contribution missing');
   cases.push({operation,numeric,inputPreserved,evidence:result.evidence,sessionsAfter:{...sessions}});
  }
  // Abort after creating a real session and entering its real run. finally must release it.
  const controller=new AbortController(),ref=manifest.references.decode;
  let aborted=false;
  try{
   await runVae({operation:'decode',tensor:{dtype:'float32',layout:'NCTHW',shape:manifest.profile.latentShape,
    meaning:'raw-posterior-mean',modelSha256:manifest.model.sha256,data:await read(ref.input)},manifest,files,ort:realOrt,hike,
    signal:controller.signal,onProgress:p=>{if(p.phase==='running')controller.abort();}});
  }catch(error){aborted=error.name==='AbortError';}
  if(!aborted||sessions.active!==0||sessions.created!==sessions.released)throw Error('Abort did not release actual ORT session');
  hike.dispose();let disposedRejected=false;
  try{hike.affine(new Float32Array([1]),2,-1);}catch{disposedRejected=true;}
  if(!disposedRejected)throw Error('Disposed Hike remained usable');
  self.postMessage({passed:true,profileId:manifest.profile.id,cases,sessions,abortReleased:aborted,hikeDisposedRejected:disposedRejected,
   kernelHash,ortVersion:'1.24.3',scope:'Actual ORT WASM sessions and actual Hike; release instrumentation delegates to real session.run/release'});
 }catch(error){self.postMessage({passed:false,error:String(error),stack:error.stack,sessions});}
 finally{hike?.dispose();}
};

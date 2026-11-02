// Contract and Worker-selection tests only: no NN graph or WASM session runs.
import assert from 'node:assert/strict';
import * as stream from '../../../docs/shared/inference/vae-stream.mjs';

assert.equal(typeof stream.streamThreadCount,'function','Explicit streaming thread selection is missing');
const hash='a'.repeat(64),assets={};
function asset(id,kind,ci,co){
 const cached=['causal','temporalDown','temporalUp'].includes(kind);
 assets[id]={file:id+'.onnx',bytes:1,sha256:hash,kind,channelsIn:ci,channelsOut:co,
  inputFrames:kind==='temporalDown'?2:1,inputNames:cached?['input','history']:['input'],
  outputNames:cached?['output','historyOutput']:['output'],
  ...(cached?{historyFrames:kind==='temporalDown'?1:2}:{})};
}
for(const [id,kind,ci,co] of [['enc','pointwise',3,16],['dec','pointwise',16,3],
 ['d0s','spatial',16,16],['d1s','spatial',16,16],['d2s','spatial',16,16],
 ['d1t','temporalDown',16,16],['d2t','temporalDown',16,16],
 ['u0s','spatial',16,16],['u1s','spatial',16,16],['u2s','spatial',16,16],
 ['u0t','temporalUp',16,16],['u1t','temporalUp',16,16]])asset(id,kind,ci,co);
assets.conv2Weight={file:'weight.f32',bytes:1024,sha256:hash,shape:[16,16]};
assets.conv2Bias={file:'bias.f32',bytes:64,sha256:hash,shape:[16]};
const unit=(id,ci,co)=>({op:'unit',asset:id,kind:'pointwise',channelsIn:ci,channelsOut:co});
const resample=(mode,id)=>({op:'resample',mode,spatial:id+'s',...(mode.endsWith('3d')?{temporal:id+'t',cache:id+'t'}:{})});
const manifest={schemaVersion:1,kind:stream.STREAM_KIND,
 model:{sha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',executionDtype:'float32'},
 profile:{id:'thread-contract-only',layout:'NCTHW',latentSpace:'raw',posterior:'mean',opset:17},
 domain:{maxSourceFrames:81,minSpatial:16,maxSpatial:848,spatialStride:16},
 inference:{executionProvider:'wasm',threads:1,graphOptimizationLevel:'disabled'},assets,
 programs:{encode:[unit('enc',3,16),resample('downsample2d','d0'),resample('downsample3d','d1'),resample('downsample3d','d2')],
  decode:[resample('upsample3d','u0'),resample('upsample3d','u1'),resample('upsample2d','u2'),unit('dec',16,3)]}};
const four=structuredClone(manifest);four.inference.threads=4;
assert.equal(stream.streamThreadCount(manifest,{}),1,'Existing thread1 works without isolation');
assert.equal(stream.inspectStreamManifest(four).inference.threads,4);
assert.equal(stream.streamThreadCount(four,{crossOriginIsolated:true,SharedArrayBuffer}),4);
for(const env of [{},{crossOriginIsolated:false,SharedArrayBuffer},{crossOriginIsolated:true}])
 assert.throws(()=>stream.streamThreadCount(four,env),/cross-origin isolation.*SharedArrayBuffer/);
for(const threads of [0,2,3,8,'4']){const bad=structuredClone(manifest);bad.inference.threads=threads;assert.throws(()=>stream.inspectStreamManifest(bad));}

const saved={self:globalThis.self,fetch:globalThis.fetch,isolation:Object.getOwnPropertyDescriptor(globalThis,'crossOriginIsolated')};
const messages=[];let fetchCalls=0;
globalThis.self={postMessage:value=>messages.push(value)};
globalThis.fetch=async()=>{fetchCalls++;return{ok:false};};
const job={buildId:'works-inference-v1',sessionId:'thread-test',jobId:'1',inputRevision:1,module:'vae',operation:'encode',manifest:four};
try{
 Object.defineProperty(globalThis,'crossOriginIsolated',{value:false,configurable:true});
 assert.throws(()=>stream.validateStreamDescriptor({operation:'encode',manifest:four,tensor:{dtype:'float32',layout:'NCTHW',meaning:'rgb-unit',shape:[1,3,1,16,16]}}),/cross-origin isolation/);
 await import('../../../docs/shared/inference/inference-worker.mjs?thread-contract=unisolated');
 await self.onmessage({data:job});
 assert.equal(fetchCalls,0,'Unsupported explicit4 must fail before any runtime fetch');
 assert.match(messages.at(-1).error,/cross-origin isolation.*SharedArrayBuffer/);
 Object.defineProperty(globalThis,'crossOriginIsolated',{value:true,configurable:true});
 await import('../../../docs/shared/inference/inference-worker.mjs?thread-contract=isolated');
 await self.onmessage({data:job});
 const ort=await import('../../../docs/shared/inference/vendor/ort.wasm.min.mjs');
 assert.equal(ort.env.wasm.numThreads,4,'Owner Worker must select4 before its first runtime/session initialization');
 assert.equal(fetchCalls,1);assert.match(messages.at(-1).error,/Hike runtime could not load/);
 const fallback=structuredClone(four),files=new Map();
 for(const a of Object.values(fallback.assets)){
  const bytes=new Uint8Array(a.bytes);files.set(a.file,bytes);
  a.sha256=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
 }
 let released=0;
 const fakeOrt={env:{wasm:{numThreads:4}},Tensor:class{},InferenceSession:{create:async()=>{
  fakeOrt.env.wasm.numThreads=1;return{release:async()=>{released++;}};
 }}};
 await assert.rejects(stream.runStreamVae({operation:'encode',manifest:fallback,files,ort:fakeOrt,
  tensor:{dtype:'float32',layout:'NCTHW',meaning:'raw-decoder-rgb',shape:[1,3,1,16,16],data:new Float32Array(768)}}),/fallback is unsupported/);
 assert.equal(released,1,'A session that initialized with fallback must still be released');
 await import('../../../docs/shared/inference/inference-worker.mjs?thread-contract=default');
 assert.equal(ort.env.wasm.numThreads,1,'A fresh Worker keeps the existing default1');
}finally{
 globalThis.self=saved.self;globalThis.fetch=saved.fetch;
 if(saved.isolation)Object.defineProperty(globalThis,'crossOriginIsolated',saved.isolation);else delete globalThis.crossOriginIsolated;
}
console.log('PASS: explicit streaming threads1/4, isolation rejection, and per-job Worker selection; no NN or WASM session');

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {runVae} from '../../docs/shared/inference/vae.mjs';
import {createVaeModule} from '../../docs/shared/inference/vae-api.mjs';
import {createTextEncoderModule} from '../../docs/shared/inference/text-encoder-api.mjs';
import {createInferenceAPI,bindInferencePort} from '../../docs/shared/inference/api.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('./vae/profile.json',import.meta.url)));
const descriptor={dtype:'float32',layout:'NCTHW',shape:manifest.profile.videoShape,meaning:'rgb-unit'};
function fixture(){
 let calls=0;const client={state:{status:'idle'},cancel(){},dispose(){},async run(q){calls++;return{tensor:{dtype:'float32',layout:'NCTHW',shape:q.manifest.profile.latentShape,data:new Float32Array(128),meaning:'raw-posterior-mean',modelSha256:manifest.model.sha256},binding:{operation:q.operation,inputShape:q.manifest.profile.videoShape,outputShape:q.manifest.profile.latentShape,assetsVerified:true}};}};
 const files=new Map(Object.values(manifest.assets).map(a=>[a.file,{size:a.bytes}]));
 return{module:createVaeModule({client,ownsClient:false}),files,get calls(){return calls;}};
}
test('configured owner reports exact operation shapes and declaration versus execution status',()=>{
 const f=fixture();f.module.configure({manifest,files:f.files});
 const caps=f.module.capabilities({operation:'encode',input:descriptor});
 assert.deepEqual(caps.encode.input.shape,manifest.profile.videoShape);
 assert.deepEqual(caps.decode.input.shape,manifest.profile.latentShape);
 assert.equal(caps.support.supported,true);assert.equal(caps.runtime.encode.verified,false);
 assert.equal(caps.encode.graph.sha256,manifest.assets.encoder.sha256);
 caps.encode.input.shape[2]=999;assert.deepEqual(f.module.capabilities().encode.input.shape,manifest.profile.videoShape);
});
test('formula-valid81 and same-element-count wrong shapes reject with concrete required changes, no dispatch',()=>{
 const f=fixture();f.module.configure({manifest,files:f.files});
 for(const shape of [[1,3,81,480,832],[1,3,1,16,80]]){
  const support=f.module.capabilities({operation:'encode',input:{...descriptor,shape}}).support;
  assert.equal(support.supported,false);assert.match(support.reason,/shape/i);assert.match(support.requiredChanges.join(' '),/profile|graph/i);
 }
 assert.equal(f.calls,0);
});
test('owner explains dtype, axes, normalized meaning, decoder binding, missing files and disposal',()=>{
 const f=fixture();assert.equal(f.module.capabilities({operation:'encode',input:descriptor}).support.code,'NOT_CONFIGURED');
 f.module.configure({manifest,files:f.files});
 for(const patch of [{dtype:'float16'},{layout:'NTCHW'},{meaning:'normalized-latent'},{shape:[2,3,5,16,16]}])assert.equal(f.module.capabilities({operation:'encode',input:{...descriptor,...patch}}).support.supported,false);
 const decode={dtype:'float32',layout:'NCTHW',shape:manifest.profile.latentShape,meaning:'raw-posterior-mean'};
 assert.equal(f.module.capabilities({operation:'decode',input:{...decode,normalization:'wan21-comfy-f32-v1'}}).support.supported,false);
 f.module.configure({manifest,files:new Map()});assert.equal(f.module.capabilities({operation:'encode',input:descriptor}).support.code,'MISSING_ASSET');
 f.module.dispose();assert.equal(f.module.capabilities({operation:'encode',input:descriptor}).support.code,'MODULE_DISPOSED');
});
test('successful execution records only that operation and reconfigure clears observed binding',async()=>{
 const f=fixture();f.module.configure({manifest,files:f.files});
 await f.module.encode({...descriptor,data:new Float32Array(3840)});
 assert.equal(f.module.capabilities().runtime.encode.verified,true);assert.equal(f.module.capabilities().runtime.decode.verified,false);
 f.module.configure({manifest,files:f.files});assert.equal(f.module.capabilities().runtime.encode.verified,false);
});
test('Text capabilities distinguish plain512 from ID length and expose final norm without receipt',()=>{
 const module=createTextEncoderModule();const c=module.capabilities();
 assert.deepEqual(c.inputModes['plain-text'].outputShape,[1,512,4096]);
 assert.deepEqual(c.inputModes['token-ids'].outputShape,[1,'L',4096]);
 assert.equal(c.output.normalization,'umt5-final-rmsnorm-f32-v1');module.dispose();
});
test('capability request uses existing MessagePort method without moving tensor buffers',async()=>{
 const f=fixture();f.module.configure({manifest,files:f.files});
 const {port1,port2}=new MessageChannel(),hub={vae:f.module},close=bindInferencePort(port1,hub);port2.start();
 try{const answer=new Promise(resolve=>port2.addEventListener('message',e=>resolve(e.data),{once:true}));port2.postMessage({apiVersion:'works-ai-1',id:'owner',module:'vae',method:'capabilities',args:{operation:'encode',input:descriptor}});const r=await answer;assert.equal(r.ok,true);assert.equal(r.result.support.supported,true);}finally{close();port2.close();f.module.dispose();}
});
test('loaded graph must expose shape metadata and a mismatch releases session before run',async()=>{
 const m=structuredClone(manifest),bytes=new Uint8Array([1,2,3,4]);m.assets.encoder={...m.assets.encoder,bytes:4,sha256:createHash('sha256').update(bytes).digest('hex')};
 for(const metadata of [undefined,[{name:'input',type:'float32',shape:[1,3,81,480,832]}]]){
  let ran=0,released=0;
  const ort={env:{wasm:{numThreads:1}},Tensor:class{},InferenceSession:{create:async()=>({inputMetadata:metadata,outputMetadata:[{name:'output',type:'float32',shape:manifest.profile.latentShape}],run:async()=>{ran++;throw Error('must not execute');},release:async()=>{released++;}})}};
  await assert.rejects(runVae({operation:'encode',tensor:{...descriptor,meaning:'raw-decoder-rgb',data:new Float32Array(3840)},manifest:m,files:new Map([[m.assets.encoder.file,bytes]]),ort}),/metadata/);
  assert.equal(ran,0);assert.equal(released,1);
 }
});
test('descriptor-only queries reject sparse dimensions and attention masks forbidden by native tensors',()=>{
 const f=fixture();f.module.configure({manifest,files:f.files});
 for(const patch of [{shape:new Array(5)},{shape:[1,3,,16,16]},{attentionMask:[1,1,1,1,1]}]){
  const support=f.module.capabilities({operation:'encode',input:{...descriptor,...patch}}).support;
  assert.equal(support.supported,false,'Capability must agree with the actual native tensor boundary');
 }
});

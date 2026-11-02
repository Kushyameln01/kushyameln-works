// NN0: the real client/module factories with synthetic Worker messages. No model runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createInferenceClient} from '../../docs/shared/inference/client.mjs';
import {createVaeModule} from '../../docs/shared/inference/vae-api.mjs';
import {createTextEncoderModule} from '../../docs/shared/inference/text-encoder-api.mjs';
import {TEXT_ENCODER_MODEL_SHA256,UMT5_TOKENIZER_SHA256} from '../../docs/shared/inference/text-encoder.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const vaeManifest=JSON.parse(fs.readFileSync(new URL('./vae/profile.json',import.meta.url)));
const record=path=>({path,bytes:4,sha256:'a'.repeat(64)});
const textManifest={schemaVersion:1,type:'wan-umt5-staged-fp32',complete:true,
 modelSha256:TEXT_ENCODER_MODEL_SHA256,numLayers:24,hiddenSize:4096,onnxOpset:17,
 ortVersion:'1.24.3',maxTokens:512,arithmetic:'synthetic-worker-lifecycle-only',
 embedding:{dtype:'float16-le',hiddenSize:4096,vocabSize:256384,offset:0,
  sourceFile:'original.safetensors',sourceBytes:6735906897,
  rowHashes:{...record('rows.bin'),bytes:256384*32}},
 finalNorm:{...record('norm.f32'),bytes:4096*4,epsilon:1e-6},
 blocks:Array.from({length:24},(_,index)=>({...record('block'+index+'.onnx'),index})),
 tokenizer:{path:'tokenizer.model',bytes:1,sha256:UMT5_TOKENIZER_SHA256}};

class SyntheticWorker{
 constructor(){this.listeners=new Map();this.terminateCalls=0;}
 addEventListener(type,callback){const values=this.listeners.get(type)??[];values.push(callback);this.listeners.set(type,values);}
 postMessage(request){this.request=request;}
 terminate(){this.terminateCalls++;}
 succeed(result){
  const {buildId,sessionId,jobId,inputRevision}=this.request;
  const event={data:{buildId,sessionId,jobId,inputRevision,type:'success',result}};
  for(const listener of this.listeners.get('message')??[])listener(event);
 }
}

function fixture(kind){
 const workers=[];let onSuccess;
 const client=createInferenceClient({workerFactory:()=>{const worker=new SyntheticWorker();workers.push(worker);return worker;},
  onState:state=>{if(state.status==='success'&&onSuccess){const action=onSuccess;onSuccess=null;action();}}});
 const module=kind==='vae'?createVaeModule({client}):createTextEncoderModule({client});
 function configure(replacement=false){
  const manifest=structuredClone(kind==='vae'?vaeManifest:textManifest);
  if(replacement){if(kind==='vae')manifest.profile.id+='-replacement';else manifest.arithmetic+='-replacement';}
  return module.configure({manifest,files:new Map()});
 }
 configure();
 function run(operation=kind==='vae'?'decode':'encode'){
  return kind==='vae'?module[operation](operation==='encode'?
   {dtype:'float32',layout:'NCTHW',shape:[...vaeManifest.profile.videoShape],meaning:'raw-decoder-rgb',data:new Float32Array(3840)}:
   {dtype:'float32',layout:'NCTHW',shape:[...vaeManifest.profile.latentShape],meaning:'raw-posterior-mean',data:new Float32Array(128)}):
   module.encode({tokenIds:[1],attentionMask:[1]});
 }
 function result(operation=kind==='vae'?'decode':'encode'){
  if(kind==='text_encoder')return {tensor:{dtype:'float32',layout:'BLC',shape:[1,1,4096],meaning:'text_hidden_states',normalization:'umt5-final-rmsnorm-f32-v1',data:new Float32Array(4096).fill(.25)},attentionMask:Uint8Array.of(1)};
  const inputShape=operation==='encode'?vaeManifest.profile.videoShape:vaeManifest.profile.latentShape,
   outputShape=operation==='encode'?vaeManifest.profile.latentShape:vaeManifest.profile.videoShape;
  return {tensor:{dtype:'float32',layout:'NCTHW',shape:[...outputShape],meaning:operation==='encode'?'raw-posterior-mean':'raw-decoder-rgb',data:new Float32Array(outputShape.reduce((n,d)=>n*d,1)).fill(.25)},
   binding:{operation,inputShape:[...inputShape],outputShape:[...outputShape],assetsVerified:true}};
 }
 return {module,client,workers,configure,run,result,set onSuccess(action){onSuccess=action;}};
}

for(const kind of ['vae','text_encoder'])for(const action of ['reconfigure','dispose']){
 test(kind+' rejects a completed old result when success onState synchronously '+action+'s the module',async()=>{
  const f=fixture(kind);
  try{
   // Real client success ordering: clear current, terminate, invoke onState, resolve.
   f.onSuccess=()=>action==='reconfigure'?f.configure(true):f.module.dispose();
   const pending=f.run();
   const rejected=assert.rejects(pending,error=>error.name==='AbortError'&&/superseded|disposed|configuration/i.test(error.message));
   const stale=f.result();f.workers[0].succeed(stale);
   await rejected;
   assert.equal(f.workers[0].terminateCalls,1,'The completed old Worker is still terminated once');
   if(action==='reconfigure'){
    if(kind==='vae')assert.equal(f.module.capabilities().runtime.decode.verified,false,'Old binding must not mark a replacement configuration verified');
    const recovered=f.run(),fresh=f.result();f.workers[1].succeed(fresh);
    assert.equal(await recovered,fresh,'The replacement configuration remains runnable');
   }else{
    await assert.rejects(f.run(),/disposed/);assert.equal(f.workers.length,1);
   }
  }finally{f.module.dispose();}
 });
}

for(const kind of ['vae','text_encoder']){
 test(kind+' ordinary successful result retains its object, payload and binding',async()=>{
  const f=fixture(kind);
  try{
   for(const operation of kind==='vae'?['encode','decode']:['encode']){
    const pending=f.run(operation),worker=f.workers.at(-1),expected=f.result(operation),before=structuredClone(expected);
    worker.succeed(expected);const actual=await pending;
    assert.equal(actual,expected);assert.deepEqual(actual,before);assert.equal(worker.terminateCalls,1);
    if(kind==='vae')assert.equal(f.module.capabilities().runtime[operation].verified,true);
   }
  }finally{f.module.dispose();}
 });

 test(kind+' pending cancellation on reconfigure still rejects and ignores its late success',async()=>{
  const f=fixture(kind);
  try{
   const old=f.run(),rejected=assert.rejects(old,/cancelled/);f.configure(true);await rejected;
   const next=f.run();f.workers[0].succeed(f.result());
   const fresh=f.result();f.workers[1].succeed(fresh);assert.equal(await next,fresh);
   assert.equal(f.workers[0].terminateCalls,1);assert.equal(f.workers[1].terminateCalls,1);
  }finally{f.module.dispose();}
 });
}

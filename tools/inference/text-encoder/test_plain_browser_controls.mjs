// NN0 control tests. The native API/client and tensor serializer are real;
// the Worker is a lifecycle double, never numerical acceptance evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createInferenceAPI,encodeTensor} from '../../../docs/shared/inference/api.mjs';
import {validateTextEncoderInput} from '../../../docs/shared/inference/text-encoder-api.mjs';
const manifest=JSON.parse(await readFile(new URL('../../../development/inference/reference-adoption/p0/evidence/manifests/text.json',import.meta.url),'utf8'));
const code=(await readFile(new URL('./plain_browser.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');

async function harness({controlEvent,lateSuccess=false,controlOnlyFirst=false}={}){
 const clicks=[],workers=[];
 class LocalFile extends Blob{constructor(bytes,name,declaredSize){super(bytes);this.name=name;this.declaredSize=declaredSize;}get size(){return this.declaredSize??super.size;}}
 const manifestBytes=new TextEncoder().encode(JSON.stringify(manifest));
 const files=[new LocalFile([manifestBytes],'manifest.json')];
 const source=new LocalFile([],manifest.embedding.sourceFile,manifest.modelBytes);
 const digest=Buffer.from(await webcrypto.subtle.digest('SHA-256',manifestBytes)).toString('hex');
 class WorkerDouble{
  constructor(){this.handlers={};this.terminated=false;workers.push(this);}
  addEventListener(type,handler){(this.handlers[type]??=[]).push(handler);}
  emit(data){for(const handler of this.handlers.message??[])handler({data});}
  postMessage(job){
   this.job=job;
   setTimeout(()=>{
    const controlled=controlEvent&&(!controlOnlyFirst||workers.indexOf(this)===0);
    if(controlled)this.emit({plainMemory:{event:controlEvent,fileName:'block-00.onnx',requestedBytes:manifest.blocks[0].bytes}});
    if(!controlled||lateSuccess)setTimeout(()=>{
     const mask=Uint8Array.from(job.input.attentionMask),length=mask.length;
     const tensor={dtype:'float32',shape:[1,length,4096],layout:'BLC',meaning:'text_hidden_states',data:new Float32Array(length*4096),modelSha256:manifest.modelSha256,tokenizerSha256:manifest.tokenizer.sha256,normalization:'umt5-final-rmsnorm-f32-v1',attentionMask:mask};
     this.resultsDelivered=(this.resultsDelivered??0)+1;this.emit({...job,type:'success',result:{tensor,evidence:{inputMode:'token-ids',hikeContributed:true,hikeOperation:'actual encoder.final_layer_norm',sessionObservation:{created:24,released:24,active:0,maximumActive:1,runCalls:24,tensorDisposeCalls:72}}}});
    },0);
   },0);
  }
  terminate(){this.terminated=true;}
 }
 const sandbox={createInferenceAPI,encodeTensor,validateTextEncoderInput,tokenizePlainText:()=>{throw Error('No tokenizer double');},observePlainMemory:()=>({mark(){},summary(){return{};}}),document:{querySelector:id=>({files:id==='#bundle'?files:[source]}),createElement:()=>({click(){clicks.push(this.download);}})},File:LocalFile,Worker:WorkerDouble,Blob,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Int32Array,Float32Array,ArrayBuffer,Map,Set,WeakMap,JSON,structuredClone,performance,console:{log(){}},setTimeout,clearTimeout,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},DOMException};
 sandbox.globalThis=sandbox;
 vm.runInNewContext(code,sandbox,{filename:'plain_browser.mjs'});
 return{run:sandbox.runTextSuite,clicks,workers,digest};
}
const input={id:'ids-one',input:{tokenIds:[1],attentionMask:[1]},tokenIds:[1],attentionMask:[1],shape:[1,1,4096]};

test('preflight validates native ID cases and rejects mixed or empty modes before any Worker',async()=>{
 const h=await harness();
 const result=await h.run({inputs:[input],manifest,manifestSha256:h.digest,preflightOnly:true,negativeCases:[{id:'mixed',input:{text:'a',tokenIds:[1],attentionMask:[1]},expectedError:'without mixing'},{id:'empty-ids',input:{tokenIds:[],attentionMask:[]},expectedError:'Invalid text token'}]});
 assert.equal(result.passed,true,JSON.stringify(result.error));assert.equal(result.newNeuralRuns,0);
 assert.equal(result.preflight.length,1);assert.equal(result.negativeCases.length,2);
 assert.equal(h.workers.length,0);assert.deepEqual(h.clicks,[]);
});
test('preflight enforces the plan errorIncludes rejection contract',async()=>{
 const h=await harness();
 const result=await h.run({inputs:[],manifest,manifestSha256:h.digest,preflightOnly:true,negativeCases:[{id:'wrong-reason',input:{tokenIds:[],attentionMask:[]},errorIncludes:'a different required reason'}]});
 assert.equal(result.passed,false);assert.equal(result.negativeCases[0].passed,false);assert.equal(h.workers.length,0);
});

test('suite saves every native ID value with native L and one terminated owner',async()=>{
 const h=await harness();assert.equal(typeof h.run,'function','generalized suite helper missing');
 const result=await h.run({inputs:[input],manifest,manifestSha256:h.digest});
 assert.equal(result.passed,true,JSON.stringify(result.error));
 assert.deepEqual(h.clicks,['ids-one.wktensor']);assert.equal(result.cases[0].output.elements,4096);
 assert.equal(h.workers.length,1);assert.equal(h.workers[0].terminated,true);
});
test('save cancellation guards the real awaited serializer without claiming module abort',async()=>{
 const h=await harness();assert.equal(typeof h.run,'function','generalized suite helper missing');
 const result=await h.run({inputs:[input],manifest,manifestSha256:h.digest,controls:[{id:'save',caseId:input.id,action:'cancel-save'}]});
 assert.equal(result.passed,true,JSON.stringify(result.error));
 assert.equal(result.controls[0].passed,true);assert.equal(result.controls[0].published,false);
 assert.deepEqual(h.clicks,['ids-one.wktensor'],'only the numerical case may publish');
});
for(const action of ['cancel','reconfigure','dispose'])test(`${action} at an observed file boundary rejects and ignores a late native result`,async()=>{
 const h=await harness({controlEvent:'file-read-start',lateSuccess:true});assert.equal(typeof h.run,'function','generalized suite helper missing');
 const result=await h.run({inputs:[],controlInputs:[input],manifest,manifestSha256:h.digest,controls:[{id:action,caseId:input.id,action,event:'file-read-start',fileName:'block-00.onnx'}]});
 assert.equal(result.passed,true,JSON.stringify(result.error));assert.equal(result.controls[0].passed,true);
 assert.equal(result.controls[0].triggered,true);assert.equal(result.controls[0].published,false);
 assert.deepEqual(h.clicks,[]);assert.equal(h.workers[0].terminated,true);assert.equal(h.workers[0].resultsDelivered,1,'late success was actually delivered to the real client listeners');
});
test('cancelled native API recovers on its next Worker and advances revision without publishing',async()=>{
 const h=await harness({controlEvent:'ort-run-start',lateSuccess:true,controlOnlyFirst:true});
 const result=await h.run({inputs:[],controlInputs:[input],manifest,manifestSha256:h.digest,controls:[{id:'cancel-recover',caseId:input.id,action:'cancel',event:'ort-run-start',recover:true}]});
 assert.equal(result.passed,true,JSON.stringify(result.error));
 const recovery=result.controls[0].recovery;assert.ok(recovery,'same-API recovery evidence missing');
 assert.equal(recovery.passed,true);assert.equal(recovery.output.elements,4096);assert.equal(recovery.values.length,4096);
 assert.equal(recovery.stateAfter.status,'success');assert.ok(recovery.stateAfter.inputRevision>recovery.priorRevision);
 assert.equal(h.workers.length,2);assert.ok(h.workers.every(worker=>worker.terminated));assert.deepEqual(h.clicks,[]);
});

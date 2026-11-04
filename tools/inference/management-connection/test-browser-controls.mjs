// Wiring-only browser harness control test. No Worker/model/graph execution.
// Real manager/native boundaries are covered separately by test-bridge.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';

test('execution-hash progress cancels the exact managed Text job and recovers without changing the oracle record',async()=>{
 const source=(await readFile(new URL('./browser.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 const manifest={embedding:{sourceFile:'original.safetensors'},blocks:[{attentionLowering:{type:'control-only'}}]};
 const manifestBytes=new TextEncoder().encode(JSON.stringify(manifest));
 const selectedSha256=createHash('sha256').update(manifestBytes).digest('hex');
 const downloads=[],calls=[],target={requestId:'managed-text-control',activeToken:'current-token'};
 let options,disposed=false,rejectRunning,saved;
 const data=new Float32Array(4096),mask=new Uint8Array([1]);
 const tensor={dtype:'float32',layout:'BLC',shape:[1,1,4096],meaning:'text_hidden_states',data,attentionMask:mask,modelSha256:'c'.repeat(64),tokenizerSha256:'e'.repeat(64),normalization:'umt5-final-rmsnorm-f32-v1'};
 const bridge={async configure(){},querySupport(){return {support:{supported:true}};},inspect(){return {targets:[{module:'text_encoder',operation:'encode',target}]};},async execute(request){
  calls.push(request);
  if(calls.length===1)return new Promise((_resolve,reject)=>{
   rejectRunning=reject;queueMicrotask(()=>{
    options.onState({module:'text_encoder',progress:{stage:'text-block',completed:0}});
    assert.equal(calls.length,1);assert.equal(bridge.cancelCalls,undefined,'unrelated progress must not cancel');
    options.onState({module:'text_encoder',progress:{stage:'sdpa-execution-graph-hash',completedBytes:1048576}});
   });
  });
  return {native:{tensor,inputMode:request.input.text!==undefined?'plain-text':'token-ids'},record:{tensor,trace:{records:[{data:{native:{}}}]}},inputRecord:null};
 },async cancel(actual){assert.deepEqual(JSON.parse(JSON.stringify(actual)),target);this.cancelCalls=(this.cancelCalls??0)+1;rejectRunning(Object.assign(Error('native stopped'),{code:'INVOCATION_CANCELLED'}));await Promise.resolve();return {originalTerminal:true,resourceReleased:true,reusable:true};},async save({records}){saved=records;return {bytes:new Uint8Array([1]),receipt:{scope:'control-only'}};},async read(){return {artifacts:saved};},async dispose(){disposed=true;return {disposed:true};}};
 const files={'#text-bundle':[{name:'manifest.json',text:async()=>JSON.stringify(manifest),arrayBuffer:async()=>manifestBytes.buffer}], '#text-source':[{name:'original.safetensors',size:1}]};
 const sandbox={structuredClone,Uint8Array,Float32Array,ArrayBuffer,Blob,TextEncoder,Map,performance,crypto:webcrypto,
  console:{log(){}},setTimeout:callback=>{callback();return 0;},URL:{createObjectURL:()=> 'blob:control',revokeObjectURL(){}},
  document:{querySelector:id=>({files:files[id]}),createElement:()=>({click(){downloads.push(this.download);}})},
  fetch:async()=>({ok:true,arrayBuffer:async()=>data.buffer}),native:{createInferenceAPI(value){options=value;return {get state(){return {status:disposed?'disposed':'idle'};}};},describeTensor:({data,...metadata})=>metadata,encodeTensor:async()=>new Uint8Array([1])},
  createManagedInferenceBridge:()=>bridge,createCurrentNativeCodec:()=>({}),createTextVaeAdapter(){},createInvocationQueue(){},artifacts:{},workspace:{},diffusion:{snapshotP4CapturedConditioning:x=>x},captureRestoredConditioning:({record})=>({...record.tensor,rows:1,metadata:{nativeTensorMetadata:{normalization:record.tensor.normalization},verification:{realExecutionVerified:false}}})};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 const plainInput={text:'Hello world',tokenIds:[1],attentionMask:[1],manifestSha256:'old-independent-manifest'};
 const original=structuredClone(plainInput);
 const result=await sandbox.runManagementConnection({scope:'text',executionSourceSha:'a'.repeat(40),managementSourceSha:'b'.repeat(40),diffusionSourceSha:'c'.repeat(40),plainInput,textManifestMapping:{originalSha256:plainInput.manifestSha256,selectedSha256},textCancelStage:'sdpa-execution-graph-hash',textGate:{atol:.001,rtol:.001,maxAbs:.001}});
 assert.equal(result.passed,true,JSON.stringify(result.failure));assert.equal(bridge.cancelCalls,1);
 assert.equal(result.textCancel.boundary.stage,'sdpa-execution-graph-hash');assert.equal(result.textCancel.barrier.resourceReleased,true);
 assert.equal(result.textCancel.recoveredBy,'text-plain');assert.equal(calls.length,3);assert.equal(disposed,true);
 assert.deepEqual(plainInput,original);assert.equal(downloads.length,4);
});

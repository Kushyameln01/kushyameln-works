// NN0 contract/lifetime tests. Model/tokenizer calls are interface doubles;
// saved native fixtures supply the unchanged result contract and input vectors.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {validateTextEncoderInput} from '../../../docs/shared/inference/text-encoder-api.mjs';
const fixture=JSON.parse(await readFile(new URL('../../../development/inference/p2-p3-acceptance/plain/evidence/plain-input.json',import.meta.url),'utf8'));
const manifest=JSON.parse(await readFile(new URL('../../../development/inference/reference-adoption/p0/evidence/manifests/text.json',import.meta.url),'utf8'));
async function harness({failure}={}){
 let source;try{source=await readFile(new URL('../../../docs/shared/inference/text-job.mjs',import.meta.url),'utf8');}catch{}
 assert.equal(typeof source,'string','Shared runTextEncoderJob implementation is required');
 const calls={loads:[],runs:[],tokenizes:[],disposed:0,hikeDisposed:0},data=new Float32Array(512*4096),mask=Uint8Array.from(fixture.attentionMask),provenance={modelSha256:manifest.modelSha256,tokenizerSha256:manifest.tokenizer.sha256,hikeContributed:true,hikeOperation:'actual encoder.final_layer_norm'};
 const output={hiddenStates:data,shape:[1,512,4096],attentionMask:mask,normalization:'umt5-final-rmsnorm-f32-v1',provenance};
 const hike={stats:()=>({calls:1}),dispose(){calls.hikeDisposed++;}};
 const sandbox={validateTextEncoderInput,loadTextEncoder:async options=>{calls.loads.push(options);return{run:async input=>{calls.runs.push(input);if(failure)throw failure;return output;},dispose:async()=>{calls.disposed++;}};},tokenizePlainText:async(text,bytes)=>{calls.tokenizes.push({text,bytes});return{tokenIds:Int32Array.from(fixture.tokenIds),attentionMask:Uint8Array.from(fixture.attentionMask),tokenizerSha256:manifest.tokenizer.sha256,effectiveTokens:fixture.effectiveTokens,semantics:'fixture plain SentencePiece'};},Uint8Array,Int32Array,Float32Array,Map,DOMException};sandbox.globalThis=sandbox;
 vm.runInNewContext(source.replace(/^import .*;\n/gm,'').replace('export async function runTextEncoderJob','async function runTextEncoderJob')+'\nglobalThis.job=runTextEncoderJob;',sandbox);
 return{run:sandbox.job,calls,hike,output};
}
test('shared Text job preserves the normal result contract and disposes only its model',async()=>{
 const h=await harness(),signal=new AbortController().signal,onProgress=()=>{},files=new Map();
 const result=await h.run({input:{tokenIds:fixture.tokenIds,attentionMask:fixture.attentionMask},manifest,files,ort:{fixture:true},hike:h.hike,signal,onProgress});
 assert.deepEqual(Object.keys(result).sort(),['attentionMask','inputMode','tensor']);assert.equal(result.inputMode,'token-ids');assert.equal(result.evidence,undefined);
 assert.equal(result.tensor.data,h.output.hiddenStates);assert.equal(result.tensor.attentionMask,h.output.attentionMask);assert.equal(result.attentionMask,h.output.attentionMask);assert.equal(result.tensor.modelSha256,manifest.modelSha256);assert.equal(result.tensor.tokenizerSha256,manifest.tokenizer.sha256);assert.equal(result.tensor.normalization,h.output.normalization);assert.equal(result.tensor.layout,'BLC');assert.equal(result.tensor.meaning,'text_hidden_states');assert.deepEqual(Array.from(result.tensor.shape),[1,512,4096]);
 assert.equal(h.calls.loads[0].signal,signal);assert.equal(h.calls.runs[0].signal,signal);assert.equal(h.calls.loads[0].onProgress,onProgress);assert.equal(h.calls.runs[0].onProgress,onProgress);assert.equal(h.calls.disposed,1);assert.equal(h.calls.hikeDisposed,0);
});
test('plain job uses the tokenizer and exposes evidence only when diagnostics is explicit',async()=>{
 for(const diagnostics of [false,true]){
  const h=await harness(),bytes=Uint8Array.of(1,2),files=new Map([[manifest.tokenizer.path,bytes]]),result=await h.run({input:{text:fixture.text},manifest,files,ort:{},hike:h.hike,diagnostics});
  assert.equal(result.inputMode,'plain-text');assert.equal(h.calls.tokenizes.length,1);assert.equal(h.calls.tokenizes[0].text,fixture.text);assert.equal(h.calls.tokenizes[0].bytes,bytes);assert.deepEqual(Array.from(h.calls.runs[0].tokenIds),fixture.tokenIds);assert.deepEqual(Array.from(h.calls.runs[0].attentionMask),fixture.attentionMask);
  if(diagnostics){assert.equal(result.evidence.hikeContributed,true);assert.equal(result.evidence.inputMode,'plain-text');assert.equal(result.evidence.tokenizer.sha256,manifest.tokenizer.sha256);assert.equal(result.evidence.tokenizer.effectiveTokens,fixture.effectiveTokens);assert.equal(result.evidence.hikeStats.calls,1);}else assert.equal(result.evidence,undefined);
  assert.equal(h.calls.disposed,1);assert.equal(h.calls.hikeDisposed,0);
 }
});
test('job disposes its model after a run failure and keeps caller Hike ownership',async()=>{
 const failure=Error('injected run failure'),h=await harness({failure});await assert.rejects(h.run({input:{tokenIds:[1],attentionMask:[1]},manifest,files:new Map(),ort:{},hike:h.hike}),error=>error===failure);assert.equal(h.calls.disposed,1);assert.equal(h.calls.hikeDisposed,0);
});
test('job reuses strict public input validation before model loading',async()=>{
 const h=await harness();await assert.rejects(h.run({input:{text:'x',tokenIds:[1],attentionMask:[1]},manifest,files:new Map(),ort:{},hike:h.hike}),/without mixing/);assert.equal(h.calls.loads.length,0);assert.equal(h.calls.runs.length,0);assert.equal(h.calls.disposed,0);
});

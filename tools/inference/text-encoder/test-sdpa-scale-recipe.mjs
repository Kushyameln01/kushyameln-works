import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';

const moduleUrl=new URL('../../../docs/shared/inference/text-attention-lowering.mjs',import.meta.url);
assert.ok(existsSync(moduleUrl),'Missing in-place SDPA diagnostic recipe applicator');
const {applySdpaScaleRecipeInPlace}=await import(moduleUrl);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const original=Uint8Array.from([9,9,0,0,0,63,9,9,9,9,0,0,128,63,9,9]);
const expected=Uint8Array.from([9,9,0,0,0,0,9,9,9,9,0,0,0,65,9,9]);
function recipe(bytes=original){return {schemaVersion:1,type:'umt5-sdpa-scale-cancellation-candidate-v1',status:'diagnostic-only-unaccepted',
 index:0,path:'block-00.onnx',sourceAsset:{bytes:bytes.length,sha256:digest(bytes)},executedGraphSha256:digest(expected),patches:[
 {offset:2,beforeHex:'0000003f',afterHex:'00000000',nodeName:'/block/layer.0/SelfAttention/Constant_16'},
 {offset:10,beforeHex:'0000803f',afterHex:'00000041',nodeName:'/block/layer.0/SelfAttention/Constant_26'}]};}

const bytes=new Uint8Array(original);
const receipt=await applySdpaScaleRecipeInPlace(bytes,recipe());
assert.deepEqual(bytes,expected,'Only the two float32 scalar payloads may change');
assert.equal(receipt.sourceAssetSha256,digest(original));
assert.equal(receipt.executedGraphSha256,digest(expected));
assert.notEqual(receipt.executedGraphSha256,receipt.sourceAssetSha256);
assert.equal(receipt.status,'diagnostic-only-unaccepted');
assert.equal(receipt.newExports,0);

const wrong=new Uint8Array(original);wrong[2]=1;
await assert.rejects(applySdpaScaleRecipeInPlace(wrong,recipe()),/asset.*hash/i);
assert.equal(wrong[2],1,'Failed source verification must not mutate graph bytes');

const wrongPayload=new Uint8Array(original);wrongPayload[2]=1;
await assert.rejects(applySdpaScaleRecipeInPlace(wrongPayload,recipe(wrongPayload)),/payload/i);
assert.equal(wrongPayload[5],63);

const wrongExecution=new Uint8Array(original),wrongExecutionRecipe=recipe();wrongExecutionRecipe.executedGraphSha256='0'.repeat(64);
await assert.rejects(applySdpaScaleRecipeInPlace(wrongExecution,wrongExecutionRecipe),/execution.*hash/i);
assert.deepEqual(wrongExecution,original,'Wrong executed-graph hash must restore original bytes');

const cancelled=new Uint8Array(original),controller=new AbortController();
await assert.rejects(applySdpaScaleRecipeInPlace(cancelled,recipe(),{signal:controller.signal,onProgress:event=>{
 if(event.stage==='sdpa-execution-graph-hash')controller.abort(new DOMException('operator diagnostic cancelled','AbortError'));
}}),/cancelled/);
assert.deepEqual(cancelled,original,'Cancellation after mutation must restore the original two payloads');
console.log('PASS SDPA in-place candidate identity, asset/execution hashes, rejection and cancellation (NN0)');

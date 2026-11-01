import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_MODEL_HASHES} from '../lora/weights.mjs';
import {WAN_TEXT_ENCODER_SHA256} from '../tensor-interop.mjs';
import {P4_INPUT_SEMANTICS} from './capabilities.mjs';
import * as normal from './p4.mjs';
function input(){return {residual:{...P4_INPUT_SEMANTICS.residual,data:new Float32Array(10240).fill(0.25)},timeAct1:{...P4_INPUT_SEMANTICS.timeAct1,data:new Float32Array(5120).fill(0.5)},conditioning:{...P4_INPUT_SEMANTICS.conditioning,shape:[1,1,4096],data:new Float32Array(4096).fill(0.125),attentionMask:new Uint8Array([1]),modelSha256:WAN_TEXT_ENCODER_SHA256,tokenizerSha256:'e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458',payloadSHA256:'arbitrary diagnostic identity, not a compatibility gate'}};}
const model={side:'LOW',modelSha256:BASE_MODEL_HASHES.LOW};
test('normal P4 owns nonfixture tensors without payload/receipt admission',()=>{
 assert.equal(typeof normal.snapshotNormalP4Inputs,'function');
 const x=input(),owned=normal.snapshotNormalP4Inputs(x,model);x.residual.data.fill(99);x.timeAct1.data.fill(99);x.conditioning.data.fill(99);
 assert.equal(owned.residual[0],0.25);assert.equal(owned.timeAct1[0],0.5);assert.equal(owned.conditioning.data[0],0.125);assert.equal(owned.conditioning.rows,1);
 assert.equal(owned.conditioning.metadata.nativeTensorMetadata.payloadSHA256,'arbitrary diagnostic identity, not a compatibility gate');
});
test('normal P4 rejects wrong shape, meaning, normalization, model and nonfinite payload',()=>{
 for(const change of [x=>x.residual.shape=[3,5120],x=>x.contextLatents=[{}],x=>x.timeAct1.normalization='other',x=>x.residual.meaning='raw-posterior-mean',x=>x.model={side:'HIGH'},x=>x.conditioning.data[0]=NaN,x=>x.conditioning.data=new Float64Array(4096)]){
  const x=input();change(x);assert.throws(()=>normal.snapshotNormalP4Inputs(x,model));
 }
});
test('normal snapshot aborts before copying and rejects shared mutable arrays',()=>{
 const c=new AbortController();c.abort();assert.throws(()=>normal.snapshotNormalP4Inputs(input(),model,{signal:c.signal}),{name:'AbortError'});
 const x=input();x.residual.data=new Float32Array(new SharedArrayBuffer(40960));assert.throws(()=>normal.snapshotNormalP4Inputs(x,model),/F32/);
});

test('canonical descriptor inputs and flat inputs use the same normal ingress',()=>{
 const flat=input(),canonical={operation:'postSelfAttention',model,inputs:flat};
 assert.deepEqual(normal.snapshotNormalP4Inputs(canonical,model),normal.snapshotNormalP4Inputs(flat,model));
 assert.throws(()=>normal.snapshotNormalP4Inputs({...canonical,residual:flat.residual},model),/not both/);
});

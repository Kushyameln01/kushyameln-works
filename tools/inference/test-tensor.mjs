import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
let io;try{io=await import('../../docs/shared/inference/tensor.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
assert.equal(typeof io?.encodeTensor,'function','Actual tensor interchange API missing');
const input={dtype:'float32',shape:[1,2,2],layout:'BLC',meaning:'text_hidden_states',data:Float32Array.of(.25,-1,3,7),modelSha256:'a'.repeat(64),attentionMask:Uint8Array.of(1,0)};
const encoded=await io.encodeTensor(input);const decoded=await io.decodeTensor(encoded);
assert.deepEqual(decoded.shape,[1,2,2]);assert.equal(decoded.meaning,'text_hidden_states');assert.deepEqual(Array.from(decoded.data),[.25,-1,3,7]);
assert.equal(decoded.modelSha256,input.modelSha256);assert.notEqual(decoded.data.buffer,input.data.buffer);
assert.deepEqual(Array.from(decoded.attentionMask??[]),[1,0]);
// Buffer.slice() returns a view, unlike Uint8Array.slice(). Payload ownership and
// exact boundaries must survive filesystem Buffers and nonzero-offset views.
const bufferBacking=Buffer.alloc(encoded.byteLength+34,0xa5);bufferBacking.set(encoded,17);
const arrayBacking=new Uint8Array(encoded.byteLength+14).fill(0x5a);arrayBacking.set(encoded,7);
for(const source of [Buffer.from(encoded),bufferBacking.subarray(17,17+encoded.byteLength),arrayBacking.subarray(7,7+encoded.byteLength)]){
 const restored=await io.decodeTensor(source);
 assert.deepEqual(Array.from(restored.data),Array.from(input.data),'payload must exclude Buffer/slab prefix and suffix');
 assert.deepEqual(Array.from(restored.attentionMask),[1,0]);
 assert.deepEqual(restored.shape,input.shape);assert.equal(restored.modelSha256,input.modelSha256);
 assert.notEqual(restored.data.buffer,source.buffer,'decoded tensor must own its exact payload copy');
 assert.equal(restored.data.buffer.byteLength,input.data.byteLength);
}
await assert.rejects(io.encodeTensor({...input,shape:[1,2,3]}));
await assert.rejects(io.encodeTensor({...input,data:Float64Array.of(1,2,3,4)}));
await assert.rejects(io.encodeTensor({...input,data:Float32Array.of(NaN,1,2,3)}));
const corrupt=encoded.slice();corrupt[corrupt.length-1]^=1;await assert.rejects(io.decodeTensor(corrupt));
await assert.rejects(io.decodeTensor(encoded.subarray(0,encoded.length-1)));
const headerLength=new DataView(encoded.buffer).getUint32(8,true),metadata=JSON.parse(new TextDecoder().decode(encoded.subarray(12,12+headerLength)));
metadata.attentionMask=[257,0];const changedHeader=new TextEncoder().encode(JSON.stringify(metadata));const changed=new Uint8Array(12+changedHeader.length+encoded.length-12-headerLength);changed.set(encoded.subarray(0,8));new DataView(changed.buffer).setUint32(8,changedHeader.length,true);changed.set(changedHeader,12);changed.set(encoded.subarray(12+headerLength),12+changedHeader.length);
await assert.rejects(io.decodeTensor(changed));
assert.throws(()=>io.requireTensor(decoded,{meaning:'vae_latent',layout:'NCTHW'}));
assert.doesNotThrow(()=>io.requireTensor(decoded,{meaning:'text_hidden_states',layout:'BLC'}));
console.log('PASS: tensor binary, dtype/shape/hash, semantic connection checks');

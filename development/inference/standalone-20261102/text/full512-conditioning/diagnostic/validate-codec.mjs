// NN0 fixture validation only. Ordinary consumers need conditioning.wktensor.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {decodeTensor,encodeTensor,describeTensor} from '../../../../../../docs/shared/inference/tensor.mjs';
const root=new URL('../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(new URL('manifest.json',root))),raw=await readFile(new URL('conditioning.wktensor',root));
const tensor=await decodeTensor(raw),descriptor=describeTensor(tensor);
assert.deepEqual(tensor.shape,[1,512,4096]);assert.equal(tensor.dtype,'float32');assert.equal(tensor.layout,'BLC');assert.equal(tensor.meaning,'text_hidden_states');
assert.equal(tensor.normalization,'umt5-final-rmsnorm-f32-v1');assert.equal(tensor.modelSha256,manifest.tensorContract.modelSha256);assert.equal(tensor.tokenizerSha256,manifest.tensorContract.tokenizerSha256);
assert.equal(tensor.attentionMask.length,512);assert.ok(tensor.attentionMask.every(x=>x===1));
const headerLength=raw.readUInt32LE(8),payload=raw.subarray(12+headerLength),nativeBytes=new Uint8Array(tensor.data.buffer,tensor.data.byteOffset,tensor.data.byteLength);
assert.equal(payload.byteLength,8388608);assert.equal(Buffer.compare(payload,nativeBytes),0);assert.equal(sha(payload),manifest.tensorContract.dataSha256);
const encoded=await encodeTensor(tensor),restored=await decodeTensor(encoded);
assert.equal(Buffer.compare(raw,encoded),0);assert.ok(isDeepStrictEqual(descriptor,describeTensor(restored)));
assert.equal(Buffer.compare(nativeBytes,new Uint8Array(restored.data.buffer,restored.data.byteOffset,restored.data.byteLength)),0);
assert.notEqual(tensor.data.buffer,raw.buffer);assert.notEqual(restored.data.buffer,tensor.data.buffer);assert.notEqual(restored.attentionMask.buffer,tensor.attentionMask.buffer);
if(process.argv.includes('--files'))for(const file of manifest.files){const bytes=await readFile(new URL(file.path,root));assert.equal(bytes.byteLength,file.bytes,file.path);assert.equal(sha(bytes),file.sha256,file.path);}
const codec=await readFile(new URL('../../../../../../docs/shared/inference/tensor.mjs',import.meta.url));
console.log(JSON.stringify({schemaVersion:1,scope:'Native codec save/read validation of one existing fixture; no model execution',nnExecutions:0,passed:true,elements:2097152,allValueBitsCompared:true,allMaskEntriesCompared:512,allMaskEntriesActive:true,descriptorAndNormalizationPreserved:true,ownedPayloadAndMask:true,wholeWktReencodeBitwiseIdentical:true,wkt:{bytes:raw.byteLength,sha256:sha(raw)},payload:{bytes:payload.byteLength,sha256:sha(payload)},codec:{path:'docs/shared/inference/tensor.mjs',bytes:codec.byteLength,sha256:sha(codec)},listedFilesVerified:process.argv.includes('--files')?manifest.files.length:0},null,2));

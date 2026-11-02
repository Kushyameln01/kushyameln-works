// NN0: real native tensor codec and temporal metadata, with small arrays only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {encodeTensor,decodeTensor,requireTensor,describeTensor,snapshotTensorMetadata} from '../../docs/shared/inference/tensor.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const context=frames=>({schemaVersion:1,contextId:'temporal-source',inputId:'video-input',inputSha256:'a'.repeat(64),slotId:'source-video',sourceFrameIndices:Array.from({length:frames},(_,i)=>100+i),sourceFrameTimesSeconds:Array.from({length:frames},(_,i)=>i/24)});
function tensor(sourceFrames,{meaning='raw-posterior-mean',decoded=false}={}){
 const latentFrames=1+Math.floor((sourceFrames-1)/4),consumedFrames=1+4*(latentFrames-1),rgb=['raw-decoder-rgb','rgb-unit'].includes(meaning),frames=rgb?(decoded?consumedFrames:sourceFrames):latentFrames,channels=rgb?3:16;
 return{dtype:'float32',layout:'NCTHW',meaning,shape:[1,channels,frames,1,1],data:Float32Array.from({length:channels*frames},(_,i)=>(i%17-8)/16),modelSha256:'b'.repeat(64),context:context(decoded?consumedFrames:sourceFrames),frameProcessing:{schemaVersion:1,policy:'wan21-causal-floor-v1',sourceFrames,latentFrames,consumedFrames,unusedTailFrames:sourceFrames-consumedFrames,sourceContext:context(sourceFrames)}};
}
function withHeader(bytes,change){
 const length=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,true),header=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+length)));change(header);
 const encoded=new TextEncoder().encode(JSON.stringify(header)),result=new Uint8Array(12+encoded.length+bytes.length-12-length);result.set(bytes.subarray(0,8));new DataView(result.buffer).setUint32(8,encoded.length,true);result.set(encoded,12);result.set(bytes.subarray(12+length),12+encoded.length);return result;
}

test('F4 and F80 roundtrip retain original frames, processed prefix, timestamps and every value',async()=>{
 for(const sourceFrames of [4,80])for(const meaning of ['raw-posterior-mean','wan21-raw-latent:v1','raw-decoder-rgb','rgb-unit'])for(const decoded of [false,true]){
  const input=tensor(sourceFrames,{meaning,decoded}),output=await decodeTensor(await encodeTensor(input));
  assert.deepEqual(output.frameProcessing,input.frameProcessing,'temporal accounting must survive WKT alone');assert.deepEqual(output.context,input.context);assert.deepEqual(output.data,input.data);
  assert.equal(output.frameProcessing.consumedFrames,sourceFrames===4?1:77);assert.equal(output.frameProcessing.unusedTailFrames,3);
  assert.equal(output.frameProcessing.sourceContext.sourceFrameIndices.length,sourceFrames);assert.equal(output.context.sourceFrameIndices.length,decoded?output.frameProcessing.consumedFrames:sourceFrames);
 }
});

test('normalized mean WKT preserves the supplied marker and native temporal mapping together',async()=>{
 for(const sourceFrames of [4,80]){
  const input=tensor(sourceFrames,{meaning:'wan21-normalized-posterior-mean:v1'});
  input.normalization='wan21-comfy-f32-v1';
  const expected=structuredClone(input),pending=encodeTensor(input);
  input.normalization='mutated-after-call';input.frameProcessing.sourceContext.sourceFrameIndices[0]=999;input.data[0]=999;
  const output=await decodeTensor(await pending);
  assert.equal(output.meaning,expected.meaning);assert.equal(output.normalization,expected.normalization);
  assert.deepEqual(output.frameProcessing,expected.frameProcessing);assert.deepEqual(output.context,expected.context);assert.deepEqual(output.data,expected.data);
 }
 const markerless=tensor(4,{meaning:'wan21-normalized-posterior-mean:v1'});
 assert.equal((await decodeTensor(await encodeTensor(markerless))).normalization,undefined,'No normalization marker may be invented');
 const contradictory={...markerless,normalization:'unsupported-rule'};
 assert.throws(()=>requireTensor(contradictory),/normalization marker/);
});

test('restored generated sample retains frameProcessing without weakening producer or restoration checks',async()=>{
 const input=tensor(81,{meaning:'wan21-raw-generated-sample:v1'});
 input.latentContract={schemaVersion:1,representation:'generated-sample',space:'raw',vaeModelSha256:'c'.repeat(64),producerModelSha256s:[input.modelSha256,'d'.repeat(64)],normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}};
 const output=await decodeTensor(await encodeTensor(input));
 assert.equal(output.meaning,input.meaning);assert.deepEqual(output.frameProcessing,input.frameProcessing);assert.deepEqual(output.context,input.context);assert.deepEqual(output.latentContract,input.latentContract);assert.deepEqual(output.data,input.data);
 for(const change of [t=>{delete t.latentContract;},t=>{t.latentContract.normalization.state='normalized';},t=>{t.latentContract.normalization.owner='vae';},t=>{t.latentContract.producerModelSha256s=[t.latentContract.vaeModelSha256];},t=>{t.modelSha256='e'.repeat(64);},t=>{t.normalization='wan21-comfy-f32-v1';}]){
  const candidate=structuredClone(input);change(candidate);assert.throws(()=>requireTensor(candidate),undefined,change.toString());
 }
});

test('async codec snapshots owned nested temporal mappings before digest yields',async()=>{
 const input=tensor(80,{meaning:'raw-decoder-rgb',decoded:true}),original=structuredClone(input),pending=encodeTensor(input);
 input.frameProcessing.sourceFrames=1;input.frameProcessing.sourceContext.sourceFrameIndices[0]=999;input.frameProcessing.sourceContext.sourceFrameTimesSeconds[0]=999;input.context.sourceFrameIndices[0]=888;input.context.sourceFrameTimesSeconds[0]=888;input.data[0]=999;
 const output=await decodeTensor(await pending);assert.deepEqual(output.frameProcessing,original.frameProcessing);assert.deepEqual(output.context,original.context);assert.deepEqual(output.data,original.data);
 const source=tensor(4),snapshot=snapshotTensorMetadata(source),descriptor=describeTensor(source);
 assert.notEqual(snapshot.frameProcessing,source.frameProcessing);assert.notEqual(snapshot.frameProcessing.sourceContext,source.frameProcessing.sourceContext);assert.notEqual(descriptor.frameProcessing.sourceContext.sourceFrameIndices,source.frameProcessing.sourceContext.sourceFrameIndices);
 snapshot.frameProcessing.sourceContext.sourceFrameIndices[0]=777;assert.equal(source.frameProcessing.sourceContext.sourceFrameIndices[0],100);
});

test('temporal plan rejects wrong formulas, shapes, unsupported types and unknown fields',()=>{
 const mutations=[t=>{t.frameProcessing=null;},t=>{t.frameProcessing.extra='unknown';},t=>{t.frameProcessing.schemaVersion=2;},t=>{t.frameProcessing.policy='round-up';},t=>{t.frameProcessing.sourceFrames=0;},t=>{t.frameProcessing.sourceFrames=82;},t=>{t.frameProcessing.latentFrames=0;},t=>{t.frameProcessing.latentFrames=22;},t=>{t.frameProcessing.latentFrames=1.5;},t=>{t.frameProcessing.consumedFrames=76;},t=>{t.frameProcessing.unusedTailFrames=2;},t=>{t.frameProcessing.sourceFrames=81;t.frameProcessing.unusedTailFrames=4;},t=>{t.shape=[1,16,19,1,1];},t=>{t.shape=[1,3,20,1,1];},t=>{t.shape=[2,16,20,1,1];},t=>{t.layout='BLC';},t=>{t.dtype='int32';},t=>{t.meaning='text_hidden_states';},t=>{t.frameProcessing.sourceContext.sourceFrameIndices.pop();t.frameProcessing.sourceContext.sourceFrameTimesSeconds.pop();},t=>{t.frameProcessing.sourceContext.managementId='extra';},t=>{t.frameProcessing.sourceContext.sourceFrameTimesSeconds[0]=NaN;},t=>{t.frameProcessing.sourceContext.sourceFrameIndices[0]=-1;}];
 for(const mutate of mutations){const input=tensor(80);mutate(input);assert.throws(()=>requireTensor(input),undefined,mutate.toString());}
 for(const key of ['sourceFrames','latentFrames','consumedFrames','unusedTailFrames'])for(const value of [true,NaN,1.5,Infinity]){const input=tensor(80);input.frameProcessing[key]=value;assert.throws(()=>snapshotTensorMetadata(input));}
 for(const [meaning,shape] of [['raw-posterior-mean',[1,16,19,1,1]],['wan21-raw-latent:v1',[1,3,20,1,1]],['raw-decoder-rgb',[1,16,77,1,1]],['rgb-unit',[1,3,78,1,1]]]){const input=tensor(80);input.meaning=meaning;input.shape=shape;assert.throws(()=>snapshotTensorMetadata(input));}
 const rgb=tensor(80,{meaning:'rgb-unit'});rgb.shape=[1,3,78,1,1];rgb.data=new Float32Array(3*78);assert.throws(()=>requireTensor(rgb));
});

test('causal boundary counts preserve frame order and duplicates without requiring an outer context',async()=>{
 for(const [source,latent,consumed,tail] of [[1,1,1,0],[2,1,1,1],[3,1,1,2],[4,1,1,3],[5,2,5,0],[80,20,77,3],[81,21,81,0]]){
  const input=tensor(source);delete input.context;if(source>1)input.frameProcessing.sourceContext.sourceFrameIndices[1]=100;
  const output=await decodeTensor(await encodeTensor(input));assert.deepEqual([output.frameProcessing.sourceFrames,output.frameProcessing.latentFrames,output.frameProcessing.consumedFrames,output.frameProcessing.unusedTailFrames],[source,latent,consumed,tail]);assert.deepEqual(output.frameProcessing.sourceContext,input.frameProcessing.sourceContext);assert.equal(output.context,undefined);
 }
 const batch=tensor(4);batch.shape[0]=2;batch.data=new Float32Array(32);assert.deepEqual((await decodeTensor(await encodeTensor(batch))).shape,batch.shape);
});

test('direct temporal metadata validation rejects sparse tensor dimensions',()=>{
 for(const index of [0,3,4]){const input=tensor(80);delete input.shape[index];assert.throws(()=>snapshotTensorMetadata(input));}
});

test('optional source context is accepted and malformed decoded frameProcessing is rejected',async()=>{
 const input=tensor(4);delete input.frameProcessing.sourceContext;assert.deepEqual((await decodeTensor(await encodeTensor(input))).frameProcessing,input.frameProcessing);
 const bytes=await encodeTensor(tensor(80));
 for(const alter of [h=>{h.frameProcessing={unknown:true};},h=>{h.frameProcessing.unusedTailFrames=4;},h=>{h.frameProcessing.sourceContext.sourceFrameIndices.pop();}])await assert.rejects(decodeTensor(withHeader(bytes,alter)));
});

test('legacy raw tensor bytes remain identical when frameProcessing is absent',async()=>{
 const input=tensor(4);delete input.frameProcessing;
 const payload=new Uint8Array(input.data.buffer),header={schemaVersion:1,dtype:input.dtype,shape:input.shape,layout:input.layout,meaning:input.meaning,byteOrder:'little',byteLength:payload.byteLength,dataSha256:createHash('sha256').update(payload).digest('hex'),modelSha256:input.modelSha256,context:input.context},encoded=new TextEncoder().encode(JSON.stringify(header)),legacy=new Uint8Array(12+encoded.length+payload.length);
 legacy.set(new TextEncoder().encode('WKTSR001'));new DataView(legacy.buffer).setUint32(8,encoded.length,true);legacy.set(encoded,12);legacy.set(payload,12+encoded.length);
 assert.deepEqual(await encodeTensor(input),legacy);const output=await decodeTensor(legacy);assert.equal(output.frameProcessing,undefined);assert.deepEqual(output.data,input.data);
});

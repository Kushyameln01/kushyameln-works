import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {REAL_TEXT_BINDING,OUTPUT_SHAPES,verifyP4RealTextBinding,runP4RealTextL512,streamP4OutputBytes} from './run.mjs';
import {outputIdentities} from '../p4-cross-ffn/run.mjs';

assert.equal(Object.keys(OUTPUT_SHAPES).length,25);
assert.equal(Object.values(OUTPUT_SHAPES).reduce((n,s)=>n+s.reduce((a,b)=>a*b,1)*4,0),63709184);
for(const name of ['textLinear0','textGelu','textEmbedded','qkvK','qkvV','normK'])assert.deepEqual(OUTPUT_SHAPES[name],[512,5120]);
const names=['compile','compileStreaming','instantiate','instantiateStreaming','Instance'],originals=new Map(names.map(name=>[name,WebAssembly[name]]));let nativeCalls=0;
for(const name of names)WebAssembly[name]=new Proxy(WebAssembly[name],{apply(){nativeCalls++;throw Error('Native construction forbidden during admission test');},construct(){nativeCalls++;throw Error('Native construction forbidden during admission test');}});
try{
 await assert.rejects(()=>runP4RealTextL512(null,{nativeInputText:'{}',inputBindings:{}}),/native Text file SHA256/);
 await assert.rejects(()=>verifyP4RealTextBinding(null,{}),/JSON text/);
 const path=process.env.P4_REAL_TEXT_NATIVE_INPUT??'/tmp/p4-real-text-l512/inputs/real-text-l512-native.json';
 if(existsSync(path)){
  const text=readFileSync(path,'utf8'),bindings=Object.fromEntries(['nativeTextArtifactSHA256','conditioningDataSHA256','conditioningMaskSHA256'].map(key=>[key,REAL_TEXT_BINDING[key]]));
  const admitted=await verifyP4RealTextBinding(text,bindings);
  assert.deepEqual(admitted.tensor.shape,[1,512,4096]);assert.equal(admitted.tensor.data.length,2097152);assert.equal(admitted.tensor.attentionMask.length,512);
  assert.equal(admitted.proof.maskApplied,false);assert.equal(admitted.proof.activeMaskEntries,3);
  for(const change of [p=>p.shape[1]=4,p=>p.modelSha256='0'.repeat(64),p=>p.tokenizerSha256=null,p=>p.attentionMask[3]=1,p=>p.producer.sourceCommit='0'.repeat(40),p=>p.data[0]+=1,p=>p.nativeTensorMetadata.meaning='other',p=>p.nativeTensorHeaderBase64='AAAA',p=>p.sourcePacket.payloadSHA256='0'.repeat(64)]){
   const bad=JSON.parse(text);change(bad);await assert.rejects(()=>runP4RealTextL512(null,{nativeInputText:JSON.stringify(bad),inputBindings:bindings}),/native Text file SHA256/);
  }
  await assert.rejects(()=>verifyP4RealTextBinding(text,{...bindings,conditioningMaskSHA256:'0'.repeat(64)}),/declared input binding/);
 }else console.log('Private frozen input unavailable: portable fail-closed checks only');
 assert.equal(nativeCalls,0);
}finally{for(const [name,value]of originals)WebAssembly[name]=value;}

const arrays=Object.fromEntries(Object.keys(OUTPUT_SHAPES).map(name=>[name,new Float32Array([0,-0,1.5,-2.25])])),smallShapes=Object.fromEntries(Object.keys(arrays).map(name=>[name,[4]]));
const identities=await outputIdentities(arrays,smallShapes),chunks=[];
const transport=await streamP4OutputBytes(arrays,identities,async chunk=>chunks.push(chunk),{chunkBytes:8});
assert.equal(transport.chunkCount,50);assert.equal(transport.rawBytes,400);
for(const [name,value]of Object.entries(arrays)){
 const rows=chunks.filter(chunk=>chunk.name===name);assert.deepEqual(rows.map(row=>row.offset),[0,8]);
 const received=Buffer.concat(rows.map(row=>Buffer.from(row.base64,'base64')));assert.deepEqual(received,Buffer.from(value.buffer));
 assert(Object.is(new Float32Array(received.buffer.slice(received.byteOffset,received.byteOffset+received.byteLength))[1],-0));
}
await assert.rejects(()=>streamP4OutputBytes(arrays,identities,async()=>{},{chunkBytes:262148}),/Bounded/);
await assert.rejects(()=>streamP4OutputBytes({...arrays,gate:new Float32Array([NaN,0,0,0])},identities,async()=>{}),/identity mismatch/);
console.log('Real L512 admission and all25 signed-zero binary transport PASS; no native operators constructed');

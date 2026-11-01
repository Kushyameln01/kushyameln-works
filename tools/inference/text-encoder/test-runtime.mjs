import test from 'node:test';
import assert from 'node:assert/strict';
let module;
try { module=await import('../../../docs/shared/inference/text-encoder.mjs'); } catch {}
test('text runtime exports actual staged loader and manifest inspector',()=>{
 assert.equal(typeof module?.loadTextEncoder,'function');
 assert.equal(typeof module?.inspectTextEncoderManifest,'function');
});
test('incomplete or wrong-model manifests are rejected before any model session',()=>{
 assert.throws(()=>module.inspectTextEncoderManifest({type:'wan-umt5-staged-fp32',complete:false}),/incomplete|manifest/i);
 assert.throws(()=>module.inspectTextEncoderManifest({type:'fake',complete:true}),/manifest|model/i);
});

// Lifecycle tests use a tiny ORT double; numeric model validation is separate.
import {createHash,webcrypto} from 'node:crypto';
import {Sha256} from '../../../docs/shared/vr180/sha256.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const digest=async b=>Buffer.from(await crypto.subtle.digest('SHA-256',b)).toString('hex');
async function fixture(){
 const block=new Uint8Array([1,2,3,4]),blockHash=await digest(block);
 const norms=new Uint8Array(new Float32Array(4096).fill(1).buffer),normHash=await digest(norms);
 const row=new Uint8Array(8192),oneHash=Buffer.from(await digest(row),'hex'),rowHashes=new Uint8Array(256384*32);
 for(let i=0;i<256384;i++)rowHashes.set(oneHash,i*32);
 const manifest={schemaVersion:1,type:'wan-umt5-staged-fp32',complete:true,modelSha256:'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68',numLayers:24,hiddenSize:4096,onnxOpset:17,ortVersion:'1.24.3',maxTokens:512,arithmetic:'lifecycle-double-only',embedding:{dtype:'float16-le',hiddenSize:4096,vocabSize:256384,offset:500000,sourceFile:'original.safetensors',sourceBytes:6735906897,rowHashes:{path:'rows.bin',bytes:rowHashes.length,sha256:await digest(rowHashes)}},finalNorm:{path:'norm.f32',bytes:norms.length,sha256:normHash,epsilon:1e-6},blocks:Array.from({length:24},(_,index)=>({index,path:`block${index}`,bytes:4,sha256:blockHash,nativePass:true})),trailingMaskCompaction:{pass:true}};
 const files=new Map(manifest.blocks.map(b=>[b.path,block]));files.set('norm.f32',norms);files.set('rows.bin',rowHashes);files.set('original.safetensors',{size:6735906897,slice:()=>new Blob([row])});
 return {manifest,files};
}
test('24 staged sessions are released and only trailing mask0 rows are compacted',async()=>{
 const {manifest,files}=await fixture();let created=0,released=0,maxLive=0,live=0,normCalls=0,disposedTensors=0;
 const ort={env:{wasm:{},versions:{web:'1.24.3'}},Tensor:class{constructor(type,data,dims){Object.assign(this,{type,data,dims});}dispose(){disposedTensors++;}},InferenceSession:{create:async()=>{
  created++;live++;maxLive=Math.max(maxLive,live);
  return{run:async feeds=>({hidden_out:new ort.Tensor('float32',new Float32Array(feeds.hidden.data),feeds.hidden.dims)}),release:async()=>{released++;live--;}};
 }}};
 const hike={rmsNorm:(x,w,rows,cols,eps)=>{normCalls++;assert.equal(rows,3);assert.equal(cols,4096);assert.equal(eps,1e-6);return new Float32Array(x.length).fill(2);}};
 const e=await module.loadTextEncoder({manifest,files,ort,hike});
 const r=await e.run({tokenIds:[42,1,0,0],attentionMask:[1,0,1,0]});
 assert.deepEqual(r.shape,[1,4,4096]);assert.equal(r.provenance.effectiveTokens,3);assert.equal(r.hiddenStates[0],2);assert.equal(r.hiddenStates[4096],0);assert.equal(r.hiddenStates[8192],2);assert.equal(r.hiddenStates[12288],0);
 assert.equal(created,24);assert.equal(released,24);assert.equal(maxLive,1);assert.equal(normCalls,1);assert.equal(disposedTensors,72);assert.equal(r.provenance.hikeContributed,true);
 assert.equal(r.provenance.tokenizerSha256,'e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458');
 await e.dispose();await assert.rejects(e.run({tokenIds:[1],attentionMask:[1]}),/disposed/);
});
test('abort immediately after session creation still releases that session',async()=>{
 const {manifest,files}=await fixture(),controller=new AbortController();let released=0,ran=0;
 const ort={env:{wasm:{}},Tensor:class{},InferenceSession:{create:async()=>{controller.abort(new Error('Cancelled'));return{release:async()=>{released++;},run:async()=>{ran++;}};}}};
 const e=await module.loadTextEncoder({manifest,files,ort,hike:{rmsNorm(){throw Error('must not run');}}});
 await assert.rejects(e.run({tokenIds:[1],attentionMask:[1],signal:controller.signal}),/Cancelled/);
 assert.equal(released,1);assert.equal(ran,0);await e.dispose();
});
test('corrupted requested embedding rows fail before ORT execution',async()=>{
 const {manifest,files}=await fixture();let runs=0;
 files.set('original.safetensors',{size:6735906897,slice:()=>new Blob([new Uint8Array(8192).fill(1)])});
 const ort={env:{wasm:{}},Tensor:class{},InferenceSession:{create:async()=>{runs++;}}};
 const e=await module.loadTextEncoder({manifest,files,ort,hike:{rmsNorm(){}}});
 await assert.rejects(e.run({tokenIds:[1],attentionMask:[1]}),/row hash mismatch/);assert.equal(runs,0);await e.dispose();
});

// Non-neural hash integration: actual File/Blob reads and actual SHA algorithms;
// ORT stops at a sentinel before parsing any synthetic graph/model bytes.
const HASH_CHUNK_BYTES=8*1024*1024;
async function hashFixture({corrupt=false}={}){
 const {manifest,files}=await fixture(),block=new Uint8Array(9*1024*1024);
 for(let i=0;i<block.length;i++)block[i]=(i*13+17)%251;
 const expected=createHash('sha256').update(block).digest('hex');
 if(corrupt)block[block.length-1]^=1;
 const file=new Blob([block]);
 for(const record of manifest.blocks){record.bytes=block.length;record.sha256=expected;files.set(record.path,file);}
 return {manifest,files,expected};
}
function rejectLargeWebCrypto(){
 const real=crypto.subtle.digest;
 crypto.subtle.digest=function(algorithm,bytes){assert.ok(bytes.byteLength<=HASH_CHUNK_BYTES,'whole-file WebCrypto snapshot forbidden');return real.call(this,algorithm,bytes);};
 return ()=>{crypto.subtle.digest=real;};
}
function hashStopOrt(onCreate){return {env:{wasm:{}},Tensor:class{},InferenceSession:{create:async bytes=>onCreate(bytes)}};}
test('9MiB graph verifies every byte through <=8MiB views without a whole WebCrypto snapshot',async()=>{
 const {manifest,files,expected}=await hashFixture(),restore=rejectLargeWebCrypto(),realUpdate=Sha256.prototype.update;
 const chunks=[],bufferIds=new WeakMap();let nextBufferId=0,created=0,e;
 const id=buffer=>{if(!bufferIds.has(buffer))bufferIds.set(buffer,++nextBufferId);return bufferIds.get(buffer);};
 Sha256.prototype.update=function(bytes){if(bytes.buffer.byteLength===9*1024*1024)chunks.push({bytes:bytes.byteLength,offset:bytes.byteOffset,bufferId:id(bytes.buffer)});return realUpdate.call(this,bytes);};
 const stop=new Error('ORT sentinel after hash');
 try{
  const ort=hashStopOrt(bytes=>{created++;assert.equal(bytes.byteLength,9*1024*1024);assert.equal(createHash('sha256').update(bytes).digest('hex'),expected);assert.deepEqual(chunks,[{bytes:HASH_CHUNK_BYTES,offset:0,bufferId:id(bytes.buffer)},{bytes:1024*1024,offset:HASH_CHUNK_BYTES,bufferId:id(bytes.buffer)}]);throw stop;});
  e=await module.loadTextEncoder({manifest,files,ort,hike:{rmsNorm(){}}});
  await assert.rejects(e.run({tokenIds:[1],attentionMask:[1]}),error=>error===stop);assert.equal(created,1);
 }finally{Sha256.prototype.update=realUpdate;restore();await e?.dispose();}
});
test('a corrupt final graph byte fails manifest SHA before any ORT create',async()=>{
 const {manifest,files}=await hashFixture({corrupt:true}),restore=rejectLargeWebCrypto();let created=0,e;
 try{
  e=await module.loadTextEncoder({manifest,files,ort:hashStopOrt(()=>{created++;throw Error('must not create');}),hike:{rmsNorm(){}}});
  await assert.rejects(e.run({tokenIds:[1],attentionMask:[1]}),/Text file hash mismatch: block0/);assert.equal(created,0);
 }finally{restore();await e?.dispose();}
});
test('run cancellation delivered at an incremental hash task yield stops before the next chunk and ORT',async()=>{
 const {manifest,files}=await hashFixture(),controller=new AbortController(),restore=rejectLargeWebCrypto(),realUpdate=Sha256.prototype.update;
 let created=0,graphUpdates=0,e;
 Sha256.prototype.update=function(bytes){const value=realUpdate.call(this,bytes);if(bytes.buffer.byteLength===9*1024*1024&&++graphUpdates===1)setTimeout(()=>controller.abort(new Error('cancel during hash')),0);return value;};
 try{
  e=await module.loadTextEncoder({manifest,files,ort:hashStopOrt(()=>{created++;throw Error('must not create');}),hike:{rmsNorm(){}}});
  await assert.rejects(e.run({tokenIds:[1],attentionMask:[1],signal:controller.signal}),/cancel during hash/);assert.equal(graphUpdates,1);assert.equal(created,0);
 }finally{Sha256.prototype.update=realUpdate;restore();await e?.dispose();}
});
test('dispose during the final incremental hash yield prevents ORT creation and resolves activeDone',async()=>{
 const {manifest,files}=await hashFixture(),restore=rejectLargeWebCrypto(),realUpdate=Sha256.prototype.update;
 let created=0,graphUpdates=0,e,disposing;
 Sha256.prototype.update=function(bytes){const value=realUpdate.call(this,bytes);if(bytes.buffer.byteLength===9*1024*1024&&++graphUpdates===2)setTimeout(()=>{disposing=e.dispose();},0);return value;};
 try{
  e=await module.loadTextEncoder({manifest,files,ort:hashStopOrt(()=>{created++;throw Error('must not create');}),hike:{rmsNorm(){}}});
  await assert.rejects(e.run({tokenIds:[1],attentionMask:[1]}),/Text encoder disposed/);await disposing;assert.equal(graphUpdates,2);assert.equal(created,0);
 }finally{Sha256.prototype.update=realUpdate;restore();await e?.dispose();}
});

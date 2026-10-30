import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSafetensors, readTensor } from '../../docs/shared/inference/lora/safetensors.mjs';
import { createHttpSource } from '../../docs/shared/inference/lora/sources.mjs';
import { createCatalog, LORA_CATALOG } from '../../docs/shared/inference/lora/catalog.mjs';

function fixture(header={w:{dtype:'BF16',shape:[2],data_offsets:[0,4]}},data=new Uint8Array([0,63,0,64])) {
 const h=new TextEncoder().encode(typeof header==='string'?header:JSON.stringify(header));
 const bytes=new Uint8Array(8+h.length+data.length); new DataView(bytes.buffer).setBigUint64(0,BigInt(h.length),true);bytes.set(h,8);bytes.set(data,8+h.length);return bytes;
}
function local(bytes){return {size:bytes.length,async read(o,n){return bytes.slice(o,o+n);}};}
function response(bytes,status=206,headers={}){return new Response(bytes,{status,headers});}

test('reads tiny safetensors header and exact tensor slice',async()=>{
 const source=local(fixture());const info=await inspectSafetensors(source);
 assert.equal(info.tensors.w.dtype,'BF16');assert.equal(info.metadata,null);
 assert.deepEqual(await readTensor(source,info,'w',{elementOffset:1,elementCount:1}),new Uint8Array([0,64]));
 await assert.rejects(readTensor(source,info,'w',{elementOffset:2,elementCount:1}),/range/i);
});
test('rejects overlap, holes, shape mismatch and unsafe dimensions',async()=>{
 for(const header of [
  {a:{dtype:'BF16',shape:[1],data_offsets:[0,2]},b:{dtype:'BF16',shape:[1],data_offsets:[0,2]}},
  {w:{dtype:'BF16',shape:[1],data_offsets:[2,4]}},
  {w:{dtype:'BF16',shape:[3],data_offsets:[0,4]}},
  {w:{dtype:'BF16',shape:[9007199254740992],data_offsets:[0,4]}},
 ])await assert.rejects(inspectSafetensors(local(fixture(header))));
});
test('rejects duplicate keys, unsupported dtype and invalid UTF8',async()=>{
 await assert.rejects(inspectSafetensors(local(fixture('{"w":{"dtype":"BF16","shape":[2],"shape":[1],"data_offsets":[0,4]}}'))),/duplicate/i);
 await assert.rejects(inspectSafetensors(local(fixture({w:{dtype:'F8',shape:[4],data_offsets:[0,4]}}))),/dtype/i);
 const bytes=fixture();bytes[9]=255;await assert.rejects(inspectSafetensors(local(bytes)));
});
test('rejects unsafe header length, truncated reads and cancellation',async()=>{
 const bytes=fixture();new DataView(bytes.buffer).setBigUint64(0,9007199254740992n,true);
 await assert.rejects(inspectSafetensors(local(bytes)),/header/i);
 const source=local(fixture());source.read=async()=>new Uint8Array(1);await assert.rejects(inspectSafetensors(source),/truncated/i);
 await assert.rejects(inspectSafetensors(local(fixture()),{signal:AbortSignal.abort()}),{name:'AbortError'});
});
test('HTTP source requests exact ranges and rejects wrong ranges and lengths',async()=>{
 let requested;const source=createHttpSource({url:'https://example.com/a',size:10},{fetchImpl:async(u,o)=>{requested=o.headers.Range;return response(new Uint8Array([2,3]),206,{'Content-Range':'bytes 2-3/10','ETag':'"one"'});}});
 assert.deepEqual(await source.read(2,2),new Uint8Array([2,3]));assert.equal(requested,'bytes=2-3');
 for(const [range,bytes] of [['bytes 0-1/10',[2,3]],['bytes 2-3/20',[2,3]],['bytes 2-3/10',[2]]]){
  const bad=createHttpSource({url:'https://example.com/a',size:10},{fetchImpl:async()=>response(new Uint8Array(bytes),206,{'Content-Range':range})});
  await assert.rejects(bad.read(2,2));
 }
});
test('HTTP source permits only bounded complete 200 fallback and rejects source changes',async()=>{
 const small=createHttpSource({url:'https://example.com/a',size:4},{fetchImpl:async()=>response(new Uint8Array([1,2,3,4]),200)});
 assert.deepEqual(await small.read(1,2),new Uint8Array([2,3]));
 let canceled=false;const stream=new ReadableStream({cancel(){canceled=true;}});
 const large=createHttpSource({url:'https://example.com/a',size:100},{maxReadBytes:8,fetchImpl:async()=>new Response(stream,{status:200})});
 await assert.rejects(large.read(0,2),/range/i);assert.equal(canceled,true);
 let count=0;const changing=createHttpSource({url:'https://example.com/a',size:4},{fetchImpl:async()=>response(new Uint8Array([1,2]),206,{'Content-Range':'bytes 0-1/4','ETag':String(count++)})});
 await changing.read(0,2);await assert.rejects(changing.read(0,2),/changed/i);
 assert.throws(()=>createHttpSource({url:'file:///tmp/a',size:4}),/http/i);
});
test('catalog preserves admin category/noise mapping and immutable hashes',()=>{
 assert.equal(LORA_CATALOG.light.high.fileName,'Bernini-R_LightX2V_high_noise.safetensors');
 assert.equal(LORA_CATALOG.detail.low.fileName,'NSFW-22-L-e8.safetensors');assert.equal(LORA_CATALOG.detail.high.url,null);
 const c=createCatalog({detail:{high:{url:'https://example.com/high.safetensors'}}});
 assert.equal(c.detail.high.size,613516752);assert.equal(c.detail.high.url,'https://example.com/high.safetensors');
 assert.throws(()=>{c.detail.high.size=1;},TypeError);
 assert.throws(()=>createCatalog({detail:{high:{url:'file:///tmp/a'}}}),/http/i);
 assert.throws(()=>createCatalog({light:{middle:{url:'https://example.com/a'}}}),/noise/i);
});
test('rejects BOM-prefixed headers and present non-object metadata',async()=>{
 const bytes=fixture();const headerLength=Number(new DataView(bytes.buffer).getBigUint64(0,true));const bom=new Uint8Array(bytes.length+3);new DataView(bom.buffer).setBigUint64(0,BigInt(headerLength+3),true);bom.set([239,187,191],8);bom.set(bytes.slice(8),11);
 await assert.rejects(inspectSafetensors(local(bom)),/header/i);
 await assert.rejects(inspectSafetensors(local(fixture({__metadata__:null,w:{dtype:'BF16',shape:[2],data_offsets:[0,4]}}))),/metadata/i);
});

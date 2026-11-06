// Owner media packing only. Controlled RGBA decoder fixtures do no neural work.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareVaeMediaInput,writeOpaqueRgbaToNcthw} from '../../docs/shared/inference/media-input.mjs';
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url)));
const fixed=await json('../../development/inference/codec-marker-handoff/manifests/vae-rect/manifest.json');
const stream=await json('../../development/inference/standalone-20261102/evidence/vae-stream-manifest.json');
const file=new File([new Uint8Array([1,2,3,4,5,6,7,8])],'controlled-source.png',{type:'image/png'});
function frame({width=32,height=16,timestamp=null,alpha=255}={}){
 const data=new Uint8ClampedArray(width*height*4);
 for(let i=0;i<width*height;i++)data.set([0,128,255,alpha],4*i);
 return {data,width,height,stride:width*4,timestamp};
}
const decoder=frames=>async function*(_file,{signal}){for(const value of frames){signal?.throwIfAborted();yield value;}};

test('existing opaque RGBA/255 packing stays NCTHW rgb-unit and source context uses native fields',async()=>{
 const packed=new Float32Array(6);
 writeOpaqueRgbaToNcthw({data:new Uint8Array([255,0,0,255]),width:1,height:1},packed,{frameIndex:0,frameCount:2});
 writeOpaqueRgbaToNcthw({data:new Uint8Array([0,0,255,255]),width:1,height:1},packed,{frameIndex:1,frameCount:2});
 assert.deepEqual([...packed],[1,0,0,0,0,1],'both owner UIs use the same frame/channel packing');
 const input=await prepareVaeMediaInput(file,{manifest:fixed,slotId:'vae-encode-input',readFrames:decoder([frame()])});
 assert.deepEqual(input.shape,[1,3,1,16,32]);assert.equal(input.meaning,'rgb-unit');assert.equal(input.layout,'NCTHW');
 assert.equal(input.data[0],0);assert.equal(input.data[512],Math.fround(128/255));assert.equal(input.data[1024],1);
 assert.deepEqual(input.context.sourceFrameIndices,[0]);assert.equal(Object.hasOwn(input.context,'sourceFrameTimesSeconds'),false,'still images have no invented source timestamp');
 assert.equal(input.context.slotId,'vae-encode-input');assert.match(input.context.inputSha256,/^[0-9a-f]{64}$/);
 assert.equal(Object.hasOwn(input,'normalization'),false);assert.equal(Object.hasOwn(input,'modelSha256'),false);
});

test('all decoded video frames and original timestamps retain sequence without sampling',async()=>{
 const frames=[frame({timestamp:0}),frame({timestamp:.04}),frame({timestamp:.10}),frame({timestamp:.13})];
 const input=await prepareVaeMediaInput(file,{manifest:stream,slotId:'vae-encode-input',readFrames:decoder(frames)});
 assert.deepEqual(input.shape,[1,3,4,16,32]);assert.deepEqual(input.context.sourceFrameIndices,[0,1,2,3]);
 assert.deepEqual(input.context.sourceFrameTimesSeconds,[0,.04,.10,.13]);
 assert.equal(input.data[4*512],Math.fround(128/255));assert.equal(input.data[8*512],1);
 assert.equal(Object.hasOwn(input,'frameProcessing'),false,'native VAE owns consumed/tail reporting');
});

test('opaque, shape, frame count and cancellation failures do not resize or discard frames',async()=>{
 const run=frames=>prepareVaeMediaInput(file,{manifest:fixed,slotId:'vae-encode-input',readFrames:decoder(frames)});
 await assert.rejects(run([frame({alpha:128})]),/透過|alpha/i);
 await assert.rejects(run([frame({width:16})]),/寸法|shape/i);
 await assert.rejects(run([frame(),frame()]),/フレーム|frame/i);
 await assert.rejects(prepareVaeMediaInput(file,{manifest:stream,slotId:'vae-encode-input',readFrames:decoder([frame({width:17})])}),/spatial|shape|domain/i);
 const controller=new AbortController();controller.abort();
 await assert.rejects(prepareVaeMediaInput(file,{manifest:fixed,slotId:'vae-encode-input',signal:controller.signal,readFrames:decoder([frame()])}),error=>error.name==='AbortError');
});

test('native capability refusal stops before retaining the remaining video and import budget bounds packed allocation',async()=>{
 let decoded=0;
 async function* source(){for(let index=0;index<4;index++){decoded++;yield frame({timestamp:index*.04});}}
 await assert.rejects(prepareVaeMediaInput(file,{manifest:stream,slotId:'vae-encode-input',readFrames:source,capabilities:request=>{
  assert.deepEqual(request.input.shape,[1,3,1,16,32]);assert.equal(Object.hasOwn(request.input,'data'),false);
  return {support:{supported:false,code:'MISSING_ASSET',reason:'matching encoder graph is missing'}};
 }}),/matching encoder graph/);
 assert.equal(decoded,1,'native refusal must stop decoder iteration immediately');
 const value=frame({width:256,height:256,timestamp:0});
 await assert.rejects(prepareVaeMediaInput(file,{manifest:stream,slotId:'vae-encode-input',readFrames:decoder(Array(65).fill(value))}),/64 MiB/);
});

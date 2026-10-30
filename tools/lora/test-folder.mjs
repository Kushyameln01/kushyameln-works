import test from 'node:test';
import assert from 'node:assert/strict';
import {openLoraFolder} from '../../docs/shared/inference/lora/folder.mjs';
function file(name,path=name,bytes=[1,2,3,4]){const f=new File([new Uint8Array(bytes)],name);Object.defineProperty(f,'webkitRelativePath',{value:path});return f;}
test('opens original four files as immutable light and detail pairs',()=>{
 const folder=openLoraFolder(['Bernini-R_LightX2V_high_noise.safetensors','Bernini-R_LightX2V_low_noise.safetensors','NSFW-22-H-e8.safetensors','NSFW-22-L-e8.safetensors'].map(n=>file(n,'Models/'+n)));
 assert.deepEqual(folder.pairs.map(p=>p.id),['light','detail']);assert.equal(folder.getPair('detail').high.fileName,'NSFW-22-H-e8.safetensors');assert.throws(()=>{folder.pairs.push({});},TypeError);assert.throws(()=>folder.getPair('missing'),/unknown/i);
});
test('opens HighNoise and LowNoise folder members or named files',()=>{
 for(const paths of [['Models/HighNoise/a.safetensors','Models/LowNoise/b.safetensors'],['HighNoise.safetensors','LowNoise.safetensors']]){
  const folder=openLoraFolder([...paths.map(p=>file(p.split('/').at(-1),p)),file('notes.txt')]);assert.equal(folder.pairs.length,1);assert.equal(folder.pairs[0].id,'folder');
 }
});
test('rejects missing, ambiguous, conflicting and unsafe folder paths',()=>{
 for(const files of [
  [file('HighNoise.safetensors')],
  [file('a.safetensors','HighNoise/a.safetensors'),file('b.safetensors','HighNoise/b.safetensors'),file('LowNoise.safetensors')],
  [file('NSFW-22-H-e8.safetensors','LowNoise/NSFW-22-H-e8.safetensors'),file('NSFW-22-L-e8.safetensors')],
  [file('HighNoise.safetensors','../HighNoise.safetensors'),file('LowNoise.safetensors')],
  [file('a.safetensors','HighNoise/LowNoise/a.safetensors'),file('LowNoise.safetensors')],
 ])assert.throws(()=>openLoraFolder(files));
 assert.throws(()=>openLoraFolder([]),/pair/i);
});
test('source uses bounded File.slice reads and preserves bytes on cancellation',async()=>{
 const high=file('HighNoise.safetensors');let calls=0;const slice=high.slice.bind(high);high.slice=(start,end)=>{calls++;assert.equal(start,1);assert.equal(end,3);return slice(start,end);};
 const source=openLoraFolder([high,file('LowNoise.safetensors')]).pairs[0].high.source;
 assert.equal(calls,0);assert.deepEqual(await source.read(1,2),new Uint8Array([2,3]));assert.equal(calls,1);
 await assert.rejects(source.read(3,2),/range/i);await assert.rejects(source.read(0,1,{signal:AbortSignal.abort()}),{name:'AbortError'});assert.equal(calls,1);
});
test('rejects unsafe file sizes and truncated slices',async()=>{
 const unsafe=file('HighNoise.safetensors');Object.defineProperty(unsafe,'size',{value:Number.MAX_SAFE_INTEGER+1});
 assert.throws(()=>openLoraFolder([unsafe,file('LowNoise.safetensors')]),/file/i);
 const high=file('HighNoise.safetensors');high.slice=()=>new Blob([]);
 const source=openLoraFolder([high,file('LowNoise.safetensors')]).pairs[0].high.source;
 await assert.rejects(source.read(0,1),/truncated/i);
});
test('hashes original file bytes incrementally with progress and cancellation',async()=>{
 const high=file('HighNoise.safetensors');high.arrayBuffer=()=>{throw new Error('Whole file preload forbidden');};
 const source=openLoraFolder([high,file('LowNoise.safetensors')]).pairs[0].high.source;
 const progress=[];assert.equal(await source.hash({onProgress:p=>progress.push(p)}),'9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a');
 assert.deepEqual(progress.at(-1),{bytesHashed:4,totalBytes:4});
 await assert.rejects(source.hash({signal:AbortSignal.abort()}),{name:'AbortError'});
 const controller=new AbortController();await assert.rejects(source.hash({signal:controller.signal,onProgress:p=>{if(p.bytesHashed>0)controller.abort();}}),{name:'AbortError'});
 assert.throws(()=>{source.hash=null;},TypeError);
});

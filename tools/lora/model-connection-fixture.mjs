// Development-only source and local File fixtures. No original/training-base claim.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createLoraStandalone} from '../../docs/shared/inference/lora/standalone-sdk.mjs';
import {createStreamingKernel} from '../../docs/shared/inference/lora/kernel/streaming/host.mjs';
import {createLoraProductCache} from '../../docs/shared/inference/lora/owned-package.mjs';
export const ROOT=process.env.LORA_MODEL_CONNECTION_INPUTS??'/workspace/work/lora/integration-20261104';
export const W='blocks.0.self_attn.q.weight',B='blocks.0.self_attn.q.bias',C=5120;
export const Q='diffusion_model.'+W,QB='diffusion_model.'+B;
export const weightTargets=[{key:Q,slice:{startRow:1,rowCount:2}}];
export const lightTargets=[...weightTargets,{key:QB,slice:{startRow:1,rowCount:2}}];
export const owner=await import(pathToFileURL(path.join(ROOT,'diffusion/docs/shared/diffusion-models/execution/model-weights.mjs')));
export const provenance=await import(pathToFileURL(path.join(ROOT,'diffusion/docs/shared/diffusion-models/lora/targets.mjs')));
export const modelHashes=await import(pathToFileURL(path.join(ROOT,'diffusion/docs/shared/diffusion-models/lora/weights.mjs')));
const original=JSON.parse(await fs.readFile(path.join(ROOT,'FIXTURE-SOURCE.json'),'utf8'));
export const baseValue=offset=>Math.fround((offset%17-8)/128);
export const factorDown=(pair,i)=>pair==='light'?(i%4-1)/64:(i%3-1)/32;
export const factorUp=(pair,i)=>pair==='light'?(i%5+1)/8:(i%7+1)/16;
export const biasDelta=i=>(i%5-2)/128;
export const expectedWeight=(offset,selections)=>{const row=Math.floor(offset/C),col=offset%C;let out=baseValue(offset);if(row<1||row>=3)return out;for(const pairId of ['light','detail']){const s=selections.find(x=>x.pairId===pairId);if(s)out=Math.fround(out+Math.fround(Math.fround(s.strength*(pairId==='light'?2:1))*Math.fround(factorDown(pairId,col)*factorUp(pairId,row))));}return out;};
function file(tensors,name){let offset=0;const h={};for(const t of tensors){h[t.name]={dtype:'F32',shape:t.shape,data_offsets:[offset,offset+t.data.byteLength]};offset+=t.data.byteLength;}let header=JSON.stringify(h);header+=' '.repeat((8-header.length%8)%8);const encoded=new TextEncoder().encode(header),length=new Uint8Array(8);new DataView(length.buffer).setBigUint64(0,BigInt(encoded.length),true);return new File([length,encoded,...tensors.map(t=>new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength))],name,{type:'application/octet-stream'});}
export function loraFile(pair){const stem=Q.slice(0,-7),tensors=[{name:stem+(pair==='light'?'.lora_down.weight':'.lora_A.weight'),shape:[1,C],data:Float32Array.from({length:C},(_,i)=>factorDown(pair,i))},{name:stem+(pair==='light'?'.lora_up.weight':'.lora_B.weight'),shape:[C,1],data:Float32Array.from({length:C},(_,i)=>factorUp(pair,i))}];if(pair==='light')tensors.push({name:stem+'.alpha',shape:[],data:Float32Array.of(2)},{name:stem+'.diff_b',shape:[C],data:Float32Array.from({length:C},(_,i)=>biasDelta(i))});return file(tensors,'validation-'+pair+'.safetensors');}
export function fixtureSource(side='LOW'){
 const description=structuredClone(original),pinned=provenance.TARGET_PROVENANCE.models.find(x=>x.name.includes(side));Object.assign(description,{side,modelHash:modelHashes.BASE_MODEL_HASHES[side],headerSHA256:pinned.headerSHA256,fileBytes:pinned.fileBytes,fixtureOnly:true,precisionProfile:'Independent dyadic F32 development source, not original F16/FP8 payload decoding',modelHashRole:'declared conformance-model identity, not fixture content hash'});
 let disposed=false,busy=false,reads=0,maxElements=0,paused,started;const calls=[];let wake;
 const operation=async(key,start,count,matrix,{signal}={})=>{if(disposed||busy)throw Error(disposed?'Fixture source disposed':'Fixture source busy');busy=true;try{signal?.throwIfAborted();const entry=description.entries[key],elements=matrix?count*entry.columns:count;if(elements>81920||matrix&&count>entry.maxRows)throw Error('Owner block limit exceeded');reads++;maxElements=Math.max(maxElements,elements);calls.push({key,start,count,elements});if(paused){const wait=paused;paused=null;started?.();await wait;}await Promise.resolve();signal?.throwIfAborted();const offset=start*(matrix?entry.columns:1),values=Float32Array.from({length:elements},(_,i)=>baseValue(offset+i));return {values,raw:new Uint8Array(0),shape:matrix?[count,entry.columns]:[count],source:{...structuredClone(entry),fixtureOnly:true,elementOffset:offset,selectedElementCount:elements,storageValuesVerified:false}};}finally{busy=false;}};
 return {describe:()=>structuredClone(description),readRows:(...args)=>operation(args[0],args[1],args[2]??16,true,args[3]),readVector:(...args)=>operation(args[0],args[1],args[2],false,args[3]),addBias(v,b,rows,cols){return Float32Array.from(v,(x,i)=>Math.fround(x+b[i%cols]));},stats:()=>({disposed,busy,reads,maxElements}),dispose(){if(busy)throw Error('Await source');disposed=true;},calls,mutate(fn){fn(description);},pauseNext(){let ready;const began=new Promise(r=>{ready=r;});paused=new Promise(r=>{wake=r;});started=ready;return {began,resume:()=>wake()};}};
}
export async function kernel(){return createStreamingKernel({wasmBytes:await fs.readFile(new URL('../../docs/shared/inference/lora/kernel/streaming/lora.wasm',import.meta.url))});}
export async function setup(create,side='LOW'){
 const source=fixtureSource(side),adapter=await create({source,createCompletedModelWeightSource:owner.createCompletedModelWeightSource}),hike=await kernel(),cache=createLoraProductCache({maxBytes:1024*1024}),sdk=createLoraStandalone({registry:adapter.registry,baseProvider:adapter.baseProvider,kernel:hike,cache});
 return {source,adapter,hike,cache,sdk,async register(pair){return sdk.register({pairId:pair,file:loraFile(pair)});},async close(){await sdk.dispose();await adapter.dispose();cache.clear();hike.dispose();source.dispose();}};
}
export function context(prepared,extra={}){return {contractVersion:prepared.contractVersion,sdkInstanceId:prepared.sdkInstanceId,localRevision:prepared.localRevision,transactionId:prepared.transactionId,...Object.fromEntries(['planId','packageHash','registryHash','coverage','scope'].map(k=>[k,prepared.manifest[k]])),side:prepared.manifest.side,validationMode:'normal',isCurrent:()=>true,...extra};}

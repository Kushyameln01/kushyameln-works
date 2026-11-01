// Synthetic original-source/control fixture. No original model File or NN runs.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {engine} from './v2-fixture.mjs';
export const PROFILE='bernini-block0-n2-cross-ffn-f32-candidate-v1';
export const GRAPH='9c3bbaf2488a763ab56a96a8f5ddfc65510bf197799ed83b9f6ead512cf7a52e';
export const MODEL='9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52';
export const BRIDGE='ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd';
export const HEADER='d8aec897e3af480492d7eca7b57141ea968e89cde7f46ea7886db11754ebd6e3';
export const ROOT=process.env.P4_NATIVE_ROOT??'/workspace/work/lora/diffusion-7ee362';
const base=pathToFileURL(path.join(ROOT,'docs/shared/diffusion-models/')).href;
export const native=await import(base+'ort-bridge/post-self-attention/weights.mjs');
export const conditioning=await import(base+'ort-bridge/post-self-attention/conditioning.mjs');
export const identities=await import(base+'lora/diagnostic-identity.mjs');
export const digest=v=>createHash('sha256').update(v instanceof ArrayBuffer?new Uint8Array(v):new Uint8Array(v.buffer,v.byteOffset,v.byteLength)).digest('hex');
export const W='blocks.0.cross_attn.q.weight',B='blocks.0.cross_attn.q.bias';
export function syntheticOriginal(){
 const entries={};let offset=200000;
 const operatorBinding=(key,columns)=>columns?{programSlot:key,graphInput:'weight',operator:key.slice(0,-7)}:key.startsWith('blocks.0.norm3.')?{programSlot:key,hikeExport:'Norm',hikeParameter:key.endsWith('.bias')?'bias':'weight',operator:'norm3-affine-layernorm'}:key.startsWith('blocks.0.cross_attn.norm_')?{programSlot:key,hikeExport:'Norm',hikeParameter:'weight',operator:key.slice(0,-7)}:key==='blocks.0.modulation'?{programSlot:key,hikeExport:'Add',hikeParameter:'x',operator:'ffn-modulation-chunks3-5'}:{programSlot:key,hikeExport:'AddBias',hikeParameter:'bias',operator:key.slice(0,-5)};
 const specs=[['text_embedding.0',[5120,4096],'F16'],['text_embedding.2',[5120,5120],'F16'],...['q','k','v','o'].map(k=>['blocks.0.cross_attn.'+k,[5120,5120],k==='o'?'F16':'F8_E4M3']),['blocks.0.ffn.0',[13824,5120],'F8_E4M3'],['blocks.0.ffn.2',[5120,13824],'F8_E4M3']];
 const add=(key,shape,dtype,columns=null,allowed)=>{
  const byteLength=shape.reduce((a,b)=>a*b,1)*(dtype==='F8_E4M3'?1:2),vector=key.endsWith('.bias');
  entries[key]={originalKey:key,key:'diffusion_model.'+key,weightId:key,fullShape:shape,storageDtype:dtype,computeDtype:'F32',layout:'row-major',columns,absoluteByteOffset:offset,byteLength,binding:{kind:columns?'runtime-input':'hike-parameter',name:key},operatorBinding:operatorBinding(key,columns),transform:{kind:'identity',transpose:false},fp8ProfileId:null,...(columns?{allowedRows:allowed??[0,shape[0]],maxRows:key==='blocks.0.ffn.2.weight'?4:16}:{allowedElements:allowed??[0,shape.reduce((a,b)=>a*b,1)]})};offset+=byteLength;
  if(dtype==='F8_E4M3')Object.assign(entries[key],{fp8ProfileId:'scaled-e4m3fn-scalar-f32-v1',scaleSHA256:digest(new Float32Array([1])),quantConfigSHA256:digest(new TextEncoder().encode('{"format": "float8_e4m3fn"}')),scaleSource:{originalKey:key.slice(0,-7)+'.weight_scale',fullShape:[],storageDtype:'F32',absoluteByteOffset:100,byteLength:4},quantConfigSource:{originalKey:key.slice(0,-7)+'.comfy_quant',fullShape:[27],storageDtype:'U8',absoluteByteOffset:104,byteLength:27}});
 };
 for(const [stem,shape,dtype]of specs){add(stem+'.weight',shape,dtype,shape[1]);add(stem+'.bias',[shape[0]],'F16');}
 for(const key of ['blocks.0.norm3.weight','blocks.0.norm3.bias','blocks.0.cross_attn.norm_q.weight','blocks.0.cross_attn.norm_k.weight'])add(key,[5120],'F16');
 add('time_projection.1.weight',[30720,5120],'F16',5120,[15360,30720]);add('time_projection.1.bias',[30720],'F16',null,[15360,30720]);add('blocks.0.modulation',[1,6,5120],'F16',null,[15360,30720]);
 const descriptor={schemaVersion:'bernini-p4-original-weights/0.1',executionProfileId:PROFILE,side:'HIGH',modelHash:MODEL,headerSHA256:HEADER,fileBytes:15574833216,graphHash:GRAPH,bridgeWasmSHA256:BRIDGE,precisionProfile:'synthetic original-source/control fixture; no original bytes or NN',fullFileSHA256Verified:false,fullFileHashRecomputed:false,modelHashRole:'expected-original-full-hash-not-current-reauthentication',packageHash:null,entries};
 let reads=0;const read=async(key,start,count,rows,{signal}={})=>{signal?.throwIfAborted();reads++;const e=entries[key],n=count*(rows?e.columns:1);return {values:new Float32Array(n).fill(rows?2:3),source:{...structuredClone(e),decodedF32SHA256:digest(new Float32Array(n).fill(rows?2:3))}};};
 return {describe:()=>structuredClone(descriptor),readRows:(k,s,n,o)=>read(k,s,n,true,o),readVector:(k,s,n,o)=>read(k,s,n,false,o),addBias(){throw Error('No model math in control fixture');},stats:()=>({synthetic:true,reads,disposed:false}),descriptor};
}
export function loraSource({stem=W.slice(0,-7),withBias=true,unknown=false}={}){
 const columns=stem==='blocks.0.ffn.2'?13824:5120,rows=stem==='blocks.0.ffn.0'?13824:5120,key='diffusion_model.'+stem;
 const tensors={[key+'.lora_down.weight']:{shape:[1,columns],values:new Float32Array(columns).fill(1)},[key+'.lora_up.weight']:{shape:[rows,1],values:new Float32Array(rows).fill(0.125)},[key+'.alpha']:{shape:[],values:new Float32Array([1])},...(withBias?{[key+'.diff_b']:{shape:[rows],values:new Float32Array(rows).fill(0.25)}}:{}),...(unknown?{[key+'.unsupported']:{shape:[1],values:new Float32Array([0])}}:{})};
 let at=0;const header={},parts=[];for(const [name,t]of Object.entries(tensors)){const b=new Uint8Array(t.values.buffer);header[name]={dtype:'F32',shape:t.shape,data_offsets:[at,at+b.length]};at+=b.length;parts.push(b);}
 const h=new TextEncoder().encode(JSON.stringify(header)),bytes=new Uint8Array(8+h.length+at);new DataView(bytes.buffer).setBigUint64(0,BigInt(h.length),true);bytes.set(h,8);at=8+h.length;for(const b of parts){bytes.set(b,at);at+=b.length;}
 return {size:bytes.length,read:async(o,n,{signal}={})=>{signal?.throwIfAborted();return bytes.slice(o,o+n);},hash:async()=>digest(bytes)};
}
export async function fixture(options={}){
 const source=syntheticOriginal(),feed=native.createP4WeightFeed({source}),engineState=await engine(loraSource(options)),stem=options.stem??W.slice(0,-7),weightId=stem+'.weight',biasId=stem+'.bias';
 const rowStart=2,rowCount=options.rowCount??3,selection={pairId:'custom-local-fixture',noise:'high'},diagnostic={targets:[{key:'diffusion_model.'+weightId,slice:{startRow:rowStart,rowCount}},...(options.withBias===false?[]:[{key:'diffusion_model.'+biasId,slice:{startRow:rowStart,rowCount}}])]};
 const captured=()=>conditioning.captureP4FixtureConditioning({shape:[1,1,4096],data:new Float32Array(4096),attentionMask:new Uint8Array([1]),fixtureId:'P4-adapter-control-only',sourceRef:'synthetic-original-source/fake-forward'});
 const input=()=>({residual:new Float32Array(10240),timeAct1:new Float32Array(5120),conditioning:captured()});
 const run=async(view,i)=>{if(Object.keys(i).some(k=>!['residual','timeAct1','conditioning','signal','onProgress'].includes(k)))throw TypeError('Unknown native P4 input field');i.signal?.throwIfAborted();const w=await view.readRows(weightId,rowStart,1,{signal:i.signal}),b=await view.readVector(biasId,rowStart,1,{signal:i.signal}),d=view.describe(),c=i.conditioning;
  return {output:new Float32Array(10240).fill(w.values[0]+b.values[0]+i.residual[0]+i.timeAct1[0]),evidence:{executionProfileId:d.executionProfileId,graphSHA256:d.graphHash,weightFeedPackageHash:d.packageHash,weightFeedEpoch:d.epoch,inputHashes:{residualSHA256:digest(i.residual),timeAct1SHA256:digest(i.timeAct1),conditioningSHA256:digest(c.data),conditioningMaskSHA256:digest(c.attentionMask),conditioningMetadataSHA256:digest(conditioning.p4ConditioningMetadataBytes(c.metadata))},conditioning:{schemaVersion:c.schemaVersion,rows:c.rows,shape:c.shape,meaning:c.meaning,metadata:c.metadata},fixtureOnly:true}};
 };
 const validation=(strength=1)=>{const expected=new Float32Array(10240).fill(5+strength*(0.125+(options.withBias===false?0:0.25)));return {input:input(),expected,expectedSHA256:digest(expected),referenceId:'synthetic-independent-control-formula',gateId:'p4-cross-ffn-composed-f32-v1',tolerance:{absolute:0.01,relative:0.001},applicationBinding:null};};
 return {source,feed,sdk:engineState.api,kernel:engineState.kernel,selection,diagnostic,weightId,biasId,rowStart,rowCount,input,run,validation,async close(){await engineState.close();await feed.dispose();}};
}
export const planInput=(f,adapter,strength=1)=>({selection:f.selection,strength,registry:adapter.registry,loaderPolicyId:'comfy-lora-b5a4321-linear-diff-v1',diagnostic:f.diagnostic});
export function context(prepared,extra={}){return {...prepared.manifest,isCurrent:()=>true,...extra};}

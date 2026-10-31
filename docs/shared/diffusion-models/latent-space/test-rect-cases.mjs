import {createLatentSpace,NORMALIZED_MEAN} from './latent-space.mjs';
import * as interop from '../tensor-interop.mjs';
const f=Math.fround;
// Independent fixed ComfyUI constants, not values read from the kernel.
const mean=Float32Array.from([-.7571,-.7089,-.9113,.1075,-.1745,.9653,-.1517,1.5508,.4134,-.0715,.5517,-.3632,-.1922,-.9497,.2503,-.2921]);
const std=Float32Array.from([2.8184,1.4541,2.3275,2.6558,1.2196,1.7708,2.6052,2.0743,3.2687,2.1526,2.8652,1.5579,1.6382,1.1253,2.8251,1.916]);
const norm=(x,c)=>f(f(f(x-mean[c])*1)/std[c]);
const inverse=(x,c)=>f(f(f(x*std[c])/1)+mean[c]);
const check=(x,m)=>{if(!x)throw Error(m);};
const reject=fn=>{let rejected=false;try{fn();}catch{rejected=true;}check(rejected,'Expected profile rejection');};
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function runRectCases(read,{metadataCodec}){
 const bytes=await read('build/latent-space.wasm'),space=await createLatentSpace(bytes),cases=[],outputs=[];
 const loaded=[];
 for(const [name,id,shape,manifestSHA] of [
  ['f1','wan21-raw-f32-1x16x16',[1,16,1,2,2],'fa219b8e7e0b6b0be37c598d3dfedadb29505ad1407fe3f8270d8655dd46828c'],
  ['rect','wan21-raw-f32-1x16x32',[1,16,1,2,4],'450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a']]){
  const manifestBytes=await read('fixture/'+name+'-manifest.json');check(await digest(manifestBytes)===manifestSHA,'Actual manifest identity');
  const manifest=JSON.parse(new TextDecoder().decode(manifestBytes));check(manifest.profile.id===id&&same(manifest.profile.latentShape,shape),'Manifest exact profile');
  const encoded=await read('fixture/'+name+'-mean.wktensor'),tensor=await metadataCodec.decodeTensor(encoded);
  check(same(tensor.shape,shape)&&tensor.meaning==='raw-posterior-mean'&&tensor.modelSha256===interop.WAN21_VAE_SHA256,'Received mean boundary');
  loaded.push({name,id,shape,tensor,encoded,manifestSHA});
 }
 cases.push({name:'Git-received actual F1/rect manifests and mean fixtures match declared profiles',status:'PASS'});
 for(const input of loaded){
  const original=input.tensor.data.slice(),context=structuredClone(input.tensor.context),positions=input.tensor.data.length/16;
  const normalized=space.normalizeRawMean(input.tensor);
  check(same(normalized.shape,input.shape)&&normalized.meaning===NORMALIZED_MEAN,'Normalizer changed profile/meaning');
  normalized.data.forEach((v,i)=>check(Object.is(v,norm(original[i],Math.floor(i/positions))),'Real mean normalize f32 '+input.name+':'+i));
  const saved=await metadataCodec.encodeTensor(normalized),readback=await metadataCodec.decodeTensor(saved),restored=space.restoreRawMean(readback);
  let maxAbs=0;restored.data.forEach((v,i)=>{check(Object.is(v,inverse(normalized.data[i],Math.floor(i/positions))),'Real mean inverse f32');maxAbs=Math.max(maxAbs,Math.abs(v-original[i]));});
  check(maxAbs<=2e-6,'Predeclared real mean roundtrip maxAbs2e-6');
  check(same(restored.shape,input.shape)&&restored.meaning==='raw-posterior-mean'&&restored.modelSha256===input.tensor.modelSha256,'Restored identity');
  check(same(restored.context,context)&&restored.context!==input.tensor.context,'Context copy/codec roundtrip');
  check(input.tensor.data.every((v,i)=>Object.is(v,original[i])),'Received caller mean mutated');
  outputs.push({profile:input.id,shape:input.shape,fixtureFileSHA256:await digest(input.encoded),manifestSHA256:input.manifestSHA,normalizedSHA256:await digest(new Uint8Array(normalized.data.buffer)),restoredSHA256:await digest(new Uint8Array(restored.data.buffer)),maxRoundTripAbs:maxAbs});
  cases.push({name:'actual VAE diagnostic '+input.name+' mean -> Hike normalize -> pinned G1C codec -> Hike restore allvalues',status:'PASS'});
 }
 const rect=loaded[1].tensor;
 check(typeof interop.requireWanRawLatentRect==='function','Dedicated rect guard missing');
 check(interop.requireWanRawLatentRect(rect)===rect,'Rect guard did not accept exact received mean');
 reject(()=>interop.requireWanRawLatent(rect));reject(()=>interop.requireWanRawLatentF1(rect));
 reject(()=>interop.requireWanRawLatentRect({...rect,shape:[1,16,2,2,2]}));
 reject(()=>space.normalizeRawMean({...rect,shape:[1,16,2,1,4]}));
 reject(()=>space.normalizeRawMean({...rect,profileId:'wan21-raw-f32-5x16x16'}));
 reject(()=>interop.requireWanRawLatentRect({...rect,normalization:'wan21-comfy-f32-v1'}));
 reject(()=>interop.requireWanRawLatentRect({...rect,meaning:'wan21-raw-generated-sample:v1'}));
 reject(()=>interop.requireWanRawLatentRect({...rect,modelSha256:'0'.repeat(64)}));
 cases.push({name:'same128count does not authorize legacy or arbitrary shape and wrong metadata',status:'PASS'});
 const module=await WebAssembly.compile(bytes),native=new WebAssembly.Instance(module,{}),memory=native.exports.memory,start=memory.buffer.byteLength;memory.grow(1);const ptr=start+512;
 check(typeof native.exports.NormalizeRawMeanRect==='function'&&typeof native.exports.RestoreRawMeanRect==='function','Dedicated rect ABI missing');
 new Float32Array(memory.buffer,start,128).set(rect.data);
 check(native.exports.NormalizeRawMeanRect(start,128,ptr,128)===0,'Rect native count128');
 new Float32Array(memory.buffer,ptr,128).forEach((v,i)=>check(Object.is(v,norm(rect.data[i],Math.floor(i/8))),'Rect native positions8'));
 check(native.exports.NormalizeRawMeanRect(start,64,ptr,128)===-1,'Rect native64 accepted');
 check(native.exports.RestoreRawMeanRect(start,128,ptr,127)===-1,'Rect shortcapacity accepted');
 new Float32Array(memory.buffer,start,128)[127]=NaN;new Float32Array(memory.buffer,ptr,128).fill(123);
 check(native.exports.NormalizeRawMeanRect(start,128,ptr,128)===-2,'Rect nonfinite accepted');
 check(new Float32Array(memory.buffer,ptr,128).every(v=>v===123),'Rect reject changed output');
 cases.push({name:'dedicated rect native ABI uses i/8 and rejects wrongcount/capacity/nonfinite',status:'PASS'});
 const before=space.stats().memoryBytes;
 const syntheticLegacy={dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:interop.WAN21_VAE_SHA256,data:new Float32Array(128)};
 for(let i=0;i<50;i++){for(const {tensor} of loaded)space.restoreRawMean(space.normalizeRawMean(tensor));space.normalizeRawMean(syntheticLegacy);}
 check(space.stats().memoryBytes===before,'Mixed profiles grew Memory');
 cases.push({name:'three explicitly supported profiles reuse fixed arena without caller shape reinterpretation',status:'PASS'});
 const stats=space.stats();space.dispose();reject(()=>space.normalizeRawMean(rect));
 cases.push({name:'rect disposed operations rejected',status:'PASS'});
 return{scope:'Git-received actual diagnostic VAE means + Hike/codec; no VAE NN rerun or generated sample',cases,outputs,stats,wasmSHA256:await digest(bytes),roundTripTolerance:2e-6,actualManifestsReceived:true,actualMeanFixturesReceived:true,actualGraphBundleReceived:false,vaeNeuralExecutionByThisTest:false,jsNumericalFallback:false};
}

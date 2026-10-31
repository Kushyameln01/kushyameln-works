import {createLatentSpace} from './latent-space.mjs';
import {WAN21_VAE_SHA256} from '../tensor-interop.mjs';
import {encodeTensor,decodeTensor} from '../../inference/tensor.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const f=Math.fround;
// Independent staged-f32 oracle copied from fixed ComfyUI constants, not kernel output.
const mean=Float32Array.from([-.7571,-.7089,-.9113,.1075,-.1745,.9653,-.1517,1.5508,.4134,-.0715,.5517,-.3632,-.1922,-.9497,.2503,-.2921]);
const std=Float32Array.from([2.8184,1.4541,2.3275,2.6558,1.2196,1.7708,2.6052,2.0743,3.2687,2.1526,2.8652,1.5579,1.6382,1.1253,2.8251,1.9160]);
const norm=(v,c)=>f(f(f(v-mean[c])*1)/std[c]);
const restore=(v,c)=>f(f(f(v*std[c])/1)+mean[c]);
const digest=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
const expectThrow=fn=>{let rejected=false;try{fn();}catch{rejected=true;}check(rejected,'Expected rejection');};
const raw=data=>({dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:WAN21_VAE_SHA256,data});
export async function runCases(read){
 const bytes=await read('build/latent-space.wasm'),space=await createLatentSpace(bytes),cases=[];
 const run=(name,fn)=>{fn();cases.push({name,status:'PASS'});};
 const x=Float32Array.from({length:128},(_,i)=>(i%17-8)/4),input=raw(x),originalSnapshot=x.slice();let normalized,restored;
 run('all16channels use exact source-ordered f32 normalization',()=>{
  normalized=space.normalizeRawMean(input);check(normalized.meaning==='wan21-normalized-posterior-mean:v1'&&normalized.normalization==='wan21-comfy-f32-v1','Meaning marker');
  normalized.data.forEach((v,i)=>check(Object.is(v,norm(x[i],Math.floor(i/8))),`Normalize channel${Math.floor(i/8)} index${i}`));
 });
 run('restore uses multiply divide add order for all16channels',()=>{
  const fixture={...normalized,data:Float32Array.from({length:128},(_,i)=>(i%13-6)/8)};const y=space.restoreRawMean(fixture);
  y.data.forEach((v,i)=>check(Object.is(v,restore(fixture.data[i],Math.floor(i/8))),'Restore exactf32'));
  check(y.meaning==='raw-posterior-mean'&&y.normalization===undefined,'Restore raw metadata');
 });
 let maxRoundTripError=0;
 run('roundtrip stays within predeclared2e-6 tolerance',()=>{
  restored=space.restoreRawMean(normalized);restored.data.forEach((v,i)=>{maxRoundTripError=Math.max(maxRoundTripError,Math.abs(v-x[i]));});check(maxRoundTripError<=2e-6,'Roundtrip tolerance');
 });
 run('raw zeros are normalized perchannel rather than skipped',()=>{
  const y=space.normalizeRawMean(raw(new Float32Array(128)));y.data.forEach((v,i)=>check(Object.is(v,norm(0,Math.floor(i/8))),'Allzero specialcase was incorrectly applied'));
 });
 run('meaning model shape finite and normalization provenance rejected',()=>{
  // The formerly rejected [1,16,1,2,4] now has its own approved Rect profile.
  for(const fixture of [{...input,meaning:'generated-samples'},{...input,modelSha256:'0'.repeat(64)},{...input,shape:[1,16,2,1,4]},{...input,data:new Float32Array(128).fill(NaN)},{...input,normalization:'wan21-comfy-f32-v1'}])expectThrow(()=>space.normalizeRawMean(fixture));
  for(const fixture of [{...normalized,meaning:'generated-samples'},{...normalized,normalization:'other'},{...normalized,modelSha256:undefined},{...normalized,attentionMask:new Uint8Array([1])}])expectThrow(()=>space.restoreRawMean(fixture));
 });
 run('owned arrays metadata and repeated memory are preserved',()=>{
  check(normalized.data.buffer!==input.data.buffer&&normalized.shape!==input.shape,'Ownership alias');check(normalized.modelSha256===WAN21_VAE_SHA256,'VAE provenance');
  const before=space.stats().memoryBytes;for(let i=0;i<100;i++){space.normalizeRawMean(input);space.restoreRawMean(normalized);}check(space.stats().memoryBytes===before,'Repeated memory growth');
  const isolated=space.normalizeRawMean(input);isolated.data[0]=999;isolated.shape[0]=7;check(input.data.every((v,i)=>Object.is(v,originalSnapshot[i]))&&input.shape.join(',')==='1,16,2,2,2','Input mutated');
 });
 const persisted=await encodeTensor(normalized),readBack=await decodeTensor(persisted);check(readBack.normalization===undefined,'Codec changed unexpectedly');
 const binaryRestored=space.restoreRawMean(readBack);binaryRestored.data.forEach((v,i)=>check(Math.abs(v-x[i])<=2e-6,'Normalized WKTENSOR roundtrip'));cases.push({name:'existing WKTENSOR codec preserves versioned meaning and restoresraw',status:'PASS'});
 const nativeModule=await WebAssembly.compile(bytes),native=new WebAssembly.Instance(nativeModule,{}),mem=native.exports.memory,start=mem.buffer.byteLength;mem.grow(1);const view=new DataView(mem.buffer);view.setFloat32(start,NaN,true);view.setFloat32(start+512,123,true);
 check(native.exports.NormalizeRawMean(start,128,start+512,128)===-2,'Native nonfinite input accepted');check(native.exports.RestoreRawMean(start,127,start+512,128)===-1,'Native profile count accepted');check(native.exports.NormalizeRawMean(start,128,start+512,127)===-1,'Native capacity accepted');check(view.getFloat32(start+512,true)===123,'Invalid native input changedoutput');cases.push({name:'native WASM rejects nonfinite and profile/capacity errors before writes',status:'PASS'});
 const mutated=bytes.slice();mutated[mutated.length-1]^=1;let rejected=false;try{await createLatentSpace(mutated);}catch{rejected=true;}check(rejected,'Corrupt WASM bytes accepted');cases.push({name:'WASM hash mismatch rejects without fallback',status:'PASS'});
 const stats=space.stats();space.dispose();expectThrow(()=>space.normalizeRawMean(input));expectThrow(()=>space.restoreRawMean(normalized));cases.push({name:'disposed factory rejects operations',status:'PASS'});
 return{scope:'Wan21 raw posterior-mean normalization only; no generatedsamples or model inference',cases,wasmSha256:await digest(bytes),normalizedSha256:await digest(new Uint8Array(normalized.data.buffer)),restoredSha256:await digest(new Uint8Array(restored.data.buffer)),maxRoundTripError,roundTripTolerance:2e-6,stats,jsNumericalFallback:false,callerBuffersPreserved:true};
}

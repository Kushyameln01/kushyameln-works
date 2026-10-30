// Independent test oracle only. Never imported by the numerical host.
import {createLinearKernel} from './linear-kernel.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const close=(a,b,t=0)=>check(Math.abs(a-b)<=t,`${a} != ${b} tolerance ${t}`);
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const f32Bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
export async function runCases(read){
 const wasm=await read('build/linear.wasm'),record=JSON.parse(new TextDecoder().decode(await read('build/build-record.json')));
 const module=await WebAssembly.compile(wasm);check(WebAssembly.Module.imports(module).length===0,'Imports must be empty');
 const kernel=createLinearKernel(module),cases=[];
 const run=(name,fn)=>{fn();cases.push({name,status:'PASS'});};
 run('literal E4M3FN zeros/subnormals/normal/max',()=>{
  const decoded=kernel.decode(new Uint8Array([0,128,1,129,7,8,56,184,126,254]));
  const expected=[0,-0,1/512,-1/512,7/512,1/64,1,-1,448,-448];
  decoded.forEach((v,i)=>check(Object.is(v,expected[i]),`decode ${i} ${v}`));
 });
 run('both E4M3FN NaN codes rejected',()=>{for(const n of [127,255]){let failed=false;try{kernel.decode(new Uint8Array([56,n]));}catch{failed=true;}check(failed,'NaN byte accepted');}});
 run('literal linear applies scale before dot and bias last',()=>{
  close(kernel.linear(new Uint8Array([56,64,192]),1,3,.25,new Float32Array([.125]),new Float32Array([.5,-1,2]))[0],-1.25);
 });
 run('shape scale finite and limits checked',()=>{
  const invalid=[()=>kernel.linear(new Uint8Array([56]),1,2,1,new Float32Array([0]),new Float32Array([1])),()=>kernel.linear(new Uint8Array([56]),1,1,0,new Float32Array([0]),new Float32Array([1])),()=>kernel.linear(new Uint8Array([56]),1,1,1,new Float32Array([0]),new Float32Array([NaN])),()=>kernel.linear(new Uint8Array([56]),1,1,1,new Float32Array([Infinity]),new Float32Array([1]))];
  for(const op of invalid){let failed=false;try{op();}catch{failed=true;}check(failed,'invalid input accepted');}
 });
 run('native WASM rejects non-finite scale/input and capacity before output',()=>{
  const raw=new WebAssembly.Instance(module,{}),m=raw.exports.memory,start=m.buffer.byteLength;m.grow(1);
  const b=new Uint8Array(m.buffer),v=new DataView(m.buffer),q=start,bias=start+128,x=start+160,out=start+192;
  b[q]=56;v.setFloat32(bias,0,true);v.setFloat32(x,1,true);v.setFloat32(out,123,true);
  check(raw.exports.Fp8Linear(q,1,1,Infinity,bias,x,out,1)===-2,'Infinite native scale accepted');
  v.setFloat32(x,NaN,true);check(raw.exports.Fp8Linear(q,1,1,1,bias,x,out,1)===-2,'Native NaN input accepted');
  v.setFloat32(x,1,true);check(raw.exports.Fp8Linear(q,1,1,1,bias,x,out,0)===-1,'Native output capacity ignored');
  b[q]=127;check(raw.exports.Fp8Linear(q,1,1,1,bias,x,out,1)===-2,'Native NaN weight accepted');
  check(v.getFloat32(out,true)===123,'Invalid native input changed output');
 });
 run('sequential f32 accumulation is explicit',()=>{
  const y=kernel.linear(new Uint8Array([56,56,56]),1,3,1,new Float32Array([0]),new Float32Array([16777216,1,-16777216]));close(y[0],0);
 });
 const fixture=JSON.parse(new TextDecoder().decode(await read('work/fixture.json'))),results=[];
 for(const item of fixture.models){
  const q=await read(item.tileFile),biasBytes=await read(item.biasFile),bias=new Float32Array(biasBytes.slice().buffer);
  const x=Float32Array.from({length:5120},(_,i)=>((i%31)-15)/64);
  const originalQ=q.slice(),originalX=x.slice(),before=kernel.stats();
  let y;const t0=performance.now();y=kernel.linear(q,16,5120,item.scale,bias,x);const elapsedMs=performance.now()-t0;
  for(let i=0;i<16;i++){
   check(Object.is(y[i],item.expectedStagedF32[i]),`${item.role} staged f32 mismatch ${i}: ${y[i]} vs ${item.expectedStagedF32[i]}`);
   close(y[i],item.expectedDouble[i],fixture.tolerance.absolute+fixture.tolerance.relative*Math.abs(item.expectedDouble[i]));
  }
  check(q.every((v,i)=>v===originalQ[i])&&x.every((v,i)=>Object.is(v,originalX[i])),'Original input mutated');
  for(let i=0;i<100;i++)kernel.linear(q,16,5120,item.scale,bias,x);
  const after=kernel.stats();check(before.memoryBytes===after.memoryBytes,'Memory grew during repeated calls');
  const yh=await digest(f32Bytes(y));check(yh===item.expectedStagedF32Sha256,'Output hash mismatch');
  results.push({role:item.role,sourceSha256:item.sourceSha256,weightKey:item.weightKey,tileSha256:await digest(q),scale:item.scale,output:Array.from(y),outputSha256:yh,stagedF32Exact:true,doubleTolerancePassed:true,elapsedMs,memory:after,repeatCalls:101,ownership:'Original JS buffers preserved; copy into fixed private WASM arena; copied output'});
 }
 kernel.dispose();let rejected=false;try{kernel.decode(new Uint8Array([56]));}catch{rejected=true;}check(rejected,'Disposed kernel still runs');
 return {scope:'Actual16x5120 weight rows; synthetic deterministic input; candidate only, no model prediction or original scaled_mm equivalence',runtime:typeof navigator==='object'?navigator.userAgent:'Node '+process.version,wasmSha256:await digest(wasm),sourceSha256:record.sourceSha256,cases,results,disposed:true,jsNumericalFallback:false};
}

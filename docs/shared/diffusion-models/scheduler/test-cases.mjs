import {createSchedulerKernel} from './scheduler-kernel.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const f=Math.fround;
const digest=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
const expectThrow=fn=>{let yes=false;try{fn();}catch{yes=true;}check(yes,'Expected rejection');};
export async function runCases(read){
 const bytes=await read('build/scheduler.wasm'),module=await WebAssembly.compile(bytes),k=createSchedulerKernel(module),cases=[];
 const run=(name,fn)=>{fn();cases.push({name,status:'PASS'});};
 const expected=[1,0.9617158770561218,0.9092148542404175,0.8333333134651184,0.7148972749710083,0.5005995035171509,0];
 let schedule;
 run('simple6 selects exact discrete shifted table positions and split overlap',()=>{
  schedule=k.schedule();check(schedule.sigmas.length===7,'Length');check(schedule.sigmas.every((s,i)=>Object.is(s,expected[i])),'Exact staged f32 sigmas');
  check(Array.from(schedule.tableIndices).join(',')==='999,833,666,499,333,166','0-based table indices');
  check(schedule.highSigmas.length===4&&schedule.lowSigmas.length===4,'Stage lengths');
  check(schedule.highSigmas[3]===schedule.lowSigmas[0]&&schedule.highSigmas[3]===expected[3],'Split3 overlap');
 });
 run('CONST noise mix uses supplied noise and latent without new RNG',()=>{
  const n=new Float32Array([2,-2,1,0]),l=new Float32Array([4,2,-1,3]);const result=k.noiseMix(n,l,.25,1);
  check(Array.from(result).join(',')==='3.5,1,-0.5,2.25','Literal noise mix');check(n[0]===2&&l[0]===4,'Inputs mutated');
  check(k.noiseMix(n,l,0,1).every((x,i)=>Object.is(x,l[i])),'Sigma0 latent');check(k.noiseMix(n,l,1,1).every((x,i)=>Object.is(x,n[i])),'Sigma1 noise');
 });
 run('CONST inverse scaling and LOW no-noise handoff preserve source ordering',()=>{
  const high=new Float32Array([1,-2,3]),sigma=expected[3],inv=k.inverseNoiseScale(high,sigma),low=k.noiseMix(new Float32Array(3),inv,sigma,1);
  const denom=f(1-sigma);inv.forEach((v,i)=>check(Object.is(v,f(high[i]/denom)),'Inverse ordering'));
  low.forEach((v,i)=>check(Object.is(v,f(f(sigma*f(1*0))+f(denom*inv[i]))),'LOW zero-noise scaling'));
 });
 run('flow velocity is converted to denoised tensor before Euler derivative',()=>{
  const input=new Float32Array([2,-1,0]),v=new Float32Array([1,2,-3]);const result=k.flowDenoised(input,v,.5);
  check(Array.from(result).join(',')==='1.5,-2,1.5','Literal flow denoised');
 });
 run('timestep multiplier stays1000 in f32',()=>{
  const ts=k.timesteps(schedule.sigmas);ts.forEach((v,i)=>check(Object.is(v,f(expected[i]*1000)),'timestep f32'));
 });
 run('bounded chunks preserve exact pointwise f32 operation order',()=>{
  const n=Float32Array.from({length:8193},(_,i)=>(i%23-11)/16),l=Float32Array.from({length:8193},(_,i)=>(i%19-9)/32);
  const sigma=expected[4],s=f(.7),y=k.noiseMix(n,l,sigma,s);
  y.forEach((v,i)=>check(Object.is(v,f(f(sigma*f(s*n[i]))+f(f(1-sigma)*l[i]))),'mix chunk f32'));
 });
 run('invalid sigma,nonfinite arrays,shape and disposed calls rejected',()=>{
  expectThrow(()=>k.inverseNoiseScale(new Float32Array([1]),1));expectThrow(()=>k.noiseMix(new Float32Array([1]),new Float32Array([1]),-1,1));
  expectThrow(()=>k.flowDenoised(new Float32Array([1]),new Float32Array([NaN]),.5));expectThrow(()=>k.noiseMix(new Float32Array([1]),new Float32Array(2),.5,1));
 });
 run('native kernel validates singularsigma capacities and NaN before writes',()=>{
  const raw=new WebAssembly.Instance(module,{}),mem=raw.exports.memory,start=mem.buffer.byteLength;mem.grow(1);const v=new DataView(mem.buffer),a=start,b=start+32,out=start+64;
  v.setFloat32(a,2,true);v.setFloat32(b,4,true);v.setFloat32(out,123,true);
  check(raw.exports.ConstInverse(a,1,1,out,1)===-2,'Native inverse sigma1 accepted');
  check(raw.exports.ConstNoiseMix(a,b,1,NaN,1,out,1)===-2,'Native NaN sigma accepted');
  check(raw.exports.FlowDenoised(a,b,1,.5,out,0)===-1,'Native capacity accepted');
  check(raw.exports.FlowSchedule(a,999,b,7,out,6)===-1,'Native table capacity accepted');
  check(v.getFloat32(out,true)===123,'Invalid input wrote output');
 });
 const before=k.stats();for(let i=0;i<100;i++){k.schedule();k.noiseMix(new Float32Array([2,3]),new Float32Array([4,5]),.5,1);}const after=k.stats();check(after.memoryBytes===before.memoryBytes,'Memory grows in repeat');
 k.dispose();expectThrow(()=>k.schedule());
 return{scope:'Hike scheduler+CONST primitives; fixednoise inputs; no neuralnetwork or model inference',cases,sigmas:Array.from(schedule.sigmas),tableIndices:Array.from(schedule.tableIndices),highSigmas:Array.from(schedule.highSigmas),lowSigmas:Array.from(schedule.lowSigmas),sigmasSha256:await digest(new Uint8Array(schedule.sigmas.buffer)),wasmSha256:await digest(bytes),stats:after,repeatCycles:100,disposed:true,jsNumericalFallback:false};
}

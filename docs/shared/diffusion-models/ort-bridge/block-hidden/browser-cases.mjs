import * as ort from '../../../inference/vendor/ort.wasm.min.mjs';
import {createDynamicLinear} from './linear.mjs';
const demand=(b,m)=>{if(!b)throw Error(m);};
export async function testLinear(){
 const out={};const op=await createDynamicLinear({includeSilu:false});
 try{
  demand(op.describe().sessionCreations===1,'downstream linear must omit SiLU session');
  const x=new Float32Array([1,2,3,4]),weight=new Float32Array([2,3,4,5]);
  const pending=op.run({x,weight,rows:2,inner:2,columns:2});x.fill(999);weight.fill(999);
  const result=await pending;demand(String([...result.output])==='8,14,18,32','Gemm must own inputs before await');
  const c=new AbortController();const p=op.run({x:new Float32Array([1]),weight:new Float32Array([2]),rows:1,inner:1,columns:1,signal:c.signal});c.abort();await p.then(()=>{throw Error('abort returned result');},e=>demand(e.name==='AbortError','abort reason'));
  const recovered=await op.run({x:new Float32Array([3]),weight:new Float32Array([2]),rows:1,inner:1,columns:1});demand(recovered.output[0]===6,'after abort reuse');
  const proto=ort.Tensor.prototype,original=proto.dispose;let once=true;proto.dispose=function(){if(once){once=false;throw Error('injected actual tensor cleanup failure');}return original.call(this);};
  try{await op.run({x:new Float32Array([3]),weight:new Float32Array([2]),rows:1,inner:1,columns:1}).then(()=>{throw Error('cleanup failure hidden');},e=>demand(String(e).includes('cleanup'),'cleanup error'));
   demand(!op.stats().busy,'failed tensor dispose must release BUSY');demand(op.stats().cleanupPending,'failed native handle remains in closing state');
  }finally{proto.dispose=original;}
  await op.recover();demand(op.stats().disposed,'recover must reclaim failed handle');out.passed=true;out.stats=op.stats();return out;
 }finally{await op.dispose();}
}
export async function testPrefix(reference,file){
 const module=await import('./stage.mjs').catch(()=>({}));demand(typeof module.createBlockHiddenPrefix==='function','new actual-derived prefix stage required');
 const op=await module.createBlockHiddenPrefix({file,side:reference.meta.side});
 try{
  const rawMean={...reference.input.rawMean,data:new Float32Array(reference.input.rawMean.data)},noise=new Float32Array(reference.input.noise);
  const cancelled=new AbortController();let abortProgress=false;
  await op.run({rawMean,noise,noiseScale:1,scheduleIndex:reference.meta.globalSigmaIndex,signal:cancelled.signal,onProgress(){abortProgress=true;cancelled.abort();}}).then(()=>{throw Error('prefix cancelled run returned output');},e=>demand(e.name==='AbortError','prefix cancellation reason'));
  demand(abortProgress&&!op.stats().busy,'cancelled prefix releases BUSY');
  let reentered;const bad={get rawMean(){reentered=op.run({}).catch(e=>e);return rawMean;},noise,noiseScale:0,scheduleIndex:reference.meta.globalSigmaIndex};await op.run(bad).catch(()=>{});demand(String(await reentered).includes('busy'),'reentrant getter must observe BUSY');
  const call=op.run({rawMean,noise,noiseScale:1,scheduleIndex:reference.meta.globalSigmaIndex});rawMean.data.fill(999);noise.fill(999);const result=await call;
  result.evidence.boundaryTests={cancelledAtFirstWeightTile:true,reentrantGetterRejected:true,inputSnapshotBeforeAwait:true,reusedAfterAbort:true};
  return result;
 }finally{await op.dispose();}
}

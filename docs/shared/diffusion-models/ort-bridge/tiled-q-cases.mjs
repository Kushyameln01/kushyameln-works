const ensure=(v,m)=>{if(!v)throw Error(m);};
async function rejects(fn,label){let error;try{await fn();}catch(e){error=e;}ensure(error,label);return String(error.message??error);}
function comparison(actual,expected,tolerance){
 ensure(actual.length===expected.length,'Output length mismatch');let maxAbsolute=0,maxRelative=0,failed=0;
 for(let i=0;i<actual.length;i++){const e=expected[i],a=actual[i],d=Math.abs(a-e);maxAbsolute=Math.max(maxAbsolute,d);maxRelative=Math.max(maxRelative,d/Math.max(Math.abs(e),1e-30));if(!Number.isFinite(a)||d>tolerance.absolute+tolerance.relative*Math.abs(e))failed++;}
 ensure(failed===0,'Independent reference gate failed: '+failed+' values, max absolute '+maxAbsolute);return {compared:actual.length,failed,maxAbsolute,maxRelative,tolerance};
}
const activation=()=>Float32Array.from({length:5120},(_,i)=>Math.fround(((i%31)-15)/64));
export async function runTiledQCases(file,reference){
 let api;try{api=await import('./tiled-q.mjs');}catch{}
 ensure(typeof api?.createTiledQProjection==='function','Missing output-row tiled Q execution candidate');
 const cases=[],op=await api.createTiledQProjection({file,side:'LOW'});
 try{
  const x=activation(),expected=new Float32Array(reference.expected);
  const small=await op.run({x,rows:16});
  ensure(small.evidence.scope==='ONE_TOKEN_SELECTED_Q_ROWS','Small row subset was mislabeled as full-Q execution');
  const smallComparison=comparison(small.output,expected.subarray(0,16),reference.tolerance);
  cases.push({name:'small 16-output boundary uses actual original base, Hike and ORT',passed:true,comparison:smallComparison,evidence:small.evidence});
  let progress=0,lastProgress;
  const pending=op.run({x,rows:5120,onProgress:p=>{progress++;lastProgress=p;if(progress===1)x.fill(999);}});
  await rejects(()=>op.run({x:activation(),rows:16}),'Concurrent tile run accepted');
  await rejects(()=>op.dispose(),'Active tiled operator was disposed');
  const full=await pending;
  ensure(full.evidence.scope==='ONE_TOKEN_FULL_Q_ROWS','Full Q execution scope missing');
  const fullComparison=comparison(full.output,expected,reference.tolerance);
  ensure(full.output.length===5120&&progress===320&&lastProgress.completedRows===5120,'Full model output rows not executed');
  ensure(x[0]===999&&x.byteLength===20480,'Caller activation was mutated or detached');
  ensure(full.evidence.ortSessionCreations===1,'ORT session was recreated across row tiles');
  ensure(full.evidence.providerHikeStart.memoryBytes===full.evidence.providerHikeEnd.memoryBytes,'Provider Hike Memory grew across row tiles');
  ensure(full.evidence.stageHikeFirst.memoryBytes===full.evidence.stageHikeLast.memoryBytes,'Stage Hike Memory grew across row tiles');
  cases.push({name:'actual full Q [5120,5120] maps one activation to all5120 outputs in320tiles',passed:true,comparison:fullComparison,evidence:full.evidence});
  const statsCopy=op.stats();statsCopy.stageHikeLast.memoryBytes=0;ensure(op.stats().stageHikeLast.memoryBytes>0,'Stats exposed mutable private stage metadata');
  const controller=new AbortController();let stopProgress=0;
  const cancelled=op.run({x:activation(),rows:32,signal:controller.signal,onProgress:()=>{stopProgress++;controller.abort();}});
  const cancellationError=await rejects(()=>cancelled,'Cancelled tiled result accepted');
  ensure(stopProgress===1,'Cancellation continued to consume extra row tiles');
  const after=await op.run({x:activation(),rows:16});comparison(after.output,expected.subarray(0,16),reference.tolerance);
  await rejects(()=>op.run({x:new Float32Array(1),rows:16}),'Wrong activation shape accepted');
  const bad=activation();bad[0]=NaN;await rejects(()=>op.run({x:bad,rows:16}),'Nonfinite activation accepted');
  for(const rows of [0,15,17,5121])await rejects(()=>op.run({x:activation(),rows}),'Unsupported row count accepted');
  cases.push({name:'tile-boundary cancellation, reuse, capacity/shape/nonfinite guards',passed:true,cancellationError,completedBeforeCancel:stopProgress});
  return {passed:true,scope:'one-token full-Q output-row tiling only; not attention/full block/predict/sample or production FP8 scaled_mm equivalence',cases,resources:op.stats()};
 }finally{await op.dispose();}
}

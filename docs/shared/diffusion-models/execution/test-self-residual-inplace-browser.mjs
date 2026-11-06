// Native evidence only. The driver adds a private test method to captured
// candidate bytes; production exports and public runtime inputs are unchanged.
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const check=(condition,message)=>{if(!condition)throw Error(message);};
export async function runSelfResidualInplaceTest(file){
 const {createFullModelWeightSource}=await import('./model-weights.mjs'),{createModelMath}=await import('./model-math.mjs'),{createBatchedModelOps}=await import('./batched-ops.mjs');
 const source=await createFullModelWeightSource({file,side:'LOW',decoder:'lookup',readAheadBytes:1048576}),math=await createModelMath(),ops=await createBatchedModelOps({numThreads:1});
 const total=259,W=5120,input=Float32Array.from({length:total*W},(_,i)=>((i*17+11)%257-128)/1024),initial=new Float32Array(input),raw=(await source.readVector('blocks.0.modulation',0,6*W)).values,modulation=Array.from({length:6},(_,i)=>raw.slice(i*W,(i+1)*W));
 const positions=Float32Array.from({length:total*3},(_,i)=>i%3===0?Math.floor(i/3)%7:i%3===1?Math.floor(i/3)%13:Math.floor(i/3)%19),ids=Int32Array.from({length:total},(_,i)=>i%3),sequence={readPositions(start,rows){return {positions:positions.slice(start*3,(start+rows)*3),sourceIds:ids.slice(start,start+rows)};}};
 const results=[],outputs=[];let failed=0,maxAbsolute=0,maxNormalized=0;
 try{
  for(const variant of ['separate','inplace']){
   const {createBerniniModelCandidate}=await import('./model-candidate.mjs?self-residual-'+variant),owner=await createBerniniModelCandidate({source,math,ops}),ownedInput=new Float32Array(initial),projected=new Map(),chunks=[],progress=[];
   const onRows=async(name,p)=>{chunks.push({name,start:p.globalRowStart,rows:p.rowCount,sha256:await hash(p.data)});if(name==='oProjection')projected.set(p.globalRowStart,new Float32Array(p.data));if(name==='selfResidual'){const o=projected.get(p.globalRowStart);for(let i=0;i<p.data.length;i++){const reference=initial[p.globalRowStart*W+i]+o[i]*modulation[2][i%W],error=Math.abs(p.data[i]-reference),gate=0.00001+0.000001*Math.abs(reference);maxAbsolute=Math.max(maxAbsolute,error);maxNormalized=Math.max(maxNormalized,error/gate);if(!Number.isFinite(error)||error>gate)failed++;}projected.delete(p.globalRowStart);}};
   try{
    const out=await owner.__testSelfResidual(ownedInput,sequence,total,modulation,undefined,(stage,_block,done)=>progress.push({stage,done}),onRows);
    check((out===ownedInput)===(variant==='inplace'),'Input reuse contract differs');check(owner.stats().peakHiddenStoreBytes===(variant==='inplace'?3:4)*total*W*4,'Logical hidden span count differs');
    if(variant==='separate')check(await hash(ownedInput)===await hash(initial),'Separate-output input mutated');outputs.push(new Uint32Array(out.buffer).slice());
    results.push({variant,outputSHA256:await hash(out),chunks,progress,hiddenStores:owner.stats().activeHiddenStores,peakHiddenStoreBytes:owner.stats().peakHiddenStoreBytes,stageWeightCacheBytes:owner.stats().stageWeightCacheBytes,ops:ops.stats()});
   }finally{await owner.dispose();}
  }
  check(outputs[0].length===outputs[1].length&&outputs[0].every((v,i)=>v===outputs[1][i]),'Native old/new output bit mismatch');
  check(JSON.stringify(results[0].chunks)===JSON.stringify(results[1].chunks),'Native old/new intermediate chunk mismatch');check(JSON.stringify(results[0].progress)===JSON.stringify(results[1].progress),'Native old/new tile order mismatch');check(failed===0,'Independent F64 gate residual exceeded fixed gate');
  const stats=ops.stats();check(stats.preparedAttentionKV.currentBytes===0&&stats.preparedAttentionKV.ownedPairs===0,'Prepared K/V remained owned');
  return {passed:true,scope:'bounded LOW block0 real-weight self attention on explicit259-row deterministic hidden fixture; not full40, native Text provenance or original73947 acceptance',totalTokens:total,heads:40,queryRows:128,keyRows:256,allQueries:true,allKeys:true,inputSHA256:await hash(initial),positionsSHA256:await hash(positions),sourceIdsSHA256:await hash(ids),bitIdentical:true,independentF64Residual:{abs:0.00001,rel:0.000001,elements:total*W*2,failed,maxAbsolute,maxNormalizedToGate:maxNormalized},results,finalOperatorStats:stats};
 }finally{await ops.dispose();math.dispose();source.dispose();}
}

// Bounded native-ORT ownership/layout regression. No model or original-shape
// acceptance is claimed. The reference is test-only F64 full-row softmax.
const demand=(ok,message)=>{if(!ok)throw Error(message);};
const gate=Object.freeze({absolute:.001,relative:.0001});
const initial=queries=>({previousMax:new Float32Array(40*queries).fill(-3.4028234663852886e38),previousDenominator:new Float32Array(40*queries),previousContext:new Float32Array(40*queries*128)});
async function rejects(fn,pattern){try{await fn();}catch(error){demand(!pattern||pattern.test(String(error)),'Unexpected rejection: '+error);return error;}throw Error('Expected rejection: '+pattern);}
function sameBits(actual,expected,label){
 demand(actual.length===expected.length,label+' length');const a=new Uint32Array(actual.buffer,actual.byteOffset,actual.length),b=new Uint32Array(expected.buffer,expected.byteOffset,expected.length);
 demand(a.every((n,i)=>n===b[i]),label+' differs from the unchanged attentionTile graph');return {elements:a.length,bitExact:true};
}
function compare(actual,reference,label){
 demand(actual.length===reference.length,label+' length');let failed=0,maxAbsolute=0,maxRelative=0;
 for(let i=0;i<actual.length;i++){const error=Math.abs(actual[i]-reference[i]);maxAbsolute=Math.max(maxAbsolute,error);maxRelative=Math.max(maxRelative,error/Math.max(1e-30,Math.abs(reference[i])));if(!Number.isFinite(actual[i])||!Number.isFinite(reference[i])||error>gate.absolute+gate.relative*Math.abs(reference[i]))failed++;}
 demand(failed===0,label+' failed '+failed+' values; max absolute '+maxAbsolute);return {elements:actual.length,failed,maxAbsolute,maxRelative,gate};
}
function fixture(queries,keys,offset=0){
 const heads=40,headDim=128,q=new Float32Array(heads*queries*headDim),k=new Float32Array(heads*keys*headDim),v=new Float32Array(k.length);
 for(let h=0;h<heads;h++){
  for(let r=0;r<queries;r++)for(let d=0;d<headDim;d++)q[(h*queries+r)*headDim+d]=((h*7+r*3+d*5)%29-14)/32;
  for(let j=0;j<keys;j++)for(let d=0;d<headDim;d++){const at=(h*keys+j)*headDim+d;k[at]=((h*11+(j+offset)*7+d*3)%31-15)/32+(j+offset)/1024;v[at]=((h*13+(j+offset)*5+d*7)%37-18)/16;}
 }return {q,k,v,heads,headDim,queries,keys};
}
function reference(parts){
 const {q,heads,queries,headDim}=parts[0],keys=parts.reduce((sum,p)=>sum+p.keys,0),max=new Float64Array(heads*queries),denominator=new Float64Array(max.length),context=new Float64Array(max.length*headDim),scores=new Float64Array(keys),scale=Math.fround(1/Math.sqrt(128));
 for(let h=0;h<heads;h++)for(let r=0;r<queries;r++){
  const row=h*queries+r;let top=-Infinity,at=0;
  for(const p of parts)for(let j=0;j<p.keys;j++){let score=0;for(let d=0;d<headDim;d++)score+=q[row*headDim+d]*p.k[(h*p.keys+j)*headDim+d];score*=scale;scores[at++]=score;top=Math.max(top,score);}
  max[row]=top;at=0;
  for(const p of parts)for(let j=0;j<p.keys;j++){const probability=Math.exp(scores[at++]-top);denominator[row]+=probability;for(let d=0;d<headDim;d++)context[row*headDim+d]+=probability*p.v[(h*p.keys+j)*headDim+d];}
 }return {max,denominator,context,keys};
}
const prepare=(op,p,keyStart,ownership='copy')=>op.prepareAttentionKV({k:p.k,v:p.v,heads:p.heads,keys:p.keys,headDim:p.headDim,keyStart,ownership});
const begin=(op,p,expectedKeys=p.keys)=>op.beginAttentionQuery({q:p.q,heads:p.heads,queries:p.queries,headDim:p.headDim,expectedKeys});

export async function runPreparedAttentionKVTests({numThreads=1}={}){
 const {createBatchedModelOps}=await import('./batched-ops.mjs'),op=await createBatchedModelOps({numThreads}),cases=[];
 try{
  for(const name of ['prepareAttentionKV','releaseAttentionKV','attentionQueryPreparedTile'])demand(typeof op[name]==='function','Missing prepared attention API '+name);
  demand(numThreads!==4||crossOriginIsolated===true,'Explicit4 must run in an isolated realm');
  for(const parts of [[fixture(3,256),fixture(3,219,256)],[fixture(91,3)],[fixture(128,256)]]){
   const expected=reference(parts),queries=parts[0].queries,keys=expected.keys;let old=initial(queries);
   for(const p of parts){const result=await op.attentionTile({...p,...old});old={previousMax:result.max,previousDenominator:result.denominator,previousContext:result.context};}
   const before=op.stats(),handles=[];let keyStart=0;
   for(const p of parts){
    const k=new Float32Array(p.k),v=new Float32Array(p.v),handle=prepare(op,{...p,k,v},keyStart);handles.push(handle);keyStart+=p.keys;
    demand(Object.isFrozen(handle)&&!('data' in handle)&&!('k' in handle)&&!('v' in handle),'K/V handle must expose metadata only');k.fill(999);v.fill(999);
   }
   const prepared=op.stats(),kvBytes=parts.reduce((n,p)=>n+p.k.byteLength+p.v.byteLength,0);
   demand(prepared.preparedAttentionKV.ownedPairs===handles.length,'Prepared owner must retain one pair per tile');
   demand(prepared.preparedAttentionKV.currentBytes===kvBytes,'Prepared owner byte accounting');
   const results=[];
   for(let reuse=0;reuse<2;reuse++){
    const q=new Float32Array(parts[0].q),handle=begin(op,{...parts[0],q},keys);q.fill(999);let consumed=0;
    for(let i=0;i<handles.length;i++){const result=await op.attentionQueryPreparedTile({queryHandle:handle,kvHandle:handles[i]});consumed+=parts[i].keys;demand(result.processedKeys===consumed&&result.expectedKeys===keys,'Ordered progress must match prepared tile ranges');}
    const result=op.finishAttentionQuery(handle);demand(op.releaseAttentionQuery(handle)===false,'Finish releases query');
    results.push({parity:{max:sameBits(result.max,old.previousMax,'max'),denominator:sameBits(result.denominator,old.previousDenominator,'denominator'),context:sameBits(result.context,old.previousContext,'context')},independent:{max:compare(result.max,expected.max,'max'),denominator:compare(result.denominator,expected.denominator,'denominator'),context:compare(result.context,expected.context,'context')}});
   }
   const after=op.stats();demand(after.inputCopyBytes-before.inputCopyBytes===kvBytes+2*parts[0].q.byteLength,'Only preparation copy and once-per-query Q capture may copy input');
   demand(after.attentionQueries.kvSnapshotBytes===before.attentionQueries.kvSnapshotBytes,'Prepared steps must not capture K/V again');
   for(const h of handles){demand(op.releaseAttentionKV(h)===true,'Release prepared pair');demand(op.releaseAttentionKV(h)===false,'Released pair cleanup is idempotent');}
   demand(op.stats().preparedAttentionKV.currentBytes===0&&op.stats().preparedAttentionKV.ownedPairs===0,'Prepared pool must return to zero');
   cases.push({name:'native prepared reuse Q'+queries+' all-'+keys+' keys',queries,keys,keyTiles:parts.map(p=>p.keys),phantomKeys:0,reuses:results,kvOwnedBytes:kvBytes,inputSnapshotBytes:after.inputCopyBytes-before.inputCopyBytes,nativeWasmCopiesMeasured:false});
  }

  const p=fixture(3,7),taken={...p,k:new Float32Array(p.k),v:new Float32Array(p.v)},takenHandle=prepare(op,taken,0,'take');
  demand(taken.k.byteLength===0&&taken.v.byteLength===0,'Take must detach both private input stores');
  const beforeCancel=op.stats(),preCancelled=new AbortController();preCancelled.abort();const untouched={...p,k:new Float32Array(p.k),v:new Float32Array(p.v)};
  await rejects(()=>op.prepareAttentionKV({...untouched,keyStart:0,ownership:'take',signal:preCancelled.signal}),/Abort/);
  demand(untouched.k.byteLength===p.k.byteLength&&untouched.v.byteLength===p.v.byteLength,'Cancelled preparation must not detach caller input');
  demand(op.stats().preparedAttentionKV.ownedPairs===beforeCancel.preparedAttentionKV.ownedPairs,'Cancelled preparation must not add owner');
  const malformed={...p,k:new Float32Array(p.k)};malformed.k[0]=NaN;await rejects(()=>prepare(op,malformed,0),/finite|F32|shape/i);
  await rejects(()=>prepare(op,p,1),/aligned|start|range/i);
  const h=begin(op,p),wrongStart=prepare(op,p,256),short=begin(op,p,6);
  await rejects(()=>op.attentionQueryPreparedTile({queryHandle:h,kvHandle:wrongStart}),/start|order|range|offset/i);
  await rejects(()=>op.attentionQueryPreparedTile({queryHandle:short,kvHandle:takenHandle}),/remaining|expected|exceed|range/i);
  await rejects(()=>op.attentionQueryPreparedTile({queryHandle:h,kvHandle:{...takenHandle}}),/foreign|owner|handle/i);
  await rejects(()=>op.attentionQueryPreparedTile({queryHandle:{...h},kvHandle:takenHandle}),/foreign|owner|handle/i);
  op.releaseAttentionQuery(short);op.releaseAttentionKV(wrongStart);
  const other=await createBatchedModelOps({numThreads});try{const foreign=prepare(other,p,0);try{await rejects(()=>op.attentionQueryPreparedTile({queryHandle:h,kvHandle:foreign}),/foreign|owner|handle/i);}finally{other.releaseAttentionKV(foreign);}}finally{await other.dispose();}
  const controller=new AbortController(),pending=op.attentionQueryPreparedTile({queryHandle:h,kvHandle:takenHandle,signal:controller.signal});
  await rejects(()=>op.releaseAttentionKV(takenHandle),/busy|active|await|lease/i);controller.abort();await rejects(()=>pending,/Abort/);
  demand(op.stats().attentionQueries.queries[0].processedKeys===0,'Aborted step must retain old state');
  await op.attentionQueryPreparedTile({queryHandle:h,kvHandle:takenHandle});const retried=op.finishAttentionQuery(h);compare(retried.context,reference([p]).context,'cancel/retry');
  op.releaseAttentionKV(takenHandle);const staleQuery=begin(op,p);await rejects(()=>op.attentionQueryPreparedTile({queryHandle:staleQuery,kvHandle:takenHandle}),/foreign|released|stale|handle/i);op.releaseAttentionQuery(staleQuery);
  cases.push({name:'take/copy ownership, finite gate, foreign/stale/range/order, cancellation retry and active release',passed:true});

  const fail=prepare(op,p,0),ort=await import('../../inference/vendor/ort.wasm.min.mjs'),originalDispose=ort.Tensor.prototype.dispose;let once=true;
  ort.Tensor.prototype.dispose=function(){if(once){once=false;throw Error('Injected prepared K/V tensor disposal failure');}return originalDispose.call(this);};
  try{await rejects(()=>op.releaseAttentionKV(fail),/release|cleanup|dispose|failure/i);demand(op.stats().cleanupPending,'Failed release must block execution');await rejects(()=>prepare(op,p,0),/cleanup|recover/i);}finally{ort.Tensor.prototype.dispose=originalDispose;}
  await op.recover();const final=op.stats();demand(final.disposed&&final.preparedAttentionKV.ownedPairs===0&&final.preparedAttentionKV.currentBytes===0,'Recovery must release retained pairs and sessions');
  cases.push({name:'native prepared tensor disposal failure retains ownership and recovery clears counters',passed:true});
  return {passed:true,scope:'Bounded native ORT preparation/resource regression only; no full-model or original-shape acceptance',gate,numThreads,crossOriginIsolated:globalThis.crossOriginIsolated===true,cases,stats:final};
 }finally{await op.dispose();}
}

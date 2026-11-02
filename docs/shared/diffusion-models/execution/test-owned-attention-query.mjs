// Browser-native resource-boundary regression only. This test neither loads
// model weights nor claims original-production-shape/model acceptance.
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
// Independent test-only F64 scalar oracle. Its accumulation order and full-row
// softmax differ from the tiled ORT implementation; only one score row is held.
function reference(parts){
 const {q,heads,queries,headDim}=parts[0],keys=parts.reduce((sum,p)=>sum+p.keys,0),max=new Float64Array(heads*queries),denominator=new Float64Array(max.length),context=new Float64Array(max.length*headDim),scores=new Float64Array(keys),scale=Math.fround(1/Math.sqrt(128));
 for(let h=0;h<heads;h++)for(let r=0;r<queries;r++){
  const row=h*queries+r;let top=-Infinity,at=0;
  for(const p of parts)for(let j=0;j<p.keys;j++){let score=0;for(let d=0;d<headDim;d++)score+=q[row*headDim+d]*p.k[(h*p.keys+j)*headDim+d];score*=scale;scores[at++]=score;top=Math.max(top,score);}
  max[row]=top;at=0;
  for(const p of parts)for(let j=0;j<p.keys;j++){const probability=Math.exp(scores[at++]-top);denominator[row]+=probability;for(let d=0;d<headDim;d++)context[row*headDim+d]+=probability*p.v[(h*p.keys+j)*headDim+d];}
 }return {max,denominator,context,keys};
}

export async function runOwnedAttentionQueryTests({numThreads=1}={}){
 const {createBatchedModelOps}=await import('./batched-ops.mjs'),op=await createBatchedModelOps({numThreads}),cases=[];
 try{
  for(const name of ['beginAttentionQuery','attentionQueryTile','finishAttentionQuery','releaseAttentionQuery'])demand(typeof op[name]==='function','Missing owned attention API '+name);
  for(const parts of [[fixture(3,7)],[fixture(3,256),fixture(3,7,256)]]){
   const expected=reference(parts),queries=3;let old=initial(queries);
   for(const p of parts){const result=await op.attentionTile({...p,...old});old={previousMax:result.max,previousDenominator:result.denominator,previousContext:result.context};}
   const before=op.stats(),q=new Float32Array(parts[0].q),handle=op.beginAttentionQuery({q,heads:40,queries,headDim:128,expectedKeys:expected.keys});q.fill(999);
   demand(Object.isFrozen(handle)&&!('data' in handle),'Query must be owner-local opaque metadata');
   let consumed=0;
   for(const p of parts){
    const k=new Float32Array(p.k),v=new Float32Array(p.v),work=op.attentionQueryTile({queryHandle:handle,k,v,keys:p.keys});k.fill(999);v.fill(999);const result=await work;consumed+=p.keys;
    demand(result.processedKeys===consumed&&result.expectedKeys===expected.keys&&!('context' in result)&&!('max' in result)&&!('denominator' in result),'Tile returns progress only; state stays private');
   }
   const result=op.finishAttentionQuery(handle),after=op.stats();demand(op.releaseAttentionQuery(handle)===false,'Finish must release query; explicit release remains idempotent');
   const expectedInput=parts[0].q.byteLength+parts.reduce((sum,p)=>sum+p.k.byteLength+p.v.byteLength,0),expectedOutput=result.max.byteLength+result.denominator.byteLength+result.context.byteLength;
   demand(after.inputCopyBytes-before.inputCopyBytes===expectedInput,'Q must be captured once and K/V once per tile');demand(after.outputCopyBytes-before.outputCopyBytes===expectedOutput,'Only finish copies state to caller');
   cases.push({name:'H40 Q3 all-'+expected.keys+'-key stream; exact tail and owned snapshots',keys:consumed,phantomKeys:0,parity:{max:sameBits(result.max,old.previousMax,'max'),denominator:sameBits(result.denominator,old.previousDenominator,'denominator'),context:sameBits(result.context,old.previousContext,'context')},independent:{max:compare(result.max,expected.max,'max'),denominator:compare(result.denominator,expected.denominator,'denominator'),context:compare(result.context,expected.context,'context')},inputSnapshotBytes:expectedInput,finishCopyBytes:expectedOutput,nativeWasmCopiesMeasured:false});
  }

  const rising=[fixture(3,7),fixture(3,7)];for(let i=0;i<2;i++){rising[i].q.fill(1);rising[i].k.fill(i);rising[i].v.fill(2+2*i);}
  const risingRef=reference(rising),risingHandle=op.beginAttentionQuery({...rising[0],expectedKeys:14});for(const p of rising)await op.attentionQueryTile({queryHandle:risingHandle,k:p.k,v:p.v,keys:p.keys});const raised=op.finishAttentionQuery(risingHandle);
  demand(raised.max.every(n=>n>0),'Second tile must raise every running maximum');cases.push({name:'rising maxima rescale retained native numerator and denominator',max:compare(raised.max,risingRef.max,'rising max'),denominator:compare(raised.denominator,risingRef.denominator,'rising denominator'),context:compare(raised.context,risingRef.context,'rising context')});

  const p=fixture(3,7),handle=op.beginAttentionQuery({...p,expectedKeys:7}),before=op.stats();
  await rejects(()=>op.finishAttentionQuery(handle),/every|expected|consum/i);await rejects(()=>op.attentionQueryTile({queryHandle:handle,k:new Float32Array([NaN]),v:p.v,keys:8}),/remaining|expected|exceed/i);
  demand(op.stats().inputCopyBytes===before.inputCopyBytes,'Key overrun must fail before input capture');
  await rejects(()=>op.attentionQueryTile({queryHandle:{...handle},k:p.k,v:p.v,keys:7}),/foreign|owner|handle/i);
  const other=await createBatchedModelOps({numThreads});try{await rejects(()=>other.attentionQueryTile({queryHandle:handle,k:p.k,v:p.v,keys:7}),/foreign|owner|handle/i);}finally{await other.dispose();}
  const controller=new AbortController(),cancelled=op.attentionQueryTile({queryHandle:handle,k:p.k,v:p.v,keys:7,signal:controller.signal});controller.abort();await rejects(()=>cancelled,/Abort/);
  await op.attentionQueryTile({queryHandle:handle,k:p.k,v:p.v,keys:7});const retried=op.finishAttentionQuery(handle);compare(retried.context,reference([p]).context,'cancel/retry');await rejects(()=>op.attentionQueryTile({queryHandle:handle,k:p.k,v:p.v,keys:7}),/foreign|released|handle/i);
  const activeHandle=op.beginAttentionQuery({...p,expectedKeys:7}),active=op.attentionQueryTile({queryHandle:activeHandle,k:p.k,v:p.v,keys:7});await rejects(()=>op.releaseAttentionQuery(activeHandle),/busy|active|await/i);await active;op.releaseAttentionQuery(activeHandle);
  cases.push({name:'foreign/stale handle, incomplete finish, exact key bounds, abort/retry and active release',passed:true});

  const abandoned=op.beginAttentionQuery({...p,expectedKeys:7});demand(op.releaseAttentionQuery(abandoned)===true&&op.releaseAttentionQuery(abandoned)===false,'Incomplete query may be released without finishing');
  const ort=await import('../../inference/vendor/ort.wasm.min.mjs'),original=ort.Tensor.prototype.dispose,failed=op.beginAttentionQuery({...p,expectedKeys:7});let once=true;
  ort.Tensor.prototype.dispose=function(){if(once){once=false;throw Error('Injected query native tensor release failure');}return original.call(this);};
  try{await rejects(()=>op.releaseAttentionQuery(failed),/cleanup|release|recover/i);demand(op.stats().cleanupPending,'Failed release must block execution until owner recovery');await rejects(()=>op.beginAttentionQuery({...p,expectedKeys:7}),/cleanup|recover/i);}finally{ort.Tensor.prototype.dispose=original;}
  await op.recover();demand(op.stats().disposed,'Recover must dispose native sessions and retained query resources');cases.push({name:'actual native query release failure retains ownership and recovers',passed:true});
  return {passed:true,scope:'Small native ORT resource-boundary regression, not production-shape/model acceptance',gate,cases,stats:op.stats()};
 }finally{await op.dispose();}
}

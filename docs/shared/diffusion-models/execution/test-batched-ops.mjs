const demand=(ok,message)=>{if(!ok)throw Error(message);};
const tolerance=Object.freeze({absolute:0.001,relative:0.0001});
const f32Max=3.4028234663852886e38;
function compare(actual,expected,label){
 demand(actual instanceof Float32Array&&actual.length===expected.length,label+' output shape');
 let failed=0,maxAbsolute=0,maxRelative=0;
 for(let i=0;i<actual.length;i++){
  const error=Math.abs(actual[i]-expected[i]);maxAbsolute=Math.max(maxAbsolute,error);maxRelative=Math.max(maxRelative,error/Math.max(1e-30,Math.abs(expected[i])));
  if(!Number.isFinite(actual[i])||!Number.isFinite(expected[i])||error>tolerance.absolute+tolerance.relative*Math.abs(expected[i]))failed++;
 }
 demand(failed===0,label+' failed '+failed+' elements; max absolute '+maxAbsolute);
 return {elements:actual.length,failed,maxAbsolute,maxRelative,tolerance};
}
function linearReference(x,weight,rows,columns,inner){
 const result=new Float64Array(rows*columns);
 for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
  let sum=0;for(let d=0;d<inner;d++)sum+=x[r*inner+d]*weight[c*inner+d];result[r*columns+c]=sum;
 }return result;
}
function fixture(queries,keys,offset=0){
 const heads=40,headDim=128,q=new Float32Array(heads*queries*headDim),k=new Float32Array(heads*keys*headDim),v=new Float32Array(k.length);
 for(let h=0;h<heads;h++){
  for(let r=0;r<queries;r++)for(let d=0;d<headDim;d++)q[(h*queries+r)*headDim+d]=((h*7+r*3+d*5)%29-14)/32;
  for(let r=0;r<keys;r++)for(let d=0;d<headDim;d++){
   const at=(h*keys+r)*headDim+d;k[at]=((h*11+(r+offset)*7+d*3)%31-15)/32+(r+offset)/1024;v[at]=((h*13+(r+offset)*5+d*7)%37-18)/16;
  }
 }return {q,k,v,heads,headDim,queries,keys};
}
// Independent F64 scalar reference. Only one logical row of scores is held.
function attentionReference(parts){
 const {q,heads,headDim,queries}=parts[0],max=new Float64Array(heads*queries),denominator=new Float64Array(max.length),context=new Float64Array(max.length*headDim),scale=Math.fround(1/Math.sqrt(128));
 const keyCount=parts.reduce((n,p)=>n+p.keys,0),scores=new Float64Array(keyCount);
 for(let h=0;h<heads;h++)for(let r=0;r<queries;r++){
  let rowMax=-Infinity,at=0;const row=h*queries+r;
  for(const p of parts)for(let j=0;j<p.keys;j++){
   let score=0;for(let d=0;d<headDim;d++)score+=q[row*headDim+d]*p.k[(h*p.keys+j)*headDim+d];score*=scale;scores[at++]=score;rowMax=Math.max(rowMax,score);
  }
  max[row]=rowMax;at=0;
  for(const p of parts)for(let j=0;j<p.keys;j++){
   const probability=Math.exp(scores[at++]-rowMax);denominator[row]+=probability;
   for(let d=0;d<headDim;d++)context[row*headDim+d]+=probability*p.v[(h*p.keys+j)*headDim+d];
  }
 }return {max,denominator,context,keyCount};
}
const initial=(queries)=>({previousMax:new Float32Array(40*queries).fill(-f32Max),previousDenominator:new Float32Array(40*queries),previousContext:new Float32Array(40*queries*128)});
async function rejects(fn,pattern){let error;try{await fn();}catch(e){error=e;}demand(error&&(!pattern||pattern.test(String(error))), 'Expected rejection '+pattern);return error;}

export async function runBatchedOpsTests(){
 const api=await import('./batched-ops.mjs').catch(()=>({}));demand(typeof api.createBatchedModelOps==='function','Missing batched F32 ORT execution unit');
 const op=await api.createBatchedModelOps(),cases=[];
 try{
  demand(op.describe().sessionCreations===2,'Exactly two reusable ORT sessions required');
  const x=new Float32Array([1,2,3,4]),weight=new Float32Array([2,3,4,5]),pending=op.linear({x,weight,rows:2,columns:2,inner:2});x.fill(999);weight.fill(999);
  compare((await pending).output,new Float64Array([8,14,18,32]),'owned linear snapshots');
  const forged=new Float32Array([2]);forged.every=()=>true;forged.slice=()=>forged;
  const forgedRun=op.linear({x:forged,weight:new Float32Array([3]),rows:1,columns:1,inner:1});forged.fill(999);
  demand((await forgedRun).output[0]===6,'Overridden typed-array methods must not defeat input ownership');
  const forgedNonfinite=new Float32Array([NaN]);forgedNonfinite.every=()=>true;forgedNonfinite.slice=()=>new Float32Array([2]);
  await rejects(()=>op.linear({x:forgedNonfinite,weight:new Float32Array([3]),rows:1,columns:1,inner:1}),/F32|finite/);
  class DerivedF32 extends Float32Array{every(){return true;}slice(){return this;}}
  await rejects(()=>op.linear({x:new DerivedF32([2]),weight:new Float32Array([3]),rows:1,columns:1,inner:1}),/F32|native/);
  const noncompact=new Float32Array([2,3]).subarray(0,1);Object.defineProperty(noncompact.buffer,'byteLength',{value:4});
  await rejects(()=>op.linear({x:noncompact,weight:new Float32Array([3]),rows:1,columns:1,inner:1}),/F32|compact/);
  for(const shape of [{rows:128,columns:16,inner:13824},{rows:128,columns:5120,inner:3}]){
   const {rows,columns,inner}=shape,a=new Float32Array(rows*inner),b=new Float32Array(columns*inner);
   for(let i=0;i<a.length;i++)a[i]=(i%23-11)/128;for(let i=0;i<b.length;i++)b[i]=(i%19-9)/128;
   const expected=linearReference(a,b,rows,columns,inner),r=await op.linear({x:a,weight:b,...shape});
   cases.push({name:'actual large Gemm '+[rows,columns,inner].join('x'),shape,comparison:compare(r.output,expected,'large linear'),evidence:r.evidence});
  }
  for(const [queries,keys] of [[128,256],[3,7]]){
   const f=fixture(queries,keys),ref=attentionReference([f]),input={...f,...initial(queries)},pending=op.attentionTile(input);f.q.fill(999);f.k.fill(999);f.v.fill(999);input.previousMax.fill(999);input.previousDenominator.fill(999);input.previousContext.fill(999);
   const result=await pending;
   cases.push({name:'actual H40 Q'+queries+' K'+keys+' D128 attention',max:compare(result.max,ref.max,'max'),denominator:compare(result.denominator,ref.denominator,'denominator'),context:compare(result.context,ref.context,'context'),evidence:result.evidence});
  }
  const parts=[fixture(3,256),fixture(3,7,256)],ref=attentionReference(parts);let state=initial(3),keysConsumed=0;
  for(const p of parts){const result=await op.attentionTile({...p,...state});state={previousMax:result.max,previousDenominator:result.denominator,previousContext:result.context};keysConsumed+=p.keys;}
  demand(keysConsumed===263,'All exact logical keys must be consumed');
  cases.push({name:'exact all-263-key stream with tail7',max:compare(state.previousMax,ref.max,'stream max'),denominator:compare(state.previousDenominator,ref.denominator,'stream denominator'),context:compare(state.previousContext,ref.context,'stream context'),keysConsumed,phantomKeys:0});
  const uniform=fixture(3,7);uniform.q.fill(0);uniform.k.fill(0);uniform.v.fill(1);const unit=await op.attentionTile({...uniform,...initial(3)});
  demand(unit.denominator.every(x=>x===7)&&unit.context.every(x=>x===7),'Uniform exact tail must include seven keys');
  const rising=[fixture(3,7),fixture(3,7)];for(let i=0;i<2;i++){rising[i].q.fill(1);rising[i].k.fill(i);rising[i].v.fill(2+i*2);}
  const shiftedRef=attentionReference(rising),first=await op.attentionTile({...rising[0],...initial(3)}),shifted=await op.attentionTile({...rising[1],previousMax:first.max,previousDenominator:first.denominator,previousContext:first.context});
  demand(shifted.max.every((x,i)=>x>first.max[i]),'Second key tile must raise every maximum');
  cases.push({name:'stable rescale of prior numerator and denominator when maxima rise',max:compare(shifted.max,shiftedRef.max,'rescaled max'),denominator:compare(shifted.denominator,shiftedRef.denominator,'rescaled denominator'),context:compare(shifted.context,shiftedRef.context,'rescaled context')});
  const controller=new AbortController(),work=op.linear({x:new Float32Array([3]),weight:new Float32Array([2]),rows:1,columns:1,inner:1,signal:controller.signal});controller.abort();await rejects(()=>work,/Abort/);
  demand((await op.linear({x:new Float32Array([3]),weight:new Float32Array([2]),rows:1,columns:1,inner:1})).output[0]===6,'Reuse after cancellation');
  const active=op.attentionTile({...fixture(3,7),...initial(3)});await rejects(()=>op.linear({}),/busy/);await rejects(()=>op.dispose(),/active|await|busy/i);await active;
  const attentionController=new AbortController(),cancelledAttention=op.attentionTile({...fixture(3,7),...initial(3),signal:attentionController.signal});attentionController.abort();await rejects(()=>cancelledAttention,/Abort/);
  let reentrant;const getterInput={get x(){reentrant=op.linear({}).catch(error=>error);return new Float32Array([2]);},weight:new Float32Array([3]),rows:1,columns:1,inner:1};
  demand((await op.linear(getterInput)).output[0]===6&&/busy/.test(String(await reentrant)),'Reentrant argument getters must observe BUSY');
  await rejects(()=>op.linear({x:new Float32Array(1),weight:new Float32Array(1),rows:129,columns:1,inner:1}),/shape|bound/i);
  const invalid=fixture(3,7);invalid.v[0]=NaN;await rejects(()=>op.attentionTile({...invalid,...initial(3)}),/F32|finite/);
  await rejects(()=>api.createBatchedModelOps({maxRows:129}),/bound/i);
  demand(!op.stats().busy&&op.stats().pendingTensors===0,'Every operation must release native tensors');
  cases.push({name:'snapshot/cancel/reuse/busy/finite/shape/cleanup guards',passed:true});
  const ort=await import('../../inference/vendor/ort.wasm.min.mjs'),originalDispose=ort.Tensor.prototype.dispose;let failOnce=true;
  ort.Tensor.prototype.dispose=function(){if(failOnce){failOnce=false;throw Error('Injected actual tensor disposal failure');}return originalDispose.call(this);};
  try{
   await rejects(()=>op.linear({x:new Float32Array([2]),weight:new Float32Array([3]),rows:1,columns:1,inner:1}),/cleanup/);
   demand(!op.stats().busy&&op.stats().cleanupPending&&op.stats().pendingTensors===1,'Failed native release must retain the handle and block reuse');
   await rejects(()=>op.linear({}),/cleanup/);
  }finally{ort.Tensor.prototype.dispose=originalDispose;}
  const beforeRecovery=op.stats();await op.recover();await op.dispose();demand(op.stats().disposed&&op.stats().pendingTensors===0,'Retry cleanup and idempotent session disposal');await rejects(()=>op.linear({}),/disposed/);
  cases.push({name:'actual ORT tensor release failure retains handle for recovery',passed:true,beforeRecovery,afterRecovery:op.stats()});
  return {passed:true,precisionProfile:api.BATCHED_F32_PROFILE,cases,stats:op.stats()};
 }finally{await op.dispose();}
}

// Browser-native changed-boundary tests. No model weights or prediction oracle.
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const reject=async(fn,pattern)=>{try{await fn();}catch(error){assert(!pattern||pattern.test(String(error)),'Unexpected rejection: '+error);return error;}throw Error('Expected rejection');};
const equalBits=(a,b)=>{assert(a.length===b.length,'Exact output length');const x=new Uint32Array(a.buffer,a.byteOffset,a.length),y=new Uint32Array(b.buffer,b.byteOffset,b.length);assert(x.every((value,i)=>value===y[i]),'F32 bits differ');};
function compare(actual,reference){let failed=0,maxAbs=0;for(let i=0;i<actual.length;i++){const error=Math.abs(actual[i]-reference[i]);maxAbs=Math.max(maxAbs,error);if(!Number.isFinite(actual[i])||error>.001+.0001*Math.abs(reference[i]))failed++;}assert(!failed,'Independent fixed gate failed');return {elements:actual.length,failed,maxAbs,absolute:.001,relative:.0001};}

export async function runPreparedBatchedOpsTests(){
 const {createBatchedModelOps}=await import('./batched-ops.mjs'),ort=await import('../../inference/vendor/ort.wasm.min.mjs');
 const op=await createBatchedModelOps(),cases=[];
 try{
  assert(typeof op.prepareLinearWeight==='function'&&typeof op.linearPrepared==='function'&&typeof op.releaseLinearWeight==='function','Prepared native weight API is missing');
  const weight=new Float32Array([2,3,4,5]),handle=op.prepareLinearWeight({weight,columns:2,inner:2});weight.fill(999);
  assert(Object.isFrozen(handle)&&!('data' in handle)&&handle.byteLength===16,'Opaque owned metadata handle required');
  const x=new Float32Array([1,2,3,4]),pending=op.linearPrepared({x,weightHandle:handle,rows:2});x.fill(999);
  equalBits((await pending).output,new Float32Array([8,14,18,32]));
  const before=op.stats().inputCopyBytes;
  await op.linearPrepared({x:new Float32Array([1,2]),weightHandle:handle,rows:1});
  assert(op.stats().inputCopyBytes-before===8,'Only x may be copied again for prepared input');
  assert(op.stats().preparedWeightBytes===16&&op.stats().preparedWeights===1,'Exactly one retained prepared weight');
  cases.push({name:'owned persistent CPU tensor, x snapshot, and copy counters',passed:true});

  const moved=new Float32Array([3,4]),movedHandle=op.prepareLinearWeight({weight:moved,columns:1,inner:2,ownership:'take'});
  assert(moved.buffer.byteLength===0&&movedHandle.byteLength===8,'Explicit private ownership transfer required');
  equalBits((await op.linearPrepared({x:new Float32Array([1,2]),weightHandle:movedHandle,rows:1})).output,new Float32Array([11]));
  const finite=new Float32Array([1,2]);await reject(()=>op.prepareLinearWeight({weight:finite,columns:1,inner:2,ownership:'invalid'}),/ownership/i);assert(finite.length===2,'Rejected take must not detach caller data');
  const nan=new Float32Array([NaN]);await reject(()=>op.prepareLinearWeight({weight:nan,columns:1,inner:1,ownership:'take'}),/finite|F32/);assert(nan.length===1,'Finite gate must run before transfer');
  const shared=typeof SharedArrayBuffer==='function'?new SharedArrayBuffer(8):new WebAssembly.Memory({initial:1,maximum:1,shared:true}).buffer;
  const hiddenShared=new Float32Array(shared,0,2);Object.defineProperty(hiddenShared,'buffer',{value:new ArrayBuffer(8)});await reject(()=>op.prepareLinearWeight({weight:hiddenShared,columns:1,inner:2,ownership:'take'}),/F32|shared/);
  cases.push({name:'explicit transfer and finite/native shape gates',passed:true});

  const other=await createBatchedModelOps();try{await reject(()=>other.linearPrepared({x:new Float32Array([1,2]),weightHandle:handle,rows:1}),/handle|owner/i);}finally{await other.dispose();}
  await reject(()=>op.linearPrepared({x:new Float32Array([1,2]),weightHandle:{...handle},rows:1}),/handle|owner/i);
  const active=op.linearPrepared({x:new Float32Array([1,2]),weightHandle:handle,rows:1});await reject(()=>op.releaseLinearWeight(handle),/busy|active/i);await active;
  const abort=new AbortController(),cancelled=op.linearPrepared({x:new Float32Array([1,2]),weightHandle:handle,rows:1,signal:abort.signal});abort.abort();await reject(()=>cancelled,/Abort/);
  equalBits((await op.linearPrepared({x:new Float32Array([1,2]),weightHandle:handle,rows:1})).output,new Float32Array([8,14]));
  op.releaseLinearWeight(handle);assert(op.releaseLinearWeight(handle)===false,'Release must be idempotent');await reject(()=>op.linearPrepared({x:new Float32Array([1,2]),weightHandle:handle,rows:1}),/handle|released/i);op.releaseLinearWeight(movedHandle);
  cases.push({name:'foreign/stale handles, active release, cancellation and reuse',passed:true});

  const rows=128,columns=16,inner=13824,a=new Float32Array(rows*inner),b=new Float32Array(columns*inner),expected=new Float64Array(rows*columns);
  for(let i=0;i<a.length;i++)a[i]=(i%23-11)/128;for(let i=0;i<b.length;i++)b[i]=(i%19-9)/128;
  for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){let sum=0;for(let k=0;k<inner;k++)sum+=a[r*inner+k]*b[c*inner+k];expected[r*columns+c]=sum;}
  const regular=await op.linear({x:a,weight:b,rows,columns,inner}),largeHandle=op.prepareLinearWeight({weight:b,columns,inner,ownership:'take'}),prepared=await op.linearPrepared({x:a,weightHandle:largeHandle,rows});equalBits(regular.output,prepared.output);op.releaseLinearWeight(largeHandle);
  cases.push({name:'full inner 13824, 128 rows, independent F64 and old-path bit parity',comparison:compare(prepared.output,expected)});

  const shape={rows:8,columns:2048,inner:2048},benchX=new Float32Array(shape.rows*shape.inner),benchWeight=new Float32Array(shape.columns*shape.inner);for(let i=0;i<benchX.length;i++)benchX[i]=(i%13-6)/32;for(let i=0;i<benchWeight.length;i++)benchWeight[i]=(i%17-8)/128;
  const oldWarm=await op.linear({...shape,x:benchX,weight:benchWeight}),benchHandle=op.prepareLinearWeight({weight:benchWeight,columns:shape.columns,inner:shape.inner,ownership:'take'});equalBits(oldWarm.output,(await op.linearPrepared({rows:shape.rows,x:benchX,weightHandle:benchHandle})).output);
  const regularInput=new Float32Array(shape.columns*shape.inner);for(let i=0;i<regularInput.length;i++)regularInput[i]=(i%17-8)/128;
  const repeats=5,beforeRegular=op.stats();let began=performance.now();for(let i=0;i<repeats;i++)await op.linear({...shape,x:benchX,weight:regularInput});const regularMs=performance.now()-began,afterRegular=op.stats();
  began=performance.now();for(let i=0;i<repeats;i++)await op.linearPrepared({rows:shape.rows,x:benchX,weightHandle:benchHandle});const preparedMs=performance.now()-began,afterPrepared=op.stats();op.releaseLinearWeight(benchHandle);
  cases.push({name:'bounded 16MiB weight reuse benchmark; host copies only',shape,repeats,regularMs,preparedMs,regularSnapshotBytes:afterRegular.inputCopyBytes-beforeRegular.inputCopyBytes,preparedSnapshotBytes:afterPrepared.inputCopyBytes-afterRegular.inputCopyBytes,nativeWasmCopiesMeasured:false});

  const releaseHandle=op.prepareLinearWeight({weight:new Float32Array([2]),columns:1,inner:1}),original=ort.Tensor.prototype.dispose;let once=true;
  ort.Tensor.prototype.dispose=function(){if(once){once=false;throw Error('Injected prepared release failure');}return original.call(this);};
  try{await reject(()=>op.releaseLinearWeight(releaseHandle),/release|Injected/);assert(op.stats().preparedWeights===1&&op.stats().cleanupPending,'Failed prepared release must retain ownership and block reuse');await reject(()=>op.linearPrepared({x:new Float32Array([3]),weightHandle:releaseHandle,rows:1}),/cleanup|recovery/i);}finally{ort.Tensor.prototype.dispose=original;}
  await op.recover();assert(op.stats().disposed&&op.stats().preparedWeights===0&&op.stats().pendingTensors===0,'Recover must release all remaining owners');
  cases.push({name:'prepared native release failure retained for recovery',passed:true});
  return {passed:true,cases,stats:op.stats()};
 }finally{await op.dispose();}
}

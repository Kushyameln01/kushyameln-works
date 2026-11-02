// Diagnostic only. Parallel resource configuration is not a runtime default.
const demand=(value,message)=>{if(!value)throw Error(message);};
const sha=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
const compare=(actual,expected,label)=>{demand(actual.length===expected.length,label+' shape');let failed=0,maxAbs=0;for(let i=0;i<actual.length;i++){const error=Math.abs(actual[i]-expected[i]);maxAbs=Math.max(maxAbs,error);if(!Number.isFinite(actual[i])||!Number.isFinite(expected[i])||error>.001+.0001*Math.abs(expected[i]))failed++;}demand(failed===0,label+' fixed gate failed '+failed);return {elements:actual.length,failed,maxAbs,absolute:.001,relative:.0001};};
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
export async function runThreadProfile({threads,repetitions=7}={}){
 demand([1,4].includes(threads),'Only explicit1 or4 thread experiment');
 demand(crossOriginIsolated&&typeof SharedArrayBuffer==='function','Cross-origin isolation and SharedArrayBuffer required for this comparison');
 const {installWasmMemoryObserver}=await import('./wasm-memory-observer.mjs'),observer=installWasmMemoryObserver();
 const NativeWorker=globalThis.Worker;let workerCreations=0;globalThis.Worker=new Proxy(NativeWorker,{construct(target,args,newTarget){workerCreations++;return Reflect.construct(target,args,newTarget);}});
 const sessions=[],tensors=[];let result;
 try{
  const ort=await import('../../inference/vendor/ort.wasm.min.mjs');
  ort.env.wasm.wasmPaths={mjs:new URL('../../inference/vendor/ort-wasm-simd-threaded.mjs',import.meta.url).href,wasm:new URL('../../inference/vendor/ort-wasm-simd-threaded.wasm',import.meta.url).href};ort.env.wasm.numThreads=threads;ort.env.wasm.proxy=false;
  const [{createDynamicLinearGraph},{createBatchedAttentionGraph}]=await Promise.all([import('../ort-bridge/block-hidden/graph.mjs'),import('./batched-attention-graph.mjs')]);
  const load=async name=>{const response=await fetch('/__fixture__/'+name);demand(response.ok,'Fixture unavailable');return response.arrayBuffer();};
  const x=new Float32Array(await load('x.f32')),weight=new Float32Array(await load('weight.f32')),linearExpected=new Float64Array(await load('linear.f64'));
  const q=new Float32Array(await load('q.f32')),k=new Float32Array(await load('k.f32')),v=new Float32Array(await load('v.f32'));
  const reference={max:new Float64Array(await load('max.f64')),denominator:new Float64Array(await load('denominator.f64')),context:new Float64Array(await load('context.f64'))};
  const before=performance.now(),linear=await ort.InferenceSession.create(createDynamicLinearGraph(),{executionProviders:['wasm'],graphOptimizationLevel:'all'});sessions.push(linear);
  const attention=await ort.InferenceSession.create(createBatchedAttentionGraph(),{executionProviders:['wasm'],graphOptimizationLevel:'disabled'});sessions.push(attention);const prepareMs=performance.now()-before;
  const tensor=(data,shape)=>{const t=new ort.Tensor('float32',data,shape);tensors.push(t);return t;};
  const linearFeeds={x:tensor(x,[128,2048]),weight:tensor(weight,[2048,2048])};
  const attentionFeeds={q:tensor(q,[40,128,128]),k:tensor(k,[40,256,128]),v:tensor(v,[40,256,128]),previousMax:tensor(new Float32Array(40*128).fill(-3.4028234663852886e38),[40,128]),previousDenominator:tensor(new Float32Array(40*128),[40,128]),previousContext:tensor(new Float32Array(40*128*128),[40,128,128])};
  let linearOutput,attentionOutput;const measurements={linear:[],attention:[]};
  for(let repeat=-1;repeat<repetitions;repeat++){
   let began=performance.now();const output=await linear.run(linearFeeds);if(repeat>=0)measurements.linear.push(performance.now()-began);linearOutput=output.projection.data.slice();for(const tensor of Object.values(output))tensor.dispose();
   began=performance.now();const next=await attention.run(attentionFeeds);if(repeat>=0)measurements.attention.push(performance.now()-began);attentionOutput=Object.fromEntries(Object.entries(next).map(([name,tensor])=>[name,tensor.data.slice()]));for(const tensor of Object.values(next))tensor.dispose();
  }
  result={passed:true,fixtureClass:'controlled non-dyadic F32 matrices; not real model QKV or production inference',threadsRequested:threads,threadsReported:ort.env.wasm.numThreads,workerCreations,crossOriginIsolated,sharedArrayBufferAvailable:typeof SharedArrayBuffer==='function',prepareMs,repetitions,sessionCreations:2,measurements,mediansMs:{linear:median(measurements.linear),attention:median(measurements.attention)},timingScope:'Native session.run only, including its internal binding/copy; excludes fixture generation, hash, independent comparison and owned host snapshots',comparisons:{linear:compare(linearOutput,linearExpected,'Gemm'),max:compare(attentionOutput.max,reference.max,'max'),denominator:compare(attentionOutput.denominator,reference.denominator,'denominator'),context:compare(attentionOutput.context,reference.context,'context')},outputHashes:{linear:await sha(linearOutput),max:await sha(attentionOutput.max),denominator:await sha(attentionOutput.denominator),context:await sha(attentionOutput.context)},inputHashes:{x:await sha(x),weight:await sha(weight),q:await sha(q),k:await sha(k),v:await sha(v)},memoryBeforeDispose:observer.sample('before-dispose'),ortVersion:ort.env.versions?.web??null,acceptedProduction:false,defaultRuntimeChanged:false};
 }finally{
  const errors=[];for(const t of tensors)try{t.dispose();}catch(error){errors.push(String(error));}for(const s of sessions)try{await s.release();}catch(error){errors.push(String(error));}
  if(result){result.cleanupErrors=errors;result.memoryAfterDispose=observer.sample('after-dispose');}
  observer.unhook();globalThis.Worker=NativeWorker;
  if(errors.length)throw Error('Thread experiment cleanup errors '+errors.join(';'));
 }
 return result;
}

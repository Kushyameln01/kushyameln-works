// Resource ownership for the existing online-attention graph. No attention
// arithmetic, dtype conversion, score construction or output substitution.
const throwIfAborted=AbortSignal.prototype.throwIfAborted;
const abort=signal=>{if(signal!==undefined)throwIfAborted.call(signal);};
const positive=(value,max,label)=>{if(!Number.isSafeInteger(value)||value<1||value>max)throw RangeError(label+' outside supported range');return value;};
const names=['max','denominator','context'];
export function createOwnedAttentionQueries({ort,session,assertLive,capture,validateOutput,copyOutput,run,addRuntimeSpan=()=>{},addAttentionRun=()=>{},onCleanupFailure=()=>{},borrowPreparedKV=null}={}){
 if(typeof ort?.Tensor!=='function'||!session||![assertLive,capture,validateOutput,copyOutput,run,addRuntimeSpan,addAttentionRun,onCleanupFailure].every(fn=>typeof fn==='function'))throw TypeError('Canonical attention owner callbacks required');
 const records=new Map(),known=new WeakSet();let disposed=false,cleanupFailed=false,nextId=0;
 const counters={queryCreations:0,queryPreparationsCompleted:0,queryReleases:0,stepAttempts:0,stepsCompleted:0,failedSteps:0,preparedSteps:0,qSnapshotBytes:0,kvSnapshotBytes:0,finishCopyBytes:0,currentCpuTensorSpanBytes:0,peakCpuTensorSpanBytes:0,ownedTensors:0,peakOwnedTensors:0,unknownSizedTensors:0,cleanupFailures:0};
 const live=signal=>{if(disposed)throw Error('Attention query owner disposed');if(cleanupFailed)throw Object.assign(Error('Attention query cleanup required'),{code:'RECOVERY_REQUIRED'});assertLive();abort(signal);};
 const recordOf=handle=>{const record=records.get(handle);if(!record)throw TypeError('Attention query handle is foreign or released');return record;};
 function track(record,tensor,bytes){
  if(record.owned.has(tensor))return false;
  if(!tensor||typeof tensor.dispose!=='function')throw TypeError('Native ORT attention tensor required');
  if(bytes===undefined){try{const value=tensor.data;bytes=ArrayBuffer.isView(value)?value.byteLength:null;}catch{bytes=null;}}
  if(!Number.isSafeInteger(bytes)||bytes<0)bytes=null;
  record.owned.set(tensor,{bytes});counters.ownedTensors++;if(bytes===null)counters.unknownSizedTensors++;else counters.currentCpuTensorSpanBytes+=bytes;
  counters.peakCpuTensorSpanBytes=Math.max(counters.peakCpuTensorSpanBytes,counters.currentCpuTensorSpanBytes);counters.peakOwnedTensors=Math.max(counters.peakOwnedTensors,counters.ownedTensors);return true;
 }
 function created(record,data,shape){const value=new ort.Tensor('float32',data,shape);track(record,value,data.byteLength);return value;}
 function cleanup(record,selected){
  const errors=[];
  for(const value of new Set(selected)){
   const owned=record.owned.get(value);if(!owned)continue;
   try{
    value.dispose();record.owned.delete(value);counters.ownedTensors--;if(owned.bytes===null)counters.unknownSizedTensors--;else counters.currentCpuTensorSpanBytes-=owned.bytes;
    if(record.q===value)record.q=null;for(const name of names)if(record.state[name]===value)record.state[name]=null;
   }catch(error){errors.push(error);}
  }
  if(errors.length){cleanupFailed=true;counters.cleanupFailures++;try{onCleanupFailure();}catch(error){errors.push(error);}throw new AggregateError(errors,'Attention tensor cleanup failed; ownership retained for recovery');}
 }
 function released(handle,record){records.delete(handle);record.q=null;record.state={};counters.queryReleases++;}
 function release(handle){
  const record=records.get(handle);if(!record){if(known.has(handle))return false;throw TypeError('Attention query handle belongs to another owner');}
  if(record.busy)throw Error('Await active attention query step before release');
  cleanup(record,[...record.owned.keys()]);released(handle,record);return true;
 }
 async function step({queryHandle,k,v,keys,kvHandle,signal}={},prepared=false){
   live(signal);const record=recordOf(queryHandle);if(prepared){if(typeof borrowPreparedKV!=='function')throw Error('Prepared K/V binding unavailable');keys=kvHandle?.keys;}if(record.busy)throw Error('Attention query step already active');positive(keys,256,'keys');
   if(keys>record.expectedKeys-record.processedKeys)throw RangeError('Attention key tile exceeds remaining expected keys');
   record.busy=true;const pending=new Set();let primary,resultValue,lease=null;
   try{
    const {heads,queries,headDim}=record,size=heads*keys*headDim;let kt,vt;
    if(prepared){lease=borrowPreparedKV(kvHandle,{keyStart:record.processedKeys,keys,signal});kt=lease.k;vt=lease.v;}
    else{const kData=capture(k,size,'k'),vData=capture(v,size,'v');counters.kvSnapshotBytes+=size*8;kt=created(record,kData,[heads,keys,headDim]);pending.add(kt);vt=created(record,vData,[heads,keys,headDim]);pending.add(vt);}
    addRuntimeSpan(record.q.data.byteLength+size*8+record.state.max.data.byteLength+record.state.denominator.data.byteLength+record.state.context.data.byteLength);counters.stepAttempts++;
    const result=await run(session,{q:record.q,k:kt,v:vt,previousMax:record.state.max,previousDenominator:record.state.denominator,previousContext:record.state.context});
    const retentionErrors=[];for(const value of Object.values(result))try{if(track(record,value))pending.add(value);}catch(error){retentionErrors.push(error);}if(retentionErrors.length)throw new AggregateError(retentionErrors,'Invalid native attention result tensor');abort(signal);
    const shapes={max:[heads,queries],denominator:[heads,queries],context:[heads,queries,headDim]};
    const validated={};for(const name of names)validated[name]=validateOutput(result[name],shapes[name],name);
    for(let i=0;i<validated.denominator.length;i++)if(!(validated.denominator[i]>0))throw Error('ORT attention denominator must be positive');
    const next={max:result.max,denominator:result.denominator,context:result.context},retained=new Set([record.q,...Object.values(next)]);
    for(const old of Object.values(record.state))if(!retained.has(old))pending.add(old);for(const value of retained)pending.delete(value);
    record.state=next;record.processedKeys+=keys;counters.stepsCompleted++;if(prepared)counters.preparedSteps++;addAttentionRun();
    resultValue={processedKeys:record.processedKeys,expectedKeys:record.expectedKeys,complete:record.processedKeys===record.expectedKeys};
   }catch(error){primary=error;counters.failedSteps++;}
   try{cleanup(record,pending);}catch(error){primary=primary?new AggregateError([primary,error],'Attention step and cleanup failed',{cause:primary}):error;}
   finally{lease?.release();record.busy=false;}
   if(primary)throw primary;return resultValue;
 }
 return Object.freeze({
  begin({q,heads,queries,headDim,expectedKeys,signal}={}){
   live(signal);if(heads!==40||headDim!==128)throw RangeError('Attention query requires H40/D128');positive(queries,128,'queries');positive(expectedKeys,Number.MAX_SAFE_INTEGER,'expectedKeys');
   const qData=capture(q,heads*queries*headDim,'q'),handle=Object.freeze({heads,queries,headDim,expectedKeys}),record={id:++nextId,heads,queries,headDim,expectedKeys,processedKeys:0,q:null,state:{},owned:new Map(),busy:false};
   records.set(handle,record);known.add(handle);counters.queryCreations++;counters.qSnapshotBytes+=qData.byteLength;
   try{
    record.q=created(record,qData,[heads,queries,headDim]);record.state.max=created(record,new Float32Array(heads*queries).fill(-3.4028234663852886e38),[heads,queries]);record.state.denominator=created(record,new Float32Array(heads*queries),[heads,queries]);record.state.context=created(record,new Float32Array(heads*queries*headDim),[heads,queries,headDim]);abort(signal);counters.queryPreparationsCompleted++;return handle;
   }catch(primary){try{release(handle);}catch(error){throw new AggregateError([primary,error],'Attention query preparation and cleanup failed',{cause:primary});}throw primary;}
  },
  step(input={}){return step(input);},
  stepPrepared(input={}){return step(input,true);},
  finish(queryHandle,{signal}={}){
   live(signal);const record=recordOf(queryHandle);if(record.busy)throw Error('Await active attention query step before finish');if(record.processedKeys!==record.expectedKeys)throw RangeError('Attention query has not consumed every expected key');
   const {heads,queries,headDim}=record;let primary,value;
   try{
    const max=copyOutput(record.state.max,[heads,queries],'max'),denominator=copyOutput(record.state.denominator,[heads,queries],'denominator'),context=copyOutput(record.state.context,[heads,queries,headDim],'context');counters.finishCopyBytes+=max.byteLength+denominator.byteLength+context.byteLength;abort(signal);
    value={max,denominator,context,evidence:{implementationProfile:'owned-online-attention-query-v1',heads,queries,headDim,keys:record.processedKeys,allExpectedKeysConsumed:true,context:'unnormalized online numerator',nativeWasmCopiesMeasured:false}};
   }catch(error){primary=error;}
   try{release(queryHandle);}catch(error){primary=primary?new AggregateError([primary,error],'Attention finish and cleanup failed',{cause:primary}):error;}
   if(primary)throw primary;return value;
  },
  release,
  disposeAll(){
   if(disposed)return;const errors=[];
   for(const [handle,record]of [...records]){try{if(record.busy)throw Error('Await active attention query before disposal');cleanup(record,[...record.owned.keys()]);released(handle,record);}catch(error){errors.push(error);}}
   if(errors.length)throw new AggregateError(errors,'Attention query owners remain for recovery');disposed=true;cleanupFailed=false;
  },
  stats(){return {...counters,ownedQueryCount:records.size,cleanupPending:cleanupFailed,disposed,queries:[...records.values()].map(record=>({id:record.id,heads:record.heads,queries:record.queries,headDim:record.headDim,expectedKeys:record.expectedKeys,processedKeys:record.processedKeys,busy:record.busy,ownedTensors:record.owned.size})),spanScope:'Owned CPU tensor spans; possible backing aliases and native ORT/WASM copies are not measured'};}
 });
}

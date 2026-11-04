// A bounded runtime-feed consumer for the real [16,5120] projection graph.
// This is deliberately a PARTIAL diagnostic contract, not the LoRA SDK v1
// initializer interface or a complete Bernini model/session implementation.
import {verifyDiagnosticRegistryHash} from './diagnostic-identity.mjs';
const SCHEMA='bernini-diagnostic-registry/0.1';
const SHA=/^[a-f0-9]{64}$/;
const PROFILE='bernini-q16x5120-f32-wasm-v1';
const identityFields=['modelHash','graphHash','registryHash','side','scope'];
const specs={
 'q.weight':{shape:[16,5120],fullShape:[5120,5120],count:81920,originalKey:'blocks.0.self_attn.q.weight',storageDtype:'F8_E4M3',binding:{kind:'runtime-input',name:'weight'}},
 'q.bias':{shape:[16],fullShape:[5120],count:16,originalKey:'blocks.0.self_attn.q.bias',storageDtype:'F16',binding:{kind:'hike-parameter',name:'bias'}}
};
function fail(code,message){throw Object.assign(new Error(message),{code});}
const equalArray=(a,b)=>Array.isArray(a)&&a.length===b.length&&b.every((x,i)=>Object.hasOwn(a,i)&&a[i]===x);
const clone=value=>structuredClone(value);
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function floats(value,count){
 if(!(value instanceof Float32Array)||value.length!==count||!(value.buffer instanceof ArrayBuffer)||value.byteOffset!==0||value.byteLength!==value.buffer.byteLength||!value.every(Number.isFinite))fail('INVALID_TENSOR','Expected compact owned finite Float32Array with exact shape');
}
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');

function checkedRegistry(input){
 const r=clone(input);
 verifyDiagnosticRegistryHash(r);
 if(r?.schemaVersion!==SCHEMA||r.scope!=='PARTIAL'||r.coverage?.kind!=='PARTIAL'||r.coverage.fullModel!==false||r.executionProfileId!==PROFILE||!['HIGH','LOW'].includes(r.side)||!['modelHash','graphHash','registryHash'].every(k=>SHA.test(r[k]))||!Array.isArray(r.targets)||r.targets.length!==2)fail('INVALID_DIAGNOSTIC_REGISTRY','Expected identified PARTIAL projection registry');
 const seen=new Set();let rowStart;
 for(const t of r.targets){
  const s=specs[t.weightId];
  if(!s||seen.has(t.weightId)||t.originalKey!==s.originalKey||t.key!=='diffusion_model.'+s.originalKey||!equalArray(t.shape,s.shape)||!equalArray(t.fullShape,s.fullShape)||t.dtype!=='F32'||t.computeDtype!=='F32'||t.storageDtype!==s.storageDtype||t.layout!=='row-major'||t.binding?.kind!==s.binding.kind||t.binding?.name!==s.binding.name||Object.hasOwn(t,'graphInitializer')||t.transform?.kind!=='row-slice'||t.transform.rowCount!==16||!Number.isInteger(t.transform.rowStart)||t.transform.rowStart<0||t.transform.rowStart>5104||t.transform.transpose===true)fail('INVALID_DIAGNOSTIC_REGISTRY','Target shape, source, transform or execution binding mismatch');
  if(t.weightId==='q.weight'&&((t.transform.columnStart!==undefined&&t.transform.columnStart!==0)||(t.transform.columnCount!==undefined&&t.transform.columnCount!==5120)))fail('INVALID_DIAGNOSTIC_REGISTRY','Only complete projection columns are supported');
  if(rowStart!==undefined&&rowStart!==t.transform.rowStart)fail('INVALID_DIAGNOSTIC_REGISTRY','Weight and bias must select the same original rows');
  rowStart=t.transform.rowStart;seen.add(t.weightId);
 }
 return freeze(r);
}

export function createDiagnosticConsumer({registry,stage,baseProvider}={}){
 const r=checkedRegistry(registry);
 if(typeof stage?.runF32!=='function'||typeof baseProvider?.readBlock!=='function')fail('INVALID_CONSUMER','Real F32 stage and immutable base provider are required');
 let disposed=false,disposal=null,epoch=0,active=null,computing=false,preparing=false;
 const packages=new WeakMap(),packageRecords=new Set(),candidates=new WeakMap(),candidateRecords=new Set(),sinks=new Set(),inFlight=new Set();
 function live(){if(disposed)fail('DISPOSED','Diagnostic consumer disposed');}
 function identity(value){if(!value||identityFields.some(k=>value[k]!==r[k]))fail('BINDING_MISMATCH','Diagnostic model, graph, registry, side or scope mismatch');}
 function guard(context){live();identity(context);context.signal?.throwIfAborted();if(typeof context.isCurrent!=='function'||context.isCurrent()!==true)fail('STALE_APPLICATION','Diagnostic application is not current');}
 function track(fn){const promise=(async()=>fn())();inFlight.add(promise);promise.finally(()=>inFlight.delete(promise)).catch(()=>{});return promise;}
 function candidateState(value){live();const c=candidates.get(value);if(!c||c.released)fail('INVALID_CANDIDATE','Foreign or released diagnostic candidate');return c;}
 function feedCopy(feed){return {weight:new Float32Array(feed.weight),bias:new Float32Array(feed.bias),packageHash:feed.packageHash,kind:feed.kind};}
 function ownedFeed(weight,bias,packageHash,kind){floats(weight,81920);floats(bias,16);return {weight:new Float32Array(weight),bias:new Float32Array(bias),packageHash,kind};}
 function releaseCandidate(c){c.released=true;c.feed=null;c.previous=null;c.receipt=null;candidateRecords.delete(c);}
 function makeCandidate(feed,kind){
  const value=Object.freeze({candidateId:crypto.randomUUID(),scope:'PARTIAL',kind,registryHash:r.registryHash});
  const state={value,feed,kind,preparedAtEpoch:epoch,receipt:null,committedEpoch:null,previous:null,released:false};
  candidates.set(value,state);candidateRecords.add(state);return value;
 }
 function packageState(handle){live();const p=packages.get(handle);if(!p||p.released)fail('INVALID_PACKAGE','Foreign or released runtime-feed package');return p;}
 async function checkedRun(feed,x){
  // The stage is caller-owned. Never lend it candidate/active package arrays:
  // retaining or mutating its input must not change already validated bytes.
  floats(x,5120);const result=await stage.runF32({weight:new Float32Array(feed.weight),bias:new Float32Array(feed.bias),x:new Float32Array(x)});
  const returnedOutput=result?.output;floats(returnedOutput,16);
  // Snapshot the checked result before this async helper resolves. A retained
  // stage result may change in a microtask before validate/run resumes.
  const output=new Float32Array(returnedOutput),evidence=clone(result?.evidence);floats(output,16);
  if(evidence?.graphSHA256!==r.graphHash)fail('GRAPH_IDENTITY_MISMATCH','Executed stage did not identify the bound projection graph');
  return {output,evidence};
 }

 function createSink(){
  live();const owner={},ownedPackages=new Set();let transaction=null,serial=0,busy=false;
  const available=()=>{live();if(busy)fail('SINK_BUSY','Sink block or finish operation is in progress');};
  function current(t,revision){live();if(transaction!==t||revision!==serial)fail('TRANSACTION_ABORTED','Diagnostic sink transaction aborted or superseded');}
  const sink={
   async begin(manifest){available();identity(manifest);if(transaction)fail('TRANSACTION_ACTIVE','Sink already has an active transaction');serial++;transaction={buffers:{'q.weight':new Float32Array(81920),'q.bias':new Float32Array(16)},coverage:{'q.weight':new Uint8Array(81920),'q.bias':new Uint8Array(16)}};},
   async writeBlock(block){
    available();const t=transaction,revision=serial;if(!t)fail('NO_TRANSACTION','Sink has no active transaction');
    const s=specs[block?.weightId];
    if(!s||!Number.isSafeInteger(block.offset)||block.offset<0||!Number.isSafeInteger(block.count)||block.count<1||block.offset>s.count||block.count>s.count-block.offset||block.dtype!=='F32'||!equalArray(block.shape,s.shape)||!SHA.test(block.sha256)||Object.hasOwn(block,'graphInitializer'))fail('INVALID_WEIGHT_BLOCK','Unknown binding, shape, dtype, checksum or block range');
    floats(block.data,block.count);
    if(t.coverage[block.weightId].subarray(block.offset,block.offset+block.count).some(Boolean))fail('OVERLAPPING_BLOCK','Weight block overlaps previously written elements');
    // Capture every caller-controlled field and byte before the hash await.
    const data=new Float32Array(block.data),id=block.weightId,offset=block.offset,count=block.count,digest=block.sha256;busy=true;
    try{if(await sha(data)!==digest)fail('BLOCK_INTEGRITY_ERROR','Weight block SHA-256 mismatch');current(t,revision);t.buffers[id].set(data,offset);t.coverage[id].fill(1,offset,offset+count);}
    finally{busy=false;}
   },
   async finish(manifest){
    available();identity(manifest);const t=transaction,revision=serial;if(!t)fail('NO_TRANSACTION','Sink has no active transaction');
    if(Object.values(t.coverage).some(mask=>mask.some(x=>x!==1)))fail('INCOMPLETE_PACKAGE','Both selected targets require complete nonoverlapping coverage');
    busy=true;
    try{
     const weightHash=await sha(t.buffers['q.weight']),biasHash=await sha(t.buffers['q.bias']);current(t,revision);
     // Exact field order below is the native package hash format, not a common
     // manager snapshot/JCS identity or a rewritten graph initializer package.
     const metadata={schemaVersion:'bernini-runtime-feed-set/0.1',modelHash:r.modelHash,graphHash:r.graphHash,registryHash:r.registryHash,side:r.side,scope:'PARTIAL',weightHash,biasHash};
     const packageHash=await sha(new TextEncoder().encode(JSON.stringify(metadata)));current(t,revision);
     const handle=Object.freeze({packageId:crypto.randomUUID(),kind:'runtime-feed-set',scope:'PARTIAL',registryHash:r.registryHash,packageHash});
     const p={owner,handle,feed:{weight:t.buffers['q.weight'],bias:t.buffers['q.bias'],packageHash,kind:'runtime-feed-set'},released:false,metadata:freeze(metadata)};
     packages.set(handle,p);packageRecords.add(p);ownedPackages.add(p);transaction=null;return handle;
    }finally{busy=false;}
   },
   async abort(){serial++;transaction=null;},
   async release(handle){const p=packages.get(handle);if(!p||p.owner!==owner)fail('INVALID_PACKAGE','Sink does not own this package');if(p.released)return;p.released=true;p.feed=null;ownedPackages.delete(p);packageRecords.delete(p);},
  };
  sinks.add({abort:sink.abort,releaseAll:()=>{for(const p of ownedPackages){p.released=true;p.feed=null;packageRecords.delete(p);}ownedPackages.clear();}});
  // Hashing is asynchronous too: dispose must wait for its abort guard and
  // Promise termination, not only for the ORT stage operation.
  return Object.freeze({...sink,writeBlock:block=>track(()=>sink.writeBlock(block)),finish:manifest=>track(()=>sink.finish(manifest))});
 }

 const target={
  describe(){live();return clone(r);},
  createSink,
  prepareLoad(handle,context){return track(async()=>{guard(context);const p=packageState(handle),feed=feedCopy(p.feed);guard(context);return makeCandidate(feed,'runtime-feed-set');});},
  prepareBase(context){return track(async()=>{
   guard(context);if(preparing)fail('BUSY','Base candidate preparation is already running');preparing=true;
   try{
    const binding={signal:context.signal,modelHash:r.modelHash,graphHash:r.graphHash,registryHash:r.registryHash};
    const first=await baseProvider.readBlock('q.weight',0,81920,binding);guard(context);floats(first,81920);const weight=new Float32Array(first);
    const second=await baseProvider.readBlock('q.bias',0,16,binding);guard(context);floats(second,16);const bias=new Float32Array(second);
    const packageHash=await sha(new TextEncoder().encode(JSON.stringify({schemaVersion:'bernini-base-feed/0.1',registryHash:r.registryHash,weightHash:await sha(weight),biasHash:await sha(bias)})));guard(context);
    return makeCandidate(ownedFeed(weight,bias,packageHash,'immutable-base-feed'),'immutable-base-feed');
   }finally{preparing=false;}
  });},
  validate(value,context){return track(async()=>{
   guard(context);const c=candidateState(value);if(c.committedEpoch!==null)fail('INVALID_CANDIDATE','Committed candidate cannot be revalidated');
   if(c.preparedAtEpoch!==epoch)fail('STALE_CANDIDATE','Active feed changed after candidate preparation');
   if(computing)fail('BUSY','Diagnostic projection already running');
   c.receipt=null;floats(context.x,5120);floats(context.expected,16);
   const tolerance=context.tolerance;
   if(!tolerance||!['absolute','relative'].every(k=>typeof tolerance[k]==='number'&&Number.isFinite(tolerance[k])&&tolerance[k]>=0))fail('INVALID_REFERENCE','Explicit finite comparison tolerances and independent expected output are required');
   const x=new Float32Array(context.x),expected=new Float32Array(context.expected),absolute=tolerance.absolute,relative=tolerance.relative;computing=true;
   try{
    const result=await checkedRun(c.feed,x);guard(context);if(c.preparedAtEpoch!==epoch)fail('STALE_CANDIDATE','Active feed changed during validation');
    const failedIndices=[];let maxAbsoluteError=0;
    for(let i=0;i<16;i++){const delta=Math.abs(result.output[i]-expected[i]);maxAbsoluteError=Math.max(maxAbsoluteError,delta);if(!Number.isFinite(delta)||delta>absolute+relative*Math.abs(expected[i]))failedIndices.push(i);}
    const expectedSHA256=await sha(expected);guard(context);if(c.preparedAtEpoch!==epoch)fail('STALE_CANDIDATE','Active feed changed while recording validation');
    const receipt=freeze({schemaVersion:'bernini-diagnostic-validation/0.1',valid:failedIndices.length===0,scope:'PARTIAL',modelInference:false,candidateId:value.candidateId,modelHash:r.modelHash,graphHash:r.graphHash,registryHash:r.registryHash,side:r.side,packageHash:c.feed.packageHash,expectedSHA256,tolerance:{absolute,relative},maxAbsoluteError,failedIndices,evidence:clone(result.evidence)});
    c.receipt=receipt;return clone(receipt);
   }finally{computing=false;}
  });},
  async commit(value,context){
   guard(context);const c=candidateState(value);
   if(!c.receipt?.valid)fail('VALIDATION_REQUIRED','A successful PARTIAL validation receipt is required');
   if(c.committedEpoch!==null||c.preparedAtEpoch!==epoch)fail('STALE_CANDIDATE','Candidate has already committed or another feed became active');
   // No await occurs between this final current check and the atomic switch.
   guard(context);const previous=active;epoch++;active={feed:c.feed,candidateId:value.candidateId,epoch,receipt:c.receipt};c.previous=previous;c.committedEpoch=epoch;
   return {committed:true,scope:'PARTIAL',modelInference:false,epoch,packageHash:active.feed.packageHash};
  },
  async rollback(value,context){
   if(value===undefined||value===null)return {restored:false,scope:'PARTIAL'};
   identity(context);const c=candidates.get(value);if(!c||c.released)return {restored:false,scope:'PARTIAL'};
   if(computing)fail('BUSY','Cannot roll back while diagnostic projection is running');
   // Abort stops new work, not cleanup of this same current application. The
   // active candidate/epoch and isCurrent guard still prevent an old rollback.
   const current=!disposed&&typeof context.isCurrent==='function'&&context.isCurrent()===true;
   const ownsActive=active?.candidateId===value.candidateId&&active.epoch===c.committedEpoch;
   let restored=false;
   if(current&&ownsActive){active=c.previous;epoch++;if(active)active={...active,epoch};restored=true;}
   releaseCandidate(c);return {restored,scope:'PARTIAL',modelInference:false};
  },
  async releaseCandidate(value){
   const c=candidates.get(value);if(!c)fail('INVALID_CANDIDATE','Foreign diagnostic candidate');if(c.released)return;
   if(computing)fail('BUSY','Cannot release a candidate while diagnostic projection is running');
   // Active state owns its feed and receipt references independently. Releasing
   // this candidate relinquishes its rollback history, not the active feed.
   releaseCandidate(c);
  },
  run({x,signal}={}){return track(async()=>{
   live();signal?.throwIfAborted();if(!active)fail('NOT_CONFIGURED','No committed diagnostic runtime feed');if(computing)fail('BUSY','Diagnostic projection already running');
   const bound=active;computing=true;
   try{const result=await checkedRun(bound.feed,x);live();signal?.throwIfAborted();if(active!==bound)fail('STALE_APPLICATION','Active diagnostic feed changed during run');return {...result,scope:'PARTIAL',modelInference:false,epoch:bound.epoch,packageHash:bound.feed.packageHash};}
   finally{computing=false;}
  });},
  dispose(){
   if(disposal)return disposal;disposed=true;epoch++;active=null;
   for(const sink of sinks){sink.abort();sink.releaseAll();}sinks.clear();
   for(const c of candidateRecords)releaseCandidate(c);
   disposal=Promise.allSettled([...inFlight]).then(()=>undefined);return disposal;
  }
 };
 return Object.freeze(target);
}

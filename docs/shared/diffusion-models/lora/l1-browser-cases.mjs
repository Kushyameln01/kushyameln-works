import {createBerniniDiagnosticBase} from './diagnostic-base.mjs';
import {createDiagnosticConsumer} from './diagnostic-consumer.mjs';
import {createOrtProjectionStage} from '../ort-bridge/stage.mjs';
const assert=(v,m)=>{if(!v)throw Error(m);};
const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
const rejects=async(fn,label)=>{let failed=false;try{await fn();}catch{failed=true;}assert(failed,label);};
function compare(out,expected,t){assert(out.length===expected.length,'Output length');for(let i=0;i<out.length;i++)assert(Math.abs(out[i]-expected[i])<=t.absolute+t.relative*Math.abs(expected[i]),'Independent output mismatch '+i);}
export async function runRealBaseCases(files,reference){
 const cases=[],registries=[];let stage;
 try{
  stage=await createOrtProjectionStage();
  for(const ref of reference.models){
   const file=files.find(f=>f.name===ref.name);assert(file?.size===15574833216,'Actual large File size missing');
   const base=await createBerniniDiagnosticBase({file,side:ref.side});let consumer;
   try{
    const registry=base.describe(),binding={modelHash:registry.modelHash,graphHash:registry.graphHash,registryHash:registry.registryHash};registries.push(registry);
    const w=await base.baseProvider.readBlock('q.weight',0,81920,binding),b=await base.baseProvider.readBlock('q.bias',0,16,binding);
    assert(await sha(w)===ref.weightSHA256&&await sha(b)===ref.biasSHA256,'Independent actual-base FP8/F16 decode hash mismatch');
    const memory=base.stats().hike.memoryBytes;
    const aborted=new AbortController(),pending=base.baseProvider.readBlock('q.weight',0,31,{...binding,signal:aborted.signal});aborted.abort();await rejects(()=>pending,'In-flight base abort accepted output');
    await rejects(()=>base.baseProvider.readBlock('q.weight',81920,1,binding),'Out of slice read accepted');
    await rejects(()=>base.baseProvider.readBlock('q.weight',0,1,{...binding,registryHash:'0'.repeat(64)}),'Wrong registry accepted');
    cases.push({name:ref.side+' actual File, owned FP8/F16 Hike decode vs all independent reference bytes; abort/range/binding',passed:true});
    consumer=createDiagnosticConsumer({registry,stage,baseProvider:base.baseProvider});
    const manifest={modelHash:registry.modelHash,graphHash:registry.graphHash,registryHash:registry.registryHash,side:registry.side,scope:'PARTIAL'},ctx={...manifest,isCurrent:()=>true};
    const x=new Float32Array(5120);for(const [key,v] of Object.entries(reference.activation))x[Number(key)]=v;
    const baseCandidate=await consumer.prepareBase(ctx),receipt=await consumer.validate(baseCandidate,{...ctx,x,expected:new Float32Array(ref.expected),tolerance:reference.tolerance});assert(receipt.valid&&receipt.scope==='PARTIAL','Actual base candidate validation failed');
    await consumer.commit(baseCandidate,ctx);compare((await consumer.run({x})).output,ref.expected,reference.tolerance);
    const sink=consumer.createSink();await sink.begin(manifest);
    // Explicit externally supplied F32 patch for consumer acceptance, not a LoRA product.
    w[0]=Math.fround(w[0]+.125);b[0]=Math.fround(b[0]+.25);
    const write=async(id,offset,data,shape)=>sink.writeBlock({weightId:id,offset,count:data.length,data,shape,dtype:'F32',sha256:await sha(data)});
    await write('q.weight',0,w.slice(0,40960),[16,5120]);
    await rejects(()=>write('q.weight',0,w.slice(0,1),[16,5120]),'Overlapping package block accepted');
    await write('q.weight',40960,w.slice(40960),[16,5120]);
    await rejects(()=>sink.finish(manifest),'Missing bias coverage accepted');
    await write('q.bias',0,b,[16]);const handle=await sink.finish(manifest),candidate=await consumer.prepareLoad(handle,ctx);await sink.release(handle);
    w.fill(999);b.fill(999);
    const patched=await consumer.validate(candidate,{...ctx,x,expected:new Float32Array(ref.explicitF32PatchedExpected),tolerance:reference.tolerance});assert(patched.valid&&patched.evidence.graphSHA256===registry.graphHash,'Actual F32 candidate validation failed');
    await consumer.commit(candidate,ctx);const used=await consumer.run({x});compare(used.output,ref.explicitF32PatchedExpected,reference.tolerance);
    const late=await consumer.rollback(baseCandidate,ctx);assert(late.restored===false,'Old rollback overwrote new active feed');
    const c=new AbortController(),run=consumer.run({x,signal:c.signal});c.abort();await rejects(()=>run,'Aborted ORT result was accepted');compare((await consumer.run({x})).output,ref.explicitF32PatchedExpected,reference.tolerance);
    const rollbackSignal=new AbortController();rollbackSignal.abort();assert((await consumer.rollback(candidate,{...ctx,signal:rollbackSignal.signal})).restored===true,'Post-commit cancellation did not restore own prior feed');compare((await consumer.run({x})).output,ref.expected,reference.tolerance);
    const restore=await consumer.prepareBase(ctx);assert((await consumer.validate(restore,{...ctx,x,expected:new Float32Array(ref.expected),tolerance:reference.tolerance})).valid,'Immutable base restore validation failed');await consumer.commit(restore,ctx);compare((await consumer.run({x})).output,ref.expected,reference.tolerance);
    if(consumer.releaseCandidate){await consumer.releaseCandidate(candidate);await consumer.releaseCandidate(restore);}
    assert(base.stats().hike.memoryBytes===memory,'Provider workspace grew across reads');
    cases.push({name:ref.side+' real Hike→owned base→runtime feed-set→ORT WASM→Hike, candidate validation/switch/base restore/abort',passed:true,baseReceipt:receipt,explicitF32Receipt:patched,provider:base.stats(),stage:used.evidence});
   }finally{await consumer?.dispose();base.dispose();}
  }
  return {passed:true,scope:'real immutable base PARTIAL Q slice and F32 feed-set consumer; explicit test patch, no real LoRA low-rank calculation and no full model acceptance',cases,registries,referenceTolerance:reference.tolerance};
 }finally{await stage?.dispose();}
}

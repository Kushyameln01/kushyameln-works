import {createBerniniBlockProvider} from './base-block.mjs';
import {createDiagnosticConsumer} from './diagnostic-consumer.mjs';
import {createOrtProjectionStage} from '../ort-bridge/stage.mjs';
const assert=(value,message)=>{if(!value)throw Error(message);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const rejects=async fn=>{let rejected=false;try{await fn();}catch{rejected=true;}assert(rejected,'Expected diagnostic rejection');};
function compare(actual,expected,tolerance){for(let i=0;i<16;i++)assert(Number.isFinite(actual[i])&&Math.abs(actual[i]-expected[i])<=tolerance.absolute+tolerance.relative*Math.abs(expected[i]),'Independent partial projection mismatch '+i);}
export async function runBaseBlockCases(artifact,reference){
 const results=[];let stage;
 try{
  stage=await createOrtProjectionStage();
  for(const ref of reference.models){
   const base=await createBerniniBlockProvider({artifact,side:ref.side});let consumer;
   try{
    const registry=base.describe(),binding={modelHash:registry.modelHash,graphHash:registry.graphHash,registryHash:registry.registryHash},context={...binding,side:ref.side,scope:'PARTIAL',isCurrent:()=>true};
    assert(JSON.stringify(registry)===JSON.stringify(artifact.sides[ref.side].registry),'Fragment registry changed from original factory metadata');
    const weight=await base.baseProvider.readBlock('q.weight',0,81920,binding),bias=await base.baseProvider.readBlock('q.bias',0,16,binding);
    assert(await sha(weight)===ref.weightSHA256&&await sha(bias)===ref.biasSHA256,'Actual fragment Hike decode differs from independent original-base hashes');
    const memory=base.stats().hike.memoryBytes;weight.fill(99);bias.fill(99);
    await rejects(()=>base.baseProvider.readBlock('q.weight',81920,1,binding));await rejects(()=>base.baseProvider.readBlock('q.bias',0,1,{...binding,modelHash:'0'.repeat(64)}));
    consumer=createDiagnosticConsumer({registry,stage,baseProvider:base.baseProvider});
    const x=new Float32Array(5120);for(const [key,value]of Object.entries(reference.activation))x[Number(key)]=value;
    const candidate=await consumer.prepareBase(context),receipt=await consumer.validate(candidate,{...context,x,expected:new Float32Array(ref.expected),tolerance:reference.tolerance});
    assert(receipt.valid&&receipt.scope==='PARTIAL'&&receipt.modelInference===false,'Unchanged consumer rejected actual block provider');await consumer.commit(candidate,context);await consumer.releaseCandidate(candidate);
    const output=await consumer.run({x});compare(output.output,ref.expected,reference.tolerance);
    const abort=new AbortController(),pending=consumer.run({x,signal:abort.signal});abort.abort();await rejects(()=>pending);compare((await consumer.run({x})).output,ref.expected,reference.tolerance);
    await base.baseProvider.readBlock('q.weight',0,13,binding);assert(base.stats().hike.memoryBytes===memory,'Fragment Hike workspace grew after reuse');
    results.push({side:ref.side,passed:true,scope:'PARTIAL',fullFileHashRecomputed:false,originalModelFileProvided:false,registryHash:registry.registryHash,baseReceipt:receipt,provider:base.stats(),stage:output.evidence});
   }finally{await consumer?.dispose();base.dispose();}
  }
  return {passed:true,scope:'actual retained-base bounded fragments through unchanged consumer and real Hike/ORT WASM; no LoRA arithmetic or whole-model acceptance',cases:results};
 }finally{await stage?.dispose();}
}

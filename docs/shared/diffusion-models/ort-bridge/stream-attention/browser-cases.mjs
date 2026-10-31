import {Sha256} from '../../../vr180/sha256.mjs';
import {createAttentionFixture} from './fixture-source.mjs';
const assert=(v,m)=>{if(!v)throw Error(m);};
const rejects=async(f,m)=>{let e;try{await f();}catch(x){e=x;}assert(e,m);return String(e.message??e);};
function compare(actual,expected,t){assert(actual.length===expected.length,'Output shape');let maxAbsolute=0,maxRelative=0,failed=0;for(let i=0;i<actual.length;i++){const d=Math.abs(actual[i]-expected[i]);maxAbsolute=Math.max(maxAbsolute,d);maxRelative=Math.max(maxRelative,d/Math.max(1e-30,Math.abs(expected[i])));if(!Number.isFinite(actual[i])||d>t.absolute+t.relative*Math.abs(expected[i]))failed++;}assert(failed===0,'Attention comparison failed '+failed+' maxAbs'+maxAbsolute);return {values:actual.length,failed,maxAbsolute,maxRelative,tolerance:t};}
export async function runAttentionCases(reference){
 let api;try{api=await import('./stage.mjs');}catch{}assert(typeof api?.createStreamAttention==='function','Missing streamed attention selected-boundary candidate');const op=await api.createStreamAttention(),cases=[],fixtures=reference.cases.map(r=>({...r,keyCount:r.keyCount??r.kShape[0]}));
 try{
  for(const ref of fixtures){const f=createAttentionFixture({keyCount:ref.keyCount}),before=f.q.slice(),hashK=new Sha256(),hashV=new Sha256(),hashQ=new Sha256();hashQ.update(new Uint8Array(before.buffer));let firstK=null,firstV=null;const checkedSource={...f.source,async readKV(o,n,c){const b=await f.source.readKV(o,n,c);hashK.update(new Uint8Array(b.k.buffer));hashV.update(new Uint8Array(b.v.buffer));if(!firstK){firstK=b.k;firstV=b.v;}return b;}};let progress=0;const r=await op.run({q:f.q,source:checkedSource,onProgress:p=>{progress++;assert(p.count<=64&&p.offset+p.count<=ref.keyCount,'Padded/extra key used');if(progress===1)f.q.fill(999);}});const c=compare(r.output,new Float32Array(ref.expected),reference.tolerance);const inputHashes={q:hashQ.digestHex(),k:hashK.digestHex(),v:hashV.digestHex()};assert(Object.keys(inputHashes).every(k=>inputHashes[k]===ref.inputSHA256[k]),'Actual full QKV input bytes differ from independent fixture');assert(firstK[0]===Math.fround(-50/64)&&firstV[0]===Math.fround(-51/64),'Producer input arrays were modified');assert(progress===Math.ceil(ref.keyCount/64),'Missing key tile');assert(r.evidence.finalKeyCount===ref.keyCount%64||ref.keyCount%64===0&&r.evidence.finalKeyCount===64,'Tail shape padded');assert(r.evidence.keysConsumed===ref.keyCount,'Some keys excluded');assert(r.denominators.every(v=>v>0&&Number.isFinite(v)),'Bad row denominator');assert(f.q[0]===999&&before[0]!==999&&f.q.byteLength===8192,'Caller query ownership');cases.push({name:'pattern K'+ref.keyCount,passed:true,comparison:c,inputHashes,evidence:r.evidence});}
  for(const ref of reference.specialCases??[]){
   const f=createAttentionFixture({keyCount:ref.keyCount,mode:ref.mode}),r=await op.run({q:f.q,source:f.source});
   const c=compare(r.output,new Float32Array(ref.expected),reference.tolerance),denominator=compare(r.denominators,ref.softmaxDenominatorF64,reference.tolerance),rowMax=compare(r.rowMax,ref.rowMaximaF64,reference.tolerance);
   if(ref.mode==='uniform'){
    assert(r.denominators.every(x=>x===120),'Uniform row normalization has ghost/missing keys');
    const zeroId=f.source.describe().bindingId+'-Vzero';const zeros={describe(){const d=f.source.describe();return {...d,bindingId:zeroId,provenance:{...d.provenance,generator:'closed-form-Vzero-v1'}};},async readKV(o,n,c){const b=await f.source.readKV(o,n,c);b.v.fill(0);return {...b,bindingId:zeroId};}};
    const zero=await op.run({q:f.q,source:zeros});assert(zero.output.every(x=>x===0)&&zero.denominators.every(x=>x===120),'Zero value/uniform logits failed');
   }
   if(ref.mode==='increasing-max'){
    const unitId=f.source.describe().bindingId+'-Vunit';const ones={describe(){const d=f.source.describe();return {...d,bindingId:unitId,provenance:{...d.provenance,generator:'closed-form-Vunit-v1'}};},async readKV(o,n,c){const b=await f.source.readKV(o,n,c);b.v.fill(1);return {...b,bindingId:unitId};}};
    const normalized=await op.run({q:f.q,source:ones});assert(normalized.output.every(x=>x===1),'Softmax rows do not normalize to1 across maximum updates');
   }
   if(ref.mode==='increasing-max')assert(r.evidence.maxUpdates>=32,'Second tile did not rescale old numerator and denominator');
   cases.push({name:ref.mode+' K120 exacttail56',passed:true,comparison:c,denominator,rowMax,closedFormChecks:{zeroValues:ref.mode==='uniform',normalizedUnitValues:ref.mode==='increasing-max'},evidence:r.evidence});
  }
  for(const edge of ['describe','query-getter']){
   const inner=createAttentionFixture({keyCount:120,mode:'uniform'}),outer=createAttentionFixture({keyCount:120});let innerWork;
   const startInner=()=>{innerWork=op.run({q:inner.q,source:inner.source});void innerWork.catch(()=>{});};
   const input=edge==='describe'?{q:outer.q,source:{...outer.source,describe(){startInner();return outer.source.describe();}}}:{get q(){startInner();return outer.q;},source:outer.source};
   const outerWork=op.run(input),states=await Promise.allSettled([outerWork,innerWork]);
   assert(states[0].status==='fulfilled'&&states[1].status==='rejected'&&/busy/i.test(String(states[1].reason)),'Reentrant '+edge+' bypassed BUSY');
   compare(states[0].value.output,new Float32Array(fixtures.find(r=>r.keyCount===120).expected),reference.tolerance);
  }
  cases.push({name:'reentrant source.describe and argument getter rejected before shared state mutation',passed:true});
  const f=createAttentionFixture({keyCount:120}),controller=new AbortController();let calls=0;await rejects(()=>op.run({q:f.q,source:f.source,signal:controller.signal,onProgress:()=>{calls++;controller.abort();}}),'Cancelled result accepted');assert(calls===1,'Cancelled job read later tiles');
  const next=await op.run({q:f.q,source:f.source});const ref=fixtures.find(r=>r.keyCount===120);compare(next.output,new Float32Array(ref.expected),reference.tolerance);
  const bad=f.q.slice();bad[0]=NaN;await rejects(()=>op.run({q:bad,source:f.source}),'Nonfinite query accepted');await rejects(()=>op.run({q:new Float32Array(1),source:f.source}),'Wrong query shape accepted');
  const nonfiniteSource={...f.source,async readKV(o,n,c){const r=await f.source.readKV(o,n,c);r.v[0]=NaN;return r;}};await rejects(()=>op.run({q:f.q,source:nonfiniteSource}),'Nonfinite value source accepted');
  const sourceShape={...f.source,async readKV(o,n,c){const r=await f.source.readKV(o,n,c);return {...r,kShape:[64,128]};}};await rejects(()=>op.run({q:f.q,source:sourceShape}),'Wrong tail shape accepted');
  const wrong={...f.source,async readKV(o,n,c){const r=await f.source.readKV(o,n,c);return {...r,count:n+1};}};await rejects(()=>op.run({q:f.q,source:wrong}),'Wrong logical source count accepted');
  const work=op.run({q:f.q,source:f.source});await rejects(()=>op.run({q:f.q,source:f.source}),'Concurrent run accepted');await rejects(()=>op.dispose(),'Busy operator disposed');const afterInvalid=await work;compare(afterInvalid.output,new Float32Array(ref.expected),reference.tolerance);
  cases.push({name:'cancel/reuse/shape/finite/source count/BUSY ownership guards',passed:true});
  return {passed:true,scope:'postnorm/postRoPE explicit-fixture one-head selected attention, all keys, no full NN/production dtype claim',cases,resources:op.stats()};
 }finally{await op.dispose();}
}

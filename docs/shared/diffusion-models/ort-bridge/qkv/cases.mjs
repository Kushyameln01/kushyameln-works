import {createActualQkvDiagnostic} from './stage.mjs';
const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
function check(v,m){if(!v)throw Error(m);}
function compare(actual,expected,gate){check(actual instanceof Float32Array&&actual.length===expected.length,'Full comparison shape');let maximum=0,failed=0;for(let i=0;i<actual.length;i++){const delta=Math.abs(actual[i]-expected[i]);maximum=Math.max(maximum,delta);if(!Number.isFinite(delta)||delta>gate.absolute+gate.relative*Math.abs(expected[i]))failed++;}return {values:actual.length,failed,maxAbsolute:maximum,gate};}
async function refuses(fn){let caught=false;try{await fn();}catch{caught=true;}check(caught,'Expected refusal');}
export async function runQkvCases(file,reference){
 const cases=[],comparisons={};let stage;
 try{
  await refuses(()=>createActualQkvDiagnostic({file:new Blob([new Uint8Array(8)]),side:'LOW'}));cases.push({name:'invalid original file rejects before execution',passed:true});
  stage=await createActualQkvDiagnostic({file,side:reference.side});
  check(stage.describe().productionQKVVerified===false,'No promotion from explicit hidden fixture');
  const hidden=Float32Array.from(reference.input),positions=Float32Array.from(reference.coords.flatMap(v=>[v.t,v.h,v.w])),sourceIds=Int32Array.from(reference.coords.map(v=>v.sourceId));
  await refuses(()=>stage.run({hidden:new Float32Array(128),positions,sourceIds}));await refuses(()=>stage.run({hidden,positions:new Float32Array(3),sourceIds}));await refuses(()=>stage.run({hidden,positions,sourceIds,headIndex:1}));
  const aborted=new AbortController();aborted.abort();await refuses(()=>stage.run({hidden,positions,sourceIds,signal:aborted.signal}));cases.push({name:'exact full-width shapes and preabort reject',passed:true});
  let inner;await refuses(()=>stage.run({get hidden(){inner=stage.run({hidden,positions,sourceIds});return new Float32Array(128);},positions,sourceIds}));await refuses(()=>inner);cases.push({name:'reentrant getter refuses before shared resource mutation',passed:true});
  const cancellation=new AbortController();await refuses(()=>stage.run({hidden,positions,sourceIds,signal:cancellation.signal,onProgress:()=>cancellation.abort()}));cases.push({name:'cancel after bounded row stage and reuse',passed:true});
  const before=await sha(hidden),owned=hidden.slice();let changed=false;
  const result=await stage.run({hidden,positions,sourceIds,onProgress:()=>{if(!changed){hidden.fill(99);changed=true;}}});
  const pairs=[['qkv.q',result.qkv.q,reference.expected.qkv.q,reference.gates.projection],['qkv.k',result.qkv.k,reference.expected.qkv.k,reference.gates.projection],['qkv.v',result.qkv.v,reference.expected.qkv.v,reference.gates.projection],['norm.q',result.norm.q,reference.expected.norm.q,reference.gates.norm],['norm.k',result.norm.k,reference.expected.norm.k,reference.gates.norm],['matrices',result.matrices,reference.expected.matrices,reference.gates.ropeMatrix],['q',result.q,reference.expected.q,reference.gates.ropeApply],['k',result.k,reference.expected.k,reference.gates.ropeApply],['v',result.v,reference.expected.v,{absolute:1e-4,relative:1e-5}],['attention',result.attention,reference.expected.attention,reference.gates.connectedAttention]];
  const outputs={};for(const [name,actual,expected,gate]of pairs){const c=compare(actual,expected,gate);comparisons[name]=c;check(c.failed===0,'Gate failed: '+name);outputs[name]=await sha(actual);}
  for(const kind of ['q','k','v']){const r=reference.ranges.find(r=>r.key==='blocks.0.self_attn.'+kind+'.weight'),actual=result.evidence.sourceWeights[kind],bias=result.evidence.original.parameters.find(p=>p.key==='blocks.0.self_attn.'+kind+'.bias');check(actual.rawSHA256===r.rawSHA256&&actual.decodedF32SHA256===r.decodedF32SHA256&&actual.scaleSHA256===r.scaleSHA256&&actual.quantConfigSHA256===r.configSHA256&&bias.decodedSHA256===r.biasF32SHA256,'Strict full-weight/bias decode source identity: '+kind);}
  for(const kind of ['q','k']){const r=reference.ranges.find(r=>r.key==='blocks.0.self_attn.norm_'+kind+'.weight'),actual=result.evidence.original.parameters.find(p=>p.key===r.key);check(actual.decodedSHA256===r.decodedF32SHA256,'Strict norm-weight decode identity: '+kind);}
  check(result.evidence.hiddenSHA256===before&&before===await sha(owned),'Captured original hidden bytes');check(changed&&hidden.every(v=>v===99),'Caller mutation is isolated from owned snapshot');
  check(result.evidence.productionQKVVerified===false&&result.evidence.actualModelHiddenVerified===false&&result.evidence.P5==='BLOCKED','Bounded diagnostic scope retained');
  cases.push({name:'actual QKV all5120 -> QK norm -> source rotations -> selected-head attention all-values',passed:true});
  const stats=stage.stats();await stage.dispose();await refuses(()=>stage.run({hidden:owned,positions,sourceIds}));cases.push({name:'disposal rejects reuse and owns only its resources',passed:true});
  return {passed:true,scope:'actual immutable base weights, explicit hidden fixture, N16/full-width QKV and one-head selected16 attention; not production activation or full sequence',cases,comparisons,outputs,evidence:result.evidence,stats,productionQKVVerified:false,modelInference:false,P5:'BLOCKED'};
 }catch(error){return {passed:false,error:String(error.stack||error),cases,comparisons};}
 finally{await stage?.dispose();}
}

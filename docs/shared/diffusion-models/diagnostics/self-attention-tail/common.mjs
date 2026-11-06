// Diagnostic helpers only; private values are never returned in public metrics.
export const demand=(value,message)=>{if(!value)throw Error(message);};
export const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('');
export function selectExecutedSources(candidates,paths,harness){
 const out={...harness};for(const path of new Set(paths)){demand(Object.hasOwn(candidates,path),'Unanchored executed source: '+path);out[path]=candidates[path];}return out;
}
export function executedSources(payload){
 const paths=performance.getEntriesByType('resource').map(e=>new URL(e.name)).filter(u=>u.origin===location.origin&&/\.(mjs|js|wasm)$/.test(u.pathname)).map(u=>'docs'+decodeURIComponent(u.pathname));
 return selectExecutedSources(payload.actualSourceCandidates,paths,payload.executedHarnessSourceSHA256);
}
export async function compare(actual,expected,gate){
 demand(actual instanceof Float32Array&&actual.length===expected.length,'Exact all-value comparison shape');
 let failed=0,maxAbsolute=0,worstIndex=0;for(let i=0;i<actual.length;i++){const d=Math.abs(actual[i]-expected[i]);if(d>maxAbsolute){maxAbsolute=d;worstIndex=i;}if(!Number.isFinite(actual[i])||!Number.isFinite(expected[i])||d>gate.abs+gate.rel*Math.abs(expected[i]))failed++;}
 const result={values:actual.length,failed,maxAbsolute,worstIndex,actualSHA256:await sha(actual),gate};demand(failed===0,'Fixed numerical gate failed: '+JSON.stringify(result));return result;
}
export async function releaseOwners(owners,observer){const failures=[];try{for(const owner of owners){try{await owner?.dispose();}catch(e){failures.push(e);}}}finally{observer.restore();}if(failures.length)throw new AggregateError(failures,'Diagnostic owner cleanup failed');}
export const span=(name,bytes,scope='source-derived named span; allocator liveness unobserved')=>({name,bytes,scope});
export function captureFactory(observer,phases){return (phase,stats=null,namedSpans=[],detail={})=>{const memory=observer.snapshot(phase);const entry={phase,memory,stats,namedSpans,observableDistinctCapacityBytes:memory.memories.every(x=>x.capacityBytes!==null)?memory.memories.reduce((n,x)=>n+x.capacityBytes,0):null,scope:'Distinct linear Memory capacity, including disposed owners awaiting GC; not allocator live bytes or total peak',...detail};phases.push(entry);return entry;};}
export const acceptance=Object.freeze({naturalN2Only:true,lowIsHighHandoff:false,productionHiddenVerified:false,originalWorkflowInputsVerified:false,originalProductionPrecisionVerified:false,fullBlockVerified:false,modelInference:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'});

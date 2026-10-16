// Expectations authored before instrumentation. Product imports require the verified Pages receipt.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {base,receipt,poolFor} from './cloud-harness.mjs';

const {createUnityFileAnalyzer}=await import(new URL('shared/unity-analysis/file-sdk.mjs',base));
const enc=new TextEncoder();
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const stableHash=value=>sha(JSON.stringify(canonical(value)));
const semantic=r=>({before:r.before,after:r.after??null,diff:r.diff??null,inputs:r.inputs,completeness:r.completeness,ingestion:{before:r.ingestion.before,after:r.ingestion.after??null}});
const rawFixture=JSON.parse(await readFile(new URL('shared/unity-analysis/raw-example.json',base),'utf8'));
const synthetic=(count,objects)=>Array.from({length:count},(_,i)=>({path:`Assets/synthetic-${String(i).padStart(3,'0')}.asset`,bytes:enc.encode('%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n'+Array.from({length:objects},(_,j)=>`--- !u!1 &${j+1}\nGameObject:\n  m_Name: Object ${i}-${j}\n  m_TagString: Untagged\n  m_IsActive: 1\n`).join(''))}));
const allSets={small:rawFixture.before.map(f=>({path:f.path,bytes:enc.encode(f.text)})),manySmall:synthetic(64,2),large:synthetic(8,128)};
const filter=(name,defaults,decode=x=>x)=>{const values=process.env[name]?.split(',').map(x=>decode(x.trim()))??defaults;assert(values.length>0&&values.every(v=>defaults.includes(v)),`Invalid ${name}`);return [...new Set(values)];};
const datasets=filter('UNITY_STAGE_DATASETS',Object.keys(allSets));
const concurrencies=filter('UNITY_STAGE_CONCURRENCY',[1,2,4],Number);
const reuseSettings=filter('UNITY_STAGE_MODULE_REUSE',[false,true],x=>x==='true'?true:x==='false'?false:null);
const modes=filter('UNITY_STAGE_MODES',['fresh','warm']);
const count=(name,fallback)=>{const n=Number(process.env[name]??fallback);assert(Number.isInteger(n)&&n>0&&n<=20,`Invalid ${name}`);return n;};
const runs=count('UNITY_STAGE_RUNS',5),warmRuns=count('UNITY_STAGE_WARM_RUNS',5);
const fixtures=Object.fromEntries(Object.entries(allSets).map(([name,files])=>[name,{files:files.length,objects:name==='small'?8:name==='manySmall'?128:1024,rawBytes:files.reduce((n,f)=>n+f.bytes.length,0),inventory:files.map(f=>({path:f.path,bytes:f.bytes.length,sha256:sha(f.bytes)}))}]));
for(const f of Object.values(fixtures))f.inventorySha256=stableHash(f.inventory);
const expected=new Map(),samples=[];
const stageKeys=['inputSnapshotMs','readMs','hashMs','expandWallMs','parseWallMs','metadataMs','analysisWallMs','reportFinalizeMs'];
const jobStageKeys=['startupMs','computeMs','loadMs','queueMs','preparationMs','readyWaitMs','transferResidualMs','workerConstructMs','inputPostMs','hostValidationMs','hostFinishMs','modulePrepareMs','instantiateMs'];
function verify(report,dataset,pool){
 assert.equal(report.status,'succeeded');
 assert.equal(report.before.counts.objects,fixtures[dataset].objects);
 assert.equal(report.before.coverage.partialFiles.length,0);
 assert.equal(report.before.coverage.opaqueFiles.length,0);
 assert.equal(report.completeness.truncated,false);
 assert.equal(pool.getStatus().outstanding,0);
 assert.equal(pool.getStatus().retainedCount,0);
 for(const j of [...report.ingestion.jobs,...report.jobs]){assert.equal(j.status,'succeeded');assert.equal(j.inputRevision,report.inputRevision);assert(j.jobId.startsWith(report.sessionId+'.'),'Job/session identity mismatch');}
 for(const key of stageKeys)assert(Number.isFinite(report.metrics.stages?.[key])&&report.metrics.stages[key]>=0,`Missing or invalid stage ${key}`);
 const digest=stableHash(semantic(report));
 if(expected.has(dataset))assert.equal(digest,expected.get(dataset),`Semantic mismatch for ${dataset}`);else expected.set(dataset,digest);
 for(const f of allSets[dataset])assert.equal(sha(f.bytes),fixtures[dataset].inventory.find(x=>x.path===f.path).sha256,'Caller input mutated');
 return digest;
}
async function measure(analyzer,pool,{dataset,concurrency,moduleReuse,mode,run},outerStart=performance.now()){
 const compileCallsBefore=pool.getStatus().compileCalls;
 const report=await analyzer.analyze(allSets[dataset]);
 const end=performance.now();
 const semanticSha256=verify(report,dataset,pool);
 const jobs=[...report.ingestion.jobs,...report.jobs];
 const sums={};
 for(const key of jobStageKeys){const values=jobs.map(j=>j.metrics?.[key]).filter(v=>typeof v==='number'&&Number.isFinite(v));sums[key]=values.length?values.reduce((a,b)=>a+b,0):null;}
 samples.push({dataset,concurrency,moduleReuse,mode,run,fixtureSha256:fixtures[dataset].inventorySha256,semanticSha256,buildId:report.buildId??jobs[0]?.buildId??null,totalMs:report.metrics.totalMs,outerWallMs:end-outerStart,metrics:report.metrics,ownership:report.ownership??report.metrics.ownership??null,compileCallsDelta:pool.getStatus().compileCalls-compileCallsBefore,poolStatus:pool.getStatus(),jobStageSums:sums,jobs});
 analyzer.dispose(report.sessionId);
}
if(modes.includes('fresh'))for(const dataset of datasets)for(const concurrency of concurrencies)for(const moduleReuse of reuseSettings)for(let run=0;run<runs;run++){
 const start=performance.now(),pool=poolFor(concurrency,moduleReuse),analyzer=createUnityFileAnalyzer({pool,concurrency});
 try{await measure(analyzer,pool,{dataset,concurrency,moduleReuse,mode:'fresh',run},start);}finally{analyzer.dispose();pool.dispose();}
}
if(modes.includes('warm'))for(const dataset of datasets.filter(d=>d==='small'||d==='manySmall'))for(const moduleReuse of reuseSettings){
 const concurrency=2,start=performance.now(),pool=poolFor(concurrency,moduleReuse),analyzer=createUnityFileAnalyzer({pool,concurrency});
 try{await measure(analyzer,pool,{dataset,concurrency,moduleReuse,mode:'warm-initial',run:0},start);for(let run=0;run<warmRuns;run++)await measure(analyzer,pool,{dataset,concurrency,moduleReuse,mode:'warm',run});}finally{analyzer.dispose();pool.dispose();}
}
const stats=values=>{values=[...values].sort((a,b)=>a-b);const middle=values.length>>1;return {samples:values.length,min:values[0],median:values.length%2?values[middle]:(values[middle-1]+values[middle])/2,max:values.at(-1)};};
const groups=new Map();for(const sample of samples){const key=[sample.mode,sample.dataset,sample.concurrency,sample.moduleReuse].join('/');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(sample);}
const summaries=[...groups].map(([key,group])=>({key,mode:group[0].mode,dataset:group[0].dataset,concurrency:group[0].concurrency,moduleReuse:group[0].moduleReuse,totalMs:stats(group.map(s=>s.totalMs)),outerWallMs:stats(group.map(s=>s.outerWallMs)),stages:Object.fromEntries(stageKeys.map(k=>[k,stats(group.map(s=>s.metrics.stages[k]))])),jobStageSums:Object.fromEntries(jobStageKeys.map(k=>{const values=group.map(s=>s.jobStageSums[k]).filter(v=>v!==null);return [k,values.length?stats(values):null];}))}));
let comparison=null;
if(process.env.UNITY_STAGE_COMPARE){
 const prior=JSON.parse(await readFile(process.env.UNITY_STAGE_COMPARE,'utf8'));assert.equal(prior.status,'PASS');
 for(const dataset of datasets){assert.equal(fixtures[dataset].inventorySha256,prior.fixtures[dataset].inventorySha256,'Compared fixture mismatch');const previous=prior.samples.find(s=>s.dataset===dataset);assert(previous);assert.equal(expected.get(dataset),previous.semanticSha256,'Compared semantics mismatch');}
 comparison={baselineCommit:prior.commit,candidateCommit:receipt.commit,fixtureAndSemanticEquality:true,metric:'outerWallMs',reason:'Caller elapsed includes final report validation/freeze and fresh pool construction; report.metrics.totalMs excludes final validation/freeze.',groups:summaries.map(current=>{const baseline=prior.summaries.find(p=>p.key===current.key);return {key:current.key,baselineMedianMs:baseline?.outerWallMs.median??null,candidateMedianMs:current.outerWallMs.median,improvementPercent:baseline?(baseline.outerWallMs.median-current.outerWallMs.median)/baseline.outerWallMs.median*100:null};})};
}
console.log(JSON.stringify({status:'PASS',runtime:process.version,commit:receipt.commit,scope:'Node worker_threads running identified deployed Pages code; not browser timing',configuration:{datasets,concurrencies,reuseSettings,modes,runs,warmRuns,workerMode:'module',fresh:'A fresh pool/analyzer for every sample, matching the UI lifetime; outerWallMs includes their construction',warm:'2 Workers, initial call separate, then repeated calls in the same pool'},fixtures,samples,summaries,comparison,interpretation:{startup:'Constructor completion to first received worker phase (constructor measured separately); includes imports and scheduling, not OS-only startup',jobSums:'Independent per-job duration sums; overlap can make sums exceed wall time. Nested timings must not be added to total time. hostFinish excludes resolve/notify/drain.',wasmOnlyMs:null,universalSpeedup:false}},null,2));

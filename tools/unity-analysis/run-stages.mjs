// Expectations authored before instrumentation. Product imports require the verified Pages receipt.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {base,receipt,poolFor} from './cloud-harness.mjs';

const {createUnityFileAnalyzer}=await import(new URL('shared/unity-analysis/file-sdk.mjs',base));
const {BUILD_ID}=await import(new URL('shared/compute/protocol.mjs',base));
const {ANALYZER_VERSION,RULES_VERSION}=await import(new URL('shared/unity-analysis/model.mjs',base));
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
const expected=new Map(),samples=[],comparisonHashes=new Map();
let prior=null,comparison=null,comparisonAnalyzerVersion=null,runFailure=null;
const failure=error=>({name:error.name,message:error.message,stack:error.stack,actual:error.actual??null,expected:error.expected??null});
// Comparison may replace these two version labels only. Preserve every functional value and raw hash.
const comparisonSemantic=(r,version)=>({...semantic(r),before:{...r.before,analyzerVersion:version},after:r.after?{...r.after,analyzerVersion:version}:null});
const comparisonHash=(r,rawHash)=>{if(!comparisonAnalyzerVersion)return null;if(!comparisonHashes.has(rawHash))comparisonHashes.set(rawHash,stableHash(comparisonSemantic(r,comparisonAnalyzerVersion)));return comparisonHashes.get(rawHash);};
const stageKeys=['inputSnapshotMs','readMs','hashMs','expandWallMs','parseWallMs','metadataMs','analysisWallMs','reportFinalizeMs'];
const jobStageKeys=['startupMs','computeMs','loadMs','queueMs','preparationMs','readyWaitMs','transferResidualMs','workerConstructMs','inputPostMs','hostValidationMs','hostFinishMs','modulePrepareMs','instantiateMs'];
function verify(report,dataset,pool,digest){
 assert.equal(report.status,'succeeded');
 assert.equal(report.before.counts.objects,fixtures[dataset].objects);
 assert.equal(report.before.coverage.partialFiles.length,0);
 assert.equal(report.before.coverage.opaqueFiles.length,0);
 assert.equal(report.completeness.truncated,false);
 assert.equal(report.buildId,BUILD_ID,'Deployed build identity mismatch');
 assert.equal(report.analyzerVersion,ANALYZER_VERSION,'Deployed analyzer version mismatch');
 assert.equal(report.ruleSetVersion,RULES_VERSION,'Deployed rule version mismatch');
 for(const snapshot of [report.before,report.after].filter(Boolean)){assert.equal(snapshot.analyzerVersion,ANALYZER_VERSION);assert.equal(snapshot.ruleSetVersion,RULES_VERSION);}
 assert.equal(pool.getStatus().outstanding,0);
 assert.equal(pool.getStatus().retainedCount,0);
 for(const j of [...report.ingestion.jobs,...report.jobs]){assert.equal(j.status,'succeeded');assert.equal(j.buildId,BUILD_ID);assert.equal(j.inputRevision,report.inputRevision);assert(j.jobId.startsWith(report.sessionId+'.'),'Job/session identity mismatch');}
 for(const key of stageKeys)assert(Number.isFinite(report.metrics.stages?.[key])&&report.metrics.stages[key]>=0,`Missing or invalid stage ${key}`);
 if(expected.has(dataset))assert.equal(digest,expected.get(dataset),`Semantic mismatch for ${dataset}`);else expected.set(dataset,digest);
 for(const f of allSets[dataset])assert.equal(sha(f.bytes),fixtures[dataset].inventory.find(x=>x.path===f.path).sha256,'Caller input mutated');
 return digest;
}
async function measure(analyzer,pool,{dataset,concurrency,moduleReuse,mode,run},outerStart=performance.now()){
 const compileCallsBefore=pool.getStatus().compileCalls;
 const report=await analyzer.analyze(allSets[dataset]);
 const end=performance.now();
 const semanticSha256=stableHash(semantic(report));
 const jobs=[...report.ingestion.jobs,...report.jobs];
 const sums={};
 for(const key of jobStageKeys){const values=jobs.map(j=>j.metrics?.[key]).filter(v=>typeof v==='number'&&Number.isFinite(v));sums[key]=values.length?values.reduce((a,b)=>a+b,0):null;}
 const sample={dataset,concurrency,moduleReuse,mode,run,fixtureSha256:fixtures[dataset].inventorySha256,semanticSha256,comparisonSemanticSha256:comparisonHash(report,semanticSha256),buildId:report.buildId??jobs[0]?.buildId??null,analyzerVersion:report.analyzerVersion,snapshotAnalyzerVersions:{before:report.before.analyzerVersion,after:report.after?.analyzerVersion??null},ruleSetVersion:report.ruleSetVersion,totalMs:report.metrics.totalMs,outerWallMs:end-outerStart,metrics:report.metrics,ownership:report.ownership??report.metrics.ownership??null,compileCallsDelta:pool.getStatus().compileCalls-compileCallsBefore,poolStatus:pool.getStatus(),jobStageSums:sums,jobs};
 samples.push(sample);
 try{verify(report,dataset,pool,semanticSha256);sample.verification='PASS';}catch(error){sample.verification='FAIL';sample.failure=failure(error);sample.failedReport=report;throw error;}finally{analyzer.dispose(report.sessionId);}
}
try{
if(process.env.UNITY_STAGE_COMPARE){
 prior=JSON.parse(await readFile(process.env.UNITY_STAGE_COMPARE,'utf8'));assert.equal(prior.status,'PASS');
 const declared=process.env.UNITY_STAGE_COMPARE_ANALYZER_VERSION;
 const recorded=[...new Set(prior.samples.flatMap(s=>[s.analyzerVersion,s.snapshotAnalyzerVersions?.before,s.snapshotAnalyzerVersions?.after].filter(v=>v!=null)))];
 assert(recorded.length<=1,'Baseline has inconsistent analyzer versions');
 assert(recorded.length||declared,'UNITY_STAGE_COMPARE_ANALYZER_VERSION is required for a baseline without recorded analyzer versions');
 if(recorded.length&&declared)assert.equal(declared,recorded[0],'Explicit baseline version conflicts with recorded baseline version');
 comparisonAnalyzerVersion=recorded[0]??declared;assert(/^unity-analysis-[0-9]+\.[0-9]+\.[0-9]+$/.test(comparisonAnalyzerVersion),'Invalid comparison analyzer version');
 const baselineBuildIds=[...new Set(prior.samples.map(s=>s.buildId))];assert(baselineBuildIds.length===1&&typeof baselineBuildIds[0]==='string','Baseline build identity must be recorded consistently');
 for(const s of prior.samples)for(const j of s.jobs??[])assert.equal(j.buildId,s.buildId,'Baseline job/build identity mismatch');
 comparison={status:'pending',baselineCommit:prior.commit,candidateCommit:receipt.commit,baselineBuildIds,candidateBuildId:BUILD_ID,candidateAnalyzerVersion:ANALYZER_VERSION,baselineAnalyzerVersion:comparisonAnalyzerVersion,baselineAnalyzerVersionSource:recorded.length?'baseline samples':'UNITY_STAGE_COMPARE_ANALYZER_VERSION',normalization:{paths:['before.analyzerVersion','after.analyzerVersion'],value:comparisonAnalyzerVersion,scope:'Cross-version comparison only; absent after remains null. Raw semanticSha256 and actual versions are preserved separately. No ruleSetVersion, functional value, path or hash is excluded or normalized.'},metric:'outerWallMs',reason:'Caller elapsed includes final report validation/freeze and fresh pool construction; report.metrics.totalMs excludes final validation/freeze.'};
}
if(modes.includes('fresh'))for(const dataset of datasets)for(const concurrency of concurrencies)for(const moduleReuse of reuseSettings)for(let run=0;run<runs;run++){
 const start=performance.now(),pool=poolFor(concurrency,moduleReuse),analyzer=createUnityFileAnalyzer({pool,concurrency});
 try{await measure(analyzer,pool,{dataset,concurrency,moduleReuse,mode:'fresh',run},start);}finally{analyzer.dispose();pool.dispose();}
}
if(modes.includes('warm'))for(const dataset of datasets.filter(d=>d==='small'||d==='manySmall'))for(const moduleReuse of reuseSettings){
 const concurrency=2,start=performance.now(),pool=poolFor(concurrency,moduleReuse),analyzer=createUnityFileAnalyzer({pool,concurrency});
 try{await measure(analyzer,pool,{dataset,concurrency,moduleReuse,mode:'warm-initial',run:0},start);for(let run=0;run<warmRuns;run++)await measure(analyzer,pool,{dataset,concurrency,moduleReuse,mode:'warm',run});}finally{analyzer.dispose();pool.dispose();}
}
}catch(error){runFailure=failure(error);}
const stats=values=>{values=[...values].sort((a,b)=>a-b);const middle=values.length>>1;return {samples:values.length,min:values[0],median:values.length%2?values[middle]:(values[middle-1]+values[middle])/2,max:values.at(-1)};};
const groups=new Map();for(const sample of samples.filter(s=>s.verification==='PASS')){const key=[sample.mode,sample.dataset,sample.concurrency,sample.moduleReuse].join('/');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(sample);}
const summaries=[...groups].map(([key,group])=>({key,mode:group[0].mode,dataset:group[0].dataset,concurrency:group[0].concurrency,moduleReuse:group[0].moduleReuse,totalMs:stats(group.map(s=>s.totalMs)),outerWallMs:stats(group.map(s=>s.outerWallMs)),stages:Object.fromEntries(stageKeys.map(k=>[k,stats(group.map(s=>s.metrics.stages[k]))])),jobStageSums:Object.fromEntries(jobStageKeys.map(k=>{const values=group.map(s=>s.jobStageSums[k]).filter(v=>v!==null);return [k,values.length?stats(values):null];}))}));
if(prior&&!runFailure){try{
 comparison.datasets=[];
 for(const dataset of datasets){
  assert.equal(fixtures[dataset].inventorySha256,prior.fixtures[dataset].inventorySha256,'Compared fixture mismatch');
  const previous=prior.samples.filter(s=>s.dataset===dataset),current=samples.filter(s=>s.dataset===dataset);assert(previous.length&&current.length);
  assert(previous.every(s=>s.semanticSha256===previous[0].semanticSha256),'Baseline semantics vary within dataset');
  const hashes=[...new Set(current.map(s=>s.comparisonSemanticSha256))];assert.equal(hashes.length,1,'Candidate comparison semantics vary within dataset');
  comparison.datasets.push({dataset,fixtureSha256:fixtures[dataset].inventorySha256,baselineSemanticSha256:previous[0].semanticSha256,candidateRawSemanticSha256:[...new Set(current.map(s=>s.semanticSha256))],candidateComparisonSemanticSha256:hashes[0],equal:hashes[0]===previous[0].semanticSha256});
  assert.equal(hashes[0],previous[0].semanticSha256,'Compared semantics mismatch after analyzerVersion-only normalization');
 }
 comparison.groups=summaries.map(current=>{const baseline=prior.summaries.find(p=>p.key===current.key);return {key:current.key,baselineMedianMs:baseline?.outerWallMs.median??null,candidateMedianMs:current.outerWallMs.median,improvementPercent:baseline?(baseline.outerWallMs.median-current.outerWallMs.median)/baseline.outerWallMs.median*100:null};});
 comparison.fixtureAndSemanticEquality=true;comparison.status='PASS';
 }catch(error){runFailure=failure(error);comparison.status='FAIL';comparison.fixtureAndSemanticEquality=false;comparison.failure=runFailure;}
}
console.log(JSON.stringify({status:runFailure?'FAIL':'PASS',failure:runFailure,runtime:process.version,commit:receipt.commit,buildId:BUILD_ID,analyzerVersion:ANALYZER_VERSION,ruleSetVersion:RULES_VERSION,scope:'Node worker_threads running identified deployed Pages code; not browser timing',configuration:{datasets,concurrencies,reuseSettings,modes,runs,warmRuns,workerMode:'module',fresh:'A fresh pool/analyzer for every sample, matching the UI lifetime; outerWallMs includes their construction',warm:'2 Workers, initial call separate, then repeated calls in the same pool'},fixtures,samples,summaries,comparison,interpretation:{startup:'Constructor completion to first received worker phase (constructor measured separately); includes imports and scheduling, not OS-only startup',jobSums:'Independent per-job duration sums; overlap can make sums exceed wall time. Nested timings must not be added to total time. hostFinish excludes resolve/notify/drain.',wasmOnlyMs:null,universalSpeedup:false}},null,2));
if(runFailure)process.exitCode=1;

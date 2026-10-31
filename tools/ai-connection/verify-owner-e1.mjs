#!/usr/bin/env node
// Recheck published owner evidence, without downloading originals or claiming
// to recompute unreceived private weight arrays or management runtime results.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const OWNER='0c27874908638afc748ea2455a2779a16736730b';
const PEER='438972f30242e0a3bc66edb8591f38eaa0fcd384';
const KERNEL='3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24';
const GRAPH='af48828a7e93d75f529cee34c9b609cf4c3748f095a2c6fb3d5f1d71424988b0';
const SDK='lora-connection/2.0-draft.1',ADAPTER='lora-diffusion-diagnostic-adapter/0.1';
const EXECUTED={HIGH:'4d5fd7363f40f0d743ead448193ef2bf1915bbdc',LOW:'e1f03a4f6092c3154d5b47f166b77bbd32897ac9'};
const BASE={HIGH:'9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52',LOW:'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3'};
const GATES={baseDecode:{absolute:0,relative:0},weight:{absolute:1e-5,relative:1e-4},bias:{absolute:0,relative:0},projection:{absolute:1e-6,relative:1e-5}};
const evidence='development/ai-connection/evidence/lora-e1/';
const sha=b=>createHash('sha256').update(b).digest('hex');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const canonical=v=>JSON.stringify(sorted(v)),equal=(a,b)=>canonical(a)===canonical(b);
const hashJSON=v=>sha(Buffer.from(canonical(v)));
const f32Hash=values=>{const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeFloatLE(v,i*4));return sha(b);};
function compareOutputs(actual,expected,label){
 check(Array.isArray(actual)&&Array.isArray(expected)&&actual.length===16&&expected.length===16,label+': all16 outputs required');
 let maxAbsoluteError=0;
 for(let i=0;i<16;i++){
  const a=actual[i],b=expected[i];check(Number.isFinite(a)&&Number.isFinite(b)&&Math.fround(a)===a&&Math.fround(b)===b,label+': finite F32 outputs required');
  const delta=Math.abs(a-b);maxAbsoluteError=Math.max(maxAbsoluteError,delta);
  check(delta<=GATES.projection.absolute+GATES.projection.relative*Math.abs(b),label+': output gate failed at '+i);
 }
 return {compared:16,maxAbsoluteError};
}
function recordedComparison(value,count,gate,label){
 check(value?.passed===true&&value.compared===count&&value.failedCount===0&&equal(value.failedIndices,[])&&equal(value.gate,gate)&&Number.isFinite(value.maxAbsoluteError)&&value.maxAbsoluteError>=0,label+': recorded full-count/gate/pass mismatch');
 // All published weight maxima are below the absolute part alone. This checks
 // the scalar claim's consistency; it does not read or hash the raw arrays.
 check(value.maxAbsoluteError<=gate.absolute,label+': recorded maximum exceeds the independently sufficient absolute bound');
}
function partial(value,label,{complete=true}={}){
 check(value?.coverage==='PARTIAL'&&value.generationReady===false,label+': PARTIAL/non-generation state required');
 if(complete)check(value.completeAdapter===false,label+': completeAdapter must be false');
 if(Object.hasOwn(value,'snapshotPublished'))check(value.snapshotPublished===false,label+': no snapshot publication');
 if(Object.hasOwn(value,'modelInference'))check(value.modelInference===false,label+': no full-model inference');
}

const argv=process.argv.slice(2),args={};
if(argv.length===1&&argv[0]==='--help'){
 console.log('node tools/ai-connection/verify-owner-e1.mjs --lora-root <fixed 0c27874 archive> [--repo <management Git objects>] [--out <summary.json>]; reads public JSON/source only, recomputes320 output pairs, never requires full models or private ZIP payloads');process.exit(0);
}
for(let i=0;i<argv.length;i+=2){const k=argv[i]?.slice(2);check(argv[i]?.startsWith('--')&&['lora-root','repo','out'].includes(k)&&argv[i+1]&&!Object.hasOwn(args,k),'Unknown, duplicate or missing named argument');args[k]=argv[i+1];}
check(args['lora-root'],'--lora-root required');
const root=path.resolve(args['lora-root']),repo=path.resolve(args.repo??path.join(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const sourceRecords=new Map(),publicFiles=new Map(),sourceCache=new Map();
function gitBytes(commit,repoPath){
 check(/^[a-f0-9]{40}$/.test(commit)&&typeof repoPath==='string'&&path.posix.normalize(repoPath)===repoPath&&!repoPath.startsWith('/')&&!repoPath.startsWith('../')&&!repoPath.includes('\\'),'Unsafe pinned source identity');
 const key=commit+':'+repoPath;if(sourceCache.has(key))return sourceCache.get(key);
 const bytes=execFileSync('git',['show',key],{cwd:repo,maxBuffer:64*1024*1024});
 const blobSHA=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
 sourceRecords.set(key,{commit,path:repoPath,byteLength:bytes.length,sha256:sha(bytes),blobSHA});sourceCache.set(key,bytes);return bytes;
}
function readPublic(repoPath){
 const file=path.resolve(root,repoPath);check(file.startsWith(root+path.sep)&&fs.realpathSync(file).startsWith(fs.realpathSync(root)+path.sep),'Source path escaped archive');
 const bytes=fs.readFileSync(file);check(bytes.equals(gitBytes(OWNER,repoPath)),'Public source differs from exact owner Git blob: '+repoPath);
 publicFiles.set(repoPath,sourceRecords.get(OWNER+':'+repoPath));return bytes;
}
const json=p=>JSON.parse(readPublic(p).toString('utf8'));
const inventory=json('development/lora/contracts/original-inventory.json');
const matrix=json('development/ai-connection/JOINT-LORA-MATRIX.json');
const independent=json(evidence+'independent-artifact-verification.json');
const kernel=readPublic('docs/shared/inference/lora/kernel/lora.wasm');
check(kernel.length===5051&&sha(kernel)===KERNEL,'Corrected latest kernel bytes/hash required');
const kernelRegistry=readPublic('docs/shared/inference/lora/kernel/registry.mjs').toString('utf8');check(kernelRegistry.includes(KERNEL)&&kernelRegistry.includes('lora-block-f32-v1'),'Kernel registry mismatch');
for(const p of ['docs/shared/inference/lora/sdk-v2.mjs','docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs','tools/ai-connection/lora-reference.py'])readPublic(p);
check(inventory.length===4&&matrix.schemaVersion===2&&matrix.status==='PASS_DIAGNOSTIC_PARTIAL'&&matrix.peerCommit===PEER&&matrix.cases.length===4&&independent.status==='PASS','Owner matrix/inventory/readback status mismatch');
check(equal(matrix.aggregateVerification,independent.sides),'Matrix and owner independent readback aggregate disagree');

let outputValuesRecomputed=0,additionalLifecycleOutputValuesRecomputed=0,recordedWeightValuesChecked=0,recordedBiasValuesChecked=0,reportedRuntimeSourceChecks=0;
const sideSummaries=[],archives=[];
for(const side of ['HIGH','LOW']){
 const reportBytes=readPublic(evidence+side+'-result.json'),report=JSON.parse(reportBytes.toString('utf8'));
 const reference=json(evidence+side+'-reference.json'),gates=json(evidence+side+'-gates.json'),manifest=json(evidence+side+'-fixed-selected-artifacts.json'),binding=json(evidence+side+'-registry-correspondence.json');
 partial(report,side);check(report.status==='PASS_DIAGNOSTIC_PARTIAL'&&report.side===side&&report.peerCommit===PEER&&report.loraSourceCommit===EXECUTED[side]&&report.cases.length===10&&report.weightAttempts.length===10&&equal(report.pageErrors,[])&&report.baseFileUnchangedAcrossTrial===true,side+': final source/case/status mismatch');
 check(reference.side===side&&reference.cases.length===6&&equal(reference.gates,GATES)&&equal(gates.gates,GATES)&&equal(gates.strengths,[0,1,-1])&&equal(gates.declaredDiagnosticStrengthRange,[-1,1]),side+': fixed reference/gates mismatch');
 check(equal(report.fullOriginalShape,[5120,5120])&&equal(report.selectedRows,[0,16])&&equal(report.allColumns,[0,5120]),side+': selected/full shape mismatch');
 check(equal(report.binding,binding)&&binding.adapterVersion===ADAPTER&&binding.generationReady===false,side+': dual registry correspondence mismatch');
 const nr=binding.nativeRegistry,cr=binding.connectionRegistry,{registryHash,...nativeBody}=nr;
 check(nr.schemaVersion==='bernini-diagnostic-registry/0.1'&&nr.scope==='PARTIAL'&&nr.side===side&&nr.modelHash===BASE[side]&&nr.graphHash===GRAPH&&nr.executionProfileId==='bernini-q16x5120-f32-wasm-v1'&&nr.baseVerification.fullFileSHA256Verified===false&&hashJSON(nativeBody)===registryHash&&registryHash===binding.nativeRegistryHash,side+': native registry identity/hash mismatch');
 check(hashJSON(cr)===binding.connectionRegistryHash&&cr.contractVersion===SDK&&cr.side===side&&cr.modelHash===BASE[side]&&cr.graphHash===GRAPH,side+': connection registry hash/identity mismatch');
 check(equal(nr.targets.map(t=>t.fullShape),[[5120,5120],[5120]])&&equal(nr.targets.map(t=>t.shape),[[16,5120],[16]])&&equal(nr.targets.map(t=>t.binding),[{kind:'runtime-input',name:'weight'},{kind:'hike-parameter',name:'bias'}]),side+': runtime selected binding/shape mismatch');
 check(manifest.schemaVersion==='e1-selected-numeric-evidence/1'&&manifest.files.length===43,side+': final fixed artifact manifest required');
 const artifacts=new Map();for(const rec of manifest.files){check(!artifacts.has(rec.path)&&Number.isSafeInteger(rec.bytes)&&rec.bytes>0&&hex(rec.sha256),side+': invalid/duplicate artifact manifest entry');artifacts.set(rec.path,rec);}
 const matchArtifact=(name,bytes,digest)=>{const a=artifacts.get(name);check(a?.bytes===bytes&&a.sha256===digest,side+': artifact manifest mismatch '+name);};
 matchArtifact('result.json',reportBytes.length,sha(reportBytes));
 for(const [a,elements,bytes]of [[reference.activation,5120,20480],[reference.baseWeight,81920,327680],[reference.baseBias,16,64]]){check(a.elements===elements&&a.bytes===bytes&&a.dtype==='float32',side+': reference tensor shape/dtype mismatch');matchArtifact('reference/'+a.file,bytes,a.sha256);}
 for(const [privateName,publicName]of [['reference/reference.json',side+'-reference.json'],['reference/pre-execution-gates.json',side+'-gates.json']]){const b=readPublic(evidence+publicName);matchArtifact(privateName,b.length,sha(b));}
 const receipt=report.baseAcquisitionReceipt;
 check(receipt.fullFileVerified===true&&receipt.role===side&&receipt.expectedBytes===15574833216&&receipt.actualSHA256===BASE[side]&&receipt.expectedSHA256===BASE[side]&&receipt.coverageExact===true&&receipt.coverageComplete===true&&receipt.bytesCovered===15574833216&&receipt.hashBytesRead===15574833216&&receipt.sparseOrZeroFilledSurrogate===false&&receipt.completeFilePublishedBeforeCoverageAndHash===false&&receipt.fileStat&&['size','mtimeNs','ino','dev'].every(k=>receipt.fileStat[k]!==undefined),side+': reported complete acquisition receipt mismatch');
 let cursor=receipt.sequentialPrefixBytes;for(const range of receipt.ranges){check(range.start===cursor&&range.endExclusive>cursor&&range.nextByte===range.endExclusive&&range.status==='COMPLETE',side+': reported original byte coverage gap');cursor=range.endExclusive;}check(cursor===15574833216,side+': reported original coverage incomplete');
 const receiptBytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');matchArtifact('base-acquisition-receipt.json',receiptBytes.length,sha(receiptBytes));
 check(reference.baseIdentity.expectedFullSha256===BASE[side]&&reference.baseIdentity.fullFileHashComputedByThisOracle===false,side+': oracle/base integrity scope mismatch');
 for(const [commitKey,p]of [['runnerSourceSHA256','tools/ai-connection/test-lora-diffusion.mjs'],['oracleSourceSHA256','tools/ai-connection/lora-reference.py']])check(sha(gitBytes(EXECUTED[side],p))===report[commitKey],side+': executed runner/oracle Git source mismatch');
 for(const [list,expectedCommit]of [[report.ourSourceFiles,EXECUTED[side]],[report.peerSourceFiles,PEER]]){
  check(list.length>0&&new Set(list.map(f=>f.path)).size===list.length,side+': runtime source closure empty/duplicate');
  for(const rec of list){const b=gitBytes(rec.gitCommit,rec.path);check(rec.gitCommit===expectedCommit&&b.length===rec.bytes&&sha(b)===rec.sha256,side+': recorded runtime source differs from Git '+rec.path);reportedRuntimeSourceChecks++;if(rec.path.startsWith('docs/shared/inference/lora/'))check(b.equals(readPublic(rec.path)),side+': newly adopted production owner source differs from executed source');}
 }
 const recordedKernel=report.ourSourceFiles.find(f=>f.path==='docs/shared/inference/lora/kernel/lora.wasm');check(recordedKernel?.bytes===5051&&recordedKernel.sha256===KERNEL,side+': runtime old-kernel substitution');
 recordedComparison(report.baseDecode.weight,81920,GATES.baseDecode,side+' base weight');recordedComparison(report.baseDecode.bias,16,GATES.baseDecode,side+' base bias');
 check(report.baseDecode.weightBytesEqual===true&&report.baseDecode.biasBytesEqual===true,side+': recorded base byte agreement missing');
 for(const [kind,count,width]of [['weight',81920,4],['bias',16,4]]){const a=report.baseDecode[kind+'Artifact'];matchArtifact('actual/'+a.file,count*width,a.sha256);check(a.sha256===reference[kind==='weight'?'baseWeight':'baseBias'].sha256,side+': base reference hash mismatch');}
 const caseIds=new Set(),scopes=new Map(),pairPositive=new Map();let maxOutputError=0,maxRecordedWeightError=0;
 for(const pair of ['light','detail']){
  const scopeBytes=readPublic(evidence+pair+'-'+side+'-scope.json'),scope=JSON.parse(scopeBytes.toString('utf8')),item=inventory.find(x=>x.pairId===pair&&x.side===side.toLowerCase()),row=matrix.cases.find(x=>x.pairId===pair&&x.side===side);
  matchArtifact('actual/'+pair+'-'+side+'-scope.json',scopeBytes.length,sha(scopeBytes));
  check(item&&row&&scope.sourceSha256===item.sha256&&scope.selection.pairId===pair&&scope.selection.noise===side.toLowerCase()&&scope.coverage==='PARTIAL'&&scope.completeAdapter===false&&equal(scope.fullShape,[5120,5120])&&scope.excludedTargets.length===(pair==='light'?1050:399)&&scope.includedPatches.length===(pair==='light'?2:1)&&scope.excludedRegions.every(x=>x.slice.startRow===16&&x.slice.rowCount===5104),side+': included/excluded original scope mismatch');
  check(row.originalSha256===item.sha256&&row.originalBytes===item.bytes&&row.baseFullSha256===BASE[side]&&row.loraSourceCommit===EXECUTED[side]&&row.peerCommit===PEER&&row.nativeRegistryHash===registryHash&&row.connectionRegistryHash===binding.connectionRegistryHash&&row.wholeExcludedPatchCount===scope.excludedTargets.length&&equal(row.fullShape,[5120,5120])&&equal(row.rows,[0,16])&&equal(row.columns,[0,5120])&&row.selectedWeightElements===81920&&row.selectedConsumerBiasElements===16&&row.allOutputsAndComparisons.length===5,side+': matrix scope/source correspondence mismatch');partial(row,side+' matrix');
  scopes.set(pair,{scope,item,row});
 }
 for(const c of report.cases){
  check(!caseIds.has(c.id),side+': duplicate case');caseIds.add(c.id);const {scope,item,row}=scopes.get(c.pairId)??{};check(scope&&c.side===side&&[0,1,-1].includes(c.strength),side+': unknown case side/pair/strength');
  partial({...c,generationReady:c.receipt?.generationReady},c.id);check(c.sourceSha256===item.sha256&&c.excludedPatchCount===scope.excludedTargets.length&&c.preparedReleasedBeforeRun===true&&c.candidateHistoryReleasedBeforeRun===true,c.id+': source/coverage/ownership survival mismatch');
  const ref=reference.cases.find(r=>r.pairId===c.pairId&&r.side===side&&r.strength===c.strength);check(ref&&equal(ref.expectedOutput,c.expectedOutput)&&ref.retainedOriginalIdentity.sha256===item.sha256&&ref.retainedOriginalIdentity.fileName===item.fileName&&equal(ref.fullShape,[5120,5120])&&equal(ref.rows,[0,16])&&equal(ref.columns,[0,5120])&&ref.coverage==='PARTIAL'&&ref.completeAdapter===false,c.id+': independent reference identity/shape mismatch');
  check(ref.weight.elements===81920&&ref.weight.bytes===655360&&ref.weight.dtype==='float64'&&ref.bias.elements===16&&ref.bias.bytes===64&&ref.bias.dtype==='float32',c.id+': independent selected reference shape/dtype mismatch');
  for(const artifact of [ref.weight,ref.bias])matchArtifact('reference/'+artifact.file,artifact.bytes,artifact.sha256);
  const compared=compareOutputs(c.actualOutput,c.expectedOutput,c.id);outputValuesRecomputed+=compared.compared;maxOutputError=Math.max(maxOutputError,compared.maxAbsoluteError);
  check(c.outputComparison.passed===true&&c.outputComparison.compared===16&&c.outputComparison.failedCount===0&&equal(c.outputComparison.failedIndices,[])&&equal(c.outputComparison.gate,GATES.projection)&&c.outputComparison.maxAbsoluteError===compared.maxAbsoluteError,c.id+': published output comparison differs from current all16 recomputation');
  recordedComparison(c.weightComparison,81920,GATES.weight,c.id+' weight');recordedComparison(c.biasComparison,16,GATES.bias,c.id+' bias');recordedWeightValuesChecked+=81920;recordedBiasValuesChecked+=16;maxRecordedWeightError=Math.max(maxRecordedWeightError,c.weightComparison.maxAbsoluteError);
  for(const [artifact,bytes]of [[c.weightArtifact,327680],[c.biasArtifact,64]]){check(artifact.bytes===bytes&&hex(artifact.sha256),c.id+': selected artifact shape/hash missing');matchArtifact('actual/'+artifact.file,bytes,artifact.sha256);}
  const attempt=report.weightAttempts.find(x=>x.id===c.id),matrixCase=row.allOutputsAndComparisons.find(x=>x.id===c.id);check(attempt&&matrixCase,c.id+': comparison evidence correspondence missing');
  for(const k of ['weightComparison','biasComparison','weightArtifact','biasArtifact'])check(equal(c[k],attempt[k])&&equal(c[k],matrixCase[k]),c.id+': repeated comparison/artifact claim differs');
  for(const k of ['actualOutput','expectedOutput','outputComparison','strength'])check(equal(c[k],matrixCase[k]),c.id+': matrix output/strength differs');
  const s=c.receipt,v=s.validation,n=v?.evidence?.nativeReceipt;
  check(s.contractVersion===SDK&&s.state==='CONSUMER_APPLIED'&&s.sdkInstanceId===c.sdkInstanceId&&s.localInputRevision===c.localInputRevision&&s.localApplicationRevision===c.localInputRevision&&s.selection.pairId===c.pairId&&s.selection.noise===side.toLowerCase()&&s.sourceSha256===c.sourceSha256&&s.planId===c.planId&&s.registryHash===binding.connectionRegistryHash&&hex(s.bundleHash)&&s.coverage==='PARTIAL'&&s.scope==='diagnostic-projection'&&s.generationReady===false&&s.snapshotPublished===false&&s.ownership?.kind==='independent-copy'&&s.ownership.ownerId.endsWith(':'+n?.candidateId),c.id+': native state/ownership/local revision receipt mismatch');
  check(v.contractVersion===SDK&&v.valid===true&&v.coverage==='PARTIAL'&&v.scope===s.scope&&v.planId===c.planId&&v.registryHash===s.registryHash&&v.sourceSha256===c.sourceSha256&&v.evidence.adapterVersion===ADAPTER&&v.evidence.nativeRegistryHash===registryHash,c.id+': adapter validation identity mismatch');
  check(n?.schemaVersion==='bernini-diagnostic-validation/0.1'&&n.valid===true&&n.scope==='PARTIAL'&&n.modelInference===false&&n.side===side&&n.modelHash===BASE[side]&&n.graphHash===GRAPH&&n.registryHash===registryHash&&n.expectedSHA256===f32Hash(c.expectedOutput)&&equal(n.tolerance,GATES.projection)&&equal(n.failedIndices,[])&&n.maxAbsoluteError===compared.maxAbsoluteError&&n.evidence.graphSHA256===GRAPH&&n.evidence.ortVersion==='1.24.3'&&c.consumerEvidence.graphSHA256===GRAPH,c.id+': actual native diagnostic validation identity/hash mismatch');
  const nativePackage={schemaVersion:'bernini-runtime-feed-set/0.1',modelHash:BASE[side],graphHash:GRAPH,registryHash,side,scope:'PARTIAL',weightHash:c.weightArtifact.sha256,biasHash:c.biasArtifact.sha256};check(sha(Buffer.from(JSON.stringify(nativePackage)))===n.packageHash,c.id+': native package digest disagrees with declared full selected-array hashes');
  const identity={contractVersion:SDK,sdkInstanceId:c.sdkInstanceId,localInputRevision:c.localInputRevision,localApplicationRevision:s.localApplicationRevision,selection:s.selection,strength:c.strength,sourceSha256:c.sourceSha256,registryHash:s.registryHash,loaderPolicyId:cr.loaderPolicyId,coverage:'PARTIAL',diagnostic:scope.diagnostic,buildId:KERNEL};check(hashJSON(identity)===c.planId,c.id+': plan identity/source/kernel digest mismatch');
  for(const id of ['q.weight','q.bias']){
   const blocks=c.writes.filter(w=>w.weightId===id);let cursor=0;for(const b of blocks){check(b.offset===cursor&&Number.isSafeInteger(b.count)&&b.count>0&&hex(b.sha256)&&equal(b.binding,id==='q.weight'?{kind:'runtime-input',name:'weight'}:{kind:'hike-parameter',name:'bias'}),c.id+': recorded writes have gap/overlap/binding mismatch');cursor+=b.count;}
   check(cursor===(id==='q.weight'?81920:c.pairId==='light'?16:0),c.id+': recorded whole selected write coverage mismatch');
  }
  if(c.pairId==='detail'){check(c.passThrough.length===1&&equal(c.passThrough,v.evidence.basePassThrough)&&c.passThrough[0].planId===c.planId&&c.passThrough[0].weightId==='q.bias'&&c.passThrough[0].count===16&&c.passThrough[0].offset===0&&c.passThrough[0].sha256===reference.baseBias.sha256&&c.passThrough[0].kind==='immutable-base-pass-through'&&c.biasArtifact.sha256===reference.baseBias.sha256,c.id+': detail immutable-base bias provenance mismatch');}
  else check(c.passThrough.length===0,c.id+': light bias must remain an explicit LoRA patch');
  if(c.strength===0)check(c.weightArtifact.sha256===reference.baseWeight.sha256&&c.biasArtifact.sha256===reference.baseBias.sha256,c.id+': strength0 base identity mismatch');
  if(c.strength===1){const old=pairPositive.get(c.pairId);if(old)check(old===c.weightArtifact.sha256,c.id+': reapplication/cancel recovery declared weight digest differs');pairPositive.set(c.pairId,c.weightArtifact.sha256);}
 }
 for(const pair of ['light','detail']){const cases=report.cases.filter(c=>c.pairId===pair);check(cases.length===5&&cases.filter(c=>c.strength===0).length===1&&cases.filter(c=>c.strength===-1).length===1&&cases.filter(c=>c.strength===1).length===3,side+': initial/reapply/recovery case set mismatch');}
 check(report.lease.mode==='independent-copy'&&report.lease.copySurvivesPreparedAndCandidateRelease===true&&report.lease.activeLease.startsWith('N/A'),side+': native copy/lease distinction missing');
 check(report.v1Refusal.length===2&&report.v1Refusal.every(x=>x.passed===true&&typeof x.error==='string'),side+': actual native registry/v1 refusal evidence missing');
 for(const pair of ['light','detail']){
  for(const kind of ['base-restore','cancel-prepare-after-real-read','stale-plan','validation-failure-rollback','cooperative-consumer-cancel','cancel-recovery','cancel-after-native-commit-rollback']){
   const entries=report.lifecycle.filter(l=>l.pairId===pair&&l.kind===kind);check(entries.length===1,side+': lifecycle entry missing/duplicate '+pair+'/'+kind);const l=entries[0];
   if(kind==='base-restore'){
    const r=l.receipt,basePackageHash=sha(Buffer.from(JSON.stringify({schemaVersion:'bernini-base-feed/0.1',registryHash,weightHash:reference.baseWeight.sha256,biasHash:reference.baseBias.sha256})));
    check(r.state==='CONSUMER_APPLIED'&&r.application==='IMMUTABLE_BASE'&&r.coverage==='PARTIAL'&&r.scope==='diagnostic-projection'&&r.generationReady===false&&r.snapshotPublished===false&&r.validation.valid===true&&r.validation.registryHash===registryHash&&r.validation.modelHash===BASE[side]&&r.validation.graphHash===GRAPH&&r.validation.expectedSHA256===f32Hash(reference.baseExpectedOutput)&&equal(r.validation.tolerance,GATES.projection)&&r.commit.committed===true&&r.commit.packageHash===basePackageHash&&r.commit.packageHash===r.validation.packageHash,side+': base restoration receipt mismatch');compareOutputs(l.actualOutput,reference.baseExpectedOutput,side+' '+pair+' restoration');additionalLifecycleOutputValuesRecomputed+=16;
   }else check(l.passed===true,side+': recorded lifecycle terminal failure '+kind);
   if(kind==='cancel-prepare-after-real-read')check(l.code==='CANCELLED'&&l.readCount===1&&l.activeFeedUnchanged===true,side+': actual read cancellation terminal mismatch');
   if(kind==='cancel-after-native-commit-rollback'){check(l.code==='CANCELLED'&&l.priorFeedRestored===true&&equal(l.actualOutput,l.expectedPriorOutput),side+': late cancellation cleanup mismatch');compareOutputs(l.actualOutput,l.expectedPriorOutput,side+' late cancellation');additionalLifecycleOutputValuesRecomputed+=16;}
   if(kind==='cancel-recovery'){const c=report.cases.find(c=>c.pairId===pair&&c.id.includes('cancel-recovery'));check(c&&equal(c.actualOutput,l.actualOutput),side+': cancel recovery not tied to final numeric case');compareOutputs(l.actualOutput,c.expectedOutput,side+' cancel recovery');additionalLifecycleOutputValuesRecomputed+=16;}
  }
 }
 for(const kind of ['missing','duplicate','checksum','binding'])check(report.lifecycle.filter(l=>l.kind===kind&&l.passed===true).length===1,side+': actual native sink rejection missing '+kind);
 const oldKind=side==='HIGH'?'old-rollback-new-epoch':'old-committed-rollback-new-epoch',old=report.lifecycle.find(l=>l.kind===oldKind);check(old?.passed===true&&old.rollback.restored===false&&old.rollback.scope==='PARTIAL',side+': old rollback state mismatch');
 if(side==='LOW')check(old.firstCommit.committed===true&&old.newerCommit.committed===true&&old.newerCommit.epoch>old.firstCommit.epoch,side+': committed stale rollback epoch guard evidence missing');
 compareOutputs(old.actualOutput,reference.baseExpectedOutput,side+' stale rollback');additionalLifecycleOutputValuesRecomputed+=16;
 const aggregate=independent.sides.find(s=>s.side===side);check(aggregate?.resultSHA256===sha(reportBytes)&&aggregate.cases===10&&aggregate.weightElementsCompared===819200&&aggregate.biasElementsCompared===160&&aggregate.outputsCompared===160&&aggregate.maxWeightError===maxRecordedWeightError&&aggregate.maxBiasError===0&&aggregate.maxOutputError===maxOutputError&&aggregate.baseWholeHashVerified===true&&aggregate.baseUnchangedAcrossTrial===true&&aggregate.copySurvivesPreparedRelease===true&&aggregate.lifecycleCount===report.lifecycle.length&&equal(aggregate.lifecycleKinds,report.lifecycle.map(l=>l.kind)),side+': published independent raw-readback report aggregate mismatch');
 archives.push({side,byteLength:manifest.archive.bytes,sha256:manifest.archive.sha256,page:manifest.archive.page,payloadRetrieved:false,payloadHashIndependentlyVerified:false});
 sideSummaries.push({side,executedOwnerCommit:EXECUTED[side],peerCommit:PEER,resultSHA256:sha(reportBytes),cases:10,outputValuesRecomputed:160,maxOutputError,recordedWeightComparisons:819200,maxRecordedWeightError,nativeRegistryHash:registryHash,connectionRegistryHash:binding.connectionRegistryHash,recordedLifecycleTerminalsChecked:report.lifecycle.length,oldRollbackEvidence:side==='HIGH'?'uncommitted old candidate; no claim of committed-old test':'committed old epoch17 refused after epoch18'});
}
check(outputValuesRecomputed===320&&recordedWeightValuesChecked===1638400&&recordedBiasValuesChecked===320,'All20-case coverage must be complete');
const result={schemaVersion:'works-owner-e1-verification/1',status:'PASS_OWNER_RECORDED_E1_PARTIAL_RECHECK',ownerCommit:OWNER,peerCommit:PEER,repository:'https://github.com/Kushyameln01/kushyameln-works',scope:'Published owner real-PARTIAL evidence provenance and consistency; Node rechecks all320 recorded output pairs',coverage:'PARTIAL',completeAdapter:false,generationReady:false,snapshotPublished:false,casesVerified:20,outputValuesRecomputed,additionalLifecycleOutputValuesRecomputed,recordedWeightValuesChecked,recordedBiasValuesChecked,rawWeightValuesRecomputed:0,rawBiasValuesRecomputed:0,managementRealE1Executed:false,modelOrLoraOriginalsDownloaded:false,modelOrLoraOriginalsCurrentlyRehashed:false,ownerIndependentRawArrayReadbackReported:true,rawArrayArchives:{materialized:false,recomputed:false,reason:'Private binary ZIP payloads were not supplied or materialized; current connector read_page_reference cannot return these ZIP bytes. This verifier reads public JSON, declared hashes and Git objects only.',archives},kernel:{byteLength:kernel.length,sha256:KERNEL,abiVersion:'lora-block-f32-v1',correctedOwnerBytesVerified:true},sides:sideSummaries,sourceVerification:{publicFiles:[...publicFiles.values()],reportedRuntimeSourceRecordsChecked:reportedRuntimeSourceChecks,uniqueGitObjectsChecked:sourceRecords.size,gitObjectReceiptSHA256:hashJSON([...sourceRecords.values()])},limits:['Recorded weight/bias comparison counts, gates, zero failures and declared artifact/package digests were cross-checked; complete raw weight/bias arrays were not re-read or independently rehashed here.','320 published actual/expected case-output values were recomputed with the fixed gate; the original model/LoRA arithmetic and browser execution were not repeated.','Owner source/result evidence is separate from management input/state/ownership/save/cancel tests and is not a new management E1 acceptance.']};
const serialized=JSON.stringify(result,null,2)+'\n';if(args.out){fs.mkdirSync(path.dirname(path.resolve(args.out)),{recursive:true});fs.writeFileSync(path.resolve(args.out),serialized);}
process.stdout.write(serialized);

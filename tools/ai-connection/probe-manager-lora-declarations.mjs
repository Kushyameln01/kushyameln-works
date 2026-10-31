#!/usr/bin/env node
// Metadata-only receiver probe. No SDK, native model runtime, original source,
// numerical operator or snapshot API is imported or executed by this command.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const SELF='tools/ai-connection/probe-manager-lora-declarations.mjs';
const WITNESS='development/ai-connection/reference-adoption/lora/management-handoff/OWNER-NUMERIC-WITNESS.json';
const REFERENCE_COMMIT='6dae9a6fac3e9ad29ea941f22211edbe4aa894ad';
const CATALOG='docs/shared/ai-connection/reference/catalog.v1.json';
const CATALOG_SHA='14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c';
const REPOSITORY='Kushyameln01/kushyameln-works';
const HELP='node tools/ai-connection/probe-manager-lora-declarations.mjs --manager-root <fixed management checkout> --manager-commit <40hex> --owner-declarations <committed OWNER-NUMERIC-WITNESS.json or exact byte copy> --out <new private output directory>';
const argv=process.argv.slice(2),args={},keys=['manager-root','manager-commit','owner-declarations','out'];
if(argv.length===1&&argv[0]==='--help'){console.log(HELP);process.exit(0);}
for(let i=0;i<argv.length;i+=2){const key=argv[i].slice(2);if(!argv[i].startsWith('--')||!keys.includes(key)||!argv[i+1]||Object.hasOwn(args,key))throw Error('Explicit unique known argument/value required: '+HELP);args[key]=argv[i+1];}
for(const key of keys)if(!args[key])throw Error('Missing --'+key);
if(!/^[a-f0-9]{40}$/.test(args['manager-commit']))throw Error('Complete lowercase management source commit required');
const managerRoot=await fs.realpath(args['manager-root']),witnessPath=await fs.realpath(args['owner-declarations']),outRequested=path.resolve(args.out);
const within=(p,base)=>p===base||p.startsWith(base+path.sep),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(cwd,...a)=>execFileSync('git',a,{cwd,maxBuffer:8*1024*1024});
const ownCommit=git(root,'rev-parse','HEAD').toString().trim(),managerCommit=args['manager-commit'];
if(git(managerRoot,'rev-parse','HEAD').toString().trim()!==managerCommit)throw Error('Management checkout HEAD differs from explicit source commit');
const proof=[];
function gitBytes(commit,repoPath){return git(managerRoot,'show',commit+':'+repoPath);}
async function localPinned(repoPath,kind='management-module'){
 const file=path.resolve(managerRoot,repoPath);if(!within(file,managerRoot)||file===managerRoot||!within(await fs.realpath(file),managerRoot))throw Error('Metadata source escapes management checkout');
 const bytes=await fs.readFile(file);if(!bytes.equals(gitBytes(managerCommit,repoPath)))throw Error('Management source differs from pinned Git blob: '+repoPath);
 proof.push({kind,commit:managerCommit,path:repoPath,byteLength:bytes.length,sha256:sha(bytes),gitBlobMatched:true});return bytes;
}
const self=await fs.readFile(fileURLToPath(import.meta.url));if(!self.equals(git(root,'show',ownCommit+':'+SELF)))throw Error('Commit this receiver probe before execution');
const witnessBytes=await fs.readFile(witnessPath);if(witnessBytes.length>1024*1024||!witnessBytes.equals(git(root,'show',ownCommit+':'+WITNESS)))throw Error('Owner metadata witness must be an exact byte copy of the committed receiver witness');
const witness=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(witnessBytes));
if(witness.schemaVersion!=='lora-manager-numeric-witness/0.1-draft.1'||witness.fixtureOnly!==true||witness.witnessKind!=='retained-owner-binding-declaration-witness'||witness.currentLiveAdmission!==false||!Array.isArray(witness.patches)||witness.patches.length!==2)throw Error('Explicit retained, non-live two-patch owner metadata witness required');
const roles=new Set(witness.patches.map(p=>p.weightId));if(roles.size!==2||!roles.has('q.weight')||!roles.has('q.bias'))throw Error('Exactly the retained Q weight and bias declaration patches are required');
const originProof=[];
for(const entry of witness.sourceRefs??[]){
 const ref=entry.sourceRef??entry,expected=entry.sha256??ref.sha256;
 if(![REPOSITORY,'https://github.com/'+REPOSITORY].includes(ref.repository)||!/^[a-f0-9]{40}$/.test(ref.commit)||typeof ref.path!=='string'||ref.path.startsWith('/')||ref.path.split('/').some(p=>!p||p==='.'||p==='..')||!(ref.path.endsWith('.json')||ref.path.endsWith('.json.gz'))||!/^[a-f0-9]{64}$/.test(expected))throw Error('Witness provenance must reference pinned Works metadata JSON or JSON-gzip and SHA-256 only');
 const bytes=git(root,'show',ref.commit+':'+ref.path);if(sha(bytes)!==expected||entry.byteLength!==undefined&&bytes.length!==entry.byteLength||entry.bytes!==undefined&&bytes.length!==entry.bytes)throw Error('Retained witness metadata origin differs from its Git object');
 const compressed=ref.path.endsWith('.json.gz'),decoded=compressed?gunzipSync(bytes,{maxOutputLength:8*1024*1024}):bytes;
 if(decoded.length>8*1024*1024)throw Error('Retained JSON metadata exceeds its bounded decode budget');
 const metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));if(!metadata||typeof metadata!=='object')throw Error('Retained origin must decode to JSON object/array metadata');
 if(entry.uncompressedSha256!==undefined&&entry.uncompressedSha256!==sha(decoded))throw Error('Retained decompressed JSON identity differs from witness');
 originProof.push({repository:ref.repository,commit:ref.commit,path:ref.path,byteLength:bytes.length,sha256:sha(bytes),gitBlobMatched:true,encoding:compressed?'gzip-json':'json',uncompressedByteLength:decoded.length,uncompressedSha256:sha(decoded),strictUTF8AndJSONParsed:true,maxDecodedBytes:8*1024*1024,scope:'retained metadata only; no original payload read'});
}
if(!originProof.length)throw Error('Retained owner witness must identify at least one fixed metadata origin');
const visited=new Set();
async function proveModule(repoPath){
 if(visited.has(repoPath))return;visited.add(repoPath);const bytes=await localPinned(repoPath),code=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 const imports=[...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)];
 if([...code.matchAll(/\bimport\s*\(\s*([^\s])/g)].some(match=>!['\"',"'"].includes(match[1])))throw Error('Computed metadata module imports are outside this finite source proof');
 for(const match of imports){if(!match[1].startsWith('./')&&!match[1].startsWith('../'))throw Error('External/bare metadata module import is not authorized: '+match[1]);const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(repoPath),match[1]));if(!dependency.endsWith('.mjs')||dependency.startsWith('../'))throw Error('Only local metadata ES modules are permitted');await proveModule(dependency);}
}
await proveModule('docs/shared/ai-connection/compatibility.mjs');await proveModule('docs/shared/ai-connection/reference-loader.mjs');await proveModule('tools/ai-connection/fixtures.mjs');
const catalogBytes=await localPinned(CATALOG,'reference-json');if(sha(catalogBytes)!==CATALOG_SHA||!catalogBytes.equals(gitBytes(REFERENCE_COMMIT,CATALOG)))throw Error('Fixed 6dae catalog identity differs');
const catalog=JSON.parse(catalogBytes),referenceFiles=new Map();if(catalog.files?.length!==6)throw Error('Exactly six registered profile/norm/numeric JSON documents required');
for(const item of catalog.files){if(typeof item.path!=='string'||!item.path.startsWith('docs/shared/ai-connection/reference/')||!item.path.endsWith('.json')||item.path.split('/').some(p=>p==='..'))throw Error('Unexpected reference JSON path');const bytes=await localPinned(item.path,'reference-json');if(!bytes.equals(gitBytes(REFERENCE_COMMIT,item.path))||bytes.length!==item.byteLength||sha(bytes)!==item.sha256)throw Error('Registered reference differs from fixed 6dae JSON: '+item.path);referenceFiles.set(item.path,new Uint8Array(bytes));}
const [{evaluateEdge},{loadReferenceSet},{edgeFixture}]=await Promise.all([
 import(pathToFileURL(path.join(managerRoot,'docs/shared/ai-connection/compatibility.mjs')).href),
 import(pathToFileURL(path.join(managerRoot,'docs/shared/ai-connection/reference-loader.mjs')).href),
 import(pathToFileURL(path.join(managerRoot,'tools/ai-connection/fixtures.mjs')).href)
]);
const referenceSet=await loadReferenceSet({catalogBytes:new Uint8Array(catalogBytes),files:referenceFiles,expectedCatalogSha256:CATALOG_SHA});
const required=referenceSet.profileRecords.get('LOAD-COMFY-LINEAR-DIFF')?.requiredDeclarations;if(!required)throw Error('Fixed Linear/diff loader profile missing');
const declarations=witness.patches.map(p=>{
 if(!p.key||!Array.isArray(p.sourceDtypes)||!p.sourceDtypes.includes('BF16')||p.sourceDtypes.some(d=>!required.sourceDtypes.includes(d))||!required.variants.includes(p.variant)||![1,2].includes(p.targetRank)||p.loaderPolicyId!==required.loaderPolicyId||p.strength!==1||p.baseDtype!==required.baseDtype||p.outputDtype!==required.outputDtype||p.layout!==required.layout)throw Error('Expected actual supported BF16/F32/row-major strength-one baseline declarations');
 return {key:p.key,weightId:p.weightId,variant:p.variant,sourceDtype:'BF16',targetRank:p.targetRank,strength:p.strength,loaderPolicyId:p.loaderPolicyId,baseDtype:p.baseDtype,outputDtype:p.outputDtype,layout:p.layout};
});
const negatives=[],positives=[],mutants={baseDtype:'F16',outputDtype:'BF16',layout:'column-major'};
function evaluate(patch,declaration,kind,field=null){
 const q=edgeFixture();q.requiredScopes=[];q.evidence=[];
 q.referenceContext={referenceSet,normIds:['N-LOADER'],profileBindings:[{recordId:'LOAD-COMFY-LINEAR-DIFF',side:'producer'}],nativeDeclarations:{producer:structuredClone(declaration),consumer:{}}};
 const decision=evaluateEdge(q),expected=kind==='positive'?{compatibility:'COMPATIBLE',readiness:'ready'}:kind==='missing'?{compatibility:'UNVERIFIED',readiness:'blocked'}:{compatibility:'INCOMPATIBLE',readiness:'blocked'};
 const result={probeId:patch.weightId+':'+kind+(field?':'+field:''),kind,field,patchKey:patch.key,weightId:patch.weightId,declaration,expected,decision,decisionSHA256:sha(Buffer.from(JSON.stringify(decision))),conforms:decision.compatibility===expected.compatibility&&decision.readiness?.state===expected.readiness};
 if(field)result.fieldChecks=decision.checks?.filter(c=>c.normId==='N-LOADER'&&c.fieldPath?.endsWith('/'+field))??[];
 return result;
}
// All refusal cases run before either positive acceptance is considered.
for(const declaration of declarations)for(const field of Object.keys(mutants)){
 const missing={...declaration};delete missing.key;delete missing.weightId;delete missing[field];negatives.push(evaluate(declaration,missing,'missing',field));
 const changed={...declaration,[field]:mutants[field]};delete changed.key;delete changed.weightId;negatives.push(evaluate(declaration,changed,'mutated',field));
}
for(const declaration of declarations){const value={...declaration};delete value.key;delete value.weightId;positives.push(evaluate(declaration,value,'positive'));}
for(const result of negatives){const baseline=positives.find(p=>p.weightId===result.weightId);result.decisionEqualsPositiveBaseline=result.decisionSHA256===baseline.decisionSHA256;}
const conforming=negatives.length===12&&positives.length===2&&[...negatives,...positives].every(r=>r.conforms);
const report={schemaVersion:'lora-manager-declaration-probe/0.1-draft.1',status:conforming?'PASS_MANAGER_DECLARATION_METADATA_CONFORMANCE':'BLOCKED_MANAGER_DECLARATION_COMPARISONS_UNIMPLEMENTED',receiverCommit:ownCommit,managerCommit,referenceCommit:REFERENCE_COMMIT,catalogSHA256:CATALOG_SHA,scope:'retained owner metadata declarations in the authenticated management common edge fixture; no live owner plan/resource/snapshot or numerical runtime acceptance',fixtureOnly:true,currentLiveAdmission:false,runtimeAcceptance:false,formalThreePhaseEntry:{status:'NOT_ASSESSED_BY_THIS_DECLARATION_PROBE',methodNames:null,adoptionAccepted:false},numericalExecutions:0,originalPayloadFilesRead:0,originalWholeHashesComputed:0,receiverProbe:{path:SELF,commit:ownCommit,byteLength:self.length,sha256:sha(self),gitBlobMatched:true},ownerWitness:{path:WITNESS,commit:ownCommit,byteLength:witnessBytes.length,sha256:sha(witnessBytes),gitBlobMatched:true,witnessKind:witness.witnessKind,fixtureOnly:witness.fixtureOnly,currentLiveAdmission:witness.currentLiveAdmission,originalExecutionSourceCommit:witness.originalExecutionSourceCommit??null},metadataOriginProof:originProof,sourceProof:proof,referenceIntegrityReceipts:referenceSet.integrityReceipts,comparisonOrder:'12 negative declaration mutations first; then 2 supported BF16/F32/row-major positives',expectedCount:{negative:12,positive:2},observedCount:{negative:negatives.length,positive:positives.length,conforming:[...negatives,...positives].filter(r=>r.conforms).length},ignoredFieldEvidence:negatives.filter(r=>!r.conforms&&r.decisionEqualsPositiveBaseline).map(r=>({probeId:r.probeId,field:r.field,expected:r.expected,observed:{compatibility:r.decision.compatibility,readiness:r.decision.readiness.state},decisionEqualsPositiveBaseline:true})),negativeResults:negatives,positiveResults:positives};
for(const r of [root,managerRoot])if(within(outRequested,r))throw Error('Probe output must be outside source repositories');await fs.mkdir(outRequested,{recursive:true,mode:0o700});const out=await fs.realpath(outRequested);if([root,managerRoot].some(r=>within(out,r))||(await fs.readdir(out)).length)throw Error('Use a new empty private output directory outside repositories');await fs.chmod(out,0o700);
await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
process.stdout.write(JSON.stringify({status:report.status,managerCommit,catalogSHA256:CATALOG_SHA,negativeConforming:negatives.filter(r=>r.conforms).length,negativeTotal:12,positiveConforming:positives.filter(r=>r.conforms).length,positiveTotal:2,formalPhaseEntry:report.formalThreePhaseEntry.status,runtimeAcceptance:false,result:path.join(out,'result.json')})+'\n');
process.exitCode=conforming?0:2;

// Optional owner-sidecar integrity check. It executes no model/normalization
// math and is not the manager's compatibility/readiness evaluator.
import {parseStrictJson} from '../lora/strict-json.mjs';

const REF='6dae9a6fac3e9ad29ea941f22211edbe4aa894ad';
const OWNER='5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3';
const SHA=/^[a-f0-9]{64}$/;
const bytes=(v,label)=>{if(!(v instanceof Uint8Array)||!(v.buffer instanceof ArrayBuffer))throw TypeError(label+' ordinary Uint8Array required');return new Uint8Array(v);};
const snapshot=(map,label)=>{if(!(map instanceof Map))throw TypeError(label+' Map required');return new Map([...map].map(([k,v])=>{if(typeof k!=='string')throw TypeError(label+' string key required');return[k,bytes(v,label)];}));};
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');
const text=b=>new TextDecoder('utf8',{fatal:true}).decode(b);
const json=b=>parseStrictJson(text(b),{maxDepth:64});
const canonical=v=>JSON.stringify(v,(_k,value)=>value&&Object.getPrototypeOf(value)===Object.prototype?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)):value);
function check(value,message){if(!value)throw Error(message);}
function unique(items,key,label){const seen=new Set();for(const item of items){const id=item[key];check(typeof id==='string'&&!seen.has(id),label+' duplicate or missing '+key);seen.add(id);}return seen;}
async function checked(map,metadata,key,label){const b=map.get(key);check(b&&b.byteLength===metadata.byteLength&&await sha(b)===metadata.sha256,label+' digest/length mismatch: '+key);return b;}

export async function verifyDiffusionOwnerBindings({declarationBytes,expectedSha256,referenceFiles,ownerFiles}={}){
 // Capture every caller buffer before the first asynchronous hash.
 const owned=bytes(declarationBytes,'declaration'),refs=snapshot(referenceFiles,'reference'),owners=snapshot(ownerFiles,'owner');
 check(SHA.test(expectedSha256),'External expected declaration digest required');
 check(await sha(owned)===expectedSha256,'Declaration digest mismatch');
 const d=json(owned);
 check(d.schemaVersion==='diffusion-owner-profile-bindings/0.1'&&d.documentVersion==='1.0-draft.1','Unknown owner declaration schema');
 check(d.runtimeIntegrated===false&&d.generationReady===false,'P0 generation/runtime scope cannot be promoted');
 check(d.referenceSet?.commit===REF,'Fixed reference commit mismatch');
 check(d.baselineOwner?.sourceCommit===OWNER&&d.baselineOwner.nativeContract==='diffusion-models/0.1','Baseline source/native identity is fixed; new code belongs in the candidate field');
 check(d.mappingAuthority?.ownerRole==='LoRA'&&d.mappingAuthority.factory==='createDiffusionDiagnosticAdapter'&&d.mappingAuthority.adapterVersion==='lora-diffusion-diagnostic-adapter/0.1','Authoritative mapping owner mismatch');
 const referenceIds=unique(d.referenceSet.files,'path','reference');
 check(referenceIds.size===7,'Reference file set incomplete');
 const referenceDocuments=new Map();
 for(const f of d.referenceSet.files)referenceDocuments.set(f.path,json(await checked(refs,f,f.path,'reference')));
 const catalog=referenceDocuments.get(d.referenceSet.catalogPath);
 check(catalog?.schemaVersion==='works-reference-catalog/1.0-draft.1'&&catalog.documentVersion==='1.0-draft.1','Reference catalog version mismatch');
 check(await sha(refs.get(d.referenceSet.catalogPath))===d.referenceSet.catalogSha256,'Reference catalog digest mismatch');
 for(const f of catalog.files){const m=d.referenceSet.files.find(x=>x.path===f.path);check(m&&m.sha256===f.sha256&&m.byteLength===f.byteLength,'Reference metadata differs from canonical catalog');}
 const referenceRecords=new Map([...referenceDocuments.values()].flatMap(x=>(x.records??[]).map(r=>[r.recordId,r])));
 const normRecords=referenceDocuments.get('docs/shared/ai-connection/reference/norms.v1.json').rules;
 const normIds=unique(d.normBindings,'normId','norm');
 check(normIds.size===normRecords.length&&normRecords.every(n=>normIds.has(n.normId)),'Norm mapping set mismatch');
 unique(d.assets,'id','owner asset');
 for(const a of d.assets){check(a.id===a.commit+':'+a.path&&SHA.test(a.sha256),'Owner asset identity mismatch');await checked(owners,a,a.id,'owner asset');}
 const sourceAssets=new Map(d.assets.map(a=>[a.id,a]));
 async function bindBuild(build,sourceCommit,infoRef,sourceClosureRefs,label){
  const info=sourceAssets.get(infoRef);
  check(info?.commit===sourceCommit&&info.path==='docs/shared/diffusion-models/api/build-info.mjs',label+' build identity asset missing');
  const s=text(owners.get(infoRef)),id=s.match(/^export const BUILD_ID=("[^"]+");$/m),digest=s.match(/^export const BUILD_SOURCE_SHA256=("[^"]+");$/m),sources=s.match(/export const BUILD_SOURCES=Object\.freeze\((\{[\s\S]*\})\);\s*$/);
  check(id&&digest&&sources,label+' build identity source is not the fixed owner builder format');
  const declaredId=JSON.parse(id[1]),declaredDigest=JSON.parse(digest[1]),closure=json(new TextEncoder().encode(sources[1]));
  const actualDigest=await sha(new TextEncoder().encode(canonical(closure)));
  check(build.buildId===declaredId&&declaredId==='diffusion-models/0.1+'+declaredDigest&&declaredDigest===actualDigest,label+' build identity differs from verified actual build-info');
  const expected=Object.entries(closure).map(([relative,h])=>{
   const path=decodeURIComponent(new URL(relative,'https://code.invalid/'+info.path).pathname.slice(1)),key=sourceCommit+':'+path,a=sourceAssets.get(key);
   check(SHA.test(h)&&a?.commit===sourceCommit&&a.path===path&&a.sha256===h,label+' source closure asset differs from actual BUILD_SOURCES');return key;
  });
  check(Array.isArray(sourceClosureRefs)&&sourceClosureRefs.length===expected.length&&new Set(sourceClosureRefs).size===expected.length&&expected.every(key=>sourceClosureRefs.includes(key)),label+' source closure must contain every actual build source exactly once');
 }
 const baselineInfo=d.baselineOwner.sourceCommit+':docs/shared/diffusion-models/api/build-info.mjs';
 await bindBuild(d.baselineOwner,d.baselineOwner.sourceCommit,baselineInfo,d.baselineOwner.sourceClosureRefs,'Baseline');
 check(d.reusedProfiles.length===8,'P0 fixed profile set mismatch');unique(d.reusedProfiles,'recordId','profile');
 for(const p of d.reusedProfiles){
  const r=referenceRecords.get(p.recordId);check(r,'Unknown profile record');
  const externalConsumerOnly=p.recordId==='NORM-RAW-GENERATED-DECLARATION';
  check(p.nativeProfileId===r.nativeProfileId&&(externalConsumerOnly?p.nativeContract===null&&p.referenceConsumerContract===r.nativeContract&&p.externalConsumer?.owner==='vae':p.nativeContract===r.nativeContract),'Native profile identity differs from reference record');
  check(canonical(p.declarations)===canonical(r.requiredDeclarations),'Profile declaration differs from exact canonical shape/meaning/export');
  check(p.ownerSourceCommit===d.baselineOwner.sourceCommit&&p.ownerNativeBuildId===d.baselineOwner.buildId,'Reused evidence source/build identity mismatch');
  check(p.generationReady===false&&p.validation.freshRun===false&&['PARTIAL','UNIMPLEMENTED'].includes(p.validation.coverage),'Reused/partial evidence scope cannot be promoted');
  for(const key of [...p.sourceRefs,...p.kernelRefs,...p.validation.receiptRefs,...p.validation.referenceRefs])check(sourceAssets.has(key),'Profile asset reference missing');
  check([...p.sourceRefs,...p.kernelRefs,...p.validation.receiptRefs].every(id=>sourceAssets.get(id).commit===p.ownerSourceCommit),'Numerical receipt must retain its executed owner source');
  if(!p.validation.gate)check(p.validation.numericStatus==='NOT_VERIFIED'&&p.validation.readiness==='BLOCKED','Missing numerical gate requires NOT_VERIFIED/BLOCKED');
  if(p.recordId==='NORM-WAN21-MEAN-F5'&&p.validation.gate){
   const gateRef=p.validation.referenceRefs.find(id=>id.startsWith(p.validation.gate.sourceCommit+':')&&id.endsWith('/rev3-latent-space.json'));
   check(gateRef,'F5 gate needs original F5 evidence, not an F1/Rect gate');
   const original=json(owners.get(gateRef));
   check(p.validation.gate.maximumAbsoluteError===original.verification.toleranceDeclaredBeforeRun&&p.validation.gate.appliesToActualVaeEncodeDecode===false,'F5 original fixture gate mismatch');
  }
 }
 for(const id of d.baselineOwner.sourceClosureRefs)check(sourceAssets.has(id),'Build source closure asset missing');
 check(d.candidateBuild.numericAcceptance==='NOT_VERIFIED','Code candidate cannot inherit baseline numerical acceptance');
 if(d.candidateBuild.sourceCommit!==null)await bindBuild(d.candidateBuild,d.candidateBuild.sourceCommit,d.candidateBuild.buildInfoRef,d.candidateBuild.sourceClosureRefs,'Candidate');
 else check(d.candidateBuild.buildId===null&&Array.isArray(d.candidateBuild.sourceClosureRefs)&&d.candidateBuild.sourceClosureRefs.length===0,'Unknown candidate source cannot assert a verified build');
 check(d.managementAdoption.isNewCandidateAccepted===false&&d.managementAdoption.ownerBaselineIsManagementAdoption===false,'Manager adoption cannot silently advance');
 check(d.capacityDomains.nativePublicPointwiseMaxElements===1048576&&d.capacityDomains.internalSchedulerMaxElements===4194304&&d.capacityDomains.textConditioningMaxElements===2097152&&d.capacityDomains.productionLatentElements===2096640&&d.capacityDomains.capacityTransferAllowed===false,'Operation capacity domains cannot be conflated');
 return {verified:true,runtimeIntegrated:false,generationReady:false,declarationSha256:expectedSha256,referenceCommit:REF,profileCount:d.reusedProfiles.length,normCount:d.normBindings.length,verifiedOwnerAssets:d.assets.length,
  missingNumericalAcceptance:d.reusedProfiles.filter(p=>p.validation.contractStatus==='COMPATIBLE'&&p.validation.numericStatus==='NOT_VERIFIED').map(p=>p.recordId),
  scope:'Owner declaration/source-byte integrity only; no model execution, manager evaluator, fresh numerical acceptance or generation readiness'};
}

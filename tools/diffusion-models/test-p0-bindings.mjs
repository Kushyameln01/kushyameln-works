import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyDiffusionOwnerBindings} from '../../docs/shared/diffusion-models/profiles/integrity.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync('docs/shared/diffusion-models/profiles/p0-bindings.json');
const document=JSON.parse(bytes);
const fixtureRoot=process.env.P0_SOURCE_ROOT;
if(!fixtureRoot)throw Error('Run python tools/diffusion-models/test-p0-bindings.py to receive exact Git source bytes first');
const source=(commit,name)=>new Uint8Array(fs.readFileSync(path.join(fixtureRoot,commit,name)));
const referenceFiles=new Map(document.referenceSet.files.map(f=>[f.path,source(document.referenceSet.commit,f.path)]));
const ownerFiles=new Map(document.assets.map(f=>[f.id,source(f.commit,f.path)]));
const verify=(declarationBytes=bytes,options={})=>verifyDiffusionOwnerBindings({declarationBytes,expectedSha256:sha(declarationBytes),referenceFiles,ownerFiles,...options});
const changed=fn=>{const d=structuredClone(document);fn(d);return new TextEncoder().encode(JSON.stringify(d));};

test('pinned catalog and actual owner bytes verify without loading a numeric runtime',async()=>{
 const r=await verify();assert.equal(r.verified,true);assert.equal(r.runtimeIntegrated,false);assert.equal(r.generationReady,false);
 assert.equal(r.referenceCommit,'6dae9a6fac3e9ad29ea941f22211edbe4aa894ad');assert.equal(r.normCount,12);assert.equal(r.profileCount,8);
});
test('changed sidecar bytes cannot pass a fixed external digest',async()=>{
 const b=changed(d=>d.reusedProfiles[0].nativeProfileId='invented');await assert.rejects(()=>verify(b,{expectedSha256:sha(bytes)}),/digest/i);
});
test('same API with altered loaded kernel bytes is refused',async()=>{
 const kernel=document.assets.find(a=>a.path.endsWith('latent-space.wasm')),map=new Map(ownerFiles),b=map.get(kernel.id).slice();b[b.length-1]^=1;map.set(kernel.id,b);
 await assert.rejects(()=>verify(bytes,{ownerFiles:map}),/owner asset/i);
});
test('build identity and full source closure must match verified build-info bytes',async()=>{
 const wrong='diffusion-models/0.1+'+'0'.repeat(64);
 await assert.rejects(()=>verify(changed(d=>{d.baselineOwner.buildId=wrong;for(const p of d.reusedProfiles)p.ownerNativeBuildId=wrong;})),/build identity/i);
 await assert.rejects(()=>verify(changed(d=>d.baselineOwner.sourceClosureRefs.pop())),/source closure/i);
 await assert.rejects(()=>verify(changed(d=>d.baselineOwner.sourceClosureRefs.push(d.baselineOwner.sourceClosureRefs[0]))),/source closure/i);
});
test('candidate build is byte-bound separately and does not inherit numerical acceptance',async()=>{
 const candidate=d=>{d.candidateBuild={sourceCommit:d.baselineOwner.sourceCommit,buildId:d.baselineOwner.buildId,buildInfoRef:d.baselineOwner.sourceCommit+':docs/shared/diffusion-models/api/build-info.mjs',sourceClosureRefs:[...d.baselineOwner.sourceClosureRefs],numericAcceptance:'NOT_VERIFIED'};};
 assert.equal((await verify(changed(candidate))).verified,true);
 await assert.rejects(()=>verify(changed(d=>{candidate(d);d.candidateBuild.buildId='diffusion-models/0.1+'+'0'.repeat(64);})),/Candidate build identity/i);
 await assert.rejects(()=>verify(changed(d=>{candidate(d);d.candidateBuild.numericAcceptance='PASS';})),/cannot inherit/i);
});
test('equal128 counts cannot exchange F5 and Rect shape or exports',async()=>{
 for(const field of ['shape','kernelExports']){const b=changed(d=>{const f=d.reusedProfiles.find(p=>p.recordId==='NORM-WAN21-MEAN-F5'),r=d.reusedProfiles.find(p=>p.recordId==='NORM-WAN21-MEAN-RECT');f.declarations[field]=r.declarations[field];});await assert.rejects(()=>verify(b),/profile declaration/i);}
});
test('record IDs do not become native profile IDs and attention keeps null',async()=>{
 for(const id of ['NORM-WAN21-MEAN-RECT','EXEC-ATTENTION-Q16-ONEHEAD']){const b=changed(d=>{const p=d.reusedProfiles.find(p=>p.recordId===id);p.nativeProfileId=p.recordId;});await assert.rejects(()=>verify(b),/native profile/i);}
});
test('PARTIAL and reused receipts cannot be promoted to full or fresh acceptance',async()=>{
 for(const fn of [d=>d.generationReady=true,d=>d.reusedProfiles[0].validation.freshRun=true,d=>d.reusedProfiles[0].validation.coverage='FULL'])await assert.rejects(()=>verify(changed(fn)),/scope|generation|reused/i);
});
test('missing numeric gate alone preserves declared contract and blocks numeric acceptance',async()=>{
 const d=JSON.parse(new TextDecoder().decode(changed(d=>{const p=d.reusedProfiles.find(p=>p.recordId==='NORM-WAN21-MEAN-F5');p.validation.gate=null;p.validation.numericStatus='NOT_VERIFIED';p.validation.readiness='BLOCKED';})));
 const r=await verify(new TextEncoder().encode(JSON.stringify(d)));assert.equal(r.verified,true);assert.deepEqual(r.missingNumericalAcceptance,['NORM-WAN21-MEAN-F5']);
});
test('canonical catalog bytes and source namespaces are not silently replaced',async()=>{
 const key=document.referenceSet.files[0].path,map=new Map(referenceFiles),b=map.get(key).slice();b[b.length-1]^=1;map.set(key,b);await assert.rejects(()=>verify(bytes,{referenceFiles:map}),/reference/i);
 await assert.rejects(()=>verify(changed(d=>d.mappingAuthority.ownerRole='Diffusion')),/mapping/i);
});
test('verification snapshots all caller buffers before the first hash await',async()=>{
 const b=new Uint8Array(bytes),refs=new Map([...referenceFiles].map(([k,v])=>[k,v.slice()])),owners=new Map([...ownerFiles].map(([k,v])=>[k,v.slice()]));
 const pending=verify(b,{referenceFiles:refs,ownerFiles:owners});b.fill(0);for(const v of refs.values())v.fill(0);for(const v of owners.values())v.fill(0);assert.equal((await pending).verified,true);
});
test('F5 gate provenance is its original F5 source and not the F1/Rect record',async()=>{
 const p=document.reusedProfiles.find(p=>p.recordId==='NORM-WAN21-MEAN-F5');assert.equal(p.validation.gate.maximumAbsoluteError,2e-6);
 assert.equal(p.validation.gate.sourceCommit,'1317758bbba2b13603752d8c910ae2c6e77f78c5');assert.match(p.validation.scope,/synthetic F5/i);
 assert.equal(p.validation.referenceCatalogGateStatus,'NOT_VERIFIED_FOR_F5_IN_THIS_CATALOG');
 assert.equal(p.validation.gate.appliesToActualVaeEncodeDecode,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import * as normRunner from './run-norm-required-rect.mjs';
const joint=await import('./run-joint-rect-management.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
const browser=await import('./norm-required-rect-browser.mjs');
const diffusionRoot=process.env.WORKS_RECT_DIFFUSION_ROOT,nativeRoot=process.env.WORKS_RECT_VAE_ROOT,skip=!(diffusionRoot&&nativeRoot);
const managerCommit='60d16b64d6020d3d20239f087f8add91268dcaad';

// Catches substituting the historical restored file without proving the new
// raw→normalized disk readback→restore path that produced this exact file.
test('joint Rect carries current marked mean packages into the mandatory decode preflight',{skip},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'joint-rect-'));try{
  const bundleRoot=join(directory,'empty-bundle');await mkdir(bundleRoot);
  const out=join(directory,'run'),result=await joint.runJointRectManagement({diffusionRoot,nativeRoot,bundleRoot,referencePath:join(nativeRoot,'development/inference/e6/fixtures/png-roundtrip.f32'),out,managerCommit});
  assert.equal(result.status,'BLOCKED');assert.equal(result.nativeCalls,0);assert.equal(result.browserLaunched,false);assert.equal(result.actualNumericalAccepted,false);assert.equal(result.numericalState,'NOT_VERIFIED');assert.equal(result.generationReady,false);
  assert.equal(result.mean.transform.calls,2);assert.equal(result.mean.normalizedPackageGate.normalization,'wan21-comfy-f32-v1');assert.equal(result.mean.resources.storeEntries,0);assert.equal(result.mean.resources.cacheRetainedBytes,0);
  assert.equal(result.decode.missingAssets.length,3);assert.equal(result.decode.freshEncode,false);assert.equal(result.decode.currentInputLink.jointTraceId,result.jointTraceId);
  assert.equal(result.currentInputLink.inputPayloadSha256,'71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063');
  assert.equal(result.currentInputLink.rawInputIdentity.sha256,'8134bc943a60b3f0e0d388048ef0943a5274ef37511ce5630cc40d7596bb26a8');
  assert.equal(result.currentInputLink.restoredFileSha256,'dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612');
  assert.equal(result.currentInputLink.meanQueueReceipt?.invocations.length,2);
  assert.equal(result.currentInputLink.meanPrepareDecisions?.length,2);
  for(const record of result.currentInputLink.meanPrepareDecisions){assert.equal(record.decision.compatibility,'COMPATIBLE');assert.equal(record.decision.readiness.state,'blocked');assert.equal(record.decision.validation[0].result,'not-verified');assert.equal(record.numericalAccepted,false);assert.equal(record.generationReady,false);}
  assert.equal(result.decode.priorEvidence.actualExecutionCommit,'35151d1f447d6bba30931a8c28636b2d5d9c3820');
  assert.equal(result.decode.priorEvidence.currentInputLink.meanResultSha256,result.currentInputLink.meanResultSha256);
  for(const name of ['raw-mean','normalized-mean','restored-mean']){
   const trace=JSON.parse(await readFile(join(out,'mean',name,'trace.json'),'utf8'));
   assert.equal(trace.records[0].traceId,result.jointTraceId);assert.equal(trace.records[0].data.jointTraceId,result.jointTraceId);
  }
  assert.ok(result.decode.managementSource.sourceReceipts.some(x=>x.path==='tools/ai-connection/run-joint-rect-management.mjs'));
  assert.ok(result.decode.managementSource.sourceReceipts.some(x=>x.path==='tools/ai-connection/rect-management-runner.mjs'));
  const codec=await import('../../docs/shared/ai-connection/codecs/wktensor.mjs'),tensor=await codec.createAdoptedWktensorCodec().decode(new Uint8Array(await readFile(join(out,'mean/restored-mean/native.wktensor'))));
  await browser.assertRectCurrentInputLink({link:result.currentInputLink,tensor,managerCommit,jointTraceId:result.jointTraceId});
  for(const mutate of [x=>x.jointTraceId='stale-trace',x=>x.managerCommit='a'.repeat(40),x=>x.managementSource.baseCommit='a'.repeat(40),x=>x.sourceReceipts[0].sourceRef.commit='a'.repeat(40),x=>x.operations[0].sourceRef.commit='a'.repeat(40),x=>x.meanQueueReceipt.invocations[0].resourceReleased=false,x=>x.context.sourceFrameIndices=[9],x=>x.modelSha256='f'.repeat(64),x=>x.stages[1].normalization=undefined,x=>x.stages[2].payloadSha256='0'.repeat(64),x=>x.stages[0].packageReceipt=null]){
   const link=structuredClone(result.currentInputLink);mutate(link);await assert.rejects(()=>browser.assertRectCurrentInputLink({link,tensor,managerCommit,jointTraceId:result.jointTraceId}),e=>e.code==='RECT_CURRENT_INPUT_LINK_MISMATCH');
  }
  // The proof builder must independently reread current disk packages, rather
  // than trusting an earlier in-memory success flag or the old351 byte match.
  const file=join(out,'mean/normalized-mean/native.wktensor'),b=await readFile(file);b[b.length-1]^=1;await writeFile(file,b);
  await assert.rejects(()=>joint.readCurrentRectInputLink({meanDirectory:join(out,'mean'),managerCommit,jointTraceId:result.jointTraceId}),e=>e.code==='ASSET_HASH_MISMATCH');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('joint Rect rejects an unsupported scenario before touching current source or output',async()=>{
 await assert.rejects(()=>joint.runJointRectManagement({scenario:'encode',out:'/must-not-write',managerCommit}),e=>e.code==='UNKNOWN_SCENARIO');
});

test('fixed management identity is granted only for exact Git blob bytes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'joint-rect-git-')),git=promisify(execFile);try{
  const source=Buffer.from('export const fixture=true;\n');await writeFile(join(directory,'fixture.mjs'),source);
  await git('git',['init','-q'],{cwd:directory});await git('git',['add','fixture.mjs'],{cwd:directory});await git('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture'],{cwd:directory});
  const managerCommit=(await git('git',['rev-parse','HEAD'],{cwd:directory})).stdout.trim(),receipt={path:'fixture.mjs',byteLength:source.length,sha256:createHash('sha256').update(source).digest('hex')};
  const proof=await normRunner.verifyRectManagementCommit({managerCommit,sourceReceipts:[receipt],repositoryRoot:directory});assert.equal(proof.allMatched,true);assert.equal(proof.commit,managerCommit);
  for(const altered of [{...receipt,sha256:'0'.repeat(64)},{...receipt,byteLength:source.length+1},{...receipt,path:'missing.mjs'}]){
   const rejected=await normRunner.verifyRectManagementCommit({managerCommit,sourceReceipts:[altered],repositoryRoot:directory});assert.equal(rejected.allMatched,false);assert.equal(rejected.commit,null);
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});

// Metadata-only aggregation fixture: native adapter publication is spelled
// 'published'. A missing result or historical RGB can never admit the joint run.
test('joint result admits only the current mandatory decode publication and required recovery proof',()=>{
 const link={inputPayloadSha256:'71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063'};
 const published={status:'published',outputBinding:{inputMeanSha256:link.inputPayloadSha256},publishReceipt:{status:'complete'}};
 const decode={status:'PASS',scenario:'decode',modelInference:true,cases:[published]};
 assert.equal(joint.isJointRectDecodePublished({decode,currentInputLink:link,scenario:'decode'}),true);
 for(const altered of [{...decode,status:'BLOCKED'},{...decode,modelInference:false},{...decode,cases:[{...published,status:'PASS'}]},{...decode,cases:[{...published,outputBinding:{inputMeanSha256:'0'.repeat(64)}}]},{...decode,cases:[{...published,publishReceipt:{status:'unverified'}}]}])assert.equal(joint.isJointRectDecodePublished({decode:altered,currentInputLink:link,scenario:'decode'}),false);
 assert.equal(joint.isJointRectDecodePublished({decode,currentInputLink:link,scenario:'cancel-recover'}),false);
 const recovered={...decode,scenario:'cancel-recover',cases:[{status:'PASS',cancelled:true,cancellation:{stopConfirmed:true,originalTerminal:true,resourceReleased:true,reusable:true}},published]};
 assert.equal(joint.isJointRectDecodePublished({decode:recovered,currentInputLink:link,scenario:'cancel-recover'}),true);
 recovered.cases[0].cancellation.resourceReleased=false;
 assert.equal(joint.isJointRectDecodePublished({decode:recovered,currentInputLink:link,scenario:'cancel-recover'}),false);
});

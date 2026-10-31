import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const runner=await import('./run-norm-required-rect.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
const browserEntry=await import('./norm-required-rect-browser.mjs');
const nativeRoot=process.env.WORKS_NORM_RECT_NATIVE_ROOT,inputPath=process.env.WORKS_NORM_RECT_INPUT;
const skip=!(nativeRoot&&inputPath);
test('exact missing original decode assets produce normative BLOCKED/native0 without browser startup',{skip},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'norm-rect-missing-'));try{
  const out=join(directory,'result'),bundle=join(directory,'bundle');await mkdir(bundle);
  const result=await runner.runNormRequiredRect({nativeRoot,bundleRoot:bundle,inputPath,referencePath:join(nativeRoot,'development/inference/e6/fixtures/png-roundtrip.f32'),out,managerCommit:'edda43f9ea69c5b3ab1af3c6eb82295f2912887c'});
  assert.equal(result.status,'BLOCKED');assert.equal(result.blockedEdge,'actual-vae-decode');assert.equal(result.nativeCalls,0);assert.equal(result.browserLaunched,false);assert.equal(result.generationReady,false);assert.equal(result.missingAssets.length,3);assert.deepEqual(result.normExecution.requiredNormIds,['N-IDENTITY','N-SHAPE','N-EVIDENCE','N-TRANSACTION','N-ARTIFACT']);assert.equal(result.normExecution.decisions[0].phase,'declaration');assert.equal(result.nativeSource.commit,'855f435120f08eb9e818e51281fc26f0e2633829');assert.equal(result.priorEvidence.publicationCommit,'e86d17f8fe3310875d3578ce838e1fc2c32271dc');assert.equal(result.priorEvidence.actualExecutionCommit,'35151d1f447d6bba30931a8c28636b2d5d9c3820');assert.ok(result.sourceProof.length>=10);
  assert.deepEqual(JSON.parse(await readFile(join(out,'result.json'),'utf8')),result);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('corrupt native source rejects before inspecting any original asset or launching a browser',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'norm-rect-source-'));try{const p=join(directory,'docs/shared/inference/vae-api.mjs');await mkdir(dirname(p),{recursive:true});await writeFile(p,'throw Error("must never import");');await assert.rejects(()=>runner.preflightNormRequiredRect({nativeRoot:directory,bundleRoot:'/missing-assets',inputPath:'/missing-input',referencePath:'/missing-reference'}),e=>e.code==='NATIVE_SOURCE_MISMATCH');}finally{await rm(directory,{recursive:true,force:true});}
});
test('explicit unavailable RAM retains the sole judge declaration failure without native startup',{skip},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'norm-rect-resource-'));try{const result=await runner.runNormRequiredRect({nativeRoot,bundleRoot:join(directory,'missing-bundle'),inputPath,referencePath:join(nativeRoot,'development/inference/e6/fixtures/png-roundtrip.f32'),out:join(directory,'report'),managerCommit:'edda43f9ea69c5b3ab1af3c6eb82295f2912887c',resourceState:{status:'unavailable',ownerId:'norm:explicit-owner',requiredBytes:286314451,budgetBytes:286314451,occupiedBytes:1}});assert.equal(result.status,'BLOCKED');assert.equal(result.nativeCalls,0);assert.equal(result.browserLaunched,false);assert.equal(result.declarationFailure.code,'NORM_DECLARATION_BLOCKED');assert.equal(result.declarationFailure.decision.readiness.state,'blocked');assert.equal(result.missingAssets.length,3);}finally{await rm(directory,{recursive:true,force:true});}
});
test('browser verifies exact351 original input before its codec boundary',{skip},async()=>{
 const codec=await import(pathToFileURL(join(nativeRoot,'docs/shared/inference/tensor.mjs')).href),bytes=new Uint8Array(await readFile(inputPath));let codecCalls=0;
 const input=await browserEntry.decodeRectOriginalInput(bytes,{decodeTensor:async b=>{codecCalls++;return codec.decodeTensor(b);}});
 assert.equal(codecCalls,1);assert.equal(input.dataSha256,'71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063');assert.deepEqual(input.shape,[1,16,1,2,4]);
});
test('browser rejects a replaced codec-valid same-length mean before decoding',{skip},async()=>{
 const codec=await import(pathToFileURL(join(nativeRoot,'docs/shared/inference/tensor.mjs')).href),original=new Uint8Array(await readFile(inputPath)),other=await codec.decodeTensor(original);other.data[0]+=0.125;
 const replaced=await codec.encodeTensor(other);assert.equal(replaced.byteLength,1084);assert.equal((await codec.decodeTensor(replaced)).data[0],other.data[0]);let codecCalls=0;
 const guardedCodec={decodeTensor:async()=>{codecCalls++;throw Error('Replaced bytes must not reach the codec');}};
 for(const bytes of [replaced,original.slice(0,-1)])await assert.rejects(async()=>browserEntry.decodeRectOriginalInput(bytes,guardedCodec),e=>e.code==='RECT_INPUT_ORIGINAL_MISMATCH');
 assert.equal(codecCalls,0);
});

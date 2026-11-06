import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createOwnedArtifactStore,captureNativeTensor} from '../../docs/shared/ai-connection/adapters/artifacts.mjs';
import {sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';
import {ADOPTED_WKTENSOR_SOURCE,ADOPTED_WKTENSOR_DEPLOYMENT_PATH,verifyAdoptedWktensorSource} from '../../docs/shared/ai-connection/codecs/wktensor.mjs';
const runner=await import('./run-norm-required-rect.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
const browserEntry=await import('./norm-required-rect-browser.mjs');
const nativeRoot=process.env.WORKS_NORM_RECT_NATIVE_ROOT,inputPath=process.env.WORKS_NORM_RECT_INPUT;
const skip=!(nativeRoot&&inputPath);
test('exact missing original decode assets produce normative BLOCKED/native0 without browser startup',{skip},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'norm-rect-missing-'));try{
  const out=join(directory,'result'),bundle=join(directory,'bundle');await mkdir(bundle);
  const result=await runner.runNormRequiredRect({nativeRoot,bundleRoot:bundle,inputPath,referencePath:join(nativeRoot,'development/inference/e6/fixtures/png-roundtrip.f32'),out,managerCommit:'edda43f9ea69c5b3ab1af3c6eb82295f2912887c'});
  assert.equal(result.status,'BLOCKED');assert.equal(result.blockedEdge,'actual-vae-decode');assert.equal(result.nativeCalls,0);assert.equal(result.browserLaunched,false);assert.equal(result.generationReady,false);assert.equal(result.missingAssets.length,3);assert.deepEqual(result.normExecution.requiredNormIds,['N-IDENTITY','N-SHAPE','N-EVIDENCE','N-TRANSACTION','N-ARTIFACT']);assert.equal(result.normExecution.decisions[0].phase,'declaration');assert.equal(result.nativeSource.commit,'855f435120f08eb9e818e51281fc26f0e2633829');assert.equal(result.priorEvidence.publicationCommit,'e86d17f8fe3310875d3578ce838e1fc2c32271dc');assert.equal(result.priorEvidence.actualExecutionCommit,'35151d1f447d6bba30931a8c28636b2d5d9c3820');assert.ok(result.sourceProof.length>=10);assert.equal(result.sourceProof.find(p=>p.sourceRef.path==='docs/shared/inference/tensor.mjs').sha256,'4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b');assert.equal(result.persistenceCodecSource.verified,true);assert.equal(result.persistenceCodecSource.byteLength,8256);assert.equal(result.persistenceCodecSource.sourceRef.commit,'2bdca59ea78580d4fe7a9d31a8de33209b64d029');assert.equal(result.persistenceCodecSource.sha256,'d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5');assert.equal(result.persistenceCodecSource.deploymentPath,'docs/shared/ai-connection/codecs/tensor-2bdca59.mjs');
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
 const input=await browserEntry.decodeRectOriginalInput(bytes,{decode:async b=>{codecCalls++;return codec.decodeTensor(b);}});
 assert.equal(codecCalls,1);assert.equal(input.dataSha256,'71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063');assert.deepEqual(input.shape,[1,16,1,2,4]);
});
test('browser rejects a replaced codec-valid same-length mean before decoding',{skip},async()=>{
 const codec=await import(pathToFileURL(join(nativeRoot,'docs/shared/inference/tensor.mjs')).href),original=new Uint8Array(await readFile(inputPath)),other=await codec.decodeTensor(original);other.data[0]+=0.125;
 const replaced=await codec.encodeTensor(other);assert.equal(replaced.byteLength,1084);assert.equal((await codec.decodeTensor(replaced)).data[0],other.data[0]);let codecCalls=0;
 const guardedCodec={decode:async()=>{codecCalls++;throw Error('Replaced bytes must not reach the codec');}};
 for(const bytes of [replaced,original.slice(0,-1)])await assert.rejects(async()=>browserEntry.decodeRectOriginalInput(bytes,guardedCodec),e=>e.code==='RECT_INPUT_ORIGINAL_MISMATCH');
 assert.equal(codecCalls,0);
});
test('active browser E4 save/read uses the adopted codec source in both manifest and reader registry',async()=>{
 const store=createOwnedArtifactStore(),storage=new Map(),artifactId='fixture:browser-codec-artifact',traceId='fixture:browser-codec-trace',model='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b';
 const tensor={dtype:'float32',layout:'NCTHW',shape:[1,3,1,16,32],meaning:'raw-decoder-rgb',modelSha256:model,data:new Float32Array(1536).fill(.25)};
 const descriptor={contractVersion:'works-module-contract/1.0-draft.1',artifactId,kind:'tensor',native:{schemaId:'fixture:browser-native',schemaVersion:'1',payloadRef:'pending',metadata:{}},semantics:{schemaId:'fixture:browser-rgb',schemaVersion:'1',spaceId:'raw-decoder-rgb',unit:'native-f32-value',normalization:'none'},profileRef:'wan21-raw-f32-1x16x32',tensor:{dtype:'float32',shape:tensor.shape,axes:['N','C','T','H','W'],nativeMeaning:tensor.meaning,dataRef:'pending'},provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[traceId]},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:'fixture:browser-codec-owner',mode:'copy'},extensions:{}};
 const registry={schemas:[{schemaId:'fixture:browser-native',schemaVersion:'1',g1cMetadata:true},{schemaId:'fixture:browser-rgb',schemaVersion:'1',nativeMeanings:[tensor.meaning]}],roles:[]},outputHandle=captureNativeTensor({tensor,descriptor,store,registry});
 const persistenceCodecSource=await verifyAdoptedWktensorSource(new Uint8Array(await readFile(new URL('../../'+ADOPTED_WKTENSOR_DEPLOYMENT_PATH,import.meta.url))));
 const previous={write:globalThis.__rectWritePackageFile,read:globalThis.__rectReadPackageFile};
 globalThis.__rectWritePackageFile=async(_case,path,data)=>storage.set(path,data);globalThis.__rectReadPackageFile=async(_case,path)=>storage.get(path)??null;
 try{
  const payloadSha256=await sha256Bytes(new Uint8Array(tensor.data.buffer)),result=await browserEntry.saveReadOutput({q:{outputHandle,output:{tensor},outputBinding:{sha256:payloadSha256},validationReceipt:{scope:'synthetic-browser-persistence-only',newModelInference:false},target:{requestId:'fixture:browser-codec'},ensureCurrent:async()=>{},onProgress:()=>{}},context:{store,registry,traceId,priorInputEvidence:{scope:'synthetic-browser-persistence-only'}},caseName:'codec-adoption',plan:{managerSource:{commit:null,scope:'fixture'},persistenceCodecSource}});
  const manifest=JSON.parse(Buffer.from(storage.get('manifest.json'),'base64').toString('utf8'));
  assert.deepEqual(manifest.artifacts[0].codec.sourceRef,ADOPTED_WKTENSOR_SOURCE);assert.deepEqual(result.readback.codecSource,ADOPTED_WKTENSOR_SOURCE);assert.equal(result.readback.status,'complete');assert.equal(result.payloadSha256,payloadSha256);assert.deepEqual(result.persistenceCodecSource,persistenceCodecSource);
 }finally{globalThis.__rectWritePackageFile=previous.write;globalThis.__rectReadPackageFile=previous.read;store.clear();}
});

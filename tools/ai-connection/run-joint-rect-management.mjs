/** One current managed Rect trace, using the existing owner mean arithmetic and
 * mandatory real-decode runner. No model acquisition, export or encode path. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRectCandidate,runRectManagement} from './rect-management-runner.mjs';
import {runNormRequiredRect,collectRectManagementSourceReceipts,verifyRectManagementCommit} from './run-norm-required-rect.mjs';
import {assertRectCurrentInputLink} from './norm-required-rect-browser.mjs';
import {createAdoptedWktensorCodec} from '../../docs/shared/ai-connection/codecs/wktensor.mjs';
import {canonicalBytes,sha256Bytes,canonicalize} from '../../docs/shared/ai-connection/canonical.mjs';
import {readArtifactPackage} from '../../docs/shared/ai-connection/package.mjs';

const fail=(code,message)=>Object.assign(Error(message),{code});
const dataBytes=t=>new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength);
const same=(a,b)=>canonicalize(a)===canonicalize(b);
const MEAN_STAGES=[['raw-mean','received-raw-mean','raw-posterior-mean'],['normalized-mean','owner-normalized-mean','wan21-normalized-posterior-mean:v1'],['restored-mean','owner-restored-mean','raw-posterior-mean']];

/** Aggregate existing native-adapter receipts; this performs no numeric check. */
export function isJointRectDecodePublished({decode,currentInputLink,scenario}={}){
 if(decode?.status!=='PASS'||decode.modelInference!==true||decode.scenario!==scenario||!Array.isArray(decode.cases))return false;
 const published=c=>c.status==='published'&&c.outputBinding?.inputMeanSha256===currentInputLink.inputPayloadSha256&&c.publishReceipt?.status==='complete';
 if(scenario==='decode')return decode.cases.length===1&&published(decode.cases[0]);
 const cancelled=decode.cases[0],proof=cancelled?.cancellation;
 return scenario==='cancel-recover'&&decode.cases.length===2&&cancelled.cancelled===true&&proof?.stopConfirmed===true&&proof.originalTerminal===true&&proof.resourceReleased===true&&proof.reusable===true&&published(decode.cases[1]);
}

/** Reread all three actual E4 packages, including native and provenance bytes.
 * A historical exact351 restored file alone cannot satisfy this boundary. */
export async function readCurrentRectInputLink({meanDirectory,managerCommit,jointTraceId}={}){
 const resultBytes=new Uint8Array(await readFile(join(meanDirectory,'result.json'))),mean=JSON.parse(new TextDecoder().decode(resultBytes));
 if(mean.trace?.jointTraceId!==jointTraceId||mean.trace.manager?.baseCommit!==managerCommit||mean.freshVaeEncode!==false||mean.freshVaeDecode!==false||mean.transform?.calls!==2||mean.transform.normalized.referenceEqual!==true||mean.transform.restored.referenceEqual!==true||mean.transform.comparison.passed!==true||mean.transform.comparison.gate!==2e-6||!mean.resources.kernelDisposed||mean.resources.storeEntries!==0||mean.resources.cacheRetainedBytes!==0||!mean.queue.invocations.every(x=>x.originalTerminal&&x.resourceReleased&&x.reusable))throw fail('RECT_CURRENT_INPUT_LINK_MISMATCH','Current managed mean route, owner checks and release must have completed');
 const codec=createAdoptedWktensorCodec(),registry={schemas:[{schemaId:'works:p2:g1c-metadata',schemaVersion:'1',g1cMetadata:true},...['raw-posterior-mean','wan21-normalized-posterior-mean:v1'].map(meaning=>({schemaId:`works:p2:${meaning}`,schemaVersion:'1',nativeMeanings:[meaning]}))],roles:['tensor-transform','latent-decoding'],codecs:[{codecId:codec.codecId,codecVersion:codec.codecVersion,sourceRef:codec.sourceRef,decode:codec.decode}]};
 const stages=[];let restored;
 for(const [directory,stage,meaning] of MEAN_STAGES){
  const readback=await readArtifactPackage({read:async path=>{try{return new Uint8Array(await readFile(join(meanDirectory,directory,path)));}catch(e){if(e.code==='ENOENT')return null;throw e;}}},registry);
  if(readback.status!=='complete'||readback.artifacts.length!==1)throw fail('RECT_CURRENT_INPUT_LINK_MISMATCH','All current mean packages must be complete');
  const native=readback.artifacts[0].restoredNative,trace=JSON.parse(new TextDecoder().decode(readback.assets.get('trace.json'))),summary=mean.packages.find(x=>x.stage===stage);
  const nativeFileSha256=await sha256Bytes(readback.assets.get('native.wktensor')),payloadSha256=await sha256Bytes(dataBytes(native));
  if(native.meaning!==meaning||trace.records?.[0]?.traceId!==jointTraceId||trace.records[0].data.jointTraceId!==jointTraceId||trace.records[0].data.manager.baseCommit!==managerCommit||!summary||summary.nativeFileSha256!==nativeFileSha256||summary.payloadSha256!==payloadSha256||!same(summary.packageReceipt,readback.receipt))throw fail('RECT_CURRENT_INPUT_LINK_MISMATCH','Current package trace and readback must match the completed mean transaction');
  stages.push({stage,status:readback.status,jointTraceId,meaning:native.meaning,normalization:native.normalization??null,modelSha256:native.modelSha256,shape:native.shape,context:native.context??null,payloadSha256,nativeFileSha256,packageReceipt:readback.receipt,codecSource:codec.sourceRef});
  if(stage==='owner-restored-mean')restored=native;
 }
 const link={schemaVersion:'works-rect-current-input-link/0.1-draft.1',jointTraceId,managerCommit,meanResultSha256:await sha256Bytes(resultBytes),profileId:'wan21-raw-f32-1x16x32',modelSha256:restored.modelSha256,context:restored.context??null,inputPayloadSha256:await sha256Bytes(dataBytes(restored)),restoredFileSha256:stages[2].nativeFileSha256,rawInputIdentity:mean.trace.inputIdentity,sourcePins:mean.pins,sourceReceipts:mean.sourceReceipts,managementSource:mean.trace.manager,meanQueueReceipt:mean.queue,meanPrepareDecisions:mean.trace.meanPrepareDecisions,operations:mean.trace.operations,stages};
 await assertRectCurrentInputLink({link,tensor:restored,managerCommit,jointTraceId});return link;
}

export async function runJointRectManagement({diffusionRoot,nativeRoot,bundleRoot,referencePath,out,managerCommit,resourceState,scenario='decode'}={}){
 if(!['decode','cancel-recover'].includes(scenario))throw fail('UNKNOWN_SCENARIO','Select decode or cancel-recover');
 if(!out||!/^[a-f0-9]{40}$/.test(managerCommit??''))throw fail('MANAGER_TARGET_REQUIRED','A fresh --out and full --manager-commit are required');
 const candidate=await loadRectCandidate({diffusionRoot,vaeRoot:nativeRoot}),sourceCheckpoint=await verifyRectManagementCommit({managerCommit,sourceReceipts:await collectRectManagementSourceReceipts()});
 await mkdir(out);const jointTraceId=`works:p2:joint:${crypto.randomUUID()}`,meanDirectory=join(out,'mean');
 const mean=await runRectManagement({candidate,outputDirectory:meanDirectory,managerCommit,privateBundleRoot:bundleRoot,jointTraceId,managerSourceProof:sourceCheckpoint});
 const currentInputLink=await readCurrentRectInputLink({meanDirectory,managerCommit,jointTraceId});
 const decode=await runNormRequiredRect({nativeRoot,bundleRoot,inputPath:join(meanDirectory,'restored-mean/native.wktensor'),referencePath,out:join(out,'decode'),managerCommit,resourceState,scenario,jointTraceId,currentInputLink,requireFixedManagementSource:true});
 const accepted=sourceCheckpoint.allMatched&&mean.trace.manager.commit===managerCommit&&decode.managementSource.commit===managerCommit&&isJointRectDecodePublished({decode,currentInputLink,scenario});
 const result={schemaVersion:'works-joint-rect-management-run/0.1-draft.1',jointTraceId,scenario,sourceCheckpoint,status:accepted?'PASS':decode.status==='FAIL'?'FAIL':'BLOCKED',currentInputLink,mean,decode,nativeCalls:decode.nativeCalls,browserLaunched:decode.browserLaunched,actualNumericalAccepted:accepted,numericalState:accepted?'PASS':'NOT_VERIFIED',freshVaeEncode:false,freshVaeDecode:accepted,generationReady:false,snapshotPublished:false,meanNormScope:'Existing evaluateEdge checks static input contracts before each owner call; numeric acceptance remains NOT_VERIFIED/BLOCKED during bounded diagnostic prepare; full phased mean-adapter redesign is outside this composition',historicalReceivedRGBScope:'mean/received-rgb is historical received output; only decode case RGB is a current NN result'};
 await writeFile(join(out,'result.json'),new Uint8Array([...canonicalBytes(result),10]),{flag:'wx'});return result;
}

const HELP='Usage: node tools/ai-connection/run-joint-rect-management.mjs --diffusion-root <fixed5f-source> --native-root <fixed855-source> --bundle-root <existing3assets> --reference <existing-png-roundtrip.f32> --out <fresh-directory> --manager-commit <fullSHA> [--resource-state <explicitJSON-file>] [--scenario decode|cancel-recover]\nReuses the fixed existing raw encode mean; runs owner normalize/save/read/restore/save/read and the mandatory native decode route. No model download, export or encode.';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(args.includes('--help'))console.log(HELP);else{
  const allowed=new Set(['diffusion-root','native-root','bundle-root','reference','out','manager-commit','resource-state','scenario']),q={};for(let i=0;i<args.length;i+=2){const key=args[i]?.slice(2);if(!args[i]?.startsWith('--')||!allowed.has(key)||!args[i+1]||args[i+1].startsWith('--'))throw fail('INVALID_ARGUMENT',`Unknown or incomplete argument: ${args[i]}`);q[key]=args[i+1];}
  for(const key of ['diffusion-root','native-root','bundle-root','reference','out','manager-commit'])if(!q[key])throw fail('MISSING_ARGUMENT',`Missing --${key}`);
  const resourceState=q['resource-state']?JSON.parse(await readFile(q['resource-state'],'utf8')):undefined,result=await runJointRectManagement({diffusionRoot:q['diffusion-root'],nativeRoot:q['native-root'],bundleRoot:q['bundle-root'],referencePath:q.reference,out:q.out,managerCommit:q['manager-commit'],resourceState,scenario:q.scenario});
  console.log(JSON.stringify({status:result.status,jointTraceId:result.jointTraceId,nativeCalls:result.nativeCalls,actualNumericalAccepted:result.actualNumericalAccepted,missingAssets:result.decode.missingAssets??[],out:q.out},null,2));if(result.status==='FAIL')process.exitCode=1;
 }}catch(error){console.error(JSON.stringify({code:error.code??null,message:String(error.message??error)}));process.exitCode=1;}
}

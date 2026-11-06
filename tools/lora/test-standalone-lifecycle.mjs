import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {createLoraStandalone} from '../../docs/shared/inference/lora/standalone-sdk.mjs';
import {STANDALONE_CONTRACT_VERSION} from '../../docs/shared/inference/lora/standalone-registry.mjs';
import {createStandaloneReferenceHost} from './standalone-host.mjs';
import {createLifecycleObserver,observeLifecycleTransaction,matchLifecycleToFullRun} from './standalone-lifecycle.mjs';

test('ordinary empty restore transaction emits a complete empty stream receipt without an oracle',async()=>{
 const registry={contractVersion:STANDALONE_CONTRACT_VERSION,modelHash:'a'.repeat(64),registryVersion:'fixture',mappingVersion:'fixture',side:'HIGH',loaderPolicyId:'comfy-lora-b5a4321-linear-diff-v1',targets:[{key:'layer.weight',weightId:'layer.weight',fullShape:[2,2],dtype:'F32',layout:'row-major',parameterRole:'weight',logicalBinding:{kind:'logical-weight',name:'layer.weight'}}]};
 const baseProvider={describe:()=>({modelHash:registry.modelHash,side:'HIGH',immutable:true}),readBlock:async(id,offset,count)=>new Float32Array(count)};
 const kernel={info:{wasmSha256:'b'.repeat(64)},decode(){throw Error('Unexpected arithmetic');},product(){throw Error('Unexpected arithmetic');},apply(){throw Error('Unexpected arithmetic');}};
 const sdk=createLoraStandalone({registry,baseProvider,kernel}),observer=createLifecycleObserver(),host=createStandaloneReferenceHost({registry,baseProvider,onBlock:observer.onBlock});
 try{const record=await observeLifecycleTransaction({id:'empty',sdk,host,observer,kernel,execute:()=>sdk.restoreBase({target:host}),referenceCaseId:'HIGH-base-restore'});
  assert.equal(record.receipt.validationMode,'normal');assert.equal(record.receipt.validation.numericalComparison,false);assert.equal(record.normalOutput.elements,0);assert.equal(record.normalOutput.targets,0);assert.equal(record.normalOutput.binary32OutputSHA256,createHash('sha256').digest('hex'));assert.equal(record.consumerEpochAfter,record.consumerEpochBefore+1);assert.equal(record.independentReferenceMatch,'PENDING');
 }finally{await host.dispose();await sdk.dispose();}
});

test('lifecycle matching refuses incomplete independent evidence before any hash reuse',()=>{
 assert.throws(()=>matchLifecycleToFullRun({status:'CONTROL_PASS_REFERENCE_PENDING',sides:[]},{status:'INCOMPLETE',coverage:'FULL',sides:[]}),/independent.*PASS/i);
 assert.throws(()=>matchLifecycleToFullRun({status:'CONTROL_PASS_REFERENCE_PENDING',sides:[{side:'HIGH'}]},{status:'PASS',coverage:'PARTIAL',sides:[]}),/FULL|pilot/i);
 assert.throws(()=>matchLifecycleToFullRun({status:'CONTROL_PASS_REFERENCE_PENDING',sides:[{side:'HIGH'}]},{status:'PASS',coverage:'FULL',pilot:false,sides:[]}),/side|cleanup/i);
});

function matchingMetadata(){
 const pending='CONTROL_PASS_REFERENCE_PENDING',policy='comfy-lora-b5a4321-linear-diff-v1',registry='9'.repeat(64),kernel='8'.repeat(64),base={meaning:'independent-dyadic-f32-base-v1',formula:'F32((originalFullElementCoordinate % 17 - 8) / 128)',trainingBaseIdentityClaim:false};
 const sources=[{pairId:'light',side:'HIGH',bytes:1244141856,sourceSha256:'1'.repeat(64),headerSha256:'2'.repeat(64)},{pairId:'detail',side:'HIGH',bytes:613516752,sourceSha256:'3'.repeat(64),headerSha256:'4'.repeat(64)}];
 const selections={both:[{pairId:'light',strength:1},{pairId:'detail',strength:1}],light:[{pairId:'light',strength:1}],detail:[{pairId:'detail',strength:1}],base:[]};
 const output=type=>({coverage:'FULL',targets:type==='detail'?400:1052,observedTargets:type==='detail'?400:1052,elements:type==='detail'?14050918400:14286919744,expectedElements:type==='detail'?14050918400:14286919744,blocks:17,binary32OutputSHA256:{both:'a',light:'b',detail:'c',base:'d'}[type].repeat(64),targetSetSha256:'5'.repeat(64),traversalSha256:'6'.repeat(64)});
 const oracleCases=Object.entries({both:'both-plus',light:'light-1',detail:'detail-1',base:'base-restore'}).map(([type,suffix])=>{const o=output(type);return {id:'HIGH-'+suffix,passed:true,coverage:'FULL',failedElements:0,incompleteTargets:0,completeTargets:o.targets,expectedTargets:o.targets,comparedElements:o.elements,expectedElements:o.elements,blocks:o.blocks,actualSha256:o.binary32OutputSHA256,targetSetSha256:o.targetSetSha256,traversalSha256:o.traversalSha256,sources:selections[type].map(s=>({sourceId:s.pairId+'-HIGH',strength:s.strength}))};});
 const actions=[['initial-both','both-plus','both'],['remove-detail','light-1','light'],['reapply-light','light-1','light'],['reinstate-detail','both-plus','both'],['remove-light','detail-1','detail'],['restore-base','base-restore','base']].map(([suffix,reference,type],index)=>{
  const referenceOutput=output(type),normalOutput=type==='base'?{...referenceOutput,targets:0,observedTargets:0,elements:0,expectedElements:0,blocks:0,binary32OutputSHA256:createHash('sha256').digest('hex')}:referenceOutput;
  return {id:'HIGH-'+suffix,referenceCaseId:'HIGH-'+reference,selections:selections[type],canonicalOrder:selections[type].map(s=>s.pairId),sources:selections[type].map(s=>{const source=sources.find(a=>a.pairId===s.pairId);return {sourceId:s.pairId+'@HIGH',bytes:source.bytes,sourceSha256:source.sourceSha256};}),loaderPolicyId:policy,kernelSha256:kernel,registryHash:registry,consumerEpochBefore:index,consumerEpochAfter:index+1,localRevisionBefore:index,localRevisionAfter:index+1,receipt:{state:'CONSUMER_APPLIED',validationMode:'normal',coverage:'FULL',registryHash:registry,consumerEpoch:index+1,localRevision:index+1,validation:{checkedElements:normalOutput.elements,blockCount:normalOutput.blocks}},normalOutput,referenceOutput};
 });
 const removedCase={passed:true,failedElements:0,incompleteTargets:0,completeTargets:652,expectedTargets:652,expectedElements:236001344,comparedElements:236001344};
 const side={side:'HIGH',status:pending,coverage:'FULL',cleanup:{passed:true},loaderPolicyId:policy,kernelSha256:kernel,registryHash:registry,syntheticBase:base,sources,actions,cancellation:{passed:true,recovered:true,observed:{blocks:1,coverage:'PARTIAL'},consumerEpochBefore:1,consumerEpochAfter:1,activePackageHashBefore:'7'.repeat(64),activePackageHashAfter:'7'.repeat(64),terminalSDKStats:{busy:false,recoveryRequired:false}},creatorRelease:{passed:true},removedLightTargets:{passed:true,targetCount:652,elements:236001344,oracle:{passed:true,terminal:true,cases:[removedCase]}}};
 const fullSide={side:'HIGH',status:'PASS',coverage:'FULL',pilot:false,cleanup:{passed:true},syntheticBase:base,kernel:{wasmSha256:kernel},registrations:sources.map(s=>({...s,phase:'saved-cohort-capture'})),oracle:{passed:true,terminal:true,coverage:'FULL',loaderPolicyId:policy,sources:sources.map(s=>({id:s.pairId+'-HIGH',side:'HIGH',bytes:s.bytes,sourceSha256Claim:s.sourceSha256,headerSha256:s.headerSha256})),cases:oracleCases},cases:oracleCases.filter(c=>!c.id.endsWith('base-restore')).map(c=>({id:c.id,selections:c.sources.map(s=>({pairId:s.sourceId.split('-')[0],strength:s.strength})),receipt:{registryHash:registry}})),baseRestore:{receipt:{registryHash:registry}}};
 return {lifecycle:{status:pending,sides:[side]},full:{status:'PASS',coverage:'FULL',pilot:false,sides:[fullSide]}};
}

test('postprocessing matches all six full-domain actions by actual source, coordinates, and every F32 byte',()=>{
 const {lifecycle,full}=matchingMetadata(),matched=matchLifecycleToFullRun(lifecycle,full);assert.equal(matched.status,'PASS');assert.equal(matched.independentReferenceMatch,'MATCHED');assert.equal(matched.sides[0].actions.length,6);assert.equal(lifecycle.status,'CONTROL_PASS_REFERENCE_PENDING');
});

test('postprocessing rejects arithmetic, source, traversal, strength, domain, and cancellation mismatches',()=>{
 const corruptions=[
  [({full})=>{full.sides[0].kernel.wasmSha256='0'.repeat(64);},/Kernel/],
  [({lifecycle})=>{lifecycle.sides[0].sources[0].sourceSha256='0'.repeat(64);},/source/i],
  [({full})=>{full.sides[0].oracle.cases[0].traversalSha256='0'.repeat(64);},/traversal/],
  [({full})=>{full.sides[0].oracle.cases[1].sources[0].strength=0;},/strengths/],
  [({lifecycle})=>{lifecycle.sides[0].actions[1].referenceOutput.elements--;},/domain|count/],
  [({lifecycle})=>{lifecycle.sides[0].actions[1].referenceOutput.binary32OutputSHA256='0'.repeat(64);},/F32/],
  [({lifecycle})=>{lifecycle.sides[0].cancellation.consumerEpochAfter++;},/cancellation/],
  [({lifecycle})=>{lifecycle.sides[0].removedLightTargets.oracle.cases[0].incompleteTargets=1;},/Removed/],
 ];for(const [corrupt,message]of corruptions){const fixture=matchingMetadata();corrupt(fixture);assert.throws(()=>matchLifecycleToFullRun(fixture.lifecycle,fixture.full),message);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotNativeLoraOwner} from '../../docs/shared/ai-connection/adapters/snapshot-native-lora.mjs';
import {createInvocationQueue} from '../../docs/shared/ai-connection/queue.mjs';
import {CANDIDATE_ADOPTED_LORA_VERSION,CANDIDATE_ADOPTED_LORA_SOURCE as pins} from '../../docs/shared/ai-connection/adapters/adopted-lora.mjs';
async function fixture({finalizeError=false,rollbackResult={restored:false,scope:'PARTIAL'}}={}){
 const resource={ownerId:'owner',bindingId:'binding',resourceGeneration:'generation'},revisions={sdkInstanceId:'sdk',localInputRevision:1,localApplicationRevision:1};
 const plan={contractVersion:'lora-connection/2.0-draft.1',coverage:'PARTIAL',scope:'diagnostic-projection',buildId:pins.kernel.sha256,...revisions,planId:'plan',registryHash:'connection',sourceSha256:'source'};
 const planTarget={managerSessionId:'manager',managerRevision:1,requestId:'plan',resourceBinding:resource};let owner,committed=false,rollbackCalls=0;
 const binding={management:{resourceBinding:resource,sdkInstanceId:'sdk',sourcePins:pins},owner:{connectionRegistryHash:'connection',nativeRegistryHash:'native',nativeRegistry:{modelHash:'model',graphHash:'graph'}}};
 const validation={valid:true,planId:'plan',registryHash:'connection',sourceSha256:'source',coverage:'PARTIAL',scope:'diagnostic-projection',evidence:{nativeRegistryHash:'native',nativeReceipt:{candidateId:'candidate',registryHash:'native',modelHash:'model',graphHash:'graph'}}};
 const adapter={contractVersion:CANDIDATE_ADOPTED_LORA_VERSION,prepare:async()=>({}),describeBinding:async()=>binding,recover:async()=>{},release:async()=>{},finalize:async()=>{if(finalizeError)throw Error('publication cleanup retained');},cancelCurrent:async()=>{},openStage(prepared,ref,options){
  let resolve,reject;const management={localRevisionBindings:revisions,target:options.target,sourcePins:pins},envelope={receipt:{state:'CONSUMER_APPLIED',ownership:{kind:'independent-copy',ownerId:'native-copy'},validation},management},completion=new Promise((a,b)=>{resolve=a;reject=b;});
  return {checkpoint:Promise.resolve({validation,management}),completion,commit(){committed=true;resolve(envelope);return completion;},abort(){if(!committed)reject(Error('fixture aborted'));},rollback:async()=>{rollbackCalls++;return {completed:true,native:rollbackResult};}};
 }};
 const queue=createInvocationQueue({resourceBindings:[{...resource,cancel:t=>owner.cancelInvocation(t),afterTerminal:(t,o)=>owner.afterInvocation(t,o),release:(t,o)=>owner.releaseInvocation(t,o)}]});
 owner=createSnapshotNativeLoraOwner({adapter,plan,planTarget,validation:{},resourceBinding:resource,queue,requestPrefix:'review'});
 const context={target:{snapshotId:'snapshot',managerSessionId:'manager',managerRevision:1,resourceBinding:resource,localRevisionBindings:revisions},snapshotId:'snapshot',stepId:'HIGH',operationId:'diagnose',managerSessionId:'manager',managerRevision:1,resourceBinding:resource,localRevisionBindings:revisions,scopeId:'diagnostic-projection',nativeBuild:plan.buildId,sourceRef:{commit:pins.sdk.commit,path:pins.sdk.path},isCurrent:()=>true};
 const {candidate}=await owner.prepare(context);await owner.validate(candidate,context);return {owner,queue,candidate,context,get rollbackCalls(){return rollbackCalls;}};
}
test('a committed native rollback false cannot attest restored snapshot state',async()=>{
 const f=await fixture();try{await f.owner.commit(f.candidate,f.context);await assert.rejects(f.owner.rollback(f.candidate,f.context),{code:'ROLLBACK_UNCONFIRMED'});assert.equal(f.owner.inspect(f.candidate).rolledBack,false);assert.equal(f.owner.inspect(f.candidate).preparedReleased,false);}finally{await f.queue.dispose();}
});
test('one selected plan cannot queue a second snapshot candidate behind its own gated transaction',async()=>{
 const f=await fixture();try{await assert.rejects(f.owner.prepare(f.context),{code:'OWNER_ALREADY_PREPARED'});}finally{await f.owner.rollback(f.candidate,f.context);await f.owner.release(f.candidate,f.context);await f.queue.dispose();}
});

test('a published snapshot keeps rollback disabled while publication cleanup is retained',async()=>{
 const f=await fixture({finalizeError:true,rollbackResult:{restored:true,scope:'PARTIAL'}});try{
  await f.owner.commit(f.candidate,f.context);await assert.rejects(f.owner.published(f.candidate,f.context),/publication cleanup retained/);
  await f.owner.rollback(f.candidate,f.context);assert.equal(f.rollbackCalls,0);assert.equal(f.owner.inspect(f.candidate).rolledBack,false);assert.equal(f.owner.inspect(f.candidate).preparedReleased,false);
 }finally{await f.queue.dispose();}
});

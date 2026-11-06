import {createNormExecution} from '../norm-execution.mjs';
import {createInvocationQueue} from '../queue.mjs';
import {canonicalize,hashCanonical,sha256Bytes} from '../canonical.mjs';
import {captureNativeTensor,releaseArtifactHandle} from './artifacts.mjs';
import {isVerifiedN2TailSource} from './n2-tail/source.mjs';
import {N2_TAIL_PROFILE_ID,N2_TAIL_POLICY_ID,N2_TAIL_GATES,N2_TAIL_OUTPUTS} from './n2-tail/declarations.mjs';

const clone=structuredClone,text=v=>typeof v==='string'&&v.length>0,hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const same=(a,b)=>{try{return canonicalize(a)===canonicalize(b);}catch{return false;}};
const fail=(code,message)=>Object.assign(Error(message),{code});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const MEANING=N2_TAIL_OUTPUTS.residual.nativeMeaning;
const OUTPUTS=Object.fromEntries(Object.entries(N2_TAIL_OUTPUTS).map(([name,d])=>[name,{shape:d.shape,layout:d.axes.join(''),meaning:d.nativeMeaning}]));
const FALSE_FLAGS=['productionHiddenVerified','originalWorkflowInputsVerified','originalProductionPrecisionVerified','fullBlockVerified','modelInference','lowIsHighHandoff'];
const notReady={generationReady:false,modelInference:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};
const typedPrototype=Object.getPrototypeOf(Float32Array.prototype),slots=Object.fromEntries(['buffer','byteOffset','byteLength','length'].map(k=>[k,Object.getOwnPropertyDescriptor(typedPrototype,k).get])),tag=Object.getOwnPropertyDescriptor(typedPrototype,Symbol.toStringTag).get,bufferBytes=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
function ownedF32(value,length,admittedInput=true){
 let valid=false;
 try{const buffer=slots.buffer.call(value);valid=ArrayBuffer.isView(value)&&tag.call(value)==='Float32Array'&&buffer instanceof ArrayBuffer&&buffer.resizable!==true&&slots.length.call(value)===length&&slots.byteOffset.call(value)===0&&slots.byteLength.call(value)===bufferBytes.call(buffer);if(valid)new Uint8Array(buffer,0,0);}catch{}
 if(!valid)throw fail('N2_TAIL_INPUT_MISMATCH','Exact compact ordinary F32 input/output required');
 const owned=new Float32Array(value);if(!owned.every(Number.isFinite)||admittedInput&&!owned.every(x=>Math.abs(x)<=1e16))throw fail('N2_TAIL_INPUT_MISMATCH','Finite admitted F32 input/output required');return owned;
}
const bytes=value=>new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
const only=(v,keys,code)=>{if(!v||typeof v!=='object'||Object.keys(v).some(k=>!keys.includes(k)))throw fail(code,'Only explicit public native fields are supported');};
function snapshotNative(native){
 only(native,['file','side','trustedInputs','bridgeBytes','mathBytes'],'N2_TAIL_NATIVE_FIELDS');
 const out={file:native.file,side:native.side,trustedInputs:clone(native.trustedInputs)};
 if(!(out.file instanceof Blob)||!['HIGH','LOW'].includes(out.side))throw fail('N2_TAIL_INPUT_MISMATCH','Explicit original immutable Blob and fixed side required');
 for(const k of ['bridgeBytes','mathBytes'])if(native[k]!==undefined){const v=native[k];if(v instanceof ArrayBuffer)out[k]=new Uint8Array(v).slice();else if(v instanceof Uint8Array&&v.buffer instanceof ArrayBuffer)out[k]=new Uint8Array(v);else throw fail('N2_TAIL_INPUT_MISMATCH','Owned nonshared native operator bytes required');}
 return out;
}
function exactDescriptor(value,declared,native){
 if(value?.schemaVersion!=='bernini-self-attention-tail/0.1'||value.executionProfileId!==N2_TAIL_PROFILE_ID)throw fail('N2_TAIL_NATIVE_MISMATCH','Actual native descriptor must identify the fixed ES tail owner');
 for(const [field,expected] of Object.entries({side:native.side,blockIndex:0,scheduleIndex:native.side==='HIGH'?1:3,tokens:2,originalCoreShape:[1,2,5120],operatorShape:[2,5120],layout:'LC',timeProjectionChunks:[2],residualBasis:'original-fullprefix-arrays.patchHidden',trustedInputs:native.trustedInputs,...Object.fromEntries(FALSE_FLAGS.map(k=>[k,false])),load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'}))if(!same(value[field],expected))throw fail('N2_TAIL_NATIVE_MISMATCH',`Actual native descriptor differs at ${field}`);
 if(declared?.nativeProfileId!==N2_TAIL_PROFILE_ID||!same(declared.trustedInputs,native.trustedInputs)||declared.side!==native.side||value.operatorSources?.mathWasmSHA256!==declared.kernelDigest||value.operatorSources?.bridgeWasmSHA256!==declared.bridgeWasmSHA256)throw fail('N2_TAIL_NATIVE_MISMATCH','Actual native source/kernel/trusted bindings differ from declarations');
}
function validateSpec(spec,numeric,evidenceTarget){
 if(!spec||!['coverage','scope','baseKind','referenceId','referenceSha256'].every(k=>text(spec[k]))||!hash(spec.referenceSha256)||spec.count!==71680||spec.comparisonCount!==8||spec.strictParameterChecks!==7||!same(spec.gate,N2_TAIL_GATES)||numeric?.length!==1||numeric[0].referenceRef?.sha256!==spec.referenceSha256||numeric[0].referenceRef?.referenceId!==spec.referenceId||!same(numeric[0].gateRef?.gates,spec.gate)||['coverage','scope','baseKind','referenceId'].some(k=>!same(spec[k],evidenceTarget?.[k])))throw fail('N2_TAIL_VALIDATION_SPEC_REQUIRED','Fix all eight comparisons, seven parameter checks, source reference and original gates before dispatch');
}
function budget(value,scope){
 if(value?.scope!=='n2-tail-diagnostic-only'||value.tailHikeCapacityBytes!==2883584||value.ortSharedMemoryCapacityBytes!==16777216||value.maxReturnedOutputBytes!==163840||!Number.isFinite(value.maxElapsedMs)||value.maxElapsedMs<=0||value.maxElapsedMs>2147483647)throw fail('N2_TAIL_BUDGET_REQUIRED','Explicit fixed tail-only Hike/ORT diagnostic capacity limits required');return clone(value);
}

/** Direct same-realm ES owner orchestration. The owner retains all numerical
 * operators and reference comparison remains an explicitly supplied owner
 * callback. The existing queue owns cancellation/terminal/release barriers. */
export function createNormRequiredN2TailAdapter({nativeFactory,verifiedSource,binding,artifactStore,readCurrent,validateOutput,publishOutput,executionScope}={}){
 if(!isVerifiedN2TailSource(verifiedSource))throw fail('N2_TAIL_SOURCE_UNVERIFIED','Actual fixed source-byte verification is required');
 if(typeof nativeFactory!=='function'||!['ownerId','sessionId','bindingId','resourceGeneration'].every(k=>text(binding?.[k]))||!artifactStore?.put||!artifactStore?.get||!artifactStore?.release||typeof readCurrent!=='function'||typeof validateOutput!=='function'||publishOutput!==undefined&&typeof publishOutput!=='function'||!['controlled-native-boundary-fixture','actual-fixed-n2-tail'].includes(executionScope))throw fail('N2_TAIL_OWNER_REQUIRED','Explicit owner factory, binding, store, current-state reader, validation callback and execution scope required');
 const identity=clone(binding),runs=new Map(),nativeOwners=new WeakSet();let closed=false,recoveryEnded=false,recoveryReceipt=null,recovering=false;
 const resource=()=>({bindingId:identity.bindingId,ownerId:identity.ownerId,resourceGeneration:identity.resourceGeneration});
 const exactRun=t=>{const r=runs.get(t?.requestId);if(!r||!same(r.managerTarget,t))throw fail('TARGET_MISMATCH','Target must identify the exact managed owner/request/revision/generation');return r;};
 const ownedQueueTarget=(r,target)=>{if(!same(r.queueTarget,target))throw fail('TARGET_MISMATCH','Queue callback target differs from retained operation');};
 const config=()=>({...resource(),
  async cancel(target){
   const r=runs.get(target.requestId);if(!r)throw fail('TARGET_MISMATCH','Unknown original native operation');ownedQueueTarget(r,target);r.cancelRequested=true;
   // queue.signal is already aborted. Original construction/run, not the
   // queue public completion, is the only terminal barrier awaited here.
   await r.nativeSettled.promise;r.stopProof={target:clone(target),stopped:true,originalFactoryTerminal:r.factoryTerminal,originalRunTerminal:r.runTerminal};return clone(r.stopProof);
  },
  async afterTerminal(target,outcome){
   const r=runs.get(target.requestId);if(!r)throw fail('TARGET_MISMATCH','Unknown original terminal');ownedQueueTarget(r,target);await r.nativeSettled.promise;
   r.terminalProof={target:clone(target),originalTerminal:true,originalFactoryTerminal:r.factoryTerminal,originalRunTerminal:r.runTerminal,nativeOutcome:r.originalOutcome??'not-dispatched'};
   if(r.constructorRecovery||r.native?.stats().cleanupPending){r.cleanupFailed=true;return {reusable:false};}return {reusable:true};
  },
  async release(target){
   const r=runs.get(target.requestId);if(!r)throw fail('TARGET_MISMATCH','Unknown native release');ownedQueueTarget(r,target);
   if(r.constructorRecovery){r.cleanupFailed=true;throw fail('N2_TAIL_RECOVERY_REQUIRED','Native constructor retained failed cleanup; explicit recovery required');}
   if(r.native){try{await r.native.dispose();const stats=r.native.stats();if(stats.disposed!==true||stats.activeORTSessions!==0)throw fail('N2_TAIL_RELEASE_UNCONFIRMED','Native owner has not confirmed complete disposal');}catch(error){r.cleanupFailed=true;r.releaseError={code:error?.code??'NATIVE_RELEASE_FAILED',message:String(error?.message??error)};throw error;}}
   r.released=true;if(!r.cleanupFailed)r.native=null;
  }
 });
 const queue=createInvocationQueue({resourceBindings:[config()]});

 async function run(q={}){
  if(closed)throw fail('N2_TAIL_ADAPTER_DISPOSED','Managed tail adapter is disposed');
  if(recoveryEnded||recovering)throw fail('N2_TAIL_NEW_GENERATION_REQUIRED','Recovery ended the native owner; explicitly rebind a new generation before retry');
  if([...runs.values()].some(r=>r.cleanupFailed&&!r.recovered))throw fail('N2_TAIL_RECOVERY_REQUIRED','Retained native owner requires recovery');
  const norm=createNormExecution({policyId:N2_TAIL_POLICY_ID,referenceSet:q.referenceSet,edgeInput:q.edgeInput});
  const {referenceSet:ignored,...context}=q.edgeInput.referenceContext,edge=clone({...q.edgeInput,referenceContext:context}),referenceSet=q.referenceSet,target=clone(q.target),native=snapshotNative(q.native),spec=clone(q.validationSpec),limits=budget(q.diagnosticBudget,executionScope);
  only(q.inputs,['attention','patchHidden','timeAct1'],'N2_TAIL_NATIVE_FIELDS');
  const signal=q.signal,onProgress=q.onProgress;
  const inputs={attention:ownedF32(q.inputs.attention,10240),patchHidden:ownedF32(q.inputs.patchHidden,10240),timeAct1:ownedF32(q.inputs.timeAct1,5120)};
  if(signal!==undefined&&!(signal instanceof AbortSignal)||onProgress!==undefined&&typeof onProgress!=='function')throw fail('N2_TAIL_INPUT_MISMATCH','Explicit AbortSignal/progress callback required');
  if(!text(target?.requestId)||target.managerSessionId!==identity.sessionId||!Number.isSafeInteger(target.managerRevision)||target.managerRevision<0||!text(target.activeToken)||!target.localRevisionBindings||!same(target.resourceBinding,resource())||!same(edge.referenceContext.managerState?.target,target))throw fail('N2_TAIL_TARGET_REQUIRED','Current manager target with separate local revision bindings and resource generation required');
  if(!same(native.trustedInputs,edge.referenceContext.nativeDeclarations?.producer?.trustedInputs)||native.side!==edge.referenceContext.nativeDeclarations?.producer?.side)throw fail('N2_TAIL_INPUT_MISMATCH','Fixed trusted inputs and side must match immutable declarations');
  validateSpec(spec,edge.referenceContext.numericRequirements,edge.referenceContext.evidenceTarget);
  if(runs.has(target.requestId))throw fail('DUPLICATE_INVOCATION','Managed request IDs cannot be reused');
  const r={managerTarget:target,norm,native:null,nativeSettled:deferred(),done:deferred(),factoryTerminal:false,runTerminal:false,cancelRequested:false,cleanupFailed:false,recovered:false,released:false,finished:false,failed:false,publication:{attempted:false,status:'not-started',progress:[],receipt:null}};runs.set(target.requestId,r);
  const cancelled=()=>{if(signal?.aborted||r.cancelRequested)throw fail('INVOCATION_CANCELLED','Managed tail invocation cancelled');};
  const ensureCurrent=async stage=>{if(closed)throw fail('N2_TAIL_ADAPTER_DISPOSED','Managed tail adapter is disposed');cancelled();const value=await readCurrent();if(closed)throw fail('N2_TAIL_ADAPTER_DISPOSED','Managed tail adapter is disposed');cancelled();if(!same(value?.target,target))throw fail('N2_TAIL_STALE_INVOCATION',`Manager target changed at ${stage}`);return {activeBindings:value.activeBindings,resourceState:value.resourceState};};
  const queueTarget={...resource(),requestId:target.requestId,revision:target.managerRevision,activeToken:target.activeToken};
  const listener=()=>{r.cancelRequested=true;const current=queue.inspect().invocations.find(x=>x.requestId===target.requestId);if(current&&['queued','running','cancelling'].includes(current.state))void queue.cancelInvocation(target.requestId,queueTarget).catch(()=>{});};
  signal?.addEventListener('abort',listener,{once:true});
  const deadline=globalThis.setTimeout(()=>{r.stopReason='diagnostic-deadline';listener();},limits.maxElapsedMs);
  try{
   const output=await queue.enqueue({id:target.requestId,requestId:target.requestId,ownerId:identity.ownerId,resourceBinding:identity.bindingId,resourceGeneration:identity.resourceGeneration,revision:target.managerRevision,activeToken:target.activeToken},async c=>{
    r.queueTarget=c.target;
    try{
     cancelled();c.signal.throwIfAborted();norm.declaration(await ensureCurrent('dispatch'));
     r.inputHashes=Object.fromEntries(await Promise.all(Object.entries(inputs).map(async([k,v])=>[k+'SHA256',await sha256Bytes(bytes(v))])));cancelled();c.signal.throwIfAborted();norm.declaration(await ensureCurrent('input-hashes'));
     try{r.originalFactoryPromise=nativeFactory(native);r.native=await r.originalFactoryPromise;}catch(error){if(typeof error?.recover==='function'){r.constructorRecovery=error.recover.bind(error);r.constructorError={code:error.code??'NATIVE_CONSTRUCTOR_FAILED',message:String(error.message)};}throw error;}finally{r.factoryTerminal=true;}
     if(!r.native||!['describe','run','stats','dispose','recover'].every(k=>typeof r.native[k]==='function'))throw fail('N2_TAIL_NATIVE_UNAVAILABLE','Actual independent ES tail owner required');
     if(nativeOwners.has(r.native))throw fail('N2_TAIL_NATIVE_OWNER_REUSED','A new native owner instance is required for each invocation');nativeOwners.add(r.native);
     cancelled();c.signal.throwIfAborted();r.nativeDescriptor=clone(r.native.describe());exactDescriptor(r.nativeDescriptor,edge.referenceContext.nativeDeclarations.producer,native);norm.declaration(await ensureCurrent('factory'));
     try{r.originalRunPromise=r.native.run({attention:inputs.attention,patchHidden:inputs.patchHidden,timeAct1:inputs.timeAct1,signal:c.signal,onProgress});const value=await r.originalRunPromise;r.originalOutcome='fulfilled';cancelled();c.signal.throwIfAborted();return value;}catch(error){r.originalOutcome??='rejected';throw error;}finally{r.runTerminal=true;}
    }finally{r.originalFactoryPromise=null;r.originalRunPromise=null;r.nativeSettled.resolve();}
   });
   await ensureCurrent('native-terminal');
   const evidence=clone(output?.evidence),arrays={};
   if(evidence?.schemaVersion!=='bernini-self-attention-tail-evidence/0.1'||evidence.executionProfileId!==N2_TAIL_PROFILE_ID||evidence.side!==native.side||evidence.blockIndex!==0||evidence.scheduleIndex!==(native.side==='HIGH'?1:3)||evidence.tokens!==2||evidence.layout!=='LC'||!same(evidence.operatorShape,[2,5120])||evidence.residualBasis!=='original-fullprefix-arrays.patchHidden'||!same(evidence.trustedInputs,native.trustedInputs)||!same(evidence.inputHashes,r.inputHashes)||FALSE_FLAGS.some(k=>evidence[k]!==false)||['load','predict','sample'].some(k=>evidence[k]!=='NOT_READY'))throw fail('N2_TAIL_OUTPUT_MISMATCH','Actual tail evidence differs from fixed side/trusted inputs or promotes readiness');
   for(const field of ['mathWasmSHA256','bridgeWasmSHA256'])if(evidence.operatorSources?.[field]!==r.nativeDescriptor.operatorSources[field])throw fail('N2_TAIL_OUTPUT_MISMATCH','Native execution evidence differs from the source-pinned operator descriptor');
   const arraysBinding={};
   for(const [name,desc] of Object.entries(OUTPUTS)){const data=ownedF32(output[name],desc.shape.reduce((a,b)=>a*b,1),false);arrays[name]=data;const sha256=await sha256Bytes(bytes(data));if(evidence.outputHashes?.[name+'SHA256']!==sha256)throw fail('N2_TAIL_OUTPUT_MISMATCH','Actual output F32 hash differs from native evidence');arraysBinding[name]={sha256,byteLength:data.byteLength,dtype:'float32',...clone(desc)};}
   const returnedArraysBytes=Object.values(arraysBinding).reduce((sum,v)=>sum+v.byteLength,0),resources=evidence.resources;
   if(resources?.returnedArraysBytes!==returnedArraysBytes||!Number.isSafeInteger(resources?.hikeMemoryBytes)||resources.hikeMemoryBytes<0||resources.ORTMemoryBytes!==null&&(!Number.isSafeInteger(resources.ORTMemoryBytes)||resources.ORTMemoryBytes<0))throw fail('N2_TAIL_OUTPUT_MISMATCH','Native resource extents must describe actual arrays and explicitly known or unknown capacities');
   if(returnedArraysBytes>limits.maxReturnedOutputBytes||resources.hikeMemoryBytes>limits.tailHikeCapacityBytes||resources.ORTMemoryBytes!==null&&resources.ORTMemoryBytes>limits.ortSharedMemoryCapacityBytes)throw fail('N2_TAIL_DIAGNOSTIC_BUDGET_EXCEEDED','Observed tail resource capacity exceeds its explicitly scoped diagnostic limit');
   const outputBinding={artifactRef:edge.artifact.artifactId,sha256:arraysBinding.residual.sha256,byteLength:40960,shape:[2,5120],dtype:'float32',meaning:MEANING,arrays:arraysBinding};
   const normalized={...arrays,arrays,evidence,tensor:{data:arrays.residual,shape:[2,5120],dtype:'float32',layout:'LC',meaning:MEANING}};
   await ensureCurrent('owner-validation');
   const numeric=edge.referenceContext.numericRequirements[0];
   const validation=await validateOutput({input:clone(inputs),inputHashes:clone(r.inputHashes),output:clone(normalized),outputBinding:clone(outputBinding),target:clone(target),referenceRef:clone(numeric.referenceRef),numericRequirement:clone(numeric),validationSpec:clone(spec)});await ensureCurrent('validated-result');
   if(validation?.passed!==true||validation.failedValues!==0||['coverage','scope','baseKind','referenceId','referenceSha256','gate','count','comparisonCount','strictParameterChecks'].some(k=>!same(validation[k],spec[k]))||!same(validation.target,target)||!same(validation.inputHashes,r.inputHashes)||!same(validation.outputBinding,outputBinding)||!same(validation.referenceRef,numeric.referenceRef))throw fail('N2_TAIL_VALIDATION_FAILED','Actual owner comparison must bind this target, inputs, five outputs, fixed reference and all declared checks');
   const common={subjectRefs:[edge.producerPort.bindingRef,edge.consumerPort.bindingRef],contractRefs:[...new Set([edge.producerPort,edge.consumerPort].flatMap(p=>[p.nativeAPI.version,p.nativeAPI.build,p.sourceRef.commit]))],artifactRef:edge.artifact.artifactId,profileRef:edge.artifact.profileRef,inputConditions:{shape:[2,5120],dtype:'float32',coverage:spec.coverage,scope:spec.scope,baseKind:spec.baseKind,referenceId:spec.referenceId,environment:edge.referenceContext.environment},normBinding:{catalogSha256:referenceSet.catalogSha256}};
   const receipt={executionScope,target:clone(target),inputHashes:clone(r.inputHashes),outputBinding:clone(outputBinding),validation:clone(validation),nativeEvidence:evidence,diagnosticBudget:limits,...notReady};
   const ownerValidation={checker:'owner-validation',receiptRef:`n2-tail-validation:${await hashCanonical(receipt)}`,target:clone(edge.referenceContext.evidenceTarget)};
   norm.validated({evidence:[{...common,evidenceId:`n2-tail-numeric:${await hashCanonical(validation)}`,scope:numeric.scope,result:'pass',normBinding:{catalogSha256:referenceSet.catalogSha256,...clone(numeric)},ownerReceipt:clone(receipt)},{...common,evidenceId:ownerValidation.receiptRef,scope:'norm:N-EVIDENCE',result:'pass',delegation:ownerValidation,ownerReceipt:clone(receipt)}],delegations:{'N-EVIDENCE':ownerValidation},evidenceTarget:clone(edge.referenceContext.evidenceTarget),...await ensureCurrent('validation-admission')});
   r.outputHandle=captureNativeTensor({tensor:normalized.tensor,response:normalized,descriptor:edge.artifact,store:artifactStore,registry:edge.registry});
   const terminal=queue.inspect().invocations.find(x=>x.requestId===target.requestId);if(!terminal?.originalTerminal||!terminal.resourceReleased||!terminal.reusable||!terminal.resultAccepted)throw fail('N2_TAIL_TERMINAL_UNVERIFIED','Original queue terminal and successful release must precede adoption');
   const transaction={checker:'queue.mjs',receiptRef:`n2-tail-queue:${await hashCanonical(terminal)}`,target:clone(target)},txEvidence={...common,evidenceId:transaction.receiptRef,scope:'norm:N-TRANSACTION',result:'pass',delegation:transaction,ownerReceipt:{terminal,ownerStop:r.stopProof??null,ownerTerminal:r.terminalProof}};
   let published=null;
   const publicationEvidence=[txEvidence],delegations={'N-TRANSACTION':transaction};
   if(publishOutput){
    if(!edge.referenceContext.normIds.includes('N-ARTIFACT'))throw fail('N2_TAIL_PACKAGE_NORM_REQUIRED','Package publication requires explicit N-ARTIFACT admission');
    await ensureCurrent('publication');r.publication.attempted=true;r.publication.status='in-progress';
    published=await publishOutput({outputHandle:r.outputHandle,output:clone(normalized),outputBinding:clone(outputBinding),validationReceipt:clone(receipt),target:clone(target),signal,ensureCurrent:()=>ensureCurrent('publication-IO'),onProgress:v=>{r.publication.progress.push(clone(v));}});r.publication.receipt=clone(published);r.publication.status='written-unadopted';await ensureCurrent('publication-readback');
    if(published?.status!=='complete'||published.artifactRef!==common.artifactRef||published.profileRef!==common.profileRef||published.payloadSha256!==outputBinding.sha256||!same(published.arraysBinding??published.arrays,arraysBinding)||!text(published.receiptRef)||!published.packageReceipt)throw fail('N2_TAIL_PACKAGE_INCOMPLETE','Actual package readback must bind all five named output arrays');
    const artifact={checker:'package.mjs',receiptRef:published.receiptRef,target:{artifactRef:common.artifactRef,profileRef:common.profileRef},receipt:clone(published.packageReceipt)};delegations['N-ARTIFACT']=artifact;publicationEvidence.push({...common,evidenceId:published.receiptRef,scope:'norm:N-ARTIFACT',result:'pass',delegation:artifact,packageReceipt:clone(published.packageReceipt),ownerReceipt:clone(published)});
   }else if(edge.referenceContext.normIds.includes('N-ARTIFACT'))throw fail('N2_TAIL_PACKAGE_UNAVAILABLE','Selected required package publication has no explicit storage capability');
   norm.published({evidence:publicationEvidence,delegations,managerState:{target},...await ensureCurrent('publication-admission')});
   r.publication.status=published?'adopted':'not-requested';r.finished=true;
   return {status:published?'published':'validated',actualArtifactId:common.artifactRef,outputHandle:r.outputHandle,outputBinding,validationReceipt:receipt,publishReceipt:published,queue:queue.inspect(),normExecution:norm.inspect(),nativeCalls:r.runTerminal?1:0,actualNumericalAccepted:executionScope==='actual-fixed-n2-tail',snapshotPublished:false,...notReady};
  }catch(error){r.failed=true;if(r.outputHandle){releaseArtifactHandle(r.outputHandle,artifactStore);r.outputHandle=null;error.outputArtifactReleased=true;}norm.failValidation(error);if(r.publication.attempted){r.publication.status='unadopted';error.publication=clone(r.publication);}error.normExecution=norm.inspect();throw error;}
  finally{globalThis.clearTimeout(deadline);signal?.removeEventListener('abort',listener);r.done.resolve();}
 }
 async function cancel(target){
  const r=exactRun(target);if(r.finished||r.failed)throw fail('TARGET_MISMATCH','Completed or failed invocation is no longer cancellable');r.cancelRequested=true;
  const terminal=queue.inspect().invocations.find(x=>x.requestId===target.requestId);
  if(terminal?.originalTerminal&&terminal.resourceReleased)return {accepted:true,nativeStopRequired:false,originalTerminal:true,resourceReleased:true,publicationPrevented:true};
  return queue.cancelInvocation(target.requestId,{bindingId:target.resourceBinding.bindingId,ownerId:target.resourceBinding.ownerId,resourceGeneration:target.resourceBinding.resourceGeneration,requestId:target.requestId,revision:target.managerRevision,activeToken:target.activeToken});
 }
 async function recover(target){
  const r=exactRun(target);if(!r.cleanupFailed||r.recovered||recovering)throw fail('N2_TAIL_RECOVERY_REQUIRED','Exact retained failed owner is required for recovery');recovering=true;
  try{await r.nativeSettled.promise;await r.done.promise;if(r.native){await r.native.recover();const stats=r.native.stats();if(stats.disposed!==true||stats.activeORTSessions!==0)throw fail('N2_TAIL_RELEASE_UNCONFIRMED','Recovery did not end the native owner');}else if(r.constructorRecovery)await r.constructorRecovery();else throw fail('N2_TAIL_RECOVERY_REQUIRED','Retained recovery capability is missing');
   r.native=null;r.constructorRecovery=null;r.recovered=true;recoveryEnded=true;recoveryReceipt={ownerEnded:true,retryRequiresNewOwner:true,target:clone(target),evidenceRef:`n2-tail-recovery:${await hashCanonical({target,ownerEnded:true})}`};return clone(recoveryReceipt);
  }finally{recovering=false;}
 }
 function rebind({resourceGeneration}={}){
  if(closed)throw fail('N2_TAIL_ADAPTER_DISPOSED','Managed tail adapter is disposed');if(!recoveryEnded||recovering||!recoveryReceipt||!text(resourceGeneration))throw fail('N2_TAIL_NEW_GENERATION_REQUIRED','Successful recovery and explicit new resource generation required');
  const previous=identity.resourceGeneration;identity.resourceGeneration=resourceGeneration;
  try{queue.rebindResource(config(),{verified:true,evidenceRef:recoveryReceipt.evidenceRef});}catch(error){identity.resourceGeneration=previous;throw error;}
  recoveryEnded=false;return {...resource(),previousResourceGeneration:previous,retryRequiresNewOwner:true};
 }
 function inspect(){return {queue:queue.inspect(),executionScope,resourceBinding:resource(),recoveryEnded,recovering,retainedOwners:[...runs.values()].filter(r=>r.native||r.constructorRecovery).map(r=>({target:clone(r.managerTarget),cleanupFailed:r.cleanupFailed,recovered:r.recovered,releaseError:clone(r.releaseError??null),constructorError:clone(r.constructorError??null),originalFactoryTerminal:r.factoryTerminal,originalRunTerminal:r.runTerminal})),...notReady};}
 return Object.freeze({run,cancel,recover,rebind,inspect,async dispose(){closed=true;await queue.dispose();await Promise.all([...runs.values()].map(r=>r.done.promise));return {disposed:true,recoveryRequired:[...runs.values()].filter(r=>r.cleanupFailed&&!r.recovered).map(r=>clone(r.managerTarget)),...notReady};}});
}

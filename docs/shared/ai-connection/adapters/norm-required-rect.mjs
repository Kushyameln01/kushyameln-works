import {createNormExecution} from '../norm-execution.mjs';
import {createInvocationQueue} from '../queue.mjs';
import {canonicalize,hashCanonical,sha256Bytes} from '../canonical.mjs';
import {createTextVaeAdapter} from './text-vae.mjs';
import {captureNativeTensor,restoreNativeTensor,releaseArtifactHandle} from './artifacts.mjs';

export const RECT_DECODE_PROFILE='wan21-raw-f32-1x16x32';
export const RECT_DECODE_ASSETS=Object.freeze(['decoder-body.onnx','conv2-weight.f32','conv2-bias.f32']);
const MODEL='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b';
const RGB=[1,3,1,16,32],LATENT=[1,16,1,2,4],clone=structuredClone;
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const source=v=>v&&typeof v.repository==='string'&&v.repository.trim()&&typeof v.path==='string'&&v.path.trim()&&/^[a-f0-9]{40}$/.test(v.commit??'');
const same=(a,b)=>a===undefined||b===undefined?a===b:canonicalize(a)===canonicalize(b);
const fail=(code,message)=>Object.assign(Error(message),{code});
const dataBytes=t=>new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength);
const aborted=signal=>{if(signal?.aborted)throw fail('INVOCATION_CANCELLED','The exact Rect invocation was cancelled');};
function rawMean(t){if(t?.dtype!=='float32'||t.layout!=='NCTHW'||t.meaning!=='raw-posterior-mean'||!same(t.shape,LATENT)||t.modelSha256!==MODEL||t.normalization!==undefined||t.latentContract!==undefined||t.attentionMask!==undefined||!(t.data instanceof Float32Array)||t.data.length!==128)throw fail('RECT_INPUT_MISMATCH','Exact owned raw Rect mean required; normalized/F5/sample substitutes are forbidden');return t;}
function actualRGB(t,planned,input){if(t?.dtype!=='float32'||t.layout!=='NCTHW'||t.meaning!=='raw-decoder-rgb'||!same(t.shape,RGB)||t.modelSha256!==MODEL||!(t.data instanceof Float32Array)||t.data.length!==1536||!t.data.every(Number.isFinite)||!same(t.context,input.context)||planned.tensor.dtype!==t.dtype||planned.tensor.nativeMeaning!==t.meaning||!same(planned.tensor.shape,t.shape)||!same(planned.native.metadata.modelSha256,t.modelSha256))throw fail('RECT_OUTPUT_MISMATCH','Actual RGB must prove the predeclared output shape/meaning/model and input context');}
/** Required entry for this diagnostic Rect decode route. The native API remains
 * independently usable. The factory must create an idle owned works-ai-1 VAE;
 * the CLI authenticates its actual source bytes before injecting that factory.
 * ownerLifecycle observes the same target's worker stop/terminal/release, not a
 * timeout or the mere native cancel boolean. No VAE numeric operation is added. */
export function createNormRequiredRectAdapter({nativeFactory,descriptor,binding,sourceVerified=false,artifactStore,ownerLifecycle,executionScope}={}){
 if(typeof nativeFactory!=='function'||!artifactStore?.get||!binding?.ownerId||!binding?.sessionId||!binding?.bindingId||!binding?.resourceGeneration||!descriptor?.nativeAPI||!['cancelled','afterTerminal','release'].every(k=>typeof ownerLifecycle?.[k]==='function')||typeof executionScope!=='string')throw fail('RECT_OWNER_REQUIRED','Explicit native factory, scope, descriptor, owned store and owner lifecycle are required');
 const identity=clone(binding),declared=clone(descriptor),runs=new Map();let active=null,closed=false;
 const sameOwner=t=>t?.bindingId===identity.bindingId&&t.ownerId===identity.ownerId&&t.resourceGeneration===identity.resourceGeneration;
 const queue=createInvocationQueue({resourceBindings:[{bindingId:identity.bindingId,ownerId:identity.ownerId,resourceGeneration:identity.resourceGeneration,
  cancel:async target=>{
   const r=active;if(!r||!sameOwner(target)||r.target.requestId!==target.requestId)throw fail('RECT_STOP_TARGET_MISMATCH','Native stop must identify this active owned Rect job');
   if(!r.started)return {stopped:true,evidenceRef:'guarded-no-native-dispatch'};
   const nativeCancel=await r.adapter.cancel({requestId:target.requestId,localRevision:r.nativeLocalRevision});
   const proof=await ownerLifecycle.cancelled({target,nativeCancel,nativeClient:r.native});
   if(!proof||!same(proof.target,target))throw fail('RECT_STOP_TARGET_MISMATCH','Stop proof does not identify this exact owner target');r.stopProof=clone(proof);return proof;
  },
  afterTerminal:async(target,outcome)=>{
   const r=active;if(!r||r.target.requestId!==target.requestId)throw fail('RECT_TERMINAL_TARGET_MISMATCH','Original native terminal must remain bound to its target');
   const proof=await ownerLifecycle.afterTerminal({target,outcome,nativeClient:r.native,stopProof:r.stopProof??null});
   if(!proof||!same(proof.target,target))throw fail('RECT_TERMINAL_TARGET_MISMATCH','Terminal proof target differs');r.terminalProof=clone(proof);return proof;
  },
  release:async(target,outcome)=>{
   const r=active;if(!r||r.target.requestId!==target.requestId)throw fail('RECT_RELEASE_TARGET_MISMATCH','Release target differs');
   await r.adapter?.dispose();await r.native?.dispose();await ownerLifecycle.release({target,outcome,nativeClient:r.native,stopProof:r.stopProof??null,terminalProof:r.terminalProof});r.released=true;active=null;
  }
 }]});
 async function run(q={}){
  const norm=createNormExecution({policyId:'rect-decode',referenceSet:q.referenceSet,edgeInput:q.edgeInput});
  const {referenceSet:ignored,...context}=q.edgeInput.referenceContext;
  const edge=clone({...q.edgeInput,referenceContext:context}),target=clone(q.target),referenceSet=q.referenceSet;
  const inputHandle=q.inputHandle,signal=q.signal;
  const input=rawMean(restoreNativeTensor(inputHandle,artifactStore)),prior=clone(q.priorInputEvidence),spec=clone(q.validationSpec);
  const validate=q.validateOutput,publish=q.publishOutput,readCurrent=q.readCurrent,manifest=clone(q.manifest),files=q.files instanceof Map?new Map(q.files):null;
  const r={target:null,managerTarget:target,norm,started:false,native:null,adapter:null,released:false,cancelRequested:false,nativeTerminal:false,publication:{attempted:false,status:'not-started',progress:[],receipt:null}};
  r.done=new Promise(resolve=>{r.finish=resolve;});
  let listener;
  const ensureCurrent=async stage=>{
   if(closed)throw fail('RECT_ADAPTER_DISPOSED','Rect adapter was disposed');aborted(signal);if(r.cancelRequested)throw fail('INVOCATION_CANCELLED','Rect operation cancelled after native terminal');
   const current=await readCurrent();if(closed)throw fail('RECT_ADAPTER_DISPOSED','Rect adapter was disposed');aborted(signal);
   if(r.cancelRequested)throw fail('INVOCATION_CANCELLED','Rect operation cancelled');
   if(!same(current?.target,target))throw fail('RECT_STALE_INVOCATION',`Rect manager selection changed at ${stage}`);
   return {activeBindings:current.activeBindings,resourceState:current.resourceState};
  };
  try{
   if(closed)throw fail('RECT_ADAPTER_DISPOSED','Rect adapter is disposed');
   if(!sourceVerified)throw fail('RECT_SOURCE_UNVERIFIED','Acquired source-byte proof is required before native dispatch');
   if(!target?.requestId||target.managerSessionId!==identity.sessionId||!Number.isSafeInteger(target.managerRevision)||!Number.isSafeInteger(target.localRevisionBindings?.localRevision)||!target.activeToken||!same(target.resourceBinding,{bindingId:identity.bindingId,ownerId:identity.ownerId,resourceGeneration:identity.resourceGeneration})||!same(edge.referenceContext.managerState?.target,target))throw fail('RECT_TARGET_REQUIRED','Explicit manager and native-local revisions and exact owner target are required');
   if(!prior||typeof prior.scope!=='string'||typeof validate!=='function'||typeof publish!=='function'||typeof readCurrent!=='function')throw fail('RECT_CALLBACK_REQUIRED','Explicit prior evidence, current manager state and post-dispatch validation/save capabilities are required');
   if(!spec||!['coverage','scope','baseKind','referenceId','referenceSha256'].every(k=>typeof spec[k]==='string'&&spec[k])||!sha(spec.referenceSha256)||!spec.gate||!['atol','rtol','maxAbs'].every(k=>spec.gate[k]===2e-5))throw fail('RECT_VALIDATION_SPEC_REQUIRED','Owner reference and all-value gate must be fixed before dispatch');
   const evidenceTarget=edge.referenceContext.evidenceTarget;
   if(!same(evidenceTarget,{artifactRef:edge.artifact.artifactId,profileRef:edge.artifact.profileRef,...Object.fromEntries(['coverage','scope','baseKind','referenceId'].map(k=>[k,spec[k]]))}))throw fail('RECT_VALIDATION_SPEC_MISMATCH','Evidence target must declare the same owner scope/reference before native execution');
   if(manifest?.kind!=='wan21-vae-profile-v1'||manifest.schemaVersion!==1||manifest.profile?.id!==RECT_DECODE_PROFILE||!same(manifest.profile.latentShape,LATENT)||!same(manifest.profile.videoShape,RGB)||manifest.model?.sha256!==MODEL)throw fail('RECT_MANIFEST_MISMATCH','Original exact Rect manifest required');
   if(!same(edge.artifact.native.metadata.context,input.context))throw fail('RECT_CONTEXT_MISMATCH','Planned RGB context must match the supplied raw mean');
   await ensureCurrent('declaration');
   const inputHash=await sha256Bytes(dataBytes(input));
   if(!source(prior.sourceRef)||prior.modelSha256!==MODEL||prior.profileId!==RECT_DECODE_PROFILE||!sha(prior.inputPayloadSha256)||!sha(prior.encodePayloadSha256)||!sha(prior.restoredPayloadSha256)||prior.inputPayloadSha256!==inputHash||prior.restoredPayloadSha256!==inputHash||!Object.hasOwn(prior,'context')||!same(prior.context,input.context))throw fail('RECT_PRIOR_INPUT_MISMATCH','Prior encode/restore evidence must bind this exact mean payload, model, profile, context and source; encode hash remains separate');
   const missing=RECT_DECODE_ASSETS.filter(n=>!files?.has(n));
   if(missing.length)return {status:'blocked',blockedEdge:'actual-vae-decode',missingAssets:missing,nativeCalls:0,normExecution:norm.inspect(),modelInference:false,generationReady:false,snapshotPublished:false};
   const localRevision=target.localRevisionBindings.localRevision;
   const invocation={id:target.requestId,requestId:target.requestId,ownerId:identity.ownerId,resourceBinding:identity.bindingId,resourceGeneration:identity.resourceGeneration,revision:target.managerRevision,activeToken:target.activeToken};
   if(runs.has(target.requestId))throw fail('DUPLICATE_INVOCATION','Rect request IDs cannot be reused');r.target=invocation;r.nativeLocalRevision=localRevision;runs.set(target.requestId,r);
   listener=()=>{r.cancelRequested=true;if(!r.nativeTerminal)queue.cancelInvocation(target.requestId,{bindingId:identity.bindingId,ownerId:identity.ownerId,resourceGeneration:identity.resourceGeneration,requestId:target.requestId,revision:target.managerRevision,activeToken:target.activeToken}).catch(()=>{});};
   signal?.addEventListener('abort',listener,{once:true});
   const output=await queue.enqueue(invocation,async nativeContext=>{
    active=r;r.queueTarget=nativeContext.target;aborted(nativeContext.signal);norm.declaration(await ensureCurrent('dispatch'));
    r.native=await nativeFactory({target:nativeContext.target});aborted(nativeContext.signal);await ensureCurrent('factory');
    if(!r.native||!['configure','decode','cancel','dispose'].every(k=>typeof r.native[k]==='function'))throw fail('RECT_NATIVE_UNAVAILABLE','Acquired owned works-ai-1 VAE module required');
    r.adapter=createTextVaeAdapter({module:'vae',nativeClient:r.native,descriptor:declared,binding:identity,artifactStore,sourceVerified});
    r.native.configure({manifest,files});aborted(nativeContext.signal);await ensureCurrent('configure');r.started=true;
    const reply=await r.adapter.invoke({requestId:target.requestId,localRevision,operationId:'decode',input});
    if(reply.status==='cancelled')throw fail('INVOCATION_CANCELLED','Native Rect invocation cancelled');
    if(reply.status!=='ok')throw fail('RECT_NATIVE_FAILED',reply.error?.rawMessage??'Native Rect decode failed');
    actualRGB(reply.result?.tensor,edge.artifact,input);return reply.result;
   });
   r.nativeTerminal=true;await ensureCurrent('native-terminal');
   const outputBinding={sha256:await sha256Bytes(dataBytes(output.tensor)),byteLength:output.tensor.data.byteLength,shape:clone(output.tensor.shape),dtype:output.tensor.dtype,meaning:output.tensor.meaning,artifactRef:edge.artifact.artifactId,inputMeanSha256:inputHash};
   await ensureCurrent('owner-validation');
   const validation=await validate({input:clone(input),output:clone(output),outputBinding:clone(outputBinding),target:clone(target),priorInputEvidence:clone(prior),validationSpec:clone(spec)});await ensureCurrent('validated-result');
   if(validation?.passed!==true||validation.count!==1536||!['coverage','scope','baseKind','referenceId','referenceSha256','gate'].every(k=>same(validation[k],spec[k])))throw fail('RECT_VALIDATION_FAILED','All 1536 values must pass the exact predeclared owner reference/gate/scope');
   const common={subjectRefs:[edge.producerPort.bindingRef,edge.consumerPort.bindingRef],contractRefs:[...new Set([edge.producerPort.nativeAPI.version,edge.producerPort.nativeAPI.build,edge.producerPort.sourceRef.commit,edge.consumerPort.nativeAPI.version,edge.consumerPort.nativeAPI.build,edge.consumerPort.sourceRef.commit])],artifactRef:edge.artifact.artifactId,profileRef:edge.artifact.profileRef,inputConditions:{shape:RGB,dtype:'float32',coverage:spec.coverage,scope:spec.scope,baseKind:spec.baseKind,referenceId:spec.referenceId,environment:'explicit-owned-native-capability'},normBinding:{catalogSha256:referenceSet.catalogSha256}};
   const receipt={scope:'Rect decode only; prior encode/mean evidence retained separately',executionScope,target,nativeLocalRevision:localRevision,outputBinding,validation:clone(validation),nativeEvidence:clone(output.evidence??null),priorInputEvidence:prior};
   const ownerValidation={checker:'owner-validation',receiptRef:`rect-validation:${await hashCanonical(receipt)}`,target:clone(evidenceTarget)};
   norm.validated({evidence:[{...common,evidenceId:ownerValidation.receiptRef,scope:'norm:N-EVIDENCE',result:'pass',delegation:ownerValidation,data:receipt}],delegations:{'N-EVIDENCE':ownerValidation},evidenceTarget:clone(evidenceTarget),...await ensureCurrent('validation-admission')});
   const outputHandle=captureNativeTensor({tensor:output.tensor,response:output,descriptor:edge.artifact,store:artifactStore,registry:edge.registry});r.outputHandle=outputHandle;
   await ensureCurrent('publication');r.publication.attempted=true;r.publication.status='in-progress';
   const published=await publish({inputHandle,outputHandle,output:clone(output),outputBinding:clone(outputBinding),validationReceipt:clone(receipt),target:clone(target),signal,ensureCurrent:()=>ensureCurrent('publication-IO'),onProgress:v=>{r.publication.progress.push(clone(v));}});
   r.publication.receipt=clone(published);r.publication.status='written-unadopted';await ensureCurrent('publication-readback');
   if(published?.status!=='complete'||published.artifactRef!==common.artifactRef||published.profileRef!==common.profileRef||published.payloadSha256!==outputBinding.sha256||typeof published.receiptRef!=='string'||!published.packageReceipt)throw fail('RECT_PACKAGE_INCOMPLETE','Actual E4 readback must bind this RGB artifact and payload');
   const terminal=queue.inspect().invocations.find(x=>x.requestId===target.requestId);
   if(!terminal?.originalTerminal||!terminal.resourceReleased||!terminal.reusable)throw fail('RECT_TERMINAL_UNVERIFIED','Owner terminal/release must precede publication');
   const transaction={checker:'queue.mjs',receiptRef:`rect-queue:${await hashCanonical(terminal)}`,target};
   const artifact={checker:'package.mjs',receiptRef:published.receiptRef,target:{artifactRef:common.artifactRef,profileRef:common.profileRef},receipt:clone(published.packageReceipt)};
   norm.published({evidence:[{...common,evidenceId:transaction.receiptRef,scope:'norm:N-TRANSACTION',result:'pass',delegation:transaction,data:{terminal,ownerStop:r.stopProof??null,ownerTerminal:r.terminalProof}},{...common,evidenceId:published.receiptRef,scope:'norm:N-ARTIFACT',result:'pass',delegation:artifact,packageReceipt:clone(published.packageReceipt),data:clone(published)}],delegations:{'N-TRANSACTION':transaction,'N-ARTIFACT':artifact},managerState:{target},...await ensureCurrent('publication-admission')});
   r.publication.status='adopted';r.finished=true;
   return {status:'published',actualArtifactId:common.artifactRef,outputHandle,outputBinding,validationReceipt:receipt,publishReceipt:published,queue:queue.inspect(),normExecution:norm.inspect(),nativeCalls:1,modelInference:executionScope==='actual-vae-profile-decode',generationReady:false,snapshotPublished:false};
  }catch(error){
   r.failed=true;if(r.outputHandle){releaseArtifactHandle(r.outputHandle,artifactStore);r.outputHandle=null;error.outputArtifactReleased=true;}
   if(norm.inspect().phase==='declaration')norm.failValidation(error);
   if(r.publication.attempted){r.publication.status='unadopted';error.publication=clone(r.publication);}
   error.normExecution=norm.inspect();throw error;
  }finally{if(listener)signal?.removeEventListener('abort',listener);r.finish();}
 }
 async function cancel(target){
  const r=runs.get(target?.requestId);if(!r||!same(r.managerTarget,target)||r.finished||r.failed)throw fail('TARGET_MISMATCH','Stale/foreign/completed Rect target cannot stop this owner');
  r.cancelRequested=true;
  const terminal=queue.inspect().invocations.find(x=>x.requestId===target.requestId);
  if(terminal?.originalTerminal&&terminal.resourceReleased){r.nativeTerminal=true;return {accepted:true,nativeStopRequired:false,originalTerminal:true,resourceReleased:true,publicationPrevented:true};}
  return queue.cancelInvocation(target.requestId,{bindingId:identity.bindingId,ownerId:identity.ownerId,resourceGeneration:identity.resourceGeneration,requestId:target.requestId,revision:target.managerRevision,activeToken:target.activeToken});
 }
 return Object.freeze({run,cancel,inspect:()=>queue.inspect(),async dispose(){closed=true;await queue.dispose();await Promise.all([...runs.values()].map(r=>r.done));}});
}

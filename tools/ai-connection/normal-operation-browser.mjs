/** Ordinary normal-operation entry. Source registration is bootstrap work;
 * callers supply an operation/Artifact descriptor and data, never proof data. */
import {createNormalOperationAdapter} from '../../docs/shared/ai-connection/adapters/normal-operation.mjs';
import {createNormalDiffusionOwner,createNormalRequestDescriptor} from '../../docs/shared/ai-connection/adapters/normal-diffusion-owner.mjs';
import {createAdoptedWktensorCodec} from '../../docs/shared/ai-connection/codecs/wktensor.mjs';
import {sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';
import {deriveWorkflowShapes,BERNINI_WORKFLOW_RULE_ID} from '../../docs/shared/ai-connection/workflow-shapes.mjs';
import {queryWorkflowRequirements} from '../../docs/shared/ai-connection/adapters/workflow-normal-requests.mjs';
export {createNormalRequestDescriptor};
const clone=structuredClone,fail=(code,message)=>Object.assign(Error(message),{code});
const flags={generationReady:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};
const summarize=result=>({status:result.status,normalExecution:result.normalExecution??true,operation:result.operation??null,target:result.target??null,terminal:clone(result.terminal??null),snapshot:clone(result.snapshot??null),edgeDecision:clone(result.edgeDecision??null)});
export async function queryNormalSupport({host,descriptor}){return host.querySupport(clone(descriptor));}
/** Two ordinary requests. Numerical reference/gate/receipt/E4 never enter this
 * function, the owner facade, the host, or the normal snapshot transaction. */
export async function executeNormalRoundtrip({host,input,descriptor,observeOwner}){
 const first=descriptor?clone(descriptor):createNormalRequestDescriptor('normalizeRawMean',input);
 const normalized=await host.execute({descriptor:first,input,requestId:'normal:normalize:'+crypto.randomUUID()});
 if(normalized.status!=='EXECUTION_COMPLETED')return {...normalized,normalExecution:false,stage:'normalizeRawMean',diagnosticState:'NOT_REQUESTED',...flags};
 if(!normalized.output?.tensor)throw fail('NORMAL_OUTPUT_MISSING','Completed normalization did not return its owned tensor');
 const normalizedObservation=observeOwner?.()??null;
 const restored=await host.execute({descriptor:createNormalRequestDescriptor('restoreRawMean',normalized.output.tensor),input:normalized.output.tensor,requestId:'normal:restore:'+crypto.randomUUID()});
 if(restored.status!=='EXECUTION_COMPLETED')return {...restored,normalExecution:false,stage:'restoreRawMean',normalized:normalized.output.tensor,operations:[summarize(normalized)],diagnosticState:'NOT_REQUESTED',...flags};
 if(!restored.output?.tensor)throw fail('NORMAL_OUTPUT_MISSING','Completed restoration did not return its owned tensor');
 return {status:'EXECUTION_COMPLETED',normalExecution:true,operations:[summarize(normalized),summarize(restored)],normalized:normalized.output.tensor,restored:restored.output.tensor,nativeObservations:{normalized:normalizedObservation,restored:observeOwner?.()??null},diagnosticState:'NOT_REQUESTED',...flags};
}
/** Metadata for this controlled P2 demonstration, not a claim that the original
 * sample media or its requested81 frames have actually been supplied. */
export function createControlledNormalWorkflowPlan({inputContext}={}){
 const input={ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:81,height:480,width:832},refMaxSize:848,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',temporalRule:'first-then-groups-floor',concatOrder:'target-first'},media:{sourceVideo:{state:'absent'},referenceVideo:{state:'absent'},slots:[{slotIndex:0,wired:{state:'present',inputId:inputContext?.inputId??'controlled-retained-p2-rect',rgb:{frames:1,height:16,width:32},sourceFrameIndices:clone(inputContext?.sourceFrameIndices??[0])},editor:{state:'absent'}}]}};
 return {scope:'controlled retained P2 Rect snapshot metadata',originalSampleMedia:{state:'unknown',reason:'Original sample media/frame supply has not been supplied'},request:input,shapePlan:deriveWorkflowShapes(input)};
}
export async function queryControlledNormalWorkflow({host,input,descriptor}){
 const controlled=createControlledNormalWorkflowPlan({inputContext:input.context}),plan=controlled.shapePlan,rect=plan.requirements.find(r=>r.requirementId==='context:0:0.latent'),target=plan.requirements.find(r=>r.requirementId==='target.latent');
 if(!rect||!target)throw fail('NORMAL_CONTROLLED_PLAN_INVALID','Controlled shape requirements are unavailable');
 const selectedInputMatchesControlled=JSON.stringify(rect.shape)===JSON.stringify(input.shape);
 // New requested template only: no actual caller profile/metadata is removed.
 const targetDescriptor=createNormalRequestDescriptor('normalizeRawMean',{dtype:target.dtype,shape:[...target.shape],layout:target.axes.join(''),meaning:input.meaning,modelSha256:input.modelSha256});
 const bindings=[{requirementId:target.requirementId,descriptor:targetDescriptor}];if(selectedInputMatchesControlled)bindings.unshift({requirementId:rect.requirementId,descriptor:descriptor??createNormalRequestDescriptor('normalizeRawMean',input)});
 const bridge=await queryWorkflowRequirements({shapePlan:plan,bindings,queryOwner:d=>host.querySupport(d)});
 return {...controlled,selectedInputMatchesControlled,bridge};
}
/** Trigger cancellation after the real owner request starts. Reusing A's old
 * manager target while B is running must never address B's native tuple. */
export async function executeNormalCancellation({host,input,descriptor,setRequestHook,awaitNativeWorker=async()=>({observation:'unit-harness'})}){
 let targetA,cancellationA,oldCancellation,workerAckA,workerAckB,activeBTargetAtAttempt;
 setRequestHook(tuple=>{if(cancellationA)return;targetA=clone(host.inspect().activeTarget);if(!targetA)throw fail('NORMAL_CANCEL_TARGET_UNAVAILABLE','Active manager target required after the native request started');cancellationA=(async()=>{workerAckA=await awaitNativeWorker(tuple);if(host.inspect().activeTarget?.requestId!==targetA.requestId)throw fail('NORMAL_CANCEL_NOT_OBSERVED','A completed before actual Worker creation was acknowledged');return host.cancel(targetA);})();void cancellationA.catch(()=>{});return cancellationA;});
 let aError=null,aCompleted=false;try{await host.execute({descriptor:descriptor??createNormalRequestDescriptor('normalizeRawMean',input),input,requestId:'normal:cancel:A:'+crypto.randomUUID()});aCompleted=true;}catch(error){aError={code:error.code??null,name:error.name,message:String(error.message)};}
 if(!cancellationA)throw fail('NORMAL_CANCEL_NOT_OBSERVED','The actual native request callback did not request cancellation');const cancelled=await cancellationA;if(aCompleted)throw fail('NORMAL_CANCEL_NOT_OBSERVED','A completed before its requested cancellation');
 setRequestHook(tuple=>{if(oldCancellation)return;const targetB=clone(host.inspect().activeTarget);oldCancellation=(async()=>{workerAckB=await awaitNativeWorker(tuple);activeBTargetAtAttempt=clone(host.inspect().activeTarget);if(!targetB||activeBTargetAtAttempt?.requestId!==targetB.requestId||activeBTargetAtAttempt?.activeToken!==targetB.activeToken)throw fail('NORMAL_STALE_CANCEL_NOT_EXERCISED','B completed before the old-target check could run');try{return {accepted:true,value:await host.cancel(targetA)};}catch(error){return {accepted:false,code:error.code??null,message:String(error.message)};}})();void oldCancellation.catch(()=>{});return oldCancellation;});
 let b,bError,oldTarget,controlError;
 try{b=await host.execute({descriptor:descriptor??createNormalRequestDescriptor('normalizeRawMean',input),input,requestId:'normal:cancel:B:'+crypto.randomUUID()});}catch(error){bError=error;}
 finally{setRequestHook(()=>{});if(oldCancellation)try{oldTarget=await oldCancellation;}catch(error){controlError=error;}}
 if(bError){if(controlError)bError.normalControlError={code:controlError.code??null,message:String(controlError.message)};throw bError;}if(controlError)throw controlError;
 if(!oldCancellation)throw fail('NORMAL_STALE_CANCEL_NOT_EXERCISED','B did not start a native request');
 if(b.status!=='EXECUTION_COMPLETED'||oldTarget.accepted)throw fail('NORMAL_STALE_CANCEL_INTERFERED','An ended A target must be rejected while B completes');
 return {status:'LIFECYCLE_VERIFIED',normalExecution:true,cancelledA:{target:targetA,workerCreatedAck:workerAckA,cancellation:cancelled,error:aError},oldTargetDuringB:{...oldTarget,attemptedTarget:targetA,activeBTargetAtAttempt,workerCreatedAck:workerAckB},completedB:summarize(b),normalized:b.output.tensor,nativeEvidence:{normalized:b.output.evidence??null},diagnosticState:'NOT_REQUESTED',...flags};
}
/** Observation only. Requests, numerical values and termination behavior are
 * delegated unchanged to the original browser Worker implementation. */
function observeWorkers(){
 const NativeWorker=globalThis.Worker,events=[];let sequence=0;
 class ObservedWorker extends NativeWorker{
  constructor(url,options){super(url,options);this.normalObserverId='normal-worker:'+ ++sequence;events.push({kind:'created',workerId:this.normalObserverId,url:String(url)});}
  postMessage(message,...rest){events.push({kind:'post',workerId:this.normalObserverId,tuple:Object.fromEntries(['buildId','protocolVersion','sessionId','jobId','inputRevision','op'].map(key=>[key,message?.[key]??null]))});return super.postMessage(message,...rest);}
  terminate(){events.push({kind:'terminate',workerId:this.normalObserverId});return super.terminate();}
 }
 globalThis.Worker=ObservedWorker;return {events,restore(){globalThis.Worker=NativeWorker;}};
}
const encode64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);};
export async function runNormalOperationBrowser(plan){
 const observation=observeWorkers(),nativeRequests=[];let host,owner,result,disposition,hook=()=>{};
 const codec=createAdoptedWktensorCodec();
 try{
  const [nativeModule,interop,latentModule]=await Promise.all([import('/native/docs/shared/diffusion-models/api/index.mjs'),import('/native/docs/shared/diffusion-models/tensor-interop.mjs'),import('/native/docs/shared/diffusion-models/latent-space/latent-space.mjs')]);
  if(nativeModule.BUILD_ID!==plan.bootstrap.expectedBuild||nativeModule.PROTOCOL_VERSION!==plan.bootstrap.expectedProtocol)throw fail('NORMAL_BOOTSTRAP_NAMESPACE_MISMATCH','Actual fixed native namespace/build/protocol differs from registered source');
  owner=await createNormalDiffusionOwner({nativeModule,interop,latentModule,sourceRef:plan.bootstrap.nativeSource,onNativeRequest:tuple=>{nativeRequests.push(clone(tuple));hook(tuple);}});host=createNormalOperationAdapter({owner});
  const inputFile=document.querySelector('#normal-input').files[0],input=inputFile?await codec.decode(new Uint8Array(await inputFile.arrayBuffer())):null;
  if(plan.scenario==='query')result={...await queryNormalSupport({host,descriptor:plan.descriptor}),scenario:'query',normalExecution:false,diagnosticState:'NOT_REQUESTED',...flags};
  else if(plan.scenario==='cancel-recover')result=await executeNormalCancellation({host,input,descriptor:plan.descriptor,setRequestHook:fn=>hook=fn,awaitNativeWorker:async tuple=>{const post=observation.events.findLast(event=>event.kind==='post'&&['sessionId','jobId','inputRevision','op'].every(key=>event.tuple[key]===tuple[key]));if(!post)throw fail('NORMAL_NATIVE_POST_UNOBSERVED','Actual native Worker post must precede control arming');return globalThis.__normalAwaitWorkerCreated(post.workerId);}});
  else{const workflow=await queryControlledNormalWorkflow({host,input,descriptor:plan.descriptor});result={...await executeNormalRoundtrip({host,input,descriptor:plan.descriptor,observeOwner:()=>owner.readDiagnostics()}),workflow};}
  const privateOutputs={},outputs={};for(const name of ['normalized','restored'])if(result[name]){const tensor=result[name],bytes=await codec.encode(tensor);privateOutputs[name]=encode64(bytes);outputs[name]={byteLength:bytes.byteLength,sha256:await sha256Bytes(bytes),payloadSha256:await sha256Bytes(new Uint8Array(tensor.data.buffer,tensor.data.byteOffset,tensor.data.byteLength)),shape:[...tensor.shape],dtype:tensor.dtype,layout:tensor.layout,meaning:tensor.meaning,normalization:tensor.normalization??null,modelSha256:tensor.modelSha256,context:tensor.context??null};delete result[name];}
  result={...result,scenario:plan.scenario,outputs,privateOutputs,ownerObservation:clone(owner.observe()),host:host.inspect()};
 }catch(error){result={status:'FAIL',scenario:plan.scenario,error:{code:error.code??null,name:error.name,message:String(error.message),reasons:clone(error.reasons??error.support?.reasons??null),edgeDecision:clone(error.edgeDecision??error.decision??null)},normalExecution:false,diagnosticState:'NOT_REQUESTED',...flags};}
 finally{try{if(host)disposition=await host.dispose();else if(owner)disposition=await owner.dispose();}catch(error){result={...result,status:'FAIL',disposalError:{code:error.code??null,message:String(error.message)}};}observation.restore();}
 const closeProof=await globalThis.__normalAwaitWorkersClosed(observation.events.filter(event=>event.kind==='created').length);
 return {...result,disposition,nativeRequests,workerObservation:observation.events,workerCloseProof:closeProof,nativeCalls:observation.events.filter(e=>e.kind==='post'&&['normalizeRawMean','restoreRawMean'].includes(e.tuple.op)).length,resources:{observedWorkerCount:closeProof.created,closedWorkerCount:closeProof.closed,liveWorkerCount:closeProof.live.length,hostPeakBytes:null,allocatorPeakBytes:null,totalPeakBytes:null,scope:'Actual owned Worker close events and native Hike capacities are distinct from total host/process peak'},modelInference:false,...flags};
}

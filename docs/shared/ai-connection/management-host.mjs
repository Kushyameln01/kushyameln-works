/** Standalone management control. Numerical work and capability declarations
 * belong to injected owners; the existing normal queue/snapshot owns each step. */
import {compilePipeline,resolvePipelineWorkflowRequest} from './pipeline.mjs';
import {createNormalOperationAdapter} from './adapters/normal-operation.mjs';

const clone=structuredClone;
const text=v=>typeof v==='string'&&v.length>0;
const failure=(code,message)=>Object.assign(Error(message),{code});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flags={generationReady:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};
const reason=(code,fieldPath,description)=>({code,fieldPath,reason:description});
const errorRecord=e=>({code:e?.code??'OWNER_EXECUTION_FAILED',message:e?.message??String(e)});
function lightweight(value){
 if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return {type:value.constructor.name,byteLength:value.byteLength};
 if(Array.isArray(value))return value.map(lightweight);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>typeof v!=='function').map(([k,v])=>[k,lightweight(v)]));
 return value;
}
function metadataRecord(record){const {tensor,binaryAssets,...metadata}=record;return lightweight(metadata);}
function sourceRecord(record){const {tensor,binaryAssets,...metadata}=record;return clone(metadata);}

export function createManagementHost({owners={},managerSessionId='management:'+crypto.randomUUID()}={}){
 if(!owners||typeof owners!=='object'||Array.isArray(owners)||!text(managerSessionId))throw TypeError('Explicit owner map and manager session ID required');
 const ownerMap=new Map(Object.entries(owners)),adapters=new Map(),listeners=new Set(),usedRequests=new Set(),staleOwners=new Set();
 let profile=null,externalInputs={},selections={},artifacts={},steps={},snapshots=[],restoredSnapshots=[],revision=0,active=null,closed=false,changing=false;
 const live=()=>{if(closed)throw failure('MANAGEMENT_DISPOSED','Management host disposed');if(changing)throw failure('MANAGEMENT_RECONFIGURING','Management configuration is changing');};
 const plan=()=>{if(!profile)throw failure('MANAGEMENT_PIPELINE_REQUIRED','Configure a pipeline first');return compilePipeline(profile,{externalInputs,selections});};
 function adapter(moduleId){if(!ownerMap.has(moduleId))return null;if(!adapters.has(moduleId))adapters.set(moduleId,createNormalOperationAdapter({owner:ownerMap.get(moduleId),managerSessionId:managerSessionId+':'+moduleId}));return adapters.get(moduleId);}
 const quarantined=moduleId=>staleOwners.has(moduleId)||adapters.get(moduleId)?.inspect().queue?.groups?.some(g=>g.quarantined);
 function inspect(){return {schemaVersion:'works-management-host/1',managerSessionId,revision,disposed:closed,reconfiguring:changing,profileId:profile?.profileId??null,selections:clone(selections),activeTarget:clone(active?.target??null),steps:clone(steps),artifactRefs:Object.keys(artifacts),artifacts:Object.fromEntries(Object.entries(artifacts).map(([ref,r])=>[ref,metadataRecord(r)])),snapshots:lightweight(snapshots),restoredSnapshots:lightweight(restoredSnapshots),owners:Object.fromEntries([...ownerMap].map(([id,owner])=>[id,{observation:lightweight(owner.observe()),recoveryRequired:quarantined(id),queue:adapters.get(id)?.inspect().queue??null}])),...flags};}
 function emit(type,detail={}){const event={type,revision,...clone(detail),state:inspect()};for(const listener of listeners)try{listener(clone(event));}catch{/* A view must not abort an owner transaction. */}}
 const current=run=>active===run&&run.revision===revision&&!run.controller.signal.aborted&&!closed&&!changing;
 async function stopActive(){if(active){const running=active;running.controller.abort();await running.done.promise;}}
 async function configure({profile:nextProfile,externalInputs:nextInputs={},selections:nextSelections={}}={}){
  live();const capturedInputs=clone(nextInputs),capturedSelections=clone(nextSelections),compiled=compilePipeline(nextProfile,{externalInputs:capturedInputs,selections:capturedSelections});
  // Validate before invalidating a usable current configuration.
  changing=true;revision++;try{await stopActive();profile=clone(compiled.profile);externalInputs=capturedInputs;selections=capturedSelections;artifacts=clone(capturedInputs);steps={};snapshots=[];restoredSnapshots=[];}finally{changing=false;}
  emit('configured');return inspect();
 }
 async function setSelections(nextSelections){live();return configure({profile,externalInputs,selections:nextSelections});}
 function availableInputs(step,records,states){
  if(step.condition.state==='SELECTION_UNCONFIRMED')return {status:'SELECTION_UNCONFIRMED',reasons:[reason('SELECTION_UNCONFIRMED','/when','An explicit selection is required')]};
  if(step.condition.state==='SKIPPED')return null;
  const needed=step.condition.state==='BYPASSED'?step.inputBindings.filter(b=>step.bypassBindings.some(p=>p.inputPortId===b.portId)):step.inputBindings;
  for(const binding of needed){
   if(binding.source.kind==='step'&&!['COMPLETED','BYPASSED'].includes(states[binding.source.stepId]?.status))return {status:'DEPENDENCY_BLOCKED',reasons:[reason('DEPENDENCY_BLOCKED','/inputBindings/'+binding.portId,'Producer '+binding.source.stepId+' has no accepted output in this execution')]};
   const record=records[binding.artifactRef];if(!record?.descriptor||!record?.tensor)return {status:binding.source.kind==='external'?'INPUT_UNCONFIRMED':'DEPENDENCY_BLOCKED',reasons:[reason('INPUT_UNCONFIRMED','/inputBindings/'+binding.portId,'Select or restore the required input '+binding.artifactRef)]};
  }
  return null;
 }
 function descriptorFor(step,records){
  const base={operationId:step.operationId,...Object.fromEntries(['modelRefs','targetRefs','parameters'].filter(k=>step[k]!==undefined).map(k=>[k,clone(step[k])]))};
  if(step.inputBindings.length!==1)return {...base,artifacts:Object.fromEntries(step.inputBindings.map(b=>[b.portId,clone(records[b.artifactRef]?.descriptor)]))};
  return {...base,artifact:clone(records[step.inputBindings[0].artifactRef]?.descriptor)};
 }
 function requestFor(step,records,descriptor=descriptorFor(step,records)){
  const inputs=Object.fromEntries(step.inputBindings.map(b=>[b.portId,records[b.artifactRef]]));
  const input=step.inputBindings.length!==1?Object.fromEntries(Object.entries(inputs).map(([id,r])=>[id,clone(r.tensor)])):clone(Object.values(inputs)[0].tensor);
  return {descriptor,input,inputs};
 }
 function workflowAdmission(step,records,compiled){
  if(step.condition.state!=='ACTIVE')return null;
  return resolvePipelineWorkflowRequest({shapePlan:compiled.workflowShapePlan,step,descriptor:descriptorFor(step,records)});
 }
 const workflowBlocked=admission=>admission&&admission.status!=='BOUND'?{status:admission.status==='NOT_REQUIRED'?'SKIPPED':admission.status,reasons:clone(admission.reasons),workflowRequirements:lightweight(admission.requirements)}:null;
 function bypass(step,records){
  for(const b of step.bypassBindings){const output=step.outputBindings.find(p=>p.portId===b.outputPortId),input=step.inputBindings.find(p=>p.portId===b.inputPortId);const record=clone(records[input.artifactRef]);record.descriptor.artifactId=output.artifactRef;record.management={kind:'explicit-bypass',stepId:step.stepId,revision,inputRef:input.artifactRef};records[output.artifactRef]=record;}
 }
 async function query(){
  live();const selectedRevision=revision,compiled=plan(),states={},records=clone(externalInputs);
  for(const layer of compiled.layers)await Promise.all(layer.map(async id=>{
   const step=compiled.steps.find(s=>s.stepId===id),workflow=workflowAdmission(step,records,compiled),unavailable=workflow?.status==='NOT_REQUIRED'?workflowBlocked(workflow):availableInputs(step,records,states)??workflowBlocked(workflow);
   if(unavailable){states[id]={stepId:id,...unavailable};return;}
   if(step.condition.state==='SKIPPED'){states[id]={stepId:id,status:'SKIPPED',reasons:[]};return;}
   if(step.condition.state==='BYPASSED'){bypass(step,records);states[id]={stepId:id,status:'BYPASSED',reasons:[]};return;}
   if(!ownerMap.has(step.moduleId)){states[id]={stepId:id,status:'OWNER_UNCONFIRMED',reasons:[reason('OWNER_UNCONFIRMED','/moduleId','No owner is loaded for '+step.moduleId)]};return;}
   if(quarantined(step.moduleId)){states[id]={stepId:id,status:'OWNER_RECOVERY_REQUIRED',reasons:[reason('OWNER_RECOVERY_REQUIRED','/moduleId','Owner release/rebinding must be recovered before reuse')]};return;}
   try{const support=await adapter(step.moduleId).querySupport(workflow.descriptor);states[id]={stepId:id,status:support.dispatchSupported?'SUPPORTED':support.status==='SUPPORTED'?'BLOCKED':support.status,reasons:clone(support.reasons),support};}catch(e){states[id]={stepId:id,status:'FAILED',error:errorRecord(e),reasons:[reason(e.code??'OWNER_QUERY_FAILED','/moduleId',e.message)]};}
  }));
  if(revision!==selectedRevision||closed||changing)throw failure('MANAGEMENT_STALE','Configuration changed during query');
  return {status:Object.values(states).every(s=>['SUPPORTED','BYPASSED','SKIPPED'].includes(s.status))?'SUPPORTED':'BLOCKED',steps:Object.values(states),...flags};
 }
 function outputRecords(step,result,inputs,run){
  const output=result.output,records={};
  for(const binding of step.outputBindings){
   const single=step.outputBindings.length===1;
   const tensor=output?.tensors?.[binding.portId]??output?.outputs?.[binding.portId]??(single?output?.tensor:undefined);
   const declared=output?.descriptors?.[binding.portId]??(single?output?.descriptor:undefined)??step.outputDescriptors?.[binding.portId];
   if(!declared)throw failure('MANAGEMENT_OUTPUT_DESCRIPTOR_REQUIRED','Owner must declare output metadata for '+binding.portId);
   if(!tensor||!ArrayBuffer.isView(tensor.data)||!same(tensor.shape,declared.tensor?.shape)||tensor.dtype!==declared.tensor?.dtype||tensor.layout!==declared.tensor.axes?.join('')||tensor.meaning!==declared.tensor.nativeMeaning)throw failure('MANAGEMENT_OUTPUT_DESCRIPTOR_MISMATCH','Actual owner output differs from its declared shape/dtype/axes/meaning');
   for(const [key,value] of Object.entries(declared.native?.metadata??{}))if(Object.hasOwn(tensor,key)&&!same(value,tensor[key]))throw failure('MANAGEMENT_OUTPUT_DESCRIPTOR_MISMATCH','Actual owner output differs from declared native '+key);
   const descriptor=clone(declared),{data,...nativeMetadata}=tensor;
   descriptor.artifactId=binding.artifactRef;descriptor.native.metadata={...descriptor.native.metadata,...clone(nativeMetadata)};
   descriptor.tensor={...descriptor.tensor,dtype:tensor.dtype,shape:clone(tensor.shape),nativeMeaning:tensor.meaning};
   descriptor.snapshotId=result.snapshot.snapshotId;
   records[binding.artifactRef]={descriptor,tensor:clone(tensor),snapshot:clone(result.snapshot),sourceRecords:Object.values(inputs).map(sourceRecord),management:{stepId:step.stepId,moduleId:step.moduleId,operationId:step.operationId,managerSessionId,managerRevision:run.revision,target:clone(result.target),snapshotId:result.snapshot.snapshotId,terminal:clone(result.terminal)}};
  }
  return records;
 }
 async function execute({requestId='pipeline:'+crypto.randomUUID(),signal,onProgress}={}){
  live();if(active)throw failure('MANAGEMENT_BUSY','A pipeline execution is already active');if(!text(requestId)||usedRequests.has(requestId))throw failure('MANAGEMENT_REQUEST_ID_REUSED','Unique pipeline request ID required');if(signal!==undefined&&!(signal instanceof AbortSignal))throw TypeError('AbortSignal required');if(onProgress!==undefined&&typeof onProgress!=='function')throw TypeError('Progress listener must be a function');
  const compiled=plan(),run={revision,controller:new AbortController(),done:deferred(),states:{},records:clone(externalInputs),snapshots:[],target:{requestId,managerSessionId,managerRevision:revision,activeToken:crypto.randomUUID()}};
  usedRequests.add(requestId);active=run;steps={};snapshots=[];artifacts=clone(externalInputs);
  const abort=()=>run.controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();emit('started',{target:run.target});
  try{
   const scheduled=new Map();
   for(const id of compiled.topologicalOrder){
    const step=compiled.steps.find(s=>s.stepId===id);
    const required=step.condition.state==='SKIPPED'?[]:step.condition.state==='BYPASSED'?step.inputBindings.filter(b=>step.bypassBindings.some(p=>p.inputPortId===b.portId)):step.inputBindings;
    const dependencies=[...new Set(required.filter(b=>b.source.kind==='step').map(b=>b.source.stepId))];
    const task=(async()=>{
     await Promise.all(dependencies.map(dependency=>scheduled.get(dependency)));
     function update(state){run.states[id]={stepId:id,...state};if(active===run&&run.revision===revision){steps=clone(run.states);emit('step',{target:run.target,stepId:id,status:state.status});}}
     if(!current(run)){update({status:'CANCELLED',reasons:[reason('INVOCATION_CANCELLED','/stepId','Execution cancelled or configuration changed')]});return;}
     const workflow=workflowAdmission(step,run.records,compiled),unavailable=workflow?.status==='NOT_REQUIRED'?workflowBlocked(workflow):availableInputs(step,run.records,run.states)??workflowBlocked(workflow);if(unavailable){update(unavailable);return;}
     if(step.condition.state==='SKIPPED'){update({status:'SKIPPED',reasons:[]});return;}
     if(step.condition.state==='BYPASSED'){bypass(step,run.records);for(const b of step.outputBindings)artifacts[b.artifactRef]=clone(run.records[b.artifactRef]);update({status:'BYPASSED',reasons:[]});return;}
     if(!ownerMap.has(step.moduleId)){update({status:'OWNER_UNCONFIRMED',reasons:[reason('OWNER_UNCONFIRMED','/moduleId','No owner is loaded for '+step.moduleId)]});return;}
     if(quarantined(step.moduleId)){update({status:'OWNER_RECOVERY_REQUIRED',reasons:[reason('OWNER_RECOVERY_REQUIRED','/moduleId','Owner release/rebinding must be recovered before reuse')]});return;}
     update({status:'RUNNING',reasons:[]});
     try{
      const request=requestFor(step,run.records,workflow.descriptor),result=await adapter(step.moduleId).execute({...request,requestId:requestId+':'+id,signal:run.controller.signal,onProgress:progress=>{
       if(current(run)){const detail={target:run.target,stepId:id,progress:clone(progress)};emit('progress',detail);try{onProgress?.(clone(detail));}catch{/* View errors do not abort native work. */}}
      }});
      if(!current(run)){update({status:'CANCELLED',reasons:[reason('INVOCATION_CANCELLED','/stepId','Late result was excluded')]});return;}
      if(result.status!=='EXECUTION_COMPLETED'){update({status:result.status,reasons:clone(result.reasons??[]),support:lightweight(result)});return;}
      const produced=outputRecords(step,result,request.inputs,run);Object.assign(run.records,produced);Object.assign(artifacts,clone(produced));run.snapshots.push(clone(result.snapshot));snapshots=clone(run.snapshots);
      update({status:'COMPLETED',reasons:[],artifactRefs:Object.keys(produced),target:clone(result.target),snapshotId:result.snapshot.snapshotId,terminal:clone(result.terminal)});
     }catch(e){if(e.code==='NORMAL_STALE')staleOwners.add(step.moduleId);const cancelled=run.controller.signal.aborted||e.code==='INVOCATION_CANCELLED';update({status:cancelled?'CANCELLED':'FAILED',error:errorRecord(e),reasons:[reason(e.code??'OWNER_EXECUTION_FAILED','/stepId',e.message)]});}
    })();
    scheduled.set(id,task);
   }
   await Promise.all(scheduled.values());
   const states=Object.values(run.states),accepted=states.filter(s=>['COMPLETED','BYPASSED'].includes(s.status)).length,complete=states.every(s=>['COMPLETED','BYPASSED','SKIPPED'].includes(s.status));
   const status=run.controller.signal.aborted||run.revision!==revision?'CANCELLED':complete?'COMPLETED':accepted?'PARTIAL':'BLOCKED';
   const result={status,target:clone(run.target),steps:clone(run.states),artifacts:clone(run.records),finalArtifactRefs:clone(compiled.finalArtifactRefs),snapshots:clone(run.snapshots),...flags};
   if(active===run&&run.revision===revision)emit('finished',{target:run.target,status});return result;
  }finally{signal?.removeEventListener('abort',abort);if(active===run)active=null;run.done.resolve();emit('settled',{target:run.target});}
 }
 async function cancel(target){live();if(!active||!same(active.target,target))throw failure('TARGET_MISMATCH','Exact current pipeline target required');const run=active;run.controller.abort();await run.done.promise;return {cancelled:true,originalTerminal:true,target:clone(target)};}
 async function reconfigureOwner(moduleId,configuration){live();if(!ownerMap.has(moduleId))throw failure('OWNER_UNCONFIRMED','Unknown owner '+moduleId);changing=true;revision++;try{await stopActive();const result=await adapter(moduleId).configure(configuration);staleOwners.delete(moduleId);artifacts=clone(externalInputs);steps={};snapshots=[];return result;}finally{changing=false;emit('owner-configured',{moduleId});}}
 async function recover(moduleId){live();if(!ownerMap.has(moduleId))throw failure('OWNER_UNCONFIRMED','Unknown owner '+moduleId);if(active)throw failure('MANAGEMENT_BUSY','Wait for the original pipeline terminal before recovery');const result=await adapter(moduleId).recover();staleOwners.delete(moduleId);emit('owner-recovered',{moduleId});return result;}
 async function restore({profile:restoredProfile,selections:restoredSelections={},records={},snapshotMetadata=[],unconfirmedExternalRefs=[]}={}){
  // Package data does not restore File grants or owner sessions/capability tokens.
  if(!Array.isArray(unconfirmedExternalRefs)||unconfirmedExternalRefs.some(ref=>!text(ref)))throw TypeError('Explicit unconfirmed external references required');
  const externalRefs=new Set(restoredProfile.externalArtifactRefs),unconfirmed=new Set(unconfirmedExternalRefs),captured=clone(records);
  const restoredInputs=Object.fromEntries(Object.entries(captured).filter(([ref,record])=>externalRefs.has(ref)&&!unconfirmed.has(ref)&&record?.tensor&&record?.descriptor));
  await configure({profile:restoredProfile,externalInputs:restoredInputs,selections:restoredSelections});
  artifacts=Object.fromEntries(Object.entries(captured).filter(([ref])=>!unconfirmed.has(ref)));restoredSnapshots=lightweight(snapshotMetadata);emit('restored');return inspect();
 }
 async function dispose(){if(closed)return {disposed:true};closed=true;revision++;await stopActive();const results=await Promise.allSettled([...ownerMap.keys()].map(async id=>adapters.has(id)?adapters.get(id).dispose():ownerMap.get(id).dispose()));const rejected=results.filter(r=>r.status==='rejected');emit('disposed');if(rejected.length)throw new AggregateError(rejected.map(r=>r.reason),'Owner disposal failed');return {disposed:true,...flags};}
 return Object.freeze({configure,loadPipeline:configure,query,execute,cancel,setSelections,reconfigureOwner,recover,dispose,inspect,restore,
  subscribe(listener){if(typeof listener!=='function')throw TypeError('Listener must be a function');listeners.add(listener);return ()=>listeners.delete(listener);},
  exportArtifacts(){return clone(artifacts);},
  exportState(){return {schemaVersion:'works-management-state/1',profile:clone(profile),selections:clone(selections),revision,steps:clone(steps),artifacts:Object.fromEntries(Object.entries(artifacts).map(([ref,record])=>[ref,metadataRecord(record)])),snapshots:lightweight(snapshots),restoredSnapshots:lightweight(restoredSnapshots),...flags};}
 });
}

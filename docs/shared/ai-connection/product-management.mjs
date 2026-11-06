/** Form-facing orchestration. Native owners retain all tensor admission,
 * normalization, model math, scheduler, LoRA mapping and rollback authority. */
import {createOperationalManagement} from './operational-management.mjs';
import {deriveWorkflowShapes,BERNINI_WORKFLOW_RULE_ID} from './workflow-shapes.mjs';

const copy=structuredClone;
const fail=(code,message,details)=>Object.assign(Error(message),{code,...(details?{details}:{} )});
const absent=()=>({state:'absent'});
const sides=['HIGH','LOW'],pairs=['light','detail'];
const recordError=e=>({code:e.code??e.name??'PRODUCT_OPERATION_FAILED',message:String(e.message??e),reasons:copy(e.reasons??e.details?.reasons??e.support?.reasons??[]),...(e.support?{support:copy(e.support)}:{})});
const tensorMetadata=t=>{const {data,attentionMask,...metadata}=t;return {...copy(metadata),...(attentionMask?{attentionMask:{dtype:'uint8',shape:[attentionMask.length]}}:{})};};
let nativePromise;
async function nativeOwner(){nativePromise??=import('./adapters/diffusion-public/native.mjs');return nativePromise;}
function requireSupport(support,owner){
 if(support?.supported===true||support?.dispatchSupported===true||support?.status==='SUPPORTED')return;
 const reasons=support?.reasons??(support?.reason?[{code:support.code,reason:support.reason}]:[]);
 throw Object.assign(fail('OWNER_UNSUPPORTED',owner+' rejected this input',{owner,reasons}),{support:copy(support),reasons:copy(reasons)});
}
function modelSelection(value){
 if(!value?.text?.manifest||!(value.text.files instanceof Map)||!value?.vae?.manifest||!(value.vae.files instanceof Map)||sides.some(side=>!(value.models?.[side] instanceof Blob)))throw fail('MODEL_SELECTION_REQUIRED','Select Text and VAE manifests/bundles and both HIGH/LOW model files.');
 if(![1,4].includes(value.threads??1))throw fail('UNSUPPORTED_RESOURCE_CONFIG','WASM threads must be 1 or 4.');
 return {text:{manifest:copy(value.text.manifest),files:new Map(value.text.files)},vae:{manifest:copy(value.vae.manifest),files:new Map(value.vae.files)},models:{...value.models},threads:value.threads??1};
}
function loraSelection(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!pairs.includes(key)))throw fail('LORA_SELECTION_INVALID','LoRA selections use the light and detail pairs.');
 const result={};
 for(const pairId of pairs){
  const pair=value[pairId];if(!pair)continue;
  for(const side of sides){const field=pair[side],file=field instanceof Blob?field:field?.file;if(!file)continue;
   if(!(file instanceof Blob))throw fail('LORA_FILE_REQUIRED','Select the '+pairId+' '+side+' LoRA file.');
   (result[side]??=[]).push({pairId,file,strength:field instanceof Blob?(pair.strength??1):(field.strength??pair.strength??1)});
  }
 }
 return result;
}

/** media may provide productMediaTensor; otherwise the local form media helper
 * loads lazily. controlOnly is a deliberately labelled metadata test seam. */
export function createProductManagement({manager=createOperationalManagement(),media,controlOnly}={}){
 if(controlOnly&&!(controlOnly.enabled===true&&typeof controlOnly.native?.describeExecutionCapabilities==='function'&&typeof controlOnly.native?.checkExecutionSupport==='function'))throw fail('CONTROL_TEST_SEAM_REQUIRED','Explicit control-only native metadata functions required.');
 const listeners=new Set(),feeds=new Map(),appliedSides=new Set();
 let state='unconfigured',phase=null,active=null,configuration=null,configured=false,disposed=false,lastError=null,result=null,resultTensor=null,lastSettings=null,formSettings=null,lastSupport=null,lora=null,restorationRequired=false,serial=0;
 const inspect=()=>({state,phase,busy:!!active,configured,disposed,hasResult:!!result,result:copy(result),lastError:copy(lastError),support:copy(lastSupport),lora:copy(lora),loraState:restorationRequired?'restore-required':lora?'applied':'base',restorationRequired,settings:copy(lastSettings),controlTestOnly:!!controlOnly,generationReady:false,owner:manager.inspect()});
 function emit(){for(const fn of [...listeners])try{fn(inspect());}catch{/* View callbacks cannot change owner cleanup. */}}
 const live=()=>{if(disposed)throw fail('PRODUCT_DISPOSED','Product controller is disposed.');};
 function check(r){live();if(active!==r||r.controller.signal.aborted)throw fail('INVOCATION_CANCELLED','The product operation was cancelled.');}
 function progress(r,value){check(r);phase=value;emit();check(r);}
 const owner=()=>controlOnly?Promise.resolve(controlOnly.native):nativeOwner();
 const unsubscribe=manager.subscribe(()=>emit());
 async function prepareMedia(value,{requirement,signal}={}){
  signal?.throwIfAborted();
  if(value?.nativeTensor){const tensor=value.nativeTensor;if(requirement?.shape&&(tensor.shape?.length!==requirement.shape.length||!requirement.shape.every((v,i)=>v===tensor.shape[i])))throw fail('MEDIA_RESIZE_UNAVAILABLE','The saved native RGB tensor requires the exact requested shape; its float values were retained.');return copy(tensor);}
  const helper=media??await import('./product-media.mjs');signal?.throwIfAborted();return helper.productMediaTensor(value,{requirement,meaning:'rgb-unit',signal});
 }
 function operation(name,work){
  live();if(active)throw fail('PRODUCT_BUSY','Wait for the current operation to finish or cancel it.');
  const r={controller:new AbortController(),name,done:null};active=r;lastError=null;state=name==='run'?'running':name==='configure'?'configuring':name;phase=name;
  r.done=Promise.resolve().then(()=>{check(r);return work(r);}).then(value=>{check(r);state=configured?'ready':'unconfigured';return value;}).catch(error=>{lastError=recordError(error);state=error.code==='INVOCATION_CANCELLED'?(configured?'ready':'unconfigured'):'failed';throw error;}).finally(()=>{if(active===r)active=null;phase=null;emit();});
  emit();return r.done;
 }
 async function configureOwners(r,selected){
  progress(r,'text-configuration');await manager.configureModule('text',{...selected.text,diagnostics:false});check(r);
  progress(r,'vae-configuration');await manager.configureModule('vae',{...selected.vae,diagnostics:false});check(r);
  progress(r,'diffusion-configuration');await manager.configureModule('diffusion',{});check(r);feeds.clear();appliedSides.clear();lora=null;restorationRequired=false;
  progress(r,'model-load');await manager.execute({moduleId:'diffusion',operation:'load',input:{files:selected.models,resource:{wasmThreads:selected.threads}}});check(r);configured=true;
 }
 function configure(value){const selected=modelSelection(value);return operation('configure',async r=>{configured=false;configuration=selected;result=null;resultTensor=null;await configureOwners(r,selected);return inspect();});}
 async function cancel(){
  live();const r=active;if(!r)return {cancelled:false,reason:'idle'};
  r.controller.abort();state='cancelling';phase='waiting-for-owner-terminal';emit();
  const target=manager.inspect().activeTarget;let receipt=null,error=null;
  if(target)try{receipt=await manager.cancel(target);}catch(e){error=e;}
  await r.done.catch(()=>{});
  if(error)throw error;
  // A cancelled Diffusion owner terminates its Worker. The loaded observation
  // is authoritative; a later run requires an explicit reload when it is gone.
  if(manager.inspect().modules?.diffusion?.observation?.loaded===false)configured=false;
  state=configured?'ready':'unconfigured';emit();return {cancelled:true,owner:receipt};
 }
 async function clearLora(r){
  if(appliedSides.size||feeds.size||(manager.inspect().weightFeeds??[]).length)restorationRequired=true;
  for(const side of [...appliedSides]){progress(r,'lora-restore-base-'+side);const receipt=await manager.execute({moduleId:'lora',operation:'restoreBase',input:{side}});if(receipt.result?.result?.nativeReceipt?.state!=='CONSUMER_APPLIED')throw fail('LORA_BASE_RESTORE_UNCONFIRMED','LoRA owner did not confirm base restoration.');appliedSides.delete(side);if(lora)delete lora[side];check(r);}
  const retainedFeeds=new Map([...feeds].map(([side,feedId])=>[feedId,{side}]));
  for(const feed of manager.inspect().weightFeeds??[])retainedFeeds.set(feed.feedId,{side:feed.binding?.side,cleanupRequired:feed.cleanupRequired});
  for(const [feedId,feed]of retainedFeeds){progress(r,'lora-close-'+feed.side);await manager[feed.cleanupRequired?'retryCloseWeightFeed':'closeWeightFeed'](feedId);for(const [side,id]of feeds)if(id===feedId)feeds.delete(side);check(r);}
  lora=null;restorationRequired=false;
 }
 async function applyLoraInternal(r,value){
  const selections=loraSelection(value);await clearLora(r);check(r);
  const requested=sides.filter(side=>selections[side]?.length);if(!requested.length)return {applied:false};
  for(const side of requested){progress(r,'lora-open-'+side);const feed=await manager.openWeightFeed({side});feeds.set(side,feed.feedId);lora??={};restorationRequired=true;check(r);}
  await manager.configureModule('lora',{feedIds:Object.fromEntries(feeds)});check(r);
  for(const side of requested){
   for(const selection of selections[side]){progress(r,'lora-register-'+side+'-'+selection.pairId);await manager.execute({moduleId:'lora',operation:'register',input:{side,pairId:selection.pairId,file:selection.file}});check(r);}
   lora[side]=selections[side].map(({pairId,strength})=>({pairId,strength}));progress(r,'lora-apply-'+side);appliedSides.add(side);
   const receipt=await manager.execute({moduleId:'lora',operation:'apply',input:{side,selections:selections[side].map(({pairId,strength})=>({pairId,strength})),...(controlOnly?.loraTargetsBySide?.[side]?{targets:copy(controlOnly.loraTargetsBySide[side])}:{})}});check(r);
   if(receipt.result?.result?.nativeReceipt?.state!=='CONSUMER_APPLIED')throw fail('LORA_APPLICATION_UNCONFIRMED','LoRA owner did not confirm model application.');
  }
  restorationRequired=false;return {applied:true,sides:copy(lora)};
 }
 function requireConfigured(){if(!configured)throw fail('MODEL_LOAD_REQUIRED','Select and load the model bundles before running.');const observation=manager.inspect().modules?.diffusion?.observation;if(observation?.loaded===false){configured=false;throw fail('MODEL_RELOAD_REQUIRED','The Diffusion owner requires model reload.');}}
 const requireLoraRestored=()=>{if(restorationRequired)throw fail('LORA_RESTORE_REQUIRED','The LoRA application is incomplete. Remove LoRA or recover/reload the model before generation.');};
 const applyLora=value=>operation('applying-lora',async r=>{requireConfigured();requireLoraRestored();return applyLoraInternal(r,value);});
 const removeLora=()=>operation('removing-lora',async r=>{await clearLora(r);return {removed:true};});
 async function runInternal(r,input){
  requireConfigured();requireLoraRestored();result=null;resultTensor=null;
  if(typeof input.prompt!=='string'||typeof(input.negativePrompt??'')!=='string')throw fail('PROMPT_REQUIRED','Prompt and negative prompt must be text.');
  if(input.seed!==undefined&&input.seed!==null&&input.seed!=='')throw fail('SEED_UNSUPPORTED','The adopted model owner has no seed-to-noise generator. Select a zero initial value or a noise file.');
  const native=await owner();check(r);const capabilities=native.describeExecutionCapabilities(),capability=capabilities.operations.sample,schedule=capability.schedule;
  if((input.steps??schedule.steps)!==schedule.steps||(input.guidance??schedule.cfg)!==schedule.cfg)throw fail('SCHEDULE_UNSUPPORTED','The adopted sampler supports only '+schedule.steps+' Euler steps and CFG '+schedule.cfg+'.');
  const target={batch:1,...input.target};if(['width','height','frames'].some(key=>!Number.isSafeInteger(target[key])||target[key]<1))throw fail('TARGET_REQUIRED','Width, height and frames must be positive integers.');
  progress(r,'owner-support');
  const textCaps=await manager.query({moduleId:'text',operation:'encode',input:{text:input.prompt}});check(r);requireSupport(textCaps.support??textCaps,'Text');
  const negativeCaps=await manager.query({moduleId:'text',operation:'encode',input:{text:input.negativePrompt??''}});check(r);requireSupport(negativeCaps.support??negativeCaps,'Text');
  const vaeCaps=await manager.query({moduleId:'vae'});check(r);
  // These are declarations from the fixed Wan21 VAE owner (vae-api/vae-stream),
  // supplied to the shared shape owner. No local compression formula is used.
  const geometry={...capability.geometry,rgbChannels:3,temporalCompression:4,spatialCompression:[8,8],temporalRule:'first-then-groups-floor',paddingMode:'unsupported'};
  const normalization=capability.output.latentContract.normalization.id;
  const shapeRequest={schemaVersion:1,ruleId:capability.workflowRuleId??BERNINI_WORKFLOW_RULE_ID,target,refMaxSize:input.refMaxSize??vaeCaps.domain?.maxSpatial??848,geometry,
   semantics:{'target-latent':{meaning:'bernini-generated-model-latent:v1',normalization},...Object.fromEntries(['source','reference','context'].map(role=>[role+'-latent',{meaning:capability.contexts.predictMeaning,normalization}]))},
   media:{sourceVideo:copy(input.media?.source?.supply??absent()),referenceVideo:copy(input.media?.reference?.supply??absent()),slots:[]}};
  const canonical=deriveWorkflowShapes(shapeRequest),requirements=new Map(canonical.requirements.map(q=>[q.requirementId,q])),latent=requirements.get('target.latent');
  const declaredText=caps=>({...copy(caps.output),shape:copy(caps.inputModes['plain-text'].outputShape),modelSha256:caps.modelSha256,tokenizerSha256:caps.tokenizerSha256,attentionMask:{dtype:'uint8',shape:[caps.inputModes['plain-text'].outputShape[1]]}});
  const targetDescriptor={requirementId:'target.latent',dtype:geometry.dtype,layout:'NCTHW',shape:copy(latent.shape),meaning:shapeRequest.semantics['target-latent'].meaning,normalization};
  const contextDescriptors=canonical.orderedContexts.entries.map(entry=>({requirementId:entry.contextKey+'.latent',dtype:'float32',layout:'NCTHW',shape:copy(entry.latentShape),meaning:vaeCaps.encode.output.meaning,modelSha256:vaeCaps.model.sha256}));
  const descriptor={operation:'sample',shapeRequest,inputs:{noise:{dtype:'float32',shape:copy(latent.shape)},positive:declaredText(textCaps),negative:declaredText(negativeCaps),...(contextDescriptors.length?{tensors:[targetDescriptor,...contextDescriptors]}:{})}};
  lastSupport=native.checkExecutionSupport(descriptor);requireSupport(lastSupport,'Diffusion');check(r);
  const generated={...copy(capability.output),shape:copy(latent.shape),latentContract:{schemaVersion:1,representation:'generated-sample',space:'raw',vaeModelSha256:vaeCaps.model.sha256,producerModelSha256s:sides.map(side=>capabilities.models[side]),normalization:copy(capability.output.latentContract.normalization)}};
  const decodeSupport=await manager.query({moduleId:'vae',operation:'decode',input:generated});check(r);requireSupport(decodeSupport.support??decodeSupport,'VAE decode');
  // RGB tail reduction is never advertised as the requested frame count.
  if(!decodeSupport.decode?.output?.shape?.every((value,index)=>value===[1,3,target.frames,target.height,target.width][index]))throw fail('VAE_TARGET_MISMATCH','The VAE owner does not declare the exact requested output shape.');
  const rgbInputs=[];
  for(const entry of canonical.orderedContexts.entries){
   const requirement=requirements.get(entry.contextKey+'.rgb'),facts=entry.contextKey==='source'?input.media.source:input.media.reference,rgb=facts?.nativeTensor?tensorMetadata(facts.nativeTensor):{dtype:'float32',layout:'NCTHW',meaning:'rgb-unit',shape:copy(requirement.shape)};
   const support=await manager.query({moduleId:'vae',operation:'encode',input:rgb});check(r);requireSupport(support.support??support,'VAE encode');
   rgbInputs.push({entry,requirement,facts});
  }
  const mode=input.noise?.mode;if(!['zeros','file'].includes(mode))throw fail('NOISE_MODE_UNSUPPORTED','Choose a zero initial value or a noise file.');
  const runId='product:'+ ++serial+':'+crypto.randomUUID(),noiseRef=runId+':noise';let noise;
  if(mode==='file'){if(!(input.noise.file instanceof Blob))throw fail('NOISE_FILE_REQUIRED','Select a native noise tensor file.');progress(r,'read-noise');const record=await manager.importTensor(noiseRef,input.noise.file);check(r);requireSupport(native.checkExecutionSupport({...descriptor,inputs:{...descriptor.inputs,noise:tensorMetadata(record.tensor)}}),'Diffusion noise');noise={$ref:noiseRef,path:'tensor.data'};}
  else noise=new Float32Array(latent.shape.reduce((a,b)=>a*b,1));
  const steps=[{stepId:'positive',moduleId:'text',operation:'encode',input:{text:input.prompt},outputRef:runId+':positive'},{stepId:'negative',moduleId:'text',operation:'encode',input:{text:input.negativePrompt??''},outputRef:runId+':negative'}];
  for(let index=0;index<rgbInputs.length;index++){
   const {entry,requirement,facts}=rgbInputs[index];progress(r,'prepare-media-'+entry.contextKey);
   const tensor=await prepareMedia(facts,{requirement,signal:r.controller.signal});check(r);
   steps.push({stepId:'context-'+index,moduleId:'vae',operation:'encode',input:tensor,outputRef:runId+':context:'+index});
  }
  if(input.loraSelections!==undefined)await applyLoraInternal(r,input.loraSelections);check(r);
  const tensors=rgbInputs.length?[{...targetDescriptor,data:new Float32Array(latent.shape.reduce((a,b)=>a*b,1))},...rgbInputs.map(({entry},index)=>({$ref:runId+':context:'+index,path:'tensor',requirementId:entry.contextKey+'.latent'}))]:undefined;
  steps.push({stepId:'sample',moduleId:'diffusion',operation:'sample',input:{shapeRequest,noise,positive:{$ref:runId+':positive',path:'tensor'},negative:{$ref:runId+':negative',path:'tensor'},...(tensors?{tensors}:{})},outputRef:runId+':sample'},
   {stepId:'decode',moduleId:'vae',operation:'decode',input:{$ref:runId+':sample',path:'tensor'},outputRef:runId+':decoded'});
  lastSettings={prompt:input.prompt,negativePrompt:input.negativePrompt??'',target,steps:schedule.steps,guidance:schedule.cfg,noise:{mode,fileReselectionRequired:mode==='file'},refMaxSize:shapeRequest.refMaxSize};
  progress(r,'generation');const route=await manager.executeRoute({steps,workflowShapeRequest:shapeRequest,finalRefs:[runId+':decoded']});check(r);
  const decoded=route.steps.find(step=>step.stepId==='decode').response.tensor;resultTensor=copy(decoded);result={ref:runId+':decoded',sampleRef:runId+':sample',shape:copy(decoded.shape),meaning:decoded.meaning,noiseMode:mode,seedReproducibility:false};
  return {status:'EXECUTION_COMPLETED',tensor:copy(decoded),result:copy(result),generationReady:false,controlTestOnly:!!controlOnly};
 }
 const run=input=>operation('run',r=>runInternal(r,input??{}));
 async function reload(){live();if(active)await cancel();if(!configuration)throw fail('MODEL_SELECTION_REQUIRED','Select the model files again.');return operation('reloading',async r=>{configured=false;progress(r,'model-unload');await manager.execute({moduleId:'diffusion',operation:'unload',input:{}});check(r);feeds.clear();appliedSides.clear();lora=null;await configureOwners(r,configuration);return inspect();});}
 async function recover(){live();if(active)await cancel();return operation('recovering',async r=>{configured=false;await manager.recover();check(r);feeds.clear();appliedSides.clear();lora=null;if(configuration){await configureOwners(r,configuration);}return inspect();});}
 async function saveResult(){live();if(active)throw fail('PRODUCT_BUSY','Wait for the operation terminal before saving.');if(!result)throw fail('RESULT_REQUIRED','No completed result is available.');return {blob:await manager.saveTensor(result.ref),filename:'generated-result.wktensor'};}
 async function saveArtifact(ref,{filename='native-tensor.wktensor'}={}){live();if(active)throw fail('PRODUCT_BUSY','Wait for the operation terminal before saving.');return {blob:await manager.saveTensor(ref),filename};}
 function saveInput(value,{kind='input'}={}){return operation('saving-input',async r=>{const tensor=await prepareMedia(value,{signal:r.controller.signal});check(r);const {createCurrentTextVaeCodec}=await import('./adapters/text-vae-standalone/native.mjs'),codec=await createCurrentTextVaeCodec();check(r);const bytes=await codec.encode(tensor);check(r);const blob=new Blob([bytes],{type:'application/octet-stream'}),ref='product:input:'+crypto.randomUUID();await manager.importTensor(ref,blob);check(r);return {blob,filename:(['source','reference'].includes(kind)?kind:'input')+'.wktensor',ref,tensor:copy(tensor)};});}
 function readTensor(file){return operation('reading-tensor',async r=>{const ref='product:read:'+crypto.randomUUID(),record=await manager.importTensor(ref,file);check(r);return {ref,tensor:copy(record.tensor)};});}
 async function saveWorkspace({formSettings:requestedSettings}={}){live();if(active)throw fail('PRODUCT_BUSY','Wait for the operation terminal before saving.');if(requestedSettings!==undefined)formSettings=copy(requestedSettings);return manager.saveWorkspace({workspaceSettings:{product:{schemaVersion:1,result:copy(result),settings:copy(lastSettings),formSettings:copy(formSettings)}}});}
 function restoreWorkspace(file){return operation('restoring',async r=>{const restored=await manager.restoreWorkspace(file);check(r);configured=false;configuration=null;feeds.clear();appliedSides.clear();lora=null;restorationRequired=false;resultTensor=null;const saved=restored.workspaceSettings?.product;lastSettings=copy(saved?.settings??null);formSettings=copy(saved?.formSettings??null);result=saved?.result&&restored.artifactRefs.includes(saved.result.ref)?copy(saved.result):null;if(result){const blob=await manager.saveTensor(result.ref);check(r);const {createCurrentTextVaeCodec}=await import('./adapters/text-vae-standalone/native.mjs'),codec=await createCurrentTextVaeCodec(),tensor=await codec.decode(new Uint8Array(await blob.arrayBuffer()));check(r);const metadata=manager.inspect().artifacts.find(item=>item.ref===result.ref)?.descriptor.native.metadata;resultTensor={...copy(metadata??tensor),data:copy(tensor.data)};}return {...restored,settings:copy(lastSettings),formSettings:copy(formSettings),result:copy(result),tensor:copy(resultTensor)};});}
 async function dispose(){if(disposed)return {disposed:true};if(active)await cancel();await manager.dispose();disposed=true;configured=false;state='disposed';resultTensor=null;feeds.clear();appliedSides.clear();unsubscribe();emit();listeners.clear();return {disposed:true};}
 return Object.freeze({configure,run,cancel,reload,recover,applyLora,removeLora,saveWorkspace,restoreWorkspace,saveResult,saveArtifact,saveInput,readTensor,getResult:()=>copy(resultTensor),inspect,dispose,subscribe(fn){if(typeof fn!=='function')throw TypeError('Listener required');listeners.add(fn);try{fn(inspect());}catch{}return()=>listeners.delete(fn);}});
}

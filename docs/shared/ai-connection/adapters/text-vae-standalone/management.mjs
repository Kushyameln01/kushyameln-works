/** Ordinary Text/VAE ingress over exact native factories and shared management
 * queue. No oracle, numerical gate, fixed prompt or receipt is an input. */
import {createInvocationQueue} from '../../queue.mjs';
import {ADOPTED_TEXT_VAE_SOURCE,createTextEncoderModule,createVaeModule,createInferenceClient,describeTensor,requireTensor,requiredStreamAssets,inspectTextVaeStandaloneAdoption} from './native.mjs';
export {encodeTensor,decodeTensor,describeTensor,readTextVaeConfigurationManifest,inspectTextVaeStandaloneAdoption} from './native.mjs';
const clone=structuredClone,fail=(code,message)=>Object.assign(Error(message),{code});
const same=(a,b)=>{if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));};
function configurationCopy(value){if(!value?.manifest||!(value.files instanceof Map)||value.diagnostics!==undefined&&value.diagnostics!==false)throw TypeError('Parsed manifest, local files Map and diagnostics:false required');return {manifest:clone(value.manifest),files:new Map([...value.files].map(([k,v])=>[k,v instanceof Uint8Array?new Uint8Array(v):v])),diagnostics:false};}
function snapshotInput(input){
 // structuredClone owns ordinary buffers, but intentionally keeps SAB storage
 // shared. Replace those buffers/views before any queued asynchronous boundary.
 const seen=new WeakMap(),shared=value=>typeof SharedArrayBuffer==='function'&&value instanceof SharedArrayBuffer;
 function own(value){
  if(!value||typeof value!=='object')return value;if(seen.has(value))return seen.get(value);
  let result=value;
  if(shared(value)){result=new Uint8Array(new Uint8Array(value)).buffer;seen.set(value,result);return result;}
  if(ArrayBuffer.isView(value)){if(shared(value.buffer))result=value instanceof DataView?new DataView(new Uint8Array(new Uint8Array(value.buffer,value.byteOffset,value.byteLength)).buffer):new value.constructor(value);seen.set(value,result);return result;}
  if(value instanceof Map){result=new Map();seen.set(value,result);for(const [key,item] of value)result.set(own(key),own(item));return result;}
  if(value instanceof Set){result=new Set();seen.set(value,result);for(const item of value)result.add(own(item));return result;}
  seen.set(value,result);for(const key of Object.keys(value))value[key]=own(value[key]);return result;
 }
 return own(clone(input));
}

export async function createTextVaeStandaloneManagement({kind,configuration,onProgress,controlOnly}={}){
 if(!['text','vae'].includes(kind)||onProgress!==undefined&&typeof onProgress!=='function'||controlOnly!==undefined&&(!controlOnly||typeof controlOnly.clientFactory!=='function'||Object.keys(controlOnly).some(k=>k!=='clientFactory')))throw TypeError('Text/VAE kind, optional progress callback and explicit control-only client factory required');
 const ownerId='text-vae:'+kind+':'+crypto.randomUUID(),bindingId=ownerId+':executor',records=new Map(),listeners=new Set(),observerErrors=[];
 let config=configurationCopy(configuration),native=null,queue=null,revision=0,generation=0,disposed=false,disposalRequested=false,reconfiguring=false,cleanupPending=false,active=null,currentResult=null,progress=null,lifecycle=Promise.resolve(),disposal=null;
 const resourceGeneration=()=>ownerId+':'+generation;
 const live=()=>{if(disposalRequested)throw fail('TEXT_VAE_DISPOSED','Text/VAE management disposal requested');if(reconfiguring)throw fail('TEXT_VAE_RECONFIGURING','Text/VAE management reconfiguring');if(cleanupPending)throw fail('TEXT_VAE_RECOVERY_REQUIRED','Native cleanup recovery required');};
 function callObserver(fn,value){try{fn?.(clone(value));}catch(error){observerErrors.push(String(error.message??error));}}
 const current=r=>!!r&&active===r&&!r.settled&&!r.cancelRequested&&!r.signal?.aborted&&r.target.revision===revision&&!disposalRequested;
 function notify(record=progress!==null?active:null){const state=inspect();for(const fn of listeners){if(record&&!current(record))break;callObserver(fn,state);}}
 function stateChanged(state){const r=active;if(!current(r))return;progress=clone(state.progress??null);const event={kind,target:clone(r.target),...clone(state)};callObserver(onProgress,event);if(!current(r))return;callObserver(r.onProgress,event);if(current(r))notify(r);}
 function ensureNative(){
  if(native)return native;
  const client=controlOnly?controlOnly.clientFactory({onState:stateChanged}):createInferenceClient({onState:stateChanged});
  const module=(kind==='text'?createTextEncoderModule:createVaeModule)({client,ownsClient:true});
  try{module.configure(config);}catch(error){try{module.dispose();}catch{cleanupPending=true;}throw error;}
  native=module;return module;
 }
 function recordFor(target){const r=records.get(target?.requestId);if(!r||!same(r.target,target))throw fail('TARGET_MISMATCH','Exact current Text/VAE target required');return r;}
 function makeQueue(){
  queue=createInvocationQueue({resourceBindings:[{bindingId,ownerId,resourceGeneration:resourceGeneration(),
   async cancel(target){const r=recordFor(target);if(!r.native||!r.nativeStarted)return {stopped:true};if(!r.settled&&r.native.cancel()!==true)return {stopped:false};return {stopped:true};},
   async afterTerminal(_target,outcome){return {reusable:outcome.originalTerminal===true};},
   async release(target){const r=recordFor(target);if(!r.native)return;try{r.native.dispose();if(native===r.native)native=null;r.native=null;}catch(error){cleanupPending=true;throw error;}}
  }]});
 }
 function query({operation,input}={}){live();return clone(ensureNative().capabilities(operation===undefined?undefined:{operation,input}));}
 function validateResult(result,input,operation,caps,module){
  requireTensor(result?.tensor);const t=result.tensor;
  if(kind==='text'){
   const L=input.text!==undefined?512:input.tokenIds.length,mask=input.attentionMask;
   if(t.dtype!=='float32'||t.layout!=='BLC'||t.meaning!=='text_hidden_states'||!same(t.shape,[1,L,4096])||t.modelSha256!==caps.modelSha256||t.tokenizerSha256!==caps.tokenizerSha256||t.normalization!==caps.output.normalization||!(t.attentionMask instanceof Uint8Array)||!same(t.attentionMask,result.attentionMask)||mask&&!same(Array.from(mask),Array.from(t.attentionMask))||result.inputMode!==(input.text!==undefined?'plain-text':'token-ids'))throw fail('TEXT_VAE_RESULT_MISMATCH','Text result differs from its native input/output contract');
  }else{
   const b=result.binding,expected=caps[operation].output,roles=config.manifest.kind==='wan21-vae-stream-v1'?requiredStreamAssets(config.manifest,operation):operation==='encode'?['encoder']:['decoderBody','conv2Weight','conv2Bias'],hashes=Object.fromEntries(roles.map(role=>[role,config.manifest.assets[role].sha256]));
   if(!same(result.inputDescriptor,describeTensor(input))||!b||b.operation!==operation||b.assetsVerified!==true||b.graphMetadataChecked!==true||!same(b.inputShape,input.shape)||!same(b.outputShape,expected.shape)||!same(b.assetHashes,hashes)||!same(t.shape,expected.shape)||t.dtype!==expected.dtype||t.layout!==expected.layout||t.meaning!==expected.meaning||t.modelSha256!==caps.model.sha256||!same(module.capabilities().runtime?.[operation],{verified:true,...b}))throw fail('TEXT_VAE_RESULT_MISMATCH','VAE result differs from actual configured native assets/input/output binding');
   if(config.manifest.kind==='wan21-vae-stream-v1'){
    const p=caps.processing,f=t.frameProcessing,carried=operation==='decode'?input.frameProcessing:null;
    if(b.kind!==config.manifest.kind||b.executionProvider!==caps.inference.executionProvider||b.threads!==caps.inference.threads||!same(result.processing,p)||!f||(carried?!same(f,carried):f.sourceFrames!==p.sourceFrames||f.latentFrames!==p.latentFrames||f.consumedFrames!==p.consumedFrames||f.unusedTailFrames!==p.ignoredTailFrames)||operation==='encode'&&input.context&&!same(f.sourceContext,input.context))throw fail('TEXT_VAE_RESULT_MISMATCH','Stream VAE result lost its actual inference settings or native causal processing');
   }
  }
 }
 async function execute({operation,input,requestId=crypto.randomUUID(),signal,onProgress:requestProgress}={}){
  live();signal?.throwIfAborted();if(typeof requestId!=='string'||!requestId||requestProgress!==undefined&&typeof requestProgress!=='function')throw TypeError('Nonempty requestId and optional progress callback required');
  if(records.has(requestId))throw fail('DUPLICATE_REQUEST','Request ID already pending');
  const owned=snapshotInput(input),selectedRevision=revision,caps=query({operation,input:owned});
  if(caps.support?.supported!==true)throw Object.assign(fail(caps.support?.code??'TEXT_VAE_UNSUPPORTED',caps.support?.reason??'Native operation unsupported'),{support:caps.support});
  const target={invocationId:crypto.randomUUID(),bindingId,ownerId,resourceGeneration:resourceGeneration(),requestId,revision,activeToken:crypto.randomUUID()},r={target,onProgress:requestProgress,native:null,settled:false};records.set(requestId,r);
  const selectedQueue=queue;let abortListener;
  try{
   const pending=selectedQueue.enqueue({id:target.invocationId,requestId,ownerId,resourceBinding:bindingId,resourceGeneration:target.resourceGeneration,revision,activeToken:target.activeToken},async context=>{
    context.signal.throwIfAborted();if(selectedRevision!==revision)throw fail('TEXT_VAE_STALE','Configuration superseded this request');
    active=r;r.signal=context.signal;progress=null;r.native=ensureNative();notify(r);
    try{context.signal.throwIfAborted();r.nativeStarted=true;const result=await r.native[operation](owned);context.signal.throwIfAborted();if(selectedRevision!==revision||disposalRequested)throw fail('TEXT_VAE_STALE','Result superseded by configuration or disposal');validateResult(result,owned,operation,caps,r.native);return result;}
    finally{r.settled=true;if(active===r)active=null;progress=null;}
   });
   abortListener=()=>{r.cancelRequested=true;progress=null;void selectedQueue.cancelInvocation(target.invocationId,target).catch(()=>{});};signal?.addEventListener('abort',abortListener,{once:true});if(signal?.aborted)abortListener();
   const result=await pending;if(selectedRevision!==revision||disposalRequested)throw fail('TEXT_VAE_STALE','Result superseded before publication');
   const terminal=selectedQueue.inspect().invocations.find(v=>v.id===target.invocationId);currentResult={requestId,target:clone(target),configurationRevision:revision};
   return {status:'EXECUTION_COMPLETED',tensor:result.tensor,result,target:clone(target),terminal:clone(terminal),sourceRef:clone(ADOPTED_TEXT_VAE_SOURCE),controlOnly:!!controlOnly,generationReady:false};
  }finally{signal?.removeEventListener('abort',abortListener);records.delete(requestId);notify();}
 }
 async function cancel(target){live();const r=recordFor(target);r.cancelRequested=true;progress=null;return queue.cancelInvocation(r.target.invocationId,target);}
 async function closeNative(){if(native){native.dispose();native=null;}}
 function serialize(work){const pending=lifecycle.then(work);lifecycle=pending.catch(()=>{});return pending;}
 async function configure(value){
  live();const next=configurationCopy(value),candidate=(kind==='text'?createTextEncoderModule:createVaeModule)();
  // Native configure validation is NN0/Worker0. Reject malformed selection
  // before retiring the working configuration or cancelling its current job.
  try{candidate.configure(next);}finally{candidate.dispose();}
  reconfiguring=true;revision++;currentResult=null;progress=null;return serialize(async()=>{
   try{await queue.dispose();await closeNative();if(disposalRequested)throw fail('TEXT_VAE_DISPOSED','Disposal superseded configuration');config=next;generation++;makeQueue();ensureNative();return inspect();}catch(error){if(error.code!=='TEXT_VAE_DISPOSED')cleanupPending=true;throw error;}finally{reconfiguring=disposalRequested&&!disposed;notify();}
  });
 }
 async function recover(){
  if(disposalRequested)throw fail('TEXT_VAE_DISPOSED','Text/VAE management disposal requested');if(reconfiguring)throw fail('TEXT_VAE_RECONFIGURING','Configuration change in progress');reconfiguring=true;revision++;currentResult=null;progress=null;
  return serialize(async()=>{try{await queue.dispose();await closeNative();if(disposalRequested)throw fail('TEXT_VAE_DISPOSED','Disposal superseded recovery');cleanupPending=false;generation++;makeQueue();ensureNative();return {recovered:true,resourceReleased:true,observation:inspect()};}catch(error){if(error.code!=='TEXT_VAE_DISPOSED')cleanupPending=true;throw error;}finally{reconfiguring=disposalRequested&&!disposed;notify();}});
 }
 async function dispose(){
  if(disposal)return disposal;if(disposed&&!cleanupPending)return {disposed:true};disposalRequested=true;reconfiguring=true;revision++;currentResult=null;progress=null;
  disposal=serialize(async()=>{try{await queue.dispose();await closeNative();config=null;cleanupPending=false;disposed=true;return {disposed:true};}catch(error){cleanupPending=true;throw error;}finally{reconfiguring=false;notify();}});
  try{return await disposal;}finally{disposal=null;}
 }
 function inspect(){return {kind,ownerId,configurationRevision:revision,resourceGeneration:resourceGeneration(),sourceRef:clone(ADOPTED_TEXT_VAE_SOURCE),apiVersion:'works-ai-1',controlOnly:!!controlOnly,configured:!!config,localFileBindings:config?.files.size??0,disposed,disposalRequested,reconfiguring,recoveryRequired:cleanupPending||!disposed&&queue?.inspect().groups.some(g=>g.quarantined)===true,activeTarget:clone(active?.target??null),targets:[...records.values()].map(r=>clone(r.target)),currentResult:clone(currentResult),progress:clone(progress),queue:queue?.inspect()??null,observerErrors:[...observerErrors],generationReady:false};}
 makeQueue();try{ensureNative();}catch(error){try{await closeNative();}catch{}throw error;}
 return Object.freeze({execute,query,configure,cancel,recover,dispose,inspect,subscribe(listener){if(typeof listener!=='function')throw TypeError('Listener function required');listeners.add(listener);callObserver(listener,inspect());return()=>listeners.delete(listener);},adoption:inspectTextVaeStandaloneAdoption()});
}

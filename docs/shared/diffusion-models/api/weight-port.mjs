/** Explicit duplex transport for externally completed F32 weights. No low-rank
 * arithmetic or public inference-queue reentry takes place in this module. */
export const WEIGHT_PORT_PROTOCOL='diffusion-weight-port/1';
const CONTRACT='lora-standalone/1.0-draft.1';
const MAX_BLOCK_ELEMENTS=1048576;
const typed=Object.getPrototypeOf(Float32Array.prototype),slots=Object.fromEntries(['buffer','byteOffset','byteLength','length'].map(key=>[key,Object.getOwnPropertyDescriptor(typed,key).get]));
const nativeBufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get,nativeSet=Float32Array.prototype.set;
const error=(code,message)=>Object.assign(Error(message),{code});
const wireError=e=>({code:e?.code??'WEIGHT_PORT_ERROR',message:String(e?.message??e)});
const revive=e=>error(e?.code??'WEIGHT_PORT_ERROR',e?.message??'Weight port failed');
const checkSignal=signal=>{if(signal!==undefined&&!(signal instanceof AbortSignal))throw TypeError('Native AbortSignal required');signal?.throwIfAborted();};
function context(value={}){
 if(!value||typeof value!=='object')throw TypeError('Weight transaction context required');
 const out={};for(const key of Reflect.ownKeys(value)){
  const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!d.enumerable||!Object.hasOwn(d,'value'))throw TypeError('Plain weight context fields required');
  if(key==='signal'||key==='isCurrent')continue;
  if(typeof d.value==='function')throw TypeError('Only signal/isCurrent may be local callbacks');out[key]=structuredClone(d.value);
 }
 return out;
}
function guard(ctx={}){checkSignal(ctx.signal);if(ctx.isCurrent!==undefined&&(typeof ctx.isCurrent!=='function'||ctx.isCurrent()!==true))throw error('STALE_CONTEXT','Weight context is no longer current');}
function range(offset,count){if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(count)||count<1||count>MAX_BLOCK_ELEMENTS)throw error('WEIGHT_RANGE_INVALID','Owned F32 block exceeds its declared range or 1048576-element transport limit');}
function block(data,count){
 const fail=()=>{throw error('INVALID_WEIGHT_BLOCK','Compact owned finite F32 block required');};
 if(Object.getPrototypeOf(data??{})!==Float32Array.prototype)fail();
 try{const buffer=slots.buffer.call(data);if(Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||slots.byteOffset.call(data)!==0||slots.byteLength.call(data)!==nativeBufferLength.call(buffer)||slots.length.call(data)!==count)fail();}catch{fail();}
 const copy=new Float32Array(count);nativeSet.call(copy,data);for(let i=0;i<count;i++)if(!Number.isFinite(copy[i]))fail();return copy;
}

/** Independent requests on both directions are essential: package.readBlock may
 * ask the opposite peer's immutable baseProvider while prepare/validate waits. */
export function createWeightPortRPC(port,{handlers={},onClose=()=>{},isCurrent=()=>true,maxPending=16}={}){
 if(!(port instanceof MessagePort))throw TypeError('Explicit MessagePort required');
 let live=true,serial=0;const pending=new Map(),incoming=new Map(),prefix=crypto.randomUUID();
 function current(){if(!live||isCurrent()!==true)throw error('WEIGHT_PORT_CLOSED','Weight port or model session is no longer current');}
 function send(value){current();port.postMessage({protocol:WEIGHT_PORT_PROTOCOL,...value});}
 function close(reason=error('WEIGHT_PORT_CLOSED','Weight port closed'),{notify=true}={}){
  if(!live)return;live=false;
  if(notify)try{port.postMessage({protocol:WEIGHT_PORT_PROTOCOL,kind:'closed',error:wireError(reason)});}catch{}
  for(const entry of pending.values()){entry.detach();entry.reject(reason);}pending.clear();
  for(const controller of incoming.values())controller.abort(reason);incoming.clear();
  port.removeEventListener('message',receive);port.removeEventListener('messageerror',broken);port.close();
  try{Promise.resolve(onClose(reason)).catch(()=>{});}catch{}
 }
 const broken=()=>close(error('WEIGHT_PORT_UNREADABLE','Unreadable weight message'));
 async function receive({data:q}){
  if(!q||q.protocol!==WEIGHT_PORT_PROTOCOL)return;
  if(q.kind==='closed'){close(revive(q.error),{notify:false});return;}
  if(q.kind==='cancel'){incoming.get(q.id)?.abort(error('ABORTED','Remote weight call aborted'));return;}
  if(q.kind==='reply'){
   const entry=pending.get(q.id);if(!entry)return;pending.delete(q.id);entry.detach();
   q.ok?entry.resolve(q.value):entry.reject(revive(q.error));return;
  }
  if(q.kind!=='call'||typeof q.id!=='string'||typeof q.method!=='string'||!Array.isArray(q.args))return;
  const controller=new AbortController();
  try{
   current();if(incoming.has(q.id)||incoming.size>=maxPending)throw error('WEIGHT_PORT_BUSY','Too many concurrent weight calls');
   if(!Object.hasOwn(handlers,q.method)||typeof handlers[q.method]!=='function')throw error('UNSUPPORTED_WEIGHT_METHOD','Unsupported weight port method');
   incoming.set(q.id,controller);
   const value=await handlers[q.method](q.args,{signal:controller.signal});controller.signal.throwIfAborted();current();send({kind:'reply',id:q.id,ok:true,value});
  }catch(cause){if(live)try{send({kind:'reply',id:q.id,ok:false,error:wireError(cause)});}catch{close(cause);}}
  finally{if(incoming.get(q.id)===controller)incoming.delete(q.id);}
 }
 port.addEventListener('message',receive);port.addEventListener('messageerror',broken);port.start();
 function call(method,args=[],{signal}={}){
  try{current();checkSignal(signal);if(pending.size>=maxPending)throw error('WEIGHT_PORT_BUSY','Too many pending weight calls');}catch(cause){return Promise.reject(cause);}
  return new Promise((resolve,reject)=>{
   const id=prefix+':'+(++serial),abort=()=>{const entry=pending.get(id);if(!entry)return;pending.delete(id);entry.detach();try{send({kind:'cancel',id});}catch{}reject(signal.reason??error('ABORTED','Weight call aborted'));};
   const detach=()=>signal?.removeEventListener('abort',abort);pending.set(id,{resolve,reject,detach});signal?.addEventListener('abort',abort,{once:true});
   try{send({kind:'call',id,method,args});}catch(cause){pending.delete(id);detach();reject(cause);}
  });
 }
 return Object.freeze({call,close,isValid:()=>live&&isCurrent()===true,stats:()=>({pending:pending.size,incoming:incoming.size,closed:!live})});
}

/** Worker side. The feed retains independently owned completed package leases.
 * Every mutation uses its own context; no function crosses structured clone. */
export function attachDiffusionWeightServer(port,feed,{isCurrent=()=>true,binding={},onInvalidated=()=>{}}={}){
 if(!feed?.consumer||!feed?.baseProvider)throw TypeError('Full-model weight feed required');
 const candidates=new Map(),candidatePackages=new Map(),preparations=new Map(),cancelledPackages=new Set();let rpc,disposed=false,graceful=false,publishedEpoch=null;
 const localContext=(metadata,signal)=>({...metadata,signal,isCurrent:()=>!disposed&&rpc.isValid()&&!signal.aborted&&isCurrent()===true});
 const epoch=()=>feed.consumer.currentEpoch();
 const answer=value=>({value,epoch:epoch()});
 function candidate(id){const value=candidates.get(id);if(!value)throw error('STALE_WEIGHT_CANDIDATE','Unknown or released weight candidate');return value;}
 async function discardCandidate(id,value,metadata={}){
  const cleanupContext={...metadata,isCurrent:()=>true};
  await feed.consumer.rollback(value,cleanupContext);await feed.consumer.releaseCandidate?.(value,cleanupContext);
  if(id!==undefined){candidates.delete(id);candidatePackages.delete(id);}
 }
 function packageProxy(packageId,manifest){
  let refs=1,ended=false;
  function cap(){let released=false;const valid=()=>!released&&!ended&&rpc.isValid();return Object.freeze({
   describe(){if(!valid())throw error('WEIGHT_PACKAGE_RELEASED','Remote package released');return structuredClone(manifest);},
   isValid:valid,
   retain(ownerId){if(!valid()||typeof ownerId!=='string'||!ownerId)throw error('WEIGHT_PACKAGE_RELEASED','Valid remote package and owner required');refs++;return cap();},
   async readBlock(weightId,offset,count,ctx={}){if(!valid())throw error('WEIGHT_PACKAGE_RELEASED','Remote package released');guard(ctx);range(offset,count);const value=await rpc.call('package.readBlock',[packageId,weightId,offset,count,context(ctx)],{signal:ctx.signal});guard(ctx);if(!valid())throw error('WEIGHT_PACKAGE_RELEASED','Remote package released during read');return block(value,count);},
   async release(){if(released)return;released=true;if(--refs===0&&!ended){ended=true;if(rpc.isValid())await rpc.call('package.release',[packageId]);}},
   stats:()=>({references:refs,released:ended,remote:true})
  });}return cap();
 }
 const handlers={
  describe:async()=>answer({...feed.describe(),binding}),
  'base.describe':async()=>answer(await feed.baseProvider.describe()),
  'base.readBlock':async([weightId,offset,count,metadata],{signal})=>{range(offset,count);return answer(block(await feed.baseProvider.readBlock(weightId,offset,count,localContext(metadata,signal)),count));},
  'consumer.describe':async()=>answer(await feed.consumer.describe()),
  'consumer.prepareLoad':async([packageId,manifest,metadata],{signal})=>{
   if(preparations.has(packageId))throw error('DUPLICATE_WEIGHT_PACKAGE','Package preparation is already pending');
   let finish;const terminal=new Promise(resolve=>{finish=resolve;});preparations.set(packageId,terminal);
   const pkg=packageProxy(packageId,manifest);let value,id,dropped=false;
   try{
    value=await feed.consumer.prepareLoad(pkg,localContext(metadata,signal));
    signal.throwIfAborted();if(disposed||!rpc.isValid()||cancelledPackages.has(packageId))throw error('WEIGHT_PORT_CLOSED','Package preparation lost its owning connection');
    id=crypto.randomUUID();candidates.set(id,value);candidatePackages.set(id,packageId);
    await pkg.release();dropped=true;return answer({candidateId:id});
   }catch(cause){
    const failures=[];if(value!==undefined){if(id===undefined){id=crypto.randomUUID();candidates.set(id,value);candidatePackages.set(id,packageId);}try{await discardCandidate(id,value,metadata);}catch(cleanup){failures.push(cleanup);onInvalidated();}}
    if(!dropped)try{await pkg.release();}catch(cleanup){failures.push(cleanup);}
    if(failures.length)throw new AggregateError([cause,...failures],'Unexposed candidate cleanup requires retry');throw cause;
   }finally{preparations.delete(packageId);finish();}
  },
  'consumer.cancelPackage':async([packageId,metadata])=>{cancelledPackages.add(packageId);try{await preparations.get(packageId);for(const [id,value]of candidates)if(candidatePackages.get(id)===packageId)await discardCandidate(id,value,metadata);return answer({released:true});}finally{cancelledPackages.delete(packageId);}},
  'consumer.validate':async([id,metadata],{signal})=>answer(await feed.consumer.validate(candidate(id),localContext(metadata,signal))),
  'consumer.commit':async([id,metadata],{signal})=>{const value=await feed.consumer.commit(candidate(id),localContext(metadata,signal)),ownership=value?.ownership;publishedEpoch=value.epoch;return answer({...value,...(ownership?{ownership:{kind:ownership.kind,ownerId:ownership.ownerId,valid:ownership.isValid?.()===true}}:{})});},
  'consumer.rollback':async([id,metadata],{signal})=>answer(await feed.consumer.rollback(id===null?undefined:candidate(id),localContext(metadata,signal))),
  'consumer.releaseCandidate':async([id,metadata],{signal})=>{if(id!==null){await feed.consumer.releaseCandidate?.(candidate(id),localContext(metadata,signal));candidates.delete(id);candidatePackages.delete(id);}return answer({released:true});},
  clear:async([metadata],{signal})=>answer(await feed.clear(localContext(metadata,signal))),
  stats:async()=>answer(feed.stats()),
  close:async([metadata],{signal})=>{await feed.clear(localContext(metadata,signal));for(const value of candidates.values())await feed.consumer.releaseCandidate?.(value,localContext(metadata,signal));candidates.clear();graceful=true;return answer({released:true});}
 };
 rpc=createWeightPortRPC(port,{handlers,isCurrent,onClose:()=>{disposed=true;if(!graceful&&publishedEpoch!==null&&publishedEpoch===feed.consumer.currentEpoch()&&feed.stats().activePackageHash!==null)onInvalidated();for(const [id,value]of candidates)void discardCandidate(id,value).catch(()=>onInvalidated());}});
 return Object.freeze({close:reason=>rpc.close(reason),stats:rpc.stats});
}

/** Host side adapter matching the latest standalone LoRA base/consumer APIs.
 * Owned package functions remain on this side; nested reads use this duplex port. */
export async function createDiffusionWeightClient({port,binding}={}){
 const packages=new Map(),releases=new Map(),candidates=new WeakMap();let serial=0,currentEpoch=0,authorityGeneration=0,closed=false,rpc,description,closingCleanup=null,lastCleanupError=null;
 async function releasePackage(id){
  if(releases.has(id))return releases.get(id);const pkg=packages.get(id);if(!pkg)return;
  const pending=Promise.resolve().then(async()=>{await pkg.release();if(packages.get(id)===pkg)packages.delete(id);});releases.set(id,pending);
  try{await pending;}finally{releases.delete(id);}
 }
 async function releasePackages(){const results=await Promise.allSettled([...packages.keys()].map(releasePackage)),errors=results.filter(value=>value.status==='rejected').map(value=>value.reason);if(errors.length){lastCleanupError=new AggregateError(errors,'Host completed-package release requires retry');throw lastCleanupError;}lastCleanupError=null;}
 const handlers={
  'package.readBlock':async([id,weightId,offset,count,metadata],{signal})=>{range(offset,count);const pkg=packages.get(id);if(!pkg||pkg.isValid()!==true)throw error('WEIGHT_PACKAGE_RELEASED','Completed package capability is unavailable');return block(await pkg.readBlock(weightId,offset,count,{...metadata,signal}),count);},
  'package.release':async([id])=>{await releasePackage(id);return {released:true};}
 };
 rpc=createWeightPortRPC(port,{handlers,onClose:()=>{closed=true;closingCleanup=releasePackages();closingCleanup.catch(()=>{});}});
 async function call(method,args=[],ctx={}){guard(ctx);const reply=await rpc.call(method,args,{signal:ctx.signal});if(!reply||!Number.isSafeInteger(reply.epoch))throw error('INVALID_WEIGHT_REPLY','Weight reply lacks an epoch');currentEpoch=reply.epoch;guard(ctx);return reply.value;}
 try{description=await call('describe');if(binding&&JSON.stringify(description.binding)!==JSON.stringify(binding))throw error('STALE_MODEL','Weight port binding differs from its requested model session');}
 catch(cause){rpc.close(cause);throw cause;}
 const idOf=candidate=>{if(candidate===undefined)return null;const id=candidates.get(candidate);if(!id)throw error('STALE_WEIGHT_CANDIDATE','Candidate belongs to another connection or was released');return id;};
 const consumer=Object.freeze({
  contractVersion:CONTRACT,
  describe:()=>call('consumer.describe'),currentEpoch:()=>currentEpoch,
  async prepareLoad(pkg,ctx={}){
   guard(ctx);if(typeof pkg?.retain!=='function'||typeof pkg?.describe!=='function'||pkg.isValid?.()!==true)throw TypeError('Owned completed F32 package required');
   const retained=await pkg.retain('diffusion-weight-port:'+crypto.randomUUID()),cap=retained?.source??retained;
   if(cap?.isValid?.()!==true||typeof cap.readBlock!=='function'||typeof cap.release!=='function'){await cap?.release?.();throw TypeError('Independent completed package lease required');}
   const id='package:'+String(++serial);packages.set(id,cap);
   try{const value=await call('consumer.prepareLoad',[id,structuredClone(cap.describe()),context(ctx)],ctx),candidate=Object.freeze({candidateId:value.candidateId});candidates.set(candidate,value.candidateId);return candidate;}
   catch(cause){
    const failures=[];let released=closed;
    if(!closed)try{await call('consumer.cancelPackage',[id,context(ctx)]);released=true;}catch(cleanup){failures.push(cleanup);}
    if(released)try{await releasePackage(id);}catch(cleanup){failures.push(cleanup);}
    if(failures.length)throw new AggregateError([cause,...failures],'Package preparation cleanup requires retry');throw cause;
   }
  },
  validate:(candidate,ctx={})=>call('consumer.validate',[idOf(candidate),context(ctx)],ctx),
  async commit(candidate,ctx={}){const committedAuthority=++authorityGeneration,receipt=await call('consumer.commit',[idOf(candidate),context(ctx)],ctx);if(receipt?.ownership){const ownership=receipt.ownership,committedEpoch=receipt.epoch;receipt.ownership={kind:ownership.kind,ownerId:ownership.ownerId,isValid:()=>!closed&&rpc.isValid()&&authorityGeneration===committedAuthority&&currentEpoch===committedEpoch&&ownership.valid===true};}return receipt;},
  // Rollback/release are terminal cleanup. A caller's cancelled signal or stale
  // admission predicate must not prevent releasing that original candidate.
  rollback:(candidate,ctx={})=>{authorityGeneration++;return call('consumer.rollback',[idOf(candidate),context(ctx)]);},
  async releaseCandidate(candidate,ctx={}){const value=await call('consumer.releaseCandidate',[idOf(candidate),context(ctx)]);if(candidate)candidates.delete(candidate);return value;}
 });
 return Object.freeze({
  binding:structuredClone(description.binding),describe:()=>call('describe'),
  baseProvider:Object.freeze({describe:()=>call('base.describe'),readBlock:async(weightId,offset,count,ctx={})=>{range(offset,count);return block(await call('base.readBlock',[weightId,offset,count,context(ctx)],ctx),count);}}),
  consumer,clear:(ctx={})=>{authorityGeneration++;return call('clear',[context(ctx)],ctx);},stats:()=>call('stats'),
  inspect:()=>({closed,retainedPackages:packages.size,pendingReleases:releases.size,cleanupRequired:!!lastCleanupError,lastCleanupError:lastCleanupError?wireError(lastCleanupError):null}),
  async dispose(){
   if(!closed){try{await call('close',[{}]);}catch(cause){if(!closed&&rpc.isValid()&&!['STALE_MODEL','WEIGHT_PORT_CLOSED'].includes(cause?.code))throw cause;rpc.close(cause);}rpc.close();}
   await closingCleanup?.catch(()=>{});await releasePackages();
  },
  isValid:()=>!closed&&rpc.isValid()
 });
}

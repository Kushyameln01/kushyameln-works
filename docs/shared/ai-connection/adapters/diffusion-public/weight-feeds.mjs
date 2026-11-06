/** Runtime-only MessagePort ownership. Neither ports nor native clients enter a
 * normal request snapshot, artifact holder, workspace, or observer payload. */
import {WEIGHT_PORT_PROTOCOL} from './native.mjs';
const fail=(code,message)=>Object.assign(Error(message),{code});
/** Return an unadopted endpoint through the owner's existing terminal contract.
 * Browser MessagePort.close alone does not notify its remote RPC owner. */
export function closeUnadoptedWeightPort(port,reason){
 if(!(port instanceof MessagePort))return;
 try{port.postMessage({protocol:WEIGHT_PORT_PROTOCOL,kind:'closed',error:{code:reason?.code??'WEIGHT_PORT_CLOSED',message:String(reason?.message??'Weight feed admission was rejected')}});}catch{/* A broken endpoint still needs local release. */}
 finally{port.close();}
}
export function createManagedWeightFeeds({createClient,isCurrent}={}){
 const records=new Map();
 const cleanupState=()=>{const pendingWeightFeedIds=[...records.values()].filter(r=>{const native=r.client?.inspect();return !r.closed&&(r.invalidated||r.cleanupRequired||native?.cleanupRequired||native?.closed&&native.retainedPackages>0);}).map(r=>r.feedId);return {weightFeedCleanupRequired:pendingWeightFeedIds.length>0,pendingWeightFeedIds,hostWeightFeedResourcesReleased:[...records.values()].every(r=>r.closed)};};
 const metadata=r=>({feedId:r.feedId,binding:structuredClone(r.binding),nativeDescriptor:structuredClone(r.nativeDescriptor),protocol:r.protocol,target:structuredClone(r.target),modelGeneration:r.selected.modelGeneration,invalidated:r.invalidated,closed:r.closed,cleanupRequired:r.cleanupRequired||r.client?.inspect().cleanupRequired===true,lastError:r.lastError?{...r.lastError}:null});
 const find=id=>{const r=records.get(id);if(!r)throw fail('DIFFUSION_WEIGHT_FEED_NOT_FOUND','Owned weight feed is missing');return r;};
 const valid=r=>!r.invalidated&&!r.closing&&!r.closed&&isCurrent(r.selected)&&r.client?.isValid()===true;
 const guard=r=>{if(!valid(r))throw fail('DIFFUSION_WEIGHT_FEED_STALE','Weight feed ownership is no longer current');};
 const cleanupClient=r=>{if(!r.client)throw fail('DIFFUSION_WEIGHT_FEED_STALE','Weight feed cleanup has completed');return r.client;};
 function scoped(r){
  // This facade only gates ownership; the adopted native client owns every RPC,
  // package lease, candidate, block check and epoch. Keep it private for retries.
  const context=(ctx={})=>{
   // Preserve descriptors so the native client's accessor/plain-data rejection
   // cannot be bypassed while adding the local management lifetime predicate.
   const fields=Object.getOwnPropertyDescriptors(ctx),current=fields.isCurrent;
   if(!current||current.enumerable&&Object.hasOwn(current,'value'))fields.isCurrent={enumerable:true,configurable:true,writable:true,value:()=>valid(r)&&(ctx.isCurrent===undefined||typeof ctx.isCurrent==='function'&&ctx.isCurrent()===true)};
   return Object.create(Object.getPrototypeOf(ctx),fields);
  };
  const call=async fn=>{guard(r);const result=await fn(r.client);guard(r);return result;};
  const consumer=Object.freeze({
   contractVersion:r.client.consumer.contractVersion,
   describe:()=>call(c=>c.consumer.describe()),
   currentEpoch:()=>{guard(r);return r.client.consumer.currentEpoch();},
   prepareLoad:(pkg,ctx)=>call(c=>c.consumer.prepareLoad(pkg,context(ctx))),
   validate:(candidate,ctx)=>call(c=>c.consumer.validate(candidate,context(ctx))),
   async commit(candidate,ctx){const receipt=await call(c=>c.consumer.commit(candidate,context(ctx)));if(!receipt?.ownership)return receipt;const ownership=receipt.ownership;return {...receipt,ownership:{...ownership,isValid:()=>valid(r)&&ownership.isValid()===true}};},
   // Terminal cleanup remains available after admission authority is revoked.
   rollback:(candidate,ctx)=>cleanupClient(r).consumer.rollback(candidate,ctx),
   releaseCandidate:(candidate,ctx)=>cleanupClient(r).consumer.releaseCandidate(candidate,ctx)
  });
  return Object.freeze({binding:structuredClone(r.binding),consumer,
   describe:()=>call(c=>c.describe()),stats:()=>call(c=>c.stats()),
   baseProvider:Object.freeze({describe:()=>call(c=>c.baseProvider.describe()),readBlock:(id,offset,count,ctx)=>call(c=>c.baseProvider.readBlock(id,offset,count,context(ctx)))}),
   clear:(ctx={})=>{const fields=Object.getOwnPropertyDescriptors(ctx);for(const key of ['signal','isCurrent'])if(fields[key]?.enumerable&&Object.hasOwn(fields[key],'value'))delete fields[key];return cleanupClient(r).clear(Object.create(Object.getPrototypeOf(ctx),fields));},
   inspect:()=>({...(r.client?.inspect()??r.lastNativeInspection??{closed:true,retainedPackages:0,pendingReleases:0,cleanupRequired:false,failedReleaseIDs:[],lastCleanupError:null}),managedCurrent:valid(r),managedCleanupRequired:r.cleanupRequired}),
   isValid:()=>valid(r),dispose:()=>close(r.feedId)
  });
 }

 async function close(feedId){
  const r=find(feedId);r.invalidated=true;
  if(r.closed)return metadata(r);
  if(r.closing)return r.closing;
  r.closing=(async()=>{
   try{await r.initializing;if(r.client)await r.client.dispose();else closeUnadoptedWeightPort(r.port);r.lastNativeInspection=r.client?.inspect();r.client=null;r.port=null;r.closed=true;r.cleanupRequired=false;r.lastError=null;return metadata(r);}
   catch(error){r.cleanupRequired=true;r.lastError={code:error.code??'DIFFUSION_WEIGHT_FEED_CLEANUP_FAILED',message:String(error.message??error)};throw error;}
   finally{r.closing=null;}
  })();return r.closing;
 }
 async function adopt(result,selected,target){
  const {port,binding,descriptor,nativeDescriptor,protocol}=result??{};
  if(!(port instanceof MessagePort)||binding?.modelSessionId!==selected.modelSessionId||binding?.modelEpoch!==selected.modelEpoch||!['HIGH','LOW'].includes(binding?.side)||!isCurrent(selected)){
   const error=fail('STALE_MODEL','Weight feed belongs to another model owner');closeUnadoptedWeightPort(port,error);throw error;
  }
  let r;try{r={feedId:'diffusion-weight-feed:'+crypto.randomUUID(),binding:structuredClone(binding),nativeDescriptor:structuredClone(nativeDescriptor??descriptor),protocol,target:structuredClone(target),selected:{...selected},port,client:null,invalidated:false,closed:false,cleanupRequired:false,lastError:null,closing:null,initializing:null};}catch(error){closeUnadoptedWeightPort(port,error);throw error;}
  records.set(r.feedId,r);
  r.initializing=Promise.resolve().then(()=>createClient({port,binding})).then(client=>{r.client=client;r.port=null;return client;}).catch(error=>{/* Native createDiffusionWeightClient already called RPC.close and notified its peer on initialization failure. */port.close();r.port=null;r.closed=true;r.invalidated=true;throw error;});
  try{await r.initializing;}finally{r.initializing=null;}
  if(r.invalidated||!isCurrent(selected)){await close(r.feedId);throw fail('STALE_MODEL','Weight feed was invalidated during admission');}
  r.facade=scoped(r);return metadata(r);
 }
 function invalidate(){for(const r of records.values())if(!r.closed){r.invalidated=true;void close(r.feedId).catch(()=>{});}}
 async function closeAll(){invalidate();const results=await Promise.allSettled([...records.values()].filter(r=>!r.closed).map(r=>close(r.feedId)));const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);if(errors.length)throw new AggregateError(errors,'Weight feed cleanup requires retry');}
 return Object.freeze({adopt,close,closeAll,invalidate,cleanupState,
  async prepare(side,selected){for(const r of records.values())if(!r.closed&&r.binding.side===side&&r.selected.modelGeneration===selected.modelGeneration)await close(r.feedId);},
  get(feedId){const r=find(feedId);guard(r);return r.facade;},
  inspect:()=>[...records.values()].map(metadata)
 });
}

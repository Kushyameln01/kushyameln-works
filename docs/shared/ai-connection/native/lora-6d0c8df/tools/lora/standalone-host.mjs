// Development reference host: no Diffusion/management dependency or model decoder.
import {validateStandaloneRegistry,STANDALONE_CONTRACT_VERSION as VERSION} from '../../docs/shared/inference/lora/standalone-registry.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const forbidden=['expected','expectedSHA256','gate','gateId','referenceId','run','input','tolerance'];
const finite=(a,n)=>{if(!(a instanceof Float32Array)||a.length!==n||a.byteOffset!==0||a.byteLength!==a.buffer.byteLength)throw Error('Owned completed F32 block required');for(let i=0;i<n;i++)if(!Number.isFinite(a[i]))throw Error('Non-finite completed F32');};
// Matrix tiles retain all input columns. Vectors use the element budget,
// avoiding one small IPC/read per artificial vector row.
export function* standaloneCoordinates(manifest,{blockRows=128}={}){
 if(!Number.isSafeInteger(blockRows)||blockRows<1||blockRows>256)throw RangeError('Invalid reference blockRows');
 for(const target of manifest.selectedTargets){const cols=target.fullShape.length===2?target.fullShape[1]:1,step=target.fullShape.length===1?1048576:Math.min(blockRows,Math.floor(1048576/cols));
  if(step<1)throw RangeError('One complete row exceeds block budget');
  for(const range of target.ranges)for(let row=range.startRow;row<range.startRow+range.rowCount;row+=step){const rows=Math.min(step,range.startRow+range.rowCount-row);yield {key:target.key,weightId:target.weightId,fullShape:target.fullShape,offset:row*cols,count:rows*cols,slice:{startRow:row,rowCount:rows},dtype:'F32',layout:'row-major'};}
 }
}
export function createIndependentBaseProvider(input){
 const registry=validateStandaloneRegistry(input),byId=new Map(registry.targets.map(t=>[t.weightId,t])),description=Object.freeze({modelHash:registry.modelHash,side:registry.side,meaning:'independent-dyadic-f32-base-v1',immutable:true});
 return Object.freeze({describe:()=>description,async readBlock(id,offset,count,context={}){
  context.signal?.throwIfAborted();const t=byId.get(id),cols=t?.fullShape.length===2?t.fullShape[1]:1,total=t?.fullShape.reduce((a,b)=>a*b,1);
  if(!t||!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||offset<0||count<1||offset%cols||count%cols||offset>total-count||count>1048576)throw RangeError('Independent base full-coordinate range/columns invalid');
  if(!same(context.fullShape,t.fullShape))throw Error('Independent base full shape mismatch');
  if(context.modelHash!==undefined&&context.modelHash!==registry.modelHash||context.side!==undefined&&context.side!==registry.side)throw Error('Independent base identity mismatch');
  const out=new Float32Array(count);for(let i=0;i<count;i++)out[i]=((offset+i)%17-8)/128;return out;
 }});
}
export function createStandaloneReferenceHost({registry:input,baseProvider,blockRows=128,onBeforeBlock,onBlock,isOwnerCurrent=()=>true}={}){
 const registry=validateStandaloneRegistry(input),byId=new Map(registry.targets.map(t=>[t.weightId,t]));
 let disposed=false,epoch=0,active=null,disposal;const candidates=new WeakMap(),records=new Set(),views=new Set(),inFlight=new Set(),pendingReleases=new Set(),releaseFlights=new Map(),releasedCaps=new WeakSet();
 const live=()=>{if(disposed||isOwnerCurrent()!==true)throw Error('Reference consumer disposed or stale owner');};
 const guard=c=>{live();c.signal?.throwIfAborted();if(typeof c.isCurrent!=='function'||c.isCurrent()!==true)throw Error('Reference request is not current');};
 const track=fn=>{const p=Promise.resolve().then(fn);inFlight.add(p);p.finally(()=>inFlight.delete(p)).catch(()=>{});return p;};
 function release(cap){if(!cap||releasedCaps.has(cap))return Promise.resolve();if(releaseFlights.has(cap))return releaseFlights.get(cap);pendingReleases.add(cap);const p=Promise.resolve().then(()=>cap.release()).then(()=>{releasedCaps.add(cap);pendingReleases.delete(cap);}).finally(()=>releaseFlights.delete(cap));releaseFlights.set(cap,p);return p;}
 function record(value){live();const r=candidates.get(value);if(!r||r.released)throw Error('Foreign or released reference candidate');return r;}
 function bound(r,c){guard(c);if(['sdkInstanceId','localRevision','transactionId'].some(k=>c[k]!==r.authority[k]))throw Error('Reference transaction authority mismatch');if(c.contractVersion!==VERSION||c.validationMode!=='normal'||['planId','packageHash','registryHash','coverage','scope'].some(k=>c[k]!==r.manifest[k]))throw Error('Reference candidate context binding mismatch');}
 function fresh(r,c){bound(r,c);if(r.preparedAtEpoch!==epoch||r.committedAtEpoch!==null)throw Error('Stale reference candidate epoch');}
 async function drop(r){if(r.released)return;if(r.validating)throw Error('Reference candidate validation busy');await release(r.lease);if(r.previous)await release(r.previous);r.previous=null;r.released=true;records.delete(r);}
 const api={contractVersion:VERSION,describe(){live();return registry;},currentEpoch(){return epoch;},
  prepareLoad(pkg,c){c=Object.freeze({...c});return track(async()=>{guard(c);const manifest=pkg.describe();if(typeof c.sdkInstanceId!=='string'||!c.sdkInstanceId||typeof c.transactionId!=='string'||!c.transactionId||!Number.isSafeInteger(c.localRevision)||c.localRevision<0)throw Error('Explicit SDK transaction authority required');if(!same(manifest.registry,registry))throw Error('Reference registry mismatch');const lease=pkg.retain('reference-candidate');
   const value=Object.freeze({candidateId:crypto.randomUUID(),packageHash:manifest.packageHash,preparedAtEpoch:epoch}),r={value,manifest,lease,authority:{sdkInstanceId:c.sdkInstanceId,localRevision:c.localRevision,transactionId:c.transactionId},preparedAtEpoch:epoch,committedAtEpoch:null,validation:null,previous:null,released:false,validating:false};
   try{bound(r,c);candidates.set(value,r);records.add(r);return value;}catch(e){await lease.release();throw e;}
  });},
  validate(value,c){c=Object.freeze({...c});return track(async()=>{if(forbidden.some(k=>Object.hasOwn(c,k)))throw Error('Normal reference validation refuses diagnostic arguments');const r=record(value);fresh(r,c);if(r.validating)throw Error('Reference candidate validation busy');r.validating=true;r.validation=null;let checkedElements=0,blockCount=0;
   try{for(const coordinate of standaloneCoordinates(r.manifest,{blockRows})){
    fresh(r,c);const t=byId.get(coordinate.weightId);if(!t||!same(t.fullShape,coordinate.fullShape)||t.dtype!=='F32'||t.layout!=='row-major')throw Error('Reference full shape/dtype/layout mismatch');
    await onBeforeBlock?.({...coordinate,candidateId:value.candidateId});fresh(r,c);
    const data=await r.lease.readBlock(coordinate.weightId,coordinate.offset,coordinate.count,{signal:c.signal});fresh(r,c);finite(data,coordinate.count);
    await onBlock?.({...coordinate,candidateId:value.candidateId,data});fresh(r,c);checkedElements+=coordinate.count;blockCount++;
   }
   fresh(r,c);r.validation=Object.freeze({contractVersion:VERSION,valid:true,validationMode:'normal',planId:c.planId,packageHash:c.packageHash,registryHash:c.registryHash,coverage:c.coverage,scope:c.scope,candidateId:value.candidateId,epoch,checkedElements,blockCount,numericalComparison:false,modelInference:false,generationReady:false});return r.validation;
   }finally{r.validating=false;}
  });},
  async commit(value,c){const r=record(value);fresh(r,c);if(r.validating||!r.validation?.valid||r.validation.epoch!==epoch)throw Error('Full normal admission required before commit');guard(c);const next=r.lease.retain('reference-active');r.previous=active;active=next;r.activated=next;epoch++;r.committedAtEpoch=epoch;
   return {contractVersion:VERSION,state:'CONSUMER_APPLIED',validationMode:'normal',planId:c.planId,packageHash:c.packageHash,registryHash:c.registryHash,coverage:c.coverage,scope:c.scope,epoch,ownership:{kind:'lease',ownerId:'reference-active:'+r.value.candidateId,isValid:()=>!disposed&&next.isValid()}};
  },
  async rollback(value,c){const r=candidates.get(value);if(!r||r.released)return {restored:false,epoch};if(r.validating)throw Error('Reference candidate validation busy');let restored=false;if(!disposed&&isOwnerCurrent()===true&&['sdkInstanceId','localRevision','transactionId'].every(k=>c?.[k]===r.authority[k])&&r.committedAtEpoch===epoch&&active===r.activated){const discarded=active;active=r.previous;r.previous=null;epoch++;restored=true;await release(discarded);}await drop(r);return {restored,epoch};},
  async releaseCandidate(value){const r=candidates.get(value);if(r)await drop(r);},
  capture(){live();let released=false;const at=epoch,lease=active?.retain('reference-read-lease'),description=lease?.describe()??null;
   let releasePromise,releaseDone=false;
   const view={epoch:at,packageHash:description?.packageHash??null,describe(){if(released)throw Error('Reference lease released');return description;},readBlock(...args){return track(async()=>{if(released)throw Error('Reference lease released');live();const p=lease?lease.readBlock(...args):baseProvider?.readBlock(...args);if(!p)throw Error('No active package/base provider');const b=await p;if(released)throw Error('Reference lease released');live();return b;});},release(){if(releaseDone)return Promise.resolve();if(releasePromise)return releasePromise;released=true;releasePromise=release(lease).then(()=>{releaseDone=true;views.delete(view);}).catch(e=>{releasePromise=null;throw e;});return releasePromise;}};views.add(view);return Object.freeze(view);
  },
  stats(){return {disposed,epoch,candidates:records.size,readLeases:views.size,inFlight:inFlight.size,pendingReleases:pendingReleases.size,active:!!active,activePackageHash:active?.describe().packageHash??null};},
  dispose(){if(disposal)return disposal;if(!disposed){disposed=true;epoch++;}disposal=(async()=>{await Promise.allSettled([...inFlight]);const errors=[];for(const cap of [...pendingReleases])try{await release(cap);}catch(e){errors.push(e);}for(const v of [...views])try{await v.release();}catch(e){errors.push(e);}for(const r of [...records])try{await drop(r);}catch(e){errors.push(e);}try{await release(active);active=null;}catch(e){errors.push(e);}if(errors.length)throw new AggregateError(errors,'Reference consumer cleanup failed');})();disposal.catch(()=>{disposal=null;});return disposal;}

 };return Object.freeze(api);
}

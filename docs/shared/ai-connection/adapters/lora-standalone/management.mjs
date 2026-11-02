/** Management selection and side coordination only. All File parsing, mapping,
 * arithmetic, range admission and native rollback belong to the SDK/consumer.
 * Per-side adapters own the existing queue and common execution snapshots. */
const clone=structuredClone,sidesInOrder=['HIGH','LOW'];
const flags={graphBinding:'UNBOUND',generationReady:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};
const fail=(code,message)=>Object.assign(Error(message),{code});
const errorRecord=e=>({code:e?.code??e?.name??'LORA_OPERATION_FAILED',message:e?.message??String(e)});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const operations=new Set(['register','compose','prepare','stage','apply','restoreBase','save','openPackage','release','cancel','recover','dispose','query','capabilities']);

export function createLoraManagement({sides={},managerSessionId='lora-management:'+crypto.randomUUID()}={}){
 if(!sides||typeof sides!=='object'||Array.isArray(sides)||typeof managerSessionId!=='string'||!managerSessionId)throw TypeError('Explicit side map and management session required');
 const adapters=new Map(),unsubscribers=new Map(),listeners=new Set(),usedRequests=new Set(),latestRequests=new Map();
 let revision=0,active=null,lastBatch=null,lastRecovery=null,recoveryRequired=false,disposed=false,disposing=false;
 const live=()=>{if(disposed||disposing)throw fail('LORA_MANAGEMENT_DISPOSED','Management coordinator disposed');};
 function checked(side,adapter){if(!sidesInOrder.includes(side)||!adapter||typeof adapter.inspect!=='function'||adapter.inspect().side!==side)throw fail('LORA_SIDE_BINDING_INVALID','A fixed, matching standalone side adapter is required');return adapter;}
 function requireSide(side){if(!sidesInOrder.includes(side)||!adapters.has(side))throw fail('LORA_SIDE_UNBOUND','No standalone SDK/provider/consumer is loaded for requested '+side);return adapters.get(side);}
 function inspect(){return {schemaVersion:'works-lora-management/1',managerSessionId,managerRevision:revision,activeTarget:clone(active?.target??null),sides:Object.fromEntries([...adapters].map(([side,a])=>[side,a.inspect()])),lastBatch:clone(lastBatch),lastRecovery:clone(lastRecovery),recoveryRequired,disposed,...flags};}
 function emit(type,detail={}){const event={type,...clone(detail),state:inspect()};for(const fn of listeners)try{fn(clone(event));}catch{/* Views do not control SDK terminal cleanup. */}}
 function bind(side,adapter){adapters.set(side,checked(side,adapter));if(typeof adapter.subscribe==='function')unsubscribers.set(side,adapter.subscribe(event=>emit('side',{side,event})));}
 for(const [side,adapter] of Object.entries(sides))bind(side,adapter);
 function request(requestId){const id=requestId??'lora-management:'+crypto.randomUUID();if(typeof id!=='string'||!id||usedRequests.has(id))throw fail('LORA_REQUEST_ID_REUSED','Unique management request ID required');usedRequests.add(id);return id;}
 async function run({side,operation,args={},requestId,signal,onProgress}={}){
  live();if(active)throw fail('LORA_BATCH_BUSY','Wait for the active side batch terminal');
  if(recoveryRequired&&!['recover','release','dispose','query','capabilities','cancel'].includes(operation))throw fail('LORA_BATCH_RECOVERY_REQUIRED','A failed side batch requires explicit verified recovery before a new selection');
  if(!operations.has(operation))throw fail('LORA_OPERATION_UNSUPPORTED','Unknown standalone operation');
  const adapter=requireSide(side),id=request(requestId),managerRevision=++revision;latestRequests.set(side,id);
  const options={...args,...(!['cancel','recover','dispose','query','capabilities'].includes(operation)?{requestId:id,signal,onProgress}:{})};
  const result=await (operation==='cancel'?adapter.cancel(args.target??args):['recover','dispose','query','capabilities'].includes(operation)?adapter[operation]():adapter[operation](options));
  const receipt={status:'SIDE_COMPLETED',side,operation,managerSessionId,managerRevision,requestId:id,currentSelection:latestRequests.get(side)===id,result,...flags};emit('operation',receipt);return receipt;
 }
 function start(kind,id,signal){if(active)throw fail('LORA_BATCH_BUSY','A coordinated side operation is active');if(signal!==undefined&&!(signal instanceof AbortSignal))throw TypeError('AbortSignal required');const r={kind,controller:new AbortController(),done:deferred(),target:{requestId:id,managerSessionId,managerRevision:++revision,resourceGeneration:'lora-batch:'+crypto.randomUUID(),activeToken:crypto.randomUUID()}};r.abort=()=>r.controller.abort();signal?.addEventListener('abort',r.abort,{once:true});r.signal=signal;if(signal?.aborted)r.controller.abort();active=r;emit('started',{target:r.target,kind});return r;}
 function finish(r){r.signal?.removeEventListener('abort',r.abort);if(active===r)active=null;r.done.resolve();emit('settled',{target:r.target,kind:r.kind});}
 async function applyBatch({selectionsBySide,targetsBySide={},requestId,signal,onProgress}={}){
  live();if(recoveryRequired)throw fail('LORA_BATCH_RECOVERY_REQUIRED','Recover the failed batch before another coordinated selection');
  if(!selectionsBySide||typeof selectionsBySide!=='object'||Array.isArray(selectionsBySide)||!Object.keys(selectionsBySide).length||Object.keys(selectionsBySide).some(side=>!sidesInOrder.includes(side)||!Array.isArray(selectionsBySide[side])))throw TypeError('Explicit selections for one or both sides required');
  const selections=clone(selectionsBySide),targets=clone(targetsBySide),requested=sidesInOrder.filter(side=>Object.hasOwn(selections,side));for(const side of requested)requireSide(side);
  const r=start('apply',request(requestId),signal),results={},errors={};
  try{
   for(const side of requested){
    if(r.controller.signal.aborted){errors[side]={code:'INVOCATION_CANCELLED',message:'Management batch cancelled before side dispatch'};break;}
    try{const a=requireSide(side),options={requestId:r.target.requestId+':'+side,signal:r.controller.signal,onProgress:p=>onProgress?.({side,progress:p}),...(selections[side].length?{selections:selections[side],...(targets[side]!==undefined?{targets:targets[side]}:{})}:{})};results[side]=await a[selections[side].length?'apply':'restoreBase'](options);emit('side-completed',{target:r.target,side});}
    catch(e){errors[side]=errorRecord(e);break;}
   }
   const complete=!r.controller.signal.aborted&&!Object.keys(errors).length&&requested.every(side=>results[side]?.nativeReceipt?.state==='CONSUMER_APPLIED');
   const receipt={status:complete?'BATCH_COMPLETED':r.controller.signal.aborted?'BATCH_CANCELLED':'BATCH_FAILED',accepted:complete,target:clone(r.target),requestedSides:requested,results,errors,...flags};
   lastBatch=clone(receipt);recoveryRequired=!complete;lastRecovery=null;emit('batch',receipt);return receipt;
  }finally{finish(r);}
 }
 async function recoverBatch({strategy='restoreBase',requestId,signal,onProgress}={}){
  live();if(strategy!=='restoreBase')throw fail('LORA_RECOVERY_STRATEGY','Recovery explicitly rebuilds base using fresh SDK transactions');
  if(!recoveryRequired||!lastBatch)throw fail('LORA_NO_BATCH_RECOVERY','No incomplete batch is awaiting recovery');
  const original=clone(lastBatch),r=start('recovery',request(requestId),signal),results={},errors={};
  try{
   for(const side of original.requestedSides){
    if(r.controller.signal.aborted){errors[side]={code:'INVOCATION_CANCELLED',message:'Recovery cancelled before this side'};break;}
    try{const a=requireSide(side),recovery=await a.recover(),restored=await a.restoreBase({requestId:r.target.requestId+':'+side+':base',signal:r.controller.signal,onProgress:p=>onProgress?.({side,progress:p})});results[side]={recovery,restored};}
    catch(e){errors[side]=errorRecord(e);}
   }
   const complete=!r.controller.signal.aborted&&!Object.keys(errors).length&&original.requestedSides.every(side=>results[side]?.restored?.nativeReceipt?.state==='CONSUMER_APPLIED');
   const receipt={status:complete?'BASE_RECOVERED':'BATCH_RECOVERY_FAILED',recovered:complete,originalBatchStatus:original.status,originalTarget:original.target,target:clone(r.target),results,errors,...flags};
   lastRecovery=clone(receipt);recoveryRequired=!complete;emit('recovery',receipt);return receipt;
  }finally{finish(r);}
 }
 async function cancel(target){live();if(!active||!same(active.target,target))throw fail('TARGET_MISMATCH','Exact active management batch target required');const r=active;r.controller.abort();await r.done.promise;return {cancelled:true,originalTerminal:true,target:clone(target),...flags};}
 async function replaceSide({side,adapter}={}){live();if(active||recoveryRequired)throw fail('LORA_BATCH_BUSY','End/recover the batch before replacing a side');checked(side,adapter);const previous=adapters.get(side);if(previous===adapter)return inspect();if(previous)await previous.dispose();unsubscribers.get(side)?.();bind(side,adapter);revision++;latestRequests.delete(side);emit('side-replaced',{side});return inspect();}
 async function dispose(){if(disposed)return {disposed:true,...flags};if(disposing)throw fail('LORA_MANAGEMENT_DISPOSING','Disposal is already pending');disposing=true;try{if(active){const r=active;r.controller.abort();await r.done.promise;}const result=await Promise.allSettled([...adapters].map(async([side,a])=>{await a.dispose();return side;}));const errors=result.filter(r=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'LoRA SDK disposal requires recovery');for(const fn of unsubscribers.values())fn();disposed=true;emit('disposed');return {disposed:true,callerBackingResourcesStillOwned:true,...flags};}finally{disposing=false;}}
 return Object.freeze({run,applyBatch,recoverBatch,cancel,replaceSide,inspect,dispose,subscribe(fn){if(typeof fn!=='function')throw TypeError('Subscriber required');listeners.add(fn);return ()=>listeners.delete(fn);}});
}

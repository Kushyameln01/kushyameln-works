/**
 * Explicit-owner invocation queue (E3 / works-module-contract/1.0-draft.1).
 * No native imports, global executor discovery, timers or implicit stop claims.
 *
 * createInvocationQueue({resourceBindings:[{bindingId,ownerId,resourceGeneration,groupId?,
 *   cancel(target)->{stopped:boolean}, afterTerminal(target,outcome)->{reusable:boolean},
 *   release(target,outcome)}]})
 * invocation = {id,requestId,ownerId,resourceBinding:bindingId,resourceGeneration,revision,activeToken}
 * cancelInvocation(id, {bindingId,ownerId,resourceGeneration,requestId,revision,activeToken})
 * disconnectResource accepts the exact current queued/running/cleanup target.
 * For an idle resource only, the owner may pass the resource-only identity
 * {bindingId,ownerId,resourceGeneration}. Retired invocation targets are rejected.
 * Verified rebind requires a new never-used resourceGeneration; operation/native
 * revision and resource generation are independent identities.
 *
 * execute({signal,target,runChild}) returns the actual native operation's terminal
 * Promise, not a timeout race. Owner callbacks must bind native cancellation to
 * the supplied target. A false/missing stop guarantee quarantines the resource.
 * A child inherits its active parent's token but has its own request ID and owner.
 * It may execute within the same explicitly configured resource group, never by
 * waiting for the parent-owned queue slot. It cannot outlive the parent's barrier.
 */

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const fail=(code,message)=>Object.assign(new Error(message),{name:'InvocationQueueError',code});
const text=x=>typeof x==='string'&&x.length>0;
const equalTarget=(a,b)=>!!b&&['bindingId','ownerId','resourceGeneration','requestId','revision','activeToken'].every(k=>a[k]===b[k]);
const cancellationSatisfied=e=>e.cancelAck?.stopped===true||(!e.dispatched&&e.cancelAck?.notStarted===true);

export function createInvocationQueue({resourceBindings}={}) {
  if(!Array.isArray(resourceBindings)||resourceBindings.length===0)throw fail('INVALID_RESOURCE','Explicit resource bindings are required');
  const bindings=new Map(),groups=new Map(),active=new Map(),records=new Map();
  const ids=new Set(),requests=new Set(),tokens=new Set();let closed=false;

  function validateBinding(b) {
    if(!b||!text(b.bindingId)||!text(b.ownerId)||!text(b.resourceGeneration)||(b.groupId!==undefined&&!text(b.groupId))||
      ['cancel','afterTerminal','release'].some(k=>typeof b[k]!=='function'))throw fail('INVALID_RESOURCE','Resource identity and owner cancel/terminal/release callbacks are required');
  }
  for(const config of resourceBindings) {
    validateBinding(config);
    if(bindings.has(config.bindingId))throw fail('DUPLICATE_RESOURCE','Resource binding ID is already configured');
    const groupId=config.groupId??config.bindingId;
    if(!groups.has(groupId))groups.set(groupId,{groupId,active:null,pending:[],quarantined:false});
    bindings.set(config.bindingId,{config:{...config},generations:new Set([config.resourceGeneration]),group:groups.get(groupId),quarantined:false,reason:null});
  }
  function record(e,patch={}) {
    const previous=records.get(e.invocation.id)??{};
    records.set(e.invocation.id,{resultAccepted:false,originalTerminal:false,stopAcknowledged:false,calculationStopped:false,resourceReleased:false,reusable:false,
      ...previous,id:e.invocation.id,requestId:e.invocation.requestId,ownerId:e.invocation.ownerId,
      resourceBinding:e.invocation.resourceBinding,resourceGeneration:e.invocation.resourceGeneration,revision:e.invocation.revision,activeToken:e.invocation.activeToken,parentId:e.parent?.invocation.id??null,
      state:e.state,...patch});
  }
  function settleUnstarted(e,error) {
    e.state=error.code==='INVOCATION_CANCELLED'?'cancelled':'blocked';record(e,{errorCode:error.code});
    e.publicResult.reject(error);e.done.resolve({notStarted:true,stopConfirmed:false,originalTerminal:false,resourceReleased:false,reusable:!e.binding.group.quarantined,quarantined:e.binding.group.quarantined});
    active.delete(e.invocation.id);
  }
  function quarantine(binding,reason) {
    binding.quarantined=true;binding.reason=reason;const group=binding.group;group.quarantined=true;
    // Queued descendants live in a parent's serial lane, not group.pending.
    // Settle every unstarted invocation in this group so none can bypass the
    // quarantine later, and callers awaiting a queued child cannot deadlock.
    const queued=[...active.values()].filter(e=>e.binding.group===group&&e.state==='queued');
    group.pending.length=0;
    for(const e of queued)settleUnstarted(e,fail('RESOURCE_QUARANTINED',`Resource group ${group.groupId} is quarantined: ${reason}`));
  }
  function prepare(invocation,execute,parent=null) {
    if(closed)throw fail('QUEUE_DISPOSED','Queue is disposed');
    if(!invocation||['id','requestId','ownerId','resourceBinding','resourceGeneration','activeToken'].some(k=>!text(invocation[k]))||
      !((Number.isSafeInteger(invocation.revision)&&invocation.revision>=0)||text(invocation.revision))||typeof execute!=='function')throw fail('INVALID_INVOCATION','Explicit invocation ID/request/owner/binding/revision/token and execute callback are required');
    const binding=bindings.get(invocation.resourceBinding);
    if(!binding||binding.config.ownerId!==invocation.ownerId)throw fail('OWNER_BINDING_MISMATCH','Invocation owner does not own the configured resource binding');
    if(binding.config.resourceGeneration!==invocation.resourceGeneration)throw fail('RESOURCE_GENERATION_MISMATCH','Invocation targets a retired resource generation');
    if(binding.group.quarantined)throw fail('RESOURCE_QUARANTINED',`Resource group ${binding.group.groupId} cannot be reused`);
    if(ids.has(invocation.id))throw fail('DUPLICATE_INVOCATION','Invocation IDs cannot be reused during a queue lifetime');
    if(requests.has(invocation.requestId))throw fail('DUPLICATE_REQUEST','Native request IDs cannot be reused during a queue lifetime');
    if(parent) {
      if(parent.cancelRequested)throw fail('INVOCATION_CANCELLED','The parent invocation is cancelling');
      if(!parent.allowChildren||parent.binding.group.active!==parent.root)throw fail('STALE_PARENT','Child source read no longer belongs to an executing parent');
      if(binding.group!==parent.binding.group)throw fail('CHILD_GROUP_MISMATCH','Child operation must use the explicit parent-owned resource group');
      if(invocation.activeToken!==parent.invocation.activeToken)throw fail('CHILD_TOKEN_MISMATCH','Child must inherit its current parent active token');
    } else if(tokens.has(invocation.activeToken))throw fail('DUPLICATE_ACTIVE_TOKEN','Root active tokens cannot be reused during a queue lifetime');
    ids.add(invocation.id);requests.add(invocation.requestId);if(!parent)tokens.add(invocation.activeToken);
    const e={invocation:Object.freeze({...invocation}),binding,execute,parent,root:parent?.root??null,children:[],controller:new AbortController(),
      publicResult:deferred(),done:deferred(),childTail:Promise.resolve(),state:'queued',cancelRequested:false,cancelPromise:null,cancelAck:null,allowChildren:false,rawTerminal:false};
    e.root??=e;
    e.target=Object.freeze({invocationId:invocation.id,bindingId:invocation.resourceBinding,ownerId:invocation.ownerId,resourceGeneration:invocation.resourceGeneration,
      requestId:invocation.requestId,revision:invocation.revision,activeToken:invocation.activeToken});
    active.set(invocation.id,e);record(e);return e;
  }
  function pump(group) {
    if(group.active||group.quarantined||closed)return;
    const e=group.pending.shift();if(!e)return;
    group.active=e;start(e);
  }
  function beginCancel(e) {
    if(e.cancelPromise)return e.cancelPromise;
    e.cancelRequested=true;e.state='cancelling';e.controller.abort(fail('INVOCATION_CANCELLED','Invocation cancellation requested'));
    record(e,{cancelRequested:true});
    const childStops=[];
    for(const child of e.children.filter(child=>active.has(child.invocation.id))) {
      if(child.state==='queued')settleUnstarted(child,fail('INVOCATION_CANCELLED','Parent cancelled before child dispatch'));
      else if(['running','cancelling'].includes(child.state))childStops.push(beginCancel(child));
    }
    // A slot can be marked running before execute's dispatch microtask. If the
    // callback has not run, there is no native operation to stop: abort prevents
    // dispatch. Preserve the original-terminal/cleanup barriers without calling
    // a targetless native cancel or fabricating a native stop acknowledgement.
    const ownStop=Promise.resolve().then(()=>e.dispatched?e.binding.config.cancel(e.target):{stopped:false,notStarted:true}).then(ack=>{
      e.cancelAck=ack;
      record(e,{stopAcknowledged:ack?.stopped===true,nativeStopRequired:!!e.dispatched,calculationStopped:cancellationSatisfied(e)&&e.rawTerminal});
      if(!cancellationSatisfied(e))quarantine(e.binding,'Owner did not confirm native computation stopped');
      return ack;
    },error=>{e.cancelAck={stopped:false,error};quarantine(e.binding,'Native cancellation failed or transport disconnected');return e.cancelAck;});
    e.cancelPromise=Promise.all([ownStop,...childStops]);return e.cancelPromise;
  }
  function start(e) {
    // Recheck immediately before native dispatch, including parent-owned lanes.
    if(e.binding.group.quarantined||e.binding.config.resourceGeneration!==e.invocation.resourceGeneration) {
      settleUnstarted(e,fail('RESOURCE_QUARANTINED','Resource was quarantined or rebound before dispatch'));
      if(!e.parent&&e.binding.group.active===e){e.binding.group.active=null;pump(e.binding.group);}
      return;
    }
    e.state='running';e.allowChildren=true;record(e);
    const context=Object.freeze({signal:e.controller.signal,target:e.target,
      runChild:async(childInvocation,execute)=>{
        const child=prepare(childInvocation,execute,e);e.children.push(child);
        // A parent owns one slot. Its sibling reads share a serial child lane;
        // nested children use their immediate parent's lane, avoiding self-wait.
        e.childTail=e.childTail.then(async()=>{
          if(!active.has(child.invocation.id))return;
          if(e.cancelRequested)settleUnstarted(child,fail('INVOCATION_CANCELLED','Parent cancelled before child dispatch'));
          else start(child);
          await child.done.promise;
        });
        return child.publicResult.promise;
      }});
    const raw=Promise.resolve().then(()=>{
      if(e.cancelRequested)throw fail('INVOCATION_CANCELLED','Cancelled before native dispatch');
      e.dispatched=true;return e.execute(context);
    }).then(value=>({status:'fulfilled',value}),error=>({status:'rejected',error}));
    void (async()=>{
      const outcome=await raw;e.rawTerminal=true;e.allowChildren=false;
      record(e,{originalTerminal:true,nativeOutcome:outcome.status,calculationStopped:e.cancelRequested?cancellationSatisfied(e):true});
      await Promise.all(e.children.map(child=>child.done.promise));
      if(e.cancelPromise)await e.cancelPromise;
      // No cancellation may be dispatched after cleanup starts. The next job is
      // still blocked until both owner callbacks finish and this slot is released.
      e.state='cleanup';record(e);
      const stopped=e.cancelRequested?cancellationSatisfied(e)&&e.children.every(child=>!child.cancelRequested||cancellationSatisfied(child)):true;
      const ownerOutcome={...outcome,cancelled:e.cancelRequested,notStarted:!e.dispatched,stopConfirmed:!!e.dispatched&&stopped,originalTerminal:true};
      let reusable=false,resourceReleased=false,cleanupError=null;
      try {const terminal=await e.binding.config.afterTerminal(e.target,ownerOutcome);reusable=terminal?.reusable===true;
        if(!reusable)throw fail('RESOURCE_CLEANUP_FAILED','Owner did not confirm resource reuse after terminal');
      } catch(error){cleanupError=error;quarantine(e.binding,'Owner terminal/reuse confirmation failed');}
      try {await e.binding.config.release(e.target,ownerOutcome);resourceReleased=true;record(e,{resourceReleased:true});}
      catch(error){cleanupError=error;quarantine(e.binding,'Owner resource release failed');}
      if(e.cancelRequested&&!stopped)reusable=false;
      const error=e.cancelRequested?fail('INVOCATION_CANCELLED','Cancelled invocation result was not accepted'):
        cleanupError?fail('RESOURCE_CLEANUP_FAILED',cleanupError.message):outcome.status==='rejected'?outcome.error:null;
      e.state=e.cancelRequested?'cancelled':error?'failed':'completed';
      const report={notStarted:!e.dispatched,stopConfirmed:e.cancelRequested&&!!e.dispatched?stopped:false,originalTerminal:true,
        resourceReleased,reusable:reusable&&!e.binding.group.quarantined,quarantined:e.binding.group.quarantined};
      record(e,{originalTerminal:true,calculationStopped:stopped,resourceReleased,reusable:report.reusable,
        resultAccepted:!error&&outcome.status==='fulfilled',nativeOutcome:outcome.status,errorCode:error?.code??null});
      active.delete(e.invocation.id);
      if(!e.parent&&e.binding.group.active===e)e.binding.group.active=null;
      if(error)e.publicResult.reject(error);else e.publicResult.resolve(outcome.value);
      e.done.resolve(report);
      if(!e.parent)pump(e.binding.group);
      // Do not retain native results/errors or execute closures in queue history.
      e.execute=null;e.cancelAck=e.cancelAck?{stopped:e.cancelAck.stopped===true,notStarted:e.cancelAck.notStarted===true}:null;
    })();
  }
  async function enqueue(invocation,execute) {
    const e=prepare(invocation,execute);e.binding.group.pending.push(e);queueMicrotask(()=>pump(e.binding.group));return e.publicResult.promise;
  }
  async function cancelInvocation(id,requestedTarget) {
    const e=active.get(id);
    if(!e||!['queued','running','cancelling'].includes(e.state))throw fail('STALE_INVOCATION','Invocation is no longer a cancellable current target');
    if(!equalTarget(e.target,requestedTarget))throw fail('TARGET_MISMATCH','Cancel binding/owner/request/revision/token does not identify this invocation');
    if(e.state==='queued') {
      const group=e.binding.group;group.pending=group.pending.filter(item=>item!==e);
      settleUnstarted(e,fail('INVOCATION_CANCELLED','Queued invocation was removed before dispatch'));return e.done.promise;
    }
    if(e.binding.group.active!==e.root)throw fail('STALE_INVOCATION','Invocation no longer owns this active resource slot');
    beginCancel(e);return e.done.promise;
  }
  async function disconnectResource(requestedTarget,reason='Transport disconnected') {
    const binding=bindings.get(requestedTarget?.bindingId);
    if(!binding||binding.config.ownerId!==requestedTarget?.ownerId||binding.config.resourceGeneration!==requestedTarget?.resourceGeneration)throw fail('TARGET_MISMATCH','Disconnect does not identify the current owned resource generation');
    const current=[...active.values()].filter(e=>e.binding===binding&&['queued','running','cancelling','cleanup'].includes(e.state));
    const matched=current.find(e=>equalTarget(e.target,requestedTarget));
    if(current.length&&!matched)throw fail('TARGET_MISMATCH','Stale disconnect cannot invalidate a queued or active invocation');
    if(!current.length&&['invocationId','requestId','revision','activeToken'].some(k=>Object.hasOwn(requestedTarget,k)))throw fail('TARGET_MISMATCH','A retired invocation cannot disconnect an idle resource; use its explicit current resource identity');
    quarantine(binding,reason);
    if(matched){if(['running','cancelling'].includes(matched.state))beginCancel(matched);return matched.done.promise;}
    return {notStarted:true,stopConfirmed:false,originalTerminal:false,resourceReleased:false,reusable:false,quarantined:true};
  }
  function rebindResource(config,{verified,evidenceRef}={}) {
    if(closed)throw fail('QUEUE_DISPOSED','Queue is disposed');
    validateBinding(config);
    if(verified!==true||!text(evidenceRef))throw fail('REBIND_NOT_VERIFIED','Rebind requires explicit owner stop/reuse verification and evidence reference');
    const old=bindings.get(config.bindingId);
    if(!old||old.config.ownerId!==config.ownerId||(config.groupId??config.bindingId)!==old.group.groupId)throw fail('TARGET_MISMATCH','Rebind cannot silently change resource owner or executor group');
    if(old.group.active||old.group.pending.length)throw fail('RESOURCE_ACTIVE','Cannot rebind while invocations are queued or original operation/cleanup are active');
    if(old.generations.has(config.resourceGeneration))throw fail('RESOURCE_GENERATION_REUSED','Rebind requires a never-used explicit resource generation');
    old.generations.add(config.resourceGeneration);old.config={...config};old.quarantined=false;old.reason=null;old.verificationRef=evidenceRef;
    old.group.quarantined=[...bindings.values()].some(b=>b.group===old.group&&b.quarantined);
    pump(old.group);
  }
  async function drain(){await Promise.all([...active.values()].map(e=>e.done.promise));}
  async function dispose() {
    closed=true;
    for(const group of groups.values())for(const e of group.pending.splice(0))settleUnstarted(e,fail('INVOCATION_CANCELLED','Queue disposed before dispatch'));
    const roots=[...groups.values()].map(g=>g.active).filter(Boolean);
    for(const e of roots)if(['running','cancelling'].includes(e.state))beginCancel(e);
    await Promise.all(roots.map(e=>e.done.promise));
    return {disposed:true,quarantined:[...groups.values()].filter(g=>g.quarantined).map(g=>g.groupId)};
  }
  function inspect(){return {disposed:closed,groups:[...groups.values()].map(g=>({groupId:g.groupId,activeInvocationId:g.active?.invocation.id??null,queued:g.pending.map(e=>e.invocation.id),quarantined:g.quarantined})),invocations:[...records.values()].map(r=>({...r}))};}
  return Object.freeze({enqueue,cancelInvocation,disconnectResource,rebindResource,drain,dispose,inspect});
}

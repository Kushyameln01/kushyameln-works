import {createComputePool} from '../compute/client.mjs';
import {BUILD_ID} from '../compute/protocol.mjs';
import {prepareIndex,FIELD_WEIGHTS} from './model.mjs';
import {openStore,SCHEMA_VERSION} from './store.mjs';
import {KNOWLEDGE_KERNEL} from './kernel/registry.mjs';
export async function digest(value){const bytes=new TextEncoder().encode(JSON.stringify(value));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
const clone=x=>structuredClone(x);
export async function createLibrarySession(dataset,options={}) {
 const concurrency=options.concurrency??2,chunkSize=options.chunkSize??8192;
 if(![1,2,3,4].includes(concurrency)||!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>65536)throw RangeError('INVALID_SESSION_LIMITS');
 let prepared=prepareIndex(dataset);const inputHash=await digest(dataset),tokenTableHash=await digest(prepared.terms),datasetVersion=dataset.datasetVersion;
 const config={algorithmVersion:1,taskVersion:1,fieldWeights:FIELD_WEIGHTS,chunkSize,shardCount:concurrency};
 const configHash=await digest(config),identity={schemaVersion:SCHEMA_VERSION,algorithmVersion:1,taskVersion:1,wasmHash:KNOWLEDGE_KERNEL.sha256,datasetVersion:dataset.datasetVersion,inputHash,configHash,tokenTableHash,entryIds:prepared.entryIds};
 // Split once; only one shard serialization/digest is live at a time.
 let initialShards=Array.from({length:concurrency},(_,n)=>({shardId:`shard-${n}`,records:[]}));
 for(const record of prepared.records)initialShards[(record[1]-1)%concurrency].records.push(record);
 prepared.records=null;
 const expectedShards=[];
 for(const shard of initialShards){shard.recordsHash=await digest(shard.records);expectedShards.push({shardId:shard.shardId,count:shard.records.length,hash:shard.recordsHash});}
 const fingerprint=await digest(identity),store=await openStore(options.dbName);dataset=null;
 let run=null,pool=null,active=null,pending=null,pauseRequested=false,closed=false,closing=false,closePromise=null,queue=Promise.resolve(),lastError=null,result=null,metrics=[];
 const update=()=>{try{options.onUpdate?.(status());}catch{}};
 function status(){return {status:closed?'closed':closing?'closing':run?.status??'idle',runId:run?.runId??null,committedGeneration:run?.committedGeneration??0,shards:run?.shards.map(s=>({shardId:s.shardId,cursor:s.cursor,total:expectedShards.find(x=>x.shardId===s.shardId).count,done:s.done}))??[],resources:{inputRecords:(initialShards??[]).reduce((n,s)=>n+s.records.length,0)+(run?.shards??[]).reduce((n,s)=>n+(s.records?.length??0),0)},error:lastError,active:!!active||!!pending,pool:pool?.getStatus()??null};}
 function hydrate(next,previous=run){return {...next,shards:next.shards.map(s=>({...s,records:previous.shards.find(x=>x.shardId===s.shardId).records??null}))};}
 async function verify(saved){
  const r=saved.run;if(!r||r.fingerprint!==fingerprint||JSON.stringify(r.identity)!==JSON.stringify(identity))throw Error('INCOMPATIBLE_CHECKPOINT');
  if(typeof r.incarnation!=='string'||!/^[-a-f0-9]{36}$/.test(r.incarnation))throw Error('CORRUPT_INCARNATION');
  if(!Array.isArray(r.shards)||r.shards.length!==concurrency||r.shards.some((s,i)=>s.shardId!==expectedShards[i].shardId)||!Number.isSafeInteger(r.ownerEpoch)||r.ownerEpoch<1)throw Error('CORRUPT_SHARDS');
  if(saved.segments.some(seg=>seg.runId!==r.runId||!expectedShards.some(s=>s.shardId===seg.shardId)))throw Error('UNKNOWN_SEGMENT');
  if(r.committedGeneration!==r.shards.reduce((n,s)=>n+s.segmentId,0))throw Error('CORRUPT_GENERATION');
  for(const s of r.shards){
   const expected=expectedShards.find(x=>x.shardId===s.shardId);
   if(!Array.isArray(s.records)||s.records.length!==expected.count||s.recordsHash!==expected.hash||!Number.isSafeInteger(s.segmentId)||s.segmentId<0||typeof s.done!=='boolean'||s.done&&(s.cursor!==s.records.length||s.state!==null))throw Error('CORRUPT_INPUT');
   if(s.state&&(!['termId','docId','fieldId','count'].every(k=>Number.isSafeInteger(s.state[k])&&s.state[k]>0)||s.state.termId>prepared.terms.length||s.state.docId>prepared.entryIds.length||s.state.fieldId>4||s.state.count>s.cursor))throw Error('CORRUPT_STATE');
   if(await digest(s.records)!==s.recordsHash||!Number.isSafeInteger(s.cursor)||s.cursor<0||s.cursor>s.records.length||await digest({cursor:s.cursor,state:s.state,done:s.done,segmentId:s.segmentId})!==s.stateHash)throw Error('CORRUPT_CHECKPOINT');
   const segments=saved.segments.filter(x=>x.shardId===s.shardId).sort((a,b)=>a.segmentId-b.segmentId);
   if(segments.length!==s.segmentId)throw Error('MISSING_SEGMENT');
   for(let i=0;i<segments.length;i++){const seg=segments[i];if(seg.segmentId!==i||seg.key!==`${r.runId}:${s.shardId}:${i}`||!Array.isArray(seg.postings)||seg.postings.some(p=>!Array.isArray(p)||p.length!==4||p.some(v=>!Number.isSafeInteger(v)||v<1)||p[0]>prepared.terms.length||p[1]>prepared.entryIds.length||p[2]>4)||await digest(seg.postings)!==seg.hash)throw Error('CORRUPT_SEGMENT');}
  }
 }
 async function collect(){
  // Completed input remains durable; release the computing copy before DB readback.
  run={...run,shards:run.shards.map(s=>({...s,records:null}))};
  const saved=await store.read(run.runId);await verify(saved);
  // Complete saved-input verification is retained; it need not remain live with the final index.
  for(const shard of saved.run.shards)shard.records=null;
  result={terms:prepared.terms,entryIds:prepared.entryIds,postings:saved.segments.sort((a,b)=>a.shardId.localeCompare(b.shardId)||a.segmentId-b.segmentId).flatMap(s=>s.postings).sort((a,b)=>a[1]-b[1]||a[0]-b[0]||a[2]-b[2]),datasetVersion};return result;}
 async function shardLoop(shardId){
  while(!pauseRequested){
   const s=run.shards.find(s=>s.shardId===shardId);if(s.done)return;
   const records=s.records.slice(s.cursor,s.cursor+chunkSize),final=s.cursor+records.length===s.records.length;
   const jobId=`kl-${crypto.randomUUID()}`;let expectedGeneration;
   const req={protocolVersion:1,taskType:'knowledge-index-step',taskVersion:1,jobId,inputRevision:0,payload:{datasetVersion:identity.datasetVersion,algorithmVersion:1,inputHash,configHash,tokenTableHash,shardId,segmentId:s.segmentId,cursor:s.cursor,records,state:s.state,final,outputCapacity:65536},limits:{timeoutMs:30000}};
   const handle=pool.submit(req);expectedGeneration=pool.getStatus(jobId)?.generation;
   const response=await handle.promise;
   if(response.status!=='succeeded')throw Error(response.errorCode??response.status);
   if(response.protocolVersion!==1||response.buildId!==BUILD_ID||response.jobId!==jobId||response.inputRevision!==0||response.taskType!==req.taskType||response.taskVersion!==1||response.generation!==expectedGeneration)throw Error('RESPONSE_IDENTITY');
   const v=response.result;
   if(v.datasetVersion!==identity.datasetVersion||v.shardId!==shardId||v.segmentId!==s.segmentId||v.nextCursor!==s.cursor+v.consumed||v.consumed<0||v.consumed>records.length||(!v.done&&!v.consumed&&!v.postings.length))throw Error('RESPONSE_PROGRESS');
   const stateHash=await digest({cursor:v.nextCursor,state:v.state,done:v.done,segmentId:s.segmentId+1});
   const segment={shardId,segmentId:s.segmentId,postings:v.postings,hash:await digest(v.postings)};
   const checkpoint={cursor:v.nextCursor,state:v.state,done:v.done,stateHash};
   const commit=queue.then(async()=>{run=hydrate(await store.commit(run.runId,run.ownerEpoch,shardId,s.cursor,segment,checkpoint,run.incarnation));update();});queue=commit.catch(()=>{});await commit;
   metrics.push({jobId,generation:response.generation,workerId:response.workerId,instanceId:response.instanceId,status:response.status,metrics:response.metrics});pool.releaseResult(jobId);
  }
 }
 async function execute(){
  lastError=null;result=null;metrics=[];pool=createComputePool({concurrency,moduleReuse:false});run.status='running';update();
  try{
   const settled=await Promise.allSettled(run.shards.map(s=>shardLoop(s.shardId).catch(e=>{pauseRequested=true;throw e;})));
   const error=settled.find(s=>s.status==='rejected');if(error)throw error.reason;
   const done=run.shards.every(s=>s.done);run=hydrate(await store.mark(run.runId,run.ownerEpoch,done?'complete':'paused-saved',run.incarnation));if(done)await collect();
  }catch(e){lastError=String(e.message??e);run.status='stopped-unsaved';try{run=hydrate(await store.mark(run.runId,run.ownerEpoch,'stopped-unsaved',run.incarnation));}catch{};throw e;}
  finally{pool?.dispose();pool=null;active=null;update();}
  return status();
 }
 function launch(){if(closed||active)throw Error(closed?'SESSION_CLOSED':'SESSION_ACTIVE');active=execute();return active;}
 function begin(action){if(closed||closing||pending||active)throw Error('SESSION_UNAVAILABLE');pauseRequested=false;pending=action().finally(()=>{pending=null;update();});return pending;}
 function start({runId=crypto.randomUUID()}={}){return begin(async()=>{
  if(run)throw Error('SESSION_NOT_IDLE');
  if(!initialShards)throw Error('SESSION_INPUT_RELEASED');
  const stateHash=await digest({cursor:0,state:null,done:false,segmentId:0});
  let shards=initialShards.map(s=>({...s,cursor:0,state:null,done:false,segmentId:0,stateHash}));
  run=await store.create({runId,identity,fingerprint,ownerEpoch:1,committedGeneration:0,shards,status:'running',createdAt:new Date().toISOString()});initialShards=null;shards=null;return launch();
 });}
 function resume(runId){return begin(async()=>{
  // Expected identities/hashes are retained, not a second regenerated input copy.
  initialShards=null;if(run)run={...run,shards:run.shards.map(s=>({...s,records:null}))};
  let saved=await store.read(runId);await verify(saved);
  run=hydrate(await store.claim(runId,fingerprint,saved.run.committedGeneration,saved.run.incarnation),saved.run);saved=null;return launch();
 });}
 async function pause(){pauseRequested=true;const p=pending??active;if(p){try{await p;}catch{}}return status();}
 function close(){if(closePromise)return closePromise;closing=true;closePromise=(async()=>{await pause();pool?.dispose();store.close();result=null;run=null;prepared=null;initialShards=null;metrics=[];closed=true;closing=false;update();})();return closePromise;}
 return {start,resume,pause,close,status,result:()=>result,metrics:()=>clone(metrics)};
}

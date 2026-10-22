// DB v3 fences each run incarnation; v1/v2 inputs and checkpoints are preserved.
// Legacy runs receive a UUID during the atomic version upgrade; checkpoint schema stays v1.
export const SCHEMA_VERSION=1;
const withoutInputs=run=>({...run,inputRef:run.runId,shards:run.shards.map(({records,...shard})=>shard)});
const inputsFor=run=>({runId:run.runId,shards:run.shards.map(s=>({shardId:s.shardId,records:s.records??[]}))});
export function openStore(name='works-technical-library-v1') {
 return new Promise((resolve,reject)=>{
  let abandoned=false;const request=indexedDB.open(name,3);
  request.onupgradeneeded=()=>{
   const db=request.result,tx=request.transaction;
   if(!db.objectStoreNames.contains('runs'))db.createObjectStore('runs',{keyPath:'runId'});
   if(!db.objectStoreNames.contains('segments'))db.createObjectStore('segments',{keyPath:'key'});
   const segments=tx.objectStore('segments');if(!segments.indexNames.contains('runId'))segments.createIndex('runId','runId');
   const migrateInputs=!db.objectStoreNames.contains('inputs');
   const input=migrateInputs?db.createObjectStore('inputs',{keyPath:'runId'}):tx.objectStore('inputs');
   tx.objectStore('runs').openCursor().onsuccess=e=>{const c=e.target.result;if(c){const old=c.value;if(migrateInputs)input.put(inputsFor(old));const next=withoutInputs(old);if(next.incarnation===undefined)next.incarnation=crypto.randomUUID();c.update(next);c.continue();}};
  };
  request.onerror=()=>{abandoned=true;reject(request.error);};
  request.onblocked=()=>{abandoned=true;reject(Error('DB_UPGRADE_BLOCKED'));};
  request.onsuccess=()=>{const db=request.result;if(abandoned){db.close();return;}db.onversionchange=()=>db.close();resolve(new RunStore(db));};
 });
}
export class RunStore {
 constructor(db){this.db=db;}
 read(id){return new Promise((resolve,reject)=>{const tx=this.db.transaction(['runs','segments','inputs'],'readonly');let run,input,segments=[];tx.objectStore('runs').get(id).onsuccess=e=>{run=e.target.result;};tx.objectStore('inputs').get(id).onsuccess=e=>{input=e.target.result;};tx.objectStore('segments').index('runId').getAll(id).onsuccess=e=>{segments=e.target.result;};tx.oncomplete=()=>{try{if(run&&!input){reject(Error('MISSING_INPUT'));return;}if(run&&(!Array.isArray(run.shards)||!Array.isArray(input?.shards)))throw Error('CORRUPT_INPUT');resolve({run:run?{...run,shards:run.shards.map(s=>({...s,records:input.shards.find(x=>x.shardId===s.shardId)?.records}))}:run,segments});}catch(error){reject(Error('CORRUPT_INPUT'));}};tx.onabort=()=>reject(tx.error||Error('READ_ABORT'));});}
 mutate(id,change){return new Promise((resolve,reject)=>{let out,reason;const tx=this.db.transaction(['runs','segments','inputs'],'readwrite');tx.objectStore('runs').get(id).onsuccess=e=>{try{out=change(e.target.result,tx);if(out)tx.objectStore('runs').put(withoutInputs(out));}catch(error){reason=error;tx.abort();}};tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(reason||tx.error||Error('SAVE_ABORT'));});}
 create(run){run={...run,incarnation:crypto.randomUUID()};return new Promise((resolve,reject)=>{const tx=this.db.transaction(['runs','inputs'],'readwrite');let reason;tx.objectStore('runs').count().onsuccess=e=>{if(e.target.result>=8){reason=Error('RUN_LIMIT_8');tx.abort();return;}tx.objectStore('runs').add(withoutInputs(run));tx.objectStore('inputs').add(inputsFor(run));};tx.oncomplete=()=>resolve(run);tx.onabort=()=>reject(reason||tx.error||Error('CREATE_ABORT'));});}
 list(){return new Promise((resolve,reject)=>{const tx=this.db.transaction('runs','readonly'),q=tx.objectStore('runs').getAll();tx.oncomplete=()=>resolve(q.result.map(r=>({runId:r.runId,status:r.status,createdAt:r.createdAt,committedGeneration:r.committedGeneration})));tx.onabort=()=>reject(tx.error);});}
 delete(runId){return new Promise((resolve,reject)=>{const tx=this.db.transaction(['runs','inputs','segments'],'readwrite');tx.objectStore('runs').delete(runId);tx.objectStore('inputs').delete(runId);tx.objectStore('segments').index('runId').openKeyCursor(IDBKeyRange.only(runId)).onsuccess=e=>{const c=e.target.result;if(c){tx.objectStore('segments').delete(c.primaryKey);c.continue();}};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}
 claim(id,fingerprint,generation,incarnation){return this.mutate(id,run=>{if(!run)throw Error('RUN_MISSING');if(typeof incarnation!=='string'||run.incarnation!==incarnation)throw Error('STALE_INCARNATION');if(run.fingerprint!==fingerprint)throw Error('INCOMPATIBLE_INPUT');if(run.committedGeneration!==generation)throw Error('CHECKPOINT_CHANGED');return {...run,ownerEpoch:run.ownerEpoch+1,status:'running'};});}
 commit(id,epoch,shardId,expectedCursor,segment,checkpoint,incarnation){return this.mutate(id,(run,tx)=>{
  if(!run||run.ownerEpoch!==epoch)throw Error('STALE_OWNER');
  if(typeof incarnation!=='string'||run.incarnation!==incarnation)throw Error('STALE_INCARNATION');
  const shard=run.shards.find(s=>s.shardId===shardId);if(!shard||shard.cursor!==expectedCursor||shard.done)throw Error('STALE_SEGMENT');
  if(segment.segmentId!==shard.segmentId)throw Error('SEGMENT_SEQUENCE');
  tx.objectStore('segments').add({...segment,key:`${id}:${shardId}:${segment.segmentId}`,runId:id});
  return {...run,committedGeneration:run.committedGeneration+1,shards:run.shards.map(s=>s===shard?{...s,...checkpoint,segmentId:s.segmentId+1}:s)};
 });}
 mark(id,epoch,status,incarnation){return this.mutate(id,run=>{if(!run||run.ownerEpoch!==epoch)throw Error('STALE_OWNER');if(typeof incarnation!=='string'||run.incarnation!==incarnation)throw Error('STALE_INCARNATION');return {...run,status};});}
 close(){this.db.close();}
}

// Fixed anonymous metadata only. Raw local records must never enter this mapper.
// Transport is intentionally self-contained: no preprocessing modules or identities load.
export const TELEMETRY_CLIENT_LIMITS=Object.freeze({maxEvents:128,maxBytes:65536,maxAgeMs:900000,batchEvents:16,bodyBytes:16384,eventBytes:1024,timeoutMs:3000,maxAttempts:2});
export const TELEMETRY_BUILD='media-basic-b1';
export const BASELINE_ERROR_CODES=Object.freeze(['input_invalid','unsupported','budget_exceeded','decode_error','encode_error','hash_error','package_error','timeout','internal']);
export const BASELINE_STAGES=Object.freeze(['inputHash','decode','encode','outputHash','manifest','zip','blob','outputReady','total']);
const BASE='https://kushyameln-works.vde6fedxrbh7fbbb740t.chatgpt.site/api/media-telemetry/';
const SERVER_LIMITS=Object.freeze({grantTtlMs:3600000,activeSessions:128,sessionsPerDay:256,sessionEvents:256,sessionBytes:262144,eventBytes:1024,batchEvents:16,bodyBytes:16384,retainedEvents:50000});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INPUT_KEYS=['eventId','operationId','kind','task','sizeBand','cacheState','errorCode','durationsMs'];
const encoder=new TextEncoder(),mapped=new WeakSet();
const exact=(value,keys)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function invalid(){throw new TypeError('INVALID_EVENT');}
function uuid(value){return typeof value==='string'&&UUID.test(value);}
export function makeBaselineEvent(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!INPUT_KEYS.includes(k)))invalid();
  const {operationId,kind,task,sizeBand='unknown',cacheState='unknown',errorCode=null}=input;
  const eventId=Object.hasOwn(input,'eventId')?input.eventId:crypto.randomUUID();
  if(!uuid(eventId)||!uuid(operationId)||!['image-decode','video-decode'].includes(task)||!['start','complete','failed','cancelled'].includes(kind)||!['unknown','lt1mp','1to4mp','4to16mp','gte16mp'].includes(sizeBand)||!['cold','warm','unknown'].includes(cacheState)||(kind==='complete'&&sizeBand==='unknown'))invalid();
  if(kind==='failed'?!BASELINE_ERROR_CODES.includes(errorCode):errorCode!==null)invalid();
  const values=input.durationsMs??{};if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(k=>!BASELINE_STAGES.includes(k)))invalid();
  const durationsMs={};for(const key of BASELINE_STAGES){const value=Object.hasOwn(values,key)?values[key]:null;if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>3600000))invalid();if(kind==='start'&&value!==null)invalid();durationsMs[key]=value===null?null:+value;}
  const event=Object.freeze({eventId,operationId,jobId:null,scope:'operation',kind,build:TELEMETRY_BUILD,task,taskVersion:1,kernelHash:null,variant:'none',workers:0,sizeBand,cacheState,errorCode,durationsMs:Object.freeze(durationsMs)});
  if(encoder.encode(JSON.stringify(event)).byteLength>TELEMETRY_CLIENT_LIMITS.eventBytes)invalid();mapped.add(event);return event;
}
export function sizeBandForPixels(pixels){if(!Number.isSafeInteger(pixels)||pixels<0)invalid();return pixels<1000000?'lt1mp':pixels<4000000?'1to4mp':pixels<16000000?'4to16mp':'gte16mp';}

class TransportFailure extends Error{constructor(code){super(code);this.code=code;}}
async function readSmallJSON(response,signal){
  if(!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel().catch(()=>{});throw new TransportFailure('invalid_response');}
  const reader=response.body?.getReader();if(!reader)throw new TransportFailure('invalid_response');const chunks=[];let bytes=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>TELEMETRY_CLIENT_LIMITS.bodyBytes){await reader.cancel().catch(()=>{});throw new TransportFailure('invalid_response');}chunks.push(next.value);}}
  finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
  const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}catch{throw new TransportFailure('invalid_response');}
}
function validGrant(value,time){
  return exact(value,['schemaVersion','sessionId','token','expiresAt','limits'])&&value.schemaVersion===1&&uuid(value.sessionId)&&typeof value.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value.token)&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>time&&value.expiresAt<=time+SERVER_LIMITS.grantTtlMs&&exact(value.limits,Object.keys(SERVER_LIMITS))&&Object.entries(SERVER_LIMITS).every(([key,n])=>value.limits[key]===n);
}
function validAck(value,entries){
  if(!exact(value,['schemaVersion','receipt','accepted','duplicate','receivedAt'])||value.schemaVersion!==1||value.receipt!=='stored'||!Array.isArray(value.accepted)||!Array.isArray(value.duplicate)||!Number.isSafeInteger(value.receivedAt)||value.receivedAt<0)return false;
  const expected=new Set(entries.map(e=>e.event.eventId)),ids=[...value.accepted,...value.duplicate];return ids.length===expected.size&&new Set(ids).size===expected.size&&ids.every(id=>typeof id==='string'&&expected.has(id));
}
export function createTelemetryClient({fetchImpl=globalThis.fetch?.bind(globalThis),now=()=>Date.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){
  const L=TELEMETRY_CLIENT_LIMITS,queue=[],counts={generated:0,queued:0,attempted:0,stored:0,duplicate:0,rejected:0,expired:0,dropped:0},reasons={};
  let pendingBytes=0,disposed=false,grant=null,sessionState='unused',grantAttempts=0,inFlight=null,activeRequest=null,drainSnapshot=null,lastError=null;
  function note(reason,n=1){reasons[reason]=(reasons[reason]??0)+n;lastError=reason;}
  function remove(entries,bucket,reason){for(const entry of entries){const i=queue.indexOf(entry);if(i<0)continue;queue.splice(i,1);drainSnapshot?.delete(entry);pendingBytes-=entry.bytes;entry.outcome=bucket??'acknowledged';entry.reason=reason;if(bucket)counts[bucket]++;if(reason)note(reason);}}
  function prune(){const time=now();remove(queue.filter(e=>time-e.createdAt>=L.maxAgeMs),'expired','queue_age');if(grant&&time>=grant.expiresAt){grant=null;sessionState='expired';remove([...queue],'expired','session_expired');}}
  function status(){prune();return Object.freeze({...counts,pending:queue.length,pendingBytes,disposed,inFlight:!!inFlight,sessionState,lastError,reasons:Object.freeze({...reasons})});}
  function enqueue(event){
    counts.generated++;prune();
    if(disposed){counts.dropped++;note('disposed');return false;}
    if(sessionState==='expired'){counts.expired++;note('session_expired');return false;}
    if(sessionState==='unavailable'){counts.dropped++;note('session_unavailable');return false;}
    if(!event||typeof event!=='object'||!mapped.has(event)){counts.rejected++;note('invalid_event');return false;}
    if(queue.some(e=>e.event.eventId===event.eventId)){counts.rejected++;note('duplicate_pending');return false;}
    const canonical=JSON.stringify(event),bytes=encoder.encode(canonical).byteLength;
    if(queue.length>=L.maxEvents||pendingBytes+bytes>L.maxBytes){counts.dropped++;note('queue_capacity');return false;}
    queue.push({event,canonical,bytes,createdAt:now(),attempts:0});pendingBytes+=bytes;counts.queued++;return true;
  }
  async function request(path,body,authorization){
    const controller=new AbortController();activeRequest=controller;let timer,abortListener;
    const cancelled=new Promise((resolve,reject)=>{abortListener=()=>reject(new TransportFailure(disposed?'disposed':'timeout'));controller.signal.addEventListener('abort',abortListener,{once:true});timer=setTimer(()=>controller.abort(),L.timeoutMs);});
    const work=(async()=>{
      if(typeof fetchImpl!=='function')throw new TransportFailure('network');
      const response=await fetchImpl(BASE+path,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json',...(authorization?{'X-Media-Grant':authorization}:{})},body,signal:controller.signal});
      if(response.status!==200&&response.status!==201){await response.body?.cancel().catch(()=>{});return {status:response.status};}
      return {status:response.status,value:await readSmallJSON(response,controller.signal)};
    })();
    try{return await Promise.race([work,cancelled]);}
    catch(error){throw error instanceof TransportFailure?error:new TransportFailure('network');}
    finally{clearTimer(timer);controller.signal.removeEventListener('abort',abortListener);if(activeRequest===controller)activeRequest=null;}
  }
  async function acquire(){
    if(grant)return true;if(sessionState!=='unused')return false;
    while(grantAttempts<L.maxAttempts&&!disposed){
      grantAttempts++;
      try{
        const reply=await request('session','{"schemaVersion":1}');
        if(disposed)return false;
        if(reply.status===503){note('unavailable');continue;}
        if(reply.status!==201){sessionState='unavailable';note('http_rejected');return false;}
        if(!validGrant(reply.value,now())){sessionState='unavailable';note('invalid_grant_response');return false;}
        grant={sessionId:reply.value.sessionId,token:reply.value.token,expiresAt:reply.value.expiresAt};sessionState='active';return true;
      }catch(error){if(disposed)return false;note(error.code==='invalid_response'?'invalid_grant_response':error.code);if(error.code==='invalid_response'){sessionState='unavailable';return false;}}
    }
    sessionState='unavailable';return false;
  }
  async function drain(snapshot){
    if(!await acquire()){if(!disposed)remove([...queue],'dropped',lastError??'session_unavailable');return;}
    while(!disposed){
      prune();if(!grant)return;
      const batch=[];let body;
      for(const entry of snapshot){if(!queue.includes(entry))continue;const proposed=[...batch,entry],next='{"schemaVersion":1,"events":['+proposed.map(e=>e.canonical).join(',')+']}';if(proposed.length>L.batchEvents||encoder.encode(next).byteLength>L.bodyBytes)break;batch.push(entry);body=next;}
      if(!batch.length)return;
      for(const entry of batch){entry.attempts++;counts.attempted++;}
      try{
        const reply=await request('events',body,grant.sessionId+'.'+grant.token);
        if(disposed)return;
        if(reply.status===503){note('unavailable');remove(batch.filter(e=>e.attempts>=L.maxAttempts),'dropped','unavailable');continue;}
        if(reply.status===401){grant=null;sessionState='expired';remove([...queue],'expired','session_expired');return;}
        if(reply.status!==200){remove(batch,'rejected','http_rejected');continue;}
        if(!validAck(reply.value,batch)){remove(batch,'rejected','invalid_ack');continue;}
        const accepted=new Set(reply.value.accepted);for(const entry of batch){
          if(!queue.includes(entry)){
            // An on-time request can ACK after an age/expiry status check removed it.
            // Durable receipt supersedes the provisional uncollected classification.
            if(entry.outcome!=='expired')continue;counts.expired--;if(reasons[entry.reason]>0)reasons[entry.reason]--;entry.outcome='acknowledged';
          }
          counts[accepted.has(entry.event.eventId)?'stored':'duplicate']++;remove([entry]);
        }
      }catch(error){
        if(disposed)return;
        const reason=error.code==='invalid_response'?'invalid_ack':error.code;note(reason);
        if(error.code==='invalid_response')remove(batch,'rejected','invalid_ack');else remove(batch.filter(e=>e.attempts>=L.maxAttempts),'dropped',reason);
      }
    }
  }
  function flush(){
    prune();if(inFlight)return inFlight;if(disposed||!queue.length)return Promise.resolve(status());
    const snapshot=new Set(queue);drainSnapshot=snapshot;inFlight=drain(snapshot).catch(()=>{if(!disposed){remove([...snapshot],'dropped','internal');sessionState='unavailable';grant=null;}}).then(()=>{drainSnapshot=null;inFlight=null;return status();});return inFlight;
  }
  function dispose(){if(disposed)return;disposed=true;activeRequest?.abort();remove([...queue],'dropped','disposed');grant=null;sessionState='disposed';}
  return Object.freeze({enqueue,flush,status,dispose});
}

// A failed/expired grant is terminal for one client, not for future user operations.
export function refreshTelemetryClient(current,factory=createTelemetryClient){
  if(["expired","unavailable","disposed"].includes(current.status().sessionState)){current.dispose();return factory();}
  return current;
}

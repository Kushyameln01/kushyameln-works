/**
 * E5 local artifact cache; no native module imports or implicit live-state reads.
 * Retained-byte budget = canonical key/metadata/ownership UTF-8 + binary bytes
 * (whole backing buffer for leases). This is logical retention, not JS heap or
 * transient caller-owned read copies. Reader state is an explicit observation.
 *
 * Key spec: modules[{moduleId,moduleVersion,nativeVersion,buildId,sourceRef}],
 * modelBindings[],tokenizerBindings[],profileRef,config,inputHashes[{inputId,sha256}],
 * maskHash(null or SHA-256),context,adapterBindings[{adapterId,adapterVersion,state,
 * config,sourceRef}],dependencies[{dependencyId,revision}]. Optional JSON fields
 * (including native LoRA selections) are preserved and hashed, never interpreted.
 * Reader state: {readerOwnerId,revisionBindings,leases:[]}. A current lease record
 * has leaseId/ownerId/holderId/revision/valid:true/immutable:true.
 *
 * put keeps the caller's binary alive until adoption; it copies after budget
 * eviction finishes, so callers must retain their input until the Promise ends.
 * get always returns an independent owned binary copy, including leased entries.
 * Shared/resizable/detached buffers are rejected. A lease identity/revision is
 * adopted once per cache lifetime; reacquisition needs a new owner-issued lease.
 * release is attempted once per owned entry. Failed cleanup retains accounting
 * and blocks adoption; confirmReleased(key,{ownerId,entryId,evidenceRef,lease?})
 * requires this exact retained entry. A lease proof also binds leaseId,
 * leaseOwnerId and leaseRevision. Entry IDs include a generated cryptographic
 * cache-instance nonce, so stale proof cannot target a new same-key entry or a
 * recreated cache. Recovery never repeats an uncertain native release.
 * No handle cloning or disposal
 * of an unrelated original owner is performed.
 */
import {canonicalize,canonicalBytes,hashCanonical} from './canonical.mjs';

export const CACHE_KEY_VERSION='works-artifact-cache/1.0-draft.1';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.length>0;
const sha=v=>typeof v==='string'&&/^[a-f\d]{64}$/.test(v);
const revision=v=>text(v)||(Number.isSafeInteger(v)&&v>=0);
const same=(a,b)=>canonicalize(a)===canonicalize(b);
const error=(code,message)=>Object.assign(new Error(message),{name:'ArtifactCacheError',code});
const fail=(code,message)=>{throw error(code,message);};
function json(value,code){try{return JSON.parse(canonicalize(value));}catch(e){fail(code,e.message);}}
function source(s){return object(s)&&((text(s.repository)&&text(s.path)&&/^[a-f\d]{40}$/.test(s.commit))||(text(s.archiveRef)&&sha(s.sha256)));}
function validateSpec(s) {
  const required=['modules','modelBindings','tokenizerBindings','profileRef','config','inputHashes','maskHash','context','adapterBindings','dependencies'];
  if(!object(s)||required.some(k=>!Object.hasOwn(s,k)))fail('INVALID_CACHE_KEY','All cache dependency dimensions must be explicit.');
  if(s.cacheKeyVersion!==undefined&&s.cacheKeyVersion!==CACHE_KEY_VERSION)fail('INVALID_CACHE_KEY','Unknown cache key version.');
  if(!Array.isArray(s.modules)||!s.modules.length||s.modules.some(m=>!object(m)||!['moduleId','moduleVersion','nativeVersion','buildId'].every(k=>text(m[k]))||!source(m.sourceRef)))fail('INVALID_CACHE_KEY','Pinned module/native/build identities are required.');
  for(const field of ['modelBindings','tokenizerBindings'])if(!Array.isArray(s[field])||s[field].some(i=>!object(i)||!['identityKind','role','algorithm','value','scope'].every(k=>text(i[k]))||(i.algorithm==='sha256'&&!sha(i.value))))fail('INVALID_CACHE_KEY',`${field} must explicitly list role-scoped identities.`);
  if(!text(s.profileRef)||!object(s.config)||!Array.isArray(s.inputHashes)||s.inputHashes.some(h=>!object(h)||!text(h.inputId)||!sha(h.sha256))||(s.maskHash!==null&&!sha(s.maskHash)))fail('INVALID_CACHE_KEY','Profile/config/input hashes and optional mask hash must be explicit.');
  if(!Array.isArray(s.adapterBindings)||s.adapterBindings.some(a=>!object(a)||!['adapterId','adapterVersion','state'].every(k=>text(a[k]))||!object(a.config)||!source(a.sourceRef)))fail('INVALID_CACHE_KEY','Used adapters require explicit identity/state/config/source; no-adapter is an empty array.');
  if(!Array.isArray(s.dependencies)||!s.dependencies.length||s.dependencies.some(d=>!object(d)||!text(d.dependencyId)||!revision(d.revision))||new Set(s.dependencies.map(d=>d.dependencyId)).size!==s.dependencies.length)fail('INVALID_CACHE_KEY','Unique explicit revision dependencies are required.');
}
export async function buildArtifactCacheKey(spec) {
  const copied=json(spec,'INVALID_CACHE_KEY');validateSpec(copied);
  const descriptor={...copied,cacheKeyVersion:CACHE_KEY_VERSION};
  return {key:`${CACHE_KEY_VERSION}:${await hashCanonical(descriptor)}`,descriptor};
}
function reader(value) {
  const s=json(value,'CACHE_STATE_REQUIRED');
  if(!object(s)||!text(s.readerOwnerId)||!object(s.revisionBindings)||!Array.isArray(s.leases))fail('CACHE_STATE_REQUIRED','Reader owner, current revisionBindings and current leases must be explicit.');
  return s;
}
function stale(descriptor,state) {return descriptor.dependencies.filter(d=>!Object.hasOwn(state.revisionBindings,d.dependencyId)||!same(d.revision,state.revisionBindings[d.dependencyId])).map(d=>d.dependencyId);}
function leaseCurrent(ownership,state) {
  if(ownership.mode!=='lease')return true;
  return state.leases.some(l=>object(l)&&l.leaseId===ownership.leaseId&&l.ownerId===ownership.leaseOwnerId&&l.holderId===ownership.ownerId&&revision(l.revision)&&same(l.revision,ownership.leaseRevision)&&l.valid===true&&l.immutable===true);
}
const types={Uint8Array,Uint8ClampedArray,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array};
function binary(value) {
  try {
    if(typeof SharedArrayBuffer!=='undefined'&&(value instanceof SharedArrayBuffer||value?.buffer instanceof SharedArrayBuffer))fail('CACHE_BINARY_INVALID','Shared-memory cache aliases are not accepted.');
    const backing=value instanceof ArrayBuffer?value:ArrayBuffer.isView(value)?value.buffer:null;
    if(backing?.resizable===true)fail('CACHE_BINARY_INVALID','Resizable buffers cannot be retained under a fixed cache byte budget.');
    if(backing)new Uint8Array(backing,0,0); // Throws for detached backing storage, including zero-length views.
    if(value instanceof ArrayBuffer)return {value,type:'ArrayBuffer',byteLength:value.byteLength,bufferByteLength:value.byteLength};
    if(value instanceof DataView)return {value,type:'DataView',byteLength:value.byteLength,bufferByteLength:value.buffer.byteLength};
    const type=Object.prototype.toString.call(value).slice(8,-1);
    if(ArrayBuffer.isView(value)&&Object.hasOwn(types,type))return {value,type,byteLength:value.byteLength,bufferByteLength:value.buffer.byteLength};
  }catch(e){if(e.code)throw e;fail('CACHE_BINARY_INVALID',e.message);}
  fail('CACHE_BINARY_INVALID','Cache payload must be local binary bytes, not a runtime handle or JSON numeric array.');
}
function copyBinary(info) {
  try {
    const value=info.value;
    const raw=value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
    const buffer=new Uint8Array(raw).buffer;
    return info.type==='ArrayBuffer'?buffer:info.type==='DataView'?new DataView(buffer):new types[info.type](buffer);
  }catch(e){fail('CACHE_BINARY_INVALID',`Binary source was detached or unavailable before adoption: ${e.message}`);}
}
const keyId=k=>typeof k==='string'?k:k?.key;

export function createArtifactCache({maxBytes,ownerId,release}={}) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0||!text(ownerId)||typeof release!=='function')fail('INVALID_CACHE_CONFIG','Cache requires safe maxBytes, ownerId and its release callback.');
  if(typeof globalThis.crypto?.getRandomValues!=='function')fail('CACHE_INSTANCE_ID_UNAVAILABLE','Web Crypto randomness is required for non-reusable cache resource identities.');
  const nonce=globalThis.crypto.getRandomValues(new Uint8Array(32));
  const cacheInstanceId=Array.from(nonce,n=>n.toString(16).padStart(2,'0')).join('');
  const entries=new Map(),adoptedLeases=new Set();let retainedBytes=0,sequence=0,tail=Promise.resolve();
  const serial=fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;};
  const leaseIdentity=ownership=>({leaseId:ownership.leaseId,leaseOwnerId:ownership.leaseOwnerId,leaseRevision:ownership.leaseRevision});
  function snapshot(){return {ownerId,cacheInstanceId,maxBytes,retainedBytes,entries:[...entries.values()].map(e=>({entryId:e.entryId,key:e.key,status:e.status,byteLength:e.byteLength,releaseAttempted:e.releaseAttempted,error:e.error??null,lease:e.ownership.mode==='lease'?leaseIdentity(e.ownership):null}))};}
  function drop(e){if(entries.get(e.key)===e){entries.delete(e.key);retainedBytes-=e.byteLength;}e.payload=null;}
  async function releaseEntry(e,reason) {
    if(e.releaseAttempted)return false;
    e.releaseAttempted=true;e.status='releasing';
    try {
      await release({entryId:e.entryId,key:e.key,ownerId,byteLength:e.byteLength,payload:e.payload,ownership:json(e.ownership,'CACHE_METADATA_INVALID'),reason});
      drop(e);return true;
    }catch(cause){e.status='recovery-required';e.error=String(cause?.message??cause);return false;}
  }
  function summary(invalidated){return {status:[...entries.values()].some(e=>e.status==='recovery-required')?'recovery-required':'complete',invalidated,
    recoveryRequired:[...entries.values()].filter(e=>e.status==='recovery-required').map(e=>({key:e.key,entryId:e.entryId,error:e.error})),retainedBytes};}
  function put(input,currentState) {
    let captured;
    try {
      if(!object(input)||!object(input.key))fail('INVALID_CACHE_KEY','put requires a key returned by the versioned key builder.');
      const descriptor=json(input.key.descriptor,'INVALID_CACHE_KEY');validateSpec(descriptor);
      if(descriptor.cacheKeyVersion!==CACHE_KEY_VERSION)fail('INVALID_CACHE_KEY','Adoption requires the explicit supported version in the canonical key descriptor.');
      const metadata=json(input.metadata,'CACHE_METADATA_INVALID'),ownership=json(input.ownership,'CACHE_OWNER_MISMATCH');
      if(ownership.ownerId!==ownerId)fail('CACHE_OWNER_MISMATCH','Only this cache owner may assign or release its retained resource.');
      if(!['copy','lease'].includes(ownership.mode))fail('CACHE_OWNER_MISMATCH','Ownership must explicitly be copy or lease.');
      if(ownership.mode==='lease'&&(!text(ownership.leaseId)||!text(ownership.leaseOwnerId)||!revision(ownership.leaseRevision)||ownership.immutable!==true))fail('CACHE_LEASE_INVALID','Leased payload requires explicit immutable lease identity.');
      captured={key:input.key.key,descriptor,metadata,ownership,payload:input.payload,state:reader(currentState)};
      binary(input.payload);
    }catch(cause){return Promise.reject(cause);}
    return serial(async()=>{
      const c=captured;
      if(c.key!==`${CACHE_KEY_VERSION}:${await hashCanonical(c.descriptor)}`)fail('CACHE_KEY_DIGEST_MISMATCH','Cache key digest does not match its canonical descriptor.');
      if(stale(c.descriptor,c.state).length)fail('CACHE_STALE_INPUT','Current explicit dependency revisions differ from the artifact key.');
      if(!leaseCurrent(c.ownership,c.state))fail('CACHE_LEASE_INVALID','The declared immutable lease is not current for this owner.');
      const leaseId=c.ownership.mode==='lease'?canonicalize([c.ownership.leaseOwnerId,c.ownership.leaseId,c.ownership.leaseRevision]):null;
      if(leaseId&&adoptedLeases.has(leaseId))fail('CACHE_LEASE_ALREADY_HELD','A lease identity/revision cannot be reused after adoption or uncertain release.');
      const info=binary(c.payload),payloadBytes=c.ownership.mode==='lease'?info.bufferByteLength:info.byteLength;
      const byteLength=canonicalBytes(c.descriptor).byteLength+canonicalBytes(c.metadata).byteLength+canonicalBytes(c.ownership).byteLength+payloadBytes;
      if(!Number.isSafeInteger(byteLength)||byteLength>maxBytes)fail('CACHE_BUDGET_EXCEEDED','Entry exceeds the cache retained-byte limit.');
      const existing=entries.get(c.key);
      if(existing&&!await releaseEntry(existing,'replacement'))fail('CACHE_RELEASE_FAILED','Existing cache resource was not confirmed released; replacement was not adopted.');
      while(retainedBytes+byteLength>maxBytes) {
        const oldest=entries.values().next().value;
        if(!oldest||!await releaseEntry(oldest,'eviction'))fail('CACHE_RELEASE_FAILED','LRU resource remains retained after failed cleanup; new artifact was not adopted.');
      }
      const payload=c.ownership.mode==='copy'?copyBinary(info):info.value;
      const e={entryId:`${ownerId}:cache:${cacheInstanceId}:entry:${++sequence}`,key:c.key,descriptor:c.descriptor,metadata:c.metadata,ownership:c.ownership,payload,
        byteLength,status:'active',releaseAttempted:false};
      entries.set(e.key,e);retainedBytes+=byteLength;if(leaseId)adoptedLeases.add(leaseId);
      return {status:'stored',key:e.key,entryId:e.entryId,byteLength,retainedBytes};
    });
  }
  function get(key,currentState) {
    let s;try{s=reader(currentState);}catch(cause){return Promise.reject(cause);}
    const id=keyId(key);
    return serial(async()=>{
      const e=entries.get(id);if(!e)return {status:'miss',key:id};
      if(e.status!=='active')return {status:'recovery-required',key:id,entryId:e.entryId};
      const changed=stale(e.descriptor,s);if(changed.length)return {status:'stale',key:id,dependencyIds:changed};
      if(!leaseCurrent(e.ownership,s))return {status:'lease-expired',key:id};
      const payload=copyBinary(binary(e.payload));
      entries.delete(id);entries.set(id,e);
      return {status:'hit',key:id,entryId:e.entryId,metadata:json(e.metadata,'CACHE_METADATA_INVALID'),payload,
        ownership:{ownerId:s.readerOwnerId,mode:'copy'},sourceOwnership:json(e.ownership,'CACHE_METADATA_INVALID')};
    });
  }
  function invalidateArtifacts(change) {
    let c;try{c=json(change,'INVALID_CACHE_CHANGE');if(!object(c)||!text(c.dependencyId)||!revision(c.revision))fail('INVALID_CACHE_CHANGE','Invalidation requires one explicit dependency ID and its new revision.');}catch(cause){return Promise.reject(cause);}
    return serial(async()=>{
      const invalidated=[];
      for(const e of [...entries.values()])if(e.descriptor.dependencies.some(d=>d.dependencyId===c.dependencyId&&!same(d.revision,c.revision))) {
        if(await releaseEntry(e,'dependency-change'))invalidated.push(e.key);
      }
      return summary(invalidated);
    });
  }
  const clear=()=>serial(async()=>{const invalidated=[];for(const e of [...entries.values()])if(await releaseEntry(e,'clear'))invalidated.push(e.key);return summary(invalidated);});
  function confirmReleased(key,proof) {
    let p;try{p=json(proof,'CACHE_RECOVERY_PROOF_REQUIRED');if(!object(p))fail('CACHE_RECOVERY_PROOF_REQUIRED','Explicit owner proof is required.');if(p.ownerId!==ownerId)fail('CACHE_OWNER_MISMATCH','Only the cache owner may reconcile uncertain cleanup.');if(!text(p.entryId)||!text(p.evidenceRef))fail('CACHE_RECOVERY_PROOF_REQUIRED','Exact retained entry identity and explicit owner evidence of completed release are required.');}catch(cause){return Promise.reject(cause);}
    return serial(async()=>{
      const e=entries.get(keyId(key));if(!e||e.status!=='recovery-required')fail('CACHE_RECOVERY_NOT_REQUIRED','Only a retained failed-release entry can be reconciled.');
      if(e.entryId!==p.entryId)fail('CACHE_RECOVERY_TARGET_MISMATCH','Release proof belongs to a different resource entry or cache instance.');
      if(e.ownership.mode==='lease'&&(!object(p.lease)||!same(p.lease,leaseIdentity(e.ownership))))fail('CACHE_RECOVERY_TARGET_MISMATCH','Release proof does not identify the retained native lease ownership.');
      drop(e);return {status:'released-confirmed',key:keyId(key),entryId:e.entryId,evidenceRef:p.evidenceRef,retainedBytes};
    });
  }
  return Object.freeze({put,get,invalidateArtifacts,clear,confirmReleased,inspect:snapshot});
}

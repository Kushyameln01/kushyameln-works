import {BUILD_ID} from '../api/build-info.mjs';
const PROTOCOL_VERSION='diffusion-models/0.1';
export const MAX_TRANSPORT_READ_BYTES=4*1024*1024;
export const MAX_SOURCE_READ_BYTES=16*1024*1024;
const SHA=/^[a-f0-9]{64}$/;
const validId=v=>typeof v==='string'&&v.length>=1&&v.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&v>=0;
function fail(code,message){throw Object.assign(new Error(message),{code});}
const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
const checkSignal=signal=>signal?.throwIfAborted();
const aborted=signal=>signal?.reason??new DOMException('LoRA source read aborted','AbortError');

// An SDK source over a caller-supplied JS/MessagePort Promise transport.
// Per transport read <=4 MiB; a logical SDK read <=16 MiB is assembled serially.
// This module performs byte IO/integrity checks, never LoRA arithmetic/application.
export function createLoraSource({request,sessionId,binding,inputRevision}={}){
 if(typeof request!=='function'||!validId(sessionId)||!integer(inputRevision))throw TypeError('Explicit request transport, sessionId and nonnegative inputRevision required');
 if(!binding||!validId(binding.bindingId)||!['HIGH','LOW'].includes(binding.stage)||!integer(binding.fileBytes)||binding.fileBytes<8||!SHA.test(binding.headerSHA256)||!SHA.test(binding.fullFileSHA256))throw TypeError('Verified loadLora binding required');
 const expected=Object.freeze({bindingId:binding.bindingId,stage:binding.stage,fileBytes:binding.fileBytes,headerSHA256:binding.headerSHA256,fullFileSHA256:binding.fullFileSHA256});
 let busy=false;
 const envelope=(op,input)=>({buildId:BUILD_ID,protocolVersion:PROTOCOL_VERSION,sessionId,jobId:'lora-source-'+crypto.randomUUID(),inputRevision,op,input});
 function bound(value){
  if(!value||Object.keys(expected).some(key=>value[key]!==expected[key]))fail('SOURCE_IDENTITY_CHANGED','LoRA source binding, stage, size or verified hashes changed');
 }
 async function invoke(op,input,signal){
  checkSignal(signal);const q=envelope(op,input);let sent=false,settled=false,rejectAbort;
  const abortPromise=new Promise((_,reject)=>{rejectAbort=reject;});
  // Synchronous transport errors/abort may occur before Promise.race attaches.
  void abortPromise.catch(()=>{});
  const onAbort=()=>{
   if(sent&&!settled){
    const cancel=envelope('cancel',{jobId:q.jobId,inputRevision:q.inputRevision});
    // The target is this exact job. A late cancellation cannot cancel another job.
    try{void Promise.resolve(request(cancel)).catch(()=>{});}catch{}
   }
   rejectAbort(aborted(signal));
  };
  signal?.addEventListener('abort',onAbort,{once:true});
  try{
   checkSignal(signal);sent=true;
   const pending=Promise.resolve(request(q));
   const reply=await Promise.race([pending,abortPromise]);settled=true;checkSignal(signal);
   if(!reply||['buildId','protocolVersion','sessionId','jobId','inputRevision','op'].some(key=>reply[key]!==q[key]))fail('INVALID_SOURCE_RESPONSE','LoRA source response identity mismatch');
   if(reply.status!=='ok')fail(reply.error?.code??'SOURCE_REQUEST_FAILED',reply.error?.message??'LoRA source request failed');
   return reply.result;
  }finally{settled=true;signal?.removeEventListener('abort',onAbort);}
 }
 async function confirm(signal){
  const result=await invoke('listLoras',{},signal);checkSignal(signal);
  if(!Array.isArray(result?.bindings)||result.applied!==false)fail('INVALID_SOURCE_RESPONSE','Invalid LoRA binding list');
  const matches=result.bindings.filter(value=>value.bindingId===expected.bindingId);
  if(matches.length!==1)fail('SOURCE_BINDING_UNAVAILABLE','LoRA source was unloaded, replaced or disposed');
  bound(matches[0]);return matches[0].fullFileSHA256;
 }
 async function tracked(action,signal){
  checkSignal(signal);if(busy)fail('SOURCE_BUSY','LoRA source is busy; logical reads and hash checks are serialized');
  busy=true;try{return await action();}finally{busy=false;}
 }
 return Object.freeze({size:expected.fileBytes,
  async read(offset,length,{signal}={}){
   return tracked(async()=>{
    if(!integer(offset)||!integer(length)||offset>expected.fileBytes||length>expected.fileBytes-offset||length>MAX_SOURCE_READ_BYTES)throw RangeError('LoRA source byte range or 16 MiB logical read budget exceeded');
    checkSignal(signal);
    // Even an empty read must not make an old/unloaded binding appear current.
    if(length===0){await confirm(signal);checkSignal(signal);return new Uint8Array();}
    const assembled=new Uint8Array(length);
    for(let done=0;done<length;){
     checkSignal(signal);const take=Math.min(MAX_TRANSPORT_READ_BYTES,length-done),byteOffset=offset+done;
     const result=await invoke('readLoraSource',{bindingId:expected.bindingId,stage:expected.stage,byteOffset,byteLength:take},signal);bound(result);
     if(result.applied!==false||result.byteOffset!==byteOffset||result.byteLength!==take||!(result.data instanceof Uint8Array)||result.data.byteLength!==take||!SHA.test(result.rangeSHA256))fail('INVALID_SOURCE_RESPONSE','Invalid LoRA source range descriptor or bytes');
     const owned=new Uint8Array(result.data);checkSignal(signal);
     if(await digest(owned)!==result.rangeSHA256)fail('SOURCE_INTEGRITY_ERROR','LoRA source range SHA-256 mismatch');
     checkSignal(signal);assembled.set(owned,done);done+=take;
    }
    checkSignal(signal);return assembled;
   },signal);
  },
  async hash({signal}={}){return tracked(async()=>{const verified=await confirm(signal);checkSignal(signal);return verified;},signal);}
 });
}

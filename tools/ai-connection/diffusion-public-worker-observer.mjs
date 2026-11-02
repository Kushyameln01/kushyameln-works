// Derived from the exact ffeeeedb public-model-worker-observer.mjs. Only the
// allowed repository-relative Worker path and COI/SAB observation are changed.
// Native arguments, message values, WASM calls and numerical owners are retained.
const target=new URL(location.href).searchParams.get('worker');
const allowed='/docs/shared/ai-connection/native/diffusion-ffeeeedb/docs/shared/diffusion-models/api/worker.mjs';
if(!target||new URL(target).origin!==location.origin||new URL(target).pathname!==allowed)throw Error('Only the exact adopted public API Worker may be observed');
const initialMessages=[];
const captureInitial=event=>{event.stopImmediatePropagation();if(initialMessages.length===16)throw Error('Diagnostic Worker bootstrap message queue exceeded');initialMessages.push(event);};
self.addEventListener('message',captureInitial,true);
const nativePost=self.postMessage.bind(self),nativeMemory=WebAssembly.Memory,nativeInstance=WebAssembly.Instance,nativeInstantiate=WebAssembly.instantiate,nativeStreaming=WebAssembly.instantiateStreaming;
const memories=new Set(),seenMemories=new WeakSet();let peakBytes=0,samples=0;
function remember(memory){if(!seenMemories.has(memory)){seenMemories.add(memory);memories.add(new WeakRef(memory));}}
function capture(value){const instance=value instanceof nativeInstance?value:value?.instance;if(instance)for(const exported of Object.values(instance.exports))if(exported instanceof nativeMemory)remember(exported);return value;}
function observe(stage,identity=null,details={}){
 const buffers=new Set();let bytes=0,sharedBytes=0,memoryObjects=0;
 for(const reference of memories){const memory=reference.deref();if(!memory){memories.delete(reference);continue;}memoryObjects++;const buffer=memory.buffer;if(buffers.has(buffer))continue;buffers.add(buffer);bytes+=buffer.byteLength;if(typeof SharedArrayBuffer==='function'&&buffer instanceof SharedArrayBuffer)sharedBytes+=buffer.byteLength;}
 peakBytes=Math.max(peakBytes,bytes);samples++;
 nativePost({__publicWasmObservation:'bernini-public-worker-memory/0.1',stage,identity,memoryObjects,uniqueBuffers:buffers.size,bytes,sharedBytes,peakBytes,samples,crossOriginIsolated:globalThis.crossOriginIsolated===true,sharedArrayBuffer:typeof SharedArrayBuffer==='function',...details,coverage:'WeakRef-observed main public Worker Memory construction and instantiate exports; GC may lag cleanup, and sampling retains references for the current task. ORT thread workers share observed imported memory. JS host buffers and unexported native allocations are outside this counter; physical Worker termination is recorded separately'});
}
WebAssembly.Memory=new Proxy(nativeMemory,{construct(target,args,newTarget){const value=Reflect.construct(target,args,newTarget);remember(value);return value;}});
WebAssembly.Instance=new Proxy(nativeInstance,{construct(target,args,newTarget){return capture(Reflect.construct(target,args,newTarget));}});
WebAssembly.instantiate=new Proxy(nativeInstantiate,{apply(target,receiver,args){return Reflect.apply(target,receiver,args).then(capture);}});
if(nativeStreaming)WebAssembly.instantiateStreaming=new Proxy(nativeStreaming,{apply(target,receiver,args){return Reflect.apply(target,receiver,args).then(capture);}});
self.postMessage=function(message,...rest){if(message?.status==='progress'||message?.status==='ok'||message?.status==='error')observe('before-'+message.status,{jobId:message.jobId,inputRevision:message.inputRevision,op:message.op});return nativePost(message,...rest);};
observe('worker-bootstrap');
setInterval(()=>observe('worker-heartbeat'),15000);
try{await import(target);}finally{self.removeEventListener('message',captureInitial,true);}
let initialMessagesForwarded=0;
for(const event of initialMessages){self.dispatchEvent(new MessageEvent('message',{data:event.data,origin:event.origin,lastEventId:event.lastEventId,ports:event.ports}));initialMessagesForwarded++;}
initialMessages.length=0;
observe('worker-import-ready',null,{initialMessagesForwarded,captureListenerRemoved:true});

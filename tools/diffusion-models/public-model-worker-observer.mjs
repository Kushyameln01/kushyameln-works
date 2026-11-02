// Fixed development bootstrap. Observes native allocations only; every
// constructor/method delegates unchanged arguments to the actual WASM API.
const target=new URL(location.href).searchParams.get('worker');
if(!target||new URL(target).origin!==location.origin||new URL(target).pathname!=='/docs/shared/diffusion-models/api/worker.mjs')throw Error('Only the exact public API Worker source may be observed');
const nativePost=self.postMessage.bind(self),nativeMemory=WebAssembly.Memory,nativeInstance=WebAssembly.Instance,nativeInstantiate=WebAssembly.instantiate,nativeStreaming=WebAssembly.instantiateStreaming;
const memories=new Set(),seenMemories=new WeakSet();let peakBytes=0,samples=0;
function remember(memory){if(!seenMemories.has(memory)){seenMemories.add(memory);memories.add(new WeakRef(memory));}}
function capture(value){
 const instance=value instanceof nativeInstance?value:value?.instance;
 if(instance)for(const exported of Object.values(instance.exports))if(exported instanceof nativeMemory)remember(exported);
 return value;
}
function observe(stage,identity=null){
 const buffers=new Set();let bytes=0,sharedBytes=0,memoryObjects=0;
 for(const reference of memories){const memory=reference.deref();if(!memory){memories.delete(reference);continue;}memoryObjects++;const buffer=memory.buffer;if(buffers.has(buffer))continue;buffers.add(buffer);bytes+=buffer.byteLength;if(typeof SharedArrayBuffer==='function'&&buffer instanceof SharedArrayBuffer)sharedBytes+=buffer.byteLength;}
 peakBytes=Math.max(peakBytes,bytes);samples++;
 nativePost({__publicWasmObservation:'bernini-public-worker-memory/0.1',stage,identity,memoryObjects,uniqueBuffers:buffers.size,bytes,sharedBytes,peakBytes,samples,coverage:'WeakRef-observed main public Worker Memory construction and instantiate exports; GC may lag cleanup, and sampling retains references for the current task. ORT thread workers share observed imported memory. JS host buffers and unexported native allocations are outside this counter; physical Worker termination is recorded separately'});
}
WebAssembly.Memory=new Proxy(nativeMemory,{construct(target,args,newTarget){const value=Reflect.construct(target,args,newTarget);remember(value);return value;}});
WebAssembly.Instance=new Proxy(nativeInstance,{construct(target,args,newTarget){return capture(Reflect.construct(target,args,newTarget));}});
WebAssembly.instantiate=new Proxy(nativeInstantiate,{apply(target,receiver,args){return Reflect.apply(target,receiver,args).then(capture);}});
if(nativeStreaming)WebAssembly.instantiateStreaming=new Proxy(nativeStreaming,{apply(target,receiver,args){return Reflect.apply(target,receiver,args).then(capture);}});
self.postMessage=function(message,...rest){
 if(message?.status==='progress'||message?.status==='ok'||message?.status==='error')observe('before-'+message.status,{jobId:message.jobId,inputRevision:message.inputRevision,op:message.op});
 return nativePost(message,...rest);
};
observe('worker-bootstrap');
setInterval(()=>observe('worker-heartbeat'),15000);
await import(target);

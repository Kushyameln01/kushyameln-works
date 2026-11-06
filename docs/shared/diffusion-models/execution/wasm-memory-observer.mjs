// Diagnostic observer only. No memory, instance, import, math or fetch object is
// retained strongly; native instantiate promises and their results are returned.
export function installWasmMemoryObserver({wasm=globalThis.WebAssembly}={}){
 if(typeof WeakRef!=='function')throw Error('WeakRef is required for memory observation');
 const NativeMemory=wasm.Memory,NativeInstance=wasm.Instance;
 const memoryBuffer=Object.getOwnPropertyDescriptor(NativeMemory.prototype,'buffer').get;
 const instanceExports=Object.getOwnPropertyDescriptor(NativeInstance.prototype,'exports').get;
 const arrayBufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
 let sharedBufferLength=typeof SharedArrayBuffer==='function'?Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype,'byteLength').get:null;
 const then=Promise.prototype.then,identities=new WeakMap(),records=[],patches=[];
 let active=true,nextId=0,peakObservedReachableBytes=0,observationErrors=0,unhookResult=null;
 const now=()=>globalThis.performance?.now?.()??Date.now();
 function bufferLength(buffer){
  try{return arrayBufferLength.call(buffer);}catch(error){
   // A native shared WASM buffer can exist while the global SAB constructor is
   // hidden. Its intrinsic prototype still provides the native length getter.
   if(!sharedBufferLength)sharedBufferLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(buffer)??{},'byteLength')?.get??null;
   if(sharedBufferLength)return sharedBufferLength.call(buffer);throw error;
  }
 }
 function byteLength(memory){return bufferLength(memoryBuffer.call(memory));}
 function registerMemory(memory,source='explicit-memory'){
  let buffer;try{buffer=memoryBuffer.call(memory);}catch{return null;}
  let length=null;try{length=bufferLength(buffer);}catch{observationErrors++;}
  let record=identities.get(memory);
  if(!record){record={id:'wasm-memory-'+(++nextId),reference:new WeakRef(memory),sources:new Set(),firstObservedBytes:length,lastObservedBytes:length,peakObservedBytes:length,samples:0};identities.set(memory,record);records.push(record);}
  record.sources.add(String(source));if(length!==null){record.lastObservedBytes=length;record.peakObservedBytes=Math.max(record.peakObservedBytes??0,length);}return record.id;
 }
 function observeInstance(instance,source='explicit-instance'){
  try{
   const exports=instanceExports.call(instance);
   for(const [name,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(exports)))if('value' in descriptor)registerMemory(descriptor.value,source+':export:'+name);
  }catch{/* Non-instances and native failures never change the observed operation. */}
 }
 // Explicit opt-in for trusted, already available import objects. Hooked native
 // calls never inspect import objects or invoke their getters/proxy traps.
 function registerImports(imports,source='explicit-imports'){
  let registered=0,skippedAccessors=0;
  if(!imports||typeof imports!=='object')return {registered,skippedAccessors};
  for(const [module,outer] of Object.entries(Object.getOwnPropertyDescriptors(imports))){
   if(!('value' in outer)){skippedAccessors++;continue;}
   const namespace=outer.value;if(!namespace||typeof namespace!=='object')continue;
   for(const [name,inner] of Object.entries(Object.getOwnPropertyDescriptors(namespace))){
    if(!('value' in inner)){skippedAccessors++;continue;}
    if(registerMemory(inner.value,source+':'+module+'.'+name))registered++;
   }
  }return {registered,skippedAccessors};
 }
 function observeResult(result,source){
  if(!active)return;
  try{instanceExports.call(result);observeInstance(result,source);return;}catch{}
  // Native byte/stream instantiation returns an ordinary {module,instance}.
  const descriptor=Object.getOwnPropertyDescriptor(result??{},'instance');
  if(descriptor&&'value' in descriptor)observeInstance(descriptor.value,source);
 }
 function patch(name,proxy){const descriptor=Object.getOwnPropertyDescriptor(wasm,name);Object.defineProperty(wasm,name,{...descriptor,value:proxy});patches.push({name,descriptor,proxy});}
 try{
  patch('Memory',new Proxy(NativeMemory,{construct(target,args,newTarget){const memory=Reflect.construct(target,args,newTarget);if(active){try{registerMemory(memory,'Memory.constructor');}catch{observationErrors++;}}return memory;}}));
  patch('Instance',new Proxy(NativeInstance,{construct(target,args,newTarget){const instance=Reflect.construct(target,args,newTarget);if(active){try{observeInstance(instance,'Instance.constructor');}catch{observationErrors++;}}return instance;}}));
  for(const name of ['instantiate','instantiateStreaming'])if(typeof wasm[name]==='function'){
   const native=wasm[name];patch(name,new Proxy(native,{apply(target,thisArg,args){
    const promise=Reflect.apply(target,thisArg,args);
    try{then.call(promise,result=>{try{observeResult(result,name);}catch{observationErrors++;}},()=>{});}catch{observationErrors++;}
    return promise;
   }}));
  }
 }catch(error){for(const patch of patches.reverse())Object.defineProperty(wasm,patch.name,patch.descriptor);throw error;}
 function sample(label='sample'){
  let currentReachableBytes=0,reachableObjects=0,noLongerDereferenceableObjects=0,sumPerIdentityPeaks=0,byteLengthUnavailableObjects=0,unknownPeakObjects=0;
  const memories=records.map(record=>{
   const memory=record.reference.deref();let currentBytes=null,state='no-longer-dereferenceable';
   if(memory){reachableObjects++;try{currentBytes=byteLength(memory);record.lastObservedBytes=currentBytes;record.peakObservedBytes=Math.max(record.peakObservedBytes??0,currentBytes);currentReachableBytes+=currentBytes;state='reachable-at-sample';}catch{state='byte-length-unavailable';byteLengthUnavailableObjects++;observationErrors++;}}
   else noLongerDereferenceableObjects++;
   record.samples++;if(record.peakObservedBytes===null)unknownPeakObjects++;else sumPerIdentityPeaks+=record.peakObservedBytes;
   return {id:record.id,sources:[...record.sources],state,currentBytes,firstObservedBytes:record.firstObservedBytes,lastObservedBytes:record.lastObservedBytes,peakObservedBytes:record.peakObservedBytes,samples:record.samples};
  });
  if(byteLengthUnavailableObjects===0)peakObservedReachableBytes=Math.max(peakObservedReachableBytes,currentReachableBytes);
  return {label:String(label),atMs:now(),hookActive:active,identities:records.length,reachableObjects,noLongerDereferenceableObjects,byteLengthUnavailableObjects,currentReachableBytes:byteLengthUnavailableObjects?null:currentReachableBytes,peakObservedReachableBytes,sumPerIdentityPeaks:unknownPeakObjects?null:sumPerIdentityPeaks,observationErrors,memories,scope:'Observed memory object buffer.byteLength only; unreadable current sizes are null; shared backing may be counted by multiple object identities; no total process/allocator/OS release claim'};
 }
 function unhook(){
  if(unhookResult)return unhookResult;active=false;const restored=[],replacedByAnotherHook=[];
  for(const patch of patches){if(wasm[patch.name]===patch.proxy){Object.defineProperty(wasm,patch.name,patch.descriptor);restored.push(patch.name);}else replacedByAnotherHook.push(patch.name);}
  unhookResult={restored,replacedByAnotherHook};return unhookResult;
 }
 return Object.freeze({registerMemory,registerImports,observeInstance,sample,unhook,describe(){return {hookActive:active,hooks:patches.map(p=>p.name),weakReferences:true,returnsOriginalInstantiatePromise:true,importsInspectedAutomatically:false,limits:['Install before any ORT/Hike creation; memories created before the hook or through saved constructors require explicit registration unless exported by an observed instantiation.','Native import getters/proxies are never touched by the hooks; explicit registerImports is only for trusted data-property imports.','WeakRef.deref temporarily keeps an object alive for the current job; no longer dereferenceable means unavailable to this observer, not OS memory release.','Polling can miss memories born and lost between samples; exported memories are discovered only after successful instantiation.','The attached rejection observer marks instantiate promises handled and changes unhandledrejection telemetry; returned promise identity, awaited values and awaited rejection remain native.','Constructor/Promise callbacks and sampling add diagnostic timing overhead; no math or fetch hook is installed.']};}});
}

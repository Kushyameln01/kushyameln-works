// Diagnostic instrumentation only. Capacity is neither allocator usage nor RSS.
const defaultDigest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');

export function createResourceObserver({modules=[],wasm=WebAssembly,digest=defaultDigest}={}) {
 if(typeof WeakRef!=='function')throw Error('WeakRef is required for non-owning Memory observation');
 if(typeof digest!=='function'||!Array.isArray(modules))throw TypeError('Module allowlist and digest function required');
 const allowed=new Map();
 for(const entry of modules){
  if(!entry||!/^[a-f0-9]{64}$/.test(entry.sha256)||typeof entry.role!=='string'||!entry.role)throw TypeError('Explicit SHA256 and role required');
  if(!allowed.has(entry.sha256))allowed.set(entry.sha256,new Set());allowed.get(entry.sha256).add(entry.role);
 }
 const NativeMemory=wasm.Memory,NativeModule=wasm.Module,NativeInstance=wasm.Instance;
 const memoryIds=new WeakMap(),moduleInfo=new WeakMap(),records=new Map(),infos=new Set(),tasks=new Set(),originals=new Map(),wrappers=new Map(),unattributedImports=[];
 let installed=false,nextId=1,hashFailures=0,observationFailures=0;
 const protect=fn=>{try{return fn();}catch{observationFailures++;return undefined;}};
 function track(promise,onSuccess=()=>{}) {
  let task;task=Promise.resolve(promise).then(onSuccess,()=>{}).catch(()=>{observationFailures++;}).finally(()=>tasks.delete(task));tasks.add(task);return task;
 }
 function bytesCopy(value){
  try{
   if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength).slice();
   if(value instanceof ArrayBuffer)return new Uint8Array(value).slice();
  }catch{}
  return null;
 }
 function streamCopy(source){
  const clone=value=>{try{return typeof Response!=='undefined'&&value instanceof Response?value.clone().arrayBuffer().catch(()=>null):null;}catch{return null;}};
  // Register before native streaming starts consuming the original response.
  // Arbitrary thenables are deliberately not read twice; their hash stays unknown.
  if(typeof Response!=='undefined'&&source instanceof Response)return clone(source);
  if(source instanceof Promise)return Reflect.apply(Promise.prototype.then,source,[clone,()=>null]);
  return null;
 }
 function infoFor(module){
  let info=moduleInfo.get(module);
  if(!info){info={sha256:null,hashStarted:false};moduleInfo.set(module,info);infos.add(info);}
  return info;
 }
 function hash(info,source){
  if(info.hashStarted||source===null)return;info.hashStarted=true;
  track(Promise.resolve(source).then(async bytes=>{
   if(bytes===null)return;
   try{const value=await digest(bytes);if(!/^[a-f0-9]{64}$/.test(value))throw Error('Invalid digest');info.sha256=value;}
   catch{hashFailures++;}
  }));
 }
 function memory(memory,info){
  if(!(memory instanceof NativeMemory))return;
  let record=memoryIds.get(memory);
  if(!record){record={id:nextId++,ref:new WeakRef(memory),infos:new Set(),highWaterBytes:memory.buffer.byteLength};memoryIds.set(memory,record);records.set(record.id,record);}
  record.infos.add(info);record.highWaterBytes=Math.max(record.highWaterBytes,memory.buffer.byteLength);
 }
 function observe(module,instance,imports,source=null){
  if(!(module instanceof NativeModule)||!(instance instanceof NativeInstance))return;
  const info=infoFor(module);hash(info,source);
  for(const value of Object.values(instance.exports))memory(value,info);
  // Native import resolution may invoke getters. Do not invoke them again.
  for(const entry of Reflect.apply(NativeModule.imports,NativeModule,[module])){
   if(entry.kind!=='memory')continue;
   const skipped=reason=>unattributedImports.push({info,importModule:entry.module,importName:entry.name,reason});
   try{
    if(imports===null||(typeof imports!=='object'&&typeof imports!=='function')){skipped('import-object-unavailable');continue;}
    const namespace=Object.getOwnPropertyDescriptor(imports,entry.module);
    if(!namespace){skipped('namespace-not-own-data');continue;}
    if(!('value' in namespace)){skipped('namespace-accessor');continue;}
    if(!namespace.value){skipped('namespace-not-own-data');continue;}
    const value=Object.getOwnPropertyDescriptor(namespace.value,entry.name);
    if(!value){skipped('memory-not-own-data');continue;}
    if(!('value' in value)){skipped('memory-accessor');continue;}
    if(!(value.value instanceof NativeMemory)){skipped('non-memory-data-binding');continue;}
    memory(value.value,info);
   }catch{skipped('descriptor-inspection-failed');}
  }
 }
 function importReport(){
  const unattributedMemoryImports=unattributedImports.map(({info,...entry})=>({moduleSHA256:allowed.has(info.sha256)?info.sha256:null,...entry}));
  return {skippedMemoryImports:unattributedMemoryImports.length,unattributedMemoryImports,memoryImportObservationComplete:unattributedMemoryImports.length===0};
 }
 function wrap(name,original){
  return new Proxy(original,{apply(target,receiver,args){
   const source=protect(()=>name.endsWith('Streaming')?streamCopy(args[0]):args[0] instanceof NativeModule?null:bytesCopy(args[0]));
   const result=Reflect.apply(target,receiver,args);
   // The returned native Promise is never replaced or delayed by observation.
   track(result,value=>protect(()=>{
    if(name==='compile'||name==='compileStreaming'){const info=infoFor(value);hash(info,source??null);}
    else if(args[0] instanceof NativeModule)observe(args[0],value,args[1]);
    else observe(value.module,value.instance,args[1],source??null);
   }));
   return result;
  }});
 }
 const observer={
  install(){
   if(installed)return observer;
   try{
    for(const name of ['compile','compileStreaming','instantiate','instantiateStreaming','Instance']){
     const descriptor=Object.getOwnPropertyDescriptor(wasm,name);if(!descriptor||typeof descriptor.value!=='function')continue;
     originals.set(name,descriptor);
     const replacement=name==='Instance'?new Proxy(descriptor.value,{construct(target,args,newTarget){const value=Reflect.construct(target,args,newTarget);protect(()=>observe(args[0],value,args[1]));return value;}}):wrap(name,descriptor.value);
     wrappers.set(name,replacement);Object.defineProperty(wasm,name,{...descriptor,value:replacement});
    }
    installed=true;return observer;
   }catch(error){for(const [name,descriptor]of originals)Object.defineProperty(wasm,name,descriptor);originals.clear();wrappers.clear();throw error;}
  },
  snapshot(phase){
   const memories=[];
   for(const record of records.values()){
    const target=record.ref.deref(),capacityBytes=target?protect(()=>target.buffer.byteLength)??null:null;
    if(capacityBytes!==null)record.highWaterBytes=Math.max(record.highWaterBytes,capacityBytes);
    const hashes=[...new Set([...record.infos].map(info=>info.sha256).filter(value=>allowed.has(value)))].sort();
    const roles=[...new Set(hashes.flatMap(value=>[...allowed.get(value)]))].sort();
    memories.push({id:record.id,moduleSHA256:hashes.length===1?hashes[0]:null,moduleSHA256s:hashes,roles,capacityBytes,highWaterBytes:record.highWaterBytes,alive:!!target});
   }
   return {phase,memories,unknownModuleCount:[...infos].filter(info=>!allowed.has(info.sha256)).length,...importReport(),measurement:'linear-memory-capacity',installed};
  },
  async settle(){while(tasks.size)await Promise.all([...tasks]);},
  restore(){
   for(const [name,descriptor]of originals)if(Object.getOwnPropertyDescriptor(wasm,name)?.value===wrappers.get(name))Object.defineProperty(wasm,name,descriptor);
   installed=false;originals.clear();wrappers.clear();return observer;
  },
  diagnostics(){return {installed,pendingHashTasks:tasks.size,hashFailures,observationFailures,observedMemories:records.size,unknownModuleCount:[...infos].filter(info=>!allowed.has(info.sha256)).length,...importReport(),weakMemoryReferences:true};}
 };
 return Object.freeze(observer);
}

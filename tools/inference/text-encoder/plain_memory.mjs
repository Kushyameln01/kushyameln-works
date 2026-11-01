// Diagnostic hooks only. Records contain scalars; model/tensor/buffer ownership stays native.
export function observePlainMemory(emit){
 if(typeof WeakRef!=='function')throw Error('WeakRef required for nonretaining WASM observation');
 const started=performance.now(),memoryIds=new WeakMap(),memories=[],blobLabels=new WeakMap(),readBuffers=new WeakMap();
 const totals={readCalls:0,readBytes:0,digestCalls:0,digestInputBytes:0,ortSubmittedModelBytes:0,wasmGrowCalls:0};
 let context={},serial=0;
 const NativeMemory=WebAssembly.Memory;
 function capacities(){
  const live=[];
  for(const entry of memories){const memory=entry.ref.deref();if(memory)live.push({id:entry.id,origin:entry.origin,capacityBytes:memory.buffer.byteLength,...entry.descriptor});}
  return live;
 }
 function mark(event,details={}){const now=performance.now();emit({event,epochMs:performance.timeOrigin+now,elapsedMs:now-started,...context,...details,wasmMemories:capacities()});}
 function track(memory,origin,descriptor={}){
  if(!(memory instanceof NativeMemory)||memoryIds.has(memory))return;
  const id=memories.length+1;memoryIds.set(memory,id);memories.push({id,origin,descriptor,ref:new WeakRef(memory)});
  mark('wasm-memory-observed',{memoryId:id,origin,capacityBytes:memory.buffer.byteLength,...descriptor});
 }
 WebAssembly.Memory=new Proxy(NativeMemory,{construct(target,args,newTarget){
  const memory=Reflect.construct(target,args,newTarget),d=args[0];
  track(memory,'constructor',{initialPages:d?.initial,maximumPages:d?.maximum,shared:d?.shared===true});return memory;
 }});
 const grow=NativeMemory.prototype.grow;
 NativeMemory.prototype.grow=function(...args){
  track(this,'grow');const beforeBytes=this.buffer.byteLength,id=memoryIds.get(this);totals.wasmGrowCalls++;
  mark('wasm-grow-start',{memoryId:id,beforeBytes,requestedPages:typeof args[0]==='number'?args[0]:null});
  try{const value=Reflect.apply(grow,this,args);mark('wasm-grow-end',{memoryId:id,beforeBytes,capacityBytes:this.buffer.byteLength});return value;}
  catch(error){mark('wasm-grow-failure',{memoryId:id,beforeBytes,error:String(error)});throw error;}
 };
 function inspectInstance(value,origin){
  const instance=value?.instance??value;
  if(instance?.exports)for(const exported of Object.values(instance.exports))track(exported,origin);
  return value;
 }
 for(const name of ['instantiate','instantiateStreaming']){
  const original=WebAssembly[name];if(typeof original!=='function')continue;
  WebAssembly[name]=function(...args){return Reflect.apply(original,this,args).then(value=>inspectInstance(value,name));};
 }
 const NativeInstance=WebAssembly.Instance;
 WebAssembly.Instance=new Proxy(NativeInstance,{construct(target,args,newTarget){return inspectInstance(Reflect.construct(target,args,newTarget),'Instance');}});
 function label(blob){
  let value=blobLabels.get(blob);
  if(!value){value={fileName:typeof blob.name==='string'?blob.name:null,fileBytes:blob.size,rangeStart:0,rangeEnd:blob.size};blobLabels.set(blob,value);}
  return value;
 }
 const slice=Blob.prototype.slice;
 Blob.prototype.slice=function(...args){
  const result=Reflect.apply(slice,this,args),parent=label(this),start=args[0],end=args[1];
  const simple=(start===undefined||typeof start==='number')&&(end===undefined||typeof end==='number');
  const bound=(value,fallback)=>value===undefined?fallback:Number.isNaN(value)?0:value<0?Math.max(this.size+Math.trunc(value),0):Math.min(Math.trunc(value),this.size);
  const begin=simple?bound(start,0):null,finish=simple?Math.max(begin,bound(end,this.size)):null;
  const info={fileName:parent.fileName,fileBytes:parent.fileBytes,rangeStart:parent.rangeStart===null||begin===null?null:parent.rangeStart+begin,rangeEnd:parent.rangeStart===null||finish===null?null:parent.rangeStart+finish};
  blobLabels.set(result,info);mark('blob-slice',{...info,sliceBytes:result.size});return result;
 };
 const arrayBuffer=Blob.prototype.arrayBuffer;
 Blob.prototype.arrayBuffer=function(...args){
  const info={readId:++serial,...label(this),requestedBytes:this.size};totals.readCalls++;mark('file-read-start',info);const start=performance.now();
  return Reflect.apply(arrayBuffer,this,args).then(buffer=>{
   totals.readBytes+=buffer.byteLength;readBuffers.set(buffer,info);mark('file-read-end',{...info,bytes:buffer.byteLength,durationMs:performance.now()-start});return buffer;
  },error=>{mark('file-read-failure',{...info,error:String(error)});throw error;});
 };
 const digest=crypto.subtle.digest;
 crypto.subtle.digest=function(algorithm,data){
  const buffer=ArrayBuffer.isView(data)?data.buffer:data;
  const bytes=typeof data?.byteLength==='number'?data.byteLength:null;
  const info={digestId:++serial,algorithm:typeof algorithm==='string'?algorithm:null,inputBytes:bytes,readId:readBuffers.get(buffer)?.readId??null};
  totals.digestCalls++;totals.digestInputBytes+=bytes??0;mark('digest-start',info);const start=performance.now();
  return Reflect.apply(digest,this,[algorithm,data]).then(value=>{mark('digest-end',{...info,durationMs:performance.now()-start});return value;},error=>{mark('digest-failure',{...info,error:String(error)});throw error;});
 };
 return {mark,setContext(value){context={...value};},submittedModel(bytes){totals.ortSubmittedModelBytes+=bytes;},summary(){return{...totals,wasmMemories:capacities(),scope:'API-visible cumulative read/digest/submitted bytes and observed WASM capacity; not retained bytes or OS RSS/PSS. WeakRef observations do not establish deallocation.'};}};
}

// Diagnostic helpers only. Importing this module never imports or initializes ORT.
export function admitProfile({threads,crossOriginIsolated,sharedArrayBufferAvailable,workerAvailable,tiles}={}){
 if(![1,4].includes(threads))throw Error('Explicit threads=1 or threads=4 required');
 if(!Number.isInteger(tiles)||tiles<1||tiles>4)throw Error('Measured tiles must be 1..4');
 if(threads===1&&crossOriginIsolated!==false)throw Error('threads1 requires the explicit noCOI case');
 if(threads===4&&(!crossOriginIsolated||!sharedArrayBufferAvailable||!workerAvailable))throw Error('threads4 requires COI, SharedArrayBuffer and Worker; no fallback');
 return {threads,tiles,expectedPthreads:threads-1,profile:threads===1?'threads1-noCOI':'threads4-COI'};
}

export function createFixture(keyStart){
 if(!Number.isSafeInteger(keyStart)||keyStart<0||keyStart%256)throw Error('keyStart must be nonnegative and K256 aligned');
 const fill=(length,seed)=>{const out=new Float32Array(length);let x=seed|0;for(let i=0;i<length;i++){x^=x<<13;x^=x>>>17;x^=x<<5;out[i]=((x>>>0)%200001-100000)/1000003;}return out;};
 return {q:fill(655360,0x73a947),k:fill(1310720,0x12a5^(keyStart+1)),v:fill(1310720,0x37b9^(keyStart+1)),previousMax:new Float32Array(5120).fill(-3.4028234663852886e38),previousDenominator:new Float32Array(5120),previousContext:new Float32Array(655360)};
}

const labels=new Map([['ORT::wasm prepareInputOutputTensor','inputTensorPreparationWallMs'],['ORT::wasm ProcessOutputTensor','outputTensorProcessingWallMs']]);
export function createTimingRecorder({clock=()=>performance.now(),consoleObject=console}={}){
 let frame=null,installed=false;const patches=[],frames=[];
 const issue=message=>{if(frame)frame.issues.push(message);};
 function traceBegin(label){if(!frame||!labels.has(label))return;if(frame.open.has(label))issue('duplicate trace begin '+label);frame.open.set(label,clock());}
 function traceEnd(label){if(!frame||!labels.has(label))return;const start=frame.open.get(label);if(start===undefined){issue('trace end without begin '+label);return;}frame.open.delete(label);const name=labels.get(label);frame[name]=(frame[name]??0)+clock()-start;frame.traceCounts[name]=(frame.traceCounts[name]??0)+1;}
 return {
  install(){if(installed)throw Error('Trace recorder already installed');installed=true;for(const [name,observe]of [['time',traceBegin],['timeEnd',traceEnd]]){const descriptor=Object.getOwnPropertyDescriptor(consoleObject,name),original=consoleObject[name];const wrapper=function(...args){observe(args[0]);return Reflect.apply(original,this,args);};Object.defineProperty(consoleObject,name,{...descriptor,value:wrapper,configurable:true,writable:true});patches.push({name,descriptor,wrapper});}},
  beginFrame(metadata){if(frame)throw Error('Overlapping timing frame');frame={...metadata,started:clock(),open:new Map(),traceCounts:{},nativeCalls:0,ortRunCallWallMs:0,issues:[]};},
  native(original,thisArg,args){const start=clock();try{return Reflect.apply(original,thisArg,args);}finally{if(frame){frame.nativeCalls++;frame.ortRunCallWallMs+=clock()-start;}}},
  endFrame({requireNative=false}={}){if(!frame)throw Error('No timing frame');const done=frame;frame=null;done.publicSessionRunWallMs=clock()-done.started;
   if(done.open.size)done.issues.push('unfinished trace');for(const name of labels.values())if(done.traceCounts[name]!==1)done.issues.push('trace count for '+name+' is '+(done.traceCounts[name]??0));
   if(done.nativeCalls!==(requireNative?1:0))done.issues.push('native call count '+done.nativeCalls);
   if(!requireNative)done.ortRunCallWallMs=null;
   delete done.open;delete done.started;frames.push(done);if(done.issues.length)throw Error('Invalid timing trace: '+done.issues.join('; '));return done;},
  abortFrame(){frame=null;},
  frames(){return frames.map(value=>({...value}));},
  restore(){const conflicts=[];for(const patch of patches){if(consoleObject[patch.name]!==patch.wrapper){conflicts.push(patch.name);continue;}if(patch.descriptor)Object.defineProperty(consoleObject,patch.name,patch.descriptor);else delete consoleObject[patch.name];}patches.length=0;installed=false;return {conflicts};}
 };
}

// All native wrappers are synchronous and return exactly the original value.
// Only plain CPU WASM is admitted; no async/JSPI/WebGPU assumptions are made.
export function createCapturedFactory(originalFactory,{recorder}={}){
 let factoryCalls=0,module=null;const patches=[];
 const counts={initCalls:0,initSuccesses:0,initThreadArguments:[],sessionCreations:0,sessionReleases:0,ortRunCalls:0};
 const patch=(name,observe)=>{if(typeof module[name]!=='function')throw Error('Missing pinned native export '+name);const descriptor=Object.getOwnPropertyDescriptor(module,name),original=module[name];const wrapper=function(...args){return observe(original,this,args);};Object.defineProperty(module,name,{...descriptor,value:wrapper});patches.push({name,descriptor,wrapper});};
 return {
  async factory(config){if(factoryCalls)throw Error('Factory may be called only once in a fresh realm');factoryCalls++;const value=await Reflect.apply(originalFactory,this,[config]);module=value;
   if(module.PTR_SIZE!==4)throw Error('Pinned wasm32 module required');
   patch('_OrtInit',(fn,self,args)=>{counts.initCalls++;counts.initThreadArguments.push(args[0]);const result=Reflect.apply(fn,self,args);if(result===0)counts.initSuccesses++;return result;});
   patch('_OrtCreateSession',(fn,self,args)=>{const result=Reflect.apply(fn,self,args);if(result!==0)counts.sessionCreations++;return result;});
   patch('_OrtReleaseSession',(fn,self,args)=>{const result=Reflect.apply(fn,self,args);if(result===0)counts.sessionReleases++;return result;});
   patch('_OrtRun',(fn,self,args)=>{counts.ortRunCalls++;return recorder.native(fn,self,args);});
   return value;
  },
  stats(){return {factoryCalls,...counts,moduleCaptured:!!module,heapBytes:module?.HEAPU8?.byteLength??null,ptrSize:module?.PTR_SIZE??null,sameModuleReturned:!!module,scope:'One captured factory result; heap byteLength is not allocated/live tensor bytes or RSS'};},
  restore(){const conflicts=[];for(const patch of patches){if(module[patch.name]!==patch.wrapper){conflicts.push(patch.name);continue;}Object.defineProperty(module,patch.name,patch.descriptor);}patches.length=0;return {conflicts};}
 };
}

export function compareBytes(expected,actual){
 const a=new Uint8Array(expected.buffer,expected.byteOffset,expected.byteLength),b=new Uint8Array(actual.buffer,actual.byteOffset,actual.byteLength);let first=null;
 for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i]){first=i;break;}
 if(first===null&&a.length!==b.length)first=Math.min(a.length,b.length);
 return {equal:first===null,bytesCompared:first===null?a.length:first+Number(first<Math.min(a.length,b.length)),firstMismatchByte:first,expectedBytes:a.length,actualBytes:b.length};
}

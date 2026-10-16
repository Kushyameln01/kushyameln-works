import {UNITY_KERNEL} from './registry.mjs';
export {UNITY_KERNEL};

const MAX_VECTOR=262144,MAX_MEMORY=16777216,PAGE_BYTES=65536;
const typedPrototype=Object.getPrototypeOf(Int32Array.prototype);
const typedGet=Object.fromEntries(['length','buffer','byteOffset','byteLength'].map(key=>[key,Object.getOwnPropertyDescriptor(typedPrototype,key).get]));
const typed=(value,key)=>Reflect.apply(typedGet[key],value,[]);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const errors={[-1]:'UA_INVALID_COUNT',[-2]:'UA_INVALID_VALUE'};

function aborted(signal){if(signal?.aborted)throw new DOMException('Unity kernel preparation aborted','AbortError');}
export async function prepareUnityKernel({signal,fetchImpl=fetch,onCompile=()=>{},onResponse=()=>{}}={}) {
  aborted(signal);
  const response=await fetchImpl(UNITY_KERNEL.url,{credentials:'omit',signal});
  aborted(signal);
  if(!response.ok)throw Error(`UA_KERNEL_FETCH:${response.status}`);
  onResponse(response.headers?.get('content-type')??null);
  const bytes=await response.arrayBuffer();aborted(signal);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  aborted(signal);
  if(hash!==UNITY_KERNEL.sha256)throw Error('UA_KERNEL_HASH');
  onCompile();aborted(signal);
  const module=await WebAssembly.compile(bytes);aborted(signal);return module;
}

export function instantiateUnityKernel(module) {
  const expected='UaDiff:function,UaIncoming:function,UaTypeCheck:function,memory:memory';
  if(!(module instanceof WebAssembly.Module)||WebAssembly.Module.imports(module).length||WebAssembly.Module.exports(module).map(x=>`${x.name}:${x.kind}`).sort().join(',')!==expected)throw TypeError('UA_KERNEL_ABI');
  let instance=new WebAssembly.Instance(module),memory=instance.exports.memory;
  if(!(memory instanceof WebAssembly.Memory)||!(memory.buffer instanceof ArrayBuffer)||memory.buffer.byteLength<65536||memory.buffer.byteLength>MAX_MEMORY||['UaIncoming','UaTypeCheck','UaDiff'].some(name=>instance.exports[name].length!==5))throw TypeError('UA_KERNEL_ABI');
  const instanceId=`unity-${crypto.randomUUID()}`,arenaBase=memory.buffer.byteLength;
  let disposed=false,busy=false,liveBytes=0,peakBytes=0,runs=0;
  function check(){if(disposed)throw Error('UA_DISPOSED');if(busy)throw Error('UA_BUSY');}
  function vector(data) {
    if(!(data instanceof Int32Array))throw TypeError('UA_INT32_REQUIRED');
    const buffer=typed(data,'buffer'),length=typed(data,'length'),offset=typed(data,'byteOffset'),bytes=typed(data,'byteLength');
    if(!(buffer instanceof ArrayBuffer)||buffer.resizable)throw TypeError('UA_BUFFER');
    if(buffer===memory.buffer)throw TypeError('UA_MEMORY_ALIAS');
    new Int32Array(buffer,offset,length); // Also rejects detached zero-length input.
    if(!integer(length,0,MAX_VECTOR)||bytes!==length*4)throw RangeError('UA_VECTOR_LIMIT');
    return {data,length};
  }
  function values(v,min,max,code){for(let i=0;i<v.length;i++)if(!integer(v.data[i],min,max))throw RangeError(code);}
  function execute(name,inputs,outputCount,argumentsFor,validResult) {
    check();
    const lengths=[...inputs.map(x=>x.length),outputCount];
    let end=arenaBase;
    const pointers=lengths.map(length=>{
      if(!integer(length,0,MAX_VECTOR))throw RangeError('UA_VECTOR_LIMIT');
      const bytes=length*4,start=end;end=Math.ceil((end+bytes)/8)*8;
      if(!Number.isSafeInteger(end)||start%8||end<start||end>MAX_MEMORY||end>2147483647)throw RangeError('UA_ARENA_LIMIT');
      return start;
    });
    if(memory.buffer.byteLength>MAX_MEMORY)throw RangeError('UA_MEMORY_LIMIT');
    busy=true;let reserved=false;
    try {
      const pages=Math.ceil((end-memory.buffer.byteLength)/PAGE_BYTES);
      if(pages>0)memory.grow(pages);
      const mem=memory;
      new Uint8Array(mem.buffer,arenaBase,end-arenaBase).fill(0);reserved=true;
      liveBytes=end-arenaBase;peakBytes=Math.max(peakBytes,liveBytes);
      for(let i=0;i<inputs.length;i++)new Int32Array(mem.buffer,pointers[i],inputs[i].length).set(inputs[i].data);
      const status=instance.exports[name](...argumentsFor(pointers));
      if(status!==0)throw Error(errors[status]??'UA_KERNEL_STATUS');
      if(mem.buffer.byteLength>MAX_MEMORY)throw Error('UA_MEMORY_LIMIT');
      const result=Int32Array.from(new Int32Array(mem.buffer,pointers[pointers.length-1],outputCount));
      if(!validResult(result))throw Error('UA_INVALID_RESULT');
      runs++;return result;
    } finally {
      if(reserved)new Uint8Array(memory.buffer,arenaBase,end-arenaBase).fill(0);
      liveBytes=0;busy=false;
    }
  }
  function incoming(targets,nodeCount) {
    check();const edges=vector(targets);
    if(!integer(nodeCount,0,MAX_VECTOR))throw RangeError('UA_NODE_COUNT');
    values(edges,0,nodeCount-1,'UA_TARGET');
    return execute('UaIncoming',[edges],nodeCount,([input,out])=>[input,edges.length,nodeCount,out,nodeCount],result=>{
      let total=0;for(const count of result){if(!integer(count,0,edges.length))return false;total+=count;}return total===edges.length;
    });
  }
  function types(actual,allowedMasks) {
    check();const a=vector(actual),m=vector(allowedMasks);
    if(a.length!==m.length)throw RangeError('UA_LENGTH');
    values(a,0,4,'UA_TYPE_TAG');values(m,0,31,'UA_TYPE_MASK');
    return execute('UaTypeCheck',[a,m],a.length,([ap,mp,out])=>[ap,mp,a.length,out,a.length],result=>result.every(x=>x>=0&&x<=2));
  }
  function diff(before,after) {
    check();const a=vector(before),b=vector(after);
    if(a.length!==b.length)throw RangeError('UA_LENGTH');
    values(a,0,2147483647,'UA_EQUIVALENCE_ID');values(b,0,2147483647,'UA_EQUIVALENCE_ID');
    return execute('UaDiff',[a,b],a.length,([ap,bp,out])=>[ap,bp,a.length,out,a.length],result=>result.every(x=>x===0||x===1));
  }
  function dispose(){if(disposed)return;if(busy)throw Error('UA_BUSY');disposed=true;instance=null;memory=null;module=null;liveBytes=0;}
  return Object.freeze({instanceId,get memory(){return memory;},incoming,types,diff,dispose,
    resourceStats:()=>({disposed,busy,runs,liveBytes,peakBytes,arenaBase,memoryBytes:memory?.buffer.byteLength??0,maxMemoryBytes:MAX_MEMORY,maxVectorElements:MAX_VECTOR,boundsScope:'prototype'})});
}

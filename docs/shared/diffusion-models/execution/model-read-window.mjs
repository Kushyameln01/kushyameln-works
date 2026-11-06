// Raw storage optimization only: no tensor arithmetic or storage-format decode.
export const MODEL_READ_AHEAD_MAX_BYTES=1048576;
export function validateModelReadAheadBytes(value){
 if(!Number.isSafeInteger(value)||value<0||value>MODEL_READ_AHEAD_MAX_BYTES)throw RangeError('readAheadBytes must be an integer in 0..1048576');
 return value;
}
const now=()=>performance.now();
const nativeThrowIfAborted=AbortSignal.prototype.throwIfAborted;
const nativeArrayBufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;

/** One immutable original-tensor window. Selected results never alias it. */
export function createModelReadWindow({file,readAheadBytes=0,maxRequestBytes=163840,assertLive=()=>{}}={}){
 validateModelReadAheadBytes(readAheadBytes);
 if(!(file instanceof Blob)||!Number.isSafeInteger(maxRequestBytes)||maxRequestBytes<1||maxRequestBytes>MODEL_READ_AHEAD_MAX_BYTES||typeof assertLive!=='function')throw TypeError('Immutable Blob, bounded request size and owner liveness check required');
 let original=file,window=null,busy=false,disposed=false;
 const counts={logicalRequests:0,logicalRequestedBytes:0,storageReadAttempts:0,storageReads:0,storageReadBytes:0,maxStorageReadBytes:0,storageReadMs:0,storageReadFailures:0,discardedStorageReads:0,discardedStorageBytes:0,cacheHits:0,cacheMisses:0,windowCopyBytes:0,windowCopyMs:0,peakCachedBytes:0};
 const live=signal=>{if(disposed)throw Error('Model read window disposed');if(signal!==undefined)nativeThrowIfAborted.call(signal);assertLive(signal);};
 const evict=()=>{if(window){window.bytes.fill(0);window=null;}};
 const ownedSlice=(bytes,start,count)=>{const began=now(),out=bytes.slice(start,start+count);counts.windowCopyMs+=now()-began;counts.windowCopyBytes+=out.byteLength;return out;};
 async function storage(offset,count,signal){
  const began=now();counts.storageReadAttempts++;
  let raw;
  try{
   const buffer=await original.slice(offset,offset+count).arrayBuffer();
   let length;try{length=nativeArrayBufferLength.call(buffer);}catch{throw TypeError('Original read must return a nonshared ArrayBuffer');}
   counts.storageReads++;counts.storageReadBytes+=length;counts.maxStorageReadBytes=Math.max(counts.maxStorageReadBytes,length);
   if(length!==count)throw Error('Original range length mismatch');
   raw=new Uint8Array(buffer);
  }catch(error){counts.storageReadFailures++;throw error;}finally{counts.storageReadMs+=now()-began;}
  try{live(signal);}catch(error){counts.discardedStorageReads++;counts.discardedStorageBytes+=raw.byteLength;throw error;}
  return raw;
 }
 return Object.freeze({
  async read(entry,offset,count,{signal}={}){
   live(signal);if(busy)throw Error('Model read window busy');
   // Capture registry primitives before the first await. The window cannot
   // cross this original tensor even when adjacent file bytes are available.
   const key=entry?.originalKey,start=entry?.absoluteByteOffset,length=entry?.byteLength,end=start+length;
   if(typeof key!=='string'||!key||!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||length<1||start<0||!Number.isSafeInteger(end)||end>original.size||!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||count<1||count>maxRequestBytes||offset<start||offset>end-count)throw RangeError('Bounded original tensor read range');
   counts.logicalRequests++;counts.logicalRequestedBytes+=count;busy=true;
   try{
    if(readAheadBytes===0)return await storage(offset,count,signal);
    if(window&&window.key===key&&window.tensorStart===start&&window.tensorEnd===end&&offset>=window.start&&offset+count<=window.start+window.bytes.byteLength){counts.cacheHits++;return ownedSlice(window.bytes,offset-window.start,count);}
    counts.cacheMisses++;evict();
    // Full matrix rows normally arrive at a fixed byte quantum. Align to that
    // selected quantum so a later request does not straddle the window and
    // reread a trailing partial block. A tensor's exact final tail is retained.
    const requestedWindow=Math.max(count,Math.floor(readAheadBytes/count)*count);
    const physicalCount=Math.min(end-offset,requestedWindow),bytes=await storage(offset,physicalCount,signal);
    live(signal);window={key,tensorStart:start,tensorEnd:end,start:offset,bytes};counts.peakCachedBytes=Math.max(counts.peakCachedBytes,bytes.byteLength);
    return ownedSlice(bytes,0,count);
   }finally{busy=false;}
  },
  stats(){return {...counts,readAheadBytes,busy,disposed,cachedBytes:window?.bytes.byteLength??0,maxRequestBytes,storageReadTimingScope:'Blob slice/arrayBuffer await and returned-length validation; tensor decode excluded'};},
  dispose(){if(busy)throw Error('Await model read window operation before disposal');if(disposed)return;evict();original=null;disposed=true;}
 });
}

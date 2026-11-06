// Immutable owner-local CPU K/V tensors. This changes resource ownership only:
// the existing Q128/K256 graph, key order and F32 recurrence are unchanged.
const signalThrow=AbortSignal.prototype.throwIfAborted;
const abort=signal=>{if(signal!==undefined)signalThrow.call(signal);};
const positive=(n,max,label)=>{if(!Number.isSafeInteger(n)||n<1||n>max)throw RangeError(label+' outside supported range');return n;};
export function createPreparedAttentionKV({ort,assertLive,validateView,onCopy=()=>{},onCleanupFailure=()=>{}}={}){
 if(typeof ort?.Tensor!=='function'||![assertLive,validateView,onCopy,onCleanupFailure].every(fn=>typeof fn==='function'))throw TypeError('Prepared attention K/V owner callbacks required');
 const records=new Map(),known=new WeakSet();let disposed=false,cleanupFailed=false;
 const counters={creations:0,releases:0,currentBytes:0,peakBytes:0,copies:0,copyBytes:0,transfers:0,transferBytes:0,activeLeases:0,peakLeases:0,cleanupFailures:0};
 const live=signal=>{if(disposed)throw Error('Prepared attention K/V owner disposed');if(cleanupFailed)throw Object.assign(Error('Prepared attention K/V cleanup required'),{code:'RECOVERY_REQUIRED'});assertLive();abort(signal);};
 const lookup=handle=>{const record=records.get(handle);if(!record)throw TypeError('Prepared attention K/V handle is foreign or released');return record;};
 function release(handle){
  const record=records.get(handle);if(!record){if(known.has(handle))return false;throw TypeError('Prepared attention K/V handle belongs to another owner');}
  if(record.leases)throw Error('Prepared attention K/V has active read leases');
  const errors=[];for(const name of ['k','v']){const tensor=record[name];if(!tensor)continue;try{tensor.dispose();record[name]=null;counters.currentBytes-=record.singleBytes;}catch(error){errors.push(error);}}
  if(errors.length){cleanupFailed=true;counters.cleanupFailures++;try{onCleanupFailure();}catch(error){errors.push(error);}throw new AggregateError(errors,'Prepared attention K/V release failed; ownership retained for recovery');}
  records.delete(handle);counters.releases++;return true;
 }
 return Object.freeze({
  prepare({k,v,heads,keys,headDim,keyStart,ownership='copy',signal}={}){
   live(signal);if(heads!==40||headDim!==128)throw RangeError('Prepared attention K/V requires H40/D128');positive(keys,256,'keys');
   if(!Number.isSafeInteger(keyStart)||keyStart<0||keyStart%256!==0)throw RangeError('Prepared attention K/V keyStart must be an aligned nonnegative range start');
   if(!['copy','take'].includes(ownership))throw TypeError('Explicit copy or take K/V ownership required');
   const length=heads*keys*headDim,kView=validateView(k,length,'prepared k'),vView=validateView(v,length,'prepared v');
   if(kView.buffer===vView.buffer)throw TypeError('Prepared K/V require distinct compact buffers');abort(signal);
   const data=ownership==='take'?structuredClone({k:kView,v:vView},{transfer:[kView.buffer,vView.buffer]}):{k:new Float32Array(kView),v:new Float32Array(vView)};
   const bytes=length*8;if(ownership==='take'){counters.transfers++;counters.transferBytes+=bytes;}else{counters.copies++;counters.copyBytes+=bytes;onCopy(bytes);}
   const handle=Object.freeze({heads,keys,headDim,keyStart,byteLength:bytes}),record={k:null,v:null,singleBytes:length*4,leases:0};known.add(handle);records.set(handle,record);counters.creations++;
   try{for(const name of ['k','v']){record[name]=new ort.Tensor('float32',data[name],[heads,keys,headDim]);counters.currentBytes+=record.singleBytes;counters.peakBytes=Math.max(counters.peakBytes,counters.currentBytes);}abort(signal);return handle;}
   catch(primary){try{release(handle);}catch(error){throw new AggregateError([primary,error],'Prepared attention K/V preparation and cleanup failed',{cause:primary});}throw primary;}
  },
  borrow(handle,{keyStart=handle?.keyStart,keys=handle?.keys,signal}={}){
   live(signal);const record=lookup(handle);if(keyStart!==handle.keyStart||keys!==handle.keys)throw RangeError('Prepared attention K/V range start/keys mismatch');
   record.leases++;counters.activeLeases++;counters.peakLeases=Math.max(counters.peakLeases,counters.activeLeases);let released=false;
   return Object.freeze({k:record.k,v:record.v,keyStart:handle.keyStart,keys:handle.keys,byteLength:handle.byteLength,release(){if(released)return false;released=true;record.leases--;counters.activeLeases--;return true;}});
  },
  release,
  disposeAll(){if(disposed)return;const errors=[];for(const handle of [...records.keys()])try{release(handle);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Prepared attention K/V resources remain for recovery');disposed=true;cleanupFailed=false;},
  stats(){return {...counters,ownedPairs:records.size,cleanupPending:cleanupFailed,disposed,layout:'compact head-major [40,K<=256,128]',binding:'CPU ort.Tensor runtime-input; native ORT/WASM upload not eliminated or measured'};}
 });
}

// Build the pool directly from ordered projected row chunks. Completed compact
// tiles are transferred, replacing the old two full row-major sequence stores.
export function createOrderedAttentionKVPool({totalKeys,prepare,release,signal}={}){
 positive(totalKeys,Number.MAX_SAFE_INTEGER,'totalKeys');if(typeof prepare!=='function'||typeof release!=='function')throw TypeError('Prepared attention K/V callbacks required');
 const tiles=new Map();let consumed=0,pending=null,disposed=false,complete=false,preparedBytes=0,peakTotalBytes=0;
 const live=()=>{if(disposed)throw Error('Ordered attention K/V pool disposed');abort(signal);};
 const measure=()=>{peakTotalBytes=Math.max(peakTotalBytes,preparedBytes+(pending?pending.k.byteLength+pending.v.byteLength:0));};
 const api=Object.freeze({
  appendRows({k,v,rowStart,rows}={}){
   live();if(complete)throw RangeError('Ordered attention K/V pool complete');positive(rows,128,'rows');
   if(rowStart!==consumed||rows>totalKeys-consumed)throw RangeError('Ordered K/V row start/order exceeds range');
   for(const value of [k,v])if(Object.getPrototypeOf(value??{})!==Float32Array.prototype||value.length!==rows*5120)throw TypeError('Ordered K/V rows require exact F32 row-major spans');
   let offset=0;while(offset<rows){
    if(!pending){const keyStart=consumed,keys=Math.min(256,totalKeys-keyStart);pending={keyStart,keys,filled:0,k:new Float32Array(keys*5120),v:new Float32Array(keys*5120)};measure();}
    const count=Math.min(rows-offset,pending.keys-pending.filled);
    for(let h=0;h<40;h++)for(let row=0;row<count;row++){const from=(offset+row)*5120+h*128,to=(h*pending.keys+pending.filled+row)*128;pending.k.set(k.subarray(from,from+128),to);pending.v.set(v.subarray(from,from+128),to);}
    pending.filled+=count;offset+=count;consumed+=count;
    if(pending.filled===pending.keys){const tile=pending,handle=prepare({k:tile.k,v:tile.v,heads:40,keys:tile.keys,headDim:128,keyStart:tile.keyStart,ownership:'take',signal});tiles.set(tile.keyStart,handle);preparedBytes+=handle.byteLength;pending=null;measure();}
   }
  },
  finish(){live();if(consumed!==totalKeys||pending)throw RangeError('Ordered attention K/V pool has not consumed every expected row');complete=true;return api;},
  tileAt(keyStart){live();if(!complete)throw Error('Ordered attention K/V pool not complete');if(!Number.isSafeInteger(keyStart)||keyStart<0||keyStart>=totalKeys||keyStart%256!==0)throw RangeError('K/V tile range must be aligned');const handle=tiles.get(keyStart);if(!handle)throw Error('Prepared attention K/V tile unavailable');return handle;},
  dispose(){if(disposed)return;pending=null;const errors=[];for(const [start,handle]of [...tiles])try{release(handle);tiles.delete(start);preparedBytes-=handle.byteLength;}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Ordered attention K/V pool release incomplete');disposed=true;},
  stats(){return {totalKeys,consumed,complete,disposed,preparedTiles:tiles.size,preparedBytes,pendingBytes:pending?pending.k.byteLength+pending.v.byteLength:0,peakTotalBytes,rowMajorFullStores:0};}
 });return api;
}

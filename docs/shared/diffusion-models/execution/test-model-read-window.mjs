import test from 'node:test';
import assert from 'node:assert/strict';
import {createModelReadWindow,validateModelReadAheadBytes} from './model-read-window.mjs';

const entry=(originalKey,start,byteLength)=>({originalKey,absoluteByteOffset:start,byteLength});
function tracked(){
 const input=Uint8Array.from({length:64},(_,i)=>i),calls=[],buffers=[];let hold=null;
 class Original extends Blob{
  slice(start,end){const native=super.slice(start,end);return {async arrayBuffer(){calls.push([start,end]);if(hold){const waiting=hold;hold=null;await new Promise(done=>waiting.release=done);}const buffer=await native.arrayBuffer();buffers.push(buffer);return buffer;}};}
 }
 return {file:new Original([input]),calls,buffers,hold(){hold={release:null};return hold;}};
}

test('disabled window reads exactly each request and returns independent storage',async()=>{
 const f=tracked(),reader=createModelReadWindow({file:f.file,maxRequestBytes:8});
 try{const a=await reader.read(entry('a',8,24),8,4);a.fill(99);const b=await reader.read(entry('a',8,24),8,4);assert.deepEqual([...b],[8,9,10,11]);assert.deepEqual(f.calls,[[8,12],[8,12]]);assert.equal(reader.stats().cachedBytes,0);assert.equal(reader.stats().windowCopyBytes,0);}finally{reader.dispose();}
});

test('window hit, miss, tail and tensor-key transitions keep selected copies exact',async()=>{
 const f=tracked(),reader=createModelReadWindow({file:f.file,readAheadBytes:16,maxRequestBytes:8});
 try{
  const a=await reader.read(entry('a',8,24),8,4);a.fill(99);const hit=await reader.read(entry('a',8,24),12,4);
  assert.deepEqual([...hit],[12,13,14,15]);assert.deepEqual(f.calls,[[8,24]]);
  await reader.read(entry('a',8,24),30,2);assert.deepEqual(f.calls.at(-1),[30,32]);assert.equal(reader.stats().cachedBytes,2);
  await reader.read(entry('b',32,8),32,4);assert.deepEqual(f.calls.at(-1),[32,40]);
  assert.equal(reader.stats().cacheHits,1);assert.equal(reader.stats().cacheMisses,3);assert.equal(reader.stats().peakCachedBytes,16);
 }finally{reader.dispose();}
});

test('nonmultiple read-ahead uses whole selected blocks without overlapping sequential storage',async()=>{
 const f=tracked(),reader=createModelReadWindow({file:f.file,readAheadBytes:17,maxRequestBytes:8});
 try{
  const record=entry('a',8,40);
  for(let offset=8;offset<40;offset+=4)assert.deepEqual([...(await reader.read(record,offset,4))],[offset,offset+1,offset+2,offset+3]);
  assert.deepEqual(f.calls,[[8,24],[24,40]]);assert.equal(reader.stats().storageReadBytes,32);assert.equal(reader.stats().peakCachedBytes,16);assert.equal(reader.stats().cacheHits,6);
 }finally{reader.dispose();}
});

test('invalid original ranges and configuration reject before storage access',async()=>{
 const f=tracked(),reader=createModelReadWindow({file:f.file,readAheadBytes:16,maxRequestBytes:8});
 try{
  for(const [record,start,count]of [[entry('a',8,24),7,4],[entry('a',8,24),31,2],[entry('a',8,24),8,9],[entry('a',8,24),8,0],[entry('a',8,24),NaN,4],[entry('bad',0,65),0,4],[entry('',0,4),0,4]])await assert.rejects(reader.read(record,start,count),/range/);
  assert.equal(f.calls.length,0);assert.equal(reader.stats().storageReadAttempts,0);
  for(const bad of [-1,NaN,1.5,1048577])assert.throws(()=>validateModelReadAheadBytes(bad),/readAheadBytes/);
 }finally{reader.dispose();}
});

test('aborted pending refill never publishes a cache and reports discarded IO separately',async()=>{
 const f=tracked(),reader=createModelReadWindow({file:f.file,readAheadBytes:16,maxRequestBytes:8}),control=new AbortController(),wait=f.hold();
 const pending=reader.read(entry('a',8,24),8,4,{signal:control.signal});await Promise.resolve();assert.throws(()=>reader.dispose(),/Await/);control.abort();wait.release();await assert.rejects(pending,{name:'AbortError'});
 assert.equal(reader.stats().busy,false);assert.equal(reader.stats().cachedBytes,0);assert.equal(reader.stats().storageReads,1);assert.equal(reader.stats().discardedStorageReads,1);assert.equal(reader.stats().storageReadFailures,0);
 assert.deepEqual([...(await reader.read(entry('a',8,24),8,4))],[8,9,10,11]);assert.equal(reader.stats().storageReads,2);reader.dispose();
});

test('entry primitives are captured before await and retired buffers are cleared',async()=>{
 const f=tracked(),reader=createModelReadWindow({file:f.file,readAheadBytes:16,maxRequestBytes:8}),record=entry('a',8,24),wait=f.hold();
 const pending=reader.read(record,8,4);await Promise.resolve();record.originalKey='changed';record.absoluteByteOffset=0;record.byteLength=1;wait.release();await pending;
 assert.equal(reader.stats().cachedBytes,16);const old=f.buffers[0];await reader.read(entry('b',32,8),32,4);assert.equal(new Uint8Array(old).every(v=>v===0),true);
 const current=f.buffers[1];reader.dispose();assert.equal(new Uint8Array(current).every(v=>v===0),true);assert.equal(reader.stats().cachedBytes,0);await assert.rejects(reader.read(entry('a',8,24),8,4),/disposed/);
});

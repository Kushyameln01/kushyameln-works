import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createIndexBudget} from '../development/vr180/index-prototype/index-store.mjs';
import {createFileOutput} from '../docs/shared/vr180/file-output.mjs';
import {sha256Blob} from '../docs/shared/vr180/sha256.mjs';
const source=(await readFile(new URL('../development/vr180/p5-long-prototype/worker.mjs',import.meta.url),'utf8')).replace(/^import.*;\n/gm,'');
const namespace='v-11111111-1111-1111-1111-111111111111';
function fixture(options={}){
 const calls={createIndex:0,dispose:0,write:0,read:0,flush:0,close:0,abort:0,locks:[],post:[]};let context;
 function directory(){const files=new Map(),dirs=new Map();return {files,dirs,
  async getDirectoryHandle(name,{create=false}={}){if(!dirs.has(name)){if(!create)throw new DOMException('missing','NotFoundError');dirs.set(name,directory());}return dirs.get(name);},
  async getFileHandle(name,{create=false}={}){if(!files.has(name)){if(!create)throw new DOMException('missing','NotFoundError');let bytes=new Uint8Array();
   const handle={kind:'file',async getFile(){return new Blob([bytes]);},async createSyncAccessHandle(){return {
    getSize:()=>bytes.length,write(data,{at}){calls.write++;if(options.recordWriteFails)throw Error('RECORD_WRITE_FAILED');const n=Math.min(data.length,7);
     const next=new Uint8Array(Math.max(bytes.length,at+n));next.set(bytes);next.set(data.subarray(0,n),at);bytes=next;
     if(options.cancelRecord)vm.runInContext('aborter.abort()',context);return n;},
    read(data,{at}){calls.read++;const n=Math.min(data.length,5);data.set(bytes.subarray(at,at+n));return n;},
    flush(){calls.flush++;},close(){calls.close++;}};},
   async createWritable(){return {async write({position,data}){const next=new Uint8Array(Math.max(bytes.length,position+data.length));next.set(bytes);next.set(data,position);bytes=next;},
    async close(){},async truncate(size){bytes=bytes.slice(0,size);},async abort(){calls.abort++;bytes=new Uint8Array();}};}};files.set(name,handle);}return files.get(name);},
  async removeEntry(name){if(files.has(name))files.delete(name);else if(dirs.has(name))dirs.delete(name);else throw new DOMException('missing','NotFoundError');},
 };
 }
 const origin=directory(),held=new Set();
 const navigator={storage:{getDirectory:async()=>origin,estimate:async()=>({quota:10737418240,usage:0})},locks:{
  query:async()=>({held:[...held].map(name=>({name}))}),
  async request(name,opts,fn){calls.locks.push(name);assert.equal(opts.ifAvailable,true);assert.equal(opts.mode,'exclusive');
   if(options.cleanupLockFails)return fn(null);assert(!held.has(name));held.add(name);try{return await fn({name});}finally{held.delete(name);}},
 }};
 const M={Quality:class{},canEncodeVideo:async()=>!options.unsupported,
  Mp4OutputFormat:class{constructor(options){this._options=options;}},StreamTarget:class{constructor(stream,options){assert.equal(options.chunked,true);assert.equal(options.chunkSize,1048576);this.stream=stream;}},
  Output:class{constructor({format,target}){this.format=format;this.target=target;this.state='pending';}addVideoTrack(){}
   async start(){this.state='started';throw Error('OUTPUT_START_FAILED');}
   async cancel(){if(options.cancelFails)throw Error('CODEC_CANCEL_FAILED');this.state='canceled';}},CanvasSource:class{},
 };
 context=vm.createContext({Uint8Array,TextEncoder,TextDecoder,Blob,DOMException,AbortController,WritableStream,performance,crypto:globalThis.crypto,
  setTimeout,clearTimeout,navigator,isSecureContext:true,createIndexBudget,createFileOutput,sha256Blob,M,
  longProfile:id=>({id,generationSeconds:1,conversionSeconds:1,inputFileBytes:128}),LONG_FRAME_PROFILE:{},C:{bitrate:32000000,width:1024,height:512,maxFrames:100000},
  fillLongFrame(){},generationNeedsFrame:()=>false,assertGenerated(){},inspectMp4:async()=>({transcodeSafe:true}),convertStereo:async()=>{throw Error('UNEXPECTED_CONVERSION');},
  async createOutputIndex({root,jobId,budget}){calls.createIndex++;root.dirs.set(jobId,directory());const release=budget.reserve(64);return {async dispose(){calls.dispose++;root.dirs.delete(jobId);release();}};},
  OffscreenCanvas:class{getContext(){return {createImageData:()=>({data:new Uint8Array(4)})};}},self:{addEventListener(){},postMessage:value=>calls.post.push(value)},
 });
 vm.runInContext(source,context);return {calls,origin,run:()=>context.run({namespace,profileId:'p5-5gb'})};
}

test('Worker owner registry fully writes/flushes/reads/closes before index; primary failure survives independent cleanup',async()=>{
 const f=fixture(),result=await f.run();assert.equal(result.error.message,'OUTPUT_START_FAILED');assert(f.calls.write>1&&f.calls.read>1);
 assert.equal(f.calls.flush,1);assert.equal(f.calls.close,1);assert.equal(f.calls.createIndex,1);assert.equal(f.calls.dispose,1);assert.equal(f.calls.abort,1);
 assert.equal(result.indexReservedAfterCleanup,0);assert.equal(result.ownerRecordsRemoved,true);
 const root=f.origin.dirs.get(namespace);assert.deepEqual([...root.files.keys()],['input.mp4']);assert.equal(root.dirs.size,0);
 assert.equal(f.calls.locks.length,3);assert(f.calls.locks.every(name=>name.startsWith('vr180:index-job:')));
});
test('ownership persistence rejection or cancellation cannot create index and keeps unverified record',async()=>{
 for(const options of [{recordWriteFails:true},{cancelRecord:true}]){
  const f=fixture(options),result=await f.run();assert.equal(f.calls.createIndex,0);assert.equal(f.calls.close,1);
  assert.equal(result.status,'FAIL');assert.equal(result.ownerRecordsRemoved,undefined);
  assert(f.origin.dirs.get(namespace).files.has('owner-generation.json'));
 }
});
test('codec cancel failure still aborts the writer and releases index but never claims complete cleanup',async()=>{
 const f=fixture({cancelFails:true}),result=await f.run();assert.equal(result.error.message,'OUTPUT_START_FAILED');
 assert.equal(f.calls.abort,1);assert.equal(f.calls.dispose,1);assert.equal(result.indexReservedAfterCleanup,0);
 assert.equal(result.cleanupFailureObserved,true);assert.equal(result.ownerRecordsRemoved,undefined);
 assert(f.origin.dirs.get(namespace).files.has('owner-generation.json'));
});
test('active cleanup lease forbids registry deletion even after controller returned',async()=>{
 const f=fixture({cleanupLockFails:true}),result=await f.run();assert.equal(result.ownerRecordsRemoved,undefined);
 assert.equal(result.cleanupError.message,'LONG_CLEANUP_JOB_ACTIVE');assert(f.origin.dirs.get(namespace).files.has('owner-generation.json'));
});
test('unsupported encoder is a refusal, not payload or storage success',async()=>{
 const f=fixture({unsupported:true}),result=await f.run();assert.equal(result.status,'BLOCKED');assert.equal(result.error.message,'LONG_ENCODER_UNSUPPORTED');
 assert.equal(f.calls.createIndex,0);assert.equal(result.indexReservedAfterCleanup,0);assert.equal(result.files.length,0);
});

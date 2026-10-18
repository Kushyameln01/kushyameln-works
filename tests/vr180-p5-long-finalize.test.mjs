import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {createOutputIndex} from '../development/vr180/output-index-prototype/output-index.mjs';
import {nodeRoot, testLocks} from '../development/vr180/output-index-prototype/node-backend.mjs';
import {createIndexBudget} from '../development/vr180/index-prototype/index-store.mjs';
import {createFileOutput} from '../docs/shared/vr180/file-output.mjs';
import {inspectMp4} from '../docs/shared/vr180/mp4.mjs';
import {sha256Blob} from '../docs/shared/vr180/sha256.mjs';
import {generationNeedsFrame, assertGenerated} from '../development/vr180/p5-long-prototype/profile.mjs';

// Execute the real Worker. Only imports are injected; no call or function body is
// rewritten. An override permits the same assertions to run against the old file.
const workerPath = process.env.VR180_LONG_WORKER_TEST_SOURCE ?? new URL('../development/vr180/p5-long-prototype/worker.mjs', import.meta.url);
const source = (await readFile(workerPath, 'utf8')).replace(/^import.*;\n/gm, '');
const namespace = 'v-11111111-1111-1111-1111-111111111111';
const u32 = (...values) => {const bytes = new Uint8Array(values.length * 4), d = new DataView(bytes.buffer); values.forEach((n,i) => d.setUint32(i*4,n)); return bytes;};
const text = s => new TextEncoder().encode(s);
const node = (type, contents = new Uint8Array(), children = []) => ({type, contents, children});
const payload = Uint8Array.from({length:12}, (_,i) => i+40);
const ftyp = Uint8Array.of(...u32(32), ...text('ftypisom'), ...u32(0), ...text('isomiso2avc1mp41'));

// One-sample metadata fixture; the real index supplies its on-disk timing,
// offsets and size tables, and its real parser verifies the final tree.
function makeMoov(track) {
 const tkhd = new Uint8Array(84), t = new DataView(tkhd.buffer);
 t.setUint32(12,1); t.setUint32(76,16*65536); t.setUint32(80,8*65536);
 [65536,0,0,0,65536,0,0,0,1073741824].forEach((n,i) => t.setUint32(40+i*4,n));
 const mdhd = new Uint8Array(24); new DataView(mdhd.buffer).setUint32(12,30000);
 const mvhd = new Uint8Array(100), m = new DataView(mvhd.buffer); m.setUint32(12,30000); m.setUint32(20,65536);
 [65536,0,0,0,65536,0,0,0,1073741824].forEach((n,i) => m.setUint32(36+i*4,n));
 const header = new Uint8Array(78), h = new DataView(header.buffer); h.setUint16(6,1); h.setUint16(24,16); h.setUint16(26,8);
 const avc1 = node('avc1',header,[node('avcC',Uint8Array.of(1,100,0,31,255,225,0,1,103,1,0,1,104))]);
 const stbl = node('stbl',undefined,[node('stsd',u32(0,1),[avc1]),...['stts','stsc','stsz','stco'].map(type => track.vr180Index.tableBox(type))]);
 const minf = node('minf',undefined,[node('vmhd',new Uint8Array(12)),node('dinf',undefined,[node('dref',u32(0,1),[node('url ',u32(1))])]),stbl]);
 return node('moov',undefined,[node('mvhd',mvhd),node('trak',undefined,[node('tkhd',tkhd),node('mdia',undefined,[node('mdhd',mdhd),node('hdlr',Uint8Array.of(...u32(0,0),...text('vide'),...new Uint8Array(12))),minf])])]);
}

async function fixture(t, {corruptReread = false} = {}) {
 const path = await mkdtemp(join(tmpdir(),'vr180-long-finalize-'));
 t.after(() => rm(path,{recursive:true,force:true}));
 const backend = nodeRoot(path), locks = testLocks(), calls = {metadataSlices:[], mediaClose:0, mediaAbort:0, committedReads:0, post:[], conversion:0};
 let index, savedBytes;
 // Real files and the existing synchronous index adapter. The writable file
 // handle is a test implementation; this is not a native OPFS qualification.
 function directory(base, location) {
  return {...base,
   async getDirectoryHandle(name, options) {return directory(await base.getDirectoryHandle(name,options),join(location,name));},
   async getFileHandle(name, options) {
    const handle = await base.getFileHandle(name,options); let committed = false;
    return {...handle,
     async getFile() {
      const blob = await handle.getFile();
      if (name === 'input.mp4' && committed) {
       calls.committedReads++; const bytes = new Uint8Array(await blob.arrayBuffer()); savedBytes = bytes;
       if (corruptReread && calls.committedReads === 2) {const copy = bytes.slice(); copy[48] ^= 1; return new Blob([copy]);}
      }
      return blob;
     },
     async createWritable() {
      const fd = await open(join(location,name),'r+'); let closed = false;
      return {
       async write({position,data}) {for(let at=0;at<data.length;) {const {bytesWritten} = await fd.write(data,at,data.length-at,position+at); assert(bytesWritten>0); at+=bytesWritten;}},
       async truncate(size) {await fd.truncate(size);},
       async close() {await fd.sync(); await fd.close(); closed=true; committed=true; calls.mediaClose++;},
       async abort() {if(!closed) {await fd.truncate(0); await fd.close(); closed=true;} calls.mediaAbort++;},
      };
     },
    };
   },
  };
 }
 const origin = directory(backend.root,path);
 const navigator = {storage:{getDirectory:async()=>origin,estimate:async()=>({quota:10737418240,usage:0})},
  locks:{...locks,query:async()=>({held:[...locks.held.keys()].map(name=>({name}))})}};
 // Replace the codec/Canvas adapters, not the Worker sequence or index. The fake
 // codec emits one synthetic packet; the real index writes and verifies moov.
 const M = {Quality:class {},canEncodeVideo:async()=>true,
  Mp4OutputFormat:class {constructor(options) {this._options=options;}},
  StreamTarget:class {constructor(stream) {this.stream=stream;}},
  CanvasSource:class {
   constructor(canvas,config) {this.config=config;}
   async add(timestamp,duration) {
    const packet={timestamp,duration,data:payload,size:payload.length,type:'key'};
    await index.register(this.muxer,this.track,packet);
    this.config.onEncodedPacket(packet,{decoderConfig:{codec:'avc1.64001f',codedWidth:16,codedHeight:8,description:new Uint8Array(13)}});
   }
   close() {}
  },
  Output:class {
   constructor({format,target}) {this.format=format; this.target=target; this.state='pending';}
   addVideoTrack(source) {this.source=source;}
   async start() {
    this.state='started'; this.streamWriter=this.target.stream.getWriter(); let position=0; const writes=[];
    const writeAt=(at,data)=>writes.push({type:'write',position:at,data:data.slice()});
    const writer={target:{},getPos:()=>position,write(data) {writeAt(position,data); position+=data.length;},flush:async()=>{while(writes.length) await this.streamWriter.write(writes.shift());}};
    const track={type:'video',timescale:30000,startTimestampOffset:null,track:{id:1,source:{_codec:'avc'}},info:{width:16,height:8}}, mdat={};
    const muxer={writer,fastStart:false,isFragmented:false,isQuickTime:false,isCmaf:false,formatOptions:this.format._options,
     output:{tracks:[track]},trackDatas:[track],mdat,ensureOneEnabledTrack(){},
     boxWriter:{offsets:new Map([[mdat,ftyp.length]]),patchBox(box) {assert.equal(box.largeSize,false); writeAt(ftyp.length,Uint8Array.of(...u32(box.size),...text('mdat'),...new Uint8Array(8)));}},
    };
    this.muxer=muxer; this.source.muxer=muxer; this.source.track=track;
    index.start(muxer); muxer.formatOptions.onFtyp(ftyp);
    writer.write(ftyp); writer.write(new Uint8Array(16)); await writer.flush();
   }
   async finalize() {
    this.state='finalizing'; await index.finalize(this.muxer,()=>makeMoov(this.source.track));
    await this.streamWriter.close(); this.streamWriter.releaseLock(); this.state='finalized';
    // These are direct assertions on the real sourceFor contract. Explicit
    // endpoints do not make payload holes, reversed or oversized ranges valid.
    const src=index.metadataSource, at=index.metrics.moovPosition;
    assert.throws(()=>src.slice(at),/UNSAFE_INDEX_POSITION/);
    assert.throws(()=>src.slice(at,src.size+1),/OUTPUT_METADATA_RANGE_INVALID/);
    assert.throws(()=>src.slice(at+1,at),/OUTPUT_METADATA_RANGE_INVALID/);
    assert.throws(()=>src.slice(ftyp.length+16,at),/OUTPUT_METADATA_PAYLOAD_UNAVAILABLE/);
   }
   async cancel() {this.state='canceled';}
  },
 };
 const context=vm.createContext({Uint8Array,TextEncoder,TextDecoder,Blob,DOMException,AbortController,WritableStream,performance,crypto:globalThis.crypto,
  setTimeout,clearTimeout,navigator,isSecureContext:true,createIndexBudget,createFileOutput,sha256Blob,inspectMp4,M,
  longProfile:id=>({id,targetPayloadBytes:payload.length,generationSeconds:5,conversionSeconds:5,inputFileBytes:4096}),
  LONG_FRAME_PROFILE:{},C:{bitrate:32000000,width:16,height:8,maxFrames:100000},fillLongFrame(){},generationNeedsFrame,assertGenerated,
  async convertStereo(input) {calls.conversion++; assert.equal((await inspectMp4(input)).sampleCounts.video,1); throw Error('TEST_STOP_AFTER_VERIFIED_GENERATION');},
  async createOutputIndex(options) {
   index=await createOutputIndex({...options,lockManager:navigator.locks,yieldTask:()=>Promise.resolve()});
   return {get metrics(){return index.metrics;},get metadataSource(){const source=index.metadataSource; return {size:source.size,slice(...args){calls.metadataSlices.push(args); return source.slice(...args);}};},dispose:()=>index.dispose()};
  },
  OffscreenCanvas:class {getContext(){return {createImageData:()=>({data:new Uint8Array(16*8*4)}),putImageData(){}};}},
  self:{addEventListener(){},postMessage:value=>calls.post.push(value)},
 });
 vm.runInContext(source,context,{filename:String(workerPath)});
 return {calls,backend,locks,run:()=>context.run({namespace,profileId:'p5-5gb'}),saved:()=>savedBytes};
}

test('actual long Worker hashes the strict metadata range, commits and rereads the complete generated file',async t=>{
 const f=await fixture(t),result=await f.run();
 assert.equal(result.stages.generation.status,'PASS',result.error?.message);
 assert.equal(result.error.message,'TEST_STOP_AFTER_VERIFIED_GENERATION');
 assert.equal(f.calls.conversion,1); assert.equal(f.calls.mediaClose,1); assert.equal(f.calls.mediaAbort,0); assert.equal(f.calls.committedReads,2);
 const generated=result.generation; assert.equal(generated.frames,1); assert.equal(generated.packets,1); assert.equal(generated.payloadBytes,12);
 assert.equal(generated.savedWriteCommitted,true); assert.equal(generated.index.metadataClosed,true); assert.equal(generated.index.verification.sampleCounts.total,1);
 assert.equal(f.calls.metadataSlices.length,1); assert.deepEqual(f.calls.metadataSlices[0],[generated.index.moovPosition,generated.bytes]);
 const saved=new Blob([f.saved()]); assert.equal(await sha256Blob(saved),generated.sha256);
 assert.equal((await inspectMp4(saved)).projection,'equi');
 assert.equal(result.indexReservedAfterCleanup,0); assert.equal(result.indexDirectoriesRemoved,true); assert.equal(result.ownerRecordsRemoved,true);
 assert.equal(f.backend.open.size,0); assert.equal(f.locks.held.size,0);
});

test('actual long Worker rejects a changed full-file reread after commit and still cleans its index',async t=>{
 const f=await fixture(t,{corruptReread:true}),result=await f.run();
 assert.equal(result.stages.generation.status,'FAIL'); assert.equal(result.error.message,'INPUT_FULL_REREAD_DIFFERS');
 assert.equal(f.calls.conversion,0); assert.equal(f.calls.mediaClose,1); assert.equal(f.calls.mediaAbort,0);
 assert.equal(result.generation.cleanup.saveState.committed,true); assert.equal(result.indexReservedAfterCleanup,0);
 assert.equal(result.indexDirectoriesRemoved,true); assert.equal(result.ownerRecordsRemoved,true);
 assert.equal(f.backend.open.size,0); assert.equal(f.locks.held.size,0);
});

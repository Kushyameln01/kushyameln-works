import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {createIndexBudget} from '../development/vr180/index-prototype/index-store.mjs';
import {buildStereoGeometry} from '../docs/shared/vr180/geometry.mjs';
import {createFileOutput} from '../docs/shared/vr180/file-output.mjs';
import {sha256Blob} from '../docs/shared/vr180/sha256.mjs';
import {createDirectMuxDestination,createAacPacketCopier,validateIndexedAdmission,inspectSavedOutput,convertStereo} from '../development/vr180/indexed-transform-prototype/transform.mjs';
const privateURL=new URL('../development/vr180/indexed-transform-prototype/transform.mjs',import.meta.url);
const settings={mode:'convert',confirmed:true,layout:'sbs',fov:180,eyeSize:128,bitrate:2000000};
const info={width:512,height:256,stereoMode:null,projection:null,pose:null,bounds:null,transcodeSafe:true,transcodeIssues:[],sampleCounts:{video:3,audio:0,total:3},containerMetadataBytes:1024};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(options={}) {
  const calls={inspect:[],controllers:[],write:0,abort:0,cancel:0,inputDispose:0,draw:0,sampleClose:0,canvas:null,controllerDispose:[]};
  let buffer=new Uint8Array(),committed=false,abortFails=!!options.abortFails,disposeFails=!!options.disposeFails;
  const inputFile=new Blob(['input']);
  const handle={async getFile(){const copy=buffer.slice();if(committed&&options.corruptSavedMetadata)copy[4]^=1;return new Blob([copy]);},async createWritable(){return {
    async write({position,data}){calls.write++;if(buffer.length<position+data.length){const next=new Uint8Array(position+data.length);next.set(buffer);buffer=next;}buffer.set(data,position);},
    async truncate(size){buffer=buffer.slice(0,size);},async close(){committed=true;},async abort(){calls.abort++;if(abortFails)throw Error('WRITER_ABORT_FAILED');buffer=new Uint8Array();},
  };}};
  const indexRoot={getDirectoryHandle(){throw Error('Injected controller must own backend');}};
  const video={type:'video',getCodec:async()=> 'avc',hasHighDynamicRange:async()=>false,getRotation:async()=>0,getFlip:async()=>false,
    getPixelAspectRatio:async()=>({num:1,den:1}),getDisplayWidth:async()=>512,getDisplayHeight:async()=>256,canDecode:async()=>true};
  const createController=(type,opts)=>{
    const release=opts.budget.reserve(64),metrics={disposed:false,metadataClosed:false,sampleCount:3,moovPosition:4,moovBytes:4,verification:{sampleCounts:{total:3}}};
    calls.controllers.push({type,options:opts,metrics});return {metrics,metadataSource:new Blob([Uint8Array.of(1,2,3,4,5,6,7,8)]),async dispose(){calls.controllerDispose.push(type);
      if(type==='input'&&disposeFails)throw Error('INDEX_CLOSE_FAILED');if(!metrics.disposed){metrics.disposed=true;release();}}};
  };
  const fork={MP4:{},BlobSource:class {constructor(file){assert.equal(file,inputFile);}},Quality:class {},EncodedPacketSink:class {},EncodedAudioPacketSource:class {},
    Input:class {async getTracks(){assert(this._vr180InputIndex,'index must be attached before getTracks');return [video];}async getDurationFromMetadata(){return .1;}dispose(){calls.inputDispose++;}},
    VideoSampleSink:class {samples(){let i=0;return {async next(){if(i===3)return {done:true};const index=i++;return {done:false,value:{displayWidth:512,displayHeight:256,timestamp:index/30,duration:1/30,draw(){calls.draw++;},close(){calls.sampleClose++;}}};},async return(){return {done:true};}};}},
    CanvasSource:class {constructor(canvas,config){this.config=config;}async add(){this.config.onEncodedPacket();}close(){}},
    Mp4OutputFormat:class {constructor(options){this._options=options;}},StreamTarget:class {constructor(stream,opts){assert.equal(opts.chunked,true);assert.equal(opts.chunkSize,1048576);this.stream=stream;}},
    Output:class {constructor({format,target}){this.format=format;this.target=target;this.state='pending';}addVideoTrack(){}addAudioTrack(){}
      async start(){if(options.startFails)throw Error('OUTPUT_START_FAILED');this.state='started';}
      async finalize(){this.state='finalizing';assert(this.format._options.vr180Index);assert(!('onMoov' in this.format._options));
        const writer=this.target.stream.getWriter();await writer.write({type:'write',position:0,data:Uint8Array.of(1,2,3,4,5,6,7,8)});await writer.close();writer.releaseLock();
        this.format._options.vr180Index.metrics.metadataClosed=true;this.state='finalized';}
      async cancel(){calls.cancel++;if(options.cancelFails)throw Error('CODEC_CANCEL_FAILED');this.state='canceled';}},canEncodeVideo:async()=>true};
  const source=(await readFile(privateURL,'utf8')).replace(/^import[\s\S]*?from [^\n]*;\n/gm,'').replace(/^export /gm,'');
  const context=vm.createContext({Uint8Array,Blob,DOMException,AbortController,WritableStream,performance,createFileOutput,sha256Blob,buildStereoGeometry,createIndexBudget,
    inspectMp4:async file=>{calls.inspect.push(file);if(file===inputFile){if(options.admissionFails)throw Error('PUBLIC_PARSER_REFUSED');return info;}return {...info,width:256,height:128,stereoMode:2,projection:'equi'};},
    inspectOutputMp4:async()=>({...info,width:256,height:128,stereoMode:2,projection:'equi'}),
    createInputIndex:async opts=>createController('input',opts),createOutputIndex:async opts=>createController('output',opts),PROFILE:{sortReservedBytes:1600000},
    VideoEncoder:class {},VideoDecoder:class {},OffscreenCanvas:class {constructor(w,h){this.width=w;this.height=h;calls.canvas=this;}getContext(){return {};}}});
  new vm.Script(source,{filename:'private-indexed-transform.mjs'}).runInContext(context);
  return {calls,inputFile,handle,fork,indexRoot,run:extra=>context.convertStereo(inputFile,settings,{fork,indexRoot,outputHandle:handle,jobId:'trial',...extra}),
    recover(){abortFails=false;disposeFails=false;},committed:()=>committed};
}

test('private source is bound to public source and unchanged AAC / WebCodecs loop sections',async()=>{
  const provenance=JSON.parse(await readFile(new URL('../development/vr180/indexed-transform-prototype/provenance.json',import.meta.url),'utf8'));
  const original=await readFile(new URL('../docs/shared/vr180/transform.mjs',import.meta.url),'utf8'),candidate=await readFile(privateURL,'utf8');
  assert.equal(sha(original),provenance.sourceSHA256);assert.equal(sha(candidate),provenance.privateSHA256);
  for(const [start,end,key] of [['export function createAacPacketCopier','\n}\n','unchangedAACCopierSHA256'],['    const addAudioPacket = async () => {','    const prepareStarted = performance.now();','unchangedGeometryCanvasWebCodecsLoopSHA256']]){
    const a=original.slice(original.indexOf(start),original.indexOf(end,original.indexOf(start))),b=candidate.slice(candidate.indexOf(start),candidate.indexOf(end,candidate.indexOf(start)));
    assert.equal(a,b);assert.equal(sha(a),provenance[key]);
  }
  assert(!candidate.includes('vendor/mediabunny'));assert(!candidate.includes('createMuxCapture'));
});

test('public admission and unchanged sample/metadata limits refuse before index or writer acquisition',async()=>{
  for(const [change,pattern] of [[{transcodeSafe:false},/TIMELINE/],[{sampleCounts:{video:100001,audio:0,total:100001}},/SAMPLE_LIMIT/],[{containerMetadataBytes:16777217},/METADATA_LIMIT/]])assert.throws(()=>validateIndexedAdmission({...info,...change},settings),pattern);
  const f=await fixture({admissionFails:true});await assert.rejects(f.run(),/PUBLIC_PARSER_REFUSED/);assert.equal(f.calls.controllers.length,0);assert.equal(f.calls.write,0);assert.equal(f.calls.inspect.length,1);
});

test('actual private loop binds both indices to one budget, converts frames, commits, verifies and disposes before return',async()=>{
  const f=await fixture(),result=await f.run();assert.equal(f.calls.draw,6);assert.equal(f.calls.sampleClose,3);assert.equal(f.calls.inputDispose,1);
  const [input,output]=f.calls.controllers;assert.equal(input.options.budget,output.options.budget);assert.equal(input.options.jobId,'trial-in');assert.equal(output.options.jobId,'trial-out');
  assert.equal(input.options.source,f.inputFile);assert.equal(input.options.sortBytes+1600000,4194304);assert.equal(output.options.layout,'sbs');
  assert.equal(result.saved.committed,true);assert.equal(result.saved.hashMatched,false);assert.equal(result.verification.metadataHashMatched,true);
  assert.equal(result.metrics.indexReservedAfterCleanup,0);assert(result.metrics.inputIndex.disposed&&result.metrics.outputIndex.disposed);assert.equal(result.info.requiresMetadataPatch,false);
  assert.equal(result.file.size,8);assert.equal(f.calls.canvas.width,0);assert.equal(f.calls.canvas.height,0);
});

test('writer-acquisition cancellation retains live failure state and retry while both index owners still dispose',async()=>{
  const f=await fixture({abortFails:true}),aborter=new AbortController();let failure,cleanup;
  await assert.rejects(f.run({signal:aborter.signal,onCleanup:fn=>cleanup=fn,onOutputCreated(){aborter.abort();throw Error('OWNER_CALLBACK_FAILED');}}),e=>{failure=e;return e.name==='AbortError';});
  assert.equal(failure.saveOutputState.state,'cleanup-failed');assert.equal(failure.saveOutputState.writerAcquired,true);assert(!f.committed());
  assert(f.calls.controllers.every(c=>c.metrics.disposed));assert.equal(f.calls.controllers[0].options.budget.usedBytes,0);assert.equal(typeof failure.retryCleanup,'function');
  f.recover();await cleanup();assert.equal(failure.saveOutputState.state,'aborted');
});

test('failed codec cancel cannot skip writer abort or either index owner cleanup',async()=>{
  const f=await fixture({startFails:true,cancelFails:true});let failure;
  await assert.rejects(f.run(),e=>{failure=e;return /OUTPUT_START_FAILED/.test(e.message);});
  assert.equal(failure.requiresWorkerTermination,true);assert.match(failure.cleanupError,/CODEC_CANCEL_FAILED/);assert(f.calls.abort>0);assert(f.calls.controllers.every(c=>c.metrics.disposed));assert.equal(f.calls.canvas.width,0);
});

test('cleanup failure after verified commit preserves saved fact and retains failed index for retry',async()=>{
  const f=await fixture({disposeFails:true});let failure;
  await assert.rejects(f.run(),e=>{failure=e;return /INDEXED_CLEANUP_FAILED/.test(e.message);});
  assert.equal(failure.saveWriteCommitted,true);assert.equal(failure.saveOutputState.committed,true);assert(f.committed());
  assert.equal(f.calls.controllers[0].metrics.disposed,false);assert.equal(f.calls.controllers[1].metrics.disposed,true);
  f.recover();await failure.retryCleanup();assert.equal(f.calls.controllers[0].metrics.disposed,true);assert.equal(f.calls.controllers[0].options.budget.usedBytes,0);
});

test('saved metadata mismatch after commit cannot become a successful result or claim rollback',async()=>{
  const f=await fixture({corruptSavedMetadata:true});let failure;
  await assert.rejects(f.run(),e=>{failure=e;return /METADATA_HASH_MISMATCH/.test(e.message);});
  assert.equal(failure.saveOutputState.committed,true);assert.equal(failure.saveWriteCommitted,true);assert(f.calls.controllers.every(c=>c.metrics.disposed));
});

test('private destination refuses a write beyond one GiB before passing it to real transaction writer',async()=>{
  let writes=0;const handle={getFile:async()=>new Blob(),createWritable:async()=>({write:async()=>writes++,abort:async()=>{}})};
  const dest=await createDirectMuxDestination(handle),writer=dest.stream.getWriter();
  await assert.rejects(writer.write({type:'write',position:1024**3,data:new Uint8Array(1)}),/1 GiB/);assert.equal(writes,0);await dest.output.abort();
});

test('retained AAC copier still rejects gaps and non-grid timing without altering priming packets',async()=>{
  const config={sampleRate:48000,description:Uint8Array.of(0x11,0x88)},seen=[];
  const copier=createAacPacketCopier({add:async p=>seen.push(p)},config),packet={timestamp:-1024/48000,duration:1024/48000};
  await copier.add(packet);assert.equal(seen[0],packet);await assert.rejects(copier.add({timestamp:1/48000,duration:1024/48000}),/contiguous/);
  const next=createAacPacketCopier({add:async()=>{}},config);await assert.rejects(next.add({timestamp:0.5/48000,duration:1024/48000}),/sample grid/);
});

test('real fixed-original cslg media passes saved-output inspection but is refused by the actual strict conversion entry',async()=>{
  const original=await import('../docs/shared/media-basic/vendor/mediabunny.mjs');
  const {seed,generate}=await import('../tools/vr180/compare-output-index.mjs');
  const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
  const root=await mkdtemp(join(tmpdir(),'vr180-indexed-cslg-'));
  const keys=['OffscreenCanvas','VideoEncoder','VideoDecoder'],previous=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try {
    const file=join(root,'original.mp4');await generate({module:original,file,count:4,pattern:'alternating-ctts',seed:await seed()});
    const blob=new Blob([await readFile(file)]),savedInfo=await inspectSavedOutput(blob);assert.equal(savedInfo.sampleCounts.video,4);
    for(const key of keys)globalThis[key]=class {};
    let accessed=0;const handle={getFile(){accessed++;},createWritable(){accessed++;}},indexRoot={getDirectoryHandle(){accessed++;}};
    await assert.rejects(convertStereo(blob,settings,{fork:original,outputHandle:handle,indexRoot,jobId:'strict-cslg'}),/unsupported cslg/);
    assert.equal(accessed,0,'strict admission must precede index/destination acquisition');
  } finally {
    for(const key of keys){if(previous[key])Object.defineProperty(globalThis,key,previous[key]);else delete globalThis[key];}
    await rm(root,{recursive:true,force:true});
  }
});

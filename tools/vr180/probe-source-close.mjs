#!/usr/bin/env node
// Error propagation test on the real fixed fork and real-file IndexStore adapter.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {createOutputIndex} from '../../development/vr180/output-index-prototype/output-index.mjs';
import {nodeRoot,testLocks} from '../../development/vr180/output-index-prototype/node-backend.mjs';
const {values}=parseArgs({options:{bundle:{type:'string'},output:{type:'string'},expect:{type:'string'}}});
assert(values.bundle&&values.output&&['old','fixed'].includes(values.expect));
const out=resolve(values.output);await mkdir(out);const M=await import(pathToFileURL(resolve(values.bundle)));
const input=new M.Input({source:new M.BlobSource(await openAsBlob('docs/vr180-studio/fixtures/stereo180-sbs.mp4')),formats:[M.MP4]});
const video=(await input.getTracks()).find(t=>t.type==='video'),packet=await new M.EncodedPacketSink(video).getFirstPacket(),config=await video.getDecoderConfig();input.dispose();
const tick=()=>new Promise(r=>setImmediate(r)),results=[];
for(const mode of ['delayed-finalize-read-failure','pending-finalize-write-failure','pending-cancel']){
  let enabled=false,releaseYield,enterYield;const entered=new Promise(r=>enterYield=r),aborter=new AbortController(),unhandled=[];
  const listener=error=>unhandled.push({name:error.name,message:error.message});process.on('unhandledRejection',listener);
  const backend=nodeRoot(join(out,mode),{read(){if(enabled&&mode==='delayed-finalize-read-failure')throw Error('INDEX_READ_FAILURE');},write(){if(enabled&&mode==='pending-finalize-write-failure')throw Error('INDEX_WRITE_FAILURE');}}),locks=testLocks();
  const controller=await createOutputIndex({root:backend.root,jobId:'close',lockManager:locks,signal:aborter.signal,yieldTask:()=>enabled&&mode!=='delayed-finalize-read-failure'?new Promise(r=>{releaseYield=r;enterYield();}):tick()});
  const format=new M.Mp4OutputFormat({fastStart:false});format._options.vr180Index=controller;
  const output=new M.Output({format,target:new M.BufferTarget()}),source=new M.EncodedVideoPacketSource('avc');output.addVideoTrack(source);
  let closing,terminal,terminalState='pending',pendingObserved,terminalError=null,closeError=null;
  try{
    await output.start();await source.add(packet,{decoderConfig:config});enabled=true;
    assert.equal(source.close(),undefined,'public close() API remains void');
    if(mode==='delayed-finalize-read-failure'){
      // Represents other awaited work (e.g. remaining AAC packets) before finalize.
      await tick();await tick();terminal=output.finalize();
    }else{
      await entered;terminal=mode==='pending-cancel'?output.cancel():output.finalize();
      terminal.then(()=>terminalState='resolved',()=>terminalState='rejected');await tick();pendingObserved=terminalState==='pending';
      if(mode==='pending-cancel')aborter.abort();releaseYield();
    }
    terminal.then(()=>terminalState='resolved',()=>terminalState='rejected');
    try{await terminal;}catch(error){terminalError={name:error.name,message:error.message};}
    try{await source._closingPromise;}catch(error){closeError={name:error.name,message:error.message};}
    await tick();await tick();
    if(values.expect==='fixed'){
      assert.equal(unhandled.length,0);assert(terminalError&&closeError);assert.deepEqual(terminalError,closeError);
      assert.equal(terminalError.name,mode==='pending-cancel'?'AbortError':'Error');
      if(mode!=='delayed-finalize-read-failure')assert(pendingObserved,'terminal must wait for close work');
      else assert.equal(terminalError.message,'INDEX_READ_FAILURE');
      if(mode==='pending-finalize-write-failure')assert.equal(terminalError.message,'INDEX_WRITE_FAILURE');
    }else assert(unhandled.length>0,'old source must reproduce detached rejection');
    const unlock=await output._muxer.mutex.acquire();unlock();
  }finally{
    try{await output.cancel();}catch{}
    await controller.dispose();await tick();process.removeListener('unhandledRejection',listener);
  }
  assert.equal(backend.open.size,0);assert.equal(locks.held.size,0);
  results.push({mode,unhandled,terminalState,terminalError,closeError,pendingObserved,ownedResourcesAfterCleanup:0});
}
const sha=b=>createHash('sha256').update(b).digest('hex');
await writeFile(join(out,'source-close.json'),JSON.stringify({expect:values.expect,bundle:resolve(values.bundle),bundleSHA256:sha(await readFile(values.bundle)),harnessSHA256:sha(await readFile(new URL(import.meta.url))),results},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({expect:values.expect,cases:results.length,observations:results}));

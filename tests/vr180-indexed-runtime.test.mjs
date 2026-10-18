import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createIndexBudget} from '../docs/shared/vr180/indexed/index-store.mjs';
import {createInputIndex} from '../docs/shared/vr180/indexed/input-index.mjs';
import {createOutputIndex} from '../docs/shared/vr180/indexed/output-index.mjs';
import {createDirectMuxDestination, convertStereo, inspectSavedOutput, OUTPUT_PROFILES, resolveOutputProfile} from '../docs/shared/vr180/indexed/transform.mjs';
import {inspectMp4} from '../docs/shared/vr180/mp4.mjs';
import {sha256Blob} from '../docs/shared/vr180/sha256.mjs';
import {nodeRoot, testLocks} from '../development/vr180/output-index-prototype/node-backend.mjs';

const base=new URL('../docs/shared/vr180/',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fork=()=>import('../docs/shared/vr180/vendor/mediabunny-indexed.mjs');
const fixture=async name=>new Blob([await readFile(new URL(`../docs/vr180-studio/fixtures/${name}.mp4`,import.meta.url))]);
async function backend(t){
  const path=await mkdtemp(join(tmpdir(),'vr180-distributed-index-'));t.after(()=>rm(path,{recursive:true,force:true}));
  return {node:nodeRoot(path),locks:testLocks(),budget:createIndexBudget()};
}
function fileHandle(){
  let bytes=new Uint8Array(),commits=0,aborts=0;
  return {get commits(){return commits;},get aborts(){return aborts;},
    async getFile(){return new Blob([bytes.slice()]);},async createWritable(){return {
      async write({position,data}){assert(position+data.length<1024**2,'Small fixture only');if(bytes.length<position+data.length){const next=new Uint8Array(position+data.length);next.set(bytes);bytes=next;}bytes.set(data,position);},
      async truncate(size){bytes=bytes.slice(0,size);},async close(){commits++;},async abort(){aborts++;bytes=new Uint8Array();},
    };}};
}

test('ported module graph is self-contained, hash-bound, and does not eagerly load either codec vendor',async()=>{
  assert.equal(globalThis[Symbol.for('mediabunny loaded')],undefined);
  const proof=JSON.parse(await readFile(new URL('indexed/provenance.json',base),'utf8'));
  for(const [name,entry] of Object.entries(proof.runtime)){
    const url=new URL(`indexed/${name}`,base),source=await readFile(url,'utf8');
    assert.equal(sha(source),entry.sha256);
    assert(!/development\/|fixedMuxerFixture|inspectFixedMuxerFixture|p5-5gb|p5-10gb/.test(source),name);
    for(const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)){
      const dep=new URL(match[1],url);assert(dep.href.startsWith(base.href),name);
      assert(!dep.href.includes('/vendor/'));await readFile(dep);
    }
  }
  const vendor=JSON.parse(await readFile(new URL('vendor/provenance.json',base),'utf8'));
  assert.equal(vendor.upstreamCommit,'0664a57bf2f40e5c4efa176c75ebf1d60df69eb8');assert.equal(vendor.license,'MPL-2.0');
  for(const [name,entry] of Object.entries(vendor.files)){
    const bytes=await readFile(new URL(`vendor/${name}`,base));assert.equal(bytes.length,entry.bytes,name);assert.equal(sha(bytes),entry.sha256,name);
  }
  assert.equal(globalThis[Symbol.for('mediabunny loaded')],undefined);
});

test('runtime admits only default output profile and enforces 1 GiB before destination writes',async()=>{
  assert.deepEqual(Object.keys(OUTPUT_PROFILES),['default']);assert.equal(resolveOutputProfile().maxBytes,1024**3);
  for(const profile of ['p5-5gb','p5-10gb','toString',5200000000,{}]){
    assert.throws(()=>resolveOutputProfile(profile),/OUTPUT_PROFILE_UNSUPPORTED/);
    await assert.rejects(convertStereo(new Blob(),{}, {outputProfileId:profile}),/OUTPUT_PROFILE_UNSUPPORTED/);
  }
  const writes=[],handle={getFile:async()=>new Blob(),createWritable:async()=>({write:async p=>writes.push(p.position),abort:async()=>{}})};
  const destination=await createDirectMuxDestination(handle),writer=destination.stream.getWriter();
  await writer.write({type:'write',position:1024**3-1,data:new Uint8Array(1)});
  await assert.rejects(writer.write({type:'write',position:1024**3,data:new Uint8Array(1)}),/1 GiB/);
  assert.deepEqual(writes,[1024**3-1]);await destination.output.abort();
});

test('distributed fork and input index preserve all fixture video/AAC packet bytes and timing',async t=>{
  const module=await fork();
  for(const name of ['stereo180-sbs','stereo180-tb','stereo360-tb']){
    const h=await backend(t),blob=await fixture(name),inputs=[],controller=await createInputIndex({source:blob,root:h.node.root,
      jobId:name,lockManager:h.locks,budget:h.budget,yieldTask:()=>Promise.resolve()});
    try{
      for(let i=0;i<2;i++)inputs.push(new module.Input({source:new module.BlobSource(blob,{useStreamReader:false}),formats:[module.MP4]}));
      inputs[1]._vr180InputIndex=controller;
      const tracks=await Promise.all(inputs.map(input=>input.getTracks()));assert.equal(tracks[0].length,2);assert.equal(tracks[1].length,2);
      for(let i=0;i<tracks[0].length;i++){
        assert.equal(tracks[0][i].type,tracks[1][i].type);
        const sinks=tracks.map(list=>new module.EncodedPacketSink(list[i]));let count=0;
        let packets=await Promise.all(sinks.map(s=>s.getFirstPacket()));
        while(packets[0]||packets[1]){
          assert(packets[0]&&packets[1]);
          for(const key of ['timestamp','duration','type','sequenceNumber','byteLength'])assert.equal(packets[0][key],packets[1][key]);
          assert.deepEqual(packets[0].data,packets[1].data);count++;
          packets=await Promise.all(sinks.map((s,j)=>s.getNextPacket(packets[j])));
        }
        assert(count>0);if(tracks[0][i].type==='video')assert.equal(count,60);
      }
      assert.equal(controller.metrics.validationProfile,'unchanged-public-parser');assert(controller.metrics.budgetPeakBytes<=8*1024**2);
    }finally{for(const input of inputs)input.dispose();await controller.dispose();}
    assert.equal(h.budget.usedBytes,0);assert.equal(h.node.open.size,0);assert.equal(h.locks.held.size,0);
  }
});

test('distributed output index finalizes once with verified VR metadata; its cslg is still refused as input',async t=>{
  const module=await fork(),h=await backend(t),blob=await fixture('stereo180-sbs');
  const input=new module.Input({source:new module.BlobSource(blob),formats:[module.MP4]}),handle=fileHandle();
  let controller,output,generated;
  try{
    const track=(await input.getTracks()).find(t=>t.type==='video'),sink=new module.EncodedPacketSink(track);
    const first=await sink.getFirstPacket(),second=await sink.getNextPacket(first),config=await track.getDecoderConfig();
    controller=await createOutputIndex({root:h.node.root,jobId:'output-port',lockManager:h.locks,budget:h.budget,layout:'sbs',yieldTask:()=>Promise.resolve()});
    const destination=await createDirectMuxDestination(handle),format=new module.Mp4OutputFormat({fastStart:false});format._options.vr180Index=controller;
    output=new module.Output({format,target:new module.StreamTarget(destination.stream,{chunked:true,chunkSize:1024**2})});
    const source=new module.EncodedVideoPacketSource('avc');output.addVideoTrack(source);await output.start();
    for(let i=0;i<4;i++)await source.add(new module.EncodedPacket(i%2?second.data:first.data,i%2?'delta':'key',(i%2?i-1:i+1)/30,1/30),i===0?{decoderConfig:config}:undefined);
    await source.close();await output.finalize();const direct=destination.finish();
    const expected=await sha256Blob(controller.metadataSource.slice(controller.metrics.moovPosition,direct.extent));
    const saved=await direct.output.commit({expectedBytes:direct.extent});generated=saved.file;
    assert.equal(handle.commits,1);assert.equal(saved.committed,true);assert.equal(saved.hashMatched,false);
    assert.equal(await sha256Blob(saved.file.slice(controller.metrics.moovPosition)),expected);
    const info=await inspectSavedOutput(saved.file);assert.equal(info.stereoMode,2);assert.equal(info.projection,'equi');assert.equal(info.sampleCounts.video,4);
    await assert.rejects(inspectMp4(generated),/unsupported cslg/);
  }finally{input.dispose();if(output&&!['finalized','canceled'].includes(output.state))await output.cancel();await controller?.dispose();}
  assert.equal(h.budget.usedBytes,0);assert.equal(h.node.open.size,0);assert.equal(handle.aborts,0);
  const strict=await createInputIndex({source:generated,root:h.node.root,jobId:'strict-port',lockManager:h.locks,
    budget:h.budget,fixedMuxerFixture:true,yieldTask:()=>Promise.resolve()});
  const strictInput=new module.Input({source:new module.BlobSource(generated),formats:[module.MP4]});strictInput._vr180InputIndex=strict;
  try{await assert.rejects(strictInput.getTracks(),/unsupported cslg/);}finally{strictInput.dispose();await strict.dispose();}
  const keys=['OffscreenCanvas','VideoEncoder','VideoDecoder'],original=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
  let acquisitions=0;
  try{
    for(const key of keys)globalThis[key]=class {};
    await assert.rejects(convertStereo(generated,{mode:'convert',confirmed:true,layout:'sbs',fov:180,eyeSize:256,bitrate:2000000},
      {fork:module,indexRoot:{getDirectoryHandle(){acquisitions++;}},outputHandle:{getFile(){acquisitions++;},createWritable(){acquisitions++;}},jobId:'strict-transform'}),/unsupported cslg/);
    assert.equal(acquisitions,0);
  }finally{keys.forEach((key,i)=>original[i]?Object.defineProperty(globalThis,key,original[i]):delete globalThis[key]);}
  assert.equal(h.budget.usedBytes,0);assert.equal(h.node.open.size,0);assert.equal(h.locks.held.size,0);
});

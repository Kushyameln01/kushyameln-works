#!/usr/bin/env node
// Private residual gates. Virtual offsets are numerical checks, not large-file I/O.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,open,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {createOutputIndex} from '../../development/vr180/output-index-prototype/output-index.mjs';
import {nodeRoot,testLocks} from '../../development/vr180/output-index-prototype/node-backend.mjs';
import {seed,comparePackets,runtimeProvenance} from './compare-output-index.mjs';
const exec=promisify(execFile),script=fileURLToPath(import.meta.url),original=fileURLToPath(new URL('../../docs/shared/media-basic/vendor/mediabunny.mjs',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex'),tick=()=>new Promise(r=>setImmediate(r));
const {values}=parseArgs({options:{bundle:{type:'string'},'out-dir':{type:'string'},child:{type:'string'},candidate:{type:'boolean'},seed:{type:'string'},file:{type:'string'},report:{type:'string'},'index-root':{type:'string'},offset:{type:'string'}}});
async function hashFile(name){const fd=await open(name,'r'),b=new Uint8Array(1024*1024),h=createHash('sha256');let at=0;try{for(;;){const{bytesRead}=await fd.read(b,0,b.length,at);if(!bytesRead)break;h.update(b.subarray(0,bytesRead));at+=bytesRead;}}finally{await fd.close();}return{bytes:at,sha256:h.digest('hex')};}
if(values.child){
  const provenanceAtStart=await runtimeProvenance(),harnessAtStart=hash(await readFile(script));
  const M=await import(pathToFileURL(resolve(values.bundle))),raw=JSON.parse(await readFile(values.seed,'utf8'));
  const input={key:Uint8Array.from(raw.key),delta:Uint8Array.from(raw.delta),config:{...raw.config,description:Uint8Array.from(raw.config.description)}};
  const backend=values.candidate?nodeRoot(values['index-root']):null,locks=testLocks();
  const controller=backend?await createOutputIndex({root:backend.root,jobId:'edge',lockManager:locks,yieldTask:tick}):null;
  const virtual=values.child==='virtual-offset',writes=[],fd=virtual?null:await open(values.file,'wx');let extent=0,writtenBytes=0,maxWrite=0;
  // Test-only sparse sink: fixed tiny packet count; never used as a browser target.
  class SparseTarget extends M.Target {
    _start(){} _write(data,position){assert(Number.isSafeInteger(position)&&position>=0);assert(data.length<=65536);assert(writes.length<256);writes.push({position,data:data.slice()});extent=Math.max(extent,position+data.length);writtenBytes+=data.length;maxWrite=Math.max(maxWrite,data.length);}
    async _flush(){} async _finalize(){} async _close(){}
  }
  const target=virtual?new SparseTarget():new M.StreamTarget(new WritableStream({async write({data,position}){
    for(let done=0;done<data.length;){const{bytesWritten}=await fd.write(data,done,data.length-done,position+done);assert(bytesWritten>0);done+=bytesWritten;}
    extent=Math.max(extent,position+data.length);writtenBytes+=data.length;maxWrite=Math.max(maxWrite,data.length);
  }},{highWaterMark:1}),{chunked:true,chunkSize:1024*1024});
  const format=new M.Mp4OutputFormat({fastStart:false});if(controller)format._options.vr180Index=controller;
  const output=new M.Output({format,target});output._muxer.creationTime=3860000000;
  const source=new M.EncodedVideoPacketSource('avc');output.addVideoTrack(source);
  const count=virtual?1:100000;let timestamp=0,snapshot;
  const started=performance.now();
  try {
    await output.start();if(virtual)output._muxer.writer.seek(Number(values.offset));
    for(let i=0;i<count;i++){
      const long=values.child==='long-gop',delta=long&&i>0;
      const pts=long?(i%2?i-1:i+1)/30:timestamp,duration=values.child==='many-stts'?(i%2?1/60:1/30):1/30;
      await source.add(new M.EncodedPacket(delta?input.delta:input.key,delta?'delta':'key',pts,duration),i===0?{decoderConfig:input.config}:undefined);
      timestamp+=duration;
    }
    await source.close();await output.finalize();snapshot=controller?.metrics;
    if(controller){assert.equal(snapshot.verification.sampleCounts.video,count);assert(snapshot.budgetPeakBytes<=8*1024**2);
      if(values.child==='long-gop'){assert.equal(snapshot.peakTimestampSamples,count);assert.equal(snapshot.tracks[0].tables.ctts.count,count);}
      if(values.child==='many-stts')assert.equal(snapshot.tracks[0].tables.stts.count,count);
    }
    if(fd)await fd.truncate(extent);
  } finally {try{if(!['finalized','canceled'].includes(output.state))await output.cancel();}finally{try{await fd?.close();}finally{await controller?.dispose();}}}
  assert.equal(locks.held.size,0);if(backend)assert.equal(backend.open.size,0);
  const provenanceAtEnd=await runtimeProvenance();assert.deepEqual(provenanceAtEnd,provenanceAtStart);assert.equal(hash(await readFile(script)),harnessAtStart);
  const report={case:values.child,count,extent,writtenBytes,maxWrite,elapsedMs:performance.now()-started,snapshot,provenanceAtStart,provenanceAtEnd,harnessAtStart,
    virtual,sparseWrites:virtual?writes.map(w=>({position:w.position,hex:Buffer.from(w.data).toString('hex')})):undefined,decoded:false,wholeLargeFileIO:false};
  await writeFile(values.report,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}else{
  assert(values.bundle&&values['out-dir']);const out=resolve(values['out-dir']);await mkdir(out);const input=await seed(),seedFile=join(out,'seed.json');
  await writeFile(seedFile,JSON.stringify({...input,key:[...input.key],delta:[...input.delta],config:{...input.config,description:[...input.config.description]}}));
  const results=[];
  async function run(name,candidate,offset){const stem=name+(offset===undefined?'':'-'+offset)+'-'+(candidate?'candidate':'original'),report=join(out,stem+'.json'),file=join(out,stem+'.mp4');
    await exec(process.execPath,[script,'--child',name,'--bundle',candidate?resolve(values.bundle):original,'--seed',seedFile,'--file',file,'--report',report,'--index-root',join(out,stem+'-index'),...(candidate?['--candidate']:[]),...(offset===undefined?[]:['--offset',String(offset)])],{timeout:600000,maxBuffer:1024*1024});
    return {file,report,data:JSON.parse(await readFile(report,'utf8'))};}
  for(const name of ['long-gop','many-stts']){
    const a=await run(name,false),b=await run(name,true);const ah=await hashFile(a.file),bh=await hashFile(b.file);assert.deepEqual(ah,bh);
    const packets=await comparePackets(a.file,b.file,100000);results.push({case:name,pass:true,completeFiles:ah,packets,original:a.report,candidate:b.report});console.log(name+': full byte + 100k packets PASS');
  }
  function sparse(report){const writes=report.sparseWrites.map(w=>({start:w.position,bytes:Buffer.from(w.hex,'hex')}));return{writes,read(at,n){assert(n<=65536);const bytes=Buffer.alloc(n),covered=new Uint8Array(n);for(const w of writes){const start=Math.max(at,w.start),end=Math.min(at+n,w.start+w.bytes.length);if(end>start){bytes.set(w.bytes.subarray(start-w.start,end-w.start),start-at);covered.fill(1,start-at,end-at);}}assert(covered.every(x=>x),'Unwritten sparse gap requested');return bytes;}};}
  for(const offset of [2**32-1,2**32,2**32+1]){
    const a=await run('virtual-offset',false,offset),b=await run('virtual-offset',true,offset);assert.equal(a.data.extent,b.data.extent);
    const x=sparse(a.data),y=sparse(b.data),ranges=[...x.writes,...y.writes].map(w=>[w.start,w.start+w.bytes.length]).sort((a,b)=>a[0]-b[0]),merged=[];
    for(const r of ranges){const last=merged.at(-1);if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else merged.push([...r]);}
    let checkedBytes=0;for(const[start,end]of merged)for(let at=start;at<end;at+=65536){const n=Math.min(65536,end-at);assert.deepEqual(x.read(at,n),y.read(at,n));checkedBytes+=n;}
    const moov=b.data.snapshot.moovPosition,bytes=y.read(moov,b.data.snapshot.moovBytes),type=offset>=2**32?'co64':'stco',index=bytes.indexOf(Buffer.from(type));assert(index>4);
    assert.equal(bytes.readUInt32BE(index+8),1);const observed=type==='co64'?Number(bytes.readBigUInt64BE(index+12)):bytes.readUInt32BE(index+12);assert.equal(observed,offset);
    results.push({case:'virtual-offset',offset,pass:true,table:type,observedOffset:observed,checkedWrittenBytes:checkedBytes,logicalExtent:a.data.extent,original:a.report,candidate:b.report,
      qualification:'Sparse in-memory metadata/payload position simulation. No 4 GiB payload allocation, actual 4 GiB write, saved file, or media decode.'});console.log(`virtual offset ${offset}: ${type} exact bytes PASS`);
  }
  await writeFile(join(out,'edges.json'),JSON.stringify({schema:1,results,forkSHA256:hash(await readFile(values.bundle)),harnessSHA256:hash(await readFile(script)),runtimeProvenance:await runtimeProvenance()},null,2)+'\n',{flag:'wx'});
}

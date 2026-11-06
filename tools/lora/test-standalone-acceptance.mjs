import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createCohortScheduler,createOracleClient,createBoundedComparisonQueue} from './standalone-acceptance.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('cohort advances the minimum original coordinate after every active case waits',async()=>{
 const s=createCohortScheduler(['a','b'],new Map([['early',0],['middle',1],['late',2]])),events=[];
 const a=s.before('a',{key:'early',offset:0}).then(()=>events.push('a-early'));
 await tick();assert.deepEqual(events,[]);
 const b=s.before('b',{key:'middle',offset:0}).then(()=>events.push('b-middle'));
 await a;assert.deepEqual(events,['a-early']);s.finished('a');await tick();assert.deepEqual(events,['a-early']);
 const later=s.before('a',{key:'late',offset:0}).then(()=>events.push('a-late'));
 await b;assert.deepEqual(events,['a-early','b-middle']);s.finished('b');s.done('b');
 await later;assert.deepEqual(events,['a-early','b-middle','a-late']);s.finished('a');s.done('a');
 assert.equal(s.stats().activeCases,0);assert.equal(s.stats().groups,3);
});
test('cohort rejects duplicate requests and aborts all blocked cases',async()=>{
 const s=createCohortScheduler(['a','b'],new Map([['target',0]]));
 const blocked=s.before('a',{key:'target',offset:0});
 await assert.rejects(s.before('a',{key:'target',offset:0}),/already waiting/);
 s.abort(Error('intentional failure'));await assert.rejects(blocked,/intentional failure/);
 await assert.rejects(s.before('b',{key:'target',offset:0}),/intentional failure/);
});
test('comparison reservations bound bytes before production and drain every accepted frame',async()=>{
 const q=createBoundedComparisonQueue({maxFrames:2,maxBytes:8});let finishFirst,finishSecond,thirdEntered=false,drained=false;
 const first=await q.acquire(4),second=await q.acquire(4);
 q.enqueue(first,()=>new Promise(resolve=>{finishFirst=resolve;}));q.enqueue(second,()=>new Promise(resolve=>{finishSecond=resolve;}));
 const third=q.acquire(4).then(token=>{thirdEntered=true;return token;});await tick();assert.equal(thirdEntered,false);
 assert.equal(q.stats().retainedBytes,8);assert.equal(q.stats().retainedFrames,2);
 finishFirst();const thirdToken=await third;q.release(thirdToken);assert.equal(thirdEntered,true);
 const drain=q.drain().then(()=>{drained=true;});await tick();assert.equal(drained,false);finishSecond();await drain;
 assert.equal(q.stats().peakRetainedBytes,8);assert.equal(q.stats().peakRetainedFrames,2);assert.equal(q.stats().retainedBytes,0);assert.equal(q.stats().comparisonPromises,0);
});
test('comparison failure rejects blocked producers, triggers cancellation, and cannot be lost during drain',async()=>{
 let cancelled=0,fail;const q=createBoundedComparisonQueue({maxFrames:1,maxBytes:4,onError:()=>{cancelled++;}}),token=await q.acquire(4);
 q.enqueue(token,()=>new Promise((resolve,reject)=>{fail=reject;}));const blocked=q.acquire(4);await tick();fail(Error('oracle mismatch'));
 await assert.rejects(blocked,/oracle mismatch/);await assert.rejects(q.drain(),/oracle mismatch/);
 assert.equal(cancelled,1);assert.equal(q.stats().retainedFrames,0);assert.equal(q.stats().retainedBytes,0);assert.equal(q.stats().comparisonPromises,0);assert.equal(q.stats().waitingProducers,0);
 await assert.rejects(q.acquire(4),/oracle mismatch/);
});
test('early oracle rejection during a large payload is catchable and transport cleanup terminates',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lora-early-oracle-'));
 try{const fake=path.join(dir,'reject.py');await writeFile(fake,"import sys,struct,json\nn=struct.unpack('<I',sys.stdin.buffer.read(4))[0]\nsys.stdin.buffer.read(n)\nprint(json.dumps({'ok':False,'error':'deliberate early rejection'}),flush=True)\n");
  const code=`import {createOracleClient} from ${JSON.stringify(new URL('./standalone-acceptance.mjs',import.meta.url).href)}; const client=createOracleClient({oraclePath:process.argv[1]});let caught=false;try{await client.request({op:'compare',count:1048576},new Float32Array(1048576));}catch(error){if(!error.message.includes('deliberate early rejection')&&!error.message.includes('closed')&&!error.message.includes('EPIPE'))throw error;caught=true;}finally{await client.stop();}if(!caught)throw Error('Missing transport failure');`;
  await promisify(execFile)(process.execPath,['--input-type=module','-e',code,fake],{timeout:5000});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('an unavailable Python executable rejects requests and completes stop',async()=>{
 const client=createOracleClient({python:'/not/a/real/lora-python'});
 try{await assert.rejects(client.request({op:'init'}),/ENOENT|EPIPE|closed|exited/);}finally{await client.stop();}
});
test('oracle serializes binary frames and returns a full-value independent verdict',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lora-oracle-frames-'));let oracle;
 try{const original=path.join(dir,'fixture.safetensors'),header=Buffer.from(JSON.stringify({'layer.diff_b':{dtype:'F32',shape:[3],data_offsets:[0,12]}})),prefix=Buffer.alloc(8);prefix.writeBigUInt64LE(BigInt(header.length));
  const values=Buffer.alloc(12);[1,2,3].forEach((n,i)=>values.writeFloatLE(n,i*4));await writeFile(original,Buffer.concat([prefix,header,values]));
  oracle=createOracleClient();await oracle.request({op:'init',sources:[{id:'s',path:original,side:'HIGH'}],cases:[{id:'base',side:'HIGH',sources:[],targetsFrom:['s']}]});
  const q=createBoundedComparisonQueue({maxFrames:2,maxBytes:12});let compared=0;
  for(const [offset,data]of [[0,new Float32Array([-8/128])],[1,new Float32Array([-7/128,-6/128])]]){const token=await q.acquire(data.byteLength);q.enqueue(token,async()=>{const ack=await oracle.request({op:'compare',caseId:'base',targetKey:'layer.bias',offset,count:data.length},data);assert.equal(ack.failedElements,0);compared+=data.length;});}
  await q.drain();assert.equal(compared,3);assert.equal(q.stats().retainedBytes,0);const final=await oracle.finalize();assert.equal(final.passed,true);assert.equal(final.coverage,'FULL');assert.equal(final.cases[0].comparedElements,3);
 }finally{await oracle?.stop();await rm(dir,{recursive:true,force:true});}
});

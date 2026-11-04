import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExecutionProfile,modelChunkOptions,boundedChunkData,cleanupDiagnosticOwners} from './production-chunk-browser.mjs';
import {SAMPLER_TRACE_SEQUENCE,samplerTraceName,samplerTraceChunks} from './production-sample-chunks.mjs';
const config=(overrides={})=>({operation:'blocks',wasmThreads:1,decoder:'lookup',readAheadBytes:1048576,blockLimit:0,stages:['k','v','blockOutput'],...overrides});

test('default one-thread no-COI and explicit four-thread COI never fall back',()=>{
 assert.deepEqual(validateExecutionProfile(config(),false,false),{operation:'blocks',wasmThreads:1,crossOriginIsolated:false,decoder:'lookup',readAheadBytes:1048576});
 assert.equal(validateExecutionProfile(config({wasmThreads:4}),true,true).wasmThreads,4);
 assert.throws(()=>validateExecutionProfile(config({wasmThreads:4}),false,true),/requires/);
 assert.throws(()=>validateExecutionProfile(config({wasmThreads:4}),true,false),/requires/);
 assert.throws(()=>validateExecutionProfile(config(),true,true),/no-COI/);
 for(const overrides of [{wasmThreads:2},{readAheadBytes:-1},{readAheadBytes:1048577},{decoder:'silent-fallback'},{operation:'sample'}])assert.throws(()=>validateExecutionProfile(config(overrides),false,false));
});

test('block0 remains a partial diagnostic while prediction includes all40/head without a stop option',()=>{
 const onChunk=()=>{},partial=modelChunkOptions(config(),onChunk);
 assert.equal(partial.stopAfterBlock,0);assert.equal(partial.onChunk,onChunk);assert.equal(partial.maxRows,128);
 const full=config({operation:'predict',blockLimit:39,stages:['k','v','blockOutput','headAll','prediction']});
 validateExecutionProfile(full,false,false);
 const options=modelChunkOptions(full,onChunk);
 assert.equal(Object.hasOwn(options,'stopAfterBlock'),false);
 assert.deepEqual(options.stages,full.stages);assert.notEqual(options.stages,full.stages);
 assert.throws(()=>validateExecutionProfile(config({operation:'predict'}),false,false),/all40/);
 assert.equal(validateExecutionProfile(config({operation:'sample',blockLimit:39}),false,false).operation,'sample');
 assert.throws(()=>validateExecutionProfile(config({operation:'sample',blockLimit:39,decoder:'legacy'}),false,false),/lookup/);
});

test('transport accepts only owned compact F32 chunks up to8MiB',()=>{
 assert.equal(boundedChunkData(new Float32Array(2097152)).byteLength,8388608);
 for(const value of [new Float32Array(0),new Float32Array(2097153),new Float32Array(2).subarray(1),new Float64Array(1)])assert.throws(()=>boundedChunkData(value),/bounded/);
 if(typeof SharedArrayBuffer==='function')assert.throws(()=>boundedChunkData(new Float32Array(new SharedArrayBuffer(4))),/nonshared/);
});

test('failed owner disposal and observer settle still restore instrumentation and report every cleanup error',async()=>{
 const calls=[];
 const result=await cleanupDiagnosticOwners({owner:{async dispose(){calls.push('dispose');throw Error('dispose injected');}},observer:{async settle(){calls.push('settle');throw Error('settle injected');},snapshot(){calls.push('snapshot');return {};},diagnostics(){return {};},restore(){calls.push('restore');}},onPhase:phase=>calls.push(phase)});
 assert.deepEqual(calls,['dispose','settle','snapshot','after-dispose','restore']);
 assert.equal(result.observerRestored,true);
 assert.deepEqual(result.cleanupError.errors.map(value=>value.phase),['candidate-dispose','observer-settle']);
 const fail=await cleanupDiagnosticOwners({observer:{async settle(){},snapshot(){return {};},diagnostics(){return {};},restore(){throw Error('restore injected');}}});
 assert.equal(fail.observerRestored,false);assert.equal(fail.cleanupError.errors[0].phase,'observer-restore');
});

test('all sixteen six-update identities retain side/step and owned exact three-row tail',()=>{
 assert.equal(SAMPLER_TRACE_SEQUENCE.length,16);
 for(let step=0;step<6;step++){
  const side=step<3?'HIGH':'LOW';
  assert.equal(samplerTraceName({name:'stepX',step,side}),'step'+String(step).padStart(2,'0')+'X');
  assert.equal(samplerTraceName({name:'velocity'+String(step).padStart(2,'0'),step,side}),'velocity'+String(step).padStart(2,'0'));
  assert.throws(()=>samplerTraceName({name:'stepX',step,side:side==='HIGH'?'LOW':'HIGH'}),/identity/);
 }
 const data=Float32Array.from({length:128},(_,i)=>i/16),event={name:'stepX',step:2,side:'HIGH',sigma:.5,shape:[1,16,1,2,4],data};
 const chunks=[...samplerTraceChunks(event,{maxRows:29})];
 assert.deepEqual(chunks.map(({globalRowStart,rowCount})=>[globalRowStart,rowCount]),[[0,29],[29,3]]);
 assert.deepEqual(chunks[1].shape,[3,4]);assert.equal(chunks[1].storageElementOffset,116);
 assert.equal(chunks[1].data.length,12);assert.deepEqual(chunks[1].data,data.slice(116));
 data.fill(999);assert.notEqual(chunks[1].data[0],999);assert.notEqual(chunks[1].data.buffer,chunks[0].data.buffer);
});

test('sampler chunk ownership and8MiB admission reject shared, partial, nonfinite or oversized traces',()=>{
 const shape=[1,16,1,2,4],base={name:'initialX',shape,data:new Float32Array(128)};
 for(const data of [new Float32Array(129).subarray(1),new Float32Array(127),new Float64Array(128)])assert.throws(()=>[...samplerTraceChunks({...base,data})],/sampler trace/);
 if(typeof SharedArrayBuffer==='function')assert.throws(()=>[...samplerTraceChunks({...base,data:new Float32Array(new SharedArrayBuffer(512))})],/nonshared/);
 const bad=new Float32Array(128);bad[0]=NaN;assert.throws(()=>[...samplerTraceChunks({...base,data:bad})],/Finite/);
 assert.throws(()=>[...samplerTraceChunks({...base,shape:[1,16,22,60,104]})],/8MiB/);
 assert.throws(()=>samplerTraceName({name:'velocity06',step:6,side:'LOW'}),/Unknown/);
});

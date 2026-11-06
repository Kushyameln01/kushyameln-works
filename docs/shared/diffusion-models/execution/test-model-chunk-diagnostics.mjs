import test from 'node:test';
import assert from 'node:assert/strict';
import {createModelChunkEmitter,validateModelChunkOptions} from './model-chunk-diagnostics.mjs';
import {createModelExecutionTiming} from './model-execution-timing.mjs';

test('chunks retain exact whole-shape row coordinates including an unpadded tail',async()=>{
 const source=Float32Array.from({length:257*3},(_,i)=>i/8),received=[];
 const emitter=createModelChunkEmitter({options:{maxRows:128,onChunk:async chunk=>{received.push({start:chunk.globalRowStart,count:chunk.rowCount,shape:chunk.shape,fullShape:chunk.fullShape,offset:chunk.storageElementOffset,values:Array.from(chunk.data)});chunk.data.fill(NaN);}},model:{side:'LOW',modelSha256:'known'},timestep:750});
 await emitter.rows('blockOutput',{data:source,fullShape:[1,257,3],rowAxis:1,columns:3,globalRowStart:0,rowCount:257,block:0});
 assert.deepEqual(received.map(x=>[x.start,x.count]),[[0,128],[128,128],[256,1]]);
 assert.deepEqual(received.at(-1).shape,[1,1,3]);assert.deepEqual(received.at(-1).fullShape,[1,257,3]);assert.equal(received.at(-1).offset,768);assert.deepEqual(received.flatMap(x=>x.values),Array.from(source));assert.equal(source.at(-1),770/8);assert.equal(emitter.stats().copiedBytes,source.byteLength);assert.equal(emitter.stats().maxChunkElements,384);
});

test('chunk callback is awaited and its returned replacement is ignored',async()=>{
 const source=new Float32Array([1,2,3,4]),events=[];let release;
 const emitter=createModelChunkEmitter({options:{maxRows:1,onChunk:async chunk=>{events.push(chunk.globalRowStart);if(chunk.globalRowStart===0)await new Promise(resolve=>{release=resolve;});return new Float32Array([1000]);}},model:{side:'HIGH'},timestep:1});
 const pending=emitter.rows('timeProjection',{data:source,fullShape:[1,4,1],rowAxis:1,columns:1,rowCount:4});
 await Promise.resolve();assert.deepEqual(events,[0]);release();await pending;assert.deepEqual(events,[0,1,2,3]);assert.deepEqual(Array.from(source),[1,2,3,4]);
});

test('stage selection avoids copying or delivering unselected tensors',async()=>{
 let called=0;const emitter=createModelChunkEmitter({options:{stages:['q'],onChunk(){called++;}},model:{},timestep:0});
 await emitter.rows('ffnUp',{data:new Float32Array(0),fullShape:[],rowAxis:1,columns:0,rowCount:0});
 assert.equal(called,0);assert.equal(emitter.stats().copiedBytes,0);
});

test('q chunks preserve all heads and own copied position/source IDs',async()=>{
 const positions=new Float32Array([1,2,3,4,5,6]),sourceIds=new Int32Array([7,8]),source=new Float32Array(2*40*128);let received;
 const emitter=createModelChunkEmitter({options:{onChunk:chunk=>{received=chunk;chunk.coordinates.positions.fill(99);chunk.coordinates.sourceIds.fill(99);}},model:{side:'LOW'},timestep:750});
 await emitter.rows('q',{data:source,fullShape:[1,2,40,128],rowAxis:1,columns:5120,rowCount:2,block:3,coordinatesForRows:()=>({positions,sourceIds})});
 assert.deepEqual(received.shape,[1,2,40,128]);assert.equal(received.block,3);assert.deepEqual(Array.from(positions),[1,2,3,4,5,6]);assert.deepEqual(Array.from(sourceIds),[7,8]);
});

test('prediction spans name their exact NCTHW storage offset instead of pretending token rows',async()=>{
 const source=new Float32Array(1*16*21*2*4),chunks=[];
 const emitter=createModelChunkEmitter({options:{maxRows:128,onChunk:chunk=>chunks.push(chunk)},model:{},timestep:0});
 await emitter.rows('prediction',{data:source,fullShape:[1,16,21,2,4],rowAxis:null,columns:4,rowCount:16*21*2,layout:'NCTHW-contiguous-row-span'});
 assert.equal(chunks.at(-1).storageElementOffset,640*4);assert.deepEqual(chunks.at(-1).shape,[32,4]);assert.equal(chunks.at(-1).rowAxis,null);assert.deepEqual(chunks.at(-1).fullShape,[1,16,21,2,4]);
});

test('cancellation between awaited chunks stops delivery without retaining the whole tensor',async()=>{
 const control=new AbortController(),reason=new Error('stop'),received=[];
 const emitter=createModelChunkEmitter({options:{maxRows:1,onChunk:chunk=>{received.push(chunk.globalRowStart);control.abort(reason);}},model:{},timestep:0,check:()=>control.signal.throwIfAborted()});
 await assert.rejects(emitter.rows('blockOutput',{data:new Float32Array(9),fullShape:[1,3,3],rowAxis:1,columns:3,rowCount:3}),error=>error===reason);assert.deepEqual(received,[0]);assert.equal(emitter.stats().chunks,1);
});

test('native abort releases a never-resolving chunk callback and exposes its exact pending row',async()=>{
 const control=new AbortController(),stop=new Error('abort external comparison');let entered;
 const started=new Promise(resolve=>{entered=resolve;});
 const emitter=createModelChunkEmitter({options:{onChunk:()=>{entered();return new Promise(()=>{});}},model:{},timestep:0,signal:control.signal,check:()=>control.signal.throwIfAborted()});
 const pending=emitter.rows('k',{data:new Float32Array(6),fullShape:[1,2,3],rowAxis:1,columns:3,rowCount:2,block:0});
 await started;assert.deepEqual(emitter.stats().activeChunk,{name:'k',block:0,globalRowStart:0,rowCount:2});control.abort(stop);
 await assert.rejects(pending,error=>error===stop);assert.equal(emitter.stats().activeChunk,null);assert.equal(emitter.stats().chunks,1);assert.equal(emitter.stats().completedCallbacks,0);assert.equal(emitter.stats().failedCallbacks,1);assert.equal(emitter.stats().lastCallbackFailure.name,'k');
});

test('diagnostic selector bounds reject before any graph work',()=>{
 for(const options of [{onChunk(){},maxRows:129},{onChunk(){},maxRows:0},{onChunk(){},stopAfterBlock:-1},{onChunk(){},stopAfterBlock:40},{onChunk(){},stages:['unknown']},{onChunk(){},stages:['q','q']},{onChunk(){},stages:Array(1)},{onChunk(){},gate:1}])assert.throws(()=>validateModelChunkOptions(options));
 assert.throws(()=>validateModelChunkOptions({}),/onChunk/);
 const input={onChunk(){},maxRows:128,stopAfterBlock:0,stages:['q','blockOutput']},captured=validateModelChunkOptions(input);input.stages[0]='v';assert.deepEqual(captured.stages,['q','blockOutput']);assert.equal(captured.stopAfterBlock,0);
});

test('metadata is captured before awaiting and wide storage rows respect the element cap',async()=>{
 const shape=[1,100,20000],counts=[],source=new Float32Array(2000000);
 const emitter=createModelChunkEmitter({options:{onChunk:chunk=>{counts.push(chunk.rowCount);shape[1]=999;chunk.fullShape[1]=1;}},model:{},timestep:0});
 await emitter.rows('ffnUp',{data:source,fullShape:shape,rowAxis:1,columns:20000,rowCount:100});
 assert.deepEqual(counts,[88,12]);assert.ok(emitter.stats().maxChunkElements<=128*13824);
 await assert.rejects(emitter.rows('q',{data:new Float32Array(6),fullShape:[1,,6],rowAxis:0,columns:6,rowCount:1}),/Dense/);
 await assert.rejects(emitter.rows('q',{data:new Float32Array(6),fullShape:[1,2,3],rowAxis:'1',columns:3,rowCount:2}),/axis/);
});

test('timings expose nested inclusive time and the first actual failed operator',async()=>{
 let clock=0;const timer=createModelExecutionTiming({clock:()=>clock}),failure=new Error('native failure');
 await assert.rejects(timer.async('stage.selfAttention',{block:0},async()=>{clock=2;await timer.async('attention',{queryRowStart:128,keyRowStart:256},async()=>{clock=7;throw failure;});}),error=>error===failure);
 const snapshot=timer.snapshot();assert.equal(snapshot.inclusive,true);assert.equal(snapshot.sumIsNotExclusiveTotal,true);assert.equal(snapshot.totals.attention.elapsedMs,5);assert.equal(snapshot.totals['stage.selfAttention'].elapsedMs,7);assert.equal(snapshot.firstFailure.kind,'attention');assert.equal(snapshot.firstFailure.keyRowStart,256);assert.equal(snapshot.activeOperator,null);
});

test('timings count native cancellation reasons even when the thrown reason is falsy',async()=>{
 for(const reason of [undefined,null,false,0]){
  const timing=createModelExecutionTiming();let caught=false;
  try{await timing.async('attention',{operator:'native-run'},async()=>{throw reason;});}catch(error){caught=true;assert.equal(error,reason);}
  assert.equal(caught,true);assert.equal(timing.snapshot().totals.attention.failures,1);assert.equal(timing.snapshot().firstFailure.operator,'native-run');
 }
});

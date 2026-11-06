// Lossless observer transport only; no native model, Worker or arithmetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {
 createObservationArchive,appendObservation,restoreObservation,restoreObservations,
 compactWorkerObservations,restoreWorkerObservations
} from './observation-archive.mjs';

const session=index=>({index,inputNames:['hidden','mask'],outputNames:['hidden_out'],inputMetadata:[{name:'hidden',type:'float32',shape:[1,512,4096]},{name:'mask',type:'float32',shape:[1,512]}],outputMetadata:[{name:'hidden_out',type:'float32',shape:[1,512,4096]}]});

test('thousands of cumulative progress snapshots keep one metadata pool and restore all original fields/order',()=>{
 const sessions=Array.from({length:24},(_,i)=>session(i+1)),original=[];
 for(let i=0;i<3000;i++)original.push({type:i===2999?'success':'progress',event:i===2999?'native-success':'native-progress',counts:{created:Math.min(24,Math.floor(i/100)+1),released:Math.min(24,Math.floor(i/100)),active:1,runCalls:i},boundary:{stage:'text-norm-execution-graph-hash',offset:i*8388608},sessions:structuredClone(sessions.slice(0,Math.min(24,Math.floor(i/100)+1)))});
 const worker={phase:'synthetic',index:0,terminated:true,observations:original},packed=compactWorkerObservations(worker);
 assert.equal(packed.observations.sessionMetadata.length,24);
 assert.ok(packed.observations.sessionReferences.every(n=>Number.isSafeInteger(n)));
 const wire=JSON.parse(JSON.stringify(packed));
 assert.deepEqual(restoreWorkerObservations(wire),worker);
 assert.ok(JSON.stringify(wire).length<JSON.stringify(worker).length/5);
 assert.deepEqual(worker.observations,original,'Original observations remain unchanged');
});

test('absent/empty/shorter/reordered/changed session snapshots remain distinct and lossless',()=>{
 const a=session(1),b=session(2),changed={...session(1),inputNames:['different']};
 const observations=[{event:'absent',counts:{created:0}},{event:'empty',sessions:[]},{event:'two',sessions:[a,b]},{event:'shorter',sessions:[a]},{event:'reordered',sessions:[b,a]},{event:'changed',sessions:[changed,b]},{event:'null',sessions:null}];
 const archive=createObservationArchive();for(const observation of observations)appendObservation(archive,observation);
 const read=JSON.parse(JSON.stringify(archive));assert.deepEqual(restoreObservations(read),observations);
 assert.equal(archive.sessionMetadata.length,3);assert.equal(archive.sessionReferences[0],null);assert.equal(archive.sessionReferences[1],0);
 assert.deepEqual(archive.sessionReferences[4],[1,0]);
 assert.throws(()=>restoreObservation({...read,sessionReferences:[99,...read.sessionReferences.slice(1)]},0),/prefix/);
 assert.throws(()=>restoreObservation({...read,sessionReferences:[[-1],...read.sessionReferences.slice(1)]},0),/reference/);
});

test('capture owns original counts/boundaries/metadata and preserves a matching archive on roundtrip',()=>{
 const observation={type:'progress',event:'native-progress',counts:{created:1},boundary:{offset:8},sessions:[session(1)]},expected=structuredClone(observation);
 const archive=createObservationArchive();appendObservation(archive,observation);
 observation.counts.created=99;observation.boundary.offset=0;observation.sessions[0].inputNames.push('changed');
 assert.deepEqual(restoreObservation(archive,0),expected);
 const worker={phase:'control',observations:archive};assert.equal(compactWorkerObservations(worker),worker);
});

test('actual browser observer wiring uses the archive and preserves complete Worker messages (mock Worker, NN0)',async()=>{
 const source=(await readFile(new URL('./browser.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 const messages=[{type:'progress',ownerObservation:{event:'native-progress',counts:{created:1,released:0},sessions:[session(1)]}},{type:'progress',ownerObservation:{event:'native-progress',counts:{created:2,released:1},sessions:[session(1),session(2)]}},{type:'success',ownerObservation:{event:'native-success',counts:{created:2,released:2},sessions:[session(1),session(2)]}}];
 let disposed=false;
 class WorkerControl{addEventListener(name,listener){if(name==='message')this.listener=listener;}terminate(){}emit(message){this.listener({data:message});}}
 const api={get state(){return {status:disposed?'disposed':'idle'};},dispose(){disposed=true;}};
 const sandbox={structuredClone,Uint8Array,ArrayBuffer,Map,performance,console:{log(){}},Worker:WorkerControl,createObservationArchive,appendObservation,
  native:{createInferenceAPI({workerFactory}){const worker=workerFactory();for(const message of messages)worker.emit(message);worker.terminate();return api;}},createCurrentNativeCodec:()=>({}),
  createManagedInferenceBridge:({nativeAPI})=>({async dispose(){nativeAPI.dispose();return {disposed:true};},inspect:()=>({})}),createTextVaeAdapter(){},createInvocationQueue(){},artifacts:{},workspace:{},diffusion:{}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 const result=await sandbox.runManagementConnection({scope:'observer-wiring-control',executionSourceSha:'a'.repeat(40)});
 assert.equal(result.passed,true);assert.equal(result.workerSummary.created,1);assert.equal(result.workerSummary.terminated,1);
 assert.equal(result.workers[0].observations.sessionMetadata.length,2);
 assert.deepEqual(restoreObservations(JSON.parse(JSON.stringify(result.workers[0].observations))),messages.map(({type,ownerObservation})=>({type,...ownerObservation})));
});

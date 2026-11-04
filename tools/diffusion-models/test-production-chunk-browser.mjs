import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExecutionProfile,modelChunkOptions} from './production-chunk-browser.mjs';
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
});

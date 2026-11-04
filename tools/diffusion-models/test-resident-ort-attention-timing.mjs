import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('./resident-ort-attention-timing-core.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const required=name=>{assert.equal(typeof api[name],'function',name+' diagnostic implementation required');return api[name];};

test('profile admission refuses implicit threads, nonisolated4, isolated1 and unbounded tile counts',()=>{
 const admit=required('admitProfile');
 const plain={threads:1,crossOriginIsolated:false,sharedArrayBufferAvailable:false,workerAvailable:true,tiles:3};
 assert.equal(admit(plain).expectedPthreads,0);
 assert.equal(admit({...plain,threads:4,crossOriginIsolated:true,sharedArrayBufferAvailable:true}).expectedPthreads,3);
 for(const values of [{threads:undefined},{threads:2},{threads:4},{crossOriginIsolated:true},{tiles:0},{tiles:5}])assert.throws(()=>admit({...plain,...values}));
});

test('fixture fixes full shapes, finite initial state and ordered deterministic key tiles',()=>{
 const fixture=required('createFixture');const a=fixture(0),b=fixture(0),next=fixture(256);
 assert.equal(a.q.length,655360);assert.equal(a.k.length,1310720);assert.equal(a.v.length,1310720);
 assert.equal(a.previousMax.length,5120);assert.equal(a.previousContext.length,655360);
 assert.equal(a.previousMax[0],-3.4028234663852886e38);assert.equal(a.previousDenominator[0],0);
 assert.deepEqual(a.k,b.k);assert.notDeepEqual(a.k,next.k);assert.deepEqual(a.q,next.q);
 for(const value of Object.values(a))assert.ok(value.every(Number.isFinite));
 assert.throws(()=>fixture(1),/aligned/);
});

test('trace preparation/native/output intervals remain separate and original console methods restore',()=>{
 const create=required('createTimingRecorder');let t=0;const calls=[];
 const consoleObject={time(label){calls.push(['begin',label]);},timeEnd(label){calls.push(['end',label]);}};
 const old={...consoleObject},r=create({clock:()=>t,consoleObject});r.install();r.beginFrame({kind:'measured',keyStart:0});
 t=1;consoleObject.time('ORT::wasm prepareInputOutputTensor');t=5;consoleObject.timeEnd('ORT::wasm prepareInputOutputTensor');
 t=6;const target={x:9};assert.equal(r.native(function(x){assert.equal(this,target);t=16;return x;},target,[7]),7);
 t=17;consoleObject.time('ORT::wasm ProcessOutputTensor');t=20;consoleObject.timeEnd('ORT::wasm ProcessOutputTensor');t=22;
 const frame=r.endFrame({requireNative:true});assert.equal(frame.inputTensorPreparationWallMs,4);assert.equal(frame.ortRunCallWallMs,10);assert.equal(frame.outputTensorProcessingWallMs,3);assert.equal(frame.publicSessionRunWallMs,22);
 assert.equal(frame.nativeCalls,1);assert.equal(calls.length,4);assert.deepEqual(r.restore().conflicts,[]);assert.equal(consoleObject.time,old.time);assert.equal(consoleObject.timeEnd,old.timeEnd);
});

test('native errors preserve identity, unfinished traces fail the frame and restoration avoids clobbering another hook',()=>{
 const create=required('createTimingRecorder');let t=0;const c={time(){},timeEnd(){}};const r=create({clock:()=>t++,consoleObject:c});r.install();r.beginFrame({});
 const error=Error('native failure');assert.throws(()=>r.native(()=>{throw error;},null,[]),e=>e===error);
 c.time('ORT::wasm prepareInputOutputTensor');assert.throws(()=>r.endFrame({requireNative:true}),/trace/);
 const replacement=()=>{};c.time=replacement;assert.deepEqual(r.restore().conflicts,['time']);assert.equal(c.time,replacement);
});

test('baseline leaves native duration unobserved rather than reporting zero time',()=>{
 const create=required('createTimingRecorder');let t=0;const c={time(){},timeEnd(){}};const r=create({clock:()=>t++,consoleObject:c});r.install();r.beginFrame({});
 for(const label of ['ORT::wasm prepareInputOutputTensor','ORT::wasm ProcessOutputTensor']){c.time(label);c.timeEnd(label);}
 assert.equal(r.endFrame().ortRunCallWallMs,null);r.restore();
});

test('captured factory runs once, returns same module and native wrapper preserves synchronous result and errors',async()=>{
 const capture=required('createCapturedFactory'),makeRecorder=required('createTimingRecorder');let t=0,calls=0;const config={numThreads:1};const module={PTR_SIZE:4,HEAPU8:new Uint8Array(32),_OrtInit(){return 0;},_OrtCreateSession(){return 17;},_OrtReleaseSession(){return 0;},_OrtRun(x){if(x<0)throw failure;t+=3;return 0;}};
 const failure=Error('run failed'),originalRun=module._OrtRun;const recorder=makeRecorder({clock:()=>t,consoleObject:{time(){},timeEnd(){}}});
 const holder=capture(async got=>{calls++;assert.equal(got,config);return module;},{recorder});
 assert.equal(await holder.factory(config),module);assert.equal(calls,1);await assert.rejects(()=>holder.factory(config),/once/);assert.equal(calls,1);
 assert.equal(module._OrtInit(1,2),0);
 assert.equal(module._OrtCreateSession(),17);assert.equal(module._OrtReleaseSession(17),0);
 recorder.beginFrame({});assert.equal(module._OrtRun(1),0);assert.throws(()=>module._OrtRun(-1),e=>e===failure);recorder.abortFrame();
 const stats=holder.stats();assert.equal(stats.factoryCalls,1);assert.deepEqual(stats.initThreadArguments,[1]);assert.equal(stats.sessionCreations,1);assert.equal(stats.sessionReleases,1);assert.equal(stats.ortRunCalls,2);assert.equal(stats.heapBytes,32);
 assert.deepEqual(holder.restore().conflicts,[]);assert.equal(module._OrtRun,originalRun);
});

test('byte comparison detects signed zero and length mismatches instead of numeric equality',()=>{
 const compare=required('compareBytes');assert.deepEqual(compare(new Uint8Array([1,2]),new Uint8Array([1,2])),{equal:true,bytesCompared:2,firstMismatchByte:null,expectedBytes:2,actualBytes:2});
 assert.equal(compare(new Float32Array([0]),new Float32Array([-0])).equal,false);
 assert.equal(compare(new Uint8Array([1]),new Uint8Array([1,2])).firstMismatchByte,1);
});

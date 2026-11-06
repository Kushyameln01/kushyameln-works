import factory from '../../../../docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs';
const m=await factory({numThreads:1}),init=m._OrtInit(1,2),sp=m.stackSave();
const b=m._malloc(8)>>>0,d=m.stackAlloc(4)>>>0,o=m.stackAlloc(16)>>>0;
m.setValue(d,2,'i32');new Float32Array(m.HEAPU8.buffer,b,2).set([1.25,-2.5]);
const h=m._OrtCreateTensor(1,b,8,d,1,1)>>>0;if(!h)throw Error('CreateTensor failed');
const status=m._OrtGetTensorData(h,o,o+4,o+8,o+12);if(status)throw Error('GetTensorData failed '+status);
const raw=m.getValue(o+4,'*')>>>0,dp=m.getValue(o+8,'*')>>>0;new Float32Array(m.HEAPU8.buffer,raw,2)[0]=3.5;
const r={init,ptrSize:m.PTR_SIZE,heapBytes:m.HEAPU8.byteLength,tensor:h,raw,base:b,sameRawPointer:raw===b,type:m.getValue(o,'i32'),rank:m.getValue(o+12,'i32'),dim:m.getValue(dp,'i32'),mutationVisible:new Float32Array(m.HEAPU8.buffer,b,2)[0]};
m._OrtFree(dp);r.release=m._OrtReleaseTensor(h);r.bufferAfterTensorRelease=new Float32Array(m.HEAPU8.buffer,b,2)[0];m._free(b);m.stackRestore(sp);r.rss=process.memoryUsage().rss;r.modelBytesRead=0;r.ortRuns=0;console.log(JSON.stringify(r));process.exit(0);

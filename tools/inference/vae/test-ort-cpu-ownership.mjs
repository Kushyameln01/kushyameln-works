// NN0: pinned ORT CPU-output ownership, using a small parameter-free Add graph.
// This does not establish model arithmetic, target-shape acceptance or threads4.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const vendorUrl=new URL('../../../docs/shared/inference/vendor/ort.wasm.min.mjs',import.meta.url);
const sha=data=>createHash('sha256').update(data).digest('hex');
const expectedVendorSha='d5a6d7bc8ee587648fb3742dde8c0094d17cbd3822a68bbec8ddfcd4f2adb88e';

test('the pinned CPU default-output branch copies WASM bytes into a new typed array',async()=>{
 const bytes=await fs.readFile(vendorUrl),source=bytes.toString('utf8');
 assert.equal(sha(bytes),expectedVendorSha,'A runtime update requires a fresh ownership audit');
 assert.ok(source.includes('let _=un(P),L=new _(j);new Uint8Array(L.buffer,L.byteOffset,L.byteLength).set(s.HEAPU8.subarray(C,C+L.byteLength)),z.push([P,H,L,"cpu"])'),
  'Default numeric CPU outputs must allocate a new typed array and copy the heap');
 assert.ok(source.includes('this.cpuData=void 0,this.gpuTextureData=void 0'),
  'Tensor.dispose clears wrapper references rather than modifying a retained CPU array');
});

// Encode one Add graph directly; no Python, learned coefficients or export runs.
function variable(n){const out=[];do{const b=n%128;n=Math.floor(n/128);out.push(b|(n?128:0));}while(n);return out;}
function integer(field,n){return [...variable(field*8),...variable(n)];}
function bytes(field,data){return [...variable(field*8+2),...variable(data.length),...data];}
function string(field,text){return bytes(field,new TextEncoder().encode(text));}
function info(name){
 const dims=[1,'channels',1,'height','width'].flatMap(d=>bytes(1,typeof d==='number'?integer(1,d):string(2,d)));
 return [...string(1,name),...bytes(2,bytes(1,[...integer(1,1),...bytes(2,dims)]))];
}
const node=[...string(1,'input'),...string(1,'other'),...string(2,'output'),...string(4,'Add')];
const graph=[...bytes(1,node),...string(2,'cpu-owned-output-helper'),...bytes(11,info('input')),...bytes(11,info('other')),...bytes(12,info('output'))];
const graphBytes=Uint8Array.from([...integer(1,8),...string(2,'ort-cpu-ownership-test'),...bytes(7,graph),...bytes(8,integer(2,17))]);

test('actual CPU WASM data survives Tensor.dispose, session release, heap growth and later reuse',async()=>{
 const NativeMemory=WebAssembly.Memory,memories=[];
 const counters={sessionsCreated:0,sessionsReleased:0,tensorsDisposed:0};
 WebAssembly.Memory=new Proxy(NativeMemory,{construct(target,args,newTarget){
  const memory=Reflect.construct(target,args,newTarget);memories.push(memory);return memory;
 }});
 try{
  const ort=await import(vendorUrl.href);ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  assert.equal(ort.env.versions.common,'1.24.3');
  async function addition(shape,leftValue,rightValue){
   let session,left,right,result;
   try{
    session=await ort.InferenceSession.create(graphBytes,{executionProviders:['wasm'],graphOptimizationLevel:'disabled'});counters.sessionsCreated++;
    const count=shape.reduce((n,d)=>n*d,1),leftData=new Float32Array(count).fill(leftValue),rightData=new Float32Array(count).fill(rightValue);
    left=new ort.Tensor('float32',leftData,shape);right=new ort.Tensor('float32',rightData,shape);
    // Default, unbound CPU outputs only. Preallocated/GPU outputs are a different contract.
    result=await session.run({input:left,other:right});
    assert.equal(result.output.location,'cpu');assert.equal(result.output.type,'float32');assert.deepEqual(result.output.dims,shape);
    const held=result.output.data;
    assert.ok(held instanceof Float32Array);assert.ok(held.buffer instanceof ArrayBuffer);
    assert.equal(held.buffer instanceof SharedArrayBuffer,false);
    assert.equal(held.byteOffset,0);assert.equal(held.byteLength,held.buffer.byteLength);
    assert.notEqual(held.buffer,leftData.buffer);assert.notEqual(held.buffer,rightData.buffer);
    for(const memory of memories)assert.notEqual(held.buffer,memory.buffer,'Output must not be an observed WASM heap view');
    for(const value of held)assert.equal(value,Math.fround(leftValue+rightValue));
    result.output.dispose();counters.tensorsDisposed++;assert.throws(()=>result.output.data,/disposed/);result=null;
    left.dispose();counters.tensorsDisposed++;left=null;right.dispose();counters.tensorsDisposed++;right=null;
    await session.release();counters.sessionsReleased++;session=null;
    leftData.fill(999);rightData.fill(-999);
    for(const value of held)assert.equal(value,Math.fround(leftValue+rightValue),'Input mutation after release cannot alter the held output');
    return held;
   }finally{
    for(const value of [...Object.values(result??{}),left,right])if(value){value.dispose();counters.tensorsDisposed++;}
    if(session){await session.release();counters.sessionsReleased++;}
   }
  }
  const retained=await addition([1,2,1,4,8],.5,1.25),retainedHash=sha(retained);
  assert.ok(memories.length>0,'Observe the actual runtime memory before claiming heap growth');
  const runtimeMemory=memories.at(-1),beforeCapacity=runtimeMemory.buffer.byteLength;
  assert.ok(beforeCapacity<=128*1024*1024,'Tiny Add unexpectedly initialized a large heap; do not allocate an unbounded probe');
  // The two copied input buffers alone exceed the current heap capacity. Growth
  // is triggered through real ORT allocation, never by growing its memory directly.
  const growElements=Math.ceil((beforeCapacity+1024*1024)/8);
  const retainedLarge=await addition([1,1,1,1,growElements],12.5,-7.25),largeHash=sha(retainedLarge);
  const afterCapacity=runtimeMemory.buffer.byteLength;
  assert.ok(afterCapacity>beforeCapacity,'The actual allocation must grow the same observed WASM heap');
  assert.equal(sha(retained),retainedHash,'Every held byte must survive later native allocation and heap growth');
  await addition([1,2,1,4,8],-100.5,3.25);
  assert.equal(memories.at(-1),runtimeMemory,'Later sessions reuse the observed ORT runtime memory');
  assert.equal(sha(retained),retainedHash);assert.equal(sha(retainedLarge),largeHash,'The full later output must remain unchanged after another session');
  assert.deepEqual(counters,{sessionsCreated:3,sessionsReleased:3,tensorsDisposed:9});
  console.log(JSON.stringify({scope:'parameter-free Add, actual Node CPU WASM, threads1 only; not NN acceptance',runtimeSha256:expectedVendorSha,
   beforeWasmCapacityBytes:beforeCapacity,afterWasmCapacityBytes:afterCapacity,growElements,retainedBytes:retained.byteLength,retainedLargeBytes:retainedLarge.byteLength,
   retainedArrayUnchanged:true,retainedLargeArrayUnchanged:true,...counters}));
 }finally{WebAssembly.Memory=NativeMemory;}
});

test('counterfeit WASM views are not generally owned arrays; an explicit copy survives growth',()=>{
 for(const shared of [false,true]){
  const memory=new WebAssembly.Memory({initial:1,maximum:2,shared}),view=new Float32Array(memory.buffer,64,4);
  view.set([1,2,3,4]);const owned=new Float32Array(view);
  assert.ok(view.byteOffset!==0||view.byteLength!==view.buffer.byteLength);
  memory.grow(1);new Float32Array(memory.buffer,64,4).fill(99);
  assert.deepEqual([...owned],[1,2,3,4]);
  if(shared){assert.ok(view.buffer instanceof SharedArrayBuffer);assert.deepEqual([...view],[99,99,99,99]);}
  else assert.equal(view.byteLength,0,'Ordinary WASM heap views detach after growth');
 }
});

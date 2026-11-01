import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const math=await import('./math.mjs').catch(()=>({}));
const bytes=async()=>new Uint8Array(await readFile(new URL('./kernel.wasm',import.meta.url)));
const inputs=()=>({o:Float32Array.from({length:10240},(_,i)=>(i%13-6)/8),gateProjection:Float32Array.from({length:5120},(_,i)=>(i%7-3)/10),modulation:Float32Array.from({length:5120},(_,i)=>(i%5-2)/11),patchHidden:Float32Array.from({length:10240},(_,i)=>(i%17-8)/4),rows:2});
test('Hike tail preserves original residual basis, gate without scale+1 and separate F32 rounding',async()=>{
 assert.equal(typeof math.createSelfAttentionTailMath,'function','new tail Hike owner required');
 const owner=await math.createSelfAttentionTailMath({wasmBytes:await bytes()});
 try{
  const x=inputs(),before=owner.stats(),got=owner.run(x);
  for(let i=0;i<5120;i++)assert.equal(got.gate[i],Math.fround(x.modulation[i]+x.gateProjection[i]));
  for(let i=0;i<10240;i++){
   const product=Math.fround(x.o[i]*got.gate[i%5120]);
   assert.equal(got.gated[i],product);assert.equal(got.residual[i],Math.fround(x.patchHidden[i]+product));
  }
  const basis=inputs();basis.o.fill(3);basis.modulation.fill(0);basis.gateProjection.fill(0);
  assert.deepEqual(owner.run(basis).residual,basis.patchHidden);
  basis.modulation.fill(2);basis.gateProjection.fill(-1);
  assert.equal(owner.run(basis).gated[0],3,'gate must not add one');
  const rounding=inputs();rounding.o.fill(Math.fround(1.0000001192092896));rounding.modulation.fill(0);rounding.gateProjection.fill(Math.fround(1.0000001192092896));rounding.patchHidden.fill(-Math.fround(1.000000238418579));
  assert.equal(owner.run(rounding).residual[0],0,'the F32 product is rounded before adding residual');
  assert.equal(owner.stats().memoryBytes,before.memoryBytes);assert.equal(owner.stats().memoryIdentity,before.memoryIdentity);
  assert.equal(owner.stats().calls,4);assert.equal(owner.stats().snapshotCopyBytes,4*122880);assert.equal(owner.stats().inputCopyBytes,4*122880);assert.equal(owner.stats().outputCopyBytes,4*102400);
  got.gate.fill(999);got.gated.fill(999);got.residual.fill(999);
  assert.equal(owner.run(inputs()).gate[0],Math.fround(x.modulation[0]+x.gateProjection[0]));
 }finally{owner.dispose();}
 assert.throws(()=>owner.run(inputs()),/disposed/);
});
test('tail math rejects bad identity, shared bytes, shapes, finite values, range and row overrides',async()=>{
 assert.equal(typeof math.createSelfAttentionTailMath,'function','new tail Hike owner required');
 const binary=await bytes(),bad=binary.slice();bad[bad.length-1]^=1;
 await assert.rejects(math.createSelfAttentionTailMath({wasmBytes:bad}),/hash mismatch/);
 if(typeof SharedArrayBuffer==='function')await assert.rejects(math.createSelfAttentionTailMath({wasmBytes:new Uint8Array(new SharedArrayBuffer(binary.length))}),/Nonshared/);
 const owner=await math.createSelfAttentionTailMath({wasmBytes:binary});
 try{
  for(const rows of [1,3,undefined])assert.throws(()=>owner.run({...inputs(),rows}),/shape/);
  for(const key of ['o','gateProjection','modulation','patchHidden']){
   const badShape=inputs();badShape[key]=badShape[key].slice(1);assert.throws(()=>owner.run(badShape),/shape/);
   const badCompact=inputs();badCompact[key]=new Float32Array(badCompact[key].length+1).subarray(1);assert.throws(()=>owner.run(badCompact),/compact/);
   for(const value of [NaN,Infinity,-Infinity]){const badFinite=inputs();badFinite[key][0]=value;assert.throws(()=>owner.run(badFinite),/finite/);}
   if(typeof SharedArrayBuffer==='function'){const shared=inputs();shared[key]=new Float32Array(new SharedArrayBuffer(shared[key].byteLength));assert.throws(()=>owner.run(shared),/nonshared|compact/);}
  }
  for(const key of ['o','patchHidden'])for(const value of [1e17,-1e17]){const badRange=inputs();badRange[key][0]=value;assert.throws(()=>owner.run(badRange),/admission/);}
  for(const value of [1e17,-1e17]){const badGate=inputs();badGate.gateProjection[0]=value;assert.throws(()=>owner.run(badGate),/admission|rejected/);}
  const overflow=inputs();overflow.gateProjection[0]=3e38;overflow.modulation[0]=3e38;assert.throws(()=>owner.run(overflow),/admission|rejected/);
  assert.equal(owner.stats().busy,false);assert.equal(owner.run(inputs()).residual.length,10240);
 }finally{owner.dispose();}
});
test('tail math checks busy before getters and permits recovery after rejected input',async()=>{
 assert.equal(typeof math.createSelfAttentionTailMath,'function','new tail Hike owner required');
 const owner=await math.createSelfAttentionTailMath({wasmBytes:await bytes()});
 try{
  const x=inputs();let nestedReads=0;
  Object.defineProperty(x,'o',{get(){assert.throws(()=>owner.run({get o(){nestedReads++;return new Float32Array(10240);}}),/busy/);assert.throws(()=>owner.dispose(),/busy/);return inputs().o;}});
  assert.equal(owner.run(x).residual.length,10240);assert.equal(nestedReads,0);
  assert.throws(()=>owner.run({...inputs(),unexpected:true}),/Unknown/);
  assert.equal(owner.stats().busy,false);assert.equal(owner.run(inputs()).residual.length,10240);
 }finally{owner.dispose();owner.dispose();}
});
test('tail math snapshots supplied bytes before identity await and raw ABI rejects invalid admission',async()=>{
 assert.equal(typeof math.createSelfAttentionTailMath,'function','new tail Hike owner required');
 const supplied=await bytes(),creating=math.createSelfAttentionTailMath({wasmBytes:supplied});supplied.fill(0);
 const owner=await creating;assert.equal(owner.run(inputs()).residual.length,10240);owner.dispose();
 const module=await WebAssembly.compile(await bytes());assert.deepEqual(WebAssembly.Module.imports(module),[]);
 const instance=await WebAssembly.instantiate(module,{}),memory=instance.exports.memory,start=memory.buffer.byteLength;
 memory.grow(4);
 const ptr=[start,start+40960,start+61440,start+81920,start+122880,start+143360,start+184320],run=(rows=2,capacity=10240)=>instance.exports.GateResidual(ptr[0],ptr[1],ptr[2],ptr[3],rows,ptr[4],ptr[5],ptr[6],capacity);
 assert.equal(run(1),-1);assert.equal(run(2,10239),-1);assert.equal(run(),0);
 new Float32Array(memory.buffer,ptr[0],10240)[0]=NaN;assert.equal(run(),-2);
 new Float32Array(memory.buffer,ptr[0],10240)[0]=Math.fround(1e16);assert.equal(run(),-2,'rounded float32 above exact 1e16 must reject');
 new Float32Array(memory.buffer,ptr[0],10240)[0]=0;
 new Float32Array(memory.buffer,ptr[1],5120)[0]=1e17;assert.equal(run(),-2);
});

test('tail snapshots never invoke a caller virtual slice or retain subclass storage',async()=>{
 const op=await math.createSelfAttentionTailMath({wasmBytes:await bytes('./kernel.wasm')});
 try{
  class Alias extends Float32Array {slice(){return this;}}
  const o=new Alias(10240).fill(1),gateProjection=new Alias(5120).fill(2),modulation=new Float32Array(5120),patchHidden=new Float32Array(10240).fill(3);
  gateProjection.slice=function(){o[0]=99;return this;};
  const result=op.run({o,gateProjection,modulation,patchHidden,rows:2});
  assert.equal(result.gated[0],2,'copy must not invoke virtual slice that mutates a prior input alias');assert.equal(result.residual[0],5);assert.equal(o[0],1);
 }finally{op.dispose();}
});

test('tail admission uses typed-array slots and validates the owned copy',async()=>{
 const op=await math.createSelfAttentionTailMath({wasmBytes:await bytes()});
 try{
  class DisguisedView extends Float32Array {get byteOffset(){return 0;}get byteLength(){return this.buffer.byteLength;}slice(){return new Float32Array(this);}every(){return true;}}
  const badView=new DisguisedView(new ArrayBuffer(40964),4,10240),x=inputs();
  assert.throws(()=>op.run({...x,o:badView}),/shape|compact/,'original partial view remains inadmissible even when properties lie');
  class DisguisedFinite extends Float32Array {every(){return true;}}
  const badFinite=new DisguisedFinite(x.o);badFinite[0]=Infinity;assert.throws(()=>op.run({...x,o:badFinite}),/finite/);
  const badRange=new DisguisedFinite(x.o);badRange[0]=2e16;assert.throws(()=>op.run({...x,o:badRange}),/admission/);
  class DisguisedShared extends Float32Array {get buffer(){return new ArrayBuffer(40960);}slice(){return new Float32Array(this);}}
  const badShared=new DisguisedShared(new SharedArrayBuffer(40960));assert.throws(()=>op.run({...x,o:badShared}),/nonshared|compact|shape/);
 }finally{op.dispose();}
});

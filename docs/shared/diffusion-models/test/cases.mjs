// Hand-derived cases for the component, NOT model-inference fixtures.
export async function runCases(wasmBytes) {
  const { createEulerKernel } = await import('../euler-kernel.mjs');
  const cases = [];
  async function check(name, fn) {
    await fn(); cases.push({name, ok:true});
  }
  function equal(actual, expected) {
    if (JSON.stringify(Array.from(actual)) !== JSON.stringify(expected))
      throw Error(`expected ${JSON.stringify(expected)}, got ${Array.from(actual)}`);
  }
  function rejects(fn) {
    let error; try { fn(); } catch(e) { error=e; }
    if (!error) throw Error('expected rejection');
  }
  const k = await createEulerKernel(wasmBytes, {capacity:65536});
  const x = new Float32Array([2,-4,1,0]);
  const d = new Float32Array([0,-2,3,0]);
  await check('Hike Euler computes every element and preserves inputs', () => {
    equal(k.step(x,d,1,0.5), [1,-3,2,0]);
    equal(x,[2,-4,1,0]); equal(d,[0,-2,3,0]);
  });
  await check('final step reaches denoised for exact small inputs', () => {
    equal(k.step(x,d,0.5,0), [0,-2,3,0]);
  });
  await check('equal sigma is unchanged; empty tensors are valid', () => {
    equal(k.step(x,d,1,1),[2,-4,1,0]);
    equal(k.step(new Float32Array(),new Float32Array(),1,0),[]);
  });
  await check('reject invalid tensor lengths, types, capacity, finite values', () => {
    rejects(()=>k.step(x,new Float32Array(1),1,0));
    rejects(()=>k.step([1],new Float32Array([1]),1,0));
    rejects(()=>k.step(new Float32Array(65537),new Float32Array(65537),1,0));
    for (const n of [NaN,Infinity,-Infinity]) rejects(()=>k.step(new Float32Array([n]),new Float32Array([0]),1,0));
    rejects(()=>k.step(new Float32Array([0]),new Float32Array([NaN]),1,0));
  });
  await check('reject zero, increasing, negative, nonfinite and f32-underflow sigma', () => {
    for (const pair of [[0,0],[-1,0],[1,2],[1,-1],[NaN,0],[1,Infinity],[1e-50,0]])
      rejects(()=>k.step(x,d,...pair));
  });
  await check('reject coercible non-number sigma values', () => {
    for(const value of ['1',null,true,[],{},undefined]) {
      rejects(()=>k.step(x,d,value,0));
      rejects(()=>k.step(x,d,1,value));
    }
  });
  await check('f32 operation order matches independent scalar reference', () => {
    equal(k.step(new Float32Array([1]),new Float32Array([0.1]),0.3,0.2),[0.699999988079071]);
  });
  await check('reject overflow instead of publishing nonfinite tensor; recover', () => {
    rejects(()=>k.step(new Float32Array([3e38]),new Float32Array([-3e38]),1,0));
    equal(k.step(x,d,1,0.5),[1,-3,2,0]);
  });
  await check('capacity-sized array, repeated calls, independent owned output, fixed Memory', () => {
    const a=new Float32Array(65536).fill(2), b=new Float32Array(65536).fill(0);
    const bytes=k.memoryBytes, first=k.step(a,b,1,0.5);
    for(let j=0;j<100;j++) {
      const out=k.step(a,b,1,0.5);
      if(out.length!==65536 || out.some(v=>v!==1)) throw Error('incomplete/wrong array');
      if(k.memoryBytes!==bytes) throw Error('Memory grew per step');
      out[0]=99;
    }
    if(first[0]!==1) throw Error('returned buffer was borrowed');
  });
  await check('dispose is idempotent, refuses reuse, releases own references only', () => {
    k.dispose(); k.dispose();
    rejects(()=>k.step(x,d,1,0));
    if(k.memoryBytes!==0) throw Error('host still owns disposed Memory');
  });
  await check('missing or changed WASM is refused without JS fallback', async () => {
    for(const bytes of [new Uint8Array(),new Uint8Array(wasmBytes.byteLength)]) {
      let error;try { await createEulerKernel(bytes); }catch(e){error=e;}
      if(!error) throw Error('invalid WASM accepted');
    }
  });
  await check('async loading owns a byte snapshot throughout hash and compile', async () => {
    const bytes=new Uint8Array(wasmBytes).slice();
    const pending=createEulerKernel(bytes,{capacity:1});
    bytes.fill(0);
    const other=await pending;
    equal(other.step(new Float32Array([2]),new Float32Array([0]),1,0.5),[1]);
    other.dispose();
  });
  await check('raw Hike ABI preserves caller input arenas beyond 245744 elements', async () => {
    const {instance}=await WebAssembly.instantiate(wasmBytes,{});
    const m=instance.exports.memory,n=262144,base=m.buffer.byteLength,bytes=n*4;
    m.grow(3*bytes/65536);
    const a=new Float32Array(m.buffer,base,n), b=new Float32Array(m.buffer,base+bytes,n);
    a.fill(2);b.fill(1);
    if(instance.exports.EulerDenoised(base,base+bytes,base+2*bytes,n,n,1,.5)!==0) throw Error('raw kernel failed');
    if(a.some(v=>v!==2)||b.some(v=>v!==1)) throw Error('kernel scratch overwrote caller input arena');
    const out=new Float32Array(m.buffer,base+2*bytes,n);
    if(out.some(v=>v!==1.5)) throw Error('raw kernel incomplete');
  });
  return {passed:true,caseCount:cases.length,cases,scope:'Hike Euler array component only; no Bernini/ORT/pipeline execution'};
}

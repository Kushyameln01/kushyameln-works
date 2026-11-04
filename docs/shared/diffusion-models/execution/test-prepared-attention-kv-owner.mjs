import test from 'node:test';
import assert from 'node:assert/strict';
const {createPreparedAttentionKV,createOrderedAttentionKVPool}=await import('./prepared-attention-kv.mjs').catch(()=>({}));
const shape=(keys)=>({heads:40,headDim:128,keys});
const pair=(keys=1,keyStart=0)=>({...shape(keys),keyStart,k:new Float32Array(keys*5120).fill(1),v:new Float32Array(keys*5120).fill(2)});
function fixture(){
 const all=[];let failed=0;
 class Tensor{constructor(type,data,dims){this.type=type;this.data=data;this.dims=dims;all.push(this);}dispose(){if(this.failOnce){this.failOnce=false;throw Error('injected disposal failure');}this.disposed=true;}}
 const validate=(value,count)=>{assert.equal(Object.getPrototypeOf(value),Float32Array.prototype);assert.equal(value.length,count);assert.equal(value.byteOffset,0);assert.equal(value.buffer.byteLength,value.byteLength);assert.ok(value.every(Number.isFinite));return value;};
 const owner=createPreparedAttentionKV({ort:{Tensor},assertLive(){},validateView:validate,onCleanupFailure(){failed++;}});
 return {owner,all,get failed(){return failed;}};
}
test('prepared K/V owner and ordered builder are available',()=>{assert.equal(typeof createPreparedAttentionKV,'function');assert.equal(typeof createOrderedAttentionKVPool,'function');});
test('copy isolates caller bytes; take detaches both and leases protect immutable owner-local tensors',()=>{
 const f=fixture(),p=pair(3,256),h=f.owner.prepare(p);p.k.fill(99);p.v.fill(99);
 const lease=f.owner.borrow(h,{keyStart:256,keys:3});assert.equal(lease.k.data[0],1);assert.equal(lease.v.data[0],2);assert.throws(()=>f.owner.release(h),/lease|active/);lease.release();assert.equal(lease.release(),false);
 assert.equal(f.owner.release(h),true);assert.equal(f.owner.release(h),false);assert.throws(()=>f.owner.borrow(h),/foreign|released/);
 const taken=pair(7),t=f.owner.prepare({...taken,ownership:'take'});assert.equal(taken.k.byteLength,0);assert.equal(taken.v.byteLength,0);assert.equal(f.owner.stats().currentBytes,7*5120*8);f.owner.release(t);assert.equal(f.owner.stats().currentBytes,0);f.owner.disposeAll();
});
test('range, foreign, malformed and aborted preparation reject before transfer; disposal retries retain failed resources',()=>{
 const f=fixture(),p=pair(),h=f.owner.prepare(p);assert.throws(()=>f.owner.borrow({...h}),/foreign/);assert.throws(()=>f.owner.borrow(h,{keyStart:1,keys:1}),/range|start/);assert.throws(()=>f.owner.borrow(h,{keyStart:0,keys:2}),/range|keys/);
 const control=new AbortController();control.abort();const fresh=pair();assert.throws(()=>f.owner.prepare({...fresh,ownership:'take',signal:control.signal}),{name:'AbortError'});assert.equal(fresh.k.byteLength,5120*4);
 const bad=pair();bad.v[0]=NaN;assert.throws(()=>f.owner.prepare({...bad,ownership:'take'}));assert.equal(bad.k.byteLength,5120*4);assert.throws(()=>f.owner.prepare({...p,v:p.k,ownership:'take'}),/distinct|buffer/);
 f.all[0].failOnce=true;assert.throws(()=>f.owner.release(h),AggregateError);assert.equal(f.failed,1);assert.equal(f.owner.stats().ownedPairs,1);assert.equal(f.owner.stats().currentBytes,5120*4);assert.throws(()=>f.owner.prepare(pair()),/cleanup/);f.owner.disposeAll();assert.equal(f.owner.stats().currentBytes,0);assert.equal(f.owner.stats().ownedPairs,0);
});
test('ordered rows create exact head-major 256+219 tiles without full row-major stores and dispose every pair',()=>{
 const f=fixture(),pool=createOrderedAttentionKVPool({totalKeys:475,prepare:input=>f.owner.prepare(input),release:handle=>f.owner.release(handle)});
 let start=0;for(const rows of [128,128,128,91]){const k=new Float32Array(rows*5120),v=new Float32Array(k.length);for(let r=0;r<rows;r++)for(let c=0;c<5120;c++){k[r*5120+c]=(start+r)*8192+c;v[r*5120+c]=-k[r*5120+c];}pool.appendRows({k,v,rowStart:start,rows});start+=rows;}
 pool.finish();assert.equal(pool.stats().rowMajorFullStores,0);assert.equal(pool.stats().preparedBytes,475*5120*8);assert.equal(pool.stats().pendingBytes,0);assert.equal(pool.stats().peakTotalBytes,475*5120*8);
 for(const [keyStart,keys] of [[0,256],[256,219]]){const handle=pool.tileAt(keyStart),lease=f.owner.borrow(handle,{keyStart,keys});for(let h=0;h<40;h++)for(let r=0;r<keys;r++)for(let d=0;d<128;d++){const i=(h*keys+r)*128+d,want=(keyStart+r)*8192+h*128+d;assert.equal(lease.k.data[i],want);assert.equal(lease.v.data[i],-want);}lease.release();}
 assert.throws(()=>pool.tileAt(1),/aligned|range/);assert.throws(()=>pool.tileAt(512),/range/);assert.throws(()=>pool.appendRows({k:new Float32Array(5120),v:new Float32Array(5120),rowStart:475,rows:1}),/complete|range/);pool.dispose();assert.equal(f.owner.stats().currentBytes,0);assert.equal(pool.stats().preparedBytes,0);f.owner.disposeAll();
});
test('ordered pool rejects gaps and releases completed and partial tiles on cancellation',()=>{
 const f=fixture(),control=new AbortController(),pool=createOrderedAttentionKVPool({totalKeys:475,prepare:input=>f.owner.prepare(input),release:h=>f.owner.release(h),signal:control.signal});
 assert.throws(()=>pool.appendRows({...pair(1),rowStart:1,rows:1}),/order|start/);assert.throws(()=>pool.finish(),/complete|every/);
 for(let rowStart=0;rowStart<384;rowStart+=128)pool.appendRows({...pair(128),rowStart,rows:128});assert.equal(pool.stats().preparedBytes,256*5120*8);assert.equal(pool.stats().pendingBytes,219*5120*8);control.abort();assert.throws(()=>pool.finish(),{name:'AbortError'});pool.dispose();assert.equal(f.owner.stats().currentBytes,0);assert.equal(pool.stats().pendingBytes,0);f.owner.disposeAll();
});

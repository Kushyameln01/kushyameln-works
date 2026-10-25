import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker as NodeWorker} from 'node:worker_threads';
import {createComputePool} from '../../docs/shared/compute/client.mjs';
import {inspectTaskRequest,validTaskResult,resultShape} from '../../docs/shared/parameter-registrar/pool-task.mjs';
import {createParameterRegistrar,partitionDocuments} from '../../docs/shared/parameter-registrar/client.mjs';
import {instantiateKernel} from '../../docs/shared/compute/kernel.mjs';
import {WASM_SHA256} from '../../docs/shared/compute/protocol.mjs';
import {writeUnityPackage,readUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {PREAMBLE,tree,clip,asset,GUIDS} from '../animator-composer/fixture-composition.mjs';
import {parseExpression} from '../../docs/animator-composer/lib/registration.mjs';
const binary=await readFile(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url));
const module=await WebAssembly.compile(binary);
const kernel=instantiateKernel(module);
const doc={classId:'206',fileId:'20600000',guid:GUIDS.tree,path:'Assets/Tree.asset',text:tree('20600000','Root','Axis')};
const request=(taskType,payload)=>({protocolVersion:1,taskType,taskVersion:1,jobId:crypto.randomUUID(),inputRevision:7,payload});
class RealWorker {
  constructor(kind='pool',bundle=false){this.worker=new NodeWorker(new URL('./node-worker.mjs',import.meta.url),{workerData:{kind,bundle}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}
  postMessage(data,transfer){this.worker.postMessage(data,transfer);}
  terminate(){return this.worker.terminate();}
}
function poolFor(bundle=false){return createComputePool({moduleReuse:true,prepareModule:async()=>module,workerFactory:()=>new RealWorker('pool',bundle)});}
function source(){return writeUnityPackage([
  asset(GUIDS.tree,'Assets/Loose.asset',PREAMBLE+doc.text,'20600000'),
  asset(GUIDS.clip,'Assets/Orphan.anim',clip('7400000','Orphan','Written',kernel.animatorHash('Written')),'7400000')
]);}
test('shared Hike instance provides real Animator hash, with exact UTF-8 strings',()=>{
  // Independently calculated with Python zlib.crc32 over UTF-8 bytes.
  assert.equal(kernel.animatorHash('Written'),2901644619);
  assert.equal(typeof kernel.animatorHash('日本語/Parameter'),'number');
  assert.throws(()=>kernel.animatorHash(123),/string/i);
});
test('adapter validates identity, owned request shape and generation result identity',()=>{
  const r=inspectTaskRequest(request('parameter-collect',{documents:[doc]}));
  assert.equal(r.kernelHash,WASM_SHA256);
  assert.throws(()=>inspectTaskRequest({...r,inputRevision:-1}));
  assert.throws(()=>inspectTaskRequest(request('parameter-collect',{documents:[{...doc,classId:'91'}]})));
  const gen=inspectTaskRequest(request('parameter-generate',{parameters:[{name:'Axis',type:'Float'}],settings:{name:'Test'}}));
  assert(!validTaskResult(gen.taskType,resultShape(gen),{kind:'parameter-assets',archive:new Uint8Array([1]),fileName:'../oops',parameterCount:99,bitCost:0}));
});
test('document partitioning accounts for serialized bytes, never silently truncates',()=>{
  const many=Array.from({length:4},(_,i)=>({...doc,fileId:String(i+1),text:doc.text+' '.repeat(200)}));
  const batches=partitionDocuments(many,1800);
  assert.deepEqual(batches.flat(),many);assert(batches.length>1);
  assert.throws(()=>partitionDocuments([{...doc,text:' '.repeat(5000)}],1000),/大き|limit|上限/i);
});
for(const bundle of [false,true])test(`real ${bundle?'bundle':'module'} Worker mixed pool extraction, new package and borrowed ownership`,async()=>{
  const pool=poolFor(bundle),client=createParameterRegistrar({pool,scanWorkerFactory:()=>new RealWorker('scan')});
  const input=source(),before=input.slice();
  try{
    const unrelated=pool.submit(request('ft-magnitude-batch',{masks:[0,1,3],weights:[1,2]}));
    const collected=await client.collect(input,{inputRevision:7});
    assert.deepEqual(input,before,'caller package must stay intact');
    assert.deepEqual(collected.parameters,[{name:'Axis',type:'Float'},{name:'Written',type:'Float'}]);
    assert.equal(collected.clipCount,1);assert.equal(collected.blendTreeCount,1);
    assert.equal((await unrelated.promise).status,'succeeded');
    const generated=await client.generate(collected.parameters,{name:'_ClientTest',defaultValue:.25,saved:true,networkSynced:false},{inputRevision:7});
    const output=[...readUnityPackage(generated.archive).values()];
    assert.equal(generated.parameterCount,2);assert.equal(generated.bitCost,0);
    assert(!output.some(a=>/report|\.json$/i.test(a.path)));
    const expression=output.find(a=>a.path.endsWith('.asset'));
    assert.deepEqual(parseExpression(new TextDecoder().decode(expression.asset)).map(p=>[p.name,p.defaultValue,p.saved,p.networkSynced]),[['Axis',.25,true,false],['Written',.25,true,false]]);
    client.dispose();assert.equal(pool.getStatus().disposed,false);
    assert.equal((await pool.submit(request('ft-magnitude-batch',{masks:[1],weights:[1]})).promise).status,'succeeded');
  }finally{client.dispose();pool.dispose();}
});
test('scan cancellation settles, late replies cannot overwrite the next request; dispose rejects reuse',async()=>{
  const pool=poolFor();let scans=[];
  class SlowScan {postMessage(data){this.sent=data;scans.push(this);}terminate(){this.stopped=true;}}
  const client=createParameterRegistrar({pool,scanWorkerFactory:()=>new SlowScan()});
  try{
    const first=client.collect(source(),{inputRevision:1});
    assert.equal(client.cancel(),true);
    await assert.rejects(first,e=>e.name==='AbortError');
    const second=client.collect(source(),{inputRevision:2});
    scans[0].onmessage?.({data:{...scans[0].sent,type:'result',documents:[],clipCount:999,blendTreeCount:999}});
    const current=scans[1];
    current.onmessage({data:{...current.sent,type:'result',documents:[doc],clipCount:0,blendTreeCount:1}});
    const got=await second;assert.equal(got.blendTreeCount,1);assert.equal(got.clipCount,0);
    client.dispose();await assert.rejects(client.collect(source()),/終了|disposed/i);
    assert.equal(pool.getStatus().disposed,false);
  }finally{client.dispose();pool.dispose();}
});
test('rebuilt bundle keeps existing knowledge and Unity kernel URLs relative to compute',async()=>{
  // No injected Module: the real bundled worker must fetch each kernel itself.
  const pool=createComputePool({workerFactory:()=>new RealWorker('pool',true)});
  try{
    const identity={datasetVersion:'test',algorithmVersion:1,inputHash:'a'.repeat(64),configHash:'b'.repeat(64),tokenTableHash:'c'.repeat(64),shardId:'one',segmentId:'one'};
    const knowledge=await pool.submit(request('knowledge-index-step',{...identity,records:[[1,1,0]],cursor:0,state:null,final:true})).promise;
    assert.equal(knowledge.status,'succeeded',knowledge.message);
    assert.deepEqual(knowledge.result.postings,[[1,1,0,1]]);
    const minimum=JSON.parse(await readFile(new URL('../unity-analysis/fixtures/minimum.json',import.meta.url),'utf8'));
    const unity=await pool.submit(request('unity-analyze',minimum.before)).promise;
    assert.equal(unity.status,'succeeded',unity.message);
    assert.equal(unity.result.kind,'unity-analysis');
  }finally{pool.dispose();}
});

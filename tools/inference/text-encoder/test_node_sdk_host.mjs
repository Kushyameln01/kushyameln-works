// NN0: real public factory and tensor codec; the job is a lifecycle double.
// No model/runtime job is imported or executed by this test module.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,open,stat,utimes,rename,chmod,rm,readdir,readlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createTextEncoderModule} from '../../../docs/shared/inference/text-encoder-api.mjs';
import {encodeTensor,decodeTensor} from '../../../docs/shared/inference/tensor.mjs';
const manifest=JSON.parse(await readFile(new URL('../../../development/inference/reference-adoption/p0/evidence/manifests/text.json',import.meta.url),'utf8'));
let host;try{host=await import('./node_sdk_host.mjs');}catch{}
const input={id:'id-l1',input:{tokenIds:[1],attentionMask:[1]},tokenIds:[1],attentionMask:[1],shape:[1,1,4096]};
const output=()=>({tensor:{dtype:'float32',layout:'BLC',meaning:'text_hidden_states',shape:[1,1,4096],data:new Float32Array(4096),attentionMask:Uint8Array.of(1),modelSha256:manifest.modelSha256,tokenizerSha256:manifest.tokenizer.sha256,normalization:'umt5-final-rmsnorm-f32-v1'},attentionMask:Uint8Array.of(1),inputMode:'token-ids'});
const request=()=>({module:'text_encoder',operation:'encode',manifest,files:new Map(),input:input.input,diagnostics:false});

test('reference host drives the real public factory and preserves normal codec values',async()=>{
 assert.equal(typeof host?.createReferenceClient,'function','reference host client missing');
 let calls=0;
 const client=host.createReferenceClient(async job=>{calls++;assert.equal(job.diagnostics,false);assert.ok(job.signal instanceof AbortSignal);return output();},{ort:{},hike:{}});
 const api=createTextEncoderModule({client});api.configure({manifest,files:new Map()});
 await assert.rejects(api.encode({text:'mixed',tokenIds:[1],attentionMask:[1]}),/without mixing/);assert.equal(calls,0);
 const result=await api.encode(input.input);assert.equal(calls,1);assert.equal(Object.hasOwn(result,'evidence'),false);
 const metadata=host.verifyCaseOutput(result,input,manifest,api.capabilities(),{diagnostics:false});assert.equal(metadata.elements,4096);
 const restored=await decodeTensor(await encodeTensor(result.tensor));assert.deepEqual(restored.data,result.tensor.data);assert.deepEqual([...restored.attentionMask],[1]);
 assert.equal(client.state.status,'success');assert.equal(client.state.inputRevision,1);api.dispose();assert.equal(client.state.status,'disposed');
});
test('reference client rejects overlap and preserves error/disposed terminal states',async()=>{
 assert.equal(typeof host?.createReferenceClient,'function','reference host client missing');
 let release;const client=host.createReferenceClient(()=>new Promise(resolve=>{release=resolve;}),{ort:{},hike:{}});
 const pending=client.run(request());assert.equal(client.state.status,'running');await assert.rejects(client.run(request()),/busy/);release(output());await pending;assert.equal(client.state.status,'success');
 client.dispose();await assert.rejects(client.run(request()),/disposed/);assert.equal(client.state.status,'disposed');
 const failure=host.createReferenceClient(async()=>{throw Error('job failure');},{ort:{},hike:{}});await assert.rejects(failure.run(request()),/job failure/);assert.equal(failure.state.status,'error');
});
test('reference host rejects bytes cases and validates the native result contract',()=>{
 assert.equal(typeof host?.validateCaseRecord,'function','host case validation missing');
 assert.throws(()=>host.validateCaseRecord({...input,byteGraph:0}),/byteGraph|File-backed/);
 assert.throws(()=>host.validateCaseRecord({...input,shape:[1,512,4096]}),/shape/);
 const capabilities=createTextEncoderModule({client:{state:{status:'idle'},dispose(){}}}).capabilities();
 const wrong=output();wrong.tensor.normalization='wrong';assert.throws(()=>host.verifyCaseOutput(wrong,input,manifest,capabilities,{diagnostics:false}),/normalization|contract/);
 const diagnostic=output();diagnostic.evidence={};assert.throws(()=>host.verifyCaseOutput(diagnostic,input,manifest,capabilities,{diagnostics:false}),/diagnostic/);
});
test('native openAsBlob keeps an actual local file backed by bounded slices',async()=>{
 assert.equal(typeof host?.openLocalBlob,'function','native file-backed host reader missing');
 const folder=await mkdtemp(join(tmpdir(),'text-sdk-host-'));
 try{const path=join(folder,'rows.bin'),bytes=Uint8Array.from({length:16384},(_,i)=>i%251);await writeFile(path,bytes);
  const blob=await host.openLocalBlob(path,bytes.length);assert.ok(blob instanceof Blob);assert.equal(blob.size,bytes.length);assert.deepEqual(new Uint8Array(await blob.slice(8192,16384).arrayBuffer()),bytes.subarray(8192));
  await assert.rejects(host.openLocalBlob(path,bytes.length+1),/size/);
 }finally{await rm(folder,{recursive:true,force:true});}
});

async function sourceFixture(){
 assert.equal(typeof host?.verifySourceRecords,'function','parent-record byte verifier missing');
 assert.equal(host.NODE_SOURCE_PATHS.length,15,'exact Node source closure required');
 const root=await mkdtemp(join(tmpdir(),'text-sdk-source-')),executionSourceSha='a'.repeat(40),records=[];
 for(const [index,path] of host.NODE_SOURCE_PATHS.entries()){
  const bytes=Buffer.from('small-source-fixture-'+index+'\n');await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);
  records.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),executionSourceSha});
 }
 return{root,executionSourceSha,records};
}
test('Node byte verifier requires the exact parent-record closure and rehashes actual files',async()=>{
 const fixture=await sourceFixture();
 try{
  const verified=await host.verifySourceRecords(fixture.root,fixture.executionSourceSha,fixture.records);
  assert.deepEqual(verified.map(row=>row.path),host.NODE_SOURCE_PATHS);
  for(const records of [undefined,fixture.records.slice(1),[...fixture.records.slice(0,-1),fixture.records[0]],[...fixture.records.slice(0,-1),{...fixture.records.at(-1),path:'unexpected.mjs'}]])await assert.rejects(host.verifySourceRecords(fixture.root,fixture.executionSourceSha,records));
  for(const change of [{bytes:0},{bytes:fixture.records[0].bytes+1},{sha256:'invalid'},{sha256:'0'.repeat(64)},{executionSourceSha:'b'.repeat(40)}]){
   const records=fixture.records.map(row=>({...row}));Object.assign(records[0],change);await assert.rejects(host.verifySourceRecords(fixture.root,fixture.executionSourceSha,records));
  }
  await assert.rejects(host.verifySourceRecords(fixture.root,'a'.repeat(39),fixture.records));
  const path=join(fixture.root,fixture.records[0].path),changed=await readFile(path);changed[0]^=1;await writeFile(path,changed);
  await assert.rejects(host.verifySourceRecords(fixture.root,fixture.executionSourceSha,fixture.records),/hash|bytes/);
 }finally{await rm(fixture.root,{recursive:true,force:true});}
});
test('direct host requires parent source records before opening model assets or running jobs',async()=>{
 assert.equal(typeof host?.verifySourceRecords,'function','parent-record byte verifier missing');
 const output=await mkdtemp(join(tmpdir(),'text-sdk-no-records-'));
 try{
  const root=new URL('../../../',import.meta.url).pathname;
  const report=await host.runNodeSdkHost({root,output,inputs:[input],executionSourceSha:'a'.repeat(40),bundle:'missing-bundle',source:'missing-model',preflightOnly:true});
  assert.equal(report.passed,false);assert.equal(report.cases.length,0);assert.match(report.failure.message,/source records|source closure/i);assert.equal(report.sourceVerification.nodeCommitVerification,false);
 }finally{await rm(output,{recursive:true,force:true});}
 const source=await readFile(new URL('./node_sdk_host.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/node:child_process|execFileSync|spawn\(/);
});

const SOURCE_TAIL_OFFSET=2**32,SOURCE_BYTES=SOURCE_TAIL_OFFSET+8192,FIXED_SOURCE_TIME=1234567890;
async function writeSparseSource(path,tail){
 let handle;
 try{
  handle=await open(path,'w+',0o600);await handle.truncate(SOURCE_BYTES);
  const written=await handle.write(tail,0,tail.length,SOURCE_TAIL_OFFSET);assert.equal(written.bytesWritten,tail.length);
 }finally{await handle?.close();}
 await utimes(path,FIXED_SOURCE_TIME,FIXED_SOURCE_TIME);await chmod(path,0o400);
 const identity=await stat(path,{bigint:true});assert.equal(identity.size,BigInt(SOURCE_BYTES));assert.ok(identity.blocks*512n<1024n*1024n,'source fixture must stay sparse below1MiB physical allocation');return identity;
}
async function sparseSourceFixture(){
 const root=await mkdtemp(join(tmpdir(),'text-sdk-sparse-source-')),path=join(root,'source.safetensors'),tail=Uint8Array.from({length:8192},(_,i)=>(i*37+11)%251);
 try{return{root,path,tail,identity:await writeSparseSource(path,tail)};}catch(error){await rm(root,{recursive:true,force:true});throw error;}
}
test('positional source preserves 64-bit size and reads only a bounded row above4GiB',async()=>{
 assert.equal(typeof host?.openPositionalSource,'function','64-bit positional source adapter missing');
 const fixture=await sparseSourceFixture();let source;
 try{
  source=await host.openPositionalSource(fixture.path,SOURCE_BYTES);
  assert.equal(source.size,SOURCE_BYTES);assert.equal(source.storage,'bounded positional file source');assert.equal(source.maximumSliceBytes,8192);
  assert.equal(typeof source.arrayBuffer,'undefined','whole-model reads must not be exposed');
  assert.equal(source.statIdentity.size,String(SOURCE_BYTES));assert.ok(Object.values(source.statIdentity).every(value=>typeof value==='string'));
  const row=source.slice(SOURCE_TAIL_OFFSET,SOURCE_BYTES);assert.equal(row.size,8192);const bytes=await row.arrayBuffer();assert.ok(bytes instanceof ArrayBuffer);assert.equal(bytes.byteLength,8192);assert.deepEqual(new Uint8Array(bytes),fixture.tail);
  assert.deepEqual(new Uint8Array(await source.slice(0,16).arrayBuffer()),new Uint8Array(16));assert.equal((await source.slice(SOURCE_BYTES,SOURCE_BYTES).arrayBuffer()).byteLength,0);
  for(const range of [[0,SOURCE_BYTES],[-1,0],[0,-1],[2,1],[0,8193],[SOURCE_BYTES,SOURCE_BYTES+1],[NaN,1],[0,Infinity],[.5,1],[0,Number.MAX_SAFE_INTEGER+1],[false,1],[]])assert.throws(()=>source.slice(...range),undefined,'invalid/unbounded source range '+range);
  await assert.rejects(host.openPositionalSource(fixture.path,SOURCE_BYTES-1),/size|bytes/i);
 }finally{await source?.close();await rm(fixture.root,{recursive:true,force:true});}
});
test('positional source detects mtime changes and same-size same-mtime inode replacement',async()=>{
 assert.equal(typeof host?.openPositionalSource,'function','64-bit positional source adapter missing');
 for(const change of ['mtime','inode']){
  const fixture=await sparseSourceFixture();let source;
  try{
   source=await host.openPositionalSource(fixture.path,SOURCE_BYTES);const pending=source.slice(SOURCE_TAIL_OFFSET,SOURCE_BYTES);
   if(change==='mtime')await utimes(fixture.path,FIXED_SOURCE_TIME+2,FIXED_SOURCE_TIME+2);
   else{
    await rename(fixture.path,fixture.path+'.old');const replacement=await writeSparseSource(fixture.path,fixture.tail);
    assert.equal(replacement.size,fixture.identity.size);assert.equal(replacement.mtimeNs,fixture.identity.mtimeNs);assert.equal(replacement.dev,fixture.identity.dev);assert.notEqual(replacement.ino,fixture.identity.ino);
   }
   await assert.rejects(pending.arrayBuffer(),/changed|identity|modified|stat/i);
  }finally{await source?.close();await rm(fixture.root,{recursive:true,force:true});}
 }
});
test('positional source close is idempotent and invalidates old and future slices',async()=>{
 assert.equal(typeof host?.openPositionalSource,'function','64-bit positional source adapter missing');
 const fixture=await sparseSourceFixture();let source;
 try{
  source=await host.openPositionalSource(fixture.path,SOURCE_BYTES);const pending=source.slice(SOURCE_TAIL_OFFSET,SOURCE_BYTES);
  await source.close();await source.close();await assert.rejects(pending.arrayBuffer(),/closed/i);
  await assert.rejects(async()=>source.slice(SOURCE_TAIL_OFFSET,SOURCE_BYTES).arrayBuffer(),/closed/i);
 }finally{await source?.close();await rm(fixture.root,{recursive:true,force:true});}
});

async function graphFixture(length=8193){
 const root=await mkdtemp(join(tmpdir(),'text-sdk-graph-')),path=join(root,'block.onnx'),bytes=Uint8Array.from({length},(_,i)=>(i*13+5)%251);
 await writeFile(path,bytes);await utimes(path,FIXED_SOURCE_TIME,FIXED_SOURCE_TIME);return{root,path,bytes};
}
async function graphFds(path){
 const result=[];for(const name of await readdir('/proc/self/fd'))try{if(await readlink('/proc/self/fd/'+name)===path)result.push(name);}catch(error){if(error.code!=='ENOENT')throw error;}return result;
}
async function readPrototype(path){const handle=await open(path,'r');try{return Object.getPrototypeOf(handle);}finally{await handle.close();}}
test('prepared graph reads exact independent ranges using bounded single-array positional reads',async()=>{
 assert.equal(typeof host?.openPreparedGraph,'function','prepared graph reader missing');
 const fixture=await graphFixture(8*1024*1024+17);let graph;
 try{
  graph=await host.openPreparedGraph(fixture.path,fixture.bytes.length);assert.equal((await graphFds(fixture.path)).length,1);
  assert.equal(graph.size,fixture.bytes.length);assert.equal(graph.storage,'single-array positional prepared graph');assert.equal(graph.chunkBytes,8*1024*1024);
  assert.ok(Object.values(graph.statIdentity).every(value=>typeof value==='string'));
  const whole=await graph.slice().arrayBuffer();assert.ok(whole instanceof ArrayBuffer);assert.equal(whole.byteLength,fixture.bytes.length);assert.deepEqual(new Uint8Array(whole),fixture.bytes);
  const range=await graph.slice(8191,8200).arrayBuffer();assert.deepEqual([...new Uint8Array(range)],[64,77,90,103,116,129,142,155,168]);
  new Uint8Array(whole)[8191]^=1;assert.equal(new Uint8Array(range)[0],64,'separate reads must own their backing buffers');
  assert.equal((await graph.slice(graph.size,graph.size).arrayBuffer()).byteLength,0);
  assert.equal(graph.stats().readCalls,3);assert.equal(graph.stats().readBytes,fixture.bytes.length+9);assert.equal(graph.stats().maximumReadBytes,8*1024*1024);
 }finally{await graph?.close();assert.equal((await graphFds(fixture.path)).length,0);await rm(fixture.root,{recursive:true,force:true});}
});
test('prepared graph rejects unsafe ranges and oversized or mismatched files without leaking descriptors',async()=>{
 assert.equal(typeof host?.openPreparedGraph,'function','prepared graph reader missing');
 const fixture=await graphFixture();let graph;
 try{
  for(const size of [0,-1,1.5,NaN,Infinity,true,2**30,Number.MAX_SAFE_INTEGER+1])await assert.rejects(host.openPreparedGraph(fixture.path,size),/size|bytes|1GiB/i);
  await assert.rejects(host.openPreparedGraph(fixture.path,fixture.bytes.length+1),/size|bytes/i);assert.equal((await graphFds(fixture.path)).length,0);
  graph=await host.openPreparedGraph(fixture.path,fixture.bytes.length);
  for(const range of [[-1,0],[0,-1],[2,1],[0,fixture.bytes.length+1],[NaN,1],[0,Infinity],[.5,1],[false,1]])assert.throws(()=>graph.slice(...range),/range|slice/i);
 }finally{await graph?.close();await rm(fixture.root,{recursive:true,force:true});}
});
test('prepared graph detects stat changes both before and after actual reads',async t=>{
 assert.equal(typeof host?.openPreparedGraph,'function','prepared graph reader missing');
 for(const change of ['mtime','inode','during-read'])await t.test(change,async t=>{
  const fixture=await graphFixture();let graph;
  try{
   graph=await host.openPreparedGraph(fixture.path,fixture.bytes.length);const range=graph.slice(0,16);
   if(change==='mtime')await utimes(fixture.path,FIXED_SOURCE_TIME+2,FIXED_SOURCE_TIME+2);
   else if(change==='inode'){
    await rename(fixture.path,fixture.path+'.old');await writeFile(fixture.path,fixture.bytes);await utimes(fixture.path,FIXED_SOURCE_TIME,FIXED_SOURCE_TIME);
   }else{
    const prototype=await readPrototype(fixture.path),real=prototype.read;
    t.mock.method(prototype,'read',async function(...args){const result=await real.apply(this,args);await utimes(fixture.path,FIXED_SOURCE_TIME+2,FIXED_SOURCE_TIME+2);return result;});
   }
   await assert.rejects(range.arrayBuffer(),/changed|identity|stat/i);
  }finally{t.mock.restoreAll();await graph?.close();await rm(fixture.root,{recursive:true,force:true});}
 });
});
test('prepared graph completes short reads and closes after read errors and pending disposal',async t=>{
 assert.equal(typeof host?.openPreparedGraph,'function','prepared graph reader missing');
 for(const behavior of ['short-read','zero-read','read-error','close-pending'])await t.test(behavior,async t=>{
  const fixture=await graphFixture();let graph,release;
  try{
   graph=await host.openPreparedGraph(fixture.path,fixture.bytes.length);
   const prototype=await readPrototype(fixture.path),real=prototype.read;
   if(behavior==='short-read'){
    t.mock.method(prototype,'read',function(buffer,offset,length,position){return real.call(this,buffer,offset,Math.min(length,257),position);});
    assert.deepEqual(new Uint8Array(await graph.slice().arrayBuffer()),fixture.bytes);assert.equal(graph.stats().readCalls,32);assert.equal(graph.stats().readBytes,8193);
   }else if(behavior==='zero-read'){
    t.mock.method(prototype,'read',async buffer=>({bytesRead:0,buffer}));await assert.rejects(graph.slice().arrayBuffer(),/short positional read/i);
   }else if(behavior==='read-error'){
    t.mock.method(prototype,'read',async()=>{throw Error('injected positional read failure');});await assert.rejects(graph.slice().arrayBuffer(),/injected positional read failure/);
   }else{
    let entered;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    t.mock.method(prototype,'read',async function(...args){entered();await gate;return real.apply(this,args);});
    const saved=graph.slice(),pending=saved.arrayBuffer();await started;let closed=false;const closing=graph.close().then(()=>{closed=true;});
    await Promise.resolve();assert.equal(closed,false,'close must wait for its pending read');release();await assert.rejects(pending,/closed/i);await closing;
    await assert.rejects(saved.arrayBuffer(),/closed/i);assert.throws(()=>graph.slice(),/closed/i);
   }
   await graph.close();await graph.close();assert.equal(graph.stats().closed,true);assert.equal((await graphFds(fixture.path)).length,0);
  }finally{release?.();t.mock.restoreAll();await graph?.close();await rm(fixture.root,{recursive:true,force:true});}
 });
});
test('host closes every opened prepared graph when later asset setup fails before NN',async()=>{
 const root=new URL('../../../',import.meta.url).pathname,folder=await mkdtemp(join(tmpdir(),'text-sdk-setup-failure-')),bundle=join(folder,'bundle'),output=join(folder,'output');
 await mkdir(bundle);await mkdir(output);
 const local=structuredClone(manifest);local.blocks=local.blocks.map(record=>({...record,bytes:5,sha256:'0'.repeat(64)}));
 const raw=Buffer.from(JSON.stringify(local)),executionSourceSha='a'.repeat(40),sourceRecords=[];
 for(const path of host.NODE_SOURCE_PATHS){const bytes=await readFile(join(root,path));sourceRecords.push({path,bytes:bytes.byteLength,sha256:createHash('sha256').update(bytes).digest('hex'),executionSourceSha});}
 const paths=local.blocks.slice(0,2).map(record=>join(bundle,record.path));
 try{
  await writeFile(join(bundle,'manifest.json'),raw);for(const path of paths)await writeFile(path,Uint8Array.of(4,3,2,1,0));
  const report=await host.runNodeSdkHost({root,output,inputs:[input],executionSourceSha,sourceRecords,bundle,source:'unopened-source',manifest:local,manifestSha256:createHash('sha256').update(raw).digest('hex'),preflightOnly:true});
  assert.equal(report.passed,false);assert.equal(report.cases.length,0);assert.match(report.failure.message,/ENOENT/);assert.equal(report.preparedGraphs.length,2);
  for(const graph of report.preparedGraphs){assert.equal(graph.storage,'single-array positional prepared graph');assert.equal(graph.readObservation.closed,true);assert.equal(graph.readObservation.readBytes,0);}
  for(const path of paths)assert.equal((await graphFds(path)).length,0);
 }finally{await rm(folder,{recursive:true,force:true});}
});

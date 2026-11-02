// NN0: real public factory and tensor codec; the job is a lifecycle double.
// No model/runtime job is imported or executed by this test module.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
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

/** Development ingress probe only. No model factory, NN, packet rewrite or re-export. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,relative} from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));
const exec=promisify(execFile);
const git=async args=>(await exec('git',args,{cwd:root,maxBuffer:1024*1024,encoding:'utf8'})).stdout;
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert(['--packet','--runtime-source','--output','--expected-packet-sha'].includes(args[i])&&args[i+1]&&!Object.hasOwn(options,args[i]),'Unique declared flag/value required');options[args[i]]=args[i+1];}
for(const key of ['--packet','--runtime-source','--output'])assert(options[key],key+' required');
assert(/^[0-9a-f]{40}$/.test(options['--runtime-source']),'Full fixed runtime commit required');
const output=resolve(options['--output']);
try{await stat(output);throw Error('Existing receipt cannot be overwritten');}catch(error){if(error.code!=='ENOENT')throw error;}
const digest=data=>createHash('sha256').update(data).digest('hex');
const file=resolve(options['--packet']),packet=await readFile(file);
assert(packet.length<=10*1024*1024,'Bounded P4 packet probe only');
if(options['--expected-packet-sha'])assert.equal(digest(packet),options['--expected-packet-sha'],'Diagnostic packet identity mismatch');
const buildPath='docs/shared/diffusion-models/api/build-info.mjs';
assert.deepEqual(await readFile(resolve(root,buildPath)),Buffer.from(await git(['show',options['--runtime-source']+':'+buildPath])));
const {BUILD_ID,BUILD_SOURCES}=await import('../../docs/shared/diffusion-models/api/build-info.mjs');
const sources=[];
for(const [name,sha256] of Object.entries(BUILD_SOURCES)){
 const path=fileURLToPath(new URL(name,new URL('../../docs/shared/diffusion-models/api/build-info.mjs',import.meta.url))),raw=await readFile(path);
 assert.equal(digest(raw),sha256,'Runtime source differs from the fixed build: '+name);
 sources.push({path:relative(root,path),bytes:raw.length,sha256});
}
const before={fetch:globalThis.fetch,instantiate:WebAssembly.instantiate,instantiateStreaming:WebAssembly.instantiateStreaming,Instance:WebAssembly.Instance};
let fetchAttempts=0,wasmAttempts=0,receipt;
globalThis.fetch=async()=>{fetchAttempts++;throw Error('No network/model fetch in ingress probe');};
const noWasm=()=>{wasmAttempts++;throw Error('No WASM execution in ingress probe');};
WebAssembly.instantiate=noWasm;WebAssembly.instantiateStreaming=noWasm;
WebAssembly.Instance=new Proxy(before.Instance,{construct:noWasm});
try{
 const {decodeTensor}=await import('../../docs/shared/inference/tensor.mjs');
 const {snapshotNormalP4Inputs}=await import('../../docs/shared/diffusion-models/execution/p4.mjs');
 const {checkExecutionSupport,P4_INPUT_SEMANTICS}=await import('../../docs/shared/diffusion-models/execution/capabilities.mjs');
 const {BASE_MODEL_HASHES}=await import('../../docs/shared/diffusion-models/lora/weights.mjs');
 const tensor=await decodeTensor(packet),marker='umt5-final-rmsnorm-f32-v1';
 assert.equal(tensor.normalization,marker,'The actual packet must already carry the canonical marker');
 const bytes=x=>Buffer.from(x.buffer,x.byteOffset,x.byteLength),payloadBefore=Buffer.from(bytes(tensor.data)),maskBefore=Buffer.from(bytes(tensor.attentionMask));
 const model={side:'LOW',modelSha256:BASE_MODEL_HASHES.LOW};
 const request={operation:'postSelfAttention',model,blockIndex:0,contextLatents:[],inputs:{
  residual:{...P4_INPUT_SEMANTICS.residual,data:new Float32Array(10240)},
  timeAct1:{...P4_INPUT_SEMANTICS.timeAct1,data:new Float32Array(5120)},conditioning:tensor
 }};
 const support=checkExecutionSupport(request);assert.equal(support.supported,true,JSON.stringify(support.reasons));
 const snapshot=snapshotNormalP4Inputs(request,model);
 assert.equal(snapshot.conditioning.metadata.nativeTensorMetadata.normalization,marker);
 assert.deepEqual(snapshot.conditioning.shape,tensor.shape);
 assert.deepEqual(bytes(snapshot.conditioning.data),payloadBefore);
 assert.deepEqual(bytes(snapshot.conditioning.attentionMask),maskBefore);
 assert.notEqual(snapshot.conditioning.data.buffer,tensor.data.buffer);
 assert.notEqual(snapshot.conditioning.attentionMask.buffer,tensor.attentionMask.buffer);
 const controller=new AbortController();controller.abort();
 assert.throws(()=>snapshotNormalP4Inputs(request,model,{signal:controller.signal}),{name:'AbortError'});
 const bad={...request,inputs:{...request.inputs,conditioning:{...tensor,normalization:'none'}}};
 assert.equal(checkExecutionSupport(bad).supported,false);assert.throws(()=>snapshotNormalP4Inputs(bad,model));
 assert.deepEqual(bytes(tensor.data),payloadBefore);assert.deepEqual(bytes(tensor.attentionMask),maskBefore);assert.equal(tensor.normalization,marker);
 assert.deepEqual(await readFile(file),packet,'Producer packet changed during the probe');
 assert.equal(fetchAttempts,0);assert.equal(wasmAttempts,0);
 receipt={schemaVersion:'diffusion-p4-canonical-text-ingress-probe/1',passed:true,recordedAtUTC:new Date().toISOString(),runtimeSourceCommit:options['--runtime-source'],buildId:BUILD_ID,
  driver:{path:relative(root,fileURLToPath(import.meta.url)),sha256:digest(await readFile(fileURLToPath(import.meta.url))),repositoryHeadAtExecution:(await git(['rev-parse','HEAD'])).trim()},sources,
  packet:{path:file,bytes:packet.length,sha256:digest(packet)},tensor:{dtype:tensor.dtype,shape:tensor.shape,layout:tensor.layout,meaning:tensor.meaning,normalization:tensor.normalization,modelSha256:tensor.modelSha256,tokenizerSha256:tensor.tokenizerSha256,payloadBytes:tensor.data.byteLength,payloadSHA256:digest(payloadBefore),maskBytes:tensor.attentionMask.byteLength,maskSHA256:digest(maskBefore),activeMaskPositions:maskBefore.reduce((sum,x)=>sum+x,0)},
  checks:{canonicalMarkerAccepted:true,canonicalMarkerPreserved:true,allRowsAndPayloadBytesEqual:true,maskBytesEqual:true,independentOwnedSnapshot:true,callerPreserved:true,preAbortedSnapshotRejected:true,wrongMarkerRejected:true,packetFileUnchanged:true},
  scope:{kind:'normal P4 metadata and owned ingress snapshot only',residualAndTime:'Synthetic zero fixtures for admission only; not production hidden/time inputs',modelFactoryConstructed:false,p4RunInvoked:false,normalizationOperationInvoked:false,packetRewritten:false,packetReencoded:false,newNeuralRuns:0,wasmInstantiationAttempts:wasmAttempts,networkAttempts:fetchAttempts,numericalP4Accepted:false,managementExecutionAccepted:false,originalInputReplaced:false,generationReady:false}};
}finally{globalThis.fetch=before.fetch;WebAssembly.instantiate=before.instantiate;WebAssembly.instantiateStreaming=before.instantiateStreaming;WebAssembly.Instance=before.Instance;}
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,receipt:output,packetSHA256:receipt.packet.sha256,newNeuralRuns:0}));

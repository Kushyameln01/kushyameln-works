/** File-backed Node reference host for the normal Text factory and tensor codec.
 * Browser Worker ownership/cancellation and numerical reference comparisons are
 * separate acceptance work. Importing this module never executes a model job.
 */
import {openAsBlob,readFileSync} from 'node:fs';
import {readFile,writeFile,rename,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateTextEncoderInput} from '../../../docs/shared/inference/text-encoder-api.mjs';
import {inspectTextEncoderManifest} from '../../../docs/shared/inference/text-encoder.mjs';

const check=(ok,message)=>{if(!ok)throw Error(message);};
const equal=(a,b)=>{if(!a||!b||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(parent,path)=>{const rel=relative(parent,path);return rel===''||rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);};
const absent=async path=>{try{await stat(path);}catch(error){if(error.code==='ENOENT')return;throw error;}throw Error('Fresh output required: '+path);};

export async function openLocalBlob(path,expectedBytes){
 check(Number.isSafeInteger(expectedBytes)&&expectedBytes>0,'Expected local asset size required');
 const blob=await openAsBlob(path);check(blob.size===expectedBytes,'Local file size mismatch: '+path);return blob;
}

export function validateCaseRecord(record){
 check(record&&typeof record.id==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(record.id),'Safe case ID required');
 check(record.byteGraph===undefined,'Node SDK host accepts File-backed cases only; byteGraph requires separate browser acceptance');
 const input=validateTextEncoderInput(record.input),frozen=validateTextEncoderInput({tokenIds:record.tokenIds,attentionMask:record.attentionMask});
 const length=input.text!==undefined?512:input.tokenIds.length;
 check(JSON.stringify(record.shape)===JSON.stringify([1,length,4096]),'Frozen native case shape mismatch');
 check(frozen.tokenIds.length===length,'Frozen native token length mismatch');
 if(input.text===undefined)check(equal(input.tokenIds,frozen.tokenIds)&&equal(input.attentionMask,frozen.attentionMask),'Frozen ID input mismatch');
 return input;
}

// This client owns serial reference jobs, not browser Workers. Cancellation is
// cooperative and keeps the client busy until the shared job releases resources.
export function createReferenceClient(runJob,{ort,hike,onProgress=()=>{}}={}){
 check(typeof runJob==='function','Shared Text job function required');
 let disposed=false,current=null,revision=0,state={status:'idle',inputRevision:0};
 return{
  get state(){return{...state};},
  async run(request){
   if(disposed)throw Error('Node reference client disposed');if(current)throw Error('Node reference client busy');
   if(request?.module!=='text_encoder'||request.operation!=='encode')throw TypeError('Node reference client supports Text encode only');
   const job={controller:new AbortController(),revision:++revision};current=job;
   state={status:'running',module:'text_encoder',operation:'encode',inputRevision:revision,progress:null,error:null};
   try{
    const result=await runJob({input:request.input,manifest:request.manifest,files:request.files,ort,hike,signal:job.controller.signal,diagnostics:request.diagnostics===true,onProgress:progress=>{
     if(current!==job||disposed||job.controller.signal.aborted)return;state={...state,progress};onProgress(progress,{...state});
    }});
    if(disposed||job.controller.signal.aborted)throw job.controller.signal.reason??new DOMException('Node reference job cancelled','AbortError');
    state={...state,status:'success',progress:null};return result;
   }catch(error){
    if(!disposed&&!job.controller.signal.aborted)state={...state,status:'error',progress:null,error:String(error.message??error)};
    throw error;
   }finally{if(current===job)current=null;}
  },
  cancel(){if(!current)return;current.controller.abort(new DOMException('Node reference job cancelled','AbortError'));state={...state,status:'cancelled',progress:null};},
  dispose(){disposed=true;if(current)current.controller.abort(new DOMException('Node reference client disposed','AbortError'));state={...state,status:'disposed',progress:null};}
 };
}

export function verifyCaseOutput(output,record,manifest,capabilities,{diagnostics=false}={}){
 const tensor=output?.tensor,expected=capabilities.output;
 check(tensor&&tensor.dtype===expected.dtype&&tensor.layout===expected.layout&&tensor.meaning===expected.meaning&&JSON.stringify(tensor.shape)===JSON.stringify(record.shape),'Native tensor contract mismatch');
 check(tensor.normalization===expected.normalization,'Native normalization contract mismatch');
 check(tensor.modelSha256===manifest.modelSha256&&tensor.tokenizerSha256===capabilities.tokenizerSha256,'Native model/tokenizer identity mismatch');
 check(tensor.attentionMask&&equal(tensor.attentionMask,record.attentionMask)&&output.attentionMask&&equal(output.attentionMask,record.attentionMask),'Native attention mask mismatch');
 check(output.inputMode===(record.input.text!==undefined?'plain-text':'token-ids'),'Native input mode mismatch');
 check(tensor.data instanceof Float32Array&&tensor.data.length===record.shape[1]*4096,'Native values/shape mismatch');
 for(let i=0;i<tensor.data.length;i++){
  if(!Number.isFinite(tensor.data[i]))throw Error('Nonfinite native tensor value');
  if(record.attentionMask[Math.floor(i/4096)]===0&&tensor.data[i]!==0)throw Error('Native masked output must be exactly zero');
 }
 if(diagnostics){
  check(output.evidence?.hikeContributed===true&&output.evidence.hikeOperation===capabilities.finalNormalization.operation,'Requested real Hike diagnostic evidence missing');
 }else check(!Object.hasOwn(output,'evidence'),'Unrequested diagnostic evidence present');
 return{dtype:tensor.dtype,shape:[...tensor.shape],layout:tensor.layout,meaning:tensor.meaning,normalization:tensor.normalization,modelSha256:tensor.modelSha256,tokenizerSha256:tensor.tokenizerSha256,attentionMask:Array.from(tensor.attentionMask),elements:tensor.data.length,finite:true,paddingExactlyZero:true};
}

export const NODE_SOURCE_PATHS=Object.freeze(['tools/inference/text-encoder/node_sdk_host.mjs','tools/inference/text-encoder/node_resource_guard.cjs','docs/shared/inference/text-encoder-api.mjs','docs/shared/inference/client.mjs','docs/shared/inference/text-job.mjs','docs/shared/inference/text-encoder.mjs','docs/shared/inference/tokenizer.mjs','docs/shared/inference/vendor/sentencepiece.mjs','docs/shared/inference/tensor.mjs','docs/shared/inference/hike.mjs','docs/shared/inference/kernel/tensor.wasm','docs/shared/inference/vendor/ort.wasm.min.mjs','docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs','docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm','docs/shared/vr180/sha256.mjs']);

// The Python parent establishes commit identity with Git. These supplied rows
// are a diagnostic input to Node, not independent evidence of commit authority.
// Node independently rereads every required file and checks its current bytes.
export async function verifySourceRecords(root,executionSourceSha,sourceRecords){
 check(typeof executionSourceSha==='string'&&/^[0-9a-f]{40}$/.test(executionSourceSha),'Full parent execution source SHA required');
 check(Array.isArray(sourceRecords)&&sourceRecords.length===NODE_SOURCE_PATHS.length,'Parent source records must contain the exact required15-path source closure');
 const required=new Set(NODE_SOURCE_PATHS),recordsByPath=new Map();
 for(const row of sourceRecords){
  check(row&&typeof row==='object'&&!Array.isArray(row)&&required.has(row.path),'Unexpected parent source closure path');
  check(!recordsByPath.has(row.path),'Duplicate parent source closure path: '+row.path);
  check(Number.isSafeInteger(row.bytes)&&row.bytes>0&&typeof row.sha256==='string'&&/^[0-9a-f]{64}$/.test(row.sha256)&&row.executionSourceSha===executionSourceSha,'Invalid parent source record metadata: '+row.path);
  recordsByPath.set(row.path,row);
 }
 check(recordsByPath.size===required.size,'Missing parent source closure path');
 const verified=[];
 for(const path of NODE_SOURCE_PATHS){
  const row=recordsByPath.get(path),raw=await readFile(join(root,path)),actualHash=sha(raw);
  check(raw.byteLength===row.bytes&&actualHash===row.sha256,'Current source bytes/hash differ from parent source records: '+path);
  verified.push({path,bytes:raw.byteLength,sha256:actualHash,executionSourceSha});
 }
 return verified;
}

function observeOrt(ort){
 const counts={created:0,released:0,active:0,maximumActive:0,runCalls:0,tensorDisposeCalls:0};
 const realCreate=ort.InferenceSession.create,realDispose=ort.Tensor.prototype.dispose;
 check(typeof realCreate==='function'&&typeof realDispose==='function','Pinned ORT session/tensor APIs required');
 ort.InferenceSession.create=async function(...args){
  const session=await realCreate.apply(this,args);counts.created++;counts.active++;counts.maximumActive=Math.max(counts.maximumActive,counts.active);
  return{run(...feeds){counts.runCalls++;return session.run(...feeds);},async release(){await session.release();counts.released++;counts.active--;}};
 };
 ort.Tensor.prototype.dispose=function(...args){counts.tensorDisposeCalls++;return realDispose.apply(this,args);};
 return{counts,restore(){ort.InferenceSession.create=realCreate;ort.Tensor.prototype.dispose=realDispose;}};
}

export async function runNodeSdkHost(c){
 const root=resolve(c.root),output=resolve(c.output),receiptPath=join(output,'node-sdk-results.json');
 check((await stat(output)).isDirectory(),'Parent must create the private output directory');check(!inside(join(root,'docs'),output),'Public model output prohibited');await absent(receiptPath);await absent(receiptPath+'.tmp');
 const report={passed:false,scope:'Normal Text factory/shared job/tensor codec in a File-backed Node reference host; no browser Worker/T3 or independent numeric acceptance claim',host:'Node fs.openAsBlob reference host',executionSourceSha:c.executionSourceSha,diagnostics:c.diagnostics??false,cases:[],sourceClosure:[],sourceVerification:{method:'Parent Git verification plus Node current-byte verification',commitAuthority:'Supplied parent records; Node does not independently establish Git commit identity',nodeCommitVerification:false,nodeByteVerificationComplete:false},workersUsed:0,browserControlsExercised:false,newExports:0};
 let api,client,hike,observer,currentCase=null;
 const persist=async()=>{await writeFile(receiptPath+'.tmp',JSON.stringify(report,null,2)+'\n');await rename(receiptPath+'.tmp',receiptPath);};
 const started=performance.now();
 try{
  check(typeof report.diagnostics==='boolean','diagnostics must be boolean');
  check(Array.isArray(c.inputs)&&c.inputs.length>0,'Nonempty frozen inputs required');
  check(new Set(c.inputs.map(record=>record.id)).size===c.inputs.length,'Unique case IDs required');
  for(const record of c.inputs){validateCaseRecord(record);await absent(join(output,record.id+'.wktensor'));}
  check(resolve(root,NODE_SOURCE_PATHS[0])===fileURLToPath(import.meta.url),'Host path does not match the selected repository root');
  report.sourceClosure=await verifySourceRecords(root,c.executionSourceSha,c.sourceRecords);report.sourceVerification.nodeByteVerificationComplete=true;
  const manifestRaw=await readFile(join(c.bundle,'manifest.json')),manifest=JSON.parse(manifestRaw),manifestSha256=sha(manifestRaw);
  check(/^[0-9a-f]{64}$/.test(c.manifestSha256)&&manifestSha256===c.manifestSha256,'Selected manifest bytes/hash mismatch');check(isDeepStrictEqual(manifest,c.manifest),'Selected manifest content mismatch');
  inspectTextEncoderManifest(manifest);
  report.manifest={path:join(c.bundle,'manifest.json'),bytes:manifestRaw.byteLength,sha256:manifestSha256};
  for(const record of c.inputs){
   if(record.manifestSha256!==undefined)check(record.manifestSha256===manifestSha256,'Case manifest identity mismatch');
   if(record.modelSha256!==undefined)check(record.modelSha256===manifest.modelSha256,'Case model identity mismatch');
   if(record.tokenizerSha256!==undefined)check(record.tokenizerSha256===manifest.tokenizer.sha256,'Case tokenizer identity mismatch');
  }
  const files=new Map(),assets=[...manifest.blocks,manifest.finalNorm,manifest.embedding.rowHashes,manifest.tokenizer];
  for(const asset of assets){const path=asset.path??asset.file;check(typeof path==='string'&&!files.has(path),'Unique local asset paths required');files.set(path,await openLocalBlob(join(c.bundle,path),asset.bytes));}
  check(!files.has(manifest.embedding.sourceFile),'Original source path collides with a prepared asset');files.set(manifest.embedding.sourceFile,await openLocalBlob(c.source,manifest.embedding.sourceBytes));
  report.localFiles=[...files].map(([path,file])=>({path,bytes:file.size,storage:'native fs.openAsBlob; actual file-backed Blob'}));
  if(c.preflightOnly){report.passed=true;report.preflightOnly=true;report.newNeuralRuns=0;return report;}
  const runtime=join(root,'docs/shared/inference');
  const [{createTextEncoderModule},{runTextEncoderJob},{encodeTensor,decodeTensor},{createHike},{tokenizePlainText},ort]=await Promise.all(['text-encoder-api.mjs','text-job.mjs','tensor.mjs','hike.mjs','tokenizer.mjs','vendor/ort.wasm.min.mjs'].map(name=>import(pathToFileURL(join(runtime,name)).href)));
  // Freeze every plain input against the actual bundled tokenizer before NN.
  let tokenizerBytes;
  for(const record of c.inputs)if(record.input.text!==undefined){
   tokenizerBytes??=new Uint8Array(await files.get(manifest.tokenizer.path??manifest.tokenizer.file).arrayBuffer());
   const actual=await tokenizePlainText(record.input.text,tokenizerBytes);check(equal(actual.tokenIds,record.tokenIds)&&equal(actual.attentionMask,record.attentionMask),'Frozen Python/native tokenizer IDs or mask differ: '+record.id);
  }
  tokenizerBytes=null;
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths={mjs:pathToFileURL(join(runtime,'vendor/ort-wasm-simd-threaded.mjs')).href,wasm:pathToFileURL(join(runtime,'vendor/ort-wasm-simd-threaded.wasm')).href};
  const kernel=await readFile(join(runtime,'kernel/tensor.wasm'));check(sha(kernel)==='9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8','Pinned Hike identity mismatch');hike=await createHike(kernel);observer=observeOrt(ort);
  client=createReferenceClient(runTextEncoderJob,{ort,hike,onProgress:progress=>console.log(JSON.stringify({phase:'node-sdk-progress',id:currentCase,...progress}))});
  api=createTextEncoderModule({client});report.capabilities=api.configure({manifest,files,diagnostics:report.diagnostics});
  await persist();
  for(const record of c.inputs){
   currentCase=record.id;const caseStarted=performance.now(),before={...observer.counts},hikeBefore=hike.stats().calls;
   const support=api.capabilities({operation:'encode',input:record.input}).support;check(support.supported,'Configured native input is unsupported: '+record.id+' '+support.reason);
   const result=await api.encode(record.input),metadata=verifyCaseOutput(result,record,manifest,report.capabilities,{diagnostics:report.diagnostics});
   const bytes=await encodeTensor(result.tensor),restored=await decodeTensor(bytes);verifyCaseOutput({...result,tensor:restored},record,manifest,report.capabilities,{diagnostics:report.diagnostics});
   check(equal(restored.data,result.tensor.data),'Native codec roundtrip changed values');
   const counts=observer.counts,sessionObservation={created:counts.created-before.created,released:counts.released-before.released,runCalls:counts.runCalls-before.runCalls,tensorDisposeCalls:counts.tensorDisposeCalls-before.tensorDisposeCalls,active:counts.active,maximumActive:counts.maximumActive};
   check(sessionObservation.created===24&&sessionObservation.released===24&&sessionObservation.runCalls===24&&sessionObservation.tensorDisposeCalls===72&&sessionObservation.active===0&&sessionObservation.maximumActive===1,'Native Text session/tensor lifetime mismatch');
   check(hike.stats().calls-hikeBefore===1,'Actual final Hike operation count mismatch');
   const artifactPath=join(output,record.id+'.wktensor');await writeFile(artifactPath,bytes,{flag:'wx'});
   report.cases.push({id:record.id,passed:true,output:metadata,artifact:{path:record.id+'.wktensor',bytes:bytes.byteLength,sha256:sha(bytes)},codecRoundtrip:{passed:true,allValuesCompared:true,elements:restored.data.length},sessionObservation,...(report.diagnostics?{evidence:result.evidence}:{}),clientState:client.state,wallSeconds:(performance.now()-caseStarted)/1000});
   report.completedFullNeuralRuns=report.cases.length;report.sessionObservation={...counts};await persist();console.log(JSON.stringify({phase:'node-sdk-case-complete',id:record.id,artifact:record.id+'.wktensor',completed:report.cases.length,total:c.inputs.length}));
  }
  report.passed=true;
 }catch(error){report.passed=false;report.failure={name:error.name,message:error.message,caseId:currentCase,stack:error.stack};
 }finally{
  try{api?.dispose();if(!api)client?.dispose();hike?.dispose();observer?.restore();}catch(error){report.passed=false;report.cleanupFailure={name:error.name,message:error.message};}
  report.clientState=client?.state??null;report.wallSeconds=(performance.now()-started)/1000;report.peakRssBytes=process.resourceUsage().maxRSS*1024;await persist();
 }
 return report;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{const report=await runNodeSdkHost(JSON.parse(readFileSync(0,'utf8')));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;}
 catch(error){console.log(JSON.stringify({passed:false,failure:{name:error.name,message:error.message}}));process.exitCode=1;}
}

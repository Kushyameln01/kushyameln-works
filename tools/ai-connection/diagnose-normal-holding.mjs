#!/usr/bin/env node
/** Post-normal saved-output comparison only. No owner execution is imported. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),git=promisify(execFile),repo='Kushyameln01/kushyameln-works';
const pins={ownerComparator:{commit:'7ee36228030ba3bb544a90b1d4b528702a7bae32',path:'docs/shared/diffusion-models/diagnostics/self-attention-tail/common.mjs',sha256:'b2c0abad30840c7c31c9e4e4f13218cdaa5b64576ff139abe9bf589bfdf3834f'},codec:{commit:'498eb25f027666e3cc661a5851288e4aabf39f0a',path:'docs/shared/inference/tensor.mjs',sha256:'e200fef69be3909a13bc91a59743681df1072817eadc7c1865717afe0c3c9f8e'}};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),digest=x=>/^[a-f0-9]{64}$/.test(x??''),fail=(code,message)=>Object.assign(Error(message),{code});
function local(path,base){if(typeof path!=='string'||!path||/^[a-z]+:\/\//i.test(path))throw fail('DIAGNOSTIC_LOCAL_PATH_REQUIRED','Explicit local saved file path required');return resolve(base,path);}
function pointer(value,path){if(typeof path!=='string'||!path.startsWith('/'))throw fail('DIAGNOSTIC_POINTER_REQUIRED','Explicit existing JSON field pointer required');for(const part of path.slice(1).split('/')){const k=part.replace(/~1/g,'/').replace(/~0/g,'~');if(value===null||typeof value!=='object'||!Object.hasOwn(value,k))throw fail('DIAGNOSTIC_POINTER_MISSING','Existing JSON field absent: '+path);value=value[k];}return value;}
async function fixedModule(sourceGit,pin){
 let bytes;try{bytes=(await git('git',['-C',sourceGit,'show',pin.commit+':'+pin.path],{encoding:'buffer',maxBuffer:32*1024*1024})).stdout;}catch{throw fail('DIAGNOSTIC_SOURCE_UNAVAILABLE','Fixed owner source Git object unavailable: '+pin.commit+':'+pin.path);}
 if(sha(bytes)!==pin.sha256)throw fail('DIAGNOSTIC_SOURCE_MISMATCH','Fixed owner source bytes differ');
 return {module:await import('data:text/javascript;base64,'+bytes.toString('base64')),receipt:{sourceRef:{repository:repo,commit:pin.commit,path:pin.path},sha256:sha(bytes),byteLength:bytes.length}};
}
async function checkedFile(binding,base){
 if(!binding||!digest(binding.sha256))throw fail('DIAGNOSTIC_CONFIGURATION_INCOMPLETE','Existing saved file and expected whole SHA-256 required');
 const path=local(binding.path,base),bytes=await readFile(path),observed=sha(bytes);
 if(observed!==binding.sha256||binding.byteLength!==undefined&&binding.byteLength!==bytes.length)throw fail('DIAGNOSTIC_FILE_HASH_MISMATCH','Saved reference/gate differs from expected whole bytes: '+path);
 return {bytes,receipt:{path,sha256:observed,byteLength:bytes.length,...(binding.sourceRef?{declaredSourceRef:binding.sourceRef}:{})}};
}
export async function diagnoseNormalHolding({normalResult,configurationPath,sourceGit=ROOT,out}={}){
 if(!out)throw fail('DIAGNOSTIC_OUT_REQUIRED','Fresh separate diagnostic output directory required');
 await mkdir(out,{mode:0o700});let phase='admission';
 const result={schemaVersion:'works-normal-holding-diagnostic/0.1',dateJST:'2026-11-02',status:'NOT_VERIFIED',normalStatus:null,normalResultUnchanged:true,nativeCalls:0,workerCount:0,modelFileReads:0,newOracleRuns:0,generationReady:false};
 try{
  const runnerBytes=await readFile(fileURLToPath(import.meta.url));result.diagnosticRunner={path:'tools/ai-connection/diagnose-normal-holding.mjs',sha256:sha(runnerBytes),byteLength:runnerBytes.length};
  if(!normalResult||!configurationPath)throw fail('DIAGNOSTIC_PATHS_REQUIRED','Completed normal directory and separate diagnostic configuration required');
  const normalPath=join(resolve(normalResult),'result.json'),normalBytes=await readFile(normalPath),normal=JSON.parse(normalBytes);result.normalStatus=normal.status;
  result.normalResult={path:normalPath,sha256:sha(normalBytes),byteLength:normalBytes.length,managementCommit:normal.management?.commit??null,bootstrap:normal.bootstrap??null};
  if(normal.schemaVersion!=='works-normal-holding-run/0.1'||!['EXECUTION_COMPLETED','LIFECYCLE_VERIFIED'].includes(normal.status)||normal.normalExecution!==true||normal.diagnosticState!=='NOT_REQUESTED')throw fail('DIAGNOSTIC_NORMAL_NOT_COMPLETED','A separately completed ordinary normal result is required');
  const configPath=resolve(configurationPath),configBytes=await readFile(configPath),config=JSON.parse(configBytes),base=dirname(configPath),key=config.outputKey??'output';
  result.configuration={path:configPath,sha256:sha(configBytes),byteLength:configBytes.length,scope:'explicit selection of existing reference/gate and input cohort; no numerical proof required by normal execution'};
  if(config.kind!=='works-normal-holding-diagnostic/v1'||!config.reference||!config.gate||!config.inputPayloadSha256||!config.expectedInputFileSha256)throw fail('DIAGNOSTIC_CONFIGURATION_INCOMPLETE','Existing reference/gate mappings and exact normal input payload/whole-file SHA maps required');
  const expected=config.inputPayloadSha256,observed=Object.fromEntries(Object.entries(normal.inputReceipts??{}).map(([name,r])=>[name,r.payloadSha256]));
  if(!Object.keys(expected).length||JSON.stringify(Object.keys(expected).sort())!==JSON.stringify(Object.keys(observed).sort())||Object.entries(expected).some(([name,h])=>!digest(h)||observed[name]!==h))throw fail('DIAGNOSTIC_INPUT_COHORT_MISMATCH','Saved reference is declared for a different normal input payload cohort');
  result.inputPayloadSha256=observed;
  const expectedFiles=config.expectedInputFileSha256,observedFiles=Object.fromEntries(Object.entries(normal.inputReceipts??{}).map(([name,r])=>[name,r.sha256]));
  if(!Object.keys(expectedFiles).length||JSON.stringify(Object.keys(expectedFiles).sort())!==JSON.stringify(Object.keys(observedFiles).sort())||Object.entries(expectedFiles).some(([name,h])=>!digest(h)||observedFiles[name]!==h))throw fail('DIAGNOSTIC_INPUT_FILE_COHORT_MISMATCH','Saved reference is declared for different normal input file bytes, including file-contained metadata');
  result.inputFileSha256=observedFiles;result.inputFileCohortScope='Whole selected file bytes; metadata supplied outside the file remains caller-declared';
  if(!/^[A-Za-z0-9_-]+$/.test(key)||!digest(normal.outputs?.[key]?.sha256))throw fail('DIAGNOSTIC_OUTPUT_RECEIPT_REQUIRED','Actual normal output identity required');
  const outputPath=join(resolve(normalResult),key+'.wktensor'),outputBytes=await readFile(outputPath),binding=normal.outputs[key];
  if(sha(outputBytes)!==binding.sha256||outputBytes.length!==binding.byteLength)throw fail('DIAGNOSTIC_NORMAL_OUTPUT_CHANGED','Actual saved normal output differs from its completion receipt');
  result.output={path:outputPath,sha256:sha(outputBytes),byteLength:outputBytes.length};
  const codec=await fixedModule(sourceGit,pins.codec),owner=await fixedModule(sourceGit,pins.ownerComparator);result.codec=codec.receipt;result.ownerComparator=owner.receipt;
  const tensor=await codec.module.decodeTensor(outputBytes),payload=new Uint8Array(tensor.data.buffer,tensor.data.byteOffset,tensor.data.byteLength);
  if(tensor.dtype!=='float32'||!digest(binding.payloadSha256)||sha(payload)!==binding.payloadSha256||JSON.stringify(tensor.shape)!==JSON.stringify(binding.shape))throw fail('DIAGNOSTIC_NORMAL_OUTPUT_BINDING_MISMATCH','Actual output payload/shape differs from its normal receipt');
  result.output.payloadSha256=sha(payload);result.output.shape=tensor.shape;
  const reference=await checkedFile(config.reference,base);result.reference={...reference.receipt,kind:config.reference.kind,pointer:config.reference.pointer??null};let values,referenceShape=config.reference.shape;
  if(config.reference.kind==='wktensor'){const t=await codec.module.decodeTensor(reference.bytes);if(t.dtype!=='float32')throw fail('DIAGNOSTIC_REFERENCE_DTYPE','Existing F32 reference required');values=t.data;referenceShape=t.shape;}
  else if(config.reference.kind==='json-f32'){const a=pointer(JSON.parse(reference.bytes),config.reference.pointer);if(!Array.isArray(a)||!a.every(x=>typeof x==='number'))throw fail('DIAGNOSTIC_REFERENCE_ARRAY','Existing saved numeric array required');values=Float32Array.from(a);}
  else if(config.reference.kind==='f32-le'){if(reference.bytes.length%4||new Uint8Array(Uint32Array.of(0x01020304).buffer)[0]!==4)throw fail('DIAGNOSTIC_REFERENCE_ENCODING','Whole LE F32 saved reference required');values=new Float32Array(Uint8Array.from(reference.bytes).buffer);}
  else throw fail('DIAGNOSTIC_REFERENCE_KIND','Use existing wktensor, json-f32 or f32-le reference');
  if(referenceShape!==undefined&&JSON.stringify(referenceShape)!==JSON.stringify(tensor.shape))throw fail('DIAGNOSTIC_REFERENCE_SHAPE','Existing reference shape differs from normal output');
  const g=config.gate;if(!g.fieldMap?.abs||!['absolute-relative','absolute-only'].includes(g.mode)||g.mode==='absolute-relative'&&!g.fieldMap.rel||g.mode==='absolute-only'&&g.fieldMap.rel!==undefined)throw fail('DIAGNOSTIC_GATE_MAPPING_REQUIRED','Explicit existing absolute/relative pointers, or declared absolute-only gate, required');
  const gate=await checkedFile(g,base),json=JSON.parse(gate.bytes),limits={abs:pointer(json,g.fieldMap.abs),rel:g.mode==='absolute-only'?0:pointer(json,g.fieldMap.rel)};
  if(!Object.values(limits).every(x=>Number.isFinite(x)&&x>=0))throw fail('DIAGNOSTIC_GATE_INVALID','Existing finite nonnegative owner gate required');
  result.gate={...gate.receipt,mode:g.mode,fieldMap:g.fieldMap,values:limits};phase='compare';
  result.comparison=await owner.module.compare(tensor.data,values,limits);result.status='DIAGNOSTIC_PASS';
 }catch(error){result.status=phase==='compare'?'DIAGNOSTIC_FAIL':'NOT_VERIFIED';result.error={code:error.code??(phase==='compare'?'OWNER_COMPARISON_FAILED':'DIAGNOSTIC_NOT_VERIFIED'),message:String(error.message??error)};}
 await writeFile(join(out,'diagnostic.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});return result;
}
export const HOLDING_DIAGNOSTIC_HELP='Usage: node tools/ai-connection/diagnose-normal-holding.mjs --normal-result <completed holding directory> --configuration <existing-reference-and-gate.json> --out <fresh-diagnostic-directory> [--source-git <Git checkout>]\nSaved normal output only; no native rerun, graphs/models/Worker, new oracle, or normal result mutation. Missing/mismatched inputs return NOT_VERIFIED; owner comparison failure is separate from ordinary completion.';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(args.includes('--help'))console.log(HOLDING_DIAGNOSTIC_HELP);else{const v={},allowed=new Set(['normal-result','configuration','out','source-git']);for(let i=0;i<args.length;i++){const k=args[i].slice(2);if(!args[i].startsWith('--')||!allowed.has(k)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(v,k))throw fail('DIAGNOSTIC_ARGUMENT_INVALID','Unknown/duplicate/incomplete option: '+args[i]);v[k]=args[++i];}const r=await diagnoseNormalHolding({normalResult:v['normal-result'],configurationPath:v.configuration,out:v.out,sourceGit:v['source-git']});console.log(JSON.stringify({status:r.status,normalStatus:r.normalStatus,nativeCalls:0,normalResultUnchanged:true}));if(r.status==='DIAGNOSTIC_FAIL')process.exitCode=1;}}
 catch(error){console.error(JSON.stringify({code:error.code??null,message:String(error.message)}));process.exitCode=1;}
}

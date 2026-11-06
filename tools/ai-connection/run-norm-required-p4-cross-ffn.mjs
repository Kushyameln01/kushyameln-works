#!/usr/bin/env node
/** Holding-environment entry. No model/activation/reference download or oracle
 * generation is performed. The owner-case document is a management sidecar,
 * never a newly asserted native owner API or evidence of an actual Text PASS. */
import {readFile,writeFile,mkdir,stat,open,realpath} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,resolve,join,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalize,sha256Bytes} from '../../docs/shared/ai-connection/canonical.mjs';
import {loadReferenceSet} from '../../docs/shared/ai-connection/reference-loader.mjs';
import {evaluateEdge} from '../../docs/shared/ai-connection/compatibility.mjs';
import {createAdoptedWktensorCodec,verifyAdoptedWktensorSource,ADOPTED_WKTENSOR_DEPLOYMENT_PATH} from '../../docs/shared/ai-connection/codecs/wktensor.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),exec=promisify(execFile);
const SHA=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const same=(a,b)=>{try{return canonicalize(a)===canonicalize(b);}catch{return false;}},hash=bytes=>sha256Bytes(new Uint8Array(bytes));
const fail=(code,message)=>Object.assign(Error(message),{code});
const MODEL={HIGH:{bytes:15574833216,header:'d8aec897e3af480492d7eca7b57141ea968e89cde7f46ea7886db11754ebd6e3'},LOW:{bytes:15574833216,header:'286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b'}};
const TEXT={wholeSha256:'90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9',wholeByteLength:8390054,payloadSha256:'107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7',maskSha256:'19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62',modelSha256:'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68',tokenizerSha256:'e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458'};
const PARAMETER_MODULE='tools/diffusion-models/p4-cross-ffn-browser.py',PARAMETER_SHA='141ab992ec58f3b985e739ec00f79ec98b03d0bbfc4d1581bc4131a3c986707b';
const OWNER_CASE_SCHEMA='works-p4-owner-case/0.1';
const blocked=(compatibility,blockers,extra={})=>({status:'BLOCKED',compatibility,numericalState:'NOT_VERIFIED',runnable:false,nativeCalls:0,browserLaunched:false,actualNumericalAccepted:false,blockers,...extra});
const record=(code,message)=>({code,message});
const admission=(blockers,{unknown=false,rejected=false}={})=>blocked(unknown?'UNVERIFIED':null,blockers,{inputAdmission:{state:rejected?'REJECTED':'ADMITTED',scope:'management-sidecar-schema-only',nativeCompatibilityEvaluated:false}});
const fileState=s=>({size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,ino:s.ino,dev:s.dev});
/** Syntactic/context guard. It deliberately runs before source/private IO.
 * Missing evidence is not a known schema/shape conflict. */
export function inspectP4OwnerCase(ownerCase){
 if(ownerCase===undefined||ownerCase===null)return admission([record('OWNER_NUMERICAL_CASE_MISSING','Owner actual Text P4 prior PASS, independent references and gate have not been supplied')]);
 if(ownerCase.schemaVersion!==OWNER_CASE_SCHEMA||!['owner-provided-numerical-case','owner-provided-shape-reference'].includes(ownerCase.kind))return admission([record('P4_OWNER_CASE_SCHEMA_UNKNOWN','Unknown management sidecar schema/kind; no owner native schema is inferred')],{unknown:true,rejected:true});
 const {side,inputClass,textRows}=ownerCase;
 if(typeof side!=='string'||typeof inputClass!=='string'||!Number.isSafeInteger(textRows)||textRows<1||ownerCase.ownerProvided!==true)return admission([record('P4_OWNER_CASE_ADMISSION_INVALID','Owner-provided side/class/row fields are required in the management sidecar')],{rejected:true});
 if(inputClass==='explicit-fixture')return admission([record('P4_FIXTURE_CLI_UNSUPPORTED','The CLI accepts the fixed f76 packet; fixture boundary cases use the same-realm runner API')],{rejected:true});
 const conditioning=ownerCase.inputCohort?.conditioningBinding,saved=ownerCase.inputCohort?.savedInputBindings;
 if(conditioning&&(Object.hasOwn(conditioning,'inputClass')&&conditioning.inputClass!==inputClass||Object.hasOwn(conditioning,'rows')&&conditioning.rows!==textRows)||saved&&Object.hasOwn(saved,'side')&&saved.side!==side)return admission([record('P4_OWNER_CASE_REDUNDANT_FIELDS_CONFLICT','Sidecar envelope and inputCohort must describe the same supplied fields; native compatibility has not been evaluated')],{rejected:true});
 const missing=[];
 for(const field of ['inputCohort','norm','priorPass','references','gates','parameterProof','provenance','lineage'])if(!ownerCase[field])missing.push(record('P4_OWNER_CASE_FIELD_MISSING','Owner sidecar field missing: '+field));
 if(missing.length)return admission(missing);
 const spec=ownerCase.norm.validationSpec,modes=spec?.comparisonModes;
 if(!ownerCase.norm.numericRequirement||!spec||!Array.isArray(modes)||!modes.length||modes.some(mode=>!ownerCase.references[mode]))return admission([record('P4_OWNER_NUMERIC_PROOF_MISSING','Mode-bound independent reference identities and owner validation specification remain pending')]);
 if(!same(modes,['composed'])&&!same(modes,['local','composed']))return admission([record('P4_COMPARISON_MODE_UNSUPPORTED','Supported explicit scopes are composed25 or local+composed50')],{rejected:true});
 if(spec.comparisonCount!==25*modes.length||spec.count!==modes.length*(30720*textRows+198656)||spec.strictParameterChecks!==29)return admission([record('P4_VALIDATION_SPEC_UNSUPPORTED','Sidecar comparison count/extent must match its explicit modes and29 selected parameters')],{rejected:true});
 if(!ownerCase.priorPass.sourceRef||!ownerCase.priorPass.sha256||!ownerCase.priorPass.byteLength)return admission([record('P4_PRIOR_OWNER_PASS_MISSING','An actual owner prior P4 numerical PASS receipt has not been supplied')]);
 if(ownerCase.parameterProof.kind!=='owner-python-parameter-identities'||ownerCase.parameterProof.exportName!=='verify_parameter_identities'||ownerCase.parameterProof.sourceRef?.path!==PARAMETER_MODULE||ownerCase.parameterProof.sha256!==PARAMETER_SHA)return admission([record('P4_PARAMETER_CHECKER_UNVERIFIED','Only the fixed owner verify_parameter_identities function is supported')],{unknown:true,rejected:true});
 if(!ownerCase.priorPass.fieldMap||typeof ownerCase.priorPass.fieldMap!=='object')return admission([record('P4_PRIOR_PASS_FIELD_MAP_REQUIRED','Actual receipt JSON pointers are required; no owner receipt schema is invented')],{unknown:true,rejected:true});
 return {...admission([]),status:'PREFLIGHT_PENDING'};
}
function child(root,path){if(typeof path!=='string'||!path||path.startsWith('/')||path.includes('\\')||path.split('/').some(s=>!s||s==='.'||s==='..'))throw fail('P4_PATH_INVALID','Safe relative source/package path required');const file=resolve(root,path);if(!file.startsWith(resolve(root)+sep))throw fail('P4_PATH_INVALID','Path escaped root');return file;}
async function bytesAt(path,pin,code){const bytes=new Uint8Array(await readFile(path));if(pin.byteLength!==undefined&&pin.byteLength!==bytes.byteLength||!SHA.test(pin.sha256??'')||await hash(bytes)!==pin.sha256)throw fail(code,'Actual file bytes differ: '+path);return bytes;}
async function gitBytes(sourceGit,ref){if(!COMMIT.test(ref?.commit??''))throw fail('P4_SOURCE_GIT_IDENTITY_REQUIRED','Full immutable Git commit required');child(sourceGit,ref.path);try{return new Uint8Array((await exec('git',['-C',sourceGit,'show',ref.commit+':'+ref.path],{encoding:'buffer',maxBuffer:128*1024*1024})).stdout);}catch{throw fail('P4_SOURCE_GIT_UNAVAILABLE','Required exact public Git blob is unavailable: '+ref.commit+':'+ref.path);}}
function pointer(value,path){if(typeof path!=='string'||!path.startsWith('/'))throw fail('P4_RECEIPT_FIELD_MAP_INVALID','Explicit RFC6901 JSON pointer required');for(const part of path.slice(1).split('/')){const key=part.replace(/~1/g,'/').replace(/~0/g,'~');if(!value||typeof value!=='object'||!Object.hasOwn(value,key))throw fail('P4_RECEIPT_FIELD_MISSING','Owner receipt pointer is absent: '+path);value=value[key];}return value;}
/** Identity binding only. Gate values come from authenticated owner bytes;
 * this function never selects or relaxes a numerical tolerance. */
export function bindP4OwnerGate({numericGate,specGate,descriptor}={}){
 if(!numericGate?.sourceRef||!COMMIT.test(numericGate.sourceRef.commit??'')||!SHA.test(numericGate.sha256??'')||!Number.isSafeInteger(numericGate.byteLength)||numericGate.byteLength<1||!numericGate.gates)throw fail('P4_GATE_IDENTITY_REQUIRED','Explicit owner gate source/hash/extent and values required; no actualText gate default exists');
 if(!same(numericGate.sourceRef,descriptor?.sourceRef)||numericGate.sha256!==descriptor.sha256||numericGate.byteLength!==descriptor.byteLength||!same(numericGate.gates,specGate))throw fail('P4_GATE_MISMATCH','Owner case, validation specification and gate source identities differ');
 return structuredClone(numericGate.gates);
}
function validateBudget(value,rows){
 if(value===undefined)return null;
 const keys=['scope','textRows','maxElapsedMs','maxReturnedOutputBytes','maxHikeCapacityBytes','ortSharedMemoryCapacityBytes','maxRawWeightReadBytes','maxDecodedWeightTileBytes'];
 if(!value||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||value.scope!=='p4-n2-diagnostic-only'||value.textRows!==rows||keys.slice(2).some(k=>!Number.isSafeInteger(value[k])||value[k]<1)||value.maxElapsedMs>2147483647||value.maxReturnedOutputBytes<4*(30720*rows+198656)||value.maxRawWeightReadBytes>163840||value.maxDecodedWeightTileBytes>327680)throw fail('P4_DIAGNOSTIC_BUDGET_INVALID','Explicit P4 case-bound limits with all eight keys required; L4 budget does not authorize L512');
 return structuredClone(value);
}
function f32(values,elements){if(!Array.isArray(values)||values.length!==elements||values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw fail('P4_INPUT_PAYLOAD_INVALID','Finite exact-length saved F32 array required');const a=Float32Array.from(values);if(a.some(v=>!Number.isFinite(v)||Math.abs(v)>1e16))throw fail('P4_INPUT_PAYLOAD_INVALID','Saved input violates native range');return a;}
async function localPrivate(path,role,blockers,{pin,maxBytes=256*1024*1024}={}){
 if(!path){blockers.push(record('P4_PRIVATE_ASSET_MISSING','Explicit local path missing: '+role));return null;}
 if(!isAbsolute(path))throw fail('P4_PRIVATE_PATH_REQUIRED','Explicit absolute local path required: '+role);
 let s;try{s=await stat(path);}catch(error){if(error.code==='ENOENT'){blockers.push(record('P4_PRIVATE_ASSET_MISSING','Locally selected file absent: '+role));return null;}throw error;}
 if(!s.isFile()||s.size>maxBytes)throw fail('P4_PRIVATE_ASSET_INVALID','Bounded local file required: '+role);
 const bytes=new Uint8Array(await readFile(path)),sha256=await hash(bytes);
 if(pin&&(sha256!==pin.sha256||pin.byteLength!==undefined&&bytes.byteLength!==pin.byteLength))throw fail('P4_PRIVATE_HASH_MISMATCH','Actual local bytes differ: '+role);
 return {bytes,receipt:{role,sha256,byteLength:bytes.byteLength,fullBytesHashedThisRun:true}};
}
/** Transport only: source manifest describes exact little-endian F32 bits.
 * No oracle, arithmetic, parameter selection or new reference export occurs. */
export async function readP4BinaryReferenceArray({manifestPath,name,entry,spec,blockers=[],assetReceipts=[]}){
 const extent=spec.shape.reduce((n,d)=>n*d,1)*4;
 if(!entry||entry.path!==name+'.f32'||entry.dtype!=='float32'||!same(entry.shape,spec.shape)||entry.bytes!==extent||Object.hasOwn(entry,'byteOffset')||!SHA.test(entry.sha256??''))throw fail('P4_BINARY_REFERENCE_DESCRIPTOR_MISMATCH','Owner manifest array path/dtype/shape/whole-byte extent differs: '+name);
 const path=child(dirname(manifestPath),entry.path);
 const loaded=await localPrivate(path,'independent-P4-reference-array:'+name,blockers,{pin:{sha256:entry.sha256,byteLength:extent},maxBytes:extent});if(!loaded)return null;
 if(await realpath(path)!==path)throw fail('P4_BINARY_REFERENCE_PATH_INVALID','Owner binary array must be an explicit non-symlink sibling of its manifest');
 const view=new DataView(loaded.bytes.buffer,loaded.bytes.byteOffset,loaded.bytes.byteLength);for(let offset=0;offset<view.byteLength;offset+=4)if(!Number.isFinite(view.getFloat32(offset,true)))throw fail('P4_BINARY_REFERENCE_NONFINITE','Owner reference contains a nonfinite F32 value: '+name);
 assetReceipts.push(loaded.receipt);return {base64:Buffer.from(loaded.bytes).toString('base64'),sha256:loaded.receipt.sha256,byteLength:loaded.bytes.byteLength};
}
const referenceCohortPointers=['/side','/inputCohort/savedInputBindings/savedArtifactSHA256','/inputCohort/conditioningBinding/dataSHA256','/inputCohort/conditioningBinding/attentionMaskSHA256','/inputCohort/conditioningBinding/shape','/inputCohort/conditioningBinding/modelSha256','/inputCohort/conditioningBinding/tokenizerSha256','/inputCohort/conditioningBinding/producerExecution'];
function verifyReferenceCohort(json,descriptor,ownerCase){
 if(descriptor.inputBindingMap){
  if(referenceCohortPointers.some(path=>!Object.hasOwn(descriptor.inputBindingMap,path)))throw fail('P4_REFERENCE_INPUT_FIELD_MAP_REQUIRED','Explicit mapping of all required saved/Text cohort fields is required');
  for(const [casePointer,payloadPointer]of Object.entries(descriptor.inputBindingMap))if(!same(pointer(ownerCase,casePointer),pointer(json,payloadPointer)))throw fail('P4_REFERENCE_INPUT_BINDING_MISMATCH','Actual owner manifest field differs from explicit sidecar binding: '+payloadPointer);
 }else if(!same(pointer(json,descriptor.inputCohortPointer),ownerCase.inputCohort))throw fail('P4_REFERENCE_INPUT_BINDING_MISMATCH','Reference payload cohort differs from owner case');
}
async function modelIdentity(path,side,blockers){
 if(!path){blockers.push(record('P4_ORIGINAL_MODEL_MISSING','Locally selected original immutable model File is required'));return null;}
 if(!isAbsolute(path)||resolve(path)===ROOT||resolve(path).startsWith(ROOT+sep))throw fail('P4_PRIVATE_PATH_REQUIRED','Original model must remain at an explicit absolute path outside repository');
 let s;try{s=await stat(path);}catch(error){if(error.code==='ENOENT'){blockers.push(record('P4_ORIGINAL_MODEL_MISSING','Selected original model file is absent'));return null;}throw error;}
 if((await realpath(path)).startsWith(ROOT+sep)||!s.isFile()||s.size!==MODEL[side].bytes)throw fail('P4_MODEL_IDENTITY_MISMATCH','Original model location/extent differs');
 const file=await open(path,'r');try{const prefix=Buffer.alloc(8);if((await file.read(prefix,0,8,0)).bytesRead!==8)throw fail('P4_MODEL_IDENTITY_MISMATCH','Truncated model prefix');const count=prefix.readBigUInt64LE();if(count<2n||count>1048576n)throw fail('P4_MODEL_IDENTITY_MISMATCH','Bounded original model header length differs');const header=Buffer.alloc(Number(count));if((await file.read(header,0,header.length,8)).bytesRead!==header.length||await hash(header)!==MODEL[side].header)throw fail('P4_MODEL_IDENTITY_MISMATCH','Original model header identity differs');const after=await file.stat();if(!same(fileState(s),fileState(after)))throw fail('P4_MODEL_CHANGED','Original model changed while observing its bounded header');return {role:'originalModel',byteLength:s.size,headerByteLength:header.length,headerSHA256:await hash(header),observedFileState:fileState(after),fullFileHashRecomputed:false,selectedParameterBytesVerifiedBy:'fixed owner verify_parameter_identities after native run'};}finally{await file.close();}
}
async function publicOwnerArtifact(descriptor,sourceGit,role){
 if(!descriptor?.sourceRef||!SHA.test(descriptor.sha256??'')||!Number.isSafeInteger(descriptor.byteLength))throw fail('P4_OWNER_SOURCE_DESCRIPTOR_INVALID','Explicit source/hash/extent required: '+role);
 const bytes=await gitBytes(sourceGit,descriptor.sourceRef);if(bytes.byteLength!==descriptor.byteLength||await hash(bytes)!==descriptor.sha256)throw fail('P4_OWNER_SOURCE_MISMATCH','Actual owner Git bytes differ: '+role);
 return {value:JSON.parse(new TextDecoder().decode(bytes)),receipt:{role,sourceRef:structuredClone(descriptor.sourceRef),sha256:await hash(bytes),byteLength:bytes.byteLength,actualGitBytesVerified:true}};
}
async function declarationEvaluation({ownerCase,sourceProof,managerCommit,deviceState,validationSpec}){
 const {P4_PINS,P4_CONDITIONING_CASES,P4_TRUSTED_INPUTS,prepareP4NormInputs}=await import('../../docs/shared/ai-connection/adapters/p4-cross-ffn/declarations.mjs');
 const catalogRef=P4_PINS.catalogRef,catalogBytes=new Uint8Array(await readFile(join(ROOT,catalogRef.path))),catalog=JSON.parse(new TextDecoder().decode(catalogBytes)),files=new Map(await Promise.all(catalog.files.map(async file=>[file.path,new Uint8Array(await readFile(join(ROOT,file.path)))]))),referenceSet=await loadReferenceSet({catalogPath:catalogRef.path,catalogBytes,files,expectedCatalogSha256:catalogRef.sha256});
 const ownerId=deviceState?.resourceState?.ownerId??'p4-preflight:no-device-selected',binding={ownerId,sessionId:'p4-preflight-declarations',bindingId:'p4-preflight-declarations',resourceGeneration:'p4-preflight:no-owner-constructed',sourceRef:sourceProof.sourceRef,buildId:sourceProof.buildId,kernelDigest:P4_PINS.mathWasm.sha256,byteLength:P4_PINS.mathWasm.byteLength,bridgeWasmSHA256:P4_PINS.bridgeWasm.sha256,attentionWasmSHA256:P4_PINS.attentionWasm.sha256},target={requestId:'p4-preflight:declaration-only',managerSessionId:binding.sessionId,managerRevision:0,activeToken:'p4-preflight:declaration-only',resourceBinding:{ownerId,bindingId:binding.bindingId,resourceGeneration:binding.resourceGeneration},localRevisionBindings:{producer:0,consumer:0}};
 const edge=prepareP4NormInputs({referenceSet,managerSourceRef:{repository:P4_PINS.repository,commit:managerCommit,path:'tools/ai-connection/run-norm-required-p4-cross-ffn.mjs'},binding,target,conditioningMetadata:ownerCase?ownerCase.inputCohort?.conditioningBinding:P4_CONDITIONING_CASES.nativeText,savedInputBindings:ownerCase?ownerCase.inputCohort?.savedInputBindings:P4_TRUSTED_INPUTS.HIGH,numericRequirement:ownerCase?.norm?.numericRequirement,validationSpec:validationSpec??ownerCase?.norm?.validationSpec,resourceState:deviceState?.resourceState});
 return {scope:'existing evaluateEdge declarations only; no device occupancy or native owner constructed',selectedOwnerCase:ownerCase!==undefined,...evaluateEdge(edge)};
}
/** Verify public source even while private inputs and actual Text proof are
 * missing. Known context conflicts return before any private artifact IO. */
export async function preflightNormRequiredP4CrossFfn({nativeRoot,sourceGit=ROOT,assets={},text,ownerCase,diagnosticBudget,deviceState,managerCommit}={}){
 const context=inspectP4OwnerCase(ownerCase);
 if(context.inputAdmission.state==='REJECTED')return context;
 if(!nativeRoot)throw fail('P4_NATIVE_ROOT_REQUIRED','Explicit fixed --native-root required');
 if(!COMMIT.test(managerCommit??''))throw fail('P4_MANAGER_COMMIT_REQUIRED','Full --manager-commit required for reproducible management source identity');
 const {P4_FILES,verifyP4CrossFfnSource}=await import('../../docs/shared/ai-connection/adapters/p4-cross-ffn/source.mjs');
 const {P4_PINS,P4_TRUSTED_INPUTS,P4_CONDITIONING_CASES,p4OutputSpecs}=await import('../../docs/shared/ai-connection/adapters/p4-cross-ffn/declarations.mjs');
 const files=new Map(),sourceGitRecords=[];
 for(const pin of P4_FILES){const actual=await bytesAt(child(nativeRoot,pin.path),pin,'P4_SOURCE_MISMATCH'),ref=pin.sourceRef??{...P4_PINS.sourceRef,path:pin.path},blob=await gitBytes(sourceGit,ref);if(blob.byteLength!==actual.byteLength||await hash(blob)!==await hash(actual))throw fail('P4_SOURCE_GIT_MISMATCH','Delivered source differs from exact Git bytes: '+pin.path);files.set(pin.path,actual);sourceGitRecords.push({path:pin.path,sha256:await hash(actual),byteLength:actual.byteLength,sourceRef:ref});}
 const sourceProof=await verifyP4CrossFfnSource({files}),sourceGitProof={allExactBytes:true,sourceCount:sourceGitRecords.length,files:sourceGitRecords},codecProof=await verifyAdoptedWktensorSource(new Uint8Array(await readFile(join(ROOT,ADOPTED_WKTENSOR_DEPLOYMENT_PATH))));
 let declaration=await declarationEvaluation({ownerCase,sourceProof,managerCommit,deviceState});
 if(declaration.compatibility!=='COMPATIBLE')return blocked(declaration.compatibility,[record('P4_DECLARATION_NOT_ADMITTED','Existing evaluateEdge rejected or could not verify required P4 declarations before private IO')],{sourceProof,sourceGitProof,codecProof,declarationEvaluation:declaration});
 const blockers=[...context.blockers],assetReceipts=[],publicReceipts=[],payloads={};let privateInputIOStarted=false;
 const side=ownerCase?.side??'HIGH',rows=ownerCase?.textRows??512,limits=validateBudget(diagnosticBudget,rows);
 if(!limits)blockers.push(record('P4_DIAGNOSTIC_BUDGET_MISSING','Explicit case-bound elapsed/output/Hike/ORT/read/tile limits required'));
 if(!deviceState)blockers.push(record('P4_RESOURCE_STATE_MISSING','Explicit current device resource state required; available/occupied bytes are not assumed'));
 else if(!deviceState.observedAt||!deviceState.resourceState||typeof deviceState.resourceState.status!=='string'||!Number.isSafeInteger(deviceState.resourceState.occupiedBytes)||deviceState.resourceState.occupiedBytes<0||!Number.isSafeInteger(deviceState.resourceState.budgetBytes)||deviceState.resourceState.budgetBytes<1)throw fail('P4_RESOURCE_STATE_INVALID','Observed current device state must carry explicit status and measured occupied/budget bytes');
 else if(deviceState.resourceState.status!=='available')blockers.push(record('P4_RESOURCE_UNAVAILABLE','Current observed resource status does not permit dispatch'));
 const textFile=await localPrivate(text,'fixed-f76-native-Text-packet',blockers,{pin:{sha256:TEXT.wholeSha256,byteLength:TEXT.wholeByteLength}});
 if(textFile){
  const textSourceRef=P4_CONDITIONING_CASES.nativeText.packetSourceRef,textBlob=await gitBytes(sourceGit,textSourceRef);if(textBlob.byteLength!==textFile.bytes.byteLength||await hash(textBlob)!==textFile.receipt.sha256)throw fail('P4_TEXT_SOURCE_GIT_MISMATCH','Actual text packet differs from fixed f76 Git bytes');
  const tensor=await createAdoptedWktensorCodec().decode(textFile.bytes),mask=new Uint8Array(tensor.attentionMask??[]),data=new Uint8Array(tensor.data.buffer,tensor.data.byteOffset,tensor.data.byteLength);
  if(!same(tensor.shape,[1,512,4096])||tensor.dtype!=='float32'||tensor.layout!=='BLC'||tensor.meaning!=='text_hidden_states'||tensor.modelSha256!==TEXT.modelSha256||tensor.tokenizerSha256!==TEXT.tokenizerSha256||await hash(data)!==TEXT.payloadSha256||mask.length!==512||await hash(mask)!==TEXT.maskSha256)throw fail('P4_TEXT_COHORT_MISMATCH','Exact f76 all-row/mask/model/tokenizer native packet required');
  assetReceipts.push({...textFile.receipt,sourceRef:textSourceRef,actualGitBytesVerified:true,payloadSha256:await hash(data),maskSha256:await hash(mask),shape:[...tensor.shape],fullRowsPreserved:true});payloads.textBytes=Buffer.from(textFile.bytes).toString('base64');
 }
 if(ownerCase&&context.status==='PREFLIGHT_PENDING'){
  const expectedConditioning=ownerCase.inputCohort.conditioningBinding,trusted=ownerCase.inputCohort.savedInputBindings;
   const numeric=ownerCase.norm.numericRequirement,spec=ownerCase.norm.validationSpec;
   const declaredGates=bindP4OwnerGate({numericGate:numeric.gateRef,specGate:spec.gate,descriptor:ownerCase.gates});
   const prior=await publicOwnerArtifact(ownerCase.priorPass,sourceGit,'prior-owner-P4-PASS');publicReceipts.push(prior.receipt);
   const mapped={};for(const [field,path]of Object.entries(ownerCase.priorPass.fieldMap)){if(field==='result'&&path&&typeof path==='object'){if(!same(Object.keys(path).sort(),['as','equals','pointer'])||path.equals!==true||path.as!=='PASS'||pointer(prior.value,path.pointer)!==true)throw fail('P4_RECEIPT_FIELD_MAP_INVALID','Explicit result mapping may only map an actual true owner PASS field to management result PASS');mapped.result='PASS';}else mapped[field]=pointer(prior.value,path);}
   const expected={result:'PASS',executionProfileId:P4_PINS.profileId??'bernini-block0-n2-cross-ffn-f32-candidate-v1',ownerSourceRef:P4_PINS.sourceRef,buildId:P4_PINS.buildId,inputClass:ownerCase.inputClass,textRows:rows,conditioningBinding:expectedConditioning,savedInputBindings:trusted,referenceRef:numeric.referenceRef,gateRef:numeric.gateRef,comparisonModes:spec.comparisonModes,strictParameterChecks:29};
   for(const [field,value]of Object.entries(expected))if(!same(mapped[field],value))throw fail('P4_PRIOR_OWNER_PASS_MISMATCH','Actual receipt mapped field differs: '+field);
   const specs=p4OutputSpecs(rows),outputHashes=mapped.outputHashes;if(!outputHashes||Object.keys(outputHashes).length!==25||Object.keys(specs).some(name=>!SHA.test(outputHashes[name+'SHA256']??'')))throw fail('P4_PRIOR_OWNER_PASS_MISMATCH','Actual prior owner receipt must bind all25 named output hashes');
   const authenticatedPriorDeclaration={sourceRef:ownerCase.priorPass.sourceRef,sha256:prior.receipt.sha256,byteLength:prior.receipt.byteLength,...mapped};
   if(spec.priorOwnerPass&&!same(spec.priorOwnerPass,authenticatedPriorDeclaration))throw fail('P4_PRIOR_OWNER_PASS_MISMATCH','Sidecar asserted priorOwnerPass differs from mapped actual receipt');
   payloads.validationSpec={...structuredClone(spec),priorOwnerPass:authenticatedPriorDeclaration};payloads.numericRequirement=structuredClone(numeric);
   const gate=await publicOwnerArtifact(ownerCase.gates,sourceGit,'owner-pre-execution-gate');publicReceipts.push(gate.receipt);
   payloads.gates={};for(const mode of spec.comparisonModes){if(!ownerCase.gates.fieldMap?.[mode])throw fail('P4_GATE_MISMATCH','Explicit owner declared-mode gate pointer required: '+mode);payloads.gates[mode]=pointer(gate.value,ownerCase.gates.fieldMap[mode]);if(!same(payloads.gates[mode],declaredGates[mode==='local'?'localCut':mode]))throw fail('P4_GATE_MISMATCH','Mapped actual gate values differ from the explicit owner pre-execution gate: '+mode);}
   declaration=await declarationEvaluation({ownerCase,sourceProof,managerCommit,deviceState,validationSpec:payloads.validationSpec});
   if(declaration.compatibility!=='COMPATIBLE')return blocked(declaration.compatibility,[record('P4_DECLARATION_NOT_ADMITTED','Existing evaluateEdge did not admit the authenticated owner declaration before private IO')],{sourceProof,sourceGitProof,codecProof,declarationEvaluation:declaration,privateInputIOStarted:false});
   payloads.references={};
   for(const mode of spec.comparisonModes){
    const descriptor=ownerCase.references[mode],ref=numeric.referenceRef[mode];
    if(!descriptor||!ref||descriptor.sha256!==ref.payloadSha256||descriptor.byteLength!==ref.payloadByteLength)throw fail('P4_REFERENCE_DESCRIPTOR_MISMATCH','Independent '+mode+' payload does not match owner reference receipt');
    if(descriptor.kind==='owner-binary-f32-manifest'||descriptor.receiptFieldMap){
     const ownerReceipt=await publicOwnerArtifact(ref,sourceGit,'owner-reference-receipt:'+mode),fields=descriptor.receiptFieldMap;
     if(!fields||pointer(ownerReceipt.value,fields.payloadSha256)!==ref.payloadSha256||pointer(ownerReceipt.value,fields.payloadByteLength)!==ref.payloadByteLength)throw fail('P4_REFERENCE_PUBLIC_RECEIPT_MISMATCH','Actual public owner receipt does not bind the selected private manifest SHA/bytes: '+mode);
     publicReceipts.push({...ownerReceipt.receipt,payloadSha256:ref.payloadSha256,payloadByteLength:ref.payloadByteLength,fieldMap:structuredClone(fields)});
    }
    if(descriptor.path)privateInputIOStarted=true;const file=await localPrivate(descriptor.path,'independent-'+mode+'-P4-reference',blockers,{pin:descriptor});if(!file)continue;
    const json=JSON.parse(new TextDecoder().decode(file.bytes)),arrays=pointer(json,descriptor.arraysPointer),parameterIdentities=pointer(json,descriptor.parameterIdentitiesPointer);verifyReferenceCohort(json,descriptor,ownerCase);
    if(!arrays||Object.keys(arrays).length!==25||Object.keys(specs).some(name=>!Object.hasOwn(arrays,name)))throw fail('P4_REFERENCE_PAYLOAD_MISMATCH','Exact25 named owner reference arrays required: '+mode);
    assetReceipts.push(file.receipt);
    if(descriptor.kind==='owner-binary-f32-manifest'){
     const arrayBuffers={};for(const [name,spec]of Object.entries(specs)){const raw=await readP4BinaryReferenceArray({manifestPath:descriptor.path,name,entry:arrays[name],spec,blockers,assetReceipts});if(raw)arrayBuffers[name]=raw.base64;}
     payloads.references[mode]={arrayBuffers,parameterIdentities,transport:'owner-binary-f32-manifest',manifestSha256:file.receipt.sha256};
    }else if(descriptor.kind===undefined||descriptor.kind==='management-json-f32-arrays'){
     if(Object.keys(specs).some(name=>!Array.isArray(arrays[name])||arrays[name].length!==specs[name].shape.reduce((a,b)=>a*b,1)||arrays[name].some(v=>!Number.isFinite(v))))throw fail('P4_REFERENCE_PAYLOAD_MISMATCH','Exact finite F32 reference extents required: '+mode);
     payloads.references[mode]={arrays,parameterIdentities,transport:'management-json-f32-arrays'};
    }else throw fail('P4_REFERENCE_TRANSPORT_UNKNOWN','Unknown reference transport kind; no export/conversion is inferred');
   }
  if(assets.savedOutput)privateInputIOStarted=true;const saved=await localPrivate(assets.savedOutput,'saved-N2-residual-and-timeAct1',blockers,{pin:{sha256:trusted.savedArtifactSHA256,byteLength:trusted.savedArtifactBytes}});
  if(saved){const json=JSON.parse(new TextDecoder().decode(saved.bytes));for(const key of ['side','blockIndex','scheduleIndex','tokens','acceptedTailReceiptSHA256'])if(json[key]!==trusted[key])throw fail('P4_SAVED_INPUT_COHORT_MISMATCH','Saved owner output identity differs: '+key);const residual=f32(json.arrays?.residual,10240),timeAct1=f32(json.inputs?.timeAct1,5120);if(await hash(new Uint8Array(residual.buffer))!==trusted.residualSHA256||await hash(new Uint8Array(timeAct1.buffer))!==trusted.timeAct1SHA256)throw fail('P4_SAVED_INPUT_BITS_MISMATCH','Actual saved input F32 bits differ');assetReceipts.push(saved.receipt);payloads.saved={residual:Buffer.from(residual.buffer).toString('base64'),timeAct1:Buffer.from(timeAct1.buffer).toString('base64')};}
  if(assets.model)privateInputIOStarted=true;const model=await modelIdentity(assets.model,side,blockers);if(model){assetReceipts.push(model);payloads.originalModelState=model.observedFileState;}
 }
 const result={sourceProof,sourceGitProof,codecProof,declarationEvaluation:declaration,compatibilityAuthority:'existing evaluateEdge',inputAdmission:context.inputAdmission,privateInputIOStarted,diagnosticBudget:limits,deviceState:deviceState??null,assetReceipts,publicReceipts,managerCommit,nativeSource:P4_PINS.sourceRef,ownerCaseSidecar:{schemaVersion:OWNER_CASE_SCHEMA,authority:'management-sidecar; owner receipt fields require explicit mapping',kind:ownerCase?.kind??null,side:ownerCase?.side??null,inputClass:ownerCase?.inputClass??null,textRows:rows,priorReceiptSourceRef:ownerCase?.priorPass?.sourceRef??null,priorReceiptSHA256:ownerCase?.priorPass?.sha256??null,priorReceiptFieldMap:ownerCase?.priorPass?.fieldMap??null,gateFieldMap:ownerCase?.gates?.fieldMap??null},payloads,files};
 return blockers.length?blocked(declaration.compatibility,blockers,result):{status:'READY_FOR_HOLDING_RUN',compatibility:declaration.compatibility,numericalState:'NOT_VERIFIED',runnable:true,nativeCalls:0,browserLaunched:false,actualNumericalAccepted:false,blockers:[],...result};
}
async function managerClosure(){const visited=new Set(),records=[],files=new Map();async function visit(path){path=resolve(path);if(visited.has(path))return;if(!path.startsWith(ROOT+sep))throw fail('P4_MANAGER_SOURCE_ESCAPE','Manager source import escaped repository');visited.add(path);const bytes=new Uint8Array(await readFile(path)),name=relative(ROOT,path).split(sep).join('/');files.set(name,bytes);records.push({path:name,sha256:await hash(bytes),byteLength:bytes.byteLength});if(path.endsWith('.mjs'))for(const m of new TextDecoder().decode(bytes).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g))await visit(resolve(dirname(path),m[1]));}await visit(join(ROOT,'tools/ai-connection/norm-required-p4-cross-ffn-browser.mjs'));await visit(fileURLToPath(import.meta.url));return {records,files};}
async function managerCommitProof(manager,commit){const mismatches=[];for(const record of manager.records){try{const bytes=await gitBytes(ROOT,{commit,path:record.path});if(bytes.byteLength!==record.byteLength||await hash(bytes)!==record.sha256)mismatches.push(record.path);}catch{mismatches.push(record.path);}}return {requestedCommit:commit,allSourceBytesAtRequestedCommit:mismatches.length===0,sourceCount:manager.records.length,mismatches,localBytesRecorded:true};}
const mime=path=>path.endsWith('.mjs')||path.endsWith('.js')?'text/javascript':path.endsWith('.wasm')?'application/wasm':path.endsWith('.json')?'application/json':'application/octet-stream';
async function invokeOwnerParameterChecker(nativeRoot,actual,expected,verifiedFiles){
 const dependencies=[PARAMETER_MODULE,'tools/diffusion-models/p4-cross-ffn-reference.py','development/ai-connection/p4-cross-ffn/core/candidate-plan.json','development/ai-connection/p4-cross-ffn/core/fixture-contract.json','development/ai-connection/profile-adoption/p4/core-source/comfy/ldm/wan/model.py'];
 const snapshot=async()=>{const states=[];for(const path of dependencies){const current=await readFile(childPath(nativeRoot,path)),expectedBytes=verifiedFiles.get(path);if(!expectedBytes||await hash(current)!==await hash(expectedBytes))throw fail('P4_OWNER_CHECKER_SOURCE_CHANGED','Owner Python dependency differs from verified actual source: '+path);states.push({path,state:fileState(await stat(childPath(nativeRoot,path))),sha256:await hash(current)});}return states;};
 const before=await snapshot();
 // Owner function only: do not call its fixture-only compare_private/runner.
 const code="import importlib.util,json,sys\np=sys.argv[1]\ns=importlib.util.spec_from_file_location('p4_owner_parameter_check',p)\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nx=json.load(sys.stdin)\nprint(json.dumps(m.verify_parameter_identities(x['actual'],x['expected']),allow_nan=False))";
 const child=execFile('python3',['-B','-c',code,childPath(nativeRoot,PARAMETER_MODULE)],{maxBuffer:16*1024*1024},()=>{});
 const stdout=[],stderr=[];child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));child.stdin.end(JSON.stringify({actual,expected}));
 await new Promise((accept,reject)=>{child.on('error',reject);child.on('close',code=>code===0?accept():reject(fail('P4_OWNER_PARAMETER_CHECK_FAILED',Buffer.concat(stderr).toString('utf8').slice(-4000))));});
 const after=await snapshot();if(!same(before,after))throw fail('P4_OWNER_CHECKER_SOURCE_CHANGED','Owner Python source hash/stat changed during identity validation');
 const proof=JSON.parse(Buffer.concat(stdout).toString('utf8'));if(proof.verifiedParameterCount!==29||proof.completeSelectionCoverage!==true)throw fail('P4_OWNER_PARAMETER_CHECK_FAILED','Owner did not return all29 selected parameter identities');return {...proof,delegation:{kind:'private-node-cdp-harness-transport',ownerFunction:'verify_parameter_identities',sources:after,sourceAndStatStableBeforeAfter:true}};
}
function childPath(root,path){return child(root,path);}
async function holdingBrowserRun({nativeRoot,sourceGit,out,assets,ownerCase,preflight,manager}){
 const {P4_PINS}=await import('../../docs/shared/ai-connection/adapters/p4-cross-ffn/declarations.mjs');
 const catalogRef=P4_PINS.catalogRef,catalogBytes=new Uint8Array(await readFile(join(ROOT,catalogRef.path))),catalog=JSON.parse(new TextDecoder().decode(catalogBytes)),referenceFiles=await Promise.all(catalog.files.map(async file=>[file.path,Array.from(new Uint8Array(await readFile(join(ROOT,file.path))))]));
 const allowed=new Map([...manager.files].map(([path,bytes])=>['/'+path,bytes]));for(const [path,bytes]of preflight.files)allowed.set('/native/'+path,bytes);
 const network=[],serverFaults=[],browserErrors=[];let server,browser;
 try{
  server=createServer((request,response)=>{const path=new URL(request.url,'http://127.0.0.1').pathname;network.push({method:request.method,path});response.setHeader('Cross-Origin-Opener-Policy','same-origin');response.setHeader('Cross-Origin-Embedder-Policy','require-corp');response.setHeader('Cache-Control','no-store');if(request.method!=='GET'){response.writeHead(405).end();return;}if(path==='/favicon.ico'){response.writeHead(204).end();return;}if(path==='/'){response.setHeader('Content-Type','text/html');response.end('<input id="original-model" type="file"><script type="module">import {runNormRequiredP4CrossFfnBrowser} from "/tools/ai-connection/norm-required-p4-cross-ffn-browser.mjs";globalThis.runP4Holding=runNormRequiredP4CrossFfnBrowser;</script>');return;}const bytes=allowed.get(path);if(!bytes){serverFaults.push({path,reason:'not in verified public source closure'});response.writeHead(404).end();return;}response.setHeader('Content-Type',mime(path));response.end(bytes);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const require=createRequire(import.meta.url);let playwright;try{playwright=require('playwright');}catch{playwright=require('/usr/local/lib/node_modules/playwright');}
  browser=await playwright.chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage();page.on('pageerror',e=>browserErrors.push(String(e.message)));
  const origin='http://127.0.0.1:'+server.address().port;
  await page.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin===origin&&request.method()==='GET')return route.continue();serverFaults.push({reason:'off-origin or non-GET browser request refused',origin:url.origin,method:request.method()});return route.abort('blockedbyclient');});
  await page.exposeFunction('__p4Write',async(path,base64)=>{const dest=child(join(out,'outputs'),path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,Buffer.from(base64,'base64'),{flag:'wx',mode:0o600});});
  await page.exposeFunction('__p4Read',async path=>{try{return (await readFile(child(join(out,'outputs'),path))).toString('base64');}catch(error){if(error.code==='ENOENT')return null;throw error;}});
  await page.exposeFunction('__p4OwnerParameters',(actual,expected)=>invokeOwnerParameterChecker(nativeRoot,actual,expected,preflight.files));
  if(!same(fileState(await stat(assets.model)),preflight.payloads.originalModelState))throw fail('P4_MODEL_CHANGED','Original selected model changed after preflight');
  await page.goto(origin+'/');await page.locator('#original-model').setInputFiles(assets.model);await page.waitForFunction(()=>typeof globalThis.runP4Holding==='function');
  const result=await page.evaluate(plan=>globalThis.runP4Holding(plan),{payloads:preflight.payloads,ownerCase,diagnosticBudget:preflight.diagnosticBudget,deviceState:preflight.deviceState,catalogPath:catalogRef.path,catalogBytes:Array.from(catalogBytes),referenceFiles,managerSource:manager.records,managerCommit:preflight.managerCommit});
  if(!same(fileState(await stat(assets.model)),preflight.payloads.originalModelState))throw fail('P4_MODEL_CHANGED','Original selected model changed during native run');
  const status=serverFaults.length||browserErrors.length||result.releaseError||result.cancelError||result.status==='failed'?'FAIL':result.status==='published'&&result.releaseVerified?'PASS':result.status==='cancelled'&&result.releaseVerified?'CANCELLED':'FAIL';
  return {...result,caseStatus:result.status,status,numericalState:status==='PASS'&&result.actualNumericalAccepted?'VERIFIED':'NOT_VERIFIED',browserLaunched:true,originalModelFileStateStableBeforeAfter:true,network:{scope:'Loopback GET serves captured pinned public source only; original model uses actual local File; references/activations use private CDP',requests:network},serverFaults,browserErrors};
 }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}
}
/** Public receipts retain hashes and identities, never model/activation values.
 * Opaque extensions stay in the private E4 package, not this export. */
export function publicP4Receipt(value){
 const omit=new Set(['payloads','data','expected','attentionMask','textBytes','saved','references','parameterIdentities','model','modelPath','pathLocal','privateArtifactText']);
 const identities=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.values(v).every(x=>x&&typeof x==='object'&&SHA.test(x.sha256??'')&&Array.isArray(x.shape)&&!Object.hasOwn(x,'data'));
 function clean(v,key=''){if(ArrayBuffer.isView(v)||v instanceof ArrayBuffer)return {privateBinaryPayloadOmitted:true,byteLength:v.byteLength};if(v instanceof Map)return undefined;if(Array.isArray(v))return v.map(x=>clean(x));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k,x])=>!omit.has(k)&&!(k==='arrays'&&!identities(x))&&!(x instanceof Map)).map(([k,x])=>[k,clean(x,k)]));return v;}return clean(value);
}
const sidecarExample={schemaVersion:OWNER_CASE_SCHEMA,kind:'owner-provided-numerical-case',ownerProvided:true,side:'HIGH',inputClass:'native-text-encoder',textRows:512,inputCohort:null,norm:null,priorPass:null,references:null,gates:null,provenance:null,lineage:null,parameterProof:{kind:'owner-python-parameter-identities',sourceRef:{repository:'Kushyameln01/kushyameln-works',commit:'7ee36228030ba3bb544a90b1d4b528702a7bae32',path:PARAMETER_MODULE},sha256:PARAMETER_SHA,exportName:'verify_parameter_identities'}};
const REPRODUCE=`This is a management sidecar protocol, not a native owner case schema. The actualText prior P4 PASS remains pending; a reference/gate freeze, source acquisition ACK or Text encoder/capture PASS cannot supply it. Null fields in owner-case.example.json deliberately do not invent evidence.

node tools/ai-connection/run-norm-required-p4-cross-ffn.mjs --native-root /fixed/p4-7ee --source-git /checkout/with-owner-commits --assets /private/assets.json --text /local/plain-conditioning.wktensor --owner-case /private/owner-case.json --diagnostic-budget /private/budget.json --device-state /private/current-device.json --out /private/fresh-p4-run --manager-commit <full-management-commit>

assets.json selects {"model":"/private/original.safetensors","savedOutput":"/private/high-tail-outputs.json"}. The original model must stay outside the repository; no HTTP weight assets, downloads, re-export, or oracle generation are supported. --text is the original f76 WKT packet (whole SHA 90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9), decoded with the adopted codec, preserving all512 rows, mask and metadata.

The owner-case requires kind owner-provided-numerical-case or owner-provided-shape-reference and ownerProvided:true. Both require explicit inputCohort {conditioningBinding,savedInputBindings} and norm {numericRequirement,validationSpec} per the P4 candidate declarations. validationSpec.comparisonModes is ['composed'] for25 comparisons or ['local','composed'] for50, matching the actual priorOwnerPass scope. Only declared reference/gate modes are read; an undeclared local reference is not required. Each declared references[mode] selects a private path, sha256, byteLength and RFC6901 arraysPointer, parameterIdentitiesPointer and inputCohortPointer, matching numericRequirement.referenceRef[mode].payloadSha256/payloadByteLength. No reference arrays or gate are generated.

priorPass identifies actual immutable public owner receipt {sourceRef,sha256,byteLength,fieldMap}; fieldMap explicitly maps result, executionProfileId, ownerSourceRef, buildId, inputClass, textRows, conditioningBinding, savedInputBindings, referenceRef, gateRef, comparisonModes, outputHashes and strictParameterChecks. The manager records this mapping and validates actual Git bytes; it does not assert those field names exist in a currently missing owner receipt. gates identifies an explicit owner actualText pre-execution source/hash/length and fieldMap[mode] pointers for the declared modes. The source identity and extracted values bind numericRequirement.gateRef, priorOwnerPass.gateRef and validationSpec.gate. There is no default actualText gate; the L4 candidate gate is not substituted. parameterProof names the fixed owner verify_parameter_identities export; only that L-independent owner29-selection function is called. Owner common.compare does every declared-mode F32 comparison. The old L4 compare_private/runP4CrossFfn fixture runner is never used for actual Text.

provenance and lineage are explicit owner-provided publication sidecars validated with the existing artifact descriptor schema before native factory creation. producerRefs contain identity records (identityKind/role/algorithm/value/scope); lineage.inputs contain input ID strings. Raw Git sourceRef objects are not converted into identity records. If provenance.transformTraceRefs is nonempty, provide matching ownerCase.trace records. Structural sidecar admission is labeled separately from native compatibility; only existing evaluateEdge decides native compatibility from the actual supplied cohort. Missing numerical context never opens saved/model/private reference files.

Actual994 references use kind:'owner-binary-f32-manifest', an explicit local manifest path, exact manifest sha256/byteLength, arraysPointer:'/arrays', parameterIdentitiesPointer:'/parameterSources', receiptFieldMap:{payloadSha256:'/referenceManifestSHA256',payloadByteLength:'/referenceManifestBytes'} and inputBindingMap. The public owner receipt source/hash/bytes in numericRequirement.referenceRef[mode] is authenticated separately from the private manifest. Its extracted manifest SHA/bytes must match the private file; private arrays are not Git blobs. Each manifest arrays[name] must be {path:name+'.f32',dtype:'float32',shape,bytes,sha256}, with all25 exact shapes/full-byte extents, no byteOffset. The original sibling little-endian F32 files are read/hashed and sent as exact bits through private CDP; no JSON export or oracle generation is requested. inputBindingMap explicitly maps owner-case RFC6901 keys /side and /inputCohort/{savedInputBindings/savedArtifactSHA256,conditioningBinding/{dataSHA256,attentionMaskSHA256,shape,modelSha256,tokenizerSha256,producerExecution}} to actual manifest fields. For994 these are /side, /inputBindings/{savedArtifactSHA256,conditioningDataSHA256,conditioningMaskSHA256} and /conditioning/{shape,modelSha256,tokenizerSha256,producer/sourceCommit}. See development/ai-connection/p4-management/REPRODUCE.md for the concrete HIGH receipt binding. Legacy kind:'management-json-f32-arrays' is optional and never requires re-exporting the actual binary reference.

budget.json requires exactly {scope:"p4-n2-diagnostic-only",textRows:512,maxElapsedMs:<positive>,maxReturnedOutputBytes:<at least63709184>,maxHikeCapacityBytes:<positive>,ortSharedMemoryCapacityBytes:<positive>,maxRawWeightReadBytes:<positive>,maxDecodedWeightTileBytes:<positive>}. These are diagnostic limits, not a full model RAM claim. current-device.json explicitly supplies {observedAt:<time>,resourceState:{status:"available",ownerId:<binding owner>,requiredBytes:<25 output extent>,budgetBytes:<explicit>,occupiedBytes:<observed>}}. No default ready state or zero occupancy is fabricated.

Optional ownerCase.lifecycle selects target cancellation at a real progress phase and recovery after an actual release failure. It must not claim a forced release failure on an unmodified native owner. Bundle release waits original stage terminal and disposes stage, feed, original source in that order. Recover retires the owner; a new generation is required. The runner captures verified source bytes once and serves only those bytes. Missing actualText numerical proof yields BLOCKED/native0/browserfalse. Twenty-five outputs save as actual E4 artifacts with fresh disk readback and principal #blockOutput; output alias is not a26th artifact. Static output extent, native capacity and unknown host/ORT allocator/full peak remain separate. generationReady=false, load/predict/sample=NOT_READY.
`;
export async function runNormRequiredP4CrossFfn(options={}){
 const {out}=options;if(!out||!isAbsolute(out)||resolve(out)===ROOT||resolve(out).startsWith(ROOT+sep))throw fail('P4_PRIVATE_OUTPUT_REQUIRED','Fresh absolute private --out outside repository required');
 const preflight=await preflightNormRequiredP4CrossFfn(options);await mkdir(dirname(out),{recursive:true});if((await realpath(dirname(out))).startsWith(ROOT+sep))throw fail('P4_PRIVATE_OUTPUT_REQUIRED','Private output parent resolves inside repository');await mkdir(out,{mode:0o700});
 const manager=await managerClosure(),publicationProof=await managerCommitProof(manager,options.managerCommit);
 const common={schemaVersion:'works-norm-required-p4-cross-ffn-run/0.1',dateJST:'2026-11-02',...preflight,managementSource:manager.records,managementCommitProof:publicationProof,configReceipts:options.configReceipts??[],generationReady:false,modelInference:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY',totalPeakBytes:null,hostPeakBytes:null,ortAllocatorPeakBytes:null,staticReturnedOutputBytes:4*(30720*(options.ownerCase?.textRows??512)+198656)};
 let result=common;
 if(preflight.runnable&&!publicationProof.allSourceBytesAtRequestedCommit)result={...common,...blocked(preflight.compatibility,[record('P4_MANAGER_SOURCE_NOT_FROZEN','Local management source bytes differ from --manager-commit; publish/freeze before dispatch')],{inputAdmission:{state:'REJECTED',scope:'management-source-authentication-only',nativeCompatibilityEvaluated:true}})};
 else if(preflight.runnable){try{result={...common,...await holdingBrowserRun({...options,preflight,manager})};}catch(error){result={...common,status:'FAIL',browserLaunched:true,nativeCalls:null,actualNumericalAccepted:false,error:{code:error.code??null,message:String(error.message??error)}};}}
 result=publicP4Receipt(result);await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});await writeFile(join(out,'owner-case.example.json'),JSON.stringify(sidecarExample,null,2)+'\n',{flag:'wx',mode:0o600});await writeFile(join(out,'REPRODUCE.md'),REPRODUCE,{flag:'wx',mode:0o600});return result;
}
export const P4_RUNNER_HELP='Usage: node tools/ai-connection/run-norm-required-p4-cross-ffn.mjs --native-root <fixed-7ee-root> --assets <local-private-paths.json> --text <original-f76.wktensor> --owner-case <owner-provided-management-sidecar.json> --diagnostic-budget <P4-case-limits.json> --device-state <observed-current-resources.json> --out <fresh-private-absolute-directory> --manager-commit <full-SHA> [--source-git <local-Git-object-checkout>]\nMissing actual Text owner prior P4 PASS, independent references/gate/parameter identities, original private files or explicit limits yields BLOCKED/native0/browserfalse. No model fetch, oracle generation or L4 fixture reassignment. The new sidecar is documented in REPRODUCE.md.';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.includes('--help'))console.log(P4_RUNNER_HELP);
  else{
   const values={},allowed=new Set(['native-root','source-git','assets','text','owner-case','diagnostic-budget','device-state','out','manager-commit']);
   for(let i=0;i<args.length;i+=2){const key=args[i]?.slice(2);if(!args[i]?.startsWith('--')||!allowed.has(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(values,key))throw fail('P4_ARGUMENT_INVALID','Unknown, duplicate or incomplete flag: '+args[i]);values[key]=args[i+1];}
   const configReceipts=[],json=async(role,path)=>{if(!path)return undefined;const bytes=new Uint8Array(await readFile(path));configReceipts.push({role,sha256:await hash(bytes),byteLength:bytes.byteLength,actualBytesHashed:true,authority:'local management configuration; not owner native API'});return JSON.parse(new TextDecoder().decode(bytes));};
   const result=await runNormRequiredP4CrossFfn({nativeRoot:values['native-root'],sourceGit:values['source-git']??ROOT,assets:await json('assets',values.assets)??{},text:values.text,ownerCase:await json('owner-case',values['owner-case']),diagnosticBudget:await json('diagnostic-budget',values['diagnostic-budget']),deviceState:await json('current-device-state',values['device-state']),out:values.out,managerCommit:values['manager-commit'],configReceipts});
   console.log(JSON.stringify({status:result.status,compatibility:result.compatibility,numericalState:result.numericalState,nativeCalls:result.nativeCalls,browserLaunched:result.browserLaunched,actualNumericalAccepted:result.actualNumericalAccepted,out:values.out}));if(result.status==='FAIL')process.exitCode=1;
  }
 }catch(error){console.error(JSON.stringify({code:error.code??null,message:String(error.message??error)}));process.exitCode=1;}
}

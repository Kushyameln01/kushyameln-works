/** Operational owner for the actual native Text/VAE API and management bridge.
 * File binding checks paths and sizes only; native execution owns byte checks,
 * tokenizer, numerical processing and tensor contracts.
 */
import * as native from './api.mjs';
import {inspectTextEncoderManifest} from './text-encoder.mjs';
import {inspectVaeManifest} from './vae.mjs';
import {createManagedInferenceBridge,createCurrentNativeCodec} from './management-adapter.mjs';

const fail=(code,message)=>Object.assign(Error(message),{code});
const clone=structuredClone;
function requiredFiles(module,manifest){
 if(module==='text_encoder'){
  inspectTextEncoderManifest(manifest);
  return [...manifest.blocks,manifest.finalNorm,manifest.embedding.rowHashes,
   {path:manifest.embedding.sourceFile,bytes:manifest.embedding.sourceBytes},...(manifest.tokenizer?[manifest.tokenizer]:[])];
 }
 if(module==='vae')return Object.values(inspectVaeManifest(manifest).assets);
 throw TypeError('Explicit text_encoder or vae module required');
}

/** A Map uses exact native manifest keys. Browser selections may include a
 * parent directory; a path suffix, then a unique basename, resolves each key.
 * File/Blob identities remain intact, including multi-gigabyte source files.
 */
export function bindOperationalFiles({module,manifest,files}={}){
 const required=requiredFiles(module,manifest),bound=new Map();
 let selected;
 if(!(files instanceof Map)){
  if(!files||typeof files[Symbol.iterator]!=='function')throw TypeError('Local files Map, FileList or array required');
  selected=Array.from(files);
 }
 for(const asset of required){
  const path=asset.path??asset.file;
  if(typeof path!=='string'||!path||!Number.isSafeInteger(asset.bytes)||asset.bytes<1)throw TypeError('Invalid manifest file descriptor');
  let file;
  if(files instanceof Map)file=files.get(path);
  else{
   const suffix=selected.filter(value=>typeof value?.webkitRelativePath==='string'&&(value.webkitRelativePath===path||value.webkitRelativePath.endsWith('/'+path)));
   const matches=suffix.length?suffix:selected.filter(value=>value?.name===path.split('/').at(-1));
   if(matches.length>1)throw fail('AMBIGUOUS_ASSET','Ambiguous local model file: '+path);
   file=matches[0];
  }
  if(!file)throw fail('MISSING_ASSET','Missing local model file: '+path);
  const bytes=file instanceof Uint8Array?file.byteLength:file.size;
  if(bytes!==asset.bytes)throw fail('ASSET_SIZE_MISMATCH','Local model file size mismatch: '+path);
  if(bound.has(path)&&bound.get(path)!==file)throw fail('AMBIGUOUS_ASSET','Ambiguous manifest path: '+path);
  bound.set(path,file);
 }
 return bound;
}

function same(a,b){
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
}

export function createOperationalInferenceOwner({manager,sourceRef,nativeAPI,onState}={}){
 const api=nativeAPI??native.createInferenceAPI({onState});
 const bridge=createManagedInferenceBridge({manager,sourceRef,nativeAPI:api,nativeModule:native,codec:createCurrentNativeCodec(native,sourceRef)});
 const registry=new Map();
 let active=null,closed=false,disposePromise,textConfigured=false;
 function live(){if(closed)throw fail('OWNER_DISPOSED','Operational inference owner disposed');}
 function idle(){live();if(active)throw fail('OWNER_BUSY','An owner operation is active');}
 function recordFor(id){const record=registry.get(id);if(!record)throw fail('UNKNOWN_ARTIFACT','Unknown artifact: '+id);return record;}
 function register(record){if(record?.descriptor?.artifactId)registry.set(record.descriptor.artifactId,record);}
 async function exclusive(kind,work){
  idle();const slot={kind,promise:null};active=slot;
  const pending=(async()=>{try{return await work();}finally{if(active===slot)active=null;}})();
  slot.promise=pending;return pending;
 }
 async function configureText({manifest,files}={}){
  return exclusive('configure',async()=>{
   const expected=inspectTextEncoderManifest(manifest).graphBindings;
   if(expected.length!==24||expected.some(binding=>binding.recipeStatus!=='source-ordered-fp32'||!binding.recipeId))throw fail('TEXT_RECIPE_REQUIRED','Operational Text requires all 24 source-ordered-fp32 recipe bindings');
   const bound=bindOperationalFiles({module:'text_encoder',manifest,files});
   textConfigured=false;
   const result=await bridge.configure('text_encoder',{manifest,files:bound});
   if(!same(result.value?.graphBindings,expected))throw fail('TEXT_BINDING_MISMATCH','Native configured Text graph bindings differ from the inspected manifest');
   textConfigured=true;
   return result;
  });
 }
 async function configureVae({manifest,files}={}){
  return exclusive('configure',()=>bridge.configure('vae',{manifest,files:bindOperationalFiles({module:'vae',manifest,files})}));
 }
 function capabilities(module,request){
  live();const selected=module==='text_encoder'?api.textEncoder:module==='vae'?api.vae:null;
  if(!selected)throw TypeError('Explicit text_encoder or vae module required');
  return selected.capabilities(request);
 }
 async function execute({module,operation,input,inputArtifactId,signal}={}){
  return exclusive('execute',async()=>{
   if(module==='text_encoder'&&!textConfigured)throw fail('TEXT_CONFIGURATION_REQUIRED','Configure Text with verified source-ordered-fp32 graph bindings before execution');
   if(inputArtifactId!==undefined&&input!==undefined)throw TypeError('Choose either input or inputArtifactId');
   const source=inputArtifactId!==undefined?recordFor(inputArtifactId):null;
   const execution=await bridge.execute({module,operation,input:source?source.tensor:input,signal});
   // Dependency refs belong to the outer saved record, never native metadata.
   // The bridge owns a fresh snapshot, preserving the reused tensor verbatim.
   if(source&&execution.inputRecord)execution.inputRecord.sourceRecords.push({artifactRef:source.descriptor.artifactId});
   register(execution.inputRecord);register(execution.record);return execution;
  });
 }
 async function cancelActive(slot){
  if(!slot||slot.kind!=='execute')return {cancelled:false};
  const target=bridge.inspect().targets.find(entry=>['encode','decode'].includes(entry.operation))?.target;
  let terminal,failure;
  try{if(target)terminal=await bridge.cancel(target);}catch(error){failure=error;}
  // The queue's exact-target report and the original execute terminal are both
  // observed. A native cancellation boolean cannot open the retry barrier.
  try{await slot.promise;}catch{/* Original rejection remains on execute(). */}
  if(failure)throw failure;
  return terminal??{cancelled:false};
 }
 async function cancel(){live();return cancelActive(active);}
 async function importTensor(bytes,{name}={}){
  return exclusive('import',async()=>{
   if(name!==undefined&&typeof name!=='string')throw TypeError('Optional tensor filename must be a string');
   const tensor=await native.decodeTensor(bytes),record=bridge.captureSavedTensor(tensor,{sourceRecords:name!==undefined?[{fileName:name,scope:'caller-selected tensor file'}]:[]});
   register(record);return record;
  });
 }
 async function readPackage(bytes){
  return exclusive('read',async()=>{
   const result=await bridge.read(bytes),replacement=new Map();
   for(const record of Object.values(result.artifacts??{})){
    if(!record?.descriptor?.artifactId||!record.tensor)throw fail('PACKAGE_RECORD_REQUIRED','Package artifact must be a native tensor record');
    replacement.set(record.descriptor.artifactId,record);
   }
   // A successful read explicitly replaces the records workspace. It changes
   // neither configured models nor native grants, sessions or capabilities.
   registry.clear();for(const [id,record] of replacement)registry.set(id,record);
   return result;
  });
 }
 async function save({artifactIds}={}){
  return exclusive('save',()=>{
   if(!Array.isArray(artifactIds)||!artifactIds.length)throw TypeError('Explicit artifactIds required');
   const records=Object.create(null),visiting=new Set();
   function include(id){
    if(Object.hasOwn(records,id))return;
    if(visiting.has(id))throw fail('DEPENDENCY_CYCLE','Artifact dependency cycle: '+id);
    visiting.add(id);const record=recordFor(id);
    for(const source of record.sourceRecords??[])if(source.artifactRef)include(source.artifactRef);
    visiting.delete(id);records[id]=record;
   }
   for(const id of artifactIds)include(id);
   return bridge.save({records});
  });
 }
 async function tensorBytes(artifactId){return exclusive('tensor',()=>native.encodeTensor(recordFor(artifactId).tensor));}
 function records(){return [...registry].map(([artifactId,record])=>{
  const name=record.sourceRecords?.find(source=>source.scope==='caller-selected tensor file'&&typeof source.fileName==='string')?.fileName;
  return {artifactId,descriptor:clone(record.descriptor),...(name!==undefined?{name}:{})};
 });}
 function getRecord(artifactId){live();return recordFor(artifactId);}
 function clearRecords(){idle();registry.clear();}
 function dispose(){
  if(disposePromise)return disposePromise;
  closed=true;const slot=active;
  disposePromise=(async()=>{
   try{
    if(slot?.kind==='execute')await cancelActive(slot);
    else if(slot)try{await slot.promise;}catch{/* Dispose still releases native owners. */}
   }finally{
    try{await bridge.dispose();}finally{registry.clear();active=null;}
   }
  })();return disposePromise;
 }
 return Object.freeze({configureText,configureVae,capabilities,execute,cancel,importTensor,readPackage,save,tensorBytes,records,getRecord,clearRecords,dispose,get busy(){return active!==null;}});
}

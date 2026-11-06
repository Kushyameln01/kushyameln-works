/** Streaming directory I/O for the native standalone SDK. Source payload/hash,
 * registry, base and kernel admission remain exclusively SDK responsibilities.
 * A saved manifest is the SDK commit marker; management.json grants no runtime
 * authority and never changes that manifest. Use a fresh empty destination. */
const MANIFEST='manifest.json',STATE='management.json',STATE_LIMIT=1024*1024;
const failure=(code,message)=>Object.assign(Error(message),{code});
const path=value=>typeof value==='string'&&value.length>0&&value!=='.'&&value!=='..'&&!/[\\/:\u0000-\u001f\u007f]/.test(value);
const sourceName=value=>path(value)&&/^source-\d+\.safetensors$/.test(value);
const missing=error=>error?.name==='NotFoundError';
function stateJSON(value){
 const seen=new Set();
 function visit(v){
  if(v===null||['string','boolean'].includes(typeof v)||typeof v==='number'&&Number.isFinite(v))return;
  if(typeof v!=='object'||seen.has(v)||!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v))||Object.getOwnPropertySymbols(v).length||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>d.get||d.set))throw failure('LORA_STORAGE_RUNTIME_VALUE','Management state must be plain JSON metadata, without File or runtime capabilities');
  if(Array.isArray(v)&&(Object.keys(v).length!==v.length||Object.keys(v).some(k=>!Number.isSafeInteger(Number(k))||String(Number(k))!==k||Number(k)<0||Number(k)>=v.length)))throw failure('LORA_STORAGE_RUNTIME_VALUE','Management arrays must have explicit JSON entries and no extra properties');
  seen.add(v);for(const x of Object.values(v))visit(x);seen.delete(v);
 }
 visit(value);const text=JSON.stringify(value);
 if(new TextEncoder().encode(text).byteLength>STATE_LIMIT)throw failure('LORA_STORAGE_STATE_BUDGET','Management state exceeds the separate 1 MiB metadata budget');
 return text;
}

export function createLoraDirectoryStorage(directoryHandle,{prefix}={}){
 if(typeof directoryHandle?.getFileHandle!=='function'||prefix!==undefined&&(!path(prefix)||typeof directoryHandle.getDirectoryHandle!=='function'))throw failure('LORA_STORAGE_PATH','Explicit directory handle and optional safe child-directory name required');
 let directory=prefix===undefined?directoryHandle:null,initialized=null,busy=false,failed=false,committed=false;
 const owned=new Set(),complete=new Set();
 async function resolve(create=false){if(directory)return directory;directory=await directoryHandle.getDirectoryHandle(prefix,{create});return directory;}
 async function initialize(){
  if(!initialized)initialized=(async()=>{const dir=await resolve(true);if(typeof dir.values!=='function')throw failure('LORA_STORAGE_DIRECTORY','Directory enumeration is required before creating a fresh save');for await(const _ of dir.values())throw failure('LORA_STORAGE_NOT_EMPTY','Select a fresh empty package location; existing files will not be overwritten');return dir;})();
  return initialized;
 }
 function check(metadata=false){if(failed)throw failure('LORA_STORAGE_FAILED','Earlier storage write failed; no package manifest may be published');if(busy)throw failure('LORA_STORAGE_BUSY','Wait for the current source stream before publishing another file');if(committed&&!metadata)throw failure('LORA_STORAGE_COMMITTED','This native package was already published; choose a new save location');}
 async function write(name,produce,{metadata=false}={}){
  check(metadata);busy=true;let dir,stream,created=false;
  try{
   dir=await initialize();
   if(!owned.has(name)){try{await dir.getFileHandle(name);throw failure('LORA_STORAGE_NOT_EMPTY','Refusing to overwrite an existing file: '+name);}catch(e){if(!missing(e))throw e;}}
   const file=await dir.getFileHandle(name,{create:true});created=true;owned.add(name);stream=await file.createWritable();await produce(stream);await stream.close();stream=null;complete.add(name);
  }catch(cause){
   failed=true;const errors=[];
   if(stream)try{await stream.abort(cause);}catch(e){errors.push(e);}
   if(created)try{await dir.removeEntry(name);owned.delete(name);complete.delete(name);}catch(e){errors.push(e);}
   if(errors.length)throw Object.assign(new AggregateError([cause,...errors],'Streaming save and partial-file cleanup failed'),{code:'LORA_STORAGE_CLEANUP_REQUIRED'});
   throw cause;
  }finally{busy=false;}
 }
 const writer=Object.freeze({
  async writeSource(name,chunks){
   if(!sourceName(name))throw failure('LORA_STORAGE_PATH','SDK payload filename must be a safe source-N.safetensors name');
   if(complete.has(name))throw failure('LORA_STORAGE_NOT_EMPTY','This payload was already written');
   await write(name,async stream=>{for await(const bytes of chunks){if(!(bytes instanceof Uint8Array))throw failure('LORA_STORAGE_BYTES','SDK source streams must produce Uint8Array chunks');await stream.write(bytes);}});
  },
  async writeManifest(manifest){
   check();await initialize();check();
   for(const source of Array.isArray(manifest?.sources)?manifest.sources:[])if(!sourceName(source?.fileName)||!complete.has(source.fileName))throw failure('LORA_STORAGE_SOURCE_INCOMPLETE','Finish every declared source payload before the manifest');
   const text=JSON.stringify(structuredClone(manifest));await write(MANIFEST,stream=>stream.write(text));committed=true;
  }
 });
 async function readPackage(){
  const dir=await resolve(),file=await (await dir.getFileHandle(MANIFEST)).getFile(),manifest=JSON.parse(await file.text()),sources=new Map();
  for(const descriptor of Array.isArray(manifest?.sources)?manifest.sources:[]){
   const name=descriptor?.fileName;if(!sourceName(name))throw failure('LORA_STORAGE_PATH','Unsafe native source filename');
   try{sources.set(name,await (await dir.getFileHandle(name)).getFile());}catch(e){if(!missing(e))throw e;/* SDK openPackage rejects a missing source; never fabricate payload bytes. */}
  }
  return {manifest,sources};
 }
 async function writeManagementState(state){const text=stateJSON(state);await write(STATE,stream=>stream.write(text),{metadata:true});}
 async function readManagementState(){
  let file;try{file=await (await (await resolve()).getFileHandle(STATE)).getFile();}catch(e){if(missing(e))return null;throw e;}
  if(file.size>STATE_LIMIT)throw failure('LORA_STORAGE_STATE_BUDGET','Management metadata file exceeds 1 MiB');
  const state=JSON.parse(await file.text());stateJSON(state);return state;
 }
 return Object.freeze({writer,readPackage,writeManagementState,readManagementState});
}

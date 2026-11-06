import {validateArtifactDescriptor} from '../descriptor.mjs';
function copy(value){
 const seen=new Set();
 function rejectShared(v){
  if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);
  if(typeof SharedArrayBuffer!=='undefined'&&(v instanceof SharedArrayBuffer||(ArrayBuffer.isView(v)&&v.buffer instanceof SharedArrayBuffer)))throw TypeError('Shared binary snapshots require explicit owner copying before capture');
  if(v instanceof Map)for(const [k,x] of v){rejectShared(k);rejectShared(x);}
  else if(v instanceof Set)for(const x of v)rejectShared(x);
  else if(!ArrayBuffer.isView(v))for(const x of Object.values(v))rejectShared(x);
 }
 rejectShared(value);return structuredClone(value);
}
const associations=new WeakMap();
// Each store is owned by its caller; only references cross the descriptor boundary.
export function createOwnedArtifactStore(){
 const values=new Map();let sequence=0;
 return Object.freeze({put(value,label='value'){const ref=`owned:${++sequence}:${label}`;values.set(ref,copy(value));return ref;},get(ref){if(!values.has(ref))throw Error('Missing or released artifact reference');return copy(values.get(ref));},release(ref){return values.delete(ref);},clear(){values.clear();},get size(){return values.size;}});
}
function metadata(value,store,path){
 if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return {binaryRef:store.put(value,path),byteLength:value.byteLength,type:value.constructor.name};
 if(Array.isArray(value))return value.map((v,i)=>metadata(v,store,`${path}/${i}`));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,metadata(v,store,`${path}/${k}`)]));
 return value;
}
const identity=(role,value,identityKind='model')=>({identityKind,role,algorithm:'sha256',value,scope:'full-file'});
export function captureNativeTensor(options){
 const originalStore=options.store,allocated=[];
 const store={put(value,label){const ref=originalStore.put(value,label);allocated.push(ref);return ref;},get:ref=>originalStore.get(ref)};
 try{
  const handle=capture({...options,store});
  associations.set(handle,{store:originalStore,nativeRef:handle.nativeRef,responseRef:handle.responseRef,descriptorRef:handle.descriptorRef,allocated});
  return handle;
 }catch(e){for(const ref of allocated)originalStore.release(ref);throw e;}
}
function capture({tensor,response,descriptor,extensions,store,registry}){
 if(!store?.put||!tensor||!ArrayBuffer.isView(tensor.data)||!Array.isArray(descriptor?.tensor?.axes)||descriptor.tensor.axes.length!==tensor.shape?.length)throw TypeError('Owned store, binary tensor and explicit axes descriptor required');
 const d=copy(descriptor),nativeRef=store.put(tensor,'native-tensor'),responseRef=store.put(response??{tensor},'native-response');
 const {data,...nativeMetadata}=tensor,payloadRef=store.put(data,'tensor-data');
 d.native={...d.native,payloadRef,metadata:metadata(nativeMetadata,store,'metadata')};
 d.tensor={...d.tensor,dtype:tensor.dtype,shape:copy(tensor.shape),nativeMeaning:tensor.meaning,dataRef:payloadRef};
 const lc=tensor.latentContract;
 const producers=lc?lc.producerModelSha256s.map(h=>identity('producer',h)):tensor.modelSha256?[identity('producer',tensor.modelSha256)]:[];
 if(tensor.tokenizerSha256)producers.push(identity('tokenizer',tensor.tokenizerSha256,'tokenizer'));
 d.provenance={...d.provenance,producerRefs:producers,consumerBindings:lc?[identity('decoder',lc.vaeModelSha256)]:[],transformTraceRefs:copy(d.provenance?.transformTraceRefs??[])};
 const ctx=tensor.context;
 d.lineage=ctx?{inputs:[ctx.inputId],sourceFrames:[{inputId:ctx.inputId,slotId:ctx.slotId,indices:copy(ctx.sourceFrameIndices),...(ctx.sourceFrameTimesSeconds!==undefined?{timesSeconds:copy(ctx.sourceFrameTimesSeconds)}:{})}]}:{inputs:[],sourceFrames:[]};
 d.extensions=metadata(extensions??d.extensions??{},store,'extensions');
 if(registry){const r=validateArtifactDescriptor(d,registry);if(!r.valid)throw Object.assign(Error('Native descriptor validation failed'),{validation:r});}
 const descriptorRef=store.put(d,'descriptor');
 return {descriptor:d,descriptorRef,nativeRef,responseRef,ownership:{mode:'copy',ownerId:d.ownership.ownerId}};
}
export function restoreNativeTensor(handle,store){
 const association=associations.get(handle);
 if(!association||association.store!==store||['nativeRef','responseRef','descriptorRef'].some(k=>association[k]!==handle[k]))throw Error('Native handle association mismatch');
 if(JSON.stringify(handle?.descriptor)!==JSON.stringify(store.get(handle?.descriptorRef)))throw Error('Descriptor changed since native snapshot; re-evaluate the edge');
 return store.get(handle.nativeRef);
}
export function releaseArtifactHandle(handle,store){
 const association=associations.get(handle);
 if(!association||association.store!==store)throw Error('Native handle owner mismatch');
 for(const ref of association.allocated)store.release(ref);associations.delete(handle);
}
/** Materialize every explicitly tagged binary metadata reference for package
 * attachment binding. No descriptor values or raw native fields are rewritten. */
export function exportBinaryAssets(value,store){
 const assets=new Map();
 function visit(v){
  if(!v||typeof v!=='object')return;
  if(Object.keys(v).sort().join(',')==='binaryRef,byteLength,type'&&typeof v.binaryRef==='string'&&typeof v.type==='string'&&Number.isSafeInteger(v.byteLength)){
   const binary=store.get(v.binaryRef);
   if(!(ArrayBuffer.isView(binary)||binary instanceof ArrayBuffer)||binary.byteLength!==v.byteLength||binary.constructor.name!==v.type)throw Error('Binary metadata reference identity mismatch');
   assets.set(v.binaryRef,new Uint8Array(binary instanceof ArrayBuffer?binary:binary.buffer,binary.byteOffset??0,binary.byteLength).slice());return;
  }
  for(const child of Object.values(v))visit(child);
 }
 visit(value);return assets;
}

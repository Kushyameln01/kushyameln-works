import {deriveWorkflowShapes} from '../../ai-connection/workflow-shapes.mjs';

export const MODEL_SEQUENCE_SCHEMA='bernini-model-sequence-layout/0.1';
export const MODEL_SEQUENCE_LIMITS=Object.freeze({maxRows:128,patchWidth:64,hiddenWidth:5120});
const typed=Object.getPrototypeOf(Float32Array.prototype),slots=Object.fromEntries(['length','byteOffset','byteLength','buffer'].map(key=>[key,Object.getOwnPropertyDescriptor(typed,key).get]));
const tag=Object.getOwnPropertyDescriptor(typed,Symbol.toStringTag).get,bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
function sameShape(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
 for(let index=0;index<a.length;index++){
  const left=Object.getOwnPropertyDescriptor(a,String(index)),right=Object.getOwnPropertyDescriptor(b,String(index));
  if(!left||!right||!Object.hasOwn(left,'value')||!Object.hasOwn(right,'value')||left.value!==right.value)return false;
 }
 return true;
}
function plainMetadata(value,ancestors=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){if(Number.isFinite(value))return;throw TypeError('Finite plain metadata required');}
 if(!value||typeof value!=='object')throw TypeError('Acyclic plain metadata data required');
 const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
 if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw TypeError('Plain metadata types required');
 if(ancestors.has(value))throw TypeError('Acyclic plain metadata required');
 ancestors.add(value);
 try{
  const keys=Reflect.ownKeys(value);
  if(keys.some(key=>typeof key==='symbol'))throw TypeError('Plain metadata cannot have symbol keys');
  if(array){
   if(keys.length!==value.length+1)throw TypeError('Dense plain metadata arrays required');
   for(let index=0;index<value.length;index++){
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
    if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)throw TypeError('Plain metadata requires enumerable array data indices without holes or accessors');
    plainMetadata(descriptor.value,ancestors);
   }
  }else for(const key of keys){
   const descriptor=Object.getOwnPropertyDescriptor(value,key);
   if(!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)throw TypeError('Plain metadata requires enumerable data fields without accessors');
   plainMetadata(descriptor.value,ancestors);
  }
 }finally{ancestors.delete(value);}
}
function metadataField(object,key){
 const descriptor=Object.getOwnPropertyDescriptor(object,key);
 if(!descriptor||!Object.hasOwn(descriptor,'value'))throw TypeError('Plain metadata requires own data fields without accessors: '+key);
 plainMetadata(descriptor.value);return descriptor.value;
}
function sameMetadata(a,b){
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 if(Array.isArray(a)&&a.length!==b.length)return false;
 const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
 if(!sameShape(ak,bk))return false;
 for(const key of ak)if(!sameMetadata(a[key],b[key]))return false;
 return true;
}
function f32(value,count,copy=true){
 if(!ArrayBuffer.isView(value)||tag.call(value)!=='Float32Array')throw TypeError('Compact nonshared finite F32 with exact shape required');
 const buffer=slots.buffer.call(value);
 if(!(buffer instanceof ArrayBuffer)||slots.length.call(value)!==count||slots.byteOffset.call(value)!==0||slots.byteLength.call(value)!==bufferLength.call(buffer))throw TypeError('Compact nonshared finite F32 with exact shape required');
 const owned=copy?new Float32Array(value):value;
 for(let i=0;i<count;i++)if(!Number.isFinite(owned[i]))throw TypeError('Compact nonshared finite F32 with exact shape required');
 return owned;
}
function rowsRange(start,count,total){
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(count)||start<0||count<1||count>MODEL_SEQUENCE_LIMITS.maxRows||start>total-count)throw RangeError('Exact sequence range requires rows1..128 within total tokens');
}

/** Tensor layout only. Canonical workflow metadata supplies every stream, shape,
 * order and source ID. This owner copies values without numerical normalization.
 * Head callers must project all totalTokens; only the target prefix is stored.
 */
export function createModelSequence({shapeRequest,tensors}={}){
 if(!shapeRequest||typeof shapeRequest!=='object')throw TypeError('Shape request object with own semantics metadata required');
 metadataField(shapeRequest,'semantics');
 const canonical=deriveWorkflowShapes(shapeRequest),g=canonical.geometry;
 if(!sameShape(g.patchSize,[1,2,2])||g.hiddenSize!==5120||g.latentChannels!==16||!['F32','float32'].includes(g.dtype))throw RangeError('Supported sequence geometry requires F32, C16, patch[1,2,2] and hidden5120');
 if(!canonical.orderedContexts.complete||canonical.concatenation.totalTokens===null||!sameShape(canonical.concatenation.shapePerBatch,[1,canonical.concatenation.totalTokens,5120]))throw RangeError('Complete canonical context population and target-first batch1 concatenation required');
 const contexts=canonical.orderedContexts.entries,requirements=new Map(canonical.requirements.map(value=>[value.requirementId,value]));
 const ids=['target.latent',...contexts.map(entry=>entry.contextKey+'.latent')];
 if(!Array.isArray(tensors)||tensors.length!==ids.length)throw TypeError('Exact ordered target and context tensor population count required');
 const streams=[];
 try{
  for(let index=0;index<ids.length;index++){
   const id=ids[index],requirement=requirements.get(id),tokenRequirement=requirements.get(id.slice(0,-7)+'.tokens'),tensor=tensors[index];
   if(!requirement||requirement.state!=='known'||!tokenRequirement||tokenRequirement.state!=='known')throw RangeError('Known canonical latent and token shapes required');
   if(tokenRequirement.padding?.tail?.some(value=>value!==0))throw RangeError('Odd latent dimensions require explicit core padding support; sequence padding is unsupported');
   if(requirement.shape[0]!==1||requirement.shape[1]!==16)throw RangeError('Supported sequence geometry requires batch1 C16');
   if(!tensor||tensor.requirementId!==id)throw TypeError('Tensor order must exactly match target then canonical ordered contexts');
   if(Object.hasOwn(tensor,'values'))throw TypeError('Tensor data is the only payload field; own values is ambiguous and unsupported');
   if(!sameShape(tensor.shape,requirement.shape))throw RangeError('Tensor shape differs from canonical requirement: '+id);
   if(tensor.dtype!==requirement.dtype)throw TypeError('Tensor dtype differs from canonical requirement: '+id);
   for(const key of ['meaning','normalization']){
    if(requirement[key]===null||requirement[key]===undefined)throw TypeError('Explicit canonical latent '+key+' semantic declaration required: '+id);
    if(!sameMetadata(metadataField(tensor,key),requirement[key]))throw TypeError('Tensor '+key+' differs from canonical requirement: '+id);
   }
   if(tensor.axes!==undefined&&!sameShape(tensor.axes,requirement.axes))throw TypeError('Tensor axes differ from canonical NCTHW requirement');
   const context=index===0?null:contexts[index-1],tokenCount=tokenRequirement.tokenCount,tokenRange=index===0?[0,canonical.target.tokenCount]:context.concatTokenRange;
   const sourceId=index===0?canonical.concatenation.targetSourceId:context.sourceId;
   if(!Number.isSafeInteger(sourceId)||sourceId<0||sourceId>16777216)throw RangeError('Exact canonical source IDs required');
   const elements=requirement.shape.reduce((a,b)=>a*b,1),values=f32(tensor.data,elements);
   streams.push({requirementId:id,shape:[...requirement.shape],dtype:requirement.dtype,meaning:structuredClone(requirement.meaning),normalization:structuredClone(requirement.normalization),sourceId,tokenGrid:[...tokenRequirement.tokenGrid],tokenCount,tokenRange:[...tokenRange],provenance:structuredClone(requirement.provenance),qualification:structuredClone(requirement.qualification),values});
  }
 }catch(error){for(const stream of streams)stream.values.fill(0);throw error;}
 const target=streams[0],targetElements=target.values.length,totalTokens=canonical.concatenation.totalTokens;
 let disposed=false;
 const live=()=>{if(disposed)throw Error('Model sequence disposed');};
 const streamAt=global=>streams.find(stream=>global>=stream.tokenRange[0]&&global<stream.tokenRange[1]);
 const coordinate=(stream,global)=>{
  const local=global-stream.tokenRange[0],[,height,width]=stream.tokenGrid;
  return [Math.floor(local/(height*width)),Math.floor(local/width)%height,local%width];
 };
 const description={schemaVersion:MODEL_SEQUENCE_SCHEMA,ruleId:canonical.ruleId,shapeDerivation:'deriveWorkflowShapes',semanticAdmission:'exact caller-declared metadata matching; producer identity and numerical normalization not authenticated',targetShape:[...target.shape],targetTokens:canonical.target.tokenCount,totalTokens,contextTokens:canonical.concatenation.contextTokens,headProjectionRows:totalTokens,headProjectionPolicy:'all concatenated tokens before target prefix selection',inputPatchOrder:'C,kT,kH,kW',headPatchOrder:'kT,kH,kW,C',targetOutputOrder:'N,C,T,H,W',streams:streams.map(({values,...metadata})=>metadata),issues:structuredClone(canonical.issues),limits:MODEL_SEQUENCE_LIMITS,modelInference:false,generationReady:false};
 return Object.freeze({
  describe(){live();return structuredClone(description);},
  readPatchRows(start,count){
   live();rowsRange(start,count,totalTokens);const output=new Float32Array(count*64);
   for(let row=0;row<count;row++){
    const global=start+row,stream=streamAt(global),[t,h,w]=coordinate(stream,global),[,,frames,height,width]=stream.shape;
    for(let channel=0;channel<16;channel++)for(let py=0;py<2;py++)for(let px=0;px<2;px++)output[row*64+channel*4+py*2+px]=stream.values[((channel*frames+t)*height+h*2+py)*width+w*2+px];
   }
   return output;
  },
  readPositions(start,count){
   live();rowsRange(start,count,totalTokens);const positions=new Float32Array(count*3),sourceIds=new Int32Array(count);
   for(let row=0;row<count;row++){const global=start+row,stream=streamAt(global);positions.set(coordinate(stream,global),row*3);sourceIds[row]=stream.sourceId;}
   return {positions,sourceIds};
  },
  writeTargetHeadRows(head64rows,globalStart,targetOutput){
   live();const length=ArrayBuffer.isView(head64rows)&&tag.call(head64rows)==='Float32Array'?slots.length.call(head64rows):0,count=length/64;
   rowsRange(globalStart,count,totalTokens);const head=f32(head64rows,length),output=f32(targetOutput,targetElements,false),writtenTargetRows=Math.max(0,Math.min(count,canonical.target.tokenCount-globalStart));
   const [,,frames,height,width]=target.shape;
   for(let row=0;row<writtenTargetRows;row++){
    const [t,h,w]=coordinate(target,globalStart+row);
    for(let py=0;py<2;py++)for(let px=0;px<2;px++)for(let channel=0;channel<16;channel++)output[((channel*frames+t)*height+h*2+py)*width+w*2+px]=head[row*64+(py*2+px)*16+channel];
   }
   return {processedRows:count,writtenTargetRows,writtenElements:writtenTargetRows*64};
  },
  dispose(){if(disposed)return;disposed=true;for(const stream of streams)stream.values.fill(0);}
 });
}

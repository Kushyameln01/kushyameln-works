// Development comparison transport. This module performs layout copies only;
// it never supplies or substitutes values for the numeric graph.
export const MODEL_CHUNK_STAGES=Object.freeze([
 'patchHidden','textEmbedded','timeRaw','timeAct1','timeProjection','blockInput',
 'postModulated','kProjected','kNormalized','k','v','qProjected','qNormalized','q',
 'selfAttention','oProjection','selfResidual','crossK','crossV','crossQ',
 'crossAttention','crossResidual','ffnPostModulated','ffnUp','ffnActivated',
 'ffnDown','ffnOutput','blockOutput','headAll','prediction'
]);
const typed=Object.getPrototypeOf(Float32Array.prototype);
const length=Object.getOwnPropertyDescriptor(typed,'length').get;
const buffer=Object.getOwnPropertyDescriptor(typed,'buffer').get;
const offset=Object.getOwnPropertyDescriptor(typed,'byteOffset').get;
const tag=Object.getOwnPropertyDescriptor(typed,Symbol.toStringTag).get;
const throwIfAborted=AbortSignal.prototype.throwIfAborted;
const aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
const reason=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'reason').get;
const addListener=EventTarget.prototype.addEventListener,removeListener=EventTarget.prototype.removeEventListener;
const now=()=>performance.now();
const product=shape=>shape.reduce((a,b)=>a*b,1);
export const MODEL_CHUNK_MAX_ELEMENTS=128*13824;
function shapeSnapshot(shape){
 if(!Array.isArray(shape)||Object.getPrototypeOf(shape)!==Array.prototype||!shape.length)throw TypeError('Dense native full shape required');
 const result=[];let elements=1;
 for(let i=0;i<shape.length;i++){
  const d=Object.getOwnPropertyDescriptor(shape,String(i));
  if(!d||!Object.hasOwn(d,'value')||!Number.isSafeInteger(d.value)||d.value<1)throw TypeError('Dense positive safe full shape required');
  result.push(d.value);elements*=d.value;if(!Number.isSafeInteger(elements))throw RangeError('Diagnostic full shape product exceeds safe integers');
 }return result;
}

export function validateModelChunkOptions(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw TypeError('Chunk diagnostic options must be a plain object');
 for(const key of Reflect.ownKeys(value)){
  const d=Object.getOwnPropertyDescriptor(value,key);
  if(typeof key!=='string'||!['onChunk','stages','maxRows','stopAfterBlock'].includes(key)||!d.enumerable||!Object.hasOwn(d,'value'))throw TypeError('Unknown/accessor chunk diagnostic option');
 }
 if(typeof value.onChunk!=='function')throw TypeError('diagnoseChunks requires onChunk');
 const maxRows=value.maxRows??128;
 if(!Number.isSafeInteger(maxRows)||maxRows<1||maxRows>128)throw RangeError('Chunk rows must be 1..128');
 let stages=null;
 if(value.stages!==undefined){
  if(!Array.isArray(value.stages)||!value.stages.length||Object.getPrototypeOf(value.stages)!==Array.prototype)throw TypeError('Chunk stages must be a nonempty native array');
  stages=[];
  for(let i=0;i<value.stages.length;i++){
   const d=Object.getOwnPropertyDescriptor(value.stages,String(i));
   if(!d||!Object.hasOwn(d,'value')||!MODEL_CHUNK_STAGES.includes(d.value)||stages.includes(d.value))throw TypeError('Unknown, duplicate or sparse chunk stage');
   stages.push(d.value);
  }
 }
 if(value.stopAfterBlock!==undefined&&(!Number.isSafeInteger(value.stopAfterBlock)||value.stopAfterBlock<0||value.stopAfterBlock>39))throw RangeError('Diagnostic stopAfterBlock must be 0..39');
 return Object.freeze({onChunk:value.onChunk,maxRows,stages:stages?Object.freeze(stages):null,stopAfterBlock:value.stopAfterBlock});
}

function copyRange(value,start,count,constructor,type){
 if(!ArrayBuffer.isView(value)||tag.call(value)!==type||Object.getPrototypeOf(buffer.call(value))!==ArrayBuffer.prototype||start<0||count<0||start+count>length.call(value))throw TypeError('Native nonshared exact diagnostic source required');
 const result=new constructor(count);
 result.set(new constructor(buffer.call(value),offset.call(value)+start*constructor.BYTES_PER_ELEMENT,count));
 return result;
}

export function createModelChunkEmitter({options,model,timestep,signal,check=()=>{},clock=now}={}){
 const config=validateModelChunkOptions(options),selected=config.stages?new Set(config.stages):null;
 if(signal!==undefined)throwIfAborted.call(signal);
 const metrics={chunks:0,completedCallbacks:0,failedCallbacks:0,copiedBytes:0,copyMs:0,callbackMs:0,maxChunkElements:0};
 let activeChunk=null,callbackStart=null,lastCallbackFailure=null;
 const enabled=name=>MODEL_CHUNK_STAGES.includes(name)&&(!selected||selected.has(name));
 async function deliver(event){
  // The callback owns only a bounded clone. Cancelling the graph must not wait
  // forever for an external comparison server or a never-resolving callback.
  let cancel;
  const cancelled=signal===undefined?null:new Promise((_,reject)=>{cancel=()=>reject(reason.call(signal));addListener.call(signal,'abort',cancel,{once:true});if(aborted.call(signal))cancel();});
  const call=Promise.resolve().then(()=>{check();return config.onChunk(event);});
  try{await(cancelled?Promise.race([call,cancelled]):call);}
  finally{if(cancel)removeListener.call(signal,'abort',cancel);}
 }
 async function rows(name,{data,fullShape,rowAxis=1,columns,globalRowStart=0,rowCount,block=null,layout,coordinatesForRows}={}){
  if(!MODEL_CHUNK_STAGES.includes(name))throw TypeError('Unknown graph chunk stage');
  if(!enabled(name))return;
  const capturedShape=shapeSnapshot(fullShape);
  const chunkLayout=layout??(rowAxis===null?'NCTHW-contiguous-row-span':capturedShape.length===4?'BLHD':capturedShape.length===2?'BC':name==='timeProjection'?'BKC':'BLC');
  if(!['BLC','BLHD','BC','BKC','NCTHW-contiguous-row-span'].includes(chunkLayout))throw TypeError('Unknown chunk layout');
  if(!Number.isSafeInteger(columns)||columns<1||!Number.isSafeInteger(globalRowStart)||globalRowStart<0||!Number.isSafeInteger(rowCount)||rowCount<1||length.call(data)!==rowCount*columns)throw TypeError('Exact diagnostic rows/full shape required');
  if(rowAxis!==null&&(!Number.isSafeInteger(rowAxis)||rowAxis<0||rowAxis>=capturedShape.length))throw RangeError('Diagnostic row axis outside full shape');
  const fullRows=rowAxis===null?product(capturedShape)/columns:capturedShape[rowAxis],rowsPerChunk=Math.min(config.maxRows,Math.floor(MODEL_CHUNK_MAX_ELEMENTS/columns));
  if(rowsPerChunk<1||!Number.isSafeInteger(fullRows)||globalRowStart+rowCount>fullRows||rowAxis!==null&&product(capturedShape)!==fullRows*columns)throw RangeError('Diagnostic row span outside full shape or chunk capacity');
  for(let local=0;local<rowCount;local+=rowsPerChunk){
   check();const count=Math.min(rowsPerChunk,rowCount-local),start=globalRowStart+local,began=clock();
   const owned=copyRange(data,local*columns,count*columns,Float32Array,'Float32Array');
   let coordinates;
   if(coordinatesForRows){
    const supplied=coordinatesForRows(start,count);
    coordinates={positions:copyRange(supplied.positions,0,count*3,Float32Array,'Float32Array'),sourceIds:copyRange(supplied.sourceIds,0,count,Int32Array,'Int32Array')};
   }
   metrics.copyMs+=clock()-began;metrics.copiedBytes+=owned.byteLength+(coordinates?coordinates.positions.byteLength+coordinates.sourceIds.byteLength:0);metrics.maxChunkElements=Math.max(metrics.maxChunkElements,owned.length);
   const shape=rowAxis===null?[count,columns]:capturedShape.map((size,axis)=>axis===rowAxis?count:size);
   const axes=chunkLayout==='BLHD'?['B','L','H','D']:chunkLayout==='BC'?['B','C']:chunkLayout==='BKC'?['B','modulationChunk','C']:chunkLayout==='NCTHW-contiguous-row-span'?['linearNCTHRow','W']:['B','L','C'];
   if(rowAxis===null?capturedShape.length!==5:axes.length!==capturedShape.length)throw TypeError('Chunk axes do not match full shape rank');
   const event={schemaVersion:'bernini-model-chunk/1',tensorKind:'internal-comparison-chunk',name,block,globalRowStart:start,rowCount:count,rowAxis,columns,storageElementOffset:start*columns,shape,fullShape:[...capturedShape],axes,fullAxes:rowAxis===null?['N','C','T','H','W']:[...axes],dtype:'float32',layout:chunkLayout,data:owned,model:{...model},timestep,...(coordinates?{coordinates,coordinateAxes:['T','H','W']}:{}),ownership:'owned callback clone; producer drops its reference after awaiting callback',acceptedProduction:false};
   activeChunk={name,block,globalRowStart:start,rowCount:count};callbackStart=clock();metrics.chunks++;
   try{await deliver(event);metrics.completedCallbacks++;}
   catch(error){metrics.failedCallbacks++;lastCallbackFailure={...activeChunk,error:{name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,1000)}};throw error;}
   finally{metrics.callbackMs+=clock()-callbackStart;callbackStart=null;activeChunk=null;}
   check();
  }
 }
 return Object.freeze({enabled,rows,config,stats:()=>({...metrics,callbackMs:metrics.callbackMs+(callbackStart===null?0:clock()-callbackStart),activeChunk:activeChunk?{...activeChunk}:null,lastCallbackFailure:lastCallbackFailure?structuredClone(lastCallbackFailure):null})});
}

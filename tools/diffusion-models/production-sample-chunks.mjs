// Diagnostic transport only. Numeric sampling remains in the existing model
// sampler owner; every callback clone is split into owned comparison rows.
export const SAMPLER_TRACE_SEQUENCE=Object.freeze(['initialX','velocity00','step00X','velocity01','step01X','velocity02','step02X','highPublic','lowEntry','velocity03','step03X','velocity04','step04X','velocity05','step05X','finalRaw']);
const typed=Object.getPrototypeOf(Float32Array.prototype),slots=Object.fromEntries(['buffer','length','byteOffset','byteLength'].map(key=>[key,Object.getOwnPropertyDescriptor(typed,key).get]));
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
export function samplerTraceName(event){
 const name=event.name==='stepX'&&Number.isInteger(event.step)?'step'+String(event.step).padStart(2,'0')+'X':event.name;
 if(!SAMPLER_TRACE_SEQUENCE.includes(name))throw TypeError('Unknown sampler diagnostic identity');
 const match=/^(?:velocity|step)(\d\d)(?:X)?$/.exec(name);
 if(match&&(event.step!==Number(match[1])||event.side!==(event.step<3?'HIGH':'LOW')))throw TypeError('Sampler diagnostic step/side identity mismatch');
 return name;
}
export function* samplerTraceChunks(event,{maxRows=128}={}){
 const name=samplerTraceName(event),shape=event.shape;
 if(!Number.isInteger(maxRows)||maxRows<1||maxRows>128||!Array.isArray(shape)||shape.length!==5||shape.some(value=>!Number.isSafeInteger(value)||value<1)||shape[0]!==1||shape[1]!==16)throw TypeError('Exact NCTHW C16 sampler trace shape and rows1..128 required');
 const count=shape.reduce((a,b)=>a*b,1),data=event.data;
 if(!Number.isSafeInteger(count)||count*4>8388608||Object.getPrototypeOf(data??{})!==Float32Array.prototype)throw TypeError('Owned sampler trace within8MiB required');
 const source=slots.buffer.call(data);
 if(Object.getPrototypeOf(source)!==ArrayBuffer.prototype||slots.length.call(data)!==count||slots.byteOffset.call(data)!==0||slots.byteLength.call(data)!==bufferLength.call(source))throw TypeError('Compact nonshared exact sampler trace required');
 const width=shape[4],rows=count/width;
 for(let start=0;start<rows;start+=maxRows){
  const rowCount=Math.min(maxRows,rows-start),owned=new Float32Array(rowCount*width);
  owned.set(new Float32Array(source,start*width*4,owned.length));
  for(let i=0;i<owned.length;i++)if(!Number.isFinite(owned[i]))throw TypeError('Finite sampler diagnostic trace required');
  yield {schemaVersion:'bernini-sampler-chunk/1',name,block:null,globalRowStart:start,rowCount,rowAxis:null,columns:width,storageElementOffset:start*width,shape:[rowCount,width],fullShape:[...shape],dtype:'float32',layout:'NCTHW-contiguous-row-span',axes:['linearNCTHRow','W'],fullAxes:['N','C','T','H','W'],...(event.step===undefined?{}:{step:event.step}),...(event.side===undefined?{}:{side:event.side}),...(event.sigma===undefined?{}:{sigma:event.sigma}),...(event.meaning===undefined?{}:{meaning:event.meaning}),...(event.handoffProfile===undefined?{}:{handoffProfile:event.handoffProfile}),...(event.handoffNormalization===undefined?{}:{handoffNormalization:structuredClone(event.handoffNormalization)}),...(event.latentContract===undefined?{}:{latentContract:structuredClone(event.latentContract)}),data:owned};
 }
}

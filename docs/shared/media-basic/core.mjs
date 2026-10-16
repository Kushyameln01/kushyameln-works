export const PROTOTYPE_LIMITS=Object.freeze({maxPixels:1048576,maxFrames:100,maxDurationSeconds:10,maxFileBytes:4194304,maxArtifactBytes:8388608});
const frameTypedPrototype=Object.getPrototypeOf(Uint8Array.prototype),frameGetters=Object.fromEntries(['buffer','byteOffset','byteLength','length'].map(k=>[k,Object.getOwnPropertyDescriptor(frameTypedPrototype,k).get])),frameResizable=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'resizable')?.get;
const frameProperty=(a,k)=>Reflect.apply(frameGetters[k],a,[]);
export function validateFrame(frame,maxPixels=PROTOTYPE_LIMITS.maxPixels){
  const {data,width,height}=frame??{},stride=frame?.stride??width*4;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>maxPixels||!Number.isSafeInteger(stride)||stride<width*4)throw RangeError('FRAME_DIMENSIONS');
  if(!(data instanceof Uint8Array||data instanceof Uint8ClampedArray))throw RangeError('FRAME_BYTES');
  const buffer=frameProperty(data,'buffer'),bytes=frameProperty(data,'byteLength');
  if(!(buffer instanceof ArrayBuffer)||(frameResizable&&Reflect.apply(frameResizable,buffer,[]))||bytes<stride*height||bytes>maxPixels*4)throw RangeError('FRAME_BYTES');
  return {data:new Uint8Array(buffer,frameProperty(data,'byteOffset'),frameProperty(data,'length')),width,height,stride};
}

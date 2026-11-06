import {encodeTensor,decodeTensor} from './tensor-2bdca59.mjs';
import {sha256Bytes} from '../canonical.mjs';

// Storage-codec adoption is independent of native VAE/Text Worker source pins.
// tensor-2bdca59.mjs is the byte-exact standalone owner source, without edits.
export const ADOPTED_WKTENSOR_SOURCE=Object.freeze({
 repository:'Kushyameln01/kushyameln-works',
 commit:'2bdca59ea78580d4fe7a9d31a8de33209b64d029',
 path:'docs/shared/inference/tensor.mjs',
 sha256:'d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5'
});
export const ADOPTED_WKTENSOR_DEPLOYMENT_PATH='docs/shared/ai-connection/codecs/tensor-2bdca59.mjs';
export const ADOPTED_WKTENSOR_BYTE_LENGTH=8256;

export function createAdoptedWktensorCodec(){
 return Object.freeze({codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef:ADOPTED_WKTENSOR_SOURCE,encode:encodeTensor,decode:decodeTensor});
}

/** Verify actual delivered source bytes, rather than trusting their labels.
 * Capture before the digest await; verification does not import a replacement.
 * Node and browser callers keep their existing source/transport guards. */
export async function verifyAdoptedWktensorSource(value){
 const mismatch=()=>Object.assign(Error('Delivered storage codec source differs from the adopted owner bytes'),{code:'CODEC_SOURCE_MISMATCH'});
 let bytes;
 try{
  if(value instanceof Uint8Array&&value.byteLength===ADOPTED_WKTENSOR_BYTE_LENGTH)bytes=new Uint8Array(value);
  else if(value instanceof ArrayBuffer&&value.byteLength===ADOPTED_WKTENSOR_BYTE_LENGTH)bytes=new Uint8Array(new Uint8Array(value));
  else throw mismatch();
 }catch{throw mismatch();}
 if(bytes.byteLength!==ADOPTED_WKTENSOR_BYTE_LENGTH)throw mismatch();
 const sha256=await sha256Bytes(bytes);if(sha256!==ADOPTED_WKTENSOR_SOURCE.sha256)throw mismatch();
 return Object.freeze({verified:true,sourceRef:ADOPTED_WKTENSOR_SOURCE,deploymentPath:ADOPTED_WKTENSOR_DEPLOYMENT_PATH,byteLength:bytes.byteLength,sha256});
}

// Loaded only by the diagnostic fresh realm through public wasmPaths.mjs.
import originalFactory from '../../docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs';
import {createCapturedFactory} from './resident-ort-attention-timing-core.mjs';
let captured=null;
export function configureFactoryCapture(recorder){
 if(captured)throw Error('Factory capture requires a fresh realm');
 captured=createCapturedFactory(originalFactory,{recorder});return captured;
}
export default function factory(config){
 if(!captured)throw Error('Configure diagnostic factory before public ORT initialization');
 return captured.factory(config);
}

import {createTextVaeAdapter} from './text-vae.mjs';
import {createDiffusionAdapter} from './diffusion.mjs';
import {createLoraAdapter} from './lora.mjs';
export {createTextVaeAdapter,createDiffusionAdapter,createLoraAdapter};
export {createAdoptedLoraAdapter,ADOPTED_LORA_VERSION,ADOPTED_LORA_SOURCE} from './adopted-lora.mjs';
export {createNormRequiredLoraExecution} from './norm-required-lora.mjs';
export {createNormRequiredRectAdapter,RECT_DECODE_PROFILE,RECT_DECODE_ASSETS} from './norm-required-rect.mjs';
export {createOwnedArtifactStore,captureNativeTensor,restoreNativeTensor,exportBinaryAssets,releaseArtifactHandle} from './artifacts.mjs';
export {ADOPTED_WKTENSOR_SOURCE,ADOPTED_WKTENSOR_DEPLOYMENT_PATH,ADOPTED_WKTENSOR_BYTE_LENGTH,createAdoptedWktensorCodec,verifyAdoptedWktensorSource} from '../codecs/wktensor.mjs';
export function createModuleAdapter(options){
 const factory={'text-vae':createTextVaeAdapter,diffusion:createDiffusionAdapter,'lora-v2':createLoraAdapter}[options?.kind];
 if(!factory)throw TypeError('Explicit supported adapter kind required');return factory(options);
}

import {createTextVaeAdapter} from './text-vae.mjs';
import {createDiffusionAdapter} from './diffusion.mjs';
import {createLoraAdapter} from './lora.mjs';
export {createTextVaeAdapter,createDiffusionAdapter,createLoraAdapter};
export {createOwnedArtifactStore,captureNativeTensor,restoreNativeTensor,exportBinaryAssets,releaseArtifactHandle} from './artifacts.mjs';
export function createModuleAdapter(options){
 const factory={'text-vae':createTextVaeAdapter,diffusion:createDiffusionAdapter,'lora-v2':createLoraAdapter}[options?.kind];
 if(!factory)throw TypeError('Explicit supported adapter kind required');return factory(options);
}

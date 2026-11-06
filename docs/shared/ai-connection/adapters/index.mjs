import {createTextVaeAdapter} from './text-vae.mjs';
import {createDiffusionAdapter} from './diffusion.mjs';
import {createLoraAdapter} from './lora.mjs';
export {createTextVaeAdapter,createDiffusionAdapter,createLoraAdapter};
export {createAdoptedLoraAdapter,ADOPTED_LORA_VERSION,ADOPTED_LORA_SOURCE} from './adopted-lora.mjs';
export {createNormRequiredLoraExecution} from './norm-required-lora.mjs';
export {createLoraDataPhaseBridge} from './lora-data-phase-bridge.mjs';
export {LORA_ADMISSION_DATA_SOURCE,verifyLoraAdmissionDataSources,isVerifiedLoraAdmissionDataSources} from './lora-data/source.mjs';
export {createNormRequiredN2TailAdapter} from './norm-required-n2-tail.mjs';
export {N2_TAIL_SOURCE,N2_TAIL_BUILD,N2_TAIL_PROFILE,N2_TAIL_DISTRIBUTION_COMMIT,N2_TAIL_FILES,verifyN2TailSource,isVerifiedN2TailSource} from './n2-tail/source.mjs';
export {N2_TAIL_PROFILE_ID,N2_TAIL_POLICY_ID,N2_TAIL_CATALOG_REF,N2_TAIL_PINS,N2_TAIL_GATES,N2_TAIL_TRUSTED_INPUTS,N2_TAIL_REFERENCE_REFS,N2_TAIL_OUTPUTS,describeN2TailDeclarations} from './n2-tail/declarations.mjs';
export {createN2TailOutputPublisher,readN2TailOutputPackage} from './n2-tail/package.mjs';
export {createNormRequiredRectAdapter,RECT_DECODE_PROFILE,RECT_DECODE_ASSETS} from './norm-required-rect.mjs';
export {createOwnedArtifactStore,captureNativeTensor,restoreNativeTensor,exportBinaryAssets,releaseArtifactHandle} from './artifacts.mjs';
export {ADOPTED_WKTENSOR_SOURCE,ADOPTED_WKTENSOR_DEPLOYMENT_PATH,ADOPTED_WKTENSOR_BYTE_LENGTH,createAdoptedWktensorCodec,verifyAdoptedWktensorSource} from '../codecs/wktensor.mjs';
export function createModuleAdapter(options){
 const factory={'text-vae':createTextVaeAdapter,diffusion:createDiffusionAdapter,'lora-v2':createLoraAdapter}[options?.kind];
 if(!factory)throw TypeError('Explicit supported adapter kind required');return factory(options);
}

// Deliberately narrower than the complete fixed ComfyUI loader. This is not a
// default for arbitrary safetensors formats, adapter schemes or trained bases.
export const LOADER_POLICY_ID='comfy-lora-b5a4321-linear-diff-v1';
export const LOADER_VARIANTS=Object.freeze(['linear-down-up','linear-a-b','additive-diff','additive-diff-b']);
export const LOADER_POLICY=Object.freeze({
 id:LOADER_POLICY_ID,
 sourceCommit:'b5a432157de6b8884f81104cd02926adf4d597e4',
 factorSource:'comfy/weight_adapter/lora.py:166-184,248-251,267-270',
 deltaSource:'comfy/lora.py:76-86',
 factorOrder:'up[out,rank] @ down[rank,in]',
 presentAlpha:'strength * alpha / rank',
 absentAlpha:'strength * 1 under this explicit policy only',
 additiveDelta:'strength * delta without alpha/rank',
 variants:LOADER_VARIANTS,
 unsupported:Object.freeze(['Conv','DoRA','LoHa','LoKr','mid','reshape','transpose','fusion','quantized-base'])
});

export function effectiveScale({loaderPolicyId,variant,rank,alpha,strength}={}){
 if(loaderPolicyId!==LOADER_POLICY_ID)throw Error('Unsupported or missing loader policy');
 if(!LOADER_VARIANTS.includes(variant))throw Error('Unsupported loader variant');
 if(!Number.isFinite(strength)||!Number.isFinite(Math.fround(strength)))throw Error('Invalid finite F32 strength');
 let scale=strength;
 if(variant==='linear-down-up'||variant==='linear-a-b'){
  if(!Number.isSafeInteger(rank)||rank<1)throw Error('Invalid LoRA rank');
  if(alpha!==null&&!Number.isFinite(alpha))throw Error('Invalid or missing explicit alpha');
  scale=strength*(alpha===null?1:alpha/rank);
 }
 if(!Number.isFinite(scale)||!Number.isFinite(Math.fround(scale)))throw Error('Non-finite F32 scale');
 return scale;
}

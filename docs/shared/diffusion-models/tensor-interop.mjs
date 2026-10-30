import {requireTensor,encodeTensor,decodeTensor} from '../inference/tensor.mjs';

// These identify the producing modules, not either Bernini diffusion model.
export const WAN_TEXT_ENCODER_SHA256='c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68';
export const WAN21_VAE_SHA256='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b';
export const WAN21_RAW_PROFILE=Object.freeze({id:'wan21-raw-f32-5x16x16',shape:Object.freeze([1,16,2,2,2]),layout:'NCTHW',meaning:'raw-posterior-mean'});
export const WAN21_RAW_F1_PROFILE=Object.freeze({id:'wan21-raw-f32-1x16x16',shape:Object.freeze([1,16,1,2,2]),layout:'NCTHW',meaning:'raw-posterior-mean'});
const SHA256=/^[0-9a-f]{64}$/;

function provenance(tensor,expected,producer){
 if(typeof expected!=='string'||!SHA256.test(expected))throw TypeError('Expected '+producer+' model SHA-256 binding');
 if(tensor.modelSha256===undefined)throw TypeError('Missing '+producer+' model SHA-256 provenance');
 if(tensor.modelSha256!==expected)throw TypeError('Tensor provenance does not match the '+producer+' model');
 if(tensor.byteLength!==undefined&&tensor.byteLength!==tensor.data.byteLength)throw RangeError('Declared tensor byteLength does not match its payload');
}

// Strict boundary for the published Wan UMT5 output. No padding or reinterpretation.
export function requireWanConditioning(tensor,{encoderModelSha256=WAN_TEXT_ENCODER_SHA256}={}){
 requireTensor(tensor,{dtype:'float32',layout:'BLC',meaning:'text_hidden_states'});
 if(tensor.shape.length!==3||tensor.shape[0]!==1||tensor.shape[1]>512||tensor.shape[2]!==4096)throw RangeError('Expected Wan conditioning shape [1,L,4096], 1 <= L <= 512');
 const mask=tensor.attentionMask;
 if(!(mask instanceof Uint8Array)||mask.length!==tensor.shape[1]||!mask.includes(1))throw TypeError('Wan conditioning requires a nonempty 0/1 Uint8Array attention mask');
 // requireTensor already rejects mask values outside 0/1, including internal masks.
 provenance(tensor,encoderModelSha256,'Text Encoder');
 return tensor;
}

// This fixed published profile consumes raw posterior means, never normalized
// diffusion latents. Any numeric normalization belongs to an explicit kernel.
export function requireWanRawLatent(tensor,{vaeModelSha256=WAN21_VAE_SHA256}={}){
 requireTensor(tensor,{dtype:'float32',layout:WAN21_RAW_PROFILE.layout,meaning:WAN21_RAW_PROFILE.meaning,shape:WAN21_RAW_PROFILE.shape});
 if(tensor.attentionMask!==undefined)throw TypeError('A raw VAE latent cannot carry a text attention mask');
 provenance(tensor,vaeModelSha256,'VAE');
 return tensor;
}

// Separate F=1 mean profile. The legacy guard above remains shape128-only.
export function requireWanRawLatentF1(tensor,{vaeModelSha256=WAN21_VAE_SHA256}={}){
 requireTensor(tensor,{dtype:'float32',layout:WAN21_RAW_F1_PROFILE.layout,meaning:WAN21_RAW_F1_PROFILE.meaning,shape:WAN21_RAW_F1_PROFILE.shape});
 if(tensor.profileId!==undefined&&tensor.profileId!==WAN21_RAW_F1_PROFILE.id)throw TypeError('F1 raw mean profile identity mismatch');
 if(tensor.normalization!==undefined||tensor.latentContract!==undefined)throw TypeError('F1 raw posterior mean cannot carry normalized/generated metadata');
 if(tensor.attentionMask!==undefined)throw TypeError('A raw VAE latent cannot carry a text attention mask');
 provenance(tensor,vaeModelSha256,'VAE');
 return tensor;
}

// Snapshot the validated producer identity and every codec input before hashing
// yields. The published codec itself remains unchanged.
function ownedTensor(tensor){
 return {dtype:tensor.dtype,shape:[...tensor.shape],layout:tensor.layout,meaning:tensor.meaning,data:new Float32Array(tensor.data),modelSha256:tensor.modelSha256,...(tensor.attentionMask!==undefined?{attentionMask:new Uint8Array(tensor.attentionMask)}:{})};
}
const encoderBinding=binding=>({encoderModelSha256:binding===undefined?WAN_TEXT_ENCODER_SHA256:binding.encoderModelSha256??WAN_TEXT_ENCODER_SHA256});
const vaeBinding=binding=>({vaeModelSha256:binding===undefined?WAN21_VAE_SHA256:binding.vaeModelSha256??WAN21_VAE_SHA256});

// Reuse the published .wktensor codec byte-for-byte. No new binary format.
export async function encodeWanConditioning(tensor,binding){
 const expected=encoderBinding(binding),owned=ownedTensor(requireWanConditioning(tensor,expected));
 return encodeTensor(requireWanConditioning(owned,expected));
}
export async function decodeWanConditioning(bytes,binding){
 const expected=encoderBinding(binding);
 return requireWanConditioning(await decodeTensor(bytes),expected);
}
export async function encodeWanRawLatent(tensor,binding){
 const expected=vaeBinding(binding),owned=ownedTensor(requireWanRawLatent(tensor,expected));
 return encodeTensor(requireWanRawLatent(owned,expected));
}
export async function decodeWanRawLatent(bytes,binding){
 const expected=vaeBinding(binding);
 return requireWanRawLatent(await decodeTensor(bytes),expected);
}

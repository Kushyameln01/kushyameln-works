import {BERNINI_WORKFLOW_RULE_ID} from '../../ai-connection/workflow-shapes.mjs';
import {GENERATED_MAX_ELEMENTS,GENERATED_MODEL_LATENT,NORMALIZATION} from './generated-space.mjs';
import {MODEL_CANDIDATE_LIMITS} from './model-candidate.mjs';

// Host initialization only. Model, scheduler and restoration arithmetic keep
// their existing Hike/ORT owners. This profile does not reproduce torch RNG.
export const SAMPLE_INITIALIZATION_PROFILE='webcrypto-u32-box-muller-host-f32-v1';
export const SAMPLE_CRYPTO_MAX_BYTES=65536;
const MAX_WORDS=SAMPLE_CRYPTO_MAX_BYTES/4;
const throwIfAborted=AbortSignal.prototype.throwIfAborted;
const typed=Object.getPrototypeOf(Uint32Array.prototype);
const slots=Object.fromEntries(['buffer','length','byteOffset','byteLength'].map(key=>[key,Object.getOwnPropertyDescriptor(typed,key).get]));
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const absent=()=>({state:'absent'});
const shapeRequest={ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:1,height:16,width:32},refMaxSize:848,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],temporalRule:'first-then-groups-floor',patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',concatOrder:'target-first',paddingMode:'none'},semantics:Object.fromEntries(['target-latent','source-latent','reference-latent','context-latent'].map(role=>[role,{meaning:role==='target-latent'?GENERATED_MODEL_LATENT:'wan21-normalized-posterior-mean:v1',normalization:NORMALIZATION}])),media:{sourceVideo:absent(),referenceVideo:absent(),slots:Array.from({length:8},(_,slotIndex)=>({slotIndex,wired:absent(),editor:absent()}))}};
export const NORMAL_GENERATION_INPUTS=freeze({
 schemaVersion:'diffusion-normal-generation-inputs/0.1',owner:'diffusion_models',shapeAuthority:'deriveWorkflowShapes',supportOperation:'checkSupport',
 defaults:{shapeRequest,wasmThreads:1},
 target:{default:'zero-from-shapeRequest',meaning:GENERATED_MODEL_LATENT,normalization:NORMALIZATION},
 tensors:{optionalWithoutContexts:true,modes:['ordered-target-and-contexts','ordered-contexts-with-owner-zero-target'],missingContexts:'reject; never generated, dropped or reordered'},
 noise:{optional:true,profile:SAMPLE_INITIALIZATION_PROFILE,distribution:'standard-normal',dtype:'float32',shape:'canonical target.latent.shape',entropy:'WebCrypto getRandomValues Uint32 pairs',math:'host ECMAScript Math Box-Muller with F64 intermediates rounded to F32',explicitNoise:'unchanged compact nonshared finite exact-shape Float32Array snapshot',comfyRngBitIdentity:false,reproducibleSeed:false,maxEntropyRequestBytes:SAMPLE_CRYPTO_MAX_BYTES},
 seedInput:false,
 limits:{kind:'structural-allocation-caps-only',targetMaxElements:GENERATED_MAX_ELEMENTS,totalSequenceTokens:MODEL_CANDIDATE_LIMITS.maxSequenceTokens,maxHiddenStoreBytesExclusive:MODEL_CANDIDATE_LIMITS.maxHiddenStoreBytesExclusive,pointwiseMaxElementsAppliesToSample:false,maxIndependentRgbDimensions:null,contextPopulation:'complete canonical source, reference video, slots0..7 and each supplied frame',padding:'unsupported; every latent patch tail must be zero'},
 output:{meaning:'wan21-raw-generated-sample:v1',restorationOwner:'diffusion_models',normalizationState:'restored'},
 acceptedProduction:false,generationReady:false,confirmedPublicInputDomains:[],
 source:{emptyTarget:'BerniniStudio ca69274a2d2135052489bc0c67a2d79a64225e86 bernini_studio.py600-604',noiseDistribution:'ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4 comfy/sample.py prepare_noise_inner torch.randn; distribution reference only'}
});
export function describeNormalGenerationInputs(){return structuredClone(NORMAL_GENERATION_INPUTS);}

/** Internal deterministic transform for arithmetic verification, not a sample
 * input port. Midpoint uniforms are strictly between zero and one even at the
 * Uint32 endpoints. The caller's entropy words remain untouched.
 */
export function standardNormalFromWords(words){
 const invalid=()=>{throw TypeError('Native compact nonshared Uint32 entropy pairs within the WebCrypto chunk required');};
 if(Object.getPrototypeOf(words??{})!==Uint32Array.prototype)invalid();
 let buffer,length,offset,bytes;try{buffer=slots.buffer.call(words);length=slots.length.call(words);offset=slots.byteOffset.call(words);bytes=slots.byteLength.call(words);}catch{invalid();}
 if(Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||offset!==0||bytes!==length*4||bytes!==bufferLength.call(buffer)||length<2||length%2||length>MAX_WORDS)invalid();
 const output=new Float32Array(length);
 try{
  for(let index=0;index<length;index+=2){
   const u1=(words[index]+0.5)/4294967296,u2=(words[index+1]+0.5)/4294967296;
   const radius=Math.sqrt(-2*Math.log(u1)),theta=2*Math.PI*u2;
   output[index]=radius*Math.cos(theta);output[index+1]=radius*Math.sin(theta);
   if(!Number.isFinite(output[index])||!Number.isFinite(output[index+1]))throw RangeError('Nonfinite host normal initialization');
  }
  return output;
 }catch(error){output.fill(0);throw error;}
}

/** Owner-local entropy acquisition. No seed, callback or RNG input is exposed
 * by sample. Yield between bounded chunks so native cancellation can run.
 */
export async function createSampleNoise(elements,options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='signal'))throw TypeError('Unknown sample initialization option');
 if(!Number.isSafeInteger(elements)||elements<1||elements>GENERATED_MAX_ELEMENTS)throw RangeError('Sample initialization elements exceed target capacity');
 const {signal}=options,check=()=>{if(signal!==undefined)throwIfAborted.call(signal);};check();
 if(typeof globalThis.crypto?.getRandomValues!=='function')throw Error('WebCrypto getRandomValues is required for owner normal initialization');
 const output=new Float32Array(elements);
 try{
  for(let offset=0;offset<elements;offset+=MAX_WORDS){
   check();const count=Math.min(MAX_WORDS,elements-offset),words=new Uint32Array(count+(count%2));let normal;
   try{globalThis.crypto.getRandomValues(words);check();normal=standardNormalFromWords(words);output.set(normal.subarray(0,count),offset);check();}
   finally{words.fill(0);normal?.fill(0);}
   if(offset+count<elements)await new Promise(resolve=>setTimeout(resolve,0));
  }
  check();return output;
 }catch(error){output.fill(0);throw error;}
}

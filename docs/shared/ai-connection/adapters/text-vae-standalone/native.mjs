/** Exact adopted owner code. Source verification is bootstrap work, never an
 * ordinary inference request prerequisite supplied by the user. */
import {sha256Bytes} from '../../canonical.mjs';
export const TEXT_VAE_STANDALONE_ROOT_URL=new URL('../../native/text-vae-20f640a/',import.meta.url);
export const ADOPTED_TEXT_VAE_SOURCE=Object.freeze({repository:'Kushyameln01/kushyameln-works',commit:'20f640a6e071b6c060a212e89b28f0c8965923f7',path:'docs/shared/inference/api.mjs'});
export const TEXT_VAE_CONFIGURATION_PATHS=Object.freeze({"text":"development/inference/management-20261104/text/source-ordered-fp32/manifest.json","legacyText":"development/inference/standalone-20261102/text/full512-conditioning/diagnostic/prepared-model-manifest.json","vae":"development/inference/standalone-20261102/evidence/vae-stream-manifest.json","vaeThreads4":"development/inference/standalone-20261102/evidence/vae-stream-threads4-manifest.json","vaeRect":"development/inference/e6/fixtures/bundle-manifest.json"});
const mismatch=path=>Object.assign(Error('Adopted Text/VAE source differs: '+path),{code:'TEXT_VAE_SOURCE_MISMATCH',fieldPath:path});
async function read(path){const url=new URL(path,TEXT_VAE_STANDALONE_ROOT_URL);if(url.protocol==='file:'){const {readFile}=await import('node:fs/promises');return new Uint8Array(await readFile(url));}const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Object.assign(Error('Adopted Text/VAE file unavailable: '+path),{code:'TEXT_VAE_SOURCE_UNAVAILABLE'});return new Uint8Array(await response.arrayBuffer());}
const sourceBytes=await read('SOURCE.json');
if(await sha256Bytes(sourceBytes)!=='59c46aabbd8dbc4838096ced69e7e132227a191c59f17ade7fe22ee3fae8c6b2')throw mismatch('SOURCE.json');
const source=JSON.parse(new TextDecoder().decode(sourceBytes));
export async function verifyTextVaeStandaloneSources({read:reader=read}={}){
 const files=await Promise.all(source.files.map(async file=>{const bytes=new Uint8Array(await reader(file.path));if(bytes.byteLength!==file.byteLength||await sha256Bytes(bytes)!==file.sha256)throw mismatch(file.path);return {...file};}));
 return {sourceRef:ADOPTED_TEXT_VAE_SOURCE,files,scope:source.scope};
}
const verification=await verifyTextVaeStandaloneSources();
const [native,client,stream,integration]=await Promise.all([import(new URL('docs/shared/inference/api.mjs',TEXT_VAE_STANDALONE_ROOT_URL)),import(new URL('docs/shared/inference/client.mjs',TEXT_VAE_STANDALONE_ROOT_URL)),import(new URL('docs/shared/inference/vae-stream.mjs',TEXT_VAE_STANDALONE_ROOT_URL)),import(new URL('docs/shared/inference/management-adapter.mjs',TEXT_VAE_STANDALONE_ROOT_URL))]);
export const {API_VERSION,createTextEncoderModule,createVaeModule,encodeTensor,decodeTensor,describeTensor,requireTensor}=native;
export const createInferenceClient=client.createInferenceClient;
export const requiredStreamAssets=stream.requiredStreamAssets;
export function createCurrentTextVaeCodec(){return integration.createCurrentNativeCodec(native,ADOPTED_TEXT_VAE_SOURCE);}
export function inspectTextVaeStandaloneAdoption(){return structuredClone({...verification,apiVersion:API_VERSION,configurationManifests:source.configurationManifests,generationReady:false});}
export async function readTextVaeConfigurationManifest(kind){const path=TEXT_VAE_CONFIGURATION_PATHS[kind];if(!path)throw TypeError('Unknown Text/VAE configuration kind');return JSON.parse(new TextDecoder().decode(await read(path)));}

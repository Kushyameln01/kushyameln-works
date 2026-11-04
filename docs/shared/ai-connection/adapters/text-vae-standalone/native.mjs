/** Exact adopted owner code. Source verification is bootstrap work, never an
 * ordinary inference request prerequisite supplied by the user. */
import {sha256Bytes} from '../../canonical.mjs';
export const TEXT_VAE_STANDALONE_ROOT_URL=new URL('../../native/text-vae-badff7a/',import.meta.url);
export const ADOPTED_TEXT_VAE_SOURCE=Object.freeze({repository:'Kushyameln01/kushyameln-works',commit:'badff7a436b56207a084c4c770e01490899a576c',path:'docs/shared/inference/api.mjs'});
export const TEXT_VAE_CONFIGURATION_PATHS=Object.freeze({text:'development/inference/standalone-20261102/text/full512-conditioning/diagnostic/prepared-model-manifest.json',vae:'development/inference/standalone-20261102/evidence/vae-stream-manifest.json',vaeThreads4:'development/inference/standalone-20261102/evidence/vae-stream-threads4-manifest.json'});
const mismatch=path=>Object.assign(Error('Adopted Text/VAE source differs: '+path),{code:'TEXT_VAE_SOURCE_MISMATCH',fieldPath:path});
async function read(path){const url=new URL(path,TEXT_VAE_STANDALONE_ROOT_URL);if(url.protocol==='file:'){const {readFile}=await import('node:fs/promises');return new Uint8Array(await readFile(url));}const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Object.assign(Error('Adopted Text/VAE file unavailable: '+path),{code:'TEXT_VAE_SOURCE_UNAVAILABLE'});return new Uint8Array(await response.arrayBuffer());}
const sourceBytes=await read('SOURCE.json');
if(await sha256Bytes(sourceBytes)!=='48e98b67b7f6d1a04a8fbc412a70d0bc2a7fb71468acdc751e65752f647d3a47')throw mismatch('SOURCE.json');
const source=JSON.parse(new TextDecoder().decode(sourceBytes));
export async function verifyTextVaeStandaloneSources({read:reader=read}={}){
 const files=await Promise.all(source.files.map(async file=>{const bytes=new Uint8Array(await reader(file.path));if(bytes.byteLength!==file.byteLength||await sha256Bytes(bytes)!==file.sha256)throw mismatch(file.path);return {...file};}));
 return {sourceRef:ADOPTED_TEXT_VAE_SOURCE,files,scope:source.scope};
}
const verification=await verifyTextVaeStandaloneSources();
const [native,client,stream]=await Promise.all([import(new URL('docs/shared/inference/api.mjs',TEXT_VAE_STANDALONE_ROOT_URL)),import(new URL('docs/shared/inference/client.mjs',TEXT_VAE_STANDALONE_ROOT_URL)),import(new URL('docs/shared/inference/vae-stream.mjs',TEXT_VAE_STANDALONE_ROOT_URL))]);
export const {API_VERSION,createTextEncoderModule,createVaeModule,encodeTensor,decodeTensor,describeTensor,requireTensor}=native;
export const createInferenceClient=client.createInferenceClient;
export const requiredStreamAssets=stream.requiredStreamAssets;
export function inspectTextVaeStandaloneAdoption(){return structuredClone({...verification,apiVersion:API_VERSION,generationReady:false});}
export async function readTextVaeConfigurationManifest(kind){const path=TEXT_VAE_CONFIGURATION_PATHS[kind];if(!path)throw TypeError('Unknown Text/VAE configuration kind');return JSON.parse(new TextDecoder().decode(await read(path)));}

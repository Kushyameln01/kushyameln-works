/** Fixed full-model public API adoption. Preserve the owner's repository-relative
 * Worker/ORT/Hike tree; this bootstrap never decodes weights or runs a scheduler. */
import {sha256Bytes} from '../../canonical.mjs';
export const DIFFUSION_PUBLIC_ROOT_URL=new URL('../../native/diffusion-pages-20261106/',import.meta.url);
export const ADOPTED_DIFFUSION_PUBLIC_SOURCE=Object.freeze({repository:'Kushyameln01/kushyameln-works',commit:'296e4fe14dff26689f5075e3103cf3c4a54e3485',path:'docs/shared/diffusion-models/api/index.mjs',sha256:'39a6c77c9d0366072f03f53b2fdaa185802388fcd54232db0ee34c56a2b6c4b7'});
const mismatch=path=>Object.assign(Error('Fixed public Diffusion source differs: '+path),{code:'DIFFUSION_PUBLIC_SOURCE_MISMATCH',fieldPath:path});
async function read(file){const url=new URL(file,DIFFUSION_PUBLIC_ROOT_URL);if(url.protocol==='file:'){const {readFile}=await import('node:fs/promises');return new Uint8Array(await readFile(url));}const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Object.assign(Error('Fixed Diffusion source unavailable: '+file),{code:'DIFFUSION_PUBLIC_SOURCE_UNAVAILABLE'});return new Uint8Array(await r.arrayBuffer());}
const manifestBytes=await read('SOURCE.json');
if(await sha256Bytes(manifestBytes)!=='eef1b2da9e389b2520d551e0a7aab69f89369bad6c49f9858421e9c3444c8b96')throw mismatch('SOURCE.json');
const manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
export async function verifyDiffusionPublicSources({read:reader=read}={}){
 const files=await Promise.all(manifest.files.map(async file=>{const bytes=new Uint8Array(await reader(file.path));if(bytes.byteLength!==file.byteLength||await sha256Bytes(bytes)!==file.sha256)throw mismatch(file.path);return {...file};}));
 return {sourceRef:ADOPTED_DIFFUSION_PUBLIC_SOURCE,buildId:manifest.buildId,sourceDigest:manifest.sourceDigest,files};
}
const verified=await verifyDiffusionPublicSources();
const api=await import(new URL(manifest.entrypoint,DIFFUSION_PUBLIC_ROOT_URL));
if(api.BUILD_ID!==manifest.buildId)throw mismatch('api/BUILD_ID');
export const createDiffusionModels=api.createDiffusionModels;
export const BUILD_ID=api.BUILD_ID;
export const PROTOCOL_VERSION=api.PROTOCOL_VERSION;
export function inspectDiffusionPublicAdoption(){return {sourceRef:ADOPTED_DIFFUSION_PUBLIC_SOURCE,buildId:BUILD_ID,protocolVersion:PROTOCOL_VERSION,ownerBuildSourceCount:manifest.ownerBuildSourceCount,files:verified.files.map(f=>({...f})),sourceCount:verified.files.length,modelFilesEmbedded:false,generationReady:false,originalWorkflowAccepted:false};}

export const attachDiffusionPort=api.attachDiffusionPort;
export const createDiffusionWeightClient=api.createDiffusionWeightClient;
export const MAX_TENSOR_ELEMENTS=api.MAX_TENSOR_ELEMENTS;
const shapes=await import(new URL('docs/shared/ai-connection/workflow-shapes.mjs',DIFFUSION_PUBLIC_ROOT_URL));
export const deriveWorkflowShapes=shapes.deriveWorkflowShapes;

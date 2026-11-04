/** Fixed full-model public API adoption. Preserve the owner's repository-relative
 * Worker/ORT/Hike tree; this bootstrap never decodes weights or runs a scheduler. */
import {sha256Bytes} from '../../canonical.mjs';
export const DIFFUSION_PUBLIC_ROOT_URL=new URL('../../native/diffusion-b6e16647/',import.meta.url);
export const ADOPTED_DIFFUSION_PUBLIC_SOURCE=Object.freeze({repository:'Kushyameln01/kushyameln-works',commit:'b6e166478a8e072c9ffd3ce562bfdb0c89634920',path:'docs/shared/diffusion-models/api/index.mjs',sha256:'39a6c77c9d0366072f03f53b2fdaa185802388fcd54232db0ee34c56a2b6c4b7'});
const mismatch=path=>Object.assign(Error('Fixed public Diffusion source differs: '+path),{code:'DIFFUSION_PUBLIC_SOURCE_MISMATCH',fieldPath:path});
async function read(file){const url=new URL(file,DIFFUSION_PUBLIC_ROOT_URL);if(url.protocol==='file:'){const {readFile}=await import('node:fs/promises');return new Uint8Array(await readFile(url));}const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Object.assign(Error('Fixed Diffusion source unavailable: '+file),{code:'DIFFUSION_PUBLIC_SOURCE_UNAVAILABLE'});return new Uint8Array(await r.arrayBuffer());}
const manifestBytes=await read('SOURCE.json');
if(await sha256Bytes(manifestBytes)!=='f2fd51b3c3f1ce429c4680f6823b20db90d08fdef4da60de8f150be63d6ef85f')throw mismatch('SOURCE.json');
const manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
export async function verifyDiffusionPublicSources({read:reader=read}={}){
 const files=await Promise.all(manifest.files.map(async file=>{const bytes=new Uint8Array(await reader(file.path));if(bytes.byteLength!==file.byteLength||await sha256Bytes(bytes)!==file.sha256)throw mismatch(file.path);return {...file};}));
 return {sourceRef:ADOPTED_DIFFUSION_PUBLIC_SOURCE,buildId:manifest.buildId,sourceDigest:manifest.sourceDigest,files};
}
const verified=await verifyDiffusionPublicSources();
const api=await import(new URL(manifest.entrypoint,DIFFUSION_PUBLIC_ROOT_URL));
if(api.BUILD_ID!==manifest.buildId)throw mismatch('api/BUILD_ID');
// Export the actual owner namespace so explicit ports and weight clients keep
// their native identity and ownership rules across the management boundary.
export const diffusionPublicApi=api;
export default api;
export const createDiffusionModels=api.createDiffusionModels;
export const attachDiffusionPort=api.attachDiffusionPort;
export const createDiffusionWeightClient=api.createDiffusionWeightClient;
export const WEIGHT_PORT_PROTOCOL=api.WEIGHT_PORT_PROTOCOL;
export const createBerniniP4Execution=api.createBerniniP4Execution;
export const describeExecutionCapabilities=api.describeExecutionCapabilities;
export const checkExecutionSupport=api.checkExecutionSupport;
export const MAX_TENSOR_ELEMENTS=api.MAX_TENSOR_ELEMENTS;
export const BUILD_ID=api.BUILD_ID;
export const PROTOCOL_VERSION=api.PROTOCOL_VERSION;
export function inspectDiffusionPublicAdoption(){return {sourceRef:ADOPTED_DIFFUSION_PUBLIC_SOURCE,buildId:BUILD_ID,protocolVersion:PROTOCOL_VERSION,ownerBuildSourceCount:manifest.ownerBuildSourceCount,files:verified.files.map(f=>({...f})),sourceCount:verified.files.length,modelFilesEmbedded:false,generationReady:false,originalWorkflowAccepted:false};}

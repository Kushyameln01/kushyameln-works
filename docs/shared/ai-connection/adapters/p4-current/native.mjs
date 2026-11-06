/** Independent ordinary P4 source adoption. This pin is separate from the
 * full-model route even when both use the same byte-exact owner source tree. */
import {sha256Bytes} from '../../canonical.mjs';
export const NORMAL_P4_CURRENT_ROOT_URL=new URL('../../native/diffusion-b6e16647/',import.meta.url);
export const ADOPTED_NORMAL_P4_CURRENT_SOURCE=Object.freeze({repository:'Kushyameln01/kushyameln-works',commit:'b6e166478a8e072c9ffd3ce562bfdb0c89634920',path:'docs/shared/diffusion-models/api/index.mjs',sha256:'39a6c77c9d0366072f03f53b2fdaa185802388fcd54232db0ee34c56a2b6c4b7'});
const buildId='diffusion-models/0.1+e5ba40ce01bd04e4a432846afb737a9d8c37c56450df68af51460d9140c3e4c6';
const mismatch=path=>Object.assign(Error('Fixed ordinary P4 source differs: '+path),{code:'NORMAL_P4_CURRENT_SOURCE_MISMATCH',fieldPath:path});
async function read(file){const url=new URL(file,NORMAL_P4_CURRENT_ROOT_URL);if(url.protocol==='file:'){const {readFile}=await import('node:fs/promises');return new Uint8Array(await readFile(url));}const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Object.assign(Error('Fixed ordinary P4 source unavailable: '+file),{code:'NORMAL_P4_CURRENT_SOURCE_UNAVAILABLE'});return new Uint8Array(await response.arrayBuffer());}
const manifestBytes=await read('SOURCE.json');
if(await sha256Bytes(manifestBytes)!=='f2fd51b3c3f1ce429c4680f6823b20db90d08fdef4da60de8f150be63d6ef85f')throw mismatch('SOURCE.json');
const manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
export async function verifyNormalP4CurrentSources({read:reader=read}={}){
 const files=await Promise.all(manifest.files.map(async file=>{const bytes=new Uint8Array(await reader(file.path));if(bytes.byteLength!==file.byteLength||await sha256Bytes(bytes)!==file.sha256)throw mismatch(file.path);return {...file};}));
 if(manifest.buildId!==buildId||!files.some(file=>file.path===ADOPTED_NORMAL_P4_CURRENT_SOURCE.path&&file.sha256===ADOPTED_NORMAL_P4_CURRENT_SOURCE.sha256))throw mismatch('api/adoption');
 return {sourceRef:ADOPTED_NORMAL_P4_CURRENT_SOURCE,buildId,sourceDigest:manifest.sourceDigest,files};
}
const verified=await verifyNormalP4CurrentSources();
export const normalP4CurrentNative=await import(new URL(ADOPTED_NORMAL_P4_CURRENT_SOURCE.path,NORMAL_P4_CURRENT_ROOT_URL));
if(normalP4CurrentNative.BUILD_ID!==buildId)throw mismatch('api/BUILD_ID');
const capabilities=normalP4CurrentNative.describeExecutionCapabilities(),contract=capabilities.operations.postSelfAttention;
if(contract?.inputs?.conditioning?.normalization!=='umt5-final-rmsnorm-f32-v1'||contract?.available!==true)throw mismatch('postSelfAttention/capability');
export function inspectNormalP4CurrentAdoption(){return {sourceRef:{...ADOPTED_NORMAL_P4_CURRENT_SOURCE},buildId,protocolVersion:normalP4CurrentNative.PROTOCOL_VERSION,operationId:'postSelfAttention',conditioning:structuredClone(contract.inputs.conditioning),inputs:structuredClone(contract.inputs),capability:structuredClone(contract),sourceDigest:verified.sourceDigest,ownerBuildSourceCount:manifest.ownerBuildSourceCount,sourceCount:verified.files.length,modelFilesEmbedded:false,generationReady:false};}

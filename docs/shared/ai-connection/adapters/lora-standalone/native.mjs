/** Fixed standalone adoption, independent from the legacy v2/P4 bridge pins.
 * Source authentication belongs to bootstrap, never normal user input. The
 * mirrored owner modules below are byte-exact and retain their own APIs. */
import {sha256Bytes} from '../../canonical.mjs';
export const LORA_STANDALONE_ROOT_URL=new URL('../../native/lora-6d0c8df/',import.meta.url);
export const LORA_STANDALONE_WASM_URL=new URL('docs/shared/inference/lora/kernel/streaming/lora.wasm',LORA_STANDALONE_ROOT_URL);
export const ADOPTED_LORA_STANDALONE_SOURCE=Object.freeze({repository:'Kushyameln01/kushyameln-works',commit:'6d0c8df4cd4992f26745d2d26394f5e194d2567f',path:'docs/shared/inference/lora/standalone-sdk.mjs',sha256:'0f0ea46f1d7780bfff4604d1686670c3d9ce1fe6fffb44b94fd237d94d880b3f'});
const mismatch=path=>Object.assign(Error('Fixed standalone LoRA source bytes differ: '+path),{code:'LORA_NATIVE_SOURCE_MISMATCH',fieldPath:path});
async function read(file){const url=new URL(file,LORA_STANDALONE_ROOT_URL);if(url.protocol==='file:'){const {readFile}=await import('node:fs/promises');return new Uint8Array(await readFile(url));}const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Object.assign(Error('Standalone source unavailable: '+file),{code:'LORA_NATIVE_SOURCE_UNAVAILABLE'});return new Uint8Array(await r.arrayBuffer());}
const manifestBytes=await read('SOURCE.json');
if(await sha256Bytes(manifestBytes)!=='2cb4821f9a2bfff7d1de060cc585581c5519099e3ea8533ca3de38160fea1fb2')throw mismatch('SOURCE.json');
const manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
export async function verifyLoraStandaloneSources({read:reader=read}={}){
 const files=await Promise.all(manifest.files.map(async file=>{const b=new Uint8Array(await reader(file.path));if(b.byteLength!==file.byteLength||await sha256Bytes(b)!==file.sha256)throw mismatch(file.path);return {...file,bytes:b};}));
 return {sourceRef:ADOPTED_LORA_STANDALONE_SOURCE,ownerLifecycleExecutionSource:manifest.ownerLifecycleExecutionSource,files};
}
const verified=await verifyLoraStandaloneSources();
const [sdk,registry,kernel,owned,reference]=await Promise.all([
 import(new URL('docs/shared/inference/lora/standalone-sdk.mjs',LORA_STANDALONE_ROOT_URL)),
 import(new URL('docs/shared/inference/lora/standalone-registry.mjs',LORA_STANDALONE_ROOT_URL)),
 import(new URL('docs/shared/inference/lora/kernel/streaming/host.mjs',LORA_STANDALONE_ROOT_URL)),
 import(new URL('docs/shared/inference/lora/owned-package.mjs',LORA_STANDALONE_ROOT_URL)),
 import(new URL('tools/lora/standalone-host.mjs',LORA_STANDALONE_ROOT_URL))
]);
export const createLoraStandalone=sdk.createLoraStandalone;
export const STANDALONE_CONTRACT_VERSION=sdk.STANDALONE_CONTRACT_VERSION;
export const createBerniniStandaloneRegistry=registry.createBerniniStandaloneRegistry;
export const validateStandaloneRegistry=registry.validateStandaloneRegistry;
export const createStreamingKernel=kernel.createStreamingKernel;
export const createLoraProductCache=owned.createLoraProductCache;
// Development-only conformant host, not a real trained-base/model binding.
export const createIndependentBaseProvider=reference.createIndependentBaseProvider;
export const createStandaloneReferenceHost=reference.createStandaloneReferenceHost;
const wasm=verified.files.find(f=>f.path.endsWith('/lora.wasm')).bytes;
export function createAdoptedLoraKernel(){return createStreamingKernel({wasmBytes:new Uint8Array(wasm)});}
export function inspectLoraStandaloneAdoption(){return {sourceRef:ADOPTED_LORA_STANDALONE_SOURCE,contractVersion:STANDALONE_CONTRACT_VERSION,files:verified.files.map(({bytes,...file})=>({...file})),graphBinding:'UNBOUND',generationReady:false};}

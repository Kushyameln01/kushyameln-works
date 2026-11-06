import {sha256Bytes} from '../../canonical.mjs';

// The DATA factory pin is distinct from both the unchanged native runtime pins
// and the later owner handoff/evidence commit. These are source-byte identities,
// not new numerical receipts or native mapping authority.
export const LORA_ADMISSION_DATA_SOURCE=Object.freeze({
 repository:'Kushyameln01/kushyameln-works',
 commit:'82b21f09cb63926543181b16f0e97ebc6b9fa6be',
 path:'docs/shared/inference/lora/management-admission-inputs.mjs',
 sha256:'ddf57f4c76333ada1ddf93cf238e5f4ea6219b39afd5dc4d567213667a7d897e'
});
const FILES=Object.freeze([
 Object.freeze({key:'admissionBytes',sourceRef:LORA_ADMISSION_DATA_SOURCE,deploymentPath:'docs/shared/ai-connection/adapters/lora-data/management-admission-inputs.mjs',byteLength:32961,sha256:LORA_ADMISSION_DATA_SOURCE.sha256}),
 Object.freeze({key:'numericBytes',sourceRef:Object.freeze({...LORA_ADMISSION_DATA_SOURCE,path:'docs/shared/inference/lora/numeric-declarations.mjs',sha256:'e7dd99d570c666969d76e93747998f3e1c20ba64d9e3b9d1b5f7a19e05aa6b17'}),deploymentPath:'docs/shared/ai-connection/adapters/lora-data/numeric-declarations.mjs',byteLength:9909,sha256:'e7dd99d570c666969d76e93747998f3e1c20ba64d9e3b9d1b5f7a19e05aa6b17'})
]);
const verified=new WeakSet();
export const isVerifiedLoraAdmissionDataSources=value=>!!value&&verified.has(value);

/** Verify the two delivered modules before formal admission. No code from the
 * supplied bytes is evaluated. Capture both inputs before asynchronous hashing;
 * a cloned or self-labelled receipt cannot authorize the formal entry. */
export async function verifyLoraAdmissionDataSources(input){
 const fail=()=>Object.assign(Error('Delivered LoRA DATA source differs from the fixed 82b modules'),{code:'LORA_DATA_SOURCE_MISMATCH'});
 const captured=FILES.map(file=>{
  const value=input?.[file.key];
  if(value instanceof Uint8Array&&value.byteLength===file.byteLength)return new Uint8Array(value);
  if(value instanceof ArrayBuffer&&value.byteLength===file.byteLength)return new Uint8Array(new Uint8Array(value));
  throw fail();
 });
 const digests=await Promise.all(captured.map(sha256Bytes));
 if(FILES.some((file,index)=>file.sha256!==digests[index]))throw fail();
 const files=Object.freeze(FILES.map(({key,...file})=>Object.freeze(file)));
 const proof=Object.freeze({verified:true,sourceRef:LORA_ADMISSION_DATA_SOURCE,files});
 verified.add(proof);return proof;
}

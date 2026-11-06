import {sha256Bytes} from "../../canonical.mjs";
import {P4_PINS,P4_PROFILE_ID} from "./declarations.mjs";
export const P4_FILES=P4_PINS.sourceFiles;
const verified=new WeakSet();
export const isVerifiedP4CrossFfnSource=value=>!!value&&verified.has(value);
/** Byte proof only. Does not attest injected function origin, model bytes or numerical results. */
export async function verifyP4CrossFfnSource({files}={}){
 const fail=()=>Object.assign(Error("P4 delivered sources differ from the fixed source closure"),{code:"P4_SOURCE_MISMATCH"});
 if(!(files instanceof Map)||files.size!==P4_FILES.length)throw fail();
 const captured=P4_FILES.map(record=>{const bytes=files.get(record.path);if(!(bytes instanceof Uint8Array)||bytes.byteLength!==record.byteLength)throw fail();return new Uint8Array(bytes);});
 const hashes=await Promise.all(captured.map(sha256Bytes));if(P4_FILES.some((f,i)=>f.sha256!==hashes[i]))throw fail();
 const proof=Object.freeze({sourceRef:P4_PINS.sourceRef,distributionCommit:P4_PINS.distributionCommit,executionProfileId:P4_PROFILE_ID,nativeAPIVersion:"diffusion-models/0.1",buildId:P4_PINS.buildId,buildSourceCount:50,extraOwnerJudgeSourceCount:1,files:P4_FILES});verified.add(proof);return proof;
}

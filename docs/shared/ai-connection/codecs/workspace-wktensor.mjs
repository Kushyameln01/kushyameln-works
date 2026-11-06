// Workspace format dependency only. Existing adopted VAE/P2/native pins remain intact.
import {encodeTensor,decodeTensor} from './tensor-498eb25.mjs';
export const WORKSPACE_CODEC_SOURCE=Object.freeze({repository:'Kushyameln01/kushyameln-works',commit:'498eb25f027666e3cc661a5851288e4aabf39f0a',path:'docs/shared/inference/tensor.mjs',sha256:'e200fef69be3909a13bc91a59743681df1072817eadc7c1865717afe0c3c9f8e'});
export function createWorkspaceCodec(){return Object.freeze({codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef:WORKSPACE_CODEC_SOURCE,encode:encodeTensor,decode:decodeTensor});}
